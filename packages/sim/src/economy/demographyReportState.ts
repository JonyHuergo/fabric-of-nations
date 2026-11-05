/**
 * P4 (D-142): state of the per-country annual demographic record — types, the empty
 * record, copy, validation and save codec. Kept free of simulation imports so the
 * world, population and save modules can depend on it without a cycle.
 */

import { requireArray, requireFiniteNumber, requireInteger, requireRecord } from "../validation.js";
import type { Id } from "../types.js";
import type { World } from "../world.js";

/** Running totals of one country in the current civil year. */
export interface CountryDemographyRunning {
  countryId: Id;
  /** People on the country's provinces when the year (or the record) started. */
  populationStart: number;
  births: number;
  deaths: number;
  /** Days of the year accumulated so far. */
  days: number;
}

/** One closed civil year of one country. */
export interface CountryDemographyYear {
  readonly countryId: Id;
  readonly year: number;
  readonly populationStart: number;
  readonly births: number;
  readonly deaths: number;
  readonly populationEnd: number;
  /** Days covered (a record started mid-year covers fewer than the year's days). */
  readonly days: number;
  readonly totalFertility: number;
  readonly lifeExpectancy: number;
  readonly under5MortalityPer1000: number;
  readonly urbanShare: number;
}

export interface DemographyReportState {
  /** Civil year of `current`; null before the first accumulated day. */
  currentYear: number | null;
  current: CountryDemographyRunning[];
  years: CountryDemographyYear[];
}

export function emptyDemographyReport(): DemographyReportState {
  return { currentYear: null, current: [], years: [] };
}

export function cloneDemographyReport(source: DemographyReportState): DemographyReportState {
  return {
    currentYear: source.currentYear,
    current: source.current.map((entry) => ({ ...entry })),
    years: source.years.map((entry) => ({ ...entry })),
  };
}

function count(value: unknown, path: string): number {
  return requireInteger(value, path, 0, Number.MAX_SAFE_INTEGER);
}

function finiteNonNegative(value: unknown, path: string): number {
  const number = requireFiniteNumber(value, path);
  if (number < 0) throw new RangeError(`${path} must be non-negative`);
  return number;
}

/** Validate (and, from a save, decode) the report. */
export function decodeDemographyReport(value: unknown, path: string): DemographyReportState {
  const record = requireRecord(value, path);
  const currentYear =
    record.currentYear === null ? null : requireInteger(record.currentYear, `${path}.currentYear`, 1, 9999);
  const current = requireArray(record.current, `${path}.current`).map((raw, index) => {
    const item = requireRecord(raw, `${path}.current[${String(index)}]`);
    const at = `${path}.current[${String(index)}]`;
    return {
      countryId: count(item.countryId, `${at}.countryId`),
      populationStart: count(item.populationStart, `${at}.populationStart`),
      births: count(item.births, `${at}.births`),
      deaths: count(item.deaths, `${at}.deaths`),
      days: requireInteger(item.days, `${at}.days`, 0, 366),
    };
  });
  for (let index = 1; index < current.length; index += 1) {
    if ((current[index] as CountryDemographyRunning).countryId <= (current[index - 1] as CountryDemographyRunning).countryId) {
      throw new RangeError(`${path}.current must be in strictly ascending country order`);
    }
  }
  if (currentYear === null && current.length > 0) {
    throw new RangeError(`${path}.current must be empty when no year is open`);
  }
  const years = requireArray(record.years, `${path}.years`).map((raw, index) => {
    const item = requireRecord(raw, `${path}.years[${String(index)}]`);
    const at = `${path}.years[${String(index)}]`;
    return {
      countryId: count(item.countryId, `${at}.countryId`),
      year: requireInteger(item.year, `${at}.year`, 1, 9999),
      populationStart: count(item.populationStart, `${at}.populationStart`),
      births: count(item.births, `${at}.births`),
      deaths: count(item.deaths, `${at}.deaths`),
      populationEnd: count(item.populationEnd, `${at}.populationEnd`),
      days: requireInteger(item.days, `${at}.days`, 0, 366),
      totalFertility: finiteNonNegative(item.totalFertility, `${at}.totalFertility`),
      lifeExpectancy: finiteNonNegative(item.lifeExpectancy, `${at}.lifeExpectancy`),
      under5MortalityPer1000: finiteNonNegative(item.under5MortalityPer1000, `${at}.under5MortalityPer1000`),
      urbanShare: finiteNonNegative(item.urbanShare, `${at}.urbanShare`),
    };
  });
  return { currentYear, current, years };
}

export function assertValidDemographyReport(world: World): void {
  decodeDemographyReport(world.demography, "world.demography");
}

export function encodeDemographyReport(report: DemographyReportState): DemographyReportState {
  return cloneDemographyReport(report);
}
