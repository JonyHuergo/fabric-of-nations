/**
 * Fabric of Nations render-bundle compiler.
 *
 * Compiles display-only cartography into `packages/app/public/map/`:
 *
 *   world-render-v1.bin  triangulated province fills, 1:10m land and lakes,
 *                        rivers, classified border and coast polylines (three
 *                        levels of detail), a nearest-province raster and
 *                        province moment statistics for label placement;
 *   relief-v1.jpg        Natural Earth shaded relief in the map projection;
 *   ocean-v1.jpg         Natural Earth ocean bottom in the map projection.
 *
 * The authoritative province, polity and scenario data are inputs only and are
 * never modified. Province ids, ownership and gameplay granularity cannot change
 * here: every province keeps exactly one bundle index and the bundle records the
 * SHA-256 of the province files it was compiled from, so a stale artifact is a
 * test failure rather than a silent mismatch.
 *
 * Usage: node scripts/map/build-render-bundle.mjs [--check]
 * `--check` rebuilds in memory and fails if the committed bundle differs.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";

import earcut from "earcut";
import Jimp from "jimp-compact";

import {
  decodeTiff,
  growNearest,
  scanPolygon,
  unzipEntry,
} from "./raster-lib.mjs";
import { ROOT, SOURCES, sha256, sourceBytes, sourceJson } from "./sources.mjs";

const CHECK = process.argv.includes("--check");
const OUT_DIR = resolve(ROOT, "packages/app/public/map");
const DATA_DIR = resolve(ROOT, "packages/data/data/map");
const BUNDLE_FILES = [
  "provinces_1900.json",
  "provinces_asia_1900.json",
  "provinces_africa_1900.json",
  "provinces_americas_1900.json",
  "provinces_oceania_1900.json",
];

// ---- projection (mirrors packages/app/src/map/projection.ts; a test compares) -

const MAP_WIDTH = 1000;
const NORTH_LAT = 84;
const SOUTH_LAT = -78;
const GALL_C = 1 + Math.SQRT2 / 2;
const GALL_K = (MAP_WIDTH * Math.SQRT2) / (2 * Math.PI);
const gallY = (lat) => GALL_C * Math.tan((lat * Math.PI) / 360) * GALL_K;
const Y_NORTH = gallY(NORTH_LAT);
const MAP_HEIGHT = Y_NORTH - gallY(SOUTH_LAT);
const projectX = (lon) => ((lon + 180) / 360) * MAP_WIDTH;
const projectY = (lat) => Y_NORTH - gallY(lat);
const unprojectLat = (y) => (Math.atan((Y_NORTH - y) / GALL_K / GALL_C) * 360) / Math.PI;

// ---- tuning: all values are display-only, none reach the simulation ----------

/** Line and land simplification tolerances per level of detail, in map units. */
const LOD_TOLERANCE = [0, 0.05, 0.16];
/** Land tolerance at full detail (map units); about 0.016 degrees of longitude. */
const LAND_FULL_TOLERANCE = 0.0045;
/** Lake detail: smaller features stay at full zoom only. */
const LAKE_MAX_SCALERANK = [8, 6, 4];
/** Rivers: `River` class by scale rank, per line level of detail. */
const RIVER_MAX_SCALERANK = [7, 6, 4];
/** Polylines are split so culling chunks stay spatially tight. */
const MAX_PIECE_SEGMENTS = 48;
const TILE_COLUMNS = 24;
const TILE_ROWS = 16;
/** Probe offset used to find unmatched shared edges, in degrees. */
const BORDER_PROBE_DEGREES = 0.03;
const RASTER_WIDTH = 4096;
const RASTER_HEIGHT = Math.round((RASTER_WIDTH * MAP_HEIGHT) / MAP_WIDTH);
/** Sea cells within this many cells of land keep their nearest-province id. */
const RASTER_COAST_MARGIN = 2;
/** Land south of this latitude is unclaimed in 1900; it never takes an id. */
const UNCLAIMED_SOUTH_OF_LAT = -60;
const RELIEF_QUALITY = 88;
const OCEAN_QUALITY = 74;

/**
 * Natural Earth classes these as reservoirs because they are regulated today,
 * but they are natural lakes that existed in 1900. Every other reservoir is an
 * anachronism on a 1900 map and is excluded.
 */
const NATURAL_REGULATED_LAKES = new Set([
  "Lake Il'Men'",
  "Lake Zaysan",
  "Lake Imandra",
  "Mjøsa",
  "Oulujärvi",
  "Lac Saint-Jean",
  "Lake Abitibi",
  "Lac Seul",
  "Akkajaure",
  "Stora Lulevatten",
  "Umbozero Lake",
  "Koitere",
  "Rikkavesi",
]);
/** Modern remnants replaced by the Natural Earth historic-lake polygon. */
const SUPERSEDED_BY_HISTORIC = new Set(["South Aral Sea", "North Aral Sea", "Lake Chad"]);

// ---- binary encoding ---------------------------------------------------------

class ByteWriter {
  constructor(capacity = 1 << 20) {
    this.bytes = new Uint8Array(capacity);
    this.length = 0;
  }
  ensure(extra) {
    if (this.length + extra <= this.bytes.length) return;
    let capacity = this.bytes.length * 2;
    while (capacity < this.length + extra) capacity *= 2;
    const next = new Uint8Array(capacity);
    next.set(this.bytes.subarray(0, this.length));
    this.bytes = next;
  }
  varint(value) {
    this.ensure(10);
    let rest = value;
    while (rest >= 128) {
      this.bytes[this.length] = (rest % 128) | 128;
      this.length += 1;
      rest = Math.floor(rest / 128);
    }
    this.bytes[this.length] = rest;
    this.length += 1;
  }
  result() {
    return this.bytes.subarray(0, this.length);
  }
}

const zigzag = (value) => (value >= 0 ? value * 2 : -value * 2 - 1);

/** Interleaved integer coordinates, delta encoded per axis. */
function encodeCoordinates(values) {
  const writer = new ByteWriter(values.length * 2 + 16);
  let lastX = 0;
  let lastY = 0;
  for (let index = 0; index < values.length; index += 2) {
    writer.varint(zigzag(values[index] - lastX));
    writer.varint(zigzag(values[index + 1] - lastY));
    lastX = values[index];
    lastY = values[index + 1];
  }
  return writer.result();
}

function encodeDeltas(values) {
  const writer = new ByteWriter(values.length * 2 + 16);
  let last = 0;
  for (const value of values) {
    writer.varint(zigzag(value - last));
    last = value;
  }
  return writer.result();
}

class BundleWriter {
  constructor() {
    this.sections = [];
    this.bytes = 0;
  }
  add(bytes, count) {
    const offset = this.bytes;
    this.sections.push(bytes);
    this.bytes += bytes.length;
    return { offset, length: bytes.length, count };
  }
  coordinates(values) {
    return this.add(encodeCoordinates(values), values.length / 2);
  }
  deltas(values) {
    return this.add(encodeDeltas(values), values.length);
  }
  float32(values) {
    const array = Float32Array.from(values);
    return this.add(new Uint8Array(array.buffer), array.length);
  }
  finish(header) {
    const headerBytes = Buffer.from(JSON.stringify(header), "utf8");
    const prefix = Buffer.alloc(8);
    prefix.write("FONM", 0, "latin1");
    prefix.writeUInt32LE(headerBytes.length, 4);
    return Buffer.concat([prefix, headerBytes, ...this.sections.map((section) => Buffer.from(section))]);
  }
}

// ---- geometry helpers --------------------------------------------------------

const toInt = (degrees) => Math.round(degrees * 1000);

function decodeRing(flat) {
  const points = [];
  let lon = 0;
  let lat = 0;
  for (let index = 0; index < flat.length; index += 2) {
    lon += flat[index];
    lat += flat[index + 1];
    points.push([lon, lat]);
  }
  return points;
}

function ringPointInside(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function ringArea(ring) {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    sum += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return sum / 2;
}

const ringBounds = (ring) => {
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
};

/** Group even-odd rings into [outer, ...holes] polygons using the `holes` list. */
function groupPolygons(rings, holeIndices) {
  const holeSet = new Set(holeIndices);
  const outers = [];
  const holes = [];
  rings.forEach((ring, index) => {
    if (holeSet.has(index)) holes.push(ring);
    else outers.push([ring]);
  });
  for (const hole of holes) {
    const [lon, lat] = hole[0];
    let best = null;
    let bestArea = Infinity;
    for (const polygon of outers) {
      const area = Math.abs(ringArea(polygon[0]));
      if (area < bestArea && ringPointInside(lon, lat, polygon[0])) {
        best = polygon;
        bestArea = area;
      }
    }
    // Rings are even-odd: a "hole" inside no outer ring is filled land, so it must
    // stay a polygon of its own or the islet it describes disappears.
    if (best !== null) best.push(hole);
    else outers.push([hole]);
  }
  return outers;
}

/** Douglas-Peucker over projected points; endpoints are always retained. */
function simplifyLine(points, tolerance) {
  if (tolerance <= 0 || points.length <= 2) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  const squared = tolerance * tolerance;
  while (stack.length > 0) {
    const [first, last] = stack.pop();
    const [ax, ay] = points[first];
    const [bx, by] = points[last];
    const dx = bx - ax;
    const dy = by - ay;
    const length = dx * dx + dy * dy;
    let worst = -1;
    let worstDistance = squared;
    for (let index = first + 1; index < last; index += 1) {
      const [px, py] = points[index];
      let distance;
      if (length === 0) {
        distance = (px - ax) ** 2 + (py - ay) ** 2;
      } else {
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length));
        distance = (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2;
      }
      if (distance > worstDistance) {
        worstDistance = distance;
        worst = index;
      }
    }
    if (worst >= 0) {
      keep[worst] = 1;
      stack.push([first, worst], [worst, last]);
    }
  }
  return points.filter((_, index) => keep[index] === 1);
}

/** Simplify a closed ring by splitting at its two most distant vertices. */
function simplifyRing(points, tolerance) {
  if (tolerance <= 0 || points.length < 4) return points;
  let far = 0;
  let farDistance = -1;
  const [ox, oy] = points[0];
  for (let index = 1; index < points.length; index += 1) {
    const distance = (points[index][0] - ox) ** 2 + (points[index][1] - oy) ** 2;
    if (distance > farDistance) {
      farDistance = distance;
      far = index;
    }
  }
  const first = simplifyLine(points.slice(0, far + 1), tolerance);
  const second = simplifyLine([...points.slice(far), points[0]], tolerance);
  return [...first.slice(0, -1), ...second.slice(0, -1)];
}

/** Project integer-degree rings into map units, tracking original integers. */
const projectPoint = ([lon, lat]) => [projectX(lon / 1000), projectY(lat / 1000), lon, lat];

function tileOf(x, y) {
  const column = Math.max(0, Math.min(TILE_COLUMNS - 1, Math.floor((x / MAP_WIDTH) * TILE_COLUMNS)));
  const row = Math.max(0, Math.min(TILE_ROWS - 1, Math.floor((y / MAP_HEIGHT) * TILE_ROWS)));
  return row * TILE_COLUMNS + column;
}

/** Triangulate polygons and append to a mesh; returns the triangulation deviation. */
function appendPolygon(mesh, polygon) {
  const flat = [];
  const holes = [];
  const first = mesh.ints.length / 2;
  for (let ringIndex = 0; ringIndex < polygon.length; ringIndex += 1) {
    if (ringIndex > 0) holes.push(flat.length / 2);
    for (const [x, y, lon, lat] of polygon[ringIndex]) {
      flat.push(x, y);
      mesh.ints.push(lon, lat);
    }
  }
  const triangles = earcut(flat, holes, 2);
  for (let index = 0; index < triangles.length; index += 3) {
    const a = triangles[index];
    const b = triangles[index + 1];
    const c = triangles[index + 2];
    const cx = (flat[a * 2] + flat[b * 2] + flat[c * 2]) / 3;
    const cy = (flat[a * 2 + 1] + flat[b * 2 + 1] + flat[c * 2 + 1]) / 3;
    mesh.triangles.push({ a: a + first, b: b + first, c: c + first, tile: tileOf(cx, cy) });
  }
  let polygonArea = 0;
  polygon.forEach((ring, index) => {
    const area = Math.abs(ringArea(ring));
    polygonArea += index === 0 ? area : -area;
  });
  let triangleArea = 0;
  for (let index = 0; index < triangles.length; index += 3) {
    const [a, b, c] = [triangles[index], triangles[index + 1], triangles[index + 2]];
    triangleArea += Math.abs(
      (flat[a * 2] - flat[c * 2]) * (flat[b * 2 + 1] - flat[a * 2 + 1]) -
        (flat[a * 2] - flat[b * 2]) * (flat[c * 2 + 1] - flat[a * 2 + 1]),
    ) / 2;
  }
  return { triangles: triangles.length / 3, polygonArea, triangleArea };
}

/** Sort triangles by tile and emit indices plus culling chunks. */
function finishMesh(writer, mesh) {
  const order = mesh.triangles
    .map((triangle, index) => ({ triangle, index }))
    .sort((left, right) => left.triangle.tile - right.triangle.tile || left.index - right.index);
  const indices = new Uint32Array(order.length * 3);
  const chunks = [];
  const positionX = (vertex) => projectX(mesh.ints[vertex * 2] / 1000);
  const positionY = (vertex) => projectY(mesh.ints[vertex * 2 + 1] / 1000);
  let chunk = null;
  order.forEach(({ triangle }, position) => {
    indices[position * 3] = triangle.a;
    indices[position * 3 + 1] = triangle.b;
    indices[position * 3 + 2] = triangle.c;
    if (chunk === null || chunk.tile !== triangle.tile) {
      chunk = { tile: triangle.tile, start: position * 3, count: 0, minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
      chunks.push(chunk);
    }
    chunk.count += 3;
    for (const vertex of [triangle.a, triangle.b, triangle.c]) {
      chunk.minX = Math.min(chunk.minX, positionX(vertex));
      chunk.maxX = Math.max(chunk.maxX, positionX(vertex));
      chunk.minY = Math.min(chunk.minY, positionY(vertex));
      chunk.maxY = Math.max(chunk.maxY, positionY(vertex));
    }
  });
  return {
    vertices: writer.coordinates(mesh.ints),
    indices: writer.deltas(indices),
    chunks: chunks.map((entry) => [
      entry.start,
      entry.count,
      Number(entry.minX.toFixed(2)),
      Number(entry.minY.toFixed(2)),
      Number(entry.maxX.toFixed(2)),
      Number(entry.maxY.toFixed(2)),
    ]),
  };
}

/** Pieces are [{ points:[[x,y,lon,lat],…], a, b }]; sorted into culling chunks. */
function finishLines(writer, pieces) {
  const sorted = pieces
    .map((piece, index) => {
      const middle = piece.points[Math.floor(piece.points.length / 2)];
      return { piece, index, tile: tileOf(middle[0], middle[1]) };
    })
    .sort((left, right) => left.tile - right.tile || left.index - right.index);
  const ints = [];
  const lengths = [];
  const idsA = [];
  const idsB = [];
  const chunks = [];
  let chunk = null;
  let segment = 0;
  for (const { piece, tile } of sorted) {
    if (chunk === null || chunk.tile !== tile) {
      chunk = { tile, start: segment, count: 0, minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
      chunks.push(chunk);
    }
    lengths.push(piece.points.length);
    idsA.push(piece.a);
    idsB.push(piece.b);
    for (const [x, y, lon, lat] of piece.points) {
      ints.push(lon, lat);
      chunk.minX = Math.min(chunk.minX, x);
      chunk.maxX = Math.max(chunk.maxX, x);
      chunk.minY = Math.min(chunk.minY, y);
      chunk.maxY = Math.max(chunk.maxY, y);
    }
    chunk.count += piece.points.length - 1;
    segment += piece.points.length - 1;
  }
  return {
    segments: segment,
    coordinates: writer.coordinates(ints),
    lengths: writer.deltas(lengths),
    idsA: writer.deltas(idsA),
    idsB: writer.deltas(idsB),
    chunks: chunks.map((entry) => [
      entry.start,
      entry.count,
      Number(entry.minX.toFixed(2)),
      Number(entry.minY.toFixed(2)),
      Number(entry.maxX.toFixed(2)),
      Number(entry.maxY.toFixed(2)),
    ]),
  };
}

function splitPiece(points, a, b, output) {
  for (let start = 0; start + 1 < points.length; start += MAX_PIECE_SEGMENTS) {
    output.push({ points: points.slice(start, start + MAX_PIECE_SEGMENTS + 1), a, b });
  }
}

/**
 * Join lines of one province pair that meet end to end. Simplifying the longest
 * possible chain is what makes the coarse levels effective, and because every
 * shared edge has exactly one record both neighbours see the same simplified line.
 */
function mergeSharedLines(lines) {
  const byPair = new Map();
  for (const line of lines) {
    const key = Math.min(line.a, line.b) * 4096 + Math.max(line.a, line.b);
    let group = byPair.get(key);
    if (group === undefined) {
      group = [];
      byPair.set(key, group);
    }
    group.push(line);
  }
  const merged = [];
  const pointKey = ([lon, lat]) => `${String(lon)},${String(lat)}`;
  for (const group of byPair.values()) {
    const remaining = new Set(group.map((_, index) => index));
    const atEnd = new Map();
    group.forEach((line, index) => {
      for (const point of [line.points[0], line.points[line.points.length - 1]]) {
        const key = pointKey(point);
        const list = atEnd.get(key);
        if (list === undefined) atEnd.set(key, [index]);
        else list.push(index);
      }
    });
    const takeAt = (point) => {
      for (const index of atEnd.get(pointKey(point)) ?? []) {
        if (remaining.has(index)) return index;
      }
      return -1;
    };
    for (let start = 0; start < group.length; start += 1) {
      if (!remaining.has(start)) continue;
      remaining.delete(start);
      let points = group[start].points;
      for (let next = takeAt(points[points.length - 1]); next >= 0; next = takeAt(points[points.length - 1])) {
        remaining.delete(next);
        const candidate = group[next].points;
        const forward = pointKey(candidate[0]) === pointKey(points[points.length - 1]);
        points = [...points, ...(forward ? candidate : [...candidate].reverse()).slice(1)];
      }
      for (let next = takeAt(points[0]); next >= 0; next = takeAt(points[0])) {
        remaining.delete(next);
        const candidate = group[next].points;
        const forward = pointKey(candidate[candidate.length - 1]) === pointKey(points[0]);
        points = [...(forward ? candidate : [...candidate].reverse()).slice(0, -1), ...points];
      }
      merged.push({ a: group[start].a, b: group[start].b, points });
    }
  }
  return merged;
}

// ---- province inputs ---------------------------------------------------------

function loadProvinces() {
  const provinces = [];
  const borders = [];
  const hash = [];
  for (const file of BUNDLE_FILES) {
    const bytes = readFileSync(resolve(DATA_DIR, file));
    hash.push(sha256(bytes));
    const data = JSON.parse(bytes.toString("utf8"));
    provinces.push(...data.provinces);
    borders.push(...data.borders);
  }
  return { provinces, borders, sourceHash: sha256(hash.join("")) };
}

/** Degree-cell grid over province rings for exact offset probes. */
function buildProbeIndex(decoded) {
  const cells = new Map();
  decoded.forEach((province, index) => {
    for (const entry of province.ringEntries) {
      const [minX, minY, maxX, maxY] = entry.bounds;
      for (let cx = Math.floor(minX / 1000); cx <= Math.floor(maxX / 1000); cx += 1) {
        for (let cy = Math.floor(minY / 1000); cy <= Math.floor(maxY / 1000); cy += 1) {
          const key = cx * 1024 + cy;
          let list = cells.get(key);
          if (list === undefined) {
            list = [];
            cells.set(key, list);
          }
          list.push({ index, entry });
        }
      }
    }
  });
  return (lon, lat) => {
    const list = cells.get(Math.floor(lon / 1000) * 1024 + Math.floor(lat / 1000));
    if (list === undefined) return null;
    const parity = new Map();
    for (const { index, entry } of list) {
      const [minX, minY, maxX, maxY] = entry.bounds;
      if (lon < minX || lon > maxX || lat < minY || lat > maxY) continue;
      if (ringPointInside(lon, lat, entry.ring)) parity.set(index, !(parity.get(index) ?? false));
    }
    let found = null;
    for (const [index, inside] of parity) if (inside) found = found === null ? index : Math.min(found, index);
    return found;
  };
}

// ---- build -------------------------------------------------------------------

async function build() {
  const { provinces, borders, sourceHash } = loadProvinces();
  const indexById = new Map(provinces.map((province, index) => [province.id, index]));
  const writer = new BundleWriter();
  const audit = { generatedBy: "scripts/map/build-render-bundle.mjs", provinceCount: provinces.length };

  // 1. Province fills: one vertex run per province, in catalogue order.
  console.log("province fills");
  const decoded = provinces.map((province) => {
    const rings = province.rings.map(decodeRing);
    const ringEntries = rings.map((ring) => ({ ring, bounds: ringBounds(ring) }));
    return { rings, ringEntries };
  });
  const fill = { ints: [], triangles: [] };
  const provinceVertexCounts = [];
  const provinceStats = [];
  const untriangulated = [];
  let worstDeviation = 0;
  provinces.forEach((province, index) => {
    const before = fill.ints.length / 2;
    const trianglesBefore = fill.triangles.length;
    let sourceArea = 0;
    let triangleArea = 0;
    for (const polygon of groupPolygons(decoded[index].rings, province.holes)) {
      const result = appendPolygon(fill, polygon.map((ring) => ring.map(projectPoint)));
      sourceArea += result.polygonArea;
      triangleArea += result.triangleArea;
    }
    provinceVertexCounts.push(fill.ints.length / 2 - before);
    if (fill.triangles.length === trianglesBefore) untriangulated.push(province.key);
    if (sourceArea > 0) worstDeviation = Math.max(worstDeviation, Math.abs(triangleArea - sourceArea) / sourceArea);
    // Exact area moments over the triangles; aggregated at runtime for labels.
    let area = 0;
    let sumX = 0;
    let sumY = 0;
    let sumXX = 0;
    let sumXY = 0;
    let sumYY = 0;
    for (let triangle = trianglesBefore; triangle < fill.triangles.length; triangle += 1) {
      const { a, b, c } = fill.triangles[triangle];
      const px = [a, b, c].map((vertex) => projectX(fill.ints[vertex * 2] / 1000));
      const py = [a, b, c].map((vertex) => projectY(fill.ints[vertex * 2 + 1] / 1000));
      const weight = Math.abs((px[0] - px[2]) * (py[1] - py[0]) - (px[0] - px[1]) * (py[2] - py[0])) / 2;
      const cx = (px[0] + px[1] + px[2]) / 3;
      const cy = (py[0] + py[1] + py[2]) / 3;
      area += weight;
      sumX += weight * cx;
      sumY += weight * cy;
      // Second moment of a triangle about the origin from its vertices.
      sumXX += (weight * (px[0] ** 2 + px[1] ** 2 + px[2] ** 2 + px[0] * px[1] + px[1] * px[2] + px[0] * px[2])) / 6;
      sumYY += (weight * (py[0] ** 2 + py[1] ** 2 + py[2] ** 2 + py[0] * py[1] + py[1] * py[2] + py[0] * py[2])) / 6;
      sumXY +=
        (weight *
          (2 * px[0] * py[0] + 2 * px[1] * py[1] + 2 * px[2] * py[2] + px[0] * py[1] + px[1] * py[0] + px[0] * py[2] + px[2] * py[0] + px[1] * py[2] + px[2] * py[1])) /
        12;
    }
    // Central moments per unit area stay precise in 32 bits; the runtime adds
    // provinces with the parallel-axis theorem.
    const centerX = area > 0 ? sumX / area : 0;
    const centerY = area > 0 ? sumY / area : 0;
    provinceStats.push(
      area,
      centerX,
      centerY,
      area > 0 ? sumXX / area - centerX * centerX : 0,
      area > 0 ? sumXY / area - centerX * centerY : 0,
      area > 0 ? sumYY / area - centerY * centerY : 0,
    );
  });
  audit.fill = {
    vertices: fill.ints.length / 2,
    triangles: fill.triangles.length,
    untriangulatedProvinces: untriangulated,
    worstAreaDeviation: Number(worstDeviation.toFixed(6)),
  };
  const fillSection = finishMesh(writer, fill);

  // 2. Rasterise provinces smallest-last, then grow to a nearest-province field.
  console.log("province raster");
  const toPixelX = (lon) => (projectX(lon) / MAP_WIDTH) * RASTER_WIDTH;
  const toPixelY = (lat) => (projectY(lat) / MAP_HEIGHT) * RASTER_HEIGHT;
  const ids = new Uint16Array(RASTER_WIDTH * RASTER_HEIGHT);
  const seedOrder = provinces
    .map((province, index) => ({ index, area: province.area }))
    .sort((left, right) => right.area - left.area || left.index - right.index);
  for (const { index } of seedOrder) {
    const rings = decoded[index].rings.map((ring) =>
      ring.map(([lon, lat]) => [toPixelX(lon / 1000), toPixelY(lat / 1000)]),
    );
    scanPolygon(rings, RASTER_WIDTH, RASTER_HEIGHT, (column, row) => {
      ids[row * RASTER_WIDTH + column] = index + 1;
    });
    // Sub-cell islands would otherwise never seed the field.
    for (const ring of rings) {
      for (const [x, y] of ring) {
        const row = Math.floor(y);
        if (row < 0 || row >= RASTER_HEIGHT) continue;
        const column = ((Math.floor(x) % RASTER_WIDTH) + RASTER_WIDTH) % RASTER_WIDTH;
        if (ids[row * RASTER_WIDTH + column] === 0) ids[row * RASTER_WIDTH + column] = index + 1;
      }
    }
  }
  const unclaimedRow = Math.floor(toPixelY(UNCLAIMED_SOUTH_OF_LAT));
  ids.fill(0, unclaimedRow * RASTER_WIDTH);
  growNearest(ids, RASTER_WIDTH, unclaimedRow, unclaimedRow);
  const idAt = (lonInt, latInt) => {
    const row = Math.max(0, Math.min(RASTER_HEIGHT - 1, Math.floor(toPixelY(latInt / 1000))));
    const column = ((Math.floor(toPixelX(lonInt / 1000)) % RASTER_WIDTH) + RASTER_WIDTH) % RASTER_WIDTH;
    return ids[row * RASTER_WIDTH + column];
  };

  // 3. Land and lakes at three levels of detail.
  console.log("land");
  const landGeo = await sourceJson(SOURCES.land);
  const minorGeo = await sourceJson(SOURCES.minorIslands);
  const landPolygons = [];
  const addGeometry = (geometry, into, meta) => {
    const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
    for (const polygon of polygons) {
      into.push({
        ...meta,
        rings: polygon.map((ring) => {
          const points = ring.map(([lon, lat]) => [toInt(lon), toInt(lat)]);
          const open = points.filter(
            (point, index) =>
              index === 0 || point[0] !== points[index - 1][0] || point[1] !== points[index - 1][1],
          );
          const [firstLon, firstLat] = open[0];
          const last = open[open.length - 1];
          if (last[0] === firstLon && last[1] === firstLat) open.pop();
          return open;
        }),
      });
    }
  };
  for (const feature of [...landGeo.features, ...minorGeo.features]) addGeometry(feature.geometry, landPolygons, {});

  const lakeGeo = await sourceJson(SOURCES.lakes);
  const historicGeo = await sourceJson(SOURCES.historicLakes);
  const lakePolygons = [];
  const excludedReservoirs = [];
  for (const feature of lakeGeo.features) {
    const { featurecla, name, scalerank } = feature.properties;
    if (scalerank > LAKE_MAX_SCALERANK[0]) continue;
    if (SUPERSEDED_BY_HISTORIC.has(name)) continue;
    if (featurecla === "Reservoir" && !NATURAL_REGULATED_LAKES.has(name)) {
      excludedReservoirs.push(name ?? "(unnamed)");
      continue;
    }
    addGeometry(feature.geometry, lakePolygons, { scalerank });
  }
  for (const feature of historicGeo.features) {
    const name = feature.properties.name;
    if (name === "Aral Sea" || name === "Lake Chad") {
      addGeometry(feature.geometry, lakePolygons, { scalerank: Number(feature.properties.scalerank) });
    }
  }
  audit.lakes = {
    polygons: lakePolygons.length,
    excludedReservoirCount: excludedReservoirs.length,
    naturalRegulatedLakesKept: [...NATURAL_REGULATED_LAKES].sort(),
    historicExtents: ["Aral Sea", "Lake Chad"],
  };

  const landLods = [];
  const lakeLods = [];
  const coastLods = [];
  const coastStats = [];
  for (let lod = 0; lod < 3; lod += 1) {
    const tolerance = lod === 0 ? LAND_FULL_TOLERANCE : LOD_TOLERANCE[lod];
    console.log(`  level ${String(lod)} (tolerance ${String(tolerance)})`);
    const landMesh = { ints: [], triangles: [] };
    const lakeMesh = { ints: [], triangles: [] };
    const coast = [];
    let keptIslands = 0;
    const simplifyPolygon = (polygon) => {
      const out = [];
      polygon.rings.forEach((ring, ringIndex) => {
        const projected = ring.map(projectPoint);
        const simplified = simplifyRing(projected, tolerance);
        if (simplified.length >= 3 && Math.abs(ringArea(simplified)) > tolerance * tolerance * 0.25) {
          out.push(simplified);
        } else if (ringIndex === 0 && lod > 0) {
          // A small island survives simplification as a minimal diamond so it
          // stays on the map at world zoom; lakes and holes may simply vanish.
          const cx = projected.reduce((sum, point) => sum + point[2], 0) / projected.length;
          const cy = projected.reduce((sum, point) => sum + point[3], 0) / projected.length;
          const radius = (tolerance * 0.75 * 360) / MAP_WIDTH;
          const diamond = [
            [cx - radius * 1000, cy],
            [cx, cy + radius * 1000],
            [cx + radius * 1000, cy],
            [cx, cy - radius * 1000],
          ].map(([lon, lat]) => projectPoint([Math.round(lon), Math.round(lat)]));
          out.push(diamond);
          keptIslands += 1;
        }
      });
      return out;
    };
    const emitCoast = (rings) => {
      for (const ring of rings) {
        let run = [];
        let runId = -1;
        const flush = () => {
          if (run.length >= 2) splitPiece(run, runId, 0, coast);
          run = [];
        };
        for (let index = 0; index < ring.length; index += 1) {
          const from = ring[index];
          const to = ring[(index + 1) % ring.length];
          // Source artefacts, not coasts: the antimeridian cut and the south pole.
          const seam =
            (Math.abs(from[2]) >= 179995 && Math.abs(to[2]) >= 179995) ||
            (from[3] <= -84000 && to[3] <= -84000);
          if (seam) {
            flush();
            continue;
          }
          const id = idAt((from[2] + to[2]) / 2, (from[3] + to[3]) / 2);
          if (id !== runId) {
            const carry = run.length > 0 ? run[run.length - 1] : null;
            flush();
            runId = id;
            if (carry !== null) run.push(carry);
          }
          if (run.length === 0) run.push(from);
          run.push(to);
        }
        flush();
      }
    };
    for (const polygon of landPolygons) {
      const rings = simplifyPolygon(polygon);
      if (rings.length === 0) continue;
      appendPolygon(landMesh, rings);
      emitCoast(rings);
    }
    for (const polygon of lakePolygons) {
      if (polygon.scalerank > LAKE_MAX_SCALERANK[lod]) continue;
      const rings = simplifyPolygon({ rings: polygon.rings }).filter(() => true);
      if (rings.length === 0) continue;
      appendPolygon(lakeMesh, rings);
      emitCoast(rings);
    }
    landLods.push(finishMesh(writer, landMesh));
    lakeLods.push(finishMesh(writer, lakeMesh));
    coastLods.push(finishLines(writer, coast));
    coastStats.push({
      lod,
      landVertices: landMesh.ints.length / 2,
      landTriangles: landMesh.triangles.length,
      lakeVertices: lakeMesh.ints.length / 2,
      coastPieces: coast.length,
      minimalIslands: keptIslands,
    });
  }
  audit.land = coastStats;

  // 4. Land flag for the raster (hit testing separates land from open sea).
  console.log("land raster");
  const landCells = new Uint8Array(RASTER_WIDTH * RASTER_HEIGHT);
  for (const polygon of landPolygons) {
    const rings = polygon.rings.map((ring) =>
      ring.map(([lon, lat]) => [toPixelX(lon / 1000), toPixelY(lat / 1000)]),
    );
    scanPolygon(rings, RASTER_WIDTH, RASTER_HEIGHT, (column, row) => {
      landCells[row * RASTER_WIDTH + column] = 1;
    });
    for (const [x, y] of rings[0]) {
      const row = Math.floor(y);
      if (row < 0 || row >= RASTER_HEIGHT) continue;
      landCells[row * RASTER_WIDTH + (((Math.floor(x) % RASTER_WIDTH) + RASTER_WIDTH) % RASTER_WIDTH)] = 1;
    }
  }
  // Ids only matter on or just beside land, so open sea collapses to long runs.
  const nearLand = new Uint8Array(landCells);
  for (let pass = 0; pass < RASTER_COAST_MARGIN; pass += 1) {
    const previous = nearLand.slice();
    for (let row = 0; row < RASTER_HEIGHT; row += 1) {
      for (let column = 0; column < RASTER_WIDTH; column += 1) {
        if (previous[row * RASTER_WIDTH + column] === 0) continue;
        nearLand[row * RASTER_WIDTH + ((column + 1) % RASTER_WIDTH)] = 1;
        nearLand[row * RASTER_WIDTH + ((column + RASTER_WIDTH - 1) % RASTER_WIDTH)] = 1;
        if (row > 0) nearLand[(row - 1) * RASTER_WIDTH + column] = 1;
        if (row + 1 < RASTER_HEIGHT) nearLand[(row + 1) * RASTER_WIDTH + column] = 1;
      }
    }
  }
  const cellValue = (cell) =>
    (nearLand[cell] === 1 ? ids[cell] : 0) + (landCells[cell] === 1 ? 0x8000 : 0);
  const rle = new ByteWriter(1 << 20);
  let runs = 0;
  for (let cell = 0; cell < ids.length; ) {
    const value = cellValue(cell);
    let end = cell + 1;
    while (end < ids.length && cellValue(end) === value) end += 1;
    rle.varint(value);
    rle.varint(end - cell);
    runs += 1;
    cell = end;
  }
  const rasterSection = writer.add(rle.result(), runs);

  // 5. Province borders with unmatched shared edges recovered by exact probes.
  console.log("borders");
  const probe = buildProbeIndex(decoded);
  const probeOffset = BORDER_PROBE_DEGREES * 1000;
  const sharedLines = [];
  const recovered = new Map();
  let coastSegments = 0;
  let recoveredSegments = 0;
  for (const border of borders) {
    const a = indexById.get(border.a);
    if (a === undefined) throw new Error(`border references unknown province ${String(border.a)}`);
    for (const line of border.lines) {
      const points = decodeRing(line);
      if (border.b >= 0) {
        const b = indexById.get(border.b);
        if (b === undefined) throw new Error(`border references unknown province ${String(border.b)}`);
        sharedLines.push({ a, b, points });
        continue;
      }
      // A b = -1 line is a coast, or a shared edge whose vertices did not match
      // after independent simplification. Probe both sides of every segment.
      let run = [];
      let runOther = -1;
      const flush = () => {
        if (runOther >= 0 && run.length >= 2) {
          const key = Math.min(a, runOther) * 4096 + Math.max(a, runOther);
          let entries = recovered.get(key);
          if (entries === undefined) {
            entries = [];
            recovered.set(key, entries);
          }
          entries.push({ a, b: runOther, points: run });
        }
        run = [];
      };
      for (let index = 0; index + 1 < points.length; index += 1) {
        const [ax, ay] = points[index];
        const [bx, by] = points[index + 1];
        const length = Math.hypot(bx - ax, by - ay);
        let other = -1;
        if (length > 0) {
          const nx = (-(by - ay) / length) * probeOffset;
          const ny = ((bx - ax) / length) * probeOffset;
          const mx = (ax + bx) / 2;
          const my = (ay + by) / 2;
          const left = probe(mx + nx, my + ny);
          const right = probe(mx - nx, my - ny);
          if (left === a && right !== null && right !== a) other = right;
          else if (right === a && left !== null && left !== a) other = left;
        }
        if (other !== runOther) {
          flush();
          runOther = other;
        }
        if (other >= 0) {
          if (run.length === 0) run.push(points[index]);
          run.push(points[index + 1]);
          recoveredSegments += 1;
        } else {
          coastSegments += 1;
        }
      }
      flush();
    }
  }
  // Both neighbours may recover the same seam; keep the longer record of a pair.
  let recoveredPairs = 0;
  for (const entries of recovered.values()) {
    recoveredPairs += 1;
    const lengthFrom = (owner) =>
      entries.filter((entry) => entry.a === owner).reduce((sum, entry) => sum + entry.points.length, 0);
    const owners = [...new Set(entries.map((entry) => entry.a))].sort((left, right) => left - right);
    const winner = owners.reduce((best, owner) => (lengthFrom(owner) > lengthFrom(best) ? owner : best), owners[0]);
    for (const entry of entries) if (entry.a === winner) sharedLines.push(entry);
  }
  const mergedLines = mergeSharedLines(sharedLines);
  audit.borders = {
    sharedInputLines: sharedLines.length,
    mergedChains: mergedLines.length,
    recoveredPairs,
    recoveredSegments,
    coastSegmentsReplacedByLandLayer: coastSegments,
  };

  const borderLods = [];
  const borderStats = [];
  for (let lod = 0; lod < 3; lod += 1) {
    const pieces = [];
    for (const { a, b, points } of mergedLines) {
      const projected = points.map(projectPoint);
      const simplified = simplifyLine(projected, LOD_TOLERANCE[lod]);
      if (simplified.length >= 2) splitPiece(simplified, a + 1, b + 1, pieces);
    }
    const lines = finishLines(writer, pieces);
    borderLods.push(lines);
    borderStats.push({ lod, segments: lines.segments, pieces: pieces.length });
  }
  audit.borderLods = borderStats;

  // 6. Rivers: no ids; they are a geographic reference layer only.
  console.log("rivers");
  const riverGeo = await sourceJson(SOURCES.rivers);
  const riverLods = [];
  for (let lod = 0; lod < 3; lod += 1) {
    const pieces = [];
    for (const feature of riverGeo.features) {
      const { featurecla, scalerank } = feature.properties;
      if (scalerank > RIVER_MAX_SCALERANK[lod]) continue;
      if (featurecla !== "River" && featurecla !== "Lake Centerline") continue;
      if (feature.geometry === null) continue;
      const parts =
        feature.geometry.type === "LineString" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
      for (const part of parts) {
        const projected = part.map(([lon, lat]) => projectPoint([toInt(lon), toInt(lat)]));
        const simplified = simplifyLine(projected, Math.max(LOD_TOLERANCE[lod], LAND_FULL_TOLERANCE));
        if (simplified.length >= 2) splitPiece(simplified, 0, 0, pieces);
      }
    }
    riverLods.push(finishLines(writer, pieces));
  }

  // 7. Province statistics and identifiers.
  const statsSection = writer.float32(provinceStats);
  const idsSection = writer.deltas(provinces.map((province) => province.id));
  const vertexCountsSection = writer.deltas(provinceVertexCounts);

  const header = {
    format: 1,
    projection: {
      id: "gall-stereographic",
      width: MAP_WIDTH,
      height: MAP_HEIGHT,
      northLat: NORTH_LAT,
      southLat: SOUTH_LAT,
    },
    provinceSourceHash: sourceHash,
    provinceCount: provinces.length,
    provinceIds: idsSection,
    provinceVertexCounts: vertexCountsSection,
    provinceStats: statsSection,
    raster: { width: RASTER_WIDTH, height: RASTER_HEIGHT, rle: rasterSection },
    fill: fillSection,
    land: landLods,
    lakes: lakeLods,
    coast: coastLods,
    borders: borderLods,
    rivers: riverLods,
    lodTolerance: LOD_TOLERANCE,
    sources: Object.values(SOURCES).map(({ title, url, sha256: hash }) => ({ title, url, sha256: hash })),
  };
  const body = writer.finish(header);
  audit.bundleBytes = body.length;
  audit.bundleSha256 = sha256(body);
  audit.provinceSourceHash = sourceHash;
  audit.projection = header.projection;

  // 8. Relief and ocean rasters resampled into the map projection.
  console.log("rasters");
  const rasterImage = (samples, channelMix, flip) => {
    const data = Buffer.alloc(RASTER_WIDTH * RASTER_HEIGHT * 4);
    for (let row = 0; row < RASTER_HEIGHT; row += 1) {
      const lat = unprojectLat(((row + 0.5) / RASTER_HEIGHT) * MAP_HEIGHT);
      const sourceRow = Math.max(0, Math.min(samples.height - 2, ((90 - lat) / 180) * samples.height - 0.5));
      const r0 = Math.floor(sourceRow);
      const fy = sourceRow - r0;
      for (let column = 0; column < RASTER_WIDTH; column += 1) {
        const sourceColumn = ((column + 0.5) / RASTER_WIDTH) * samples.width - 0.5;
        const c0 = Math.floor(sourceColumn);
        const fx = sourceColumn - c0;
        const read = (x, y) => channelMix(samples, ((x + samples.width) % samples.width) + y * samples.width);
        const value =
          read(c0, r0) * (1 - fx) * (1 - fy) +
          read(c0 + 1, r0) * fx * (1 - fy) +
          read(c0, r0 + 1) * (1 - fx) * fy +
          read(c0 + 1, r0 + 1) * fx * fy;
        const output = flip(value);
        const at = (row * RASTER_WIDTH + column) * 4;
        data[at] = output;
        data[at + 1] = output;
        data[at + 2] = output;
        data[at + 3] = 255;
      }
    }
    return new Jimp({ data, width: RASTER_WIDTH, height: RASTER_HEIGHT });
  };
  const relief = decodeTiff(unzipEntry(await sourceBytes(SOURCES.shadedRelief), SOURCES.shadedRelief.entry));
  const reliefImage = rasterImage(relief, (image, at) => image.pixels[at], (value) => Math.round(value));
  const reliefBytes = await reliefImage.quality(RELIEF_QUALITY).getBufferAsync(Jimp.MIME_JPEG);
  const ocean = decodeTiff(unzipEntry(await sourceBytes(SOURCES.oceanBottom), SOURCES.oceanBottom.entry));
  const oceanImage = rasterImage(
    ocean,
    (image, at) => (image.pixels[at * 3] + image.pixels[at * 3 + 1] + image.pixels[at * 3 + 2]) / 3,
    (value) => Math.round(value),
  );
  const oceanBytes = await oceanImage.quality(OCEAN_QUALITY).getBufferAsync(Jimp.MIME_JPEG);
  audit.reliefBytes = reliefBytes.length;
  audit.oceanBytes = oceanBytes.length;

  return { body, audit, reliefBytes, oceanBytes };
}

const started = Date.now();
const { body, audit, reliefBytes, oceanBytes } = await build();
const compressed = gzipSync(body, { level: 9 });
audit.compressedBytes = compressed.length;
const BIN = resolve(OUT_DIR, "world-render-v1.bin");
if (CHECK) {
  if (!existsSync(BIN) || sha256(gunzipSync(readFileSync(BIN))) !== sha256(body)) {
    console.error("render bundle is stale: run node scripts/map/build-render-bundle.mjs");
    process.exitCode = 1;
  } else {
    console.log("render bundle matches the sources");
  }
} else {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(BIN, compressed);
  writeFileSync(resolve(OUT_DIR, "relief-v1.jpg"), reliefBytes);
  writeFileSync(resolve(OUT_DIR, "ocean-v1.jpg"), oceanBytes);
  writeFileSync(resolve(DATA_DIR, "map_render_audit.json"), `${JSON.stringify(audit, null, 2)}\n`);
}
console.log(JSON.stringify({ ...audit, land: undefined }, null, 1));
console.log(`done in ${String(Math.round((Date.now() - started) / 1000))} s`);
