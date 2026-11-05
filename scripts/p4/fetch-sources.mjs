#!/usr/bin/env node
/**
 * P4 (D-142): fetch the demographic source extracts (network; run on demand).
 *
 * Writes two committed inputs that the offline generator reads:
 *   packages/data/data/historical/p4/gapminder_1900.json
 *     1896–1905 means (and the single 1900 values) of every Gapminder geo for life expectancy (lex v15), total fertility
 *     (tfr v15), under-5 mortality (u5mr v12) and crude birth rate (systema_globalis),
 *     read from the open-numbers DDF repositories at pinned commits.
 *   packages/data/data/validation/wpp_regions_1975_2000.json
 *     WPP 2024 estimates for the six continental regions in 1975 and 2000 (TFR, life
 *     expectancy, crude birth and death rates, population) through Our World in Data's
 *     WPP 2024 mirror. Validation target only (D-124): no simulation code reads it.
 *
 * Usage: node scripts/p4/fetch-sources.mjs
 * All sources are CC BY 4.0. Values are stored as published; nothing is adjusted.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DATA = join(ROOT, "packages/data/data");
const ACCESS_DATE = new Date().toISOString().slice(0, 10);

const FASTTRACK = {
  repo: "open-numbers/ddf--gapminder--fasttrack",
  commit: "b840e5bed1e9f68695af9cb5b037fe2dce576de0",
};
const SYSTEMA = {
  repo: "open-numbers/ddf--gapminder--systema_globalis",
  commit: "ee190605fdec9d1c35c38e18e869a400a5818fe6",
};
const SERIES = [
  {
    key: "lex",
    ...FASTTRACK,
    path: "countries_etc_datapoints/ddf--datapoints--lex--by--country--time.csv",
    name: "Gapminder Life expectancy at birth v15 (gapm.io/dlex)",
    units: "years",
  },
  {
    key: "tfr",
    ...FASTTRACK,
    path: "countries_etc_datapoints/ddf--datapoints--children_per_woman_total_fertility--by--country--time.csv",
    name: "Gapminder Babies per woman (total fertility) v15 (gapm.io/dtfr)",
    units: "children per woman",
  },
  {
    key: "u5mr",
    ...FASTTRACK,
    path: "countries_etc_datapoints/ddf--datapoints--child_mortality_0_5_year_olds_dying_per_1000_born--by--country--time.csv",
    name: "Gapminder Child mortality (under 5) v12 (gapm.io/du5mr)",
    units: "deaths before age 5 per 1,000 live births",
  },
  {
    key: "cbr",
    ...SYSTEMA,
    path: "countries-etc-datapoints/ddf--datapoints--crude_birth_rate_births_per_1000_population--by--geo--time.csv",
    name: "Gapminder Systema Globalis crude birth rate (births per 1,000 population)",
    units: "births per 1,000 people per year",
  },
];

async function text(url) {
  const response = await fetch(url, { headers: { "user-agent": "fabric-of-nations-data-build" } });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.text();
}

/** First and last year of the window whose mean is the "1900 level" (D-142 §2). */
const WINDOW = [1896, 1905];
const MIN_WINDOW_YEARS = 5;

/**
 * Per geo: the 1900 value and the 1896–1905 mean (at least five years present). A
 * single year can be a crisis (India's 1899–1900 famine, Finland's 1900 epidemic);
 * the game starts from the decade's level and produces its own crises.
 */
function valuesAround1900(csv) {
  const lines = csv.trim().split(/\r?\n/);
  const byGeo = {};
  for (const line of lines.slice(1)) {
    const [geo, time, value] = line.split(",");
    const year = Number(time);
    if (value === "" || value === undefined || year < WINDOW[0] || year > WINDOW[1]) continue;
    (byGeo[geo] ??= []).push({ year, value: Number(value) });
  }
  const result = {};
  for (const [geo, points] of Object.entries(byGeo)) {
    const at1900 = points.find((point) => point.year === 1900);
    const mean = points.length >= MIN_WINDOW_YEARS ? points.reduce((sum, point) => sum + point.value, 0) / points.length : undefined;
    result[geo] = { at1900: at1900?.value, mean, years: points.length };
  }
  return result;
}

async function gapminder() {
  const series = {};
  const values = {};
  for (const entry of SERIES) {
    const url = `https://raw.githubusercontent.com/${entry.repo}/${entry.commit}/${entry.path}`;
    const byGeo = valuesAround1900(await text(url));
    series[entry.key] = { name: entry.name, units: entry.units, repository: entry.repo, commit: entry.commit, path: entry.path, geos: Object.keys(byGeo).length };
    for (const [geo, value] of Object.entries(byGeo)) {
      const record = (values[geo] ??= {});
      if (value.mean !== undefined) record[entry.key] = Math.round(value.mean * 1e4) / 1e4;
      if (value.at1900 !== undefined) (record.at1900 ??= {})[entry.key] = value.at1900;
    }
  }
  const geos = Object.keys(values).sort();
  return {
    meta: {
      description:
        "Gapminder values per geo (ISO 3166-1 alpha-3, lower case). Each series key holds the 1896–1905 mean (at least five annual values present), used as the 1900 level; `at1900` keeps the published single-year values for reference. P4 input (D-142).",
      window: WINDOW,
      minimumWindowYears: MIN_WINDOW_YEARS,
      license: "CC BY 4.0 (Gapminder)",
      accessDate: ACCESS_DATE,
      series,
      limitations:
        "Gapminder's pre-1950 values for most of Africa, Asia and Latin America are model estimates (interpolations and regional guesses), not observations; registration countries rest on vital statistics. Values are for modern borders.",
    },
    values: Object.fromEntries(geos.map((geo) => [geo, values[geo]])),
  };
}

const REGIONS = {
  UN_AFR: "africa",
  UN_ASI: "asia",
  UN_EUR: "europe",
  UN_LAC: "latin-america-caribbean",
  UN_NAM: "northern-america",
  UN_OCE: "oceania",
  OWID_WRL: "world",
};
const OWID = [
  { chart: "children-born-per-woman", columns: { tfr: 3 } },
  { chart: "life-expectancy-at-birth-total-years", columns: { lifeExpectancy: 3 } },
  { chart: "birth-rate-vs-death-rate", columns: { crudeBirthRate: 3, crudeDeathRate: 4, population: 5 } },
];

async function wppRegions() {
  const values = {};
  for (const source of OWID) {
    const csv = await text(`https://ourworldindata.org/grapher/${source.chart}.csv?v=1&csvType=full&useColumnShortNames=true`);
    for (const line of csv.trim().split(/\r?\n/).slice(1)) {
      const cells = line.split(",");
      // Region entity names contain no commas; the code is the second cell.
      const region = REGIONS[cells[1]];
      const year = Number(cells[2]);
      if (region === undefined || (year !== 1975 && year !== 2000)) continue;
      for (const [key, column] of Object.entries(source.columns)) {
        const value = cells[column];
        if (value !== undefined && value !== "") ((values[region] ??= {})[String(year)] ??= {})[key] = Number(value);
      }
    }
  }
  return {
    meta: {
      description:
        "UN WPP 2024 estimates for the continental regions in 1975 and 2000. Validation target only (D-124): never read by simulation code.",
      source: "United Nations, World Population Prospects 2024, via Our World in Data grapher (children-born-per-woman, life-expectancy-at-birth-total-years, birth-rate-vs-death-rate)",
      license: "CC BY 4.0",
      accessDate: ACCESS_DATE,
      units: {
        tfr: "children per woman",
        lifeExpectancy: "years at birth, both sexes",
        crudeBirthRate: "births per 1,000 people per year",
        crudeDeathRate: "deaths per 1,000 people per year",
        population: "people (1 July)",
      },
      regions: "UN M49 continental regions; Americas split into Latin America and the Caribbean, and Northern America.",
    },
    regions: values,
  };
}

const outGapminder = join(DATA, "historical/p4/gapminder_1900.json");
const outWpp = join(DATA, "validation/wpp_regions_1975_2000.json");
mkdirSync(dirname(outGapminder), { recursive: true });
mkdirSync(dirname(outWpp), { recursive: true });
writeFileSync(outGapminder, `${JSON.stringify(await gapminder(), null, 1)}\n`);
writeFileSync(outWpp, `${JSON.stringify(await wppRegions(), null, 2)}\n`);
console.log(`wrote ${outGapminder}\nwrote ${outWpp}`);
