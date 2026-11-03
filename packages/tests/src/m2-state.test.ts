import {
  AGE_COHORT_COUNT,
  SINGLE_AGE_COUNT,
  assertValidPopulationDefinitions,
  assertValidPopulationInputs,
  assertValidWorld,
  createPopulationWorld,
  femaleFiveYearAgeGroups,
  fiveYearAgeGroups,
  initialLiteracyByAge,
  maleFiveYearAgeGroups,
  populationTotal,
  workingAgePopulation,
  worldPopulation,
} from "@century/sim";
import {
  aggregateScenario,
  aggregateWorld,
  contextFor,
  makeInputs,
  multiBlockScenario,
} from "./fixtures/m2.js";
import { tick } from "@century/sim";

describe("M2.1 population state and validation", () => {
  test("creates the aggregate world with single-year sex state and a household account", () => {
    const { world } = aggregateWorld();
    expect(world.provinceEconomies).toHaveLength(1);
    expect(world.popBlocks).toHaveLength(1);
    expect(world.finance.accounts).toHaveLength(4);
    const block = world.popBlocks[0]!;
    expect(block.maleByAge).toBeInstanceOf(Uint32Array);
    expect(block.maleByAge).toHaveLength(SINGLE_AGE_COUNT);
    expect(block.femaleByAge).toBeInstanceOf(Uint32Array);
    expect(block.femaleByAge).toHaveLength(SINGLE_AGE_COUNT);
    expect(fiveYearAgeGroups(block)).toHaveLength(AGE_COHORT_COUNT);
    expect(maleFiveYearAgeGroups(block)).toHaveLength(AGE_COHORT_COUNT);
    expect(femaleFiveYearAgeGroups(block)).toHaveLength(AGE_COHORT_COUNT);
    expect(populationTotal(block)).toBe(1_621_287_278);
    expect(workingAgePopulation(block)).toBeGreaterThan(0);
    expect(worldPopulation(world)).toBe(1_621_287_278);
    expect(world.finance.accounts[0]?.id).toBe(block.financialAccountId);
    expect(() => assertValidWorld(world)).not.toThrow();
  });

  test("derives five-year groups from single-year sex state without duplicate authority", () => {
    const { world } = aggregateWorld();
    const block = world.popBlocks[0]!;
    const male = maleFiveYearAgeGroups(block);
    const female = femaleFiveYearAgeGroups(block);
    const combined = fiveYearAgeGroups(block);
    for (let index = 0; index < AGE_COHORT_COUNT; index += 1) {
      expect(combined[index]).toBe((male[index] ?? 0) + (female[index] ?? 0));
    }
    expect(combined.reduce((total, value) => total + value, 0)).toBe(populationTotal(block));
  });

  test("creates the multi-block fixture with one shared province", () => {
    const scenario = multiBlockScenario();
    const world = createPopulationWorld(scenario);
    expect(world.provinceEconomies).toHaveLength(1);
    expect(world.popBlocks).toHaveLength(3);
    expect(world.provinceEconomies[0]?.popBlockIds).toEqual([0, 1, 2]);
    expect(world.finance.accounts).toHaveLength(12);
    expect(worldPopulation(world)).toBe(1_000_000);
    expect(() => assertValidWorld(world)).not.toThrow();
  });

  test("rejects malformed age arrays and account state", () => {
    const scenario = aggregateScenario();
    const malformedCohorts = {
      ...scenario,
      popBlocks: [
        {
          ...scenario.popBlocks[0]!,
          maleAgeGroups: [1, 2, 3],
        },
      ],
    };
    expect(() => createPopulationWorld(malformedCohorts)).toThrow(/length/);

    const malformedFemale = {
      ...scenario,
      popBlocks: [
        {
          ...scenario.popBlocks[0]!,
          femaleAgeGroups: [1, 2, 3],
        },
      ],
    };
    expect(() => createPopulationWorld(malformedFemale)).toThrow(/length/);

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

  test("rejects invalid rates, wealth, remainders, and sex-age arrays", () => {
    const { world } = aggregateWorld();
    const block = world.popBlocks[0]!;

    block.literacy = 1.5;
    expect(() => assertValidWorld(world)).toThrow(/literacy/);
    // M9: literacy is derived from the authoritative age-specific array, so both
    // the scalar and the array must be consistent.
    block.literacyByAge = initialLiteracyByAge(0.5);
    block.literacy = 0.5;

    block.wealthLevel = -1;
    expect(() => assertValidWorld(world)).toThrow(/wealthLevel/);
    block.wealthLevel = 30;

    block.fractionalBirthRemainder = 1;
    expect(() => assertValidWorld(world)).toThrow(/fractionalBirthRemainder/);
    block.fractionalBirthRemainder = 0;

    block.fractionalMaleBirthRemainder = 1;
    expect(() => assertValidWorld(world)).toThrow(/fractionalMaleBirthRemainder/);
    block.fractionalMaleBirthRemainder = 0;

    (world.popBlocks[0] as unknown as { maleByAge: number[] }).maleByAge = [1, 2, 3];
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

    expect(() =>
      assertValidPopulationDefinitions({
        ...scenario.definitions,
        sexRatioAtBirth: 0,
      }),
    ).toThrow(/sexRatioAtBirth/);

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
    const before = world.finance.accounts.map((account) => account.balanceRUSD);
    const inputs = makeInputs([0]);
    tick(world, contextFor(scenario, inputs));
    expect(world.finance.accounts.map((account) => account.balanceRUSD)).toEqual(before);
  });
});
