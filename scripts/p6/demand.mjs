/**
 * P6 (D-153): the demand system, incomes and housing of the 1900 world, for the goods
 * builder (`scripts/p5b/build-goods-1900.mjs`, P6 stage). docs/P6_PLAN.md §2–§5.
 *
 * 1. Committed basket per adult equivalent (plan Q2a, Q14): the P2b subsistence food and
 *    basic clothing per person ÷ the 1900 world's adult equivalents per person (Atwater
 *    scale on the P4 age structures), plus a firewood cooking minimum (provisional).
 * 2. Retail margins (plan Q3a): food from the 1901 retail prices paid (Bulletin 59
 *    quantities, the 1901 food-article weights) against the reference prices; other goods
 *    from the C-20 category mixes. A margin is split 0.6 commerce, 0.4 transport
 *    (provisional) for food.
 * 3. Marginal-share knots (plan Q1b, Q2, Q13): one knot per budget set at its mean
 *    consumption ratio x = consumption per adult equivalent ÷ committed cost per adult
 *    equivalent at reference retail prices: Engel's Belgian workers of 1853, the US
 *    wage earners of 1901, the US consumer units of 1990. The shares are the set's local
 *    slopes (weighted least squares of category spending ÷ committed cost on x),
 *    negative slopes set to 0 and the rest renormalised (reported). Rent, shelter and
 *    pensions are not consumption (plan §5). Good weights per knot from each set's
 *    composition (provisional mixes where the set has none).
 * 4. Incomes (plan §2.1): a block's 1900 income per person per day = the province wage
 *    of its profession × participation × the working-age share ÷ 365 (estimate; the
 *    simulation then measures actual income).
 * 5. Housing (plan §4): province persons per dwelling from the census rows by modern
 *    country, dwellings shared by persons × income^ε as the simulation does, and the
 *    1900 dwelling flow = dwellings × (depreciation + stable growth) ÷ 365.
 * 6. Tastes (plan Q16): coffee-tea-cocoa and sugar weights by country from the c. 1901
 *    per-head table, relative to the United States and divided by the relative GDP per
 *    head (income effects belong to the LES).
 *
 * The coefficients below mirror `packages/sim/src/population/constants.ts`; the test
 * `data/world-1900.test.ts` checks that they agree.
 */

/** Mirror of the simulation's coefficients (checked by test). */
export const P6_COEFFICIENTS = {
  marginalPropensityToConsume: { lower: 0.94, middle: 0.85, upper: 0.6 },
  wealthConsumptionRatePerYear: 0.04,
  cashReserveDays: 30,
  dwellingDepreciationRatePerYear: 0.005,
  dwellingIncomeElasticity: 0.46,
};

/** Atwater factors by five-year band (0-4 … 80+), males and females (band means). */
const AE_MALE_BANDS = [0.36, 0.48, 0.7, 0.96, ...Array(13).fill(1)];
const AE_FEMALE_BANDS = [0.36, 0.48, 0.64, 0.8, ...Array(13).fill(0.8)];

/** Firewood cooking minimum, m³ per adult equivalent per day (about 0.15 m³ a year). PROVISIONAL. */
const FIREWOOD_COMMITTED_PER_AE = 0.0004;
/** Split of a food retail margin between commerce and transport. PROVISIONAL. */
const FOOD_MARGIN_COMMERCE_SHARE = 0.6;
/** Retail clothing margin (commerce units per RUSD of clothing at reference). PROVISIONAL. */
const CLOTHING_COMMERCE_RATE = 0.4;

export const CATEGORY_GOODS = {
  food: { sigma: 1.5, subsistence: true, goods: ["grain", "livestock", "fish", "food-products", "dairy", "produce", "sugar", "coffee-tea-cocoa"] },
  clothing: { sigma: 1.2, subsistence: false, goods: ["clothing", "textiles"] },
  "fuel-light": { sigma: 2.0, subsistence: false, goods: ["timber", "coal", "kerosene", "electricity", "natural-gas", "fuel-oil"] },
  "household-goods": { sigma: 2.0, subsistence: false, goods: ["household-goods", "appliances", "radios", "televisions", "computers", "mobile-phones"] },
  tobacco: { sigma: 1.0, subsistence: false, goods: ["tobacco"] },
  transport: { sigma: 1.5, subsistence: false, goods: ["transport-services", "motor-vehicles", "petrol"] },
  services: { sigma: 1.5, subsistence: false, goods: ["personal-services", "communication", "finance-services", "pharmaceuticals", "paper", "jewellery"] },
};
const GATES = {
  electricity: "electrical-generation",
  "natural-gas": "pipelines",
  appliances: "refrigeration",
  radios: "radio",
  televisions: "television",
  computers: "personal-computers",
  "mobile-phones": "mobile-telephony",
  "motor-vehicles": "internal-combustion",
  petrol: "internal-combustion",
};

/** Provisional good mixes inside the non-food categories, by era. */
const MIX_1900 = {
  clothing: { clothing: 0.9, textiles: 0.1 },
  "fuel-light": { coal: 0.45, kerosene: 0.3, timber: 0.2, electricity: 0.05 },
  "household-goods": { "household-goods": 1 },
  tobacco: { tobacco: 1 },
  transport: { "transport-services": 1 },
  services: { "personal-services": 0.55, "finance-services": 0.2, communication: 0.08, pharmaceuticals: 0.07, paper: 0.05, jewellery: 0.05 },
};
const MIX_1990 = {
  clothing: { clothing: 0.9, textiles: 0.1 },
  "fuel-light": { electricity: 0.55, "natural-gas": 0.3, "fuel-oil": 0.1, timber: 0.05 },
  "household-goods": { "household-goods": 0.55, appliances: 0.2, televisions: 0.1, radios: 0.05, computers: 0.05, "mobile-phones": 0.05 },
  tobacco: { tobacco: 1 },
  transport: null, // from the 1990 survey
  services: { "personal-services": 0.5, "finance-services": 0.2, communication: 0.1, pharmaceuticals: 0.12, paper: 0.04, jewellery: 0.04 },
};

const CATEGORIES = Object.keys(CATEGORY_GOODS);
const sum = (values) => values.reduce((acc, value) => acc + value, 0);

/** Weighted least-squares slope of y on x. */
function slope(xs, ys, ws) {
  const w = ws ?? xs.map(() => 1);
  const W = sum(w);
  const mx = sum(xs.map((x, i) => x * w[i])) / W;
  const my = sum(ys.map((y, i) => y * w[i])) / W;
  const cov = sum(xs.map((x, i) => w[i] * (x - mx) * (ys[i] - my)));
  const variance = sum(xs.map((x, i) => w[i] * (x - mx) ** 2));
  return cov / variance;
}

function normalise(table) {
  const total = sum(Object.values(table));
  return Object.fromEntries(Object.entries(table).map(([key, value]) => [key, value / total]));
}

/** Adult equivalents per person of a P4 province (Atwater on its stable age structure). */
export function aeRatioOf(p4Province) {
  const male = p4Province.maleAgeWeights;
  const female = p4Province.femaleAgeWeights;
  let ae = 0;
  let total = 0;
  for (let band = 0; band < 17; band += 1) {
    ae += (male[band] ?? 0) * AE_MALE_BANDS[band] + (female[band] ?? 0) * AE_FEMALE_BANDS[band];
    total += (male[band] ?? 0) + (female[band] ?? 0);
  }
  return ae / total;
}

/**
 * Build the demand system and the P6 inputs of the placement.
 * @returns {{ demandSystem, trace, cRef, quantitiesOf, incomeOf, housing }}
 */
export function buildP6Demand(ctx) {
  const { goods, p6, src, oldNeeds, rusdPerUsd1900, p4, pops, provinces, markets, professions, countries, mpdByTag, knows } = ctx;
  const goodByKey = new Map(goods.map((good) => [good.key, good]));
  const base = (key) => {
    const good = goodByKey.get(key);
    if (good === undefined) throw new Error(`P6: unknown good ${key}`);
    return good.basePrice1900RUSD;
  };
  const trace = { decision: "D-153", rows: {} };

  // 1. World adult equivalents per person and the committed basket.
  const p4ById = new Map(p4.provinces.map((entry) => [entry.provinceId, entry]));
  let persons = 0;
  let aeTotal = 0;
  for (const pop of pops) {
    const entry = p4ById.get(pop.provinceId);
    const ratio = entry === undefined ? 0.75 : aeRatioOf(entry);
    persons += pop.population;
    aeTotal += pop.population * ratio;
  }
  const worldAeRatio = aeTotal / persons;
  const subsistence = oldNeeds.find((tier) => tier.tier === "subsistence");
  const basic = oldNeeds.find((tier) => tier.tier === "basic");
  const committed = {};
  for (const item of subsistence.items) committed[item.goodKey] = item.quantityPerCapitaPerDay / worldAeRatio;
  for (const item of basic.items) committed[item.goodKey] = (committed[item.goodKey] ?? 0) + item.quantityPerCapitaPerDay / worldAeRatio;
  committed.timber = FIREWOOD_COMMITTED_PER_AE;
  trace.committed = { worldAdultEquivalentsPerPerson: worldAeRatio, perAdultEquivalentPerDay: committed, rowIds: ["p2b subsistence and basic tiers", "atwater-1902", "p4 age structures"], firewood: "provisional" };

  // 2. Retail margins.
  const weights = src.foodArticles1901.weights;
  const quantities = p6.retailQuantities1901.articles;
  const familyFood = p6.retailQuantities1901.familyFoodSpendingUSD;
  const kgPerLb = 0.45359237;
  const retailPerKgUSD = (articles) => {
    let spend = 0;
    let kg = 0;
    for (const [article, toKg] of articles) {
      spend += (weights[article] / 10000) * familyFood;
      kg += quantities[article][0] * toKg;
    }
    return spend / kg;
  };
  const lb = kgPerLb;
  const retail = {
    grain: retailPerKgUSD([["flour-and-meal", lb], ["rice", lb]]),
    "food-products": retailPerKgUSD([["flour-and-meal", lb], ["bread", lb], ["rice", lb]]),
    livestock: retailPerKgUSD([["fresh-beef", lb], ["salt-beef", lb], ["fresh-hog-products", lb], ["salt-hog-products", lb], ["other-meat", lb], ["poultry", lb], ["lard", lb]]),
    fish: retailPerKgUSD([["fish", lb]]),
    dairy: retailPerKgUSD([["milk", 0.976]]),
    produce: retailPerKgUSD([["potatoes", 60 * lb]]),
    sugar: retailPerKgUSD([["sugar", lb]]),
    "coffee-tea-cocoa": retailPerKgUSD([["coffee", lb], ["tea", lb]]),
  };
  const margins = {};
  for (const [key, usdPerKg] of Object.entries(retail)) {
    const rate = Math.max(0, (usdPerKg * rusdPerUsd1900) / base(key) - 1);
    margins[key] = { commerce: FOOD_MARGIN_COMMERCE_SHARE * rate * base(key), transport: (1 - FOOD_MARGIN_COMMERCE_SHARE) * rate * base(key), rate, status: "sourced" };
  }
  // Non-food (C-20 mixes: the good's share of retail value against commerce and transport).
  const c20 = (key, goodShare, commerceShare, transportShare) => {
    margins[key] = { commerce: (commerceShare / goodShare) * base(key), transport: (transportShare / goodShare) * base(key), rate: (commerceShare + transportShare) / goodShare, status: "provisional" };
  };
  c20("coal", 0.2, 0.3, 0.45);
  c20("timber", 0.2, 0.3, 0.45);
  c20("kerosene", 0.45, 0.3, 0);
  c20("household-goods", 0.6, 0.3, 0.1);
  c20("tobacco", 0.25, 0.75, 0);
  c20("paper", 0.2, 0.2, 0);
  margins.clothing = { commerce: CLOTHING_COMMERCE_RATE * base("clothing"), transport: 0, rate: CLOTHING_COMMERCE_RATE, status: "provisional" };
  trace.margins = { retailUSDPerKg1901: retail, byGood: margins, rowIds: ["bls-bulletin-59 p. 165", "commissioner-labor-1903 p. 651 food-article weights", "C-20 category mixes"] };
  const marginOf = (key) => margins[key] ?? { commerce: 0, transport: 0 };

  // Committed cost per adult equivalent at reference retail prices (urban household).
  const retailRef = (key) => base(key) + marginOf(key).commerce * base("commerce") + marginOf(key).transport * base("transport-services");
  const cRef = sum(Object.entries(committed).map(([key, quantity]) => quantity * retailRef(key)));
  trace.committedCostPerAdultEquivalentRUSD = cRef;

  // 3. Knots.
  const knots = [];
  const fits = {};
  const addKnot = (name, xs, spendByCategory, ws, goodWeights) => {
    const shares = {};
    for (const category of CATEGORIES) {
      const ys = spendByCategory[category] ?? xs.map(() => 0);
      shares[category] = Math.max(0, slope(xs, ys, ws));
    }
    const total = sum(Object.values(shares));
    const normalised = Object.fromEntries(Object.entries(shares).map(([key, value]) => [key, value / total]));
    const W = ws ? sum(ws) : xs.length;
    const meanX = sum(xs.map((x, i) => x * (ws ? ws[i] : 1))) / W;
    fits[name] = { consumptionRatios: xs, meanRatio: meanX, rawSlopes: shares, slopeSum: total };
    knots.push({ consumptionRatio: meanX, marginalShares: normalised, goodWeights });
  };
  // Engel 1853.
  const engel = p6.engel1853;
  const engelUsd = engel.usdPerMark.value * engel.cpi1853Over1900.value;
  {
    const xs = [];
    const spend = Object.fromEntries(CATEGORIES.map((key) => [key, []]));
    engel.expenditurePerQuetMark.forEach((perQuet, i) => {
      const pct = (key) => engel.percent[key][i] / 100;
      const consumptionShare = 1 - pct("housing");
      const perAeDay = (perQuet * engel.quetsPerAdultEquivalent.value * consumptionShare * engelUsd * rusdPerUsd1900) / 365;
      const x = perAeDay / cRef;
      xs.push(x);
      const scale = (perQuet * engel.quetsPerAdultEquivalent.value * engelUsd * rusdPerUsd1900) / 365 / cRef;
      spend.food.push(scale * (pct("food-animal") + pct("food-plant") + pct("drinks") + pct("inn") + pct("garden-and-field")));
      spend.clothing.push(scale * pct("clothing"));
      spend["fuel-light"].push(scale * pct("heat-and-light"));
      spend.services.push(scale * (pct("health") + pct("mental") + pct("church") + pct("legal") + pct("insurance") + pct("recreation") + pct("general")));
      for (const key of ["household-goods", "tobacco", "transport"]) spend[key].push(0);
    });
    const animal = sum(engel.percent["food-animal"]);
    const plant = sum(engel.percent["food-plant"]);
    const drink = sum(engel.percent.drinks) + sum(engel.percent.inn) + sum(engel.percent["garden-and-field"]);
    const food = normalise({
      livestock: 0.7 * animal, dairy: 0.2 * animal, fish: 0.1 * animal,
      "food-products": 0.45 * plant + drink, grain: 0.2 * plant, produce: 0.25 * plant, sugar: 0.05 * plant, "coffee-tea-cocoa": 0.05 * plant,
    });
    addKnot("engel-1853", xs, spend, null, { food, ...MIX_1900 });
  }
  // US 1901.
  const b1901 = p6.budget1901ByIncome;
  const sundryItems = Object.fromEntries(src.budget1901.items.map((item) => [item.item, (item.averageAmongHaving * item.sharePercent) / 100]));
  const sundryTotal = sum(Object.values(sundryItems));
  const sundrySplit = {
    "household-goods": sundryItems["furniture-and-utensils"] / sundryTotal,
    tobacco: sundryItems.tobacco / sundryTotal,
    food: sundryItems["intoxicating-liquors"] / sundryTotal,
    transport: (0.3 * sundryItems["other-purposes"]) / sundryTotal,
    services:
      (sundryItems["books-and-newspapers"] + sundryItems["amusements-and-vacation"] + sundryItems["sickness-and-death"] + sundryItems["insurance-life"] + sundryItems["insurance-property"] + 0.7 * sundryItems["other-purposes"]) / sundryTotal,
  };
  trace.sundrySplit1901 = sundrySplit;
  {
    const xs = [];
    const ws = [];
    const spend = Object.fromEntries(CATEGORIES.map((key) => [key, []]));
    const childFactor = p6.childrenByIncome1901.childFactor.value;
    b1901.rows.forEach((row, i) => {
      const [, families, , fuel, lighting, clothing, sundries, food] = row;
      let children = 0;
      p6.childrenByIncome1901.counts.forEach((counts, number) => {
        children += counts[i] * number;
      });
      const ae = 1.8 + (children / families) * childFactor;
      const toRatio = (usd) => (usd * rusdPerUsd1900) / 365 / ae / cRef;
      const consumption = fuel + lighting + clothing + sundries + food;
      xs.push(toRatio(consumption));
      ws.push(families);
      spend.food.push(toRatio(food + sundries * sundrySplit.food));
      spend.clothing.push(toRatio(clothing));
      spend["fuel-light"].push(toRatio(fuel + lighting));
      for (const key of ["household-goods", "tobacco", "transport", "services"]) spend[key].push(toRatio(sundries * sundrySplit[key]));
    });
    const article = (keys) => sum(keys.map((key) => weights[key]));
    const food = normalise({
      livestock: article(["fresh-beef", "salt-beef", "fresh-hog-products", "salt-hog-products", "other-meat", "poultry", "lard"]),
      fish: article(["fish"]),
      dairy: article(["eggs", "milk", "butter", "cheese"]),
      "coffee-tea-cocoa": article(["tea", "coffee"]),
      sugar: article(["sugar", "molasses"]),
      "food-products": article(["flour-and-meal", "bread", "rice", "vinegar-pickles-condiments", "other-food"]),
      produce: article(["potatoes", "other-vegetables", "fruit"]),
    });
    addKnot("us-1901", xs, spend, ws, { food, ...MIX_1900 });
  }
  // US 1990.
  {
    const cex = p6.cex1990;
    const col = (name) => cex.columns.indexOf(name);
    const xs = [];
    const spend = Object.fromEntries(CATEGORIES.map((key) => [key, []]));
    const ae = cex.adultEquivalentsPerConsumerUnit.value;
    const totals = { food: 0, cereals: 0, meats: 0, dairy: 0, fruits: 0, other: 0, away: 0, alcohol: 0, vehicles: 0, gasoline: 0, otherTransport: 0 };
    for (const row of cex.rows) {
      const v = (name) => row[col(name)];
      const toRatio = (usd) => usd / 365 / ae / cRef; // 1990 dollars are RUSD
      const transport = v("vehiclePurchases") + v("gasoline") + v("otherTransport");
      const consumption = v("food") + v("alcohol") + v("fuelUtilities") + v("householdOperationsFurnishings") + v("housekeepingSupplies") + v("apparel") + transport + v("health") + v("other");
      xs.push(toRatio(consumption));
      spend.food.push(toRatio(v("food") + v("alcohol")));
      spend.clothing.push(toRatio(v("apparel")));
      spend["fuel-light"].push(toRatio(v("fuelUtilities")));
      spend["household-goods"].push(toRatio(v("householdOperationsFurnishings") + v("housekeepingSupplies")));
      spend.tobacco.push(0);
      spend.transport.push(toRatio(transport));
      spend.services.push(toRatio(v("health") + v("other")));
      totals.cereals += v("cereals");
      totals.meats += v("meatsPoultryFishEggs");
      totals.dairy += v("dairy");
      totals.fruits += v("fruitsVegetables");
      totals.other += v("foodAtHome") - v("cereals") - v("meatsPoultryFishEggs") - v("dairy") - v("fruitsVegetables");
      totals.away += v("foodAway");
      totals.alcohol += v("alcohol");
      totals.vehicles += v("vehiclePurchases");
      totals.gasoline += v("gasoline");
      totals.otherTransport += v("otherTransport");
    }
    const food = normalise({
      "food-products": totals.cereals + 0.6 * totals.other + totals.away + totals.alcohol,
      livestock: 0.8 * totals.meats,
      fish: 0.12 * totals.meats,
      dairy: totals.dairy + 0.08 * totals.meats,
      produce: totals.fruits,
      sugar: 0.25 * totals.other,
      "coffee-tea-cocoa": 0.15 * totals.other,
    });
    const transport = normalise({ "motor-vehicles": totals.vehicles, petrol: totals.gasoline, "transport-services": totals.otherTransport });
    addKnot("cex-1990", xs, spend, null, { food, ...MIX_1990, transport });
  }
  knots.sort((a, b) => a.consumptionRatio - b.consumptionRatio);
  for (const knot of knots) {
    for (const category of CATEGORIES) if (knot.goodWeights[category] === undefined) knot.goodWeights[category] = MIX_1900[category] ?? {};
  }
  trace.knotFits = fits;

  // 6. Tastes.
  const tastes = [];
  const tasteRows = p6.tastes1901.byCountry;
  const tea = (weights.tea / 10000) * familyFood / quantities.tea[0];
  const coffee = (weights.coffee / 10000) * familyFood / quantities.coffee[0];
  const us = tasteRows.USA;
  const usValue = us.tea * tea + us.coffee * coffee;
  // Webb's country labels → the world's tags (Austria-Hungary is AUT, the German Empire DEU).
  const tagMap = { GBR: "GBR", RUS: "RUS", USA: "USA", AUH: "AUT", FRA: "FRA", ITA: "ITA", GER: "DEU", BEL: "BEL" };
  const tasteTrace = {};
  for (const [row, values] of Object.entries(tasteRows)) {
    const tag = countries.find((country) => country.tag === tagMap[row])?.tag;
    const mpd = mpdByTag.get(tag) ?? null;
    if (tag === undefined || mpd === null || row === "USA") continue;
    const income = mpd / mpdByTag.get("USA");
    const ctc = (values.tea * tea + values.coffee * coffee) / usValue / income;
    const sugar = values.sugar / us.sugar / income;
    tastes.push({ countryKey: tag, goodKey: "coffee-tea-cocoa", weightMultiplier: Number(ctc.toFixed(4)) });
    tastes.push({ countryKey: tag, goodKey: "sugar", weightMultiplier: Number(sugar.toFixed(4)) });
    tasteTrace[tag] = { ctc, sugar, relativeGdpPerHead: income };
  }
  tastes.sort((a, b) => a.countryKey.localeCompare(b.countryKey) || a.goodKey.localeCompare(b.goodKey));
  trace.tastes = tasteTrace;

  const demandSystem = {
    commerceGoodKey: "commerce",
    transportGoodKey: "transport-services",
    categories: CATEGORIES.map((key) => ({
      key,
      substitutionElasticity: CATEGORY_GOODS[key].sigma,
      committedAtSubsistenceTier: CATEGORY_GOODS[key].subsistence,
      goods: CATEGORY_GOODS[key].goods.map((goodKey) => ({
        goodKey,
        committedPerAdultEquivalentPerDay: Number((committed[goodKey] ?? 0).toPrecision(8)),
        retailCommercePerUnit: Number(marginOf(goodKey).commerce.toPrecision(8)),
        retailTransportPerUnit: Number(marginOf(goodKey).transport.toPrecision(8)),
        ...(GATES[goodKey] === undefined ? {} : { requiredTechnologyKey: GATES[goodKey] }),
      })),
    })),
    knots: knots.map((knot) => ({
      consumptionRatio: Number(knot.consumptionRatio.toPrecision(8)),
      marginalShares: roundShares(knot.marginalShares),
      goodWeights: Object.fromEntries(CATEGORIES.map((category) => [category, roundShares(normalise(knot.goodWeights[category]))])),
    })),
    tastes,
    dwellingGoodKey: "dwelling",
  };

  // 4–5. Incomes, housing, quantities.
  const professionById = new Map(professions.map((profession) => [profession.key, profession]));
  const provinceById = new Map(provinces.map((province) => [province.id, province]));
  const marketOfProvince = new Map();
  for (const market of markets) for (const id of market.provinceIds) marketOfProvince.set(id, market);
  const countryOfProvince = new Map();
  for (const country of countries) for (const id of country.provinceIds) countryOfProvince.set(id, country);
  const workingAgeShare = ctx.workingAgeShare;
  const incomeOf = (pop) => {
    const province = provinceById.get(pop.provinceId);
    const profession = professionById.get(pop.professionKey);
    const wage = province?.wageRUSDPerYearByProfession?.[pop.professionKey] ?? profession.baseWage1900RUSDPerYear;
    return (wage * profession.participationRate * workingAgeShare) / 365;
  };
  const housing = p6.housing1900;
  const housingRefOf = (provinceId) => {
    const entry = p4ById.get(provinceId);
    const row = entry === undefined ? undefined : housing.byCountry[entry.modernCountry];
    return row?.value ?? housing.defaultValue.value;
  };
  // Dwellings per pop (persons × income^ε shares within the province).
  const dwellingsOfPop = new Map();
  const popsByProvince = new Map();
  for (const pop of pops) {
    if (!(pop.population > 0)) continue;
    const list = popsByProvince.get(pop.provinceId) ?? [];
    list.push(pop);
    popsByProvince.set(pop.provinceId, list);
  }
  for (const [provinceId, list] of popsByProvince) {
    const ref = housingRefOf(provinceId);
    const total = sum(list.map((pop) => pop.population)) / ref;
    const w = list.map((pop) => pop.population * Math.pow(Math.max(incomeOf(pop), 1e-9), P6_COEFFICIENTS.dwellingIncomeElasticity));
    const W = sum(w);
    list.forEach((pop, i) => dwellingsOfPop.set(pop, (total * w[i]) / W));
  }
  // The block's own 1900 urban share (P4), as the simulation reads it.
  const urbanOfBlock = new Map(p4.blocks.map((entry) => [`${entry.provinceId}|${entry.professionKey}`, entry.urbanShare]));
  const growthOf = (provinceId) => (p4ById.get(provinceId)?.model?.stableGrowthPer1000 ?? 0) / 1000;

  const system = resolve(demandSystem, goods);
  const quantitiesOf = (pop) => {
    const result = new Map();
    const market = marketOfProvince.get(pop.provinceId);
    const province = provinceById.get(pop.provinceId);
    const country = countryOfProvince.get(pop.provinceId);
    const profession = professionById.get(pop.professionKey);
    if (market === undefined || province === undefined || !(pop.population > 0)) return { quantities: result, plan: null };
    const multiplier = market.initialPriceMultiplier ?? 1;
    const price = (good) => good.basePrice1900RUSD * (good.internationalPrice === true ? 1 : multiplier);
    const prices = goods.map(price);
    const ae = pop.population * aeRatioOf(p4ById.get(pop.provinceId) ?? { maleAgeWeights: [], femaleAgeWeights: [] }) || pop.population * worldAeRatio;
    const plan = planHousehold(system, {
      ae,
      persons: pop.population,
      income: incomeOf(pop),
      cash: (pop.savingsPerCapitaRUSD ?? 0) * pop.population,
      mpc: P6_COEFFICIENTS.marginalPropensityToConsume[profession.stratum],
      urban: urbanOfBlock.get(`${pop.provinceId}|${pop.professionKey}`) ?? province.urbanShare ?? 0,
      prices,
      available: (goodKey) => GATES[goodKey] === undefined || knows(country, GATES[goodKey]),
      taste: tastes.filter((taste) => taste.countryKey === country?.tag),
    });
    for (const [goodId, quantity] of plan.quantities) result.set(goodId, quantity);
    const dwelling = goodByKey.get("dwelling");
    const flow = ((dwellingsOfPop.get(pop) ?? 0) * (P6_COEFFICIENTS.dwellingDepreciationRatePerYear + Math.max(0, growthOf(pop.provinceId)))) / 365;
    if (dwelling !== undefined && flow > 0) result.set(dwelling.id, (result.get(dwelling.id) ?? 0) + flow);
    return { quantities: result, plan };
  };

  return {
    demandSystem,
    trace,
    cRef,
    quantitiesOf,
    incomeOf,
    housingRefOf,
    dwellingsOfPop,
  };
}

function roundShares(table) {
  return Object.fromEntries(Object.entries(table).filter(([, value]) => value > 0).map(([key, value]) => [key, Number(value.toPrecision(10))]));
}

/** Resolve the system for the generator (same algorithm as the simulation). */
function resolve(system, goods) {
  const byKey = new Map(goods.map((good) => [good.key, good]));
  const categories = system.categories.map((category) => ({
    key: category.key,
    sigma: category.substitutionElasticity,
    goods: category.goods.map((good) => ({ ...good, id: byKey.get(good.goodKey).id, base: byKey.get(good.goodKey).basePrice1900RUSD })),
  }));
  const ratios = system.knots.map((knot) => knot.consumptionRatio);
  return { categories, ratios, knots: system.knots, commerceId: byKey.get(system.commerceGoodKey).id, transportId: byKey.get(system.transportGoodKey).id };
}

function segment(ratios, x) {
  if (x < ratios[0]) return -1;
  let s = 0;
  while (s + 1 < ratios.length && ratios[s + 1] <= x) s += 1;
  return s;
}

function cumulative(system, categoryKey, x) {
  const { ratios, knots } = system;
  const share = (j) => knots[j].marginalShares[categoryKey] ?? 0;
  let g = share(0) * (ratios[0] - 1);
  const s = segment(ratios, x);
  if (s < 0) return share(0) * (x - 1);
  for (let j = 1; j <= s; j += 1) g += ((share(j - 1) + share(j)) / 2) * (ratios[j] - ratios[j - 1]);
  if (s === ratios.length - 1) return g + share(s) * (x - ratios[s]);
  const bx = share(s) + ((share(s + 1) - share(s)) * (x - ratios[s])) / (ratios[s + 1] - ratios[s]);
  return g + ((share(s) + bx) / 2) * (x - ratios[s]);
}

function weightAt(system, categoryKey, goodKey, x) {
  const { ratios, knots } = system;
  const w = (j) => knots[j].goodWeights[categoryKey]?.[goodKey] ?? 0;
  const s = segment(ratios, x);
  if (s < 0) return w(0);
  if (s === ratios.length - 1) return w(s);
  return w(s) + ((w(s + 1) - w(s)) * (x - ratios[s])) / (ratios[s + 1] - ratios[s]);
}

/** One block's plan (mirror of population/demandSystem.ts planHouseholdDemand). */
export function planHousehold(system, input) {
  const { prices, urban } = input;
  const retail = (good) => prices[good.id] + urban * (good.retailCommercePerUnit * prices[system.commerceId] + good.retailTransportPerUnit * prices[system.transportId]);
  const quantities = new Map();
  const add = (id, quantity) => quantities.set(id, (quantities.get(id) ?? 0) + quantity);
  let cPerAe = 0;
  const categorySpend = {};
  for (const category of system.categories) {
    categorySpend[category.key] = 0;
    for (const good of category.goods) {
      if (good.committedPerAdultEquivalentPerDay > 0) {
        cPerAe += retail(good) * good.committedPerAdultEquivalentPerDay;
        categorySpend[category.key] += retail(good) * good.committedPerAdultEquivalentPerDay * input.ae;
      }
    }
  }
  const committedCost = cPerAe * input.ae;
  const reserve = P6_COEFFICIENTS.cashReserveDays * committedCost;
  const income = input.income * input.persons + (P6_COEFFICIENTS.wealthConsumptionRatePerYear / 365) * Math.max(0, input.cash - reserve);
  const marginRows = (good, quantity) => {
    add(good.id, quantity);
    add(system.commerceId, quantity * urban * good.retailCommercePerUnit);
    add(system.transportId, quantity * urban * good.retailTransportPerUnit);
  };
  for (const category of system.categories) for (const good of category.goods) if (good.committedPerAdultEquivalentPerDay > 0) marginRows(good, good.committedPerAdultEquivalentPerDay * input.ae);
  if (!(committedCost > 0) || income <= committedCost) return { quantities, committedCost, consumption: committedCost, income, categorySpend, x: 1 };
  const consumption = committedCost + input.mpc * (income - committedCost);
  const x = consumption / committedCost;
  const tasteOf = (goodKey) => input.taste.find((taste) => taste.goodKey === goodKey)?.weightMultiplier ?? 1;
  let open = 0;
  let closed = 0;
  const plans = system.categories.map((category) => {
    const spend = committedCost * cumulative(system, category.key, x);
    const weighted = category.goods
      .filter((good) => input.available(good.goodKey) && retail(good) > 0)
      .map((good) => ({ good, w: weightAt(system, category.key, good.goodKey, x) * tasteOf(good.goodKey) * Math.pow(retail(good) / good.base, 1 - category.sigma) }))
      .filter((entry) => entry.w > 0);
    const total = sum(weighted.map((entry) => entry.w));
    if (total > 0) open += spend;
    else closed += spend;
    return { category, spend, weighted, total };
  });
  const scale = open > 0 ? (open + closed) / open : 0;
  for (const { category, spend, weighted, total } of plans) {
    if (!(total > 0)) continue;
    categorySpend[category.key] += spend * scale;
    for (const { good, w } of weighted) marginRows(good, (spend * scale * (w / total)) / retail(good));
  }
  return { quantities, committedCost, consumption, income, categorySpend, x };
}
