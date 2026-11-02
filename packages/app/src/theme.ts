/**
 * The React Native face of the Living Atlas tokens in `design/tokens.ts`.
 *
 * `colors` and `type` always answer with the active theme. The active theme moves
 * with the game date, so stylesheets are built by `themedSheet`, which resolves a
 * screen's styles against the theme current at render time. Colour literals do not
 * belong in screens: `m16-design-tokens.test.ts` fails if one appears.
 */
import { StyleSheet, type ImageStyle, type TextStyle, type ViewStyle } from "react-native";

import {
  FONTS,
  RADII,
  SPACING,
  TYPE_SCALE,
  resolveEra,
  ERA_THEMES,
  type ResolvedColors,
  type ResolvedTheme,
  type TypeMetric,
} from "./design/tokens";
import { rgbToCss, stateColor } from "./map/politicalPalette";

export { TOUCH_TARGET } from "./design/tokens";

let activeTheme: ResolvedTheme = resolveEra(ERA_THEMES.imperial);

/** Install the theme the next render reads. */
export function setActiveTheme(theme: ResolvedTheme): void {
  activeTheme = theme;
}

export function getActiveTheme(): ResolvedTheme {
  return activeTheme;
}

function liveRecord<T extends object>(read: (theme: ResolvedTheme) => T): T {
  return new Proxy({} as T, {
    get: (_target, key) => (read(activeTheme) as Record<string | symbol, unknown>)[key],
    has: (_target, key) => key in read(activeTheme),
    ownKeys: () => Reflect.ownKeys(read(activeTheme)),
    getOwnPropertyDescriptor: (_target, key) => {
      const value = (read(activeTheme) as Record<string | symbol, unknown>)[key];
      return value === undefined ? undefined : { configurable: true, enumerable: true, value };
    },
  });
}

/** The colours of the active theme. */
export const colors: ResolvedColors = liveRecord((theme) => theme.colors);

export const spacing = SPACING;
export const radii = RADII;
export const fonts = FONTS;

function textStyle(metric: TypeMetric, color: string): TextStyle {
  return {
    fontFamily: metric.fontFamily,
    fontSize: metric.fontSize,
    lineHeight: metric.lineHeight,
    color,
    ...(metric.letterSpacing === undefined ? {} : { letterSpacing: metric.letterSpacing }),
    ...(metric.uppercase === true ? { textTransform: "uppercase" as const } : {}),
    ...(metric.tabular === true ? { fontVariant: ["tabular-nums" as const] } : {}),
  };
}

type TypeName = keyof typeof TYPE_SCALE;

function typeFor(theme: ResolvedTheme): Readonly<Record<TypeName, TextStyle>> {
  const { colors: palette } = theme;
  return {
    hero: textStyle(TYPE_SCALE.hero, palette.textStrong),
    menu: textStyle(TYPE_SCALE.menu, palette.text),
    eyebrow: textStyle(TYPE_SCALE.eyebrow, palette.accentStrong),
    display: textStyle(TYPE_SCALE.display, palette.textStrong),
    title: textStyle(TYPE_SCALE.title, palette.textStrong),
    section: textStyle(TYPE_SCALE.section, palette.textStrong),
    label: textStyle(TYPE_SCALE.label, palette.muted),
    body: textStyle(TYPE_SCALE.body, palette.text),
    small: textStyle(TYPE_SCALE.small, palette.muted),
    tiny: textStyle(TYPE_SCALE.tiny, palette.faint),
    number: textStyle(TYPE_SCALE.number, palette.textStrong),
    numberLarge: textStyle(TYPE_SCALE.numberLarge, palette.textStrong),
    mono: textStyle(TYPE_SCALE.mono, palette.muted),
  };
}

let typeCache: { readonly key: string; readonly styles: Readonly<Record<TypeName, TextStyle>> } | null = null;

/** Text styles of the active theme. */
export const type: Readonly<Record<TypeName, TextStyle>> = liveRecord((theme) => {
  if (typeCache?.key !== theme.key) typeCache = { key: theme.key, styles: typeFor(theme) };
  return typeCache.styles;
});

type NamedStyles<T> = { [P in keyof T]: ViewStyle | TextStyle | ImageStyle };
// The same shape `StyleSheet.create` takes, so style literals keep their exact types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyStyles = NamedStyles<any>;

/**
 * `StyleSheet.create` for a stylesheet that reads theme colours. The factory runs
 * once per theme, on first use; between era changes a style is one cache lookup.
 */
export function themedSheet<T extends NamedStyles<T> | AnyStyles>(factory: () => T & AnyStyles): T {
  let cached: { readonly key: string; readonly sheet: T } | null = null;
  const current = (): T => {
    if (cached?.key !== activeTheme.key) {
      cached = { key: activeTheme.key, sheet: StyleSheet.create(factory()) as T };
    }
    return cached.sheet;
  };
  return new Proxy({} as T, {
    get: (_target, key) => (current() as Record<string | symbol, unknown>)[key],
  });
}

/** The authored colour of a polity, for monograms and dots outside the map. */
export function nationColor(tag: string | null | undefined): string {
  if (tag === null || tag === undefined) return activeTheme.colors.faint;
  return rgbToCss(stateColor(tag));
}
