/**
 * M3f integrated economic day.
 *
 * The population/ageing/demography phases are applied to a staged world, then
 * employment is refreshed, market demand is generated from real state, M3d
 * clears/produces, and M3e settles. The caller (`tick`) publishes the staged
 * world only after every phase succeeds.
 */

import {
  applyAnnualAgeing,
} from "../population/ageing.js";
import {
  MONEY_TOLERANCE_SUSD,
  NEED_TIER_ORDER,
  type NeedTier,
} from "../population/constants.js";
import { applyDailyDemography } from "../population/demography.js";
import { assertValidPopulationDefinitions } from "../population/definitions.js";
import { populationTotal, workingAgePopulation } from "../population/state.js";
import type {
  NeedGoodResult,
  NeedTierResult,
  NeedTierSummary,
  PopBlockNeedsResult,
  PopulationDefinitions,
  PopulationInputs,
  PopulationNeedsDayResult,
  PopulationTickResult,
  WealthUpdate,
} from "../population/types.js";
import { updateDailyMilitancy, updateMonthlyWealth } from "../population/wealth.js";
import { dayIndexToCivilDate, daysInMonth, daysInYear } from "../calendar.js";
import { assertValidWorld, type World } from "../world.js";
import type { DayIndex, Id } from "../types.js";
import { computeBuildingCapacity } from "./production.js";
import {
  runMarketDay,
  type HouseholdDemandRecord,
  type MarketDayInput,
  type MarketDayResult,
  type MarketTier,
  type ProductionDemandRecord,
} from "./market.js";
import { settleMarketDay, type MarketSettlementResult } from "./settlement.js";
import { assertValidEconomyDefinitions } from "./definitions.js";
import { assertValidEmploymentState, refreshEmploymentIfDue } from "./employment.js";
import type {
  BuildingDef,
  EconomyDefinitions,
  FinancialAccount,
  GoodDef,
} from "./types.js";

const M3_TIER_NEEDS: Readonly<Record<1 | 3 | 6, readonly NeedTier[]>> = {
  1: ["subsistence"],
  3: ["basic"],
  6: ["comfort", "luxury"],
};

interface HouseholdDemandMeta {
  readonly popBlockId: Id;
  readonly tier: MarketTier;
  readonly needTier: NeedTier;
  readonly goodId: Id;
  readonly desired: number;
  readonly funded: number;
}

interface HouseholdDemandBuild {
  readonly records: HouseholdDemandRecord[];
  readonly meta: HouseholdDemandMeta[];
}

function isMarketFundingFailure(error: unknown): boolean {
  return (
    error instanceof RangeError &&
    /insufficient funds; market settlement would overdraw account/.test(error.message)
  );
}

export interface EconomyDayResult {
  readonly population: PopulationTickResult;
  readonly economy: {
    readonly market: MarketDayResult;
    readonly settlement: MarketSettlementResult;
    readonly employment: ReturnType<typeof refreshEmploymentIfDue>;
    readonly householdDemands: readonly HouseholdDemandRecord[];
    readonly productionDemands: readonly ProductionDemandRecord[];
    readonly fallbackUsed: boolean;
  };
}

function moneyTolerance(...values: number[]): number {
  let scale = 1;
  for (const value of values) scale = Math.max(scale, Math.abs(value));
  return MONEY_TOLERANCE_SUSD * scale;
}

function quantityTolerance(...values: number[]): number {
  let scale = 1;
  for (const value of values) scale = Math.max(scale, Math.abs(value));
  return 1e-9 * scale;
}

/** Deep-copy authoritative world state, including every typed array and nested record. */
export function cloneWorld(source: World): World {
  assertValidWorld(source);
  return {
    ...source,
    regions: source.regions.map((region) => ({
      ...region,
      popBlockIds: [...region.popBlockIds],
      buildingInstanceIds: [...region.buildingInstanceIds],
      resourceCapsPerDay: [...region.resourceCapsPerDay],
    })),
    popBlocks: source.popBlocks.map((block) => ({
      ...block,
      maleByAge: block.maleByAge.slice(),
      femaleByAge: block.femaleByAge.slice(),
    })),
    buildings: source.buildings.map((building) => ({ ...building })),
    employment: source.employment.map((assignment) => ({ ...assignment })),
    markets: source.markets.map((market) => ({
      ...market,
      regionIds: [...market.regionIds],
      priceSUSD: [...market.priceSUSD],
      stockLots: market.stockLots.map((lot) => ({ ...lot })),
    })),
    finance: {
      accounts: source.finance.accounts.map((account) => ({ ...account })),
      postings: source.finance.postings.map((posting) => ({
        ...posting,
        lines: posting.lines.map((line) => ({ ...line })),
      })),
      nextPostingId: source.finance.nextPostingId,
    },
    diagnostics: {
      ...source.diagnostics,
      recentWarnings: [...source.diagnostics.recentWarnings],
    },
  };
}

function restoreWorld(target: World, source: World): void {
  Object.assign(target, source);
}

function accountByOwner(
  world: World,
  ownerKind: "popBlock" | "building",
  ownerId: Id,
): FinancialAccount {
  const account = world.finance.accounts.find(
    (candidate) => candidate.ownerKind === ownerKind && candidate.ownerId === ownerId,
  );
  if (account === undefined) {
    throw new RangeError(`${ownerKind} ${String(ownerId)} has no financial account`);
  }
  return account;
}

function needDefinitionsByTier(
  definitions: PopulationDefinitions,
): Map<NeedTier, { activationWealthMin: number; items: readonly { goodKey: string; quantityPerCapitaPerDay: number }[] }> {
  return new Map(definitions.needs.map((tier) => [tier.tier, tier]));
}

function buildHouseholdDemand(
  world: World,
  economyDefinitions: EconomyDefinitions,
  populationDefinitions: PopulationDefinitions,
): HouseholdDemandBuild {
  const market = world.markets[0];
  if (market === undefined) throw new RangeError("economic day requires a market");
  const goodByKey = new Map(economyDefinitions.goods.map((good) => [good.key, good]));
  const needByTier = needDefinitionsByTier(populationDefinitions);
  const records: HouseholdDemandRecord[] = [];
  const meta: HouseholdDemandMeta[] = [];

  for (const block of [...world.popBlocks].sort((left, right) => left.id - right.id)) {
    const population = populationTotal(block);
    if (population <= 0) continue;
    const account = accountByOwner(world, "popBlock", block.id);
    let remainingCash = account.balanceSUSD;

    for (const tier of [1, 3, 6] as const) {
      const itemsByGood = new Map<
        Id,
        { needTier: NeedTier; desired: number; good: GoodDef }
      >();
      for (const needTier of M3_TIER_NEEDS[tier]) {
        const need = needByTier.get(needTier);
        if (need === undefined || block.wealthLevel < need.activationWealthMin) continue;
        for (const item of need.items) {
          const good = goodByKey.get(item.goodKey);
          if (good === undefined) {
            throw new RangeError(
              `needs tier ${needTier} references unknown economy good ${JSON.stringify(item.goodKey)}`,
            );
          }
          const desired = item.quantityPerCapitaPerDay * population;
          if (desired <= 0) continue;
          const existing = itemsByGood.get(good.id);
          if (existing === undefined) {
            itemsByGood.set(good.id, { needTier, desired, good });
          } else {
            // M3 needs data has no overlapping good/tier pairs, but keep the
            // first tier label and combine physical demand defensively.
            itemsByGood.set(good.id, {
              needTier: existing.needTier,
              desired: existing.desired + desired,
              good,
            });
          }
        }
      }
      if (itemsByGood.size === 0) continue;

      const items = [...itemsByGood.entries()]
        .map(([goodId, item]) => ({ goodId, ...item }))
        .sort((left, right) => left.goodId - right.goodId);
      let desiredCost = 0;
      for (const item of items) {
        desiredCost += item.desired * (market.priceSUSD[item.goodId] ?? 0);
      }
      if (!(desiredCost > 0)) continue;
      const spendable = Math.max(0, remainingCash - MONEY_TOLERANCE_SUSD);
      const ratio = spendable >= desiredCost ? 1 : spendable / desiredCost;
      let fundedCost = 0;
      for (const item of items) {
        const funded = item.desired * ratio;
        const price = market.priceSUSD[item.goodId] ?? 0;
        fundedCost += funded * price;
        records.push({
          popBlockId: block.id,
          tier,
          goodId: item.goodId,
          desiredQuantity: item.desired,
          fundedQuantity: funded,
        });
        meta.push({
          popBlockId: block.id,
          tier,
          needTier: item.needTier,
          goodId: item.goodId,
          desired: item.desired,
          funded,
        });
      }
      if (fundedCost > remainingCash + moneyTolerance(fundedCost, remainingCash)) {
        throw new RangeError(`household funding exceeds available cash for popBlock ${String(block.id)}`);
      }
      remainingCash = Math.max(0, remainingCash - fundedCost);
      if (ratio < 1) break;
    }
  }

  records.sort((left, right) =>
    left.popBlockId !== right.popBlockId
      ? left.popBlockId - right.popBlockId
      : left.tier !== right.tier
        ? left.tier - right.tier
        : left.goodId - right.goodId,
  );
  meta.sort((left, right) =>
    left.popBlockId !== right.popBlockId
      ? left.popBlockId - right.popBlockId
      : left.tier !== right.tier
        ? left.tier - right.tier
        : left.goodId - right.goodId,
  );
  return { records, meta };
}

function criticalGoodIds(
  definitions: EconomyDefinitions,
  needs: PopulationDefinitions["needs"],
): Set<Id> {
  const byKey = new Map(definitions.goods.map((good) => [good.key, good.id]));
  const critical = new Set<Id>();
  for (const tier of needs) {
    if (tier.tier !== "subsistence" && tier.tier !== "basic") continue;
    for (const item of tier.items) {
      const goodId = byKey.get(item.goodKey);
      if (goodId !== undefined) critical.add(goodId);
    }
  }
  return critical;
}

function productionTier(definition: BuildingDef, critical: ReadonlySet<Id>): 2 | 5 {
  if (definition.isEssentialInfrastructure) return 2;
  if (definition.outputs.some((output) => critical.has(output.goodId))) return 2;
  return 5;
}

function buildProductionDemands(
  world: World,
  definitions: EconomyDefinitions,
  populationDefinitions: PopulationDefinitions,
  mode: "full" | "cash",
): ProductionDemandRecord[] {
  const market = world.markets[0];
  if (market === undefined) throw new RangeError("economic day requires a market");
  const critical = criticalGoodIds(definitions, populationDefinitions.needs);
  const definitionById = new Map(definitions.buildings.map((definition) => [definition.id, definition]));
  const records: ProductionDemandRecord[] = [];

  for (const building of [...world.buildings].sort((left, right) => left.id - right.id)) {
    if (!building.operational) continue;
    const definition = definitionById.get(building.definitionId);
    if (definition === undefined) continue;
    const capacity = computeBuildingCapacity(world, definitions, building.id);
    if (!capacity.isProductionBuilding || capacity.capacityTU <= 0) continue;
    const inputs = [...definition.inputs].sort((left, right) => left.goodId - right.goodId);
    if (inputs.length === 0) continue;
    const desired = inputs.map((input) => ({
      goodId: input.goodId,
      quantity: input.quantityPerThroughputUnit * capacity.capacityTU,
      price: market.priceSUSD[input.goodId] ?? 0,
    }));
    let desiredCost = 0;
    for (const input of desired) desiredCost += input.quantity * input.price;
    let ratio = 1;
    if (mode === "cash") {
      const account = accountByOwner(world, "building", building.id);
      const available = Math.max(0, account.balanceSUSD - MONEY_TOLERANCE_SUSD);
      ratio = desiredCost > 0 ? Math.min(1, available / desiredCost) : 1;
    }
    const tier = productionTier(definition, critical);
    for (const input of desired) {
      const funded = input.quantity * ratio;
      if (!(funded > 0)) continue;
      records.push({
        buyerBuildingId: building.id,
        tier,
        goodId: input.goodId,
        desiredQuantity: input.quantity,
        fundedQuantity: funded,
      });
    }
  }
  records.sort((left, right) =>
    left.buyerBuildingId !== right.buyerBuildingId
      ? left.buyerBuildingId - right.buyerBuildingId
      : left.goodId - right.goodId,
  );
  return records;
}

function makeMarketInput(
  populationDefinitions: PopulationDefinitions,
  dayIndex: DayIndex,
  household: HouseholdDemandBuild,
  production: readonly ProductionDemandRecord[],
): MarketDayInput {
  const marketId = 0;
  return {
    dayIndex,
    marketId,
    needs: populationDefinitions.needs,
    householdDemands: household.records,
    productionDemands: production,
  };
}

function demandResultKey(popBlockId: Id, tier: MarketTier, goodId: Id): string {
  return `${String(popBlockId)}:${String(tier)}:${String(goodId)}`;
}

function buildNeedsResult(
  world: World,
  definitions: EconomyDefinitions,
  household: HouseholdDemandBuild,
  market: MarketDayResult,
  settlement: MarketSettlementResult,
): PopulationNeedsDayResult {
  const resultByKey = new Map(
    market.householdDemands.map((demand) => [
      demandResultKey(demand.popBlockId, demand.tier, demand.goodId),
      demand,
    ]),
  );
  const householdByName = new Map(
    settlement.households.map((entry) => [entry.popBlockId, entry]),
  );
  const priceByGood = market.openingPrices;
  const blocks: PopBlockNeedsResult[] = [];

  for (const block of [...world.popBlocks].sort((left, right) => left.id - right.id)) {
    const population = populationTotal(block);
    const meta = household.meta.filter((item) => item.popBlockId === block.id);
    const householdSettlement = householdByName.get(block.id);
    if (householdSettlement === undefined) {
      throw new RangeError(`missing household settlement for popBlock ${String(block.id)}`);
    }
    const summaries: NeedTierSummary[] = [];
    const tierResults: NeedTierResult[] = [];
    let lowerMet = true;

    for (const tier of NEED_TIER_ORDER) {
      const tierMeta = meta.filter((item) => item.needTier === tier);
      const active = population > 0 && lowerMet && tierMeta.length > 0;
      let desiredCost = 0;
      let fundedCost = 0;
      let spent = 0;
      let allMet = true;
      const goods: NeedGoodResult[] = [];
      for (const item of tierMeta) {
        const demand = resultByKey.get(
          demandResultKey(item.popBlockId, item.tier, item.goodId),
        );
        if (demand === undefined) throw new RangeError("missing market household demand result");
        const price = priceByGood[item.goodId] ?? 0;
        desiredCost += item.desired * price;
        fundedCost += item.funded * price;
        spent += demand.fulfilledQuantity * price;
        const unmetDesired = Math.max(0, item.desired - demand.fulfilledQuantity);
        const unmetFunded = Math.max(0, item.funded - demand.fulfilledQuantity);
        if (!active || demand.fulfilledQuantity + quantityTolerance(item.desired, demand.fulfilledQuantity) < item.desired) {
          allMet = false;
        }
        if (population > 0) {
          goods.push({
            goodKey: definitions.goods[item.goodId]?.key ?? String(item.goodId),
            desired: item.desired,
            funded: item.funded,
            fulfilled: demand.fulfilledQuantity,
            unmetDesired,
            unmetFunded,
          });
        }
      }
      const fullyMet = active && allMet;
      const summary: NeedTierSummary = {
        tier,
        active,
        fullyMet,
        desiredCostSUSD: active ? desiredCost : 0,
        fundedCostSUSD: active ? fundedCost : 0,
        spentSUSD: active ? spent : 0,
      };
      summaries.push(summary);
      tierResults.push({ ...summary, goods: active ? goods : [] });
      if (active && !fullyMet) lowerMet = false;
    }

    const spent = householdSettlement.marketPurchasesSUSD;
    blocks.push({
      popBlockId: block.id,
      population,
      budgetStartSUSD: householdSettlement.initialCashSUSD,
      budgetEndSUSD: householdSettlement.initialCashSUSD - spent,
      spentSUSD: spent,
      tiers: tierResults,
      tierSummaries: summaries,
    });
  }

  const initialSupplyByGood: Record<string, number> = {};
  const remainingSupplyByGood: Record<string, number> = {};
  const consumedSupplyByGood: Record<string, number> = {};
  for (const good of definitions.goods) {
    const flow = market.inventory.find((item) => item.goodId === good.id);
    initialSupplyByGood[good.key] = flow?.openingStock ?? 0;
    remainingSupplyByGood[good.key] = flow?.closingStock ?? 0;
    consumedSupplyByGood[good.key] = flow?.householdConsumption ?? 0;
  }
  return { blocks, initialSupplyByGood, remainingSupplyByGood, consumedSupplyByGood };
}

function updateNeedsCounters(world: World, needs: PopulationNeedsDayResult): void {
  const byBlock = new Map(needs.blocks.map((block) => [block.popBlockId, block]));
  for (const block of world.popBlocks) {
    const result = byBlock.get(block.id);
    if (result === undefined) throw new RangeError(`missing needs result for popBlock ${String(block.id)}`);
    if (result.population === 0) {
      block.unmetSubsistenceDays = 0;
      block.unmetBasicDays = 0;
      block.comfortFulfilledDays = 0;
      continue;
    }
    const summary = (tier: NeedTier): NeedTierSummary | undefined =>
      result.tierSummaries.find((entry) => entry.tier === tier);
    const subsistence = summary("subsistence");
    const basic = summary("basic");
    const comfort = summary("comfort");
    if (subsistence !== undefined && subsistence.active && subsistence.fullyMet) {
      block.unmetSubsistenceDays = 0;
    } else {
      block.unmetSubsistenceDays += 1;
    }
    if (basic !== undefined && basic.active && basic.fullyMet) {
      block.unmetBasicDays = 0;
    } else {
      block.unmetBasicDays += 1;
    }
    if (comfort !== undefined && comfort.active && comfort.fullyMet) {
      block.comfortFulfilledDays += 1;
    } else {
      block.comfortFulfilledDays = 0;
    }
  }
}

function isLastDayOfMonth(dayIndex: DayIndex): boolean {
  const date = dayIndexToCivilDate(dayIndex);
  return date.day === daysInMonth(date.year, date.month);
}

/**
 * Build the existing M2 wealth inputs from authoritative M3 state.
 *
 * The GDD formula needs annual per-capita income and the current subsistence
 * basket cost. M3 has no monthly income accumulator, so the current day's
 * actual settled wage receipt is annualized by the civil year. Household cash
 * assets are deliberately not treated as income. Mandatory payments are zero
 * because M3f has no taxes or other mandatory household payments yet.
 */
function economicWealthInputs(
  world: World,
  definitions: EconomyDefinitions,
  market: MarketDayResult,
  settlement: MarketSettlementResult,
  dayIndex: DayIndex,
): PopulationInputs {
  const year = dayIndexToCivilDate(dayIndex).year;
  const householdByBlock = new Map(
    settlement.households.map((entry) => [entry.popBlockId, entry]),
  );
  const prices = definitions.goods.map((good) => ({
    goodKey: good.key,
    unitPriceSUSD: market.updatedPrices[good.id] ?? 0,
  }));
  const supply = definitions.goods.map((good) => {
    const flow = market.inventory.find((entry) => entry.goodId === good.id);
    let population = 0;
    for (const block of world.popBlocks) population += populationTotal(block);
    return {
      goodKey: good.key,
      availableQuantityPerCapita:
        population > 0 ? (flow?.closingStock ?? 0) / population : 0,
    };
  });
  const income = world.popBlocks.map((block) => {
    const population = populationTotal(block);
    const household = householdByBlock.get(block.id);
    if (household === undefined) {
      throw new RangeError(`missing household settlement for popBlock ${String(block.id)}`);
    }
    return {
      popBlockId: block.id,
      annualSettledIncomePerCapitaSUSD:
        population > 0 ? (household.wagesReceivedSUSD / population) * daysInYear(year) : 0,
      annualMandatoryPaymentsPerCapitaSUSD: 0,
    };
  });
  return { prices, supply, income };
}

function updateEconomicWealth(
  world: World,
  definitions: EconomyDefinitions,
  market: MarketDayResult,
  settlement: MarketSettlementResult,
  dayIndex: DayIndex,
  needs: PopulationNeedsDayResult,
  populationDefinitions: PopulationDefinitions,
): WealthUpdate[] {
  if (!isLastDayOfMonth(dayIndex)) return [];
  const inputs = economicWealthInputs(
    world,
    definitions,
    market,
    settlement,
    dayIndex,
  );
  return updateMonthlyWealth(
    world,
    populationDefinitions,
    inputs,
    dayIndex,
    needs,
  );
}

function runMarketAttempt(
  world: World,
  definitions: EconomyDefinitions,
  populationDefinitions: PopulationDefinitions,
  dayIndex: DayIndex,
  household: HouseholdDemandBuild,
  production: readonly ProductionDemandRecord[],
): { readonly market: MarketDayResult; readonly settlement: MarketSettlementResult } {
  const input = makeMarketInput(populationDefinitions, dayIndex, household, production);
  const market = runMarketDay(world, definitions, input);
  const settlement = settleMarketDay(world, definitions, market);
  return { market, settlement };
}

/** Run one integrated economic day on the supplied (already staged) world. */
export function runEconomicDay(
  world: World,
  populationDefinitions: PopulationDefinitions,
  economyDefinitions: EconomyDefinitions,
  dayIndex: DayIndex,
): EconomyDayResult {
  assertValidWorld(world);
  assertValidPopulationDefinitions(populationDefinitions);
  assertValidEconomyDefinitions(economyDefinitions);
  if (populationDefinitions.dataVersion !== world.dataVersion) {
    throw new RangeError("population definitions do not match the world data version");
  }
  if (economyDefinitions.dataVersion !== world.dataVersion) {
    throw new RangeError("economy definitions do not match the world data version");
  }
  if (populationDefinitions.scenarioId !== world.scenarioId) {
    throw new RangeError("population definitions do not match the world scenario id");
  }
  if (economyDefinitions.scenarioId !== world.scenarioId) {
    throw new RangeError("economy definitions do not match the world scenario id");
  }
  if (populationDefinitions.scenarioId !== economyDefinitions.scenarioId) {
    throw new RangeError("population and economy definitions use different scenario ids");
  }
  if (world.popBlocks.length === 0) {
    throw new RangeError("economic day requires pop blocks");
  }
  const market = world.markets[0];
  if (market === undefined) throw new RangeError("economic day requires a market");

  const populationStart = world.popBlocks.reduce(
    (total, block) => total + populationTotal(block),
    0,
  );
  const calendarDate = dayIndexToCivilDate(dayIndex);
  const aged = calendarDate.month === 1 && calendarDate.day === 1 && dayIndex !== world.startDayIndex;
  if (aged) applyAnnualAgeing(world);
  const demography = applyDailyDemography(
    world,
    populationDefinitions,
    dayIndex,
    aged,
  );
  // Population decline can invalidate assignments before the next monthly
  // refresh. The existing dirty marker is the intended immediate-repair path.
  try {
    assertValidEmploymentState(world, economyDefinitions);
  } catch {
    world.employmentDirty = true;
  }
  const employment = refreshEmploymentIfDue(world, economyDefinitions, dayIndex);
  assertValidEmploymentState(world, economyDefinitions);

  const afterPopulation = cloneWorld(world);
  const household = buildHouseholdDemand(
    world,
    economyDefinitions,
    populationDefinitions,
  );

  let fallbackUsed = false;
  let productionRecords: ProductionDemandRecord[] = [];
  let marketResult: MarketDayResult;
  let settlement: MarketSettlementResult;
  try {
    const fullProduction = buildProductionDemands(
      world,
      economyDefinitions,
      populationDefinitions,
      "full",
    );
    productionRecords = fullProduction;
    const result = runMarketAttempt(
      world,
      economyDefinitions,
      populationDefinitions,
      dayIndex,
      household,
      fullProduction,
    );
    marketResult = result.market;
    settlement = result.settlement;
  } catch (error) {
    if (!isMarketFundingFailure(error)) throw error;
    fallbackUsed = true;
    restoreWorld(world, afterPopulation);
    const cashProduction = buildProductionDemands(
      world,
      economyDefinitions,
      populationDefinitions,
      "cash",
    );
    productionRecords = cashProduction;
    const result = runMarketAttempt(
      world,
      economyDefinitions,
      populationDefinitions,
      dayIndex,
      household,
      cashProduction,
    );
    marketResult = result.market;
    settlement = result.settlement;
  }
  if (settlement === undefined) throw new RangeError("economic day did not produce a settlement");
  if (marketResult === undefined) throw new RangeError("economic day did not clear a market");

  const needs = buildNeedsResult(
    world,
    economyDefinitions,
    household,
    marketResult,
    settlement,
  );
  updateNeedsCounters(world, needs);
  updateDailyMilitancy(world, needs);
  const wealthUpdates = updateEconomicWealth(
    world,
    economyDefinitions,
    marketResult,
    settlement,
    dayIndex,
    needs,
    populationDefinitions,
  );

  let workingAge = 0;
  for (const block of world.popBlocks) workingAge += workingAgePopulation(block);
  const population: PopulationTickResult = {
    aged,
    populationStart,
    births: demography.totalBirths,
    deaths: demography.totalDeaths,
    populationEnd: demography.populationEnd,
    workingAgePopulation: workingAge,
    demography,
    needs,
    wealthUpdates,
  };

  return {
    population,
    economy: {
      market: marketResult,
      settlement,
      employment,
      householdDemands: household.records,
      productionDemands: productionRecords,
      fallbackUsed,
    },
  };
}
