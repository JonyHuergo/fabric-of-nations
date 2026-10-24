/**
 * Deterministic largest-remainder band selection for death allocation.
 *
 * This module contains only the "leftover" selection stage. Expected deaths,
 * band aggregation, and within-band placement remain in `allocateDeaths`.
 *
 * Original behavior preserved here:
 * - Candidates are band/sex cells whose remainder is non-negative and whose
 *   current allocation is below its population capacity.
 * - Candidates are ranked by remainder descending. Equal remainders are broken
 *   by the lower band index, matching the original ascending scan with a strict
 *   `remainder > best` comparison.
 * - A selected candidate receives exactly one additional death and is removed
 *   from consideration by setting its remainder to -1. Therefore each candidate
 *   can receive at most one extra death in a single call, exactly as before.
 * - If there are fewer eligible candidates than leftover deaths, the original
 *   algorithm selects every eligible candidate and then throws; this
 *   implementation does the same, with the same error message.
 */

import type { Id } from "../types.js";

/** True when `left` ranks ahead of `right` for largest-remainder selection. */
function hasHigherPriority(
  leftBand: number,
  rightBand: number,
  remainders: Float64Array,
): boolean {
  const leftRemainder = remainders[leftBand] ?? -1;
  const rightRemainder = remainders[rightBand] ?? -1;
  if (leftRemainder !== rightRemainder) return leftRemainder > rightRemainder;
  return leftBand < rightBand;
}

/** Restore the max-heap invariant below `root`. */
function siftDown(
  heap: Uint8Array,
  heapSize: number,
  root: number,
  remainders: Float64Array,
): void {
  let current = root;
  for (;;) {
    const left = current * 2 + 1;
    if (left >= heapSize) return;
    let best = left;
    const right = left + 1;
    if (right < heapSize) {
      const rightBand = heap[right] ?? 0;
      const leftBand = heap[left] ?? 0;
      if (hasHigherPriority(rightBand, leftBand, remainders)) best = right;
    }
    const bestBand = heap[best] ?? 0;
    const currentBand = heap[current] ?? 0;
    if (!hasHigherPriority(bestBand, currentBand, remainders)) return;
    heap[current] = bestBand;
    heap[best] = currentBand;
    current = best;
  }
}

/**
 * Apply `leftover` additional deaths to the band/sex allocation.
 *
 * Mutates `bandAllocation` and `bandRemainders`, and uses `bandOrder` as
 * fixed-size scratch storage. `bandOrder` must have at least `bandCount`
 * elements; `bandCount` is 34 for the 17 five-year bands times two sexes.
 */
export function selectDeathBands(
  totalDeaths: number,
  leftover: number,
  popBlockId: Id,
  bandCount: number,
  bandAllocation: Uint32Array,
  bandCounts: Uint32Array,
  bandRemainders: Float64Array,
  bandOrder: Uint8Array,
): void {
  let candidateCount = 0;
  for (let band = 0; band < bandCount; band += 1) {
    const remainder = bandRemainders[band] ?? -1;
    if (!(remainder >= 0)) continue;
    const capacity = bandCounts[band] ?? 0;
    if ((bandAllocation[band] ?? 0) >= capacity) continue;
    bandOrder[candidateCount] = band;
    candidateCount += 1;
  }

  if (leftover <= 0) return;

  // Build a max-heap over the eligible bands. This replaces the original
  // selection-by-rescanning loop; extraction order is identical.
  for (let root = Math.floor(candidateCount / 2) - 1; root >= 0; root -= 1) {
    siftDown(bandOrder, candidateCount, root, bandRemainders);
  }

  let heapSize = candidateCount;
  for (let selectedCount = 0; selectedCount < leftover; selectedCount += 1) {
    const selectedBand = heapSize > 0 ? (bandOrder[0] ?? -1) : -1;
    if (selectedBand < 0) {
      throw new RangeError(
        `cannot allocate ${String(totalDeaths)} deaths within age-sex populations for popBlock ${String(popBlockId)}`,
      );
    }
    bandAllocation[selectedBand] = (bandAllocation[selectedBand] ?? 0) + 1;
    bandRemainders[selectedBand] = -1;
    heapSize -= 1;
    if (heapSize > 0) {
      bandOrder[0] = bandOrder[heapSize] ?? 0;
      siftDown(bandOrder, heapSize, 0, bandRemainders);
    }
  }
}
