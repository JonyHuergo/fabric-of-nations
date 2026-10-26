import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  compressSaveForStorage,
  decompressSaveFromStorage,
} from "@century/sim-worker/persistence";

const SAVE_KEY = "century.m7.save.v1";

export interface StoredSaveInfo {
  readonly compressedBytes: number;
  readonly saveBytes: number;
}

/** Compress and persist a canonical simulation save. */
export async function storeSave(save: string): Promise<StoredSaveInfo> {
  const stored = compressSaveForStorage(save);
  await AsyncStorage.setItem(SAVE_KEY, stored);
  return { compressedBytes: stored.length, saveBytes: save.length };
}

/** Read and decompress the saved game, or null when none exists. */
export async function readSave(): Promise<string | null> {
  const stored = await AsyncStorage.getItem(SAVE_KEY);
  if (stored === null) return null;
  return decompressSaveFromStorage(stored);
}

/** Remove the saved game. */
export async function clearSave(): Promise<void> {
  await AsyncStorage.removeItem(SAVE_KEY);
}
