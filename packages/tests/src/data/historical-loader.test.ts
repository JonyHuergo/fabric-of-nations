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
} from "@century/sim";
import {
  HistoricalDataError,
  buildM5HistoricalScenario,
  loadM5HistoricalData,
  validateM5HistoricalData,
  type HistoricalData,
  type HistoricalEmploymentInput,
} from "@century/data";

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
