/**
 * M5 multi-country campaign benchmark.
 *
 * This is a Node regression harness, not a mobile-performance claim. It measures
 * a representative eight-polity campaign sample, serialization overhead, the
 * monthly migration phase, and a larger authored stress fixture. A full 36,524-tick
 * economic campaign is projected from the sample rather than executed: the
 * provisional harness runtime budget does not make a multi-hour run practical.
 */

import {
  assertValidWorld,
  cloneWorld,
  closeFinancePeriod,
  createEconomyWorld,
  deserializeWorld,
  hashWorld,
  populationTotal,
  runMigrationPhase,
  runProfitDistributionPhase,
  runTicks,
  serializeWorld,
  tick,
  type EconomyScenarioDef,
  type TickContext,
  type World,
} from "@century/sim";
import { loadM5EightPolities } from "@century/data";

const SEED = 20_261_023;
const M5_WARMUP_TICKS = 1;
const M5_MEASURED_TICKS = 8;
const M5_RUNS = 2;
const M5_SERIALIZATION_ITERATIONS = 3;
const M5_MIGRATION_ITERATIONS = 5;
const M5_STRESS_TICKS = 2;
const M5_MIGRATION_DAY = 31;
const M5A_ALLOCATION_ITERATIONS = 5;

interface SampleStats {
  readonly count: number;
  readonly totalMs: number;
  readonly averageMs: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
}

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1));
  return sorted[index] ?? 0;
}

function nanosecondsToMs(nanoseconds: bigint): number {
  return Number(nanoseconds) / 1_000_000;
}

function stats(samples: readonly number[]): SampleStats {
  const sorted = [...samples].sort((left, right) => left - right);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  return {
    count: sorted.length,
    totalMs: total,
    averageMs: sorted.length > 0 ? total / sorted.length : 0,
    p50Ms: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    p99Ms: percentile(sorted, 0.99),
  };
}

function formatMs(value: number): string {
  if (value >= 100) return value.toFixed(1);
  if (value >= 10) return value.toFixed(2);
  return value.toFixed(3);
}

function contextFor(scenario: EconomyScenarioDef): TickContext {
  return {
    population: { definitions: scenario.population.definitions },
    economy: { definitions: scenario.definitions },
  };
}

function structuralCounts(world: World): {
  readonly countries: number;
  readonly regions: number;
  readonly markets: number;
  readonly blocks: number;
  readonly buildings: number;
  readonly employment: number;
  readonly population: number;
} {
  return {
    countries: world.countries.length,
    regions: world.regions.length,
    markets: world.markets.length,
    blocks: world.popBlocks.length,
    buildings: world.buildings.length,
    employment: world.employment.length,
    population: world.popBlocks.reduce((total, block) => total + populationTotal(block), 0),
  };
}

/** Duplicate blocks and buildings to produce a larger multi-region campaign. */
function stressScenario(base: EconomyScenarioDef): EconomyScenarioDef {
  const extraBlocks = base.population.popBlocks.map((block, index) => ({
    ...block,
    id: base.population.popBlocks.length + index,
    financialAccountId: 600_000 + index,
    maleAgeGroups: [...base.population.popBlocks[index]?.maleAgeGroups ?? []],
    femaleAgeGroups: [...base.population.popBlocks[index]?.femaleAgeGroups ?? []],
  }));
  const extraBuildings = base.buildingInstances.map((building, index) => ({
    ...building,
    id: base.buildingInstances.length + index,
    operatingCashAccountId: 500_000 + index,
    initialOperatingCashSUSD: 10_000,
  }));
  return {
    ...base,
    population: {
      ...base.population,
      popBlocks: [...base.population.popBlocks, ...extraBlocks],
    },
    buildingInstances: [...base.buildingInstances, ...extraBuildings],
    employment: [],
  };
}

export function runM5Benchmarks(): boolean {
  const scenario = loadM5EightPolities();
  const context = contextFor(scenario);

  // Representative eight-polity campaign sample, two deterministic runs.
  const runSamples: number[][] = [];
  let hashes: string[] = [];
  let finalWorld: World | null = null;
  for (let run = 0; run < M5_RUNS; run += 1) {
    const world = createEconomyWorld(scenario, { seed: SEED });
    for (let index = 0; index < M5_WARMUP_TICKS; index += 1) tick(world, context);
    const samples: number[] = [];
    for (let index = 0; index < M5_MEASURED_TICKS; index += 1) {
      const start = process.hrtime.bigint();
      tick(world, context);
      samples.push(nanosecondsToMs(process.hrtime.bigint() - start));
    }
    runSamples.push(samples);
    hashes.push(hashWorld(world));
    finalWorld = world;
  }
  const runStats = runSamples.map(stats);
  const combined = stats(runSamples.flat());
  const deterministic = new Set(hashes).size === 1;
  if (finalWorld === null) throw new Error("M5 benchmark did not run");
  assertValidWorld(finalWorld);
  const counts = structuralCounts(finalWorld);

  // Serialization and validation overhead.
  const serializationSamples: number[] = [];
  for (let index = 0; index < M5_SERIALIZATION_ITERATIONS; index += 1) {
    const start = process.hrtime.bigint();
    const serialized = serializeWorld(finalWorld);
    const restored = deserializeWorld(serialized);
    assertValidWorld(restored);
    serializationSamples.push(nanosecondsToMs(process.hrtime.bigint() - start));
  }
  const serializationStats = stats(serializationSamples);

  // Migration phase cost on a month-start world, with cloning excluded.
  const migrationBase = createEconomyWorld(scenario, { seed: SEED });
  migrationBase.dayIndex = M5_MIGRATION_DAY;
  const migrationSamples: number[] = [];
  let migratedPeople = 0;
  let migrationHash = "";
  for (let index = 0; index < M5_MIGRATION_ITERATIONS; index += 1) {
    const candidate = cloneWorld(migrationBase);
    const start = process.hrtime.bigint();
    const result = runMigrationPhase(candidate, scenario.definitions, M5_MIGRATION_DAY);
    migrationSamples.push(nanosecondsToMs(process.hrtime.bigint() - start));
    migratedPeople = result.totalPeople;
    migrationHash = hashWorld(candidate);
  }
  const migrationStats = stats(migrationSamples);

  // M5a month-end allocation cost. The world is advanced to a month-end; each
  // measured iteration clones it, closes the clone outside the timer, and times
  // only the allocation phase.
  const m5aBaseWorld = createEconomyWorld(scenario, { seed: SEED });
  runTicks(m5aBaseWorld, 30, contextFor(scenario));
  const m5aSamples: number[] = [];
  let m5aApplied = false;
  let m5aBuildings = 0;
  let m5aDistributed = 0;
  for (let index = 0; index < M5A_ALLOCATION_ITERATIONS; index += 1) {
    const candidate = cloneWorld(m5aBaseWorld);
    const close = closeFinancePeriod(candidate);
    const start = process.hrtime.bigint();
    const result = runProfitDistributionPhase(candidate, 30, close);
    m5aSamples.push(nanosecondsToMs(process.hrtime.bigint() - start));
    m5aApplied = result.applied;
    m5aBuildings = result.buildings.length;
    m5aDistributed = result.totalPrivateDistributionSUSD + result.totalStateRemittanceSUSD;
  }
  const m5aStats = stats(m5aSamples);

  // Larger authored stress fixture: doubled blocks and buildings.
  const stress = stressScenario(scenario);
  const stressWorld = createEconomyWorld(stress, { seed: SEED });
  runTicks(stressWorld, M5_STRESS_TICKS, contextFor(stress));
  assertValidWorld(stressWorld);
  const stressCounts = structuralCounts(stressWorld);
  const stressHash = hashWorld(stressWorld);

  const projectedCampaignHours =
    (combined.averageMs * 36_524) / 1_000 / 60 / 60;

  console.log("");
  console.log(
    `M5 eight-polity campaign: ${String(counts.countries)} countries, ${String(counts.regions)} regions, ` +
      `${String(counts.markets)} markets, ${String(counts.blocks)} blocks, ` +
      `${String(counts.buildings)} buildings, ${String(counts.employment)} assignments, ` +
      `population ${String(counts.population)}`,
  );
  for (let index = 0; index < runStats.length; index += 1) {
    const result = runStats[index];
    if (result === undefined) continue;
    console.log(
      `  run ${String(index + 1)}: ${String(result.count)} ticks, avg ${formatMs(result.averageMs)} ms, ` +
        `p50 ${formatMs(result.p50Ms)} ms, p95 ${formatMs(result.p95Ms)} ms, ` +
        `p99 ${formatMs(result.p99Ms)} ms, hash ${hashes[index] ?? "?"}`,
    );
  }
  console.log(
    `  combined: avg ${formatMs(combined.averageMs)} ms/tick, p50 ${formatMs(combined.p50Ms)} ms, ` +
      `p95 ${formatMs(combined.p95Ms)} ms, p99 ${formatMs(combined.p99Ms)} ms`,
  );
  console.log(
    `  projected full campaign (${String(36_524)} economic ticks at the sample average): ` +
      `${projectedCampaignHours.toFixed(2)} h; NOT executed and NOT a mobile measurement`,
  );
  console.log(
    `  validation + serialization round trip: avg ${formatMs(serializationStats.averageMs)} ms, ` +
      `p50 ${formatMs(serializationStats.p50Ms)} ms, p95 ${formatMs(serializationStats.p95Ms)} ms`,
  );
  console.log(
    `  migration phase: avg ${formatMs(migrationStats.averageMs)} ms, p50 ${formatMs(migrationStats.p50Ms)} ms, ` +
      `p95 ${formatMs(migrationStats.p95Ms)} ms, ${String(migratedPeople)} people moved in the sample, ` +
      `hash ${migrationHash}`,
  );
  console.log(
    `  M5a profit allocation: avg ${formatMs(m5aStats.averageMs)} ms, p50 ${formatMs(m5aStats.p50Ms)} ms, ` +
      `p95 ${formatMs(m5aStats.p95Ms)} ms; ${String(m5aBuildings)} buildings, ` +
      `${m5aDistributed.toFixed(2)} SUSD distributed in the sample; clone/close excluded`,
  );
  console.log(
    `M5 stress: ${String(stressCounts.countries)} countries, ${String(stressCounts.regions)} regions, ` +
      `${String(stressCounts.markets)} markets, ${String(stressCounts.blocks)} blocks, ` +
      `${String(stressCounts.buildings)} buildings, ${String(stressCounts.employment)} assignments; ` +
      `${String(M5_STRESS_TICKS)} ticks; hash ${stressHash}`,
  );
  const valid =
    deterministic &&
    runStats.every((result) => result.p95Ms > 0) &&
    migrationStats.averageMs > 0 &&
    migratedPeople > 0 &&
    m5aStats.averageMs > 0 &&
    m5aApplied &&
    counts.countries === 8 &&
    counts.regions >= 16 &&
    counts.markets >= 5 &&
    counts.blocks >= 64 &&
    stressCounts.blocks >= counts.blocks * 2;
  console.log(`M5 multi-country benchmark gates: ${valid ? "PASS" : "FAIL"}`);
  return valid;
}
