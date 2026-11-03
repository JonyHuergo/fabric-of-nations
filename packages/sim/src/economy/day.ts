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
  MONEY_TOLERANCE_RUSD,
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
import { assertValidWorld, assertValidWorldForTick, type World } from "../world.js";
import type { DayIndex, Id } from "../types.js";
import type { DayPhaseObserver } from "../population/types.js";
import { buildBuildingCapacityIndex, computeBuildingCapacity } from "./production.js";
import { runCountryAIPhase, type CountryAIPhaseResult } from "./ai.js";
import { buildFinanceIndex, cloneFinanceState, type FinanceIndex } from "./accounts.js";
import {
  copyCountry,
  copyCurrency,
  buildProvinceOwnerMap,
  copyCurrencyValuation,
  marketProvinceIds,
} from "./country.js";
import { closeFinancePeriod, type FinanceCloseResult } from "./period.js";
import { runFiscalPhase, type FiscalPhaseResult } from "./fiscal.js";
import { runBusinessTaxPhase, type BusinessTaxPhaseResult } from "./businessTax.js";
import {
  runIndustrialSubsidyPhase,
  type IndustrialSubsidyPhaseResult,
} from "./industrial.js";
import {
  runConstructionPhase,
  type ConstructionPhaseResult,
} from "./construction.js";
import { runDebtPhase, type DebtPhaseResult } from "./debt.js";
import { runMigrationPhase, type MigrationDayResult } from "./migration.js";
import {
  runTradeArrivals,
  runTradeDispatchPhase,
  type TradeArrivalResult,
  type TradeDispatchResult,
} from "./trade.js";
import { runMonetaryPhase, type MonetaryPhaseResult } from "./monetary.js";
import { runMilitaryPhase, type MilitaryPhaseResult } from "./military.js";
import {
  runProfitDistributionPhase,
  type ProfitDistributionResult,
} from "./profit.js";
import {
  runMarketDay,
  type HouseholdDemandRecord,
  type MarketDayInput,
  type MarketDayResult,
  type MarketTier,
  type ProductionDemandRecord,
} from "./market.js";
import { settleMarketDays, type MarketSettlementResult } from "./settlement.js";
import { assertValidEconomyDefinitions } from "./definitions.js";
import { runPoliticsDayStart, runUnrestPhase } from "./politics.js";
import {
  combinedMortalityFactor,
  deriveHealth,
  laborHoursMortalityFactor,
  runLaborMonthStart,
  runTrainingPhase,
  type TrainingPhaseResult,
} from "./labor.js";
import {
  assertTechnologyStateMatchesDefinitions,
  runEducationPhase,
  technologyMortalityFactor,
  type EducationPhaseResult,
} from "./technology.js";
import {
  assertValidEmploymentState,
  refreshEmploymentIfDue,
  repairEmploymentAfterDemography,
} from "./employment.js";
import type {
  BuildingDef,
  EconomyDefinitions,
  FinancialAccount,
  GoodDef,
  Market,
} from "./types.js";

const M3_TIER_NEEDS: Readonly<Record<1 | 3 | 6, readonly NeedTier[]>> = {
  1: ["subsistence"],
  3: ["basic"],
  6: ["comfort", "luxury"],
};

interface HouseholdDemandMeta {
  readonly popBlockId: Id;
  readonly marketId: Id;
  readonly tier: MarketTier;
  readonly needTier: NeedTier;
  readonly goodId: Id;
  readonly desired: number;
  readonly funded: number;
}

interface HouseholdDemandBuild {
  readonly records: HouseholdDemandRecord[];
  readonly meta: HouseholdDemandMeta[];
  readonly marketByPopBlock: ReadonlyMap<Id, Id>;
}

function marketByProvince(world: World): Map<Id, Id> {
  const map = new Map<Id, Id>();
  for (const province of world.provinceEconomies) {
    if (province.marketId !== null) map.set(province.id, province.marketId);
  }
  return map;
}

function marketPrices(world: World, marketId: Id): Market {
  const market = world.markets.find((candidate) => candidate.id === marketId);
  if (market === undefined) throw new RangeError(`missing market ${String(marketId)}`);
  return market;
}

export interface EconomyDayResult {
  readonly population: PopulationTickResult;
  readonly economy: {
    /** First market's clearing result, retained for single-market callers. */
    readonly market: MarketDayResult;
    /** Every cleared market in ascending id order. */
    readonly markets: readonly MarketDayResult[];
    readonly settlement: MarketSettlementResult;
    readonly fiscal: FiscalPhaseResult;
    /** M9 education payroll, literacy update, and research work. */
    readonly education: EducationPhaseResult;
    /** E5 training payroll/stipend and qualification update. */
    readonly training: TrainingPhaseResult;
    /** E4 sectoral production subsidies paid after verified output. */
    readonly industrialSubsidy: IndustrialSubsidyPhaseResult;
    /** E2 month-end business-profit tax assessment and collection. */
    readonly businessTax: BusinessTaxPhaseResult;
    /** E3 public-construction labor, spending, and completion. */
    readonly construction: ConstructionPhaseResult;
    /** M6 country-AI evaluation and validated fiscal-policy changes. */
    readonly ai: CountryAIPhaseResult;
    /** M5b daily debt service and month-end deficit financing. */
    readonly debt: DebtPhaseResult;
    readonly migration: MigrationDayResult;
    /** E6a consignments delivered into destination markets before clearing. */
    readonly tradeArrivals: TradeArrivalResult;
    /** E6a profitable capacity-limited shipments dispatched after settlement. */
    readonly trade: TradeDispatchResult;
    /** E6b managed FX valuation, revaluation, month-end capture, and price index. */
    readonly monetary: MonetaryPhaseResult;
    /** M10 movement, combat, occupation, upkeep, and peace acceptance. */
    readonly military: MilitaryPhaseResult;
    readonly employment: ReturnType<typeof refreshEmploymentIfDue>;
    readonly householdDemands: readonly HouseholdDemandRecord[];
    readonly productionDemands: readonly ProductionDemandRecord[];
    readonly fallbackUsed: boolean;
    /** Non-null only on a civil month-end, after the month-end wealth update (D-047). */
    readonly financeClose: FinanceCloseResult | null;
    /** M5a month-end allocation; applied false when the policy is disabled. */
    readonly profitDistribution: ProfitDistributionResult | null;
  };
}

function moneyTolerance(...values: number[]): number {
  let scale = 1;
  for (const value of values) scale = Math.max(scale, Math.abs(value));
  return MONEY_TOLERANCE_RUSD * scale;
}

function quantityTolerance(...values: number[]): number {
  let scale = 1;
  for (const value of values) scale = Math.max(scale, Math.abs(value));
  return 1e-9 * scale;
}

/** Deep-copy authoritative world state, including every typed array and nested record. */
export function cloneWorld(
  source: World,
  options: {
    readonly validate?: boolean;
    readonly shareImmutableSummaries?: boolean;
  } = {},
): World {
  if (options.validate !== false) assertValidWorld(source);
  return {
    ...source,
    provinceEconomies: source.provinceEconomies.map((province) => ({
      ...province,
      popBlockIds: [...province.popBlockIds],
      buildingInstanceIds: [...province.buildingInstanceIds],
      wageRUSDPerYearByProfession: [...province.wageRUSDPerYearByProfession],
    })),
    countries: source.countries.map(copyCountry),
    currencies: source.currencies.map(copyCurrency),
    currencyValuations: source.currencyValuations.map(copyCurrencyValuation),
    popBlocks: source.popBlocks.map((block) => ({
      ...block,
      maleByAge: block.maleByAge.slice(),
      femaleByAge: block.femaleByAge.slice(),
      literacyByAge: [...block.literacyByAge],
    })),
    buildings: source.buildings.map((building) => ({ ...building })),
    employment: source.employment.map((assignment) => ({ ...assignment })),
    markets: source.markets.map((market) => ({
      ...market,
      priceRUSD: [...market.priceRUSD],
      stockLots: market.stockLots.map((lot) => ({ ...lot })),
    })),
    finance: cloneFinanceState(
      source.finance,
      options.shareImmutableSummaries === true
        ? { shareImmutableSummaries: true }
        : {},
    ),
    profitDistribution: { ...source.profitDistribution },
    countryAI: { ...source.countryAI },
    technology: { ...source.technology },
    politics: {
      ...source.politics,
      eventQueue: source.politics.eventQueue.map((event) => ({ ...event })),
      eventLog: source.politics.eventLog.map((entry) => ({ ...entry })),
    },
    construction: {
      ...source.construction,
      projects: source.construction.projects.map((project) => ({
        ...project,
        materials: project.materials.map((material) => ({ ...material })),
      })),
      history: source.construction.history.map((aggregate) => ({ ...aggregate })),
    },
    trade: {
      ...source.trade,
      routes: source.trade.routes.map((route) => ({ ...route })),
      shipments: source.trade.shipments.map((shipment) => ({ ...shipment })),
      lastDay:
        source.trade.lastDay === null
          ? null
          : {
              ...source.trade.lastDay,
              blocked: source.trade.lastDay.blocked.map((entry) => ({ ...entry })),
            },
    },
    priceIndex: {
      ...source.priceIndex,
      basket: source.priceIndex.basket.map((item) => ({ ...item })),
      basePrices: source.priceIndex.basePrices.map((base) => ({
        marketId: base.marketId,
        prices: [...base.prices],
      })),
      observations: source.priceIndex.observations.map((observation) => ({
        ...observation,
        countries: observation.countries.map((entry) => ({ ...entry })),
      })),
    },
    monetary: {
      ...source.monetary,
      currencies: source.monetary.currencies.map((record) => ({ ...record })),
    },
    military: {
      ...source.military,
      armies: source.military.armies.map((army) => ({ ...army })),
      wars: source.military.wars.map((war) => ({ ...war })),
      relations: source.military.relations.map((relation) => ({ ...relation })),
      peaceOffers: source.military.peaceOffers.map((offer) => ({ ...offer })),
      casualties: source.military.casualties.map((record) => ({ ...record })),
    },
    // P2: occupation and cession write province ownership during the day (D-118),
    // so the political record is part of the isolated copy.
    provinces: {
      ...source.provinces,
      ownership: source.provinces.ownership.map((entry) => ({
        ...entry,
        claimantPolityIds: [...entry.claimantPolityIds],
      })),
      transfers: source.provinces.transfers.map((record) => ({
        ...record,
        provinceIds: [...record.provinceIds],
      })),
    },
    diagnostics: {
      ...source.diagnostics,
      recentWarnings: [...source.diagnostics.recentWarnings],
    },
  };
}

/**
 * Internal hot-path clone for the staged economic day.
 *
 * The caller has already validated the source, and the staged day may share
 * immutable closed-period summaries because the only writer appends a new summary
 * to its own array. Public `cloneWorld` keeps full summary isolation.
 */
export function cloneWorldForTick(source: World): World {
  return cloneWorld(source, { validate: false, shareImmutableSummaries: true });
}

function accountByOwner(
  index: FinanceIndex,
  ownerKind: "popBlock" | "building",
  ownerId: Id,
): FinancialAccount {
  return index.get(ownerKind, ownerId, ownerKind === "popBlock" ? "household-cash" : "operating-cash");
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
  index: FinanceIndex,
): HouseholdDemandBuild {
  const provinceToMarket = marketByProvince(world);
  const goodByKey = new Map(economyDefinitions.goods.map((good) => [good.key, good]));
  const needByTier = needDefinitionsByTier(populationDefinitions);
  const records: HouseholdDemandRecord[] = [];
  const meta: HouseholdDemandMeta[] = [];
  const marketByPopBlock = new Map<Id, Id>();

  for (const block of [...world.popBlocks].sort((left, right) => left.id - right.id)) {
    const population = populationTotal(block);
    if (population <= 0) continue;
    const marketId = provinceToMarket.get(block.provinceId);
    if (marketId === undefined) {
      throw new RangeError(`popBlock ${String(block.id)} is in a province with no market`);
    }
    const market = marketPrices(world, marketId);
    marketByPopBlock.set(block.id, marketId);
    const account = accountByOwner(index, "popBlock", block.id);
    let remainingCash = account.balanceRUSD;

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
        desiredCost += item.desired * (market.priceRUSD[item.goodId] ?? 0);
      }
      if (!(desiredCost > 0)) continue;
      const spendable = Math.max(0, remainingCash - MONEY_TOLERANCE_RUSD);
      const ratio = spendable >= desiredCost ? 1 : spendable / desiredCost;
      let fundedCost = 0;
      for (const item of items) {
        const funded = item.desired * ratio;
        const price = market.priceRUSD[item.goodId] ?? 0;
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
          marketId,
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
  return { records, meta, marketByPopBlock };
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
  index: FinanceIndex,
  cap: { cappedBuildings: number } = { cappedBuildings: 0 },
): ProductionDemandRecord[] {
  const provinceToMarket = marketByProvince(world);
  const critical = criticalGoodIds(definitions, populationDefinitions.needs);
  const definitionById = new Map(definitions.buildings.map((definition) => [definition.id, definition]));
  const records: ProductionDemandRecord[] = [];

  const capacityIndex = buildBuildingCapacityIndex(world, definitions);
  for (const building of [...world.buildings].sort((left, right) => left.id - right.id)) {
    if (!building.operational) continue;
    const definition = definitionById.get(building.definitionId);
    if (definition === undefined) continue;
    const marketId = provinceToMarket.get(building.provinceId);
    if (marketId === undefined) {
      throw new RangeError(`building ${String(building.id)} is in a province with no market`);
    }
    const market = marketPrices(world, marketId);
    const capacity = computeBuildingCapacity(world, definitions, building.id, capacityIndex);
    if (!capacity.isProductionBuilding || capacity.capacityTU <= 0) continue;
    const inputs = [...definition.inputs].sort((left, right) => left.goodId - right.goodId);
    if (inputs.length === 0) continue;
    const desired = inputs.map((input) => ({
      goodId: input.goodId,
      quantity: input.quantityPerThroughputUnit * capacity.capacityTU,
      price: market.priceRUSD[input.goodId] ?? 0,
    }));
    let desiredCost = 0;
    for (const input of desired) desiredCost += input.quantity * input.price;
    let ratio = 1;
    if (mode === "cash") {
      const account = accountByOwner(index, "building", building.id);
      const available = Math.max(0, account.balanceRUSD - MONEY_TOLERANCE_RUSD);
      ratio = desiredCost > 0 ? Math.min(1, available / desiredCost) : 1;
      if (ratio < 1) cap.cappedBuildings += 1;
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
  marketId: Id,
  household: readonly HouseholdDemandRecord[],
  production: readonly ProductionDemandRecord[],
): MarketDayInput {
  return {
    dayIndex,
    marketId,
    needs: populationDefinitions.needs,
    householdDemands: household,
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
  markets: readonly MarketDayResult[],
  settlement: MarketSettlementResult,
): PopulationNeedsDayResult {
  const resultByKey = new Map(
    markets.flatMap((market) =>
      market.householdDemands.map((demand) => [
        demandResultKey(demand.popBlockId, demand.tier, demand.goodId),
        demand,
      ] as const),
    ),
  );
  const householdByName = new Map(
    settlement.households.map((entry) => [entry.popBlockId, entry]),
  );
  const pricesByMarket = new Map(markets.map((market) => [market.marketId, market.openingPrices]));
  const blocks: PopBlockNeedsResult[] = [];
  const metaByBlock = new Map<number, (typeof household.meta)[number][]>();
  for (const item of household.meta) {
    const list = metaByBlock.get(item.popBlockId);
    if (list === undefined) metaByBlock.set(item.popBlockId, [item]);
    else list.push(item);
  }

  for (const block of [...world.popBlocks].sort((left, right) => left.id - right.id)) {
    const population = populationTotal(block);
    const meta = metaByBlock.get(block.id) ?? [];
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
        const marketOpeningPrices = pricesByMarket.get(item.marketId);
        if (marketOpeningPrices === undefined) {
          throw new RangeError(`missing market ${String(item.marketId)} for household demand`);
        }
        const price = marketOpeningPrices[item.goodId] ?? 0;
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
        desiredCostRUSD: active ? desiredCost : 0,
        fundedCostRUSD: active ? fundedCost : 0,
        spentRUSD: active ? spent : 0,
      };
      summaries.push(summary);
      tierResults.push({ ...summary, goods: active ? goods : [] });
      if (active && !fullyMet) lowerMet = false;
    }

    const spent = householdSettlement.marketPurchasesRUSD;
    blocks.push({
      popBlockId: block.id,
      population,
      budgetStartBeforeNeedsRUSD: householdSettlement.initialCashRUSD,
      budgetEndAfterNeedsRUSD: householdSettlement.initialCashRUSD - spent,
      spentRUSD: spent,
      tiers: tierResults,
      tierSummaries: summaries,
    });
  }

  const initialSupplyByGood: Record<string, number> = {};
  const remainingSupplyByGood: Record<string, number> = {};
  const consumedSupplyByGood: Record<string, number> = {};
  for (const good of definitions.goods) {
    let initial = 0;
    let closing = 0;
    let consumed = 0;
    for (const market of markets) {
      const flow = market.inventory.find((item) => item.goodId === good.id);
      initial += flow?.openingStock ?? 0;
      closing += flow?.closingStock ?? 0;
      consumed += flow?.householdConsumption ?? 0;
    }
    initialSupplyByGood[good.key] = initial;
    remainingSupplyByGood[good.key] = closing;
    consumedSupplyByGood[good.key] = consumed;
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
 * actual settled household income (wages plus welfare received) is annualized
 * by the civil year. Household cash assets are deliberately not treated as
 * income. M4c mandatory payments are the income tax actually withheld that day.
 *
 * This is the GDD §6.5 convention exactly: settlement wages plus welfare. Government
 * payroll paid outside settlement (administration, education, training, military)
 * is deliberately excluded from this wealth input; it is never treated as received
 * before its payment posting. Construction wages are taxed at their own payment
 * path under the E3 rule but are likewise outside this settlement-based wealth
 * input. See D-084.
 */
function economicWealthInputs(
  world: World,
  definitions: EconomyDefinitions,
  markets: readonly MarketDayResult[],
  settlement: MarketSettlementResult,
  fiscal: FiscalPhaseResult,
  dayIndex: DayIndex,
): PopulationInputs {
  const year = dayIndexToCivilDate(dayIndex).year;
  const householdByBlock = new Map(
    settlement.households.map((entry) => [entry.popBlockId, entry]),
  );
  const fiscalByBlock = new Map(
    fiscal.blocks.map((entry) => [entry.popBlockId, entry]),
  );
  const referenceMarket = markets[0];
  const prices = definitions.goods.map((good) => ({
    goodKey: good.key,
    unitPriceRUSD: referenceMarket?.updatedPrices[good.id] ?? 0,
  }));
  const supply = definitions.goods.map((good) => {
    let closing = 0;
    for (const market of markets) {
      const flow = market.inventory.find((entry) => entry.goodId === good.id);
      closing += flow?.closingStock ?? 0;
    }
    let population = 0;
    for (const block of world.popBlocks) population += populationTotal(block);
    return {
      goodKey: good.key,
      availableQuantityPerCapita: population > 0 ? closing / population : 0,
    };
  });
  const income = world.popBlocks.map((block) => {
    const population = populationTotal(block);
    const household = householdByBlock.get(block.id);
    if (household === undefined) {
      throw new RangeError(`missing household settlement for popBlock ${String(block.id)}`);
    }
    const fiscalBlock = fiscalByBlock.get(block.id);
    const welfareReceived = fiscalBlock?.welfareReceivedRUSD ?? 0;
    const incomeTax = fiscalBlock?.incomeTaxRUSD ?? 0;
    return {
      popBlockId: block.id,
      annualSettledIncomePerCapitaRUSD:
        population > 0
          ? ((household.wagesReceivedRUSD + welfareReceived) / population) * daysInYear(year)
          : 0,
      annualMandatoryPaymentsPerCapitaRUSD:
        population > 0 ? (incomeTax / population) * daysInYear(year) : 0,
    };
  });
  return { prices, supply, income };
}

function updateEconomicWealth(
  world: World,
  definitions: EconomyDefinitions,
  markets: readonly MarketDayResult[],
  settlement: MarketSettlementResult,
  fiscal: FiscalPhaseResult,
  dayIndex: DayIndex,
  needs: PopulationNeedsDayResult,
  populationDefinitions: PopulationDefinitions,
): WealthUpdate[] {
  if (!isLastDayOfMonth(dayIndex)) return [];
  const inputs = economicWealthInputs(
    world,
    definitions,
    markets,
    settlement,
    fiscal,
    dayIndex,
  );
  const year = dayIndexToCivilDate(dayIndex).year;
  const provinceToMarket = marketByProvince(world);
  const marketById = new Map(markets.map((market) => [market.marketId, market]));
  const goodIdByKey = new Map(definitions.goods.map((good) => [good.key, good.id]));
  const subsistence = populationDefinitions.needs.find((tier) => tier.tier === "subsistence");
  if (subsistence === undefined) {
    throw new RangeError("population definitions are missing the subsistence tier");
  }
  const costByBlock = new Map<Id, number>();
  for (const block of world.popBlocks) {
    const marketId = provinceToMarket.get(block.provinceId);
    const market = marketId === undefined ? undefined : marketById.get(marketId);
    if (market === undefined) {
      throw new RangeError(`popBlock ${String(block.id)} has no market for wealth input`);
    }
    let dailyCost = 0;
    for (const item of subsistence.items) {
      const goodId = goodIdByKey.get(item.goodKey);
      if (goodId === undefined) {
        throw new RangeError(
          `subsistence need references unknown economy good ${JSON.stringify(item.goodKey)}`,
        );
      }
      dailyCost += item.quantityPerCapitaPerDay * (market.updatedPrices[goodId] ?? 0);
    }
    costByBlock.set(block.id, dailyCost * daysInYear(year));
  }
  return updateMonthlyWealth(
    world,
    populationDefinitions,
    inputs,
    dayIndex,
    needs,
    costByBlock,
  );
}

interface MarketAttempt {
  readonly household: HouseholdDemandBuild;
  readonly production: readonly ProductionDemandRecord[];
  /** Buildings whose input demand the opening-cash cap reduced (D-125). */
  readonly cappedBuildings: number;
  readonly markets: readonly MarketDayResult[];
  readonly settlement: MarketSettlementResult;
}

function runMarketAttempt(
  world: World,
  definitions: EconomyDefinitions,
  populationDefinitions: PopulationDefinitions,
  dayIndex: DayIndex,
  index: FinanceIndex,
  mode: "full" | "cash",
  observe?: DayPhaseObserver,
): MarketAttempt {
  observe?.("market-household-demand");
  const household = buildHouseholdDemand(
    world,
    definitions,
    populationDefinitions,
    index,
  );
  const cap = { cappedBuildings: 0 };
  observe?.("market-production-demand");
  const production = buildProductionDemands(
    world,
    definitions,
    populationDefinitions,
    mode,
    index,
    cap,
  );
  observe?.("market-clearing");
  const buildingProvince = new Map(world.buildings.map((building) => [building.id, building.provinceId]));
  const results: MarketDayResult[] = [];
  for (const market of [...world.markets].sort((left, right) => left.id - right.id)) {
    const provinceIds = new Set(marketProvinceIds(world, market.id));
    const marketHousehold = household.records.filter(
      (record) => household.marketByPopBlock.get(record.popBlockId) === market.id,
    );
    const marketProduction = production.filter((record) => {
      const provinceId = buildingProvince.get(record.buyerBuildingId);
      return provinceId !== undefined && provinceIds.has(provinceId);
    });
    results.push(
      runMarketDay(
        world,
        definitions,
        makeMarketInput(
          populationDefinitions,
          dayIndex,
          market.id,
          marketHousehold,
          marketProduction,
        ),
        { validateWorld: false },
      ),
    );
  }
  observe?.("settlement");
  const settlement = settleMarketDays(world, definitions, results, { validateWorld: false });
  return {
    household,
    production,
    cappedBuildings: cap.cappedBuildings,
    markets: results,
    settlement,
  };
}

/**
 * Close the monthly finance period on a civil month-end.
 *
 * GDD §4.2 step 14 / D-047: the close runs after that day's postings,
 * needs/militancy update, and month-end wealth update, and before `dayIndex`
 * advances. M2-only worlds never take this path. The close stages the complete
 * finance change and replaces `world.finance` only after validation; the caller's
 * staged world advances the day before publication.
 */
function closeMonthEndIfDue(world: World, dayIndex: DayIndex): FinanceCloseResult | null {
  if (!isLastDayOfMonth(dayIndex)) return null;
  return closeFinancePeriod(world);
}

/** Run one integrated economic day on the supplied (already staged) world. */
export function runEconomicDay(
  world: World,
  populationDefinitions: PopulationDefinitions,
  economyDefinitions: EconomyDefinitions,
  dayIndex: DayIndex,
  options: {
    readonly validateWorld?: boolean;
    /** D-116 mode of the calling tick; `phase` skips per-AI-action world validation. */
    readonly integrity?: "staged" | "phase";
    /** Benchmark hook (D-137); never read back. */
    readonly phaseObserver?: DayPhaseObserver;
  } = {},
): EconomyDayResult {
  const observe = options.phaseObserver;
  observe?.("day-preconditions");
  if (options.validateWorld !== false) assertValidWorldForTick(world);
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
  if (world.markets.length === 0) throw new RangeError("economic day requires a market");
  if (world.technology.enabled && economyDefinitions.technology === undefined) {
    throw new RangeError("world technology is enabled but no technology definitions were supplied");
  }
  assertTechnologyStateMatchesDefinitions(world, economyDefinitions);

  // M8 pipeline step 2: due scripted events and effective law transitions, plus
  // the monthly institution/interest-group/election/crisis refresh. The phase
  // applies effects forward only; it never rewrites a closed period.
  observe?.("politics");
  runPoliticsDayStart(world, economyDefinitions, dayIndex);

  // E5 pipeline step 2a: monthly training participation from real instructors,
  // funding, and eligible working-age people. Part-time training does not invalidate
  // employment assignments; its time cost is read in production.
  observe?.("labor-month-start");
  runLaborMonthStart(world, economyDefinitions, dayIndex);

  // M6 pipeline step 2: apply effective policy changes. Country AI evaluates on
  // its staggered day and applies only validated fiscal-policy actions. The
  // staged day is already validated above, so the phase skips a duplicate full
  // validation; every applied action still validates its candidate world.
  observe?.("ai");
  const ai = runCountryAIPhase(world, dayIndex, {
    validateWorld: false,
    validateActionWorlds: options.integrity !== "phase",
  });

  observe?.("demography");
  const populationStart = world.popBlocks.reduce(
    (total, block) => total + populationTotal(block),
    0,
  );
  const calendarDate = dayIndexToCivilDate(dayIndex);
  const aged = calendarDate.month === 1 && calendarDate.day === 1 && dayIndex !== world.startDayIndex;
  if (aged) applyAnnualAgeing(world);
  // M9/E5: demography reads the combined mortality factor (technology × public
  // health × labor hours) at the start of the day. A technology completed or a law
  // enacted later today applies from the next civil day.
  // The factor is a function of the block's country only, so it is derived once per
  // country (P2 scale) from the same start-of-day state.
  const mortalityFactorByBlock = new Map<Id, number>();
  const provinceOwners = buildProvinceOwnerMap(world);
  const countryById = new Map(world.countries.map((country) => [country.id, country]));
  const factorByCountry = new Map<Id, number>();
  for (const block of world.popBlocks) {
    const ownerId = provinceOwners.get(block.provinceId);
    const country = ownerId === undefined ? undefined : countryById.get(ownerId);
    if (country === undefined) {
      mortalityFactorByBlock.set(block.id, 1);
      continue;
    }
    let factor = factorByCountry.get(country.id);
    if (factor === undefined) {
      const technologyFactor =
        world.technology.enabled && economyDefinitions.technology !== undefined
          ? technologyMortalityFactor(country, economyDefinitions)
          : 1;
      const healthFactor = deriveHealth(world, country, economyDefinitions).mortalityFactor;
      const hoursFactor = laborHoursMortalityFactor(country, economyDefinitions);
      factor = combinedMortalityFactor(technologyFactor, healthFactor, hoursFactor);
      factorByCountry.set(country.id, factor);
    }
    mortalityFactorByBlock.set(block.id, factor);
  }
  const demography = applyDailyDemography(
    world,
    populationDefinitions,
    dayIndex,
    aged,
    { mortalityFactorByBlock },
  );
  // Population decline can invalidate assignments before the next monthly
  // refresh. D-126: trim the over-assigned blocks first; only a state that the
  // trim cannot make valid falls back to the dirty full refresh.
  observe?.("employment");
  try {
    assertValidEmploymentState(world, economyDefinitions);
  } catch {
    if (!repairEmploymentAfterDemography(world, economyDefinitions)) {
      world.employmentDirty = true;
    }
  }
  let employment = refreshEmploymentIfDue(world, economyDefinitions, dayIndex);
  // M5 migration: monthly, after the initial labor allocation and before the
  // day's market phase. The migration phase owns the post-flow employment repair
  // when it moves people, so the integrated day does not repeat it.
  observe?.("migration");
  const migration = runMigrationPhase(world, economyDefinitions, dayIndex, {
    validateWorld: false,
  });
  if (migration.employmentRefresh !== null) {
    employment = migration.employmentRefresh;
  }
  assertValidEmploymentState(world, economyDefinitions);

  // E6a pipeline step 2b: consignments whose transit time has elapsed are delivered
  // into their destination markets before that market clears. Delivery is exact-once
  // and the goods are not part of any market's stock while in transit.
  observe?.("trade-arrivals");
  const tradeArrivals = runTradeArrivals(world, economyDefinitions, dayIndex, {
    validateWorld: false,
  });

  // D-125: one market attempt per day. Production input demand is capped by each
  // building’s opening operating cash, so settlement cannot overdraw a buyer and the
  // market is cleared once. A building whose full input cost fits in its opening cash
  // is not capped; `fallbackUsed` reports whether the cap bound for any building.
  const attempt = runMarketAttempt(
    world,
    economyDefinitions,
    populationDefinitions,
    dayIndex,
    buildFinanceIndex(world.finance),
    "cash",
    observe,
  );
  const fallbackUsed = attempt.cappedBuildings > 0;
  const household = attempt.household;
  const productionRecords = attempt.production;
  const marketResults = attempt.markets;
  const settlement = attempt.settlement;

  // M4c fiscal phase (GDD §4.2 step 12, fiscal part): after market/wage/upkeep
  // settlement and before needs/militancy and wealth. It uses the same day's
  // settlement result and never estimates wages from account balances.
  observe?.("fiscal");
  const fiscal = runFiscalPhase(world, settlement, dayIndex, {
    validateWorld: false,
    economyDefinitions,
  });

  // E6a pipeline step 12b: after settlement and fiscal (the fiscal phase requires the
  // settlement posting boundary to be unchanged), the remaining domestic stock is real
  // surplus and shipper cash is known, so the day's consignments can be dispatched with
  // their freight and import-duty postings. They are still in the open period and before
  // the month-end close.
  observe?.("trade-dispatch");
  const trade = runTradeDispatchPhase(world, economyDefinitions, dayIndex, {
    validateWorld: false,
  });

  // E6b monetary phase: managed exchange-rate valuation and revaluation run daily;
  // realized-import capture and the bounded price-index observation run at a civil
  // month-end. It follows dispatch so realized trade is known and precedes the close so
  // no closed period is rewritten.
  observe?.("monetary");
  const monetary = runMonetaryPhase(world, economyDefinitions, dayIndex, {
    validateWorld: false,
  });

  // M10 military phase: movement arrivals, battles, occupation/liberation, garrison and
  // upkeep payments, wounded recovery, and the bounded AI peace rule. It follows fiscal
  // so pay uses post-tax treasury cash and precedes the close so outlays are in-period.
  observe?.("military");
  const military = runMilitaryPhase(world, dayIndex, { validateWorld: false });

  // E5 training: treasury-limited provider payroll and trainee stipend, then
  // qualification gains for participating blocks. It runs after fiscal (so it sees
  // the same post-fiscal treasury cash as the other service payrolls) and before the
  // education phase.
  observe?.("training");
  const training = runTrainingPhase(world, economyDefinitions, dayIndex);

  // M9 education and research: the payroll is paid from actual post-fiscal treasury
  // cash, age-specific literacy rises for the school-age cohort, and the active
  // project advances. A technology completed today applies from the next day.
  observe?.("education");
  const education = runEducationPhase(world, economyDefinitions, dayIndex, {
    validateWorld: false,
  });

  // E4 sectoral production subsidy: verified physical output is valued at the
  // post-clearing market price and paid from actual treasury cash. It runs before
  // business tax so the recognized subsidy revenue is part of the month-end base.
  observe?.("industrial-subsidy");
  const industrialSubsidy = runIndustrialSubsidyPhase(
    world,
    economyDefinitions,
    marketResults,
    dayIndex,
    { validateWorld: false },
  );

  // E2 business-profit tax: assessed on the just-completed civil month's
  // recognized building results. It runs before the debt phase so collected
  // revenue reduces that month's financing requirement, and before the close so
  // the tax expense/revenue belong to the period that generated the profit.
  observe?.("business-tax");
  const businessTax = runBusinessTaxPhase(world, dayIndex, { validateWorld: false });

  // E3 construction: hire idle labor, pay and capitalize construction wages, and
  // complete projects. It runs before the debt phase so month-end financing sees
  // the resulting treasury cash, and before the close so outlays are in-period.
  observe?.("construction");
  const construction = runConstructionPhase(
    world,
    economyDefinitions,
    dayIndex,
    settlement,
    { validateWorld: false },
  );

  // M5b debt phase: accrue daily interest, service coupons/maturities, and on a
  // month-end finance the accrued fiscal deficit before the M4b close.
  observe?.("debt");
  const debt = runDebtPhase(world, dayIndex, { validateWorld: false });

  observe?.("needs");
  const needs = buildNeedsResult(
    world,
    economyDefinitions,
    household,
    marketResults,
    settlement,
  );
  updateNeedsCounters(world, needs);
  updateDailyMilitancy(world, needs);
  // M8: provincial unrest is updated after the day's needs/militancy and before
  // the close. Its tax/construction effects are read on the next civil day.
  observe?.("unrest");
  runUnrestPhase(world, economyDefinitions, dayIndex);
  observe?.("wealth");
  const wealthUpdates = updateEconomicWealth(
    world,
    economyDefinitions,
    marketResults,
    settlement,
    fiscal,
    dayIndex,
    needs,
    populationDefinitions,
  );
  observe?.("finance-close");
  const financeClose = closeMonthEndIfDue(world, dayIndex);
  const profitDistribution =
    financeClose === null
      ? null
      : runProfitDistributionPhase(world, dayIndex, financeClose);

  observe?.("day-result");
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

  // Public direct callers keep the day-boundary guarantee: the phases above run
  // in verified-phase mode, and the complete staged day is validated once here
  // before it is returned. The month-end close is intentionally staged but not
  // advanced yet, so this check allows that one transient state. `tick` passes
  // `validateWorld: false` because it validates the complete staged world again
  // before publication, after advancing the day (D-067).
  if (options.validateWorld !== false) {
    assertTechnologyStateMatchesDefinitions(world, economyDefinitions);
    assertValidWorldForTick(world, { allowUnadvancedClose: true });
  }

  return {
    population,
    economy: {
      market: marketResults[0] as MarketDayResult,
      markets: marketResults,
      settlement,
      fiscal,
      training,
      education,
      industrialSubsidy,
      businessTax,
      construction,
      ai,
      debt,
      migration,
      tradeArrivals,
      trade,
      monetary,
      military,
      employment,
      householdDemands: household.records,
      productionDemands: productionRecords,
      fallbackUsed,
      financeClose,
      profitDistribution,
    },
  };
}
