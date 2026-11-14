/**
 * D-158 (perf/day-5x): the 1900 world's hashes after the second stage of the performance
 * work of the simulated day, pinned.
 *
 * D-157 pinned the hashes of `main` 4bec918 and required every optimisation to reproduce
 * them. For D-158 the designer allowed the summation order and the pinned hashes to change
 * (2026-11-13). The day-1 and later hashes differ from 4bec918 because market settlement
 * posts each market's money flows as one journal entry per market and kind, every amount
 * summed over goods per account in flow order (9dd9803), instead of entries built from the
 * canonical transaction list, and the demand, needs and education sums of 207d1c3 run in
 * a different order; balances move by a few units in the last place. D-158 records the
 * one-day equivalence evidence (every
 * compared quantity within 1e-9 relative of 8e26f4a on days 2, 30 and 31). The day-0 hash is
 * unchanged: world creation is not affected. The other D-158 changes (the columnar account
 * table, per-day block totals, typed needs results, the month-start changes) reproduce these
 * hashes bit for bit; they were recorded with both builds.
 *
 * The hashes below were recorded on this branch by running the 1900 world (seed 20261023,
 * default player) in phase mode (`tickPhaseMode`, the rollback runner's day) with the
 * default result detail.
 *
 * Day 53 (23 February 1900) still fails in the fiscal phase, a known defect not fixed here
 * (D-157, D-158): a debit of about -1.7e-15 RUSD from an empty household-cash account. At
 * 4bec918 the first account to fail was 1368 (block 368); with the new summation order it is
 * 1303 (block 303), with a slightly different residue. The exact message is pinned: its
 * floating-point residue is a bit-level check of the failing computation. When the defect is
 * fixed (a behaviour change), the 53-tick expectations are to be re-recorded with the
 * designer.
 *
 * Memory (D-155): one 1900 world, ticked in place; no checkpoint copy is held.
 */

import { loadM11World } from "@century/data";
import { createEconomyWorld, hashWorld, tickPhaseMode, type TickContext, type World } from "@century/sim";

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

describe("D-158 1900-world hash pin", () => {
  test("hashes after 0, 1, 31, 52 and 53 ticks and the day-53 failure are pinned", () => {
    const scenario = loadM11World();
    const world: World = createEconomyWorld(scenario, { seed: SEED });
    const context: TickContext = {
      population: { definitions: scenario.population.definitions },
      economy: { definitions: scenario.definitions },
    };
    const observed: Record<number, string> = { 0: hashWorld(world) };
    while (world.dayIndex < 53) {
      tickPhaseMode(world, context);
      if (HASHES_D158[world.dayIndex] !== undefined) observed[world.dayIndex] = hashWorld(world);
    }
    expect(observed).toEqual(HASHES_D158);
    expect(() => tickPhaseMode(world, context)).toThrow(DAY_53_FAILURE_D158);
    // The failed day leaves the calendar at day 53.
    expect(world.dayIndex).toBe(53);
  }, 3_600_000);
});
