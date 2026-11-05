#!/usr/bin/env node
/**
 * P4 (D-124, D-142) WPP comparison report.
 *
 * Reads the regional yearly output of a no-input run
 * (`node packages/bench/dist/p4Demography.js run <days> --out <file>`) and the WPP 2024
 * validation targets (`packages/data/data/validation/wpp_regions_1975_2000.json`), and
 * writes `docs/P4_WPP_COMPARISON.md`: per region and year (1975, 2000) the game's TFR,
 * life expectancy, crude birth and death rates and population against WPP. Validation
 * only: nothing here feeds the simulation. A run that ended before a target year is
 * reported as such, with the last year reached.
 *
 * Usage: node scripts/p4/wpp-comparison.mjs <run.json> [--out docs/P4_WPP_COMPARISON.md] [--note "run status"]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const runFile = process.argv[2];
if (runFile === undefined) throw new Error("usage: node scripts/p4/wpp-comparison.mjs <run.json> [--out file]");
const outIndex = process.argv.indexOf("--out");
const out = outIndex > 0 ? process.argv[outIndex + 1] : join(ROOT, "docs/P4_WPP_COMPARISON.md");
const noteIndex = process.argv.indexOf("--note");
const note = noteIndex > 0 ? process.argv[noteIndex + 1] : null;

const run = JSON.parse(readFileSync(runFile, "utf8"));
const wpp = JSON.parse(readFileSync(join(ROOT, "packages/data/data/validation/wpp_regions_1975_2000.json"), "utf8"));
const REGIONS = [
  ["africa", "Africa"],
  ["asia", "Asia"],
  ["europe", "Europe"],
  ["latin-america-caribbean", "Latin America and the Caribbean"],
  ["northern-america", "Northern America"],
  ["oceania", "Oceania"],
  ["world", "World"],
];
const rowsByKey = new Map(run.rows.map((row) => [`${row.region}:${row.year}`, row]));
const lastYear = Math.max(...run.rows.map((row) => row.year));
const fmt = (value, digits = 1) => (value === undefined || value === null || Number.isNaN(value) ? "–" : value.toFixed(digits));
const millions = (value) => (value === undefined ? "–" : (value / 1e6).toFixed(0));

const lines = [];
lines.push("# P4 — WPP comparison report (validation only)");
lines.push("");
lines.push(
  "Game: no-input run of the 1900 world (country AI as in the game, no player actions), seed " +
    `${String(run.seed)}, indicators at 1 January of each year from today's levels and age structure ` +
    "(`packages/bench/src/p4Demography.ts`). Regions: UN continental region of each province's modern " +
    "country (`historical/p4/province_modern_country_1900.json`). WPP: UN World Population Prospects 2024 " +
    "estimates (`validation/wpp_regions_1975_2000.json`). WPP is never a simulation input (D-124).",
);
lines.push("");
lines.push(`Last year reached by the run: **${String(lastYear)}**.`);
lines.push("");
if (note !== null) {
  lines.push(`Run status: ${note}`);
  lines.push("");
}
const years = [1900, 1925, 1950, 1975, 2000];
if (!years.includes(lastYear)) years.push(lastYear);
years.sort((a, b) => a - b);
for (const year of years) {
  const target = year === 1975 || year === 2000;
  lines.push(`## ${String(year)}${target ? " — against WPP 2024" : " — game only"}`);
  lines.push("");
  if (year > lastYear) {
    lines.push(`Not reached: the run ended in ${String(lastYear)}.`);
    lines.push("");
    continue;
  }
  if (target) {
    lines.push("| Region | TFR game | TFR WPP | e0 game | e0 WPP | CBR game | CBR WPP | CDR game | CDR WPP | Pop. game (M) | Pop. WPP (M) |");
    lines.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
  } else {
    lines.push("| Region | TFR | e0 | CBR | CDR | Urban % | Women literate % | Food % | Pop. (M) |");
    lines.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|");
  }
  for (const [key, name] of REGIONS) {
    const game = rowsByKey.get(`${key}:${String(year)}`);
    if (game === undefined) continue;
    if (target) {
      const ref = wpp.regions[key]?.[String(year)] ?? {};
      lines.push(
        `| ${name} | ${fmt(game.totalFertility, 2)} | ${fmt(ref.tfr, 2)} | ${fmt(game.lifeExpectancy)} | ${fmt(ref.lifeExpectancy)} | ${fmt(game.crudeBirthRate)} | ${fmt(ref.crudeBirthRate)} | ${fmt(game.crudeDeathRate)} | ${fmt(ref.crudeDeathRate)} | ${millions(game.population)} | ${millions(ref.population)} |`,
      );
    } else {
      lines.push(
        `| ${name} | ${fmt(game.totalFertility, 2)} | ${fmt(game.lifeExpectancy)} | ${fmt(game.crudeBirthRate)} | ${fmt(game.crudeDeathRate)} | ${fmt(game.urbanShare * 100)} | ${fmt(game.femaleLiteracy * 100)} | ${fmt(game.foodSufficiency * 100)} | ${millions(game.population)} |`,
      );
    }
  }
  lines.push("");
}
lines.push("## Reading the comparison");
lines.push("");
lines.push(
  "Differences are diagnostics for P15, which calibrates the provisional P4 coefficients only after a " +
    "structural cause is identified (GDD §6.6). They are not corrected by forcing any trajectory.",
);
writeFileSync(out, `${lines.join("\n")}\n`);
console.log(`wrote ${out} (last year ${String(lastYear)})`);
