#!/usr/bin/env node
/**
 * P2b before/after report (D-135): compares two runs of the calibration probe
 * (`packages/bench/dist/p2bCalibrationProbe.js`) with the sourced 1900 values.
 *
 * Usage: node scripts/p2b/report-before-after.mjs <before.json> <after.json> > table.md
 *
 * Columns per country: GDP per head (source: the calibration's exchange-rate GDP per head,
 * population-weighted over the country's territories), covered value added per head as
 * solved by the builder, value added per head measured by the probe before and after,
 * the laborer and peasant wage per employed worker before/after against the home
 * territory's wage in the source-derived table (colonies pay less, so a country's mean
 * can sit below its home wage), and the
 * fiscal stocks and flows (treasury, income tax) before/after against the sourced revenue
 * share. Money is RUSD per year.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DATA = join(ROOT, "packages/data/data");
const [beforePath, afterPath] = process.argv.slice(2);
if (beforePath === undefined || afterPath === undefined) {
  console.error("usage: report-before-after.mjs <before.json> <after.json>");
  process.exit(2);
}
const before = JSON.parse(readFileSync(beforePath, "utf8"));
const after = JSON.parse(readFileSync(afterPath, "utf8"));
const calibration = JSON.parse(readFileSync(join(DATA, "historical/p2b/calibration_1900.json"), "utf8"));
const sources = JSON.parse(readFileSync(join(DATA, "historical/p2b/sources_1900.json"), "utf8"));
const provinces = JSON.parse(readFileSync(join(DATA, "historical/p2b/provinces_1900.json"), "utf8"));
const countries = JSON.parse(readFileSync(join(DATA, "historical/p2b/countries_1900.json"), "utf8"));
const revenueShare = sources.rows.find((row) => row.id === "us-gov-revenue-share-1902").value;

const territoryOfProvince = new Map(provinces.map((p) => [p.id, p.territoryKey]));
const fmt = (value) => {
  if (!Number.isFinite(value)) return "-";
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${(value / 1e9).toFixed(1)} bn`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(1)} M`;
  if (abs >= 100) return value.toFixed(0);
  return value.toFixed(1);
};

const rows = [];
for (const country of countries) {
  const b = before.countries.find((c) => c.tag === country.tag);
  const a = after.countries.find((c) => c.tag === country.tag);
  if (b === undefined || a === undefined) continue;
  const territories = new Set(country.provinceIds.map((id) => territoryOfProvince.get(id)));
  let people = 0;
  let gdp = 0;
  let covered = 0;
  let laborerWeighted = 0;
  let peasantWeighted = 0;
  for (const key of territories) {
    const t = calibration.territories[key];
    if (t === undefined) continue;
    people += t.population;
    gdp += t.population * t.gdpPerHeadRUSD.value;
    covered += t.coveredValueAddedRUSDPerYear;
    laborerWeighted += t.population * t.wageTable.laborers;
    peasantWeighted += t.population * t.wageTable.peasants;
  }
  rows.push({
    tag: country.tag,
    people,
    gdpPerHead: gdp / people,
    coveredPerHead: covered / people,
    vaBefore: b.valueAddedPerHead,
    vaAfter: a.valueAddedPerHead,
    laborerSource: calibration.territories[`${country.tag.toLowerCase()}-home`]?.wageTable.laborers ?? laborerWeighted / people,
    laborerBefore: b.wagePerWorkerYear.laborers ?? NaN,
    laborerAfter: a.wagePerWorkerYear.laborers ?? NaN,
    peasantSource: calibration.territories[`${country.tag.toLowerCase()}-home`]?.wageTable.peasants ?? peasantWeighted / people,
    peasantBefore: b.wagePerWorkerYear.peasants ?? NaN,
    peasantAfter: a.wagePerWorkerYear.peasants ?? NaN,
    paidBefore: b.wageObligationPerYear > 0 ? b.wagesPerYear / b.wageObligationPerYear : NaN,
    paidAfter: a.wageObligationPerYear > 0 ? a.wagesPerYear / a.wageObligationPerYear : NaN,
    treasuryBefore: b.treasuryCashStart,
    treasuryAfter: a.treasuryCashStart,
    taxBefore: b.incomeTaxPerYear,
    taxAfter: a.incomeTaxPerYear,
    revenueSource: revenueShare * gdp,
    revenueCoveredSource: revenueShare * covered,
  });
}
rows.sort((x, y) => y.people - x.people);
const header = [
  "| Country | GDP/head source | covered/head solved | VA/head before | VA/head after | laborer source (home) | before | after | peasant source (home) | before | after | wages paid before | after |",
  "|---|---|---|---|---|---|---|---|---|---|---|---|---|",
];
const fiscalHeader = [
  "| Country | revenue source (7.8% of GDP) | of covered VA | income tax before | after | treasury before | after |",
  "|---|---|---|---|---|---|---|",
];
const lines = rows.map((r) => `| ${r.tag} | ${fmt(r.gdpPerHead)} | ${fmt(r.coveredPerHead)} | ${fmt(r.vaBefore)} | ${fmt(r.vaAfter)} | ${fmt(r.laborerSource)} | ${fmt(r.laborerBefore)} | ${fmt(r.laborerAfter)} | ${fmt(r.peasantSource)} | ${fmt(r.peasantBefore)} | ${fmt(r.peasantAfter)} | ${(100 * r.paidBefore).toFixed(0)}% | ${(100 * r.paidAfter).toFixed(0)}% |`);
const fiscalLines = rows.map((r) => `| ${r.tag} | ${fmt(r.revenueSource)} | ${fmt(r.revenueCoveredSource)} | ${fmt(r.taxBefore)} | ${fmt(r.taxAfter)} | ${fmt(r.treasuryBefore)} | ${fmt(r.treasuryAfter)} |`);
const world = (run, field) => run.countries.reduce((acc, c) => acc + c[field], 0);
const worldPeople = world(after, "population");
console.log(`Runs: before ${before.days} days, after ${after.days} days, seed ${after.seed}. Money in RUSD per year; per-head values over each simulation country's whole population (colonies included).\n`);
console.log(`World value added per head: before ${fmt(world(before, "valueAddedPerYear") / world(before, "population"))}, after ${fmt(world(after, "valueAddedPerYear") / worldPeople)}; wage obligations paid: before ${(100 * world(before, "wagesPerYear") / world(before, "wageObligationPerYear")).toFixed(0)}%, after ${(100 * world(after, "wagesPerYear") / world(after, "wageObligationPerYear")).toFixed(0)}%; world treasuries at the start: before ${fmt(world(before, "treasuryCashStart"))}, after ${fmt(world(after, "treasuryCashStart"))}.\n`);
console.log("### GDP per head and wages\n");
console.log([...header, ...lines].join("\n"));
console.log("\n### Fiscal stocks and flows\n");
console.log([...fiscalHeader, ...fiscalLines].join("\n"));
