import {
  drawUint32,
  jobSlotsForBuilding,
  populationTotal,
  refreshEmployment,
  workingAgePopulation,
  type World,
} from "@century/sim";
import {
  M3B_SEED,
  controlledScenario,
  m3bWorld,
  refresh,
  setBlockWorkforce,
  setBuildingJobs,
  workingAgeGroups,
} from "../fixtures/m3b.js";

function assignmentsFor(world: World, buildingId: number, professionId = 0) {
  return world.employment.filter(
    (assignment) =>
      assignment.buildingInstanceId === buildingId && assignment.professionId === professionId,
  );
}

function assignedForBlock(world: World, blockId: number): number {
  return world.employment
    .filter((assignment) => assignment.popBlockId === blockId)
    .reduce((total, assignment) => total + assignment.workers, 0);
}

describe("M3b workforce eligibility and assignment", () => {
  test("derives working age from both sex-specific arrays", () => {
    const scenario = controlledScenario();
    const block = scenario.population.popBlocks[0]!;
    block.maleAgeGroups = workingAgeGroups(60);
    block.femaleAgeGroups = workingAgeGroups(40);
    const world = m3bWorld(scenario);
    expect(workingAgePopulation(world.popBlocks[0]!)).toBe(100);
    expect(populationTotal(world.popBlocks[0]!)).toBe(100);
  });

  test("assigns only the participation-rate workforce", () => {
    const scenario = controlledScenario();
    setBlockWorkforce(scenario, 0, 100, 0);
    setBuildingJobs(scenario, 0, [{ professionId: 0, workersPerThroughputUnit: 1000 }]);
    const world = m3bWorld(scenario);
    const result = refresh(world, scenario);

    expect(result.refreshed).toBe(true);
    expect(assignedForBlock(world, 0)).toBe(45);
    expect(result.unemployedEligible).toBe(0);
    expect(populationTotal(world.popBlocks[0]!)).toBe(100);
  });

  test("requires exact profession matching", () => {
    const scenario = controlledScenario();
    setBlockWorkforce(scenario, 0, 100, 0);
    setBuildingJobs(scenario, 0, [{ professionId: 1, workersPerThroughputUnit: 1000 }]);
    const world = m3bWorld(scenario);
    refresh(world, scenario);
    expect(world.employment).toHaveLength(0);
  });

  test("enforces literacy and wealth qualification thresholds", () => {
    const scenario = controlledScenario();
    setBlockWorkforce(scenario, 0, 100, 2, 0.5, 50);
    const world = m3bWorld(scenario);
    refresh(world, scenario);
    expect(world.employment).toHaveLength(0);

    scenario.population.popBlocks[0]!.literacy = 0.8;
    scenario.population.popBlocks[0]!.wealthLevel = 10;
    const second = m3bWorld(scenario);
    refresh(second, scenario);
    expect(second.employment).toHaveLength(0);

    scenario.population.popBlocks[0]!.wealthLevel = 30;
    const third = m3bWorld(scenario);
    refresh(third, scenario);
    expect(assignedForBlock(third, 0)).toBe(55);
  });

  test("caps assignments at integer job slots and handles fractional/zero capacity", () => {
    const scenario = controlledScenario();
    setBlockWorkforce(scenario, 0, 100, 0);
    setBuildingJobs(scenario, 0, [{ professionId: 0, workersPerThroughputUnit: 10 }]);
    const world = m3bWorld(scenario);
    expect(jobSlotsForBuilding(scenario.definitions.buildings[0]!, world.buildings[0]!, 0)).toBe(10);
    refresh(world, scenario);
    expect(assignedForBlock(world, 0)).toBe(10);

    world.buildings[0]!.condition = 0.5;
    refresh(world, scenario);
    expect(assignedForBlock(world, 0)).toBe(5);

    setBuildingJobs(scenario, 0, [{ professionId: 0, workersPerThroughputUnit: 3 }]);
    world.buildings[0]!.condition = 0.5;
    expect(jobSlotsForBuilding(scenario.definitions.buildings[0]!, world.buildings[0]!, 0)).toBe(1);
    refresh(world, scenario);
    expect(assignedForBlock(world, 0)).toBe(1);

    world.buildings[0]!.condition = 0;
    refresh(world, scenario);
    expect(world.employment).toHaveLength(0);
  });

  test("never double-assigns or exceeds block/building caps", () => {
    const scenario = controlledScenario();
    setBlockWorkforce(scenario, 0, 100, 0);
    setBlockWorkforce(scenario, 1, 80, 0);
    setBuildingJobs(scenario, 0, [{ professionId: 0, workersPerThroughputUnit: 20 }]);
    setBuildingJobs(scenario, 1, [{ professionId: 0, workersPerThroughputUnit: 15 }]);
    const world = m3bWorld(scenario);
    refresh(world, scenario);

    expect(assignedForBlock(world, 0)).toBeLessThanOrEqual(45);
    expect(assignedForBlock(world, 1)).toBeLessThanOrEqual(36);
    expect(assignmentsFor(world, 0).reduce((total, a) => total + a.workers, 0)).toBeLessThanOrEqual(20);
    expect(assignmentsFor(world, 1).reduce((total, a) => total + a.workers, 0)).toBeLessThanOrEqual(15);
    const keys = new Set(
      world.employment.map(
        (assignment) =>
          `${String(assignment.popBlockId)}:${String(assignment.buildingInstanceId)}:${String(assignment.professionId)}`,
      ),
    );
    expect(keys.size).toBe(world.employment.length);
  });

  test("retains existing valid assignments", () => {
    const scenario = controlledScenario({
      employment: [
        { id: 7, popBlockId: 0, buildingInstanceId: 0, professionId: 0, workers: 20 },
      ],
    });
    setBlockWorkforce(scenario, 0, 100, 0);
    setBuildingJobs(scenario, 0, [{ professionId: 0, workersPerThroughputUnit: 20 }]);
    const world = m3bWorld(scenario);
    const result = refresh(world, scenario);

    expect(world.employment).toHaveLength(1);
    expect(world.employment[0]?.id).toBe(7);
    expect(world.employment[0]?.workers).toBe(20);
    expect(result.createdAssignments).toBe(0);
  });

  test("fills additional capacity into a retained assignment", () => {
    const scenario = controlledScenario({
      employment: [
        { id: 7, popBlockId: 0, buildingInstanceId: 0, professionId: 0, workers: 20 },
      ],
    });
    setBlockWorkforce(scenario, 0, 100, 0);
    setBuildingJobs(scenario, 0, [{ professionId: 0, workersPerThroughputUnit: 45 }]);
    const world = m3bWorld(scenario);
    const result = refresh(world, scenario);

    expect(world.employment).toHaveLength(1);
    expect(world.employment[0]?.id).toBe(7);
    expect(world.employment[0]?.workers).toBe(45);
    expect(result.createdAssignments).toBe(0);
  });

  test("releases excess workers when slots shrink and retains deterministically", () => {
    const scenario = controlledScenario({
      employment: [
        { id: 0, popBlockId: 0, buildingInstanceId: 0, professionId: 0, workers: 10 },
        { id: 1, popBlockId: 1, buildingInstanceId: 0, professionId: 0, workers: 10 },
      ],
    });
    setBlockWorkforce(scenario, 0, 100, 0);
    setBlockWorkforce(scenario, 1, 100, 0);
    setBuildingJobs(scenario, 0, [{ professionId: 0, workersPerThroughputUnit: 20 }]);
    const world = m3bWorld(scenario);
    world.buildings[0]!.condition = 0.5;

    const result = refresh(world, scenario);
    expect(world.employment.reduce((total, a) => total + a.workers, 0)).toBe(10);
    expect(result.releasedAssignments).toBeGreaterThan(0);

    const draws = [0, 1].map((id) => ({
      id,
      draw: drawUint32({
        seed: M3B_SEED,
        day: 0,
        entityId: id,
        purpose: "employment.retain",
        drawIndex: 0,
      }),
    }));
    draws.sort((left, right) => left.draw - right.draw || left.id - right.id);
    expect(world.employment[0]?.id).toBe(draws[0]?.id);
    expect(world.employment[0]?.workers).toBe(10);
  });

  test("releases excess workers when slots shrink and reassigns to other vacancies", () => {
    const scenario = controlledScenario({
      employment: [
        { id: 0, popBlockId: 0, buildingInstanceId: 0, professionId: 0, workers: 20 },
        { id: 1, popBlockId: 1, buildingInstanceId: 1, professionId: 0, workers: 20 },
      ],
    });
    setBlockWorkforce(scenario, 0, 100, 0);
    setBlockWorkforce(scenario, 1, 100, 0);
    setBuildingJobs(scenario, 0, [{ professionId: 0, workersPerThroughputUnit: 20 }]);
    setBuildingJobs(scenario, 1, [{ professionId: 0, workersPerThroughputUnit: 20 }]);
    setBuildingJobs(scenario, 2, [{ professionId: 0, workersPerThroughputUnit: 10 }]);
    const world = m3bWorld(scenario);

    world.buildings[0]!.condition = 0.25;
    const result = refresh(world, scenario);

    expect(result.releasedWorkers).toBeGreaterThan(0);
    expect(assignmentsFor(world, 0).reduce((total, a) => total + a.workers, 0)).toBe(5);
    expect(assignmentsFor(world, 1).reduce((total, a) => total + a.workers, 0)).toBe(20);
    expect(assignmentsFor(world, 2).reduce((total, a) => total + a.workers, 0)).toBe(10);
  });

  test("uses largest-remainder quotas and keyed tie-breaking across eligible blocks", () => {
    const scenario = controlledScenario();
    setBlockWorkforce(scenario, 0, 100, 0);
    setBlockWorkforce(scenario, 1, 100, 0);
    setBuildingJobs(scenario, 0, [{ professionId: 0, workersPerThroughputUnit: 3 }]);
    const world = m3bWorld(scenario);
    refresh(world, scenario);

    const block0 = assignedForBlock(world, 0);
    const block1 = assignedForBlock(world, 1);
    expect(block0 + block1).toBe(3);
    expect([block0, block1].sort()).toEqual([1, 2]);

    const draws = [0, 1].map((id) => ({
      id,
      draw: drawUint32({
        seed: M3B_SEED,
        day: 0,
        entityId: id,
        purpose: "employment.block-remainder",
        drawIndex: 0,
      }),
    }));
    draws.sort((left, right) => left.draw - right.draw || left.id - right.id);
    const expectedExtra = draws[0]?.id === 0 ? block0 : block1;
    expect(expectedExtra).toBe(2);
  });

  test("leaves unqualified blocks and unstaffed buildings valid", () => {
    const scenario = controlledScenario();
    setBlockWorkforce(scenario, 0, 100, 2, 0.1, 10);
    const world = m3bWorld(scenario);
    refresh(world, scenario);
    expect(world.employment).toHaveLength(0);
    expect(world.buildings[6]?.operational).toBe(true);
    expect(populationTotal(world.popBlocks[0]!)).toBe(100);
  });

  test("keeps unemployed workers in the population", () => {
    const scenario = controlledScenario();
    setBlockWorkforce(scenario, 0, 100, 0);
    setBuildingJobs(scenario, 0, [{ professionId: 0, workersPerThroughputUnit: 10 }]);
    const world = m3bWorld(scenario);
    const result = refresh(world, scenario);
    expect(assignedForBlock(world, 0)).toBe(10);
    expect(result.unemployedEligible).toBe(35);
    expect(populationTotal(world.popBlocks[0]!)).toBe(100);
  });

  test("refreshes are idempotent when forced", () => {
    const scenario = controlledScenario();
    setBlockWorkforce(scenario, 0, 100, 0);
    setBuildingJobs(scenario, 0, [{ professionId: 0, workersPerThroughputUnit: 10 }]);
    const world = m3bWorld(scenario);
    refresh(world, scenario);
    const before = world.employment.map((assignment) => ({ ...assignment }));
    const result = refresh(world, scenario);
    expect(world.employment).toEqual(before);
    expect(result.createdAssignments).toBe(0);
  });

  test("rejects invalid definitions passed to the refresh routine", () => {
    const scenario = controlledScenario();
    const world = m3bWorld(scenario);
    const invalid = {
      ...scenario.definitions,
      buildings: scenario.definitions.buildings.slice(1),
    };
    expect(() => refreshEmployment(world, invalid, 0, { force: true })).toThrow(/building|definition|reference/i);
  });
});
