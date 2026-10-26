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

/**
 * M5b public-debt defaults and numeric-safety bounds. PROVISIONAL.
 *
 * Disabled for legacy fixtures. A disabled policy still permits servicing any
 * existing contracts but never originates new debt.
 */
export const DEFAULT_DEBT_POLICY: Readonly<{
  enabled: boolean;
  creditorKind: "country" | "popBlock";
  creditorId: number;
  annualCouponRate: number;
  termDays: number;
  maxOutstandingPrincipalSUSD: number;
  refinanceOnMaturity: boolean;
  arrearsGraceDays: number;
}> = {
  enabled: false,
  creditorKind: "country",
  creditorId: 0,
  annualCouponRate: 0.03,
  termDays: 1825,
  maxOutstandingPrincipalSUSD: 0,
  refinanceOnMaturity: false,
  arrearsGraceDays: 90,
};

export const MIN_DEBT_COUPON_RATE = 0;
export const MAX_DEBT_COUPON_RATE = 1;
export const MIN_DEBT_TERM_DAYS = 1;
export const MAX_DEBT_TERM_DAYS = 36_500;
export const MAX_DEBT_ARREARS_GRACE_DAYS = 3_650;
export const MAX_DEBT_PRINCIPAL_SUSD = 1e15;

/**
 * M6 country-AI v1 constants. PROVISIONAL policy rules, not calibrated
 * economics. Every rule is deterministic and uses only own-country or public
 * state.
 *
 * Evaluation cadence: each country evaluates at the start of a day every
 * `AI_EVALUATION_PERIOD_DAYS` days. The first evaluation is the first day after
 * the scenario start whose absolute day index is congruent to the stable country
 * id, so all eight sample countries spread across the week.
 *
 * Fiscal targets:
 * - `AI_TREASURY_BUFFER_MONTHS` is the treasury-cash reserve target measured in
 *   months of observed annual outlays (welfare budget plus interest expense).
 * - `AI_WELFARE_REVENUE_SHARE` is the share of annualized income-tax revenue the
 *   AI is willing to commit to welfare. Treasury reserves are a solvency buffer,
 *   not an ongoing spending target in v1; this keeps the welfare target stable
 *   once revenue is observed instead of chasing a growing surplus.
 * - `AI_HARDSHIP_SUBSISTENCE_DAYS` is the consecutive-unmet-subsistence run that
 *   marks a population block as in hardship.
 * - `AI_HARDSHIP_POPULATION_SHARE` is the population share in hardship that
 *   triggers the relief goal.
 * - `AI_UNREST_MILITANCY_THRESHOLD` is the population-weighted militancy level
 *   that triggers the relief goal even when the population share is lower.
 * - `AI_HARDSHIP_MIN_TAX_RATE` is the provisional minimum income-tax rate used
 *   to fund relief; `AI_MAX_TAX_RATE` is the AI's provisional self-imposed cap
 *   (below the hard fiscal validation bound); `AI_TAX_STEP` is the per-evaluation
 *   increase while solvency pressure persists.
 * - `AI_POLICY_RATE_EPSILON` and `AI_POLICY_MONEY_EPSILON` suppress actions that
 *   would only rewrite the policy with floating-point noise.
 * - `AI_WELFARE_ADJUSTMENT_RELATIVE_THRESHOLD` is the minimum relative change in
 *   the welfare target that justifies a new action. It prevents weekly
 *   month-to-month revenue noise from producing an action every evaluation while
 *   still tracking sustained changes.
 */
export const AI_EVALUATION_PERIOD_DAYS = 7;
export const AI_TREASURY_BUFFER_MONTHS = 6;
export const AI_WELFARE_REVENUE_SHARE = 0.25;
export const AI_HARDSHIP_SUBSISTENCE_DAYS = 7;
export const AI_HARDSHIP_POPULATION_SHARE = 0.05;
export const AI_UNREST_MILITANCY_THRESHOLD = 0.15;
export const AI_HARDSHIP_MIN_TAX_RATE = 0.05;
export const AI_MAX_TAX_RATE = 0.25;
export const AI_TAX_STEP = 0.01;
export const AI_POLICY_RATE_EPSILON = 1e-9;
export const AI_POLICY_MONEY_EPSILON = 0.01;
export const AI_WELFARE_ADJUSTMENT_RELATIVE_THRESHOLD = 0.1;
export const AI_TAX_RATE_DECIMALS = 6;
export const AI_MONEY_DECIMALS = 2;
export const MAX_AI_ACTION_SUMMARY_LENGTH = 500;
export const DEFAULT_COUNTRY_AI_ENABLED = false;
