/**
 * Daily demographic flows for single-year, sex-separated population state.
 *
 * Births are computed from age-specific fertility applied to female counts in
 * the seven maternal five-year bands. Deaths use sex-specific age-band mortality.
 * Both use per-block fractional accumulators and the actual civil-year length.
 * Newborns enter age 0, split with the definitions' sex ratio at birth.
 *
 * P4 (D-124, D-142): the definitions' standard schedule is the age pattern; each
 * block's fertility and mortality *levels* (`demographicLevels.ts`) scale it. The
 * daily health factor and the block's food sufficiency act on the death rates
 * through `effectiveChildMortality` / `effectiveAdultMortality`.
 */

import { dayIndexToCivilDate, daysInYear } from "../calendar.js";
import {
  effectiveAdultMortality,
  effectiveChildMortality,
  fertilityLevel,
  NEUTRAL_DEMOGRAPHY_FACTORS,
  type DemographyCountryFactors,
} from "./demographicLevels.js";
import type { DayIndex, Id } from "../types.js";
import type { World } from "../world.js";
import {
  AGE_BAND_WIDTH,
  CHILD_MORTALITY_BAND,
  MATERNAL_AGE_GROUP_COUNT,
  REPRODUCTIVE_AGE_END,
  REPRODUCTIVE_AGE_START,
  SINGLE_AGE_COUNT,
  TERMINAL_AGE_INDEX,
} from "./constants.js";
import {
  ageSpecificFertilityRatePer1000,
  assertRemainderValue,
  mortalityRatePer1000,
} from "./definitions.js";
import { populationTotal, syncBlockLiteracy } from "./state.js";
import { selectDeathBands } from "./deathAllocationSelection.js";
import type {
  DemographyBlockResult,
  DemographyDayResult,
  PopulationDefinitions,
} from "./types.js";
import type { PopBlock } from "./types.js";
import {
  POP_BLOCK_SCALAR_FIELDS,
  popBlockViews,
  type PopBlockScalarField,
  type PopulationTable,
} from "./blockTable.js";
import {
  assertResponseCovers,
  isKernelArrayOf,
  outputArray,
  outputCount,
  runStepsInline,
  type DaySteps,
  type KernelAllocator,
  type KernelArrays,
  type KernelArrayType,
  type KernelJob,
  type KernelOutput,
  type ParallelResponse,
  type UnitRange,
} from "../parallel.js";

function fertilityMultiplier(
  entries: readonly { readonly professionId: Id; readonly multiplier: number }[],
  professionId: Id,
): number {
  const found = entries.find(
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

function ageBandForAge(age: number): number {
  return Math.min(Math.floor(age / AGE_BAND_WIDTH), TERMINAL_AGE_INDEX);
}

/** `ageBandForAge` of every single-year age (D-139). */
const BAND_OF_AGE: Uint8Array = (() => {
  const table = new Uint8Array(SINGLE_AGE_COUNT);
  for (let age = 0; age < SINGLE_AGE_COUNT; age += 1) table[age] = ageBandForAge(age);
  return table;
})();

interface DeathAllocation {
  readonly male: number;
  readonly female: number;
}

interface DeathAllocationScratch {
  readonly bandExpected: Float64Array;
  readonly bandCounts: Uint32Array;
  readonly bandAllocation: Uint32Array;
  readonly bandRemainders: Float64Array;
  readonly bandOrder: Uint8Array;
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
  totalExpected: number,
  expected: Float64Array,
  maleCounts: Uint32Array,
  femaleCounts: Uint32Array,
  popBlockId: Id,
  scratch: DeathAllocationScratch,
): DeathAllocation {
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
    const band = BAND_OF_AGE[age] ?? 0;
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
  selectDeathBands(
    deaths,
    leftover,
    popBlockId,
    bandCount,
    bandAllocation,
    bandCounts,
    bandRemainders,
    scratch.bandOrder,
  );

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

/**
 * D-162: the day's constants of the demography kernel, derived once from the definitions and
 * the civil year (the same values every block read before).
 */
export interface DemographyConstants {
  readonly days: number;
  /** Mortality per 1,000 by five-year band (17), male and female. */
  readonly maleBandRates: Float64Array;
  readonly femaleBandRates: Float64Array;
  /** Standard age-specific fertility per 1,000 by maternal band. */
  readonly fertilityByBand: Float64Array;
  readonly sexRatioAtBirth: number;
  readonly fertilityMultipliers: readonly { readonly professionId: Id; readonly multiplier: number }[];
}

export function demographyConstants(definitions: PopulationDefinitions, dayIndex: DayIndex): DemographyConstants {
  const days = daysInYear(dayIndexToCivilDate(dayIndex).year);
  const maleBandRates = new Float64Array(17);
  const femaleBandRates = new Float64Array(17);
  for (let band = 0; band < 17; band += 1) {
    maleBandRates[band] = mortalityRatePer1000(definitions, band, "male");
    femaleBandRates[band] = mortalityRatePer1000(definitions, band, "female");
  }
  // Standard ASFR by maternal band, computed once.
  const fertilityByBand = new Float64Array(MATERNAL_AGE_GROUP_COUNT);
  for (let band = 0; band < MATERNAL_AGE_GROUP_COUNT; band += 1) {
    fertilityByBand[band] = ageSpecificFertilityRatePer1000(definitions, band);
  }
  return {
    days,
    maleBandRates,
    femaleBandRates,
    fertilityByBand,
    sexRatioAtBirth: definitions.sexRatioAtBirth,
    fertilityMultipliers: definitions.fertilityMultipliers.map((entry) => ({
      professionId: entry.professionId,
      multiplier: entry.multiplier,
    })),
  };
}

/** D-162: per-block results of a range, by position − `from` (births, deaths, persons at start). */
export interface DemographyRangeColumns {
  readonly start: Float64Array;
  readonly births: Float64Array;
  readonly maleBirths: Float64Array;
  readonly femaleBirths: Float64Array;
  readonly deaths: Float64Array;
}

function demographyColumns(length: number): DemographyRangeColumns {
  return {
    start: new Float64Array(length),
    births: new Float64Array(length),
    maleBirths: new Float64Array(length),
    femaleBirths: new Float64Array(length),
    deaths: new Float64Array(length),
  };
}

/**
 * D-162: one day of births and deaths for the blocks at positions `[from, to)` of `blocks`,
 * changing their cells, remainders and literacy in place and writing each block's figures to
 * `out` at `position − from`. A block depends only on its own state, `constants` and its
 * factors, so any split of the positions gives the same blocks. Runs on the sim thread (the
 * world's views) and in a worker (views of the range's table).
 */
export function runDemographyRange(
  blocks: readonly PopBlock[],
  from: number,
  to: number,
  constants: DemographyConstants,
  factorsAt: (position: number) => DemographyCountryFactors,
  out: DemographyRangeColumns,
): void {
  const days = constants.days;
  const maleBandRates = constants.maleBandRates;
  const femaleBandRates = constants.femaleBandRates;
  const fertilityByBand = constants.fertilityByBand;
  const expectedDeaths = new Float64Array(SINGLE_AGE_COUNT * 2);
  const multiplierByProfession = new Map<Id, number>();
  const maleEffectiveByBand = new Float64Array(17);
  const femaleEffectiveByBand = new Float64Array(17);
  const deathScratch: DeathAllocationScratch = {
    bandExpected: new Float64Array(34),
    bandCounts: new Uint32Array(34),
    bandAllocation: new Uint32Array(34),
    bandRemainders: new Float64Array(34),
    bandOrder: new Uint8Array(34),
  };

  for (let position = from; position < to; position += 1) {
    const block = blocks[position] as PopBlock;
    const local = position - from;
    const start = populationTotal(block);
    out.start[local] = start;
    if (start === 0) {
      out.births[local] = 0;
      out.maleBirths[local] = 0;
      out.femaleBirths[local] = 0;
      out.deaths[local] = 0;
      continue;
    }

    const male = block.maleByAge;
    const female = block.femaleByAge;
    const factors = factorsAt(position);
    // D-158: the block's persons (`start`, the cells unchanged since) for its crowding.
    const childMultiplier = effectiveChildMortality(block, factors, start);
    const adultMultiplier = effectiveAdultMortality(block, factors, start);
    // The effective rate is a function of the band only, so it is formed once per band.
    for (let band = 0; band < 17; band += 1) {
      const multiplier = band === CHILD_MORTALITY_BAND ? childMultiplier : adultMultiplier;
      maleEffectiveByBand[band] = Math.min(
        1,
        ((maleBandRates[band] ?? 0) / 1000) * multiplier,
      );
      femaleEffectiveByBand[band] = Math.min(
        1,
        ((femaleBandRates[band] ?? 0) / 1000) * multiplier,
      );
    }
    for (let age = 0; age < SINGLE_AGE_COUNT; age += 1) {
      const band = BAND_OF_AGE[age] ?? 0;
      expectedDeaths[age] = ((male[age] ?? 0) * (maleEffectiveByBand[band] ?? 0)) / days;
      expectedDeaths[SINGLE_AGE_COUNT + age] =
        ((female[age] ?? 0) * (femaleEffectiveByBand[band] ?? 0)) / days;
    }

    // This is the exact same Float64Array traversal, initial value, and addition
    // order that allocateDeaths previously used for its largest-remainder
    // denominator. No expectedDeaths cell changes between this sum and the call.
    let totalExpectedDeaths = 0;
    for (let cell = 0; cell < expectedDeaths.length; cell += 1) totalExpectedDeaths += expectedDeaths[cell] ?? 0;

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

    let professionMultiplier = multiplierByProfession.get(block.professionId);
    if (professionMultiplier === undefined) {
      professionMultiplier = fertilityMultiplier(constants.fertilityMultipliers, block.professionId);
      multiplierByProfession.set(block.professionId, professionMultiplier);
    }
    const multiplier = professionMultiplier * fertilityLevel(block, factors);
    let expectedBirths = 0;
    for (let age = REPRODUCTIVE_AGE_START; age <= REPRODUCTIVE_AGE_END; age += 1) {
      const maternalBand = Math.min(
        Math.floor((age - REPRODUCTIVE_AGE_START) / AGE_BAND_WIDTH),
        MATERNAL_AGE_GROUP_COUNT - 1,
      );
      const rate = fertilityByBand[maternalBand] ?? 0;
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
      totalExpectedDeaths,
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

    const maleShare = constants.sexRatioAtBirth / (1 + constants.sexRatioAtBirth);
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
    // Deaths and births change the age weighting of the adult literacy aggregate.
    syncBlockLiteracy(block);

    out.births[local] = births;
    out.maleBirths[local] = maleBirths;
    out.femaleBirths[local] = femaleBirths;
    out.deaths[local] = deaths;
  }
}

/** D-162: the day's result from every block's figures, in position order. */
function assembleDemography(
  blocks: readonly PopBlock[],
  columns: DemographyRangeColumns,
  aged: boolean,
): DemographyDayResult {
  let populationStart = 0;
  let populationEnd = 0;
  const results: DemographyBlockResult[] = [];
  let totalBirths = 0;
  let totalMaleBirths = 0;
  let totalFemaleBirths = 0;
  let totalDeaths = 0;
  for (let position = 0; position < blocks.length; position += 1) {
    const block = blocks[position] as PopBlock;
    const start = columns.start[position] ?? 0;
    const births = columns.births[position] ?? 0;
    const maleBirths = columns.maleBirths[position] ?? 0;
    const femaleBirths = columns.femaleBirths[position] ?? 0;
    const deaths = columns.deaths[position] ?? 0;
    const end = start - deaths + births;
    populationStart += start;
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

/** D-162: the columns a demography job carries back to the sim thread (the block state it changes). */
const DEMOGRAPHY_WRITTEN_SCALARS = [
  "literacy",
  "fractionalBirthRemainder",
  "fractionalMaleBirthRemainder",
  "fractionalDeathRemainder",
] as const;

interface DemographyJobParams {
  readonly count: number;
  readonly constants: DemographyConstants;
}

/** D-162: the job of positions `[from, to)`: the range's table, its factors and its constants. */
function demographyJob(
  table: PopulationTable,
  blocks: readonly PopBlock[],
  from: number,
  to: number,
  constants: DemographyConstants,
  factorsOf: ((block: PopBlock) => DemographyCountryFactors) | undefined,
  allocator: KernelAllocator,
): KernelJob {
  const count = to - from;
  const arrays: KernelArrays = {};
  for (const field of POP_BLOCK_SCALAR_FIELDS) {
    const column = allocator.f64(`demography.${field}`, count);
    column.set(table[field].subarray(from, to));
    arrays[field] = column;
  }
  const cellFrom = from * SINGLE_AGE_COUNT;
  const cellTo = to * SINGLE_AGE_COUNT;
  const male = allocator.u32("demography.male", count * SINGLE_AGE_COUNT);
  male.set(table.male.subarray(cellFrom, cellTo));
  const female = allocator.u32("demography.female", count * SINGLE_AGE_COUNT);
  female.set(table.female.subarray(cellFrom, cellTo));
  const literacyByAge = allocator.f64("demography.literacyByAge", count * SINGLE_AGE_COUNT);
  literacyByAge.set(table.literacyByAge.subarray(cellFrom, cellTo));
  const health = allocator.f64("demography.healthFactor", count);
  const sanitation = allocator.f64("demography.sanitationCoverage", count);
  const contraception = allocator.f64("demography.contraception", count);
  for (let position = from; position < to; position += 1) {
    const factors = factorsOf?.(blocks[position] as PopBlock) ?? NEUTRAL_DEMOGRAPHY_FACTORS;
    health[position - from] = factors.healthFactor;
    sanitation[position - from] = factors.sanitationCoverage;
    contraception[position - from] = factors.contraception;
  }
  arrays.male = male;
  arrays.female = female;
  arrays.literacyByAge = literacyByAge;
  arrays.healthFactor = health;
  arrays.sanitationCoverage = sanitation;
  arrays.contraception = contraception;
  const params: DemographyJobParams = { count, constants };
  return { kernel: "demography", params, arrays };
}

function jobArray<T extends Float64Array | Uint32Array>(
  arrays: KernelArrays,
  name: string,
  type: KernelArrayType<T>,
  length: number,
): T {
  const array = arrays[name];
  if (!isKernelArrayOf(array, type) || array.length !== length) {
    throw new RangeError(`demography job array ${name} is missing or has the wrong length`);
  }
  return array;
}

/**
 * D-162: run a demography job (in a worker, or on the sim thread for its own lane): a table of
 * the range's blocks with their own views and the same per-block code. It returns the cells that
 * changed (index into the range's male cells then female cells, and the new count), the
 * literacy and remainder columns and each block's figures: results are copied between threads,
 * so they are kept small.
 */
export function runDemographyKernel(params: unknown, arrays: KernelArrays, allocator?: KernelAllocator): KernelOutput {
  const job = params as DemographyJobParams;
  const count = job.count;
  if (!Number.isInteger(count) || count < 0) throw new RangeError("demography job has an invalid block count");
  const cells = count * SINGLE_AGE_COUNT;
  const scalar = (field: PopBlockScalarField): Float64Array => jobArray(arrays, field, Float64Array, count);
  const maleBefore = jobArray(arrays, "male", Uint32Array, cells);
  const femaleBefore = jobArray(arrays, "female", Uint32Array, cells);
  // The kernel works on copies of the cells and reports the cells that differ from the job's.
  const maleWork = allocator === undefined ? new Uint32Array(cells) : allocator.u32("demography.work.male", cells);
  const femaleWork = allocator === undefined ? new Uint32Array(cells) : allocator.u32("demography.work.female", cells);
  maleWork.set(maleBefore);
  femaleWork.set(femaleBefore);
  const table: PopulationTable = {
    count,
    male: maleWork,
    female: femaleWork,
    literacyByAge: jobArray(arrays, "literacyByAge", Float64Array, cells),
    id: scalar("id"),
    provinceId: scalar("provinceId"),
    professionId: scalar("professionId"),
    literacy: scalar("literacy"),
    qualification: scalar("qualification"),
    wealthLevel: scalar("wealthLevel"),
    financialAccountId: scalar("financialAccountId"),
    militancy: scalar("militancy"),
    unmetSubsistenceDays: scalar("unmetSubsistenceDays"),
    unmetBasicDays: scalar("unmetBasicDays"),
    comfortFulfilledDays: scalar("comfortFulfilledDays"),
    fractionalBirthRemainder: scalar("fractionalBirthRemainder"),
    fractionalMaleBirthRemainder: scalar("fractionalMaleBirthRemainder"),
    fractionalDeathRemainder: scalar("fractionalDeathRemainder"),
    urbanShare: scalar("urbanShare"),
    fertilityResidual: scalar("fertilityResidual"),
    childMortalityResidual: scalar("childMortalityResidual"),
    adultMortalityResidual: scalar("adultMortalityResidual"),
    childMortalityLagged: scalar("childMortalityLagged"),
    foodSufficiency: scalar("foodSufficiency"),
    incomeSmoothedRUSDPerCapitaDay: scalar("incomeSmoothedRUSDPerCapitaDay"),
    dwellings: scalar("dwellings"),
    housingReferencePersonsPerDwelling: scalar("housingReferencePersonsPerDwelling"),
    housingReferenceIncomeRUSDPerCapitaDay: scalar("housingReferenceIncomeRUSDPerCapitaDay"),
  };
  const health = jobArray(arrays, "healthFactor", Float64Array, count);
  const sanitation = jobArray(arrays, "sanitationCoverage", Float64Array, count);
  const contraception = jobArray(arrays, "contraception", Float64Array, count);
  // Outputs are made where the kernel runs (nothing empty crosses threads).
  const out: DemographyRangeColumns =
    allocator === undefined
      ? demographyColumns(count)
      : {
          start: allocator.f64("demography.out.start", count),
          births: allocator.f64("demography.out.births", count),
          maleBirths: allocator.f64("demography.out.maleBirths", count),
          femaleBirths: allocator.f64("demography.out.femaleBirths", count),
          deaths: allocator.f64("demography.out.deaths", count),
        };
  runDemographyRange(
    popBlockViews(table),
    0,
    count,
    job.constants,
    (position) => ({
      healthFactor: health[position] ?? 1,
      sanitationCoverage: sanitation[position] ?? 0,
      contraception: contraception[position] ?? 0,
    }),
    out,
  );
  let changed = 0;
  for (let cell = 0; cell < cells; cell += 1) {
    if (table.male[cell] !== maleBefore[cell]) changed += 1;
    if (table.female[cell] !== femaleBefore[cell]) changed += 1;
  }
  const cellIndex = allocator === undefined ? new Uint32Array(changed) : allocator.u32("demography.out.cellIndex", changed);
  const cellValue = allocator === undefined ? new Uint32Array(changed) : allocator.u32("demography.out.cellValue", changed);
  let next = 0;
  for (let cell = 0; cell < cells; cell += 1) {
    const value = table.male[cell] ?? 0;
    if (value !== maleBefore[cell]) {
      cellIndex[next] = cell;
      cellValue[next] = value;
      next += 1;
    }
  }
  for (let cell = 0; cell < cells; cell += 1) {
    const value = table.female[cell] ?? 0;
    if (value !== femaleBefore[cell]) {
      cellIndex[next] = cells + cell;
      cellValue[next] = value;
      next += 1;
    }
  }
  return {
    arrays: {
      cellIndex,
      cellValue,
      literacy: table.literacy,
      fractionalBirthRemainder: table.fractionalBirthRemainder,
      fractionalMaleBirthRemainder: table.fractionalMaleBirthRemainder,
      fractionalDeathRemainder: table.fractionalDeathRemainder,
      outStart: out.start,
      outBirths: out.births,
      outMaleBirths: out.maleBirths,
      outFemaleBirths: out.femaleBirths,
      outDeaths: out.deaths,
    },
    counts: { cells: changed },
  };
}

/** D-162: copy each range's changed block state and figures back, in range order. */
function mergeDemography(
  table: PopulationTable,
  response: ParallelResponse,
  columns: DemographyRangeColumns,
): void {
  assertResponseCovers(response, table.count);
  for (let lane = 0; lane < response.ranges.length; lane += 1) {
    const range = response.ranges[lane] as UnitRange;
    const output = response.outputs[lane] as KernelOutput;
    const count = range.to - range.from;
    const cells = count * SINGLE_AGE_COUNT;
    const changed = outputCount(output, "cells");
    const cellIndex = outputArray(output, "cellIndex", Uint32Array, changed);
    const cellValue = outputArray(output, "cellValue", Uint32Array, changed);
    const base = range.from * SINGLE_AGE_COUNT;
    for (let change = 0; change < changed; change += 1) {
      const cell = cellIndex[change] ?? 0;
      const value = cellValue[change] ?? 0;
      if (cell < cells) table.male[base + cell] = value;
      else if (cell < 2 * cells) table.female[base + cell - cells] = value;
      else throw new RangeError("demography job returned a cell outside its range");
    }
    for (const field of DEMOGRAPHY_WRITTEN_SCALARS) {
      table[field].set(outputArray(output, field, Float64Array, count).subarray(0, count), range.from);
    }
    columns.start.set(outputArray(output, "outStart", Float64Array, count).subarray(0, count), range.from);
    columns.births.set(outputArray(output, "outBirths", Float64Array, count).subarray(0, count), range.from);
    columns.maleBirths.set(outputArray(output, "outMaleBirths", Float64Array, count).subarray(0, count), range.from);
    columns.femaleBirths.set(outputArray(output, "outFemaleBirths", Float64Array, count).subarray(0, count), range.from);
    columns.deaths.set(outputArray(output, "outDeaths", Float64Array, count).subarray(0, count), range.from);
  }
}

/**
 * Apply one day of births and deaths to every pop block (D-162: a step that may run its blocks
 * on worker threads; `applyDailyDemography` runs it inline).
 */
export function* dailyDemographySteps(
  world: World,
  definitions: PopulationDefinitions,
  dayIndex: DayIndex,
  aged: boolean = false,
  options: {
    /**
     * P4 country causes of each block (combined health factor, sanitation coverage,
     * contraception). Absent for the M2-only path; blocks in no country are neutral.
     */
    readonly factorsOf?: (block: World["popBlocks"][number]) => DemographyCountryFactors;
  } = {},
): DaySteps<DemographyDayResult> {
  const constants = demographyConstants(definitions, dayIndex);
  const blocks = world.popBlocks;
  const table = world.population;
  const factorsOf = options.factorsOf;
  const columns = demographyColumns(blocks.length);
  const response = yield {
    kernel: "demography",
    units: blocks.length,
    splittable: table.count === blocks.length,
    job: (from, to, allocator) => demographyJob(table, blocks, from, to, constants, factorsOf, allocator),
  };
  if (response === undefined) {
    runDemographyRange(
      blocks,
      0,
      blocks.length,
      constants,
      (position) => factorsOf?.(blocks[position] as PopBlock) ?? NEUTRAL_DEMOGRAPHY_FACTORS,
      columns,
    );
  } else {
    mergeDemography(table, response, columns);
  }
  return assembleDemography(blocks, columns, aged);
}

/** Apply one day of births and deaths to every pop block. */
export function applyDailyDemography(
  world: World,
  definitions: PopulationDefinitions,
  dayIndex: DayIndex,
  aged: boolean = false,
  options: {
    readonly factorsOf?: (block: World["popBlocks"][number]) => DemographyCountryFactors;
  } = {},
): DemographyDayResult {
  return runStepsInline(dailyDemographySteps(world, definitions, dayIndex, aged, options));
}
