/**
 * Province picking in map units.
 *
 * A uniform grid narrows a point to a handful of provinces, each then tested
 * exactly. The ring index decodes authoritative rings; the mesh index tests the
 * render bundle's fill triangles, the same triangles the player sees, so the map
 * runtime needs no second copy of province geometry. Zoom plays no part: picking
 * is a pure function of the world point, so a province selects the same way at
 * every scale. Display-only land that the authoritative rings do not
 * reach (the 1:10m coast beyond 1:50m rings) resolves through the bundle's
 * nearest-province raster, and open sea picks nothing.
 */

import type { ProvinceMapProvince } from "../provinceCatalogTypes";
import { wrapX } from "./camera";
import { MAP_HEIGHT, MAP_WIDTH, projectLat, projectLon } from "./projection";
import { LAND_MASK, PROVINCE_ID_MASK, type ProvinceRaster, type RenderBundle } from "./renderBundle";

const CELL_SIZE = 10;
const COLUMNS = Math.ceil(MAP_WIDTH / CELL_SIZE);
const ROWS = Math.ceil(MAP_HEIGHT / CELL_SIZE);

interface DecodedRing {
  readonly points: Float32Array;
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export interface ProvinceHitIndex {
  /** Bundle index of the province at a world point, or -1 for none. */
  readonly pick: (worldX: number, worldY: number) => number;
  /** As `pick`, then the nearest land cell within a radius in map units. */
  readonly pickNear: (worldX: number, worldY: number, radius: number) => number;
}

function decodeRings(province: ProvinceMapProvince): readonly DecodedRing[] {
  return province.rings.map((flat) => {
    const points = new Float32Array(flat.length);
    let lon = 0;
    let lat = 0;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let index = 0; index < flat.length; index += 2) {
      lon += flat[index] ?? 0;
      lat += flat[index + 1] ?? 0;
      const x = projectLon(lon / 1000);
      const y = projectLat(lat / 1000);
      points[index] = x;
      points[index + 1] = y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    return { points, minX, minY, maxX, maxY };
  });
}

function insideRing(x: number, y: number, points: Float32Array): boolean {
  let inside = false;
  const count = points.length / 2;
  for (let i = 0, j = count - 1; i < count; j = i, i += 1) {
    const xi = points[i * 2] ?? 0;
    const yi = points[i * 2 + 1] ?? 0;
    const xj = points[j * 2] ?? 0;
    const yj = points[j * 2 + 1] ?? 0;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Build the index from authoritative rings. `provinces` must be in bundle order. */
export function createProvinceHitIndex(
  provinces: readonly ProvinceMapProvince[],
  raster: ProvinceRaster | null,
): ProvinceHitIndex {
  const decodedRings = new Map<number, readonly DecodedRing[]>();
  const ringsOf = (index: number): readonly DecodedRing[] => {
    let rings = decodedRings.get(index);
    if (rings === undefined) {
      const province = provinces[index];
      rings = province === undefined ? [] : decodeRings(province);
      decodedRings.set(index, rings);
    }
    return rings;
  };
  const contains = (index: number, x: number, y: number): boolean => {
    let inside = false;
    for (const ring of ringsOf(index)) {
      if (x < ring.minX || x > ring.maxX || y < ring.minY || y > ring.maxY) continue;
      if (insideRing(x, y, ring.points)) inside = !inside;
    }
    return inside;
  };
  return buildHitIndex(provinces, raster, contains);
}

/** What the grid needs of a province; `rings` is not among it. */
export type HitTestProvince = Pick<ProvinceMapProvince, "bbox" | "area">;

/**
 * Build the index from the bundle's fill triangles. Triangles are grouped per
 * province once, at load, in one flat array.
 */
export function createMeshHitIndex(
  provinces: readonly HitTestProvince[],
  bundle: Pick<RenderBundle, "fill" | "fillProvince" | "raster">,
): ProvinceHitIndex {
  const { positions, indices } = bundle.fill;
  const offsets = new Int32Array(provinces.length + 3);
  const triangleCount = Math.floor(indices.length / 3);
  const ownerOf = (triangle: number): number => bundle.fillProvince[indices[triangle * 3] ?? 0] ?? 0;
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const owner = ownerOf(triangle);
    offsets[owner + 1] = (offsets[owner + 1] ?? 0) + 1;
  }
  for (let index = 1; index < offsets.length; index += 1) {
    offsets[index] = (offsets[index] ?? 0) + (offsets[index - 1] ?? 0);
  }
  const grouped = new Int32Array(triangleCount);
  const cursor = offsets.slice();
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const owner = ownerOf(triangle);
    grouped[cursor[owner] ?? 0] = triangle;
    cursor[owner] = (cursor[owner] ?? 0) + 1;
  }
  const contains = (index: number, x: number, y: number): boolean => {
    const owner = index + 1;
    const last = offsets[owner + 1] ?? 0;
    for (let at = offsets[owner] ?? 0; at < last; at += 1) {
      const triangle = (grouped[at] ?? 0) * 3;
      const a = (indices[triangle] ?? 0) * 2;
      const b = (indices[triangle + 1] ?? 0) * 2;
      const c = (indices[triangle + 2] ?? 0) * 2;
      const ax = positions[a] ?? 0;
      const ay = positions[a + 1] ?? 0;
      const bx = positions[b] ?? 0;
      const by = positions[b + 1] ?? 0;
      const cx = positions[c] ?? 0;
      const cy = positions[c + 1] ?? 0;
      const first = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
      const second = (cx - bx) * (y - by) - (cy - by) * (x - bx);
      const third = (ax - cx) * (y - cy) - (ay - cy) * (x - cx);
      if ((first >= 0 && second >= 0 && third >= 0) || (first <= 0 && second <= 0 && third <= 0)) {
        return true;
      }
    }
    return false;
  };
  return buildHitIndex(provinces, bundle.raster, contains);
}

function buildHitIndex(
  provinces: readonly HitTestProvince[],
  raster: ProvinceRaster | null,
  contains: (index: number, x: number, y: number) => boolean,
): ProvinceHitIndex {
  const cells: number[][] = Array.from({ length: COLUMNS * ROWS }, () => []);
  provinces.forEach((province, index) => {
    const [minLon = -180, minLat = -90, maxLon = 180, maxLat = 90] = province.bbox;
    const minRow = Math.max(0, Math.floor(projectLat(maxLat) / CELL_SIZE));
    const maxRow = Math.min(ROWS - 1, Math.floor(projectLat(minLat) / CELL_SIZE));
    const firstColumn = Math.floor(projectLon(minLon) / CELL_SIZE);
    const lastColumn = Math.floor(projectLon(maxLon) / CELL_SIZE);
    for (let row = minRow; row <= maxRow; row += 1) {
      for (let column = firstColumn; column <= lastColumn; column += 1) {
        const wrapped = ((column % COLUMNS) + COLUMNS) % COLUMNS;
        cells[row * COLUMNS + wrapped]?.push(index);
      }
    }
  });

  const pickRing = (x: number, y: number): number => {
    const row = Math.floor(y / CELL_SIZE);
    if (row < 0 || row >= ROWS) return -1;
    const candidates = cells[row * COLUMNS + Math.min(COLUMNS - 1, Math.floor(x / CELL_SIZE))] ?? [];
    let best = -1;
    let bestArea = Infinity;
    for (const index of candidates) {
      const area = provinces[index]?.area ?? Infinity;
      if (area >= bestArea) continue;
      // A ring can overhang the seam, so the point is tried on each world copy.
      if (contains(index, x, y) || contains(index, x + MAP_WIDTH, y) || contains(index, x - MAP_WIDTH, y)) {
        best = index;
        bestArea = area;
      }
    }
    return best;
  };

  const rasterAt = (x: number, y: number): number => {
    if (raster === null || y < 0 || y >= MAP_HEIGHT) return -1;
    const column = Math.min(raster.width - 1, Math.floor((x / MAP_WIDTH) * raster.width));
    const row = Math.min(raster.height - 1, Math.floor((y / MAP_HEIGHT) * raster.height));
    const cell = raster.cells[row * raster.width + column] ?? 0;
    if ((cell & LAND_MASK) === 0) return -1;
    return (cell & PROVINCE_ID_MASK) - 1;
  };

  const isLand = (x: number, y: number): boolean => {
    if (raster === null) return true;
    const column = Math.min(raster.width - 1, Math.floor((x / MAP_WIDTH) * raster.width));
    const row = Math.min(raster.height - 1, Math.floor((y / MAP_HEIGHT) * raster.height));
    return ((raster.cells[row * raster.width + column] ?? 0) & LAND_MASK) !== 0;
  };

  const pick = (worldX: number, worldY: number): number => {
    const x = wrapX(worldX);
    const hit = pickRing(x, worldY);
    // Authoritative rings overhang the finer coast by up to a raster cell; a
    // point well out to sea must not select the coastal province under it.
    if (hit >= 0) {
      const margin = raster === null ? 0 : (2 * MAP_WIDTH) / raster.width;
      const nearLand =
        isLand(x, worldY) ||
        isLand(wrapX(x + margin), worldY) ||
        isLand(wrapX(x - margin), worldY) ||
        isLand(x, worldY + margin) ||
        isLand(x, worldY - margin);
      return nearLand ? hit : -1;
    }
    return rasterAt(x, worldY);
  };

  const pickNear = (worldX: number, worldY: number, radius: number): number => {
    const direct = pick(worldX, worldY);
    if (direct >= 0 || raster === null || radius <= 0) return direct;
    const step = MAP_WIDTH / raster.width;
    const reach = Math.min(24, Math.ceil(radius / step));
    let best = -1;
    let bestDistance = Infinity;
    for (let dy = -reach; dy <= reach; dy += 1) {
      for (let dx = -reach; dx <= reach; dx += 1) {
        const distance = dx * dx + dy * dy;
        if (distance > reach * reach || distance >= bestDistance) continue;
        const found = rasterAt(wrapX(worldX + dx * step), worldY + dy * step);
        if (found >= 0) {
          best = found;
          bestDistance = distance;
        }
      }
    }
    return best;
  };

  return { pick, pickNear };
}
