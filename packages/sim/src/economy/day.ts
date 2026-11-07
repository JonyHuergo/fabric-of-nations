/**
 * M3f integrated economic day.
 *
 * The population/ageing/demography phases are applied to a staged world, then
 * employment is refreshed, market demand is generated from real state, M3d
 * clears/produces, and M3e settles. The caller (`tick`) publishes the staged
 * world only after every phase succeeds.
 */

import { cloneResourceState } from "./resourceState.js";
import { extractFromDeposit, runDiscoveryPhase, type DiscoveryPhaseResult } from "./resources.js";
import {
  accumulateDemography,
  cloneDemographyReport,
  closeDemographyYear,
  populationsByCountry,
} from "./demographyReport.js";
import {
  applyAnnualAgeing,
} from "../population/ageing.js";
import {
  MONEY_TOLERANCE_RUSD,
  NEED_TIER_ORDER,
  type NeedTier,
} from "../population/constants.js";
import { applyDailyDemography } from "../population/demography.js";
import {
  isDemographicLevelDay,
  updateBlockFoodSufficiency,
  updateDemographicLevels,
} from "../population/demographicLevels.js";
import { demographyFactorsByCountry, demographyFactorsOfBlock } from "./demographyFactors.js";
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
import { inIdOrder } from "../ordering.js";
import { assertValidWorld, assertValidWorldForTick, type World } from "../world.js";
import type { DayIndex, Id } from "../types.js";
import type { DayPhaseObserver, DayResultDetail } from "../population/types.js";
import { buildBuildingCapacityIndex, computeBuildingCapacity } from "./production.js";
import { runCountryAIPhase, type CountryAIPhaseResult } from "./ai.js";
import { buildFinanceIndex, cloneFinanceState, type FinanceIndex } from "./accounts.js";
import { buildProvinceOwnerMap, copyCountry, copyCurrency, copyCurrencyValuation } from "./country.js";
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
import { mintStandingOffers } from "./mint.js";
import { runMilitaryPhase, type MilitaryPhaseResult } from "./military.js";
import {
  runProfitDistributionPhase,
  type ProfitDistributionResult,
} from "./profit.js";
import {
  buildMarketDayLookups,
  runMarketDay,
  type HouseholdDemandColumns,
  type HouseholdDemandRecord,
  type HouseholdTier,
  type MarketDayInput,
  type MarketDayResult,
  type ProductionDemandRecord,
} from "./market.js";
import { settleMarketDays, type MarketSettlementResult } from "./settlement.js";
import {
  EMPTY_OWN_CONSUMPTION,
  planOwnConsumption,
  type OwnConsumptionEntry,
  type OwnConsumptionPlan,
} from "./agriculture.js";
import { assertValidEconomyDefinitions } from "./definitions.js";
import { runPoliticsDayStart, runUnrestPhase } from "./politics.js";
import {
  runLaborMonthStart,
  runTrainingPhase,
  type TrainingPhaseResult,
} from "./labor.js";
import {
  assertTechnologyStateMatchesDefinitions,
  hasResearchedTechnology,
  runEducationPhase,
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
  Market,
} from "./types.js";

const M3_TIER_NEEDS: Readonly<Record<1 | 3 | 6, readonly NeedTier[]>> = {
  1: ["subsistence"],
  3: ["basic"],
  6: ["comfort", "luxury"],
};

/**
 * One day's household demand in columns (D-139): one row per (block, market tier,
 * good), in canonical (block, tier, good) order, so a block's rows are contiguous.
 * Replaces one record and one meta object per row (about 34,000 of each a day).
 */
interface HouseholdDemandBuild {
  readonly count: number;
  readonly popBlockId: number[];
  readonly marketId: number[];
  readonly tier: HouseholdTier[];
  readonly needTier: NeedTier[];
  readonly goodId: number[];
  readonly desired: number[];
  readonly funded: number[];
  /** First row and end row of each block that has rows, by block id. */
  readonly rowsOfBlock: ReadonlyMap<Id, { readonly start: number; readonly end: number }>;
  /** Record objects for the full-detail day result (D-137); empty in summary detail. */
  readonly records: HouseholdDemandRecord[];
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
    /**
     * P5 (D-143 §2): food kept by owner households from their own farms today, in
     * (block, building, good) order. Production's outputs are the marketed remainder.
     */
    readonly ownConsumption: readonly OwnConsumptionEntry[];
    /** P5 (D-143 §4): deposits found by this month's prospecting (first civil day). */
    readonly discovery: DiscoveryPhaseResult;
  };
}

/**
 * MONEY_TOLERANCE_RUSD scaled by the largest magnitude, at least 1. Fixed arity (D-139): the
 * former rest parameter allocated an array on every call; a missing value is 0,
 * which never raises the scale above 1, so the result is unchanged.
 */
function moneyTolerance(a: number, b = 0, c = 0, d = 0, e = 0, f = 0, g = 0, h = 0): number {
  return (
    MONEY_TOLERANCE_RUSD *
    Math.max(1, Math.abs(a), Math.abs(b), Math.abs(c), Math.abs(d), Math.abs(e), Math.abs(f), Math.abs(g), Math.abs(h))
  );
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
    demography: cloneDemographyReport(source.demography),
    resources: cloneResourceState(source.resources),
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
): Map<
  NeedTier,
  {
    activationWealthMin: number;
    items: readonly { goodKey: string; quantityPerCapitaPerDay: number; requiredTechnologyKey?: string }[];
  }
> {
  return new Map(definitions.needs.map((tier) => [tier.tier, tier]));
}

/**
 * P5b (D-146, C-21): whether a technology-gated need item is wanted in a province
 * today — its owner knows the technology, or its market holds stock of the good.
 */
function needGate(world: World): (provinceId: Id, marketId: Id, technologyId: Id, goodId: Id) => boolean {
  const owners = buildProvinceOwnerMap(world);
  const countryById = new Map(world.countries.map((country) => [country.id, country]));
  const stockByMarket = new Map<Id, Set<number>>();
  for (const market of world.markets) {
    const goods = new Set<number>();
    for (const lot of market.stockLots) if (lot.quantity > 0) goods.add(lot.goodId);
    stockByMarket.set(market.id, goods);
  }
  return (provinceId, marketId, technologyId, goodId) => {
    if (stockByMarket.get(marketId)?.has(goodId) === true) return true;
    const ownerId = owners.get(provinceId);
    const owner = ownerId === undefined ? undefined : countryById.get(ownerId);
    return owner !== undefined && hasResearchedTechnology(owner, technologyId);
  };
}

function buildHouseholdDemand(
  world: World,
  economyDefinitions: EconomyDefinitions,
  populationDefinitions: PopulationDefinitions,
  index: FinanceIndex,
  detail: DayResultDetail,
  ownConsumption: OwnConsumptionPlan = EMPTY_OWN_CONSUMPTION,
): HouseholdDemandBuild {
  const provinceToMarket = marketByProvince(world);
  const goodByKey = new Map(economyDefinitions.goods.map((good) => [good.key, good]));
  const needByTier = needDefinitionsByTier(populationDefinitions);
  const build: HouseholdDemandBuild = {
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
  };
  const rowsOfBlock = build.rowsOfBlock as Map<Id, { readonly start: number; readonly end: number }>;

  // D-137: the need items of each market tier resolved once, and per-good scratch
  // reused across blocks. Desired quantities are summed in need-item order and emitted
  // in ascending good id; every cost is summed in the same order. D-139: each plan's
  // goods in ascending id are listed once, so a block's present goods are visited in
  // that order instead of being sorted per block.
  const goodCount = economyDefinitions.goods.length;
  // P5b (C-21): technology-gated need items.
  const technologyByKey = new Map(
    (economyDefinitions.technology?.technologies ?? []).map((technology) => [technology.key, technology.id]),
  );
  let gatedItems = false;
  const tierPlans = ([1, 3, 6] as const).map((tier) => {
    const needs = M3_TIER_NEEDS[tier].flatMap((needTier) => {
      const need = needByTier.get(needTier);
      if (need === undefined) return [];
      return [
        {
          needTier,
          activationWealthMin: need.activationWealthMin,
          items: need.items.map((item) => {
            const good = goodByKey.get(item.goodKey);
            if (good === undefined) {
              throw new RangeError(
                `needs tier ${needTier} references unknown economy good ${JSON.stringify(item.goodKey)}`,
              );
            }
            let requiredTechnologyId: number | null = null;
            if (item.requiredTechnologyKey !== undefined) {
              const technology = technologyByKey.get(item.requiredTechnologyKey);
              if (technology === undefined) {
                throw new RangeError(
                  `needs tier ${needTier} references unknown technology ${JSON.stringify(item.requiredTechnologyKey)}`,
                );
              }
              requiredTechnologyId = technology;
              gatedItems = true;
            }
            return { goodId: good.id, quantityPerCapitaPerDay: item.quantityPerCapitaPerDay, requiredTechnologyId };
          }),
        },
      ];
    });
    const goods = [...new Set(needs.flatMap((need) => need.items.map((item) => item.goodId)))].sort(
      (left, right) => left - right,
    );
    return { tier, needs, goods };
  });
  const marketById = new Map(world.markets.map((market) => [market.id, market]));
  const householdIds = index.ownerAccountIds("popBlock", "household-cash");
  // P5b (C-21): a gated item is wanted where the block's country knows its technology
  // or the market holds stock of the good this morning.
  const gate = gatedItems ? needGate(world) : null;
  const present = new Uint8Array(goodCount);
  const desiredByGood = new Float64Array(goodCount);
  const labelByGood: NeedTier[] = new Array<NeedTier>(goodCount);
  const full = detail === "full";

  for (const block of inIdOrder(world.popBlocks)) {
    const population = populationTotal(block);
    if (population <= 0) continue;
    const marketId = provinceToMarket.get(block.provinceId);
    if (marketId === undefined) {
      throw new RangeError(`popBlock ${String(block.id)} is in a province with no market`);
    }
    const market = marketById.get(marketId) ?? marketPrices(world, marketId);
    const accountId =
      Number.isInteger(block.id) && block.id >= 0 && block.id < householdIds.length ? (householdIds[block.id] ?? -1) : -1;
    const account = accountId >= 0 ? index.account(accountId) : undefined;
    if (account === undefined) {
      throw new RangeError(`missing household-cash account for popBlock ${String(block.id)}`);
    }
    let remainingCash = account.balanceRUSD;
    const blockStart = build.popBlockId.length;
    // P5 (D-143 §2): subsistence food the block kept from its own farms today.
    const kept = ownConsumption.byBlock.get(block.id);

    // Indexed loops (D-139): the same order, without iterator allocation.
    for (let planIndex = 0; planIndex < tierPlans.length; planIndex += 1) {
      const plan = tierPlans[planIndex] as (typeof tierPlans)[number];
      const tier = plan.tier;
      let presentCount = 0;
      for (let needIndex = 0; needIndex < plan.needs.length; needIndex += 1) {
        const need = plan.needs[needIndex] as (typeof plan.needs)[number];
        if (block.wealthLevel < need.activationWealthMin) continue;
        for (let itemIndex = 0; itemIndex < need.items.length; itemIndex += 1) {
          const item = need.items[itemIndex] as (typeof need.items)[number];
          if (gate !== null && item.requiredTechnologyId !== null && !gate(block.provinceId, marketId, item.requiredTechnologyId, item.goodId)) {
            continue;
          }
          let desired = item.quantityPerCapitaPerDay * population;
          if (kept !== undefined && need.needTier === "subsistence") {
            const keptQuantity = kept[item.goodId] ?? 0;
            if (keptQuantity > 0) {
              desired -= keptQuantity;
              if (desired <= quantityTolerance(keptQuantity)) continue;
            }
          }
          if (desired <= 0) continue;
          if (present[item.goodId] !== 1) {
            present[item.goodId] = 1;
            desiredByGood[item.goodId] = desired;
            labelByGood[item.goodId] = need.needTier;
            presentCount += 1;
          } else {
            // M3 needs data has no overlapping good/tier pairs, but keep the
            // first tier label and combine physical demand defensively.
            desiredByGood[item.goodId] = (desiredByGood[item.goodId] ?? 0) + desired;
          }
        }
      }
      if (presentCount === 0) continue;

      let desiredCost = 0;
      const planGoods = plan.goods;
      for (let goodIndex = 0; goodIndex < planGoods.length; goodIndex += 1) {
        const goodId = planGoods[goodIndex] as number;
        if (present[goodId] !== 1) continue;
        desiredCost += (desiredByGood[goodId] ?? 0) * (market.priceRUSD[goodId] ?? 0);
      }
      if (!(desiredCost > 0)) {
        for (let goodIndex = 0; goodIndex < planGoods.length; goodIndex += 1) present[planGoods[goodIndex] as number] = 0;
        continue;
      }
      const spendable = Math.max(0, remainingCash - MONEY_TOLERANCE_RUSD);
      const ratio = spendable >= desiredCost ? 1 : spendable / desiredCost;
      let fundedCost = 0;
      for (let goodIndex = 0; goodIndex < planGoods.length; goodIndex += 1) {
        const goodId = planGoods[goodIndex] as number;
        if (present[goodId] !== 1) continue;
        const desired = desiredByGood[goodId] ?? 0;
        const funded = desired * ratio;
        const price = market.priceRUSD[goodId] ?? 0;
        fundedCost += funded * price;
        build.popBlockId.push(block.id);
        build.marketId.push(marketId);
        build.tier.push(tier);
        build.needTier.push(labelByGood[goodId] as NeedTier);
        build.goodId.push(goodId);
        build.desired.push(desired);
        build.funded.push(funded);
        if (full) {
          build.records.push({
            popBlockId: block.id,
            tier,
            goodId,
            desiredQuantity: desired,
            fundedQuantity: funded,
          });
        }
        present[goodId] = 0;
      }
      if (fundedCost > remainingCash + moneyTolerance(fundedCost, remainingCash)) {
        throw new RangeError(`household funding exceeds available cash for popBlock ${String(block.id)}`);
      }
      remainingCash = Math.max(0, remainingCash - fundedCost);
      if (ratio < 1) break;
    }
    const blockEnd = build.popBlockId.length;
    if (blockEnd > blockStart) rowsOfBlock.set(block.id, { start: blockStart, end: blockEnd });
  }

  // Blocks are walked in ascending id order, tiers in 1/3/6 order and each tier's
  // goods in ascending good id, so the rows are already in the canonical
  // (popBlock, tier, good) order the sorts produced.
  (build as { count: number }).count = build.popBlockId.length;
  return build;
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

/**
 * P5b (plan §4.2): commit the day's extraction of every market through
 * `extractFromDeposit`. Production already capped each building at its deposit's
 * remaining stock, so every request is met in full; anything else is an integrity
 * failure, not a quantity to round away.
 */
function commitExtraction(world: World, results: readonly MarketDayResult[]): void {
  for (const result of results) {
    for (const building of result.production.buildings) {
      const extraction = building.extraction;
      if (extraction === undefined || !(extraction.quantity > 0)) continue;
      const taken = extractFromDeposit(world, extraction.depositId, extraction.quantity);
      if (Math.abs(taken - extraction.quantity) > quantityTolerance(extraction.quantity)) {
        throw new RangeError(
          `building ${String(building.buildingId)} extracted ${String(extraction.quantity)} but its deposit had ${String(taken)}`,
        );
      }
    }
  }
}

function buildProductionDemands(
  world: World,
  definitions: EconomyDefinitions,
  populationDefinitions: PopulationDefinitions,
  mode: "full" | "cash",
  index: FinanceIndex,
  cap: { cappedBuildings: number } = { cappedBuildings: 0 },
  capacityOf: (buildingId: Id) => ReturnType<typeof computeBuildingCapacity> = (() => {
    const capacityIndex = buildBuildingCapacityIndex(world, definitions);
    return (buildingId: Id) => computeBuildingCapacity(world, definitions, buildingId, capacityIndex);
  })(),
): ProductionDemandRecord[] {
  const provinceToMarket = marketByProvince(world);
  const critical = criticalGoodIds(definitions, populationDefinitions.needs);
  const definitionById = new Map(definitions.buildings.map((definition) => [definition.id, definition]));
  const marketById = new Map(world.markets.map((market) => [market.id, market]));
  // D-137: each definition's inputs in ascending good order once, not a copy and
  // sort per building and per day.
  const sortedInputsByDefinition = new Map<Id, readonly BuildingDef["inputs"][number][]>();
  const records: ProductionDemandRecord[] = [];

  for (const building of inIdOrder(world.buildings)) {
    if (!building.operational) continue;
    const definition = definitionById.get(building.definitionId);
    if (definition === undefined) continue;
    const marketId = provinceToMarket.get(building.provinceId);
    if (marketId === undefined) {
      throw new RangeError(`building ${String(building.id)} is in a province with no market`);
    }
    const market = marketById.get(marketId);
    if (market === undefined) throw new RangeError(`missing market ${String(marketId)}`);
    const capacity = capacityOf(building.id);
    if (!capacity.isProductionBuilding || capacity.capacityTU <= 0) continue;
    let inputs = sortedInputsByDefinition.get(definition.id);
    if (inputs === undefined) {
      inputs = [...definition.inputs].sort((left, right) => left.goodId - right.goodId);
      sortedInputsByDefinition.set(definition.id, inputs);
    }
    const hasExtras =
      (definition.optionalInputs?.length ?? 0) > 0 || (definition.maintenanceInputs?.length ?? 0) > 0;
    if (inputs.length === 0 && !hasExtras) continue;
    const desired: { goodId: number; quantity: number; price: number; tier: 2 | 5 | null }[] = inputs.map((input) => ({
      goodId: input.goodId,
      quantity: input.quantityPerThroughputUnit * capacity.capacityTU,
      price: market.priceRUSD[input.goodId] ?? 0,
      tier: null,
    }));
    if (hasExtras) {
      // P5b (D-146): optional inputs (fertiliser) for today's capacity and maintenance
      // goods for the building's levels, both at the non-critical producer tier 5.
      for (const item of definition.optionalInputs ?? []) {
        desired.push({
          goodId: item.goodId,
          quantity: item.quantityPerThroughputUnit * capacity.capacityTU,
          price: market.priceRUSD[item.goodId] ?? 0,
          tier: 5,
        });
      }
      for (const item of definition.maintenanceInputs ?? []) {
        desired.push({
          goodId: item.goodId,
          quantity: item.quantityPerLevelPerDay * building.level,
          price: market.priceRUSD[item.goodId] ?? 0,
          tier: 5,
        });
      }
      desired.sort((left, right) => left.goodId - right.goodId);
    }
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
        tier: input.tier ?? tier,
        goodId: input.goodId,
        desiredQuantity: input.quantity,
        fundedQuantity: funded,
      });
    }
  }
  // Buildings and their definitions' inputs are in ascending id order, so the
  // records are already in canonical (buyer, good) order.
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

function buildNeedsResult(
  world: World,
  definitions: EconomyDefinitions,
  household: HouseholdDemandBuild,
  markets: readonly MarketDayResult[],
  settlement: MarketSettlementResult,
  detail: DayResultDetail,
  /** Fulfilled quantity per household demand row (D-139); NaN marks a missing result. */
  fulfilledByRecord: Float64Array,
  /** P4: dietary energy per unit of each good id, kcal (0 for non-food goods). */
  kcalByGoodId: Float64Array,
  /** P5 (D-143 §2): food kept from own farms; it counts toward calories eaten. */
  ownConsumption: OwnConsumptionPlan = EMPTY_OWN_CONSUMPTION,
): PopulationNeedsDayResult {
  const householdByName = new Map(
    settlement.households.map((entry) => [entry.popBlockId, entry]),
  );
  const pricesByMarket = new Map(markets.map((market) => [market.marketId, market.openingPrices]));
  const blocks: PopBlockNeedsResult[] = [];
  // D-139: a block's rows are contiguous; each need tier takes them in row order (the
  // order the former per-tier grouping produced).
  const tierRows: number[] = [];

  for (const block of inIdOrder(world.popBlocks)) {
    const population = populationTotal(block);
    const range = household.rowsOfBlock.get(block.id);
    const householdSettlement = householdByName.get(block.id);
    if (householdSettlement === undefined) {
      throw new RangeError(`missing household settlement for popBlock ${String(block.id)}`);
    }
    const summaries: NeedTierSummary[] = [];
    const tierResults: NeedTierResult[] = [];
    let lowerMet = true;
    let kcalConsumed = 0;
    // P5: kept food is eaten; a subsistence tier fully covered in kind has no market
    // rows and is met.
    const kept = ownConsumption.byBlock.get(block.id);
    let keptAny = false;
    if (kept !== undefined && population > 0) {
      for (let goodId = 0; goodId < kept.length; goodId += 1) {
        const quantity = kept[goodId] ?? 0;
        if (quantity > 0) {
          kcalConsumed += quantity * (kcalByGoodId[goodId] ?? 0);
          keptAny = true;
        }
      }
    }

    for (const tier of NEED_TIER_ORDER) {
      tierRows.length = 0;
      if (range !== undefined) {
        for (let row = range.start; row < range.end; row += 1) {
          if (household.needTier[row] === tier) tierRows.push(row);
        }
      }
      const active =
        population > 0 && lowerMet && (tierRows.length > 0 || (tier === "subsistence" && keptAny));
      let desiredCost = 0;
      let fundedCost = 0;
      let spent = 0;
      let allMet = true;
      const goods: NeedGoodResult[] = [];
      for (const row of tierRows) {
        const fulfilledQuantity = fulfilledByRecord[row] ?? Number.NaN;
        if (Number.isNaN(fulfilledQuantity)) throw new RangeError("missing market household demand result");
        const marketId = household.marketId[row] ?? 0;
        const marketOpeningPrices = pricesByMarket.get(marketId);
        if (marketOpeningPrices === undefined) {
          throw new RangeError(`missing market ${String(marketId)} for household demand`);
        }
        const goodId = household.goodId[row] ?? 0;
        const desired = household.desired[row] ?? 0;
        const funded = household.funded[row] ?? 0;
        const price = marketOpeningPrices[goodId] ?? 0;
        desiredCost += desired * price;
        fundedCost += funded * price;
        spent += fulfilledQuantity * price;
        kcalConsumed += fulfilledQuantity * (kcalByGoodId[goodId] ?? 0);
        if (!active || fulfilledQuantity + quantityTolerance(desired, fulfilledQuantity) < desired) {
          allMet = false;
        }
        // Per-good detail is diagnostic only (`summary` omits it, D-137).
        if (population > 0 && detail === "full") {
          goods.push({
            goodKey: definitions.goods[goodId]?.key ?? String(goodId),
            desired,
            funded,
            fulfilled: fulfilledQuantity,
            unmetDesired: Math.max(0, desired - fulfilledQuantity),
            unmetFunded: Math.max(0, funded - fulfilledQuantity),
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
      kcalConsumed,
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
    // P4 (D-142): food sufficiency from the calories actually bought today.
    updateBlockFoodSufficiency(block, result.population, result.kcalConsumed);
  }
}

/** P4: kcal per unit by good id from the population definitions' food energy. */
function kcalByGoodIdOf(
  economyDefinitions: EconomyDefinitions,
  populationDefinitions: PopulationDefinitions,
): Float64Array {
  const byKey = new Map(populationDefinitions.foodEnergy.map((entry) => [entry.goodKey, entry.kcalPerUnit]));
  let maxId = 0;
  for (const good of economyDefinitions.goods) maxId = Math.max(maxId, good.id);
  const table = new Float64Array(maxId + 1);
  for (const good of economyDefinitions.goods) table[good.id] = byKey.get(good.key) ?? 0;
  return table;
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
  /** Fulfilled quantity of each household demand row (D-139); NaN where unmarketed. */
  readonly fulfilledByRecord: Float64Array;
  /** P5 (D-143 §2): the food owner households kept from their own farms today. */
  readonly ownConsumption: OwnConsumptionPlan;
}

/**
 * P5 (D-143 §2): value of each building's kept food at its market's opening prices,
 * keyed by building, with the owner block that kept it. Settlement pays it as a wage
 * in kind to that block (up to the block's cash wage at the building).
 */
function inKindWageValues(
  world: World,
  plan: OwnConsumptionPlan,
  markets: readonly MarketDayResult[],
): ReadonlyMap<Id, { readonly popBlockId: Id; readonly valueRUSD: number }> {
  const result = new Map<Id, { popBlockId: Id; valueRUSD: number }>();
  if (plan.entries.length === 0) return result;
  const pricesByMarket = new Map(markets.map((market) => [market.marketId, market.openingPrices]));
  const marketOfProvince = marketByProvince(world);
  const provinceOfBuilding = new Map(world.buildings.map((building) => [building.id, building.provinceId]));
  for (const entry of plan.entries) {
    const provinceId = provinceOfBuilding.get(entry.buildingId);
    const marketId = provinceId === undefined ? undefined : marketOfProvince.get(provinceId);
    const prices = marketId === undefined ? undefined : pricesByMarket.get(marketId);
    if (prices === undefined) throw new RangeError(`kept food of building ${String(entry.buildingId)} has no market`);
    const value = entry.quantity * (prices[entry.goodId] ?? 0);
    const current = result.get(entry.buildingId);
    if (current === undefined) result.set(entry.buildingId, { popBlockId: entry.popBlockId, valueRUSD: value });
    else current.valueRUSD += value;
  }
  return result;
}

function runMarketAttempt(
  world: World,
  definitions: EconomyDefinitions,
  populationDefinitions: PopulationDefinitions,
  dayIndex: DayIndex,
  index: FinanceIndex,
  mode: "full" | "cash",
  observe?: DayPhaseObserver,
  detail: DayResultDetail = "full",
): MarketAttempt {
  observe?.("market-household-demand");
  // D-137: one set of day-level lookups (capacity index and per-building capacity)
  // serves the input demand here and the production of every market below; the
  // market phase changes only stock and prices, never what capacity reads.
  const baseLookups = buildMarketDayLookups(world, definitions);
  // P5 (D-143 §2): owner households keep their subsistence food from their own farms
  // before demand is built; production diverts the same quantities.
  const ownConsumption = planOwnConsumption(
    world,
    definitions,
    populationDefinitions,
    baseLookups.production,
    index,
  );
  const lookups =
    ownConsumption.entries.length === 0
      ? baseLookups
      : { ...baseLookups, production: { ...baseLookups.production, ownConsumption } };
  const household = buildHouseholdDemand(
    world,
    definitions,
    populationDefinitions,
    index,
    detail,
    ownConsumption,
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
    lookups.production.capacityOf,
  );
  observe?.("market-clearing");
  // D-137: each market's demand records in their day order, bucketed once instead of
  // filtering every record for every market. A province belongs to the market named
  // by its `marketId`, which is what `marketProvinceIds` reads.
  const marketByProvinceId = marketByProvince(world);
  const buildingMarket = new Map<Id, Id>();
  for (const building of world.buildings) {
    const marketId = marketByProvinceId.get(building.provinceId);
    if (marketId !== undefined && !buildingMarket.has(building.id)) buildingMarket.set(building.id, marketId);
  }
  // D-139: each market's household rows as columns, with the global row index of
  // each, to map the market's fulfilment column back to the day's rows.
  const recordIndexByMarket = new Map<Id, number[]>();
  for (let row = 0; row < household.count; row += 1) {
    const marketId = household.marketId[row] ?? 0;
    const list = recordIndexByMarket.get(marketId);
    if (list === undefined) recordIndexByMarket.set(marketId, [row]);
    else list.push(row);
  }
  const householdColumnsOf = (marketId: Id): HouseholdDemandColumns => {
    const rows = recordIndexByMarket.get(marketId) ?? [];
    const columns: HouseholdDemandColumns = {
      popBlockId: new Array<number>(rows.length),
      tier: new Array<HouseholdTier>(rows.length),
      goodId: new Array<number>(rows.length),
      desired: new Array<number>(rows.length),
      funded: new Array<number>(rows.length),
    };
    for (let local = 0; local < rows.length; local += 1) {
      const row = rows[local] ?? 0;
      (columns.popBlockId as number[])[local] = household.popBlockId[row] ?? 0;
      (columns.tier as HouseholdTier[])[local] = household.tier[row] ?? 1;
      (columns.goodId as number[])[local] = household.goodId[row] ?? 0;
      (columns.desired as number[])[local] = household.desired[row] ?? 0;
      (columns.funded as number[])[local] = household.funded[row] ?? 0;
    }
    return columns;
  };
  const productionByMarket = new Map<Id, ProductionDemandRecord[]>();
  for (const record of production) {
    const marketId = buildingMarket.get(record.buyerBuildingId);
    if (marketId === undefined) continue;
    const list = productionByMarket.get(marketId);
    if (list === undefined) productionByMarket.set(marketId, [record]);
    else list.push(record);
  }
  const results: MarketDayResult[] = [];
  const fulfilledByRecord = new Float64Array(household.count).fill(Number.NaN);
  // D-149: the mints' standing offers enter their home markets' price formation.
  const mintOffers = mintStandingOffers(world, definitions);
  for (const market of [...world.markets].sort((left, right) => left.id - right.id)) {
    const offers = mintOffers.get(market.id);
    const result = runMarketDay(
      world,
      definitions,
      {
        ...makeMarketInput(
          populationDefinitions,
          dayIndex,
          market.id,
          [],
          productionByMarket.get(market.id) ?? [],
        ),
        householdColumns: householdColumnsOf(market.id),
        ...(offers === undefined ? {} : { mintOffers: offers }),
      },
      { validateWorld: false, lookups, detail },
    );
    const fulfilled = result.columns?.householdFulfilled;
    const recordIndices = recordIndexByMarket.get(market.id) ?? [];
    if (fulfilled === undefined || fulfilled.length !== recordIndices.length) {
      throw new RangeError(`market ${String(market.id)} returned no household fulfilment`);
    }
    for (let local = 0; local < recordIndices.length; local += 1) {
      fulfilledByRecord[recordIndices[local] ?? 0] = fulfilled[local] ?? 0;
    }
    results.push(result);
  }
  // P5b (plan §4.2): production limited every extraction to what its deposit had left;
  // the takings now leave the deposits, through the only depletion path.
  commitExtraction(world, results);
  observe?.("settlement");
  // The integrated day validated employment after migration and before the market
  // phase, so settlement does not repeat that full pass (D-137).
  const settlement = settleMarketDays(world, definitions, results, {
    validateWorld: false,
    validateEmployment: false,
    atomic: false,
    detail,
    inKindWages: inKindWageValues(world, ownConsumption, results),
  });
  return {
    household,
    production,
    cappedBuildings: cap.cappedBuildings,
    markets: results,
    settlement,
    fulfilledByRecord,
    ownConsumption,
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
  // D-137: the integrated day owns atomicity, so the close writes in place.
  return closeFinancePeriod(world, { financeInPlace: true });
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
    /** Result detail (D-137, `TickContext.detail`); the world outcome is the same. */
    readonly detail?: DayResultDetail;
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
  // P4 (D-142): on 1 January the closed year is recorded with the state at the
  // turn of the year, before ageing (reporting only).
  if (aged) {
    const yearEndFactors = demographyFactorsOfBlock(
      world,
      demographyFactorsByCountry(world, economyDefinitions),
    );
    closeDemographyYear(world, populationDefinitions, yearEndFactors);
  }
  const populationsAtStart = world.countries.length > 0 ? populationsByCountry(world) : new Map<Id, number>();
  if (aged) applyAnnualAgeing(world);
  // M9/E5: demography reads the combined health factor (technology × public health ×
  // labor hours) at the start of the day. A technology completed or a law enacted
  // later today applies from the next civil day. P4 (D-142) adds the realised
  // sanitation coverage and contraception; all are functions of the block's country
  // only, so they are derived once per country from the same start-of-day state.
  const blockFactors = demographyFactorsOfBlock(
    world,
    demographyFactorsByCountry(world, economyDefinitions),
  );

  // P4: month-start levels from causes, before the day's births and deaths.
  if (isDemographicLevelDay(calendarDate.day)) updateDemographicLevels(world.popBlocks, blockFactors);
  const demography = applyDailyDemography(
    world,
    populationDefinitions,
    dayIndex,
    aged,
    { factorsOf: blockFactors },
  );
  accumulateDemography(world, calendarDate.year, populationsAtStart, demography);
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
    restoreOnFailure: options.integrity !== "phase",
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

  // P5 (D-143 §4): monthly prospecting; a deposit found today is extractable today.
  observe?.("resources");
  const discovery = runDiscoveryPhase(world, dayIndex);

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
    options.detail ?? "full",
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
    financeInPlace: true,
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
  const training = runTrainingPhase(world, economyDefinitions, dayIndex, { financeInPlace: true });

  // M9 education and research: the payroll is paid from actual post-fiscal treasury
  // cash, age-specific literacy rises for the school-age cohort, and the active
  // project advances. A technology completed today applies from the next day.
  observe?.("education");
  const education = runEducationPhase(world, economyDefinitions, dayIndex, {
    validateWorld: false,
    financeInPlace: true,
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
    { validateWorld: false, financeInPlace: true },
  );

  // E2 business-profit tax: assessed on the just-completed civil month's
  // recognized building results. It runs before the debt phase so collected
  // revenue reduces that month's financing requirement, and before the close so
  // the tax expense/revenue belong to the period that generated the profit.
  observe?.("business-tax");
  const businessTax = runBusinessTaxPhase(world, dayIndex, {
    validateWorld: false,
    financeInPlace: true,
  });

  // E3 construction: hire idle labor, pay and capitalize construction wages, and
  // complete projects. It runs before the debt phase so month-end financing sees
  // the resulting treasury cash, and before the close so outlays are in-period.
  observe?.("construction");
  const construction = runConstructionPhase(
    world,
    economyDefinitions,
    dayIndex,
    settlement,
    { validateWorld: false, financeInPlace: true },
  );

  // M5b debt phase: accrue daily interest, service coupons/maturities, and on a
  // month-end finance the accrued fiscal deficit before the M4b close.
  observe?.("debt");
  const debt = runDebtPhase(world, dayIndex, { validateWorld: false, financeInPlace: true });

  observe?.("needs");
  const needs = buildNeedsResult(
    world,
    economyDefinitions,
    household,
    marketResults,
    settlement,
    options.detail ?? "full",
    attempt.fulfilledByRecord,
    kcalByGoodIdOf(economyDefinitions, populationDefinitions),
    attempt.ownConsumption,
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
      : runProfitDistributionPhase(world, dayIndex, financeClose, { financeInPlace: true });

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
      ownConsumption: attempt.ownConsumption.entries,
      discovery,
    },
  };
}
