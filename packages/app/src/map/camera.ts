/**
 * Pure camera mathematics for the interactive map.
 *
 * The camera is a centre in map units and a scale in CSS pixels per map unit.
 * The world repeats horizontally, so x is kept in 0..MAP_WIDTH and any point has
 * a screen position on every visible copy of the world; vertically the camera is
 * bounded so the map always fills the viewport.
 */

import { MAP_HEIGHT, MAP_WIDTH } from "./projection";

export interface Camera {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

export interface MapViewportSize {
  readonly width: number;
  readonly height: number;
}

export interface MapBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/** Closest zoom: about 250 pixels per degree, the limit of the source data. */
export const CAMERA_MAX_SCALE = 90;

/** Smallest scale at which the map still covers the viewport in both axes. */
export function minimumScale(viewport: MapViewportSize): number {
  return Math.max(viewport.height / MAP_HEIGHT, viewport.width / MAP_WIDTH, 0.01);
}

export function wrapX(x: number): number {
  return ((x % MAP_WIDTH) + MAP_WIDTH) % MAP_WIDTH;
}

/** Shortest signed horizontal travel between two wrapped positions. */
export function shortestDeltaX(from: number, to: number): number {
  const delta = wrapX(to - from);
  return delta > MAP_WIDTH / 2 ? delta - MAP_WIDTH : delta;
}

/** Normalise a camera: valid scale, wrapped x, vertically inside the map. */
export function clampCamera(camera: Camera, viewport: MapViewportSize): Camera {
  const lowest = minimumScale(viewport);
  const scale = Math.min(CAMERA_MAX_SCALE, Math.max(lowest, camera.scale));
  const halfHeight = viewport.height / 2 / scale;
  const y =
    halfHeight * 2 >= MAP_HEIGHT
      ? MAP_HEIGHT / 2
      : Math.min(MAP_HEIGHT - halfHeight, Math.max(halfHeight, camera.y));
  return { x: wrapX(camera.x), y, scale };
}

export function screenToWorld(
  camera: Camera,
  viewport: MapViewportSize,
  screenX: number,
  screenY: number,
): { readonly x: number; readonly y: number } {
  return {
    x: camera.x + (screenX - viewport.width / 2) / camera.scale,
    y: camera.y + (screenY - viewport.height / 2) / camera.scale,
  };
}

/** Screen position of a world point on the world copy nearest the view centre. */
export function worldToScreen(
  camera: Camera,
  viewport: MapViewportSize,
  worldX: number,
  worldY: number,
): { readonly x: number; readonly y: number } {
  return {
    x: viewport.width / 2 + shortestDeltaX(camera.x, worldX) * camera.scale,
    y: viewport.height / 2 + (worldY - camera.y) * camera.scale,
  };
}

/** Pan by a screen-pixel drag; the map follows the pointer. */
export function panCamera(
  camera: Camera,
  viewport: MapViewportSize,
  deltaX: number,
  deltaY: number,
): Camera {
  return clampCamera(
    { x: camera.x - deltaX / camera.scale, y: camera.y - deltaY / camera.scale, scale: camera.scale },
    viewport,
  );
}

/** Zoom keeping the world point under a screen focus stationary. */
export function zoomCameraAt(
  camera: Camera,
  viewport: MapViewportSize,
  factor: number,
  focusX: number,
  focusY: number,
): Camera {
  const scale = Math.min(
    CAMERA_MAX_SCALE,
    Math.max(minimumScale(viewport), camera.scale * factor),
  );
  const world = screenToWorld(camera, viewport, focusX, focusY);
  return clampCamera(
    {
      x: world.x - (focusX - viewport.width / 2) / scale,
      y: world.y - (focusY - viewport.height / 2) / scale,
      scale,
    },
    viewport,
  );
}

/** Camera framing a bounds rectangle with a screen padding fraction. */
export function cameraForBounds(
  bounds: MapBounds,
  viewport: MapViewportSize,
  paddingFraction = 0.16,
): Camera {
  const width = Math.max(bounds.maxX - bounds.minX, 0.5);
  const height = Math.max(bounds.maxY - bounds.minY, 0.5);
  const usable = 1 - paddingFraction * 2;
  const scale = Math.min(
    (viewport.width * usable) / width,
    (viewport.height * usable) / height,
  );
  return clampCamera(
    {
      x: (bounds.minX + bounds.maxX) / 2,
      y: (bounds.minY + bounds.maxY) / 2,
      scale,
    },
    viewport,
  );
}

/** World rectangle visible through the viewport (x may leave 0..MAP_WIDTH). */
export function visibleBounds(camera: Camera, viewport: MapViewportSize): MapBounds {
  const halfWidth = viewport.width / 2 / camera.scale;
  const halfHeight = viewport.height / 2 / camera.scale;
  return {
    minX: camera.x - halfWidth,
    maxX: camera.x + halfWidth,
    minY: camera.y - halfHeight,
    maxY: camera.y + halfHeight,
  };
}

/**
 * World-copy offsets needed to cover a view. `geometryMinX/MaxX` is the extent
 * of the geometry itself, which may overhang the 0..MAP_WIDTH seam.
 */
export function visibleWorldOffsets(
  view: MapBounds,
  geometryMinX: number,
  geometryMaxX: number,
): readonly number[] {
  const first = Math.floor((view.minX - geometryMaxX) / MAP_WIDTH) + 1;
  const last = Math.ceil((view.maxX - geometryMinX) / MAP_WIDTH) - 1;
  const offsets: number[] = [];
  for (let copy = first; copy <= last; copy += 1) offsets.push(copy * MAP_WIDTH);
  return offsets;
}

/** Fractional-frame exponential smoothing that is independent of frame rate. */
export function smoothingAlpha(elapsedMs: number, timeConstantMs: number): number {
  return 1 - Math.exp(-elapsedMs / timeConstantMs);
}
