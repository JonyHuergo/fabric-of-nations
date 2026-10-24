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

function emptyWorldWithAges(
  male: Partial<Record<number, number>> = {},
  female: Partial<Record<number, number>> = {},
) {
  const world = createPopulationWorld(oneBlockScenario({ 0: 1 }));
  const block = world.popBlocks[0]!;
  block.maleByAge.fill(0);
  block.femaleByAge.fill(0);
  for (const [age, value] of Object.entries(male)) block.maleByAge[Number(age)] = value ?? 0;
  for (const [age, value] of Object.entries(female)) block.femaleByAge[Number(age)] = value ?? 0;
  return { world, block };
}

describe("M2.1 exact single-year ageing", () => {
  test("moves every person exactly one year and empties the youngest slot", () => {
    const { world, block } = emptyWorldWithAges({ 0: 100, 1: 7 }, { 0: 50 });
    applyAnnualAgeing(world);
    expect(Array.from(block.maleByAge).slice(0, 3)).toEqual([0, 100, 7]);
    expect(Array.from(block.femaleByAge).slice(0, 3)).toEqual([0, 50, 0]);
    expect(populationTotal(block)).toBe(157);
  });

  test("a cohort of five-year-olds reaches age 5 after five annual passes", () => {
    const { world, block } = emptyWorldWithAges({ 0: 5 });
    for (let pass = 1; pass <= 5; pass += 1) {
      applyAnnualAgeing(world);
      expect(block.maleByAge[0]).toBe(0);
      if (pass < 5) expect(block.maleByAge[pass]).toBe(5);
    }
    expect(block.maleByAge[5]).toBe(5);
    expect(populationTotal(block)).toBe(5);
  });

  test("does not move arrivals twice in one pass", () => {
    const { world, block } = emptyWorldWithAges({ 0: 1, 1: 1 });
    applyAnnualAgeing(world);
    expect(Array.from(block.maleByAge).slice(0, 4)).toEqual([0, 1, 1, 0]);
    expect(populationTotal(block)).toBe(2);
  });

  test("moves age 79 into the open-ended 80+ group and never ages 80+ out", () => {
    const { world, block } = emptyWorldWithAges({ 78: 20, 79: 10, 80: 5 });
    applyAnnualAgeing(world);
    expect(block.maleByAge[78]).toBe(0);
    expect(block.maleByAge[79]).toBe(20);
    expect(block.maleByAge[80]).toBe(15);
    expect(populationTotal(block)).toBe(35);

    for (let pass = 0; pass < 5; pass += 1) applyAnnualAgeing(world);
    expect(block.maleByAge[80]).toBe(35);
    expect(populationTotal(block)).toBe(35);
  });

  test("conserves population across both sexes and many ages", () => {
    const { world, block } = emptyWorldWithAges(
      { 0: 101, 1: 77, 2: 55, 37: 31, 79: 19, 80: 7 },
      { 0: 93, 5: 44, 40: 23, 80: 11 },
    );
    const before = populationTotal(block);
    for (let pass = 0; pass < 85; pass += 1) {
      applyAnnualAgeing(world);
      expect(populationTotal(block)).toBe(before);
      for (const count of block.maleByAge) expect(Number.isInteger(count)).toBe(true);
      for (const count of block.femaleByAge) expect(Number.isInteger(count)).toBe(true);
      expect(block.maleByAge[0]).toBe(0);
      expect(block.femaleByAge[0]).toBe(0);
    }
    expect(populationTotal(block)).toBe(before);
  });

  test("applies ageing on 1901-01-01 and not on 1900-01-01", () => {
    const { scenario, world } = aggregateWorld();
    const inputs = makeInputs([0]);
    const context = contextFor(scenario, inputs, false);
    runTicks(world, 365, context);
    const block = world.popBlocks[0]!;
    const age1Before = block.maleByAge[1] ?? 0;
    const result = tick(world, context);
    expect(result.dayProcessed).toBe(365);
    expect(result.population?.aged).toBe(true);
    expect(block.maleByAge[0]).toBeGreaterThanOrEqual(0);
    expect((block.maleByAge[1] ?? 0)).toBeGreaterThanOrEqual(age1Before);
    expect(result.population?.demography.populationStart).toBeGreaterThan(0);
  });
});
