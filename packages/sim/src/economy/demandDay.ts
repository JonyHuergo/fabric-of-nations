/**
 * P6 (D-153): the daily state updates of the demand system.
 *
 * - Smoothed prices (plan Q15): after the market, each market's smoothed price moves
 *   1/DEMAND_PRICE_SMOOTHING_DAYS of the way to its clearing price.
 * - Smoothed income (plan Q15): at the end of the day, each block's income — its
 *   household cash after every phase, less its cash before the market, plus what it
 *   spent in the market, plus the value of food it kept from its own farms — enters the
 *   smoothed income per person over INCOME_SMOOTHING_DAYS. Cash moved by migration
 *   happens before the snapshot and is not income. Coupons and redemptions of bonds a
 *   household holds count as income (a known simplification until P11).
 * - Depreciation (plan §4.4): every block's dwellings fall by the daily rate.
 */

import { dayIndexToCivilDate, daysInYear } from "../calendar.js";
import { DEMAND_PRICE_SMOOTHING_DAYS, INCOME_SMOOTHING_DAYS } from "../population/constants.js";
import { resolveDemandSystem, type ResolvedDemandSystem } from "../population/demandSystem.js";
import { depreciateDwellings } from "../population/housing.js";
import { populationTotal } from "../population/state.js";
import type { PopulationDefinitions } from "../population/types.js";
import type { DayIndex } from "../types.js";
import type { World } from "../world.js";
import { buildFinanceIndex } from "./accounts.js";
import type { OwnConsumptionPlan } from "./agriculture.js";
import type { MarketDayResult } from "./market.js";
import type { MarketSettlementResult } from "./settlement.js";
import type { EconomyDefinitions } from "./types.js";

/** Housing figures of one day (world totals). */
export interface HousingDayResult {
  readonly dwellingsBought: number;
  readonly dwellingsDepreciated: number;
  readonly dwellingsEnd: number;
}

const cache = new WeakMap<PopulationDefinitions, { readonly economy: EconomyDefinitions; readonly system: ResolvedDemandSystem }>();

/** The resolved demand system of the definitions, or null on the tier path (cached). */
export function demandSystemOf(
  population: PopulationDefinitions,
  economy: EconomyDefinitions,
): ResolvedDemandSystem | null {
  if (population.demandSystem === undefined) return null;
  const hit = cache.get(population);
  if (hit !== undefined && hit.economy === economy) return hit.system;
  const technologyIdByKey = new Map(
    (economy.technology?.technologies ?? []).map((technology) => [technology.key, technology.id]),
  );
  const system = resolveDemandSystem(population.demandSystem, economy.goods, technologyIdByKey);
  cache.set(population, { economy, system });
  return system;
}

/** Move every market's smoothed prices toward today's prices. */
export function updateSmoothedPrices(world: World): void {
  for (const market of world.markets) {
    const smoothed = market.priceSmoothedRUSD;
    if (smoothed.length !== market.priceRUSD.length) {
      market.priceSmoothedRUSD = [...market.priceRUSD];
      continue;
    }
    for (let goodId = 0; goodId < smoothed.length; goodId += 1) {
      const current = smoothed[goodId] ?? 0;
      const price = market.priceRUSD[goodId] ?? 0;
      smoothed[goodId] = current + (price - current) / DEMAND_PRICE_SMOOTHING_DAYS;
    }
  }
}

/** End of day: smoothed income per block and dwelling depreciation. */
export function updateHouseholdIncomeAndHousing(
  world: World,
  dayIndex: DayIndex,
  cashBeforeMarket: readonly number[],
  settlement: MarketSettlementResult,
  ownConsumption: OwnConsumptionPlan,
  markets: readonly MarketDayResult[],
  dwellingsBought: number,
): HousingDayResult {
  const year = daysInYear(dayIndexToCivilDate(dayIndex).year);
  const index = buildFinanceIndex(world.finance);
  const householdIds = index.ownerAccountIds("popBlock", "household-cash");
  const purchases = new Map(settlement.households.map((entry) => [entry.popBlockId, entry.marketPurchasesRUSD]));
  // Kept food at the market's opening prices.
  const keptValue = new Map<number, number>();
  if (ownConsumption.entries.length > 0) {
    const pricesByMarket = new Map(markets.map((market) => [market.marketId, market.openingPrices]));
    const marketOfProvince = new Map(world.provinceEconomies.map((province) => [province.id, province.marketId]));
    const provinceOfBuilding = new Map(world.buildings.map((building) => [building.id, building.provinceId]));
    for (const entry of ownConsumption.entries) {
      const provinceId = provinceOfBuilding.get(entry.buildingId);
      const marketId = provinceId === undefined ? null : (marketOfProvince.get(provinceId) ?? null);
      const prices = marketId === null ? undefined : pricesByMarket.get(marketId);
      const value = entry.quantity * (prices?.[entry.goodId] ?? 0);
      keptValue.set(entry.popBlockId, (keptValue.get(entry.popBlockId) ?? 0) + value);
    }
  }
  let depreciated = 0;
  let dwellingsEnd = 0;
  world.popBlocks.forEach((block, position) => {
    const persons = populationTotal(block);
    if (persons > 0) {
      const accountId = householdIds[block.id] ?? -1;
      const cashAfter = accountId >= 0 ? (index.account(accountId)?.balanceRUSD ?? 0) : 0;
      const income =
        cashAfter - (cashBeforeMarket[position] ?? 0) + (purchases.get(block.id) ?? 0) + (keptValue.get(block.id) ?? 0);
      const perCapita = income / persons;
      block.incomeSmoothedRUSDPerCapitaDay = Math.max(
        0,
        block.incomeSmoothedRUSDPerCapitaDay + (perCapita - block.incomeSmoothedRUSDPerCapitaDay) / INCOME_SMOOTHING_DAYS,
      );
    }
    depreciated += depreciateDwellings(block, year);
    dwellingsEnd += block.dwellings;
  });
  return { dwellingsBought, dwellingsDepreciated: depreciated, dwellingsEnd };
}
