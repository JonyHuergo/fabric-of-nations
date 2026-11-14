/**
 * D-158: the largest-remainder apportionment reads tie keys only at the cut and finds the
 * cut by a numeric sort. It must give exactly the allocation of the full ordering
 * (remainder descending, tie key ascending, index ascending) that it replaced.
 */

import {
  apportionLargestRemainder,
  apportionLargestRemainderBy,
} from "../../../sim/src/economy/apportion.js";

/** The former implementation: every unit sorted by the full key. */
function reference(total: number, weights: readonly number[], tieKeys: readonly number[]): number[] {
  const allocations = new Array<number>(weights.length).fill(0);
  if (total === 0 || weights.length === 0) return allocations;
  let totalWeight = 0;
  for (const weight of weights) totalWeight += weight;
  if (totalWeight === 0) return allocations;
  let allocated = 0;
  const remainders: { index: number; remainder: number; tie: number }[] = [];
  weights.forEach((weight, index) => {
    const exact = (total * weight) / totalWeight;
    const whole = Math.floor(exact);
    allocations[index] = whole;
    allocated += whole;
    if (whole < weight) remainders.push({ index, remainder: exact - whole, tie: tieKeys[index] ?? 0 });
  });
  remainders.sort((left, right) => right.remainder - left.remainder || left.tie - right.tie || left.index - right.index);
  for (let item = 0; item < total - allocated; item += 1) {
    const candidate = remainders[item] as { index: number };
    allocations[candidate.index] = (allocations[candidate.index] ?? 0) + 1;
  }
  return allocations;
}

/** A small deterministic generator for the cases (tests only; not simulation randomness). */
function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state;
  };
}

describe("D-158 largest-remainder apportionment", () => {
  test("equals the full ordering on 20,000 cases, ties included", () => {
    const next = lcg(20_261_114);
    for (let trial = 0; trial < 20_000; trial += 1) {
      const length = 1 + (next() % 60);
      // Small weights and repeated values make equal remainders common.
      const spread = trial % 3 === 0 ? 3 : trial % 3 === 1 ? 20 : 5_000;
      const weights = Array.from({ length }, () => next() % spread);
      const sum = weights.reduce((total, value) => total + value, 0);
      const total = sum === 0 ? 0 : next() % (sum + 1);
      const ties = Array.from({ length }, () => (trial % 5 === 0 ? next() % 4 : next()));
      const expected = reference(total, weights, ties);
      expect(apportionLargestRemainder(total, weights, ties)).toEqual(expected);
      const asked: number[] = [];
      const lazy = apportionLargestRemainderBy(total, weights, (index) => {
        asked.push(index);
        return ties[index] ?? 0;
      });
      expect(lazy).toEqual(expected);
      expect(lazy.reduce((total, value) => total + value, 0)).toBe(total);
      // Tie keys are read only for units with a remainder.
      for (const index of asked) expect((weights[index] ?? 0) > 0).toBe(true);
    }
  });

  test("keeps the input checks", () => {
    expect(() => apportionLargestRemainder(5, [1, 1], [0, 0])).toThrow(/cannot exceed/);
    expect(() => apportionLargestRemainder(1.5, [1, 1], [0, 0])).toThrow(/non-negative integer/);
    expect(() => apportionLargestRemainder(1, [1.5, 1], [0, 0])).toThrow(/non-negative integers/);
    expect(apportionLargestRemainder(0, [3, 4], [0, 0])).toEqual([0, 0]);
  });
});
