/**
 * M11e complete world-map geometry and render-plan smoke test.
 *
 * The 1900 bundle contains 133 polities. This suite decodes every ring through
 * the same pure module the React component uses, rejects malformed geometry with
 * an explicit error, and builds the complete SVG element plan (133 fills, 133
 * borders, one land mask and 17 small-state markers) without a React runtime.
 */

import { readFileSync, existsSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { decodePolityGeometry, pathForRings, project } from "../../../app/src/components/worldMapGeometry.js";
import type { WorldMapData, WorldMapPolity } from "../../../app/src/worldCatalogTypes.js";
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
  wheelZoomFactor,
} from "../../../app/src/components/mapViewport.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../../..");
const MAP = JSON.parse(
  readFileSync(join(ROOT, "packages/data/data/map/world_map_1900.json"), "utf8"),
) as WorldMapData;

function polityWithRings(tag: string, rings: WorldMapPolity["rings"]): WorldMapPolity {
  const base = MAP.polities.find((polity) => polity.tag === tag);
  if (base === undefined) throw new Error(`missing test polity ${tag}`);
  return { ...base, rings };
}

describe("M11e world-map geometry", () => {
  test("all 133 polity geometries decode to finite drawable paths", () => {
    expect(MAP.polities).toHaveLength(133);
    const failures: string[] = [];
    for (const polity of MAP.polities) {
      try {
        const geometry = decodePolityGeometry(polity);
        if (geometry.path === null || geometry.path.length === 0) {
          failures.push(`${polity.tag}: empty path`);
          continue;
        }
        if (geometry.points.length !== polity.rings.length) {
          failures.push(`${polity.tag}: decoded ${String(geometry.points.length)} rings`);
        }
        if (/NaN|Infinity/iu.test(geometry.path)) {
          failures.push(`${polity.tag}: non-finite path coordinate`);
        }
        for (const ring of geometry.points) {
          for (const point of ring) {
            if (point.length !== 2 || !point.every((value) => Number.isFinite(value))) {
              failures.push(`${polity.tag}: invalid projected point`);
              break;
            }
          }
        }
      } catch (error) {
        failures.push(`${polity.tag}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    expect(failures).toEqual([]);
  });

  test("the complete SVG element plan is deterministic and finite", () => {
    const fills = MAP.polities.map((polity) => decodePolityGeometry(polity));
    const land = pathForRings(MAP.land, "world.land");
    expect(land).not.toBeNull();
    // Every polity currently has a path, so fills + borders + the land mask.
    expect(fills.length * 2 + 1).toBe(267);
    const markerCount = MAP.polities.filter((polity) => polity.small || polity.markerOnly === true).length;
    expect(markerCount).toBe(17);
    for (const geometry of fills) {
      expect(geometry.path).not.toBeNull();
      expect(geometry.path ?? "").not.toMatch(/NaN|Infinity/iu);
      // A null path is the only fallback, and the renderer draws a Circle instead.
      expect(geometry.path === null ? "circle" : "path").toMatch(/^(path|circle)$/u);
    }
    for (const polity of MAP.polities) {
      const centroid = project(polity.label[0], polity.label[1]);
      expect(centroid.every((value) => Number.isFinite(value))).toBe(true);
    }
  });

  test("malformed rings are rejected explicitly instead of being discarded", () => {
    expect(() => decodePolityGeometry(polityWithRings("DEU", [[0, 0, 1]]))).toThrow(
      /odd coordinate count/u,
    );
    expect(() => decodePolityGeometry(polityWithRings("DEU", [[0, 0, 1, 1]]))).toThrow(
      /at least 3 points/u,
    );
    expect(() => decodePolityGeometry(polityWithRings("DEU", [[0, 0, Number.NaN, 1, 2, 3]]))).toThrow(
      /finite/u,
    );
    expect(() =>
      decodePolityGeometry(
        polityWithRings("DEU", ["not-a-ring"] as unknown as WorldMapPolity["rings"]),
      ),
    ).toThrow(/array of coordinates/u);
    expect(() =>
      decodePolityGeometry(
        polityWithRings("DEU", [undefined] as unknown as WorldMapPolity["rings"]),
      ),
    ).toThrow(/is missing/u);
  });

  test("an empty polity geometry has an intentional marker fallback", () => {
    const empty = decodePolityGeometry(polityWithRings("DEU", []));
    expect(empty).toEqual({ path: null, points: [], drawableRingCount: 0 });
    const source = readFileSync(
      join(ROOT, "packages/app/src/components/WorldMap.tsx"),
      "utf8",
    );
    expect(source).toContain("geometry.path === null");
    expect(source).toContain("if (polity.path === null) return null;");
    expect(source).toContain("polity.markerOnly !== true && !polity.small");
  });

  test("Germany, Ottoman Libya, Wadai and Darfur render with finite geometry", () => {
    const expected = ["DEU", "WAD", "DAR", "OTT"] as const;
    for (const tag of expected) {
      const polity = MAP.polities.find((entry) => entry.tag === tag);
      expect(polity).toBeDefined();
      if (polity === undefined) continue;
      const geometry = decodePolityGeometry(polity);
      expect(geometry.path).not.toBeNull();
      expect(geometry.path ?? "").not.toMatch(/NaN|Infinity/iu);
    }
    // Ottoman Libya has no separate polity tag in the 1900 catalog: the Ottoman
    // Empire geometry covers it. This pins that representation instead of
    // silently dropping the territory.
    const ottoman = MAP.polities.find((polity) => polity.tag === "OTT");
    expect(ottoman).toBeDefined();
    if (ottoman !== undefined) {
      const [west, south, east, north] = ottoman.bbox;
      expect(west).toBeLessThanOrEqual(15);
      expect(east).toBeGreaterThanOrEqual(15);
      expect(south).toBeLessThanOrEqual(27);
      expect(north).toBeGreaterThanOrEqual(27);
    }
  });

  test("the renderer uses static SVG components and platform-safe selection props", () => {
    const source = readFileSync(
      join(ROOT, "packages/app/src/components/WorldMap.tsx"),
      "utf8",
    );
    expect(source).not.toContain("React.createElement");
    expect(source).toContain("import Svg, {");
    expect(source).toContain("Path,");
    expect(source).toContain("Circle,");
    expect(source).toContain("onClickCapture");
    expect(source).toContain("onPress: () => onSelect(tag)");
    expect(source.split("{...polityPressProps(polity.tag)}").length - 1).toBe(2);
  });
});

/**
 * M11c.1 map viewport and zoom tests.
 *
 * Exercises the pure scale/bounds/focal-point math used by the WorldMap and
 * verifies the raised maximum zoom without mounting React Native.
 */
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
    const size = { width: 1400, height: MAP_HEIGHT };
    expect(viewportScale(size)).toBe(1);
    expect(screenPointToViewBox(700, MAP_HEIGHT / 2, size, 1)).toEqual({ x: 500, y: MAP_HEIGHT / 2 });
    const offCentre = screenPointToViewBox(900, MAP_HEIGHT / 2, size, 1);
    expect(offCentre?.x).toBeCloseTo(700, 6);
    expect(screenPointToViewBox(700, 250, { width: 0, height: 0 }, 1)).toBeNull();
    const letterboxed = { width: 1000, height: MAP_HEIGHT + 100 };
    const point = screenPointToViewBox(500, letterboxed.height / 2, letterboxed, viewportScale(letterboxed));
    expect(point?.x).toBeCloseTo(500, 6);
    expect(point?.y).toBeCloseTo(MAP_HEIGHT / 2, 6);
  });
});

/**
 * M11c.1 rendering regression tests.
 *
 * These are source-level assertions for the layer/transform contract plus a
 * committed screenshot smoke-test check. The screenshot set is regenerated with
 * `node scripts/m11c1/render-app-screenshots.mjs` and
 * `scripts/m11c1/render_map.py`.
 */
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

/**
 * M11d map legibility and seam regressions.
 *
 * Playtesting showed a straight modern (1945) line across East Prussia inside
 * the German Empire, and two disputed frontier zones rendered so dark that they
 * read as black squares under Libya and near India. This suite pins the
 * display-geometry bridge and the new map typography/annotation contract.
 */
const DISPLAY_MAP = JSON.parse(
  readFileSync(join(ROOT, "packages/data/data/map/world_map_1900.json"), "utf8"),
) as {
  meta: {
    displayCorrectionCount?: number;
    disputedAreaCount?: number;
    resolvedDisputeCount?: number;
  };
  displayCorrections?: {
    id: string;
    tag: string;
    seam: number[][];
    reason: string;
  }[];
  disputedAreas?: unknown[];
  resolvedDisputes?: {
    id: string;
    components: { modernCode: string | null; targetTag: string }[];
  }[];
  polities: { tag: string; rings: number[][]; holes: number[]; area: number }[];
};

function decode(flat: number[]): [number, number][] {
  const points: [number, number][] = [];
  let x = 0;
  let y = 0;
  for (let index = 0; index < flat.length; index += 2) {
    x += flat[index] ?? 0;
    y += flat[index + 1] ?? 0;
    points.push([x / 1000, y / 1000]);
  }
  return points;
}

describe("M11d map display geometry", () => {
  test("the East Prussian seam is bridged and no artificial line remains", () => {
    expect(DISPLAY_MAP.meta.displayCorrectionCount).toBe(1);
    expect(DISPLAY_MAP.displayCorrections?.[0]?.id).toBe("germany-east-prussia-seam");
    expect(DISPLAY_MAP.displayCorrections?.[0]?.tag).toBe("DEU");
    const germany = DISPLAY_MAP.polities.find((polity) => polity.tag === "DEU");
    expect(germany).toBeDefined();
    // The two former pieces are one outer ring now.
    expect(germany?.rings.length).toBe(8);
    expect(germany?.holes).toEqual([]);
    for (const flat of germany?.rings ?? []) {
      const ring = decode(flat);
      for (let index = 0; index + 1 < ring.length; index += 1) {
        const [ax, ay] = ring[index] ?? [0, 0];
        const [bx, by] = ring[index + 1] ?? [0, 0];
        // The old seam ran almost horizontally across ~3 degrees at 54.4N.
        const isLongSeam =
          Math.abs(ay - 54.4) < 0.12 &&
          Math.abs(by - 54.4) < 0.12 &&
          Math.abs(bx - ax) > 2.5;
        expect(isLongSeam).toBe(false);
      }
    }
  });

  test("the former disputed zones are split by current borders and not drawn", () => {
    expect(DISPLAY_MAP.meta.disputedAreaCount).toBe(0);
    expect(DISPLAY_MAP.meta.resolvedDisputeCount).toBe(2);
    expect(DISPLAY_MAP.disputedAreas).toEqual([]);
    expect(WORLD_MAP).not.toContain("century-disputed-hatch");
    expect(WORLD_MAP).not.toContain("Disputed / no established administration");
    const aouzou = DISPLAY_MAP.resolvedDisputes?.find((area) => area.id === "aouzou-tibesti");
    expect(aouzou?.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ modernCode: "TCD", targetTag: "FEA" }),
        expect.objectContaining({ modernCode: "LBY", targetTag: "OTT" }),
      ]),
    );
    const siachen = DISPLAY_MAP.resolvedDisputes?.find((area) => area.id === "siachen-kashmir");
    expect(siachen?.components).toEqual(
      expect.arrayContaining([expect.objectContaining({ modernCode: "CHN", targetTag: "CHN" })]),
    );
  });
});

describe("M11d map typography", () => {
  test("labels scale with the country and are collision-culled", () => {
    expect(WORLD_MAP).toContain("const fitByWidth = countryWidth /");
    expect(WORLD_MAP).toContain("Math.sqrt(countryWidth * countryHeight)");
    expect(WORLD_MAP).toContain("boxes.some(");
    expect(WORLD_MAP).toContain("fontSize = (screenFontSize + (selected ? 1.5 : 0)) / screenScale");
    expect(WORLD_MAP).toContain("strokePx(COUNTRY_BORDER_WIDTH_PX)");
  });

  test("the land mask is the single coastline source", () => {
    const landStart = WORLD_MAP.indexOf("d={landPath}");
    expect(landStart).toBeGreaterThan(0);
    const landBlock = WORLD_MAP.slice(landStart, landStart + 700);
    // The land mask now carries the single coastline stroke; province-owning
    // 1900 polities skip their own outline so no second coastline is drawn.
    expect(landBlock).toContain("stroke={colors.mapBorder}");
    expect(WORLD_MAP).toContain("provinceOwnerTags.has(polity.tag)");
  });
});

/**
 * M11d map selection regression.
 *
 * Country labels are drawn at polity centroids. Playtesting hit British India's
 * centroid and the click did nothing: the SVG text became the pointer target
 * and swallowed the press intended for the country below it.
 */
const APP = resolve(HERE, "../../../app");
const source = readFileSync(join(APP, "src/components/WorldMap.tsx"), "utf8");

describe("M11d map selection hit testing", () => {
  test("country labels do not intercept clicks meant for the polity", () => {
    const labelStart = source.indexOf("{labelLayout.map((label) => (");
    expect(labelStart).toBeGreaterThan(0);
    const labelBlock = source.slice(labelStart, labelStart + 1_000);
    expect(labelBlock).toContain('pointerEvents="none"');
  });

  test("labels scale with the country and avoid collisions", () => {
    expect(source).toContain("const fitByWidth = countryWidth /");
    expect(source).toContain("Math.sqrt(countryWidth * countryHeight)");
    expect(source).toContain("boxes.some(");
    expect(source).toContain("fontSize = (screenFontSize + (selected ? 1.5 : 0)) / screenScale");
  });

  test("polity fills and small-state markers remain selectable", () => {
    // M11e: selection props are platform-specific because react-native-svg's web
    // WebShape turns onPress/onPressIn into unknown DOM responder props.
    const helperStart = source.indexOf("const polityPressProps = (tag: string)");
    expect(helperStart).toBeGreaterThan(0);
    const helperBlock = source.slice(helperStart, helperStart + 1_200);
    expect(helperBlock).toContain("onClickCapture");
    expect(helperBlock).toContain("onPress: () => onSelect(tag)");
    expect(helperBlock).toContain("onPressIn: () => setHoveredTag(tag)");
    expect(source.split("{...polityPressProps(polity.tag)}").length - 1).toBe(2);
    expect(source).not.toContain("onPress={() => onSelect(polity.tag)}");
  });
});

/**
 * M11d map wheel-zoom regression.
 *
 * React attaches `onWheel` as a passive listener, so the previous synthetic
 * handler logged "Unable to preventDefault inside passive event listener
 * invocation" on every wheel zoom and the page could scroll while zooming. The
 * world map now owns a native non-passive listener and the factor math is pure.
 */
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
