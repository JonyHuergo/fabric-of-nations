/**
 * Shared deterministic geometry pipeline for the M12 provincial bundles.
 *
 * Extracted from `scripts/m12/build-provinces.mjs` (M12a Europe) so the M12b Asia
 * build reuses exactly the same topology, simplification, overlap resolution,
 * border extraction and audit rules. The pipeline is data-driven:
 *
 *  - `plan` supplies the authored historical inventory and stable province ids;
 *  - Natural Earth 1:10m admin-1 units are only internal geometry blocks;
 *  - the authored M11c 1900 polity polygons supply the outer boundary;
 *  - provinces of an already committed bundle can be seeded as higher-priority
 *    geometry so a later continent cannot paint a foreign-coloured sliver across
 *    an earlier frontier.
 *
 * No file is written here; the thin per-milestone scripts own their output paths.
 */
import polygonClipping from "polygon-clipping";

export const TOLERANCE = 0.02;
export const AREA_EPSILON = 0.0005;
export const RESIDUAL_MIN_AREA = 0.01;
// Gap provinces (M12e) are coverage geometry, not reviewed frontiers. They are
// simplified far less than a normal province so a residual sliver cannot be
// expanded across the frontier it is supposed to close.
export const GAP_TOLERANCE = 0.004;

// ---- GeoJSON / polygon-clipping helpers -------------------------------------

export function closeRing(ring) {
  if (ring.length === 0) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) return ring;
  return [...ring, [first[0], first[1]]];
}

export function validPolygonRings(rings) {
  const out = [];
  for (const ring of rings) {
    const closed = closeRing(ring);
    if (closed.length >= 4) out.push(closed);
  }
  return out;
}

export function geoJsonToMultiPolygon(geometry) {
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

export function asMultiPolygon(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((polygon) => Array.isArray(polygon) && polygon.length > 0);
}

export function unionPolygons(polygons) {
  const valid = polygons.filter((polygon) => Array.isArray(polygon) && polygon.length > 0);
  if (valid.length === 0) return [];
  if (valid.length === 1) {
    // A single input may already be a MultiPolygon or a bare Polygon. Normalise
    // to a MultiPolygon so every caller (bbox, area, difference) sees one shape.
    const single = valid[0];
    const isMulti = Array.isArray(single[0]) && Array.isArray(single[0][0]) && Array.isArray(single[0][0][0]);
    return isMulti ? single : [single];
  }
  return asMultiPolygon(polygonClipping.union(valid[0], ...valid.slice(1)));
}

export function intersectPolygons(left, right) {
  if (left.length === 0 || right.length === 0) return [];
  return asMultiPolygon(polygonClipping.intersection(left, right));
}

export function differencePolygons(left, right) {
  if (left.length === 0) return [];
  if (right.length === 0) return left;
  return asMultiPolygon(polygonClipping.difference(left, right));
}

export function polygonBBox(polygons) {
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

export function bboxOverlap(left, right) {
  return !(
    left[2] < right[0] - 1e-9 ||
    left[0] > right[2] + 1e-9 ||
    left[3] < right[1] - 1e-9 ||
    left[1] > right[3] + 1e-9
  );
}

export function ringArea(points) {
  let area = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    area += points[i][0] * points[i + 1][1] - points[i + 1][0] * points[i][1];
  }
  return Math.abs(area / 2);
}

export function multiPolygonArea(polygons) {
  let total = 0;
  for (const polygon of polygons) {
    for (let index = 0; index < polygon.length; index += 1) {
      const area = ringArea(polygon[index]);
      total += index === 0 ? area : -area;
    }
  }
  return total;
}

export function simplifyRing(points, tolerance = TOLERANCE) {
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

export function simplifyMultiPolygon(polygons, tolerance = TOLERANCE) {
  const out = [];
  for (const polygon of polygons) {
    const rings = [];
    for (let index = 0; index < polygon.length; index += 1) {
      const simplified = simplifyRing(polygon[index], tolerance);
      if (simplified.length < 4) continue;
      rings.push(simplified);
    }
    if (rings.length > 0) out.push(rings);
  }
  return out;
}

export function encodeRing(points) {
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

export function decodeRing(flat) {
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

export function encodeMultiPolygon(polygons) {
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
    area: Number(multiPolygonArea(polygons).toFixed(6)),
    bbox: polygonBBox(polygons).map((value) => Number(Number.isFinite(value) ? value.toFixed(3) : 0)),
  };
}

/** Decode a committed bundle province back into polygon-clipping geometry. */
export function provincePolygonsFromBundle(province) {
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

export function decodePolityPolygons(polity) {
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
export function descriptorPolygons(descriptor) {
  if (descriptor.polygon !== undefined) {
    return [[closeRing(descriptor.polygon.map(([lon, lat]) => [lon, lat]))]];
  }
  throw new Error("unsupported plan descriptor; expected polygon");
}

/** Label point: centroid of the largest ring, guaranteed inside by fallback. */
export function labelPointFor(polygons, fallback) {
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

/**
 * Index Natural Earth admin-1 features by ISO 3166-2 code.
 *
 * A code can occur more than once (for example a city and its surrounding
 * province); all its features are unioned into one geometry block.
 */
export function indexAdmin1(admin1) {
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
  return { units, unitPolygons };
}

/** True when a point is inside any outer ring and outside that polygon's holes. */
export function pointInPolygons(point, polygons) {
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

/**
 * Annotate units with the 1900 map polity tags that contain their label point.
 *
 * The Asia plan uses this to assign every modern first-level unit to the correct
 * authored 1900 territory even where a modern country spans several polities
 * (for example British Aden inside Yemen, or Kashmir between India and China).
 */
export function annotateUnitPolities(units, unitPolygons, polityPolygonsByTag) {
  for (const unit of units) {
    const polygons = unitPolygons.get(unit.code) ?? [];
    const label = labelPointFor(polygons, [unit.lon, unit.lat]);
    unit.label = label;
    const tags = [];
    for (const [tag, polityPolygons] of polityPolygonsByTag) {
      if (pointInPolygons(label, polityPolygons)) tags.push(tag);
    }
    unit.polities = tags;
  }
  return units;
}

// ---- Main build --------------------------------------------------------------

/**
 * Build one province bundle.
 *
 * @param {object} options
 * @param {object} options.plan authored plan (`sources`, `futurePolities`, `provinces`)
 * @param {{features: object[]}} options.admin1 Natural Earth 1:10m admin-1 GeoJSON
 * @param {object} options.worldMap authored M11c 1900 map bundle
 * @param {Record<string, number[][] | number[][][]>} [options.coverageClips]
 *   per-tag coverage scope: one ring, or several disjoint rings for a shared
 *   feature whose continent-scope is not contiguous
 * @param {string[]} [options.enclosedMicrostateTags] tags exempt from cross-owner subtraction
 * @param {{ownerPolityId: number, polygons: number[][][], bbox: number[]}[]} [options.preexistingProvinces]
 * @param {string} options.dataset meta description
 * @param {string} options.notes meta notes
 * @param {string} options.generatedBy script path recorded in meta/audit
 */
export function buildProvinceBundle({
  plan,
  admin1,
  worldMap,
  coverageClips = {},
  enclosedMicrostateTags = [],
  preexistingProvinces = [],
  estimateCoverageFromAllProvinces = false,
  dataset,
  notes,
  generatedBy,
}) {
  if (plan.provinces.length === 0) throw new Error("province plan must not be empty");  const { units, unitPolygons } = indexAdmin1(admin1);

  // ---- 1900 map polity polygons ---------------------------------------------
  const mapPolityByTag = new Map(worldMap.polities.map((polity) => [polity.tag, polity]));
  const polityPolygons = new Map();
  for (const [tag, polity] of mapPolityByTag) {
    polityPolygons.set(tag, decodePolityPolygons(polity));
  }

  function coverageClip(tag) {
    const polygon = coverageClips[tag];
    if (polygon === undefined) return null;
    // A coverage scope may need more than one disjoint area (the Americas build
    // scopes French Guiana and the French Antilles separately so metropolitan
    // France, Réunion and Mayotte are not measured). A single ring is
    // `number[][]`; several rings are `number[][][]` and become one MultiPolygon.
    if (Array.isArray(polygon[0]) && Array.isArray(polygon[0][0])) {
      return polygon.map((ring) => [closeRing(ring)]);
    }
    return [[closeRing(polygon)]];
  }

  function mapPolityPolygon(tag) {
    return polityPolygons.get(tag) ?? [];
  }

  // ---- Build provinces -------------------------------------------------------
  const built = [];
  const warnings = [];
  const assignedByMapTag = new Map();

  function subtractAssigned(tag, polygons) {
    const boxes = assignedByMapTag.get(tag) ?? [];
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
    if (!assignedByMapTag.has(tag)) assignedByMapTag.set(tag, []);
    assignedByMapTag.get(tag).push({ polygons, bbox: polygonBBox(polygons) });
  }

  /**
   * Remove overlap with provinces of a different 1900 owner.
   *
   * The M11c polity polygons occasionally overlap by a few thousandths of a
   * square degree (a seam between two reconstructed frontiers). Independent
   * provinces then both cover that sliver, and the later fill paints a small
   * foreign-colour "enclave" inside the earlier country. The authored plan order
   * is the priority: an earlier province keeps its full extent and the later
   * province is clipped, which makes the visible border follow one coherent line.
   *
   * `preexistingProvinces` lets a later continent respect an already committed
   * bundle: Europe is seeded before Asia, so an Asia province is clipped by a
   * Europe province of another owner rather than painting over it.
   */
  const crossOwnerAssigned = [];
  for (const entry of preexistingProvinces) {
    if (entry.polygons.length === 0) continue;
    crossOwnerAssigned.push({
      ownerPolityId: entry.ownerPolityId,
      polygons: entry.polygons,
      bbox: polygonBBox(entry.polygons),
    });
  }

  function subtractCrossOwner(ownerPolityId, polygons) {
    const ownBox = polygonBBox(polygons);
    if (!Number.isFinite(ownBox[0])) return polygons;
    let result = polygons;
    for (const entry of crossOwnerAssigned) {
      if (entry.ownerPolityId === ownerPolityId) continue;
      if (!bboxOverlap(entry.bbox, ownBox)) continue;
      try {
        result = differencePolygons(result, entry.polygons);
      } catch {
        continue;
      }
      if (result.length === 0) break;
    }
    return result;
  }

  function rememberCrossOwner(ownerPolityId, polygons) {
    if (polygons.length === 0) return;
    crossOwnerAssigned.push({
      ownerPolityId,
      polygons,
      bbox: polygonBBox(polygons),
    });
  }

  /**
   * Emit one built province.
   *
   * Extracted from the plan loop so the M12e coverage-gap provinces use exactly
   * the same simplification, cross-owner trimming, encoding, labelling and
   * border-source rules as a normal province. `skipCrossOwner` is used by gap
   * provinces: their source is already the difference with every other province,
   * so a second subtraction is unnecessary (and could erase a legitimate island).
   */
  function emitProvince(province, source, options = {}) {
    const { skipCrossOwner = false, tolerance = province.tolerance ?? TOLERANCE } = options;
    const isEnclosedMicrostate = enclosedMicrostateTags.includes(province.mapTag);
    let simplified = simplifyMultiPolygon(source, tolerance);
    // Simplification can expand a later province back into an earlier one by up
    // to the tolerance. Resolve the final drawn geometry so no foreign-colour
    // sliver survives in the rendered fills.
    if (!skipCrossOwner && !isEnclosedMicrostate && simplified.length > 0) {
      simplified = subtractCrossOwner(province.ownerPolityId, simplified);
    }
    if (simplified.length === 0) {
      warnings.push(`province ${province.key} has no geometry after clipping`);
      return null;
    }
    const encoded = encodeMultiPolygon(simplified);
    const areaFloor = province.minArea ?? AREA_EPSILON;
    const preciseArea = multiPolygonArea(simplified);
    if (preciseArea <= areaFloor) {
      warnings.push(`province ${province.key} has negligible area`);
      return null;
    }
    const label = labelPointFor(simplified, [
      province.ownerPolityId % 360 - 180,
      province.ownerPolityId % 80 - 40,
    ]);
    rememberAssigned(province.mapTag, simplified);
    rememberCrossOwner(province.ownerPolityId, simplified);
    const record = {
      ...province,
      ...encoded,
      polygons: simplified,
      // Border extraction must use the shared source geometry BEFORE independent
      // simplification. Simplifying each province separately gives the two sides
      // of a shared edge different vertices, which quantizes into different
      // segments and produces the disconnected border fragments seen on the map.
      rawPolygons: source,
      label,
      residual: province.residual === true,
    };
    built.push(record);
    return record;
  }

  let buildIndex = 0;
  for (const province of plan.provinces) {
    buildIndex += 1;
    if (process.env.PROVINCE_DEBUG === "1") {
      console.error(`[${buildIndex}/${plan.provinces.length}] ${province.key}`);
    }
    const mapPolygons = mapPolityPolygon(province.mapTag);
    // A `detached` province is an island or atoll that the coarse 1900 feature
    // does not reach (or reaches inaccurately). Its modern admin-1 geometry is the
    // authoritative coastline, so it is not intersected with the map feature. The
    // 1900 outer boundary still applies to every non-detached province.
    const detached = province.detached === true;
    if (!detached && mapPolygons.length === 0) {
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
    if (!detached) {
      source = intersectPolygons(source, mapPolygons);
    }
    // A later province must not paint a foreign-colour sliver inside an earlier
    // one where two reconstructed 1900 frontiers overlap by a few thousandths of
    // a degree. Microstates enclosed by a larger country are not subtracted:
    // their whole territory can otherwise disappear into the surrounding province.
    if (!enclosedMicrostateTags.includes(province.mapTag)) {
      source = subtractCrossOwner(province.ownerPolityId, source);
    }
    if (process.env.PROVINCE_DEBUG === "2") {
      console.error(
        `  ${province.key}: unitsArea=${multiPolygonArea(
          unitPolygons.get(province.units[0] ?? "") ?? [],
        ).toFixed(3)} sourceArea=${multiPolygonArea(source).toFixed(3)}`,
      );
    }
    emitProvince(province, source);
  }

  // ---- Coverage-gap provinces (M12e) ----------------------------------------
  //
  // The 1900 map has land the four continental bundles never reached: remote
  // islands inside a shared feature, islands the coarse feature omits entirely,
  // and residual slivers inside a feature whose provinces were built from a
  // different source. A gap province is a permanent province with a stable id; it
  // is generated deterministically from the M11c land mask / 1900 feature, not
  // from a crude correction box. It is still a normal province for rendering,
  // ownership and transfer purposes.
  const gapResults = [];
  const gapSkipped = [];
  const preexistingBoxes = preexistingProvinces.map((entry) => ({
    polygons: entry.polygons,
    bbox: entry.polygons.length === 0 ? [Infinity, Infinity, -Infinity, -Infinity] : polygonBBox(entry.polygons),
  }));
  const failedSubtractions = [];

  /**
   * polygon-clipping occasionally cannot close an output ring when a quantized
   * 1900 feature and an unquantized simplified province share a nearly-coincident
   * edge. Retry once with both operands quantized to the committed 0.001 degree
   * grid; if it still fails, skip that subtrahend and record it (the residual then
   * overlaps a same-owner province at worst, which cannot create a foreign-colour
   * enclave).
   */
  function quantizePolygons(polygons) {
    return polygons.map((polygon) =>
      polygon.map((ring) =>
        ring.map(([x, y]) => [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000]),
      ),
    );
  }

  function safeDifference(left, right, label) {
    try {
      return differencePolygons(left, right);
    } catch {
      try {
        return differencePolygons(quantizePolygons(left), quantizePolygons(right));
      } catch {
        failedSubtractions.push(label);
        return left;
      }
    }
  }

  function subtractAllProvinces(polygons) {
    const ownBox = polygonBBox(polygons);
    if (!Number.isFinite(ownBox[0])) return [];
    let result = polygons;
    for (const entry of preexistingBoxes) {
      if (!bboxOverlap(entry.bbox, ownBox)) continue;
      result = safeDifference(result, entry.polygons, `preexisting:${String(entry.bbox)}`);
      if (result.length === 0) return result;
    }
    for (const province of built) {
      if (!bboxOverlap(province.bbox, ownBox)) continue;
      result = safeDifference(result, province.polygons, `built:${province.key}`);
      if (result.length === 0) return result;
    }
    return result;
  }

  for (const gap of plan.gapProvinces ?? []) {
    if (process.env.PROVINCE_DEBUG === "1") console.error(`[gap ${gap.key}]`);
    let source = [];
    if (gap.geometry.kind === "authored") {
      source = unionPolygons(
        gap.geometry.polygons.map((ring) => [[closeRing(ring.map(([lon, lat]) => [lon, lat]))]]),
      );
    } else if (gap.geometry.kind === "land-ring") {
      const rings = gap.geometry.rings.map((index) => decodeRing(worldMap.land[index]));
      source = unionPolygons(rings.map((ring) => [[ring]]));
      source = subtractAllProvinces(source);
    } else if (gap.geometry.kind === "feature-residual") {
      source = subtractAllProvinces(mapPolityPolygon(gap.mapTag));
    } else {
      throw new Error(`unsupported gap geometry ${JSON.stringify(gap.geometry)}`);
    }
    if (source.length === 0) {
      gapSkipped.push({ key: gap.key, reason: "empty" });
      continue;
    }
    const simplified = simplifyMultiPolygon(source, GAP_TOLERANCE);
    const area = multiPolygonArea(simplified);
    if (area < (gap.minArea ?? RESIDUAL_MIN_AREA)) {
      gapSkipped.push({ key: gap.key, reason: "below-threshold", area: Number(area.toFixed(4)) });
      continue;
    }
    const record = emitProvince(gap, source, {
      // The source already subtracted every province. Cross-owner trimming is
      // still applied after simplification so the 0.004 degree simplifier cannot
      // expand a residual across a foreign frontier (pitfall 3).
      skipCrossOwner: false,
      tolerance: GAP_TOLERANCE,
    });
    if (record === null) {
      gapSkipped.push({ key: gap.key, reason: "not-emitted" });
      continue;
    }
    gapResults.push({ key: gap.key, id: gap.provinceId, mapTag: gap.mapTag, area: record.area });
  }

  /**
   * Automatic land-ring closure.
   *
   * After every authored and feature-residual province exists, any non-Antarctic
   * M11c land ring that is still completely outside the province catalogue is
   * attached to the 1900 polity that contains most of it. This is the guarantee
   * behind the global land audit: a ring cannot be silently dropped. Water holes
   * of the land topology (the Caspian and similar endorheic seas are stored as
   * separate rings) are excluded because they are not land.
   */
  const landGapResults = [];
  const landGapSkipped = [];
  const landGapConfig = plan.autoLandGaps ?? null;
  if (landGapConfig !== null) {
    const landRings = worldMap.land.map(decodeRing);
    const landBoxes = landRings.map((ring) => polygonBBox([[ring]]));
    const landAreas = landRings.map((ring) => ringArea(ring));
    const waterRings = new Set();
    for (let index = 0; index < landRings.length; index += 1) {
      const ring = landRings[index];
      const label = labelPointFor([[ring]], [
        (landBoxes[index][0] + landBoxes[index][2]) / 2,
        (landBoxes[index][1] + landBoxes[index][3]) / 2,
      ]);
      for (let other = 0; other < landRings.length; other += 1) {
        if (other === index || landAreas[other] <= landAreas[index]) continue;
        const box = landBoxes[other];
        if (
          label[0] < box[0] ||
          label[0] > box[2] ||
          label[1] < box[1] ||
          label[1] > box[3]
        ) {
          continue;
        }
        if (pointInPolygons(label, [[landRings[other]]])) {
          waterRings.add(index);
          break;
        }
      }
    }
    const ownerOfTag = (tag) => {
      const configured = landGapConfig.ownerByTag?.[tag];
      if (configured !== undefined) return configured;
      const builtProvince = built.find((province) => province.mapTag === tag);
      if (builtProvince !== undefined) return builtProvince.ownerTag;
      const prior = preexistingProvinces.find((province) => province.mapTag === tag);
      if (prior !== undefined) return prior.ownerTag;
      return landGapConfig.fallbackOwnerTag ?? "GBR";
    };
    for (let index = 0; index < landRings.length; index += 1) {
      if (landBoxes[index][3] < -60) {
        landGapSkipped.push({ ring: index, reason: "antarctica" });
        continue;
      }
      if (waterRings.has(index)) {
        landGapSkipped.push({ ring: index, reason: "water-hole" });
        continue;
      }
      const ring = landRings[index];
      const label = labelPointFor([[ring]], [
        (landBoxes[index][0] + landBoxes[index][2]) / 2,
        (landBoxes[index][1] + landBoxes[index][3]) / 2,
      ]);
      // A ring with a province at its representative point is already assigned.
      // This cheap check prunes almost every ring; the interior grid below is the
      // authoritative test for the rest.
      let labelCovered = false;
      for (const province of built) {
        const box = province.bbox;
        if (
          label[0] < box[0] ||
          label[0] > box[2] ||
          label[1] < box[1] ||
          label[1] > box[3]
        ) {
          continue;
        }
        if (pointInPolygons(label, province.polygons)) {
          labelCovered = true;
          break;
        }
      }
      if (!labelCovered) {
        for (const entry of preexistingProvinces) {
          if (pointInPolygons(label, entry.polygons)) {
            labelCovered = true;
            break;
          }
        }
      }
      if (labelCovered) {
        landGapSkipped.push({ ring: index, reason: "assigned" });
        continue;
      }
      // Sample the ring interior. Any covered sample means the ring is already
      // assigned (a coastal label point can fall in a bay or outside a simplified
      // coast); the global land audit measures the residual band. The same pass
      // counts which 1900 feature contains the ring.
      const counts = new Map();
      const step = Math.max(0.04, Math.min(0.2, Math.sqrt(Math.max(landAreas[index], 1e-9)) / 6));
      let coveredSamples = 0;
      for (let x = landBoxes[index][0] + step / 2; x < landBoxes[index][2]; x += step) {
        for (let y = landBoxes[index][1] + step / 2; y < landBoxes[index][3]; y += step) {
          const nx = x > 180 ? x - 360 : x;
          if (!pointInPolygons([nx, y], [[ring]])) continue;
          let sampleCovered = false;
          for (const province of built) {
            const box = province.bbox;
            if (nx < box[0] || nx > box[2] || y < box[1] || y > box[3]) continue;
            if (pointInPolygons([nx, y], province.polygons)) {
              sampleCovered = true;
              break;
            }
          }
          if (!sampleCovered) {
            for (const entry of preexistingProvinces) {
              if (pointInPolygons([nx, y], entry.polygons)) {
                sampleCovered = true;
                break;
              }
            }
          }
          if (sampleCovered) {
            coveredSamples += 1;
            continue;
          }
          for (const [tag, polygons] of polityPolygons) {
            const box = mapPolityByTag.get(tag).bbox;
            if (nx < box[0] || nx > box[2] || y < box[1] || y > box[3]) continue;
            if (pointInPolygons([nx, y], polygons)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
          }
        }
      }
      if (coveredSamples > 0) {
        landGapSkipped.push({ ring: index, reason: "assigned" });
        continue;
      }
      let featureTag = null;
      let bestCount = 0;
      for (const [tag, count] of [...counts.entries()].sort((left, right) =>
        left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0,
      )) {
        if (count > bestCount) {
          bestCount = count;
          featureTag = tag;
        }
      }
      if (featureTag === null) {
        let bestDistance = Infinity;
        for (const [tag, box] of mapPolityByTag) {
          const dx = Math.max(box.bbox[0] - label[0], 0, label[0] - box.bbox[2]);
          const dy = Math.max(box.bbox[1] - label[1], 0, label[1] - box.bbox[3]);
          const distance = Math.hypot(dx, dy);
          if (distance < bestDistance) {
            bestDistance = distance;
            featureTag = tag;
          }
        }
      }
      const ownerTag = ownerOfTag(featureTag);
      const ownerPolityId = landGapConfig.ownerPolityIdByTag?.[ownerTag];
      if (ownerPolityId === undefined) {
        throw new Error(`no polity id configured for land-gap owner ${ownerTag}`);
      }
      const regionId = landGapConfig.regionIdByTag?.[featureTag] ?? 0;
      const source = subtractAllProvinces([[ring]]);
      if (source.length === 0) {
        landGapSkipped.push({ ring: index, reason: "empty" });
        continue;
      }
      const simplified = simplifyMultiPolygon(source, GAP_TOLERANCE);
      if (multiPolygonArea(simplified) < landGapConfig.minArea) {
        landGapSkipped.push({
          ring: index,
          reason: "below-threshold",
          area: Number(multiPolygonArea(simplified).toFixed(4)),
        });
        continue;
      }
      const province = {
        provinceId: landGapConfig.idBase + index,
        key: `${landGapConfig.keyPrefix}r${index}`,
        historicalName: `${featureTag} land gap ${String(index)}`,
        displayName: `${featureTag} land gap ${String(index)}`,
        aliases: [],
        ownerTag,
        ownerPolityId,
        mapTag: featureTag,
        simulationRegionId: regionId,
        historicalAdminAffiliation: "Coverage residual",
        historicalGrouping: null,
        initialSpecialStatus: "ordinary",
        confidence: "low",
        notes:
          "Automatic M12e land-ring closure: this non-Antarctic M11c land ring is outside every authored province, so it is attached to the 1900 polity that contains it. It is coverage geometry, not a reviewed frontier.",
        sourceIds: ["project-authored-1900", "project-authored-m12", "m12e-land-mask"],
      };
      const record = emitProvince(province, source, {
        skipCrossOwner: false,
        tolerance: GAP_TOLERANCE,
      });
      if (record === null) {
        landGapSkipped.push({ ring: index, reason: "not-emitted" });
        continue;
      }
      landGapResults.push({
        ring: index,
        key: province.key,
        id: province.provinceId,
        mapTag: featureTag,
        ownerTag,
        area: record.area,
      });
    }
  }

  // Every province must survive the build: a silently dropped province would
  // leave its 1900 territory to the polity underlay and hide a real data error.
  const builtKeys = new Set(built.map((province) => province.key));
  for (const province of plan.provinces) {
    if (!builtKeys.has(province.key)) {
      warnings.push(`planned province ${province.key} was not built`);
    }
  }

  // ---- Coverage residuals ----------------------------------------------------
  //
  // Only features whose provinces live in this bundle are measured. A residual
  // province for an earlier continent is coverage geometry for the global land
  // audit; measuring its whole feature here would ignore the earlier bundle's
  // provinces and report a false gap, so it sets `measureCoverage: false`.
  const mapTags = [
    ...new Set([
      ...plan.provinces
        .filter((province) => province.measureCoverage !== false)
        .map((province) => province.mapTag),
      ...(plan.gapProvinces ?? [])
        .filter((province) => province.measureCoverage !== false)
        .map((province) => province.mapTag),
    ]),
  ].sort();
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
    // When the large sequential difference fails, a partial `provinceArea`
    // understates coverage badly. Asia opts into a precomputed total so its audit
    // reports "not measurable" as a zero residual instead of a huge false gap.
    const totalTagArea = estimateCoverageFromAllProvinces
      ? built.reduce((sum, province) => (province.mapTag === tag ? sum + province.area : sum), 0)
      : null;
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
      residualArea = Math.max(
        0,
        scopeArea - (totalTagArea ?? provinceArea),
      );
      estimated = true;
    }
    coverage.push({
      tag,
      scopeArea: Number(scopeArea.toFixed(4)),
      coveredArea: Number((scopeArea - residualArea).toFixed(4)),
      residualArea: Number(residualArea.toFixed(4)),
      estimated,
    });
    if (!estimated && residualArea >= RESIDUAL_MIN_AREA) {
      warnings.push(
        `coverage gap ${tag}: ${residualArea.toFixed(3)} square degrees remain outside the authored provinces`,
      );
    }
  }

  // ---- Adjacency and borders -------------------------------------------------
  const allProvinces = built;
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
        const candidates =
          byStart.get(`${Math.round(head[0] * 1000)},${Math.round(head[1] * 1000)}`) ?? [];
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

  // ---- Audit -----------------------------------------------------------------
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
  const audit = {
    generatedBy,
    referenceDate: "1900-01-01",
    toleranceDegrees: TOLERANCE,
    gapToleranceDegrees: GAP_TOLERANCE,
    provinceCount: allProvinces.length,
    plannedProvinceCount: plan.provinces.length,
    gapProvinceCount: gapResults.length,
    gapProvinces: gapResults,
    skippedGapProvinces: gapSkipped,
    autoLandGapProvinceCount: landGapResults.length,
    autoLandGapProvinces: landGapResults,
    skippedLandGaps: landGapSkipped,
    gapSubtractionFailures: [...new Set(failedSubtractions)].sort(),
    residualProvinceCount: allProvinces.filter((province) => province.residual).length,
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
    residuals: [],
    warnings: [...new Set(warnings)].sort(),
    sourceCount: plan.sources.length,
  };

  const payload = {
    meta: {
      dataset,
      topologyLicense: "Public domain",
      projection: "natural-earth-2",
      quantization: "0.001 degrees, delta encoded",
      simplificationToleranceDegrees: TOLERANCE,
      generatedBy,
      referenceDate: "1900-01-01",
      mapDataset: worldMap.meta.dataset,
      mapBoundaryVersion: worldMap.meta.boundaryVersion,
      provinceCount: allProvinces.length,
      polityCount: new Set(allProvinces.map((province) => province.ownerTag)).size,
      borderPairCount: borders.length,
      notes,
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

  return {
    payload,
    audit,
    stats: {
      provinceCount: allProvinces.length,
      borderCount: borders.length,
      segmentCount,
      unmatchedSegments,
      duplicateIds,
      built,
      plan,
      warnings: audit.warnings,
    },
  };
}
