/**
 * P3 (D-141) — 1900 currencies, monetary arrangements and opening valuations.
 *
 * Content, not simulation logic: this module reads and validates
 * `historical/p3/currencies_1900.json` and derives, for every currency of the 1900 world,
 * the fine metal content of its legal unit, its 1900 circulating value in US gold dollars
 * and its opening `rusdPerUnit`.
 *
 * Formulas (units in brackets; evaluated once, at scenario build):
 * - legal value [USD/unit]: the Mint table value, a par with another listed unit
 *   (`par value x ratio`), or `fine grams x metal price [USD/g]`.
 * - fine content [g/unit] = legal value / metal price [USD/g] (or the given grams).
 * - circulating value [USD/unit]: the legal value, or for inconvertible paper
 *   `reference / (1 + premium / 100)` where the reference is the own legal unit or the US
 *   gold dollar, or `pence per unit x GBP legal value / 240` for a London quotation.
 * - rusdPerUnit [RUSD/unit] = circulating value x CPI(1990) / CPI(1900) (D-130 deflator).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CURRENCY_RATE_MAX,
  CURRENCY_RATE_MIN,
  LEGACY_SUSD_CURRENCY_KEY,
  MAX_CURRENCY_KEY_LENGTH,
  MAX_CURRENCY_NAME_LENGTH,
  RUSD_CURRENCY_KEY,
} from "@century/sim";

const DATA_ROOT = fileURLToPath(new URL("../data/", import.meta.url));

export const CURRENCY_TABLE_1900_FILE = "historical/p3/currencies_1900.json";

export const CURRENCY_STANDARDS = ["gold", "silver", "paper"] as const;
export type CurrencyStandard = (typeof CURRENCY_STANDARDS)[number];
export const MONETARY_METALS = ["gold", "silver"] as const;
export type MonetaryMetal = (typeof MONETARY_METALS)[number];
export const CURRENCY_DATA_STATUSES = ["sourced", "secondary", "derived", "provisional"] as const;
export type CurrencyDataStatus = (typeof CURRENCY_DATA_STATUSES)[number];

/** One derived currency of the 1900 world (an own or a foreign-issued currency). */
export interface CurrencyParity1900 {
  /** Issuing country tag, or null for a foreign-issued currency. */
  readonly issuerTag: string | null;
  /** Foreign issuer key, or null for a country's own currency. */
  readonly foreignIssuerKey: string | null;
  readonly key: string;
  readonly name: string;
  readonly standard: CurrencyStandard;
  readonly metal: MonetaryMetal;
  /** Fine metal content of the legal unit [g/unit]. */
  readonly fineGramsPerUnit: number;
  /** Legal (metal) value of one unit [USD/unit]. */
  readonly legalUsdPerUnit: number;
  /** 1900 circulating value of one unit [USD/unit]. */
  readonly circulatingUsdPerUnit: number;
  /** Opening valuation [RUSD/unit]. */
  readonly rusdPerUnit: number;
  readonly status: CurrencyDataStatus;
  readonly sourceIds: readonly string[];
  readonly valueLocator: string;
  readonly circulationLocator: string | null;
}

/** One country's 1900 monetary arrangement. */
export type CurrencyArrangement1900 =
  | { readonly tag: string; readonly kind: "own"; readonly currencyKey: string }
  | {
      readonly tag: string;
      readonly kind: "adopted";
      readonly currencyKey: string;
      /** Issuing country tag of the adopted currency, or null for a foreign issuer. */
      readonly issuerTag: string | null;
      readonly status: CurrencyDataStatus;
      readonly sourceIds: readonly string[];
    };

export interface CurrencyTable1900 {
  readonly usdToRusd: number;
  readonly metalUsdPerFineGram: Readonly<Record<MonetaryMetal, number>>;
  readonly currencies: readonly CurrencyParity1900[];
  readonly arrangements: readonly CurrencyArrangement1900[];
  readonly sourceIds: readonly string[];
}

export class CurrencyTableError extends Error {
  readonly errors: readonly string[];
  constructor(errors: readonly string[]) {
    super(`Invalid P3 currency table:\n- ${errors.join("\n- ")}`);
    this.name = "CurrencyTableError";
    this.errors = errors;
  }
}

type Json = Record<string, unknown>;

function record(value: unknown, path: string, errors: string[]): Json {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    errors.push(`${path} must be an object`);
    return {};
  }
  return value as Json;
}

function text(value: Json, field: string, path: string, errors: string[]): string {
  const entry = value[field];
  if (typeof entry !== "string" || entry.trim() === "") {
    errors.push(`${path}.${field} must be a non-empty string`);
    return "";
  }
  return entry;
}

function positive(value: Json, field: string, path: string, errors: string[]): number {
  const entry = value[field];
  if (typeof entry !== "number" || !Number.isFinite(entry) || !(entry > 0)) {
    errors.push(`${path}.${field} must be a positive finite number`);
    return Number.NaN;
  }
  return entry;
}

function oneOf<T extends string>(
  value: Json,
  field: string,
  allowed: readonly T[],
  path: string,
  errors: string[],
): T {
  const entry = value[field];
  if (typeof entry !== "string" || !(allowed as readonly string[]).includes(entry)) {
    errors.push(`${path}.${field} must be one of ${allowed.join(", ")}`);
    return allowed[0] as T;
  }
  return entry as T;
}

function sourceList(value: Json, path: string, known: ReadonlySet<string>, errors: string[]): string[] {
  const entry = value.sourceIds;
  if (!Array.isArray(entry) || entry.length === 0) {
    errors.push(`${path}.sourceIds must be a non-empty array`);
    return [];
  }
  const ids: string[] = [];
  for (const id of entry) {
    if (typeof id !== "string" || !known.has(id)) {
      errors.push(`${path}.sourceIds references unknown source ${JSON.stringify(id)}`);
    } else {
      ids.push(id);
    }
  }
  return ids;
}

function readJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(join(DATA_ROOT, relativePath), "utf8")) as unknown;
}

interface RawCurrency {
  readonly path: string;
  readonly issuerTag: string | null;
  readonly foreignIssuerKey: string | null;
  readonly key: string;
  readonly name: string;
  readonly standard: CurrencyStandard;
  readonly metal: MonetaryMetal;
  readonly value: Json;
  readonly circulation: Json | null;
  readonly status: CurrencyDataStatus;
  readonly sourceIds: readonly string[];
}

function readCurrency(
  raw: Json,
  path: string,
  issuerTag: string | null,
  foreignIssuerKey: string | null,
  knownSources: ReadonlySet<string>,
  errors: string[],
): RawCurrency {
  const key = text(raw, "key", path, errors);
  if (!/^[a-z][a-z0-9-]*$/.test(key)) errors.push(`${path}.key must be a lower-case identifier`);
  if (key.length > MAX_CURRENCY_KEY_LENGTH) {
    errors.push(`${path}.key must be at most ${String(MAX_CURRENCY_KEY_LENGTH)} characters`);
  }
  if (key === RUSD_CURRENCY_KEY || key === LEGACY_SUSD_CURRENCY_KEY) {
    errors.push(`${path}.key is reserved for RUSD`);
  }
  const name = text(raw, "name", path, errors);
  if (name.length > MAX_CURRENCY_NAME_LENGTH) {
    errors.push(`${path}.name must be at most ${String(MAX_CURRENCY_NAME_LENGTH)} characters`);
  }
  const standard = oneOf(raw, "standard", CURRENCY_STANDARDS, path, errors);
  const metal = oneOf(raw, "metal", MONETARY_METALS, path, errors);
  if (standard !== "paper" && standard !== metal) {
    errors.push(`${path}: a ${standard}-standard currency must name ${standard} as its metal`);
  }
  const status = oneOf(raw, "status", CURRENCY_DATA_STATUSES, path, errors);
  const value = record(raw.value, `${path}.value`, errors);
  const circulation =
    raw.circulation === undefined ? null : record(raw.circulation, `${path}.circulation`, errors);
  if (standard === "paper" && circulation === null && status !== "provisional") {
    errors.push(`${path}: an inconvertible paper currency needs a circulation rate or provisional status`);
  }
  return {
    path,
    issuerTag,
    foreignIssuerKey,
    key,
    name,
    standard,
    metal,
    value,
    circulation,
    status,
    sourceIds: sourceList(raw, path, knownSources, errors),
  };
}

/**
 * Parse, validate and derive the 1900 currency table. Every failure is collected and
 * thrown as one `CurrencyTableError` with deterministically ordered messages.
 */
export function parseCurrencyTable1900(
  document: unknown,
  deflatorRows: ReadonlyMap<string, number>,
  countryTags: readonly string[],
): CurrencyTable1900 {
  const errors: string[] = [];
  const doc = record(document, "currencies", errors);

  const sourcesRaw = Array.isArray(doc.sources) ? doc.sources : [];
  if (!Array.isArray(doc.sources)) errors.push("currencies.sources must be an array");
  const knownSources = new Set<string>();
  sourcesRaw.forEach((entry, index) => {
    const source = record(entry, `currencies.sources[${String(index)}]`, errors);
    const id = text(source, "id", `currencies.sources[${String(index)}]`, errors);
    text(source, "title", `currencies.sources[${String(index)}]`, errors);
    text(source, "url", `currencies.sources[${String(index)}]`, errors);
    if (knownSources.has(id)) errors.push(`currencies.sources id ${id} is duplicated`);
    knownSources.add(id);
  });

  const deflator = record(doc.deflator, "currencies.deflator", errors);
  const cpi1900 = deflatorRows.get(text(deflator, "cpi1900RowId", "currencies.deflator", errors));
  const cpi1990 = deflatorRows.get(text(deflator, "cpi1990RowId", "currencies.deflator", errors));
  if (cpi1900 === undefined || cpi1990 === undefined || !(cpi1900 > 0) || !(cpi1990 > 0)) {
    errors.push("currencies.deflator rows must resolve to positive CPI values");
  }
  const usdToRusd = (cpi1990 ?? Number.NaN) / (cpi1900 ?? Number.NaN);

  const metals = record(doc.metals, "currencies.metals", errors);
  const metalPrice = {} as Record<MonetaryMetal, number>;
  for (const metal of MONETARY_METALS) {
    const entry = record(metals[metal], `currencies.metals.${metal}`, errors);
    metalPrice[metal] = positive(entry, "usdPerFineGram", `currencies.metals.${metal}`, errors);
    const sourceId = text(entry, "sourceId", `currencies.metals.${metal}`, errors);
    if (!knownSources.has(sourceId)) errors.push(`currencies.metals.${metal}.sourceId is unknown`);
    oneOf(entry, "status", CURRENCY_DATA_STATUSES, `currencies.metals.${metal}`, errors);
  }

  const referenceUnits = new Map<string, number>();
  const referencesRaw = record(doc.referenceUnits ?? {}, "currencies.referenceUnits", errors);
  for (const [name, entry] of Object.entries(referencesRaw)) {
    const reference = record(entry, `currencies.referenceUnits.${name}`, errors);
    referenceUnits.set(name, positive(reference, "usd", `currencies.referenceUnits.${name}`, errors));
    const sourceId = text(reference, "sourceId", `currencies.referenceUnits.${name}`, errors);
    if (!knownSources.has(sourceId)) errors.push(`currencies.referenceUnits.${name}.sourceId is unknown`);
  }

  const raws: RawCurrency[] = [];
  const foreignRaw = Array.isArray(doc.foreignCurrencies) ? doc.foreignCurrencies : [];
  const foreignKeys = new Set<string>();
  foreignRaw.forEach((entry, index) => {
    const path = `currencies.foreignCurrencies[${String(index)}]`;
    const item = record(entry, path, errors);
    const issuerKey = text(item, "issuerKey", path, errors);
    const currency = readCurrency(item, path, null, issuerKey, knownSources, errors);
    foreignKeys.add(currency.key);
    raws.push(currency);
  });

  const countriesRaw = Array.isArray(doc.countries) ? doc.countries : [];
  if (!Array.isArray(doc.countries)) errors.push("currencies.countries must be an array");
  const seenTags = new Set<string>();
  const ownByTag = new Map<string, RawCurrency>();
  const adoptedRaw: { tag: string; path: string; item: Json }[] = [];
  countriesRaw.forEach((entry, index) => {
    const path = `currencies.countries[${String(index)}]`;
    const item = record(entry, path, errors);
    const tag = text(item, "tag", path, errors);
    if (seenTags.has(tag)) errors.push(`${path}.tag ${tag} is duplicated`);
    seenTags.add(tag);
    const arrangement = oneOf(item, "arrangement", ["own", "adopted"] as const, path, errors);
    if (arrangement === "own") {
      const currency = readCurrency(
        record(item.currency, `${path}.currency`, errors),
        `${path}.currency`,
        tag,
        null,
        knownSources,
        errors,
      );
      ownByTag.set(tag, currency);
      raws.push(currency);
    } else {
      adoptedRaw.push({ tag, path, item });
    }
  });
  for (const tag of countryTags) {
    if (!seenTags.has(tag)) errors.push(`currencies.countries has no entry for country ${tag}`);
  }
  for (const tag of seenTags) {
    if (!countryTags.includes(tag)) errors.push(`currencies.countries lists unknown country ${tag}`);
  }
  const keys = new Set<string>();
  for (const currency of raws) {
    if (keys.has(currency.key)) errors.push(`${currency.path}.key ${currency.key} is duplicated`);
    keys.add(currency.key);
  }

  // Legal values: a par resolves through the referenced unit's legal value (never its
  // circulating value); chains are followed with cycle detection.
  const legal = new Map<string, number>();
  const resolving = new Set<string>();
  const legalValue = (currency: RawCurrency): number => {
    const cached = legal.get(currency.path);
    if (cached !== undefined) return cached;
    if (resolving.has(currency.path)) {
      errors.push(`${currency.path}.value has a circular par`);
      return Number.NaN;
    }
    resolving.add(currency.path);
    const value = currency.value;
    const kind = oneOf(value, "kind", ["mint-table", "par", "fine-content"] as const, `${currency.path}.value`, errors);
    text(value, "locator", `${currency.path}.value`, errors);
    let result = Number.NaN;
    if (kind === "mint-table") {
      result = positive(value, "usd", `${currency.path}.value`, errors);
    } else if (kind === "fine-content") {
      result = positive(value, "grams", `${currency.path}.value`, errors) * metalPrice[currency.metal];
    } else {
      const withTag = text(value, "withTag", `${currency.path}.value`, errors);
      const ratio = positive(value, "ratio", `${currency.path}.value`, errors);
      const reference = referenceUnits.get(withTag);
      const target = ownByTag.get(withTag);
      if (reference !== undefined) {
        result = reference * ratio;
      } else if (target !== undefined) {
        result = legalValue(target) * ratio;
      } else {
        errors.push(`${currency.path}.value.withTag ${withTag} is neither a reference unit nor an own currency`);
      }
    }
    resolving.delete(currency.path);
    legal.set(currency.path, result);
    return result;
  };

  const gbp = ownByTag.get("GBR");
  const currencies: CurrencyParity1900[] = raws.map((currency) => {
    const legalUsd = legalValue(currency);
    const value = currency.value;
    const fineGrams =
      value.kind === "fine-content" && typeof value.grams === "number"
        ? value.grams
        : legalUsd / metalPrice[currency.metal];
    let circulatingUsd = legalUsd;
    let circulationLocator: string | null = null;
    if (currency.circulation !== null) {
      const circulation = currency.circulation;
      const path = `${currency.path}.circulation`;
      circulationLocator = text(circulation, "locator", path, errors);
      const kind = oneOf(circulation, "kind", ["gold-premium", "london-exchange"] as const, path, errors);
      if (kind === "gold-premium") {
        const premium = positive(circulation, "premiumPercent", path, errors);
        const against = oneOf(circulation, "against", ["own-unit", "us-gold-dollar"] as const, path, errors);
        circulatingUsd = (against === "own-unit" ? legalUsd : 1) / (1 + premium / 100);
      } else {
        const pence = positive(circulation, "pencePerUnit", path, errors);
        if (gbp === undefined) {
          errors.push(`${path}: a London quotation requires the GBR pound sterling`);
        } else {
          circulatingUsd = (pence * legalValue(gbp)) / 240;
        }
      }
    }
    const rusdPerUnit = circulatingUsd * usdToRusd;
    if (!Number.isFinite(rusdPerUnit) || rusdPerUnit < CURRENCY_RATE_MIN || rusdPerUnit > CURRENCY_RATE_MAX) {
      errors.push(`${currency.path}: derived rusdPerUnit ${String(rusdPerUnit)} is outside the valid range`);
    }
    return {
      issuerTag: currency.issuerTag,
      foreignIssuerKey: currency.foreignIssuerKey,
      key: currency.key,
      name: currency.name,
      standard: currency.standard,
      metal: currency.metal,
      fineGramsPerUnit: fineGrams,
      legalUsdPerUnit: legalUsd,
      circulatingUsdPerUnit: circulatingUsd,
      rusdPerUnit,
      status: currency.status,
      sourceIds: currency.sourceIds,
      valueLocator: typeof value.locator === "string" ? value.locator : "",
      circulationLocator,
    };
  });

  const arrangements: CurrencyArrangement1900[] = [];
  for (const country of countriesRaw.map((entry) => record(entry, "currencies.countries[]", []))) {
    const tag = typeof country.tag === "string" ? country.tag : "";
    const own = ownByTag.get(tag);
    if (own !== undefined) {
      arrangements.push({ tag, kind: "own", currencyKey: own.key });
      continue;
    }
    const pending = adoptedRaw.find((entry) => entry.tag === tag);
    if (pending === undefined) continue;
    const adopts = record(pending.item.adopts, `${pending.path}.adopts`, errors);
    const status = oneOf(pending.item, "status", CURRENCY_DATA_STATUSES, pending.path, errors);
    const sourceIds = sourceList(pending.item, pending.path, knownSources, errors);
    text(pending.item, "notes", pending.path, errors);
    if (typeof adopts.countryTag === "string") {
      const target = ownByTag.get(adopts.countryTag);
      if (target === undefined) {
        errors.push(`${pending.path}.adopts.countryTag ${adopts.countryTag} has no own currency`);
        continue;
      }
      arrangements.push({ tag, kind: "adopted", currencyKey: target.key, issuerTag: adopts.countryTag, status, sourceIds });
    } else if (typeof adopts.foreignKey === "string") {
      if (!foreignKeys.has(adopts.foreignKey)) {
        errors.push(`${pending.path}.adopts.foreignKey ${adopts.foreignKey} is not a foreign currency`);
        continue;
      }
      arrangements.push({ tag, kind: "adopted", currencyKey: adopts.foreignKey, issuerTag: null, status, sourceIds });
    } else {
      errors.push(`${pending.path}.adopts must name a countryTag or a foreignKey`);
    }
  }
  for (const key of foreignKeys) {
    if (!arrangements.some((arrangement) => arrangement.currencyKey === key)) {
      errors.push(`foreign currency ${key} is adopted by no country`);
    }
  }

  if (errors.length > 0) throw new CurrencyTableError([...new Set(errors)].sort());
  return {
    usdToRusd,
    metalUsdPerFineGram: metalPrice,
    currencies,
    arrangements,
    sourceIds: [...knownSources].sort(),
  };
}

/** Read the deflator rows (id -> value) named by the currency table. */
function readDeflatorRows(document: unknown): Map<string, number> {
  const doc = record(document, "currencies", []);
  const deflator = record(doc.deflator, "currencies.deflator", []);
  const file = typeof deflator.sourceFile === "string" ? deflator.sourceFile : "";
  const sources = record(readJson(file), file, []);
  const rows = Array.isArray(sources.rows) ? sources.rows : [];
  const result = new Map<string, number>();
  for (const row of rows) {
    const entry = record(row, `${file}.rows[]`, []);
    if (typeof entry.id === "string" && typeof entry.value === "number") result.set(entry.id, entry.value);
  }
  return result;
}

/** Load and derive a currency table file for the given country tags. */
export function loadCurrencyTable(
  relativePath: string,
  countryTags: readonly string[],
): CurrencyTable1900 {
  const document = readJson(relativePath);
  return parseCurrencyTable1900(document, readDeflatorRows(document), countryTags);
}
