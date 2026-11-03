#!/usr/bin/env node
/**
 * P2 (D-132): reconcile province ownership with the authored 1900 territory catalog.
 *
 * Decided by the designer on 2026-11-02:
 * - Egypt's provinces are owned by the Ottoman Empire (de jure suzerain, khedivate)
 *   and controlled by the United Kingdom (occupation since 1882), the D-081
 *   owner/controller separation already used for Cuba (D-129).
 * - Newfoundland is owned by the United Kingdom, its 1900 sovereign (it carried the
 *   registry id of a later polity).
 * - Tokelau (a British protectorate in 1900) and the British residual of New Guinea
 *   move to the British Pacific and Indian Ocean islands territory.
 * - Goa becomes the Portuguese India territory of Portugal, with the 1900 census
 *   population (475,513, census of 1 December 1900, as tabulated by the Government of
 *   Goa, Economic Survey 2016-17) and the occupation mix, per-capita values and
 *   per-capita building levels of Portugal's Asian territories (Timor and Macao).
 *   Portugal's calibration targets are recomputed.
 *
 * Inputs and outputs: the five province bundles, territories, population, building,
 * country and calibration tables in historical/m11. Idempotent: values are set, not
 * applied twice. Run before sync-app-provinces.mjs and build-province-scenario.mjs.
 *
 * Usage: node scripts/p2/apply-1900-ownership-corrections.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const M11 = join(ROOT, "packages/data/data/historical/m11");
const MAP = join(ROOT, "packages/data/data/map");
const BUNDLES = [
  "provinces_1900",
  "provinces_africa_1900",
  "provinces_americas_1900",
  "provinces_asia_1900",
  "provinces_oceania_1900",
];
const read = (path) => JSON.parse(readFileSync(path, "utf8"));
const writeTable = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);

const GOA_POPULATION = 475_513;
const GOA_SOURCE = {
  id: "goa-census-1900",
  citation:
    "Portuguese census of Goa, 1 December 1900: 475,513 inhabitants (227,393 and 248,120 by sex), as tabulated in Government of Goa, Directorate of Planning, Statistics and Evaluation, Economic Survey 2016-17, Part 1.",
};

const countries = read(join(M11, "countries_1900.json"));
const territories = read(join(M11, "territories_1900.json"));
const pops = read(join(M11, "pops_1900.json"));
const buildings = read(join(M11, "buildings_1900.json"));
const calibration = read(join(M11, "calibration_targets_1900.json"));
const countryByTag = new Map(countries.map((country) => [country.tag, country]));
const territoryByTag = new Map(territories.map((territory) => [territory.polityTag, territory]));
const OTT = countryByTag.get("OTT");
const GBR = countryByTag.get("GBR");
const PRT = countryByTag.get("PRT");

// 1. Province bundles: owners and controllers.
const egypt = new Set(territoryByTag.get("EGY").provinceKeys);
for (const bundle of BUNDLES) {
  const path = join(MAP, `${bundle}.json`);
  const data = read(path);
  let changed = false;
  for (const province of data.provinces) {
    if (egypt.has(province.key)) {
      if (province.initialOwnerPolityId !== OTT.id || province.initialControllerPolityId !== GBR.id) {
        province.initialOwnerPolityId = OTT.id;
        province.initialOwnerTag = OTT.tag;
        province.initialControllerPolityId = GBR.id;
        province.notes = `${province.notes.replace(/ P2 \(D-132\).*$/u, "")} P2 (D-132): de jure Ottoman (khedivate), under British occupation since 1882.`.trim();
        changed = true;
      }
    } else if (province.key === "am-nfd-newfoundland-and-labrador" && province.initialOwnerPolityId !== GBR.id) {
      province.initialOwnerPolityId = GBR.id;
      province.initialOwnerTag = GBR.tag;
      changed = true;
    } else if (province.key === "as-bin-goa" && province.mapTag !== PRT.tag) {
      // The map shows Goa as Portuguese; its simulation territory is Portuguese India.
      province.mapTag = PRT.tag;
      changed = true;
    }
  }
  if (changed) writeFileSync(path, JSON.stringify(data));
}

// 2. Territories: moves and the new Portuguese India territory.
const move = (provinceKey, toTag) => {
  for (const territory of territories) {
    territory.provinceKeys = territory.provinceKeys.filter((key) => key !== provinceKey);
  }
  const target = territoryByTag.get(toTag);
  if (!target.provinceKeys.includes(provinceKey)) target.provinceKeys.push(provinceKey);
  target.provinceKeys.sort();
};
move("oc-nzl-tokelau", "BPO");
move("oc-gap-gng-residual", "BPO");
let goa = territoryByTag.get("GOA");
if (goa === undefined) {
  goa = {
    id: Math.max(...territories.map((territory) => territory.id)) + 1,
    key: "goa",
    name: "Portuguese India",
    polityTag: "GOA",
    kind: "dependent",
    historicalName: "Estado da India (Portuguese India)",
    status: "colony",
    sovereignCountryId: PRT.id,
    capitalName: "Nova Goa (Panjim)",
    selectable: false,
    confidence: "medium",
    notes:
      "P2 (D-132): Goa only; Daman and Diu are not separate provinces on the map. Population from the census of 1 December 1900; occupation mix from Portugal's Asian territories.",
    infrastructure: territoryByTag.get("MAC").infrastructure,
    provinceKeys: [],
    sourceIds: [GOA_SOURCE.id, "project-authored-p2"],
    calibrationStatus: "provisional",
  };
  territories.push(goa);
  territoryByTag.set("GOA", goa);
}
move("as-bin-goa", "GOA");
if (!PRT.territoryIds.includes(goa.id)) PRT.territoryIds = [...PRT.territoryIds, goa.id].sort((a, b) => a - b);

// 3. Goa population and buildings from Portugal's Asian territories.
const asian = new Set([territoryByTag.get("PTM").id, territoryByTag.get("MAC").id]);
const asianRows = pops.filter((row) => asian.has(row.territoryId));
const asianTotal = asianRows.reduce((sum, row) => sum + row.population, 0);
const byProfession = new Map();
for (const row of asianRows) {
  const entry = byProfession.get(row.professionKey) ?? { population: 0, literacy: 0, wealth: 0, savings: 0, militancy: 0 };
  entry.population += row.population;
  entry.literacy += row.literacy * row.population;
  entry.wealth += row.wealthLevel * row.population;
  entry.savings += row.savingsPerCapitaRUSD * row.population;
  entry.militancy += row.militancy * row.population;
  byProfession.set(row.professionKey, entry);
}
const professions = [...byProfession.keys()].sort();
const shares = professions.map((key) => (GOA_POPULATION * byProfession.get(key).population) / asianTotal);
const counts = shares.map(Math.floor);
const order = shares
  .map((share, index) => ({ index, remainder: share - Math.floor(share) }))
  .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
for (let k = 0; k < GOA_POPULATION - counts.reduce((a, b) => a + b, 0); k += 1) counts[order[k].index] += 1;
const goaRows = professions.map((key, index) => {
  const entry = byProfession.get(key);
  return {
    territoryId: goa.id,
    professionKey: key,
    population: counts[index],
    literacy: Math.round((entry.literacy / entry.population) * 1000) / 1000,
    wealthLevel: Math.round(entry.wealth / entry.population),
    savingsPerCapitaRUSD: Math.round(entry.savings / entry.population),
    militancy: Math.round((entry.militancy / entry.population) * 100) / 100,
    sourceIds: [GOA_SOURCE.id, "project-authored-p2"],
    calibrationStatus: "provisional",
  };
});
const otherPops = pops.filter((row) => row.territoryId !== goa.id);
writeTable(join(M11, "pops_1900.json"), [...otherPops, ...goaRows]);

const asianBuildings = buildings.filter((row) => asian.has(row.territoryId));
const levelByDefinition = new Map();
const cashPerLevel = new Map();
const ownerByDefinition = new Map();
for (const row of asianBuildings) {
  levelByDefinition.set(row.definitionKey, (levelByDefinition.get(row.definitionKey) ?? 0) + row.level);
  cashPerLevel.set(row.definitionKey, row.operatingCashRUSD / row.level);
  ownerByDefinition.set(row.definitionKey, row.ownerProfessionKey);
}
const scale = GOA_POPULATION / asianTotal;
const goaBuildings = [...levelByDefinition.keys()].sort().map((definitionKey) => {
  const level = Math.max(1, Math.round(levelByDefinition.get(definitionKey) * scale));
  return {
    key: `goa-${definitionKey}`,
    territoryId: goa.id,
    definitionKey,
    level,
    ownerProfessionKey: ownerByDefinition.get(definitionKey),
    operatingCashRUSD: Math.round(cashPerLevel.get(definitionKey) * level),
    status: "provisional",
  };
});
writeTable(join(M11, "buildings_1900.json"), [...buildings.filter((row) => row.territoryId !== goa.id), ...goaBuildings]);

// 4. Portugal's calibration targets.
const prtTerritories = new Set(PRT.territoryIds);
const prtRows = [...otherPops, ...goaRows].filter((row) => prtTerritories.has(row.territoryId));
const prtTotal = prtRows.reduce((sum, row) => sum + row.population, 0);
const prtPeasants = prtRows.filter((row) => row.professionKey === "peasants").reduce((sum, row) => sum + row.population, 0);
for (const target of calibration) {
  if (target.countryTag !== "PRT") continue;
  if (target.metric === "totalPopulation") target.target = prtTotal;
  if (target.metric === "peasantPopulationShare") target.target = prtPeasants / prtTotal;
  if (!target.sourceIds.includes(GOA_SOURCE.id)) target.sourceIds = [...target.sourceIds, GOA_SOURCE.id];
}
writeTable(join(M11, "calibration_targets_1900.json"), calibration);
writeTable(join(M11, "territories_1900.json"), territories);
writeTable(join(M11, "countries_1900.json"), countries);

// The source record itself is added to the scenario sources by build-province-scenario.mjs.
console.log(
  `Portuguese India: ${goaRows.map((row) => `${row.professionKey} ${row.population}`).join(", ")}; buildings ${goaBuildings.map((row) => `${row.definitionKey} ${row.level}`).join(", ")}; Portugal total ${prtTotal}.`,
);
