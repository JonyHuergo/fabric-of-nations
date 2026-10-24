/**
 * M2 JSON data loader.
 *
 * JSON files are the canonical static definitions. This loader reads them from
 * `packages/data/data`, validates the definitions through the simulation
 * contracts, and returns explicit scenario objects. It performs no simulation
 * behavior and holds no mutable simulation state.
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

interface RawScenario {
  scenarioId: string;
  dataVersion: string;
  status: string;
  description: string;
  professions: PopulationScenarioDef["professions"];
  regions: PopulationScenarioDef["regions"];
  popBlocks: PopulationScenarioDef["popBlocks"];
  needsFile: string;
  demographyFile: string;
  notes: string;
}

interface RawDemography {
  mortalityAnchors: PopulationDefinitions["mortalityAnchors"];
  fertilityAnchors: PopulationDefinitions["fertilityAnchors"];
  fertilityMultipliers: PopulationDefinitions["fertilityMultipliers"];
  provenance: unknown;
}

export interface PopulationCalibrationPoint {
  year: number;
  value: number;
}

export interface PopulationCalibrationSeries {
  metric: string;
  geography: string;
  definition: string;
  units: string;
  status: string;
  confidence: string;
  yearConvention: string;
  license: string;
  method: string;
  sourceName: string;
  sourceUrl: string;
  accessDate: string;
  notes: string;
  points: PopulationCalibrationPoint[];
}

/** Load a JSON file relative to the data root. */
function readJson<T>(relativePath: string): T {
  const text = readFileSync(join(DATA_ROOT, relativePath), "utf8");
  return JSON.parse(text) as T;
}

function loadScenario(scenarioFile: string): PopulationScenarioDef {
  const raw = readJson<RawScenario>(`scenarios/${scenarioFile}`);
  const needs = readJson<NeedTierDef[]>(raw.needsFile);
  const demography = readJson<RawDemography>(raw.demographyFile);
  if (raw.dataVersion !== DATA_PACKAGE_VERSION) {
    throw new Error(
      `scenario dataVersion ${JSON.stringify(raw.dataVersion)} does not match data package version ${JSON.stringify(DATA_PACKAGE_VERSION)}`,
    );
  }
  const professionIds = new Set(raw.professions.map((profession) => profession.id));
  const definitions: PopulationDefinitions = {
    dataVersion: raw.dataVersion,
    scenarioId: raw.scenarioId,
    needs,
    mortalityAnchors: demography.mortalityAnchors,
    fertilityAnchors: demography.fertilityAnchors,
    fertilityMultipliers: demography.fertilityMultipliers.filter((entry) =>
      professionIds.has(entry.professionId),
    ),
  };
  assertValidPopulationDefinitions(definitions);
  return {
    dataVersion: raw.dataVersion,
    scenarioId: raw.scenarioId,
    professions: raw.professions,
    regions: raw.regions,
    popBlocks: raw.popBlocks,
    definitions,
  };
}

/** Load the single-region world-aggregate calibration scenario. */
export function loadM2WorldAggregate(): PopulationScenarioDef {
  return loadScenario("m2_world_aggregate.json");
}

/** Load the synthetic multi-block fixture. */
export function loadM2MultiBlock(): PopulationScenarioDef {
  return loadScenario("m2_multi_block.json");
}

/** Load the provisional population calibration targets. */
export function loadM2PopulationCalibration(): PopulationCalibrationSeries {
  const series = readJson<PopulationCalibrationSeries>("calibration/m2_population_targets.json");
  if (!Array.isArray(series.points) || series.points.length === 0) {
    throw new Error("population calibration series must contain points");
  }
  for (const point of series.points) {
    if (!Number.isInteger(point.year) || !Number.isFinite(point.value) || point.value <= 0) {
      throw new Error(`invalid calibration point for year ${String(point.year)}`);
    }
  }
  return series;
}
