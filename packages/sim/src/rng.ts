/**
 * Keyed, counter-based deterministic randomness (GDD §16.1).
 *
 * There is no mutable PRNG stream and no module-level state. Every draw is a
 * pure function of the stable tuple:
 *
 *   (seed, day, entityId, purpose, drawIndex)
 *
 * A draw for one entity or purpose therefore cannot shift the outcomes of an
 * unrelated draw, and processing entities in a different incidental order does
 * not change an individual entity's value.
 *
 * Algorithm (all arithmetic modulo 2^32):
 * 1. Represent the purpose with two independent FNV-1a-32 lanes over its UTF-16
 *    code units plus the purpose length. A single 32-bit purpose hash was found
 *    to admit practical collisions between valid purpose strings, so both lanes
 *    and the length are mixed.
 * 2. Combine the purpose high lane, purpose length, seed, day, entityId, and
 *    drawIndex in that exact order with the boost-style combine step below.
 * 3. Finalize with the MurmurHash3 32-bit finalizer (`fmix32`).
 * 4. `drawUint32` returns the finalized unsigned integer; `drawUnitFloat`
 *    divides it by 2^32, producing a value in [0, 1).
 *
 * The combine step is:
 *   h = (h XOR (value + 0x9E3779B9 + (h << 6) + (h >> 2))) mod 2^32
 *
 * Purpose identifiers are restricted to stable lower-case ASCII names such as
 * `demographics.births` or `ai.build-decision`. This avoids Unicode
 * normalization and host-locale differences affecting known-answer vectors.
 */

import { assertValidDayIndex } from "./calendar.js";
import { MAX_PURPOSE_LENGTH } from "./constants.js";
import { FNV_SECOND_LANE_BASIS, fnv1a32 } from "./hash.js";
import type { Day, DayIndex, Id, Seed } from "./types.js";
import { requireString, requireUint32 } from "./validation.js";
import type { World } from "./world.js";

const COMBINE_GOLDEN = 0x9e37_79b9;
const UNIT_DENOMINATOR = 4_294_967_296;

const PURPOSE_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;

/** A complete key for one deterministic draw. */
export interface RandomKey {
  /** World seed. */
  readonly seed: Seed;
  /** Civil day the draw belongs to. */
  readonly day: DayIndex;
  /** Stable entity identifier, or 0 for world-level draws. */
  readonly entityId: Id;
  /** Stable purpose identifier. */
  readonly purpose: string;
  /** Counter for multiple independent draws under the same key. */
  readonly drawIndex: number;
}

/** Validate and normalize a purpose identifier. */
export function assertRandomPurpose(purpose: string): void {
  requireString(purpose, "purpose", { minLength: 1, maxLength: MAX_PURPOSE_LENGTH });
  if (!PURPOSE_PATTERN.test(purpose)) {
    throw new RangeError(
      `purpose must be a lower-case ASCII identifier using dots, underscores, or hyphens, received ${JSON.stringify(purpose)}`,
    );
  }
}

/** Throw a clear error for an invalid random key. */
export function assertValidRandomKey(key: RandomKey): void {
  requireUint32(key.seed, "random key.seed");
  assertValidDayIndex(key.day);
  requireUint32(key.entityId, "random key.entityId");
  requireUint32(key.drawIndex, "random key.drawIndex");
  assertRandomPurpose(key.purpose);
}

function combine(hash: number, value: number): number {
  const mixed = (value + COMBINE_GOLDEN + ((hash << 6) >>> 0) + (hash >>> 2)) >>> 0;
  return (hash ^ mixed) >>> 0;
}

function fmix32(hash: number): number {
  let value = hash >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x85eb_ca6b) >>> 0;
  value ^= value >>> 13;
  value = Math.imul(value, 0xc2b2_ae35) >>> 0;
  value ^= value >>> 16;
  return value >>> 0;
}

/**
 * D-137: validated purposes and the hash after their three purpose steps (step 1 of
 * the algorithm above). This is a pure function of the purpose string, memoised
 * because every draw re-validated its purpose with a regular expression and hashed
 * it twice. A derived value only: every draw returns the same value with or without
 * it, nothing is stored in a world, and the cache is bounded so arbitrary purposes
 * cannot grow it without limit.
 */
const purposePrefixCache = new Map<string, number>();
const PURPOSE_PREFIX_CACHE_LIMIT = 1024;

function purposePrefix(purpose: string): number {
  const cached = purposePrefixCache.get(purpose);
  if (cached !== undefined) return cached;
  assertRandomPurpose(purpose);
  let hash = fnv1a32(purpose);
  hash = combine(hash, fnv1a32(purpose, FNV_SECOND_LANE_BASIS));
  hash = combine(hash, purpose.length);
  if (purposePrefixCache.size < PURPOSE_PREFIX_CACHE_LIMIT) purposePrefixCache.set(purpose, hash);
  return hash;
}

/** Return the unsigned 32-bit result of one keyed draw. */
export function drawUint32(key: RandomKey): number {
  // `assertValidRandomKey`, in its order; the purpose check is memoised with its hash.
  requireUint32(key.seed, "random key.seed");
  assertValidDayIndex(key.day);
  requireUint32(key.entityId, "random key.entityId");
  requireUint32(key.drawIndex, "random key.drawIndex");
  let hash = purposePrefix(key.purpose);
  hash = combine(hash, key.seed);
  hash = combine(hash, key.day);
  hash = combine(hash, key.entityId);
  hash = combine(hash, key.drawIndex);
  return fmix32(hash);
}

/** Return a deterministic value in [0, 1) for one keyed draw. */
export function drawUnitFloat(key: RandomKey): number {
  return drawUint32(key) / UNIT_DENOMINATOR;
}

/** Draw using the world's current seed and next-to-process day. */
export function drawWorldUint32(
  world: World,
  entityId: Id,
  purpose: string,
  drawIndex: number,
): number {
  requireUint32(world.seed, "world.seed");
  assertValidDayIndex(world.dayIndex);
  return drawUint32({
    seed: world.seed,
    day: world.dayIndex,
    entityId,
    purpose,
    drawIndex,
  });
}

/** Draw a [0, 1) value using the world's current seed and next-to-process day. */
export function drawWorldUnitFloat(
  world: World,
  entityId: Id,
  purpose: string,
  drawIndex: number,
): number {
  return drawWorldUint32(world, entityId, purpose, drawIndex) / UNIT_DENOMINATOR;
}

/**
 * Convenience constructor for tests and subsystem code. It validates the key
 * lazily when a draw function is called.
 */
export function makeRandomKey(
  seed: Seed,
  day: Day,
  entityId: Id,
  purpose: string,
  drawIndex: number,
): RandomKey {
  return { seed, day, entityId, purpose, drawIndex };
}
