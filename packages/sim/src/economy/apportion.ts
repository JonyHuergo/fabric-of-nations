/**
 * Largest-remainder apportionment (a leaf module: no simulation imports), shared by the
 * M3b and P7 employment allocators and the P7 institution and reclassification steps.
 */

/**
 * Largest-remainder apportionment of `total` integer units across weights.
 * Callers must ensure `total <= sum(weights)`. Equal remainders use the supplied
 * keyed tie keys ascending; the original index is only a final collision fallback.
 */
export function apportionLargestRemainder(
  total: number,
  weights: readonly number[],
  tieKeys: readonly number[],
): number[] {
  return apportionLargestRemainderBy(total, weights, (index) => tieKeys[index] ?? 0);
}

/**
 * D-157: `apportionLargestRemainder` with each tie key read on demand. `tieOf(index)` is
 * called only for the units that compete for a remainder (whole share below the weight),
 * the only keys the ordering reads, so for a pure `tieOf` the result is that of the array
 * form with `tieKeys[index] = tieOf(index)`.
 */
export function apportionLargestRemainderBy(
  total: number,
  weights: readonly number[],
  tieOf: (index: number) => number,
): number[] {
  if (!Number.isInteger(total) || total < 0) {
    throw new RangeError("apportionment total must be a non-negative integer");
  }
  const allocations = new Array<number>(weights.length).fill(0);
  if (total === 0 || weights.length === 0) return allocations;
  let totalWeight = 0;
  for (let index = 0; index < weights.length; index += 1) {
    const weight = weights[index] ?? 0;
    if (!Number.isInteger(weight) || weight < 0) {
      throw new RangeError("apportionment weights must be non-negative integers");
    }
    totalWeight += weight;
  }
  if (totalWeight === 0) return allocations;
  if (total > totalWeight) {
    throw new RangeError("apportionment total cannot exceed the sum of weights");
  }

  // D-158: units are ordered by remainder (descending), then tie key, then index, and the
  // first `leftover` get one more unit. Only the order across the cut matters, so tie keys
  // are read only for the units whose remainder equals the remainder at the cut (a run of
  // equal remainders that is wholly taken or wholly left does not depend on its order).
  // For a pure `tieOf` this is exactly the result of sorting every unit by the full key.
  let allocated = 0;
  const candidates: number[] = [];
  const remainderOf = new Float64Array(weights.length);
  for (let index = 0; index < weights.length; index += 1) {
    const weight = weights[index] ?? 0;
    const exact = (total * weight) / totalWeight;
    const whole = Math.floor(exact);
    allocations[index] = whole;
    allocated += whole;
    if (whole < weight) {
      candidates.push(index);
      remainderOf[index] = exact - whole;
    }
  }

  const leftover = total - allocated;
  if (leftover <= 0) return allocations;
  if (leftover > candidates.length) {
    throw new RangeError("largest-remainder apportionment ran out of capacity");
  }
  // The remainder at the cut: the `leftover`-th largest (a native numeric sort of the
  // remainders, not of the units).
  const sorted = new Float64Array(candidates.length);
  for (let item = 0; item < candidates.length; item += 1) sorted[item] = remainderOf[candidates[item] ?? 0] ?? 0;
  sorted.sort();
  const cut = sorted[candidates.length - leftover] ?? 0;
  // Every unit above the cut is taken; the run at the cut shares what is left.
  const run: number[] = [];
  let taken = 0;
  for (const index of candidates) {
    const remainder = remainderOf[index] ?? 0;
    if (remainder > cut) {
      allocations[index] = (allocations[index] ?? 0) + 1;
      taken += 1;
    } else if (remainder === cut) {
      run.push(index);
    }
  }
  const fromRun = leftover - taken;
  if (fromRun === run.length) {
    for (const index of run) allocations[index] = (allocations[index] ?? 0) + 1;
    return allocations;
  }
  const ties = new Map<number, number>();
  for (const index of run) ties.set(index, tieOf(index));
  run.sort((left, right) => (ties.get(left) ?? 0) - (ties.get(right) ?? 0) || left - right);
  for (let item = 0; item < fromRun; item += 1) {
    const index = run[item] ?? 0;
    allocations[index] = (allocations[index] ?? 0) + 1;
  }
  return allocations;
}

