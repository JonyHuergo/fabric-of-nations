/**
 * Historical-data loaders: validation at the data stage, data-version agreement and
 * the eight-polity M5 pipeline. Merged in D-145 from the batch-7 loader validation,
 * data-version consistency and M5 history tests.
 */
/**
 * Batch 7 — historical loader boundary validation.
 *
 * These tests construct malformed variants of the shipped historical data and
 * prove they fail in `validateM5HistoricalData`/`buildM5HistoricalScenario`
 * rather than passing the loader and failing later in world construction.
 */

import {
  createEconomyWorld,
  hashWorld,
  type EconomyScenarioDef,
  DEFAULT_DATA_VERSION,
  assertValidWorld,
  deserializeWorld,
  populationTotal,
  runTicks,
  serializeWorld,
} from "@century/sim";
import {
  HistoricalDataError,
  buildM5HistoricalScenario,
  loadM5HistoricalData,
  validateM5HistoricalData,
  type HistoricalData,
  type HistoricalEmploymentInput,
  DATA_PACKAGE_INFO,
  DATA_PACKAGE_VERSION,
  loadM2WorldAggregate,
  loadM3SmallEconomy,
  loadM5EightPolities,
} from "@century/data";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type DeepMutable<T> = T extends readonly (infer U)[]
  ? DeepMutable<U>[]
  : T extends object
    ? { -readonly [K in keyof T]: DeepMutable<T[K]> }
    : T;

function cloneData(data: HistoricalData): DeepMutable<HistoricalData> {
  return JSON.parse(JSON.stringify(data)) as DeepMutable<HistoricalData>;
}

function errorsOf(data: HistoricalData): readonly string[] {
  return validateM5HistoricalData(data).errors;
}

function employment(
  buildingKey: string,
  provinceId: number,
  professionKey: string,
  workers: number,
): HistoricalEmploymentInput {
  return { buildingKey, provinceId, professionKey, workers };
}

function buildingFor(
  data: HistoricalData,
  definitionKey: string,
  provinceId = 0,
): HistoricalData["buildings"][number] {
  const found = data.buildings.find(
    (building) => building.definitionKey === definitionKey && building.provinceId === provinceId,
  );
  if (found === undefined) throw new Error(`missing ${definitionKey} in province ${String(provinceId)}`);
  return found;
}

describe("historical loader validation consistency", () => {
  test("shipped historical data remains valid", () => {
    const data = loadM5HistoricalData();
    expect(validateM5HistoricalData(data).errors).toEqual([]);
    expect(() => buildM5HistoricalScenario(data)).not.toThrow();
  });

  test("currency valuation, fiscal, and identifier bounds fail at the data stage", () => {
    const rate = cloneData(loadM5HistoricalData());
    rate.countries[0]!.currency.valuation = {
      status: "specified",
      rusdPerUnit: 1e13,
      sourceIds: ["owid-population"],
    };
    expect(errorsOf(rate).join("\n")).toMatch(/rusdPerUnit must be in/);
    expect(() => buildM5HistoricalScenario(rate)).toThrow(HistoricalDataError);

    const budget = cloneData(loadM5HistoricalData());
    budget.countries[0]!.fiscal.welfareBudgetRUSDPerYear = 1e16;
    expect(errorsOf(budget).join("\n")).toMatch(/welfareBudgetRUSDPerYear must not exceed/);

    const key = cloneData(loadM5HistoricalData());
    key.countries[0]!.currency.key = `a${"b".repeat(32)}`;
    expect(errorsOf(key).join("\n")).toMatch(/currency.key must be at most/);

    const name = cloneData(loadM5HistoricalData());
    name.countries[0]!.name = "x".repeat(129);
    expect(errorsOf(name).join("\n")).toMatch(/name must be at most/);

    const id = cloneData(loadM5HistoricalData());
    id.countries[0]!.id = 0x1_0000_0000;
    expect(errorsOf(id).join("\n")).toMatch(/id must be an unsigned 32-bit integer/);

    const land = cloneData(loadM5HistoricalData());
    (land.provinces[0] as { arableLandHa?: number }).arableLandHa = -1;
    expect(errorsOf(land).join("\n")).toMatch(/arableLandHa must be non-negative/);
  });

  test("startDayIndex must be a processable campaign day", () => {
    for (const value of [-1, 1.5, 36_524, 99_999]) {
      const data = cloneData(loadM5HistoricalData());
      data.meta.startDayIndex = value;
      expect(errorsOf(data).join("\n")).toMatch(/meta.startDayIndex must be an integer/);
    }
  });

  test("employment references, job slots, and qualified workforce are validated", () => {
    const base = loadM5HistoricalData();
    const farm = buildingFor(base, "subsistence-farm");
    const commercial = buildingFor(base, "commercial-farm");

    const wrongJob = cloneData(base);
    wrongJob.employment = [
      employment(commercial.key, commercial.provinceId, "peasants", 1),
    ];
    expect(errorsOf(wrongJob).join("\n")).toMatch(/is not a job of building definition/);

    const tooMany = cloneData(base);
    tooMany.employment = [
      employment(commercial.key, commercial.provinceId, "laborers", 1_000_000),
    ];
    expect(errorsOf(tooMany).join("\n")).toMatch(/exceeds the .* job slots/);

    const unqualified = cloneData(base);
    const laborer = unqualified.populations.find(
      (population) =>
        population.provinceId === commercial.provinceId &&
        population.professionKey === "laborers",
    );
    if (laborer === undefined) throw new Error("fixture has no provincial laborers");
    laborer.literacy = 0;
    unqualified.employment = [
      employment(commercial.key, commercial.provinceId, "laborers", 1),
    ];
    expect(errorsOf(unqualified).join("\n")).toMatch(/only 0 are qualified and eligible/);

    const duplicate = cloneData(base);
    duplicate.employment = [
      employment(farm.key, farm.provinceId, "peasants", 10),
      employment(farm.key, farm.provinceId, "peasants", 20),
    ];
    expect(errorsOf(duplicate).join("\n")).toMatch(
      /duplicates employment .* first declared at employment\[0\]/,
    );
  });

  test("invalid stock lots and duplicate source/calibration keys are rejected", () => {
    const lot = cloneData(loadM5HistoricalData());
    lot.markets[0]!.stockLots = [
      { goodKey: "grain", ownerBuildingKey: "unknown-building", quantity: 1 },
    ];
    expect(errorsOf(lot).join("\n")).toMatch(/ownerBuildingKey references unknown building/);

    const quantity = cloneData(loadM5HistoricalData());
    quantity.markets[0]!.stockLots = [
      { goodKey: "grain", ownerBuildingKey: quantity.buildings[0]!.key, quantity: 0 },
    ];
    expect(errorsOf(quantity).join("\n")).toMatch(/quantity must be a positive finite number/);

    const source = cloneData(loadM5HistoricalData());
    source.meta.sources.push({ ...source.meta.sources[0]! });
    expect(errorsOf(source).join("\n")).toMatch(
      /meta.sources\[.*\]\.id .* duplicates meta.sources\[0\]\.id/,
    );

    const calibration = cloneData(loadM5HistoricalData());
    calibration.calibration.push({
      ...calibration.calibration[0]!,
      id: "duplicate-target-id",
    });
    expect(errorsOf(calibration).join("\n")).toMatch(
      /duplicates calibration target .* first declared at calibration\[0\]/,
    );

    const distinctSource = cloneData(loadM5HistoricalData());
    distinctSource.meta.sources.push({
      id: "additional-valid-source",
      title: "Additional fixture source",
      url: "internal:packages/data/data/historical/source_notes.md",
      accessDate: "2026-10-27",
      license: "Project data",
      notes: "Used only to prove distinct source ids still load.",
    });
    expect(errorsOf(distinctSource)).toEqual([]);
  });

  test("employment ids and canonical hash are independent of record order", () => {
    const base = loadM5HistoricalData();
    const farm = buildingFor(base, "subsistence-farm");
    const commercial = buildingFor(base, "commercial-farm");
    const first = employment(farm.key, farm.provinceId, "peasants", 100);
    const second = employment(commercial.key, commercial.provinceId, "laborers", 100);

    const forward = cloneData(base);
    forward.employment = [first, second];
    const reverse = cloneData(base);
    reverse.employment = [second, first];

    const forwardScenario: EconomyScenarioDef = buildM5HistoricalScenario(forward);
    const reverseScenario: EconomyScenarioDef = buildM5HistoricalScenario(reverse);
    expect(forwardScenario.employment).toHaveLength(2);
    expect(reverseScenario.employment).toHaveLength(2);
    const normalize = (scenario: EconomyScenarioDef) =>
      [...scenario.employment].sort((left, right) => left.id - right.id);
    expect(normalize(reverseScenario)).toEqual(normalize(forwardScenario));
    expect(forwardScenario.employment.map((entry) => entry.id)).toEqual([0, 1]);
    expect(reverseScenario.employment.map((entry) => entry.id)).toEqual([0, 1]);

    const forwardWorld = createEconomyWorld(forwardScenario, { seed: 20_261_023 });
    const reverseWorld = createEconomyWorld(reverseScenario, { seed: 20_261_023 });
    expect(hashWorld(reverseWorld)).toBe(hashWorld(forwardWorld));
  });
});

/**
 * Batch 7 — data-version consistency.
 *
 * The data package version, the simulation default, every authored scenario
 * metadata block, and the historical scenario must agree. A validation-only
 * change does not require a bump; a scenario-content change that alters save
 * meaning must bump all of them together.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../../..");
const SCENARIO_DIRECTORY = join(ROOT, "packages", "data", "data", "scenarios");

describe("data version consistency", () => {
  test("package, simulation default, and package info agree", () => {
    expect(DATA_PACKAGE_VERSION).toBe(DEFAULT_DATA_VERSION);
    expect(DATA_PACKAGE_INFO.version).toBe(DATA_PACKAGE_VERSION);
  });

  test("every authored scenario declares the package data version", () => {
    const scenarioFiles = readdirSync(SCENARIO_DIRECTORY).filter((file) => file.endsWith(".json"));
    expect(scenarioFiles.length).toBeGreaterThan(0);
    for (const file of scenarioFiles) {
      const scenario = JSON.parse(
        readFileSync(join(SCENARIO_DIRECTORY, file), "utf8"),
      ) as { dataVersion?: unknown; meta?: { dataVersion?: unknown } };
      const declared = scenario.meta?.dataVersion ?? scenario.dataVersion;
      expect({ file, dataVersion: declared }).toEqual({
        file,
        dataVersion: DATA_PACKAGE_VERSION,
      });
    }
  });

  test("loaded scenarios expose the package data version", () => {
    expect(loadM2WorldAggregate().dataVersion).toBe(DATA_PACKAGE_VERSION);
    expect(loadM3SmallEconomy().definitions.dataVersion).toBe(DATA_PACKAGE_VERSION);
    expect(loadM3SmallEconomy().population.dataVersion).toBe(DATA_PACKAGE_VERSION);
    expect(loadM5HistoricalData().meta.dataVersion).toBe(DATA_PACKAGE_VERSION);
  });
});

function cloneAuthoredData(data: HistoricalData): HistoricalData {
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
    const reversed = cloneAuthoredData(data);
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
    const broken = cloneAuthoredData(data) as unknown as {
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
    const broken = cloneAuthoredData(data) as unknown as {
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
    const broken = cloneAuthoredData(data) as unknown as {
      populations: { provinceId: number; population: number }[];
    };
    // First population belongs to the United States; halving it breaks the target.
    broken.populations[0]!.population = Math.floor(broken.populations[0]!.population / 2);
    const validation = validateM5HistoricalData(broken as unknown as HistoricalData);
    expect(validation.errors.some((error) => error.includes("misses target"))).toBe(true);
  });
});
