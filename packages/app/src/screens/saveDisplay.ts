/**
 * How a saved game is named on the title and load screens. Presentation only:
 * everything here reads the save envelope, the slot record or a display snapshot.
 */

import type { SimulationSnapshot } from "@century/sim-worker";

import { eraForYear, type EraTheme } from "../design/tokens";
import { WORLD_CATALOG } from "../generated/worldCatalog";
import { SUPPORTED_SAVE_SCHEMA_VERSION, type SaveSlot } from "../storage/saveStorage";
import type { WorldCatalogEntry } from "../worldCatalogTypes";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** `1923-03-14` as `14 March 1923`. */
export function longDate(label: string): string {
  const [year, month, day] = label.split("-").map((part) => Number.parseInt(part, 10));
  if (year === undefined || month === undefined || day === undefined) return label;
  return `${String(day)} ${MONTHS[month - 1] ?? ""} ${String(year)}`;
}

/** The in-game year of a save, from its envelope; null when the envelope was unreadable. */
export function saveYear(slot: SaveSlot | null): number | null {
  if (slot === null || slot.metadata === null) return null;
  const year = Number.parseInt(slot.metadata.dateLabel.slice(0, 4), 10);
  return Number.isInteger(year) ? year : null;
}

/** The era a save is shown in; known from the envelope before the world is read. */
export function saveEra(slot: SaveSlot | null): EraTheme | null {
  const year = saveYear(slot);
  return year === null ? null : eraForYear(year);
}

/** The nation a save is played as, from the slot or, for an adopted save, its world. */
export function saveNation(
  slot: SaveSlot | null,
  world: SimulationSnapshot | null | undefined,
): WorldCatalogEntry | null {
  const id = slot?.playerCountryId ?? world?.playerCountryId ?? null;
  if (id === null) return null;
  return WORLD_CATALOG.entries.find((entry) => entry.id === id) ?? null;
}

/** Why this build cannot load a save, or null when it can try. */
export function saveProblem(slot: SaveSlot): string | null {
  if (slot.metadata === null) return "The save could not be read.";
  if (slot.metadata.schemaVersion !== SUPPORTED_SAVE_SCHEMA_VERSION) {
    return "Made by another version of the game; it cannot be loaded.";
  }
  return null;
}

/** `Saved 2 Nov 2026, 14:05`, in the device's own time; the time is a label, not game state. */
export function savedAtLabel(slot: SaveSlot): string {
  if (slot.savedAtMs === null) return "Saved before the save list existed";
  const at = new Date(slot.savedAtMs);
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `Saved ${String(at.getDate())} ${(MONTHS[at.getMonth()] ?? "").slice(0, 3)} ${String(
    at.getFullYear(),
  )}, ${pad(at.getHours())}:${pad(at.getMinutes())}`;
}
