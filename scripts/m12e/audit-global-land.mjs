/**
 * M12e global land-coverage audit.
 *
 * Proves the milestone's hard acceptance criterion: every piece of land on the
 * M11c 1900 map belongs to a province, except Antarctica and a short documented
 * exception list.
 *
 * Method (no global polygon union):
 *  - decode the M11c land mask from `world_map_1900.json`;
 *  - reconstruct the land polygons with their holes. The land topology stores
 *    endorheic seas (the Caspian and similar) as separate rings; a ring whose
 *    representative point lies inside a larger land ring is a water/ice artifact,
 *    not land, and is documented as an exception;
 *  - classify Antarctica as every ring whose maximum latitude is below -60
 *    degrees (the continent, its ice shelves and the South Shetland/South Orkney
 *    islands);
 *  - for every remaining land ring, test representative vertices and a
 *    deterministic interior sample grid against every province with a
 *    bbox-filtered point-in-polygon;
 *  - a sample is "assigned" when it is inside a province or within
 *    COAST_TOLERANCE degrees of a province outline. The tolerance is the
 *    coastline quantization band between the 1:50m land mask (0.04 degree
 *    simplification) and the 1:10m admin-1 provinces (0.02 degree
 *    simplification); it is reported, not hidden;
 *  - report the unassigned area, the covering province of every land ring, every
 *    1900 polity feature without a province, and the admin-1 unit coverage
 *    recorded by the five committed bundle audits.
 *
 * Run: node scripts/m12e/audit-global-land.mjs
 * Writes: packages/data/data/map/global_land_audit.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const MAP_PATH = resolve(ROOT, "packages/data/data/map/world_map_1900.json");
const BUNDLE_FILES = [
  "provinces_1900.json",
  "provinces_asia_1900.json",
  "provinces_africa_1900.json",
  "provinces_americas_1900.json",
  "provinces_oceania_1900.json",
];
const AUDIT_FILES = [
  "provinces_1900_audit.json",
  "provinces_asia_1900_audit.json",
  "provinces_africa_1900_audit.json",
  "provinces_americas_1900_audit.json",
  "provinces_oceania_1900_audit.json",
];
const OUT = resolve(ROOT, "packages/data/data/map/global_land_audit.json");

export const COAST_TOLERANCE = 0.075;
export const ANTARCTIC_MAX_LATITUDE = -60;

// ---- small geometry helpers (same conventions as the build library) --------

function decodeRing(flat) {
  const points = [];
  let x = 0;
  let y = 0;
  for (let index = 0; index < flat.length; index += 2) {
    x += flat[index];
    y += flat[index + 1];
    points.push([x / 1000, y / 1000]);
  }
  return points;
}

function ringArea(points) {
  let area = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    area += points[index][0] * points[index + 1][1] - points[index + 1][0] * points[index][1];
  }
  return Math.abs(area / 2);
}

function polygonBBox(polygons) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (const [x, y] of ring) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return [minX, minY, maxX, maxY];
}

function ringContains(ring, x, y) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function pointInPolygons(point, polygons) {
  for (const polygon of polygons) {
    let insideOuter = false;
    let insideHole = false;
    for (let index = 0; index < polygon.length; index += 1) {
      const ring = polygon[index];
      let ringInside = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if (yi > point[1] !== yj > point[1] && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi) {
          ringInside = !ringInside;
        }
      }
      if (!ringInside) continue;
      if (index === 0) insideOuter = true;
      else insideHole = true;
    }
    if (insideOuter && !insideHole) return true;
  }
  return false;
}

function labelPointFor(ring, fallback) {
  let sumX = 0;
  let sumY = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    sumX += ring[index][0];
    sumY += ring[index][1];
  }
  const count = Math.max(ring.length - 1, 1);
  const candidate = [sumX / count, sumY / count];
  if (ringContains(ring, candidate[0], candidate[1])) return candidate;
  const [minX, minY, maxX, maxY] = polygonBBox([[ring]]);
  const centre = [(minX + maxX) / 2, (minY + maxY) / 2];
  if (ringContains(ring, centre[0], centre[1])) return centre;
  return fallback;
}

function decodeProvincePolygons(province) {
  const rings = province.rings.map(decodeRing);
  const holeSet = new Set(province.holes);
  const outers = [];
  const holes = [];
  for (let index = 0; index < rings.length; index += 1) {
    if (holeSet.has(index)) holes.push(rings[index]);
    else outers.push({ ring: rings[index], holes: [] });
  }
  for (const hole of holes) {
    const holeBBox = polygonBBox([[hole]]);
    let target = null;
    for (const outer of outers) {
      const outerBBox = polygonBBox([[outer.ring]]);
      if (
        holeBBox[0] >= outerBBox[0] - 0.05 &&
        holeBBox[2] <= outerBBox[2] + 0.05 &&
        holeBBox[1] >= outerBBox[1] - 0.05 &&
        holeBBox[3] <= outerBBox[3] + 0.05
      ) {
        target = outer;
        break;
      }
    }
    if (target !== null) target.holes.push(hole);
  }
  return outers.map((outer) => [outer.ring, ...outer.holes]);
}

// ---- load inputs ------------------------------------------------------------

const worldMap = JSON.parse(readFileSync(MAP_PATH, "utf8"));
const bundles = BUNDLE_FILES.map((file) =>
  JSON.parse(readFileSync(resolve(ROOT, "packages/data/data/map", file), "utf8")),
);
const bundleAudits = AUDIT_FILES.map((file) =>
  JSON.parse(readFileSync(resolve(ROOT, "packages/data/data/map", file), "utf8")),
);
for (const [index, bundle] of bundles.entries()) {
  if (!Array.isArray(bundle.provinces) || bundle.provinces.length === 0) {
    throw new Error(`province bundle ${BUNDLE_FILES[index]} is missing or empty`);
  }
}

const provinces = [];
for (const bundle of bundles) {
  for (const province of bundle.provinces) {
    provinces.push({
      id: province.id,
      key: province.key,
      mapTag: province.mapTag,
      ownerTag: province.initialOwnerTag,
      bbox: province.bbox,
      polygons: decodeProvincePolygons(province),
    });
  }
}
const provinceById = new Map(provinces.map((province) => [province.id, province]));

// 1-degree province index for point-in-polygon.
const GRID_CELL = 1;
const provinceGrid = new Map();
for (const province of provinces) {
  const [minX, minY, maxX, maxY] = province.bbox;
  for (let cx = Math.floor(minX / GRID_CELL); cx <= Math.floor(maxX / GRID_CELL); cx += 1) {
    for (let cy = Math.floor(minY / GRID_CELL); cy <= Math.floor(maxY / GRID_CELL); cy += 1) {
      const key = `${cx},${cy}`;
      if (!provinceGrid.has(key)) provinceGrid.set(key, []);
      provinceGrid.get(key).push(province);
    }
  }
}

// 0.25-degree segment index for the coast-tolerance distance.
const SEGMENT_CELL = 0.25;
const segmentGrid = new Map();
for (const province of provinces) {
  for (const polygon of province.polygons) {
    for (const ring of polygon) {
      for (let point = 0; point < ring.length - 1; point += 1) {
        const [x1, y1] = ring[point];
        const [x2, y2] = ring[point + 1];
        if (x1 === x2 && y1 === y2) continue;
        const segment = [x1, y1, x2, y2, province.key];
        const minCx = Math.floor(Math.min(x1, x2) / SEGMENT_CELL);
        const maxCx = Math.floor(Math.max(x1, x2) / SEGMENT_CELL);
        const minCy = Math.floor(Math.min(y1, y2) / SEGMENT_CELL);
        const maxCy = Math.floor(Math.max(y1, y2) / SEGMENT_CELL);
        for (let cx = minCx; cx <= maxCx; cx += 1) {
          for (let cy = minCy; cy <= maxCy; cy += 1) {
            const key = `${cx},${cy}`;
            if (!segmentGrid.has(key)) segmentGrid.set(key, []);
            segmentGrid.get(key).push(segment);
          }
        }
      }
    }
  }
}

function wrapX(x) {
  let value = x;
  while (value > 180) value -= 360;
  while (value < -180) value += 360;
  return value;
}

/**
 * Longitude offsets tested for every point. Province rings may be stored
 * unwrapped around the antimeridian (the Russian Empire feature runs to 190 E),
 * so a point at -179.5 must also be tested as 180.5 and 540.5 - exactly the same
 * three-copy convention the renderer uses.
 */
const ANTIMERIDIAN_OFFSETS = [0, 360, -360];

function provincesAt(x, y) {
  const found = [];
  for (const offset of ANTIMERIDIAN_OFFSETS) {
    const wx = x + offset;
    const list = provinceGrid.get(`${Math.floor(wx / GRID_CELL)},${Math.floor(y / GRID_CELL)}`) ?? [];
    for (const province of list) {
      if (
        wx < province.bbox[0] ||
        wx > province.bbox[2] ||
        y < province.bbox[1] ||
        y > province.bbox[3]
      ) {
        continue;
      }
      if (pointInPolygons([wx, y], province.polygons) && !found.includes(province)) {
        found.push(province);
      }
    }
  }
  return found;
}

function nearestProvince(x, y) {
  let best = Infinity;
  let bestKey = null;
  for (const offset of ANTIMERIDIAN_OFFSETS) {
    const wx = x + offset;
    const cx = Math.floor(wx / SEGMENT_CELL);
    const cy = Math.floor(y / SEGMENT_CELL);
    for (let dx = -2; dx <= 2; dx += 1) {
      for (let dy = -2; dy <= 2; dy += 1) {
        for (const [x1, y1, x2, y2, key] of segmentGrid.get(`${cx + dx},${cy + dy}`) ?? []) {
          const ddx = x2 - x1;
          const ddy = y2 - y1;
          const lengthSquared = ddx * ddx + ddy * ddy;
          let t = lengthSquared === 0 ? 0 : ((wx - x1) * ddx + (y - y1) * ddy) / lengthSquared;
          t = Math.max(0, Math.min(1, t));
          const distance = Math.hypot(x1 + t * ddx - wx, y1 + t * ddy - y);
          if (distance < best) {
            best = distance;
            bestKey = key;
          }
        }
      }
    }
  }
  return { distance: best, key: bestKey };
}

// ---- reconstruct the land mask with holes -----------------------------------

const landRings = worldMap.land.map(decodeRing);
const landBoxes = landRings.map((ring) => polygonBBox([[ring]]));
const landAreas = landRings.map((ring) => ringArea(ring));
const landLabels = landRings.map((ring, index) =>
  labelPointFor(ring, [
    (landBoxes[index][0] + landBoxes[index][2]) / 2,
    (landBoxes[index][1] + landBoxes[index][3]) / 2,
  ]),
);
const waterRings = new Map();
for (let index = 0; index < landRings.length; index += 1) {
  const label = landLabels[index];
  for (let other = 0; other < landRings.length; other += 1) {
    if (other === index || landAreas[other] <= landAreas[index]) continue;
    const box = landBoxes[other];
    if (label[0] < box[0] || label[0] > box[2] || label[1] < box[1] || label[1] > box[3]) continue;
    if (pointInPolygons(label, [[landRings[other]]])) {
      waterRings.set(index, other);
      break;
    }
  }
}
// Holes of each land ring: the water/ice rings whose representative point falls
// inside it. Sampling a land ring must skip its holes (otherwise the Caspian is
// counted as unassigned land in the Afro-Eurasian ring).
const holesByOuter = new Map();
for (const [hole, outer] of waterRings) {
  if (!holesByOuter.has(outer)) holesByOuter.set(outer, []);
  holesByOuter.get(outer).push(landRings[hole]);
}

// ---- audit every land ring ---------------------------------------------------

const ringRows = [];
const exceptionList = [];
let totalLandArea = 0;
let totalUnassignedArea = 0;
let totalBandArea = 0;
let unassignedRingCount = 0;
let assignedRingCount = 0;
let sampleCount = 0;
let coveredSampleCount = 0;
let bandSampleCount = 0;
let unassignedSampleCount = 0;
let vertexCount = 0;
let vertexUnassignedCount = 0;

for (let index = 0; index < landRings.length; index += 1) {
  const ring = landRings[index];
  const bbox = landBoxes[index];
  const area = landAreas[index];
  const maxLatitude = bbox[3];
  const baseRow = {
    ring: index,
    bbox: bbox.map((value) => Number(value.toFixed(3))),
    area: Number(area.toFixed(4)),
    maxLatitude: Number(maxLatitude.toFixed(3)),
  };
  if (maxLatitude < ANTARCTIC_MAX_LATITUDE) {
    exceptionList.push({
      ring: index,
      kind: "antarctica",
      area: Number(area.toFixed(4)),
      reason: `maximum latitude ${maxLatitude.toFixed(2)} is below -60; Antarctica and its ice shelves/islands have no 1900 polity`,
    });
    ringRows.push({ ...baseRow, exception: "antarctica" });
    continue;
  }
  if (waterRings.has(index)) {
    exceptionList.push({
      ring: index,
      kind: "water-hole",
      area: Number(area.toFixed(4)),
      reason: `inner ring of land ring ${String(waterRings.get(index))}; it is an endorheic sea/ice artifact of the land topology, not land`,
    });
    ringRows.push({ ...baseRow, exception: "water-hole" });
    continue;
  }

  totalLandArea += area;
  const holes = holesByOuter.get(index) ?? [];
  const labelHits = provincesAt(wrapX(landLabels[index][0]), landLabels[index][1]);
  const step = Math.max(0.06, Math.min(0.25, Math.sqrt(Math.max(area, 1e-9)) / 8));
  let samples = 0;
  let covered = 0;
  let band = 0;
  let unassigned = 0;
  let maxDistance = 0;
  const unassignedPoints = [];
  const coverKeys = new Set();
  for (let x = bbox[0] + step / 2; x < bbox[2]; x += step) {
    for (let y = bbox[1] + step / 2; y < bbox[3]; y += step) {
      if (!ringContains(ring, x, y)) continue;
      if (holes.some((hole) => ringContains(hole, x, y))) continue;
      samples += 1;
      sampleCount += 1;
      const wx = wrapX(x);
      const hits = provincesAt(wx, y);
      if (hits.length > 0) {
        covered += 1;
        coveredSampleCount += 1;
        for (const hit of hits.slice(0, 8)) coverKeys.add(hit.key);
        continue;
      }
      const near = nearestProvince(wx, y);
      if (near.distance <= COAST_TOLERANCE) {
        band += 1;
        bandSampleCount += 1;
        maxDistance = Math.max(maxDistance, near.distance);
        if (near.key !== null) coverKeys.add(near.key);
        continue;
      }
      unassigned += 1;
      unassignedSampleCount += 1;
      maxDistance = Math.max(maxDistance, Number.isFinite(near.distance) ? near.distance : 99);
      if (unassignedPoints.length < 20) {
        unassignedPoints.push([Number(wx.toFixed(2)), Number(y.toFixed(2)), Number(near.distance.toFixed(3))]);
      }
    }
  }
  // Representative vertices: every 7th vertex, wrapped at the antimeridian.
  let ringVertices = 0;
  let ringVertexUnassigned = 0;
  for (let vertex = 0; vertex < ring.length; vertex += 7) {
    ringVertices += 1;
    vertexCount += 1;
    const wx = wrapX(ring[vertex][0]);
    const y = ring[vertex][1];
    if (provincesAt(wx, y).length > 0) continue;
    if (nearestProvince(wx, y).distance <= COAST_TOLERANCE) continue;
    ringVertexUnassigned += 1;
    vertexUnassignedCount += 1;
  }
  const unassignedArea = samples === 0 ? area : (area * unassigned) / samples;
  const bandArea = samples === 0 ? 0 : (area * band) / samples;
  totalUnassignedArea += unassignedArea;
  totalBandArea += bandArea;
  const assigned = covered + band > 0;
  if (assigned) assignedRingCount += 1;
  else unassignedRingCount += 1;
  const coveringProvince = [...coverKeys].sort()[0] ?? null;
  ringRows.push({
    ...baseRow,
    samples,
    coveredSamples: covered,
    bandSamples: band,
    unassignedSamples: unassigned,
    unassignedArea: Number(unassignedArea.toFixed(5)),
    unassignedPoints,
    maxDistance: Number(maxDistance.toFixed(4)),
    coveringProvince,
    labelCovered: labelHits.length > 0,
    labelCoveringProvince: labelHits.length > 0 ? labelHits[0].key : null,
    representativeVertices: ringVertices,
    unassignedVertices: ringVertexUnassigned,
    exception: null,
  });
}

// ---- feature coverage -------------------------------------------------------

const featureTags = [...new Set(provinces.map((province) => province.mapTag))].sort();
const featureProvinceCounts = {};
for (const province of provinces) {
  featureProvinceCounts[province.mapTag] = (featureProvinceCounts[province.mapTag] ?? 0) + 1;
}
const mapFeatures = worldMap.polities
  .filter((polity) => Array.isArray(polity.rings) && polity.rings.length > 0)
  .map((polity) => polity.tag)
  .sort();
const featuresWithoutProvince = mapFeatures.filter(
  (tag) => featureProvinceCounts[tag] === undefined,
);

// ---- admin-1 unit coverage from the five bundle audits ----------------------

const unitAudit = bundleAudits.map((audit, index) => ({
  bundle: BUNDLE_FILES[index],
  provinceCount: audit.provinceCount,
  duplicateProvinceIds: audit.duplicateProvinceIds,
  duplicateKeys: audit.duplicateKeys,
  unassignedUnitCount: audit.unassignedUnitCount ?? 0,
  unassignedUnits: audit.unassignedUnits ?? [],
  duplicateUnitClaimCount: audit.duplicateUnitClaimCount ?? 0,
  crossPolityUnitAssignmentCount: audit.crossPolityUnitAssignmentCount ?? 0,
}));
const unassignedUnitTotal = unitAudit.reduce((sum, entry) => sum + entry.unassignedUnitCount, 0);
const duplicateUnitClaimTotal = unitAudit.reduce(
  (sum, entry) => sum + entry.duplicateUnitClaimCount,
  0,
);

// ---- result -----------------------------------------------------------------

const result = {
  generatedBy: "scripts/m12e/audit-global-land.mjs",
  referenceDate: "1900-01-01",
  method: {
    landMask: "packages/data/data/map/world_map_1900.json#land",
    sampleStepDegrees: "max(0.06, min(0.25, sqrt(ringArea)/8))",
    coastToleranceDegrees: COAST_TOLERANCE,
    antarcticMaxLatitude: ANTARCTIC_MAX_LATITUDE,
    pointInPolygon: "bbox-filtered, 1-degree province grid; no global polygon union",
    distance: "0.25-degree segment grid, 0.5-degree search radius",
    notes:
      "A land sample is assigned when it is inside a province or within the coastline quantization tolerance of a province outline. The tolerance is the band between the 1:50m land mask (0.04 degree simplification) and the 1:10m admin-1 province geometry (0.02 degree simplification); it is reported separately and is not an exemption for unassigned land.",
  },
  bundles: BUNDLE_FILES,
  provinceCount: provinces.length,
  landRingCount: landRings.length,
  exceptions: {
    antarcticaRingCount: ringRows.filter((row) => row.exception === "antarctica").length,
    waterHoleRingCount: ringRows.filter((row) => row.exception === "water-hole").length,
    list: exceptionList,
  },
  totals: {
    nonAntarcticLandRingCount: ringRows.filter((row) => row.exception === null).length,
    assignedRingCount,
    unassignedRingCount,
    landArea: Number(totalLandArea.toFixed(3)),
    unassignedArea: Number(totalUnassignedArea.toFixed(5)),
    coastlineBandArea: Number(totalBandArea.toFixed(5)),
    sampleCount,
    coveredSampleCount,
    bandSampleCount,
    unassignedSampleCount,
    representativeVertexCount: vertexCount,
    unassignedVertexCount: vertexUnassignedCount,
  },
  features: {
    mapFeatureCount: mapFeatures.length,
    featuresWithProvince: mapFeatures.length - featuresWithoutProvince.length,
    featuresWithoutProvince,
    provinceCountByFeature: featureProvinceCounts,
  },
  admin1Units: {
    bundles: unitAudit,
    unassignedUnitTotal,
    duplicateUnitClaimTotal,
    allUnitsClaimed: unassignedUnitTotal === 0 && duplicateUnitClaimTotal === 0,
  },
  unassignedRings: ringRows.filter((row) => row.exception === null && row.coveredSamples + row.bandSamples === 0),
  rings: ringRows,
};

writeFileSync(OUT, `${JSON.stringify(result, null, 2)}\n`, "utf8");

// ---- console report ---------------------------------------------------------

console.log(`land rings: ${String(landRings.length)}`);
console.log(
  `exceptions: antarctica=${String(result.exceptions.antarcticaRingCount)} water-holes=${String(result.exceptions.waterHoleRingCount)}`,
);
console.log(
  `non-Antarctic land rings: ${String(result.totals.nonAntarcticLandRingCount)} assigned=${String(assignedRingCount)} unassigned=${String(unassignedRingCount)}`,
);
console.log(
  `land area: ${result.totals.landArea.toFixed(2)} sq deg; unassigned area=${result.totals.unassignedArea} sq deg; coastline band=${result.totals.coastlineBandArea} sq deg`,
);
console.log(
  `samples: ${String(sampleCount)} covered=${String(coveredSampleCount)} band=${String(bandSampleCount)} unassigned=${String(unassignedSampleCount)}`,
);
console.log(
  `representative vertices: ${String(vertexCount)} unassigned=${String(vertexUnassignedCount)}`,
);
console.log(
  `map features: ${String(mapFeatures.length)} with a province=${String(mapFeatures.length - featuresWithoutProvince.length)} without=${String(featuresWithoutProvince.length)}`,
);
for (const tag of featuresWithoutProvince) console.log(`  feature without a province: ${tag}`);
console.log(
  `admin-1 units: unassigned=${String(unassignedUnitTotal)} duplicate claims=${String(duplicateUnitClaimTotal)}`,
);
for (const entry of unitAudit) {
  if (entry.unassignedUnitCount > 0) console.log(`  ${entry.bundle}: ${entry.unassignedUnits.join(" ")}`);
}
if (result.unassignedRings.length > 0) {
  console.log(`unassigned land rings: ${String(result.unassignedRings.length)}`);
  for (const row of result.unassignedRings) {
    console.log(`  ring ${String(row.ring)} bbox=${row.bbox.join(",")} area=${row.area}`);
  }
}
const worst = [...ringRows]
  .filter((row) => row.exception === null && row.unassignedSamples > 0)
  .sort((left, right) => right.unassignedSamples - left.unassignedSamples)
  .slice(0, 20);
if (worst.length > 0) {
  console.log("rings with unassigned samples (largest first):");
  for (const row of worst) {
    console.log(
      `  ring ${String(row.ring)} bbox=${row.bbox.join(",")} unassigned=${String(row.unassignedSamples)}/${String(row.samples)} area=${row.unassignedArea} cover=${row.coveringProvince ?? "-"}`,
    );
  }
}
// The full result: every exception and the covering province of every remaining
// land ring. This is the same data written to the JSON artifact.
for (const row of ringRows) {
  if (row.exception !== null) {
    const exception = exceptionList.find((entry) => entry.ring === row.ring);
    console.log(
      `exception ring ${String(row.ring)} kind=${row.exception} area=${row.area} reason=${exception?.reason ?? ""}`,
    );
    continue;
  }
  console.log(
    `ring ${String(row.ring)} cover=${row.coveringProvince ?? "NONE"} area=${row.area} covered=${String(row.coveredSamples)} band=${String(row.bandSamples)} unassigned=${String(row.unassignedSamples)}`,
  );
}
console.log(`wrote ${OUT}`);
