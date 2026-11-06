/**
 * Label candidates and placement.
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

import { WORLD_CATALOG } from "../../../app/src/generated/worldCatalog.js";
import { buildProvinceStates } from "../../../app/src/map/mapModes.js";
import { MAP_WIDTH, unprojectX } from "../../../app/src/map/projection.js";
import { parseRenderBundle } from "../../../app/src/map/renderBundle.js";
import { buildUnitLabels, neighbourPairs } from "../../../app/src/map/unitLabels.js";
import { PROVINCE_MAP_1900 } from "../../../app/src/provinceMapBundle.js";
import {
  clipBaseline,
  placeLabels,
  seaLabels,
  unitLabelFromMoments,
  type LabelInputs,
  type LabelMoments,
  type PlacedLabel,
  type PointLabel,
  type UnitLabel,
} from "../../../app/src/map/labels.js";

const VIEW = { width: 1400, height: 800 };

/** Moments of a uniform rectangle rotated by `angle`, centred at (x, y). */
function rectangleMoments(x: number, y: number, width: number, height: number, angle: number): LabelMoments {
  const area = width * height;
  const major = (width * width) / 12;
  const minor = (height * height) / 12;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const xx = major * cos * cos + minor * sin * sin;
  const yy = major * sin * sin + minor * cos * cos;
  const xy = (major - minor) * sin * cos;
  return {
    area,
    sumX: area * x,
    sumY: area * y,
    sumXX: area * (xx + x * x),
    sumXY: area * (xy + x * y),
    sumYY: area * (yy + y * y),
  };
}

function unit(tag: string, x: number, y: number, width: number, height: number, angle = 0): UnitLabel {
  const label = unitLabelFromMoments(tag, tag, rectangleMoments(x, y, width, height, angle));
  if (label === null) throw new Error("no label");
  return label;
}

const inputs = (overrides: Partial<LabelInputs> = {}): LabelInputs => ({
  units: [],
  provinces: [],
  capitals: [],
  seas: [],
  emphasisedTags: new Set(),
  ...overrides,
});

function boxOf(label: PlacedLabel): readonly [number, number, number, number] {
  const width = label.text.length * label.size * 0.54;
  return [label.x - width / 2, label.y - label.size / 2, label.x + width / 2, label.y + label.size / 2];
}

describe("unit label fitting", () => {
  test("the baseline follows the principal axis", () => {
    const label = unit("A", 100, 100, 80, 20, 0.3);
    expect(label.x).toBeCloseTo(100, 6);
    expect(label.y).toBeCloseTo(100, 6);
    expect(label.angle).toBeCloseTo(0.3, 6);
    expect(label.halfLength).toBeGreaterThan(label.halfWidth * 2);
    expect(label.halfLength).toBeLessThan(40);
  });

  test("a steep shape never produces steep text", () => {
    const label = unit("A", 100, 100, 100, 10, 1.45);
    expect(Math.abs(label.angle)).toBeLessThanOrEqual((32 * Math.PI) / 180 + 1e-9);
  });

  test("a round shape reads level", () => {
    expect(unit("A", 100, 100, 50, 49, 0.9).angle).toBe(0);
  });

  test("empty moments produce no label", () => {
    expect(unitLabelFromMoments("A", "A", { area: 0, sumX: 0, sumY: 0, sumXX: 0, sumXY: 0, sumYY: 0 })).toBeNull();
  });
});

describe("baseline clipping", () => {
  test("keeps an unclipped baseline whole", () => {
    expect(clipBaseline(100, 100, 0, 50, 0, 0, 1000, 800)).toEqual([-50, 50]);
  });

  test("returns the visible part of a baseline crossing the edge", () => {
    const visible = clipBaseline(20, 100, 0, 50, 12, 12, 1000, 800);
    expect(visible?.[0]).toBeCloseTo(-8, 9);
    expect(visible?.[1]).toBeCloseTo(50, 9);
  });

  test("reports a baseline that is entirely off screen", () => {
    expect(clipBaseline(-200, 100, 0, 50, 12, 12, 1000, 800)).toBeNull();
  });
});

describe("placement", () => {
  const camera = { x: 500, y: 300, scale: 4 };

  test("names a unit that fits and skips one too small to read", () => {
    const placed = placeLabels(
      inputs({ units: [unit("LARGE", 500, 300, 60, 30), unit("TINY", 400, 250, 2, 1)] }),
      camera,
      VIEW,
    );
    expect(placed.map((label) => label.text)).toEqual(["LARGE"]);
  });

  test("regression: a label clipped against the screen edge is still placed", () => {
    // The text used to fill the clipped baseline exactly and then fail the
    // on-screen test by a rounding error, which dropped the United States.
    const near = unit("EDGE", 330, 300, 80, 40);
    const placed = placeLabels(inputs({ units: [near] }), camera, VIEW);
    expect(placed).toHaveLength(1);
    expect(placed[0]?.x).toBeGreaterThan(12);
  });

  test("the selected country is always named when it is on screen", () => {
    const tiny = unit("TINY", 500, 300, 2, 1);
    const plain = placeLabels(inputs({ units: [tiny] }), camera, VIEW);
    const emphasised = placeLabels(inputs({ units: [tiny], emphasisedTags: new Set(["TINY"]) }), camera, VIEW);
    expect(plain).toHaveLength(0);
    expect(emphasised).toHaveLength(1);
  });

  test("labels stay clear of a docked panel", () => {
    const panelled = placeLabels(inputs({ units: [unit("EAST", 600, 300, 60, 30)] }), camera, VIEW, 360);
    for (const label of panelled) expect(label.x).toBeLessThan(VIEW.width - 360);
  });

  test("placed labels do not overlap", () => {
    const provinces: PointLabel[] = [];
    for (let index = 0; index < 400; index += 1) {
      provinces.push({
        key: `p${String(index)}`,
        name: `Province ${String(index)}`,
        x: 460 + (index % 40) * 2,
        y: 270 + Math.floor(index / 40) * 6,
        priority: 1000 - index,
        halfWidth: 3,
      });
    }
    const placed = placeLabels(inputs({ provinces }), { x: 500, y: 300, scale: 18 }, VIEW);
    expect(placed.length).toBeGreaterThan(10);
    expect(placed.length).toBeLessThan(400);
    const boxes = placed.map(boxOf);
    boxes.forEach((a, i) => {
      boxes.slice(i + 1).forEach((b) => {
        const overlap = !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3]);
        expect(overlap).toBe(false);
      });
    });
  });

  test("province names appear only at provincial zoom, largest first", () => {
    const provinces: PointLabel[] = [
      { key: "a", name: "Alpha", x: 500, y: 300, priority: 2, halfWidth: 8 },
      { key: "b", name: "Beta", x: 501, y: 300, priority: 9, halfWidth: 8 },
    ];
    expect(placeLabels(inputs({ provinces }), { x: 500, y: 300, scale: 4 }, VIEW)).toHaveLength(0);
    const close = placeLabels(inputs({ provinces }), { x: 500, y: 300, scale: 12 }, VIEW);
    expect(close[0]?.text).toBe("Beta");
  });

  test("placement is deterministic", () => {
    const content = inputs({
      units: [unit("A", 500, 300, 60, 30), unit("B", 560, 300, 60, 30)],
      seas: seaLabels(),
    });
    expect(placeLabels(content, camera, VIEW)).toEqual(placeLabels(content, camera, VIEW));
  });

  test("labels stay anchored to geography as the camera moves", () => {
    const content = inputs({ units: [unit("A", 500, 300, 40, 20)] });
    const first = placeLabels(content, { x: 500, y: 300, scale: 6 }, VIEW)[0];
    const second = placeLabels(content, { x: 510, y: 300, scale: 6 }, VIEW)[0];
    expect((first?.x ?? 0) - (second?.x ?? 0)).toBeCloseTo(60, 6);
  });

  test("sea labels respect their zoom band", () => {
    const seas = seaLabels();
    expect(seas.length).toBeGreaterThan(20);
    const world = placeLabels(inputs({ seas }), { x: 500, y: 300, scale: 1.4 }, VIEW);
    expect(world.some((label) => label.text === "NORTH ATLANTIC OCEAN")).toBe(true);
    const close = placeLabels(inputs({ seas }), { x: 500, y: 300, scale: 30 }, VIEW);
    expect(close.some((label) => label.text === "NORTH ATLANTIC OCEAN")).toBe(false);
  });
});

describe("unit labels on the real map", () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
  const bundle = parseRenderBundle(
    gunzipSync(readFileSync(join(root, "packages/app/public/map/world-render-v1.bin"))),
  );
  const states = buildProvinceStates(PROVINCE_MAP_1900, WORLD_CATALOG, null);
  const names = new Map(WORLD_CATALOG.entries.map((entry) => [entry.tag, entry.commonName] as const));
  const built = buildUnitLabels({
    provinces: PROVINCE_MAP_1900.provinces,
    unitTags: states.map((state) => state.unitTag),
    stats: bundle.stats,
    neighbours: neighbourPairs(bundle.borders[0]?.ids ?? new Uint16Array()),
    nameOf: (tag) => names.get(tag) ?? tag,
  });
  const labelOf = (tag: string): UnitLabel => {
    const label = built.labels.find((candidate) => candidate.tag === tag);
    if (label === undefined) throw new Error(`no label for ${tag}`);
    return label;
  };

  test("every political unit has a label and a frame", () => {
    expect(new Set(states.map((state) => state.unitTag)).size).toBe(133);
    expect(built.labels).toHaveLength(133);
    expect(built.bounds.size).toBe(133);
  });

  test("regression: scattered coverage provinces do not drag a name across the world", () => {
    // The French Pacific's coverage province has rings on three oceans, which once
    // placed its name over southern Africa.
    const lon = unprojectX(((labelOf("FPO").x % MAP_WIDTH) + MAP_WIDTH) % MAP_WIDTH);
    expect(lon > 150 || lon < -120).toBe(true);
  });

  test("each label sits within the land it names", () => {
    for (const label of built.labels) {
      const frame = built.bounds.get(label.tag);
      if (frame === undefined) throw new Error(label.tag);
      const margin = 1;
      if (
        label.x < frame.minX - margin ||
        label.x > frame.maxX + margin ||
        label.y < frame.minY - margin ||
        label.y > frame.maxY + margin
      ) {
        throw new Error(`${label.tag} label lies outside its land`);
      }
    }
  });

  test("the main landmass decides the label", () => {
    // Metropolitan France, Britain and the contiguous United States, not Alaska.
    expect(unprojectX(labelOf("USA").x)).toBeGreaterThan(-115);
    expect(unprojectX(labelOf("USA").x)).toBeLessThan(-85);
    expect(unprojectX(labelOf("GBR").x)).toBeGreaterThan(-5);
    expect(unprojectX(labelOf("GBR").x)).toBeLessThan(1);
  });
});
