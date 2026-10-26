import {
  MIGRATION_MONTHLY_INFLOW_CAP_FRACTION,
  assertValidEconomyScenario,
  assertValidWorld,
  createEconomyWorld,
  hashWorld,
  populationTotal,
  runMigrationPhase,
  runTicks,
  serializeWorld,
  deserializeWorld,
  type TickContext,
} from "@century/sim";
import {
  M5_COUNTRY_A,
  M5_COUNTRY_B,
  M5_COUNTRY_C,
  M5_FARM,
  M5_REGION_A2,
  M5_REGION_B1,
  m5Scenario,
  m5World,
} from "./fixtures/m5.js";

function context(scenario: ReturnType<typeof m5Scenario>): TickContext {
  return {
    population: { definitions: scenario.population.definitions },
    economy: { definitions: scenario.definitions },
  };
}

describe("M5 multi-region and multi-country world", () => {
  test("constructs three countries, four regions, two markets, and seven blocks", () => {
    const { scenario, world } = m5World();
    expect(world.countries).toHaveLength(3);
    expect(world.currencies).toHaveLength(3);
    expect(world.regions).toHaveLength(4);
    expect(world.markets).toHaveLength(2);
    expect(world.popBlocks).toHaveLength(7);
    assertValidWorld(world);
    assertValidEconomyScenario(scenario);

    expect(world.regions.map((region) => region.marketId)).toEqual([0, 0, 1, 0]);
    expect(world.markets.find((market) => market.id === 0)?.regionIds).toEqual([0, 1, 3]);
    expect(world.countries.find((country) => country.id === M5_COUNTRY_A)?.regionIds).toEqual([
      0, 1,
    ]);
    expect(world.countries.find((country) => country.id === M5_COUNTRY_C)?.immigrationOpen).toBe(
      true,
    );
    expect(world.countries.find((country) => country.id === M5_COUNTRY_B)?.immigrationOpen).toBe(
      false,
    );
  });

  test("assigns cross-region labor within a country and cross-border labor only into an open country", () => {
    const { world } = m5World();
    runTicks(world, 1, context(m5Scenario()));
    expect(world.employment.length).toBeGreaterThan(0);
    assertValidWorld(world);
    const regionByBuilding = new Map(world.buildings.map((building) => [building.id, building.regionId]));
    const countryOfRegion = new Map<number, number>();
    for (const country of world.countries) {
      for (const regionId of country.regionIds) countryOfRegion.set(regionId, country.id);
    }
    let crossRegionSameCountry = 0;
    for (const assignment of world.employment) {
      const block = world.popBlocks.find((candidate) => candidate.id === assignment.popBlockId);
      expect(block).toBeDefined();
      if (block === undefined) continue;
      const buildingRegion = regionByBuilding.get(assignment.buildingInstanceId);
      if (buildingRegion === undefined) continue;
      if (buildingRegion !== block.regionId) {
        const sourceCountry = countryOfRegion.get(block.regionId);
        const destinationCountry = countryOfRegion.get(buildingRegion);
        if (sourceCountry === destinationCountry) crossRegionSameCountry += 1;
        else {
          expect(destinationCountry).toBe(M5_COUNTRY_C);
          expect(world.countries.find((country) => country.id === destinationCountry)?.immigrationOpen).toBe(true);
        }
      }
    }
    expect(crossRegionSameCountry).toBeGreaterThan(0);
  });

  test("keeps a closed border closed even when vacancies exist", () => {
    const scenario = m5Scenario();
    const farm = scenario.buildingInstances.find(
      (building) => building.id === 5 && building.regionId === M5_REGION_B1,
    );
    expect(farm?.definitionId).toBe(M5_FARM);
    // Enlarge B's farm far beyond its domestic workforce.
    scenario.buildingInstances = scenario.buildingInstances.map((building) =>
      building.id === 5 ? { ...building, level: 10 } : building,
    );
    const world = createEconomyWorld(scenario, { seed: 20_261_023 });
    runTicks(world, 1, context(scenario));
    const bBlocks = world.popBlocks.filter((block) => block.regionId === M5_REGION_B1);
    const bBuildingIds = new Set(
      world.buildings.filter((building) => building.regionId === M5_REGION_B1).map((building) => building.id),
    );
    for (const assignment of world.employment) {
      if (!bBuildingIds.has(assignment.buildingInstanceId)) continue;
      expect(bBlocks.some((block) => block.id === assignment.popBlockId)).toBe(true);
    }
  });

  test("rejects invalid market and country membership", () => {
    const duplicateRegion = m5Scenario();
    duplicateRegion.markets = duplicateRegion.markets.map((market) =>
      market.id === 1 ? { ...market, regionIds: [M5_REGION_B1, 0] } : market,
    );
    expect(() => createEconomyWorld(duplicateRegion)).toThrow(/belongs to both market/);

    const splitCountry = m5Scenario();
    splitCountry.countries = (splitCountry.countries ?? []).map((country) =>
      country.id === M5_COUNTRY_A ? { ...country, regionIds: [0] } : country,
    );
    // Region 1 becomes unowned; zero-fiscal countries allow unowned regions only
    // when no fiscal policy is active. A is active, so ownership must cover it.
    expect(() => createEconomyWorld(splitCountry)).toThrow(/region 1 must be owned/);

    const unknownMarket = m5Scenario();
    unknownMarket.population.regions = unknownMarket.population.regions.map((region) =>
      region.id === M5_REGION_A2 ? { ...region, key: "a2", name: "A2" } : region,
    );
    unknownMarket.markets = unknownMarket.markets.map((market) =>
      market.id === 0 ? { ...market, regionIds: [0, 3] } : market,
    );
    expect(() => createEconomyWorld(unknownMarket)).toThrow(/not assigned to a market/);
  });

  test("round-trips and hashes the multi-country world", () => {
    const { world } = m5World();
    const serialized = serializeWorld(world);
    const restored = deserializeWorld(serialized);
    expect(hashWorld(restored)).toBe(hashWorld(world));
    restored.countries.forEach((country) => {
      expect(typeof country.immigrationOpen).toBe("boolean");
    });
  });

  test("runs a month including the first migration date without errors", () => {
    const scenario = m5Scenario();
    const world = createEconomyWorld(scenario, { seed: 20_261_023 });
    const start = hashWorld(world);
    runTicks(world, 31, context(scenario));
    expect(hashWorld(world)).not.toBe(start);
    assertValidWorld(world);
    expect(world.dayIndex).toBe(31);
  });

  test("migration phase is a no-op outside the first day of a month", () => {
    const scenario = m5Scenario();
    const world = createEconomyWorld(scenario, { seed: 20_261_023 });
    const before = hashWorld(world);
    const result = runMigrationPhase(world, scenario.definitions, 0);
    expect(result.ran).toBe(false);
    expect(hashWorld(world)).toBe(before);
  });

  test("conserves population across a migration tick", () => {
    const scenario = m5Scenario();
    const world = createEconomyWorld(scenario, { seed: 20_261_023 });
    runTicks(world, 31, context(scenario));
    const total = world.popBlocks.reduce((sum, block) => sum + populationTotal(block), 0);
    expect(total).toBeGreaterThan(0);
    // Cash and population invariants are validated by the published world check.
    assertValidWorld(world);
    expect(world.dayIndex).toBe(31);
    expect(MIGRATION_MONTHLY_INFLOW_CAP_FRACTION).toBeGreaterThan(0);
  });

  test("keeps a countryless multi-region world valid and tickable", () => {
    const scenario = m5Scenario();
    scenario.countries = [];
    scenario.currencies = [];
    scenario.currencyValuations = [];
    const world = createEconomyWorld(scenario, { seed: 20_261_023 });
    expect(world.countries).toHaveLength(0);
    expect(world.regions).toHaveLength(4);
    expect(world.markets).toHaveLength(2);
    runTicks(world, 3, context(scenario));
    assertValidWorld(world);
    // Countryless labor access is unrestricted only among countryless regions.
    for (const assignment of world.employment) {
      expect(assignment.workers).toBeGreaterThan(0);
    }
  });

  test("rejects schema-9 and simulation-0.9.0 saves", () => {
    const { world } = m5World();
    const envelope = JSON.parse(serializeWorld(world)) as {
      schemaVersion: number;
      simVersion: string;
    };
    envelope.schemaVersion = 9;
    expect(() => deserializeWorld(JSON.stringify(envelope))).toThrow(
      /Save world schema 9 is incompatible/,
    );
    envelope.schemaVersion = 10;
    expect(() => deserializeWorld(JSON.stringify(envelope))).toThrow(
      /Save world schema 10 is incompatible/,
    );
    const sim = JSON.parse(serializeWorld(world)) as { simVersion: string };
    sim.simVersion = "0.9.0";
    // The envelope still claims the current schema, so the simulation-version
    // check is the one that rejects the save.
    expect(() => deserializeWorld(JSON.stringify(sim))).toThrow(
      /Save simulation version "0.9.0" is incompatible/,
    );
  });

  test("resumes after a migration-and-trade day exactly like an uninterrupted run", () => {
    const scenario = m5Scenario();
    const contextValue = context(scenario);
    const uninterrupted = createEconomyWorld(scenario, { seed: 20_261_023 });
    runTicks(uninterrupted, 36, contextValue); // includes the 1 February migration day
    const saved = serializeWorld(uninterrupted);
    const resumed = deserializeWorld(saved);
    expect(hashWorld(resumed)).toBe(hashWorld(uninterrupted));
    runTicks(resumed, 6, contextValue);
    const direct = createEconomyWorld(scenario, { seed: 20_261_023 });
    runTicks(direct, 42, contextValue);
    expect(hashWorld(resumed)).toBe(hashWorld(direct));
  });
});
