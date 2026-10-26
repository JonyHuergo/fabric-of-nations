import {
  createPopulationWorld,
  hashWorld,
  populationTotal,
  tick,
  worldPopulation,
} from "@century/sim";
import {
  contextFor,
  inputOverridesWithSupply,
  makeInputs,
  multiBlockWorld,
  oneBlockScenario,
} from "./fixtures/m2.js";

function totalSpent(
  summaries: readonly { spentSUSD: number }[],
): number {
  return summaries.reduce((total, summary) => total + summary.spentSUSD, 0);
}

describe("M2 needs, budgets, and shared supply", () => {
  test("fulfills every active tier when supply and budget are sufficient", () => {
    const { scenario, world } = multiBlockWorld();
    const inputs = makeInputs([0, 1, 2]);
    const result = tick(world, contextFor(scenario, inputs));
    const needs = result.population?.needs;
    expect(needs).toBeDefined();
    if (needs === undefined) throw new Error("expected needs result");

    expect(needs.blocks).toHaveLength(3);
    for (const block of needs.blocks) {
      expect(block.budgetStartBeforeNeedsSUSD).toBeGreaterThanOrEqual(0);
      expect(block.budgetEndAfterNeedsSUSD).toBeGreaterThanOrEqual(0);
      expect(block.budgetEndAfterNeedsSUSD).toBeCloseTo(block.budgetStartBeforeNeedsSUSD - block.spentSUSD, 6);
      expect(block.spentSUSD).toBeCloseTo(totalSpent(block.tierSummaries), 6);
      for (const summary of block.tierSummaries) {
        if (summary.active) expect(summary.fullyMet).toBe(true);
      }
      for (const tier of block.tiers) {
        for (const good of tier.goods) {
          expect(good.desired).toBeGreaterThanOrEqual(good.funded);
          expect(good.funded).toBeGreaterThanOrEqual(good.fulfilled);
          expect(good.unmetDesired).toBeCloseTo(good.desired - good.fulfilled, 6);
          expect(good.unmetFunded).toBeCloseTo(good.funded - good.fulfilled, 6);
        }
      }
    }
    for (const good of Object.keys(needs.initialSupplyByGood)) {
      expect(needs.initialSupplyByGood[good]).toBeCloseTo(
        (needs.consumedSupplyByGood[good] ?? 0) + (needs.remainingSupplyByGood[good] ?? 0),
        6,
      );
    }
    expect(populationTotal(world.popBlocks[0]!)).toBeGreaterThan(0);
  });

  test("clamps funded demand to the daily budget and stops higher tiers", () => {
    const { scenario, world } = multiBlockWorld();
    const inputs = makeInputs([0, 1, 2], {
      annualIncomePerCapita: 70,
      annualMandatoryPerCapita: 60,
    });
    const result = tick(world, contextFor(scenario, inputs));
    const needs = result.population?.needs;
    if (needs === undefined) throw new Error("expected needs result");
    for (const block of needs.blocks) {
      expect(block.spentSUSD).toBeLessThanOrEqual(block.budgetStartBeforeNeedsSUSD + 1e-6);
      expect(block.budgetEndAfterNeedsSUSD).toBeGreaterThanOrEqual(0);
      const subsistence = block.tierSummaries.find((summary) => summary.tier === "subsistence");
      const basic = block.tierSummaries.find((summary) => summary.tier === "basic");
      expect(subsistence?.active).toBe(true);
      expect(subsistence?.fullyMet).toBe(false);
      expect(basic?.active).toBe(false);
      for (const tier of block.tiers) {
        for (const good of tier.goods) {
          expect(good.funded).toBeLessThanOrEqual(good.desired + 1e-9);
          expect(good.fulfilled).toBeLessThanOrEqual(good.funded + 1e-9);
        }
      }
    }
  });

  test("a shared supply pool is never reused across tiers", () => {
    const { scenario, world } = multiBlockWorld();
    const inputs = makeInputs([0, 1, 2], {
      supply: { ...inputOverridesWithSupply(1), services: 0.05 },
    });
    const result = tick(world, contextFor(scenario, inputs));
    const needs = result.population?.needs;
    if (needs === undefined) throw new Error("expected needs result");
    const initial = needs.initialSupplyByGood.services ?? 0;
    expect(initial).toBeGreaterThan(0);
    expect(needs.consumedSupplyByGood.services ?? 0).toBeLessThanOrEqual(initial + 1e-6);
    expect(needs.remainingSupplyByGood.services ?? 0).toBeGreaterThanOrEqual(-1e-6);
    expect(needs.consumedSupplyByGood.services ?? 0).toBeCloseTo(initial, 3);
    const totalServicesFulfilled = needs.blocks.reduce((total, block) => {
      const tiers = block.tiers;
      return (
        total +
        tiers.reduce((tierTotal, tier) => {
          const good = tier.goods.find((candidate) => candidate.goodKey === "services");
          return tierTotal + (good?.fulfilled ?? 0);
        }, 0)
      );
    }, 0);
    expect(totalServicesFulfilled).toBeLessThanOrEqual(initial + 1e-6);
  });

  test("allocates scarce supply proportionally and independently of input order", () => {
    const first = multiBlockWorld();
    const second = multiBlockWorld();
    const inputs = makeInputs([0, 1, 2], {
      supply: { ...inputOverridesWithSupply(1), grain: 0.25 },
    });
    const reversed = {
      prices: [...inputs.prices].reverse(),
      supply: [...inputs.supply].reverse(),
      income: [...inputs.income].reverse(),
    };
    const firstResult = tick(first.world, contextFor(first.scenario, inputs));
    const secondResult = tick(second.world, contextFor(second.scenario, reversed));
    expect(secondResult.population?.needs.blocks).toEqual(
      firstResult.population?.needs.blocks,
    );
    expect(hashWorld(second.world)).toBe(hashWorld(first.world));

    const needs = firstResult.population?.needs;
    if (needs === undefined) throw new Error("expected needs result");
    const grain = needs.blocks.map((block) => {
      const subsistence = block.tiers.find((tier) => tier.tier === "subsistence");
      return subsistence?.goods.find((good) => good.goodKey === "grain");
    });
    for (const good of grain) {
      if (good === undefined) throw new Error("missing grain demand");
      // Available grain is 0.25 per capita versus 0.9 desired per capita.
      if (good.desired > 0) expect(good.fulfilled / good.desired).toBeCloseTo(0.25 / 0.9, 3);
    }
    expect(needs.consumedSupplyByGood.grain ?? 0).toBeCloseTo(
      (needs.initialSupplyByGood.grain ?? 0),
      3,
    );
  });

  test("unmet subsistence stops comfort and luxury and increments counters", () => {
    const { scenario, world } = multiBlockWorld();
    const inputs = makeInputs([0, 1, 2], {
      supply: { ...inputOverridesWithSupply(1), grain: 0 },
    });
    const result = tick(world, contextFor(scenario, inputs));
    const needs = result.population?.needs;
    if (needs === undefined) throw new Error("expected needs result");
    for (const block of needs.blocks) {
      const subsistence = block.tierSummaries.find((tier) => tier.tier === "subsistence");
      const comfort = block.tierSummaries.find((tier) => tier.tier === "comfort");
      const luxury = block.tierSummaries.find((tier) => tier.tier === "luxury");
      expect(subsistence?.active).toBe(true);
      expect(subsistence?.fullyMet).toBe(false);
      expect(comfort?.active).toBe(false);
      expect(luxury?.active).toBe(false);
    }
    expect(world.popBlocks.every((block) => block.unmetSubsistenceDays === 1)).toBe(true);
    expect(world.popBlocks.every((block) => block.comfortFulfilledDays === 0)).toBe(true);
  });

  test("zero-cost comfort items remain physically constrained", () => {
    const { scenario, world } = multiBlockWorld();
    const inputs = makeInputs([0, 1, 2], {
      prices: {
        grain: 0.05,
        "food-products": 0.1,
        fish: 0.1,
        livestock: 0.2,
        clothing: 0,
        services: 0,
        textiles: 1,
      },
      supply: { ...inputOverridesWithSupply(1), services: 0.05 },
    });
    const result = tick(world, contextFor(scenario, inputs));
    const needs = result.population?.needs;
    if (needs === undefined) throw new Error("expected needs result");
    const clerk = needs.blocks.find((block) => block.popBlockId === 2);
    const comfort = clerk?.tierSummaries.find((tier) => tier.tier === "comfort");
    expect(comfort?.active).toBe(true);
    expect(comfort?.spentSUSD).toBe(0);
    expect(comfort?.fullyMet).toBe(false);
  });

  test("does not finance daily needs from savings account balances", () => {
    const { scenario, world } = multiBlockWorld();
    for (const account of world.finance.accounts) {
      if (account.subtype !== "household-cash" && account.subtype !== "owner-equity") continue;
      account.balanceSUSD = 1_000_000_000;
    }
    const before = world.finance.accounts.map((account) => account.balanceSUSD);
    const inputs = makeInputs([0, 1, 2], {
      annualIncomePerCapita: 0,
      annualMandatoryPerCapita: 0,
    });
    const result = tick(world, contextFor(scenario, inputs));
    const needs = result.population?.needs;
    if (needs === undefined) throw new Error("expected needs result");
    for (const block of needs.blocks) {
      expect(block.budgetStartBeforeNeedsSUSD).toBe(0);
      expect(block.spentSUSD).toBe(0);
      expect(block.budgetEndAfterNeedsSUSD).toBe(0);
    }
    expect(world.finance.accounts.map((account) => account.balanceSUSD)).toEqual(before);
  });

  test("handles a non-positive disposable budget without creating money", () => {
    const { scenario, world } = multiBlockWorld();
    const before = world.finance.accounts.map((account) => account.balanceSUSD);
    const inputs = makeInputs([0, 1, 2], {
      annualIncomePerCapita: 10,
      annualMandatoryPerCapita: 100,
    });
    const result = tick(world, contextFor(scenario, inputs));
    const needs = result.population?.needs;
    if (needs === undefined) throw new Error("expected needs result");
    for (const block of needs.blocks) {
      expect(block.budgetStartBeforeNeedsSUSD).toBe(0);
      expect(block.spentSUSD).toBe(0);
      expect(block.budgetEndAfterNeedsSUSD).toBe(0);
    }
    expect(world.finance.accounts.map((account) => account.balanceSUSD)).toEqual(before);
  });

  test("zero-population blocks produce zero needs without NaN", () => {
    const scenario = oneBlockScenario({});
    const world = createPopulationWorld(scenario);
    const result = tick(world, contextFor(scenario, makeInputs([0])));
    const needs = result.population?.needs;
    const block = needs?.blocks[0];
    expect(block?.population).toBe(0);
    expect(block?.spentSUSD).toBe(0);
    expect(block?.budgetStartBeforeNeedsSUSD).toBe(0);
    expect(block?.tierSummaries.every((tier) => tier.active === false)).toBe(true);
    expect(worldPopulation(world)).toBe(0);
  });

  test("summary-only needs match the detailed settlement without tier payloads", () => {
    const detailed = multiBlockWorld();
    const summaryOnly = multiBlockWorld();
    const detailedResult = tick(
      detailed.world,
      contextFor(detailed.scenario, makeInputs([0, 1, 2]), true),
    );
    const summaryResult = tick(
      summaryOnly.world,
      contextFor(summaryOnly.scenario, makeInputs([0, 1, 2]), false),
    );
    const detailedNeeds = detailedResult.population?.needs;
    const summaryNeeds = summaryResult.population?.needs;
    if (detailedNeeds === undefined || summaryNeeds === undefined) {
      throw new Error("expected needs results");
    }

    expect(summaryNeeds.blocks).toHaveLength(detailedNeeds.blocks.length);
    for (let index = 0; index < detailedNeeds.blocks.length; index += 1) {
      const detailedBlock = detailedNeeds.blocks[index];
      const summaryBlock = summaryNeeds.blocks[index];
      if (detailedBlock === undefined || summaryBlock === undefined) {
        throw new Error(`missing needs block ${String(index)}`);
      }
      expect(summaryBlock.popBlockId).toBe(detailedBlock.popBlockId);
      expect(summaryBlock.population).toBe(detailedBlock.population);
      expect(summaryBlock.budgetStartBeforeNeedsSUSD).toBe(detailedBlock.budgetStartBeforeNeedsSUSD);
      expect(summaryBlock.budgetEndAfterNeedsSUSD).toBe(detailedBlock.budgetEndAfterNeedsSUSD);
      expect(summaryBlock.spentSUSD).toBe(detailedBlock.spentSUSD);
      expect(summaryBlock.tiers).toEqual([]);
      expect(summaryBlock.tierSummaries).toEqual(detailedBlock.tierSummaries);
    }
    expect(summaryNeeds.initialSupplyByGood).toEqual(detailedNeeds.initialSupplyByGood);
    expect(summaryNeeds.remainingSupplyByGood).toEqual(detailedNeeds.remainingSupplyByGood);
    expect(summaryNeeds.consumedSupplyByGood).toEqual(detailedNeeds.consumedSupplyByGood);
    expect(hashWorld(summaryOnly.world)).toBe(hashWorld(detailed.world));
  });

  test("retains the detailed tier and good payload when requested", () => {
    const scenario = oneBlockScenario({ 0: 1000, 3: 1000, 8: 1000 });
    const world = createPopulationWorld(scenario);
    const result = tick(world, contextFor(scenario, makeInputs([0]), true));
    const block = result.population?.needs.blocks[0];
    if (block === undefined) throw new Error("expected needs block");

    expect(block.population).toBe(3000);
    expect(block.budgetStartBeforeNeedsSUSD).toBeCloseTo(1643.835616438356, 9);
    expect(block.budgetEndAfterNeedsSUSD).toBeCloseTo(1271.835616438356, 9);
    expect(block.spentSUSD).toBe(372);
    expect(block.tiers).toHaveLength(4);
    expect(block.tiers.map((tier) => tier.tier)).toEqual([
      "subsistence",
      "basic",
      "comfort",
      "luxury",
    ]);
    expect(block.tierSummaries.map((summary) => summary.spentSUSD)).toEqual([186, 60, 126, 0]);

    const subsistence = block.tiers.find((tier) => tier.tier === "subsistence");
    const basic = block.tiers.find((tier) => tier.tier === "basic");
    const comfort = block.tiers.find((tier) => tier.tier === "comfort");
    const luxury = block.tiers.find((tier) => tier.tier === "luxury");
    if (
      subsistence === undefined ||
      basic === undefined ||
      comfort === undefined ||
      luxury === undefined
    ) {
      throw new Error("missing detailed need tier");
    }

    expect(subsistence.goods).toEqual([
      { goodKey: "fish", desired: 90, funded: 90, fulfilled: 90, unmetDesired: 0, unmetFunded: 0 },
      {
        goodKey: "food-products",
        desired: 240,
        funded: 240,
        fulfilled: 240,
        unmetDesired: 0,
        unmetFunded: 0,
      },
      {
        goodKey: "grain",
        desired: 2700,
        funded: 2700,
        fulfilled: 2700,
        unmetDesired: 0,
        unmetFunded: 0,
      },
      {
        goodKey: "livestock",
        desired: 90,
        funded: 90,
        fulfilled: 90,
        unmetDesired: 0,
        unmetFunded: 0,
      },
    ]);
    expect(basic.goods).toEqual([
      { goodKey: "clothing", desired: 30, funded: 30, fulfilled: 30, unmetDesired: 0, unmetFunded: 0 },
      { goodKey: "services", desired: 60, funded: 60, fulfilled: 60, unmetDesired: 0, unmetFunded: 0 },
    ]);
    expect(comfort.goods).toEqual([
      { goodKey: "clothing", desired: 6, funded: 6, fulfilled: 6, unmetDesired: 0, unmetFunded: 0 },
      { goodKey: "services", desired: 240, funded: 240, fulfilled: 240, unmetDesired: 0, unmetFunded: 0 },
    ]);
    expect(luxury.active).toBe(false);
    expect(luxury.goods).toEqual([]);
  });
});
