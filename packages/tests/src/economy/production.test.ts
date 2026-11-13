import {
  computeBuildingCapacity,
  createEconomyWorld,
  hashWorld,
  runProductionPhase,
  tick,
  type BuildingProductionResult,
  type ProductionPhaseResult,
} from "@century/sim";
import {
  FOOD_PRODUCTS_ID,
  GRAIN_ID,
  LIVESTOCK_ID,
  TEXTILES_ID,
  lotQuantity,
  prices,
  productionScenario,
  idleBuilding,
  productionWorld,
  reservation,
  setBuildingJobs,
  setBuildingRecipe,
  setBuildingStorage,
  setMarketLots,
  stockOf,
  totalCash,
} from "../fixtures/m3c.js";

function resultFor(
  result: ProductionPhaseResult,
  buildingId: number,
): BuildingProductionResult {
  const found = result.buildings.find((building) => building.buildingId === buildingId);
  if (found === undefined) throw new Error(`missing building result ${String(buildingId)}`);
  return found;
}

describe("M3c production capacity and throughput", () => {
  test("computes capacity from reference throughput, level, condition, staffing, and productivity", () => {
    const { scenario, world } = productionWorld();
    const farm = computeBuildingCapacity(world, scenario.definitions, 0);
    expect(farm.referenceThroughputPerDayAtLevelOne).toBe(1);
    expect(farm.level).toBe(1);
    expect(farm.condition).toBe(1);
    expect(farm.assignedWorkers).toBe(45);
    expect(farm.requiredWorkersByProfession).toEqual([
      { professionId: 0, requiredWorkers: 100 },
    ]);
    expect(farm.staffingRatio).toBeCloseTo(0.45, 12);
    expect(farm.productivityFactor).toBe(1);
    expect(farm.capacityTU).toBeCloseTo(0.45, 12);
    expect(farm.desiredInputs).toEqual([]);

    const processor = computeBuildingCapacity(world, scenario.definitions, 4);
    expect(processor.staffingRatio).toBe(1);
    expect(processor.capacityTU).toBe(1);
    expect(processor.desiredInputs).toEqual([{ goodId: GRAIN_ID, quantity: 5 }]);

    const warehouse = computeBuildingCapacity(world, scenario.definitions, 7);
    expect(warehouse.isProductionBuilding).toBe(false);
    expect(warehouse.capacityTU).toBe(0);
    expect(warehouse.desiredInputs).toEqual([]);
  });

  test("applies worker productivity and condition consistently", () => {
    const scenario = productionScenario();
    const profession = scenario.definitions.professions.find(
      (candidate) => candidate.id === 0,
    );
    if (profession === undefined) throw new Error("missing peasant profession");
    profession.laborProductivityModifier = 2;
    const world = createEconomyWorld(scenario, { seed: 20_261_023 });
    const farm = computeBuildingCapacity(world, scenario.definitions, 0);
    expect(farm.productivityFactor).toBe(2);
    expect(farm.capacityTU).toBeCloseTo(0.9, 12);

    world.buildings[0]!.condition = 0.5;
    const half = computeBuildingCapacity(world, scenario.definitions, 0);
    expect(half.condition).toBe(0.5);
    // Condition reduces both capacity and required workers. With the same
    // workforce, the staffing ratio rises and can offset the condition loss.
    expect(half.capacityTU).toBeCloseTo(0.9, 12);

    // A fully staffed building loses capacity directly when condition falls.
    world.buildings[4]!.condition = 0.5;
    const processor = computeBuildingCapacity(world, scenario.definitions, 4);
    expect(processor.staffingRatio).toBe(1);
    expect(processor.capacityTU).toBeCloseTo(0.5, 12);
  });

  test("zero workers, zero condition, and fractional job capacity produce zero or limited output", () => {
    const noWorkers = productionScenario();
    noWorkers.employment = noWorkers.employment.filter(
      (assignment) => assignment.buildingInstanceId !== 4,
    );
    idleBuilding(noWorkers, 4);
    const noWorkersWorld = createEconomyWorld(noWorkers, { seed: 1 });
    const noWorkersResult = runProductionPhase(noWorkersWorld, noWorkers.definitions, [
      reservation(4, GRAIN_ID, 0, 5),
    ]);
    expect(resultFor(noWorkersResult, 4).capacityTU).toBe(0);
    expect(resultFor(noWorkersResult, 4).executedTU).toBe(0);
    expect(resultFor(noWorkersResult, 4).outputs).toEqual([]);

    const { scenario, world } = productionWorld();
    world.buildings[4]!.condition = 0;
    const zeroCondition = runProductionPhase(world, scenario.definitions, [
      reservation(4, GRAIN_ID, 0, 5),
    ]);
    expect(resultFor(zeroCondition, 4).capacityTU).toBe(0);
    expect(resultFor(zeroCondition, 4).executedTU).toBe(0);
    expect(zeroCondition.reservationUses).toEqual([
      {
        buyerBuildingId: 4,
        marketId: 0,
        goodId: GRAIN_ID,
        sellerBuildingId: 0,
        reservedQuantity: 5,
        usedQuantity: 0,
        releasedQuantity: 5,
      },
    ]);
  });

  test("empty-input recipes execute at capacity, while input recipes without reservations produce zero", () => {
    const { scenario, world } = productionWorld();
    const result = runProductionPhase(world, scenario.definitions, []);

    const farm = resultFor(result, 0);
    expect(farm.inputs).toEqual([]);
    expect(farm.capacityTU).toBeCloseTo(0.45, 12);
    expect(farm.executedTU).toBeCloseTo(0.45, 12);
    expect(farm.outputs).toEqual([{ goodId: GRAIN_ID, quantity: 4.5 }]);
    expect(Number.isFinite(farm.executedTU)).toBe(true);
    expect(Number.isFinite(farm.outputs[0]?.quantity ?? Number.NaN)).toBe(true);

    const processor = resultFor(result, 4);
    expect(processor.capacityTU).toBe(1);
    expect(processor.executedTU).toBe(0);
    expect(processor.inputs).toEqual([
      { goodId: GRAIN_ID, reserved: 0, used: 0, released: 0 },
    ]);
    expect(processor.outputs).toEqual([]);

    const warehouse = computeBuildingCapacity(world, scenario.definitions, 7);
    expect(warehouse.isProductionBuilding).toBe(false);
    expect(warehouse.capacityTU).toBe(0);
    expect(warehouse.desiredInputs).toEqual([]);
    expect(result.buildings.some((building) => building.buildingId === 7)).toBe(false);
  });

  test("uses fractional job capacity without assigning a fractional worker", () => {
    const scenario = productionScenario();
    scenario.buildingInstances[4]!.condition = 0.5;
    setBuildingJobs(scenario, 4, [{ professionId: 1, workersPerThroughputUnit: 3 }]);
    scenario.employment = scenario.employment.map((assignment) =>
      assignment.buildingInstanceId === 4 ? { ...assignment, workers: 1 } : assignment,
    );
    const world = createEconomyWorld(scenario, { seed: 1 });
    const capacity = computeBuildingCapacity(world, scenario.definitions, 4);
    expect(capacity.requiredWorkersByProfession).toEqual([
      { professionId: 1, requiredWorkers: 1.5 },
    ]);
    expect(capacity.staffingRatio).toBeCloseTo(2 / 3, 12);
    expect(capacity.capacityTU).toBeCloseTo(1 / 3, 12);
    const result = runProductionPhase(world, scenario.definitions, [
      reservation(4, GRAIN_ID, 0, 2),
    ]);
    const processor = resultFor(result, 4);
    expect(processor.executedTU).toBeCloseTo(1 / 3, 12);
    expect(processor.inputs[0]?.used).toBeCloseTo(5 / 3, 12);
    expect(processor.outputs[0]?.quantity).toBeCloseTo(2 / 3, 12);
  });

  test("buildings without jobs can run a recipe; warehouses never produce", () => {
    const scenario = productionScenario();
    setBuildingJobs(scenario, 0, []);
    scenario.employment = scenario.employment.filter(
      (assignment) => assignment.buildingInstanceId !== 0,
    );
    const world = createEconomyWorld(scenario, { seed: 1 });
    const capacity = computeBuildingCapacity(world, scenario.definitions, 0);
    expect(capacity.staffingRatio).toBe(1);
    expect(capacity.capacityTU).toBe(1);
    const result = runProductionPhase(world, scenario.definitions, []);
    expect(resultFor(result, 0).executedTU).toBe(1);
    expect(resultFor(result, 0).outputs).toEqual([{ goodId: GRAIN_ID, quantity: 10 }]);
    const warehouseCapacity = computeBuildingCapacity(world, scenario.definitions, 7);
    expect(warehouseCapacity.isProductionBuilding).toBe(false);
    expect(warehouseCapacity.capacityTU).toBe(0);
  });

  test("the limiting input controls executed throughput and unused input is released", () => {
    const { scenario, world } = productionWorld();
    const result = runProductionPhase(world, scenario.definitions, [
      reservation(4, GRAIN_ID, 0, 10),
    ]);
    const processor = resultFor(result, 4);
    expect(processor.capacityTU).toBe(1);
    expect(processor.executedTU).toBe(1);
    expect(processor.inputs).toEqual([
      { goodId: GRAIN_ID, reserved: 10, used: 5, released: 5 },
    ]);
    expect(processor.outputs).toEqual([{ goodId: FOOD_PRODUCTS_ID, quantity: 2 }]);
    expect(lotQuantity(world, GRAIN_ID, 0)).toBeCloseTo(99.5, 9);
    expect(stockOf(world, FOOD_PRODUCTS_ID)).toBeCloseTo(2, 9);
  });

  test("multiple inputs limit throughput independently", () => {
    const scenario = productionScenario();
    setBuildingRecipe(
      scenario,
      4,
      [
        { goodId: GRAIN_ID, quantityPerThroughputUnit: 5 },
        { goodId: TEXTILES_ID, quantityPerThroughputUnit: 2 },
      ],
      [{ goodId: FOOD_PRODUCTS_ID, quantityPerThroughputUnit: 2 }],
    );
    setMarketLots(scenario, [
      { goodId: GRAIN_ID, ownerBuildingId: 0, quantity: 100 },
      { goodId: TEXTILES_ID, ownerBuildingId: 5, quantity: 100 },
    ]);
    const world = createEconomyWorld(scenario, { seed: 1 });
    const result = runProductionPhase(world, scenario.definitions, [
      reservation(4, GRAIN_ID, 0, 10),
      reservation(4, TEXTILES_ID, 5, 1),
    ]);
    const processor = resultFor(result, 4);
    expect(processor.executedTU).toBe(0.5);
    expect(processor.inputs).toEqual([
      { goodId: GRAIN_ID, reserved: 10, used: 2.5, released: 7.5 },
      { goodId: TEXTILES_ID, reserved: 1, used: 1, released: 0 },
    ]);
    expect(processor.outputs).toEqual([{ goodId: FOOD_PRODUCTS_ID, quantity: 1 }]);
    expect(lotQuantity(world, GRAIN_ID, 0)).toBeCloseTo(102, 9);
    expect(lotQuantity(world, TEXTILES_ID, 5)).toBeCloseTo(99, 9);
  });

  test("multi-output recipes use fixed proportions of one executed throughput", () => {
    const scenario = productionScenario();
    setBuildingRecipe(
      scenario,
      0,
      [],
      [
        { goodId: GRAIN_ID, quantityPerThroughputUnit: 10 },
        { goodId: LIVESTOCK_ID, quantityPerThroughputUnit: 2 },
      ],
    );
    setBuildingStorage(scenario, 7, [
      { goodId: GRAIN_ID, quantity: 2000 },
      { goodId: LIVESTOCK_ID, quantity: 2000 },
    ]);
    const world = createEconomyWorld(scenario, { seed: 1 });
    const result = runProductionPhase(world, scenario.definitions, []);
    const farm = resultFor(result, 0);
    expect(farm.executedTU).toBeCloseTo(0.45, 12);
    expect(farm.outputs).toEqual([
      { goodId: GRAIN_ID, quantity: 4.5 },
      { goodId: LIVESTOCK_ID, quantity: 0.9 },
    ]);
    expect(lotQuantity(world, LIVESTOCK_ID, 0)).toBeCloseTo(0.9, 9);
  });

  test("today's output never supplies today's input", () => {
    const scenario = productionScenario();
    const processorDefinition = scenario.definitions.buildings.find(
      (definition) => definition.id === 4,
    );
    if (processorDefinition === undefined) throw new Error("missing processor definition");
    processorDefinition.referenceThroughputPerDayAtLevelOne = 3;
    setBuildingJobs(scenario, 4, [{ professionId: 1, workersPerThroughputUnit: 100 / 3 }]);
    scenario.employment = scenario.employment
      .filter((assignment) => assignment.buildingInstanceId !== 5)
      .map((assignment) =>
        assignment.buildingInstanceId === 4 ? { ...assignment, workers: 100 } : assignment,
      );
    setMarketLots(scenario, [{ goodId: GRAIN_ID, ownerBuildingId: 0, quantity: 10 }]);
    const world = createEconomyWorld(scenario, { seed: 1 });
    const result = runProductionPhase(world, scenario.definitions, [
      reservation(4, GRAIN_ID, 0, 10),
    ]);
    const processor = resultFor(result, 4);
    expect(processor.capacityTU).toBeCloseTo(3, 9);
    expect(processor.executedTU).toBe(2);
    expect(processor.inputs[0]?.used).toBe(10);
    expect(processor.outputs[0]?.quantity).toBe(4);
    // The farm produced grain in the same phase, but it was unavailable to the
    // processor's input reservation. Only opening grain was consumed.
    expect(lotQuantity(world, GRAIN_ID, 0)).toBeCloseTo(4.5, 9);
  });
});

describe("M3c input reservations", () => {
  test("rejects an over-reserved seller lot atomically", () => {
    const { scenario, world } = productionWorld();
    const before = hashWorld(world);
    expect(() =>
      runProductionPhase(world, scenario.definitions, [
        reservation(4, GRAIN_ID, 0, 60),
        reservation(5, GRAIN_ID, 0, 50),
      ]),
    ).toThrow(/over-reserve/i);
    expect(hashWorld(world)).toBe(before);
    expect(lotQuantity(world, GRAIN_ID, 0)).toBe(100);
  });

  test("rejects broken references, wrong markets, and non-input goods", () => {
    const { scenario, world } = productionWorld();
    const before = hashWorld(world);
    expect(() =>
      runProductionPhase(world, scenario.definitions, [
        reservation(999, GRAIN_ID, 0, 5),
      ]),
    ).toThrow(/buyer/i);
    expect(() =>
      runProductionPhase(world, scenario.definitions, [
        reservation(4, GRAIN_ID, 999, 5),
      ]),
    ).toThrow(/seller/i);
    expect(() =>
      runProductionPhase(world, scenario.definitions, [
        reservation(4, GRAIN_ID, 0, 5, 99),
      ]),
    ).toThrow(/market/i);
    expect(() =>
      runProductionPhase(world, scenario.definitions, [
        reservation(0, GRAIN_ID, 0, 5),
      ]),
    ).toThrow(/input/i);
    expect(hashWorld(world)).toBe(before);
  });

  test("rejects duplicate reservations and non-operational buyers", () => {
    const { scenario, world } = productionWorld();
    expect(() =>
      runProductionPhase(world, scenario.definitions, [
        reservation(4, GRAIN_ID, 0, 5),
        reservation(4, GRAIN_ID, 0, 5),
      ]),
    ).toThrow(/duplicate/i);

    const closed = productionWorld();
    closed.world.employment = closed.world.employment.filter(
      (assignment) => assignment.buildingInstanceId !== 4,
    );
    closed.world.buildings[4]!.operational = false;
    expect(() =>
      runProductionPhase(closed.world, closed.scenario.definitions, [
        reservation(4, GRAIN_ID, 0, 5),
      ]),
    ).toThrow(/operational|buyer/i);
  });

  test("multiple buyers share a seller lot without consuming it twice", () => {
    const { scenario, world } = productionWorld();
    const result = runProductionPhase(world, scenario.definitions, [
      reservation(4, GRAIN_ID, 0, 4),
      reservation(5, GRAIN_ID, 0, 4),
    ]);
    expect(result.reservationUses).toEqual([
      {
        buyerBuildingId: 4,
        marketId: 0,
        goodId: GRAIN_ID,
        sellerBuildingId: 0,
        reservedQuantity: 4,
        usedQuantity: 4,
        releasedQuantity: 0,
      },
      {
        buyerBuildingId: 5,
        marketId: 0,
        goodId: GRAIN_ID,
        sellerBuildingId: 0,
        reservedQuantity: 4,
        usedQuantity: 4,
        releasedQuantity: 0,
      },
    ]);
    expect(lotQuantity(world, GRAIN_ID, 0)).toBeCloseTo(96.5, 9);
    expect(stockOf(world, FOOD_PRODUCTS_ID)).toBeCloseTo(1.6, 9);
    expect(stockOf(world, TEXTILES_ID)).toBeCloseTo(1.6, 9);
  });

  test("reordered reservations and building arrays produce identical results", () => {
    const first = productionWorld();
    const second = productionWorld();
    const reservations = [
      reservation(4, GRAIN_ID, 0, 4),
      reservation(5, GRAIN_ID, 0, 4),
    ];
    const firstResult = runProductionPhase(first.world, first.scenario.definitions, reservations);
    second.scenario.buildingInstances.reverse();
    second.world.buildings.reverse();
    const secondResult = runProductionPhase(
      second.world,
      second.scenario.definitions,
      [...reservations].reverse(),
    );
    expect(secondResult).toEqual(firstResult);
    expect(hashWorld(second.world)).toBe(hashWorld(first.world));
  });

  test("proportional input allocation is stable across reservation order and sellers", () => {
    const scenario = productionScenario();
    setMarketLots(scenario, [
      { goodId: GRAIN_ID, ownerBuildingId: 0, quantity: 5 },
      { goodId: GRAIN_ID, ownerBuildingId: 1, quantity: 5 },
    ]);
    const first = createEconomyWorld(scenario, { seed: 1 });
    const second = createEconomyWorld(scenario, { seed: 1 });
    const reservations = [
      reservation(4, GRAIN_ID, 0, 3),
      reservation(4, GRAIN_ID, 1, 3),
    ];
    const firstResult = runProductionPhase(first, scenario.definitions, reservations);
    const secondResult = runProductionPhase(
      second,
      scenario.definitions,
      [...reservations].reverse(),
    );
    expect(secondResult).toEqual(firstResult);
    expect(hashWorld(second)).toBe(hashWorld(first));
    expect(firstResult.reservationUses.map((use) => use.usedQuantity).sort()).toEqual([2.5, 2.5]);
  });
});

describe("M3c boundaries", () => {
  test("does not mutate accounts or prices", () => {
    const { scenario, world } = productionWorld();
    const beforeCash = totalCash(world);
    const beforePrices = prices(world);
    runProductionPhase(world, scenario.definitions, [
      reservation(4, GRAIN_ID, 0, 10),
    ]);
    expect(totalCash(world)).toBeCloseTo(beforeCash, 9);
    expect(prices(world)).toEqual(beforePrices);
  });

  test("requires an explicit economy context for an economic world tick", () => {
    const { world } = productionWorld();
    expect(() => tick(world)).toThrow(/economy context|population context/i);
  });
});
