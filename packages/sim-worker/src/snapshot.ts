/**
 * Build the bounded, immutable UI snapshot from authoritative simulation state.
 *
 * This is the only place the worker reads the live world for presentation. The
 * resulting object contains plain data only: no typed arrays, account maps,
 * journals, or references into `World`. The app never receives the world itself.
 */

import {
  AI_HARDSHIP_SUBSISTENCE_DAYS,
  BUILDING_SECTORS,
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
  laborMinimumWageSUSDPerYear,
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
  regionSovereignCountryId,
  relationBetween,
  routeCapacitySUSDPerDay,
  transitDays,
  authorityLiabilitySUSD,
  authorityReserveCoverMonths,
  authorityReservesSUSD,
  convertibilityState,
  derivePriceIndexes,
  monetaryCurrencyForCountry,
  priceIndexCoverage,
  priceIndexInflation,
  IMPLEMENTED_LAW_SLOTS,
  INTEREST_GROUP_KEYS,
  LAW_SLOTS,
} from "@century/sim";
import type {
  CountryMetaDef,
  EconomyDefinitions,
  FinancePeriodSummary,
  MarketMetaDef,
  PopulationDefinitions,
  RegionMetaDef,
  World,
} from "@century/sim";

import {
  MAX_SNAPSHOT_ANNUAL_REPORTS,
  MAX_SNAPSHOT_LEDGER_MONTHS,
  MAX_SNAPSHOT_TRADE_BLOCKED,
  MAX_SNAPSHOT_TRADE_SHIPMENTS,
  PROTOCOL_VERSION,
  type CountrySnapshot,
  type CountrySummarySnapshot,
  type GoodSnapshot,
  type MarketSnapshot,
  type RegionSnapshot,
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
  type SnapshotMonetaryAuthority,
  type SnapshotPriceIndex,
  type SnapshotArmy,
} from "./protocol.js";

export interface SnapshotRuntimeState {
  readonly sequence: number;
  readonly running: boolean;
  readonly speedDaysPerSecond: number;
  /** Presentation-only measured throughput; never feeds simulation state. */
  readonly achievedDaysPerSecond: number;
  /** Presentation-only focused country whose full record is included. */
  readonly focusCountryId?: number | null;
  /** M11 static polity/market metadata from the scenario. */
  readonly countryMeta?: readonly CountryMetaDef[];
  readonly marketMeta?: readonly MarketMetaDef[];
  readonly regionMeta?: readonly RegionMetaDef[];
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
  const ownerByRegion = new Map<number, number>();
  for (const country of world.countries) {
    for (const regionId of country.regionIds) ownerByRegion.set(regionId, country.id);
  }
  const marketByRegion = new Map<number, number>();
  for (const region of world.regions) {
    if (region.marketId !== null) marketByRegion.set(region.id, region.marketId);
  }
  const definitionById = new Map(
    definitions.buildings.map((definition) => [definition.id, definition]),
  );
  const byCountry = new Map<number, Map<number, number>>();
  const byMarket = new Map<number, Map<number, number>>();
  for (const building of [...world.buildings].sort((left, right) => left.id - right.id)) {
    const definition = definitionById.get(building.definitionId);
    if (definition === undefined || definition.outputs.length === 0) continue;
    const capacity = computeBuildingCapacity(world, definitions, building.id);
    if (!(capacity.capacityTU > 0)) continue;
    const countryId = ownerByRegion.get(building.regionId);
    const marketId = marketByRegion.get(building.regionId);
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
): { totals: SnapshotFiscalTotals; businessTaxRevenueSUSD: number } | null {
  const totals = governmentPeriodTotals(world.finance, summary).find(
    (entry) => entry.countryId === countryId,
  );
  if (totals === undefined) return null;
  return {
    totals: {
      periodStartDay: summary.periodStartDay,
      periodEndDay: summary.periodEndDay,
      incomeTaxSUSD: roundDisplay(totals.incomeTaxRevenueSUSD, 6),
      welfareExpenseSUSD: roundDisplay(totals.welfareExpenseSUSD, 6),
      interestExpenseSUSD: roundDisplay(totals.interestExpenseSUSD, 6),
      subsidyExpenseSUSD: roundDisplay(totals.subsidyExpenseSUSD, 6),
      administrationExpenseSUSD: roundDisplay(totals.administrationExpenseSUSD ?? 0, 6),
      educationExpenseSUSD: roundDisplay(totals.educationExpenseSUSD ?? 0, 6),
      trainingExpenseSUSD: roundDisplay(totals.trainingExpenseSUSD ?? 0, 6),
      customsDutyRevenueSUSD: roundDisplay(totals.customsDutyRevenueSUSD ?? 0, 6),
      militaryExpenseSUSD: roundDisplay(totals.militaryExpenseSUSD ?? 0, 6),
      netFiscalResultSUSD: roundDisplay(totals.netFiscalResultSUSD, 6),
    },
    businessTaxRevenueSUSD: roundDisplay(totals.businessTaxRevenueSUSD, 6),
  };
}

function budgetTotalsSnapshot(
  totals: FinancePeriodSummary["countryBudgetTotals"][number],
): SnapshotBudgetTotals {
  return {
    welfareRequestedSUSD: roundDisplay(totals.welfareRequestedSUSD, 6),
    welfareShortfallSUSD: roundDisplay(totals.welfareShortfallSUSD, 6),
    businessTaxAssessedSUSD: roundDisplay(totals.businessTaxAssessedSUSD, 6),
    businessTaxUncollectedSUSD: roundDisplay(totals.businessTaxUncollectedSUSD, 6),
    debtIssuedSUSD: roundDisplay(totals.debtIssuedSUSD, 6),
    principalRepaidSUSD: roundDisplay(totals.principalRepaidSUSD, 6),
    interestPaidSUSD: roundDisplay(totals.interestPaidSUSD, 6),
    unfinancedRequirementSUSD: roundDisplay(totals.unfinancedRequirementSUSD, 6),
    constructionSpentSUSD: roundDisplay(totals.constructionSpentSUSD, 6),
    constructionWrittenOffSUSD: roundDisplay(totals.constructionWrittenOffSUSD, 6),
    constructionMaterialsSpentSUSD: roundDisplay(totals.constructionMaterialsSpentSUSD, 6),
    subsidyRequestedSUSD: roundDisplay(totals.subsidyRequestedSUSD, 6),
    subsidyShortfallSUSD: roundDisplay(totals.subsidyShortfallSUSD, 6),
    publicEnterpriseSupportSUSD: roundDisplay(totals.publicEnterpriseSupportSUSD, 6),
    administrationRequestedSUSD: roundDisplay(totals.administrationRequestedSUSD ?? 0, 6),
    administrationShortfallSUSD: roundDisplay(totals.administrationShortfallSUSD ?? 0, 6),
  };
}

function emptyBudgetTotalsSnapshot(): SnapshotBudgetTotals {
  return {
    welfareRequestedSUSD: 0,
    welfareShortfallSUSD: 0,
    businessTaxAssessedSUSD: 0,
    businessTaxUncollectedSUSD: 0,
    debtIssuedSUSD: 0,
    principalRepaidSUSD: 0,
    interestPaidSUSD: 0,
    unfinancedRequirementSUSD: 0,
    constructionSpentSUSD: 0,
    constructionWrittenOffSUSD: 0,
    constructionMaterialsSpentSUSD: 0,
    subsidyRequestedSUSD: 0,
    subsidyShortfallSUSD: 0,
    publicEnterpriseSupportSUSD: 0,
    administrationRequestedSUSD: 0,
    administrationShortfallSUSD: 0,
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
        definition.constructionCostSUSD > 0 &&
        Number.isInteger(definition.constructionWorkers) &&
        definition.constructionWorkers > 0 &&
        definition.requiredTechnologyId === null &&
        definition.resourceRequirements.length === 0,
    )
    .sort((left, right) => left.id - right.id)
    .map((definition) => ({
      definitionId: definition.id,
      key: definition.key,
      name: definition.name,
      constructionCostSUSD: roundDisplay(definition.constructionCostSUSD, 6),
      constructionWorkers: definition.constructionWorkers,
      plannedJobs: roundDisplay(constructionPlannedJobs(definition), 2),
      sector: definition.sector,
      dailyUpkeepSUSDAtLevelOne: roundDisplay(definition.dailyUpkeepSUSDAtLevelOne, 6),
      workingCapitalSUSD: roundDisplay(constructionWorkingCapital(definition), 6),
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
  const regionById = new Map(world.regions.map((region) => [region.id, region]));
  const definitionById = new Map(
    definitions.buildings.map((definition) => [definition.id, definition]),
  );
  const goods = new Map(definitions.goods.map((good) => [good.id, good]));
  const marketByRegion = new Map<number, (typeof world.markets)[number]>();
  for (const market of world.markets) {
    for (const regionId of market.regionIds) marketByRegion.set(regionId, market);
  }
  return [...world.construction.projects]
    .filter((project) => project.countryId === countryId)
    .sort((left, right) => left.id - right.id)
    .map((project) => {
      const definition = definitionById.get(project.definitionId);
      const market = marketByRegion.get(project.regionId);
      return {
        id: project.id,
        countryId: project.countryId,
        regionId: project.regionId,
        regionName: regionById.get(project.regionId)?.name ?? `Region ${String(project.regionId)}`,
        definitionId: project.definitionId,
        definitionKey: definition?.key ?? `definition-${String(project.definitionId)}`,
        definitionName: definition?.name ?? `Definition ${String(project.definitionId)}`,
        status: project.status,
        authorizedDay: project.authorizedDay,
        startedDay: project.startedDay,
        completedDay: project.completedDay,
        cancelledDay: project.cancelledDay,
        totalCostSUSD: roundDisplay(project.totalCostSUSD, 6),
        workingCapitalSUSD: roundDisplay(project.workingCapitalSUSD, 6),
        workingCapitalPaidSUSD: roundDisplay(project.workingCapitalPaidSUSD, 6),
        spentSUSD: roundDisplay(project.spentSUSD, 6),
        materialsSpentSUSD: roundDisplay(project.materialsSpentSUSD, 6),
        materials: project.materials
          .map((material) => {
            const good = goods.get(material.goodId);
            const unitPriceSUSD = market?.priceSUSD[material.goodId] ?? 0;
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
              unitPriceSUSD: roundDisplay(unitPriceSUSD, 6),
              deliveredValueSUSD: roundDisplay(
                material.deliveredQuantity * unitPriceSUSD,
                6,
              ),
            };
          })
          .sort((left, right) => left.goodId - right.goodId),
        progress: roundDisplay(constructionProjectProgress(project), 6),
        materialsProgress: roundDisplay(constructionMaterialsProgress(project), 6),
        remainingSUSD: roundDisplay(constructionProjectRemaining(project), 6),
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
    totalSpentSUSD: roundDisplay(aggregate?.totalSpentSUSD ?? 0, 6),
    totalWrittenOffSUSD: roundDisplay(aggregate?.totalWrittenOffSUSD ?? 0, 6),
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
  for (const block of [...world.popBlocks].sort((left, right) => left.id - right.id)) {
    const count = idle.get(block.id) ?? 0;
    if (count <= 0) continue;
    const profession = professions.get(block.professionId);
    if (profession === undefined) continue;
    workers += count;
    weightedWage += count * constructionDailyWage(profession, yearDays);
  }
  return {
    idleWorkers: workers,
    dailyWageSUSD: workers > 0 ? roundDisplay(weightedWage / workers, 6) : 0,
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
  const region = world.regions.find((candidate) => candidate.id === block.regionId);
  return `Pop block ${String(id)}${region === undefined ? "" : ` (${region.name})`}`;
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
  const creditorCash = Math.max(0, cashAccount?.balanceSUSD ?? 0);
  return {
    enabled: policy.enabled,
    refinanceOnMaturity: policy.refinanceOnMaturity,
    maxOutstandingPrincipalSUSD: policy.maxOutstandingPrincipalSUSD,
    creditorKind: policy.creditorKind,
    creditorId: policy.creditorId,
    creditorLabel: holderLabel(world, policy.creditorKind, policy.creditorId),
    annualCouponRate: policy.annualCouponRate,
    termDays: policy.termDays,
    arrearsGraceDays: policy.arrearsGraceDays,
    creditorCashSUSD: roundDisplay(creditorCash, 6),
    headroomSUSD: roundDisplay(
      Math.max(0, policy.maxOutstandingPrincipalSUSD - outstanding),
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
      principalSUSD: roundDisplay(contract.principalSUSD, 6),
      outstandingPrincipalSUSD: roundDisplay(contract.outstandingPrincipalSUSD, 6),
      annualCouponRate: contract.annualCouponRate,
      issueDay: contract.issueDay,
      maturityDay: contract.maturityDay,
      accruedInterestSUSD: roundDisplay(contract.accruedInterestSUSD, 6),
      status: contract.status,
    }));
}

function financeHistory(
  world: World,
  country: World["countries"][number],
  index: ReturnType<typeof buildFinanceIndex>,
  blockIds: ReadonlySet<number>,
): readonly SnapshotFinancePeriod[] {
  const summaries = world.finance.periodSummaries.slice(-MAX_SNAPSHOT_LEDGER_MONTHS);
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
    const periodFiscal = fiscalTotals(summary, country.id, world);
    if (periodFiscal === null) continue;
    const budget = summary.countryBudgetTotals[country.id];
    // A summary is compacted exactly when it retains no account trial balance;
    // compacted months keep fiscal and budget flows but no closing balances.
    const detailed = Object.keys(summary.accountTotals).length > 0;
    let treasury: number | null = null;
    let debt: number | null = null;
    let household: number | null = null;
    if (detailed) {
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
      businessTaxRevenueSUSD: periodFiscal.businessTaxRevenueSUSD,
      grossFlowTotals: { ...summary.flowTotalsByKind },
      periodStartLabel: dayLabel(summary.periodStartDay),
      periodEndLabel: dayLabel(summary.periodEndDay),
      treasuryCashEndSUSD: treasury,
      debtOutstandingEndSUSD: debt,
      householdCashEndSUSD: household,
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
        incomeTaxSUSD: roundDisplay(totals?.incomeTaxRevenueSUSD ?? 0, 6),
        businessTaxRevenueSUSD: roundDisplay(totals?.businessTaxRevenueSUSD ?? 0, 6),
        welfareExpenseSUSD: roundDisplay(totals?.welfareExpenseSUSD ?? 0, 6),
        interestExpenseSUSD: roundDisplay(totals?.interestExpenseSUSD ?? 0, 6),
        subsidyExpenseSUSD: roundDisplay(totals?.subsidyExpenseSUSD ?? 0, 6),
        administrationExpenseSUSD: roundDisplay(
          totals?.administrationExpenseSUSD ?? 0,
          6,
        ),
        educationExpenseSUSD: roundDisplay(totals?.educationExpenseSUSD ?? 0, 6),
        trainingExpenseSUSD: roundDisplay(totals?.trainingExpenseSUSD ?? 0, 6),
        customsDutyRevenueSUSD: roundDisplay(totals?.customsDutyRevenueSUSD ?? 0, 6),
        militaryExpenseSUSD: roundDisplay(totals?.militaryExpenseSUSD ?? 0, 6),
        netFiscalResultSUSD: roundDisplay(totals?.netFiscalResultSUSD ?? 0, 6),
        treasuryCashEndSUSD: roundDisplay(balances?.treasuryCashSUSD ?? 0, 6),
        debtLiabilityEndSUSD: roundDisplay(balances?.debtLiabilitySUSD ?? 0, 6),
        interestPayableEndSUSD: roundDisplay(balances?.interestPayableSUSD ?? 0, 6),
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
  const regionIds = new Set(country.regionIds);
  const marketByRegion = new Map<number, (typeof world.markets)[number]>();
  for (const market of world.markets) {
    for (const regionId of market.regionIds) marketByRegion.set(regionId, market);
  }
  const definitionById = new Map(
    definitions.buildings.map((definition) => [definition.id, definition]),
  );
  for (const building of world.buildings) {
    if (!regionIds.has(building.regionId)) continue;
    const definition = definitionById.get(building.definitionId);
    if (definition === undefined) continue;
    const market = marketByRegion.get(building.regionId);
    if (market === undefined) continue;
    const capacity = computeBuildingCapacity(world, definitions, building.id);
    let value = 0;
    for (const output of definition.outputs) {
      const price = market.priceSUSD[output.goodId] ?? 0;
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
    fundedAnnualSUSD: country.education.fundedAnnualSUSD,
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
    fundingRequestedMonthToDateSUSD: roundDisplay(
      country.education.fundingRequestedMonthToDateSUSD,
      6,
    ),
    fundingShortfallMonthToDateSUSD: roundDisplay(
      country.education.fundingShortfallMonthToDateSUSD,
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
  const regionIds = new Set(country.regionIds);
  let workingAgeTotal = 0;
  let qualificationWeighted = 0;
  for (const block of world.popBlocks) {
    if (!regionIds.has(block.regionId)) continue;
    const workingAge = workingAgePopulation(block);
    workingAgeTotal += workingAge;
    qualificationWeighted += block.qualification * workingAge;
  }
  const qualificationAverage =
    workingAgeTotal > 0 ? qualificationWeighted / workingAgeTotal : 0;
  const trainingBlockedReason =
    country.labor.trainingBudgetSUSDPerYear <= 0
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
    trainingBudgetSUSDPerYear: country.labor.trainingBudgetSUSDPerYear,
    trainingStipendPerTraineeSUSDPerYear:
      country.labor.trainingStipendPerTraineeSUSDPerYear,
    trainingStaffShare: country.labor.trainingStaffShare,
    trainingParticipation: country.labor.trainingParticipation,
    trainingInstructors: roundDisplay(training.instructors, 2),
    eligibleWorkingAge: Math.round(training.eligibleWorkingAge),
    capacityTrainees: training.capacityTrainees,
    trainees: roundDisplay(training.trainees, 2),
    trainingRequestedMonthToDateSUSD: roundDisplay(
      country.labor.trainingRequestedMonthToDateSUSD,
      6,
    ),
    trainingShortfallMonthToDateSUSD: roundDisplay(
      country.labor.trainingShortfallMonthToDateSUSD,
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
    minimumWageSUSDPerYear: laborMinimumWageSUSDPerYear(country, definitions),
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
      fundedAnnualSUSD: country.institutions.fundedAnnualSUSD,
      quality: country.institutions.quality,
      overload: country.institutions.overload,
      serviceOutputIndex: country.institutions.serviceOutputIndex,
      staffedPopulation: Object.values(country.institutions.staffedByProfession).reduce(
        (total, value) => total + value,
        0,
      ),
      fundingRequestedMonthToDateSUSD: country.institutions.fundingRequestedMonthToDateSUSD,
      fundingShortfallMonthToDateSUSD: country.institutions.fundingShortfallMonthToDateSUSD,
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
): CountrySnapshot {
  const regionIds = new Set(country.regionIds);
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
    if (!regionIds.has(block.regionId)) continue;
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
    if (regionIds.has(building.regionId)) buildingCount += 1;
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
    if (building === undefined || !regionIds.has(building.regionId)) continue;
    employedWorkers += assignment.workers;
    const profession = professionById.get(assignment.professionId);
    if (profession !== undefined) {
      const wage = (profession.baseWage1900SUSDPerYear / yearDays) * assignment.workers;
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
  const dailyAllowance = country.fiscal.incomeTaxAllowanceSUSDPerYear / yearDays;
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
    if (!regionIds.has(building.regionId)) continue;
    const revenue = index.find("building", building.id, "sales-revenue")?.balanceSUSD ?? 0;
    const subsidy = index.find("building", building.id, "subsidy-revenue")?.balanceSUSD ?? 0;
    const input = index.find("building", building.id, "input-expense")?.balanceSUSD ?? 0;
    const wage = index.find("building", building.id, "wage-expense")?.balanceSUSD ?? 0;
    const upkeep = index.find("building", building.id, "upkeep-expense")?.balanceSUSD ?? 0;
    businessTaxBaseMonthToDate += Math.max(0, revenue + subsidy - input - wage - upkeep);
  }
  let householdCash = 0;
  for (const blockId of blockIds) {
    householdCash += index.find("popBlock", blockId, "household-cash")?.balanceSUSD ?? 0;
  }
  const debtInterestPayable =
    index.find("country", country.id, "interest-payable")?.balanceSUSD ?? 0;
  const memo = readBudgetMemo(world.finance, country.id);
  const budgetMonthToDate: SnapshotBudgetMonthToDate = {
    welfareRequestedSUSD: roundDisplay(memo.welfareRequestedSUSD, 6),
    welfareShortfallSUSD: roundDisplay(memo.welfareShortfallSUSD, 6),
    businessTaxAssessedSUSD: roundDisplay(memo.businessTaxAssessedSUSD, 6),
    businessTaxUncollectedSUSD: roundDisplay(memo.businessTaxUncollectedSUSD, 6),
    debtIssuedSUSD: roundDisplay(memo.debtIssuedSUSD, 6),
    principalRepaidSUSD: roundDisplay(memo.principalRepaidSUSD, 6),
    interestPaidSUSD: roundDisplay(memo.interestPaidSUSD, 6),
    unfinancedRequirementSUSD: roundDisplay(memo.unfinancedRequirementSUSD, 6),
    constructionSpentSUSD: roundDisplay(memo.constructionSpentSUSD, 6),
    constructionWrittenOffSUSD: roundDisplay(memo.constructionWrittenOffSUSD, 6),
    constructionMaterialsSpentSUSD: roundDisplay(memo.constructionMaterialsSpentSUSD, 6),
    subsidyRequestedSUSD: roundDisplay(memo.subsidyRequestedSUSD, 6),
    subsidyShortfallSUSD: roundDisplay(memo.subsidyShortfallSUSD, 6),
    publicEnterpriseSupportSUSD: roundDisplay(memo.publicEnterpriseSupportSUSD, 6),
    administrationRequestedSUSD: roundDisplay(memo.administrationRequestedSUSD ?? 0, 6),
    administrationShortfallSUSD: roundDisplay(memo.administrationShortfallSUSD ?? 0, 6),
    businessTaxBaseMonthToDateSUSD: roundDisplay(businessTaxBaseMonthToDate, 6),
  };
  const latestFiscal = history.length === 0 ? null : (history[history.length - 1] ?? null);
  const sectorValues = countrySectorValueEstimates(world, definitions, country);
  const sectorLabels: Record<string, string> = {
    agriculture: "Agriculture",
    "food-processing": "Food processing",
    textiles: "Textiles",
    manufacturing: "Manufacturing",
    storage: "Storage",
  };
  const industrialPolicy: SnapshotIndustrialPolicy = {
    sectors: BUILDING_SECTORS.map((key, index) => ({
      index,
      key,
      label: sectorLabels[key] ?? key,
      subsidyRate: country.industrial.sectorSubsidyRates[index] ?? 0,
      estimatedDailyOutputValueSUSD: roundDisplay(sectorValues.get(key) ?? 0, 6),
    })),
    requestedMonthToDateSUSD: roundDisplay(memo.subsidyRequestedSUSD, 6),
    paidMonthToDateSUSD: roundDisplay(
      Math.max(0, memo.subsidyRequestedSUSD - memo.subsidyShortfallSUSD),
      6,
    ),
    shortfallMonthToDateSUSD: roundDisplay(memo.subsidyShortfallSUSD, 6),
  };
  const regionById = new Map(world.regions.map((region) => [region.id, region]));
  const definitionById = new Map(
    definitions.buildings.map((definition) => [definition.id, definition]),
  );
  const publicEnterprises: SnapshotPublicEnterprise[] = world.buildings
    .filter(
      (building) =>
        regionIds.has(building.regionId) &&
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
        regionId: building.regionId,
        regionName: regionById.get(building.regionId)?.name ?? `Region ${String(building.regionId)}`,
        sector: definition?.sector ?? "storage",
        level: building.level,
        condition: building.condition,
        operatingCashSUSD: roundDisplay(
          index.find("building", building.id, "operating-cash")?.balanceSUSD ?? 0,
          6,
        ),
        ownerCountryId: country.id,
      };
    });
  return {
    id: country.id,
    tag: country.tag,
    name: country.name,
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
    regionIds: [...country.regionIds].sort((left, right) => left - right),
    fiscal: {
      incomeTaxRate: country.fiscal.incomeTaxRate,
      incomeTaxAllowanceSUSDPerYear: country.fiscal.incomeTaxAllowanceSUSDPerYear,
      welfareBudgetSUSDPerYear: country.fiscal.welfareBudgetSUSDPerYear,
      welfareMaxWealthLevel: country.fiscal.welfareMaxWealthLevel,
      businessProfitTaxRate: country.fiscal.businessProfitTaxRate,
      reserveTargetSUSD: country.fiscal.reserveTargetSUSD,
    },
    treasuryCashSUSD: index.get("country", country.id, "treasury-cash").balanceSUSD,
    debtEnabled: country.debt.enabled,
    debtOutstandingPrincipalSUSD: debtOutstandingPrincipal(
      world.finance.debtContracts,
      country.id,
    ),
    debtInterestPayableSUSD: roundDisplay(debtInterestPayable, 6),
    debtPolicy: debtPolicySnapshot(world, country, index),
    debtContracts: debtContractSnapshots(world, country.id),
    population,
    workingAgePopulation: workingAge,
    employedWorkers,
    householdCashSUSD: roundDisplay(householdCash, 6),
    estimatedDailyWageBaseSUSD: roundDisplay(estimatedDailyWageBase, 6),
    estimatedDailyTaxableWageBaseSUSD: roundDisplay(estimatedDailyTaxableWageBase, 6),
    estimatedWageEarningBlockCount,
    businessTaxBaseMonthToDateSUSD: roundDisplay(businessTaxBaseMonthToDate, 6),
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
    constructionInProgressSUSD: roundDisplay(
      index.find("country", country.id, "construction-in-progress")?.balanceSUSD ?? 0,
      6,
    ),
    publicCapitalSUSD: roundDisplay(
      index.find("country", country.id, "public-capital")?.balanceSUSD ?? 0,
      6,
    ),
    industrialPolicy,
    publicEnterprises,
    politics: politicsSnapshot(world, country, definitions),
    technology: technologySnapshot(world, country, definitions),
    education: educationSnapshot(world, country, definitions),
    labor: laborSnapshot(world, country, definitions),
    trade: tradePolicySnapshot(world, country),
    priceIndex: countryPriceIndexSnapshot(world, country),
    monetary: monetarySnapshot(world, country),
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
    exportsValueMonthToDateSUSD: roundDisplay(
      country.trade.exportsValueMonthToDateSUSD,
      2,
    ),
    importsValueMonthToDateSUSD: roundDisplay(
      country.trade.importsValueMonthToDateSUSD,
      2,
    ),
    dutyReceivedMonthToDateSUSD: roundDisplay(
      country.trade.dutyReceivedMonthToDateSUSD,
      2,
    ),
    dutyPaidMonthToDateSUSD: roundDisplay(country.trade.dutyPaidMonthToDateSUSD, 2),
    freightPaidMonthToDateSUSD: roundDisplay(
      country.trade.freightPaidMonthToDateSUSD,
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
      baseCapacitySUSDPerDay: route.baseCapacitySUSDPerDay,
      capacitySUSDPerDay: roundDisplay(
        routeCapacitySUSDPerDay(
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
    cargoValueSUSD: roundDisplay(shipment.cargoValueSUSD, 2),
    freightCostSUSD: roundDisplay(shipment.freightCostSUSD, 2),
    dutySUSD: roundDisplay(shipment.dutySUSD, 2),
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
            freightPaidSUSD: roundDisplay(lastDay.freightPaidSUSD, 2),
            dutyPaidSUSD: roundDisplay(lastDay.dutyPaidSUSD, 2),
            ownerFundedSUSD: roundDisplay(lastDay.ownerFundedSUSD, 2),
            blocked,
            blockedTruncated: (lastDay.blocked.length ?? 0) > blocked.length,
          },
  };
}

function marketPopulations(world: World): Map<number, number> {
  const byRegion = new Map<number, number>();
  for (const block of world.popBlocks) {
    byRegion.set(block.regionId, (byRegion.get(block.regionId) ?? 0) + populationTotal(block));
  }
  const byMarket = new Map<number, number>();
  for (const market of world.markets) {
    let population = 0;
    for (const regionId of market.regionIds) population += byRegion.get(regionId) ?? 0;
    byMarket.set(market.id, population);
  }
  return byMarket;
}

function priceIndexSnapshot(
  world: World,
  definitions: EconomyDefinitions,
): SnapshotPriceIndex {
  const values = derivePriceIndexes(world);
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
): SnapshotCountryPriceIndex {
  const values = derivePriceIndexes(world);
  const coverageWeighted = country.regionIds.reduce((total, regionId) => {
    const marketId = world.regions.find((region) => region.id === regionId)?.marketId;
    return total + (marketId === null || marketId === undefined ? 0 : priceIndexCoverage(world, marketId));
  }, 0);
  const regionCount = Math.max(1, country.regionIds.length);
  return {
    baseDayIndex: world.startDayIndex,
    value: roundDisplay(values.countries.get(country.id) ?? 100, 4),
    coverage: roundDisplay(coverageWeighted / regionCount, 4),
    monthOnMonthInflation: roundOptional(priceIndexInflation(world, country.id, 1)),
    yearOnYearInflation: roundOptional(priceIndexInflation(world, country.id, 12)),
  };
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
        susdPerUnit:
          valuation !== undefined && valuation.status === "specified"
            ? valuation.susdPerUnit
            : null,
        valuationSource:
          valuation !== undefined && valuation.status === "specified"
            ? valuation.source
            : null,
      };
    });
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
      paritySusdPerUnit: null,
      valuationSusdPerUnit: null,
      reserveCashSUSD: 0,
      currencyIssuedUnits: 0,
      liabilitySUSD: 0,
      reserveCoverMonths: null,
      convertibility: "no-authority",
      lastParityChangeDay: null,
      lastMonthExportsSUSD: 0,
      lastMonthImportsSUSD: 0,
      blockedReason:
        country.monetary.kind !== "own"
          ? "adopted-or-shared-currency"
          : "monetary-system-disabled",
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
    paritySusdPerUnit: record.paritySusdPerUnit,
    valuationSusdPerUnit:
      valuation !== undefined && valuation.status === "specified"
        ? valuation.susdPerUnit
        : null,
    reserveCashSUSD: roundDisplay(authorityReservesSUSD(world, record), 2),
    currencyIssuedUnits: roundDisplay(record.currencyIssuedUnits, 3),
    liabilitySUSD: roundDisplay(authorityLiabilitySUSD(world, record), 2),
    reserveCoverMonths: Number.isFinite(coverMonths) ? roundDisplay(coverMonths, 2) : null,
    convertibility: state.state,
    lastParityChangeDay: record.lastParityChangeDay,
    lastMonthExportsSUSD: roundDisplay(record.lastMonthExportsSUSD, 2),
    lastMonthImportsSUSD: roundDisplay(record.lastMonthImportsSUSD, 2),
    blockedReason: record.active
      ? null
      : record.paritySusdPerUnit === null
        ? "no-declared-parity"
        : "not-established",
  };
}

function armySnapshot(army: World["military"]["armies"][number]): SnapshotArmy {
  return {
    id: army.id,
    countryId: army.countryId,
    regionId: army.regionId,
    personnel: army.personnel,
    equipmentUnits: army.equipmentUnits,
    organization: roundDisplay(army.organization, 4),
    supply: roundDisplay(army.supply, 4),
    wounded: army.wounded,
    deaths: army.deaths,
    captured: army.captured,
    readyDay: army.readyDay,
    destinationRegionId: army.destinationRegionId,
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
  const occupiedRegionIds = world.regions
    .filter((region) => region.controllerCountryId === country.id)
    .map((region) => region.id)
    .sort((left, right) => left - right);
  return {
    armies,
    deaths,
    wounded,
    captured,
    relations,
    occupiedRegionIds,
    controlledRegionIds: [...occupiedRegionIds],
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
    occupations: world.regions
      .filter((region) => region.controllerCountryId !== null)
      .sort((left, right) => left.id - right.id)
      .map((region) => ({
        regionId: region.id,
        sovereignCountryId: regionSovereignCountryId(world, region.id),
        controllerCountryId: region.controllerCountryId,
        occupiedSinceDay: region.occupiedSinceDay,
      })),
  };
}

function regionSnapshots(
  world: World,
  regionMeta: ReadonlyMap<number, RegionMetaDef>,
): readonly RegionSnapshot[] {
  const ownerByRegion = new Map<number, number>();
  for (const country of world.countries) {
    for (const regionId of country.regionIds) ownerByRegion.set(regionId, country.id);
  }
  const blockPopulation = new Map<number, number>();
  for (const block of world.popBlocks) {
    blockPopulation.set(block.regionId, (blockPopulation.get(block.regionId) ?? 0) + populationTotal(block));
  }
  return [...world.regions]
    .sort((left, right) => left.id - right.id)
    .map((region) => {
      const meta = regionMeta.get(region.id);
      return {
        id: region.id,
        key: region.key,
        name: region.name,
        countryId: ownerByRegion.get(region.id) ?? null,
        marketId: region.marketId,
        population: blockPopulation.get(region.id) ?? 0,
        buildingCount: region.buildingInstanceIds.length,
        unrest: region.unrest,
        infrastructure: region.infrastructure,
        sovereignCountryId: ownerByRegion.get(region.id) ?? null,
        controllerCountryId: region.controllerCountryId,
        occupiedSinceDay: region.occupiedSinceDay,
        meta:
          meta === undefined
            ? null
            : {
                polityTag: meta.polityTag,
                historicalName: meta.historicalName,
                status: meta.status,
                sovereignCountryId: meta.sovereignCountryId,
                capitalName: meta.capitalName,
                confidence: meta.confidence,
                notes: meta.notes,
              },
      };
    });
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
    }));
}

function marketSnapshots(
  world: World,
  definitions: EconomyDefinitions,
  capacityByMarket: CapacityMaps["byMarket"],
  marketMeta: ReadonlyMap<number, MarketMetaDef>,
): readonly MarketSnapshot[] {
  const goods = [...definitions.goods].sort((left, right) => left.id - right.id);
  const countryByRegion = new Map<number, number>();
  for (const country of world.countries) {
    for (const regionId of country.regionIds) countryByRegion.set(regionId, country.id);
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
      for (const regionId of market.regionIds) {
        const countryId = countryByRegion.get(regionId);
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
        regionIds: [...market.regionIds].sort((left, right) => left - right),
        memberCountryIds: members,
        prices: goods.map((good) => ({
          goodId: good.id,
          goodKey: good.key,
          goodName: good.name,
          unitLabel: good.unitLabel,
          priceSUSD: market.priceSUSD[good.id] ?? 0,
          stockQuantity: stockByGood.get(good.id) ?? 0,
          dailyProductionCapacity: roundDisplay(capacity?.get(good.id) ?? 0, 3),
        })),
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
  const regionIdsByCountry = new Map<number, Set<number>>();
  const marketIdsByRegion = new Map(world.regions.map((region) => [region.id, region.marketId]));
  for (const country of world.countries) {
    regionIdsByCountry.set(country.id, new Set(country.regionIds));
  }
  const blocksByCountry = new Map<number, World["popBlocks"][number][]>();
  for (const block of world.popBlocks) {
    for (const country of world.countries) {
      if (!country.regionIds.includes(block.regionId)) continue;
      const list = blocksByCountry.get(country.id) ?? [];
      list.push(block);
      blocksByCountry.set(country.id, list);
    }
  }
  const employedByCountry = new Map<number, number>();
  const buildingById = new Map(world.buildings.map((building) => [building.id, building]));
  for (const assignment of world.employment) {
    const building = buildingById.get(assignment.buildingInstanceId);
    if (building === undefined) continue;
    for (const country of world.countries) {
      if (!country.regionIds.includes(building.regionId)) continue;
      employedByCountry.set(country.id, (employedByCountry.get(country.id) ?? 0) + assignment.workers);
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
      const regionIds = [...(regionIdsByCountry.get(country.id) ?? new Set<number>())].sort(
        (left, right) => left - right,
      );
      const marketIds = [
        ...new Set(
          regionIds
            .map((regionId) => marketIdsByRegion.get(regionId))
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
        regionIds,
        marketIds,
        population,
        workingAgePopulation: workingAge,
        employedWorkers: employedByCountry.get(country.id) ?? 0,
        treasuryCashSUSD: roundDisplay(
          index.find("country", country.id, "treasury-cash")?.balanceSUSD ?? 0,
          6,
        ),
        hardshipPopulationShare: population > 0 ? hardshipPopulation / population : 0,
        literacy: population > 0 ? weightedLiteracy / population : 0,
        wealthLevel: population > 0 ? weightedWealth / population : 0,
        militancy: population > 0 ? weightedMilitancy / population : 0,
        militaryPersonnel: armyPersonnel,
        latestNetFiscalResultSUSD:
          fiscal === undefined ? null : roundDisplay(fiscal.netFiscalResultSUSD, 6),
      };
    });
}

function freezeSnapshot(snapshot: SimulationSnapshot): SimulationSnapshot {
  for (const country of snapshot.countries) {
    Object.freeze(country.fiscal);
    Object.freeze(country.regionIds);
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
  for (const region of snapshot.regions) Object.freeze(region);
  for (const market of snapshot.markets) {
    for (const price of market.prices) Object.freeze(price);
    Object.freeze(market.prices);
    Object.freeze(market.regionIds);
    Object.freeze(market);
  }
  for (const good of snapshot.goods) Object.freeze(good);
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
    Object.freeze(summary.regionIds);
    Object.freeze(summary.marketIds);
    Object.freeze(summary);
  }
  Object.freeze(snapshot.countrySummaries);
  for (const region of snapshot.regions) {
    if (region.meta !== null) Object.freeze(region.meta);
  }
  for (const market of snapshot.markets) {
    Object.freeze(market.regionIds);
    Object.freeze(market.memberCountryIds);
  }
  Object.freeze(snapshot.countries);
  Object.freeze(snapshot.regions);
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
): SimulationSnapshot {
  const civil = dayIndexToCivilDate(world.dayIndex);
  const index = buildFinanceIndex(world.finance);
  const capacities = productionCapacities(world, definitions);
  const countryMetaById = new Map(
    (runtime.countryMeta ?? []).map((meta) => [meta.countryId, meta] as const),
  );
  const marketMetaById = new Map(
    (runtime.marketMeta ?? []).map((meta) => [meta.marketId, meta] as const),
  );
  const regionMetaById = new Map(
    (runtime.regionMeta ?? []).map((meta) => [meta.regionId, meta] as const),
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
  const detailCountryIds = new Set<number>();
  if (boundedDetail) {
    if (playerCountryId !== null) detailCountryIds.add(playerCountryId);
    if (focusCountryId !== null) detailCountryIds.add(focusCountryId);
  }
  const countries = [...world.countries]
    .filter((country) => !boundedDetail || detailCountryIds.has(country.id))
    .sort((left, right) => left.id - right.id)
    .map((country) => {
      const blockIds = new Set(
        world.popBlocks
          .filter((block) => country.regionIds.includes(block.regionId))
          .map((block) => block.id),
      );
      return countrySnapshot(
        world,
        country,
        index,
        financeHistory(world, country, index, blockIds),
        capacities.byCountry.get(country.id),
        definitions,
        countryMetaById.get(country.id),
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
    constructionEnabled: world.profitDistribution.enabled,
    countries,
    countrySummaries,
    regions: regionSnapshots(world, regionMetaById),
    markets: marketSnapshots(world, definitions, capacities.byMarket, marketMetaById),
    goods: goodsSnapshots(definitions),
    needTiers: needTierSnapshots(populationDefinitions, definitions),
    projectTypes: projectTypeSnapshots(definitions),
    technologyEraNames: [...(definitions.technology?.eraNames ?? [])],
    technologyCatalog: technologyCatalogSnapshot(definitions),
    trade: tradeNetworkSnapshot(world, definitions),
    priceIndex: priceIndexSnapshot(world, definitions),
    currencies: currenciesSnapshot(world),
    military: militarySnapshot(world),
    diagnostics,
  });
}
