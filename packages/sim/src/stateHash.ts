/**
 * Stable digest of the complete authoritative world.
 *
 * The digest is a 64-bit value built from two FNV-1a lanes over canonical JSON
 * of the encoded world. It is used by determinism tests and diagnostics, not for
 * security. It intentionally includes diagnostics and all population/finance
 * state: an otherwise identical world with different authoritative state is not
 * bit-identical.
 */

import { dualFnv1a32Hex, stableStringify } from "./hash.js";
import { encodeWorld } from "./serialization.js";
import type { World } from "./world.js";

/**
 * M14 hash compatibility view.
 *
 * The authoritative state vocabulary is RUSD, but the deterministic diagnostic
 * digest predates M14 and is pinned by known-answer tests and benchmark
 * reports. Translating the encoded RUSD vocabulary back to the former SUSD
 * spelling for hashing keeps every historical digest stable without changing
 * any numeric value. Saves do not use this view: they serialize RUSD and keep
 * their own checksum over the canonical payload.
 */
function legacyMonetaryView(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replaceAll("RUSD", "SUSD").replaceAll("Rusd", "Susd").replaceAll("rusd", "susd");
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      value[index] = legacyMonetaryView(value[index]);
    }
    return value;
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      const legacyKey = key
        .replaceAll("RUSD", "SUSD")
        .replaceAll("Rusd", "Susd")
        .replaceAll("rusd", "susd");
      if (legacyKey !== key) {
        record[legacyKey] = record[key];
        delete record[key];
      }
      record[legacyKey] = legacyMonetaryView(record[legacyKey]);
    }
    return record;
  }
  return value;
}

/** Return a stable 16-hex-character digest of the complete authoritative world. */
export function hashWorld(world: World): string {
  return dualFnv1a32Hex(stableStringify(legacyMonetaryView(encodeWorld(world))));
}

/**
 * Digest of an already-encoded world (the `encodeWorld` shape), with the same view
 * and algorithm as `hashWorld`. Tests use it to show that a re-pinned digest differs
 * only by named encoding changes: removing them from a new encoding must reproduce
 * the previous digest.
 */
export function hashEncodedWorld(encoded: unknown): string {
  return dualFnv1a32Hex(stableStringify(legacyMonetaryView(JSON.parse(JSON.stringify(encoded)))));
}
