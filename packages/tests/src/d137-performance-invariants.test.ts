/**
 * D-137 performance hooks must not change simulation outcomes.
 *
 * Pins three invariants of the measurement/presentation layer:
 * - a `phaseObserver` is called with the documented phase names and the world hash is
 *   identical with and without it;
 * - `TickContext.detail: "summary"` produces the same world hash as `"full"`;
 * - a snapshot built with a reused host cache is JSON-identical to one built with a
 *   fresh cache.
 *
 * These are the properties the stage relied on to speed up the worker host without
 * changing an outcome.
 */

import { loadM5EightPolities } from "@century/data";
import {
  createEconomyWorld,
  createRollbackRunner,
  hashWorld,
  runTicks,
  runTicksWithRollback,
  type EconomyScenarioDef,
  type TickContext,
} from "@century/sim";
import { buildSimulationSnapshot, createSnapshotCache } from "@century/sim-worker/snapshot";

const SEED = 20_261_023;
const DAYS = 5;

function contextFor(scenario: EconomyScenarioDef): TickContext {
  return {
    population: { definitions: scenario.population.definitions },
    economy: { definitions: scenario.definitions },
  };
}

function world(scenario: EconomyScenarioDef) {
  return createEconomyWorld({ ...scenario, playerCountryId: 0 }, { seed: SEED });
}

describe("D-137 performance hooks do not change outcomes", () => {
  test("phase observer sees phases and changes no world hash", () => {
    const scenario = loadM5EightPolities();
    const plainWorld = world(scenario);
    const observedWorld = world(scenario);
    const plain = createRollbackRunner(plainWorld);
    const observed = createRollbackRunner(observedWorld);
    const phases: string[] = [];
    runTicksWithRollback(plain, DAYS, contextFor(scenario));
    runTicksWithRollback(observed, DAYS, {
      ...contextFor(scenario),
      phaseObserver: (phase) => phases.push(phase),
    });

    expect(hashWorld(observedWorld)).toBe(hashWorld(plainWorld));
    expect(phases).toContain("settlement");
    expect(phases).toContain("market-clearing");
    expect(phases).toContain("needs");
    expect(phases.length).toBeGreaterThan(DAYS * 5);
  });

  test("summary result detail leaves the world identical to full", () => {
    const scenario = loadM5EightPolities();
    const fullWorld = world(scenario);
    const summaryWorld = world(scenario);
    runTicks(fullWorld, DAYS, contextFor(scenario));
    runTicks(summaryWorld, DAYS, { ...contextFor(scenario), detail: "summary" });

    expect(hashWorld(summaryWorld)).toBe(hashWorld(fullWorld));
    expect(summaryWorld.dayIndex).toBe(fullWorld.dayIndex);
  });

  test("a reused snapshot cache produces the same snapshot as a fresh one", () => {
    const scenario = loadM5EightPolities();
    const simWorld = world(scenario);
    runTicks(simWorld, DAYS, contextFor(scenario));

    const runtime = {
      sequence: 7,
      running: false,
      speedDaysPerSecond: 1,
      achievedDaysPerSecond: 0,
      focusCountryId: 0,
      ...(scenario.countryMeta === undefined ? {} : { countryMeta: scenario.countryMeta }),
      ...(scenario.marketMeta === undefined ? {} : { marketMeta: scenario.marketMeta }),
      ...(scenario.territoryMeta === undefined ? {} : { territoryMeta: scenario.territoryMeta }),
    };
    const fresh = buildSimulationSnapshot(
      simWorld,
      scenario.definitions,
      runtime,
      scenario.population.definitions,
      createSnapshotCache(),
    );
    const cache = createSnapshotCache();
    const cachedFirst = buildSimulationSnapshot(
      simWorld,
      scenario.definitions,
      runtime,
      scenario.population.definitions,
      cache,
    );
    const cachedSecond = buildSimulationSnapshot(
      simWorld,
      scenario.definitions,
      runtime,
      scenario.population.definitions,
      cache,
    );

    expect(JSON.stringify(cachedFirst)).toBe(JSON.stringify(fresh));
    expect(JSON.stringify(cachedSecond)).toBe(JSON.stringify(fresh));
  });
});
