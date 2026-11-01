/**
 * Pure SVG geometry construction for the 1900 world map.
 *
 * The generated map bundle stores rings as delta-encoded thousandths of a
 * degree. This module owns projection, decoding, path building and the explicit
 * validation boundary between that data and the React/SVG renderer. It has no
 * React Native or DOM dependency, so the complete 133-polity geometry can be
 * exercised in unit tests without mounting the app.
 *
 * Malformed geometry is never silently repaired: an odd coordinate count, a
 * non-finite coordinate, a ring with fewer than three points, or an empty ring
 * throws a tagged `RangeError`. A polity with no rings at all is the one
 * intentional exception: it returns `path: null` so the caller can render the
 * documented marker fallback instead of discarding the country.
 */

import { projectLat, projectLon } from "../map/projection";
import type { ProvinceMapProvince } from "../provinceCatalogTypes";
import type { WorldMapPolity } from "../worldCatalogTypes";
import { MAP_WIDTH } from "./mapViewport";

/** Delta-encoded source coordinates are thousandths of a degree. */
const COORDINATE_SCALE = 1000;
/** A drawable ring needs three distinct coordinate pairs. */
const MIN_RING_POINTS = 3;
/** Rings are copied at -360, 0 and +360 degrees so antimeridian rings wrap. */
const ANTIMERIDIAN_OFFSETS = [-MAP_WIDTH, 0, MAP_WIDTH] as const;

export interface DecodedPolityGeometry {
  /**
   * SVG path data, or `null` when the polity has no rings. A null path is an
   * intentional marker fallback, not invalid data: the renderer still draws and
   * selects the country as a point at its label position.
   */
  readonly path: string | null;
  /** Projected rings in viewBox coordinates, used for web hit testing. */
  readonly points: readonly (readonly (readonly number[])[])[];
  /** Number of rings that produced drawable path data. */
  readonly drawableRingCount: number;
}

function requireFinite(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new RangeError(`${path} must be a finite number`);
  }
  return value;
}

function requireRingArray(value: unknown, path: string): readonly number[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${path} must be an array of coordinates`);
  }
  return value as readonly number[];
}

/** Project one longitude/latitude pair into the shared map viewBox. */
export function project(lon: number, lat: number): readonly [number, number] {
  const projected: readonly [number, number] = [
    projectLon(requireFinite(lon, "longitude")),
    projectLat(requireFinite(lat, "latitude")),
  ];
  if (!Number.isFinite(projected[0]) || !Number.isFinite(projected[1])) {
    throw new RangeError("projected map coordinate must be finite");
  }
  return projected;
}

/**
 * Decode one delta-encoded ring into projected points.
 *
 * `path` labels the ring in validation errors and should include the polity tag
 * and ring index.
 */
function decodeFlatPoints(
  flat: readonly number[],
  path: string,
  minimumPoints: number,
): readonly (readonly number[])[] {
  const coordinates = requireRingArray(flat, path);
  if (coordinates.length % 2 !== 0) {
    throw new RangeError(`${path} has an odd coordinate count ${String(coordinates.length)}`);
  }
  if (coordinates.length / 2 < minimumPoints) {
    throw new RangeError(
      `${path} must contain at least ${String(minimumPoints)} points, found ${String(
        coordinates.length / 2,
      )}`,
    );
  }
  const points: number[][] = [];
  let x = 0;
  let y = 0;
  for (let index = 0; index < coordinates.length; index += 2) {
    x += requireFinite(coordinates[index], `${path}[${String(index)}]`);
    y += requireFinite(coordinates[index + 1], `${path}[${String(index + 1)}]`);
    const [px, py] = project(x / COORDINATE_SCALE, y / COORDINATE_SCALE);
    points.push([px, py]);
  }
  return points;
}

export function decodeRing(
  flat: readonly number[],
  path: string,
): readonly (readonly number[])[] {
  return decodeFlatPoints(flat, path, MIN_RING_POINTS);
}

/** Decode one open border polyline; two points are a valid segment. */
export function decodeLine(
  flat: readonly number[],
  path: string,
): readonly (readonly number[])[] {
  return decodeFlatPoints(flat, path, 2);
}

function pathCommands(
  points: readonly (readonly number[])[],
): string[] {
  if (points.length < MIN_RING_POINTS) return [];
  const commands: string[] = [];
  for (const offset of ANTIMERIDIAN_OFFSETS) {
    const [startX = 0, startY = 0] = points[0] ?? [];
    commands.push(`M${(startX + offset).toFixed(1)} ${startY.toFixed(1)}`);
    for (let index = 1; index < points.length; index += 1) {
      const [x = 0, y = 0] = points[index] ?? [];
      commands.push(`L${(x + offset).toFixed(1)} ${y.toFixed(1)}`);
    }
    commands.push("Z");
  }
  return commands;
}

/**
 * Build a path for a ring collection, validating every ring.
 *
 * Returns `null` only for an empty collection. Non-empty collections must be
 * fully valid; callers cannot accidentally drop a malformed ring.
 */
export function pathForRings(
  rings: readonly (readonly number[])[],
  path: string,
): string | null {
  if (!Array.isArray(rings)) {
    throw new TypeError(`${path} must be an array of rings`);
  }
  if (rings.length === 0) return null;
  const commands: string[] = [];
  for (let index = 0; index < rings.length; index += 1) {
    const flat = rings[index];
    if (flat === undefined) throw new RangeError(`${path}[${String(index)}] is missing`);
    commands.push(...pathCommands(decodeRing(flat, `${path}[${String(index)}]`)));
  }
  return commands.length === 0 ? null : commands.join("");
}

/**
 * Build open path data for province border polylines.
 *
 * Unlike a polygon ring, a border line is not closed: adding `Z` would draw an
 * unintended segment back to the start. Every line is validated with the same
 * explicit decoding contract as province fills.
 */
export function pathForLines(
  lines: readonly (readonly number[])[],
  path: string,
): string | null {
  if (!Array.isArray(lines)) {
    throw new TypeError(`${path} must be an array of lines`);
  }
  if (lines.length === 0) return null;
  const commands: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const flat = lines[index];
    if (flat === undefined) throw new RangeError(`${path}[${String(index)}] is missing`);
    const points = decodeLine(flat, `${path}[${String(index)}]`);
    for (const offset of ANTIMERIDIAN_OFFSETS) {
      const [startX = 0, startY = 0] = points[0] ?? [];
      commands.push(`M${(startX + offset).toFixed(1)} ${startY.toFixed(1)}`);
      for (let pointIndex = 1; pointIndex < points.length; pointIndex += 1) {
        const [x = 0, y = 0] = points[pointIndex] ?? [];
        commands.push(`L${(x + offset).toFixed(1)} ${y.toFixed(1)}`);
      }
    }
  }
  return commands.length === 0 ? null : commands.join("");
}

/** Decode one province once for fills, validation and web hit testing. */
export function decodeProvinceGeometry(
  province: ProvinceMapProvince,
): DecodedPolityGeometry {
  const rings = province.rings;
  if (!Array.isArray(rings)) {
    throw new TypeError(`province[${province.key}].rings must be an array`);
  }
  if (rings.length === 0) {
    return { path: null, points: [], drawableRingCount: 0 };
  }
  const points: (readonly (readonly number[])[])[] = [];
  const commands: string[] = [];
  for (let index = 0; index < rings.length; index += 1) {
    const flat = rings[index];
    if (flat === undefined) {
      throw new RangeError(`province[${province.key}].rings[${String(index)}] is missing`);
    }
    const decoded = decodeRing(
      flat,
      `province[${province.key}].rings[${String(index)}]`,
    );
    points.push(decoded);
    commands.push(...pathCommands(decoded));
  }
  return {
    path: commands.length === 0 ? null : commands.join(""),
    points,
    drawableRingCount: rings.length,
  };
}

/** Decode a polity once for rendering, validation and web hit testing. */
export function decodePolityGeometry(polity: WorldMapPolity): DecodedPolityGeometry {
  const rings = polity.rings;
  if (!Array.isArray(rings)) {
    throw new TypeError(`world.polities[${polity.tag}].rings must be an array`);
  }
  if (rings.length === 0) {
    return { path: null, points: [], drawableRingCount: 0 };
  }
  const points: (readonly (readonly number[])[])[] = [];
  const commands: string[] = [];
  for (let index = 0; index < rings.length; index += 1) {
    const flat = rings[index];
    if (flat === undefined) {
      throw new RangeError(`world.polities[${polity.tag}].rings[${String(index)}] is missing`);
    }
    const decoded = decodeRing(
      flat,
      `world.polities[${polity.tag}].rings[${String(index)}]`,
    );
    points.push(decoded);
    commands.push(...pathCommands(decoded));
  }
  return {
    path: commands.length === 0 ? null : commands.join(""),
    points,
    drawableRingCount: rings.length,
  };
}
