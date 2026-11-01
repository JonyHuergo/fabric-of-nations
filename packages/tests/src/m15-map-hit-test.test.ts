/**
 * Province hit testing against the real catalogue and raster.
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

import { MAP_WIDTH, projectLat, projectLon } from "../../app/src/map/projection.js";
import { createProvinceHitIndex } from "../../app/src/map/hitTest.js";
import { parseRenderBundle } from "../../app/src/map/renderBundle.js";
import { PROVINCE_MAP_1900 } from "../../app/src/provinceMapBundle.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const bundle = parseRenderBundle(
  gunzipSync(readFileSync(join(ROOT, "packages/app/public/map/world-render-v1.bin"))),
);
const provinces = PROVINCE_MAP_1900.provinces;
const index = createProvinceHitIndex(provinces, bundle.raster);
const keyAt = (lon: number, lat: number): string | null => {
  const found = index.pick(projectLon(lon), projectLat(lat));
  return found < 0 ? null : (provinces[found]?.key ?? null);
};

describe("province hit testing", () => {
  test("named places resolve to their provinces", () => {
    expect(keyAt(2.35, 48.86)).toBe("fra-paris");
    expect(keyAt(11.6, 48.5)).toBe("deu-bavaria");
    expect(keyAt(14.2, 37.5)).toBe("ita-sicily");
    expect(keyAt(146.6, -42)).toBe("oc-aus-tasmania");
  });

  test("open sea and unclaimed Antarctica pick nothing", () => {
    expect(keyAt(-30, 40)).toBeNull();
    expect(keyAt(-160, 0)).toBeNull();
    expect(keyAt(80, -30)).toBeNull();
    expect(keyAt(40, -75)).toBeNull();
  });

  test("the point inside each province picks that province", () => {
    // Labels sit inside a province unless the authored point is on a sliver.
    let wrong = 0;
    for (const [position, province] of provinces.entries()) {
      if (province.residual) continue;
      const [lon = 0, lat = 0] = province.label;
      if (index.pick(projectLon(lon), projectLat(lat)) !== position) wrong += 1;
    }
    expect(wrong / provinces.length).toBeLessThan(0.02);
  });

  test("the result does not depend on which world copy is clicked", () => {
    for (const [lon, lat] of [[11.6, 48.5], [139.7, 36], [-172, 66], [178.5, -17.8]] as const) {
      const x = projectLon(lon);
      const y = projectLat(lat);
      const first = index.pick(x, y);
      expect(first).toBeGreaterThanOrEqual(0);
      expect(index.pick(x + MAP_WIDTH, y)).toBe(first);
      expect(index.pick(x - MAP_WIDTH, y)).toBe(first);
    }
  });

  test("land beyond the coarse province rings resolves through the raster", () => {
    // Fine-coast land the 1:50m-clipped rings miss still has an owning province.
    const { cells, width, height } = bundle.raster;
    let checked = 0;
    let unresolved = 0;
    for (let row = 200; row < height * 0.7; row += 37) {
      for (let column = 0; column < width; column += 41) {
        if (((cells[row * width + column] ?? 0) & 0x8000) === 0) continue;
        checked += 1;
        const x = ((column + 0.5) / width) * MAP_WIDTH;
        const y = ((row + 0.5) / height) * (MAP_WIDTH * 0.6571124436158528);
        if (index.pick(x, y) < 0) unresolved += 1;
      }
    }
    expect(checked).toBeGreaterThan(1000);
    expect(unresolved).toBe(0);
  });

  test("small islands can be reached with the pick radius", () => {
    // A point a few cells off Nauru misses, and the radius brings it back.
    const x = projectLon(166.93) + 0.6;
    const y = projectLat(-0.53);
    expect(index.pick(x, y)).toBe(-1);
    const near = index.pickNear(x, y, 1.5);
    expect(near).toBeGreaterThanOrEqual(0);
    expect(provinces[near]?.key).toMatch(/nauru/iu);
  });

  test("picking is cheap enough for every pointer move", () => {
    const started = performance.now();
    let hits = 0;
    let step = 0;
    for (let lat = -55; lat < 75; lat += 0.5) {
      for (let lon = -179; lon < 180; lon += 3) {
        if (index.pick(projectLon(lon + (step % 3)), projectLat(lat)) >= 0) hits += 1;
        step += 1;
      }
    }
    const perPick = (performance.now() - started) / step;
    expect(hits).toBeGreaterThan(1000);
    expect(perPick).toBeLessThan(1);
  });
});
