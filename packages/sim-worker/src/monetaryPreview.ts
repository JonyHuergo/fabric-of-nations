/**
 * E6b monetary and price-measurement previews.
 *
 * These are presentation estimates derived from an immutable snapshot, never
 * authoritative forecasts: the worker recomputes reserves, valuation, cover, and
 * postings from live state when the action is applied. The UI must label them as
 * estimates. RUSD is a fixed unit of measurement; the price index is a derived measure
 * and no preview converts an RUSD amount twice.
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
  /** RUSD per one currency unit after the proposal; estimate. */
  readonly projectedValuationRusdPerUnit: number | null;
  /** Estimated reserves after the proposed treasury transfer. */
  readonly projectedReservesRUSD: number;
  /** Estimated currency liability after the proposed conversion/revaluation. */
  readonly projectedLiabilityRUSD: number;
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
    readonly parityRusdPerUnit: number | null;
    readonly reserveTransferRUSD: number;
    readonly currencyConversionRUSD: number;
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
    proposed.parityRusdPerUnit !== null &&
    (!finite(proposed.parityRusdPerUnit) || proposed.parityRusdPerUnit <= 0)
  ) {
    errors.push("The parity must be a positive RUSD-per-unit value or unchanged.");
  }
  if (!finite(proposed.reserveTransferRUSD)) {
    errors.push("The reserve transfer must be a finite amount.");
  }
  if (!finite(proposed.currencyConversionRUSD)) {
    errors.push("The currency conversion must be a finite amount.");
  }
  if (proposed.regime === "managed" && proposed.parityRusdPerUnit !== null) {
    errors.push("A managed regime's rate is rule-driven; a parity may only be set under a peg.");
  }

  const valuation =
    proposed.parityRusdPerUnit ??
    state.valuationRusdPerUnit ??
    state.parityRusdPerUnit;
  const reserves = state.reserveCashRUSD + proposed.reserveTransferRUSD;
  const unitsBefore = state.currencyIssuedUnits;
  let units = unitsBefore;
  let liability = state.liabilityRUSD;
  if (valuation !== null && valuation > 0 && reserves >= 0) {
    if (proposed.currencyConversionRUSD !== 0) {
      units += proposed.currencyConversionRUSD / valuation;
    }
    liability = units * valuation;
  }
  const coverMonths =
    state.lastMonthImportsRUSD > 0 && reserves >= 0
      ? reserves / state.lastMonthImportsRUSD
      : null;
  const notes = [
    "Estimates use observed state only; the worker recomputes the operation and its balanced postings atomically.",
    "The RUSD valuation is RUSD per one currency unit. Domestic accounts remain RUSD; trade is not converted.",
    "Reserve cover below the documented minimum suspends convertibility and blocks imports into this country's market.",
    "A currency law is required for the managed regime and must be enacted through the Politics path.",
  ];
  return {
    valid: errors.length === 0,
    errors,
    currencyId: null,
    projectedValuationRusdPerUnit: valuation,
    projectedReservesRUSD: reserves,
    projectedLiabilityRUSD: liability,
    projectedCoverMonths: coverMonths,
    projectedUnits: units,
    notes,
  };
}

/** D-140 / D-150: what adopting another currency will do (an estimate from the snapshot). */
export interface AdoptCurrencyPreview {
  readonly valid: boolean;
  readonly errors: readonly string[];
  /** Circulation redeemed at the current valuation, RUSD. */
  readonly redeemedRUSD: number;
  /** The authority's reserve cash returned to the treasury now, RUSD. */
  readonly reserveCashToTreasuryRUSD: number;
  /** Metal the closed authority will sell off in its home market, kg fine. */
  readonly metalToSellKg: number;
  readonly notes: readonly string[];
}

export function previewAdoptCurrency(
  snapshot: SimulationSnapshot,
  country: CountrySnapshot,
  currencyId: number,
): AdoptCurrencyPreview {
  const errors: string[] = [];
  const state: SnapshotMonetaryAuthority = country.monetary;
  if (snapshot.playerCountryId !== country.id) errors.push("Only the player-controlled country may change its currency.");
  if (country.monetaryArrangement !== "own") errors.push("This country already uses another country's currency.");
  if (currencyId === country.currencyId) errors.push("Choose a currency other than your own.");
  const notes = [
    "Your currency leaves use: its circulation is redeemed at today's value.",
    "The reserve's cash returns to the treasury at once.",
  ];
  if (state.metalReserveKg > 0) notes.push("The reserve's metal is sold in your home market over the following weeks; the proceeds go to the treasury.");
  return {
    valid: errors.length === 0,
    errors,
    redeemedRUSD: state.active ? state.liabilityRUSD : 0,
    reserveCashToTreasuryRUSD: state.reserveCashRUSD,
    metalToSellKg: state.metalReserveKg,
    notes,
  };
}

/** D-140 / D-150: what establishing an own currency will do (an estimate). */
export interface EstablishCurrencyPreview {
  readonly valid: boolean;
  readonly errors: readonly string[];
  /** The new unit's value, RUSD per unit: the value of the currency in use. */
  readonly valuationRusdPerUnit: number | null;
  readonly treasuryAfterRUSD: number;
  readonly notes: readonly string[];
}

export function previewEstablishCurrency(
  snapshot: SimulationSnapshot,
  country: CountrySnapshot,
  proposed: { readonly standard: "gold" | "silver" | "paper"; readonly reserveFundingRUSD: number },
): EstablishCurrencyPreview {
  const errors: string[] = [];
  if (snapshot.playerCountryId !== country.id) errors.push("Only the player-controlled country may change its currency.");
  if (country.monetaryArrangement !== "adopted") errors.push("This country already issues its own currency.");
  if (!finite(proposed.reserveFundingRUSD) || proposed.reserveFundingRUSD < 0) errors.push("The reserve funding must be zero or more.");
  else if (proposed.reserveFundingRUSD > country.treasuryCashRUSD) errors.push("The reserve funding exceeds the treasury's cash.");
  const valuation = snapshot.currencies?.find((currency) => currency.id === country.currencyId)?.rusdPerUnit ?? null;
  const notes = ["The new unit starts at the value of the currency you use now; nothing circulates at first."];
  if (proposed.standard !== "paper") notes.push(`Its ${proposed.standard} content is set from today's ${proposed.standard} price; it becomes convertible once the mint holds ${proposed.standard}.`);
  return {
    valid: errors.length === 0,
    errors,
    valuationRusdPerUnit: valuation,
    treasuryAfterRUSD: Math.max(0, country.treasuryCashRUSD - (finite(proposed.reserveFundingRUSD) ? proposed.reserveFundingRUSD : 0)),
    notes,
  };
}
