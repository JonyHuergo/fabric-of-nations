/**
 * M11c.1 map viewport and zoom tests.
 *
 * Exercises the pure scale/bounds/focal-point math used by the WorldMap and
 * verifies the raised maximum zoom without mounting React Native.
 */

import {
  MAP_HEIGHT,
  MAP_MAX_SCALE,
  MAP_MIN_SCALE,
  MAP_PREVIOUS_MAX_SCALE,
  MAP_WIDTH,
  clampScale,
  clampTranslate,
  screenPointToViewBox,
  viewportScale,
  zoomAt,
} from "../../app/src/components/mapViewport.js";

describe("M11c.1 map viewport", () => {
  test("the maximum zoom is raised to 1.8x the previous limit", () => {
    expect(MAP_PREVIOUS_MAX_SCALE).toBe(10);
    expect(MAP_MAX_SCALE).toBe(18);
    expect(MAP_MAX_SCALE / MAP_PREVIOUS_MAX_SCALE).toBeGreaterThanOrEqual(1.5);
    expect(MAP_MAX_SCALE / MAP_PREVIOUS_MAX_SCALE).toBeLessThanOrEqual(2);
    expect(clampScale(999)).toBe(MAP_MAX_SCALE);
    expect(clampScale(0)).toBe(MAP_MIN_SCALE);
    expect(clampScale(Number.NaN)).toBe(MAP_MIN_SCALE);
  });

  test("zoom keeps the requested focal point stationary", () => {
    const before = { x: 500, y: 250 };
    const result = zoomAt(1, { x: 0, y: 0 }, before, 3);
    expect(result.scale).toBe(3);
    // The world point under the pivot must remain under the same pivot.
    const worldX = (before.x - 0) / 1;
    const worldY = (before.y - 0) / 1;
    expect((before.x - result.translate.x) / result.scale).toBeCloseTo(worldX, 6);
    expect((before.y - result.translate.y) / result.scale).toBeCloseTo(worldY, 6);
  });

  test("translate bounds cover the viewport at every supported scale", () => {
    for (const scale of [1, 2.25, 7.59375, 10, 18]) {
      const topLeft = clampTranslate({ x: 99999, y: 99999 }, scale);
      const bottomRight = clampTranslate({ x: -99999, y: -99999 }, scale);
      expect(topLeft.x).toBeLessThanOrEqual(0);
      expect(topLeft.y).toBeLessThanOrEqual(0);
      expect(bottomRight.x).toBeGreaterThanOrEqual(Math.min(0, MAP_WIDTH - MAP_WIDTH * scale));
      expect(bottomRight.y).toBeGreaterThanOrEqual(Math.min(0, MAP_HEIGHT - MAP_HEIGHT * scale));
      expect(bottomRight.x + MAP_WIDTH * scale).toBeGreaterThanOrEqual(MAP_WIDTH - 1e-9);
      expect(bottomRight.y + MAP_HEIGHT * scale).toBeGreaterThanOrEqual(MAP_HEIGHT - 1e-9);
    }
  });

  test("pointer-to-viewBox conversion handles letterboxing", () => {
    const size = { width: 1400, height: 500 };
    expect(viewportScale(size)).toBe(1);
    expect(screenPointToViewBox(700, 250, size, 1)).toEqual({ x: 500, y: 250 });
    const offCentre = screenPointToViewBox(900, 250, size, 1);
    expect(offCentre?.x).toBeCloseTo(700, 6);
    expect(screenPointToViewBox(700, 250, { width: 0, height: 0 }, 1)).toBeNull();
    const letterboxed = { width: 1000, height: 600 };
    const point = screenPointToViewBox(500, 300, letterboxed, viewportScale(letterboxed));
    expect(point?.x).toBeCloseTo(500, 6);
    expect(point?.y).toBeCloseTo(250, 6);
  });
});
