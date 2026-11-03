/**
 * Performance-stage determinism trace (`node packages/bench/dist/perfTrace.js [days] [--staged]`).
 *
 * Runs the 1900 world through the rollback runner (or the staged tick with
 * `--staged`; `--summary` uses the host's result detail) and prints `hashWorld` after every day, one `day hash` pair per line,
 * so a build can be compared line by line with a reference trace of another commit.
 * Node diagnostic; nothing is persisted.
 */

import { loadM11World } from "@century/data";
import {
  createEconomyWorld,
  createRollbackRunner,
  hashWorld,
  runTicksWithRollback,
  tick,
  type TickContext,
} from "@century/sim";

const SEED = 20_261_023;

function main(): void {
  const days = Number(process.argv.find((arg, index) => index >= 2 && !arg.startsWith("--")) ?? "33");
  const staged = process.argv.includes("--staged");
  const summary = process.argv.includes("--summary");
  const scenario = loadM11World();
  const world = createEconomyWorld(scenario, { seed: SEED });
  const context: TickContext = {
    population: { definitions: scenario.population.definitions },
    economy: { definitions: scenario.definitions },
    ...(summary ? { detail: "summary" as const } : {}),
  };
  const runner = staged ? null : createRollbackRunner(world);
  console.log(`0 ${hashWorld(world)}`);
  for (let day = 0; day < days; day += 1) {
    if (runner === null) tick(world, context);
    else runTicksWithRollback(runner, 1, context);
    console.log(`${String(world.dayIndex)} ${hashWorld(world)}`);
  }
}

main();
