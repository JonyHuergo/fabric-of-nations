/**
 * P4 (D-142): validated reader of the generated 1900 demography
 * (`historical/p4/demography_1900.json`, built by scripts/p4/build-demography-1900.mjs).
 *
 * Per province: sourced 1900 levels (Gapminder 1896–1905 means of its modern country
 * or stand-in), the fertility level and child/adult mortality multipliers of the
 * standard schedule, and the stable age structure. Per block: the urban share. Per
 * 1900 country: population-weighted source targets for the acceptance tests.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const DATA_ROOT = fileURLToPath(new URL("../data/", import.meta.url));
const AGE_BANDS = 17;

export interface Demography1900Province {
  readonly provinceId: number;
  readonly key: string;
  readonly modernCountry: string;
  readonly sourceGeo: string;
  readonly region: string;
  readonly standIn: boolean;
  readonly confidence: "low" | "medium";
  readonly source: {
    readonly totalFertility: number;
    readonly lifeExpectancy: number;
    readonly under5MortalityPer1000: number;
    readonly crudeBirthRate: number | null;
  };
  readonly fertilityLevel: number;
  readonly childMortalityLevel: number;
  readonly adultMortalityLevel: number;
  readonly model: {
    readonly lifeExpectancy: number;
    readonly under5MortalityPer1000: number;
    readonly stableGrowthPer1000: number;
    readonly crudeBirthRate: number;
    readonly crudeDeathRate: number;
  };
  readonly maleAgeWeights: readonly number[];
  readonly femaleAgeWeights: readonly number[];
}

export interface Demography1900Country {
  readonly countryId: number;
  readonly tag: string;
  readonly population: number;
  readonly source?: {
    readonly totalFertility: number;
    readonly lifeExpectancy: number;
    readonly under5MortalityPer1000: number;
    readonly crudeBirthRate: number | null;
    readonly crudeBirthRateCoverage: number;
  };
  readonly stable?: { readonly crudeBirthRate: number; readonly crudeDeathRate: number };
}

export interface Demography1900 {
  readonly meta: {
    readonly standardTotalFertility: number;
    readonly acceptanceTolerances: {
      readonly crudeBirthRateRelative: number;
      readonly lifeExpectancyYears: number;
      readonly under5MortalityRelative: number;
      readonly totalFertilityRelative: number;
    };
  };
  readonly provinces: readonly Demography1900Province[];
  readonly blocks: readonly { readonly provinceId: number; readonly professionKey: string; readonly urbanShare: number }[];
  readonly countries: readonly Demography1900Country[];
}

function fail(message: string): never {
  throw new RangeError(`historical/p4 demography: ${message}`);
}

function finite(value: unknown, path: string, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    fail(`${path} must be a finite number in ${String(minimum)}..${String(maximum)}`);
  }
  return value;
}

function weights(value: unknown, path: string): void {
  if (!Array.isArray(value) || value.length !== AGE_BANDS) fail(`${path} must have ${String(AGE_BANDS)} entries`);
  for (let index = 0; index < AGE_BANDS; index += 1) finite(value[index], `${path}[${String(index)}]`, 0, 1);
}

/** Read and validate the generated file. */
export function loadDemography1900(relativePath: string): Demography1900 {
  const data = JSON.parse(readFileSync(join(DATA_ROOT, relativePath), "utf8")) as Demography1900;
  if (!Array.isArray(data.provinces) || !Array.isArray(data.blocks) || !Array.isArray(data.countries)) {
    fail("provinces, blocks and countries must be arrays");
  }
  finite(data.meta?.standardTotalFertility, "meta.standardTotalFertility", 0.1, 20);
  const seen = new Set<number>();
  for (const [index, province] of data.provinces.entries()) {
    const path = `provinces[${String(index)}]`;
    if (seen.has(province.provinceId)) fail(`${path} repeats province ${String(province.provinceId)}`);
    seen.add(province.provinceId);
    finite(province.fertilityLevel, `${path}.fertilityLevel`, 0, 4);
    finite(province.childMortalityLevel, `${path}.childMortalityLevel`, 1e-4, 50);
    finite(province.adultMortalityLevel, `${path}.adultMortalityLevel`, 1e-4, 50);
    finite(province.source?.totalFertility, `${path}.source.totalFertility`, 0, 15);
    finite(province.source?.lifeExpectancy, `${path}.source.lifeExpectancy`, 5, 90);
    finite(province.source?.under5MortalityPer1000, `${path}.source.under5MortalityPer1000`, 0, 1000);
    weights(province.maleAgeWeights, `${path}.maleAgeWeights`);
    weights(province.femaleAgeWeights, `${path}.femaleAgeWeights`);
  }
  for (const [index, block] of data.blocks.entries()) {
    finite(block.urbanShare, `blocks[${String(index)}].urbanShare`, 0, 1);
  }
  return data;
}
