/**
 * Stable, platform-independent hashing and canonical JSON encoding.
 *
 * The FNV-1a 32-bit hash is used for the save integrity checksum, for the two
 * lanes of the test state digest, and for the two-lane purpose representation in
 * keyed randomness. It is deliberately simple and fully specified here. It is
 * not a cryptographic hash and must not be used for security decisions.
 *
 * FNV-1a parameters: offset basis 0x811c9dc5, prime 0x01000193. Each UTF-16 code
 * unit is XORed into the state before multiplying modulo 2^32. The result is an
 * unsigned 32-bit integer.
 *
 * `stableStringify` is a canonical JSON encoder: object keys are sorted by their
 * UTF-16 code units, arrays retain order, only finite numbers are accepted, and
 * `-0` is normalized to `0` so a value's meaning survives a JSON round trip.
 */

import { SAVE_CHECKSUM_PREFIX } from "./constants.js";

const FNV_OFFSET_BASIS = 0x811c_9dc5;
const FNV_PRIME = 0x0100_0193;
const SECOND_LANE_BASIS = 0x1b87_3593;

/** Alternate FNV-1a basis used for the second lane of a 64-bit digest. */
export const FNV_SECOND_LANE_BASIS = SECOND_LANE_BASIS;

/** Compute an FNV-1a 32-bit hash over a string's UTF-16 code units. */
export function fnv1a32(text: string, basis: number = FNV_OFFSET_BASIS): number {
  let hash = basis >>> 0;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash >>> 0;
}

/** Format an unsigned 32-bit integer as eight lower-case hexadecimal digits. */
export function toHex8(value: number): string {
  return (value >>> 0).toString(16).padStart(8, "0");
}

/** FNV-1a digest as eight hex digits. */
export function fnv1a32Hex(text: string): string {
  return toHex8(fnv1a32(text));
}

/**
 * A 64-bit test digest built from two FNV-1a lanes with independent offset
 * bases. Used by determinism tests and diagnostics, not for security.
 */
export function dualFnv1a32Hex(text: string): string {
  return `${toHex8(fnv1a32(text, FNV_OFFSET_BASIS))}${toHex8(fnv1a32(text, SECOND_LANE_BASIS))}`;
}

/** Canonical JSON encoding used by checksums, state hashes, and tests. */
export function stableStringify(value: unknown): string {
  return encodeValue(value, "$", new Set<object>());
}

function encodeValue(value: unknown, path: string, ancestors: Set<object>): string {
  if (value === null) return "null";

  switch (typeof value) {
    case "string": {
      const encoded = JSON.stringify(value);
      if (encoded === undefined) throw new TypeError(`${path} could not be encoded`);
      return encoded;
    }
    case "number": {
      if (!Number.isFinite(value)) {
        throw new TypeError(`${path} must be a finite number`);
      }
      const canonical = Object.is(value, -0) ? 0 : value;
      const encoded = JSON.stringify(canonical);
      if (encoded === undefined) throw new TypeError(`${path} could not be encoded`);
      return encoded;
    }
    case "boolean":
      return value ? "true" : "false";
    case "object": {
      if (ancestors.has(value)) {
        throw new TypeError(`${path} contains a cycle`);
      }
      ancestors.add(value);

      if (Array.isArray(value)) {
        const array = value as unknown[];
        const parts: string[] = [];
        for (let index = 0; index < array.length; index += 1) {
          if (!(index in array)) {
            throw new TypeError(`${path}[${String(index)}] is a sparse array slot`);
          }
          parts.push(encodeValue(array[index], `${path}[${String(index)}]`, ancestors));
        }
        ancestors.delete(value);
        return `[${parts.join(",")}]`;
      }

      const record = value as Record<string, unknown>;
      const prototype: unknown = Object.getPrototypeOf(record);
      if (prototype !== Object.prototype && prototype !== null) {
        throw new TypeError(`${path} must be a plain object`);
      }
      if (Object.getOwnPropertySymbols(record).length > 0) {
        throw new TypeError(`${path} must not contain symbol keys`);
      }

      const keys = Object.keys(record).sort();
      const parts: string[] = [];
      for (const key of keys) {
        const child = record[key];
        if (child === undefined) {
          throw new TypeError(`${path}.${key} must not be undefined`);
        }
        const encodedKey = JSON.stringify(key);
        if (encodedKey === undefined) throw new TypeError(`${path} has an unencodable key`);
        parts.push(`${encodedKey}:${encodeValue(child, `${path}.${key}`, ancestors)}`);
      }
      ancestors.delete(value);
      return `{${parts.join(",")}}`;
    }
    default:
      throw new TypeError(`${path} has unsupported type ${typeof value}`);
  }
}

/**
 * Save integrity checksum over canonical JSON. This detects accidental
 * corruption and simple edits; it is not an authentication mechanism.
 */
export function checksumOfJson(value: unknown): string {
  return `${SAVE_CHECKSUM_PREFIX}${fnv1a32Hex(stableStringify(value))}`;
}
