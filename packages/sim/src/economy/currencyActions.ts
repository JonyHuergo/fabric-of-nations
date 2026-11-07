/**
 * D-140 / D-150: changing a country's currency (docs/P5B_PLAN.md §13.6). Player actions
 * only; the AI does not switch currencies in P5b.
 *
 * - `adopt-currency`: a country with its own currency gives it up for another registered
 *   currency. Its circulation is redeemed at the current valuation (the currency
 *   liability and the outside holding are written off together; the unit leaves use),
 *   the authority's reserve cash returns to the treasury, and the authority closes. Its
 *   reserve metal stays with the closed authority and is sold to the home market's
 *   dealer at the market price, at most MINT_MAX_DAILY_SALE_SHARE a day, the proceeds
 *   going to the treasury, until none is left (`runDemonetisation`).
 * - `establish-currency`: a country that uses another's currency creates its own on a
 *   gold, silver or paper standard. The unit's value is the value of the currency it used;
 *   a metal unit's fine content is that value at today's metal price in its home market.
 *   The treasury funds the authority's reserve cash. Nothing circulates at first; a metal
 *   currency becomes convertible once its mint holds metal.
 *
 * Every flow is a balanced posting of an existing E6b or D-149 kind; goods and designated
 * cash are conserved.
 */

import { QUANTITY_TOLERANCE } from "../population/constants.js";
import { MONEY_TOLERANCE_RUSD } from "../population/constants.js";
import type { DayIndex, Id } from "../types.js";
import type { World } from "../world.js";
import { buildFinanceIndex, categoryForSubtype } from "./accounts.js";
import { postJournalBatch, type JournalEntryInput } from "./accounting.js";
import { MINT_MAX_DAILY_SALE_SHARE } from "./constants.js";
import { asRusdPerCurrencyUnit } from "./currency.js";
import { lotTableFromLots, lotTableToLots } from "./inventory.js";
import { issuerHomeMarketId } from "./mint.js";
import { accountBalanceRUSD, currencyValuationOf } from "./monetaryState.js";
import type {
  AccountSubtype,
  EconomyDefinitions,
  FinancialAccount,
  MonetaryCurrencyState,
  MonetaryStandard,
} from "./types.js";
import { MONETARY_STANDARDS } from "./types.js";

export interface AdoptCurrencyInput {
  readonly countryId: Id;
  readonly currencyId: Id;
}

export interface EstablishCurrencyInput {
  readonly countryId: Id;
  readonly standard: MonetaryStandard;
  /** Player-facing name; defaults to "<country> currency". */
  readonly name: string | null;
  readonly reserveFundingRUSD: number;
}

/** What an adoption will do (preview and result). */
export interface AdoptCurrencyEffect {
  readonly redeemedUnits: number;
  readonly redeemedRUSD: number;
  readonly reserveCashToTreasuryRUSD: number;
  readonly metalToSellKg: number;
}

function ownRecord(world: World, countryId: Id): MonetaryCurrencyState | undefined {
  const country = world.countries.find((entry) => entry.id === countryId);
  if (country === undefined || country.monetary.kind !== "own") return undefined;
  const currencyId = country.monetary.currencyId;
  return world.monetary.currencies.find((record) => record.currencyId === currencyId && record.issuerCountryId === countryId);
}

/** Validate an adoption; returns the errors (empty when valid). */
export function validateAdoptCurrency(world: World, input: AdoptCurrencyInput): string[] {
  const errors: string[] = [];
  if (!world.monetary.enabled) return ["the monetary system is not enabled in this world"];
  const country = world.countries.find((entry) => entry.id === input.countryId);
  if (country === undefined) return [`country ${String(input.countryId)} is not registered`];
  if (country.monetary.kind !== "own") errors.push("only a country with its own currency can adopt another");
  const target = world.currencies.find((currency) => currency.id === input.currencyId);
  if (target === undefined) errors.push(`currency ${String(input.currencyId)} is not registered`);
  else if (country.monetary.kind === "own" && target.id === country.monetary.currencyId) errors.push("a country cannot adopt its own currency");
  else if (currencyValuationOf(world, input.currencyId) === null) errors.push("the adopted currency has no valuation");
  if (target !== undefined && target.issuer.kind === "country") {
    const issuer = world.countries.find((entry) => entry.id === (target.issuer as { countryId: Id }).countryId);
    if (issuer === undefined || issuer.monetary.kind !== "own" || issuer.monetary.currencyId !== target.id) {
      errors.push("the adopted currency is no longer issued by its country");
    }
  }
  return errors;
}

/** The effect of an adoption, for the preview. */
export function adoptCurrencyEffect(world: World, countryId: Id): AdoptCurrencyEffect {
  const record = ownRecord(world, countryId);
  if (record === undefined) return { redeemedUnits: 0, redeemedRUSD: 0, reserveCashToTreasuryRUSD: 0, metalToSellKg: 0 };
  return {
    redeemedUnits: record.active ? record.currencyIssuedUnits : 0,
    redeemedRUSD: record.active ? accountBalanceRUSD(world, record.liabilityAccountId) : 0,
    reserveCashToTreasuryRUSD: accountBalanceRUSD(world, record.reserveAccountId),
    metalToSellKg: record.metalReserveKg,
  };
}

/** Apply a validated adoption atomically (throws, leaving the world unchanged, on failure). */
export function applyAdoptCurrency(world: World, input: AdoptCurrencyInput, dayIndex: DayIndex): AdoptCurrencyEffect {
  const errors = validateAdoptCurrency(world, input);
  if (errors.length > 0) throw new RangeError(errors.join("; "));
  const country = world.countries.find((entry) => entry.id === input.countryId)!;
  const record = ownRecord(world, input.countryId);
  const effect = adoptCurrencyEffect(world, input.countryId);
  const entries: JournalEntryInput[] = [];
  if (record !== undefined) {
    if (record.active && effect.redeemedRUSD > MONEY_TOLERANCE_RUSD) {
      // Redemption at the current valuation: the liability and the outside holding go
      // together (the E6b revaluation structure, to zero).
      entries.push({
        transactionKind: "fx-revaluation",
        lines: [
          { accountId: record.liabilityAccountId!, side: "debit", amountRUSD: effect.redeemedRUSD },
          { accountId: record.equityAccountId!, side: "credit", amountRUSD: effect.redeemedRUSD },
          { accountId: record.externalCurrencyAccountId!, side: "credit", amountRUSD: effect.redeemedRUSD },
          { accountId: record.externalEquityAccountId!, side: "debit", amountRUSD: effect.redeemedRUSD },
        ],
        sourceEntityId: country.id,
        targetEntityId: null,
      });
    }
    if (effect.reserveCashToTreasuryRUSD > MONEY_TOLERANCE_RUSD) {
      entries.push(reserveToTreasury(world, record, country.id, effect.reserveCashToTreasuryRUSD));
    }
  }
  const snapshot = record === undefined ? undefined : { ...record };
  const arrangement = country.monetary;
  try {
    if (entries.length > 0) postJournalBatch(world.finance, dayIndex, entries);
    if (record !== undefined) {
      record.active = false;
      record.currencyIssuedUnits = 0;
      record.convertible = false;
      record.regime = "pegged";
      if (!(record.metalReserveKg > QUANTITY_TOLERANCE)) closeMetal(record);
    }
    country.monetary = { kind: "adopted", currencyId: input.currencyId };
  } catch (error) {
    if (record !== undefined && snapshot !== undefined) Object.assign(record, snapshot);
    country.monetary = arrangement;
    throw error;
  }
  return effect;
}

/** Validate an establishment; returns the errors (empty when valid). */
export function validateEstablishCurrency(world: World, definitions: EconomyDefinitions | undefined, input: EstablishCurrencyInput): string[] {
  const errors: string[] = [];
  if (!world.monetary.enabled) return ["the monetary system is not enabled in this world"];
  const country = world.countries.find((entry) => entry.id === input.countryId);
  if (country === undefined) return [`country ${String(input.countryId)} is not registered`];
  if (country.monetary.kind !== "adopted") errors.push("only a country that uses another's currency can establish its own");
  if (!(MONETARY_STANDARDS as readonly string[]).includes(input.standard)) errors.push(`standard must be one of ${MONETARY_STANDARDS.join(", ")}`);
  if (input.standard !== "paper" && definitions !== undefined && !definitions.goods.some((good) => good.key === input.standard)) {
    errors.push(`a ${input.standard} standard needs a ${input.standard} good`);
  }
  if (input.name !== null && (typeof input.name !== "string" || input.name.trim().length === 0 || input.name.length > 64)) {
    errors.push("the currency name must be 1 to 64 characters");
  }
  if (!Number.isFinite(input.reserveFundingRUSD) || input.reserveFundingRUSD < 0) errors.push("the reserve funding must be finite and non-negative");
  else {
    const treasury = world.finance.accounts.find((account) => account.id === country.treasuryAccountId)?.balanceRUSD ?? 0;
    if (input.reserveFundingRUSD > treasury + MONEY_TOLERANCE_RUSD) errors.push("the reserve funding exceeds the treasury's cash");
  }
  if (country.monetary.kind === "adopted" && currencyValuationOf(world, country.monetary.currencyId) === null) {
    errors.push("the currency in use has no valuation to start from");
  }
  const previous = world.monetary.currencies.find((record) => record.currencyId === country.id);
  if (previous !== undefined && previous.metalReserveKg > QUANTITY_TOLERANCE && previous.standard !== input.standard) {
    errors.push(`the former ${previous.standard} reserve must be sold before a ${input.standard} standard`);
  }
  if (input.standard !== "paper" && definitions !== undefined && homePrice(world, definitions, country.id, input.standard) <= 0) {
    errors.push("the country has no home market to price its metal");
  }
  return errors;
}

/** Apply a validated establishment atomically. Returns the new currency's id. */
export function applyEstablishCurrency(
  world: World,
  definitions: EconomyDefinitions,
  input: EstablishCurrencyInput,
  dayIndex: DayIndex,
): Id {
  const errors = validateEstablishCurrency(world, definitions, input);
  if (errors.length > 0) throw new RangeError(errors.join("; "));
  const country = world.countries.find((entry) => entry.id === input.countryId)!;
  if (country.monetary.kind !== "adopted") throw new RangeError("unreachable");
  const parity = currencyValuationOf(world, country.monetary.currencyId)!;
  const currencyId = country.id;
  const before = {
    currencies: world.currencies.map((currency) => ({ ...currency })),
    valuations: world.currencyValuations.map((valuation) => ({ ...valuation })),
    records: world.monetary.currencies.map((record) => ({ ...record })),
    accounts: world.finance.accounts.length,
    nextAccountId: world.finance.nextAccountId,
    arrangement: country.monetary,
  };
  try {
    if (!world.currencies.some((currency) => currency.id === currencyId)) {
      const taken = new Set(world.currencies.map((currency) => currency.key));
      let key = `own-${country.tag.toLowerCase()}`;
      for (let suffix = 2; taken.has(key); suffix += 1) key = `own-${country.tag.toLowerCase()}-${String(suffix)}`;
      world.currencies.push({ id: currencyId, key, name: input.name ?? `${country.name} currency`, issuer: { kind: "country", countryId: country.id } });
      world.currencies.sort((left, right) => left.id - right.id);
    }
    const index = world.currencyValuations.findIndex((entry) => entry.currencyId === currencyId);
    const valuation = { currencyId, status: "specified" as const, rusdPerUnit: parity, setOnDay: dayIndex, source: "policy" as const };
    if (index < 0) {
      world.currencyValuations.push(valuation);
      world.currencyValuations.sort((left, right) => left.currencyId - right.currencyId);
    } else world.currencyValuations[index] = valuation;

    let record = world.monetary.currencies.find((entry) => entry.currencyId === currencyId);
    if (record === undefined) {
      record = {
        currencyId,
        issuerCountryId: country.id,
        regime: "pegged",
        parityRusdPerUnit: parity,
        referenceParityRusdPerUnit: parity,
        currencyIssuedUnits: 0,
        active: true,
        reserveAccountId: allocate(world, "country", country.id, "monetary-reserve-cash").id,
        liabilityAccountId: allocate(world, "country", country.id, "currency-liability").id,
        equityAccountId: allocate(world, "country", country.id, "monetary-equity").id,
        externalCashAccountId: allocate(world, "system", null, "external-cash").id,
        externalCurrencyAccountId: allocate(world, "system", null, "external-currency-holding").id,
        externalEquityAccountId: allocate(world, "system", null, "external-equity").id,
        lastParityChangeDay: dayIndex,
        lastManagedUpdateDay: null,
        lastMonthEndDay: null,
        lastMonthExportsRUSD: 0,
        lastMonthImportsRUSD: 0,
        standard: "paper",
        fineGramsPerUnit: 0,
        metalReserveKg: 0,
        metalReserveAccountId: null,
        convertible: false,
        lastMintSaleKg: 0,
      };
      world.monetary.currencies.push(record);
      world.monetary.currencies.sort((left, right) => left.currencyId - right.currencyId);
    } else {
      record.active = true;
      record.regime = "pegged";
      record.parityRusdPerUnit = parity;
      record.referenceParityRusdPerUnit = parity;
      record.currencyIssuedUnits = 0;
      record.lastParityChangeDay = dayIndex;
    }
    record.standard = input.standard;
    if (input.standard === "paper") {
      record.fineGramsPerUnit = 0;
      record.convertible = false;
    } else {
      const price = homePrice(world, definitions, country.id, input.standard);
      record.fineGramsPerUnit = (parity / price) * 1000;
      if (record.metalReserveAccountId === null) record.metalReserveAccountId = allocate(world, "country", country.id, "monetary-metal-reserve").id;
      record.convertible = record.metalReserveKg > QUANTITY_TOLERANCE;
    }
    record.parityRusdPerUnit = asRusdPerCurrencyUnit(parity);
    record.referenceParityRusdPerUnit = asRusdPerCurrencyUnit(parity);
    if (input.reserveFundingRUSD > MONEY_TOLERANCE_RUSD) {
      const finance = buildFinanceIndex(world.finance);
      postJournalBatch(world.finance, dayIndex, [{
        transactionKind: "monetary-reserve-contribution",
        lines: [
          { accountId: country.treasuryAccountId, side: "credit", amountRUSD: input.reserveFundingRUSD },
          { accountId: finance.get("country", country.id, "owner-equity").id, side: "debit", amountRUSD: input.reserveFundingRUSD },
          { accountId: record.reserveAccountId!, side: "debit", amountRUSD: input.reserveFundingRUSD },
          { accountId: record.equityAccountId!, side: "credit", amountRUSD: input.reserveFundingRUSD },
        ],
        sourceEntityId: country.id,
        targetEntityId: null,
      }]);
    }
    country.monetary = { kind: "own", currencyId };
  } catch (error) {
    world.currencies = before.currencies;
    world.currencyValuations = before.valuations;
    world.monetary.currencies = before.records;
    world.finance.accounts.length = before.accounts;
    world.finance.nextAccountId = before.nextAccountId;
    country.monetary = before.arrangement;
    throw error;
  }
  return currencyId;
}

/**
 * Sell the metal of closed authorities (after an adoption) to their home market's
 * dealer at the market price, at most MINT_MAX_DAILY_SALE_SHARE a day, the proceeds
 * going to the treasury. Runs in the monetary phase; appends its postings.
 */
export function runDemonetisation(world: World, definitions: EconomyDefinitions, record: MonetaryCurrencyState, entries: JournalEntryInput[], spentByBuilding: Map<Id, number>): number {
  if (record.active || record.standard === "paper" || record.issuerCountryId === null || record.metalReserveAccountId === null || record.reserveAccountId === null) return 0;
  const country = world.countries.find((entry) => entry.id === record.issuerCountryId);
  const goodId = definitions.goods.find((good) => good.key === record.standard)?.id;
  const marketId = country === undefined ? undefined : issuerHomeMarketId(world, country.id);
  const market = marketId === undefined ? undefined : world.markets.find((entry) => entry.id === marketId);
  if (country === undefined || goodId === undefined || market === undefined) return 0;
  const price = market.priceRUSD[goodId] ?? 0;
  if (!(price > 0)) return 0;
  // Measure the metal at today's price first.
  const booked = accountBalanceRUSD(world, record.metalReserveAccountId);
  const delta = record.metalReserveKg * price - booked;
  if (Math.abs(delta) > MONEY_TOLERANCE_RUSD * Math.max(1, Math.abs(booked)) && record.equityAccountId !== null) {
    entries.push({
      transactionKind: "metal-revaluation",
      lines: [
        { accountId: record.metalReserveAccountId, side: delta > 0 ? "debit" : "credit", amountRUSD: Math.abs(delta) },
        { accountId: record.equityAccountId, side: delta > 0 ? "credit" : "debit", amountRUSD: Math.abs(delta) },
      ],
      sourceEntityId: country.id,
      targetEntityId: null,
    });
  }
  const definitionById = new Map(definitions.buildings.map((definition) => [definition.id, definition]));
  const marketOfProvince = new Map<Id, Id | null>(world.provinceEconomies.map((province) => [province.id, province.marketId]));
  let dealer: { id: Id; capacity: number } | undefined;
  for (const building of world.buildings) {
    if (!building.operational || marketOfProvince.get(building.provinceId) !== market.id) continue;
    const capacity = (definitionById.get(building.definitionId)?.storageCapacityByGood.find((item) => item.goodId === goodId)?.quantity ?? 0) * building.level;
    if (capacity > 0 && (dealer === undefined || capacity > dealer.capacity || (capacity === dealer.capacity && building.id < dealer.id))) dealer = { id: building.id, capacity };
  }
  if (dealer === undefined) return 0;
  const finance = buildFinanceIndex(world.finance);
  const cash = finance.get("building", dealer.id, "operating-cash");
  const available = Math.max(0, cash.balanceRUSD - (spentByBuilding.get(dealer.id) ?? 0));
  const byCash = available / price;
  const quantity = Math.min(record.metalReserveKg * MINT_MAX_DAILY_SALE_SHARE, record.metalReserveKg < 1e-3 ? record.metalReserveKg : Number.POSITIVE_INFINITY, byCash);
  if (!(quantity > QUANTITY_TOLERANCE)) return 0;
  const amount = quantity === byCash ? available : Math.min(quantity * price, available);
  entries.push({
    transactionKind: "mint-sale",
    lines: [
      { accountId: finance.get("building", dealer.id, "input-expense").id, side: "debit", amountRUSD: amount },
      { accountId: cash.id, side: "credit", amountRUSD: amount },
      { accountId: record.reserveAccountId, side: "debit", amountRUSD: amount },
      { accountId: record.metalReserveAccountId, side: "credit", amountRUSD: amount },
    ],
    sourceEntityId: country.id,
    targetEntityId: dealer.id,
  });
  entries.push(reserveToTreasury(world, record, country.id, amount));
  spentByBuilding.set(dealer.id, (spentByBuilding.get(dealer.id) ?? 0) + amount);
  const table = lotTableFromLots(market.stockLots, [dealer.id], definitions.goods.length);
  const cell = goodId * table.owners.length + (table.slotOf.get(dealer.id) ?? 0);
  table.quantity[cell] = (table.quantity[cell] ?? 0) + quantity;
  table.present[cell] = 1;
  market.stockLots = lotTableToLots(table);
  const kgBefore = record.metalReserveKg;
  record.metalReserveKg -= quantity;
  if (!(record.metalReserveKg > QUANTITY_TOLERANCE)) {
    // The last of the metal: empty the account exactly, then the record is paper again.
    const remaining = kgBefore * price - amount;
    if (Math.abs(remaining) > 0 && record.equityAccountId !== null) {
      entries.push({
        transactionKind: "metal-revaluation",
        lines: [
          { accountId: record.metalReserveAccountId, side: remaining > 0 ? "credit" : "debit", amountRUSD: Math.abs(remaining) },
          { accountId: record.equityAccountId, side: remaining > 0 ? "debit" : "credit", amountRUSD: Math.abs(remaining) },
        ],
        sourceEntityId: country.id,
        targetEntityId: null,
      });
    }
    closeMetal(record);
  }
  return quantity;
}

/** After the last metal is sold (and its account emptied), the record is paper again. */
export function closeMetal(record: MonetaryCurrencyState): void {
  record.standard = "paper";
  record.fineGramsPerUnit = 0;
  record.metalReserveKg = 0;
  record.metalReserveAccountId = null;
  record.convertible = false;
  record.lastMintSaleKg = 0;
}

function reserveToTreasury(world: World, record: MonetaryCurrencyState, countryId: Id, amount: number): JournalEntryInput {
  const country = world.countries.find((entry) => entry.id === countryId)!;
  const finance = buildFinanceIndex(world.finance);
  return {
    transactionKind: "monetary-reserve-contribution",
    lines: [
      { accountId: country.treasuryAccountId, side: "debit", amountRUSD: amount },
      { accountId: finance.get("country", countryId, "owner-equity").id, side: "credit", amountRUSD: amount },
      { accountId: record.reserveAccountId!, side: "credit", amountRUSD: amount },
      { accountId: record.equityAccountId!, side: "debit", amountRUSD: amount },
    ],
    sourceEntityId: countryId,
    targetEntityId: null,
  };
}

function homePrice(world: World, definitions: EconomyDefinitions, countryId: Id, standard: MonetaryStandard): number {
  const goodId = definitions.goods.find((good) => good.key === standard)?.id;
  const marketId = issuerHomeMarketId(world, countryId);
  if (goodId === undefined || marketId === undefined) return 0;
  return world.markets.find((market) => market.id === marketId)?.priceRUSD[goodId] ?? 0;
}

function allocate(world: World, ownerKind: "country" | "system", ownerId: Id | null, subtype: AccountSubtype): FinancialAccount {
  const id = world.finance.nextAccountId;
  world.finance.nextAccountId = id + 1;
  const account: FinancialAccount = { id, ownerKind, ownerId, category: categoryForSubtype(subtype), subtype, balanceRUSD: 0 };
  world.finance.accounts.push(account);
  return account;
}
