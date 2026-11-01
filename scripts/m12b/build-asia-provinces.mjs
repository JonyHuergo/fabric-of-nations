/**
 * Build the M12b Asian province geometry, border and audit bundle.
 *
 * Inputs (all offline, no runtime download):
 *  - `.cache-m11/ne_10m_admin_1_states_provinces.geojson` Natural Earth 1:10m
 *    admin-1 units, used only as internal geometry blocks (public domain).
 *  - `packages/data/data/map/world_map_1900.json` the authored M11c 1900 polity
 *    polygons. Every province is clipped to its 1900 map polity polygon.
 *  - `packages/data/data/map/provinces_1900.json` the committed M12a European
 *    bundle, seeded as higher-priority cross-owner geometry so an Asian province
 *    can never paint a foreign-coloured sliver across a European frontier.
 *  - `scripts/m12b/asia-plan.mjs` the authored historical inventory.
 *
 * Outputs:
 *  - `packages/data/data/map/provinces_asia_1900.json`
 *  - `packages/data/data/map/provinces_asia_1900_audit.json`
 *  - `packages/app/src/generated/provincesAsia1900.ts`
 *
 * Run: node scripts/m12b/build-asia-provinces.mjs
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  annotateUnitPolities,
  buildProvinceBundle,
  decodePolityPolygons,
  indexAdmin1,
  provincePolygonsFromBundle,
} from "../m12/province-build-lib.mjs";
import { buildAsiaProvincePlan } from "./asia-plan.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const ADMIN1_PATH = resolve(ROOT, ".cache-m11/ne_10m_admin_1_states_provinces.geojson");
const MAP_PATH = resolve(ROOT, "packages/data/data/map/world_map_1900.json");
const EUROPE_BUNDLE_PATH = resolve(ROOT, "packages/data/data/map/provinces_1900.json");
const OUT = resolve(ROOT, "packages/data/data/map/provinces_asia_1900.json");
const AUDIT_OUT = resolve(ROOT, "packages/data/data/map/provinces_asia_1900_audit.json");
const TS_OUT = resolve(ROOT, "packages/app/src/generated/provincesAsia1900.ts");

if (!existsSync(ADMIN1_PATH)) {
  throw new Error(
    `missing ${ADMIN1_PATH}; download Natural Earth 1:10m admin-1 once (public domain)`,
  );
}
if (!existsSync(EUROPE_BUNDLE_PATH)) {
  throw new Error(`missing ${EUROPE_BUNDLE_PATH}; run node scripts/m12/build-provinces.mjs first`);
}

const admin1 = JSON.parse(readFileSync(ADMIN1_PATH, "utf8"));
const worldMap = JSON.parse(readFileSync(MAP_PATH, "utf8"));
const europeBundle = JSON.parse(readFileSync(EUROPE_BUNDLE_PATH, "utf8"));

// ---- In-scope coverage boundaries ------------------------------------------
//
// These are coverage-test boundaries, not new political borders. The RUS and OTT
// clips exclude the European territory already covered by the M12a bundle so the
// Asia audit measures Asian coverage only. BPO is clipped to the Maldives so the
// global British Indian Ocean feature is not counted as an Asian gap.
const ASIA_CLIPS = {
  OTT: [
    [25.5, 12.5],
    [60, 12.5],
    [60, 43.5],
    [30, 43.5],
    [30, 41.5],
    [28, 40],
    [26, 36],
    [23, 35.5],
    [25.5, 36],
  ],
  RUS: [
    [40, 35],
    [190, 35],
    [190, 82],
    [68, 82],
    [68, 50],
    [55, 50],
    [50, 46],
    [46, 44],
    [40, 43],
  ],
  BPO: [
    [72, -1],
    [74.5, -1],
    [74.5, 8],
    [72, 8],
  ],
};

// ---- Admin-1 index and 1900 polity assignment ------------------------------
const { units, unitPolygons } = indexAdmin1(admin1);
const polityPolygonsByTag = new Map();
for (const polity of worldMap.polities) {
  polityPolygonsByTag.set(polity.tag, decodePolityPolygons(polity));
}
annotateUnitPolities(units, unitPolygons, polityPolygonsByTag);

const plan = buildAsiaProvincePlan(units);

// Seed the M12a Europe bundle as the earlier, higher-priority geometry.
const europeBlueprint = {
  provinces: europeBundle.provinces.map((province) => ({
    ownerPolityId: province.initialOwnerPolityId,
    polygons: provincePolygonsFromBundle(province),
  })),
};
const preexistingProvinces = europeBlueprint.provinces.map((province) => ({
  ownerPolityId: province.ownerPolityId,
  polygons: province.polygons,
}));

const { payload, audit, stats } = buildProvinceBundle({
  plan,
  admin1,
  worldMap,
  coverageClips: ASIA_CLIPS,
  enclosedMicrostateTags: ["HKG", "MAC", "KUW", "TRU", "SAR", "KHI", "BUK"],
  preexistingProvinces,
  estimateCoverageFromAllProvinces: true,
  dataset:
    "Natural Earth 1:10m admin-1 internal blocks clipped to the authored M11c 1900 polity polygons (Asia)",
  notes:
    "Asia is the M12b counterpart of the M12a European province system. Provinces are permanent geographical units with stable ids; modern admin-1 units are only internal geometry blocks and the 1900 outer boundary is the authored M11c polity polygon. Asia ids start at 100001 and every key is prefixed as-, disjoint from Europe.",
  generatedBy: "scripts/m12b/build-asia-provinces.mjs",
});

// The Asia block must never reuse a European id or key.
const europeIds = new Set(europeBundle.provinces.map((province) => province.id));
const europeKeys = new Set(europeBundle.provinces.map((province) => province.key));
const collisions = payload.provinces.filter(
  (province) => europeIds.has(province.id) || europeKeys.has(province.key),
);
if (collisions.length > 0) {
  throw new Error(
    `Asia province ids/keys collide with Europe: ${collisions
      .slice(0, 5)
      .map((province) => province.key)
      .join(", ")}`,
  );
}
if (payload.provinces.some((province) => province.id <= 66001)) {
  throw new Error("Asia province ids must live above the M12a Europe block");
}

// Attach plan-level gap diagnostics to the audit and the warning list.
audit.unassignedUnits = plan.unassigned;
audit.unassignedUnitCount = plan.unassigned.length;
audit.crossPolityUnitAssignments = plan.claimedElsewhere.slice(0, 200);
audit.crossPolityUnitAssignmentCount = plan.claimedElsewhere.length;
if (plan.unassigned.length > 0) {
  audit.warnings = [
    ...audit.warnings,
    `${plan.unassigned.length} admin-1 units inside an Asian 1900 feature are not claimed by any province`,
  ].sort();
}
if (plan.claimedElsewhere.length > 0) {
  audit.warnings = [
    ...audit.warnings,
    `${plan.claimedElsewhere.length} province code assignments have a label point outside the province map feature (boundary units)`,
  ].sort();
}

writeFileSync(OUT, `${JSON.stringify(payload)}\n`, "utf8");
writeFileSync(AUDIT_OUT, `${JSON.stringify(audit, null, 2)}\n`, "utf8");

const tsSource = `/**
 * Generated by scripts/m12b/build-asia-provinces.mjs. Do not edit by hand.
 *
 * Offline M12b Asian province geometry and historical metadata. Coordinates
 * are thousandths of a degree, delta encoded. Modern Natural Earth units are
 * internal geometry blocks clipped to the authored M11c 1900 polity polygons.
 * Asia ids start at 100001 and every key is prefixed with as-.
 */
import type { ProvinceMapData } from "../provinceCatalogTypes";

export const PROVINCES_ASIA_1900 = (${JSON.stringify(payload)}) as unknown as ProvinceMapData;
`;
mkdirSync(dirname(TS_OUT), { recursive: true });
writeFileSync(TS_OUT, tsSource, "utf8");

console.log(
  `wrote ${OUT} (${(JSON.stringify(payload).length / 1024).toFixed(0)} KiB) provinces=${stats.provinceCount} borders=${stats.borderCount} segments=${stats.segmentCount} unmatched=${stats.unmatchedSegments} duplicateIds=${stats.duplicateIds} unassigned=${plan.unassigned.length}`,
);
for (const warning of audit.warnings) console.log("warning:", warning);
if (plan.unassigned.length > 0) {
  console.log("unassigned:", plan.unassigned.join(" "));
}
