/**
 * Build the M12a European province geometry, border and audit bundle.
 *
 * Inputs (all offline, no runtime download):
 *  - `.cache-m11/ne_10m_admin_1_states_provinces.geojson` Natural Earth 1:10m
 *    admin-1 units, used only as internal geometry blocks (public domain).
 *  - `packages/data/data/map/world_map_1900.json` the authored M11c 1900 polity
 *    polygons. Every province is clipped to its 1900 map polity polygon.
 *  - `scripts/m12/province-plan.mjs` the authored historical inventory.
 *
 * Outputs:
 *  - `packages/data/data/map/provinces_1900.json`
 *  - `packages/data/data/map/provinces_1900_audit.json`
 *  - `packages/app/src/generated/provinces1900.ts`
 *
 * The geometry pipeline itself lives in `./province-build-lib.mjs` and is shared
 * with the M12b Asia build. Run: node scripts/m12/build-provinces.mjs
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildProvinceBundle } from "./province-build-lib.mjs";
import { buildProvincePlan } from "./province-plan.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const ADMIN1_PATH = resolve(ROOT, ".cache-m11/ne_10m_admin_1_states_provinces.geojson");
const MAP_PATH = resolve(ROOT, "packages/data/data/map/world_map_1900.json");
const OUT = resolve(ROOT, "packages/data/data/map/provinces_1900.json");
const AUDIT_OUT = resolve(ROOT, "packages/data/data/map/provinces_1900_audit.json");
const TS_OUT = resolve(ROOT, "packages/app/src/generated/provinces1900.ts");

if (!existsSync(ADMIN1_PATH)) {
  throw new Error(
    `missing ${ADMIN1_PATH}; download Natural Earth 1:10m admin-1 once (public domain)`,
  );
}

const admin1 = JSON.parse(readFileSync(ADMIN1_PATH, "utf8"));
const worldMap = JSON.parse(readFileSync(MAP_PATH, "utf8"));

// In-scope coverage clips. European work package only: colonies, Asiatic Russia
// and Anatolia are deliberately outside the provincial coverage test.
const EUROPE_CLIP = {
  // European Russia: west of the Urals, north of the Kuma-Manych depression and
  // west of the Kazakh steppe. This is a coverage-test boundary for the M12a
  // European work package, not a new political border.
  RUS: [[-30, 42], [-30, 70], [60, 70], [60, 60], [57, 56], [54, 52], [52, 49], [48, 46], [46, 44], [40, 43], [30, 42]],
  // Ottoman Europe: the Balkans and Thrace west of the Bosphorus; Anatolia and
  // the Arab provinces are outside the M12a European scope.
  OTT: [[18, 36.5], [23, 35.5], [26, 36], [28, 40], [30, 41.5], [30, 43], [18, 43]],
  // Mainland Greece and the Aegean; Crete is the separate Cretan State.
  GRC: [[19, 36.5], [30, 36.5], [30, 42], [19, 42]],
  FRA: [[-6, 41], [10, 41], [10, 52], [-6, 52]],
  GBR: [[-11, 49], [2.5, 49], [2.5, 61], [-11, 61]],
  ESP: [[-10, 35], [5, 35], [5, 44.5], [-10, 44.5]],
  PRT: [[-10, 36], [-6, 36], [-6, 42.5], [-10, 42.5]],
  NLD: [[3, 50.5], [7.5, 50.5], [7.5, 54], [3, 54]],
  DNK: [[7.5, 54.4], [13.5, 54.4], [13.5, 58], [7.5, 58]],
  FIN: [[19, 59], [32, 59], [32, 71], [19, 71]],
  ISL: [[-25, 62], [-12, 62], [-12, 68], [-25, 68]],
  FRO: [[-8, 61], [-6, 61], [-6, 63], [-8, 63]],
  GRL: [[-75, 58], [-10, 58], [-10, 85], [-75, 85]],
};

const plan = buildProvincePlan(
  (() => {
    // The M12a plan needs the raw admin-1 metadata; the shared index adds the
    // geometry blocks the plan does not consume directly.
    const units = [];
    const seen = new Set();
    for (const feature of admin1.features) {
      const p = feature.properties;
      const code = p.iso_3166_2;
      if (typeof code !== "string" || code.length === 0) continue;
      if (!["Polygon", "MultiPolygon"].includes(feature.geometry?.type)) continue;
      if (seen.has(code)) continue;
      seen.add(code);
      units.push({
        code,
        name: p.name ?? code,
        nameLocal: p.name_local ?? p.name ?? code,
        country: p.adm0_a3,
        region: p.region ?? "",
        type: p.type ?? "",
        lat: typeof p.latitude === "number" ? p.latitude : 0,
        lon: typeof p.longitude === "number" ? p.longitude : 0,
      });
    }
    return units;
  })(),
);

const { payload, audit, stats } = buildProvinceBundle({
  plan,
  admin1,
  worldMap,
  coverageClips: EUROPE_CLIP,
  enclosedMicrostateTags: ["MCO", "SMR", "AND", "LIE"],
  dataset:
    "Natural Earth 1:10m admin-1 internal blocks clipped to the authored M11c 1900 polity polygons",
  notes:
    "Provinces are permanent geographical units with stable ids. Modern admin-1 units are only internal geometry blocks; the 1900 outer boundary is the authored M11c polity polygon. Residual provinces close small unresolved gaps and are labelled low confidence.",
  generatedBy: "scripts/m12/build-provinces.mjs",
});

writeFileSync(OUT, `${JSON.stringify(payload)}\n`, "utf8");
writeFileSync(AUDIT_OUT, `${JSON.stringify(audit, null, 2)}\n`, "utf8");

const tsSource = `/**
 * Generated by scripts/m12/build-provinces.mjs. Do not edit by hand.
 *
 * Offline M12a European province geometry and historical metadata. Coordinates
 * are thousandths of a degree, delta encoded. Modern Natural Earth units are
 * internal geometry blocks clipped to the authored M11c 1900 polity polygons.
 */
import type { ProvinceMapData } from "../provinceCatalogTypes";

export const PROVINCES_1900 = (${JSON.stringify(payload)}) as unknown as ProvinceMapData;
`;
mkdirSync(dirname(TS_OUT), { recursive: true });
writeFileSync(TS_OUT, tsSource, "utf8");

console.log(
  `wrote ${OUT} (${(JSON.stringify(payload).length / 1024).toFixed(0)} KiB) provinces=${stats.provinceCount} residuals=0 borders=${stats.borderCount} segments=${stats.segmentCount} unmatched=${stats.unmatchedSegments} duplicateIds=${stats.duplicateIds}`,
);
for (const warning of audit.warnings) console.log("warning:", warning);
