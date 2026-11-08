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

// The M2 unmet-needs mortality terms (subsistence 1.5, basic 0.75 over 90 days) were
// replaced in P4 by the calorie-based food factor (D-142); see FOOD_MORTALITY_WEIGHT_*.

/** Canonical needs-tier evaluation order. */
export const NEED_TIER_ORDER = ["subsistence", "basic", "comfort", "luxury"] as const;

/** Four needs tiers defined by the GDD. */
export type NeedTier = (typeof NEED_TIER_ORDER)[number];

// ---------------------------------------------------------------------------
// P4 cause-driven demography (D-124, D-142). Every coefficient is PROVISIONAL
// until P15 calibrates it against WPP 1950–2000 (a validation target, never an
// input). Rates are annual unless stated; levels are dimensionless multipliers
// of the WPP 1950 world standard schedule (the age *pattern*).
// ---------------------------------------------------------------------------

/**
 * Fertility: elasticity of ln(TFR) to the literacy share of women aged 15–49
 * (dimensionless share 0..1; literacy is not sex-specific yet, D-142 §4).
 * exp(−0.6) ≈ 0.55: an illiterate-to-literate shift alone almost halves TFR,
 * inside the range of cross-country female-education gradients (Bongaarts 2003,
 * Cleland 2002: completed fertility of women with secondary schooling roughly half
 * that of women without schooling). PROVISIONAL. Monthly.
 */
export const FERTILITY_LITERACY_COEFFICIENT = 0.6;

/**
 * Fertility: fractional TFR reduction of the urban share of a block, 0..1.
 * Urban marital fertility in Europe c. 1900 was about 20–30% below rural
 * (Princeton European Fertility Project; Knodel 1974, Sharlin 1986). PROVISIONAL.
 */
export const FERTILITY_URBAN_DISCOUNT = 0.25;

/**
 * Fertility: elasticity of TFR to household income relative to the subsistence
 * basket (quantity–quality trade-off, Becker 1960/1991; cross-country log-income
 * gradients of about −0.1 to −0.3 once education is controlled). Negative effect:
 * TFR × ratio^−0.1. PROVISIONAL. Monthly.
 */
export const FERTILITY_INCOME_ELASTICITY = 0.1;

/**
 * Validity range of the income ratio (income ÷ subsistence cost, dimensionless) in
 * the fertility term. The ratio comes from the smoothed wealth indicator, whose
 * 0..99 range already bounds it to 0.61..85; the narrower range keeps the
 * elasticity inside the income span it was taken from. It is a model domain, not a
 * conservation repair.
 */
export const FERTILITY_INCOME_RATIO_MIN = 0.25;
export const FERTILITY_INCOME_RATIO_MAX = 40;

/**
 * Fertility: elasticity of TFR to lagged child mortality (child-replacement and
 * insurance effects; Schultz 1997, Doepke 2005: elasticities 0.2–0.5). Applied to
 * the smoothed child-mortality multiplier. PROVISIONAL.
 */
export const FERTILITY_CHILD_MORTALITY_ELASTICITY = 0.35;

/**
 * Mean lag of the child mortality that parents respond to, months. Exponential
 * smoothing of the block's effective child-mortality multiplier at each month start:
 * lagged += (current − lagged) / 60. Five years matches the observed delay between
 * the fall of child mortality and the onset of fertility decline (Chesnais 1992).
 * PROVISIONAL.
 */
export const CHILD_MORTALITY_LAG_MONTHS = 60;

/**
 * Upper bound of the summed `contraception` technology effects, as a fractional
 * TFR reduction. Keeps the factor positive whatever technology content is
 * authored. PROVISIONAL.
 */
export const CONTRACEPTION_MAX_REDUCTION = 0.6;

/**
 * Mortality: elasticity of child (0–4) mortality to the combined health factor
 * (technology × public health × hours, M9/E5). Child mortality fell faster than
 * adult mortality under sanitation, vaccination and medicine (Preston 1975;
 * Cutler & Miller 2005), so the child level takes the factor to the power 1.5 and
 * the adult level to the power 1. PROVISIONAL. Daily.
 */
export const MORTALITY_CHILD_HEALTH_ELASTICITY = 1.5;

/**
 * Mortality: excess death rate of the urban population before sanitation, as a
 * fraction of the rural rate (the 19th-century urban penalty: urban infant and
 * child mortality 40–60% above rural, adult mortality 20–40%; Woods 2003,
 * Kearns 1988). Removed in proportion to the country's sanitation coverage.
 * PROVISIONAL. Monthly.
 */
export const URBAN_MORTALITY_PENALTY_CHILD = 0.5;
export const URBAN_MORTALITY_PENALTY_ADULT = 0.3;

/**
 * Dietary energy that counts as full food sufficiency, kcal per person per day.
 * FAO minimum dietary energy requirements for populations with young age
 * structures and small adult body size lie between about 1,800 and 2,000 kcal
 * (FAO/WHO/UNU 2004; FAO 2008 MDER). The subsistence basket of the 1900 data
 * provides 1,966 kcal, so a fully supplied basket counts as sufficient.
 * PROVISIONAL.
 */
export const FOOD_REQUIREMENT_KCAL_PER_PERSON_PER_DAY = 1950;

/**
 * Smoothing time of the block's food sufficiency, days: sufficiency +=
 * (today − sufficiency) / 30. Mortality responds to sustained under-nutrition
 * over weeks, not to one day's market. PROVISIONAL. Daily.
 */
export const FOOD_SUFFICIENCY_SMOOTHING_DAYS = 30;

/**
 * Mortality: increase of the child and adult death rates per unit of food
 * shortfall (1 − sufficiency). At half the required calories child mortality is
 * 2.5× and adult mortality 1.75× the fed rate; recorded famines doubled to
 * tripled crude death rates (Ó Gráda 2009). Replaces the M2 unmet-days terms.
 * PROVISIONAL. Daily.
 */
export const FOOD_MORTALITY_WEIGHT_CHILD = 3;
export const FOOD_MORTALITY_WEIGHT_ADULT = 1.5;

/**
 * Fertility: fractional fall of births per unit of food shortfall (1 − sufficiency).
 * Famines lower births through amenorrhoea, foetal loss and postponed marriage:
 * births fell by roughly a third to a half in the major 20th-century famines at
 * calorie deficits of 30–50 % (Ó Gráda 2009; Ashton et al. 1984; Razzaque 1988).
 * At half the required calories births fall by 40 %. Not in D-124's list of
 * fertility causes; added because without it the lagged child-mortality term would
 * raise fertility during a famine (D-142). PROVISIONAL. Daily.
 */
export const FOOD_FERTILITY_WEIGHT = 0.8;

/**
 * The smoothed lagged child mortality and food sufficiency are stored at
 * `RATE_DECIMAL_PLACES`, like other stored rates, which keeps saves small (D-142);
 * the rounding is part of the deterministic update. Residuals keep full precision so
 * a sourced level is reproduced exactly.
 */

/**
 * Natural-fertility saturation of the fertility level (D-144, amending D-142 §2).
 * Dimensionless multipliers of the standard ASFR (TFR 4.83). The causal product
 * raw = residual × F(causes) passes unchanged up to the knee; above it the level
 * approaches the cap smoothly:
 *   level = KNEE + (CAP − KNEE) × tanh((raw − KNEE) / (CAP − KNEE)),
 * continuous with slope 1 at the knee and strictly increasing, so a rising cause still
 * raises fertility, saturating as real populations do.
 * - KNEE 1.7 ≈ 8.2 children per woman: the upper range of natural-fertility
 *   populations (no parity-specific control; Henry 1961). Every sourced 1900 province
 *   level is ≤ 1.667, so the 1900 calibration is untouched.
 * - CAP 2.3 ≈ 11.1 children per woman: the top of the Hutterite range of 1921–1950
 *   (about 10–11 children per woman), the highest fertility recorded in a whole
 *   population (Eaton & Mayer 1953), with headroom for its upper estimates; still
 *   well below total fecundity, about 15.3 (Bongaarts 1978). Set to 2.3 by the
 *   designer (first draft 2.2 ≈ 10.6; D-144).
 * The saturation is applied wherever the level is derived and never stored.
 * PROVISIONAL (P15 calibration).
 */
export const FERTILITY_NATURAL_KNEE = 1.7;
export const FERTILITY_NATURAL_CAP = 2.3;

/**
 * Validated range of the fertility level (multiplier of the standard ASFR) and of
 * the mortality levels (multipliers of the standard death rates). Values outside
 * are impossible states and are rejected, never clamped. Since D-144 a fertility
 * level derived from causes stays below `FERTILITY_NATURAL_CAP`, so
 * `FERTILITY_LEVEL_MAX` is unreachable through causes and remains only the
 * impossible-state bound of validation (e.g. of sourced data).
 */
export const FERTILITY_LEVEL_MAX = 4;
export const MORTALITY_LEVEL_MIN = 1e-4;
export const MORTALITY_LEVEL_MAX = 50;

/** Last age band (0-based, five-year) counted as child mortality: 0–4. */
export const CHILD_MORTALITY_BAND = 0;

// ---------------------------------------------------------------------------
// P6 (D-153): Engel demand, saving and housing. Every value below is read only by
// worlds whose population definitions carry a demand system; legacy tier worlds are
// unaffected (plan Q9a).
// ---------------------------------------------------------------------------

/**
 * Atwater's dietary scale (USDA Farmers' Bulletin 142, "Principles of nutrition and
 * nutritive value of food", pp. 33–34; public domain): the food a person needs as a
 * fraction of a man at moderately active work. Used as the adult-equivalent scale of
 * household demand (plan Q14). Index = single year of age 0..80 (80 = 80+). Men 17+
 * and women 17+ take the "moderately active" factors (1.0 and 0.8); the bulletin
 * gives no old-age factor, so the elderly keep the adult values. SOURCED.
 */
export const ADULT_EQUIVALENT_MALE_BY_AGE: readonly number[] = Array.from({ length: 81 }, (_, age) =>
  age < 2 ? 0.3 : age < 6 ? 0.4 : age < 10 ? 0.5 : age < 12 ? 0.6 : age < 13 ? 0.7 : age < 15 ? 0.8 : age < 17 ? 0.9 : 1,
);
export const ADULT_EQUIVALENT_FEMALE_BY_AGE: readonly number[] = Array.from({ length: 81 }, (_, age) =>
  age < 2 ? 0.3 : age < 6 ? 0.4 : age < 10 ? 0.5 : age < 13 ? 0.6 : age < 15 ? 0.7 : 0.8,
);

/**
 * Household income is smoothed over a year before the demand system reads it
 * (permanent income; plan Q15): smoothed += (today − smoothed) / 365. A good or bad
 * harvest therefore moves cash (saving or dissaving) before it moves the spending
 * pattern. Days; PROVISIONAL. Daily.
 */
export const INCOME_SMOOTHING_DAYS = 365;

/**
 * Market prices are smoothed over 30 days before households read them (plan Q15):
 * smoothed += (today − smoothed) / 30. Households react to sustained price changes,
 * not to one day's clearing price. Days; PROVISIONAL. Daily.
 */
export const DEMAND_PRICE_SMOOTHING_DAYS = 30;

/**
 * Marginal propensity to consume out of supernumerary income (income above the
 * committed cost), by profession stratum; 1 − μ is saved (extended LES, Lluch 1973;
 * plan Q8). Dimensionless 0..1.
 * - lower 0.94: the 1901 survey's 11,156 normal wage-earner families spent 94.90 %
 *   of income (surplus 5.10 %; Commissioner of Labor 1903, p. 96) at a mean income of
 *   about 651 USD a family against a committed cost of about 96 USD a family at 1901
 *   retail prices: 1 − 0.051 × 651 ÷ (651 − 96) = 0.94. CALIBRATED (one survey).
 * - middle 0.85 and upper 0.60: no 1900 source by class was found (the Historical
 *   Statistics saving series begin in 1929); top income groups saved a far larger
 *   share of income than wage earners. PROVISIONAL.
 */
export const MARGINAL_PROPENSITY_TO_CONSUME = { lower: 0.94, middle: 0.85, upper: 0.6 } as const;

/**
 * Consumption out of financial wealth: each day a household may spend
 * `WEALTH_CONSUMPTION_RATE_PER_YEAR` ÷ days in year of its cash above the reserve, on
 * top of its income (life-cycle propensities to consume out of wealth of about
 * 0.03–0.06 a year). It keeps blocks without a wage consuming from their savings and
 * bounds idle cash: cash levels off where this drawdown equals saving less dwelling
 * purchases. Per year; PROVISIONAL.
 */
export const WEALTH_CONSUMPTION_RATE_PER_YEAR = 0.04;

/**
 * Cash a household keeps before drawing down wealth or buying dwellings: this many
 * days of its committed spending. Days; PROVISIONAL.
 */
export const CASH_RESERVE_DAYS = 30;

/**
 * Housing (plan §4): annual depreciation of the dwelling stock. US non-farm starts
 * 1890–1899 (Historical Statistics, series N 156: 2,941,000) about equal the census
 * increase of dwellings 1890–1900 (11.48 M → 14.43 M, Webb 1911), so removals were
 * small; farm building is not in the series, so the rate lies between 0 and the BEA
 * rate for one-to-four-unit residential structures (about 1.1 %). Per year;
 * PROVISIONAL. Daily (rate ÷ days in year).
 */
export const DWELLING_DEPRECIATION_RATE_PER_YEAR = 0.005;

/**
 * Income elasticity of dwellings per person: desired dwellings per person rise with
 * smoothed real income as income^ε. US persons per dwelling fell from 5.3 (1900 census,
 * Webb 1911) to about 2.63 per occupied unit (1990) while real GDP per head rose 4.60
 * times (Maddison Project 2023: 8,038 → 36,982): ε = ln(5.3 / 2.63) ÷ ln 4.60 = 0.46.
 * Dimensionless; CALIBRATED (one country, 1990 figure to be confirmed).
 */
export const DWELLING_INCOME_ELASTICITY = 0.46;

/**
 * A household closes the gap between its desired and actual dwellings over this many
 * days (building takes time and is paid from saving). Days; PROVISIONAL. Daily.
 */
export const HOUSING_ADJUSTMENT_DAYS = 365;

/**
 * Crowding (persons per dwelling ÷ the block's 1900 persons per dwelling) above which
 * the mortality and unrest terms stop growing: a model domain for a block with almost
 * no dwellings, not a conservation repair. Dimensionless; PROVISIONAL.
 */
export const CROWDING_MAX = 3;

/**
 * Mortality: increase of the child and adult death rates per unit of crowding above
 * the 1900 level (plan Q7a; only worse-than-1900 housing counts). Order of magnitude
 * from Glasgow, where the one- and two-room districts had a death rate of 38 per 1,000
 * and one infant in five died, against a city rate in the mid-20s (Russell, "Life in
 * One Room", 1888; public domain). PROVISIONAL. Daily.
 */
export const CROWDING_MORTALITY_WEIGHT_CHILD = 0.5;
export const CROWDING_MORTALITY_WEIGHT_ADULT = 0.3;
