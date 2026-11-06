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
const ROOT = resolve(HERE, "../../../..");
const WORLD_MAP = readFileSync(join(ROOT, "packages/app/src/components/WorldMap.tsx"), "utf8");
const VIEWPORT = readFileSync(join(ROOT, "packages/app/src/components/mapViewport.ts"), "utf8");

describe("M11c.1 rendering contract", () => {
  test("the ocean, transformed land mask, fills, borders and markers share one order", () => {
    const ocean = WORLD_MAP.indexOf("<Rect x={0} y={0}");
    const group = WORLD_MAP.indexOf("<G transform={`translate");
    const land = WORLD_MAP.indexOf("d={landPath}");
    const polities = WORLD_MAP.indexOf("{polities.map");
    const borders = WORLD_MAP.indexOf("key={`border-${polity.tag}`}");
    expect(ocean).toBeGreaterThanOrEqual(0);
    expect(group).toBeGreaterThan(ocean);
    expect(land).toBeGreaterThan(group);
    expect(polities).toBeGreaterThan(land);
    expect(borders).toBeGreaterThan(polities);
    expect(WORLD_MAP).not.toContain("disputedAreas.map");
    // The land mask must use the even-odd rule and must not capture pointer events.
    expect(WORLD_MAP).toContain("fillRule=\"evenodd\"");
    expect(WORLD_MAP).toContain("pointerEvents=\"none\"");
  });

  test("the land path is not drawn outside the zoom transform", () => {
    const group = WORLD_MAP.indexOf("<G transform={`translate");
    // M12a added a second land path: the neutral fill and the coastline re-stroke
    // that hides the province hairline along the shore. Both must share the zoom
    // transform; neither may be drawn at world scale outside it.
    const landPaths = [...WORLD_MAP.matchAll(/d=\{landPath\}/gu)].map(
      (match) => match.index ?? -1,
    );
    expect(landPaths.length).toBe(2);
    for (const land of landPaths) {
      expect(land).toBeGreaterThan(group);
    }
  });

  test("wheel, trackpad and pinch zoom are wired, and the maximum is raised", () => {
    // M11d: the wheel listener is native and explicitly non-passive so
    // preventDefault works; a React onWheel prop would be passive on the web.
    expect(WORLD_MAP).toContain('node.addEventListener("wheel", handleWheel, { passive: false })');
    expect(WORLD_MAP).not.toContain("onWheel:");
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
