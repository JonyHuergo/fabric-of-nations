import {
  applyMigrationRequest,
  assertValidEmploymentState,
  assertValidWorld,
  createEconomyWorld,
  eligibleWorkforceForBlock,
  jobSlotsForBuilding,
  populationTotal,
  runTicks,
  tick,
  workingAgePopulation,
  type TickContext,
} from "@century/sim";
import {
  M5_COUNTRY_A,
  M5_COUNTRY_C,
  M5_REGION_B1,
  M5_REGION_C1,
  M5_WORKSHOP,
  m5Scenario,
} from "./fixtures/m5.js";

function context(scenario: ReturnType<typeof m5Scenario>): TickContext {
  return {
    population: { definitions: scenario.population.definitions },
    economy: { definitions: scenario.definitions },
  };
}

function withBuildingLevel(
  scenario: ReturnType<typeof m5Scenario>,
  buildingId: number,
  level: number,
): void {
  scenario.buildingInstances = scenario.buildingInstances.map((building) =>
    building.id === buildingId ? { ...building, level } : building,
  );
}

describe("M5 labor mobility", () => {
  test("fills cross-region jobs within a country and cross-border jobs only through an open border", () => {
    const scenario = m5Scenario();
    withBuildingLevel(scenario, 8, 20);
    const world = createEconomyWorld(scenario, { seed: 20_261_023 });
    runTicks(world, 1, context(scenario));
    const workshop = world.buildings.find((building) => building.id === 8);
    expect(workshop?.definitionId).toBe(M5_WORKSHOP);
    const workshopAssignments = world.employment.filter(
      (assignment) => assignment.buildingInstanceId === 8,
    );
    const foreign = workshopAssignments.filter((assignment) => {
      const block = world.popBlocks.find((candidate) => candidate.id === assignment.popBlockId);
      return block !== undefined && block.regionId !== M5_REGION_C1;
    });
    expect(foreign.length).toBeGreaterThan(0);
    for (const assignment of foreign) {
      const block = world.popBlocks.find((candidate) => candidate.id === assignment.popBlockId);
      expect(block).toBeDefined();
      if (block === undefined) continue;
      const owner = world.countries.find((country) => country.regionIds.includes(block.regionId));
      expect([M5_COUNTRY_A, M5_COUNTRY_C]).toContain(owner?.id);
    }
    // B is closed: no B residents may work in C and no A residents may work in B.
    const bAssignments = world.employment.filter((assignment) => {
      const building = world.buildings.find(
        (candidate) => candidate.id === assignment.buildingInstanceId,
      );
      return building?.regionId === M5_REGION_B1;
    });
    for (const assignment of bAssignments) {
      const block = world.popBlocks.find((candidate) => candidate.id === assignment.popBlockId);
      expect(block?.regionId).toBe(M5_REGION_B1);
    }
    assertValidWorld(world);
  });

  test("rejects a scenario that assigns foreign labor across a closed border", () => {
    const scenario = m5Scenario();
    scenario.employment = [
      {
        id: 0,
        popBlockId: 0,
        buildingInstanceId: 5,
        professionId: 0,
        workers: 100,
      },
    ];
    expect(() => createEconomyWorld(scenario)).toThrow(/crosses a closed border/);
  });

  test("respects qualifications, job slots, and eligible workforce", () => {
    const scenario = m5Scenario();
    // Laborers become unqualified for their own profession.
    scenario.population.popBlocks = scenario.population.popBlocks.map((block) =>
      block.professionId === 1 ? { ...block, literacy: 0 } : block,
    );
    const world = createEconomyWorld(scenario, { seed: 20_261_023 });
    runTicks(world, 1, context(scenario));
    const laborerAssignments = world.employment.filter((assignment) => {
      const block = world.popBlocks.find((candidate) => candidate.id === assignment.popBlockId);
      return block?.professionId === 1;
    });
    expect(laborerAssignments).toHaveLength(0);
    expect(world.employment.length).toBeGreaterThan(0);

    const base = m5Scenario();
    const baseWorld = createEconomyWorld(base, { seed: 20_261_023 });
    runTicks(baseWorld, 1, context(base));
    const professionById = new Map(base.definitions.professions.map((profession) => [profession.id, profession]));
    const definitionById = new Map(base.definitions.buildings.map((definition) => [definition.id, definition]));
    for (const block of baseWorld.popBlocks) {
      const profession = professionById.get(block.professionId);
      if (profession === undefined) continue;
      const assigned = baseWorld.employment
        .filter((assignment) => assignment.popBlockId === block.id)
        .reduce((total, assignment) => total + assignment.workers, 0);
      expect(assigned).toBeLessThanOrEqual(eligibleWorkforceForBlock(block, profession));
      expect(assigned).toBeLessThanOrEqual(workingAgePopulation(block));
    }
    for (const building of baseWorld.buildings) {
      const definition = definitionById.get(building.definitionId);
      if (definition === undefined) continue;
      for (const job of definition.jobs) {
        const slots = jobSlotsForBuilding(definition, building, job.professionId);
        const assigned = baseWorld.employment
          .filter(
            (assignment) =>
              assignment.buildingInstanceId === building.id &&
              assignment.professionId === job.professionId,
          )
          .reduce((total, assignment) => total + assignment.workers, 0);
        expect(assigned).toBeLessThanOrEqual(slots);
      }
    }
    assertValidEmploymentState(baseWorld, base.definitions);
  });

  test("reports unfilled jobs when the domestic workforce is too small", () => {
    const scenario = m5Scenario();
    withBuildingLevel(scenario, 5, 10);
    const world = createEconomyWorld(scenario, { seed: 20_261_023 });
    const result = tick(world, context(scenario));
    const employment = result.economy?.employment;
    expect(employment?.unfilledSlots ?? 0).toBeGreaterThan(0);
    const bPeasants = world.popBlocks.find((block) => block.id === 4);
    expect(bPeasants).toBeDefined();
    if (bPeasants === undefined) return;
    const assigned = world.employment
      .filter((assignment) => assignment.popBlockId === 4)
      .reduce((total, assignment) => total + assignment.workers, 0);
    expect(assigned).toBeGreaterThan(0);
    expect(assigned).toBeLessThanOrEqual(workingAgePopulation(bPeasants));
  });

  test("releases and reassigns workers after a migration event without duplication", () => {
    const scenario = m5Scenario();
    const world = createEconomyWorld(scenario, { seed: 20_261_023 });
    runTicks(world, 1, context(scenario));
    const source = world.popBlocks.find((block) => block.id === 0);
    const destination = world.popBlocks.find((block) => block.id === 5);
    if (source === undefined || destination === undefined) return;
    const beforeSourceWorkers = world.employment
      .filter((assignment) => assignment.popBlockId === 0)
      .reduce((total, assignment) => total + assignment.workers, 0);
    const totalBefore = world.popBlocks.reduce((sum, block) => sum + populationTotal(block), 0);
    const flow = applyMigrationRequest(world, scenario.definitions, world.dayIndex, {
      sourcePopBlockId: 0,
      destinationPopBlockId: 5,
      people: 1_000,
    });
    expect(flow.people).toBe(1_000);
    // applyMigrationRequest owns the post-flow employment repair.
    expect(world.employmentDirty).toBe(false);
    const afterSourceWorkers = world.employment
      .filter((assignment) => assignment.popBlockId === 0)
      .reduce((total, assignment) => total + assignment.workers, 0);
    expect(afterSourceWorkers).toBeLessThanOrEqual(beforeSourceWorkers);
    expect(world.popBlocks.reduce((sum, block) => sum + populationTotal(block), 0)).toBe(
      totalBefore,
    );
    const keys = new Set(
      world.employment.map(
        (assignment) =>
          `${assignment.popBlockId}:${assignment.buildingInstanceId}:${assignment.professionId}`,
      ),
    );
    expect(keys.size).toBe(world.employment.length);
    assertValidEmploymentState(world, scenario.definitions);
    assertValidWorld(world);
  });

  test("pays cross-border wages to the resident household and taxes them at residence", () => {
    const scenario = m5Scenario();
    withBuildingLevel(scenario, 8, 20);
    const world = createEconomyWorld(scenario, { seed: 20_261_023 });
    runTicks(world, 1, context(scenario));
    const regionOwners = new Map<number, number>();
    for (const country of world.countries) {
      for (const regionId of country.regionIds) regionOwners.set(regionId, country.id);
    }
    const accountById = new Map(world.finance.accounts.map((account) => [account.id, account]));
    for (const block of world.popBlocks) {
      const residence = regionOwners.get(block.regionId);
      if (residence === undefined) continue;
      const taxExpense = world.finance.accounts.find(
        (account) =>
          account.ownerKind === "popBlock" &&
          account.ownerId === block.id &&
          account.subtype === "income-tax-expense",
      );
      expect(taxExpense).toBeDefined();
      if (taxExpense === undefined) continue;
      const tax = taxExpense.balanceRUSD;
      expect(tax).toBeGreaterThanOrEqual(0);
      const treasury = world.finance.accounts.find(
        (account) =>
          account.ownerKind === "country" &&
          account.ownerId === residence &&
          account.subtype === "income-tax-revenue",
      );
      expect(treasury).toBeDefined();
      expect(accountById.get(block.financialAccountId)?.balanceRUSD ?? 0).toBeGreaterThanOrEqual(0);
    }
    for (const country of world.countries) {
      const taxRevenue = world.finance.accounts.find(
        (account) =>
          account.ownerKind === "country" &&
          account.ownerId === country.id &&
          account.subtype === "income-tax-revenue",
      );
      expect(taxRevenue).toBeDefined();
      const residentTax = world.popBlocks
        .filter((block) => regionOwners.get(block.regionId) === country.id)
        .reduce((total, block) => {
          const expense = world.finance.accounts.find(
            (account) =>
              account.ownerKind === "popBlock" &&
              account.ownerId === block.id &&
              account.subtype === "income-tax-expense",
          );
          return total + (expense?.balanceRUSD ?? 0);
        }, 0);
      expect(taxRevenue?.balanceRUSD ?? 0).toBeCloseTo(residentTax, 6);
    }
  });
});
