/**
 * M11c.1 rendering regression tests.
 *
 * These are source-level assertions for the layer/transform contract plus a
 * committed screenshot smoke-test check. The screenshot set is regenerated with
 * `node scripts/m11c1/render-app-screenshots.mjs` and
 * `scripts/m11c1/render_map.py`.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");
const WORLD_MAP = readFileSync(join(ROOT, "packages/app/src/components/WorldMap.tsx"), "utf8");
const VIEWPORT = readFileSync(join(ROOT, "packages/app/src/components/mapViewport.ts"), "utf8");

describe("M11c.1 rendering contract", () => {
  test("the ocean, transformed land mask, fills, borders and markers share one order", () => {
    const ocean = WORLD_MAP.indexOf("<Rect x={0} y={0}");
    const group = WORLD_MAP.indexOf("<G transform={`translate");
    const land = WORLD_MAP.indexOf("d={landPath}");
    const polities = WORLD_MAP.indexOf("{polities.map");
    const disputed = WORLD_MAP.indexOf("{disputedAreas.map");
    expect(ocean).toBeGreaterThanOrEqual(0);
    expect(group).toBeGreaterThan(ocean);
    expect(land).toBeGreaterThan(group);
    expect(polities).toBeGreaterThan(land);
    expect(disputed).toBeGreaterThan(polities);
    // The land mask must use the even-odd rule and must not capture pointer events.
    expect(WORLD_MAP).toContain("fillRule=\"evenodd\"");
    expect(WORLD_MAP).toContain("pointerEvents=\"none\"");
  });

  test("the land path is not drawn outside the zoom transform", () => {
    const group = WORLD_MAP.indexOf("<G transform={`translate");
    const land = WORLD_MAP.indexOf("d={landPath}");
    // Only one land path should exist, and it must be after the transform group.
    expect(WORLD_MAP.split("d={landPath}").length - 1).toBe(1);
    expect(land).toBeGreaterThan(group);
  });

  test("wheel, trackpad and pinch zoom are wired, and the maximum is raised", () => {
    expect(WORLD_MAP).toContain("onWheel: handleWheel");
    expect(WORLD_MAP).toContain("const handleWheel");
    expect(WORLD_MAP).toContain("screenPointToViewBox");
    expect(WORLD_MAP).toContain("onPanResponderMove");
    expect(VIEWPORT).toContain("MAP_MAX_SCALE = 18");
    expect(VIEWPORT).toContain("MAP_PREVIOUS_MAX_SCALE = 10");
    expect(WORLD_MAP).toContain("MapButton label=\"+\" accessibilityLabel=\"Zoom in\"");
    expect(WORLD_MAP).toContain("Reset map view");
  });

  test("the committed screenshot smoke set exists and is valid PNG", () => {
    const images = [
      "world-global.png",
      "europe-wheel-zoom.png",
      "world-prev-max.png",
      "world-new-max.png",
      "zoom-pan-new-max.png",
      "zoom-reset.png",
      "germany.png",
      "north-africa.png",
      "libya-aouzou.png",
      "bolivia-brazil.png",
      "canada-newfoundland.png",
    ];
    for (const image of images) {
      const path = join(ROOT, "docs/images/m11c1", image);
      expect(existsSync(path)).toBe(true);
      expect(statSync(path).size).toBeGreaterThan(1000);
      const header = [...readFileSync(path).subarray(0, 8)];
      expect(header).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    }
  });
});
