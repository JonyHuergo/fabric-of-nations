/**
 * M12c successor audit (verification tool, not part of the bundle build).
 *
 * Reports, from the committed Africa bundle:
 *  - every modern successor state that has provinces;
 *  - which 20th-century African land borders are backed by a province edge and
 *    which are not (the three non-borders are documented in
 *    docs/AFRICA_PROVINCIALIZATION.md Â§9).
 *
 * Run: node scripts/m12c/audit-successors.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const BUNDLE = JSON.parse(
  readFileSync(resolve(ROOT, "packages/data/data/map/provinces_africa_1900.json"), "utf8"),
);

/** Province key prefix rules to the modern successor state tag. */
const RULES = [
  ["af-egy-", "EGY"],
  ["af-sud-bahr-el-ghazal", "SSD"],
  ["af-sud-equatoria", "SSD"],
  ["af-sud-upper-nile", "SSD"],
  ["af-sud-", "SDN"],
  ["af-dar-", "SDN"],
  ["af-wad-", "TCD"],
  ["af-sok-", "NGA"],
  ["af-bso-", "SOL"],
  ["af-its-", "SOM"],
  ["af-bea-jubaland", "SOM"],
  ["af-bea-buganda", "UGA"],
  ["af-bea-eastern-province", "UGA"],
  ["af-bea-northern-province", "UGA"],
  ["af-bea-western-province", "UGA"],
  ["af-bea-", "KEN"],
  ["af-eri-", "ERI"],
  ["af-eth-", "ETH"],
  ["af-gea-rwanda", "RWA"],
  ["af-gea-burundi", "BDI"],
  ["af-gea-", "TZA"],
  ["af-bpo-zanzibar", "TZA"],
  ["af-bpo-pemba", "TZA"],
  ["af-bpo-seychelles", "SYC"],
  ["af-bpo-mauritius", "MUS"],
  ["af-pai-bissau", "GNB"],
  ["af-pai-bafata", "GNB"],
  ["af-pai-bolama", "GNB"],
  ["af-pai-barlavento", "CPV"],
  ["af-pai-sotavento", "CPV"],
  ["af-pai-sao-tome", "STP"],
  ["af-pai-principe", "STP"],
  ["af-mad-grande-comore", "COM"],
  ["af-mad-anjouan", "COM"],
  ["af-mad-moheli", "COM"],
  ["af-mad-", "MDG"],
  ["af-fso-", "DJI"],
  ["af-tun-", "TUN"],
  ["af-mar-", "MAR"],
  ["af-alg-", "DZA"],
  ["af-lbr-", "LBR"],
  ["af-hct-bechuanaland", "BWA"],
  ["af-hct-basutoland", "LSO"],
  ["af-hct-swaziland", "SWZ"],
  ["af-cap-walvis-bay", "NAM"],
  ["af-cap-", "ZAF"],
  ["af-nat-", "ZAF"],
  ["af-zar-", "ZAF"],
  ["af-orf-", "ZAF"],
  ["af-cra-nyasaland", "MWI"],
  ["af-cra-northern-rhodesia", "ZMB"],
  ["af-cra-southern-rhodesia", "ZWE"],
  ["af-moz-", "MOZ"],
  ["af-ang-", "AGO"],
  ["af-cfs-", "COD"],
  ["af-kam-", "CMR"],
  ["af-tog-british-togoland", "GHA"],
  ["af-tog-", "TGO"],
  ["af-gsw-", "NAM"],
  ["af-fea-gabon", "GAB"],
  ["af-fea-middle-congo", "COG"],
  ["af-fea-ubangi-shari", "CAF"],
  ["af-fea-chad", "TCD"],
  ["af-fwa-senegal", "SEN"],
  ["af-fwa-mauritania", "MRT"],
  ["af-fwa-french-sudan", "MLI"],
  ["af-fwa-guinea", "GIN"],
  ["af-fwa-ivory-coast", "CIV"],
  ["af-fwa-upper-volta", "BFA"],
  ["af-fwa-dahomey", "BEN"],
  ["af-fwa-niger", "NER"],
  ["af-bwa-gold-coast", "GHA"],
  ["af-bwa-ashanti", "GHA"],
  ["af-bwa-northern-territories", "GHA"],
  ["af-bwa-gambia", "GMB"],
  ["af-bwa-sierra-leone", "SLE"],
  ["af-bwa-", "NGA"],
  ["af-ott-", "LBY"],
  ["af-sah-", "SADR"],
  ["af-sgg-", "GNQ"],
];

function successorOf(key) {
  for (const [prefix, tag] of RULES) if (key.startsWith(prefix)) return tag;
  return "(unmapped)";
}

/** Every modern African land border that the derived national border must draw. */
const EXPECTED = [
  ["EGY", "LBY"], ["EGY", "SDN"], ["LBY", "TUN"], ["LBY", "DZA"], ["LBY", "NER"],
  ["LBY", "TCD"], ["LBY", "SDN"], ["TUN", "DZA"], ["DZA", "MAR"], ["DZA", "MRT"],
  ["DZA", "MLI"], ["DZA", "NER"], ["MAR", "SADR"], ["SADR", "MRT"],
  ["SEN", "MLI"], ["SEN", "GMB"], ["SEN", "GNB"], ["SEN", "GIN"], ["GNB", "GIN"],
  ["GIN", "MLI"], ["GIN", "SLE"], ["GIN", "LBR"], ["GIN", "CIV"], ["SLE", "LBR"],
  ["LBR", "CIV"], ["CIV", "MLI"], ["CIV", "BFA"], ["CIV", "GHA"], ["MLI", "BFA"],
  ["MLI", "NER"], ["MLI", "MRT"], ["MRT", "SEN"], ["BFA", "NER"], ["BFA", "BEN"],
  ["BFA", "TGO"], ["BFA", "GHA"], ["GHA", "TGO"], ["TGO", "BEN"], ["BEN", "NER"],
  ["BEN", "NGA"], ["NER", "NGA"], ["NER", "TCD"], ["NGA", "CMR"], ["NGA", "TCD"],
  ["CMR", "TCD"], ["CMR", "CAF"], ["CMR", "COG"], ["CMR", "GAB"], ["CMR", "GNQ"],
  ["TCD", "CAF"], ["TCD", "SDN"], ["CAF", "SDN"], ["CAF", "SSD"], ["CAF", "COD"],
  ["CAF", "COG"], ["GNQ", "GAB"], ["GAB", "COG"], ["COG", "COD"], ["COG", "AGO"],
  ["COD", "SSD"], ["COD", "AGO"], ["COD", "ZMB"], ["COD", "TZA"],
  ["COD", "RWA"], ["AGO", "ZMB"], ["AGO", "NAM"], ["ZMB", "TZA"],
  ["ZMB", "MWI"], ["ZMB", "MOZ"], ["ZMB", "ZWE"], ["ZMB", "NAM"], ["MWI", "TZA"],
  ["MWI", "MOZ"], ["MOZ", "TZA"], ["MOZ", "ZWE"], ["MOZ", "ZAF"], ["MOZ", "SWZ"],
  ["ZWE", "ZAF"], ["ZWE", "BWA"], ["BWA", "ZAF"], ["BWA", "NAM"], ["NAM", "ZAF"],
  ["ZAF", "SWZ"], ["ZAF", "LSO"], ["UGA", "KEN"], ["UGA", "TZA"], ["UGA", "RWA"],
  ["UGA", "COD"], ["UGA", "SSD"], ["KEN", "TZA"], ["KEN", "SOM"],
  ["TZA", "RWA"], ["TZA", "BDI"], ["RWA", "BDI"], ["BDI", "COD"], ["ETH", "ERI"],
  ["ETH", "DJI"], ["ETH", "SOM"], ["ETH", "KEN"], ["ETH", "SSD"], ["ETH", "SDN"],
  ["ERI", "SDN"], ["ERI", "DJI"], ["DJI", "SOL"], ["SOL", "SOM"], ["SOL", "ETH"],
  ["SDN", "SSD"],
];

const successorById = new Map();
const bySuccessor = new Map();
for (const province of BUNDLE.provinces) {
  const tag = successorOf(province.key);
  successorById.set(province.id, tag);
  if (tag === "(unmapped)") console.log("non-sovereign province (island or French department):", province.key);
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

console.log(`successor groups with provinces: ${String(bySuccessor.size)}`);
console.log([...bySuccessor.keys()].sort().join(" "));
console.log(`modern land borders checked: ${String(EXPECTED.length)}`);
console.log(`without a province edge: ${String(missing.length)}`);
for (const key of missing) console.log(`  ${key}`);


