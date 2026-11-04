/**
 * Quick per-phase probe for performance work
 * (`node packages/bench/dist/perfPhases.js [fromDay] [toDay]`).
 *
 * Runs the 1900 world through the rollback runner with the worker host's result
 * detail, unmeasured to `fromDay`, then reports the mean milliseconds per phase over
 * days `fromDay`..`toDay - 1` and the mean day. Defaults to days 2..12: ordinary days,
 * clear of the first month start and the first month end. Node diagnostic only; the
 * acceptance figures come from `perfBench`.
 */

import { loadM11World } from "@century/data";
import {
  createEconomyWorld,
  createRollbackRunner,
  runTicksWithRollback,
  type TickContext,
} from "@century/sim";

const SEED = 20_261_023;

function main(): void {
  const fromDay = Number(process.argv[2] ?? "2");
  const toDay = Number(process.argv[3] ?? "12");
  const scenario = loadM11World();
  const world = createEconomyWorld(scenario, { seed: SEED });
  const runner = createRollbackRunner(world, { worldJustValidated: true });
  const base: TickContext = {
    population: { definitions: scenario.population.definitions },
    economy: { definitions: scenario.definitions },
    detail: "summary",
  };
  if (fromDay > 0) runTicksWithRollback(runner, fromDay, base);
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
  for (let day = fromDay; day < toDay; day += 1) {
    phase = "runner";
    const start = performance.now();
    since = start;
    runTicksWithRollback(runner, 1, context);
    observe("done");
    dayTotal += performance.now() - start;
  }
  totals.delete("done");
  const rows = [...totals].sort((left, right) => right[1] - left[1]);
  console.log(`days ${String(fromDay)}..${String(toDay - 1)}: mean day ${(dayTotal / days).toFixed(1)} ms`);
  for (const [name, total] of rows) {
    const mean = total / days;
    if (mean < 0.05) continue;
    console.log(`  ${name.padEnd(26)} ${mean.toFixed(2).padStart(8)}`);
  }
}

main();
