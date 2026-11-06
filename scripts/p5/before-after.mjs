#!/usr/bin/env node
/**
 * P5 (D-143) before/after report of the no-input 1900 world: food eaten, crude birth and
 * death rates and population by region, from two runs of
 *   node packages/bench/dist/p4Demography.js run <days> --out <file>
 * one on `main` (before) and one on the P5 branch (after), same seed.
 *
 * Usage: node scripts/p5/before-after.mjs <before.json> <after.json> [out.md]
 */
import { readFileSync, writeFileSync } from "node:fs";

const [beforePath, afterPath, outPath = "docs/P5_BEFORE_AFTER.md"] = process.argv.slice(2);
if (beforePath === undefined || afterPath === undefined) {
  console.error("usage: node scripts/p5/before-after.mjs <before.json> <after.json> [out.md]");
  process.exit(1);
}
const before = JSON.parse(readFileSync(beforePath, "utf8"));
const after = JSON.parse(readFileSync(afterPath, "utf8"));
const key = (row) => `${row.year}:${row.region}`;
const afterRows = new Map(after.rows.map((row) => [key(row), row]));
const years = [...new Set(before.rows.map((row) => row.year))].filter((year) => after.rows.some((row) => row.year === year)).sort();
const regions = [...new Set(before.rows.map((row) => row.region))].sort((a, b) => (a === "world" ? 1 : b === "world" ? -1 : a.localeCompare(b)));

const f1 = (value) => value.toFixed(1);
const lines = [
  "# P5 — before and after own consumption (no-input 1900 world)",
  "",
  `Seed ${String(before.seed)}; indicators on 1 January of each year (\`packages/bench/src/p4Demography.ts\`). Before: \`main\` (P4). After: the P5 branch (land, harvest weather, own consumption, deposits). Regions are the UN continental regions of each province's modern country. Food is the population-weighted share of the 1,950 kcal requirement eaten (P4 food sufficiency, 30-day smoothing).`,
  "",
  "## World",
  "",
  "| Year | Food before | Food after | CBR before | CBR after | CDR before | CDR after | Pop. before (M) | Pop. after (M) |",
  "|---|---:|---:|---:|---:|---:|---:|---:|---:|",
];
for (const year of years) {
  const b = before.rows.find((row) => row.year === year && row.region === "world");
  const a = afterRows.get(`${year}:world`);
  if (b === undefined || a === undefined) continue;
  lines.push(
    `| ${year} | ${f1(b.foodSufficiency * 100)} % | ${f1(a.foodSufficiency * 100)} % | ${f1(b.crudeBirthRate)} | ${f1(a.crudeBirthRate)} | ${f1(b.crudeDeathRate)} | ${f1(a.crudeDeathRate)} | ${f1(b.population / 1e6)} | ${f1(a.population / 1e6)} |`,
  );
}
for (const year of years.slice(1)) {
  lines.push("", `## ${year} by region`, "", "| Region | Food before | Food after | CBR before | CBR after | CDR before | CDR after | Pop. before (M) | Pop. after (M) |", "|---|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const region of regions) {
    const b = before.rows.find((row) => row.year === year && row.region === region);
    const a = afterRows.get(`${year}:${region}`);
    if (b === undefined || a === undefined) continue;
    lines.push(
      `| ${region} | ${f1(b.foodSufficiency * 100)} % | ${f1(a.foodSufficiency * 100)} % | ${f1(b.crudeBirthRate)} | ${f1(a.crudeBirthRate)} | ${f1(b.crudeDeathRate)} | ${f1(a.crudeDeathRate)} | ${f1(b.population / 1e6)} | ${f1(a.population / 1e6)} |`,
    );
  }
}
lines.push(
  "",
  "## Reading",
  "",
  "- **What own consumption removes.** Farm households now eat their own subsistence food whatever the cash circuit does, so world food eaten after the first year is about 58–64 % instead of 40–46 %, and five years lose about 91 million people instead of 179 million. The gain is largest where farm households are most of the people: Asia (29 % → 56 % of the requirement in 1905) and Africa (27 % → 60 %).",
  "- **What remains.** Everyone without a farm still eats only what wages buy, and the 1900 world has jobs for few of them: wages are fixed (P7), there is no private investment (P10), and mines, industry and services only arrive with the P5b catalogue. Europe and Northern America, where farm households are a minority, barely move (Europe 59 % → 60 % in 1905). Food eaten is still about 58 %, the crude death rate about 44 per 1,000, and the world still loses population. These are economic causes, not demographic ones.",
  "- Land, harvest weather and deposits are not what changes these figures: day-0 farm output is unchanged by construction and the weather averages to 1 across provinces.",
);
writeFileSync(outPath, `${lines.join("\n")}\n`);
console.log(`wrote ${outPath} (${String(years.length)} years)`);
