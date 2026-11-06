import {
  assertValidWorld,
  createEconomyWorld,
  deserializeWorld,
  hashWorld,
  populationTotal,
  runTicks,
  serializeWorld,
} from "@century/sim";
import {
  buildM5HistoricalScenario,
  loadM5EightPolities,
  loadM5HistoricalData,
  validateM5HistoricalData,
  type HistoricalData,
} from "@century/data";

function cloneData(data: HistoricalData): HistoricalData {
  return JSON.parse(JSON.stringify(data)) as HistoricalData;
}

describe("M5 historical data pipeline", () => {
  test("loads and validates the eight authored polities", () => {
    const data = loadM5HistoricalData();
    const validation = validateM5HistoricalData(data);
    expect(validation.errors).toEqual([]);
    expect(data.countries).toHaveLength(8);
    expect(data.provinces).toHaveLength(16);
    expect(data.markets).toHaveLength(5);
    // M9 adds one academics block per province (population moved from the clerks
    // block, so country totals are unchanged): 64 + 16 = 80.
    expect(data.populations).toHaveLength(80);
    expect(data.buildings).toHaveLength(113);
    expect(data.employment).toHaveLength(0);
    expect(data.calibration).toHaveLength(16);
    expect(validation.warnings.length).toBeGreaterThan(0);
  });

  test("builds, constructs, and ticks the eight polities together", () => {
    const scenario = loadM5EightPolities();
    const world = createEconomyWorld(scenario, { seed: 20_261_023 });
    expect(world.countries).toHaveLength(8);
    expect(world.provinceEconomies).toHaveLength(16);
    expect(world.markets).toHaveLength(5);
    expect(world.popBlocks).toHaveLength(80);
    expect(world.buildings).toHaveLength(113);
    assertValidWorld(world);
    const populationBefore = world.popBlocks.reduce(
      (total, block) => total + populationTotal(block),
      0,
    );
    runTicks(world, 3, {
      population: { definitions: scenario.population.definitions },
      economy: { definitions: scenario.definitions },
    });
    assertValidWorld(world);
    const populationAfter = world.popBlocks.reduce(
      (total, block) => total + populationTotal(block),
      0,
    );
    // No migration is due in the first days; only births/deaths change population.
    expect(populationAfter).toBeGreaterThan(populationBefore * 0.999);
    expect(populationAfter).toBeLessThan(populationBefore * 1.001);
    expect(world.employment.length).toBeGreaterThan(0);
  });

  test("population targets and provisional occupation targets are satisfied by authored data", () => {
    const data = loadM5HistoricalData();
    for (const country of data.countries) {
      const provinceIds = new Set(country.provinceIds);
      const blocks = data.populations.filter((block) => provinceIds.has(block.provinceId));
      const total = blocks.reduce((sum, block) => sum + block.population, 0);
      const peasants = blocks
        .filter((block) => block.professionKey === "peasants")
        .reduce((sum, block) => sum + block.population, 0);
      const populationTarget = data.calibration.find(
        (target) => target.countryTag === country.tag && target.metric === "totalPopulation",
      );
      const occupationTarget = data.calibration.find(
        (target) =>
          target.countryTag === country.tag && target.metric === "peasantPopulationShare",
      );
      expect(populationTarget).toBeDefined();
      expect(occupationTarget).toBeDefined();
      if (populationTarget === undefined || occupationTarget === undefined) continue;
      expect(populationTarget.status).toBe("source-backed");
      expect(occupationTarget.status).toBe("provisional");
      expect(occupationTarget.confidence).toBe("low");
      const relative = populationTarget.toleranceRelative ?? 0;
      expect(Math.abs(total - populationTarget.target)).toBeLessThanOrEqual(
        populationTarget.target * relative,
      );
      expect(Math.abs(peasants / total - occupationTarget.target)).toBeLessThanOrEqual(
        occupationTarget.toleranceAbsolute ?? 0,
      );
    }
  });

  test("declaration order does not change the built scenario or world hash", () => {
    const data = loadM5HistoricalData();
    const reversed = cloneData(data);
    const reversedData: HistoricalData = {
      ...reversed,
      countries: [...reversed.countries].reverse(),
      provinces: [...reversed.provinces].reverse(),
      markets: [...reversed.markets].reverse(),
      populations: [...reversed.populations].reverse(),
      buildings: [...reversed.buildings].reverse(),
    };
    const first = buildM5HistoricalScenario(data);
    const second = buildM5HistoricalScenario(reversedData);
    expect(hashWorld(createEconomyWorld(second, { seed: 7 }))).toBe(
      hashWorld(createEconomyWorld(first, { seed: 7 })),
    );
  });

  test("round-trips a multi-country save and resumes identically", () => {
    const scenario = loadM5EightPolities();
    const context = {
      population: { definitions: scenario.population.definitions },
      economy: { definitions: scenario.definitions },
    };
    const uninterrupted = createEconomyWorld(scenario, { seed: 20_261_023 });
    runTicks(uninterrupted, 12, context);
    const saved = serializeWorld(uninterrupted);

    const resumed = deserializeWorld(saved);
    expect(hashWorld(resumed)).toBe(hashWorld(uninterrupted));
    const direct = createEconomyWorld(scenario, { seed: 20_261_023 });
    runTicks(direct, 24, context);
    runTicks(resumed, 12, context);
    expect(hashWorld(resumed)).toBe(hashWorld(direct));
  });

  test("validator reports deterministic, actionable structural errors", () => {
    const data = loadM5HistoricalData();
    const broken = cloneData(data) as unknown as {
      countries: { id: number; provinceIds: number[] }[];
      provinces: { id: number }[];
      markets: { provinceIds: number[] }[];
      populations: { provinceId: number; professionKey: string }[];
      calibration: { id: string }[];
    };
    broken.countries[0] = { ...broken.countries[0]!, id: broken.countries[1]!.id };
    broken.provinces[0] = { ...broken.provinces[0]!, id: broken.provinces[1]!.id };
    broken.populations[0] = {
      ...broken.populations[0]!,
      provinceId: 2,
      professionKey: "unknown-profession",
    };
    broken.calibration[0] = { ...broken.calibration[0]!, id: broken.calibration[1]!.id };
    const validationA = validateM5HistoricalData(broken as unknown as HistoricalData);
    const validationB = validateM5HistoricalData(broken as unknown as HistoricalData);
    expect(validationA.errors.length).toBeGreaterThan(0);
    expect(validationA.errors).toEqual(validationB.errors);
    expect(validationA.errors).toEqual([...validationA.errors].sort());
    expect(validationA.errors.some((error) => error.includes("duplicated"))).toBe(true);
    expect(validationA.errors.some((error) => error.includes("unknown-profession"))).toBe(true);
  });

  test("validates source metadata, currency, and fiscal inputs", () => {
    const data = loadM5HistoricalData();
    const broken = cloneData(data) as unknown as {
      countries: {
        id: number;
        sourceIds: string[];
        currency: { valuation: { status: string; rusdPerUnit?: number; sourceIds?: string[] } };
        fiscal: { incomeTaxRate: number };
      }[];
      calibration: { sourceIds: string[] }[];
    };
    broken.countries[0]!.sourceIds = ["missing-source"];
    broken.countries[1]!.currency.valuation = {
      status: "specified",
      rusdPerUnit: -1,
      sourceIds: ["missing-source"],
    };
    broken.countries[2]!.fiscal.incomeTaxRate = 1.5;
    broken.calibration[0]!.sourceIds = [];
    const validation = validateM5HistoricalData(broken as unknown as HistoricalData);
    expect(validation.errors.some((error) => error.includes("missing-source"))).toBe(true);
    expect(validation.errors.some((error) => error.includes("rusdPerUnit"))).toBe(true);
    expect(validation.errors.some((error) => error.includes("incomeTaxRate"))).toBe(true);
    expect(validation.errors.some((error) => error.includes("at least one source"))).toBe(true);
  });

  test("rejects an authored population outside the source-backed target", () => {
    const data = loadM5HistoricalData();
    const broken = cloneData(data) as unknown as {
      populations: { provinceId: number; population: number }[];
    };
    // First population belongs to the United States; halving it breaks the target.
    broken.populations[0]!.population = Math.floor(broken.populations[0]!.population / 2);
    const validation = validateM5HistoricalData(broken as unknown as HistoricalData);
    expect(validation.errors.some((error) => error.includes("misses target"))).toBe(true);
  });
});
