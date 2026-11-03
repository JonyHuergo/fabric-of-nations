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
  // D-137: the state is kept as a signed 32-bit integer inside the loop (XOR and
  // `Math.imul` are the same modulo 2^32 on either reading) and made unsigned once.
  let hash = basis | 0;
  const length = text.length;
  for (let index = 0; index < length; index += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(index), FNV_PRIME);
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
  // D-137: a fast encoder produces the same text for every valid input; it builds no
  // path strings and keeps no ancestor set. On any input it cannot encode it defers
  // to the checked encoder below, which throws the exact error with its path.
  const fast = encodeFast(value, 0);
  if (fast !== null) return fast;
  return encodeValue(value, "$", new Set<object>());
}

/** Nesting bound of the fast encoder; deeper (or cyclic) input takes the checked path. */
const FAST_ENCODE_MAX_DEPTH = 256;

/**
 * The canonical encoding of `value`, or null when the value is outside what
 * `encodeValue` accepts (or nests deeper than the bound, which also catches cycles),
 * leaving the error to the checked encoder. For accepted input the text is identical:
 * sorted keys, `JSON.stringify` strings, finite numbers with -0 written as 0 (`String`
 * and `JSON.stringify` agree on every finite number, and `JSON.stringify` writes -0 as
 * 0, so an array of finite numbers is written natively).
 */
function encodeFast(value: unknown, depth: number): string | null {
  if (value === null) return "null";
  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "number":
      if (!Number.isFinite(value)) return null;
      return Object.is(value, -0) ? "0" : String(value);
    case "boolean":
      return value ? "true" : "false";
    case "object": {
      if (depth >= FAST_ENCODE_MAX_DEPTH) return null;
      if (Array.isArray(value)) {
        const array = value as unknown[];
        let numeric = true;
        for (let index = 0; index < array.length; index += 1) {
          if (!(index in array)) return null;
          const element = array[index];
          if (typeof element !== "number" || !Number.isFinite(element)) {
            numeric = false;
            break;
          }
        }
        if (numeric) return JSON.stringify(array);
        let out = "[";
        for (let index = 0; index < array.length; index += 1) {
          if (!(index in array)) return null;
          const encoded = encodeFast(array[index], depth + 1);
          if (encoded === null) return null;
          out += index === 0 ? encoded : `,${encoded}`;
        }
        return `${out}]`;
      }
      const record = value as Record<string, unknown>;
      const prototype: unknown = Object.getPrototypeOf(record);
      if (prototype !== Object.prototype && prototype !== null) return null;
      if (Object.getOwnPropertySymbols(record).length > 0) return null;
      const keys = Object.keys(record).sort();
      let out = "{";
      for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index] as string;
        const child = record[key];
        if (child === undefined) return null;
        const encoded = encodeFast(child, depth + 1);
        if (encoded === null) return null;
        out += `${index === 0 ? "" : ","}${JSON.stringify(key)}:${encoded}`;
      }
      return `${out}}`;
    }
    default:
      return null;
  }
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
