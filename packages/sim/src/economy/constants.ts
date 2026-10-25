/** M3 economy constants. All behavioral coefficients live in data. */

/** Maximum number of recent journal postings retained for diagnostics. */
export const MAX_AUDIT_POSTINGS = 256;

/** M3 excludes non-storable service output; services are deferred. */
export const M3_DEFERRED_GOOD_KEYS = ["services"] as const;
