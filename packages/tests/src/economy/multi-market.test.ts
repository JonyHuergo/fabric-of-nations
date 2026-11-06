import {
  assertAccountingIdentity,
  assertValidEmploymentState,
  assertValidWorld,
  cloneWorld,
  createEconomyWorld,
  designatedCashTotal,
  hashWorld,
  runMarketDay,
  runTicks,
  settleMarketDay,
  settleMarketDays,
  tick,
  type MarketDayResult,
  type TickContext,
  countryProvinceIds,
} from "@century/sim";
import {
  M5_REGION_A1,
  M5_REGION_A2,
  M5_REGION_B1,
  M5_REGION_C1,
  m5Scenario,
} from "../fixtures/m5.js";

function context(scenario: ReturnType<typeof m5Scenario>): TickContext {
  return {
    population: { definitions: scenario.population.definitions },
    economy: { definitions: scenario.definitions },
  };
}

/** One demand-free market-day result per market, for settlement-only tests. */
function emptyMarketDays(
  scenario: ReturnType<typeof m5Scenario>,
  world: ReturnType<typeof createEconomyWorld>,
): MarketDayResult[] {
  return world.markets.map((market) =>
    runMarketDay(world, scenario.definitions, {
      dayIndex: world.dayIndex,
      marketId: market.id,
      needs: scenario.population.definitions.needs,
      householdDemands: [],
      productionDemands: [],
    }),
  );
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
    const provinceByBuilding = new Map(world.buildings.map((building) => [building.id, building.provinceId]));
    const provinceByBlock = new Map(world.popBlocks.map((block) => [block.id, block.provinceId]));
    const countryByProvince = new Map<number, number>();
    for (const country of world.countries) {
      for (const provinceId of countryProvinceIds(world, country.id)) countryByProvince.set(provinceId, country.id);
    }
    let crossMarket = 0;
    let crossCountry = 0;
    for (const transaction of transactions) {
      const sellerProvince = provinceByBuilding.get(transaction.sellerBuildingId);
      const buyerProvince =
        transaction.buyerPopBlockId === null
          ? provinceByBuilding.get(transaction.buyerBuildingId ?? -1)
          : provinceByBlock.get(transaction.buyerPopBlockId);
      if (sellerProvince === undefined || buyerProvince === undefined) continue;
      const sellerMarket = world.provinceEconomies.find((province) => province.id === sellerProvince)?.marketId;
      const buyerMarket = world.provinceEconomies.find((province) => province.id === buyerProvince)?.marketId;
      if (sellerMarket !== buyerMarket) crossMarket += 1;
      if (countryByProvince.get(sellerProvince) !== countryByProvince.get(buyerProvince)) crossCountry += 1;
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
    expect(market0.priceRUSD).not.toEqual(market1.priceRUSD);
  });

  test("does not duplicate goods when provinces share a market", () => {
    const scenario = m5Scenario();
    const world = createEconomyWorld(scenario, { seed: 20_261_023 });
    const after = cloneWorld(world);
    const beforeHash = hashWorld(world);
    runTicks(world, 3, context(scenario));
    expect(hashWorld(after)).toBe(beforeHash);
    // Market 0 covers three provinces but has one inventory pool. The total stock
    // must equal the sum of that market's lots, not three separate copies.
    const market0 = world.markets.find((market) => market.id === 0);
    expect(market0).toBeDefined();
    if (market0 === undefined) return;
    const lotTotal = market0.stockLots.reduce((total, lot) => total + lot.quantity, 0);
    expect(Number.isFinite(lotTotal)).toBe(true);
    expect(market0.stockLots.every((lot) => lot.quantity > 0)).toBe(true);
    // Only the three provinces in market 0 own those lots.
    const buildingProvince = new Map(world.buildings.map((building) => [building.id, building.provinceId]));
    for (const lot of market0.stockLots) {
      const provinceId = buildingProvince.get(lot.ownerBuildingId);
      expect([M5_REGION_A1, M5_REGION_A2, M5_REGION_C1]).toContain(provinceId);
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
        provinceEconomies: [...scenario.population.provinceEconomies].reverse(),
        popBlocks: [...scenario.population.popBlocks].reverse(),
      },
      markets: scenario.markets.map((market) => ({
        ...market,
        provinceIds: [...market.provinceIds].reverse(),
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
    // A province referencing an unknown market is rejected before any phase runs.
    if (broken.provinceEconomies[0] !== undefined) broken.provinceEconomies[0].marketId = 999;
    expect(() => tick(broken, context(scenario))).toThrow();
    expect(hashWorld(world)).toBe(before);
    // The original still advances correctly.
    expect(tick(world, context(scenario)).advanced).toBe(true);
  });

  test("cross-province purchases settle through the shared market", () => {
    const scenario = m5Scenario();
    const world = createEconomyWorld(scenario, { seed: 20_261_023 });
    const first = tick(world, context(scenario));
    runTicks(world, 5, context(scenario));
    const transactions = first.economy?.settlement.transactions ?? [];
    assertValidWorld(world);
    expect(world.provinceEconomies.find((province) => province.id === M5_REGION_B1)?.marketId).toBe(1);
    const buildingProvince = new Map(
      world.buildings.map((building) => [building.id, building.provinceId]),
    );
    const blockProvince = new Map(world.popBlocks.map((block) => [block.id, block.provinceId]));
    const crossProvince = transactions.some((transaction) => {
      const sellerProvince = buildingProvince.get(transaction.sellerBuildingId);
      const buyerProvince =
        transaction.buyerPopBlockId !== null
          ? blockProvince.get(transaction.buyerPopBlockId)
          : transaction.buyerBuildingId !== null
            ? buildingProvince.get(transaction.buyerBuildingId)
            : undefined;
      return (
        sellerProvince !== undefined &&
        buyerProvince !== undefined &&
        sellerProvince !== buyerProvince
      );
    });
    expect(crossProvince).toBe(true);
    expect(world.markets[0]?.stockLots.length ?? 0).toBeGreaterThan(0);
    assertAccountingIdentity(world.finance);
  });

  test("settlement requires every market and pays wages/upkeep once per day", () => {
    const scenario = m5Scenario();
    const world = createEconomyWorld(scenario, { seed: 20_261_023 });
    tick(world, context(scenario)); // day 0: creates valid employment
    const day = world.dayIndex;
    const results = emptyMarketDays(scenario, world);
    expect(results).toHaveLength(world.markets.length);
    const before = hashWorld(world);

    expect(() => settleMarketDays(world, scenario.definitions, [results[0]!])).toThrow(
      /every world market/,
    );
    expect(() => settleMarketDay(world, scenario.definitions, results[0]!)).toThrow(
      /single-market/,
    );
    expect(hashWorld(world)).toBe(before);

    const settlement = settleMarketDays(world, scenario.definitions, results);
    expect(settlement.dayIndex).toBe(day);
    expect(settlement.marketIds).toEqual([0, 1]);
    expect(results.every((result) => result.settled)).toBe(true);

    const wageBuildingIds = settlement.wages.map((wage) => wage.buildingId);
    const upkeepBuildingIds = settlement.upkeep.map((upkeep) => upkeep.buildingId);
    expect(wageBuildingIds.length).toBeGreaterThan(0);
    expect(new Set(wageBuildingIds).size).toBe(wageBuildingIds.length);
    expect(upkeepBuildingIds.length).toBeGreaterThan(0);
    expect(new Set(upkeepBuildingIds).size).toBe(upkeepBuildingIds.length);
    expect(new Set(settlement.producers.map((producer) => producer.buildingId)).size).toBe(
      settlement.producers.length,
    );
    expect(settlement.totals.wagesPaidRUSD).toBeCloseTo(
      settlement.wages.reduce((total, wage) => total + wage.paidRUSD, 0),
      8,
    );
    expect(settlement.totals.upkeepPaidRUSD).toBeCloseTo(
      settlement.upkeep.reduce((total, upkeep) => total + upkeep.paidRUSD, 0),
      8,
    );
    const wagesPostings = world.finance.postings.filter(
      (posting) => posting.transactionKind === "wages" && posting.dayIndex === day,
    );
    const upkeepPostings = world.finance.postings.filter(
      (posting) => posting.transactionKind === "upkeep" && posting.dayIndex === day,
    );
    expect(wagesPostings).toHaveLength(settlement.wages.filter((wage) => wage.paidRUSD > 0).length);
    expect(upkeepPostings).toHaveLength(settlement.upkeep.filter((upkeep) => upkeep.paidRUSD > 0).length);
    assertAccountingIdentity(world.finance);
    assertValidEmploymentState(world, scenario.definitions);
    assertValidWorld(world);
  });

  test("a failed multi-market settlement leaves finance unchanged", () => {
    const scenario = m5Scenario();
    const world = createEconomyWorld(scenario, { seed: 20_261_023 });
    // Build unsettled market days before removing the account so no persisted
    // posting references it. Settlement then fails inside the upkeep phase after
    // market and wage work has already been staged.
    const results = emptyMarketDays(scenario, world);
    world.finance.accounts = world.finance.accounts.filter(
      (account) => account.subtype !== "system-reserve-cash",
    );
    const before = JSON.stringify(world.finance);
    const cashBefore = designatedCashTotal(world.finance);
    expect(() => settleMarketDays(world, scenario.definitions, results)).toThrow(
      /system-reserve/,
    );
    expect(JSON.stringify(world.finance)).toBe(before);
    expect(designatedCashTotal(world.finance)).toBe(cashBefore);
    expect(results.every((result) => !result.settled)).toBe(true);
  });
});
