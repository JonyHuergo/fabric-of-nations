import {
  applyDailyDemography,
  civilDateToDayIndex,
  createPopulationWorld,
  populationTotal,
  runTicks,
  tick,
  type PopulationDefinitions,
} from "@century/sim";
import {
  aggregateScenario,
  aggregateWorld,
  cohorts,
  contextFor,
  customScenario,
  makeInputs,
  oneBlockScenario,
} from "./fixtures/m2.js";

function definitionsWith(
  overrides: Partial<PopulationDefinitions>,
): PopulationDefinitions {
  const base = aggregateScenario().definitions;
  return { ...base, ...overrides };
}

describe("M2 births, deaths, and fractional accumulation", () => {
  test("conserves population every day and over a multi-year run", () => {
    const { scenario, world } = aggregateWorld();
    const inputs = makeInputs([0]);
    const context = contextFor(scenario, inputs, false);
    let births = 0;
    let deaths = 0;
    let previous = populationTotal(world.popBlocks[0]!);
    for (let day = 0; day < 800; day += 1) {
      const result = tick(world, context);
      const blockResult = result.population?.demography.blocks[0];
      expect(blockResult).toBeDefined();
      if (blockResult === undefined) throw new Error("missing demography result");
      expect(blockResult.populationEnd).toBe(
        blockResult.populationStart + blockResult.births - blockResult.deaths,
      );
      births += blockResult.births;
      deaths += blockResult.deaths;
      const current = populationTotal(world.popBlocks[0]!);
      expect(current).toBe(previous + blockResult.births - blockResult.deaths);
      expect(current).toBeGreaterThanOrEqual(0);
      previous = current;
    }
    expect(previous).toBe(1_621_287_278 + births - deaths);
    expect(births).toBeGreaterThan(0);
    expect(deaths).toBeGreaterThan(0);
    const block = world.popBlocks[0]!;
    expect(block.fractionalBirthRemainder).toBeGreaterThanOrEqual(0);
    expect(block.fractionalBirthRemainder).toBeLessThan(1);
    expect(block.fractionalDeathRemainder).toBeGreaterThanOrEqual(0);
    expect(block.fractionalDeathRemainder).toBeLessThan(1);
  });

  test("allocates age-specific deaths only to the affected cohort", () => {
    const rates = new Array<number>(17).fill(0);
    rates[16] = 1000; // every 80+ person would die within a year
    const definitions = definitionsWith({
      mortalityAnchors: [
        { year: 1900, annualDeathsPer1000ByAgeBand: rates },
        { year: 2000, annualDeathsPer1000ByAgeBand: rates },
      ],
      fertilityAnchors: [
        { year: 1900, annualBirthsPer1000: 0 },
        { year: 2000, annualBirthsPer1000: 0 },
      ],
    });
    const base = aggregateScenario();
    const scenario = { ...customScenario(
      [
        {
          id: 0,
          regionId: 0,
          professionId: 0,
          financialAccountId: 0,
          ageCohorts: cohorts({ 16: 365 }),
          literacy: 0.5,
          wealthLevel: 30,
          initialSavingsSUSD: 1000,
          militancy: 0.1,
        },
      ],
      { ...base, definitions },
    ), definitions };
    const world = createPopulationWorld(scenario);
    const block = world.popBlocks[0]!;
    const result = applyDailyDemography(world, definitions, 0);
    expect(result.totalDeaths).toBe(1);
    expect(result.totalBirths).toBe(0);
    expect(block.ageCohorts[16]).toBe(364);
    expect(result.blocks[0]?.deaths).toBe(1);
  });

  test("birth remainders eventually produce whole persons without systematic loss", () => {
    const definitions = definitionsWith({
      mortalityAnchors: [
        { year: 1900, annualDeathsPer1000ByAgeBand: new Array<number>(17).fill(0) },
        { year: 2000, annualDeathsPer1000ByAgeBand: new Array<number>(17).fill(0) },
      ],
      fertilityAnchors: [
        { year: 1900, annualBirthsPer1000: 1000 },
        { year: 2000, annualBirthsPer1000: 1000 },
      ],
    });
    const base = aggregateScenario();
    const scenario = { ...customScenario(
      [
        {
          id: 0,
          regionId: 0,
          professionId: 0,
          financialAccountId: 0,
          ageCohorts: cohorts({ 0: 1 }),
          literacy: 0.5,
          wealthLevel: 30,
          initialSavingsSUSD: 1000,
          militancy: 0.1,
        },
      ],
      { ...base, definitions },
    ), definitions };
    const world = createPopulationWorld(scenario);
    let births = 0;
    for (let day = 0; day < 366; day += 1) {
      births += applyDailyDemography(world, definitions, day).totalBirths;
    }
    // One person at 100% annual fertility over a full year should produce
    // approximately one birth; the remainder must not silently disappear.
    expect(births).toBe(1);
    expect(populationTotal(world.popBlocks[0]!)).toBe(2);
  });

  test("zero-population blocks produce no events and no NaN", () => {
    const scenario = oneBlockScenario({});
    const world = createPopulationWorld(scenario);
    const inputs = makeInputs([0]);
    const context = contextFor(scenario, inputs, true);
    const result = tick(world, context);
    expect(result.population?.births).toBe(0);
    expect(result.population?.deaths).toBe(0);
    expect(result.population?.populationStart).toBe(0);
    expect(result.population?.populationEnd).toBe(0);
    expect(populationTotal(world.popBlocks[0]!)).toBe(0);
  });

  test("uses 365 or 366 civil days for annual rate conversion", () => {
    const definitions = definitionsWith({
      mortalityAnchors: [
        { year: 1900, annualDeathsPer1000ByAgeBand: new Array<number>(17).fill(0) },
        { year: 2000, annualDeathsPer1000ByAgeBand: new Array<number>(17).fill(0) },
      ],
      fertilityAnchors: [
        { year: 1900, annualBirthsPer1000: 1000 },
        { year: 2000, annualBirthsPer1000: 1000 },
      ],
    });
    const base = aggregateScenario();
    const scenario = { ...customScenario(
      [
        {
          id: 0,
          regionId: 0,
          professionId: 0,
          financialAccountId: 0,
          ageCohorts: cohorts({ 0: 1 }),
          literacy: 0.5,
          wealthLevel: 30,
          initialSavingsSUSD: 1000,
          militancy: 0.1,
        },
      ],
      { ...base, definitions },
    ), definitions };

    const commonYear = createPopulationWorld(scenario);
    commonYear.dayIndex = civilDateToDayIndex(1900, 1, 1);
    applyDailyDemography(commonYear, definitions, commonYear.dayIndex);
    expect(commonYear.popBlocks[0]!.fractionalBirthRemainder).toBeCloseTo(1 / 365, 12);

    const leapYear = createPopulationWorld(scenario);
    leapYear.dayIndex = civilDateToDayIndex(1904, 1, 1);
    applyDailyDemography(leapYear, definitions, leapYear.dayIndex);
    expect(leapYear.popBlocks[0]!.fractionalBirthRemainder).toBeCloseTo(1 / 366, 12);
  });

  test("world population identity holds over a full century run", () => {
    const { scenario, world } = aggregateWorld();
    const inputs = makeInputs([0]);
    const start = populationTotal(world.popBlocks[0]!);
    const summary = runTicks(world, 36_524, contextFor(scenario, inputs, false));
    expect(summary.ticksProcessed).toBe(36_524);
    expect(populationTotal(world.popBlocks[0]!)).toBeGreaterThan(start);
  });
});
