/**
 * Bundled historical flag registry.
 *
 * The generated module is the only place that knows asset paths. Everything
 * else resolves a flag by stable numeric polity ID. No network access and no
 * display-name matching are involved.
 */

import {
  BUNDLED_FLAGS,
  POLITY_FLAG,
  type BundledFlagAsset,
} from "../generated/flagAssets";
import { resolveBundledFlagId } from "./flagMapping";

export type { BundledFlagAsset };

export function flagAssetForPolity(
  polityId: number | null | undefined,
): BundledFlagAsset | null {
  const flagId = resolveBundledFlagId(polityId, POLITY_FLAG);
  if (flagId === null) return null;
  return BUNDLED_FLAGS[flagId] ?? null;
}

export function hasBundledFlag(polityId: number | null | undefined): boolean {
  return flagAssetForPolity(polityId) !== null;
}

export function bundledFlagCount(): number {
  return Object.keys(BUNDLED_FLAGS).length;
}

/**
 * Stable polity IDs used by the new-game briefing strip. They are numeric
 * catalog IDs, not display names: USA, GBR, DEU, FRA, RUS, CHN, OTT, JPN.
 */
export const BRIEFING_FLAG_POLITIES: readonly {
  readonly polityId: number;
  readonly tag: string;
}[] = [
  { polityId: 0, tag: "USA" },
  { polityId: 1, tag: "GBR" },
  { polityId: 2, tag: "DEU" },
  { polityId: 3, tag: "FRA" },
  { polityId: 4, tag: "RUS" },
  { polityId: 26, tag: "CHN" },
  { polityId: 20, tag: "OTT" },
  { polityId: 5, tag: "JPN" },
];
