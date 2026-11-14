/**
 * D-159: a market's stock lots as a typed list, the authoritative inventory.
 *
 * A market held its lots as an array of `{ goodId, ownerBuildingId, quantity }` objects,
 * which every phase that changes stock rebuilt (production waves, market close, overflow,
 * trade, the mint) and the checkpoint copied object by object. The list keeps the same
 * three fields as typed columns, entry `i` being one lot, in canonical order: ascending
 * good, then ascending owner building, with at most one lot per (good, owner) (the order
 * every phase already stored and `canonicalizeStockLots` produced; `assertValidLotList`
 * checks it). Columns may be longer than `count` (capacity); entries at and after `count`
 * are not lots. The list is plain data, cloned by copying its arrays and encoded as the
 * same lot records as before (`encodeWorld`, hashes).
 */

import type { Id } from "../types.js";
import type { StockLot } from "./types.js";

export interface LotList {
  /** Number of lots; entries `0..count-1`. */
  count: number;
  good: Float64Array;
  owner: Float64Array;
  /** Physical units. */
  quantity: Float64Array;
}

export function createLotList(capacity = 0): LotList {
  const size = Math.max(0, Math.floor(capacity));
  return { count: 0, good: new Float64Array(size), owner: new Float64Array(size), quantity: new Float64Array(size) };
}

/** Capacity of the list (lots it holds without growing). */
export function lotListCapacity(list: LotList): number {
  return list.good.length;
}

function grow(list: LotList, needed: number): void {
  const capacity = lotListCapacity(list);
  if (needed <= capacity) return;
  const size = Math.max(needed, 16, capacity * 2);
  const good = new Float64Array(size);
  good.set(list.good);
  list.good = good;
  const owner = new Float64Array(size);
  owner.set(list.owner);
  list.owner = owner;
  const quantity = new Float64Array(size);
  quantity.set(list.quantity);
  list.quantity = quantity;
}

/**
 * Append a lot at the end. The caller keeps canonical order (lots appended in ascending
 * good, then owner); `assertValidLotList` checks it.
 */
export function appendLot(list: LotList, goodId: Id, ownerBuildingId: Id, quantity: number): void {
  const index = list.count;
  grow(list, index + 1);
  list.good[index] = goodId;
  list.owner[index] = ownerBuildingId;
  list.quantity[index] = quantity;
  list.count = index + 1;
}

/** A list of `lots` in canonical order (a stable sort; duplicates are kept for validation to reject). */
export function lotListFromLots(lots: readonly StockLot[]): LotList {
  const order = Array.from({ length: lots.length }, (_, index) => index);
  order.sort((left, right) => {
    const a = lots[left] as StockLot;
    const b = lots[right] as StockLot;
    return a.goodId - b.goodId || a.ownerBuildingId - b.ownerBuildingId || left - right;
  });
  const list = createLotList(lots.length);
  for (const index of order) {
    const lot = lots[index] as StockLot;
    appendLot(list, lot.goodId, lot.ownerBuildingId, lot.quantity);
  }
  return list;
}

/** The list's lots as records, in order (cold paths, tests and diagnostics). */
export function lotRecords(list: LotList): StockLot[] {
  const lots: StockLot[] = new Array<StockLot>(list.count);
  for (let index = 0; index < list.count; index += 1) {
    lots[index] = { goodId: list.good[index] ?? 0, ownerBuildingId: list.owner[index] ?? 0, quantity: list.quantity[index] ?? 0 };
  }
  return lots;
}

/** A copy of the list (trimmed to its count). */
export function cloneLotList(list: LotList): LotList {
  return {
    count: list.count,
    good: list.good.slice(0, list.count),
    owner: list.owner.slice(0, list.count),
    quantity: list.quantity.slice(0, list.count),
  };
}

/** Keep the lots for which `keep(index)` is true, in order. Returns the number removed. */
export function filterLots(list: LotList, keep: (index: number) => boolean): number {
  let write = 0;
  for (let read = 0; read < list.count; read += 1) {
    if (!keep(read)) continue;
    if (write !== read) {
      list.good[write] = list.good[read] ?? 0;
      list.owner[write] = list.owner[read] ?? 0;
      list.quantity[write] = list.quantity[read] ?? 0;
    }
    write += 1;
  }
  const removed = list.count - write;
  list.count = write;
  return removed;
}

/** Index of the first lot of `goodId` (or of the first later good); the list's count if none. */
export function firstLotOfGood(list: LotList, goodId: number): number {
  let low = 0;
  let high = list.count;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if ((list.good[middle] ?? 0) < goodId) low = middle + 1;
    else high = middle;
  }
  return low;
}

/** True for a value shaped like a lot list (validation boundary). */
export function isLotList(value: unknown): value is LotList {
  if (typeof value !== "object" || value === null) return false;
  const list = value as Partial<LotList>;
  return (
    typeof list.count === "number" &&
    list.good instanceof Float64Array &&
    list.owner instanceof Float64Array &&
    list.quantity instanceof Float64Array
  );
}
