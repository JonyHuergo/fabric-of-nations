/** Inventory helpers. `stockLots` is authoritative; aggregate stock is derived. */

import { requireInteger } from "../validation.js";
import type { Market, StockLot } from "./types.js";

/** Derive aggregate physical stock by good id from the authoritative lots. */
export function deriveStockByGood(market: Market, goodCount?: number): number[] {
  const count = goodCount ?? market.priceRUSD.length;
  requireInteger(count, "goodCount", 0, 1_000_000);
  const stock = new Array<number>(count).fill(0);
  for (const lot of market.stockLots) {
    if (lot.goodId < 0 || lot.goodId >= count) {
      throw new RangeError(
        `stock lot references good ${String(lot.goodId)} outside 0..${String(count - 1)}`,
      );
    }
    stock[lot.goodId] = (stock[lot.goodId] ?? 0) + lot.quantity;
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
 * map would), with slots for `owners` and for every lot owner.
 */
export function lotTableFromLots(
  lots: readonly StockLot[],
  owners: Iterable<number>,
  goodCount: number,
): LotTable {
  const ownerSet = new Set<number>(owners);
  for (const lot of lots) ownerSet.add(lot.ownerBuildingId);
  const sorted = [...ownerSet].sort((left, right) => left - right);
  const slotOf = new Map<number, number>();
  for (let slot = 0; slot < sorted.length; slot += 1) slotOf.set(sorted[slot] ?? 0, slot);
  const size = goodCount * sorted.length;
  const table: LotTable = {
    goodCount,
    owners: sorted,
    slotOf,
    quantity: new Float64Array(size),
    present: new Uint8Array(size),
  };
  for (const lot of lots) {
    if (!Number.isInteger(lot.goodId) || lot.goodId < 0 || lot.goodId >= goodCount) {
      throw new RangeError(
        `stock lot references good ${String(lot.goodId)} outside 0..${String(goodCount - 1)}`,
      );
    }
    const cell = lot.goodId * sorted.length + (slotOf.get(lot.ownerBuildingId) ?? 0);
    table.quantity[cell] = lot.quantity;
    table.present[cell] = 1;
  }
  return table;
}

/** An independent copy of a lot table (same slots). */
export function copyLotTable(table: LotTable): LotTable {
  return {
    goodCount: table.goodCount,
    owners: table.owners,
    slotOf: table.slotOf,
    quantity: Float64Array.from(table.quantity),
    present: Uint8Array.from(table.present),
  };
}

/** The present lots in canonical `(goodId, ownerBuildingId)` order. */
export function lotTableToLots(table: LotTable): StockLot[] {
  const lots: StockLot[] = [];
  const ownerCount = table.owners.length;
  for (let goodId = 0; goodId < table.goodCount; goodId += 1) {
    const base = goodId * ownerCount;
    for (let slot = 0; slot < ownerCount; slot += 1) {
      if (table.present[base + slot] === 1) {
        lots.push({ goodId, ownerBuildingId: table.owners[slot] ?? 0, quantity: table.quantity[base + slot] ?? 0 });
      }
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
