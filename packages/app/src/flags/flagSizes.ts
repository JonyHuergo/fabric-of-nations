/**
 * Display sizes for the bundled historical flags.
 *
 * These are layout boxes, not image sizes: every flag keeps its own aspect
 * ratio inside the box (see `fitFlagInBox`). The top bar, picker and detail
 * sizes are the three sizes specified by the flag feature brief.
 */

export interface CountryFlagBox {
  readonly width: number;
  readonly height: number;
}

export const COUNTRY_FLAG_SIZES = {
  topBar: { width: 32, height: 22 },
  picker: { width: 48, height: 32 },
  detail: { width: 96, height: 64 },
  briefing: { width: 48, height: 32 },
} as const satisfies Readonly<Record<string, CountryFlagBox>>;

export type CountryFlagSize = keyof typeof COUNTRY_FLAG_SIZES;

/** The smallest supported display box, used by the rendering smoke tests. */
export const SMALLEST_COUNTRY_FLAG_BOX = COUNTRY_FLAG_SIZES.topBar;
