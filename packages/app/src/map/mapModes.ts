/**
 * Map modes: the separation between what a province shows and how it is drawn.
 *
 * Geometry never changes between modes. A mode is a pure description of one
 * province's appearance, resolved from a `MapDataContext` built from the catalogue
 * and the authoritative worker snapshot. To add a mode, add one `MapMode` value
 * here; the renderer needs no change because it only reads the style table that
 * `buildProvinceStyleTable` compiles from a mode.
 *
 * A mode must only use values that exist in the context. No mode may fabricate
 * data to look populated: a province with no value takes `NO_DATA_FILL`.
 */

import type { SimulationSnapshot } from "@century/sim-worker";

import type { ProvinceMapData, ProvinceMapProvince } from "../provinceCatalogTypes";
import type { WorldCatalogData, WorldCatalogEntry } from "../worldCatalogTypes";
import {
  hexToRgb,
  mixRgb,
  politicalColor,
  stateColor,
  UNCLAIMED_LAND,
  type Rgb,
} from "./politicalPalette";

export type MapModeId = "political" | "control" | "markets";

export interface ProvinceAppearance {
  readonly fill: Rgb;
  /** Diagonal hatching over the fill: occupation or contested control. */
  readonly stripe: Rgb | null;
  /** Pushed back while another part of the map is the subject. */
  readonly dimmed: boolean;
}

export interface MapLegendEntry {
  readonly label: string;
  readonly color: Rgb;
  readonly hatched?: boolean;
}

export interface ProvinceState {
  /** Tag of the current legal owner. */
  readonly ownerTag: string;
  /** Tag of the current controller. */
  readonly controllerTag: string;
  /** Political unit: the 1900 polity until the province changes hands. */
  readonly unitTag: string;
  readonly marketId: number | null;
}

export interface MapDataContext {
  readonly provinces: readonly ProvinceMapProvince[];
  readonly states: readonly ProvinceState[];
  readonly entryByTag: ReadonlyMap<string, WorldCatalogEntry>;
  readonly marketNames: ReadonlyMap<number, string>;
  readonly highlightMarketId: number | null;
}

export interface MapMode {
  readonly id: MapModeId;
  readonly label: string;
  readonly appearance: (index: number, context: MapDataContext) => ProvinceAppearance;
  readonly legend: (context: MapDataContext) => readonly MapLegendEntry[];
}

const NO_DATA_FILL: Rgb = [176, 178, 172];
const LEGEND_MARKET_LIMIT = 8;
const CONTROL_NEUTRAL: Rgb = [198, 196, 184];

const MARKET_COLORS: readonly string[] = [
  "#7fb9b2",
  "#d4807c",
  "#7296cf",
  "#e3c66e",
  "#9bb886",
  "#c39ccb",
  "#cc9b63",
  "#86b0d8",
  "#d9779b",
  "#a4bf72",
  "#ec9a56",
  "#a39ad6",
  "#6fb48d",
  "#c9716f",
  "#dab683",
  "#88b8ab",
  "#bda2d7",
  "#b4c46f",
];

export function marketColor(marketId: number): Rgb {
  return hexToRgb(MARKET_COLORS[marketId % MARKET_COLORS.length] ?? "#7fb9b2");
}

const politicalMode: MapMode = {
  id: "political",
  label: "Political",
  appearance: (index, context) => {
    const state = context.states[index];
    if (state === undefined) return { fill: UNCLAIMED_LAND, stripe: null, dimmed: false };
    return {
      fill: politicalColor(state.unitTag, context.entryByTag),
      stripe:
        state.controllerTag === state.ownerTag
          ? null
          : politicalColor(state.controllerTag, context.entryByTag),
      dimmed: false,
    };
  },
  legend: () => [
    { label: "Sovereign state", color: stateColor("GBR") },
    { label: "Dependent territory", color: mixRgb(stateColor("GBR"), [240, 232, 212], 0.28) },
    { label: "Military occupation", color: stateColor("RUS"), hatched: true },
  ],
};

const controlMode: MapMode = {
  id: "control",
  label: "Control",
  appearance: (index, context) => {
    const state = context.states[index];
    if (state === undefined) return { fill: UNCLAIMED_LAND, stripe: null, dimmed: false };
    if (state.controllerTag === state.ownerTag) {
      return {
        fill: mixRgb(politicalColor(state.unitTag, context.entryByTag), CONTROL_NEUTRAL, 0.72),
        stripe: null,
        dimmed: false,
      };
    }
    return {
      fill: politicalColor(state.controllerTag, context.entryByTag),
      stripe: mixRgb(politicalColor(state.ownerTag, context.entryByTag), [36, 32, 28], 0.2),
      dimmed: false,
    };
  },
  legend: () => [
    { label: "Controlled by its owner", color: CONTROL_NEUTRAL },
    { label: "Occupied (controller colour)", color: stateColor("RUS"), hatched: true },
  ],
};

const marketsMode: MapMode = {
  id: "markets",
  label: "Markets",
  appearance: (index, context) => {
    const state = context.states[index];
    if (state === undefined || state.marketId === null) {
      return { fill: NO_DATA_FILL, stripe: null, dimmed: context.highlightMarketId !== null };
    }
    return {
      fill: marketColor(state.marketId),
      stripe: null,
      dimmed: context.highlightMarketId !== null && context.highlightMarketId !== state.marketId,
    };
  },
  legend: (context) => {
    if (context.highlightMarketId !== null) {
      return [
        {
          label: context.marketNames.get(context.highlightMarketId) ?? "Selected market",
          color: marketColor(context.highlightMarketId),
        },
      ];
    }
    const markets = [...context.marketNames.entries()].map(([id, name]) => ({
      label: name,
      color: marketColor(id),
    }));
    if (markets.length <= LEGEND_MARKET_LIMIT) return markets;
    return [
      ...markets.slice(0, LEGEND_MARKET_LIMIT),
      { label: `and ${String(markets.length - LEGEND_MARKET_LIMIT)} more markets`, color: NO_DATA_FILL },
    ];
  },
};

export const MAP_MODES: Readonly<Record<MapModeId, MapMode>> = {
  political: politicalMode,
  control: controlMode,
  markets: marketsMode,
};

/** Resolve authoritative ownership for every province, in bundle order. */
export function buildProvinceStates(
  provinceMap: ProvinceMapData,
  catalog: WorldCatalogData,
  snapshot: SimulationSnapshot | null,
): readonly ProvinceState[] {
  const tagByPolityId = new Map<number, string>();
  for (const entry of catalog.entries) tagByPolityId.set(entry.id, entry.tag);
  for (const polity of provinceMap.futurePolities) tagByPolityId.set(polity.polityId, polity.tag);
  const ownership = new Map(
    (snapshot?.provinces ?? []).map((entry) => [entry.provinceId, entry] as const),
  );
  const marketByRegionId = new Map(
    (snapshot?.regions ?? []).map((region) => [region.id, region.marketId] as const),
  );
  const marketIdByKey = new Map(catalog.markets.map((market) => [market.key, market.id] as const));
  const marketKeyByTag = new Map(catalog.entries.map((entry) => [entry.tag, entry.market] as const));
  return provinceMap.provinces.map((province) => {
    const entry = ownership.get(province.id);
    const ownerId = entry?.ownerPolityId ?? province.initialOwnerPolityId;
    const controllerId = entry?.controllerPolityId ?? ownerId;
    const ownerTag = tagByPolityId.get(ownerId) ?? province.initialOwnerTag;
    const key = marketKeyByTag.get(province.mapTag) ?? null;
    return {
      ownerTag,
      controllerTag: tagByPolityId.get(controllerId) ?? ownerTag,
      unitTag: ownerId === province.initialOwnerPolityId ? province.mapTag : ownerTag,
      marketId:
        marketByRegionId.get(province.simulationRegionId) ??
        (key === null ? null : (marketIdByKey.get(key) ?? null)),
    };
  });
}

/** Province style flags stored in the style table's alpha channel. */
export const STYLE_FLAG_HOVER = 1;
export const STYLE_FLAG_SELECTED_PROVINCE = 2;
export const STYLE_FLAG_SELECTED_UNIT = 4;
export const STYLE_FLAG_SELECTED_OWNER = 8;
export const STYLE_FLAG_DIMMED = 16;
export const STYLE_FLAG_PLAYER = 32;

/** Rows of the style table: fill+flags, stripe+enabled, owner/unit group ids. */
export const STYLE_TABLE_ROWS = 3;

export interface ProvinceStyleTable {
  /** Width is provinceCount + 1; index 0 is unclaimed land. RGBA per texel. */
  readonly width: number;
  readonly data: Uint8Array;
}

/** Compile a mode into the texture the shaders read. */
export function buildProvinceStyleTable(
  mode: MapMode,
  context: MapDataContext,
): ProvinceStyleTable {
  const count = context.states.length;
  const width = count + 1;
  const data = new Uint8Array(width * STYLE_TABLE_ROWS * 4);
  data[0] = UNCLAIMED_LAND[0];
  data[1] = UNCLAIMED_LAND[1];
  data[2] = UNCLAIMED_LAND[2];
  const ownerGroup = new Map<string, number>();
  const unitGroup = new Map<string, number>();
  const groupId = (groups: Map<string, number>, tag: string): number => {
    let id = groups.get(tag);
    if (id === undefined) {
      id = groups.size + 1;
      groups.set(tag, id);
    }
    return id;
  };
  for (let index = 0; index < count; index += 1) {
    const texel = index + 1;
    const appearance = mode.appearance(index, context);
    const state = context.states[index];
    data[texel * 4] = appearance.fill[0];
    data[texel * 4 + 1] = appearance.fill[1];
    data[texel * 4 + 2] = appearance.fill[2];
    data[texel * 4 + 3] = appearance.dimmed ? STYLE_FLAG_DIMMED : 0;
    const stripeAt = (width + texel) * 4;
    if (appearance.stripe !== null) {
      data[stripeAt] = appearance.stripe[0];
      data[stripeAt + 1] = appearance.stripe[1];
      data[stripeAt + 2] = appearance.stripe[2];
      data[stripeAt + 3] = 255;
    }
    const groupAt = (width * 2 + texel) * 4;
    const owner = groupId(ownerGroup, state?.ownerTag ?? "");
    const unit = groupId(unitGroup, state?.unitTag ?? "");
    data[groupAt] = owner & 255;
    data[groupAt + 1] = owner >> 8;
    data[groupAt + 2] = unit & 255;
    data[groupAt + 3] = unit >> 8;
  }
  return { width, data };
}

/** Whether a tag selects a province's unit, its owner's realm, or neither. */
export function selectionFlags(state: ProvinceState, selectedTag: string | null, playerTag: string | null): number {
  let flags = 0;
  if (selectedTag !== null) {
    if (state.unitTag === selectedTag) flags |= STYLE_FLAG_SELECTED_UNIT;
    else if (state.ownerTag === selectedTag) flags |= STYLE_FLAG_SELECTED_OWNER;
  }
  if (playerTag !== null && (state.unitTag === playerTag || state.ownerTag === playerTag)) {
    flags |= STYLE_FLAG_PLAYER;
  }
  return flags;
}
