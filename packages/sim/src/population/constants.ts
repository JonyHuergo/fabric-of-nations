/**
 * M2.1 population constants.
 *
 * Authoritative age state is single-year and sex-separated. The 17 five-year
 * bands are reporting/maternal aggregates. Behavioral coefficients are
 * PROVISIONAL until calibrated against source-backed data. Every coefficient
 * documents its units and cadence here and in DECISIONS.md.
 */

/** Number of five-year reporting bands: 0-4, ..., 75-79, 80+. */
export const FIVE_YEAR_AGE_GROUP_COUNT = 17;

/** Backwards-compatible name for the reporting band count. */
export const AGE_COHORT_COUNT = FIVE_YEAR_AGE_GROUP_COUNT;

/** Single-year age slots: 0..79, plus one open-ended 80+ slot. */
export const SINGLE_AGE_COUNT = 81;

/** Index of the open-ended 80+ slot. */
export const TERMINAL_AGE_INDEX = SINGLE_AGE_COUNT - 1;

/** Working age is 15-64 inclusive. */
export const WORKING_AGE_START = 15;
export const WORKING_AGE_END = 64;

/**
 * First age counted in the derived adult literacy aggregate (15+). Literacy is
 * authoritative by single year of age in `PopBlock.literacyByAge`; the scalar
 * `PopBlock.literacy` is this aggregate (D-077, M9).
 */
export const ADULT_LITERACY_MIN_AGE = 15;

/** Female reproductive ages 15-49, split into seven five-year maternal bands. */
export const REPRODUCTIVE_AGE_START = 15;
export const REPRODUCTIVE_AGE_END = 49;
export const MATERNAL_AGE_GROUP_COUNT = 7;

/** First maternal five-year band index (15-19) in the 17-band scale. */
export const MATERNAL_AGE_GROUP_FIRST_INDEX = 3;

/** Width in years of a reporting/maternal band. */
export const AGE_BAND_WIDTH = 5;

/** Tolerance for fractional remainders and floating comparisons. */
export const REMAINDER_TOLERANCE = 1e-9;

/** Small positive number used to guard division in indicator formulas. */
export const POPULATION_EPSILON = 1e-9;

/** Tolerance for RUSD invariant checks. */
export const MONEY_TOLERANCE_RUSD = 1e-6;

/** Tolerance for physical quantity and supply invariant checks. */
export const QUANTITY_TOLERANCE = 1e-9;

/** Stored wealth indicator precision; used to stabilize repeated updates. */
export const WEALTH_DECIMAL_PLACES = 6;

/** Stored rate precision; used to stabilize repeated updates. */
export const RATE_DECIMAL_PLACES = 9;

/**
 * Tolerance for the derived 15+ literacy aggregate. Stored rates are rounded to
 * `RATE_DECIMAL_PLACES`, so the aggregate check allows one rounding unit with
 * margin; it is never used to clamp or repair a value.
 */
export const LITERACY_AGGREGATE_TOLERANCE = 1e-8;

/** Wealth target formula: intercept, in wealth points. PROVISIONAL. */
export const WEALTH_INTERCEPT = 10;

/** Wealth target formula: slope on ln(income / subsistence cost). PROVISIONAL. */
export const WEALTH_SLOPE = 20;

/** Wealth target formula: epsilon for the logarithm argument. PROVISIONAL. */
export const WEALTH_TARGET_EPSILON = 1e-9;

/** Monthly smoothing toward the wealth target, fraction of gap. PROVISIONAL. */
export const WEALTH_MONTHLY_SMOOTHING = 0.25;

/** Wealth indicator range. */
export const WEALTH_MIN = 0;
export const WEALTH_MAX = 99;

/**
 * Maximum monthly wealth loss when basic needs are continuously unmet, in wealth
 * points/month at saturation. PROVISIONAL.
 */
export const BASIC_WEALTH_LOSS_MAX = 2;

/** Days scale for basic-need wealth loss. PROVISIONAL. */
export const BASIC_WEALTH_SCALE_DAYS = 180;

/** Maximum monthly wealth gain from sustained comfort fulfillment. PROVISIONAL. */
export const COMFORT_WEALTH_GAIN_MAX = 0.5;

/** Maximum monthly wealth gain from current luxury fulfillment. PROVISIONAL. */
export const LUXURY_WEALTH_GAIN_MAX = 0.25;

/** Days scale for sustained comfort wealth gain. PROVISIONAL. */
export const COMFORT_WEALTH_SCALE_DAYS = 365;

/** Baseline daily militancy target with no needs pressure. PROVISIONAL. */
export const MILITANCY_BASE = 0.02;

/** Militancy target weight for consecutive unmet subsistence days. PROVISIONAL. */
export const MILITANCY_SUBSISTENCE_WEIGHT = 0.8;

/** Militancy target weight for consecutive unmet basic days. PROVISIONAL. */
export const MILITANCY_BASIC_WEIGHT = 0.35;

/** Militancy relief weight for sustained comfort fulfillment. PROVISIONAL. */
export const MILITANCY_COMFORT_WEIGHT = 0.25;

/** Militancy relief weight for current luxury fulfillment. PROVISIONAL. */
export const MILITANCY_LUXURY_WEIGHT = 0.1;

/** Daily smoothing toward the militancy target. PROVISIONAL. */
export const MILITANCY_DAILY_SMOOTHING = 0.02;

/** Days scale for militancy needs pressure. PROVISIONAL. */
export const MILITANCY_SCALE_DAYS = 90;

/** Mortality multiplier added at saturated unmet subsistence. PROVISIONAL. */
export const MORTALITY_SUBSISTENCE_WEIGHT = 1.5;

/** Mortality multiplier added at saturated unmet basic needs. PROVISIONAL. */
export const MORTALITY_BASIC_WEIGHT = 0.75;

/** Days scale for unmet-needs mortality pressure. PROVISIONAL. */
export const MORTALITY_SCALE_DAYS = 90;

/** Canonical needs-tier evaluation order. */
export const NEED_TIER_ORDER = ["subsistence", "basic", "comfort", "luxury"] as const;

/** Four needs tiers defined by the GDD. */
export type NeedTier = (typeof NEED_TIER_ORDER)[number];
