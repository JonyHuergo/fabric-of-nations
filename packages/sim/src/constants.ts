/**
 * Simulation-wide constants.
 *
 * All values here are binding limits or M1 defaults, not tuning coefficients.
 * Tuning coefficients belong in the future calibrated constants module and must
 * carry documented units in the milestone that introduces them.
 */

/**
 * Version of the simulation behavior. A save is only compatible with the same
 * version.
 *
 * M5 adds multi-region/multi-market state semantics, the country
 * `immigrationOpen` policy field, migration, and geographic labor access. M5a
 * adds the persisted profit-allocation policy and retained-profit accounts.
 * M6 adds the country-AI enable policy, fixed-size per-country AI state, and
 * validated player/AI fiscal-policy actions. E2 adds the extended fiscal
 * schedule/eligibility/business-tax/reserve policy, the public-budget memo, and
 * the debt issuance/repayment/debt-policy actions. E3 adds public-construction
 * projects, idle-labor hiring, construction capitalization, completion into
 * state-owned buildings, and E4 materials/procurement, sectoral subsidies, and
 * public-enterprise capital support. M9 adds per-country technology/research and
 * education state, the derived age-specific literacy array, and the validated
 * research/education actions. E5 adds vocational qualification/training and
 * public-health allocation state, training payroll/stipend, and the labor/health
 * policy actions.
 */
export const SIM_VERSION = "0.23.0";

/**
 * Version of the serialized world schema. M5 added `Country.immigrationOpen`;
 * M5a adds `World.profitDistribution` and building retained-profit accounts.
 * M6 adds `World.countryAI` and `Country.ai`. Batch 3 adds compacted monthly
 * summary fiscal totals and changes the canonical history retained (D-065).
 * Batch 4 adds debt history aggregates, welfare-request memos, and bounded debt
 * contract storage (D-066). M7a adds annual finance summaries, controlled
 * correction records, and their allocators (D-072). E2 adds the extended fiscal
 * policy, per-period and annual budget totals, business-tax accounts, and the
 * month-to-date budget memo (D-073). E3 adds the construction project queue,
 * work-in-progress/public-capital accounts, construction posting kinds, and the
 * construction budget memo fields (D-074). E4 adds construction material requirements,
 * per-country industrial policy, subsidy/support budget fields, and the new
 * industrial posting kinds (D-075). M8 adds country regime/laws/transitions/
 * interest-groups/institutions, regional unrest/infrastructure, world politics
 * event state, and administration payroll accounts (D-076). M9 adds per-country
 * technology/research and education state, world technology enablement, the
 * age-specific literacy array, and education payroll accounts (D-077). E5 adds
 * per-country labor/training and health-share state, block qualification, the
 * training payroll/stipend posting kinds, and the labor/health law fields (D-078).
 */
export const WORLD_SCHEMA_VERSION = 23;

/** Version of the save envelope itself. */
export const SAVE_FORMAT_VERSION = 1;

/**
 * Content/data version. M4a-2/M4b/M4c add runtime state but ship no new
 * scenario data, so the data package version stays `m3-economy-v1`. M5 ships
 * additional historical scenario content but changes no existing definition or
 * scenario meaning, so the version remains stable (D-053). M5a adds a
 * scenario-provided policy and account role but does not change existing
 * definition/scenario meanings, so it also remains stable (D-056). M6 adds a
 * scenario-provided AI enable policy without changing existing definitions, so
 * it remains stable (D-058). E3 changes the authored building definitions (public
 * ownership permission and construction crew) and therefore bumps the content
 * version to `m3-economy-v4` (D-074). E4 adds an explicit building sector and
 * construction-material requirements, so it bumps the content version to
 * `m3-economy-v5` (D-075). M8 adds political content definitions and scenario
 * regime/law/funding state, so it bumps the content version to
 * `m3-economy-v6` (D-076). M9 adds technology content definitions, research and
 * education scenario inputs, an academics profession, and technology-gated
 * building definitions, so it bumps the content version to `m3-economy-v7`
 * (D-077). E5 adds health/minimum-wage/hours law definitions, so it bumps the
 * content version to `m3-economy-v8` (D-078).
 */
export const DEFAULT_DATA_VERSION = "m3-economy-v8";

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
