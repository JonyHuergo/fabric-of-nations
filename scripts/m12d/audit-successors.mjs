/**
 * M12d Americas successor audit (verification tool, not part of the bundle build).
 *
 * Reports, from the committed Americas bundle:
 *  - every modern successor state that has provinces;
 *  - which twentieth-century American land borders are backed by a province edge
 *    and which are not;
 *  - the historical/breakaway registry entries added by D-107;
 *  - the decolonisation / transfer groups that the M12d test drives.
 *
 * Run: node scripts/m12d/audit-successors.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const BUNDLE = JSON.parse(
  readFileSync(resolve(ROOT, "packages/data/data/map/provinces_americas_1900.json"), "utf8"),
);

/** Province key prefix rules to the modern successor state tag. */
const RULES = [
  ["am-usa-", "USA"],
  ["am-can-", "CAN"],
  ["am-nfd-", "CAN"],
  ["am-mex-", "MEX"],
  ["am-gua-", "GUA"],
  ["am-hon-", "HON"],
  ["am-sal-", "SAL"],
  ["am-nic-", "NIC"],
  ["am-cos-", "COS"],
  ["am-col-", "COL"],
  ["am-pan-", "PAN"],
  ["am-ven-", "VEN"],
  ["am-ecu-", "ECU"],
  ["am-pru-", "PER"],
  ["am-bol-acre", "BRA"],
  ["am-bol-", "BOL"],
  ["am-chl-tacna", "PER"],
  ["am-chl-", "CHL"],
  ["am-arg-", "ARG"],
  ["am-ury-", "URY"],
  ["am-pry-", "PRY"],
  ["am-bra-", "BRA"],
  ["am-hti-", "HTI"],
  ["am-dom-", "DOM"],
  ["am-cub-", "CUB"],
  ["am-pri-", "PRI"],
  ["am-bwi-jam-", "JAM"],
  ["am-bwi-tto-", "TTO"],
  ["am-bwi-brb-", "BRB"],
  ["am-bwi-bhs-", "BHS"],
  ["am-bwi-bmu-", "BMU"],
  ["am-bwi-tca-", "TCA"],
  ["am-bwi-cym-", "CYM"],
  ["am-bwi-vgb-", "VGB"],
  ["am-bwi-aia-", "AIA"],
  ["am-bwi-atg-", "ATG"],
  ["am-bwi-kna-", "KNA"],
  ["am-bwi-msr-", "MSR"],
  ["am-bwi-dma-", "DMA"],
  ["am-bwi-lca-", "LCA"],
  ["am-bwi-vct-", "VCT"],
  ["am-bwi-grd-", "GRD"],
  ["am-bwi-blz-", "BLZ"],
  ["am-bwi-guy-", "GUY"],
  ["am-bsa-", "GBR"],
  ["am-fra-", "FRA"],
  ["am-fca-", "FRA"],
  ["am-dgc-", "NLD"],
  ["am-dwi-", "USA"],
  ["am-grl-", "DNK"],
  ["am-sur-", "SUR"],
];

function successorOf(key) {
  for (const [prefix, tag] of RULES) if (key.startsWith(prefix)) return tag;
  return "(unmapped)";
}

/** Every modern American sovereign land border that the derived border must draw. */
const EXPECTED = [
  ["USA", "CAN"], ["USA", "MEX"], ["MEX", "GUA"], ["MEX", "BLZ"],
  ["GUA", "BLZ"], ["GUA", "HON"], ["GUA", "SAL"], ["HON", "SAL"],
  ["HON", "NIC"], ["NIC", "COS"], ["COS", "PAN"], ["PAN", "COL"],
  ["COL", "VEN"], ["COL", "BRA"], ["COL", "ECU"], ["COL", "PER"],
  ["VEN", "BRA"], ["VEN", "GUY"], ["GUY", "BRA"], ["GUY", "SUR"],
  ["SUR", "BRA"], ["SUR", "FRA"], ["FRA", "BRA"], ["ECU", "PER"],
  ["PER", "BRA"], ["PER", "BOL"], ["PER", "CHL"], ["BOL", "BRA"],
  ["BOL", "PRY"], ["BOL", "ARG"], ["BOL", "CHL"], ["PRY", "ARG"],
  ["PRY", "BRA"], ["ARG", "BRA"], ["ARG", "URY"], ["ARG", "CHL"],
  ["BRA", "URY"], ["HTI", "DOM"],
];

/**
 * Every sovereign state that appears in the Americas between 1900 and 2000.
 * 1900 catalog polities are marked `catalog`; future successors are `future`.
 */
const STATES = [
  ["USA", "catalog"], ["CAN", "catalog"], ["MEX", "catalog"],
  ["GUA", "catalog"], ["HON", "catalog"], ["SAL", "catalog"],
  ["NIC", "catalog"], ["COS", "catalog"], ["COL", "catalog"],
  ["VEN", "catalog"], ["ECU", "catalog"], ["PER", "catalog"],
  ["BOL", "catalog"], ["CHL", "catalog"], ["ARG", "catalog"],
  ["URY", "catalog"], ["PRY", "catalog"], ["BRA", "catalog"],
  ["HTI", "catalog"], ["DOM", "catalog"], ["CUB", "catalog"],
  ["NFD", "registry"], ["PAN", "future"], ["JAM", "future"],
  ["TTO", "future"], ["BRB", "future"], ["GUY", "future"],
  ["BHS", "future"], ["GRD", "future"], ["SUR", "future"],
  ["DMA", "future"], ["LCA", "future"], ["VCT", "future"],
  ["ATG", "future"], ["BLZ", "future"], ["KNA", "future"],
];

const successorById = new Map();
const bySuccessor = new Map();
const unmapped = [];
for (const province of BUNDLE.provinces) {
  const tag = successorOf(province.key);
  successorById.set(province.id, tag);
  if (tag === "(unmapped)") unmapped.push(province.key);
  if (!bySuccessor.has(tag)) bySuccessor.set(tag, []);
  bySuccessor.get(tag).push(province.key);
}

const pairs = new Set();
for (const border of BUNDLE.borders) {
  if (border.b < 0) continue;
  const left = successorById.get(border.a);
  const right = successorById.get(border.b);
  if (left === undefined || right === undefined || left === right) continue;
  pairs.add(left < right ? `${left}|${right}` : `${right}|${left}`);
}

const keyOf = (left, right) => (left < right ? `${left}|${right}` : `${right}|${left}`);
const missing = EXPECTED.map(([left, right]) => keyOf(left, right)).filter(
  (key) => !pairs.has(key),
);

const futureTags = new Set(BUNDLE.futurePolities.map((polity) => polity.tag));
const missingStates = STATES.filter(([tag]) => !futureTags.has(tag) && !bySuccessor.has(tag));

/** Historical, breakaway and predecessor registry entries. */
const HISTORICAL = [
  "TEX", "RGR", "JUL", "RRG", "YUC", "CAL", "DES", "CSA", "HAW", "ACR",
  "AIA", "WIF", "CNU", "WFL", "FLR", "INS", "MDW", "RCN", "RLC", "SON",
  "LBC", "EQT", "BAH", "PEM", "GCO", "UPR", "ACF", "SBA", "PBC", "ERY",
];
const historicalEntries = BUNDLE.futurePolities.filter(
  (polity) => polity.kind === "historical",
);
const missingHistorical = HISTORICAL.filter(
  (tag) => !historicalEntries.some((polity) => polity.tag === tag),
);

console.log(`provinces: ${String(BUNDLE.provinces.length)}`);
console.log(`polity registry entries: ${String(BUNDLE.futurePolities.length)}`);
console.log(`historical/breakaway entries: ${String(historicalEntries.length)}`);
console.log(`historical entries missing: ${String(missingHistorical.length)}`);
for (const tag of missingHistorical) console.log(`  ${tag}`);
console.log(`successor groups with provinces: ${String(bySuccessor.size)}`);
console.log([...bySuccessor.keys()].sort().join(" "));
if (unmapped.length > 0) console.log(`unmapped province keys: ${unmapped.join(" ")}`);
console.log(`twentieth-century states checked: ${String(STATES.length)}`);
console.log(`states without a registered polity or province group: ${String(missingStates.length)}`);
for (const [tag] of missingStates) console.log(`  ${tag}`);
console.log(`modern sovereign land borders checked: ${String(EXPECTED.length)}`);
console.log(`without a province edge: ${String(missing.length)}`);
for (const key of missing) console.log(`  ${key}`);
console.log(
  "non-sovereign land border outside this audit: FRA|NLD (Saint-Martin / Sint Maarten); " +
    "both halves are separate provinces but the M11c land mask does not resolve the island.",
);
