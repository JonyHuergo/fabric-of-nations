/**
 * P1 (D-116): phase-mode days with checkpoint rollback, and the bit-identical
 * hot-path indexes. Phase mode must reproduce the staged whole-day path exactly,
 * a failed day must leave the world at the exact start of that day, and rollback
 * must refuse to publish a start-of-day state it cannot prove.
 */

import {
  buildBuildingCapacityIndex,
  buildFinanceIndex,
  checkpointRollbackRunner,
  computeBuildingCapacity,
  createEconomyWorld,
  createRollbackRunner,
  DayRolledBackError,
  hashWorld,
  IntegrityFailureError,
  runTicksWithRollback,
  tick,
  worldDayFingerprint,
  type EconomyDefinitions,
  type EconomyScenarioDef,
  type TickContext,
  type World,
} from "@century/sim";
import { loadM5EightPolities } from "@century/data";

const SEED = 20_261_102;

function context(scenario: EconomyScenarioDef): TickContext {
  return {
    population: { definitions: scenario.population.definitions },
    economy: { definitions: scenario.definitions },
  };
}

/**
 * One-shot failure injection: the economy definitions throw on the `armedAccess`-th
 * read of `buildings` after `arm()` is called, then disarm. Reads in the first phases
 * of a day succeed, so the day fails part-way after population state has changed.
 */
function failingDefinitions(definitions: EconomyDefinitions): {
  readonly definitions: EconomyDefinitions;
  arm(afterAccesses: number): void;
  readonly fired: () => boolean;
} {
  let remaining = -1;
  let fired = false;
  const proxy = new Proxy(definitions, {
    get(target, property, receiver) {
      if (property === "buildings" && remaining >= 0) {
        if (remaining === 0) {
          remaining = -1;
          fired = true;
          throw new RangeError("injected failure");
        }
        remaining -= 1;
      }
      return Reflect.get(target, property, receiver) as unknown;
    },
  });
  return {
    definitions: proxy,
    arm(afterAccesses: number) {
      remaining = afterAccesses;
    },
    fired: () => fired,
  };
}

const SCENARIO = loadM5EightPolities();

function stagedReference(days: number): string[] {
  const world = createEconomyWorld(SCENARIO, { seed: SEED });
  const hashes = [hashWorld(world)];
  for (let day = 0; day < days; day += 1) {
    tick(world, context(SCENARIO));
    hashes.push(hashWorld(world));
  }
  return hashes;
}

// Covers the January month end and close, so checkpoint refresh and month-end
// whole-world validation are exercised.
const DAYS = 40;
const REFERENCE = stagedReference(DAYS);

describe("P1 phase mode equals staged mode", () => {
  test("phase-mode days through the rollback runner reproduce every staged hash", () => {
    const world = createEconomyWorld(SCENARIO, { seed: SEED });
    const runner = createRollbackRunner(world);
    const hashes = [hashWorld(world)];
    for (let day = 0; day < DAYS; day += 1) {
      const summary = runTicksWithRollback(runner, 1, context(SCENARIO));
      expect(summary.ticksProcessed).toBe(1);
      hashes.push(hashWorld(world));
    }
    expect(hashes).toEqual(REFERENCE);
    expect(runner.rollbacks).toBe(0);
    // Initial checkpoint plus one at the start of February.
    expect(runner.checkpointsTaken).toBe(2);
  });

  test("tick with integrity: phase reproduces staged hashes without a runner", () => {
    const world = createEconomyWorld(SCENARIO, { seed: SEED });
    const phase: TickContext = { ...context(SCENARIO), integrity: "phase" };
    for (let day = 0; day < DAYS; day += 1) tick(world, phase);
    expect(hashWorld(world)).toBe(REFERENCE[DAYS]);
  });

  test("multi-day runs equal single-day runs", () => {
    const world = createEconomyWorld(SCENARIO, { seed: SEED });
    const runner = createRollbackRunner(world);
    const summary = runTicksWithRollback(runner, DAYS, context(SCENARIO));
    expect(summary.ticksProcessed).toBe(DAYS);
    expect(summary.lastResult?.dayProcessed).toBe(DAYS - 1);
    expect(hashWorld(world)).toBe(REFERENCE[DAYS]);
  });
});

describe("P1 rollback", () => {
  test("a day failing part-way is restored to its exact start and can then complete", () => {
    const injected = failingDefinitions(SCENARIO.definitions);
    const ctx: TickContext = {
      population: { definitions: SCENARIO.population.definitions },
      economy: { definitions: injected.definitions },
    };
    const world = createEconomyWorld(SCENARIO, { seed: SEED });
    const runner = createRollbackRunner(world);
    runTicksWithRollback(runner, 12, ctx);
    const before = hashWorld(world);
    expect(before).toBe(REFERENCE[12]);

    injected.arm(3);
    expect(() => runTicksWithRollback(runner, 1, ctx)).toThrow(DayRolledBackError);
    expect(injected.fired()).toBe(true);
    expect(runner.rollbacks).toBe(1);
    expect(world.dayIndex).toBe(12);
    expect(hashWorld(world)).toBe(before);

    runTicksWithRollback(runner, DAYS - 12, ctx);
    expect(hashWorld(world)).toBe(REFERENCE[DAYS]);
  });

  test("the rolled-back error names the failed day and keeps the cause", () => {
    const injected = failingDefinitions(SCENARIO.definitions);
    const ctx: TickContext = {
      population: { definitions: SCENARIO.population.definitions },
      economy: { definitions: injected.definitions },
    };
    const world = createEconomyWorld(SCENARIO, { seed: SEED });
    const runner = createRollbackRunner(world);
    runTicksWithRollback(runner, 33, ctx);
    injected.arm(5);
    let caught: unknown;
    try {
      runTicksWithRollback(runner, 1, ctx);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(DayRolledBackError);
    expect((caught as DayRolledBackError).dayIndex).toBe(33);
    expect(((caught as Error).cause as Error).message).toBe("injected failure");
    // Day 33 is in February: the replay starts from the 1 February checkpoint.
    expect(hashWorld(world)).toBe(REFERENCE[33]);
  });

  test("a failure on the first day after a checkpoint needs no replay", () => {
    const injected = failingDefinitions(SCENARIO.definitions);
    const ctx: TickContext = {
      population: { definitions: SCENARIO.population.definitions },
      economy: { definitions: injected.definitions },
    };
    const world = createEconomyWorld(SCENARIO, { seed: SEED });
    const runner = createRollbackRunner(world);
    injected.arm(2);
    expect(() => runTicksWithRollback(runner, 1, ctx)).toThrow(DayRolledBackError);
    expect(hashWorld(world)).toBe(REFERENCE[0]);
  });

  test("a checkpoint after an accepted change makes that change part of the replay base", () => {
    const injected = failingDefinitions(SCENARIO.definitions);
    const ctx: TickContext = {
      population: { definitions: SCENARIO.population.definitions },
      economy: { definitions: injected.definitions },
    };
    const world = createEconomyWorld(SCENARIO, { seed: SEED });
    const runner = createRollbackRunner(world);
    runTicksWithRollback(runner, 5, ctx);
    const country = world.countries[0];
    if (country === undefined) throw new Error("fixture has no country");
    country.fiscal = { ...country.fiscal, incomeTaxRate: country.fiscal.incomeTaxRate / 2 };
    checkpointRollbackRunner(runner);
    runTicksWithRollback(runner, 3, ctx);
    const before = hashWorld(world);
    injected.arm(4);
    expect(() => runTicksWithRollback(runner, 1, ctx)).toThrow(DayRolledBackError);
    expect(hashWorld(world)).toBe(before);
  });

  test("an unrecorded out-of-band change makes rollback an integrity failure", () => {
    const injected = failingDefinitions(SCENARIO.definitions);
    const ctx: TickContext = {
      population: { definitions: SCENARIO.population.definitions },
      economy: { definitions: injected.definitions },
    };
    const world = createEconomyWorld(SCENARIO, { seed: SEED });
    const runner = createRollbackRunner(world);
    runTicksWithRollback(runner, 5, ctx);
    const market = world.markets[0];
    if (market === undefined) throw new Error("fixture has no market");
    // Changed without a checkpoint: the replay cannot reproduce it.
    market.priceRUSD = market.priceRUSD.map((price) => price * 1.5);
    injected.arm(4);
    expect(() => runTicksWithRollback(runner, 1, ctx)).toThrow(IntegrityFailureError);
    // The live world is left at the last checkpoint, never at a partial day.
    expect(hashWorld(world)).toBe(REFERENCE[0]);
  });

  test("the day fingerprint changes with conserved totals and the calendar", () => {
    const world = createEconomyWorld(SCENARIO, { seed: SEED });
    const first = worldDayFingerprint(world);
    expect(worldDayFingerprint(world)).toBe(first);
    const account = world.finance.accounts.find((candidate) => candidate.balanceRUSD > 0);
    if (account === undefined) throw new Error("fixture has no funded account");
    account.balanceRUSD += 1;
    expect(worldDayFingerprint(world)).not.toBe(first);
    account.balanceRUSD -= 1;
    world.dayIndex += 1;
    expect(worldDayFingerprint(world)).not.toBe(first);
  });
});

describe("P1 hot-path indexes", () => {
  function advancedWorld(): World {
    const world = createEconomyWorld(SCENARIO, { seed: SEED });
    const runner = createRollbackRunner(world);
    runTicksWithRollback(runner, 3, context(SCENARIO));
    return world;
  }

  test("capacity with a shared index equals capacity computed on its own", () => {
    const world = advancedWorld();
    const index = buildBuildingCapacityIndex(world, SCENARIO.definitions);
    for (const building of world.buildings) {
      expect(computeBuildingCapacity(world, SCENARIO.definitions, building.id, index)).toEqual(
        computeBuildingCapacity(world, SCENARIO.definitions, building.id),
      );
    }
  });

  test("the finance index finds every account by owner and subtype", () => {
    const world = advancedWorld();
    const index = buildFinanceIndex(world.finance);
    let looked = 0;
    for (const account of world.finance.accounts) {
      const external =
        account.ownerKind === "system" &&
        (account.subtype === "external-cash" ||
          account.subtype === "external-currency-holding" ||
          account.subtype === "external-equity");
      if (external) continue;
      expect(index.get(account.ownerKind, account.ownerId, account.subtype)).toBe(account);
      looked += 1;
    }
    expect(looked).toBeGreaterThan(0);
    expect(index.find("popBlock", 9_999_999, "household-cash")).toBeUndefined();
    expect(index.find("popBlock", 2 ** 45, "household-cash")).toBeUndefined();
  });
});
