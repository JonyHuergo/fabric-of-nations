/**
 * Save-storage codec used by the app.
 *
 * The canonical simulation save format is unchanged. This layer gzip-compresses
 * that exact string and base64-encodes it so a platform key/value store can hold
 * a large campaign save without changing validation, hashing, or save
 * compatibility. The prefix makes the storage representation explicit.
 */

import { gunzipSync, gzipSync, strFromU8, strToU8 } from "fflate";

export const COMPRESSED_SAVE_PREFIX = "century-save-gzip1:";
export const MAX_STORED_SAVE_LENGTH = 64 * 1024 * 1024;

const BASE64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const BASE64_LOOKUP = new Map(
  [...BASE64_ALPHABET].map((character, index) => [character, index] as const),
);

/** Encode bytes as standard padded base64 without Buffer/btoa. */
export function bytesToBase64(bytes: Uint8Array): string {
  let output = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    output += BASE64_ALPHABET[first >> 2] ?? "";
    output +=
      BASE64_ALPHABET[((first & 0x03) << 4) | ((second ?? 0) >> 4)] ?? "";
    output +=
      second === undefined
        ? "="
        : (BASE64_ALPHABET[((second & 0x0f) << 2) | ((third ?? 0) >> 6)] ?? "=");
    output += third === undefined ? "=" : (BASE64_ALPHABET[third & 0x3f] ?? "=");
  }
  return output;
}

/** Decode standard padded base64 into bytes. */
export function base64ToBytes(text: string): Uint8Array {
  if (text.length % 4 !== 0) {
    throw new RangeError("base64 length must be a multiple of four");
  }
  const padding = text.endsWith("==") ? 2 : text.endsWith("=") ? 1 : 0;
  const outputLength = (text.length / 4) * 3 - padding;
  const bytes = new Uint8Array(outputLength);
  let byteIndex = 0;
  for (let index = 0; index < text.length; index += 4) {
    let value = 0;
    for (let offset = 0; offset < 4; offset += 1) {
      const character = text[index + offset] ?? "";
      if (character === "=" && index + 4 === text.length && offset >= 4 - padding) {
        value <<= 6;
        continue;
      }
      const digit = BASE64_LOOKUP.get(character);
      if (digit === undefined) {
        throw new RangeError(`invalid base64 character ${JSON.stringify(character)}`);
      }
      value = (value << 6) | digit;
    }
    if (byteIndex < outputLength) bytes[byteIndex++] = (value >> 16) & 0xff;
    if (byteIndex < outputLength) bytes[byteIndex++] = (value >> 8) & 0xff;
    if (byteIndex < outputLength) bytes[byteIndex++] = value & 0xff;
  }
  return bytes;
}

/** Compress a canonical save string for platform storage. */
export function compressSaveForStorage(save: string): string {
  if (typeof save !== "string" || save.length === 0) {
    throw new TypeError("save must be a non-empty string");
  }
  const compressed = gzipSync(strToU8(save), { level: 9 });
  return `${COMPRESSED_SAVE_PREFIX}${bytesToBase64(compressed)}`;
}

/** Restore a canonical save string from platform storage. */
export function decompressSaveFromStorage(stored: string): string {
  if (typeof stored !== "string" || !stored.startsWith(COMPRESSED_SAVE_PREFIX)) {
    throw new RangeError(
      `stored save must start with ${JSON.stringify(COMPRESSED_SAVE_PREFIX)}`,
    );
  }
  if (stored.length > MAX_STORED_SAVE_LENGTH) {
    throw new RangeError("stored save exceeds the maximum supported length");
  }
  const payload = stored.slice(COMPRESSED_SAVE_PREFIX.length);
  if (payload.length === 0) throw new RangeError("stored save payload is empty");
  const compressed = base64ToBytes(payload);
  const restored = strFromU8(gunzipSync(compressed));
  if (restored.length === 0) throw new RangeError("stored save is empty after decompression");
  return restored;
}

/** User-visible metadata parsed from the canonical envelope without loading a world. */
export interface SaveMetadata {
  readonly formatVersion: number;
  readonly schemaVersion: number;
  readonly simVersion: string;
  readonly dataVersion: string;
  readonly scenarioId: string;
  readonly dayIndex: number;
  /** Canonical civil date label derived from the campaign day index. */
  readonly dateLabel: string;
  readonly seed: number;
  readonly checksum: string;
}

function leapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInCivilMonth(year: number, month: number): number {
  if (month === 2) return leapYear(year) ? 29 : 28;
  if (month === 4 || month === 6 || month === 9 || month === 11) return 30;
  return 31;
}

/**
 * Convert a campaign day index to its canonical civil label.
 *
 * This intentionally lives in the storage contract rather than importing the
 * simulation package into the app bundle. It mirrors the calendar's fixed
 * 1900-01-01 epoch and Gregorian month lengths; tests cross-check the boundaries.
 */
export function saveDateLabel(dayIndex: number): string {
  if (!Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex > 36_524) {
    throw new RangeError("save dayIndex must be an integer in 0..36524");
  }
  let remaining = dayIndex;
  let year = 1900;
  while (true) {
    const yearDays = leapYear(year) ? 366 : 365;
    if (remaining < yearDays) break;
    remaining -= yearDays;
    year += 1;
  }
  let month = 1;
  while (true) {
    const monthDays = daysInCivilMonth(year, month);
    if (remaining < monthDays) break;
    remaining -= monthDays;
    month += 1;
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(
    remaining + 1,
  ).padStart(2, "0")}`;
}

/**
 * Parse only the envelope metadata needed for a Continue/New Game decision.
 * This does not validate the world payload, checksum, or schema compatibility;
 * the worker remains the authoritative validator on load.
 */
export function readSaveMetadata(save: string): SaveMetadata {
  if (typeof save !== "string" || save.length === 0) {
    throw new RangeError("save must be a non-empty string");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(save) as unknown;
  } catch (error) {
    throw new RangeError(
      `save metadata is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new RangeError("save metadata must be an object");
  }
  const record = parsed as Record<string, unknown>;
  if (record.format !== "century-save") {
    throw new RangeError("save metadata has an unsupported format");
  }
  const formatVersion = record.formatVersion;
  const schemaVersion = record.schemaVersion;
  const dayIndex = record.dayIndex;
  const seed = record.seed;
  if (!Number.isInteger(formatVersion) || (formatVersion as number) < 0) {
    throw new RangeError("save metadata formatVersion must be a non-negative integer");
  }
  if (!Number.isInteger(schemaVersion) || (schemaVersion as number) < 0) {
    throw new RangeError("save metadata schemaVersion must be a non-negative integer");
  }
  if (!Number.isInteger(dayIndex) || (dayIndex as number) < 0 || (dayIndex as number) > 36_524) {
    throw new RangeError("save metadata dayIndex must be an integer in 0..36524");
  }
  if (!Number.isInteger(seed)) {
    throw new RangeError("save metadata seed must be an integer");
  }
  const simVersion = record.simVersion;
  const dataVersion = record.dataVersion;
  const scenarioId = record.scenarioId;
  const checksum = record.checksum;
  if (typeof simVersion !== "string" || simVersion.length === 0) {
    throw new RangeError("save metadata simVersion must be a non-empty string");
  }
  if (typeof dataVersion !== "string" || dataVersion.length === 0) {
    throw new RangeError("save metadata dataVersion must be a non-empty string");
  }
  if (typeof scenarioId !== "string" || scenarioId.length === 0) {
    throw new RangeError("save metadata scenarioId must be a non-empty string");
  }
  if (typeof checksum !== "string" || checksum.length === 0) {
    throw new RangeError("save metadata checksum must be a non-empty string");
  }
  return {
    formatVersion: formatVersion as number,
    schemaVersion: schemaVersion as number,
    simVersion,
    dataVersion,
    scenarioId,
    dayIndex: dayIndex as number,
    dateLabel: saveDateLabel(dayIndex as number),
    seed: seed as number,
    checksum,
  };
}

/** Platform key/value backend (AsyncStorage-compatible). */
export interface SaveStorageBackend {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export type StoredCampaignSource = "primary" | "staging" | "previous";

export interface StoredCampaign {
  readonly save: string;
  readonly metadata: SaveMetadata;
  readonly source: StoredCampaignSource;
  readonly storedBytes: number;
}

export interface StoredSaveInfo {
  readonly compressedBytes: number;
  readonly saveBytes: number;
  readonly metadata: SaveMetadata;
}

export interface SaveStoreOptions {
  /** Expected schema; incompatible candidates are rejected before load. */
  readonly expectedSchemaVersion: number;
  readonly expectedFormatVersion?: number;
  readonly keys?: {
    readonly primary?: string;
    readonly previous?: string;
    readonly staging?: string;
  };
}

/**
 * Replace-safe save storage over a non-transactional key/value backend.
 *
 * The canonical save is compressed/base64 encoded, written to a staging key,
 * read back, then copied over the primary key. The previous valid primary is
 * retained under a separate key. If a write or verification fails, the old
 * primary and previous save remain readable. AsyncStorage cannot provide a true
 * cross-key transaction, so the staging key is also a recovery candidate on the
 * next startup.
 */
export class SaveStore {
  private readonly backend: SaveStorageBackend;
  private readonly expectedSchemaVersion: number;
  private readonly expectedFormatVersion: number;
  private readonly primaryKey: string;
  private readonly previousKey: string;
  private readonly stagingKey: string;

  public constructor(backend: SaveStorageBackend, options: SaveStoreOptions) {
    this.backend = backend;
    this.expectedSchemaVersion = options.expectedSchemaVersion;
    this.expectedFormatVersion = options.expectedFormatVersion ?? 1;
    this.primaryKey = options.keys?.primary ?? "century.m7.save.v1";
    this.previousKey = options.keys?.previous ?? "century.m7.save.v1.previous";
    this.stagingKey = options.keys?.staging ?? "century.m7.save.v1.staging";
  }

  public async store(save: string): Promise<StoredSaveInfo> {
    const metadata = readSaveMetadata(save);
    if (metadata.schemaVersion !== this.expectedSchemaVersion) {
      throw new RangeError(
        `cannot store schema ${String(metadata.schemaVersion)}; expected ${String(
          this.expectedSchemaVersion,
        )}`,
      );
    }
    if (metadata.formatVersion !== this.expectedFormatVersion) {
      throw new RangeError(
        `cannot store format ${String(metadata.formatVersion)}; expected ${String(
          this.expectedFormatVersion,
        )}`,
      );
    }
    const stored = compressSaveForStorage(save);
    await this.backend.setItem(this.stagingKey, stored);
    const staged = await this.backend.getItem(this.stagingKey);
    if (staged !== stored) {
      throw new Error("staging save verification failed; previous save was not replaced");
    }

    // Preserve the old primary only if it is readable. Never replace a good
    // previous copy with a corrupt primary.
    const oldPrimary = await this.backend.getItem(this.primaryKey);
    if (oldPrimary !== null && this.isReadable(oldPrimary)) {
      await this.backend.setItem(this.previousKey, oldPrimary);
      const previous = await this.backend.getItem(this.previousKey);
      if (previous !== oldPrimary) {
        throw new Error("previous-save verification failed; primary was not replaced");
      }
    }

    await this.backend.setItem(this.primaryKey, stored);
    const primary = await this.backend.getItem(this.primaryKey);
    if (primary !== stored) {
      throw new Error(
        "primary-save verification failed; the previous valid save remains available",
      );
    }
    try {
      await this.backend.removeItem(this.stagingKey);
    } catch {
      // The staging key is only a recovery candidate; a leftover copy does not
      // invalidate the verified primary. It is overwritten by the next save.
    }
    return {
      compressedBytes: stored.length,
      saveBytes: save.length,
      metadata,
    };
  }

  /**
   * Load the newest readable compatible save. Candidate order is primary,
   * staging, previous: staging is a fully written replacement whose primary swap
   * may have been interrupted; previous is the last known-good older save.
   */
  public async load(): Promise<StoredCampaign | null> {
    const candidates: { readonly source: StoredCampaignSource; readonly key: string }[] = [
      { source: "primary", key: this.primaryKey },
      { source: "staging", key: this.stagingKey },
      { source: "previous", key: this.previousKey },
    ];
    let sawValue = false;
    let lastError: unknown = null;
    for (const candidate of candidates) {
      const stored = await this.backend.getItem(candidate.key);
      if (stored === null) continue;
      sawValue = true;
      try {
        const save = decompressSaveFromStorage(stored);
        const metadata = readSaveMetadata(save);
        if (metadata.schemaVersion !== this.expectedSchemaVersion) {
          throw new RangeError(
            `saved game uses schema ${String(metadata.schemaVersion)}; this build supports ${String(
              this.expectedSchemaVersion,
            )}`,
          );
        }
        if (metadata.formatVersion !== this.expectedFormatVersion) {
          throw new RangeError(
            `saved game uses format ${String(metadata.formatVersion)}; this build supports ${String(
              this.expectedFormatVersion,
            )}`,
          );
        }
        return { save, metadata, source: candidate.source, storedBytes: stored.length };
      } catch (error) {
        lastError = error;
      }
    }
    if (!sawValue) return null;
    throw new Error(
      `No readable saved game was found (the last error was: ${
        lastError instanceof Error ? lastError.message : String(lastError)
      })`,
    );
  }

  public async clear(): Promise<void> {
    await this.backend.removeItem(this.primaryKey);
    await this.backend.removeItem(this.previousKey);
    await this.backend.removeItem(this.stagingKey);
  }

  private isReadable(stored: string): boolean {
    try {
      const save = decompressSaveFromStorage(stored);
      readSaveMetadata(save);
      return true;
    } catch {
      return false;
    }
  }
}
