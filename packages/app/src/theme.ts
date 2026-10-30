/**
 * Century M11 design tokens.
 *
 * A restrained atlas palette: deep ink backgrounds, parchment text, a single
 * brass accent, and muted national colours. Numbers use tabular figures.
 */
import { Platform, type TextStyle } from "react-native";

export const colors = {
  background: "#0b1014",
  backgroundAlt: "#0e151a",
  surface: "#121a20",
  surfaceRaised: "#172129",
  surfaceHover: "#1d2932",
  panel: "#111920",
  border: "#26333c",
  borderStrong: "#35464f",
  text: "#e7e1d2",
  textStrong: "#f7f1e1",
  muted: "#9caaa7",
  faint: "#6e7d7b",
  accent: "#c9a227",
  accentStrong: "#e2bd4a",
  accentText: "#181204",
  green: "#81a982",
  red: "#c57a6b",
  blue: "#7f9fc4",
  amber: "#c9a227",
  purple: "#a08bbd",
  shadow: "#000000",
  mapOcean: "#08111a",
  mapLand: "#1a2328",
  mapBorder: "#05090c",
  mapGraticule: "#16222b",
  player: "#d8b34a",
  overlay: "rgba(6, 9, 12, 0.72)",
} as const;

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radii = {
  sm: 3,
  md: 6,
  lg: 10,
  pill: 999,
} as const;

export const fonts = {
  display: Platform.select({
    web: "Georgia, 'Iowan Old Style', 'Times New Roman', serif",
    ios: "Georgia",
    android: "serif",
    default: "serif",
  }),
  body: Platform.select({
    web: "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif",
    ios: "System",
    android: "sans-serif",
    default: "System",
  }),
  mono: Platform.select({
    web: "'SFMono-Regular', 'Cascadia Mono', Consolas, monospace",
    ios: "Menlo",
    android: "monospace",
    default: "monospace",
  }),
} as const;

export const type = {
  display: {
    fontFamily: fonts.display,
    fontSize: 30,
    lineHeight: 34,
    fontWeight: "600",
    letterSpacing: 0.4,
    color: colors.textStrong,
  } as TextStyle,
  title: {
    fontFamily: fonts.display,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "600",
    letterSpacing: 0.2,
    color: colors.textStrong,
  } as TextStyle,
  section: {
    fontFamily: fonts.display,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600",
    letterSpacing: 0.2,
    color: colors.textStrong,
  } as TextStyle,
  label: {
    fontFamily: fonts.body,
    fontSize: 9.5,
    lineHeight: 13,
    fontWeight: "700",
    letterSpacing: 1.1,
    textTransform: "uppercase",
    color: colors.faint,
  } as TextStyle,
  body: {
    fontFamily: fonts.body,
    fontSize: 12.5,
    lineHeight: 18,
    color: colors.text,
  } as TextStyle,
  small: {
    fontFamily: fonts.body,
    fontSize: 11,
    lineHeight: 16,
    color: colors.muted,
  } as TextStyle,
  tiny: {
    fontFamily: fonts.body,
    fontSize: 9.5,
    lineHeight: 13,
    color: colors.faint,
  } as TextStyle,
  number: {
    fontFamily: fonts.mono,
    fontSize: 12.5,
    lineHeight: 18,
    color: colors.textStrong,
    fontVariant: ["tabular-nums"],
  } as TextStyle,
  numberLarge: {
    fontFamily: fonts.mono,
    fontSize: 19,
    lineHeight: 24,
    color: colors.textStrong,
    fontVariant: ["tabular-nums"],
  } as TextStyle,
  mono: {
    fontFamily: fonts.mono,
    fontSize: 10.5,
    lineHeight: 15,
    color: colors.muted,
    fontVariant: ["tabular-nums"],
  } as TextStyle,
} as const;

/** Curated national colours, stable by polity tag hash. */
export const NATION_COLORS = [
  "#b08a63",
  "#7f9c7a",
  "#8e8ab5",
  "#b57e7a",
  "#6f8fa8",
  "#a8936a",
  "#8a9c8f",
  "#a97f9a",
  "#7c8fa0",
  "#a19062",
  "#7e9d94",
  "#9a7f6d",
  "#8c8fa8",
  "#a58f7f",
  "#6f9a8a",
  "#b09a7a",
] as const;

export function hashTag(tag: string): number {
  let hash = 2166136261;
  for (let index = 0; index < tag.length; index += 1) {
    hash ^= tag.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function nationColor(tag: string | null | undefined): string {
  if (tag === null || tag === undefined) return colors.faint;
  return NATION_COLORS[hashTag(tag) % NATION_COLORS.length] ?? colors.faint;
}

/** Lighten a hex colour toward parchment (for dependent territories). */
export function lighten(hex: string, amount = 0.32): string {
  const value = hex.replace("#", "");
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  const mix = (channel: number): number => Math.round(channel + (235 - channel) * amount);
  return `#${[mix(r), mix(g), mix(b)].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}
