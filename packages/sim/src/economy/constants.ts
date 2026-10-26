/** M3 economy constants. Content parameters live in data; code-level rule constants are documented here. */

/** Maximum number of recent journal postings retained for diagnostics. */
export const MAX_AUDIT_POSTINGS = 256;

/**
 * Maximum number of monthly finance summaries for the 100-year campaign.
 *
 * Derivation: 100 calendar years × 12 Gregorian months = 1200 closed periods.
 * The first period may be partial; the terminal 2000-01-01 boundary is never
 * closed, so 1200 is a hard upper bound rather than an expected count.
 */
export const MAX_PERIOD_SUMMARIES = 1200;

/** M3 excludes non-storable service output; services are deferred. */
export const M3_DEFERRED_GOOD_KEYS = ["services"] as const;

/**
 * M4c fiscal numeric-safety bounds. These are validation limits, not calibrated
 * economics: an income-tax rate is dimensionless in [0, 1] and a welfare budget
 * is a finite nominal SUSD/year target below the documented safe bound.
 */
export const MIN_FISCAL_TAX_RATE = 0;
export const MAX_FISCAL_TAX_RATE = 1;
export const MAX_FISCAL_BUDGET_SUSD_PER_YEAR = 1e15;

/**
 * M3d provisional bounded price-update coefficients, not calibrated.
 * imbalance = (funded demand - sellable supply) / max(demand, supply, epsilon).
 * daily change = clamp(kappa * imbalance, -maxDailyChange, +maxDailyChange).
 * Price is clamped to [base*minRatio, base*maxRatio].
 */
export const M3_PRICE_KAPPA = 0.1;
export const M3_PRICE_MAX_DAILY_CHANGE = 0.05;
export const M3_PRICE_EPSILON = 1e-9;
export const M3_PRICE_MIN_RATIO = 0.25;
export const M3_PRICE_MAX_RATIO = 4;

/**
 * M5 migration pressure coefficients. PROVISIONAL, not calibrated.
 *
 * Monthly pressure for one source->destination pair is
 * `vacancyWeight * vacancyRate + wealthWeight * wealthGap`, where vacancyRate is
 * unfilled job slots divided by eligible regional workforce (0..1) and
 * wealthGap is (destination wealth - source wealth) / 100. The weights sum to 1.
 * The monthly migrant fraction of the source population is
 * `clamp(pressure * ratePerPressure, 0, maxFraction)`.
 */
export const MIGRATION_VACANCY_WEIGHT = 0.7;
export const MIGRATION_WEALTH_WEIGHT = 0.3;

/** Fraction of source population that moves per month at pressure 1. PROVISIONAL. */
export const MIGRATION_RATE_PER_PRESSURE = 0.01;

/** Hard monthly cap on the fraction of a source block that may migrate. PROVISIONAL. */
export const MIGRATION_MONTHLY_MAX_FRACTION = 0.01;

/**
 * Provisional absorption/friction cap: a destination region may receive at most
 * this fraction of its own starting-of-month population in one month. This
 * stands in for the transport/housing constraints the GDD describes until those
 * systems exist. PROVISIONAL.
 */
export const MIGRATION_MONTHLY_INFLOW_CAP_FRACTION = 0.01;

/**
 * M5a profit-allocation policy defaults. PROVISIONAL, not calibrated.
 *
 * Legacy M0–M5 scenarios omit the policy and therefore keep it disabled; the M5
 * historical campaign enables it explicitly. `PRIVATE_PAYOUT_RATE` is the
 * fraction of positive retained profit distributed to a private owner each
 * month; `STATE_REMITTANCE_RATE` is the fraction remitted to a country treasury.
 * Both flows are capped by available operating cash and never create money.
 */
export const DEFAULT_PRIVATE_PAYOUT_RATE = 0.5;
export const DEFAULT_STATE_REMITTANCE_RATE = 1;
export const DEFAULT_PROFIT_DISTRIBUTION_ENABLED = false;

/** Numeric-safety bounds for M5a policy rates. */
export const MIN_PROFIT_ALLOCATION_RATE = 0;
export const MAX_PROFIT_ALLOCATION_RATE = 1;
