/**
 * The Living Atlas design tokens: the one source of truth for colour, type and
 * layout. The React Native theme, the WebGL map, the label painter and the SVG
 * fallback all read this module, which is why it imports nothing from React
 * Native or the DOM: the map runtime bundles it into the WebView.
 *
 * An era is presentation only. It is derived from the date in the worker
 * snapshot, never stored, and never read by the simulation. Eras may change
 * colour, tone and the dispatch medium; layout and controls never change.
 */

export type Rgb = readonly [number, number, number];

export type EraId = "imperial" | "machine-age" | "cold-war" | "digital";

export type DispatchMedium = "Telegram" | "Wireless" | "Teletype" | "Newswire";

export interface EraTheme {
  readonly id: EraId;
  readonly label: string;
  /** Inclusive calendar years. */
  readonly fromYear: number;
  readonly toYear: number;
  readonly sea: string;
  readonly accent: string;
  readonly paper: string;
  readonly chrome: string;
  /** Share of authored land saturation shown, 0..1. */
  readonly landSaturation: number;
  readonly dispatchMedium: DispatchMedium;
}

export const ERA_THEMES: Readonly<Record<EraId, EraTheme>> = {
  imperial: {
    id: "imperial",
    label: "Imperial",
    fromYear: 1900,
    toYear: 1918,
    sea: "#1b2f3a",
    accent: "#d9b35c",
    paper: "#efe6d2",
    chrome: "rgba(13,20,25,.9)",
    landSaturation: 1,
    dispatchMedium: "Telegram",
  },
  "machine-age": {
    id: "machine-age",
    label: "Machine age",
    fromYear: 1919,
    toYear: 1945,
    sea: "#16282c",
    accent: "#d9794f",
    paper: "#ece4d6",
    chrome: "rgba(16,20,20,.9)",
    landSaturation: 0.82,
    dispatchMedium: "Wireless",
  },
  "cold-war": {
    id: "cold-war",
    label: "Cold War",
    fromYear: 1946,
    toYear: 1979,
    sea: "#101f29",
    accent: "#62c6b4",
    paper: "#e4ebe8",
    chrome: "rgba(9,17,21,.92)",
    landSaturation: 0.62,
    dispatchMedium: "Teletype",
  },
  digital: {
    id: "digital",
    label: "Digital",
    fromYear: 1980,
    toYear: 2000,
    sea: "#0d1725",
    accent: "#79adff",
    paper: "#e8ecf3",
    chrome: "rgba(8,13,22,.92)",
    landSaturation: 0.72,
    dispatchMedium: "Newswire",
  },
};

export const ERA_ORDER: readonly EraId[] = ["imperial", "machine-age", "cold-war", "digital"];

/** Era of a calendar year. Years outside the campaign take the nearest era. */
export function eraForYear(year: number): EraTheme {
  for (const id of ERA_ORDER) {
    if (year <= ERA_THEMES[id].toYear) return ERA_THEMES[id];
  }
  return ERA_THEMES.digital;
}

/** Era of a snapshot date; before any campaign exists the century opens Imperial. */
export function eraForDate(date: { readonly year: number } | null | undefined): EraTheme {
  return date === null || date === undefined ? ERA_THEMES.imperial : eraForYear(date.year);
}

// ---- colour helpers ---------------------------------------------------------

export function hexToRgb(hex: string): Rgb {
  const value = hex.replace("#", "");
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

export function rgbToHex(color: Rgb): string {
  const part = (channel: number): string =>
    Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, "0");
  return `#${part(color[0])}${part(color[1])}${part(color[2])}`;
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

export function rgbaToCss(color: Rgb, alpha: number): string {
  return `rgba(${String(color[0])}, ${String(color[1])}, ${String(color[2])}, ${String(alpha)})`;
}

/** Parse `rgba(13,20,25,.9)` into a colour and its alpha. */
export function parseRgba(value: string): { readonly rgb: Rgb; readonly alpha: number } {
  const parts = value
    .replace(/^rgba?\(/u, "")
    .replace(/\)$/u, "")
    .split(",")
    .map((part) => Number.parseFloat(part));
  return { rgb: [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0], alpha: parts[3] ?? 1 };
}

/** Pull a colour toward its own luma, as the eras do to the land. */
export function desaturate(color: Rgb, saturation: number): Rgb {
  const luma = 0.2126 * color[0] + 0.7152 * color[1] + 0.0722 * color[2];
  return [
    Math.round(luma + (color[0] - luma) * saturation),
    Math.round(luma + (color[1] - luma) * saturation),
    Math.round(luma + (color[2] - luma) * saturation),
  ];
}

export function relativeLuminance(color: Rgb): number {
  const channel = (value: number): number => {
    const scaled = value / 255;
    return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(color[0]) + 0.7152 * channel(color[1]) + 0.0722 * channel(color[2]);
}

/** WCAG contrast ratio, 1..21. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

/** Floor a map label keeps against the fill it sits on, as in D-112. */
export const MAP_LABEL_MIN_CONTRAST = 2;

/**
 * Ink for a map label over a fill. Paper is the normal ink; a light fill such as
 * Austria-Hungary's white takes the dark chrome ink instead, the way Victoria 3
 * sets dark names on light countries. `fill` is null where there is no province
 * under the label (open sea), which keeps paper.
 */
export function mapLabelInk(paper: Rgb, ink: Rgb, fill: Rgb | null): Rgb {
  if (fill === null) return paper;
  return contrastRatio(paper, fill) >= MAP_LABEL_MIN_CONTRAST ? paper : ink;
}

// ---- resolved theme ---------------------------------------------------------

/** Every colour the interface may use. Screens read these names, never literals. */
export interface ResolvedColors {
  readonly background: string;
  readonly backgroundAlt: string;
  readonly surface: string;
  readonly surfaceRaised: string;
  readonly surfaceHover: string;
  readonly panel: string;
  readonly chrome: string;
  readonly paper: string;
  readonly border: string;
  readonly borderStrong: string;
  readonly text: string;
  readonly textStrong: string;
  readonly muted: string;
  readonly faint: string;
  readonly accent: string;
  readonly accentStrong: string;
  readonly accentSoft: string;
  readonly accentText: string;
  /** Hairline in the era accent: ornaments and the edge of a panel over the map. */
  readonly accentLine: string;
  /** Ink of the vignettes that set type over the map; used with an opacity. */
  readonly vignette: string;
  readonly green: string;
  readonly greenSoft: string;
  readonly red: string;
  readonly redSoft: string;
  readonly blue: string;
  readonly amber: string;
  readonly purple: string;
  readonly neutralSoft: string;
  readonly shadow: string;
  readonly mapOcean: string;
  readonly mapLand: string;
  /** International borders are fine paper-coloured lines. */
  readonly mapBorder: string;
  readonly mapProvinceLine: string;
  readonly mapGraticule: string;
  readonly mapLabel: string;
  readonly player: string;
  readonly overlay: string;
}

/** Colours the map renderers need, as sRGB bytes, plus the land treatment. */
export interface MapTokens {
  readonly seaDeep: Rgb;
  readonly seaShallow: Rgb;
  readonly lake: Rgb;
  readonly river: Rgb;
  readonly graticule: Rgb;
  readonly coast: Rgb;
  readonly border: Rgb;
  readonly provinceLine: Rgb;
  readonly casing: Rgb;
  readonly selection: Rgb;
  readonly ownerRealm: Rgb;
  readonly player: Rgb;
  readonly hover: Rgb;
  readonly selectedProvince: Rgb;
  readonly label: Rgb;
  readonly labelBack: Rgb;
  readonly landSaturation: number;
}

export interface ResolvedTheme {
  /** Stable identity of these exact values, used to cache derived styles. */
  readonly key: string;
  readonly eraId: EraId;
  readonly dispatchMedium: DispatchMedium;
  readonly colors: ResolvedColors;
  readonly map: MapTokens;
}

/** Semantic colours keep their meaning across every era. */
const SEMANTIC = {
  green: "#93c39a",
  red: "#e58f7c",
  blue: "#93b7e0",
  purple: "#b7a4d6",
} as const;

/**
 * Sequential ramp for province data lenses (P2), low to high. Matte, in the band of
 * the political palette, and ordered in lightness so it reads without hue alone.
 * The same in every era: a lens value must not change meaning with the theme.
 */
export const MAP_DATA_RAMP: readonly string[] = [
  "#2f4a57",
  "#3f6b6a",
  "#6d8f62",
  "#b3a35a",
  "#d9b46a",
] as const;

interface EraValues {
  readonly sea: Rgb;
  readonly accent: Rgb;
  readonly paper: Rgb;
  readonly chrome: Rgb;
  readonly chromeAlpha: number;
  readonly landSaturation: number;
}

function eraValues(era: EraTheme): EraValues {
  const chrome = parseRgba(era.chrome);
  return {
    sea: hexToRgb(era.sea),
    accent: hexToRgb(era.accent),
    paper: hexToRgb(era.paper),
    chrome: chrome.rgb,
    chromeAlpha: chrome.alpha,
    landSaturation: era.landSaturation,
  };
}

function resolveValues(values: EraValues, key: string, era: EraTheme): ResolvedTheme {
  const { sea, accent, paper, chrome, chromeAlpha, landSaturation } = values;
  const ink = chrome;
  const hex = rgbToHex;
  const green = hexToRgb(SEMANTIC.green);
  const red = hexToRgb(SEMANTIC.red);
  const colors: ResolvedColors = {
    background: hex(ink),
    backgroundAlt: hex(mixRgb(ink, sea, 0.28)),
    surface: hex(mixRgb(ink, paper, 0.05)),
    surfaceRaised: hex(mixRgb(ink, paper, 0.09)),
    surfaceHover: hex(mixRgb(ink, paper, 0.14)),
    panel: hex(mixRgb(ink, sea, 0.14)),
    chrome: rgbaToCss(chrome, chromeAlpha),
    paper: hex(paper),
    border: rgbaToCss(paper, 0.14),
    borderStrong: rgbaToCss(paper, 0.28),
    text: hex(mixRgb(paper, ink, 0.07)),
    textStrong: hex(paper),
    muted: hex(mixRgb(paper, ink, 0.24)),
    faint: hex(mixRgb(paper, ink, 0.36)),
    accent: hex(accent),
    accentStrong: hex(mixRgb(accent, paper, 0.22)),
    accentSoft: rgbaToCss(accent, 0.16),
    accentText: hex(ink),
    accentLine: rgbaToCss(accent, 0.42),
    vignette: hex(mixRgb(ink, sea, 0.12)),
    green: SEMANTIC.green,
    greenSoft: rgbaToCss(green, 0.16),
    red: SEMANTIC.red,
    redSoft: rgbaToCss(red, 0.16),
    blue: SEMANTIC.blue,
    amber: hex(accent),
    purple: SEMANTIC.purple,
    neutralSoft: rgbaToCss(paper, 0.1),
    shadow: "#000000",
    mapOcean: hex(sea),
    mapLand: hex(mixRgb(sea, paper, 0.16)),
    mapBorder: rgbaToCss(paper, 0.72),
    mapProvinceLine: rgbaToCss(paper, 0.2),
    mapGraticule: rgbaToCss(paper, 0.08),
    mapLabel: hex(paper),
    player: hex(accent),
    overlay: rgbaToCss(ink, 0.72),
  };
  const seaShallow = mixRgb(sea, mixRgb(paper, [96, 150, 170], 0.7), 0.1);
  const map: MapTokens = {
    seaDeep: mixRgb(sea, [0, 0, 0], 0.22),
    seaShallow,
    lake: mixRgb(sea, seaShallow, 0.6),
    river: mixRgb(sea, seaShallow, 0.85),
    graticule: paper,
    coast: mixRgb(sea, paper, 0.42),
    border: paper,
    provinceLine: paper,
    casing: ink,
    selection: accent,
    ownerRealm: mixRgb(accent, paper, 0.35),
    player: mixRgb(accent, paper, 0.5),
    hover: paper,
    selectedProvince: accent,
    label: paper,
    labelBack: ink,
    landSaturation,
  };
  return { key, eraId: era.id, dispatchMedium: era.dispatchMedium, colors, map };
}

/** The resolved tokens of one era. */
export function resolveEra(era: EraTheme): ResolvedTheme {
  return resolveValues(eraValues(era), era.id, era);
}

/**
 * Tokens part-way between two eras. Used for the restrained cross-fade when the
 * date crosses an era boundary; `amount` 0 is `from`, 1 is `to`.
 */
export function blendEras(from: EraTheme, to: EraTheme, amount: number): ResolvedTheme {
  if (amount <= 0) return resolveEra(from);
  if (amount >= 1) return resolveEra(to);
  const a = eraValues(from);
  const b = eraValues(to);
  const values: EraValues = {
    sea: mixRgb(a.sea, b.sea, amount),
    accent: mixRgb(a.accent, b.accent, amount),
    paper: mixRgb(a.paper, b.paper, amount),
    chrome: mixRgb(a.chrome, b.chrome, amount),
    chromeAlpha: a.chromeAlpha + (b.chromeAlpha - a.chromeAlpha) * amount,
    landSaturation: a.landSaturation + (b.landSaturation - a.landSaturation) * amount,
  };
  return resolveValues(values, `${from.id}>${to.id}@${amount.toFixed(3)}`, amount < 0.5 ? from : to);
}

/** Map tokens part-way between two themes, for the map's own per-frame fade. */
export function blendMapTokens(from: MapTokens, to: MapTokens, amount: number): MapTokens {
  const mix = (key: keyof Omit<MapTokens, "landSaturation">): Rgb => mixRgb(from[key], to[key], amount);
  return {
    seaDeep: mix("seaDeep"),
    seaShallow: mix("seaShallow"),
    lake: mix("lake"),
    river: mix("river"),
    graticule: mix("graticule"),
    coast: mix("coast"),
    border: mix("border"),
    provinceLine: mix("provinceLine"),
    casing: mix("casing"),
    selection: mix("selection"),
    ownerRealm: mix("ownerRealm"),
    player: mix("player"),
    hover: mix("hover"),
    selectedProvince: mix("selectedProvince"),
    label: mix("label"),
    labelBack: mix("labelBack"),
    landSaturation: from.landSaturation + (to.landSaturation - from.landSaturation) * amount,
  };
}

/** Total time of the era cross-fade, and how many steps the interface takes. */
export const ERA_TRANSITION_MS = 1600;
export const ERA_TRANSITION_STEPS = 8;

// ---- spacing ----------------------------------------------------------------

export const SPACING = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const RADII = {
  sm: 4,
  md: 8,
  lg: 12,
  pill: 999,
} as const;

// ---- typography -------------------------------------------------------------

/**
 * Family names are the names fonts are registered under on every platform. The
 * file names are the bundled files in `assets/fonts`; see docs/FONT_PROVENANCE.md.
 */
export const FONT_FILES = {
  Newsreader_400Regular: "Newsreader_400Regular.ttf",
  Newsreader_400Regular_Italic: "Newsreader_400Regular_Italic.ttf",
  Newsreader_500Medium: "Newsreader_500Medium.ttf",
  Newsreader_600SemiBold: "Newsreader_600SemiBold.ttf",
  IBMPlexSansCondensed_400Regular: "IBMPlexSansCondensed_400Regular.ttf",
  IBMPlexSansCondensed_500Medium: "IBMPlexSansCondensed_500Medium.ttf",
  IBMPlexSansCondensed_600SemiBold: "IBMPlexSansCondensed_600SemiBold.ttf",
  IBMPlexSansCondensed_700Bold: "IBMPlexSansCondensed_700Bold.ttf",
} as const;

export type FontFamily = keyof typeof FONT_FILES;

/** Newsreader for names and headlines, Plex Sans Condensed for labels and numbers. */
export const FONTS = {
  serif: "Newsreader_400Regular",
  serifItalic: "Newsreader_400Regular_Italic",
  serifMedium: "Newsreader_500Medium",
  serifSemiBold: "Newsreader_600SemiBold",
  sans: "IBMPlexSansCondensed_400Regular",
  sansMedium: "IBMPlexSansCondensed_500Medium",
  sansSemiBold: "IBMPlexSansCondensed_600SemiBold",
  sansBold: "IBMPlexSansCondensed_700Bold",
} as const satisfies Record<string, FontFamily>;

/** The two faces embedded in the map runtime for labels on the map. */
export const MAP_LABEL_FONTS: readonly FontFamily[] = [
  "IBMPlexSansCondensed_500Medium",
  "IBMPlexSansCondensed_600SemiBold",
];

export interface TypeMetric {
  readonly fontFamily: FontFamily;
  readonly fontSize: number;
  readonly lineHeight: number;
  readonly letterSpacing?: number;
  readonly uppercase?: boolean;
  readonly tabular?: boolean;
}

/** The type scale. Nothing on a phone is set below 11 pt except capitals labels. */
export const TYPE_SCALE = {
  /** The game's name on the title screen; compact phones take 34 pt. */
  hero: {
    fontFamily: FONTS.serifSemiBold,
    fontSize: 44,
    lineHeight: 46,
    letterSpacing: 5,
    uppercase: true,
  },
  /** Entries of the title-screen menu. */
  menu: {
    fontFamily: FONTS.serifMedium,
    fontSize: 19,
    lineHeight: 23,
    letterSpacing: 2.4,
    uppercase: true,
  },
  /** Widely spaced capitals over a heading: kickers and ornamented captions. */
  eyebrow: {
    fontFamily: FONTS.sansSemiBold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 2.4,
    uppercase: true,
  },
  display: { fontFamily: FONTS.serifSemiBold, fontSize: 30, lineHeight: 34, letterSpacing: 0.2 },
  title: { fontFamily: FONTS.serifSemiBold, fontSize: 20, lineHeight: 25 },
  section: { fontFamily: FONTS.serifMedium, fontSize: 16, lineHeight: 21 },
  label: {
    fontFamily: FONTS.sansSemiBold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.9,
    uppercase: true,
  },
  body: { fontFamily: FONTS.sans, fontSize: 14, lineHeight: 19 },
  small: { fontFamily: FONTS.sans, fontSize: 13, lineHeight: 17 },
  tiny: { fontFamily: FONTS.sans, fontSize: 12, lineHeight: 15 },
  number: { fontFamily: FONTS.sansMedium, fontSize: 14, lineHeight: 19, tabular: true },
  numberLarge: { fontFamily: FONTS.sansSemiBold, fontSize: 22, lineHeight: 26, tabular: true },
  mono: { fontFamily: FONTS.sansMedium, fontSize: 13, lineHeight: 17, tabular: true },
} as const satisfies Record<string, TypeMetric>;

// ---- layout -----------------------------------------------------------------

/** The smallest control on any device, in points. */
export const TOUCH_TARGET = 44;

/** The landscape phone every layout decision starts from. */
export const DESIGN_REFERENCE = { width: 844, height: 390 } as const;

export interface ShellMetrics {
  /** Outer gutter between controls and the safe area. */
  readonly gutter: number;
  readonly sheetWidth: number;
  /** Largest width a selection lens panel may take. */
  readonly lensPanelWidth: number;
  /** Room reserved beside a menu panel on the entry screens. */
  readonly menuPanelWidth: number;
  /** True on a landscape phone. Tablets and desktop only gain room. */
  readonly compact: boolean;
  readonly playButton: number;
}

/**
 * One layout, sized by the window. Phones in landscape are the reference and
 * tablets and desktop web receive the same arrangement with more room, so this is
 * the only place the shell asks how big the screen is.
 */
export function shellMetrics(width: number, height: number): ShellMetrics {
  const compact = height < 520;
  const wide = width >= 1100 && !compact;
  return {
    gutter: compact ? SPACING.sm : SPACING.md,
    sheetWidth: Math.min(wide ? 400 : compact ? 300 : 340, Math.max(280, width - 2 * TOUCH_TARGET - 32)),
    lensPanelWidth: compact ? 208 : 240,
    menuPanelWidth: Math.min(wide ? 420 : compact ? 330 : 380, width - 32),
    compact,
    playButton: compact ? 56 : 64,
  };
}

// ---- map labels and zoom ----------------------------------------------------

export type MapZoomLevel = "world" | "nation" | "province";

/**
 * The three zoom levels, in CSS pixels per map unit. World shows powers and
 * empires, nation shows countries and capitals, province shows provinces and
 * their names.
 */
export const MAP_ZOOM = {
  nationFrom: 2.4,
  provinceFrom: 7,
} as const;

export function zoomLevelForScale(scale: number): MapZoomLevel {
  if (scale >= MAP_ZOOM.provinceFrom) return "province";
  return scale >= MAP_ZOOM.nationFrom ? "nation" : "world";
}

export const MAP_LABELS = {
  /** No label on the map is drawn smaller than this, in points. */
  minSize: 11,
  maxSize: 27,
  /** About this many labels on the design-reference phone screen. */
  phoneBudget: 25,
  /** Larger screens scale the budget with their area, up to this. */
  maxBudget: 70,
} as const;

/** Label budget for a viewport: about 25 on a phone, more with more room. */
export function labelBudget(width: number, height: number): number {
  const area = (width * height) / (DESIGN_REFERENCE.width * DESIGN_REFERENCE.height);
  return Math.round(
    Math.min(MAP_LABELS.maxBudget, Math.max(MAP_LABELS.phoneBudget, MAP_LABELS.phoneBudget * Math.sqrt(area))),
  );
}

/** Fingertip pick tolerance in CSS pixels, and the finer one for a mouse. */
export const TOUCH_PICK_RADIUS = 18;
export const MOUSE_PICK_RADIUS = 5;
