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
