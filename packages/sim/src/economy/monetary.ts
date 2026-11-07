/**
 * E6b monetary foundations: price index, exchange-rate valuation, and the currency
 * board (D-080).
 *
 * Units and directions (never invert them):
 * - `CurrencyValuation.rusdPerUnit` is RUSD per ONE currency unit.
 * - `currencyIssuedUnits` is a count of currency units; its RUSD measurement is
 *   `units × valuation`.
 * - All accounts and prices are RUSD. Currency amounts exist only in the monetary
 *   window; trade and taxes are never converted.
 *
 * The price index is a pure measurement. It never changes RUSD's definition and never
 * causes a price, wage, tax, or account to change.
 */

import { dayIndexToCivilDate, daysInMonth } from "../calendar.js";
import { MONEY_TOLERANCE_RUSD } from "../population/constants.js";
import { populationTotal } from "../population/state.js";
import type { PopulationDefinitions } from "../population/types.js";
import type { DayIndex, Id } from "../types.js";
import { assertValidWorldForTick, type PhaseValidationOptions, type World } from "../world.js";
import {
  accountBalanceRUSD,
  currencyValuationOf,
  emptyPriceIndexState,
  parseCurrencyRate,
} from "./monetaryState.js";
import { postJournalBatch, type JournalEntryInput } from "./accounting.js";
import {
  FX_KAPPA,
  FX_MAX_DAILY_CHANGE,
  FX_MAX_PARITY_STEP,
  FX_MAX_RATIO,
  FX_MIN_RATIO,
  FX_MIN_RESERVE_COVER_MONTHS,
  FX_PARITY_COOLDOWN_DAYS,
  FX_PRICE_WEIGHT,
  FX_TRADE_WEIGHT,
  MAX_PRICE_INDEX_OBSERVATIONS,
} from "./constants.js";
import { assertValidEconomyDefinitions } from "./definitions.js";
import { asRusdPerCurrencyUnit } from "./currency.js";
import { lawDefinition } from "./politics.js";
import type {
  CurrencyValuation,
  EconomyDefinitions,
  MonetaryCurrencyState,
  MonetaryRegime,
  MonetaryState,
  PriceIndexBasketItem,
  PriceIndexState,
  RusdPerCurrencyUnit,
} from "./types.js";
import { MONETARY_REGIMES } from "./types.js";
import { runMintWindow, type MintFlow } from "./mint.js";
import { runDemonetisation } from "./currencyActions.js";
export {
  assertValidMonetaryState,
  assertValidPriceIndexState,
  emptyMonetaryState,
  emptyPriceIndexState,
} from "./monetaryState.js";

function clamp(value: number, minimum: number, maximum: number): number {
  if (value < minimum) return minimum;
  if (value > maximum) return maximum;
  return value;
}

// ---------------------------------------------------------------------------------
// Price index
// ---------------------------------------------------------------------------------

/**
 * Build the fixed Laspeyres basket from the scenario's reference-household needs.
 *
 * Weight = the need item's per-capita daily quantity, summed across tiers for a good.
 * A good that appears in several need tiers is aggregated. If the scenario has no needs,
 * every good receives an equal weight (documented fallback, never an empty basket).
 */
export function buildPriceIndexBasket(
  definitions: EconomyDefinitions,
  populationDefinitions: PopulationDefinitions,
): PriceIndexBasketItem[] {
  const goodIdByKey = new Map(definitions.goods.map((good) => [good.key, good.id]));
  const weights = new Map<Id, number>();
  for (const tier of populationDefinitions.needs) {
    for (const item of tier.items) {
      const goodId = goodIdByKey.get(item.goodKey);
      if (goodId === undefined) {
        throw new RangeError(
          `price-index basket references unknown good ${JSON.stringify(item.goodKey)}`,
        );
      }
      if (!(item.quantityPerCapitaPerDay > 0)) continue;
      weights.set(goodId, (weights.get(goodId) ?? 0) + item.quantityPerCapitaPerDay);
    }
  }
  if (weights.size === 0) {
    const goods = [...definitions.goods].sort((left, right) => left.id - right.id);
    if (goods.length === 0) return [];
    for (const good of goods) weights.set(good.id, 1);
  }
  return [...weights.entries()]
    .map(([goodId, weight]) => ({ goodId, weight }))
    .sort((left, right) => left.goodId - right.goodId);
}

/** Create the price-index state from the scenario's market opening prices. */
export function createPriceIndexState(
  definitions: EconomyDefinitions,
  populationDefinitions: PopulationDefinitions,
  markets: readonly { readonly id: Id; readonly priceRUSD: readonly number[] }[],
): PriceIndexState {
  if (markets.length === 0) {
    // No prices exist, so there is nothing to measure; the index stays empty.
    return emptyPriceIndexState();
  }
  const basket = buildPriceIndexBasket(definitions, populationDefinitions);
  const basePrices = [...markets]
    .sort((left, right) => left.id - right.id)
    .map((market) => ({
      marketId: market.id,
      prices: [...market.priceRUSD],
    }));
  return {
    basket,
    basePrices,
    observations: [],
    lastObservationDay: null,
  };
}

export interface DerivedPriceIndexes {
  readonly markets: ReadonlyMap<Id, number>;
  readonly countries: ReadonlyMap<Id, number>;
  readonly world: number;
}

/**
 * Derive the current index values from the current market prices.
 *
 * Base = 100 at the captured opening prices. A basket good with a missing or
 * non-positive base or current price is excluded from both sums; coverage is reported by
 * the caller. A country index is the population-weighted mean of the indices of the
 * markets containing its provinces.
 */
export function derivePriceIndexes(world: World): DerivedPriceIndexes {
  const basket = world.priceIndex.basket;
  const baseByMarket = new Map(
    world.priceIndex.basePrices.map((base) => [base.marketId, base.prices]),
  );
  const marketValues = new Map<Id, number>();
  for (const market of world.markets) {
    const base = baseByMarket.get(market.id) ?? [];
    let numerator = 0;
    let denominator = 0;
    for (const item of basket) {
      const basePrice = base[item.goodId] ?? 0;
      const currentPrice = market.priceRUSD[item.goodId] ?? 0;
      if (!(basePrice > 0) || !(currentPrice > 0)) continue;
      numerator += item.weight * (currentPrice / basePrice);
      denominator += item.weight;
    }
    marketValues.set(market.id, denominator > 0 ? (100 * numerator) / denominator : 100);
  }

  const populationByProvince = new Map<Id, number>();
  for (const block of world.popBlocks) {
    populationByProvince.set(
      block.provinceId,
      (populationByProvince.get(block.provinceId) ?? 0) + populationTotal(block),
    );
  }
  // D-137: provinces by id, each market's provinces (ascending, `marketProvinceIds`)
  // and each country's (`countryProvinceIds` order) once, instead of a scan per
  // market and country and a `find` per province.
  const provinceById = new Map<Id, World["provinceEconomies"][number]>();
  const provinceIdsByMarket = new Map<Id, Id[]>();
  for (const province of world.provinceEconomies) {
    if (!provinceById.has(province.id)) provinceById.set(province.id, province);
    if (province.marketId === null) continue;
    const list = provinceIdsByMarket.get(province.marketId);
    if (list === undefined) provinceIdsByMarket.set(province.marketId, [province.id]);
    else list.push(province.id);
  }
  for (const list of provinceIdsByMarket.values()) list.sort((left, right) => left - right);
  const provinceIdsByCountry = new Map<Id, Id[]>();
  if (world.provinces.enabled) {
    for (const record of world.provinces.ownership) {
      const list = provinceIdsByCountry.get(record.ownerPolityId);
      if (list === undefined) provinceIdsByCountry.set(record.ownerPolityId, [record.provinceId]);
      else list.push(record.provinceId);
    }
  }
  const marketPopulation = new Map<Id, number>();
  for (const market of world.markets) {
    let population = 0;
    for (const provinceId of provinceIdsByMarket.get(market.id) ?? []) {
      population += populationByProvince.get(provinceId) ?? 0;
    }
    marketPopulation.set(market.id, population);
  }

  const countryValues = new Map<Id, number>();
  const marketById = new Map(world.markets.map((market) => [market.id, market]));
  for (const country of world.countries) {
    const weights: { marketId: Id; value: number; weight: number }[] = [];
    for (const provinceId of provinceIdsByCountry.get(country.id) ?? []) {
      const marketId = provinceById.get(provinceId)?.marketId;
      if (marketId === null || marketId === undefined) continue;
      if (!marketById.has(marketId)) continue;
      const already = weights.find((entry) => entry.marketId === marketId);
      const population = populationByProvince.get(provinceId) ?? 0;
      if (already === undefined) {
        weights.push({
          marketId,
          value: marketValues.get(marketId) ?? 100,
          weight: population,
        });
      } else {
        already.weight += population;
      }
    }
    if (weights.length === 0) {
      countryValues.set(country.id, 100);
      continue;
    }
    let totalWeight = weights.reduce((total, entry) => total + entry.weight, 0);
    if (!(totalWeight > 0)) {
      for (const entry of weights) entry.weight = 1;
      totalWeight = weights.length;
    }
    let value = 0;
    for (const entry of weights) value += (entry.value * entry.weight) / totalWeight;
    countryValues.set(country.id, value);
  }

  let worldNumerator = 0;
  let worldDenominator = 0;
  for (const market of world.markets) {
    const population = marketPopulation.get(market.id) ?? 0;
    worldNumerator += (marketValues.get(market.id) ?? 100) * population;
    worldDenominator += population;
  }
  let worldValue: number;
  if (worldDenominator > 0) {
    worldValue = worldNumerator / worldDenominator;
  } else {
    const values = [...marketValues.values()];
    worldValue =
      values.length === 0 ? 100 : values.reduce((total, value) => total + value, 0) / values.length;
  }
  return {
    markets: marketValues,
    countries: countryValues,
    world: worldValue,
  };
}

/** Basket coverage: share of the basket weight with usable base and current prices. */
export function priceIndexCoverage(world: World, marketId: Id): number {
  const basket = world.priceIndex.basket;
  const market = world.markets.find((candidate) => candidate.id === marketId);
  if (market === undefined) return 0;
  const base = world.priceIndex.basePrices.find((entry) => entry.marketId === marketId)?.prices ?? [];
  let covered = 0;
  let total = 0;
  for (const item of basket) {
    total += item.weight;
    const basePrice = base[item.goodId] ?? 0;
    const currentPrice = market.priceRUSD[item.goodId] ?? 0;
    if (basePrice > 0 && currentPrice > 0) covered += item.weight;
  }
  return total > 0 ? covered / total : 0;
}

/**
 * Inflation between the latest retained observation and one `monthsBack` earlier.
 * Returns null when the history is too short. Measured, never applied to behaviour.
 */
export function priceIndexInflation(
  world: World,
  countryId: Id | null,
  monthsBack: number,
): number | null {
  const observations = world.priceIndex.observations;
  const latest = observations[observations.length - 1];
  const reference = observations[observations.length - 1 - monthsBack];
  if (latest === undefined || reference === undefined) return null;
  const valueOf = (
    observation: PriceIndexState["observations"][number],
  ): number | null => {
    if (countryId === null) return observation.world;
    const entry = observation.countries.find((country) => country.countryId === countryId);
    return entry === undefined ? null : entry.value;
  };
  const latestValue = valueOf(latest);
  const referenceValue = valueOf(reference);
  if (latestValue === null || referenceValue === null || !(referenceValue > 0)) return null;
  return latestValue / referenceValue - 1;
}

// ---------------------------------------------------------------------------------
// Monetary authority and convertibility
// ---------------------------------------------------------------------------------

/** Find the authority record for the currency a country issues and uses domestically. */
export function monetaryCurrencyForCountry(
  world: World,
  countryId: Id,
): MonetaryCurrencyState | null {
  const country = world.countries.find((candidate) => candidate.id === countryId);
  if (country === undefined || country.monetary.kind !== "own") return null;
  const currencyId = country.monetary.currencyId;
  const record = world.monetary.currencies.find((entry) => entry.currencyId === currencyId);
  return record === undefined || record.issuerCountryId !== countryId ? null : record;
}

/** RUSD value of one authority's currency in circulation at the current valuation. */
export function authorityLiabilityRUSD(
  world: World,
  record: MonetaryCurrencyState,
): number {
  if (!record.active || record.currencyIssuedUnits <= 0) return 0;
  const valuation = currencyValuationOf(world, record.currencyId);
  if (valuation === null) return 0;
  return record.currencyIssuedUnits * valuation;
}

/** Authority reserve cash in RUSD. */
export function authorityReservesRUSD(
  world: World,
  record: MonetaryCurrencyState,
): number {
  return accountBalanceRUSD(world, record.reserveAccountId);
}

/** External counterparty currency holding in RUSD. */
export function externalCurrencyHoldingRUSD(
  world: World,
  record: MonetaryCurrencyState,
): number {
  return accountBalanceRUSD(world, record.externalCurrencyAccountId);
}

/** Reserve cover in months of the most recently completed month's realized imports. */
export function authorityReserveCoverMonths(
  world: World,
  record: MonetaryCurrencyState,
): number {
  const reserves = authorityReservesRUSD(world, record);
  if (!(record.lastMonthImportsRUSD > 0)) {
    return reserves > 0 ? Number.POSITIVE_INFINITY : 0;
  }
  return reserves / record.lastMonthImportsRUSD;
}

/**
 * Convertibility state for one country.
 *
 * `no-authority` when the country does not issue its own currency or the monetary system
 * is disabled (no restriction). `suspended` when the authority's reserve cover is below
 * the documented minimum, which blocks imports into its market (D-080).
 */
export function convertibilityState(
  world: World,
  countryId: Id,
): {
  readonly state: "no-authority" | "inactive" | "open" | "suspended";
  readonly coverMonths: number;
  readonly reservesRUSD: number;
} {
  const record = monetaryCurrencyForCountry(world, countryId);
  if (record === null || !world.monetary.enabled) {
    return { state: "no-authority", coverMonths: Number.POSITIVE_INFINITY, reservesRUSD: 0 };
  }
  if (record.active && record.standard !== "paper") {
    // D-149: a metal currency is convertible while its mint sells metal at the export
    // point; its RUSD cash only funds purchases.
    return {
      state: record.convertible ? "open" : "suspended",
      coverMonths: authorityReserveCoverMonths(world, record),
      reservesRUSD: authorityReservesRUSD(world, record),
    };
  }
  if (!record.active) {
    return {
      state: "inactive",
      coverMonths: Number.POSITIVE_INFINITY,
      reservesRUSD: authorityReservesRUSD(world, record),
    };
  }
  const reserves = authorityReservesRUSD(world, record);
  const coverMonths = authorityReserveCoverMonths(world, record);
  const suspended =
    reserves <= MONEY_TOLERANCE_RUSD ||
    coverMonths < FX_MIN_RESERVE_COVER_MONTHS;
  return {
    state: suspended ? "suspended" : "open",
    coverMonths,
    reservesRUSD: reserves,
  };
}

/** True when imports into this country's market must be blocked by FX controls. */
export function isConvertibilitySuspended(world: World, countryId: Id): boolean {
  return convertibilityState(world, countryId).state === "suspended";
}

// ---------------------------------------------------------------------------------
// Price-index and monetary phase
// ---------------------------------------------------------------------------------

export interface MonetaryPhaseResult {
  readonly dayIndex: DayIndex;
  readonly managedCurrenciesUpdated: readonly Id[];
  readonly revaluationRUSD: number;
  readonly priceObservationCaptured: boolean;
  readonly postingIds: readonly number[];
  /** D-149: the mint flows of the metal standards today (empty without one). */
  readonly mintFlows: readonly MintFlow[];
}

function isMonthEnd(dayIndex: DayIndex): { year: number; month: number } | null {
  const date = dayIndexToCivilDate(dayIndex);
  return date.day === daysInMonth(date.year, date.month)
    ? { year: date.year, month: date.month }
    : null;
}

function appendObservation(
  world: World,
  dayIndex: DayIndex,
  year: number,
  month: number,
  values: DerivedPriceIndexes,
): void {
  const observation = {
    year,
    month,
    dayIndex,
    world: values.world,
    countries: [...values.countries.entries()]
      .map(([countryId, value]) => ({ countryId, value }))
      .sort((left, right) => left.countryId - right.countryId),
  };
  const observations = [...world.priceIndex.observations, observation];
  world.priceIndex.observations = observations.slice(
    Math.max(0, observations.length - MAX_PRICE_INDEX_OBSERVATIONS),
  );
  world.priceIndex.lastObservationDay = dayIndex;
}

/**
 * Run the daily monetary phase: managed-valuation updates, revaluation, the month-end
 * realized-import capture, and the bounded price-index observation.
 *
 * The phase is idempotent per day. It runs after settlement, fiscal, and E6a dispatch, so
 * realized trade and current prices are known, and before the monthly close, so no closed
 * period is rewritten.
 */
export function runMonetaryPhase(
  world: World,
  economyDefinitions: EconomyDefinitions,
  dayIndex: DayIndex,
  options: PhaseValidationOptions = {},
): MonetaryPhaseResult {
  if (options.validateWorld !== false) assertValidWorldForTick(world);
  // Staged mode: the integrated day validated the definitions once at its start.
  if (options.validateWorld !== false) assertValidEconomyDefinitions(economyDefinitions);
  const empty: MonetaryPhaseResult = {
    dayIndex,
    managedCurrenciesUpdated: [],
    revaluationRUSD: 0,
    priceObservationCaptured: false,
    postingIds: [],
    mintFlows: [],
  };
  if (!world.monetary.enabled) return empty;
  if (world.monetary.lastUpdateDay === dayIndex) return empty;

  const monthEnd = isMonthEnd(dayIndex);
  const values = derivePriceIndexes(world);
  const managed: Id[] = [];
  const entries: JournalEntryInput[] = [];
  let revaluationRUSD = 0;
  const mintFlows: MintFlow[] = [];
  const dealerSpent = new Map<Id, number>();

  for (const record of [...world.monetary.currencies].sort(
    (left, right) => left.currencyId - right.currencyId,
  )) {
    // D-150: a closed authority sells off the metal it still holds.
    if (!record.active && record.standard !== "paper") {
      runDemonetisation(world, economyDefinitions, record, entries, dealerSpent);
      continue;
    }
    if (!record.active || record.issuerCountryId === null) continue;
    const country = world.countries.find((candidate) => candidate.id === record.issuerCountryId);
    if (country === undefined) continue;
    let valuation = currencyValuationOf(world, record.currencyId);
    if (valuation === null) continue;

    // D-149: the mint window, the reserve measured at the day's metal price, then a
    // convertible metal currency is worth its fine content at that price.
    if (record.standard !== "paper") {
      const flow = runMintWindow(world, economyDefinitions, record, entries, dealerSpent);
      if (flow !== null) {
        mintFlows.push(flow);
        const price = flow.marketPriceRUSDPerKg;
        if (record.metalReserveAccountId !== null) {
          const booked = accountBalanceRUSD(world, record.metalReserveAccountId) + flow.boughtRUSD - flow.soldRUSD;
          const delta = record.metalReserveKg * price - booked;
          if (Math.abs(delta) > MONEY_TOLERANCE_RUSD * Math.max(1, Math.abs(booked))) {
            entries.push({
              transactionKind: "metal-revaluation",
              lines: [
                { accountId: record.metalReserveAccountId, side: delta > 0 ? "debit" : "credit", amountRUSD: Math.abs(delta) },
                { accountId: record.equityAccountId ?? 0, side: delta > 0 ? "credit" : "debit", amountRUSD: Math.abs(delta) },
              ],
              sourceEntityId: record.issuerCountryId,
              targetEntityId: null,
            });
          }
        }
        if (record.convertible && price > 0) {
          const next = (record.fineGramsPerUnit / 1000) * price;
          if (Math.abs(next - valuation) > Math.abs(valuation) * 1e-12) {
            revaluationRUSD += applyRevaluation(record, record.currencyIssuedUnits * (next - valuation), dayIndex, entries);
            setCurrencyValuation(world, record.currencyId, asRusdPerCurrencyUnit(next), dayIndex, "market");
            record.parityRusdPerUnit = asRusdPerCurrencyUnit(next);
            valuation = asRusdPerCurrencyUnit(next);
          }
        }
      }
    }

    // Managed exchange-rate rule: a documented, bounded response to realized trade and
    // relative prices. Pegged valuations never drift. A suspended metal currency follows
    // it too (D-149, plan §13.5).
    const followsManagedRule =
      record.standard === "paper" ? record.regime === "managed" : !record.convertible;
    if (
      followsManagedRule &&
      record.lastManagedUpdateDay !== dayIndex
    ) {
      const exports = record.lastMonthExportsRUSD;
      const imports = record.lastMonthImportsRUSD;
      const turnover = exports + imports;
      const tradePressure = turnover > 0 ? (exports - imports) / turnover : 0;
      const countryIndex = values.countries.get(country.id) ?? values.world;
      const priceGap = clamp(
        values.world / Math.max(countryIndex, 1e-9) - 1,
        -1,
        1,
      );
      const raw =
        FX_KAPPA * (FX_TRADE_WEIGHT * tradePressure + FX_PRICE_WEIGHT * priceGap);
      const change = clamp(raw, -FX_MAX_DAILY_CHANGE, FX_MAX_DAILY_CHANGE);
      const reference = record.referenceParityRusdPerUnit ?? valuation;
      const next = clamp(
        valuation * (1 + change),
        reference * FX_MIN_RATIO,
        reference * FX_MAX_RATIO,
      );
      if (Math.abs(next - valuation) > Math.abs(valuation) * 1e-12) {
        const delta = record.currencyIssuedUnits * (next - valuation);
        revaluationRUSD += applyRevaluation(record, delta, dayIndex, entries);
        setCurrencyValuation(world, record.currencyId, asRusdPerCurrencyUnit(next), dayIndex, "market");
        managed.push(record.currencyId);
      }
      record.lastManagedUpdateDay = dayIndex;
    }

    // Month-end capture: the completed month's realized trade feeds reserve cover and the
    // next month's managed rule. It is the only place the memo is frozen.
    if (monthEnd !== null && record.lastMonthEndDay !== dayIndex) {
      record.lastMonthExportsRUSD = country.trade.exportsValueMonthToDateRUSD;
      record.lastMonthImportsRUSD = country.trade.importsValueMonthToDateRUSD;
      record.lastMonthEndDay = dayIndex;
    }
  }

  const postings =
    entries.length === 0 ? [] : postJournalBatch(world.finance, dayIndex, entries);
  let priceObservationCaptured = false;
  if (monthEnd !== null && world.priceIndex.lastObservationDay !== dayIndex) {
    appendObservation(world, dayIndex, monthEnd.year, monthEnd.month, values);
    priceObservationCaptured = true;
  }
  world.monetary.lastUpdateDay = dayIndex;
  return {
    dayIndex,
    managedCurrenciesUpdated: managed,
    revaluationRUSD,
    priceObservationCaptured,
    postingIds: postings.map((posting) => posting.id),
    mintFlows,
  };
}

/**
 * Apply a RUSD revaluation delta to the outstanding currency liability and the external
 * holding. Positive delta = the currency is worth more in RUSD.
 */
function applyRevaluation(
  record: MonetaryCurrencyState,
  delta: number,
  dayIndex: DayIndex,
  entries: JournalEntryInput[],
): number {
  if (Math.abs(delta) <= MONEY_TOLERANCE_RUSD * Math.max(1, Math.abs(delta))) return 0;
  if (
    record.liabilityAccountId === null ||
    record.equityAccountId === null ||
    record.externalCurrencyAccountId === null ||
    record.externalEquityAccountId === null
  ) {
    throw new RangeError(
      `monetary authority ${String(record.currencyId)} has incomplete valuation accounts`,
    );
  }
  const amount = Math.abs(delta);
  const increase = delta > 0;
  entries.push({
    transactionKind: "fx-revaluation",
    lines: [
      {
        accountId: record.liabilityAccountId,
        side: increase ? "credit" : "debit",
        amountRUSD: amount,
      },
      {
        accountId: record.equityAccountId,
        side: increase ? "debit" : "credit",
        amountRUSD: amount,
      },
      {
        accountId: record.externalCurrencyAccountId,
        side: increase ? "debit" : "credit",
        amountRUSD: amount,
      },
      {
        accountId: record.externalEquityAccountId,
        side: increase ? "credit" : "debit",
        amountRUSD: amount,
      },
    ],
    sourceEntityId: record.issuerCountryId,
    targetEntityId: null,
  });
  void dayIndex;
  return delta;
}

function setCurrencyValuation(
  world: World,
  currencyId: Id,
  value: RusdPerCurrencyUnit,
  dayIndex: DayIndex,
  source: "scenario" | "policy" | "market",
): void {
  const index = world.currencyValuations.findIndex((entry) => entry.currencyId === currencyId);
  const record: CurrencyValuation = {
    currencyId,
    status: "specified",
    rusdPerUnit: value,
    setOnDay: dayIndex,
    source,
  };
  if (index < 0) {
    world.currencyValuations.push(record);
    world.currencyValuations.sort((left, right) => left.currencyId - right.currencyId);
  } else {
    world.currencyValuations[index] = record;
  }
}

// ---------------------------------------------------------------------------------
// Monetary policy action
// ---------------------------------------------------------------------------------

export interface MonetaryPolicyInput {
  readonly countryId: Id;
  readonly regime: MonetaryRegime;
  readonly parityRusdPerUnit: number | null;
  readonly reserveTransferRUSD: number;
  readonly currencyConversionRUSD: number;
}

export interface MonetaryPolicyResult {
  readonly countryId: Id;
  readonly currencyId: Id;
  readonly regime: MonetaryRegime;
  readonly parityRusdPerUnit: number;
  readonly valuationRusdPerUnit: number;
  readonly reserveTransferRUSD: number;
  readonly currencyConversionRUSD: number;
  readonly currencyIssuedUnits: number;
  readonly revaluationRUSD: number;
  readonly postalIds: readonly number[];
}

function assertMonetaryRegime(value: unknown, path: string): asserts value is MonetaryRegime {
  if (!(MONETARY_REGIMES as readonly string[]).includes(value as string)) {
    throw new RangeError(`${path} must be one of ${MONETARY_REGIMES.join(", ")}`);
  }
}

/** True when the country's enacted currency law backs a managed regime. */
export function managedRegimeEnabled(
  country: World["countries"][number],
  definitions: EconomyDefinitions | undefined,
): boolean {
  if (definitions?.politics === undefined) return false;
  const law = lawDefinition(definitions.politics, country.laws.currency);
  return law !== null && law.currencyRegime === "managed";
}

/**
 * Validate one monetary-policy operation against the world and the country's
 * institutions. Throws a named error; never mutates.
 */
export function validateMonetaryPolicy(
  world: World,
  definitions: EconomyDefinitions | undefined,
  input: MonetaryPolicyInput,
  path = "monetary policy",
): void {
  if (!world.monetary.enabled) {
    throw new RangeError("the monetary system is not enabled in this world");
  }
  const country = world.countries.find((candidate) => candidate.id === input.countryId);
  if (country === undefined) throw new RangeError(`${path}.countryId is not a registered country`);
  if (country.monetary.kind !== "own") {
    throw new RangeError(
      `${path}: a country that adopts or shares a currency has no independent monetary authority`,
    );
  }
  const record = monetaryCurrencyForCountry(world, country.id);
  if (record === null) {
    throw new RangeError(`${path}: country ${String(country.id)} has no issued-currency authority`);
  }
  assertMonetaryRegime(input.regime, `${path}.regime`);
  if (record.standard !== "paper") {
    // D-149: a metal currency's value is set by its fine content and the mint window;
    // only the treasury's reserve cash can be moved. Changing the standard itself is a
    // currency change (ADOPT_CURRENCY / ESTABLISH_CURRENCY).
    if (input.regime !== record.regime || input.parityRusdPerUnit !== null || input.currencyConversionRUSD !== 0) {
      throw new RangeError(`${path}: a ${record.standard}-standard currency allows only reserve transfers`);
    }
  }
  if (input.regime === "managed" && !managedRegimeEnabled(country, definitions)) {
    throw new RangeError(
      `${path}: the managed exchange-rate regime requires an enacted currency law`,
    );
  }
  for (const [field, value] of [
    ["reserveTransferRUSD", input.reserveTransferRUSD],
    ["currencyConversionRUSD", input.currencyConversionRUSD],
  ] as const) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new RangeError(`${path}.${field} must be a finite number`);
    }
  }
  const treasuryCash =
    accountBalanceRUSD(world, country.treasuryAccountId);
  const reserves = authorityReservesRUSD(world, record);
  if (input.reserveTransferRUSD > 0 && input.reserveTransferRUSD > treasuryCash + MONEY_TOLERANCE_RUSD) {
    throw new RangeError(`${path}.reserveTransferRUSD exceeds the treasury's cash`);
  }
  if (input.reserveTransferRUSD < 0 && -input.reserveTransferRUSD > reserves + MONEY_TOLERANCE_RUSD) {
    throw new RangeError(`${path}.reserveTransferRUSD exceeds the authority's reserves`);
  }

  if (!record.active) {
    if (input.regime === "managed") {
      throw new RangeError(`${path}: a managed regime requires an established authority`);
    }
    const parity = input.parityRusdPerUnit;
    if (parity === null) {
      throw new RangeError(`${path}.parityRusdPerUnit is required to establish the authority`);
    }
    parseCurrencyRate(parity, `${path}.parityRusdPerUnit`);
    if (!(input.reserveTransferRUSD > 0)) {
      throw new RangeError(
        `${path}.reserveTransferRUSD must be positive to establish the authority`,
      );
    }
    return;
  }

  const valuation = currencyValuationOf(world, record.currencyId);
  if (valuation === null) {
    throw new RangeError(`${path}: the currency has no specified valuation`);
  }
  if (input.parityRusdPerUnit !== null) {
    const parity = parseCurrencyRate(input.parityRusdPerUnit, `${path}.parityRusdPerUnit`);
    const current = record.parityRusdPerUnit ?? valuation;
    if (Math.abs(parity - current) > Math.abs(current) * 1e-12) {
      if (input.regime !== "pegged") {
        throw new RangeError(`${path}: a parity may only be set under a pegged regime`);
      }
      const relative = Math.abs(parity / current - 1);
      if (relative > FX_MAX_PARITY_STEP + 1e-12) {
        throw new RangeError(
          `${path}.parityRusdPerUnit moves more than ${String(FX_MAX_PARITY_STEP)} of the current parity`,
        );
      }
      if (
        record.lastParityChangeDay !== null &&
        world.dayIndex - record.lastParityChangeDay < FX_PARITY_COOLDOWN_DAYS
      ) {
        throw new RangeError(
          `${path}: a parity change requires at least ${String(FX_PARITY_COOLDOWN_DAYS)} days since the last one`,
        );
      }
    }
  }
  if (record.regime === "pegged" && input.parityRusdPerUnit === null && input.regime === "pegged") {
    // Keeping the parity is valid; no error.
  }
  if (input.currencyConversionRUSD > 0) {
    const externalCash = accountBalanceRUSD(world, record.externalCashAccountId);
    if (input.currencyConversionRUSD > externalCash + MONEY_TOLERANCE_RUSD) {
      throw new RangeError(`${path}.currencyConversionRUSD exceeds the external RUSD cash`);
    }
  }
  if (input.currencyConversionRUSD < 0) {
    const requested = -input.currencyConversionRUSD;
    if (requested > reserves + MONEY_TOLERANCE_RUSD) {
      throw new RangeError(`${path}.currencyConversionRUSD exceeds the authority's reserves`);
    }
    const holding = externalCurrencyHoldingRUSD(world, record);
    if (requested > holding + MONEY_TOLERANCE_RUSD) {
      throw new RangeError(
        `${path}.currencyConversionRUSD exceeds the external currency holding`,
      );
    }
  }
}

function cloneMonetaryState(state: MonetaryState): MonetaryState {
  return {
    ...state,
    currencies: state.currencies.map((record) => ({ ...record })),
  };
}

function cloneValuations(valuations: readonly CurrencyValuation[]): CurrencyValuation[] {
  return valuations.map((valuation) =>
    valuation.status === "specified" ? { ...valuation } : { ...valuation },
  );
}

/**
 * Apply one validated monetary-policy operation atomically.
 *
 * Ordering: treasury reserve capitalization/withdrawal, currency issue/redemption, then
 * parity/valuation revaluation. Any failure restores monetary state, valuations, and the
 * complete finance posting boundary, so no partial money change can persist.
 */
/**
 * Apply one validated monetary-policy operation atomically.
 *
 * Ordering: treasury reserve capitalization/withdrawal, valuation/parity change with
 * revaluation of the existing circulation, then currency issue/redemption at the new
 * valuation. Any failure restores monetary state, valuations, account balances, and the
 * posting boundary, so no partial money change can persist.
 */
export function applyMonetaryPolicy(
  world: World,
  definitions: EconomyDefinitions | undefined,
  input: MonetaryPolicyInput,
  dayIndex: DayIndex,
): MonetaryPolicyResult {
  validateMonetaryPolicy(world, definitions, input);
  const country = world.countries.find((candidate) => candidate.id === input.countryId);
  if (country === undefined) throw new RangeError("missing country");
  const record = monetaryCurrencyForCountry(world, country.id);
  if (record === null) throw new RangeError("missing monetary authority");
  const currencyId = record.currencyId;

  const openingMonetary = cloneMonetaryState(world.monetary);
  const openingValuations = cloneValuations(world.currencyValuations);
  const openingBalances = new Map<Id, number>();
  for (const account of world.finance.accounts) {
    openingBalances.set(account.id, account.balanceRUSD);
  }
  const openingPostings = [...world.finance.postings];
  const openingNextPostingId = world.finance.nextPostingId;

  try {
    const entries: JournalEntryInput[] = [];
    let revaluationRUSD = 0;
    const oldValuation = currencyValuationOf(world, currencyId);
    const oldUnits = record.currencyIssuedUnits;
    const oldParity = record.parityRusdPerUnit;
    const wasActive = record.active;

    // 1. Treasury reserve capitalization or withdrawal.
    if (input.reserveTransferRUSD !== 0) {
      if (record.reserveAccountId === null || record.equityAccountId === null) {
        throw new RangeError("monetary authority has no reserve accounts");
      }
      const equityId = accountIdFor(world, "country", country.id, "owner-equity");
      const amount = Math.abs(input.reserveTransferRUSD);
      const deposit = input.reserveTransferRUSD > 0;
      entries.push({
        transactionKind: "monetary-reserve-contribution",
        lines: [
          { accountId: equityId, side: deposit ? "debit" : "credit", amountRUSD: amount },
          {
            accountId: country.treasuryAccountId,
            side: deposit ? "credit" : "debit",
            amountRUSD: amount,
          },
          {
            accountId: record.reserveAccountId,
            side: deposit ? "debit" : "credit",
            amountRUSD: amount,
          },
          {
            accountId: record.equityAccountId,
            side: deposit ? "credit" : "debit",
            amountRUSD: amount,
          },
        ],
        sourceEntityId: country.id,
        targetEntityId: null,
      });
    }

    // 2. Resolve the next parity and valuation.
    let nextParity = oldParity;
    if (input.parityRusdPerUnit !== null) {
      nextParity = parseCurrencyRate(input.parityRusdPerUnit, "parityRusdPerUnit");
    }
    let nextValuation: RusdPerCurrencyUnit | null;
    if (!wasActive) {
      if (nextParity === null) {
        throw new RangeError("establishing the authority requires a parity");
      }
      nextValuation = nextParity;
    } else if (input.regime === "pegged") {
      if (nextParity === null) throw new RangeError("a pegged authority requires a parity");
      nextValuation = nextParity;
    } else {
      nextValuation = oldValuation ?? nextParity;
    }
    if (nextValuation === null) {
      throw new RangeError("an active authority requires a specified valuation");
    }

    // 3. Revalue the circulation that existed before this operation.
    if (oldUnits > 0 && oldValuation !== null) {
      const delta = oldUnits * (nextValuation - oldValuation);
      revaluationRUSD += applyRevaluation(record, delta, dayIndex, entries);
    }
    if (oldValuation === null || Math.abs(nextValuation - oldValuation) > Math.abs(nextValuation) * 1e-12) {
      setCurrencyValuation(world, currencyId, nextValuation, dayIndex, "policy");
    }

    // 4. Currency issue/redemption at the resulting valuation.
    if (input.currencyConversionRUSD !== 0) {
      if (
        record.reserveAccountId === null ||
        record.liabilityAccountId === null ||
        record.externalCashAccountId === null ||
        record.externalCurrencyAccountId === null
      ) {
        throw new RangeError("monetary authority has no conversion accounts");
      }
      const amount = Math.abs(input.currencyConversionRUSD);
      const issue = input.currencyConversionRUSD > 0;
      entries.push({
        transactionKind: issue ? "fx-issuance" : "fx-redemption",
        lines: [
          {
            accountId: record.reserveAccountId,
            side: issue ? "debit" : "credit",
            amountRUSD: amount,
          },
          {
            accountId: record.liabilityAccountId,
            side: issue ? "credit" : "debit",
            amountRUSD: amount,
          },
          {
            accountId: record.externalCurrencyAccountId,
            side: issue ? "debit" : "credit",
            amountRUSD: amount,
          },
          {
            accountId: record.externalCashAccountId,
            side: issue ? "credit" : "debit",
            amountRUSD: amount,
          },
        ],
        sourceEntityId: issue ? record.externalCashAccountId : record.externalCurrencyAccountId,
        targetEntityId: country.id,
      });
      record.currencyIssuedUnits += (issue ? amount : -amount) / nextValuation;
    }

    // 5. Publish the policy state.
    record.active = true;
    record.regime = input.regime;
    record.parityRusdPerUnit = nextParity;
    if (record.referenceParityRusdPerUnit === null) {
      record.referenceParityRusdPerUnit = nextParity;
    }
    const parityChanged =
      !wasActive ||
      (oldParity !== null &&
        nextParity !== null &&
        Math.abs(nextParity - oldParity) > Math.abs(oldParity) * 1e-12);
    if (parityChanged) record.lastParityChangeDay = dayIndex;

    const postings =
      entries.length === 0 ? [] : postJournalBatch(world.finance, dayIndex, entries);
    return {
      countryId: country.id,
      currencyId,
      regime: record.regime,
      parityRusdPerUnit: record.parityRusdPerUnit ?? nextValuation,
      valuationRusdPerUnit: currencyValuationOf(world, currencyId) ?? nextValuation,
      reserveTransferRUSD: input.reserveTransferRUSD,
      currencyConversionRUSD: input.currencyConversionRUSD,
      currencyIssuedUnits: record.currencyIssuedUnits,
      revaluationRUSD,
      postalIds: postings.map((posting) => posting.id),
    };
  } catch (error) {
    world.monetary = openingMonetary;
    world.currencyValuations = openingValuations;
    for (const account of world.finance.accounts) {
      const balance = openingBalances.get(account.id);
      if (balance === undefined) {
        throw new RangeError(`monetary rollback lost account ${String(account.id)}`);
      }
      account.balanceRUSD = balance;
    }
    world.finance.postings = openingPostings;
    world.finance.nextPostingId = openingNextPostingId;
    throw error;
  }
}

function accountIdFor(
  world: World,
  ownerKind: "country" | "system",
  ownerId: Id | null,
  subtype: string,
): Id {
  const account = world.finance.accounts.find(
    (candidate) =>
      candidate.ownerKind === ownerKind &&
      candidate.ownerId === ownerId &&
      candidate.subtype === subtype,
  );
  if (account === undefined) {
    throw new RangeError(`missing ${ownerKind} ${subtype} account for monetary policy`);
  }
  return account.id;
}

// ---------------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------------

/** True when a trade block reason is the FX-convertibility control. */
export function isFxTradeBlockReason(value: string): boolean {
  return value === "fx-convertibility";
}
