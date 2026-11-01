/**
 * M12e Oceania successor audit (verification tool, not part of the bundle build).
 *
 * Reports, from the committed Oceania and earlier bundles:
 *  - every modern Oceanian successor group that has provinces;
 *  - the twentieth-century states and self-governing entities that are registered
 *    as 1900 catalog polities, future polities or historical entries;
 *  - every modern Oceanian land border (the only one is Papua New Guinea /
 *    Indonesia) and whether it is backed by a province edge;
 *  - the documented Oceanian historical/breakaway registry;
 *  - the global land-coverage result.
 *
 * Run: node scripts/m12e/audit-successors.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const OCEANIA = JSON.parse(
  readFileSync(resolve(ROOT, "packages/data/data/map/provinces_oceania_1900.json"), "utf8"),
);
const EUROPE = JSON.parse(
  readFileSync(resolve(ROOT, "packages/data/data/map/provinces_1900.json"), "utf8"),
);
const ASIA = JSON.parse(
  readFileSync(resolve(ROOT, "packages/data/data/map/provinces_asia_1900.json"), "utf8"),
);
const AFRICA = JSON.parse(
  readFileSync(resolve(ROOT, "packages/data/data/map/provinces_africa_1900.json"), "utf8"),
);
const AMERICAS = JSON.parse(
  readFileSync(resolve(ROOT, "packages/data/data/map/provinces_americas_1900.json"), "utf8"),
);
const GLOBAL = JSON.parse(
  readFileSync(resolve(ROOT, "packages/data/data/map/global_land_audit.json"), "utf8"),
);
const PROVINCES = [
  ...EUROPE.provinces,
  ...ASIA.provinces,
  ...AFRICA.provinces,
  ...AMERICAS.provinces,
  ...OCEANIA.provinces,
];
const PROVINCE_BY_ID = new Map(PROVINCES.map((province) => [province.id, province]));

/** Province key prefix -> the modern successor / holding tag. */
const RULES = [
  ["as-dei-", "IDN"],
  ["oc-aus-", "AUS"],
  ["oc-nzl-", "NZL"],
  ["oc-gng-", "PNG"],
  ["oc-bpo-papua-", "PNG"],
  ["oc-gap-gng-", "PNG"],
  ["oc-fji-", "FJI"],
  ["oc-bpo-solomon-", "SLB"],
  ["oc-bpo-new-hebrides-", "VUT"],
  ["oc-fpo-new-caledonia-", "NCL"],
  ["oc-gpn-nauru", "NRU"],
  ["oc-gpn-marshall-", "MHL"],
  ["oc-gpn-caroline-", "FSM"],
  ["oc-gpn-palau", "PLW"],
  ["oc-gpn-northern-marianas-", "MNP"],
  ["oc-gum-", "GUM"],
  ["oc-bpo-gilbert-", "KIR"],
  ["oc-bpo-line-", "KIR"],
  ["oc-bpo-phoenix-", "KIR"],
  ["oc-bpo-ellice-", "TUV"],
  ["oc-ton-", "TON"],
  ["oc-gsa-", "WSM"],
  ["oc-asm-", "ASM"],
  ["oc-bpo-cook-", "COK"],
  ["oc-bpo-niue", "NIU"],
  ["oc-nzl-tokelau", "TKL"],
  ["oc-fpo-windward-", "PYF"],
  ["oc-fpo-leeward-", "PYF"],
  ["oc-fpo-tuamotu-", "PYF"],
  ["oc-fpo-austral-", "PYF"],
  ["oc-fpo-marquesas-", "PYF"],
  ["oc-fpo-french-southern-", "FRA"],
  ["oc-fpo-wallis-", "WLF"],
  ["oc-fpo-futuna-", "WLF"],
  ["oc-bsa-pitcairn-", "GBR"],
  ["oc-bsa-chagos-", "GBR"],
  ["oc-bpo-heard-", "GBR"],
  ["oc-bpo-norfolk-", "AUS"],
  ["oc-chl-", "CHL"],
  ["oc-mex-", "MEX"],
  ["oc-usa-", "USA"],
  ["oc-gbr-", "GBR"],
  ["oc-nor-", "NOR"],
  ["oc-aut-", "AUT"],
  ["oc-fra-", "FRA"],
];

function successorOf(key) {
  for (const [prefix, tag] of RULES) if (key.startsWith(prefix)) return tag;
  return "(unmapped)";
}

const OCEANIAN_TAGS = new Set([
  "AUS", "NZL", "PNG", "FJI", "SLB", "VUT", "WSM", "TON", "TUV", "KIR",
  "NRU", "MHL", "FSM", "PLW", "COK", "NIU", "TKL", "MNP", "GUM", "ASM",
  "NCL", "PYF", "WLF", "GBR", "FRA", "USA", "CHL", "MEX", "NOR", "AUT", "IDN",
]);

/** The only modern Oceanian sovereign land border. */
const EXPECTED_BORDERS = [["PNG", "IDN"]];

/**
 * Every sovereign Oceanian state or self-governing entity between 1900 and 2000.
 * `catalog` = 1900 selectable catalog; `future` = 1400-1499 registry; `territory`
 * = 1900 map territory with no sovereignty transfer.
 */
const STATES = [
  ["AUS", "catalog+federation 1901"],
  ["NZL", "catalog (dominion 1907 status change)"],
  ["TON", "catalog (1970 protection ends)"],
  ["PNG", "future 1975"],
  ["FJI", "future 1970"],
  ["WSM", "future 1962"],
  ["NRU", "future 1968"],
  ["TUV", "future 1978"],
  ["SLB", "future 1978"],
  ["KIR", "future 1979"],
  ["VUT", "future 1980"],
  ["MHL", "future 1986"],
  ["FSM", "future 1986"],
  ["PLW", "future 1994"],
  ["COK", "future 1965 self-government"],
  ["NIU", "future 1974 self-government"],
  ["TKL", "1900 territory / 1926 New Zealand"],
  ["MNP", "future 1978 commonwealth"],
  ["NCL", "French territory (no sovereignty change)"],
  ["PYF", "French territory (no sovereignty change)"],
  ["WLF", "French territory (no sovereignty change)"],
  ["GUM", "1900 territory (United States)"],
  ["ASM", "1900 territory (United States)"],
  ["NFK", "1900 British dependency / 1914 Australia"],
  ["PCN", "British territory"],
  ["CXR", "British dependency / 1958 Australia (not exposed by the M11c map)"],
  ["CCK", "British dependency / 1955 Australia (not exposed by the M11c map)"],
  ["HMD", "British claim 1910 / Australia 1947 (unclaimed in 1900)"],
];

const byKey = new Map(OCEANIA.provinces.map((province) => [province.key, province]));
const successorById = new Map(
  PROVINCES.map((province) => [province.id, successorOf(province.key)]),
);
const bySuccessor = new Map();
const unmapped = [];
for (const province of OCEANIA.provinces) {
  const tag = successorOf(province.key);
  if (tag === "(unmapped)") {
    unmapped.push(province.key);
    continue;
  }
  if (!bySuccessor.has(tag)) bySuccessor.set(tag, []);
  bySuccessor.get(tag).push(province.key);
}

const pairs = new Set();
for (const border of OCEANIA.borders) {
  if (border.b < 0) continue;
  const left = successorById.get(border.a);
  const right = successorById.get(border.b);
  if (left === undefined || right === undefined || left === right) continue;
  if (!OCEANIAN_TAGS.has(left) || !OCEANIAN_TAGS.has(right)) continue;
  pairs.add(left < right ? `${left}|${right}` : `${right}|${left}`);
}

const keyOf = (left, right) => (left < right ? `${left}|${right}` : `${right}|${left}`);
const missing = EXPECTED_BORDERS.map(([left, right]) => keyOf(left, right)).filter(
  (key) => !pairs.has(key),
);
const unexpected = [...pairs].filter(
  (key) => !EXPECTED_BORDERS.some(([left, right]) => keyOf(left, right) === key),
);

const futureTags = new Set(OCEANIA.futurePolities.map((polity) => polity.tag));
const catalogTags = new Set();
for (const tag of ["AUS", "NZL", "TON"]) catalogTags.add(tag);
const territoryTags = new Set(["NFK", "GUM", "ASM", "TKL", "NCL", "PYF", "WLF", "PCN", "CXR", "CCK", "HMD"]);
const missingStates = STATES.filter(
  ([tag]) => !catalogTags.has(tag) && !futureTags.has(tag) && !territoryTags.has(tag),
);

const historical = OCEANIA.futurePolities.filter((polity) => polity.kind === "historical");

console.log(`provinces: ${String(OCEANIA.provinces.length)}`);
console.log(`future/registry entries: ${String(OCEANIA.futurePolities.length)}`);
console.log(`historical/breakaway entries: ${String(historical.length)}`);
console.log(`successor groups with provinces: ${String(bySuccessor.size)}`);
console.log([...bySuccessor.keys()].sort().join(" "));
if (unmapped.length > 0) {
  console.log(`global land-gap provinces outside Oceania (${String(unmapped.length)}):`);
  console.log(`  ${unmapped.sort().join(" ")}`);
}
console.log(`twentieth-century states checked: ${String(STATES.length)}`);
console.log(`states without a catalog/future/territory registration: ${String(missingStates.length)}`);
for (const [tag, kind] of missingStates) console.log(`  ${tag} (${kind})`);
console.log(`modern Oceanian sovereign land borders checked: ${String(EXPECTED_BORDERS.length)}`);
console.log(`without a province edge: ${String(missing.length)}`);
for (const key of missing) console.log(`  ${key}`);
console.log(`unexpected land-border pairs: ${String(unexpected.length)}`);
for (const key of unexpected) console.log(`  ${key}`);
console.log(
  `historical: ${historical.map((polity) => polity.tag).sort().join(" ")}`,
);
console.log(`1900 Oceanian owners with provinces: ${[
  ...new Set(
    OCEANIA.provinces
      .filter((province) => successorOf(province.key) !== "(unmapped)")
      .map((province) => province.initialOwnerTag),
  ),
].sort().join(" ")}`);
console.log(`1900 owners of global gap provinces: ${[
  ...new Set(
    OCEANIA.provinces
      .filter((province) => successorOf(province.key) === "(unmapped)")
      .map((province) => province.initialOwnerTag),
  ),
].sort().join(" ")}`);
console.log("documented non-exposed islands outside the land mask and admin-1 layer:");
for (const name of [
  "Ashmore and Cartier Islands (no land ring, no admin-1 unit)",
  "Coral Sea Islands (no land ring, no admin-1 unit)",
  "Minerva Reefs (no land ring, no admin-1 unit)",
]) {
  console.log(`  ${name}`);
}
console.log("global land audit:");
console.log(
  `  land rings=${String(GLOBAL.landRingCount)} non-Antarctic=${String(GLOBAL.totals.nonAntarcticLandRingCount)} assigned=${String(GLOBAL.totals.assignedRingCount)} unassigned=${String(GLOBAL.totals.unassignedRingCount)}`,
);
console.log(
  `  unassigned area=${String(GLOBAL.totals.unassignedArea)} sq deg; coastline band=${String(GLOBAL.totals.coastlineBandArea)} sq deg; exceptions=${String(GLOBAL.exceptions.list.length)}`,
);
console.log(
  `  map features without a province=${String(GLOBAL.features.featuresWithoutProvince.length)}; admin-1 unassigned units=${String(GLOBAL.admin1Units.unassignedUnitTotal)}`,
);
