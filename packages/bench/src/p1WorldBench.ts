/**
 * P1 world-scale benchmark entry point (`pnpm run bench:world`).
 *
 * Runs the real 1900 world (the playable M11 scenario) in both integrity modes:
 * the staged whole-day clone (`tick` default) and D-116 phase mode through the
 * rollback runner, which the worker host uses. Both runs must end on the same
 * world hash; the benchmark fails otherwise. Reported numbers are Node
 * diagnostics, not device measurements.
 */

import { cpus, totalmem } from "node:os";
import { DATA_PACKAGE_VERSION, loadM11World } from "@century/data";
import {
  createEconomyWorld,
  createRollbackRunner,
  hashWorld,
  runTicksWithRollback,
  SIM_VERSION,
  tick,
  type EconomyScenarioDef,
  type TickContext,
} from "@century/sim";

const SEED = 20_261_023;
const WARM_UP_DAYS = 5;
const DEFAULT_DAYS = 62;

interface ModeResult {
  readonly label: string;
  readonly hash: string;
  readonly samples: readonly number[];
  readonly fallbackDays: number;
}

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return Number.NaN;
  const index = Math.min(sorted.length - 1, Math.floor(fraction * sorted.length));
  return sorted[index] ?? Number.NaN;
}

function report(result: ModeResult): void {
  const measured = result.samples.slice(WARM_UP_DAYS);
  const sorted = [...measured].sort((left, right) => left - right);
  const mean = measured.reduce((sum, value) => sum + value, 0) / Math.max(1, measured.length);
  console.log(
    `${result.label}: ${String(measured.length)} measured days after ${String(WARM_UP_DAYS)} warm-up; ` +
      `ms/day mean ${mean.toFixed(1)}, p50 ${percentile(sorted, 0.5).toFixed(1)}, ` +
      `p95 ${percentile(sorted, 0.95).toFixed(1)}, p99 ${percentile(sorted, 0.99).toFixed(1)}, ` +
      `max ${(sorted[sorted.length - 1] ?? Number.NaN).toFixed(1)}; ` +
      `market fallback days ${String(result.fallbackDays)}; hash ${result.hash}`,
  );
}

function context(scenario: EconomyScenarioDef): TickContext {
  return {
    population: { definitions: scenario.population.definitions },
    economy: { definitions: scenario.definitions },
  };
}

function runStaged(scenario: EconomyScenarioDef, days: number): ModeResult {
  const world = createEconomyWorld(scenario, { seed: SEED });
  const samples: number[] = [];
  let fallbackDays = 0;
  for (let day = 0; day < days; day += 1) {
    const start = performance.now();
    const result = tick(world, context(scenario));
    samples.push(performance.now() - start);
    if (result.economy?.fallbackUsed === true) fallbackDays += 1;
  }
  return { label: "staged (whole-day clone)", hash: hashWorld(world), samples, fallbackDays };
}

function runPhase(scenario: EconomyScenarioDef, days: number): ModeResult {
  const world = createEconomyWorld(scenario, { seed: SEED });
  const runner = createRollbackRunner(world);
  const samples: number[] = [];
  let fallbackDays = 0;
  for (let day = 0; day < days; day += 1) {
    const start = performance.now();
    const summary = runTicksWithRollback(runner, 1, context(scenario));
    samples.push(performance.now() - start);
    if (summary.lastResult?.economy?.fallbackUsed === true) fallbackDays += 1;
  }
  return {
    label: `phase + rollback (checkpoints ${String(runner.checkpointsTaken)}, rollbacks ${String(runner.rollbacks)})`,
    hash: hashWorld(world),
    samples,
    fallbackDays,
  };
}

function main(): void {
  const requested = Number(process.argv[2] ?? DEFAULT_DAYS);
  const days = Number.isInteger(requested) && requested > WARM_UP_DAYS ? requested : DEFAULT_DAYS;
  const cpuList = cpus();
  console.log("Fabric of Nations P1 world-scale benchmark (1900 world)");
  console.log(`node: ${process.version} (${process.platform} ${process.arch})`);
  console.log(`cpu: ${cpuList[0]?.model ?? "unknown"} (${String(cpuList.length)} logical processors)`);
  console.log(`memory: ${(totalmem() / 1024 ** 3).toFixed(2)} GiB total`);
  console.log(`sim version: ${SIM_VERSION}; data version: ${DATA_PACKAGE_VERSION}`);
  const scenario = loadM11World();
  const world = createEconomyWorld(scenario, { seed: SEED });
  console.log(
    `world: ${String(world.popBlocks.length)} blocks, ${String(world.buildings.length)} buildings, ` +
      `${String(world.markets.length)} markets, ${String(world.finance.accounts.length)} accounts; ${String(days)} days per mode`,
  );
  const staged = runStaged(scenario, days);
  report(staged);
  const phase = runPhase(scenario, days);
  report(phase);
  const identical = staged.hash === phase.hash;
  console.log(`phase mode reproduces staged mode: ${identical ? "PASS" : "FAIL"}`);
  console.log("device performance: NOT EVALUATED (Node diagnostic)");
  if (!identical) process.exitCode = 1;
}

main();
