/**
 * M4a-2 country, currency-issuer, monetary-arrangement, and valuation model.
 *
 * Issuance is independent of the domestic monetary arrangement:
 * - `own` selects a currency issued by the country itself.
 * - `adopted` selects a currency issued by someone else (another country or a
 *   foreign issuer).
 * - A country may issue a currency and adopt a different one for domestic use.
 *
 * Country territory is derived from `World.provinces.ownership` (D-118): a country
 * owns the provinces whose `ownerPolityId` is its id. Unowned provinces are
 * permitted in fixtures; lookups return an explicit null.
 *
 * M4c adds `treasuryAccountId` and the provisional `fiscal` policy to each
 * country. Issuance and domestic use remain independent, and no monetary
 * behavior is added.
 */

import { assertValidDayIndex } from "../calendar.js";
import {
  CAMPAIGN_TERMINAL_DAY_INDEX,
  MAX_COUNTRY_NAME_LENGTH,
  MAX_COUNTRY_TAG_LENGTH,
  MAX_CURRENCY_KEY_LENGTH,
  MAX_CURRENCY_NAME_LENGTH,
  MAX_FOREIGN_ISSUER_KEY_LENGTH,
  LEGACY_SUSD_CURRENCY_KEY,
  RUSD_CURRENCY_KEY,
} from "../constants.js";
import {
  DEFAULT_BUSINESS_PROFIT_TAX_RATE,
  DEFAULT_INCOME_TAX_ALLOWANCE_RUSD_PER_YEAR,
  DEFAULT_RESERVE_TARGET_RUSD,
  DEFAULT_WELFARE_MAX_WEALTH_LEVEL,
  MAX_FISCAL_BUDGET_RUSD_PER_YEAR,
  MAX_FISCAL_TAX_RATE,
  MAX_WELFARE_WEALTH_LEVEL,
  MIN_FISCAL_TAX_RATE,
} from "./constants.js";
import type { Day, Id } from "../types.js";
import {
  requireArray,
  requireFiniteNumber,
  requireInteger,
  requireRecord,
  requireString,
  requireUint32,
} from "../validation.js";
import type { World } from "../world.js";
import { assertValidRusdPerCurrencyUnit } from "./currency.js";
import type {
  Country,
  Currency,
  CurrencyIssuer,
  CurrencyValuation,
  FiscalPolicy,
  FiscalPolicyInput,
  IndustrialPolicy,
  IndustrialPolicyInput,
  MonetaryArrangement,
} from "./types.js";
import { BUILDING_SECTORS } from "./types.js";

const CURRENCY_KEY_PATTERN = /^[a-z][a-z0-9-]*$/;

/** Structural country identity shared by runtime state and scenario input. */
export interface CountryIdentityInput {
  readonly id: Id;
  readonly tag: string;
  readonly name: string;
  readonly monetary: MonetaryArrangement;
  /** Scenario input only: initial territory. Runtime countries store none (D-118). */
  readonly provinceIds?: readonly Id[];
  readonly treasuryAccountId: Id;
  /**
   * Runtime worlds carry the complete E2 policy; scenario input may omit the E2
   * fields, which `allowLegacyFiscalDefaults` fills with neutral defaults.
   */
  readonly fiscal: FiscalPolicyInput;
}

/** Typed input for the country/currency validation pass. */
export interface CountryCurrencyValidationInput {
  readonly countries: readonly CountryIdentityInput[];
  readonly currencies: readonly Currency[];
  readonly currencyValuations: readonly CurrencyValuation[];
  readonly provinceIds: ReadonlySet<Id>;
  /** When provided, specified valuations must be set on this day. */
  readonly expectedStartDay?: Day;
  /**
   * Allow the M4c two-field scenario fiscal form, filling the E2 schedule,
   * eligibility, business-tax, and reserve fields with neutral defaults. World
   * state validation never sets this, so persisted policy must be complete.
   */
  readonly allowLegacyFiscalDefaults?: boolean;
}

/** The domestic currency id selected by a country's sole arrangement. */
export function currencyIdOf(country: Country): Id {
  return country.monetary.currencyId;
}

/**
 * Owner country of a province: the simulation country whose id is the province's
 * `ownerPolityId`, `null` for a province with no ownership record or one owned by a
 * registry polity that is not a simulation country, and a thrown error for an
 * unknown province id. Never guesses.
 */
export function provinceOwner(world: World, provinceId: Id): Id | null {
  if (!world.provinceEconomies.some((province) => province.id === provinceId)) {
    throw new RangeError(`unknown province ${String(provinceId)}`);
  }
  return buildProvinceOwnerMap(world).get(provinceId) ?? null;
}

/**
 * Transient province-to-owner-country lookup derived from province ownership
 * (D-118). Only owners that are simulation countries appear. O(provinces).
 */
export function buildProvinceOwnerMap(world: World): ReadonlyMap<Id, Id> {
  const owners = new Map<Id, Id>();
  if (!world.provinces.enabled) return owners;
  const countryIds = new Set<Id>();
  for (const country of world.countries) countryIds.add(country.id);
  for (const record of world.provinces.ownership) {
    if (countryIds.has(record.ownerPolityId)) owners.set(record.provinceId, record.ownerPolityId);
  }
  return owners;
}

/**
 * Province ids owned by each simulation country, ascending, derived from province
 * ownership. Every country has an entry, possibly empty.
 */
export function buildCountryProvinceMap(world: World): ReadonlyMap<Id, readonly Id[]> {
  const byCountry = new Map<Id, Id[]>();
  for (const country of world.countries) byCountry.set(country.id, []);
  if (world.provinces.enabled) {
    for (const record of world.provinces.ownership) {
      byCountry.get(record.ownerPolityId)?.push(record.provinceId);
    }
  }
  return byCountry;
}

/** Province ids owned by one country, ascending (ownership is stored ascending). */
export function countryProvinceIds(world: World, countryId: Id): Id[] {
  const result: Id[] = [];
  if (!world.provinces.enabled) return result;
  for (const record of world.provinces.ownership) {
    if (record.ownerPolityId === countryId) result.push(record.provinceId);
  }
  return result;
}

/** Province ids of one market (customs territory), ascending, derived from `marketId`. */
export function marketProvinceIds(world: World, marketId: Id): Id[] {
  const result: Id[] = [];
  for (const province of world.provinceEconomies) {
    if (province.marketId === marketId) result.push(province.id);
  }
  return result.sort((left, right) => left - right);
}

/**
 * The country exercising effective control of a province: its `controllerPolityId`
 * when that is a simulation country, else null (D-081 separation on the province).
 */
export function provinceControllerCountry(world: World, provinceId: Id): Id | null {
  if (!world.provinces.enabled) return null;
  const record = world.provinces.ownership.find((entry) => entry.provinceId === provinceId);
  if (record === undefined) return null;
  return world.countries.some((country) => country.id === record.controllerPolityId)
    ? record.controllerPolityId
    : null;
}

/** True when a country has any active fiscal policy. */
export function fiscalPolicyIsActive(fiscal: FiscalPolicyInput): boolean {
  return (
    fiscal.incomeTaxRate > 0 ||
    fiscal.welfareBudgetRUSDPerYear > 0 ||
    (fiscal.businessProfitTaxRate ?? 0) > 0
  );
}

/** Neutral default: every sector subsidy rate is zero. */
export function neutralIndustrialPolicy(): IndustrialPolicy {
  return { sectorSubsidyRates: BUILDING_SECTORS.map(() => 0) };
}

/**
 * Create a validated runtime industrial policy from scenario input. Omitted rates
 * are neutral; the array must cover every registered sector exactly once.
 */
export function createIndustrialPolicy(
  input: IndustrialPolicyInput | undefined,
  path = "industrial",
): IndustrialPolicy {
  if (input === undefined) return neutralIndustrialPolicy();
  return assertValidIndustrialPolicy(input, path);
}

/** Validate the complete E4 industrial policy and return a normalized copy. */
export function assertValidIndustrialPolicy(
  value: unknown,
  path: string,
): IndustrialPolicy {
  const record = requireRecord(value, path);
  const raw = requireArray(record.sectorSubsidyRates, `${path}.sectorSubsidyRates`);
  if (raw.length !== BUILDING_SECTORS.length) {
    throw new RangeError(
      `${path}.sectorSubsidyRates must contain ${String(BUILDING_SECTORS.length)} entries`,
    );
  }
  const rates: number[] = [];
  for (let index = 0; index < raw.length; index += 1) {
    const rate = requireFiniteNumber(
      raw[index],
      `${path}.sectorSubsidyRates[${String(index)}]`,
    );
    if (rate < 0 || rate > 1) {
      throw new RangeError(
        `${path}.sectorSubsidyRates[${String(index)}] must be in 0..1`,
      );
    }
    rates.push(rate);
  }
  return { sectorSubsidyRates: rates };
}

/** Neutral defaults for the E2 fiscal-policy fields, used by scenario input. */
export function neutralFiscalPolicyDefaults(): Pick<
  FiscalPolicy,
  | "incomeTaxAllowanceRUSDPerYear"
  | "welfareMaxWealthLevel"
  | "businessProfitTaxRate"
  | "reserveTargetRUSD"
> {
  return {
    incomeTaxAllowanceRUSDPerYear: DEFAULT_INCOME_TAX_ALLOWANCE_RUSD_PER_YEAR,
    welfareMaxWealthLevel: DEFAULT_WELFARE_MAX_WEALTH_LEVEL,
    businessProfitTaxRate: DEFAULT_BUSINESS_PROFIT_TAX_RATE,
    reserveTargetRUSD: DEFAULT_RESERVE_TARGET_RUSD,
  };
}

/**
 * Create a validated runtime fiscal policy from scenario input. The M4c rate and
 * welfare budget are required; omitted E2 fields take their neutral defaults.
 * Omitted fields are not silently defaulted for persisted state; see
 * `assertValidFiscalPolicy`.
 */
export function createFiscalPolicy(input: FiscalPolicyInput, path = "fiscal"): FiscalPolicy {
  const defaults = neutralFiscalPolicyDefaults();
  const record = requireRecord(input, path);
  return assertValidFiscalPolicy(
    {
      incomeTaxRate: record.incomeTaxRate,
      incomeTaxAllowanceRUSDPerYear:
        record.incomeTaxAllowanceRUSDPerYear ?? defaults.incomeTaxAllowanceRUSDPerYear,
      welfareBudgetRUSDPerYear: record.welfareBudgetRUSDPerYear,
      welfareMaxWealthLevel: record.welfareMaxWealthLevel ?? defaults.welfareMaxWealthLevel,
      businessProfitTaxRate: record.businessProfitTaxRate ?? defaults.businessProfitTaxRate,
      reserveTargetRUSD: record.reserveTargetRUSD ?? defaults.reserveTargetRUSD,
    },
    path,
  );
}

/** Validate one complete fiscal policy and return its normalized value. */
export function assertValidFiscalPolicy(value: unknown, path: string): FiscalPolicy {
  const record = requireRecord(value, path);
  const incomeTaxRate = requireFiniteNumber(record.incomeTaxRate, `${path}.incomeTaxRate`);
  if (incomeTaxRate < MIN_FISCAL_TAX_RATE || incomeTaxRate > MAX_FISCAL_TAX_RATE) {
    throw new RangeError(
      `${path}.incomeTaxRate must be in ${MIN_FISCAL_TAX_RATE}..${MAX_FISCAL_TAX_RATE}, received ${String(incomeTaxRate)}`,
    );
  }
  const incomeTaxAllowanceRUSDPerYear = requireFiniteNumber(
    record.incomeTaxAllowanceRUSDPerYear,
    `${path}.incomeTaxAllowanceRUSDPerYear`,
  );
  if (incomeTaxAllowanceRUSDPerYear < 0) {
    throw new RangeError(`${path}.incomeTaxAllowanceRUSDPerYear must be non-negative`);
  }
  if (incomeTaxAllowanceRUSDPerYear > MAX_FISCAL_BUDGET_RUSD_PER_YEAR) {
    throw new RangeError(
      `${path}.incomeTaxAllowanceRUSDPerYear must not exceed the numeric-safety bound ${String(MAX_FISCAL_BUDGET_RUSD_PER_YEAR)}`,
    );
  }
  const welfareBudgetRUSDPerYear = requireFiniteNumber(
    record.welfareBudgetRUSDPerYear,
    `${path}.welfareBudgetRUSDPerYear`,
  );
  if (welfareBudgetRUSDPerYear < 0) {
    throw new RangeError(`${path}.welfareBudgetRUSDPerYear must be non-negative`);
  }
  if (welfareBudgetRUSDPerYear > MAX_FISCAL_BUDGET_RUSD_PER_YEAR) {
    throw new RangeError(
      `${path}.welfareBudgetRUSDPerYear must not exceed the numeric-safety bound ${String(MAX_FISCAL_BUDGET_RUSD_PER_YEAR)}`,
    );
  }
  const welfareMaxWealthLevel = requireInteger(
    record.welfareMaxWealthLevel,
    `${path}.welfareMaxWealthLevel`,
    0,
    MAX_WELFARE_WEALTH_LEVEL,
  );
  const businessProfitTaxRate = requireFiniteNumber(
    record.businessProfitTaxRate,
    `${path}.businessProfitTaxRate`,
  );
  if (
    businessProfitTaxRate < MIN_FISCAL_TAX_RATE ||
    businessProfitTaxRate > MAX_FISCAL_TAX_RATE
  ) {
    throw new RangeError(
      `${path}.businessProfitTaxRate must be in ${MIN_FISCAL_TAX_RATE}..${MAX_FISCAL_TAX_RATE}, received ${String(businessProfitTaxRate)}`,
    );
  }
  const reserveTargetRUSD = requireFiniteNumber(
    record.reserveTargetRUSD,
    `${path}.reserveTargetRUSD`,
  );
  if (reserveTargetRUSD < 0) {
    throw new RangeError(`${path}.reserveTargetRUSD must be non-negative`);
  }
  if (reserveTargetRUSD > MAX_FISCAL_BUDGET_RUSD_PER_YEAR) {
    throw new RangeError(
      `${path}.reserveTargetRUSD must not exceed the numeric-safety bound ${String(MAX_FISCAL_BUDGET_RUSD_PER_YEAR)}`,
    );
  }
  return {
    incomeTaxRate,
    incomeTaxAllowanceRUSDPerYear,
    welfareBudgetRUSDPerYear,
    welfareMaxWealthLevel,
    businessProfitTaxRate,
    reserveTargetRUSD,
  };
}

/** Deep-copy one country record. */
export function copyCountry(country: Country): Country {
  return {
    ...country,
    monetary: { ...country.monetary },
    fiscal: { ...country.fiscal },
    industrial: {
      sectorSubsidyRates: [...country.industrial.sectorSubsidyRates],
    },
    debt: { ...country.debt },
    ai: { ...country.ai },
    regime: {
      ...country.regime,
      crisis: { ...country.regime.crisis },
      lastElection:
        country.regime.lastElection === null ? null : { ...country.regime.lastElection },
    },
    laws: { ...country.laws },
    lawTransitions: country.lawTransitions.map((transition) => ({ ...transition })),
    interestGroups: country.interestGroups.map((group) => ({
      ...group,
      stanceByLaw: { ...group.stanceByLaw },
    })),
    institutions: {
      ...country.institutions,
      staffedByProfession: { ...country.institutions.staffedByProfession },
    },
    technology: {
      researched: country.technology.researched.map((entry) => ({ ...entry })),
      activeProject:
        country.technology.activeProject === null
          ? null
          : { ...country.technology.activeProject },
      workByTechnology: { ...country.technology.workByTechnology },
    },
    education: { ...country.education },
    labor: { ...country.labor },
    trade: {
      ...country.trade,
      tariffRates: [...country.trade.tariffRates],
      importQuotaQuantity: [...country.trade.importQuotaQuantity],
      importQuotaUsedQuantity: [...country.trade.importQuotaUsedQuantity],
      exportRestricted: [...country.trade.exportRestricted],
    },
  };
}

/** Deep-copy one currency record. */
export function copyCurrency(currency: Currency): Currency {
  return { ...currency, issuer: { ...currency.issuer } };
}

/** Deep-copy one valuation record. */
export function copyCurrencyValuation(valuation: CurrencyValuation): CurrencyValuation {
  return valuation.status === "specified" ? { ...valuation } : { ...valuation };
}

function assertMonetaryArrangement(value: unknown, path: string): MonetaryArrangement {
  const record = requireRecord(value, path);
  const kind = record.kind;
  if (kind === "shared") {
    throw new RangeError(`${path}.kind "shared" is not implemented in M4a-2`);
  }
  if (kind !== "own" && kind !== "adopted") {
    throw new RangeError(`${path}.kind must be "own" or "adopted"`);
  }
  const currencyId = requireUint32(record.currencyId, `${path}.currencyId`);
  return { kind, currencyId };
}

function assertCurrencyIssuer(value: unknown, path: string): CurrencyIssuer {
  const record = requireRecord(value, path);
  const kind = record.kind;
  if (kind === "union") {
    throw new RangeError(`${path}.kind "union" is not implemented in M4a-2`);
  }
  if (kind === "country") {
    return {
      kind: "country",
      countryId: requireUint32(record.countryId, `${path}.countryId`),
    };
  }
  if (kind === "foreign") {
    return {
      kind: "foreign",
      issuerKey: requireString(record.issuerKey, `${path}.issuerKey`, {
        minLength: 1,
        maxLength: MAX_FOREIGN_ISSUER_KEY_LENGTH,
      }),
    };
  }
  throw new RangeError(`${path}.kind must be "country" or "foreign"`);
}

function assertCurrencyKey(value: unknown, path: string): string {
  const key = requireString(value, path, { minLength: 1, maxLength: MAX_CURRENCY_KEY_LENGTH });
  const normalized = key.toLowerCase();
  if (normalized === RUSD_CURRENCY_KEY || normalized === LEGACY_SUSD_CURRENCY_KEY) {
    throw new RangeError(`${path} is reserved for the RUSD unit of account`);
  }
  if (!CURRENCY_KEY_PATTERN.test(key)) {
    throw new RangeError(`${path} must be a lower-case identifier such as "gbp"`);
  }
  return key;
}

/**
 * Validate the complete country/currency/valuation model.
 *
 * Scenario validation calls this without `expectedStartDay`; world validation
 * calls it with the actual start day so valuation provenance is exact.
 */
export function assertValidCountryCurrencyState(input: CountryCurrencyValidationInput): void {
  const rawCountries = requireArray(input.countries, "world.countries");
  const countries = new Map<Id, CountryIdentityInput>();
  const tags = new Set<string>();
  const treasuryAccountIds = new Set<Id>();
  for (let index = 0; index < rawCountries.length; index += 1) {
    const path = `world.countries[${String(index)}]`;
    const record = requireRecord(rawCountries[index], path);
    const id = requireInteger(record.id, `${path}.id`, 0, 0xffff_ffff);
    if (countries.has(id)) throw new RangeError(`duplicate country id ${String(id)}`);
    const tag = requireString(record.tag, `${path}.tag`, {
      minLength: 1,
      maxLength: MAX_COUNTRY_TAG_LENGTH,
    });
    if (tags.has(tag)) throw new RangeError(`duplicate country tag ${JSON.stringify(tag)}`);
    tags.add(tag);
    const name = requireString(record.name, `${path}.name`, {
      minLength: 1,
      maxLength: MAX_COUNTRY_NAME_LENGTH,
    });
    const monetary = assertMonetaryArrangement(record.monetary, `${path}.monetary`);
    const treasuryAccountId = requireUint32(
      record.treasuryAccountId,
      `${path}.treasuryAccountId`,
    );
    if (treasuryAccountIds.has(treasuryAccountId)) {
      throw new RangeError(
        `duplicate country treasury account id ${String(treasuryAccountId)}`,
      );
    }
    treasuryAccountIds.add(treasuryAccountId);
    const fiscal =
      input.allowLegacyFiscalDefaults === true
        ? createFiscalPolicy(record.fiscal as FiscalPolicyInput, `${path}.fiscal`)
        : assertValidFiscalPolicy(record.fiscal, `${path}.fiscal`);
    const rawProvinceIds =
      record.provinceIds === undefined ? [] : requireArray(record.provinceIds, `${path}.provinceIds`);
    const provinceIds: Id[] = [];
    const seenProvinces = new Set<Id>();
    for (let provinceIndex = 0; provinceIndex < rawProvinceIds.length; provinceIndex += 1) {
      const provinceId = requireUint32(
        rawProvinceIds[provinceIndex],
        `${path}.provinceIds[${String(provinceIndex)}]`,
      );
      if (!input.provinceIds.has(provinceId)) {
        throw new RangeError(`${path}.provinceIds references unknown province ${String(provinceId)}`);
      }
      if (seenProvinces.has(provinceId)) {
        throw new RangeError(`${path}.provinceIds lists province ${String(provinceId)} twice`);
      }
      seenProvinces.add(provinceId);
      provinceIds.push(provinceId);
    }
    countries.set(id, { id, tag, name, monetary, provinceIds, treasuryAccountId, fiscal });
  }

  const provinceClaims = new Map<Id, Id>();
  for (const country of countries.values()) {
    for (const provinceId of country.provinceIds ?? []) {
      const existing = provinceClaims.get(provinceId);
      if (existing !== undefined) {
        throw new RangeError(
          `province ${String(provinceId)} is claimed by both country ${String(existing)} and country ${String(country.id)}`,
        );
      }
      provinceClaims.set(provinceId, country.id);
    }
  }

  const rawCurrencies = requireArray(input.currencies, "world.currencies");
  const currencies = new Map<Id, Currency>();
  const keys = new Set<string>();
  const issuedByCountry = new Map<Id, Id>();
  for (let index = 0; index < rawCurrencies.length; index += 1) {
    const path = `world.currencies[${String(index)}]`;
    const record = requireRecord(rawCurrencies[index], path);
    const id = requireInteger(record.id, `${path}.id`, 0, 0xffff_ffff);
    if (currencies.has(id)) throw new RangeError(`duplicate currency id ${String(id)}`);
    const key = assertCurrencyKey(record.key, `${path}.key`);
    if (keys.has(key)) throw new RangeError(`duplicate currency key ${JSON.stringify(key)}`);
    keys.add(key);
    const name = requireString(record.name, `${path}.name`, {
      minLength: 1,
      maxLength: MAX_CURRENCY_NAME_LENGTH,
    });
    const issuer = assertCurrencyIssuer(record.issuer, `${path}.issuer`);
    if (issuer.kind === "country" && !countries.has(issuer.countryId)) {
      throw new RangeError(`${path}.issuer references unknown country ${String(issuer.countryId)}`);
    }
    if (issuer.kind === "country") {
      const existing = issuedByCountry.get(issuer.countryId);
      if (existing !== undefined) {
        throw new RangeError(
          `country ${String(issuer.countryId)} issues more than one currency in M4a-2`,
        );
      }
      issuedByCountry.set(issuer.countryId, id);
    }
    currencies.set(id, { id, key, name, issuer });
  }

  const rawValuations = requireArray(input.currencyValuations, "world.currencyValuations");
  const valuations = new Map<Id, CurrencyValuation>();
  for (let index = 0; index < rawValuations.length; index += 1) {
    const path = `world.currencyValuations[${String(index)}]`;
    const record = requireRecord(rawValuations[index], path);
    const currencyId = requireUint32(record.currencyId, `${path}.currencyId`);
    if (!currencies.has(currencyId)) {
      throw new RangeError(`${path} references unknown currency ${String(currencyId)}`);
    }
    if (valuations.has(currencyId)) {
      throw new RangeError(`duplicate valuation for currency ${String(currencyId)}`);
    }
    const status = record.status;
    if (status === "unavailable") {
      valuations.set(currencyId, { currencyId, status: "unavailable" });
      continue;
    }
    if (status !== "specified") {
      throw new RangeError(`${path}.status must be "specified" or "unavailable"`);
    }
    const rusdPerUnit = assertValidRusdPerCurrencyUnit(
      record.rusdPerUnit,
      `${path}.rusdPerUnit`,
    );
    const setOnDay = requireInteger(
      record.setOnDay,
      `${path}.setOnDay`,
      0,
      CAMPAIGN_TERMINAL_DAY_INDEX,
    );
    assertValidDayIndex(setOnDay);
    const source = requireString(record.source, `${path}.source`, { minLength: 1 });
    if (source !== "scenario" && source !== "policy" && source !== "market") {
      throw new RangeError(
        `${path}.source must be "scenario", "policy", or "market"`,
      );
    }
    if (input.expectedStartDay === undefined) {
      // Scenario validation runs before simulation, so only authored rates are valid.
      if (source !== "scenario") {
        throw new RangeError(`${path}.source must be "scenario" in scenario data`);
      }
    } else if (source === "scenario") {
      if (setOnDay !== input.expectedStartDay) {
        throw new RangeError(
          `${path}.setOnDay must equal the world start day ${String(input.expectedStartDay)}`,
        );
      }
    } else if (setOnDay < input.expectedStartDay) {
      throw new RangeError(
        `${path}.setOnDay must not precede the world start day ${String(input.expectedStartDay)}`,
      );
    }
    valuations.set(currencyId, {
      currencyId,
      status: "specified",
      rusdPerUnit,
      setOnDay,
      source: source as "scenario" | "policy" | "market",
    });
  }
  for (const currency of currencies.values()) {
    if (!valuations.has(currency.id)) {
      throw new RangeError(`currency ${String(currency.id)} is missing a valuation record`);
    }
  }

  for (const country of countries.values()) {
    const currency = currencies.get(country.monetary.currencyId);
    if (currency === undefined) {
      throw new RangeError(
        `country ${String(country.id)} references unknown currency ${String(country.monetary.currencyId)}`,
      );
    }
    if (country.monetary.kind === "own") {
      if (currency.issuer.kind !== "country" || currency.issuer.countryId !== country.id) {
        throw new RangeError(
          `country ${String(country.id)} has an own arrangement but currency ${String(currency.id)} is not issued by it`,
        );
      }
    } else if (
      currency.issuer.kind === "country" &&
      currency.issuer.countryId === country.id
    ) {
      throw new RangeError(
        `country ${String(country.id)} has an adopted arrangement for a currency it issues`,
      );
    }
  }

  for (const currency of currencies.values()) {
    if (currency.issuer.kind !== "foreign") continue;
    let adopted = false;
    for (const country of countries.values()) {
      if (country.monetary.currencyId === currency.id) {
        adopted = true;
        break;
      }
    }
    if (!adopted) {
      throw new RangeError(
        `foreign-issued currency ${String(currency.id)} must be adopted by at least one country`,
      );
    }
  }
}
