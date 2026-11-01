/**
 * M4a-2 currency valuation and conversion helpers.
 *
 * Direction convention (never invert it accidentally):
 * - `rusdPerUnit` is the RUSD-equivalent value of ONE unit of a currency.
 * - `crossRate(from, to)` returns units of `to` per ONE unit of `from`.
 *
 * RUSD is not a registered currency. There is no `fxToUSD` field, no stored
 * inverse rate, and no default parity. An unavailable or missing valuation is a
 * named error, never a silent substitution.
 */

import {
  CURRENCY_RATE_MAX,
  CURRENCY_RATE_MIN,
  CURRENCY_RATE_RELATIVE_TOLERANCE,
} from "../constants.js";
import type { Id, MoneyRUSD } from "../types.js";
import type { CurrencyValuation, RusdPerCurrencyUnit } from "./types.js";

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
 * Validate and brand a RUSD-per-currency-unit value.
 * Bounds are provisional numerical safety limits, not historical economics.
 */
export function assertValidRusdPerCurrencyUnit(
  value: unknown,
  path = "rusdPerUnit",
): RusdPerCurrencyUnit {
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
  return value as RusdPerCurrencyUnit;
}

/** Construct a validated RUSD-per-currency-unit value. */
export function asRusdPerCurrencyUnit(value: number): RusdPerCurrencyUnit {
  return assertValidRusdPerCurrencyUnit(value);
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

/** Convert an amount in currency units to its nominal RUSD value. */
export function rusdFromCurrency(
  amount: MoneyRUSD,
  rate: RusdPerCurrencyUnit,
): MoneyRUSD {
  const value = assertMoneyAmount(amount, "amount");
  const valuation = assertValidRusdPerCurrencyUnit(rate, "rusdPerUnit");
  const result = value * valuation;
  return assertConversionResult(result, value > 0, "rusdFromCurrency");
}

/** Convert a nominal RUSD amount to units of a currency. */
export function currencyFromRusd(
  amount: MoneyRUSD,
  rate: RusdPerCurrencyUnit,
): number {
  const value = assertMoneyAmount(amount, "amount");
  const valuation = assertValidRusdPerCurrencyUnit(rate, "rusdPerUnit");
  const result = value / valuation;
  return assertConversionResult(result, value > 0, "currencyFromRusd");
}

/**
 * Units of `to` per ONE unit of `from`:
 * `crossRate(from, to) = from.rusdPerUnit / to.rusdPerUnit`.
 */
export function crossRate(from: RusdPerCurrencyUnit, to: RusdPerCurrencyUnit): number {
  const fromRate = assertValidRusdPerCurrencyUnit(from, "from.rusdPerUnit");
  const toRate = assertValidRusdPerCurrencyUnit(to, "to.rusdPerUnit");
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
): RusdPerCurrencyUnit {
  const valuation = findCurrencyValuation(valuations, currencyId);
  if (valuation === undefined) {
    throw new CurrencyValuationError(currencyId, "missing");
  }
  if (valuation.status === "unavailable") {
    throw new CurrencyValuationError(currencyId, "unavailable");
  }
  try {
    return assertValidRusdPerCurrencyUnit(valuation.rusdPerUnit, "rusdPerUnit");
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

/** Dimensionless relative comparison for rates; never an RUSD absolute epsilon. */
export function ratesApproximatelyEqual(left: number, right: number): boolean {
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  const scale = Math.max(Math.abs(left), Math.abs(right), Number.MIN_VALUE);
  return Math.abs(left - right) <= CURRENCY_RATE_RELATIVE_TOLERANCE * scale;
}
