#!/usr/bin/env node
/**
 * P5 (D-121, D-143): land, building land use and resources of the 1900 province world.
 *
 * Inputs (committed):
 *   packages/data/data/historical/p2b/provinces_1900.json   P2b provinces (HYDE 3.3 land)
 *   packages/data/data/historical/p2b/buildings_1900.json   P2b building instances
 *   packages/data/data/historical/p2b/countries_1900.json   1900 countries and provinces
 *   packages/data/data/historical_1900_buildings.json        P2b building definitions
 *   packages/data/data/map/province_geography_1900.json      HYDE land area per province
 *   packages/data/data/historical/p5/deposits_authored_1900.json  authored deposits (cited)
 *   packages/data/data/historical/p5/mrds_province_1900.json  USGS MRDS metal sites by province
 *                                                           (scripts/p5/extract-mrds.mjs)
 *   packages/data/data/historical/p5/forest_province_1900.json  1900 forest by province
 *                                                           (scripts/p5/extract-forest-1900.mjs)
 *   packages/data/data/technology.json                      prospecting technology keys
 *
 * Further outputs: historical/p5/deposits_1900.json (one deposit per province and
 * resource: authored entries win, then MRDS metal sites, then SAGE/HYDE forest as
 * standing timber) and historical/p5/countries_1900.json (the P2b countries; those with
 * a national geological survey by 1900 start knowing geological surveying).
 *
 * Outputs (generated, committed):
 *   packages/data/data/historical/p5/provinces_1900.json    provinces with P5 land fields
 *   packages/data/data/historical/p5/buildings_definitions_1900.json
 *                                                           definitions with `landUse`
 *   packages/data/data/historical/p5/build_report.json      checksums, counts, imputations
 *
 * Method:
 *  1. Land is HYDE 3.3 1900 cropland (`arableLandHa`) and grazing land (`pastureHa`),
 *     as allocated to provinces in P2 (docs/PROVINCE_GEOGRAPHY.md). `landSource` per
 *     kind is "hyde-3.3".
 *  2. Land use of the building definitions: farms (subsistence, commercial, commercial
 *     peasant, mechanised) farm cropland; ranches farm grazing land. Fisheries,
 *     processing, mills, workshops and warehouses use none.
 *  3. Imputation: a province whose 1900 buildings farm a land kind it has none of in
 *     HYDE (small islands, HYDE land-mask gaps, a city) gets
 *       land = the farms' 1900 jobs × the median hectares per farm job of its country's
 *              provinces that do have that land (world median if none),
 *     bounded by the province's HYDE land area not already cropland or grazing land
 *     (a province cannot farm more land than it has; Paris is 113 km²),
 *     `landSource` "imputed", confidence low. Day-0 output does not depend on the value
 *     (world creation normalises the technique, D-143 §1); it bounds later expansion.
 *
 * Usage: node scripts/p5/build-p5-world.mjs [--check]
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DATA = join(ROOT, "packages/data/data");
const OUT = join(DATA, "historical/p5");
const CHECK = process.argv.includes("--check");

const INPUTS = {
  provinces: join(DATA, "historical/p2b/provinces_1900.json"),
  buildings: join(DATA, "historical/p2b/buildings_1900.json"),
  countries: join(DATA, "historical/p2b/countries_1900.json"),
  buildingDefinitions: join(DATA, "historical_1900_buildings.json"),
  geography: join(DATA, "map/province_geography_1900.json"),
  authoredDeposits: join(DATA, "historical/p5/deposits_authored_1900.json"),
  mrds: join(DATA, "historical/p5/mrds_province_1900.json"),
  forest: join(DATA, "historical/p5/forest_province_1900.json"),
  technology: join(DATA, "technology.json"),
};

/** Resource order (matches the simulation's RESOURCE_KINDS). */
const RESOURCES = ["coal", "oil", "gas", "iron", "copper", "bauxite", "tin", "gold", "silver", "nitrate", "uranium", "timber"];

/**
 * Stock of one deposit by size class, in the resource's unit (D-143 §4). PROVISIONAL:
 * order-of-magnitude classes, not reserve estimates. Coal G 1e11 t is a Ruhr or Donbas;
 * oil SG 1e10 t (about 75 billion barrels) a Gulf supergiant province; gold SG 4e7 kg the
 * Witwatersrand. Units: coal, oil, bauxite t; gas thousand m3; iron t Fe; copper t Cu;
 * tin t Sn; gold, silver kg; nitrate t N; uranium t U.
 */
const CLASS_STOCK = {
  coal: { S: 1e8, M: 1e9, L: 1e10, G: 1e11, SG: 1e12 },
  oil: { S: 1e6, M: 1e7, L: 1e8, G: 1e9, SG: 1e10 },
  gas: { S: 1e6, M: 1e7, L: 1e8, G: 1e9, SG: 1e10 },
  iron: { S: 2e6, M: 2e7, L: 2e8, G: 2e9, SG: 2e10 },
  copper: { S: 5e4, M: 5e5, L: 5e6, G: 5e7, SG: 2e8 },
  bauxite: { S: 5e6, M: 5e7, L: 5e8, G: 2e9, SG: 5e9 },
  tin: { S: 5e3, M: 5e4, L: 3e5, G: 2e6, SG: 5e6 },
  gold: { S: 1e3, M: 1e4, L: 1e5, G: 1e6, SG: 4e7 },
  silver: { S: 1e4, M: 1e5, L: 1e6, G: 1e7, SG: 1e8 },
  nitrate: { S: 1e5, M: 1e6, L: 1e7, G: 3e7, SG: 1e8 },
  uranium: { S: 1e3, M: 1e4, L: 1e5, G: 5e5, SG: 1e6 },
};
/**
 * MRDS sites (metals): a large site holds the L-class stock, a medium site the M-class,
 * a small or unsized producer a tenth of the S-class (California gold: 26 L, 72 M and
 * 4,882 S sites give 3.8 kt, against about 3.6 kt produced in history). PROVISIONAL.
 */
const SITE_QUALITY = { L: 1, M: 0.85, S: 0.7 };
/**
 * Site stock scale by resource: MRDS records 10,600 US uranium sites, most of them small
 * Colorado Plateau workings, and at full class stocks they add up to about three times
 * the world's identified uranium resources (Red Book 1999: about 4 Mt U at the time,
 * under 10 Mt in later editions); uranium sites count one class lower. PROVISIONAL.
 */
const SITE_SCALE = {
  uranium: 0.1,
  // Iron: an L-class stock (2e8 t Fe) is a whole ore district, and MRDS lists 14 "large"
  // New York sites; at full class stock that gave the Adirondacks 2.9 billion t Fe, more
  // than the Mesabi range. Iron sites count one class lower (New York 0.29 billion t).
  iron: 0.1,
};
/**
 * Standing timber, m3 per hectare of 1900 forest by biome (FAO Global Forest Resources
 * Assessment 2020: world mean growing stock 137 m3/ha; tropical forests carry more,
 * boreal less). PROVISIONAL.
 */
const TIMBER_M3_PER_HA = { tropical: 180, temperate: 120, boreal: 90 };
const TIMBER_QUALITY = { tropical: 0.6, temperate: 0.9, boreal: 0.7 };
/** Countries with a national geological survey by 1900 start knowing geological surveying. */
const SURVEY_COUNTRIES_1900 = {
  GBR: "Geological Survey of Great Britain, 1835",
  USA: "United States Geological Survey, 1879",
  DEU: "Prussian Geological Survey, 1873",
  FRA: "Service de la carte geologique, 1868",
  AUT: "k.k. Geologische Reichsanstalt, 1849",
  RUS: "Geological Committee (Geolkom), 1882",
  JPN: "Geological Survey of Japan, 1882",
  ITA: "Regio Ufficio Geologico, 1867",
  ESP: "Comision del Mapa Geologico, 1849",
  PRT: "Comissao Geologica, 1857",
  SWE: "Sveriges geologiska undersokning, 1858",
  NOR: "Norges geologiske undersokelse, 1858",
  BEL: "Service geologique de Belgique, 1896",
  CAN: "Geological Survey of Canada, 1842",
  AUS: "colonial geological surveys (Victoria 1852, New South Wales 1875)",
  NZL: "New Zealand Geological Survey, 1865",
};

const readText = (path) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const read = (path) => JSON.parse(readText(path));
const json = (value) => `${JSON.stringify(value, null, 1)}\n`;
const sha256 = (text) => createHash("sha256").update(text).digest("hex");
const round = (value, digits) => Math.round(value * 10 ** digits) / 10 ** digits;

/** D-143 §1: the land each 1900 building definition farms. */
const LAND_USE_BY_DEFINITION = {
  "subsistence-farm": "cropland",
  "commercial-farm": "cropland",
  "commercial-farm-peasant": "cropland",
  "mechanized-farm": "cropland",
  ranch: "pasture",
};
const LAND_FIELD = { cropland: "arableLandHa", pasture: "pastureHa" };

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function build() {
  const provinces = read(INPUTS.provinces);
  const buildings = read(INPUTS.buildings);
  const countries = read(INPUTS.countries);
  const definitions = read(INPUTS.buildingDefinitions);
  const landAreaHa = new Map(read(INPUTS.geography).provinces.map((row) => [row.id, row.landAreaKm2 * 100]));

  for (const key of Object.keys(LAND_USE_BY_DEFINITION)) {
    if (!definitions.some((definition) => definition.key === key)) throw new Error(`unknown definition ${key}`);
  }
  const definitionsOut = definitions.map((definition) => {
    const landUse = LAND_USE_BY_DEFINITION[definition.key];
    return landUse === undefined ? definition : { ...definition, landUse };
  });
  const jobsPerLevel = new Map(
    definitions.map((definition) => [
      definition.key,
      definition.jobs.reduce((sum, job) => sum + job.workersPerThroughputUnit, 0) *
        definition.referenceThroughputPerDayAtLevelOne,
    ]),
  );

  const countryOfProvince = new Map();
  for (const country of countries) for (const provinceId of country.provinceIds) countryOfProvince.set(provinceId, country.tag);
  // Farm jobs by (province, land kind).
  const jobs = new Map();
  for (const building of buildings) {
    const use = LAND_USE_BY_DEFINITION[building.definitionKey];
    if (use === undefined) continue;
    const key = `${building.provinceId}:${use}`;
    jobs.set(key, (jobs.get(key) ?? 0) + building.level * (jobsPerLevel.get(building.definitionKey) ?? 0));
  }

  // Hectares per farm job of provinces with HYDE land, by country and land kind.
  const perJob = { cropland: new Map(), pasture: new Map() };
  const worldPerJob = { cropland: [], pasture: [] };
  for (const province of provinces) {
    for (const use of ["cropland", "pasture"]) {
      const land = province[LAND_FIELD[use]];
      const farmJobs = jobs.get(`${province.id}:${use}`) ?? 0;
      if (!(land > 0) || !(farmJobs > 0)) continue;
      const tag = countryOfProvince.get(province.id);
      const list = perJob[use].get(tag) ?? [];
      list.push(land / farmJobs);
      perJob[use].set(tag, list);
      worldPerJob[use].push(land / farmJobs);
    }
  }
  const worldMedian = { cropland: median(worldPerJob.cropland), pasture: median(worldPerJob.pasture) };

  const imputations = [];
  const provincesOut = provinces.map((province) => {
    const out = { ...province, landSource: { cropland: "hyde-3.3", pasture: "hyde-3.3" } };
    for (const use of ["cropland", "pasture"]) {
      const field = LAND_FIELD[use];
      const farmJobs = jobs.get(`${province.id}:${use}`) ?? 0;
      if (province[field] > 0 || !(farmJobs > 0)) continue;
      const tag = countryOfProvince.get(province.id);
      const countryMedian = median(perJob[use].get(tag) ?? []);
      const haPerJob = countryMedian ?? worldMedian[use];
      const area = landAreaHa.get(province.id) ?? 0;
      const free = area - province.arableLandHa - province.pastureHa;
      const bounded = area > 0 && free > 0 && farmJobs * haPerJob > free;
      const hectares = round(bounded ? free : farmJobs * haPerJob, 0);
      out[field] = hectares;
      out.landSource = { ...out.landSource, [use]: "imputed" };
      imputations.push({
        provinceId: province.id,
        key: province.key,
        country: tag ?? null,
        landUse: use,
        farmJobs,
        hectaresPerJob: round(haPerJob, 4),
        basis: `${countryMedian === null ? "world median" : `${tag} median`}${bounded ? ", bounded by land area" : ""}`,
        hectares,
        confidence: "low",
      });
    }
    return out;
  });

  const { deposits, depositReport } = buildDeposits(provincesOut);
  const countriesOut = countries.map((country) => {
    if (SURVEY_COUNTRIES_1900[country.tag] === undefined) return country;
    const keys = country.technology?.researchedTechnologyKeys ?? [];
    if (keys.includes("geological-surveying")) return country;
    return { ...country, technology: { ...country.technology, researchedTechnologyKeys: [...keys, "geological-surveying"] } };
  });

  const outputs = {
    "provinces_1900.json": json(provincesOut),
    "buildings_definitions_1900.json": json(definitionsOut),
    "deposits_1900.json": json(deposits),
    "countries_1900.json": json(countriesOut),
  };
  const report = {
    generator: "scripts/p5/build-p5-world.mjs",
    decision: "D-143",
    inputs: Object.fromEntries(Object.entries(INPUTS).map(([name, path]) => [name, sha256(readText(path))])),
    outputs: Object.fromEntries(Object.entries(outputs).map(([name, text]) => [name, sha256(text)])),
    land: {
      source: "HYDE 3.3 1900 cropland and grazing land, as allocated to provinces in P2 (docs/PROVINCE_GEOGRAPHY.md)",
      landUseByDefinition: LAND_USE_BY_DEFINITION,
      worldMedianHectaresPerFarmJob: {
        cropland: round(worldMedian.cropland, 4),
        pasture: round(worldMedian.pasture, 4),
      },
      croplandHa: round(provincesOut.reduce((sum, p) => sum + p.arableLandHa, 0), 0),
      pastureHa: round(provincesOut.reduce((sum, p) => sum + p.pastureHa, 0), 0),
      imputations,
    },
    deposits: depositReport,
    surveyCountries1900: SURVEY_COUNTRIES_1900,
  };
  outputs["build_report.json"] = json(report);
  return outputs;
}

/**
 * Deposits of the 1900 world (D-121, D-143 §4): one per (province, resource).
 * Authored entries win; MRDS sites give the other metal deposits; SAGE/HYDE forest
 * gives standing timber.
 */
function buildDeposits(provinces) {
  const provinceByKey = new Map(provinces.map((province) => [province.key, province]));
  const provinceIds = new Set(provinces.map((province) => province.id));
  const technologyKeys = new Set(read(INPUTS.technology).technologies.map((entry) => entry.key));
  const authored = read(INPUTS.authoredDeposits);
  const rows = new Map();
  const key = (provinceId, resource) => `${provinceId}:${resource}`;
  for (const entry of authored.deposits) {
    const province = provinceByKey.get(entry.province);
    if (province === undefined) throw new Error(`authored deposit: unknown province ${entry.province}`);
    if (!RESOURCES.includes(entry.resource)) throw new Error(`authored deposit: unknown resource ${entry.resource}`);
    const stock = CLASS_STOCK[entry.resource]?.[entry.size];
    if (stock === undefined) throw new Error(`authored deposit: no ${entry.size} class for ${entry.resource}`);
    if (entry.requires !== undefined && !technologyKeys.has(entry.requires)) {
      throw new Error(`authored deposit: unknown technology ${entry.requires}`);
    }
    if (!entry.known && entry.requires === undefined) throw new Error(`authored hidden deposit ${entry.province} needs a technology`);
    if (rows.has(key(province.id, entry.resource))) throw new Error(`authored deposit duplicated: ${entry.province} ${entry.resource}`);
    rows.set(key(province.id, entry.resource), {
      provinceId: province.id,
      resource: entry.resource,
      quality: entry.quality,
      initialStock: stock,
      discovered: entry.known,
      requiredTechnologyKey: entry.known ? null : entry.requires,
      source: "authored",
    });
  }
  let fromMrds = 0;
  for (const cell of read(INPUTS.mrds).cells) {
    if (!provinceIds.has(cell.provinceId) || rows.has(key(cell.provinceId, cell.resource))) continue;
    const classes = CLASS_STOCK[cell.resource];
    const small = cell.sizeS + cell.producerUnknownSize;
    const sized = cell.sizeL + cell.sizeM + small;
    const scale = SITE_SCALE[cell.resource] ?? 1;
    const stock =
      scale *
      (sized > 0
        ? cell.sizeL * classes.L + cell.sizeM * classes.M + small * (classes.S / 10)
        : (classes.S / 10) * Math.min(cell.sites, 20));
    const quality =
      sized > 0
        ? (cell.sizeL * SITE_QUALITY.L + cell.sizeM * SITE_QUALITY.M + small * SITE_QUALITY.S) / sized
        : SITE_QUALITY.S;
    const uranium = cell.resource === "uranium";
    const known = !uranium && sized > 0 && cell.knownBy1900 > 0;
    rows.set(key(cell.provinceId, cell.resource), {
      provinceId: cell.provinceId,
      resource: cell.resource,
      quality: round(quality, 3),
      initialStock: round(stock, 0),
      discovered: known,
      requiredTechnologyKey: known ? null : uranium ? "airborne-geophysics" : "geological-surveying",
      source: "mrds",
    });
    fromMrds += 1;
  }
  let forests = 0;
  for (const row of read(INPUTS.forest).provinces) {
    if (!provinceIds.has(row.provinceId) || rows.has(key(row.provinceId, "timber"))) continue;
    const km2 = row.tropicalKm2 + row.temperateKm2 + row.borealKm2;
    const stock =
      100 *
      (row.tropicalKm2 * TIMBER_M3_PER_HA.tropical +
        row.temperateKm2 * TIMBER_M3_PER_HA.temperate +
        row.borealKm2 * TIMBER_M3_PER_HA.boreal);
    if (!(stock >= 1e5)) continue;
    const quality =
      (row.tropicalKm2 * TIMBER_QUALITY.tropical +
        row.temperateKm2 * TIMBER_QUALITY.temperate +
        row.borealKm2 * TIMBER_QUALITY.boreal) /
      km2;
    rows.set(key(row.provinceId, "timber"), {
      provinceId: row.provinceId,
      resource: "timber",
      quality: round(quality, 3),
      initialStock: round(stock, 0),
      discovered: true,
      requiredTechnologyKey: null,
      source: "sage-hyde-forest",
    });
    forests += 1;
  }
  const ordered = [...rows.values()].sort(
    (left, right) => left.provinceId - right.provinceId || RESOURCES.indexOf(left.resource) - RESOURCES.indexOf(right.resource),
  );
  const deposits = ordered.map((row, index) => ({ id: index + 1, ...row }));
  const byResource = {};
  for (const deposit of deposits) {
    const entry = (byResource[deposit.resource] ??= { deposits: 0, known: 0, stock: 0, knownStock: 0 });
    entry.deposits += 1;
    entry.stock += deposit.initialStock;
    if (deposit.discovered) {
      entry.known += 1;
      entry.knownStock += deposit.initialStock;
    }
  }
  return {
    deposits,
    depositReport: {
      authored: authored.deposits.length,
      fromMrds,
      forests,
      total: deposits.length,
      classStock: CLASS_STOCK,
      timberM3PerHa: TIMBER_M3_PER_HA,
      byResource,
    },
  };
}

const outputs = build();
if (CHECK) {
  const stale = [];
  for (const [name, text] of Object.entries(outputs)) {
    const path = join(OUT, name);
    if (!existsSync(path) || readText(path) !== text) stale.push(`historical/p5/${name}`);
  }
  if (stale.length > 0) {
    console.error(`P5 world data is stale: ${stale.join(", ")}. Run node scripts/p5/build-p5-world.mjs`);
    process.exit(1);
  }
  console.log("P5 world data is current.");
} else {
  mkdirSync(OUT, { recursive: true });
  for (const [name, text] of Object.entries(outputs)) writeFileSync(join(OUT, name), text);
  const report = JSON.parse(outputs["build_report.json"]);
  console.log(JSON.stringify({ imputations: report.land.imputations.length, croplandHa: report.land.croplandHa, pastureHa: report.land.pastureHa }));
}
