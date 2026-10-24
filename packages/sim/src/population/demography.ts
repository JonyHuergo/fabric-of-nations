/**
 * Daily demographic flows for single-year, sex-separated population state.
 *
 * Births are computed from age-specific fertility applied to female counts in
 * the seven maternal five-year bands. Deaths use sex-specific age-band mortality.
 * Both use per-block fractional accumulators and the actual civil-year length.
 * Newborns enter age 0, split with the definitions' sex ratio at birth.
 */

import { dayIndexToCivilDate, daysInYear } from "../calendar.js";
import type { DayIndex, Id } from "../types.js";
import type { World } from "../world.js";
import {
  AGE_BAND_WIDTH,
  MATERNAL_AGE_GROUP_COUNT,
  MORTALITY_BASIC_WEIGHT,
  MORTALITY_SCALE_DAYS,
  MORTALITY_SUBSISTENCE_WEIGHT,
  REPRODUCTIVE_AGE_END,
  REPRODUCTIVE_AGE_START,
  SINGLE_AGE_COUNT,
  TERMINAL_AGE_INDEX,
} from "./constants.js";
import {
  ageSpecificFertilityRatePer1000,
  assertRemainderValue,
  mortalityRatePer1000,
  saturate,
} from "./definitions.js";
import { populationTotal } from "./state.js";
import type {
  DemographyBlockResult,
  DemographyDayResult,
  PopulationDefinitions,
} from "./types.js";

function fertilityMultiplier(definitions: PopulationDefinitions, professionId: Id): number {
  const found = definitions.fertilityMultipliers.find(
    (entry) => entry.professionId === professionId,
  );
  if (found === undefined) {
    throw new RangeError(`missing fertility multiplier for profession ${String(professionId)}`);
  }
  if (!(found.multiplier >= 0) || !Number.isFinite(found.multiplier)) {
    throw new RangeError(`invalid fertility multiplier for profession ${String(professionId)}`);
  }
  return found.multiplier;
}

function needMortalityMultiplier(block: World["popBlocks"][number]): number {
  return (
    1 +
    MORTALITY_SUBSISTENCE_WEIGHT * saturate(block.unmetSubsistenceDays, MORTALITY_SCALE_DAYS) +
    MORTALITY_BASIC_WEIGHT * saturate(block.unmetBasicDays, MORTALITY_SCALE_DAYS)
  );
}

function ageBandForAge(age: number): number {
  return Math.min(Math.floor(age / AGE_BAND_WIDTH), TERMINAL_AGE_INDEX);
}

interface DeathAllocation {
  readonly male: number;
  readonly female: number;
}

interface DeathAllocationScratch {
  readonly bandExpected: Float64Array;
  readonly bandCounts: Uint32Array;
  readonly bandAllocation: Uint32Array;
  readonly bandRemainders: Float64Array;
}

/**
 * Allocate deaths to 17 age bands and sex by largest remainder, then distribute
 * each band allocation across its single-year ages proportionally. The band
 * allocation is the literal largest-remainder stage; within-band age placement
 * is a deterministic cumulative split so a 162-cell object sort is not needed on
 * every block-day.
 */
function allocateDeaths(
  deaths: number,
  expected: Float64Array,
  maleCounts: Uint32Array,
  femaleCounts: Uint32Array,
  popBlockId: Id,
  scratch: DeathAllocationScratch,
): DeathAllocation {
  let totalExpected = 0;
  for (const value of expected) totalExpected += value;
  if (deaths === 0 || totalExpected <= 0) return { male: 0, female: 0 };

  const bandCount = 17 * 2;
  const bandExpected = scratch.bandExpected;
  const bandCounts = scratch.bandCounts;
  const bandAllocation = scratch.bandAllocation;
  const bandRemainders = scratch.bandRemainders;
  bandExpected.fill(0);
  bandCounts.fill(0);
  bandAllocation.fill(0);
  bandRemainders.fill(-1);
  for (let age = 0; age < SINGLE_AGE_COUNT; age += 1) {
    const band = ageBandForAge(age);
    bandExpected[band * 2] = (bandExpected[band * 2] ?? 0) + (expected[age] ?? 0);
    bandExpected[band * 2 + 1] =
      (bandExpected[band * 2 + 1] ?? 0) + (expected[SINGLE_AGE_COUNT + age] ?? 0);
    bandCounts[band * 2] = (bandCounts[band * 2] ?? 0) + (maleCounts[age] ?? 0);
    bandCounts[band * 2 + 1] =
      (bandCounts[band * 2 + 1] ?? 0) + (femaleCounts[age] ?? 0);
  }

  let allocated = 0;
  for (let band = 0; band < bandCount; band += 1) {
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
    for (let band = 0; band < bandCount; band += 1) {
      const remainder = bandRemainders[band] ?? -1;
      if (remainder < 0) continue;
      const capacity = bandCounts[band] ?? 0;
      if ((bandAllocation[band] ?? 0) < capacity && remainder > best) {
        best = remainder;
        selected = band;
      }
    }
    if (selected < 0) {
      throw new RangeError(
        `cannot allocate ${String(deaths)} deaths within age-sex populations for popBlock ${String(popBlockId)}`,
      );
    }
    bandAllocation[selected] = (bandAllocation[selected] ?? 0) + 1;
    bandRemainders[selected] = -1;
    leftover -= 1;
  }

  let maleDeaths = 0;
  let femaleDeaths = 0;
  for (let band = 0; band < bandCount; band += 1) {
    const allocation = bandAllocation[band] ?? 0;
    if (allocation === 0) continue;
    const sex = band % 2;
    const bandIndex = Math.floor(band / 2);
    const counts = sex === 0 ? maleCounts : femaleCounts;
    const startAge = bandIndex * AGE_BAND_WIDTH;
    const endAge = Math.min(startAge + AGE_BAND_WIDTH, SINGLE_AGE_COUNT);
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
    if (bandLeftover !== 0) {
      throw new RangeError(
        `cannot place band death allocation within popBlock ${String(popBlockId)}`,
      );
    }
    if (sex === 0) maleDeaths += placed;
    else femaleDeaths += placed;
  }
  return { male: maleDeaths, female: femaleDeaths };
}

/** Apply one day of births and deaths to every pop block. */
export function applyDailyDemography(
  world: World,
  definitions: PopulationDefinitions,
  dayIndex: DayIndex,
  aged: boolean = false,
): DemographyDayResult {
  const date = dayIndexToCivilDate(dayIndex);
  const year = date.year;
  const days = daysInYear(year);
  let populationStart = 0;
  let populationEnd = 0;
  const results: DemographyBlockResult[] = [];
  let totalBirths = 0;
  let totalMaleBirths = 0;
  let totalFemaleBirths = 0;
  let totalDeaths = 0;
  const expectedDeaths = new Float64Array(SINGLE_AGE_COUNT * 2);
  const maleBandRates = new Float64Array(17);
  const femaleBandRates = new Float64Array(17);
  for (let band = 0; band < 17; band += 1) {
    maleBandRates[band] = mortalityRatePer1000(definitions, year, band, "male");
    femaleBandRates[band] = mortalityRatePer1000(definitions, year, band, "female");
  }
  const deathScratch: DeathAllocationScratch = {
    bandExpected: new Float64Array(34),
    bandCounts: new Uint32Array(34),
    bandAllocation: new Uint32Array(34),
    bandRemainders: new Float64Array(34),
  };

  for (const block of world.popBlocks) {
    const start = populationTotal(block);
    populationStart += start;
    if (start === 0) {
      results.push({
        popBlockId: block.id,
        populationStart: 0,
        births: 0,
        maleBirths: 0,
        femaleBirths: 0,
        deaths: 0,
        populationEnd: 0,
      });
      continue;
    }

    const male = block.maleByAge;
    const female = block.femaleByAge;
    const mortalityMultiplier = needMortalityMultiplier(block);
    for (let age = 0; age < SINGLE_AGE_COUNT; age += 1) {
      const band = ageBandForAge(age);
      const maleEffective = Math.min(
        1,
        ((maleBandRates[band] ?? 0) / 1000) * mortalityMultiplier,
      );
      const femaleEffective = Math.min(
        1,
        ((femaleBandRates[band] ?? 0) / 1000) * mortalityMultiplier,
      );
      expectedDeaths[age] = ((male[age] ?? 0) * maleEffective) / days;
      expectedDeaths[SINGLE_AGE_COUNT + age] = ((female[age] ?? 0) * femaleEffective) / days;
    }

    let totalExpectedDeaths = 0;
    for (const value of expectedDeaths) totalExpectedDeaths += value;

    let deaths = 0;
    if (totalExpectedDeaths > 0) {
      const pooled = totalExpectedDeaths + block.fractionalDeathRemainder;
      deaths = Math.floor(pooled);
      block.fractionalDeathRemainder = pooled - deaths;
    }
    assertRemainderValue(block.fractionalDeathRemainder, "fractionalDeathRemainder");
    if (deaths > start) {
      throw new RangeError(
        `popBlock ${String(block.id)} has ${String(deaths)} deaths but only ${String(start)} people`,
      );
    }

    const multiplier = fertilityMultiplier(definitions, block.professionId);
    let expectedBirths = 0;
    for (let age = REPRODUCTIVE_AGE_START; age <= REPRODUCTIVE_AGE_END; age += 1) {
      const maternalBand = Math.min(
        Math.floor((age - REPRODUCTIVE_AGE_START) / AGE_BAND_WIDTH),
        MATERNAL_AGE_GROUP_COUNT - 1,
      );
      const rate = ageSpecificFertilityRatePer1000(definitions, year, maternalBand);
      if (rate > 0) {
        expectedBirths += ((female[age] ?? 0) * (rate / 1000) * multiplier) / days;
      }
    }
    let births = 0;
    if (expectedBirths > 0) {
      const pooled = expectedBirths + block.fractionalBirthRemainder;
      births = Math.floor(pooled);
      block.fractionalBirthRemainder = pooled - births;
    }
    assertRemainderValue(block.fractionalBirthRemainder, "fractionalBirthRemainder");
    if (births > start) {
      throw new RangeError(
        `popBlock ${String(block.id)} has ${String(births)} births but only ${String(start)} people`,
      );
    }

    const deathAllocation = allocateDeaths(
      deaths,
      expectedDeaths,
      male,
      female,
      block.id,
      deathScratch,
    );
    if (deathAllocation.male + deathAllocation.female !== deaths) {
      throw new RangeError(
        `death allocation sum ${String(deathAllocation.male + deathAllocation.female)} does not equal ${String(deaths)} for popBlock ${String(block.id)}`,
      );
    }

    const maleShare = definitions.sexRatioAtBirth / (1 + definitions.sexRatioAtBirth);
    let maleBirths = 0;
    let femaleBirths = 0;
    if (births > 0) {
      const pooledMale = births * maleShare + block.fractionalMaleBirthRemainder;
      maleBirths = Math.floor(pooledMale);
      block.fractionalMaleBirthRemainder = pooledMale - maleBirths;
      assertRemainderValue(
        block.fractionalMaleBirthRemainder,
        "fractionalMaleBirthRemainder",
      );
      if (maleBirths < 0 || maleBirths > births) {
        throw new RangeError(
          `popBlock ${String(block.id)} male births ${String(maleBirths)} outside 0..${String(births)}`,
        );
      }
      femaleBirths = births - maleBirths;
      const youngestMale = (male[0] ?? 0) + maleBirths;
      const youngestFemale = (female[0] ?? 0) + femaleBirths;
      if (youngestMale > 0xffff_ffff || youngestFemale > 0xffff_ffff) {
        throw new RangeError(`popBlock ${String(block.id)} youngest cohort exceeds Uint32 range`);
      }
      male[0] = youngestMale;
      female[0] = youngestFemale;
    }

    const end = start - deaths + births;
    const actualEnd = populationTotal(block);
    if (actualEnd !== end) {
      throw new RangeError(
        `population conservation failed for popBlock ${String(block.id)}: ${String(start)} - ${String(deaths)} + ${String(births)} != ${String(actualEnd)}`,
      );
    }
    if (end < 0) {
      throw new RangeError(`popBlock ${String(block.id)} population became negative`);
    }

    totalBirths += births;
    totalMaleBirths += maleBirths;
    totalFemaleBirths += femaleBirths;
    totalDeaths += deaths;
    populationEnd += end;
    results.push({
      popBlockId: block.id,
      populationStart: start,
      births,
      maleBirths,
      femaleBirths,
      deaths,
      populationEnd: end,
    });
  }

  if (populationEnd !== populationStart + totalBirths - totalDeaths) {
    throw new RangeError(
      `world population conservation failed: ${String(populationStart)} + ${String(totalBirths)} - ${String(totalDeaths)} != ${String(populationEnd)}`,
    );
  }
  if (totalMaleBirths + totalFemaleBirths !== totalBirths) {
    throw new RangeError("male and female births do not sum to total births");
  }

  return {
    aged,
    blocks: results,
    totalBirths,
    totalMaleBirths,
    totalFemaleBirths,
    totalDeaths,
    populationStart,
    populationEnd,
  };
}
