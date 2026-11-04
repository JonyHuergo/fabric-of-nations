/**
 * Paints placed labels onto the 2D overlay above the WebGL canvas.
 *
 * Every name is clean condensed capitals in the era's paper colour, or the dark
 * chrome ink over a light fill such as Austria-Hungary's white. There are no heavy
 * halos: a thin soft shadow is enough to lift paper off a matte fill. The overlay
 * does not repaint during a pure pan: the engine translates the canvas.
 */

import {
  FONTS,
  mapLabelInk,
  rgbToCss,
  rgbaToCss,
  type MapTokens,
  type Rgb,
} from "../design/tokens";
import type { Camera, MapViewportSize } from "./camera";
import { worldToScreen } from "./camera";
import type { PlacedLabel } from "./labels";

/** Below this scale tiny territories are drawn as locating dots. */
const MARKER_MAX_SCALE = 7;
const SEA_ALPHA = 0.62;
const PROVINCE_ALPHA = 0.9;

/** Set capitals along a baseline, one glyph at a time, for even tracking. */
function drawTracked(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  angle: number,
  tracking: number,
): void {
  const glyphs = [...text];
  const advances = glyphs.map((glyph) => context.measureText(glyph).width + tracking);
  const total = advances.reduce((sum, advance) => sum + advance, 0) - tracking;
  context.save();
  context.translate(x, y);
  context.rotate(angle);
  let cursor = -total / 2;
  for (let index = 0; index < glyphs.length; index += 1) {
    const advance = advances[index] ?? 0;
    context.fillText(glyphs[index] ?? "", cursor + (advance - tracking) / 2, 0);
    cursor += advance;
  }
  context.restore();
}

/** Fill colour under a screen point, or null where no province is drawn. */
export type FillAtScreen = (x: number, y: number) => Rgb | null;

/**
 * Paper ink normally. On a light fill, such as Austria-Hungary's white, the dark
 * chrome ink is used instead and the shadow is dropped: dark text on a pale field
 * needs no halo, and a dark halo would only thicken it.
 */
function applyInk(context: CanvasRenderingContext2D, tokens: MapTokens, fill: Rgb | null, alpha = 1): void {
  const ink = mapLabelInk(tokens.label, tokens.labelBack, fill);
  context.fillStyle = alpha >= 1 ? rgbToCss(ink) : rgbaToCss(ink, alpha);
  context.shadowColor = ink === tokens.label ? rgbaToCss(tokens.labelBack, 0.6) : "transparent";
}

function paintUnit(
  context: CanvasRenderingContext2D,
  label: Extract<PlacedLabel, { kind: "unit" }>,
  tokens: MapTokens,
  fill: Rgb | null,
): void {
  const { text, size, spacing, angle, emphasised, opacity } = label;
  context.font = `${size.toFixed(1)}px ${emphasised ? FONTS.sansSemiBold : FONTS.sansMedium}`;
  context.globalAlpha = opacity;
  applyInk(context, tokens, fill);
  drawTracked(context, text, label.x, label.y, angle, spacing);
  context.globalAlpha = 1;
}

function paintSea(
  context: CanvasRenderingContext2D,
  label: Extract<PlacedLabel, { kind: "sea" }>,
  tokens: MapTokens,
): void {
  context.font = `${label.size.toFixed(1)}px ${FONTS.sansMedium}`;
  context.fillStyle = rgbaToCss(tokens.label, SEA_ALPHA);
  context.shadowColor = rgbaToCss(tokens.labelBack, 0.6);
  drawTracked(context, label.text.toUpperCase(), label.x, label.y, 0, label.size * 0.14);
}

function paintPoint(
  context: CanvasRenderingContext2D,
  label: Extract<PlacedLabel, { kind: "province" | "capital" }>,
  tokens: MapTokens,
  fill: Rgb | null,
): void {
  const capital = label.kind === "capital";
  context.font = `${label.size.toFixed(1)}px ${capital ? FONTS.sansSemiBold : FONTS.sansMedium}`;
  applyInk(context, tokens, fill, capital ? 1 : PROVINCE_ALPHA);
  drawTracked(context, label.text.toUpperCase(), label.x, label.y, 0, label.size * 0.05);
  if (capital) {
    context.beginPath();
    context.arc(label.dotX, label.dotY, 2.4, 0, Math.PI * 2);
    context.fillStyle = rgbToCss(tokens.label);
    context.shadowColor = "transparent";
    context.fill();
    context.lineWidth = 1;
    context.strokeStyle = rgbToCss(tokens.labelBack);
    context.stroke();
  }
}

export function paintLabels(
  context: CanvasRenderingContext2D,
  placed: readonly PlacedLabel[],
  markers: readonly { readonly x: number; readonly y: number; readonly color: Rgb }[],
  camera: Camera,
  viewport: MapViewportSize,
  dpr: number,
  tokens: MapTokens,
  fillAt?: FillAtScreen,
): void {
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, viewport.width, viewport.height);
  if (camera.scale < MARKER_MAX_SCALE) {
    for (const marker of markers) {
      const point = worldToScreen(camera, viewport, marker.x, marker.y);
      if (point.x < -6 || point.x > viewport.width + 6 || point.y < -6 || point.y > viewport.height + 6) continue;
      context.beginPath();
      context.arc(point.x, point.y, 2.4, 0, Math.PI * 2);
      context.fillStyle = rgbToCss(marker.color);
      context.fill();
      context.lineWidth = 0.8;
      context.strokeStyle = rgbaToCss(tokens.label, 0.7);
      context.stroke();
    }
  }
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.shadowBlur = 3 * dpr;
  context.shadowOffsetY = 0.5 * dpr;
  for (const label of placed) {
    if (label.kind === "unit") paintUnit(context, label, tokens, fillAt?.(label.x, label.y) ?? null);
    else if (label.kind === "sea") paintSea(context, label, tokens);
    // Ink follows the fill under the text, not the dot: a capital's name sits beside
    // its dot and can cross a border, as Vaduz's does onto Austria-Hungary's white.
    else paintPoint(context, label, tokens, fillAt?.(label.x, label.y) ?? null);
  }
  context.shadowColor = "transparent";
  context.shadowBlur = 0;
  context.shadowOffsetY = 0;
}
