/**
 * Geographically anchored map labels: candidates and placement.
 *
 * Strategy:
 * - a political unit's label lies along the principal axis of its largest
 *   connected landmass, sized to fill that shape on screen, in the manner of a
 *   hand-lettered atlas. Moments come from the render bundle, so a label follows
 *   ownership after a transfer without any new geometry;
 * - sea labels are fixed gazetteer points;
 * - the three zoom levels of the design tokens decide what is named: powers and
 *   empires at world zoom, countries and capitals at nation zoom, provinces and
 *   their names at province zoom;
 * - a budget keeps a phone screen to about 25 labels, whichever level it is on.
 *
 * Placement is greedy by priority against a screen-space grid. It is pure and
 * deterministic for a camera, and the engine reruns it only when the camera has
 * moved materially, so labels do not flicker during a drag.
 *
 * Known limits: one label per unit, so a scattered territory is named only on its
 * largest piece; candidates are tested against other labels, not against borders.
 */

import type { Camera, MapViewportSize } from "./camera";
import { shortestDeltaX } from "./camera";
import { MAP_LABELS, MAP_ZOOM, labelBudget } from "../design/tokens";
import { MAP_HEIGHT, projectLat, projectLon } from "./projection";

export interface UnitLabel {
  readonly tag: string;
  readonly name: string;
  readonly x: number;
  readonly y: number;
  /** Radians of the baseline, within +-MAX_LABEL_ANGLE. */
  readonly angle: number;
  /** Half extents along and across the baseline, in map units. */
  readonly halfLength: number;
  readonly halfWidth: number;
  readonly area: number;
}

export interface PointLabel {
  readonly key: string;
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly priority: number;
  /** Half-width of the available area, in map units. */
  readonly halfWidth: number;
}

export interface SeaLabel {
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly minScale: number;
  readonly maxScale: number;
  readonly size: number;
}

export type PlacedLabel =
  | {
      readonly kind: "unit";
      readonly text: string;
      readonly x: number;
      readonly y: number;
      readonly angle: number;
      readonly size: number;
      readonly spacing: number;
      readonly emphasised: boolean;
      readonly opacity: number;
    }
  | {
      readonly kind: "sea";
      readonly text: string;
      readonly x: number;
      readonly y: number;
      readonly size: number;
    }
  | {
      readonly kind: "province" | "capital";
      readonly text: string;
      readonly x: number;
      readonly y: number;
      readonly size: number;
      readonly dotX: number;
      readonly dotY: number;
    };

const MAX_LABEL_ANGLE = (32 * Math.PI) / 180;
const MIN_UNIT_FONT = MAP_LABELS.minSize;
const MAX_UNIT_FONT = MAP_LABELS.maxSize;
/** A unit far larger than the view stops naming the screen it fills. */
const UNIT_FADE_START_RATIO = 1.5;
const UNIT_FADE_END_RATIO = 3.2;
/** Cross-axis share of a unit's width that its lettering may occupy. */
const UNIT_HEIGHT_SHARE = 0.5;
const PROVINCE_MIN_SCALE = MAP_ZOOM.provinceFrom;
const CAPITAL_MIN_SCALE = MAP_ZOOM.nationFrom;
const GRID_SIZE = 28;
/** Below this on-map area a territory waits for nation zoom to be named. */
const WORLD_UNIT_MIN_AREA = 26;

/** Average advance of a condensed capital, in ems, for planning only. */
const ADVANCE_EM = 0.5;

export interface LabelMoments {
  area: number;
  sumX: number;
  sumY: number;
  sumXX: number;
  sumXY: number;
  sumYY: number;
}

/** Fit a baseline to accumulated area moments. */
export function unitLabelFromMoments(
  tag: string,
  name: string,
  moments: LabelMoments,
): UnitLabel | null {
  const { area, sumX, sumY, sumXX, sumXY, sumYY } = moments;
  if (area <= 0) return null;
  const x = sumX / area;
  const y = sumY / area;
  const varianceX = sumXX / area - x * x;
  const varianceY = sumYY / area - y * y;
  const covariance = sumXY / area - x * y;
  const raw = 0.5 * Math.atan2(2 * covariance, varianceX - varianceY);
  const spread = Math.sqrt(((varianceX - varianceY) / 2) ** 2 + covariance ** 2);
  const major = Math.max(0, (varianceX + varianceY) / 2 + spread);
  const minor = Math.max(0, (varianceX + varianceY) / 2 - spread);
  // Text must stay readable: never steep, never upside down.
  let angle = raw;
  if (angle > Math.PI / 2) angle -= Math.PI;
  if (angle < -Math.PI / 2) angle += Math.PI;
  angle = Math.max(-MAX_LABEL_ANGLE, Math.min(MAX_LABEL_ANGLE, angle));
  // A nearly round shape has no meaningful axis, so it reads level.
  if (spread < 0.18 * (major + minor)) angle = 0;
  return {
    tag,
    name,
    x,
    y,
    angle,
    // A uniform shape spans 3.46 standard deviations; stay just inside that.
    halfLength: 1.6 * Math.sqrt(major),
    halfWidth: 1.6 * Math.sqrt(minor),
    area,
  };
}

/** Gazetteer of major seas under their usual English names of the period. */
const SEA_GAZETTEER: readonly (readonly [string, number, number, number, number, number])[] = [
  // name, lon, lat, min scale, max scale, size
  ["NORTH ATLANTIC OCEAN", -40, 32, 0, 5, 13],
  ["SOUTH ATLANTIC OCEAN", -16, -28, 0, 5, 13],
  ["NORTH PACIFIC OCEAN", -160, 26, 0, 5, 13],
  ["SOUTH PACIFIC OCEAN", -125, -30, 0, 5, 13],
  ["INDIAN OCEAN", 78, -24, 0, 5, 13],
  ["ARCTIC OCEAN", -10, 79, 0, 5, 12],
  ["SOUTHERN OCEAN", 60, -56, 0, 5, 12],
  ["Mediterranean Sea", 17.5, 34.6, 2.4, 22, 12],
  ["North Sea", 3.2, 56.4, 2.6, 26, 11.5],
  ["Baltic Sea", 19.2, 57, 3, 26, 11],
  ["Black Sea", 34.5, 43.3, 2.6, 24, 11.5],
  ["Caspian Sea", 50.7, 42, 2.8, 26, 11],
  ["Red Sea", 37.8, 21.2, 3, 26, 11],
  ["Arabian Sea", 63, 15, 2, 14, 12],
  ["Bay of Bengal", 89, 14, 2, 14, 12],
  ["South China Sea", 114, 14, 2, 14, 12],
  ["Sea of Japan", 135, 40.5, 2.6, 18, 11],
  ["Yellow Sea", 123.4, 35.8, 3, 20, 11],
  ["Sea of Okhotsk", 149, 54.2, 2, 14, 11.5],
  ["Bering Sea", -178, 58, 2, 14, 11.5],
  ["Caribbean Sea", -75, 15, 2, 14, 12],
  ["Gulf of Mexico", -90.5, 25.5, 2.2, 16, 11.5],
  ["Hudson Bay", -86, 59.5, 2, 14, 11.5],
  ["Coral Sea", 155, -17, 2, 14, 11.5],
  ["Tasman Sea", 161, -39, 2, 14, 11.5],
  ["Persian Gulf", 51.4, 26.8, 4.5, 26, 11],
  ["Bay of Biscay", -5, 45.6, 4, 26, 11],
  ["Adriatic Sea", 15.6, 42.7, 6.5, 30, 11],
  ["Aegean Sea", 25, 38.2, 6.5, 30, 11],
];

export function seaLabels(): readonly SeaLabel[] {
  return SEA_GAZETTEER.map(([name, lon, lat, minScale, maxScale, size]) => ({
    name,
    x: projectLon(lon),
    y: projectLat(lat),
    minScale,
    maxScale,
    size,
  }));
}

export interface ReservedBox {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface LabelPlacementOptions {
  /** Screen width covered along the left edge. */
  readonly insetLeft?: number;
  /** Interface controls drawn over the map; labels stay out of them. */
  readonly reserved?: readonly ReservedBox[];
  /** Overrides the budget the viewport size implies. */
  readonly budget?: number;
}

export interface LabelInputs {
  readonly units: readonly UnitLabel[];
  readonly provinces: readonly PointLabel[];
  readonly capitals: readonly PointLabel[];
  readonly seas: readonly SeaLabel[];
  readonly emphasisedTags: ReadonlySet<string>;
}

class OccupancyGrid {
  private readonly cells = new Map<number, { l: number; t: number; r: number; b: number }[]>();

  private forEachCell(left: number, top: number, right: number, bottom: number, visit: (key: number) => boolean): boolean {
    for (let row = Math.floor(top / GRID_SIZE); row <= Math.floor(bottom / GRID_SIZE); row += 1) {
      for (let column = Math.floor(left / GRID_SIZE); column <= Math.floor(right / GRID_SIZE); column += 1) {
        if (visit(row * 4096 + column)) return true;
      }
    }
    return false;
  }

  collides(left: number, top: number, right: number, bottom: number): boolean {
    return this.forEachCell(left, top, right, bottom, (key) =>
      (this.cells.get(key) ?? []).some(
        (box) => !(right < box.l || left > box.r || bottom < box.t || top > box.b),
      ),
    );
  }

  add(left: number, top: number, right: number, bottom: number): void {
    const box = { l: left, t: top, r: right, b: bottom };
    this.forEachCell(left, top, right, bottom, (key) => {
      const list = this.cells.get(key);
      if (list === undefined) this.cells.set(key, [box]);
      else list.push(box);
      return false;
    });
  }
}

/** Boxes along a tilted baseline, so tilted labels do not over-reserve space. */
function baselineBoxes(
  x: number,
  y: number,
  angle: number,
  width: number,
  height: number,
): readonly (readonly [number, number, number, number])[] {
  const steps = Math.max(1, Math.ceil(width / Math.max(height * 1.5, 24)));
  const boxes: (readonly [number, number, number, number])[] = [];
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  for (let index = 0; index < steps; index += 1) {
    const along = ((index + 0.5) / steps - 0.5) * width;
    const half = width / steps / 2;
    const cx = x + cos * along;
    const cy = y + sin * along;
    boxes.push([cx - half - 2, cy - height / 2 - 2, cx + half + 2, cy + height / 2 + 2]);
  }
  return boxes;
}

/**
 * Clip a baseline to a screen rectangle (Liang-Barsky). Returns the visible range
 * of the signed distance along the baseline, or null if none of it is visible.
 */
export function clipBaseline(
  x: number,
  y: number,
  angle: number,
  halfLength: number,
  left: number,
  top: number,
  right: number,
  bottom: number,
): readonly [number, number] | null {
  let first = -halfLength;
  let last = halfLength;
  const directions = [Math.cos(angle), Math.sin(angle)] as const;
  const clip = (origin: number, direction: number, low: number, high: number): boolean => {
    if (Math.abs(direction) < 1e-9) return origin >= low && origin <= high;
    const a = (low - origin) / direction;
    const b = (high - origin) / direction;
    first = Math.max(first, Math.min(a, b));
    last = Math.min(last, Math.max(a, b));
    return first < last;
  };
  if (!clip(x, directions[0], left, right) || !clip(y, directions[1], top, bottom)) return null;
  return [first, last];
}

/**
 * Place labels for a camera. Coordinates in the result are CSS pixels.
 * `insetRight` is screen width covered by a docked panel.
 */
export function placeLabels(
  inputs: LabelInputs,
  camera: Camera,
  viewport: MapViewportSize,
  insetRight = 0,
  options: LabelPlacementOptions = {},
): readonly PlacedLabel[] {
  const placed: PlacedLabel[] = [];
  const grid = new OccupancyGrid();
  // Interface controls over the map take their place in the grid before any label.
  for (const box of options.reserved ?? []) {
    grid.add(box.left, box.top, box.left + box.width, box.top + box.height);
  }
  let budget = options.budget ?? labelBudget(viewport.width, viewport.height);
  const toScreen = (x: number, y: number): { x: number; y: number } => ({
    x: viewport.width / 2 + shortestDeltaX(camera.x, x) * camera.scale,
    y: viewport.height / 2 + (y - camera.y) * camera.scale,
  });
  const margin = 12;
  const usableLeft = margin + (options.insetLeft ?? 0);
  const usableRight = viewport.width - insetRight - margin;
  const onScreen = (x: number, y: number, halfWidth: number, halfHeight: number): boolean =>
    x - halfWidth > usableLeft &&
    x + halfWidth < usableRight &&
    y - halfHeight > margin &&
    y + halfHeight < viewport.height - margin;

  const reserve = (boxes: readonly (readonly [number, number, number, number])[]): boolean => {
    for (const [left, top, right, bottom] of boxes) {
      if (grid.collides(left, top, right, bottom)) return false;
    }
    for (const [left, top, right, bottom] of boxes) grid.add(left, top, right, bottom);
    return true;
  };

  // Units first, largest on screen first, emphasised units ahead of all others.
  const units = [...inputs.units].sort((left, right) => {
    const leftEmphasis = inputs.emphasisedTags.has(left.tag) ? 1 : 0;
    const rightEmphasis = inputs.emphasisedTags.has(right.tag) ? 1 : 0;
    return rightEmphasis - leftEmphasis || right.area - left.area || left.tag.localeCompare(right.tag);
  });
  // Each level keeps room for what it adds: a province-level screen must not spend
  // the whole budget on the country names underneath.
  const unitBudget =
    camera.scale >= PROVINCE_MIN_SCALE
      ? Math.ceil(budget * 0.3)
      : camera.scale >= CAPITAL_MIN_SCALE
        ? Math.ceil(budget * 0.6)
        : Math.ceil(budget * 0.85);
  let unitsPlaced = 0;
  for (const unit of units) {
    const emphasised = inputs.emphasisedTags.has(unit.tag);
    if (!emphasised && unitsPlaced >= unitBudget) continue;
    if (!emphasised && camera.scale < CAPITAL_MIN_SCALE && unit.area < WORLD_UNIT_MIN_AREA) continue;
    const text = unit.name.toUpperCase();
    const center = toScreen(unit.x, unit.y);
    const lengthPx = unit.halfLength * 2 * camera.scale;
    const widthPx = unit.halfWidth * 2 * camera.scale;
    const spacingEm = text.length > 12 ? 0.04 : 0.09;
    const textPerEm = text.length * (ADVANCE_EM + spacingEm);
    // Only the part of the baseline on screen can carry the name.
    const visible = clipBaseline(
      center.x,
      center.y,
      unit.angle,
      lengthPx / 2,
      usableLeft,
      margin,
      usableRight,
      viewport.height - margin,
    );
    if (visible === null) continue;
    const visibleLength = visible[1] - visible[0];
    const size = Math.min(MAX_UNIT_FONT, (visibleLength * 0.94) / textPerEm, widthPx * UNIT_HEIGHT_SHARE);
    if (size < MIN_UNIT_FONT && !emphasised) continue;
    const finalSize = Math.max(size, emphasised ? 11 : MIN_UNIT_FONT);
    const fillRatio = lengthPx / Math.max(viewport.width, viewport.height);
    const opacity =
      fillRatio <= UNIT_FADE_START_RATIO
        ? 1
        : Math.max(0, 1 - (fillRatio - UNIT_FADE_START_RATIO) / (UNIT_FADE_END_RATIO - UNIT_FADE_START_RATIO));
    if (opacity <= 0.02) continue;
    const along = (visible[0] + visible[1]) / 2;
    const anchor = {
      x: center.x + Math.cos(unit.angle) * along,
      y: center.y + Math.sin(unit.angle) * along,
    };
    const textWidth = textPerEm * finalSize;
    if (!onScreen(anchor.x, anchor.y, Math.cos(unit.angle) * textWidth * 0.5, finalSize)) continue;
    const boxes = baselineBoxes(anchor.x, anchor.y, unit.angle, textWidth, finalSize * 1.2);
    if (!reserve(boxes)) continue;
    placed.push({
      kind: "unit",
      text,
      x: anchor.x,
      y: anchor.y,
      angle: unit.angle,
      size: finalSize,
      spacing: spacingEm * finalSize,
      emphasised,
      opacity,
    });
    unitsPlaced += 1;
    budget -= 1;
  }

  for (const sea of inputs.seas) {
    if (camera.scale < sea.minScale || camera.scale > sea.maxScale) continue;
    if (budget <= 0) break;
    const anchor = toScreen(sea.x, sea.y);
    const halfWidth = sea.name.length * sea.size * 0.34;
    if (sea.y > MAP_HEIGHT || !onScreen(anchor.x, anchor.y, halfWidth, sea.size)) continue;
    if (!reserve([[anchor.x - halfWidth, anchor.y - sea.size, anchor.x + halfWidth, anchor.y + sea.size]])) continue;
    placed.push({ kind: "sea", text: sea.name, x: anchor.x, y: anchor.y, size: sea.size });
    budget -= 1;
  }

  if (camera.scale >= CAPITAL_MIN_SCALE) {
    const capitals = [...inputs.capitals].sort(
      (left, right) => right.priority - left.priority || left.key.localeCompare(right.key),
    );
    for (const capital of capitals) {
      if (budget <= 0) break;
      const anchor = toScreen(capital.x, capital.y);
      const size = MAP_LABELS.minSize;
      const width = capital.name.length * size * 0.56;
      const textX = anchor.x + 6 + width / 2;
      if (!onScreen(textX, anchor.y, width / 2, size)) continue;
      if (!reserve([[anchor.x - 5, anchor.y - 8, textX + width / 2 + 2, anchor.y + 8]])) continue;
      placed.push({
        kind: "capital",
        text: capital.name,
        x: textX,
        y: anchor.y,
        size,
        dotX: anchor.x,
        dotY: anchor.y,
      });
      budget -= 1;
    }
  }

  if (camera.scale >= PROVINCE_MIN_SCALE) {
    const provinces = [...inputs.provinces].sort(
      (left, right) => right.priority - left.priority || left.key.localeCompare(right.key),
    );
    for (const province of provinces) {
      if (budget <= 0) break;
      const available = province.halfWidth * 2 * camera.scale;
      const size = Math.max(MAP_LABELS.minSize, Math.min(13, 11 + (available - 60) / 90));
      const width = province.name.length * size * 0.54;
      if (width > available * 1.15) continue;
      const anchor = toScreen(province.x, province.y);
      if (!onScreen(anchor.x, anchor.y, width / 2, size)) continue;
      if (!reserve([[anchor.x - width / 2 - 3, anchor.y - size * 0.7, anchor.x + width / 2 + 3, anchor.y + size * 0.7]])) continue;
      placed.push({
        kind: "province",
        text: province.name,
        x: anchor.x,
        y: anchor.y,
        size,
        dotX: anchor.x,
        dotY: anchor.y,
      });
      budget -= 1;
    }
  }
  return placed;
}
