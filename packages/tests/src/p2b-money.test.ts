/**
 * P2b acceptance (D-130, D-135): every money value of the 1900 world traces to a row of
 * the source table and its conversion; the 1900 world initialises for every selectable
 * country; the province wage table, building technique and scenario money coefficients
 * are authoritative, serialized state; legacy fixtures keep their scale (A6).
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadM11World, loadM5EightPolities } from "@century/data";
import {
  DEFAULT_MONEY_COEFFICIENTS,
  MONEY_COEFFICIENT_KEYS,
  WORLD_SCHEMA_VERSION,
  buildProvinceOwnerMap,
  computeBuildingCapacity,
  countryProvinceIds,
  createEconomyWorld,
  deserializeWorld,
  hashWorld,
  inheritedTechnique,
  localWageIndex,
  provinceWageRUSDPerYear,
  serializeWorld,
  tick,
  type EconomyScenarioDef,
  type World,
} from "@century/sim";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");
const DATA = join(ROOT, "packages/data/data");
const readJson = <T>(relative: string): T => JSON.parse(readFileSync(join(DATA, relative), "utf8")) as T;

interface SourceRow {
  id: string;
  sourceId: string;
  value: number;
  status: "sourced" | "secondary" | "provisional";
  note?: string;
  observations?: number[];
}
interface SourceTable {
  sources: { id: string; title: string; url: string }[];
  rows: SourceRow[];
  territoryBenchmarks: Record<string, { mpdRowIds: string[]; method: string; reason?: string }>;
}
interface Trace {
  value: number;
  rowIds: string[];
  formula: string;
  status?: string;
}

const table = readJson<SourceTable>("historical/p2b/sources_1900.json");
const rowById = new Map(table.rows.map((row) => [row.id, row]));
const row = (id: string): number => {
  const found = rowById.get(id);
  if (found === undefined) throw new Error(`unknown row ${id}`);
  return found.value;
};
const calibration = readJson<{
  rusdPerUsd1900: Trace;
  goods: Record<string, { basePrice1900RUSD: Trace; transportCostPerUnit: Trace }>;
  territories: Record<string, { wageTable: Record<string, number>; wagesRUSDPerYear: Record<string, Trace>; gdpPerHeadRUSD: Trace; priceLevel: Trace }>;
  markets: Record<string, { initialPriceMultiplier: Trace }>;
  countries: Record<string, Record<string, Trace | number>>;
  moneyCoefficients: Record<string, Trace>;
  ruleRows: Record<string, string[]>;
}>("historical/p2b/calibration_1900.json");
const RUSD = 392.6 / 25;
const close = (actual: number, expected: number, digits = 6): void => {
  // Rounded outputs: allow half a unit of the last kept digit plus double-precision noise.
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(Math.max(1e-9 * Math.abs(expected), 0.5 * 10 ** -digits) + 1e-12);
};

let scenario: EconomyScenarioDef;
let world: World;
beforeAll(() => {
  scenario = loadM11World();
  world = createEconomyWorld(scenario, { seed: 20_261_023 });
});

describe("P2b source table", () => {
  it("cites a known source for every row and states a reason for every provisional row", () => {
    const sourceIds = new Set(table.sources.map((source) => source.id));
    for (const entry of table.rows) {
      expect(sourceIds.has(entry.sourceId)).toBe(true);
      expect(Number.isFinite(entry.value)).toBe(true);
      expect(["sourced", "secondary", "provisional"]).toContain(entry.status);
      if (entry.status === "provisional") expect((entry.note ?? "").length).toBeGreaterThan(10);
      if (entry.observations !== undefined) {
        close(entry.value, entry.observations.reduce((a, b) => a + b, 0) / entry.observations.length, 9);
      }
    }
    expect(new Set(table.rows.map((entry) => entry.id)).size).toBe(table.rows.length);
  });

  it("converts 1900 dollars with the Minneapolis Fed CPI: 15.704 RUSD per dollar", () => {
    expect(row("cpi-1990") / row("cpi-1900")).toBeCloseTo(15.704, 12);
    expect(calibration.rusdPerUsd1900.value).toBeCloseTo(15.704, 12);
    expect(calibration.rusdPerUsd1900.rowIds).toEqual(["cpi-1990", "cpi-1900"]);
  });

  it("benchmarks every territory on MPD rows that exist, with a reason for every proxy", () => {
    const territories = readJson<{ key: string }[]>("historical/m11/territories_1900.json");
    for (const territory of territories) {
      const benchmark = table.territoryBenchmarks[territory.key];
      expect(benchmark).toBeDefined();
      for (const id of benchmark?.mpdRowIds ?? []) expect(rowById.get(id)?.sourceId).toBe("mpd-2023");
      if (benchmark?.method === "proxy") expect((benchmark.reason ?? "").length).toBeGreaterThan(5);
    }
  });
});

describe("P2b traceability of every money value", () => {
  const kg = () => row("kg-per-lb");

  it("recomputes the goods prices from the NBER rows and their conversions", () => {
    const goods = readJson<{ key: string; basePrice1900RUSD: number; transportCostPerUnit: number }[]>("historical_1900_goods.json");
    const expected: Record<string, number> = {
      grain: (row("price-wheat-1900") / 100 / (row("lb-per-bushel-wheat") * kg())) * RUSD,
      livestock: (row("price-cattle-1900") / (100 * kg())) * RUSD,
      cotton: (row("price-cotton-1900") / 100 / kg()) * RUSD,
      wool: (row("price-wool-1900") / 100 / kg()) * RUSD,
      "food-products": (row("price-flour-1900") / (row("lb-per-barrel-flour") * kg())) * RUSD,
    };
    expected.fish = (expected.livestock ?? 0) * row("fish-price-to-livestock");
    for (const good of goods) {
      const trace = calibration.goods[good.key];
      expect(trace).toBeDefined();
      expect(trace?.basePrice1900RUSD.value).toBe(good.basePrice1900RUSD);
      for (const id of trace?.basePrice1900RUSD.rowIds ?? []) expect(rowById.has(id)).toBe(true);
      const recomputed = expected[good.key];
      if (recomputed !== undefined) close(good.basePrice1900RUSD, recomputed, 6);
      close(good.transportCostPerUnit, good.basePrice1900RUSD * row("freight-share-per-distance-unit"), 8);
    }
    // Wheat: 70.43 cents a bushel in 1900 is about 0.41 RUSD per kilogram.
    expect(expected.grain).toBeGreaterThan(0.4);
    expect(expected.grain).toBeLessThan(0.41);
  });

  it("recomputes the sourced reference wages", () => {
    const us = calibration.territories["usa-home"]?.wageTable ?? {};
    const laborer = row("us-wage-production-hourly-1900") * row("standard-hours-per-week") * row("weeks-per-year") * RUSD;
    close(us.laborers ?? 0, laborer, 2);
    close(us.academics ?? 0, row("us-teacher-salary-1900") * RUSD, 2);
    close(us.clerks ?? 0, ((row("us-manuf-salaries-1900") * 1e6) / row("us-manuf-salaried-number-1900")) * RUSD, 2);
    close(us.peasants ?? 0, laborer * row("peasant-to-laborer-wage"), 2);
    close(calibration.territories["gbr-home"]?.wageTable.laborers ?? 0, row("uk-earnings-1900") * row("parity-gbp") * RUSD, 2);
    const professions = readJson<{ key: string; baseWage1900RUSDPerYear: number }[]>("historical_1900_professions.json");
    for (const profession of professions) expect(profession.baseWage1900RUSDPerYear).toBe(us[profession.key]);
  });

  it("recomputes the US GDP per head and every territory's wage traces cite existing rows", () => {
    close(calibration.territories["usa-home"]?.gdpPerHeadRUSD.value ?? 0, ((row("us-gdp-1900") * 1e6) / row("us-pop-1900")) * RUSD, 6);
    for (const [key, territory] of Object.entries(calibration.territories)) {
      for (const [profession, trace] of Object.entries(territory.wagesRUSDPerYear)) {
        expect(trace.value).toBe(territory.wageTable[profession]);
        expect(trace.rowIds.length).toBeGreaterThan(0);
        for (const id of trace.rowIds) expect(rowById.has(id)).toBe(true);
        expect(trace.value).toBeGreaterThan(0);
      }
      expect(territory.priceLevel.value).toBeGreaterThan(0);
      if (key !== "usa-home") expect(territory.priceLevel.rowIds.length).toBeGreaterThan(0);
    }
  });

  it("traces every generated money field of provinces, countries, markets, routes and buildings", () => {
    const provinces = readJson<{ territoryKey: string; wageRUSDPerYearByProfession: Record<string, number> }[]>("historical/p2b/provinces_1900.json");
    for (const province of provinces) {
      expect(province.wageRUSDPerYearByProfession).toEqual(calibration.territories[province.territoryKey]?.wageTable);
    }
    const countries = readJson<{ tag: string; initialTreasuryCashRUSD: number; fiscal: { incomeTaxRate: number; welfareBudgetRUSDPerYear: number }; debt: { maxOutstandingPrincipalRUSD: number }; politics: { institutionFundingRUSDPerYear: number }; technology: { educationFundingRUSDPerYear: number } }[]>("historical/p2b/countries_1900.json");
    for (const country of countries) {
      const traced = calibration.countries[country.tag] as Record<string, Trace>;
      expect(country.initialTreasuryCashRUSD).toBe(traced.initialTreasuryCashRUSD?.value);
      expect(country.fiscal.incomeTaxRate).toBe(traced.incomeTaxRate?.value);
      expect(country.fiscal.welfareBudgetRUSDPerYear).toBe(traced.welfareBudgetRUSDPerYear?.value);
      expect(country.politics.institutionFundingRUSDPerYear).toBe(traced.institutionFundingRUSDPerYear?.value);
      expect(country.technology.educationFundingRUSDPerYear).toBe(traced.educationFundingRUSDPerYear?.value);
      expect(country.debt.maxOutstandingPrincipalRUSD).toBe(Math.max(1, traced.maxOutstandingPrincipalRUSD?.value ?? 0));
      for (const field of ["initialTreasuryCashRUSD", "incomeTaxRate", "institutionFundingRUSDPerYear", "educationFundingRUSDPerYear", "maxOutstandingPrincipalRUSD"]) {
        const trace = traced[field];
        expect(trace?.rowIds.length).toBeGreaterThan(0);
        for (const id of trace?.rowIds ?? []) expect(rowById.has(id)).toBe(true);
      }
    }
    const markets = readJson<{ key: string; initialPriceMultiplier: number }[]>("historical/p2b/markets_1900.json");
    for (const market of markets) expect(market.initialPriceMultiplier).toBe(calibration.markets[market.key]?.initialPriceMultiplier.value);
    for (const ids of Object.values(calibration.ruleRows)) for (const id of ids) expect(rowById.has(id)).toBe(true);
    const buildings = readJson<{ technique: number; level: number; operatingCashRUSD: number }[]>("historical/p2b/buildings_1900.json");
    for (const building of buildings) {
      expect(building.technique).toBeGreaterThan(0);
      expect(Number.isInteger(building.level) && building.level >= 1).toBe(true);
      expect(building.operatingCashRUSD).toBeGreaterThan(0);
    }
  });

  it("traces every scenario money coefficient and loads it into the world", () => {
    const file = readJson<Record<string, { valueRUSD: number; rowIds: string[]; status: string }>>("historical/p2b/money_coefficients_1900.json");
    expect(Object.keys(file).sort()).toEqual([...MONEY_COEFFICIENT_KEYS].sort());
    for (const key of MONEY_COEFFICIENT_KEYS) {
      const entry = file[key];
      expect(entry?.rowIds.length).toBeGreaterThan(0);
      for (const id of entry?.rowIds ?? []) expect(rowById.has(id)).toBe(true);
      expect(world.moneyCoefficients[key]).toBe(entry?.valueRUSD);
    }
    close(world.moneyCoefficients.educationFundingPerStaffPerYearRUSD, row("us-teacher-salary-1900") * RUSD, 2);
  });

  it("is current: the builder's --check reproduces every committed output", () => {
    const run = spawnSync(process.execPath, [join(ROOT, "scripts/p2b/build-money-calibration.mjs"), "--check"], { encoding: "utf8" });
    expect(run.stderr).toBe("");
    expect(run.status).toBe(0);
  });
});

describe("P2b 1900 world", () => {
  it("reads the calibrated tables and the 1900-world definitions", () => {
    const meta = readJson<{ meta: { files: Record<string, string>; definitions: Record<string, string> } }>("scenarios/m11_world_1900.json").meta;
    for (const key of ["countries", "provinces", "markets", "tradeRoutes", "populations", "buildings", "employment", "calibration", "moneyCoefficients"]) {
      expect(meta.files[key]).toMatch(/^historical\/p2b\//);
    }
    expect(meta.definitions.goods).toBe("historical_1900_goods.json");
    expect(meta.definitions.buildings).toBe("historical_1900_buildings.json");
    expect(meta.definitions.professions).toBe("historical_1900_professions.json");
    expect(meta.definitions.needs).toBe("historical_1900_needs.json");
  });

  it("initialises every selectable country with territory, population, wages and a treasury", () => {
    const selectable = (scenario.countryMeta ?? []).filter((meta) => meta.selectable);
    expect(selectable.length).toBe(66);
    const owners = buildProvinceOwnerMap(world);
    for (const meta of selectable) {
      const country = world.countries.find((candidate) => candidate.id === meta.countryId);
      expect(country).toBeDefined();
      const provinces = countryProvinceIds(world, meta.countryId);
      expect(provinces.length).toBeGreaterThan(0);
      const people = world.popBlocks.filter((block) => owners.get(block.provinceId) === meta.countryId).length;
      expect(people).toBeGreaterThan(0);
      for (const id of provinces) {
        const province = world.provinceEconomies.find((candidate) => candidate.id === id);
        expect(province?.wageRUSDPerYearByProfession.length).toBe(scenario.definitions.professions.length);
      }
      const treasury = world.finance.accounts.find((account) => account.id === country?.treasuryAccountId);
      expect(treasury?.balanceRUSD).toBeGreaterThan(0);
    }
  });

  it("pays each worker the wage of the province's table", () => {
    const probe = createEconomyWorld(scenario, { seed: 20_261_023 });
    const result = tick(probe, { population: { definitions: scenario.population.definitions }, economy: { definitions: scenario.definitions } });
    const professions = new Map(scenario.definitions.professions.map((profession) => [profession.id, profession]));
    const blocks = new Map(probe.popBlocks.map((block) => [block.id, block]));
    const provinces = new Map(probe.provinceEconomies.map((province) => [province.id, province]));
    let checked = 0;
    for (const settlement of result.economy?.settlement.wages ?? []) {
      for (const payment of settlement.payments) {
        const block = blocks.get(payment.popBlockId);
        const profession = professions.get(payment.professionId);
        if (block === undefined || profession === undefined || payment.workers <= 0) continue;
        if (block.qualification !== 0) continue;
        const wage = provinceWageRUSDPerYear(provinces.get(block.provinceId)?.wageRUSDPerYearByProfession, profession);
        close(payment.obligationRUSD / payment.workers, wage / 365, 6);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  // D-136 regressions: before the fixes this world aborted within a week (cash-neutral
  // tolerance at 1e9-RUSD postings, lot-pairing tolerance, trade cap per lot), and every
  // price fell 5% a day although supply and demand balanced.
  it("runs a week and balanced goods hold their price (D-136)", () => {
    const probe = createEconomyWorld(scenario, { seed: 20_261_023 });
    const context = { population: { definitions: scenario.population.definitions }, economy: { definitions: scenario.definitions } };
    const us = probe.markets.find((market) => market.customsCountryId === probe.countries.find((country) => country.tag === "USA")?.id);
    if (us === undefined) throw new Error("fixture");
    const livestock = scenario.definitions.goods.find((good) => good.key === "livestock")?.id ?? -1;
    const opening = us.priceRUSD[livestock] ?? 0;
    for (let day = 0; day < 7; day += 1) {
      const result = tick(probe, context);
      expect(result.advanced).toBe(true);
    }
    const closing = probe.markets.find((market) => market.id === us.id)?.priceRUSD[livestock] ?? 0;
    expect(Math.abs(closing / opening - 1)).toBeLessThan(0.02);
  });

  it("serializes the wage tables, techniques and money coefficients (schema 29, kept in 30)", () => {
    // P3 (D-141) raised the schema to 30 (closing valuations); the P2b fields are unchanged.
    expect(WORLD_SCHEMA_VERSION).toBe(30);
    const restored = deserializeWorld(serializeWorld(world));
    expect(hashWorld(restored)).toBe(hashWorld(world));
    expect(restored.moneyCoefficients).toEqual(world.moneyCoefficients);
    expect(restored.buildings.map((building) => building.technique)).toEqual(world.buildings.map((building) => building.technique));
    expect(restored.provinceEconomies[0]?.wageRUSDPerYearByProfession).toEqual(world.provinceEconomies[0]?.wageRUSDPerYearByProfession);
  });

  it("scales a building's capacity with its technique", () => {
    const probe = createEconomyWorld(scenario, { seed: 20_261_023 });
    tick(probe, { population: { definitions: scenario.population.definitions }, economy: { definitions: scenario.definitions } });
    const building = probe.buildings.find((candidate) => computeBuildingCapacity(probe, scenario.definitions, candidate.id).capacityTU > 0);
    expect(building).toBeDefined();
    if (building === undefined) return;
    const before = computeBuildingCapacity(probe, scenario.definitions, building.id).capacityTU;
    building.technique *= 2;
    close(computeBuildingCapacity(probe, scenario.definitions, building.id).capacityTU, 2 * before, 9);
  });

  it("gives a new building the technique already practised in its country", () => {
    const usa = world.countries.find((country) => country.tag === "USA");
    const farm = scenario.definitions.buildings.find((definition) => definition.key === "subsistence-farm");
    if (usa === undefined || farm === undefined) throw new Error("fixture");
    const owners = buildProvinceOwnerMap(world);
    let weight = 0;
    let sum = 0;
    for (const building of world.buildings) {
      if (owners.get(building.provinceId) !== usa.id || building.definitionId !== farm.id) continue;
      weight += building.level;
      sum += building.level * building.technique;
    }
    close(inheritedTechnique(world, usa.id, farm.id), sum / weight, 9);
  });

  it("scales public-service benchmarks with local wages and leaves legacy worlds at 1", () => {
    const keys = new Set(["academics"]);
    const gbr = world.countries.find((country) => country.tag === "GBR");
    const usa = world.countries.find((country) => country.tag === "USA");
    if (gbr === undefined || usa === undefined) throw new Error("fixture");
    const owners = buildProvinceOwnerMap(world);
    const blocksOf = (id: number) => world.popBlocks.filter((block) => owners.get(block.provinceId) === id);
    const british = localWageIndex(world, blocksOf(gbr.id), scenario.definitions, keys);
    const american = localWageIndex(world, blocksOf(usa.id), scenario.definitions, keys);
    expect(british).toBeLessThan(american);
    expect(american).toBeLessThanOrEqual(1);
    const legacyScenario = loadM5EightPolities();
    const legacy = createEconomyWorld(legacyScenario, { seed: 1 });
    expect(localWageIndex(legacy, legacy.popBlocks, legacyScenario.definitions, keys)).toBe(1);
  });
});

describe("P2b leaves legacy fixtures on their own scale (A6)", () => {
  it("keeps the M5 sample on the M11 definitions and the default money coefficients", () => {
    const legacyScenario = loadM5EightPolities();
    const legacy = createEconomyWorld(legacyScenario, { seed: 1 });
    expect(legacy.moneyCoefficients).toEqual(DEFAULT_MONEY_COEFFICIENTS);
    expect(legacy.provinceEconomies.every((province) => province.wageRUSDPerYearByProfession.length === 0)).toBe(true);
    expect(legacy.buildings.every((building) => building.technique === 1)).toBe(true);
    const goods = readJson<{ key: string; basePrice1900RUSD: number }[]>("historical_goods.json");
    expect(legacyScenario.definitions.goods.map((good) => good.basePrice1900RUSD)).toEqual(goods.map((good) => good.basePrice1900RUSD));
  });
});
