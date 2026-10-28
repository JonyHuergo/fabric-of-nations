/**
 * M4a-2 country, currency-issuer, monetary-arrangement, and valuation model.
 *
 * Issuance is independent of the domestic monetary arrangement:
 * - `own` selects a currency issued by the country itself.
 * - `adopted` selects a currency issued by someone else (another country or a
 *   foreign issuer).
 * - A country may issue a currency and adopt a different one for domestic use.
 *
 * `Country.regionIds` is the sole authoritative country-to-region ownership
 * relation. Unassigned regions are permitted; lookups return an explicit null.
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
  SUSD_CURRENCY_KEY,
} from "../constants.js";
import {
  DEFAULT_BUSINESS_PROFIT_TAX_RATE,
  DEFAULT_INCOME_TAX_ALLOWANCE_SUSD_PER_YEAR,
  DEFAULT_RESERVE_TARGET_SUSD,
  DEFAULT_WELFARE_MAX_WEALTH_LEVEL,
  MAX_FISCAL_BUDGET_SUSD_PER_YEAR,
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
import { assertValidSusdPerCurrencyUnit } from "./currency.js";
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
  readonly regionIds: readonly Id[];
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
  readonly regionIds: ReadonlySet<Id>;
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
 * Owner of a region: country id when assigned, `null` for a known unassigned
 * region, and a thrown error for an unknown region id. Never guesses.
 */
export function regionOwner(world: World, regionId: Id): Id | null {
  if (!world.regions.some((region) => region.id === regionId)) {
    throw new RangeError(`unknown region ${String(regionId)}`);
  }
  for (const country of world.countries) {
    if (country.regionIds.includes(regionId)) return country.id;
  }
  return null;
}

/**
 * Transient region-to-country ownership lookup. Country validation has already
 * rejected duplicate region claims, so a conflict cannot be hidden here.
 */
export function buildRegionOwnerMap(world: World): ReadonlyMap<Id, Id> {
  const owners = new Map<Id, Id>();
  for (const country of [...world.countries].sort((left, right) => left.id - right.id)) {
    for (const regionId of country.regionIds) owners.set(regionId, country.id);
  }
  return owners;
}

/** True when a country has any active fiscal policy. */
export function fiscalPolicyIsActive(fiscal: FiscalPolicyInput): boolean {
  return (
    fiscal.incomeTaxRate > 0 ||
    fiscal.welfareBudgetSUSDPerYear > 0 ||
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
  | "incomeTaxAllowanceSUSDPerYear"
  | "welfareMaxWealthLevel"
  | "businessProfitTaxRate"
  | "reserveTargetSUSD"
> {
  return {
    incomeTaxAllowanceSUSDPerYear: DEFAULT_INCOME_TAX_ALLOWANCE_SUSD_PER_YEAR,
    welfareMaxWealthLevel: DEFAULT_WELFARE_MAX_WEALTH_LEVEL,
    businessProfitTaxRate: DEFAULT_BUSINESS_PROFIT_TAX_RATE,
    reserveTargetSUSD: DEFAULT_RESERVE_TARGET_SUSD,
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
      incomeTaxAllowanceSUSDPerYear:
        record.incomeTaxAllowanceSUSDPerYear ?? defaults.incomeTaxAllowanceSUSDPerYear,
      welfareBudgetSUSDPerYear: record.welfareBudgetSUSDPerYear,
      welfareMaxWealthLevel: record.welfareMaxWealthLevel ?? defaults.welfareMaxWealthLevel,
      businessProfitTaxRate: record.businessProfitTaxRate ?? defaults.businessProfitTaxRate,
      reserveTargetSUSD: record.reserveTargetSUSD ?? defaults.reserveTargetSUSD,
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
  const incomeTaxAllowanceSUSDPerYear = requireFiniteNumber(
    record.incomeTaxAllowanceSUSDPerYear,
    `${path}.incomeTaxAllowanceSUSDPerYear`,
  );
  if (incomeTaxAllowanceSUSDPerYear < 0) {
    throw new RangeError(`${path}.incomeTaxAllowanceSUSDPerYear must be non-negative`);
  }
  if (incomeTaxAllowanceSUSDPerYear > MAX_FISCAL_BUDGET_SUSD_PER_YEAR) {
    throw new RangeError(
      `${path}.incomeTaxAllowanceSUSDPerYear must not exceed the numeric-safety bound ${String(MAX_FISCAL_BUDGET_SUSD_PER_YEAR)}`,
    );
  }
  const welfareBudgetSUSDPerYear = requireFiniteNumber(
    record.welfareBudgetSUSDPerYear,
    `${path}.welfareBudgetSUSDPerYear`,
  );
  if (welfareBudgetSUSDPerYear < 0) {
    throw new RangeError(`${path}.welfareBudgetSUSDPerYear must be non-negative`);
  }
  if (welfareBudgetSUSDPerYear > MAX_FISCAL_BUDGET_SUSD_PER_YEAR) {
    throw new RangeError(
      `${path}.welfareBudgetSUSDPerYear must not exceed the numeric-safety bound ${String(MAX_FISCAL_BUDGET_SUSD_PER_YEAR)}`,
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
  const reserveTargetSUSD = requireFiniteNumber(
    record.reserveTargetSUSD,
    `${path}.reserveTargetSUSD`,
  );
  if (reserveTargetSUSD < 0) {
    throw new RangeError(`${path}.reserveTargetSUSD must be non-negative`);
  }
  if (reserveTargetSUSD > MAX_FISCAL_BUDGET_SUSD_PER_YEAR) {
    throw new RangeError(
      `${path}.reserveTargetSUSD must not exceed the numeric-safety bound ${String(MAX_FISCAL_BUDGET_SUSD_PER_YEAR)}`,
    );
  }
  return {
    incomeTaxRate,
    incomeTaxAllowanceSUSDPerYear,
    welfareBudgetSUSDPerYear,
    welfareMaxWealthLevel,
    businessProfitTaxRate,
    reserveTargetSUSD,
  };
}

/** Deep-copy one country record. */
export function copyCountry(country: Country): Country {
  return {
    ...country,
    monetary: { ...country.monetary },
    regionIds: [...country.regionIds],
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
  if (key.toLowerCase() === SUSD_CURRENCY_KEY) {
    throw new RangeError(`${path} is reserved for the SUSD unit of account`);
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
    const rawRegionIds = requireArray(record.regionIds, `${path}.regionIds`);
    const regionIds: Id[] = [];
    const seenRegions = new Set<Id>();
    for (let regionIndex = 0; regionIndex < rawRegionIds.length; regionIndex += 1) {
      const regionId = requireUint32(
        rawRegionIds[regionIndex],
        `${path}.regionIds[${String(regionIndex)}]`,
      );
      if (!input.regionIds.has(regionId)) {
        throw new RangeError(`${path}.regionIds references unknown region ${String(regionId)}`);
      }
      if (seenRegions.has(regionId)) {
        throw new RangeError(`${path}.regionIds lists region ${String(regionId)} twice`);
      }
      seenRegions.add(regionId);
      regionIds.push(regionId);
    }
    countries.set(id, { id, tag, name, monetary, regionIds, treasuryAccountId, fiscal });
  }

  const regionClaims = new Map<Id, Id>();
  for (const country of countries.values()) {
    for (const regionId of country.regionIds) {
      const existing = regionClaims.get(regionId);
      if (existing !== undefined) {
        throw new RangeError(
          `region ${String(regionId)} is claimed by both country ${String(existing)} and country ${String(country.id)}`,
        );
      }
      regionClaims.set(regionId, country.id);
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
    const susdPerUnit = assertValidSusdPerCurrencyUnit(
      record.susdPerUnit,
      `${path}.susdPerUnit`,
    );
    const setOnDay = requireInteger(
      record.setOnDay,
      `${path}.setOnDay`,
      0,
      CAMPAIGN_TERMINAL_DAY_INDEX,
    );
    assertValidDayIndex(setOnDay);
    if (input.expectedStartDay !== undefined && setOnDay !== input.expectedStartDay) {
      throw new RangeError(
        `${path}.setOnDay must equal the world start day ${String(input.expectedStartDay)}`,
      );
    }
    const source = requireString(record.source, `${path}.source`, { minLength: 1 });
    if (source !== "scenario") {
      throw new RangeError(`${path}.source must be "scenario" in M4a-2`);
    }
    valuations.set(currencyId, {
      currencyId,
      status: "specified",
      susdPerUnit,
      setOnDay,
      source: "scenario",
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
