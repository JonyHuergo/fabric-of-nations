/**
 * P2 acceptance: provinces are the economic unit (D-118), markets are customs
 * territories (D-119), the province scenario is generated from HYDE shares (D-121,
 * D-131), and older saves are incompatible (D-120, D-134).
 */
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadM11World, loadM5EightPolities } from "@century/data";
import {
  assertValidWorld,
  cloneWorld,
  countryProvinceIds,
  createEconomyWorld,
  deserializeWorld,
  hashWorld,
  marketProvinceIds,
  populationTotal,
  serializeWorld,
  transferProvincesToCountry,
  type World,
} from "@century/sim";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../../..");

function sourceFiles(directory: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) {
      if (name === "generated" || name === "node_modules" || name === "dist") continue;
      out.push(...sourceFiles(path));
    } else if (extname(name) === ".ts" || extname(name) === ".tsx") {
      out.push(path);
    }
  }
  return out;
}

function population(world: World): number {
  return world.popBlocks.reduce((total, block) => total + populationTotal(block), 0);
}

function cashTotal(world: World): number {
  return world.finance.accounts
    .filter((account) => account.category === "asset")
    .reduce((total, account) => total + account.balanceRUSD, 0);
}

function stockByGood(world: World): Map<number, number> {
  const totals = new Map<number, number>();
  for (const market of world.markets) {
    for (const lot of market.stockLots) totals.set(lot.goodId, (totals.get(lot.goodId) ?? 0) + lot.quantity);
  }
  return totals;
}

describe("P2 no simulation-region layer remains", () => {
  test("no Region, SimulationRegion, regionIds or simulationRegionId in the four packages", () => {
    const offenders: string[] = [];
    for (const pkg of ["sim", "data", "sim-worker", "app"]) {
      for (const file of sourceFiles(join(ROOT, "packages", pkg, "src"))) {
        const text = readFileSync(file, "utf8");
        if (/\b(Region|SimulationRegion\w*|regionIds?|simulationRegionId|RegionMetaDef)\b/u.test(text)) {
          offenders.push(file.slice(ROOT.length + 1));
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  test("no province data or generated scenario carries the region link", () => {
    for (const name of [
      "provinces_1900",
      "provinces_africa_1900",
      "provinces_americas_1900",
      "provinces_asia_1900",
      "provinces_oceania_1900",
    ]) {
      expect(readFileSync(join(ROOT, "packages/data/data/map", `${name}.json`), "utf8")).not.toContain(
        "simulationRegionId",
      );
    }
    const scenario = readFileSync(join(ROOT, "packages/sim-worker/src/generated/worldScenario.ts"), "utf8");
    expect(scenario).not.toMatch(/"regionId"|"regionIds"|"regions"|simulationRegionId/u);
  });
});

describe("P2 conserving province transfer (D-118 §4)", () => {
  const PRUSSIA = 4;
  const GERMANY = 2;
  const RUSSIA = 4;

  test("population, cash and goods are conserved; the province joins the new owner's market", () => {
    const world = createEconomyWorld(loadM5EightPolities(), { seed: 20_261_102 });
    const before = {
      population: population(world),
      cash: cashTotal(world),
      stock: stockByGood(world),
      blocks: world.popBlocks.filter((block) => block.provinceId === PRUSSIA).map((block) => block.id),
      buildings: world.buildings.filter((building) => building.provinceId === PRUSSIA).map((building) => building.id),
    };
    const russianMarket = world.provinceEconomies.find((province) => countryProvinceIds(world, RUSSIA).includes(province.id))?.marketId;
    const germanMarket = world.provinceEconomies.find((province) => province.id === PRUSSIA)?.marketId;
    expect(russianMarket).not.toBe(germanMarket);
    const prussianLots = world.markets
      .flatMap((market) => market.stockLots)
      .filter((lot) => before.buildings.includes(lot.ownerBuildingId));
    expect(prussianLots.length).toBeGreaterThan(0);

    const result = transferProvincesToCountry(world, {
      provinceIds: [PRUSSIA],
      toCountryId: RUSSIA,
      kind: "cession",
      day: world.dayIndex,
      note: "P2 conservation fixture",
    });
    assertValidWorld(world);
    expect(result.movedLotCount).toBe(prussianLots.length);
    expect(population(world)).toBe(before.population);
    expect(cashTotal(world)).toBeCloseTo(before.cash, 6);
    expect(stockByGood(world)).toEqual(before.stock);
    expect(countryProvinceIds(world, RUSSIA)).toContain(PRUSSIA);
    expect(countryProvinceIds(world, GERMANY)).not.toContain(PRUSSIA);
    const prussia = world.provinceEconomies.find((province) => province.id === PRUSSIA);
    expect(prussia?.marketId).toBe(russianMarket);
    expect(marketProvinceIds(world, russianMarket as number)).toContain(PRUSSIA);
    expect(world.popBlocks.filter((block) => block.provinceId === PRUSSIA).map((block) => block.id)).toEqual(before.blocks);
    const russian = world.markets.find((market) => market.id === russianMarket);
    for (const lot of prussianLots) {
      expect(russian?.stockLots.some((entry) => entry.ownerBuildingId === lot.ownerBuildingId && entry.goodId === lot.goodId)).toBe(true);
    }
    const record = world.provinces.ownership.find((entry) => entry.provinceId === PRUSSIA);
    expect(record?.ownerPolityId).toBe(RUSSIA);
    expect(record?.controllerPolityId).toBe(RUSSIA);
    expect(world.provinces.transfers.at(-1)?.kind).toBe("cession");
    expect(world.employmentDirty).toBe(true);
  });

  test("the transfer is deterministic and survives a save round trip", () => {
    const run = (): World => {
      const world = createEconomyWorld(loadM5EightPolities(), { seed: 7 });
      transferProvincesToCountry(world, { provinceIds: [PRUSSIA], toCountryId: RUSSIA, kind: "cession", day: world.dayIndex, note: "x" });
      return world;
    };
    const left = run();
    const right = run();
    expect(hashWorld(left)).toBe(hashWorld(right));
    expect(hashWorld(deserializeWorld(serializeWorld(left)))).toBe(hashWorld(left));
  });

  test("a transfer to a polity that is not a simulation country is rejected and changes nothing", () => {
    const world = createEconomyWorld(loadM5EightPolities(), { seed: 3 });
    const before = hashWorld(world);
    expect(() =>
      transferProvincesToCountry(world, { provinceIds: [PRUSSIA], toCountryId: 9_999, kind: "cession", day: world.dayIndex, note: "x" }),
    ).toThrow(/not a simulation country/u);
    expect(hashWorld(world)).toBe(before);
  });

  test("cloneWorld isolates province ownership", () => {
    const world = createEconomyWorld(loadM5EightPolities(), { seed: 5 });
    const clone = cloneWorld(world);
    clone.provinces.ownership[0]!.claimantPolityIds.push(99);
    expect(world.provinces.ownership[0]?.claimantPolityIds).toEqual([]);
  });
});

describe("P2 1900 province world and customs territories (D-119)", () => {
  const scenario = loadM11World();
  const world = createEconomyWorld(scenario, { seed: 20_261_102 });
  const UNION_MEMBERS = new Map([
    ["LUX", "DEU"],
    ["LIE", "AUT"],
    ["MCO", "FRA"],
    ["SMR", "ITA"],
  ]);

  test("one economic record per province and a population block only where people live", () => {
    expect(world.provinceEconomies).toHaveLength(scenario.provinces?.definitions.length ?? -1);
    expect(world.popBlocks.length).toBeGreaterThan(5_000);
    for (const block of world.popBlocks) expect(populationTotal(block)).toBeGreaterThan(0);
  });

  test("every country has its own tariff authority unless the 1900 audit records a union", () => {
    const tagById = new Map(world.countries.map((country) => [country.id, country.tag]));
    const idByTag = new Map(world.countries.map((country) => [country.tag, country.id]));
    expect(world.markets).toHaveLength(63);
    for (const country of world.countries) {
      const provinces = countryProvinceIds(world, country.id);
      const markets = new Set(provinces.map((id) => world.provinceEconomies.find((province) => province.id === id)?.marketId));
      expect(markets.size).toBe(1);
      const market = world.markets.find((candidate) => markets.has(candidate.id));
      const administrator = UNION_MEMBERS.get(country.tag);
      expect(tagById.get(market?.customsCountryId ?? -1)).toBe(administrator ?? country.tag);
      if (administrator !== undefined) expect(market?.customsCountryId).toBe(idByTag.get(administrator));
    }
  });

  test("dependent territories trade in their sovereign's customs territory", () => {
    for (const territory of scenario.territoryMeta ?? []) {
      const sovereignMarkets = new Set(
        countryProvinceIds(world, territory.sovereignCountryId).map(
          (id) => world.provinceEconomies.find((province) => province.id === id)?.marketId,
        ),
      );
      for (const provinceId of territory.provinceIds) {
        const marketId = world.provinceEconomies.find((province) => province.id === provinceId)?.marketId;
        expect(sovereignMarkets.has(marketId)).toBe(true);
      }
    }
  });

  test("country populations equal the authored territory totals (D-131 conservation)", () => {
    const report = JSON.parse(
      readFileSync(join(ROOT, "packages/data/data/historical/p2/build_report.json"), "utf8"),
    ) as { conservation: { population: number } };
    expect(population(world)).toBe(report.conservation.population);
  });

  test("the generated province scenario is current", () => {
    const result = spawnSync(process.execPath, [join(ROOT, "scripts/p2/build-province-scenario.mjs"), "--check"], {
      cwd: ROOT,
      encoding: "utf8",
    });
    expect(`${result.stdout}${result.stderr}`).toContain("Province scenario is current");
    expect(result.status).toBe(0);
  });
});

describe("P2 schema break (D-120)", () => {
});
