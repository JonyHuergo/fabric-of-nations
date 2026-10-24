/**
 * Daily demographic flows.
 *
 * Births and deaths are computed from the population after annual ageing and
 * before the day's needs settlement. Fractional remainders are stored per pop
 * block so repeated daily rates do not systematically lose people. Deaths are
 * allocated to age cohorts with a deterministic largest-remainder method.
 */

import { dayIndexToCivilDate, daysInYear } from "../calendar.js";
import type { DayIndex, Id } from "../types.js";
import type { World } from "../world.js";
import { AGE_COHORT_COUNT, MORTALITY_BASIC_WEIGHT, MORTALITY_SCALE_DAYS, MORTALITY_SUBSISTENCE_WEIGHT } from "./constants.js";
import {
  assertRemainderValue,
  crudeBirthRatePer1000,
  mortalityRatePer1000,
  saturate,
} from "./definitions.js";
import { populationTotal, worldPopulation } from "./state.js";
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

/**
 * Allocate an integer death total to cohorts proportionally to expected deaths.
 * Largest fractional remainders receive leftover deaths; ties use cohort index.
 */
function allocateDeaths(
  deaths: number,
  expected: readonly number[],
  cohorts: Uint32Array,
  popBlockId: Id,
): number[] {
  const allocation = new Array<number>(AGE_COHORT_COUNT).fill(0);
  let totalExpected = 0;
  for (const value of expected) totalExpected += value;
  if (deaths === 0 || totalExpected <= 0) return allocation;

  const fractions: { index: number; remainder: number }[] = [];
  let allocated = 0;
  for (let index = 0; index < AGE_COHORT_COUNT; index += 1) {
    const exact = (deaths * (expected[index] ?? 0)) / totalExpected;
    const whole = Math.floor(exact);
    allocation[index] = whole;
    allocated += whole;
    fractions.push({ index, remainder: exact - whole });
  }
  let leftover = deaths - allocated;
  fractions.sort((left, right) => {
    if (right.remainder !== left.remainder) return right.remainder - left.remainder;
    return left.index - right.index;
  });
  while (leftover > 0) {
    let assigned = false;
    for (const entry of fractions) {
      const current = allocation[entry.index] ?? 0;
      const count = cohorts[entry.index] ?? 0;
      if (current < count) {
        allocation[entry.index] = current + 1;
        leftover -= 1;
        assigned = true;
        if (leftover === 0) break;
      }
    }
    if (!assigned) {
      throw new RangeError(
        `cannot allocate ${String(deaths)} deaths within cohort populations for popBlock ${String(popBlockId)}`,
      );
    }
  }

  let sum = 0;
  for (let index = 0; index < AGE_COHORT_COUNT; index += 1) {
    const value = allocation[index] ?? 0;
    if (value < 0 || value > (cohorts[index] ?? 0)) {
      throw new RangeError(
        `death allocation ${String(value)} exceeds cohort ${String(index)} for popBlock ${String(popBlockId)}`,
      );
    }
    sum += value;
  }
  if (sum !== deaths) {
    throw new RangeError(
      `death allocation sum ${String(sum)} does not equal ${String(deaths)} for popBlock ${String(popBlockId)}`,
    );
  }
  return allocation;
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
  const populationStart = worldPopulation(world);
  const results: DemographyBlockResult[] = [];
  let totalBirths = 0;
  let totalDeaths = 0;

  for (const block of world.popBlocks) {
    const start = populationTotal(block);
    if (start === 0) {
      results.push({
        popBlockId: block.id,
        populationStart: 0,
        births: 0,
        deaths: 0,
        populationEnd: 0,
      });
      continue;
    }

    const mortalityMultiplier = needMortalityMultiplier(block);
    const expectedDeaths = new Array<number>(AGE_COHORT_COUNT);
    for (let index = 0; index < AGE_COHORT_COUNT; index += 1) {
      const annualRatePer1000 = mortalityRatePer1000(definitions, year, index);
      const effectiveAnnualRate = Math.min(
        1,
        (annualRatePer1000 / 1000) * mortalityMultiplier,
      );
      expectedDeaths[index] = ((block.ageCohorts[index] ?? 0) * effectiveAnnualRate) / days;
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

    const allocations = allocateDeaths(deaths, expectedDeaths, block.ageCohorts, block.id);
    for (let index = 0; index < AGE_COHORT_COUNT; index += 1) {
      block.ageCohorts[index] = (block.ageCohorts[index] ?? 0) - (allocations[index] ?? 0);
    }

    const crudeBirthRate =
      crudeBirthRatePer1000(definitions, year) * fertilityMultiplier(definitions, block.professionId);
    let births = 0;
    if (crudeBirthRate > 0) {
      const expectedBirths = (start * (crudeBirthRate / 1000)) / days;
      const pooled = expectedBirths + block.fractionalBirthRemainder;
      births = Math.floor(pooled);
      block.fractionalBirthRemainder = pooled - births;
    }
    assertRemainderValue(block.fractionalBirthRemainder, "fractionalBirthRemainder");
    const youngest = (block.ageCohorts[0] ?? 0) + births;
    if (youngest > 0xffff_ffff) {
      throw new RangeError(`popBlock ${String(block.id)} youngest cohort exceeds Uint32 range`);
    }
    block.ageCohorts[0] = youngest;

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
    totalDeaths += deaths;
    results.push({
      popBlockId: block.id,
      populationStart: start,
      births,
      deaths,
      populationEnd: end,
    });
  }

  const populationEnd = worldPopulation(world);
  if (populationEnd !== populationStart + totalBirths - totalDeaths) {
    throw new RangeError(
      `world population conservation failed: ${String(populationStart)} + ${String(totalBirths)} - ${String(totalDeaths)} != ${String(populationEnd)}`,
    );
  }

  return {
    aged,
    blocks: results,
    totalBirths,
    totalDeaths,
    populationStart,
    populationEnd,
  };
}
