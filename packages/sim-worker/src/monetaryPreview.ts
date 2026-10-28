/**
 * E6b monetary and price-measurement previews.
 *
 * These are presentation estimates derived from an immutable snapshot, never
 * authoritative forecasts: the worker recomputes reserves, valuation, cover, and
 * postings from live state when the action is applied. The UI must label them as
 * estimates. SUSD is a fixed unit of measurement; the price index is a derived measure
 * and no preview converts an SUSD amount twice.
 */

import type {
  CountrySnapshot,
  SimulationSnapshot,
  SnapshotMonetaryAuthority,
} from "./protocol.js";

export interface MonetaryPolicyPreview {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly currencyId: number | null;
  /** SUSD per one currency unit after the proposal; estimate. */
  readonly projectedValuationSusdPerUnit: number | null;
  /** Estimated reserves after the proposed treasury transfer. */
  readonly projectedReservesSUSD: number;
  /** Estimated currency liability after the proposed conversion/revaluation. */
  readonly projectedLiabilitySUSD: number;
  /** Estimated reserve cover in months of last month's imports; null when no imports. */
  readonly projectedCoverMonths: number | null;
  /** Estimated units issued after the conversion. */
  readonly projectedUnits: number;
  readonly notes: readonly string[];
}

function finite(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Estimate the direct effect of a proposed monetary operation from observed state.
 * It does not model future trade, price changes, or the managed rule's path.
 */
export function previewMonetaryPolicy(
  snapshot: SimulationSnapshot,
  country: CountrySnapshot,
  proposed: {
    readonly regime: "pegged" | "managed";
    readonly paritySusdPerUnit: number | null;
    readonly reserveTransferSUSD: number;
    readonly currencyConversionSUSD: number;
  },
): MonetaryPolicyPreview {
  const errors: string[] = [];
  const state: SnapshotMonetaryAuthority = country.monetary;
  if (snapshot.playerCountryId !== country.id) {
    errors.push("Only the player-controlled country may change monetary policy.");
  }
  if (!state.hasAuthority) {
    errors.push(
      state.blockedReason === "adopted-or-shared-currency"
        ? "This country adopts or shares another currency; it has no independent monetary authority."
        : "The monetary system is not enabled in this campaign.",
    );
  }
  if (proposed.regime !== "pegged" && proposed.regime !== "managed") {
    errors.push("The monetary regime must be pegged or managed.");
  }
  if (
    proposed.paritySusdPerUnit !== null &&
    (!finite(proposed.paritySusdPerUnit) || proposed.paritySusdPerUnit <= 0)
  ) {
    errors.push("The parity must be a positive SUSD-per-unit value or unchanged.");
  }
  if (!finite(proposed.reserveTransferSUSD)) {
    errors.push("The reserve transfer must be a finite SUSD amount.");
  }
  if (!finite(proposed.currencyConversionSUSD)) {
    errors.push("The currency conversion must be a finite SUSD amount.");
  }
  if (proposed.regime === "managed" && proposed.paritySusdPerUnit !== null) {
    errors.push("A managed regime's rate is rule-driven; a parity may only be set under a peg.");
  }

  const valuation =
    proposed.paritySusdPerUnit ??
    state.valuationSusdPerUnit ??
    state.paritySusdPerUnit;
  const reserves = state.reserveCashSUSD + proposed.reserveTransferSUSD;
  const unitsBefore = state.currencyIssuedUnits;
  let units = unitsBefore;
  let liability = state.liabilitySUSD;
  if (valuation !== null && valuation > 0 && reserves >= 0) {
    if (proposed.currencyConversionSUSD !== 0) {
      units += proposed.currencyConversionSUSD / valuation;
    }
    liability = units * valuation;
  }
  const coverMonths =
    state.lastMonthImportsSUSD > 0 && reserves >= 0
      ? reserves / state.lastMonthImportsSUSD
      : null;
  const notes = [
    "Estimates use observed state only; the worker recomputes the operation and its balanced postings atomically.",
    "The SUSD valuation is SUSD per one currency unit. Domestic accounts remain SUSD; trade is not converted.",
    "Reserve cover below the documented minimum suspends convertibility and blocks imports into this country's market.",
    "A currency law is required for the managed regime and must be enacted through the Politics path.",
  ];
  return {
    valid: errors.length === 0,
    errors,
    currencyId: null,
    projectedValuationSusdPerUnit: valuation,
    projectedReservesSUSD: reserves,
    projectedLiabilitySUSD: liability,
    projectedCoverMonths: coverMonths,
    projectedUnits: units,
    notes,
  };
}
