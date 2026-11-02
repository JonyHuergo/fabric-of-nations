/**
 * Lenses: map modes as the player meets them. A lens may appear only when real
 * game data exists for it, so availability is a question asked of the snapshot,
 * never a design decision. Adding a lens means adding a `MapMode` in `mapModes.ts`
 * and an entry here whose rule reads the data that mode draws.
 */

import type { SimulationSnapshot } from "@century/sim-worker";

import { MAP_MODES, type MapModeId } from "./mapModes";

export type LensData = Pick<SimulationSnapshot, "provinces" | "markets" | "regions">;

export interface Lens {
  readonly id: MapModeId;
  readonly label: string;
}

const LENS_RULES: Readonly<Record<MapModeId, (data: LensData | null) => boolean>> = {
  // Sovereignty is in the catalogue before any campaign exists.
  political: () => true,
  // Who holds a province is worker state, so it needs a campaign.
  control: (data) => data !== null && data.provinces.length > 0,
  // Market membership needs live markets with member regions.
  markets: (data) =>
    data !== null && data.markets.length > 0 && data.regions.some((region) => region.marketId !== null),
};

export const LENS_ORDER: readonly MapModeId[] = ["political", "control", "markets"];

/** The lenses that have real data right now, in display order. */
export function availableLenses(data: LensData | null): readonly Lens[] {
  return LENS_ORDER.filter((id) => LENS_RULES[id](data)).map((id) => ({
    id,
    label: MAP_MODES[id].label,
  }));
}
