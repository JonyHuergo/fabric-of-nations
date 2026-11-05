import {
  applyDailyDemography,
  civilDateToDayIndex,
  createPopulationWorld,
  populationTotal,
  tick,
  type PopulationDefinitions,
  type StandardDemographicSchedule,
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

function zeros(length: number): number[] {
  return new Array<number>(length).fill(0);
}

/** P4: the standard schedule a fixture runs at level 1. */
function schedule(male: number[], female: number[], asfr: number[]): StandardDemographicSchedule {
  return {
    sourceYear: 1950,
    maleAnnualDeathsPer1000ByAgeBand: male,
    femaleAnnualDeathsPer1000ByAgeBand: female,
    ageSpecificBirthsPer1000Women: asfr,
  };
}

function definitionsWith(overrides: Partial<PopulationDefinitions>): PopulationDefinitions {
  const base = aggregateScenario().definitions;
  return { ...base, ...overrides };
}

function scenarioWithGroups(
  maleGroups: number[],
  femaleGroups: number[],
  definitions: PopulationDefinitions,
) {
  const base = aggregateScenario();
  return {
    ...customScenario(
      [
        {
          id: 0,
          provinceId: 0,
          professionId: 0,
          financialAccountId: 0,
          maleAgeGroups: maleGroups,
          femaleAgeGroups: femaleGroups,
          literacy: 0.5,
          wealthLevel: 30,
          initialSavingsRUSD: 1000,
          militancy: 0.1,
        },
      ],
      { ...base, definitions },
    ),
    definitions,
  };
}

function groupsWith(index: number, value: number): number[] {
  return cohorts({ [index]: value });
}

describe("M2.1 age-specific births, deaths, and fractional accumulation", () => {
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
      expect(blockResult.maleBirths + blockResult.femaleBirths).toBe(blockResult.births);
      births += blockResult.births;
      deaths += blockResult.deaths;
      const current = populationTotal(world.popBlocks[0]!);
      expect(current).toBe(previous + blockResult.births - blockResult.deaths);
      previous = current;
    }
    expect(previous).toBe(1_621_287_278 + births - deaths);
    expect(births).toBeGreaterThan(0);
    expect(deaths).toBeGreaterThan(0);
    const block = world.popBlocks[0]!;
    expect(block.fractionalBirthRemainder).toBeGreaterThanOrEqual(0);
    expect(block.fractionalBirthRemainder).toBeLessThan(1);
    expect(block.fractionalMaleBirthRemainder).toBeGreaterThanOrEqual(0);
    expect(block.fractionalMaleBirthRemainder).toBeLessThan(1);
    expect(block.fractionalDeathRemainder).toBeGreaterThanOrEqual(0);
    expect(block.fractionalDeathRemainder).toBeLessThan(1);
  });

  test("applies age-specific mortality to the affected age and sex", () => {
    const male = new Array<number>(17).fill(0);
    const female = new Array<number>(17).fill(0);
    male[16] = 1000;
    female[16] = 0;
    const definitions = definitionsWith({
      standardSchedule: schedule(male, female, new Array<number>(7).fill(0)),
    });
    const scenario = scenarioWithGroups(
      groupsWith(16, 365),
      groupsWith(16, 365),
      definitions,
    );
    const world = createPopulationWorld(scenario);
    const block = world.popBlocks[0]!;
    const result = applyDailyDemography(world, definitions, 0);
    expect(result.totalDeaths).toBe(1);
    expect(result.totalBirths).toBe(0);
    expect(block.maleByAge[80]).toBe(364);
    expect(block.femaleByAge[80]).toBe(365);
    expect(result.blocks[0]?.deaths).toBe(1);
  });

  test("P4: a food shortfall raises next-day mortality (D-142)", () => {
    const male = new Array<number>(17).fill(0);
    const female = new Array<number>(17).fill(0);
    male[16] = 100;
    female[16] = 100;
    const definitions = definitionsWith({
      standardSchedule: schedule(male, female, new Array<number>(7).fill(0)),
    });
    const build = () => {
      const world = createPopulationWorld(
        scenarioWithGroups(groupsWith(16, 3650), new Array<number>(17).fill(0), definitions),
      );
      // Level 1: the fixture checks the food factor alone.
      world.popBlocks[0]!.adultMortalityResidual = 1;
      return world;
    };
    const run = (world: ReturnType<typeof build>): number => {
      let deaths = 0;
      for (let day = 0; day < 10; day += 1) deaths += applyDailyDemography(world, definitions, day).totalDeaths;
      return deaths;
    };
    const calm = build();
    // The unmet-days counters keep driving militancy, wealth and AI; mortality
    // responds to the calories actually eaten.
    const countersOnly = build();
    countersOnly.popBlocks[0]!.unmetSubsistenceDays = 90;
    countersOnly.popBlocks[0]!.unmetBasicDays = 90;
    const hungry = build();
    hungry.popBlocks[0]!.foodSufficiency = 0.5;
    // Ten days at one expected death a day (the remainder carries the fraction).
    const calmDeaths = run(calm);
    expect(calmDeaths).toBeGreaterThanOrEqual(9);
    expect(calmDeaths).toBeLessThanOrEqual(10);
    expect(run(countersOnly)).toBe(calmDeaths);
    // Adult factor 1 + 1.5 × 0.5 = 1.75: 17.5 expected deaths over ten days.
    const hungryDeaths = run(hungry);
    expect(hungryDeaths).toBeGreaterThanOrEqual(17);
    expect(hungryDeaths).toBeLessThanOrEqual(18);
  });

  test("different female age structures produce different births at equal total population", () => {
    const asfr = new Array<number>(7).fill(0);
    asfr[0] = 1000;
    const definitions = definitionsWith({
      standardSchedule: schedule(zeros(17), zeros(17), asfr),
    });
    const young = createPopulationWorld(
      scenarioWithGroups(
        groupsWith(0, 5),
        groupsWith(3, 5),
        definitions,
      ),
    );
    const old = createPopulationWorld(
      scenarioWithGroups(
        groupsWith(0, 5),
        groupsWith(9, 5),
        definitions,
      ),
    );
    let youngBirths = 0;
    let oldBirths = 0;
    for (let day = 0; day < 365; day += 1) {
      youngBirths += applyDailyDemography(young, definitions, day).totalBirths;
      oldBirths += applyDailyDemography(old, definitions, day).totalBirths;
    }
    expect(youngBirths).toBeGreaterThan(0);
    expect(oldBirths).toBe(0);
    expect(youngBirths).not.toBe(oldBirths);
  });

  test("moves females between reproductive and non-reproductive ages in the expected direction", () => {
    const asfr = new Array<number>(7).fill(0);
    asfr[0] = 500;
    const definitions = definitionsWith({
      standardSchedule: schedule(zeros(17), zeros(17), asfr),
    });
    const reproductive = createPopulationWorld(
      scenarioWithGroups(groupsWith(0, 5), groupsWith(3, 5), definitions),
    );
    const nonReproductive = createPopulationWorld(
      scenarioWithGroups(groupsWith(0, 5), groupsWith(9, 5), definitions),
    );
    let reproductiveBirths = 0;
    let nonReproductiveBirths = 0;
    for (let day = 0; day < 365; day += 1) {
      reproductiveBirths += applyDailyDemography(reproductive, definitions, day).totalBirths;
      nonReproductiveBirths += applyDailyDemography(nonReproductive, definitions, day).totalBirths;
    }
    expect(reproductiveBirths).toBeGreaterThan(nonReproductiveBirths);
  });

  test("increasing the fertility schedule increases births predictably", () => {
    const lowRates = new Array<number>(7).fill(0);
    lowRates[1] = 500;
    const highRates = new Array<number>(7).fill(0);
    highRates[1] = 1000;
    const low = definitionsWith({
      standardSchedule: schedule(zeros(17), zeros(17), lowRates),
    });
    const high = definitionsWith({
      standardSchedule: schedule(zeros(17), zeros(17), highRates),
    });
    const lowWorld = createPopulationWorld(
      scenarioWithGroups(groupsWith(0, 5), groupsWith(4, 10), low),
    );
    const highWorld = createPopulationWorld(
      scenarioWithGroups(groupsWith(0, 5), groupsWith(4, 10), high),
    );
    let lowBirths = 0;
    let highBirths = 0;
    for (let day = 0; day < 365; day += 1) {
      lowBirths += applyDailyDemography(lowWorld, low, day).totalBirths;
      highBirths += applyDailyDemography(highWorld, high, day).totalBirths;
    }
    expect(lowBirths).toBe(5);
    expect(highBirths).toBe(10);
  });

  test("fractional birth remainders avoid systematic loss and split sexes exactly", () => {
    const asfr = new Array<number>(7).fill(0);
    asfr[0] = 1000;
    const definitions = definitionsWith({
      standardSchedule: schedule(zeros(17), zeros(17), asfr),
    });
    const scenario = scenarioWithGroups(
      new Array<number>(17).fill(0),
      groupsWith(3, 5),
      definitions,
    );
    const world = createPopulationWorld(scenario);
    let births = 0;
    let maleBirths = 0;
    let femaleBirths = 0;
    for (let day = 0; day < 365; day += 1) {
      const result = applyDailyDemography(world, definitions, day);
      births += result.totalBirths;
      maleBirths += result.totalMaleBirths;
      femaleBirths += result.totalFemaleBirths;
    }
    expect(births).toBe(5);
    expect(maleBirths + femaleBirths).toBe(births);
    expect(world.popBlocks[0]!.maleByAge[0]! + world.popBlocks[0]!.femaleByAge[0]!).toBe(5);
  });

  test("uses 365 or 366 civil days for annual fertility conversion", () => {
    const asfr = new Array<number>(7).fill(0);
    asfr[0] = 1000;
    const definitions = definitionsWith({
      standardSchedule: schedule(zeros(17), zeros(17), asfr),
    });
    const scenario = scenarioWithGroups(
      new Array<number>(17).fill(0),
      groupsWith(3, 1),
      definitions,
    );

    const commonYear = createPopulationWorld(scenario);
    commonYear.dayIndex = civilDateToDayIndex(1900, 1, 1);
    applyDailyDemography(commonYear, definitions, commonYear.dayIndex);
    expect(commonYear.popBlocks[0]!.fractionalBirthRemainder).toBeCloseTo(1 / 365, 12);

    const leapYear = createPopulationWorld(scenario);
    leapYear.dayIndex = civilDateToDayIndex(1904, 1, 1);
    applyDailyDemography(leapYear, definitions, leapYear.dayIndex);
    expect(leapYear.popBlocks[0]!.fractionalBirthRemainder).toBeCloseTo(1 / 366, 12);
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

  test("world population identity holds over a full century run", () => {
    const { scenario, world } = aggregateWorld();
    const inputs = makeInputs([0]);
    const start = populationTotal(world.popBlocks[0]!);
    let births = 0;
    let deaths = 0;
    for (let day = 0; day < 36_524; day += 1) {
      const result = tick(world, contextFor(scenario, inputs, false));
      if (result.population === undefined) throw new Error("expected a population result");
      births += result.population.births;
      deaths += result.population.deaths;
    }
    expect(world.dayIndex).toBe(36_524);
    expect(births).toBeGreaterThan(0);
    expect(deaths).toBeGreaterThan(0);
    // The century total equals the opening population plus every birth minus
    // every death; a positive end total alone would not prove conservation.
    expect(populationTotal(world.popBlocks[0]!)).toBe(start + births - deaths);
  });
});
