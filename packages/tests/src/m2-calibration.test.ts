import {
  NEUTRAL_DEMOGRAPHY_FACTORS,
  effectiveAdultMortality,
  effectiveChildMortality,
  fertilityLevel,
  applyAnnualAgeing,
  applyDailyDemography,
  civilDateToDayIndex,
  dayIndexToCivilDate,
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
import { prePhase5Digest } from "./fixtures/p5Encoding.js";
import {
  loadWppWorldSchedules,
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
    // P4 (D-124, D-142): the population-only aggregate starts from the sourced 1900
    // world levels and has no country, school or market to move them, so it keeps
    // growing at its 1900 rate. Until P4 its pre-1950 mortality was scaled by 1.45 to
    // land on the 1950 source total; D-124 forbids forcing a trajectory, so the
    // historical series is a validation target of the full simulation (P4 WPP
    // comparison report), not of this fixture. The fixture only documents that
    // the gap exists and grows.
    expect(anchor1950).toBeGreaterThan(januaryFirstReference(1950));
    expect(anchor2000).toBeGreaterThan(anchor1950);

    // Schema 23 added the E5 labor/health fields and block qualification; E6a (schema 24)
    // adds `World.trade` and `Market.customsCountryId`. The digest changes even though
    // M11 (simulation 0.27.0, data m3-economy-v12) changes the version metadata encoded in the world. The M2 population behavior is unchanged, so it is intentionally re-pinned.
    // P2 schema 28 (D-134) encodes the province economy record instead of the region;
    // the population trajectory is unchanged, so the digest is re-pinned.
    // P2b schema 29 (D-135) adds wage tables, technique and money coefficients to the
    // encoding; the population trajectory is unchanged, so the digest is re-pinned.
    // P3 schema 30 (D-141): the schema number in the encoding only; re-pinned.
    // P4 schema 31 (D-142): cause-driven levels change the trajectory (no 1.45
    // mortality scaling, sourced 1900 world levels) and the encoding gains the
    // block demography and the annual record; re-pinned.
    // P5 schema 32 (D-143): encoding only — the schema number and the empty
    // `World.resources`; removing them reproduces the P4 digest.
    expect(prePhase5Digest(world)).toBe("b742748f9ff34905");
    expect(hashWorld(world)).toBe("25dd311842cb4d96");
    const restored = deserializeWorld(serializeWorld(world));
    expect(hashWorld(restored)).toBe(hashWorld(world));
    expect(tick(restored).advanced).toBe(false);
  });

  test("P4: with unchanged causes the levels do not drift (No-Mana, D-142)", () => {
    const scenario = loadM2WorldAggregate();
    const world = createPopulationWorld(scenario, { seed: 20_261_023 });
    const inputs = makeInputs([0]);
    const context = contextFor(scenario, inputs, false);
    const block = world.popBlocks[0]!;
    const neutral = NEUTRAL_DEMOGRAPHY_FACTORS;
    const start = {
      fertility: fertilityLevel(block, neutral),
      child: effectiveChildMortality(block, neutral),
      adult: effectiveAdultMortality(block, neutral),
      lagged: block.childMortalityLagged,
    };
    for (let year = 1900; year < 1920; year += 1) {
      const days = daysInYear(year);
      for (let day = 0; day < days; day += 1) tick(world, context);
    }
    // Literacy, urban share and the country factors are constant here; food is fully
    // supplied by the fixture, so no level may move by more than the drift of the
    // monthly smoothed wealth and lagged child mortality allows.
    expect(block.foodSufficiency).toBeGreaterThan(0.999);
    expect(effectiveChildMortality(block, neutral) / start.child).toBeCloseTo(1, 3);
    expect(effectiveAdultMortality(block, neutral) / start.adult).toBeCloseTo(1, 3);
    expect(block.childMortalityLagged).toBeCloseTo(start.lagged, 3);
    expect(Math.abs(fertilityLevel(block, neutral) / start.fertility - 1)).toBeLessThan(0.05);
  });

  test("changing birth or death rates changes the trajectory", () => {
    const baselineScenario = loadM2WorldAggregate();
    const baselineWorld = createPopulationWorld(baselineScenario);
    const baselineSamples = runSampleYears(baselineWorld, baselineScenario, 10);
    const baseline1910 = baselineSamples.get(1910) ?? 0;

    // P4: scaling the standard schedule scales every level-1 block's rates.
    const standard = baselineScenario.definitions.standardSchedule;
    const lowerBirthDefinitions: PopulationDefinitions = {
      ...baselineScenario.definitions,
      standardSchedule: {
        ...standard,
        ageSpecificBirthsPer1000Women: standard.ageSpecificBirthsPer1000Women.map((rate) => rate * 0.9),
      },
    };
    const lowerBirthScenario = withDefinitions(baselineScenario, lowerBirthDefinitions);
    const lowerBirthWorld = createPopulationWorld(lowerBirthScenario);
    const lowerBirth1910 = runSampleYears(lowerBirthWorld, lowerBirthScenario, 10).get(1910) ?? 0;
    expect(lowerBirth1910).toBeLessThan(baseline1910);

    const higherDeathDefinitions: PopulationDefinitions = {
      ...baselineScenario.definitions,
      standardSchedule: {
        ...standard,
        maleAnnualDeathsPer1000ByAgeBand: standard.maleAnnualDeathsPer1000ByAgeBand.map((rate) => rate * 1.1),
        femaleAnnualDeathsPer1000ByAgeBand: standard.femaleAnnualDeathsPer1000ByAgeBand.map((rate) => rate * 1.1),
      },
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

    // P4 (D-124, D-142): WPP rates are never simulation inputs. This engine check
    // feeds WPP's own annual schedules to the births, deaths and ageing machinery
    // (levels held at 1) and requires it to reproduce WPP's 1975 and 2000 structure.
    void context;
    const schedules = loadWppWorldSchedules();
    const samples = new Map<number, { total: number; shares: number[]; maleShare: number }>();
    let births = 0;
    let deaths = 0;
    for (let year = 1950; year < 2000; year += 1) {
      const days = daysInYear(year);
      const wpp = schedules[String(year)];
      if (wpp === undefined) throw new Error(`missing WPP schedule ${String(year)}`);
      const definitions: PopulationDefinitions = {
        ...scenario.definitions,
        standardSchedule: { sourceYear: year, ...wpp },
      };
      for (let day = 0; day < days; day += 1) {
        // Hold the derived fertility level at 1 (ageing changes the literacy of the
        // 15–49 cohorts, a cause this engine check must not see).
        const engineBlock = world.popBlocks[0]!;
        engineBlock.fertilityResidual /= fertilityLevel(engineBlock, NEUTRAL_DEMOGRAPHY_FACTORS);
        const dayIndex = world.dayIndex;
        const date = dayIndexToCivilDate(dayIndex);
        if (date.month === 1 && date.day === 1 && dayIndex !== world.startDayIndex) applyAnnualAgeing(world);
        const result = applyDailyDemography(world, definitions, dayIndex);
        births += result.totalBirths;
        deaths += result.totalDeaths;
        world.dayIndex += 1;
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
    // Re-pinned for the P2 schema-28 province record (D-134); flows unchanged.
    // P2b schema 29 (D-135): encoding only; population flows are unchanged.
    // P3 schema 30 (D-141): encoding only (schema number); re-pinned.
    // P4 schema 31 (D-142): the engine is driven directly with WPP rates (levels 1);
    // the encoding gains the block demography and the annual record; re-pinned.
    // P5 schema 32 (D-143): encoding only; removing it reproduces the P4 digest.
    expect(prePhase5Digest(world)).toBe("4df8d9869983ce04");
    expect(hashWorld(world)).toBe("03cbedcb11ce7e19");
  });
});

