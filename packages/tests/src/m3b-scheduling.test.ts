import {
  CAMPAIGN_TERMINAL_DAY_INDEX,
  assertValidWorld,
  civilDateToDayIndex,
  deserializeWorld,
  hashWorld,
  isEmploymentRefreshDue,
  markEmploymentDirty,
  refreshEmploymentIfDue,
  serializeWorld,
  type EconomyScenarioDef,
} from "@century/sim";
import {
  controlledScenario,
  m3bWorld,
  refresh,
  setBlockWorkforce,
  setBuildingJobs,
} from "./fixtures/m3b.js";

function employmentScenario(): EconomyScenarioDef {
  const scenario = controlledScenario();
  setBlockWorkforce(scenario, 0, 100, 0);
  setBlockWorkforce(scenario, 1, 80, 0);
  setBuildingJobs(scenario, 0, [{ professionId: 0, workersPerThroughputUnit: 10 }]);
  setBuildingJobs(scenario, 1, [{ professionId: 0, workersPerThroughputUnit: 8 }]);
  return scenario;
}

describe("M3b employment scheduling", () => {
  test("initial evaluation is due and clears the dirty flag", () => {
    const scenario = employmentScenario();
    const world = m3bWorld(scenario);
    expect(world.employmentDirty).toBe(true);
    expect(isEmploymentRefreshDue(world, 0)).toBe(true);

    const result = refreshEmploymentIfDue(world, scenario.definitions, 0);
    expect(result.refreshed).toBe(true);
    expect(world.employmentDirty).toBe(false);
    expect(world.employment.length).toBeGreaterThan(0);
    expect(assertValidWorld(world)).toBeUndefined();
  });

  test("is due on the first civil day of each month and not on other days", () => {
    const scenario = employmentScenario();
    const world = m3bWorld(scenario);
    refreshEmploymentIfDue(world, scenario.definitions, 0);

    expect(isEmploymentRefreshDue(world, 1)).toBe(false);
    expect(isEmploymentRefreshDue(world, civilDateToDayIndex(1900, 2, 1))).toBe(true);
    expect(isEmploymentRefreshDue(world, civilDateToDayIndex(1901, 1, 1))).toBe(true);
    expect(isEmploymentRefreshDue(world, civilDateToDayIndex(1904, 2, 1))).toBe(true);
    expect(isEmploymentRefreshDue(world, civilDateToDayIndex(1904, 2, 2))).toBe(false);
  });

  test("is not due at the terminal campaign boundary", () => {
    const scenario = employmentScenario();
    const world = m3bWorld(scenario);
    world.employmentDirty = true;
    expect(isEmploymentRefreshDue(world, CAMPAIGN_TERMINAL_DAY_INDEX)).toBe(false);
    const result = refreshEmploymentIfDue(
      world,
      scenario.definitions,
      CAMPAIGN_TERMINAL_DAY_INDEX,
    );
    expect(result.refreshed).toBe(false);
  });

  test("dirty state triggers reassignment immediately", () => {
    const scenario = employmentScenario();
    const world = m3bWorld(scenario);
    refreshEmploymentIfDue(world, scenario.definitions, 0);
    const before = world.employment.length;

    expect(isEmploymentRefreshDue(world, 5)).toBe(false);
    markEmploymentDirty(world);
    expect(isEmploymentRefreshDue(world, 5)).toBe(true);
    const result = refreshEmploymentIfDue(world, scenario.definitions, 5);
    expect(result.refreshed).toBe(true);
    expect(world.employmentDirty).toBe(false);
    expect(world.employment.length).toBe(before);
  });

  test("changed job capacity marked dirty reassigns immediately", () => {
    const scenario = employmentScenario();
    const world = m3bWorld(scenario);
    refreshEmploymentIfDue(world, scenario.definitions, 0);
    const assignedBefore = world.employment.reduce(
      (total, assignment) => total + assignment.workers,
      0,
    );
    world.buildings[0]!.condition = 0.5;
    markEmploymentDirty(world);
    refreshEmploymentIfDue(world, scenario.definitions, 5);
    const assignedAfter = world.employment.reduce(
      (total, assignment) => total + assignment.workers,
      0,
    );

    expect(assignedAfter).toBeLessThan(assignedBefore);
    expect(world.employmentDirty).toBe(false);
  });

  test("closure or capacity change marked dirty releases invalid assignments", () => {
    const scenario = employmentScenario();
    const world = m3bWorld(scenario);
    refreshEmploymentIfDue(world, scenario.definitions, 0);
    const buildingId = world.employment[0]?.buildingInstanceId;
    if (buildingId === undefined) throw new Error("expected an assignment");
    world.buildings.find((building) => building.id === buildingId)!.operational = false;
    markEmploymentDirty(world);
    const result = refreshEmploymentIfDue(world, scenario.definitions, 5);

    expect(result.refreshed).toBe(true);
    expect(world.employment.some((assignment) => assignment.buildingInstanceId === buildingId)).toBe(false);
    expect(assertValidWorld(world)).toBeUndefined();
  });

  test("permuted pop-block, building, and assignment arrays yield identical state", () => {
    const firstScenario = employmentScenario();
    const secondScenario = employmentScenario();
    secondScenario.population.popBlocks = [...secondScenario.population.popBlocks].reverse();
    secondScenario.buildingInstances = [...secondScenario.buildingInstances].reverse();
    secondScenario.employment = [...secondScenario.employment].reverse();

    const first = m3bWorld(firstScenario);
    const second = m3bWorld(secondScenario);
    refresh(first, firstScenario);
    refresh(second, secondScenario);

    expect(second.employment).toEqual(first.employment);
    expect(hashWorld(second)).toBe(hashWorld(first));
  });

  test("save/resume at a dirty boundary reproduces assignments and hash", () => {
    const scenario = employmentScenario();
    const original = m3bWorld(scenario);
    original.dayIndex = 5;
    const restored = deserializeWorld(serializeWorld(original));

    expect(restored.employmentDirty).toBe(true);
    refreshEmploymentIfDue(original, scenario.definitions, 5);
    refreshEmploymentIfDue(restored, scenario.definitions, 5);
    expect(restored.employment).toEqual(original.employment);
    expect(hashWorld(restored)).toBe(hashWorld(original));
  });

  test("repeated runs produce identical assignments and hashes", () => {
    const scenario = employmentScenario();
    const first = m3bWorld(scenario);
    const second = m3bWorld(scenario);
    refresh(first, scenario);
    refresh(second, scenario);
    expect(second.employment).toEqual(first.employment);
    expect(hashWorld(second)).toBe(hashWorld(first));

    refresh(first, scenario);
    refresh(second, scenario);
    expect(second.employment).toEqual(first.employment);
    expect(hashWorld(second)).toBe(hashWorld(first));
  });
});
