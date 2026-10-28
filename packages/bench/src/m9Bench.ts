/**
 * M9 technology/education benchmark.
 *
 * Node regression harness, not a mobile-performance claim. It measures the
 * integrated tick with active research, the isolated education/research phase, and
 * save/restore with M9 state on the authored eight-polity scenario. It asserts
 * determinism and validity; it does not impose a new timing threshold.
 */

import {
  applyCountryAction,
  assertValidWorld,
  cloneWorld,
  createEconomyWorld,
  deserializeWorld,
  hashWorld,
  runEducationPhase,
  runTicks,
  serializeWorld,
  tick,
  type CountryAction,
  type EconomyScenarioDef,
  type TickContext,
  type World,
} from "@century/sim";
import { loadM5EightPolities } from "@century/data";

const SEED = 20_261_031;
const M9_WARMUP_TICKS = 2;
const M9_MEASURED_TICKS = 4;
const M9_RUNS = 2;
const M9_PHASE_ITERATIONS = 5;
const M9_SERIALIZATION_ITERATIONS = 3;
/** First technology with no prerequisites that the authored scenario does not start with. */
const M9_BENCH_TECHNOLOGY = 1;

interface SampleStats {
  readonly count: number;
  readonly averageMs: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
}

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(fraction * sorted.length) - 1),
  );
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

function startResearchAction(world: World): CountryAction {
  const country = world.countries[0];
  if (country === undefined) throw new Error("M9 benchmark scenario has no countries");
  return {
    kind: "start-research",
    countryId: country.id,
    dayIndex: world.dayIndex,
    source: "player",
    technologyId: M9_BENCH_TECHNOLOGY,
  };
}

export function runM9Benchmarks(): boolean {
  const scenario = loadM5EightPolities();
  const context = contextFor(scenario);

  // Integrated tick with an active research project.
  const runSamples: number[][] = [];
  const hashes: string[] = [];
  let finalWorld: World | null = null;
  for (let run = 0; run < M9_RUNS; run += 1) {
    const world = createEconomyWorld(scenario, { seed: SEED });
    applyCountryAction(world, startResearchAction(world), scenario.definitions);
    runTicks(world, M9_WARMUP_TICKS, context);
    const samples: number[] = [];
    for (let index = 0; index < M9_MEASURED_TICKS; index += 1) {
      const start = process.hrtime.bigint();
      tick(world, context);
      samples.push(nanosecondsToMs(process.hrtime.bigint() - start));
    }
    runSamples.push(samples);
    hashes.push(hashWorld(world));
    finalWorld = world;
  }
  if (finalWorld === null) throw new Error("M9 benchmark did not run");
  assertValidWorld(finalWorld);
  const combined = stats(runSamples.flat());
  const runStats = runSamples.map(stats);
  const deterministic = new Set(hashes).size === 1;

  // Isolated education/research phase. Cloning and validating are outside the
  // timer; each iteration runs the phase once on an identical copy.
  const phaseBase = createEconomyWorld(scenario, { seed: SEED });
  applyCountryAction(phaseBase, startResearchAction(phaseBase), scenario.definitions);
  const phaseSamples: number[] = [];
  let phaseHasRun = false;
  for (let index = 0; index < M9_PHASE_ITERATIONS; index += 1) {
    const candidate = cloneWorld(phaseBase);
    const start = process.hrtime.bigint();
    const result = runEducationPhase(candidate, scenario.definitions, candidate.dayIndex, {
      validateWorld: false,
    });
    phaseSamples.push(nanosecondsToMs(process.hrtime.bigint() - start));
    phaseHasRun = result.countries.length > 0;
  }
  const phaseStats = stats(phaseSamples);

  // Save/restore with technology and age-specific literacy state.
  const serializationSamples: number[] = [];
  let roundTrips = true;
  const expectedHash = hashWorld(finalWorld);
  for (let index = 0; index < M9_SERIALIZATION_ITERATIONS; index += 1) {
    const start = process.hrtime.bigint();
    const restored = deserializeWorld(serializeWorld(finalWorld));
    serializationSamples.push(nanosecondsToMs(process.hrtime.bigint() - start));
    if (hashWorld(restored) !== expectedHash) roundTrips = false;
    assertValidWorld(restored);
  }
  const serializationStats = stats(serializationSamples);

  const researchedCount = finalWorld.countries[0]?.technology.researched.length ?? 0;
  const hasActiveProject =
    finalWorld.countries[0]?.technology.activeProject?.technologyId ===
    M9_BENCH_TECHNOLOGY;

  console.log("");
  console.log(
    `M9 technology/education: ${String(finalWorld.countries.length)} countries, ` +
      `${String(finalWorld.popBlocks.length)} blocks, researched ${String(researchedCount)}, ` +
      `active project ${hasActiveProject ? String(M9_BENCH_TECHNOLOGY) : "none"}`,
  );
  for (let index = 0; index < runStats.length; index += 1) {
    const result = runStats[index];
    if (result === undefined) continue;
    console.log(
      `  integrated run ${String(index + 1)}: ${String(result.count)} ticks, ` +
        `avg ${formatMs(result.averageMs)} ms, p50 ${formatMs(result.p50Ms)} ms, ` +
        `p95 ${formatMs(result.p95Ms)} ms, p99 ${formatMs(result.p99Ms)} ms, ` +
        `hash ${hashes[index] ?? "?"}`,
    );
  }
  console.log(
    `  education phase: ${String(phaseStats.count)} runs, avg ${formatMs(phaseStats.averageMs)} ms, ` +
      `p50 ${formatMs(phaseStats.p50Ms)} ms, p95 ${formatMs(phaseStats.p95Ms)} ms`,
  );
  console.log(
    `  save/restore with M9 state: ${String(serializationStats.count)} runs, ` +
      `avg ${formatMs(serializationStats.averageMs)} ms, p95 ${formatMs(serializationStats.p95Ms)} ms`,
  );

  const passed =
    deterministic &&
    phaseHasRun &&
    roundTrips &&
    hasActiveProject &&
    combined.averageMs >= 0;
  console.log(
    `M9 deterministic replay / phase execution / save round-trip: ${passed ? "PASS" : "FAIL"}`,
  );
  return passed;
}
