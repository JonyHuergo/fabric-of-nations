import {
  applyMigrationRequest,
  assertValidEmploymentState,
  assertValidWorld,
  createEconomyWorld,
  designatedCashTotal,
  hashWorld,
  migrationIsDue,
  populationTotal,
  runMigrationPhase,
  type World,
} from "@century/sim";
import {
  M5_REGION_C1,
  m5AgeGroups,
  m5Scenario,
  type M5FixtureOptions,
} from "./fixtures/m5.js";

function migrationScenario(
  options: M5FixtureOptions = {},
): ReturnType<typeof m5Scenario> {
  const scenario = m5Scenario(options);
  scenario.buildingInstances = scenario.buildingInstances.filter(
    (building) => building.provinceId !== M5_REGION_C1 || building.definitionId !== 0,
  );
  scenario.population.popBlocks = scenario.population.popBlocks.map((block) =>
    block.id === 5 ? { ...block, wealthLevel: 60 } : block,
  );
  return scenario;
}

function worldAt(dayIndex: number, options: M5FixtureOptions = {}): {
  readonly scenario: ReturnType<typeof m5Scenario>;
  readonly world: World;
} {
  const scenario = migrationScenario(options);
  const world = createEconomyWorld(scenario, { seed: 20_261_023 });
  world.dayIndex = dayIndex;
  return { scenario, world };
}

describe("M5 migration", () => {
  test("moves a deterministic population flow and conserves world population", () => {
    const { scenario, world } = worldAt(31);
    const before = world.popBlocks.reduce((total, block) => total + populationTotal(block), 0);
    const source = world.popBlocks.find((block) => block.id === 0);
    const destination = world.popBlocks.find((block) => block.id === 5);
    expect(source).toBeDefined();
    expect(destination).toBeDefined();
    if (source === undefined || destination === undefined) return;
    const sourceBefore = populationTotal(source);
    const destinationBefore = populationTotal(destination);
    const sourceCashBefore = world.finance.accounts.find(
      (account) => account.id === source.financialAccountId,
    )?.balanceRUSD;
    const destinationCashBefore = world.finance.accounts.find(
      (account) => account.id === destination.financialAccountId,
    )?.balanceRUSD;
    const cashBefore = designatedCashTotal(world.finance);
    const sourceAttributes = {
      literacy: source.literacy,
      wealth: source.wealthLevel,
      militancy: source.militancy,
    };

    const result = runMigrationPhase(world, scenario.definitions, 31);
    expect(result.ran).toBe(true);
    expect(result.flows.length).toBeGreaterThan(0);
    const flow = result.flows.find((candidate) => candidate.sourcePopBlockId === 0);
    expect(flow).toBeDefined();
    if (flow === undefined) return;
    expect(flow.destinationPopBlockId).toBe(5);
    expect(flow.people).toBeGreaterThan(0);
    expect(flow.people).toBeLessThanOrEqual(sourceBefore);
    const destinationInflow = result.flows
      .filter((candidate) => candidate.destinationPopBlockId === 5)
      .reduce((total, candidate) => total + candidate.people, 0);
    expect(destinationInflow).toBeGreaterThanOrEqual(flow.people);

    const sourceAfter = populationTotal(source);
    const destinationAfter = populationTotal(destination);
    expect(sourceAfter).toBe(sourceBefore - flow.people);
    expect(destinationAfter).toBe(destinationBefore + destinationInflow);
    expect(
      world.popBlocks.reduce((total, block) => total + populationTotal(block), 0),
    ).toBe(before);

    expect(source.literacy).toBe(sourceAttributes.literacy);
    expect(source.wealthLevel).toBe(sourceAttributes.wealth);
    expect(source.militancy).toBe(sourceAttributes.militancy);
    expect(destination.wealthLevel).toBeGreaterThan(28);
    expect(destination.wealthLevel).toBeLessThan(60);

    const sourceCashAfter = world.finance.accounts.find(
      (account) => account.id === source.financialAccountId,
    )?.balanceRUSD;
    const destinationCashAfter = world.finance.accounts.find(
      (account) => account.id === destination.financialAccountId,
    )?.balanceRUSD;
    expect(sourceCashAfter).toBeDefined();
    expect(destinationCashAfter).toBeDefined();
    if (
      sourceCashBefore === undefined ||
      destinationCashBefore === undefined ||
      sourceCashAfter === undefined ||
      destinationCashAfter === undefined
    ) {
      return;
    }
    expect(sourceCashAfter).toBeLessThan(sourceCashBefore);
    expect(destinationCashAfter).toBeGreaterThan(destinationCashBefore);
    expect(designatedCashTotal(world.finance)).toBeCloseTo(cashBefore, 9);
    const destinationTransfer = result.flows
      .filter((candidate) => candidate.destinationPopBlockId === 5)
      .reduce((total, candidate) => total + candidate.financialTransferRUSD, 0);
    expect(sourceCashBefore - sourceCashAfter).toBeCloseTo(flow.financialTransferRUSD, 9);
    expect(destinationCashAfter - destinationCashBefore).toBeCloseTo(destinationTransfer, 9);
    expect(flow.financialTransferRUSD).toBeGreaterThan(0);
    assertValidWorld(world);
  });

  test("caps a destination's monthly inflow", () => {
    const scenario = migrationScenario();
    scenario.population.popBlocks = scenario.population.popBlocks.map((block) =>
      block.id === 5
        ? {
            ...block,
            wealthLevel: 99,
            maleAgeGroups: m5AgeGroups(50),
            femaleAgeGroups: m5AgeGroups(50),
          }
        : block.id === 6
          ? {
              ...block,
              maleAgeGroups: m5AgeGroups(50),
              femaleAgeGroups: m5AgeGroups(50),
            }
          : block,
    );
    const world = createEconomyWorld(scenario, { seed: 20_261_023 });
    world.dayIndex = 31;
    const cap = Math.floor(200 * 0.01);
    const result = runMigrationPhase(world, scenario.definitions, 31);
    expect(result.flows.length).toBeGreaterThan(0);
    const total = result.flows
      .filter((flow) => flow.destinationProvinceId === M5_REGION_C1)
      .reduce((sum, flow) => sum + flow.people, 0);
    expect(total).toBeLessThanOrEqual(cap);
  });

  test("is deterministic and independent of declaration order", () => {
    const scenario = migrationScenario();
    const first = createEconomyWorld(scenario, { seed: 20_261_023 });
    first.dayIndex = 31;
    const second = createEconomyWorld(
      {
        ...scenario,
        population: {
          ...scenario.population,
          provinceEconomies: [...scenario.population.provinceEconomies].reverse(),
          popBlocks: [...scenario.population.popBlocks].reverse(),
        },
        markets: [...scenario.markets].reverse(),
        buildingInstances: [...scenario.buildingInstances].reverse(),
      },
      { seed: 20_261_023 },
    );
    second.dayIndex = 31;
    const firstResult = runMigrationPhase(first, scenario.definitions, 31);
    const secondResult = runMigrationPhase(second, scenario.definitions, 31);
    expect(secondResult.flows).toEqual(firstResult.flows);
    expect(hashWorld(second)).toBe(hashWorld(first));
  });

  test("rejects invalid and missing destination references without mutation", () => {
    const { scenario, world } = worldAt(31);
    const before = hashWorld(world);
    const employmentBefore = world.employment.map((assignment) => ({ ...assignment }));
    const dirtyBefore = world.employmentDirty;
    expect(() =>
      applyMigrationRequest(world, scenario.definitions, 31, {
        sourcePopBlockId: 0,
        destinationPopBlockId: 999,
        people: 1,
      }),
    ).toThrow(/unknown destination pop block/);
    expect(hashWorld(world)).toBe(before);
    expect(world.employment).toEqual(employmentBefore);
    expect(world.employmentDirty).toBe(dirtyBefore);

    expect(() =>
      applyMigrationRequest(world, scenario.definitions, 31, {
        sourcePopBlockId: 0,
        destinationPopBlockId: 1,
        people: 1,
      }),
    ).toThrow(/different provinces/);
    expect(hashWorld(world)).toBe(before);

    expect(() =>
      applyMigrationRequest(world, scenario.definitions, 31, {
        sourcePopBlockId: 0,
        destinationPopBlockId: 6,
        people: 1,
      }),
    ).toThrow(/same profession/);
    expect(hashWorld(world)).toBe(before);

    expect(() =>
      applyMigrationRequest(world, scenario.definitions, 31, {
        sourcePopBlockId: 0,
        destinationPopBlockId: 4,
        people: 1,
      }),
    ).toThrow(/open border/);
    expect(hashWorld(world)).toBe(before);
  });

  test("a direct phase repairs employment and conserves population and cash", () => {
    const { scenario, world } = worldAt(31);
    const beforePopulation = world.popBlocks.reduce(
      (total, block) => total + populationTotal(block),
      0,
    );
    const beforeCash = designatedCashTotal(world.finance);

    const result = runMigrationPhase(world, scenario.definitions, 31);
    expect(result.ran).toBe(true);
    expect(result.flows.length).toBeGreaterThan(0);
    expect(result.totalPeople).toBeGreaterThan(0);
    expect(result.employmentRefresh).not.toBeNull();
    expect(result.employmentRefresh?.refreshed).toBe(true);

    expect(world.employmentDirty).toBe(false);
    assertValidEmploymentState(world, scenario.definitions);
    assertValidWorld(world);
    expect(
      world.popBlocks.reduce((total, block) => total + populationTotal(block), 0),
    ).toBe(beforePopulation);
    expect(designatedCashTotal(world.finance)).toBeCloseTo(beforeCash, 6);
  });

  test("an explicit request repairs employment and keeps the world publishable", () => {
    const { scenario, world } = worldAt(31);
    const beforePopulation = world.popBlocks.reduce(
      (total, block) => total + populationTotal(block),
      0,
    );
    const beforeCash = designatedCashTotal(world.finance);
    const dayBefore = world.dayIndex;

    const flow = applyMigrationRequest(world, scenario.definitions, 31, {
      sourcePopBlockId: 0,
      destinationPopBlockId: 5,
      people: 10,
    });
    expect(flow.people).toBe(10);
    expect(world.dayIndex).toBe(dayBefore);
    expect(world.employmentDirty).toBe(false);
    assertValidEmploymentState(world, scenario.definitions);
    assertValidWorld(world);
    expect(
      world.popBlocks.reduce((total, block) => total + populationTotal(block), 0),
    ).toBe(beforePopulation);
    expect(designatedCashTotal(world.finance)).toBeCloseTo(beforeCash, 6);
  });

  test("accepts an explicit flow into an open country and rejects a closed one", () => {
    const { scenario, world } = worldAt(31);
    const flow = applyMigrationRequest(world, scenario.definitions, 31, {
      sourcePopBlockId: 0,
      destinationPopBlockId: 5,
      people: 10,
    });
    expect(flow.people).toBe(10);
    expect(flow.destinationProvinceId).toBe(M5_REGION_C1);
    assertValidWorld(world);

    const { world: closedWorld } = worldAt(31);
    expect(() =>
      applyMigrationRequest(closedWorld, scenario.definitions, 31, {
        sourcePopBlockId: 0,
        destinationPopBlockId: 4,
        people: 1,
      }),
    ).toThrow(/open border/);
  });

  test("skips blocks with zero population and months other than the first day", () => {
    const scenario = migrationScenario();
    scenario.population.popBlocks = scenario.population.popBlocks.map((block) =>
      block.id === 0
        ? {
            ...block,
            maleAgeGroups: new Array(17).fill(0),
            femaleAgeGroups: new Array(17).fill(0),
          }
        : block,
    );
    const world = createEconomyWorld(scenario, { seed: 20_261_023 });
    world.dayIndex = 31;
    const result = runMigrationPhase(world, scenario.definitions, 31);
    expect(result.flows.some((flow) => flow.sourcePopBlockId === 0)).toBe(false);

    const { world: otherDay } = worldAt(32);
    expect(migrationIsDue(otherDay, 32)).toBe(false);
    expect(runMigrationPhase(otherDay, scenario.definitions, 32).ran).toBe(false);
  });

  test("runs across a calendar-year boundary", () => {
    const { scenario, world } = worldAt(365);
    expect(migrationIsDue(world, 365)).toBe(true);
    const before = world.popBlocks.reduce((total, block) => total + populationTotal(block), 0);
    const result = runMigrationPhase(world, scenario.definitions, 365);
    expect(result.ran).toBe(true);
    expect(
      world.popBlocks.reduce((total, block) => total + populationTotal(block), 0),
    ).toBe(before);
  });
});
