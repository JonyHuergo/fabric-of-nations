import {
  createEconomyWorld,
  type EconomyScenarioDef,
  type MarketDayInput,
  type World,
} from "@century/sim";
import {
  FOOD_PRODUCTS_ID,
  GRAIN_ID,
  LIVESTOCK_ID,
  TEXTILES_ID,
  productionScenario,
  setBuildingStorage,
  setMarketLots,
  reservation,
} from "./m3c.js";

export const CLOTHING_ID = 6;
export const FOOD_ID = FOOD_PRODUCTS_ID;

/** Clerks: the M3 fixture's block for them has no population after `productionScenario`. */
const M3D_IDLE_PROFESSION_ID = 2;

export interface MarketFixtureOptions {
  readonly lots?: readonly { goodId: number; ownerBuildingId: number; quantity: number }[];
  readonly produce?: boolean;
}

export function marketScenario(options: MarketFixtureOptions = {}): EconomyScenarioDef {
  const scenario = productionScenario();
  setBuildingStorage(scenario, 7, [
    { goodId: GRAIN_ID, quantity: 2000 },
    { goodId: LIVESTOCK_ID, quantity: 2000 },
    { goodId: TEXTILES_ID, quantity: 2000 },
    { goodId: FOOD_PRODUCTS_ID, quantity: 2000 },
    { goodId: CLOTHING_ID, quantity: 2000 },
  ]);
  setMarketLots(
    scenario,
    [...(options.lots ?? [
      { goodId: GRAIN_ID, ownerBuildingId: 0, quantity: 100 },
      { goodId: TEXTILES_ID, ownerBuildingId: 5, quantity: 100 },
      { goodId: CLOTHING_ID, ownerBuildingId: 6, quantity: 100 },
      { goodId: FOOD_PRODUCTS_ID, ownerBuildingId: 4, quantity: 100 },
    ])],
  );
  if (options.produce === false) {
    scenario.employment = scenario.employment.filter(
      (assignment) =>
        assignment.buildingInstanceId !== 0 &&
        assignment.buildingInstanceId !== 4 &&
        assignment.buildingInstanceId !== 5,
    );
    // D-155: the labour market staffs every job it can at creation and does not read the
    // scenario's assignment list, so the producers' jobs go to the clerks, whom this
    // fixture leaves without workers: staffing 0, capacity 0, the buildings still buyers.
    for (const definitionId of [0, 4, 5]) {
      const definition = scenario.definitions.buildings.find((candidate) => candidate.id === definitionId);
      if (definition !== undefined) {
        definition.jobs = definition.jobs.map((job) => ({ ...job, professionId: M3D_IDLE_PROFESSION_ID }));
      }
    }
  }
  return scenario;
}

export function marketWorld(options: MarketFixtureOptions = {}): {
  readonly scenario: EconomyScenarioDef;
  readonly world: World;
} {
  const scenario = marketScenario(options);
  return { scenario, world: createEconomyWorld(scenario, { seed: 20_261_023 }) };
}

export function household(
  popBlockId: number,
  tier: 1 | 3 | 6,
  goodId: number,
  desiredQuantity: number,
  fundedQuantity = desiredQuantity,
): MarketDayInput["householdDemands"][number] {
  return { popBlockId, tier, goodId, desiredQuantity, fundedQuantity };
}

export function productionDemand(
  buyerBuildingId: number,
  tier: 2 | 5,
  goodId: number,
  desiredQuantity: number,
  fundedQuantity = desiredQuantity,
): MarketDayInput["productionDemands"][number] {
  return { buyerBuildingId, tier, goodId, desiredQuantity, fundedQuantity };
}

export function marketInput(
  scenario: EconomyScenarioDef,
  world: World,
  householdDemands: MarketDayInput["householdDemands"],
  productionDemands: MarketDayInput["productionDemands"] = [],
): MarketDayInput {
  return {
    dayIndex: world.dayIndex,
    marketId: 0,
    needs: scenario.population.definitions.needs,
    householdDemands,
    productionDemands,
  };
}

export { reservation, GRAIN_ID, TEXTILES_ID, FOOD_PRODUCTS_ID };
