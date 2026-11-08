/**
 * Lenses: map modes as the player meets them. A lens may appear only when real
 * game data exists for it, so availability is a question asked of the snapshot,
 * never a design decision. Adding a lens means adding a `MapMode` in `mapModes.ts`
 * and an entry here whose rule reads the data that mode draws.
 */

import type { SimulationSnapshot } from "@century/sim-worker";

import { MAP_MODES, type MapModeId } from "./mapModes";
import { provinceEconomyRows } from "@century/sim-worker";

export type LensData = Pick<SimulationSnapshot, "provinceOwnership" | "markets" | "provinceTable" | "professions">;

export interface Lens {
  readonly id: MapModeId;
  readonly label: string;
}

const LENS_RULES: Readonly<Record<MapModeId, (data: LensData | null) => boolean>> = {
  // Sovereignty is in the catalogue before any campaign exists.
  political: () => true,
  // Who holds a province is worker state, so it needs a campaign.
  control: (data) => data !== null && data.provinceOwnership.ids.length > 0,
  // Market membership needs live markets with member provinces.
  markets: (data) =>
    data !== null && data.markets.length > 0 && provinceEconomyRows(data).some((province) => province.marketId !== null),
  // P2 province lenses read the live province economy, so they need a campaign.
  density: (data) => populated(data),
  urban: (data) => populated(data),
  literacy: (data) => populated(data),
  unrest: (data) => populated(data),
  // P5: the harvest lens needs a campaign whose provinces have farm land.
  harvest: (data) => data !== null && provinceEconomyRows(data).some((province) => province.harvestFactor !== null),
  // P6 (D-153): the crowding lens needs a campaign with a dwelling stock.
  crowding: (data) => data !== null && provinceEconomyRows(data).some((province) => province.crowding !== null),
};

function populated(data: LensData | null): boolean {
  return data !== null && provinceEconomyRows(data).some((province) => province.population > 0);
}

export const LENS_ORDER: readonly MapModeId[] = [
  "political",
  "control",
  "markets",
  "density",
  "urban",
  "literacy",
  "unrest",
  "harvest",
  "crowding",
];

/** The lenses that have real data right now, in display order. */
export function availableLenses(data: LensData | null): readonly Lens[] {
  return LENS_ORDER.filter((id) => LENS_RULES[id](data)).map((id) => ({
    id,
    label: MAP_MODES[id].label,
  }));
}
