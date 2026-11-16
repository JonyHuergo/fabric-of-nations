/**
 * D-162: the 1900 world's pinned hashes (D-158, `perf-hash-equality.test.ts`, the
 * single-thread reference at 0 workers) reproduced with the day's split phases on 1, 2 and 4
 * Node worker threads running the bundled kernel script (the script web and phone workers run).
 *
 * The same procedure as the pin test: seed 20261023, default player, phase mode
 * (`tickPhaseModeSteps`, the rollback runner's day) with the default result detail, in place.
 * Day 53 still fails in the fiscal phase with the pinned message (the known defect of D-157 and
 * D-158, not fixed here); the fiscal phase does not split, so the message is the same.
 *
 * Memory (D-155): one 1900 world per test, ticked in place; the workers hold only their jobs.
 */

import { loadM11World } from "@century/data";
import { createEconomyWorld, hashWorld, runStepsParallel, tickPhaseModeSteps, type TickContext, type World } from "@century/sim";
import { createNodeKernelPool } from "../../../sim-worker/src/nodeKernelPool.js";

const SEED = 20_261_023;

const HASHES_D158: Readonly<Record<number, string>> = {
  0: "685bf3c4ccf4f842",
  1: "4d77f5a066875b02",
  31: "c9d106dbe6dbed6d",
  52: "5b100c8146d94453",
  53: "2fa36b1df11debff",
};

const DAY_53_FAILURE_D158 =
  "insufficient funds; posting would make asset account 1303 negative: 0 + -1.7014044923219608e-15 < 0";

async function pinnedRun(workers: number): Promise<void> {
  const pool = createNodeKernelPool(workers);
  try {
    expect(await pool.ready).toBe(true);
    const scenario = loadM11World();
    const world: World = createEconomyWorld(scenario, { seed: SEED });
    const context: TickContext = {
      population: { definitions: scenario.population.definitions },
      economy: { definitions: scenario.definitions },
    };
    const observed: Record<number, string> = { 0: hashWorld(world) };
    let threads = 1;
    while (world.dayIndex < 53) {
      await runStepsParallel(tickPhaseModeSteps(world, context), pool);
      threads = Math.max(threads, pool.status().lastThreads);
      if (HASHES_D158[world.dayIndex] !== undefined) observed[world.dayIndex] = hashWorld(world);
    }
    expect(observed).toEqual(HASHES_D158);
    // The split phases ran on every lane.
    expect(threads).toBe(workers + 1);
    await expect(runStepsParallel(tickPhaseModeSteps(world, context), pool)).rejects.toThrow(DAY_53_FAILURE_D158);
    expect(world.dayIndex).toBe(53);
  } finally {
    pool.close();
  }
}

describe("D-162 1900-world hash pin on worker threads", () => {
  test("1 worker", async () => {
    await pinnedRun(1);
  }, 3_600_000);

  test("2 workers", async () => {
    await pinnedRun(2);
  }, 3_600_000);

  test("4 workers", async () => {
    await pinnedRun(4);
  }, 3_600_000);
});
