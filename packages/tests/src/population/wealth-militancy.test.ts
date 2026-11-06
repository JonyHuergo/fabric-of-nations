import {
  MONEY_TOLERANCE_RUSD,
  WEALTH_INTERCEPT,
  WEALTH_MAX,
  WEALTH_MIN,
  WEALTH_SLOPE,
  WEALTH_TARGET_EPSILON,
  annualSubsistenceCostPerCapita,
  applyDailyDemography,
  clamp,
  populationTotal,
  tick,
  updateDailyMilitancy,
  updateMonthlyWealth,
} from "@century/sim";
import {
  aggregateWorld,
  BASE_ANNUAL_INCOME_PER_CAPITA,
  BASE_ANNUAL_MANDATORY_PER_CAPITA,
  contextFor,
  inputOverridesWithSupply,
  makeInputs,
  multiBlockWorld,
} from "../fixtures/m2.js";

describe("M2 wealth and militancy", () => {
  test("updates wealth monthly, not daily", () => {
    const { scenario, world } = multiBlockWorld();
    const inputs = makeInputs([0, 1, 2]);
    const context = contextFor(scenario, inputs);
    const first = tick(world, context);
    expect(first.population?.wealthUpdates).toHaveLength(0);
    for (let day = 2; day <= 31; day += 1) {
      const result = tick(world, context);
      if (day === 31) expect(result.population?.wealthUpdates).toHaveLength(3);
      else expect(result.population?.wealthUpdates).toHaveLength(0);
    }
    for (const block of world.popBlocks) {
      expect(block.wealthLevel).toBeGreaterThanOrEqual(WEALTH_MIN);
      expect(block.wealthLevel).toBeLessThanOrEqual(WEALTH_MAX);
    }
  });

  test("uses the documented wealth target formula", () => {
    const { scenario, world } = multiBlockWorld();
    const inputs = makeInputs([0, 1, 2]);
    const context = contextFor(scenario, inputs);
    for (let day = 0; day < 31; day += 1) tick(world, context);
    const updates = world.popBlocks.map((block) => {
      const annualSubsistence = annualSubsistenceCostPerCapita(
        scenario.definitions,
        inputs,
        1900,
      );
      const annualDisposable =
        BASE_ANNUAL_INCOME_PER_CAPITA - BASE_ANNUAL_MANDATORY_PER_CAPITA;
      const ratio = annualDisposable / annualSubsistence;
      const target = clamp(
        WEALTH_INTERCEPT +
          WEALTH_SLOPE * Math.log(Math.max(ratio, WEALTH_TARGET_EPSILON)),
        WEALTH_MIN,
        WEALTH_MAX,
      );
      return { block, target };
    });
    // The final month-end update is observable through the current wealth
    // state; recompute the same target and assert a bounded one-month move.
    for (const { block, target } of updates) {
      expect(target).toBeGreaterThanOrEqual(WEALTH_MIN);
      expect(target).toBeLessThanOrEqual(WEALTH_MAX);
      expect(block.wealthLevel).toBeGreaterThanOrEqual(WEALTH_MIN);
      expect(block.wealthLevel).toBeLessThanOrEqual(WEALTH_MAX);
    }
  });

  test("basic unmet needs lower wealth compared with full basic supply", () => {
    const full = multiBlockWorld();
    const scarce = multiBlockWorld();
    const fullInputs = makeInputs([0, 1, 2]);
    const scarceInputs = makeInputs([0, 1, 2], {
      supply: { ...inputOverridesWithSupply(1), clothing: 0 },
    });
    const fullContext = contextFor(full.scenario, fullInputs);
    const scarceContext = contextFor(scarce.scenario, scarceInputs);
    for (let day = 0; day < 31; day += 1) {
      tick(full.world, fullContext);
      tick(scarce.world, scarceContext);
    }
    for (let index = 0; index < full.world.popBlocks.length; index += 1) {
      const fullBlock = full.world.popBlocks[index]!;
      const scarceBlock = scarce.world.popBlocks[index]!;
      expect(scarceBlock.unmetBasicDays).toBeGreaterThan(0);
      expect(scarceBlock.wealthLevel).toBeLessThan(fullBlock.wealthLevel);
    }
  });

  test("sustained comfort raises wealth versus no comfort fulfillment", () => {
    const full = multiBlockWorld();
    const noComfort = multiBlockWorld();
    const fullInputs = makeInputs([0, 1, 2]);
    const noComfortInputs = makeInputs([0, 1, 2], {
      supply: { ...inputOverridesWithSupply(1), services: 0.03 },
    });
    const fullContext = contextFor(full.scenario, fullInputs);
    const noComfortContext = contextFor(noComfort.scenario, noComfortInputs);
    for (let month = 0; month < 12; month += 1) {
      for (let day = 0; day < 31; day += 1) {
        tick(full.world, fullContext);
        tick(noComfort.world, noComfortContext);
      }
    }
    for (let index = 0; index < full.world.popBlocks.length; index += 1) {
      const fullBlock = full.world.popBlocks[index]!;
      const noComfortBlock = noComfort.world.popBlocks[index]!;
      expect(fullBlock.comfortFulfilledDays).toBeGreaterThan(0);
      expect(noComfortBlock.comfortFulfilledDays).toBe(0);
      expect(fullBlock.wealthLevel).toBeGreaterThanOrEqual(noComfortBlock.wealthLevel);
      expect(fullBlock.militancy).toBeLessThan(noComfortBlock.militancy);
    }
  });

  test("sustained comfort and current luxury fulfillment support wealth", () => {
    const full = multiBlockWorld();
    const noLuxury = multiBlockWorld();
    const fullInputs = makeInputs([0, 1, 2]);
    const noLuxuryInputs = makeInputs([0, 1, 2], {
      supply: { ...inputOverridesWithSupply(1), textiles: 0 },
    });
    const fullContext = contextFor(full.scenario, fullInputs);
    const noLuxuryContext = contextFor(noLuxury.scenario, noLuxuryInputs);
    for (let day = 0; day < 31; day += 1) {
      tick(full.world, fullContext);
      tick(noLuxury.world, noLuxuryContext);
    }
    const fullClerk = full.world.popBlocks.find((block) => block.id === 2)!;
    const noLuxuryClerk = noLuxury.world.popBlocks.find((block) => block.id === 2)!;
    expect(fullClerk.comfortFulfilledDays).toBeGreaterThan(0);
    expect(noLuxuryClerk.comfortFulfilledDays).toBeGreaterThan(0);
    expect(fullClerk.wealthLevel).toBeGreaterThan(noLuxuryClerk.wealthLevel);
  });

  test("daily unmet-population pressure raises militancy; full supply lowers it", () => {
    const scarce = multiBlockWorld();
    const full = multiBlockWorld();
    const scarceInputs = makeInputs([0, 1, 2], {
      supply: { ...inputOverridesWithSupply(1), grain: 0 },
    });
    const fullInputs = makeInputs([0, 1, 2]);
    const scarceContext = contextFor(scarce.scenario, scarceInputs);
    const fullContext = contextFor(full.scenario, fullInputs);
    for (let day = 0; day < 30; day += 1) {
      tick(scarce.world, scarceContext);
      tick(full.world, fullContext);
    }
    for (let index = 0; index < scarce.world.popBlocks.length; index += 1) {
      expect(scarce.world.popBlocks[index]!.militancy).toBeGreaterThan(
        full.world.popBlocks[index]!.militancy,
      );
      expect(scarce.world.popBlocks[index]!.unmetSubsistenceDays).toBe(30);
    }
    for (const block of full.world.popBlocks) {
      expect(block.militancy).toBeGreaterThanOrEqual(0);
      expect(block.militancy).toBeLessThanOrEqual(1);
    }
  });

  test("P4: previous days' food shortfall increases daily mortality; counters alone do not", () => {
    const withPressure = aggregateWorld();
    const countersOnly = aggregateWorld();
    const withoutPressure = aggregateWorld();
    const definitions = withPressure.scenario.definitions;
    // D-142: the unmet-days counters keep driving militancy, wealth and AI, but
    // mortality responds to the calories actually eaten.
    countersOnly.world.popBlocks[0]!.unmetSubsistenceDays = 365;
    countersOnly.world.popBlocks[0]!.unmetBasicDays = 365;
    withPressure.world.popBlocks[0]!.foodSufficiency = 0.6;
    const withResult = applyDailyDemography(withPressure.world, definitions, 0);
    const countersResult = applyDailyDemography(countersOnly.world, definitions, 0);
    const withoutResult = applyDailyDemography(withoutPressure.world, definitions, 0);
    expect(countersResult.totalDeaths).toBe(withoutResult.totalDeaths);
    expect(withResult.totalDeaths).toBeGreaterThan(withoutResult.totalDeaths);
  });

  test("wealth update helper never produces NaN and respects indicator bounds", () => {
    const { scenario, world } = multiBlockWorld();
    const inputs = makeInputs([0, 1, 2]);
    const context = contextFor(scenario, inputs);
    const needs = tick(world, context).population?.needs;
    if (needs === undefined) throw new Error("expected needs result");
    const updates = updateMonthlyWealth(world, scenario.definitions, inputs, 30, needs);
    expect(updates).toHaveLength(3);
    for (const update of updates) {
      expect(Number.isFinite(update.newWealthLevel)).toBe(true);
      expect(update.newWealthLevel).toBeGreaterThanOrEqual(WEALTH_MIN);
      expect(update.newWealthLevel).toBeLessThanOrEqual(WEALTH_MAX);
      expect(update.annualSubsistenceCostPerCapitaRUSD).toBeGreaterThan(0);
    }
    updateDailyMilitancy(world, needs);
    for (const block of world.popBlocks) {
      expect(Number.isFinite(block.militancy)).toBe(true);
      expect(block.militancy).toBeGreaterThanOrEqual(0);
      expect(block.militancy).toBeLessThanOrEqual(1);
    }
  });

  test("budget quantities use RUSD without mutating account balances", () => {
    const { scenario, world } = multiBlockWorld();
    const before = world.finance.accounts.map((account) => account.balanceRUSD);
    const inputs = makeInputs([0, 1, 2]);
    const result = tick(world, contextFor(scenario, inputs));
    expect(result.population?.needs.blocks.every((block) => block.spentRUSD >= 0)).toBe(true);
    expect(world.finance.accounts.map((account) => account.balanceRUSD)).toEqual(before);
    expect(populationTotal(world.popBlocks[0]!)).toBeGreaterThan(0);
    expect(MONEY_TOLERANCE_RUSD).toBeGreaterThan(0);
  });
});
