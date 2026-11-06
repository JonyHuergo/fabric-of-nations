#!/usr/bin/env node
/**
 * P5b (D-146): the 57-good catalogue of the 1900 world.
 *
 * Inputs (committed):
 *   packages/data/data/historical/p5b/sources_1900.json      cited 1900 rows (prices, outputs, budget)
 *   packages/data/data/historical/p5b/ds140_1900_1990.json   USGS DS-140 extract
 *   packages/data/data/historical/p2b/sources_1900.json      CPI rows, labour shares (P2b)
 *   packages/data/data/historical/p2b/calibration_1900.json  US 1900 wage table (P2b)
 *   packages/data/data/historical_1900_goods.json            P2b goods (ids 0-7, prices kept)
 *   packages/data/data/historical_1900_professions.json      P2b professions (reference wages)
 *   packages/data/data/historical_1900_needs.json            P2b need tiers
 *   packages/data/data/historical/p5/buildings_definitions_1900.json  P5 definitions (land use)
 *   packages/data/data/technology.json                       technology ids and keys
 *   scripts/p5b/catalogue.mjs                                authored goods and recipes
 *
 * Outputs (generated, committed), packages/data/data/historical/p5b/:
 *   goods_1900.json                  the 57 goods with reference prices
 *   buildings_definitions_1900.json  P5 definitions plus the new buildings
 *   needs_1900.json                  P2b tiers plus the new goods' need items
 *   calibration_1900.json            every derived value with its rows and formula
 *   build_report.json                input and output checksums, counts
 *
 * Method (docs/P5B_PLAN.md §1, §8; D-146):
 *  1. Reference prices. 1900 goods: 1900 US price in USD per sim unit (from the cited
 *     rows, converted with the unit rows) x CPI(1990)/CPI(1900) = 15.704 (D-130). Later
 *     goods: 1990 US producer price, already RUSD. Defined units (household goods,
 *     pharmaceuticals, services, electronic components) carry their definition. The
 *     eight P2b goods keep their P2b prices.
 *  2. Recipes. Each new building's main output per throughput unit (1,000 jobs per
 *     level) is sized so that a level at US 1900 wages and reference prices earns its
 *     wage bill / labour share + upkeep (D-135 A3): technique 1 in the United States.
 *     Construction cost = one year of the reference wage bill per level; upkeep = 3 %
 *     a year (P2b rows); half of it is bought as maintenance goods (A6).
 *  3. Needs. The P2b tiers are kept; the 1901 budget's non-food, non-apparel, non-rent
 *     categories become comfort and luxury items (half each, as P2b split the extra
 *     food), at reference prices per person per day.
 *
 * Usage: node scripts/p5b/build-goods-1900.mjs [--check]
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BUILDINGS,
  CONSTRUCTION_MATERIAL_MIX,
  CONSTRUCTION_MATERIAL_SHARE,
  FERTILISER_OPTIONAL,
  GOODS,
  MAINTENANCE_MIX,
  MAINTENANCE_SHARE_OF_UPKEEP,
} from "./catalogue.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DATA = join(ROOT, "packages/data/data");
const OUT = join(DATA, "historical/p5b");
const CHECK = process.argv.includes("--check");

const INPUTS = {
  sources: join(OUT, "sources_1900.json"),
  ds140: join(OUT, "ds140_1900_1990.json"),
  p2bSources: join(DATA, "historical/p2b/sources_1900.json"),
  p2bCalibration: join(DATA, "historical/p2b/calibration_1900.json"),
  goods: join(DATA, "historical_1900_goods.json"),
  professions: join(DATA, "historical_1900_professions.json"),
  needs: join(DATA, "historical_1900_needs.json"),
  definitions: join(DATA, "historical/p5/buildings_definitions_1900.json"),
  technology: join(DATA, "technology.json"),
  moneyCoefficients: join(DATA, "historical/p2b/money_coefficients_1900.json"),
  catalogue: join(ROOT, "scripts/p5b/catalogue.mjs"),
};

const readText = (path) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const read = (path) => JSON.parse(readText(path));
const json = (value) => `${JSON.stringify(value, null, 1)}\n`;
const sha256 = (text) => createHash("sha256").update(text).digest("hex");
const round = (value, digits) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};
/** Six significant digits: prices span 1e-1 to 1e5 RUSD. */
const sig = (value) => Number(value.toPrecision(6));

/** A money coefficient of the P2b file (a bare number or a traced { value }). */
function moneyCoefficientValue(file, key) {
  const root = file.coefficients ?? file;
  const entry = root[key];
  const value = typeof entry === "number" ? entry : (entry?.valueRUSD ?? entry?.value);
  if (typeof value !== "number" || !(value > 0)) throw new Error(`money coefficient ${key} is missing`);
  return value;
}

function build() {
  const src = read(INPUTS.sources);
  const ds140 = read(INPUTS.ds140);
  const p2b = read(INPUTS.p2bSources);
  const p2bCalibration = read(INPUTS.p2bCalibration);
  const oldGoods = read(INPUTS.goods);
  const professions = read(INPUTS.professions);
  const oldNeeds = read(INPUTS.needs);
  const p5Definitions = read(INPUTS.definitions);
  const technology = read(INPUTS.technology);
  const moneyCoefficients = read(INPUTS.moneyCoefficients);

  const p2bRow = (id) => {
    const row = p2b.rows.find((entry) => entry.id === id);
    if (row === undefined) throw new Error(`unknown P2b row ${id}`);
    return row.value;
  };
  const unit = (id) => {
    const row = src.units.find((entry) => entry.id === id);
    if (row === undefined) throw new Error(`unknown unit row ${id}`);
    return row.value;
  };
  const priceRow = (id) => {
    const row = src.prices1900.find((entry) => entry.id === id);
    if (row === undefined) throw new Error(`unknown price row ${id}`);
    return row.valueUSD !== undefined ? row.valueUSD / row.quantity : row.value;
  };
  const ds = (sheet, year, column) => {
    const table = ds140.tables.find((entry) => entry.sheet === sheet);
    const value = table?.values?.[String(year)]?.[column];
    if (typeof value !== "number") throw new Error(`DS-140 ${sheet} ${year} ${column} is not a number`);
    return value;
  };
  const rusdPerUsd1900 = p2bRow("cpi-1990") / p2bRow("cpi-1900");
  const lb = unit("kg-per-lb");
  const perLbToPerKg = (value) => value / lb;
  const perLbToPerT = (value) => (value / lb) * 1000;

  // 1. Reference prices: USD per sim unit (1900 goods) or RUSD (1990 / defined).
  const goodsKept = new Map(oldGoods.map((good) => [good.key, good]));
  const priceTrace = {};
  const usd1900 = (key, value, rowIds, formula, status = "sourced") => {
    priceTrace[key] = { usdPerUnit1900: sig(value), rowIds, formula, status, basis: "1900-wholesale" };
    return value * rusdPerUsd1900;
  };
  const rusd1990 = (key, value, rowIds, formula, status) => {
    priceTrace[key] = { rusdPerUnit: sig(value), rowIds, formula, status, basis: "1990-producer" };
    return value;
  };
  const defined = (key, value, formula) => {
    priceTrace[key] = { rusdPerUnit: sig(value), rowIds: [], formula, status: "sourced", basis: "defined-unit" };
    return value;
  };
  const milkEq = (perKgButter, perKgCheese) =>
    0.5 * (perKgButter / unit("milk-equivalent-kg-per-kg-butter")) + 0.5 * (perKgCheese / unit("milk-equivalent-kg-per-kg-cheese"));
  const coalUsdPerT = priceRow("price-bituminous-coal-mine") / (unit("kg-per-short-ton") / 1000);
  const copperUsdPerT = perLbToPerT(priceRow("price-copper-ingot"));
  const kerosenePerT = (priceRow("price-refined-petroleum-export") / unit("litres-per-us-gallon") / unit("kerosene-kg-per-litre")) * 1000;
  const steelUsdPerT = priceRow("price-steel-billets-ds140");

  const priceOf = {
    dairy: () => usd1900("dairy", milkEq(perLbToPerKg(priceRow("price-butter-creamery-ny")), perLbToPerKg(priceRow("price-cheese-ny"))),
      ["price-butter-creamery-ny", "price-cheese-ny", "milk-equivalent-kg-per-kg-butter", "milk-equivalent-kg-per-kg-cheese", "kg-per-lb"],
      "mean of butter and cheese prices per kg milk equivalent (eggs not priced; provisional weights 0.5/0.5)", "provisional"),
    produce: () => usd1900("produce", 0.8 * (priceRow("price-potatoes") / unit("kg-per-bushel-potatoes")) + 0.2 * (priceRow("price-beans") / unit("kg-per-bushel-potatoes")),
      ["price-potatoes", "price-beans", "kg-per-bushel-potatoes"], "0.8 potatoes + 0.2 beans per kg (60 lb bushels; provisional weights)", "provisional"),
    sugar: () => usd1900("sugar", perLbToPerKg(priceRow("price-sugar-granulated")), ["price-sugar-granulated", "kg-per-lb"], "granulated sugar per kg"),
    "coffee-tea-cocoa": () => usd1900("coffee-tea-cocoa",
      0.8 * perLbToPerKg(priceRow("price-coffee-rio-7")) + 0.2 * perLbToPerKg(priceRow("price-tea-formosa")),
      ["price-coffee-rio-7", "price-tea-formosa", "kg-per-lb"], "0.8 coffee (cocoa priced as coffee) + 0.2 tea per kg (weights by 1900 world output, provisional)", "provisional"),
    tobacco: () => usd1900("tobacco", perLbToPerKg(priceRow("price-tobacco-leaf-export")), ["price-tobacco-leaf-export", "kg-per-lb"], "leaf tobacco export price per kg"),
    rubber: () => usd1900("rubber", perLbToPerKg(priceRow("price-rubber-para")), ["price-rubber-para", "kg-per-lb"], "Para rubber, fine, New York, per kg"),
    timber: () => usd1900("timber",
      ((priceRow("price-lumber-spruce") + priceRow("price-lumber-yellow-pine") + priceRow("price-lumber-hemlock")) / 3) / unit("m3-per-thousand-board-feet"),
      ["price-lumber-spruce", "price-lumber-yellow-pine", "price-lumber-hemlock", "m3-per-thousand-board-feet"], "mean of spruce, yellow pine and hemlock per thousand board feet / 2.3597 m3"),
    paper: () => usd1900("paper", perLbToPerT(priceRow("price-paper-news")), ["price-paper-news", "kg-per-lb"], "news paper per t"),
    coal: () => usd1900("coal", coalUsdPerT, ["price-bituminous-coal-mine", "kg-per-short-ton"], "bituminous coal spot value per metric ton"),
    "crude-oil": () => usd1900("crude-oil", priceRow("price-crude-petroleum") * unit("crude-oil-barrels-per-tonne"),
      ["price-crude-petroleum", "crude-oil-barrels-per-tonne"], "petroleum spot value per barrel x 7.33 barrels per t"),
    "natural-gas": () => usd1900("natural-gas", coalUsdPerT * (38 / 27), ["price-bituminous-coal-mine", "kg-per-short-ton"],
      "energy parity with bituminous coal: 1,000 m3 of gas (38 GJ) = 1.41 t of coal (27 GJ/t); no 1900 volume exists (provisional)", "provisional"),
    "iron-ore": () => usd1900("iron-ore", (priceRow("price-iron-ore-mines") / (unit("kg-per-long-ton") / 1000)) / 0.55,
      ["price-iron-ore-mines", "kg-per-long-ton"], "ore value at mines per metric ton / 0.55 Fe grade (provisional grade)", "provisional"),
    "copper-ore": () => usd1900("copper-ore", copperUsdPerT * 0.5, ["price-copper-ingot", "kg-per-lb"],
      "copper price x 0.5 payable share of ore value (provisional)", "provisional"),
    bauxite: () => usd1900("bauxite", priceRow("price-bauxite-us"), ["price-bauxite-us"], "DS-140 1900 unit value"),
    nitrates: () => usd1900("nitrates", priceRow("price-nitrate-liverpool") / (unit("kg-per-short-ton") / 1000), ["price-nitrate-liverpool", "kg-per-short-ton"],
      "price of 2,000 lb nitrogen in nitrate at Liverpool per metric ton N"),
    uranium: () => rusd1990("uranium", 26000, [], "provisional placeholder: 1990 utility price of uranium about $10/lb U3O8; transcription from the Statistical Abstract 1992 pending", "provisional"),
    tin: () => usd1900("tin", perLbToPerT(priceRow("price-tin-pig")), ["price-tin-pig", "kg-per-lb"], "tin bars and pigs per t"),
    gold: () => usd1900("gold", priceRow("price-gold-mint") * (1000 / unit("g-per-troy-ounce")), ["price-gold-mint", "g-per-troy-ounce"], "statutory mint price per fine kg"),
    silver: () => usd1900("silver", priceRow("price-silver-commercial") * (1000 / unit("g-per-troy-ounce")), ["price-silver-commercial", "g-per-troy-ounce"], "commercial value per kg"),
    kerosene: () => usd1900("kerosene", kerosenePerT, ["price-refined-petroleum-export", "litres-per-us-gallon", "kerosene-kg-per-litre"], "refined petroleum for export per t"),
    petrol: () => usd1900("petrol", kerosenePerT, ["price-refined-petroleum-export", "litres-per-us-gallon", "kerosene-kg-per-litre"],
      "priced as kerosene per t until the naphtha export unit value is transcribed (provisional)", "provisional"),
    "fuel-oil": () => usd1900("fuel-oil", priceRow("price-crude-petroleum") * unit("crude-oil-barrels-per-tonne") * 1.1,
      ["price-crude-petroleum", "crude-oil-barrels-per-tonne"], "crude price per t x 1.1 until the residuum price is transcribed (provisional)", "provisional"),
    electricity: () => usd1900("electricity", 10, [],
      "wholesale (generation) price, 1.0 cent per kWh: between bulk hydro power at Niagara (about $20 per HP-year, 0.3 cent per kWh) and central-station income per kWh sold (about 3.4 cents, mostly lighting at retail); every reference price is wholesale. Transcription of the 1902 census pending (provisional)", "provisional"),
    steel: () => usd1900("steel", steelUsdPerT, ["price-steel-billets-ds140"], "DS-140 1900 steel unit value"),
    copper: () => usd1900("copper", copperUsdPerT, ["price-copper-ingot", "kg-per-lb"], "copper, New York, per t"),
    aluminium: () => usd1900("aluminium", perLbToPerT(priceRow("price-aluminum-pittsburg")), ["price-aluminum-pittsburg", "kg-per-lb"], "aluminum at Pittsburg per t"),
    chemicals: () => usd1900("chemicals", perLbToPerT(0.6 * priceRow("price-sulphuric-acid") + 0.2 * priceRow("price-muriatic-acid") + 0.2 * priceRow("price-alum")),
      ["price-sulphuric-acid", "price-muriatic-acid", "price-alum", "kg-per-lb"], "0.6 sulphuric acid + 0.2 muriatic acid + 0.2 alum per t (provisional weights)", "provisional"),
    fertiliser: () => usd1900("fertiliser", priceRow("price-nitrate-liverpool") / (unit("kg-per-short-ton") / 1000), ["price-nitrate-liverpool", "kg-per-short-ton"],
      "nitrogen in nitrate at Liverpool per t N (provisional: fertiliser nutrient priced as nitrate N)", "provisional"),
    plastics: () => rusd1990("plastics", 1300, [], "provisional placeholder: 1990 US plastics resins about $0.60/lb; transcription pending", "provisional"),
    "construction-materials": () => usd1900("construction-materials",
      0.2 * (priceRow("price-cement-portland") / (unit("kg-per-barrel-portland-cement") / 1000)) + 0.8 * (priceRow("price-brick-common") / (unit("kg-per-thousand-common-brick") / 1000)),
      ["price-cement-portland", "price-brick-common", "kg-per-barrel-portland-cement", "kg-per-thousand-common-brick"], "0.2 Portland cement + 0.8 common brick per t (weights by tonnage, provisional)", "provisional"),
    machinery: () => usd1900("machinery", (1.1 * steelUsdPerT) / 0.35, ["price-steel-billets-ds140"],
      "1.1 t steel per t at 35 % materials share of value (no tonnage price exists; provisional)", "provisional"),
    "electrical-equipment": () => usd1900("electrical-equipment", (0.4 * copperUsdPerT + 0.7 * steelUsdPerT) / 0.35, ["price-copper-ingot", "price-steel-billets-ds140", "kg-per-lb"],
      "0.4 t copper + 0.7 t steel per t at 35 % materials share (provisional)", "provisional"),
    "electronic-components": () => defined("electronic-components", 1, "1 unit = 1 RUSD of 1990 components at producer prices"),
    "motor-vehicles": () => rusd1990("motor-vehicles", 13000, [], "provisional placeholder: 1990 US factory wholesale value per vehicle; transcription pending", "provisional"),
    aircraft: () => rusd1990("aircraft", 400000, [], "provisional placeholder: 1990 civil aircraft value per t of airframe; transcription pending", "provisional"),
    ships: () => usd1900("ships", 38.9, [], "about GBP 8 per gross ton for a 1900 cargo steamer (secondary; provisional)", "provisional"),
    armaments: () => defined("armaments", moneyCoefficientValue(moneyCoefficients, "equipmentPriceRUSD"),
      "the 1900 world's M10 equipment price (historical/p2b/money_coefficients_1900.json), so a later procurement step and the good agree (D-146 A2; no 1900 production)"),
    "household-goods": () => defined("household-goods", rusdPerUsd1900, "1 unit = 1 US dollar of 1900 furniture and housewares at wholesale"),
    appliances: () => rusd1990("appliances", 450, [], "provisional placeholder: 1990 producer value per major appliance; transcription pending", "provisional"),
    radios: () => rusd1990("radios", 40, [], "provisional placeholder: 1990 factory value per radio; transcription pending", "provisional"),
    televisions: () => rusd1990("televisions", 300, [], "provisional placeholder: 1990 factory value per television; transcription pending", "provisional"),
    computers: () => rusd1990("computers", 2500, [], "provisional placeholder: 1990 factory value per personal computer; transcription pending", "provisional"),
    "mobile-phones": () => rusd1990("mobile-phones", 600, [], "provisional placeholder: 1990 factory value per cellular phone; transcription pending", "provisional"),
    pharmaceuticals: () => defined("pharmaceuticals", rusdPerUsd1900 / 100, "1 dose-eq = 1 US cent of 1900 drugs at wholesale"),
  };
  for (const key of ["commerce", "transport-services", "communication", "finance-services", "personal-services"]) {
    priceOf[key] = () => defined(key, 1, "1 service unit = the service whose 1900 US price, x 15.704, is 1 RUSD (D-146 C-6)");
  }

  const technologyByKey = new Map(technology.technologies.map((entry) => [entry.key, entry]));
  const goods = GOODS.map(([id, key, name, unitLabel, category, group, storable = true, tradeable = true, tradeTechnology = null]) => {
    const kept = goodsKept.get(key);
    let price;
    if (kept !== undefined && id <= 7) {
      price = kept.basePrice1900RUSD;
      priceTrace[key] = { rusdPerUnit: price, rowIds: [], formula: "P2b reference price (unchanged)", status: "sourced", basis: "1900-wholesale" };
    } else {
      const derive = priceOf[key];
      if (derive === undefined) throw new Error(`no price rule for ${key}`);
      price = derive();
    }
    const record = {
      id,
      key,
      name,
      category,
      basePrice1900RUSD: price > 0 ? sig(price) : 1,
      transportCostPerUnit: price > 0 ? sig(price * p2bRow("freight-share-per-distance-unit")) : 0.005,
      priceElasticity: 1,
      spoilageRateAnnual: 0,
      unitLabel,
      group,
      priceBasis: priceTrace[key].basis,
    };
    if (!storable) record.storable = false;
    if (!tradeable) record.tradeable = false;
    if (tradeTechnology !== null) {
      const tech = technologyByKey.get(tradeTechnology);
      if (tech === undefined) throw new Error(`unknown technology ${tradeTechnology}`);
      record.tradeRequiresTechnologyId = tech.id;
    }
    return record;
  });
  const goodByKey = new Map(goods.map((good) => [good.key, good]));
  const gid = (key) => {
    const good = goodByKey.get(key);
    if (good === undefined) throw new Error(`unknown good ${key}`);
    return good.id;
  };

  // 2. Building definitions.
  const professionByKey = new Map(professions.map((profession) => [profession.key, profession]));
  const usWages = p2bCalibration.territories["usa-home"].wageTable;
  const laborShare = (sector) => (sector === "agriculture" ? p2bRow("labour-share-agriculture") : p2bRow("labour-share-manufacturing"));
  const jobsPerLevel = p2bRow("jobs-per-level");
  const depreciation = p2bRow("depreciation-rate");
  const definitions = p5Definitions.map((definition) => ({ ...definition }));
  // C-8: cotton becomes its own crop; the commercial farms grow grain only.
  for (const definition of definitions) {
    if (["commercial-farm", "commercial-farm-peasant", "mechanized-farm"].includes(definition.key)) {
      definition.outputs = definition.outputs.filter((output) => output.goodId !== gid("cotton"));
      definition.optionalInputs = [{
        goodId: gid("fertiliser"),
        quantityPerThroughputUnit: round(FERTILISER_OPTIONAL.perOutput * (definition.outputs[0]?.quantityPerThroughputUnit ?? 0), 6),
        outputElasticity: FERTILISER_OPTIONAL.outputElasticity,
      }];
    }
  }
  const recipeTrace = {};
  let nextId = Math.max(...definitions.map((definition) => definition.id)) + 1;
  const priceRusd = (key) => goodByKey.get(key).basePrice1900RUSD;
  for (const spec of BUILDINGS) {
    const jobs = Object.entries(spec.jobs).map(([key, share]) => {
      const profession = professionByKey.get(key);
      if (profession === undefined) throw new Error(`${spec.key}: unknown profession ${key}`);
      return { professionId: profession.id, workersPerThroughputUnit: round(jobsPerLevel * share, 6), key, share };
    });
    const usWageBillDay = jobs.reduce((total, job) => total + job.workersPerThroughputUnit * usWages[job.key], 0) / 365;
    const referenceWageBillYear = jobs.reduce((total, job) => total + job.workersPerThroughputUnit * professionByKey.get(job.key).baseWage1900RUSDPerYear, 0);
    const constructionCostRUSD = round(referenceWageBillYear * p2bRow("capital-per-job-years"), 2);
    const totalUpkeepDay = (constructionCostRUSD * depreciation) / 365;
    const maintenanceValueDay = totalUpkeepDay * MAINTENANCE_SHARE_OF_UPKEEP;
    const vaPerLevelDay = usWageBillDay / laborShare(spec.sector) + totalUpkeepDay;
    let netPerUnit = priceRusd(spec.output);
    for (const [key, perOutput] of Object.entries(spec.jointOutputs ?? {})) netPerUnit += priceRusd(key) * perOutput;
    for (const [key, perOutput] of Object.entries(spec.inputs)) netPerUnit -= priceRusd(key) * perOutput;
    if (!(netPerUnit > 0)) throw new Error(`${spec.key}: non-positive value added per unit at reference prices (${netPerUnit})`);
    const outputPerTU = vaPerLevelDay / netPerUnit;
    const gate = spec.gate === undefined || spec.gate === null ? null : technologyByKey.get(spec.gate)?.id;
    if (gate === undefined) throw new Error(`${spec.key}: unknown technology ${spec.gate}`);
    const definition = {
      id: nextId,
      key: spec.key,
      name: spec.name,
      referenceThroughputPerDayAtLevelOne: 1,
      inputs: Object.entries(spec.inputs)
        .map(([key, perOutput]) => ({ goodId: gid(key), quantityPerThroughputUnit: sig(perOutput * outputPerTU) }))
        .sort((left, right) => left.goodId - right.goodId),
      outputs: [
        { goodId: gid(spec.output), quantityPerThroughputUnit: sig(outputPerTU) },
        ...Object.entries(spec.jointOutputs ?? {}).map(([key, perOutput]) => ({ goodId: gid(key), quantityPerThroughputUnit: sig(perOutput * outputPerTU) })),
      ],
      jobs: jobs.map(({ professionId, workersPerThroughputUnit }) => ({ professionId, workersPerThroughputUnit })).sort((left, right) => left.professionId - right.professionId),
      constructionCostRUSD,
      constructionWorkers: 4,
      dailyUpkeepRUSDAtLevelOne: round(totalUpkeepDay - maintenanceValueDay, 2),
      storageCapacityByGood: [],
      resourceRequirements: [],
      requiredTechnologyId: gate,
      ownershipAllowed: ["private", "state"],
      isEssentialInfrastructure: false,
      sector: spec.sector,
      constructionMaterials: Object.entries(CONSTRUCTION_MATERIAL_MIX)
        .map(([key, share]) => ({ goodId: gid(key), quantity: sig((constructionCostRUSD * CONSTRUCTION_MATERIAL_SHARE * share) / priceRusd(key)) }))
        .sort((left, right) => left.goodId - right.goodId),
      maintenanceInputs: Object.entries(MAINTENANCE_MIX)
        .map(([key, share]) => ({ goodId: gid(key), quantityPerLevelPerDay: sig((maintenanceValueDay * share) / priceRusd(key)) }))
        .sort((left, right) => left.goodId - right.goodId),
    };
    if (spec.landUse !== undefined) definition.landUse = spec.landUse;
    if (spec.extracts !== undefined) definition.extracts = spec.extracts;
    if (spec.maxAbsLatitudeDeg !== undefined) definition.maxAbsLatitudeDeg = spec.maxAbsLatitudeDeg;
    definitions.push(definition);
    recipeTrace[spec.key] = {
      outputPerTU: sig(outputPerTU),
      vaPerLevelDayUS: sig(vaPerLevelDay),
      netValuePerUnitRUSD: sig(netPerUnit),
      formula: "output per TU = (US wage bill per level-day / labour share + upkeep) / (price + joint outputs - inputs, per unit, at reference prices)",
      rowIds: ["labour-share-agriculture", "labour-share-manufacturing", "jobs-per-level", "capital-per-job-years", "depreciation-rate"],
      status: "provisional",
    };
    nextId += 1;
  }
  // Warehouses store the storable goods the P2b warehouse stored; the capacities of the
  // new goods are sized in step 4 (placement) by their 1900 daily output (C-19).

  // 3. Needs: the P2b tiers plus the 1901 budget's other categories.
  const budget = src.budget1901;
  const itemOf = (name) => budget.items.find((entry) => entry.item === name);
  const perCapitaDayRUSD = (name) => {
    const item = itemOf(name);
    return ((item.averageAmongHaving * item.sharePercent) / 100 / budget.familySize / 365) * rusdPerUsd1900;
  };
  // Retail spending = the good at its wholesale reference price + transport and commerce
  // margins (C-20: commerce and transport are household needs until P6/P8). The goods'
  // shares of retail value are provisional (coal at the mine was about a fifth of its
  // delivered city price in 1901).
  const CATEGORY_GOODS = {
    fuel: { coal: 0.2, timber: 0.05, "transport-services": 0.45, commerce: 0.3 },
    lighting: { kerosene: 0.45, "natural-gas": 0.15, electricity: 0.1, commerce: 0.3 },
    "furniture-and-utensils": { "household-goods": 0.6, commerce: 0.3, "transport-services": 0.1 },
    "books-and-newspapers": { paper: 0.2, communication: 0.6, commerce: 0.2 },
    "amusements-and-vacation": { "personal-services": 1 },
    "intoxicating-liquors": { "food-products": 0.4, commerce: 0.4, "personal-services": 0.2 },
    tobacco: { tobacco: 0.25, commerce: 0.75 },
    "sickness-and-death": { pharmaceuticals: 0.3, "personal-services": 0.7 },
    "insurance-life": { "finance-services": 1 },
    "insurance-property": { "finance-services": 1 },
    "other-purposes": { "personal-services": 0.5, "transport-services": 0.3, commerce: 0.2 },
  };

  const GATED = { electricity: "electrical-generation" };
  const comfortShare = p2bRow("comfort-share-of-extra");
  const addedPerCapitaRUSD = {};
  for (const [category, mix] of Object.entries(CATEGORY_GOODS)) {
    for (const [key, share] of Object.entries(mix)) addedPerCapitaRUSD[key] = (addedPerCapitaRUSD[key] ?? 0) + perCapitaDayRUSD(category) * share;
  }
  const needs = oldNeeds.map((tier) => ({ ...tier, items: tier.items.map((item) => ({ ...item })) }));
  const needsTrace = {};
  for (const tierName of ["comfort", "luxury"]) {
    const tier = needs.find((entry) => entry.tier === tierName);
    const share = tierName === "comfort" ? comfortShare : 1 - comfortShare;
    for (const [key, rusd] of Object.entries(addedPerCapitaRUSD).sort((left, right) => gid(left[0]) - gid(right[0]))) {
      const quantity = sig((rusd * share) / priceRusd(key));
      const existing = tier.items.find((item) => item.goodKey === key);
      if (existing !== undefined) existing.quantityPerCapitaPerDay = sig(existing.quantityPerCapitaPerDay + quantity);
      else tier.items.push({ goodKey: key, quantityPerCapitaPerDay: quantity, ...(GATED[key] === undefined ? {} : { requiredTechnologyKey: GATED[key] }) });
      needsTrace[`${tierName}:${key}`] = { quantityPerCapitaPerDay: quantity, rusdPerCapitaPerDay: sig(rusd * share), rowIds: ["commissioner-labor-1903", "comfort-share-of-extra"], status: "provisional" };
    }
  }

  const calibration = {
    generator: "scripts/p5b/build-goods-1900.mjs",
    decision: "D-146",
    rusdPerUsd1900,
    prices: priceTrace,
    recipes: recipeTrace,
    needs: needsTrace,
    budgetCategoryGoods: CATEGORY_GOODS,
  };
  return {
    "goods_1900.json": json(goods),
    "buildings_definitions_1900.json": json(definitions),
    "needs_1900.json": json(needs),
    "calibration_1900.json": json(calibration),
  };
}

const outputs = build();
const inputSums = Object.fromEntries(Object.entries(INPUTS).map(([key, path]) => [key, sha256(readText(path))]));
outputs["build_report.json"] = json({
  generator: "scripts/p5b/build-goods-1900.mjs",
  inputs: inputSums,
  outputs: Object.fromEntries(Object.entries(outputs).map(([name, text]) => [name, sha256(text)])),
});

if (CHECK) {
  const stale = Object.entries(outputs).filter(([name, text]) => !existsSync(join(OUT, name)) || readText(join(OUT, name)) !== text);
  if (stale.length > 0) {
    console.error(`P5b outputs are stale: ${stale.map(([name]) => name).join(", ")}; run node scripts/p5b/build-goods-1900.mjs`);
    process.exit(1);
  }
  console.log("P5b outputs are current");
} else {
  mkdirSync(OUT, { recursive: true });
  for (const [name, text] of Object.entries(outputs)) writeFileSync(join(OUT, name), text);
  console.log(`wrote ${Object.keys(outputs).length} files to ${OUT}`);
}
