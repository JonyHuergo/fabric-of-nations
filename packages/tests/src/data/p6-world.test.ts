/**
 * P6 (D-153): the demand system, saving and housing in the 1900 world.
 *
 * - The scenario carries the demand system; every block starts at crowding 1.0 and each
 *   province's dwellings equal its persons ÷ its 1900 persons per dwelling.
 * - The generator's coefficients mirror the simulation's constants.
 * - Acceptance (data): the food share falls with income for the 1900 committed basket
 *   (food's committed share exceeds its marginal share at the bottom of the schedule, and
 *   the schedule's food share does not rise), and planned 1900 food shares are higher in
 *   British India than in the United States.
 * - Two days of the 1900 world: the demand result exists, dwellings are conserved through
 *   purchases and depreciation, and the save round-trips with the P6 fields.
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadM11World } from "@century/data";
import {
  blockCrowding,
  CASH_RESERVE_DAYS,
  createEconomyWorld,
  deserializeWorld,
  DWELLING_DEPRECIATION_RATE_PER_YEAR,
  DWELLING_INCOME_ELASTICITY,
  encodeWorld,
  hashWorld,
  MARGINAL_PROPENSITY_TO_CONSUME,
  populationTotal,
  serializeWorld,
  tick,
  WEALTH_CONSUMPTION_RATE_PER_YEAR,
} from "@century/sim";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_ROOT = resolve(HERE, "../../../data/data");
const calibration = JSON.parse(readFileSync(join(DATA_ROOT, "historical/p5b/calibration_1900.json"), "utf8")) as {
  p6: {
    coefficients: {
      marginalPropensityToConsume: Record<string, number>;
      wealthConsumptionRatePerYear: number;
      cashReserveDays: number;
      dwellingDepreciationRatePerYear: number;
      dwellingIncomeElasticity: number;
    };
    countries: Record<string, { foodShare: number; blocksAboveIncome: number }>;
  };
};

describe("P6 in the 1900 world", () => {
  const scenario = loadM11World();

  test("the generator's coefficients mirror the simulation constants", () => {
    const c = calibration.p6.coefficients;
    expect(c.marginalPropensityToConsume).toEqual({ ...MARGINAL_PROPENSITY_TO_CONSUME });
    expect(c.wealthConsumptionRatePerYear).toBe(WEALTH_CONSUMPTION_RATE_PER_YEAR);
    expect(c.cashReserveDays).toBe(CASH_RESERVE_DAYS);
    expect(c.dwellingDepreciationRatePerYear).toBe(DWELLING_DEPRECIATION_RATE_PER_YEAR);
    expect(c.dwellingIncomeElasticity).toBe(DWELLING_INCOME_ELASTICITY);
  });

  test("acceptance (data): the food share falls with income for the 1900 basket", () => {
    const system = scenario.population.definitions.demandSystem;
    expect(system).toBeDefined();
    if (system === undefined) return;
    const food = system.categories.find((category) => category.key === "food");
    expect(food?.committedAtSubsistenceTier).toBe(true);
    const price = new Map(scenario.definitions.goods.map((good) => [good.key, good.basePrice1900RUSD]));
    for (const urban of [0, 1]) {
      let committedFood = 0;
      let committedAll = 0;
      for (const category of system.categories) {
        for (const good of category.goods) {
          const retail =
            (price.get(good.goodKey) ?? 0) +
            urban * (good.retailCommercePerUnit * (price.get(system.commerceGoodKey) ?? 0) + good.retailTransportPerUnit * (price.get(system.transportGoodKey) ?? 0));
          const value = retail * good.committedPerAdultEquivalentPerDay;
          committedAll += value;
          if (category.key === "food") committedFood += value;
        }
      }
      expect(committedFood / committedAll).toBeGreaterThan(system.knots[0]?.marginalShares.food ?? 1);
    }
    const shares = system.knots.map((knot) => knot.marginalShares.food ?? 0);
    for (let index = 1; index < shares.length; index += 1) expect(shares[index]).toBeLessThanOrEqual((shares[index - 1] ?? 0) + 1e-12);
    // Planned 1900 food shares: poorer countries spend more of their consumption on food.
    const countries = calibration.p6.countries;
    expect(countries.GBR?.foodShare).toBeLessThan(countries.RUS?.foodShare ?? 0);
    expect(countries.USA?.foodShare).toBeLessThan(countries.CHN?.foodShare ?? 0);
  });

  test("blocks start at crowding 1 and provinces hold their census dwellings", () => {
    const world = createEconomyWorld(scenario, { seed: 20_261_023 });
    let checked = 0;
    for (const province of world.provinceEconomies) {
      if (province.housingReferencePersonsPerDwelling === null) continue;
      const blocks = world.popBlocks.filter((block) => block.provinceId === province.id);
      const persons = blocks.reduce((sum, block) => sum + populationTotal(block), 0);
      if (persons <= 0) continue;
      const dwellings = blocks.reduce((sum, block) => sum + block.dwellings, 0);
      expect(dwellings).toBeCloseTo(persons / province.housingReferencePersonsPerDwelling, 3);
      for (const block of blocks) if (populationTotal(block) > 0) expect(blockCrowding(block)).toBe(1);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(1000);
  });

  test("two days: demand result, dwelling conservation and save round trip", () => {
    const world = createEconomyWorld(scenario, { seed: 20_261_023 });
    // D-155: summary detail (D-137) keeps the demand result and gives the same world.
    const context = { population: { definitions: scenario.population.definitions }, economy: { definitions: scenario.definitions }, detail: "summary" as const };
    const start = world.popBlocks.reduce((sum, block) => sum + block.dwellings, 0);
    let bought = 0;
    let depreciated = 0;
    for (let day = 0; day < 2; day += 1) {
      const result = tick(world, context);
      const demand = result.economy?.demand ?? null;
      expect(demand).not.toBeNull();
      bought += demand?.housing.dwellingsBought ?? 0;
      depreciated += demand?.housing.dwellingsDepreciated ?? 0;
    }
    const end = world.popBlocks.reduce((sum, block) => sum + block.dwellings, 0);
    expect(end).toBeCloseTo(start + bought - depreciated, 3);
    expect(encodeWorld(world).markets[0]).toHaveProperty("priceSmoothedRUSD");
    const restored = deserializeWorld(serializeWorld(world));
    expect(hashWorld(restored)).toBe(hashWorld(world));
  });
});
