/**
 * Build the bounded, immutable UI snapshot from authoritative simulation state.
 *
 * This is the only place the worker reads the live world for presentation. The
 * resulting object contains plain data only: no typed arrays, account maps,
 * journals, or references into `World`. The app never receives the world itself.
 */

import {
  AI_HARDSHIP_SUBSISTENCE_DAYS,
  buildFinanceIndex,
  dayIndexToCivilDate,
  debtOutstandingPrincipal,
  governmentPeriodTotals,
  populationTotal,
  workingAgePopulation,
} from "@century/sim";
import type {
  EconomyDefinitions,
  FinancePeriodSummary,
  World,
} from "@century/sim";

import {
  MAX_SNAPSHOT_LEDGER_MONTHS,
  PROTOCOL_VERSION,
  type CountrySnapshot,
  type GoodSnapshot,
  type MarketSnapshot,
  type RegionSnapshot,
  type SimulationSnapshot,
  type SnapshotFinancePeriod,
  type SnapshotFiscalTotals,
} from "./protocol.js";

export interface SnapshotRuntimeState {
  readonly sequence: number;
  readonly running: boolean;
  readonly speedDaysPerSecond: number;
}

function roundDisplay(value: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function dateLabel(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function fiscalTotals(
  summary: FinancePeriodSummary,
  countryId: number,
  world: World,
): SnapshotFiscalTotals | null {
  const totals = governmentPeriodTotals(world.finance, summary).find(
    (entry) => entry.countryId === countryId,
  );
  if (totals === undefined) return null;
  return {
    periodStartDay: summary.periodStartDay,
    periodEndDay: summary.periodEndDay,
    incomeTaxSUSD: roundDisplay(totals.incomeTaxRevenueSUSD, 6),
    welfareExpenseSUSD: roundDisplay(totals.welfareExpenseSUSD, 6),
    interestExpenseSUSD: roundDisplay(totals.interestExpenseSUSD, 6),
    netFiscalResultSUSD: roundDisplay(totals.netFiscalResultSUSD, 6),
  };
}

function financeHistory(
  world: World,
  countryId: number,
): readonly SnapshotFinancePeriod[] {
  const summaries = world.finance.periodSummaries.slice(-MAX_SNAPSHOT_LEDGER_MONTHS);
  const history: SnapshotFinancePeriod[] = [];
  for (const summary of summaries) {
    const totals = fiscalTotals(summary, countryId, world);
    if (totals === null) continue;
    history.push({
      ...totals,
      grossFlowTotals: { ...summary.flowTotalsByKind },
    });
  }
  return history;
}

function countrySnapshot(
  world: World,
  country: World["countries"][number],
  index: ReturnType<typeof buildFinanceIndex>,
  history: readonly SnapshotFinancePeriod[],
): CountrySnapshot {
  const regionIds = new Set(country.regionIds);
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
  let employedWorkers = 0;
  for (const assignment of world.employment) {
    const building = buildingById.get(assignment.buildingInstanceId);
    if (building === undefined || !regionIds.has(building.regionId)) continue;
    employedWorkers += assignment.workers;
  }
  const latestFiscal = history.length === 0 ? null : (history[history.length - 1] ?? null);
  return {
    id: country.id,
    tag: country.tag,
    name: country.name,
    regionIds: [...country.regionIds].sort((left, right) => left - right),
    fiscal: {
      incomeTaxRate: country.fiscal.incomeTaxRate,
      welfareBudgetSUSDPerYear: country.fiscal.welfareBudgetSUSDPerYear,
    },
    treasuryCashSUSD: index.get("country", country.id, "treasury-cash").balanceSUSD,
    debtEnabled: country.debt.enabled,
    debtOutstandingPrincipalSUSD: debtOutstandingPrincipal(
      world.finance.debtContracts,
      country.id,
    ),
    population,
    workingAgePopulation: workingAge,
    employedWorkers,
    literacy: population > 0 ? roundDisplay(weightedLiteracy / population) : 0,
    wealthLevel: population > 0 ? roundDisplay(weightedWealth / population, 2) : 0,
    militancy: population > 0 ? roundDisplay(weightedMilitancy / population) : 0,
    hardshipPopulationShare:
      population > 0 ? roundDisplay(hardshipPopulation / population) : 0,
    blocksWithUnmetSubsistence: unmetSubsistenceBlocks,
    blocksWithUnmetBasic: unmetBasicBlocks,
    buildingCount,
    latestFiscal,
    financeHistory: history,
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
): readonly MarketSnapshot[] {
  const goods = [...definitions.goods].sort((left, right) => left.id - right.id);
  return [...world.markets]
    .sort((left, right) => left.id - right.id)
    .map((market) => {
      const stockByGood = new Map<number, number>();
      for (const lot of market.stockLots) {
        stockByGood.set(lot.goodId, (stockByGood.get(lot.goodId) ?? 0) + lot.quantity);
      }
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
        })),
      };
    });
}

function freezeSnapshot(snapshot: SimulationSnapshot): SimulationSnapshot {
  for (const country of snapshot.countries) {
    Object.freeze(country.fiscal);
    Object.freeze(country.regionIds);
    Object.freeze(country.latestFiscal);
    for (const period of country.financeHistory) {
      Object.freeze(period.grossFlowTotals);
      Object.freeze(period);
    }
    Object.freeze(country.financeHistory);
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
): SimulationSnapshot {
  const civil = dayIndexToCivilDate(world.dayIndex);
  const index = buildFinanceIndex(world.finance);
  const countries = [...world.countries]
    .sort((left, right) => left.id - right.id)
    .map((country) => countrySnapshot(world, country, index, financeHistory(world, country.id)));
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
    campaignComplete: world.dayIndex >= 36_524,
    scenarioId: world.scenarioId,
    dataVersion: world.dataVersion,
    simVersion: world.simVersion,
    playerCountryId: world.playerCountryId,
    countries,
    regions: regionSnapshots(world),
    markets: marketSnapshots(world, definitions),
    goods: goodsSnapshots(definitions),
    diagnostics,
  });
}
