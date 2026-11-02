/**
 * Cartographic style of the map: palette, zoom bands and level of detail.
 *
 * Colours come from the design tokens and nowhere else. Line weights form the
 * hierarchy selection > international border > colonial boundary > coast >
 * province line, in fine paper-coloured lines that recede as the camera pulls
 * away. Every number here is display-only.
 */

import type { MapTokens, Rgb } from "../design/tokens";

type Linear = Float32Array;

function linear(color: Rgb): Linear {
  return Float32Array.of(color[0] / 255, color[1] / 255, color[2] / 255);
}

export interface MapPalette {
  readonly seaDeep: Linear;
  readonly seaShallow: Linear;
  readonly lake: Linear;
  readonly river: Linear;
  readonly graticule: Linear;
  readonly coast: Linear;
  readonly border: Linear;
  readonly provinceLine: Linear;
  readonly casing: Linear;
  readonly selection: Linear;
  readonly ownerRealm: Linear;
  readonly player: Linear;
  readonly hover: Linear;
  readonly selectedProvince: Linear;
  readonly landSaturation: number;
}

/** Relief must stay subtle: it never competes with labels. */
export const RELIEF_STRENGTH = 0.5;
/** Graticule mix at its strongest; a quiet line, not a grid. */
export const GRATICULE_STRENGTH = 0.09;

export function mapPalette(tokens: MapTokens): MapPalette {
  return {
    seaDeep: linear(tokens.seaDeep),
    seaShallow: linear(tokens.seaShallow),
    lake: linear(tokens.lake),
    river: linear(tokens.river),
    graticule: linear(tokens.graticule),
    coast: linear(tokens.coast),
    border: linear(tokens.border),
    provinceLine: linear(tokens.provinceLine),
    casing: linear(tokens.casing),
    selection: linear(tokens.selection),
    ownerRealm: linear(tokens.ownerRealm),
    player: linear(tokens.player),
    hover: linear(tokens.hover),
    selectedProvince: linear(tokens.selectedProvince),
    landSaturation: tokens.landSaturation,
  };
}

/** Camera scales (CSS pixels per map unit) at which line work changes. */
export const ZOOM_BANDS = {
  graticuleFadeStart: 6,
  graticuleFadeEnd: 16,
  riverStart: 2.2,
  riverFull: 9,
  provinceStart: 2.6,
  provinceFull: 7,
  unitStart: 1.4,
  unitFull: 4,
  nationalThin: 1.4,
  nationalFull: 6,
  /** Source relief is 1:50m; it fades before its texels become visible. */
  reliefFadeStart: 3,
  reliefFadeEnd: 12,
} as const;

/** 0 below `start`, 1 above `end`, smoothly in between. */
export function bandMix(value: number, start: number, end: number): number {
  const t = Math.max(0, Math.min(1, (value - start) / (end - start)));
  return t * t * (3 - 2 * t);
}

/**
 * Geometry level for a device scale, chosen so the simplification tolerance of
 * the bundle level stays below about 0.6 device pixels. 0 is full detail.
 */
export function levelOfDetail(devicePixelsPerUnit: number): number {
  if (devicePixelsPerUnit < 3.5) return 2;
  if (devicePixelsPerUnit < 12) return 1;
  return 0;
}
