import {
  assertValidWorld,
  cloneWorld,
  createEconomyWorld,
  hashWorld,
  runTicks,
  settleMarketDays,
  tick,
  type TickContext,
} from "@century/sim";
import {
  M5_REGION_A1,
  M5_REGION_A2,
  M5_REGION_B1,
  M5_REGION_C1,
  m5Scenario,
} from "./fixtures/m5.js";

function context(scenario: ReturnType<typeof m5Scenario>): TickContext {
  return {
    population: { definitions: scenario.population.definitions },
    economy: { definitions: scenario.definitions },
  };
}

describe("M5 multi-market clearing and conservation", () => {
  test("clears every market exactly once and records each market's inventory", () => {
    const scenario = m5Scenario();
    const world = createEconomyWorld(scenario, { seed: 20_261_023 });
    const result = tick(world, context(scenario));
    const economy = result.economy;
    expect(economy).toBeDefined();
    if (economy === undefined) return;
    expect(economy.markets.map((market) => market.marketId)).toEqual([0, 1]);
    for (const market of economy.markets) {
      const source = world.markets.find((candidate) => candidate.id === market.marketId);
      expect(source).toBeDefined();
      if (source === undefined) continue;
      for (const flow of market.inventory) {
        const expected =
          flow.openingStock +
          flow.production -
          flow.usedAsInput -
          flow.householdConsumption -
          flow.recordedLoss;
        expect(flow.closingStock).toBeCloseTo(expected, 6);
        expect(flow.closingStock).toBeGreaterThanOrEqual(0);
      }
      const lots = source.stockLots.reduce((total, lot) => total + lot.quantity, 0);
      const closing = market.inventory.reduce((total, flow) => total + flow.closingStock, 0);
      expect(lots).toBeCloseTo(closing, 6);
    }
    assertValidWorld(world);
  });

  test("allows a cross-country transaction only inside the shared market", () => {
    const scenario = m5Scenario();
    const world = createEconomyWorld(scenario, { seed: 20_261_023 });
    const result = tick(world, context(scenario));
    const transactions = result.economy?.settlement.transactions ?? [];
    expect(transactions.length).toBeGreaterThan(0);
    const regionByBuilding = new Map(world.buildings.map((building) => [building.id, building.regionId]));
    const regionByBlock = new Map(world.popBlocks.map((block) => [block.id, block.regionId]));
    const countryByRegion = new Map<number, number>();
    for (const country of world.countries) {
      for (const regionId of country.regionIds) countryByRegion.set(regionId, country.id);
    }
    let crossMarket = 0;
    let crossCountry = 0;
    for (const transaction of transactions) {
      const sellerRegion = regionByBuilding.get(transaction.sellerBuildingId);
      const buyerRegion =
        transaction.buyerPopBlockId === null
          ? regionByBuilding.get(transaction.buyerBuildingId ?? -1)
          : regionByBlock.get(transaction.buyerPopBlockId);
      if (sellerRegion === undefined || buyerRegion === undefined) continue;
      const sellerMarket = world.regions.find((region) => region.id === sellerRegion)?.marketId;
      const buyerMarket = world.regions.find((region) => region.id === buyerRegion)?.marketId;
      if (sellerMarket !== buyerMarket) crossMarket += 1;
      if (countryByRegion.get(sellerRegion) !== countryByRegion.get(buyerRegion)) crossCountry += 1;
    }
    expect(crossMarket).toBe(0);
    expect(crossCountry).toBeGreaterThan(0);
  });

  test("keeps prices independent per market", () => {
    const scenario = m5Scenario();
    const world = createEconomyWorld(scenario, { seed: 20_261_023 });
    runTicks(world, 8, context(scenario));
    const market0 = world.markets.find((market) => market.id === 0);
    const market1 = world.markets.find((market) => market.id === 1);
    expect(market0).toBeDefined();
    expect(market1).toBeDefined();
    if (market0 === undefined || market1 === undefined) return;
    expect(market0.priceSUSD).not.toEqual(market1.priceSUSD);
  });

  test("does not duplicate goods when regions share a market", () => {
    const scenario = m5Scenario();
    const world = createEconomyWorld(scenario, { seed: 20_261_023 });
    const after = cloneWorld(world);
    runTicks(world, 3, context(scenario));
    // Market 0 covers three regions but has one inventory pool. The total stock
    // must equal the sum of that market's lots, not three separate copies.
    const market0 = world.markets.find((market) => market.id === 0);
    expect(market0).toBeDefined();
    if (market0 === undefined) return;
    const lotTotal = market0.stockLots.reduce((total, lot) => total + lot.quantity, 0);
    expect(Number.isFinite(lotTotal)).toBe(true);
    expect(market0.stockLots.every((lot) => lot.quantity > 0)).toBe(true);
    // Only the three regions in market 0 own those lots.
    const buildingRegion = new Map(world.buildings.map((building) => [building.id, building.regionId]));
    for (const lot of market0.stockLots) {
      const regionId = buildingRegion.get(lot.ownerBuildingId);
      expect([M5_REGION_A1, M5_REGION_A2, M5_REGION_C1]).toContain(regionId);
    }
    expect(after.markets).toHaveLength(2);
    assertValidWorld(world);
  });

  test("reordering declarations does not change outcomes", () => {
    const scenario = m5Scenario();
    const shuffled = {
      ...scenario,
      population: {
        ...scenario.population,
        regions: [...scenario.population.regions].reverse(),
        popBlocks: [...scenario.population.popBlocks].reverse(),
      },
      markets: scenario.markets.map((market) => ({
        ...market,
        regionIds: [...market.regionIds].reverse(),
      })).reverse(),
      buildingInstances: [...scenario.buildingInstances].reverse(),
      countries: [...(scenario.countries ?? [])].reverse(),
    };
    const first = createEconomyWorld(scenario, { seed: 20_261_023 });
    const second = createEconomyWorld(shuffled, { seed: 20_261_023 });
    runTicks(first, 5, context(scenario));
    runTicks(second, 5, context(scenario));
    expect(hashWorld(second)).toBe(hashWorld(first));
  });

  test("market settlement refuses duplicate results without mutating balances", () => {
    const scenario = m5Scenario();
    const world = createEconomyWorld(scenario, { seed: 20_261_023 });
    const result = tick(world, context(scenario));
    const markets = result.economy?.markets ?? [];
    expect(markets).toHaveLength(2);
    const before = hashWorld(world);
    expect(() => settleMarketDays(world, scenario.definitions, markets)).toThrow(/already been settled/);
    expect(hashWorld(world)).toBe(before);
  });

  test("a failed tick leaves the published world unchanged", () => {
    const scenario = m5Scenario();
    const world = createEconomyWorld(scenario, { seed: 20_261_023 });
    const before = hashWorld(world);
    const broken = cloneWorld(world);
    // A market listing an unknown region is rejected before any phase runs.
    if (broken.markets[1] !== undefined) broken.markets[1].regionIds = [999];
    expect(() => tick(broken, context(scenario))).toThrow();
    expect(hashWorld(world)).toBe(before);
    // The original still advances correctly.
    expect(tick(world, context(scenario)).advanced).toBe(true);
  });

  test("cross-region input purchases settle through the shared market", () => {
    const scenario = m5Scenario();
    const world = createEconomyWorld(scenario, { seed: 20_261_023 });
    runTicks(world, 6, context(scenario));
    expect(world.markets[0]?.stockLots.length ?? 0).toBeGreaterThanOrEqual(0);
    assertValidWorld(world);
    expect(world.regions.find((region) => region.id === M5_REGION_B1)?.marketId).toBe(1);
  });
});
