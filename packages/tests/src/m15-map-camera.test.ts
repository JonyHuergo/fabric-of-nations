/**
 * Projection and camera mathematics of the interactive map.
 */

import { project } from "../../app/src/components/worldMapGeometry.js";
import {
  CAMERA_MAX_SCALE,
  cameraForBounds,
  clampCamera,
  minimumScale,
  panCamera,
  screenToWorld,
  shortestDeltaX,
  visibleBounds,
  visibleWorldOffsets,
  worldToScreen,
  wrapX,
  zoomCameraAt,
  type Camera,
} from "../../app/src/map/camera.js";
import {
  MAP_HEIGHT,
  MAP_NORTH_LAT,
  MAP_SOUTH_LAT,
  MAP_WIDTH,
  projectLat,
  projectLon,
  unprojectX,
  unprojectY,
} from "../../app/src/map/projection.js";

const VIEW = { width: 1400, height: 800 };

/** East-west over north-south stretch of a cylindrical projection at a latitude. */
function shapeStretch(yOf: (lat: number) => number, lat: number): number {
  const step = 0.01;
  const northSouth = Math.abs(yOf(lat + step) - yOf(lat - step)) / (2 * step);
  const eastWest = (MAP_WIDTH / 360) / Math.cos((lat * Math.PI) / 180);
  return eastWest / northSouth;
}

describe("projection", () => {
  test("round-trips geographic coordinates", () => {
    for (const lon of [-179, -60, 0, 12.5, 179]) {
      expect(unprojectX(projectLon(lon))).toBeCloseTo(lon, 9);
    }
    for (const lat of [-77, -33, 0, 48.8, 83]) {
      expect(unprojectY(projectLat(lat))).toBeCloseTo(lat, 9);
    }
  });

  test("spans the declared extent and is monotonic", () => {
    expect(projectLat(MAP_NORTH_LAT)).toBeCloseTo(0, 9);
    expect(projectLat(MAP_SOUTH_LAT)).toBeCloseTo(MAP_HEIGHT, 9);
    expect(projectLon(-180)).toBe(0);
    expect(projectLon(180)).toBe(MAP_WIDTH);
    for (let lat = -80; lat < 84; lat += 2) {
      expect(projectLat(lat + 2)).toBeLessThan(projectLat(lat));
    }
  });

  test("longitude is linear, so world copies line up exactly", () => {
    expect(projectLon(190) - projectLon(-170)).toBeCloseTo(MAP_WIDTH, 9);
  });

  test("the SVG renderer shares the projection", () => {
    expect(project(12, 48)).toEqual([projectLon(12), projectLat(48)]);
    expect(() => project(Number.NaN, 0)).toThrow(RangeError);
  });

  test("Europe is closer to true shape than under the former Miller projection", () => {
    const miller = (lat: number): number => {
      const radians = (lat * Math.PI) / 180;
      return -((1.25 * Math.log(Math.tan(Math.PI / 4 + 0.4 * radians))) * MAP_WIDTH) / (2 * Math.PI);
    };
    for (const lat of [40, 50, 60]) {
      expect(Math.abs(shapeStretch(projectLat, lat) - 1)).toBeLessThan(Math.abs(shapeStretch(miller, lat) - 1));
    }
    expect(shapeStretch(projectLat, 50)).toBeLessThan(1.08);
  });
});

describe("camera", () => {
  const camera: Camera = { x: 500, y: 300, scale: 6 };

  test("screen and world conversions are inverse", () => {
    const world = screenToWorld(camera, VIEW, 333, 222);
    const screen = worldToScreen(camera, VIEW, world.x, world.y);
    expect(screen.x).toBeCloseTo(333, 8);
    expect(screen.y).toBeCloseTo(222, 8);
  });

  test("zoom keeps the focal point stationary", () => {
    const before = screenToWorld(camera, VIEW, 900, 200);
    for (const factor of [1.3, 2, 0.6]) {
      const next = zoomCameraAt(camera, VIEW, factor, 900, 200);
      const after = screenToWorld(next, VIEW, 900, 200);
      expect(after.x).toBeCloseTo(before.x, 8);
      expect(after.y).toBeCloseTo(before.y, 8);
    }
  });

  test("zoom respects its limits", () => {
    expect(zoomCameraAt(camera, VIEW, 1e6, 700, 400).scale).toBe(CAMERA_MAX_SCALE);
    expect(zoomCameraAt(camera, VIEW, 1e-6, 700, 400).scale).toBe(minimumScale(VIEW));
  });

  test("the map always covers the viewport", () => {
    for (const viewport of [VIEW, { width: 500, height: 900 }, { width: 2200, height: 500 }]) {
      const scale = minimumScale(viewport);
      expect(MAP_HEIGHT * scale).toBeGreaterThanOrEqual(viewport.height - 1e-6);
      expect(MAP_WIDTH * scale).toBeGreaterThanOrEqual(viewport.width - 1e-6);
      const view = visibleBounds(clampCamera({ x: 10, y: -500, scale: 0 }, viewport), viewport);
      expect(view.minY).toBeGreaterThanOrEqual(-1e-6);
      expect(view.maxY).toBeLessThanOrEqual(MAP_HEIGHT + 1e-6);
    }
  });

  test("panning follows the pointer and wraps horizontally forever", () => {
    let moving = clampCamera({ x: 990, y: 300, scale: 4 }, VIEW);
    const world = screenToWorld(moving, VIEW, 700, 400);
    const panned = panCamera(moving, VIEW, -80, 0);
    const after = screenToWorld(panned, VIEW, 620, 400);
    expect(wrapX(after.x)).toBeCloseTo(wrapX(world.x), 8);
    for (let step = 0; step < 500; step += 1) moving = panCamera(moving, VIEW, -700, 0);
    expect(moving.x).toBeGreaterThanOrEqual(0);
    expect(moving.x).toBeLessThan(MAP_WIDTH);
  });

  test("a resize keeps the centre and re-clamps", () => {
    const small = { width: 800, height: 500 };
    const resized = clampCamera(camera, small);
    expect(resized.x).toBe(camera.x);
    expect(resized.y).toBe(camera.y);
    const atFloor = clampCamera({ x: 500, y: 10, scale: minimumScale(VIEW) }, { width: 1800, height: 1000 });
    expect(atFloor.scale).toBeCloseTo(minimumScale({ width: 1800, height: 1000 }), 9);
  });

  test("the shortest route crosses the antimeridian", () => {
    expect(shortestDeltaX(990, 10)).toBeCloseTo(20, 9);
    expect(shortestDeltaX(10, 990)).toBeCloseTo(-20, 9);
    expect(shortestDeltaX(100, 400)).toBeCloseTo(300, 9);
  });

  test("a point near the seam appears on the nearest world copy", () => {
    const seam = { x: 995, y: 300, scale: 6 };
    const screen = worldToScreen(seam, VIEW, 5, 300);
    expect(screen.x).toBeCloseTo(VIEW.width / 2 + 60, 8);
  });

  test("framing a bounds rectangle centres it", () => {
    const framed = cameraForBounds({ minX: 500, maxX: 540, minY: 180, maxY: 210 }, VIEW);
    expect(framed.x).toBeCloseTo(520, 6);
    expect(framed.y).toBeCloseTo(195, 6);
    const view = visibleBounds(framed, VIEW);
    expect(view.minX).toBeLessThan(500);
    expect(view.maxX).toBeGreaterThan(540);
  });

  test("world copies cover the view and any seam overhang", () => {
    expect(visibleWorldOffsets({ minX: 100, maxX: 300, minY: 0, maxY: 100 }, -6, 1027)).toEqual([0]);
    expect(visibleWorldOffsets({ minX: 900, maxX: 1100, minY: 0, maxY: 100 }, -6, 1027)).toEqual([0, 1000]);
    expect(visibleWorldOffsets({ minX: -100, maxX: 20, minY: 0, maxY: 100 }, -6, 1027)).toEqual([-1000, 0]);
    // Geometry overhanging the seam needs the neighbouring copy just inside it.
    expect(visibleWorldOffsets({ minX: 10, maxX: 20, minY: 0, maxY: 100 }, -6, 1027)).toEqual([-1000, 0]);
  });
});
