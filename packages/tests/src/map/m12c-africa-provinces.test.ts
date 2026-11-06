/**
 * M12c African provincial system.
 *
 * The suite validates the committed African province inventory and geometry, the
 * combined Europe+Asia+Africa catalogue, and the authoritative simulation
 * through the historical transfer sequences the milestone requires: the 1903
 * Sokoto and 1916 Darfur annexations, the 1910 Union of South Africa, the 1911
 * Italian conquest of Libya, the 1912 Moroccan protectorates, the 1919 mandate
 * partition of the German colonies, the 1936 Italian empire and its 1941
 * liberation, the 1956-1968 decolonisation wave, the 1975 Portuguese collapse,
 * the 1990-1991 southern African and Somali settlements, and South Sudan at the
 * end of the simulated calendar. Reference snapshots are validation references,
 * not forced outcomes.
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  addProvinceClaim,
  assertValidWorld,
  civilDateToDayIndex,
  createEconomyWorld,
  deserializeWorld,
  hashWorld,
  serializeWorld,
  setProvinceControl,
  setProvinceSpecialStatus,
  transferProvinceOwnership,
  type EconomyScenarioDef,
  type Id,
  type World,
} from "@century/sim";
import { loadM11World, loadProvinceBundle } from "@century/data";

import {
  decodeProvinceGeometry,
  pathForLines,
  project,
} from "../../../app/src/components/worldMapGeometry.js";
import {
  pickProvinceAtPoint,
  planProvinceBorders,
} from "../../../app/src/components/provinceRenderPlan.js";
import { PROVINCE_MAP_1900 } from "../../../app/src/provinceMapBundle.js";
import type { ProvinceMapData } from "../../../app/src/provinceCatalogTypes.js";
import { politicalGeographyWorld } from "../fixtures/provinces.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../../..");
const AFRICA = JSON.parse(
  readFileSync(join(ROOT, "packages/data/data/map/provinces_africa_1900.json"), "utf8"),
) as ProvinceMapData;
const EUROPE = JSON.parse(
  readFileSync(join(ROOT, "packages/data/data/map/provinces_1900.json"), "utf8"),
) as ProvinceMapData;
const ASIA = JSON.parse(
  readFileSync(join(ROOT, "packages/data/data/map/provinces_asia_1900.json"), "utf8"),
) as ProvinceMapData;
const AMERICAS = JSON.parse(
  readFileSync(join(ROOT, "packages/data/data/map/provinces_americas_1900.json"), "utf8"),
) as ProvinceMapData;
const OCEANIA = JSON.parse(
  readFileSync(join(ROOT, "packages/data/data/map/provinces_oceania_1900.json"), "utf8"),
) as ProvinceMapData;
const AUDIT = JSON.parse(
  readFileSync(join(ROOT, "packages/data/data/map/provinces_africa_1900_audit.json"), "utf8"),
) as {
  provinceCount: number;
  duplicateProvinceIds: number;
  duplicateKeys: number;
  duplicateUnitClaimCount: number;
  unassignedUnitCount: number;
  crossFeatureSeamBorderCount: number;
  crossFeaturePolityFrontierSeamCount: number;
  coverage: { tag: string; residualArea: number; estimated: boolean }[];
  overlapCount: number;
  unmatchedBorderSegments: number;
};

const SCENARIO = loadM11World();
const DEFINITIONS = new Map(
  (SCENARIO.provinces?.definitions ?? []).map((definition) => [
    definition.provinceId,
    definition,
  ]),
);
const BY_KEY = new Map(AFRICA.provinces.map((province) => [province.key, province]));
const AFRICA_IDS = new Set(AFRICA.provinces.map((province) => province.id));
const FUTURE_ID = new Map(
  AFRICA.futurePolities.map((polity) => [polity.tag, polity.polityId]),
);
const REGION_IDS = new Set(SCENARIO.population.provinceEconomies.map((province) => province.id));
const TERMINAL_DAY = civilDateToDayIndex(2000, 1, 1);

/** Province key prefix -> the modern successor state the province becomes. */
const SUCCESSOR_RULES: readonly (readonly [string, string])[] = [
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

function successorOf(key: string): string {
  for (const [prefix, tag] of SUCCESSOR_RULES) {
    if (key.startsWith(prefix)) return tag;
  }
  return "(unmapped)";
}

/**
 * Every modern African land border that the derived national border must be able
 * to draw. Three pairs are deliberately excluded: the Botswana/Zambia
 * quadripoint, the undelimited Kenya/South Sudan Ilemi Triangle (unassigned in
 * the M11c map), and Djibouti/Somalia, which is mediated by Somaliland.
 */
const MODERN_LAND_BORDERS: readonly (readonly [string, string])[] = [
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
  ["COD", "SSD"], ["COD", "AGO"], ["COD", "ZMB"], ["COD", "TZA"], ["COD", "RWA"],
  ["AGO", "ZMB"], ["AGO", "NAM"], ["ZMB", "TZA"],
  ["ZMB", "MWI"], ["ZMB", "MOZ"], ["ZMB", "ZWE"], ["ZMB", "NAM"], ["MWI", "TZA"],
  ["MWI", "MOZ"], ["MOZ", "TZA"], ["MOZ", "ZWE"], ["MOZ", "ZAF"], ["MOZ", "SWZ"],
  ["ZWE", "ZAF"], ["ZWE", "BWA"], ["BWA", "ZAF"], ["BWA", "NAM"], ["NAM", "ZAF"],
  ["ZAF", "SWZ"], ["ZAF", "LSO"], ["UGA", "KEN"], ["UGA", "TZA"], ["UGA", "RWA"],
  ["UGA", "COD"], ["UGA", "SSD"], ["KEN", "TZA"], ["KEN", "SOM"],
  ["TZA", "RWA"], ["TZA", "BDI"], ["RWA", "BDI"], ["ETH", "ERI"],
  ["ETH", "DJI"], ["ETH", "SOM"], ["ETH", "SSD"], ["ETH", "SDN"],
  ["ERI", "SDN"], ["ERI", "DJI"], ["DJI", "SOL"], ["SOL", "SOM"], ["SOL", "ETH"],
  ["SDN", "SSD"],
];

function day(year: number, month: number, date: number): number {
  return civilDateToDayIndex(year, month as 1, date);
}

function idOf(key: string): Id {
  const province = BY_KEY.get(key);
  if (province === undefined) throw new Error(`unknown Africa province ${key}`);
  return province.id;
}

function idsOf(...keys: readonly string[]): Id[] {
  return keys.map(idOf);
}

function idsFor(prefix: string): Id[] {
  return AFRICA.provinces
    .filter((province) => province.key.startsWith(prefix))
    .map((province) => province.id);
}

function futureId(tag: string): Id {
  const id = FUTURE_ID.get(tag);
  if (id === undefined) throw new Error(`unknown Africa future polity ${tag}`);
  return id;
}

function ownershipOf(world: World, key: string) {
  return world.provinces.ownership.find((entry) => entry.provinceId === idOf(key));
}

function ownerOf(world: World, key: string): Id {
  const entry = ownershipOf(world, key);
  if (entry === undefined) throw new Error(`province ${key} is missing from the world`);
  return entry.ownerPolityId;
}

function controllerOf(world: World, key: string): Id {
  const entry = ownershipOf(world, key);
  if (entry === undefined) throw new Error(`province ${key} is missing from the world`);
  return entry.controllerPolityId;
}

function transfer(
  world: World,
  provinceIds: readonly Id[],
  toPolityId: Id,
  kind: Parameters<typeof transferProvinceOwnership>[1]["kind"],
  note: string,
  at: number,
): void {
  if (provinceIds.length === 0) return;
  transferProvinceOwnership(world, {
    provinceIds: [...provinceIds],
    toPolityId,
    kind,
    day: at,
    note,
  });
}

function referenceWorld(seed = 78_000): World {
  // P2: the reference sequences run on the political geography alone (D-118).
  return politicalGeographyWorld(SCENARIO, seed);
}

/** 1903: the British conquest of the Sokoto Caliphate. */
function conquerSokoto1903(world: World): void {
  transfer(world, idsFor("af-sok-"), 1 as Id, "annexation", "British conquest of Sokoto", day(1903, 3, 27));
}

/** 1909-1916: Wadai and Darfur are annexed by the colonial powers. */
function annexSahelianSultanates(world: World): void {
  transfer(world, idsFor("af-wad-"), 3 as Id, "annexation", "French conquest of Wadai", day(1909, 6, 1));
  transfer(world, idsFor("af-dar-"), 1 as Id, "annexation", "Anglo-Egyptian annexation of Darfur", day(1916, 11, 17));
}

/** 1910: the Union of South Africa absorbs the four colonies and republics. */
function unionOfSouthAfrica1910(world: World): void {
  const zaf = futureId("ZAF");
  const at = day(1910, 5, 31);
  transfer(world, idsFor("af-cap-"), zaf, "union", "Union of South Africa: the Cape Colony", at);
  transfer(world, idsFor("af-nat-"), zaf, "union", "Union of South Africa: Natal", at);
  transfer(world, idsFor("af-zar-"), zaf, "union", "Union of South Africa: the Transvaal", at);
  transfer(world, idsFor("af-orf-"), zaf, "union", "Union of South Africa: the Orange Free State", at);
}

/** 1911-1923: Italy takes Libya; the Ottoman claim ends with Lausanne. */
function italianLibya(world: World): void {
  const libya = idsFor("af-ott-");
  setProvinceControl(world, {
    provinceIds: libya,
    controllerPolityId: 6 as Id,
    day: day(1911, 10, 5),
    note: "Italian occupation of Tripolitania and Cyrenaica",
    kind: "occupation",
  });
  transfer(world, libya, 6 as Id, "cession", "Treaty of Lausanne cedes Libya to Italy", day(1923, 7, 24));
}

/** 1912: the French and Spanish protectorates over Morocco. */
function moroccanProtectorates1912(world: World): void {
  const at = day(1912, 3, 30);
  setProvinceControl(world, {
    provinceIds: idsOf(
      "af-mar-tangier-and-tetouan",
      "af-mar-the-rif-and-the-eastern-zone",
    ),
    controllerPolityId: 7 as Id,
    day: at,
    note: "Spanish protectorate over northern Morocco",
    kind: "occupation",
  });
  setProvinceControl(world, {
    provinceIds: AFRICA.provinces
      .filter((province) => province.key.startsWith("af-mar-"))
      .filter(
        (province) =>
          !["af-mar-tangier-and-tetouan", "af-mar-the-rif-and-the-eastern-zone"].includes(
            province.key,
          ),
      )
      .map((province) => province.id),
    controllerPolityId: 3 as Id,
    day: at,
    note: "French protectorate over Morocco",
    kind: "occupation",
  });
}

/**
 * 1919-1922: the German colonies are partitioned into mandates. The legal owner
 * of a mandate is recorded as the mandatory power with the `mandate` status; the
 * intended successor polities are not yet independent.
 */
function mandatePartition1919(world: World): void {
  const at = day(1919, 6, 28);
  const tanganyika = idsFor("af-gea-").filter(
    (id) => id !== idOf("af-gea-rwanda") && id !== idOf("af-gea-burundi"),
  );
  transfer(world, tanganyika, 1 as Id, "transfer", "British mandate of Tanganyika", at);
  transfer(
    world,
    idsOf("af-gea-rwanda", "af-gea-burundi"),
    10 as Id,
    "transfer",
    "Belgian mandate of Ruanda-Urundi",
    at,
  );
  transfer(world, idsFor("af-kam-"), 3 as Id, "transfer", "French mandate of Cameroun", at);
  transfer(
    world,
    idsOf("af-kam-southern-cameroons"),
    1 as Id,
    "transfer",
    "British mandate of the Cameroons",
    at,
  );
  transfer(world, idsFor("af-tog-"), 3 as Id, "transfer", "French mandate of Togoland", at);
  transfer(
    world,
    idsOf("af-tog-british-togoland"),
    1 as Id,
    "transfer",
    "British mandate of Togoland",
    at,
  );
  transfer(world, idsFor("af-gsw-"), futureId("ZAF"), "transfer", "South West Africa mandate", at);
  for (const id of [
    ...tanganyika,
    ...idsOf("af-gea-rwanda", "af-gea-burundi"),
    ...idsFor("af-kam-"),
    ...idsFor("af-tog-"),
    ...idsFor("af-gsw-"),
  ]) {
    setProvinceSpecialStatus(world, id, "mandate");
  }
}

/** 1922: Egypt becomes an independent kingdom. */
function egypt1922(world: World): void {
  transfer(world, idsFor("af-egy-"), futureId("EGY"), "independence", "Unilateral declaration of Egyptian independence", day(1922, 2, 28));
}

/** 1956: the Anglo-Egyptian Sudan becomes independent. */
function sudan1956(world: World): void {
  transfer(world, idsFor("af-sud-"), futureId("SDN"), "independence", "Independence of the Sudan", day(1956, 1, 1));
}

/**
 * 1956-1968: the African decolonisation wave. Every transfer is an ordinary
 * ownership change on provinces that already existed in 1900.
 */
function decoloniseAfrica(world: World): void {
  const at = (year: number, month: number, date: number): number => day(year, month, date);
  // 1956-1958.
  transfer(world, idsFor("af-tun-"), futureId("TUN"), "independence", "Tunisian independence", at(1956, 3, 20));
  transfer(world, idsFor("af-mar-"), 35 as Id, "liberation", "Restoration of Moroccan independence", at(1956, 3, 2));
  setProvinceControl(world, {
    provinceIds: idsFor("af-mar-"),
    controllerPolityId: null,
    day: at(1956, 3, 2),
    note: "End of the French and Spanish protectorates",
    kind: "liberation",
  });
  transfer(
    world,
    [...idsOf("af-bwa-gold-coast-colony", "af-bwa-ashanti", "af-bwa-northern-territories-of-the-gold-coast"), ...idsOf("af-tog-british-togoland")],
    futureId("GHA"),
    "independence",
    "Independence of Ghana",
    at(1957, 3, 6),
  );
  transfer(world, idsFor("af-fwa-guinea-"), futureId("GIN"), "independence", "Guinean independence", at(1958, 10, 2));
  // 1960: the French African territories.
  transfer(world, idsFor("af-fwa-senegal-"), futureId("SEN"), "independence", "Senegalese independence", at(1960, 4, 4));
  transfer(world, idsFor("af-fwa-french-sudan-"), futureId("MLI"), "independence", "Independence of Mali", at(1960, 9, 22));
  transfer(world, idsFor("af-fwa-mauritania-"), futureId("MRT"), "independence", "Mauritanian independence", at(1960, 11, 28));
  transfer(world, idsFor("af-fwa-ivory-coast-"), futureId("CIV"), "independence", "Ivorian independence", at(1960, 8, 7));
  transfer(world, idsFor("af-fwa-upper-volta-"), futureId("BFA"), "independence", "Independence of Upper Volta", at(1960, 8, 5));
  transfer(world, idsFor("af-fwa-dahomey-"), futureId("BEN"), "independence", "Independence of Dahomey", at(1960, 8, 1));
  transfer(world, idsFor("af-fwa-niger-"), futureId("NER"), "independence", "Independence of the Niger", at(1960, 8, 3));
  transfer(world, idsFor("af-fea-chad-"), futureId("TCD"), "independence", "Chadian independence", at(1960, 8, 11));
  transfer(world, idsFor("af-fea-ubangi-shari-"), futureId("CAF"), "independence", "Independence of the Central African Republic", at(1960, 8, 13));
  transfer(world, idsFor("af-fea-middle-congo-"), futureId("COG"), "independence", "Independence of the Congo", at(1960, 8, 15));
  transfer(world, idsFor("af-fea-gabon-"), futureId("GAB"), "independence", "Gabonese independence", at(1960, 8, 17));
  transfer(world, idsFor("af-cfs-"), futureId("COD"), "independence", "Independence of the Congo", at(1960, 6, 30));
  transfer(
    world,
    AFRICA.provinces
      .filter(
        (province) =>
          province.key.startsWith("af-mad-") &&
          !["af-mad-grande-comore", "af-mad-anjouan", "af-mad-moheli"].includes(province.key),
      )
      .map((province) => province.id),
    futureId("MDG"),
    "independence",
    "Malagasy independence",
    at(1960, 6, 26),
  );
  transfer(world, idsFor("af-kam-"), futureId("CMR"), "independence", "Independence of Cameroon", at(1960, 1, 1));
  transfer(world, idsFor("af-tog-french-"), futureId("TGO"), "independence", "Togolese independence", at(1960, 4, 27));
  // 1960: Nigeria and Somalia.
  transfer(
    world,
    AFRICA.provinces
      .filter(
        (province) =>
          province.key.startsWith("af-bwa-") &&
          [
            "af-bwa-lagos-colony",
            "af-bwa-southern-nigeria-the-west",
            "af-bwa-southern-nigeria-the-east",
            "af-bwa-southern-nigeria-the-middle-belt",
            "af-bwa-northern-nigeria-borno-and-the-chad-frontier",
            "af-bwa-northern-nigeria-the-niger-province",
          ].includes(province.key),
      )
      .map((province) => province.id),
    futureId("NGA"),
    "independence",
    "Nigerian independence",
    at(1960, 10, 1),
  );
  transfer(world, idsFor("af-sok-"), futureId("NGA"), "accession", "The Sokoto emirates join Nigeria", at(1960, 10, 1));
  transfer(world, idsFor("af-bso-"), futureId("SOM"), "union", "Union of Somaliland and Somalia", at(1960, 7, 1));
  transfer(world, idsFor("af-its-"), futureId("SOM"), "union", "Union of Somaliland and Somalia", at(1960, 7, 1));
  transfer(world, idsOf("af-bea-jubaland"), futureId("SOM"), "cession", "Jubaland remains with Somalia", at(1960, 7, 1));
  // 1961-1963.
  transfer(world, idsFor("af-bwa-sierra-leone-"), futureId("SLE"), "independence", "Sierra Leonean independence", at(1961, 4, 27));
  transfer(
    world,
    idsOf(
      "af-bea-buganda",
      "af-bea-eastern-province-of-uganda",
      "af-bea-northern-province-of-uganda",
      "af-bea-western-province-of-uganda",
    ),
    futureId("UGA"),
    "independence",
    "Ugandan independence",
    at(1962, 10, 9),
  );
  transfer(world, idsFor("af-gea-rwanda"), futureId("RWA"), "independence", "Rwandan independence", at(1962, 7, 1));
  transfer(world, idsFor("af-gea-burundi"), futureId("BDI"), "independence", "Burundian independence", at(1962, 7, 1));
  transfer(
    world,
    idsOf(
      "af-bea-mombasa-and-the-coast",
      "af-bea-ukamba-and-nairobi",
      "af-bea-nyanza-and-the-western-province",
      "af-bea-rift-valley",
      "af-bea-northern-frontier-district",
    ),
    futureId("KEN"),
    "independence",
    "Kenyan independence",
    at(1963, 12, 12),
  );
  transfer(
    world,
    AFRICA.provinces
      .filter(
        (province) =>
          province.key.startsWith("af-gea-") &&
          !["af-gea-rwanda", "af-gea-burundi"].includes(province.key),
      )
      .map((province) => province.id),
    futureId("TAN"),
    "independence",
    "Tanganyikan independence",
    at(1961, 12, 9),
  );
  transfer(world, idsFor("af-bpo-zanzibar"), futureId("ZAN"), "independence", "Zanzibari independence", at(1963, 12, 10));
  // 1964-1968.
  transfer(world, idsFor("af-cra-nyasaland-"), futureId("MWI"), "independence", "Malawian independence", at(1964, 7, 6));
  transfer(world, idsFor("af-cra-northern-rhodesia-"), futureId("ZMB"), "independence", "Zambian independence", at(1964, 10, 24));
  transfer(world, idsFor("af-bwa-gambia"), futureId("GMB"), "independence", "Gambian independence", at(1965, 2, 18));
  transfer(world, idsFor("af-hct-bechuanaland-"), futureId("BWA"), "independence", "Botswanan independence", at(1966, 9, 30));
  transfer(world, idsFor("af-hct-basutoland-"), futureId("LSO"), "independence", "Lesotho independence", at(1966, 10, 4));
  transfer(world, idsFor("af-hct-swaziland"), futureId("SWZ"), "independence", "Swazi independence", at(1968, 9, 6));
  transfer(world, idsFor("af-bpo-mauritius"), futureId("MUS"), "independence", "Mauritian independence", at(1968, 3, 12));
  transfer(world, idsFor("af-sgg-"), futureId("GNQ"), "independence", "Equatorial Guinean independence", at(1968, 10, 12));
  // 1962: Algeria.
  transfer(world, idsFor("af-alg-"), futureId("DZA"), "independence", "Algerian independence", at(1962, 7, 5));
}

/** 1975: the Portuguese empire collapses in Africa. */
function portugueseCollapse1975(world: World): void {
  transfer(world, idsFor("af-ang-"), futureId("AGO"), "independence", "Angolan independence", day(1975, 11, 11));
  transfer(world, idsFor("af-moz-"), futureId("MOZ"), "independence", "Mozambican independence", day(1975, 6, 25));
  transfer(world, idsFor("af-pai-bissau"), futureId("GNB"), "independence", "Guinea-Bissau independence", day(1974, 9, 10));
  transfer(world, idsFor("af-pai-bafata"), futureId("GNB"), "independence", "Guinea-Bissau independence", day(1974, 9, 10));
  transfer(world, idsFor("af-pai-bolama"), futureId("GNB"), "independence", "Guinea-Bissau independence", day(1974, 9, 10));
  transfer(world, idsFor("af-pai-barlavento"), futureId("CPV"), "independence", "Cape Verdean independence", day(1975, 7, 5));
  transfer(world, idsFor("af-pai-sotavento"), futureId("CPV"), "independence", "Cape Verdean independence", day(1975, 7, 5));
  transfer(world, idsFor("af-pai-sao-tome"), futureId("STP"), "independence", "Independence of São Tomé and Príncipe", day(1975, 7, 12));
  transfer(world, idsFor("af-pai-principe"), futureId("STP"), "independence", "Independence of São Tomé and Príncipe", day(1975, 7, 12));
  transfer(world, idsFor("af-mad-grande-comore"), futureId("COM"), "independence", "Comorian independence", day(1975, 7, 6));
  transfer(world, idsFor("af-mad-anjouan"), futureId("COM"), "independence", "Comorian independence", day(1975, 7, 6));
  transfer(world, idsFor("af-mad-moheli"), futureId("COM"), "independence", "Comorian independence", day(1975, 7, 6));
  transfer(world, idsFor("af-fso-"), futureId("DJI"), "independence", "Djiboutian independence", day(1977, 6, 27));
  transfer(world, idsFor("af-sah-"), futureId("SADR"), "independence", "Proclamation of the Sahrawi Arab Democratic Republic", day(1976, 2, 27));
}

/** 1936-1941: the Italian empire in Ethiopia and its liberation. */
function italianEthiopia1936(world: World): void {
  transfer(world, idsFor("af-eth-"), 6 as Id, "annexation", "Italian annexation of Ethiopia", day(1936, 5, 9));
  transfer(world, idsFor("af-eth-"), 33 as Id, "liberation", "Liberation of Ethiopia", day(1941, 5, 5));
}

/** 1925: Jubaland passes from British East Africa to Italian Somaliland. */
function cedeJubaland1925(world: World): void {
  transfer(world, idsOf("af-bea-jubaland"), 6 as Id, "cession", "Cession of Jubaland to Italy", day(1925, 7, 1));
}

/**
 * 1943-1945: the Italian colonies pass to British military administration while
 * legal sovereignty waits for the 1947 peace treaty and the 1949-1950 United
 * Nations decisions. Ownership is unchanged; only the controller moves.
 */
function alliedAdministration1945(world: World): void {
  const at = day(1945, 1, 1);
  for (const prefix of ["af-ott-", "af-eri-", "af-its-"]) {
    setProvinceControl(world, {
      provinceIds: idsFor(prefix),
      controllerPolityId: 1 as Id,
      day: at,
      note: "British military administration of the former Italian colonies",
      kind: "occupation",
    });
  }
}

/** 1990-1994: Namibia, Walvis Bay, Eritrea and Somaliland. */
function southernAfricaSettlements(world: World): void {
  const nam = futureId("NAM");
  transfer(world, idsFor("af-gsw-"), nam, "independence", "Namibian independence", day(1990, 3, 21));
  transfer(world, idsOf("af-cap-walvis-bay"), nam, "transfer", "Walvis Bay transferred to Namibia", day(1994, 3, 1));
  transfer(world, idsFor("af-eri-"), futureId("ERI"), "independence", "Eritrean independence", day(1993, 5, 24));
  transfer(world, idsOf("af-bso-british-somaliland"), futureId("SOL"), "independence", "Declaration of the State of Somaliland", day(1991, 5, 18));
  transfer(world, idsFor("af-cra-southern-rhodesia-"), futureId("ZWE"), "independence", "Zimbabwean independence", day(1980, 4, 18));
}

/** 2011: the southern Sudanese provinces become South Sudan. */
function southSudan2011(world: World): void {
  transfer(
    world,
    idsOf("af-sud-bahr-el-ghazal", "af-sud-equatoria", "af-sud-upper-nile"),
    futureId("SSD"),
    "independence",
    "Independence of South Sudan",
    TERMINAL_DAY,
  );
}

describe("M12c Africa province inventory and geometry", () => {
  test("the committed bundle covers Africa with stable unique ids", () => {
    expect(AFRICA.provinces.length).toBeGreaterThan(200);
    expect(new Set(AFRICA.provinces.map((province) => province.id)).size).toBe(
      AFRICA.provinces.length,
    );
    expect(new Set(AFRICA.provinces.map((province) => province.key)).size).toBe(
      AFRICA.provinces.length,
    );
    expect(AUDIT.provinceCount).toBe(AFRICA.provinces.length);
    expect(AUDIT.duplicateProvinceIds).toBe(0);
    expect(AUDIT.duplicateKeys).toBe(0);
    expect(AUDIT.duplicateUnitClaimCount).toBe(0);
    expect(AUDIT.unassignedUnitCount).toBe(0);
    for (const province of AFRICA.provinces) {
      expect(province.id).toBeGreaterThan(200000);
      expect(province.key.startsWith("af-")).toBe(true);
    }
  });

  test("Africa ids, keys and future polities are disjoint from Europe and Asia", () => {
    const priorIds = new Set(
      [...EUROPE.provinces, ...ASIA.provinces].map((province) => province.id),
    );
    const priorKeys = new Set(
      [...EUROPE.provinces, ...ASIA.provinces].map((province) => province.key),
    );
    for (const province of AFRICA.provinces) {
      expect(priorIds.has(province.id)).toBe(false);
      expect(priorKeys.has(province.key)).toBe(false);
    }
    const priorFuture = new Set(
      [...EUROPE.futurePolities, ...ASIA.futurePolities].map((polity) => polity.polityId),
    );
    for (const polity of AFRICA.futurePolities) {
      expect(polity.polityId).toBeGreaterThanOrEqual(1200);
      expect(polity.polityId).toBeLessThanOrEqual(1299);
      expect(priorFuture.has(polity.polityId)).toBe(false);
    }
  });

  test("the required African 1900 owners and map features are represented", () => {
    const owners = new Set(AFRICA.provinces.map((province) => province.initialOwnerTag));
    for (const tag of [
      "GBR", "FRA", "DEU", "PRT", "ITA", "ESP", "BEL", "OTT", "ETH", "LBR",
      "MAR", "ZAR", "ORF", "SOK", "WAD", "DAR",
    ]) {
      expect(owners.has(tag)).toBe(true);
    }
    const mapTags = new Set(AFRICA.provinces.map((province) => province.mapTag));
    for (const tag of [
      "EGY", "SUD", "BSO", "BEA", "BWA", "CAP", "NAT", "HCT", "CRA", "FWA",
      "FEA", "ALG", "TUN", "MAR", "FSO", "MAD", "GEA", "GSW", "KAM", "TOG",
      "CFS", "ANG", "MOZ", "PAI", "ERI", "ITS", "SAH", "SGG", "ETH", "LBR",
      "ZAR", "ORF", "SOK", "WAD", "DAR", "OTT", "BPO", "BSA", "FRA",
    ]) {
      expect(mapTags.has(tag)).toBe(true);
    }
    for (const province of AFRICA.provinces) {
      // P2 (D-118): every province is an economic unit of its own; the region link is gone.
      expect(REGION_IDS.has(province.id)).toBe(true);
      expect("simulationRegionId" in province).toBe(false);
    }
  });

  test("every province has a 1900 owner, administrative metadata and provenance", () => {
    for (const province of AFRICA.provinces) {
      expect(province.initialOwnerTag.length).toBeGreaterThan(1);
      expect(province.historicalName.length).toBeGreaterThan(1);
      expect(province.historicalAdminAffiliation.length).toBeGreaterThan(3);
      expect(province.sourceIds.length).toBeGreaterThan(0);
      expect(["low", "medium", "high"]).toContain(province.confidence);
      const definition = DEFINITIONS.get(province.id);
      expect(definition).toBeDefined();
      expect(definition?.key).toBe(province.key);
      expect(definition?.initialOwnerPolityId).toBe(province.initialOwnerPolityId);
    }
  });

  test("all province geometry decodes to finite drawable SVG paths", () => {
    const failures: string[] = [];
    let ringCount = 0;
    for (const province of AFRICA.provinces) {
      try {
        const geometry = decodeProvinceGeometry(province);
        if (geometry.path === null || geometry.path.length === 0) {
          failures.push(`${province.key}: empty path`);
        }
        ringCount += geometry.drawableRingCount;
        if (/NaN|Infinity/iu.test(geometry.path ?? "")) {
          failures.push(`${province.key}: non-finite path`);
        }
        for (const ring of geometry.points) {
          if (ring.length < 3) failures.push(`${province.key}: short ring`);
        }
        if (province.area <= 0) failures.push(`${province.key}: non-positive area`);
        if (province.bbox.length !== 4) failures.push(`${province.key}: bad bbox`);
      } catch (error) {
        failures.push(`${province.key}: ${String(error)}`);
      }
    }
    expect(failures).toEqual([]);
    expect(ringCount).toBeGreaterThan(AFRICA.provinces.length);
  });

  test("province borders are deduplicated open polylines", () => {
    let lineCount = 0;
    for (const border of AFRICA.borders) {
      expect(Number.isInteger(border.a)).toBe(true);
      expect(border.b === -1 || border.b > border.a).toBe(true);
      const path = pathForLines(border.lines, `border ${String(border.a)}`);
      if (path !== null) {
        lineCount += border.lines.length;
        expect(path).toMatch(/^M/u);
        expect(path).not.toMatch(/Z/u);
        expect(path).not.toMatch(/NaN|Infinity/iu);
      }
    }
    expect(lineCount).toBeGreaterThan(400);
  });

  test("African province edges become national only across current owners", () => {
    const ownerByProvinceId = new Map(
      AFRICA.provinces.map((province) => [province.id, province.initialOwnerTag]),
    );
    const plan = planProvinceBorders(AFRICA.borders, ownerByProvinceId);
    expect(plan.length).toBe(AFRICA.borders.length);
    const southern = idOf("af-bwa-southern-nigeria-the-middle-belt");
    const northern = idOf("af-bwa-northern-nigeria-the-niger-province");
    const shared = plan.filter(
      (border) =>
        (border.a === southern && border.b === northern) ||
        (border.a === northern && border.b === southern),
    );
    expect(shared.length).toBeGreaterThan(0);
    expect(shared.every((border) => border.national === false)).toBe(true);
    const changed = new Map(ownerByProvinceId);
    changed.set(southern, "NGA");
    const changedPlan = planProvinceBorders(AFRICA.borders, changed);
    const changedShared = changedPlan.filter(
      (border) =>
        (border.a === southern && border.b === northern) ||
        (border.a === northern && border.b === southern),
    );
    expect(changedShared.every((border) => border.national === true)).toBe(true);

    // A cross-feature frontier (British Togoland / French Togoland) is covered by
    // a display-only seam border, so it also becomes national after a transfer.
    const british = idOf("af-tog-british-togoland");
    const french = idOf("af-tog-french-togoland-maritime-and-plateaux");
    const togoland = plan.filter(
      (border) =>
        (border.a === british && border.b === french) ||
        (border.a === french && border.b === british),
    );
    expect(togoland.length).toBeGreaterThan(0);
    const togolandChanged = planProvinceBorders(
      AFRICA.borders,
      new Map(ownerByProvinceId).set(british, "GHA"),
    ).filter(
      (border) =>
        (border.a === british && border.b === french) ||
        (border.a === french && border.b === british),
    );
    expect(togolandChanged.every((border) => border.national === true)).toBe(true);
  });

  test("province hit testing is zoom-independent and picks the containing province", () => {
    const decoded = AFRICA.provinces.map((province) => ({
      province,
      geometry: decodeProvinceGeometry(province),
    }));
    const pickable = decoded.map((entry) => ({
      id: entry.province.id,
      area: entry.province.area,
      points: entry.geometry.points,
    }));
    let checked = 0;
    let mismatches = 0;
    for (const { province } of decoded) {
      const [lon = 0, lat = 0] = province.label;
      const [x, y] = project(lon, lat);
      const hit = pickProvinceAtPoint(pickable, x, y, [0]);
      if (hit !== null) {
        checked += 1;
        if (hit !== province.id) mismatches += 1;
      }
    }
    expect(checked).toBeGreaterThan(AFRICA.provinces.length * 0.9);
    expect(mismatches / checked).toBeLessThan(0.03);
  });

  test("the coverage audit records a complete African partition", () => {
    expect(AUDIT.coverage.length).toBeGreaterThan(30);
    let totalResidual = 0;
    for (const entry of AUDIT.coverage) {
      if (entry.estimated) continue;
      // Simplification leaves small coastal and frontier slivers; the underlay
      // keeps the correct 1900 owner colour so they never become foreign enclaves.
      expect(entry.residualArea).toBeLessThan(3.6);
      totalResidual += entry.residualArea;
    }
    expect(totalResidual).toBeLessThan(25);
    expect(AUDIT.overlapCount).toBeLessThan(120);
    expect(AUDIT.unmatchedBorderSegments).toBeLessThan(50);
    expect(AUDIT.crossFeatureSeamBorderCount).toBeGreaterThan(0);
  });

  test("successor-border split provinces share continuous edges", () => {
    const pairs: [string, string][] = [
      ["af-sud-kordofan", "af-sud-bahr-el-ghazal"],
      ["af-sud-blue-nile-and-sennar", "af-sud-upper-nile"],
      ["af-gea-bukoba-mwanza-and-the-lake", "af-gea-rwanda"],
      ["af-gea-tabora-and-kigoma", "af-gea-burundi"],
      ["af-gea-rwanda", "af-gea-burundi"],
      ["af-kam-southern-cameroons", "af-kam-central-kamerun"],
      ["af-kam-southern-cameroons", "af-kam-northern-kamerun"],
      ["af-tog-british-togoland", "af-tog-french-togoland-maritime-and-plateaux"],
      ["af-tog-british-togoland", "af-tog-french-togoland-centre"],
      ["af-bwa-lagos-colony", "af-bwa-southern-nigeria-the-west"],
      [
        "af-bwa-southern-nigeria-the-middle-belt",
        "af-bwa-northern-nigeria-the-niger-province",
      ],
      ["af-fwa-senegal-the-interior", "af-fwa-french-sudan-kayes-bamako-and-koulikoro"],
      ["af-fwa-dahomey-the-north", "af-fwa-niger-the-niger-valley"],
      ["af-fea-gabon-the-interior", "af-fea-middle-congo-the-north"],
      ["af-fea-ubangi-shari-the-east", "af-fea-chad-the-south"],
      [
        "af-cra-northern-rhodesia-southern",
        "af-cra-southern-rhodesia-matabeleland",
      ],
      ["af-cap-eastern-cape-and-the-transkei", "af-nat-natal-and-zululand"],
      ["af-cap-northern-cape-and-griqualand-west", "af-orf-orange-free-state"],
      ["af-nat-natal-and-zululand", "af-zar-lydenburg-and-the-eastern-transvaal"],
      [
        "af-zar-potchefstroom-and-the-western-transvaal",
        "af-orf-orange-free-state",
      ],
      ["af-hct-swaziland", "af-zar-lydenburg-and-the-eastern-transvaal"],
      ["af-cap-walvis-bay", "af-gsw-erongo-and-the-central-coast"],
      ["af-sah-saguia-el-hamra", "af-sah-rio-de-oro"],
      ["af-mar-tangier-and-tetouan", "af-mar-the-rif-and-the-eastern-zone"],
      ["af-ott-kufra", "af-ott-murzuq-and-ghat"],
      [
        "af-ott-sabha-wadi-al-hayaa-and-ash-shati",
        "af-ott-sirte-ghadames-and-the-jufra",
      ],
    ];
    for (const [leftKey, rightKey] of pairs) {
      const left = idOf(leftKey);
      const right = idOf(rightKey);
      const shared = AFRICA.borders.filter(
        (border) =>
          (border.a === left && border.b === right) ||
          (border.a === right && border.b === left),
      );
      expect(shared.length).toBeGreaterThan(0);
      expect(shared.reduce((sum, border) => sum + border.lines.length, 0)).toBeGreaterThan(0);
    }
  });

  test("cross-feature successor frontiers have a seam border", () => {
    const pairs: [string, string][] = [
      ["af-eri-hamasien", "af-eth-tigray"],
      ["af-sgg-rio-muni", "af-kam-southern-kamerun"],
      ["af-gea-kilimanjaro-and-moshi", "af-bea-mombasa-and-the-coast"],
      ["af-gea-rwanda", "af-cfs-south-kivu"],
      ["af-gsw-kavango-and-caprivi", "af-cra-northern-rhodesia-barotseland"],
      ["af-moz-lourenco-marques", "af-zar-lydenburg-and-the-eastern-transvaal"],
      ["af-bwa-gambia", "af-fwa-senegal-the-interior"],
      ["af-bwa-sierra-leone-protectorate", "af-fwa-guinea-faranah"],
      ["af-alg-ouargla-and-the-east-sahara", "af-ott-murzuq-and-ghat"],
      ["af-egy-the-western-desert", "af-ott-derna-butnan-and-ajdabiya"],
    ];
    for (const [leftKey, rightKey] of pairs) {
      const left = idOf(leftKey);
      const right = idOf(rightKey);
      const shared = AFRICA.borders.some(
        (border) =>
          (border.a === left && border.b === right) ||
          (border.a === right && border.b === left),
      );
      expect(shared).toBe(true);
    }
  });

  test("every modern African land border has a province edge", () => {
    const successorById = new Map(
      AFRICA.provinces.map((province) => [province.id, successorOf(province.key)]),
    );
    const pairs = new Set<string>();
    for (const border of AFRICA.borders) {
      if (border.b < 0) continue;
      const left = successorById.get(border.a);
      const right = successorById.get(border.b);
      if (left === undefined || right === undefined || left === right) continue;
      pairs.add(left < right ? `${left}|${right}` : `${right}|${left}`);
    }
    const missing = MODERN_LAND_BORDERS.map(([a, b]) =>
      a < b ? `${a}|${b}` : `${b}|${a}`,
    ).filter((key) => !pairs.has(key));
    expect(missing).toEqual([]);
    // The three pairs that are deliberately *not* borders:
    //  - Botswana/Zambia meet only at the Kazungula quadripoint,
    //  - Kenya/South Sudan is the undelimited Ilemi Triangle, which the M11c map
    //    leaves unassigned (see §9 of the document),
    //  - Djibouti/Somalia is mediated by Somaliland (DJI|SOL is the border).
    expect(pairs.has("BWA|ZMB")).toBe(false);
    expect(pairs.has("KEN|SSD")).toBe(false);
    expect(pairs.has("DJI|SOM")).toBe(false);
    expect(pairs.has("DJI|SOL")).toBe(true);
    expect(pairs.has("SOL|SOM")).toBe(true);
    expect(pairs.has("DJI|ERI")).toBe(true);
  });

  test("the required historical subdivisions exist", () => {
    for (const key of [
      "af-sah-saguia-el-hamra",
      "af-sah-rio-de-oro",
      "af-cap-walvis-bay",
      "af-bpo-zanzibar",
      "af-bpo-pemba",
      "af-bpo-seychelles",
      "af-bpo-mauritius",
      "af-bsa-st-helena",
      "af-bsa-ascension",
      "af-pai-bissau-and-cacheu",
      "af-pai-barlavento-islands",
      "af-fra-reunion",
      "af-fra-mayotte",
      "af-mad-antananarivo",
      "af-mad-grande-comore",
      "af-bso-british-somaliland",
      "af-its-banaadir-and-the-lower-shabelle",
      "af-eri-hamasien",
      "af-eth-tigray",
      "af-sgg-rio-muni",
      "af-egy-cairo",
      "af-egy-sinai",
      "af-sud-khartoum",
      "af-sud-bahr-el-ghazal",
      "af-dar-north-darfur",
      "af-wad-wadai-and-ouaddai",
      "af-sok-sokoto-and-gwandu",
      "af-gea-rwanda",
      "af-gea-burundi",
      "af-gea-tabora-and-kigoma",
      "af-kam-southern-cameroons",
      "af-tog-british-togoland",
      "af-tog-french-togoland-centre",
      "af-gsw-windhoek-and-the-khomas-highlands",
      "af-cfs-leopoldville-and-bas-congo",
      "af-cfs-katanga",
      "af-ang-cabinda",
      "af-ang-luanda",
      "af-moz-lourenco-marques",
      "af-cra-nyasaland-southern-province",
      "af-cra-northern-rhodesia-barotseland",
      "af-cra-southern-rhodesia-matabeleland",
      "af-hct-bechuanaland-central-district",
      "af-hct-basutoland-the-lowlands",
      "af-hct-swaziland",
      "af-cap-cape-peninsula-and-the-western-districts",
      "af-nat-natal-and-zululand",
      "af-zar-pretoria-and-the-witwatersrand",
      "af-orf-orange-free-state",
      "af-bea-mombasa-and-the-coast",
      "af-bea-buganda",
      "af-bea-jubaland",
      "af-bwa-gold-coast-colony",
      "af-bwa-ashanti",
      "af-bwa-lagos-colony",
      "af-bwa-southern-nigeria-the-east",
      "af-bwa-northern-nigeria-borno-and-the-chad-frontier",
      "af-fwa-senegal-the-communes-and-the-coast",
      "af-fwa-mauritania-dakhlet-nouadhibou",
      "af-fwa-french-sudan-tombouctou-gao-and-kidal",
      "af-fwa-guinea-fouta-djallon",
      "af-fwa-upper-volta-ouagadougou",
      "af-fwa-dahomey-the-coast",
      "af-fwa-niger-the-sahara",
      "af-fea-gabon-the-estuary-and-the-coast",
      "af-fea-middle-congo-brazzaville-and-the-pool",
      "af-fea-ubangi-shari-the-centre",
      "af-fea-chad-the-chari-and-the-lake",
      "af-alg-algiers-and-the-mitidja",
      "af-alg-the-kabylie",
      "af-tun-tunis-and-the-sahel",
      "af-mar-tangier-and-tetouan",
      "af-mar-marrakech-and-the-south",
      "af-fso-french-somaliland",
      "af-lbr-montserrado",
      "af-ott-tripoli-and-the-jefara",
      "af-ott-benghazi-and-the-jabal-al-akhdar",
      "af-ott-sabha-wadi-al-hayaa-and-ash-shati",
    ]) {
      expect(BY_KEY.has(key)).toBe(true);
    }
  });

  test("the combined Europe, Asia, Africa, Americas and Oceania catalogue has unique ids and one border list", () => {
    const combined = loadProvinceBundle();
    expect(combined.provinces.length).toBe(
      EUROPE.provinces.length +
        ASIA.provinces.length +
        AFRICA.provinces.length +
        AMERICAS.provinces.length +
        OCEANIA.provinces.length,
    );
    expect(new Set(combined.provinces.map((province) => province.id)).size).toBe(
      combined.provinces.length,
    );
    expect(new Set(combined.provinces.map((province) => province.key)).size).toBe(
      combined.provinces.length,
    );
    expect(SCENARIO.provinces?.definitions.length).toBe(combined.provinces.length);
    expect(PROVINCE_MAP_1900.provinces.length).toBe(combined.provinces.length);
    expect(PROVINCE_MAP_1900.borders.length).toBe(
      EUROPE.borders.length +
        ASIA.borders.length +
        AFRICA.borders.length +
        AMERICAS.borders.length +
        OCEANIA.borders.length,
    );
    expect(PROVINCE_MAP_1900.futurePolities.length).toBe(
      EUROPE.futurePolities.length +
        ASIA.futurePolities.length +
        AFRICA.futurePolities.length +
        AMERICAS.futurePolities.length +
        OCEANIA.futurePolities.length,
    );
    expect(PROVINCE_MAP_1900.provinces.length).toBeGreaterThan(1500);
  });
});

describe("M12c authoritative provincial ownership", () => {
  test("the 1900 world starts with one ownership record per combined province", () => {
    const world = referenceWorld(20_260_301);
    assertValidWorld(world);
    expect(world.provinces.enabled).toBe(true);
    expect(world.provinces.ownership.length).toBe(DEFINITIONS.size);
    for (const province of AFRICA.provinces) {
      const entry = ownershipOf(world, province.key);
      expect(entry?.ownerPolityId).toBe(province.initialOwnerPolityId);
      // D-132: Egypt is Ottoman-owned and British-controlled in 1900.
      expect(entry?.controllerPolityId).toBe(province.key.startsWith("af-egy-") ? 1 : province.initialOwnerPolityId);
      expect(entry?.claimantPolityIds).toEqual([]);
    }
    // Sudan is a condominium; Egypt is under occupation; the others start ordinary.
    expect(ownershipOf(world, "af-sud-khartoum")?.specialStatus).toBe("condominium");
    expect(ownershipOf(world, "af-egy-cairo")?.ownerPolityId).toBe(20);
    expect(ownershipOf(world, "af-egy-cairo")?.specialStatus).toBe("occupied");
  });

  test("ownership transfers preserve province ids and geometry references", () => {
    const world = referenceWorld();
    const cairo = BY_KEY.get("af-egy-cairo");
    if (cairo === undefined) throw new Error("missing af-egy-cairo");
    transfer(world, idsOf("af-egy-cairo"), futureId("EGY"), "independence", "Egyptian independence", day(1922, 2, 28));
    expect(ownerOf(world, "af-egy-cairo")).toBe(futureId("EGY"));
    expect(controllerOf(world, "af-egy-cairo")).toBe(futureId("EGY"));
    const definition = DEFINITIONS.get(idOf("af-egy-cairo"));
    expect(definition?.key).toBe("af-egy-cairo");
    expect(decodeProvinceGeometry(cairo).path).not.toBeNull();
    expect(BY_KEY.get("af-egy-cairo")?.rings).toEqual(cairo.rings);
  });

  test("occupation changes control without changing legal ownership", () => {
    const world = referenceWorld();
    setProvinceControl(world, {
      provinceIds: idsOf("af-ott-tripoli-and-the-jefara"),
      controllerPolityId: 6 as Id,
      day: day(1911, 10, 5),
      note: "Italian landing at Tripoli",
      kind: "occupation",
    });
    expect(ownerOf(world, "af-ott-tripoli-and-the-jefara")).toBe(20);
    expect(controllerOf(world, "af-ott-tripoli-and-the-jefara")).toBe(6);
    expect(ownershipOf(world, "af-ott-tripoli-and-the-jefara")?.specialStatus).toBe("occupied");
    setProvinceControl(world, {
      provinceIds: idsOf("af-ott-tripoli-and-the-jefara"),
      controllerPolityId: null,
      day: day(1912, 10, 18),
      note: "Ottoman withdrawal",
      kind: "liberation",
    });
    expect(ownerOf(world, "af-ott-tripoli-and-the-jefara")).toBe(20);
    expect(controllerOf(world, "af-ott-tripoli-and-the-jefara")).toBe(20);
  });

  test("British control of and a British claim to Egypt never imply ownership", () => {
    // D-132: the Ottoman Empire owns Egypt in 1900; the United Kingdom controls it.
    const world = referenceWorld();
    const cairo = idOf("af-egy-cairo");
    addProvinceClaim(world, cairo, 1 as Id);
    expect(ownershipOf(world, "af-egy-cairo")?.ownerPolityId).toBe(20);
    expect(ownershipOf(world, "af-egy-cairo")?.controllerPolityId).toBe(1);
    expect(ownershipOf(world, "af-egy-cairo")?.claimantPolityIds).toEqual([1]);
    transfer(world, idsOf("af-egy-cairo"), futureId("EGY"), "independence", "Egyptian independence", day(1922, 2, 28));
    expect(ownershipOf(world, "af-egy-cairo")?.ownerPolityId).toBe(futureId("EGY"));
    expect(ownershipOf(world, "af-egy-cairo")?.claimantPolityIds).toEqual([1]);
  });

  test("mandate and condominium statuses are explicit and survive a transfer", () => {
    const world = referenceWorld();
    mandatePartition1919(world);
    expect(ownershipOf(world, "af-gea-tabora-and-kigoma")?.specialStatus).toBe("mandate");
    expect(ownershipOf(world, "af-kam-central-kamerun")?.specialStatus).toBe("mandate");
    expect(ownershipOf(world, "af-sud-khartoum")?.specialStatus).toBe("condominium");
    transfer(world, idsOf("af-gea-tabora-and-kigoma"), futureId("TAN"), "independence", "Tanganyikan independence", day(1961, 12, 9));
    expect(ownershipOf(world, "af-gea-tabora-and-kigoma")?.specialStatus).toBe("mandate");
  });
});

describe("M12c historical reference snapshots", () => {
  test("1903-1916 annexations close the independent Sahelian polities", () => {
    const world = referenceWorld();
    conquerSokoto1903(world);
    annexSahelianSultanates(world);
    expect(ownerOf(world, "af-sok-kano")).toBe(1);
    expect(ownerOf(world, "af-wad-wadai-and-ouaddai")).toBe(3);
    expect(ownerOf(world, "af-dar-north-darfur")).toBe(1);
    expect(
      world.provinces.ownership.filter(
        (entry) =>
          AFRICA_IDS.has(entry.provinceId) &&
          [62, 63, 64].includes(entry.ownerPolityId),
      ),
    ).toEqual([]);
    assertValidWorld(world);
  });

  test("1910 creates the Union of South Africa including Walvis Bay", () => {
    const world = referenceWorld();
    unionOfSouthAfrica1910(world);
    for (const key of [
      "af-cap-cape-peninsula-and-the-western-districts",
      "af-nat-natal-and-zululand",
      "af-zar-pretoria-and-the-witwatersrand",
      "af-orf-orange-free-state",
      "af-cap-walvis-bay",
    ]) {
      expect(ownerOf(world, key)).toBe(futureId("ZAF"));
    }
    // Walvis Bay is still a separate province so the 1994 transfer can happen.
    expect(idOf("af-cap-walvis-bay")).not.toBe(
      idOf("af-cap-cape-peninsula-and-the-western-districts"),
    );
  });

  test("1911-1923 Italy takes Libya while the Ottoman claim ends at Lausanne", () => {
    const world = referenceWorld();
    italianLibya(world);
    expect(ownerOf(world, "af-ott-tripoli-and-the-jefara")).toBe(6);
    expect(ownerOf(world, "af-ott-benghazi-and-the-jabal-al-akhdar")).toBe(6);
    expect(ownerOf(world, "af-ott-sabha-wadi-al-hayaa-and-ash-shati")).toBe(6);
    // The three historic provinces are separate provinces, so the 1951 federation
    // is representable.
    transfer(world, idsFor("af-ott-"), futureId("LBY"), "independence", "Independent Libya", day(1951, 12, 24));
    expect(ownerOf(world, "af-ott-murzuq-and-ghat")).toBe(futureId("LBY"));
  });

  test("1912 Morocco is divided into French and Spanish zones without a transfer", () => {
    const world = referenceWorld();
    moroccanProtectorates1912(world);
    expect(ownerOf(world, "af-mar-tangier-and-tetouan")).toBe(35);
    expect(controllerOf(world, "af-mar-tangier-and-tetouan")).toBe(7);
    expect(controllerOf(world, "af-mar-marrakech-and-the-south")).toBe(3);
    expect(ownershipOf(world, "af-mar-marrakech-and-the-south")?.specialStatus).toBe("occupied");
    // 1956 restores the sultan's control.
    setProvinceControl(world, {
      provinceIds: idsFor("af-mar-"),
      controllerPolityId: null,
      day: day(1956, 3, 2),
      note: "End of the protectorates",
      kind: "liberation",
    });
    expect(controllerOf(world, "af-mar-marrakech-and-the-south")).toBe(35);
    expect(controllerOf(world, "af-mar-tangier-and-tetouan")).toBe(35);
  });

  test("1919 partitions the German colonies into mandates", () => {
    const world = referenceWorld();
    mandatePartition1919(world);
    expect(ownerOf(world, "af-gea-tabora-and-kigoma")).toBe(1);
    expect(ownerOf(world, "af-gea-rwanda")).toBe(10);
    expect(ownerOf(world, "af-gea-burundi")).toBe(10);
    expect(ownerOf(world, "af-kam-central-kamerun")).toBe(3);
    expect(ownerOf(world, "af-kam-southern-cameroons")).toBe(1);
    expect(ownerOf(world, "af-tog-french-togoland-centre")).toBe(3);
    expect(ownerOf(world, "af-tog-british-togoland")).toBe(1);
    expect(ownerOf(world, "af-gsw-windhoek-and-the-khomas-highlands")).toBe(futureId("ZAF"));
    expect(
      world.provinces.ownership.filter(
        (entry) =>
          entry.ownerPolityId === 2 &&
          AFRICA_IDS.has(entry.provinceId),
      ),
    ).toEqual([]);
  });

  test("1922-1956 Egypt and the Sudan leave the condominium", () => {
    const world = referenceWorld();
    egypt1922(world);
    sudan1956(world);
    expect(ownerOf(world, "af-egy-cairo")).toBe(futureId("EGY"));
    expect(ownerOf(world, "af-sud-khartoum")).toBe(futureId("SDN"));
    expect(ownerOf(world, "af-sud-bahr-el-ghazal")).toBe(futureId("SDN"));
    // The 2011 separation uses the permanently separate southern provinces.
    southSudan2011(world);
    expect(ownerOf(world, "af-sud-bahr-el-ghazal")).toBe(futureId("SSD"));
    expect(ownerOf(world, "af-sud-equatoria")).toBe(futureId("SSD"));
    expect(ownerOf(world, "af-sud-upper-nile")).toBe(futureId("SSD"));
    expect(ownerOf(world, "af-sud-khartoum")).toBe(futureId("SDN"));
    expect(idOf("af-sud-bahr-el-ghazal")).not.toBe(idOf("af-sud-khartoum"));
    assertValidWorld(world);
  });

  test("1925 Jubaland passes from British East Africa to Italian Somaliland", () => {
    const world = referenceWorld();
    cedeJubaland1925(world);
    expect(ownerOf(world, "af-bea-jubaland")).toBe(6);
    expect(ownerOf(world, "af-bea-mombasa-and-the-coast")).toBe(1);
    transfer(world, idsFor("af-its-"), futureId("SOM"), "union", "Somali union", day(1960, 7, 1));
    transfer(world, idsOf("af-bea-jubaland"), futureId("SOM"), "union", "Somali union", day(1960, 7, 1));
    expect(ownerOf(world, "af-bea-jubaland")).toBe(futureId("SOM"));
  });

  test("1945 the former Italian colonies are under British military administration", () => {
    const world = referenceWorld();
    italianLibya(world);
    alliedAdministration1945(world);
    // Ownership stays with Italy and the Ottoman Empire until the peace
    // settlement; only effective control moves.
    expect(ownerOf(world, "af-ott-tripoli-and-the-jefara")).toBe(6);
    expect(controllerOf(world, "af-ott-tripoli-and-the-jefara")).toBe(1);
    expect(ownerOf(world, "af-eri-hamasien")).toBe(6);
    expect(controllerOf(world, "af-eri-hamasien")).toBe(1);
    expect(ownershipOf(world, "af-eri-hamasien")?.specialStatus).toBe("occupied");
    // 1951 Libya and 1952-1993 Eritrea are ordinary settlements from here.
    transfer(world, idsFor("af-ott-"), futureId("LBY"), "independence", "Independent Libya", day(1951, 12, 24));
    transfer(world, idsFor("af-eri-"), futureId("ERI"), "independence", "Eritrean independence", day(1993, 5, 24));
    expect(ownerOf(world, "af-ott-tripoli-and-the-jefara")).toBe(futureId("LBY"));
    expect(ownerOf(world, "af-eri-hamasien")).toBe(futureId("ERI"));
    assertValidWorld(world);
  });

  test("1936-1941 the Italian empire in Ethiopia is annexed and liberated", () => {    const world = referenceWorld();
    italianEthiopia1936(world);
    expect(ownerOf(world, "af-eth-tigray")).toBe(33);
    expect(ownerOf(world, "af-eth-ogaden")).toBe(33);
    expect(ownerOf(world, "af-eth-shewa-and-addis-ababa")).toBe(33);
    expect(ownerOf(world, "af-eri-hamasien")).toBe(6);
  });

  test("1956-1968 decolonisation yields the successor states", () => {
    const world = referenceWorld();
    egypt1922(world);
    sudan1956(world);
    decoloniseAfrica(world);
    const expectations: [string, string][] = [
      ["af-tun-tunis-and-the-sahel", "TUN"],
      ["af-bwa-gold-coast-colony", "GHA"],
      ["af-tog-british-togoland", "GHA"],
      ["af-fwa-guinea-fouta-djallon", "GIN"],
      ["af-fwa-senegal-the-interior", "SEN"],
      ["af-fwa-french-sudan-segou-and-mopti", "MLI"],
      ["af-fwa-mauritania-adrar-and-the-hodh", "MRT"],
      ["af-fwa-ivory-coast-the-north", "CIV"],
      ["af-fwa-upper-volta-ouagadougou", "BFA"],
      ["af-fwa-dahomey-the-north", "BEN"],
      ["af-fwa-niger-the-sahel", "NER"],
      ["af-fea-chad-the-south", "TCD"],
      ["af-fea-ubangi-shari-the-centre", "CAF"],
      ["af-fea-middle-congo-the-south", "COG"],
      ["af-fea-gabon-the-interior", "GAB"],
      ["af-cfs-katanga", "COD"],
      ["af-mad-antananarivo", "MDG"],
      ["af-kam-central-kamerun", "CMR"],
      ["af-tog-french-togoland-centre", "TGO"],
      ["af-bwa-lagos-colony", "NGA"],
      ["af-bwa-southern-nigeria-the-east", "NGA"],
      ["af-bwa-northern-nigeria-the-niger-province", "NGA"],
      ["af-sok-kano", "NGA"],
      ["af-bso-british-somaliland", "SOM"],
      ["af-its-banaadir-and-the-lower-shabelle", "SOM"],
      ["af-bwa-sierra-leone-colony", "SLE"],
      ["af-bea-buganda", "UGA"],
      ["af-gea-rwanda", "RWA"],
      ["af-gea-burundi", "BDI"],
      ["af-bea-mombasa-and-the-coast", "KEN"],
      ["af-gea-tabora-and-kigoma", "TAN"],
      ["af-bpo-zanzibar", "ZAN"],
      ["af-cra-nyasaland-central-province", "MWI"],
      ["af-cra-northern-rhodesia-central", "ZMB"],
      ["af-bwa-gambia", "GMB"],
      ["af-hct-bechuanaland-central-district", "BWA"],
      ["af-hct-basutoland-the-lowlands", "LSO"],
      ["af-hct-swaziland", "SWZ"],
      ["af-bpo-mauritius", "MUS"],
      ["af-sgg-rio-muni", "GNQ"],
      ["af-alg-algiers-and-the-mitidja", "DZA"],
    ];
    for (const [key, tag] of expectations) {
      expect(ownerOf(world, key)).toBe(futureId(tag));
    }
    assertValidWorld(world);
  });

  test("Tanganyika and Zanzibar form Tanzania from the same permanent provinces", () => {
    const world = referenceWorld();
    const mainland = AFRICA.provinces
      .filter(
        (province) =>
          province.key.startsWith("af-gea-") &&
          !["af-gea-rwanda", "af-gea-burundi"].includes(province.key),
      )
      .map((province) => province.id);
    const islands = idsOf("af-bpo-zanzibar", "af-bpo-pemba");
    transfer(world, mainland, futureId("TAN"), "independence", "Tanganyikan independence", day(1961, 12, 9));
    transfer(world, islands, futureId("ZAN"), "independence", "Zanzibari independence", day(1963, 12, 10));
    expect(ownerOf(world, "af-gea-tabora-and-kigoma")).toBe(futureId("TAN"));
    expect(ownerOf(world, "af-bpo-zanzibar")).toBe(futureId("ZAN"));
    // The 1964 union is one ordinary transfer on both sets of provinces.
    transfer(
      world,
      [...mainland, ...islands],
      futureId("TZA"),
      "union",
      "Union of Tanganyika and Zanzibar",
      day(1964, 10, 29),
    );
    expect(ownerOf(world, "af-gea-tabora-and-kigoma")).toBe(futureId("TZA"));
    expect(ownerOf(world, "af-bpo-zanzibar")).toBe(futureId("TZA"));
    expect(ownerOf(world, "af-bpo-pemba")).toBe(futureId("TZA"));
    // The province geometry and ids never change across the three states.
    expect(idOf("af-gea-tabora-and-kigoma")).not.toBe(idOf("af-bpo-zanzibar"));
    assertValidWorld(world);
  });

  test("Southern Rhodesia, Rhodesia, Zimbabwe Rhodesia and Zimbabwe", () => {
    const world = referenceWorld();
    const southernRhodesia = idsFor("af-cra-southern-rhodesia-");
    expect(FUTURE_ID.has("RHO")).toBe(true);
    expect(FUTURE_ID.has("ZRW")).toBe(true);
    transfer(world, southernRhodesia, futureId("RHO"), "independence", "Unilateral Declaration of Independence", day(1965, 11, 11));
    expect(ownerOf(world, "af-cra-southern-rhodesia-matabeleland")).toBe(futureId("RHO"));
    transfer(world, southernRhodesia, futureId("ZRW"), "transfer", "Internal settlement", day(1979, 6, 1));
    expect(ownerOf(world, "af-cra-southern-rhodesia-matabeleland")).toBe(futureId("ZRW"));
    transfer(world, southernRhodesia, futureId("ZWE"), "independence", "Independence of Zimbabwe", day(1980, 4, 18));
    expect(ownerOf(world, "af-cra-southern-rhodesia-matabeleland")).toBe(futureId("ZWE"));
    assertValidWorld(world);
  });

  test("1975 dismantles the Portuguese empire", () => {
    const world = referenceWorld();
    portugueseCollapse1975(world);
    expect(ownerOf(world, "af-ang-luanda")).toBe(futureId("AGO"));
    expect(ownerOf(world, "af-ang-cabinda")).toBe(futureId("AGO"));
    expect(ownerOf(world, "af-moz-lourenco-marques")).toBe(futureId("MOZ"));
    expect(ownerOf(world, "af-pai-bissau-and-cacheu")).toBe(futureId("GNB"));
    expect(ownerOf(world, "af-pai-barlavento-islands")).toBe(futureId("CPV"));
    expect(ownerOf(world, "af-pai-sao-tome")).toBe(futureId("STP"));
    expect(ownerOf(world, "af-pai-principe")).toBe(futureId("STP"));
    expect(ownerOf(world, "af-mad-grande-comore")).toBe(futureId("COM"));
    expect(ownerOf(world, "af-mad-anjouan")).toBe(futureId("COM"));
    expect(ownerOf(world, "af-fra-mayotte")).toBe(3);
    expect(ownerOf(world, "af-fso-french-somaliland")).toBe(futureId("DJI"));
    expect(ownerOf(world, "af-sah-rio-de-oro")).toBe(futureId("SADR"));
  });

  test("1990-1994 settles Namibia, Walvis Bay, Eritrea and Somaliland", () => {
    const world = referenceWorld();
    unionOfSouthAfrica1910(world);
    mandatePartition1919(world);
    decoloniseAfrica(world);
    southernAfricaSettlements(world);
    expect(ownerOf(world, "af-gsw-windhoek-and-the-khomas-highlands")).toBe(futureId("NAM"));
    expect(ownerOf(world, "af-cap-walvis-bay")).toBe(futureId("NAM"));
    expect(ownerOf(world, "af-eri-hamasien")).toBe(futureId("ERI"));
    expect(ownerOf(world, "af-bso-british-somaliland")).toBe(futureId("SOL"));
    expect(ownerOf(world, "af-cra-southern-rhodesia-matabeleland")).toBe(futureId("ZWE"));
    assertValidWorld(world);
  });

  test("the 1900 baseline keeps every future polity out of the world", () => {
    const world = referenceWorld();
    const futureIds = new Set(AFRICA.futurePolities.map((polity) => polity.polityId));
    for (const entry of world.provinces.ownership) {
      if (!AFRICA_IDS.has(entry.provinceId)) continue;
      expect(futureIds.has(entry.ownerPolityId)).toBe(false);
    }
  });
});

describe("M12c persistence and determinism", () => {
  test("save/load round-trips African ownership, control, claims and history", () => {
    const world = referenceWorld(9_101);
    mandatePartition1919(world);
    moroccanProtectorates1912(world);
    addProvinceClaim(world, idOf("af-egy-cairo"), 1 as Id);
    setProvinceSpecialStatus(world, idOf("af-gea-rwanda"), "mandate");
    const serialized = serializeWorld(world);
    const restored = deserializeWorld(serialized);
    assertValidWorld(restored);
    expect(restored.provinces).toEqual(world.provinces);
    expect(hashWorld(restored)).toBe(hashWorld(world));
    expect(ownerOf(restored, "af-gea-rwanda")).toBe(10);
    expect(ownerOf(restored, "af-mar-marrakech-and-the-south")).toBe(35);
    expect(controllerOf(restored, "af-mar-marrakech-and-the-south")).toBe(3);
    expect(ownershipOf(restored, "af-egy-cairo")?.claimantPolityIds).toEqual([1]);
  });

  test("an M12a-era save with only European ownership records still loads", () => {
    const world = referenceWorld();
    world.provinces.ownership = world.provinces.ownership.filter(
      (entry) => entry.provinceId <= 66001,
    );
    const restored = deserializeWorld(serializeWorld(world));
    assertValidWorld(restored);
    expect(restored.provinces.ownership.length).toBe(EUROPE.provinces.length);
    expect(restored.provinces.ownership.some((entry) => entry.provinceId >= 100001)).toBe(false);
  });

  test("an M12b-era save with only European and Asian ownership records still loads", () => {
    const world = referenceWorld();
    world.provinces.ownership = world.provinces.ownership.filter(
      (entry) => entry.provinceId <= 100239,
    );
    const restored = deserializeWorld(serializeWorld(world));
    assertValidWorld(restored);
    expect(restored.provinces.ownership.length).toBe(
      EUROPE.provinces.length + ASIA.provinces.length,
    );
    expect(restored.provinces.ownership.some((entry) => entry.provinceId >= 200001)).toBe(false);
  });

  test("identical sequences produce the identical world hash", () => {
    const left = referenceWorld(321);
    const right = referenceWorld(321);
    for (const world of [left, right]) {
      conquerSokoto1903(world);
      unionOfSouthAfrica1910(world);
      mandatePartition1919(world);
      decoloniseAfrica(world);
      portugueseCollapse1975(world);
      southernAfricaSettlements(world);
    }
    expect(hashWorld(left)).toBe(hashWorld(right));
  });

  test("different transfer orders produce a different history", () => {
    const left = referenceWorld(654);
    const right = referenceWorld(654);
    transfer(left, idsOf("af-egy-cairo"), futureId("EGY"), "independence", "Egypt first", day(1922, 2, 28));
    transfer(left, idsOf("af-sud-khartoum"), futureId("SDN"), "independence", "Sudan second", day(1956, 1, 1));
    transfer(right, idsOf("af-sud-khartoum"), futureId("SDN"), "independence", "Sudan first", day(1956, 1, 1));
    transfer(right, idsOf("af-egy-cairo"), futureId("EGY"), "independence", "Egypt second", day(1922, 2, 28));
    expect(ownerOf(left, "af-egy-cairo")).toBe(futureId("EGY"));
    expect(ownerOf(left, "af-sud-khartoum")).toBe(futureId("SDN"));
    expect(hashWorld(left)).not.toBe(hashWorld(right));
  });

  test("the scenario still builds after the combined bundle is attached", () => {
    const scenario: EconomyScenarioDef = loadM11World();
    const world = createEconomyWorld(scenario, { seed: 1 });
    assertValidWorld(world);
    expect(world.provinces.ownership.length).toBe(scenario.provinces?.definitions.length);
    expect(world.provinces.ownership.length).toBeGreaterThan(1000);
  });
});
