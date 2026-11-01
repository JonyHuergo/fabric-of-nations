/**
 * Paints placed labels onto the 2D overlay above the WebGL canvas.
 *
 * Unit names are set letter by letter along a shallow bow in a spaced serif, as
 * on an engraved atlas. Everything else is horizontal. Text on land is dark ink
 * with a parchment halo; text on water is pale. The overlay does not repaint
 * during a pure pan: the engine translates the canvas instead.
 */

import type { Camera, MapViewportSize } from "./camera";
import { worldToScreen } from "./camera";
import type { PlacedLabel } from "./labels";
import { rgbToCss, type Rgb } from "./politicalPalette";

const SERIF = "Georgia, 'Iowan Old Style', 'Times New Roman', serif";
const SANS = "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif";
const INK = "#241f18";
const HALO = "rgba(246, 240, 226, 0.58)";
const SEA_INK = "rgba(203, 224, 232, 0.8)";
const SEA_HALO = "rgba(16, 38, 50, 0.45)";
/** Below this scale tiny territories are drawn as locating dots. */
const MARKER_MAX_SCALE = 7;

function paintUnit(
  context: CanvasRenderingContext2D,
  label: Extract<PlacedLabel, { kind: "unit" }>,
): void {
  const { text, size, spacing, bow, angle, emphasised, opacity } = label;
  context.font = `${emphasised ? "600" : "500"} ${size.toFixed(1)}px ${SERIF}`;
  const glyphs = [...text];
  const advances = glyphs.map((glyph) => context.measureText(glyph).width + spacing);
  const total = advances.reduce((sum, advance) => sum + advance, 0) - spacing;
  const halfWidth = total / 2;
  const curvature = halfWidth > 0 ? (bow * 2) / (halfWidth * halfWidth) / 2 : 0;
  context.save();
  context.translate(label.x, label.y);
  context.rotate(angle);
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.lineJoin = "round";
  context.miterLimit = 2;
  const pass = (stroke: boolean): void => {
    let cursor = -halfWidth;
    for (let index = 0; index < glyphs.length; index += 1) {
      const glyph = glyphs[index] ?? "";
      const advance = advances[index] ?? 0;
      const along = cursor + (advance - spacing) / 2;
      const drop = curvature * along * along - bow / 2;
      context.save();
      context.translate(along, drop);
      context.rotate(Math.atan(2 * curvature * along));
      if (stroke) context.strokeText(glyph, 0, 0);
      else context.fillText(glyph, 0, 0);
      context.restore();
      cursor += advance;
    }
  };
  context.globalAlpha = opacity;
  context.strokeStyle = HALO;
  context.lineWidth = Math.min(3, Math.max(1.8, size * 0.1));
  pass(true);
  // Large names read as a wash over the country; small ones need full contrast.
  const inkAlpha = emphasised ? 1 : 1 - Math.min(0.22, Math.max(0, (size - 14) * 0.016));
  context.globalAlpha = opacity * inkAlpha;
  context.fillStyle = INK;
  pass(false);
  context.restore();
}

function paintSea(context: CanvasRenderingContext2D, label: Extract<PlacedLabel, { kind: "sea" }>): void {
  const upper = label.text === label.text.toUpperCase();
  context.font = `italic ${upper ? "500" : "400"} ${label.size.toFixed(1)}px ${SERIF}`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  const text = upper ? [...label.text].join(" ") : label.text;
  context.lineJoin = "round";
  context.strokeStyle = SEA_HALO;
  context.lineWidth = 2.6;
  context.strokeText(text, label.x, label.y);
  context.fillStyle = SEA_INK;
  context.fillText(text, label.x, label.y);
}

function paintPoint(
  context: CanvasRenderingContext2D,
  label: Extract<PlacedLabel, { kind: "province" | "capital" }>,
): void {
  const capital = label.kind === "capital";
  context.font = capital
    ? `600 ${label.size.toFixed(1)}px ${SERIF}`
    : `500 ${label.size.toFixed(1)}px ${SANS}`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.lineJoin = "round";
  context.strokeStyle = HALO;
  context.lineWidth = 2.4;
  context.strokeText(label.text, label.x, label.y);
  context.fillStyle = capital ? INK : "rgba(36, 31, 24, 0.86)";
  context.fillText(label.text, label.x, label.y);
  if (capital) {
    context.beginPath();
    context.arc(label.dotX, label.dotY, 2.6, 0, Math.PI * 2);
    context.fillStyle = "#fffaf0";
    context.fill();
    context.lineWidth = 1.3;
    context.strokeStyle = INK;
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
      context.lineWidth = 0.9;
      context.strokeStyle = "rgba(20, 17, 13, 0.85)";
      context.stroke();
    }
  }
  for (const label of placed) {
    if (label.kind === "unit") paintUnit(context, label);
    else if (label.kind === "sea") paintSea(context, label);
    else paintPoint(context, label);
  }
}
