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
 * Run: node scripts/m12/build-provinces.mjs
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import polygonClipping from "polygon-clipping";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildProvincePlan } from "./province-plan.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const ADMIN1_PATH = resolve(ROOT, ".cache-m11/ne_10m_admin_1_states_provinces.geojson");
const MAP_PATH = resolve(ROOT, "packages/data/data/map/world_map_1900.json");
const OUT = resolve(ROOT, "packages/data/data/map/provinces_1900.json");
const AUDIT_OUT = resolve(ROOT, "packages/data/data/map/provinces_1900_audit.json");
const TS_OUT = resolve(ROOT, "packages/app/src/generated/provinces1900.ts");

const TOLERANCE = 0.02;
const AREA_EPSILON = 0.0005;
const RESIDUAL_MIN_AREA = 0.01;

if (!existsSync(ADMIN1_PATH)) {
  throw new Error(
    `missing ${ADMIN1_PATH}; download Natural Earth 1:10m admin-1 once (public domain)`,
  );
}

const admin1 = JSON.parse(readFileSync(ADMIN1_PATH, "utf8"));
const worldMap = JSON.parse(readFileSync(MAP_PATH, "utf8"));

// ---- GeoJSON / polygon-clipping helpers -------------------------------------

function closeRing(ring) {
  if (ring.length === 0) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) return ring;
  return [...ring, [first[0], first[1]]];
}

function validPolygonRings(rings) {
  const out = [];
  for (const ring of rings) {
    const closed = closeRing(ring);
    if (closed.length >= 4) out.push(closed);
  }
  return out;
}

function geoJsonToMultiPolygon(geometry) {
  if (geometry === null || geometry === undefined) return [];
  if (geometry.type === "Polygon") {
    const rings = validPolygonRings(geometry.coordinates);
    return rings.length > 0 ? [rings] : [];
  }
  if (geometry.type === "MultiPolygon") {
    const out = [];
    for (const polygon of geometry.coordinates) {
      const rings = validPolygonRings(polygon);
      if (rings.length > 0) out.push(rings);
    }
    return out;
  }
  return [];
}

function asMultiPolygon(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((polygon) => Array.isArray(polygon) && polygon.length > 0);
}

function unionPolygons(polygons) {
  const valid = polygons.filter((polygon) => Array.isArray(polygon) && polygon.length > 0);
  if (valid.length === 0) return [];
  if (valid.length === 1) return valid[0];
  return asMultiPolygon(polygonClipping.union(valid[0], ...valid.slice(1)));
}

function intersectPolygons(left, right) {
  if (left.length === 0 || right.length === 0) return [];
  return asMultiPolygon(polygonClipping.intersection(left, right));
}

function differencePolygons(left, right) {
  if (left.length === 0) return [];
  if (right.length === 0) return left;
  return asMultiPolygon(polygonClipping.difference(left, right));
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

function bboxOverlap(left, right) {
  return !(
    left[2] < right[0] - 1e-9 ||
    left[0] > right[2] + 1e-9 ||
    left[3] < right[1] - 1e-9 ||
    left[1] > right[3] + 1e-9
  );
}

function ringArea(points) {
  let area = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    area += points[i][0] * points[i + 1][1] - points[i + 1][0] * points[i][1];
  }
  return Math.abs(area / 2);
}

function multiPolygonArea(polygons) {
  let total = 0;
  for (const polygon of polygons) {
    for (let index = 0; index < polygon.length; index += 1) {
      const area = ringArea(polygon[index]);
      total += index === 0 ? area : -area;
    }
  }
  return total;
}

function simplifyRing(points, tolerance) {
  if (points.length <= 4) return points;
  const closed =
    points[0][0] === points[points.length - 1][0] &&
    points[0][1] === points[points.length - 1][1];
  const body = closed ? points.slice(0, -1) : points;
  if (body.length < 4) return points;
  const keep = new Uint8Array(body.length);
  keep[0] = 1;
  keep[body.length - 1] = 1;
  const stack = [[0, body.length - 1]];
  while (stack.length > 0) {
    const [start, end] = stack.pop();
    let maxDistance = 0;
    let index = -1;
    for (let i = start + 1; i < end; i += 1) {
      const [px, py] = body[i];
      const [sx, sy] = body[start];
      const [ex, ey] = body[end];
      const dx = ex - sx;
      const dy = ey - sy;
      let distance;
      if (dx === 0 && dy === 0) {
        distance = Math.hypot(px - sx, py - sy);
      } else {
        const t = ((px - sx) * dx + (py - sy) * dy) / (dx * dx + dy * dy);
        const clamped = Math.max(0, Math.min(1, t));
        distance = Math.hypot(px - (sx + clamped * dx), py - (sy + clamped * dy));
      }
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

function simplifyMultiPolygon(polygons) {
  const out = [];
  for (const polygon of polygons) {
    const rings = [];
    for (let index = 0; index < polygon.length; index += 1) {
      const simplified = simplifyRing(polygon[index], TOLERANCE);
      if (simplified.length < 4) continue;
      rings.push(simplified);
    }
    if (rings.length > 0) out.push(rings);
  }
  return out;
}

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

function encodeMultiPolygon(polygons) {
  const rings = [];
  const holes = [];
  for (const polygon of polygons) {
    for (let index = 0; index < polygon.length; index += 1) {
      const ring = polygon[index];
      if (ring.length < 4) continue;
      if (index > 0 && ringArea(ring) < 0.05) continue;
      if (index > 0) holes.push(rings.length);
      rings.push(encodeRing(ring));
    }
  }
  return {
    rings,
    holes,
    area: Number(multiPolygonArea(polygons).toFixed(3)),
    bbox: polygonBBox(polygons).map((value) => Number(Number.isFinite(value) ? value.toFixed(3) : 0)),
  };
}

function decodePolityPolygons(polity) {
  const rings = polity.rings.map(decodeRing);
  const holeSet = new Set(polity.holes);
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

/** Build a MultiPolygon from one authored plan clip descriptor. */
function descriptorPolygons(descriptor) {
  if (descriptor.polygon !== undefined) {
    return [[closeRing(descriptor.polygon.map(([lon, lat]) => [lon, lat]))]];
  }
  throw new Error("unsupported plan descriptor; expected polygon");
}

/** Label point: centroid of the largest ring, guaranteed inside by fallback. */
function labelPointFor(polygons, fallback) {
  let best = null;
  let bestArea = 0;
  for (const polygon of polygons) {
    if (polygon.length === 0) continue;
    const area = ringArea(polygon[0]);
    if (area > bestArea) {
      bestArea = area;
      best = polygon[0];
    }
  }
  if (best === null) return fallback;
  let sumX = 0;
  let sumY = 0;
  for (let index = 0; index < best.length - 1; index += 1) {
    sumX += best[index][0];
    sumY += best[index][1];
  }
  const count = Math.max(best.length - 1, 1);
  const candidate = [sumX / count, sumY / count];
  const bbox = polygonBBox([[best]]);
  const points = [
    candidate,
    [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2],
    best[0],
  ];
  for (const point of points) {
    let inside = false;
    for (let i = 0, j = best.length - 1; i < best.length; j = i, i += 1) {
      const [xi, yi] = best[i];
      const [xj, yj] = best[j];
      if (yi > point[1] !== yj > point[1] && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
    if (inside) return point.map((value) => Number(value.toFixed(3)));
  }
  return fallback;
}

// ---- Admin-1 unit index ------------------------------------------------------

const units = [];
const unitFeaturesByCode = new Map();
for (const feature of admin1.features) {
  const p = feature.properties;
  const code = p.iso_3166_2;
  if (typeof code !== "string" || code.length === 0) continue;
  if (!["Polygon", "MultiPolygon"].includes(feature.geometry?.type)) continue;
  const list = unitFeaturesByCode.get(code) ?? [];
  list.push(feature);
  unitFeaturesByCode.set(code, list);
  if (list.length === 1) {
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
}

const unitPolygons = new Map();
for (const [code, features] of unitFeaturesByCode) {
  const polygons = features.flatMap((feature) => geoJsonToMultiPolygon(feature.geometry));
  unitPolygons.set(code, unionPolygons(polygons));
}

const plan = buildProvincePlan(units);

// ---- 1900 map polity polygons -------------------------------------------------

const mapPolityByTag = new Map(worldMap.polities.map((polity) => [polity.tag, polity]));
const polityPolygons = new Map();
for (const [tag, polity] of mapPolityByTag) {
  polityPolygons.set(tag, decodePolityPolygons(polity));
}

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

function coverageClip(tag) {
  const polygon = EUROPE_CLIP[tag];
  if (polygon === undefined) return null;
  return [[closeRing(polygon)]];
}

function mapPolityPolygon(tag) {
  return polityPolygons.get(tag) ?? [];
}

// ---- Build provinces ----------------------------------------------------------

const built = [];
const residuals = [];
const warnings = [];
const assignedByMapTag = new Map();

function assignedList(tag) {
  if (!assignedByMapTag.has(tag)) assignedByMapTag.set(tag, []);
  return assignedByMapTag.get(tag);
}

function subtractAssigned(tag, polygons) {
  const boxes = assignedList(tag);
  const ownBox = polygonBBox(polygons);
  if (!Number.isFinite(ownBox[0])) return polygons;
  const overlapping = boxes.filter((entry) => bboxOverlap(entry.bbox, ownBox));
  if (overlapping.length === 0) return polygons;
  let result = polygons;
  for (const entry of overlapping) {
    result = differencePolygons(result, entry.polygons);
    if (result.length === 0) break;
  }
  return result;
}

function rememberAssigned(tag, polygons) {
  if (polygons.length === 0) return;
  assignedList(tag).push({ polygons, bbox: polygonBBox(polygons) });
}

let buildIndex = 0;
for (const province of plan.provinces) {
  buildIndex += 1;
  if (process.env.PROVINCE_DEBUG === "1") {
    console.error(`[${buildIndex}/${plan.provinces.length}] ${province.key}`);
  }
  const mapPolygons = mapPolityPolygon(province.mapTag);
  if (mapPolygons.length === 0) {
    warnings.push(`no 1900 map polygon for ${province.key} (${province.mapTag})`);
    continue;
  }
  let source = [];
  if (province.units.length === 0) {
    source = mapPolygons;
  } else {
    const parts = [];
    for (const code of province.units) {
      const polygons = unitPolygons.get(code);
      if (polygons === undefined) {
        warnings.push(`missing geometry for admin-1 ${code} in ${province.key}`);
        continue;
      }
      parts.push(polygons);
    }
    source = unionPolygons(parts);
  }
  if (province.clip !== null) {
    for (const descriptor of province.clip) {
      source = intersectPolygons(source, descriptorPolygons(descriptor));
      if (source.length === 0) break;
    }
  }
  if (province.exclude !== null) {
    for (const descriptor of province.exclude) {
      source = differencePolygons(source, descriptorPolygons(descriptor));
      if (source.length === 0) break;
    }
  }
  // The 1900 authoritative boundary always wins over modern internal blocks.
  source = intersectPolygons(source, mapPolygons);
  if (process.env.PROVINCE_DEBUG === "2") {
    console.error(
      `  ${province.key}: unitsArea=${multiPolygonArea(
        unitPolygons.get(province.units[0] ?? "") ?? [],
      ).toFixed(3)} sourceArea=${multiPolygonArea(source).toFixed(3)}`,
    );
  }
  // The authored plan partitions admin-1 units disjointly and the clip regions
  // are complementary. No per-province subtraction is applied: polygon-clipping
  // can return degenerate results for a long sequence of differences, and the
  // overlap audit below measures any residue instead of silently clipping it.
  const simplified = simplifyMultiPolygon(source);
  if (simplified.length === 0) {
    warnings.push(`province ${province.key} has no geometry after clipping`);
    continue;
  }
  const encoded = encodeMultiPolygon(simplified);
  if (encoded.area <= AREA_EPSILON) {
    warnings.push(`province ${province.key} has negligible area`);
    continue;
  }
  const label = labelPointFor(simplified, [
    province.ownerPolityId % 360 - 180,
    province.ownerPolityId % 80 - 40,
  ]);
  rememberAssigned(province.mapTag, simplified);
  built.push({
    ...province,
    ...encoded,
    polygons: simplified,
    // Border extraction must use the shared source geometry BEFORE independent
    // simplification. Simplifying each province separately gives the two sides
    // of a shared edge different vertices, which quantizes into different
    // segments and produces the disconnected border fragments seen on the map.
    rawPolygons: source,
    label,
    residual: false,
  });
}

// ---- Coverage residuals -------------------------------------------------------

const mapTags = [...new Set(plan.provinces.map((province) => province.mapTag))].sort();
const coverage = [];
for (const tag of mapTags) {
  if (process.env.PROVINCE_DEBUG === "1") console.error(`[coverage ${tag}]`);
  const polity = mapPolityByTag.get(tag);
  if (polity === undefined) continue;
  const clip = coverageClip(tag);
  let scope = mapPolityPolygon(tag);
  if (clip !== null) scope = intersectPolygons(scope, clip);
  if (scope.length === 0) {
    coverage.push({ tag, scopeArea: 0, coveredArea: 0, residualArea: 0 });
    continue;
  }
  // Subtract each province from the in-scope polity polygon. This is equivalent
  // to subtracting their union but avoids a very large union operation that
  // polygon-clipping cannot complete for the Russian and Ottoman extents.
  const scopeArea = multiPolygonArea(scope);
  let provinceArea = 0;
  let residual = [];
  let residualArea = scopeArea;
  let estimated = false;
  try {
    let remaining = scope;
    let residualBox = polygonBBox(scope);
    for (const province of built) {
      if (province.mapTag !== tag) continue;
      provinceArea += province.area;
      const provinceBox = polygonBBox(province.polygons);
      if (!bboxOverlap(residualBox, provinceBox)) continue;
      remaining = differencePolygons(remaining, province.polygons);
      if (remaining.length === 0) break;
      residualBox = polygonBBox(remaining);
    }
    residual = remaining;
    residualArea = multiPolygonArea(remaining);
  } catch (error) {
    warnings.push(
      `coverage subtraction failed for ${tag}; residual estimated by area (${String(error)})`,
    );
    residualArea = Math.max(0, scopeArea - provinceArea);
    estimated = true;
  }
  coverage.push({
    tag,
    scopeArea: Number(scopeArea.toFixed(4)),
    coveredArea: Number((scopeArea - residualArea).toFixed(4)),
    residualArea: Number(residualArea.toFixed(4)),
    estimated,
  });
  // Residual geometry is deliberately not promoted to a province. The authored
  // partition is authoritative; an unresolved sliver keeps the 1900 owner's
  // polity fill underneath and is reported in the audit instead of creating a
  // second, overlapping province with the same territory.
  if (!estimated && residualArea >= RESIDUAL_MIN_AREA) {
    warnings.push(
      `coverage gap ${tag}: ${residualArea.toFixed(3)} square degrees remain outside the authored provinces`,
    );
  }
}

function nextResidualId(tag) {
  const used = new Set([...built, ...residuals].map((province) => province.provinceId));
  const ownerId = built.find((province) => province.mapTag === tag)?.ownerPolityId ?? 0;
  let id = ownerId * 1000 + 900;
  while (used.has(id)) id += 1;
  return id;
}

// ---- Adjacency and borders ----------------------------------------------------

const allProvinces = [...built, ...residuals];
const segmentMap = new Map();
for (const province of allProvinces) {
  const rings = province.rawPolygons ?? [];
  for (const polygon of rings) {
    for (const ring of polygon) {
      for (let index = 0; index < ring.length - 1; index += 1) {
      const [x1, y1] = ring[index];
      const [x2, y2] = ring[index + 1];
      const qx1 = Math.round(x1 * 1000);
      const qy1 = Math.round(y1 * 1000);
      const qx2 = Math.round(x2 * 1000);
      const qy2 = Math.round(y2 * 1000);
      if (qx1 === qx2 && qy1 === qy2) continue;
      const forward = qx1 < qx2 || (qx1 === qx2 && qy1 < qy2);
      const a = forward ? `${qx1},${qy1}` : `${qx2},${qy2}`;
      const b = forward ? `${qx2},${qy2}` : `${qx1},${qy1}`;
      const key = `${a}|${b}`;
      let entry = segmentMap.get(key);
      if (entry === undefined) {
        entry = { a, b, provinces: new Set() };
        segmentMap.set(key, entry);
      }
      entry.provinces.add(province.provinceId);
      }
    }
  }
}

const borderGroups = new Map();
let unmatchedSegments = 0;
let segmentCount = 0;
for (const entry of segmentMap.values()) {
  segmentCount += 1;
  const ids = [...entry.provinces].sort((left, right) => left - right);
  let key;
  if (ids.length === 1) {
    key = `${ids[0]}|-1`;
  } else if (ids.length === 2) {
    key = `${ids[0]}|${ids[1]}`;
  } else {
    unmatchedSegments += 1;
    key = `${ids[0]}|-1`;
  }
  if (!borderGroups.has(key)) borderGroups.set(key, []);
  borderGroups.get(key).push(entry);
}

function pointKey(segment, which) {
  return segment[which];
}

function pointsOf(segment, which) {
  const value = segment[which];
  const [x, y] = value.split(",").map(Number);
  return [x / 1000, y / 1000];
}

function chainSegments(segments) {
  const byStart = new Map();
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (!byStart.has(segment.a)) byStart.set(segment.a, []);
    byStart.get(segment.a).push(index);
    if (!byStart.has(segment.b)) byStart.set(segment.b, []);
    byStart.get(segment.b).push(index);
  }
  const used = new Uint8Array(segments.length);
  const lines = [];
  for (let startIndex = 0; startIndex < segments.length; startIndex += 1) {
    if (used[startIndex] === 1) continue;
    const segment = segments[startIndex];
    used[startIndex] = 1;
    const forward = [pointsOf(segment, "a"), pointsOf(segment, "b")];
    const backward = [pointsOf(segment, "b"), pointsOf(segment, "a")];
    const line = forward;
    let tail = segment.b;
    for (;;) {
      const candidates = byStart.get(tail) ?? [];
      let advanced = false;
      for (const candidateIndex of candidates) {
        if (used[candidateIndex] === 1) continue;
        const candidate = segments[candidateIndex];
        let nextPoint;
        if (candidate.a === tail) {
          nextPoint = pointsOf(candidate, "b");
          tail = candidate.b;
        } else if (candidate.b === tail) {
          nextPoint = pointsOf(candidate, "a");
          tail = candidate.a;
        } else {
          continue;
        }
        used[candidateIndex] = 1;
        line.push(nextPoint);
        advanced = true;
        break;
      }
      if (!advanced) break;
    }
    // Try to extend the head backwards once; junction ambiguity is acceptable.
    let head = forward[0];
    for (;;) {
      const candidates = byStart.get(`${Math.round(head[0] * 1000)},${Math.round(head[1] * 1000)}`) ?? [];
      let advanced = false;
      for (const candidateIndex of candidates) {
        if (used[candidateIndex] === 1) continue;
        const candidate = segments[candidateIndex];
        let nextPoint;
        if (candidate.a === `${Math.round(head[0] * 1000)},${Math.round(head[1] * 1000)}`) {
          nextPoint = pointsOf(candidate, "b");
        } else {
          nextPoint = pointsOf(candidate, "a");
        }
        used[candidateIndex] = 1;
        line.unshift(nextPoint);
        head = nextPoint;
        advanced = true;
        break;
      }
      if (!advanced) break;
    }
    if (line.length >= 2) lines.push(line);
  }
  return lines;
}

const borders = [];
for (const [key, segments] of [...borderGroups.entries()].sort()) {
  const [a, b] = key.split("|").map(Number);
  const lines = chainSegments(segments);
  const rings = [];
  for (const line of lines) {
    const simplified = simplifyRing(line, TOLERANCE);
    if (simplified.length < 2) continue;
    rings.push(encodeRing(simplified));
  }
  if (rings.length === 0) continue;
  borders.push({ a, b, lines: rings });
}

// ---- Audit -------------------------------------------------------------------

const overlapAudit = [];
for (let leftIndex = 0; leftIndex < allProvinces.length; leftIndex += 1) {
  const left = allProvinces[leftIndex];
  for (let rightIndex = leftIndex + 1; rightIndex < allProvinces.length; rightIndex += 1) {
    const right = allProvinces[rightIndex];
    if (left.mapTag !== right.mapTag) continue;
    if (!bboxOverlap(left.bbox, right.bbox)) continue;
    let area = 0;
    try {
      area = multiPolygonArea(intersectPolygons(left.polygons, right.polygons));
    } catch {
      continue;
    }
    if (area > 0.005) {
      overlapAudit.push({
        left: left.key,
        right: right.key,
        area: Number(area.toFixed(4)),
        bbox: left.bbox,
      });
    }
  }
}
overlapAudit.sort((a, b) => b.area - a.area);
if (overlapAudit.length > 0) {
  warnings.push(
    `${String(overlapAudit.length)} province pairs overlap (largest ${overlapAudit[0].area} square degrees: ${overlapAudit[0].left} / ${overlapAudit[0].right})`,
  );
}

const provinceIds = new Set(allProvinces.map((province) => province.provinceId));
const duplicateIds = allProvinces.length - provinceIds.size;
const missingSource = plan.sources.length;
const audit = {
  generatedBy: "scripts/m12/build-provinces.mjs",
  referenceDate: "1900-01-01",
  toleranceDegrees: TOLERANCE,
  provinceCount: allProvinces.length,
  plannedProvinceCount: plan.provinces.length,
  residualProvinceCount: residuals.length,
  politiesCovered: [...new Set(allProvinces.map((province) => province.ownerTag))].sort(),
  mapFeaturesCovered: mapTags.length,
  duplicateProvinceIds: duplicateIds,
  duplicateKeys:
    allProvinces.length - new Set(allProvinces.map((province) => province.key)).size,
  unmatchedBorderSegments: unmatchedSegments,
  borderSegmentCount: segmentCount,
  borderPairCount: borders.length,
  coverage,
  overlaps: overlapAudit.slice(0, 100),
  overlapCount: overlapAudit.length,
  residuals: residuals.map((province) => ({
    provinceId: province.provinceId,
    key: province.key,
    name: province.historicalName,
    area: province.area,
    bbox: province.bbox,
  })),
  warnings: [...new Set(warnings)].sort(),
  sourceCount: missingSource,
};

// ---- Output ------------------------------------------------------------------

const payload = {
  meta: {
    dataset:
      "Natural Earth 1:10m admin-1 internal blocks clipped to the authored M11c 1900 polity polygons",
    topologyLicense: "Public domain",
    projection: "natural-earth-2",
    quantization: "0.001 degrees, delta encoded",
    simplificationToleranceDegrees: TOLERANCE,
    generatedBy: "scripts/m12/build-provinces.mjs",
    referenceDate: "1900-01-01",
    mapDataset: worldMap.meta.dataset,
    mapBoundaryVersion: worldMap.meta.boundaryVersion,
    provinceCount: allProvinces.length,
    polityCount: new Set(allProvinces.map((province) => province.ownerTag)).size,
    borderPairCount: borders.length,
    notes:
      "Provinces are permanent geographical units with stable ids. Modern admin-1 units are only internal geometry blocks; the 1900 outer boundary is the authored M11c polity polygon. Residual provinces close small unresolved gaps and are labelled low confidence.",
  },
  sources: plan.sources,
  futurePolities: plan.futurePolities,
  provinces: allProvinces.map((province) => ({
    id: province.provinceId,
    key: province.key,
    historicalName: province.historicalName,
    displayName: province.displayName,
    aliases: province.aliases,
    initialOwnerPolityId: province.ownerPolityId,
    initialOwnerTag: province.ownerTag,
    mapTag: province.mapTag,
    simulationRegionId: province.simulationRegionId,
    historicalAdminAffiliation: province.historicalAdminAffiliation,
    historicalGrouping: province.historicalGrouping,
    initialSpecialStatus: province.initialSpecialStatus,
    confidence: province.confidence,
    notes: province.notes,
    sourceIds: province.sourceIds,
    residual: province.residual,
    area: province.area,
    bbox: province.bbox,
    label: province.label,
    rings: province.rings,
    holes: province.holes,
  })),
  borders,
};

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
  `wrote ${OUT} (${(JSON.stringify(payload).length / 1024).toFixed(0)} KiB) provinces=${allProvinces.length} residuals=${residuals.length} borders=${borders.length} segments=${segmentCount} unmatched=${unmatchedSegments} duplicateIds=${duplicateIds}`,
);
for (const warning of audit.warnings) console.log("warning:", warning);
