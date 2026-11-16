/**
 * The 1900 world's hashes, pinned, and its first 60 days without a failure (D-165).
 *
 * History. D-157 pinned the hashes of `main` 4bec918 and required every optimisation to
 * reproduce them; D-158 re-recorded them for its summation order (designer, 2026-11-13). Day
 * 53 (23 February 1900) then failed in the fiscal phase: "insufficient funds; posting would
 * make asset account 1303 negative: 0 + -1.7014044923219608e-15 < 0", pinned by D-158 as
 * a bit-level check of the failing computation.
 *
 * D-165 (P7 close, step 2; designer: "fix it completely") fixed the chain at its causes and
 * re-recorded these hashes. Why they moved:
 * - `SIM_VERSION` 0.31.0 → 0.32.0 (`hashWorld` encodes it): every hash, day 0 included
 *   (day 0 at 0.31.0 was `685bf3c4ccf4f842`; nothing else changes day 0).
 * - One lot rule (`economy/lotQuantity.ts`): the market's final lots, Pass-B lots, the mint,
 *   construction and trade dispatch drop a lot something was taken from when its remainder is
 *   within the tolerance of the lot arithmetic; before, the final lots kept 1,500-3,500 such
 *   dust lots a day that the allocator had already treated as sold out. This moves day 1 on.
 * - Servants are paid from the cash held before today's wages, checked in the batch's own
 *   arithmetic (`settlement.ts`): before, the limit `cash − wages` rounded up by an ulp for
 *   about one employer a day (48 times in days 2-53), and on day 53 a wage absorbed by
 *   rounding (2.7e-14 RUSD on 19,202) was paid out in full. Measured alone, at 0.31.0, this
 *   change kept days 0 and 1 and changed 1 of 480,966 account balances by 1.1e-13 RUSD on day
 *   31 and 8 on day 52 (largest relative change 4.3e-15), with every population cell equal.
 * - The income tax is checked against the household's cash exactly, as the posting is.
 *
 * The hashes below were recorded with the D-165 build by running the 1900 world (seed
 * 20261023, default player) in phase mode (`tickPhaseMode`, the rollback runner's day) with
 * the default result detail. Memory (D-155): one 1900 world, ticked in place.
 */

import { loadM11World } from "@century/data";
import { createEconomyWorld, hashWorld, tickPhaseMode, type TickContext, type World } from "@century/sim";

const SEED = 20_261_023;

const HASHES_D165: Readonly<Record<number, string>> = {
  0: "8b8c7aa759a00f19",
  1: "7019f830ce479f0a",
  31: "d70a7d753a15ec9b",
  52: "95a1381fa4e6520d",
  53: "bd2b43374da4240d",
  54: "8a741ea03938994e",
  60: "f47e9a8d0ad83ceb",
};

describe("D-165 1900-world hash pin and the first 60 days", () => {
  test("hashes after 0, 1, 31, 52, 53, 54 and 60 ticks are pinned; no day fails", () => {
    const scenario = loadM11World();
    const world: World = createEconomyWorld(scenario, { seed: SEED });
    const context: TickContext = {
      population: { definitions: scenario.population.definitions },
      economy: { definitions: scenario.definitions },
    };
    const observed: Record<number, string> = { 0: hashWorld(world) };
    while (world.dayIndex < 60) {
      tickPhaseMode(world, context);
      if (HASHES_D165[world.dayIndex] !== undefined) observed[world.dayIndex] = hashWorld(world);
    }
    expect(observed).toEqual(HASHES_D165);
    expect(world.dayIndex).toBe(60);
  }, 3_600_000);
});
