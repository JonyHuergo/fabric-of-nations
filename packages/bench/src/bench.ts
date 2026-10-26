/**
 * Headless M1/M2/M3/M4b benchmark harness.
 *
 * This is a Node regression harness, not proof of mobile performance. It runs:
 * - M1 empty-world no-op ticks (backwards regression);
 * - M2 world-aggregate century ticks;
 * - M2 multi-block stress ticks at 200, 1,000, 3,000, and 6,000 pop blocks;
 * - M3b employment-refresh samples on the fixed small M3 world;
 * - M3c/M3d/M3e/M3f production, market, settlement, and integrated-day samples;
 * - M4b monthly period-close samples, including close correctness gates;
 * - M4c daily fiscal-phase samples, including tax, welfare, treasury,
 *   cash-conservation, and accounting-identity gates.
 *
 * Employment samples reset to a fixed seed-assignment state and time only the
 * real refresh routine. Setup, correctness validation, and hashing are excluded.
 * The M4b samples time only `closeFinancePeriod`; world cloning and hashing are
 * outside the measured section.
 *
 * The GDD mobile target (p95 <= 8 ms on a full-scale reference world) requires
 * a device release build and is explicitly not evaluated here.
 */

import { cpus, totalmem } from "node:os";
import process from "node:process";

import {
  loadM2MultiBlock,
  loadM2WorldAggregate,
  loadM3SmallEconomy,
  DATA_PACKAGE_VERSION,
} from "@century/data";
import {
  CAMPAIGN_TERMINAL_DAY_INDEX,
  CAMPAIGN_TICKS,
  FLOW_TRANSACTION_KINDS,
  SIM_VERSION,
  assertAccountingIdentity,
  assertValidEmploymentState,
  assertValidWorld,
  civilDateToDayIndex,
  cloneWorld,
  closeFinancePeriod,
  computeBuildingCapacity,
  createEconomyWorld,
  createInitialWorld,
  createPopulationWorld,
  designatedCashTotal,
  asSusdPerCurrencyUnit,
  hashWorld,
  populationTotal,
  refreshEmploymentIfDue,
  runMarketDay,
  runProductionPhase,
  settleMarketDay,
  tick,
  type CountryInitialDef,
  type EconomyScenarioDef,
  type TickContext,
  type InputReservation,
  type MarketDayInput,
  type PopBlockInitialDef,
  type PopulationInputs,
  type PopulationScenarioDef,
  type World,
} from "@century/sim";
import { runM5Benchmarks } from "./m5Bench.js";
import { runM6BoundedBenchmarks } from "./m6Bench.js";
import { runM7Benchmarks } from "./m7Bench.js";

const SEED = 20_261_023;
const MEASURED_RUNS_M1 = 3;
const M2_AGGREGATE_RUNS = 2;
const M2_STRESS_SCALES = [200, 1_000, 3_000, 6_000] as const;
const M2_STRESS_TICKS = 730;
const WARMUP_TICKS = 2_000;
const STRESS_WARMUP_TICKS = 100;
const M3B_EMPLOYMENT_WARMUP = 100;
const M3B_EMPLOYMENT_ITERATIONS = 1_000;
const M3B_EMPLOYMENT_DAY = 10;
const M3C_SMALL_WARMUP = 50;
const M3C_SMALL_ITERATIONS = 500;
const M3C_STRESS_GROUPS = 10;
const M3C_STRESS_WARMUP = 20;
const M3C_STRESS_ITERATIONS = 100;
const M3D_SMALL_WARMUP = 10;
const M3D_SMALL_ITERATIONS = 100;
const M3D_STRESS_GROUPS = 10;
const M3D_STRESS_WARMUP = 10;
const M3D_STRESS_ITERATIONS = 50;
const M3E_SMALL_WARMUP = 5;
const M3E_SMALL_ITERATIONS = 50;
const M3E_STRESS_GROUPS = 10;
const M3E_STRESS_WARMUP = 5;
const M3E_STRESS_ITERATIONS = 20;
const M3F_SMALL_WARMUP = 2;
const M3F_SMALL_ITERATIONS = 8;
const M3F_STRESS_GROUPS = 5;
const M3F_STRESS_WARMUP = 1;
const M3F_STRESS_ITERATIONS = 3;
const M4B_CLOSE_SMALL_WARMUP = 3;
const M4B_CLOSE_SMALL_ITERATIONS = 20;
const M4B_CLOSE_STRESS_GROUPS = 3;
const M4B_CLOSE_STRESS_WARMUP = 2;
const M4B_CLOSE_STRESS_ITERATIONS = 10;
const M4C_FISCAL_SMALL_WARMUP = 2;
const M4C_FISCAL_SMALL_ITERATIONS = 10;
const M4C_FISCAL_STRESS_GROUPS = 3;
const M4C_FISCAL_STRESS_WARMUP = 1;
const M4C_FISCAL_STRESS_ITERATIONS = 5;
const M4C_TREASURY_ACCOUNT_ID = 1_000_000;
const M1_P95_REGRESSION_THRESHOLD_MS = 1;
const M2_AGGREGATE_P95_REGRESSION_THRESHOLD_MS = 1;
const M2_STRESS_P95_REGRESSION_THRESHOLD_MS = 5;
const GDD_MOBILE_P95_TARGET_MS = 8;

const M2_PRICES: Readonly<Record<string, number>> = {
  grain: 0.05,
  "food-products": 0.1,
  fish: 0.1,
  livestock: 0.2,
  clothing: 1,
  services: 0.5,
  textiles: 1,
};
const M2_SUPPLY: Readonly<Record<string, number>> = {
  grain: 1.2,
  "food-products": 0.12,
  fish: 0.05,
  livestock: 0.05,
  clothing: 0.02,
  services: 0.25,
  textiles: 0.005,
};

interface RunResult {
  readonly run: number;
  readonly ticks: number;
  readonly totalMs: number;
  readonly averageMs: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly hash: string;
  readonly finalDayIndex: number;
  readonly population: number;
}

interface EmploymentBenchmarkResult {
  readonly iterations: number;
  readonly warmupIterations: number;
  readonly totalMs: number;
  readonly averageMs: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly hash: string;
  readonly hashesEqual: boolean;
  readonly capsValid: boolean;
  readonly refreshedEveryIteration: boolean;
  readonly minCreatedAssignments: number;
  readonly assignments: number;
  readonly assignedWorkers: number;
  readonly seedAssignments: number;
  readonly population: number;
  readonly fixtureBlocks: number;
  readonly fixtureBuildings: number;
}

interface ProductionBenchmarkResult {
  readonly label: string;
  readonly groups: number;
  readonly iterations: number;
  readonly warmupIterations: number;
  readonly totalMs: number;
  readonly averageMs: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly hash: string;
  readonly hashesEqual: boolean;
  readonly population: number;
  readonly fixtureBlocks: number;
  readonly fixtureBuildings: number;
  readonly reservations: number;
  readonly reservationsUsed: number;
  readonly production: number;
  readonly inputsUsed: number;
  readonly minReservationsUsed: number;
  readonly minProduction: number;
  readonly minInputsUsed: number;
}

interface MarketBenchmarkResult {
  readonly label: string;
  readonly groups: number;
  readonly iterations: number;
  readonly warmupIterations: number;
  readonly totalMs: number;
  readonly averageMs: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly hash: string;
  readonly hashesEqual: boolean;
  readonly population: number;
  readonly fixtureBlocks: number;
  readonly fixtureBuildings: number;
  readonly householdDemands: number;
  readonly productionDemands: number;
  readonly reservations: number;
  readonly householdFulfilled: number;
  readonly passBFulfilled: number;
  readonly productionUsed: number;
  readonly minHouseholdFulfilled: number;
  readonly minPassBFulfilled: number;
  readonly minProductionUsed: number;
  readonly minPriceChanges: number;
}

interface SettlementBenchmarkResult {
  readonly label: string;
  readonly groups: number;
  readonly iterations: number;
  readonly warmupIterations: number;
  readonly totalMs: number;
  readonly averageMs: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly hash: string;
  readonly hashesEqual: boolean;
  readonly population: number;
  readonly fixtureBlocks: number;
  readonly fixtureBuildings: number;
  readonly transactions: number;
  readonly wages: number;
  readonly postings: number;
  readonly marketPurchasesSUSD: number;
  readonly wagesPaidSUSD: number;
  readonly unpaidWagesSUSD: number;
  readonly upkeepPaidSUSD: number;
  readonly unpaidUpkeepSUSD: number;
  readonly producerProfitSUSD: number;
  readonly minTransactions: number;
  readonly minWagesPaidSUSD: number;
  readonly minUpkeepPaidSUSD: number;
  readonly minPostings: number;
}

interface EconomicDayBenchmarkResult {
  readonly label: string;
  readonly groups: number;
  readonly iterations: number;
  readonly warmupIterations: number;
  readonly totalMs: number;
  readonly averageMs: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly hash: string;
  readonly hashesEqual: boolean;
  readonly cashConserved: boolean;
  readonly population: number;
  readonly fixtureBlocks: number;
  readonly fixtureBuildings: number;
  readonly finalDay: number;
  readonly transactions: number;
  readonly wageSettlements: number;
  readonly upkeepSettlements: number;
  readonly postings: number;
  readonly fallbackDays: number;
  readonly minTransactions: number;
  readonly minWages: number;
  readonly minUpkeep: number;
}

interface FinanceCloseBenchmarkResult {
  readonly label: string;
  readonly groups: number;
  readonly iterations: number;
  readonly warmupIterations: number;
  readonly totalMs: number;
  readonly averageMs: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly fixtureBlocks: number;
  readonly fixtureBuildings: number;
  readonly accounts: number;
  readonly summaryDay: number;
  readonly closingPostings: number;
  readonly minClosingPostings: number;
  readonly flowTotalSUSD: number;
  readonly zeroed: boolean;
  readonly cashConserved: boolean;
  readonly identityPreserved: boolean;
  readonly summariesContiguous: boolean;
  readonly deterministic: boolean;
  readonly hashesEqual: boolean;
  readonly hash: string;
}

function percentile(sortedSamples: readonly number[], fraction: number): number {
  if (sortedSamples.length === 0) return Number.NaN;
  const index = Math.min(
    sortedSamples.length - 1,
    Math.max(0, Math.ceil(fraction * sortedSamples.length) - 1),
  );
  const value = sortedSamples[index];
  if (value === undefined) return Number.NaN;
  return value;
}

function milliseconds(nanoseconds: number): number {
  return nanoseconds / 1_000_000;
}

function formatMs(value: number): string {
  return value.toFixed(6);
}

function inputsFor(blockIds: readonly number[]): PopulationInputs {
  return {
    prices: Object.entries(M2_PRICES).map(([goodKey, unitPriceSUSD]) => ({
      goodKey,
      unitPriceSUSD,
    })),
    supply: Object.entries(M2_SUPPLY).map(([goodKey, availableQuantityPerCapita]) => ({
      goodKey,
      availableQuantityPerCapita,
    })),
    income: blockIds.map((popBlockId) => ({
      popBlockId,
      annualSettledIncomePerCapitaSUSD: 250,
      annualMandatoryPaymentsPerCapitaSUSD: 50,
    })),
  };
}

function contextFor(
  scenario: PopulationScenarioDef,
  blockIds: readonly number[],
): TickContext {
  return {
    population: {
      definitions: scenario.definitions,
      inputs: inputsFor(blockIds),
      collectNeedDetails: false,
    },
  };
}

function runPopulationCase(
  run: number,
  scenario: PopulationScenarioDef,
  ticks: number,
): RunResult {
  const world: World = createPopulationWorld(scenario, { seed: SEED });
  const blockIds = world.popBlocks.map((block) => block.id);
  const context = contextFor(scenario, blockIds);
  const tickSamplesNs = new Array<number>(ticks);
  let processed = 0;
  const startNs = process.hrtime.bigint();
  while (processed < ticks && world.dayIndex < CAMPAIGN_TERMINAL_DAY_INDEX) {
    const tickStartNs = process.hrtime.bigint();
    const result = tick(world, context);
    const tickEndNs = process.hrtime.bigint();
    if (!result.advanced) break;
    tickSamplesNs[processed] = Number(tickEndNs - tickStartNs);
    processed += 1;
  }
  const totalNs = Number(process.hrtime.bigint() - startNs);
  tickSamplesNs.length = processed;
  const sorted = [...tickSamplesNs].sort((left, right) => left - right);
  return {
    run,
    ticks: processed,
    totalMs: milliseconds(totalNs),
    averageMs: milliseconds(processed === 0 ? Number.NaN : totalNs / processed),
    p50Ms: milliseconds(percentile(sorted, 0.5)),
    p95Ms: milliseconds(percentile(sorted, 0.95)),
    p99Ms: milliseconds(percentile(sorted, 0.99)),
    hash: hashWorld(world),
    finalDayIndex: world.dayIndex,
    population: world.popBlocks.reduce((total, block) => total + populationTotal(block), 0),
  };
}

/**
 * Measure the real M3b employment refresh. Each sample resets authoritative
 * employment to the scenario's fixed seed assignments and marks it dirty; only
 * the refresh call is timed. Reset, correctness validation, and hashing are
 * outside the measured interval.
 */
function runM3bEmploymentCase(): EmploymentBenchmarkResult {
  const scenario: EconomyScenarioDef = loadM3SmallEconomy();
  const world = createEconomyWorld(scenario, { seed: SEED });
  world.dayIndex = M3B_EMPLOYMENT_DAY;
  const seedAssignments = world.employment.map((assignment) => ({ ...assignment }));

  const reset = (): void => {
    world.employment = seedAssignments.map((assignment) => ({ ...assignment }));
    world.employmentDirty = true;
  };
  const oneRefresh = (): {
    readonly ns: number;
    readonly result: ReturnType<typeof refreshEmploymentIfDue>;
  } => {
    reset();
    const start = process.hrtime.bigint();
    const result = refreshEmploymentIfDue(
      world,
      scenario.definitions,
      M3B_EMPLOYMENT_DAY,
    );
    const end = process.hrtime.bigint();
    return { ns: Number(end - start), result };
  };

  for (let index = 0; index < M3B_EMPLOYMENT_WARMUP; index += 1) oneRefresh();

  const samples = new Array<number>(M3B_EMPLOYMENT_ITERATIONS);
  const hashes = new Set<string>();
  let capsValid = true;
  let refreshedEveryIteration = true;
  let minCreatedAssignments = Number.MAX_SAFE_INTEGER;
  let assignments = 0;
  let assignedWorkers = 0;
  let hash = "";

  for (let index = 0; index < M3B_EMPLOYMENT_ITERATIONS; index += 1) {
    const { ns, result } = oneRefresh();
    samples[index] = ns;
    refreshedEveryIteration = refreshedEveryIteration && result.refreshed;
    minCreatedAssignments = Math.min(minCreatedAssignments, result.createdAssignments);
    assertValidEmploymentState(world, scenario.definitions);
    const actualAssigned = world.employment.reduce(
      (total, assignment) => total + assignment.workers,
      0,
    );
    capsValid = capsValid && actualAssigned === result.assignedWorkers;
    const sampleHash = hashWorld(world);
    hashes.add(sampleHash);
    if (index === 0) {
      assignments = world.employment.length;
      assignedWorkers = actualAssigned;
      hash = sampleHash;
      assertValidWorld(world);
    }
  }

  samples.sort((left, right) => left - right);
  let totalNs = 0;
  for (const sample of samples) totalNs += sample;

  return {
    iterations: M3B_EMPLOYMENT_ITERATIONS,
    warmupIterations: M3B_EMPLOYMENT_WARMUP,
    totalMs: milliseconds(totalNs),
    averageMs: milliseconds(totalNs / M3B_EMPLOYMENT_ITERATIONS),
    p50Ms: milliseconds(percentile(samples, 0.5)),
    p95Ms: milliseconds(percentile(samples, 0.95)),
    p99Ms: milliseconds(percentile(samples, 0.99)),
    hash,
    hashesEqual: hashes.size === 1,
    capsValid,
    refreshedEveryIteration,
    minCreatedAssignments,
    assignments,
    assignedWorkers,
    seedAssignments: seedAssignments.length,
    population: world.popBlocks.reduce((total, block) => total + populationTotal(block), 0),
    fixtureBlocks: world.popBlocks.length,
    fixtureBuildings: world.buildings.length,
  };
}

function printEmploymentBenchmark(result: EmploymentBenchmarkResult): void {
  console.log(
    `M3b employment refresh (${String(result.fixtureBlocks)} pop blocks, ` +
      `${String(result.fixtureBuildings)} buildings, ${String(result.seedAssignments)} seed assignments):`,
  );
  console.log(
    `  ${String(result.iterations)} refreshes; warm-up ${String(result.warmupIterations)}; ` +
      `day ${String(M3B_EMPLOYMENT_DAY)} dirty-triggered; reset/validation/hash excluded`,
  );
  console.log(
    `  total ${formatMs(result.totalMs)} ms, avg ${formatMs(result.averageMs)} ms, ` +
      `p50 ${formatMs(result.p50Ms)} ms, p95 ${formatMs(result.p95Ms)} ms, ` +
      `p99 ${formatMs(result.p99Ms)} ms`,
  );
  console.log(
    `  assignments ${String(result.assignments)}, assigned workers ${String(result.assignedWorkers)}, ` +
      `min created/refresh ${String(result.minCreatedAssignments)}, ` +
      `population ${String(result.population)}, hash ${result.hash}`,
  );
}

function scaledProductionScenario(groups: number): EconomyScenarioDef {
  if (!Number.isInteger(groups) || groups < 1) {
    throw new RangeError("production benchmark groups must be a positive integer");
  }
  const base = loadM3SmallEconomy();
  const scenario = JSON.parse(JSON.stringify(base)) as EconomyScenarioDef;
  const blockTemplates = base.population.popBlocks;
  const buildingTemplates = base.buildingInstances;
  const popBlocks: PopBlockInitialDef[] = [];
  const buildingInstances: EconomyScenarioDef["buildingInstances"] = [];
  const stockLots: { goodId: number; ownerBuildingId: number; quantity: number }[] = [];
  const operatingAccountBase = groups * 4;
  const systemAccountId = groups * 12;

  for (let group = 0; group < groups; group += 1) {
    for (let index = 0; index < 4; index += 1) {
      const template = blockTemplates[index];
      if (template === undefined) throw new Error("M3 fixture has no pop-block template");
      popBlocks.push({
        ...template,
        id: group * 4 + index,
        financialAccountId: group * 4 + index,
        maleAgeGroups: [...template.maleAgeGroups],
        femaleAgeGroups: [...template.femaleAgeGroups],
      });
    }
    for (let index = 0; index < 8; index += 1) {
      const template = buildingTemplates[index];
      if (template === undefined) throw new Error("M3 fixture has no building template");
      buildingInstances.push({
        ...template,
        id: group * 8 + index,
        definitionId: index,
        ownerAccountId: group * 4 + 3,
        operatingCashAccountId: operatingAccountBase + group * 8 + index,
      });
    }
    const owner = (definitionId: number): number => group * 8 + definitionId;
    stockLots.push(
      { goodId: 0, ownerBuildingId: owner(0), quantity: 20000 },
      { goodId: 0, ownerBuildingId: owner(1), quantity: 30000 },
      { goodId: 3, ownerBuildingId: owner(1), quantity: 1000 },
      { goodId: 1, ownerBuildingId: owner(2), quantity: 2000 },
      { goodId: 4, ownerBuildingId: owner(2), quantity: 200 },
      { goodId: 2, ownerBuildingId: owner(3), quantity: 2000 },
      { goodId: 7, ownerBuildingId: owner(4), quantity: 2000 },
      { goodId: 5, ownerBuildingId: owner(5), quantity: 500 },
      { goodId: 6, ownerBuildingId: owner(6), quantity: 200 },
    );
  }

  scenario.population.popBlocks = popBlocks;
  scenario.buildingInstances = buildingInstances;
  scenario.employment = [];
  scenario.markets = [
    {
      id: 0,
      regionIds: [0],
      priceSUSD: [...base.markets[0]!.priceSUSD],
      stockLots,
    },
  ];
  scenario.systemAccounts = [
    { id: systemAccountId, accountKind: "system-reserve", balanceSUSD: 0 },
  ];
  return scenario;
}

/**
 * Build a fixed deterministic reservation set for benchmark setup. This is not
 * market clearing: buildings are visited by id and each takes its desired input
 * from the first available opening lots. Production only times the physical
 * phase against these reservations.
 */
function reservationSetForWorld(
  world: World,
  scenario: EconomyScenarioDef,
): InputReservation[] {
  const market = world.markets[0];
  if (market === undefined) throw new Error("missing M3 market");
  const remaining = new Map<string, number>();
  const lotsByGood = new Map<number, { ownerBuildingId: number; quantity: number }[]>();
  for (const lot of market.stockLots) {
    remaining.set(`${String(lot.goodId)}:${String(lot.ownerBuildingId)}`, lot.quantity);
    const list = lotsByGood.get(lot.goodId) ?? [];
    list.push({ ownerBuildingId: lot.ownerBuildingId, quantity: lot.quantity });
    lotsByGood.set(lot.goodId, list);
  }
  for (const list of lotsByGood.values()) {
    list.sort((left, right) => left.ownerBuildingId - right.ownerBuildingId);
  }
  const reservations: InputReservation[] = [];
  for (const building of [...world.buildings].sort((left, right) => left.id - right.id)) {
    const capacity = computeBuildingCapacity(world, scenario.definitions, building.id);
    if (!capacity.isProductionBuilding || capacity.capacityTU <= 0) continue;
    for (const desired of capacity.desiredInputs) {
      let remainingDesired = desired.quantity;
      const lots = lotsByGood.get(desired.goodId) ?? [];
      for (const lot of lots) {
        if (remainingDesired <= 0) break;
        const key = `${String(desired.goodId)}:${String(lot.ownerBuildingId)}`;
        const available = remaining.get(key) ?? 0;
        const quantity = Math.min(remainingDesired, available);
        if (quantity <= 0) continue;
        reservations.push({
          buyerBuildingId: building.id,
          marketId: market.id,
          goodId: desired.goodId,
          sellerBuildingId: lot.ownerBuildingId,
          quantity,
        });
        remaining.set(key, available - quantity);
        remainingDesired -= quantity;
      }
    }
  }
  return reservations;
}

function runProductionBenchmark(
  label: string,
  groups: number,
  iterations: number,
  warmupIterations: number,
): ProductionBenchmarkResult {
  const scenario =
    groups === 1 ? loadM3SmallEconomy() : scaledProductionScenario(groups);
  const world = createEconomyWorld(scenario, { seed: SEED });
  refreshEmploymentIfDue(world, scenario.definitions, 0);
  assertValidEmploymentState(world, scenario.definitions);
  const market = world.markets[0];
  if (market === undefined) throw new Error("missing M3 market");
  const openingLots = market.stockLots.map((lot) => ({ ...lot }));
  const reservations = reservationSetForWorld(world, scenario);
  if (reservations.length === 0) {
    throw new Error("production benchmark has no reservations");
  }

  const reset = (): void => {
    market.stockLots = openingLots.map((lot) => ({ ...lot }));
  };
  const onePhase = (): {
    readonly ns: number;
    readonly result: ReturnType<typeof runProductionPhase>;
  } => {
    reset();
    const start = process.hrtime.bigint();
    const result = runProductionPhase(world, scenario.definitions, reservations);
    const end = process.hrtime.bigint();
    return { ns: Number(end - start), result };
  };

  for (let index = 0; index < warmupIterations; index += 1) onePhase();
  const samples = new Array<number>(iterations);
  const hashes = new Set<string>();
  let minReservationsUsed = Number.MAX_SAFE_INTEGER;
  let minProduction = Number.MAX_SAFE_INTEGER;
  let minInputsUsed = Number.MAX_SAFE_INTEGER;
  let reservationsUsed = 0;
  let production = 0;
  let inputsUsed = 0;
  let hash = "";

  for (let index = 0; index < iterations; index += 1) {
    const { ns, result } = onePhase();
    samples[index] = ns;
    const usedReservations = result.reservationUses.filter(
      (use) => use.usedQuantity > 0,
    ).length;
    const produced = result.inventory.reduce((total, flow) => total + flow.production, 0);
    const usedInputs = result.inventory.reduce((total, flow) => total + flow.usedAsInput, 0);
    minReservationsUsed = Math.min(minReservationsUsed, usedReservations);
    minProduction = Math.min(minProduction, produced);
    minInputsUsed = Math.min(minInputsUsed, usedInputs);
    if (index === 0) {
      reservationsUsed = usedReservations;
      production = produced;
      inputsUsed = usedInputs;
      assertValidWorld(world);
    }
    const sampleHash = hashWorld(world);
    hashes.add(sampleHash);
    if (index === 0) hash = sampleHash;
  }

  samples.sort((left, right) => left - right);
  let totalNs = 0;
  for (const sample of samples) totalNs += sample;
  return {
    label,
    groups,
    iterations,
    warmupIterations,
    totalMs: milliseconds(totalNs),
    averageMs: milliseconds(totalNs / iterations),
    p50Ms: milliseconds(percentile(samples, 0.5)),
    p95Ms: milliseconds(percentile(samples, 0.95)),
    p99Ms: milliseconds(percentile(samples, 0.99)),
    hash,
    hashesEqual: hashes.size === 1,
    population: world.popBlocks.reduce((total, block) => total + populationTotal(block), 0),
    fixtureBlocks: world.popBlocks.length,
    fixtureBuildings: world.buildings.length,
    reservations: reservations.length,
    reservationsUsed,
    production,
    inputsUsed,
    minReservationsUsed,
    minProduction,
    minInputsUsed,
  };
}

function printProductionBenchmark(result: ProductionBenchmarkResult): void {
  console.log(
    `${result.label} (${String(result.groups)} group(s), ${String(result.fixtureBlocks)} pop blocks, ` +
      `${String(result.fixtureBuildings)} buildings):`,
  );
  console.log(
    `  ${String(result.iterations)} production phases; warm-up ${String(result.warmupIterations)}; ` +
      `reset/validation/hash excluded`,
  );
  console.log(
    `  ${String(result.reservations)} reservations, ${String(result.reservationsUsed)} used; ` +
      `${result.production.toFixed(3)} produced, ${result.inputsUsed.toFixed(3)} inputs used`,
  );
  console.log(
    `  total ${formatMs(result.totalMs)} ms, avg ${formatMs(result.averageMs)} ms, ` +
      `p50 ${formatMs(result.p50Ms)} ms, p95 ${formatMs(result.p95Ms)} ms, ` +
      `p99 ${formatMs(result.p99Ms)} ms, population ${String(result.population)}, hash ${result.hash}`,
  );
}

function marketDemandInput(
  world: World,
  scenario: EconomyScenarioDef,
  groups: number,
): MarketDayInput {
  const householdDemands: MarketDayInput["householdDemands"][number][] = [];
  const productionDemands: MarketDayInput["productionDemands"][number][] = [];
  for (let group = 0; group < groups; group += 1) {
    const block = group * 4;
    const building = group * 8;
    householdDemands.push(
      { popBlockId: block, tier: 1, goodId: 0, desiredQuantity: 60000, fundedQuantity: 60000 },
      { popBlockId: block + 1, tier: 1, goodId: 7, desiredQuantity: 100, fundedQuantity: 100 },
      { popBlockId: block + 1, tier: 1, goodId: 2, desiredQuantity: 100, fundedQuantity: 100 },
      { popBlockId: block + 1, tier: 1, goodId: 1, desiredQuantity: 100, fundedQuantity: 100 },
      { popBlockId: block + 1, tier: 3, goodId: 6, desiredQuantity: 100, fundedQuantity: 100 },
      { popBlockId: block + 1, tier: 6, goodId: 5, desiredQuantity: 1000, fundedQuantity: 1000 },
    );
    productionDemands.push(
      { buyerBuildingId: building + 5, tier: 5, goodId: 3, desiredQuantity: 8000, fundedQuantity: 8000 },
      { buyerBuildingId: building + 5, tier: 5, goodId: 4, desiredQuantity: 1500, fundedQuantity: 1500 },
      { buyerBuildingId: building + 6, tier: 2, goodId: 5, desiredQuantity: 4000, fundedQuantity: 4000 },
    );
  }
  return {
    dayIndex: world.dayIndex,
    marketId: 0,
    needs: scenario.population.definitions.needs,
    householdDemands,
    productionDemands,
  };
}

function runMarketBenchmark(
  label: string,
  groups: number,
  iterations: number,
  warmupIterations: number,
): MarketBenchmarkResult {
  const scenario = scaledProductionScenario(groups);
  const world = createEconomyWorld(scenario, { seed: SEED });
  refreshEmploymentIfDue(world, scenario.definitions, 0);
  assertValidEmploymentState(world, scenario.definitions);
  const market = world.markets[0];
  if (market === undefined) throw new Error("missing M3 market");
  const openingLots = market.stockLots.map((lot) => ({ ...lot }));
  const openingPrices = [...market.priceSUSD];
  const input = marketDemandInput(world, scenario, groups);
  if (input.householdDemands.length === 0 || input.productionDemands.length === 0) {
    throw new Error("market benchmark has no demands");
  }

  const reset = (): void => {
    market.stockLots = openingLots.map((lot) => ({ ...lot }));
    market.priceSUSD = [...openingPrices];
  };
  const oneDay = (): {
    readonly ns: number;
    readonly result: ReturnType<typeof runMarketDay>;
  } => {
    reset();
    const start = process.hrtime.bigint();
    const result = runMarketDay(world, scenario.definitions, input);
    const end = process.hrtime.bigint();
    return { ns: Number(end - start), result };
  };

  for (let index = 0; index < warmupIterations; index += 1) oneDay();
  const samples = new Array<number>(iterations);
  const hashes = new Set<string>();
  let minHouseholdFulfilled = Number.MAX_SAFE_INTEGER;
  let minPassBFulfilled = Number.MAX_SAFE_INTEGER;
  let minProductionUsed = Number.MAX_SAFE_INTEGER;
  let minPriceChanges = Number.MAX_SAFE_INTEGER;
  let householdFulfilled = 0;
  let passBFulfilled = 0;
  let productionUsed = 0;
  let reservations = 0;
  let hash = "";

  for (let index = 0; index < iterations; index += 1) {
    const { ns, result } = oneDay();
    samples[index] = ns;
    const household = result.householdDemands.reduce(
      (total, demand) => total + demand.fulfilledQuantity,
      0,
    );
    const passB = result.householdDemands.reduce(
      (total, demand) => total + demand.passBFulfilled,
      0,
    );
    const used = result.production.reservationUses.reduce(
      (total, reservation) => total + reservation.usedQuantity,
      0,
    );
    const changedPrices = result.priceUpdates.filter(
      (update) => Math.abs(update.newPriceSUSD - update.oldPriceSUSD) > 1e-12,
    ).length;
    minHouseholdFulfilled = Math.min(minHouseholdFulfilled, household);
    minPassBFulfilled = Math.min(minPassBFulfilled, passB);
    minProductionUsed = Math.min(minProductionUsed, used);
    minPriceChanges = Math.min(minPriceChanges, changedPrices);
    if (index === 0) {
      householdFulfilled = household;
      passBFulfilled = passB;
      productionUsed = used;
      reservations = result.reservations.length;
      assertValidWorld(world);
    }
    const sampleHash = hashWorld(world);
    hashes.add(sampleHash);
    if (index === 0) hash = sampleHash;
  }

  samples.sort((left, right) => left - right);
  let totalNs = 0;
  for (const sample of samples) totalNs += sample;
  return {
    label,
    groups,
    iterations,
    warmupIterations,
    totalMs: milliseconds(totalNs),
    averageMs: milliseconds(totalNs / iterations),
    p50Ms: milliseconds(percentile(samples, 0.5)),
    p95Ms: milliseconds(percentile(samples, 0.95)),
    p99Ms: milliseconds(percentile(samples, 0.99)),
    hash,
    hashesEqual: hashes.size === 1,
    population: world.popBlocks.reduce((total, block) => total + populationTotal(block), 0),
    fixtureBlocks: world.popBlocks.length,
    fixtureBuildings: world.buildings.length,
    householdDemands: input.householdDemands.length,
    productionDemands: input.productionDemands.length,
    reservations,
    householdFulfilled,
    passBFulfilled,
    productionUsed,
    minHouseholdFulfilled,
    minPassBFulfilled,
    minProductionUsed,
    minPriceChanges,
  };
}

function printMarketBenchmark(result: MarketBenchmarkResult): void {
  console.log(
    `${result.label} (${String(result.groups)} group(s), ${String(result.fixtureBlocks)} pop blocks, ` +
      `${String(result.fixtureBuildings)} buildings):`,
  );
  console.log(
    `  ${String(result.iterations)} market days; warm-up ${String(result.warmupIterations)}; ` +
      `reset/validation/hash excluded`,
  );
  console.log(
    `  ${String(result.householdDemands)} household demands, ${String(result.productionDemands)} input demands, ` +
      `${String(result.reservations)} reservations`,
  );
  console.log(
    `  fulfilled ${result.householdFulfilled.toFixed(3)}, Pass B ${result.passBFulfilled.toFixed(3)}, ` +
      `production input used ${result.productionUsed.toFixed(3)}`,
  );
  console.log(
    `  total ${formatMs(result.totalMs)} ms, avg ${formatMs(result.averageMs)} ms, ` +
      `p50 ${formatMs(result.p50Ms)} ms, p95 ${formatMs(result.p95Ms)} ms, ` +
      `p99 ${formatMs(result.p99Ms)} ms, population ${String(result.population)}, hash ${result.hash}`,
  );
}

function settlementBenchmarkScenario(groups: number): EconomyScenarioDef {
  const scenario = scaledProductionScenario(groups);
  for (const block of scenario.population.popBlocks) {
    block.initialSavingsSUSD = 1_000_000;
  }
  for (const building of scenario.buildingInstances) {
    building.initialOperatingCashSUSD = 1_000_000;
  }
  return scenario;
}

function runSettlementBenchmark(
  label: string,
  groups: number,
  iterations: number,
  warmupIterations: number,
): SettlementBenchmarkResult {
  const scenario = settlementBenchmarkScenario(groups);
  const world = createEconomyWorld(scenario, { seed: SEED });
  refreshEmploymentIfDue(world, scenario.definitions, 0);
  assertValidEmploymentState(world, scenario.definitions);
  const market = world.markets[0];
  if (market === undefined) throw new Error("missing M3 market");
  const openingLots = market.stockLots.map((lot) => ({ ...lot }));
  const openingPrices = [...market.priceSUSD];
  const openingBalances = new Map<number, number>();
  for (const account of world.finance.accounts) {
    openingBalances.set(account.id, account.balanceSUSD);
  }
  const openingNextPostingId = world.finance.nextPostingId;
  const demandInput = marketDemandInput(world, scenario, groups);

  const reset = (): void => {
    market.stockLots = openingLots.map((lot) => ({ ...lot }));
    market.priceSUSD = [...openingPrices];
    for (const account of world.finance.accounts) {
      const balance = openingBalances.get(account.id);
      if (balance === undefined) throw new Error(`missing opening balance ${String(account.id)}`);
      account.balanceSUSD = balance;
    }
    world.finance.postings = [];
    world.finance.nextPostingId = openingNextPostingId;
  };

  const oneSample = (): {
    readonly ns: number;
    readonly settlement: ReturnType<typeof settleMarketDay>;
  } => {
    reset();
    const marketDay = runMarketDay(world, scenario.definitions, demandInput);
    const start = process.hrtime.bigint();
    const settlement = settleMarketDay(world, scenario.definitions, marketDay);
    const end = process.hrtime.bigint();
    return { ns: Number(end - start), settlement };
  };

  for (let index = 0; index < warmupIterations; index += 1) oneSample();
  const samples = new Array<number>(iterations);
  const hashes = new Set<string>();
  let minTransactions = Number.MAX_SAFE_INTEGER;
  let minWagesPaidSUSD = Number.MAX_SAFE_INTEGER;
  let minUpkeepPaidSUSD = Number.MAX_SAFE_INTEGER;
  let minPostings = Number.MAX_SAFE_INTEGER;
  let transactions = 0;
  let wages = 0;
  let postings = 0;
  let marketPurchasesSUSD = 0;
  let wagesPaidSUSD = 0;
  let unpaidWagesSUSD = 0;
  let upkeepPaidSUSD = 0;
  let unpaidUpkeepSUSD = 0;
  let producerProfitSUSD = 0;
  let hash = "";

  for (let index = 0; index < iterations; index += 1) {
    const { ns, settlement } = oneSample();
    samples[index] = ns;
    minTransactions = Math.min(minTransactions, settlement.transactions.length);
    minWagesPaidSUSD = Math.min(minWagesPaidSUSD, settlement.totals.wagesPaidSUSD);
    minUpkeepPaidSUSD = Math.min(minUpkeepPaidSUSD, settlement.totals.upkeepPaidSUSD);
    minPostings = Math.min(minPostings, settlement.postingIds.length);
    if (index === 0) {
      transactions = settlement.transactions.length;
      wages = settlement.wages.length;
      postings = settlement.postingIds.length;
      marketPurchasesSUSD = settlement.totals.marketPurchasesSUSD;
      wagesPaidSUSD = settlement.totals.wagesPaidSUSD;
      unpaidWagesSUSD = settlement.totals.unpaidWagesSUSD;
      upkeepPaidSUSD = settlement.totals.upkeepPaidSUSD;
      unpaidUpkeepSUSD = settlement.totals.unpaidUpkeepSUSD;
      producerProfitSUSD = settlement.totals.producerProfitSUSD;
      assertValidWorld(world);
    }
    const sampleHash = hashWorld(world);
    hashes.add(sampleHash);
    if (index === 0) hash = sampleHash;
  }

  samples.sort((left, right) => left - right);
  let totalNs = 0;
  for (const sample of samples) totalNs += sample;
  return {
    label,
    groups,
    iterations,
    warmupIterations,
    totalMs: milliseconds(totalNs),
    averageMs: milliseconds(totalNs / iterations),
    p50Ms: milliseconds(percentile(samples, 0.5)),
    p95Ms: milliseconds(percentile(samples, 0.95)),
    p99Ms: milliseconds(percentile(samples, 0.99)),
    hash,
    hashesEqual: hashes.size === 1,
    population: world.popBlocks.reduce((total, block) => total + populationTotal(block), 0),
    fixtureBlocks: world.popBlocks.length,
    fixtureBuildings: world.buildings.length,
    transactions,
    wages,
    postings,
    marketPurchasesSUSD,
    wagesPaidSUSD,
    unpaidWagesSUSD,
    upkeepPaidSUSD,
    unpaidUpkeepSUSD,
    producerProfitSUSD,
    minTransactions,
    minWagesPaidSUSD,
    minUpkeepPaidSUSD,
    minPostings,
  };
}

function printSettlementBenchmark(result: SettlementBenchmarkResult): void {
  console.log(
    `${result.label} (${String(result.groups)} group(s), ${String(result.fixtureBlocks)} pop blocks, ` +
      `${String(result.fixtureBuildings)} buildings):`,
  );
  console.log(
    `  ${String(result.iterations)} settlements; warm-up ${String(result.warmupIterations)}; ` +
      `market-day setup, reset, and hashing excluded; settlement validation included`,
  );
  console.log(
    `  ${String(result.transactions)} transactions, ${String(result.wages)} wage settlements, ` +
      `${String(result.postings)} postings`,
  );
  console.log(
    `  purchases ${result.marketPurchasesSUSD.toFixed(3)} SUSD, wages paid ` +
      `${result.wagesPaidSUSD.toFixed(3)}, unpaid wages ${result.unpaidWagesSUSD.toFixed(3)}, ` +
      `upkeep paid ${result.upkeepPaidSUSD.toFixed(3)}, unpaid upkeep ${result.unpaidUpkeepSUSD.toFixed(3)}, ` +
      `producer profit ${result.producerProfitSUSD.toFixed(3)}`,
  );
  console.log(
    `  total ${formatMs(result.totalMs)} ms, avg ${formatMs(result.averageMs)} ms, ` +
      `p50 ${formatMs(result.p50Ms)} ms, p95 ${formatMs(result.p95Ms)} ms, ` +
      `p99 ${formatMs(result.p99Ms)} ms, population ${String(result.population)}, hash ${result.hash}`,
  );
}

function runEconomicDayBenchmark(
  label: string,
  groups: number,
  iterations: number,
  warmupIterations: number,
): EconomicDayBenchmarkResult {
  const scenario = scaledProductionScenario(groups);
  const context: TickContext = {
    population: { definitions: scenario.population.definitions },
    economy: { definitions: scenario.definitions },
  };
  const world = createEconomyWorld(scenario, { seed: SEED });
  const secondWorld = createEconomyWorld(scenario, { seed: SEED });
  const cashBefore = designatedCashTotal(world.finance);

  const runDays = (
    target: World,
    measured: boolean,
  ): {
    readonly samples: number[];
    readonly transactions: number;
    readonly wageSettlements: number;
    readonly upkeepSettlements: number;
    readonly postings: number;
    readonly fallbackDays: number;
    readonly minTransactions: number;
    readonly minWages: number;
    readonly minUpkeep: number;
  } => {
    for (let index = 0; index < warmupIterations; index += 1) tick(target, context);
    const samples: number[] = [];
    let transactions = 0;
    let wageSettlements = 0;
    let upkeepSettlements = 0;
    let postings = 0;
    let fallbackDays = 0;
    let minTransactions = Number.MAX_SAFE_INTEGER;
    let minWages = Number.MAX_SAFE_INTEGER;
    let minUpkeep = Number.MAX_SAFE_INTEGER;
    for (let index = 0; index < iterations; index += 1) {
      const start = process.hrtime.bigint();
      const result = tick(target, context);
      const end = process.hrtime.bigint();
      if (measured) samples.push(Number(end - start));
      const economy = result.economy;
      if (economy === undefined) throw new Error("M3f economic tick did not return economy results");
      transactions += economy.settlement.transactions.length;
      wageSettlements += economy.settlement.wages.length;
      upkeepSettlements += economy.settlement.upkeep.length;
      postings += economy.settlement.postingIds.length;
      if (economy.fallbackUsed) fallbackDays += 1;
      minTransactions = Math.min(minTransactions, economy.settlement.transactions.length);
      minWages = Math.min(minWages, economy.settlement.wages.length);
      minUpkeep = Math.min(minUpkeep, economy.settlement.upkeep.length);
    }
    return {
      samples,
      transactions,
      wageSettlements,
      upkeepSettlements,
      postings,
      fallbackDays,
      minTransactions,
      minWages,
      minUpkeep,
    };
  };

  const first = runDays(world, true);
  runDays(secondWorld, false);
  const samples = first.samples.sort((left, right) => left - right);
  let totalNs = 0;
  for (const sample of samples) totalNs += sample;
  const cashAfter = designatedCashTotal(world.finance);
  return {
    label,
    groups,
    iterations,
    warmupIterations,
    totalMs: milliseconds(totalNs),
    averageMs: milliseconds(totalNs / iterations),
    p50Ms: milliseconds(percentile(samples, 0.5)),
    p95Ms: milliseconds(percentile(samples, 0.95)),
    p99Ms: milliseconds(percentile(samples, 0.99)),
    hash: hashWorld(world),
    hashesEqual: hashWorld(secondWorld) === hashWorld(world),
    cashConserved: Math.abs(cashBefore - cashAfter) <= 1e-6,
    population: world.popBlocks.reduce((total, block) => total + populationTotal(block), 0),
    fixtureBlocks: world.popBlocks.length,
    fixtureBuildings: world.buildings.length,
    finalDay: world.dayIndex,
    transactions: first.transactions,
    wageSettlements: first.wageSettlements,
    upkeepSettlements: first.upkeepSettlements,
    postings: first.postings,
    fallbackDays: first.fallbackDays,
    minTransactions: first.minTransactions,
    minWages: first.minWages,
    minUpkeep: first.minUpkeep,
  };
}

function printEconomicDayBenchmark(result: EconomicDayBenchmarkResult): void {
  console.log(
    `${result.label} (${String(result.groups)} group(s), ${String(result.fixtureBlocks)} pop blocks, ` +
      `${String(result.fixtureBuildings)} buildings):`,
  );
  console.log(
    `  ${String(result.iterations)} integrated economic days; warm-up ${String(result.warmupIterations)}; ` +
      `tick only; setup/reset/hash excluded`,
  );
  console.log(
    `  ${String(result.transactions)} transactions, ${String(result.wageSettlements)} wage settlements, ` +
      `${String(result.upkeepSettlements)} upkeep settlements, ${String(result.postings)} postings, ` +
      `${String(result.fallbackDays)} conservative-demand fallback day(s)`,
  );
  console.log(
    `  total ${formatMs(result.totalMs)} ms, avg ${formatMs(result.averageMs)} ms, ` +
      `p50 ${formatMs(result.p50Ms)} ms, p95 ${formatMs(result.p95Ms)} ms, ` +
      `p99 ${formatMs(result.p99Ms)} ms, population ${String(result.population)}, ` +
      `final day ${String(result.finalDay)}, hash ${result.hash}`,
  );
}

function runFinanceCloseBenchmark(
  label: string,
  groups: number,
  iterations: number,
  warmupIterations: number,
): FinanceCloseBenchmarkResult {
  const scenario = scaledProductionScenario(groups);
  const context: TickContext = {
    population: { definitions: scenario.population.definitions },
    economy: { definitions: scenario.definitions },
  };
  // 1900-01-31 is the first civil month-end. The fixture starts two days earlier
  // so the measured close sees a populated partial period without the long-run
  // rounding drift of the scaled fixture; the close cost depends on the account
  // and posting count, not on the period length.
  const monthEnd = civilDateToDayIndex(1900, 1, 31);
  const base = createEconomyWorld(scenario, {
    seed: SEED,
    startDayIndex: monthEnd - 2,
  });
  while (base.dayIndex < monthEnd) tick(base, context);
  if (base.dayIndex !== monthEnd) {
    throw new Error("M4b close benchmark failed to reach the first month-end");
  }
  const baseCash = designatedCashTotal(base.finance);

  interface CloseMetrics {
    readonly nanoseconds: number;
    readonly summaryDay: number;
    readonly closingPostings: number;
    readonly flowTotal: number;
    readonly zeroed: boolean;
    readonly cashConserved: boolean;
    readonly identityPreserved: boolean;
    readonly summariesContiguous: boolean;
    readonly hash: string;
  }

  const measure = (world: World): CloseMetrics => {
    const start = process.hrtime.bigint();
    const result = closeFinancePeriod(world);
    const end = process.hrtime.bigint();
    let flowTotal = 0;
    for (const kind of FLOW_TRANSACTION_KINDS) flowTotal += result.summary.flowTotalsByKind[kind];
    let zeroed = true;
    for (const account of world.finance.accounts) {
      if (account.category !== "revenue" && account.category !== "expense") continue;
      if (account.balanceSUSD !== 0) zeroed = false;
    }
    let identityPreserved = true;
    try {
      assertAccountingIdentity(world.finance);
    } catch {
      identityPreserved = false;
    }
    const summariesContiguous =
      world.finance.periodSummaries.length === 1 &&
      result.summary.periodStartDay === world.startDayIndex &&
      result.summary.periodEndDay === monthEnd &&
      world.finance.closedThroughDay === monthEnd;
    // Advance before hashing: a published world requires closedThroughDay < dayIndex.
    world.dayIndex = monthEnd + 1;
    return {
      nanoseconds: Number(end - start),
      summaryDay: result.summary.periodEndDay,
      closingPostings: result.postingIds.length,
      flowTotal,
      zeroed,
      cashConserved: Math.abs(designatedCashTotal(world.finance) - baseCash) <= 1e-6,
      identityPreserved,
      summariesContiguous,
      hash: hashWorld(world),
    };
  };

  for (let index = 0; index < warmupIterations; index += 1) measure(cloneWorld(base));

  const samples: number[] = [];
  let measured: CloseMetrics | null = null;
  let minClosingPostings = Number.MAX_SAFE_INTEGER;
  for (let index = 0; index < iterations; index += 1) {
    const metrics = measure(cloneWorld(base));
    samples.push(metrics.nanoseconds);
    minClosingPostings = Math.min(minClosingPostings, metrics.closingPostings);
    if (measured === null) measured = metrics;
  }
  if (measured === null) throw new Error("M4b close benchmark produced no measurements");

  const firstCheck = cloneWorld(base);
  const firstSummary = JSON.stringify(closeFinancePeriod(firstCheck).summary);
  firstCheck.dayIndex = monthEnd + 1;
  const firstHash = hashWorld(firstCheck);
  const secondCheck = cloneWorld(base);
  const secondSummary = JSON.stringify(closeFinancePeriod(secondCheck).summary);
  secondCheck.dayIndex = monthEnd + 1;

  samples.sort((left, right) => left - right);
  let totalNs = 0;
  for (const sample of samples) totalNs += sample;
  return {
    label,
    groups,
    iterations,
    warmupIterations,
    totalMs: milliseconds(totalNs),
    averageMs: milliseconds(totalNs / iterations),
    p50Ms: milliseconds(percentile(samples, 0.5)),
    p95Ms: milliseconds(percentile(samples, 0.95)),
    p99Ms: milliseconds(percentile(samples, 0.99)),
    fixtureBlocks: base.popBlocks.length,
    fixtureBuildings: base.buildings.length,
    accounts: base.finance.accounts.length,
    summaryDay: measured.summaryDay,
    closingPostings: measured.closingPostings,
    minClosingPostings,
    flowTotalSUSD: measured.flowTotal,
    zeroed: measured.zeroed,
    cashConserved: measured.cashConserved,
    identityPreserved: measured.identityPreserved,
    summariesContiguous: measured.summariesContiguous,
    deterministic: firstSummary === secondSummary,
    hashesEqual: hashWorld(secondCheck) === firstHash,
    hash: measured.hash,
  };
}

function printFinanceCloseBenchmark(result: FinanceCloseBenchmarkResult): void {
  console.log(
    `${result.label} (${String(result.groups)} group(s), ${String(result.fixtureBlocks)} pop blocks, ` +
      `${String(result.fixtureBuildings)} buildings, ${String(result.accounts)} accounts):`,
  );
  console.log(
    `  ${String(result.iterations)} monthly closes at day ${String(result.summaryDay)}; ` +
      `warm-up ${String(result.warmupIterations)}; close only; setup/clone/hash excluded`,
  );
  console.log(
    `  ${String(result.closingPostings)} closing entries, ${result.flowTotalSUSD.toFixed(4)} SUSD gross flows, ` +
      `minimum entries ${String(result.minClosingPostings)}`,
  );
  console.log(
    `  total ${formatMs(result.totalMs)} ms, avg ${formatMs(result.averageMs)} ms, ` +
      `p50 ${formatMs(result.p50Ms)} ms, p95 ${formatMs(result.p95Ms)} ms, ` +
      `p99 ${formatMs(result.p99Ms)} ms, hash ${result.hash}`,
  );
}

interface FiscalBenchmarkResult {
  readonly label: string;
  readonly groups: number;
  readonly iterations: number;
  readonly warmupIterations: number;
  readonly totalMs: number;
  readonly averageMs: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly fixtureBlocks: number;
  readonly fixtureBuildings: number;
  readonly accounts: number;
  readonly incomeTaxSUSD: number;
  readonly welfarePaidSUSD: number;
  readonly welfareShortfallSUSD: number;
  readonly treasuryStartSUSD: number;
  readonly treasuryEndSUSD: number;
  readonly treasuryReconciled: boolean;
  readonly cashConserved: boolean;
  readonly identityPreserved: boolean;
  readonly hashesEqual: boolean;
  readonly hash: string;
}

/**
 * M4c benchmark scenario: the scaled M3 production economy plus one country with
 * an active income tax and welfare budget. The scaled fixture clears employment
 * for production benchmarks, so shift-level assignments are synthesized here to
 * give every group real wage settlements and therefore real tax receipts.
 */
function fiscalBenchmarkScenario(groups: number): EconomyScenarioDef {
  const scenario = scaledProductionScenario(groups);
  const employment: EconomyScenarioDef["employment"] = [];
  for (let group = 0; group < groups; group += 1) {
    employment.push(
      {
        id: group * 3,
        popBlockId: group * 4,
        buildingInstanceId: group * 8,
        professionId: 0,
        workers: 1000,
      },
      {
        id: group * 3 + 1,
        popBlockId: group * 4 + 1,
        buildingInstanceId: group * 8 + 1,
        professionId: 1,
        workers: 1000,
      },
      {
        id: group * 3 + 2,
        popBlockId: group * 4 + 2,
        buildingInstanceId: group * 8 + 6,
        professionId: 2,
        workers: 500,
      },
    );
  }
  const country: CountryInitialDef = {
    id: 0,
    tag: "BNC",
    name: "Benchmark Fiscal Country",
    monetary: { kind: "own", currencyId: 0 },
    regionIds: [0],
    treasuryAccountId: M4C_TREASURY_ACCOUNT_ID,
    initialTreasuryCashSUSD: 5_000_000,
    fiscal: { incomeTaxRate: 0.1, welfareBudgetSUSDPerYear: 1_000_000 },
  };
  return {
    ...scenario,
    employment,
    countries: [country],
    currencies: [
      { id: 0, key: "tst", name: "Benchmark Unit", issuer: { kind: "country", countryId: 0 } },
    ],
    currencyValuations: [
      {
        currencyId: 0,
        status: "specified",
        susdPerUnit: asSusdPerCurrencyUnit(1),
        setOnDay: 0,
        source: "scenario",
      },
    ],
  };
}

function treasuryCashOf(world: World): number {
  const country = world.countries[0];
  if (country === undefined) throw new Error("M4c benchmark world has no country");
  const account = world.finance.accounts.find(
    (candidate) => candidate.id === country.treasuryAccountId,
  );
  if (account === undefined) throw new Error("M4c benchmark world has no treasury account");
  return account.balanceSUSD;
}

function runFiscalBenchmark(
  label: string,
  groups: number,
  iterations: number,
  warmupIterations: number,
): FiscalBenchmarkResult {
  const scenario = fiscalBenchmarkScenario(groups);
  const context: TickContext = {
    population: { definitions: scenario.population.definitions },
    economy: { definitions: scenario.definitions },
  };
  const world = createEconomyWorld(scenario, { seed: SEED });
  const secondWorld = createEconomyWorld(scenario, { seed: SEED });
  const cashBefore = designatedCashTotal(world.finance);

  const runDays = (
    target: World,
    measured: boolean,
  ): {
    readonly samples: number[];
    readonly incomeTax: number;
    readonly welfarePaid: number;
    readonly welfareShortfall: number;
    readonly treasuryAtStart: number;
    readonly minIncomeTax: number;
    readonly minWelfarePaid: number;
  } => {
    for (let index = 0; index < warmupIterations; index += 1) tick(target, context);
    const treasuryAtStart = treasuryCashOf(target);
    const samples: number[] = [];
    let incomeTax = 0;
    let welfarePaid = 0;
    let welfareShortfall = 0;
    let minIncomeTax = Number.MAX_SAFE_INTEGER;
    let minWelfarePaid = Number.MAX_SAFE_INTEGER;
    for (let index = 0; index < iterations; index += 1) {
      const start = process.hrtime.bigint();
      const result = tick(target, context);
      const end = process.hrtime.bigint();
      if (measured) samples.push(Number(end - start));
      const fiscal = result.economy?.fiscal;
      if (fiscal === undefined) throw new Error("M4c fiscal tick did not return fiscal results");
      incomeTax += fiscal.totals.incomeTaxSUSD;
      welfarePaid += fiscal.totals.welfarePaidSUSD;
      welfareShortfall += fiscal.totals.welfareShortfallSUSD;
      minIncomeTax = Math.min(minIncomeTax, fiscal.totals.incomeTaxSUSD);
      minWelfarePaid = Math.min(minWelfarePaid, fiscal.totals.welfarePaidSUSD);
    }
    return {
      samples,
      incomeTax,
      welfarePaid,
      welfareShortfall,
      treasuryAtStart,
      minIncomeTax,
      minWelfarePaid,
    };
  };

  const first = runDays(world, true);
  runDays(secondWorld, false);
  const samples = [...first.samples].sort((left, right) => left - right);
  let totalNs = 0;
  for (const sample of samples) totalNs += sample;

  let identityPreserved = true;
  try {
    assertAccountingIdentity(world.finance);
  } catch {
    identityPreserved = false;
  }
  const treasuryEnd = treasuryCashOf(world);
  const expectedTreasury = first.treasuryAtStart + first.incomeTax - first.welfarePaid;
  const treasuryReconciled =
    Math.abs(treasuryEnd - expectedTreasury) <= 1e-6 * Math.max(1, Math.abs(expectedTreasury));
  return {
    label,
    groups,
    iterations,
    warmupIterations,
    totalMs: milliseconds(totalNs),
    averageMs: milliseconds(totalNs / iterations),
    p50Ms: milliseconds(percentile(samples, 0.5)),
    p95Ms: milliseconds(percentile(samples, 0.95)),
    p99Ms: milliseconds(percentile(samples, 0.99)),
    fixtureBlocks: world.popBlocks.length,
    fixtureBuildings: world.buildings.length,
    accounts: world.finance.accounts.length,
    incomeTaxSUSD: first.incomeTax,
    welfarePaidSUSD: first.welfarePaid,
    welfareShortfallSUSD: first.welfareShortfall,
    treasuryStartSUSD: first.treasuryAtStart,
    treasuryEndSUSD: treasuryEnd,
    treasuryReconciled,
    cashConserved: Math.abs(designatedCashTotal(world.finance) - cashBefore) <= 1e-6,
    identityPreserved,
    hashesEqual: hashWorld(secondWorld) === hashWorld(world),
    hash: hashWorld(world),
  };
}

function printFiscalBenchmark(result: FiscalBenchmarkResult): void {
  console.log(
    `${result.label} (${String(result.groups)} group(s), ${String(result.fixtureBlocks)} pop blocks, ` +
      `${String(result.fixtureBuildings)} buildings, ${String(result.accounts)} accounts):`,
  );
  console.log(
    `  ${String(result.iterations)} fiscal economic days; warm-up ${String(result.warmupIterations)}; ` +
      `tick only; setup/reset/hash excluded`,
  );
  console.log(
    `  income tax ${result.incomeTaxSUSD.toFixed(4)} SUSD, welfare paid ${result.welfarePaidSUSD.toFixed(4)} SUSD, ` +
      `shortfall ${result.welfareShortfallSUSD.toFixed(4)} SUSD, ` +
      `treasury ${result.treasuryStartSUSD.toFixed(2)} -> ${result.treasuryEndSUSD.toFixed(2)} SUSD`,
  );
  console.log(
    `  total ${formatMs(result.totalMs)} ms, avg ${formatMs(result.averageMs)} ms, ` +
      `p50 ${formatMs(result.p50Ms)} ms, p95 ${formatMs(result.p95Ms)} ms, ` +
      `p99 ${formatMs(result.p99Ms)} ms, hash ${result.hash}`,
  );
}

function runM1Case(run: number): RunResult {  const world = createInitialWorld({ seed: SEED, scenarioId: "m1-benchmark" });
  const tickSamplesNs = new Array<number>(CAMPAIGN_TICKS);
  let processed = 0;
  const startNs = process.hrtime.bigint();
  while (world.dayIndex < CAMPAIGN_TERMINAL_DAY_INDEX) {
    const tickStartNs = process.hrtime.bigint();
    const result = tick(world);
    const tickEndNs = process.hrtime.bigint();
    if (!result.advanced) break;
    tickSamplesNs[processed] = Number(tickEndNs - tickStartNs);
    processed += 1;
  }
  const totalNs = Number(process.hrtime.bigint() - startNs);
  tickSamplesNs.length = processed;
  const sorted = [...tickSamplesNs].sort((left, right) => left - right);
  return {
    run,
    ticks: processed,
    totalMs: milliseconds(totalNs),
    averageMs: milliseconds(processed === 0 ? Number.NaN : totalNs / processed),
    p50Ms: milliseconds(percentile(sorted, 0.5)),
    p95Ms: milliseconds(percentile(sorted, 0.95)),
    p99Ms: milliseconds(percentile(sorted, 0.99)),
    hash: hashWorld(world),
    finalDayIndex: world.dayIndex,
    population: 0,
  };
}

function stressScenario(blockCount: number): PopulationScenarioDef {
  const base = loadM2MultiBlock();
  const templates = base.popBlocks;
  const popBlocks = Array.from({ length: blockCount }, (_, index) => {
    const template = templates[index % templates.length];
    if (template === undefined) throw new Error("multi-block fixture has no templates");
    return {
      ...template,
      id: index,
      financialAccountId: index,
      maleAgeGroups: [...template.maleAgeGroups],
      femaleAgeGroups: [...template.femaleAgeGroups],
    };
  });
  const definitions = { ...base.definitions, scenarioId: `m2-stress-${String(blockCount)}` };
  return {
    ...base,
    scenarioId: `m2-stress-${String(blockCount)}`,
    popBlocks,
    regions: [{ ...base.regions[0]! }],
    definitions,
  };
}

function printResults(label: string, results: readonly RunResult[]): void {
  console.log(`${label}:`);
  for (const result of results) {
    console.log(
      `  run ${String(result.run)}: ${String(result.ticks)} ticks, ` +
        `total ${formatMs(result.totalMs)} ms, avg ${formatMs(result.averageMs)} ms, ` +
        `p50 ${formatMs(result.p50Ms)} ms, p95 ${formatMs(result.p95Ms)} ms, ` +
        `p99 ${formatMs(result.p99Ms)} ms, day ${String(result.finalDayIndex)}, ` +
        `population ${String(result.population)}, hash ${result.hash}`,
    );
  }
}

function thresholdSatisfied(results: readonly RunResult[], thresholdMs: number): boolean {
  return results.every((result) => result.p95Ms <= thresholdMs);
}

function main(): void {
  const cpuList = cpus();
  const firstCpu = cpuList[0];
  console.log("Century M1/M2/M3b/M3c/M3d/M3e/M3f/M4b/M4c/M5/M5a/M5b/M6/M7 simulation-core benchmark");
  console.log(`node: ${process.version} (${process.platform} ${process.arch})`);
  console.log(`cpu: ${firstCpu?.model ?? "unknown"} (${String(cpuList.length)} logical processors)`);
  console.log(`memory: ${(totalmem() / 1024 ** 3).toFixed(2)} GiB total`);
  console.log(`sim version: ${SIM_VERSION}; data version: ${DATA_PACKAGE_VERSION}`);
  console.log(`seed: ${String(SEED)}`);
  console.log(`M1: empty world, ${String(CAMPAIGN_TICKS)} ticks, ${String(MEASURED_RUNS_M1)} runs`);
  console.log(`M2 aggregate: 1 block, ${String(CAMPAIGN_TICKS)} ticks, ${String(M2_AGGREGATE_RUNS)} runs`);
  console.log(
    `M2 stress: ${M2_STRESS_SCALES.map((scale) => String(scale)).join(", ")} blocks; ` +
      `${String(M2_STRESS_TICKS)} ticks each; 1 run per scale`,
  );
  console.log(`warm-up: ${String(WARMUP_TICKS)} ticks for M1 and M2 aggregate`);
  console.log(`stress warm-up: ${String(STRESS_WARMUP_TICKS)} ticks per scale`);
  console.log(
    `M3b employment: small M3 world, ${String(M3B_EMPLOYMENT_ITERATIONS)} measured refreshes, ` +
      `${String(M3B_EMPLOYMENT_WARMUP)} warm-up; dirty-triggered at day ${String(M3B_EMPLOYMENT_DAY)}`,
  );
  console.log(
    `M3c production: small M3 world (${String(M3C_SMALL_ITERATIONS)} phases, ` +
      `${String(M3C_SMALL_WARMUP)} warm-up) and ${String(M3C_STRESS_GROUPS)}-group stress ` +
      `(${String(M3C_STRESS_ITERATIONS)} phases, ${String(M3C_STRESS_WARMUP)} warm-up)`,
  );
  console.log(
    `M3d market days: small M3 world (${String(M3D_SMALL_ITERATIONS)} days, ` +
      `${String(M3D_SMALL_WARMUP)} warm-up) and ${String(M3D_STRESS_GROUPS)}-group stress ` +
      `(${String(M3D_STRESS_ITERATIONS)} days, ${String(M3D_STRESS_WARMUP)} warm-up)`,
  );
  console.log(
    `M3e settlement: small M3 world (${String(M3E_SMALL_ITERATIONS)} settlements, ` +
      `${String(M3E_SMALL_WARMUP)} warm-up) and ${String(M3E_STRESS_GROUPS)}-group stress ` +
      `(${String(M3E_STRESS_ITERATIONS)} settlements, ${String(M3E_STRESS_WARMUP)} warm-up)`,
  );
  console.log(
    `M3f economic days: small M3 world (${String(M3F_SMALL_ITERATIONS)} days, ` +
      `${String(M3F_SMALL_WARMUP)} warm-up) and ${String(M3F_STRESS_GROUPS)}-group stress ` +
      `(${String(M3F_STRESS_ITERATIONS)} days, ${String(M3F_STRESS_WARMUP)} warm-up)`,
  );
  console.log(
    `M4b period closes: small M3 world (${String(M4B_CLOSE_SMALL_ITERATIONS)} closes, ` +
      `${String(M4B_CLOSE_SMALL_WARMUP)} warm-up) and ${String(M4B_CLOSE_STRESS_GROUPS)}-group stress ` +
      `(${String(M4B_CLOSE_STRESS_ITERATIONS)} closes, ${String(M4B_CLOSE_STRESS_WARMUP)} warm-up)`,
  );
  console.log(
    `M4c fiscal days: small M3 world (${String(M4C_FISCAL_SMALL_ITERATIONS)} days, ` +
      `${String(M4C_FISCAL_SMALL_WARMUP)} warm-up) and ${String(M4C_FISCAL_STRESS_GROUPS)}-group stress ` +
      `(${String(M4C_FISCAL_STRESS_ITERATIONS)} days, ${String(M4C_FISCAL_STRESS_WARMUP)} warm-up)`,
  );

  const warmupM1 = createInitialWorld({ seed: SEED, scenarioId: "m1-benchmark" });
  for (let index = 0; index < WARMUP_TICKS; index += 1) tick(warmupM1);
  const aggregateScenario = loadM2WorldAggregate();
  const aggregateWarmup = createPopulationWorld(aggregateScenario, { seed: SEED });
  const aggregateContext = contextFor(
    aggregateScenario,
    aggregateWarmup.popBlocks.map((block) => block.id),
  );
  for (let index = 0; index < WARMUP_TICKS; index += 1) {
    tick(aggregateWarmup, aggregateContext);
  }

  const m1Results: RunResult[] = [];
  for (let run = 1; run <= MEASURED_RUNS_M1; run += 1) m1Results.push(runM1Case(run));
  const m2AggregateResults: RunResult[] = [];
  for (let run = 1; run <= M2_AGGREGATE_RUNS; run += 1) {
    m2AggregateResults.push(runPopulationCase(run, aggregateScenario, CAMPAIGN_TICKS));
  }
  const m2StressResults: { blocks: number; results: RunResult[] }[] = [];
  for (const blockCount of M2_STRESS_SCALES) {
    const stress = stressScenario(blockCount);
    const warmWorld = createPopulationWorld(stress, { seed: SEED });
    const warmContext = contextFor(
      stress,
      warmWorld.popBlocks.map((block) => block.id),
    );
    for (let index = 0; index < STRESS_WARMUP_TICKS; index += 1) {
      tick(warmWorld, warmContext);
    }
    m2StressResults.push({
      blocks: blockCount,
      results: [runPopulationCase(1, stress, M2_STRESS_TICKS)],
    });
  }

  const m3bEmployment = runM3bEmploymentCase();
  const m3cSmall = runProductionBenchmark(
    "M3c production (small)",
    1,
    M3C_SMALL_ITERATIONS,
    M3C_SMALL_WARMUP,
  );
  const m3cStress = runProductionBenchmark(
    "M3c production (stress)",
    M3C_STRESS_GROUPS,
    M3C_STRESS_ITERATIONS,
    M3C_STRESS_WARMUP,
  );
  const m3dSmall = runMarketBenchmark(
    "M3d market day (small)",
    1,
    M3D_SMALL_ITERATIONS,
    M3D_SMALL_WARMUP,
  );
  const m3dStress = runMarketBenchmark(
    "M3d market day (stress)",
    M3D_STRESS_GROUPS,
    M3D_STRESS_ITERATIONS,
    M3D_STRESS_WARMUP,
  );
  const m3eSmall = runSettlementBenchmark(
    "M3e settlement (small)",
    1,
    M3E_SMALL_ITERATIONS,
    M3E_SMALL_WARMUP,
  );
  const m3eStress = runSettlementBenchmark(
    "M3e settlement (stress)",
    M3E_STRESS_GROUPS,
    M3E_STRESS_ITERATIONS,
    M3E_STRESS_WARMUP,
  );
  const m3fSmall = runEconomicDayBenchmark(
    "M3f economic day (small)",
    1,
    M3F_SMALL_ITERATIONS,
    M3F_SMALL_WARMUP,
  );
  const m3fStress = runEconomicDayBenchmark(
    "M3f economic day (stress)",
    M3F_STRESS_GROUPS,
    M3F_STRESS_ITERATIONS,
    M3F_STRESS_WARMUP,
  );
  const m4bCloseSmall = runFinanceCloseBenchmark(
    "M4b period close (small)",
    1,
    M4B_CLOSE_SMALL_ITERATIONS,
    M4B_CLOSE_SMALL_WARMUP,
  );
  const m4bCloseStress = runFinanceCloseBenchmark(
    "M4b period close (stress)",
    M4B_CLOSE_STRESS_GROUPS,
    M4B_CLOSE_STRESS_ITERATIONS,
    M4B_CLOSE_STRESS_WARMUP,
  );
  const m4cFiscalSmall = runFiscalBenchmark(
    "M4c fiscal day (small)",
    1,
    M4C_FISCAL_SMALL_ITERATIONS,
    M4C_FISCAL_SMALL_WARMUP,
  );
  const m4cFiscalStress = runFiscalBenchmark(
    "M4c fiscal day (stress)",
    M4C_FISCAL_STRESS_GROUPS,
    M4C_FISCAL_STRESS_ITERATIONS,
    M4C_FISCAL_STRESS_WARMUP,
  );

  printResults("M1 empty-world no-op", m1Results);
  printResults("M2 world aggregate century", m2AggregateResults);
  for (const { blocks, results } of m2StressResults) {
    printResults(`M2 stress (${String(blocks)} blocks)`, results);
  }
  printEmploymentBenchmark(m3bEmployment);
  printProductionBenchmark(m3cSmall);
  printProductionBenchmark(m3cStress);
  printMarketBenchmark(m3dSmall);
  printMarketBenchmark(m3dStress);
  printSettlementBenchmark(m3eSmall);
  printSettlementBenchmark(m3eStress);
  printEconomicDayBenchmark(m3fSmall);
  printEconomicDayBenchmark(m3fStress);
  printFinanceCloseBenchmark(m4bCloseSmall);
  printFinanceCloseBenchmark(m4bCloseStress);
  printFiscalBenchmark(m4cFiscalSmall);
  printFiscalBenchmark(m4cFiscalStress);
  const m5Valid = runM5Benchmarks();
  const m6Valid = runM6BoundedBenchmarks();
  const m7Valid = runM7Benchmarks();

  const m1Hashes = new Set(m1Results.map((result) => result.hash));
  const aggregateHashes = new Set(m2AggregateResults.map((result) => result.hash));
  const allTerminal = m2AggregateResults.every(
    (result) => result.finalDayIndex === CAMPAIGN_TERMINAL_DAY_INDEX,
  );
  const m1Threshold = thresholdSatisfied(m1Results, M1_P95_REGRESSION_THRESHOLD_MS);
  const aggregateThreshold = thresholdSatisfied(
    m2AggregateResults,
    M2_AGGREGATE_P95_REGRESSION_THRESHOLD_MS,
  );
  const stressThreshold = m2StressResults
    .filter(({ blocks }) => blocks === 200)
    .every(({ results }) => thresholdSatisfied(results, M2_STRESS_P95_REGRESSION_THRESHOLD_MS));
  const stressTicksComplete = m2StressResults.every(({ results }) =>
    results.every((result) => result.ticks === M2_STRESS_TICKS),
  );
  const m3bEmploymentValid =
    m3bEmployment.hashesEqual &&
    m3bEmployment.capsValid &&
    m3bEmployment.refreshedEveryIteration &&
    m3bEmployment.minCreatedAssignments > 0;
  const productionValid = (result: ProductionBenchmarkResult): boolean =>
    result.hashesEqual &&
    result.minReservationsUsed > 0 &&
    result.minProduction > 0 &&
    result.minInputsUsed > 0;
  const m3cValid = productionValid(m3cSmall) && productionValid(m3cStress);
  const marketValid = (result: MarketBenchmarkResult): boolean =>
    result.hashesEqual &&
    result.minHouseholdFulfilled > 0 &&
    result.minPassBFulfilled > 0 &&
    result.minProductionUsed > 0 &&
    result.minPriceChanges > 0;
  const m3dValid = marketValid(m3dSmall) && marketValid(m3dStress);
  const settlementValid = (result: SettlementBenchmarkResult): boolean =>
    result.hashesEqual &&
    result.minTransactions > 0 &&
    result.minWagesPaidSUSD > 0 &&
    result.minUpkeepPaidSUSD > 0 &&
    result.minPostings > 0;
  const m3eValid = settlementValid(m3eSmall) && settlementValid(m3eStress);
  const economicDayValid = (result: EconomicDayBenchmarkResult): boolean =>
    result.hashesEqual &&
    result.cashConserved &&
    result.minTransactions > 0 &&
    result.minWages > 0 &&
    result.minUpkeep > 0;
  const m3fValid = economicDayValid(m3fSmall) && economicDayValid(m3fStress);
  const financeCloseValid = (result: FinanceCloseBenchmarkResult): boolean =>
    result.hashesEqual &&
    result.deterministic &&
    result.zeroed &&
    result.cashConserved &&
    result.identityPreserved &&
    result.summariesContiguous &&
    result.minClosingPostings > 0 &&
    result.flowTotalSUSD > 0;
  const m4bValid = financeCloseValid(m4bCloseSmall) && financeCloseValid(m4bCloseStress);
  const fiscalValid = (result: FiscalBenchmarkResult): boolean =>
    result.hashesEqual &&
    result.treasuryReconciled &&
    result.cashConserved &&
    result.identityPreserved &&
    result.incomeTaxSUSD > 0 &&
    result.welfarePaidSUSD > 0;
  const m4cValid = fiscalValid(m4cFiscalSmall) && fiscalValid(m4cFiscalStress);
  const passed =
    m1Results.every((result) => result.ticks === CAMPAIGN_TICKS) &&
    m2AggregateResults.every((result) => result.ticks === CAMPAIGN_TICKS) &&
    stressTicksComplete &&
    m1Hashes.size === 1 &&
    aggregateHashes.size === 1 &&
    allTerminal &&
    m1Threshold &&
    aggregateThreshold &&
    stressThreshold &&
    m3bEmploymentValid &&
    m3cValid &&
    m3dValid &&
    m3eValid &&
    m3fValid &&
    m4bValid &&
    m4cValid &&
    m5Valid &&
    m6Valid &&
    m7Valid;

  console.log("");
  console.log(`M1 tick count ${String(CAMPAIGN_TICKS)}: ${m1Results.every((result) => result.ticks === CAMPAIGN_TICKS) ? "PASS" : "FAIL"}`);
  console.log(`M2 century terminal day ${String(CAMPAIGN_TERMINAL_DAY_INDEX)}: ${allTerminal ? "PASS" : "FAIL"}`);
  console.log(`M1 cross-run hash: ${m1Hashes.size === 1 ? "PASS" : "FAIL"}`);
  console.log(`M2 aggregate cross-run hash: ${aggregateHashes.size === 1 ? "PASS" : "FAIL"}`);
  console.log(
    `M1 provisional Node threshold (p95 <= ${String(M1_P95_REGRESSION_THRESHOLD_MS)} ms): ` +
      `${m1Threshold ? "SATISFIED" : "NOT SATISFIED"}`,
  );
  console.log(
    `M2 aggregate provisional Node threshold (p95 <= ${String(M2_AGGREGATE_P95_REGRESSION_THRESHOLD_MS)} ms): ` +
      `${aggregateThreshold ? "SATISFIED" : "NOT SATISFIED"}`,
  );
  console.log(
    `M2 stress scales completed (${M2_STRESS_SCALES.map((scale) => String(scale)).join("/")} blocks): ` +
      `${stressTicksComplete ? "PASS" : "FAIL"}`,
  );
  console.log(
    `M2 200-block stress provisional Node threshold (p95 <= ${String(M2_STRESS_P95_REGRESSION_THRESHOLD_MS)} ms): ` +
      `${stressThreshold ? "SATISFIED" : "NOT SATISFIED"}`,
  );
  console.log(
    `M2 1000/3000/6000-block results are diagnostic scale probes, not acceptance thresholds.`,
  );
  console.log(
    `M3b employment caps valid: ${m3bEmployment.capsValid ? "PASS" : "FAIL"}`,
  );
  console.log(
    `M3b employment cross-run hash: ${m3bEmployment.hashesEqual ? "PASS" : "FAIL"}`,
  );
  console.log(
    `M3b employment refreshed every iteration: ${m3bEmployment.refreshedEveryIteration ? "PASS" : "FAIL"}`,
  );
  console.log(
    `M3b employment created assignments every iteration: ${m3bEmployment.minCreatedAssignments > 0 ? "PASS" : "FAIL"}`,
  );
  console.log(
    `M3c production small checks: ${productionValid(m3cSmall) ? "PASS" : "FAIL"}; ` +
      `stress checks: ${productionValid(m3cStress) ? "PASS" : "FAIL"}`,
  );
  console.log(
    `M3d market small checks: ${marketValid(m3dSmall) ? "PASS" : "FAIL"}; ` +
      `stress checks: ${marketValid(m3dStress) ? "PASS" : "FAIL"}`,
  );
  console.log(
    `M3e settlement small checks: ${settlementValid(m3eSmall) ? "PASS" : "FAIL"}; ` +
      `stress checks: ${settlementValid(m3eStress) ? "PASS" : "FAIL"}`,
  );
  console.log(
    `M3f economic day small checks: ${economicDayValid(m3fSmall) ? "PASS" : "FAIL"}; ` +
      `stress checks: ${economicDayValid(m3fStress) ? "PASS" : "FAIL"}`,
  );
  console.log(
    `M4b period close small checks: ${financeCloseValid(m4bCloseSmall) ? "PASS" : "FAIL"}; ` +
      `stress checks: ${financeCloseValid(m4bCloseStress) ? "PASS" : "FAIL"}`,
  );
  console.log(
    `M4b close zeroing/cash/identity/contiguity/determinism: ` +
      `${m4bValid ? "PASS" : "FAIL"}`,
  );
  console.log(
    `M4c fiscal small checks: ${fiscalValid(m4cFiscalSmall) ? "PASS" : "FAIL"}; ` +
      `stress checks: ${fiscalValid(m4cFiscalStress) ? "PASS" : "FAIL"}`,
  );
  console.log(
    `M4c treasury reconciliation/cash/identity/tax/welfare/determinism: ` +
      `${m4cValid ? "PASS" : "FAIL"}`,
  );
  console.log(
    `M5 multi-country campaign/serialization/migration/stress: ${m5Valid ? "PASS" : "FAIL"}`,
  );
  console.log(
    `M6 country-AI campaign/stress/validation: ${m6Valid ? "PASS" : "FAIL"}`,
  );
  console.log(
    `M6 full-campaign benchmark: separate opt-in command "pnpm run bench:campaign"`,
  );
  console.log(`M7 worker host/snapshot/save benchmark: ${m7Valid ? "PASS" : "FAIL"}`);
  console.log(
    `GDD §14.4 mobile p95 target (<= ${String(GDD_MOBILE_P95_TARGET_MS)} ms, full reference world): ` +
      "NOT EVALUATED (Node harness; no device/full-scale world)",
  );
  console.log(`benchmark result: ${passed ? "PASS" : "FAIL"}`);

  if (!passed) process.exitCode = 1;
}

main();
