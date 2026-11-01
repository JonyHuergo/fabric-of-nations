/**
 * Build the M12d Americas province geometry, border and audit bundle.
 *
 * Inputs (all offline, no runtime download):
 *  - `.cache-m11/ne_10m_admin_1_states_provinces.geojson` Natural Earth 1:10m
 *    admin-1 units, used only as internal geometry blocks (public domain).
 *  - `packages/data/data/map/world_map_1900.json` the authored M11c 1900 polity
 *    polygons. Every province is clipped to its 1900 map polity polygon.
 *  - `packages/data/data/map/provinces_1900.json` (M12a Europe),
 *    `packages/data/data/map/provinces_asia_1900.json` (M12b Asia) and
 *    `packages/data/data/map/provinces_africa_1900.json` (M12c Africa), seeded
 *    as higher-priority cross-owner geometry exactly as M12c seeds Europe+Asia.
 *  - `scripts/m12d/americas-plan.mjs` the authored historical inventory.
 *
 * Outputs:
 *  - `packages/data/data/map/provinces_americas_1900.json`
 *  - `packages/data/data/map/provinces_americas_1900_audit.json`
 *  - `packages/app/src/generated/provincesAmericas1900.ts`
 *
 * Run: node scripts/m12d/build-americas-provinces.mjs
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  annotateUnitPolities,
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
import { buildAmericasProvincePlan } from "./americas-plan.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const ADMIN1_PATH = resolve(ROOT, ".cache-m11/ne_10m_admin_1_states_provinces.geojson");
const MAP_PATH = resolve(ROOT, "packages/data/data/map/world_map_1900.json");
const EUROPE_BUNDLE_PATH = resolve(ROOT, "packages/data/data/map/provinces_1900.json");
const ASIA_BUNDLE_PATH = resolve(ROOT, "packages/data/data/map/provinces_asia_1900.json");
const AFRICA_BUNDLE_PATH = resolve(ROOT, "packages/data/data/map/provinces_africa_1900.json");
const OUT = resolve(ROOT, "packages/data/data/map/provinces_americas_1900.json");
const AUDIT_OUT = resolve(ROOT, "packages/data/data/map/provinces_americas_1900_audit.json");
const TS_OUT = resolve(ROOT, "packages/app/src/generated/provincesAmericas1900.ts");

if (!existsSync(ADMIN1_PATH)) {
  throw new Error(
    `missing ${ADMIN1_PATH}; download Natural Earth 1:10m admin-1 once (public domain)`,
  );
}
for (const [label, path] of [
  ["Europe", EUROPE_BUNDLE_PATH],
  ["Asia", ASIA_BUNDLE_PATH],
  ["Africa", AFRICA_BUNDLE_PATH],
]) {
  if (!existsSync(path)) {
    throw new Error(
      `missing ${path}; run the earlier ${label} build first (the Americas build preserves and seeds it)`,
    );
  }
}

const admin1 = JSON.parse(readFileSync(ADMIN1_PATH, "utf8"));
const worldMap = JSON.parse(readFileSync(MAP_PATH, "utf8"));
const europeBundle = JSON.parse(readFileSync(EUROPE_BUNDLE_PATH, "utf8"));
const asiaBundle = JSON.parse(readFileSync(ASIA_BUNDLE_PATH, "utf8"));
const africaBundle = JSON.parse(readFileSync(AFRICA_BUNDLE_PATH, "utf8"));

// ---- In-scope coverage boundaries ------------------------------------------
//
// These are coverage-test boundaries, not political borders. They scope a shared
// map feature to its American part so the audit measures American coverage only:
//  - FRA is clipped to French Guiana and the French Antilles (Guadeloupe and
//    Martinique); metropolitan France, Corsica, Réunion and Mayotte are the
//    Europe/Africa scope. The two disjoint rings are why the shared pipeline
//    accepts a multi-polygon coverage scope.
//  - BSA is clipped to the Falklands, South Georgia and the South Sandwich
//    Islands; St Helena, Ascension, Diego Garcia and Pitcairn are Africa/Asia/
//    Oceania and are not Americas provinces.
//  - BWI, FCA, DGC, DWI, SUR, GRL, PRI and every sovereign American feature are
//    wholly American, so they need no clip.
const COVERAGE_CLIPS = {
  FRA: [
    [
      [-55.5, 1.5],
      [-51, 1.5],
      [-51, 6.5],
      [-55.5, 6.5],
    ],
    [
      [-62, 14],
      [-60.5, 14],
      [-60.5, 16.7],
      [-62, 16.7],
    ],
  ],
  BSA: [
    [-63, -59],
    [-24, -59],
    [-24, -50],
    [-63, -50],
  ],
};

// ---- Admin-1 index and 1900 polity assignment ------------------------------
const { units, unitPolygons } = indexAdmin1(admin1);
const polityPolygonsByTag = new Map();
for (const polity of worldMap.polities) {
  polityPolygonsByTag.set(polity.tag, decodePolityPolygons(polity));
}
annotateUnitPolities(units, unitPolygons, polityPolygonsByTag);

const plan = buildAmericasProvincePlan(units);

// Seed the committed M12a Europe, M12b Asia and M12c Africa bundles as the
// earlier, higher-priority cross-owner geometry. Same-owner overlap is not
// trimmed because it cannot paint a foreign-coloured enclave.
const preexistingProvinces = [];
for (const bundle of [europeBundle, asiaBundle, africaBundle]) {
  for (const province of bundle.provinces) {
    preexistingProvinces.push({
      ownerPolityId: province.initialOwnerPolityId,
      polygons: provincePolygonsFromBundle(province),
    });
  }
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
    "Natural Earth 1:10m admin-1 internal blocks clipped to the authored M11c 1900 polity polygons (Americas)",
  notes:
    "The Americas are the M12d counterpart of the M12a European, M12b Asian and M12c African province systems. Provinces are permanent geographical units with stable ids; modern admin-1 units are only internal geometry blocks and the 1900 outer boundary is the authored M11c polity polygon. Americas ids start at 300001 and every key is prefixed am-, disjoint from Europe, Asia and Africa. Newfoundland is a 1900 registry polity so its 1949 union with Canada is an ordinary transfer.",
  generatedBy: "scripts/m12d/build-americas-provinces.mjs",
});

// ---- Cross-feature seam borders --------------------------------------------
//
// Shared border extraction works from the raw source rings of two provinces of
// the same 1900 map feature, where the two sides are vertex-identical. Provinces
// of two different 1900 features (USA/Canada, USA/Mexico, Mexico/Guatemala,
// Colombia/Panama, Brazil/Guyana, Haiti/Dominican Republic, ...) are clipped by
// two independently authored polity frontiers, so the exact segment match can
// fail and the derived national path would be missing there after an ownership
// transfer.
//
// Two display-only passes complete the frontier. Neither changes simulation
// state or a province polygon; both follow the M11c map's existing seam-bridge
// precedent and are deterministic (provinces in id order, features in tag order,
// vertices in ring order).
//
// Pass 1 works at province level: for each vertex of one province, the nearest
// point on the other province's outline within SEAM_TOLERANCE contributes the
// midpoint, and consecutive midpoints along a ring become one polyline.
// Point-to-segment matching (not vertex-to-vertex) is required because colonial
// and treaty straight-line frontiers have very few vertices on either side.
//
// Pass 2 works at polity level and only for feature pairs that pass 1 could not
// connect at all: the midline between the two 1900 polity outlines, attributed
// to the nearest province on each side. This covers long straight treaty lines
// and frontiers where the modern admin-1 blocks stop short of the 1900 line.
//
// Filters, applied to both passes:
//  - the midpoint must be on land (the M11c land mask), so no line is drawn
//    across a strait or a lake;
//  - the midpoint must not lie inside a third 1900 polity (pass 2) or a province
//    of a third 1900 feature (pass 1);
//  - a two-point line (a straight frontier) is accepted only when it has real
//    length, so a quadripoint artefact is never turned into a border.
const SEAM_TOLERANCE = 0.5;
const SEAM_CELL = 0.25;
const POLITY_SEAM_TOLERANCE = 0.4;

/**
 * Feature pairs whose provinces never come within SEAM_TOLERANCE of one another
 * but whose 1900 polities share a frontier that the derived national border needs.
 * The bbox limits the seam to the shared stretch.
 */
const FORCED_POLITY_FRONTIERS = [];

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

/**
 * Simplify a seam polyline and encode it.
 *
 * `simplifyRing` returns inputs of four points or fewer unchanged (and does not
 * close them), so a straight two-point frontier must be handled explicitly: it is
 * a real border when it spans a meaningful distance.
 */
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

function completeCrossFeatureBorders(bundle) {
  const provinces = bundle.provinces;
  const provinceById = new Map(provinces.map((province) => [province.id, province]));
  const ringsById = new Map(
    provinces.map((province) => [province.id, province.rings.map(decodeRing)]),
  );
  const boxes = new Map(provinces.map((province) => [province.id, province.bbox]));
  const polygonsById = new Map(
    provinces.map((province) => [province.id, provincePolygonsFromBundle(province)]),
  );
  const pointsById = new Map(
    provinces.map((province) => [province.id, (ringsById.get(province.id) ?? []).flat()]),
  );
  const segmentGrids = new Map(
    provinces.map((province) => [province.id, buildSegmentIndex(ringsById.get(province.id) ?? [])]),
  );
  // Coarse province index for the "inside a third province" test.
  const provinceCells = new Map();
  for (const province of provinces) {
    const box = boxes.get(province.id);
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

  // ---- Pass 1: province outlines --------------------------------------------
  for (let leftIndex = 0; leftIndex < provinces.length; leftIndex += 1) {
    const left = provinces[leftIndex];
    const leftBox = boxes.get(left.id);
    for (let rightIndex = leftIndex + 1; rightIndex < provinces.length; rightIndex += 1) {
      const right = provinces[rightIndex];
      if (left.mapTag === right.mapTag) continue;
      if (hasBorder(left.id, right.id)) continue;
      const rightBox = boxes.get(right.id);
      if (
        leftBox[2] + SEAM_TOLERANCE < rightBox[0] ||
        rightBox[2] + SEAM_TOLERANCE < leftBox[0] ||
        leftBox[3] + SEAM_TOLERANCE < rightBox[1] ||
        rightBox[3] + SEAM_TOLERANCE < leftBox[1]
      ) {
        continue;
      }
      const rightIndex2 = segmentGrids.get(right.id);
      const chains = [];
      let chain = [];
      const flush = () => {
        if (chain.length > 0) chains.push(chain);
        chain = [];
      };
      const reach = Math.ceil(SEAM_TOLERANCE / SEAM_CELL);
      for (const ring of ringsById.get(left.id) ?? []) {
        for (const [x, y] of ring) {
          if (
            x < rightBox[0] - SEAM_TOLERANCE ||
            x > rightBox[2] + SEAM_TOLERANCE ||
            y < rightBox[1] - SEAM_TOLERANCE ||
            y > rightBox[3] + SEAM_TOLERANCE
          ) {
            flush();
            continue;
          }
          const nearest = nearestPointOnSegments(x, y, rightIndex2, reach);
          if (nearest === null || nearest.distance > SEAM_TOLERANCE) {
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
            if (pointInPolygons([mx, my], polygonsById.get(candidateId) ?? [])) {
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
        // A long straight frontier is fine; a two-point line only when the two
        // province blocks really are close to each other.
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
  }

  // ---- Pass 2: 1900 polity frontier -----------------------------------------
  const featureTags = [...new Set(provinces.map((province) => province.mapTag))].sort();
  const polityRingsByTag = new Map(
    featureTags.map((tag) => {
      const polity = worldMap.polities.find((candidate) => candidate.tag === tag);
      return [tag, polity === undefined ? [] : polity.rings.map(decodeRing)];
    }),
  );
  const featureIndexes = new Map(
    featureTags.map((tag) => [tag, buildSegmentIndex(polityRingsByTag.get(tag) ?? [])]),
  );
  const featuresOf = new Map(
    featureTags.map((tag) => [tag, provinces.filter((province) => province.mapTag === tag)]),
  );

  const coveredFeaturePairs = new Set();
  for (const border of [...bundle.borders, ...added]) {
    if (border.b < 0) continue;
    const leftTag = provinceById.get(border.a)?.mapTag;
    const rightTag = provinceById.get(border.b)?.mapTag;
    if (leftTag === undefined || rightTag === undefined || leftTag === rightTag) continue;
    coveredFeaturePairs.add(leftTag < rightTag ? `${leftTag}|${rightTag}` : `${rightTag}|${leftTag}`);
  }

  function nearestProvince(x, y, tag) {
    let bestId = null;
    let best = Infinity;
    for (const province of featuresOf.get(tag) ?? []) {
      const box = boxes.get(province.id);
      if (x < box[0] - 1 || x > box[2] + 1 || y < box[1] - 1 || y > box[3] + 1) continue;
      for (const [px, py] of pointsById.get(province.id) ?? []) {
        const distance = Math.hypot(px - x, py - y);
        if (distance < best) {
          best = distance;
          bestId = province.id;
        }
      }
    }
    return bestId;
  }

  function seamAlongPolityFrontier(leftTag, rightTag, bbox) {
    const leftRings = polityRingsByTag.get(leftTag) ?? [];
    const rightIndex = featureIndexes.get(rightTag);
    const leftPolityBox = SEAM_CONTEXT.polityBbox.get(leftTag);
    const rightPolityBox = SEAM_CONTEXT.polityBbox.get(rightTag);
    if (leftRings.length === 0 || rightIndex === undefined || rightIndex.size === 0) return;
    if (leftPolityBox === undefined || rightPolityBox === undefined) return;
    const runs = [];
    let run = null;
    const flush = () => {
      if (run !== null && run.points.length >= 2) runs.push(run);
      run = null;
    };
    const reach = Math.ceil(POLITY_SEAM_TOLERANCE / SEAM_CELL);
    for (const ring of leftRings) {
      for (const [x, y] of ring) {
        if (bbox !== null) {
          if (x < bbox[0] || x > bbox[2] || y < bbox[1] || y > bbox[3]) {
            flush();
            continue;
          }
        }
        const nearest = nearestPointOnSegments(x, y, rightIndex, reach);
        if (nearest === null || nearest.distance > POLITY_SEAM_TOLERANCE) {
          flush();
          continue;
        }
        const mx = (x + nearest.point[0]) / 2;
        const my = (y + nearest.point[1]) / 2;
        if (!inLand(mx, my)) {
          flush();
          continue;
        }
        let crossed = false;
        for (const tag of politiesAt(mx, my)) {
          if (tag !== leftTag && tag !== rightTag) crossed = true;
        }
        if (crossed) {
          flush();
          continue;
        }
        const leftProvince = nearestProvince(mx, my, leftTag);
        const rightProvince = nearestProvince(mx, my, rightTag);
        if (leftProvince === null || rightProvince === null) {
          flush();
          continue;
        }
        if (hasBorder(leftProvince, rightProvince)) {
          flush();
          continue;
        }
        const key = `${leftProvince}|${rightProvince}`;
        if (run === null || run.key !== key) {
          flush();
          run = { key, a: leftProvince, b: rightProvince, points: [] };
        }
        run.points.push([mx, my]);
      }
      flush();
    }
    for (const current of runs) {
      const line = encodeSeam(current.points, 0.1);
      if (line === null) continue;
      pushBorder(current.a, current.b, line, {
        kind: "polity-frontier",
        a: current.a,
        b: current.b,
        source: `${leftTag}/${rightTag}`,
      });
    }
  }

  for (let leftFeature = 0; leftFeature < featureTags.length; leftFeature += 1) {
    const leftTag = featureTags[leftFeature];
    for (let rightFeature = leftFeature + 1; rightFeature < featureTags.length; rightFeature += 1) {
      const rightTag = featureTags[rightFeature];
      if (coveredFeaturePairs.has(`${leftTag}|${rightTag}`)) continue;
      const leftBox = SEAM_CONTEXT.polityBbox.get(leftTag);
      const rightBox = SEAM_CONTEXT.polityBbox.get(rightTag);
      if (leftBox === undefined || rightBox === undefined) continue;
      if (
        leftBox[2] + SEAM_TOLERANCE < rightBox[0] ||
        rightBox[2] + SEAM_TOLERANCE < leftBox[0] ||
        leftBox[3] + SEAM_TOLERANCE < rightBox[1] ||
        rightBox[3] + SEAM_TOLERANCE < leftBox[1]
      ) {
        continue;
      }
      seamAlongPolityFrontier(leftTag, rightTag, null);
    }
  }
  for (const forced of FORCED_POLITY_FRONTIERS) {
    seamAlongPolityFrontier(forced.left, forced.right, forced.bbox);
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
const { added: seamBorders, seams: seamRecords } = completeCrossFeatureBorders(payload);

const priorProvinces = [...europeBundle.provinces, ...asiaBundle.provinces, ...africaBundle.provinces];
const priorIds = new Set(priorProvinces.map((province) => province.id));
const priorKeys = new Set(priorProvinces.map((province) => province.key));
const collisions = payload.provinces.filter(
  (province) => priorIds.has(province.id) || priorKeys.has(province.key),
);
if (collisions.length > 0) {
  throw new Error(
    `Americas province ids/keys collide with Europe, Asia or Africa: ${collisions
      .slice(0, 5)
      .map((province) => province.key)
      .join(", ")}`,
  );
}
if (payload.provinces.some((province) => province.id <= 200260)) {
  throw new Error("Americas province ids must live above the M12c Africa block");
}
const priorFutureIds = new Set(
  [...europeBundle.futurePolities, ...asiaBundle.futurePolities, ...africaBundle.futurePolities].map(
    (polity) => polity.polityId,
  ),
);
for (const polity of payload.futurePolities) {
  if (polity.polityId < 1300 || polity.polityId > 1399) {
    throw new Error(`Americas future polity ${polity.tag} id ${polity.polityId} is outside 1300-1399`);
  }
  if (priorFutureIds.has(polity.polityId)) {
    throw new Error(`Americas future polity ${polity.tag} collides with an earlier polity id`);
  }
}

// Attach plan-level gap diagnostics to the audit and the warning list.
audit.crossFeatureSeamBorders = seamBorders.map((border) => ({
  a: border.a,
  b: border.b,
  lines: border.lines.length,
  kind:
    seamRecords.find((seam) => seam.a === border.a && seam.b === border.b)?.kind ??
    "province-outline",
}));
audit.crossFeatureSeamBorderCount = seamBorders.length;
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
if (plan.unassigned.length > 0) {
  audit.warnings = [
    ...audit.warnings,
    `${plan.unassigned.length} admin-1 units inside an American 1900 feature are not claimed by any province`,
  ].sort();
}
if (plan.claimedElsewhere.length > 0) {
  audit.warnings = [
    ...audit.warnings,
    `${plan.claimedElsewhere.length} province code assignments have a label point outside the province map feature (boundary units)`,
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
 * Generated by scripts/m12d/build-americas-provinces.mjs. Do not edit by hand.
 *
 * Offline M12d American province geometry and historical metadata. Coordinates
 * are thousandths of a degree, delta encoded. Modern Natural Earth units are
 * internal geometry blocks clipped to the authored M11c 1900 polity polygons.
 * Americas ids start at 300001 and every key is prefixed with am-.
 */
import type { ProvinceMapData } from "../provinceCatalogTypes";

export const PROVINCES_AMERICAS_1900 = (${JSON.stringify(payload)}) as unknown as ProvinceMapData;
`;
mkdirSync(dirname(TS_OUT), { recursive: true });
writeFileSync(TS_OUT, tsSource, "utf8");

console.log(
  `wrote ${OUT} (${(JSON.stringify(payload).length / 1024).toFixed(0)} KiB) provinces=${stats.provinceCount} borderPairs=${payload.borders.length} (shared=${stats.borderCount}, seams=${seamBorders.length}) segments=${stats.segmentCount} unmatched=${stats.unmatchedSegments} duplicateIds=${stats.duplicateIds} unassigned=${plan.unassigned.length} duplicateClaims=${plan.duplicateClaims.length}`,
);
for (const warning of audit.warnings) console.log("warning:", warning);
if (plan.unassigned.length > 0) console.log("unassigned:", plan.unassigned.join(" "));
if (plan.duplicateClaims.length > 0) console.log("duplicateClaims:", plan.duplicateClaims.join(" "));
