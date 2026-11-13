/**
 * Save-storage codec used by the worker and the app.
 *
 * D-137 stored form (`STORED_SAVE_PREFIX`): the prefix, the save envelope's metadata
 * as one JSON line, then the canonical simulation save deflated (fflate, level 1:
 * pure JavaScript, the same on web, iOS and Android) and base64-encoded so a platform
 * key/value store can hold it. The worker produces it when saving (so compression
 * runs off the app thread) and accepts it when loading; the app stores and lists it
 * without decompressing, reading only the metadata line. The canonical save inside
 * is unchanged and carries its own checksum. Older stored forms are not read (D-155).
 */

import { deflateSync, inflateSync, strFromU8, strToU8 } from "fflate";

export const STORED_SAVE_PREFIX = "fon-save-deflate2:";
/**
 * Save envelope format this build writes and loads (the simulation's
 * `SAVE_FORMAT_VERSION`, mirrored so the app bundle does not import the simulation;
 * the worker test checks they agree).
 */
export const SAVE_FORMAT_VERSION = 2;
export const MAX_STORED_SAVE_LENGTH = 64 * 1024 * 1024;

const BASE64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const BASE64_LOOKUP = new Map(
  [...BASE64_ALPHABET].map((character, index) => [character, index] as const),
);

const BASE64_CODES = new Uint8Array([...BASE64_ALPHABET].map((character) => character.charCodeAt(0)));
const BASE64_PAD = "=".charCodeAt(0);
const BASE64_DECODE = (() => {
  const table = new Int16Array(128).fill(-1);
  for (let index = 0; index < BASE64_CODES.length; index += 1) table[BASE64_CODES[index] as number] = index;
  return table;
})();
/** Characters converted per `String.fromCharCode` call (well under engine argument limits). */
const BASE64_CHUNK = 0x8000;

/** Encode bytes as standard padded base64 without Buffer/btoa. */
export function bytesToBase64(bytes: Uint8Array): string {
  // D-137: character codes into a byte buffer, turned into text in chunks (was one
  // string concatenation per character).
  const output = new Uint8Array(Math.ceil(bytes.length / 3) * 4);
  let out = 0;
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const hasSecond = index + 1 < bytes.length;
    const hasThird = index + 2 < bytes.length;
    const second = hasSecond ? (bytes[index + 1] ?? 0) : 0;
    const third = hasThird ? (bytes[index + 2] ?? 0) : 0;
    output[out++] = BASE64_CODES[first >> 2] as number;
    output[out++] = BASE64_CODES[((first & 0x03) << 4) | (second >> 4)] as number;
    output[out++] = hasSecond ? (BASE64_CODES[((second & 0x0f) << 2) | (third >> 6)] as number) : BASE64_PAD;
    output[out++] = hasThird ? (BASE64_CODES[third & 0x3f] as number) : BASE64_PAD;
  }
  // Every code is ASCII, so a UTF-8 decoder yields exactly these characters; engines
  // without one take the chunked path (same text).
  const decoder = (globalThis as { TextDecoder?: new () => { decode(bytes: Uint8Array): string } }).TextDecoder;
  if (decoder !== undefined) return new decoder().decode(output);
  const parts: string[] = [];
  for (let start = 0; start < output.length; start += BASE64_CHUNK) {
    parts.push(String.fromCharCode(...output.subarray(start, start + BASE64_CHUNK)));
  }
  return parts.join("");
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
      const code = text.charCodeAt(index + offset);
      if (code === BASE64_PAD && index + 4 === text.length && offset >= 4 - padding) {
        value <<= 6;
        continue;
      }
      // D-137: a code table instead of a map lookup per character; same errors.
      const digit = code < 128 ? (BASE64_DECODE[code] ?? -1) : -1;
      if (digit < 0) {
        const character = text[index + offset] ?? "";
        if (BASE64_LOOKUP.get(character) === undefined) {
          throw new RangeError(`invalid base64 character ${JSON.stringify(character)}`);
        }
      }
      value = (value << 6) | digit;
    }
    if (byteIndex < outputLength) bytes[byteIndex++] = (value >> 16) & 0xff;
    if (byteIndex < outputLength) bytes[byteIndex++] = (value >> 8) & 0xff;
    if (byteIndex < outputLength) bytes[byteIndex++] = value & 0xff;
  }
  return bytes;
}

/**
 * The metadata fields of a canonical save envelope as a small JSON object text. A
 * save written by the simulation is canonical (sorted keys): its metadata is the text
 * before `"payload"` and after the payload's closing brace, so the large payload is
 * not parsed. Any other spelling is parsed in full.
 */
function envelopeMetadataText(save: string): string {
  const start = save.indexOf(',"payload":');
  const end = save.lastIndexOf(',"scenarioId":');
  if (save.startsWith('{"checksum":') && start > 0 && end > start) {
    const text = `${save.slice(0, start)},${save.slice(end + 1)}`;
    try {
      const parsed = JSON.parse(text) as unknown;
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) return text;
    } catch {
      // Fall through to the full parse below.
    }
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
  const { payload: _payload, ...metadata } = parsed as Record<string, unknown>;
  return JSON.stringify(metadata);
}

/** Compress a canonical save string for platform storage (D-137 stored form). */
export function compressSaveForStorage(save: string): string {
  if (typeof save !== "string" || save.length === 0) {
    throw new TypeError("save must be a non-empty string");
  }
  if (save.startsWith(STORED_SAVE_PREFIX)) return save;
  const metadata = envelopeMetadataText(save);
  const compressed = deflateSync(strToU8(save), { level: 1 });
  return `${STORED_SAVE_PREFIX}${metadata}\n${bytesToBase64(compressed)}`;
}

/** Restore a canonical save string from platform storage (either stored form). */
export function decompressSaveFromStorage(stored: string): string {
  if (typeof stored !== "string") {
    throw new RangeError(`stored save must start with ${JSON.stringify(STORED_SAVE_PREFIX)}`);
  }
  if (stored.length > MAX_STORED_SAVE_LENGTH) {
    throw new RangeError("stored save exceeds the maximum supported length");
  }
  if (stored.startsWith(STORED_SAVE_PREFIX)) {
    const newline = stored.indexOf("\n", STORED_SAVE_PREFIX.length);
    if (newline < 0) throw new RangeError("stored save has no metadata line");
    const payload = stored.slice(newline + 1);
    if (payload.length === 0) throw new RangeError("stored save payload is empty");
    const restored = strFromU8(inflateSync(base64ToBytes(payload)));
    if (restored.length === 0) throw new RangeError("stored save is empty after decompression");
    return restored;
  }
  throw new RangeError(`stored save must start with ${JSON.stringify(STORED_SAVE_PREFIX)}`);
}

/** Saves the worker can load: the stored form, or a canonical save. */
export function canonicalSaveOf(save: string): string {
  return save.startsWith(STORED_SAVE_PREFIX) ? decompressSaveFromStorage(save) : save;
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
  // D-137: the stored form carries the metadata on its first line; a canonical save
  // yields it without parsing the payload.
  let metadataText: string;
  if (save.startsWith(STORED_SAVE_PREFIX)) {
    const newline = save.indexOf("\n", STORED_SAVE_PREFIX.length);
    if (newline < 0) throw new RangeError("stored save has no metadata line");
    metadataText = save.slice(STORED_SAVE_PREFIX.length, newline);
  } else {
    metadataText = envelopeMetadataText(save);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(metadataText) as unknown;
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
  /** The backend keys of the save, its previous copy and its staging copy. */
  readonly keys: {
    readonly primary: string;
    readonly previous: string;
    readonly staging: string;
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
    this.expectedFormatVersion = options.expectedFormatVersion ?? SAVE_FORMAT_VERSION;
    this.primaryKey = options.keys.primary;
    this.previousKey = options.keys.previous;
    this.stagingKey = options.keys.staging;
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
        // D-137: a current save is returned in its stored form (the worker inflates
        // it); its metadata line is read without decompressing.
        const save = stored.startsWith(STORED_SAVE_PREFIX) ? stored : decompressSaveFromStorage(stored);
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
      readSaveMetadata(stored.startsWith(STORED_SAVE_PREFIX) ? stored : decompressSaveFromStorage(stored));
      return true;
    } catch {
      return false;
    }
  }
}

// ---- save library ---------------------------------------------------------------

/**
 * One campaign's saved game. Each slot is its own replace-safe `SaveStore`: the
 * slot key holds the save, and `<key>.previous` and `<key>.staging` its recovery
 * copies.
 */
export interface SaveSlot {
  readonly id: string;
  readonly key: string;
  /** Library-wide store counter at the slot's last save; larger is more recent. */
  readonly order: number;
  /** Wall-clock time of the last save as supplied by the caller; display only. */
  readonly savedAtMs: number | null;
  /** The campaign's player country, when the caller knew it. */
  readonly playerCountryId: number | null;
  /** Envelope of the last stored save; null when an adopted save could not be read. */
  readonly metadata: SaveMetadata | null;
  readonly storedBytes: number;
}

/** What the caller knows about a save that the save envelope does not record. */
export interface SaveSlotDetails {
  readonly playerCountryId: number | null;
  readonly savedAtMs: number | null;
}

export interface StoredSlotInfo extends StoredSaveInfo {
  readonly slot: SaveSlot;
}

export interface SaveLibraryOptions {
  readonly expectedSchemaVersion: number;
  readonly expectedFormatVersion?: number;
  readonly indexKey?: string;
  /** Prefix of the keys of new slots. */
  readonly slotKeyPrefix?: string;
}

interface SaveLibraryIndex {
  readonly version: 1;
  readonly nextSlot: number;
  readonly nextOrder: number;
  readonly slots: readonly SaveSlot[];
}

const SAVE_LIBRARY_INDEX_VERSION = 1;

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;
const isFilledString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

function isSaveMetadata(value: unknown): value is SaveMetadata {
  return (
    isRecordValue(value) &&
    isCount(value.formatVersion) &&
    isCount(value.schemaVersion) &&
    isFilledString(value.simVersion) &&
    isFilledString(value.dataVersion) &&
    isFilledString(value.scenarioId) &&
    isCount(value.dayIndex) &&
    value.dayIndex <= 36_524 &&
    value.dateLabel === saveDateLabel(value.dayIndex) &&
    typeof value.seed === "number" &&
    Number.isInteger(value.seed) &&
    isFilledString(value.checksum)
  );
}

function isSaveSlot(value: unknown): value is SaveSlot {
  return (
    isRecordValue(value) &&
    isFilledString(value.id) &&
    isFilledString(value.key) &&
    isCount(value.order) &&
    (value.savedAtMs === null || (typeof value.savedAtMs === "number" && Number.isFinite(value.savedAtMs))) &&
    (value.playerCountryId === null || isCount(value.playerCountryId)) &&
    (value.metadata === null || isSaveMetadata(value.metadata)) &&
    isCount(value.storedBytes)
  );
}

function parseLibraryIndex(raw: string): SaveLibraryIndex {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (error) {
    throw new RangeError(
      `the saved-game index is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (
    !isRecordValue(parsed) ||
    parsed.version !== SAVE_LIBRARY_INDEX_VERSION ||
    !isCount(parsed.nextSlot) ||
    !isCount(parsed.nextOrder) ||
    !Array.isArray(parsed.slots) ||
    !parsed.slots.every(isSaveSlot)
  ) {
    throw new RangeError("the saved-game index is malformed");
  }
  const nextOrder = parsed.nextOrder;
  const slots = parsed.slots as readonly SaveSlot[];
  const ids = new Set(slots.map((slot) => slot.id));
  const keys = new Set(slots.map((slot) => slot.key));
  if (ids.size !== slots.length || keys.size !== slots.length) {
    throw new RangeError("the saved-game index repeats a slot");
  }
  if (slots.some((slot) => slot.order >= nextOrder)) {
    throw new RangeError("the saved-game index orders a slot after its own counter");
  }
  return { version: SAVE_LIBRARY_INDEX_VERSION, nextSlot: parsed.nextSlot, nextOrder, slots };
}

/**
 * Every saved campaign, one slot each, over the same key/value backend.
 *
 * A campaign's saves always go to its own slot, so starting a new campaign never
 * replaces another. Slot writes keep the staging and previous-copy guarantees of
 * `SaveStore`; the index is one more verified key written after the slot, so an
 * interrupted index write can at worst leave an unlisted slot behind, never a
 * listed slot without its save. Operations are serialized, because the index is
 * read, changed and written back.
 */
export class SaveLibrary {
  private readonly backend: SaveStorageBackend;
  private readonly expectedSchemaVersion: number;
  private readonly expectedFormatVersion: number;
  private readonly indexKey: string;
  private readonly slotKeyPrefix: string;
  private queue: Promise<unknown> = Promise.resolve();

  public constructor(backend: SaveStorageBackend, options: SaveLibraryOptions) {
    this.backend = backend;
    this.expectedSchemaVersion = options.expectedSchemaVersion;
    this.expectedFormatVersion = options.expectedFormatVersion ?? SAVE_FORMAT_VERSION;
    this.indexKey = options.indexKey ?? "fon.saves.index.v1";
    this.slotKeyPrefix = options.slotKeyPrefix ?? "fon.saves.slot.";
  }

  /** Every slot, most recently saved first. */
  public list(): Promise<readonly SaveSlot[]> {
    return this.serial(async () => [...(await this.readIndex()).slots].sort((a, b) => b.order - a.order));
  }

  /** Store a save as a new campaign slot. */
  public create(save: string, details: SaveSlotDetails): Promise<StoredSlotInfo> {
    return this.serial(async () => {
      const index = await this.readIndex();
      const id = `c${String(index.nextSlot)}`;
      const key = `${this.slotKeyPrefix}${id}`;
      const info = await this.storeFor(key).store(save);
      const slot = this.slotRecord(id, key, index.nextOrder, details, info);
      await this.writeIndex({
        version: SAVE_LIBRARY_INDEX_VERSION,
        nextSlot: index.nextSlot + 1,
        nextOrder: index.nextOrder + 1,
        slots: [...index.slots, slot],
      });
      return { ...info, slot };
    });
  }

  /** Replace the save in an existing slot; its previous save stays as the recovery copy. */
  public store(slotId: string, save: string, details: SaveSlotDetails): Promise<StoredSlotInfo> {
    return this.serial(async () => {
      const index = await this.readIndex();
      const existing = index.slots.find((slot) => slot.id === slotId);
      if (existing === undefined) throw new RangeError(`no saved game ${JSON.stringify(slotId)}`);
      const info = await this.storeFor(existing.key).store(save);
      const slot = this.slotRecord(
        existing.id,
        existing.key,
        index.nextOrder,
        { playerCountryId: details.playerCountryId ?? existing.playerCountryId, savedAtMs: details.savedAtMs },
        info,
      );
      await this.writeIndex({
        ...index,
        nextOrder: index.nextOrder + 1,
        slots: index.slots.map((candidate) => (candidate.id === slotId ? slot : candidate)),
      });
      return { ...info, slot };
    });
  }

  /**
   * Record the player country of a slot that did not know it, such as an adopted
   * save, once the worker has read the save. A slot that knows its country keeps it.
   */
  public annotate(slotId: string, playerCountryId: number): Promise<SaveSlot | null> {
    return this.serial(async () => {
      const index = await this.readIndex();
      const existing = index.slots.find((slot) => slot.id === slotId);
      if (existing === undefined) return null;
      if (existing.playerCountryId !== null) return existing;
      const slot: SaveSlot = { ...existing, playerCountryId };
      await this.writeIndex({
        ...index,
        slots: index.slots.map((candidate) => (candidate.id === slotId ? slot : candidate)),
      });
      return slot;
    });
  }

  /** The newest readable save of a slot, falling back to its recovery copies. */
  public load(slotId: string): Promise<StoredCampaign | null> {
    return this.serial(async () => {
      const slot = (await this.readIndex()).slots.find((candidate) => candidate.id === slotId);
      if (slot === undefined) return null;
      return this.storeFor(slot.key).load();
    });
  }

  /** Delete a slot and its recovery copies; unlisting comes first, so a half-done delete only leaves keys behind. */
  public remove(slotId: string): Promise<void> {
    return this.serial(async () => {
      const index = await this.readIndex();
      const slot = index.slots.find((candidate) => candidate.id === slotId);
      if (slot === undefined) return;
      await this.writeIndex({ ...index, slots: index.slots.filter((candidate) => candidate.id !== slotId) });
      await this.storeFor(slot.key).clear();
    });
  }

  /** Delete every slot and the index. */
  public clear(): Promise<void> {
    return this.serial(async () => {
      const index = await this.readIndex();
      await this.backend.removeItem(this.indexKey);
      for (const slot of index.slots) await this.storeFor(slot.key).clear();
    });
  }

  private serial<T>(work: () => Promise<T>): Promise<T> {
    const result = this.queue.then(work, work);
    this.queue = result.catch(() => undefined);
    return result;
  }

  private storeFor(key: string): SaveStore {
    return new SaveStore(this.backend, {
      expectedSchemaVersion: this.expectedSchemaVersion,
      expectedFormatVersion: this.expectedFormatVersion,
      keys: { primary: key, previous: `${key}.previous`, staging: `${key}.staging` },
    });
  }

  private slotRecord(
    id: string,
    key: string,
    order: number,
    details: SaveSlotDetails,
    info: StoredSaveInfo,
  ): SaveSlot {
    return {
      id,
      key,
      order,
      savedAtMs: details.savedAtMs,
      playerCountryId: details.playerCountryId,
      metadata: info.metadata,
      storedBytes: info.compressedBytes,
    };
  }

  private async readIndex(): Promise<SaveLibraryIndex> {
    const raw = await this.backend.getItem(this.indexKey);
    if (raw !== null) return parseLibraryIndex(raw);
    return { version: SAVE_LIBRARY_INDEX_VERSION, nextSlot: 1, nextOrder: 1, slots: [] };
  }

  private async writeIndex(index: SaveLibraryIndex): Promise<void> {
    const raw = JSON.stringify(index);
    await this.backend.setItem(this.indexKey, raw);
    if ((await this.backend.getItem(this.indexKey)) !== raw) {
      throw new Error("saved-game index verification failed");
    }
  }
}
