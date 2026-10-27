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

/**
 * Number of most recent monthly summaries that retain the full pre-close trial
 * balance. Older summaries retain period dates, the four gross flow totals, and
 * per-country fiscal totals, but not the account-level trial balance (D-065).
 * Twelve matches the Ledger snapshot window and keeps canonical saves bounded.
 */
export const MAX_DETAILED_PERIOD_SUMMARIES = 12;

/**
 * Maximum annual summaries retained. Derivation: 1900..1999 inclusive = 100
 * campaign years. The first year may be partial; 2000-01-01 is terminal and is
 * never closed as a year.
 */
export const MAX_ANNUAL_SUMMARIES = 100;

/** Maximum controlled correction records retained for audit. */
export const MAX_FINANCE_CORRECTIONS = 64;

/** Maximum accepted correction reason length. */
export const MAX_CORRECTION_REASON_LENGTH = 500;

/** M3 excludes non-storable service output; services are deferred. */
export const M3_DEFERRED_GOOD_KEYS = ["services"] as const;

/**
 * M4c/E2 fiscal numeric-safety bounds. These are validation limits, not
 * calibrated economics: a tax rate is dimensionless in [0, 1], a budget,
 * exemption, or reserve target is a finite nominal SUSD amount below the
 * documented safe bound, and the welfare wealth ceiling is a population wealth
 * level (0..99, where 99 covers every block and is therefore universal).
 */
export const MIN_FISCAL_TAX_RATE = 0;
export const MAX_FISCAL_TAX_RATE = 1;
export const MAX_FISCAL_BUDGET_SUSD_PER_YEAR = 1e15;

/** Highest population wealth level; mirrors `WEALTH_MAX` (0..99). */
export const MAX_WELFARE_WEALTH_LEVEL = 99;

/**
 * E2 provisional fiscal-policy defaults. The shipped historical scenario declares
 * only the M4c rate and welfare budget, so every E2 instrument starts neutral:
 * no income-tax exemption, universal welfare eligibility, no business-profit tax,
 * and no treasury reserve floor. A neutral policy preserves the accepted M4c/M5b
 * behavior exactly; the player changes these through validated actions.
 */
export const DEFAULT_INCOME_TAX_ALLOWANCE_SUSD_PER_YEAR = 0;
export const DEFAULT_WELFARE_MAX_WEALTH_LEVEL = MAX_WELFARE_WEALTH_LEVEL;
export const DEFAULT_BUSINESS_PROFIT_TAX_RATE = 0;
export const DEFAULT_RESERVE_TARGET_SUSD = 0;

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

/** Hard cap on simultaneously active/arrears debt contracts. */
export const MAX_ACTIVE_DEBT_CONTRACTS = 64;

/** Number of most recent terminated contracts retained for detailed history. */
export const MAX_RETAINED_TERMINATED_DEBT_CONTRACTS = 32;

/** One aggregate per issuer is expected; this is a defensive storage cap. */
export const MAX_DEBT_HISTORY_AGGREGATES = 256;

/**
 * E3 construction bounds. These are structural safety limits, not tuning.
 *
 * - At most 32 non-terminal construction projects exist at once.
 * - The newest 32 completed/cancelled project records are retained in detail.
 * - Older terminated records are aggregated per country (defensive cap 256).
 * - A completed building is endowed with 30 days of its definition's daily
 *   upkeep as working capital, limited by actual treasury cash. This is
 *   provisional structural content, not calibration.
 */
export const MAX_ACTIVE_CONSTRUCTION_PROJECTS = 32;
export const MAX_RETAINED_TERMINATED_CONSTRUCTION_PROJECTS = 32;
export const MAX_CONSTRUCTION_HISTORY_AGGREGATES = 256;
export const CONSTRUCTION_WORKING_CAPITAL_DAYS = 30;

/**
 * E4 numeric-safety bound for one discretionary public-enterprise capital
 * contribution. This is a structural bound, not a budget target or calibrated
 * policy value; actual affordability remains the country treasury cash balance.
 */
export const MAX_PUBLIC_ENTERPRISE_SUPPORT_SUSD = 1_000_000_000;

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
