/**
 * E6b monetary and price-index state factories and structural validation.
 *
 * This module sits below `monetary.ts`: it never imports the world initializer
 * or the whole-world validator, so `world.ts` and `economy/validation.ts` can
 * validate monetary state without depending on the runtime monetary phase. The
 * phase module re-exports these symbols for the public economy surface.
 */

import { CURRENCY_RATE_MAX, CURRENCY_RATE_MIN } from "../constants.js";
import { MONEY_TOLERANCE_RUSD } from "../population/constants.js";
import type { Id } from "../types.js";
import type { World } from "../world.js";
import { FX_MAX_RATIO, FX_MIN_RATIO, MAX_PRICE_INDEX_OBSERVATIONS } from "./constants.js";
import { asRusdPerCurrencyUnit } from "./currency.js";
import { MONETARY_REGIMES, MONETARY_STANDARDS } from "./types.js";
import type {
  MonetaryState,
  PriceIndexState,
  RusdPerCurrencyUnit,
} from "./types.js";
import { findAccountById } from "./accounts.js";

/** Empty price-index state for population-only worlds. */
export function emptyPriceIndexState(): PriceIndexState {
  return {
    basket: [],
    basePrices: [],
    observations: [],
    lastObservationDay: null,
  };
}

/** Empty monetary state for worlds without the E6b system. */
export function emptyMonetaryState(): MonetaryState {
  return { enabled: false, currencies: [], lastUpdateDay: null };
}

export function parseCurrencyRate(value: unknown, path: string): RusdPerCurrencyUnit {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new RangeError(`${path} must be a finite number`);
  }
  if (!(value > 0) || value < CURRENCY_RATE_MIN || value > CURRENCY_RATE_MAX) {
    throw new RangeError(`${path} must be a positive RUSD-per-unit valuation in range`);
  }
  return asRusdPerCurrencyUnit(value);
}

export function accountBalanceRUSD(world: World, accountId: Id | null): number {
  if (accountId === null) return 0;
  const account = findAccountById(world.finance.accounts, accountId);
  if (account === undefined) {
    throw new RangeError(`monetary authority references unknown account ${String(accountId)}`);
  }
  return account.balanceRUSD;
}

export function currencyValuationOf(world: World, currencyId: Id): RusdPerCurrencyUnit | null {
  const valuation = world.currencyValuations.find((entry) => entry.currencyId === currencyId);
  if (valuation === undefined || valuation.status !== "specified") return null;
  return valuation.rusdPerUnit;
}

/** Validate the price-index state against markets, goods, and countries. */
export function assertValidPriceIndexState(world: World, path = "world.priceIndex"): void {
  const state = world.priceIndex;
  if (typeof state !== "object" || state === null) {
    throw new TypeError(`${path} must be an object`);
  }
  if (!Array.isArray(state.basket)) throw new TypeError(`${path}.basket must be an array`);
  if (world.markets.length === 0) {
    // Population-only worlds have no prices to measure; the index is empty by design.
    if (
      state.basket.length !== 0 ||
      state.basePrices.length !== 0 ||
      state.observations.length !== 0 ||
      state.lastObservationDay !== null
    ) {
      throw new RangeError(`${path} must be empty in a world without markets`);
    }
    return;
  }
  const goodCount = world.markets[0]?.priceRUSD.length ?? 0;
  let previousGoodId = -1;
  let totalWeight = 0;
  for (let index = 0; index < state.basket.length; index += 1) {
    const item = state.basket[index];
    if (item === undefined) throw new RangeError(`${path}.basket[${String(index)}] is missing`);
    if (!Number.isInteger(item.goodId) || item.goodId < 0 || item.goodId >= goodCount) {
      throw new RangeError(`${path}.basket[${String(index)}].goodId is outside the catalog`);
    }
    if (item.goodId <= previousGoodId) {
      throw new RangeError(`${path}.basket must be strictly ascending by goodId`);
    }
    previousGoodId = item.goodId;
    if (!Number.isFinite(item.weight) || !(item.weight > 0)) {
      throw new RangeError(`${path}.basket[${String(index)}].weight must be positive`);
    }
    totalWeight += item.weight;
  }
  if (!(totalWeight > 0)) {
    throw new RangeError(`${path}.basket must have a positive total weight`);
  }
  if (!Array.isArray(state.basePrices)) {
    throw new TypeError(`${path}.basePrices must be an array`);
  }
  const marketIds = new Set(world.markets.map((market) => market.id));
  const seenMarkets = new Set<Id>();
  for (let index = 0; index < state.basePrices.length; index += 1) {
    const base = state.basePrices[index];
    if (base === undefined) throw new RangeError(`${path}.basePrices[${String(index)}] is missing`);
    if (!marketIds.has(base.marketId)) {
      throw new RangeError(`${path}.basePrices[${String(index)}] references an unknown market`);
    }
    if (seenMarkets.has(base.marketId)) {
      throw new RangeError(`${path}.basePrices has a duplicate market`);
    }
    seenMarkets.add(base.marketId);
    if (!Array.isArray(base.prices) || base.prices.length !== goodCount) {
      throw new RangeError(`${path}.basePrices[${String(index)}].prices has the wrong length`);
    }
    for (const price of base.prices) {
      if (!Number.isFinite(price) || !(price > 0)) {
        throw new RangeError(`${path}.basePrices[${String(index)}].prices must be positive`);
      }
    }
  }
  if (seenMarkets.size !== world.markets.length) {
    throw new RangeError(`${path}.basePrices must cover every market`);
  }
  if (!Array.isArray(state.observations)) {
    throw new TypeError(`${path}.observations must be an array`);
  }
  if (state.observations.length > MAX_PRICE_INDEX_OBSERVATIONS) {
    throw new RangeError(
      `${path}.observations must contain at most ${String(MAX_PRICE_INDEX_OBSERVATIONS)} entries`,
    );
  }
  const countryIds = new Set(world.countries.map((country) => country.id));
  let previousDay = -1;
  for (let index = 0; index < state.observations.length; index += 1) {
    const observation = state.observations[index];
    const entryPath = `${path}.observations[${String(index)}]`;
    if (observation === undefined) throw new RangeError(`${entryPath} is missing`);
    if (!Number.isInteger(observation.dayIndex) || observation.dayIndex < 0) {
      throw new RangeError(`${entryPath}.dayIndex must be a day index`);
    }
    if (observation.dayIndex <= previousDay) {
      throw new RangeError(`${path}.observations must be strictly ascending by dayIndex`);
    }
    previousDay = observation.dayIndex;
    if (!Number.isFinite(observation.world) || !(observation.world > 0)) {
      throw new RangeError(`${entryPath}.world must be positive`);
    }
    if (!Array.isArray(observation.countries)) {
      throw new TypeError(`${entryPath}.countries must be an array`);
    }
    let previousCountry = -1;
    for (const value of observation.countries) {
      if (!countryIds.has(value.countryId)) {
        throw new RangeError(`${entryPath}.countries references an unknown country`);
      }
      if (value.countryId <= previousCountry) {
        throw new RangeError(`${entryPath}.countries must be strictly ascending`);
      }
      previousCountry = value.countryId;
      if (!Number.isFinite(value.value) || !(value.value > 0)) {
        throw new RangeError(`${entryPath}.countries values must be positive`);
      }
    }
  }
  if (state.lastObservationDay !== null) {
    const last = state.observations[state.observations.length - 1];
    if (last === undefined || last.dayIndex !== state.lastObservationDay) {
      throw new RangeError(`${path}.lastObservationDay must match the last observation`);
    }
  }
}

/** Validate the monetary-system state and its account/valuation relationships. */
export function assertValidMonetaryState(world: World, path = "world.monetary"): void {
  const state = world.monetary;
  if (typeof state !== "object" || state === null) {
    throw new TypeError(`${path} must be an object`);
  }
  if (typeof state.enabled !== "boolean") {
    throw new TypeError(`${path}.enabled must be a boolean`);
  }
  if (!Array.isArray(state.currencies)) {
    throw new TypeError(`${path}.currencies must be an array`);
  }
  const accountsById = new Map(world.finance.accounts.map((account) => [account.id, account]));
  const currenciesById = new Map(world.currencies.map((currency) => [currency.id, currency]));
  const countryIds = new Set(world.countries.map((country) => country.id));
  const seenCurrencies = new Set<Id>();
  for (let index = 0; index < state.currencies.length; index += 1) {
    const record = state.currencies[index];
    const entryPath = `${path}.currencies[${String(index)}]`;
    if (record === undefined) throw new RangeError(`${entryPath} is missing`);
    if (!currenciesById.has(record.currencyId)) {
      throw new RangeError(`${entryPath}.currencyId is not a registered currency`);
    }
    if (seenCurrencies.has(record.currencyId)) {
      throw new RangeError(`${entryPath} duplicates a currency record`);
    }
    seenCurrencies.add(record.currencyId);
    if (index > 0 && (state.currencies[index - 1]?.currencyId ?? 0) >= record.currencyId) {
      throw new RangeError(`${path}.currencies must be strictly ascending by currencyId`);
    }
    if (record.issuerCountryId !== null && !countryIds.has(record.issuerCountryId)) {
      throw new RangeError(`${entryPath}.issuerCountryId is not a registered country`);
    }
    if (!(MONETARY_REGIMES as readonly string[]).includes(record.regime)) {
      throw new RangeError(`${entryPath}.regime is invalid`);
    }
    if (!Number.isFinite(record.currencyIssuedUnits) || record.currencyIssuedUnits < 0) {
      throw new RangeError(`${entryPath}.currencyIssuedUnits must be finite and non-negative`);
    }
    for (const field of ["parityRusdPerUnit", "referenceParityRusdPerUnit"] as const) {
      const value = record[field];
      if (value !== null) parseCurrencyRate(value, `${entryPath}.${field}`);
    }
    if (!Number.isFinite(record.lastMonthExportsRUSD) || record.lastMonthExportsRUSD < 0) {
      throw new RangeError(`${entryPath}.lastMonthExportsRUSD must be finite and non-negative`);
    }
    if (!Number.isFinite(record.lastMonthImportsRUSD) || record.lastMonthImportsRUSD < 0) {
      throw new RangeError(`${entryPath}.lastMonthImportsRUSD must be finite and non-negative`);
    }
    for (const [field, value] of [
      ["lastParityChangeDay", record.lastParityChangeDay],
      ["lastManagedUpdateDay", record.lastManagedUpdateDay],
      ["lastMonthEndDay", record.lastMonthEndDay],
    ] as const) {
      if (value !== null && (!Number.isInteger(value) || value < 0 || value > world.dayIndex)) {
        throw new RangeError(`${entryPath}.${field} must be a past day index or null`);
      }
    }
    const accountFields = [
      ["reserveAccountId", "monetary-reserve-cash", "country"],
      ["liabilityAccountId", "currency-liability", "country"],
      ["equityAccountId", "monetary-equity", "country"],
      ["externalCashAccountId", "external-cash", "system"],
      ["externalCurrencyAccountId", "external-currency-holding", "system"],
      ["externalEquityAccountId", "external-equity", "system"],
    ] as const;
    for (const [field, subtype, ownerKind] of accountFields) {
      const accountId = record[field];
      if (accountId === null) {
        if (state.enabled && record.issuerCountryId !== null) {
          throw new RangeError(`${entryPath}.${field} must be allocated when enabled`);
        }
        continue;
      }
      const account = accountsById.get(accountId);
      if (account === undefined) {
        throw new RangeError(`${entryPath}.${field} references an unknown account`);
      }
      if (account.subtype !== subtype) {
        throw new RangeError(`${entryPath}.${field} must be a ${subtype} account`);
      }
      if (account.ownerKind !== ownerKind) {
        throw new RangeError(`${entryPath}.${field} has the wrong owner kind`);
      }
      if (ownerKind === "country" && record.issuerCountryId !== null) {
        if (account.ownerId !== record.issuerCountryId) {
          throw new RangeError(`${entryPath}.${field} must belong to the issuing country`);
        }
      }
    }
    // D-149: the metal standard.
    if (!(MONETARY_STANDARDS as readonly string[]).includes(record.standard)) {
      throw new RangeError(`${entryPath}.standard is invalid`);
    }
    for (const field of ["fineGramsPerUnit", "metalReserveKg", "lastMintSaleKg"] as const) {
      if (!Number.isFinite(record[field]) || record[field] < 0) {
        throw new RangeError(`${entryPath}.${field} must be finite and non-negative`);
      }
    }
    if (typeof record.convertible !== "boolean") throw new RangeError(`${entryPath}.convertible must be a boolean`);
    if (record.standard === "paper") {
      if (record.fineGramsPerUnit !== 0 || record.metalReserveKg !== 0 || record.metalReserveAccountId !== null || record.convertible || record.lastMintSaleKg !== 0) {
        throw new RangeError(`${entryPath} paper currency carries metal state`);
      }
    } else {
      // D-150: a closed authority may still hold metal it is selling off (after an
      // adoption): nothing circulates and it is not convertible.
      if (!record.active && (record.currencyIssuedUnits !== 0 || record.convertible)) {
        throw new RangeError(`${entryPath} a closed metal authority must have no circulation and no convertibility`);
      }
      if (!(record.fineGramsPerUnit > 0)) throw new RangeError(`${entryPath}.fineGramsPerUnit must be positive`);
      const account = record.metalReserveAccountId === null ? undefined : accountsById.get(record.metalReserveAccountId);
      if (account === undefined || account.subtype !== "monetary-metal-reserve" || account.ownerKind !== "country" || account.ownerId !== record.issuerCountryId) {
        throw new RangeError(`${entryPath}.metalReserveAccountId must be the issuer's monetary-metal-reserve account`);
      }
    }
    if (record.active) {
      if (record.parityRusdPerUnit === null || record.referenceParityRusdPerUnit === null) {
        throw new RangeError(`${entryPath} active authority requires a parity`);
      }
      const valuation = currencyValuationOf(world, record.currencyId);
      if (valuation === null) {
        throw new RangeError(`${entryPath} active authority requires a specified valuation`);
      }
      if (record.standard !== "paper") {
        // D-149: a convertible metal currency floats with its metal's price (bounded by
        // the price band); a suspended one follows the managed band.
        if (!record.convertible) {
          const reference = record.referenceParityRusdPerUnit;
          if (valuation < reference * FX_MIN_RATIO - 1e-12 || valuation > reference * FX_MAX_RATIO + 1e-12) {
            throw new RangeError(`${entryPath} suspended valuation is outside the managed band`);
          }
        }
      } else if (record.regime === "pegged") {
        if (
          Math.abs(valuation - record.parityRusdPerUnit) >
          Math.abs(record.parityRusdPerUnit) * 1e-12
        ) {
          throw new RangeError(`${entryPath} pegged valuation must equal its parity`);
        }
      } else {
        const reference = record.referenceParityRusdPerUnit;
        if (
          valuation < reference * FX_MIN_RATIO - 1e-12 ||
          valuation > reference * FX_MAX_RATIO + 1e-12
        ) {
          throw new RangeError(`${entryPath} managed valuation is outside the allowed band`);
        }
      }
      const liability = accountBalanceRUSD(world, record.liabilityAccountId);
      const expectedLiability = record.currencyIssuedUnits * valuation;
      if (
        Math.abs(liability - expectedLiability) >
        MONEY_TOLERANCE_RUSD * Math.max(1, expectedLiability)
      ) {
        throw new RangeError(`${entryPath} currency liability does not match units × valuation`);
      }
      const holding = accountBalanceRUSD(world, record.externalCurrencyAccountId);
      if (
        Math.abs(holding - expectedLiability) >
        MONEY_TOLERANCE_RUSD * Math.max(1, expectedLiability)
      ) {
        throw new RangeError(`${entryPath} external holding does not match the liability`);
      }
    } else if (record.currencyIssuedUnits > 0) {
      throw new RangeError(`${entryPath} inactive authority cannot have currency in circulation`);
    }
  }
  const expectedCurrencies = state.enabled ? world.currencies.length : 0;
  if (state.enabled && seenCurrencies.size !== expectedCurrencies) {
    throw new RangeError(`${path}.currencies must cover every registered currency when enabled`);
  }
  if (state.lastUpdateDay !== null) {
    if (!Number.isInteger(state.lastUpdateDay) || state.lastUpdateDay < 0) {
      throw new RangeError(`${path}.lastUpdateDay must be a day index or null`);
    }
    if (state.lastUpdateDay > world.dayIndex) {
      throw new RangeError(`${path}.lastUpdateDay must not be after the world day`);
    }
  }
}
