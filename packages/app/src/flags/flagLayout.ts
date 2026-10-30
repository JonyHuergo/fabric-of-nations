/**
 * Pure flag layout geometry.
 *
 * A flag is never stretched: it is contained inside its display box and
 * centred. The box keeps the row/header rhythm stable while the image keeps
 * the historical flag's own proportions (2:3, 1:2, 1:1, 7:10, Nepal's double
 * pennant, and so on).
 */

export interface FlagBox {
  readonly width: number;
  readonly height: number;
}

export interface FlagRenderLayout {
  readonly width: number;
  readonly height: number;
  readonly left: number;
  readonly top: number;
}

export function fitFlagInBox(box: FlagBox, aspectRatio: number): FlagRenderLayout {
  const safeAspect =
    Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 3 / 2;
  const boxWidth = Math.max(1, Math.round(box.width));
  const boxHeight = Math.max(1, Math.round(box.height));

  let width = boxWidth;
  let height = Math.round(boxWidth / safeAspect);
  if (height > boxHeight) {
    height = boxHeight;
    width = Math.round(boxHeight * safeAspect);
  }
  width = Math.max(1, Math.min(boxWidth, width));
  height = Math.max(1, Math.min(boxHeight, height));

  return {
    width,
    height,
    left: Math.round((boxWidth - width) / 2),
    top: Math.round((boxHeight - height) / 2),
  };
}
