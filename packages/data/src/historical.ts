/**
 * M5 initial historical-data pipeline.
 *
 * The authored data is a compact, source-annotated description of eight 1900
 * polities. Static economy definitions (`goods`, `professions`, `buildings`,
 * `needs`, demography) stay in the existing validated data files. This module
 * validates the historical tables, expands each population block's total into
 * the authoritative 17-band age/sex inputs from a documented provisional age
 * profile, and produces an `EconomyScenarioDef` for the simulation.
 *
 * The historical data is deliberately provisional: it is an authored sample for
 * exercising the multi-country systems, not a full historical reconstruction.
 * Population totals are rounded national estimates; occupation composition is a
 * documented provisional allocation; exchange rates are unavailable rather than
 * invented. See `data/historical/source_notes.md`.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CAMPAIGN_START_DAY_INDEX,
  CAMPAIGN_TERMINAL_DAY_INDEX,
  COUNTRY_STATUSES,
  CURRENCY_RATE_MAX,
  CURRENCY_RATE_MIN,
  MAX_COUNTRY_NAME_LENGTH,
  MAX_COUNTRY_TAG_LENGTH,
  MAX_CURRENCY_KEY_LENGTH,
  MAX_CURRENCY_NAME_LENGTH,
  MAX_DEBT_ARREARS_GRACE_DAYS,
  MAX_DEBT_PRINCIPAL_SUSD,
  MAX_DEBT_TERM_DAYS,
  MAX_FISCAL_BUDGET_SUSD_PER_YEAR,
  asSusdPerCurrencyUnit,
  assertValidEconomyDefinitions,
  assertValidPoliticsDefinitions,
  assertValidPopulationDefinitions,
  assertValidTechnologyDefinitions,
  isValidId,
  type BuildingDef,
  type BuildingInstanceInitialDef,
  type CountryMetaDef,
  type CountryInitialDef,
  type CountryPoliticsInput,
  type CountryStatus,
  type CountryTechnologyInput,
  type CurrencyValuation,
  type EconomyDefinitions,
  type EconomyScenarioDef,
  type EmploymentAssignmentInitialDef,
  type GoodDef,
  type MarketInitialDef,
  type MarketMetaDef,
  type NeedTierDef,
  type PoliticsDefinitions,
  type PopulationDefinitions,
  type PopulationScenarioDef,
  type ProfessionDef,
  type RegionInitialDef,
  type RegionMetaDef,
  type SystemAccountInitialDef,
  type TechnologyDefinitions,
  type TradeRouteInitialDef,
} from "@century/sim";

import { DATA_PACKAGE_VERSION } from "./version.js";

const DATA_ROOT = fileURLToPath(new URL("../data/", import.meta.url));

export const HISTORICAL_SCENARIO_FILE = "scenarios/m5_eight_polities.json";
/** M11 world scenario: all selectable 1900 polities and their territories. */
export const WORLD_SCENARIO_FILE = "scenarios/m11_world_1900.json";

/** Household account-id floor used by the historical loader. */
export const HISTORICAL_HOUSEHOLD_ACCOUNT_BASE = 1_000;
/** Building operating-cash account-id floor. */
export const HISTORICAL_BUILDING_ACCOUNT_BASE = 100_000;
/** Country treasury account-id floor (plus the numeric country id). */
export const HISTORICAL_TREASURY_ACCOUNT_BASE = 200_000;
/** Single system-reserve account id. */
export const HISTORICAL_SYSTEM_ACCOUNT_ID = 300_000;

export interface HistoricalSource {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly accessDate: string;
  readonly license: string;
  readonly notes: string;
}

export interface HistoricalAgeStructure {
  readonly maleCounts: readonly number[];
  readonly femaleCounts: readonly number[];
  readonly sourceIds: readonly string[];
  readonly status: "provisional" | "calibrated";
  readonly notes: string;
}

export interface HistoricalScenarioFiles {
  readonly countries: string;
  readonly regions: string;
  readonly markets: string;
  readonly tradeRoutes: string;
  readonly populations: string;
  readonly buildings: string;
  readonly employment: string;
  readonly calibration: string;
}

export interface HistoricalScenarioDefinitions {
  readonly goods: string;
  readonly professions: string;
  readonly buildings: string;
  readonly needs: string;
  readonly demography: string;
  readonly technology: string;
}

export interface HistoricalProfitDistributionInput {
  readonly enabled: boolean;
  readonly privatePayoutRate: number;
  readonly stateRemittanceRate: number;
}

export interface HistoricalCountryAIInput {
  readonly enabled: boolean;
}

export interface HistoricalScenarioMeta {
  readonly scenarioId: string;
  readonly dataVersion: string;
  readonly status: "provisional" | "calibrated";
  readonly description: string;
  readonly startDayIndex: number;
  /** Country tag designated as the player-controlled country. */
  readonly playerCountryTag: string;
  readonly sources: readonly HistoricalSource[];
  readonly ageStructures: Readonly<Record<string, HistoricalAgeStructure>>;
  readonly files: HistoricalScenarioFiles;
  readonly definitions: HistoricalScenarioDefinitions;
  readonly profitDistribution?: HistoricalProfitDistributionInput;
  readonly countryAI?: HistoricalCountryAIInput;
  /** M11 static polity metadata; optional for the pre-M11 sample. */
  readonly countryMeta?: readonly CountryMetaDef[];
  readonly marketMeta?: readonly MarketMetaDef[];
  readonly regionMeta?: readonly RegionMetaDef[];
}

export interface HistoricalCurrencyInput {
  readonly key: string;
  readonly name: string;
  readonly valuation:
    | { readonly status: "unavailable" }
    | {
        readonly status: "specified";
        readonly susdPerUnit: number;
        readonly sourceIds: readonly string[];
      };
}

export interface HistoricalCountryInput {
  readonly id: number;
  readonly tag: string;
  readonly name: string;
  readonly regionIds: readonly number[];
  readonly currency: HistoricalCurrencyInput;
  readonly fiscal: {
    readonly incomeTaxRate: number;
    readonly welfareBudgetSUSDPerYear: number;
  };
  readonly initialTreasuryCashSUSD: number;
  /**
   * Optional public-debt policy. Debt is a provincially authored policy input,
   * not a historical claim; omitted countries use the disabled default.
   */
  readonly debt?: {
    readonly enabled: boolean;
    readonly creditorKind: "country" | "popBlock";
    readonly creditorId: number;
    readonly annualCouponRate: number;
    readonly termDays: number;
    readonly maxOutstandingPrincipalSUSD: number;
    readonly refinanceOnMaturity: boolean;
    readonly arrearsGraceDays: number;
  };
  readonly immigrationOpen: boolean;
  /** M8 provisional regime/law/funding state. */
  readonly politics?: CountryPoliticsInput;
  /** M9 provisional researched technologies and education funding. */
  readonly technology?: CountryTechnologyInput;
  readonly sourceIds: readonly string[];
  readonly occupationSourceIds: readonly string[];
}

export interface HistoricalRegionInput {
  readonly id: number;
  readonly key: string;
  readonly name: string;
  readonly resourceCapsPerDay?: readonly number[];
  /** M8 provisional regional infrastructure quality, 0..1. */
  readonly infrastructure?: number;
  readonly sourceIds: readonly string[];
  readonly calibrationStatus: "source-backed" | "provisional";
}

export interface HistoricalStockLotInput {
  readonly goodKey: string;
  readonly ownerBuildingKey: string;
  readonly quantity: number;
}

export interface HistoricalMarketInput {
  readonly id: number;
  readonly key: string;
  readonly name: string;
  readonly regionIds: readonly number[];
  /** E6a customs administration tag; defaults to the lowest-region owner. */
  readonly customsCountryTag?: string;
  readonly priceBasis: "base-1900";
  /** Provisional multiplier applied to base-1900 prices for the opening price. */
  readonly initialPriceMultiplier: number;
  readonly stockLots: readonly HistoricalStockLotInput[];
  readonly status: "provisional" | "calibrated";
  readonly sourceIds: readonly string[];
}

/**
 * One authored E6a market-to-market transport route.
 *
 * Distances are provisional distance units (freight = per-unit cost × distance,
 * transit days = ceil(distance)); capacities are provisional daily cargo-value
 * limits at infrastructure 1. Neither is a historical measurement.
 */
export interface HistoricalTradeRouteInput {
  readonly marketAKey: string;
  readonly marketBKey: string;
  readonly distanceUnits: number;
  readonly baseCapacitySUSDPerDay: number;
  readonly status: "provisional" | "calibrated";
  readonly sourceIds: readonly string[];
}

export interface HistoricalPopulationInput {
  readonly regionId: number;
  readonly professionKey: string;
  readonly population: number;
  readonly literacy: number;
  readonly wealthLevel: number;
  readonly savingsPerCapitaSUSD: number;
  readonly militancy: number;
  readonly sourceIds: readonly string[];
  readonly calibrationStatus: "source-backed" | "provisional";
}

export interface HistoricalBuildingInput {
  readonly key: string;
  readonly regionId: number;
  readonly definitionKey: string;
  readonly level: number;
  readonly ownerProfessionKey: string;
  readonly operatingCashSUSD: number;
  readonly status: "provisional" | "calibrated";
}

export interface HistoricalEmploymentInput {
  readonly buildingKey: string;
  readonly regionId: number;
  readonly professionKey: string;
  readonly workers: number;
}

export type HistoricalCalibrationMetric = "totalPopulation" | "peasantPopulationShare";

export interface HistoricalCalibrationTarget {
  readonly id: string;
  readonly metric: HistoricalCalibrationMetric;
  readonly countryTag: string;
  readonly year: number;
  readonly units: string;
  readonly definition: string;
  readonly target: number;
  readonly toleranceAbsolute?: number;
  readonly toleranceRelative?: number;
  readonly sourceIds: readonly string[];
  readonly confidence: "low" | "medium" | "high";
  readonly status: "source-backed" | "provisional";
  readonly notes: string;
}

export interface HistoricalData {
  readonly meta: HistoricalScenarioMeta;
  readonly countries: readonly HistoricalCountryInput[];
  readonly regions: readonly HistoricalRegionInput[];
  readonly markets: readonly HistoricalMarketInput[];
  readonly tradeRoutes: readonly HistoricalTradeRouteInput[];
  readonly populations: readonly HistoricalPopulationInput[];
  readonly buildings: readonly HistoricalBuildingInput[];
  readonly employment: readonly HistoricalEmploymentInput[];
  readonly calibration: readonly HistoricalCalibrationTarget[];
}

export interface HistoricalValidation {
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

/** Aggregated validation failure with deterministically ordered messages. */
export class HistoricalDataError extends Error {
  readonly errors: readonly string[];
  constructor(errors: readonly string[]) {
    super(`Invalid M5 historical data:\n- ${errors.join("\n- ")}`);
    this.name = "HistoricalDataError";
    this.errors = errors;
  }
}

function readJson<T>(relativePath: string): T {
  const text = readFileSync(join(DATA_ROOT, relativePath), "utf8");
  return JSON.parse(text) as T;
}

function assertRecord(value: unknown, path: string, errors: string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    errors.push(`${path} must be an object`);
    return {};
  }
  return value as Record<string, unknown>;
}

function stringField(
  record: Record<string, unknown>,
  key: string,
  path: string,
  errors: string[],
  options: { minLength?: number; maxLength?: number } = {},
): string {
  const value = record[key];
  const minLength = options.minLength ?? 1;
  if (typeof value !== "string" || value.length < minLength) {
    errors.push(`${path}.${key} must be a string of at least ${String(minLength)} characters`);
    return "";
  }
  if (options.maxLength !== undefined && value.length > options.maxLength) {
    errors.push(`${path}.${key} must be at most ${String(options.maxLength)} characters`);
  }
  return value;
}

function numberField(
  record: Record<string, unknown>,
  key: string,
  path: string,
  errors: string[],
): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    errors.push(`${path}.${key} must be a finite number`);
    return Number.NaN;
  }
  return value;
}

function booleanField(
  record: Record<string, unknown>,
  key: string,
  path: string,
  errors: string[],
): boolean {
  const value = record[key];
  if (typeof value !== "boolean") {
    errors.push(`${path}.${key} must be a boolean`);
    return false;
  }
  return value;
}

function arrayField(
  record: Record<string, unknown>,
  key: string,
  path: string,
  errors: string[],
): readonly unknown[] {
  const value = record[key];
  if (!Array.isArray(value)) {
    errors.push(`${path}.${key} must be an array`);
    return [];
  }
  return value;
}

function stringArrayField(
  record: Record<string, unknown>,
  key: string,
  path: string,
  errors: string[],
): string[] {
  const values = arrayField(record, key, path, errors);
  const output: string[] = [];
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (typeof value !== "string" || value.length === 0) {
      errors.push(`${path}.${key}[${String(index)}] must be a non-empty string`);
    } else {
      output.push(value);
    }
  }
  return output;
}

function numberArrayField(
  record: Record<string, unknown>,
  key: string,
  path: string,
  errors: string[],
  expectedLength?: number,
): number[] {
  const values = arrayField(record, key, path, errors);
  const output: number[] = [];
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      errors.push(`${path}.${key}[${String(index)}] must be a finite number`);
    } else {
      output.push(value);
    }
  }
  if (expectedLength !== undefined && output.length !== expectedLength) {
    errors.push(`${path}.${key} must contain exactly ${String(expectedLength)} values`);
  }
  return output;
}

function integerArrayField(
  record: Record<string, unknown>,
  key: string,
  path: string,
  errors: string[],
  expectedLength?: number,
): number[] {
  const values = arrayField(record, key, path, errors);
  const output: number[] = [];
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
      errors.push(`${path}.${key}[${String(index)}] must be a non-negative integer`);
    } else {
      output.push(value);
    }
  }
  if (expectedLength !== undefined && output.length !== expectedLength) {
    errors.push(`${path}.${key} must contain exactly ${String(expectedLength)} values`);
  }
  return output;
}

function readSources(value: unknown, errors: string[]): HistoricalSource[] {
  if (!Array.isArray(value)) {
    errors.push("meta.sources must be an array");
    return [];
  }
  const sources: HistoricalSource[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const path = `meta.sources[${String(index)}]`;
    const record = assertRecord(value[index], path, errors);
    sources.push({
      id: stringField(record, "id", path, errors),
      title: stringField(record, "title", path, errors),
      url: stringField(record, "url", path, errors),
      accessDate: stringField(record, "accessDate", path, errors),
      license: stringField(record, "license", path, errors),
      notes: stringField(record, "notes", path, errors),
    });
  }
  return sources;
}

function readAgeStructures(
  value: unknown,
  errors: string[],
): Record<string, HistoricalAgeStructure> {
  const record = assertRecord(value, "meta.ageStructures", errors);
  const output: Record<string, HistoricalAgeStructure> = {};
  for (const [key, raw] of Object.entries(record)) {
    const path = `meta.ageStructures.${key}`;
    const entry = assertRecord(raw, path, errors);
    const status = stringField(entry, "status", path, errors);
    if (status !== "provisional" && status !== "calibrated") {
      errors.push(`${path}.status must be "provisional" or "calibrated"`);
    }
    output[key] = {
      maleCounts: integerArrayField(entry, "maleCounts", path, errors, 17),
      femaleCounts: integerArrayField(entry, "femaleCounts", path, errors, 17),
      sourceIds: stringArrayField(entry, "sourceIds", path, errors),
      status: status === "calibrated" ? "calibrated" : "provisional",
      notes: stringField(entry, "notes", path, errors),
    };
  }
  return output;
}

const COUNTRY_STATUS_SET = new Set<string>(COUNTRY_STATUSES);
const CONFIDENCE_SET = new Set<string>(["low", "medium", "high"]);

function readConfidence(
  record: Record<string, unknown>,
  path: string,
  errors: string[],
): "low" | "medium" | "high" {
  const value = stringField(record, "confidence", path, errors);
  if (!CONFIDENCE_SET.has(value)) {
    errors.push(`${path}.confidence must be low, medium or high`);
    return "low";
  }
  return value as "low" | "medium" | "high";
}

function readCountryMeta(value: unknown, errors: string[]): CountryMetaDef[] {
  if (!Array.isArray(value)) {
    errors.push("meta.countryMeta must be an array");
    return [];
  }
  return value.map((raw, index) => {
    const path = `meta.countryMeta[${String(index)}]`;
    const record = assertRecord(raw, path, errors);
    const status = stringField(record, "status", path, errors);
    if (!COUNTRY_STATUS_SET.has(status)) {
      errors.push(`${path}.status ${JSON.stringify(status)} is not a supported country status`);
    }
    return {
      countryId: numberField(record, "countryId", path, errors),
      historicalName: stringField(record, "historicalName", path, errors),
      status: status as CountryStatus,
      sovereignCountryId: numberField(record, "sovereignCountryId", path, errors),
      capitalName: stringField(record, "capitalName", path, errors),
      regionName: stringField(record, "regionName", path, errors),
      selectable: booleanField(record, "selectable", path, errors),
      population1900Estimate: numberField(record, "population1900Estimate", path, errors),
      confidence: readConfidence(record, path, errors),
      notes: stringField(record, "notes", path, errors, { minLength: 0 }),
    };
  });
}

function readMarketMeta(value: unknown, errors: string[]): MarketMetaDef[] {
  if (!Array.isArray(value)) {
    errors.push("meta.marketMeta must be an array");
    return [];
  }
  return value.map((raw, index) => {
    const path = `meta.marketMeta[${String(index)}]`;
    const record = assertRecord(raw, path, errors);
    const kind = stringField(record, "kind", path, errors);
    if (kind !== "national" && kind !== "imperial" && kind !== "shared") {
      errors.push(`${path}.kind must be national, imperial or shared`);
    }
    return {
      marketId: numberField(record, "marketId", path, errors),
      key: stringField(record, "key", path, errors),
      name: stringField(record, "name", path, errors),
      kind: (kind === "national" || kind === "imperial" ? kind : "shared") as
        | "national"
        | "imperial"
        | "shared",
      description: stringField(record, "description", path, errors),
      customsCountryId: numberField(record, "customsCountryId", path, errors),
    };
  });
}

function readRegionMeta(value: unknown, errors: string[]): RegionMetaDef[] {
  if (!Array.isArray(value)) {
    errors.push("meta.regionMeta must be an array");
    return [];
  }
  return value.map((raw, index) => {
    const path = `meta.regionMeta[${String(index)}]`;
    const record = assertRecord(raw, path, errors);
    const status = stringField(record, "status", path, errors);
    if (!COUNTRY_STATUS_SET.has(status)) {
      errors.push(`${path}.status ${JSON.stringify(status)} is not a supported country status`);
    }
    return {
      regionId: numberField(record, "regionId", path, errors),
      polityTag: stringField(record, "polityTag", path, errors),
      historicalName: stringField(record, "historicalName", path, errors),
      status: status as CountryStatus,
      sovereignCountryId: numberField(record, "sovereignCountryId", path, errors),
      capitalName: stringField(record, "capitalName", path, errors),
      selectable: booleanField(record, "selectable", path, errors),
      confidence: readConfidence(record, path, errors),
      notes: stringField(record, "notes", path, errors, { minLength: 0 }),
    };
  });
}

function readMeta(value: unknown, errors: string[]): HistoricalScenarioMeta {  const record = assertRecord(value, "meta", errors);
  const files = assertRecord(record.files, "meta.files", errors);
  const definitions = assertRecord(record.definitions, "meta.definitions", errors);
  const status = stringField(record, "status", "meta", errors);
  if (status !== "provisional" && status !== "calibrated") {
    errors.push('meta.status must be "provisional" or "calibrated"');
  }
  let profitDistribution: HistoricalProfitDistributionInput | undefined;
  if (record.profitDistribution !== undefined) {
    const policy = assertRecord(record.profitDistribution, "meta.profitDistribution", errors);
    const enabled = booleanField(policy, "enabled", "meta.profitDistribution", errors);
    const privatePayoutRate = numberField(
      policy,
      "privatePayoutRate",
      "meta.profitDistribution",
      errors,
    );
    const stateRemittanceRate = numberField(
      policy,
      "stateRemittanceRate",
      "meta.profitDistribution",
      errors,
    );
    for (const [name, rate] of [
      ["privatePayoutRate", privatePayoutRate],
      ["stateRemittanceRate", stateRemittanceRate],
    ] as const) {
      if (!(rate >= 0 && rate <= 1)) {
        errors.push(`meta.profitDistribution.${name} must be in 0..1`);
      }
    }
    profitDistribution = { enabled, privatePayoutRate, stateRemittanceRate };
  }
  let countryAI: HistoricalCountryAIInput | undefined;
  if (record.countryAI !== undefined) {
    const policy = assertRecord(record.countryAI, "meta.countryAI", errors);
    const enabled = booleanField(policy, "enabled", "meta.countryAI", errors);
    countryAI = { enabled };
  }
  return {
    scenarioId: stringField(record, "scenarioId", "meta", errors),
    dataVersion: stringField(record, "dataVersion", "meta", errors),
    status: status === "calibrated" ? "calibrated" : "provisional",
    description: stringField(record, "description", "meta", errors),
    startDayIndex: numberField(record, "startDayIndex", "meta", errors),
    playerCountryTag: stringField(record, "playerCountryTag", "meta", errors),
    sources: readSources(record.sources, errors),
    ageStructures: readAgeStructures(record.ageStructures, errors),
    files: {
      countries: stringField(files, "countries", "meta.files", errors),
      regions: stringField(files, "regions", "meta.files", errors),
      markets: stringField(files, "markets", "meta.files", errors),
      tradeRoutes: stringField(files, "tradeRoutes", "meta.files", errors),
      populations: stringField(files, "populations", "meta.files", errors),
      buildings: stringField(files, "buildings", "meta.files", errors),
      employment: stringField(files, "employment", "meta.files", errors),
      calibration: stringField(files, "calibration", "meta.files", errors),
    },
    definitions: {
      goods: stringField(definitions, "goods", "meta.definitions", errors),
      professions: stringField(definitions, "professions", "meta.definitions", errors),
      buildings: stringField(definitions, "buildings", "meta.definitions", errors),
      needs: stringField(definitions, "needs", "meta.definitions", errors),
      demography: stringField(definitions, "demography", "meta.definitions", errors),
      technology: stringField(definitions, "technology", "meta.definitions", errors),
    },
    ...(profitDistribution === undefined ? {} : { profitDistribution }),
    ...(countryAI === undefined ? {} : { countryAI }),
    ...(record.countryMeta === undefined
      ? {}
      : { countryMeta: readCountryMeta(record.countryMeta, errors) }),
    ...(record.marketMeta === undefined
      ? {}
      : { marketMeta: readMarketMeta(record.marketMeta, errors) }),
    ...(record.regionMeta === undefined
      ? {}
      : { regionMeta: readRegionMeta(record.regionMeta, errors) }),
  };
}

/** Load the raw historical tables for one scenario file from the data package. */
export function loadHistoricalData(
  scenarioFile: string = HISTORICAL_SCENARIO_FILE,
): HistoricalData {
  const rawScenario = readJson<unknown>(scenarioFile);
  const errors: string[] = [];
  const metaRecord = assertRecord(rawScenario, "scenario", errors);
  const meta = readMeta(metaRecord.meta, errors);
  if (errors.length > 0) throw new HistoricalDataError(errors.sort());

  const countries = readJson<unknown>(meta.files.countries);
  const regions = readJson<unknown>(meta.files.regions);
  const markets = readJson<unknown>(meta.files.markets);
  const tradeRoutes = readJson<unknown>(meta.files.tradeRoutes);
  const populations = readJson<unknown>(meta.files.populations);
  const buildings = readJson<unknown>(meta.files.buildings);
  const employment = readJson<unknown>(meta.files.employment);
  const calibration = readJson<unknown>(meta.files.calibration);
  for (const [label, value] of [
    ["countries", countries],
    ["regions", regions],
    ["markets", markets],
    ["tradeRoutes", tradeRoutes],
    ["populations", populations],
    ["buildings", buildings],
    ["employment", employment],
    ["calibration", calibration],
  ] as const) {
    if (!Array.isArray(value)) {
      throw new HistoricalDataError([`${label} data must be a JSON array`]);
    }
  }

  const data = parseHistoricalTables({
    meta,
    countries,
    regions,
    markets,
    tradeRoutes,
    populations,
    buildings,
    employment,
    calibration,
  });
  assertValidM5HistoricalData(data);
  return data;
}

/** Load the original eight-polity M5 sample (test fixture and compatibility). */
export function loadM5HistoricalData(): HistoricalData {
  return loadHistoricalData(HISTORICAL_SCENARIO_FILE);
}

interface RawTables {
  readonly meta: HistoricalScenarioMeta;
  readonly countries: unknown;
  readonly regions: unknown;
  readonly markets: unknown;
  readonly tradeRoutes: unknown;
  readonly populations: unknown;
  readonly buildings: unknown;
  readonly employment: unknown;
  readonly calibration: unknown;
}

function parseHistoricalTables(tables: RawTables): HistoricalData {
  const errors: string[] = [];
  const meta = tables.meta;
  const countries = parseCountries(tables.countries, errors);
  const regions = parseRegions(tables.regions, errors);
  const markets = parseMarkets(tables.markets, errors);
  const tradeRoutes = parseTradeRoutes(tables.tradeRoutes, errors);
  const populations = parsePopulations(tables.populations, errors);
  const buildings = parseBuildings(tables.buildings, errors);
  const employment = parseEmployment(tables.employment, errors);
  const calibration = parseCalibration(tables.calibration, errors);
  if (errors.length > 0) throw new HistoricalDataError([...errors].sort());
  return {
    meta,
    countries,
    regions,
    markets,
    tradeRoutes,
    populations,
    buildings,
    employment,
    calibration,
  };
}

function parseCountries(value: unknown, errors: string[]): HistoricalCountryInput[] {
  const values = value as readonly unknown[];
  return values.map((raw, index) => {
    const path = `countries[${String(index)}]`;
    const record = assertRecord(raw, path, errors);
    const currencyRecord = assertRecord(record.currency, `${path}.currency`, errors);
    const valuationRecord = assertRecord(
      currencyRecord.valuation,
      `${path}.currency.valuation`,
      errors,
    );
    const valuationStatus = stringField(
      valuationRecord,
      "status",
      `${path}.currency.valuation`,
      errors,
    );
    if (valuationStatus !== "specified" && valuationStatus !== "unavailable") {
      errors.push(`${path}.currency.valuation.status must be "specified" or "unavailable"`);
    }
    const fiscal = assertRecord(record.fiscal, `${path}.fiscal`, errors);
    const debt =
      record.debt === undefined
        ? undefined
        : (() => {
            const debtor = assertRecord(record.debt, `${path}.debt`, errors);
            const creditorKind = stringField(debtor, "creditorKind", `${path}.debt`, errors);
            if (creditorKind !== "country" && creditorKind !== "popBlock") {
              errors.push(`${path}.debt.creditorKind must be "country" or "popBlock"`);
            }
            return {
              enabled: booleanField(debtor, "enabled", `${path}.debt`, errors),
              creditorKind: creditorKind === "popBlock" ? ("popBlock" as const) : ("country" as const),
              creditorId: numberField(debtor, "creditorId", `${path}.debt`, errors),
              annualCouponRate: numberField(
                debtor,
                "annualCouponRate",
                `${path}.debt`,
                errors,
              ),
              termDays: numberField(debtor, "termDays", `${path}.debt`, errors),
              maxOutstandingPrincipalSUSD: numberField(
                debtor,
                "maxOutstandingPrincipalSUSD",
                `${path}.debt`,
                errors,
              ),
              refinanceOnMaturity: booleanField(
                debtor,
                "refinanceOnMaturity",
                `${path}.debt`,
                errors,
              ),
              arrearsGraceDays: numberField(debtor, "arrearsGraceDays", `${path}.debt`, errors),
            };
          })();
    const politics =
      record.politics === undefined
        ? undefined
        : (() => {
            const politicsRecord = assertRecord(record.politics, `${path}.politics`, errors);
            const laws =
              politicsRecord.laws === undefined
                ? undefined
                : (() => {
                    const rawLaws = assertRecord(
                      politicsRecord.laws,
                      `${path}.politics.laws`,
                      errors,
                    );
                    const parsed: Record<string, string> = {};
                    for (const [slot, lawKey] of Object.entries(rawLaws)) {
                      if (typeof lawKey !== "string" || lawKey.length === 0) {
                        errors.push(`${path}.politics.laws.${slot} must be a non-empty string`);
                        continue;
                      }
                      parsed[slot] = lawKey;
                    }
                    return parsed;
                  })();
            return {
              regimeKind: stringField(
                politicsRecord,
                "regimeKind",
                `${path}.politics`,
                errors,
              ) as CountryPoliticsInput["regimeKind"],
              ...(politicsRecord.governmentGroupKey === undefined
                ? {}
                : {
                    governmentGroupKey: stringField(
                      politicsRecord,
                      "governmentGroupKey",
                      `${path}.politics`,
                      errors,
                    ) as NonNullable<CountryPoliticsInput["governmentGroupKey"]>,
                  }),
              ...(laws === undefined ? {} : { laws }),
              ...(politicsRecord.institutionFundingSUSDPerYear === undefined
                ? {}
                : {
                    institutionFundingSUSDPerYear: numberField(
                      politicsRecord,
                      "institutionFundingSUSDPerYear",
                      `${path}.politics`,
                      errors,
                    ),
                  }),
            } satisfies CountryPoliticsInput;
          })();
    const technology =
      record.technology === undefined
        ? undefined
        : (() => {
            const technologyRecord = assertRecord(
              record.technology,
              `${path}.technology`,
              errors,
            );
            const researchedTechnologyKeys =
              technologyRecord.researchedTechnologyKeys === undefined
                ? undefined
                : stringArrayField(
                    technologyRecord,
                    "researchedTechnologyKeys",
                    `${path}.technology`,
                    errors,
                  );
            return {
              ...(researchedTechnologyKeys === undefined
                ? {}
                : { researchedTechnologyKeys }),
              ...(technologyRecord.educationFundingSUSDPerYear === undefined
                ? {}
                : {
                    educationFundingSUSDPerYear: numberField(
                      technologyRecord,
                      "educationFundingSUSDPerYear",
                      `${path}.technology`,
                      errors,
                    ),
                  }),
              ...(technologyRecord.researchStaffShare === undefined
                ? {}
                : {
                    researchStaffShare: numberField(
                      technologyRecord,
                      "researchStaffShare",
                      `${path}.technology`,
                      errors,
                    ),
                  }),
            } satisfies CountryTechnologyInput;
          })();
    return {
      id: numberField(record, "id", path, errors),
      tag: stringField(record, "tag", path, errors, { maxLength: MAX_COUNTRY_TAG_LENGTH }),
      name: stringField(record, "name", path, errors, { maxLength: MAX_COUNTRY_NAME_LENGTH }),
      regionIds: numberArrayField(record, "regionIds", path, errors),
      currency: {
        key: stringField(currencyRecord, "key", `${path}.currency`, errors, {
          maxLength: MAX_CURRENCY_KEY_LENGTH,
        }),
        name: stringField(currencyRecord, "name", `${path}.currency`, errors, {
          maxLength: MAX_CURRENCY_NAME_LENGTH,
        }),
        valuation:
          valuationStatus === "specified"
            ? {
                status: "specified" as const,
                susdPerUnit: numberField(
                  valuationRecord,
                  "susdPerUnit",
                  `${path}.currency.valuation`,
                  errors,
                ),
                sourceIds: stringArrayField(
                  valuationRecord,
                  "sourceIds",
                  `${path}.currency.valuation`,
                  errors,
                ),
              }
            : { status: "unavailable" as const },
      },
      fiscal: {
        incomeTaxRate: numberField(fiscal, "incomeTaxRate", `${path}.fiscal`, errors),
        welfareBudgetSUSDPerYear: numberField(
          fiscal,
          "welfareBudgetSUSDPerYear",
          `${path}.fiscal`,
          errors,
        ),
      },
      initialTreasuryCashSUSD: numberField(record, "initialTreasuryCashSUSD", path, errors),
      ...(debt === undefined ? {} : { debt }),
      ...(politics === undefined ? {} : { politics }),
      ...(technology === undefined ? {} : { technology }),
      immigrationOpen: booleanField(record, "immigrationOpen", path, errors),
      sourceIds: stringArrayField(record, "sourceIds", path, errors),
      occupationSourceIds: stringArrayField(record, "occupationSourceIds", path, errors),
    };
  });
}

function parseRegions(value: unknown, errors: string[]): HistoricalRegionInput[] {
  const values = value as readonly unknown[];
  return values.map((raw, index) => {
    const path = `regions[${String(index)}]`;
    const record = assertRecord(raw, path, errors);
    const status = stringField(record, "calibrationStatus", path, errors);
    if (status !== "source-backed" && status !== "provisional") {
      errors.push(`${path}.calibrationStatus must be "source-backed" or "provisional"`);
    }
    const caps =
      record.resourceCapsPerDay === undefined
        ? undefined
        : numberArrayField(record, "resourceCapsPerDay", path, errors);
    const infrastructure =
      record.infrastructure === undefined
        ? undefined
        : numberField(record, "infrastructure", path, errors);
    return {
      id: numberField(record, "id", path, errors),
      key: stringField(record, "key", path, errors),
      name: stringField(record, "name", path, errors),
      ...(caps === undefined ? {} : { resourceCapsPerDay: caps }),
      ...(infrastructure === undefined ? {} : { infrastructure }),
      sourceIds: stringArrayField(record, "sourceIds", path, errors),
      calibrationStatus: status === "source-backed" ? "source-backed" : "provisional",
    };
  });
}

function parseMarkets(value: unknown, errors: string[]): HistoricalMarketInput[] {
  const values = value as readonly unknown[];
  return values.map((raw, index) => {
    const path = `markets[${String(index)}]`;
    const record = assertRecord(raw, path, errors);
    const basis = stringField(record, "priceBasis", path, errors);
    if (basis !== "base-1900") {
      errors.push(`${path}.priceBasis must be "base-1900"`);
    }
    const status = stringField(record, "status", path, errors);
    if (status !== "provisional" && status !== "calibrated") {
      errors.push(`${path}.status must be "provisional" or "calibrated"`);
    }
    const initialPriceMultiplier =
      record.initialPriceMultiplier === undefined
        ? 1
        : numberField(record, "initialPriceMultiplier", path, errors);
    const customsCountryTag =
      record.customsCountryTag === undefined
        ? undefined
        : stringField(record, "customsCountryTag", path, errors);
    const rawLots = record.stockLots === undefined ? [] : record.stockLots;
    const stockLots = Array.isArray(rawLots)
      ? rawLots.map((lot, lotIndex) => {
          const lotPath = `${path}.stockLots[${String(lotIndex)}]`;
          const lotRecord = assertRecord(lot, lotPath, errors);
          return {
            goodKey: stringField(lotRecord, "goodKey", lotPath, errors),
            ownerBuildingKey: stringField(lotRecord, "ownerBuildingKey", lotPath, errors),
            quantity: numberField(lotRecord, "quantity", lotPath, errors),
          };
        })
      : (() => {
          errors.push(`${path}.stockLots must be an array when provided`);
          return [];
        })();
    return {
      id: numberField(record, "id", path, errors),
      key: stringField(record, "key", path, errors),
      name: stringField(record, "name", path, errors),
      regionIds: numberArrayField(record, "regionIds", path, errors),
      ...(customsCountryTag === undefined ? {} : { customsCountryTag }),
      priceBasis: "base-1900",
      initialPriceMultiplier,
      stockLots,
      status: status === "calibrated" ? "calibrated" : "provisional",
      sourceIds: stringArrayField(record, "sourceIds", path, errors),
    };
  });
}

function parseTradeRoutes(value: unknown, errors: string[]): HistoricalTradeRouteInput[] {
  const values = value as readonly unknown[];
  return values.map((raw, index) => {
    const path = `tradeRoutes[${String(index)}]`;
    const record = assertRecord(raw, path, errors);
    const status = stringField(record, "status", path, errors);
    if (status !== "provisional" && status !== "calibrated") {
      errors.push(`${path}.status must be "provisional" or "calibrated"`);
    }
    return {
      marketAKey: stringField(record, "marketAKey", path, errors),
      marketBKey: stringField(record, "marketBKey", path, errors),
      distanceUnits: numberField(record, "distanceUnits", path, errors),
      baseCapacitySUSDPerDay: numberField(record, "baseCapacitySUSDPerDay", path, errors),
      status: status === "calibrated" ? "calibrated" : "provisional",
      sourceIds: stringArrayField(record, "sourceIds", path, errors),
    };
  });
}

function parsePopulations(value: unknown, errors: string[]): HistoricalPopulationInput[] {
  const values = value as readonly unknown[];
  return values.map((raw, index) => {
    const path = `populations[${String(index)}]`;
    const record = assertRecord(raw, path, errors);
    const status = stringField(record, "calibrationStatus", path, errors);
    if (status !== "source-backed" && status !== "provisional") {
      errors.push(`${path}.calibrationStatus must be "source-backed" or "provisional"`);
    }
    return {
      regionId: numberField(record, "regionId", path, errors),
      professionKey: stringField(record, "professionKey", path, errors),
      population: numberField(record, "population", path, errors),
      literacy: numberField(record, "literacy", path, errors),
      wealthLevel: numberField(record, "wealthLevel", path, errors),
      savingsPerCapitaSUSD: numberField(record, "savingsPerCapitaSUSD", path, errors),
      militancy: numberField(record, "militancy", path, errors),
      sourceIds: stringArrayField(record, "sourceIds", path, errors),
      calibrationStatus: status === "source-backed" ? "source-backed" : "provisional",
    };
  });
}

function parseBuildings(value: unknown, errors: string[]): HistoricalBuildingInput[] {
  const values = value as readonly unknown[];
  return values.map((raw, index) => {
    const path = `buildings[${String(index)}]`;
    const record = assertRecord(raw, path, errors);
    const status = stringField(record, "status", path, errors);
    if (status !== "provisional" && status !== "calibrated") {
      errors.push(`${path}.status must be "provisional" or "calibrated"`);
    }
    return {
      key: stringField(record, "key", path, errors),
      regionId: numberField(record, "regionId", path, errors),
      definitionKey: stringField(record, "definitionKey", path, errors),
      level: numberField(record, "level", path, errors),
      ownerProfessionKey: stringField(record, "ownerProfessionKey", path, errors),
      operatingCashSUSD: numberField(record, "operatingCashSUSD", path, errors),
      status: status === "calibrated" ? "calibrated" : "provisional",
    };
  });
}

function parseEmployment(value: unknown, errors: string[]): HistoricalEmploymentInput[] {
  const values = value as readonly unknown[];
  return values.map((raw, index) => {
    const path = `employment[${String(index)}]`;
    const record = assertRecord(raw, path, errors);
    return {
      buildingKey: stringField(record, "buildingKey", path, errors),
      regionId: numberField(record, "regionId", path, errors),
      professionKey: stringField(record, "professionKey", path, errors),
      workers: numberField(record, "workers", path, errors),
    };
  });
}

function parseCalibration(value: unknown, errors: string[]): HistoricalCalibrationTarget[] {
  const values = value as readonly unknown[];
  const metrics = new Set<string>(["totalPopulation", "peasantPopulationShare"]);
  const confidences = new Set<string>(["low", "medium", "high"]);
  const statuses = new Set<string>(["source-backed", "provisional"]);
  return values.map((raw, index) => {
    const path = `calibration[${String(index)}]`;
    const record = assertRecord(raw, path, errors);
    const metric = stringField(record, "metric", path, errors);
    if (!metrics.has(metric)) {
      errors.push(`${path}.metric must be totalPopulation or peasantPopulationShare`);
    }
    const confidence = stringField(record, "confidence", path, errors);
    if (!confidences.has(confidence)) {
      errors.push(`${path}.confidence must be low, medium, or high`);
    }
    const status = stringField(record, "status", path, errors);
    if (!statuses.has(status)) {
      errors.push(`${path}.status must be source-backed or provisional`);
    }
    const toleranceAbsolute =
      record.toleranceAbsolute === undefined
        ? undefined
        : numberField(record, "toleranceAbsolute", path, errors);
    const toleranceRelative =
      record.toleranceRelative === undefined
        ? undefined
        : numberField(record, "toleranceRelative", path, errors);
    return {
      id: stringField(record, "id", path, errors),
      metric: metric === "peasantPopulationShare" ? "peasantPopulationShare" : "totalPopulation",
      countryTag: stringField(record, "countryTag", path, errors),
      year: numberField(record, "year", path, errors),
      units: stringField(record, "units", path, errors),
      definition: stringField(record, "definition", path, errors),
      target: numberField(record, "target", path, errors),
      ...(toleranceAbsolute === undefined ? {} : { toleranceAbsolute }),
      ...(toleranceRelative === undefined ? {} : { toleranceRelative }),
      sourceIds: stringArrayField(record, "sourceIds", path, errors),
      confidence:
        confidence === "high" ? "high" : confidence === "medium" ? "medium" : "low",
      status: status === "source-backed" ? "source-backed" : "provisional",
      notes: stringField(record, "notes", path, errors),
    };
  });
}

function isPositiveInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

export interface HistoricalDefinitionKeys {
  readonly professions: ReadonlySet<string>;
  readonly buildings: ReadonlySet<string>;
  readonly goods: ReadonlySet<string>;
  /** Full catalogs used for employment qualification and job-slot checks. */
  readonly professionByKey: ReadonlyMap<string, ProfessionDef>;
  readonly buildingByKey: ReadonlyMap<string, BuildingDef>;
}

function loadDefinitionKeys(meta: HistoricalScenarioMeta): HistoricalDefinitionKeys | null {
  try {
    const professions = readJson<readonly ProfessionDef[]>(meta.definitions.professions);
    const buildings = readJson<readonly BuildingDef[]>(meta.definitions.buildings);
    const goods = readJson<readonly { key: string }[]>(meta.definitions.goods);
    return {
      professions: new Set(professions.map((profession) => profession.key)),
      buildings: new Set(buildings.map((building) => building.key)),
      goods: new Set(goods.map((good) => good.key)),
      professionByKey: new Map(professions.map((profession) => [profession.key, profession])),
      buildingByKey: new Map(buildings.map((building) => [building.key, building])),
    };
  } catch {
    return null;
  }
}

/**
 * Validate the complete historical dataset and its cross-references. Errors are
 * returned in a deterministic sorted order. The loader throws with this list.
 *
 * `definitionKeys` may be supplied by a caller that has already loaded the static
 * catalogs; when omitted the validator reads the referenced definition files so
 * unknown professions/buildings are still caught.
 */
export function validateM5HistoricalData(
  data: HistoricalData,
  definitionKeys?: HistoricalDefinitionKeys,
): HistoricalValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const keys = definitionKeys ?? loadDefinitionKeys(data.meta);
  if (keys === null) {
    errors.push("could not load profession/building definitions for reference validation");
  }
  const sourceIds = new Set(data.meta.sources.map((source) => source.id));
  const sourceIndexById = new Map<string, number>();
  for (let index = 0; index < data.meta.sources.length; index += 1) {
    const source = data.meta.sources[index];
    if (source === undefined) continue;
    const previous = sourceIndexById.get(source.id);
    if (previous !== undefined) {
      errors.push(
        `meta.sources[${String(index)}].id ${JSON.stringify(source.id)} duplicates meta.sources[${String(previous)}].id`,
      );
    } else {
      sourceIndexById.set(source.id, index);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(source.accessDate)) {
      errors.push(`meta.sources[${source.id}].accessDate must be YYYY-MM-DD`);
    }
    if (source.url.length === 0) errors.push(`meta.sources[${source.id}].url must not be empty`);
  }
  if (
    !Number.isInteger(data.meta.startDayIndex) ||
    data.meta.startDayIndex < CAMPAIGN_START_DAY_INDEX ||
    data.meta.startDayIndex >= CAMPAIGN_TERMINAL_DAY_INDEX
  ) {
    errors.push(
      `meta.startDayIndex must be an integer in ${String(CAMPAIGN_START_DAY_INDEX)}..${String(CAMPAIGN_TERMINAL_DAY_INDEX - 1)}`,
    );
  }
  const requireSources = (ids: readonly string[], path: string): void => {
    if (ids.length === 0) errors.push(`${path} must list at least one source id`);
    for (const id of ids) {
      if (!sourceIds.has(id)) errors.push(`${path} references unknown source ${JSON.stringify(id)}`);
    }
  };
  if (data.meta.dataVersion !== DATA_PACKAGE_VERSION) {
    errors.push(
      `meta.dataVersion ${JSON.stringify(data.meta.dataVersion)} must equal ${JSON.stringify(DATA_PACKAGE_VERSION)}`,
    );
  }
  if (data.meta.status !== "provisional") {
    warnings.push("M5 historical scenario is an authored provisional sample, not a full reconstruction");
  }
  const ageStructure = data.meta.ageStructures["world-1900-provisional"];
  if (ageStructure === undefined) {
    errors.push("meta.ageStructures is missing world-1900-provisional");
  } else {
    requireSources(ageStructure.sourceIds, "meta.ageStructures.world-1900-provisional.sourceIds");
    const maleTotal = ageStructure.maleCounts.reduce((total, value) => total + value, 0);
    const femaleTotal = ageStructure.femaleCounts.reduce((total, value) => total + value, 0);
    if (maleTotal <= 0 || femaleTotal <= 0) {
      errors.push("age-structure profile counts must be positive");
    }
  }

  const regionById = new Map<number, HistoricalRegionInput>();
  const regionKeys = new Set<string>();
  const regionOwner = new Map<number, number>();
  const countryRegionIds = new Map<number, number[]>();
  const countryById = new Map<number, HistoricalCountryInput>();
  const countryTags = new Set<string>();
  const currencyKeys = new Set<string>();
  for (let index = 0; index < data.countries.length; index += 1) {
    const country = data.countries[index];
    if (country === undefined) continue;
    const path = `countries[${String(index)}]`;
    if (!isValidId(country.id)) errors.push(`${path}.id must be an unsigned 32-bit integer`);
    if (countryById.has(country.id)) errors.push(`${path}.id ${String(country.id)} is duplicated`);
    countryById.set(country.id, country);
    if (country.tag.length > MAX_COUNTRY_TAG_LENGTH) {
      errors.push(`${path}.tag must be at most ${String(MAX_COUNTRY_TAG_LENGTH)} characters`);
    }
    if (country.name.length > MAX_COUNTRY_NAME_LENGTH) {
      errors.push(`${path}.name must be at most ${String(MAX_COUNTRY_NAME_LENGTH)} characters`);
    }
    if (countryTags.has(country.tag)) errors.push(`${path}.tag ${JSON.stringify(country.tag)} is duplicated`);
    countryTags.add(country.tag);
    if (country.regionIds.length === 0) errors.push(`${path}.regionIds must not be empty`);
    const seenRegions = new Set<number>();
    for (const regionId of country.regionIds) {
      if (!isValidId(regionId)) errors.push(`${path}.regionIds contains an invalid region id ${String(regionId)}`);
      if (seenRegions.has(regionId)) errors.push(`${path}.regionIds duplicates region ${String(regionId)}`);
      seenRegions.add(regionId);
      const existing = regionOwner.get(regionId);
      if (existing !== undefined) {
        errors.push(`region ${String(regionId)} is claimed by countries ${String(existing)} and ${String(country.id)}`);
      }
      regionOwner.set(regionId, country.id);
    }
    countryRegionIds.set(country.id, [...country.regionIds].sort((left, right) => left - right));
    requireSources(country.sourceIds, `${path}.sourceIds`);
    requireSources(country.occupationSourceIds, `${path}.occupationSourceIds`);
    if (!/^[a-z][a-z0-9-]*$/.test(country.currency.key)) {
      errors.push(`${path}.currency.key must be a lower-case identifier`);
    }
    if (country.currency.key.length > MAX_CURRENCY_KEY_LENGTH) {
      errors.push(
        `${path}.currency.key must be at most ${String(MAX_CURRENCY_KEY_LENGTH)} characters`,
      );
    }
    if (country.currency.name.length > MAX_CURRENCY_NAME_LENGTH) {
      errors.push(
        `${path}.currency.name must be at most ${String(MAX_CURRENCY_NAME_LENGTH)} characters`,
      );
    }
    if (country.currency.key === "susd") errors.push(`${path}.currency.key is reserved for SUSD`);
    if (currencyKeys.has(country.currency.key)) {
      errors.push(`${path}.currency.key ${JSON.stringify(country.currency.key)} is duplicated`);
    }
    currencyKeys.add(country.currency.key);
    const fiscal = country.fiscal;
    if (!(fiscal.incomeTaxRate >= 0 && fiscal.incomeTaxRate <= 1)) {
      errors.push(`${path}.fiscal.incomeTaxRate must be in 0..1`);
    }
    if (!(fiscal.welfareBudgetSUSDPerYear >= 0)) {
      errors.push(`${path}.fiscal.welfareBudgetSUSDPerYear must be non-negative`);
    }
    if (fiscal.welfareBudgetSUSDPerYear > MAX_FISCAL_BUDGET_SUSD_PER_YEAR) {
      errors.push(
        `${path}.fiscal.welfareBudgetSUSDPerYear must not exceed ${String(MAX_FISCAL_BUDGET_SUSD_PER_YEAR)}`,
      );
    }
    if (!(country.initialTreasuryCashSUSD >= 0)) {
      errors.push(`${path}.initialTreasuryCashSUSD must be non-negative`);
    }
    if (country.debt !== undefined) {
      const debt = country.debt;
      if (!(debt.annualCouponRate >= 0 && debt.annualCouponRate <= 1)) {
        errors.push(`${path}.debt.annualCouponRate must be in 0..1`);
      }
      if (!Number.isInteger(debt.termDays) || debt.termDays < 1) {
        errors.push(`${path}.debt.termDays must be a positive integer`);
      }
      if (debt.termDays > MAX_DEBT_TERM_DAYS) {
        errors.push(`${path}.debt.termDays must not exceed ${String(MAX_DEBT_TERM_DAYS)}`);
      }
      if (!(debt.maxOutstandingPrincipalSUSD >= 0)) {
        errors.push(`${path}.debt.maxOutstandingPrincipalSUSD must be non-negative`);
      }
      if (debt.maxOutstandingPrincipalSUSD > MAX_DEBT_PRINCIPAL_SUSD) {
        errors.push(
          `${path}.debt.maxOutstandingPrincipalSUSD must not exceed ${String(MAX_DEBT_PRINCIPAL_SUSD)}`,
        );
      }
      if (!Number.isInteger(debt.arrearsGraceDays) || debt.arrearsGraceDays < 0) {
        errors.push(`${path}.debt.arrearsGraceDays must be a non-negative integer`);
      }
      if (debt.arrearsGraceDays > MAX_DEBT_ARREARS_GRACE_DAYS) {
        errors.push(
          `${path}.debt.arrearsGraceDays must not exceed ${String(MAX_DEBT_ARREARS_GRACE_DAYS)}`,
        );
      }
      if (!isValidId(debt.creditorId)) {
        errors.push(`${path}.debt.creditorId must be an unsigned 32-bit integer`);
      }
      if (debt.creditorKind === "country" && debt.creditorId === country.id) {
        errors.push(`${path}.debt cannot name its own country as creditor`);
      }
    }
    if (country.currency.valuation.status === "specified") {
      const rate = country.currency.valuation.susdPerUnit;
      if (!(rate > 0)) {
        errors.push(`${path}.currency.valuation.susdPerUnit must be positive`);
      } else if (rate < CURRENCY_RATE_MIN || rate > CURRENCY_RATE_MAX) {
        errors.push(
          `${path}.currency.valuation.susdPerUnit must be in ${String(CURRENCY_RATE_MIN)}..${String(CURRENCY_RATE_MAX)}`,
        );
      }
      requireSources(country.currency.valuation.sourceIds, `${path}.currency.valuation.sourceIds`);
    }
  }

  if (!countryTags.has(data.meta.playerCountryTag)) {
    errors.push(
      `meta.playerCountryTag ${JSON.stringify(data.meta.playerCountryTag)} is not a registered country`,
    );
  }
  for (let index = 0; index < data.countries.length; index += 1) {
    const country = data.countries[index];
    if (country?.debt?.enabled === true && country.debt.creditorKind === "country") {
      if (!countryById.has(country.debt.creditorId)) {
        errors.push(
          `countries[${String(index)}].debt.creditorId references unknown country ${String(country.debt.creditorId)}`,
        );
      }
    }
  }

  const regionCountry = new Map<number, number>();
  for (let index = 0; index < data.regions.length; index += 1) {
    const region = data.regions[index];
    if (region === undefined) continue;
    const path = `regions[${String(index)}]`;
    if (!isValidId(region.id)) {
      errors.push(`${path}.id must be an unsigned 32-bit integer`);
    }
    if (regionById.has(region.id)) errors.push(`${path}.id ${String(region.id)} is duplicated`);
    regionById.set(region.id, region);
    if (regionKeys.has(region.key)) errors.push(`${path}.key ${JSON.stringify(region.key)} is duplicated`);
    regionKeys.add(region.key);
    if (region.resourceCapsPerDay !== undefined) {
      for (let capIndex = 0; capIndex < region.resourceCapsPerDay.length; capIndex += 1) {
        const cap = region.resourceCapsPerDay[capIndex];
        if (cap !== undefined && cap < 0) {
          errors.push(
            `regions[${String(index)}].resourceCapsPerDay[${String(capIndex)}] must be non-negative`,
          );
        }
      }
    }
    requireSources(region.sourceIds, `${path}.sourceIds`);
    const owner = regionOwner.get(region.id);
    if (owner === undefined) {
      errors.push(`region ${String(region.id)} has no owning country`);
    } else {
      regionCountry.set(region.id, owner);
    }
  }
  for (const regionId of regionOwner.keys()) {
    if (!regionById.has(regionId)) {
      errors.push(`country ownership references unknown region ${String(regionId)}`);
    }
  }

  const marketById = new Map<number, HistoricalMarketInput>();
  const mapRegionMarket = new Map<number, number>();
  const marketKeys = new Set<string>();
  const buildingRegionByKey = new Map(
    data.buildings.map((building) => [building.key, building.regionId] as const),
  );
  for (let index = 0; index < data.markets.length; index += 1) {
    const market = data.markets[index];
    if (market === undefined) continue;
    const path = `markets[${String(index)}]`;
    if (!isValidId(market.id)) errors.push(`${path}.id must be an unsigned 32-bit integer`);
    if (marketById.has(market.id)) errors.push(`${path}.id ${String(market.id)} is duplicated`);
    marketById.set(market.id, market);
    if (marketKeys.has(market.key)) errors.push(`${path}.key ${JSON.stringify(market.key)} is duplicated`);
    marketKeys.add(market.key);
    if (market.regionIds.length === 0) errors.push(`${path}.regionIds must not be empty`);
    if (!(market.initialPriceMultiplier >= 0.25 && market.initialPriceMultiplier <= 4)) {
      errors.push(`${path}.initialPriceMultiplier must be in 0.25..4`);
    }
    const seen = new Set<number>();
    for (const regionId of market.regionIds) {
      if (!regionById.has(regionId)) {
        errors.push(`${path}.regionIds references unknown region ${String(regionId)}`);
      }
      if (!isValidId(regionId)) {
        errors.push(`${path}.regionIds contains an invalid region id ${String(regionId)}`);
      }
      if (seen.has(regionId)) errors.push(`${path}.regionIds duplicates region ${String(regionId)}`);
      seen.add(regionId);
      const existing = mapRegionMarket.get(regionId);
      if (existing !== undefined) {
        errors.push(`region ${String(regionId)} belongs to markets ${String(existing)} and ${String(market.id)}`);
      }
      mapRegionMarket.set(regionId, market.id);
    }
    const lotKeys = new Set<string>();
    for (let lotIndex = 0; lotIndex < market.stockLots.length; lotIndex += 1) {
      const lot = market.stockLots[lotIndex];
      if (lot === undefined) continue;
      const lotPath = `${path}.stockLots[${String(lotIndex)}]`;
      if (keys !== null && !keys.goods.has(lot.goodKey)) {
        errors.push(`${lotPath}.goodKey references unknown good ${JSON.stringify(lot.goodKey)}`);
      }
      const ownerRegionId = buildingRegionByKey.get(lot.ownerBuildingKey);
      if (ownerRegionId === undefined) {
        errors.push(
          `${lotPath}.ownerBuildingKey references unknown building ${JSON.stringify(lot.ownerBuildingKey)}`,
        );
      } else if (!seen.has(ownerRegionId)) {
        errors.push(`${lotPath}.ownerBuildingKey is outside the market`);
      }
      if (!(lot.quantity > 0) || !Number.isFinite(lot.quantity)) {
        errors.push(`${lotPath}.quantity must be a positive finite number`);
      }
      const lotKey = `${lot.goodKey}:${lot.ownerBuildingKey}`;
      if (lotKeys.has(lotKey)) errors.push(`${lotPath} duplicates a market stock lot`);
      lotKeys.add(lotKey);
    }
    requireSources(market.sourceIds, `${path}.sourceIds`);
  }
  for (const region of data.regions) {
    if (!mapRegionMarket.has(region.id)) {
      errors.push(`region ${String(region.id)} is not assigned to a market`);
    }
  }
  for (const country of data.countries) {
    let countryMarket: number | undefined;
    for (const regionId of country.regionIds) {
      const marketId = mapRegionMarket.get(regionId);
      if (marketId === undefined) continue;
      if (countryMarket === undefined) countryMarket = marketId;
      else if (countryMarket !== marketId) {
        errors.push(
          `country ${JSON.stringify(country.tag)} spans markets ${String(countryMarket)} and ${String(marketId)}; M5 permits one market per country`,
        );
      }
    }
    if (countryMarket === undefined) {
      errors.push(`country ${JSON.stringify(country.tag)} has no region in a market`);
    }
  }

  // E6a: each market declares (or defaults) a customs administration, and every
  // authored transport route must connect two distinct, known markets with positive
  // distance and capacity.
  const countryByTag = new Map(data.countries.map((country) => [country.tag, country]));
  for (const market of data.markets) {
    const path = `markets[${String(market.id)}]`;
    const tag = market.customsCountryTag;
    if (tag === undefined) continue;
    const country = countryByTag.get(tag);
    if (country === undefined) {
      errors.push(`${path}.customsCountryTag references unknown country ${JSON.stringify(tag)}`);
      continue;
    }
    if (!country.regionIds.some((regionId) => market.regionIds.includes(regionId))) {
      errors.push(
        `${path}.customsCountryTag ${JSON.stringify(tag)} owns no region of the market`,
      );
    }
  }
  const marketByKey = new Map(data.markets.map((market) => [market.key, market]));
  const routePairs = new Set<string>();
  for (let index = 0; index < data.tradeRoutes.length; index += 1) {
    const route = data.tradeRoutes[index];
    if (route === undefined) continue;
    const path = `tradeRoutes[${String(index)}]`;
    const marketA = marketByKey.get(route.marketAKey);
    const marketB = marketByKey.get(route.marketBKey);
    if (marketA === undefined) {
      errors.push(`${path}.marketAKey references unknown market ${JSON.stringify(route.marketAKey)}`);
    }
    if (marketB === undefined) {
      errors.push(`${path}.marketBKey references unknown market ${JSON.stringify(route.marketBKey)}`);
    }
    if (marketA !== undefined && marketB !== undefined) {
      if (marketA.id === marketB.id) {
        errors.push(`${path} must connect two different markets`);
      }
      const pair = `${String(Math.min(marketA.id, marketB.id))}:${String(Math.max(marketA.id, marketB.id))}`;
      if (routePairs.has(pair)) errors.push(`${path} duplicates a market pair`);
      routePairs.add(pair);
    }
    if (!(route.distanceUnits > 0)) errors.push(`${path}.distanceUnits must be positive`);
    if (!(route.baseCapacitySUSDPerDay > 0)) {
      errors.push(`${path}.baseCapacitySUSDPerDay must be positive`);
    }
    requireSources(route.sourceIds, `${path}.sourceIds`);
  }

  const populationKeys = new Set<string>();
  const populationByRegion = new Map<number, HistoricalPopulationInput[]>();
  const countryPopulation = new Map<number, number>();
  const countryPeasants = new Map<number, number>();
  for (let index = 0; index < data.populations.length; index += 1) {
    const population = data.populations[index];
    if (population === undefined) continue;
    const path = `populations[${String(index)}]`;
    const region = regionById.get(population.regionId);
    if (region === undefined) {
      errors.push(`${path}.regionId references unknown region ${String(population.regionId)}`);
      continue;
    }
    const key = `${String(population.regionId)}:${population.professionKey}`;
    if (populationKeys.has(key)) errors.push(`${path} duplicates region/profession ${key}`);
    populationKeys.add(key);
    if (keys !== null && !keys.professions.has(population.professionKey)) {
      errors.push(`${path}.professionKey references unknown profession ${JSON.stringify(population.professionKey)}`);
    }
    if (!isPositiveInteger(population.population)) {
      errors.push(`${path}.population must be a positive integer`);
    }
    if (!(population.literacy >= 0 && population.literacy <= 1)) {
      errors.push(`${path}.literacy must be in 0..1`);
    }
    if (!(population.wealthLevel >= 0 && population.wealthLevel <= 99)) {
      errors.push(`${path}.wealthLevel must be in 0..99`);
    }
    if (!(population.savingsPerCapitaSUSD >= 0)) {
      errors.push(`${path}.savingsPerCapitaSUSD must be non-negative`);
    }
    if (!Number.isFinite(population.population * population.savingsPerCapitaSUSD)) {
      errors.push(`${path} initial savings overflow to a non-finite value`);
    }
    if (!(population.militancy >= 0 && population.militancy <= 1)) {
      errors.push(`${path}.militancy must be in 0..1`);
    }
    requireSources(population.sourceIds, `${path}.sourceIds`);
    const list = populationByRegion.get(population.regionId) ?? [];
    list.push(population);
    populationByRegion.set(population.regionId, list);
    const countryId = regionCountry.get(population.regionId);
    if (countryId !== undefined) {
      countryPopulation.set(countryId, (countryPopulation.get(countryId) ?? 0) + population.population);
      if (population.professionKey === "peasants") {
        countryPeasants.set(countryId, (countryPeasants.get(countryId) ?? 0) + population.population);
      }
    }
  }
  for (const region of data.regions) {
    if ((populationByRegion.get(region.id) ?? []).length === 0) {
      errors.push(`region ${String(region.id)} has no population block`);
    }
  }

  const buildingKeys = new Set<string>();
  const buildingsByRegion = new Map<number, HistoricalBuildingInput[]>();
  for (let index = 0; index < data.buildings.length; index += 1) {
    const building = data.buildings[index];
    if (building === undefined) continue;
    const path = `buildings[${String(index)}]`;
    if (buildingKeys.has(building.key)) errors.push(`${path}.key ${JSON.stringify(building.key)} is duplicated`);
    buildingKeys.add(building.key);
    if (!regionById.has(building.regionId)) {
      errors.push(`${path}.regionId references unknown region ${String(building.regionId)}`);
    }
    if (keys !== null && !keys.buildings.has(building.definitionKey)) {
      errors.push(`${path}.definitionKey references unknown building definition ${JSON.stringify(building.definitionKey)}`);
    }
    if (keys !== null) {
      const definition = keys.buildingByKey.get(building.definitionKey);
      if (
        definition !== undefined &&
        !definition.ownershipAllowed.includes("private")
      ) {
        errors.push(
          `${path}.definitionKey ${JSON.stringify(building.definitionKey)} does not allow private ownership`,
        );
      }
    }
    if (keys !== null && !keys.professions.has(building.ownerProfessionKey)) {
      errors.push(`${path}.ownerProfessionKey references unknown profession ${JSON.stringify(building.ownerProfessionKey)}`);
    }
    if (!isPositiveInteger(building.level)) {
      errors.push(`${path}.level must be a positive integer`);
    }
    if (!(building.operatingCashSUSD >= 0)) {
      errors.push(`${path}.operatingCashSUSD must be non-negative`);
    }
    const ownerBlock = (populationByRegion.get(building.regionId) ?? []).find(
      (population) => population.professionKey === building.ownerProfessionKey,
    );
    if (ownerBlock === undefined) {
      errors.push(
        `${path}.ownerProfessionKey ${JSON.stringify(building.ownerProfessionKey)} has no population block in region ${String(building.regionId)}`,
      );
    }
    const list = buildingsByRegion.get(building.regionId) ?? [];
    list.push(building);
    buildingsByRegion.set(building.regionId, list);
  }
  for (const region of data.regions) {
    if ((buildingsByRegion.get(region.id) ?? []).length === 0) {
      errors.push(`region ${String(region.id)} has no building`);
    }
  }

  const buildingByKey = new Map(data.buildings.map((building) => [building.key, building]));
  const employmentFirstIndex = new Map<string, number>();
  const assignedWorkersByBlock = new Map<string, number>();
  const eligibleCache = new Map<string, number>();
  const profile = data.meta.ageStructures["world-1900-provisional"];
  const eligibleWorkforce = (
    population: HistoricalPopulationInput,
    profession: ProfessionDef,
    path: string,
  ): number => {
    const cacheKey = `${String(population.regionId)}:${population.professionKey}`;
    const cached = eligibleCache.get(cacheKey);
    if (cached !== undefined) return cached;
    if (profile === undefined) return 0;
    const ages = expandHistoricalPopulation(population.population, profile, path);
    let workingAge = 0;
    for (let age = 3; age <= 12; age += 1) {
      workingAge += ages.maleAgeGroups[age] ?? 0;
      workingAge += ages.femaleAgeGroups[age] ?? 0;
    }
    const qualified =
      population.literacy >= profession.qualificationLiteracy &&
      population.wealthLevel >= profession.qualificationWealthLevel;
    const eligible = qualified ? Math.floor(workingAge * profession.participationRate) : 0;
    eligibleCache.set(cacheKey, eligible);
    return eligible;
  };
  for (let index = 0; index < data.employment.length; index += 1) {
    const entry = data.employment[index];
    if (entry === undefined) continue;
    const path = `employment[${String(index)}]`;
    if (!isValidId(entry.regionId)) {
      errors.push(`${path}.regionId must be an unsigned 32-bit integer`);
    }
    const building = buildingByKey.get(entry.buildingKey);
    if (building === undefined) {
      errors.push(`${path}.buildingKey references unknown building ${JSON.stringify(entry.buildingKey)}`);
    } else if (building.regionId !== entry.regionId) {
      errors.push(`${path}.regionId does not match the building's region`);
    }
    const profession =
      keys === null ? undefined : keys.professionByKey.get(entry.professionKey);
    if (keys !== null && profession === undefined) {
      errors.push(
        `${path}.professionKey references unknown profession ${JSON.stringify(entry.professionKey)}`,
      );
    }
    if (building !== undefined && keys !== null && profession !== undefined) {
      const definition = keys.buildingByKey.get(building.definitionKey);
      if (definition !== undefined) {
        const job = definition.jobs.find((candidate) => candidate.professionId === profession.id);
        if (job === undefined) {
          errors.push(
            `${path}.professionKey ${JSON.stringify(entry.professionKey)} is not a job of building definition ${JSON.stringify(building.definitionKey)}`,
          );
        } else {
          const slots = Math.floor(
            job.workersPerThroughputUnit *
              definition.referenceThroughputPerDayAtLevelOne *
              building.level,
          );
          if (Number.isInteger(entry.workers) && entry.workers > slots) {
            errors.push(
              `${path}.workers ${String(entry.workers)} exceeds the ${String(slots)} job slots of ${JSON.stringify(building.key)} at level ${String(building.level)}`,
            );
          }
        }
      }
    }
    if (!isPositiveInteger(entry.workers)) errors.push(`${path}.workers must be a positive integer`);
    const key = `${String(entry.regionId)}:${entry.professionKey}:${entry.buildingKey}`;
    const firstIndex = employmentFirstIndex.get(key);
    if (firstIndex !== undefined) {
      errors.push(
        `${path} duplicates employment ${key} first declared at employment[${String(firstIndex)}]`,
      );
    } else {
      employmentFirstIndex.set(key, index);
    }
    const block = (populationByRegion.get(entry.regionId) ?? []).find(
      (population) => population.professionKey === entry.professionKey,
    );
    if (block === undefined) {
      errors.push(
        `${path} references unknown region/profession ${String(entry.regionId)}:${entry.professionKey}`,
      );
    } else if (keys !== null && profession !== undefined) {
      const blockKey = `${String(entry.regionId)}:${entry.professionKey}`;
      if (entry.workers > 0) {
        assignedWorkersByBlock.set(
          blockKey,
          (assignedWorkersByBlock.get(blockKey) ?? 0) + entry.workers,
        );
      }
      if (isPositiveInteger(block.population)) {
        eligibleWorkforce(block, profession, `employment[${String(index)}]`);
      }
    }
  }
  for (const [key, assigned] of [...assignedWorkersByBlock].sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0,
  )) {
    const eligible = eligibleCache.get(key) ?? 0;
    if (assigned > eligible) {
      errors.push(
        `employment for ${key} assigns ${String(assigned)} workers but only ${String(eligible)} are qualified and eligible`,
      );
    }
  }

  const calibrationIds = new Set<string>();
  const calibrationTargets = new Map<string, number>();
  for (let index = 0; index < data.calibration.length; index += 1) {
    const target = data.calibration[index];
    if (target === undefined) continue;
    const path = `calibration[${String(index)}]`;
    if (calibrationIds.has(target.id)) errors.push(`${path}.id ${JSON.stringify(target.id)} is duplicated`);
    calibrationIds.add(target.id);
    const targetKey = `${target.countryTag}:${target.metric}`;
    const previousTarget = calibrationTargets.get(targetKey);
    if (previousTarget !== undefined) {
      errors.push(
        `${path} duplicates calibration target ${JSON.stringify(targetKey)} first declared at calibration[${String(previousTarget)}]`,
      );
    } else {
      calibrationTargets.set(targetKey, index);
    }
    if (!countryTags.has(target.countryTag)) {
      errors.push(`${path}.countryTag references unknown country tag ${JSON.stringify(target.countryTag)}`);
    }
    if (!Number.isInteger(target.year) || target.year < 1900 || target.year > 2000) {
      errors.push(`${path}.year must be an integer in 1900..2000`);
    }
    if (!(target.target > 0)) errors.push(`${path}.target must be positive`);
    if (target.metric === "peasantPopulationShare" && target.target > 1) {
      errors.push(`${path}.target must be in 0..1 for a share metric`);
    }
    const hasTolerance =
      target.toleranceAbsolute !== undefined || target.toleranceRelative !== undefined;
    if (!hasTolerance) errors.push(`${path} must declare a tolerance`);
    if (target.toleranceAbsolute !== undefined && target.toleranceAbsolute < 0) {
      errors.push(`${path}.toleranceAbsolute must be non-negative`);
    }
    if (target.toleranceRelative !== undefined && target.toleranceRelative < 0) {
      errors.push(`${path}.toleranceRelative must be non-negative`);
    }
    requireSources(target.sourceIds, `${path}.sourceIds`);
    if (target.notes.length === 0) errors.push(`${path}.notes must not be empty`);
  }

  // Country calibration: every country must declare a total-population target and
  // a provisional occupation-structure target. Authored values must fall in the
  // declared tolerance, so an inconsistent sample cannot pass validation.
  for (const country of data.countries) {
    const populationTarget = data.calibration.find(
      (target) => target.countryTag === country.tag && target.metric === "totalPopulation",
    );
    const occupationTarget = data.calibration.find(
      (target) => target.countryTag === country.tag && target.metric === "peasantPopulationShare",
    );
    if (populationTarget === undefined) {
      errors.push(`country ${JSON.stringify(country.tag)} is missing a totalPopulation target`);
    } else {
      const value = countryPopulation.get(country.id) ?? 0;
      const tolerance =
        populationTarget.toleranceRelative !== undefined
          ? Math.abs(populationTarget.target) * populationTarget.toleranceRelative
          : (populationTarget.toleranceAbsolute ?? 0);
      if (Math.abs(value - populationTarget.target) > tolerance) {
        errors.push(
          `country ${JSON.stringify(country.tag)} authored population ${String(value)} misses target ${String(populationTarget.target)} +/- ${String(tolerance)}`,
        );
      }
    }
    if (occupationTarget === undefined) {
      errors.push(`country ${JSON.stringify(country.tag)} is missing a peasantPopulationShare target`);
      warnings.push(
        `country ${JSON.stringify(country.tag)} occupation composition is provisional; M5 has no profession-promotion mechanism`,
      );
    } else {
      const total = countryPopulation.get(country.id) ?? 0;
      const share = total > 0 ? (countryPeasants.get(country.id) ?? 0) / total : 0;
      const tolerance = occupationTarget.toleranceAbsolute ?? 0;
      if (Math.abs(share - occupationTarget.target) > tolerance) {
        errors.push(
          `country ${JSON.stringify(country.tag)} authored peasant share ${share.toFixed(4)} misses provisional target ${String(occupationTarget.target)} +/- ${String(tolerance)}`,
        );
      }
    }
  }

  // M11 static metadata: identifiers must resolve, every country must be
  // described, and selectable countries must carry a selectable status.
  const selectableStatuses = new Set<string>(["independent", "personal-union", "autonomous-vassal", "dominion"]);
  if (data.meta.countryMeta !== undefined) {
    const described = new Set<number>();
    for (let index = 0; index < data.meta.countryMeta.length; index += 1) {
      const meta = data.meta.countryMeta[index];
      if (meta === undefined) continue;
      const path = `meta.countryMeta[${String(index)}]`;
      if (!countryById.has(meta.countryId)) {
        errors.push(`${path}.countryId references unknown country ${String(meta.countryId)}`);
      }
      if (described.has(meta.countryId)) {
        errors.push(`${path}.countryId ${String(meta.countryId)} is described twice`);
      }
      described.add(meta.countryId);
      if (!countryById.has(meta.sovereignCountryId)) {
        errors.push(`${path}.sovereignCountryId references unknown country ${String(meta.sovereignCountryId)}`);
      }
      if (meta.selectable && !selectableStatuses.has(meta.status)) {
        errors.push(`${path} is selectable but has non-selectable status ${JSON.stringify(meta.status)}`);
      }
      if (!COUNTRY_STATUS_SET.has(meta.status)) {
        errors.push(`${path}.status ${JSON.stringify(meta.status)} is not a supported country status`);
      }
      if (!CONFIDENCE_SET.has(meta.confidence)) {
        errors.push(`${path}.confidence must be low, medium or high`);
      }
    }
    for (const country of data.countries) {
      if (!described.has(country.id)) {
        errors.push(`country ${JSON.stringify(country.tag)} has no countryMeta record`);
      }
    }
    if (!data.meta.countryMeta.some((meta) => meta.selectable)) {
      errors.push("meta.countryMeta must mark at least one country selectable");
    }
  }
  if (data.meta.marketMeta !== undefined) {
    const described = new Set<number>();
    for (let index = 0; index < data.meta.marketMeta.length; index += 1) {
      const meta = data.meta.marketMeta[index];
      if (meta === undefined) continue;
      const path = `meta.marketMeta[${String(index)}]`;
      const market = marketById.get(meta.marketId);
      if (market === undefined) {
        errors.push(`${path}.marketId references unknown market ${String(meta.marketId)}`);
      } else if (market.customsCountryTag !== undefined) {
        const customs = countryByTag.get(market.customsCountryTag);
        if (customs !== undefined && customs.id !== meta.customsCountryId) {
          errors.push(`${path}.customsCountryId disagrees with the market customs administration`);
        }
      }
      if (described.has(meta.marketId)) {
        errors.push(`${path}.marketId ${String(meta.marketId)} is described twice`);
      }
      described.add(meta.marketId);
      if (meta.name.length < 3) {
        errors.push(`${path}.name must be a meaningful player-facing market name`);
      }
    }
    for (const market of data.markets) {
      if (!described.has(market.id)) {
        errors.push(`market ${JSON.stringify(market.key)} has no marketMeta record`);
      }
    }
  }
  if (data.meta.regionMeta !== undefined) {
    const described = new Set<number>();
    for (let index = 0; index < data.meta.regionMeta.length; index += 1) {
      const meta = data.meta.regionMeta[index];
      if (meta === undefined) continue;
      const path = `meta.regionMeta[${String(index)}]`;
      if (!regionById.has(meta.regionId)) {
        errors.push(`${path}.regionId references unknown region ${String(meta.regionId)}`);
      }
      if (described.has(meta.regionId)) {
        errors.push(`${path}.regionId ${String(meta.regionId)} is described twice`);
      }
      described.add(meta.regionId);
      const sovereign = countryById.get(meta.sovereignCountryId);
      if (sovereign === undefined) {
        errors.push(`${path}.sovereignCountryId references unknown country`);
      } else if (!sovereign.regionIds.includes(meta.regionId)) {
        errors.push(`${path}.regionId is not owned by its declared sovereign country`);
      }
      if (meta.selectable) {
        errors.push(`${path} describes a dependent territory but is marked selectable`);
      }
    }
  }

  if (data.meta.ageStructures["world-1900-provisional"]?.status === "provisional") {
    warnings.push("age structure is provisional and not country-specific");
  }  if (data.countries.every((country) => country.currency.valuation.status === "unavailable")) {
    warnings.push("all historical currency valuations are unavailable; M5 performs no FX conversion");
  }
  return { errors: [...errors].sort(), warnings: [...warnings].sort() };
}

/** Throw `HistoricalDataError` when validation reports any error. */
export function assertValidM5HistoricalData(data: HistoricalData): void {
  const { errors } = validateM5HistoricalData(data);
  if (errors.length > 0) throw new HistoricalDataError(errors);
}

function largestRemainder(
  total: number,
  weights: readonly number[],
  path: string,
): number[] {
  if (!Number.isInteger(total) || total < 0) {
    throw new RangeError(`${path} total must be a non-negative integer`);
  }
  let totalWeight = 0;
  for (const weight of weights) {
    if (!Number.isFinite(weight) || weight < 0) {
      throw new RangeError(`${path} weights must be finite and non-negative`);
    }
    totalWeight += weight;
  }
  if (totalWeight <= 0) throw new RangeError(`${path} weights must have a positive sum`);
  const allocations = weights.map((weight) => Math.floor((total * weight) / totalWeight));
  let assigned = allocations.reduce((sum, value) => sum + value, 0);
  const remainders = weights.map((weight, index) => {
    const exact = (total * weight) / totalWeight;
    return { index, remainder: exact - Math.floor(exact) };
  });
  remainders.sort(
    (left, right) => right.remainder - left.remainder || left.index - right.index,
  );
  for (const candidate of remainders) {
    if (assigned >= total) break;
    allocations[candidate.index] = (allocations[candidate.index] ?? 0) + 1;
    assigned += 1;
  }
  if (assigned !== total) throw new RangeError(`${path} allocation did not conserve the total`);
  return allocations;
}

/** Expand one block's total population across the 34 sex/age band cells. */
export function expandHistoricalPopulation(
  population: number,
  profile: HistoricalAgeStructure,
  path: string,
): { readonly maleAgeGroups: number[]; readonly femaleAgeGroups: number[] } {
  const weights = [...profile.maleCounts, ...profile.femaleCounts];
  const allocations = largestRemainder(population, weights, path);
  return {
    maleAgeGroups: allocations.slice(0, 17),
    femaleAgeGroups: allocations.slice(17),
  };
}

/** Build the validated economy scenario from the historical tables. */
export function buildM5HistoricalScenario(data: HistoricalData): EconomyScenarioDef {
  assertValidM5HistoricalData(data);
  const goods = readJson<GoodDef[]>(data.meta.definitions.goods);
  const professions = readJson<ProfessionDef[]>(data.meta.definitions.professions);
  const buildings = readJson<BuildingDef[]>(data.meta.definitions.buildings);
  const needs = readJson<NeedTierDef[]>(data.meta.definitions.needs);
  const demography = readJson<{
    mortalityAnchors: PopulationDefinitions["mortalityAnchors"];
    fertilityAnchors: PopulationDefinitions["fertilityAnchors"];
    sexRatioAtBirth: number;
    fertilityMultipliers: PopulationDefinitions["fertilityMultipliers"];
  }>(data.meta.definitions.demography);
  const politics = readJson<PoliticsDefinitions>("politics.json");
  assertValidPoliticsDefinitions(politics, "politics");
  const technology = readJson<TechnologyDefinitions>(data.meta.definitions.technology);
  assertValidTechnologyDefinitions(technology, "technology");

  const economyDefinitions: EconomyDefinitions = {
    dataVersion: data.meta.dataVersion,
    scenarioId: data.meta.scenarioId,
    goods,
    professions,
    buildings,
    politics,
    technology,
  };
  assertValidEconomyDefinitions(economyDefinitions);

  const professionByKey = new Map(professions.map((profession) => [profession.key, profession]));
  const buildingByKey = new Map(buildings.map((building) => [building.key, building]));
  const profile = data.meta.ageStructures["world-1900-provisional"];
  if (profile === undefined) throw new HistoricalDataError(["missing world-1900-provisional age structure"]);

  const populationDefinitions: PopulationDefinitions = {
    dataVersion: data.meta.dataVersion,
    scenarioId: data.meta.scenarioId,
    needs,
    mortalityAnchors: demography.mortalityAnchors,
    fertilityAnchors: demography.fertilityAnchors,
    sexRatioAtBirth: demography.sexRatioAtBirth,
    fertilityMultipliers: demography.fertilityMultipliers.filter((entry) =>
      professions.some((profession) => profession.id === entry.professionId),
    ),
  };
  assertValidPopulationDefinitions(populationDefinitions);

  const sortedPopulations = [...data.populations].sort((left, right) => {
    if (left.regionId !== right.regionId) return left.regionId - right.regionId;
    return left.professionKey < right.professionKey
      ? -1
      : left.professionKey > right.professionKey
        ? 1
        : 0;
  });
  const blockIdByKey = new Map<string, number>();
  const accountIdByKey = new Map<string, number>();
  const popBlocks = sortedPopulations.map((population, index) => {
    const profession = professionByKey.get(population.professionKey);
    if (profession === undefined) {
      throw new HistoricalDataError([
        `population ${String(population.regionId)}:${population.professionKey} references an unknown profession`,
      ]);
    }
    const householdAccountId = HISTORICAL_HOUSEHOLD_ACCOUNT_BASE + index;
    const key = `${String(population.regionId)}:${population.professionKey}`;
    blockIdByKey.set(key, index);
    accountIdByKey.set(key, householdAccountId);
    const ages = expandHistoricalPopulation(
      population.population,
      profile,
      `population ${key}`,
    );
    return {
      id: index,
      regionId: population.regionId,
      professionId: profession.id,
      financialAccountId: householdAccountId,
      maleAgeGroups: ages.maleAgeGroups,
      femaleAgeGroups: ages.femaleAgeGroups,
      literacy: population.literacy,
      wealthLevel: population.wealthLevel,
      initialSavingsSUSD: population.population * population.savingsPerCapitaSUSD,
      militancy: population.militancy,
    };
  });

  const regions: RegionInitialDef[] = [...data.regions]
    .sort((left, right) => left.id - right.id)
    .map((region) => ({
      id: region.id,
      key: region.key,
      name: region.name,
      ...(region.resourceCapsPerDay === undefined
        ? {}
        : { resourceCapsPerDay: region.resourceCapsPerDay }),
      ...(region.infrastructure === undefined
        ? {}
        : { infrastructure: region.infrastructure }),
    }));

  const sortedMarkets = [...data.markets].sort((left, right) => left.id - right.id);
  const sortedBuildings = [...data.buildings].sort((left, right) => {
    if (left.regionId !== right.regionId) return left.regionId - right.regionId;
    if (left.definitionKey !== right.definitionKey) {
      return left.definitionKey < right.definitionKey ? -1 : 1;
    }
    if (left.level !== right.level) return left.level - right.level;
    return left.key < right.key ? -1 : left.key > right.key ? 1 : 0;
  });
  const buildingIdByKey = new Map<string, number>();
  const buildingInstances: BuildingInstanceInitialDef[] = sortedBuildings.map(
    (building, index) => {
      const definition = buildingByKey.get(building.definitionKey);
      if (definition === undefined) {
        throw new HistoricalDataError([
          `building ${building.key} references unknown definition ${building.definitionKey}`,
        ]);
      }
      const ownerKey = `${String(building.regionId)}:${building.ownerProfessionKey}`;
      const ownerAccountId = accountIdByKey.get(ownerKey);
      if (ownerAccountId === undefined) {
        throw new HistoricalDataError([
          `building ${building.key} has no owner household in ${ownerKey}`,
        ]);
      }
      buildingIdByKey.set(building.key, index);
      return {
        id: index,
        definitionId: definition.id,
        regionId: building.regionId,
        level: building.level,
        condition: 1,
        ownerKind: "private",
        ownerAccountId,
        builtOnDay: data.meta.startDayIndex,
        operational: true,
        operatingCashAccountId: HISTORICAL_BUILDING_ACCOUNT_BASE + index,
        initialOperatingCashSUSD: building.operatingCashSUSD,
      };
    },
  );

  // Employment ids are derived from the resolved authoritative identities, not
  // from the authored JSON array order. Sorting by (building, pop block,
  // profession) makes the generated ids and canonical world hash independent of
  // record order. The composite identity is unique because validation rejects
  // duplicate employment keys.
  const employment: EmploymentAssignmentInitialDef[] = data.employment
    .map((entry) => {
      const buildingId = buildingIdByKey.get(entry.buildingKey);
      const popBlockId = blockIdByKey.get(`${String(entry.regionId)}:${entry.professionKey}`);
      const profession = professionByKey.get(entry.professionKey);
      if (buildingId === undefined || popBlockId === undefined || profession === undefined) {
        throw new HistoricalDataError([
          `employment ${entry.buildingKey} could not be resolved after construction`,
        ]);
      }
      return {
        popBlockId,
        buildingInstanceId: buildingId,
        professionId: profession.id,
        workers: entry.workers,
      };
    })
    .sort(
      (left, right) =>
        left.buildingInstanceId - right.buildingInstanceId ||
        left.popBlockId - right.popBlockId ||
        left.professionId - right.professionId,
    )
    .map((entry, index) => ({ id: index, ...entry }));

  const goodByKey = new Map(goods.map((good) => [good.key, good]));
  const countryByTag = new Map(data.countries.map((country) => [country.tag, country]));
  const markets: MarketInitialDef[] = sortedMarkets.map((market) => {
    const customs =
      market.customsCountryTag === undefined
        ? undefined
        : countryByTag.get(market.customsCountryTag);
    if (market.customsCountryTag !== undefined && customs === undefined) {
      throw new HistoricalDataError([
        `market ${String(market.id)} references unknown customs country ${JSON.stringify(market.customsCountryTag)}`,
      ]);
    }
    return {
      id: market.id,
      regionIds: [...market.regionIds].sort((left, right) => left - right),
      priceSUSD: goods.map((good) => good.basePrice1900SUSD * market.initialPriceMultiplier),
      stockLots: market.stockLots.map((lot) => {
        const good = goodByKey.get(lot.goodKey);
        const ownerBuildingId = buildingIdByKey.get(lot.ownerBuildingKey);
        if (good === undefined || ownerBuildingId === undefined) {
          throw new HistoricalDataError([
            `market ${String(market.id)} stock lot ${lot.goodKey}:${lot.ownerBuildingKey} could not be resolved`,
          ]);
        }
        return {
          goodId: good.id,
          ownerBuildingId,
          quantity: lot.quantity,
        };
      }),
      ...(customs === undefined ? {} : { customsCountryId: customs.id }),
    };
  });

  // E6a transport routes: market keys resolve to the validated market ids.
  const marketIdByKey = new Map(sortedMarkets.map((market) => [market.key, market.id]));
  const tradeRoutes: TradeRouteInitialDef[] = data.tradeRoutes.map((route) => {
    const marketAId = marketIdByKey.get(route.marketAKey);
    const marketBId = marketIdByKey.get(route.marketBKey);
    if (marketAId === undefined || marketBId === undefined) {
      throw new HistoricalDataError([
        `trade route ${route.marketAKey}->${route.marketBKey} could not be resolved`,
      ]);
    }
    return {
      marketAId,
      marketBId,
      distanceUnits: route.distanceUnits,
      baseCapacitySUSDPerDay: route.baseCapacitySUSDPerDay,
    };
  });

  const currencies = data.countries
    .slice()
    .sort((left, right) => left.id - right.id)
    .map((country) => ({
      id: country.id,
      key: country.currency.key,
      name: country.currency.name,
      issuer: { kind: "country" as const, countryId: country.id },
    }));
  const currencyValuations: CurrencyValuation[] = data.countries
    .slice()
    .sort((left, right) => left.id - right.id)
    .map((country) =>
      country.currency.valuation.status === "specified"
        ? {
            currencyId: country.id,
            status: "specified" as const,
            susdPerUnit: asSusdPerCurrencyUnit(country.currency.valuation.susdPerUnit),
            setOnDay: data.meta.startDayIndex,
            source: "scenario" as const,
          }
        : { currencyId: country.id, status: "unavailable" as const },
    );

  const countries: CountryInitialDef[] = data.countries
    .slice()
    .sort((left, right) => left.id - right.id)
    .map((country) => ({
      id: country.id,
      tag: country.tag,
      name: country.name,
      monetary: { kind: "own", currencyId: country.id },
      regionIds: [...country.regionIds].sort((left, right) => left - right),
      treasuryAccountId: HISTORICAL_TREASURY_ACCOUNT_BASE + country.id,
      initialTreasuryCashSUSD: country.initialTreasuryCashSUSD,
      fiscal: { ...country.fiscal },
      ...(country.debt === undefined ? {} : { debt: { ...country.debt } }),
      ...(country.politics === undefined ? {} : { politics: { ...country.politics } }),
      ...(country.technology === undefined ? {} : { technology: { ...country.technology } }),
      immigrationOpen: country.immigrationOpen,
    }));

  const systemAccounts: SystemAccountInitialDef[] = [
    {
      id: HISTORICAL_SYSTEM_ACCOUNT_ID,
      accountKind: "system-reserve",
      balanceSUSD: 0,
    },
  ];

  const population: PopulationScenarioDef = {
    dataVersion: data.meta.dataVersion,
    scenarioId: data.meta.scenarioId,
    startDayIndex: data.meta.startDayIndex,
    professions: professions.map((profession) => ({
      id: profession.id,
      key: profession.key,
      name: profession.name,
      stratum: profession.stratum,
    })),
    regions,
    popBlocks,
    definitions: populationDefinitions,
  };

  const playerCountry = data.countries.find(
    (country) => country.tag === data.meta.playerCountryTag,
  );
  if (playerCountry === undefined) {
    throw new HistoricalDataError([
      `meta.playerCountryTag ${JSON.stringify(data.meta.playerCountryTag)} is not a registered country`,
    ]);
  }

  return {
    population,
    definitions: economyDefinitions,
    buildingInstances,
    markets,
    tradeRoutes,
    systemAccounts,
    employment,
    countries,
    playerCountryId: playerCountry.id,
    currencies,
    currencyValuations,
    ...(data.meta.profitDistribution === undefined
      ? {}
      : { profitDistribution: { ...data.meta.profitDistribution } }),
    ...(data.meta.countryAI === undefined
      ? {}
      : { countryAI: { ...data.meta.countryAI } }),
    // E6b: the sample enables the monetary system so the player can establish a
    // reserve-backed authority; its currency valuations are explicitly unavailable, so
    // no authority is active and no historical exchange rate is invented (D-080).
    monetary: {},
    // M10: the sample enables the military system with no initial armies, wars, or
    // occupations, so the player can recruit, declare war, and negotiate (D-081).
    military: {},
    ...(data.meta.countryMeta === undefined ? {} : { countryMeta: [...data.meta.countryMeta] }),
    ...(data.meta.marketMeta === undefined ? {} : { marketMeta: [...data.meta.marketMeta] }),
    ...(data.meta.regionMeta === undefined ? {} : { regionMeta: [...data.meta.regionMeta] }),
  };
}

/** Load and build the eight-polity M5 scenario. */
export function loadM5EightPolities(): EconomyScenarioDef {
  return buildM5HistoricalScenario(loadM5HistoricalData());
}

/** Load and build the M11 1900 world used by the playable game. */
export function loadM11World(): EconomyScenarioDef {
  const data = loadHistoricalData(WORLD_SCENARIO_FILE);
  return buildM5HistoricalScenario(data);
}
