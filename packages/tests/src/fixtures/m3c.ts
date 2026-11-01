import { loadM3SmallEconomy } from "@century/data";
import {
  createEconomyWorld,
  deriveStockByGood,
  designatedCashTotal,
  type EconomyScenarioDef,
  type InputReservation,
  type World,
} from "@century/sim";
import {
  setBlockWorkforce,
  setBuildingJobs,
  workingAgeGroups,
} from "./m3b.js";

export { setBuildingJobs, workingAgeGroups };

export const GRAIN_ID = 0;
export const LIVESTOCK_ID = 1;
export const TEXTILES_ID = 5;
export const FOOD_PRODUCTS_ID = 7;

export function cloneProductionScenario(): EconomyScenarioDef {
  return JSON.parse(JSON.stringify(loadM3SmallEconomy())) as EconomyScenarioDef;
}

export function setBuildingRecipe(
  scenario: EconomyScenarioDef,
  definitionId: number,
  inputs: { goodId: number; quantityPerThroughputUnit: number }[],
  outputs: { goodId: number; quantityPerThroughputUnit: number }[],
): void {
  const definition = scenario.definitions.buildings.find(
    (candidate) => candidate.id === definitionId,
  );
  if (definition === undefined) throw new Error(`missing definition ${String(definitionId)}`);
  definition.inputs = inputs;
  definition.outputs = outputs;
}

export function setBuildingStorage(
  scenario: EconomyScenarioDef,
  definitionId: number,
  storage: { goodId: number; quantity: number }[],
): void {
  const definition = scenario.definitions.buildings.find(
    (candidate) => candidate.id === definitionId,
  );
  if (definition === undefined) throw new Error(`missing definition ${String(definitionId)}`);
  definition.storageCapacityByGood = storage;
}

export function setMarketLots(
  scenario: EconomyScenarioDef,
  lots: { goodId: number; ownerBuildingId: number; quantity: number }[],
): void {
  const market = scenario.markets[0];
  if (market === undefined) throw new Error("missing market");
  market.stockLots = lots;
}

export function productionScenario(): EconomyScenarioDef {
  const scenario = cloneProductionScenario();
  for (const block of scenario.population.popBlocks) {
    block.maleAgeGroups = new Array<number>(17).fill(0);
    block.femaleAgeGroups = new Array<number>(17).fill(0);
  }
  setBlockWorkforce(scenario, 0, 100, 0);
  setBlockWorkforce(scenario, 1, 200, 1);

  setBuildingRecipe(
    scenario,
    0,
    [],
    [{ goodId: GRAIN_ID, quantityPerThroughputUnit: 10 }],
  );
  setBuildingJobs(scenario, 0, [{ professionId: 0, workersPerThroughputUnit: 100 }]);
  setBuildingRecipe(
    scenario,
    4,
    [{ goodId: GRAIN_ID, quantityPerThroughputUnit: 5 }],
    [{ goodId: FOOD_PRODUCTS_ID, quantityPerThroughputUnit: 2 }],
  );
  setBuildingJobs(scenario, 4, [{ professionId: 1, workersPerThroughputUnit: 50 }]);
  setBuildingRecipe(
    scenario,
    5,
    [{ goodId: GRAIN_ID, quantityPerThroughputUnit: 5 }],
    [{ goodId: TEXTILES_ID, quantityPerThroughputUnit: 2 }],
  );
  setBuildingJobs(scenario, 5, [{ professionId: 1, workersPerThroughputUnit: 50 }]);
  setBuildingStorage(scenario, 7, [
    { goodId: GRAIN_ID, quantity: 2000 },
    { goodId: LIVESTOCK_ID, quantity: 2000 },
    { goodId: TEXTILES_ID, quantity: 2000 },
    { goodId: FOOD_PRODUCTS_ID, quantity: 2000 },
  ]);
  setMarketLots(scenario, [
    { goodId: GRAIN_ID, ownerBuildingId: 0, quantity: 100 },
  ]);
  scenario.employment = [
    { id: 0, popBlockId: 0, buildingInstanceId: 0, professionId: 0, workers: 45 },
    { id: 1, popBlockId: 1, buildingInstanceId: 4, professionId: 1, workers: 50 },
    { id: 2, popBlockId: 1, buildingInstanceId: 5, professionId: 1, workers: 50 },
  ];
  return scenario;
}

export function productionWorld(): {
  readonly scenario: EconomyScenarioDef;
  readonly world: World;
} {
  const scenario = productionScenario();
  return { scenario, world: createEconomyWorld(scenario, { seed: 20_261_023 }) };
}

export function reservation(
  buyerBuildingId: number,
  goodId: number,
  sellerBuildingId: number,
  quantity: number,
  marketId = 0,
): InputReservation {
  return { buyerBuildingId, marketId, goodId, sellerBuildingId, quantity };
}

export function stockOf(world: World, goodId: number): number {
  const market = world.markets[0];
  if (market === undefined) throw new Error("missing market");
  return deriveStockByGood(market, market.priceRUSD.length)[goodId] ?? 0;
}

export function lotQuantity(world: World, goodId: number, ownerBuildingId: number): number {
  const market = world.markets[0];
  if (market === undefined) throw new Error("missing market");
  const lot = market.stockLots.find(
    (candidate) =>
      candidate.goodId === goodId && candidate.ownerBuildingId === ownerBuildingId,
  );
  return lot?.quantity ?? 0;
}

export function totalCash(world: World): number {
  return designatedCashTotal(world.finance);
}

export function prices(world: World): number[] {
  const market = world.markets[0];
  if (market === undefined) throw new Error("missing market");
  return [...market.priceRUSD];
}
