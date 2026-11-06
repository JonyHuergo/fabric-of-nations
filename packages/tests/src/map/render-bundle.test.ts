/**
 * Render-bundle integrity: the compiled display geometry must describe exactly
 * the authoritative provinces, stay finite, and keep islands, holes, multipolygons
 * and the antimeridian intact.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

import { MAP_HEIGHT, MAP_WIDTH, projectLat, projectLon } from "../../../app/src/map/projection.js";
import {
  LAND_MASK,
  PROVINCE_ID_MASK,
  parseRenderBundle,
  type LineLayer,
  type RenderBundle,
} from "../../../app/src/map/renderBundle.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const FILES = [
  "provinces_1900.json",
  "provinces_asia_1900.json",
  "provinces_africa_1900.json",
  "provinces_americas_1900.json",
  "provinces_oceania_1900.json",
];

interface SourceProvince {
  readonly id: number;
  readonly key: string;
  readonly mapTag: string;
  readonly initialOwnerTag: string;
  readonly rings: readonly (readonly number[])[];
  readonly holes: readonly number[];
  readonly area: number;
}

const sha256 = (bytes: Buffer | string): string => createHash("sha256").update(bytes).digest("hex");
const buffers = FILES.map((file) => readFileSync(join(ROOT, "packages/data/data/map", file)));
const provinces: SourceProvince[] = buffers.flatMap(
  (bytes) => (JSON.parse(bytes.toString("utf8")) as { provinces: SourceProvince[] }).provinces,
);
const bundle: RenderBundle = parseRenderBundle(
  gunzipSync(readFileSync(join(ROOT, "packages/app/public/map/world-render-v1.bin"))),
);

function rasterCell(lon: number, lat: number): number {
  const { width, height, cells } = bundle.raster;
  const column = Math.floor((projectLon(lon) / MAP_WIDTH) * width);
  const row = Math.floor((projectLat(lat) / MAP_HEIGHT) * height);
  return cells[row * width + column] ?? 0;
}

describe("render bundle identity", () => {
  test("was compiled from the current province data", () => {
    const expected = sha256(buffers.map((bytes) => sha256(bytes)).join(""));
    expect(bundle.provinceSourceHash).toBe(expected);
  });

  test("preserves every province, in catalogue order, with no merging", () => {
    expect(bundle.provinceCount).toBe(provinces.length);
    // D-128: 1,689 provinces less the duplicate Greenland and the dissolved German residual.
    expect(provinces.length).toBe(1687);
    expect([...bundle.provinceIds]).toEqual(provinces.map((province) => province.id));
    expect(new Set(bundle.provinceIds).size).toBe(provinces.length);
  });
});

describe("render bundle geometry", () => {
  test("every province has drawable triangles", () => {
    const seen = new Set<number>();
    for (let index = 0; index < bundle.fill.indices.length; index += 1) {
      seen.add(bundle.fillProvince[bundle.fill.indices[index] ?? 0] ?? 0);
    }
    const missing = provinces.filter((_, index) => !seen.has(index + 1)).map((province) => province.key);
    expect(missing).toEqual([]);
  });

  test("all coordinates are finite and inside the projected extent", () => {
    const layers = [bundle.fill, ...bundle.land, ...bundle.lakes];
    for (const layer of layers) {
      expect(layer.positions.length).toBeGreaterThan(0);
      for (let index = 0; index < layer.positions.length; index += 2) {
        const x = layer.positions[index] ?? Number.NaN;
        const y = layer.positions[index + 1] ?? Number.NaN;
        if (!Number.isFinite(x) || !Number.isFinite(y) || x < -40 || x > 1040 || y < -1 || y > 760) {
          throw new Error(`coordinate out of range: ${String(x)}, ${String(y)}`);
        }
      }
      for (const index of layer.indices) {
        if (index * 2 >= layer.positions.length) throw new Error("triangle index out of range");
      }
    }
    const lines = [...bundle.coast, ...bundle.borders, ...bundle.rivers];
    for (const layer of lines) {
      for (const value of layer.segments) {
        if (!Number.isFinite(value)) throw new Error("non-finite line coordinate");
      }
    }
  });

  test("multipolygons keep every ring, including holes outside any outer ring", () => {
    let start = 0;
    const counts = new Int32Array(provinces.length);
    for (const province of bundle.fillProvince) counts[province - 1] = (counts[province - 1] ?? 0) + 1;
    provinces.forEach((province, index) => {
      const expected = province.rings.reduce((sum, ring) => sum + ring.length / 2, 0);
      if (counts[index] !== expected) {
        throw new Error(`${province.key}: ${String(counts[index])} vertices, expected ${String(expected)}`);
      }
      start += expected;
    });
    expect(start).toBe(bundle.fillProvince.length);
    expect(provinces.some((province) => province.rings.length > 100)).toBe(true);
  });

  test("provinces with holes render with the holes cut out", () => {
    const withHoles = provinces.map((province, index) => ({ province, index })).filter(({ province }) => province.holes.length > 0);
    expect(withHoles.length).toBeGreaterThan(0);
    for (const { province, index } of withHoles) {
      const areas = province.rings.map((flat) => {
        const points: (readonly [number, number])[] = [];
        let lon = 0;
        let lat = 0;
        for (let at = 0; at < flat.length; at += 2) {
          lon += flat[at] ?? 0;
          lat += flat[at + 1] ?? 0;
          points.push([projectLon(lon / 1000), projectLat(lat / 1000)]);
        }
        let sum = 0;
        for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
          sum += (points[j]?.[0] ?? 0) * (points[i]?.[1] ?? 0) - (points[i]?.[0] ?? 0) * (points[j]?.[1] ?? 0);
        }
        return Math.abs(sum / 2);
      });
      const holeSet = new Set(province.holes);
      const filled = areas.reduce((sum, area, ring) => sum + (holeSet.has(ring) ? -area : area), 0);
      const rendered = bundle.stats[index * 6] ?? 0;
      expect(Math.abs(rendered - filled)).toBeLessThan(Math.max(filled * 0.02, 0.02));
    }
  });

  test("levels of detail get strictly lighter and small islands survive them", () => {
    for (const layers of [bundle.land, bundle.coast, bundle.borders]) expect(layers).toHaveLength(3);
    const landCounts = bundle.land.map((layer) => layer.positions.length);
    expect(landCounts[0]).toBeGreaterThan(landCounts[1] ?? 0);
    expect(landCounts[1]).toBeGreaterThan(landCounts[2] ?? 0);
    const lengths = bundle.borders.map((layer) => layer.ids.length);
    expect(lengths[0]).toBeGreaterThan(lengths[2] ?? 0);
    // Malta and Tonga stay on the coarsest level as land.
    for (const [lon, lat] of [[14.4, 35.9], [-175.2, -21.2]] as const) {
      const near = (layer: { positions: Float32Array }): boolean => {
        const x = projectLon(lon);
        const y = projectLat(lat);
        for (let index = 0; index < layer.positions.length; index += 2) {
          if (Math.hypot((layer.positions[index] ?? 0) - x, (layer.positions[index + 1] ?? 0) - y) < 0.6) return true;
        }
        return false;
      };
      const coarsest = bundle.land[2];
      expect(coarsest).toBeDefined();
      if (coarsest !== undefined) expect(near(coarsest)).toBe(true);
    }
  });

  test("line sides reference real provinces and coasts have one side", () => {
    const check = (layer: LineLayer, coast: boolean): void => {
      for (let index = 0; index < layer.ids.length; index += 2) {
        const a = layer.ids[index] ?? 0;
        const b = layer.ids[index + 1] ?? 0;
        if (a > provinces.length || b > provinces.length) throw new Error("line id out of range");
        if (coast ? b !== 0 : a === 0 || b === 0 || a === b) throw new Error(`bad sides ${String(a)}/${String(b)}`);
      }
    };
    for (const layer of bundle.coast) check(layer, true);
    for (const layer of bundle.borders) check(layer, false);
  });

  test("the antimeridian and south-pole cuts are not drawn as coast", () => {
    for (const layer of bundle.coast) {
      for (let index = 0; index < layer.segments.length; index += 4) {
        const x0 = layer.segments[index] ?? 0;
        const x1 = layer.segments[index + 2] ?? 0;
        // Land is cut at +-180; real coast may come within a few cells of it.
        const onSeam = (x: number): boolean => x < 0.012 || x > MAP_WIDTH - 0.012;
        if (onSeam(x0) && onSeam(x1) && Math.abs(x0 - x1) < 0.012) {
          throw new Error(`seam segment at x=${String(x0)}`);
        }
      }
    }
  });

  test("provinces crossing the antimeridian stay continuous", () => {
    expect(bundle.extentMaxX).toBeGreaterThan(MAP_WIDTH);
    expect(bundle.extentMinX).toBeLessThan(0);
  });
});

describe("render bundle raster", () => {
  test("marks land and sea at known points", () => {
    expect((rasterCell(2.35, 48.86) & LAND_MASK) !== 0).toBe(true);
    expect((rasterCell(-30, 40) & LAND_MASK) !== 0).toBe(false);
    expect((rasterCell(-160, 0) & LAND_MASK) !== 0).toBe(false);
  });

  test("land cells carry a province, except unclaimed Antarctica", () => {
    const { cells, width, height } = bundle.raster;
    const antarcticRow = Math.floor((projectLat(-60) / MAP_HEIGHT) * height);
    let land = 0;
    let unowned = 0;
    for (let row = 0; row < antarcticRow; row += 1) {
      for (let column = 0; column < width; column += 1) {
        const cell = cells[row * width + column] ?? 0;
        if ((cell & LAND_MASK) === 0) continue;
        land += 1;
        if ((cell & PROVINCE_ID_MASK) === 0) unowned += 1;
      }
    }
    expect(land).toBeGreaterThan(500_000);
    expect(unowned).toBe(0);
    const antarctic = cells[(height - 2) * width + 100] ?? 0;
    expect(antarctic & PROVINCE_ID_MASK).toBe(0);
  });

  test("the raster agrees with the province it covers", () => {
    const paris = provinces[(rasterCell(2.35, 48.86) & PROVINCE_ID_MASK) - 1];
    expect(paris?.mapTag).toBe("FRA");
    const bavaria = provinces[(rasterCell(11.6, 48.5) & PROVINCE_ID_MASK) - 1];
    expect(bavaria?.key).toBe("deu-bavaria");
  });
});

describe("historical water", () => {
  const isLake = (lon: number, lat: number): boolean => {
    const x = projectLon(lon);
    const y = projectLat(lat);
    const layer = bundle.lakes[0];
    if (layer === undefined) return false;
    for (let index = 0; index < layer.indices.length; index += 3) {
      const [a, b, c] = [layer.indices[index] ?? 0, layer.indices[index + 1] ?? 0, layer.indices[index + 2] ?? 0];
      const ax = layer.positions[a * 2] ?? 0;
      const ay = layer.positions[a * 2 + 1] ?? 0;
      const bx = layer.positions[b * 2] ?? 0;
      const by = layer.positions[b * 2 + 1] ?? 0;
      const cx = layer.positions[c * 2] ?? 0;
      const cy = layer.positions[c * 2 + 1] ?? 0;
      const d1 = (x - bx) * (ay - by) - (ax - bx) * (y - by);
      const d2 = (x - cx) * (by - cy) - (bx - cx) * (y - cy);
      const d3 = (x - ax) * (cy - ay) - (cx - ax) * (y - ay);
      if (!((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))) return true;
    }
    return false;
  };

  test("the Great Lakes, Victoria and the full Aral Sea are water", () => {
    expect(isLake(-87.5, 47.7)).toBe(true); // Lake Superior
    expect(isLake(33, -1)).toBe(true); // Lake Victoria
    expect(isLake(59.5, 45)).toBe(true); // the 1900 Aral Sea, not its modern remnant
  });

  test("modern reservoirs are absent", () => {
    expect(isLake(32.8, 22.6)).toBe(false); // Lake Nasser
    expect(isLake(-0.1, 7)).toBe(false); // Lake Volta
    expect(isLake(38.5, 56)).toBe(false); // Rybinsk area
  });
});
