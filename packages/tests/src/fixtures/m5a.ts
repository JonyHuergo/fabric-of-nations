import {
  createEconomyWorld,
  tick,
  type EconomyScenarioDef,
  type TickContext,
  type TickResult,
} from "@century/sim";
import { m5Scenario } from "./m5.js";

export const M5A_STATE_BUILDING = 5;
export const M5A_TREASURY_B = 9001;
export const M5A_COUNTRY_B = 1;

/**
 * M5 fixture variant with M5a enabled and deliberately profitable farms.
 *
 * The shared M3-style farm recipe is not profitable at its synthetic scale, so
 * this fixture lowers farm staffing/upkeep and raises the 1900 grain price to
 * create a controlled positive period result. Country B's farm is state-owned and
 * remits to the B treasury.
 */
export function m5aScenario(): EconomyScenarioDef {
  const scenario = m5Scenario();
  scenario.profitDistribution = {
    enabled: true,
    privatePayoutRate: 0.5,
    stateRemittanceRate: 1,
  };
  const farm = scenario.definitions.buildings.find((building) => building.key === "farm");
  if (farm === undefined) throw new Error("M5a fixture requires the farm definition");
  farm.jobs = [{ professionId: 0, workersPerThroughputUnit: 100 }];
  farm.dailyUpkeepSUSDAtLevelOne = 1;
  farm.ownershipAllowed = ["private", "state"];
  scenario.markets = scenario.markets.map((market) => ({
    ...market,
    priceSUSD: market.priceSUSD.map((price, goodId) => (goodId === 0 ? 0.5 : price)),
  }));
  scenario.buildingInstances = scenario.buildingInstances.map((building) =>
    building.id === M5A_STATE_BUILDING
      ? { ...building, ownerKind: "state", ownerAccountId: M5A_TREASURY_B }
      : building,
  );
  return scenario;
}

export function m5aContext(scenario: EconomyScenarioDef): TickContext {
  return {
    population: { definitions: scenario.population.definitions },
    economy: { definitions: scenario.definitions },
  };
}

export function runM5aMonth(
  scenario: EconomyScenarioDef,
  ticks = 31,
): { world: ReturnType<typeof createEconomyWorld>; last: TickResult } {
  const world = createEconomyWorld(scenario, { seed: 20_261_023 });
  return { world, last: tickM5a(world, scenario, ticks) };
}

export function tickM5a(
  world: ReturnType<typeof createEconomyWorld>,
  scenario: EconomyScenarioDef,
  ticks: number,
): TickResult {
  let last: TickResult | undefined;
  for (let index = 0; index < ticks; index += 1) last = tick(world, m5aContext(scenario));
  if (last === undefined) throw new Error("no M5a tick ran");
  return last;
}
