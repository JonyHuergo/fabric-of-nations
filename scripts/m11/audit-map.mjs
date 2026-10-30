/**
 * M11c map audit: invalid rings, political overlaps, and terrestrial coverage.
 *
 * Reads the generated map bundle, reconstructs hole-aware polygons, and writes
 * a deterministic report next to the map. Run after build-map.mjs:
 *
 *   node scripts/m11/audit-map.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import polygonClipping from "polygon-clipping";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const MAP_PATH = resolve(ROOT, "packages/data/data/map/world_map_1900.json");
const OUT_PATH = resolve(ROOT, "packages/data/data/map/world_map_1900_audit.json");

const map = JSON.parse(readFileSync(MAP_PATH, "utf8"));

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

function ringBBox(ring) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}

function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function ringArea(ring) {
  let area = 0;
  for (let i = 0; i + 1 < ring.length; i += 1) {
    area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return Math.abs(area / 2);
}

function multiPolygonArea(polygons) {
  let total = 0;
  for (const polygon of polygons) {
    for (let index = 0; index < polygon.length; index += 1) {
      total += (index === 0 ? 1 : -1) * ringArea(polygon[index]);
    }
  }
  return total;
}

/** Rebuild outer-ring/hole grouping from the flat rings plus hole indices. */
function toPolygons(polity) {
  const rings = polity.rings.map(decodeRing);
  const holeSet = new Set(polity.holes);
  const outers = [];
  const holes = [];
  for (let index = 0; index < rings.length; index += 1) {
    if (holeSet.has(index)) holes.push(rings[index]);
    else outers.push({ ring: rings[index], holes: [] });
  }
  for (const hole of holes) {
    const box = ringBBox(hole);
    let target = null;
    for (const outer of outers) {
      const outerBox = ringBBox(outer.ring);
      if (
        box[0] >= outerBox[0] - 0.05 &&
        box[2] <= outerBox[2] + 0.05 &&
        box[1] >= outerBox[1] - 0.05 &&
        box[3] <= outerBox[3] + 0.05
      ) {
        target = outer;
        break;
      }
    }
    if (target !== null) target.holes.push(hole);
  }
  return outers.map((outer) => [outer.ring, ...outer.holes]);
}

const items = map.polities.map((polity) => ({
  tag: polity.tag,
  polygons: toPolygons(polity),
  bbox: polity.bbox,
  area: polity.area,
}));

// ---- Ring validity -----------------------------------------------------------

const invalidRings = [];
for (const polity of map.polities) {
  for (let index = 0; index < polity.rings.length; index += 1) {
    const flat = polity.rings[index];
    if (flat.length % 2 !== 0) invalidRings.push({ tag: polity.tag, index, reason: "odd flat length" });
    const ring = decodeRing(flat);
    if (ring.length < 4) invalidRings.push({ tag: polity.tag, index, reason: "fewer than four points" });
    if (ring.length > 0) {
      const first = ring[0];
      const last = ring[ring.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) {
        invalidRings.push({ tag: polity.tag, index, reason: "ring not closed" });
      }
    }
    for (const [lon, lat] of ring) {
      if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lat) > 90) {
        invalidRings.push({ tag: polity.tag, index, reason: "non-finite coordinate" });
        break;
      }
    }
  }
  try {
    polygonClipping.union(items.find((item) => item.tag === polity.tag).polygons);
  } catch (error) {
    invalidRings.push({ tag: polity.tag, index: -1, reason: String(error) });
  }
}

// ---- Pairwise overlaps -------------------------------------------------------

const overlaps = [];
for (let i = 0; i < items.length; i += 1) {
  for (let j = i + 1; j < items.length; j += 1) {
    const a = items[i];
    const b = items[j];
    if (
      a.bbox[0] > b.bbox[2] ||
      a.bbox[2] < b.bbox[0] ||
      a.bbox[1] > b.bbox[3] ||
      a.bbox[3] < b.bbox[1]
    ) {
      continue;
    }
    let intersection;
    try {
      intersection = polygonClipping.intersection(a.polygons, b.polygons);
    } catch (error) {
      overlaps.push({ a: a.tag, b: b.tag, area: null, error: String(error) });
      continue;
    }
    const area = multiPolygonArea(intersection);
    if (area > 0.001) overlaps.push({ a: a.tag, b: b.tag, area: Number(area.toFixed(3)) });
  }
}
overlaps.sort((left, right) => (right.area ?? 0) - (left.area ?? 0) || left.a.localeCompare(right.a));

// ---- Terrestrial coverage ----------------------------------------------------

const landRings = map.land.map(decodeRing);
const landBoxes = landRings.map((ring) => ringBBox(ring));

function isLand(lon, lat) {
  let inside = false;
  for (let index = 0; index < landRings.length; index += 1) {
    const box = landBoxes[index];
    if (lon < box[0] || lon > box[2] || lat < box[1] || lat > box[3]) continue;
    if (pointInRing(lon, lat, landRings[index])) inside = !inside;
  }
  return inside;
}

function owners(lon, lat) {
  const result = [];
  for (const item of items) {
    if (
      lon < item.bbox[0] ||
      lon > item.bbox[2] ||
      lat < item.bbox[1] ||
      lat > item.bbox[3]
    ) {
      continue;
    }
    let inside = false;
    for (const polygon of item.polygons) {
      for (const ring of polygon) {
        if (pointInRing(lon, lat, ring)) inside = !inside;
      }
    }
    if (inside) result.push(item.tag);
  }
  return result;
}

const unassigned = [];
let landSamples = 0;
for (let lat = -59.5; lat <= 83.5; lat += 1) {
  for (let lon = -179.5; lon <= 179.5; lon += 1) {
    if (!isLand(lon, lat)) continue;
    landSamples += 1;
    if (owners(lon, lat).length === 0) unassigned.push([lon, lat]);
  }
}

// Connected components of unassigned samples (8-neighbour grid adjacency).
const pending = new Set(unassigned.map(([lon, lat]) => `${lon},${lat}`));
const components = [];
while (pending.size > 0) {
  const start = pending.values().next().value;
  pending.delete(start);
  const [startLon, startLat] = start.split(",").map(Number);
  const queue = [[startLon, startLat]];
  const points = [];
  while (queue.length > 0) {
    const [lon, lat] = queue.pop();
    points.push([lon, lat]);
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        const key = `${lon + dx},${lat + dy}`;
        if (pending.has(key)) {
          pending.delete(key);
          queue.push([lon + dx, lat + dy]);
        }
      }
    }
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [lon, lat] of points) {
    minX = Math.min(minX, lon);
    maxX = Math.max(maxX, lon);
    minY = Math.min(minY, lat);
    maxY = Math.max(maxY, lat);
  }
  components.push({
    samples: points.length,
    bbox: [minX, minY, maxX, maxY],
    sample: points[0],
  });
}
components.sort((left, right) => right.samples - left.samples);

const report = {
  meta: {
    generatedBy: "scripts/m11/audit-map.mjs",
    referenceDate: map.meta.referenceDate,
    mapPath: "packages/data/data/map/world_map_1900.json",
    method:
      "Rings are decoded and re-grouped into outer rings and holes. Pairwise intersections use polygon-clipping; coverage is a 1-degree land sample with even-odd point-in-polygon over the neutral land outline and every polity.",
    overlapToleranceDegreesSquared: 0.001,
  },
  summary: {
    polities: map.polities.length,
    markerOnly: map.polities.filter((polity) => polity.markerOnly === true).length,
    provenanceCount: map.polities.filter((polity) => polity.provenance !== undefined).length,
    invalidRings: invalidRings.length,
    overlaps: overlaps.length,
    largestOverlapDegreesSquared: overlaps[0]?.area ?? 0,
    landSamples,
    unassignedSamples: unassigned.length,
    unassignedComponents: components.length,
    largestUnassignedComponent: components[0]?.samples ?? 0,
  },
  overlaps,
  invalidRings,
  coverage: {
    unassignedSampleCount: unassigned.length,
    unassignedSamples: unassigned,
    components,
  },
};

writeFileSync(OUT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(
  `wrote ${OUT_PATH}: polities=${report.summary.polities} invalid=${report.summary.invalidRings} overlaps=${report.summary.overlaps} largestOverlap=${report.summary.largestOverlapDegreesSquared} unassigned=${report.summary.unassignedSamples} components=${report.summary.unassignedComponents}`,
);
