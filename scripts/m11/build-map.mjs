/**
 * Build the offline M11 1900 world-map bundle.
 *
 * Sources (downloaded at build time, never at runtime):
 *  - world-atlas@2 countries-50m.json (TopoJSON, ISC licence, derived from
 *    Natural Earth 1:50m, public domain) — topologically shared borders.
 *  - Natural Earth 1:50m admin-0 countries GeoJSON (public domain) — the
 *    ADM0_A3 <-> ISO numeric crosswalk and label points.
 *  - Natural Earth 1:50m admin-1 provinces GeoJSON (public domain) — the
 *    South African province split for the 1900 Cape/Natal/Transvaal/OFS border.
 *
 * Output: packages/app/src/generated/worldMap1900.ts
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
const CATALOG_PATH = resolve(ROOT, "packages/data/data/historical/m11/polities_1900.json");

const SOURCES = {
  topology: {
    file: "world-atlas-50m.json",
    url: "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json",
  },
  admin0: {
    file: "ne_50m_admin_0_countries.geojson",
    url: "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson",
  },
  admin1: {
    file: "ne_50m_admin_1_states_provinces.geojson",
    url: "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_1_states_provinces.geojson",
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
const topology = loadCached(SOURCES.topology);
const admin0 = loadCached(SOURCES.admin0);
const admin1 = loadCached(SOURCES.admin1);
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
  const { ADM0_A3, ISO_N3, UN_A3, NAME } = feature.properties;
  if (ISO_N3 !== undefined && String(ISO_N3) !== "-99" && String(ISO_N3) !== "-099") {
    isoToA3.set(String(Number(ISO_N3)), ADM0_A3);
  }
  if (UN_A3 !== undefined && String(UN_A3) !== "-99" && String(UN_A3) !== "-099") {
    isoToA3.set(String(Number(UN_A3)), ADM0_A3);
  }
  void NAME;
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
  if (geometry.properties?.name !== undefined) topoByName.set(normalizeName(geometry.properties.name), geometry);
}
function normalizeName(name) {
  return name
    .toLowerCase()
    .replaceAll("&", "and")
    .replace(/[^a-z0-9]+/g, "");
}

const a3ByAtlasId = new Map();
for (const [id, geometry] of topoById) {
  const a3 = isoToA3.get(id);
  if (a3 !== undefined) a3ByAtlasId.set(id, a3);
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

const SPLIT_PROVINCES = new Map([
  ["ZA-NC", "CAP"], ["ZA-WC", "CAP"], ["ZA-EC", "CAP"],
  ["ZA-NL", "NAT"],
  ["ZA-FS", "ORF"],
  ["ZA-GT", "ZAR"], ["ZA-NW", "ZAR"], ["ZA-MP", "ZAR"], ["ZA-LP", "ZAR"],
]);
const ADMIN1_CODES = new Set(SPLIT_PROVINCES.keys());

/** Assign every catalog geometry key to a polity tag. */
const polityGeometries = new Map(); // tag -> { adm0: string[], adm1: string[] }
const excludedCodes = new Set(["ZAF"]); // replaced by the province split
for (const entry of [...catalog.states, ...catalog.territories]) {
  const record = { adm0: [], adm1: [] };
  for (const code of entry.geometry) {
    if (code.startsWith("adm1:")) {
      const province = code.slice(5);
      if (!ADMIN1_CODES.has(province)) throw new Error(`unknown admin-1 code ${province}`);
      record.adm1.push(province);
    } else {
      if (excludedCodes.has(code)) continue;
      record.adm0.push(code);
    }
  }
  polityGeometries.set(entry.tag, record);
}

// ---- Raw geometry extraction -------------------------------------------------

/** Collect polygons (outer ring plus holes) for one ADM0 code. */
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

/**
 * Exact union of several polygons. Natural Earth's modern units are generalized
 * independently, so their borders are not topologically shared; dissolving with
 * a sweep-line union is the only way to obtain a clean 1900 polity outline.
 */
function unionPolygons(polygons) {
  if (polygons.length === 0) return [];
  if (polygons.length === 1) return polygons;
  try {
    return polygonClipping.union(polygons);
  } catch (error) {
    warnings.push(`union fell back to unmerged polygons: ${String(error)}`);
    return polygons;
  }
}

/** Collect, union and hole-filter the rings for one set of source polygons. */
function dissolvedRings(polygons) {
  const union = unionPolygons(polygons);
  const rings = [];
  for (const polygon of union) {
    for (let index = 0; index < polygon.length; index += 1) {
      const ring = polygon[index];
      // The first ring is the outer boundary; later rings are holes. Drop tiny
      // sliver holes caused by independently generalized source borders.
      if (index > 0 && ringArea(ring) < 0.05) continue;
      if (ring.length >= 4) rings.push({ ring, hole: index > 0 });
    }
  }
  return rings;
}

/** Collect admin-1 province polygons from the NE GeoJSON (not topological). */
/** Shift an unwrapped ring so its mean longitude lies in [-180, 180]. */
function normalizeWindow(points) {
  if (points.length === 0) return points;
  let sum = 0;
  for (const point of points) sum += point[0];
  const mean = sum / points.length;
  const shift = Math.round(mean / 360) * 360;
  return points.map(([lon, lat]) => [lon - shift, lat]);
}

function provincePolygons(provinceCode) {
  const feature = admin1.features.find(
    (candidate) => candidate.properties.iso_3166_2 === provinceCode,
  );
  if (feature === undefined) throw new Error(`missing province ${provinceCode}`);
  const polygons = [];
  const geometry = feature.geometry;
  const list = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  for (const polygon of list) {
    for (const ring of polygon) {
      polygons.push([ring.map(([lon, lat]) => [lon, lat])]);
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
  // Split into two halves so a closed ring keeps its shape.
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

/**
 * Unwrap a ring at the antimeridian so consecutive longitudes never jump more
 * than 180 degrees. The renderer draws each ring at -360/0/+360 offsets, which
 * keeps multipolygons that straddle the seam (Russia, Fiji, Antarctica) intact.
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

function decodeRing(flat) {
  const points = [];
  let x = 0;
  let y = 0;
  for (let i = 0; i < flat.length; i += 2) {
    x += flat[i];
    y += flat[i + 1];
    points.push([x / 1000, y / 1000]);
  }
  return points;
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

const TOLERANCE = 0.02;
const polities = [];
const warnings = [];
let totalPoints = 0;
const missing = [];

for (const entry of [...catalog.states, ...catalog.territories]) {
  if (entry.markerOnly === true) {
    polities.push({
      tag: entry.tag,
      kind: entry.kind,
      rings: [],
      area: 0,
      bbox: [0, 0, 0, 0],
      label: [entry.capital.lon, entry.capital.lat],
      small: true,
      markerOnly: true,
      approximate: "marker-only approximation; historical 1900 boundary not separately polygonized",
    });
    continue;
  }
  const record = polityGeometries.get(entry.tag);
  const rings = [];
  const holes = [];
  if (record.adm0.length > 0) {
    const sourcePolygons = record.adm0.flatMap((code) => polygonsForCode(code) ?? []);
    for (const entryRing of dissolvedRings(sourcePolygons)) {
      const simplified = unwrapRing(simplifyRing(entryRing.ring, TOLERANCE));
      if (simplified.length >= 4) {
        if (entryRing.hole) holes.push(rings.length);
        rings.push(simplified);
      }
    }
  }
  if (record.adm1.length > 0) {
    const sourcePolygons = record.adm1.flatMap((province) => provincePolygons(province));
    for (const entryRing of dissolvedRings(sourcePolygons)) {
      const simplified = unwrapRing(simplifyRing(entryRing.ring, TOLERANCE));
      if (simplified.length >= 4) {
        if (entryRing.hole) holes.push(rings.length);
        rings.push(simplified);
      }
    }
  }
  if (rings.length === 0) {
    missing.push(entry.tag);
  }
  let totalArea = 0;
  let bbox = [Infinity, Infinity, -Infinity, -Infinity];
  for (const ring of rings) {
    totalArea += ringArea(ring);
    const candidate = ringBBox(ring);
    bbox = [
      Math.min(bbox[0], candidate[0]),
      Math.min(bbox[1], candidate[1]),
      Math.max(bbox[2], candidate[2]),
      Math.max(bbox[3], candidate[3]),
    ];
  }
  totalPoints += rings.reduce((sum, ring) => sum + ring.length, 0);
  const label = labelPointFor(entry.geometry, [entry.capital.lon, entry.capital.lat]);
  polities.push({
    tag: entry.tag,
    kind: entry.kind,
    rings: rings.map(encodeRing),
    holes,
    area: Number(totalArea.toFixed(3)),
    bbox: bbox.map((value) => Number(Number.isFinite(value) ? value.toFixed(3) : 0)),
    label: [Number(label[0].toFixed(3)), Number(label[1].toFixed(3))],
    small: totalArea < 0.5,
    ...(entry.geometry.some((code) => code.startsWith("adm1:"))
      ? { approximate: "admin-1 province approximation" }
      : {}),
  });
}

if (missing.length > 0) {
  throw new Error(`no map geometry for: ${missing.join(", ")}`);
}

/** Land outline for the neutral background (Antarctica and unassigned areas). */
const landRings = [];
for (const polygon of topology.objects.land.arcs ?? []) {
  void polygon;
}
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

const payload = {
  meta: {
    dataset: "world-atlas 2.0.2 countries-50m (Natural Earth 1:50m cultural vectors)",
    topologyLicense: licenseInfo.license ?? "ISC",
    naturalEarthLicense: "Public domain",
    projection: "natural-earth-2",
    quantization: "0.001 degrees, delta encoded",
    simplificationToleranceDegrees: TOLERANCE,
    generatedBy: "scripts/m11/build-map.mjs",
    notes:
      "Modern source units are aggregated into 1900 polities with the catalog crosswalk. Internal modern borders are not drawn. South Africa is split into the four 1900 polities using Natural Earth admin-1 provinces.",
  },
  land: landRings,
  polities,
};

const dataJsonPath = resolve(ROOT, "packages/data/data/map/world_map_1900.json");
mkdirSync(dirname(dataJsonPath), { recursive: true });
writeFileSync(dataJsonPath, `${JSON.stringify(payload)}\n`, "utf8");
writeFileSync(resolve(CACHE, "world-map-1900.json"), JSON.stringify(payload), "utf8");

const source = `/**
 * Generated by scripts/m11/build-map.mjs. Do not edit by hand.
 *
 * Offline 1900 world-map geometry. Coordinates are thousandths of a degree,
 * delta encoded, aggregated from world-atlas 2.0.2 (ISC, Natural Earth public
 * domain) through the authored M11 polity crosswalk.
 */
import type { WorldMapData } from "../worldCatalogTypes";

export const WORLD_MAP_1900 = (${JSON.stringify(payload)}) as unknown as WorldMapData;
`;
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, source, "utf8");
console.log(
  `wrote ${OUT} (${(source.length / 1024).toFixed(0)} KiB) polities=${polities.length} points=${totalPoints} landRings=${landRings.length}`,
);
for (const warning of warnings) console.log("warning:", warning);
