/**
 * Save/load probe for performance work (`node packages/bench/dist/perfSave.js [days]`).
 *
 * Runs the 1900 world `days` days through the rollback runner, then times the save
 * path (encode, serialize, compress for storage) and the load path (decompress,
 * deserialize), each the median of three runs, plus new-game construction and the
 * first checkpoint. Node diagnostic only; the acceptance figures come from
 * `perfBench`.
 */

import { loadM11World } from "@century/data";
import {
  cloneWorld,
  createEconomyWorld,
  createRollbackRunner,
  deserializeWorld,
  encodeWorld,
  runTicksWithRollback,
  serializeWorld,
  type TickContext,
} from "@century/sim";
import { compressSaveForStorage, decompressSaveFromStorage } from "@century/sim-worker/persistence";

const SEED = 20_261_023;

function time<T>(label: string, run: () => T): T {
  const samples: number[] = [];
  let result: T | undefined;
  for (let repeat = 0; repeat < 3; repeat += 1) {
    const start = performance.now();
    result = run();
    samples.push(performance.now() - start);
  }
  samples.sort((left, right) => left - right);
  console.log(`  ${label.padEnd(34)} ${(samples[1] ?? 0).toFixed(0).padStart(6)} ms`);
  return result as T;
}

function main(): void {
  const days = Number(process.argv[2] ?? "92");
  const scenario = loadM11World();
  console.log("new game");
  const created = time("createEconomyWorld", () => createEconomyWorld(scenario, { seed: SEED }));
  time("first checkpoint (clone, no validation)", () => cloneWorld(created, { validate: false }));
  time("clone with validation", () => cloneWorld(created));
  const world = createEconomyWorld(scenario, { seed: SEED });
  const runner = createRollbackRunner(world, { worldJustValidated: true });
  const context: TickContext = {
    population: { definitions: scenario.population.definitions },
    economy: { definitions: scenario.definitions },
    detail: "summary",
  };
  runTicksWithRollback(runner, days, context);
  console.log(`day ${String(world.dayIndex)} save`);
  time("encodeWorld (validates)", () => encodeWorld(world));
  const save = time("serializeWorld", () => serializeWorld(world));
  const stored = time("compressSaveForStorage", () => compressSaveForStorage(save));
  console.log(`  canonical ${(save.length / 1e6).toFixed(2)} M chars, stored ${(stored.length / 1e6).toFixed(2)} M chars`);
  console.log("load");
  const text = time("decompressSaveFromStorage", () => decompressSaveFromStorage(stored));
  time("JSON.parse", () => JSON.parse(text) as unknown);
  time("deserializeWorld", () => deserializeWorld(text));
}

main();
