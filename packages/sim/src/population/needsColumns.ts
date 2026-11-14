/**
 * D-158: the day's needs result in typed columns.
 *
 * The integrated day built one result object per block with one summary object per tier
 * (20,739 blocks × 4 tiers every day) only for the next three steps to read a few numbers
 * back. The same numbers are now kept in columns by block (in the order the day lists the
 * blocks, ascending id) and by tier (`NEED_TIER_ORDER` position); the objects are built in
 * full detail only, from the same values. `needsReader` gives the consumers one access path
 * for both forms.
 */

import { NEED_TIER_ORDER, type NeedTier } from "./constants.js";
import type { PopBlockNeedsResult, PopulationNeedsDayResult } from "./types.js";

export const NEED_TIER_COUNT = NEED_TIER_ORDER.length;

export interface NeedsColumns {
  /** Block id of each row. */
  readonly blockId: Float64Array;
  readonly population: Float64Array;
  readonly kcalConsumed: Float64Array;
  /** Per `[row * NEED_TIER_COUNT + tier]`: 1 when the tier is active / fully met. */
  readonly active: Uint8Array;
  readonly fullyMet: Uint8Array;
  readonly desiredCostRUSD: Float64Array;
  readonly fundedCostRUSD: Float64Array;
  readonly spentRUSD: Float64Array;
}

export function createNeedsColumns(rows: number): NeedsColumns {
  return {
    blockId: new Float64Array(rows),
    population: new Float64Array(rows),
    kcalConsumed: new Float64Array(rows),
    active: new Uint8Array(rows * NEED_TIER_COUNT),
    fullyMet: new Uint8Array(rows * NEED_TIER_COUNT),
    desiredCostRUSD: new Float64Array(rows * NEED_TIER_COUNT),
    fundedCostRUSD: new Float64Array(rows * NEED_TIER_COUNT),
    spentRUSD: new Float64Array(rows * NEED_TIER_COUNT),
  };
}

export function needTierIndex(tier: NeedTier): number {
  return NEED_TIER_ORDER.indexOf(tier);
}

/** One block's tier summary as read by the consumers (no object is built for the columns). */
export interface NeedsReader {
  /** Whether a result exists for the block at this world position. */
  has(position: number): boolean;
  population(position: number): number;
  kcalConsumed(position: number): number;
  active(position: number, tier: NeedTier): boolean;
  fullyMet(position: number, tier: NeedTier): boolean;
  spentRUSD(position: number, tier: NeedTier): number;
  desiredCostRUSD(position: number, tier: NeedTier): number;
  /** Whether the tier has a summary at all (the object form may omit it). */
  hasTier(position: number, tier: NeedTier): boolean;
}

/**
 * The needs of each block of `blocks` by position, from the columns when the result has
 * them, otherwise from the result objects (matched by position when aligned, else by id).
 */
export function needsReader(
  blocks: readonly { readonly id: number }[],
  needs: PopulationNeedsDayResult,
): NeedsReader {
  const columns = needs.columns;
  if (columns !== undefined) {
    let aligned = columns.blockId.length === blocks.length;
    for (let index = 0; aligned && index < blocks.length; index += 1) {
      if (columns.blockId[index] !== blocks[index]?.id) aligned = false;
    }
    let rowOf: (position: number) => number;
    if (aligned) {
      rowOf = (position) => position;
    } else {
      const byId = new Map<number, number>();
      for (let row = 0; row < columns.blockId.length; row += 1) byId.set(columns.blockId[row] ?? -1, row);
      rowOf = (position) => byId.get(blocks[position]?.id ?? -1) ?? -1;
    }
    const cell = (position: number, tier: NeedTier): number => {
      const row = rowOf(position);
      return row < 0 ? -1 : row * NEED_TIER_COUNT + needTierIndex(tier);
    };
    return {
      has: (position) => rowOf(position) >= 0,
      population: (position) => columns.population[rowOf(position)] ?? 0,
      kcalConsumed: (position) => columns.kcalConsumed[rowOf(position)] ?? 0,
      active: (position, tier) => columns.active[cell(position, tier)] === 1,
      fullyMet: (position, tier) => columns.fullyMet[cell(position, tier)] === 1,
      spentRUSD: (position, tier) => columns.spentRUSD[cell(position, tier)] ?? 0,
      desiredCostRUSD: (position, tier) => columns.desiredCostRUSD[cell(position, tier)] ?? 0,
      hasTier: (position) => rowOf(position) >= 0,
    };
  }
  const results = needs.blocks;
  let aligned = results.length === blocks.length;
  for (let index = 0; aligned && index < blocks.length; index += 1) {
    if (results[index]?.popBlockId !== blocks[index]?.id) aligned = false;
  }
  let resultAt: (position: number) => PopBlockNeedsResult | undefined;
  if (aligned) {
    resultAt = (position) => results[position];
  } else {
    const byId = new Map<number, PopBlockNeedsResult>();
    for (const result of results) byId.set(result.popBlockId, result);
    resultAt = (position) => byId.get(blocks[position]?.id ?? -1);
  }
  const summary = (position: number, tier: NeedTier) =>
    resultAt(position)?.tierSummaries.find((entry) => entry.tier === tier);
  return {
    has: (position) => resultAt(position) !== undefined,
    population: (position) => resultAt(position)?.population ?? 0,
    kcalConsumed: (position) => resultAt(position)?.kcalConsumed ?? 0,
    active: (position, tier) => summary(position, tier)?.active === true,
    fullyMet: (position, tier) => summary(position, tier)?.fullyMet === true,
    spentRUSD: (position, tier) => summary(position, tier)?.spentRUSD ?? 0,
    desiredCostRUSD: (position, tier) => summary(position, tier)?.desiredCostRUSD ?? 0,
    hasTier: (position, tier) => summary(position, tier) !== undefined,
  };
}
