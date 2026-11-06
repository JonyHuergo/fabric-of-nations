import {
  deriveStockByGood,
  deriveStorageCapacityByGood,
  deserializeWorld,
  hashWorld,
  runProductionPhase,
  serializeWorld,
} from "@century/sim";
import {
  FOOD_PRODUCTS_ID,
  GRAIN_ID,
  TEXTILES_ID,
  lotQuantity,
  productionScenario,
  productionWorld,
  reservation,
  setBuildingStorage,
  setMarketLots,
  stockOf,
  totalCash,
} from "../fixtures/m3c.js";
import { createEconomyWorld } from "@century/sim";

describe("M3c inventory movement and storage", () => {
  test("outputs are producer-owned lots and unsold goods retain their owners", () => {
    const { scenario, world } = productionWorld();
    const result = runProductionPhase(world, scenario.definitions, []);
    expect(lotQuantity(world, GRAIN_ID, 0)).toBeCloseTo(104.5, 9);
    expect(lotQuantity(world, GRAIN_ID, 1)).toBe(0);
    expect(result.inventory[GRAIN_ID]).toEqual({
      goodId: GRAIN_ID,
      openingStock: 100,
      production: 4.5,
      usedAsInput: 0,
      recordedLoss: 0,
      closingStock: 104.5,
    });
    expect(result.overflowLosses).toEqual([]);
  });

  test("consumes only used input and leaves unused reservation in the seller lot", () => {
    const { scenario, world } = productionWorld();
    const result = runProductionPhase(world, scenario.definitions, [
      reservation(4, GRAIN_ID, 0, 10),
    ]);
    expect(result.reservationUses).toEqual([
      {
        buyerBuildingId: 4,
        marketId: 0,
        goodId: GRAIN_ID,
        sellerBuildingId: 0,
        reservedQuantity: 10,
        usedQuantity: 5,
        releasedQuantity: 5,
      },
    ]);
    expect(lotQuantity(world, GRAIN_ID, 0)).toBeCloseTo(99.5, 9);
    expect(stockOf(world, FOOD_PRODUCTS_ID)).toBeCloseTo(2, 9);
    expect(result.inventory[GRAIN_ID]).toEqual({
      goodId: GRAIN_ID,
      openingStock: 100,
      production: 4.5,
      usedAsInput: 5,
      recordedLoss: 0,
      closingStock: 99.5,
    });
  });

  test("derives warehouse capacity from level and condition", () => {
    const { scenario, world } = productionWorld();
    const base = deriveStorageCapacityByGood(world, scenario.definitions);
    expect(base[GRAIN_ID]).toBe(2000);
    world.buildings[7]!.level = 2;
    world.buildings[7]!.condition = 0.5;
    const scaled = deriveStorageCapacityByGood(world, scenario.definitions);
    expect(scaled[GRAIN_ID]).toBeCloseTo(2000, 9);
    world.buildings[7]!.condition = 0;
    const off = deriveStorageCapacityByGood(world, scenario.definitions);
    expect(off[GRAIN_ID]).toBe(0);
  });

  test("applies proportional overflow loss across lots and records attribution", () => {
    const scenario = productionScenario();
    setBuildingStorage(scenario, 7, [
      { goodId: GRAIN_ID, quantity: 50 },
      { goodId: FOOD_PRODUCTS_ID, quantity: 2000 },
      { goodId: TEXTILES_ID, quantity: 2000 },
    ]);
    setMarketLots(scenario, [
      { goodId: GRAIN_ID, ownerBuildingId: 0, quantity: 30 },
      { goodId: GRAIN_ID, ownerBuildingId: 1, quantity: 20 },
    ]);
    const world = createEconomyWorld(scenario, { seed: 1 });
    const result = runProductionPhase(world, scenario.definitions, []);

    expect(result.inventory[GRAIN_ID]).toEqual({
      goodId: GRAIN_ID,
      openingStock: 50,
      production: 4.5,
      usedAsInput: 0,
      recordedLoss: 4.5,
      closingStock: 50,
    });
    expect(result.overflowLosses).toHaveLength(2);
    expect(result.overflowLosses.reduce((total, loss) => total + loss.quantity, 0)).toBeCloseTo(
      4.5,
      9,
    );
    expect(result.overflowLosses.every((loss) => loss.goodId === GRAIN_ID)).toBe(true);
    expect(result.overflowLosses.map((loss) => loss.ownerBuildingId).sort()).toEqual([0, 1]);
    expect(stockOf(world, GRAIN_ID)).toBeCloseTo(50, 9);
    expect(lotQuantity(world, GRAIN_ID, 0) + lotQuantity(world, GRAIN_ID, 1)).toBeCloseTo(50, 9);
  });

  test("reconciles lot-level and aggregate inventory conservation", () => {
    const { scenario, world } = productionWorld();
    const result = runProductionPhase(world, scenario.definitions, [
      reservation(4, GRAIN_ID, 0, 10),
    ]);
    const market = world.markets[0]!;
    const stock = deriveStockByGood(market, scenario.definitions.goods.length);
    for (const flow of result.inventory) {
      expect(flow.openingStock + flow.production - flow.usedAsInput - flow.recordedLoss).toBeCloseTo(
        flow.closingStock,
        9,
      );
      expect(stock[flow.goodId]).toBeCloseTo(flow.closingStock, 9);
    }
    for (const lot of market.stockLots) {
      expect(Number.isFinite(lot.quantity)).toBe(true);
      expect(lot.quantity).toBeGreaterThan(0);
    }
    const total = market.stockLots.reduce((sum, lot) => sum + lot.quantity, 0);
    expect(total).toBeCloseTo(stock.reduce((sum, quantity) => sum + quantity, 0), 9);
  });

  test("canonicalizes lots and is invariant to incidental lot/reservation order", () => {
    const first = productionWorld();
    const second = productionWorld();
    const reservations = [
      reservation(4, GRAIN_ID, 0, 4),
      reservation(5, GRAIN_ID, 0, 4),
    ];
    const firstResult = runProductionPhase(first.world, first.scenario.definitions, reservations);
    second.world.markets[0]!.stockLots.reverse();
    const secondResult = runProductionPhase(
      second.world,
      second.scenario.definitions,
      [...reservations].reverse(),
    );
    expect(secondResult).toEqual(firstResult);
    expect(hashWorld(second.world)).toBe(hashWorld(first.world));
    const lots = second.world.markets[0]!.stockLots;
    for (let index = 1; index < lots.length; index += 1) {
      const previous = lots[index - 1]!;
      const current = lots[index]!;
      expect(
        previous.goodId < current.goodId ||
          (previous.goodId === current.goodId &&
            previous.ownerBuildingId < current.ownerBuildingId),
      ).toBe(true);
    }
  });

  test("does not mutate accounts or prices and preserves employment", () => {
    const { scenario, world } = productionWorld();
    const employment = world.employment.map((assignment) => ({ ...assignment }));
    const cash = totalCash(world);
    const priceSnapshot = [...world.markets[0]!.priceRUSD];
    runProductionPhase(world, scenario.definitions, [
      reservation(4, GRAIN_ID, 0, 10),
    ]);
    expect(world.employment).toEqual(employment);
    expect(totalCash(world)).toBeCloseTo(cash, 9);
    expect(world.markets[0]!.priceRUSD).toEqual(priceSnapshot);
  });

  test("save/load after a production phase preserves the inventory and hash", () => {
    const { scenario, world } = productionWorld();
    runProductionPhase(world, scenario.definitions, [
      reservation(4, GRAIN_ID, 0, 10),
    ]);
    const restored = deserializeWorld(serializeWorld(world));
    expect(restored.markets[0]?.stockLots).toEqual(world.markets[0]?.stockLots);
    expect(hashWorld(restored)).toBe(hashWorld(world));
  });

  test("rejects an invalid reservation set without changing inventory", () => {
    const { scenario, world } = productionWorld();
    const before = hashWorld(world);
    expect(() =>
      runProductionPhase(world, scenario.definitions, [
        reservation(4, GRAIN_ID, 0, 101),
      ]),
    ).toThrow(/over-reserve/i);
    expect(hashWorld(world)).toBe(before);
    expect(lotQuantity(world, GRAIN_ID, 0)).toBe(100);
  });
});
