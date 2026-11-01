/**
 * M12a European province content loader.
 *
 * The committed `map/provinces_1900.json` bundle is the single source of truth
 * for both geometry and historical province metadata. The simulation receives
 * only the static definitions and the future-polity registry; province geometry
 * stays in the app/offline map bundle. Initial ownership defaults to each
 * province's authored 1900 owner, so the scenario never duplicates mutable state
 * that the world creator derives.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  civilDateToDayIndex,
  type PolityDef,
  type ProvinceDefinition,
  type ProvinceScenarioInput,
  type ProvinceSpecialStatus,
} from "@century/sim";

import { DATA_PACKAGE_VERSION } from "./version.js";

const DATA_ROOT = fileURLToPath(new URL("../data/", import.meta.url));

export const PROVINCES_BUNDLE_FILE = "map/provinces_1900.json";

interface RawProvince {
  readonly id: number;
  readonly key: string;
  readonly historicalName: string;
  readonly displayName: string;
  readonly aliases: readonly string[];
  readonly initialOwnerPolityId: number;
  readonly initialOwnerTag: string;
  readonly mapTag: string;
  readonly simulationRegionId: number;
  readonly historicalAdminAffiliation: string;
  readonly historicalGrouping: string | null;
  readonly initialSpecialStatus: string;
  readonly confidence: "low" | "medium" | "high";
  readonly notes: string;
  readonly sourceIds: readonly string[];
  readonly area: number;
  readonly bbox: readonly number[];
  readonly label: readonly number[];
  readonly rings: readonly (readonly number[])[];
  readonly holes: readonly number[];
}

interface RawFuturePolity {
  readonly polityId: number;
  readonly tag: string;
  readonly historicalName: string;
  readonly commonName: string;
  readonly status: string;
  readonly activeFrom: string;
  readonly activeTo: string | null;
  readonly capitalName: string;
  readonly flagKey: string | null;
  readonly confidence: "low" | "medium" | "high";
  readonly notes: string;
}

export interface ProvinceMapBundle {
  readonly meta: {
    readonly dataset: string;
    readonly referenceDate: string;
    readonly provinceCount: number;
    readonly polityCount: number;
    readonly borderPairCount: number;
    readonly notes: string;
    readonly generatedBy: string;
  };
  readonly sources: readonly {
    readonly id: string;
    readonly title: string;
    readonly url: string;
    readonly license: string;
    readonly date: string;
    readonly notes: string;
  }[];
  readonly futurePolities: readonly RawFuturePolity[];
  readonly provinces: readonly RawProvince[];
  readonly borders: readonly {
    readonly a: number;
    readonly b: number;
    readonly lines: readonly (readonly number[])[];
  }[];
}

let cachedBundle: ProvinceMapBundle | undefined;

/** Load and memoize the committed province geometry bundle. */
export function loadProvinceBundle(): ProvinceMapBundle {
  if (cachedBundle !== undefined) return cachedBundle;
  const text = readFileSync(`${DATA_ROOT}${PROVINCES_BUNDLE_FILE}`, "utf8");
  const parsed = JSON.parse(text) as ProvinceMapBundle;
  if (!Array.isArray(parsed.provinces) || parsed.provinces.length === 0) {
    throw new Error("province bundle must contain provinces");
  }
  cachedBundle = parsed;
  return parsed;
}

/** Convert an ISO civil date to the campaign day index. */
export function isoDateToDayIndex(iso: string): number {
  const parts = iso.split("-").map(Number);
  const [year = 0, month = 0, day = 0] = parts;
  if (
    parts.length !== 3 ||
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    throw new Error(`invalid ISO date ${JSON.stringify(iso)}`);
  }
  return civilDateToDayIndex(year, month as Parameters<typeof civilDateToDayIndex>[1], day);
}

const SPECIAL_STATUSES = new Set<string>([
  "ordinary",
  "autonomous",
  "joint-administration",
  "condominium",
  "free-city",
  "neutral",
  "mandate",
  "occupied",
]);

/**
 * Build the simulation's static provincial content from the committed bundle.
 *
 * Geometry fields are intentionally ignored here: the simulation does not know
 * or validate polygons, which keeps `packages/sim` free of GIS dependencies and
 * preserves its ES2022-only compilation surface.
 */
export function loadM11Provinces(): ProvinceScenarioInput {
  const bundle = loadProvinceBundle();
  const definitions: ProvinceDefinition[] = bundle.provinces.map((province) => {
    if (!SPECIAL_STATUSES.has(province.initialSpecialStatus)) {
      throw new Error(
        `province ${province.key} has unsupported special status ${JSON.stringify(province.initialSpecialStatus)}`,
      );
    }
    return {
      provinceId: province.id,
      key: province.key,
      historicalName: province.historicalName,
      displayName: province.displayName,
      aliases: [...province.aliases],
      initialOwnerPolityId: province.initialOwnerPolityId,
      simulationRegionId: province.simulationRegionId,
      historicalAdminAffiliation: province.historicalAdminAffiliation,
      historicalGrouping: province.historicalGrouping,
      initialSpecialStatus: province.initialSpecialStatus as ProvinceSpecialStatus,
      sourceIds: [...province.sourceIds],
      confidence: province.confidence,
      notes: province.notes,
    };
  });
  const polityRegistry: PolityDef[] = bundle.futurePolities.map((polity) => ({
    polityId: polity.polityId,
    tag: polity.tag,
    historicalName: polity.historicalName,
    commonName: polity.commonName,
    kind: "future-state",
    status: polity.status as PolityDef["status"],
    sovereignPolityId: null,
    activeFromDay: isoDateToDayIndex(polity.activeFrom),
    activeToDay: polity.activeTo === null ? null : isoDateToDayIndex(polity.activeTo),
    selectable1900: false,
    capitalName: polity.capitalName,
    flagKey: polity.flagKey,
    sourceIds: ["project-authored-1900", "project-authored-m12"],
    confidence: polity.confidence,
    notes: polity.notes,
  }));
  return { definitions, polityRegistry };
}

/** True when the committed province bundle matches the data package version. */
export function provinceBundleIsCurrent(): boolean {
  const bundle = loadProvinceBundle();
  return bundle.meta.referenceDate === "1900-01-01" && bundle.provinces.length > 0;
}

/** Data version referenced by the provincial content. */
export const PROVINCES_DATA_VERSION = DATA_PACKAGE_VERSION;
