#!/usr/bin/env node
/**
 * P4 (D-124, D-142): sourced 1900 demographic levels, stable age structures and urban
 * shares of the province world.
 *
 * Inputs (committed):
 *   packages/data/data/historical/p4/gapminder_1900.json            Gapminder 1900 extract
 *   packages/data/data/historical/p4/proxies_1900.json              authored stand-ins
 *   packages/data/data/historical/p4/province_modern_country_1900.json  crosswalk
 *   packages/data/data/historical/p2b/provinces_1900.json           HYDE urban share
 *   packages/data/data/historical/p2b/pops_1900.json                block populations
 *   packages/data/data/historical/p2b/countries_1900.json           1900 countries
 *   packages/data/data/demography.json                              standard schedule
 * and the built simulation (`packages/sim/dist`) for the life table the game uses.
 *
 * Output (generated, committed): packages/data/data/historical/p4/demography_1900.json
 *
 * Method, per province (its modern country, or that country's stand-in):
 *   fertility level      = Gapminder TFR ÷ standard TFR (WPP 1950 world, 4.83)
 *   child multiplier k_c  solves the game's life table for Gapminder under-5 mortality
 *   adult multiplier k_a  then solves it for Gapminder life expectancy at birth
 *   age structure         the stable population of that fertility and mortality
 *                         (Lotka's r), so the 1900 pyramid, birth and death rates agree
 *                         with the sourced levels; population totals are unchanged.
 * Per block: the province's HYDE urban people are assigned to its clerk, laborer,
 * academic and capitalist blocks first, then to peasants (the P2 distribution put
 * peasants on rural population).
 *
 * Usage: node scripts/p4/build-demography-1900.mjs [--check]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DATA = join(ROOT, "packages/data/data");
const OUT = join(DATA, "historical/p4/demography_1900.json");
const check = process.argv.includes("--check");

const sim = await import(pathToFileURL(join(ROOT, "packages/sim/dist/index.js")).href);
const read = (path) => JSON.parse(readFileSync(join(DATA, path), "utf8"));

const gapminder = read("historical/p4/gapminder_1900.json");
const proxies = read("historical/p4/proxies_1900.json");
const crosswalk = read("historical/p4/province_modern_country_1900.json");
const provinces = read("historical/p2b/provinces_1900.json");
const pops = read("historical/p2b/pops_1900.json");
const countries = read("historical/p2b/countries_1900.json");
const demography = read("demography.json");

const definitions = {
  standardSchedule: demography.standardSchedule,
  sexRatioAtBirth: demography.sexRatioAtBirth,
};
const AGE_BANDS = 17;
const SINGLE_AGES = 81;
const REPRODUCTIVE_START = 15;
const REPRODUCTIVE_END = 49;
const standardTfr =
  (demography.standardSchedule.ageSpecificBirthsPer1000Women.reduce((sum, rate) => sum + rate, 0) * 5) / 1000;

const round = (value, digits = 6) => {
  if (value === 0) return 0;
  const scale = 10 ** (digits - Math.ceil(Math.log10(Math.abs(value))));
  return Math.round(value * scale) / scale;
};

function bisect(f, low, high, target, increasing, label) {
  let fLow = f(low);
  let fHigh = f(high);
  const inRange = increasing ? fLow <= target && target <= fHigh : fHigh <= target && target <= fLow;
  if (!inRange) throw new Error(`${label}: target ${target} outside [${fLow}, ${fHigh}]`);
  for (let iteration = 0; iteration < 200; iteration += 1) {
    const middle = (low + high) / 2;
    const value = f(middle);
    if ((value < target) === increasing) low = middle;
    else high = middle;
    if (high - low < 1e-12) break;
  }
  return (low + high) / 2;
}

function table(child, adult) {
  return sim.lifeTable(
    sim.scheduleRates(definitions, "male", child, adult),
    sim.scheduleRates(definitions, "female", child, adult),
    definitions.sexRatioAtBirth,
  );
}

/** Single-year person-years L(a) of one sex under the game's continuous hazard. */
function personYears(rates) {
  const result = new Float64Array(SINGLE_AGES);
  let survivors = 1;
  for (let age = 0; age < SINGLE_AGES - 1; age += 1) {
    const m = Math.min(1, rates[Math.min(Math.floor(age / 5), AGE_BANDS - 1)] / 1000);
    const next = survivors * Math.exp(-m);
    result[age] = m > 0 ? (survivors - next) / m : survivors;
    survivors = next;
  }
  const terminal = Math.min(1, rates[AGE_BANDS - 1] / 1000);
  result[SINGLE_AGES - 1] = survivors / terminal;
  return { years: result, terminalMeanAge: 80 + 1 / terminal / 2 };
}

/** Stable population of a fertility level and mortality multipliers. */
function stablePopulation(fertilityLevel, child, adult) {
  const maleShare = definitions.sexRatioAtBirth / (1 + definitions.sexRatioAtBirth);
  const femaleShare = 1 - maleShare;
  const maleRates = sim.scheduleRates(definitions, "male", child, adult);
  const femaleRates = sim.scheduleRates(definitions, "female", child, adult);
  const male = personYears(maleRates);
  const female = personYears(femaleRates);
  const asfr = (age) =>
    age >= REPRODUCTIVE_START && age <= REPRODUCTIVE_END
      ? (demography.standardSchedule.ageSpecificBirthsPer1000Women[Math.floor((age - REPRODUCTIVE_START) / 5)] / 1000) *
        fertilityLevel
      : 0;
  const netReproduction = (r) => {
    let total = 0;
    for (let age = REPRODUCTIVE_START; age <= REPRODUCTIVE_END; age += 1) {
      total += Math.exp(-r * (age + 0.5)) * female.years[age] * asfr(age) * femaleShare;
    }
    return total;
  };
  const r = bisect(netReproduction, -0.1, 0.1, 1, false, "stable growth rate");
  const weight = (age, sex) => {
    const years = sex === "male" ? male : female;
    const share = sex === "male" ? maleShare : femaleShare;
    const meanAge = age === SINGLE_AGES - 1 ? years.terminalMeanAge : age + 0.5;
    return share * Math.exp(-r * meanAge) * years.years[age];
  };
  const maleByAge = Array.from({ length: SINGLE_AGES }, (_, age) => weight(age, "male"));
  const femaleByAge = Array.from({ length: SINGLE_AGES }, (_, age) => weight(age, "female"));
  const total = maleByAge.reduce((s, v) => s + v, 0) + femaleByAge.reduce((s, v) => s + v, 0);
  let births = 0;
  let deaths = 0;
  for (let age = 0; age < SINGLE_AGES; age += 1) {
    births += femaleByAge[age] * asfr(age);
    const band = Math.min(Math.floor(age / 5), AGE_BANDS - 1);
    deaths += maleByAge[age] * Math.min(1, maleRates[band] / 1000) + femaleByAge[age] * Math.min(1, femaleRates[band] / 1000);
  }
  const bands = (byAge) => {
    const result = new Array(AGE_BANDS).fill(0);
    byAge.forEach((value, age) => {
      result[Math.min(Math.floor(age / 5), AGE_BANDS - 1)] += value / total;
    });
    return result.map((value) => round(value, 8));
  };
  return {
    growthPer1000: r * 1000,
    crudeBirthRate: (births / total) * 1000,
    crudeDeathRate: (deaths / total) * 1000,
    maleAgeWeights: bands(maleByAge),
    femaleAgeWeights: bands(femaleByAge),
  };
}

// ---- sources per province ----------------------------------------------------
const proxyByIso = new Map(proxies.proxies.map((entry) => [entry.iso3, entry]));
const complete = (record) =>
  record !== undefined && [record.lex, record.tfr, record.u5mr].every((value) => Number.isFinite(value));
const ISO_MEDIUM_CONFIDENCE = new Set(["jpn", "usa", "can", "aus", "nzl", "arg", "ury", "chl", "cri"]);

const solved = new Map(); // source geo -> solution (shared by provinces of one geo)
function solve(geo) {
  if (solved.has(geo)) return solved.get(geo);
  const record = gapminder.values[geo];
  const fertilityLevel = record.tfr / standardTfr;
  const child = bisect((k) => table(k, 1).under5MortalityPer1000, 1e-3, 50, record.u5mr, true, `${geo} child multiplier`);
  const adult = bisect((k) => table(child, k).lifeExpectancy, 1e-3, 50, record.lex, false, `${geo} adult multiplier`);
  const check = table(child, adult);
  const stable = stablePopulation(fertilityLevel, child, adult);
  const solution = { record, fertilityLevel, child, adult, check, stable };
  solved.set(geo, solution);
  return solution;
}

const crosswalkById = new Map(crosswalk.provinces.map((row) => [row.provinceId, row]));
const provinceRows = [];
for (const province of [...provinces].sort((a, b) => a.id - b.id)) {
  const link = crosswalkById.get(province.id);
  if (link === undefined) throw new Error(`province ${province.id} has no crosswalk row`);
  const proxy = proxyByIso.get(link.iso3);
  const geo = proxy?.proxy ?? link.iso3;
  if (proxy === undefined && !complete(gapminder.values[geo])) {
    throw new Error(`province ${province.key}: ${geo} has no complete Gapminder record and no stand-in`);
  }
  if (!complete(gapminder.values[geo])) throw new Error(`stand-in ${geo} for ${link.iso3} is incomplete`);
  const s = solve(geo);
  provinceRows.push({
    provinceId: province.id,
    key: province.key,
    modernCountry: link.iso3,
    sourceGeo: geo,
    region: link.region,
    standIn: proxy !== undefined,
    confidence: proxy !== undefined ? "low" : link.region === "europe" || ISO_MEDIUM_CONFIDENCE.has(geo) ? "medium" : "low",
    source: {
      totalFertility: s.record.tfr,
      lifeExpectancy: s.record.lex,
      under5MortalityPer1000: s.record.u5mr,
      crudeBirthRate: Number.isFinite(s.record.cbr) ? s.record.cbr : null,
    },
    fertilityLevel: round(s.fertilityLevel, 10),
    childMortalityLevel: round(s.child, 10),
    adultMortalityLevel: round(s.adult, 10),
    model: {
      lifeExpectancy: round(s.check.lifeExpectancy, 6),
      under5MortalityPer1000: round(s.check.under5MortalityPer1000, 6),
      stableGrowthPer1000: round(s.stable.growthPer1000, 6),
      crudeBirthRate: round(s.stable.crudeBirthRate, 6),
      crudeDeathRate: round(s.stable.crudeDeathRate, 6),
    },
    maleAgeWeights: s.stable.maleAgeWeights,
    femaleAgeWeights: s.stable.femaleAgeWeights,
  });
}

// ---- urban share per block ---------------------------------------------------
const blocksByProvince = new Map();
for (const row of pops) {
  const list = blocksByProvince.get(row.provinceId) ?? [];
  list.push(row);
  blocksByProvince.set(row.provinceId, list);
}
const urbanByProvince = new Map(provinces.map((province) => [province.id, province.urbanShare ?? 0]));
const blockRows = [];
for (const [provinceId, rows] of [...blocksByProvince].sort((a, b) => a[0] - b[0])) {
  const total = rows.reduce((sum, row) => sum + row.population, 0);
  const urbanPeople = (urbanByProvince.get(provinceId) ?? 0) * total;
  const townRows = rows.filter((row) => row.professionKey !== "peasants");
  const town = townRows.reduce((sum, row) => sum + row.population, 0);
  const peasants = total - town;
  for (const row of [...rows].sort((a, b) => (a.professionKey < b.professionKey ? -1 : 1))) {
    let share;
    if (row.professionKey === "peasants") share = urbanPeople > town && peasants > 0 ? (urbanPeople - town) / peasants : 0;
    else share = town > 0 ? Math.min(1, urbanPeople / town) : 0;
    blockRows.push({ provinceId, professionKey: row.professionKey, urbanShare: round(Math.min(1, Math.max(0, share)), 8) });
  }
}

// ---- country targets ---------------------------------------------------------
const provinceRowById = new Map(provinceRows.map((row) => [row.provinceId, row]));
const provincePopulation = new Map();
for (const row of pops) provincePopulation.set(row.provinceId, (provincePopulation.get(row.provinceId) ?? 0) + row.population);
const countryRows = [...countries]
  .sort((a, b) => a.id - b.id)
  .map((country) => {
    let population = 0;
    const sums = { tfr: 0, lex: 0, u5: 0, cbr: 0, cbrPopulation: 0, modelCbr: 0, modelCdr: 0 };
    let metropolitan = null;
    for (const provinceId of country.provinceIds) {
      const row = provinceRowById.get(provinceId);
      const people = provincePopulation.get(provinceId) ?? 0;
      if (row === undefined || people === 0) continue;
      population += people;
      sums.tfr += people * row.source.totalFertility;
      sums.lex += people * row.source.lifeExpectancy;
      sums.u5 += people * row.source.under5MortalityPer1000;
      sums.modelCbr += people * row.model.crudeBirthRate;
      sums.modelCdr += people * row.model.crudeDeathRate;
      if (row.source.crudeBirthRate !== null) {
        sums.cbr += people * row.source.crudeBirthRate;
        sums.cbrPopulation += people;
      }
    }
    if (population === 0) return { countryId: country.id, tag: country.tag, population: 0 };
    void metropolitan;
    return {
      countryId: country.id,
      tag: country.tag,
      population,
      source: {
        totalFertility: round(sums.tfr / population, 6),
        lifeExpectancy: round(sums.lex / population, 6),
        under5MortalityPer1000: round(sums.u5 / population, 6),
        crudeBirthRate: sums.cbrPopulation > 0 ? round(sums.cbr / sums.cbrPopulation, 6) : null,
        crudeBirthRateCoverage: round(sums.cbrPopulation / population, 6),
      },
      stable: {
        crudeBirthRate: round(sums.modelCbr / population, 6),
        crudeDeathRate: round(sums.modelCdr / population, 6),
      },
    };
  });

const output = {
  meta: {
    description:
      "P4 sourced 1900 demography of the province world (D-124, D-142): per province the sourced Gapminder values, the fertility level and child/adult mortality multipliers of the WPP 1950 world standard schedule that reproduce them in the game's life table, and the stable age structure of those rates; per block the urban share; per 1900 country the population-weighted source targets. Generated by scripts/p4/build-demography-1900.mjs; do not edit.",
    standardTotalFertility: round(standardTfr, 10),
    method:
      "fertility level = TFR / standard TFR; child multiplier solves under-5 mortality; adult multiplier then solves life expectancy; age structure = stable population (Lotka r) of these rates; urban people of a province go first to its non-peasant blocks (HYDE 3.3 urban share).",
    sources: ["gapminder_1900.json", "proxies_1900.json", "province_modern_country_1900.json", "p2b/provinces_1900.json (HYDE 3.3)", "demography.json (WPP 2024, 1950 pattern)"],
    acceptanceTolerances: {
      crudeBirthRateRelative: 0.15,
      lifeExpectancyYears: 1,
      under5MortalityRelative: 0.05,
      totalFertilityRelative: 0.05,
      note:
        "Crude birth rates are compared with Gapminder where it has a value; the game's rate is the stable-population rate of the sourced TFR and life expectancy, so differences show the inconsistency between Gapminder's separately estimated series (and of migration-shaped age structures such as the United States and Argentina). Crude death rates have no open 1900 per-country source (D-142 §2): the target is the rate implied by the sourced life expectancy and under-5 mortality in the stable population.",
    },
    provinces: provinceRows.length,
    standInProvinces: provinceRows.filter((row) => row.standIn).length,
  },
  provinces: provinceRows,
  blocks: blockRows,
  countries: countryRows,
};
const text = `${JSON.stringify(output)}\n`;
if (check) {
  const current = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
  if (current !== text) {
    console.error(`${OUT} is stale; run node scripts/p4/build-demography-1900.mjs`);
    process.exit(1);
  }
  console.log("1900 demography is current");
} else {
  writeFileSync(OUT, text);
  console.log(
    `wrote ${OUT}: ${provinceRows.length} provinces (${output.meta.standInProvinces} by stand-in), ${blockRows.length} blocks, ${solved.size} source geos`,
  );
}
