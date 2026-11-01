/**
 * Political colours of the 1900 map.
 *
 * Colours are authored per polity tag, never derived from array order or from a
 * runtime random source, so adding a polity cannot change any other colour. The
 * great powers follow period atlas conventions (British red, French blue, German
 * grey, Russian green, Habsburg yellow); the rest were chosen so that neighbours
 * differ in lightness as well as hue, which keeps them apart for red-green colour
 * blind players. `m15-map-style.test.ts` measures neighbouring polities under
 * normal and simulated deuteranopic vision.
 *
 * A dependent territory takes its sovereign's hue lifted toward parchment by
 * status, so an empire reads as one family across continents.
 */

import type { CatalogStatus, WorldCatalogEntry } from "../worldCatalogTypes";

export type Rgb = readonly [number, number, number];

export const STATE_COLORS: Readonly<Record<string, string>> = {
  // Great powers
  GBR: "#d4807c",
  FRA: "#7296cf",
  DEU: "#a39e96",
  RUS: "#9bb886",
  AUT: "#e3c66e",
  ITA: "#57a37e",
  USA: "#7fb9b2",
  JPN: "#d9779b",
  OTT: "#cc9b63",
  CHN: "#ecd384",
  // British settler dominions keep the imperial red family
  CAN: "#e6aca4",
  AUS: "#e0a099",
  NZL: "#e6b0a8",
  // Europe
  ESP: "#e2ab55",
  PRT: "#83b96f",
  NLD: "#ec9a56",
  BEL: "#c39ccb",
  CHE: "#c9716f",
  LUX: "#86c3c6",
  SWE: "#86b0d8",
  NOR: "#a39ad6",
  DNK: "#e09e85",
  GRC: "#74b0df",
  SRB: "#c086a6",
  MNT: "#8ec39f",
  ROM: "#7fbcc4",
  BGR: "#a9d08a",
  CRT: "#aeb0e0",
  MCO: "#d86a6a",
  SMR: "#76b4d9",
  AND: "#d6a951",
  LIE: "#8399d9",
  // Asia and the Pacific
  KOR: "#a0c4d6",
  PER: "#b4c46f",
  AFG: "#ae9ac8",
  NPL: "#cf7e72",
  THA: "#add088",
  OMN: "#c8acd6",
  SHM: "#dab683",
  TON: "#c49fc8",
  // Africa
  ETH: "#a4bf72",
  LBR: "#a9c16e",
  MAR: "#cf8868",
  ZAR: "#c4ad72",
  ORF: "#92e3ce",
  SOK: "#d3aa66",
  WAD: "#a87aa4",
  DAR: "#88b8ab",
  // The Americas
  MEX: "#589c81",
  GUA: "#ab844f",
  HON: "#8bbbd2",
  SAL: "#d6bf72",
  NIC: "#ad9dd2",
  COS: "#98cc92",
  COL: "#e2c066",
  VEN: "#82a4d7",
  ECU: "#bfdc98",
  PRU: "#d79284",
  BOL: "#b4e1c1",
  CHL: "#d4b7f1",
  ARG: "#52a5b5",
  URY: "#dabc82",
  PRY: "#b79184",
  BRA: "#7da96c",
  HTI: "#d398b4",
  DOM: "#90b2db",
  CUB: "#e2b483",
};

/** Share of parchment mixed into a sovereign colour, by dependent status. */
const TERRITORY_LIFT: Partial<Readonly<Record<CatalogStatus, number>>> = {
  dominion: 0.12,
  "self-governing-colony": 0.14,
  "autonomous-province": 0.2,
  colony: 0.24,
  dependency: 0.28,
  protectorate: 0.32,
};
const DEFAULT_TERRITORY_LIFT = 0.24;
const PARCHMENT: Rgb = [240, 232, 212];

/** Neutral land: Antarctica and anything no authored polity claims. */
export const UNCLAIMED_LAND: Rgb = [212, 214, 208];

export function hexToRgb(hex: string): Rgb {
  const value = hex.replace("#", "");
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

export function mixRgb(from: Rgb, to: Rgb, amount: number): Rgb {
  return [
    Math.round(from[0] + (to[0] - from[0]) * amount),
    Math.round(from[1] + (to[1] - from[1]) * amount),
    Math.round(from[2] + (to[2] - from[2]) * amount),
  ];
}

export function rgbToCss(color: Rgb): string {
  return `rgb(${String(color[0])}, ${String(color[1])}, ${String(color[2])})`;
}

/** Stable FNV-1a over the tag; identical to the theme's national hash. */
function hashTag(tag: string): number {
  let hash = 2166136261;
  for (let index = 0; index < tag.length; index += 1) {
    hash ^= tag.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Colour for a tag with no authored entry, such as a future successor state:
 * a fixed-lightness hue taken from the tag alone, so it is stable across sessions
 * and independent of every other polity.
 */
function derivedColor(tag: string): Rgb {
  const hue = (hashTag(tag) % 360) / 60;
  const chroma = 86;
  const secondary = chroma * (1 - Math.abs((hue % 2) - 1));
  const base = 136;
  const sextants: readonly Rgb[] = [
    [chroma, secondary, 0],
    [secondary, chroma, 0],
    [0, chroma, secondary],
    [0, secondary, chroma],
    [secondary, 0, chroma],
    [chroma, 0, secondary],
  ];
  const [r, g, b] = sextants[Math.floor(hue) % 6] ?? [chroma, 0, 0];
  return [Math.round(r + base), Math.round(g + base), Math.round(b + base)];
}

/** Base colour of a tag: authored, else derived from the tag alone. */
export function stateColor(tag: string): Rgb {
  const authored = STATE_COLORS[tag];
  return authored === undefined ? derivedColor(tag) : hexToRgb(authored);
}

/** Political colour of a catalogue entry, in the sovereign's family if dependent. */
export function politicalColor(
  tag: string,
  entryByTag: ReadonlyMap<string, WorldCatalogEntry>,
): Rgb {
  const entry = entryByTag.get(tag);
  if (entry === undefined || entry.kind === "state" || entry.sovereignTag === null) {
    return stateColor(tag);
  }
  const lift = TERRITORY_LIFT[entry.status] ?? DEFAULT_TERRITORY_LIFT;
  return mixRgb(stateColor(entry.sovereignTag), PARCHMENT, lift);
}
