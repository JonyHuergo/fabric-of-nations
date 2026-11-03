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

import type { ProvinceMapProvince } from "../provinceCatalogTypes";
import type { WorldCatalogEntry, WorldCatalogMarket } from "../worldCatalogTypes";
import { MAP_DATA_RAMP } from "../design/tokens";
import {
  hexToRgb,
  mixRgb,
  politicalColor,
  stateColor,
  UNCLAIMED_LAND,
  type Rgb,
} from "./politicalPalette";
import { provinceEconomyRows, type ProvinceEconomySnapshot } from "@century/sim-worker";

export type MapModeId =
  | "political"
  | "control"
  | "markets"
  | "density"
  | "urban"
  | "literacy"
  | "unrest";

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
  /** P2 live province values; null before a campaign exists or for an empty province. */
  readonly densityPerKm2: number | null;
  readonly urbanShare: number | null;
  readonly literacy: number | null;
  readonly unrest: number | null;
}

/** The fields of a province the map reads; geometry is not among them. */
export type MapProvince = Pick<
  ProvinceMapProvince,
  | "id"
  | "key"
  | "displayName"
  | "mapTag"
  | "initialOwnerTag"
  | "initialOwnerPolityId"
  | "residual"
  | "area"
  | "bbox"
  | "label"
>;

/** The fields of a catalogue entry that colour and name a polity. */
export type MapEntry = Pick<WorldCatalogEntry, "tag" | "kind" | "status" | "sovereignTag" | "commonName">;

export interface MapDataContext {
  readonly provinces: readonly MapProvince[];
  readonly states: readonly ProvinceState[];
  readonly entryByTag: ReadonlyMap<string, MapEntry>;
  readonly marketNames: ReadonlyMap<number, string>;
  readonly highlightMarketId: number | null;
}

export interface MapMode {
  readonly id: MapModeId;
  readonly label: string;
  readonly appearance: (index: number, context: MapDataContext) => ProvinceAppearance;
  readonly legend: (context: MapDataContext) => readonly MapLegendEntry[];
}

export const NO_DATA_FILL: Rgb = [84, 90, 94];
const LEGEND_MARKET_LIMIT = 8;
const CONTROL_NEUTRAL: Rgb = [96, 104, 108];
/** Stripe base over an occupied province, so hatching reads on a matte fill. */
const OCCUPATION_SHADE: Rgb = [24, 26, 28];

/** Matte market colours in the same band as the political palette. */
const MARKET_COLORS: readonly string[] = [
  "#5f9490",
  "#9c5a5e",
  "#4a6c9c",
  "#ad9650",
  "#56775f",
  "#7f6796",
  "#9a7550",
  "#5f86ab",
  "#a35877",
  "#7f9c66",
  "#b0774a",
  "#6f6aa0",
  "#4b8a76",
  "#a2595a",
  "#a08560",
  "#648a7f",
  "#8790b8",
  "#8f9658",
];

export function marketColor(marketId: number): Rgb {
  return hexToRgb(MARKET_COLORS[marketId % MARKET_COLORS.length] ?? "#5f9490");
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
  legend: (context) => [
    { label: "Sovereign state", color: stateColor("GBR") },
    { label: "Dependent territory", color: politicalColor("BIN", context.entryByTag) },
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
      stripe: mixRgb(politicalColor(state.ownerTag, context.entryByTag), OCCUPATION_SHADE, 0.2),
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

const RAMP: readonly Rgb[] = MAP_DATA_RAMP.map(hexToRgb);

/**
 * A sequential lens over one live province value. `thresholds` are the lower
 * bounds of ramp steps 1..4 (step 0 is below the first); a province with no value
 * takes NO_DATA_FILL rather than a fabricated colour.
 */
function sequentialMode(
  id: MapModeId,
  label: string,
  value: (state: ProvinceState) => number | null,
  thresholds: readonly [number, number, number, number],
  format: (value: number) => string,
): MapMode {
  const step = (amount: number): number => {
    let index = 0;
    while (index < thresholds.length && amount >= (thresholds[index] ?? Infinity)) index += 1;
    return index;
  };
  return {
    id,
    label,
    appearance: (index, context) => {
      const state = context.states[index];
      const amount = state === undefined ? null : value(state);
      if (amount === null) return { fill: NO_DATA_FILL, stripe: null, dimmed: false };
      return { fill: RAMP[step(amount)] ?? NO_DATA_FILL, stripe: null, dimmed: false };
    },
    legend: () => [
      { label: `Below ${format(thresholds[0])}`, color: RAMP[0] ?? NO_DATA_FILL },
      ...thresholds.map((threshold, index) => ({
        label: index === thresholds.length - 1 ? `${format(threshold)} and above` : `${format(threshold)} to ${format(thresholds[index + 1] ?? threshold)}`,
        color: RAMP[index + 1] ?? NO_DATA_FILL,
      })),
      { label: "No data", color: NO_DATA_FILL },
    ],
  };
}

const percent = (value: number): string => `${String(Math.round(value * 100))}%`;

export const MAP_MODES: Readonly<Record<MapModeId, MapMode>> = {
  political: politicalMode,
  control: controlMode,
  markets: marketsMode,
  density: sequentialMode(
    "density",
    "Population",
    (state) => state.densityPerKm2,
    [5, 20, 60, 150],
    (value) => `${String(value)}/km²`,
  ),
  urban: sequentialMode("urban", "Towns", (state) => state.urbanShare, [0.05, 0.12, 0.25, 0.45], percent),
  literacy: sequentialMode("literacy", "Literacy", (state) => state.literacy, [0.1, 0.3, 0.55, 0.8], percent),
  unrest: sequentialMode("unrest", "Unrest", (state) => state.unrest, [0.05, 0.15, 0.3, 0.5], percent),
};

/** Approximate land area of a province from its bundle area (square degrees) at its label latitude. */
function approximateAreaKm2(province: Pick<ProvinceMapProvince, "area" | "label">): number {
  const latitude = province.label[1] ?? 0;
  return province.area * 111.32 * 111.32 * Math.max(0.05, Math.cos((latitude * Math.PI) / 180));
}

/** Resolve authoritative ownership for every province, in bundle order. */
export function buildProvinceStates(
  provinceMap: {
    readonly provinces: readonly Pick<
      ProvinceMapProvince,
      "id" | "initialOwnerPolityId" | "initialOwnerTag" | "mapTag" | "area" | "label"
    >[];
    readonly futurePolities: readonly { readonly polityId: number; readonly tag: string }[];
  },
  catalog: {
    readonly entries: readonly Pick<WorldCatalogEntry, "id" | "tag" | "market">[];
    readonly markets: readonly Pick<WorldCatalogMarket, "id" | "key">[];
  },
  snapshot: Pick<SimulationSnapshot, "provinces" | "provinceTable" | "professions"> | null,
): readonly ProvinceState[] {
  const tagByPolityId = new Map<number, string>();
  for (const entry of catalog.entries) tagByPolityId.set(entry.id, entry.tag);
  for (const polity of provinceMap.futurePolities) tagByPolityId.set(polity.polityId, polity.tag);
  const ownership = new Map(
    (snapshot?.provinces ?? []).map((entry) => [entry.provinceId, entry] as const),
  );
  const economyById = new Map(
    ((snapshot === null ? [] : provinceEconomyRows(snapshot))).map((province) => [province.id, province] as const),
  );
  const marketIdByKey = new Map(catalog.markets.map((market) => [market.key, market.id] as const));
  const marketKeyByTag = new Map(catalog.entries.map((entry) => [entry.tag, entry.market] as const));
  return provinceMap.provinces.map((province) => {
    const entry = ownership.get(province.id);
    const ownerId = entry?.ownerPolityId ?? province.initialOwnerPolityId;
    const controllerId = entry?.controllerPolityId ?? ownerId;
    const ownerTag = tagByPolityId.get(ownerId) ?? province.initialOwnerTag;
    const key = marketKeyByTag.get(province.mapTag) ?? null;
    const economy = economyById.get(province.id);
    const populated = economy !== undefined && economy.population > 0;
    return {
      ownerTag,
      controllerTag: tagByPolityId.get(controllerId) ?? ownerTag,
      unitTag: ownerId === province.initialOwnerPolityId ? province.mapTag : ownerTag,
      marketId:
        economy?.marketId ?? (key === null ? null : (marketIdByKey.get(key) ?? null)),
      // Rounded so that the bridge resends a province only when its lens step can change.
      densityPerKm2: populated ? Math.round((economy.population / approximateAreaKm2(province)) * 10) / 10 : null,
      urbanShare: populated ? Math.round(economy.urbanShare * 100) / 100 : null,
      literacy: populated ? Math.round(economy.literacy * 100) / 100 : null,
      unrest: populated ? Math.round(economy.unrest * 100) / 100 : null,
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

/**
 * Fill of a province under a data lens, for renderers that draw provinces one by
 * one (the SVG fallback); null for a lens that is not a province data lens.
 */
export function dataLensFill(
  lens: MapModeId,
  province: Pick<ProvinceMapProvince, "area" | "label">,
  economy: ProvinceEconomySnapshot | undefined,
): Rgb | null {
  if (lens !== "density" && lens !== "urban" && lens !== "literacy" && lens !== "unrest") return null;
  const populated = economy !== undefined && economy.population > 0;
  const state: ProvinceState = {
    ownerTag: "",
    controllerTag: "",
    unitTag: "",
    marketId: economy?.marketId ?? null,
    densityPerKm2: populated ? economy.population / approximateAreaKm2(province) : null,
    urbanShare: populated ? economy.urbanShare : null,
    literacy: populated ? economy.literacy : null,
    unrest: populated ? economy.unrest : null,
  };
  const context: MapDataContext = {
    provinces: [],
    states: [state],
    entryByTag: new Map(),
    marketNames: new Map(),
    highlightMarketId: null,
  };
  return MAP_MODES[lens].appearance(0, context).fill;
}
