/**
 * Build the M12e Oceania and global land-gap province geometry, border and audit
 * bundle.
 *
 * Inputs (all offline, no runtime download):
 *  - `.cache-m11/ne_10m_admin_1_states_provinces.geojson` Natural Earth 1:10m
 *    admin-1 units, used only as internal geometry blocks (public domain).
 *  - `packages/data/data/map/world_map_1900.json` the authored M11c 1900 polity
 *    polygons and the land mask. Every non-detached province is clipped to its
 *    1900 map polity polygon; the land mask closes the remaining gaps.
 *  - The committed M12a Europe, M12b Asia, M12c Africa and M12d Americas bundles,
 *    seeded as higher-priority cross-owner geometry exactly as M12d seeds the
 *    earlier three, and used as seam partners for cross-bundle frontiers (the
 *    PNG/Indonesia border).
 *  - `scripts/m12e/oceania-plan.mjs` the authored historical inventory.
 *
 * Outputs:
 *  - `packages/data/data/map/provinces_oceania_1900.json`
 *  - `packages/data/data/map/provinces_oceania_1900_audit.json`
 *  - `packages/app/src/generated/provincesOceania1900.ts`
 *
 * Run: node scripts/m12e/build-oceania-provinces.mjs
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  annotateUnitPolities,
  bboxOverlap,
  buildProvinceBundle,
  decodePolityPolygons,
  decodeRing,
  encodeRing,
  indexAdmin1,
  pointInPolygons,
  provincePolygonsFromBundle,
  simplifyRing,
  TOLERANCE,
} from "../m12/province-build-lib.mjs";
import { buildOceaniaProvincePlan, OCEANIA_COUNTRIES, REGION_ID } from "./oceania-plan.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const ADMIN1_PATH = resolve(ROOT, ".cache-m11/ne_10m_admin_1_states_provinces.geojson");
const MAP_PATH = resolve(ROOT, "packages/data/data/map/world_map_1900.json");
const EUROPE_BUNDLE_PATH = resolve(ROOT, "packages/data/data/map/provinces_1900.json");
const ASIA_BUNDLE_PATH = resolve(ROOT, "packages/data/data/map/provinces_asia_1900.json");
const AFRICA_BUNDLE_PATH = resolve(ROOT, "packages/data/data/map/provinces_africa_1900.json");
const AMERICAS_BUNDLE_PATH = resolve(ROOT, "packages/data/data/map/provinces_americas_1900.json");
const OUT = resolve(ROOT, "packages/data/data/map/provinces_oceania_1900.json");
const AUDIT_OUT = resolve(ROOT, "packages/data/data/map/provinces_oceania_1900_audit.json");
const TS_OUT = resolve(ROOT, "packages/app/src/generated/provincesOceania1900.ts");

if (!existsSync(ADMIN1_PATH)) {
  throw new Error(
    `missing ${ADMIN1_PATH}; download Natural Earth 1:10m admin-1 once (public domain)`,
  );
}
for (const [label, path] of [
  ["Europe", EUROPE_BUNDLE_PATH],
  ["Asia", ASIA_BUNDLE_PATH],
  ["Africa", AFRICA_BUNDLE_PATH],
  ["Americas", AMERICAS_BUNDLE_PATH],
]) {
  if (!existsSync(path)) {
    throw new Error(
      `missing ${path}; run the earlier ${label} build first (the Oceania build preserves and seeds it)`,
    );
  }
}

const admin1 = JSON.parse(readFileSync(ADMIN1_PATH, "utf8"));
const worldMap = JSON.parse(readFileSync(MAP_PATH, "utf8"));
const europeBundle = JSON.parse(readFileSync(EUROPE_BUNDLE_PATH, "utf8"));
const asiaBundle = JSON.parse(readFileSync(ASIA_BUNDLE_PATH, "utf8"));
const africaBundle = JSON.parse(readFileSync(AFRICA_BUNDLE_PATH, "utf8"));
const americasBundle = JSON.parse(readFileSync(AMERICAS_BUNDLE_PATH, "utf8"));

// ---- In-scope coverage boundaries ------------------------------------------
//
// These are coverage-test boundaries, not political borders. They scope a shared
// map feature to its Oceanian part so the audit measures Oceanian coverage only:
//  - BPO is the British Pacific and Indian Ocean feature; the Indian Ocean
//    islands (Mauritius, Seychelles, Zanzibar, the Maldives) are Africa/Asia
//    provinces and are excluded by the two Pacific boxes.
//  - BSA is scoped to Pitcairn and Chagos; the Falklands, St Helena and
//    Ascension are Americas/Africa provinces.
//  - CHL is scoped to Easter Island and Juan Fernandez.
//  - MEX is scoped to the Revillagigedo Islands.
//  - USA is scoped to the Pacific remote islands and Navassa, which the 1900
//    feature does not resolve; the scope is therefore empty and the residual is
//    zero rather than the whole United States.
//  - GBR is scoped to the Isle of Man, NOR to Svalbard, AUT to Krk/Cres/Losinj.
//  - Every other Oceanian feature (AUS, NZL, FJI, TON, GSA, GPN, GUM, ASM, GNG,
//    FPO) is wholly Oceanian and needs no clip.
const COVERAGE_CLIPS = {
  BPO: [
    [
      [130, 25],
      [180, 25],
      [180, -30],
      [130, -30],
    ],
    [
      [-180, 25],
      [-140, 25],
      [-140, -30],
      [-180, -30],
    ],
  ],
  BSA: [
    [
      [-135, -30],
      [-120, -30],
      [-120, -20],
      [-135, -20],
    ],
    [
      [70, -10],
      [74, -10],
      [74, -5],
      [70, -5],
    ],
  ],
  CHL: [
    [
      [-109.7, -27.5],
      [-108.8, -27.5],
      [-108.8, -26.8],
      [-109.7, -26.8],
    ],
    [
      [-79.3, -34],
      [-78.5, -34],
      [-78.5, -33.3],
      [-79.3, -33.3],
    ],
  ],
  MEX: [
    [
      [-111.4, 18.5],
      [-110.6, 18.5],
      [-110.6, 19.1],
      [-111.4, 19.1],
    ],
  ],
  USA: [
    [
      [160, 15],
      [180, 15],
      [180, 30],
      [160, 30],
    ],
    [
      [-180, 15],
      [-161, 15],
      [-161, 30],
      [-180, 30],
    ],
    [
      [-165, -6],
      [-150, -6],
      [-150, 6],
      [-165, 6],
    ],
    [
      [-80.2, 18.2],
      [-72, 18.2],
      [-72, 18.7],
      [-80.2, 18.7],
    ],
  ],
  GBR: [
    [
      [-5.1, 53.8],
      [-4.1, 53.8],
      [-4.1, 54.6],
      [-5.1, 54.6],
    ],
  ],
  NOR: [
    [
      [9, 73.5],
      [35, 73.5],
      [35, 81.5],
      [9, 81.5],
    ],
  ],
  AUT: [
    [
      [14.4, 44.95],
      [14.85, 44.95],
      [14.85, 45.3],
      [14.4, 45.3],
    ],
    [
      [14.25, 44.6],
      [14.6, 44.6],
      [14.6, 45.2],
      [14.25, 45.2],
    ],
  ],
};

// The first USA box covers Wake, Midway, Johnston and Palmyra across the
// antimeridian; the 1900 United States feature does not resolve them, so the
// coverage scope is empty there and the residual is zero.

const { units, unitPolygons } = indexAdmin1(admin1);
const polityPolygonsByTag = new Map(
  worldMap.polities.map((polity) => [polity.tag, decodePolityPolygons(polity)]),
);
annotateUnitPolities(units, unitPolygons, polityPolygonsByTag);
const plan = buildOceaniaProvincePlan(units);

// The automatic land-ring closure needs the 1900 owner and simulation region of
// every map feature. Feature tags are state or territory tags; region ids equal
// the feature polity id, and a state owner tag maps to its catalog polity id.
const featureByTag = new Map(worldMap.polities.map((polity) => [polity.tag, polity]));
const statePolityIdByTag = new Map();
for (const polity of worldMap.polities) {
  const polityId = polity.provenance?.polityId;
  if (typeof polityId === "number" && polityId < 100) statePolityIdByTag.set(polity.tag, polityId);
}
const regionIdByTag = {};
const ownerByTag = {};
for (const polity of worldMap.polities) {
  const polityId = polity.provenance?.polityId;
  if (typeof polityId === "number") regionIdByTag[polity.tag] = polityId;
}
for (const province of plan.provinces) {
  if (ownerByTag[province.mapTag] === undefined) ownerByTag[province.mapTag] = province.ownerTag;
}
for (const gap of plan.gapProvinces) {
  if (ownerByTag[gap.mapTag] === undefined) ownerByTag[gap.mapTag] = gap.ownerTag;
}
plan.autoLandGaps = {
  idBase: plan.landGapIdBase,
  keyPrefix: "oc-landgap-",
  minArea: 0.01,
  ownerByTag,
  ownerPolityIdByTag: Object.fromEntries(statePolityIdByTag),
  regionIdByTag,
  fallbackOwnerTag: "GBR",
};

// Seed the committed M12a Europe, M12b Asia, M12c Africa and M12d Americas
// bundles as the earlier, higher-priority cross-owner geometry. Same-owner
// overlap is not trimmed because it cannot paint a foreign-coloured enclave.
const preexistingProvinces = [];
for (const bundle of [europeBundle, asiaBundle, africaBundle, americasBundle]) {
  for (const province of bundle.provinces) {
    preexistingProvinces.push({
      id: province.id,
      key: province.key,
      mapTag: province.mapTag,
      ownerPolityId: province.initialOwnerPolityId,
      ownerTag: province.initialOwnerTag,
      bbox: province.bbox,
      rings: province.rings,
      polygons: provincePolygonsFromBundle(province),
    });
  }
}
// Auto land gaps resolve the owner from the feature's existing provinces. Make
// every owner tag used by an earlier bundle (including the M12d Newfoundland
// registry polity) resolvable to its polity id.
for (const province of [...preexistingProvinces, ...plan.provinces]) {
  plan.autoLandGaps.ownerPolityIdByTag[province.ownerTag] = province.ownerPolityId;
}

const { payload, audit, stats } = buildProvinceBundle({
  plan,
  admin1,
  worldMap,
  coverageClips: COVERAGE_CLIPS,
  enclosedMicrostateTags: [],
  preexistingProvinces,
  estimateCoverageFromAllProvinces: true,
  dataset:
    "Natural Earth 1:10m admin-1 internal blocks, the M11c 1900 polity polygons and the M11c land mask (Oceania and global land gaps)",
  notes:
    "Oceania and the remaining global land gaps are the M12e complement of the M12a-M12d continental province systems. Provinces are permanent geographical units with stable ids; modern admin-1 units are only internal geometry blocks and the 1900 outer boundary is the authored M11c polity polygon. Oceania ids start at 400001 and every key is prefixed oc-, disjoint from Europe, Asia, Africa and the Americas. Remote islands and residual slivers are permanent provinces so the global land audit can prove every non-Antarctic M11c land ring belongs to a province; coverage geometry is not a reviewed frontier.",
  generatedBy: "scripts/m12e/build-oceania-provinces.mjs",
});

// ---- Cross-feature and cross-bundle seam borders ---------------------------
//
// Shared border extraction works from the raw source rings of two provinces of
// the same 1900 map feature, where the two sides are vertex-identical. This pass
// completes two kinds of frontier:
//   - between two Oceanian provinces of different 1900 features (for example a
//     German New Guinea province and a British Papua province);
//   - between an Oceanian province and a committed earlier-bundle province, most
//     importantly the Papua New Guinea / Indonesia (141 E) border. The Asian
//     Netherlands East Indies provinces are not part of this bundle, so they are
//     supplied as seam partners.
//
// The pass is display-only: it changes no province polygon, id or simulation
// state. It follows the M12c/M12d point-to-segment midline rule (not
// vertex-to-vertex, because colonial straight frontiers have almost no
// vertices), with land / polity / third-province filters.
const SEAM_TOLERANCE = 0.5;
const SEAM_CELL = 0.25;

const SEAM_CONTEXT = (() => {
  const landRings = worldMap.land.map(decodeRing);
  const polityPolygons = new Map();
  for (const polity of worldMap.polities) {
    polityPolygons.set(polity.tag, decodePolityPolygons(polity));
  }
  const polityBbox = new Map(worldMap.polities.map((polity) => [polity.tag, polity.bbox]));
  return { landRings, polityPolygons, polityBbox };
})();

function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inLand(x, y) {
  let inside = false;
  for (const ring of SEAM_CONTEXT.landRings) {
    if (pointInRing(x, y, ring)) inside = !inside;
  }
  return inside;
}

function politiesAt(x, y) {
  const tags = [];
  for (const [tag, box] of SEAM_CONTEXT.polityBbox) {
    if (x < box[0] || x > box[2] || y < box[1] || y > box[3]) continue;
    if (pointInPolygons([x, y], SEAM_CONTEXT.polityPolygons.get(tag) ?? [])) tags.push(tag);
  }
  return tags;
}

function nearestPointOnSegments(x, y, index, reach) {
  const cx = Math.floor(x / SEAM_CELL);
  const cy = Math.floor(y / SEAM_CELL);
  let nearest = null;
  let best = Infinity;
  for (let dx = -reach; dx <= reach; dx += 1) {
    for (let dy = -reach; dy <= reach; dy += 1) {
      for (const segment of index.get(`${cx + dx},${cy + dy}`) ?? []) {
        const [x1, y1, x2, y2] = segment;
        const ddx = x2 - x1;
        const ddy = y2 - y1;
        const lengthSquared = ddx * ddx + ddy * ddy;
        let t = lengthSquared === 0 ? 0 : ((x - x1) * ddx + (y - y1) * ddy) / lengthSquared;
        t = Math.max(0, Math.min(1, t));
        const px = x1 + t * ddx;
        const py = y1 + t * ddy;
        const distance = Math.hypot(px - x, py - y);
        if (distance <= best) {
          best = distance;
          nearest = [px, py];
        }
      }
    }
  }
  return nearest === null ? null : { point: nearest, distance: best };
}

function buildSegmentIndex(rings) {
  const index = new Map();
  for (const ring of rings) {
    for (let point = 0; point < ring.length - 1; point += 1) {
      const [x1, y1] = ring[point];
      const [x2, y2] = ring[point + 1];
      if (x1 === x2 && y1 === y2) continue;
      const segment = [x1, y1, x2, y2];
      const minCx = Math.floor(Math.min(x1, x2) / SEAM_CELL);
      const maxCx = Math.floor(Math.max(x1, x2) / SEAM_CELL);
      const minCy = Math.floor(Math.min(y1, y2) / SEAM_CELL);
      const maxCy = Math.floor(Math.max(y1, y2) / SEAM_CELL);
      for (let cx = minCx; cx <= maxCx; cx += 1) {
        for (let cy = minCy; cy <= maxCy; cy += 1) {
          const key = `${cx},${cy}`;
          if (!index.has(key)) index.set(key, []);
          index.get(key).push(segment);
        }
      }
    }
  }
  return index;
}

function encodeSeam(points, minTwoPointSpan) {
  const simplified = simplifyRing(points, TOLERANCE);
  let line = simplified;
  if (
    line.length >= 3 &&
    line[0][0] === line[line.length - 1][0] &&
    line[0][1] === line[line.length - 1][1]
  ) {
    line = line.slice(0, -1);
  }
  if (line.length < 2) return null;
  let span = 0;
  for (let index = 1; index < line.length; index += 1) {
    span += Math.hypot(
      line[index][0] - line[index - 1][0],
      line[index][1] - line[index - 1][1],
    );
  }
  if (line.length === 2 && span < minTwoPointSpan) return null;
  return encodeRing(line);
}

function completeCrossFeatureBorders(bundle, partners) {
  const localProvinces = bundle.provinces.map((province) => ({
    id: province.id,
    key: province.key,
    mapTag: province.mapTag,
    rings: province.rings.map(decodeRing),
    polygons: provincePolygonsFromBundle(province),
    bbox: province.bbox,
    local: true,
  }));
  const partnerProvinces = partners.map((province) => ({
    id: province.id,
    key: province.key,
    mapTag: province.mapTag,
    rings: province.rings.map(decodeRing),
    polygons: province.polygons,
    bbox: province.bbox,
    local: false,
  }));
  const all = [...localProvinces, ...partnerProvinces];
  const byId = new Map(all.map((province) => [province.id, province]));
  const pointsById = new Map(
    all.map((province) => [province.id, province.rings.flat()]),
  );
  const segmentGrids = new Map(
    all.map((province) => [province.id, buildSegmentIndex(province.rings)]),
  );
  // Coarse province index for the "inside a third province" test.
  const provinceCells = new Map();
  for (const province of all) {
    const box = province.bbox;
    for (let cx = Math.floor(box[0]); cx <= Math.floor(box[2]); cx += 1) {
      for (let cy = Math.floor(box[1]); cy <= Math.floor(box[3]); cy += 1) {
        const key = `${cx},${cy}`;
        if (!provinceCells.has(key)) provinceCells.set(key, []);
        provinceCells.get(key).push(province.id);
      }
    }
  }

  const exact = new Set(
    bundle.borders.filter((border) => border.b >= 0).map((border) => `${border.a}|${border.b}`),
  );
  const added = [];
  const addedByPair = new Map();
  const addedPairs = new Set();
  const seams = [];
  const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const hasBorder = (a, b) => {
    const key = pairKey(a, b);
    return exact.has(key) || addedPairs.has(key);
  };
  const pushBorder = (a, b, line, seam) => {
    const key = pairKey(a, b);
    const existing = addedByPair.get(key);
    if (existing !== undefined) existing.lines.push(line);
    else {
      const border = { a: Math.min(a, b), b: Math.max(a, b), lines: [line] };
      added.push(border);
      addedByPair.set(key, border);
    }
    addedPairs.add(key);
    seams.push(seam);
  };

  const reach = Math.ceil(SEAM_TOLERANCE / SEAM_CELL);

  function seamBetween(left, right, tolerance = SEAM_TOLERANCE, allowSameFeatureThird = false) {
    const leftBox = left.bbox;
    const rightBox = right.bbox;
    if (
      leftBox[2] + tolerance < rightBox[0] ||
      rightBox[2] + tolerance < leftBox[0] ||
      leftBox[3] + tolerance < rightBox[1] ||
      rightBox[3] + tolerance < leftBox[1]
    ) {
      return;
    }
    const seamReach = Math.ceil(tolerance / SEAM_CELL);
    const rightIndex2 = segmentGrids.get(right.id);
    const chains = [];
    let chain = [];
    const flush = () => {
      if (chain.length > 0) chains.push(chain);
      chain = [];
    };
    for (const ring of left.rings) {
      for (const [x, y] of ring) {
        if (
          x < rightBox[0] - tolerance ||
          x > rightBox[2] + tolerance ||
          y < rightBox[1] - tolerance ||
          y > rightBox[3] + tolerance
        ) {
          flush();
          continue;
        }
        const nearest = nearestPointOnSegments(x, y, rightIndex2, seamReach);
        if (nearest === null || nearest.distance > tolerance) {
          flush();
          continue;
        }
        const mx = (x + nearest.point[0]) / 2;
        const my = (y + nearest.point[1]) / 2;
        if (!inLand(mx, my)) {
          flush();
          continue;
        }
        let inEitherPolity = false;
        for (const tag of politiesAt(mx, my)) {
          if (tag === left.mapTag || tag === right.mapTag) inEitherPolity = true;
        }
        if (!inEitherPolity) {
          flush();
          continue;
        }
        let third = false;
        const cellKey = `${Math.floor(mx)},${Math.floor(my)}`;
        for (const candidateId of provinceCells.get(cellKey) ?? []) {
          if (candidateId === left.id || candidateId === right.id) continue;
          const candidate = byId.get(candidateId);
          if (candidate === undefined) continue;
          // In the same-feature pass a coverage-residual province of the same
          // 1900 feature can sit on the straight frontier between two split
          // provinces. It is the same jurisdiction, not a third country, so it
          // must not veto the edge the split is required to prove.
          if (allowSameFeatureThird && candidate.mapTag === left.mapTag) continue;
          const box = candidate.bbox;
          if (mx < box[0] || mx > box[2] || my < box[1] || my > box[3]) continue;
          if (pointInPolygons([mx, my], candidate.polygons)) {
            third = true;
            break;
          }
        }
        if (third) {
          flush();
          continue;
        }
        chain.push({ point: [mx, my], distance: nearest.distance });
      }
      flush();
    }
    for (const rawChain of chains) {
      if (rawChain.length < 2) continue;
      const maxDistance = Math.max(...rawChain.map((entry) => entry.distance));
      const line = encodeSeam(
        rawChain.map((entry) => entry.point),
        maxDistance <= 0.12 ? 0.15 : Infinity,
      );
      if (line === null) continue;
      pushBorder(left.id, right.id, line, {
        kind: "province-outline",
        a: left.id,
        b: right.id,
        source: `${left.mapTag}/${right.mapTag}`,
      });
    }
  }

  // Oceanian provinces against each other and against the earlier bundles.
  for (const left of localProvinces) {
    for (const right of all) {
      if (right.id === left.id) continue;
      if (left.mapTag === right.mapTag) continue;
      if (hasBorder(left.id, right.id)) continue;
      seamBetween(left, right);
    }
  }

  // Same-feature straight frontiers (the 141 E South Australia/New South Wales
  // line, the 26 S South Australia/Northern Territory line, the 129 E Western
  // Australia/South Australia line). Exact segment matching cannot connect them
  // because the two admin-1 units carry different vertex densities along the same
  // straight line. The point-to-segment pass closes them with the same land,
  // polity and third-province filters; the tolerance is tighter so a narrow strait
  // can never be bridged.
  const SAME_FEATURE_TOLERANCE = 0.12;
  for (let leftIndex = 0; leftIndex < localProvinces.length; leftIndex += 1) {
    const left = localProvinces[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < localProvinces.length; rightIndex += 1) {
      const right = localProvinces[rightIndex];
      if (left.mapTag !== right.mapTag) continue;
      if (hasBorder(left.id, right.id)) continue;
      seamBetween(left, right, SAME_FEATURE_TOLERANCE, true);
      // A straight frontier may carry vertices on only one side (the South
      // Australia/Northern Territory 26 S line is a single segment on the South
      // Australian ring). Run the reverse direction only when the forward pass
      // produced nothing, so the border is not drawn twice.
      if (!hasBorder(left.id, right.id)) {
        seamBetween(right, left, SAME_FEATURE_TOLERANCE, true);
      }
    }
  }

  if (added.length > 0) {
    bundle.borders = [...bundle.borders, ...added].sort((left, right) => {
      if (left.a !== right.a) return left.a - right.a;
      return left.b - right.b;
    });
    bundle.meta.borderPairCount = bundle.borders.length;
  }
  return { added, seams };
}

const partnerProvinces = preexistingProvinces.map((province) => ({
  id: province.id,
  key: province.key,
  mapTag: province.mapTag,
  bbox: province.bbox,
  rings: province.rings,
  polygons: province.polygons,
}));
const { added: seamBorders, seams: seamRecords } = completeCrossFeatureBorders(
  payload,
  partnerProvinces,
);

// ---- Collision and range validation ---------------------------------------
const priorProvinces = [
  ...europeBundle.provinces,
  ...asiaBundle.provinces,
  ...africaBundle.provinces,
  ...americasBundle.provinces,
];
const priorIds = new Set(priorProvinces.map((province) => province.id));
const priorKeys = new Set(priorProvinces.map((province) => province.key));
const collisions = payload.provinces.filter(
  (province) => priorIds.has(province.id) || priorKeys.has(province.key),
);
if (collisions.length > 0) {
  throw new Error(
    `Oceania province ids/keys collide with an earlier bundle: ${collisions
      .slice(0, 5)
      .map((province) => province.key)
      .join(", ")}`,
  );
}
if (payload.provinces.some((province) => province.id <= 300469)) {
  throw new Error("Oceania province ids must live above the M12d Americas block");
}
const priorFutureIds = new Set(
  [
    ...europeBundle.futurePolities,
    ...asiaBundle.futurePolities,
    ...africaBundle.futurePolities,
    ...americasBundle.futurePolities,
  ].map((polity) => polity.polityId),
);
for (const polity of payload.futurePolities) {
  if (polity.polityId < 1400 || polity.polityId > 1499) {
    throw new Error(`Oceania future polity ${polity.tag} id ${polity.polityId} is outside 1400-1499`);
  }
  if (priorFutureIds.has(polity.polityId)) {
    throw new Error(`Oceania future polity ${polity.tag} collides with an earlier polity id`);
  }
}

// ---- Audit extras ----------------------------------------------------------
audit.crossFeatureSeamBorders = seamBorders.map((border) => ({
  a: border.a,
  b: border.b,
  lines: border.lines.length,
  kind:
    seamRecords.find((seam) => seam.a === border.a && seam.b === border.b)?.kind ??
    "province-outline",
}));
audit.crossFeatureSeamBorderCount = seamBorders.length;
audit.crossFeatureBundles = seamBorders.filter(
  (border) => border.a <= 300469 || border.b <= 300469,
).length;
audit.crossFeaturePolityFrontierSeams = seamRecords.filter(
  (seam) => seam.kind === "polity-frontier",
);
audit.crossFeaturePolityFrontierSeamCount = audit.crossFeaturePolityFrontierSeams.length;
audit.borderPairCount = payload.borders.length;
audit.unassignedUnits = plan.unassigned;
audit.unassignedUnitCount = plan.unassigned.length;
audit.crossPolityUnitAssignments = plan.claimedElsewhere.slice(0, 200);
audit.crossPolityUnitAssignmentCount = plan.claimedElsewhere.length;
audit.duplicateUnitClaims = plan.duplicateClaims;
audit.duplicateUnitClaimCount = plan.duplicateClaims.length;
audit.oceaniaCountries = [...OCEANIA_COUNTRIES].sort();
audit.featureResidualProvinces = payload.provinces
  .filter((province) => province.key.startsWith("oc-gap-"))
  .map((province) => province.key);
// The documented exception list is also recorded in the bundle audit, not only
// in the generated global land audit.
const landRingLatitudes = worldMap.land.map((flat) => {
  const ring = decodeRing(flat);
  let maximum = -Infinity;
  for (const [, latitude] of ring) maximum = Math.max(maximum, latitude);
  return maximum;
});
audit.documentedExceptions = [
  {
    kind: "antarctica",
    count: landRingLatitudes.filter((latitude) => latitude < -60).length,
    reason:
      "Every land ring whose maximum latitude is below -60 (the continent, its ice shelves and the South Shetland/South Orkney islands). Antarctica has no 1900 polity and no permanent province.",
  },
  {
    kind: "water-hole",
    count: 1,
    reason:
      "The Caspian Sea is stored as an inner ring of the Afro-Eurasian land polygon. It is water, not land, and is excluded from the land-coverage audit.",
  },
  {
    kind: "not-exposed",
    count: 3,
    reason:
      "Ashmore/Cartier, the Coral Sea islands and the Minerva Reefs are below the M11c 0.02 square degree land-mask threshold and absent from the 1900 features and the admin-1 layer.",
  },
  {
    kind: "not-exposed",
    count: 2,
    reason:
      "Christmas Island and the Cocos (Keeling) Islands are below the M11c land-mask threshold and absent from the 1900 features and the admin-1 layer.",
  },
];
audit.regionIds = Object.fromEntries(
  [...new Set(payload.provinces.map((province) => province.mapTag))].map((tag) => [
    tag,
    REGION_ID[tag],
  ]),
);
if (plan.unassigned.length > 0) {
  audit.warnings = [
    ...audit.warnings,
    `${plan.unassigned.length} admin-1 units inside an Oceanian 1900 feature are not claimed by any province`,
  ].sort();
}
if (plan.duplicateClaims.length > 0) {
  audit.warnings = [
    ...audit.warnings,
    `${plan.duplicateClaims.length} admin-1 units were claimed by more than one province of the same map feature`,
  ].sort();
}

writeFileSync(OUT, `${JSON.stringify(payload)}\n`, "utf8");
writeFileSync(AUDIT_OUT, `${JSON.stringify(audit, null, 2)}\n`, "utf8");

const tsSource = `/**
 * Generated by scripts/m12e/build-oceania-provinces.mjs. Do not edit by hand.
 *
 * Offline M12e Oceanian and global land-gap province geometry and historical
 * metadata. Coordinates are thousandths of a degree, delta encoded. Modern
 * Natural Earth units are internal geometry blocks; the 1900 outer boundary is
 * the authored M11c polity polygon. Oceania ids start at 400001 and every key is
 * prefixed with oc-.
 */
import type { ProvinceMapData } from "../provinceCatalogTypes";

export const PROVINCES_OCEANIA_1900 = (${JSON.stringify(payload)}) as unknown as ProvinceMapData;
`;
mkdirSync(dirname(TS_OUT), { recursive: true });
writeFileSync(TS_OUT, tsSource, "utf8");

console.log(
  `wrote ${OUT} (${(JSON.stringify(payload).length / 1024).toFixed(0)} KiB) provinces=${stats.provinceCount} borderPairs=${payload.borders.length} (shared=${stats.borderCount}, seams=${seamBorders.length}) segments=${stats.segmentCount} unmatched=${stats.unmatchedSegments} duplicateIds=${stats.duplicateIds} unassigned=${plan.unassigned.length} duplicateClaims=${plan.duplicateClaims.length}`,
);
console.log(
  `gapProvinces=${audit.gapProvinceCount} featureResiduals=${audit.featureResidualProvinces.length} autoLandGaps=${audit.autoLandGapProvinceCount}`,
);
if (audit.autoLandGapProvinces.length > 0) {
  for (const gap of audit.autoLandGapProvinces) {
    console.log(`  land gap ring ${String(gap.ring)} -> ${gap.key} (${gap.mapTag}/${gap.ownerTag})`);
  }
}
for (const warning of audit.warnings) console.log("warning:", warning);
