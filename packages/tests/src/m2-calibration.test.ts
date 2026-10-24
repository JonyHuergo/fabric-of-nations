import {
  createPopulationWorld,
  daysInYear,
  deserializeWorld,
  hashWorld,
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

describe("M2 source-backed total-population calibration (partial demographics)", () => {
  test("reproduces the OWID annual curve within 5% and source anchors within 3%", () => {
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

    let maxError = 0;
    let sumSquaredError = 0;
    let sampleCount = 0;
    for (const [year, value] of samples) {
      const target = januaryFirstReference(year);
      const error = Math.abs(value - target) / target;
      if (error > maxError) maxError = error;
      sumSquaredError += error * error;
      sampleCount += 1;
    }
    const rmse = Math.sqrt(sumSquaredError / sampleCount);
    expect(maxError).toBeLessThanOrEqual(0.05);
    expect(rmse).toBeLessThanOrEqual(0.03);

    const anchor1900 = samples.get(1900) ?? 0;
    const anchor1950 = samples.get(1950) ?? 0;
    const anchor2000 = samples.get(2000) ?? 0;
    expect(anchor1900).toBe(1_621_287_278);
    expect(Math.abs(anchor1950 - januaryFirstReference(1950)) / januaryFirstReference(1950))
      .toBeLessThanOrEqual(0.03);
    expect(Math.abs(anchor2000 - januaryFirstReference(2000)) / januaryFirstReference(2000))
      .toBeLessThanOrEqual(0.03);

    // The total-population series is source-backed, but age structure and
    // age-specific schedules are still provisional, so demographic calibration
    // remains partial rather than fully historical.
    expect(series.status).toBe("source-backed");
    expect(series.confidence).toBe("medium");

    // Fixed 1900-2000 regression digest for the aggregate fixture. This is the
    // full-century run required by M2, and it is independent of wall-clock time.
    expect(hashWorld(world)).toBe("a1b9cb7d0727daa3");
    const restored = deserializeWorld(serializeWorld(world));
    expect(hashWorld(restored)).toBe("a1b9cb7d0727daa3");
    expect(tick(restored).advanced).toBe(false);
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
        annualBirthsPer1000: anchor.annualBirthsPer1000 * 0.9,
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
        annualDeathsPer1000ByAgeBand: anchor.annualDeathsPer1000ByAgeBand.map(
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
    const cohorts = Array.from(shifted.ageCohorts);
    const shift = Math.floor((cohorts[0] ?? 0) * 0.05);
    cohorts[0] = (cohorts[0] ?? 0) - shift;
    cohorts[4] = (cohorts[4] ?? 0) + shift;
    const shiftedScenario: PopulationScenarioDef = {
      ...baselineScenario,
      popBlocks: [{ ...shifted, ageCohorts: cohorts }],
    };
    const shiftedWorld = createPopulationWorld(shiftedScenario);
    const shifted1910 = runSampleYears(shiftedWorld, shiftedScenario, 10).get(1910) ?? 0;
    expect(shifted1910).not.toBe(baseline1910);
  });
});
