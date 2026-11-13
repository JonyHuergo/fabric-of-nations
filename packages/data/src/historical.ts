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

import { loadDemography1900, type Demography1900 } from "./demography1900.js";
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
  MAX_DEBT_PRINCIPAL_RUSD,
  MAX_DEBT_TERM_DAYS,
  MAX_FISCAL_BUDGET_RUSD_PER_YEAR,
  MONEY_COEFFICIENT_KEYS,
  asRusdPerCurrencyUnit,
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
  type Currency,
  type CurrencyValuation,
  type DepositInitialDef,
  type EconomyDefinitions,
  type EconomyScenarioDef,
  type EmploymentAssignmentInitialDef,
  type GoodDef,
  type MarketInitialDef,
  type MarketMetaDef,
  type MonetaryArrangement,
  type MonetaryCurrencyInput,
  type MoneyCoefficients,
  type DemandSystemDef,
  type LabourMarketDefinitions,
  type NeedTierDef,
  type PoliticsDefinitions,
  type PopulationDefinitions,
  type PopulationScenarioDef,
  type ProfessionDef,
  type ProvinceEconomyInitialDef,
  type SystemAccountInitialDef,
  type TerritoryMetaDef,
  type TechnologyDefinitions,
  type TradeRouteInitialDef,
} from "@century/sim";

import { loadCurrencyTable, type CurrencyTable1900 } from "./currencies.js";
import { loadM11Provinces } from "./provinces.js";
import { DATA_PACKAGE_VERSION } from "./version.js";

const DATA_ROOT = fileURLToPath(new URL("../data/", import.meta.url));

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
  readonly provinces: string;
  readonly markets: string;
  readonly tradeRoutes: string;
  readonly populations: string;
  readonly buildings: string;
  readonly employment: string;
  readonly calibration: string;
  /** P2b money coefficients file (D-135); optional for the pre-P2b scenarios. */
  readonly moneyCoefficients?: string;
  /** P3 currencies, arrangements and parities (D-141); supersedes the country currency blocks. */
  readonly currencies?: string;
  /**
   * P4 sourced 1900 demography (D-142): per-province levels and age structures and
   * per-block urban shares. Without it every block uses the world age structure and
   * the standard schedule (the M5 sample).
   */
  readonly demography?: string;
  /** P5 (D-143 §4) natural-resource deposits, built by scripts/p5/build-p5-world.mjs. */
  readonly deposits?: string;
  /**
   * D-140 / D-149: the 1900 metal-standard authorities (sourced money stocks and capped
   * treasury funding), built by scripts/p5b/build-goods-1900.mjs. Requires `currencies`.
   */
  readonly monetary?: string;
}

export interface HistoricalScenarioDefinitions {
  readonly goods: string;
  readonly professions: string;
  readonly buildings: string;
  readonly needs: string;
  readonly demography: string;
  readonly technology: string;
  /** P6 (D-153): the demand system (linear expenditure system); absent: need tiers. */
  readonly demandSystem?: string;
  /** P7 (D-154): the labour-market configuration; absent: static wages (legacy). */
  readonly labourMarket?: string;
  /** P7 (D-154): the politics content; absent: the shared politics.json. */
  readonly politics?: string;
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
  /** P2 dependent-territory metadata (D-118 §3). */
  readonly territoryMeta?: readonly TerritoryMetaDef[];
  /**
   * P4 (D-142): demographic levels for every block of a scenario without a per-province
   * demography file (the 1900 world aggregate levels); absent means the standard schedule.
   */
  readonly worldDemography?: {
    readonly fertilityLevel: number;
    readonly childMortalityLevel: number;
    readonly adultMortalityLevel: number;
    readonly urbanShare: number;
  };
  /** P2b sourced money coefficients (D-135); omitted means the simulation defaults. */
  readonly moneyCoefficients?: MoneyCoefficients;
}

export interface HistoricalCurrencyInput {
  readonly key: string;
  readonly name: string;
  readonly valuation:
    | { readonly status: "unavailable" }
    | {
        readonly status: "specified";
        readonly rusdPerUnit: number;
        readonly sourceIds: readonly string[];
      };
}

export interface HistoricalCountryInput {
  readonly id: number;
  readonly tag: string;
  readonly name: string;
  readonly provinceIds: readonly number[];
  readonly currency: HistoricalCurrencyInput;
  readonly fiscal: {
    readonly incomeTaxRate: number;
    readonly welfareBudgetRUSDPerYear: number;
  };
  readonly initialTreasuryCashRUSD: number;
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
    readonly maxOutstandingPrincipalRUSD: number;
    readonly refinanceOnMaturity: boolean;
    readonly arrearsGraceDays: number;
  };
  readonly immigrationOpen: boolean;
  /** M8 provisional regime/law/funding state. */
  readonly politics?: CountryPoliticsInput;
  /** M9 provisional researched technologies and education funding. */
  readonly technology?: CountryTechnologyInput;
  /** P7 (D-154): the training budget and the health share of the administration budget. */
  readonly labor?: { readonly trainingBudgetRUSDPerYear: number; readonly healthStaffShare: number };
  readonly sourceIds: readonly string[];
  readonly occupationSourceIds: readonly string[];
}

export interface HistoricalProvinceInput {
  readonly id: number;
  readonly key: string;
  readonly name: string;
  /** M8 provisional provincial infrastructure quality, 0..1. */
  readonly infrastructure?: number;
  /** P2 HYDE 3.3 cropland, hectares. */
  readonly arableLandHa?: number;
  /** P2 HYDE 3.3 pasture and rangeland, hectares. */
  readonly pastureHa?: number;
  /** P2 HYDE 3.3 urban share of the 1900 population, 0..1. */
  readonly urbanShare?: number;
  /** P2b annual wage per worker by profession key, RUSD (D-135). */
  readonly wageRUSDPerYearByProfession?: Readonly<Record<string, number>>;
  /** P5b (C-8): absolute latitude of the province's label point, degrees. */
  readonly absLatitudeDeg?: number;
  /** P5b (C-12): gross theoretical hydro potential, MWh/year (HydroSHEDS RiverATLAS). */
  readonly hydroPotentialMWhPerYear?: number;
  /** P6 (D-153): persons per dwelling at the 1900 census (or the recorded proxy). */
  readonly housingReferencePersonsPerDwelling?: number;
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
  readonly provinceIds: readonly number[];
  /** E6a customs administration tag; defaults to the lowest-province owner. */
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
  readonly baseCapacityRUSDPerDay: number;
  readonly status: "provisional" | "calibrated";
  readonly sourceIds: readonly string[];
}

export interface HistoricalPopulationInput {
  readonly provinceId: number;
  readonly professionKey: string;
  readonly population: number;
  readonly literacy: number;
  readonly wealthLevel: number;
  readonly savingsPerCapitaRUSD: number;
  readonly militancy: number;
  /** P6 (D-153): expected 1900 income per person per day, RUSD (generator estimate). */
  readonly incomeRUSDPerCapitaDay?: number;
  readonly sourceIds: readonly string[];
  readonly calibrationStatus: "source-backed" | "provisional";
}

export interface HistoricalBuildingInput {
  readonly key: string;
  readonly provinceId: number;
  readonly definitionKey: string;
  readonly level: number;
  readonly ownerProfessionKey: string;
  readonly operatingCashRUSD: number;
  /** P2b technique factor (D-135); defaults to 1. */
  readonly technique?: number;
  /** P5b: id of the deposit an extraction building works (deposits file id). */
  readonly depositId?: number;
  /** P7 (D-154, R8): the building's own job mix (profession ids), when it differs from its definition's jobs. */
  readonly jobMix?: readonly { readonly professionId: number; readonly workersPerThroughputUnit: number }[];
  readonly status: "provisional" | "calibrated";
}

export interface HistoricalEmploymentInput {
  readonly buildingKey: string;
  readonly provinceId: number;
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
  readonly provinces: readonly HistoricalProvinceInput[];
  readonly markets: readonly HistoricalMarketInput[];
  readonly tradeRoutes: readonly HistoricalTradeRouteInput[];
  readonly populations: readonly HistoricalPopulationInput[];
  readonly buildings: readonly HistoricalBuildingInput[];
  readonly employment: readonly HistoricalEmploymentInput[];
  readonly calibration: readonly HistoricalCalibrationTarget[];
  /** P3 (D-141) derived currency table; omitted for scenarios without a currencies file. */
  readonly currencyTable?: CurrencyTable1900;
  /** P4 (D-142) sourced 1900 demography; omitted for scenarios without a demography file. */
  readonly demography1900?: Demography1900;
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
      homeTerritoryName: stringField(record, "homeTerritoryName", path, errors),
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
      memberCountryIds: integerArrayField(record, "memberCountryIds", path, errors),
    };
  });
}

function readTerritoryMeta(value: unknown, errors: string[]): TerritoryMetaDef[] {
  if (!Array.isArray(value)) {
    errors.push("meta.territoryMeta must be an array");
    return [];
  }
  return value.map((raw, index) => {
    const path = `meta.territoryMeta[${String(index)}]`;
    const record = assertRecord(raw, path, errors);
    const status = stringField(record, "status", path, errors);
    if (!COUNTRY_STATUS_SET.has(status)) {
      errors.push(`${path}.status ${JSON.stringify(status)} is not a supported country status`);
    }
    return {
      polityTag: stringField(record, "polityTag", path, errors),
      provinceIds: integerArrayField(record, "provinceIds", path, errors),
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

function readWorldDemography(
  value: unknown,
  errors: string[],
): NonNullable<HistoricalScenarioMeta["worldDemography"]> {
  const record = assertRecord(value, "meta.worldDemography", errors);
  const field = (name: string, minimum: number, maximum: number): number => {
    const number = numberField(record, name, "meta.worldDemography", errors);
    if (!(number >= minimum && number <= maximum)) errors.push(`meta.worldDemography.${name} must be in ${String(minimum)}..${String(maximum)}`);
    return number;
  };
  return {
    fertilityLevel: field("fertilityLevel", 0, 4),
    childMortalityLevel: field("childMortalityLevel", 1e-4, 50),
    adultMortalityLevel: field("adultMortalityLevel", 1e-4, 50),
    urbanShare: field("urbanShare", 0, 1),
  };
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
      provinces: stringField(files, "provinces", "meta.files", errors),
      markets: stringField(files, "markets", "meta.files", errors),
      tradeRoutes: stringField(files, "tradeRoutes", "meta.files", errors),
      populations: stringField(files, "populations", "meta.files", errors),
      buildings: stringField(files, "buildings", "meta.files", errors),
      employment: stringField(files, "employment", "meta.files", errors),
      calibration: stringField(files, "calibration", "meta.files", errors),
      ...(files.moneyCoefficients === undefined
        ? {}
        : { moneyCoefficients: stringField(files, "moneyCoefficients", "meta.files", errors) }),
      ...(files.currencies === undefined
        ? {}
        : { currencies: stringField(files, "currencies", "meta.files", errors) }),
      ...(files.demography === undefined
        ? {}
        : { demography: stringField(files, "demography", "meta.files", errors) }),
      ...(files.deposits === undefined
        ? {}
        : { deposits: stringField(files, "deposits", "meta.files", errors) }),
      ...(files.monetary === undefined
        ? {}
        : { monetary: stringField(files, "monetary", "meta.files", errors) }),
    },
    definitions: {
      goods: stringField(definitions, "goods", "meta.definitions", errors),
      professions: stringField(definitions, "professions", "meta.definitions", errors),
      buildings: stringField(definitions, "buildings", "meta.definitions", errors),
      needs: stringField(definitions, "needs", "meta.definitions", errors),
      demography: stringField(definitions, "demography", "meta.definitions", errors),
      technology: stringField(definitions, "technology", "meta.definitions", errors),
      ...(definitions.demandSystem === undefined
        ? {}
        : { demandSystem: stringField(definitions, "demandSystem", "meta.definitions", errors) }),
      ...(definitions.labourMarket === undefined
        ? {}
        : { labourMarket: stringField(definitions, "labourMarket", "meta.definitions", errors) }),
      ...(definitions.politics === undefined
        ? {}
        : { politics: stringField(definitions, "politics", "meta.definitions", errors) }),
    },
    ...(profitDistribution === undefined ? {} : { profitDistribution }),
    ...(countryAI === undefined ? {} : { countryAI }),
    ...(record.countryMeta === undefined
      ? {}
      : { countryMeta: readCountryMeta(record.countryMeta, errors) }),
    ...(record.marketMeta === undefined
      ? {}
      : { marketMeta: readMarketMeta(record.marketMeta, errors) }),
    ...(record.worldDemography === undefined
      ? {}
      : { worldDemography: readWorldDemography(record.worldDemography, errors) }),
    ...(record.territoryMeta === undefined
      ? {}
      : { territoryMeta: readTerritoryMeta(record.territoryMeta, errors) }),
    ...(record.moneyCoefficients === undefined
      ? {}
      : { moneyCoefficients: readMoneyCoefficients(record.moneyCoefficients, errors) }),
  };
}

/** P2b money coefficients: one `{ valueRUSD, rowIds, formula, status }` record per coefficient. */
function readMoneyCoefficients(value: unknown, errors: string[]): MoneyCoefficients {
  const record = assertRecord(value, "meta.moneyCoefficients", errors);
  const result = {} as MoneyCoefficients;
  for (const key of MONEY_COEFFICIENT_KEYS) {
    const entry = assertRecord(record[key], `meta.moneyCoefficients.${key}`, errors);
    const amount = numberField(entry, "valueRUSD", `meta.moneyCoefficients.${key}`, errors);
    if (!(amount > 0)) errors.push(`meta.moneyCoefficients.${key}.valueRUSD must be positive`);
    result[key] = amount;
  }
  return result;
}

/** Load the raw historical tables for one scenario file from the data package. */
export function loadHistoricalData(scenarioFile: string): HistoricalData {
  const rawScenario = readJson<unknown>(scenarioFile);
  const errors: string[] = [];
  const metaRecord = assertRecord(rawScenario, "scenario", errors);
  const parsedMeta = readMeta(metaRecord.meta, errors);
  const meta: HistoricalScenarioMeta =
    parsedMeta.files.moneyCoefficients === undefined
      ? parsedMeta
      : {
          ...parsedMeta,
          moneyCoefficients: readMoneyCoefficients(readJson<unknown>(parsedMeta.files.moneyCoefficients), errors),
        };
  if (errors.length > 0) throw new HistoricalDataError(errors.sort());

  const countries = readJson<unknown>(meta.files.countries);
  const provinces = readJson<unknown>(meta.files.provinces);
  const markets = readJson<unknown>(meta.files.markets);
  const tradeRoutes = readJson<unknown>(meta.files.tradeRoutes);
  const populations = readJson<unknown>(meta.files.populations);
  const buildings = readJson<unknown>(meta.files.buildings);
  const employment = readJson<unknown>(meta.files.employment);
  const calibration = readJson<unknown>(meta.files.calibration);
  for (const [label, value] of [
    ["countries", countries],
    ["provinces", provinces],
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
    provinces,
    markets,
    tradeRoutes,
    populations,
    buildings,
    employment,
    calibration,
  });
  assertValidM5HistoricalData(data);
  return {
    ...data,
    ...(meta.files.currencies === undefined
      ? {}
      : {
          currencyTable: loadCurrencyTable(
            meta.files.currencies,
            data.countries.map((country) => country.tag),
          ),
        }),
    ...(meta.files.demography === undefined
      ? {}
      : { demography1900: loadDemography1900(meta.files.demography) }),
  };
}

interface RawTables {
  readonly meta: HistoricalScenarioMeta;
  readonly countries: unknown;
  readonly provinces: unknown;
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
  const provinces = parseProvinces(tables.provinces, errors);
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
    provinces,
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
              maxOutstandingPrincipalRUSD: numberField(
                debtor,
                "maxOutstandingPrincipalRUSD",
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
              ...(politicsRecord.institutionFundingRUSDPerYear === undefined
                ? {}
                : {
                    institutionFundingRUSDPerYear: numberField(
                      politicsRecord,
                      "institutionFundingRUSDPerYear",
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
              ...(technologyRecord.educationFundingRUSDPerYear === undefined
                ? {}
                : {
                    educationFundingRUSDPerYear: numberField(
                      technologyRecord,
                      "educationFundingRUSDPerYear",
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
    const labor =
      record.labor === undefined
        ? undefined
        : (() => {
            const laborRecord = assertRecord(record.labor, `${path}.labor`, errors);
            return {
              trainingBudgetRUSDPerYear: numberField(laborRecord, "trainingBudgetRUSDPerYear", `${path}.labor`, errors),
              healthStaffShare: numberField(laborRecord, "healthStaffShare", `${path}.labor`, errors),
            };
          })();
    return {
      id: numberField(record, "id", path, errors),
      tag: stringField(record, "tag", path, errors, { maxLength: MAX_COUNTRY_TAG_LENGTH }),
      name: stringField(record, "name", path, errors, { maxLength: MAX_COUNTRY_NAME_LENGTH }),
      provinceIds: numberArrayField(record, "provinceIds", path, errors),
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
                rusdPerUnit: numberField(
                  valuationRecord,
                  "rusdPerUnit",
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
        welfareBudgetRUSDPerYear: numberField(
          fiscal,
          "welfareBudgetRUSDPerYear",
          `${path}.fiscal`,
          errors,
        ),
      },
      initialTreasuryCashRUSD: numberField(record, "initialTreasuryCashRUSD", path, errors),
      ...(debt === undefined ? {} : { debt }),
      ...(politics === undefined ? {} : { politics }),
      ...(technology === undefined ? {} : { technology }),
      ...(labor === undefined ? {} : { labor }),
      immigrationOpen: booleanField(record, "immigrationOpen", path, errors),
      sourceIds: stringArrayField(record, "sourceIds", path, errors),
      occupationSourceIds: stringArrayField(record, "occupationSourceIds", path, errors),
    };
  });
}

function parseProvinces(value: unknown, errors: string[]): HistoricalProvinceInput[] {
  const values = value as readonly unknown[];
  return values.map((raw, index) => {
    const path = `provinces[${String(index)}]`;
    const record = assertRecord(raw, path, errors);
    const status = stringField(record, "calibrationStatus", path, errors);
    if (status !== "source-backed" && status !== "provisional") {
      errors.push(`${path}.calibrationStatus must be "source-backed" or "provisional"`);
    }
    const optional = (key: "arableLandHa" | "pastureHa" | "urbanShare"): number | undefined =>
      record[key] === undefined ? undefined : numberField(record, key, path, errors);
    const arableLandHa = optional("arableLandHa");
    const pastureHa = optional("pastureHa");
    const urbanShare = optional("urbanShare");
    for (const [key, field] of [["arableLandHa", arableLandHa], ["pastureHa", pastureHa]] as const) {
      if (field !== undefined && !(field >= 0)) errors.push(`${path}.${key} must be non-negative`);
    }
    if (urbanShare !== undefined && !(urbanShare >= 0 && urbanShare <= 1)) {
      errors.push(`${path}.urbanShare must be in 0..1`);
    }
    const absLatitudeDeg = record.absLatitudeDeg === undefined ? undefined : numberField(record, "absLatitudeDeg", path, errors);
    if (absLatitudeDeg !== undefined && !(absLatitudeDeg >= 0 && absLatitudeDeg <= 90)) {
      errors.push(`${path}.absLatitudeDeg must be in 0..90`);
    }
    const hydroPotentialMWhPerYear =
      record.hydroPotentialMWhPerYear === undefined
        ? undefined
        : numberField(record, "hydroPotentialMWhPerYear", path, errors);
    if (hydroPotentialMWhPerYear !== undefined && !(hydroPotentialMWhPerYear >= 0)) {
      errors.push(`${path}.hydroPotentialMWhPerYear must be non-negative`);
    }
    const housingReferencePersonsPerDwelling =
      record.housingReferencePersonsPerDwelling === undefined
        ? undefined
        : numberField(record, "housingReferencePersonsPerDwelling", path, errors);
    if (housingReferencePersonsPerDwelling !== undefined && !(housingReferencePersonsPerDwelling > 0)) {
      errors.push(`${path}.housingReferencePersonsPerDwelling must be positive`);
    }
    const infrastructure =
      record.infrastructure === undefined
        ? undefined
        : numberField(record, "infrastructure", path, errors);
    let wages: Record<string, number> | undefined;
    if (record.wageRUSDPerYearByProfession !== undefined) {
      const wageRecord = assertRecord(record.wageRUSDPerYearByProfession, `${path}.wageRUSDPerYearByProfession`, errors);
      wages = {};
      for (const key of Object.keys(wageRecord)) {
        const wage = numberField(wageRecord, key, `${path}.wageRUSDPerYearByProfession`, errors);
        if (!(wage > 0)) errors.push(`${path}.wageRUSDPerYearByProfession.${key} must be positive`);
        wages[key] = wage;
      }
    }
    return {
      id: numberField(record, "id", path, errors),
      key: stringField(record, "key", path, errors),
      name: stringField(record, "name", path, errors),
      ...(infrastructure === undefined ? {} : { infrastructure }),
      ...(arableLandHa === undefined ? {} : { arableLandHa }),
      ...(pastureHa === undefined ? {} : { pastureHa }),
      ...(urbanShare === undefined ? {} : { urbanShare }),
      ...(wages === undefined ? {} : { wageRUSDPerYearByProfession: wages }),
      ...(absLatitudeDeg === undefined ? {} : { absLatitudeDeg }),
      ...(hydroPotentialMWhPerYear === undefined ? {} : { hydroPotentialMWhPerYear }),
      ...(housingReferencePersonsPerDwelling === undefined ? {} : { housingReferencePersonsPerDwelling }),
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
      provinceIds: numberArrayField(record, "provinceIds", path, errors),
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
      baseCapacityRUSDPerDay: numberField(record, "baseCapacityRUSDPerDay", path, errors),
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
      provinceId: numberField(record, "provinceId", path, errors),
      professionKey: stringField(record, "professionKey", path, errors),
      population: numberField(record, "population", path, errors),
      literacy: numberField(record, "literacy", path, errors),
      wealthLevel: numberField(record, "wealthLevel", path, errors),
      savingsPerCapitaRUSD: numberField(record, "savingsPerCapitaRUSD", path, errors),
      militancy: numberField(record, "militancy", path, errors),
      ...(record.incomeRUSDPerCapitaDay === undefined
        ? {}
        : { incomeRUSDPerCapitaDay: numberField(record, "incomeRUSDPerCapitaDay", path, errors) }),
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
      provinceId: numberField(record, "provinceId", path, errors),
      definitionKey: stringField(record, "definitionKey", path, errors),
      level: numberField(record, "level", path, errors),
      ownerProfessionKey: stringField(record, "ownerProfessionKey", path, errors),
      operatingCashRUSD: numberField(record, "operatingCashRUSD", path, errors),
      ...(record.technique === undefined
        ? {}
        : (() => {
            const technique = numberField(record, "technique", path, errors);
            if (!(technique > 0)) errors.push(`${path}.technique must be positive`);
            return { technique };
          })()),
      ...(record.depositId === undefined ? {} : { depositId: numberField(record, "depositId", path, errors) }),
      ...(record.jobMix === undefined
        ? {}
        : {
            jobMix: (Array.isArray(record.jobMix) ? record.jobMix : (errors.push(`${path}.jobMix must be an array`), [])).map((entry: unknown, index: number) => {
              const job = assertRecord(entry, `${path}.jobMix[${String(index)}]`, errors);
              return {
                professionId: numberField(job, "professionId", `${path}.jobMix[${String(index)}]`, errors),
                workersPerThroughputUnit: numberField(job, "workersPerThroughputUnit", `${path}.jobMix[${String(index)}]`, errors),
              };
            }),
          }),
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
      provinceId: numberField(record, "provinceId", path, errors),
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

  const provinceById = new Map<number, HistoricalProvinceInput>();
  const provinceKeys = new Set<string>();
  const provinceOwner = new Map<number, number>();
  const countryProvinceIds = new Map<number, number[]>();
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
    if (country.provinceIds.length === 0) errors.push(`${path}.provinceIds must not be empty`);
    const seenProvinces = new Set<number>();
    for (const provinceId of country.provinceIds) {
      if (!isValidId(provinceId)) errors.push(`${path}.provinceIds contains an invalid province id ${String(provinceId)}`);
      if (seenProvinces.has(provinceId)) errors.push(`${path}.provinceIds duplicates province ${String(provinceId)}`);
      seenProvinces.add(provinceId);
      const existing = provinceOwner.get(provinceId);
      if (existing !== undefined) {
        errors.push(`province ${String(provinceId)} is claimed by countries ${String(existing)} and ${String(country.id)}`);
      }
      provinceOwner.set(provinceId, country.id);
    }
    countryProvinceIds.set(country.id, [...country.provinceIds].sort((left, right) => left - right));
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
    if (country.currency.key === "rusd") {
      errors.push(`${path}.currency.key is reserved for RUSD`);
    }
    if (currencyKeys.has(country.currency.key)) {
      errors.push(`${path}.currency.key ${JSON.stringify(country.currency.key)} is duplicated`);
    }
    currencyKeys.add(country.currency.key);
    const fiscal = country.fiscal;
    if (!(fiscal.incomeTaxRate >= 0 && fiscal.incomeTaxRate <= 1)) {
      errors.push(`${path}.fiscal.incomeTaxRate must be in 0..1`);
    }
    if (!(fiscal.welfareBudgetRUSDPerYear >= 0)) {
      errors.push(`${path}.fiscal.welfareBudgetRUSDPerYear must be non-negative`);
    }
    if (fiscal.welfareBudgetRUSDPerYear > MAX_FISCAL_BUDGET_RUSD_PER_YEAR) {
      errors.push(
        `${path}.fiscal.welfareBudgetRUSDPerYear must not exceed ${String(MAX_FISCAL_BUDGET_RUSD_PER_YEAR)}`,
      );
    }
    if (!(country.initialTreasuryCashRUSD >= 0)) {
      errors.push(`${path}.initialTreasuryCashRUSD must be non-negative`);
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
      if (!(debt.maxOutstandingPrincipalRUSD >= 0)) {
        errors.push(`${path}.debt.maxOutstandingPrincipalRUSD must be non-negative`);
      }
      if (debt.maxOutstandingPrincipalRUSD > MAX_DEBT_PRINCIPAL_RUSD) {
        errors.push(
          `${path}.debt.maxOutstandingPrincipalRUSD must not exceed ${String(MAX_DEBT_PRINCIPAL_RUSD)}`,
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
      const rate = country.currency.valuation.rusdPerUnit;
      if (!(rate > 0)) {
        errors.push(`${path}.currency.valuation.rusdPerUnit must be positive`);
      } else if (rate < CURRENCY_RATE_MIN || rate > CURRENCY_RATE_MAX) {
        errors.push(
          `${path}.currency.valuation.rusdPerUnit must be in ${String(CURRENCY_RATE_MIN)}..${String(CURRENCY_RATE_MAX)}`,
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

  const provinceCountry = new Map<number, number>();
  for (let index = 0; index < data.provinces.length; index += 1) {
    const province = data.provinces[index];
    if (province === undefined) continue;
    const path = `provinces[${String(index)}]`;
    if (!isValidId(province.id)) {
      errors.push(`${path}.id must be an unsigned 32-bit integer`);
    }
    if (provinceById.has(province.id)) errors.push(`${path}.id ${String(province.id)} is duplicated`);
    provinceById.set(province.id, province);
    if (provinceKeys.has(province.key)) errors.push(`${path}.key ${JSON.stringify(province.key)} is duplicated`);
    provinceKeys.add(province.key);
    for (const field of ["arableLandHa", "pastureHa"] as const) {
      const value = province[field];
      if (value !== undefined && !(Number.isFinite(value) && value >= 0)) {
        errors.push(`${path}.${field} must be non-negative`);
      }
    }
    if (province.urbanShare !== undefined && !(province.urbanShare >= 0 && province.urbanShare <= 1)) {
      errors.push(`${path}.urbanShare must be in 0..1`);
    }
    requireSources(province.sourceIds, `${path}.sourceIds`);
    const owner = provinceOwner.get(province.id);
    if (owner === undefined) {
      errors.push(`province ${String(province.id)} has no owning country`);
    } else {
      provinceCountry.set(province.id, owner);
    }
  }
  for (const provinceId of provinceOwner.keys()) {
    if (!provinceById.has(provinceId)) {
      errors.push(`country ownership references unknown province ${String(provinceId)}`);
    }
  }

  const marketById = new Map<number, HistoricalMarketInput>();
  const mapProvinceMarket = new Map<number, number>();
  const marketKeys = new Set<string>();
  const buildingProvinceByKey = new Map(
    data.buildings.map((building) => [building.key, building.provinceId] as const),
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
    if (market.provinceIds.length === 0) errors.push(`${path}.provinceIds must not be empty`);
    if (!(market.initialPriceMultiplier >= 0.25 && market.initialPriceMultiplier <= 4)) {
      errors.push(`${path}.initialPriceMultiplier must be in 0.25..4`);
    }
    const seen = new Set<number>();
    for (const provinceId of market.provinceIds) {
      if (!provinceById.has(provinceId)) {
        errors.push(`${path}.provinceIds references unknown province ${String(provinceId)}`);
      }
      if (!isValidId(provinceId)) {
        errors.push(`${path}.provinceIds contains an invalid province id ${String(provinceId)}`);
      }
      if (seen.has(provinceId)) errors.push(`${path}.provinceIds duplicates province ${String(provinceId)}`);
      seen.add(provinceId);
      const existing = mapProvinceMarket.get(provinceId);
      if (existing !== undefined) {
        errors.push(`province ${String(provinceId)} belongs to markets ${String(existing)} and ${String(market.id)}`);
      }
      mapProvinceMarket.set(provinceId, market.id);
    }
    const lotKeys = new Set<string>();
    for (let lotIndex = 0; lotIndex < market.stockLots.length; lotIndex += 1) {
      const lot = market.stockLots[lotIndex];
      if (lot === undefined) continue;
      const lotPath = `${path}.stockLots[${String(lotIndex)}]`;
      if (keys !== null && !keys.goods.has(lot.goodKey)) {
        errors.push(`${lotPath}.goodKey references unknown good ${JSON.stringify(lot.goodKey)}`);
      }
      const ownerProvinceId = buildingProvinceByKey.get(lot.ownerBuildingKey);
      if (ownerProvinceId === undefined) {
        errors.push(
          `${lotPath}.ownerBuildingKey references unknown building ${JSON.stringify(lot.ownerBuildingKey)}`,
        );
      } else if (!seen.has(ownerProvinceId)) {
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
  for (const province of data.provinces) {
    if (!mapProvinceMarket.has(province.id)) {
      errors.push(`province ${String(province.id)} is not assigned to a market`);
    }
  }
  for (const country of data.countries) {
    let countryMarket: number | undefined;
    for (const provinceId of country.provinceIds) {
      const marketId = mapProvinceMarket.get(provinceId);
      if (marketId === undefined) continue;
      if (countryMarket === undefined) countryMarket = marketId;
      else if (countryMarket !== marketId) {
        errors.push(
          `country ${JSON.stringify(country.tag)} spans markets ${String(countryMarket)} and ${String(marketId)}; a country belongs to one customs territory (D-119)`,
        );
      }
    }
    if (countryMarket === undefined) {
      errors.push(`country ${JSON.stringify(country.tag)} has no province in a market`);
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
    if (!country.provinceIds.some((provinceId) => market.provinceIds.includes(provinceId))) {
      errors.push(
        `${path}.customsCountryTag ${JSON.stringify(tag)} owns no province of the market`,
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
    if (!(route.baseCapacityRUSDPerDay > 0)) {
      errors.push(`${path}.baseCapacityRUSDPerDay must be positive`);
    }
    requireSources(route.sourceIds, `${path}.sourceIds`);
  }

  const populationKeys = new Set<string>();
  const populationByProvince = new Map<number, HistoricalPopulationInput[]>();
  const countryPopulation = new Map<number, number>();
  const countryPeasants = new Map<number, number>();
  for (let index = 0; index < data.populations.length; index += 1) {
    const population = data.populations[index];
    if (population === undefined) continue;
    const path = `populations[${String(index)}]`;
    const province = provinceById.get(population.provinceId);
    if (province === undefined) {
      errors.push(`${path}.provinceId references unknown province ${String(population.provinceId)}`);
      continue;
    }
    const key = `${String(population.provinceId)}:${population.professionKey}`;
    if (populationKeys.has(key)) errors.push(`${path} duplicates province/profession ${key}`);
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
    if (!(population.savingsPerCapitaRUSD >= 0)) {
      errors.push(`${path}.savingsPerCapitaRUSD must be non-negative`);
    }
    if (!Number.isFinite(population.population * population.savingsPerCapitaRUSD)) {
      errors.push(`${path} initial savings overflow to a non-finite value`);
    }
    if (!(population.militancy >= 0 && population.militancy <= 1)) {
      errors.push(`${path}.militancy must be in 0..1`);
    }
    requireSources(population.sourceIds, `${path}.sourceIds`);
    const list = populationByProvince.get(population.provinceId) ?? [];
    list.push(population);
    populationByProvince.set(population.provinceId, list);
    const countryId = provinceCountry.get(population.provinceId);
    if (countryId !== undefined) {
      countryPopulation.set(countryId, (countryPopulation.get(countryId) ?? 0) + population.population);
      if (population.professionKey === "peasants") {
        countryPeasants.set(countryId, (countryPeasants.get(countryId) ?? 0) + population.population);
      }
    }
  }
  // P2: a province may be empty (an uninhabited island); a country may not.
  for (const country of data.countries) {
    if (!((countryPopulation.get(country.id) ?? 0) > 0)) {
      errors.push(`country ${JSON.stringify(country.tag)} has no population block`);
    }
  }

  const buildingKeys = new Set<string>();
  const buildingsByProvince = new Map<number, HistoricalBuildingInput[]>();
  for (let index = 0; index < data.buildings.length; index += 1) {
    const building = data.buildings[index];
    if (building === undefined) continue;
    const path = `buildings[${String(index)}]`;
    if (buildingKeys.has(building.key)) errors.push(`${path}.key ${JSON.stringify(building.key)} is duplicated`);
    buildingKeys.add(building.key);
    if (!provinceById.has(building.provinceId)) {
      errors.push(`${path}.provinceId references unknown province ${String(building.provinceId)}`);
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
    if (!(building.operatingCashRUSD >= 0)) {
      errors.push(`${path}.operatingCashRUSD must be non-negative`);
    }
    const ownerBlock = (populationByProvince.get(building.provinceId) ?? []).find(
      (population) => population.professionKey === building.ownerProfessionKey,
    );
    if (ownerBlock === undefined) {
      errors.push(
        `${path}.ownerProfessionKey ${JSON.stringify(building.ownerProfessionKey)} has no population block in province ${String(building.provinceId)}`,
      );
    }
    const list = buildingsByProvince.get(building.provinceId) ?? [];
    list.push(building);
    buildingsByProvince.set(building.provinceId, list);
  }
  for (const country of data.countries) {
    if (!country.provinceIds.some((provinceId) => (buildingsByProvince.get(provinceId) ?? []).length > 0)) {
      errors.push(`country ${JSON.stringify(country.tag)} has no building`);
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
    const cacheKey = `${String(population.provinceId)}:${population.professionKey}`;
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
    if (!isValidId(entry.provinceId)) {
      errors.push(`${path}.provinceId must be an unsigned 32-bit integer`);
    }
    const building = buildingByKey.get(entry.buildingKey);
    if (building === undefined) {
      errors.push(`${path}.buildingKey references unknown building ${JSON.stringify(entry.buildingKey)}`);
    } else if (building.provinceId !== entry.provinceId) {
      errors.push(`${path}.provinceId does not match the building's province`);
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
    const key = `${String(entry.provinceId)}:${entry.professionKey}:${entry.buildingKey}`;
    const firstIndex = employmentFirstIndex.get(key);
    if (firstIndex !== undefined) {
      errors.push(
        `${path} duplicates employment ${key} first declared at employment[${String(firstIndex)}]`,
      );
    } else {
      employmentFirstIndex.set(key, index);
    }
    const block = (populationByProvince.get(entry.provinceId) ?? []).find(
      (population) => population.professionKey === entry.professionKey,
    );
    if (block === undefined) {
      errors.push(
        `${path} references unknown province/profession ${String(entry.provinceId)}:${entry.professionKey}`,
      );
    } else if (keys !== null && profession !== undefined) {
      const blockKey = `${String(entry.provinceId)}:${entry.professionKey}`;
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
    } else if (data.meta.definitions.labourMarket === undefined) {
      // P7 (D-154): a labour-market world takes its occupation mix from the sourced P7
      // shares (historical/p7), so the M11 authored peasant-share target applies only to
      // the five-profession worlds.
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
      if (market !== undefined) {
        const owners = new Set(market.provinceIds);
        const expected = data.countries
          .filter((country) => country.provinceIds.some((provinceId) => owners.has(provinceId)))
          .map((country) => country.id)
          .sort((left, right) => left - right);
        const declared = [...meta.memberCountryIds].sort((left, right) => left - right);
        if (expected.length !== declared.length || expected.some((id, i) => id !== declared[i])) {
          errors.push(`${path}.memberCountryIds must list exactly the owners of the territory provinces (D-119)`);
        }
      }
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
  if (data.meta.territoryMeta !== undefined) {
    const described = new Set<number>();
    const tags = new Set<string>();
    for (let index = 0; index < data.meta.territoryMeta.length; index += 1) {
      const meta = data.meta.territoryMeta[index];
      if (meta === undefined) continue;
      const path = `meta.territoryMeta[${String(index)}]`;
      if (tags.has(meta.polityTag)) errors.push(`${path}.polityTag ${meta.polityTag} is described twice`);
      tags.add(meta.polityTag);
      if (meta.provinceIds.length === 0) errors.push(`${path}.provinceIds must not be empty`);
      const sovereign = countryById.get(meta.sovereignCountryId);
      if (sovereign === undefined) {
        errors.push(`${path}.sovereignCountryId references unknown country`);
      }
      const owned = new Set(sovereign?.provinceIds ?? []);
      for (const provinceId of meta.provinceIds) {
        if (!provinceById.has(provinceId)) {
          errors.push(`${path}.provinceIds references unknown province ${String(provinceId)}`);
        }
        if (described.has(provinceId)) {
          errors.push(`${path}.provinceIds lists province ${String(provinceId)}, already in another territory`);
        }
        described.add(provinceId);
        if (sovereign !== undefined && !owned.has(provinceId)) {
          errors.push(`${path}.provinceIds ${String(provinceId)} is not owned by its declared sovereign country`);
        }
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
/** First currency id of foreign-issued currencies; country-issued currencies keep the country id. */
export const FOREIGN_CURRENCY_ID_BASE = 1000;

interface ScenarioCurrencies {
  readonly currencies: Currency[];
  readonly currencyValuations: CurrencyValuation[];
  readonly arrangementByCountry: ReadonlyMap<number, MonetaryArrangement>;
}

/** Pre-P3 path: one own currency per country from the country file's currency block. */
function countryBlockCurrencies(data: HistoricalData): ScenarioCurrencies {
  const sorted = data.countries.slice().sort((left, right) => left.id - right.id);
  return {
    currencies: sorted.map((country) => ({
      id: country.id,
      key: country.currency.key,
      name: country.currency.name,
      issuer: { kind: "country" as const, countryId: country.id },
    })),
    currencyValuations: sorted.map((country) =>
      country.currency.valuation.status === "specified"
        ? {
            currencyId: country.id,
            status: "specified" as const,
            rusdPerUnit: asRusdPerCurrencyUnit(country.currency.valuation.rusdPerUnit),
            setOnDay: data.meta.startDayIndex,
            source: "scenario" as const,
          }
        : { currencyId: country.id, status: "unavailable" as const },
    ),
    arrangementByCountry: new Map(),
  };
}

/**
 * P3 path (D-141): currencies, arrangements and opening valuations from the derived
 * currency table. A country's own currency keeps the country id; foreign-issued
 * currencies take ids from `FOREIGN_CURRENCY_ID_BASE` in table order.
 */
function tableCurrencies(data: HistoricalData, table: CurrencyTable1900): ScenarioCurrencies {
  const countryByTag = new Map(data.countries.map((country) => [country.tag, country]));
  const idByKey = new Map<string, number>();
  const currencies: Currency[] = [];
  const valuations: CurrencyValuation[] = [];
  let foreignIndex = 0;
  for (const parity of table.currencies) {
    let id: number;
    let issuer: Currency["issuer"];
    if (parity.issuerTag !== null) {
      const country = countryByTag.get(parity.issuerTag);
      if (country === undefined) {
        throw new HistoricalDataError([`currency ${parity.key} names unknown issuer ${parity.issuerTag}`]);
      }
      id = country.id;
      issuer = { kind: "country", countryId: country.id };
    } else {
      id = FOREIGN_CURRENCY_ID_BASE + foreignIndex;
      foreignIndex += 1;
      issuer = { kind: "foreign", issuerKey: parity.foreignIssuerKey ?? parity.key };
    }
    idByKey.set(parity.key, id);
    currencies.push({ id, key: parity.key, name: parity.name, issuer });
    valuations.push({
      currencyId: id,
      status: "specified",
      rusdPerUnit: asRusdPerCurrencyUnit(parity.rusdPerUnit),
      setOnDay: data.meta.startDayIndex,
      source: "scenario",
    });
  }
  const arrangementByCountry = new Map<number, MonetaryArrangement>();
  for (const arrangement of table.arrangements) {
    const country = countryByTag.get(arrangement.tag);
    const currencyId = idByKey.get(arrangement.currencyKey);
    if (country === undefined || currencyId === undefined) {
      throw new HistoricalDataError([`arrangement for ${arrangement.tag} could not be resolved`]);
    }
    arrangementByCountry.set(country.id, { kind: arrangement.kind, currencyId });
  }
  currencies.sort((left, right) => left.id - right.id);
  valuations.sort((left, right) => left.currencyId - right.currencyId);
  return { currencies, currencyValuations: valuations, arrangementByCountry };
}

/** D-155: every economy world runs the labour market; a scenario must name its configuration. */
function requiredLabourMarketFile(file: string | undefined): string {
  if (file === undefined) {
    throw new HistoricalDataError(["meta.definitions.labourMarket is required: every economy world runs the labour market (D-155)"]);
  }
  return file;
}

export function buildM5HistoricalScenario(data: HistoricalData): EconomyScenarioDef {
  assertValidM5HistoricalData(data);
  const goods = readJson<GoodDef[]>(data.meta.definitions.goods);
  const professions = readJson<ProfessionDef[]>(data.meta.definitions.professions);
  const buildings = readJson<BuildingDef[]>(data.meta.definitions.buildings);
  const needs = readJson<NeedTierDef[]>(data.meta.definitions.needs);
  const demography = readJson<{
    standardSchedule: PopulationDefinitions["standardSchedule"];
    foodEnergy: PopulationDefinitions["foodEnergy"];
    sexRatioAtBirth: number;
    fertilityMultipliers: PopulationDefinitions["fertilityMultipliers"];
  }>(data.meta.definitions.demography);
  const politics = readJson<PoliticsDefinitions>(data.meta.definitions.politics ?? "politics.json");
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
    // P7 (D-154): the labour-market configuration (required since D-155).
    labourMarket: readJson<LabourMarketDefinitions>(requiredLabourMarketFile(data.meta.definitions.labourMarket)),
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
    standardSchedule: demography.standardSchedule,
    foodEnergy: demography.foodEnergy,
    sexRatioAtBirth: demography.sexRatioAtBirth,
    fertilityMultipliers: demography.fertilityMultipliers.filter((entry) =>
      professions.some((profession) => profession.id === entry.professionId),
    ),
    // P6 (D-153): the demand system replaces the tiers for household demand.
    ...(data.meta.definitions.demandSystem === undefined
      ? {}
      : { demandSystem: readJson<DemandSystemDef>(data.meta.definitions.demandSystem) }),
  };
  assertValidPopulationDefinitions(populationDefinitions);

  const sortedPopulations = [...data.populations].sort((left, right) => {
    if (left.provinceId !== right.provinceId) return left.provinceId - right.provinceId;
    return left.professionKey < right.professionKey
      ? -1
      : left.professionKey > right.professionKey
        ? 1
        : 0;
  });
  const demographyByProvince =
    data.demography1900 === undefined
      ? undefined
      : new Map(data.demography1900.provinces.map((row) => [row.provinceId, row]));
  const urbanByBlock =
    data.demography1900 === undefined
      ? undefined
      : new Map(
          data.demography1900.blocks.map((row) => [`${String(row.provinceId)}:${row.professionKey}`, row.urbanShare]),
        );
  const blockIdByKey = new Map<string, number>();
  const accountIdByKey = new Map<string, number>();
  const popBlocks = sortedPopulations.map((population, index) => {
    const profession = professionByKey.get(population.professionKey);
    if (profession === undefined) {
      throw new HistoricalDataError([
        `population ${String(population.provinceId)}:${population.professionKey} references an unknown profession`,
      ]);
    }
    const householdAccountId = HISTORICAL_HOUSEHOLD_ACCOUNT_BASE + index;
    const key = `${String(population.provinceId)}:${population.professionKey}`;
    blockIdByKey.set(key, index);
    accountIdByKey.set(key, householdAccountId);
    // P4 (D-142): the province's stable 1900 age structure and sourced levels.
    const provinceDemography = demographyByProvince?.get(population.provinceId);
    if (demographyByProvince !== undefined && provinceDemography === undefined) {
      throw new HistoricalDataError([`population ${key} has no 1900 demography for its province`]);
    }
    const ages = expandHistoricalPopulation(
      population.population,
      provinceDemography === undefined
        ? profile
        : {
            ...profile,
            maleCounts: provinceDemography.maleAgeWeights,
            femaleCounts: provinceDemography.femaleAgeWeights,
          },
      `population ${key}`,
    );
    const urbanShare = urbanByBlock?.get(key);
    if (urbanByBlock !== undefined && urbanShare === undefined) {
      throw new HistoricalDataError([`population ${key} has no 1900 urban share`]);
    }
    return {
      id: index,
      provinceId: population.provinceId,
      professionId: profession.id,
      financialAccountId: householdAccountId,
      maleAgeGroups: ages.maleAgeGroups,
      femaleAgeGroups: ages.femaleAgeGroups,
      literacy: population.literacy,
      wealthLevel: population.wealthLevel,
      initialSavingsRUSD: population.population * population.savingsPerCapitaRUSD,
      militancy: population.militancy,
      ...(population.incomeRUSDPerCapitaDay === undefined ? {} : { incomeRUSDPerCapitaDay: population.incomeRUSDPerCapitaDay }),
      ...(provinceDemography === undefined
        ? data.meta.worldDemography === undefined
          ? {}
          : { demography: { ...data.meta.worldDemography } }
        : {
            demography: {
              urbanShare: urbanShare ?? 0,
              fertilityLevel: provinceDemography.fertilityLevel,
              childMortalityLevel: provinceDemography.childMortalityLevel,
              adultMortalityLevel: provinceDemography.adultMortalityLevel,
            },
          }),
    };
  });

  const provinceEconomies: ProvinceEconomyInitialDef[] = [...data.provinces]
    .sort((left, right) => left.id - right.id)
    .map((province) => ({
      id: province.id,
      key: province.key,
      name: province.name,
      ...(province.infrastructure === undefined
        ? {}
        : { infrastructure: province.infrastructure }),
      ...(province.arableLandHa === undefined ? {} : { arableLandHa: province.arableLandHa }),
      ...(province.pastureHa === undefined ? {} : { pastureHa: province.pastureHa }),
      ...(province.urbanShare === undefined ? {} : { urbanShare: province.urbanShare }),
      ...(province.absLatitudeDeg === undefined ? {} : { absLatitudeDeg: province.absLatitudeDeg }),
      ...(province.hydroPotentialMWhPerYear === undefined
        ? {}
        : { hydroPotentialMWhPerYear: province.hydroPotentialMWhPerYear }),
      ...(province.housingReferencePersonsPerDwelling === undefined
        ? {}
        : { housingReferencePersonsPerDwelling: province.housingReferencePersonsPerDwelling }),
      ...(province.wageRUSDPerYearByProfession === undefined
        ? {}
        : {
            wageRUSDPerYearByProfession: professions.map((profession) => {
              const wage = province.wageRUSDPerYearByProfession?.[profession.key];
              if (wage === undefined) {
                throw new HistoricalDataError([
                  `province ${province.key} has no wage for profession ${profession.key}`,
                ]);
              }
              return wage;
            }),
          }),
    }));

  const sortedMarkets = [...data.markets].sort((left, right) => left.id - right.id);
  const sortedBuildings = [...data.buildings].sort((left, right) => {
    if (left.provinceId !== right.provinceId) return left.provinceId - right.provinceId;
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
      const ownerKey = `${String(building.provinceId)}:${building.ownerProfessionKey}`;
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
        provinceId: building.provinceId,
        level: building.level,
        condition: 1,
        ownerKind: "private",
        ownerAccountId,
        builtOnDay: data.meta.startDayIndex,
        operational: true,
        operatingCashAccountId: HISTORICAL_BUILDING_ACCOUNT_BASE + index,
        initialOperatingCashRUSD: building.operatingCashRUSD,
        ...(building.technique === undefined ? {} : { technique: building.technique }),
        ...(building.depositId === undefined ? {} : { depositId: building.depositId }),
        ...(building.jobMix === undefined ? {} : { jobMix: building.jobMix.map((job) => ({ professionId: job.professionId, workersPerThroughputUnit: job.workersPerThroughputUnit })) }),
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
      const popBlockId = blockIdByKey.get(`${String(entry.provinceId)}:${entry.professionKey}`);
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
      provinceIds: [...market.provinceIds].sort((left, right) => left - right),
      // D-149: monetary gold and silver open at their reference price everywhere.
      priceRUSD: goods.map((good) => good.basePrice1900RUSD * (good.internationalPrice === true ? 1 : market.initialPriceMultiplier)),
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
      baseCapacityRUSDPerDay: route.baseCapacityRUSDPerDay,
    };
  });

  const { currencies, currencyValuations, arrangementByCountry } =
    data.currencyTable === undefined
      ? countryBlockCurrencies(data)
      : tableCurrencies(data, data.currencyTable);

  const countries: CountryInitialDef[] = data.countries
    .slice()
    .sort((left, right) => left.id - right.id)
    .map((country) => ({
      id: country.id,
      tag: country.tag,
      name: country.name,
      monetary: arrangementByCountry.get(country.id) ?? { kind: "own", currencyId: country.id },
      provinceIds: [...country.provinceIds].sort((left, right) => left - right),
      treasuryAccountId: HISTORICAL_TREASURY_ACCOUNT_BASE + country.id,
      initialTreasuryCashRUSD: country.initialTreasuryCashRUSD,
      fiscal: { ...country.fiscal },
      ...(country.debt === undefined ? {} : { debt: { ...country.debt } }),
      ...(country.politics === undefined ? {} : { politics: { ...country.politics } }),
      ...(country.technology === undefined ? {} : { technology: { ...country.technology } }),
      ...(country.labor === undefined ? {} : { labor: { ...country.labor } }),
      immigrationOpen: country.immigrationOpen,
    }));

  const systemAccounts: SystemAccountInitialDef[] = [
    {
      id: HISTORICAL_SYSTEM_ACCOUNT_ID,
      accountKind: "system-reserve",
      balanceRUSD: 0,
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
    provinceEconomies,
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
    // D-149: with a monetary file, the 1900 metal-standard authorities are active.
    monetary:
      data.meta.files.monetary === undefined || data.currencyTable === undefined
        ? {}
        : { currencies: readMetalAuthorities(data.meta.files.monetary, data, data.currencyTable) },
    // M10: the sample enables the military system with no initial armies, wars, or
    // occupations, so the player can recruit, declare war, and negotiate (D-081).
    military: {},
    ...(data.meta.countryMeta === undefined ? {} : { countryMeta: [...data.meta.countryMeta] }),
    ...(data.meta.marketMeta === undefined ? {} : { marketMeta: [...data.meta.marketMeta] }),
    ...(data.meta.territoryMeta === undefined ? {} : { territoryMeta: [...data.meta.territoryMeta] }),
    ...(data.meta.moneyCoefficients === undefined
      ? {}
      : { moneyCoefficients: { ...data.meta.moneyCoefficients } }),
    ...(data.meta.files.deposits === undefined
      ? {}
      : { deposits: readDeposits(data.meta.files.deposits, economyDefinitions) }),
  };
}

/**
 * P5 (D-143 §4): the scenario's deposits. Each row's `requiredTechnologyKey` resolves to
 * a technology id; the simulation validates provinces, stocks, quality and uniqueness.
 */
/**
 * D-149: the 1900 metal-standard authorities. Each row gives a country's sourced money
 * stock on 1 January 1901 in US dollars (Director of the Mint) and its capped treasury
 * funding in RUSD; the P3 currency table gives the standard, the fine content, the
 * metal's dollar value per gram and the unit's circulating dollar value:
 *   metal reserve [kg] = the standard metal's stock [USD] / (USD per fine g × 1000);
 *   circulation [units] = (gold + silver + uncovered paper) [USD] / USD per unit.
 */
function readMetalAuthorities(file: string, data: HistoricalData, table: CurrencyTable1900): MonetaryCurrencyInput[] {
  const raw = readJson<unknown>(file);
  const errors: string[] = [];
  const root = assertRecord(raw, file, errors);
  const rows = Array.isArray(root.authorities) ? root.authorities : [];
  if (!Array.isArray(root.authorities)) errors.push(`${file}.authorities must be an array`);
  const countryByTag = new Map(data.countries.map((country) => [country.tag, country]));
  const inputs: MonetaryCurrencyInput[] = [];
  rows.forEach((value: unknown, index: number) => {
    const path = `${file}.authorities[${String(index)}]`;
    const row = assertRecord(value, path, errors);
    const tag = typeof row.countryTag === "string" ? row.countryTag : "";
    const country = countryByTag.get(tag);
    const parity = table.currencies.find((currency) => currency.issuerTag === tag);
    const arrangement = table.arrangements.find((entry) => entry.tag === tag);
    if (country === undefined || parity === undefined || arrangement?.kind !== "own") {
      errors.push(`${path}.countryTag ${JSON.stringify(tag)} is not a country with its own currency`);
      return;
    }
    if (parity.standard === "paper") {
      errors.push(`${path}: ${tag} has a paper currency; only metal standards are activated`);
      return;
    }
    const usd = (field: string): number => {
      const v = row[field];
      if (typeof v !== "number" || !Number.isFinite(v) || v < 0) {
        errors.push(`${path}.${field} must be a finite non-negative number`);
        return 0;
      }
      return v;
    };
    const gold = usd("goldUSD");
    const silver = usd("silverUSD");
    const paper = usd("uncoveredPaperUSD");
    const funding = usd("reserveFundingRUSD");
    const metalUsd = parity.standard === "gold" ? gold : silver;
    inputs.push({
      currencyId: country.id,
      standard: parity.standard,
      fineGramsPerUnit: parity.fineGramsPerUnit,
      metalReserveKg: metalUsd / (table.metalUsdPerFineGram[parity.standard] * 1000),
      currencyIssuedUnits: (gold + silver + paper) / parity.circulatingUsdPerUnit,
      reserveFundingRUSD: funding,
    });
  });
  if (errors.length > 0) throw new HistoricalDataError(errors);
  return inputs.sort((left, right) => left.currencyId - right.currencyId);
}

function readDeposits(file: string, definitions: EconomyDefinitions): DepositInitialDef[] {
  const rows = readJson<unknown>(file);
  if (!Array.isArray(rows)) throw new HistoricalDataError([`${file} must be a JSON array`]);
  const technologyByKey = new Map((definitions.technology?.technologies ?? []).map((entry) => [entry.key, entry.id]));
  const errors: string[] = [];
  const deposits: DepositInitialDef[] = [];
  rows.forEach((value, index) => {
    const path = `${file}[${String(index)}]`;
    const row = assertRecord(value, path, errors);
    const key = row.requiredTechnologyKey;
    let requiredTechnologyId: number | null = null;
    if (key !== null) {
      const id = typeof key === "string" ? technologyByKey.get(key) : undefined;
      if (id === undefined) {
        errors.push(`${path}.requiredTechnologyKey ${JSON.stringify(key)} is not a technology`);
        return;
      }
      requiredTechnologyId = id;
    }
    deposits.push({
      id: row.id as number,
      provinceId: row.provinceId as number,
      resource: row.resource as DepositInitialDef["resource"],
      quality: row.quality as number,
      initialStock: row.initialStock as number,
      discovered: row.discovered as boolean,
      requiredTechnologyId,
    });
  });
  if (errors.length > 0) throw new HistoricalDataError(errors.sort());
  return deposits;
}

/** Load and build the M11 1900 world used by the playable game. */
export function loadM11World(): EconomyScenarioDef {
  const data = loadHistoricalData(WORLD_SCENARIO_FILE);
  const scenario = buildM5HistoricalScenario(data);
  // M12a: attach the permanent European province definitions and the future
  // successor-polity registry. Geometry is app-side static content.
  return { ...scenario, provinces: loadM11Provinces() };
}
