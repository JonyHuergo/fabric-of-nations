#!/usr/bin/env node
/**
 * P2 (D-129): sourced corrections to 1900 population totals and Cuba's province owner.
 *
 * The committed M11 tables were edited after scripts/m11/build-world-data.mjs last ran,
 * so that generator is not re-run; each value is patched in every place it appears:
 * the polity catalog, the population blocks of the polity's region (scaled
 * proportionally, integer-exact), that region's building levels (scaled the same way,
 * at least 1), the calibration target, the scenario country metadata and the app world
 * catalog. Province-level totals for the German Pacific islands, which HYDE does not
 * cover, are written to province_population_1900.json for the P2 scenario builder.
 *
 * The script is idempotent: it sets values, it does not apply factors twice.
 *
 * Usage: node scripts/p2/apply-1900-data-corrections.mjs
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const M11 = join(ROOT, "packages/data/data/historical/m11");
const MAP = join(ROOT, "packages/data/data/map");
const SCENARIO = join(ROOT, "packages/data/data/scenarios/m11_world_1900.json");
const CATALOG_TS = join(ROOT, "packages/app/src/generated/worldCatalog.ts");

const SOURCE_ID = "p2-population-review-1900";
const CORRECTIONS = [
  {
    tag: "WAD",
    population: 1_000_000,
    confidence: "low",
    note:
      "P2 review (D-129): Nachtigal's 2.6 million (1870s) covered Wadai with Bagirmi; Britannica records a fall from over 2 million in the 1870s to about 300,000 by 1917, and HYDE 3.3 gives 0.34 million for the modern Ouaddai grid. 1.0 million is a low-confidence midpoint for 1900.",
  },
  {
    tag: "DAR",
    population: 600_000,
    confidence: "low",
    note:
      "P2 review (D-129): the Nuttall Encyclopaedia (1907) gives about 500,000 c. 1900, a British government document of the period 'probably under 1,000,000', and HYDE 3.3 0.64 million; 600,000 is a low-confidence estimate between them.",
  },
  {
    tag: "GUM",
    population: 9_676,
    confidence: "high",
    note: "P2 review (D-129): United States naval government census of 1901, 9,676 (a later Navy report gives 9,630).",
  },
  {
    tag: "GPN",
    population: 58_500,
    confidence: "low",
    note:
      "P2 review (D-129): c. 1900 estimates of the Carolines 36,000, Marshall Islands 15,000, Palau 4,000, German Northern Marianas 2,000 and Nauru 1,500; no German colonial census for 1900 was found.",
  },
];
const GPN_GROUPS = [
  { match: /caroline/, population: 36_000, label: "Caroline Islands" },
  { match: /marshall/, population: 15_000, label: "Marshall Islands" },
  { match: /palau/, population: 4_000, label: "Palau" },
  { match: /marianas/, population: 2_000, label: "German Northern Marianas" },
  { match: /nauru/, population: 1_500, label: "Nauru" },
];

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const writeJson = (path, value, compact = false) =>
  writeFileSync(path, compact ? JSON.stringify(value) : `${JSON.stringify(value, null, 2)}\n`, "utf8");

const polities = readJson(join(M11, "polities_1900.json"));
const pops = readJson(join(M11, "pops_1900.json"));
const buildings = readJson(join(M11, "buildings_1900.json"));
const targets = readJson(join(M11, "calibration_targets_1900.json"));
const countries = readJson(join(M11, "countries_1900.json"));
const scenario = readJson(SCENARIO);
let catalogTs = readFileSync(CATALOG_TS, "utf8");
const popList = Array.isArray(pops) ? pops : pops.pops;
const buildingList = Array.isArray(buildings) ? buildings : buildings.buildings;
const countryList = Array.isArray(countries) ? countries : countries.countries;
const targetList = Array.isArray(targets) ? targets : targets.targets;
const log = [];

function regionOf(tag) {
  const country = countryList.find((entry) => entry.tag === tag);
  if (country !== undefined) return country.regionIds[0];
  const meta = scenario.meta.regionMeta.find((entry) => entry.polityTag === tag);
  if (meta === undefined) throw new Error(`no region for ${tag}`);
  return meta.regionId;
}

/** Scale integer counts to a new total exactly (largest remainder, ties by index). */
function apportion(counts, total) {
  const sum = counts.reduce((a, b) => a + b, 0);
  const exact = counts.map((count) => (count * total) / sum);
  const floors = exact.map(Math.floor);
  let remainder = total - floors.reduce((a, b) => a + b, 0);
  const order = exact.map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (const { index } of order) {
    if (remainder <= 0) break;
    floors[index] += 1;
    remainder -= 1;
  }
  return floors;
}

for (const correction of CORRECTIONS) {
  const entry = [...polities.states, ...polities.territories].find((candidate) => candidate.tag === correction.tag);
  if (entry === undefined) throw new Error(`unknown polity ${correction.tag}`);
  entry.population1900 = correction.population;
  entry.confidence = correction.confidence;
  if (!entry.notes.includes("P2 review (D-129)")) entry.notes = `${entry.notes} ${correction.note}`.trim();
  if (!entry.sources.includes(SOURCE_ID)) entry.sources.push(SOURCE_ID);

  const regionId = regionOf(correction.tag);
  const blocks = popList.filter((block) => block.regionId === regionId);
  if (blocks.length === 0) throw new Error(`no population blocks for ${correction.tag}`);
  const before = blocks.reduce((sum, block) => sum + block.population, 0);
  const scaled = apportion(blocks.map((block) => block.population), correction.population);
  blocks.forEach((block, index) => {
    block.population = scaled[index];
  });
  const factor = correction.population / before;
  for (const building of buildingList.filter((candidate) => candidate.regionId === regionId)) {
    if (factor !== 1) building.level = Math.max(1, Math.round(building.level * factor));
  }

  // Country targets aggregate the state and its dependent territories, so a territory
  // correction moves its sovereign country target by the same difference.
  const delta = correction.population - before;
  const targetTag = entry.kind === "territory" || entry.sovereignTag ? entry.sovereignTag ?? correction.tag : correction.tag;
  for (const target of targetList) {
    if (target.countryTag === targetTag && target.metric === "totalPopulation") target.target += delta;
  }
  for (const meta of scenario.meta.countryMeta ?? []) {
    if (meta.countryId === entry.id && "population1900Estimate" in meta) {
      meta.population1900Estimate = correction.population;
      meta.confidence = correction.confidence;
    }
  }
  const at = catalogTs.indexOf(`"tag": "${correction.tag}"`);
  if (at < 0) throw new Error(`world catalog has no ${correction.tag}`);
  const rest = catalogTs.slice(at);
  const match = /"population1900": \d+/.exec(rest);
  if (match === null) throw new Error(`world catalog has no population for ${correction.tag}`);
  catalogTs = catalogTs.slice(0, at) + rest.replace(match[0], `"population1900": ${String(correction.population)}`);
  log.push(`${correction.tag}: ${String(before)} -> ${String(correction.population)} (buildings x${factor.toFixed(3)})`);
}

// Occupation targets are exact shares of the population blocks (tolerance 1e-6), so they
// are recomputed for every country whose blocks changed, including territory sovereigns.
const affected = new Set();
for (const correction of CORRECTIONS) {
  const entry = [...polities.states, ...polities.territories].find((candidate) => candidate.tag === correction.tag);
  affected.add(entry.sovereignTag ?? correction.tag);
}
for (const tag of affected) {
  const country = countryList.find((candidate) => candidate.tag === tag);
  const regions = new Set(country.regionIds);
  let total = 0;
  let peasants = 0;
  for (const block of popList) {
    if (!regions.has(block.regionId)) continue;
    total += block.population;
    if (block.professionKey === "peasants") peasants += block.population;
  }
  for (const target of targetList) {
    if (target.countryTag === tag && target.metric === "peasantPopulationShare") target.target = peasants / total;
    if (target.countryTag === tag && target.metric === "totalPopulation") target.target = total;
  }
}

// Province-level totals where HYDE has no population (D-121 fallback with sources).
const oceania = readJson(join(MAP, "provinces_oceania_1900.json"));
// Coverage residuals (oc-gap-*) are gap fillers and receive no population of their own.
const gpnProvinces = oceania.provinces.filter(
  (province) => province.mapTag === "GPN" && !province.key.startsWith("oc-gap-"),
);
const groups = GPN_GROUPS.map((group) => ({
  label: group.label,
  population: group.population,
  provinceKeys: gpnProvinces.filter((province) => group.match.test(province.key)).map((province) => province.key),
}));
const unassigned = gpnProvinces.filter((province) => !groups.some((group) => group.provinceKeys.includes(province.key)));
if (unassigned.length > 0) throw new Error(`GPN provinces without a group: ${unassigned.map((p) => p.key).join(", ")}`);
writeJson(join(MAP, "province_population_1900.json"), {
  meta: {
    purpose:
      "Sourced 1900 population totals for provinces that HYDE 3.3 leaves empty. Each group total is split over its provinces by land area in the P2 scenario builder.",
    decision: "D-129",
    sourceIds: [SOURCE_ID],
  },
  groups: [
    ...groups,
    { label: "Guam", population: 9_676, provinceKeys: ["oc-gum-guam"] },
    { label: "Monaco", population: 15_000, provinceKeys: ["mco-monaco"] },
  ],
});

// Cuba: Spain relinquished it in 1898 and the United States governed it militarily until
// independence in 1902 without annexing it. Its provinces are owned by the 1900 Cuba
// country (catalog status "occupation") and controlled by the United States, using the
// D-081 owner/controller separation instead of United States ownership.
const cuba = polities.states.find((state) => state.tag === "CUB");
const americas = readJson(join(MAP, "provinces_americas_1900.json"));
let cubaChanged = 0;
for (const province of americas.provinces) {
  if (province.mapTag !== "CUB") continue;
  const usa = polities.states.find((state) => state.tag === "USA");
  province.initialControllerPolityId = usa.id;
  if (province.initialOwnerPolityId !== cuba.id) {
    province.initialOwnerPolityId = cuba.id;
    province.initialOwnerTag = "CUB";
    cubaChanged += 1;
  }
}

writeJson(join(M11, "polities_1900.json"), polities);
writeJson(join(M11, "pops_1900.json"), pops);
writeJson(join(M11, "buildings_1900.json"), buildings);
writeJson(join(M11, "calibration_targets_1900.json"), targets);
writeJson(SCENARIO, scenario);
writeJson(join(MAP, "provinces_americas_1900.json"), americas, true);
writeFileSync(CATALOG_TS, catalogTs, "utf8");
console.log(log.join("\n"));
console.log(`Cuba provinces reassigned to country ${String(cuba.id)}: ${String(cubaChanged)}`);
