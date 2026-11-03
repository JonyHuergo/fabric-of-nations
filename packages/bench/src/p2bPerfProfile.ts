/**
 * P2b province-scale performance profile (`node packages/bench/dist/p2bPerfProfile.js [days] [--days-only]`).
 *
 * Splits the costs the P2 report named into their stages: world validation,
 * `encodeWorld`, canonical JSON (`stableStringify`), the FNV digest, the full
 * `hashWorld` and `serializeWorld`, and `cloneWorld`, then
 * runs phase-mode days for a CPU profile (run with `--cpu-prof`). It also counts
 * the world's objects by kind. Node diagnostic only; nothing is persisted.
 */

import { loadM11World } from "@century/data";
import {
  assertValidWorld,
  cloneWorld,
  createEconomyWorld,
  createRollbackRunner,
  encodeWorld,
  hashWorld,
  runTicksWithRollback,
  serializeWorld,
  type EconomyScenarioDef,
  type TickContext,
} from "@century/sim";
// Internal canonical-JSON helpers are not part of the package root; the profile reads them
// from the built module so it measures exactly the code hashWorld runs.
import { dualFnv1a32Hex, stableStringify } from "../../sim/dist/hash.js";

const SEED = 20_261_023;

function context(scenario: EconomyScenarioDef): TickContext {
  return {
    population: { definitions: scenario.population.definitions },
    economy: { definitions: scenario.definitions },
  };
}

function time<T>(label: string, run: () => T, repeat = 3): T {
  let result: T | undefined;
  const samples: number[] = [];
  for (let index = 0; index < repeat; index += 1) {
    const start = performance.now();
    result = run();
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  console.log(`${label}: median ${(samples[Math.floor(samples.length / 2)] ?? 0).toFixed(0)} ms (min ${(samples[0] ?? 0).toFixed(0)})`);
  return result as T;
}

function main(): void {
  const days = Number(process.argv[2] ?? "8");
  const scenario = loadM11World();
  const world = createEconomyWorld(scenario, { seed: SEED });
  const runner = createRollbackRunner(world);
  // Two warm-up days so the measured world carries postings and diagnostics.
  runTicksWithRollback(runner, 2, context(scenario));

  console.log(
    `world: ${String(world.popBlocks.length)} blocks, ${String(world.buildings.length)} buildings, ` +
      `${String(world.employment.length)} employment rows, ${String(world.finance.accounts.length)} accounts, ` +
      `${String(world.finance.postings?.length ?? 0)} retained postings`,
  );
  const accountsByOwner = new Map<string, number>();
  for (const account of world.finance.accounts) {
    accountsByOwner.set(account.ownerKind, (accountsByOwner.get(account.ownerKind) ?? 0) + 1);
  }
  console.log(`accounts by owner kind: ${JSON.stringify(Object.fromEntries(accountsByOwner))}`);

  const daysOnly = process.argv.includes("--days-only");
  if (!daysOnly) measureEncoding(world);

  const samples: number[] = [];
  for (let day = 0; day < days; day += 1) {
    const start = performance.now();
    runTicksWithRollback(runner, 1, context(scenario));
    samples.push(performance.now() - start);
  }
  console.log(`phase-mode days: ${samples.map((s) => s.toFixed(0)).join(", ")} ms`);
}

function measureEncoding(world: ReturnType<typeof createEconomyWorld>): void {
  time("assertValidWorld", () => assertValidWorld(world));
  const encoded = time("encodeWorld (includes assertValidWorld)", () => encodeWorld(world));
  const json = time("stableStringify(encoded)", () => stableStringify(encoded));
  time("JSON.stringify(encoded) (reference, not canonical)", () => JSON.stringify(encoded));
  time("dualFnv1a32Hex(json)", () => dualFnv1a32Hex(json));
  console.log(`canonical JSON: ${(json.length / 1e6).toFixed(1)} M characters`);
  const sections = Object.entries(encoded as unknown as Record<string, unknown>)
    .map(([key, value]) => [key, JSON.stringify(value)?.length ?? 0] as const)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  console.log(`largest sections (M chars): ${sections.map(([k, n]) => `${k} ${(n / 1e6).toFixed(2)}`).join(", ")}`);
  time("hashWorld", () => hashWorld(world));
  time("serializeWorld", () => serializeWorld(world));
  time("cloneWorld", () => cloneWorld(world));
}

main();
