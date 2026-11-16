/**
 * D-162: the day's split phases (demography, household demand) on worker threads give the same
 * world as the single-thread path at any worker count, lane cut and finish order, and fall back
 * to the single-thread path on every failure.
 *
 * - An in-process executor cuts the units into 1 to 7 lanes and runs each lane's job with the
 *   kernels (`runKernel`) on this thread, from poisoned buffers: the merge, not the cut, decides
 *   the world.
 * - A pool of in-process fake ports (messages copied by structured clone, replies delayed so the
 *   lanes finish in reverse order) exercises the real pool: handshake, dispatch, the sim
 *   thread's own lane, a wrong kernel version, a failed worker and a kernel error.
 * - A pool of Node `worker_threads` running the bundled kernel script (the script web and phone
 *   workers run) at 0, 1, 2 and 4 workers.
 */

import {
  createRollbackRunner,
  hashWorld,
  partitionUnits,
  runKernel,
  runStepsParallel,
  runTicksWithRollback,
  runTicksWithRollbackParallel,
  tickPhaseModeSteps,
  type KernelAllocator,
  type KernelOutput,
  type ParallelExecutor,
  type ParallelRequest,
  type ParallelResponse,
  type TickContext,
  type World,
} from "@century/sim";
import { createKernelPool } from "../../../sim-worker/src/kernelPool.js";
import { createNodeKernelPool } from "../../../sim-worker/src/nodeKernelPool.js";
import { m3World } from "../fixtures/m3a.js";
import { economyTickContext } from "../fixtures/m3e.js";
import { fakeKernelPort as fakePort } from "../fixtures/kernelPorts.js";
import { loadM5Sample } from "../fixtures/smallWorlds.js";
import { createEconomyWorld, type EconomyScenarioDef } from "@century/sim";

const DAYS = 6;

interface Fixture {
  readonly scenario: EconomyScenarioDef;
  readonly world: World;
}

const FIXTURES: readonly { readonly name: string; readonly lanes: readonly number[]; readonly make: () => Fixture }[] = [
  { name: "M3a world (4 blocks)", lanes: [1, 2, 3, 4], make: () => m3World() },
  {
    name: "M5 sample (80 blocks)",
    lanes: [1, 2, 3, 4, 7],
    make: () => {
      const scenario = loadM5Sample();
      return { scenario, world: createEconomyWorld(scenario, { seed: 20_261_023 }) };
    },
  },
];

/** Hashes after each of `DAYS` days, single thread (the reference). */
function referenceHashes(fixture: Fixture): string[] {
  const runner = createRollbackRunner(fixture.world, { worldJustValidated: true });
  const context = economyTickContext(fixture.scenario);
  const hashes: string[] = [];
  for (let day = 0; day < DAYS; day += 1) {
    runTicksWithRollback(runner, 1, context);
    hashes.push(hashWorld(fixture.world));
  }
  return hashes;
}

async function parallelHashes(fixture: Fixture, executor: ParallelExecutor): Promise<string[]> {
  const runner = createRollbackRunner(fixture.world, { worldJustValidated: true });
  const context = economyTickContext(fixture.scenario);
  const hashes: string[] = [];
  for (let day = 0; day < DAYS; day += 1) {
    await runTicksWithRollbackParallel(runner, 1, context, executor);
    hashes.push(hashWorld(fixture.world));
  }
  return hashes;
}

/** Buffers that hand out garbage (what a careless kernel would read). */
function poisonedAllocator(): KernelAllocator {
  return {
    f64: (_slot, length) => new Float64Array(length).fill(Number.NaN),
    i32: (_slot, length) => new Int32Array(length).fill(-123_456),
    u32: (_slot, length) => new Uint32Array(length).fill(0xdead_beef),
    u8: (_slot, length) => new Uint8Array(length).fill(77),
  };
}

/** Runs every lane's job on this thread; counts the requests it split. */
function inProcessExecutor(lanes: number): ParallelExecutor & { split: Map<string, number> } {
  const split = new Map<string, number>();
  return {
    split,
    run: (request: ParallelRequest): ParallelResponse | undefined => {
      if (!request.splittable || request.units < lanes) return undefined;
      const ranges = partitionUnits(request.units, lanes);
      const outputs: KernelOutput[] = ranges.map((range) => runKernel(request.job(range.from, range.to, poisonedAllocator())));
      split.set(request.kernel, (split.get(request.kernel) ?? 0) + 1);
      return { ranges, outputs };
    },
  };
}

describe("D-162 lanes and merge", () => {
  test("units are cut into contiguous ranges that cover them", () => {
    expect(partitionUnits(10, 3)).toEqual([
      { from: 0, to: 3 },
      { from: 3, to: 6 },
      { from: 6, to: 10 },
    ]);
    expect(partitionUnits(2, 4).map((range) => range.to - range.from)).toEqual([0, 1, 0, 1]);
    expect(() => partitionUnits(-1, 2)).toThrow(/unit count/);
    expect(() => partitionUnits(4, 0)).toThrow(/lane count/);
  });

  for (const fixture of FIXTURES) {
    test(`${fixture.name}: ${fixture.lanes.join(", ")} lanes from poisoned buffers give the single-thread world`, async () => {
      const reference = referenceHashes(fixture.make());
      for (const lanes of fixture.lanes) {
        const executor = inProcessExecutor(lanes);
        const made = fixture.make();
        expect(made.world.popBlocks.length).toBeGreaterThanOrEqual(lanes);
        expect(await parallelHashes(made, executor)).toEqual(reference);
        // Both split phases ran split every day.
        expect(executor.split.get("demography")).toBe(DAYS);
        expect(executor.split.get("household-demand")).toBe(DAYS);
      }
    }, 600_000);
  }
});

describe("D-162 kernel pool (in-process ports)", () => {
  const fixture = FIXTURES[1]!;

  test("workers finishing in reverse order give the single-thread world; the sim thread takes a lane", async () => {
    const reference = referenceHashes(fixture.make());
    for (const workers of [1, 2, 4]) {
      // Lane 0 answers last: finish order is the reverse of range order.
      const pool = createKernelPool({ workers, minUnitsPerLane: 1, spawn: (index) => fakePort(2 + 4 * (workers - index)) });
      expect(await pool.ready).toBe(true);
      expect(await parallelHashes(fixture.make(), pool)).toEqual(reference);
      expect(pool.status().lastThreads).toBe(workers + 1);
      pool.close();
    }
  }, 600_000);

  test("a worker of another kernel version leaves the pool unavailable and every day single-threaded", async () => {
    const reference = referenceHashes(fixture.make());
    const pool = createKernelPool({ workers: 2, minUnitsPerLane: 1, spawn: (index) => fakePort(1, index === 1 ? { version: 99 } : {}) });
    expect(await pool.ready).toBe(false);
    expect(pool.status()).toMatchObject({ state: "unavailable", workers: 0 });
    expect(pool.status().reason).toMatch(/kernel version 99/);
    expect(await parallelHashes(fixture.make(), pool)).toEqual(reference);
    expect(pool.status().lastThreads).toBe(1);
  }, 600_000);

  test("a worker that fails mid-run disables the pool; the phase re-runs on the sim thread", async () => {
    const reference = referenceHashes(fixture.make());
    const pool = createKernelPool({ workers: 2, minUnitsPerLane: 1, spawn: (index) => fakePort(1, index === 1 ? { failOnJob: true } : {}) });
    expect(await pool.ready).toBe(true);
    expect(await parallelHashes(fixture.make(), pool)).toEqual(reference);
    expect(pool.status().state).toBe("unavailable");
    expect(pool.status().reason).toMatch(/simulated worker crash/);
  }, 600_000);

  test("a kernel error in a worker re-runs the phase on the sim thread and keeps the pool", async () => {
    const reference = referenceHashes(fixture.make());
    const pool = createKernelPool({ workers: 2, minUnitsPerLane: 1, spawn: (index) => fakePort(1, index === 0 ? { kernelError: true } : {}) });
    expect(await pool.ready).toBe(true);
    expect(await parallelHashes(fixture.make(), pool)).toEqual(reference);
    expect(pool.status().state).toBe("ready");
    expect(pool.status().lastThreads).toBe(1);
    pool.close();
  }, 600_000);

  test("a failing day fails with the single-thread error", async () => {
    // Day steps in place, like the rollback runner's day, on a world with one corrupt block
    // in the middle of the table (a death remainder that is not a number): demography fails
    // on it, in whichever lane holds it.
    const made = fixture.make();
    const reference = fixture.make();
    const context: TickContext = economyTickContext(made.scenario);
    const breakWorld = (world: World): void => {
      world.population.fractionalDeathRemainder[Math.floor(world.population.count / 2)] = Number.NaN;
    };
    breakWorld(made.world);
    breakWorld(reference.world);
    let single: unknown = null;
    try {
      runStepsInlineDay(reference.world, context);
    } catch (error) {
      single = error;
    }
    const pool = createKernelPool({ workers: 2, minUnitsPerLane: 1, spawn: (index) => fakePort(1 + index) });
    await pool.ready;
    await expect(runStepsParallel(tickPhaseModeSteps(made.world, context), pool)).rejects.toThrow(
      single instanceof Error ? single.message : "no error",
    );
    expect(single).toBeInstanceOf(Error);
    pool.close();
  }, 600_000);
});

/** One phase-mode day with every step inline (the reference of the failing-day test). */
function runStepsInlineDay(world: World, context: TickContext): void {
  const steps = tickPhaseModeSteps(world, context);
  let next = steps.next(undefined);
  while (next.done !== true) next = steps.next(undefined);
}

describe("D-162 Node worker threads (the bundled kernel script)", () => {
  const fixture = FIXTURES[1]!;

  test("0, 1, 2 and 4 workers give the single-thread world", async () => {
    const reference = referenceHashes(fixture.make());
    for (const workers of [0, 1, 2, 4]) {
      const pool = createNodeKernelPool(workers, { minUnitsPerLane: 1 });
      expect(await pool.ready).toBe(workers > 0);
      expect(await parallelHashes(fixture.make(), pool)).toEqual(reference);
      expect(pool.status().lastThreads).toBe(workers === 0 ? 1 : workers + 1);
      pool.close();
    }
  }, 600_000);
});
