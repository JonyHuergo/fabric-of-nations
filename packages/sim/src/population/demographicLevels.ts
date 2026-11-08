/**
 * P4 cause-driven demographic levels (D-124, D-142).
 *
 * The definitions' standard schedule (WPP 2024 world, 1950) is the age *pattern*.
 * Each block's *levels* — multipliers of that pattern — are derived every day from
 * its fixed residuals and its current causes:
 *
 *   fertility = S(fertilityResidual × F(literacy of women 15–49, urban share,
 *               income ÷ subsistence, lagged child mortality, contraception, food))
 *   child     = childMortalityResidual × (1 + P_c × urban × (1 − sanitation))
 *               × H^1.5 × (1 + W_c × (1 − food))
 *   adult     = adultMortalityResidual × (1 + P_a × urban × (1 − sanitation))
 *               × H     × (1 + W_a × (1 − food))
 *
 * S is the natural-fertility saturation (D-144): identity up to the knee, then a
 * tanh approach to the Hutterite cap, so causes cannot drive fertility past what any
 * population has achieved. H is the country's combined health factor (technology × public health × hours,
 * M9/E5); sanitation and contraception are country causes; the rest is block state.
 * Residuals are fixed at world creation so the 1900 levels equal their sources; they
 * represent persistent factors the model does not simulate and never change. The
 * stored state is the residuals, the urban share, the lagged child mortality
 * (updated at each month start) and the food sufficiency (updated daily); the levels
 * themselves are derived, so a save holds no cached copy. Every value is validated,
 * never clamped to hide an impossible state.
 */

import {
  CHILD_MORTALITY_LAG_MONTHS,
  CROWDING_MORTALITY_WEIGHT_ADULT,
  CROWDING_MORTALITY_WEIGHT_CHILD,
  FERTILITY_CHILD_MORTALITY_ELASTICITY,
  FERTILITY_INCOME_ELASTICITY,
  FERTILITY_INCOME_RATIO_MAX,
  FERTILITY_INCOME_RATIO_MIN,
  FERTILITY_LEVEL_MAX,
  FERTILITY_LITERACY_COEFFICIENT,
  FERTILITY_NATURAL_CAP,
  FERTILITY_NATURAL_KNEE,
  FERTILITY_URBAN_DISCOUNT,
  FOOD_FERTILITY_WEIGHT,
  FOOD_MORTALITY_WEIGHT_ADULT,
  FOOD_MORTALITY_WEIGHT_CHILD,
  FOOD_REQUIREMENT_KCAL_PER_PERSON_PER_DAY,
  FOOD_SUFFICIENCY_SMOOTHING_DAYS,
  MORTALITY_CHILD_HEALTH_ELASTICITY,
  MORTALITY_LEVEL_MAX,
  MORTALITY_LEVEL_MIN,
  RATE_DECIMAL_PLACES,
  REPRODUCTIVE_AGE_END,
  REPRODUCTIVE_AGE_START,
  URBAN_MORTALITY_PENALTY_ADULT,
  URBAN_MORTALITY_PENALTY_CHILD,
  WEALTH_INTERCEPT,
  WEALTH_SLOPE,
} from "./constants.js";
import { blockCrowding, crowdingMortalityFactor } from "./housing.js";
import type { PopBlock, PopBlockDemographyInitialDef } from "./types.js";

/**
 * Country-level causes a block sees. A block in no country (population-only
 * fixtures) sees `NEUTRAL_DEMOGRAPHY_FACTORS`.
 */
export interface DemographyCountryFactors {
  /** Combined health mortality factor H, (0, 1] (technology × public health × hours). */
  readonly healthFactor: number;
  /** Realised sanitation coverage 0..1: sanitation knowledge × public-health service output. */
  readonly sanitationCoverage: number;
  /** Fractional TFR reduction from contraceptive technology, 0..CONTRACEPTION_MAX_REDUCTION. */
  readonly contraception: number;
}

export const NEUTRAL_DEMOGRAPHY_FACTORS: DemographyCountryFactors = Object.freeze({
  healthFactor: 1,
  sanitationCoverage: 0,
  contraception: 0,
});

function assertFactors(factors: DemographyCountryFactors): void {
  if (!(factors.healthFactor > 0) || factors.healthFactor > 1) {
    throw new RangeError(`demography health factor ${String(factors.healthFactor)} outside (0, 1]`);
  }
  if (!(factors.sanitationCoverage >= 0) || factors.sanitationCoverage > 1) {
    throw new RangeError(`sanitation coverage ${String(factors.sanitationCoverage)} outside 0..1`);
  }
  if (!(factors.contraception >= 0) || factors.contraception >= 1) {
    throw new RangeError(`contraception ${String(factors.contraception)} outside 0..1`);
  }
}

function roundDecimals(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Literacy of women aged 15–49: the block's single-year literacy weighted by its
 * female counts. Literacy is not sex-specific yet (D-142 §4), so this is the
 * literacy of the reproductive-age cohorts. Zero women: the 15+ aggregate.
 */
export function reproductiveFemaleLiteracy(block: PopBlock): number {
  let women = 0;
  let literate = 0;
  for (let age = REPRODUCTIVE_AGE_START; age <= REPRODUCTIVE_AGE_END; age += 1) {
    const count = block.femaleByAge[age] ?? 0;
    women += count;
    literate += count * (block.literacyByAge[age] ?? 0);
  }
  return women > 0 ? literate / women : block.literacy;
}

/**
 * Income relative to the subsistence basket, recovered from the smoothed wealth
 * indicator by inverting the M2 wealth target (wealth = 10 + 20 ln ratio; GDD §6
 * allows wealth to act on birth and death rates when documented), restricted to the
 * elasticity's validity range.
 */
export function incomeRatioFromWealth(wealthLevel: number): number {
  const ratio = Math.exp((wealthLevel - WEALTH_INTERCEPT) / WEALTH_SLOPE);
  return Math.min(FERTILITY_INCOME_RATIO_MAX, Math.max(FERTILITY_INCOME_RATIO_MIN, ratio));
}

/** Inputs of the fertility cause factor. */
export interface FertilityCauses {
  readonly femaleLiteracy: number;
  readonly urbanShare: number;
  readonly incomeRatio: number;
  readonly childMortalityLagged: number;
  readonly contraception: number;
  readonly foodSufficiency: number;
}

/** The causal fertility factor F (dimensionless, positive). */
export function fertilityCauseFactor(causes: FertilityCauses): number {
  const factor =
    Math.exp(-FERTILITY_LITERACY_COEFFICIENT * causes.femaleLiteracy) *
    (1 - FERTILITY_URBAN_DISCOUNT * causes.urbanShare) *
    Math.pow(causes.incomeRatio, -FERTILITY_INCOME_ELASTICITY) *
    Math.pow(causes.childMortalityLagged, FERTILITY_CHILD_MORTALITY_ELASTICITY) *
    (1 - causes.contraception) *
    (1 - FOOD_FERTILITY_WEIGHT * (1 - causes.foodSufficiency));
  if (!(factor > 0) || !Number.isFinite(factor)) {
    throw new RangeError(`fertility cause factor ${String(factor)} is not positive and finite`);
  }
  return factor;
}

/**
 * Natural-fertility saturation S (D-144): the fertility level of a causal product
 * `raw` = residual × F. Identity up to `FERTILITY_NATURAL_KNEE`; above it
 * KNEE + (CAP − KNEE) × tanh((raw − KNEE) / (CAP − KNEE)), continuous with slope 1 at
 * the knee, strictly increasing and below `FERTILITY_NATURAL_CAP` (in floating point
 * it reaches the cap only for raw far beyond it). A biological limit of the response,
 * not a repair: `raw` itself is validated.
 */
export function naturalFertilitySaturation(raw: number): number {
  if (!(raw >= 0) || !Number.isFinite(raw)) {
    throw new RangeError(`raw fertility level ${String(raw)} is not finite and non-negative`);
  }
  if (raw <= FERTILITY_NATURAL_KNEE) return raw;
  const width = FERTILITY_NATURAL_CAP - FERTILITY_NATURAL_KNEE;
  return FERTILITY_NATURAL_KNEE + width * Math.tanh((raw - FERTILITY_NATURAL_KNEE) / width);
}

/**
 * Inverse of `naturalFertilitySaturation`: the causal product that yields `level`.
 * Used where a residual is fitted to a sourced level. A level at or above the cap
 * cannot arise from causes and is rejected as an impossible state.
 */
export function inverseNaturalFertilitySaturation(level: number): number {
  if (!(level >= 0) || !Number.isFinite(level)) {
    throw new RangeError(`fertility level ${String(level)} is not finite and non-negative`);
  }
  if (level <= FERTILITY_NATURAL_KNEE) return level;
  if (level >= FERTILITY_NATURAL_CAP) {
    throw new RangeError(
      `fertility level ${String(level)} is not below the natural-fertility cap ${String(FERTILITY_NATURAL_CAP)}`,
    );
  }
  const width = FERTILITY_NATURAL_CAP - FERTILITY_NATURAL_KNEE;
  return FERTILITY_NATURAL_KNEE + width * Math.atanh((level - FERTILITY_NATURAL_KNEE) / width);
}

/** Urban mortality factor: 1 + penalty × urban share × (1 − sanitation coverage). */
export function urbanMortalityFactor(
  urbanShare: number,
  sanitationCoverage: number,
  penalty: number,
): number {
  return 1 + penalty * urbanShare * (1 - sanitationCoverage);
}

/** Food mortality factor: 1 + weight × shortfall. */
export function foodMortalityFactor(foodSufficiency: number, weight: number): number {
  return 1 + weight * (1 - foodSufficiency);
}

function fertilityCausesOf(block: PopBlock, contraception: number): FertilityCauses {
  return {
    femaleLiteracy: reproductiveFemaleLiteracy(block),
    urbanShare: block.urbanShare,
    incomeRatio: incomeRatioFromWealth(block.wealthLevel),
    childMortalityLagged: block.childMortalityLagged,
    contraception,
    foodSufficiency: block.foodSufficiency,
  };
}

/**
 * Fertility level of a block today: multiplier of the standard ASFR, the natural-
 * fertility saturation of residual × F(causes) (D-142 §2, D-144).
 */
export function fertilityLevel(block: PopBlock, factors: DemographyCountryFactors): number {
  return naturalFertilitySaturation(
    block.fertilityResidual * fertilityCauseFactor(fertilityCausesOf(block, factors.contraception)),
  );
}

/** Effective child (0–4) death-rate multiplier of a block today. */
export function effectiveChildMortality(block: PopBlock, factors: DemographyCountryFactors): number {
  return (
    block.childMortalityResidual *
    urbanMortalityFactor(block.urbanShare, factors.sanitationCoverage, URBAN_MORTALITY_PENALTY_CHILD) *
    Math.pow(factors.healthFactor, MORTALITY_CHILD_HEALTH_ELASTICITY) *
    foodMortalityFactor(block.foodSufficiency, FOOD_MORTALITY_WEIGHT_CHILD) *
    crowdingMortalityFactor(blockCrowding(block), CROWDING_MORTALITY_WEIGHT_CHILD)
  );
}

/** Effective adult (5+) death-rate multiplier of a block today. */
export function effectiveAdultMortality(block: PopBlock, factors: DemographyCountryFactors): number {
  return (
    block.adultMortalityResidual *
    urbanMortalityFactor(block.urbanShare, factors.sanitationCoverage, URBAN_MORTALITY_PENALTY_ADULT) *
    factors.healthFactor *
    foodMortalityFactor(block.foodSufficiency, FOOD_MORTALITY_WEIGHT_ADULT) *
    crowdingMortalityFactor(blockCrowding(block), CROWDING_MORTALITY_WEIGHT_ADULT)
  );
}

function assertLevel(value: number, path: string, minimum: number, maximum: number): void {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new RangeError(`${path} ${String(value)} outside ${String(minimum)}..${String(maximum)}`);
  }
}

/** Validate a block's P4 state (range and finiteness; no repair). */
export function assertValidBlockDemography(block: PopBlock, path: string): void {
  const rate = (value: unknown, name: string): void => {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
      throw new RangeError(`${path}.${name} must be a finite rate in 0..1`);
    }
  };
  rate(block.urbanShare, "urbanShare");
  rate(block.foodSufficiency, "foodSufficiency");
  assertLevel(block.childMortalityLagged, `${path}.childMortalityLagged`, MORTALITY_LEVEL_MIN, MORTALITY_LEVEL_MAX);
  assertLevel(block.fertilityResidual, `${path}.fertilityResidual`, 0, 1e6);
  assertLevel(block.childMortalityResidual, `${path}.childMortalityResidual`, MORTALITY_LEVEL_MIN, MORTALITY_LEVEL_MAX);
  assertLevel(block.adultMortalityResidual, `${path}.adultMortalityResidual`, MORTALITY_LEVEL_MIN, MORTALITY_LEVEL_MAX);
}

/** Validate the derived levels of a block under its country's factors. */
export function assertValidBlockLevels(block: PopBlock, factors: DemographyCountryFactors, path: string): void {
  assertFactors(factors);
  assertLevel(fertilityLevel(block, factors), `${path} fertility level`, 0, FERTILITY_LEVEL_MAX);
  assertLevel(effectiveChildMortality(block, factors), `${path} child mortality level`, MORTALITY_LEVEL_MIN, MORTALITY_LEVEL_MAX);
  assertLevel(effectiveAdultMortality(block, factors), `${path} adult mortality level`, MORTALITY_LEVEL_MIN, MORTALITY_LEVEL_MAX);
}

/** Sourced 1900 effective levels of a block (food sufficient). */
export interface SourcedDemographyLevels {
  readonly fertilityLevel: number;
  readonly childMortality: number;
  readonly adultMortality: number;
}

/** Defaults of `PopBlockDemographyInitialDef`: standard schedule, rural. */
export function sourcedLevelsOf(initial: PopBlockDemographyInitialDef | undefined): {
  readonly urbanShare: number;
  readonly levels: SourcedDemographyLevels;
} {
  return {
    urbanShare: initial?.urbanShare ?? 0,
    levels: {
      fertilityLevel: initial?.fertilityLevel ?? 1,
      childMortality: initial?.childMortalityLevel ?? 1,
      adultMortality: initial?.adultMortalityLevel ?? 1,
    },
  };
}

/**
 * Fix a block's residuals so that, under the country's current factors and full food
 * sufficiency, its levels reproduce the sourced effective levels (fertility through the
 * inverse of the natural-fertility saturation, D-144). Called once at world creation: population worlds with neutral factors,
 * economy worlds again once their countries exist. Mutates only `block`.
 */
export function calibrateBlockDemography(
  block: PopBlock,
  sourced: SourcedDemographyLevels,
  factors: DemographyCountryFactors,
  path: string,
): void {
  assertFactors(factors);
  assertLevel(sourced.fertilityLevel, `${path} sourced fertility level`, 0, FERTILITY_LEVEL_MAX);
  assertLevel(sourced.childMortality, `${path} sourced child mortality`, MORTALITY_LEVEL_MIN, MORTALITY_LEVEL_MAX);
  assertLevel(sourced.adultMortality, `${path} sourced adult mortality`, MORTALITY_LEVEL_MIN, MORTALITY_LEVEL_MAX);
  block.foodSufficiency = 1;
  block.childMortalityLagged = roundDecimals(sourced.childMortality, RATE_DECIMAL_PLACES);
  block.childMortalityResidual =
    sourced.childMortality /
    (Math.pow(factors.healthFactor, MORTALITY_CHILD_HEALTH_ELASTICITY) *
      urbanMortalityFactor(block.urbanShare, factors.sanitationCoverage, URBAN_MORTALITY_PENALTY_CHILD));
  block.adultMortalityResidual =
    sourced.adultMortality /
    (factors.healthFactor *
      urbanMortalityFactor(block.urbanShare, factors.sanitationCoverage, URBAN_MORTALITY_PENALTY_ADULT));
  // The residual reproduces the sourced level through the saturation (D-144): it is
  // fitted to the inverse, which is the identity for every sourced 1900 level (all
  // below the knee), and rejects a sourced level at or above the natural cap.
  block.fertilityResidual =
    inverseNaturalFertilitySaturation(sourced.fertilityLevel) /
    fertilityCauseFactor(fertilityCausesOf(block, factors.contraception));
  assertValidBlockDemography(block, path);
  assertValidBlockLevels(block, factors, path);
}

/**
 * Month-start update: the lagged child mortality moves toward the block's effective
 * child mortality today (mean lag `CHILD_MORTALITY_LAG_MONTHS`).
 */
export function updateBlockDemographicLevels(
  block: PopBlock,
  factors: DemographyCountryFactors,
): void {
  assertFactors(factors);
  const current = effectiveChildMortality(block, factors);
  block.childMortalityLagged = roundDecimals(
    block.childMortalityLagged + (current - block.childMortalityLagged) / CHILD_MORTALITY_LAG_MONTHS,
    RATE_DECIMAL_PLACES,
  );
  assertValidBlockDemography(block, `popBlock ${String(block.id)}`);
  assertValidBlockLevels(block, factors, `popBlock ${String(block.id)}`);
}

/**
 * Daily food-sufficiency update from the dietary energy the block actually consumed
 * today (kcal, all need tiers). Zero population leaves the state unchanged.
 */
export function updateBlockFoodSufficiency(
  block: PopBlock,
  population: number,
  kcalConsumed: number,
): void {
  if (population <= 0) return;
  if (!(kcalConsumed >= 0) || !Number.isFinite(kcalConsumed)) {
    throw new RangeError(`popBlock ${String(block.id)} consumed an invalid ${String(kcalConsumed)} kcal`);
  }
  const today = Math.min(1, kcalConsumed / population / FOOD_REQUIREMENT_KCAL_PER_PERSON_PER_DAY);
  block.foodSufficiency = roundDecimals(
    block.foodSufficiency + (today - block.foodSufficiency) / FOOD_SUFFICIENCY_SMOOTHING_DAYS,
    RATE_DECIMAL_PLACES,
  );
  if (!(block.foodSufficiency >= 0) || block.foodSufficiency > 1) {
    throw new RangeError(`popBlock ${String(block.id)} food sufficiency left 0..1`);
  }
}

/** True on the first civil day of a month, when the lagged child mortality moves. */
export function isDemographicLevelDay(day: number): boolean {
  return day === 1;
}

/** Month-start update of every block, each with its country's factors. */
export function updateDemographicLevels(
  blocks: readonly PopBlock[],
  factorsOf: (block: PopBlock) => DemographyCountryFactors,
): void {
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index] as PopBlock;
    updateBlockDemographicLevels(block, factorsOf(block));
  }
}
