/**
 * Quick per-phase probe for performance work
 * (`node packages/bench/dist/perfPhases.js [fromDay] [toDay]`).
 *
 * Runs the 1900 world through the rollback runner with the worker host's result
 * detail, unmeasured to `fromDay`, then reports the mean milliseconds per phase over
 * days `fromDay`..`toDay - 1`, the mean day and the worst day. Defaults to days 2..12:
 * ordinary days, clear of the first month start and the first month end; `0 32` is the
 * whole first month with its month end (day 30) and the first monthly labour phase
 * (day 31). Node diagnostic only; the acceptance figures come from `perfBench`.
 *
 * D-162: a third argument runs the measured days with that many kernel worker threads
 * (`worker_threads`, the same pool, messages and merge as web and phone); 0 or absent is the
 * synchronous runner. Phase times then include the wait for the workers.
 */

import { loadM11World } from "@century/data";
import {
  createEconomyWorld,
  createRollbackRunner,
  runTicksWithRollback,
  runTicksWithRollbackParallel,
  type TickContext,
} from "@century/sim";
import { createNodeKernelPool } from "@century/sim-worker/node-kernels";

const SEED = 20_261_023;

async function main(): Promise<void> {
  const fromDay = Number(process.argv[2] ?? "2");
  const toDay = Number(process.argv[3] ?? "12");
  const workers = Number(process.argv[4] ?? "0");
  const scenario = loadM11World();
  const world = createEconomyWorld(scenario, { seed: SEED });
  const runner = createRollbackRunner(world, { worldJustValidated: true });
  const base: TickContext = {
    population: { definitions: scenario.population.definitions },
    economy: { definitions: scenario.definitions },
    detail: "summary",
  };
  if (fromDay > 0) runTicksWithRollback(runner, fromDay, base);
  const pool = workers > 0 ? createNodeKernelPool(workers) : null;
  if (pool !== null && !(await pool.ready)) throw new Error(`kernel workers did not start: ${String(pool.status().reason)}`);
  const totals = new Map<string, number>();
  let phase = "runner";
  let since = 0;
  const observe = (next: string): void => {
    const now = performance.now();
    totals.set(phase, (totals.get(phase) ?? 0) + (now - since));
    phase = next;
    since = now;
  };
  const context: TickContext = { ...base, phaseObserver: observe };
  const days = toDay - fromDay;
  let dayTotal = 0;
  let worstDay = fromDay;
  let worstMs = 0;
  for (let day = fromDay; day < toDay; day += 1) {
    phase = "runner";
    const start = performance.now();
    since = start;
    if (pool === null) runTicksWithRollback(runner, 1, context);
    else await runTicksWithRollbackParallel(runner, 1, context, pool);
    observe("done");
    const elapsed = performance.now() - start;
    dayTotal += elapsed;
    if (elapsed > worstMs) {
      worstMs = elapsed;
      worstDay = day;
    }
  }
  totals.delete("done");
  const rows = [...totals].sort((left, right) => right[1] - left[1]);
  // D-157: the worst day as well, for a whole-month window (`perfPhases 0 32`).
  const threads = pool === null ? 1 : pool.status().lastThreads;
  pool?.close();
  console.log(
    `workers ${String(workers)} (threads ${String(threads)}); ` +
    `days ${String(fromDay)}..${String(toDay - 1)}: mean day ${(dayTotal / days).toFixed(1)} ms; ` +
      `worst day ${String(worstDay)} ${worstMs.toFixed(1)} ms`,
  );
  for (const [name, total] of rows) {
    const mean = total / days;
    if (mean < 0.05) continue;
    console.log(`  ${name.padEnd(26)} ${mean.toFixed(2).padStart(8)}`);
  }
}

await main();
