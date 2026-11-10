#!/usr/bin/env node
/**
 * P2 (D-117 to D-119, D-121, D-131): build the 1900 province-level scenario tables.
 *
 * Inputs (authored, committed):
 *   packages/data/data/historical/m11/territories_1900.json  133 catalog territories and their provinces
 *   packages/data/data/historical/m11/pops_1900.json         population by (territory, profession)
 *   packages/data/data/historical/m11/buildings_1900.json    buildings by territory
 *   packages/data/data/historical/m11/countries_1900.json    countries and their territories
 *   packages/data/data/historical/m11/markets_1900.json      M11 opening stock lots and price multipliers
 *   packages/data/data/historical/m11/customs_territories_1900.json  customs unions (D-119)
 *   packages/data/data/map/province_geography_1900.json      HYDE 3.3 province shares (D-121)
 *   packages/data/data/map/province_population_1900.json     sourced totals where HYDE is empty (D-129)
 *   packages/data/data/map/provinces*_1900.json              names, labels, areas and borders
 *
 * Outputs (generated, committed) in packages/data/data/historical/p2/:
 *   provinces_1900.json   one economic record per province: land, urban share, infrastructure
 *   pops_1900.json        one block per populated (province, profession)
 *   buildings_1900.json   territory buildings split over provinces by employment
 *   countries_1900.json   countries with their province ids
 *   markets_1900.json     one market per customs territory, with opening stock
 *   trade_routes_1900.json generated from land borders and coasts
 *   build_report.json     input checksums, counts and conservation totals
 * and rewrites the runtime scenario meta (files, country/market/territory meta) and the
 * markets of the app's pre-campaign catalog (packages/app/src/generated/worldCatalog.ts).
 *
 * Method (provisional, D-131):
 * - Each territory's authored total for a profession is split over its provinces in
 *   proportion to a HYDE 3.3 weight: peasants by rural population, laborers by total
 *   population, clerks, academics and capitalists by urban population (total when the
 *   territory has no urban population). Provinces in a sourced group of
 *   province_population_1900.json use that total split by land area; a territory with
 *   no weight at all is split by land area. Integer people by largest remainder (ties
 *   to the lower province id), so every territory total is exact.
 * - Each territory building's level is split over its provinces in proportion to the
 *   province population of the professions it employs (total population for buildings
 *   without jobs), among provinces that have a block of the owner profession; integer
 *   levels and whole-RUSD operating cash by largest remainder. Opening stock follows
 *   its building's level shares.
 * - Customs territories (D-119): every country is its own territory unless it is a
 *   member of a recorded 1900 union; colonies and protectorates are part of their
 *   sovereign's territory (they are already that country's provinces).
 * - Routes: territories sharing a land border, plus each coastal territory's three
 *   nearest coastal territories; distance units are kilometres / 1,000 between the
 *   closest border (land) or coastal (sea) province labels, at least 0.5. Capacity uses
 *   the M11 provisional formula (to be re-derived in P2b, D-130).
 *
 * Usage: node scripts/p2/build-province-scenario.mjs [--check]
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DATA = join(ROOT, "packages/data/data");
const M11 = join(DATA, "historical/m11");
const OUT = join(DATA, "historical/p2");
const MAP = join(DATA, "map");
const SCENARIO = join(DATA, "scenarios/m11_world_1900.json");
const CATALOG_TS = join(ROOT, "packages/app/src/generated/worldCatalog.ts");
const BUNDLES = [
  "provinces_1900",
  "provinces_africa_1900",
  "provinces_americas_1900",
  "provinces_asia_1900",
  "provinces_oceania_1900",
];
const CHECK = process.argv.includes("--check");
/** P7 (D-154): settlement of the 1900 professions (docs/P7_PLAN.md §3.2). */
const P7_SETTLEMENT = { peasants: "rural", laborers: "by-job", clerks: "urban", capitalists: "urban", academics: "urban" };

const INPUTS = {
  territories: join(M11, "territories_1900.json"),
  pops: join(M11, "pops_1900.json"),
  buildings: join(M11, "buildings_1900.json"),
  countries: join(M11, "countries_1900.json"),
  markets: join(M11, "markets_1900.json"),
  customs: join(M11, "customs_territories_1900.json"),
  geography: join(MAP, "province_geography_1900.json"),
  sourcedPopulation: join(MAP, "province_population_1900.json"),
  professions: join(DATA, "historical_professions.json"),
  buildingDefinitions: join(DATA, "historical_buildings.json"),
  ...Object.fromEntries(BUNDLES.map((bundle) => [bundle, join(MAP, `${bundle}.json`)])),
};

const readText = (path) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const read = (path) => JSON.parse(readText(path));
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = (text) => createHash("sha256").update(text).digest("hex");

/** Integer apportionment of `total` over `weights` (Map id -> weight). Ties to the lower id. */
function largestRemainder(total, weights) {
  const entries = [...weights].filter(([, weight]) => weight > 0).sort((a, b) => a[0] - b[0]);
  const result = new Map();
  if (total === 0 || entries.length === 0) return result;
  const sum = entries.reduce((acc, [, weight]) => acc + weight, 0);
  let assigned = 0;
  const remainders = [];
  for (const [id, weight] of entries) {
    const exact = (total * weight) / sum;
    const base = Math.floor(exact);
    result.set(id, base);
    assigned += base;
    remainders.push({ id, remainder: exact - base });
  }
  remainders.sort((a, b) => b.remainder - a.remainder || a.id - b.id);
  for (let index = 0; index < total - assigned; index += 1) {
    const { id } = remainders[index % remainders.length];
    result.set(id, result.get(id) + 1);
  }
  for (const [id, value] of [...result]) if (value === 0) result.delete(id);
  return result;
}

function haversineKm([lonA, latA], [lonB, latB]) {
  const rad = Math.PI / 180;
  const dLat = (latB - latA) * rad;
  const dLon = (lonB - lonA) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(latA * rad) * Math.cos(latB * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

const distanceUnits = (km) => Math.max(0.5, Math.round((km / 1000) * 10) / 10);

function build() {
  const territories = read(INPUTS.territories);
  const pops = read(INPUTS.pops);
  const territoryBuildings = read(INPUTS.buildings);
  const countries = read(INPUTS.countries);
  const oldMarkets = read(INPUTS.markets);
  const customs = read(INPUTS.customs);
  const geography = read(INPUTS.geography);
  const sourced = read(INPUTS.sourcedPopulation);
  const definitions = read(INPUTS.buildingDefinitions);
  const professions = read(INPUTS.professions);
  const professionKeyById = new Map(professions.map((profession) => [profession.id, profession.key]));

  const provinces = [];
  const borders = [];
  for (const bundle of BUNDLES) {
    const data = read(INPUTS[bundle]);
    provinces.push(...data.provinces);
    borders.push(...data.borders);
  }
  const provinceByKey = new Map(provinces.map((province) => [province.key, province]));
  const geographyById = new Map(geography.provinces.map((record) => [record.id, record]));

  // Sourced group totals (D-129), split by land area.
  const sourcedPeople = new Map();
  for (const group of sourced.groups) {
    const areas = new Map();
    for (const key of group.provinceKeys) {
      const province = provinceByKey.get(key);
      if (province === undefined) throw new Error(`sourced group ${group.label}: unknown province ${key}`);
      const land = geographyById.get(province.id)?.landAreaKm2 ?? 0;
      areas.set(province.id, land > 0 ? land : province.area);
    }
    for (const [id, people] of largestRemainder(group.population, areas)) sourcedPeople.set(id, people);
    for (const id of areas.keys()) if (!sourcedPeople.has(id)) sourcedPeople.set(id, 0);
  }

  const territoryById = new Map(territories.map((territory) => [territory.id, territory]));
  const territoryProvinceIds = new Map();
  const territoryOfProvince = new Map();
  for (const territory of territories) {
    const ids = territory.provinceKeys.map((key) => {
      const province = provinceByKey.get(key);
      if (province === undefined) throw new Error(`territory ${territory.key}: unknown province ${key}`);
      if (territoryOfProvince.has(province.id)) throw new Error(`province ${key} is in two territories`);
      territoryOfProvince.set(province.id, territory.id);
      return province.id;
    });
    territoryProvinceIds.set(territory.id, ids.sort((a, b) => a - b));
  }
  if (territoryOfProvince.size !== provinces.length) {
    throw new Error(`territories cover ${territoryOfProvince.size} of ${provinces.length} provinces`);
  }

  // Province weights: total, urban and rural people.
  const weight = new Map();
  for (const province of provinces) {
    const record = geographyById.get(province.id);
    if (sourcedPeople.has(province.id)) {
      weight.set(province.id, { total: sourcedPeople.get(province.id), urban: 0 });
    } else {
      weight.set(province.id, {
        total: record?.population ?? 0,
        urban: Math.min(record?.urbanPopulation ?? 0, record?.population ?? 0),
      });
    }
  }
  const landWeight = (id) => {
    const land = geographyById.get(id)?.landAreaKm2 ?? 0;
    return land > 0 ? land : provinceByKey.get(provinces.find((p) => p.id === id).key).area;
  };

  // Economic province records.
  const provinceRecords = [...provinces]
    .sort((a, b) => a.id - b.id)
    .map((province) => {
      const record = geographyById.get(province.id);
      const territory = territoryById.get(territoryOfProvince.get(province.id));
      const people = weight.get(province.id);
      return {
        id: province.id,
        key: province.key,
        name: province.displayName,
        territoryKey: territory.key,
        infrastructure: territory.infrastructure ?? 0.5,
        arableLandHa: Math.round((record?.croplandKm2 ?? 0) * 100),
        pastureHa: Math.round((record?.grazingKm2 ?? 0) * 100),
        urbanShare: people.total > 0 ? Math.round((people.urban / people.total) * 1e4) / 1e4 : 0,
        sourceIds: ["hyde-3.3", "project-authored-p2"],
        calibrationStatus: "provisional",
      };
    });

  // Population blocks.
  // P7 (D-154, plan §3.3): the split reads the profession's settlement (rural, by job,
  // urban; plan §3.2) instead of its key; for the five 1900 professions this is the P2 rule.
  const settlementOf = (professionKey) => P7_SETTLEMENT[professionKey] ?? "urban";
  const weightFor = (professionKey, ids) => {
    const map = new Map();
    const urbanTotal = ids.reduce((acc, id) => acc + weight.get(id).urban, 0);
    for (const id of ids) {
      const { total, urban } = weight.get(id);
      let value;
      const settlement = settlementOf(professionKey);
      if (settlement === "rural") value = total - urban;
      else if (settlement === "by-job") value = total;
      else value = urbanTotal > 0 ? urban : total;
      map.set(id, value);
    }
    if ([...map.values()].every((value) => !(value > 0))) {
      for (const id of ids) map.set(id, weight.get(id).total);
    }
    if ([...map.values()].every((value) => !(value > 0))) {
      for (const id of ids) map.set(id, landWeight(id));
    }
    return map;
  };
  const popRows = [];
  const blockPopulation = new Map(); // `${provinceId}:${profession}` -> people
  for (const row of [...pops].sort((a, b) => a.territoryId - b.territoryId || a.professionKey.localeCompare(b.professionKey))) {
    const ids = territoryProvinceIds.get(row.territoryId);
    if (ids === undefined) throw new Error(`population row references unknown territory ${row.territoryId}`);
    for (const [provinceId, population] of largestRemainder(row.population, weightFor(row.professionKey, ids))) {
      blockPopulation.set(`${provinceId}:${row.professionKey}`, population);
      popRows.push({
        provinceId,
        professionKey: row.professionKey,
        population,
        literacy: row.literacy,
        wealthLevel: row.wealthLevel,
        savingsPerCapitaRUSD: row.savingsPerCapitaRUSD,
        militancy: row.militancy,
        sourceIds: [...row.sourceIds, "hyde-3.3"],
        calibrationStatus: row.calibrationStatus,
      });
    }
  }
  popRows.sort((a, b) => a.provinceId - b.provinceId || a.professionKey.localeCompare(b.professionKey));

  // Buildings by employment.
  const definitionByKey = new Map(definitions.map((definition) => [definition.key, definition]));
  const buildingRows = [];
  const instancesByTerritoryBuilding = new Map(); // territory building key -> [{key, level}]
  for (const building of [...territoryBuildings].sort((a, b) => a.key.localeCompare(b.key))) {
    const definition = definitionByKey.get(building.definitionKey);
    if (definition === undefined) throw new Error(`building ${building.key}: unknown definition`);
    const jobProfessions = definition.jobs.map((job) => professionKeyById.get(job.professionId));
    const ids = territoryProvinceIds.get(building.territoryId);
    const weights = new Map();
    for (const id of ids) {
      if (!blockPopulation.has(`${id}:${building.ownerProfessionKey}`)) continue;
      const value =
        jobProfessions.length === 0
          ? weight.get(id).total
          : jobProfessions.reduce((acc, key) => acc + (blockPopulation.get(`${id}:${key}`) ?? 0), 0);
      weights.set(id, value);
    }
    if (weights.size === 0) throw new Error(`building ${building.key}: no province hosts its owner profession`);
    if ([...weights.values()].every((value) => !(value > 0))) {
      for (const id of weights.keys()) weights.set(id, weight.get(id).total + 1);
    }
    const levels = largestRemainder(building.level, weights);
    const cash = largestRemainder(Math.round(building.operatingCashRUSD), levels);
    const instances = [];
    for (const [provinceId, level] of [...levels].sort((a, b) => a[0] - b[0])) {
      const province = provinces.find((candidate) => candidate.id === provinceId);
      const key = `${province.key}-${building.definitionKey}`;
      instances.push({ key, provinceId, level });
      buildingRows.push({
        key,
        provinceId,
        definitionKey: building.definitionKey,
        level,
        ownerProfessionKey: building.ownerProfessionKey,
        operatingCashRUSD: cash.get(provinceId) ?? 0,
        status: building.status,
      });
    }
    instancesByTerritoryBuilding.set(building.key, instances);
  }
  buildingRows.sort((a, b) => a.provinceId - b.provinceId || a.key.localeCompare(b.key));
  const buildingKeys = new Set();
  for (const row of buildingRows) {
    if (buildingKeys.has(row.key)) throw new Error(`duplicate building key ${row.key}`);
    buildingKeys.add(row.key);
  }

  // Countries with province territory.
  const countryRows = countries.map((country) => {
    const { territoryIds, ...rest } = country;
    const provinceIds = territoryIds.flatMap((id) => territoryProvinceIds.get(id)).sort((a, b) => a - b);
    const out = {};
    for (const [key, value] of Object.entries(rest)) {
      out[key] = value;
      if (key === "name") out.provinceIds = provinceIds;
    }
    return out;
  });
  const countryByTag = new Map(countryRows.map((country) => [country.tag, country]));
  const countryOfProvince = new Map();
  for (const country of countryRows) for (const id of country.provinceIds) countryOfProvince.set(id, country.id);

  // Customs territories (D-119).
  const adminTagOf = new Map(countryRows.map((country) => [country.tag, country.tag]));
  for (const union of customs.unions) {
    if (!countryByTag.has(union.administratorTag) || !countryByTag.has(union.memberTag)) {
      throw new Error(`customs union ${union.memberTag}->${union.administratorTag} references an unknown country`);
    }
    adminTagOf.set(union.memberTag, union.administratorTag);
  }
  const membersByAdmin = new Map();
  for (const country of countryRows) {
    const admin = adminTagOf.get(country.tag);
    if (!membersByAdmin.has(admin)) membersByAdmin.set(admin, []);
    membersByAdmin.get(admin).push(country);
  }
  const admins = [...membersByAdmin.keys()]
    .map((tag) => countryByTag.get(tag))
    .sort((a, b) => a.id - b.id);
  const oldMarketOfCountry = new Map();
  for (const market of oldMarkets) {
    for (const territoryId of market.territoryIds) {
      const tag = territoryById.get(territoryId).polityTag;
      const country = countryByTag.get(tag);
      if (country !== undefined) oldMarketOfCountry.set(country.tag, market);
    }
  }
  const lotsByMarketKey = new Map();
  const marketRows = [];
  const marketMeta = [];
  const marketOfCountry = new Map();
  admins.forEach((admin, index) => {
    const members = membersByAdmin.get(admin.tag).sort((a, b) => a.id - b.id);
    const provinceIds = members.flatMap((member) => member.provinceIds).sort((a, b) => a - b);
    const hasDependencies = members.some((member) =>
      member.provinceIds.some((id) => territoryById.get(territoryOfProvince.get(id)).kind === "dependent"),
    );
    const kind = members.length > 1 ? "shared" : hasDependencies ? "imperial" : "national";
    const key = `customs-${admin.tag.toLowerCase()}`;
    const unionNotes = customs.unions
      .filter((union) => union.administratorTag === admin.tag)
      .map((union) => union.arrangement);
    const ownNote = customs.ownTerritoryNotes.find((note) => note.tag === admin.tag)?.note;
    const name =
      kind === "shared"
        ? `${admin.name} customs union`
        : kind === "imperial"
          ? `${admin.name} and dependencies`
          : admin.name;
    const description =
      kind === "shared"
        ? `Customs union: ${unionNotes.join("; ")}.`
        : kind === "imperial"
          ? `${admin.name} with its colonies and protectorates in one customs territory.`
          : `${admin.name} administers its own customs territory.${ownNote === undefined ? "" : ` ${ownNote}`}`;
    const old = oldMarketOfCountry.get(admin.tag);
    marketRows.push({
      id: index,
      key,
      name,
      provinceIds,
      customsCountryTag: admin.tag,
      priceBasis: "base-1900",
      initialPriceMultiplier: old?.initialPriceMultiplier ?? 0.25,
      stockLots: [],
      status: "provisional",
      sourceIds: ["customs-territories-1900", "project-authored-p2"],
    });
    marketMeta.push({
      marketId: index,
      key,
      name,
      kind,
      description,
      customsCountryId: admin.id,
      memberCountryIds: members.map((member) => member.id),
    });
    for (const member of members) marketOfCountry.set(member.id, index);
    lotsByMarketKey.set(key, []);
  });

  // Opening stock follows the building's level shares.
  let lotTotalBefore = 0;
  let lotTotalAfter = 0;
  for (const market of oldMarkets) {
    for (const lot of market.stockLots) {
      lotTotalBefore += lot.quantity;
      const instances = instancesByTerritoryBuilding.get(lot.ownerBuildingKey);
      if (instances === undefined) throw new Error(`stock lot owner ${lot.ownerBuildingKey} is unknown`);
      const levels = new Map(instances.map((instance) => [instance.provinceId, instance.level]));
      const split = Number.isInteger(lot.quantity)
        ? largestRemainder(lot.quantity, levels)
        : new Map(instances.map((instance) => [instance.provinceId, lot.quantity * (instance.level / instances.reduce((a, b) => a + b.level, 0))]));
      for (const instance of instances) {
        const quantity = split.get(instance.provinceId) ?? 0;
        if (!(quantity > 0)) continue;
        lotTotalAfter += quantity;
        const marketId = marketOfCountry.get(countryOfProvince.get(instance.provinceId));
        marketRows[marketId].stockLots.push({
          goodKey: lot.goodKey,
          ownerBuildingKey: instance.key,
          quantity,
        });
      }
    }
  }
  for (const market of marketRows) {
    market.stockLots.sort(
      (a, b) => a.ownerBuildingKey.localeCompare(b.ownerBuildingKey) || a.goodKey.localeCompare(b.goodKey),
    );
  }

  // Generated trade routes.
  const marketOfProvince = new Map();
  for (const market of marketRows) for (const id of market.provinceIds) marketOfProvince.set(id, market.id);
  const labelById = new Map(provinces.map((province) => [province.id, province.label]));
  const coastal = new Set(borders.filter((border) => border.b === -1).map((border) => border.a));
  const pairKm = new Map();
  const notePair = (a, b, km, kind) => {
    const key = `${Math.min(a, b)}:${Math.max(a, b)}`;
    const existing = pairKm.get(key);
    if (existing === undefined || km < existing.km || (km === existing.km && kind === "land")) {
      pairKm.set(key, { km, kind: existing?.kind === "land" ? "land" : kind });
    } else if (kind === "land") existing.kind = "land";
  };
  for (const border of borders) {
    if (border.b < 0) continue;
    const marketA = marketOfProvince.get(border.a);
    const marketB = marketOfProvince.get(border.b);
    if (marketA === undefined || marketB === undefined || marketA === marketB) continue;
    notePair(marketA, marketB, haversineKm(labelById.get(border.a), labelById.get(border.b)), "land");
  }
  const coastsByMarket = new Map(marketRows.map((market) => [market.id, market.provinceIds.filter((id) => coastal.has(id))]));
  const seaKm = (a, b) => {
    let best = Infinity;
    for (const x of coastsByMarket.get(a)) {
      for (const y of coastsByMarket.get(b)) best = Math.min(best, haversineKm(labelById.get(x), labelById.get(y)));
    }
    return best;
  };
  const coastalMarkets = marketRows.filter((market) => coastsByMarket.get(market.id).length > 0).map((market) => market.id);
  const seaCache = new Map();
  const seaDistance = (a, b) => {
    const key = `${Math.min(a, b)}:${Math.max(a, b)}`;
    if (!seaCache.has(key)) seaCache.set(key, seaKm(a, b));
    return seaCache.get(key);
  };
  for (const a of coastalMarkets) {
    const nearest = coastalMarkets
      .filter((b) => b !== a)
      .map((b) => ({ b, km: seaDistance(a, b) }))
      .sort((x, y) => x.km - y.km || x.b - y.b)
      .slice(0, 3);
    for (const { b, km } of nearest) notePair(a, b, km, "sea");
  }
  // Connect any remaining components through their closest province labels.
  const parent = marketRows.map((market) => market.id);
  const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  for (const key of pairKm.keys()) {
    const [a, b] = key.split(":").map(Number);
    parent[find(a)] = find(b);
  }
  for (;;) {
    const roots = [...new Set(marketRows.map((market) => find(market.id)))];
    if (roots.length <= 1) break;
    let best = null;
    for (const a of marketRows) {
      for (const b of marketRows) {
        if (find(a.id) !== roots[0] || find(b.id) === roots[0]) continue;
        let km = Infinity;
        for (const x of a.provinceIds) for (const y of b.provinceIds) km = Math.min(km, haversineKm(labelById.get(x), labelById.get(y)));
        if (best === null || km < best.km) best = { a: a.id, b: b.id, km };
      }
    }
    notePair(best.a, best.b, best.km, "sea");
    parent[find(best.a)] = find(best.b);
  }
  const marketPopulation = new Map(
    marketRows.map((market) => [market.id, market.provinceIds.reduce((acc, id) => acc + (weight.get(id)?.total ?? 0), 0)]),
  );
  const territoryPopulation = new Map();
  for (const row of popRows) {
    const marketId = marketOfProvince.get(row.provinceId);
    territoryPopulation.set(marketId, (territoryPopulation.get(marketId) ?? 0) + row.population);
  }
  const routes = [...pairKm]
    .map(([key, { km, kind }]) => {
      const [a, b] = key.split(":").map(Number);
      const population = (territoryPopulation.get(a) ?? 0) + (territoryPopulation.get(b) ?? 0);
      return {
        marketAKey: marketRows[a].key,
        marketBKey: marketRows[b].key,
        kind,
        distanceUnits: distanceUnits(km),
        baseCapacityRUSDPerDay: Math.round(Math.min(300000, Math.max(40000, 30000 + (250 * population) / 1e6))),
        status: "provisional",
        sourceIds: ["project-authored-p2"],
      };
    })
    .sort((x, y) => x.marketAKey.localeCompare(y.marketAKey) || x.marketBKey.localeCompare(y.marketBKey));

  // Scenario meta.
  const scenario = read(SCENARIO);
  const meta = scenario.meta;
  // The runtime reads the P2b calibration of these tables (D-135), built from the P2
  // outputs by scripts/p2b/build-money-calibration.mjs, and the 1900-world definitions.
  meta.files = {
    // P5b (D-148): the P5 countries with the 1900 technology grants (D-146 A9) and the
    // fiscal values of the new coverage, built by scripts/p5b/build-goods-1900.mjs.
    countries: "historical/p5b/countries_1900.json",
    // P5b (D-148): the P5 provinces (land use, imputed land) with their latitude.
    provinces: "historical/p5b/provinces_1900.json",
    // P5b (D-148): the P2b markets with the opening stock of every good, the P2b routes
    // with the capacity of the new coverage, and the 57-good buildings.
    markets: "historical/p5b/markets_1900.json",
    tradeRoutes: "historical/p5b/trade_routes_1900.json",
    // P7 (D-154): the sixteen-profession blocks with their measured 1900 incomes and an
    // empty employment table (the labour market's first refresh employs), built by
    // scripts/p5b/build-goods-1900.mjs (P7 steps in scripts/p7/).
    populations: "historical/p7/pops_1900.json",
    buildings: "historical/p5b/buildings_1900.json",
    employment: "historical/p7/employment_1900.json",
    calibration: "historical/p2b/calibration_targets_1900.json",
    moneyCoefficients: "historical/p2b/money_coefficients_1900.json",
    // P3 (D-141): currencies, arrangements and sourced 1900 parities.
    currencies: "historical/p3/currencies_1900.json",
    // P4 (D-142): sourced 1900 demographic levels, age structures and urban shares,
    // built by scripts/p4/build-demography-1900.mjs.
    // P7 (D-154): the same with the blocks' urban shares by settlement order.
    demography: "historical/p7/demography_1900.json",
    // P5 (D-143): natural-resource deposits (authored, USGS MRDS, SAGE/HYDE forest).
    deposits: "historical/p5/deposits_1900.json",
    // D-140 / D-149: the 1900 metal-standard authorities (Director of the Mint money
    // stocks, treasury-funded mint cash), built by scripts/p5b/build-goods-1900.mjs.
    monetary: "historical/p5b/monetary_1900.json",
  };
  meta.definitions = {
    ...meta.definitions,
    // P5b (D-146, D-148): the 57-good catalogue, its buildings and need items.
    goods: "historical/p5b/goods_1900.json",
    // P7 (D-154): sixteen professions with roles; the labour-market configuration; the
    // politics content with the interest groups remapped to them (plan §3.5).
    professions: "historical/p7/professions_1900.json",
    buildings: "historical/p5b/buildings_definitions_1900.json",
    needs: "historical/p5b/needs_1900.json",
    // P6 (D-153): the linear expenditure system of households.
    demandSystem: "historical/p6/demand_1900.json",
    labourMarket: "historical/p7/labour_1900.json",
    // P7 (D-154): demography definitions with a fertility multiplier for all sixteen.
    demography: "historical/p7/demography_definitions_1900.json",
    politics: "historical/p7/politics_1900.json",
  };
  meta.countryMeta = meta.countryMeta.map((entry) => {
    const out = {};
    for (const [key, value] of Object.entries(entry)) out[key === "regionName" ? "homeTerritoryName" : key] = value;
    return out;
  });
  meta.marketMeta = marketMeta;
  meta.territoryMeta = territories
    .filter((territory) => territory.kind === "dependent")
    .map((territory) => ({
      polityTag: territory.polityTag,
      provinceIds: territoryProvinceIds.get(territory.id),
      historicalName: territory.historicalName,
      status: territory.status,
      sovereignCountryId: territory.sovereignCountryId,
      capitalName: territory.capitalName,
      selectable: territory.selectable,
      confidence: territory.confidence,
      notes: territory.notes,
    }));
  delete meta.regionMeta;
  const p2Sources = [
      {
        id: "hyde-3.3",
        title: "HYDE 3.3 History Database of the Global Environment, 1900 AD grids (baseline)",
        url: "https://doi.org/10.24416/UU01-94FNH0",
        accessDate: "2026-11-02",
        license: "CC BY 3.0",
        notes: "Within-country province shares of population, urban population, cropland and grazing land (D-121).",
      },
      {
        id: "customs-territories-1900",
        title: "1900 customs territories audit (customs_territories_1900.json)",
        url: "packages/data/data/historical/m11/customs_territories_1900.json",
        accessDate: "2026-11-02",
        license: "Project authored",
        notes: "Customs unions and tariff autonomy in 1900 with sources (D-119).",
      },
      {
        id: "project-authored-p2",
        title: "P2 province scenario builder (scripts/p2/build-province-scenario.mjs)",
        url: "scripts/p2/build-province-scenario.mjs",
        accessDate: "2026-11-02",
        license: "Project authored",
        notes: "Provisional distribution rules of D-131; generated, not observed.",
      },
      {
        id: "p2b-money-calibration",
        title: "P2b historical money and productivity calibration (scripts/p2b/build-money-calibration.mjs)",
        url: "packages/data/data/historical/p2b/sources_1900.json",
        accessDate: "2026-11-03",
        license: "Project authored from cited sources",
        notes: "Wages, prices, budgets, techniques and levels re-derived from the cited 1900 sources in sources_1900.json and converted with the Minneapolis Fed CPI (15.704 RUSD per 1900 dollar); trace in calibration_1900.json (D-135).",
      },
      {
        id: "p5b-catalogue",
        title: "P5b 57-good catalogue and 1900 placement (scripts/p5b/build-goods-1900.mjs)",
        url: "packages/data/data/historical/p5b/sources_1900.json",
        accessDate: "2026-11-06",
        license: "Project authored from cited sources",
        notes: "1900 prices, output shares, the 1901 budget and technology evidence in sources_1900.json; placement, levels and techniques from modelled demand (D-146 A5); trace in calibration_1900.json (D-148).",
      },
      {
        id: "goa-census-1900",
        title: "Portuguese census of Goa, 1 December 1900 (Government of Goa, Economic Survey 2016-17, Part 1)",
        url: "https://www.goa.gov.in/wp-content/uploads/2020/02/Economic-Survey-2016-17-Part-1.pdf",
        accessDate: "2026-11-02",
        license: "Government publication; figure cited",
        notes: "475,513 inhabitants (227,393 and 248,120 by sex); used for the Portuguese India territory (D-132).",
      },
      {
        id: "webb-1911",
        title: "Webb, The New Dictionary of Statistics (1911), \"Occupations\", pp. 428-448",
        url: "https://archive.org/details/newdictionaryofs00webb",
        accessDate: "2026-11-09",
        license: "Public domain (published 1911; Internet Archive NOT_IN_COPYRIGHT)",
        notes: "Census occupation groups c. 1900 of about twenty territories; the P7 occupation shares (historical/p7/sources_1900.json, D-154).",
      },
      {
        id: "p7-labour",
        title: "Fabric of Nations P7 labour market of 1900 (scripts/p7/)",
        url: "internal:packages/data/data/historical/p7/sources_1900.json",
        accessDate: "2026-11-09",
        license: "Project data",
        notes: "Sixteen professions, occupation shares (census or proxy), the job, owner and institution remaps and the measured opening incomes; trace in calibration_1900.json p7 (D-154).",
      },
  ];
  for (const source of p2Sources) {
    if (!meta.sources.some((existing) => existing.id === source.id)) meta.sources.push(source);
  }

  const totalPeopleIn = pops.reduce((acc, row) => acc + row.population, 0);
  const totalPeopleOut = popRows.reduce((acc, row) => acc + row.population, 0);
  const levelIn = territoryBuildings.reduce((acc, row) => acc + row.level, 0);
  const levelOut = buildingRows.reduce((acc, row) => acc + row.level, 0);
  const cashIn = territoryBuildings.reduce((acc, row) => acc + Math.round(row.operatingCashRUSD), 0);
  const cashOut = buildingRows.reduce((acc, row) => acc + row.operatingCashRUSD, 0);
  if (totalPeopleIn !== totalPeopleOut || levelIn !== levelOut || cashIn !== cashOut) {
    throw new Error("conservation failed in the province split");
  }
  const outputs = {
    "provinces_1900.json": json(provinceRecords),
    "pops_1900.json": json(popRows),
    "buildings_1900.json": json(buildingRows),
    "countries_1900.json": json(countryRows),
    "markets_1900.json": json(marketRows),
    "trade_routes_1900.json": json(routes),
    "employment_1900.json": json([]),
  };
  const report = {
    generator: "scripts/p2/build-province-scenario.mjs",
    decision: "D-131",
    inputs: Object.fromEntries(
      Object.entries(INPUTS).map(([name, path]) => [name, sha256(readText(path))]),
    ),
    outputs: Object.fromEntries(Object.entries(outputs).map(([name, text]) => [name, sha256(text)])),
    counts: {
      provinces: provinceRecords.length,
      populationBlocks: popRows.length,
      buildings: buildingRows.length,
      customsTerritories: marketRows.length,
      tradeRoutes: routes.length,
      landRoutes: routes.filter((route) => route.kind === "land").length,
      provincesWithPopulation: new Set(popRows.map((row) => row.provinceId)).size,
    },
    conservation: {
      population: totalPeopleOut,
      buildingLevels: levelOut,
      operatingCashRUSD: cashOut,
      stockQuantityIn: lotTotalBefore,
      stockQuantityOut: lotTotalAfter,
    },
  };
  outputs["build_report.json"] = json(report);

  // The app's pre-campaign catalog names the same customs territories (D-119).
  const catalogSource = readText(CATALOG_TS);
  const head = "export const WORLD_CATALOG = (";
  const tail = ") as unknown as WorldCatalogData;";
  const start = catalogSource.indexOf(head) + head.length;
  const end = catalogSource.lastIndexOf(tail);
  if (start < head.length || end < 0) throw new Error("worldCatalog.ts: unexpected module shape");
  const catalog = JSON.parse(catalogSource.slice(start, end));
  const keyOfCountryTag = new Map(
    countryRows.map((country) => [country.tag, marketRows[marketOfCountry.get(country.id)].key]),
  );
  catalog.markets = marketMeta.map((meta) => ({
    id: meta.marketId,
    key: meta.key,
    name: meta.name,
    kind: meta.kind,
    customsTag: countryRows.find((country) => country.id === meta.customsCountryId).tag,
    description: meta.description,
  }));
  for (const entry of catalog.entries) {
    const key = keyOfCountryTag.get(entry.kind === "state" ? entry.tag : entry.sovereignTag);
    if (key === undefined) throw new Error(`catalog entry ${entry.tag} has no customs territory`);
    entry.market = key;
  }
  const catalogText = `${catalogSource.slice(0, start)}${JSON.stringify(catalog, null, 2)}${catalogSource.slice(end)}`;
  return { outputs, scenarioText: json(scenario), catalogText };
}

const { outputs, scenarioText, catalogText } = build();
if (CHECK) {
  const stale = [];
  for (const [name, text] of Object.entries(outputs)) {
    const path = join(OUT, name);
    if (!existsSync(path) || readText(path) !== text) stale.push(name);
  }
  if (readText(SCENARIO) !== scenarioText) stale.push("scenarios/m11_world_1900.json");
  if (readText(CATALOG_TS) !== catalogText) stale.push("app/src/generated/worldCatalog.ts");
  if (stale.length > 0) {
    console.error(`Province scenario is stale: ${stale.join(", ")}. Run node scripts/p2/build-province-scenario.mjs`);
    process.exit(1);
  }
  console.log("Province scenario is current.");
} else {
  mkdirSync(OUT, { recursive: true });
  for (const [name, text] of Object.entries(outputs)) writeFileSync(join(OUT, name), text);
  writeFileSync(SCENARIO, scenarioText);
  writeFileSync(CATALOG_TS, catalogText);
  const report = JSON.parse(outputs["build_report.json"]);
  console.log(JSON.stringify(report.counts), JSON.stringify(report.conservation));
}
