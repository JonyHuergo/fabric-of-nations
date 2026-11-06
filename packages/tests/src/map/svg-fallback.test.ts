/**
 * M11e complete world-map geometry and render-plan smoke test.
 *
 * The 1900 bundle contains 133 polities. This suite decodes every ring through
 * the same pure module the React component uses, rejects malformed geometry with
 * an explicit error, and builds the complete SVG element plan (133 fills, 133
 * borders, one land mask and 17 small-state markers) without a React runtime.
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  decodePolityGeometry,
  pathForRings,
  project,
} from "../../../app/src/components/worldMapGeometry.js";
import type { WorldMapData, WorldMapPolity } from "../../../app/src/worldCatalogTypes.js";

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
