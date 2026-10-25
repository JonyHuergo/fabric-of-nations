/**
 * Headless M1/M2/M3b benchmark harness.
 *
 * This is a Node regression harness, not proof of mobile performance. It runs:
 * - M1 empty-world no-op ticks (backwards regression);
 * - M2 world-aggregate century ticks;
 * - M2 multi-block stress ticks at 200, 1,000, 3,000, and 6,000 pop blocks;
 * - M3b employment-refresh samples on the fixed small M3 world.
 *
 * Employment samples reset to a fixed seed-assignment state and time only the
 * real refresh routine. Setup, correctness validation, and hashing are excluded.
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
  SIM_VERSION,
  assertValidEmploymentState,
  assertValidWorld,
  computeBuildingCapacity,
  createEconomyWorld,
  createInitialWorld,
  createPopulationWorld,
  hashWorld,
  populationTotal,
  refreshEmploymentIfDue,
  runProductionPhase,
  tick,
  type EconomyScenarioDef,
  type InputReservation,
  type PopBlockInitialDef,
  type PopulationInputs,
  type PopulationScenarioDef,
  type TickContext,
  type World,
} from "@century/sim";

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
  console.log("Century M1/M2/M3b/M3c simulation-core benchmark");
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

  printResults("M1 empty-world no-op", m1Results);
  printResults("M2 world aggregate century", m2AggregateResults);
  for (const { blocks, results } of m2StressResults) {
    printResults(`M2 stress (${String(blocks)} blocks)`, results);
  }
  printEmploymentBenchmark(m3bEmployment);
  printProductionBenchmark(m3cSmall);
  printProductionBenchmark(m3cStress);

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
    m3cValid;

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
    `GDD §14.4 mobile p95 target (<= ${String(GDD_MOBILE_P95_TARGET_MS)} ms, full reference world): ` +
      "NOT EVALUATED (Node harness; no device/full-scale world)",
  );
  console.log(`benchmark result: ${passed ? "PASS" : "FAIL"}`);

  if (!passed) process.exitCode = 1;
}

main();
