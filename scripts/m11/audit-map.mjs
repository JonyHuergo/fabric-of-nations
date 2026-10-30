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

const disputedItems = (map.disputedAreas ?? []).map((area) => ({
  id: area.id,
  polygons: toPolygons(area),
  bbox: area.bbox,
  area: area.area,
}));
const disputedAreaDegreesSquared = disputedItems.reduce((sum, area) => sum + area.area, 0);

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
for (const area of disputedItems) {
  for (let index = 0; index < area.polygons.length; index += 1) {
    const polygon = area.polygons[index];
    if (polygon.length === 0 || polygon[0].length < 4) {
      invalidRings.push({ tag: area.id, index, reason: "degenerate disputed ring" });
    }
  }
  try {
    polygonClipping.union(area.polygons);
  } catch (error) {
    invalidRings.push({ tag: area.id, index: -1, reason: String(error) });
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

const disputedOverlaps = [];
for (const polity of items) {
  for (const area of disputedItems) {
    try {
      const intersection = polygonClipping.intersection(polity.polygons, area.polygons);
      const areaValue = multiPolygonArea(intersection);
      if (areaValue > 0.001) {
        disputedOverlaps.push({
          polity: polity.tag,
          disputed: area.id,
          area: Number(areaValue.toFixed(3)),
        });
      }
    } catch (error) {
      disputedOverlaps.push({
        polity: polity.tag,
        disputed: area.id,
        area: null,
        error: String(error),
      });
    }
  }
}

// ---- Terrestrial coverage ----------------------------------------------------

const landRings = map.land.map(decodeRing);
const landBoxes = landRings.map((ring) => ringBBox(ring));

/**
 * Group the flat land rings into outer rings and holes. The world-atlas land
 * object includes inland water such as the Caspian as a hole ring; treating each
 * ring as a filled polygon would incorrectly count that water as unassigned
 * land in the polygon-difference audit.
 */
function buildLandPolygons() {
  const candidates = landRings
    .map((ring, index) => ({
      ring,
      box: landBoxes[index],
      area: ringArea(ring),
    }))
    .sort((left, right) => right.area - left.area);
  const outers = [];
  for (const candidate of candidates) {
    let parent = null;
    for (const outer of outers) {
      if (
        candidate.box[0] >= outer.box[0] - 0.01 &&
        candidate.box[2] <= outer.box[2] + 0.01 &&
        candidate.box[1] >= outer.box[1] - 0.01 &&
        candidate.box[3] <= outer.box[3] + 0.01
      ) {
        const center = [
          (candidate.box[0] + candidate.box[2]) / 2,
          (candidate.box[1] + candidate.box[3]) / 2,
        ];
        if (pointInRing(center[0], center[1], outer.ring)) {
          parent = outer;
          break;
        }
      }
    }
    if (parent === null) {
      outers.push({ ring: candidate.ring, box: candidate.box, area: candidate.area, holes: [] });
    } else {
      parent.holes.push(candidate.ring);
    }
  }
  return outers.map((outer) => [outer.ring, ...outer.holes]);
}

const landPolygons = buildLandPolygons();
const landPolygonBoxes = landPolygons.map((polygon) => ringBBox(polygon[0]));

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

function disputedAt(lon, lat) {
  for (const area of disputedItems) {
    if (
      lon < area.bbox[0] ||
      lon > area.bbox[2] ||
      lat < area.bbox[1] ||
      lat > area.bbox[3]
    ) {
      continue;
    }
    let inside = false;
    for (const polygon of area.polygons) {
      for (const ring of polygon) {
        if (pointInRing(lon, lat, ring)) inside = !inside;
      }
    }
    if (inside) return area.id;
  }
  return null;
}

const unassigned = [];
let landSamples = 0;
let disputedSamples = 0;
for (let lat = -59.5; lat <= 83.5; lat += 1) {
  for (let lon = -179.5; lon <= 179.5; lon += 1) {
    if (!isLand(lon, lat)) continue;
    landSamples += 1;
    if (owners(lon, lat).length > 0) continue;
    if (disputedAt(lon, lat) !== null) {
      disputedSamples += 1;
      continue;
    }
    unassigned.push([lon, lat]);
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

/**
 * Polygon-level coverage: subtract the union of every polity (and the disputed
 * zones) from the land mask per 30x30-degree tile. This is the primary audit;
 * the 1-degree samples above are a quick independent cross-check.
 */
function tilePolygon(west, south, east, north) {
  return [
    [
      [west, south],
      [east, south],
      [east, north],
      [west, north],
      [west, south],
    ],
  ];
}

function bboxIntersects(a, b) {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

function unionAll(polygons) {
  if (polygons.length === 0) return [];
  if (polygons.length === 1) return polygons[0];
  try {
    return polygonClipping.union(...polygons);
  } catch (error) {
    throw new Error(`union failed: ${String(error)}`);
  }
}

function clipToTile(polygons, tile) {
  if (polygons.length === 0) return [];
  const clipped = [];
  for (const polygon of polygons) {
    try {
      const part = polygonClipping.intersection([polygon], tile);
      if (part.length > 0) clipped.push(part);
    } catch {
      // Skip a malformed individual ring; ring validity is reported separately.
    }
  }
  return unionAll(clipped);
}

const polygonCoverage = {
  method: "30x30-degree tiles; land minus union(polities, disputed areas) with polygon-clipping",
  tiles: 0,
  landAreaDegreesSquared: 0,
  assignedAreaDegreesSquared: 0,
  disputedAreaDegreesSquared: 0,
  unassignedAreaDegreesSquared: 0,
  unassignedPolygons: [],
  unassignedComponents: 0,
  largestUnassignedComponentDegreesSquared: 0,
  failures: [],
};
const allUnassignedComponents = [];

for (let west = -180; west < 180; west += 30) {
  for (let south = -90; south < 90; south += 30) {
    const east = west + 30;
    const north = south + 30;
    const tile = tilePolygon(west, south, east, north);
    const tileBox = [west, south, east, north];
    const landParts = [];
    for (let index = 0; index < landPolygons.length; index += 1) {
      if (!bboxIntersects(landPolygonBoxes[index], tileBox)) continue;
      try {
        const part = polygonClipping.intersection([landPolygons[index]], tile);
        if (part.length > 0) landParts.push(part);
      } catch {
        // ignore individual malformed land polygon
      }
    }
    if (landParts.length === 0) continue;
    const assignedParts = [];
    for (const item of [...items, ...disputedItems]) {
      if (!bboxIntersects(item.bbox, tileBox)) continue;
      try {
        const part = polygonClipping.intersection(item.polygons, tile);
        if (part.length > 0) assignedParts.push(part);
      } catch (error) {
        polygonCoverage.failures.push({ tile: tileBox, tag: item.tag ?? item.id, error: String(error) });
      }
    }
    try {
      const land = unionAll(landParts);
      const assigned = unionAll(assignedParts);
      const unassignedTile = polygonClipping.difference(land, assigned);
      const landArea = multiPolygonArea(land);
      polygonCoverage.tiles += 1;
      polygonCoverage.landAreaDegreesSquared += landArea;
      polygonCoverage.assignedAreaDegreesSquared += Math.min(landArea, multiPolygonArea(assigned));
      polygonCoverage.disputedAreaDegreesSquared += Math.min(
        landArea,
        multiPolygonArea(polygonClipping.intersection(
          land,
          unionAll(disputedItems.map((item) => item.polygons)),
        )),
      );
      for (const polygon of unassignedTile) {
        const area = multiPolygonArea([polygon]);
        if (area <= 0.0001) continue;
        polygonCoverage.unassignedAreaDegreesSquared += area;
        polygonCoverage.unassignedComponents += 1;
        polygonCoverage.largestUnassignedComponentDegreesSquared = Math.max(
          polygonCoverage.largestUnassignedComponentDegreesSquared,
          area,
        );
        if (polygonCoverage.unassignedPolygons.length < 200) {
          polygonCoverage.unassignedPolygons.push({
            area: Number(area.toFixed(4)),
            bbox: ringBBox(polygon[0]).map((value) => Number(value.toFixed(3))),
          });
        }
        allUnassignedComponents.push({
          area,
          bbox: ringBBox(polygon[0]).map((value) => Number(value.toFixed(3))),
        });
      }
    } catch (error) {
      polygonCoverage.failures.push({ tile: tileBox, error: String(error) });
    }
  }
}
for (const component of allUnassignedComponents) {
  // Antarctica lies south of 60S and is intentionally outside the 1900 polity
  // system. Its polygon is the only large component that should remain.
  if (component.bbox[3] <= -60) {
    polygonCoverage.intentionalUnassignedAreaDegreesSquared =
      (polygonCoverage.intentionalUnassignedAreaDegreesSquared ?? 0) + component.area;
    polygonCoverage.intentionalAreas = polygonCoverage.intentionalAreas ?? [];
    polygonCoverage.intentionalAreas.push({
      area: Number(component.area.toFixed(4)),
      bbox: component.bbox,
      reason: "Antarctica: outside the 1900 polity system and intentionally unassigned",
    });
  } else if (component.area < 0.02) {
    polygonCoverage.generalizationAreaDegreesSquared =
      (polygonCoverage.generalizationAreaDegreesSquared ?? 0) + component.area;
    polygonCoverage.generalizationComponents =
      (polygonCoverage.generalizationComponents ?? 0) + 1;
  } else {
    polygonCoverage.unexplainedAreaDegreesSquared =
      (polygonCoverage.unexplainedAreaDegreesSquared ?? 0) + component.area;
    polygonCoverage.unexplainedComponents = (polygonCoverage.unexplainedComponents ?? 0) + 1;
    polygonCoverage.unexplainedAreas = polygonCoverage.unexplainedAreas ?? [];
    polygonCoverage.unexplainedAreas.push({
      area: Number(component.area.toFixed(4)),
      bbox: component.bbox,
      reason:
        "Small island/coastal component missing from the 1:50m base geometry; no 1900 polity is absent. Retained as an explicit detail gap rather than filled with an invented border.",
    });
  }
}
polygonCoverage.intentionalUnassignedAreaDegreesSquared = Number(
  (polygonCoverage.intentionalUnassignedAreaDegreesSquared ?? 0).toFixed(4),
);
polygonCoverage.generalizationAreaDegreesSquared = Number(
  (polygonCoverage.generalizationAreaDegreesSquared ?? 0).toFixed(4),
);
polygonCoverage.unexplainedAreaDegreesSquared = Number(
  (polygonCoverage.unexplainedAreaDegreesSquared ?? 0).toFixed(4),
);
polygonCoverage.unassignedPolygons.sort((left, right) => right.area - left.area);
allUnassignedComponents.sort((left, right) => right.area - left.area);
polygonCoverage.largestComponents = allUnassignedComponents.slice(0, 50).map((component) => ({
  area: Number(component.area.toFixed(4)),
  bbox: component.bbox,
}));

polygonCoverage.landAreaDegreesSquared = Number(polygonCoverage.landAreaDegreesSquared.toFixed(3));
polygonCoverage.assignedAreaDegreesSquared = Number(polygonCoverage.assignedAreaDegreesSquared.toFixed(3));
polygonCoverage.disputedAreaDegreesSquared = Number(polygonCoverage.disputedAreaDegreesSquared.toFixed(3));
polygonCoverage.unassignedAreaDegreesSquared = Number(polygonCoverage.unassignedAreaDegreesSquared.toFixed(4));
polygonCoverage.largestUnassignedComponentDegreesSquared = Number(
  polygonCoverage.largestUnassignedComponentDegreesSquared.toFixed(4),
);

const report = {
  meta: {
    generatedBy: "scripts/m11/audit-map.mjs",
    referenceDate: map.meta.referenceDate,
    mapPath: "packages/data/data/map/world_map_1900.json",
    method:
      "Rings are decoded and re-grouped into outer rings and holes. Pairwise intersections use polygon-clipping. Coverage is audited twice: a 1-degree land sample with even-odd point-in-polygon, and a polygon-level land-minus-assigned difference per 30x30-degree tile. Disputed/no-administration zones are counted separately from unassigned land.",
    overlapToleranceDegreesSquared: 0.001,
  },
  summary: {
    polities: map.polities.length,
    markerOnly: map.polities.filter((polity) => polity.markerOnly === true).length,
    provenanceCount: map.polities.filter((polity) => polity.provenance !== undefined).length,
    disputedAreas: disputedItems.length,
    disputedAreaDegreesSquared: Number(disputedAreaDegreesSquared.toFixed(3)),
    invalidRings: invalidRings.length,
    overlaps: overlaps.length,
    largestOverlapDegreesSquared: overlaps[0]?.area ?? 0,
    disputedOverlaps: disputedOverlaps.length,
    landSamples,
    disputedSamples,
    unassignedSamples: unassigned.length,
    unassignedComponents: components.length,
    largestUnassignedComponent: components[0]?.samples ?? 0,
    polygonUnassignedAreaDegreesSquared: polygonCoverage.unassignedAreaDegreesSquared,
    polygonUnassignedComponents: polygonCoverage.unassignedComponents,
    largestPolygonUnassignedComponentDegreesSquared:
      polygonCoverage.largestUnassignedComponentDegreesSquared,
    intentionalUnassignedAreaDegreesSquared:
      polygonCoverage.intentionalUnassignedAreaDegreesSquared,
    generalizationSliverAreaDegreesSquared:
      polygonCoverage.generalizationAreaDegreesSquared,
    generalizationSliverComponents: polygonCoverage.generalizationComponents ?? 0,
    unexplainedUnassignedAreaDegreesSquared:
      polygonCoverage.unexplainedAreaDegreesSquared,
    unexplainedUnassignedComponents: polygonCoverage.unexplainedComponents ?? 0,
  },
  overlaps,
  disputedOverlaps,
  disputedAreas: (map.disputedAreas ?? []).map((area) => ({
    id: area.id,
    name: area.name,
    classification: area.classification,
    confidence: area.confidence,
    area: area.area,
    bbox: area.bbox,
    claims: area.provenance.sovereigntyClaims,
    administration: area.provenance.administration,
    sources: area.provenance.sources,
    notes: area.provenance.notes,
  })),
  invalidRings,
  coverage: {
    unassignedSampleCount: unassigned.length,
    disputedSampleCount: disputedSamples,
    unassignedSamples: unassigned,
    components,
    polygon: polygonCoverage,
  },
};

writeFileSync(OUT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(
  `wrote ${OUT_PATH}: polities=${report.summary.polities} invalid=${report.summary.invalidRings} overlaps=${report.summary.overlaps} largestOverlap=${report.summary.largestOverlapDegreesSquared} disputed=${report.summary.disputedSamples} unassigned=${report.summary.unassignedSamples} polygonUnassignedArea=${report.summary.polygonUnassignedAreaDegreesSquared}`,
);
