/**
 * Palette, map modes and the province style table.
 */

import type { SimulationSnapshot } from "@century/sim-worker";

import { WORLD_CATALOG } from "../../app/src/generated/worldCatalog.js";
import { PROVINCE_MAP_1900 } from "../../app/src/provinceMapBundle.js";
import {
  MAP_MODES,
  STYLE_FLAG_PLAYER,
  STYLE_FLAG_SELECTED_OWNER,
  STYLE_FLAG_SELECTED_UNIT,
  STYLE_TABLE_ROWS,
  buildProvinceStates,
  buildProvinceStyleTable,
  selectionFlags,
  type MapDataContext,
} from "../../app/src/map/mapModes.js";
import {
  STATE_COLORS,
  hexToRgb,
  politicalColor,
  stateColor,
  type Rgb,
} from "../../app/src/map/politicalPalette.js";
import { bandMix, levelOfDetail } from "../../app/src/map/mapStyle.js";
import { encodeProvinceEconomyTable } from "@century/sim-worker";

const entryByTag = new Map(WORLD_CATALOG.entries.map((entry) => [entry.tag, entry] as const));
const provinces = PROVINCE_MAP_1900.provinces;
const provinceIndex = new Map(provinces.map((province, index) => [province.id, index] as const));

function contextFor(snapshot: SimulationSnapshot | null, highlightMarketId: number | null = null): MapDataContext {
  return {
    provinces,
    states: buildProvinceStates(PROVINCE_MAP_1900, WORLD_CATALOG, snapshot),
    entryByTag,
    marketNames: new Map(WORLD_CATALOG.markets.map((market) => [market.id, market.name] as const)),
    highlightMarketId,
  };
}

/** A minimal snapshot carrying only the fields map modes read. */
function snapshotWith(
  changes: readonly { provinceId: number; ownerPolityId?: number; controllerPolityId?: number }[],
): SimulationSnapshot {
  return {
    provinces: changes.map((change) => {
      const province = provinces[provinceIndex.get(change.provinceId) ?? 0];
      const owner = change.ownerPolityId ?? province?.initialOwnerPolityId ?? 0;
      return {
        provinceId: change.provinceId,
        ownerPolityId: owner,
        controllerPolityId: change.controllerPolityId ?? owner,
        controlledSinceDay: null,
        claimantPolityIds: [],
        specialStatus: "ordinary",
      };
    }),
    provinceTable: encodeProvinceEconomyTable([], []),
    professions: [],
    markets: [],
  } as unknown as SimulationSnapshot;
}

/** sRGB to OKLab, optionally through a simulated deuteranopia matrix. */
function oklab(color: Rgb, deuteranopia: boolean): readonly [number, number, number] {
  const toLinear = (value: number): number => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  };
  let [r, g, b] = [toLinear(color[0]), toLinear(color[1]), toLinear(color[2])];
  if (deuteranopia) {
    // Machado, Oliveira and Fernandes (2009), severity 1.0.
    [r, g, b] = [
      0.367322 * r + 0.860646 * g - 0.227968 * b,
      0.280085 * r + 0.672501 * g + 0.047413 * b,
      -0.01182 * r + 0.04294 * g + 0.968881 * b,
    ];
    [r, g, b] = [Math.max(0, r), Math.max(0, g), Math.max(0, b)];
  }
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function distance(a: Rgb, b: Rgb, deuteranopia: boolean): number {
  const [l1, a1, b1] = oklab(a, deuteranopia);
  const [l2, a2, b2] = oklab(b, deuteranopia);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

/** Polity pairs that actually touch on the map. */
function neighbouringPolities(): readonly (readonly [string, string])[] {
  const pairs = new Map<string, readonly [string, string]>();
  for (const border of PROVINCE_MAP_1900.borders) {
    if (border.b < 0) continue;
    const a = provinces[provinceIndex.get(border.a) ?? -1]?.mapTag;
    const b = provinces[provinceIndex.get(border.b) ?? -1]?.mapTag;
    if (a === undefined || b === undefined || a === b) continue;
    pairs.set(a < b ? `${a}|${b}` : `${b}|${a}`, a < b ? [a, b] : [b, a]);
  }
  return [...pairs.values()];
}

/** Same sovereign family, whose separation is by design the polity border. */
function sameRealm(left: string, right: string): boolean {
  const realm = (tag: string): string => entryByTag.get(tag)?.sovereignTag ?? tag;
  return realm(left) === realm(right);
}

describe("political palette", () => {
  test("every sovereign state has an authored colour", () => {
    const missing = WORLD_CATALOG.entries
      .filter((entry) => entry.kind === "state" && STATE_COLORS[entry.tag] === undefined)
      .map((entry) => entry.tag);
    expect(missing).toEqual([]);
  });

  test("colours depend only on the tag, never on catalogue order", () => {
    const shuffled = new Map([...entryByTag.entries()].reverse());
    for (const entry of WORLD_CATALOG.entries) {
      expect(politicalColor(entry.tag, shuffled)).toEqual(politicalColor(entry.tag, entryByTag));
    }
    expect(stateColor("ZZZ")).toEqual(stateColor("ZZZ"));
    expect(stateColor("ZZZ")).not.toEqual(stateColor("ZZY"));
  });

  test("territories take the family of their sovereign, lifted toward parchment", () => {
    const sovereign = stateColor("GBR");
    const colony = politicalColor("BIN", entryByTag);
    expect(colony).not.toEqual(sovereign);
    expect(oklab(colony, false)[0]).toBeGreaterThan(oklab(sovereign, false)[0]);
    expect(distance(colony, sovereign, false)).toBeLessThan(0.12);
  });

  test("neighbouring countries stay distinct, including for deuteranopia", () => {
    const worstNormal: string[] = [];
    const worstDeutan: string[] = [];
    const pairs = neighbouringPolities();
    expect(pairs.length).toBeGreaterThan(150);
    for (const [left, right] of pairs) {
      if (sameRealm(left, right)) continue;
      const a = politicalColor(left, entryByTag);
      const b = politicalColor(right, entryByTag);
      const normal = distance(a, b, false);
      const deutan = distance(a, b, true);
      if (normal < 0.04) worstNormal.push(`${left}/${right} ${normal.toFixed(3)}`);
      if (deutan < 0.022) worstDeutan.push(`${left}/${right} ${deutan.toFixed(3)}`);
    }
    expect(worstNormal).toEqual([]);
    expect(worstDeutan).toEqual([]);
  });
});

describe("province ownership", () => {
  const silesia = provinces.find((province) => province.initialOwnerTag === "DEU" && province.mapTag === "DEU");

  test("the 1900 start reproduces the authored owners", () => {
    const states = buildProvinceStates(PROVINCE_MAP_1900, WORLD_CATALOG, null);
    expect(states).toHaveLength(provinces.length);
    states.forEach((state, index) => {
      expect(state.ownerTag).toBe(provinces[index]?.initialOwnerTag);
      expect(state.unitTag).toBe(provinces[index]?.mapTag);
      expect(state.controllerTag).toBe(state.ownerTag);
    });
  });

  test("a transfer changes the owner and political unit of that province only", () => {
    expect(silesia).toBeDefined();
    if (silesia === undefined) return;
    const france = entryByTag.get("FRA")?.id ?? -1;
    const states = buildProvinceStates(
      PROVINCE_MAP_1900,
      WORLD_CATALOG,
      snapshotWith([{ provinceId: silesia.id, ownerPolityId: france }]),
    );
    const base = buildProvinceStates(PROVINCE_MAP_1900, WORLD_CATALOG, null);
    const changed = states.filter((state, index) => state.ownerTag !== base[index]?.ownerTag);
    expect(changed).toHaveLength(1);
    expect(changed[0]).toMatchObject({ ownerTag: "FRA", unitTag: "FRA" });
  });

  test("occupation hatches the province without changing its owner", () => {
    if (silesia === undefined) return;
    const russia = entryByTag.get("RUS")?.id ?? -1;
    const context = contextFor(snapshotWith([{ provinceId: silesia.id, controllerPolityId: russia }]));
    const index = provinceIndex.get(silesia.id) ?? -1;
    const appearance = MAP_MODES.political.appearance(index, context);
    expect(context.states[index]).toMatchObject({ ownerTag: "DEU", controllerTag: "RUS" });
    expect(appearance.fill).toEqual(politicalColor("DEU", entryByTag));
    expect(appearance.stripe).toEqual(politicalColor("RUS", entryByTag));
  });

  test("a colony's owner is its sovereign while its unit is the colony", () => {
    const india = provinces.findIndex((province) => province.mapTag === "BIN");
    const state = contextFor(null).states[india];
    expect(state).toMatchObject({ ownerTag: "GBR", unitTag: "BIN" });
  });
});

describe("map modes", () => {
  const context = contextFor(null);

  test("every mode is registered with the same interface", () => {
    // P2 adds the four province data lenses.
    expect(Object.keys(MAP_MODES).sort()).toEqual([
      "control",
      "density",
      "literacy",
      "markets",
      "political",
      "unrest",
      "urban",
    ]);
    for (const mode of Object.values(MAP_MODES)) {
      expect(mode.legend(context).length).toBeGreaterThan(0);
      expect(mode.appearance(0, context).fill).toHaveLength(3);
    }
  });

  test("the style table holds one texel per province plus unclaimed land", () => {
    const table = buildProvinceStyleTable(MAP_MODES.political, context);
    expect(table.width).toBe(provinces.length + 1);
    expect(table.data).toHaveLength(table.width * STYLE_TABLE_ROWS * 4);
  });

  test("group ids separate owners and units exactly as the shader expects", () => {
    const table = buildProvinceStyleTable(MAP_MODES.political, context);
    const groupRow = table.width * 2;
    const group = (index: number): readonly [number, number] => {
      const at = (groupRow + index + 1) * 4;
      return [
        (table.data[at] ?? 0) + (table.data[at + 1] ?? 0) * 256,
        (table.data[at + 2] ?? 0) + (table.data[at + 3] ?? 0) * 256,
      ];
    };
    const find = (tag: string): number => provinces.findIndex((province) => province.mapTag === tag);
    const uk = group(find("GBR"));
    const india = group(find("BIN"));
    const france = group(find("FRA"));
    expect(uk[0]).toBe(india[0]); // same owner: a colonial, not international, border
    expect(uk[1]).not.toBe(india[1]);
    expect(uk[0]).not.toBe(france[0]);
  });

  test("changing mode changes colours, never province grouping", () => {
    const political = buildProvinceStyleTable(MAP_MODES.political, context);
    const control = buildProvinceStyleTable(MAP_MODES.control, context);
    const groupStart = political.width * 2 * 4;
    expect(control.data.subarray(groupStart)).toEqual(political.data.subarray(groupStart));
    expect(control.data.subarray(0, political.width * 4)).not.toEqual(political.data.subarray(0, political.width * 4));
  });

  test("a market highlight dims everything outside it", () => {
    const marketId = contextFor(null).states.find((state) => state.marketId !== null)?.marketId ?? 0;
    const highlighted = contextFor(null, marketId);
    let dimmed = 0;
    let kept = 0;
    highlighted.states.forEach((state, index) => {
      const appearance = MAP_MODES.markets.appearance(index, highlighted);
      if (appearance.dimmed) dimmed += 1;
      else kept += 1;
      if (state.marketId === marketId) expect(appearance.dimmed).toBe(false);
    });
    expect(dimmed).toBeGreaterThan(0);
    expect(kept).toBeGreaterThan(0);
  });

  test("selecting a country flags its unit and, more weakly, the rest of its realm", () => {
    const states = context.states;
    const uk = states.find((state) => state.unitTag === "GBR");
    const india = states.find((state) => state.unitTag === "BIN");
    const france = states.find((state) => state.unitTag === "FRA");
    if (uk === undefined || india === undefined || france === undefined) throw new Error("missing fixture");
    expect(selectionFlags(uk, "GBR", null) & STYLE_FLAG_SELECTED_UNIT).not.toBe(0);
    expect(selectionFlags(india, "GBR", null) & STYLE_FLAG_SELECTED_OWNER).not.toBe(0);
    expect(selectionFlags(india, "GBR", null) & STYLE_FLAG_SELECTED_UNIT).toBe(0);
    expect(selectionFlags(france, "GBR", null)).toBe(0);
    expect(selectionFlags(india, null, "GBR") & STYLE_FLAG_PLAYER).not.toBe(0);
  });
});

describe("multiscale style", () => {
  test("zoom bands are monotonic and bounded", () => {
    expect(bandMix(1, 2, 4)).toBe(0);
    expect(bandMix(5, 2, 4)).toBe(1);
    expect(bandMix(3, 2, 4)).toBeCloseTo(0.5, 9);
  });

  test("detail rises with scale and keeps simplification sub-pixel", () => {
    expect(levelOfDetail(1)).toBe(2);
    expect(levelOfDetail(6)).toBe(1);
    expect(levelOfDetail(40)).toBe(0);
    const tolerance = [0, 0.05, 0.16];
    for (let scale = 1; scale < 200; scale *= 1.3) {
      expect((tolerance[levelOfDetail(scale)] ?? 1) * scale).toBeLessThan(0.65);
    }
  });

  test("the palette helpers parse colours", () => {
    expect(hexToRgb("#102030")).toEqual([16, 32, 48]);
  });
});
