/**
 * P6 (D-153): household demand rows from the linear expenditure system (plan §2).
 *
 * Replaces the tier quantities for worlds whose population definitions carry a demand
 * system. Each block's plan (`population/demandSystem.ts`) becomes market rows:
 * - committed quantities of subsistence-tier categories (food) at market tier 1 and
 *   label "subsistence"; other committed quantities at tier 3, label "basic";
 * - supernumerary quantities at tier 6, label "comfort";
 * - the retail-margin services of each row (commerce, transport) in the same tier;
 * - new dwellings (plan §4.3) at tier 6, label "luxury", funded last, from cash above the
 *   reserve.
 * Rows are funded tier by tier from the block's opening cash at today's market prices
 * (the rule of the tier path): a tier the cash cannot fully fund is funded
 * proportionally and later tiers are not generated. Food kept from the block's own
 * farms (P5a) is taken off its committed quantities first.
 */

import { daysInYear, dayIndexToCivilDate } from "../calendar.js";
import { MONEY_TOLERANCE_RUSD } from "../population/constants.js";
import {
  CASH_RESERVE_DAYS,
  DWELLING_DEPRECIATION_RATE_PER_YEAR,
  HOUSING_ADJUSTMENT_DAYS,
  MARGINAL_PROPENSITY_TO_CONSUME,
  WEALTH_CONSUMPTION_RATE_PER_YEAR,
} from "../population/constants.js";
import { createDemandPlanOutput, planHouseholdDemand, type ResolvedDemandSystem } from "../population/demandSystem.js";
import { adultEquivalents, blockHasHousing, desiredDwellings } from "../population/housing.js";
import { populationTotal } from "../population/state.js";
import type { NeedTier } from "../population/constants.js";
import type { DayResultDetail } from "../population/types.js";
import type { Id } from "../types.js";
import type { World } from "../world.js";
import { inIdOrder } from "../ordering.js";
import type { FinanceIndex } from "./accounts.js";
import type { OwnConsumptionPlan } from "./agriculture.js";
import { buildProvinceOwnerMap } from "./country.js";
import type { HouseholdDemandRecord, HouseholdTier } from "./market.js";
import type { EconomyDefinitions } from "./types.js";

/** Planned household spending of one country today (snapshot and report; RUSD). */
export interface HouseholdCountryDemand {
  readonly countryId: Id;
  persons: number;
  /** Income the plans read: smoothed income × persons plus drawdown. */
  income: number;
  consumption: number;
  committedCost: number;
  /** Planned spending by category (committed + supernumerary). */
  readonly categorySpend: Float64Array;
  /** Income and consumption by stratum: lower, middle, upper. */
  readonly incomeByStratum: Float64Array;
  readonly consumptionByStratum: Float64Array;
  /** Dwellings the country's blocks asked for today. */
  dwellingsDesired: number;
}

/** The LES day's household demand: rows in canonical (block, tier, good) order. */
export interface LesHouseholdDemand {
  readonly count: number;
  readonly popBlockId: number[];
  readonly marketId: number[];
  readonly tier: HouseholdTier[];
  readonly needTier: NeedTier[];
  readonly goodId: number[];
  readonly desired: number[];
  readonly funded: number[];
  readonly rowsOfBlock: ReadonlyMap<Id, { readonly start: number; readonly end: number }>;
  readonly records: HouseholdDemandRecord[];
  readonly categoryKeys: readonly string[];
  readonly byCountry: ReadonlyMap<Id, HouseholdCountryDemand>;
}

const STRATUM_INDEX = { lower: 0, middle: 1, upper: 2 } as const;

/** Gate of a technology-gated good (P5b C-21): the owner knows it, or the market holds stock. */
export type NeedGate = (provinceId: Id, marketId: Id, technologyId: Id, goodId: Id) => boolean;

/**
 * Ensure every market has smoothed prices (the first day of a demand-system world
 * starts them at the day's opening prices).
 */
export function initialiseSmoothedPrices(world: World): void {
  for (const market of world.markets) {
    if (market.priceSmoothedRUSD.length !== market.priceRUSD.length) market.priceSmoothedRUSD = [...market.priceRUSD];
  }
}

export function buildLesHouseholdDemand(
  world: World,
  economyDefinitions: EconomyDefinitions,
  system: ResolvedDemandSystem,
  index: FinanceIndex,
  detail: DayResultDetail,
  ownConsumption: OwnConsumptionPlan,
  gate: NeedGate | null,
): LesHouseholdDemand {
  const year = daysInYear(dayIndexToCivilDate(world.dayIndex).year);
  const goodCount = system.goodCount;
  const out = createDemandPlanOutput(system);
  const available = new Uint8Array(goodCount);
  // Desired quantity per tier (0: tier 1, 1: tier 3, 2: tier 6) by good id.
  const desiredByTier = [new Float64Array(goodCount), new Float64Array(goodCount), new Float64Array(goodCount)];
  const tiers: readonly HouseholdTier[] = [1, 3, 6];
  const labels: readonly NeedTier[] = ["subsistence", "basic", "comfort"];
  const owners = buildProvinceOwnerMap(world);
  const countryById = new Map(world.countries.map((country) => [country.id, country]));
  const marketById = new Map(world.markets.map((market) => [market.id, market]));
  const marketOfProvince = new Map(world.provinceEconomies.map((province) => [province.id, province.marketId]));
  const professionById = new Map(economyDefinitions.professions.map((profession) => [profession.id, profession]));
  const householdIds = index.ownerAccountIds("popBlock", "household-cash");
  const full = detail === "full";
  const build: LesHouseholdDemand = {
    count: 0,
    popBlockId: [],
    marketId: [],
    tier: [],
    needTier: [],
    goodId: [],
    desired: [],
    funded: [],
    rowsOfBlock: new Map(),
    records: [],
    categoryKeys: system.categoryKeys,
    byCountry: new Map(),
  };
  const rowsOfBlock = build.rowsOfBlock as Map<Id, { readonly start: number; readonly end: number }>;
  const byCountry = build.byCountry as Map<Id, HouseholdCountryDemand>;
  const dwellingGoodId = system.dwellingGoodId;

  const push = (blockId: Id, marketId: Id, tier: HouseholdTier, label: NeedTier, goodId: number, desired: number, funded: number): void => {
    build.popBlockId.push(blockId);
    build.marketId.push(marketId);
    build.tier.push(tier);
    build.needTier.push(label);
    build.goodId.push(goodId);
    build.desired.push(desired);
    build.funded.push(funded);
    if (full) build.records.push({ popBlockId: blockId, tier, goodId, desiredQuantity: desired, fundedQuantity: funded });
  };

  for (const block of inIdOrder(world.popBlocks)) {
    const persons = populationTotal(block);
    if (persons <= 0) continue;
    const marketId = marketOfProvince.get(block.provinceId) ?? null;
    if (marketId === null) throw new RangeError(`popBlock ${String(block.id)} is in a province with no market`);
    const market = marketById.get(marketId);
    if (market === undefined) throw new RangeError(`unknown market ${String(marketId)}`);
    if (market.priceSmoothedRUSD.length !== market.priceRUSD.length) {
      throw new RangeError(`market ${String(marketId)} has no smoothed prices`);
    }
    const accountId = block.id >= 0 && block.id < householdIds.length ? (householdIds[block.id] ?? -1) : -1;
    const account = accountId >= 0 ? index.account(accountId) : undefined;
    if (account === undefined) throw new RangeError(`missing household-cash account for popBlock ${String(block.id)}`);
    const cash = account.balanceRUSD;
    const profession = professionById.get(block.professionId);
    if (profession === undefined) throw new RangeError(`popBlock ${String(block.id)} has an unknown profession`);
    const ownerId = owners.get(block.provinceId);
    const owner = ownerId === undefined ? undefined : countryById.get(ownerId);
    for (let goodId = 0; goodId < goodCount; goodId += 1) {
      const technology = system.requiredTechnologyId[goodId] ?? -1;
      available[goodId] =
        (market.priceSmoothedRUSD[goodId] ?? 0) > 0 && (technology < 0 || gate === null || gate(block.provinceId, marketId, technology, goodId))
          ? 1
          : 0;
    }
    planHouseholdDemand(
      system,
      {
        adultEquivalents: adultEquivalents(block),
        persons,
        incomePerCapitaDay: block.incomeSmoothedRUSDPerCapitaDay,
        cash,
        marginalPropensityToConsume: MARGINAL_PROPENSITY_TO_CONSUME[profession.stratum],
        urbanShare: block.urbanShare,
        prices: market.priceSmoothedRUSD,
        available,
        taste: owner === undefined ? null : (system.tasteByCountry.get(owner.tag) ?? null),
        wealthConsumptionRatePerYear: WEALTH_CONSUMPTION_RATE_PER_YEAR,
        cashReserveDays: CASH_RESERVE_DAYS,
        daysInYear: year,
      },
      out,
    );
    // Country summary.
    if (owner !== undefined) {
      let entry = byCountry.get(owner.id);
      if (entry === undefined) {
        entry = {
          countryId: owner.id,
          persons: 0,
          income: 0,
          consumption: 0,
          committedCost: 0,
          categorySpend: new Float64Array(system.categoryKeys.length),
          incomeByStratum: new Float64Array(3),
          consumptionByStratum: new Float64Array(3),
          dwellingsDesired: 0,
        };
        byCountry.set(owner.id, entry);
      }
      entry.persons += persons;
      entry.income += out.income;
      entry.consumption += out.consumption;
      entry.committedCost += out.committedCost;
      for (let category = 0; category < out.categorySpend.length; category += 1) {
        entry.categorySpend[category] = (entry.categorySpend[category] ?? 0) + (out.categorySpend[category] ?? 0);
      }
      const stratum = STRATUM_INDEX[profession.stratum];
      entry.incomeByStratum[stratum] = (entry.incomeByStratum[stratum] ?? 0) + out.income;
      entry.consumptionByStratum[stratum] = (entry.consumptionByStratum[stratum] ?? 0) + out.consumption;
    }

    // Quantities by tier, kept food first, margins in the parent's tier.
    for (const array of desiredByTier) array.fill(0);
    const kept = ownConsumption.byBlock.get(block.id);
    const urban = block.urbanShare;
    for (let goodId = 0; goodId < goodCount; goodId += 1) {
      const category = system.categoryOfGood[goodId] ?? -1;
      if (category < 0) continue;
      let committedQuantity = out.committed[goodId] ?? 0;
      let superQuantity = out.supernumerary[goodId] ?? 0;
      const keptQuantity = kept?.[goodId] ?? 0;
      if (keptQuantity > 0) {
        const fromCommitted = Math.min(committedQuantity, keptQuantity);
        committedQuantity -= fromCommitted;
        superQuantity = Math.max(0, superQuantity - (keptQuantity - fromCommitted));
      }
      const committedTier = (system.categoryAtSubsistenceTier[category] ?? 0) === 1 ? 0 : 1;
      const commerce = urban * (system.commerceMargin[goodId] ?? 0);
      const transport = urban * (system.transportMargin[goodId] ?? 0);
      for (const [tierIndex, quantity] of [
        [committedTier, committedQuantity],
        [2, superQuantity],
      ] as const) {
        if (!(quantity > 0)) continue;
        const target = desiredByTier[tierIndex] as Float64Array;
        target[goodId] = (target[goodId] ?? 0) + quantity;
        if (commerce > 0) target[system.commerceGoodId] = (target[system.commerceGoodId] ?? 0) + quantity * commerce;
        if (transport > 0) target[system.transportGoodId] = (target[system.transportGoodId] ?? 0) + quantity * transport;
      }
    }

    // Fund tier by tier at today's prices.
    const blockStart = build.popBlockId.length;
    let remainingCash = cash;
    let stopped = false;
    for (let tierIndex = 0; tierIndex < 3 && !stopped; tierIndex += 1) {
      const target = desiredByTier[tierIndex] as Float64Array;
      let cost = 0;
      for (let goodId = 0; goodId < goodCount; goodId += 1) {
        const quantity = target[goodId] ?? 0;
        if (quantity > 0) cost += quantity * (market.priceRUSD[goodId] ?? 0);
      }
      // Dwellings (tier 6, funded last from cash above the reserve).
      let dwellingDesired = 0;
      if (tierIndex === 2 && dwellingGoodId !== null && blockHasHousing(block)) {
        // Replacement of today's depreciation plus a share of the gap (plan §4.3).
        dwellingDesired =
          (block.dwellings * DWELLING_DEPRECIATION_RATE_PER_YEAR) / year +
          Math.max(0, desiredDwellings(block) - block.dwellings) / HOUSING_ADJUSTMENT_DAYS;
        if (owner !== undefined && dwellingDesired > 0) {
          const entry = byCountry.get(owner.id);
          if (entry !== undefined) entry.dwellingsDesired += dwellingDesired;
        }
      }
      if (!(cost > 0) && !(dwellingDesired > 0)) continue;
      const spendable = Math.max(0, remainingCash - MONEY_TOLERANCE_RUSD);
      const ratio = cost > 0 ? (spendable >= cost ? 1 : spendable / cost) : 1;
      let fundedCost = 0;
      let dwellingFunded = 0;
      const dwellingPrice = dwellingGoodId === null ? 0 : (market.priceRUSD[dwellingGoodId] ?? 0);
      if (dwellingDesired > 0 && ratio === 1 && dwellingPrice > 0) {
        const room = Math.max(0, spendable - cost - out.reserve);
        dwellingFunded = Math.min(dwellingDesired, room / dwellingPrice);
      }
      for (let goodId = 0; goodId < goodCount; goodId += 1) {
        const quantity = target[goodId] ?? 0;
        const isDwelling = goodId === dwellingGoodId && dwellingDesired > 0;
        if (quantity > 0) {
          const funded = quantity * ratio;
          fundedCost += funded * (market.priceRUSD[goodId] ?? 0);
          push(block.id, marketId, tiers[tierIndex] as HouseholdTier, labels[tierIndex] as NeedTier, goodId, quantity, funded);
        }
        if (isDwelling) {
          fundedCost += dwellingFunded * dwellingPrice;
          push(block.id, marketId, 6, "luxury", goodId, dwellingDesired, dwellingFunded);
        }
      }
      if (fundedCost > remainingCash + Math.max(MONEY_TOLERANCE_RUSD, 1e-12 * Math.abs(remainingCash))) {
        throw new RangeError(`household funding exceeds available cash for popBlock ${String(block.id)}`);
      }
      remainingCash = Math.max(0, remainingCash - fundedCost);
      if (ratio < 1) stopped = true;
    }
    const blockEnd = build.popBlockId.length;
    if (blockEnd > blockStart) rowsOfBlock.set(block.id, { start: blockStart, end: blockEnd });
  }
  (build as { count: number }).count = build.popBlockId.length;
  return build;
}

/**
 * After the market (plan §4.3): fulfilled dwelling purchases join the buyers' stock.
 * Returns the dwellings added.
 */
export function applyDwellingPurchases(
  world: World,
  system: ResolvedDemandSystem,
  household: LesHouseholdDemand,
  fulfilledByRecord: ArrayLike<number>,
): number {
  if (system.dwellingGoodId === null) return 0;
  const blockById = new Map(world.popBlocks.map((block) => [block.id, block]));
  let added = 0;
  for (let row = 0; row < household.count; row += 1) {
    if (household.goodId[row] !== system.dwellingGoodId) continue;
    const fulfilled = fulfilledByRecord[row] ?? 0;
    if (Number.isNaN(fulfilled)) throw new RangeError("missing market result for a dwelling purchase");
    if (!(fulfilled > 0)) continue;
    const block = blockById.get(household.popBlockId[row] ?? -1);
    if (block === undefined) throw new RangeError("dwelling purchase by an unknown block");
    block.dwellings += fulfilled;
    added += fulfilled;
  }
  return added;
}
