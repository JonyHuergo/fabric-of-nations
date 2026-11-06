/**
 * AUDIT-020 and AUDIT-022 regression coverage.
 *
 * Military actions must occur on the current open day, and recruitment must
 * reconcile civilian employment with the working-age people it removes.
 */

import {
  CAMPAIGN_TERMINAL_DAY_INDEX,
  applyMilitaryAction,
  assertValidWorld,
  createEconomyWorld,
  hashWorld,
  refreshEmployment,
  validateMilitaryAction,
  workingAgePopulation,
  type EconomyScenarioDef,
  type Id,
  type MilitaryActionInput,
  type World,
} from "@century/sim";

import { m5Scenario } from "../fixtures/m5.js";

const SEED = 20_261_112;

/** Put all people in the 30-34 band so they are working-age and recruitable. */
function workingAgeOnlyGroups(population: number): number[] {
  const groups = new Array<number>(17).fill(0);
  groups[6] = population;
  return groups;
}

function militaryScenario(): EconomyScenarioDef {
  const scenario = m5Scenario();
  scenario.military = {};
  for (const country of scenario.countries ?? []) {
    country.initialTreasuryCashRUSD = 1_000_000;
  }
  return scenario;
}

function declareInput(dayIndex: number): MilitaryActionInput {
  return {
    kind: "declare-war",
    countryId: 0,
    dayIndex,
    source: "player",
    targetCountryId: 1,
    casusBelli: "border-dispute",
  };
}

function assignedWorkers(world: World, blockId: Id): number {
  return world.employment
    .filter((assignment) => assignment.popBlockId === blockId)
    .reduce((total, assignment) => total + assignment.workers, 0);
}

describe("AUDIT-020 military action day and accounting-period validation", () => {
  test("rejects a military action whose day does not match the world", () => {
    const world = createEconomyWorld(militaryScenario(), { seed: SEED });
    const hash = hashWorld(world);
    expect(() =>
      applyMilitaryAction(world, declareInput(world.dayIndex + 1), world.dayIndex + 1),
    ).toThrow(/does not match world day/);
    expect(hashWorld(world)).toBe(hash);
    expect(validateMilitaryAction(world, declareInput(world.dayIndex + 1)).valid).toBe(false);
  });

  test("rejects military actions at the terminal boundary and in a closed period", () => {
    const world = createEconomyWorld(militaryScenario(), { seed: SEED });
    world.dayIndex = CAMPAIGN_TERMINAL_DAY_INDEX;
    assertValidWorld(world);
    const terminalHash = hashWorld(world);
    expect(() =>
      applyMilitaryAction(world, declareInput(CAMPAIGN_TERMINAL_DAY_INDEX), CAMPAIGN_TERMINAL_DAY_INDEX),
    ).toThrow(/terminal/);
    expect(hashWorld(world)).toBe(terminalHash);

    const closedWorld = createEconomyWorld(militaryScenario(), { seed: SEED });
    closedWorld.finance.closedThroughDay = closedWorld.dayIndex;
    expect(validateMilitaryAction(closedWorld, declareInput(closedWorld.dayIndex)).errors.join(" ")).toMatch(
      /closed/,
    );
  });
});

describe("AUDIT-022 recruitment and civilian employment", () => {
  test("recruitment keeps assignments within the remaining working-age population and marks employment dirty", () => {
    const scenario = militaryScenario();
    const a1Blocks = scenario.population.popBlocks.filter((block) => block.provinceId === 0);
    for (const block of a1Blocks) {
      block.maleAgeGroups = workingAgeOnlyGroups(1_000);
      block.femaleAgeGroups = workingAgeOnlyGroups(1_000);
    }
    const world = createEconomyWorld(scenario, { seed: SEED });
    refreshEmployment(world, scenario.definitions, world.dayIndex, { force: true });
    assertValidWorld(world);
    const block = world.popBlocks.find((entry) => entry.provinceId === 0);
    if (block === undefined) throw new Error("missing province block");
    const beforeAssigned = assignedWorkers(world, block.id);
    expect(beforeAssigned).toBeGreaterThan(0);

    applyMilitaryAction(
      world,
      {
        kind: "recruit-army",
        countryId: 0,
        dayIndex: world.dayIndex,
        source: "player",
        provinceId: 0,
        personnel: 3_500,
      },
      world.dayIndex,
    );
    expect(world.employmentDirty).toBe(true);
    expect(assignedWorkers(world, block.id)).toBeLessThanOrEqual(workingAgePopulation(block));
    expect(assignedWorkers(world, block.id)).toBeLessThan(beforeAssigned);
    assertValidWorld(world);

    refreshEmployment(world, scenario.definitions, world.dayIndex, { force: true });
    assertValidWorld(world);
    expect(assignedWorkers(world, block.id)).toBeLessThanOrEqual(workingAgePopulation(block));
  });

  test("a failed recruitment restores employment and its dirty marker atomically", () => {
    const scenario = militaryScenario();
    const a1Blocks = scenario.population.popBlocks.filter((block) => block.provinceId === 0);
    for (const block of a1Blocks) {
      block.maleAgeGroups = workingAgeOnlyGroups(1_000);
      block.femaleAgeGroups = workingAgeOnlyGroups(1_000);
    }
    const world = createEconomyWorld(scenario, { seed: SEED });
    refreshEmployment(world, scenario.definitions, world.dayIndex, { force: true });
    const before = world.employment.map((assignment) => ({ ...assignment }));
    const dirtyBefore = world.employmentDirty;
    // Force a failure after people have been removed and employment reconciled.
    world.finance.accounts = world.finance.accounts.filter(
      (account) => account.subtype !== "military-income",
    );
    expect(() =>
      applyMilitaryAction(
        world,
        {
          kind: "recruit-army",
          countryId: 0,
          dayIndex: world.dayIndex,
          source: "player",
          provinceId: 0,
          personnel: 100,
        },
        world.dayIndex,
      ),
    ).toThrow();
    expect(world.employment).toEqual(before);
    expect(world.employmentDirty).toBe(dirtyBefore);
  });
});
