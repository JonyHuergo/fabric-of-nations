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
  lawDefinition,
  lawPrerequisitesMet,
  lawSupport,
  populationTotal,
  readBudgetMemo,
  regimeDefinition,
  workingAgePopulation,
  IMPLEMENTED_LAW_SLOTS,
  INTEREST_GROUP_KEYS,
  LAW_SLOTS,
} from "@century/sim";
import type {
  EconomyDefinitions,
  FinancePeriodSummary,
  PopulationDefinitions,
  World,
} from "@century/sim";

import {
  MAX_SNAPSHOT_ANNUAL_REPORTS,
  MAX_SNAPSHOT_LEDGER_MONTHS,
  PROTOCOL_VERSION,
  type CountrySnapshot,
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
} from "./protocol.js";

export interface SnapshotRuntimeState {
  readonly sequence: number;
  readonly running: boolean;
  readonly speedDaysPerSecond: number;
  /** Presentation-only measured throughput; never feeds simulation state. */
  readonly achievedDaysPerSecond: number;
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
  };
}

function regionSnapshots(world: World): readonly RegionSnapshot[] {
  const ownerByRegion = new Map<number, number>();
  for (const country of world.countries) {
    for (const regionId of country.regionIds) ownerByRegion.set(regionId, country.id);
  }
  const blockPopulation = new Map<number, number>();
  for (const block of world.popBlocks) {
    blockPopulation.set(
      block.regionId,
      (blockPopulation.get(block.regionId) ?? 0) + populationTotal(block),
    );
  }
  return [...world.regions]
    .sort((left, right) => left.id - right.id)
    .map((region) => ({
      id: region.id,
      key: region.key,
      name: region.name,
      countryId: ownerByRegion.get(region.id) ?? null,
      marketId: region.marketId,
      population: blockPopulation.get(region.id) ?? 0,
      buildingCount: region.buildingInstanceIds.length,
      unrest: region.unrest,
      infrastructure: region.infrastructure,
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
    }));
}

function marketSnapshots(
  world: World,
  definitions: EconomyDefinitions,
  capacityByMarket: CapacityMaps["byMarket"],
): readonly MarketSnapshot[] {
  const goods = [...definitions.goods].sort((left, right) => left.id - right.id);
  return [...world.markets]
    .sort((left, right) => left.id - right.id)
    .map((market) => {
      const stockByGood = new Map<number, number>();
      for (const lot of market.stockLots) {
        stockByGood.set(lot.goodId, (stockByGood.get(lot.goodId) ?? 0) + lot.quantity);
      }
      const capacity = capacityByMarket.get(market.id);
      return {
        id: market.id,
        label: `Market ${String(market.id)}`,
        regionIds: [...market.regionIds].sort((left, right) => left - right),
        prices: goods.map((good) => ({
          goodId: good.id,
          goodKey: good.key,
          goodName: good.name,
          unitLabel: good.unitLabel,
          priceSUSD: market.priceSUSD[good.id] ?? 0,
          stockQuantity: stockByGood.get(good.id) ?? 0,
          dailyProductionCapacity: roundDisplay(capacity?.get(good.id) ?? 0, 3),
        })),
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
  Object.freeze(snapshot.diagnostics.recentWarnings);
  Object.freeze(snapshot.diagnostics);
  Object.freeze(snapshot.date);
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
  const countries = [...world.countries]
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
      );
    });
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
    playerCountryId: world.playerCountryId,
    constructionEnabled: world.profitDistribution.enabled,
    countries,
    regions: regionSnapshots(world),
    markets: marketSnapshots(world, definitions, capacities.byMarket),
    goods: goodsSnapshots(definitions),
    needTiers: needTierSnapshots(populationDefinitions, definitions),
    projectTypes: projectTypeSnapshots(definitions),
    diagnostics,
  });
}
