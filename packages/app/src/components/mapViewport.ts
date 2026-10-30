/**
 * Pure map viewport math used by the WorldMap component and its tests.
 *
 * The map is drawn in a 1000x500 Miller-projected viewBox and letterboxed into
 * the available container. Keeping the scale/bounds/focal-point math here makes
 * the zoom limits and transform semantics testable without React Native.
 */

export const MAP_WIDTH = 1000;
export const MAP_HEIGHT = 500;
export const MAP_MIN_SCALE = 1;
export const MAP_MAX_SCALE = 18;
export const MAP_PREVIOUS_MAX_SCALE = 10;

export interface ViewportSize {
  readonly width: number;
  readonly height: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

export function clampScale(scale: number): number {
  if (!Number.isFinite(scale)) return MAP_MIN_SCALE;
  return Math.max(MAP_MIN_SCALE, Math.min(MAP_MAX_SCALE, scale));
}

/** Keep the map covering the viewport; never expose an empty edge. */
export function clampTranslate(translate: Point, scale: number): Point {
  const minX = Math.min(0, MAP_WIDTH - MAP_WIDTH * scale);
  const minY = Math.min(0, MAP_HEIGHT - MAP_HEIGHT * scale);
  return {
    x: Math.max(minX, Math.min(0, translate.x)),
    y: Math.max(minY, Math.min(0, translate.y)),
  };
}

/** Convert a pointer's local CSS pixel to the pre-transform viewBox point. */
export function screenPointToViewBox(
  localX: number,
  localY: number,
  size: ViewportSize,
  viewScale: number,
): Point | null {
  if (size.width <= 0 || size.height <= 0 || viewScale <= 0) return null;
  const drawnWidth = MAP_WIDTH * viewScale;
  const drawnHeight = MAP_HEIGHT * viewScale;
  const offsetX = (size.width - drawnWidth) / 2;
  const offsetY = (size.height - drawnHeight) / 2;
  return {
    x: (localX - offsetX) / viewScale,
    y: (localY - offsetY) / viewScale,
  };
}

/** Zoom around a focal point in viewBox coordinates. */
export function zoomAt(
  scale: number,
  translate: Point,
  pivot: Point,
  factor: number,
): { scale: number; translate: Point } {
  const next = clampScale(scale * factor);
  if (next === scale) return { scale, translate };
  const worldX = (pivot.x - translate.x) / scale;
  const worldY = (pivot.y - translate.y) / scale;
  return {
    scale: next,
    translate: clampTranslate(
      { x: pivot.x - worldX * next, y: pivot.y - worldY * next },
      next,
    ),
  };
}

/** Viewport scale used by `preserveAspectRatio="xMidYMid meet"`. */
export function viewportScale(size: ViewportSize): number {
  return Math.min(size.width / MAP_WIDTH, size.height / MAP_HEIGHT);
}
