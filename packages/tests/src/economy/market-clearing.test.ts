import {
  createEconomyWorld,
  designatedCashTotal,
  hashWorld,
  runMarketDay,
  type MarketDayInput,
} from "@century/sim";
import {
  CLOTHING_ID,
  FOOD_ID,
  GRAIN_ID,
  TEXTILES_ID,
  household,
  marketInput,
  marketScenario,
  productionDemand,
} from "../fixtures/m3d.js";
import {
  setBuildingJobs,
  setBuildingStorage,
} from "../fixtures/m3c.js";

function demandFor(
  result: ReturnType<typeof runMarketDay>,
  popBlockId: number,
  tier: 1 | 3 | 6,
  goodId: number,
) {
  const found = result.householdDemands.find(
    (demand) =>
      demand.popBlockId === popBlockId && demand.tier === tier && demand.goodId === goodId,
  );
  if (found === undefined) throw new Error("missing household demand result");
  return found;
}

function inputFor(
  result: ReturnType<typeof runMarketDay>,
  buildingId: number,
  goodId: number,
) {
  const found = result.productionDemands.find(
    (demand) => demand.buyerBuildingId === buildingId && demand.goodId === goodId,
  );
  if (found === undefined) throw new Error("missing production demand result");
  return found;
}

function produceFarmAtTen(scenario: ReturnType<typeof marketScenario>): void {
  const farm = scenario.definitions.buildings.find((definition) => definition.id === 0);
  if (farm === undefined) throw new Error("missing farm");
  farm.referenceThroughputPerDayAtLevelOne = 10;
  setBuildingJobs(scenario, 0, [{ professionId: 0, workersPerThroughputUnit: 10 }]);
}

describe("M3d smoke", () => {
  test("fulfills a funded household demand at a balanced price", () => {
    const scenario = marketScenario({
      produce: false,
      lots: [{ goodId: GRAIN_ID, ownerBuildingId: 0, quantity: 10 }],
    });
    const world = createEconomyWorld(scenario, { seed: 1 });
    const before = world.markets[0]!.priceRUSD[GRAIN_ID]!;
    const result = runMarketDay(
      world,
      scenario.definitions,
      marketInput(scenario, world, [household(0, 1, GRAIN_ID, 10)]),
    );
    expect(result.householdDemands[0]?.fulfilledQuantity).toBeCloseTo(10, 9);
    expect(result.inventory[GRAIN_ID]?.closingStock).toBeCloseTo(0, 9);
    expect(result.updatedPrices[GRAIN_ID]).toBeCloseTo(before, 12);
    expect(result.pendingTransactions).toHaveLength(1);
  });

  test("allocates proportionally when a tier is short", () => {
    const scenario = marketScenario({
      produce: false,
      lots: [{ goodId: GRAIN_ID, ownerBuildingId: 0, quantity: 10 }],
    });
    const world = createEconomyWorld(scenario, { seed: 1 });
    const result = runMarketDay(
      world,
      scenario.definitions,
      marketInput(scenario, world, [
        household(0, 1, GRAIN_ID, 6),
        household(1, 1, GRAIN_ID, 6),
      ]),
    );
    expect(result.householdDemands.map((demand) => demand.fulfilledQuantity)).toEqual([5, 5]);
    expect(result.inventory[GRAIN_ID]?.closingStock).toBeCloseTo(0, 9);
  });

  test("serves critical production input before remaining input", () => {
    const scenario = marketScenario({
      produce: false,
      lots: [{ goodId: GRAIN_ID, ownerBuildingId: 0, quantity: 10 }],
    });
    const world = createEconomyWorld(scenario, { seed: 1 });
    const result = runMarketDay(
      world,
      scenario.definitions,
      marketInput(
        scenario,
        world,
        [],
        [productionDemand(4, 2, GRAIN_ID, 10), productionDemand(5, 5, GRAIN_ID, 10)],
      ),
    );
    expect(inputFor(result, 4, GRAIN_ID).reservedQuantity).toBeCloseTo(10, 9);
    expect(inputFor(result, 5, GRAIN_ID).reservedQuantity).toBe(0);
  });
});

describe("M3d priority and household eligibility", () => {
  test("an unfunded subsistence demand does not block funded critical input or basic demand", () => {
    const scenario = marketScenario({
      produce: false,
      lots: [
        { goodId: GRAIN_ID, ownerBuildingId: 0, quantity: 10 },
        { goodId: CLOTHING_ID, ownerBuildingId: 6, quantity: 10 },
      ],
    });
    const world = createEconomyWorld(scenario, { seed: 1 });
    const result = runMarketDay(
      world,
      scenario.definitions,
      marketInput(
        scenario,
        world,
        [household(0, 1, GRAIN_ID, 10, 0), household(1, 3, CLOTHING_ID, 2)],
        [productionDemand(4, 2, GRAIN_ID, 10)],
      ),
    );
    expect(demandFor(result, 0, 1, GRAIN_ID).fulfilledQuantity).toBe(0);
    expect(inputFor(result, 4, GRAIN_ID).reservedQuantity).toBeCloseTo(10, 9);
    expect(demandFor(result, 1, 3, CLOTHING_ID).fulfilledQuantity).toBeCloseTo(2, 9);
  });

  test("a household whose lower tier is unmet cannot buy its higher tiers", () => {
    const scenario = marketScenario({
      produce: false,
      lots: [
        { goodId: GRAIN_ID, ownerBuildingId: 0, quantity: 5 },
        { goodId: FOOD_ID, ownerBuildingId: 4, quantity: 10 },
        { goodId: CLOTHING_ID, ownerBuildingId: 6, quantity: 10 },
        { goodId: TEXTILES_ID, ownerBuildingId: 5, quantity: 10 },
      ],
    });
    const world = createEconomyWorld(scenario, { seed: 1 });
    const result = runMarketDay(
      world,
      scenario.definitions,
      marketInput(scenario, world, [
        household(0, 1, GRAIN_ID, 10),
        household(0, 1, FOOD_ID, 10),
        household(0, 3, CLOTHING_ID, 5),
        household(0, 6, TEXTILES_ID, 5),
      ]),
    );
    expect(demandFor(result, 0, 1, GRAIN_ID).fulfilledQuantity).toBeCloseTo(5, 9);
    expect(demandFor(result, 0, 1, FOOD_ID).fulfilledQuantity).toBeCloseTo(10, 9);
    expect(demandFor(result, 0, 3, CLOTHING_ID).fulfilledQuantity).toBe(0);
    expect(demandFor(result, 0, 6, TEXTILES_ID).fulfilledQuantity).toBe(0);
  });

  test("Pass B unlocks a higher tier when same-day production fills a lower tier", () => {
    const scenario = marketScenario({
      lots: [{ goodId: CLOTHING_ID, ownerBuildingId: 6, quantity: 5 }],
    });
    produceFarmAtTen(scenario);
    const world = createEconomyWorld(scenario, { seed: 1 });
    const result = runMarketDay(
      world,
      scenario.definitions,
      marketInput(scenario, world, [
        household(0, 1, GRAIN_ID, 10),
        household(0, 3, CLOTHING_ID, 5),
      ]),
    );
    // No opening grain: Pass A cannot fill the subsistence tier, but the farm
    // produces grain during the same market day. Pass B fills subsistence and
    // must then unlock basic clothing rather than keeping it frozen ineligible.
    expect(demandFor(result, 0, 1, GRAIN_ID).fulfilledQuantity).toBeCloseTo(10, 9);
    expect(demandFor(result, 0, 3, CLOTHING_ID).fulfilledQuantity).toBeCloseTo(5, 9);
  });

  test("different households can have different funded quantities", () => {
    const scenario = marketScenario({
      produce: false,
      lots: [{ goodId: GRAIN_ID, ownerBuildingId: 0, quantity: 6 }],
    });
    const world = createEconomyWorld(scenario, { seed: 1 });
    const result = runMarketDay(
      world,
      scenario.definitions,
      marketInput(scenario, world, [
        household(0, 1, GRAIN_ID, 4),
        household(1, 1, GRAIN_ID, 2),
      ]),
    );
    expect(demandFor(result, 0, 1, GRAIN_ID).fulfilledQuantity).toBeCloseTo(4, 9);
    expect(demandFor(result, 1, 1, GRAIN_ID).fulfilledQuantity).toBeCloseTo(2, 9);
  });

  test("Pass B keeps lower household tiers blocked when critical input remains unmet", () => {
    const scenario = marketScenario({
      lots: [{ goodId: GRAIN_ID, ownerBuildingId: 0, quantity: 5 }],
    });
    const world = createEconomyWorld(scenario, { seed: 1 });
    const result = runMarketDay(
      world,
      scenario.definitions,
      marketInput(
        scenario,
        world,
        [household(1, 3, GRAIN_ID, 5)],
        [productionDemand(4, 2, GRAIN_ID, 10)],
      ),
    );
    expect(inputFor(result, 4, GRAIN_ID).reservedQuantity).toBeCloseTo(5, 9);
    expect(inputFor(result, 4, GRAIN_ID).usedQuantity).toBeCloseTo(5, 9);
    expect(demandFor(result, 1, 3, GRAIN_ID).passAFulfilled).toBe(0);
    expect(demandFor(result, 1, 3, GRAIN_ID).passBFulfilled).toBe(0);
    expect(demandFor(result, 1, 3, GRAIN_ID).fulfilledQuantity).toBe(0);
  });

  test("Pass B keeps comfort demand blocked when remaining input remains unmet", () => {
    const scenario = marketScenario({
      lots: [{ goodId: GRAIN_ID, ownerBuildingId: 0, quantity: 5 }],
    });
    const world = createEconomyWorld(scenario, { seed: 1 });
    const result = runMarketDay(
      world,
      scenario.definitions,
      marketInput(
        scenario,
        world,
        [household(1, 6, GRAIN_ID, 5)],
        [productionDemand(5, 5, GRAIN_ID, 10)],
      ),
    );
    expect(inputFor(result, 5, GRAIN_ID).reservedQuantity).toBeCloseTo(5, 9);
    expect(demandFor(result, 1, 6, GRAIN_ID).passAFulfilled).toBe(0);
    expect(demandFor(result, 1, 6, GRAIN_ID).passBFulfilled).toBe(0);
    expect(demandFor(result, 1, 6, GRAIN_ID).fulfilledQuantity).toBe(0);
  });

  test("critical and remaining input tiers are not interchangeable", () => {
    const scenario = marketScenario({
      produce: false,
      lots: [{ goodId: GRAIN_ID, ownerBuildingId: 0, quantity: 8 }],
    });
    const world = createEconomyWorld(scenario, { seed: 1 });
    const result = runMarketDay(
      world,
      scenario.definitions,
      marketInput(
        scenario,
        world,
        [],
        [productionDemand(5, 5, GRAIN_ID, 8), productionDemand(4, 2, GRAIN_ID, 8)],
      ),
    );
    expect(inputFor(result, 4, GRAIN_ID).reservedQuantity).toBeCloseTo(8, 9);
    expect(inputFor(result, 5, GRAIN_ID).reservedQuantity).toBe(0);
  });
});

describe("M3d production handoff and two-pass inventory", () => {
  test("production consumes only used input and releases the rest", () => {
    const scenario = marketScenario({
      lots: [{ goodId: GRAIN_ID, ownerBuildingId: 0, quantity: 10 }],
    });
    const world = createEconomyWorld(scenario, { seed: 1 });
    const result = runMarketDay(
      world,
      scenario.definitions,
      marketInput(scenario, world, [], [productionDemand(4, 2, GRAIN_ID, 10)]),
    );
    expect(inputFor(result, 4, GRAIN_ID)).toMatchObject({
      reservedQuantity: 10,
      usedQuantity: 5,
      releasedQuantity: 5,
    });
    expect(result.inventory[GRAIN_ID]?.closingStock).toBeCloseTo(9.5, 9);
    expect(result.pendingTransactions).toHaveLength(1);
    expect(result.pendingTransactions[0]?.quantity).toBeCloseTo(5, 9);
  });

  test("Pass B cannot double-count new output when opening stock is zero", () => {
    const scenario = marketScenario({ produce: true, lots: [] });
    setBuildingJobs(scenario, 0, [{ professionId: 0, workersPerThroughputUnit: 45 }]);
    const world = createEconomyWorld(scenario, { seed: 1 });
    const result = runMarketDay(
      world,
      scenario.definitions,
      marketInput(scenario, world, [household(0, 1, GRAIN_ID, 15)]),
    );
    expect(demandFor(result, 0, 1, GRAIN_ID).passAFulfilled).toBe(0);
    expect(demandFor(result, 0, 1, GRAIN_ID).passBFulfilled).toBeCloseTo(10, 9);
    expect(demandFor(result, 0, 1, GRAIN_ID).fulfilledQuantity).toBeCloseTo(10, 9);
    expect(result.production.inventory[GRAIN_ID]?.production).toBeCloseTo(10, 9);
    expect(result.production.inventory[GRAIN_ID]?.closingStock).toBeCloseTo(10, 9);
    expect(result.inventory[GRAIN_ID]?.closingStock).toBeCloseTo(0, 9);
  });

  test("Pass B uses current stock after partial input use, not a pre-output snapshot", () => {
    const scenario = marketScenario({
      lots: [{ goodId: GRAIN_ID, ownerBuildingId: 0, quantity: 10 }],
    });
    const world = createEconomyWorld(scenario, { seed: 1 });
    const result = runMarketDay(
      world,
      scenario.definitions,
      marketInput(
        scenario,
        world,
        [household(0, 1, GRAIN_ID, 4), household(1, 3, GRAIN_ID, 10)],
        [productionDemand(4, 2, GRAIN_ID, 10, 6)],
      ),
    );
    const input = inputFor(result, 4, GRAIN_ID);
    expect(input.reservedQuantity).toBeCloseTo(6, 9);
    expect(input.usedQuantity).toBeCloseTo(5, 9);
    expect(input.releasedQuantity).toBeCloseTo(1, 9);
    expect(demandFor(result, 0, 1, GRAIN_ID).passAFulfilled).toBeCloseTo(4, 9);
    expect(demandFor(result, 1, 3, GRAIN_ID).passAFulfilled).toBe(0);
    expect(demandFor(result, 1, 3, GRAIN_ID).passBFulfilled).toBeCloseTo(5.5, 9);
    expect(demandFor(result, 1, 3, GRAIN_ID).fulfilledQuantity).toBeCloseTo(5.5, 9);
    expect(result.production.inventory[GRAIN_ID]?.closingStock).toBeCloseTo(9.5, 9);
    expect(result.inventory[GRAIN_ID]?.closingStock).toBeCloseTo(0, 9);
    const householdFulfilled =
      demandFor(result, 0, 1, GRAIN_ID).fulfilledQuantity +
      demandFor(result, 1, 3, GRAIN_ID).fulfilledQuantity;
    expect(householdFulfilled).toBeCloseTo(9.5, 9);
    expect(result.production.inventory[GRAIN_ID]?.closingStock).toBeGreaterThanOrEqual(
      householdFulfilled - 1e-9,
    );
  });

  test("Pass B can spend new output produced the same day", () => {
    const scenario = marketScenario({
      lots: [{ goodId: GRAIN_ID, ownerBuildingId: 0, quantity: 10 }],
    });
    const world = createEconomyWorld(scenario, { seed: 1 });
    const result = runMarketDay(
      world,
      scenario.definitions,
      marketInput(scenario, world, [household(0, 1, GRAIN_ID, 15)]),
    );
    expect(demandFor(result, 0, 1, GRAIN_ID).passAFulfilled).toBeCloseTo(10, 9);
    expect(demandFor(result, 0, 1, GRAIN_ID).passBFulfilled).toBeCloseTo(4.5, 9);
    expect(demandFor(result, 0, 1, GRAIN_ID).fulfilledQuantity).toBeCloseTo(14.5, 9);
    expect(result.inventory[GRAIN_ID]?.closingStock).toBeCloseTo(0, 9);
  });

  test("new output cannot be used as a same-day production input", () => {
    const scenario = marketScenario({
      lots: [{ goodId: GRAIN_ID, ownerBuildingId: 0, quantity: 10 }],
    });
    const processor = scenario.definitions.buildings.find((definition) => definition.id === 4);
    if (processor === undefined) throw new Error("missing processor");
    processor.referenceThroughputPerDayAtLevelOne = 3;
    setBuildingJobs(scenario, 4, [{ professionId: 1, workersPerThroughputUnit: 100 / 3 }]);
    scenario.employment = scenario.employment
      .filter((assignment) => assignment.buildingInstanceId !== 5)
      .map((assignment) =>
        assignment.buildingInstanceId === 4 ? { ...assignment, workers: 100 } : assignment,
      );
    const world = createEconomyWorld(scenario, { seed: 1 });
    const result = runMarketDay(
      world,
      scenario.definitions,
      marketInput(scenario, world, [], [productionDemand(4, 2, GRAIN_ID, 15)]),
    );
    const processorResult = result.production.buildings.find(
      (building) => building.buildingId === 4,
    );
    expect(processorResult?.capacityTU).toBeCloseTo(3, 9);
    expect(processorResult?.executedTU).toBe(2);
    expect(inputFor(result, 4, GRAIN_ID).usedQuantity).toBeCloseTo(10, 9);
    expect(result.inventory[GRAIN_ID]?.closingStock).toBeCloseTo(4.5, 9);
  });

  test("household and input reservations share a seller lot without double booking", () => {
    const scenario = marketScenario({
      lots: [{ goodId: GRAIN_ID, ownerBuildingId: 0, quantity: 10 }],
    });
    const world = createEconomyWorld(scenario, { seed: 1 });
    const result = runMarketDay(
      world,
      scenario.definitions,
      marketInput(
        scenario,
        world,
        [household(0, 1, GRAIN_ID, 4)],
        [productionDemand(4, 2, GRAIN_ID, 4)],
      ),
    );
    expect(demandFor(result, 0, 1, GRAIN_ID).fulfilledQuantity).toBeCloseTo(4, 9);
    expect(inputFor(result, 4, GRAIN_ID).usedQuantity).toBeCloseTo(4, 9);
    const reservedByLot = new Map<string, number>();
    for (const reservation of result.reservations) {
      const key = `${String(reservation.goodId)}:${String(reservation.sellerBuildingId)}`;
      reservedByLot.set(key, (reservedByLot.get(key) ?? 0) + reservation.quantity);
    }
    for (const [key, quantity] of reservedByLot) {
      const [goodText, ownerText] = key.split(":");
      const opening = scenario.markets[0]!.stockLots.find(
        (lot) => lot.goodId === Number(goodText) && lot.ownerBuildingId === Number(ownerText),
      )?.quantity;
      expect(opening).toBeDefined();
      expect(quantity).toBeLessThanOrEqual((opening ?? 0) + 1e-9);
    }
    expect(result.inventory[GRAIN_ID]?.closingStock).toBeCloseTo(6.5, 9);
  });

  test("aggregate household and input reservations never exceed opening seller lots", () => {
    const scenario = marketScenario({
      produce: false,
      lots: [
        { goodId: GRAIN_ID, ownerBuildingId: 0, quantity: 5 },
        { goodId: GRAIN_ID, ownerBuildingId: 1, quantity: 5 },
      ],
    });
    const world = createEconomyWorld(scenario, { seed: 1 });
    const result = runMarketDay(
      world,
      scenario.definitions,
      marketInput(
        scenario,
        world,
        [household(0, 1, GRAIN_ID, 4), household(1, 1, GRAIN_ID, 2)],
        [productionDemand(4, 2, GRAIN_ID, 4), productionDemand(5, 5, GRAIN_ID, 3)],
      ),
    );
    const reservedByLot = new Map<string, number>();
    for (const reservation of result.reservations) {
      const key = `${String(reservation.goodId)}:${String(reservation.sellerBuildingId)}`;
      reservedByLot.set(key, (reservedByLot.get(key) ?? 0) + reservation.quantity);
    }
    for (const [key, quantity] of reservedByLot) {
      const [goodText, ownerText] = key.split(":");
      const opening = scenario.markets[0]!.stockLots.find(
        (lot) => lot.goodId === Number(goodText) && lot.ownerBuildingId === Number(ownerText),
      )?.quantity;
      expect(opening).toBeDefined();
      expect(quantity).toBeLessThanOrEqual((opening ?? 0) + 1e-9);
    }
    const flow = result.inventory[GRAIN_ID]!;
    expect(
      flow.openingStock +
        flow.production -
        flow.usedAsInput -
        flow.householdConsumption -
        flow.recordedLoss,
    ).toBeCloseTo(flow.closingStock, 9);
  });

  test("final overflow cannot destroy fulfilled household goods", () => {
    const scenario = marketScenario({
      lots: [{ goodId: GRAIN_ID, ownerBuildingId: 0, quantity: 45 }],
    });
    produceFarmAtTen(scenario);
    setBuildingStorage(scenario, 7, [{ goodId: GRAIN_ID, quantity: 50 }]);
    const world = createEconomyWorld(scenario, { seed: 1 });
    const result = runMarketDay(
      world,
      scenario.definitions,
      marketInput(scenario, world, [household(0, 1, GRAIN_ID, 10)]),
    );
    expect(demandFor(result, 0, 1, GRAIN_ID).fulfilledQuantity).toBeCloseTo(10, 9);
    expect(result.production.inventory[GRAIN_ID]?.closingStock).toBeCloseTo(90, 9);
    expect(result.inventory[GRAIN_ID]?.closingStock).toBeCloseTo(50, 9);
    expect(result.inventory[GRAIN_ID]?.recordedLoss).toBeCloseTo(30, 9);
    expect(result.overflowLosses.reduce((sum, loss) => sum + loss.quantity, 0)).toBeCloseTo(30, 9);
  });

  test("seller attribution reconciles across multiple lots", () => {
    const scenario = marketScenario({
      produce: false,
      lots: [
        { goodId: GRAIN_ID, ownerBuildingId: 0, quantity: 5 },
        { goodId: GRAIN_ID, ownerBuildingId: 1, quantity: 5 },
      ],
    });
    const world = createEconomyWorld(scenario, { seed: 1 });
    const result = runMarketDay(
      world,
      scenario.definitions,
      marketInput(scenario, world, [household(0, 1, GRAIN_ID, 10)]),
    );
    expect(result.householdPurchases).toHaveLength(2);
    expect(result.householdPurchases.map((purchase) => purchase.quantity)).toEqual([5, 5]);
    expect(result.householdPurchases.map((purchase) => purchase.sellerBuildingId)).toEqual([0, 1]);
  });
});

describe("M3d price updates", () => {
  function priceCase(lots: readonly { goodId: number; ownerBuildingId: number; quantity: number }[], demand: number) {
    const scenario = marketScenario({ produce: false, lots });
    const world = createEconomyWorld(scenario, { seed: 1 });
    const result = runMarketDay(
      world,
      scenario.definitions,
      marketInput(
        scenario,
        world,
        demand > 0 ? [household(0, 1, GRAIN_ID, demand)] : [],
      ),
    );
    return { result, world, scenario };
  }

  test("shortage raises, surplus lowers, and balance holds", () => {
    const shortage = priceCase([{ goodId: GRAIN_ID, ownerBuildingId: 0, quantity: 5 }], 10);
    expect(shortage.result.priceUpdates[GRAIN_ID]?.newPriceRUSD).toBeCloseTo(0.0525, 12);
    const surplus = priceCase([{ goodId: GRAIN_ID, ownerBuildingId: 0, quantity: 10 }], 5);
    expect(surplus.result.priceUpdates[GRAIN_ID]?.newPriceRUSD).toBeCloseTo(0.0475, 12);
    const balanced = priceCase([{ goodId: GRAIN_ID, ownerBuildingId: 0, quantity: 10 }], 10);
    expect(balanced.result.priceUpdates[GRAIN_ID]?.newPriceRUSD).toBeCloseTo(0.05, 12);
  });

  test("zero demand and zero supply have explicit behavior", () => {
    const zeroDemand = priceCase([{ goodId: GRAIN_ID, ownerBuildingId: 0, quantity: 10 }], 0);
    expect(zeroDemand.result.priceUpdates[GRAIN_ID]?.newPriceRUSD).toBeCloseTo(0.0475, 12);
    const zeroSupply = priceCase([], 10);
    expect(zeroSupply.result.priceUpdates[GRAIN_ID]?.newPriceRUSD).toBeCloseTo(0.0525, 12);
    const zeroBoth = priceCase([], 0);
    expect(zeroBoth.result.priceUpdates[GRAIN_ID]?.newPriceRUSD).toBeCloseTo(0.05, 12);
  });

  test("same-day transactions use the opening price and updates apply afterward", () => {
    const scenario = marketScenario({
      produce: false,
      lots: [{ goodId: GRAIN_ID, ownerBuildingId: 0, quantity: 5 }],
    });
    const world = createEconomyWorld(scenario, { seed: 1 });
    const day0 = runMarketDay(
      world,
      scenario.definitions,
      marketInput(scenario, world, [household(0, 1, GRAIN_ID, 10)]),
    );
    expect(day0.pendingTransactions[0]?.unitPriceRUSD).toBeCloseTo(0.05, 12);
    expect(day0.updatedPrices[GRAIN_ID]).toBeCloseTo(0.0525, 12);

    world.dayIndex = 1;
    world.markets[0]!.stockLots = [{ goodId: GRAIN_ID, ownerBuildingId: 0, quantity: 5 }];
    const day1 = runMarketDay(
      world,
      scenario.definitions,
      marketInput(scenario, world, [household(0, 1, GRAIN_ID, 1)]),
    );
    expect(day1.openingPrices[GRAIN_ID]).toBeCloseTo(0.0525, 12);
    expect(day1.pendingTransactions[0]?.unitPriceRUSD).toBeCloseTo(0.0525, 12);
  });

  test("daily price changes stay within the configured bound and price bounds", () => {
    const scenario = marketScenario({ produce: false, lots: [] });
    const world = createEconomyWorld(scenario, { seed: 1 });
    let previous = world.markets[0]!.priceRUSD[GRAIN_ID]!;
    for (let day = 0; day < 100; day += 1) {
      world.dayIndex = day;
      const result = runMarketDay(
        world,
        scenario.definitions,
        marketInput(scenario, world, [household(0, 1, GRAIN_ID, 10)]),
      );
      const update = result.priceUpdates[GRAIN_ID]!;
      expect(Math.abs(update.newPriceRUSD / previous - 1)).toBeLessThanOrEqual(0.0500000001);
      expect(update.newPriceRUSD).toBeGreaterThan(0);
      expect(update.newPriceRUSD).toBeLessThanOrEqual(0.2 + 1e-12);
      expect(Number.isFinite(update.newPriceRUSD)).toBe(true);
      previous = update.newPriceRUSD;
    }
    expect(previous).toBeCloseTo(0.2, 12);
  });
});

describe("M3d determinism, validation, and boundaries", () => {
  test("permuted blocks, buildings, lots, and demand records produce identical state", () => {
    const firstScenario = marketScenario({
      lots: [{ goodId: GRAIN_ID, ownerBuildingId: 0, quantity: 10 }],
    });
    const secondScenario = marketScenario({
      lots: [{ goodId: GRAIN_ID, ownerBuildingId: 0, quantity: 10 }],
    });
    secondScenario.population.popBlocks = [...secondScenario.population.popBlocks].reverse();
    secondScenario.buildingInstances = [...secondScenario.buildingInstances].reverse();
    const firstWorld = createEconomyWorld(firstScenario, { seed: 77 });
    const secondWorld = createEconomyWorld(secondScenario, { seed: 77 });
    secondWorld.buildings.reverse();
    secondWorld.markets[0]!.stockLots.reverse();
    const demands = [
      household(0, 1, GRAIN_ID, 4),
      household(1, 1, GRAIN_ID, 4),
    ];
    const first = runMarketDay(
      firstWorld,
      firstScenario.definitions,
      marketInput(firstScenario, firstWorld, demands),
    );
    const second = runMarketDay(
      secondWorld,
      secondScenario.definitions,
      marketInput(secondScenario, secondWorld, [...demands].reverse()),
    );
    expect(second).toEqual(first);
    expect(hashWorld(secondWorld)).toBe(hashWorld(firstWorld));
  });

  test("permuted demand records across goods produce identical allocation and state", () => {
    const scenario = marketScenario({
      produce: false,
      lots: [
        { goodId: GRAIN_ID, ownerBuildingId: 0, quantity: 10 },
        { goodId: FOOD_ID, ownerBuildingId: 4, quantity: 10 },
        { goodId: CLOTHING_ID, ownerBuildingId: 6, quantity: 10 },
        { goodId: TEXTILES_ID, ownerBuildingId: 5, quantity: 10 },
      ],
    });
    const firstWorld = createEconomyWorld(scenario, { seed: 88 });
    const secondWorld = createEconomyWorld(scenario, { seed: 88 });
    const demands = [
      household(0, 1, GRAIN_ID, 4),
      household(0, 1, FOOD_ID, 4),
      household(1, 3, CLOTHING_ID, 2),
      household(1, 6, TEXTILES_ID, 2),
    ];
    const first = runMarketDay(
      firstWorld,
      scenario.definitions,
      marketInput(scenario, firstWorld, demands),
    );
    const second = runMarketDay(
      secondWorld,
      scenario.definitions,
      marketInput(scenario, secondWorld, [...demands].reverse()),
    );
    expect(second).toEqual(first);
    expect(hashWorld(secondWorld)).toBe(hashWorld(firstWorld));
  });

  test("keyed residual allocation is stable under equal fractional shares and input order", () => {
    const scenario = marketScenario({
      produce: false,
      lots: [{ goodId: GRAIN_ID, ownerBuildingId: 0, quantity: 1 }],
    });
    const firstWorld = createEconomyWorld(scenario, { seed: 456 });
    const secondWorld = createEconomyWorld(scenario, { seed: 456 });
    const demands = [
      household(0, 1, GRAIN_ID, 1),
      household(1, 1, GRAIN_ID, 1),
      household(2, 1, GRAIN_ID, 1),
    ];
    const first = runMarketDay(
      firstWorld,
      scenario.definitions,
      marketInput(scenario, firstWorld, demands),
    );
    const second = runMarketDay(
      secondWorld,
      scenario.definitions,
      marketInput(scenario, secondWorld, [...demands].reverse()),
    );
    expect(second).toEqual(first);
    expect(hashWorld(secondWorld)).toBe(hashWorld(firstWorld));
    expect(
      first.householdDemands.reduce((sum, demand) => sum + demand.fulfilledQuantity, 0),
    ).toBeCloseTo(1, 9);
    for (const demand of first.householdDemands) {
      expect(demand.fulfilledQuantity).toBeCloseTo(1 / 3, 9);
    }
  });

  test("repeat runs with the same seed and demand are identical", () => {
    const scenario = marketScenario({
      lots: [{ goodId: GRAIN_ID, ownerBuildingId: 0, quantity: 10 }],
    });
    const firstWorld = createEconomyWorld(scenario, { seed: 123 });
    const secondWorld = createEconomyWorld(scenario, { seed: 123 });
    const demands = [
      household(0, 1, GRAIN_ID, 4),
      household(1, 1, GRAIN_ID, 4),
    ];
    const first = runMarketDay(
      firstWorld,
      scenario.definitions,
      marketInput(scenario, firstWorld, demands),
    );
    const second = runMarketDay(
      secondWorld,
      scenario.definitions,
      marketInput(scenario, secondWorld, demands),
    );
    expect(second).toEqual(first);
    expect(hashWorld(secondWorld)).toBe(hashWorld(firstWorld));
  });

  test("rejects invalid tiers, funded quantities, duplicates, and day mismatches", () => {
    const scenario = marketScenario({
      produce: false,
      lots: [{ goodId: GRAIN_ID, ownerBuildingId: 0, quantity: 10 }],
    });
    const world = createEconomyWorld(scenario, { seed: 1 });
    const before = hashWorld(world);
    expect(() =>
      runMarketDay(
        world,
        scenario.definitions,
        marketInput(scenario, world, [], [productionDemand(4, 5, GRAIN_ID, 1)]),
      ),
    ).toThrow(/critical-input classification/i);
    expect(() =>
      runMarketDay(
        world,
        scenario.definitions,
        marketInput(scenario, world, [household(0, 1, GRAIN_ID, 1, 2)]),
      ),
    ).toThrow(/fundedQuantity/i);
    expect(() =>
      runMarketDay(
        world,
        scenario.definitions,
        marketInput(scenario, world, [
          household(0, 1, GRAIN_ID, 1),
          household(0, 1, GRAIN_ID, 1),
        ]),
      ),
    ).toThrow(/duplicates/i);
    const badDay: MarketDayInput = {
      ...marketInput(scenario, world, []),
      dayIndex: 1 as MarketDayInput["dayIndex"],
    };
    expect(() => runMarketDay(world, scenario.definitions, badDay)).toThrow(/dayIndex/i);
    expect(hashWorld(world)).toBe(before);
  });

  test("does not settle cash while clearing a market day", () => {
    const scenario = marketScenario({
      lots: [{ goodId: GRAIN_ID, ownerBuildingId: 0, quantity: 10 }],
    });
    const world = createEconomyWorld(scenario, { seed: 1 });
    const cash = designatedCashTotal(world.finance);
    const result = runMarketDay(
      world,
      scenario.definitions,
      marketInput(scenario, world, [household(0, 1, GRAIN_ID, 5)]),
    );
    expect(result.pendingTransactions.length).toBeGreaterThan(0);
    expect(designatedCashTotal(world.finance)).toBeCloseTo(cash, 9);
  });
});
