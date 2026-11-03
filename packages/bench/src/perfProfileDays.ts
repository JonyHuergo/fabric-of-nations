/**
 * Performance-stage profiler for chosen days
 * (`node packages/bench/dist/perfProfileDays.js <fromDay> <toDay> <out.cpuprofile>`).
 *
 * Runs the 1900 world through the rollback runner to `fromDay` unprofiled, then
 * records a V8 CPU profile (inspector) of days `fromDay`..`toDay - 1` only, for
 * example a month end and the next month start. Node diagnostic only.
 */

import { writeFileSync } from "node:fs";
import { Session } from "node:inspector/promises";
import { loadM11World } from "@century/data";
import {
  createEconomyWorld,
  createRollbackRunner,
  runTicksWithRollback,
  type TickContext,
} from "@century/sim";

const SEED = 20_261_023;

async function main(): Promise<void> {
  const fromDay = Number(process.argv[2] ?? "30");
  const toDay = Number(process.argv[3] ?? String(fromDay + 2));
  const out = process.argv[4] ?? "days.cpuprofile";
  const scenario = loadM11World();
  const world = createEconomyWorld(scenario, { seed: SEED });
  const runner = createRollbackRunner(world);
  const context: TickContext = {
    population: { definitions: scenario.population.definitions },
    economy: { definitions: scenario.definitions },
  };
  if (fromDay > 0) runTicksWithRollback(runner, fromDay, context);
  const session = new Session();
  session.connect();
  await session.post("Profiler.enable");
  await session.post("Profiler.setSamplingInterval", { interval: 250 });
  await session.post("Profiler.start");
  for (let day = fromDay; day < toDay; day += 1) {
    const start = performance.now();
    runTicksWithRollback(runner, 1, context);
    console.log(`day ${String(day)}: ${(performance.now() - start).toFixed(0)} ms`);
  }
  const { profile } = await session.post("Profiler.stop");
  writeFileSync(out, JSON.stringify(profile));
  session.disconnect();
  console.log(`wrote ${out}`);
}

void main();
