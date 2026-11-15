/**
 * D-161: reusable typed buffers of the simulated day (scratch).
 *
 * D-160 found that every full collection of the 1900-world ordinary day is started by
 * typed-array (external) memory, and that most of it is the market day's per-market
 * tables (lot tables, demand-row columns, production's reservation tables), allocated
 * zero-filled and dropped within the same call. A `DayScratch` keeps one buffer per
 * named slot and hands out zero-filled (or value-filled) views of exactly the requested
 * length, so the same storage serves every market of a day and every later day.
 *
 * Rules:
 * - The scratch is plain data owned by the caller (the rollback runner holds one; the
 *   integrated day makes one for itself when none is passed). The module holds no state.
 * - It is never authoritative, never serialised, never hashed and never read for values:
 *   every view is filled before it is handed out, so a result cannot depend on what a
 *   slot held before (nor on whether a scratch was passed at all).
 * - A view is valid until the next request of the same slot. Callers use a slot only for
 *   buffers that die before that request (within one market, one production wave, one
 *   mint window); nothing that escapes into a result or into the world is taken from it.
 * - Buffers grow (by at least a quarter) and never shrink.
 *
 * Without a scratch (`undefined`), each request allocates a fresh array, exactly the
 * former behaviour; tests and direct callers of the phases keep that path.
 */

export interface DayScratch {
  readonly f64: Map<string, Float64Array>;
  readonly i32: Map<string, Int32Array>;
  readonly u8: Map<string, Uint8Array>;
  /** Diagnostics: bytes of storage the scratch holds now (never read by the simulation). */
  heldBytes: number;
}

export function createDayScratch(): DayScratch {
  return { f64: new Map(), i32: new Map(), u8: new Map(), heldBytes: 0 };
}

/** A quarter more than the current buffer, at least what is needed (bounded overshoot, few regrowths). */
function grownLength(current: number, needed: number): number {
  return Math.max(needed, Math.ceil(current * 1.25), 64);
}

function requireLength(length: number, slot: string): void {
  if (!Number.isInteger(length) || length < 0) {
    throw new RangeError(`scratch slot ${slot} requested an invalid length ${String(length)}`);
  }
}

/** A `Float64Array` view of `length` elements, every element `fill` (0 by default). */
export function scratchF64(scratch: DayScratch | undefined, slot: string, length: number, fill = 0): Float64Array {
  requireLength(length, slot);
  if (scratch === undefined) {
    const fresh = new Float64Array(length);
    if (fill !== 0) fresh.fill(fill);
    return fresh;
  }
  let buffer = scratch.f64.get(slot);
  if (buffer === undefined || buffer.length < length) {
    scratch.heldBytes -= buffer?.byteLength ?? 0;
    buffer = new Float64Array(grownLength(buffer?.length ?? 0, length));
    scratch.heldBytes += buffer.byteLength;
    scratch.f64.set(slot, buffer);
  }
  const view = buffer.subarray(0, length);
  view.fill(fill);
  return view;
}

/** An `Int32Array` view of `length` elements, every element `fill` (0 by default). */
export function scratchI32(scratch: DayScratch | undefined, slot: string, length: number, fill = 0): Int32Array {
  requireLength(length, slot);
  if (scratch === undefined) {
    const fresh = new Int32Array(length);
    if (fill !== 0) fresh.fill(fill);
    return fresh;
  }
  let buffer = scratch.i32.get(slot);
  if (buffer === undefined || buffer.length < length) {
    scratch.heldBytes -= buffer?.byteLength ?? 0;
    buffer = new Int32Array(grownLength(buffer?.length ?? 0, length));
    scratch.heldBytes += buffer.byteLength;
    scratch.i32.set(slot, buffer);
  }
  const view = buffer.subarray(0, length);
  view.fill(fill);
  return view;
}

/** A `Uint8Array` view of `length` elements, every element `fill` (0 by default). */
export function scratchU8(scratch: DayScratch | undefined, slot: string, length: number, fill = 0): Uint8Array {
  requireLength(length, slot);
  if (scratch === undefined) {
    const fresh = new Uint8Array(length);
    if (fill !== 0) fresh.fill(fill);
    return fresh;
  }
  let buffer = scratch.u8.get(slot);
  if (buffer === undefined || buffer.length < length) {
    scratch.heldBytes -= buffer?.byteLength ?? 0;
    buffer = new Uint8Array(grownLength(buffer?.length ?? 0, length));
    scratch.heldBytes += buffer.byteLength;
    scratch.u8.set(slot, buffer);
  }
  const view = buffer.subarray(0, length);
  view.fill(fill);
  return view;
}

/** A `Float64Array` view holding a copy of `source` (the former `source.slice()`). */
export function scratchCopyF64(scratch: DayScratch | undefined, slot: string, source: Float64Array): Float64Array {
  if (scratch === undefined) return source.slice();
  let buffer = scratch.f64.get(slot);
  if (buffer === undefined || buffer.length < source.length) {
    scratch.heldBytes -= buffer?.byteLength ?? 0;
    buffer = new Float64Array(grownLength(buffer?.length ?? 0, source.length));
    scratch.heldBytes += buffer.byteLength;
    scratch.f64.set(slot, buffer);
  }
  const view = buffer.subarray(0, source.length);
  view.set(source);
  return view;
}

/** A `Uint8Array` view holding a copy of `source`. */
export function scratchCopyU8(scratch: DayScratch | undefined, slot: string, source: Uint8Array): Uint8Array {
  if (scratch === undefined) return source.slice();
  let buffer = scratch.u8.get(slot);
  if (buffer === undefined || buffer.length < source.length) {
    scratch.heldBytes -= buffer?.byteLength ?? 0;
    buffer = new Uint8Array(grownLength(buffer?.length ?? 0, source.length));
    scratch.heldBytes += buffer.byteLength;
    scratch.u8.set(slot, buffer);
  }
  const view = buffer.subarray(0, source.length);
  view.set(source);
  return view;
}
