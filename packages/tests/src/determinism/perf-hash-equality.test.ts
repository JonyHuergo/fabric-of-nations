/**
 * D-157 (perf/day-5x): the 1900 world stays bit-for-bit identical through the
 * performance work of the simulated day.
 *
 * The hashes below were recorded at `main` 4bec918, before any optimisation, by running
 * the 1900 world (seed 20261023, default player) in phase mode (`tickPhaseMode`, the
 * rollback runner's day) with the default result detail. The rollback runner gave the
 * same hashes. Every optimisation of D-157 must reproduce them exactly; they are not to be
 * re-pinned by a performance change.
 *
 * 62 ticks cannot be reached at 4bec918: day 53 (23 February 1900) throws in the fiscal
 * phase (a posting of -1.7e-15 RUSD into an empty asset account; the rollback runner
 * restores the start of the day). The test therefore pins 0, 1, 31 (the first month end
 * and month start), 52 and 53 ticks, and the exact day-53 failure message, whose
 * floating-point residue is itself a bit-level check of the failing computation. When that
 * failure is fixed (a behaviour change, not D-157's), the 53-tick expectations are to be
 * re-recorded with the designer.
 *
 * Memory (D-155): one 1900 world, ticked in place; no checkpoint copy is held.
 */

import { loadM11World } from "@century/data";
import { createEconomyWorld, hashWorld, tickPhaseMode, type TickContext, type World } from "@century/sim";

const SEED = 20_261_023;

const HASHES_AT_4BEC918: Readonly<Record<number, string>> = {
  0: "685bf3c4ccf4f842",
  1: "203ac9ed7427a6d3",
  31: "ac6eb8ef4931a5a1",
  52: "5117ab7c9fa446c2",
  53: "9f47fe0e7bde51d8",
};

const DAY_53_FAILURE_AT_4BEC918 =
  "insufficient funds; posting would make asset account 1368 negative: 0 + -1.7014045183604516e-15 < 0";

describe("D-157 1900-world hash equality with 4bec918", () => {
  test("hashes after 0, 1, 31, 52 and 53 ticks and the day-53 failure are unchanged", () => {
    const scenario = loadM11World();
    const world: World = createEconomyWorld(scenario, { seed: SEED });
    const context: TickContext = {
      population: { definitions: scenario.population.definitions },
      economy: { definitions: scenario.definitions },
    };
    const observed: Record<number, string> = { 0: hashWorld(world) };
    while (world.dayIndex < 53) {
      tickPhaseMode(world, context);
      if (HASHES_AT_4BEC918[world.dayIndex] !== undefined) observed[world.dayIndex] = hashWorld(world);
    }
    expect(observed).toEqual(HASHES_AT_4BEC918);
    expect(() => tickPhaseMode(world, context)).toThrow(DAY_53_FAILURE_AT_4BEC918);
  }, 3_600_000);
});
