/**
 * Build the M11 1900 world tables and scenario from the authored polity catalog.
 *
 * Input:  packages/data/data/historical/m11/polities_1900.json
 * Output: packages/data/data/historical/m11/{regions,countries,markets,pops,
 *         buildings,employment,calibration_targets,trade_routes}_1900.json
 *         packages/data/data/scenarios/m11_world_1900.json
 *         packages/app/src/generated/worldCatalog.ts
 *
 * Every emitted value is a documented approximation derived from the catalog.
 * Run: node scripts/m11/build-world-data.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const DATA = resolve(ROOT, "packages/data/data");
const CATALOG_PATH = resolve(DATA, "historical/m11/polities_1900.json");
const OUT_DIR = resolve(DATA, "historical/m11");
const DATA_VERSION = "m3-economy-v12";
const SCENARIO_ID = "m11-world-1900";

const catalog = JSON.parse(readFileSync(CATALOG_PATH, "utf8"));
const states = catalog.states;
const territories = catalog.territories;
const marketsDef = catalog.markets;
const stateByTag = new Map(states.map((s) => [s.tag, s]));
const statesByMarket = new Map();
for (const state of states) {
  const list = statesByMarket.get(state.market) ?? [];
  list.push(state);
  statesByMarket.set(state.market, list);
}

const goods = JSON.parse(readFileSync(resolve(DATA, "historical_goods.json"), "utf8"));
const buildingDefs = JSON.parse(readFileSync(resolve(DATA, "historical_buildings.json"), "utf8"));
const goodKeyById = new Map(goods.map((g) => [g.id, g.key]));
const outputsByDef = new Map(
  buildingDefs.map((def) => [
    def.key,
    def.outputs.map((output) => ({ good: goodKeyById.get(output.goodId), quantity: output.quantityPerThroughputUnit })),
  ]),
);

/** Deterministic largest-remainder split of an integer total. */
function split(total, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  const exact = weights.map((w) => (total * w) / sum);
  const out = exact.map((v) => Math.floor(v));
  let assigned = out.reduce((a, b) => a + b, 0);
  const order = exact
    .map((v, i) => ({ i, r: v - Math.floor(v) }))
    .sort((a, b) => b.r - a.r || a.i - b.i);
  for (const { i } of order) {
    if (assigned >= total) break;
    out[i] += 1;
    assigned += 1;
  }
  return out;
}

const TIER = {
  industrial: {
    wealth: 38,
    savings: 20,
    ruralBlocks: [["peasants", 0.62], ["laborers", 0.38]],
    hubPeasantShare: 0.24,
    nonPeasant: [["laborers", 0.52], ["clerks", 0.28], ["academics", 0.06], ["capitalists", 0.14]],
    tech: ["steam-power", "railway-logistics", "primary-schooling", "steelmaking", "electrical-generation", "basic-sanitation", "printing-industry", "chemical-fertilizer"],
    infrastructure: 0.68,
    researchStaffShare: 0.18,
    educationPerCapita: 0.00035,
  },
  mixed: {
    wealth: 30,
    savings: 8,
    ruralBlocks: [["peasants", 0.72], ["laborers", 0.28]],
    hubPeasantShare: 0.34,
    nonPeasant: [["laborers", 0.55], ["clerks", 0.28], ["academics", 0.05], ["capitalists", 0.12]],
    tech: ["steam-power", "railway-logistics", "primary-schooling", "basic-sanitation", "printing-industry"],
    infrastructure: 0.48,
    researchStaffShare: 0.12,
    educationPerCapita: 0.0002,
  },
  agrarian: {
    wealth: 20,
    savings: 3,
    ruralBlocks: [["peasants", 0.82], ["laborers", 0.18]],
    hubPeasantShare: 0.52,
    nonPeasant: [["laborers", 0.52], ["clerks", 0.30], ["academics", 0.03], ["capitalists", 0.15]],
    tech: ["steam-power", "primary-schooling"],
    infrastructure: 0.25,
    researchStaffShare: 0.08,
    educationPerCapita: 0.00008,
  },
};

const REGIME_BY_TAG = {
  RUS: "absolute-monarchy", OTT: "absolute-monarchy", CHN: "absolute-monarchy",
  PER: "absolute-monarchy", AFG: "absolute-monarchy", ETH: "absolute-monarchy",
  MAR: "absolute-monarchy", NPL: "absolute-monarchy", THA: "absolute-monarchy",
  KOR: "absolute-monarchy", OMN: "absolute-monarchy",
  GBR: "constitutional-monarchy", DEU: "constitutional-monarchy", JPN: "constitutional-monarchy",
  ITA: "constitutional-monarchy", ESP: "constitutional-monarchy", PRT: "constitutional-monarchy",
  NLD: "constitutional-monarchy", BEL: "constitutional-monarchy", SWE: "constitutional-monarchy",
  NOR: "constitutional-monarchy", DNK: "constitutional-monarchy", GRC: "constitutional-monarchy",
  ROM: "constitutional-monarchy", SRB: "constitutional-monarchy", MNT: "constitutional-monarchy",
  BGR: "constitutional-monarchy", LUX: "constitutional-monarchy", MCO: "constitutional-monarchy",
  LIE: "constitutional-monarchy", ZAR: "republic", ORF: "republic",
  AUT: "constitutional-monarchy", TON: "constitutional-monarchy", SOK: "absolute-monarchy",
  WAD: "absolute-monarchy", DAR: "absolute-monarchy", SHM: "absolute-monarchy", CRT: "republic",
  USA: "republic", FRA: "republic", CHE: "republic", SMR: "republic", AND: "republic",
  LBR: "republic", MEX: "republic", GUA: "republic", HON: "republic", SAL: "republic",
  NIC: "republic", COS: "republic", COL: "republic", VEN: "republic", ECU: "republic",
  PRU: "republic", BOL: "republic", CHL: "republic", ARG: "republic", URY: "republic",
  PRY: "republic", BRA: "republic", HTI: "republic", DOM: "republic", CUB: "republic",
};

const OPEN_IMMIGRATION = new Set(["USA", "ARG", "BRA", "CAN", "AUS", "NZL", "URY"]);
const PROGRESSIVE_TAXATION = new Set(["GBR", "USA", "FRA", "DEU", "NLD", "BEL", "CHE", "SWE", "DNK", "ITA", "NOR"]);
const OPEN_TRADE = new Set(["GBR", "USA", "NLD", "BEL", "CHE", "DNK", "SWE", "ARG", "CHL"]);
const UNIVERSAL_SUFFRAGE = new Set(["AUS", "NZL"]);
const PROTECTED_LABOR = new Set(["AUS", "NZL", "GBR"]);

const CURRENCY_NAMES = {
  USA: ["usd", "United States dollar"], GBR: ["gbp", "Pound sterling"],
  DEU: ["dem", "German mark"], FRA: ["frf", "French franc"],
  RUS: ["rub", "Russian ruble"], JPN: ["jpy", "Japanese yen"],
  ITA: ["itl", "Italian lira"], ESP: ["esp", "Spanish peseta"],
  PRT: ["pte", "Portuguese escudo"], NLD: ["nlg", "Dutch guilder"],
  BEL: ["bef", "Belgian franc"], CHE: ["chf", "Swiss franc"],
  SWE: ["sek", "Swedish krona"], NOR: ["nok", "Norwegian krone"],
  DNK: ["dkk", "Danish krone"], GRC: ["grx", "Greek drachma"],
  SRB: ["rsd", "Serbian dinar"], MNT: ["mep", "Montenegrin perper"],
  ROM: ["rol", "Romanian leu"], BGR: ["bgl", "Bulgarian lev"],
  OTT: ["otl", "Ottoman lira"], LUX: ["luf", "Luxembourg franc"],
  MCO: ["mcf", "Monegasque franc"], SMR: ["sml", "Sammarinese lira"],
  AND: ["adf", "Andorran franc"], LIE: ["lie", "Liechtenstein krone"],
  CHN: ["cnx", "Qing tael"], KOR: ["krw", "Korean won"],
  PER: ["irq", "Persian qiran"], AFG: ["afr", "Afghan rupee"],
  NPL: ["npr", "Nepalese rupee"], THA: ["thb", "Siamese baht"],
  OMN: ["omr", "Omani rial"], ETH: ["etb", "Ethiopian birr"],
  AUT: ["aut", "Austro-Hungarian krone"], TON: ["ton", "Tongan pound (sterling-linked)"],
  SOK: ["sok", "Sokoto currency"], WAD: ["wad", "Wadai currency"], DAR: ["dar", "Darfur currency"],
  SHM: ["shm", "Ha'il currency"], CRT: ["crt", "Cretan drachma"],
  LBR: ["lbd", "Liberian dollar"], MAR: ["mah", "Moroccan rial"],
  ZAR: ["zar", "Transvaal pound"], ORF: ["ofs", "Orange Free State pound"],
  MEX: ["mxp", "Mexican peso"], GUA: ["gtq", "Guatemalan peso"],
  HON: ["hnl", "Honduran lempira"], SAL: ["svc", "Salvadoran colon"],
  NIC: ["nio", "Nicaraguan cordoba"], COS: ["crc", "Costa Rican colon"],
  COL: ["cop", "Colombian peso"], VEN: ["veb", "Venezuelan bolivar"],
  ECU: ["ecs", "Ecuadorian sucre"], PRU: ["pes", "Peruvian sol"],
  BOL: ["bob", "Bolivian boliviano"], CHL: ["clp", "Chilean peso"],
  ARG: ["arp", "Argentine peso"], URY: ["uyu", "Uruguayan peso"],
  PRY: ["pyg", "Paraguayan guarani"], BRA: ["brl", "Brazilian milreis"],
  HTI: ["htg", "Haitian gourde"], DOM: ["dop", "Dominican peso"],
  CAN: ["cad", "Canadian dollar"], AUS: ["aup", "Australian pound"],
  NZL: ["nzp", "New Zealand pound"], CUB: ["cup", "Cuban peso"],
};

const NEEDS = { grain: 0.527, "food-products": 0.03, fish: 0.03, livestock: 0.03, clothing: 0.01 };

/** Regions: one home region per state, one region per territory. */
const regions = [];
const regionById = new Map();

for (const state of states) {
  const tier = TIER[state.tier];
  const region = {
    id: state.id,
    key: `${state.tag.toLowerCase()}-home`,
    name: `${state.commonName} (home territory)`,
    infrastructure: tier.infrastructure,
    sourceIds: state.sources,
    calibrationStatus: "provisional",
  };
  regions.push(region);
  regionById.set(region.id, region);
}
for (const territory of territories) {
  const tier = TIER[territory.tier];
  const region = {
    id: territory.id,
    key: territory.tag.toLowerCase(),
    name: territory.name,
    infrastructure: tier.infrastructure,
    sourceIds: territory.sources,
    calibrationStatus: "provisional",
  };
  regions.push(region);
  regionById.set(region.id, region);
}

const entityByRegion = new Map();
for (const state of states) entityByRegion.set(state.id, state);
for (const territory of territories) entityByRegion.set(territory.id, territory);

const territoriesBySovereign = new Map();
for (const territory of territories) {
  const list = territoriesBySovereign.get(territory.sovereignTag) ?? [];
  list.push(territory);
  territoriesBySovereign.set(territory.sovereignTag, list);
}

function marketOfEntity(entity) {
  if (entity.kind === "state") return entity.market;
  const sovereign = stateByTag.get(entity.sovereignTag);
  return sovereign.market;
}

function isHub(region) {
  const entity = entityByRegion.get(region.id);
  if (entity.kind === "territory") return false;
  if (entity.tier !== "agrarian") return true;
  const market = marketsDef.find((m) => m.key === entity.market);
  return market.customsTag === entity.tag;
}

/** Populations and social blocks. */
const popBlocks = [];
const blockByRegionProfession = new Map();
for (const region of regions) {
  const entity = entityByRegion.get(region.id);
  const tier = TIER[entity.tier];
  const total = entity.population1900;
  const hub = isHub(region);
  let shares;
  if (hub) {
    const peasants = Math.round(total * tier.hubPeasantShare);
    const rest = split(total - peasants, tier.nonPeasant.map(([, w]) => w));
    shares = [["peasants", peasants], ...tier.nonPeasant.map(([key], i) => [key, rest[i]])];
  } else {
    const parts = split(total, tier.ruralBlocks.map(([, w]) => w));
    shares = tier.ruralBlocks.map(([key], i) => [key, parts[i]]);
  }
  const baseWealth = tier.wealth;
  const wealthByProfession = {
    peasants: Math.max(5, Math.round(baseWealth * 0.55)),
    laborers: Math.max(8, Math.round(baseWealth * 0.85)),
    clerks: Math.min(99, baseWealth + 22),
    academics: Math.min(99, baseWealth + 25),
    capitalists: Math.max(60, baseWealth + 50),
  };
  const literacyByProfession = {
    peasants: entity.literacy * 0.8,
    laborers: Math.min(1, entity.literacy * 0.95 + 0.02),
    clerks: Math.min(1, entity.literacy + 0.15),
    academics: Math.min(1, entity.literacy + 0.25),
    capitalists: Math.min(1, entity.literacy + 0.2),
  };
  const militancyBase = entity.tier === "industrial" ? 0.05 : entity.tier === "mixed" ? 0.07 : 0.09;
  for (const [professionKey, population] of shares) {
    if (population <= 0) continue;
    const block = {
      regionId: region.id,
      professionKey,
      population,
      literacy: Number(literacyByProfession[professionKey].toFixed(4)),
      wealthLevel: wealthByProfession[professionKey],
      savingsPerCapitaSUSD: tier.savings,
      militancy: Number((militancyBase + (professionKey === "peasants" ? 0.01 : 0)).toFixed(4)),
      sourceIds: ["owid-population", "project-authored-1900"],
      calibrationStatus: "provisional",
    };
    popBlocks.push(block);
    blockByRegionProfession.set(`${region.id}:${professionKey}`, block);
  }
}

/** Buildings: rural grain + storage; hubs add processing, textiles and protein. */
const buildings = [];
const buildingByRegion = new Map();
function addBuilding(region, key, definitionKey, level, ownerProfessionKey, operatingCashSUSD) {
  const building = {
    key: `${region.key}-${key}`,
    regionId: region.id,
    definitionKey,
    level,
    ownerProfessionKey,
    operatingCashSUSD,
    status: "provisional",
  };
  buildings.push(building);
  const list = buildingByRegion.get(region.id) ?? [];
  list.push(building);
  buildingByRegion.set(region.id, list);
  if (!blockByRegionProfession.has(`${region.id}:${ownerProfessionKey}`)) {
    throw new Error(`building ${building.key} has no owner block ${region.id}:${ownerProfessionKey}`);
  }
}

for (const region of regions) {
  const entity = entityByRegion.get(region.id);
  const agrarian = entity.tier === "agrarian";
  const pop = entity.population1900;
  const sub = Math.max(1, Math.round(pop / 305000));
  const levels = {
    sub,
    commercial: Math.max(1, Math.round(sub * 0.124)),
    warehouse: Math.max(1, Math.round(pop / 500000)),
    protein: Math.max(1, Math.round(pop / 2000000)),
    processing: Math.max(1, Math.round(pop / 2100000)),
    textile: Math.max(1, Math.round(pop / 1660000)),
    workshop: Math.max(1, Math.round(sub * 0.212)),
  };
  const cash = pop > 5000000 ? 200000 : 50000;
  addBuilding(region, "subsistence-farm", "subsistence-farm", levels.sub, "peasants", cash);
  addBuilding(
    region,
    agrarian ? "commercial-farm-peasant" : "commercial-farm",
    agrarian ? "commercial-farm-peasant" : "commercial-farm",
    levels.commercial,
    "peasants",
    cash,
  );
  addBuilding(region, "warehouse", "warehouse", levels.warehouse, "peasants", cash);
  if (isHub(region)) {
    addBuilding(region, "ranch", "ranch", levels.protein, "peasants", cash);
    addBuilding(region, "fishery", "fishery", levels.protein, "peasants", cash);
    addBuilding(region, "food-processing", "food-processing", levels.processing, "clerks", cash);
    addBuilding(
      region,
      agrarian ? "workshop-peasant" : "workshop",
      agrarian ? "workshop-peasant" : "workshop",
      levels.workshop,
      agrarian ? "peasants" : "capitalists",
      cash,
    );
    if (!agrarian) {
      addBuilding(region, "textile-mill", "textile-mill", levels.textile, "capitalists", cash);
    }
  }
}

/** Countries: one per state; regionIds = home region + its territories. */
const countries = states.map((state) => {
  const ownedTerritories = territoriesBySovereign.get(state.tag) ?? [];
  const regionIds = [state.id, ...ownedTerritories.map((t) => t.id)].sort((a, b) => a - b);
  const totalPopulation = [state, ...ownedTerritories].reduce((sum, p) => sum + p.population1900, 0);
  const tier = TIER[state.tier];
  const [currencyKey, currencyName] = CURRENCY_NAMES[state.tag] ?? [
    `${state.tag.toLowerCase()}x`,
    `${state.commonName} currency`,
  ];
  const regimeKind = REGIME_BY_TAG[state.tag] ?? "republic";
  const laws = {
    taxation: PROGRESSIVE_TAXATION.has(state.tag) ? "taxation-progressive" : "taxation-flat",
    suffrage:
      regimeKind === "absolute-monarchy"
        ? "suffrage-none"
        : UNIVERSAL_SUFFRAGE.has(state.tag)
          ? "suffrage-universal"
          : regimeKind === "republic"
            ? "suffrage-male"
            : "suffrage-property",
    labor:
      regimeKind === "absolute-monarchy"
        ? "labor-repression"
        : PROTECTED_LABOR.has(state.tag)
          ? "labor-protected"
          : "labor-association",
    trade: OPEN_TRADE.has(state.tag) ? "trade-open" : "trade-restricted",
  };
  return {
    id: state.id,
    tag: state.tag,
    name: state.name,
    regionIds,
    currency: { key: currencyKey, name: currencyName, valuation: { status: "unavailable" } },
    fiscal: {
      incomeTaxRate: state.tier === "industrial" ? 0.06 : state.tier === "mixed" ? 0.05 : 0.03,
      welfareBudgetSUSDPerYear: 0,
    },
    initialTreasuryCashSUSD: Math.max(25000, Math.round(totalPopulation * 0.004)),
    debt: {
      enabled: true,
      creditorKind: "country",
      creditorId: state.tag === "GBR" ? stateByTag.get("USA").id : stateByTag.get("GBR").id,
      annualCouponRate: 0.04,
      termDays: 365,
      maxOutstandingPrincipalSUSD: Math.max(100000, Math.round(totalPopulation * 0.02)),
      refinanceOnMaturity: true,
      arrearsGraceDays: 365,
    },
    immigrationOpen: OPEN_IMMIGRATION.has(state.tag),
    politics: {
      regimeKind,
      governmentGroupKey:
        regimeKind === "absolute-monarchy"
          ? "aristocrats"
          : regimeKind === "republic"
            ? "capitalists"
            : "aristocrats",
      laws,
      institutionFundingSUSDPerYear: Math.max(1000, Math.round(totalPopulation * 0.0006)),
    },
    technology: {
      researchedTechnologyKeys: tier.tech,
      educationFundingSUSDPerYear: Math.max(500, Math.round(totalPopulation * tier.educationPerCapita)),
      researchStaffShare: tier.researchStaffShare,
    },
    sourceIds: ["owid-population", "maddison-2023", "project-authored-1900"],
    occupationSourceIds: ["owid-employment-by-sector", "project-authored-1900"],
  };
});
const countryByTag = new Map(countries.map((c) => [c.tag, c]));

/** Markets and their region membership. */
const markets = marketsDef.map((market) => {
  const members = statesByMarket.get(market.key) ?? [];
  const regionIds = [];
  for (const state of members) {
    regionIds.push(state.id);
    for (const territory of territoriesBySovereign.get(state.tag) ?? []) regionIds.push(territory.id);
  }
  regionIds.sort((a, b) => a - b);
  const totalPopulation = members.reduce((sum, s) => sum + s.population1900, 0);
  const lots = [];
  const capacityByGood = new Map();
  const producerByGood = new Map();
  for (const regionId of regionIds) {
    for (const building of buildingByRegion.get(regionId) ?? []) {
      for (const output of outputsByDef.get(building.definitionKey) ?? []) {
        if (output.good === undefined) continue;
        const quantity = output.quantity * building.level;
        capacityByGood.set(output.good, (capacityByGood.get(output.good) ?? 0) + quantity);
        const previous = producerByGood.get(output.good);
        if (previous === undefined || building.level > previous.level) {
          producerByGood.set(output.good, { key: building.key, level: building.level });
        }
      }
    }
  }
  for (const goodKey of ["grain", "food-products", "livestock", "fish", "textiles", "clothing", "cotton", "wool"]) {
    const producer = producerByGood.get(goodKey);
    if (producer === undefined) continue;
    const perCapita = NEEDS[goodKey] ?? 0.002;
    const days = goodKey === "grain" ? 2 : 1;
    const demand = totalPopulation * perCapita * days;
    const capacity = capacityByGood.get(goodKey) ?? 0;
    const quantity = Math.floor(Math.min(demand, capacity * 0.4));
    if (quantity <= 0) continue;
    lots.push({ goodKey, ownerBuildingKey: producer.key, quantity });
  }
  return {
    id: market.id,
    key: market.key,
    customsCountryTag: market.customsTag,
    name: market.name,
    regionIds,
    priceBasis: "base-1900",
    initialPriceMultiplier: 0.25,
    stockLots: lots,
    status: "provisional",
    sourceIds: ["project-authored-1900"],
  };
});

/** Calibration targets: the authored aggregate is itself the baseline. */
const calibration = [];
for (const state of states) {
  const ownedRegions = [state.id, ...(territoriesBySovereign.get(state.tag) ?? []).map((t) => t.id)];
  let total = 0;
  let peasants = 0;
  for (const regionId of ownedRegions) {
    for (const block of popBlocks) {
      if (block.regionId !== regionId) continue;
      total += block.population;
      if (block.professionKey === "peasants") peasants += block.population;
    }
  }
  calibration.push({
    id: `${state.tag.toLowerCase()}-population-1900`,
    metric: "totalPopulation",
    countryTag: state.tag,
    year: 1900,
    units: "people",
    definition: "Authored 1900 population aggregate for this polity and its dependent territories.",
    target: total,
    toleranceRelative: 0.000001,
    sourceIds: ["owid-population", "maddison-2023"],
    confidence: state.confidence,
    status: "provisional",
    notes: "Rounded historical estimate; regional and profession allocation is authored.",
  });
  calibration.push({
    id: `${state.tag.toLowerCase()}-peasant-share-1900`,
    metric: "peasantPopulationShare",
    countryTag: state.tag,
    year: 1900,
    units: "share of population",
    definition: "Share of the country's modelled population in the peasant profession.",
    target: total > 0 ? peasants / total : 0,
    toleranceAbsolute: 0.000001,
    sourceIds: ["owid-employment-by-sector", "project-authored-1900"],
    confidence: "low",
    status: "provisional",
    notes: "Authored occupation structure, not an observed 1900 statistic.",
  });
}

/** Trade routes: each market connects to its three nearest neighbours. */
const marketCentroids = markets.map((market) => {
  const members = statesByMarket.get(market.key) ?? [];
  let weight = 0;
  let lat = 0;
  let lon = 0;
  for (const state of members) {
    const w = state.population1900;
    weight += w;
    lat += state.capital.lat * w;
    lon += state.capital.lon * w;
  }
  return { id: market.id, key: market.key, lat: lat / weight, lon: lon / weight, population: weight };
});
function haversineKm(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const lat1 = a.lat * rad;
  const lat2 = b.lat * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}
const routePairs = new Set();
const tradeRoutes = [];
for (const market of marketCentroids) {
  const nearest = marketCentroids
    .filter((other) => other.id !== market.id)
    .map((other) => ({ other, km: haversineKm(market, other) }))
    .sort((a, b) => a.km - b.km || a.other.id - b.other.id)
    .slice(0, 3);
  for (const { other, km } of nearest) {
    const pair = `${Math.min(market.id, other.id)}:${Math.max(market.id, other.id)}`;
    if (routePairs.has(pair)) continue;
    routePairs.add(pair);
    const capacity = Math.round(
      Math.min(300000, Math.max(40000, 30000 + 250 * (market.population + other.population) / 1e6)),
    );
    tradeRoutes.push({
      marketAKey: market.key,
      marketBKey: other.key,
      distanceUnits: Math.max(0.5, Math.round((km / 1000) * 10) / 10),
      baseCapacitySUSDPerDay: capacity,
      status: "provisional",
      sourceIds: ["project-authored-1900"],
    });
  }
}

/** Static metadata for the snapshot and the pre-game catalog. */
const countryMeta = states.map((state) => ({
  countryId: state.id,
  historicalName: state.name,
  status: state.status,
  sovereignCountryId: state.id,
  capitalName: state.capital.name,
  regionName: `${state.commonName} (home territory)`,
  selectable: state.selectable,
  population1900Estimate: state.population1900,
  confidence: state.confidence,
  notes: state.notes,
}));
const regionMeta = territories.map((territory) => ({
  regionId: territory.id,
  polityTag: territory.tag,
  historicalName: territory.name,
  status: territory.status,
  sovereignCountryId: countryByTag.get(territory.sovereignTag).id,
  capitalName: territory.capital.name,
  selectable: false,
  confidence: territory.confidence,
  notes: territory.notes,
}));
const marketMeta = markets.map((market) => {
  const def = marketsDef.find((m) => m.key === market.key);
  return {
    marketId: market.id,
    key: market.key,
    name: market.name,
    kind: def.kind,
    description: def.description,
    customsCountryId: countryByTag.get(def.customsTag).id,
  };
});

/** Sources registry for the scenario. */
const sources = [
  {
    id: "owid-population",
    title: "Our World in Data - Population, long-run series",
    url: "https://ourworldindata.org/grapher/population",
    accessDate: "2026-10-29",
    license: "CC BY 4.0",
    notes: "Rounded national population estimates for 1900. The M11 world is a modelled aggregate, not a census of every polity.",
  },
  {
    id: "maddison-2023",
    title: "Maddison Project Database 2023",
    url: "https://www.rug.nl/ggdc/historicaldevelopment/maddison/releases/maddison-project-database-2023",
    accessDate: "2026-10-29",
    license: "CC BY 4.0",
    notes: "Long-run population and income reconstructions used as cross-checks for rounded 1900 totals.",
  },
  {
    id: "owid-employment-by-sector",
    title: "Our World in Data - Employment by sector (historical reconstructions)",
    url: "https://ourworldindata.org/employment-by-sector",
    accessDate: "2026-10-29",
    license: "CC BY 4.0",
    notes: "Broad agricultural-employment reconstructions used only to set wide provisional occupation shares.",
  },
  {
    id: "project-m2-1900-age-structure",
    title: "Century M2 provisional 1900 world age structure",
    url: "internal:packages/data/data/scenarios/m2_world_aggregate.json",
    accessDate: "2026-10-29",
    license: "Project data",
    notes: "Provisional 1900 world age/sex profile used to expand every block total. Not country-specific.",
  },
  {
    id: "project-authored-1900",
    title: "Century M11 authored 1900 world tables",
    url: "internal:packages/data/data/historical/m11/polities_1900.json",
    accessDate: "2026-10-29",
    license: "Project data",
    notes: "Status, capitals, market grouping, geometry crosswalk, and all economic starting values. Explicitly provisional.",
  },
  {
    id: "natural-earth-50m",
    title: "Natural Earth 1:50m cultural vectors",
    url: "https://www.naturalearthdata.com/downloads/50m-cultural-vectors/",
    accessDate: "2026-10-29",
    license: "Public domain",
    notes: "Map geometry source; aggregated into 1900 polities. Not used by the simulation tables.",
  },
  {
    id: "cshapes-2.0",
    title: "CShapes 2.0 historical boundaries (classification reference only)",
    url: "https://icr.ethz.ch/data/cshapes/",
    accessDate: "2026-10-29",
    license: "CC BY-NC-SA 4.0",
    notes: "Consulted for independence/status coding. Not redistributed with this project because of its non-commercial share-alike licence.",
  },
];

const ageStructure = JSON.parse(
  readFileSync(resolve(DATA, "scenarios/m5_eight_polities.json"), "utf8"),
).meta.ageStructures["world-1900-provisional"];

const scenario = {
  meta: {
    scenarioId: SCENARIO_ID,
    dataVersion: DATA_VERSION,
    status: "provisional",
    description:
      `Authored 1900 world for M11/M11b country selection: ${String(states.length)} polities (${String(
        states.filter((state) => state.selectable).length,
      )} selectable), ${String(territories.length)} dependent territories, and ${String(
        marketsDef.length,
      )} documented markets. Population totals are rounded historical estimates; occupation composition, market grouping, building levels, fiscal and technology starts are provisional authored inputs; map geometry is Natural Earth 1:50m aggregated with an explicit 1900 crosswalk. Polities without reliable 1900 polygon data use marker-only map approximations. Not a full historical reconstruction.`,
    startDayIndex: 0,
    playerCountryTag: "USA",
    profitDistribution: { enabled: true, privatePayoutRate: 1, stateRemittanceRate: 1 },
    countryAI: { enabled: true },
    sources,
    ageStructures: { "world-1900-provisional": ageStructure },
    files: {
      countries: "historical/m11/countries_1900.json",
      regions: "historical/m11/regions_1900.json",
      markets: "historical/m11/markets_1900.json",
      tradeRoutes: "historical/m11/trade_routes_1900.json",
      populations: "historical/m11/pops_1900.json",
      buildings: "historical/m11/buildings_1900.json",
      employment: "historical/m11/employment_1900.json",
      calibration: "historical/m11/calibration_targets_1900.json",
    },
    definitions: {
      goods: "historical_goods.json",
      professions: "historical_professions.json",
      buildings: "historical_buildings.json",
      needs: "historical_needs.json",
      demography: "demography.json",
      technology: "technology.json",
    },
    countryMeta,
    marketMeta,
    regionMeta,
  },
};

function writeJson(relativePath, value) {
  const path = resolve(OUT_DIR, relativePath);
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  console.log(`wrote ${relativePath} (${Array.isArray(value) ? value.length : 1} records)`);
}

mkdirSync(OUT_DIR, { recursive: true });
writeJson("regions_1900.json", regions.map((region) => ({
  id: region.id,
  key: region.key,
  name: region.name,
  infrastructure: region.infrastructure,
  sourceIds: region.sourceIds,
  calibrationStatus: region.calibrationStatus,
})));
writeJson("countries_1900.json", countries);
writeJson("markets_1900.json", markets);
writeJson("pops_1900.json", popBlocks);
writeJson("buildings_1900.json", buildings);
writeJson("employment_1900.json", []);
writeJson("calibration_targets_1900.json", calibration);
writeJson("trade_routes_1900.json", tradeRoutes);
const scenarioPath = resolve(DATA, "scenarios/m11_world_1900.json");
writeFileSync(scenarioPath, `${JSON.stringify(scenario, null, 2)}\n`, "utf8");
console.log(`wrote scenarios/m11_world_1900.json`);

/** App-side static catalog (identity, status, capital, description, geometry keys). */
const appCatalog = {
  meta: catalog.meta,
  markets: catalog.markets,
  entries: [...states, ...territories].map((entry) => ({
    id: entry.id,
    tag: entry.tag,
    name: entry.name,
    commonName: entry.commonName,
    kind: entry.kind,
    status: entry.status,
    continent: entry.continent,
    sovereignTag: entry.sovereignTag,
    selectable: entry.selectable,
    capital: entry.capital,
    population1900: entry.population1900,
    market: entry.market,
    description: entry.description,
    confidence: entry.confidence,
    notes: entry.notes,
    geometry: entry.geometry,
  })),
};
const appCatalogPath = resolve(ROOT, "packages/app/src/generated/worldCatalog.ts");
mkdirSync(dirname(appCatalogPath), { recursive: true });
writeFileSync(
  appCatalogPath,
  `/**
 * Generated by scripts/m11/build-world-data.mjs. Do not edit by hand.
 *
 * Static 1900 catalog used before a campaign exists (main menu, country
 * selection). Runtime identity and all mutable state come from the worker
 * snapshot; this module is a build artifact of the same authored catalog.
 */
import type { WorldCatalogData } from "../worldCatalogTypes";

export const WORLD_CATALOG = (${JSON.stringify(appCatalog, null, 2)}) as unknown as WorldCatalogData;
`,
  "utf8",
);
console.log(`wrote packages/app/src/generated/worldCatalog.ts`);

console.log(
  `summary: states=${states.length} selectable=${states.filter((s) => s.selectable).length} territories=${territories.length} regions=${regions.length} countries=${countries.length} markets=${markets.length} pops=${popBlocks.length} buildings=${buildings.length} routes=${tradeRoutes.length}`,
);
