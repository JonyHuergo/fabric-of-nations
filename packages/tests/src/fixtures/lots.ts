/** D-159: test helpers for markets' lot lists. */
import { lotRecords, type Market, type StockLot } from "@century/sim";

/** A market's lots as records (none for a missing market). */
export function marketLots(market: Market | undefined): StockLot[] {
  return market === undefined ? [] : lotRecords(market.stockLots);
}
