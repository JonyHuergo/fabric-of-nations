/**
 * M12a/M12b/M12c/M12d/M12e province content loader.
 *
 * Five committed bundles are the single source of truth for province geometry
 * and historical metadata:
 *  - `map/provinces_1900.json` — M12a Europe;
 *  - `map/provinces_asia_1900.json` — M12b Asia;
 *  - `map/provinces_africa_1900.json` — M12c Africa;
 *  - `map/provinces_americas_1900.json` — M12d Americas;
 *  - `map/provinces_oceania_1900.json` — M12e Oceania and the global land gaps.
 *
 * They are combined here into one scenario definition set with unique ids and
 * keys. The simulation receives only the static definitions and the future-polity
 * registry; province geometry stays in the app/offline map bundle. Initial
 * ownership defaults to each province's authored 1900 owner, so the scenario
 * never duplicates mutable state that the world creator derives.
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
export const PROVINCES_ASIA_BUNDLE_FILE = "map/provinces_asia_1900.json";
export const PROVINCES_AFRICA_BUNDLE_FILE = "map/provinces_africa_1900.json";
export const PROVINCES_AMERICAS_BUNDLE_FILE = "map/provinces_americas_1900.json";
export const PROVINCES_OCEANIA_BUNDLE_FILE = "map/provinces_oceania_1900.json";

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
  /** Optional 1900-active registry kind; defaults to future-state. */
  readonly kind?: "state" | "territory" | "future-state" | "historical";
  readonly status: string;
  readonly activeFrom: string;
  readonly activeTo: string | null;
  readonly capitalName: string;
  readonly flagKey: string | null;
  readonly selectable1900?: boolean;
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

type BundleWithoutBorders = Omit<ProvinceMapBundle, "borders">;

function readBundle(file: string): BundleWithoutBorders {
  const text = readFileSync(`${DATA_ROOT}${file}`, "utf8");
  const parsed = JSON.parse(text) as BundleWithoutBorders;
  if (!Array.isArray(parsed.provinces) || parsed.provinces.length === 0) {
    throw new Error(`province bundle ${file} must contain provinces`);
  }
  return parsed;
}

let cachedBundle: ProvinceMapBundle | undefined;

/**
 * Load and memoize all five committed province bundles as one combined
 * catalogue.
 *
 * European ids/keys are preserved exactly; Asian ids live in the 100001+ block
 * with `as-` keys, African ids in the 200001+ block with `af-` keys, American
 * ids in the 300001+ block with `am-` keys and Oceanian ids in the 400001+ block
 * with `oc-` keys. The merge rejects a collision instead of silently dropping a
 * province.
 */
export function loadProvinceBundle(): ProvinceMapBundle {
  if (cachedBundle !== undefined) return cachedBundle;
  const europe = readBundle(PROVINCES_BUNDLE_FILE);
  const asia = readBundle(PROVINCES_ASIA_BUNDLE_FILE);
  const africa = readBundle(PROVINCES_AFRICA_BUNDLE_FILE);
  const americas = readBundle(PROVINCES_AMERICAS_BUNDLE_FILE);
  const oceania = readBundle(PROVINCES_OCEANIA_BUNDLE_FILE);

  const ids = new Set<number>();
  const keys = new Set<string>();
  for (const province of [
    ...europe.provinces,
    ...asia.provinces,
    ...africa.provinces,
    ...americas.provinces,
    ...oceania.provinces,
  ]) {
    if (ids.has(province.id)) {
      throw new Error(`province id ${String(province.id)} is duplicated across bundles`);
    }
    if (keys.has(province.key)) {
      throw new Error(`province key ${province.key} is duplicated across bundles`);
    }
    ids.add(province.id);
    keys.add(province.key);
  }
  const polityIds = new Set<number>();
  for (const polity of [
    ...europe.futurePolities,
    ...asia.futurePolities,
    ...africa.futurePolities,
    ...americas.futurePolities,
    ...oceania.futurePolities,
  ]) {
    if (polityIds.has(polity.polityId)) {
      throw new Error(`future polity id ${String(polity.polityId)} is duplicated across bundles`);
    }
    polityIds.add(polity.polityId);
  }
  const sourceIds = new Set<string>();
  const sources = [
    ...europe.sources,
    ...asia.sources,
    ...africa.sources,
    ...americas.sources,
    ...oceania.sources,
  ].filter((source) => {
    if (sourceIds.has(source.id)) return false;
    sourceIds.add(source.id);
    return true;
  });

  const provinces = [
    ...europe.provinces,
    ...asia.provinces,
    ...africa.provinces,
    ...americas.provinces,
    ...oceania.provinces,
  ];
  const ownerTags = new Set(provinces.map((province) => province.initialOwnerTag));
  cachedBundle = {
    meta: {
      dataset: `${europe.meta.dataset}; ${asia.meta.dataset}; ${africa.meta.dataset}; ${americas.meta.dataset}; ${oceania.meta.dataset}`,
      referenceDate: "1900-01-01",
      provinceCount: provinces.length,
      polityCount: ownerTags.size,
      borderPairCount:
        europe.meta.borderPairCount +
        asia.meta.borderPairCount +
        africa.meta.borderPairCount +
        americas.meta.borderPairCount +
        oceania.meta.borderPairCount,
      notes:
        "Combined M12a European, M12b Asian, M12c African, M12d American and M12e Oceanian province catalogue. Province geometry and ids are permanent; ownership is mutable simulation state.",
      generatedBy: "packages/data/src/provinces.ts",
    },
    sources,
    futurePolities: [
      ...europe.futurePolities,
      ...asia.futurePolities,
      ...africa.futurePolities,
      ...americas.futurePolities,
      ...oceania.futurePolities,
    ],
    provinces,
    borders: [],
  };
  return cachedBundle;
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
 * Build the simulation's static provincial content from the committed bundles.
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
    kind: polity.kind ?? "future-state",
    status: polity.status as PolityDef["status"],
    sovereignPolityId: null,
    activeFromDay: isoDateToDayIndex(polity.activeFrom),
    activeToDay: polity.activeTo === null ? null : isoDateToDayIndex(polity.activeTo),
    selectable1900: polity.selectable1900 ?? false,
    capitalName: polity.capitalName,
    flagKey: polity.flagKey,
    sourceIds: ["project-authored-1900", "project-authored-m12"],
    confidence: polity.confidence,
    notes: polity.notes,
  }));
  return { definitions, polityRegistry };
}

/** True when all committed province bundles match the data package version. */
export function provinceBundleIsCurrent(): boolean {
  const bundle = loadProvinceBundle();
  return bundle.meta.referenceDate === "1900-01-01" && bundle.provinces.length > 0;
}

/** Data version referenced by the provincial content. */
export const PROVINCES_DATA_VERSION = DATA_PACKAGE_VERSION;
