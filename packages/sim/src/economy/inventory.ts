/** Inventory helpers. `stockLots` is authoritative; aggregate stock is derived. */

import { requireInteger } from "../validation.js";
import type { Market, StockLot } from "./types.js";

/** Derive aggregate physical stock by good id from the authoritative lots. */
export function deriveStockByGood(market: Market, goodCount?: number): number[] {
  const count = goodCount ?? market.priceSUSD.length;
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
