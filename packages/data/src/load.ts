/**
 * Reference-table loaders of the data package.
 *
 * JSON files are the canonical static definitions; this module reads the WPP reference
 * tables the 1900 world's demography definitions and the P4 validation use. D-155: the
 * M2 multi-block and WPP-1950 scenarios and the M3 small economy moved to the tests
 * (`packages/tests/src/fixtures/smallWorlds.ts`) with their loaders; the M2
 * population-target series was removed. The M2 world aggregate stays: the 1900 world
 * cites it as the source of its provisional age structure, and the M1/M2 benchmark runs
 * it. The module performs no simulation behaviour and holds no mutable simulation state.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertValidPopulationDefinitions,
  type NeedTierDef,
  type PopulationDefinitions,
  type PopulationScenarioDef,
} from "@century/sim";

import { DATA_PACKAGE_VERSION } from "./version.js";

const DATA_ROOT = fileURLToPath(new URL("../data/", import.meta.url));

interface RawPopulationScenario {
  scenarioId: string;
  dataVersion: string;
  startDayIndex?: number;
  professions: PopulationScenarioDef["professions"];
  provinces: PopulationScenarioDef["provinceEconomies"];
  popBlocks: PopulationScenarioDef["popBlocks"];
  needsFile: string;
  demographyFile: string;
}

interface RawDemography {
  standardSchedule: PopulationDefinitions["standardSchedule"];
  foodEnergy: PopulationDefinitions["foodEnergy"];
  sexRatioAtBirth: number;
  fertilityMultipliers: PopulationDefinitions["fertilityMultipliers"];
}

export interface WppAgeSexYear {
  maleAgeGroups: number[];
  femaleAgeGroups: number[];
  maleMortalityPer1000: number[];
  femaleMortalityPer1000: number[];
  asfrPer1000Women: number[];
  tfrFromAsfr: number;
}

export interface WppAgeSexReference {
  source: {
    sourceName: string;
    sourceUrl: string;
    accessDate: string;
    definition: string;
    units: Record<string, string>;
    yearConvention: string;
    license: string;
    limitations: string;
    files: Record<string, string>;
  };
  years: Record<string, WppAgeSexYear>;
}

/** Load a JSON file relative to the data root. */
function readJson<T>(relativePath: string): T {
  const text = readFileSync(join(DATA_ROOT, relativePath), "utf8");
  return JSON.parse(text) as T;
}

/** Load the single-province world-aggregate population scenario (M2). */
export function loadM2WorldAggregate(): PopulationScenarioDef {
  const raw = readJson<RawPopulationScenario>("scenarios/m2_world_aggregate.json");
  if (raw.dataVersion !== DATA_PACKAGE_VERSION) {
    throw new Error(
      `scenario dataVersion ${JSON.stringify(raw.dataVersion)} does not match data package version ${JSON.stringify(DATA_PACKAGE_VERSION)}`,
    );
  }
  const needs = readJson<NeedTierDef[]>(raw.needsFile);
  const demography = readJson<RawDemography>(raw.demographyFile);
  const professionIds = new Set(raw.professions.map((profession) => profession.id));
  const definitions: PopulationDefinitions = {
    dataVersion: raw.dataVersion,
    scenarioId: raw.scenarioId,
    needs,
    standardSchedule: demography.standardSchedule,
    foodEnergy: demography.foodEnergy,
    sexRatioAtBirth: demography.sexRatioAtBirth,
    fertilityMultipliers: demography.fertilityMultipliers.filter((entry) => professionIds.has(entry.professionId)),
  };
  assertValidPopulationDefinitions(definitions);
  return {
    dataVersion: raw.dataVersion,
    scenarioId: raw.scenarioId,
    ...(raw.startDayIndex === undefined ? {} : { startDayIndex: raw.startDayIndex }),
    professions: raw.professions,
    provinceEconomies: raw.provinces,
    popBlocks: raw.popBlocks,
    definitions,
  };
}

/** Load the source-backed WPP age/sex and demographic reference years. */
export function loadM2WppAgeSexReference(): WppAgeSexReference {
  const reference = readJson<WppAgeSexReference>("calibration/wpp_age_sex_reference.json");
  if (reference.years === undefined || typeof reference.years !== "object") {
    throw new Error("WPP age/sex reference must contain years");
  }
  for (const [year, values] of Object.entries(reference.years)) {
    if (!/^\d{4}$/.test(year)) throw new Error(`invalid WPP reference year ${year}`);
    for (const key of [
      "maleAgeGroups",
      "femaleAgeGroups",
      "maleMortalityPer1000",
      "femaleMortalityPer1000",
      "asfrPer1000Women",
    ] as const) {
      if (!Array.isArray(values[key])) {
        throw new Error(`WPP reference ${year}.${key} must be an array`);
      }
    }
  }
  return reference;
}

/** One year of the WPP 2024 world schedules (validation only, D-142). */
export interface WppWorldScheduleYear {
  readonly maleAnnualDeathsPer1000ByAgeBand: readonly number[];
  readonly femaleAnnualDeathsPer1000ByAgeBand: readonly number[];
  readonly ageSpecificBirthsPer1000Women: readonly number[];
}

/**
 * P4 (D-124, D-142): WPP 2024 annual world schedules 1950–2000. Validation only —
 * simulation code never reads them; tests feed them to the engine to check that it
 * reproduces WPP's age structure when given WPP's own rates.
 */
export function loadWppWorldSchedules(): Readonly<Record<string, WppWorldScheduleYear>> {
  const file = readJson<{ years: Record<string, WppWorldScheduleYear> }>(
    "validation/wpp_world_schedules_1950_2000.json",
  );
  for (const [year, schedule] of Object.entries(file.years)) {
    if (
      schedule.maleAnnualDeathsPer1000ByAgeBand.length !== 17 ||
      schedule.femaleAnnualDeathsPer1000ByAgeBand.length !== 17 ||
      schedule.ageSpecificBirthsPer1000Women.length !== 7
    ) {
      throw new Error(`WPP world schedule ${year} has the wrong band counts`);
    }
  }
  return file.years;
}
