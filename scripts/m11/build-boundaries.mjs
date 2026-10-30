/**
 * Build the committed M11c boundary-reconstruction and provenance data.
 *
 * Input:  scripts/m11/boundaries-1900-source.mjs
 *         packages/data/data/historical/m11/polities_1900.json
 * Output: packages/data/data/historical/m11/boundaries_1900.json
 *
 * The output is deterministic. Run: node scripts/m11/build-boundaries.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  COMPONENTS,
  PATCHES,
  REFERENCE_DATE,
  SOURCES,
  TAG_BOUNDARY,
} from "./boundaries-1900-source.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const CATALOG_PATH = resolve(ROOT, "packages/data/data/historical/m11/polities_1900.json");
const OUT_PATH = resolve(ROOT, "packages/data/data/historical/m11/boundaries_1900.json");

const catalog = JSON.parse(readFileSync(CATALOG_PATH, "utf8"));
const all = [...catalog.states, ...catalog.territories];
const tagSet = new Set(all.map((entry) => entry.tag));
const sourceById = new Map(SOURCES.map((source) => [source.id, source]));

// Transfers whose destination is a small historical polity wholly carved out of
// a much larger modern source. These need a destination-bbox cleanup to remove
// the 50m/10m sliver that a patch-shape-only difference leaves behind.
const CLEANUP_IDS = new Set([
  "tonga-from-british-pacific",
  "malaya-sarawak",
  "crete-autonomous",
  "newfoundland-from-canada",
  "tibet-from-china",
  "khiva-from-russia",
  "bukhara-from-russia",
  "shammar-from-ottoman",
  "sokoto-from-british-west-africa",
  "wadai-from-french-equatorial-africa",
  "darfur-from-anglo-egyptian-sudan",
  "italian-somaliland-british",
  "italian-somaliland-jubaland",
  "german-east-africa-zanzibar",
  "german-east-africa-kionga",
  "german-south-west-africa-walvis",
  "togo-volta",
  "german-new-guinea-papua",
  "bolivia-acre",
  "chile-tacna",
  "portuguese-india",
  "french-india",
  "oman-gwadar",
  "ceylon-maldives",
  "yemen-aden-british",
  "siam-cambodian-provinces",
  "siam-laotian-provinces",
  "siam-malay-states",
]);
for (const id of CLEANUP_IDS) {
  if (!PATCHES.some((patch) => patch.id === id)) {
    throw new Error(`cleanup flag for unknown patch ${id}`);
  }
}

// These transfers define the complete territory of a polity that was previously
// marker-only or represented by a modern aggregate. The transferred (and
// source-clipped) shape replaces the catalog's building-block geometry rather
// than being unioned with it.
const REPLACE_BASE_IDS = new Set([
  "tonga-from-british-pacific",
  "sokoto-from-british-west-africa",
  "wadai-from-french-equatorial-africa",
  "darfur-from-anglo-egyptian-sudan",
  "shammar-from-ottoman",
  "crete-autonomous",
  "newfoundland-from-canada",
  "tibet-from-china",
  "khiva-from-russia",
  "bukhara-from-russia",
  "malaya-sarawak",
]);
for (const id of REPLACE_BASE_IDS) {
  if (!PATCHES.some((patch) => patch.id === id)) {
    throw new Error(`replace-base flag for unknown patch ${id}`);
  }
}

// ---- Validate the authored transfers -----------------------------------------

const patchIds = new Set();
for (const patch of PATCHES) {
  if (patchIds.has(patch.id)) throw new Error(`duplicate patch id ${patch.id}`);
  patchIds.add(patch.id);
  if (patch.to !== null && !tagSet.has(patch.to)) {
    throw new Error(`patch ${patch.id}: unknown target ${patch.to}`);
  }
  for (const tag of patch.from) {
    if (!tagSet.has(tag)) throw new Error(`patch ${patch.id}: unknown source ${tag}`);
  }
  if (patch.include.length === 0) throw new Error(`patch ${patch.id}: empty include`);
  for (const sourceId of patch.sourceIds) {
    if (!sourceById.has(sourceId)) throw new Error(`patch ${patch.id}: unknown source ${sourceId}`);
  }
  if (!["high", "medium", "low"].includes(patch.confidence)) {
    throw new Error(`patch ${patch.id}: bad confidence ${patch.confidence}`);
  }
}

// Detect accidental double subtraction (same shape/from/to), but allow a patch
// that is intentionally split across categories.
const seen = new Set();
for (const patch of PATCHES) {
  const key = `${patch.to ?? "-"}|${patch.from.join(",")}|${patch.include
    .map((entry) => JSON.stringify(entry))
    .join(";")}`;
  if (seen.has(key)) throw new Error(`duplicate transfer shape: ${patch.id}`);
  seen.add(key);
}

// ---- Provenance --------------------------------------------------------------

const patchesByTag = new Map();
for (const patch of PATCHES) {
  for (const tag of [patch.to, ...patch.from]) {
    if (tag === null) continue;
    const list = patchesByTag.get(tag) ?? [];
    list.push(patch.id);
    patchesByTag.set(tag, list);
  }
}

function defaultClass(entry) {
  const patches = patchesByTag.get(entry.tag) ?? [];
  if (entry.markerOnly === true) return "marker-only";
  if (patches.length > 0) return "reconstructed";
  if (Array.isArray(entry.geometry) && entry.geometry.length > 1) return "aggregate-modern-verified";
  return "direct-modern-verified";
}

const provenance = {};
for (const entry of all) {
  const authored = TAG_BOUNDARY[entry.tag];
  const geometryClass = authored?.[0] ?? defaultClass(entry);
  const confidence = authored?.[1] ?? (geometryClass === "reconstructed" ? "medium" : "high");
  const note =
    authored?.[2] ??
    (entry.markerOnly === true
      ? "Marker-only representation retained because no defensible historical polygon could be established."
      : "The modern external border is retained after verifying that no 1900 territorial change is documented for this polity. Internal modern subdivisions are not drawn.");
  const patchIdsForTag = patchesByTag.get(entry.tag) ?? [];
  const sourceIds = new Set([
    "natural-earth-50m",
    "natural-earth-10m-admin1",
    "natural-earth-10m-admin0",
    "project-authored-1900",
  ]);
  for (const patchId of patchIdsForTag) {
    const patch = PATCHES.find((candidate) => candidate.id === patchId);
    for (const sourceId of patch.sourceIds) sourceIds.add(sourceId);
  }
  const sourceRecords = [...sourceIds].map((id) => {
    const source = sourceById.get(id);
    return {
      id: source.id,
      title: source.title,
      url: source.url,
      license: source.license,
      date: source.date,
    };
  });
  provenance[entry.tag] = {
    polityId: entry.id,
    tag: entry.tag,
    historicalName: entry.name,
    referenceDate: REFERENCE_DATE,
    boundarySources: sourceRecords,
    geometryClass,
    confidence,
    underlyingBoundaryDate:
      geometryClass === "direct-modern-verified" || geometryClass === "aggregate-modern-verified"
        ? "1900-01-01 (verified against the modern external outline)"
        : "1900-01-01 (historical claim); modern units dated 2024",
    deviationsFromModern:
      geometryClass === "reconstructed" || geometryClass === "approximate"
        ? note
        : "No 1900-to-modern territorial difference is identified for the external border; the modern outline is retained as a verified match, not as a convenience default.",
    knownUncertainties:
      confidence === "high"
        ? "None beyond the generalization of the modern source units (1:50m base; 1:10m reconstruction blocks)."
        : note,
    notes: note,
    transferIds: patchIdsForTag,
    ...(COMPONENTS[entry.tag] === undefined ? {} : { components: COMPONENTS[entry.tag] }),
  };
}

// Every catalog polity must have provenance, and the provenance must not name
// unknown polities.
for (const entry of all) {
  if (provenance[entry.tag] === undefined) throw new Error(`missing provenance for ${entry.tag}`);
}
for (const tag of Object.keys(provenance)) {
  if (!tagSet.has(tag)) throw new Error(`provenance for unknown polity ${tag}`);
}

const output = {
  meta: {
    version: "m11c-1900-boundaries-v1",
    referenceDate: REFERENCE_DATE,
    title: "Century M11c historical boundary reconstruction and audit, 1 January 1900",
    method:
      "Modern Natural Earth units are used only as geometric building blocks. Every territorial difference from the modern map is an explicit transfer in `patches`, with dated sources, a confidence class and a note. The map build applies the transfers with polygon-clipping, simplifies to 0.02 degrees and records the resulting provenance on every polity.",
    confidenceDefinitions: {
      high: "Supported by strong historical cartographic, administrative or treaty evidence, with only modern generalization uncertainty.",
      medium: "Reconstructed from reliable sources; the frontier line or the exact extent has some unresolved uncertainty.",
      low: "Approximate historical extent where the available evidence is incomplete or the frontier was not surveyed/defined.",
    },
    geometryClasses: {
      "direct-modern-verified": "One modern unit whose external border is documented as identical in 1900.",
      "aggregate-modern-verified": "A union of modern units whose combined 1900 external border is documented as identical.",
      reconstructed: "The 1900 geometry differs from the modern map and is rebuilt with explicit transfers.",
      approximate: "A defensible but low-confidence historical extent, explicitly not an exact frontier.",
      "marker-only": "No polygon; retained only where no defensible extent can be established.",
    },
    sourceRegistry: SOURCES,
  },
  patches: PATCHES.map((patch) => ({
    id: patch.id,
    description: patch.description,
    to: patch.to,
    from: patch.from,
    include: patch.include,
    ...(patch.clip === undefined ? {} : { clip: patch.clip }),
    ...(patch.subtract === undefined ? {} : { subtract: patch.subtract }),
    confidence: patch.confidence,
    sourceIds: patch.sourceIds,
    notes: patch.notes,
    ...(CLEANUP_IDS.has(patch.id) ? { cleanup: true } : {}),
    ...(REPLACE_BASE_IDS.has(patch.id) ? { replaceBase: true } : {}),
  })),
  provenance,
};

writeFileSync(OUT_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");

const classes = {};
const confidences = {};
for (const record of Object.values(provenance)) {
  classes[record.geometryClass] = (classes[record.geometryClass] ?? 0) + 1;
  confidences[record.confidence] = (confidences[record.confidence] ?? 0) + 1;
}
console.log(
  `wrote ${OUT_PATH} (${Object.keys(provenance).length} polities, ${PATCHES.length} transfers)`,
);
console.log("geometry classes:", classes);
console.log("confidence:", confidences);
