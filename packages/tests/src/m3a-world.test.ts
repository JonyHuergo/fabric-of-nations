import { loadM2WorldAggregate } from "@century/data";
import {
  assertValidWorld,
  createEconomyWorld,
  createPopulationWorld,
  deriveStockByGood,
  populationTotal,
  type Market,
  type World,
} from "@century/sim";
import { cloneM3Scenario, m3World } from "./fixtures/m3a.js";

describe("M3a world state and relationships", () => {
  test("creates the small M3 economy with buildings, assignments, lots, and accounts", () => {
    const { world } = m3World();
    const region = world.regions[0];
    const market = world.markets[0];
    if (region === undefined || market === undefined) throw new Error("missing economy state");

    expect(world.buildings).toHaveLength(8);
    expect(world.employment).toHaveLength(3);
    expect(world.markets).toHaveLength(1);
    expect(region.marketId).toBe(0);
    expect(region.buildingInstanceIds).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(world.finance.accounts).toHaveLength(67);
    expect(market.priceSUSD).toHaveLength(8);
    expect(market.stockLots.length).toBeGreaterThan(0);

    const stock = deriveStockByGood(market, 8);
    expect(stock).toHaveLength(8);
    for (const lot of market.stockLots) {
      expect(stock[lot.goodId] ?? 0).toBeGreaterThanOrEqual(lot.quantity);
    }
    expect(() => assertValidWorld(world)).not.toThrow();
  });

  test("accepts unqualified population blocks and unstaffed buildings as valid economic states", () => {
    const scenario = cloneM3Scenario();
    const clerks = scenario.population.popBlocks[2];
    if (clerks === undefined) throw new Error("missing clerks block");
    clerks.literacy = 0.05;
    scenario.employment = scenario.employment.filter(
      (assignment) => assignment.popBlockId !== clerks.id,
    );

    const world = createEconomyWorld(scenario, { seed: 7 });
    expect(world.popBlocks[2]?.literacy).toBe(0.05);
    expect(world.buildings[6]?.definitionId).toBe(6);
    expect(() => assertValidWorld(world)).not.toThrow();
  });

  test("creates a structurally valid economy world with no buildings or markets", () => {
    const scenario = cloneM3Scenario();
    scenario.buildingInstances = [];
    scenario.markets = [];
    scenario.systemAccounts = [];
    scenario.employment = [];

    const world = createEconomyWorld(scenario, { seed: 9 });
    expect(world.buildings).toHaveLength(0);
    expect(world.markets).toHaveLength(0);
    expect(world.regions[0]?.marketId).toBeNull();
    expect(world.regions[0]?.buildingInstanceIds).toEqual([]);
    expect(() => assertValidWorld(world)).not.toThrow();
  });

  test("rejects buildings without a market and a market missing its region", () => {
    const noMarket = cloneM3Scenario();
    noMarket.markets = [];
    expect(() => createEconomyWorld(noMarket, { seed: 1 })).toThrow(/market/i);

    const missingRegion = cloneM3Scenario();
    missingRegion.markets[0]!.regionIds = [];
    expect(() => createEconomyWorld(missingRegion, { seed: 1 })).toThrow(/region/i);
  });

  test("rejects initial inventory above storage capacity", () => {
    const scenario = cloneM3Scenario();
    const lot = scenario.markets[0]?.stockLots[0];
    if (lot === undefined) throw new Error("missing initial lot");
    lot.quantity = 3_000_000;
    expect(() => createEconomyWorld(scenario, { seed: 1 })).toThrow(/capacity|stock/i);
  });

  test("rejects scenario data-version mismatches at creation", () => {
    const scenario = cloneM3Scenario();
    scenario.population.dataVersion = "m2.1-population-v1";
    scenario.definitions.dataVersion = "m2.1-population-v1";
    expect(() => createEconomyWorld(scenario, { seed: 1 })).toThrow(/dataVersion|version/i);
  });

  test("rejects duplicate account and building ids", () => {
    const duplicateAccount = m3World().world;
    const firstAccount = duplicateAccount.finance.accounts[0];
    if (firstAccount === undefined) throw new Error("missing account");
    duplicateAccount.finance.accounts.push({ ...firstAccount });
    expect(() => assertValidWorld(duplicateAccount)).toThrow(/duplicate|account/i);

    const duplicateBuilding = cloneM3Scenario();
    const secondBuilding = duplicateBuilding.buildingInstances[1];
    if (secondBuilding === undefined) throw new Error("missing building");
    secondBuilding.id = duplicateBuilding.buildingInstances[0]!.id;
    expect(() => createEconomyWorld(duplicateBuilding, { seed: 1 })).toThrow(/duplicate|building/i);
  });

  test("rejects an operating account with no building owner", () => {
    const world = m3World().world;
    // Use a free id below nextAccountId so the account-id guard cannot mask the
    // owner-reference check this test is meant to exercise.
    const freeId = 4;
    expect(world.finance.accounts.some((account) => account.id === freeId)).toBe(false);
    expect(freeId).toBeLessThan(world.finance.nextAccountId);
    world.finance.accounts.push({
      id: freeId,
      ownerKind: "building",
      ownerId: 999,
      category: "asset",
      subtype: "operating-cash",
      balanceSUSD: 0,
    });
    expect(() => assertValidWorld(world)).toThrow(
      /operating-cash account 4 references unknown building owner/i,
    );
  });

  test("rejects duplicate inventory lots", () => {
    const { world } = m3World();
    const market = world.markets[0] as Market;
    const first = market.stockLots[0];
    if (first === undefined) throw new Error("missing stock lot");
    market.stockLots.push({ ...first });
    expect(() => assertValidWorld(world)).toThrow(/duplicate|lot/i);
  });

  test("rejects missing building, owner, and operating accounts", () => {
    const missingOperating = m3World().world;
    missingOperating.buildings[0]!.operatingCashAccountId = 999;
    expect(() => assertValidWorld(missingOperating)).toThrow(/account|unknown/i);

    const missingOwner = m3World().world;
    missingOwner.buildings[0]!.ownerAccountId = 999;
    expect(() => assertValidWorld(missingOwner)).toThrow(/account|owner|unknown/i);

    const missingBuildingReference = m3World().world;
    missingBuildingReference.regions[0]!.buildingInstanceIds = [0, 1];
    expect(() => assertValidWorld(missingBuildingReference)).toThrow(/building/i);
  });

  test("rejects malformed prices, lots, and ownership", () => {
    const badPrice = m3World().world;
    badPrice.markets[0]!.priceSUSD[0] = -1;
    expect(() => assertValidWorld(badPrice)).toThrow(/price/i);

    const zeroLot = m3World().world;
    zeroLot.markets[0]!.stockLots[0]!.quantity = 0;
    expect(() => assertValidWorld(zeroLot)).toThrow(/quantity|lot/i);

    const badOwner = m3World().world;
    badOwner.markets[0]!.stockLots[0]!.ownerBuildingId = 999;
    expect(() => assertValidWorld(badOwner)).toThrow(/owner|building/i);

    const stateOwned = m3World().world;
    (stateOwned.buildings[0] as unknown as { ownerKind: string }).ownerKind = "state";
    expect(() => assertValidWorld(stateOwned)).toThrow(/private|ownerKind|state-owned/i);
  });

  test("rejects malformed employment assignments", () => {
    const zeroWorkers = m3World().world;
    zeroWorkers.employment[0]!.workers = 0;
    expect(() => assertValidWorld(zeroWorkers)).toThrow(/workers/i);

    const duplicate = m3World().world;
    const first = duplicate.employment[0];
    if (first === undefined) throw new Error("missing assignment");
    duplicate.employment.push({ ...first, id: 99 });
    expect(() => assertValidWorld(duplicate)).toThrow(/duplicate|assignment/i);

    const missingBlock = m3World().world;
    missingBlock.employment[0]!.popBlockId = 999;
    expect(() => assertValidWorld(missingBlock)).toThrow(/popBlock|block/i);

    const missingBuilding = m3World().world;
    missingBuilding.employment[0]!.buildingInstanceId = 999;
    expect(() => assertValidWorld(missingBuilding)).toThrow(/building/i);
  });

  test("preserves the M2.1 aggregate population total", () => {
    const scenario = loadM2WorldAggregate();
    const world: World = createPopulationWorld(scenario, { seed: 20_261_023 });
    expect(populationTotal(world.popBlocks[0]!)).toBe(1_621_287_278);
    expect(world.buildings).toEqual([]);
    expect(world.markets).toEqual([]);
  });
});
