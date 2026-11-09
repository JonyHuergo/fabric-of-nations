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

  let allocated = 0;
  const remainders: Array<{ index: number; remainder: number; tie: number }> = [];
  for (let index = 0; index < weights.length; index += 1) {
    const weight = weights[index] ?? 0;
    const exact = (total * weight) / totalWeight;
    const whole = Math.floor(exact);
    allocations[index] = whole;
    allocated += whole;
    if (whole < weight) {
      remainders.push({
        index,
        remainder: exact - whole,
        tie: tieKeys[index] ?? 0,
      });
    }
  }

  let leftover = total - allocated;
  remainders.sort(
    (left, right) =>
      right.remainder - left.remainder || left.tie - right.tie || left.index - right.index,
  );
  for (let index = 0; index < leftover; index += 1) {
    const candidate = remainders[index];
    if (candidate === undefined) {
      throw new RangeError("largest-remainder apportionment ran out of capacity");
    }
    allocations[candidate.index] = (allocations[candidate.index] ?? 0) + 1;
  }
  return allocations;
}

