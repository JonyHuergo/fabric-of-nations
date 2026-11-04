/**
 * Garbage-collection probe for performance work (`node packages/bench/dist/perfGc.js [days]`).
 *
 * Runs the 1900 world through the rollback runner with the host's result detail and
 * reports, per simulated day, the wall time and the time V8 spent in each kind of
 * garbage collection (from `perf_hooks` GC entries), plus the heap after the run.
 * Node diagnostic only.
 */

import { PerformanceObserver, constants } from "node:perf_hooks";
import { loadM11World } from "@century/data";
import { createEconomyWorld, createRollbackRunner, runTicksWithRollback, type TickContext } from "@century/sim";

const SEED = 20_261_023;

const KIND_NAMES: Readonly<Record<number, string>> = {
  [constants.NODE_PERFORMANCE_GC_MAJOR]: "major",
  [constants.NODE_PERFORMANCE_GC_MINOR]: "minor",
  [constants.NODE_PERFORMANCE_GC_INCREMENTAL]: "incremental",
  [constants.NODE_PERFORMANCE_GC_WEAKCB]: "weak",
};

function main(): void {
  const days = Number(process.argv[2] ?? "12");
  const scenario = loadM11World();
  const world = createEconomyWorld(scenario, { seed: SEED });
  const runner = createRollbackRunner(world, { worldJustValidated: true });
  const context: TickContext = {
    population: { definitions: scenario.population.definitions },
    economy: { definitions: scenario.definitions },
    detail: "summary",
  };
  runTicksWithRollback(runner, 2, context);
  const gc = new Map<string, number>();
  let counting = false;
  const observer = new PerformanceObserver((list) => {
    if (!counting) return;
    for (const entry of list.getEntries()) {
      const detail = entry.detail as { kind?: number } | undefined;
      const name = KIND_NAMES[detail?.kind ?? -1] ?? "other";
      gc.set(name, (gc.get(name) ?? 0) + entry.duration);
    }
  });
  observer.observe({ entryTypes: ["gc"] });
  counting = true;
  const start = performance.now();
  runTicksWithRollback(runner, days, context);
  const wall = performance.now() - start;
  // GC entries are delivered asynchronously; report after they flush.
  setTimeout(() => {
    counting = false;
    observer.disconnect();
    let total = 0;
    for (const value of gc.values()) total += value;
    console.log(`days ${String(days)}: wall ${(wall / days).toFixed(1)} ms/day, GC ${(total / days).toFixed(1)} ms/day`);
    for (const [name, value] of [...gc].sort((left, right) => right[1] - left[1])) {
      console.log(`  ${name.padEnd(12)} ${(value / days).toFixed(2)} ms/day`);
    }
    const heap = process.memoryUsage();
    console.log(`heap used ${(heap.heapUsed / 2 ** 20).toFixed(0)} MiB, total ${(heap.heapTotal / 2 ** 20).toFixed(0)} MiB`);
  }, 50);
}

main();
