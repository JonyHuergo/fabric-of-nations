/**
 * M4a-2 currency valuation and conversion helpers.
 *
 * Direction convention (never invert it accidentally):
 * - `susdPerUnit` is the SUSD-equivalent value of ONE unit of a currency.
 * - `crossRate(from, to)` returns units of `to` per ONE unit of `from`.
 *
 * SUSD is not a registered currency. There is no `fxToUSD` field, no stored
 * inverse rate, and no default parity. An unavailable or missing valuation is a
 * named error, never a silent substitution.
 */

import {
  CURRENCY_RATE_MAX,
  CURRENCY_RATE_MIN,
  CURRENCY_RATE_RELATIVE_TOLERANCE,
} from "../constants.js";
import type { Id, MoneySUSD } from "../types.js";
import type { CurrencyValuation, SusdPerCurrencyUnit } from "./types.js";

/** Named error for a missing, unavailable, or invalid currency valuation. */
export class CurrencyValuationError extends RangeError {
  public readonly currencyId: Id;
  public readonly reason: "missing" | "unavailable" | "invalid";

  public constructor(currencyId: Id, reason: "missing" | "unavailable" | "invalid") {
    super(`currency ${String(currencyId)} valuation is ${reason}`);
    this.name = "CurrencyValuationError";
    this.currencyId = currencyId;
    this.reason = reason;
  }
}

/**
 * Validate and brand a SUSD-per-currency-unit value.
 * Bounds are provisional numerical safety limits, not historical economics.
 */
export function assertValidSusdPerCurrencyUnit(
  value: unknown,
  path = "susdPerUnit",
): SusdPerCurrencyUnit {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new RangeError(`${path} must be a finite number`);
  }
  if (!(value > 0)) {
    throw new RangeError(`${path} must be strictly positive`);
  }
  if (value < CURRENCY_RATE_MIN || value > CURRENCY_RATE_MAX) {
    throw new RangeError(
      `${path} must be in ${String(CURRENCY_RATE_MIN)}..${String(CURRENCY_RATE_MAX)}, received ${String(value)}`,
    );
  }
  return value as SusdPerCurrencyUnit;
}

/** Construct a validated SUSD-per-currency-unit value. */
export function asSusdPerCurrencyUnit(value: number): SusdPerCurrencyUnit {
  return assertValidSusdPerCurrencyUnit(value);
}

function assertMoneyAmount(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new RangeError(`${path} must be a finite number`);
  }
  if (value < 0) {
    throw new RangeError(`${path} must be non-negative`);
  }
  return value;
}

function assertConversionResult(
  result: number,
  positiveInput: boolean,
  path: string,
): number {
  if (!Number.isFinite(result)) {
    throw new RangeError(`${path} overflowed to a non-finite value`);
  }
  if (positiveInput && result === 0) {
    throw new RangeError(`${path} underflowed to zero for a positive input`);
  }
  return result;
}

/** Convert an amount in currency units to its nominal SUSD value. */
export function susdFromCurrency(
  amount: MoneySUSD,
  rate: SusdPerCurrencyUnit,
): MoneySUSD {
  const value = assertMoneyAmount(amount, "amount");
  const valuation = assertValidSusdPerCurrencyUnit(rate, "susdPerUnit");
  const result = value * valuation;
  return assertConversionResult(result, value > 0, "susdFromCurrency");
}

/** Convert a nominal SUSD amount to units of a currency. */
export function currencyFromSusd(
  amount: MoneySUSD,
  rate: SusdPerCurrencyUnit,
): number {
  const value = assertMoneyAmount(amount, "amount");
  const valuation = assertValidSusdPerCurrencyUnit(rate, "susdPerUnit");
  const result = value / valuation;
  return assertConversionResult(result, value > 0, "currencyFromSusd");
}

/**
 * Units of `to` per ONE unit of `from`:
 * `crossRate(from, to) = from.susdPerUnit / to.susdPerUnit`.
 */
export function crossRate(from: SusdPerCurrencyUnit, to: SusdPerCurrencyUnit): number {
  const fromRate = assertValidSusdPerCurrencyUnit(from, "from.susdPerUnit");
  const toRate = assertValidSusdPerCurrencyUnit(to, "to.susdPerUnit");
  const result = fromRate / toRate;
  if (!Number.isFinite(result)) {
    throw new RangeError("crossRate overflowed to a non-finite value");
  }
  return result;
}

/** Find the single valuation record for a currency, if present. */
export function findCurrencyValuation(
  valuations: readonly CurrencyValuation[],
  currencyId: Id,
): CurrencyValuation | undefined {
  return valuations.find((valuation) => valuation.currencyId === currencyId);
}

/**
 * Require a usable specified valuation. Missing and unavailable records are
 * distinct named errors; neither defaults to parity.
 */
export function requireCurrencyRate(
  valuations: readonly CurrencyValuation[],
  currencyId: Id,
): SusdPerCurrencyUnit {
  const valuation = findCurrencyValuation(valuations, currencyId);
  if (valuation === undefined) {
    throw new CurrencyValuationError(currencyId, "missing");
  }
  if (valuation.status === "unavailable") {
    throw new CurrencyValuationError(currencyId, "unavailable");
  }
  try {
    return assertValidSusdPerCurrencyUnit(valuation.susdPerUnit, "susdPerUnit");
  } catch {
    throw new CurrencyValuationError(currencyId, "invalid");
  }
}

/** Cross rate by currency id, using the authoritative valuation collection. */
export function crossRateFor(
  valuations: readonly CurrencyValuation[],
  fromCurrencyId: Id,
  toCurrencyId: Id,
): number {
  return crossRate(
    requireCurrencyRate(valuations, fromCurrencyId),
    requireCurrencyRate(valuations, toCurrencyId),
  );
}

/** Dimensionless relative comparison for rates; never an SUSD absolute epsilon. */
export function ratesApproximatelyEqual(left: number, right: number): boolean {
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  const scale = Math.max(Math.abs(left), Math.abs(right), Number.MIN_VALUE);
  return Math.abs(left - right) <= CURRENCY_RATE_RELATIVE_TOLERANCE * scale;
}
