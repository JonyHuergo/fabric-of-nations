import {
  applyDailyDemography,
  createPopulationWorld,
  daysInYear,
  mortalityRatePer1000,
  type PopulationDefinitions,
} from "@century/sim";
import { aggregateScenario } from "./fixtures/m2.js";

const SINGLE_AGE_COUNT = 81;
const BAND_COUNT = 17;
const BAND_WIDTH = 5;
const TERMINAL_BAND = BAND_COUNT - 1;

function full(value: number): number[] {
  return new Array<number>(SINGLE_AGE_COUNT).fill(value);
}

function vary(base: number, modulus: number): number[] {
  return Array.from({ length: SINGLE_AGE_COUNT }, (_, age) => base + (age % modulus));
}

interface DeathCase {
  readonly name: string;
  readonly male: readonly number[];
  readonly female: readonly number[];
  readonly annualRatePer1000: number;
  readonly initialRemainder: number;
}

interface ReferenceResult {
  readonly male: number[];
  readonly female: number[];
  readonly deaths: number;
  readonly remainder: number;
}

function bandForAge(age: number): number {
  return Math.min(Math.floor(age / BAND_WIDTH), TERMINAL_BAND);
}

/**
 * Reference implementation of the original allocation algorithm: recompute the
 * 162-cell total, rank band remainders by repeated full scan, and place deaths
 * within each band. Deliberately independent of the optimized implementation.
 */
function referenceAllocate(
  deaths: number,
  expected: Float64Array,
  maleCounts: Uint32Array,
  femaleCounts: Uint32Array,
): { male: number[]; female: number[] } {
  let totalExpected = 0;
  for (const value of expected) totalExpected += value;
  if (deaths === 0 || totalExpected <= 0) {
    return { male: Array.from(maleCounts), female: Array.from(femaleCounts) };
  }

  const bandExpected = new Float64Array(34);
  const bandCounts = new Uint32Array(34);
  const bandAllocation = new Uint32Array(34);
  const bandRemainders = new Float64Array(34);
  for (let age = 0; age < SINGLE_AGE_COUNT; age += 1) {
    const band = bandForAge(age);
    bandExpected[band * 2] = (bandExpected[band * 2] ?? 0) + (expected[age] ?? 0);
    bandExpected[band * 2 + 1] =
      (bandExpected[band * 2 + 1] ?? 0) + (expected[SINGLE_AGE_COUNT + age] ?? 0);
    bandCounts[band * 2] = (bandCounts[band * 2] ?? 0) + (maleCounts[age] ?? 0);
    bandCounts[band * 2 + 1] =
      (bandCounts[band * 2 + 1] ?? 0) + (femaleCounts[age] ?? 0);
  }

  let allocated = 0;
  for (let band = 0; band < 34; band += 1) {
    const exact = (deaths * (bandExpected[band] ?? 0)) / totalExpected;
    const whole = Math.floor(exact);
    bandAllocation[band] = whole;
    allocated += whole;
    bandRemainders[band] = exact - whole;
  }
  let leftover = deaths - allocated;
  while (leftover > 0) {
    let selected = -1;
    let best = -1;
    for (let band = 0; band < 34; band += 1) {
      const remainder = bandRemainders[band] ?? -1;
      if (remainder < 0) continue;
      const capacity = bandCounts[band] ?? 0;
      if ((bandAllocation[band] ?? 0) < capacity && remainder > best) {
        best = remainder;
        selected = band;
      }
    }
    if (selected < 0) throw new Error("reference allocation ran out of capacity");
    bandAllocation[selected] = (bandAllocation[selected] ?? 0) + 1;
    bandRemainders[selected] = -1;
    leftover -= 1;
  }

  for (let band = 0; band < 34; band += 1) {
    const allocation = bandAllocation[band] ?? 0;
    if (allocation === 0) continue;
    const sex = band % 2;
    const bandIndex = Math.floor(band / 2);
    const counts = sex === 0 ? maleCounts : femaleCounts;
    const startAge = bandIndex * BAND_WIDTH;
    const endAge = Math.min(startAge + BAND_WIDTH, SINGLE_AGE_COUNT);
    let cumulative = 0;
    let placed = 0;
    for (let age = startAge; age < endAge; age += 1) {
      const expectedCell = expected[sex === 0 ? age : SINGLE_AGE_COUNT + age] ?? 0;
      cumulative += expectedCell;
      const target = Math.floor(
        (allocation * cumulative) / Math.max(bandExpected[band] ?? 0, Number.EPSILON) + 1e-12,
      );
      let amount = target - placed;
      if (amount < 0) amount = 0;
      const count = counts[age] ?? 0;
      if (amount > count) amount = count;
      if (amount > 0) {
        counts[age] = count - amount;
        placed += amount;
      }
    }
    let bandLeftover = allocation - placed;
    for (let age = startAge; age < endAge && bandLeftover > 0; age += 1) {
      const count = counts[age] ?? 0;
      if (count > 0) {
        counts[age] = count - 1;
        bandLeftover -= 1;
        placed += 1;
      }
    }
    if (bandLeftover !== 0) throw new Error("reference placement failed");
  }

  return { male: Array.from(maleCounts), female: Array.from(femaleCounts) };
}

function referenceCase(item: DeathCase): ReferenceResult {
  const days = daysInYear(1900);
  const effectiveRate = Math.min(1, item.annualRatePer1000 / 1000);
  const expected = new Float64Array(SINGLE_AGE_COUNT * 2);
  for (let age = 0; age < SINGLE_AGE_COUNT; age += 1) {
    expected[age] = ((item.male[age] ?? 0) * effectiveRate) / days;
    expected[SINGLE_AGE_COUNT + age] = ((item.female[age] ?? 0) * effectiveRate) / days;
  }
  let totalExpected = 0;
  for (const value of expected) totalExpected += value;
  let deaths = 0;
  let remainder = item.initialRemainder;
  if (totalExpected > 0) {
    const pooled = totalExpected + remainder;
    deaths = Math.floor(pooled);
    remainder = pooled - deaths;
  }
  const male = Uint32Array.from(item.male);
  const female = Uint32Array.from(item.female);
  const allocated = referenceAllocate(deaths, expected, male, female);
  return { male: allocated.male, female: allocated.female, deaths, remainder };
}

function definitionsFor(base: PopulationDefinitions, rate: number): PopulationDefinitions {
  const maleRate = new Array<number>(BAND_COUNT).fill(rate);
  const femaleRate = new Array<number>(BAND_COUNT).fill(rate);
  const zeroFertility = new Array<number>(7).fill(0);
  return {
    ...base,
    standardSchedule: {
      sourceYear: 1950,
      maleAnnualDeathsPer1000ByAgeBand: maleRate,
      femaleAnnualDeathsPer1000ByAgeBand: femaleRate,
      ageSpecificBirthsPer1000Women: zeroFertility,
    },
  };
}

const cases: DeathCase[] = [
  {
    name: "zero population cells",
    male: full(0),
    female: full(0),
    annualRatePer1000: 1000,
    initialRemainder: 0.999999,
  },
  {
    name: "very small expected values with a near-one remainder",
    male: full(0),
    female: full(0),
    annualRatePer1000: 0.5,
    initialRemainder: 0.999999,
  },
  {
    name: "equal counts produce tied remainders",
    male: full(365),
    female: full(365),
    annualRatePer1000: 500,
    initialRemainder: 0.5,
  },
  {
    name: "nearly equal remainders from slightly varied counts",
    male: vary(365, 3),
    female: vary(366, 4),
    annualRatePer1000: 500,
    initialRemainder: 0.5,
  },
  {
    name: "small counts near a capacity boundary",
    male: full(1),
    female: full(1),
    annualRatePer1000: 1000,
    initialRemainder: 0.999999,
  },
  {
    name: "integer rounding boundary below",
    male: full(730),
    female: full(730),
    annualRatePer1000: 500,
    initialRemainder: 1 - 1e-12,
  },
];

// Make the tiny case actually contain one person in two cells.
cases[1] = {
  ...cases[1]!,
  male: [1, ...full(0).slice(1)],
  female: [...full(0).slice(0, 80), 1],
};

describe("P2b1 reused expected-death total", () => {
  test("death allocation matches the reference algorithm across synthetic distributions", () => {
    const base = aggregateScenario();
    for (const item of cases) {
      const definitions = definitionsFor(base.definitions, item.annualRatePer1000);
      const world = createPopulationWorld({ ...base, definitions }, { seed: 0 });
      const block = world.popBlocks[0];
      if (block === undefined) throw new Error("missing pop block");
      block.maleByAge.set(item.male);
      block.femaleByAge.set(item.female);
      block.fractionalDeathRemainder = item.initialRemainder;
      // P4: the allocator is checked at level 1 (the reference applies the schedule
      // rate as given); the aggregate fixture starts from the 1900 world levels.
      block.childMortalityResidual = 1;
      block.adultMortalityResidual = 1;
      block.urbanShare = 0;

      const reference = referenceCase(item);
      const result = applyDailyDemography(world, definitions, 0);

      expect({ name: item.name, male: Array.from(block.maleByAge) }).toEqual({
        name: item.name,
        male: reference.male,
      });
      expect({ name: item.name, female: Array.from(block.femaleByAge) }).toEqual({
        name: item.name,
        female: reference.female,
      });
      expect({ name: item.name, deaths: result.totalDeaths }).toEqual({
        name: item.name,
        deaths: reference.deaths,
      });
      expect({ name: item.name, births: result.totalBirths }).toEqual({
        name: item.name,
        births: 0,
      });
      expect(block.fractionalDeathRemainder).toBeCloseTo(reference.remainder, 12);
    }
  });

  test("uses mortalityRatePer1000-derived expectations in the reference", () => {
    const definitions = definitionsFor(aggregateScenario().definitions, 500);
    expect(mortalityRatePer1000(definitions, 0, "male")).toBe(500);
    expect(mortalityRatePer1000(definitions, 16, "female")).toBe(500);
  });
});
