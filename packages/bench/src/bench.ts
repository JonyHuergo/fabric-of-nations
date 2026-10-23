/**
 * Headless M1 benchmark harness.
 *
 * This is a Node regression harness, not proof of mobile performance. It measures
 * the no-op simulation core only: calendar-independent day advancement, ring
 * diagnostics, validation, and state hashing. The GDD's 8 ms full-scale mobile
 * p95 target requires the full reference world and an on-device release build,
 * neither of which exists in M1.
 *
 * The harness therefore applies a deliberately loose provisional Node regression
 * threshold (p95 <= 1 ms per tick) and prints the GDD target as explicitly not
 * evaluated. Timing instrumentation lives here, outside `packages/sim`.
 */

import { cpus, totalmem } from "node:os";
import process from "node:process";

import {
  CAMPAIGN_TERMINAL_DAY_INDEX,
  CAMPAIGN_TICKS,
  SIM_VERSION,
  createInitialWorld,
  hashWorld,
  tick,
  type World,
} from "@century/sim";

const SEED = 20_261_023;
const SCENARIO_ID = "m1-benchmark";
const MEASURED_RUNS = 3;
const WARMUP_TICKS = 2_000;
const NODE_P95_REGRESSION_THRESHOLD_MS = 1;
const GDD_MOBILE_P95_TARGET_MS = 8;

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

function nanosecondsToMilliseconds(value: number): number {
  return value / 1_000_000;
}

function formatMs(value: number): string {
  return value.toFixed(6);
}

function runOnce(run: number): RunResult {
  const world: World = createInitialWorld({ seed: SEED, scenarioId: SCENARIO_ID });
  const tickSamplesNs = new Array<number>(CAMPAIGN_TICKS);
  let ticks = 0;

  const startNs = process.hrtime.bigint();
  while (world.dayIndex < CAMPAIGN_TERMINAL_DAY_INDEX) {
    const tickStartNs = process.hrtime.bigint();
    const result = tick(world);
    const tickEndNs = process.hrtime.bigint();
    if (!result.advanced) break;
    tickSamplesNs[ticks] = Number(tickEndNs - tickStartNs);
    ticks += 1;
  }
  const totalNs = Number(process.hrtime.bigint() - startNs);
  tickSamplesNs.length = ticks;

  const sortedSamples = [...tickSamplesNs].sort((left, right) => left - right);
  const averageNs = ticks === 0 ? Number.NaN : totalNs / ticks;

  return {
    run,
    ticks,
    totalMs: nanosecondsToMilliseconds(totalNs),
    averageMs: nanosecondsToMilliseconds(averageNs),
    p50Ms: nanosecondsToMilliseconds(percentile(sortedSamples, 0.5)),
    p95Ms: nanosecondsToMilliseconds(percentile(sortedSamples, 0.95)),
    p99Ms: nanosecondsToMilliseconds(percentile(sortedSamples, 0.99)),
    hash: hashWorld(world),
    finalDayIndex: world.dayIndex,
  };
}

function main(): void {
  const cpuList = cpus();
  const firstCpu = cpuList[0];
  const cpuModel = firstCpu === undefined ? "unknown" : firstCpu.model;
  const memoryGiB = totalmem() / 1024 ** 3;

  console.log("Century M1 simulation-core benchmark");
  console.log(`node: ${process.version} (${process.platform} ${process.arch})`);
  console.log(`cpu: ${cpuModel} (${String(cpuList.length)} logical processors)`);
  console.log(`memory: ${memoryGiB.toFixed(2)} GiB total`);
  console.log(`sim version: ${SIM_VERSION}`);
  console.log(`scenario: ${SCENARIO_ID}`);
  console.log(`seed: ${String(SEED)}`);
  console.log(`world: M1 no-op (no countries, population, markets, or AI)`);
  console.log(`ticks per run: ${String(CAMPAIGN_TICKS)}`);
  console.log(`runs: ${String(MEASURED_RUNS)} measured, 1 warm-up (${String(WARMUP_TICKS)} ticks)`);

  const warmupWorld = createInitialWorld({ seed: SEED, scenarioId: SCENARIO_ID });
  for (let index = 0; index < WARMUP_TICKS; index += 1) {
    tick(warmupWorld);
  }

  const results: RunResult[] = [];
  for (let run = 1; run <= MEASURED_RUNS; run += 1) {
    results.push(runOnce(run));
  }

  console.log("");
  for (const result of results) {
    console.log(
      `run ${String(result.run)}: ${String(result.ticks)} ticks, ` +
        `total ${formatMs(result.totalMs)} ms, ` +
        `avg ${formatMs(result.averageMs)} ms, ` +
        `p50 ${formatMs(result.p50Ms)} ms, ` +
        `p95 ${formatMs(result.p95Ms)} ms, ` +
        `p99 ${formatMs(result.p99Ms)} ms, ` +
        `final day ${String(result.finalDayIndex)}, hash ${result.hash}`,
    );
  }

  const expectedTicks = results.every((result) => result.ticks === CAMPAIGN_TICKS);
  const expectedTerminal = results.every(
    (result) => result.finalDayIndex === CAMPAIGN_TERMINAL_DAY_INDEX,
  );
  const firstHash = results[0]?.hash;
  const hashesMatch = results.every((result) => result.hash === firstHash);
  const thresholdSatisfied = results.every(
    (result) => result.p95Ms <= NODE_P95_REGRESSION_THRESHOLD_MS,
  );

  const passed = expectedTicks && expectedTerminal && hashesMatch && thresholdSatisfied;

  console.log("");
  console.log(`tick count ${String(CAMPAIGN_TICKS)}: ${expectedTicks ? "PASS" : "FAIL"}`);
  console.log(
    `terminal day ${String(CAMPAIGN_TERMINAL_DAY_INDEX)}: ${expectedTerminal ? "PASS" : "FAIL"}`,
  );
  console.log(`cross-run state hash: ${hashesMatch ? "PASS" : "FAIL"}`);
  console.log(
    `provisional Node regression threshold (p95 <= ${String(NODE_P95_REGRESSION_THRESHOLD_MS)} ms): ` +
      `${thresholdSatisfied ? "SATISFIED" : "NOT SATISFIED"}`,
  );
  console.log(
    `GDD §14.4 mobile p95 target (<= ${String(GDD_MOBILE_P95_TARGET_MS)} ms, full reference world): ` +
      "NOT EVALUATED (M1 has no full-scale world and this is a Node run)",
  );
  console.log(`benchmark result: ${passed ? "PASS" : "FAIL"}`);

  if (!passed) {
    process.exitCode = 1;
  }
}

main();
