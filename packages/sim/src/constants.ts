/**
 * Simulation-wide constants.
 *
 * All values here are binding limits or M1 defaults, not tuning coefficients.
 * Tuning coefficients belong in the future calibrated constants module and must
 * carry documented units in the milestone that introduces them.
 */

/** Version of the simulation behavior. A save is only compatible with the same version. */
export const SIM_VERSION = "0.7.0";

/** Version of the serialized world schema. */
export const WORLD_SCHEMA_VERSION = 7;

/** Version of the save envelope itself. */
export const SAVE_FORMAT_VERSION = 1;

/**
 * Content/data version. M4a-2 adds runtime country/currency state but ships no
 * new scenario data, so the data package version stays `m3-economy-v1`.
 */
export const DEFAULT_DATA_VERSION = "m3-economy-v1";

/** Scenario identifier used by a world created without an explicit scenario. */
export const DEFAULT_SCENARIO_ID = "m3-empty";

/** First campaign year. Day index 0 is 1900-01-01. */
export const CAMPAIGN_START_YEAR = 1900;

/** Boundary year. Day index 36,524 is 2000-01-01 and is never processed as a campaign day. */
export const CAMPAIGN_END_YEAR = 2000;

/** First valid day index, corresponding to 1900-01-01. */
export const CAMPAIGN_START_DAY_INDEX = 0;

/**
 * Terminal day index, corresponding to 2000-01-01.
 *
 * Derivation: 100 Gregorian years * 365 days + 24 leap days (1904..1996) = 36,524.
 * 1900 is not a leap year (divisible by 100, not 400) and 2000 is not reached as
 * a processed day because the boundary is exactly 2000-01-01.
 */
export const CAMPAIGN_TERMINAL_DAY_INDEX = 36_524;

/** Number of daily ticks in a complete campaign (indices 0 through 36,523). */
export const CAMPAIGN_TICKS = 36_524;

/** Number of valid day indices, including both the start and the terminal boundary. */
export const VALID_DAY_INDEX_COUNT = 36_525;

/** Maximum number of warning strings retained in diagnostics. */
export const MAX_RECENT_WARNINGS = 32;

/** Maximum accepted length of a random-draw purpose identifier. */
export const MAX_PURPOSE_LENGTH = 128;

/** Maximum accepted length of a scenario identifier. */
export const MAX_SCENARIO_ID_LENGTH = 128;

/** Maximum accepted length of one diagnostic warning. */
export const MAX_WARNING_LENGTH = 500;

/** Prefix used by the save integrity checksum. Non-cryptographic. */
export const SAVE_CHECKSUM_PREFIX = "fnv1a32:";

/**
 * Provisional inclusive bounds for a currency's SUSD valuation. These are
 * numerical safety bounds, not historically calibrated economics.
 */
export const CURRENCY_RATE_MIN = 1e-12;
export const CURRENCY_RATE_MAX = 1e12;

/**
 * Dimensionless relative tolerance for currency valuation and cross-rate
 * comparisons. Money comparisons use the SUSD money tolerance instead.
 */
export const CURRENCY_RATE_RELATIVE_TOLERANCE = 1e-12;

/** Reserved key for the SUSD unit of account; never a registered currency. */
export const SUSD_CURRENCY_KEY = "susd";

/** Maximum accepted length of a registered currency key. */
export const MAX_CURRENCY_KEY_LENGTH = 32;

/** Maximum accepted length of a currency name. */
export const MAX_CURRENCY_NAME_LENGTH = 64;

/** Maximum accepted length of a country tag. */
export const MAX_COUNTRY_TAG_LENGTH = 8;

/** Maximum accepted length of a country name. */
export const MAX_COUNTRY_NAME_LENGTH = 128;

/** Maximum accepted length of an external issuer key. */
export const MAX_FOREIGN_ISSUER_KEY_LENGTH = 64;
