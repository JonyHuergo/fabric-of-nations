import {
  AGE_COHORT_COUNT,
  assertValidPopulationDefinitions,
  assertValidPopulationInputs,
  assertValidWorld,
  createPopulationWorld,
  populationTotal,
  workingAgePopulation,
  worldPopulation,
} from "@century/sim";
import {
  aggregateScenario,
  aggregateWorld,
  cohorts,
  contextFor,
  makeInputs,
  multiBlockScenario,
} from "./fixtures/m2.js";
import { tick } from "@century/sim";

describe("M2 population state and validation", () => {
  test("creates the aggregate world with 17 cohorts and a household account", () => {
    const { world } = aggregateWorld();
    expect(world.regions).toHaveLength(1);
    expect(world.popBlocks).toHaveLength(1);
    expect(world.finance.accounts).toHaveLength(1);
    const block = world.popBlocks[0]!;
    expect(block.ageCohorts).toBeInstanceOf(Uint32Array);
    expect(block.ageCohorts).toHaveLength(AGE_COHORT_COUNT);
    expect(block.agingCarry).toBeInstanceOf(Uint8Array);
    expect(block.agingCarry).toHaveLength(AGE_COHORT_COUNT);
    expect(populationTotal(block)).toBe(1_621_287_278);
    expect(workingAgePopulation(block)).toBeGreaterThan(0);
    expect(worldPopulation(world)).toBe(1_621_287_278);
    expect(world.finance.accounts[0]?.id).toBe(block.financialAccountId);
    expect(() => assertValidWorld(world)).not.toThrow();
  });

  test("creates the multi-block fixture with one shared region", () => {
    const scenario = multiBlockScenario();
    const world = createPopulationWorld(scenario);
    expect(world.regions).toHaveLength(1);
    expect(world.popBlocks).toHaveLength(3);
    expect(world.regions[0]?.popBlockIds).toEqual([0, 1, 2]);
    expect(world.finance.accounts).toHaveLength(3);
    expect(worldPopulation(world)).toBe(1_000_000);
    expect(() => assertValidWorld(world)).not.toThrow();
  });

  test("rejects malformed cohort and account state", () => {
    const scenario = aggregateScenario();
    const malformedCohorts = {
      ...scenario,
      popBlocks: [
        {
          ...scenario.popBlocks[0]!,
          ageCohorts: [1, 2, 3],
        },
      ],
    };
    expect(() => createPopulationWorld(malformedCohorts)).toThrow(/length/);

    const duplicateAccount = {
      ...scenario,
      popBlocks: [
        scenario.popBlocks[0]!,
        { ...scenario.popBlocks[0]!, id: 1 },
      ],
    };
    expect(() => createPopulationWorld(duplicateAccount)).toThrow(/duplicate/i);

    const missingAccount = {
      ...scenario,
      popBlocks: [
        {
          ...scenario.popBlocks[0]!,
          financialAccountId: 99,
        },
      ],
    };
    const missingWorld = createPopulationWorld(missingAccount);
    missingWorld.popBlocks[0]!.financialAccountId = 42;
    expect(() => assertValidWorld(missingWorld)).toThrow(/account|unknown/i);
  });

  test("rejects invalid rates, wealth, remainders, and cohort counts", () => {
    const { world } = aggregateWorld();
    const block = world.popBlocks[0]!;

    block.literacy = 1.5;
    expect(() => assertValidWorld(world)).toThrow(/literacy/);
    block.literacy = 0.5;

    block.wealthLevel = -1;
    expect(() => assertValidWorld(world)).toThrow(/wealthLevel/);
    block.wealthLevel = 30;

    block.fractionalBirthRemainder = 1;
    expect(() => assertValidWorld(world)).toThrow(/fractionalBirthRemainder/);
    block.fractionalBirthRemainder = 0;

    block.agingCarry[0] = 5;
    expect(() => assertValidWorld(world)).toThrow(/agingCarry/);
    block.agingCarry[0] = 0;

    (world.popBlocks[0] as unknown as { ageCohorts: number[] }).ageCohorts = cohorts({ 0: 1 });
    expect(() => assertValidWorld(world)).toThrow(/Uint32Array/);
  });

  test("rejects invalid definitions and fixture inputs", () => {
    const scenario = aggregateScenario();
    expect(() =>
      assertValidPopulationDefinitions({
        ...scenario.definitions,
        needs: scenario.definitions.needs.slice(0, 3),
      }),
    ).toThrow(/four tiers|exactly/i);

    const world = createPopulationWorld(scenario);
    const inputs = makeInputs([0]);
    expect(() =>
      assertValidPopulationInputs(world, scenario.definitions, {
        ...inputs,
        prices: inputs.prices.slice(1),
      }),
    ).toThrow(/price/i);

    const firstIncome = inputs.income[0];
    if (firstIncome === undefined) throw new Error("missing fixture income");
    expect(() =>
      assertValidPopulationInputs(world, scenario.definitions, {
        ...inputs,
        income: [...inputs.income, { ...firstIncome, popBlockId: 99 }],
      }),
    ).toThrow(/unknown popBlock/i);
  });

  test("requires a population context for population worlds", () => {
    const { world } = aggregateWorld();
    expect(() => tick(world)).toThrow(/population context/i);
  });

  test("does not mutate financial accounts during a tick", () => {
    const { scenario, world } = aggregateWorld();
    const before = world.finance.accounts.map((account) => account.balanceSUSD);
    const inputs = makeInputs([0]);
    tick(world, contextFor(scenario, inputs));
    expect(world.finance.accounts.map((account) => account.balanceSUSD)).toEqual(before);
  });
});
