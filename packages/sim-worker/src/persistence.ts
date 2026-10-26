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
