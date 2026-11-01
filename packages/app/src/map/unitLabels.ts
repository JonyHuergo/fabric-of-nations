/**
 * Fits one label to each political unit from province moments and adjacency.
 *
 * Moments are additive, so a unit's shape follows ownership after any transfer
 * with no new geometry. This runs when ownership changes, never per frame.
 */

import type { MapBounds } from "./camera";
import { unitLabelFromMoments, type LabelMoments, type UnitLabel } from "./labels";
import { projectLat, projectLon } from "./projection";

/** Below this share of its fitted ellipse a landmass counts as scattered. */
const SCATTERED_FILL_RATIO = 0.2;

export interface UnitLabelProvince {
  /** Coverage geometry: its rings may lie anywhere on the globe. */
  readonly residual: boolean;
  /** [minLon, minLat, maxLon, maxLat] */
  readonly bbox: readonly number[];
}

export interface UnitLabelInput {
  readonly provinces: readonly UnitLabelProvince[];
  /** Political unit of each province, in bundle order. */
  readonly unitTags: readonly string[];
  /** The bundle's six statistics per province. */
  readonly stats: Float32Array;
  /** Pairs of adjacent bundle indices. */
  readonly neighbours: Int32Array;
  readonly nameOf: (tag: string) => string;
}

export interface UnitLabelResult {
  readonly labels: readonly UnitLabel[];
  /** The landmass each unit's label describes; used to frame the unit. */
  readonly bounds: ReadonlyMap<string, MapBounds>;
}

interface UnitPart {
  readonly moments: LabelMoments;
  readonly bounds: MapBounds;
}

interface UnitComponent extends UnitPart {
  readonly tag: string;
  bounds: MapBounds;
  largest: UnitPart;
}

/** Adjacent bundle-index pairs from a border layer's side ids (index + 1). */
export function neighbourPairs(ids: Uint16Array): Int32Array {
  const pairs = new Set<number>();
  for (let index = 0; index < ids.length; index += 2) {
    const a = (ids[index] ?? 0) - 1;
    const b = (ids[index + 1] ?? 0) - 1;
    if (a >= 0 && b >= 0) pairs.add(a < b ? a * 65536 + b : b * 65536 + a);
  }
  const flat = new Int32Array(pairs.size * 2);
  let cursor = 0;
  for (const pair of pairs) {
    flat[cursor] = Math.floor(pair / 65536);
    flat[cursor + 1] = pair % 65536;
    cursor += 2;
  }
  return flat;
}

function momentsOf(stats: Float32Array, index: number): LabelMoments {
  const at = index * 6;
  const area = stats[at] ?? 0;
  const cx = stats[at + 1] ?? 0;
  const cy = stats[at + 2] ?? 0;
  return {
    area,
    sumX: area * cx,
    sumY: area * cy,
    sumXX: area * ((stats[at + 3] ?? 0) + cx * cx),
    sumXY: area * ((stats[at + 4] ?? 0) + cx * cy),
    sumYY: area * ((stats[at + 5] ?? 0) + cy * cy),
  };
}

function boundsOf(province: UnitLabelProvince | undefined): MapBounds {
  const [minLon = 0, minLat = 0, maxLon = 0, maxLat = 0] = province?.bbox ?? [];
  return {
    minX: projectLon(minLon),
    maxX: projectLon(maxLon),
    minY: projectLat(maxLat),
    maxY: projectLat(minLat),
  };
}

export function buildUnitLabels(input: UnitLabelInput): UnitLabelResult {
  const { provinces, unitTags, stats, neighbours, nameOf } = input;
  const parent = new Int32Array(unitTags.length).map((_, index) => index);
  const find = (index: number): number => {
    let root = index;
    while (parent[root] !== root) root = parent[root] ?? root;
    let cursor = index;
    while (parent[cursor] !== root) {
      const next = parent[cursor] ?? root;
      parent[cursor] = root;
      cursor = next;
    }
    return root;
  };
  // Residual provinces never shape a label, or a unit's name would land on someone
  // else's continent. A unit made of nothing else still needs them.
  const hasOrdinaryProvince = new Set<string>();
  unitTags.forEach((tag, index) => {
    if (provinces[index]?.residual === false) hasOrdinaryProvince.add(tag);
  });
  const shapesLabel = (index: number): boolean => {
    const tag = unitTags[index];
    if (tag === undefined) return false;
    return provinces[index]?.residual === false || !hasOrdinaryProvince.has(tag);
  };
  for (let index = 0; index < neighbours.length; index += 2) {
    const a = neighbours[index] ?? 0;
    const b = neighbours[index + 1] ?? 0;
    if (unitTags[a] === unitTags[b] && shapesLabel(a) && shapesLabel(b)) {
      parent[find(a)] = find(b);
    }
  }

  const components = new Map<number, UnitComponent>();
  unitTags.forEach((tag, index) => {
    if (!shapesLabel(index)) return;
    const root = find(index);
    const moments = momentsOf(stats, index);
    const bounds = boundsOf(provinces[index]);
    const existing = components.get(root);
    if (existing === undefined) {
      components.set(root, { tag, moments: { ...moments }, bounds, largest: { moments, bounds } });
      return;
    }
    if (moments.area > existing.largest.moments.area) existing.largest = { moments, bounds };
    const sum = existing.moments;
    sum.area += moments.area;
    sum.sumX += moments.sumX;
    sum.sumY += moments.sumY;
    sum.sumXX += moments.sumXX;
    sum.sumXY += moments.sumXY;
    sum.sumYY += moments.sumYY;
    existing.bounds = {
      minX: Math.min(existing.bounds.minX, bounds.minX),
      maxX: Math.max(existing.bounds.maxX, bounds.maxX),
      minY: Math.min(existing.bounds.minY, bounds.minY),
      maxY: Math.max(existing.bounds.maxY, bounds.maxY),
    };
  });

  const mainComponent = new Map<string, UnitComponent>();
  for (const component of components.values()) {
    const best = mainComponent.get(component.tag);
    if (best === undefined || component.moments.area > best.moments.area) {
      mainComponent.set(component.tag, component);
    }
  }

  const labels: UnitLabel[] = [];
  const bounds = new Map<string, MapBounds>();
  for (const [tag, component] of mainComponent) {
    const name = nameOf(tag);
    let part: UnitPart = component;
    let label = unitLabelFromMoments(tag, name, part.moments);
    // A solid shape fills about 1.5 of its fitted ellipse. Far less than that is an
    // archipelago: name its largest piece rather than the empty sea between them.
    if (
      label !== null &&
      part.moments.area / (Math.PI * label.halfLength * label.halfWidth) < SCATTERED_FILL_RATIO
    ) {
      part = component.largest;
      label = unitLabelFromMoments(tag, name, part.moments);
    }
    bounds.set(tag, part.bounds);
    if (label !== null) labels.push(label);
  }
  return { labels, bounds };
}
