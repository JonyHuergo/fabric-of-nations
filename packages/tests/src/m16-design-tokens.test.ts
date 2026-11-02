/**
 * The Living Atlas design tokens: one source of truth, on every path.
 *
 * Era selection and the theme table are pure. The token-source checks read the
 * sources directly, as the other UI guards do: the repository has no React Native
 * renderer in the test environment. They fail if a platform path grows its own
 * palette, which is how the former design survived on phones.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ERA_ORDER,
  ERA_THEMES,
  FONT_FILES,
  MAP_LABEL_FONTS,
  MAP_ZOOM,
  TOUCH_TARGET,
  blendEras,
  blendMapTokens,
  contrastRatio,
  desaturate,
  eraForDate,
  eraForYear,
  hexToRgb,
  labelBudget,
  parseRgba,
  resolveEra,
  shellMetrics,
  zoomLevelForScale,
  type Rgb,
} from "../../app/src/design/tokens.js";
import { WORLD_CATALOG } from "../../app/src/generated/worldCatalog.js";
import { FUTURE_COLORS, STATE_COLORS, politicalColor } from "../../app/src/map/politicalPalette.js";
import { PROVINCE_MAP_1900 } from "../../app/src/provinceMapBundle.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const APP = join(ROOT, "packages/app");
const read = (path: string): string => readFileSync(join(APP, path), "utf8");

function sources(directory: string): readonly string[] {
  const found: string[] = [];
  for (const entry of readdirSync(join(APP, directory))) {
    const path = `${directory}/${entry}`;
    if (entry === "generated") continue;
    if (statSync(join(APP, path)).isDirectory()) found.push(...sources(path));
    else if (/\.tsx?$/u.test(entry)) found.push(path);
  }
  return found;
}

/** Everything that is allowed to spell a colour: tokens and authored map data. */
const COLOUR_SOURCES = new Set(["src/design/tokens.ts", "src/map/politicalPalette.ts", "src/map/mapModes.ts"]);

describe("era themes", () => {
  test("the four eras carry the approved values", () => {
    expect(ERA_THEMES.imperial).toMatchObject({
      fromYear: 1900,
      toYear: 1918,
      sea: "#1b2f3a",
      accent: "#d9b35c",
      paper: "#efe6d2",
      chrome: "rgba(13,20,25,.9)",
      landSaturation: 1,
      dispatchMedium: "Telegram",
    });
    expect(ERA_THEMES["machine-age"]).toMatchObject({
      fromYear: 1919,
      toYear: 1945,
      sea: "#16282c",
      accent: "#d9794f",
      paper: "#ece4d6",
      chrome: "rgba(16,20,20,.9)",
      landSaturation: 0.82,
      dispatchMedium: "Wireless",
    });
    expect(ERA_THEMES["cold-war"]).toMatchObject({
      fromYear: 1946,
      toYear: 1979,
      sea: "#101f29",
      accent: "#62c6b4",
      paper: "#e4ebe8",
      chrome: "rgba(9,17,21,.92)",
      landSaturation: 0.62,
      dispatchMedium: "Teletype",
    });
    expect(ERA_THEMES.digital).toMatchObject({
      fromYear: 1980,
      toYear: 2000,
      sea: "#0d1725",
      accent: "#79adff",
      paper: "#e8ecf3",
      chrome: "rgba(8,13,22,.92)",
      landSaturation: 0.72,
      dispatchMedium: "Newswire",
    });
  });

  test("every year of the century has exactly one era, without gaps", () => {
    for (let year = 1900; year <= 2000; year += 1) {
      const matches = ERA_ORDER.filter((id) => year >= ERA_THEMES[id].fromYear && year <= ERA_THEMES[id].toYear);
      expect(matches).toHaveLength(1);
      expect(eraForYear(year).id).toBe(matches[0]);
    }
  });

  test.each([
    [1900, "imperial"],
    [1918, "imperial"],
    [1919, "machine-age"],
    [1945, "machine-age"],
    [1946, "cold-war"],
    [1979, "cold-war"],
    [1980, "digital"],
    [2000, "digital"],
  ])("the date in %i selects %s", (year, era) => {
    expect(eraForDate({ year }).id).toBe(era);
  });

  test("before a campaign, and outside the campaign, the nearest era applies", () => {
    expect(eraForDate(null).id).toBe("imperial");
    expect(eraForYear(1890).id).toBe("imperial");
    expect(eraForYear(2030).id).toBe("digital");
  });

  test("eras are presentation only: nothing in the simulation can read them", () => {
    for (const path of ["packages/sim/src", "packages/sim-worker/src"]) {
      const walk = (directory: string): string[] =>
        readdirSync(directory).flatMap((entry) => {
          const full = join(directory, entry);
          return statSync(full).isDirectory() ? walk(full) : [full];
        });
      for (const file of walk(join(ROOT, path))) {
        expect(readFileSync(file, "utf8")).not.toMatch(/design\/tokens|ERA_THEMES|eraForDate/u);
      }
    }
  });

  test("a blend starts and ends exactly on the eras it joins", () => {
    const { imperial, digital } = ERA_THEMES;
    expect(blendEras(imperial, digital, 0).colors).toEqual(resolveEra(imperial).colors);
    expect(blendEras(imperial, digital, 1).colors).toEqual(resolveEra(digital).colors);
    const middle = blendEras(imperial, digital, 0.5);
    expect(middle.key).not.toBe(imperial.id);
    expect(middle.map.landSaturation).toBeCloseTo((1 + 0.72) / 2, 9);
  });

  test("map tokens fade on their own schedule through the same values", () => {
    const from = resolveEra(ERA_THEMES.imperial).map;
    const to = resolveEra(ERA_THEMES["cold-war"]).map;
    expect(blendMapTokens(from, to, 0)).toEqual(from);
    expect(blendMapTokens(from, to, 1)).toEqual(to);
  });

  test("only colour, tone and medium change between eras: layout is a function of the window", () => {
    expect(shellMetrics.length).toBe(2);
    expect(read("src/design/tokens.ts")).not.toMatch(/shellMetrics\([^)]*era/iu);
  });

  test.each(ERA_ORDER)("%s keeps interface text readable on chrome", (id) => {
    const theme = resolveEra(ERA_THEMES[id]);
    const chrome = parseRgba(ERA_THEMES[id].chrome).rgb;
    const { colors } = theme;
    expect(contrastRatio(hexToRgb(colors.textStrong), chrome)).toBeGreaterThan(10);
    expect(contrastRatio(hexToRgb(colors.text), chrome)).toBeGreaterThan(8);
    expect(contrastRatio(hexToRgb(colors.muted), chrome)).toBeGreaterThan(5.5);
    expect(contrastRatio(hexToRgb(colors.faint), chrome)).toBeGreaterThan(4.5);
    expect(contrastRatio(hexToRgb(colors.accent), chrome)).toBeGreaterThan(4.5);
    expect(contrastRatio(hexToRgb(colors.accentText), hexToRgb(colors.accent))).toBeGreaterThan(4.5);
  });
});

describe("one palette", () => {
  test("the authored starting colours are used exactly", () => {
    expect(STATE_COLORS).toMatchObject({
      GBR: "#9c5a5e",
      DEU: "#6d7075",
      FRA: "#4a6c9c",
      RUS: "#56775f",
      ITA: "#4b8a76",
      ESP: "#a88a48",
      PRT: "#6f8f5c",
      NLD: "#b0774a",
      BEL: "#7f6796",
      CHE: "#a2595a",
      SWE: "#5f86ab",
      DNK: "#a8745f",
      GRC: "#5a90b8",
      SRB: "#8c6282",
      MNT: "#6a9579",
      ROM: "#5e8f98",
      BGR: "#7f9c66",
      OTT: "#9a7550",
      LUX: "#66a0a3",
      PER: "#8f9658",
      AUT: "#ad9650",
    });
  });

  test("every polity that can ever appear on the map has an authored colour", () => {
    const missing = [
      ...WORLD_CATALOG.entries.filter((entry) => entry.kind === "state").map((entry) => entry.tag),
      ...PROVINCE_MAP_1900.futurePolities.map((polity) => polity.tag),
    ].filter((tag) => STATE_COLORS[tag] === undefined && FUTURE_COLORS[tag] === undefined);
    expect(missing).toEqual([]);
  });

  test("the colour for a tag never depends on which table holds it", () => {
    for (const tag of Object.keys(FUTURE_COLORS)) expect(STATE_COLORS[tag]).toBeUndefined();
  });

  test("paper labels are legible on the matte fills, and the land only gets quieter", () => {
    const entryByTag = new Map(WORLD_CATALOG.entries.map((entry) => [entry.tag, entry] as const));
    for (const id of ERA_ORDER) {
      const era = ERA_THEMES[id];
      const paper: Rgb = hexToRgb(era.paper);
      for (const entry of WORLD_CATALOG.entries) {
        const fill = desaturate(politicalColor(entry.tag, entryByTag), era.landSaturation);
        // The label also carries a thin dark shadow, so 2:1 is the floor for the fill alone.
        expect(contrastRatio(paper, fill)).toBeGreaterThanOrEqual(2);
      }
    }
  });

  test("the former palettes are gone from the application", () => {
    const theme = read("src/theme.ts");
    expect(theme).not.toContain("NATION_COLORS");
    expect(theme).not.toContain("lighten");
    expect(read("src/components/WorldMap.tsx")).not.toContain("MARKET_COLORS");
    expect(existsSync(join(APP, "src/map/GlWorldMap.tsx"))).toBe(false);
    expect(existsSync(join(APP, "src/screens/MapScreen.tsx"))).toBe(false);
  });

  test("no source outside the tokens and authored map data spells a colour", () => {
    const offenders: string[] = [];
    for (const path of [...sources("src"), "App.tsx"]) {
      if (COLOUR_SOURCES.has(path)) continue;
      const code = read(path).replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/gu, "");
      if (/#[0-9a-fA-F]{6}\b|\brgba?\(\d/u.test(code)) offenders.push(path);
    }
    expect(offenders).toEqual([]);
  });

  test("the WebGL map, labels, SVG fallback and interface all read the one token module", () => {
    expect(read("src/map/mapStyle.ts")).toContain('from "../design/tokens"');
    expect(read("src/map/labelPainter.ts")).toContain('from "../design/tokens"');
    expect(read("src/map/politicalPalette.ts")).toContain('from "../design/tokens"');
    expect(read("src/map/mapEngine.ts")).toContain('from "../design/tokens"');
    expect(read("src/components/WorldMap.tsx")).toContain('from "../design/tokens"');
    expect(read("src/theme.ts")).toContain('from "./design/tokens"');
  });

  test("the fallback applies the same era treatment of the land as the shader", () => {
    const worldMap = read("src/components/WorldMap.tsx");
    expect(worldMap).toContain("ERA_THEMES[eraId].landSaturation");
    expect(worldMap).toContain("desaturate(color, landSaturation)");
    expect(worldMap).toContain("marketColor(marketId)");
    expect(read("src/map/glRenderer.ts")).toContain("u_landSaturation");
    // Borders are paper, never black, on both renderers.
    expect(worldMap).toContain("stroke={colors.mapBorder}");
    expect(resolveEra(ERA_THEMES.imperial).map.border).toEqual(hexToRgb(ERA_THEMES.imperial.paper));
  });

  test("screens take every style from the live theme", () => {
    for (const path of sources("src/screens").filter((file) => file.endsWith(".tsx"))) {
      expect(read(path)).not.toContain("StyleSheet.create(");
    }
    expect(read("src/components/ui.tsx")).not.toContain("StyleSheet.create(");
  });

  test("text never asks a platform to synthesise a weight", () => {
    for (const path of [...sources("src/screens"), ...sources("src/components"), "App.tsx"]) {
      if (!path.endsWith(".tsx") || path.endsWith("WorldMap.tsx")) continue;
      expect(`${path}: ${String(read(path).includes("fontWeight"))}`).toBe(`${path}: false`);
    }
  });
});

describe("typography", () => {
  test("every bundled face exists, and the map embeds the label faces", () => {
    for (const file of Object.values(FONT_FILES)) expect(existsSync(join(APP, "assets/fonts", file))).toBe(true);
    for (const family of MAP_LABEL_FONTS) expect(FONT_FILES[family]).toBeDefined();
    expect(existsSync(join(APP, "assets/fonts/OFL-Newsreader.txt"))).toBe(true);
    expect(existsSync(join(APP, "assets/fonts/OFL-IBMPlexSansCondensed.txt"))).toBe(true);
    expect(readFileSync(join(ROOT, "docs/FONT_PROVENANCE.md"), "utf8")).toContain("SIL Open Font License");
  });

  test("the interface registers exactly the token faces", () => {
    const assets = read("src/design/fontAssets.ts");
    for (const [family, file] of Object.entries(FONT_FILES)) {
      expect(assets).toContain(`${family}: require("../../assets/fonts/${file}")`);
    }
  });

  test("the bundled faces cover every character in every map name", () => {
    const names = [
      ...WORLD_CATALOG.entries.flatMap((entry) => [entry.commonName, entry.capital.name]),
      ...PROVINCE_MAP_1900.provinces.map((province) => province.displayName),
    ].join("");
    const characters = new Set([...names.toUpperCase(), ...names]);
    for (const family of MAP_LABEL_FONTS) {
      const covered = glyphCoverage(readFileSync(join(APP, "assets/fonts", FONT_FILES[family])));
      const missing = [...characters].filter((character) => !covered.has(character.codePointAt(0) ?? 0));
      expect(missing).toEqual([]);
    }
  });
});

/** Read the format 4 cmap subtable of a TrueType font. */
function glyphCoverage(font: Buffer): ReadonlySet<number> {
  const tableCount = font.readUInt16BE(4);
  let cmap = -1;
  for (let index = 0; index < tableCount; index += 1) {
    const at = 12 + index * 16;
    if (font.toString("latin1", at, at + 4) === "cmap") cmap = font.readUInt32BE(at + 8);
  }
  const covered = new Set<number>();
  const subtables = font.readUInt16BE(cmap + 2);
  for (let index = 0; index < subtables; index += 1) {
    const offset = cmap + font.readUInt32BE(cmap + 4 + index * 8 + 4);
    if (font.readUInt16BE(offset) !== 4) continue;
    const segments = font.readUInt16BE(offset + 6) / 2;
    const ends = offset + 14;
    const starts = ends + segments * 2 + 2;
    for (let segment = 0; segment < segments; segment += 1) {
      const end = font.readUInt16BE(ends + segment * 2);
      const start = font.readUInt16BE(starts + segment * 2);
      for (let code = start; code <= end && code < 0xffff; code += 1) covered.add(code);
    }
  }
  return covered;
}

describe("layout and zoom", () => {
  test("the reference phone gets the specified sheet and every control 44 points", () => {
    const phone = shellMetrics(844, 390);
    expect(TOUCH_TARGET).toBe(44);
    expect(phone.compact).toBe(true);
    expect(phone.sheetWidth).toBe(300);
    expect(phone.playButton).toBeGreaterThanOrEqual(44);
  });

  test("tablets and desktop gain room, not a different layout", () => {
    const phone = shellMetrics(844, 390);
    const tablet = shellMetrics(1180, 820);
    const desktop = shellMetrics(1600, 900);
    expect(tablet.sheetWidth).toBeGreaterThan(phone.sheetWidth);
    expect(desktop.sheetWidth).toBeGreaterThanOrEqual(tablet.sheetWidth);
    expect(Object.keys(tablet).sort()).toEqual(Object.keys(phone).sort());
  });

  test("the sheet never crowds out the map on the smallest supported phone", () => {
    const small = shellMetrics(667, 375);
    expect(small.sheetWidth).toBeLessThan(667 / 2);
  });

  test("three zoom levels, in order", () => {
    expect(zoomLevelForScale(0.9)).toBe("world");
    expect(zoomLevelForScale(MAP_ZOOM.nationFrom)).toBe("nation");
    expect(zoomLevelForScale(MAP_ZOOM.provinceFrom - 0.01)).toBe("nation");
    expect(zoomLevelForScale(MAP_ZOOM.provinceFrom)).toBe("province");
  });

  test("about 25 labels on a phone, more only with more room", () => {
    expect(labelBudget(844, 390)).toBe(25);
    expect(labelBudget(667, 375)).toBe(25);
    expect(labelBudget(1600, 900)).toBeGreaterThan(25);
    expect(labelBudget(1600, 900)).toBeLessThanOrEqual(70);
  });
});
