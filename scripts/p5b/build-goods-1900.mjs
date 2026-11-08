#!/usr/bin/env node
/**
 * P5b (D-146): the 58-good catalogue of the 1900 world.
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
 *   goods_1900.json                  the 58 goods with reference prices
 *   buildings_definitions_1900.json  P5 definitions plus the new buildings
 *   needs_1900.json                  P2b tiers plus the new goods' need items
 *   calibration_1900.json            every derived value with its rows and formula
 *   provinces_1900.json              P5 provinces with absLatitudeDeg (crop bands, C-8)
 *   countries_1900.json              P5 countries with the A9 technology grants and the
 *                                    fiscal values recomputed from the new coverage (§8.6)
 *   buildings_1900.json              P2b buildings re-solved plus the new 1900 buildings
 *   markets_1900.json                P2b markets with the opening stock of every good
 *   trade_routes_1900.json           P2b routes with capacity from the new coverage
 *   build_report.json                input and output checksums, counts
 *   docs/P5B_BEFORE_AFTER.md         coverage and output before and after (report)
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
 *     food), at reference prices per person per day. Dairy, produce, sugar and coffee,
 *     tea and cocoa take their share of the comfort and luxury processed-food value by
 *     the 1901 food-article weights (D-148).
 *  4. Placement (scripts/p5b/placement.mjs, D-148): levels from modelled demand, shares
 *     from the sourced 1900 output; then warehouses (C-19), opening stock (D-136 rule),
 *     the workforce cap, fiscal values and route capacities from the new coverage.
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
  SILK_OPTIONAL,
  TEXTILE_CALIBRATION,
} from "./catalogue.mjs";
import { NOT_PLACED_1900, placeCatalogue } from "./placement.mjs";

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
  placement: join(ROOT, "scripts/p5b/placement.mjs"),
  // Stage B (placement): the P2b/P5 province world.
  p5Provinces: join(DATA, "historical/p5/provinces_1900.json"),
  p5Countries: join(DATA, "historical/p5/countries_1900.json"),
  deposits: join(DATA, "historical/p5/deposits_1900.json"),
  p2bPops: join(DATA, "historical/p2b/pops_1900.json"),
  p2bMarkets: join(DATA, "historical/p2b/markets_1900.json"),
  p2bBuildings: join(DATA, "historical/p2b/buildings_1900.json"),
  p2bRoutes: join(DATA, "historical/p2b/trade_routes_1900.json"),
  mapEurope: join(DATA, "map/provinces_1900.json"),
  mapAfrica: join(DATA, "map/provinces_africa_1900.json"),
  mapAmericas: join(DATA, "map/provinces_americas_1900.json"),
  mapAsia: join(DATA, "map/provinces_asia_1900.json"),
  mapOceania: join(DATA, "map/provinces_oceania_1900.json"),
  p3Currencies: join(DATA, "historical/p3/currencies_1900.json"),
  // C-12: gross theoretical hydro potential by province (scripts/p5b/extract-hydro-riveratlas.mjs).
  hydro: join(OUT, "hydro_province_1900.json"),
};

/**
 * D-149 (designer: "treasury, capped"): the most of its opening treasury a country pays
 * into its mint's reserve cash. Provisional, dimensionless.
 */
const MINT_FUNDING_TREASURY_SHARE = 0.25;
/** The simulation's MINT_MAX_DAILY_SALE_SHARE (economy/constants.ts), for warehouse sizing. */
const MINT_MAX_DAILY_SALE_SHARE = 1 / 30;
/** The simulation's HYDRO_TECHNICAL_SHARE and HYDRO_DAYS_PER_YEAR (economy/constants.ts), for hydro placement. */
const HYDRO_TECHNICAL_SHARE = 0.33;
const HYDRO_DAYS_PER_YEAR = 365.2425;
/** The simulation's MINT_CHARGE (economy/constants.ts): the mint buys at price x (1 - charge). */
const MINT_CHARGE = 0.002;

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

/**
 * A maintenance mix without the goods the building makes (the validator forbids buying
 * one's own output); the other shares are renormalised.
 */
function maintenanceMixWithout(mix, outputs) {
  const kept = Object.entries(mix).filter(([key]) => !outputs.includes(key));
  const total = kept.reduce((acc, [, share]) => acc + share, 0);
  return kept.map(([key, share]) => [key, share / total]);
}

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
  /** A 1990 producer price row (Statistical Abstract 1992): USD of 1990 = RUSD per unit. */
  const price1990 = (id) => {
    const row = (src.prices1990 ?? []).find((entry) => entry.id === id);
    if (row === undefined) throw new Error(`unknown 1990 price row ${id}`);
    return { value: row.valueUSD / row.quantity, status: row.status };
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
    silk: () => usd1900("silk", perLbToPerKg(priceRow("price-raw-silk-import")), ["price-raw-silk-import", "kg-per-lb"], "raw silk import value (year to June 1900) per kg"),
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
    uranium: () => rusd1990("uranium", (price1990("price1990-uranium").value / unit("kg-per-lb") / unit("u-kg-per-kg-u3o8")) * 1000,
      ["price1990-uranium", "kg-per-lb", "u-kg-per-kg-u3o8"], "1990 delivered price per lb U3O8 / 0.45359 kg / 0.848 kg U per kg U3O8, per t U", "sourced"),
    tin: () => usd1900("tin", perLbToPerT(priceRow("price-tin-pig")), ["price-tin-pig", "kg-per-lb"], "tin bars and pigs per t"),
    gold: () => usd1900("gold", priceRow("price-gold-mint") * (1000 / unit("g-per-troy-ounce")), ["price-gold-mint", "g-per-troy-ounce"], "statutory mint price per fine kg"),
    silver: () => usd1900("silver", priceRow("price-silver-commercial") * (1000 / unit("g-per-troy-ounce")), ["price-silver-commercial", "g-per-troy-ounce"], "commercial value per kg"),
    kerosene: () => usd1900("kerosene", kerosenePerT, ["price-refined-petroleum-export", "litres-per-us-gallon", "kerosene-kg-per-litre"], "refined petroleum for export per t"),
    petrol: () => usd1900("petrol", (priceRow("price-naphtha-export") / unit("litres-per-us-gallon") / unit("naphtha-kg-per-litre")) * 1000,
      ["price-naphtha-export", "litres-per-us-gallon", "naphtha-kg-per-litre"],
      "naphtha export unit value (year to June 1900) per gallon / 3.785 L / 0.72 kg per L, per t (density provisional)", "provisional"),
    "fuel-oil": () => usd1900("fuel-oil",
      (priceRow("price-residuum-export") / (unit("gallons-per-barrel-petroleum") * unit("litres-per-us-gallon") * unit("residuum-kg-per-litre"))) * 1000,
      ["price-residuum-export", "gallons-per-barrel-petroleum", "litres-per-us-gallon", "residuum-kg-per-litre"],
      "residuum export unit value (year to June 1900) per 42-gallon barrel / (159 L x 0.95 kg per L), per t (density provisional)", "provisional"),
    // D-148 item 10, option (a) (designer, 2026-11-08): the private stations driven by water
    // alone (census 1902, table 40), about half of whose income was power, set the single
    // reference price. The all-station average (3.36 cents, table 1) is mostly retail
    // lighting; Niagara's large-motor rate (5 per horsepower-year, 0.38 cent at continuous
    // use) bounds it from below.
    electricity: () => usd1900("electricity", priceRow("price-electricity-water-stations-1902") * 1000, ["price-electricity-water-stations-1902"],
      "income from the sale of current / kWh of the private stations using water power exclusively, 1902 (census table 40: ,771,862 / 248,749,668 kWh = 1.52 cents), per MWh"),
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
    "motor-vehicles": () => rusd1990("motor-vehicles", price1990("price1990-passenger-car").value, ["price1990-passenger-car"],
      "1990 import unit value of new passenger cars (customs value; no factory value per vehicle in the abstract)", "secondary"),
    aircraft: () => rusd1990("aircraft", price1990("price1990-large-transport").value / unit("large-transport-empty-t"), ["price1990-large-transport", "large-transport-empty-t"],
      "1990 value per civil large transport / assumed mean empty weight 60 t (C-13: 1 aircraft-eq. = 1 t of airframe; the weight is provisional)", "provisional"),
    ships: () => usd1900("ships", 38.9, [], "about GBP 8 per gross ton for a 1900 cargo steamer (secondary; provisional)", "provisional"),
    armaments: () => defined("armaments", moneyCoefficientValue(moneyCoefficients, "equipmentPriceRUSD"),
      "the 1900 world's M10 equipment price (historical/p2b/money_coefficients_1900.json), so a later procurement step and the good agree (D-146 A2; no 1900 production)"),
    "household-goods": () => defined("household-goods", rusdPerUsd1900, "1 unit = 1 US dollar of 1900 furniture and housewares at wholesale"),
    appliances: () => rusd1990("appliances", price1990("price1990-major-appliances").value, ["price1990-major-appliances"],
      "1989 retail value per major appliance (eight appliances together); no producer value per unit in the abstract", "provisional"),
    radios: () => rusd1990("radios", price1990("price1990-radio").value, ["price1990-radio"], "1989 retail value per radio", "provisional"),
    televisions: () => rusd1990("televisions", price1990("price1990-color-tv").value, ["price1990-color-tv"], "1989 colour TV factory sales / units shipped", "secondary"),
    computers: () => rusd1990("computers", price1990("price1990-personal-computer").value, ["price1990-personal-computer"], "1990 personal computer factory revenue / unit shipments (end-user dollars)", "secondary"),
    "mobile-phones": () => rusd1990("mobile-phones", price1990("price1990-cellular-phone").value, ["price1990-cellular-phone"], "1989 retail value per cellular telephone", "provisional"),
    pharmaceuticals: () => defined("pharmaceuticals", rusdPerUsd1900 / 100, "1 dose-eq = 1 US cent of 1900 drugs at wholesale"),
    jewellery: () => defined("jewellery", rusdPerUsd1900, "1 unit = 1 US dollar of 1900 jewellery and plate at wholesale (D-152)"),
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
    // D-149: monetary gold and silver open at their reference price in every market.
    if (key === "gold" || key === "silver") record.internationalPrice = true;
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
  const priceRusd = (key) => goodByKey.get(key).basePrice1900RUSD;
  // C-8: cotton becomes its own crop; the commercial farms grow grain only.
  for (const definition of definitions) {
    if (["commercial-farm", "commercial-farm-peasant", "mechanized-farm"].includes(definition.key)) {
      definition.outputs = definition.outputs.filter((output) => output.goodId !== gid("cotton"));
      definition.optionalInputs = [{
        goodId: gid("fertiliser"),
        // kg N per kg of grain -> t N (the fertiliser unit) per kg of grain.
        quantityPerThroughputUnit: sig((FERTILISER_OPTIONAL.perOutput / 1000) * (definition.outputs[0]?.quantityPerThroughputUnit ?? 0)),
        outputElasticity: FERTILISER_OPTIONAL.outputElasticity,
      }];
    }
  }
  // D-148 item 13: cotton and wool calibration of the P2b ranch and textile mill.
  for (const definition of definitions) {
    if (definition.key === "ranch") {
      const wool = definition.outputs.find((output) => output.goodId === gid("wool"));
      if (wool === undefined) throw new Error("ranch makes no wool");
      wool.quantityPerThroughputUnit = TEXTILE_CALIBRATION.ranchWoolPerTU;
    }
    if (definition.key === "textile-mill") {
      for (const [key, quantity] of Object.entries(TEXTILE_CALIBRATION.millFibrePerTU)) {
        const input = definition.inputs.find((entry) => entry.goodId === gid(key));
        if (input === undefined) throw new Error(`textile-mill buys no ${key}`);
        input.quantityPerThroughputUnit = quantity;
      }
    }
  }
  // D-148 item 12: raw silk as an optional input of the textile mill, at the 1900 world ratio
  // of raw silk to cotton lint per kg of cotton the mill spins.
  for (const definition of definitions) {
    if (!SILK_OPTIONAL.buildings.includes(definition.key)) continue;
    const cottonPerTU = definition.inputs.find((input) => input.goodId === gid("cotton"))?.quantityPerThroughputUnit;
    if (!(cottonPerTU > 0)) throw new Error(`${definition.key} spins no cotton`);
    definition.optionalInputs = [...(definition.optionalInputs ?? []), {
      goodId: gid("silk"),
      quantityPerThroughputUnit: sig(cottonPerTU * SILK_OPTIONAL.perKgCotton),
      outputElasticity: SILK_OPTIONAL.outputElasticity,
    }];
  }
  // D-146 A6: the P2b definitions also buy half their money upkeep as maintenance goods.
  for (const definition of definitions) {
    const upkeep = definition.dailyUpkeepRUSDAtLevelOne;
    const maintenanceValueDay = upkeep * MAINTENANCE_SHARE_OF_UPKEEP;
    definition.dailyUpkeepRUSDAtLevelOne = round(upkeep - maintenanceValueDay, 2);
    definition.maintenanceInputs = Object.entries(MAINTENANCE_MIX)
      .map(([key, share]) => ({ goodId: gid(key), quantityPerLevelPerDay: sig((maintenanceValueDay * share) / priceRusd(key)) }))
      .sort((left, right) => left.goodId - right.goodId);
  }
  const recipeTrace = {};
  // D-152: jewellery. New metal worked in 1900 = the world's industrial consumption (Mint)
  // x the US share of new metal (domestic bullion + foreign material; melted coin and old
  // jewellery are not new). One unit of jewellery holds `metalShare` of its value in
  // gold and silver, split by the value of the new metal at reference prices.
  const arts = src.industrialArts1900;
  const newShare = (metal) => (arts.usBars1900[metal].domesticBullion + arts.usBars1900[metal].foreignMaterial) / arts.usBars1900[metal].total;
  const jewelleryMetal = {
    metalShare: unit("jewellery-metal-share-of-value"),
    newGoldKgPerYear: arts.printedTotals.goldKg * newShare("gold"),
    newSilverKgPerYear: arts.printedTotals.silverKg * newShare("silver"),
  };
  jewelleryMetal.goldValuePerYear = jewelleryMetal.newGoldKgPerYear * priceRusd("gold");
  jewelleryMetal.silverValuePerYear = jewelleryMetal.newSilverKgPerYear * priceRusd("silver");
  jewelleryMetal.metalValuePerUnit = jewelleryMetal.metalShare * priceRusd("jewellery");
  const metalValuePerYear = jewelleryMetal.goldValuePerYear + jewelleryMetal.silverValuePerYear;
  jewelleryMetal.unitsPerYear = metalValuePerYear / jewelleryMetal.metalValuePerUnit;
  const jewelleryInputs = {
    gold: (jewelleryMetal.metalValuePerUnit * (jewelleryMetal.goldValuePerYear / metalValuePerYear)) / priceRusd("gold"),
    silver: (jewelleryMetal.metalValuePerUnit * (jewelleryMetal.silverValuePerYear / metalValuePerYear)) / priceRusd("silver"),
  };
  const buildingSpecs = BUILDINGS.map((spec) => (spec.metalRecipe === true ? { ...spec, inputs: jewelleryInputs } : spec));
  let nextId = Math.max(...definitions.map((definition) => definition.id)) + 1;
  for (const spec of buildingSpecs) {
    const jobs = Object.entries(spec.jobs).map(([key, share]) => {
      const profession = professionByKey.get(key);
      if (profession === undefined) throw new Error(`${spec.key}: unknown profession ${key}`);
      return { professionId: profession.id, workersPerThroughputUnit: round(jobsPerLevel * share, 6), key, share };
    });
    const usWageBillDay = jobs.reduce((total, job) => total + job.workersPerThroughputUnit * usWages[job.key], 0) / 365;
    const referenceWageBillYear = jobs.reduce((total, job) => total + job.workersPerThroughputUnit * professionByKey.get(job.key).baseWage1900RUSDPerYear, 0);
    const constructionCostRUSD = round(referenceWageBillYear * p2bRow("capital-per-job-years"), 2);
    const totalUpkeepDay = (constructionCostRUSD * depreciation) / 365;
    // Maintenance goods exclude the building's outputs and recipe inputs (the validator
    // forbids buying a good twice or buying one's own output); with none left, the whole
    // upkeep stays money.
    const maintenanceMix = maintenanceMixWithout(spec.maintenanceMix ?? MAINTENANCE_MIX, [spec.output, ...Object.keys(spec.jointOutputs ?? {}), ...Object.keys(spec.inputs), ...Object.keys(spec.optionalInputs ?? {})]);
    const maintenanceValueDay = maintenanceMix.length === 0 ? 0 : totalUpkeepDay * MAINTENANCE_SHARE_OF_UPKEEP;
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
      maintenanceInputs: maintenanceMix
        .map(([key, share]) => ({ goodId: gid(key), quantityPerLevelPerDay: sig((maintenanceValueDay * share) / priceRusd(key)) }))
        .sort((left, right) => left.goodId - right.goodId),
    };
    // Minor materials (D-148): bought when the market has them, sized per main output
    // like the recipe; not in the value-added solve (their cost is under 5 % of output).
    if (spec.optionalInputs !== undefined) {
      definition.optionalInputs = Object.entries(spec.optionalInputs)
        .map(([key, [perOutput, elasticity]]) => ({ goodId: gid(key), quantityPerThroughputUnit: sig(perOutput * outputPerTU), outputElasticity: elasticity }))
        .sort((left, right) => left.goodId - right.goodId);
    }
    if (spec.landUse !== undefined) definition.landUse = spec.landUse;
    if (spec.extracts !== undefined) definition.extracts = spec.extracts;
    if (spec.maxAbsLatitudeDeg !== undefined) definition.maxAbsLatitudeDeg = spec.maxAbsLatitudeDeg;
    if (spec.usesHydroPotential === true) definition.usesHydroPotential = true;
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
    // Gas lighting in 1900 was town gas made from coal (D-148); natural gas was a local
    // fuel of a few US states with no household demand modelled here.
    lighting: { kerosene: 0.45, coal: 0.15, electricity: 0.1, commerce: 0.3 },
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
  // D-148 item 13: cloth demand at the 1900 world fibre supply (TEXTILE_CALIBRATION).
  for (const tier of needs) {
    for (const item of tier.items) {
      if (item.goodKey !== "clothing" && item.goodKey !== "textiles") continue;
      const before = item.quantityPerCapitaPerDay;
      item.quantityPerCapitaPerDay = sig(before * TEXTILE_CALIBRATION.clothDemandFactor);
      needsTrace[`${tier.tier}:${item.goodKey}`] = { quantityPerCapitaPerDay: item.quantityPerCapitaPerDay, p2bQuantityPerCapitaPerDay: before, factor: TEXTILE_CALIBRATION.clothDemandFactor, status: "estimated" };
    }
  }
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

  // D-148: dairy, produce, sugar and coffee-tea-cocoa take their share of the comfort and
  // luxury processed-food value by the 1901 food-article weights (Commissioner of Labor
  // 1903, p. 651): the four groups against bread, condiments and other food, which stay
  // processed food. Grain, meat and fish quantities are unchanged; total spending at
  // reference prices is unchanged.
  const articles = src.foodArticles1901.weights;
  const FOOD_GROUPS = {
    dairy: ["eggs", "milk", "butter", "cheese"],
    produce: ["potatoes", "other-vegetables", "fruit"],
    sugar: ["sugar", "molasses"],
    "coffee-tea-cocoa": ["tea", "coffee"],
  };
  const PROCESSED_KEPT = ["bread", "vinegar-pickles-condiments", "other-food"];
  const groupWeight = Object.fromEntries(Object.entries(FOOD_GROUPS).map(([key, list]) => [key, list.reduce((acc, item) => acc + articles[item], 0)]));
  const newFoodWeight = Object.values(groupWeight).reduce((acc, value) => acc + value, 0);
  const keptWeight = PROCESSED_KEPT.reduce((acc, item) => acc + articles[item], 0);
  const carvedShare = newFoodWeight / (newFoodWeight + keptWeight);
  const foodTrace = { carvedShareOfProcessedFood: carvedShare, groupWeights: groupWeight, keptWeight, rowIds: ["commissioner-labor-1903"], status: "provisional", tiers: {} };
  for (const tierName of ["comfort", "luxury"]) {
    const tier = needs.find((entry) => entry.tier === tierName);
    const processed = tier.items.find((item) => item.goodKey === "food-products");
    const value = processed.quantityPerCapitaPerDay * priceRusd("food-products");
    const carved = value * carvedShare;
    processed.quantityPerCapitaPerDay = sig(processed.quantityPerCapitaPerDay * (1 - carvedShare));
    const added = {};
    for (const [key, weight] of Object.entries(groupWeight)) {
      const quantity = sig((carved * weight) / newFoodWeight / priceRusd(key));
      tier.items.push({ goodKey: key, quantityPerCapitaPerDay: quantity });
      added[key] = quantity;
    }
    foodTrace.tiers[tierName] = { processedFoodValueRUSD: sig(value), carvedRUSD: sig(carved), added };
  }
  // D-152: jewellery is a luxury need. Its per-capita quantity makes the 1900 luxury-tier
  // population buy the new metal the world's jewellers worked in 1900.
  const luxuryTier = needs.find((entry) => entry.tier === "luxury");
  const luxuryPopulation = read(INPUTS.p2bPops).reduce((acc, pop) => acc + (pop.wealthLevel >= luxuryTier.activationWealthMin ? pop.population : 0), 0);
  const jewelleryPerCapitaDay = sig(jewelleryMetal.unitsPerYear / 365 / luxuryPopulation);
  luxuryTier.items.push({ goodKey: "jewellery", quantityPerCapitaPerDay: jewelleryPerCapitaDay });
  needsTrace["luxury:jewellery"] = {
    quantityPerCapitaPerDay: jewelleryPerCapitaDay,
    rusdPerCapitaPerDay: sig(jewelleryPerCapitaDay * priceRusd("jewellery")),
    luxuryPopulation,
    newGoldKgPerYear: sig(jewelleryMetal.newGoldKgPerYear),
    newSilverKgPerYear: sig(jewelleryMetal.newSilverKgPerYear),
    jewelleryUnitsPerYear: sig(jewelleryMetal.unitsPerYear),
    metalShare: jewelleryMetal.metalShare,
    rowIds: ["mint-1901-arts", "jewellery-metal-share-of-value"],
    status: "provisional",
  };
  for (const tier of needs) tier.items.sort((left, right) => gid(left.goodKey) - gid(right.goodKey));

  const calibration = {
    generator: "scripts/p5b/build-goods-1900.mjs",
    decision: "D-146",
    rusdPerUsd1900,
    prices: priceTrace,
    recipes: recipeTrace,
    needs: needsTrace,
    foodArticles: foodTrace,
    budgetCategoryGoods: CATEGORY_GOODS,
  };
  const stageB = placeAndCalibrate({ goods, definitions, needs, oldNeeds, professions, p5Definitions, p2b, p2bRow, technology, src, calibration, gid });
  return {
    "goods_1900.json": json(goods),
    "buildings_definitions_1900.json": json(definitions),
    "needs_1900.json": json(needs),
    "calibration_1900.json": json(calibration),
    ...stageB.outputs,
  };
}

/**
 * Stage B (D-148): overlays (latitude, A9 grants), placement, warehouses, opening stock,
 * fiscal values and route capacities. Mutates `definitions` (warehouse capacity) and
 * `calibration` (placement report and coverage).
 */
function placeAndCalibrate({ goods, definitions, needs, oldNeeds, professions, p5Definitions, p2bRow, technology, src, calibration, gid }) {
  const p2bCalibration = read(INPUTS.p2bCalibration);
  // B1: provinces with |label latitude| (crop bands, C-8).
  const labelLatitude = new Map();
  for (const key of ["mapEurope", "mapAfrica", "mapAmericas", "mapAsia", "mapOceania"]) {
    for (const province of read(INPUTS[key]).provinces) {
      if (Array.isArray(province.label)) labelLatitude.set(province.id, Math.abs(province.label[1]));
    }
  }
  // C-12: gross theoretical hydro potential (MWh/year) where the rivers have any.
  const hydroPotential = new Map(read(INPUTS.hydro).provinces.map((entry) => [entry.provinceId, entry.grossMWhPerYear]));
  const provinces = read(INPUTS.p5Provinces).map((province) => {
    const latitude = labelLatitude.get(province.id);
    if (latitude === undefined) throw new Error(`province ${province.id} has no map label`);
    const hydro = hydroPotential.get(province.id);
    return { ...province, absLatitudeDeg: round(latitude, 3), ...(hydro > 0 ? { hydroPotentialMWhPerYear: hydro } : {}) };
  });
  // B2: countries with sourced 1900 production of a gated good know its gate (A9, C-1).
  const oldCountries = read(INPUTS.p5Countries);
  const technologyKeys = new Set(technology.technologies.map((entry) => entry.key));
  const grants = new Map();
  for (const evidence of src.technologyEvidence) {
    if (!technologyKeys.has(evidence.technologyKey)) throw new Error(`unknown technology ${evidence.technologyKey}`);
    if (!oldCountries.some((country) => country.tag === evidence.countryTag)) throw new Error(`unknown country ${evidence.countryTag}`);
    const list = grants.get(evidence.countryTag) ?? [];
    if (!list.includes(evidence.technologyKey)) list.push(evidence.technologyKey);
    grants.set(evidence.countryTag, list);
  }
  const technologyOrder = new Map(technology.technologies.map((entry, index) => [entry.key, index]));
  const grantedCountries = oldCountries.map((country) => {
    const added = (grants.get(country.tag) ?? []).filter((key) => !country.technology.researchedTechnologyKeys.includes(key));
    if (added.length === 0) return country;
    const keys = [...country.technology.researchedTechnologyKeys, ...added].sort((left, right) => technologyOrder.get(left) - technologyOrder.get(right));
    return { ...country, technology: { ...country.technology, researchedTechnologyKeys: keys }, sourceIds: [...new Set([...country.sourceIds, "p5b-catalogue"])] };
  });

  const markets = read(INPUTS.p2bMarkets);
  const rowValue = (id) => p2bRow(id);
  // D-149: the 1900 metal-standard authorities (Director of the Mint, 1 January 1901).
  // A row that is one simulated country with its own gold or silver currency (P3) is
  // activated; aggregates, dependencies and paper currencies are reported, not split.
  const p3 = read(INPUTS.p3Currencies);
  const marketOfCountryTag = new Map(markets.map((market) => [market.customsCountryTag, market]));
  const mintRows = [];
  const mintNotActivated = [];
  for (const [key, name, , gold, silverFull, silverLimited, paper] of src.monetaryStocks1901.rows) {
    const country = p3.countries.find((entry) => entry.tag === key);
    const standard = country?.currency?.standard;
    if (country === undefined || country.arrangement !== "own" || (standard !== "gold" && standard !== "silver")) {
      mintNotActivated.push({ key, name, reason: country === undefined ? "not one simulated country (aggregate or dependency)" : country.arrangement !== "own" ? "no own currency" : `${standard} currency (only metal standards are activated)` });
      continue;
    }
    const usdPerGram = p3.metals[standard].usdPerFineGram;
    const metalUSD = (standard === "gold" ? gold : silverFull + silverLimited) * 1e6;
    mintRows.push({ countryTag: key, standard, goldUSD: gold * 1e6, silverUSD: (silverFull + silverLimited) * 1e6, uncoveredPaperUSD: paper * 1e6, metalReserveKg: metalUSD / (usdPerGram * 1000) });
  }

  // D-149 "treasury, capped" (designer, 2026-11-07): each mint opens with one year of its
  // country's sourced 1900 output of its standard metal at the reference price, at most
  // MINT_FUNDING_TREASURY_SHARE of its opening treasury (the P5 treasury, so the cap does
  // not depend on the placement it sizes); the treasury pays it. The mint's purchases of
  // that cash over a year are the modelled 1900 demand of the gold and silver mines
  // (plan §13.7), in the mint's home market.
  const territoryOfCountry = new Map();
  for (const country of grantedCountries) {
    for (const id of country.provinceIds) {
      const territory = provinces.find((province) => province.id === id)?.territoryKey;
      if (territory !== undefined) territoryOfCountry.set(territory, country.tag);
    }
  }
  for (const row of mintRows) {
    const country = oldCountries.find((entry) => entry.tag === row.countryTag);
    const output = src.outputs1900[row.standard].entries
      .filter(([territory]) => territoryOfCountry.get(territory) === row.countryTag)
      .reduce((acc, [, kg]) => acc + kg, 0);
    const price = goods[gid(row.standard)].basePrice1900RUSD;
    row.ownOutputKg1900 = output;
    row.ownOutputValueRUSD = output * price;
    row.treasuryCapRUSD = MINT_FUNDING_TREASURY_SHARE * (country?.initialTreasuryCashRUSD ?? 0);
    row.reserveFundingRUSD = round(Math.min(row.ownOutputValueRUSD, row.treasuryCapRUSD), 2);
    row.mintDemandKgPerDay = row.reserveFundingRUSD / 365 / (price * (1 - MINT_CHARGE));
  }
  const mintDemand = new Map();
  for (const row of mintRows) {
    const market = markets.find((entry) => entry.customsCountryTag === row.countryTag);
    const country = grantedCountries.find((entry) => entry.tag === row.countryTag);
    const home = provinces.find((province) => province.id === country?.provinceIds[0])?.territoryKey;
    if (market === undefined || home === undefined || !(row.mintDemandKgPerDay > 0)) continue;
    const key = `${market.key}|${home}`;
    const goodsDemand = mintDemand.get(key) ?? new Map();
    goodsDemand.set(gid(row.standard), (goodsDemand.get(gid(row.standard)) ?? 0) + row.mintDemandKgPerDay);
    mintDemand.set(key, goodsDemand);
  }

  const placement = placeCatalogue({
    goods,
    definitions,
    oldDefinitions: p5Definitions,
    needs,
    oldNeeds,
    professions,
    provinces,
    pops: read(INPUTS.p2bPops),
    countries: grantedCountries,
    oldCountries,
    markets,
    buildings: read(INPUTS.p2bBuildings),
    deposits: read(INPUTS.deposits),
    sources: src,
    technology,
    workingAgeShare: p2bCalibration.workingAgeShare,
    fertiliser: { gateKey: "chemical-fertilizer" },
    round,
    extraDemand: mintDemand,
    hydro: {
      technicalShare: HYDRO_TECHNICAL_SHARE,
      daysPerYear: HYDRO_DAYS_PER_YEAR,
      // C-12: the hydro share of 1900 electricity = the water wheels' share of the US
      // central stations' prime movers in 1902 (sourced for the United States, provisional
      // elsewhere), within each province's cap.
      shareOfElectricity:
        src.electricity1902.waterWheelHorsepower /
        (src.electricity1902.waterWheelHorsepower + src.electricity1902.steamEngineHorsepower + src.electricity1902.otherHorsepower),
    },
    territoryCoverage: new Map(Object.entries(p2bCalibration.territories).map(([key, territory]) => [key, { gdp: territory.population * territory.gdpPerHeadRUSD.value, shareBefore: territory.coveredShareOfGdp }])),
    rows: {
      laborShareAgriculture: rowValue("labour-share-agriculture"),
      laborShareManufacturing: rowValue("labour-share-manufacturing"),
      maxInitialEmploymentShare: rowValue("max-initial-employment-share"),
      workingCapitalDays: rowValue("working-capital-days"),
      openingStockDays: rowValue("opening-stock-days"),
      storageHeadroomDays: rowValue("storage-headroom-days"),
      // Plan §8: territories whose P2b coverage was at least 80 % of GDP cap new sectors
      // at the residual (provisional rule, D-148).
      residualCapCoverage: 0.8,
    },
  });

  // B7: warehouse capacity per level and good (C-19). The eight P2b goods keep the P2b
  // capacity; every other storable good gets the placement's capacity, rounded up. Gold
  // and silver also hold 5 days of the largest daily mint sale per warehouse level of the
  // mint's home market (D-149: the dealer stores what the mint sells).
  const warehouseLevelsOf = (market) => read(INPUTS.p2bBuildings)
    .filter((row) => row.definitionKey === "warehouse" && market.provinceIds.includes(row.provinceId))
    .reduce((acc, row) => acc + row.level, 0);
  for (const row of mintRows) {
    const market = marketOfCountryTag.get(row.countryTag);
    const levels = market === undefined ? 0 : warehouseLevelsOf(market);
    if (!(levels > 0)) continue;
    const goodId = gid(row.standard);
    const needed = (rowValue("storage-headroom-days") * row.metalReserveKg * MINT_MAX_DAILY_SALE_SHARE) / levels;
    placement.warehouseCapacity.set(goodId, Math.max(placement.warehouseCapacity.get(goodId) ?? 0, needed));
  }
  for (const definition of definitions) {
    if (definition.storageCapacityByGood.length === 0) continue;
    const kept = new Map(definition.storageCapacityByGood.map((item) => [item.goodId, item.quantity]));
    definition.storageCapacityByGood = goods
      .filter((good) => good.storable !== false)
      .map((good) => ({ goodId: good.id, quantity: kept.get(good.id) ?? Math.max(1, Math.ceil(sig(placement.warehouseCapacity.get(good.id) ?? 0))) }));
  }

  // Markets: the opening stock of every storable good (D-136 rule, B8).
  const marketRows = markets.map((market) => ({
    ...market,
    stockLots: placement.lotsByMarket.get(market.key),
    sourceIds: [...new Set([...market.sourceIds, "p5b-catalogue"])],
  }));

  // §8.6: fiscal values that scale with covered value added, recomputed (P2b rule 14).
  const revenueShare = rowValue("us-gov-revenue-share-1902");
  const educationShare = rowValue("us-school-revenue-1900") / rowValue("us-gdp-1900");
  const adminShare = (revenueShare - educationShare) * rowValue("administration-share-of-noneducation-revenue");
  const debtRatio = rowValue("us-gov-debt-1902") / rowValue("us-gdp-1902");
  const money = (value) => round(value, 2);
  const countryRows = grantedCountries.map((country) => {
    const covered = placement.coveredByCountry.get(country.tag) ?? 0;
    const revenue = revenueShare * covered;
    return {
      ...country,
      initialTreasuryCashRUSD: money((revenue * rowValue("treasury-cash-months")) / 12),
      debt: { ...country.debt, maxOutstandingPrincipalRUSD: Math.max(1, money(debtRatio * covered)) },
      politics: { ...country.politics, institutionFundingRUSDPerYear: money(adminShare * covered) },
      technology: { ...country.technology, educationFundingRUSDPerYear: money(educationShare * covered) },
      sourceIds: [...new Set([...country.sourceIds, "p5b-catalogue"])],
    };
  });
  const authorities = mintRows.map((row) => ({
    countryTag: row.countryTag,
    standard: row.standard,
    goldUSD: row.goldUSD,
    silverUSD: row.silverUSD,
    uncoveredPaperUSD: row.uncoveredPaperUSD,
    reserveFundingRUSD: row.reserveFundingRUSD,
    trace: {
      metalReserveKg: row.metalReserveKg,
      ownOutputKg1900: row.ownOutputKg1900,
      ownOutputValueRUSD: row.ownOutputValueRUSD,
      treasuryCapRUSD: row.treasuryCapRUSD,
      capped: row.ownOutputValueRUSD > row.treasuryCapRUSD,
      mintDemandKgPerDay: row.mintDemandKgPerDay,
    },
  }));
  const monetaryFile = {
    description: "D-140 / D-149: the 1900 metal-standard authorities. Money stocks on 1 January 1901 in US dollars (Director of the Mint, 1901, pp. 42-43; sources_1900.json monetaryStocks1901); reserve funding = min(one year of the country's sourced 1900 output of its standard metal x reference price, MINT_FUNDING_TREASURY_SHARE x opening treasury) in RUSD. The loader derives fine content, metal kg and circulation from the P3 currency table.",
    generator: "scripts/p5b/build-goods-1900.mjs",
    treasuryShare: MINT_FUNDING_TREASURY_SHARE,
    authorities,
    notActivated: mintNotActivated,
  };
  calibration.monetary = { treasuryShare: MINT_FUNDING_TREASURY_SHARE, authorities, notActivated: mintNotActivated };

  // Routes: P2b rule 15 with the new coverage.
  const routeRows = read(INPUTS.p2bRoutes).map((route) => {
    const smaller = Math.min(placement.coveredByMarket.get(route.marketAKey) ?? 0, placement.coveredByMarket.get(route.marketBKey) ?? 0);
    return { ...route, baseCapacityRUSDPerDay: money(Math.max(1, (smaller / 365) * rowValue("route-capacity-share"))), sourceIds: [...new Set([...route.sourceIds, "p5b-catalogue"])] };
  });

  // Coverage before (P2b) and after.
  const coverage = { territories: {}, countries: {}, world: {} };
  let worldBefore = 0;
  let worldAfter = 0;
  let worldGdp = 0;
  for (const [key, territory] of Object.entries(p2bCalibration.territories)) {
    const gdp = territory.population * territory.gdpPerHeadRUSD.value;
    const before = territory.coveredValueAddedRUSDPerYear;
    const after = placement.coveredByTerritory.get(key) ?? 0;
    worldBefore += before;
    worldAfter += after;
    worldGdp += gdp;
    coverage.territories[key] = {
      gdpRUSDPerYear: gdp,
      coveredBeforeRUSDPerYear: before,
      coveredAfterRUSDPerYear: after,
      shareBefore: gdp > 0 ? before / gdp : 0,
      shareAfter: gdp > 0 ? after / gdp : 0,
      jobsAfter: placement.jobsByTerritory[key] ?? {},
    };
  }
  for (const [tag, entry] of Object.entries(p2bCalibration.countries)) {
    coverage.countries[tag] = { coveredBeforeRUSDPerYear: entry.coveredValueAddedRUSDPerYear, coveredAfterRUSDPerYear: placement.coveredByCountry.get(tag) ?? 0 };
  }
  coverage.world = { gdpRUSDPerYear: worldGdp, coveredBeforeRUSDPerYear: worldBefore, coveredAfterRUSDPerYear: worldAfter, shareBefore: worldBefore / worldGdp, shareAfter: worldAfter / worldGdp };

  // Modelled / sourced output per good (A5 report).
  const sourcedOutput = {};
  for (const [key, entry] of Object.entries(src.outputs1900)) {
    const good = goods.find((candidate) => candidate.key === key);
    if (good === undefined) continue;
    const toSimUnit =
      key === "jewellery"
        ? {
            factor: 1 / src.units.find((row) => row.id === "jewellery-metal-share-of-value").value,
            note: "gross metal dollars / the metal share of value = jewellery units (includes old material; report only)",
          }
        : OUTPUT_UNIT_TO_SIM[entry.unit];
    const total = entry.entries.reduce((acc, [territory, value]) => acc + (AGGREGATE_OUTPUT_KEYS.has(territory) ? 0 : value), 0);
    const modelledPerYear = (placement.worldOutput.get(good.id) ?? 0) * 365;
    sourcedOutput[key] = {
      sourcedPerYearSimUnits: toSimUnit === undefined ? null : total * toSimUnit.factor,
      conversion: toSimUnit?.note ?? `no conversion from ${entry.unit}`,
      modelledPerYear,
      modelledOverSourced: toSimUnit === undefined ? null : modelledPerYear / (total * toSimUnit.factor),
      note: "sourced total excludes aggregate rows ('other'); D-146 A5 sizes the world level by modelled demand",
    };
  }
  // A12 crops (D-148 additions, item 9): modelled output against the world estimate.
  for (const [key, entry] of Object.entries(placement.report.goods)) {
    if (entry.a12 === undefined) continue;
    const good = goods.find((candidate) => candidate.key === key);
    const modelledPerYear = (placement.worldOutput.get(good.id) ?? 0) * 365;
    sourcedOutput[key] = {
      sourcedPerYearSimUnits: entry.a12.worldKgPerYear,
      conversion: key === "coffee-tea-cocoa" ? "kg; world estimate of crops1900 (A12; coffee, tea and cocoa combined by kg)" : "kg; world estimate of crops1900 (A12)",
      modelledPerYear,
      modelledOverSourced: modelledPerYear / entry.a12.worldKgPerYear,
      note: "world estimate of the crops (or the recorded sum where none exists); D-146 A5 sizes the world level by modelled demand",
    };
  }
  calibration.placement = {
    method: "scripts/p5b/placement.mjs (D-148)",
    notPlaced1900: NOT_PLACED_1900,
    grants: Object.fromEntries([...grants].sort((left, right) => left[0].localeCompare(right[0]))),
    ...placement.report,
    modelledOverSourced: sourcedOutput,
    warehouseCapacityPerLevel: Object.fromEntries([...placement.warehouseCapacity].map(([goodId, value]) => [goods[goodId].key, value])),
  };
  calibration.coverage = coverage;

  return {
    outputs: {
      "provinces_1900.json": json(provinces),
      "countries_1900.json": json(countryRows),
      "buildings_1900.json": json(placement.buildingRows),
      "markets_1900.json": json(marketRows),
      "trade_routes_1900.json": json(routeRows),
      "monetary_1900.json": json(monetaryFile),
    },
  };
}

const AGGREGATE_OUTPUT_KEYS = new Set(["other", "other-europe"]);
/** Unit of a sourced output table -> simulation unit of the good (report only). */
const OUTPUT_UNIT_TO_SIM = {
  "metric tons": { factor: 1, note: "metric tons = t" },
  "metric tons of pig iron": { factor: 1, note: "pig iron t ~ t Fe of ore (about 0.93 Fe in pig iron; report only)" },
  "metric tons of copper": { factor: 1, note: "t Cu" },
  "kg fine": { factor: 1, note: "kg" },
  kg: { factor: 1, note: "kg" },
  "metric tons of sodium nitrate": { factor: 0.1647, note: "t NaNO3 x 0.1647 N" },
  "long tons": { factor: 1016.047, note: "long tons x 1,016.047 kg" },
  "thousand bales of 500 lb": { factor: 226796.185, note: "thousand bales x 500 lb x 0.45359237 kg" },
  lb: { factor: 0.45359237, note: "lb x 0.45359237 kg" },
  "bales of 500 lb gross (478 lb lint)": { factor: 478 * 0.45359237, note: "bales x 478 lb of lint x 0.45359237 kg" },
};

const outputs = build();
const DOC = join(ROOT, "docs/P5B_BEFORE_AFTER.md");
const docText = beforeAfterReport(JSON.parse(outputs["calibration_1900.json"]));
const PROVENANCE = join(ROOT, "docs/P5B_GOODS_PROVENANCE.md");
const provenanceText = goodsProvenance(JSON.parse(outputs["goods_1900.json"]), JSON.parse(outputs["calibration_1900.json"]), read(INPUTS.sources), read(INPUTS.hydro).meta);
const inputSums = Object.fromEntries(Object.entries(INPUTS).map(([key, path]) => [key, sha256(readText(path))]));
outputs["build_report.json"] = json({
  generator: "scripts/p5b/build-goods-1900.mjs",
  inputs: inputSums,
  outputs: Object.fromEntries(Object.entries(outputs).map(([name, text]) => [name, sha256(text)])),
});

if (CHECK) {
  const stale = Object.entries(outputs).filter(([name, text]) => !existsSync(join(OUT, name)) || readText(join(OUT, name)) !== text);
  if (!existsSync(DOC) || readText(DOC) !== docText) stale.push(["docs/P5B_BEFORE_AFTER.md"]);
  if (!existsSync(PROVENANCE) || readText(PROVENANCE) !== provenanceText) stale.push(["docs/P5B_GOODS_PROVENANCE.md"]);
  if (stale.length > 0) {
    console.error(`P5b outputs are stale: ${stale.map(([name]) => name).join(", ")}; run node scripts/p5b/build-goods-1900.mjs`);
    process.exit(1);
  }
  console.log("P5b outputs are current");
} else {
  mkdirSync(OUT, { recursive: true });
  for (const [name, text] of Object.entries(outputs)) writeFileSync(join(OUT, name), text);
  writeFileSync(DOC, docText);
  writeFileSync(PROVENANCE, provenanceText);
  console.log(`wrote ${Object.keys(outputs).length} files to ${OUT}, docs/P5B_BEFORE_AFTER.md and docs/P5B_GOODS_PROVENANCE.md`);
}

/** docs/P5B_GOODS_PROVENANCE.md: every good's reference price with its rows (generated). */
function goodsProvenance(goods, calibration, sources, hydroMeta) {
  const rowCitation = new Map();
  for (const row of [...sources.prices1900, ...(sources.prices1990 ?? []), ...sources.units]) rowCitation.set(row.id, `${row.sourceId ?? ""}${row.locator ? `, ${row.locator}` : ""}`);
  const sourceTitle = new Map(sources.sources.map((source) => [source.id, `${source.title}${source.licence ?? source.license ? ` (${source.licence ?? source.license})` : ""}`]));
  const lines = [];
  lines.push("# P5b goods provenance");
  lines.push("");
  lines.push("Generated by `node scripts/p5b/build-goods-1900.mjs` from `packages/data/data/historical/p5b/sources_1900.json` and the builder's trace (`calibration_1900.json`); do not edit by hand. Reference prices are RUSD per simulation unit: a 1900 good's 1900 US price × 15.704 (CPI 1990 / CPI 1900, D-130); a later good's 1990 US producer price; a defined unit's definition (D-146 C-6). Status `provisional` marks a weight, conversion or placeholder still to be sourced.");
  lines.push("");
  lines.push("## Reference prices");
  lines.push("");
  lines.push("| Id | Good | Unit | Group | Reference price (RUSD) | Basis | Status | Formula | Rows |");
  lines.push("|---:|---|---|---|---:|---|---|---|---|");
  for (const good of goods) {
    const trace = calibration.prices[good.key] ?? {};
    lines.push(`| ${good.id} | ${good.name} | ${good.unitLabel} | ${good.group} | ${good.basePrice1900RUSD} | ${good.priceBasis} | ${trace.status ?? "—"} | ${(trace.formula ?? "").replace(/\|/g, "/")} | ${(trace.rowIds ?? []).join(", ") || "—"} |`);
  }
  lines.push("");
  lines.push("## Source rows");
  lines.push("");
  const used = new Set(Object.values(calibration.prices).flatMap((trace) => trace.rowIds ?? []));
  for (const id of [...used].sort()) lines.push(`- \`${id}\`: ${rowCitation.get(id) ?? "P2b row (historical/p2b/sources_1900.json)"}`);
  lines.push("");
  lines.push("## Sources");
  lines.push("");
  for (const [id, title] of [...sourceTitle].sort((left, right) => left[0].localeCompare(right[0]))) lines.push(`- \`${id}\`: ${title}`);
  lines.push("");
  lines.push("## 1900 placement basis");
  lines.push("");
  lines.push("World level from modelled demand (D-146 A5); territory shares as below (D-148).");
  lines.push("");
  for (const [key, entry] of Object.entries(calibration.placement.goods)) if (entry.basis) lines.push(`- ${key}: ${entry.basis}`);
  lines.push("");
  // C-12 (D-146 A8): attribution and licence of the hydro dataset, as its licence requires.
  lines.push("## Hydro potential (C-12)");
  lines.push("");
  lines.push(`Province hydro potential (\`historical/p5b/hydro_province_1900.json\`, from \`${hydroMeta.generator}\`) is derived from **${hydroMeta.dataset}**: ${hydroMeta.citation}. Attributes: ${hydroMeta.attributeSources}. Source: ${hydroMeta.url}, ${hydroMeta.file}, accessed ${hydroMeta.accessDate}. Licence: **${hydroMeta.licence}**; the derived table is an adaptation (aggregated to the game's 1900 provinces), and the raw data are not redistributed.`);
  lines.push("");
  lines.push(`Method: ${hydroMeta.method}. Unit: ${hydroMeta.unit}. World gross potential ${hydroMeta.grossWorldPWhPerYear} PWh/year (${hydroMeta.grossUnplacedPWhPerYear} unplaced; ${hydroMeta.grossHeadwatersPWhPerYear} from headwater reaches).`);
  lines.push("");
  for (const limitation of hydroMeta.limitations) lines.push(`- ${limitation}`);
  const electricity = calibration.placement.goods.electricity;
  if (electricity?.hydroPerDay !== undefined) {
    lines.push(`- 1900 hydro stations generate ${Number(electricity.hydroPerDay.toPrecision(4)).toLocaleString("en-US")} MWh a day of the ${Number(electricity.placedPerDay.toPrecision(4)).toLocaleString("en-US")} MWh placed (the 1902 US water-wheel share, within each province's cap).`);
  }
  lines.push("");
  lines.push("The Hoes et al. (2017) site dataset (4TU.ResearchData) was not used: its General Terms of Use allow reuse only for non-commercial purposes (designer, 2026-11-08).");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

/** docs/P5B_BEFORE_AFTER.md from the calibration trace (generated; do not edit by hand). */
function beforeAfterReport(calibration) {
  const pct = (value) => (value === null || value === undefined || !Number.isFinite(value) ? "—" : `${(100 * value).toFixed(1)} %`);
  const bn = (value) => (value / 1e9).toLocaleString("en-US", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  const num = (value) => (value === null || value === undefined ? "—" : Number(value.toPrecision(4)).toLocaleString("en-US"));
  const { coverage, placement } = calibration;
  const lines = [];
  lines.push("# P5b before and after — covered GDP and 1900 output");
  lines.push("");
  lines.push("Generated by `node scripts/p5b/build-goods-1900.mjs` from `packages/data/data/historical/p5b/calibration_1900.json`; do not edit by hand. \"Before\" is the P2b/P5 world (8 goods); \"after\" is the P5b world (58 goods) with the placement of D-148. Values are RUSD per year at opening prices (value added of the represented sectors).");
  lines.push("");
  lines.push("## World");
  lines.push("");
  lines.push("| | Before | After |");
  lines.push("|---|---:|---:|");
  lines.push(`| Covered value added (bn RUSD) | ${bn(coverage.world.coveredBeforeRUSDPerYear)} | ${bn(coverage.world.coveredAfterRUSDPerYear)} |`);
  lines.push(`| Share of GDP (${bn(coverage.world.gdpRUSDPerYear)} bn) | ${pct(coverage.world.shareBefore)} | ${pct(coverage.world.shareAfter)} |`);
  lines.push("");
  lines.push("## Covered share of GDP by territory");
  lines.push("");
  lines.push("Territories above 100 % after P5b are listed first; then the largest economies.");
  lines.push("");
  lines.push("| Territory | GDP (bn RUSD) | Before | After |");
  lines.push("|---|---:|---:|---:|");
  const territories = Object.entries(coverage.territories);
  const over = territories.filter(([, entry]) => entry.shareAfter > 1).sort((left, right) => right[1].shareAfter - left[1].shareAfter);
  const largest = territories.filter(([, entry]) => !(entry.shareAfter > 1)).sort((left, right) => right[1].gdpRUSDPerYear - left[1].gdpRUSDPerYear).slice(0, 30);
  for (const [key, entry] of [...over, ...largest]) lines.push(`| ${key} | ${bn(entry.gdpRUSDPerYear)} | ${pct(entry.shareBefore)} | ${pct(entry.shareAfter)} |`);
  lines.push("");
  lines.push(`${over.length} of ${territories.length} territories are above 100 % after P5b (plan §8: the overshoot comes mostly from the P2b farm-gate demand, a D-135 distortion left to P6).`);
  lines.push("");
  lines.push("## Modelled ÷ sourced 1900 output (D-146 A5)");
  lines.push("");
  lines.push("| Good | Sourced per year | Modelled per year | Modelled ÷ sourced | Conversion |");
  lines.push("|---|---:|---:|---:|---|");
  for (const [key, entry] of Object.entries(placement.modelledOverSourced)) {
    lines.push(`| ${key} | ${num(entry.sourcedPerYearSimUnits)} | ${num(entry.modelledPerYear)} | ${entry.modelledOverSourced === null ? "—" : entry.modelledOverSourced.toFixed(2)} | ${entry.conversion} |`);
  }
  lines.push("");
  lines.push("## A12 crops: coverage and placement (D-148 additions, item 9)");
  lines.push("");
  lines.push("Recorded 1900 output (production, or exports and receipts as a provisional proxy) against each crop's world estimate, kg per year (`sources_1900.json` `crops1900`). \"Before\" is the first transcription set (batch 1); \"after\" adds batch 2. The world estimates are those of batch 2 in both columns (tea has no world total: its figure is the recorded sum).");
  lines.push("");
  lines.push("| Crop | Good | Recorded before | Recorded after | World estimate | Coverage before | Coverage after |");
  lines.push("|---|---|---:|---:|---:|---:|---:|");
  const a12Goods = Object.entries(placement.goods).filter(([, entry]) => entry.a12 !== undefined);
  for (const [key, entry] of a12Goods) {
    for (const [crop, row] of Object.entries(entry.a12.crops)) {
      lines.push(`| ${crop} | ${key} | ${num(row.recordedBatch1Kg)} | ${num(row.recordedKg)} | ${num(row.worldKg)}${row.worldEstimateKg === null ? " (recorded sum)" : ""} | ${pct(row.recordedBatch1Kg / row.worldKg)} | ${pct(row.recordedKg / row.worldKg)} |`);
    }
  }
  lines.push("");
  lines.push(`Rule: a good uses its sourced shares when the recorded producers that can host its producer in the 1900 world hold at least ${pct(a12Goods[0]?.[1].a12.minCoverage)} of the world estimate. Producers the sources name without a figure (China and Japan's own tea; China, Persia, most of Central America and the West Indies for tobacco) first make their own demand; the rest of world demand goes to the recorded producers in proportion to their kg; the share no recorded producer holds keeps the local-and-pooled rule.`);
  lines.push("");
  lines.push("| Good | Coverage before | Coverage after (hostable) | Placement before | Placement after | Own demand of self-supplied producers per day | By sourced shares per day | Local and pooled per day |");
  lines.push("|---|---:|---:|---|---|---:|---:|---:|");
  for (const [key, entry] of a12Goods) {
    const a = entry.a12;
    lines.push(`| ${key} | ${pct(a.coverageBatch1)} | ${pct(a.coverage)} | local demand, then pooled worldwide by province weight (D-148) | ${a.usesSourcedShares ? "sourced shares" : "local and pooled (coverage below the rule)"} | ${num(a.selfSuppliedPerDay ?? 0)} | ${num(a.sharesPerDay ?? 0)} | ${num(a.residualPerDay ?? entry.worldDemandPerDay)} |`);
  }
  lines.push("");
  lines.push("## World balance at opening prices (per day)");
  lines.push("");
  lines.push("Output against modelled demand (households, recipe inputs, maintenance, fertiliser). Joint products (refinery petrol and fuel oil, ranch wool) and goods with no 1900 producer show the gaps.");
  lines.push("");
  lines.push("| Good | Demand | Output | Output ÷ demand | Placement basis |");
  lines.push("|---|---:|---:|---:|---|");
  for (const [key, entry] of Object.entries(placement.worldBalance)) {
    lines.push(`| ${key} | ${num(entry.demandPerDay)} | ${num(entry.outputPerDay)} | ${entry.outputOverDemand === null ? "—" : entry.outputOverDemand.toFixed(3)} | ${placement.goods[key]?.basis ?? (["grain", "livestock", "fish", "wool", "textiles", "clothing", "food-products"].includes(key) ? "P2b producers" : "joint output only (no 1900 buyer)")} |`);
  }
  lines.push("");
  lines.push("## Residual cap (plan §8)");
  lines.push("");
  lines.push("Territories whose P2b coverage was at least 80 % of GDP: the new sectors are capped at GDP minus the value added of the P2b sectors. The output they would have made is not reallocated; their markets import it or go short.");
  lines.push("");
  lines.push("| Territory | P2b share | Factor | Largest output lost per day |");
  lines.push("|---|---:|---:|---|");
  for (const [key, entry] of Object.entries(placement.residualCap ?? {})) {
    const lost = Object.entries(entry.outputLostPerDay).sort((left, right) => right[1] - left[1]).slice(0, 4).map(([good, value]) => `${good} ${num(value)}`).join(", ");
    lines.push(`| ${key} | ${pct(entry.shareBefore)} | ${entry.factor.toFixed(3)} | ${lost} |`);
  }
  lines.push("");
  lines.push("## Not placed in 1900");
  lines.push("");
  for (const [key, reason] of Object.entries(placement.notPlaced1900)) lines.push(`- \`${key}\`: ${reason}.`);
  lines.push("");
  lines.push("## Sourced producers that could not host the producer");
  lines.push("");
  let any = false;
  for (const [key, entry] of Object.entries(placement.goods)) {
    for (const item of entry.unplaced ?? []) {
      any = true;
      lines.push(`- ${key}: ${item.territory ?? "world"} — ${item.reason}${item.sourcedShare === undefined ? "" : ` (sourced ${num(item.sourcedShare)})`}${item.quantity === undefined ? "" : ` (${num(item.quantity)} per day)`}.`);
    }
  }
  if (!any) lines.push("None.");
  lines.push("");
  lines.push("## Technology grants (D-146 A9)");
  lines.push("");
  for (const [tag, keys] of Object.entries(placement.grants)) lines.push(`- ${tag}: ${keys.join(", ")}`);
  lines.push("");
  return `${lines.join("\n")}\n`;
}
