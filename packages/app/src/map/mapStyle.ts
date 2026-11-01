/**
 * Cartographic style of the map: colours, zoom bands and level of detail.
 *
 * Every number is display-only. Line weights form the hierarchy
 * selection > international border > colonial boundary > coast > province line,
 * with the lower tiers receding as the camera pulls away.
 */

type Linear = Float32Array;

function linear(hex: string): Linear {
  const value = hex.replace("#", "");
  return Float32Array.of(
    Number.parseInt(value.slice(0, 2), 16) / 255,
    Number.parseInt(value.slice(2, 4), 16) / 255,
    Number.parseInt(value.slice(4, 6), 16) / 255,
  );
}

export const PALETTE = {
  seaDeep: linear("#1e3a4d"),
  seaShallow: linear("#4d7d8f"),
  lake: linear("#3f6c80"),
  river: linear("#3f6c80"),
  graticule: linear("#7fa3b0"),
  coast: linear("#15303c"),
  borderInk: linear("#2c2723"),
  provinceLine: linear("#5a5044"),
  casing: linear("#14110d"),
  selection: linear("#ffd97a"),
  ownerRealm: linear("#efe2bb"),
  player: linear("#f0c75e"),
  hover: linear("#fff8e4"),
  selectedProvince: linear("#ffffff"),
  reliefStrength: 1.15,
} as const;

/** Camera scales (CSS pixels per map unit) at which line work changes. */
export const ZOOM_BANDS = {
  graticuleFadeStart: 6,
  graticuleFadeEnd: 16,
  riverStart: 2.2,
  riverFull: 9,
  washStart: 1.2,
  washFull: 4,
  provinceStart: 2.6,
  provinceFull: 7,
  unitStart: 1.4,
  unitFull: 4,
  nationalThin: 1.4,
  nationalFull: 6,
  /** Source relief is 1:50m; it fades before its texels become visible. */
  reliefFadeStart: 6,
  reliefFadeEnd: 26,
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
