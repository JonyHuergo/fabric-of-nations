import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  SaveLibrary,
  type SaveMetadata,
  type SaveSlot,
  type StoredCampaign,
  type StoredSlotInfo,
} from "@century/sim-worker/persistence";

/**
 * Must match `WORLD_SCHEMA_VERSION` in `@century/sim`. Kept explicit so the app
 * can reject an incompatible startup save before offering Continue; the worker
 * remains the authoritative validator when the save is loaded.
 */
export const SUPPORTED_SAVE_SCHEMA_VERSION = 27;

/** One slot per campaign, each a replace-safe SaveStore; see D-114. */
const library = new SaveLibrary(AsyncStorage, {
  expectedSchemaVersion: SUPPORTED_SAVE_SCHEMA_VERSION,
});

/** Every saved campaign, most recently saved first. */
export async function listSaves(): Promise<readonly SaveSlot[]> {
  return library.list();
}

/**
 * Compress and persist a canonical simulation save. Without a slot it starts a
 * new campaign slot; with one it replaces that campaign's save and keeps the
 * one before as its recovery copy.
 */
export async function storeSave(
  save: string,
  target: { readonly slotId?: string | null; readonly playerCountryId?: number | null } = {},
): Promise<StoredSlotInfo> {
  // Wall-clock time only labels the save in the list; nothing simulated reads it.
  const details = { playerCountryId: target.playerCountryId ?? null, savedAtMs: Date.now() };
  const slotId = target.slotId ?? null;
  return slotId === null ? library.create(save, details) : library.store(slotId, save, details);
}

/** A slot's save plus its envelope, or the most recent campaign's when no slot is named. */
export async function readStoredCampaign(slotId?: string): Promise<StoredCampaign | null> {
  const id = slotId ?? (await library.list())[0]?.id;
  return id === undefined ? null : library.load(id);
}

/** The canonical save text of a slot, or of the most recent campaign. */
export async function readSave(slotId?: string): Promise<string | null> {
  return (await readStoredCampaign(slotId))?.save ?? null;
}

/** Remember which nation a saved campaign is played as, once the worker has read it. */
export async function recordSaveNation(slotId: string, playerCountryId: number): Promise<SaveSlot | null> {
  return library.annotate(slotId, playerCountryId);
}

/** Delete one saved campaign and its recovery copies. */
export async function deleteSave(slotId: string): Promise<void> {
  await library.remove(slotId);
}

/** Remove every saved campaign. */
export async function clearSave(): Promise<void> {
  await library.clear();
}

export type { SaveMetadata, SaveSlot, StoredCampaign };
