import {
  applyAnnualAgeing,
  createPopulationWorld,
  populationTotal,
  runTicks,
  tick,
} from "@century/sim";
import {
  aggregateWorld,
  contextFor,
  makeInputs,
  oneBlockScenario,
} from "./fixtures/m2.js";

describe("M2 exact integer cohort ageing", () => {
  test("uses fifths-of-a-person carry and never moves a small cohort early", () => {
    const world = createPopulationWorld(oneBlockScenario({ 0: 4 }));
    const block = world.popBlocks[0]!;
    applyAnnualAgeing(world);
    expect(Array.from(block.ageCohorts).slice(0, 3)).toEqual([4, 0, 0]);
    expect(block.agingCarry[0]).toBe(4);

    applyAnnualAgeing(world);
    expect(Array.from(block.ageCohorts).slice(0, 3)).toEqual([3, 1, 0]);
    expect(block.agingCarry[0]).toBe(3);
    expect(populationTotal(block)).toBe(4);
  });

  test("conserves population exactly across all cohorts", () => {
    const world = createPopulationWorld(
      oneBlockScenario({ 0: 101, 1: 77, 2: 55, 3: 31, 15: 19, 16: 7 }),
    );
    const block = world.popBlocks[0]!;
    const before = populationTotal(block);
    for (let pass = 0; pass < 10; pass += 1) {
      applyAnnualAgeing(world);
      expect(populationTotal(block)).toBe(before);
      for (const count of block.ageCohorts) expect(Number.isInteger(count)).toBe(true);
      for (const carry of block.agingCarry) expect(carry).toBeGreaterThanOrEqual(0);
      for (const carry of block.agingCarry) expect(carry).toBeLessThanOrEqual(4);
      expect(block.agingCarry[16]).toBe(0);
    }
  });

  test("processes oldest to youngest so arrivals are not moved twice", () => {
    const world = createPopulationWorld(oneBlockScenario({ 14: 50, 15: 50 }));
    const block = world.popBlocks[0]!;
    applyAnnualAgeing(world);
    // 50/5 = 10 moves from 15 to 16 and 10 from 14 to 15. If processed
    // youngest-first, cohort 15 would receive 10 and then move 12 to 16.
    expect(block.ageCohorts[15]).toBe(50);
    expect(block.ageCohorts[16]).toBe(10);
    expect(block.ageCohorts[14]).toBe(40);
  });

  test("skips ageing on 1900-01-01 and applies it on 1901-01-01", () => {
    const { scenario, world } = aggregateWorld();
    const inputs = makeInputs([0]);
    const context = contextFor(scenario, inputs, false);
    runTicks(world, 365, context);
    const before = populationTotal(world.popBlocks[0]!);
    const block = world.popBlocks[0]!;
    const carryBefore = Array.from(block.agingCarry);

    const result = tick(world, context);
    expect(result.dayProcessed).toBe(365);
    expect(result.population?.aged).toBe(true);
    expect(result.population?.demography.populationStart).toBe(before);
    expect(Array.from(block.agingCarry)).not.toEqual(carryBefore);
    expect(result.population?.births).toBeGreaterThanOrEqual(0);
    expect(result.population?.deaths).toBeGreaterThanOrEqual(0);
  });
});
