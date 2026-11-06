/**
 * Natural-fertility ceiling of the fertility level (D-144, amending D-142 §2).
 *
 * - The saturation is the identity up to the knee, continuous with slope 1 there,
 *   strictly increasing above it and never above the cap.
 * - Known answers from D-144: raw 2.5 gives 2.222, and the 1993 block's raw 4.009 gives
 *   2.2995 (about 11.1 children per woman) instead of failing validation.
 * - The inverse used to fit residuals round-trips exactly, is the identity for every
 *   sourced 1900 level and rejects levels at or above the cap.
 * - A block's derived level stays below the cap however large its causal product.
 *
 * The constants are PROVISIONAL (P15 calibrates); if the designer revises them, D-144
 * and the pinned values here change together.
 */

import { loadDemography1900 } from "@century/data";
import {
  assertValidBlockLevels,
  calibrateBlockDemography,
  createPopulationWorld,
  FERTILITY_LEVEL_MAX,
  FERTILITY_NATURAL_CAP,
  FERTILITY_NATURAL_KNEE,
  fertilityLevel,
  inverseNaturalFertilitySaturation,
  hashWorld,
  NEUTRAL_DEMOGRAPHY_FACTORS,
  naturalFertilitySaturation,
  tick,
} from "@century/sim";
import { contextFor, makeInputs, oneBlockScenario } from "../fixtures/m2.js";

/** Children per woman of a fertility level of 1 (the standard ASFR schedule). */
const STANDARD_TFR = loadDemography1900("historical/p4/demography_1900.json").meta.standardTotalFertility;

function block() {
  const world = createPopulationWorld(oneBlockScenario({ 0: 20_000, 5: 14_000, 10: 8_000 }), { seed: 7 });
  return world.popBlocks[0]!;
}

describe("natural-fertility saturation (D-144)", () => {
  test("the constants are those of D-144, and the cap is below the validation bound", () => {
    expect(FERTILITY_NATURAL_KNEE).toBe(1.7);
    expect(FERTILITY_NATURAL_CAP).toBe(2.3);
    expect(FERTILITY_LEVEL_MAX).toBe(4);
    expect(FERTILITY_NATURAL_KNEE).toBeLessThan(FERTILITY_NATURAL_CAP);
    expect(FERTILITY_NATURAL_CAP).toBeLessThan(FERTILITY_LEVEL_MAX);
    // About 8.2 and 11.1 children per woman at the knee and the cap.
    expect(FERTILITY_NATURAL_KNEE * STANDARD_TFR).toBeCloseTo(8.2, 1);
    expect(FERTILITY_NATURAL_CAP * STANDARD_TFR).toBeCloseTo(11.1, 1);
  });

  test("identity up to the knee", () => {
    for (const raw of [0, 0.25, 1, 1.144, 1.667, FERTILITY_NATURAL_KNEE]) {
      expect(naturalFertilitySaturation(raw)).toBe(raw);
    }
  });

  test("continuous with slope 1 at the knee", () => {
    const h = 1e-4;
    const above = naturalFertilitySaturation(FERTILITY_NATURAL_KNEE + h);
    expect(above - FERTILITY_NATURAL_KNEE).toBeCloseTo(h, 10);
    const slope = (naturalFertilitySaturation(FERTILITY_NATURAL_KNEE + 2 * h) - above) / h;
    expect(slope).toBeCloseTo(1, 6);
  });

  test("strictly increasing above the knee and never above the cap", () => {
    let previous = FERTILITY_NATURAL_KNEE;
    for (let raw = FERTILITY_NATURAL_KNEE + 0.01; raw <= 10; raw += 0.01) {
      const level = naturalFertilitySaturation(raw);
      expect(level).toBeGreaterThan(previous);
      expect(level).toBeLessThan(FERTILITY_NATURAL_CAP);
      previous = level;
    }
    for (const raw of [20, 100, 1e6]) {
      expect(naturalFertilitySaturation(raw)).toBeLessThanOrEqual(FERTILITY_NATURAL_CAP);
    }
  });

  test("known answers: raw 2.5 and the 1993 block's raw 4.009", () => {
    expect(naturalFertilitySaturation(2.5)).toBeCloseTo(2.222, 3);
    const level1993 = naturalFertilitySaturation(4.009);
    expect(level1993).toBeCloseTo(2.2995, 3);
    expect(level1993 * STANDARD_TFR).toBeCloseTo(11.1, 1);
  });

  test("rejects a raw level that is negative or not finite", () => {
    for (const raw of [-0.01, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => naturalFertilitySaturation(raw)).toThrow(RangeError);
    }
  });
});

describe("inverse saturation and residual fitting (D-144)", () => {
  test("the inverse round-trips in both directions", () => {
    for (let level = 0; level < FERTILITY_NATURAL_CAP - 1e-3; level += 0.01) {
      expect(naturalFertilitySaturation(inverseNaturalFertilitySaturation(level))).toBeCloseTo(level, 12);
    }
    for (let raw = 0; raw <= 5; raw += 0.05) {
      expect(inverseNaturalFertilitySaturation(naturalFertilitySaturation(raw))).toBeCloseTo(raw, 9);
    }
  });

  test("the inverse rejects a level at or above the cap, negative or not finite", () => {
    for (const level of [FERTILITY_NATURAL_CAP, 3, -0.01, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => inverseNaturalFertilitySaturation(level)).toThrow(RangeError);
    }
  });

  test("every sourced 1900 province level is at or below the knee, so its residual is unchanged", () => {
    const sources = loadDemography1900("historical/p4/demography_1900.json");
    expect(sources.provinces.length).toBeGreaterThan(0);
    for (const province of sources.provinces) {
      expect(province.fertilityLevel).toBeLessThanOrEqual(FERTILITY_NATURAL_KNEE);
      expect(inverseNaturalFertilitySaturation(province.fertilityLevel)).toBe(province.fertilityLevel);
    }
  });

  test("a block calibrated to a level above the knee reproduces it through the saturation", () => {
    const target = block();
    calibrateBlockDemography(
      target,
      { fertilityLevel: 2.1, childMortality: 1, adultMortality: 1 },
      NEUTRAL_DEMOGRAPHY_FACTORS,
      "test",
    );
    expect(fertilityLevel(target, NEUTRAL_DEMOGRAPHY_FACTORS)).toBeCloseTo(2.1, 12);
  });

  test("calibration rejects a sourced level at or above the cap", () => {
    expect(() =>
      calibrateBlockDemography(
        block(),
        { fertilityLevel: FERTILITY_NATURAL_CAP, childMortality: 1, adultMortality: 1 },
        NEUTRAL_DEMOGRAPHY_FACTORS,
        "test",
      ),
    ).toThrow(RangeError);
  });

  test("a block whose causal product passes the old bound stays valid and below the cap", () => {
    // D-144 diagnosis: in 1993 a block's product of cause factors reached 4.009 and the
    // validator stopped the run. The saturated level stays below the cap however large
    // the product, so validation passes without raising the bound or clamping.
    const target = block();
    calibrateBlockDemography(target, { fertilityLevel: 1, childMortality: 1, adultMortality: 1 }, NEUTRAL_DEMOGRAPHY_FACTORS, "test");
    for (const multiple of [4.009, 10, 1000]) {
      const scaled = { ...target, fertilityResidual: target.fertilityResidual * multiple };
      const level = fertilityLevel(scaled, NEUTRAL_DEMOGRAPHY_FACTORS);
      expect(level).toBeGreaterThan(FERTILITY_NATURAL_KNEE);
      expect(level).toBeLessThanOrEqual(FERTILITY_NATURAL_CAP);
      expect(() => assertValidBlockLevels(scaled, NEUTRAL_DEMOGRAPHY_FACTORS, "test")).not.toThrow();
    }
  });

  test("births over a simulated year follow the saturated level, never the raw product; deterministic (D-146 B6)", () => {
    // One block against the same block with its causal product scaled 1,000-fold. Every
    // day the extreme block's derived level stays at or below the cap, and its births
    // relative to the base block follow the ratio of the two derived levels (births are
    // proportional to the level), not the 1,000-fold raw product. Two runs of the extreme
    // block give the same births, levels and world hash.
    const scenario = oneBlockScenario({ 3: 40_000, 4: 40_000, 5: 40_000, 6: 40_000, 7: 40_000 });
    const run = (multiple: number): { births: number; hash: string; meanLevel: number; maxLevel: number } => {
      const world = createPopulationWorld(scenario, { seed: 7 });
      const target = world.popBlocks[0]!;
      calibrateBlockDemography(target, { fertilityLevel: 1, childMortality: 1, adultMortality: 1 }, NEUTRAL_DEMOGRAPHY_FACTORS, "test");
      target.fertilityResidual *= multiple;
      const context = contextFor(scenario, makeInputs([0]), false);
      let births = 0;
      let levelSum = 0;
      let maxLevel = 0;
      for (let day = 0; day < 365; day += 1) {
        births += tick(world, context).population?.demography.blocks[0]?.births ?? 0;
        const level = fertilityLevel(world.popBlocks[0]!, NEUTRAL_DEMOGRAPHY_FACTORS);
        levelSum += level;
        maxLevel = Math.max(maxLevel, level);
      }
      return { births, hash: hashWorld(world), meanLevel: levelSum / 365, maxLevel };
    };
    const base = run(1);
    const extreme = run(1000);
    expect(base.births).toBeGreaterThan(1_000);
    expect(extreme.maxLevel).toBeLessThanOrEqual(FERTILITY_NATURAL_CAP);
    expect(extreme.meanLevel).toBeGreaterThan(FERTILITY_NATURAL_KNEE);
    // Births follow the level ratio within 2 % (daily integer rounding and the month-
    // start level updates), far from the 1,000-fold raw ratio.
    const expected = (extreme.meanLevel / base.meanLevel) * base.births;
    expect(Math.abs(extreme.births / expected - 1)).toBeLessThan(0.02);
    expect(extreme.births / base.births).toBeLessThan(FERTILITY_NATURAL_CAP / base.meanLevel + 0.05);
    expect(run(1000)).toEqual(extreme);
  });
});
