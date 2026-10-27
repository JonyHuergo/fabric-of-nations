import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  SaveStore,
  type SaveMetadata,
  type StoredCampaign,
  type StoredSaveInfo,
} from "@century/sim-worker/persistence";

/**
 * Must match `WORLD_SCHEMA_VERSION` in `@century/sim`. Kept explicit so the app
 * can reject an incompatible startup save before offering Continue; the worker
 * remains the authoritative validator when the save is loaded.
 */
export const SUPPORTED_SAVE_SCHEMA_VERSION = 16;

const store = new SaveStore(AsyncStorage, {
  expectedSchemaVersion: SUPPORTED_SAVE_SCHEMA_VERSION,
});

/** Compress and persist a canonical simulation save using replace-safe keys. */
export async function storeSave(save: string): Promise<StoredSaveInfo> {
  return store.store(save);
}

/** Read the newest readable saved game, or null when none exists. */
export async function readSave(): Promise<string | null> {
  const campaign = await store.load();
  return campaign?.save ?? null;
}

/** Read the save plus its envelope metadata for the Continue/New Game choice. */
export async function readStoredCampaign(): Promise<StoredCampaign | null> {
  return store.load();
}

/** Remove the primary, previous, and staging saves. */
export async function clearSave(): Promise<void> {
  await store.clear();
}

export type { SaveMetadata, StoredCampaign };
