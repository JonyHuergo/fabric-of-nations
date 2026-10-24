/**
 * Headless M2 benchmark harness.
 *
 * This is a Node regression harness, not proof of mobile performance. It runs:
 * - M1 empty-world no-op ticks (backwards regression);
 * - M2 world-aggregate century ticks;
 * - M2 multi-block stress ticks at 200, 1,000, 3,000, and 6,000 pop blocks.
 *
 * The GDD mobile target (p95 <= 8 ms on a full-scale reference world) requires
 * a device release build and is explicitly not evaluated here.
 */

import { cpus, totalmem } from "node:os";
import process from "node:process";

import {
  loadM2MultiBlock,
  loadM2WorldAggregate,
  DATA_PACKAGE_VERSION,
} from "@century/data";
import {
  CAMPAIGN_TERMINAL_DAY_INDEX,
  CAMPAIGN_TICKS,
  SIM_VERSION,
  createInitialWorld,
  createPopulationWorld,
  hashWorld,
  populationTotal,
  tick,
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

function runM1Case(run: number): RunResult {
  const world = createInitialWorld({ seed: SEED, scenarioId: "m1-benchmark" });
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
  console.log("Century M1/M2 simulation-core benchmark");
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

  printResults("M1 empty-world no-op", m1Results);
  printResults("M2 world aggregate century", m2AggregateResults);
  for (const { blocks, results } of m2StressResults) {
    printResults(`M2 stress (${String(blocks)} blocks)`, results);
  }

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
  const passed =
    m1Results.every((result) => result.ticks === CAMPAIGN_TICKS) &&
    m2AggregateResults.every((result) => result.ticks === CAMPAIGN_TICKS) &&
    stressTicksComplete &&
    m1Hashes.size === 1 &&
    aggregateHashes.size === 1 &&
    allTerminal &&
    m1Threshold &&
    aggregateThreshold &&
    stressThreshold;

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
    `GDD §14.4 mobile p95 target (<= ${String(GDD_MOBILE_P95_TARGET_MS)} ms, full reference world): ` +
      "NOT EVALUATED (Node harness; no device/full-scale world)",
  );
  console.log(`benchmark result: ${passed ? "PASS" : "FAIL"}`);

  if (!passed) process.exitCode = 1;
}

main();
