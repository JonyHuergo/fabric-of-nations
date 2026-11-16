/**
 * D-165: one rule for what is left of a stock lot after a quantity is taken from it.
 *
 * Quantities taken from lots are proportional splits of reservations and differences of
 * cumulative interval ends (market allocation, D-136), so a lot that is taken whole is
 * left with a rounding residue whose size scales with the largest quantity in that
 * arithmetic: the lot, the amount taken, and the good's total in the pass (`scale`). Before
 * D-165 each site decided on its own (the allocator by this tolerance, the Pass-B and final
 * market lots by `> 0`, the mint by an absolute 1e-9, construction by the money tolerance,
 * trade dispatch not at all), so a lot one step had sold out could
 * survive the next as dust (3.5e-10 kg of food products on 22 February 1900), be sold for
 * 6e-13 RUSD and pass sub-ulp wages on, which the day-53 fiscal failure grew from.
 *
 * Inputs: `quantity` the lot before (physical units, ≥ 0), `taken` the amount taken
 * (same units), `scale` the largest other quantity summed in the same pass (same units,
 * ≥ 0). Output: the remainder, or exactly 0 when something was taken (`taken > 0`) and
 * the remainder is within the tolerance `QUANTITY_TOLERANCE × max(1, |quantity|, |taken|,
 * |scale|)`; a negative remainder within the tolerance is also 0. A lot nothing was taken
 * from has no rounding residue and is returned unchanged, however small. A remainder below
 * −tolerance is an over-take: the caller must reject it before calling (each site keeps its
 * own error). Cadence: every lot reduction.
 * A caller that keeps an inventory identity records the dropped residue (at most the
 * tolerance) as loss, as D-143 §5 does for overflow dust. Inside production no lot is
 * dropped: between its two waves a small remainder may still be reserved for the second, so
 * the market applies the rule to its final lots, after every take of the day.
 */

import { QUANTITY_TOLERANCE } from "../population/constants.js";

/** The tolerance of the lot arithmetic (units of the good). */
export function lotTolerance(quantity: number, taken: number, scale = 0): number {
  return QUANTITY_TOLERANCE * Math.max(1, Math.abs(quantity), Math.abs(taken), Math.abs(scale));
}

/** What is left of a lot of `quantity` after `taken`: exactly 0 within the lot tolerance. */
export function lotRemainder(quantity: number, taken: number, scale = 0): number {
  if (!(taken > 0)) return quantity;
  return settledRemainder(quantity - taken, quantity, taken, scale);
}

/**
 * The same rule for a remainder computed elsewhere (the market's final lots, whose takes
 * are spread over production's input uses and the households' passes): `remainder` is what
 * is left, `quantity` the lot before every take of the pass, `taken` their total.
 */
export function settledRemainder(remainder: number, quantity: number, taken: number, scale = 0): number {
  if (!(taken > 0)) return remainder;
  return remainder > lotTolerance(quantity, taken, scale) ? remainder : 0;
}
