/**
 * D-155: the small worlds the unit suites run on, loaded by the tests themselves.
 *
 * The data package now loads only the 1900 world (and the reference tables it and its
 * generators read). The small scenarios that predate it are unit scaffolding (designer's
 * instruction of 2026-11-11):
 *
 * - the M2 population scenarios (`m2_multi_block`, `m2_wpp_1950_validation`, here under
 *   `fixtures/data`; `m2_world_aggregate` and its basket stay in the data package
 *   because the 1900 world cites it as the source of its provisional age structure).
 *   Population-only worlds have no economy, so neither the labour market nor the demand
 *   system applies;
 * - the M3 small economy (`fixtures/data/m3_small_economy.json` and the M3 catalogue it
 *   names), converted to the current model by `withCurrentModel`;
 * - the M5 sample (`scenarios/m5_eight_polities.json` in the data package, which a 1900
 *   generator still reads), built by the data package's historical loader and converted.
 *
 * Every call returns fresh objects.
 */
import { readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DATA_PACKAGE_VERSION,
  buildM5HistoricalScenario,
  loadHistoricalData,
  type HistoricalData,
} from "@century/data";
import {
  assertValidEconomyDefinitions,
  assertValidPopulationDefinitions,
  type BuildingDef,
  type BuildingInstanceInitialDef,
  type EconomyDefinitions,
  type EconomyScenarioDef,
  type EmploymentAssignmentInitialDef,
  type GoodDef,
  type MarketInitialDef,
  type NeedTierDef,
  type PopulationDefinitions,
  type PopulationScenarioDef,
  type ProfessionDef,
  type SystemAccountInitialDef,
} from "@century/sim";

import { withCurrentModel } from "./currentModel.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DATA = join(HERE, "data");
const DATA_PACKAGE_DATA = join(HERE, "../../../data/data");

/** The M5 sample's scenario file in the data package. */
export const M5_SAMPLE_SCENARIO_FILE = "scenarios/m5_eight_polities.json";

interface RawDemography {
  standardSchedule: PopulationDefinitions["standardSchedule"];
  foodEnergy: PopulationDefinitions["foodEnergy"];
  sexRatioAtBirth: number;
  fertilityMultipliers: PopulationDefinitions["fertilityMultipliers"];
}

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

interface RawM3Scenario {
  scenarioId: string;
  dataVersion: string;
  startDayIndex?: number;
  professionsFile: string;
  goodsFile: string;
  buildingsFile: string;
  needsFile: string;
  demographyFile: string;
  provinces: PopulationScenarioDef["provinceEconomies"];
  popBlocks: PopulationScenarioDef["popBlocks"];
  buildingInstances: BuildingInstanceInitialDef[];
  markets: MarketInitialDef[];
  systemAccounts: SystemAccountInitialDef[];
  employment: EmploymentAssignmentInitialDef[];
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

/** A fixture file, or (for files the data package keeps) a data-package file. */
function fixtureOrData(name: string): string {
  try {
    readFileSync(join(FIXTURE_DATA, name));
    return join(FIXTURE_DATA, name);
  } catch {
    return join(DATA_PACKAGE_DATA, name);
  }
}

function assertDataVersion(raw: { dataVersion: string }): void {
  if (raw.dataVersion !== DATA_PACKAGE_VERSION) {
    throw new Error(
      `scenario dataVersion ${JSON.stringify(raw.dataVersion)} does not match data package version ${JSON.stringify(DATA_PACKAGE_VERSION)}`,
    );
  }
}

function populationDefinitions(
  raw: { scenarioId: string; dataVersion: string },
  needs: readonly NeedTierDef[],
  demography: RawDemography,
  professionIds: ReadonlySet<number>,
): PopulationDefinitions {
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
  return definitions;
}

function loadPopulationScenario(path: string): PopulationScenarioDef {
  const raw = readJson<RawPopulationScenario>(path);
  assertDataVersion(raw);
  const needs = readJson<NeedTierDef[]>(fixtureOrData(raw.needsFile));
  const demography = readJson<RawDemography>(join(DATA_PACKAGE_DATA, raw.demographyFile));
  const definitions = populationDefinitions(raw, needs, demography, new Set(raw.professions.map((profession) => profession.id)));
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

/** The single-province world-aggregate population scenario (M2; the data package keeps it). */
export { loadM2WorldAggregate } from "@century/data";

/** The synthetic multi-block population scenario (M2). */
export function loadM2MultiBlock(): PopulationScenarioDef {
  return loadPopulationScenario(join(FIXTURE_DATA, "m2_multi_block.json"));
}

/** The WPP 1950-initialised age-structure validation scenario (M2, P4 validation). */
export function loadM2Wpp1950Validation(): PopulationScenarioDef {
  return loadPopulationScenario(join(FIXTURE_DATA, "m2_wpp_1950_validation.json"));
}

/** The M3 small economy, converted to the current model (D-155). */
export function loadM3SmallEconomy(): EconomyScenarioDef {
  const raw = readJson<RawM3Scenario>(join(FIXTURE_DATA, "m3_small_economy.json"));
  assertDataVersion(raw);
  const goods = readJson<GoodDef[]>(join(FIXTURE_DATA, raw.goodsFile));
  const professions = readJson<ProfessionDef[]>(join(FIXTURE_DATA, raw.professionsFile));
  const buildings = readJson<BuildingDef[]>(join(FIXTURE_DATA, raw.buildingsFile));
  const needs = readJson<NeedTierDef[]>(join(FIXTURE_DATA, raw.needsFile));
  const demography = readJson<RawDemography>(join(DATA_PACKAGE_DATA, raw.demographyFile));
  const definitions = populationDefinitions(raw, needs, demography, new Set(professions.map((profession) => profession.id)));
  const scenario: EconomyScenarioDef = {
    population: {
      dataVersion: raw.dataVersion,
      scenarioId: raw.scenarioId,
      ...(raw.startDayIndex === undefined ? {} : { startDayIndex: raw.startDayIndex }),
      professions: professions.map((profession) => ({
        id: profession.id,
        key: profession.key,
        name: profession.name,
        stratum: profession.stratum,
      })),
      provinceEconomies: raw.provinces,
      popBlocks: raw.popBlocks,
      definitions,
    },
    definitions: {
      dataVersion: raw.dataVersion,
      scenarioId: raw.scenarioId,
      goods,
      professions,
      buildings,
    } as unknown as EconomyDefinitions,
    buildingInstances: raw.buildingInstances,
    markets: raw.markets,
    systemAccounts: raw.systemAccounts,
    employment: raw.employment,
  };
  const converted = withCurrentModel(scenario);
  assertValidEconomyDefinitions(converted.definitions);
  return converted;
}

/** A fixture file as a path relative to the data package's data root (the loader's base). */
function fromDataRoot(name: string): string {
  return relative(DATA_PACKAGE_DATA, join(FIXTURE_DATA, name)).replaceAll("\\", "/");
}

/**
 * The eight-polity M5 sample, converted to the current model (D-155). Its tables and
 * definitions are the data package's; its professions are read with their roles from
 * `fixtures/data/m5_sample_professions.json` (the same professions, with the roles and
 * settlement `withCurrentModel` assigns) and its labour-market configuration from
 * `fixtures/data/m5_sample_labour.json`, because the 1900 generators read the original
 * catalogue files and they are not changed.
 */
export function loadM5Sample(): EconomyScenarioDef {
  return buildM5Sample(loadM5SampleData());
}

/** The M5 sample's validated tables (the data package's historical loader). */
export function loadM5SampleData(): HistoricalData {
  return loadHistoricalData(M5_SAMPLE_SCENARIO_FILE);
}

/** Build M5-sample tables (possibly altered by a test) as a current-model scenario. */
export function buildM5Sample(data: HistoricalData): EconomyScenarioDef {
  const meta = {
    ...data.meta,
    definitions: {
      ...data.meta.definitions,
      professions: fromDataRoot("m5_sample_professions.json"),
      labourMarket: fromDataRoot("m5_sample_labour.json"),
    },
  };
  return withCurrentModel(buildM5HistoricalScenario({ ...data, meta }));
}
