/**
 * Pure M12a province render plan.
 *
 * Extracted from `WorldMap.tsx` so the relationship between provincial
 * ownership and drawn borders can be tested without mounting React:
 *
 * - every province edge is a dotted line (internal boundaries stay visible
 *   between two provinces of the same country);
 * - an edge is "national" only when the current owners of its two provinces
 *   differ (or, for the 1900 baseline, their initial owners differ);
 * - hit testing is independent of zoom because it operates on projected world
 *   coordinates and picks the smallest containing province.
 */

import type { ProvinceMapBorder } from "../provinceCatalogTypes";
import { pathForLines } from "./worldMapGeometry";

export interface ProvinceBorderPlanEntry {
  readonly a: number;
  readonly b: number;
  /** SVG path for this shared edge; null only for malformed/empty data. */
  readonly path: string | null;
  /** True when the edge separates two different current owners. */
  readonly national: boolean;
}

/**
 * Classify every province edge by the current owners of its endpoints.
 *
 * A `b` of -1 is an outer edge (coast or a border with a non-province area); it
 * is always drawn in the dotted province layer and never as a province-derived
 * national border. The 1900 polity border layer still draws non-province areas.
 */
export function planProvinceBorders(
  borders: readonly ProvinceMapBorder[],
  ownerByProvinceId: ReadonlyMap<number, string>,
): readonly ProvinceBorderPlanEntry[] {
  const plan: ProvinceBorderPlanEntry[] = [];
  for (const border of borders) {
    const path = pathForLines(border.lines, `province border ${String(border.a)}`);
    if (path === null) continue;
    const ownerA = ownerByProvinceId.get(border.a);
    const ownerB = border.b < 0 ? undefined : ownerByProvinceId.get(border.b);
    plan.push({
      a: border.a,
      b: border.b,
      path,
      national:
        border.b >= 0 &&
        ownerA !== undefined &&
        ownerB !== undefined &&
        ownerA !== ownerB,
    });
  }
  return plan;
}

export interface PickableProvince {
  readonly id: number;
  readonly area: number;
  readonly points: readonly (readonly (readonly number[])[])[];
}

/**
 * Return the smallest province containing a projected world point.
 *
 * The caller supplies an antimeridian x offset so wrapped rings are tested at
 * -360, 0 and +360 degrees. This is the same predicate the map uses at every
 * zoom level; zoom only changes the screen-to-world transform.
 */
export function pickProvinceAtPoint(
  provinces: readonly PickableProvince[],
  worldX: number,
  worldY: number,
  antimeridianOffsets: readonly number[],
): number | null {
  let bestId: number | null = null;
  let bestArea = Infinity;
  for (const province of provinces) {
    for (const offset of antimeridianOffsets) {
      let inside = false;
      for (const points of province.points) {
        if (points.length < 3) continue;
        if (pointInRing(worldX - offset, worldY, points)) inside = !inside;
      }
      if (inside) {
        if (province.area < bestArea) {
          bestId = province.id;
          bestArea = province.area;
        }
        break;
      }
    }
  }
  return bestId;
}

/** Even-odd point-in-ring test matching the SVG fill rule. */
export function pointInRing(
  x: number,
  y: number,
  points: readonly (readonly number[])[],
): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const [xi = 0, yi = 0] = points[i] ?? [];
    const [xj = 0, yj = 0] = points[j] ?? [];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
