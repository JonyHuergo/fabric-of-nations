/**
 * Province picking in map units.
 *
 * A uniform grid narrows a point to a handful of provinces, whose rings are
 * decoded lazily and tested with the even-odd rule the fills use. Zoom plays no
 * part: picking is a pure function of the world point, so a province selects the
 * same way at every scale. Display-only land that the authoritative rings do not
 * reach (the 1:10m coast beyond 1:50m rings) resolves through the bundle's
 * nearest-province raster, and open sea picks nothing.
 */

import type { ProvinceMapProvince } from "../provinceCatalogTypes";
import { wrapX } from "./camera";
import { MAP_HEIGHT, MAP_WIDTH, projectLat, projectLon } from "./projection";
import { LAND_MASK, PROVINCE_ID_MASK, type ProvinceRaster } from "./renderBundle";

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

/** Build the index. `provinces` must be in bundle order. */
export function createProvinceHitIndex(
  provinces: readonly ProvinceMapProvince[],
  raster: ProvinceRaster | null,
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
