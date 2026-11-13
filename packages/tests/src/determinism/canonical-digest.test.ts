/**
 * D-155: the world digest hashes the canonical text as it is produced. It must equal the
 * two-lane FNV-1a of `stableStringify` exactly, for every value the canonical encoder
 * accepts, and reject what it rejects with the same error.
 */
import { createEconomyWorld, encodeWorld, hashWorld } from "@century/sim";

import { checksumOfJson, dualFnv1a32Hex, dualFnv1a32HexOfCanonical, fnv1a32Hex, stableStringify } from "../../../sim/src/hash.js";
import { m5Scenario } from "../fixtures/m5.js";

const twoStep = (value: unknown): string => dualFnv1a32Hex(stableStringify(value));

describe("D-155 streaming canonical digest", () => {
  test("equals the digest of the canonical text on scalars, arrays and nested records", () => {
    const values: unknown[] = [
      null,
      true,
      false,
      0,
      -0,
      1.5e-7,
      -123456789.25,
      "",
      "quote \" backslash \\ newline \n unicode é ✓",
      [],
      [1, 2, 3, -0, 0.1],
      [1, "a", null, [2, [3, { b: 1, a: 2 }]]],
      {},
      { z: 1, a: [1, 2], m: { y: "x", b: [] }, "": 0 },
      Object.assign(Object.create(null) as object, { k: 1, j: [true] }),
    ];
    for (const value of values) {
      expect(dualFnv1a32HexOfCanonical(value)).toBe(twoStep(value));
      // The save checksum is the single-lane FNV-1a of the same canonical text.
      expect(checksumOfJson(value)).toBe(`fnv1a32:${fnv1a32Hex(stableStringify(value))}`);
    }
  });

  test("rejects what the canonical encoder rejects, with the same error", () => {
    const sparse: unknown[] = [];
    sparse[2] = 1;
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, [1, Number.NaN], { a: undefined }, sparse, new Map([[1, 2]]), () => 1]) {
      let expected: unknown = null;
      try {
        twoStep(value);
      } catch (error) {
        expected = (error as Error).message;
      }
      expect(expected).not.toBeNull();
      expect(() => dualFnv1a32HexOfCanonical(value)).toThrow(String(expected));
    }
  });

  test("the world digest is the digest of the encoded world's canonical text", () => {
    const world = createEconomyWorld(m5Scenario(), { seed: 20_261_023 });
    expect(hashWorld(world)).toBe(twoStep(encodeWorld(world)));
  });
});
