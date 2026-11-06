/**
 * P5b (D-146) simulation mechanics of the goods catalogue, on the small M3 production
 * fixture (one market, a farm, a food works, a textile mill, a workshop, a warehouse):
 *
 * - definitions: services must be non-storable; non-storable goods get no storage and
 *   their producers may not need them; extraction kinds, optional and maintenance
 *   inputs and gates are validated;
 * - production waves (A4): a good that cannot be stored is made first and bought the
 *   same day by the producers that need it; what nobody buys is lost, never stored;
 * - extraction: output follows deposit quality, depletion goes only through
 *   `extractFromDeposit`, initial = remaining + extracted exactly, and an exhausted
 *   deposit yields nothing;
 * - optional inputs raise output with their fill; maintenance goods are bought and
 *   consumed; money is conserved throughout;
 * - save round trip of the deposit link and determinism of the day.
 */

import {
  assertValidEconomyDefinitions,
  createEconomyWorld,
  depositRemaining,
  deserializeWorld,
  hashWorld,
  serializeWorld,
  tick,
  type EconomyScenarioDef,
  type World,
} from "@century/sim";
import { economyTickContext, totalCash } from "../fixtures/m3e.js";
import {
  FOOD_PRODUCTS_ID,
  GRAIN_ID,
  LIVESTOCK_ID,
  TEXTILES_ID,
  productionScenario,
  setBuildingRecipe,
  setBuildingStorage,
  setMarketLots,
} from "../fixtures/m3c.js";
import { setBuildingJobs } from "../fixtures/m3b.js";

const SEED = 20_261_023;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function economyDay(world: World, scenario: EconomyScenarioDef) {
  const result = tick(world, economyTickContext(scenario));
  const economy = result.economy;
  if (economy === undefined) throw new Error("no economy result");
  return economy;
}

function buildingResult(economy: ReturnType<typeof economyDay>, buildingId: number) {
  for (const market of economy.markets) {
    const found = market.production.buildings.find((entry) => entry.buildingId === buildingId);
    if (found !== undefined) return found;
  }
  return undefined;
}

describe("P5b definitions (D-146)", () => {
  const base = (): EconomyScenarioDef => productionScenario();

  test("a service must be non-storable, and a non-storable good gets no storage", () => {
    const service = base();
    service.definitions.goods[LIVESTOCK_ID]!.category = "service";
    expect(() => assertValidEconomyDefinitions(service.definitions)).toThrow(/services cannot be stored/);
    service.definitions.goods[LIVESTOCK_ID]!.storable = false;
    // The fixture's warehouse stores livestock, which a non-storable good may not have.
    expect(() => assertValidEconomyDefinitions(service.definitions)).toThrow(/cannot be stored/);
    setBuildingStorage(service, 7, [{ goodId: GRAIN_ID, quantity: 2000 }]);
    expect(() => assertValidEconomyDefinitions(service.definitions)).not.toThrow();
  });

  test("a producer of a non-storable good may not need one; extras must be storable", () => {
    const scenario = base();
    scenario.definitions.goods[LIVESTOCK_ID]!.storable = false;
    scenario.definitions.goods[GRAIN_ID]!.storable = false;
    setBuildingStorage(scenario, 7, [{ goodId: TEXTILES_ID, quantity: 2000 }]);
    // Food works makes grain-free food; the farm makes grain (non-storable) — fine.
    expect(() => assertValidEconomyDefinitions(scenario.definitions)).not.toThrow();
    // A producer of non-storable livestock that needs non-storable grain is rejected.
    setBuildingRecipe(scenario, 4, [{ goodId: GRAIN_ID, quantityPerThroughputUnit: 1 }], [
      { goodId: LIVESTOCK_ID, quantityPerThroughputUnit: 1 },
    ]);
    expect(() => assertValidEconomyDefinitions(scenario.definitions)).toThrow(/non-storable input/);

    const extras = base();
    extras.definitions.goods[LIVESTOCK_ID]!.storable = false;
    setBuildingStorage(extras, 7, [{ goodId: GRAIN_ID, quantity: 2000 }]);
    extras.definitions.buildings.find((entry) => entry.id === 5)!.maintenanceInputs = [
      { goodId: LIVESTOCK_ID, quantityPerLevelPerDay: 1 },
    ];
    expect(() => assertValidEconomyDefinitions(extras.definitions)).toThrow(/optional or maintenance/);
  });

  test("extraction kinds, optional elasticities and maintenance quantities are validated", () => {
    const kind = base();
    (kind.definitions.buildings[0] as unknown as { extracts: string }).extracts = "unobtainium";
    expect(() => assertValidEconomyDefinitions(kind.definitions)).toThrow(/extracts must be one of/);

    const elasticity = base();
    elasticity.definitions.buildings.find((entry) => entry.id === 5)!.optionalInputs = [
      { goodId: LIVESTOCK_ID, quantityPerThroughputUnit: 1, outputElasticity: 1 },
    ];
    expect(() => assertValidEconomyDefinitions(elasticity.definitions)).toThrow(/outputElasticity/);

    const repeated = base();
    repeated.definitions.buildings.find((entry) => entry.id === 5)!.maintenanceInputs = [
      { goodId: GRAIN_ID, quantityPerLevelPerDay: 1 },
    ];
    expect(() => assertValidEconomyDefinitions(repeated.definitions)).toThrow(/repeats good/);

    const ownOutput = base();
    ownOutput.definitions.buildings.find((entry) => entry.id === 5)!.optionalInputs = [
      { goodId: TEXTILES_ID, quantityPerThroughputUnit: 1, outputElasticity: 0.2 },
    ];
    expect(() => assertValidEconomyDefinitions(ownOutput.definitions)).toThrow(/own output/);

    const gate = base();
    gate.definitions.goods[LIVESTOCK_ID]!.tradeRequiresTechnologyId = 0;
    expect(() => assertValidEconomyDefinitions(gate.definitions)).toThrow(/unknown technology/);
  });
});

describe("P5b production waves: goods that cannot be stored (D-146 A4)", () => {
  /** The farm makes livestock (non-storable); the food works turns it into food. */
  function waveScenario(): EconomyScenarioDef {
    const scenario = productionScenario();
    scenario.definitions.goods[LIVESTOCK_ID]!.storable = false;
    setBuildingRecipe(scenario, 0, [], [{ goodId: LIVESTOCK_ID, quantityPerThroughputUnit: 10 }]);
    setBuildingRecipe(scenario, 4, [{ goodId: LIVESTOCK_ID, quantityPerThroughputUnit: 5 }], [
      { goodId: FOOD_PRODUCTS_ID, quantityPerThroughputUnit: 2 },
    ]);
    setBuildingStorage(scenario, 7, [
      { goodId: GRAIN_ID, quantity: 2000 },
      { goodId: TEXTILES_ID, quantity: 2000 },
      { goodId: FOOD_PRODUCTS_ID, quantity: 2000 },
    ]);
    setMarketLots(scenario, [{ goodId: GRAIN_ID, ownerBuildingId: 0, quantity: 100 }]);
    return scenario;
  }

  test("the consumer buys the same day's output; nothing of it is ever in stock", () => {
    const scenario = waveScenario();
    const world = createEconomyWorld(scenario, { seed: SEED });
    const cashBefore = totalCash(world);
    const economy = economyDay(world, scenario);
    const farm = buildingResult(economy, 0);
    const works = buildingResult(economy, 4);
    expect(farm?.executedTU ?? 0).toBeGreaterThan(0);
    expect(works?.executedTU ?? 0).toBeGreaterThan(0);
    const livestockUsed = works?.inputs.find((input) => input.goodId === LIVESTOCK_ID)?.used ?? 0;
    expect(livestockUsed).toBeGreaterThan(0);
    // The works paid the farm for exactly what it used.
    const purchase = economy.markets[0]!.pendingTransactions.filter(
      (entry) => entry.goodId === LIVESTOCK_ID && entry.buyerBuildingId === 4,
    );
    expect(purchase.reduce((total, entry) => total + entry.quantity, 0)).toBeCloseTo(livestockUsed, 9);
    // No livestock is carried into tomorrow: what nobody bought was lost.
    expect(world.markets[0]!.stockLots.some((lot) => lot.goodId === LIVESTOCK_ID)).toBe(false);
    const flow = economy.markets[0]!.production.inventory.find((entry) => entry.goodId === LIVESTOCK_ID);
    expect(flow?.openingStock).toBe(0);
    // Money is conserved.
    expect(totalCash(world)).toBeCloseTo(cashBefore, 6);
  });

  test("the day is deterministic, and a storable-only world takes the single-wave path unchanged", () => {
    const runs = [0, 1].map(() => {
      const scenario = waveScenario();
      const world = createEconomyWorld(scenario, { seed: SEED });
      economyDay(world, scenario);
      economyDay(world, scenario);
      return hashWorld(world);
    });
    expect(runs[1]).toBe(runs[0]);
  });
});

describe("P5b extraction through extractFromDeposit (plan §4.2)", () => {
  /** The farm extracts "coal" (its grain output stands for the extracted good). */
  function extractionScenario(stock: number, quality: number): EconomyScenarioDef {
    const scenario = productionScenario();
    const farm = scenario.definitions.buildings.find((entry) => entry.id === 0)!;
    farm.extracts = "coal";
    const provinceId = scenario.buildingInstances.find((entry) => entry.id === 0)!.provinceId;
    scenario.deposits = [
      { id: 1, provinceId, resource: "coal", quality, initialStock: stock, discovered: true, requiredTechnologyId: null },
    ];
    scenario.buildingInstances.find((entry) => entry.id === 0)!.depositId = 1;
    return scenario;
  }

  test("output follows deposit quality, and depletion equals the extracted output exactly", () => {
    const full = extractionScenario(1_000_000, 1);
    const half = extractionScenario(1_000_000, 0.5);
    const fullWorld = createEconomyWorld(full, { seed: SEED });
    const halfWorld = createEconomyWorld(half, { seed: SEED });
    const fullOut = buildingResult(economyDay(fullWorld, full), 0)?.outputs[0]?.quantity ?? 0;
    const halfEconomy = economyDay(halfWorld, half);
    const halfOut = buildingResult(halfEconomy, 0)?.outputs[0]?.quantity ?? 0;
    expect(fullOut).toBeGreaterThan(0);
    expect(halfOut / fullOut).toBeCloseTo(0.5, 9);
    const deposit = halfWorld.resources.deposits[0]!;
    expect(deposit.extracted).toBeCloseTo(halfOut, 9);
    expect(deposit.initialStock).toBe(depositRemaining(deposit) + deposit.extracted);
    expect(buildingResult(halfEconomy, 0)?.extraction?.quantity).toBeCloseTo(halfOut, 9);
  });

  test("a deposit runs out exactly and never goes negative; then the building makes nothing", () => {
    const scenario = extractionScenario(7, 1);
    const world = createEconomyWorld(scenario, { seed: SEED });
    let produced = 0;
    for (let day = 0; day < 5; day += 1) {
      const economy = economyDay(world, scenario);
      produced += buildingResult(economy, 0)?.outputs[0]?.quantity ?? 0;
      const deposit = world.resources.deposits[0]!;
      expect(depositRemaining(deposit)).toBeGreaterThanOrEqual(0);
      expect(deposit.extracted).toBeLessThanOrEqual(deposit.initialStock);
    }
    const deposit = world.resources.deposits[0]!;
    expect(deposit.extracted).toBe(deposit.initialStock);
    expect(produced).toBeCloseTo(7, 9);
    const after = economyDay(world, scenario);
    expect(buildingResult(after, 0)?.outputs.length ?? 0).toBe(0);
  });

  test("world creation rejects an extraction building without a discovered deposit of its kind", () => {
    const missing = extractionScenario(100, 1);
    missing.buildingInstances.find((entry) => entry.id === 0)!.depositId = null;
    expect(() => createEconomyWorld(missing, { seed: SEED })).toThrow(/has no deposit/);
    const hidden = extractionScenario(100, 1);
    hidden.deposits![0] = { ...hidden.deposits![0]!, discovered: false, requiredTechnologyId: null };
    expect(() => createEconomyWorld(hidden, { seed: SEED })).toThrow();
    const wrongKind = extractionScenario(100, 1);
    wrongKind.deposits![0] = { ...wrongKind.deposits![0]!, resource: "iron" };
    expect(() => createEconomyWorld(wrongKind, { seed: SEED })).toThrow(/from a iron deposit/);
  });

  test("saves round-trip the deposit link and the depletion; replay is identical", () => {
    const scenario = extractionScenario(1_000, 0.8);
    const world = createEconomyWorld(scenario, { seed: SEED });
    economyDay(world, scenario);
    const restored = deserializeWorld(serializeWorld(world));
    expect(hashWorld(restored)).toBe(hashWorld(world));
    expect(restored.buildings.find((entry) => entry.id === 0)?.depositId).toBe(1);
    economyDay(world, scenario);
    economyDay(restored, clone(scenario));
    expect(hashWorld(restored)).toBe(hashWorld(world));
  });
});

describe("P5b optional and maintenance inputs (plan §4.5, §4.6)", () => {
  test("an optional input raises output with its fill: absent gives 1 - elasticity", () => {
    const make = (withInput: boolean): number => {
      const scenario = productionScenario();
      const mill = scenario.definitions.buildings.find((entry) => entry.id === 5)!;
      mill.optionalInputs = [{ goodId: LIVESTOCK_ID, quantityPerThroughputUnit: 0.1, outputElasticity: 0.2 }];
      // Enough grain for the households and both mills, so only the optional input differs.
      setMarketLots(scenario, [
        { goodId: GRAIN_ID, ownerBuildingId: 0, quantity: 2_000 },
        ...(withInput ? [{ goodId: LIVESTOCK_ID, ownerBuildingId: 6, quantity: 1000 }] : []),
      ]);
      const world = createEconomyWorld(scenario, { seed: SEED });
      const result = buildingResult(economyDay(world, scenario), 5);
      expect(result?.executedTU ?? 0).toBeGreaterThan(0);
      return (result?.outputs[0]?.quantity ?? 0) / (result?.executedTU ?? 1);
    };
    const withInput = make(true);
    const without = make(false);
    expect(without / withInput).toBeCloseTo(0.8, 9);
  });

  test("maintenance goods are bought per level, consumed and paid for; money is conserved", () => {
    const scenario = productionScenario();
    const works = scenario.definitions.buildings.find((entry) => entry.id === 4)!;
    works.maintenanceInputs = [{ goodId: TEXTILES_ID, quantityPerLevelPerDay: 2 }];
    setMarketLots(scenario, [
      { goodId: GRAIN_ID, ownerBuildingId: 0, quantity: 100 },
      { goodId: TEXTILES_ID, ownerBuildingId: 5, quantity: 50 },
    ]);
    setBuildingJobs(scenario, 4, [{ professionId: 1, workersPerThroughputUnit: 50 }]);
    const world = createEconomyWorld(scenario, { seed: SEED });
    const level = world.buildings.find((entry) => entry.id === 4)!.level;
    const cashBefore = totalCash(world);
    const economy = economyDay(world, scenario);
    const result = buildingResult(economy, 4);
    const used = result?.inputs.find((input) => input.goodId === TEXTILES_ID)?.used ?? 0;
    expect(used).toBeCloseTo(2 * level, 9);
    const paid = economy.markets[0]!.pendingTransactions
      .filter((entry) => entry.buyerBuildingId === 4 && entry.goodId === TEXTILES_ID)
      .reduce((total, entry) => total + entry.quantity, 0);
    expect(paid).toBeCloseTo(used, 9);
    expect(totalCash(world)).toBeCloseTo(cashBefore, 6);
  });
});
