import {
  createInitialWorld,
  drawUint32,
  drawUnitFloat,
  drawWorldUint32,
  drawWorldUnitFloat,
  makeRandomKey,
  runTicks,
  type RandomKey,
} from "@century/sim";

function key(overrides: Partial<RandomKey> = {}): RandomKey {
  return {
    seed: 1,
    day: 0,
    entityId: 1,
    purpose: "test.kat",
    drawIndex: 0,
    ...overrides,
  };
}

describe("keyed deterministic randomness", () => {
  /**
   * Known-answer vectors from the documented algorithm: two FNV-1a-32 purpose
   * lanes plus purpose length, boost-style combine in
   * purpose-high/length/seed/day/entity/draw order, then MurmurHash3 fmix32.
   * These values were independently reproduced with a separate Python
   * implementation of the same specification.
   */
  test.each([
    {
      name: "zero key",
      input: { seed: 0, day: 0, entityId: 0, purpose: "test.zero", drawIndex: 0 },
      uint32: 1_676_094_509,
      unit: 0.3902461633551866,
    },
    {
      name: "seed and entity",
      input: { seed: 123_456_789, day: 0, entityId: 42, purpose: "test.kat", drawIndex: 0 },
      uint32: 646_304_044,
      unit: 0.15047938656061888,
    },
    {
      name: "draw index 1",
      input: { seed: 123_456_789, day: 0, entityId: 42, purpose: "test.kat", drawIndex: 1 },
      uint32: 1_590_439_617,
      unit: 0.3703030797187239,
    },
    {
      name: "last campaign day and max entity",
      input: {
        seed: 123_456_789,
        day: 36_523,
        entityId: 4_294_967_295,
        purpose: "demographics.births",
        drawIndex: 7,
      },
      uint32: 4_032_339_589,
      unit: 0.9388522219378501,
    },
    {
      name: "max seed and high draw index",
      input: {
        seed: 4_294_967_295,
        day: 12_345,
        entityId: 7,
        purpose: "ai.plan",
        drawIndex: 99,
      },
      uint32: 1_017_635_033,
      unit: 0.23693661973811686,
    },
  ])("matches documented vector: $name", ({ input, uint32, unit }) => {
    expect(drawUint32(input)).toBe(uint32);
    expect(drawUnitFloat(input)).toBe(unit);
  });

  test("is repeatable for identical keys", () => {
    const input = key({ seed: 99, day: 123, entityId: 7, drawIndex: 3 });
    const first = drawUint32(input);
    for (let index = 0; index < 1_000; index += 1) {
      expect(drawUint32(input)).toBe(first);
      expect(drawUnitFloat(input)).toBe(first / 4_294_967_296);
    }
  });

  test("unrelated draws do not shift an existing key", () => {
    const target = key({ seed: 5, day: 6, entityId: 7, purpose: "test.target", drawIndex: 0 });
    const before = drawUint32(target);

    for (let index = 0; index < 5_000; index += 1) {
      drawUint32(key({ entityId: index + 1, drawIndex: index, purpose: "test.noise" }));
    }

    expect(drawUint32(target)).toBe(before);
  });

  test("separates two valid purposes that collide in single-lane FNV-1a-32", () => {
    // These two valid purpose identifiers share the same plain FNV-1a-32 hash.
    // The two-lane purpose digest plus length must distinguish them.
    const base: Omit<RandomKey, "purpose"> = { seed: 1, day: 2, entityId: 3, drawIndex: 4 };
    expect(drawUint32({ ...base, purpose: "poupguw1a" })).not.toBe(
      drawUint32({ ...base, purpose: "pblz9456g" }),
    );
  });

  test("changing any tuple component changes the draw", () => {
    const base = key({ seed: 11, day: 22, entityId: 33, purpose: "test.base", drawIndex: 44 });
    const baseValue = drawUint32(base);
    const variants: RandomKey[] = [
      { ...base, seed: 12 },
      { ...base, day: 23 },
      { ...base, entityId: 34 },
      { ...base, purpose: "test.base2" },
      { ...base, drawIndex: 45 },
    ];
    for (const variant of variants) {
      expect(drawUint32(variant)).not.toBe(baseValue);
    }
  });

  test("returns a uint32 and a unit float in [0, 1)", () => {
    for (let index = 0; index < 2_000; index += 1) {
      const input = key({ seed: index, day: index % 36_524, entityId: index, drawIndex: index });
      const integer = drawUint32(input);
      const unit = drawUnitFloat(input);
      expect(Number.isInteger(integer)).toBe(true);
      expect(integer).toBeGreaterThanOrEqual(0);
      expect(integer).toBeLessThanOrEqual(0xffff_ffff);
      expect(unit).toBeGreaterThanOrEqual(0);
      expect(unit).toBeLessThan(1);
    }
  });

  test("world-keyed draws use the world seed and next day to process", () => {
    const world = createInitialWorld({ seed: 123_456_789 });
    expect(drawWorldUint32(world, 42, "test.kat", 0)).toBe(drawUint32(key({
      seed: 123_456_789,
      day: 0,
      entityId: 42,
      purpose: "test.kat",
      drawIndex: 0,
    })));
    expect(drawWorldUnitFloat(world, 42, "test.kat", 1)).toBe(drawUnitFloat(key({
      seed: 123_456_789,
      day: 0,
      entityId: 42,
      purpose: "test.kat",
      drawIndex: 1,
    })));

    runTicks(world, 5);
    expect(drawWorldUint32(world, 42, "test.kat", 0)).toBe(drawUint32(key({
      seed: 123_456_789,
      day: 5,
      entityId: 42,
      purpose: "test.kat",
      drawIndex: 0,
    })));
  });

  test("makeRandomKey exposes an explicit validated key", () => {
    const input = makeRandomKey(1, 2, 3, "test.key", 4);
    expect(input).toEqual({ seed: 1, day: 2, entityId: 3, purpose: "test.key", drawIndex: 4 });
    expect(drawUint32(input)).toBe(drawUint32(key({
      seed: 1,
      day: 2,
      entityId: 3,
      purpose: "test.key",
      drawIndex: 4,
    })));
  });

  test("rejects invalid seeds, days, entities, draw indices, and purposes", () => {
    expect(() => drawUint32(key({ seed: -1 }))).toThrow(RangeError);
    expect(() => drawUint32(key({ seed: 2 ** 32 }))).toThrow(RangeError);
    expect(() => drawUint32(key({ seed: 1.5 }))).toThrow(TypeError);
    expect(() => drawUint32(key({ day: -1 }))).toThrow(RangeError);
    expect(() => drawUint32(key({ day: 36_525 }))).toThrow(RangeError);
    expect(() => drawUint32(key({ entityId: -1 }))).toThrow(RangeError);
    expect(() => drawUint32(key({ drawIndex: -1 }))).toThrow(RangeError);
    expect(() => drawUint32(key({ purpose: "" }))).toThrow(RangeError);
    expect(() => drawUint32(key({ purpose: "Uppercase" }))).toThrow(RangeError);
    expect(() => drawUint32(key({ purpose: "bad purpose" }))).toThrow(RangeError);
    expect(() => drawUint32(key({ purpose: "a".repeat(129) }))).toThrow(RangeError);
  });
});
