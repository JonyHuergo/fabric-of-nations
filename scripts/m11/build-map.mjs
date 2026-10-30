/**
 * Build the offline M11c 1900 world-map bundle.
 *
 * Sources (downloaded at build time, never at runtime):
 *  - world-atlas@2 countries-50m.json (TopoJSON, ISC licence, derived from
 *    Natural Earth 1:50m, public domain) — topologically shared base borders.
 *  - Natural Earth 1:50m admin-0 countries GeoJSON (public domain) — the
 *    ADM0_A3 <-> ISO numeric crosswalk, labels and selected base units.
 *  - Natural Earth 1:10m admin-1 states/provinces GeoJSON (public domain) —
 *    reconstruction blocks for historical provinces and South Africa.
 *  - Natural Earth 1:10m admin-0 countries GeoJSON (public domain) — small
 *    island additions and clipping.
 *  - packages/data/data/historical/m11/boundaries_1900.json — the authored,
 *    sourced historical transfers and per-polity provenance.
 *
 * Output: packages/data/data/map/world_map_1900.json
 *         packages/app/src/generated/worldMap1900.ts
 *
 * Run: node scripts/m11/build-map.mjs
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import polygonClipping from "polygon-clipping";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const CACHE = resolve(ROOT, ".cache-m11");
const OUT = resolve(ROOT, "packages/app/src/generated/worldMap1900.ts");
const DATA_OUT = resolve(ROOT, "packages/data/data/map/world_map_1900.json");
const CATALOG_PATH = resolve(ROOT, "packages/data/data/historical/m11/polities_1900.json");
const BOUNDARIES_PATH = resolve(
  ROOT,
  "packages/data/data/historical/m11/boundaries_1900.json",
);

const SOURCES = {
  topology: {
    file: "world-atlas-50m.json",
    url: "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json",
  },
  admin0: {
    file: "ne_50m_admin_0_countries.geojson",
    url: "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson",
  },
  admin1_10m: {
    file: "ne_10m_admin_1_states_provinces.geojson",
    url: "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson",
  },
  admin0_10m: {
    file: "ne_10m_admin_0_countries.geojson",
    url: "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries.geojson",
  },
  license: {
    file: "world-atlas-package.json",
    url: "https://registry.npmjs.org/world-atlas/2.0.2",
  },
};

function loadCached(entry) {
  const path = resolve(CACHE, entry.file);
  if (!existsSync(path)) {
    throw new Error(
      `missing ${entry.file}; download it once with:\n  curl -sSL -o ${path} ${entry.url}`,
    );
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

const catalog = JSON.parse(readFileSync(CATALOG_PATH, "utf8"));
const boundaryData = JSON.parse(readFileSync(BOUNDARIES_PATH, "utf8"));
const topology = loadCached(SOURCES.topology);
const admin0 = loadCached(SOURCES.admin0);
const admin1 = loadCached(SOURCES.admin1_10m);
const admin0_10m = loadCached(SOURCES.admin0_10m);
const licenseInfo = loadCached(SOURCES.license);

/** Decode every quantized TopoJSON arc into [lon, lat] pairs. */
function decodeArcs(topo) {
  const { scale, translate } = topo.transform;
  const arcs = [];
  for (const arc of topo.arcs) {
    let x = 0;
    let y = 0;
    const points = [];
    for (const [dx, dy] of arc) {
      x += dx;
      y += dy;
      points.push([x * scale[0] + translate[0], y * scale[1] + translate[1]]);
    }
    arcs.push(points);
  }
  return arcs;
}
const arcs = decodeArcs(topology);

/** Map world-atlas feature ids (ISO numeric) to Natural Earth ADM0_A3. */
const admin0ByCode = new Map(admin0.features.map((f) => [f.properties.ADM0_A3, f]));
const isoToA3 = new Map();
for (const feature of admin0.features) {
  const { ADM0_A3, ISO_N3, UN_A3 } = feature.properties;
  if (ISO_N3 !== undefined && String(ISO_N3) !== "-99" && String(ISO_N3) !== "-099") {
    isoToA3.set(String(Number(ISO_N3)), ADM0_A3);
  }
  if (UN_A3 !== undefined && String(UN_A3) !== "-99" && String(UN_A3) !== "-099") {
    isoToA3.set(String(Number(UN_A3)), ADM0_A3);
  }
}

const topoGeometries = topology.objects.countries.geometries;
const topoById = new Map();
const topoByName = new Map();
for (const geometry of topoGeometries) {
  if (geometry.id !== undefined) {
    const key = String(Number(geometry.id));
    const list = topoById.get(key) ?? [];
    list.push(geometry);
    topoById.set(key, list);
  }
  if (geometry.properties?.name !== undefined) {
    topoByName.set(normalizeName(geometry.properties.name), geometry);
  }
}
function normalizeName(name) {
  return name
    .toLowerCase()
    .replaceAll("&", "and")
    .replace(/[^a-z0-9]+/g, "");
}

/** Find the topology geometry for one ADM0_A3. */
function geometryForCode(code) {
  const feature = admin0ByCode.get(code);
  if (feature === undefined) return null;
  const { ISO_N3, UN_A3, NAME } = feature.properties;
  const wanted = normalizeName(NAME);
  for (const candidate of [ISO_N3, UN_A3]) {
    if (candidate === undefined) continue;
    const id = String(Number(candidate));
    if (id === "NaN") continue;
    const list = topoById.get(id) ?? [];
    const exact = list.find(
      (geometry) => normalizeName(geometry.properties?.name ?? "") === wanted,
    );
    if (exact !== undefined) return exact;
  }
  const byName = topoByName.get(wanted);
  if (byName !== undefined) return byName;
  return (topoById.get(String(Number(ISO_N3))) ?? [])[0] ?? null;
}

/** Extract the arc index lists for one TopoJSON geometry. */
function arcLists(geometry) {
  if (geometry.type === "Polygon") return geometry.arcs;
  if (geometry.type === "MultiPolygon") return geometry.arcs.flat();
  return [];
}

/** Decode one arc index into [lon, lat] points in traversal order. */
function arcPoints(index) {
  if (index >= 0) return arcs[index];
  if (arcs[-index - 1] === undefined) throw new Error(`bad arc ${index}`);
  return [...arcs[-index - 1]].reverse();
}

const ADMIN1_CODES = new Set(
  [...catalog.states, ...catalog.territories].flatMap((entry) =>
    (entry.geometry ?? [])
      .filter((code) => typeof code === "string" && code.startsWith("adm1:"))
      .map((code) => code.slice(5)),
  ),
);
for (const patch of boundaryData.patches) {
  for (const include of patch.include) {
    if (include.adm1 !== undefined) ADMIN1_CODES.add(include.adm1);
  }
}

// ---- Source geometry extraction ---------------------------------------------

/** Shift an unwrapped ring so its mean longitude lies in [-180, 180]. */
function normalizeWindow(points) {
  if (points.length === 0) return points;
  let sum = 0;
  for (const point of points) sum += point[0];
  const mean = sum / points.length;
  const shift = Math.round(mean / 360) * 360;
  return points.map(([lon, lat]) => [lon - shift, lat]);
}

/**
 * Unwrap a ring at the antimeridian so consecutive longitudes never jump more
 * than 180 degrees. The renderer draws each ring at -360/0/+360 offsets.
 */
function unwrapRing(points) {
  if (points.length === 0) return points;
  const output = [[points[0][0], points[0][1]]];
  let lon = points[0][0];
  for (let i = 1; i < points.length; i += 1) {
    let next = points[i][0];
    while (next - lon > 180) next -= 360;
    while (next - lon < -180) next += 360;
    output.push([next, points[i][1]]);
    lon = next;
  }
  return output;
}

function closeRing(points) {
  if (points.length < 3) return points;
  const first = points[0];
  const last = points[points.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) return points;
  return [...points, [first[0], first[1]]];
}

/** Convert a GeoJSON Polygon/MultiPolygon into a polygon-clipping MultiPolygon. */
function geoJsonToPolygons(geometry) {
  if (geometry === null || geometry === undefined) return [];
  if (geometry.type === "Polygon") {
    const polygon = geometry.coordinates.map((ring) => closeRing(ring.map(([lon, lat]) => [lon, lat])));
    return polygon.length > 0 ? [polygon] : [];
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates
      .map((polygon) => polygon.map((ring) => closeRing(ring.map(([lon, lat]) => [lon, lat]))))
      .filter((polygon) => polygon.length > 0);
  }
  return [];
}

/** Collect polygons (outer ring plus holes) for one ADM0 code from 50m topology. */
function polygonsForCode(code) {
  const geometry = geometryForCode(code);
  if (geometry === null) return null;
  const rawPolygons =
    geometry.type === "Polygon" ? [geometry.arcs] : geometry.arcs;
  const polygons = [];
  for (const rawPolygon of rawPolygons) {
    const rings = [];
    for (const arcList of rawPolygon) {
      const ring = [];
      for (const index of arcList) {
        const points = arcPoints(index);
        if (points === undefined || points.length === 0) continue;
        for (let i = ring.length === 0 ? 0 : 1; i < points.length; i += 1) {
          ring.push([points[i][0], points[i][1]]);
        }
      }
      if (ring.length >= 4) rings.push(normalizeWindow(unwrapRing(ring)));
    }
    if (rings.length > 0) polygons.push(rings);
  }
  return polygons;
}

/** All 10m admin-1 features matching one ISO 3166-2 code. */
function admin1Polygons(code) {
  const features = admin1.features.filter(
    (candidate) => candidate.properties.iso_3166_2 === code,
  );
  if (features.length === 0) throw new Error(`missing 10m admin-1 unit ${code}`);
  const polygons = [];
  for (const feature of features) {
    for (const polygon of geoJsonToPolygons(feature.geometry)) {
      polygons.push(polygon);
    }
  }
  return polygons;
}

/** One 10m admin-0 country by ADM0_A3. */
function admin0Polygons10m(code) {
  const feature = admin0_10m.features.find(
    (candidate) => candidate.properties.ADM0_A3 === code,
  );
  if (feature === undefined) throw new Error(`missing 10m admin-0 unit ${code}`);
  return geoJsonToPolygons(feature.geometry);
}

/** Resolve one authored include/clip/subtract descriptor. */
function descriptorPolygons(descriptor) {
  if (descriptor.adm0 !== undefined) return admin0Polygons10m(descriptor.adm0);
  if (descriptor.adm1 !== undefined) return admin1Polygons(descriptor.adm1);
  if (descriptor.polygon !== undefined) {
    return [[closeRing(descriptor.polygon.map(([lon, lat]) => [lon, lat]))]];
  }
  throw new Error(`unknown geometry descriptor ${JSON.stringify(descriptor)}`);
}

/** Normalize polygon-clipping output to a MultiPolygon (array of polygons). */
function asMultiPolygon(geometry) {
  if (!Array.isArray(geometry) || geometry.length === 0) return [];
  // Polygon: [ring, ...] where ring[0] is [x, y]. MultiPolygon: [polygon, ...].
  return typeof geometry[0]?.[0]?.[0] === "number" ? [geometry] : geometry;
}

/** Exact union with a clear fallback warning. */
function unionPolygons(polygons) {
  if (polygons.length === 0) return [];
  try {
    return asMultiPolygon(polygonClipping.union(...polygons));
  } catch (error) {
    warnings.push(`union fell back to unmerged polygons: ${String(error)}`);
    return polygons;
  }
}

function intersectPolygons(left, right) {
  if (left.length === 0 || right.length === 0) return [];
  try {
    return asMultiPolygon(polygonClipping.intersection(left, right));
  } catch (error) {
    throw new Error(`intersection failed: ${String(error)}`);
  }
}

function differencePolygons(left, right) {
  if (left.length === 0 || right.length === 0) return left;
  try {
    return asMultiPolygon(polygonClipping.difference(left, right));
  } catch (error) {
    throw new Error(`difference failed: ${String(error)}`);
  }
}

function shapeFromDescriptors(descriptors) {
  let shape = [];
  for (const descriptor of descriptors) {
    const polygons = descriptorPolygons(descriptor);
    shape = shape.length === 0 ? polygons : unionPolygons([shape, polygons]);
  }
  return shape;
}

// ---- Build the raw authored transfer shapes ---------------------------------

const warnings = [];
const TOLERANCE = 0.02;
const rawPatches = boundaryData.patches.map((patch) => {
  try {
    let shape = shapeFromDescriptors(patch.include);
    if (patch.clip !== undefined) {
      shape = intersectPolygons(shape, shapeFromDescriptors(patch.clip));
    }
    if (patch.subtract !== undefined) {
      shape = differencePolygons(shape, shapeFromDescriptors(patch.subtract));
    }
    if (shape.length === 0) throw new Error("produced empty geometry");
    return { ...patch, rawShape: shape };
  } catch (error) {
    throw new Error(`patch ${patch.id}: ${String(error)}`);
  }
});

/** Add a removal shape's outer rings as holes in the best-matching source polygon. */
function punchHoles(sourcePolygons, removalPolygons) {
  for (const removal of removalPolygons) {
    const hole = removal[0];
    if (hole === undefined || hole.length < 4) continue;
    const holeBox = ringBBox(hole);
    let target = null;
    let best = 0;
    for (const polygon of sourcePolygons) {
      const outerBox = ringBBox(polygon[0]);
      const width = Math.min(outerBox[2], holeBox[2]) - Math.max(outerBox[0], holeBox[0]);
      const height = Math.min(outerBox[3], holeBox[3]) - Math.max(outerBox[1], holeBox[1]);
      const score = width > 0 && height > 0 ? width * height : 0;
      if (score > best) {
        best = score;
        target = polygon;
      }
    }
    if (target === null || best <= 0) continue;
    const exists = target.some(
      (ring, index) =>
        index > 0 &&
        ring.length === hole.length &&
        ring[0][0] === hole[0][0] &&
        ring[0][1] === hole[0][1],
    );
    if (!exists) target.push(hole);
  }
  return sourcePolygons;
}

function applyTransfers(tag, basePolygons) {
  const replaceBase = (patchesTo.get(tag) ?? []).some((patch) => patch.replaceBase === true);
  let polygons = replaceBase ? [] : basePolygons;
  const additions = (patchesTo.get(tag) ?? []).map((patch) => patch.shape);
  if (additions.length > 0) {
    try {
      const merged = unionPolygons([polygons, ...additions]);
      if (multiPolygonArea(merged) > 0) {
        polygons = merged;
      } else {
        throw new Error("union produced zero area");
      }
    } catch (error) {
      warnings.push(`additions on ${tag} fell back to sequential: ${String(error)}`);
      for (const shape of additions) {
        try {
          polygons = unionPolygons([polygons, shape]);
        } catch (inner) {
          warnings.push(`addition on ${tag} skipped: ${String(inner)}`);
        }
      }
    }
  }
  const removals = (patchesFrom.get(tag) ?? []).map((patch) => patch.shape);
  if (removals.length > 0) {
    const removal = unionPolygons(removals);
    try {
      const diff = differencePolygons(polygons, removal);
      if (multiPolygonArea(diff) <= 0) throw new Error("difference produced zero area");
      polygons = diff;
    } catch (error) {
      // One cumulative difference is usually the most robust; fall back to
      // sequential removal. Shapes that still fail are punched in as holes;
      // the source-clipping step guarantees they are subsets of the source.
      let fallback = polygons;
      for (const shape of removals) {
        try {
          fallback = differencePolygons(fallback, shape);
        } catch (inner) {
          fallback = punchHoles(fallback, shape);
          warnings.push(`removal on ${tag} punched as a hole: ${String(inner)}`);
        }
      }
      polygons = fallback;
      warnings.push(`cumulative removal on ${tag} fell back to sequential: ${String(error)}`);
    }
  }
  return polygons;
}

// ---- Simplify and quantize ---------------------------------------------------

function perpendicularDistance(point, start, end) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  if (dx === 0 && dy === 0) return Math.hypot(point[0] - start[0], point[1] - start[1]);
  const t = ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / (dx * dx + dy * dy);
  const clamped = Math.max(0, Math.min(1, t));
  const px = start[0] + clamped * dx;
  const py = start[1] + clamped * dy;
  return Math.hypot(point[0] - px, point[1] - py);
}

function simplifyRing(points, tolerance) {
  if (points.length <= 4) return points;
  const closed =
    points[0][0] === points[points.length - 1][0] &&
    points[0][1] === points[points.length - 1][1];
  const body = closed ? points.slice(0, -1) : points;
  const keep = new Uint8Array(body.length);
  keep[0] = 1;
  keep[body.length - 1] = 1;
  const stack = [[0, body.length - 1]];
  while (stack.length > 0) {
    const [start, end] = stack.pop();
    let maxDistance = 0;
    let index = -1;
    for (let i = start + 1; i < end; i += 1) {
      const distance = perpendicularDistance(body[i], body[start], body[end]);
      if (distance > maxDistance) {
        maxDistance = distance;
        index = i;
      }
    }
    if (index >= 0 && maxDistance > tolerance) {
      keep[index] = 1;
      stack.push([start, index], [index, end]);
    }
  }
  const simplified = [];
  for (let i = 0; i < body.length; i += 1) if (keep[i] === 1) simplified.push(body[i]);
  if (simplified.length < 3) return points;
  simplified.push(simplified[0]);
  return simplified;
}

/** Flat delta encoding in thousandths of a degree. */
function encodeRing(points) {
  const flat = [];
  let previousX = 0;
  let previousY = 0;
  for (const [lon, lat] of points) {
    const x = Math.round(lon * 1000);
    const y = Math.round(lat * 1000);
    flat.push(x - previousX, y - previousY);
    previousX = x;
    previousY = y;
  }
  return flat;
}

function ringBBox(points) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}

function ringArea(points) {
  let area = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    area += points[i][0] * points[i + 1][1] - points[i + 1][0] * points[i][1];
  }
  return Math.abs(area / 2);
}

/** Collect, union and hole-filter the rings for one set of source polygons. */
function dissolvedRings(polygons) {
  const union = unionPolygons(polygons);
  const rings = [];
  for (const polygon of union) {
    for (let index = 0; index < polygon.length; index += 1) {
      const ring = polygon[index];
      if (index > 0 && ringArea(ring) < 0.05) continue;
      if (ring.length >= 4) rings.push({ ring, hole: index > 0 });
    }
  }
  return rings;
}

// ---- Labels ------------------------------------------------------------------

function labelPointFor(codes, fallback) {
  const feature = admin0ByCode.get(codes[0]);
  const label = feature?.properties.LABEL_X;
  const latitude = feature?.properties.LABEL_Y;
  if (typeof label === "number" && typeof latitude === "number") {
    return [label, latitude];
  }
  return fallback;
}

// ---- Build -------------------------------------------------------------------

const polities = [];
const missing = [];
let totalPoints = 0;

const entries = [...catalog.states, ...catalog.territories];
const polygonsByTag = new Map();

const baseByTag = new Map();
for (const entry of entries) {
  const record = { adm0: [], adm1: [] };
  for (const code of entry.geometry ?? []) {
    if (code.startsWith("adm1:")) {
      record.adm1.push(code.slice(5));
    } else {
      record.adm0.push(code);
    }
  }
  const basePolygons = [
    ...record.adm0.flatMap((code) => polygonsForCode(code) ?? []),
    ...record.adm1.flatMap((code) => admin1Polygons(code)),
  ];
  baseByTag.set(entry.tag, basePolygons);
}

/**
 * Clip every transfer to the union of its source polities. This guarantees the
 * destination is a subset of the modern source blocks and makes the
 * subtraction that carves the source clean even where the 1:10m reconstruction
 * unit extends slightly beyond the 1:50m generalized coastline.
 */
const patches = [];
for (const rawPatch of rawPatches) {
  const simplifiedRaw = simplifyMultiPolygon(rawPatch.rawShape);
  let shape = simplifiedRaw;
  if (rawPatch.from.length > 0) {
    const clippedShapes = [];
    for (const fromTag of rawPatch.from) {
      const source = baseByTag.get(fromTag) ?? [];
      if (source.length === 0) continue;
      try {
        const clipped = intersectPolygons(simplifiedRaw, source);
        if (clipped.length > 0) clippedShapes.push(clipped);
      } catch (error) {
        warnings.push(`could not clip ${rawPatch.id} to ${fromTag}: ${String(error)}`);
      }
    }
    shape = clippedShapes.length === 0 ? [] : unionPolygons(clippedShapes);
    if (shape.length === 0) {
      warnings.push(`transfer ${rawPatch.id} has no intersection with its source; skipped`);
      continue;
    }
  }
  patches.push({ ...rawPatch, shape });
}

const patchesTo = new Map();
const patchesFrom = new Map();
for (const patch of patches) {
  if (patch.to !== null) {
    const list = patchesTo.get(patch.to) ?? [];
    list.push(patch);
    patchesTo.set(patch.to, list);
  }
  for (const tag of patch.from) {
    const list = patchesFrom.get(tag) ?? [];
    list.push(patch);
    patchesFrom.set(tag, list);
  }
}
for (const list of patchesTo.values()) list.sort((a, b) => a.id.localeCompare(b.id));
for (const list of patchesFrom.values()) list.sort((a, b) => a.id.localeCompare(b.id));

for (const entry of entries) {
  polygonsByTag.set(entry.tag, applyTransfers(entry.tag, baseByTag.get(entry.tag) ?? []));
}

/**
 * Overlap cleanup. A transfer's destination owns the disputed area. We subtract
 * the destination's geometry *within the transfer's bounding box* (plus the
 * transfer shape itself) from each source. Clipping the destination first keeps
 * the boolean operation local and avoids the robustness failures that occur
 * when a large multi-island territory is subtracted from another large
 * multipolygon.
 */
function polygonsBBox(polygons) {
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

function boxPolygon([minX, minY, maxX, maxY]) {
  return [
    [
      [minX, minY],
      [maxX, minY],
      [maxX, maxY],
      [minX, maxY],
      [minX, minY],
    ],
  ];
}

for (const patch of patches) {
  if (patch.cleanup !== true || patch.to === null) continue;
  const destination = polygonsByTag.get(patch.to);
  if (destination === undefined || destination.length === 0) continue;
  const [minX, minY, maxX, maxY] = polygonsBBox(patch.shape);
  const expanded = boxPolygon([minX - 0.5, minY - 0.5, maxX + 0.5, maxY + 0.5]);
  let destinationWithinBox = [];
  try {
    destinationWithinBox = intersectPolygons(destination, expanded);
  } catch (error) {
    warnings.push(`destination cleanup skipped for ${patch.id}: ${String(error)}`);
    continue;
  }
  if (destinationWithinBox.length === 0) continue;
  for (const fromTag of patch.from) {
    const source = polygonsByTag.get(fromTag);
    if (source === undefined || source.length === 0) continue;
    try {
      polygonsByTag.set(fromTag, differencePolygons(source, destinationWithinBox));
    } catch (error) {
      polygonsByTag.set(fromTag, punchHoles(source, patch.shape));
      warnings.push(
        `destination cleanup failed for ${patch.id} (${fromTag}); punched as holes: ${String(error)}`,
      );
    }
  }
}

/** Signed-area sum for a MultiPolygon; holes subtract from their outer ring. */
function multiPolygonArea(polygons) {
  let total = 0;
  for (const polygon of polygons) {
    for (let index = 0; index < polygon.length; index += 1) {
      const ring = polygon[index];
      let area = 0;
      for (let i = 0; i + 1 < ring.length; i += 1) {
        area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
      }
      total += (index === 0 ? 1 : -1) * Math.abs(area / 2);
    }
  }
  return total;
}

/**
 * Deterministic pairwise overlap resolution. A transfer destination always
 * beats its source; otherwise the smaller (more specific) polity keeps the
 * disputed sliver. The intersection is removed only from the loser, so the
 * winner's fill covers the area and no gap is introduced.
 */
const wins = new Map();
for (const patch of patches) {
  if (patch.to === null) continue;
  for (const fromTag of patch.from) {
    const set = wins.get(patch.to) ?? new Set();
    set.add(fromTag);
    wins.set(patch.to, set);
  }
}

function overlapWinner(a, b) {
  if (wins.get(a.tag)?.has(b.tag) === true) return a;
  if (wins.get(b.tag)?.has(a.tag) === true) return b;
  if (a.area !== b.area) return a.area < b.area ? a : b;
  return a.index < b.index ? a : b;
}

let resolvedOverlaps = 0;
const overlapItems = entries.map((entry, index) => {
  const polygons = polygonsByTag.get(entry.tag) ?? [];
  return {
    tag: entry.tag,
    index,
    polygons,
    area: multiPolygonArea(polygons),
    bbox: polygonsBBox(polygons),
  };
});

for (let pass = 0; pass < 2; pass += 1) {
  for (let i = 0; i < overlapItems.length; i += 1) {
    const a = overlapItems[i];
    for (let j = i + 1; j < overlapItems.length; j += 1) {
      const b = overlapItems[j];
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
        intersection = intersectPolygons(a.polygons, b.polygons);
      } catch {
        continue;
      }
      const area = multiPolygonArea(intersection);
      if (area <= 0.0005) continue;
      const winner = overlapWinner(a, b);
      const loser = winner === a ? b : a;
      try {
        loser.polygons = differencePolygons(loser.polygons, intersection);
        polygonsByTag.set(loser.tag, loser.polygons);
        loser.bbox = polygonsBBox(loser.polygons);
        resolvedOverlaps += 1;
      } catch (error) {
        loser.polygons = punchHoles(loser.polygons, intersection);
        polygonsByTag.set(loser.tag, loser.polygons);
        loser.bbox = polygonsBBox(loser.polygons);
        resolvedOverlaps += 1;
        warnings.push(
          `overlap resolution punched ${a.tag}/${b.tag}: ${String(error)}`,
        );
      }
    }
  }
}

/** Simplify a MultiPolygon while preserving outer-ring/hole grouping. */
function simplifyPolygon(polygon) {
  const outer = unwrapRing(simplifyRing(polygon[0], TOLERANCE));
  if (outer.length < 4 || ringArea(outer) <= 0) return null;
  const holes = [];
  for (let index = 1; index < polygon.length; index += 1) {
    const hole = unwrapRing(simplifyRing(polygon[index], TOLERANCE));
    if (hole.length >= 4 && ringArea(hole) >= 0.05) holes.push(hole);
  }
  return [outer, ...holes];
}

function simplifyMultiPolygon(polygons) {
  return polygons.map(simplifyPolygon).filter((polygon) => polygon !== null);
}

/** Resolve overlaps in a tag -> MultiPolygon map using the same winner rules. */
function resolveOverlapsInMap(polygonMap) {
  const items = entries.map((entry, index) => {
    const polygons = polygonMap.get(entry.tag) ?? [];
    return {
      tag: entry.tag,
      index,
      polygons,
      area: multiPolygonArea(polygons),
      bbox: polygonsBBox(polygons),
    };
  });
  let count = 0;
  for (let pass = 0; pass < 3; pass += 1) {
    for (let i = 0; i < items.length; i += 1) {
      const a = items[i];
      for (let j = i + 1; j < items.length; j += 1) {
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
          intersection = intersectPolygons(a.polygons, b.polygons);
        } catch {
          continue;
        }
        if (multiPolygonArea(intersection) <= 0.00025) continue;
        const winner = overlapWinner(a, b);
        const loser = winner === a ? b : a;
        try {
          loser.polygons = differencePolygons(loser.polygons, intersection);
          polygonMap.set(loser.tag, loser.polygons);
          loser.bbox = polygonsBBox(loser.polygons);
          count += 1;
        } catch (error) {
          loser.polygons = punchHoles(loser.polygons, intersection);
          polygonMap.set(loser.tag, loser.polygons);
          loser.bbox = polygonsBBox(loser.polygons);
          count += 1;
          warnings.push(
            `overlap resolution punched ${a.tag}/${b.tag}: ${String(error)}`,
          );
        }
      }
    }
  }
  return count;
}

const simplifiedByTag = new Map();
for (const entry of entries) {
  const input = polygonsByTag.get(entry.tag) ?? [];
  const simplified = simplifyMultiPolygon(input);
  simplifiedByTag.set(entry.tag, simplified);
}
resolvedOverlaps += resolveOverlapsInMap(simplifiedByTag);

for (const entry of entries) {
  const finalPolygons = simplifiedByTag.get(entry.tag) ?? [];
  const rings = [];
  const holes = [];
  for (const polygon of finalPolygons) {
    for (let index = 0; index < polygon.length; index += 1) {
      const ring = polygon[index];
      if (ring.length < 4) continue;
      if (index > 0) holes.push(rings.length);
      rings.push(ring);
    }
  }
  if (rings.length === 0) {
    if (entry.markerOnly === true) {
      const provenance = boundaryData.provenance[entry.tag];
      polities.push({
        tag: entry.tag,
        kind: entry.kind,
        rings: [],
        holes: [],
        area: 0,
        bbox: [0, 0, 0, 0],
        label: [entry.capital.lon, entry.capital.lat],
        small: true,
        markerOnly: true,
        approximate:
          provenance?.notes ??
          "marker-only approximation; historical 1900 boundary not separately polygonized",
        provenance,
      });
      continue;
    }
    missing.push(entry.tag);
    continue;
  }
  const totalArea = multiPolygonArea(finalPolygons);
  const bbox = polygonsBBox(finalPolygons);
  totalPoints += rings.reduce((sum, ring) => sum + ring.length, 0);
  const label = labelPointFor(entry.geometry, [entry.capital.lon, entry.capital.lat]);
  const provenance = boundaryData.provenance[entry.tag];
  if (provenance === undefined) throw new Error(`missing boundary provenance for ${entry.tag}`);
  polities.push({
    tag: entry.tag,
    kind: entry.kind,
    rings: rings.map(encodeRing),
    holes,
    area: Number(totalArea.toFixed(3)),
    bbox: bbox.map((value) => Number(Number.isFinite(value) ? value.toFixed(3) : 0)),
    label: [Number(label[0].toFixed(3)), Number(label[1].toFixed(3))],
    small: totalArea < 0.5,
    ...(provenance.confidence === "low" ? { approximate: provenance.notes } : {}),
    provenance,
  });
}

if (missing.length > 0) {
  throw new Error(`no map geometry for: ${missing.join(", ")}`);
}

/** Land outline for the neutral background (Antarctica and unassigned areas). */
const landRings = [];
function topologyObjectRings(object) {
  const rings = [];
  const geometries = object.type === "GeometryCollection" ? object.geometries : [object];
  for (const geometry of geometries) {
    const lists = geometry.type === "Polygon" ? geometry.arcs : geometry.arcs.flat();
    for (const arcList of lists) {
      const ring = [];
      for (const index of arcList) {
        const points = arcPoints(index);
        for (let i = ring.length === 0 ? 0 : 1; i < points.length; i += 1) {
          ring.push([points[i][0], points[i][1]]);
        }
      }
      const simplified = unwrapRing(simplifyRing(ring, TOLERANCE * 2));
      if (simplified.length >= 4) rings.push(simplified);
    }
  }
  return rings;
}
for (const ring of topologyObjectRings(topology.objects.land)) {
  if (ringArea(ring) < 0.02) continue;
  landRings.push(encodeRing(ring));
}

const provenanceCount = polities.filter((polity) => polity.provenance !== undefined).length;
const payload = {
  meta: {
    dataset:
      "world-atlas 2.0.2 countries-50m (Natural Earth 1:50m) + Natural Earth 1:10m reconstruction units",
    topologyLicense: licenseInfo.license ?? "ISC",
    naturalEarthLicense: "Public domain",
    projection: "natural-earth-2",
    quantization: "0.001 degrees, delta encoded",
    simplificationToleranceDegrees: TOLERANCE,
    generatedBy: "scripts/m11/build-map.mjs",
    referenceDate: boundaryData.meta.referenceDate,
    boundaryDataset: "historical/m11/boundaries_1900.json",
    boundaryVersion: boundaryData.meta.version,
    provenanceCount,
    transferCount: patches.length,
    resolvedOverlaps,
    notes:
      "Modern source units are only geometry blocks. The authored 1900 transfers in boundaries_1900.json are applied with polygon-clipping; every polity carries boundary provenance, a reference date, a geometry class and a confidence class. Internal modern borders are not drawn. South Africa uses the four 1900 polities with modern province proxies; the Transvaal and Orange Free State are documented approximations.",
  },
  boundarySources: boundaryData.meta.sourceRegistry,
  land: landRings,
  polities,
};

writeFileSync(DATA_OUT, `${JSON.stringify(payload)}\n`, "utf8");
writeFileSync(resolve(CACHE, "world-map-1900.json"), JSON.stringify(payload), "utf8");

const source = `/**
 * Generated by scripts/m11/build-map.mjs. Do not edit by hand.
 *
 * Offline 1900 world-map geometry. Coordinates are thousandths of a degree,
 * delta encoded. Modern units from world-atlas 2.0.2 / Natural Earth
 * (ISC / public domain) are rebuilt through the authored M11c 1900 transfers.
 * Every polity entry carries its boundary provenance and confidence.
 */
import type { WorldMapData } from "../worldCatalogTypes";

export const WORLD_MAP_1900 = (${JSON.stringify(payload)}) as unknown as WorldMapData;
`;
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, source, "utf8");
console.log(
  `wrote ${DATA_OUT} (${(source.length / 1024).toFixed(0)} KiB) polities=${polities.length} points=${totalPoints} landRings=${landRings.length} transfers=${patches.length}`,
);
for (const warning of new Set(warnings)) console.log("warning:", warning);
