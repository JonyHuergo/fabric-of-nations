/**
 * P4 demographic indicators (D-142): reporting functions of the current state.
 *
 * Inputs are the blocks of a province or a country, the definitions' standard
 * schedule and each block's health factor. Rates are *current* (instantaneous)
 * annual rates implied by today's levels and age structure; the life table uses
 * the same single-year continuous hazard the daily demography applies
 * (survival exp(−m) per year, m capped at 1 as in the daily rate). Nothing here
 * mutates state or feeds a simulation decision.
 */

import {
  AGE_BAND_WIDTH,
  AGE_COHORT_COUNT,
  MATERNAL_AGE_GROUP_COUNT,
  REPRODUCTIVE_AGE_END,
  REPRODUCTIVE_AGE_START,
  SINGLE_AGE_COUNT,
  TERMINAL_AGE_INDEX,
} from "./constants.js";
import {
  effectiveAdultMortality,
  effectiveChildMortality,
  fertilityLevel,
  reproductiveFemaleLiteracy,
  type DemographyCountryFactors,
} from "./demographicLevels.js";
import type { PopBlock, PopulationDefinitions } from "./types.js";

/** Period life-table results for one schedule. */
export interface LifeTableResult {
  /** Life expectancy at birth, both sexes, years. */
  readonly lifeExpectancy: number;
  /** Probability of dying before age 5, per 1,000 live births, both sexes. */
  readonly under5MortalityPer1000: number;
}

function sexLifeTable(ratesPer1000ByBand: ArrayLike<number>): { e0: number; l5: number } {
  let survivors = 1;
  let personYears = 0;
  let l5 = 1;
  for (let age = 0; age < TERMINAL_AGE_INDEX; age += 1) {
    if (age === 5) l5 = survivors;
    const band = Math.min(Math.floor(age / AGE_BAND_WIDTH), AGE_COHORT_COUNT - 1);
    const m = Math.min(1, (ratesPer1000ByBand[band] ?? 0) / 1000);
    const next = survivors * Math.exp(-m);
    personYears += m > 0 ? (survivors - next) / m : survivors;
    survivors = next;
  }
  const terminal = Math.min(1, (ratesPer1000ByBand[AGE_COHORT_COUNT - 1] ?? 0) / 1000);
  personYears += terminal > 0 ? survivors / terminal : 0;
  return { e0: personYears, l5 };
}

/**
 * Life expectancy and under-5 mortality of sex-specific band death rates per 1,000
 * (17 bands each), births split by the sex ratio at birth.
 */
export function lifeTable(
  maleRatesPer1000: ArrayLike<number>,
  femaleRatesPer1000: ArrayLike<number>,
  sexRatioAtBirth: number,
): LifeTableResult {
  const male = sexLifeTable(maleRatesPer1000);
  const female = sexLifeTable(femaleRatesPer1000);
  const maleShare = sexRatioAtBirth / (1 + sexRatioAtBirth);
  return {
    lifeExpectancy: maleShare * male.e0 + (1 - maleShare) * female.e0,
    under5MortalityPer1000: 1000 * (1 - (maleShare * male.l5 + (1 - maleShare) * female.l5)),
  };
}

/**
 * Band death rates per 1,000 for child and adult multipliers of the standard
 * schedule, with the daily path's cap of 1,000 per 1,000.
 */
export function scheduleRates(
  definitions: PopulationDefinitions,
  sex: "male" | "female",
  childMultiplier: number,
  adultMultiplier: number,
): Float64Array {
  const source =
    sex === "male"
      ? definitions.standardSchedule.maleAnnualDeathsPer1000ByAgeBand
      : definitions.standardSchedule.femaleAnnualDeathsPer1000ByAgeBand;
  const rates = new Float64Array(AGE_COHORT_COUNT);
  for (let band = 0; band < AGE_COHORT_COUNT; band += 1) {
    const multiplier = band === 0 ? childMultiplier : adultMultiplier;
    rates[band] = Math.min(1000, (source[band] ?? 0) * multiplier);
  }
  return rates;
}

/** Current demography of a group of blocks (a province or a country). */
export interface DemographicIndicators {
  readonly population: number;
  /** Male and female people in the 17 five-year bands (0–4 … 80+). */
  readonly maleByBand: readonly number[];
  readonly femaleByBand: readonly number[];
  /** Expected births and deaths per 1,000 people per year at today's rates. */
  readonly crudeBirthRate: number;
  readonly crudeDeathRate: number;
  /** Total fertility rate, children per woman. */
  readonly totalFertility: number;
  /** Period life expectancy at birth, years. */
  readonly lifeExpectancy: number;
  /** Probability of dying before age 5 per 1,000 births. */
  readonly under5MortalityPer1000: number;
  /** Shares 0..1, population-weighted. */
  readonly urbanShare: number;
  readonly femaleLiteracy: number;
  readonly foodSufficiency: number;
}

/**
 * Indicators of `blocks`. `factorsOf` returns the block's country causes
 * (`NEUTRAL_DEMOGRAPHY_FACTORS` where no country applies).
 */
export function demographicIndicators(
  blocks: readonly PopBlock[],
  definitions: PopulationDefinitions,
  factorsOf: (block: PopBlock) => DemographyCountryFactors,
): DemographicIndicators {
  const maleByBand = new Array<number>(AGE_COHORT_COUNT).fill(0);
  const femaleByBand = new Array<number>(AGE_COHORT_COUNT).fill(0);
  const professionMultiplier = new Map<number, number>();
  for (const entry of definitions.fertilityMultipliers) {
    professionMultiplier.set(entry.professionId, entry.multiplier);
  }
  const asfr = definitions.standardSchedule.ageSpecificBirthsPer1000Women;
  const maleRates = definitions.standardSchedule.maleAnnualDeathsPer1000ByAgeBand;
  const femaleRates = definitions.standardSchedule.femaleAnnualDeathsPer1000ByAgeBand;
  const womenByMaternalBand = new Float64Array(MATERNAL_AGE_GROUP_COUNT);
  const birthsByMaternalBand = new Float64Array(MATERNAL_AGE_GROUP_COUNT);
  let population = 0;
  let births = 0;
  let deaths = 0;
  let children = 0;
  let childWeighted = 0;
  let adults = 0;
  let adultWeighted = 0;
  let urban = 0;
  let food = 0;
  let women = 0;
  let literateWomen = 0;

  for (const block of blocks) {
    const factors = factorsOf(block);
    const child = effectiveChildMortality(block, factors);
    const adult = effectiveAdultMortality(block, factors);
    const fertility = fertilityLevel(block, factors) * (professionMultiplier.get(block.professionId) ?? 1);
    let blockPopulation = 0;
    let blockChildren = 0;
    let blockWomen = 0;
    for (let age = 0; age < SINGLE_AGE_COUNT; age += 1) {
      const band = Math.min(Math.floor(age / AGE_BAND_WIDTH), AGE_COHORT_COUNT - 1);
      const males = block.maleByAge[age] ?? 0;
      const females = block.femaleByAge[age] ?? 0;
      maleByBand[band] = (maleByBand[band] ?? 0) + males;
      femaleByBand[band] = (femaleByBand[band] ?? 0) + females;
      blockPopulation += males + females;
      if (band === 0) blockChildren += males + females;
      const multiplier = band === 0 ? child : adult;
      deaths +=
        males * Math.min(1, ((maleRates[band] ?? 0) / 1000) * multiplier) +
        females * Math.min(1, ((femaleRates[band] ?? 0) / 1000) * multiplier);
      if (age >= REPRODUCTIVE_AGE_START && age <= REPRODUCTIVE_AGE_END) {
        const maternal = Math.min(
          Math.floor((age - REPRODUCTIVE_AGE_START) / AGE_BAND_WIDTH),
          MATERNAL_AGE_GROUP_COUNT - 1,
        );
        const rate = ((asfr[maternal] ?? 0) / 1000) * fertility;
        womenByMaternalBand[maternal] = (womenByMaternalBand[maternal] ?? 0) + females;
        birthsByMaternalBand[maternal] = (birthsByMaternalBand[maternal] ?? 0) + females * rate;
        births += females * rate;
        blockWomen += females;
      }
    }
    population += blockPopulation;
    children += blockChildren;
    childWeighted += blockChildren * child;
    adults += blockPopulation - blockChildren;
    adultWeighted += (blockPopulation - blockChildren) * adult;
    urban += blockPopulation * block.urbanShare;
    food += blockPopulation * block.foodSufficiency;
    women += blockWomen;
    literateWomen += blockWomen * reproductiveFemaleLiteracy(block);
  }

  let totalFertility = 0;
  for (let band = 0; band < MATERNAL_AGE_GROUP_COUNT; band += 1) {
    const count = womenByMaternalBand[band] ?? 0;
    if (count > 0) totalFertility += ((birthsByMaternalBand[band] ?? 0) / count) * AGE_BAND_WIDTH;
  }
  const childMultiplier = children > 0 ? childWeighted / children : 1;
  const adultMultiplier = adults > 0 ? adultWeighted / adults : 1;
  const table = lifeTable(
    scheduleRates(definitions, "male", childMultiplier, adultMultiplier),
    scheduleRates(definitions, "female", childMultiplier, adultMultiplier),
    definitions.sexRatioAtBirth,
  );
  return {
    population,
    maleByBand,
    femaleByBand,
    crudeBirthRate: population > 0 ? (births / population) * 1000 : 0,
    crudeDeathRate: population > 0 ? (deaths / population) * 1000 : 0,
    totalFertility,
    lifeExpectancy: population > 0 ? table.lifeExpectancy : 0,
    under5MortalityPer1000: population > 0 ? table.under5MortalityPer1000 : 0,
    urbanShare: population > 0 ? urban / population : 0,
    femaleLiteracy: women > 0 ? literateWomen / women : 0,
    foodSufficiency: population > 0 ? food / population : 0,
  };
}
