/**
 * Inventory helpers. `stockLots` (a `LotList`, D-159) is authoritative; aggregate stock is
 * derived.
 */

import { requireInteger } from "../validation.js";
import { scratchCopyF64, scratchCopyU8, scratchF64, scratchU8, type DayScratch } from "./dayScratch.js";
import { appendLot, createLotList, type LotList } from "./lotList.js";
import type { Market, StockLot } from "./types.js";

/** Derive aggregate physical stock by good id from the authoritative lots. */
export function deriveStockByGood(market: Market, goodCount?: number): number[] {
  const count = goodCount ?? market.priceRUSD.length;
  requireInteger(count, "goodCount", 0, 1_000_000);
  const stock = new Array<number>(count).fill(0);
  const lots = market.stockLots;
  for (let index = 0; index < lots.count; index += 1) {
    const goodId = lots.good[index] ?? 0;
    if (goodId < 0 || goodId >= count) {
      throw new RangeError(`stock lot references good ${String(goodId)} outside 0..${String(count - 1)}`);
    }
    stock[goodId] = (stock[goodId] ?? 0) + (lots.quantity[index] ?? 0);
  }
  return stock;
}

/**
 * A market's lots for one day as a dense `(good, owner)` table (D-139). It replaces
 * the per-phase lot maps keyed by `"good:owner"` strings: `present` is map membership
 * and `quantity` the mapped value. Owners are kept in ascending id order, so walking
 * one good's slots visits its lots in ascending owner order, and walking goods then
 * slots yields the canonical `(goodId, ownerBuildingId)` order.
 */
export interface LotTable {
  readonly goodCount: number;
  /** Owner building id of each slot, ascending. */
  readonly owners: readonly number[];
  readonly slotOf: ReadonlyMap<number, number>;
  /** `[goodId * owners.length + slot]`. */
  readonly quantity: Float64Array;
  readonly present: Uint8Array;
}

/**
 * Build a lot table holding `lots` (a later duplicate replaces an earlier one, as a
 * map would), with slots for `owners` and for every lot owner. D-161: with a scratch,
 * the cells are views of its slot `slot` (valid until that slot is requested again).
 */
export function lotTableFromLots(
  lots: LotList,
  owners: Iterable<number>,
  goodCount: number,
  scratch?: DayScratch,
  slot = "lots",
): LotTable {
  const ownerSet = new Set<number>(owners);
  for (let index = 0; index < lots.count; index += 1) ownerSet.add(lots.owner[index] ?? 0);
  const sorted = [...ownerSet].sort((left, right) => left - right);
  const slotOf = new Map<number, number>();
  for (let slot = 0; slot < sorted.length; slot += 1) slotOf.set(sorted[slot] ?? 0, slot);
  const size = goodCount * sorted.length;
  const table: LotTable = {
    goodCount,
    owners: sorted,
    slotOf,
    quantity: scratchF64(scratch, `${slot}.quantity`, size),
    present: scratchU8(scratch, `${slot}.present`, size),
  };
  for (let index = 0; index < lots.count; index += 1) {
    const goodId = lots.good[index] ?? Number.NaN;
    if (!Number.isInteger(goodId) || goodId < 0 || goodId >= goodCount) {
      throw new RangeError(`stock lot references good ${String(goodId)} outside 0..${String(goodCount - 1)}`);
    }
    const cell = goodId * sorted.length + (slotOf.get(lots.owner[index] ?? 0) ?? 0);
    table.quantity[cell] = lots.quantity[index] ?? 0;
    table.present[cell] = 1;
  }
  return table;
}

/**
 * An independent copy of a lot table (same slots). D-161: with a scratch, the cells are
 * views of its slot `slot`.
 */
export function copyLotTable(table: LotTable, scratch?: DayScratch, slot = "lots.copy"): LotTable {
  return {
    goodCount: table.goodCount,
    owners: table.owners,
    slotOf: table.slotOf,
    quantity: scratch === undefined ? Float64Array.from(table.quantity) : scratchCopyF64(scratch, `${slot}.quantity`, table.quantity),
    present: scratch === undefined ? Uint8Array.from(table.present) : scratchCopyU8(scratch, `${slot}.present`, table.present),
  };
}

/** D-161: an empty lot table with the slots of `like` (cells from the scratch slot `slot`). */
export function emptyLotTableLike(like: LotTable, scratch: DayScratch | undefined, slot: string): LotTable {
  const size = like.goodCount * like.owners.length;
  return {
    goodCount: like.goodCount,
    owners: like.owners,
    slotOf: like.slotOf,
    quantity: scratchF64(scratch, `${slot}.quantity`, size),
    present: scratchU8(scratch, `${slot}.present`, size),
  };
}

/** The present lots in canonical `(goodId, ownerBuildingId)` order. */
export function lotTableToLots(table: LotTable): LotList {
  const ownerCount = table.owners.length;
  let count = 0;
  for (let cell = 0; cell < table.present.length; cell += 1) if (table.present[cell] === 1) count += 1;
  const lots = createLotList(count);
  for (let goodId = 0; goodId < table.goodCount; goodId += 1) {
    const base = goodId * ownerCount;
    for (let slot = 0; slot < ownerCount; slot += 1) {
      if (table.present[base + slot] === 1) appendLot(lots, goodId, table.owners[slot] ?? 0, table.quantity[base + slot] ?? 0);
    }
  }
  return lots;
}

/** Return lots in canonical `(goodId, ownerBuildingId)` order. */
export function canonicalizeStockLots(lots: readonly StockLot[]): StockLot[] {
  return [...lots]
    .map((lot) => ({ ...lot }))
    .sort((left, right) =>
      left.goodId !== right.goodId
        ? left.goodId - right.goodId
        : left.ownerBuildingId - right.ownerBuildingId,
    );
}
