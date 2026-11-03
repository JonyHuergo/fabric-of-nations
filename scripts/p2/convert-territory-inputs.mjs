#!/usr/bin/env node
/**
 * P2 (D-118, D-131): one-time conversion of the authored M11 region-level tables into
 * territory tables.
 *
 * The M11 tables describe 133 catalog entries (67 states and 66 dependent
 * territories) as "regions". From P2 they are authored *territory* inputs: country
 * totals and occupation mixes that `build-province-scenario.mjs` distributes over the
 * provinces of each territory. This script:
 *
 * - writes `territories_1900.json` from `regions_1900.json` plus the scenario's
 *   `regionMeta`, adding each territory's `polityTag` and its province keys. The
 *   province link is the M12 bundle field `simulationRegionId`, except that
 *   `aut-hultschin` belongs to the German territory after the D-128 owner change;
 * - renames `regionId` to `territoryId` in the population and building tables and
 *   `regionIds` to `territoryIds` in the country and market tables;
 * - removes `regions_1900.json`, `trade_routes_1900.json` (routes are generated
 *   from province borders, D-119) and `regionMeta` from the scenario meta.
 *
 * Idempotent: once `territories_1900.json` exists, it reports and exits.
 * Run before `strip-simulation-region-ids.mjs`, which deletes the bundle field.
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("../../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const M11 = join(ROOT, "packages/data/data/historical/m11");
const MAP = join(ROOT, "packages/data/data/map");
const SCENARIO = join(ROOT, "packages/data/data/scenarios/m11_world_1900.json");
const BUNDLES = [
  "provinces_1900",
  "provinces_africa_1900",
  "provinces_americas_1900",
  "provinces_asia_1900",
  "provinces_oceania_1900",
];
/** D-128: Hultschin was Prussian in 1900; its population belongs to the German total. */
const LINK_OVERRIDES = new Map([["aut-hultschin", "DEU"]]);

const read = (path) => JSON.parse(readFileSync(path, "utf8"));
const write = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);

if (existsSync(join(M11, "territories_1900.json"))) {
  console.log("territories_1900.json already exists; nothing to convert.");
  process.exit(0);
}

const regions = read(join(M11, "regions_1900.json"));
const countries = read(join(M11, "countries_1900.json"));
const scenario = read(SCENARIO);
const regionMeta = scenario.meta.regionMeta;
const metaByRegion = new Map(regionMeta.map((meta) => [meta.regionId, meta]));

// Territory polity tag: the dependent territory's tag, else its country's tag.
const tagByRegion = new Map();
for (const meta of regionMeta) tagByRegion.set(meta.regionId, meta.polityTag);
for (const country of countries) {
  for (const regionId of country.regionIds) {
    if (!tagByRegion.has(regionId)) tagByRegion.set(regionId, country.tag);
  }
}
const regionByTag = new Map([...tagByRegion].map(([regionId, tag]) => [tag, regionId]));

const provinceKeysByRegion = new Map(regions.map((region) => [region.id, []]));
for (const bundle of BUNDLES) {
  for (const province of read(join(MAP, `${bundle}.json`)).provinces) {
    const override = LINK_OVERRIDES.get(province.key);
    const regionId = override === undefined ? province.simulationRegionId : regionByTag.get(override);
    if (!provinceKeysByRegion.has(regionId)) {
      throw new Error(`province ${province.key} links to unknown region ${regionId}`);
    }
    provinceKeysByRegion.get(regionId).push(province.key);
  }
}

const territories = regions.map((region) => {
  const meta = metaByRegion.get(region.id);
  const provinceKeys = provinceKeysByRegion.get(region.id).sort();
  if (provinceKeys.length === 0) throw new Error(`territory ${region.key} has no province`);
  return {
    id: region.id,
    key: region.key,
    name: region.name,
    polityTag: tagByRegion.get(region.id),
    kind: meta === undefined ? "home" : "dependent",
    ...(meta === undefined
      ? {}
      : {
          historicalName: meta.historicalName,
          status: meta.status,
          sovereignCountryId: meta.sovereignCountryId,
          capitalName: meta.capitalName,
          selectable: meta.selectable,
          confidence: meta.confidence,
          notes: meta.notes,
        }),
    infrastructure: region.infrastructure,
    provinceKeys,
    sourceIds: region.sourceIds,
    calibrationStatus: region.calibrationStatus,
  };
});
write(join(M11, "territories_1900.json"), territories);

const renameKey = (record, from, to) => {
  const out = {};
  for (const [key, value] of Object.entries(record)) out[key === from ? to : key] = value;
  return out;
};
write(join(M11, "pops_1900.json"), read(join(M11, "pops_1900.json")).map((row) => renameKey(row, "regionId", "territoryId")));
write(join(M11, "buildings_1900.json"), read(join(M11, "buildings_1900.json")).map((row) => renameKey(row, "regionId", "territoryId")));
write(join(M11, "countries_1900.json"), countries.map((row) => renameKey(row, "regionIds", "territoryIds")));
write(join(M11, "markets_1900.json"), read(join(M11, "markets_1900.json")).map((row) => renameKey(row, "regionIds", "territoryIds")));
rmSync(join(M11, "regions_1900.json"));
rmSync(join(M11, "trade_routes_1900.json"));
delete scenario.meta.regionMeta;
write(SCENARIO, scenario);
console.log(`Wrote ${territories.length} territories (${[...provinceKeysByRegion.values()].reduce((sum, keys) => sum + keys.length, 0)} provinces).`);
