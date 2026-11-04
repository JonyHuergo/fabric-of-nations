/// <reference lib="dom" />
/**
 * Map label ink on the WebGL overlay (D-138).
 *
 * The painter is driven with a recording 2D context, so the test sees the ink each
 * glyph is actually drawn in. A label must take its ink from the fill under its
 * text: a capital's name sits beside its dot and can cross a border, as Vaduz's
 * does from Liechtenstein onto Austria-Hungary's white.
 */

import { ERA_THEMES, hexToRgb, mapLabelInk, resolveEra, rgbToCss, rgbaToCss, type Rgb } from "../../app/src/design/tokens.js";
import { paintLabels, type FillAtScreen } from "../../app/src/map/labelPainter.js";
import type { PlacedLabel } from "../../app/src/map/labels.js";

const tokens = resolveEra(ERA_THEMES.imperial).map;
const WHITE: Rgb = hexToRgb("#d3dcf0");
const MATTE: Rgb = hexToRgb("#7c2529");

/** A 2D context that records the fill style of every glyph drawn. */
type PaintContext = Parameters<typeof paintLabels>[0];

function recordingContext(): { context: PaintContext; glyphInks: string[] } {
  const glyphInks: string[] = [];
  const state: Record<string, unknown> = { fillStyle: "", shadowColor: "" };
  const noop = (): void => undefined;
  const context = new Proxy(state, {
    get(target, key: string) {
      if (key === "measureText") return () => ({ width: 6 });
      if (key === "fillText") return () => glyphInks.push(String(target.fillStyle));
      if (key in target) return target[key];
      return noop;
    },
    set(target, key: string, value: unknown) {
      target[key] = value;
      return true;
    },
  }) as unknown as PaintContext;
  return { context, glyphInks };
}

function paint(placed: readonly PlacedLabel[], fillAt: FillAtScreen): string[] {
  const { context, glyphInks } = recordingContext();
  paintLabels(context, placed, [], { x: 0, y: 0, scale: 20 }, { width: 844, height: 390 }, 1, tokens, fillAt);
  return glyphInks;
}

/** White to the right of x = 100, a dark matte fill to the left. */
const splitFill: FillAtScreen = (x) => (x > 100 ? WHITE : MATTE);

describe("map label ink", () => {
  test("a capital whose name crosses onto a light fill takes the dark ink", () => {
    const vaduz: PlacedLabel = { kind: "capital", text: "Vaduz", x: 130, y: 50, size: 11, dotX: 95, dotY: 50 };
    const inks = paint([vaduz], splitFill);
    expect(inks).toHaveLength(5);
    expect(new Set(inks)).toEqual(new Set([rgbToCss(tokens.labelBack)]));
  });

  test("a capital whose name sits on a matte fill keeps paper", () => {
    const caracas: PlacedLabel = { kind: "capital", text: "Caracas", x: 60, y: 50, size: 11, dotX: 30, dotY: 50 };
    expect(new Set(paint([caracas], splitFill))).toEqual(new Set([rgbToCss(tokens.label)]));
  });

  test("country names follow the fill, and sea names stay paper", () => {
    const austria: PlacedLabel = {
      kind: "unit",
      text: "AUSTRIA-HUNGARY",
      x: 300,
      y: 100,
      angle: 0,
      size: 18,
      spacing: 1,
      emphasised: false,
      opacity: 1,
    };
    const sea: PlacedLabel = { kind: "sea", text: "Black Sea", x: 400, y: 200, size: 10 };
    const inks = paint([austria, sea], () => WHITE);
    expect(inks.slice(0, 15)).toEqual(Array(15).fill(rgbToCss(tokens.labelBack)));
    expect(new Set(inks.slice(15))).toEqual(new Set([rgbaToCss(tokens.label, 0.62)]));
  });

  test("the rule is the token rule, so both renderers agree", () => {
    expect(mapLabelInk(tokens.label, tokens.labelBack, WHITE)).toBe(tokens.labelBack);
    expect(mapLabelInk(tokens.label, tokens.labelBack, MATTE)).toBe(tokens.label);
    expect(mapLabelInk(tokens.label, tokens.labelBack, null)).toBe(tokens.label);
  });
});
