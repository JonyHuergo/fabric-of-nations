/**
 * M11d map legibility and seam regressions.
 *
 * Playtesting showed a straight modern (1945) line across East Prussia inside
 * the German Empire, and two disputed frontier zones rendered so dark that they
 * read as black squares under Libya and near India. This suite pins the
 * display-geometry bridge and the new map typography/annotation contract.
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");
const MAP = JSON.parse(
  readFileSync(join(ROOT, "packages/data/data/map/world_map_1900.json"), "utf8"),
) as {
  meta: { displayCorrectionCount?: number };
  displayCorrections?: {
    id: string;
    tag: string;
    seam: number[][];
    reason: string;
  }[];
  polities: { tag: string; rings: number[][]; holes: number[]; area: number }[];
};
const WORLD_MAP = readFileSync(join(ROOT, "packages/app/src/components/WorldMap.tsx"), "utf8");

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
    expect(MAP.meta.displayCorrectionCount).toBe(1);
    expect(MAP.displayCorrections?.[0]?.id).toBe("germany-east-prussia-seam");
    expect(MAP.displayCorrections?.[0]?.tag).toBe("DEU");
    const germany = MAP.polities.find((polity) => polity.tag === "DEU");
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

  test("the disputed zones are drawn as a visible hatch with a label", () => {
    expect(WORLD_MAP).toContain('id="century-disputed-hatch"');
    expect(WORLD_MAP).toContain('fill="url(#century-disputed-hatch)"');
    expect(WORLD_MAP).toContain("Disputed");
    // The old dark translucent fill must not come back.
    expect(WORLD_MAP).not.toContain("rgba(216, 179, 74, 0.18)");
  });
});

describe("M11d map typography", () => {
  test("labels scale with the country and are collision-culled", () => {
    expect(WORLD_MAP).toContain("const fitByWidth = countryWidth /");
    expect(WORLD_MAP).toContain("Math.sqrt(countryWidth * countryHeight)");
    expect(WORLD_MAP).toContain("boxes.some(");
    expect(WORLD_MAP).toContain("fontSize = (screenFontSize + (selected ? 1.5 : 0)) / screenScale");
    expect(WORLD_MAP).toContain('strokeWidth={1.1 / scale}');
  });

  test("the land mask no longer draws a second coastline", () => {
    const landStart = WORLD_MAP.indexOf("d={landPath}");
    expect(landStart).toBeGreaterThan(0);
    const landBlock = WORLD_MAP.slice(landStart, landStart + 500);
    expect(landBlock).toContain('stroke="none"');
  });
});
