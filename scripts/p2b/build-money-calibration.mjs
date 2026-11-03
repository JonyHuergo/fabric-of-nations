#!/usr/bin/env node
/**
 * P2b (D-130, D-135): historical money and productivity calibration of the 1900 world.
 *
 * Inputs (committed):
 *   packages/data/data/historical/p2b/sources_1900.json   cited source rows, benchmarks, proxies
 *   packages/data/data/historical/p2/*.json               the P2 province world (structure)
 *   packages/data/data/historical/m11/territories_1900.json territory kinds
 *   packages/data/data/historical_{goods,buildings,professions,needs}.json  M11 definitions
 *   packages/data/data/technology.json, scenarios/m11_world_1900.json (age profile)
 *
 * Outputs (generated, committed):
 *   packages/data/data/historical/p2b/{provinces,pops,buildings,countries,markets,trade_routes,employment}_1900.json
 *   packages/data/data/historical/p2b/money_coefficients_1900.json
 *   packages/data/data/historical/p2b/calibration_1900.json   every derived value with its rows and formula
 *   packages/data/data/historical/p2b/build_report.json       input/output checksums and counts
 *   packages/data/data/historical_1900_{goods,buildings,professions,needs}.json  1900-world definitions
 *
 * Method (D-135; the designer's decisions A1-A8):
 *  1. RUSD per 1900 US dollar = CPI 1990 / CPI 1900 (Minneapolis Fed).
 *  2. United States GDP per head = MeasuringWorth nominal GDP / population, in RUSD.
 *     Every other territory: r = MPD 2023 GDP per head / US (direct or a recorded proxy);
 *     its price level PL (exchange-rate GDP / purchasing-power GDP) is sourced where a
 *     nominal GDP exists (United Kingdom, Australia, Japan) and otherwise PL = r^b, with b
 *     fitted through the origin on those three points (A8). GDP per head = r x US x PL (A1).
 *  3. Wages: US production workers' hourly compensation x 60 h x 52 weeks (laborers),
 *     NCES teacher salary (academics), Census salaried officials and clerks (clerks); UK
 *     laborers from Clark's average earnings; elsewhere laborers = lambda x GDP per head,
 *     lambda the mean US/UK ratio of laborer pay to GDP per head; other professions keep
 *     the US ratios to laborers (peasants provisional 0.5).
 *  4. Prices: 1900 NBER wholesale series (wheat, cattle, cotton, wool, flour, print cloth),
 *     in RUSD per sim unit; each market's opening prices = base x population-weighted PL of
 *     its territories, bounded to the validated 0.25..4 multiplier range.
 *  5. Needs (A4): subsistence and basic tiers keep their physical quantities; the comfort
 *     and luxury tiers are scaled so that a household with every tier active spends the
 *     BLS 1901 food and apparel budget per person at base prices.
 *  6. Production (A2, A3): per market, demand by good (blocks x active tiers at the initial
 *     wealth) is met by the market's P2 buildings in proportion to their P2 capacity; each
 *     building's technique makes its value added per level equal its wage bill / labour
 *     share + upkeep at the market's prices, and its level = value added needed / value
 *     added per level (1,000 jobs per level). Value added therefore matches the sourced
 *     wages; "covered GDP" is the value added of the represented sectors.
 *  7. Occupations (A7): the US home territory takes the 1900 census mix (gainful workers by
 *     group / participation), fitted to the P2 province totals by iterative proportional
 *     fitting. Other territories keep the P2 mix (reported).
 *  8. Fiscal (A5): general-government revenue share of GNP (Wallis 1902) as the income-tax
 *     rate; education = NCES school revenue share x covered GDP; administration = half the
 *     rest; treasury = 3 months of revenue; debt ceiling = Wallis 1902 debt / GDP x covered GDP.
 *
 * Usage: node scripts/p2b/build-money-calibration.mjs [--check]
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DATA = join(ROOT, "packages/data/data");
const P2 = join(DATA, "historical/p2");
const OUT = join(DATA, "historical/p2b");
const CHECK = process.argv.includes("--check");

const INPUTS = {
  sources: join(OUT, "sources_1900.json"),
  provinces: join(P2, "provinces_1900.json"),
  pops: join(P2, "pops_1900.json"),
  buildings: join(P2, "buildings_1900.json"),
  countries: join(P2, "countries_1900.json"),
  markets: join(P2, "markets_1900.json"),
  routes: join(P2, "trade_routes_1900.json"),
  territories: join(DATA, "historical/m11/territories_1900.json"),
  calibrationTargets: join(DATA, "historical/m11/calibration_targets_1900.json"),
  goods: join(DATA, "historical_goods.json"),
  buildingDefinitions: join(DATA, "historical_buildings.json"),
  professions: join(DATA, "historical_professions.json"),
  needs: join(DATA, "historical_needs.json"),
  technology: join(DATA, "technology.json"),
  scenario: join(DATA, "scenarios/m11_world_1900.json"),
};

const readText = (path) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const read = (path) => JSON.parse(readText(path));
const json = (value) => `${JSON.stringify(value, null, 1)}\n`;
const sha256 = (text) => createHash("sha256").update(text).digest("hex");
const round = (value, digits) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};
const money = (value) => round(value, 2);

/** Largest remainder: integers summing to round(total), proportional to weights; ties to lower index. */
function largestRemainder(total, weights) {
  const target = Math.round(total);
  const sum = weights.reduce((acc, w) => acc + w, 0);
  if (target === 0 || sum <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (w / sum) * target);
  const out = raw.map(Math.floor);
  let left = target - out.reduce((acc, v) => acc + v, 0);
  const order = raw.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; k < left; k += 1) out[order[k][1]] += 1;
  return out;
}

function build() {
  const src = read(INPUTS.sources);
  const rowById = new Map(src.rows.map((row) => [row.id, row]));
  const row = (id) => {
    const found = rowById.get(id);
    if (found === undefined) throw new Error(`unknown source row ${id}`);
    return found.value;
  };
  const trace = (value, rowIds, formula, extra = {}) => {
    for (const id of rowIds) if (!rowById.has(id)) throw new Error(`trace cites unknown row ${id}`);
    return { value, rowIds, formula, ...extra };
  };

  const provinces = read(INPUTS.provinces);
  const pops = read(INPUTS.pops);
  const buildings = read(INPUTS.buildings);
  const countries = read(INPUTS.countries);
  const markets = read(INPUTS.markets);
  const routes = read(INPUTS.routes);
  const territories = read(INPUTS.territories);
  const baseGoods = read(INPUTS.goods);
  const baseBuildings = read(INPUTS.buildingDefinitions);
  const baseProfessions = read(INPUTS.professions);
  const baseNeeds = read(INPUTS.needs);
  const technology = read(INPUTS.technology);
  const scenario = read(INPUTS.scenario);

  // 1. Deflator.
  const RUSD = row("cpi-1990") / row("cpi-1900");
  const rusdTrace = trace(RUSD, ["cpi-1990", "cpi-1900"], "cpi-1990 / cpi-1900");
  const KG = row("kg-per-lb");

  // 2. GDP per head and price levels.
  const usGdpPerHeadUsd = (row("us-gdp-1900") * 1e6) / row("us-pop-1900");
  const usGdpPerHead = usGdpPerHeadUsd * RUSD;
  const mpdUS = row("mpd-USA");
  const benchmarkOf = (key) => {
    const benchmark = src.territoryBenchmarks[key];
    if (benchmark === undefined) throw new Error(`territory ${key} has no MPD benchmark`);
    const values = benchmark.mpdRowIds.map(row);
    return { ...benchmark, value: values.reduce((a, b) => a + b, 0) / values.length };
  };
  const nominalUsd = {
    "gbr-home": row("uk-gdppc-1900") * row("parity-gbp"),
    "aus-home": ((row("au-gdp-1900") * 1e6) / row("au-pop-1900")) * row("parity-gbp"),
    "jpn-home": ((row("jp-gnp-1900") * 1e6) / row("jp-pop-1900")) * row("parity-jpy"),
  };
  const fitPoints = Object.entries(nominalUsd).map(([key, usd]) => {
    const r = benchmarkOf(key).value / mpdUS;
    const pl = (usd * RUSD) / (r * usGdpPerHead);
    return { key, r, pl };
  });
  const sxy = fitPoints.reduce((acc, p) => acc + Math.log(p.r) * Math.log(p.pl), 0);
  const sxx = fitPoints.reduce((acc, p) => acc + Math.log(p.r) ** 2, 0);
  const priceLevelElasticity = sxy / sxx;
  const fitRowIds = [...new Set([...Object.values(src.sourcedNominalGdpPerHead).flatMap((n) => n.rowIds), "us-gdp-1900", "us-pop-1900", "mpd-USA", "mpd-GBR", "mpd-AUS", "mpd-JPN", "cpi-1900", "cpi-1990"])];

  // 3. Wages (US reference).
  const usLaborerUsd = row("us-wage-production-hourly-1900") * row("standard-hours-per-week") * row("weeks-per-year");
  const usClerkUsd = (row("us-manuf-salaries-1900") * 1e6) / row("us-manuf-salaried-number-1900");
  const usAcademicUsd = row("us-teacher-salary-1900");
  const ukLaborerUsd = row("uk-earnings-1900") * row("parity-gbp");
  const lambdaUS = usLaborerUsd / usGdpPerHeadUsd;
  const lambdaUK = row("uk-earnings-1900") / row("uk-gdppc-1900");
  const lambda = (lambdaUS + lambdaUK) / 2;
  const professionRatio = {
    laborers: 1,
    peasants: row("peasant-to-laborer-wage"),
    clerks: usClerkUsd / usLaborerUsd,
    academics: usAcademicUsd / usLaborerUsd,
    capitalists: (usClerkUsd / usLaborerUsd) * row("capitalist-to-clerk-wage"),
  };
  const ratioRows = {
    laborers: [],
    peasants: ["peasant-to-laborer-wage"],
    clerks: ["us-manuf-salaries-1900", "us-manuf-salaried-number-1900", "us-wage-production-hourly-1900", "standard-hours-per-week", "weeks-per-year"],
    academics: ["us-teacher-salary-1900", "us-wage-production-hourly-1900", "standard-hours-per-week", "weeks-per-year"],
    capitalists: ["us-manuf-salaries-1900", "us-manuf-salaried-number-1900", "us-wage-production-hourly-1900", "standard-hours-per-week", "weeks-per-year", "capitalist-to-clerk-wage"],
  };
  const professionKeys = baseProfessions.map((p) => p.key);

  // Territory table.
  const territoryByKey = new Map(territories.map((t) => [t.key, t]));
  const provinceById = new Map(provinces.map((p) => [p.id, p]));
  const territoryPopulation = new Map();
  for (const pop of pops) {
    const key = provinceById.get(pop.provinceId).territoryKey;
    territoryPopulation.set(key, (territoryPopulation.get(key) ?? 0) + pop.population);
  }
  const territoryCalibration = {};
  for (const territory of territories) {
    const key = territory.key;
    const benchmark = benchmarkOf(key);
    const r = benchmark.value / mpdUS;
    let pl;
    let plTrace;
    let gdpPerHead;
    let gdpTrace;
    if (key === "usa-home") {
      pl = 1;
      plTrace = trace(1, [], "the United States is the price-level reference");
      gdpPerHead = usGdpPerHead;
      gdpTrace = trace(usGdpPerHead, ["us-gdp-1900", "us-pop-1900", "cpi-1990", "cpi-1900"], "us-gdp-1900 x 1e6 / us-pop-1900 x RUSD");
    } else if (nominalUsd[key] !== undefined) {
      gdpPerHead = nominalUsd[key] * RUSD;
      pl = gdpPerHead / (r * usGdpPerHead);
      const n = src.sourcedNominalGdpPerHead[key];
      gdpTrace = trace(gdpPerHead, [...n.rowIds, "cpi-1990", "cpi-1900"], `${n.formula} x RUSD`);
      plTrace = trace(pl, [...n.rowIds, ...benchmark.mpdRowIds, "mpd-USA", "us-gdp-1900", "us-pop-1900"], "sourced nominal GDP per head / (r x US GDP per head)");
    } else {
      pl = r ** priceLevelElasticity;
      plTrace = trace(pl, [...benchmark.mpdRowIds, "mpd-USA", ...fitRowIds], "r ^ b (b fitted on the United Kingdom, Australia and Japan)", { status: "derived" });
      gdpPerHead = r * usGdpPerHead * pl;
      gdpTrace = trace(gdpPerHead, [...benchmark.mpdRowIds, "mpd-USA", "us-gdp-1900", "us-pop-1900", "cpi-1990", "cpi-1900", ...fitRowIds], "r x US GDP per head x PL", { status: "derived" });
    }
    let laborer;
    let laborerTrace;
    if (key === "usa-home") {
      laborer = usLaborerUsd * RUSD;
      laborerTrace = trace(money(laborer), ["us-wage-production-hourly-1900", "standard-hours-per-week", "weeks-per-year", "cpi-1990", "cpi-1900"], "hourly x hours x weeks x RUSD");
    } else if (key === "gbr-home") {
      laborer = ukLaborerUsd * RUSD;
      laborerTrace = trace(money(laborer), ["uk-earnings-1900", "parity-gbp", "cpi-1990", "cpi-1900"], "uk-earnings-1900 x parity-gbp x RUSD");
    } else {
      laborer = lambda * gdpPerHead;
      laborerTrace = trace(money(laborer), [...gdpTrace.rowIds, "us-wage-production-hourly-1900", "standard-hours-per-week", "weeks-per-year", "uk-earnings-1900", "uk-gdppc-1900"], "lambda x GDP per head (lambda = mean of US and UK laborer pay / GDP per head)", { status: "derived" });
    }
    const wages = {};
    const wageTraces = {};
    for (const profession of professionKeys) {
      const value = money(laborer * professionRatio[profession]);
      wages[profession] = value;
      wageTraces[profession] = trace(value, [...new Set([...laborerTrace.rowIds, ...ratioRows[profession]])], profession === "laborers" ? laborerTrace.formula : `laborers x ${profession}/laborers ratio (US)`, { status: laborerTrace.status ?? (ratioRows[profession].some((id) => rowById.get(id).status !== "sourced") ? "provisional" : "sourced") });
    }
    territoryCalibration[key] = {
      key,
      polityTag: territory.polityTag,
      kind: territory.kind,
      population: territoryPopulation.get(key) ?? 0,
      mpd: { value: benchmark.value, rowIds: benchmark.mpdRowIds, method: benchmark.method, ...(benchmark.reason ? { reason: benchmark.reason } : {}) },
      relativeToUS: r,
      priceLevel: plTrace,
      gdpPerHeadRUSD: gdpTrace,
      wagesRUSDPerYear: wageTraces,
      wageTable: wages,
    };
  }

  // 4. 1900 goods and prices.
  const priceRows = {
    grain: { value: (row("price-wheat-1900") / 100 / (row("lb-per-bushel-wheat") * KG)) * RUSD, rowIds: ["price-wheat-1900", "lb-per-bushel-wheat", "kg-per-lb"], formula: "wheat cents per bushel / 100 / (60 lb x kg per lb) x RUSD" },
    livestock: { value: (row("price-cattle-1900") / (100 * KG)) * RUSD, rowIds: ["price-cattle-1900", "kg-per-lb"], formula: "cattle USD per 100 lb / (100 x kg per lb) x RUSD (live weight)" },
    cotton: { value: (row("price-cotton-1900") / 100 / KG) * RUSD, rowIds: ["price-cotton-1900", "kg-per-lb"], formula: "cotton cents per lb / 100 / kg per lb x RUSD" },
    wool: { value: (row("price-wool-1900") / 100 / KG) * RUSD, rowIds: ["price-wool-1900", "kg-per-lb"], formula: "wool cents per lb / 100 / kg per lb x RUSD" },
    "food-products": { value: (row("price-flour-1900") / (row("lb-per-barrel-flour") * KG)) * RUSD, rowIds: ["price-flour-1900", "lb-per-barrel-flour", "kg-per-lb"], formula: "flour USD per barrel / (196 lb x kg per lb) x RUSD" },
  };
  // Textiles are the textile mill's cotton-wool composite: cotton print cloth at its
  // sourced price, woollen cloth at the same markup over its fibre (provisional), weighted
  // by the mill recipe's fibre masses.
  {
    const cottonCloth = ((row("price-print-cloth-1900") * row("yards-per-lb-print-cloth")) / 100 / KG) * RUSD;
    const markup = cottonCloth / (priceRows.cotton.value * row("textile-fibre-per-cloth"));
    const woolCloth = priceRows.wool.value * row("textile-fibre-per-cloth") * markup;
    const mill = baseBuildings.find((b) => b.key === "textile-mill");
    const cottonMass = mill.inputs.find((i) => i.goodId === 3).quantityPerThroughputUnit;
    const woolMass = mill.inputs.find((i) => i.goodId === 4).quantityPerThroughputUnit;
    priceRows.textiles = {
      value: (cottonCloth * cottonMass + woolCloth * woolMass) / (cottonMass + woolMass),
      rowIds: ["price-print-cloth-1900", "yards-per-lb-print-cloth", "kg-per-lb", "price-cotton-1900", "price-wool-1900", "textile-fibre-per-cloth", "wool-cloth-markup-rule"],
      formula: "mill-recipe mass mix of cotton print cloth (sourced) and woollen cloth (wool x fibre per cloth x the cotton cloth markup over fibre)",
    };
  }
  priceRows.fish = { value: priceRows.livestock.value * row("fish-price-to-livestock"), rowIds: [...priceRows.livestock.rowIds, "fish-price-to-livestock"], formula: "livestock price x fish-price-to-livestock" };
  // Garment: the workshop recipe's cloth per garment at the textile price, times the markup.
  const workshopBase = baseBuildings.find((b) => b.key === "workshop");
  const clothPerGarment = workshopBase.inputs[0].quantityPerThroughputUnit / workshopBase.outputs[0].quantityPerThroughputUnit;
  priceRows.clothing = { value: priceRows.textiles.value * clothPerGarment * row("garment-markup-over-cloth"), rowIds: [...priceRows.textiles.rowIds, "garment-markup-over-cloth"], formula: "textiles price x cloth per garment (workshop recipe) x garment markup" };
  const goods1900 = baseGoods.map((good) => {
    const price = priceRows[good.key];
    if (price === undefined) throw new Error(`no 1900 price for ${good.key}`);
    return {
      ...good,
      basePrice1900RUSD: round(price.value, 6),
      transportCostPerUnit: round(price.value * row("freight-share-per-distance-unit"), 8),
    };
  });
  const goodByKey = new Map(goods1900.map((g) => [g.key, g]));
  const goodById = new Map(goods1900.map((g) => [g.id, g]));
  const basePrice = (goodId) => goodById.get(goodId).basePrice1900RUSD;

  // 5. 1900 professions: the US reference wages.
  const usWages = territoryCalibration["usa-home"].wageTable;
  const professions1900 = baseProfessions.map((p) => ({ ...p, baseWage1900RUSDPerYear: usWages[p.key] }));
  const professionByKey = new Map(professions1900.map((p) => [p.key, p]));
  const professionById = new Map(professions1900.map((p) => [p.id, p]));

  // 6. 1900 building definitions: 1,000 jobs per level, mass-balanced recipes.
  const jobsPerLevel = row("jobs-per-level");
  const fibrePerCloth = row("textile-fibre-per-cloth");
  const wheatPerFlour = row("flour-wheat-per-flour");
  const scaleQuantities = (list, s) => list.map((item) => ({ ...item, quantityPerThroughputUnit: item.quantityPerThroughputUnit * s }));
  const buildings1900 = baseBuildings.map((def) => {
    const jobs = def.jobs.reduce((acc, j) => acc + j.workersPerThroughputUnit, 0);
    const s = jobs > 0 ? jobsPerLevel / jobs : 1;
    let inputs = scaleQuantities(def.inputs, s);
    let outputs = scaleQuantities(def.outputs, s);
    if (def.key === "food-processing") {
      inputs = inputs.map((i) => ({ ...i, quantityPerThroughputUnit: outputs[0].quantityPerThroughputUnit * wheatPerFlour }));
    }
    if (def.key === "textile-mill" || def.key === "power-loom-mill") {
      const fibre = inputs.reduce((acc, i) => acc + i.quantityPerThroughputUnit, 0);
      outputs = outputs.map((o) => ({ ...o, quantityPerThroughputUnit: fibre / fibrePerCloth }));
    }
    const jobs1900 = def.jobs.map((j) => ({ ...j, workersPerThroughputUnit: j.workersPerThroughputUnit * s }));
    const storage = def.storageCapacityByGood.map((entry) => ({ ...entry, quantity: row("warehouse-capacity-per-level") }));
    const wageBillYear = jobs1900.reduce((acc, j) => acc + j.workersPerThroughputUnit * def.referenceThroughputPerDayAtLevelOne * professionById.get(j.professionId).baseWage1900RUSDPerYear, 0);
    return {
      ...def,
      inputs: inputs.map((i) => ({ ...i, quantityPerThroughputUnit: round(i.quantityPerThroughputUnit, 6) })),
      outputs: outputs.map((o) => ({ ...o, quantityPerThroughputUnit: round(o.quantityPerThroughputUnit, 6) })),
      jobs: jobs1900.map((j) => ({ ...j, workersPerThroughputUnit: round(j.workersPerThroughputUnit, 6) })),
      storageCapacityByGood: storage,
      constructionWorkers: Math.max(1, Math.round(def.constructionWorkers * s)),
      constructionMaterials: def.constructionMaterials.map((m) => ({ ...m, quantity: round(m.quantity * s, 6) })),
      _wageBillYear: wageBillYear,
    };
  });
  const foodProcessingDef = buildings1900.find((d) => d.key === "food-processing");
  for (const def of buildings1900) {
    const reference = def.jobs.length > 0 ? def._wageBillYear : foodProcessingDef._wageBillYear;
    def.constructionCostRUSD = money(reference * row("capital-per-job-years"));
    def.dailyUpkeepRUSDAtLevelOne = money((def.constructionCostRUSD * row("depreciation-rate")) / 365);
  }
  const definitionTraces = Object.fromEntries(buildings1900.map((def) => [def.key, {
    constructionCostRUSD: trace(def.constructionCostRUSD, ["capital-per-job-years", "jobs-per-level", ...ratioRows.clerks, "us-teacher-salary-1900", "peasant-to-laborer-wage"], def.jobs.length > 0 ? "jobs per level x US reference wages x capital-per-job-years" : "one food-processing level (warehouse has no jobs)", { status: "provisional" }),
    dailyUpkeepRUSDAtLevelOne: trace(def.dailyUpkeepRUSDAtLevelOne, ["depreciation-rate", "capital-per-job-years"], "construction cost x depreciation-rate / 365", { status: "provisional" }),
  }]));
  const defByKey = new Map(buildings1900.map((d) => [d.key, d]));
  const cleanDefinitions = buildings1900.map(({ _wageBillYear, ...def }) => def);

  // 7. Needs: comfort and luxury tiers scaled to the BLS 1901 budget at base prices.
  const perPersonFood = (row("bls-1901-food") / row("bls-1901-family-size")) * RUSD;
  const perPersonApparel = (row("bls-1901-apparel") / row("bls-1901-family-size")) * RUSD;
  const priceOfKey = (key) => goodByKey.get(key).basePrice1900RUSD;
  const subsistence = baseNeeds.find((n) => n.tier === "subsistence");
  const basic = baseNeeds.find((n) => n.tier === "basic");
  const subsistenceFoodYear = 365 * subsistence.items.reduce((acc, i) => acc + i.quantityPerCapitaPerDay * priceOfKey(i.goodKey), 0);
  const basicApparelYear = 365 * basic.items.reduce((acc, i) => acc + i.quantityPerCapitaPerDay * priceOfKey(i.goodKey), 0);
  const extraFood = perPersonFood - subsistenceFoodYear;
  const extraApparel = perPersonApparel - basicApparelYear;
  if (!(extraFood > 0 && extraApparel > 0)) throw new Error("BLS budget below the subsistence and basic tiers");
  const comfortShare = row("comfort-share-of-extra");
  const quantity = (spendYear, key) => round(spendYear / (365 * priceOfKey(key)), 6);
  const mix = (prefix) => src.rows.filter((r) => r.id.startsWith(prefix)).map((r) => [r.id.slice(prefix.length), r.value]);
  const tierItems = (foodSpend, foodPrefix, apparelSpend, apparelPrefix) => {
    const items = new Map();
    for (const [key, share] of [...mix(foodPrefix).map(([k, v]) => [k, v * foodSpend]), ...mix(apparelPrefix).map(([k, v]) => [k, v * apparelSpend])]) {
      items.set(key, (items.get(key) ?? 0) + quantity(share, key));
    }
    return [...items.entries()].map(([goodKey, q]) => ({ goodKey, quantityPerCapitaPerDay: round(q, 6) }));
  };
  const needs1900 = baseNeeds.map((tier) => {
    if (tier.tier === "comfort") return { ...tier, items: tierItems(extraFood * comfortShare, "comfort-food-mix-", extraApparel * comfortShare, "comfort-apparel-mix-") };
    if (tier.tier === "luxury") return { ...tier, items: tierItems(extraFood * (1 - comfortShare), "luxury-food-mix-", extraApparel * (1 - comfortShare), "luxury-apparel-mix-") };
    return tier;
  });
  const needsTrace = trace({ perPersonFoodRUSD: perPersonFood, perPersonApparelRUSD: perPersonApparel }, ["bls-1901-food", "bls-1901-apparel", "bls-1901-family-size", "comfort-share-of-extra", "cpi-1990", "cpi-1900", ...src.rows.filter((r) => r.id.includes("-mix-")).map((r) => r.id)], "comfort and luxury quantities = budget above subsistence/basic x tier share x good share / (365 x base price)");

  // 8. Occupations for the US home territory (A7) by iterative proportional fitting.
  const age = scenario.meta.ageStructures["world-1900-provisional"];
  const ageTotal = [...age.maleCounts, ...age.femaleCounts].reduce((a, b) => a + b, 0);
  let working = 0;
  for (let band = 3; band <= 12; band += 1) working += age.maleCounts[band] + age.femaleCounts[band];
  const workingAgeShare = working / ageTotal;
  const popRows = pops.map((p) => ({ ...p }));
  const usRows = popRows.filter((p) => provinceById.get(p.provinceId).territoryKey === "usa-home");
  const usTotal = usRows.reduce((acc, p) => acc + p.population, 0);
  const census = {
    peasants: row("us-occ-agriculture-1900"),
    laborers: row("us-occ-manufacturing-1900") + row("us-occ-domestic-1900"),
    clerks: row("us-occ-trade-1900"),
    academics: row("us-occ-professional-1900"),
  };
  const capitalistTarget = usTotal * row("capitalist-population-share");
  const dependentsWeight = Object.fromEntries(Object.entries(census).map(([k, workers]) => [k, workers / professionByKey.get(k).participationRate]));
  const weightSum = Object.values(dependentsWeight).reduce((a, b) => a + b, 0);
  const usTargets = { capitalists: capitalistTarget };
  for (const [k, w] of Object.entries(dependentsWeight)) usTargets[k] = ((usTotal - capitalistTarget) * w) / weightSum;
  {
    const byProvince = new Map();
    for (const p of usRows) {
      if (!byProvince.has(p.provinceId)) byProvince.set(p.provinceId, []);
      byProvince.get(p.provinceId).push(p);
    }
    const rowTotals = new Map([...byProvince].map(([id, list]) => [id, list.reduce((acc, p) => acc + p.population, 0)]));
    const cell = new Map(usRows.map((p) => [`${p.provinceId}:${p.professionKey}`, p.population]));
    for (let iteration = 0; iteration < 200; iteration += 1) {
      const colSum = {};
      for (const p of usRows) colSum[p.professionKey] = (colSum[p.professionKey] ?? 0) + cell.get(`${p.provinceId}:${p.professionKey}`);
      for (const p of usRows) {
        const k = `${p.provinceId}:${p.professionKey}`;
        if (colSum[p.professionKey] > 0) cell.set(k, (cell.get(k) * usTargets[p.professionKey]) / colSum[p.professionKey]);
      }
      for (const [id, list] of byProvince) {
        const sum = list.reduce((acc, p) => acc + cell.get(`${id}:${p.professionKey}`), 0);
        for (const p of list) {
          const k = `${id}:${p.professionKey}`;
          cell.set(k, sum > 0 ? (cell.get(k) * rowTotals.get(id)) / sum : 0);
        }
      }
    }
    for (const [id, list] of byProvince) {
      const ints = largestRemainder(rowTotals.get(id), list.map((p) => cell.get(`${id}:${p.professionKey}`)));
      list.forEach((p, i) => {
        p.population = ints[i];
        p.calibrationStatus = "source-backed";
      });
    }
  }
  const usMix = {};
  for (const p of usRows) usMix[p.professionKey] = (usMix[p.professionKey] ?? 0) + p.population;

  // 9. Markets: price levels and multipliers.
  const marketOfProvince = new Map();
  for (const market of markets) for (const id of market.provinceIds) marketOfProvince.set(id, market.key);
  const marketCalibration = {};
  for (const market of markets) {
    let weight = 0;
    let sum = 0;
    const members = new Set();
    for (const id of market.provinceIds) members.add(provinceById.get(id).territoryKey);
    for (const p of popRows) {
      if (marketOfProvince.get(p.provinceId) !== market.key) continue;
      const t = territoryCalibration[provinceById.get(p.provinceId).territoryKey];
      weight += p.population;
      sum += p.population * t.priceLevel.value;
    }
    const pl = weight > 0 ? sum / weight : 1;
    const multiplier = round(Math.min(4, Math.max(0.25, pl)), 6);
    marketCalibration[market.key] = {
      key: market.key,
      territories: [...members].sort(),
      populationWeightedPriceLevel: pl,
      initialPriceMultiplier: trace(multiplier, [...new Set([...members].flatMap((k) => territoryCalibration[k].priceLevel.rowIds))], "clamp(population-weighted PL of member territories, 0.25, 4)", { status: "derived", clamped: multiplier !== round(pl, 6) }),
    };
  }
  const priceIn = (marketKey, goodId) => basePrice(goodId) * marketCalibration[marketKey].initialPriceMultiplier.value;

  // 10. Initial wealth, savings and demand by market.
  const subsistenceCostDay = (marketKey) => subsistence.items.reduce((acc, i) => acc + i.quantityPerCapitaPerDay * priceIn(marketKey, goodByKey.get(i.goodKey).id), 0);
  const wageOf = (provinceId, professionKey) => territoryCalibration[provinceById.get(provinceId).territoryKey].wageTable[professionKey];
  // Demand is kept by (market, territory, good): each territory's producers first meet
  // their own territory's demand (6); only demand without a local producer is pooled.
  const demandByMarket = new Map(markets.map((m) => [m.key, new Map()]));
  const demandIn = (marketKey, territoryKey) => {
    const byTerritory = demandByMarket.get(marketKey);
    if (!byTerritory.has(territoryKey)) byTerritory.set(territoryKey, new Map());
    return byTerritory.get(territoryKey);
  };
  for (const p of popRows) {
    const marketKey = marketOfProvince.get(p.provinceId);
    const profession = professionByKey.get(p.professionKey);
    const incomePerCapita = wageOf(p.provinceId, p.professionKey) * profession.participationRate * workingAgeShare;
    const subsistenceYear = subsistenceCostDay(marketKey) * 365;
    p.wealthLevel = round(Math.min(99, Math.max(0, 10 + 20 * Math.log(Math.max(incomePerCapita / subsistenceYear, 1e-9)))), 2);
    p.savingsPerCapitaRUSD = money((incomePerCapita * row("household-cash-months")) / 12);
    const demand = demandIn(marketKey, provinceById.get(p.provinceId).territoryKey);
    for (const tier of needs1900) {
      if (p.wealthLevel < tier.activationWealthMin) continue;
      for (const item of tier.items) {
        const id = goodByKey.get(item.goodKey).id;
        demand.set(id, (demand.get(id) ?? 0) + item.quantityPerCapitaPerDay * p.population);
      }
    }
  }

  // 10b. Missing producers (provisional): a market whose households demand a good that
  // no building in the market makes gets one building of a basic type for it, in the
  // province with the largest population of the type's owner profession (else any owner
  // household) inside the market's territory with the largest demand. The M11 tables
  // gave many smaller countries farms only; under P2 they lived on authored opening
  // stock at the price floor. The solver then sizes the new building like the others.
  const basicProducer = { livestock: "ranch", fish: "fishery", "food-products": "food-processing", clothing: "workshop-peasant", textiles: "textile-mill", grain: "subsistence-farm" };
  const ownerOf = { ranch: "peasants", fishery: "peasants", "food-processing": "clerks", "workshop-peasant": "peasants", "textile-mill": "capitalists", "subsistence-farm": "peasants" };
  const addedBuildings = [];
  for (const market of markets) {
    const inMarket = buildings.filter((b) => marketOfProvince.get(b.provinceId) === market.key);
    for (const [goodKey, definitionKey] of Object.entries(basicProducer)) {
      const goodId = goodByKey.get(goodKey).id;
      if (inMarket.some((b) => defByKey.get(b.definitionKey).outputs[0]?.goodId === goodId)) continue;
      const byTerritory = demandByMarket.get(market.key);
      const ranked = [...byTerritory].map(([key, goodsDemand]) => [key, goodsDemand.get(goodId) ?? 0]).filter(([, q]) => q > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
      // Intermediate goods (textiles) are demanded by producers, not households.
      if (ranked.length === 0 && goodKey !== "textiles") continue;
      if (goodKey === "textiles" && !inMarket.concat(addedBuildings.filter((b) => marketOfProvince.get(b.provinceId) === market.key)).some((b) => defByKey.get(b.definitionKey).inputs.some((i) => i.goodId === goodId))) continue;
      const territoryKey = ranked[0]?.[0] ?? provinceById.get(market.provinceIds[0]).territoryKey;
      const candidates = popRows.filter((p) => provinceById.get(p.provinceId).territoryKey === territoryKey && marketOfProvince.get(p.provinceId) === market.key);
      const preferred = candidates.filter((p) => p.professionKey === ownerOf[definitionKey]);
      const pick = (preferred.length > 0 ? preferred : candidates).sort((a, b) => b.population - a.population || a.provinceId - b.provinceId)[0];
      if (pick === undefined) continue;
      const province = provinceById.get(pick.provinceId);
      const added = { key: `${province.key}-${definitionKey}-p2b`, provinceId: province.id, definitionKey, level: 1, ownerProfessionKey: pick.professionKey, operatingCashRUSD: 1, status: "provisional" };
      addedBuildings.push(added);
      buildings.push(added);
    }
  }

  // 11. Production solve per market.
  const territoryOfProvince = (id) => provinceById.get(id).territoryKey;
  const countryOfProvince = new Map();
  for (const country of countries) for (const id of country.provinceIds) countryOfProvince.set(id, country);
  const techKeyToDef = new Map(technology.technologies.map((t) => [t.key, t]));
  const techFactor = (country, sector) => {
    let bonus = 0;
    for (const key of country.technology?.researchedTechnologyKeys ?? []) {
      for (const effect of techKeyToDef.get(key)?.effects ?? []) if (effect.kind === "sector-productivity" && effect.sector === sector) bonus += effect.bonus;
    }
    return 1 + Math.min(Math.max(bonus, 0), 2);
  };
  const laborShare = (def) => (def.sector === "agriculture" ? row("labour-share-agriculture") : row("labour-share-manufacturing"));
  const outputGoods = (def) => def.outputs.map((o) => o.goodId);
  const chain = ["clothing", "textiles", "food-products", "grain", "livestock", "fish"];
  const solvedBuildings = [];
  const marketBalance = {};
  for (const market of markets) {
    const instances = buildings.filter((b) => marketOfProvince.get(b.provinceId) === market.key).map((b) => ({ ...b, def: defByKey.get(b.definitionKey), tu: 0 }));
    const demandByTerritory = new Map([...demandByMarket.get(market.key)].map(([k, m]) => [k, new Map(m)]));
    const territoryDemand = (key) => {
      if (!demandByTerritory.has(key)) demandByTerritory.set(key, new Map());
      return demandByTerritory.get(key);
    };
    const demand = new Map();
    const supply = new Map();
    const unmet = {};
    const baseDef = (i) => baseBuildings.find((d) => d.key === i.definitionKey);
    for (const goodKey of chain) {
      const goodId = goodByKey.get(goodKey).id;
      const producers = instances.filter((i) => i.def.jobs.length > 0 && outputGoods(i.def)[0] === goodId);
      const weightOf = (i) => i.level * baseDef(i).outputs.find((o) => o.goodId === goodId).quantityPerThroughputUnit;
      const assign = (list, quantity) => {
        const weights = list.map(weightOf);
        const total = weights.reduce((a, b) => a + b, 0);
        list.forEach((i, index) => {
          const tf = techFactor(countryOfProvince.get(i.provinceId), i.def.sector);
          const out = i.def.outputs.find((o) => o.goodId === goodId).quantityPerThroughputUnit * tf;
          const added = ((quantity * weights[index]) / total) / out;
          i.tu += added;
          i.techFactor = tf;
          // Intermediate demand belongs to the producer's territory.
          const local = territoryDemand(territoryOfProvince(i.provinceId));
          for (const input of i.def.inputs) local.set(input.goodId, (local.get(input.goodId) ?? 0) + added * input.quantityPerThroughputUnit);
        });
      };
      let pooled = 0;
      let needed = 0;
      for (const [territoryKey, goodsDemand] of [...demandByTerritory].sort((a, b) => a[0].localeCompare(b[0]))) {
        const quantity = goodsDemand.get(goodId) ?? 0;
        if (!(quantity > 0)) continue;
        needed += quantity;
        const local = producers.filter((i) => territoryOfProvince(i.provinceId) === territoryKey);
        if (local.length > 0) assign(local, quantity);
        else pooled += quantity;
      }
      demand.set(goodId, needed);
      if (pooled > 0) {
        if (producers.length === 0) unmet[goodKey] = pooled;
        else assign(producers, pooled);
      }
    }
    // Intermediate goods without a chain step (cotton, wool) are demanded, not produced.
    for (const goodsDemand of demandByTerritory.values()) {
      for (const good of goods1900) {
        if (chain.includes(good.key)) continue;
        demand.set(good.id, (demand.get(good.id) ?? 0) + (goodsDemand.get(good.id) ?? 0));
      }
    }
    // Joint products (cotton, wool) and fibre inputs.
    for (const i of instances) {
      for (const o of i.def.outputs) supply.set(o.goodId, (supply.get(o.goodId) ?? 0) + i.tu * o.quantityPerThroughputUnit * (i.techFactor ?? 1));
    }
    const balance = {};
    for (const good of goods1900) {
      const d = demand.get(good.id) ?? 0;
      const s = supply.get(good.id) ?? 0;
      if (d > 0 || s > 0) balance[good.key] = { demandPerDay: d, supplyPerDay: s };
    }
    marketBalance[market.key] = { balance, unmetWithoutLocalProducer: unmet };
    for (const i of instances) {
      if (i.def.jobs.length === 0) {
        solvedBuildings.push({ ...i, levelOut: i.level, technique: 1, vaPerYear: 0, wageBillDay: 0, inputCostDay: 0 });
        continue;
      }
      if (!(i.tu > 0)) continue;
      const tk = territoryOfProvince(i.provinceId);
      const wageBillLevelDay = i.def.jobs.reduce((acc, j) => acc + j.workersPerThroughputUnit * i.def.referenceThroughputPerDayAtLevelOne * territoryCalibration[tk].wageTable[professionById.get(j.professionId).key], 0) / 365;
      const jobsTotal = i.def.jobs.reduce((acc, j) => acc + j.workersPerThroughputUnit, 0);
      const prodMod = i.def.jobs.reduce((acc, j) => acc + j.workersPerThroughputUnit * professionById.get(j.professionId).laborProductivityModifier, 0) / jobsTotal;
      const tf = i.techFactor ?? techFactor(countryOfProvince.get(i.provinceId), i.def.sector);
      const vaPerTU = i.def.outputs.reduce((acc, o) => acc + o.quantityPerThroughputUnit * tf * priceIn(market.key, o.goodId), 0) - i.def.inputs.reduce((acc, input) => acc + input.quantityPerThroughputUnit * priceIn(market.key, input.goodId), 0);
      if (!(vaPerTU > 0)) throw new Error(`${i.key}: non-positive value added per throughput unit at 1900 prices`);
      const targetLevelDay = wageBillLevelDay / laborShare(i.def) + i.def.dailyUpkeepRUSDAtLevelOne;
      const technique = targetLevelDay / (i.def.referenceThroughputPerDayAtLevelOne * prodMod * vaPerTU);
      // At least one level wherever there is demand to meet, so microstates (Andorra)
      // keep their own production and a fiscal base.
      const level = Math.max(1, Math.round((i.tu * vaPerTU) / targetLevelDay));
      const tuDay = level * i.def.referenceThroughputPerDayAtLevelOne * prodMod * technique;
      const inputCostDay = i.def.inputs.reduce((acc, input) => acc + tuDay * input.quantityPerThroughputUnit * priceIn(market.key, input.goodId), 0);
      solvedBuildings.push({ ...i, levelOut: level, technique: round(technique, 6), tuDay, vaPerYear: tuDay * vaPerTU * 365, wageBillDay: wageBillLevelDay * level, inputCostDay, prodMod, techFactor: tf });
    }
  }

  // 11b. Workforce cap: where the solved jobs of a profession exceed the share
  // max-initial-employment-share of its territory workforce, the territory's
  // buildings employing it get a proportionally higher technique and lower level, so
  // the 1900 start is staffable. The same value added is produced by fewer workers,
  // and the owners' profit absorbs the difference (reported per territory).
  const workforceOf = new Map();
  for (const p of popRows) {
    const key = `${territoryOfProvince(p.provinceId)}:${p.professionKey}`;
    workforceOf.set(key, (workforceOf.get(key) ?? 0) + Math.floor(p.population * workingAgeShare * professionByKey.get(p.professionKey).participationRate));
  }
  const jobsOf = new Map();
  for (const b of solvedBuildings) {
    if (b.def.jobs.length === 0) continue;
    for (const j of b.def.jobs) {
      const key = `${territoryOfProvince(b.provinceId)}:${professionById.get(j.professionId).key}`;
      jobsOf.set(key, (jobsOf.get(key) ?? 0) + j.workersPerThroughputUnit * b.def.referenceThroughputPerDayAtLevelOne * b.levelOut);
    }
  }
  const capShare = row("max-initial-employment-share");
  const capFactor = new Map();
  for (const [key, jobs] of jobsOf) {
    const allowed = capShare * (workforceOf.get(key) ?? 0);
    if (jobs > allowed) capFactor.set(key, allowed > 0 ? jobs / allowed : Number.POSITIVE_INFINITY);
  }
  const capped = {};
  for (const b of solvedBuildings) {
    if (b.def.jobs.length === 0) continue;
    const tk = territoryOfProvince(b.provinceId);
    const factor = Math.max(1, ...b.def.jobs.map((j) => capFactor.get(`${tk}:${professionById.get(j.professionId).key}`) ?? 1));
    if (factor === 1) continue;
    // A territory with no workforce of a job's profession staffs it from elsewhere in
    // the country (D-133 pairing), so it is left uncapped and reported.
    if (!Number.isFinite(factor)) continue;
    const level = Math.max(1, Math.round(b.levelOut / factor));
    const technique = (b.technique * b.levelOut) / level;
    b.technique = round(technique, 6);
    b.levelOut = level;
    // Wage bill and upkeep follow the new level; value added and inputs stay with the output.
    const perLevelWage = b.def.jobs.reduce((acc, j) => acc + j.workersPerThroughputUnit * b.def.referenceThroughputPerDayAtLevelOne * territoryCalibration[tk].wageTable[professionById.get(j.professionId).key], 0) / 365;
    b.wageBillDay = perLevelWage * level;
    capped[tk] = Math.max(capped[tk] ?? 1, factor);
  }
  for (const [tk, factor] of Object.entries(capped)) territoryCalibration[tk].workforceCapFactor = factor;

  // 11c. Warehouses: each market's storage holds storage-headroom-days of its largest
  // good's daily output (stock above capacity is lost as overflow, M3c), split over the
  // market's P2 warehouses in proportion to their P2 levels.
  const warehouseCapacity = row("warehouse-capacity-per-level");
  const warehouseLevels = {};
  for (const market of markets) {
    const stockByGood = new Map();
    for (const b of solvedBuildings) {
      if (marketOfProvince.get(b.provinceId) !== market.key || b.def.jobs.length === 0) continue;
      for (const o of b.def.outputs) {
        stockByGood.set(o.goodId, (stockByGood.get(o.goodId) ?? 0) + b.tuDay * o.quantityPerThroughputUnit * b.techFactor);
      }
    }
    const largest = Math.max(0, ...stockByGood.values());
    const needed = Math.max(1, Math.ceil((largest * row("storage-headroom-days")) / warehouseCapacity));
    const warehouses = solvedBuildings.filter((b) => marketOfProvince.get(b.provinceId) === market.key && b.def.jobs.length === 0);
    if (warehouses.length === 0) throw new Error(`market ${market.key} has no warehouse`);
    const split = largestRemainder(needed, warehouses.map((w) => w.level));
    warehouses.forEach((w, i) => {
      w.levelOut = split[i];
    });
    warehouseLevels[market.key] = needed;
  }
  for (let index = solvedBuildings.length - 1; index >= 0; index -= 1) {
    if (!(solvedBuildings[index].levelOut >= 1)) solvedBuildings.splice(index, 1);
  }

  // 12. Building rows, opening stock and markets.
  const buildingRows = solvedBuildings
    .map((b) => {
      const upkeepDay = b.def.dailyUpkeepRUSDAtLevelOne * b.levelOut;
      const cash = Math.round(row("working-capital-days") * (b.wageBillDay + b.inputCostDay + upkeepDay));
      return {
        key: b.key,
        provinceId: b.provinceId,
        definitionKey: b.definitionKey,
        level: b.levelOut,
        ownerProfessionKey: b.ownerProfessionKey,
        operatingCashRUSD: Math.max(cash, b.def.jobs.length === 0 ? Math.round(row("working-capital-days") * upkeepDay) : 1),
        technique: b.technique,
        status: "provisional",
      };
    })
    .sort((x, y) => x.provinceId - y.provinceId || x.definitionKey.localeCompare(y.definitionKey));
  const keptKeys = new Set(buildingRows.map((b) => b.key));
  // Opening stock (D-136): producers buy inputs only from the opening stock while
  // households can buy the day's output, so each market opens with opening-stock-days of
  // its producers' input demand, held by the producers of each input in proportion to
  // their output.
  const marketRows = markets.map((market) => {
    const lots = [];
    const inMarket = solvedBuildings.filter((b) => marketOfProvince.get(b.provinceId) === market.key && b.def.jobs.length > 0 && keptKeys.has(b.key));
    const inputDemand = new Map();
    const outputTotal = new Map();
    for (const b of inMarket) {
      for (const input of b.def.inputs) inputDemand.set(input.goodId, (inputDemand.get(input.goodId) ?? 0) + b.tuDay * input.quantityPerThroughputUnit);
      for (const o of b.def.outputs) outputTotal.set(o.goodId, (outputTotal.get(o.goodId) ?? 0) + b.tuDay * o.quantityPerThroughputUnit * b.techFactor);
    }
    for (const b of inMarket) {
      for (const o of b.def.outputs) {
        const output = b.tuDay * o.quantityPerThroughputUnit * b.techFactor;
        const total = outputTotal.get(o.goodId) ?? 0;
        const quantity = total > 0 ? round((row("opening-stock-days") * (inputDemand.get(o.goodId) ?? 0) * output) / total, 3) : 0;
        if (quantity > 0) lots.push({ goodKey: goodById.get(o.goodId).key, ownerBuildingKey: b.key, quantity });
      }
    }
    lots.sort((x, y) => x.ownerBuildingKey.localeCompare(y.ownerBuildingKey) || x.goodKey.localeCompare(y.goodKey));
    return {
      ...market,
      initialPriceMultiplier: marketCalibration[market.key].initialPriceMultiplier.value,
      stockLots: lots,
      status: "calibrated",
      sourceIds: [...new Set([...market.sourceIds, "p2b-money-calibration"])],
    };
  });

  // 13. Covered GDP by territory, market and country.
  const coveredByTerritory = new Map();
  const coveredByMarket = new Map();
  const coveredByCountry = new Map();
  for (const b of solvedBuildings) {
    if (!keptKeys.has(b.key)) continue;
    const tk = territoryOfProvince(b.provinceId);
    coveredByTerritory.set(tk, (coveredByTerritory.get(tk) ?? 0) + b.vaPerYear);
    const mk = marketOfProvince.get(b.provinceId);
    coveredByMarket.set(mk, (coveredByMarket.get(mk) ?? 0) + b.vaPerYear);
    const country = countryOfProvince.get(b.provinceId);
    coveredByCountry.set(country.tag, (coveredByCountry.get(country.tag) ?? 0) + b.vaPerYear);
  }
  const employment = new Map();
  for (const b of solvedBuildings) {
    if (!keptKeys.has(b.key)) continue;
    const tk = territoryOfProvince(b.provinceId);
    for (const j of b.def.jobs) {
      const key = `${tk}:${professionById.get(j.professionId).key}`;
      employment.set(key, (employment.get(key) ?? 0) + j.workersPerThroughputUnit * b.def.referenceThroughputPerDayAtLevelOne * b.levelOut);
    }
  }
  for (const [key, t] of Object.entries(territoryCalibration)) {
    const workforce = {};
    const jobs = {};
    for (const p of popRows) {
      if (territoryOfProvince(p.provinceId) !== key) continue;
      workforce[p.professionKey] = (workforce[p.professionKey] ?? 0) + Math.floor(p.population * workingAgeShare * professionByKey.get(p.professionKey).participationRate);
    }
    for (const profession of professionKeys) jobs[profession] = employment.get(`${key}:${profession}`) ?? 0;
    const covered = coveredByTerritory.get(key) ?? 0;
    t.coveredValueAddedRUSDPerYear = covered;
    t.coveredGdpPerHeadRUSD = t.population > 0 ? covered / t.population : 0;
    t.coveredShareOfGdp = t.population > 0 ? covered / (t.population * t.gdpPerHeadRUSD.value) : 0;
    t.workforceByProfession = workforce;
    t.jobsByProfession = jobs;
  }

  // 14. Countries: fiscal stocks and flows (A5).
  const revenueShare = row("us-gov-revenue-share-1902");
  const educationShare = row("us-school-revenue-1900") / row("us-gdp-1900");
  const adminShare = (revenueShare - educationShare) * row("administration-share-of-noneducation-revenue");
  const debtRatio = row("us-gov-debt-1902") / row("us-gdp-1902");
  const countryCalibration = {};
  const countryRows = countries.map((country) => {
    const covered = coveredByCountry.get(country.tag) ?? 0;
    const revenue = revenueShare * covered;
    const values = {
      incomeTaxRate: trace(revenueShare, ["us-gov-revenue-share-1902"], "general-government revenue share of GNP (US 1902) applied as the income-tax rate on covered income", { status: country.tag === "USA" ? "sourced" : "provisional" }),
      educationFundingRUSDPerYear: trace(money(educationShare * covered), ["us-school-revenue-1900", "us-gdp-1900"], "school revenue / GDP (US 1899-1900) x covered value added", { status: "derived" }),
      institutionFundingRUSDPerYear: trace(money(adminShare * covered), ["us-gov-revenue-share-1902", "us-school-revenue-1900", "us-gdp-1900", "administration-share-of-noneducation-revenue"], "(revenue share - education share) x administration share x covered value added", { status: "provisional" }),
      initialTreasuryCashRUSD: trace(money((revenue * row("treasury-cash-months")) / 12), ["us-gov-revenue-share-1902", "treasury-cash-months"], "revenue share x covered value added x 3 / 12", { status: "provisional" }),
      maxOutstandingPrincipalRUSD: trace(money(debtRatio * covered), ["us-gov-debt-1902", "us-gdp-1902"], "government debt / GDP (US 1902) x covered value added", { status: "derived" }),
      welfareBudgetRUSDPerYear: trace(0, [], "no 1900 national welfare transfers are modelled", { status: "provisional" }),
    };
    countryCalibration[country.tag] = { coveredValueAddedRUSDPerYear: covered, ...values };
    return {
      ...country,
      fiscal: { ...country.fiscal, incomeTaxRate: values.incomeTaxRate.value, welfareBudgetRUSDPerYear: 0 },
      initialTreasuryCashRUSD: values.initialTreasuryCashRUSD.value,
      debt: { ...country.debt, maxOutstandingPrincipalRUSD: Math.max(1, values.maxOutstandingPrincipalRUSD.value) },
      politics: { ...country.politics, institutionFundingRUSDPerYear: values.institutionFundingRUSDPerYear.value },
      technology: { ...country.technology, educationFundingRUSDPerYear: values.educationFundingRUSDPerYear.value },
      sourceIds: [...new Set([...country.sourceIds, "p2b-money-calibration"])],
    };
  });

  // 15. Routes.
  const routeRows = routes.map((route) => {
    const smaller = Math.min(coveredByMarket.get(route.marketAKey) ?? 0, coveredByMarket.get(route.marketBKey) ?? 0);
    return { ...route, baseCapacityRUSDPerDay: money(Math.max(1, (smaller / 365) * row("route-capacity-share"))), sourceIds: [...new Set([...route.sourceIds, "p2b-money-calibration"])] };
  });

  // 16. Provinces with wage tables; population rows.
  const provinceRows = provinces.map((province) => ({
    ...province,
    wageRUSDPerYearByProfession: { ...territoryCalibration[province.territoryKey].wageTable },
    sourceIds: [...new Set([...province.sourceIds, "p2b-money-calibration"])],
  }));
  const popOut = popRows.map((p) => ({ ...p, sourceIds: [...new Set([...p.sourceIds, "p2b-money-calibration"])] }));

  // 17. Money coefficients.
  const usLaborerDay = usWages.laborers / 365;
  const subsistenceUsDay = subsistence.items.reduce((acc, i) => acc + i.quantityPerCapitaPerDay * priceOfKey(i.goodKey), 0);
  const usCovered = coveredByTerritory.get("usa-home") ?? 0;
  const usPopulation = territoryCalibration["usa-home"].population;
  const equipmentPrice = 50 * (usWages.laborers / 12) * row("military-equipment-months");
  const moneyCoefficients = {
    soldierDailyPayRUSD: trace(money(usLaborerDay), ["us-wage-production-hourly-1900", "standard-hours-per-week", "weeks-per-year", "cpi-1990", "cpi-1900"], "US laborer wage / 365 (a soldier is paid as an unskilled worker)", { status: "provisional" }),
    recruitmentCostPerSoldierRUSD: trace(money(usLaborerDay * row("military-recruitment-days")), ["us-wage-production-hourly-1900", "military-recruitment-days"], "30 days of soldier pay", { status: "provisional" }),
    equipmentPriceRUSD: trace(money(equipmentPrice), ["us-wage-production-hourly-1900", "military-equipment-months"], "50 soldiers x one month of a US laborer's wage", { status: "provisional" }),
    equipmentDailyUpkeepRUSD: trace(money((equipmentPrice * row("military-equipment-depreciation")) / 365), ["military-equipment-depreciation", "military-equipment-months", "us-wage-production-hourly-1900"], "equipment price x 10% / 365", { status: "provisional" }),
    garrisonCostPerSoldierPerDayRUSD: trace(money(subsistenceUsDay), ["price-wheat-1900", "price-cattle-1900", "price-flour-1900", "fish-price-to-livestock"], "subsistence basket per person per day at base prices", { status: "derived" }),
    adminFundingPerCapitaPerYearRUSD: trace(money((adminShare * usCovered) / usPopulation), ["us-gov-revenue-share-1902", "us-school-revenue-1900", "us-gdp-1900", "administration-share-of-noneducation-revenue"], "US administration budget per inhabitant (adequacy 1 at the start)", { status: "derived" }),
    educationFundingPerStaffPerYearRUSD: trace(money(usAcademicUsd * RUSD), ["us-teacher-salary-1900", "cpi-1990", "cpi-1900"], "NCES 1899-1900 teacher salary x RUSD", { status: "sourced" }),
    trainingInstructorCostPerYearRUSD: trace(money(usAcademicUsd * RUSD), ["us-teacher-salary-1900", "cpi-1990", "cpi-1900"], "NCES 1899-1900 teacher salary x RUSD", { status: "sourced" }),
  };
  const moneyCoefficientsDoc = Object.fromEntries(Object.entries(moneyCoefficients).map(([k, t]) => [k, { valueRUSD: t.value, rowIds: t.rowIds, formula: t.formula, status: t.status }]));

  const calibration = {
    generator: "scripts/p2b/build-money-calibration.mjs",
    decision: "D-135",
    rusdPerUsd1900: rusdTrace,
    usGdpPerHeadRUSD: usGdpPerHead,
    priceLevelFit: { elasticity: priceLevelElasticity, points: fitPoints, rowIds: fitRowIds },
    laborerPayToGdpPerHead: { us: lambdaUS, uk: lambdaUK, mean: lambda },
    professionRatios: professionRatio,
    workingAgeShare,
    goods: Object.fromEntries(goods1900.map((g) => [g.key, { basePrice1900RUSD: trace(g.basePrice1900RUSD, priceRows[g.key].rowIds, `${priceRows[g.key].formula}`), transportCostPerUnit: trace(g.transportCostPerUnit, [...priceRows[g.key].rowIds, "freight-share-per-distance-unit"], "base price x freight share per distance unit", { status: "provisional" }) }])),
    needs: needsTrace,
    definitions: definitionTraces,
    usOccupations: { targets: usTargets, result: usMix, rowIds: ["us-occ-agriculture-1900", "us-occ-manufacturing-1900", "us-occ-domestic-1900", "us-occ-trade-1900", "us-occ-professional-1900", "capitalist-population-share"] },
    territories: territoryCalibration,
    markets: Object.fromEntries(Object.entries(marketCalibration).map(([k, m]) => [k, { ...m, coveredValueAddedRUSDPerYear: coveredByMarket.get(k) ?? 0, ...marketBalance[k] }])),
    countries: countryCalibration,
    moneyCoefficients,
    ruleRows: {
      wealthLevel: ["us-wage-production-hourly-1900", "price-wheat-1900"],
      savingsPerCapitaRUSD: ["household-cash-months"],
      operatingCashRUSD: ["working-capital-days"],
      technique: ["labour-share-agriculture", "labour-share-manufacturing", "depreciation-rate", "capital-per-job-years"],
      level: ["jobs-per-level", "labour-share-agriculture", "labour-share-manufacturing"],
      stockLots: ["opening-stock-days"],
      baseCapacityRUSDPerDay: ["route-capacity-share"],
    },
  };

  // Calibration targets: the US peasant share follows the census mix (A7).
  const usCountryPopulation = popOut.filter((p) => countryOfProvince.get(p.provinceId)?.tag === "USA").reduce((acc, p) => acc + p.population, 0);
  const usCountryPeasants = popOut.filter((p) => countryOfProvince.get(p.provinceId)?.tag === "USA" && p.professionKey === "peasants").reduce((acc, p) => acc + p.population, 0);
  const calibrationTargets = read(INPUTS.calibrationTargets).map((target) =>
    target.id === "usa-peasant-share-1900"
      ? {
          ...target,
          target: usCountryPeasants / usCountryPopulation,
          sourceIds: ["p2b-money-calibration"],
          confidence: "medium",
          notes: "P2b (D-135 A7): home territory from the 1900 census occupation groups (agricultural pursuits / participation), fitted to the P2 province totals; dependencies keep the authored mix.",
        }
      : target,
  );
  const outputs = {
    "calibration_targets_1900.json": json(calibrationTargets),
    "provinces_1900.json": json(provinceRows),
    "pops_1900.json": json(popOut),
    "buildings_1900.json": json(buildingRows),
    "countries_1900.json": json(countryRows),
    "markets_1900.json": json(marketRows),
    "trade_routes_1900.json": json(routeRows),
    "employment_1900.json": json([]),
    "money_coefficients_1900.json": json(moneyCoefficientsDoc),
    "calibration_1900.json": json(calibration),
  };
  const definitionOutputs = {
    "historical_1900_goods.json": json(goods1900),
    "historical_1900_buildings.json": json(cleanDefinitions),
    "historical_1900_professions.json": json(professions1900),
    "historical_1900_needs.json": json(needs1900),
  };
  const report = {
    generator: "scripts/p2b/build-money-calibration.mjs",
    decision: "D-135",
    inputs: Object.fromEntries(Object.entries(INPUTS).map(([name, path]) => [name, sha256(readText(path))])),
    outputs: Object.fromEntries([...Object.entries(outputs), ...Object.entries(definitionOutputs)].map(([name, text]) => [name, sha256(text)])),
    counts: {
      sourceRows: src.rows.length,
      sourcedRows: src.rows.filter((r) => r.status === "sourced").length,
      secondaryRows: src.rows.filter((r) => r.status === "secondary").length,
      provisionalRows: src.rows.filter((r) => r.status === "provisional").length,
      buildings: buildingRows.length,
      buildingsAdded: addedBuildings.length,
      buildingsDropped: buildings.length - buildingRows.length,
      buildingLevels: buildingRows.reduce((acc, b) => acc + b.level, 0),
      populationBlocks: popOut.length,
      population: popOut.reduce((acc, p) => acc + p.population, 0),
      marketsClamped: Object.values(marketCalibration).filter((m) => m.initialPriceMultiplier.clamped).length,
    },
  };
  outputs["build_report.json"] = json(report);
  return { outputs, definitionOutputs };
}

const { outputs, definitionOutputs } = build();
if (CHECK) {
  const stale = [];
  for (const [name, text] of Object.entries(outputs)) {
    const path = join(OUT, name);
    if (!existsSync(path) || readText(path) !== text) stale.push(`historical/p2b/${name}`);
  }
  for (const [name, text] of Object.entries(definitionOutputs)) {
    const path = join(DATA, name);
    if (!existsSync(path) || readText(path) !== text) stale.push(name);
  }
  if (stale.length > 0) {
    console.error(`P2b calibration is stale: ${stale.join(", ")}. Run node scripts/p2b/build-money-calibration.mjs`);
    process.exit(1);
  }
  console.log("P2b calibration is current.");
} else {
  mkdirSync(OUT, { recursive: true });
  for (const [name, text] of Object.entries(outputs)) writeFileSync(join(OUT, name), text);
  for (const [name, text] of Object.entries(definitionOutputs)) writeFileSync(join(DATA, name), text);
  console.log(JSON.stringify(JSON.parse(outputs["build_report.json"]).counts));
}
