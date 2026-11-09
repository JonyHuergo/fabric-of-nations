/**
 * E5 labour and health law lookups (a leaf module: no simulation imports beyond types
 * and constants), shared by the E5 labour services and the P7 labour market.
 */

import type { MoneyRUSD, Rate } from "../types.js";
import {
  LABOR_HOURS_CAPACITY_MIN,
  LABOR_MIN_HOURS_PER_WEEK,
  LABOR_STANDARD_HOURS_PER_WEEK,
  MAX_LABOR_HOURS_PER_WEEK,
  MAX_LABOR_MINIMUM_WAGE_RUSD_PER_YEAR,
} from "./constants.js";
import type { Country, EconomyDefinitions, LawDef } from "./types.js";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** The law a country has enacted in a slot, or null (id 0 or no politics content). */
export function lawInSlot(country: Country, definitions: EconomyDefinitions | undefined, slot: "labor" | "health"): LawDef | null {
  const politics = definitions?.politics;
  if (politics === undefined) return null;
  const id = country.laws[slot];
  if (id === 0) return null;
  const law = politics.laws.find((entry) => entry.id === id);
  if (law === undefined) throw new RangeError(`unknown law ${String(id)}`);
  return law;
}

/** Statutory minimum-wage floor for a country, or 0 when none applies. */
export function laborMinimumWageRUSDPerYear(
  country: Country,
  definitions: EconomyDefinitions | undefined,
): MoneyRUSD {
  const law = lawInSlot(country, definitions, "labor");
  if (law === null) return 0;
  return clamp(law.laborMinimumWageRUSDPerYear, 0, MAX_LABOR_MINIMUM_WAGE_RUSD_PER_YEAR);
}

/**
 * Effective hours factor for capacity and wages. The provisional 60-hour week is
 * the baseline; a statutory shorter week scales both proportionally.
 */
export function laborHoursFactor(
  country: Country,
  definitions: EconomyDefinitions | undefined,
): Rate {
  const law = lawInSlot(country, definitions, "labor");
  if (law === null || !(law.laborHoursPerWeek > 0)) return 1;
  const hours = clamp(
    law.laborHoursPerWeek,
    LABOR_MIN_HOURS_PER_WEEK,
    MAX_LABOR_HOURS_PER_WEEK,
  );
  return clamp(hours / LABOR_STANDARD_HOURS_PER_WEEK, LABOR_HOURS_CAPACITY_MIN, 1);
}

/** Enacted health-law minimum staff share, or 0. */
export function healthStaffFloor(
  country: Country,
  definitions: EconomyDefinitions | undefined,
): Rate {
  const law = lawInSlot(country, definitions, "health");
  if (law === null) return 0;
  return clamp(law.healthStaffFloor, 0, 1);
}
