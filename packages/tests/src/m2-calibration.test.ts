import {
  civilDateToDayIndex,
  createPopulationWorld,
  daysInYear,
  deserializeWorld,
  femaleFiveYearAgeGroups,
  fiveYearAgeGroups,
  hashWorld,
  maleFiveYearAgeGroups,
  populationTotal,
  serializeWorld,
  tick,
  type PopulationDefinitions,
  type PopulationScenarioDef,
  type World,
} from "@century/sim";
import {
  loadM2PopulationCalibration,
  loadM2WorldAggregate,
  loadM2Wpp1950Validation,
  loadM2WppAgeSexReference,
} from "@century/data";
import {
  contextFor,
  makeInputs,
} from "./fixtures/m2.js";

interface CalibrationSeries {
  status: string;
  confidence: string;
  sourceName: string;
  sourceUrl: string;
  yearConvention: string;
  license: string;
  method: string;
  points: { year: number; value: number }[];
}

function runSampleYears(
  world: World,
  scenario: PopulationScenarioDef,
  years: number,
): Map<number, number> {
  const inputs = makeInputs([0]);
  const context = contextFor(scenario, inputs, false);
  const samples = new Map<number, number>();
  samples.set(1900, populationTotal(world.popBlocks[0]!));
  for (let year = 1900; year < 1900 + years; year += 1) {
    const days = daysInYear(year);
    for (let day = 0; day < days; day += 1) tick(world, context);
    samples.set(year + 1, populationTotal(world.popBlocks[0]!));
  }
  return samples;
}

function withDefinitions(
  scenario: PopulationScenarioDef,
  definitions: PopulationDefinitions,
): PopulationScenarioDef {
  return { ...scenario, definitions };
}

describe("M2.1 source-backed total-population and age-structure calibration", () => {
  test("documents the no-shock campaign baseline separately from historical validation", () => {
    const scenario = loadM2WorldAggregate();
    const series = loadM2PopulationCalibration() as CalibrationSeries;
    expect(series.status).toBe("source-backed");
    expect(series.confidence).toBe("medium");
    expect(series.sourceName).toMatch(/Our World in Data/i);
    expect(series.sourceUrl).toMatch(/ourworldindata\.org/i);
    expect(series.yearConvention).toMatch(/mid-year|January 1/i);
    expect(series.license).toMatch(/CC BY|attribution/i);
    expect(series.method).toMatch(/Published annual|January 1|mid-year/i);

    const world = createPopulationWorld(scenario, { seed: 20_261_023 });
    const samples = runSampleYears(world, scenario, 100);
    const raw = new Map(series.points.map((point) => [point.year, point.value]));
    expect(series.points).toHaveLength(102);
    expect(raw.get(1899)).toBe(1_615_300_901);
    expect(raw.get(1900)).toBe(1_627_273_655);
    expect(raw.get(1950)).toBe(2_493_092_852);
    expect(raw.get(2000)).toBe(6_171_702_992);
    const januaryFirstReference = (year: number): number => {
      const previous = raw.get(year - 1);
      const current = raw.get(year);
      if (previous === undefined || current === undefined) {
        throw new RangeError(`missing source reference around ${String(year)}`);
      }
      return Math.round((previous + current) / 2);
    };

    const anchor1900 = samples.get(1900) ?? 0;
    const anchor1950 = samples.get(1950) ?? 0;
    const anchor2000 = samples.get(2000) ?? 0;
    expect(anchor1900).toBe(1_621_287_278);
    expect(Math.abs(anchor1950 - januaryFirstReference(1950)) / januaryFirstReference(1950))
      .toBeLessThanOrEqual(0.03);
    // The campaign is a no-shock gameplay baseline with a provisional 1900
    // age/sex distribution. Its 2000 total is expected to exceed the historical
    // source because the provisional 1950 age composition is materially younger;
    // this is not accepted as historical demographic validation.
    expect(anchor2000).toBeGreaterThan(januaryFirstReference(2000));

    // Schema 23 added the E5 labor/health fields and block qualification; E6a (schema 24)
    // adds `World.trade` and `Market.customsCountryId`. The digest changes even though
    // the M2 population behavior is unchanged, so it is intentionally re-pinned.
    expect(hashWorld(world)).toBe("7f6345f2d39e99c4");
    const restored = deserializeWorld(serializeWorld(world));
    expect(hashWorld(restored)).toBe("7f6345f2d39e99c4");
    expect(tick(restored).advanced).toBe(false);
  });

  test("campaign 1950 composition differs materially from WPP because pre-1950 inputs are provisional", () => {
    const scenario = loadM2WorldAggregate();
    const reference = loadM2WppAgeSexReference();
    const reference1950 = reference.years["1950"];
    if (reference1950 === undefined) throw new Error("missing WPP 1950 reference");
    const world = createPopulationWorld(scenario, { seed: 20_261_023 });
    const inputs = makeInputs([0]);
    const context = contextFor(scenario, inputs, false);
    for (let year = 1900; year < 1950; year += 1) {
      const days = daysInYear(year);
      for (let day = 0; day < days; day += 1) tick(world, context);
    }
    const block = world.popBlocks[0]!;
    const groups = fiveYearAgeGroups(block);
    const campaignTotal = populationTotal(block);
    const campaignMale = maleFiveYearAgeGroups(block).reduce((total, value) => total + value, 0);
    const campaignFemale = femaleFiveYearAgeGroups(block).reduce((total, value) => total + value, 0);
    const referenceGroups = reference1950.maleAgeGroups.map(
      (value, index) => value + (reference1950.femaleAgeGroups[index] ?? 0),
    );
    const referenceTotal = referenceGroups.reduce((total, value) => total + value, 0);
    const referenceMale = reference1950.maleAgeGroups.reduce((total, value) => total + value, 0);
    const referenceFemale = reference1950.femaleAgeGroups.reduce((total, value) => total + value, 0);

    const campaignYoung = (groups[0]! + groups[1]! + groups[2]!) / campaignTotal;
    const referenceYoung =
      (referenceGroups[0]! + referenceGroups[1]! + referenceGroups[2]!) / referenceTotal;
    const campaignOld = groups.reduce((total, value, index) => (index >= 10 ? total + value : total), 0) / campaignTotal;
    const referenceOld =
      referenceGroups.reduce((total, value, index) => (index >= 10 ? total + value : total), 0) /
      referenceTotal;

    expect(campaignTotal).toBeLessThan(referenceTotal);
    expect(campaignMale).toBeGreaterThan(referenceMale);
    expect(campaignFemale).toBeLessThan(referenceFemale);
    expect(campaignYoung).toBeGreaterThan(referenceYoung + 0.03);
    expect(campaignOld).toBeLessThan(referenceOld - 0.05);
  });

  test("changing birth or death rates changes the trajectory", () => {
    const baselineScenario = loadM2WorldAggregate();
    const baselineWorld = createPopulationWorld(baselineScenario);
    const baselineSamples = runSampleYears(baselineWorld, baselineScenario, 10);
    const baseline1910 = baselineSamples.get(1910) ?? 0;

    const lowerBirthDefinitions: PopulationDefinitions = {
      ...baselineScenario.definitions,
      fertilityAnchors: baselineScenario.definitions.fertilityAnchors.map((anchor) => ({
        ...anchor,
        ageSpecificBirthsPer1000Women: anchor.ageSpecificBirthsPer1000Women.map(
          (rate) => rate * 0.9,
        ),
      })),
    };
    const lowerBirthScenario = withDefinitions(baselineScenario, lowerBirthDefinitions);
    const lowerBirthWorld = createPopulationWorld(lowerBirthScenario);
    const lowerBirth1910 = runSampleYears(lowerBirthWorld, lowerBirthScenario, 10).get(1910) ?? 0;
    expect(lowerBirth1910).toBeLessThan(baseline1910);

    const higherDeathDefinitions: PopulationDefinitions = {
      ...baselineScenario.definitions,
      mortalityAnchors: baselineScenario.definitions.mortalityAnchors.map((anchor) => ({
        ...anchor,
        maleAnnualDeathsPer1000ByAgeBand: anchor.maleAnnualDeathsPer1000ByAgeBand.map(
          (rate) => rate * 1.1,
        ),
        femaleAnnualDeathsPer1000ByAgeBand: anchor.femaleAnnualDeathsPer1000ByAgeBand.map(
          (rate) => rate * 1.1,
        ),
      })),
    };
    const higherDeathScenario = withDefinitions(baselineScenario, higherDeathDefinitions);
    const higherDeathWorld = createPopulationWorld(higherDeathScenario);
    const higherDeath1910 =
      runSampleYears(higherDeathWorld, higherDeathScenario, 10).get(1910) ?? 0;
    expect(higherDeath1910).toBeLessThan(baseline1910);
  });

  test("changing the initial age distribution changes the trajectory", () => {
    const baselineScenario = loadM2WorldAggregate();
    const baselineWorld = createPopulationWorld(baselineScenario);
    const baseline1910 = runSampleYears(baselineWorld, baselineScenario, 10).get(1910) ?? 0;

    const shifted = baselineScenario.popBlocks[0]!;
    const male = Array.from(shifted.maleAgeGroups);
    const female = Array.from(shifted.femaleAgeGroups);
    const shift = Math.floor((male[0] ?? 0) * 0.05);
    male[0] = (male[0] ?? 0) - shift;
    male[4] = (male[4] ?? 0) + shift;
    const femaleShift = Math.floor((female[0] ?? 0) * 0.05);
    female[0] = (female[0] ?? 0) - femaleShift;
    female[4] = (female[4] ?? 0) + femaleShift;
    const shiftedScenario: PopulationScenarioDef = {
      ...baselineScenario,
      popBlocks: [
        { ...shifted, maleAgeGroups: male, femaleAgeGroups: female },
      ],
    };
    const shiftedWorld = createPopulationWorld(shiftedScenario);
    const shifted1910 = runSampleYears(shiftedWorld, shiftedScenario, 10).get(1910) ?? 0;
    expect(shifted1910).not.toBe(baseline1910);
  });

  test("validates WPP 1950 age/sex structure through 1975 and 2000", () => {
    const reference = loadM2WppAgeSexReference();
    expect(reference.source.sourceName).toMatch(/World Population Prospects/i);
    expect(reference.source.yearConvention).toMatch(/1 January/i);
    expect(reference.source.sourceUrl).toMatch(/population\.un\.org\/wpp/i);
    const scenario = loadM2Wpp1950Validation();
    const world = createPopulationWorld(scenario, {
      seed: 20_261_023,
    });
    expect(world.startDayIndex).toBe(civilDateToDayIndex(1950, 1, 1));
    expect(world.dayIndex).toBe(world.startDayIndex);
    const inputs = makeInputs([0]);
    const context = contextFor(scenario, inputs, false);
    const reference1950 = reference.years["1950"];
    if (reference1950 === undefined) throw new Error("missing WPP 1950 reference");

    const initial = fiveYearAgeGroups(world.popBlocks[0]!);
    for (let index = 0; index < 17; index += 1) {
      expect(initial[index]).toBe(
        (reference1950.maleAgeGroups[index] ?? 0) +
          (reference1950.femaleAgeGroups[index] ?? 0),
      );
    }
    expect(populationTotal(world.popBlocks[0]!)).toBe(
      (reference1950.maleAgeGroups.reduce((total, value) => total + value, 0)) +
        (reference1950.femaleAgeGroups.reduce((total, value) => total + value, 0)),
    );

    const samples = new Map<number, { total: number; shares: number[]; maleShare: number }>();
    let births = 0;
    let deaths = 0;
    for (let year = 1950; year < 2000; year += 1) {
      const days = daysInYear(year);
      for (let day = 0; day < days; day += 1) {
        const result = tick(world, context);
        births += result.population?.births ?? 0;
        deaths += result.population?.deaths ?? 0;
      }
      const nextYear = year + 1;
      if (nextYear === 1975 || nextYear === 2000) {
        const block = world.popBlocks[0]!;
        const total = populationTotal(block);
        const groups = fiveYearAgeGroups(block);
        const male = maleFiveYearAgeGroups(block);
        const female = femaleFiveYearAgeGroups(block);
        const maleTotal = male.reduce((sum, value) => sum + value, 0);
        const femaleTotal = female.reduce((sum, value) => sum + value, 0);
        expect(maleTotal + femaleTotal).toBe(total);
        samples.set(nextYear, {
          total,
          shares: Array.from(groups).map((value) => value / total),
          maleShare: maleTotal / total,
        });
      }
    }

    for (const year of [1975, 2000]) {
      const sample = samples.get(year);
      const referenceYear = reference.years[String(year)];
      if (sample === undefined || referenceYear === undefined) {
        throw new Error(`missing age-structure sample/reference for ${String(year)}`);
      }
      const referenceGroups = referenceYear.maleAgeGroups.map(
        (value, index) => value + (referenceYear.femaleAgeGroups[index] ?? 0),
      );
      const referenceTotal = referenceGroups.reduce((total, value) => total + value, 0);
      const referenceShares = referenceGroups.map((value) => value / referenceTotal);
      let maxShareDifference = 0;
      for (let index = 0; index < 17; index += 1) {
        maxShareDifference = Math.max(
          maxShareDifference,
          Math.abs((sample.shares[index] ?? 0) - (referenceShares[index] ?? 0)),
        );
      }
      const referenceMaleShare =
        referenceYear.maleAgeGroups.reduce((total, value) => total + value, 0) /
        referenceTotal;
      expect(Math.abs(sample.total / referenceTotal - 1)).toBeLessThanOrEqual(0.03);
      expect(maxShareDifference).toBeLessThanOrEqual(0.02);
      expect(Math.abs(sample.maleShare - referenceMaleShare)).toBeLessThanOrEqual(0.02);
      expect(
        Math.abs(
          referenceYear.tfrFromAsfr -
            (referenceYear.asfrPer1000Women.reduce((total, value) => total + value, 0) * 5) /
              1000,
        ),
      ).toBeLessThan(0.0001);
    }

    // WPP 2024 annual totals for 1950-1999, used only as a flow consistency
    // check. The annual schedules should not reproduce the three-anchor
    // interpolation shortfall.
    expect(Math.abs(births / 6_089_003_488 - 1)).toBeLessThanOrEqual(0.02);
    expect(Math.abs(deaths / 2_430_494_039 - 1)).toBeLessThanOrEqual(0.03);
    // Updated for the E5 schema-23 labor/health/qualification fields and the E6a
    // schema-24 trade/customs fields; population flows are unchanged and remain
    // validated by the ratio checks above.
    expect(hashWorld(world)).toBe("f102bc90a8c3bd2a");
  });
});
