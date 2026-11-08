/**
 * Build the bounded, immutable UI snapshot from authoritative simulation state.
 *
 * This is the only place the worker reads the live world for presentation. The
 * resulting object contains plain data only: no typed arrays, account maps,
 * journals, or references into `World`. The app never receives the world itself.
 */

import { provinceHarvestFactor, provinceLandSnapshot } from "./landSnapshot.js";
import {
  countryDemographySnapshot,
  demographySnapshotContext,
  focusProvinceSnapshot,
  type DemographySnapshotContext,
} from "./demographySnapshot.js";
import {
  AI_HARDSHIP_SUBSISTENCE_DAYS,
  BUILDING_SECTORS,
  buildBuildingCapacityIndex,
  buildFinanceIndex,
  computeBuildingCapacity,
  constructionDailyWage,
  constructionIdleWorkersByBlock,
  constructionMaterialsProgress,
  constructionPlannedJobs,
  constructionProjectProgress,
  constructionProjectRemaining,
  constructionWorkingCapital,
  dayIndexToCivilDate,
  daysInYear,
  debtOutstandingPrincipal,
  governmentPeriodTotals,
  governmentStance,
  countryPoliticsSummary,
  deriveEducation,
  deriveHealth,
  deriveTraining,
  laborHoursFactor,
  laborMinimumWageRUSDPerYear,
  lawDefinition,
  lawPrerequisitesMet,
  lawSupport,
  populationTotal,
  readBudgetMemo,
  regimeDefinition,
  technologyEducationBonus,
  technologyMortalityFactor,
  technologyProductivityFactor,
  workingAgePopulation,
  marketInfrastructureQuality,
  activeWarBetween,
  armiesOfCountry,
  provinceSovereignCountryId,
  relationBetween,
  routeCapacityRUSDPerDay,
  transitDays,
  authorityLiabilityRUSD,
  authorityReserveCoverMonths,
  authorityReservesRUSD,
  convertibilityState,
  derivePriceIndexes,
  monetaryCurrencyForCountry,
  RESOURCE_KINDS,
  RESOURCE_UNITS,
  mintPriceRUSDPerKg,
  priceIndexCoverage,
  priceIndexInflation,
  IMPLEMENTED_LAW_SLOTS,
  INTEREST_GROUP_KEYS,
  LAW_SLOTS,
  buildProvinceOwnerMap,
  countryProvinceIds,
  marketProvinceIds,
} from "@century/sim";
import type {
  CountryMetaDef,
  EconomyDefinitions,
  FinancePeriodSummary,
  MarketMetaDef,
  PopulationDefinitions,
  TerritoryMetaDef,
  World,
} from "@century/sim";

import {
  MAX_SNAPSHOT_ANNUAL_REPORTS,
  MAX_SNAPSHOT_LEDGER_MONTHS,
  MAX_SNAPSHOT_TRADE_BLOCKED,
  MAX_SNAPSHOT_TRADE_SHIPMENTS,
  PROTOCOL_VERSION,
  encodeProvinceEconomyTable,
  encodeProvinceOwnershipTable,
  type CountrySnapshot,
  type CountrySummarySnapshot,
  type GoodSnapshot,
  type MarketSnapshot,
  type ProvinceOwnershipSnapshot,
  type FocusProvinceSnapshot,
  type ProvinceEconomySnapshot,
  type TerritorySnapshot,
  type SimulationSnapshot,
  type SnapshotAnnualReport,
  type SnapshotBudgetMonthToDate,
  type SnapshotBudgetTotals,
  type SnapshotConstructionHistory,
  type SnapshotConstructionLabor,
  type SnapshotConstructionProject,
  type SnapshotDebtContract,
  type SnapshotDebtPolicy,
  type SnapshotFinancePeriod,
  type SnapshotFiscalTotals,
  type SnapshotIndustrialPolicy,
  type SnapshotNeedTier,
  type SnapshotProductionCapacity,
  type SnapshotProjectType,
  type SnapshotPublicEnterprise,
  type SnapshotPolitics,
  type SnapshotTechnology,
  type SnapshotTechnologyCatalogEntry,
  type SnapshotEducation,
  type SnapshotLabor,
  type SnapshotTradeNetwork,
  type SnapshotTradePolicy,
  type SnapshotCountryPriceIndex,
  type SnapshotCurrency,
  type SnapshotValuationHistory,
  type SnapshotValuationMonth,
  type SnapshotValuationYear,
  type SnapshotMonetaryAuthority,
  type SnapshotPriceIndex,
  type SnapshotArmy,
} from "./protocol.js";

/**
 * Host-owned presentation cache for snapshot builds (D-137). It holds only values
 * derived from data that cannot change while the entry is used: closed period
 * summaries (immutable once closed; compaction replaces the object), the account
 * registry (ids, owners and subtypes never change; the registry only grows), and the
 * static definitions. A snapshot built with a cache equals one built without it.
 * It is never part of the world, a save or a hash.
 */
export interface SnapshotCache {
  readonly periodTotals: WeakMap<FinancePeriodSummary, ReturnType<typeof governmentPeriodTotals>>;
  readonly financeHistory: Map<
    number,
    {
      readonly summaries: readonly FinancePeriodSummary[];
      readonly accountCount: number;
      readonly blockKey: string;
      readonly history: readonly SnapshotFinancePeriod[];
    }
  >;
  staticFor: {
    readonly definitions: EconomyDefinitions;
    readonly populationDefinitions: PopulationDefinitions | undefined;
    readonly territoryMeta: readonly TerritoryMetaDef[];
    readonly sections: StaticSnapshotSections;
  } | null;
}

interface StaticSnapshotSections {
  readonly goods: SimulationSnapshot["goods"];
  readonly professions: SimulationSnapshot["professions"];
  readonly needTiers: SimulationSnapshot["needTiers"];
  readonly projectTypes: SimulationSnapshot["projectTypes"];
  readonly technologyEraNames: SimulationSnapshot["technologyEraNames"];
  readonly technologyCatalog: SimulationSnapshot["technologyCatalog"];
  readonly territories: SimulationSnapshot["territories"];
}

export function createSnapshotCache(): SnapshotCache {
  return { periodTotals: new WeakMap(), financeHistory: new Map(), staticFor: null };
}

/** Per-build values shared by several sections (computed once per snapshot). */
interface SnapshotBuild {
  readonly cache: SnapshotCache;
  readonly priceIndexes: ReturnType<typeof derivePriceIndexes>;
  /** P4 (D-142) shared demography factors; null without population definitions. */
  readonly demography: DemographySnapshotContext | null;
}

export interface SnapshotRuntimeState {
  readonly sequence: number;
  readonly running: boolean;
  readonly speedDaysPerSecond: number;
  /** Presentation-only measured throughput; never feeds simulation state. */
  readonly achievedDaysPerSecond: number;
  /** Presentation-only focused country whose full record is included. */
  readonly focusCountryId?: number | null;
  /** P4 presentation-only focused province whose pyramid is included. */
  readonly focusProvinceId?: number | null;
  /** Protocol 22: presentation-only focused market whose prices are included. */
  readonly focusMarketId?: number | null;
  /** M11 static polity/market metadata from the scenario. */
  readonly countryMeta?: readonly CountryMetaDef[];
  readonly marketMeta?: readonly MarketMetaDef[];
  readonly territoryMeta?: readonly TerritoryMetaDef[];
}

function roundDisplay(value: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function dateLabel(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function dayLabel(dayIndex: number): string {
  const civil = dayIndexToCivilDate(dayIndex);
  return dateLabel(civil.year, civil.month, civil.day);
}

interface CapacityMaps {
  readonly byCountry: ReadonlyMap<number, ReadonlyMap<number, number>>;
  readonly byMarket: ReadonlyMap<number, ReadonlyMap<number, number>>;
}

/**
 * Current daily output capacity at each building's level, condition, staffing,
 * and productivity. This is not realized production and not demand.
 */
function productionCapacities(
  world: World,
  definitions: EconomyDefinitions,
): CapacityMaps {
  const ownerByProvince = new Map<number, number>();
  for (const country of world.countries) {
    for (const provinceId of countryProvinceIds(world, country.id)) ownerByProvince.set(provinceId, country.id);
  }
  const marketByProvince = new Map<number, number>();
  for (const province of world.provinceEconomies) {
    if (province.marketId !== null) marketByProvince.set(province.id, province.marketId);
  }
  const definitionById = new Map(
    definitions.buildings.map((definition) => [definition.id, definition]),
  );
  const byCountry = new Map<number, Map<number, number>>();
  const byMarket = new Map<number, Map<number, number>>();
  const capacityIndex = buildBuildingCapacityIndex(world, definitions);
  for (const building of [...world.buildings].sort((left, right) => left.id - right.id)) {
    const definition = definitionById.get(building.definitionId);
    if (definition === undefined || definition.outputs.length === 0) continue;
    const capacity = computeBuildingCapacity(world, definitions, building.id, capacityIndex);
    if (!(capacity.capacityTU > 0)) continue;
    const countryId = ownerByProvince.get(building.provinceId);
    const marketId = marketByProvince.get(building.provinceId);
    for (const output of definition.outputs) {
      const quantity = output.quantityPerThroughputUnit * capacity.capacityTU;
      if (!(quantity > 0)) continue;
      if (countryId !== undefined) {
        const countryMap = byCountry.get(countryId) ?? new Map<number, number>();
        countryMap.set(output.goodId, (countryMap.get(output.goodId) ?? 0) + quantity);
        byCountry.set(countryId, countryMap);
      }
      if (marketId !== undefined) {
        const marketMap = byMarket.get(marketId) ?? new Map<number, number>();
        marketMap.set(output.goodId, (marketMap.get(output.goodId) ?? 0) + quantity);
        byMarket.set(marketId, marketMap);
      }
    }
  }
  return { byCountry, byMarket };
}

function productionCapacitySnapshots(
  definitions: EconomyDefinitions,
  capacity: ReadonlyMap<number, number> | undefined,
): readonly SnapshotProductionCapacity[] {
  return [...definitions.goods]
    .sort((left, right) => left.id - right.id)
    .map((good) => ({
      goodId: good.id,
      goodKey: good.key,
      goodName: good.name,
      unitLabel: good.unitLabel,
      category: good.category,
      dailyCapacity: roundDisplay(capacity?.get(good.id) ?? 0, 3),
    }));
}

function needTierSnapshots(
  population: PopulationDefinitions | undefined,
  definitions: EconomyDefinitions,
): readonly SnapshotNeedTier[] {
  if (population === undefined) return [];
  const goodByKey = new Map(definitions.goods.map((good) => [good.key, good]));
  return population.needs.map((tier) => ({
    tier: tier.tier,
    goods: tier.items
      .map((item) => goodByKey.get(item.goodKey))
      .filter((good): good is NonNullable<typeof good> => good !== undefined)
      .sort((left, right) => left.id - right.id)
      .map((good) => ({
        goodId: good.id,
        goodKey: good.key,
        goodName: good.name,
        unitLabel: good.unitLabel,
      })),
  }));
}

function fiscalTotals(
  summary: FinancePeriodSummary,
  countryId: number,
  world: World,
  cache?: SnapshotCache,
): { totals: SnapshotFiscalTotals; businessTaxRevenueRUSD: number } | null {
  let periodTotals = cache?.periodTotals.get(summary);
  if (periodTotals === undefined) {
    periodTotals = governmentPeriodTotals(world.finance, summary);
    cache?.periodTotals.set(summary, periodTotals);
  }
  const totals = periodTotals.find((entry) => entry.countryId === countryId);
  if (totals === undefined) return null;
  return {
    totals: {
      periodStartDay: summary.periodStartDay,
      periodEndDay: summary.periodEndDay,
      incomeTaxRUSD: roundDisplay(totals.incomeTaxRevenueRUSD, 6),
      welfareExpenseRUSD: roundDisplay(totals.welfareExpenseRUSD, 6),
      interestExpenseRUSD: roundDisplay(totals.interestExpenseRUSD, 6),
      subsidyExpenseRUSD: roundDisplay(totals.subsidyExpenseRUSD, 6),
      administrationExpenseRUSD: roundDisplay(totals.administrationExpenseRUSD ?? 0, 6),
      educationExpenseRUSD: roundDisplay(totals.educationExpenseRUSD ?? 0, 6),
      trainingExpenseRUSD: roundDisplay(totals.trainingExpenseRUSD ?? 0, 6),
      customsDutyRevenueRUSD: roundDisplay(totals.customsDutyRevenueRUSD ?? 0, 6),
      militaryExpenseRUSD: roundDisplay(totals.militaryExpenseRUSD ?? 0, 6),
      netFiscalResultRUSD: roundDisplay(totals.netFiscalResultRUSD, 6),
    },
    businessTaxRevenueRUSD: roundDisplay(totals.businessTaxRevenueRUSD, 6),
  };
}

function budgetTotalsSnapshot(
  totals: FinancePeriodSummary["countryBudgetTotals"][number],
): SnapshotBudgetTotals {
  return {
    welfareRequestedRUSD: roundDisplay(totals.welfareRequestedRUSD, 6),
    welfareShortfallRUSD: roundDisplay(totals.welfareShortfallRUSD, 6),
    businessTaxAssessedRUSD: roundDisplay(totals.businessTaxAssessedRUSD, 6),
    businessTaxUncollectedRUSD: roundDisplay(totals.businessTaxUncollectedRUSD, 6),
    debtIssuedRUSD: roundDisplay(totals.debtIssuedRUSD, 6),
    principalRepaidRUSD: roundDisplay(totals.principalRepaidRUSD, 6),
    interestPaidRUSD: roundDisplay(totals.interestPaidRUSD, 6),
    unfinancedRequirementRUSD: roundDisplay(totals.unfinancedRequirementRUSD, 6),
    constructionSpentRUSD: roundDisplay(totals.constructionSpentRUSD, 6),
    constructionWrittenOffRUSD: roundDisplay(totals.constructionWrittenOffRUSD, 6),
    constructionMaterialsSpentRUSD: roundDisplay(totals.constructionMaterialsSpentRUSD, 6),
    subsidyRequestedRUSD: roundDisplay(totals.subsidyRequestedRUSD, 6),
    subsidyShortfallRUSD: roundDisplay(totals.subsidyShortfallRUSD, 6),
    publicEnterpriseSupportRUSD: roundDisplay(totals.publicEnterpriseSupportRUSD, 6),
    administrationRequestedRUSD: roundDisplay(totals.administrationRequestedRUSD ?? 0, 6),
    administrationShortfallRUSD: roundDisplay(totals.administrationShortfallRUSD ?? 0, 6),
  };
}

function emptyBudgetTotalsSnapshot(): SnapshotBudgetTotals {
  return {
    welfareRequestedRUSD: 0,
    welfareShortfallRUSD: 0,
    businessTaxAssessedRUSD: 0,
    businessTaxUncollectedRUSD: 0,
    debtIssuedRUSD: 0,
    principalRepaidRUSD: 0,
    interestPaidRUSD: 0,
    unfinancedRequirementRUSD: 0,
    constructionSpentRUSD: 0,
    constructionWrittenOffRUSD: 0,
    constructionMaterialsSpentRUSD: 0,
    subsidyRequestedRUSD: 0,
    subsidyShortfallRUSD: 0,
    publicEnterpriseSupportRUSD: 0,
    administrationRequestedRUSD: 0,
    administrationShortfallRUSD: 0,
  };
}

/** Validated public-construction project types derived from building definitions. */
function projectTypeSnapshots(definitions: EconomyDefinitions): readonly SnapshotProjectType[] {
  const goods = new Map(definitions.goods.map((good) => [good.id, good]));
  return [...definitions.buildings]
    .filter(
      (definition) =>
        definition.ownershipAllowed.includes("state") &&
        definition.outputs.length > 0 &&
        definition.constructionCostRUSD > 0 &&
        Number.isInteger(definition.constructionWorkers) &&
        definition.constructionWorkers > 0 &&
        // P5b: gated types are offered too; construction enforces the gate and the
        // screen shows the technology a locked type needs (plan section 11.3).
        definition.resourceRequirements.length === 0,
    )
    .sort((left, right) => left.id - right.id)
    .map((definition) => ({
      definitionId: definition.id,
      key: definition.key,
      name: definition.name,
      constructionCostRUSD: roundDisplay(definition.constructionCostRUSD, 6),
      constructionWorkers: definition.constructionWorkers,
      plannedJobs: roundDisplay(constructionPlannedJobs(definition), 2),
      sector: definition.sector,
      usesHydroPotential: definition.usesHydroPotential === true,
      dailyUpkeepRUSDAtLevelOne: roundDisplay(definition.dailyUpkeepRUSDAtLevelOne, 6),
      workingCapitalRUSD: roundDisplay(constructionWorkingCapital(definition), 6),
      outputs: definition.outputs
        .map((output) => {
          const good = goods.get(output.goodId);
          return {
            goodId: output.goodId,
            goodKey: good?.key ?? `good-${String(output.goodId)}`,
            goodName: good?.name ?? `Good ${String(output.goodId)}`,
            unitLabel: good?.unitLabel ?? "unit",
            quantityPerThroughputUnit: output.quantityPerThroughputUnit,
            dailyCapacityAtLevelOne: roundDisplay(
              output.quantityPerThroughputUnit *
                definition.referenceThroughputPerDayAtLevelOne,
              4,
            ),
          };
        })
        .sort((left, right) => left.goodId - right.goodId),
      materials: [...definition.constructionMaterials]
        .sort((left, right) => left.goodId - right.goodId)
        .map((material) => {
          const good = goods.get(material.goodId);
          return {
            goodId: material.goodId,
            goodKey: good?.key ?? `good-${String(material.goodId)}`,
            goodName: good?.name ?? `Good ${String(material.goodId)}`,
            unitLabel: good?.unitLabel ?? "unit",
            quantity: material.quantity,
          };
        }),
    }));
}

function constructionProjectSnapshots(
  world: World,
  definitions: EconomyDefinitions,
  countryId: number,
): readonly SnapshotConstructionProject[] {
  const provinceById = new Map(world.provinceEconomies.map((province) => [province.id, province]));
  const definitionById = new Map(
    definitions.buildings.map((definition) => [definition.id, definition]),
  );
  const goods = new Map(definitions.goods.map((good) => [good.id, good]));
  const marketByProvince = new Map<number, (typeof world.markets)[number]>();
  for (const market of world.markets) {
    for (const provinceId of marketProvinceIds(world, market.id)) marketByProvince.set(provinceId, market);
  }
  return [...world.construction.projects]
    .filter((project) => project.countryId === countryId)
    .sort((left, right) => left.id - right.id)
    .map((project) => {
      const definition = definitionById.get(project.definitionId);
      const market = marketByProvince.get(project.provinceId);
      return {
        id: project.id,
        countryId: project.countryId,
        provinceId: project.provinceId,
        provinceName: provinceById.get(project.provinceId)?.name ?? `Province ${String(project.provinceId)}`,
        definitionId: project.definitionId,
        definitionKey: definition?.key ?? `definition-${String(project.definitionId)}`,
        definitionName: definition?.name ?? `Definition ${String(project.definitionId)}`,
        status: project.status,
        authorizedDay: project.authorizedDay,
        startedDay: project.startedDay,
        completedDay: project.completedDay,
        cancelledDay: project.cancelledDay,
        totalCostRUSD: roundDisplay(project.totalCostRUSD, 6),
        workingCapitalRUSD: roundDisplay(project.workingCapitalRUSD, 6),
        workingCapitalPaidRUSD: roundDisplay(project.workingCapitalPaidRUSD, 6),
        spentRUSD: roundDisplay(project.spentRUSD, 6),
        materialsSpentRUSD: roundDisplay(project.materialsSpentRUSD, 6),
        materials: project.materials
          .map((material) => {
            const good = goods.get(material.goodId);
            const unitPriceRUSD = market?.priceRUSD[material.goodId] ?? 0;
            const remaining = Math.max(
              0,
              material.requiredQuantity - material.deliveredQuantity,
            );
            return {
              goodId: material.goodId,
              goodKey: good?.key ?? `good-${String(material.goodId)}`,
              goodName: good?.name ?? `Good ${String(material.goodId)}`,
              unitLabel: good?.unitLabel ?? "unit",
              requiredQuantity: material.requiredQuantity,
              deliveredQuantity: material.deliveredQuantity,
              remainingQuantity: remaining,
              unitPriceRUSD: roundDisplay(unitPriceRUSD, 6),
              deliveredValueRUSD: roundDisplay(
                material.deliveredQuantity * unitPriceRUSD,
                6,
              ),
            };
          })
          .sort((left, right) => left.goodId - right.goodId),
        progress: roundDisplay(constructionProjectProgress(project), 6),
        materialsProgress: roundDisplay(constructionMaterialsProgress(project), 6),
        remainingRUSD: roundDisplay(constructionProjectRemaining(project), 6),
        lastWorkers: project.lastWorkers,
        blockedReason: project.blockedReason,
        buildingId: project.buildingId,
      };
    });
}

function constructionHistorySnapshot(
  world: World,
  countryId: number,
): SnapshotConstructionHistory {
  const aggregate = world.construction.history.find((entry) => entry.countryId === countryId);
  return {
    projectsCompleted: aggregate?.projectsCompleted ?? 0,
    projectsCancelled: aggregate?.projectsCancelled ?? 0,
    totalSpentRUSD: roundDisplay(aggregate?.totalSpentRUSD ?? 0, 6),
    totalWrittenOffRUSD: roundDisplay(aggregate?.totalWrittenOffRUSD ?? 0, 6),
  };
}

function constructionLaborSnapshot(
  world: World,
  definitions: EconomyDefinitions,
  countryId: number,
  yearDays: number,
): SnapshotConstructionLabor {
  const idle = constructionIdleWorkersByBlock(world, definitions, countryId);
  const professions = new Map(
    definitions.professions.map((profession) => [profession.id, profession]),
  );
  let workers = 0;
  let weightedWage = 0;
  const wagesByProvince = new Map(
    world.provinceEconomies.map((province) => [province.id, province.wageRUSDPerYearByProfession]),
  );
  for (const block of [...world.popBlocks].sort((left, right) => left.id - right.id)) {
    const count = idle.get(block.id) ?? 0;
    if (count <= 0) continue;
    const profession = professions.get(block.professionId);
    if (profession === undefined) continue;
    workers += count;
    weightedWage += count * constructionDailyWage(profession, yearDays, wagesByProvince.get(block.provinceId));
  }
  return {
    idleWorkers: workers,
    dailyWageRUSD: workers > 0 ? roundDisplay(weightedWage / workers, 6) : 0,
  };
}

/** Label for a debt creditor/holder that is a country or a population block. */
function holderLabel(
  world: World,
  kind: "country" | "popBlock",
  id: number,
): string {
  if (kind === "country") {
    return world.countries.find((country) => country.id === id)?.tag ?? `Country ${String(id)}`;
  }
  const block = world.popBlocks.find((candidate) => candidate.id === id);
  if (block === undefined) return `Pop block ${String(id)}`;
  const province = world.provinceEconomies.find((candidate) => candidate.id === block.provinceId);
  return `Pop block ${String(id)}${province === undefined ? "" : ` (${province.name})`}`;
}

/** Debt policy plus derived creditor-cash and headroom constraints. */
function debtPolicySnapshot(
  world: World,
  country: World["countries"][number],
  index: ReturnType<typeof buildFinanceIndex>,
): SnapshotDebtPolicy {
  const policy = country.debt;
  const outstanding = debtOutstandingPrincipal(world.finance.debtContracts, country.id);
  const cashAccount =
    policy.creditorKind === "country"
      ? index.find("country", policy.creditorId, "treasury-cash")
      : index.find("popBlock", policy.creditorId, "household-cash");
  const creditorCash = Math.max(0, cashAccount?.balanceRUSD ?? 0);
  return {
    enabled: policy.enabled,
    refinanceOnMaturity: policy.refinanceOnMaturity,
    maxOutstandingPrincipalRUSD: policy.maxOutstandingPrincipalRUSD,
    creditorKind: policy.creditorKind,
    creditorId: policy.creditorId,
    creditorLabel: holderLabel(world, policy.creditorKind, policy.creditorId),
    annualCouponRate: policy.annualCouponRate,
    termDays: policy.termDays,
    arrearsGraceDays: policy.arrearsGraceDays,
    creditorCashRUSD: roundDisplay(creditorCash, 6),
    headroomRUSD: roundDisplay(
      Math.max(0, policy.maxOutstandingPrincipalRUSD - outstanding),
      6,
    ),
  };
}

/** Outstanding/arrears contracts for one issuer, in ascending id order. */
function debtContractSnapshots(
  world: World,
  countryId: number,
): readonly SnapshotDebtContract[] {
  return world.finance.debtContracts
    .filter(
      (contract) =>
        contract.issuerCountryId === countryId &&
        (contract.status === "active" || contract.status === "arrears"),
    )
    .sort((left, right) => left.id - right.id)
    .map((contract) => ({
      id: contract.id,
      holderKind: contract.holderKind,
      holderId: contract.holderId,
      holderLabel: holderLabel(world, contract.holderKind, contract.holderId),
      principalRUSD: roundDisplay(contract.principalRUSD, 6),
      outstandingPrincipalRUSD: roundDisplay(contract.outstandingPrincipalRUSD, 6),
      annualCouponRate: contract.annualCouponRate,
      issueDay: contract.issueDay,
      maturityDay: contract.maturityDay,
      accruedInterestRUSD: roundDisplay(contract.accruedInterestRUSD, 6),
      status: contract.status,
    }));
}

function financeHistory(
  world: World,
  country: World["countries"][number],
  index: ReturnType<typeof buildFinanceIndex>,
  blockIds: ReadonlySet<number>,
  cache?: SnapshotCache,
): readonly SnapshotFinancePeriod[] {
  const summaries = world.finance.periodSummaries.slice(-MAX_SNAPSHOT_LEDGER_MONTHS);
  // The history reads closed summaries, the account registry and the country's
  // blocks only; reuse it while all three are unchanged (D-137).
  const blockKey = [...blockIds].join(",");
  const cached = cache?.financeHistory.get(country.id);
  if (
    cached !== undefined &&
    cached.accountCount === index.accounts.length &&
    cached.blockKey === blockKey &&
    cached.summaries.length === summaries.length &&
    cached.summaries.every((summary, position) => summary === summaries[position])
  ) {
    return cached.history;
  }
  const history = buildFinanceHistory(world, country, index, blockIds, summaries, cache);
  cache?.financeHistory.set(country.id, {
    summaries,
    accountCount: index.accounts.length,
    blockKey,
    history,
  });
  return history;
}

function buildFinanceHistory(
  world: World,
  country: World["countries"][number],
  index: ReturnType<typeof buildFinanceIndex>,
  blockIds: ReadonlySet<number>,
  summaries: readonly FinancePeriodSummary[],
  cache: SnapshotCache | undefined,
): readonly SnapshotFinancePeriod[] {
  const treasuryId = index.find("country", country.id, "treasury-cash")?.id;
  const debtAccountIds = new Set(
    index.accounts
      .filter(
        (account) =>
          account.ownerKind === "country" &&
          account.ownerId === country.id &&
          account.subtype === "debt-liability",
      )
      .map((account) => account.id),
  );
  const householdAccountIds = new Set(
    index.accounts
      .filter(
        (account) =>
          account.ownerKind === "popBlock" &&
          account.ownerId !== null &&
          blockIds.has(account.ownerId) &&
          account.subtype === "household-cash",
      )
      .map((account) => account.id),
  );
  const history: SnapshotFinancePeriod[] = [];
  for (const summary of summaries) {
    const periodFiscal = fiscalTotals(summary, country.id, world, cache);
    if (periodFiscal === null) continue;
    const budget = summary.countryBudgetTotals[country.id];
    // A summary is compacted exactly when it retains no account trial balance;
    // compacted months keep fiscal and budget flows but no closing balances.
    const detailed = Object.keys(summary.accountTotals).length > 0;
    let treasury: number | null = null;
    let debt: number | null = null;
    let household: number | null = null;
    // P5 (D-143 §6): closes record each country's closing balances, kept through
    // compaction; older summaries (fixtures) fall back to the account trial balance.
    const closing = summary.countryClosingBalances?.find((entry) => entry.countryId === country.id);
    if (closing !== undefined) {
      treasury = roundDisplay(closing.treasuryCashRUSD, 6);
      debt = roundDisplay(closing.debtOutstandingRUSD, 6);
      household = roundDisplay(closing.householdCashRUSD, 6);
    } else if (detailed) {
      treasury = roundDisplay(
        treasuryId === undefined ? 0 : (summary.accountTotals[treasuryId] ?? 0),
        6,
      );
      let debtTotal = 0;
      for (const accountId of debtAccountIds) {
        debtTotal += summary.accountTotals[accountId] ?? 0;
      }
      debt = roundDisplay(debtTotal, 6);
      let householdTotal = 0;
      for (const accountId of householdAccountIds) {
        householdTotal += summary.accountTotals[accountId] ?? 0;
      }
      household = roundDisplay(householdTotal, 6);
    }
    history.push({
      ...periodFiscal.totals,
      ...(budget === undefined ? emptyBudgetTotalsSnapshot() : budgetTotalsSnapshot(budget)),
      businessTaxRevenueRUSD: periodFiscal.businessTaxRevenueRUSD,
      grossFlowTotals: { ...summary.flowTotalsByKind },
      periodStartLabel: dayLabel(summary.periodStartDay),
      periodEndLabel: dayLabel(summary.periodEndDay),
      treasuryCashEndRUSD: treasury,
      debtOutstandingEndRUSD: debt,
      householdCashEndRUSD: household,
    });
  }
  return history;
}

function annualReportSnapshots(
  world: World,
  countryId: number,
): readonly SnapshotAnnualReport[] {
  return world.finance.annualSummaries
    .slice(-MAX_SNAPSHOT_ANNUAL_REPORTS)
    .map((summary) => {
      const totals = summary.fiscalTotals[countryId];
      const budget = summary.budgetTotals[countryId];
      const balances = summary.closingBalances[countryId];
      return {
        ...(budget === undefined ? emptyBudgetTotalsSnapshot() : budgetTotalsSnapshot(budget)),
        year: summary.year,
        periodStartDay: summary.periodStartDay,
        periodEndDay: summary.periodEndDay,
        periodStartLabel: dayLabel(summary.periodStartDay),
        periodEndLabel: dayLabel(summary.periodEndDay),
        complete: summary.complete,
        incomeTaxRUSD: roundDisplay(totals?.incomeTaxRevenueRUSD ?? 0, 6),
        businessTaxRevenueRUSD: roundDisplay(totals?.businessTaxRevenueRUSD ?? 0, 6),
        welfareExpenseRUSD: roundDisplay(totals?.welfareExpenseRUSD ?? 0, 6),
        interestExpenseRUSD: roundDisplay(totals?.interestExpenseRUSD ?? 0, 6),
        subsidyExpenseRUSD: roundDisplay(totals?.subsidyExpenseRUSD ?? 0, 6),
        administrationExpenseRUSD: roundDisplay(
          totals?.administrationExpenseRUSD ?? 0,
          6,
        ),
        educationExpenseRUSD: roundDisplay(totals?.educationExpenseRUSD ?? 0, 6),
        trainingExpenseRUSD: roundDisplay(totals?.trainingExpenseRUSD ?? 0, 6),
        customsDutyRevenueRUSD: roundDisplay(totals?.customsDutyRevenueRUSD ?? 0, 6),
        militaryExpenseRUSD: roundDisplay(totals?.militaryExpenseRUSD ?? 0, 6),
        netFiscalResultRUSD: roundDisplay(totals?.netFiscalResultRUSD ?? 0, 6),
        treasuryCashEndRUSD: roundDisplay(balances?.treasuryCashRUSD ?? 0, 6),
        debtLiabilityEndRUSD: roundDisplay(balances?.debtLiabilityRUSD ?? 0, 6),
        interestPayableEndRUSD: roundDisplay(balances?.interestPayableRUSD ?? 0, 6),
        correctionCount: summary.correctionCount,
      };
    });
}

function countrySectorValueEstimates(
  world: World,
  definitions: EconomyDefinitions,
  country: World["countries"][number],
): Map<string, number> {
  const values = new Map<string, number>();
  const provinceIds = new Set(countryProvinceIds(world, country.id));
  const marketByProvince = new Map<number, (typeof world.markets)[number]>();
  for (const market of world.markets) {
    for (const provinceId of marketProvinceIds(world, market.id)) marketByProvince.set(provinceId, market);
  }
  const definitionById = new Map(
    definitions.buildings.map((definition) => [definition.id, definition]),
  );
  const capacityIndex = buildBuildingCapacityIndex(world, definitions);
  for (const building of world.buildings) {
    if (!provinceIds.has(building.provinceId)) continue;
    const definition = definitionById.get(building.definitionId);
    if (definition === undefined) continue;
    const market = marketByProvince.get(building.provinceId);
    if (market === undefined) continue;
    const capacity = computeBuildingCapacity(world, definitions, building.id, capacityIndex);
    let value = 0;
    for (const output of definition.outputs) {
      const price = market.priceRUSD[output.goodId] ?? 0;
      value += output.quantityPerThroughputUnit * capacity.capacityTU * price;
    }
    values.set(definition.sector, (values.get(definition.sector) ?? 0) + value);
  }
  return values;
}

function technologyCatalogSnapshot(
  definitions: EconomyDefinitions,
): readonly SnapshotTechnologyCatalogEntry[] {
  const content = definitions.technology;
  if (content === undefined) return [];
  return [...content.technologies]
    .sort((left, right) => left.id - right.id)
    .map((technology) => ({
      technologyId: technology.id,
      key: technology.key,
      name: technology.name,
      era: technology.era,
      eraName: content.eraNames[technology.era - 1] ?? `Era ${String(technology.era)}`,
      description: technology.description,
      prerequisites: [...technology.prerequisites].sort((left, right) => left - right),
      prerequisiteKeys: technology.prerequisites
        .map((prerequisite) => technologyKeyOf(content, prerequisite))
        .sort(),
      researchWork: technology.researchWork,
      effects: technology.effects.map((effect) => {
        if (effect.kind === "sector-productivity") {
          return `+${(effect.bonus * 100).toFixed(1)}% ${effect.sector} output`;
        }
        if (effect.kind === "mortality-reduction") {
          return `-${(effect.reduction * 100).toFixed(1)}% mortality`;
        }
        if (effect.kind === "urban-sanitation") {
          return `+${(effect.coverage * 100).toFixed(0)}% urban sanitation coverage (with public health staff)`;
        }
        if (effect.kind === "contraception") {
          return `-${(effect.reduction * 100).toFixed(0)}% fertility (contraception)`;
        }
        return `+${(effect.bonus * 100).toFixed(1)}% education quality`;
      }),
      unlockedBuildingKeys: definitions.buildings
        .filter((building) => building.requiredTechnologyId === technology.id)
        .map((building) => building.key)
        .sort(),
      requiredByLawKeys: (definitions.politics?.laws ?? [])
        .filter((law) => law.requiredTechnologyIds.includes(technology.id))
        .map((law) => law.key)
        .sort(),
    }));
}

function technologySnapshot(
  world: World,
  country: World["countries"][number],
  definitions: EconomyDefinitions,
): SnapshotTechnology {
  const content = definitions.technology;
  const researchedIds = new Set(
    country.technology.researched.map((entry) => entry.technologyId),
  );
  const activeId = country.technology.activeProject?.technologyId ?? null;
  const productivityBySector = BUILDING_SECTORS.map((sector) => ({
    sector,
    factor: roundDisplay(technologyProductivityFactor(country, definitions, sector), 6),
  }));
  if (content === undefined || !world.technology.enabled) {
    return {
      enabled: false,
      statuses: [],
      researchedCount: 0,
      activeProjectTechnologyId: null,
      researchBlockedReason: "no-technology-definitions",
      productivityBySector,
      mortalityFactor: 1,
      educationBonus: 0,
    };
  }
  const derived = deriveEducation(world, country, definitions);
  const completedById = new Map(
    country.technology.researched.map((entry) => [entry.technologyId, entry.completedDay]),
  );
  const statuses = [...content.technologies]
    .sort((left, right) => left.id - right.id)
    .map((technology) => {
      const prerequisitesResearched = technology.prerequisites.every((prerequisite) =>
        researchedIds.has(prerequisite),
      );
      const status: "researched" | "active" | "available" | "locked" = researchedIds.has(
        technology.id,
      )
        ? "researched"
        : activeId === technology.id
          ? "active"
          : prerequisitesResearched
            ? "available"
            : "locked";
      return {
        technologyId: technology.id,
        status,
        workCompleted: roundDisplay(
          country.technology.workByTechnology[technology.id] ?? 0,
          4,
        ),
        completedDay: completedById.get(technology.id) ?? null,
      };
    });
  return {
    enabled: true,
    statuses,
    researchedCount: country.technology.researched.length,
    activeProjectTechnologyId: activeId,
    researchBlockedReason: derived.researchBlockedReason,
    productivityBySector,
    mortalityFactor: roundDisplay(technologyMortalityFactor(country, definitions), 6),
    educationBonus: roundDisplay(technologyEducationBonus(country, definitions), 6),
  };
}

function technologyKeyOf(content: { technologies: readonly { id: number; key: string }[] }, id: number): string {
  return content.technologies.find((entry) => entry.id === id)?.key ?? String(id);
}

function educationSnapshot(
  world: World,
  country: World["countries"][number],
  definitions: EconomyDefinitions,
): SnapshotEducation {
  const derived = deriveEducation(world, country, definitions);
  return {
    enabled: definitions.technology !== undefined && world.technology.enabled,
    fundedAnnualRUSD: country.education.fundedAnnualRUSD,
    researchStaffShare: country.education.researchStaffShare,
    academicPopulation: derived.academicPopulation,
    availableAcademicWorkers: derived.availableAcademicWorkers,
    researchStaff: derived.researchStaff,
    teacherStaff: derived.teacherStaff,
    schoolAgePopulation: derived.schoolAgePopulation,
    teachingCapacityStudents: derived.teachingCapacityStudents,
    enrolledStudents: derived.enrolledStudents,
    attendanceRate: derived.attendanceRate,
    fundingAdequacy: derived.fundingAdequacy,
    quality: derived.quality,
    serviceOutputIndex: derived.serviceOutputIndex,
    fundingRequestedMonthToDateRUSD: roundDisplay(
      country.education.fundingRequestedMonthToDateRUSD,
      6,
    ),
    fundingShortfallMonthToDateRUSD: roundDisplay(
      country.education.fundingShortfallMonthToDateRUSD,
      6,
    ),
    researchBlockedReason: derived.researchBlockedReason,
    educationBlockedReason: derived.educationBlockedReason,
    lastUpdateDay: country.education.lastUpdateDay,
  };
}

function laborSnapshot(
  world: World,
  country: World["countries"][number],
  definitions: EconomyDefinitions,
): SnapshotLabor {
  const training = deriveTraining(world, country, definitions);
  const health = deriveHealth(world, country, definitions);
  const provinceIds = new Set(countryProvinceIds(world, country.id));
  let workingAgeTotal = 0;
  let qualificationWeighted = 0;
  for (const block of world.popBlocks) {
    if (!provinceIds.has(block.provinceId)) continue;
    const workingAge = workingAgePopulation(block);
    workingAgeTotal += workingAge;
    qualificationWeighted += block.qualification * workingAge;
  }
  const qualificationAverage =
    workingAgeTotal > 0 ? qualificationWeighted / workingAgeTotal : 0;
  const trainingBlockedReason =
    country.labor.trainingBudgetRUSDPerYear <= 0
      ? "no-funding"
      : training.instructors <= 0
        ? "no-academic-staff"
        : training.eligibleWorkingAge <= 0
          ? "no-eligible-population"
          : null;
  const healthBlockedReason =
    health.clerkPopulation <= 0
      ? "no-administration-staff"
      : health.staffShare <= 0
        ? "no-health-share"
        : health.fundingRatio <= 0
          ? "no-funding"
          : null;
  const law =
    definitions.politics === undefined
      ? null
      : lawDefinition(definitions.politics, country.laws.labor);
  return {
    trainingBudgetRUSDPerYear: country.labor.trainingBudgetRUSDPerYear,
    trainingStipendPerTraineeRUSDPerYear:
      country.labor.trainingStipendPerTraineeRUSDPerYear,
    trainingStaffShare: country.labor.trainingStaffShare,
    trainingParticipation: country.labor.trainingParticipation,
    trainingInstructors: roundDisplay(training.instructors, 2),
    eligibleWorkingAge: Math.round(training.eligibleWorkingAge),
    capacityTrainees: training.capacityTrainees,
    trainees: roundDisplay(training.trainees, 2),
    trainingRequestedMonthToDateRUSD: roundDisplay(
      country.labor.trainingRequestedMonthToDateRUSD,
      6,
    ),
    trainingShortfallMonthToDateRUSD: roundDisplay(
      country.labor.trainingShortfallMonthToDateRUSD,
      6,
    ),
    trainingBlockedReason,
    qualificationAverage: roundDisplay(qualificationAverage, 6),
    healthStaffShare: health.staffShare,
    healthStaff: roundDisplay(health.healthStaff, 2),
    administrationStaff: roundDisplay(health.administrationStaff, 2),
    healthServiceOutputIndex: health.serviceOutputIndex,
    healthMortalityFactor: health.mortalityFactor,
    healthBlockedReason,
    minimumWageRUSDPerYear: laborMinimumWageRUSDPerYear(country, definitions),
    hoursPerWeek: law === null ? 0 : law.laborHoursPerWeek,
    hoursFactor: roundDisplay(laborHoursFactor(country, definitions), 6),
  };
}

function politicsSnapshot(
  world: World,
  country: World["countries"][number],
  definitions: EconomyDefinitions,
): SnapshotPolitics {
  const politics = definitions.politics;
  const empty: SnapshotPolitics = {
    enabled: false,
    regimeKind: country.regime.kind,
    regimeName: country.regime.kind,
    governmentGroupKey: country.regime.governmentGroupKey,
    governmentGroupName: country.regime.governmentGroupKey,
    nextElectionDay: country.regime.nextElectionDay,
    lastElectionDay: country.regime.lastElectionDay,
    lastElection:
      country.regime.lastElection === null ? null : { ...country.regime.lastElection },
    crisis: {
      stage: country.regime.crisis.stage,
      sinceDay: country.regime.crisis.sinceDay,
      pressureDays: country.regime.crisis.pressureDays,
      pressure: 0,
    },
    franchiseShare: 0,
    eligiblePopulation: 0,
    supportForGovernment: 0,
    taxCollectionEfficiency: 1,
    constructionProgressFactor: 1,
    interestGroups: [],
    institution: {
      fundedAnnualRUSD: country.institutions.fundedAnnualRUSD,
      quality: country.institutions.quality,
      overload: country.institutions.overload,
      serviceOutputIndex: country.institutions.serviceOutputIndex,
      staffedPopulation: Object.values(country.institutions.staffedByProfession).reduce(
        (total, value) => total + value,
        0,
      ),
      fundingRequestedMonthToDateRUSD: country.institutions.fundingRequestedMonthToDateRUSD,
      fundingShortfallMonthToDateRUSD: country.institutions.fundingShortfallMonthToDateRUSD,
      disruptionUntilDay: country.institutions.disruptionUntilDay,
    },
    lawSlots: [],
    lawTransitions: [],
    lawOptions: [],
    deferredLawSlots: [...LAW_SLOTS],
    recentLog: [],
  };
  if (politics === undefined || !world.politics.enabled) return empty;
  const regime = regimeDefinition(politics, country.regime.kind);
  const groupName = (key: string): string =>
    politics.interestGroups.find((group) => group.key === key)?.name ?? key;
  const summary = countryPoliticsSummary(world, country, definitions);
  const stances = governmentStance(country, politics);
  const transitionBySlot = new Map(
    country.lawTransitions.map((transition) => [transition.slot, transition] as const),
  );
  const lawName = (lawId: number): string =>
    lawId === 0 ? "No implemented law" : (lawDefinition(politics, lawId)?.name ?? `Law ${String(lawId)}`);
  const technologyContent = definitions.technology;
  const technologyKey = (technologyId: number): string =>
    technologyContent?.technologies.find((entry) => entry.id === technologyId)?.key ??
    String(technologyId);
  const lawOptions = [...politics.laws]
    .sort((left, right) => left.id - right.id)
    .map((law) => {
      const alreadyEnacted = country.laws[law.slot] === law.id;
      const transition = transitionBySlot.get(law.slot);
      return {
        lawId: law.id,
        slot: law.slot,
        key: law.key,
        name: law.name,
        description: law.description,
        enactmentDays: law.enactmentDays,
        support: lawSupport(country, law, politics),
        eligible: law.eligibleRegimes.includes(country.regime.kind),
        prerequisitesMet: lawPrerequisitesMet(country, law, politics),
        alreadyEnacted,
        transitionInProgress:
          transition !== undefined && transition.toLawId === law.id,
        isBaseLaw: law.prerequisites.length === 0,
        requiredTechnologyKeys: law.requiredTechnologyIds.map(technologyKey),
        technologyPrerequisitesMet: law.requiredTechnologyIds.every((technologyId) =>
          country.technology.researched.some(
            (entry) => entry.technologyId === technologyId,
          ),
        ),
      };
    });
  const lawSlots = LAW_SLOTS.map((slot) => ({
    slot,
    enactedLawId: country.laws[slot],
    enactedLawName: lawName(country.laws[slot]),
    options: lawOptions.filter((option) => option.slot === slot),
  }));
  const recentLog = [...world.politics.eventLog]
    .filter((entry) => entry.countryId === country.id || entry.countryId === null)
    .sort((left, right) => left.id - right.id)
    .slice(-8)
    .map((entry) => ({
      id: entry.id,
      day: entry.day,
      kind: entry.kind,
      summary: entry.summary,
      provenance: entry.provenance,
    }));
  return {
    ...empty,
    enabled: true,
    regimeKind: regime.kind,
    regimeName: regime.name,
    governmentGroupName: groupName(country.regime.governmentGroupKey),
    nextElectionDay: country.regime.nextElectionDay,
    lastElectionDay: country.regime.lastElectionDay,
    lastElection:
      country.regime.lastElection === null ? null : { ...country.regime.lastElection },
    crisis: {
      stage: country.regime.crisis.stage,
      sinceDay: country.regime.crisis.sinceDay,
      pressureDays: country.regime.crisis.pressureDays,
      pressure: summary.crisisPressure,
    },
    franchiseShare: summary.franchiseShare,
    eligiblePopulation: summary.eligiblePopulation,
    supportForGovernment: summary.supportForGovernment,
    taxCollectionEfficiency: summary.taxCollectionEfficiency,
    constructionProgressFactor: summary.constructionProgressFactor,
    interestGroups: [...country.interestGroups]
      .sort(
        (left, right) =>
          INTEREST_GROUP_KEYS.indexOf(left.key) - INTEREST_GROUP_KEYS.indexOf(right.key),
      )
      .map((group) => ({
        key: group.key,
        name: groupName(group.key),
        membershipPopulation: group.membershipPopulation,
        organization: group.organization,
        influence: group.influence,
        governmentStance: stances.get(group.key) ?? 0,
      })),
    lawSlots,
    lawTransitions: [...country.lawTransitions]
      .sort((left, right) => left.id - right.id)
      .map((transition) => ({
        id: transition.id,
        slot: transition.slot,
        fromLawName: lawName(transition.fromLawId),
        toLawName: lawName(transition.toLawId),
        proposedDay: transition.proposedDay,
        effectiveDay: transition.effectiveDay,
        support: transition.support,
      })),
    lawOptions,
    deferredLawSlots: LAW_SLOTS.filter((slot) => !IMPLEMENTED_LAW_SLOTS.includes(slot)),
    recentLog,
  };
}

function countrySnapshot(
  world: World,
  country: World["countries"][number],
  index: ReturnType<typeof buildFinanceIndex>,
  history: readonly SnapshotFinancePeriod[],
  capacity: ReadonlyMap<number, number> | undefined,
  definitions: EconomyDefinitions,
  meta: CountryMetaDef | undefined,
  build?: SnapshotBuild,
): CountrySnapshot {
  const provinceIds = new Set(countryProvinceIds(world, country.id));
  const blockIds = new Set<number>();
  let population = 0;
  let workingAge = 0;
  let hardshipPopulation = 0;
  let weightedLiteracy = 0;
  let weightedWealth = 0;
  let weightedMilitancy = 0;
  let unmetSubsistenceBlocks = 0;
  let unmetBasicBlocks = 0;
  let buildingCount = 0;
  for (const block of world.popBlocks) {
    if (!provinceIds.has(block.provinceId)) continue;
    blockIds.add(block.id);
    const blockPopulation = populationTotal(block);
    population += blockPopulation;
    workingAge += workingAgePopulation(block);
    if (block.unmetSubsistenceDays >= AI_HARDSHIP_SUBSISTENCE_DAYS) {
      hardshipPopulation += blockPopulation;
    }
    if (block.unmetSubsistenceDays > 0) unmetSubsistenceBlocks += 1;
    if (block.unmetBasicDays > 0) unmetBasicBlocks += 1;
    weightedLiteracy += block.literacy * blockPopulation;
    weightedWealth += block.wealthLevel * blockPopulation;
    weightedMilitancy += block.militancy * blockPopulation;
  }
  for (const building of world.buildings) {
    if (provinceIds.has(building.provinceId)) buildingCount += 1;
  }
  const buildingById = new Map(world.buildings.map((building) => [building.id, building]));
  const professionById = new Map(
    definitions.professions.map((profession) => [profession.id, profession]),
  );
  const yearDays = daysInYear(dayIndexToCivilDate(world.dayIndex).year);
  let employedWorkers = 0;
  let estimatedDailyWageBase = 0;
  const wageBaseByBlock = new Map<number, number>();
  for (const assignment of world.employment) {
    const building = buildingById.get(assignment.buildingInstanceId);
    if (building === undefined || !provinceIds.has(building.provinceId)) continue;
    employedWorkers += assignment.workers;
    const profession = professionById.get(assignment.professionId);
    if (profession !== undefined) {
      const wage = (profession.baseWage1900RUSDPerYear / yearDays) * assignment.workers;
      estimatedDailyWageBase += wage;
      wageBaseByBlock.set(
        assignment.popBlockId,
        (wageBaseByBlock.get(assignment.popBlockId) ?? 0) + wage,
      );
    }
  }
  // Estimated taxable wage base at the current E2 exemption. This is an exact
  // calculation over the current base-wage estimate (employment × profession base
  // wage ÷ civil year days), not realized wages and not a forecast.
  const dailyAllowance = country.fiscal.incomeTaxAllowanceRUSDPerYear / yearDays;
  let estimatedDailyTaxableWageBase = 0;
  let estimatedWageEarningBlockCount = 0;
  for (const blockId of [...blockIds].sort((left, right) => left - right)) {
    const wageBase = wageBaseByBlock.get(blockId) ?? 0;
    if (!(wageBase > 0)) continue;
    estimatedWageEarningBlockCount += 1;
    estimatedDailyTaxableWageBase += Math.max(0, wageBase - dailyAllowance);
  }
  // Month-to-date enterprise profit base for the business-tax preview: the same
  // recognized-revenue-minus-eligible-costs measure the month-end phase assesses.
  let businessTaxBaseMonthToDate = 0;
  for (const building of world.buildings) {
    if (!provinceIds.has(building.provinceId)) continue;
    const revenue = index.find("building", building.id, "sales-revenue")?.balanceRUSD ?? 0;
    const subsidy = index.find("building", building.id, "subsidy-revenue")?.balanceRUSD ?? 0;
    const input = index.find("building", building.id, "input-expense")?.balanceRUSD ?? 0;
    const wage = index.find("building", building.id, "wage-expense")?.balanceRUSD ?? 0;
    const upkeep = index.find("building", building.id, "upkeep-expense")?.balanceRUSD ?? 0;
    businessTaxBaseMonthToDate += Math.max(0, revenue + subsidy - input - wage - upkeep);
  }
  let householdCash = 0;
  for (const blockId of blockIds) {
    householdCash += index.find("popBlock", blockId, "household-cash")?.balanceRUSD ?? 0;
  }
  const debtInterestPayable =
    index.find("country", country.id, "interest-payable")?.balanceRUSD ?? 0;
  const memo = readBudgetMemo(world.finance, country.id);
  const budgetMonthToDate: SnapshotBudgetMonthToDate = {
    welfareRequestedRUSD: roundDisplay(memo.welfareRequestedRUSD, 6),
    welfareShortfallRUSD: roundDisplay(memo.welfareShortfallRUSD, 6),
    businessTaxAssessedRUSD: roundDisplay(memo.businessTaxAssessedRUSD, 6),
    businessTaxUncollectedRUSD: roundDisplay(memo.businessTaxUncollectedRUSD, 6),
    debtIssuedRUSD: roundDisplay(memo.debtIssuedRUSD, 6),
    principalRepaidRUSD: roundDisplay(memo.principalRepaidRUSD, 6),
    interestPaidRUSD: roundDisplay(memo.interestPaidRUSD, 6),
    unfinancedRequirementRUSD: roundDisplay(memo.unfinancedRequirementRUSD, 6),
    constructionSpentRUSD: roundDisplay(memo.constructionSpentRUSD, 6),
    constructionWrittenOffRUSD: roundDisplay(memo.constructionWrittenOffRUSD, 6),
    constructionMaterialsSpentRUSD: roundDisplay(memo.constructionMaterialsSpentRUSD, 6),
    subsidyRequestedRUSD: roundDisplay(memo.subsidyRequestedRUSD, 6),
    subsidyShortfallRUSD: roundDisplay(memo.subsidyShortfallRUSD, 6),
    publicEnterpriseSupportRUSD: roundDisplay(memo.publicEnterpriseSupportRUSD, 6),
    administrationRequestedRUSD: roundDisplay(memo.administrationRequestedRUSD ?? 0, 6),
    administrationShortfallRUSD: roundDisplay(memo.administrationShortfallRUSD ?? 0, 6),
    businessTaxBaseMonthToDateRUSD: roundDisplay(businessTaxBaseMonthToDate, 6),
  };
  const latestFiscal = history.length === 0 ? null : (history[history.length - 1] ?? null);
  const sectorValues = countrySectorValueEstimates(world, definitions, country);
  const sectorLabels: Record<string, string> = {
    agriculture: "Agriculture",
    "food-processing": "Food processing",
    textiles: "Textiles",
    manufacturing: "Manufacturing",
    storage: "Storage",
    mining: "Mining",
    energy: "Energy",
    services: "Services",
  };
  const industrialPolicy: SnapshotIndustrialPolicy = {
    sectors: BUILDING_SECTORS.map((key, index) => ({
      index,
      key,
      label: sectorLabels[key] ?? key,
      subsidyRate: country.industrial.sectorSubsidyRates[index] ?? 0,
      estimatedDailyOutputValueRUSD: roundDisplay(sectorValues.get(key) ?? 0, 6),
    })),
    requestedMonthToDateRUSD: roundDisplay(memo.subsidyRequestedRUSD, 6),
    paidMonthToDateRUSD: roundDisplay(
      Math.max(0, memo.subsidyRequestedRUSD - memo.subsidyShortfallRUSD),
      6,
    ),
    shortfallMonthToDateRUSD: roundDisplay(memo.subsidyShortfallRUSD, 6),
  };
  const provinceById = new Map(world.provinceEconomies.map((province) => [province.id, province]));
  const definitionById = new Map(
    definitions.buildings.map((definition) => [definition.id, definition]),
  );
  const publicEnterprises: SnapshotPublicEnterprise[] = world.buildings
    .filter(
      (building) =>
        provinceIds.has(building.provinceId) &&
        building.ownerKind === "state" &&
        building.ownerAccountId === country.treasuryAccountId,
    )
    .sort((left, right) => left.id - right.id)
    .map((building) => {
      const definition = definitionById.get(building.definitionId);
      return {
        buildingId: building.id,
        definitionId: building.definitionId,
        definitionKey: definition?.key ?? `definition-${String(building.definitionId)}`,
        definitionName: definition?.name ?? `Definition ${String(building.definitionId)}`,
        provinceId: building.provinceId,
        provinceName: provinceById.get(building.provinceId)?.name ?? `Province ${String(building.provinceId)}`,
        sector: definition?.sector ?? "storage",
        level: building.level,
        condition: building.condition,
        operatingCashRUSD: roundDisplay(
          index.find("building", building.id, "operating-cash")?.balanceRUSD ?? 0,
          6,
        ),
        ownerCountryId: country.id,
      };
    });
  return {
    id: country.id,
    tag: country.tag,
    name: country.name,
    demography: countryDemographySnapshot(world, country, provinceIds, definitions, build?.demography ?? null),
    currencyId: country.monetary.currencyId,
    monetaryArrangement: country.monetary.kind,
    meta:
      meta === undefined
        ? null
        : {
            historicalName: meta.historicalName,
            status: meta.status,
            sovereignCountryId: meta.sovereignCountryId,
            capitalName: meta.capitalName,
            selectable: meta.selectable,
            population1900Estimate: meta.population1900Estimate,
            confidence: meta.confidence,
            notes: meta.notes,
          },
    provinceIds: [...countryProvinceIds(world, country.id)].sort((left, right) => left - right),
    fiscal: {
      incomeTaxRate: country.fiscal.incomeTaxRate,
      incomeTaxAllowanceRUSDPerYear: country.fiscal.incomeTaxAllowanceRUSDPerYear,
      welfareBudgetRUSDPerYear: country.fiscal.welfareBudgetRUSDPerYear,
      welfareMaxWealthLevel: country.fiscal.welfareMaxWealthLevel,
      businessProfitTaxRate: country.fiscal.businessProfitTaxRate,
      reserveTargetRUSD: country.fiscal.reserveTargetRUSD,
    },
    treasuryCashRUSD: index.get("country", country.id, "treasury-cash").balanceRUSD,
    debtEnabled: country.debt.enabled,
    debtOutstandingPrincipalRUSD: debtOutstandingPrincipal(
      world.finance.debtContracts,
      country.id,
    ),
    debtInterestPayableRUSD: roundDisplay(debtInterestPayable, 6),
    debtPolicy: debtPolicySnapshot(world, country, index),
    debtContracts: debtContractSnapshots(world, country.id),
    population,
    workingAgePopulation: workingAge,
    employedWorkers,
    householdCashRUSD: roundDisplay(householdCash, 6),
    estimatedDailyWageBaseRUSD: roundDisplay(estimatedDailyWageBase, 6),
    estimatedDailyTaxableWageBaseRUSD: roundDisplay(estimatedDailyTaxableWageBase, 6),
    estimatedWageEarningBlockCount,
    businessTaxBaseMonthToDateRUSD: roundDisplay(businessTaxBaseMonthToDate, 6),
    budgetMonthToDate,
    literacy: population > 0 ? roundDisplay(weightedLiteracy / population) : 0,
    wealthLevel: population > 0 ? roundDisplay(weightedWealth / population, 2) : 0,
    militancy: population > 0 ? roundDisplay(weightedMilitancy / population) : 0,
    hardshipPopulationShare:
      population > 0 ? roundDisplay(hardshipPopulation / population) : 0,
    blocksWithUnmetSubsistence: unmetSubsistenceBlocks,
    blocksWithUnmetBasic: unmetBasicBlocks,
    buildingCount,
    productionCapacityByGood: productionCapacitySnapshots(definitions, capacity),
    latestFiscal,
    financeHistory: history,
    annualReports: annualReportSnapshots(world, country.id),
    constructionProjects: constructionProjectSnapshots(world, definitions, country.id),
    constructionHistory: constructionHistorySnapshot(world, country.id),
    constructionLabor: constructionLaborSnapshot(world, definitions, country.id, yearDays),
    constructionInProgressRUSD: roundDisplay(
      index.find("country", country.id, "construction-in-progress")?.balanceRUSD ?? 0,
      6,
    ),
    publicCapitalRUSD: roundDisplay(
      index.find("country", country.id, "public-capital")?.balanceRUSD ?? 0,
      6,
    ),
    industrialPolicy,
    publicEnterprises,
    politics: politicsSnapshot(world, country, definitions),
    technology: technologySnapshot(world, country, definitions),
    education: educationSnapshot(world, country, definitions),
    labor: laborSnapshot(world, country, definitions),
    trade: tradePolicySnapshot(world, country),
    priceIndex: countryPriceIndexSnapshot(world, country, build?.priceIndexes),
    monetary: monetarySnapshot(world, country),
    resources: countryResources(world, provinceIds),
    military: countryMilitarySnapshot(world, country),
  };
}

function tradePolicySnapshot(
  world: World,
  country: World["countries"][number],
): SnapshotTradePolicy {
  const customsMarketIds = [...world.markets]
    .filter((market) => market.customsCountryId === country.id)
    .map((market) => market.id)
    .sort((left, right) => left - right);
  return {
    tariffRates: [...country.trade.tariffRates],
    importQuotaQuantity: [...country.trade.importQuotaQuantity],
    importQuotaUsedQuantity: country.trade.importQuotaUsedQuantity.map((value) =>
      roundDisplay(value, 3),
    ),
    exportRestricted: [...country.trade.exportRestricted],
    customsMarketIds,
    lastUpdateDay: country.trade.lastUpdateDay,
    exportsValueMonthToDateRUSD: roundDisplay(
      country.trade.exportsValueMonthToDateRUSD,
      2,
    ),
    importsValueMonthToDateRUSD: roundDisplay(
      country.trade.importsValueMonthToDateRUSD,
      2,
    ),
    dutyReceivedMonthToDateRUSD: roundDisplay(
      country.trade.dutyReceivedMonthToDateRUSD,
      2,
    ),
    dutyPaidMonthToDateRUSD: roundDisplay(country.trade.dutyPaidMonthToDateRUSD, 2),
    freightPaidMonthToDateRUSD: roundDisplay(
      country.trade.freightPaidMonthToDateRUSD,
      2,
    ),
  };
}

function tradeNetworkSnapshot(
  world: World,
  definitions: EconomyDefinitions,
): SnapshotTradeNetwork {
  const goodByKey = new Map(definitions.goods.map((good) => [good.id, good]));
  const infrastructureByMarket = new Map<number, number>();
  for (const market of world.markets) {
    infrastructureByMarket.set(market.id, marketInfrastructureQuality(world, market));
  }
  const routes = [...world.trade.routes]
    .sort((left, right) => left.id - right.id)
    .map((route) => ({
      id: route.id,
      marketAId: route.marketAId,
      marketBId: route.marketBId,
      distanceUnits: route.distanceUnits,
      transitDays: transitDays(route),
      baseCapacityRUSDPerDay: route.baseCapacityRUSDPerDay,
      capacityRUSDPerDay: roundDisplay(
        routeCapacityRUSDPerDay(
          route,
          infrastructureByMarket.get(route.marketAId) ?? 0,
          infrastructureByMarket.get(route.marketBId) ?? 0,
        ),
        2,
      ),
    }));
  const sortedShipments = [...world.trade.shipments].sort((left, right) => left.id - right.id);
  const retained = sortedShipments.slice(-MAX_SNAPSHOT_TRADE_SHIPMENTS);
  const shipments = retained.map((shipment) => ({
    id: shipment.id,
    goodId: shipment.goodId,
    goodKey: goodByKey.get(shipment.goodId)?.key ?? String(shipment.goodId),
    quantity: roundDisplay(shipment.quantity, 3),
    sellerBuildingId: shipment.sellerBuildingId,
    originMarketId: shipment.originMarketId,
    destinationMarketId: shipment.destinationMarketId,
    originCountryId: shipment.originCountryId,
    destinationCountryId: shipment.destinationCountryId,
    dispatchDay: shipment.dispatchDay,
    arrivalDay: shipment.arrivalDay,
    cargoValueRUSD: roundDisplay(shipment.cargoValueRUSD, 2),
    freightCostRUSD: roundDisplay(shipment.freightCostRUSD, 2),
    dutyRUSD: roundDisplay(shipment.dutyRUSD, 2),
    dutyRate: shipment.dutyRate,
  }));
  const lastDay = world.trade.lastDay;
  const blocked = (lastDay?.blocked ?? []).slice(0, MAX_SNAPSHOT_TRADE_BLOCKED).map((entry) => ({
    originMarketId: entry.originMarketId,
    destinationMarketId: entry.destinationMarketId,
    goodId: entry.goodId,
    goodKey: goodByKey.get(entry.goodId)?.key ?? String(entry.goodId),
    reason: entry.reason,
  }));
  return {
    enabled: world.trade.enabled,
    routes,
    shipments,
    inTransitShipmentCount: sortedShipments.length,
    shipmentsTruncated: sortedShipments.length > shipments.length,
    lastDay:
      lastDay === null
        ? null
        : {
            dayIndex: lastDay.dayIndex,
            dispatchedShipments: lastDay.dispatchedShipments,
            arrivedShipments: lastDay.arrivedShipments,
            freightPaidRUSD: roundDisplay(lastDay.freightPaidRUSD, 2),
            dutyPaidRUSD: roundDisplay(lastDay.dutyPaidRUSD, 2),
            ownerFundedRUSD: roundDisplay(lastDay.ownerFundedRUSD, 2),
            blocked,
            blockedTruncated: (lastDay.blocked.length ?? 0) > blocked.length,
          },
  };
}

function marketPopulations(world: World): Map<number, number> {
  const byProvince = new Map<number, number>();
  for (const block of world.popBlocks) {
    byProvince.set(block.provinceId, (byProvince.get(block.provinceId) ?? 0) + populationTotal(block));
  }
  const byMarket = new Map<number, number>();
  for (const market of world.markets) {
    let population = 0;
    for (const provinceId of marketProvinceIds(world, market.id)) population += byProvince.get(provinceId) ?? 0;
    byMarket.set(market.id, population);
  }
  return byMarket;
}

function priceIndexSnapshot(
  world: World,
  definitions: EconomyDefinitions,
  values: ReturnType<typeof derivePriceIndexes> = derivePriceIndexes(world),
): SnapshotPriceIndex {
  const goodById = new Map(definitions.goods.map((good) => [good.id, good]));
  const populations = marketPopulations(world);
  let coverageWeighted = 0;
  let populationTotalAll = 0;
  for (const market of world.markets) {
    const population = populations.get(market.id) ?? 0;
    coverageWeighted += priceIndexCoverage(world, market.id) * population;
    populationTotalAll += population;
  }
  const coverage =
    populationTotalAll > 0
      ? coverageWeighted / populationTotalAll
      : world.markets.length > 0
        ? world.markets.reduce((total, market) => total + priceIndexCoverage(world, market.id), 0) /
          world.markets.length
        : 0;
  return {
    baseDayIndex: world.startDayIndex,
    basket: [...world.priceIndex.basket]
      .sort((left, right) => left.goodId - right.goodId)
      .map((item) => ({
        goodId: item.goodId,
        goodKey: goodById.get(item.goodId)?.key ?? String(item.goodId),
        goodName: goodById.get(item.goodId)?.name ?? String(item.goodId),
        weight: item.weight,
      })),
    worldValue: roundDisplay(values.world, 4),
    coverage: roundDisplay(coverage, 4),
    observations: world.priceIndex.observations.map((observation) => ({
      year: observation.year,
      month: observation.month,
      dayIndex: observation.dayIndex,
      world: roundDisplay(observation.world, 4),
    })),
    monthOnMonthInflation: roundOptional(priceIndexInflation(world, null, 1)),
    yearOnYearInflation: roundOptional(priceIndexInflation(world, null, 12)),
  };
}

function roundOptional(value: number | null): number | null {
  return value === null ? null : roundDisplay(value, 6);
}

function countryPriceIndexSnapshot(
  world: World,
  country: World["countries"][number],
  values: ReturnType<typeof derivePriceIndexes> = derivePriceIndexes(world),
): SnapshotCountryPriceIndex {
  const coverageWeighted = countryProvinceIds(world, country.id).reduce((total, provinceId) => {
    const marketId = world.provinceEconomies.find((province) => province.id === provinceId)?.marketId;
    return total + (marketId === null || marketId === undefined ? 0 : priceIndexCoverage(world, marketId));
  }, 0);
  const provinceCount = Math.max(1, countryProvinceIds(world, country.id).length);
  return {
    baseDayIndex: world.startDayIndex,
    value: roundDisplay(values.countries.get(country.id) ?? 100, 4),
    coverage: roundDisplay(coverageWeighted / provinceCount, 4),
    monthOnMonthInflation: roundOptional(priceIndexInflation(world, country.id, 1)),
    yearOnYearInflation: roundOptional(priceIndexInflation(world, country.id, 12)),
  };
}

/**
 * P3 (D-141): closing valuations of the ledger window and the mean month-end valuation of
 * every closed year with an annual report. Means are arithmetic over the year's closed
 * months in which the currency was specified. Reads closed summaries only.
 */
function valuationHistorySnapshot(world: World): SnapshotValuationHistory {
  const summaries = world.finance.periodSummaries;
  const months: SnapshotValuationMonth[] = summaries
    .slice(-MAX_SNAPSHOT_LEDGER_MONTHS)
    .map((summary) => {
      const rusdPerUnit: Record<number, number> = {};
      for (const entry of summary.closingValuations ?? []) rusdPerUnit[entry.currencyId] = entry.rusdPerUnit;
      return { periodEndDay: summary.periodEndDay, rusdPerUnit };
    });
  const reportYears = new Set(
    world.finance.annualSummaries.slice(-MAX_SNAPSHOT_ANNUAL_REPORTS).map((summary) => summary.year),
  );
  const sums = new Map<number, Map<number, { total: number; count: number }>>();
  for (const summary of summaries) {
    const year = dayIndexToCivilDate(summary.periodEndDay).year;
    if (!reportYears.has(year)) continue;
    let byCurrency = sums.get(year);
    if (byCurrency === undefined) {
      byCurrency = new Map();
      sums.set(year, byCurrency);
    }
    for (const entry of summary.closingValuations ?? []) {
      const sum = byCurrency.get(entry.currencyId) ?? { total: 0, count: 0 };
      sum.total += entry.rusdPerUnit;
      sum.count += 1;
      byCurrency.set(entry.currencyId, sum);
    }
  }
  const years: SnapshotValuationYear[] = [...sums.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([year, byCurrency]) => {
      const meanRusdPerUnit: Record<number, number> = {};
      for (const [currencyId, sum] of byCurrency) meanRusdPerUnit[currencyId] = sum.total / sum.count;
      return { year, meanRusdPerUnit };
    });
  return { months, years };
}

function currenciesSnapshot(world: World): readonly SnapshotCurrency[] {
  return [...world.currencies]
    .sort((left, right) => left.id - right.id)
    .map((currency) => {
      const valuation = world.currencyValuations.find(
        (entry) => entry.currencyId === currency.id,
      );
      return {
        id: currency.id,
        key: currency.key,
        name: currency.name,
        issuerKind: currency.issuer.kind,
        issuerCountryId:
          currency.issuer.kind === "country" ? currency.issuer.countryId : null,
        valuationStatus:
          valuation === undefined || valuation.status === "unavailable"
            ? "unavailable"
            : "specified",
        rusdPerUnit:
          valuation !== undefined && valuation.status === "specified"
            ? valuation.rusdPerUnit
            : null,
        valuationSource:
          valuation !== undefined && valuation.status === "specified"
            ? valuation.source
            : null,
      };
    });
}

/** P5b: discovered deposits of the country's provinces, summed by resource. */
function countryResources(
  world: World,
  provinceIds: ReadonlySet<number>,
): CountrySnapshot["resources"] {
  const byResource = new Map<string, { remaining: number; extracted: number }>();
  for (const deposit of world.resources.deposits) {
    if (!deposit.discovered || !provinceIds.has(deposit.provinceId)) continue;
    const entry = byResource.get(deposit.resource) ?? { remaining: 0, extracted: 0 };
    entry.remaining += deposit.initialStock - deposit.extracted;
    entry.extracted += deposit.extracted;
    byResource.set(deposit.resource, entry);
  }
  return RESOURCE_KINDS.filter((resource) => byResource.has(resource)).map((resource) => ({
    resource,
    unit: RESOURCE_UNITS[resource],
    remaining: roundDisplay(byResource.get(resource)!.remaining, 3),
    extracted: roundDisplay(byResource.get(resource)!.extracted, 3),
  }));
}

function monetarySnapshot(
  world: World,
  country: World["countries"][number],
): SnapshotMonetaryAuthority {
  const record = monetaryCurrencyForCountry(world, country.id);
  if (record === null) {
    return {
      hasAuthority: false,
      active: false,
      regime: "pegged",
      parityRusdPerUnit: null,
      valuationRusdPerUnit: null,
      reserveCashRUSD: 0,
      currencyIssuedUnits: 0,
      liabilityRUSD: 0,
      reserveCoverMonths: null,
      convertibility: "no-authority",
      lastParityChangeDay: null,
      lastMonthExportsRUSD: 0,
      lastMonthImportsRUSD: 0,
      blockedReason:
        country.monetary.kind !== "own"
          ? "adopted-or-shared-currency"
          : "monetary-system-disabled",
      standard: "paper",
      fineGramsPerUnit: 0,
      metalReserveKg: 0,
      metalReserveValueRUSD: 0,
      mintPriceRUSDPerKg: null,
    };
  }
  const valuation = world.currencyValuations.find(
    (entry) => entry.currencyId === record.currencyId,
  );
  const state = convertibilityState(world, country.id);
  const coverMonths = authorityReserveCoverMonths(world, record);
  return {
    hasAuthority: true,
    active: record.active,
    regime: record.regime,
    parityRusdPerUnit: record.parityRusdPerUnit,
    valuationRusdPerUnit:
      valuation !== undefined && valuation.status === "specified"
        ? valuation.rusdPerUnit
        : null,
    reserveCashRUSD: roundDisplay(authorityReservesRUSD(world, record), 2),
    currencyIssuedUnits: roundDisplay(record.currencyIssuedUnits, 3),
    liabilityRUSD: roundDisplay(authorityLiabilityRUSD(world, record), 2),
    reserveCoverMonths: Number.isFinite(coverMonths) ? roundDisplay(coverMonths, 2) : null,
    convertibility: state.state,
    lastParityChangeDay: record.lastParityChangeDay,
    lastMonthExportsRUSD: roundDisplay(record.lastMonthExportsRUSD, 2),
    lastMonthImportsRUSD: roundDisplay(record.lastMonthImportsRUSD, 2),
    blockedReason: record.active
      ? null
      : record.parityRusdPerUnit === null
        ? "no-declared-parity"
        : "not-established",
    standard: record.standard,
    fineGramsPerUnit: roundDisplay(record.fineGramsPerUnit, 6),
    metalReserveKg: roundDisplay(record.metalReserveKg, 3),
    metalReserveValueRUSD: roundDisplay(
      world.finance.accounts.find((account) => account.id === record.metalReserveAccountId)?.balanceRUSD ?? 0,
      2,
    ),
    mintPriceRUSDPerKg: record.standard === "paper" ? null : roundDisplay(mintPriceRUSDPerKg(record), 2),
  };
}

function armySnapshot(army: World["military"]["armies"][number]): SnapshotArmy {
  return {
    id: army.id,
    countryId: army.countryId,
    provinceId: army.provinceId,
    personnel: army.personnel,
    equipmentUnits: army.equipmentUnits,
    organization: roundDisplay(army.organization, 4),
    supply: roundDisplay(army.supply, 4),
    wounded: army.wounded,
    deaths: army.deaths,
    captured: army.captured,
    readyDay: army.readyDay,
    destinationProvinceId: army.destinationProvinceId,
    arrivalDay: army.arrivalDay,
  };
}

function countryMilitarySnapshot(
  world: World,
  country: World["countries"][number],
): CountrySnapshot["military"] {
  const armies = armiesOfCountry(world, country.id)
    .sort((left, right) => left.id - right.id)
    .map(armySnapshot);
  // Deaths and captures are cumulative and live in the authoritative casualty
  // record, not in the surviving roster: a destroyed formation is removed from
  // `world.military.armies`, and its losses must not disappear from the country
  // total. `wounded` remains the current roster count (wounded personnel return
  // to the roster after recovery), so it is deliberately not summed with the
  // cumulative `woundedReturned` memo.
  const casualtyRecord = world.military.casualties.find(
    (entry) => entry.countryId === country.id,
  );
  const deaths = casualtyRecord?.deaths ?? 0;
  const captured = casualtyRecord?.captured ?? 0;
  let wounded = 0;
  for (const army of world.military.armies) {
    if (army.countryId !== country.id) continue;
    wounded += army.wounded;
  }
  const relations = world.countries
    .filter((other) => other.id !== country.id)
    .sort((left, right) => left.id - right.id)
    .map((other) => {
      const relation = relationBetween(world, country.id, other.id);
      const war = activeWarBetween(world, country.id, other.id);
      return {
        countryId: other.id,
        score: relation === undefined ? 0 : roundDisplay(relation.score, 2),
        truceUntilDay: relation?.truceUntilDay ?? null,
        atWar: war !== null,
        warId: war?.id ?? null,
      };
    });
  const occupiedProvinceIds = world.provinces.ownership
    .filter((entry) => entry.controllerPolityId === country.id && entry.ownerPolityId !== country.id)
    .map((entry) => entry.provinceId)
    .sort((left, right) => left - right);
  return {
    armies,
    deaths,
    wounded,
    captured,
    relations,
    occupiedProvinceIds,
    controlledProvinceIds: [...occupiedProvinceIds],
  };
}

function militarySnapshot(world: World): SimulationSnapshot["military"] {
  const personnelByCountry = new Map<number, number>();
  for (const army of world.military.armies) {
    personnelByCountry.set(
      army.countryId,
      (personnelByCountry.get(army.countryId) ?? 0) + army.personnel,
    );
  }
  return {
    enabled: world.military.enabled,
    wars: [...world.military.wars]
      .sort((left, right) => left.id - right.id)
      .map((war) => ({
        id: war.id,
        attackerCountryId: war.attackerCountryId,
        defenderCountryId: war.defenderCountryId,
        casusBelli: war.casusBelli,
        startedDay: war.startedDay,
        endedDay: war.endedDay,
        truceUntilDay: war.truceUntilDay,
        attackerPersonnel: personnelByCountry.get(war.attackerCountryId) ?? 0,
        defenderPersonnel: personnelByCountry.get(war.defenderCountryId) ?? 0,
      })),
    peaceOffers: [...world.military.peaceOffers]
      .sort((left, right) => left.id - right.id)
      .map((offer) => ({ ...offer })),
    armies: [...world.military.armies]
      .sort((left, right) => left.id - right.id)
      .map(armySnapshot),
    occupations: world.provinces.ownership
      .filter((entry) => entry.controllerPolityId !== entry.ownerPolityId)
      .sort((left, right) => left.provinceId - right.provinceId)
      .map((entry) => ({
        provinceId: entry.provinceId,
        sovereignCountryId: provinceSovereignCountryId(world, entry.provinceId),
        controllerCountryId: entry.controllerPolityId,
        occupiedSinceDay: entry.controlledSinceDay,
      })),
  };
}

/** P2 per-province population and economy (D-118), one pass over blocks and buildings. */
function provinceEconomySnapshots(
  world: World,
  territoryMeta: readonly TerritoryMetaDef[],
): readonly ProvinceEconomySnapshot[] {
  const urbanPeople = new Map<number, number>();
  const ownerByProvince = buildProvinceOwnerMap(world);
  const ownershipById = new Map(world.provinces.ownership.map((entry) => [entry.provinceId, entry]));
  const territoryByProvince = new Map<number, string>();
  for (const meta of territoryMeta) {
    for (const provinceId of meta.provinceIds) territoryByProvince.set(provinceId, meta.polityTag);
  }
  const population = new Map<number, number>();
  const byProfession = new Map<number, Record<string, number>>();
  const literacyWeighted = new Map<number, number>();
  const adults = new Map<number, number>();
  for (const block of world.popBlocks) {
    const count = populationTotal(block);
    population.set(block.provinceId, (population.get(block.provinceId) ?? 0) + count);
    urbanPeople.set(block.provinceId, (urbanPeople.get(block.provinceId) ?? 0) + count * block.urbanShare);
    const record = byProfession.get(block.provinceId) ?? {};
    if (count > 0) record[String(block.professionId)] = (record[String(block.professionId)] ?? 0) + count;
    byProfession.set(block.provinceId, record);
    let adult = 0;
    for (let age = 15; age < block.maleByAge.length; age += 1) {
      adult += (block.maleByAge[age] ?? 0) + (block.femaleByAge[age] ?? 0);
    }
    adults.set(block.provinceId, (adults.get(block.provinceId) ?? 0) + adult);
    literacyWeighted.set(block.provinceId, (literacyWeighted.get(block.provinceId) ?? 0) + block.literacy * adult);
  }
  const levels = new Map<number, number>();
  const buildingProvince = new Map<number, number>();
  for (const building of world.buildings) {
    buildingProvince.set(building.id, building.provinceId);
    levels.set(building.provinceId, (levels.get(building.provinceId) ?? 0) + building.level);
  }
  const employed = new Map<number, number>();
  for (const assignment of world.employment) {
    const provinceId = buildingProvince.get(assignment.buildingInstanceId);
    if (provinceId === undefined) continue;
    employed.set(provinceId, (employed.get(provinceId) ?? 0) + assignment.workers);
  }
  return [...world.provinceEconomies]
    .sort((left, right) => left.id - right.id)
    .map((province) => {
      const ownership = ownershipById.get(province.id);
      const controlled =
        ownership !== undefined && ownership.controllerPolityId !== ownership.ownerPolityId;
      const adultCount = adults.get(province.id) ?? 0;
      return {
        id: province.id,
        countryId: ownerByProvince.get(province.id) ?? null,
        marketId: province.marketId,
        population: population.get(province.id) ?? 0,
        populationByProfession: byProfession.get(province.id) ?? {},
        buildingCount: province.buildingInstanceIds.length,
        buildingLevels: levels.get(province.id) ?? 0,
        employedWorkers: employed.get(province.id) ?? 0,
        unrest: roundDisplay(province.unrest, 4),
        infrastructure: roundDisplay(province.infrastructure, 4),
        // P4: the current urban share of the province's people (block state).
        urbanShare:
          (population.get(province.id) ?? 0) > 0
            ? roundDisplay((urbanPeople.get(province.id) ?? 0) / (population.get(province.id) ?? 1), 4)
            : province.urbanShare,
        arableLandHa: province.arableLandHa,
        pastureHa: province.pastureHa,
        literacy: adultCount > 0 ? roundDisplay((literacyWeighted.get(province.id) ?? 0) / adultCount, 4) : 0,
        controllerCountryId: controlled ? ownership.controllerPolityId : null,
        controlledSinceDay: controlled ? ownership.controlledSinceDay : null,
        territoryTag: territoryByProvince.get(province.id) ?? null,
        harvestFactor: provinceHarvestFactor(world, province),
      };
    });
}

/** P5 (D-143): attach the focused province's land section. */
function withLand(
  focus: Omit<FocusProvinceSnapshot, "land"> | null,
  world: World,
  definitions: EconomyDefinitions,
  populationDefinitions: PopulationDefinitions | undefined,
): FocusProvinceSnapshot | null {
  if (focus === null) return null;
  return { ...focus, land: provinceLandSnapshot(world, definitions, populationDefinitions, focus.provinceId) };
}



function territorySnapshots(territoryMeta: readonly TerritoryMetaDef[]): readonly TerritorySnapshot[] {
  return [...territoryMeta]
    .sort((left, right) => (left.polityTag < right.polityTag ? -1 : left.polityTag > right.polityTag ? 1 : 0))
    .map((meta) => ({
      polityTag: meta.polityTag,
      provinceIds: [...meta.provinceIds],
      historicalName: meta.historicalName,
      status: meta.status,
      sovereignCountryId: meta.sovereignCountryId,
      capitalName: meta.capitalName,
      confidence: meta.confidence,
      notes: meta.notes,
    }));
}

/**
 * M12a: expose only mutable provincial political state. Static province names,
 * grouping metadata and geometry stay in the committed app content, so the
 * snapshot does not grow with historical strings.
 */
function provinceSnapshots(world: World): readonly ProvinceOwnershipSnapshot[] {
  return [...world.provinces.ownership]
    .sort((left, right) => left.provinceId - right.provinceId)
    .map((entry) => ({
      provinceId: entry.provinceId,
      ownerPolityId: entry.ownerPolityId,
      controllerPolityId: entry.controllerPolityId,
      controlledSinceDay: entry.controlledSinceDay,
      claimantPolityIds: [...entry.claimantPolityIds],
      specialStatus: entry.specialStatus,
    }));
}

function goodsSnapshots(definitions: EconomyDefinitions): readonly GoodSnapshot[] {
  return [...definitions.goods]
    .sort((left, right) => left.id - right.id)
    .map((good) => ({
      id: good.id,
      key: good.key,
      name: good.name,
      unitLabel: good.unitLabel,
      category: good.category,
      group: good.group ?? null,
      storable: good.storable !== false,
      tradeable: good.tradeable !== false,
    }));
}

function marketSnapshots(
  world: World,
  definitions: EconomyDefinitions,
  capacityByMarket: CapacityMaps["byMarket"],
  marketMeta: ReadonlyMap<number, MarketMetaDef>,
  /** Protocol 22: markets with prices; null = every market, every good (legacy). */
  fullMarketIds: ReadonlySet<number> | null,
): readonly MarketSnapshot[] {
  const goods = [...definitions.goods].sort((left, right) => left.id - right.id);
  const countryByProvince = new Map<number, number>();
  for (const country of world.countries) {
    for (const provinceId of countryProvinceIds(world, country.id)) countryByProvince.set(provinceId, country.id);
  }
  const countryName = new Map(world.countries.map((country) => [country.id, country.name]));
  return [...world.markets]
    .sort((left, right) => left.id - right.id)
    .map((market) => {
      const stockByGood = new Map<number, number>();
      for (const lot of market.stockLots) {
        stockByGood.set(lot.goodId, (stockByGood.get(lot.goodId) ?? 0) + lot.quantity);
      }
      const capacity = capacityByMarket.get(market.id);
      const memberCountryIds = new Set<number>();
      for (const provinceId of marketProvinceIds(world, market.id)) {
        const countryId = countryByProvince.get(provinceId);
        if (countryId !== undefined) memberCountryIds.add(countryId);
      }
      const members = [...memberCountryIds].sort((left, right) => left - right);
      const meta = marketMeta.get(market.id);
      // A market is never presented as "Market N". Without authored metadata the
      // name is derived from the member countries, and the numeric id stays a
      // secondary diagnostic only.
      const memberNames = members
        .map((id) => countryName.get(id) ?? `Country ${String(id)}`)
        .filter((name) => name.length > 0);
      const derivedName =
        memberNames.length === 0
          ? "Unnamed trade area"
          : memberNames.length === 1
            ? `${memberNames[0]} national market`
            : `${memberNames[0]} and ${String(memberNames.length - 1)} other${memberNames.length === 2 ? "" : "s"} market`;
      return {
        id: market.id,
        label: meta?.name ?? derivedName,
        name: meta?.name ?? derivedName,
        description:
          meta?.description ??
          `Trade area covering ${String(members.length)} ${members.length === 1 ? "country" : "countries"}.`,
        kind: meta?.kind ?? "unspecified",
        provinceIds: [...marketProvinceIds(world, market.id)].sort((left, right) => left - right),
        memberCountryIds: members,
        detail: fullMarketIds === null || fullMarketIds.has(market.id) ? ("full" as const) : ("summary" as const),
        prices:
          fullMarketIds !== null && !fullMarketIds.has(market.id)
            ? []
            : goods
                .map((good) => ({
                  goodId: good.id,
                  priceRUSD: market.priceRUSD[good.id] ?? 0,
                  stockQuantity: stockByGood.get(good.id) ?? 0,
                  dailyProductionCapacity: roundDisplay(capacity?.get(good.id) ?? 0, 3),
                }))
                // Only goods present here (bounded snapshots); legacy lists every good.
                .filter((row) => fullMarketIds === null || row.stockQuantity > 0 || row.dailyProductionCapacity > 0),
        customsCountryId: market.customsCountryId,
        infrastructure: roundDisplay(marketInfrastructureQuality(world, market), 3),
      };
    });
}

/**
 * Compact per-country records. These carry the map/list identity and headline
 * indicators for every country; full detail is bounded to the player and focus
 * countries. Values use the same aggregate definitions as `countrySnapshot`.
 */
function countrySummarySnapshots(
  world: World,
  countryMeta: ReadonlyMap<number, CountryMetaDef>,
  index: ReturnType<typeof buildFinanceIndex>,
  playerCountryId: number | null,
  focusCountryId: number | null,
): readonly CountrySummarySnapshot[] {
  const provinceIdsByCountry = new Map<number, Set<number>>();
  const marketIdsByProvince = new Map(world.provinceEconomies.map((province) => [province.id, province.marketId]));
  for (const country of world.countries) {
    provinceIdsByCountry.set(country.id, new Set(countryProvinceIds(world, country.id)));
  }
  // D-137: the countries owning each province once, so blocks and assignments are
  // attributed in one pass (was a test of every country for each). Each country's
  // blocks and employment keep `world.popBlocks` / `world.employment` order.
  const ownersByProvince = new Map<number, number[]>();
  for (const country of world.countries) {
    for (const provinceId of provinceIdsByCountry.get(country.id) ?? []) {
      const owners = ownersByProvince.get(provinceId);
      if (owners === undefined) ownersByProvince.set(provinceId, [country.id]);
      else if (!owners.includes(country.id)) owners.push(country.id);
    }
  }
  const blocksByCountry = new Map<number, World["popBlocks"][number][]>();
  for (const block of world.popBlocks) {
    for (const countryId of ownersByProvince.get(block.provinceId) ?? []) {
      const list = blocksByCountry.get(countryId) ?? [];
      list.push(block);
      blocksByCountry.set(countryId, list);
    }
  }
  const employedByCountry = new Map<number, number>();
  const buildingById = new Map(world.buildings.map((building) => [building.id, building]));
  for (const assignment of world.employment) {
    const building = buildingById.get(assignment.buildingInstanceId);
    if (building === undefined) continue;
    for (const countryId of ownersByProvince.get(building.provinceId) ?? []) {
      employedByCountry.set(countryId, (employedByCountry.get(countryId) ?? 0) + assignment.workers);
    }
  }
  const lastPeriod =
    world.finance.periodSummaries.length === 0
      ? null
      : world.finance.periodSummaries[world.finance.periodSummaries.length - 1];
  return [...world.countries]
    .sort((left, right) => left.id - right.id)
    .map((country) => {
      const meta = countryMeta.get(country.id);
      const blocks = blocksByCountry.get(country.id) ?? [];
      let population = 0;
      let workingAge = 0;
      let hardshipPopulation = 0;
      let weightedLiteracy = 0;
      let weightedWealth = 0;
      let weightedMilitancy = 0;
      for (const block of blocks) {
        const blockPopulation = populationTotal(block);
        population += blockPopulation;
        workingAge += workingAgePopulation(block);
        if (block.unmetSubsistenceDays >= AI_HARDSHIP_SUBSISTENCE_DAYS) {
          hardshipPopulation += blockPopulation;
        }
        weightedLiteracy += block.literacy * blockPopulation;
        weightedWealth += block.wealthLevel * blockPopulation;
        weightedMilitancy += block.militancy * blockPopulation;
      }
      const provinceIds = [...(provinceIdsByCountry.get(country.id) ?? new Set<number>())].sort(
        (left, right) => left - right,
      );
      const marketIds = [
        ...new Set(
          provinceIds
            .map((provinceId) => marketIdsByProvince.get(provinceId))
            .filter((marketId): marketId is number => marketId !== undefined && marketId !== null),
        ),
      ].sort((left, right) => left - right);
      const armyPersonnel = armiesOfCountry(world, country.id).reduce(
        (sum, army) => sum + army.personnel,
        0,
      );
      const fiscal =
        lastPeriod == null
          ? undefined
          : lastPeriod.countryFiscalTotals?.[country.id];
      return {
        id: country.id,
        tag: country.tag,
        name: country.name,
        historicalName: meta?.historicalName ?? country.name,
        status: meta?.status ?? "independent",
        sovereignCountryId: meta?.sovereignCountryId ?? country.id,
        capitalName: meta?.capitalName ?? country.name,
        selectable: meta?.selectable ?? true,
        isPlayer: country.id === playerCountryId,
        isFocused: country.id === focusCountryId,
        provinceIds,
        marketIds,
        population,
        workingAgePopulation: workingAge,
        employedWorkers: employedByCountry.get(country.id) ?? 0,
        treasuryCashRUSD: roundDisplay(
          index.find("country", country.id, "treasury-cash")?.balanceRUSD ?? 0,
          6,
        ),
        hardshipPopulationShare: population > 0 ? hardshipPopulation / population : 0,
        literacy: population > 0 ? weightedLiteracy / population : 0,
        wealthLevel: population > 0 ? weightedWealth / population : 0,
        militancy: population > 0 ? weightedMilitancy / population : 0,
        militaryPersonnel: armyPersonnel,
        latestNetFiscalResultRUSD:
          fiscal === undefined ? null : roundDisplay(fiscal.netFiscalResultRUSD, 6),
      };
    });
}

function freezeSnapshot(snapshot: SimulationSnapshot): SimulationSnapshot {
  for (const country of snapshot.countries) {
    Object.freeze(country.fiscal);
    Object.freeze(country.provinceIds);
    Object.freeze(country.latestFiscal);
    Object.freeze(country.debtPolicy);
    for (const contract of country.debtContracts) Object.freeze(contract);
    Object.freeze(country.debtContracts);
    Object.freeze(country.budgetMonthToDate);
    for (const project of country.constructionProjects) {
      for (const material of project.materials) Object.freeze(material);
      Object.freeze(project.materials);
      Object.freeze(project);
    }
    Object.freeze(country.constructionProjects);
    Object.freeze(country.constructionHistory);
    Object.freeze(country.constructionLabor);
    for (const sector of country.industrialPolicy.sectors) Object.freeze(sector);
    Object.freeze(country.industrialPolicy.sectors);
    Object.freeze(country.industrialPolicy);
    for (const enterprise of country.publicEnterprises) Object.freeze(enterprise);
    Object.freeze(country.publicEnterprises);
    for (const entry of country.productionCapacityByGood) Object.freeze(entry);
    Object.freeze(country.productionCapacityByGood);
    for (const status of country.technology.statuses) Object.freeze(status);
    Object.freeze(country.technology.statuses);
    for (const sector of country.technology.productivityBySector) Object.freeze(sector);
    Object.freeze(country.technology.productivityBySector);
    Object.freeze(country.technology);
    Object.freeze(country.education);
    Object.freeze(country.labor);
    const politics = country.politics;
    for (const group of politics.interestGroups) Object.freeze(group);
    Object.freeze(politics.interestGroups);
    for (const option of politics.lawOptions) Object.freeze(option);
    Object.freeze(politics.lawOptions);
    for (const slot of politics.lawSlots) {
      for (const option of slot.options) Object.freeze(option);
      Object.freeze(slot.options);
      Object.freeze(slot);
    }
    Object.freeze(politics.lawSlots);
    for (const transition of politics.lawTransitions) Object.freeze(transition);
    Object.freeze(politics.lawTransitions);
    Object.freeze(politics.deferredLawSlots);
    for (const entry of politics.recentLog) Object.freeze(entry);
    Object.freeze(politics.recentLog);
    Object.freeze(politics.institution);
    Object.freeze(politics.crisis);
    if (politics.lastElection !== null) Object.freeze(politics.lastElection);
    Object.freeze(politics);
    for (const period of country.financeHistory) {
      Object.freeze(period.grossFlowTotals);
      Object.freeze(period);
    }
    Object.freeze(country.financeHistory);
    for (const report of country.annualReports) Object.freeze(report);
    Object.freeze(country.annualReports);
    Object.freeze(country.priceIndex);
    Object.freeze(country.monetary);
    Object.freeze(country);
  }
  for (const market of snapshot.markets) {
    for (const price of market.prices) Object.freeze(price);
    Object.freeze(market.prices);
    Object.freeze(market.provinceIds);
    Object.freeze(market);
  }
  for (const good of snapshot.goods) Object.freeze(good);
  for (const profession of snapshot.professions) Object.freeze(profession);
  Object.freeze(snapshot.professions);
  for (const tier of snapshot.needTiers) {
    for (const good of tier.goods) Object.freeze(good);
    Object.freeze(tier.goods);
    Object.freeze(tier);
  }
  Object.freeze(snapshot.needTiers);
  for (const projectType of snapshot.projectTypes) {
    for (const output of projectType.outputs) Object.freeze(output);
    Object.freeze(projectType.outputs);
    for (const material of projectType.materials) Object.freeze(material);
    Object.freeze(projectType.materials);
    Object.freeze(projectType);
  }
  Object.freeze(snapshot.projectTypes);
  for (const entry of snapshot.technologyCatalog) {
    Object.freeze(entry.prerequisites);
    Object.freeze(entry.prerequisiteKeys);
    Object.freeze(entry.effects);
    Object.freeze(entry.unlockedBuildingKeys);
    Object.freeze(entry.requiredByLawKeys);
    Object.freeze(entry);
  }
  Object.freeze(snapshot.technologyCatalog);
  Object.freeze(snapshot.technologyEraNames);
  for (const route of snapshot.trade.routes) Object.freeze(route);
  Object.freeze(snapshot.trade.routes);
  for (const shipment of snapshot.trade.shipments) Object.freeze(shipment);
  Object.freeze(snapshot.trade.shipments);
  if (snapshot.trade.lastDay !== null) {
    for (const entry of snapshot.trade.lastDay.blocked) Object.freeze(entry);
    Object.freeze(snapshot.trade.lastDay.blocked);
    Object.freeze(snapshot.trade.lastDay);
  }
  Object.freeze(snapshot.trade);
  Object.freeze(snapshot.priceIndex.basket);
  for (const item of snapshot.priceIndex.basket) Object.freeze(item);
  for (const observation of snapshot.priceIndex.observations) Object.freeze(observation);
  Object.freeze(snapshot.priceIndex.observations);
  Object.freeze(snapshot.priceIndex);
  for (const currency of snapshot.currencies) Object.freeze(currency);
  Object.freeze(snapshot.currencies);
  for (const month of snapshot.valuationHistory.months) {
    Object.freeze(month.rusdPerUnit);
    Object.freeze(month);
  }
  for (const year of snapshot.valuationHistory.years) {
    Object.freeze(year.meanRusdPerUnit);
    Object.freeze(year);
  }
  Object.freeze(snapshot.valuationHistory.months);
  Object.freeze(snapshot.valuationHistory.years);
  Object.freeze(snapshot.valuationHistory);
  for (const war of snapshot.military.wars) Object.freeze(war);
  Object.freeze(snapshot.military.wars);
  for (const offer of snapshot.military.peaceOffers) Object.freeze(offer);
  Object.freeze(snapshot.military.peaceOffers);
  for (const army of snapshot.military.armies) Object.freeze(army);
  Object.freeze(snapshot.military.armies);
  for (const occupation of snapshot.military.occupations) Object.freeze(occupation);
  Object.freeze(snapshot.military.occupations);
  Object.freeze(snapshot.military);
  Object.freeze(snapshot.diagnostics.recentWarnings);
  Object.freeze(snapshot.diagnostics);
  Object.freeze(snapshot.date);
  for (const summary of snapshot.countrySummaries) {
    Object.freeze(summary.provinceIds);
    Object.freeze(summary.marketIds);
    Object.freeze(summary);
  }
  Object.freeze(snapshot.countrySummaries);
  for (const column of Object.values(snapshot.provinceTable)) {
    if (Array.isArray(column)) {
      for (const entry of column) if (Array.isArray(entry)) Object.freeze(entry);
      Object.freeze(column);
    }
  }
  Object.freeze(snapshot.provinceTable);
  for (const territory of snapshot.territories) {
    Object.freeze(territory.provinceIds);
    Object.freeze(territory);
  }
  Object.freeze(snapshot.territories);
  for (const market of snapshot.markets) {
    Object.freeze(market.provinceIds);
    Object.freeze(market.memberCountryIds);
  }
  Object.freeze(snapshot.countries);
  Object.freeze(snapshot.provinceOwnership.ids);
  Object.freeze(snapshot.provinceOwnership.owners);
  for (const row of snapshot.provinceOwnership.exceptions) {
    Object.freeze(row.claimantPolityIds);
    Object.freeze(row);
  }
  Object.freeze(snapshot.provinceOwnership.exceptions);
  Object.freeze(snapshot.provinceOwnership);
  Object.freeze(snapshot.markets);
  Object.freeze(snapshot.goods);
  return Object.freeze(snapshot);
}

/** Build a complete immutable UI snapshot. */
export function buildSimulationSnapshot(
  world: World,
  definitions: EconomyDefinitions,
  runtime: SnapshotRuntimeState,
  populationDefinitions?: PopulationDefinitions,
  /** Host presentation cache (D-137); a fresh one when omitted. */
  cache: SnapshotCache = createSnapshotCache(),
): SimulationSnapshot {
  const build: SnapshotBuild = {
    cache,
    priceIndexes: derivePriceIndexes(world),
    demography: demographySnapshotContext(world, definitions, populationDefinitions),
  };
  const territoryMeta = runtime.territoryMeta ?? [];
  if (
    cache.staticFor === null ||
    cache.staticFor.definitions !== definitions ||
    cache.staticFor.populationDefinitions !== populationDefinitions ||
    cache.staticFor.territoryMeta !== territoryMeta
  ) {
    cache.staticFor = {
      definitions,
      populationDefinitions,
      territoryMeta,
      sections: {
        goods: goodsSnapshots(definitions),
        professions: [...definitions.professions]
          .sort((left, right) => left.id - right.id)
          .map((profession) => ({ id: profession.id, key: profession.key, name: profession.name })),
        needTiers: needTierSnapshots(populationDefinitions, definitions),
        projectTypes: projectTypeSnapshots(definitions),
        technologyEraNames: [...(definitions.technology?.eraNames ?? [])],
        technologyCatalog: technologyCatalogSnapshot(definitions),
        territories: territorySnapshots(territoryMeta),
      },
    };
  }
  const staticSections = cache.staticFor.sections;
  const civil = dayIndexToCivilDate(world.dayIndex);
  const index = buildFinanceIndex(world.finance);
  const capacities = productionCapacities(world, definitions);
  const countryMetaById = new Map(
    (runtime.countryMeta ?? []).map((meta) => [meta.countryId, meta] as const),
  );
  const marketMetaById = new Map(
    (runtime.marketMeta ?? []).map((meta) => [meta.marketId, meta] as const),
  );
  const playerCountryId = world.playerCountryId;
  let focusCountryId = runtime.focusCountryId ?? null;
  if (
    focusCountryId !== null &&
    !world.countries.some((country) => country.id === focusCountryId)
  ) {
    focusCountryId = null;
  }
  // M11 bounds full country detail to the player and focus countries. Legacy
  // scenarios without static metadata keep the pre-M11 "all countries" behavior
  // used by existing fixtures and tests.
  const boundedDetail = (runtime.countryMeta?.length ?? 0) > 0;
  // Protocol 22 (plan §6): market prices for the player's markets, the focus country's
  // and the focused market only; every market and good in legacy scenarios.
  let fullMarketIds: Set<number> | null = null;
  if (boundedDetail) {
    fullMarketIds = new Set<number>();
    const marketOfProvince = new Map(world.provinceEconomies.map((province) => [province.id, province.marketId]));
    for (const countryId of [playerCountryId, focusCountryId]) {
      if (countryId === null) continue;
      for (const provinceId of countryProvinceIds(world, countryId)) {
        const marketId = marketOfProvince.get(provinceId);
        if (marketId !== null && marketId !== undefined) fullMarketIds.add(marketId);
      }
    }
    const focusMarketId = runtime.focusMarketId ?? null;
    if (focusMarketId !== null && world.markets.some((market) => market.id === focusMarketId)) fullMarketIds.add(focusMarketId);
  }
  const detailCountryIds = new Set<number>();
  if (boundedDetail) {
    if (playerCountryId !== null) detailCountryIds.add(playerCountryId);
    if (focusCountryId !== null) detailCountryIds.add(focusCountryId);
  }
  const countries = [...world.countries]
    .filter((country) => !boundedDetail || detailCountryIds.has(country.id))
    .sort((left, right) => left.id - right.id)
    .map((country) => {
      const ownedProvinces = new Set(countryProvinceIds(world, country.id));
      const blockIds = new Set(
        world.popBlocks
          .filter((block) => ownedProvinces.has(block.provinceId))
          .map((block) => block.id),
      );
      return countrySnapshot(
        world,
        country,
        index,
        financeHistory(world, country, index, blockIds, cache),
        capacities.byCountry.get(country.id),
        definitions,
        countryMetaById.get(country.id),
        build,
      );
    });
  const countrySummaries = countrySummarySnapshots(
    world,
    countryMetaById,
    index,
    playerCountryId,
    focusCountryId,
  );
  const diagnostics = {
    invalidActionCount: world.diagnostics.invalidActionCount,
    invariantFailureCount: world.diagnostics.invariantFailureCount,
    recentWarnings: [...world.diagnostics.recentWarnings],
  };
  return freezeSnapshot({
    protocolVersion: PROTOCOL_VERSION,
    sequence: runtime.sequence,
    dayIndex: world.dayIndex,
    date: {
      year: civil.year,
      month: civil.month,
      day: civil.day,
      label: dateLabel(civil.year, civil.month, civil.day),
    },
    running: runtime.running,
    speedDaysPerSecond: runtime.speedDaysPerSecond,
    achievedDaysPerSecond: runtime.achievedDaysPerSecond,
    speedIsBestEffort: true,
    campaignComplete: world.dayIndex >= 36_524,
    scenarioId: world.scenarioId,
    dataVersion: world.dataVersion,
    simVersion: world.simVersion,
    playerCountryId,
    focusCountryId,
    focusProvince: withLand(
      focusProvinceSnapshot(world, runtime.focusProvinceId ?? null, build.demography),
      world,
      definitions,
      populationDefinitions,
    ),
    constructionEnabled: world.profitDistribution.enabled,
    countries,
    countrySummaries,
    provinceTable: encodeProvinceEconomyTable(
      provinceEconomySnapshots(world, runtime.territoryMeta ?? []),
      [...definitions.professions].sort((left, right) => left.id - right.id),
    ),
    territories: staticSections.territories,
    provinceOwnership: encodeProvinceOwnershipTable(provinceSnapshots(world)),
    markets: marketSnapshots(world, definitions, capacities.byMarket, marketMetaById, fullMarketIds),
    goods: staticSections.goods,
    professions: staticSections.professions,
    needTiers: staticSections.needTiers,
    projectTypes: staticSections.projectTypes,
    technologyEraNames: staticSections.technologyEraNames,
    technologyCatalog: staticSections.technologyCatalog,
    trade: tradeNetworkSnapshot(world, definitions),
    priceIndex: priceIndexSnapshot(world, definitions, build.priceIndexes),
    currencies: currenciesSnapshot(world),
    valuationHistory: valuationHistorySnapshot(world),
    military: militarySnapshot(world),
    diagnostics,
  });
}
