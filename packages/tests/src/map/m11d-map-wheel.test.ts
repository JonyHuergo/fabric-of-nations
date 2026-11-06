/**
 * M11d map wheel-zoom regression.
 *
 * React attaches `onWheel` as a passive listener, so the previous synthetic
 * handler logged "Unable to preventDefault inside passive event listener
 * invocation" on every wheel zoom and the page could scroll while zooming. The
 * world map now owns a native non-passive listener and the factor math is pure.
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { wheelZoomFactor } from "../../../app/src/components/mapViewport.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, "../../../app");

describe("M11d map wheel zoom", () => {
  test("the wheel factor is multiplicative and directionally correct", () => {
    expect(wheelZoomFactor(0, false)).toBe(1);
    expect(wheelZoomFactor(Number.NaN, false)).toBe(1);
    expect(wheelZoomFactor(-100, false)).toBeGreaterThan(1);
    expect(wheelZoomFactor(100, false)).toBeLessThan(1);
    // Trackpad pinch (ctrl+wheel) is more sensitive than a wheel notch.
    expect(wheelZoomFactor(-100, true)).toBeGreaterThan(wheelZoomFactor(-100, false));
  });

  test("the map uses a non-passive native wheel listener", () => {
    const source = readFileSync(join(APP, "src/components/WorldMap.tsx"), "utf8");
    expect(source).toContain('node.addEventListener("wheel", handleWheel, { passive: false })');
    expect(source).toContain('node.removeEventListener("wheel", handleWheel)');
    expect(source).toContain("event.preventDefault();");
    // A React onWheel prop would be passive again.
    expect(source).not.toContain("onWheel:");
    expect(source).toContain("wheelZoomFactor(deltaY, event.ctrlKey === true)");
  });
});
