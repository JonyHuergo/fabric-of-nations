/**
 * M12e Oceania and global land-gap provincial system.
 *
 * The suite validates the committed Oceanian province inventory and geometry, the
 * five-bundle combined catalogue, the authoritative simulation through the
 * twentieth-century sequences the milestone requires (Australian federation 1901,
 * the New Zealand dominion, the German New Guinea / Papua mandate sequence, the
 * Samoa partition and 1962 independence, the Japanese mandate and United States
 * trust in Micronesia, the 1968-1980 independence wave and the 1986/1994
 * compacts), the PNG/Indonesia land border, and the global land-coverage audit.
 * Reference snapshots are validation references, not forced outcomes.
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
import { buildSimulationSnapshot } from "@century/sim-worker/snapshot";
import { provinceOwnershipRows } from "@century/sim-worker";

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
const OCEANIA = JSON.parse(
  readFileSync(join(ROOT, "packages/data/data/map/provinces_oceania_1900.json"), "utf8"),
) as ProvinceMapData;
const EUROPE = JSON.parse(
  readFileSync(join(ROOT, "packages/data/data/map/provinces_1900.json"), "utf8"),
) as ProvinceMapData;
const ASIA = JSON.parse(
  readFileSync(join(ROOT, "packages/data/data/map/provinces_asia_1900.json"), "utf8"),
) as ProvinceMapData;
const AFRICA = JSON.parse(
  readFileSync(join(ROOT, "packages/data/data/map/provinces_africa_1900.json"), "utf8"),
) as ProvinceMapData;
const AMERICAS = JSON.parse(
  readFileSync(join(ROOT, "packages/data/data/map/provinces_americas_1900.json"), "utf8"),
) as ProvinceMapData;
const AUDIT = JSON.parse(
  readFileSync(join(ROOT, "packages/data/data/map/provinces_oceania_1900_audit.json"), "utf8"),
) as {
  provinceCount: number;
  duplicateProvinceIds: number;
  duplicateKeys: number;
  duplicateUnitClaimCount: number;
  unassignedUnitCount: number;
  crossFeatureSeamBorderCount: number;
  crossFeaturePolityFrontierSeamCount: number;
  gapProvinceCount: number;
  autoLandGapProvinceCount: number;
  featureResidualProvinces: string[];
  documentedExceptions: { kind: string; count: number; reason: string }[];
  coverage: { tag: string; residualArea: number; estimated: boolean }[];
  overlapCount: number;
  unmatchedBorderSegments: number;
  borderSegmentCount: number;
};
const GLOBAL_AUDIT = JSON.parse(
  readFileSync(join(ROOT, "packages/data/data/map/global_land_audit.json"), "utf8"),
) as {
  landRingCount: number;
  exceptions: {
    antarcticaRingCount: number;
    waterHoleRingCount: number;
    list: { ring: number; kind: string; reason: string }[];
  };
  totals: {
    nonAntarcticLandRingCount: number;
    assignedRingCount: number;
    unassignedRingCount: number;
    landArea: number;
    unassignedArea: number;
    coastlineBandArea: number;
    sampleCount: number;
    coveredSampleCount: number;
    bandSampleCount: number;
    unassignedSampleCount: number;
    representativeVertexCount: number;
    unassignedVertexCount: number;
  };
  features: {
    mapFeatureCount: number;
    featuresWithoutProvince: string[];
  };
  admin1Units: {
    unassignedUnitTotal: number;
    duplicateUnitClaimTotal: number;
    allUnitsClaimed: boolean;
  };
  rings: {
    ring: number;
    bbox: number[];
    area: number;
    exception: string | null;
    coveredSamples: number;
    bandSamples: number;
    unassignedSamples: number;
    coveringProvince: string | null;
    labelCovered: boolean;
  }[];
};
const WORLD_MAP = JSON.parse(
  readFileSync(join(ROOT, "packages/data/data/map/world_map_1900.json"), "utf8"),
) as {
  land: number[][];
  polities: { tag: string; bbox: number[]; rings: number[][] }[];
};

const SCENARIO = loadM11World();
const DEFINITIONS = new Map(
  (SCENARIO.provinces?.definitions ?? []).map((definition) => [
    definition.provinceId,
    definition,
  ]),
);
const BY_KEY = new Map(OCEANIA.provinces.map((province) => [province.key, province]));
const OCEANIA_IDS = new Set(OCEANIA.provinces.map((province) => province.id));
const FUTURE_ID = new Map(
  OCEANIA.futurePolities.map((polity) => [polity.tag, polity.polityId]),
);
const REGION_IDS = new Set(SCENARIO.population.provinceEconomies.map((province) => province.id));
const COMBINED = [...EUROPE.provinces, ...ASIA.provinces, ...AFRICA.provinces, ...AMERICAS.provinces, ...OCEANIA.provinces];
const COMBINED_KEYS = new Set(COMBINED.map((province) => province.key));

/** Province key prefix -> the modern successor state the province becomes. */
const SUCCESSOR_RULES: readonly (readonly [string, string])[] = [
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
  ["oc-chl-", "CHL"],
  ["oc-mex-", "MEX"],
  ["oc-usa-", "USA"],
  ["oc-bpo-norfolk-", "AUS"],
  ["oc-gbr-", "GBR"],
  ["oc-nor-", "NOR"],
  ["oc-aut-", "AUT"],
  ["oc-fra-", "FRA"],
];

/** Every modern sovereign Oceanian state and self-governing entity. */
const MODERN_STATES: readonly (readonly [string, "catalog" | "future" | "registered"])[] = [
  ["AUS", "catalog"],
  ["NZL", "catalog"],
  ["TON", "catalog"],
  ["PNG", "future"],
  ["FJI", "future"],
  ["WSM", "future"],
  ["NRU", "future"],
  ["TUV", "future"],
  ["SLB", "future"],
  ["KIR", "future"],
  ["VUT", "future"],
  ["MHL", "future"],
  ["FSM", "future"],
  ["PLW", "future"],
  ["COK", "future"],
  ["NIU", "future"],
  ["TKL", "future"],
  ["MNP", "future"],
  ["NZD", "future"],
];

/**
 * Every modern Oceanian land border. The only sovereign land border in Oceania is
 * the Papua New Guinea / Indonesia line on New Guinea; every other state is an
 * island state with no land neighbour.
 */
const MODERN_LAND_BORDERS: readonly (readonly [string, string])[] = [["PNG", "IDN"]];

function successorOf(key: string): string {
  for (const [prefix, tag] of SUCCESSOR_RULES) {
    if (key.startsWith(prefix)) return tag;
  }
  return "(unmapped)";
}

/**
 * Successor mapping used by the combined-border test. Oceanian keys use the
 * detailed rules; the Asian Dutch East Indies keys map to modern Indonesia so the
 * PNG/Indonesia border pair can be recognised.
 */
function successorOfForCombined(key: string): string {
  if (key.startsWith("as-dei-")) return "IDN";
  return successorOf(key);
}

const OCEANIAN_TAGS = new Set([
  "AUS", "NZL", "PNG", "FJI", "SLB", "VUT", "WSM", "TON", "TUV", "KIR",
  "NRU", "MHL", "FSM", "PLW", "COK", "NIU", "TKL", "MNP", "GUM", "ASM",
  "NCL", "PYF", "WLF", "GBR", "FRA", "USA", "CHL", "MEX", "NOR", "AUT",
  "IDN",
]);

function day(year: number, month: number, date: number): number {
  return civilDateToDayIndex(year, month as 1, date);
}

function idOf(key: string): Id {
  const province = BY_KEY.get(key);
  if (province === undefined) throw new Error(`unknown Oceanian province ${key}`);
  return province.id;
}

function idsFor(prefix: string): Id[] {
  return OCEANIA.provinces
    .filter((province) => province.key.startsWith(prefix))
    .map((province) => province.id);
}

function futureId(tag: string): Id {
  const id = FUTURE_ID.get(tag);
  if (id === undefined) throw new Error(`unknown Oceanian future polity ${tag}`);
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

function referenceWorld(seed = 91_200): World {
  // P2: the reference sequences run on the political geography alone (D-118).
  return politicalGeographyWorld(SCENARIO, seed);
}

function snapshotFor(world: World) {
  return buildSimulationSnapshot(
    world,
    SCENARIO.definitions,
    { sequence: 1, running: false, speedDaysPerSecond: 1, achievedDaysPerSecond: 0 },
    SCENARIO.population.definitions,
  );
}

/** 1901: the six colonies federate as the Commonwealth of Australia. */
function australianFederation1901(world: World): void {
  transfer(
    world,
    idsFor("oc-aus-"),
    futureId("AUS"),
    "union",
    "Federation of the Australian colonies",
    day(1901, 1, 1),
  );
}

/** 1906: Australia takes over the administration of British New Guinea. */
function papuaAdministration1906(world: World): void {
  setProvinceControl(world, {
    provinceIds: idsFor("oc-bpo-papua-"),
    controllerPolityId: 57 as Id,
    day: day(1906, 9, 1),
    note: "Australia assumes the administration of British New Guinea",
    kind: "occupation",
  });
}

/** 1914: Australia occupies German New Guinea. */
function germanNewGuineaOccupation1914(world: World): void {
  setProvinceControl(world, {
    provinceIds: idsFor("oc-gng-"),
    controllerPolityId: 57 as Id,
    day: day(1914, 9, 11),
    note: "Australian occupation of German New Guinea",
    kind: "occupation",
  });
}

/** 1920: the League of Nations mandate for German New Guinea. */
function germanNewGuineaMandate1920(world: World): void {
  transfer(
    world,
    idsFor("oc-gng-"),
    57 as Id,
    "transfer",
    "League of Nations mandate for the Territory of New Guinea",
    day(1920, 12, 17),
  );
  for (const key of ["oc-gng-madang", "oc-gng-bougainville"]) {
    setProvinceSpecialStatus(world, idOf(key), "mandate");
  }
}

/** 1949: Papua and New Guinea are united under Australian administration. */
function papuaNewGuineaUnion1949(world: World): void {
  transfer(
    world,
    idsFor("oc-bpo-papua-"),
    57 as Id,
    "union",
    "Papua and New Guinea Act unites the territory under Australia",
    day(1949, 7, 1),
  );
}

/** 1975: Papua New Guinea becomes independent. */
function papuaNewGuineaIndependence1975(world: World): void {
  transfer(
    world,
    [...idsFor("oc-gng-"), ...idsFor("oc-bpo-papua-"), ...idsFor("oc-gap-gng-")],
    futureId("PNG"),
    "independence",
    "Independence of Papua New Guinea",
    day(1975, 9, 16),
  );
}

/** 1914-1962: the German Samoa / New Zealand mandate / Western Samoa sequence. */
function samoaSequence(world: World): void {
  setProvinceControl(world, {
    provinceIds: idsFor("oc-gsa-"),
    controllerPolityId: 58 as Id,
    day: day(1914, 8, 29),
    note: "New Zealand occupation of German Samoa",
    kind: "occupation",
  });
  transfer(
    world,
    idsFor("oc-gsa-"),
    58 as Id,
    "transfer",
    "League of Nations mandate for Western Samoa",
    day(1920, 12, 17),
  );
  setProvinceSpecialStatus(world, idOf("oc-gsa-german-samoa"), "mandate");
  transfer(
    world,
    idsFor("oc-gsa-"),
    futureId("WSM"),
    "independence",
    "Independence of Western Samoa",
    day(1962, 1, 1),
  );
}

/** 1914-1994: the Japanese mandate and United States trust in Micronesia. */
function micronesiaSequence(world: World): void {
  setProvinceControl(world, {
    provinceIds: idsFor("oc-gpn-"),
    controllerPolityId: 5 as Id,
    day: day(1914, 10, 3),
    note: "Japanese occupation of the German Pacific islands",
    kind: "occupation",
  });
  transfer(
    world,
    idsFor("oc-gpn-"),
    5 as Id,
    "transfer",
    "South Seas Mandate",
    day(1920, 12, 17),
  );
  transfer(
    world,
    idsFor("oc-gpn-"),
    0 as Id,
    "transfer",
    "United States Trust Territory of the Pacific Islands",
    day(1947, 7, 18),
  );
  transfer(
    world,
    idsFor("oc-gpn-marshall-"),
    futureId("MHL"),
    "independence",
    "Compact of Free Association with the Marshall Islands",
    day(1986, 10, 21),
  );
  transfer(
    world,
    idsFor("oc-gpn-caroline-"),
    futureId("FSM"),
    "independence",
    "Compact of Free Association with the Federated States of Micronesia",
    day(1986, 11, 3),
  );
  transfer(
    world,
    idsFor("oc-gpn-palau"),
    futureId("PLW"),
    "independence",
    "Palau Compact of Free Association",
    day(1994, 10, 1),
  );
  setProvinceSpecialStatus(world, idOf("oc-gpn-northern-marianas-saipan"), "autonomous");
}

/** 1968-1980: the Oceanian independence wave. */
function independenceWave(world: World): void {
  const steps: readonly [string, string, number, number, number][] = [
    ["NRU", "oc-gpn-nauru", 1968, 1, 31],
    ["FJI", "oc-fji-", 1970, 10, 10],
    ["TUV", "oc-bpo-ellice-", 1978, 10, 1],
    ["SLB", "oc-bpo-solomon-", 1978, 7, 7],
    ["KIR", "oc-bpo-gilbert-", 1979, 7, 12],
    ["VUT", "oc-bpo-new-hebrides-", 1980, 7, 30],
  ];
  for (const [tag, prefix, year, month, date] of steps) {
    transfer(
      world,
      idsFor(prefix),
      futureId(tag),
      "independence",
      `Independence of ${tag}`,
      day(year, month, date),
    );
  }
  // Kiribati also includes the Phoenix and Line island groups.
  transfer(
    world,
    [...idsFor("oc-bpo-line-"), ...idsFor("oc-bpo-phoenix-")],
    futureId("KIR"),
    "independence",
    "Line and Phoenix islands join Kiribati",
    day(1979, 7, 12),
  );
  // Tonga's 1970 end of British protection is a status change, not a transfer.
  setProvinceSpecialStatus(world, idOf("oc-ton-tongatapu"), "ordinary");
}

// ---- independent land-mask geometry (not the audit script) ------------------

function decodeRing(flat: readonly number[]): number[][] {
  const points: number[][] = [];
  let x = 0;
  let y = 0;
  for (let index = 0; index < flat.length; index += 2) {
    x += flat[index] ?? 0;
    y += flat[index + 1] ?? 0;
    points.push([x / 1000, y / 1000]);
  }
  return points;
}

function ringContains(ring: readonly (readonly number[])[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi = 0, yi = 0] = ring[i] ?? [];
    const [xj = 0, yj = 0] = ring[j] ?? [];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const LAND_GRID = 1;
const decodedProvinceCache = new Map<
  number,
  { readonly rings: number[][][]; readonly holes: ReadonlySet<number> }
>();
const landProvinceGrid = new Map<string, typeof COMBINED>();
for (const province of COMBINED) {
  decodedProvinceCache.set(province.id, {
    rings: province.rings.map((ring) => decodeRing(ring)),
    holes: new Set(province.holes),
  });
  const [minX = -180, minY = -90, maxX = 180, maxY = 90] = province.bbox;
  for (let cx = Math.floor(minX / LAND_GRID); cx <= Math.floor(maxX / LAND_GRID); cx += 1) {
    for (let cy = Math.floor(minY / LAND_GRID); cy <= Math.floor(maxY / LAND_GRID); cy += 1) {
      const key = `${cx},${cy}`;
      const list = landProvinceGrid.get(key);
      if (list === undefined) landProvinceGrid.set(key, [province]);
      else list.push(province);
    }
  }
}

function provinceContains(provinceId: number, x: number, y: number): boolean {
  const decoded = decodedProvinceCache.get(provinceId);
  if (decoded === undefined) return false;
  let insideOuter = false;
  for (let index = 0; index < decoded.rings.length; index += 1) {
    if (!ringContains(decoded.rings[index] ?? [], x, y)) continue;
    if (decoded.holes.has(index)) return false;
    insideOuter = true;
  }
  return insideOuter;
}

function landProvinceAt(x: number, y: number): string | null {
  const wx = ((x + 540) % 360) - 180;
  for (const offset of [0, 360, -360]) {
    const list = landProvinceGrid.get(`${Math.floor((wx + offset) / LAND_GRID)},${Math.floor(y / LAND_GRID)}`) ?? [];
    for (const province of list) {
      if (provinceContains(province.id, wx + offset, y)) return province.key;
    }
  }
  return null;
}

/**
 * D-128 (P2 geometry repair): the duplicate European Greenland and the dissolved German
 * coverage residual leave 1,687 of the original 1,689 provinces.
 */
const PROVINCES_AFTER_P2_REPAIR = 1687;

describe("M12e Oceania province inventory and geometry", () => {
  test("the committed bundle covers Oceania and the global gaps with stable unique ids", () => {
    // D-128: the German coverage residual was dissolved into its neighbours.
    expect(OCEANIA.provinces.length).toBe(150);
    expect(new Set(OCEANIA.provinces.map((province) => province.id)).size).toBe(
      OCEANIA.provinces.length,
    );
    expect(new Set(OCEANIA.provinces.map((province) => province.key)).size).toBe(
      OCEANIA.provinces.length,
    );
    expect(AUDIT.provinceCount).toBe(OCEANIA.provinces.length);
    expect(AUDIT.duplicateProvinceIds).toBe(0);
    expect(AUDIT.duplicateKeys).toBe(0);
    expect(AUDIT.duplicateUnitClaimCount).toBe(0);
    expect(AUDIT.unassignedUnitCount).toBe(0);
    for (const province of OCEANIA.provinces) {
      expect(province.id).toBeGreaterThan(400000);
      expect(province.key.startsWith("oc-")).toBe(true);
    }
  });

  test("ids, keys and future polities are disjoint from the earlier bundles", () => {
    const priorIds = new Set(
      [...EUROPE.provinces, ...ASIA.provinces, ...AFRICA.provinces, ...AMERICAS.provinces].map(
        (province) => province.id,
      ),
    );
    const priorKeys = new Set(
      [...EUROPE.provinces, ...ASIA.provinces, ...AFRICA.provinces, ...AMERICAS.provinces].map(
        (province) => province.key,
      ),
    );
    for (const province of OCEANIA.provinces) {
      expect(priorIds.has(province.id)).toBe(false);
      expect(priorKeys.has(province.key)).toBe(false);
    }
    const priorFuture = new Set(
      [
        ...EUROPE.futurePolities,
        ...ASIA.futurePolities,
        ...AFRICA.futurePolities,
        ...AMERICAS.futurePolities,
      ].map((polity) => polity.polityId),
    );
    for (const polity of OCEANIA.futurePolities) {
      expect(polity.polityId).toBeGreaterThanOrEqual(1400);
      expect(polity.polityId).toBeLessThanOrEqual(1499);
      expect(priorFuture.has(polity.polityId)).toBe(false);
    }
  });

  test("the required Oceanian owners, map features and province ids are represented", () => {
    const owners = new Set(OCEANIA.provinces.map((province) => province.initialOwnerTag));
    for (const tag of ["AUS", "NZL", "TON", "GBR", "DEU", "FRA", "USA", "CHL", "MEX"]) {
      expect(owners.has(tag)).toBe(true);
    }
    const mapTags = new Set(OCEANIA.provinces.map((province) => province.mapTag));
    for (const tag of [
      "AUS", "NZL", "FJI", "TON", "BPO", "FPO", "GNG", "GSA", "GPN", "GUM",
      "ASM", "BSA", "CHL", "MEX", "USA", "GBR", "NOR", "AUT",
    ]) {
      expect(mapTags.has(tag)).toBe(true);
    }
    for (const province of OCEANIA.provinces) {
      // P2 (D-118): every province is an economic unit of its own; the region link is gone.
      expect(REGION_IDS.has(province.id)).toBe(true);
      expect("simulationRegionId" in province).toBe(false);
    }
  });

  test("every province has a 1900 owner, administrative metadata and provenance", () => {
    for (const province of OCEANIA.provinces) {
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
    for (const province of OCEANIA.provinces) {
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
        if (!(province.area > 0)) failures.push(`${province.key}: non-positive area`);
        if (province.bbox.length !== 4) failures.push(`${province.key}: bad bbox`);
      } catch (error) {
        failures.push(`${province.key}: ${String(error)}`);
      }
    }
    expect(failures).toEqual([]);
    expect(ringCount).toBeGreaterThan(OCEANIA.provinces.length);
  });

  test("province borders are deduplicated open polylines", () => {
    let lineCount = 0;
    for (const border of OCEANIA.borders) {
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
    expect(lineCount).toBeGreaterThan(1000);
  });

  test("the coverage audit records a complete Oceanian partition and the gap provinces", () => {
    expect(AUDIT.coverage.length).toBeGreaterThan(10);
    let totalResidual = 0;
    for (const entry of AUDIT.coverage) {
      if (entry.estimated) continue;
      expect(entry.residualArea).toBeLessThan(0.5);
      totalResidual += entry.residualArea;
    }
    expect(totalResidual).toBeLessThan(0.5);
    expect(AUDIT.overlapCount).toBeLessThan(5);
    expect(AUDIT.unmatchedBorderSegments).toBeLessThan(60);
    expect(AUDIT.crossFeatureSeamBorderCount).toBeGreaterThan(0);
    expect(AUDIT.borderSegmentCount).toBeGreaterThan(50000);
    expect(AUDIT.gapProvinceCount).toBe(25);
    expect(AUDIT.featureResidualProvinces.length).toBe(24);
    expect(AUDIT.autoLandGapProvinceCount).toBe(0);
  });

  test("successor-border split provinces share continuous edges", () => {
    const pairs: [string, string][] = [
      ["oc-aus-new-south-wales", "oc-aus-victoria"],
      ["oc-aus-new-south-wales", "oc-aus-queensland"],
      ["oc-aus-new-south-wales", "oc-aus-south-australia"],
      ["oc-aus-victoria", "oc-aus-south-australia"],
      ["oc-aus-south-australia", "oc-aus-northern-territory"],
      ["oc-aus-south-australia", "oc-aus-western-australia"],
      ["oc-aus-queensland", "oc-aus-northern-territory"],
      ["oc-nzl-southland", "oc-nzl-otago"],
      ["oc-fpo-new-caledonia-north-province", "oc-fpo-new-caledonia-south-province"],
    ];
    for (const [leftKey, rightKey] of pairs) {
      const left = idOf(leftKey);
      const right = idOf(rightKey);
      const shared = OCEANIA.borders.filter(
        (border) =>
          (border.a === left && border.b === right) ||
          (border.a === right && border.b === left),
      );
      expect(shared.length).toBeGreaterThan(0);
      expect(shared.reduce((sum, border) => sum + border.lines.length, 0)).toBeGreaterThan(0);
    }
    // German New Guinea and British Papua share the 1885 central-range frontier.
    const gngIds = new Set(idsFor("oc-gng-"));
    const papuaIds = new Set(idsFor("oc-bpo-papua-"));
    const partitionEdges = OCEANIA.borders.filter(
      (border) =>
        border.b >= 0 &&
        ((gngIds.has(border.a) && papuaIds.has(border.b)) ||
          (papuaIds.has(border.a) && gngIds.has(border.b))),
    );
    expect(partitionEdges.length).toBeGreaterThan(0);
    // The Samoa partition is a sea boundary: the two groups share no land edge.
    const gsa = idOf("oc-gsa-german-samoa");
    const asm = idOf("oc-asm-american-samoa");
    expect(
      OCEANIA.borders.some(
        (border) =>
          (border.a === gsa && border.b === asm) || (border.a === asm && border.b === gsa),
      ),
    ).toBe(false);
  });

  test("every modern Oceanian land border has a province edge", () => {
    const successorById = new Map(
      COMBINED.map((province) => [province.id, successorOfForCombined(province.key)]),
    );
    const pairs = new Set<string>();
    for (const border of PROVINCE_MAP_1900.borders) {
      if (border.b < 0) continue;
      const left = successorById.get(border.a);
      const right = successorById.get(border.b);
      if (left === undefined || right === undefined || left === right) continue;
      if (!OCEANIAN_TAGS.has(left) || !OCEANIAN_TAGS.has(right)) continue;
      pairs.add(left < right ? `${left}|${right}` : `${right}|${left}`);
    }
    const missing = MODERN_LAND_BORDERS.map(([left, right]) =>
      left < right ? `${left}|${right}` : `${right}|${left}`,
    ).filter((key) => !pairs.has(key));
    expect(missing).toEqual([]);
    // No other Oceanian land border exists between island states.
    expect([...pairs].sort()).toEqual(["IDN|PNG"]);
  });

  test("every twentieth-century Oceanian state is registered", () => {
    const catalogTags = new Set((SCENARIO.countries ?? []).map((country) => country.tag));
    for (const [tag, kind] of MODERN_STATES) {
      if (kind === "catalog") {
        expect(catalogTags.has(tag)).toBe(true);
      } else {
        expect(FUTURE_ID.has(tag)).toBe(true);
      }
    }
    // AUS and NZL are 1900 catalog polities; NZD is the registry dominion entry.
    expect(catalogTags.has("AUS")).toBe(true);
    expect(catalogTags.has("NZL")).toBe(true);
    expect(catalogTags.has("TON")).toBe(true);
    expect(FUTURE_ID.has("AUS")).toBe(true);
    expect(FUTURE_ID.has("NZD")).toBe(true);
    // Historical and breakaway entries exist for alternate history only.
    for (const tag of ["RHI", "TAH", "FIJ", "RNS", "TAF", "VEM", "MIN", "HUT"]) {
      expect(FUTURE_ID.has(tag)).toBe(true);
      expect(OCEANIA.futurePolities.find((polity) => polity.tag === tag)?.kind).toBe("historical");
    }
    const terminal = civilDateToDayIndex(2000, 1, 1);
    for (const polity of OCEANIA.futurePolities) {
      const [year = 0, month = 1, date = 1] = polity.activeFrom.split("-").map(Number);
      const from = civilDateToDayIndex(year, month as 1, date);
      expect(from).toBeGreaterThanOrEqual(0);
      expect(from).toBeLessThanOrEqual(terminal);
      if (polity.activeTo !== null) {
        const [toYear = 0, toMonth = 1, toDate = 1] = polity.activeTo.split("-").map(Number);
        expect(civilDateToDayIndex(toYear, toMonth as 1, toDate)).toBeLessThanOrEqual(terminal);
      }
    }
  });

  test("the required Oceanian historical subdivisions exist", () => {
    for (const key of [
      "oc-aus-new-south-wales",
      "oc-aus-victoria",
      "oc-aus-queensland",
      "oc-aus-south-australia",
      "oc-aus-western-australia",
      "oc-aus-tasmania",
      "oc-aus-northern-territory",
      "oc-aus-federal-capital-territory",
      "oc-aus-macquarie-island",
      "oc-bpo-norfolk-island",
      "oc-nzl-northland",
      "oc-nzl-southland",
      "oc-nzl-stewart-island",
      "oc-nzl-chatham-islands",
      "oc-nzl-kermadec-islands",
      "oc-nzl-auckland-islands",
      "oc-nzl-campbell-island",
      "oc-nzl-antipodes-islands",
      "oc-nzl-snares-islands",
      "oc-nzl-tokelau",
      "oc-gng-madang",
      "oc-gng-bougainville",
      "oc-bpo-papua-central",
      "oc-bpo-papua-milne-bay",
      "oc-fji-central-division",
      "oc-fji-rotuma",
      "oc-bpo-solomon-guadalcanal",
      "oc-bpo-new-hebrides-shefa",
      "oc-fpo-new-caledonia-south-province",
      "oc-gpn-nauru",
      "oc-gpn-marshall-ratak-chain",
      "oc-gpn-caroline-chuuk",
      "oc-gpn-palau",
      "oc-gpn-northern-marianas-saipan",
      "oc-gum-guam",
      "oc-bpo-gilbert-islands",
      "oc-bpo-line-islands",
      "oc-bpo-phoenix-islands",
      "oc-bpo-ellice-islands",
      "oc-ton-tongatapu",
      "oc-ton-vava-u",
      "oc-gsa-german-samoa",
      "oc-asm-american-samoa",
      "oc-bpo-cook-islands-southern",
      "oc-bpo-cook-islands-northern",
      "oc-bpo-niue",
      "oc-fpo-windward-islands",
      "oc-fpo-marquesas-islands",
      "oc-fpo-french-southern-lands",
      "oc-fpo-wallis-island",
      "oc-fpo-futuna-and-alofi",
      "oc-bsa-pitcairn-islands",
      "oc-bsa-chagos-archipelago",
      "oc-bpo-heard-and-mcdonald-islands",
      "oc-chl-easter-island",
      "oc-chl-juan-fernandez-islands",
      "oc-mex-revillagigedo-islands",
      "oc-usa-pacific-remote-islands",
      "oc-fra-clipperton-island",
      "oc-gbr-isle-of-man",
      "oc-nor-svalbard",
      "oc-aut-krk-island",
      "oc-aut-cres-and-losinj",
    ]) {
      expect(BY_KEY.has(key)).toBe(true);
    }
    expect(BY_KEY.get("oc-bpo-new-hebrides-shefa")?.initialSpecialStatus).toBe("condominium");
    expect(BY_KEY.get("oc-gbr-isle-of-man")?.initialSpecialStatus).toBe("autonomous");
  });
});

describe("M12e authoritative provincial ownership", () => {
  test("the 1900 world starts with one ownership record per combined province", () => {
    const world = referenceWorld(41_900_001);
    assertValidWorld(world);
    expect(world.provinces.enabled).toBe(true);
    expect(world.provinces.ownership.length).toBe(DEFINITIONS.size);
    expect(world.provinces.ownership.length).toBe(PROVINCES_AFTER_P2_REPAIR);
    for (const key of [
      "oc-aus-new-south-wales",
      "oc-nzl-auckland",
      "oc-gng-madang",
      "oc-bpo-papua-central",
      "oc-gsa-german-samoa",
      "oc-gpn-nauru",
      "oc-bsa-pitcairn-islands",
      "oc-chl-easter-island",
    ]) {
      const entry = ownershipOf(world, key);
      expect(entry).toBeDefined();
      expect(entry?.ownerPolityId).toBe(entry?.controllerPolityId);
      expect(entry?.claimantPolityIds).toEqual([]);
      expect(entry?.controlledSinceDay).toBeNull();
    }
  });

  test("historical and breakaway polities are registered but own nothing in 1900", () => {
    const historical = OCEANIA.futurePolities.filter(
      (polity) => polity.kind === "historical",
    );
    expect(historical.length).toBe(8);
    const world = referenceWorld();
    for (const polity of historical) {
      expect(
        world.provinces.ownership.some((entry) => entry.ownerPolityId === polity.polityId),
      ).toBe(false);
    }
    // Hawaiian history is registered by the M12d Americas bundle (HAW); the
    // Oceanian registry adds the Republic of Hawaii because a tag cannot repeat
    // across the one combined registry.
    expect(AMERICAS.futurePolities.some((polity) => polity.tag === "HAW")).toBe(true);
  });

  test("the 1900 baseline keeps every future polity out", () => {
    const world = referenceWorld();
    const futureIds = new Set(OCEANIA.futurePolities.map((polity) => polity.polityId));
    for (const entry of world.provinces.ownership) {
      if (!OCEANIA_IDS.has(entry.provinceId)) continue;
      expect(futureIds.has(entry.ownerPolityId)).toBe(false);
    }
  });

  test("1901-1949: federation, mandates and unions are ordinary ownership changes", () => {
    const world = referenceWorld();
    australianFederation1901(world);
    expect(ownerOf(world, "oc-aus-new-south-wales")).toBe(futureId("AUS"));
    expect(ownerOf(world, "oc-aus-northern-territory")).toBe(futureId("AUS"));
    // The federation keeps the country tag so the palette colour is unchanged.
    expect(OCEANIA.futurePolities.find((polity) => polity.polityId === futureId("AUS"))?.tag).toBe(
      "AUS",
    );

    papuaAdministration1906(world);
    expect(ownerOf(world, "oc-bpo-papua-central")).toBe(1);
    expect(controllerOf(world, "oc-bpo-papua-central")).toBe(57);
    germanNewGuineaOccupation1914(world);
    expect(ownerOf(world, "oc-gng-madang")).toBe(2);
    expect(controllerOf(world, "oc-gng-madang")).toBe(57);
    germanNewGuineaMandate1920(world);
    expect(ownerOf(world, "oc-gng-madang")).toBe(57);
    expect(ownershipOf(world, "oc-gng-madang")?.specialStatus).toBe("mandate");
    papuaNewGuineaUnion1949(world);
    expect(ownerOf(world, "oc-bpo-papua-central")).toBe(57);
    assertValidWorld(world);
  });

  test("1950-1975: Papua New Guinea independence transfers both groups", () => {
    const world = referenceWorld();
    papuaNewGuineaIndependence1975(world);
    expect(ownerOf(world, "oc-gng-madang")).toBe(futureId("PNG"));
    expect(ownerOf(world, "oc-bpo-papua-central")).toBe(futureId("PNG"));
    expect(ownerOf(world, "oc-gap-gng-residual")).toBe(futureId("PNG"));
    // German New Guinea and Papua remain separate permanent provinces.
    expect(BY_KEY.get("oc-gng-madang")?.id).not.toBe(BY_KEY.get("oc-bpo-papua-central")?.id);
    assertValidWorld(world);
  });

  test("the Samoa partition, mandate and 1962 independence are ordinary changes", () => {
    const world = referenceWorld();
    samoaSequence(world);
    expect(ownerOf(world, "oc-gsa-german-samoa")).toBe(futureId("WSM"));
    expect(ownerOf(world, "oc-asm-american-samoa")).toBe(0);
    expect(ownershipOf(world, "oc-asm-american-samoa")?.specialStatus).toBe("ordinary");
    assertValidWorld(world);
  });

  test("the Japanese mandate and United States trust are ordinary changes", () => {
    const world = referenceWorld();
    micronesiaSequence(world);
    expect(ownerOf(world, "oc-gpn-marshall-ratak-chain")).toBe(futureId("MHL"));
    expect(ownerOf(world, "oc-gpn-caroline-chuuk")).toBe(futureId("FSM"));
    expect(ownerOf(world, "oc-gpn-palau")).toBe(futureId("PLW"));
    expect(ownerOf(world, "oc-gpn-northern-marianas-saipan")).toBe(0);
    expect(ownershipOf(world, "oc-gpn-northern-marianas-saipan")?.specialStatus).toBe(
      "autonomous",
    );
    assertValidWorld(world);
  });

  test("the 1968-1980 independence wave and Tonga's status change are ordinary changes", () => {
    const world = referenceWorld();
    independenceWave(world);
    for (const [tag, key] of [
      ["NRU", "oc-gpn-nauru"],
      ["FJI", "oc-fji-central-division"],
      ["TUV", "oc-bpo-ellice-islands"],
      ["SLB", "oc-bpo-solomon-guadalcanal"],
      ["KIR", "oc-bpo-gilbert-islands"],
      ["VUT", "oc-bpo-new-hebrides-shefa"],
    ] as const) {
      expect(ownerOf(world, key)).toBe(futureId(tag));
    }
    expect(ownerOf(world, "oc-bpo-line-islands")).toBe(futureId("KIR"));
    expect(ownerOf(world, "oc-ton-tongatapu")).toBe(61);
    assertValidWorld(world);
  });

  test("occupation, claims and special status stay separate from ownership", () => {
    const world = referenceWorld();
    setProvinceControl(world, {
      provinceIds: idsFor("oc-gum-"),
      controllerPolityId: 5 as Id,
      day: day(1941, 12, 10),
      note: "Japanese occupation of Guam",
      kind: "occupation",
    });
    expect(ownerOf(world, "oc-gum-guam")).toBe(0);
    expect(controllerOf(world, "oc-gum-guam")).toBe(5);
    setProvinceControl(world, {
      provinceIds: idsFor("oc-gum-"),
      controllerPolityId: null,
      day: day(1944, 8, 10),
      note: "Liberation of Guam",
      kind: "liberation",
    });
    expect(controllerOf(world, "oc-gum-guam")).toBe(0);
    addProvinceClaim(world, idOf("oc-bpo-heard-and-mcdonald-islands"), 57 as Id);
    expect(
      ownershipOf(world, "oc-bpo-heard-and-mcdonald-islands")?.claimantPolityIds,
    ).toEqual([57]);
    setProvinceSpecialStatus(world, idOf("oc-nzl-tokelau"), "autonomous");
    expect(ownershipOf(world, "oc-nzl-tokelau")?.specialStatus).toBe("autonomous");
    assertValidWorld(world);
  });
});

describe("M12e historical reference snapshots", () => {
  test("1900 snapshot: the colonies, dominions and island possessions", () => {
    const world = referenceWorld();
    expect(ownerOf(world, "oc-aus-new-south-wales")).toBe(57);
    expect(ownerOf(world, "oc-nzl-auckland")).toBe(58);
    expect(ownerOf(world, "oc-ton-tongatapu")).toBe(61);
    expect(ownerOf(world, "oc-gng-madang")).toBe(2);
    expect(ownerOf(world, "oc-bpo-papua-central")).toBe(1);
    expect(ownerOf(world, "oc-gsa-german-samoa")).toBe(2);
    expect(ownerOf(world, "oc-asm-american-samoa")).toBe(0);
    expect(ownerOf(world, "oc-gum-guam")).toBe(0);
    expect(ownerOf(world, "oc-gpn-nauru")).toBe(2);
    expect(ownerOf(world, "oc-fji-central-division")).toBe(1);
    expect(ownerOf(world, "oc-bpo-new-hebrides-shefa")).toBe(1);
    expect(ownerOf(world, "oc-fpo-new-caledonia-south-province")).toBe(3);
    expect(ownerOf(world, "oc-chl-easter-island")).toBe(49);
    expect(ownerOf(world, "oc-mex-revillagigedo-islands")).toBe(38);
    expect(ownerOf(world, "oc-bsa-pitcairn-islands")).toBe(1);
  });

  test("1901 snapshot: the Commonwealth of Australia", () => {
    const world = referenceWorld();
    australianFederation1901(world);
    const australian = world.provinces.ownership.filter(
      (entry) => OCEANIA_IDS.has(entry.provinceId) && entry.ownerPolityId === futureId("AUS"),
    );
    expect(australian.length).toBe(10);
    expect(world.provinces.transfers.some((record) => record.kind === "union")).toBe(true);
  });

  test("1907 snapshot: New Zealand is a dominion but its provinces do not transfer", () => {
    const world = referenceWorld();
    // The dominion status is a registry/status change; no ownership transfer is
    // required, and the province stays owned by the 1900 colony polity.
    expect(ownerOf(world, "oc-nzl-wellington")).toBe(58);
    expect(FUTURE_ID.get("NZD")).toBe(1416);
    expect(
      OCEANIA.futurePolities.find((polity) => polity.tag === "NZD")?.activeFrom,
    ).toBe("1907-09-26");
  });

  test("1914-1920 snapshot: the German colonies are occupied and mandated", () => {
    const world = referenceWorld();
    germanNewGuineaOccupation1914(world);
    germanNewGuineaMandate1920(world);
    samoaSequence(world);
    expect(ownerOf(world, "oc-gng-bougainville")).toBe(57);
    expect(ownerOf(world, "oc-gsa-german-samoa")).toBe(futureId("WSM"));
    expect(controllerOf(world, "oc-gum-guam")).toBe(0);
  });

  test("1986-1994 snapshot: the Micronesian compacts", () => {
    const world = referenceWorld();
    micronesiaSequence(world);
    expect(ownerOf(world, "oc-gpn-marshall-ralik-chain")).toBe(futureId("MHL"));
    expect(ownerOf(world, "oc-gpn-caroline-kosrae")).toBe(futureId("FSM"));
    expect(ownerOf(world, "oc-gpn-palau")).toBe(futureId("PLW"));
    expect(world.provinces.transfers.some((record) => record.kind === "independence")).toBe(true);
  });
});

describe("M12e global land-coverage audit", () => {
  test("the committed audit proves every non-Antarctic land ring belongs to a province", () => {
    expect(GLOBAL_AUDIT.landRingCount).toBe(795);
    expect(GLOBAL_AUDIT.exceptions.antarcticaRingCount).toBe(93);
    expect(GLOBAL_AUDIT.exceptions.waterHoleRingCount).toBe(1);
    expect(GLOBAL_AUDIT.totals.nonAntarcticLandRingCount).toBe(701);
    expect(GLOBAL_AUDIT.totals.assignedRingCount).toBe(701);
    expect(GLOBAL_AUDIT.totals.unassignedRingCount).toBe(0);
    expect(GLOBAL_AUDIT.totals.unassignedArea).toBe(0);
    expect(GLOBAL_AUDIT.totals.unassignedSampleCount).toBe(0);
    expect(GLOBAL_AUDIT.totals.unassignedVertexCount).toBe(0);
    expect(GLOBAL_AUDIT.totals.sampleCount).toBeGreaterThan(250_000);
    expect(GLOBAL_AUDIT.exceptions.list.length).toBe(94);
    for (const exception of GLOBAL_AUDIT.exceptions.list) {
      expect(["antarctica", "water-hole"]).toContain(exception.kind);
      expect(exception.reason.length).toBeGreaterThan(20);
      expect(rowsForRing(exception.ring)?.exception).toBe(exception.kind);
    }
    // The same exception list is recorded in the bundle audit.
    const bundled = AUDIT.documentedExceptions;
    expect(bundled.length).toBe(4);
    expect(bundled.find((entry) => entry.kind === "antarctica")?.count).toBe(93);
    expect(bundled.find((entry) => entry.kind === "water-hole")?.count).toBe(1);
    for (const entry of bundled) expect(entry.reason.length).toBeGreaterThan(30);
  });

  test("every land ring has a covering province and every map feature has a province", () => {
    expect(GLOBAL_AUDIT.rings.length).toBe(795);
    expect(GLOBAL_AUDIT.features.mapFeatureCount).toBe(133);
    expect(GLOBAL_AUDIT.features.featuresWithoutProvince).toEqual([]);
    for (const row of GLOBAL_AUDIT.rings) {
      if (row.exception !== null) continue;
      expect(row.coveringProvince).not.toBeNull();
      expect(COMBINED_KEYS.has(row.coveringProvince ?? "")).toBe(true);
      expect(row.coveredSamples + row.bandSamples).toBeGreaterThan(0);
      expect(row.unassignedSamples).toBe(0);
    }
    expect(GLOBAL_AUDIT.admin1Units.allUnitsClaimed).toBe(true);
    expect(GLOBAL_AUDIT.admin1Units.unassignedUnitTotal).toBe(0);
    expect(GLOBAL_AUDIT.admin1Units.duplicateUnitClaimTotal).toBe(0);
  });

  test("an independent land-mask check finds a province for every non-Antarctic ring", () => {
    const failures: string[] = [];
    let checked = 0;
    for (let index = 0; index < WORLD_MAP.land.length; index += 1) {
      const ring = decodeRing(WORLD_MAP.land[index] ?? []);
      if (ring.length < 4) continue;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const [x = 0, y = 0] of ring) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
      if (maxY < -60) continue;
      const row = rowsForRing(index);
      if (row?.exception === "water-hole") continue;
      checked += 1;
      // Deterministic interior samples: quarter points of the ring bbox.
      const samples: [number, number][] = [];
      for (const fx of [0.25, 0.5, 0.75]) {
        for (const fy of [0.25, 0.5, 0.75]) {
          const x = minX + (maxX - minX) * fx;
          const y = minY + (maxY - minY) * fy;
          if (ringContains(ring, x, y)) samples.push([x, y]);
        }
      }
      const covered = samples.some(([x, y]) => landProvinceAt(x, y) !== null);
      if (!covered) {
        if (row === undefined || row.coveredSamples + row.bandSamples === 0) {
          failures.push(`ring ${String(index)}`);
        }
      }
    }
    expect(failures).toEqual([]);
    expect(checked).toBe(701);
  });

  test("all five bundle audits report zero unassigned admin-1 units", () => {
    for (const file of [
      "provinces_1900_audit.json",
      "provinces_asia_1900_audit.json",
      "provinces_africa_1900_audit.json",
      "provinces_americas_1900_audit.json",
      "provinces_oceania_1900_audit.json",
    ]) {
      const audit = JSON.parse(
        readFileSync(join(ROOT, "packages/data/data/map", file), "utf8"),
      ) as { unassignedUnitCount?: number; duplicateUnitClaimCount?: number };
      expect(audit.unassignedUnitCount ?? 0).toBe(0);
      expect(audit.duplicateUnitClaimCount ?? 0).toBe(0);
    }
  });
});

function rowsForRing(ring: number) {
  return GLOBAL_AUDIT.rings.find((row) => row.ring === ring);
}

describe("M12e rendering contracts", () => {
  test("province edges become national only across current owners", () => {
    const ownerByProvinceId = new Map(
      OCEANIA.provinces.map((province) => [province.id, province.initialOwnerTag]),
    );
    const plan = planProvinceBorders(OCEANIA.borders, ownerByProvinceId);
    expect(plan.length).toBe(OCEANIA.borders.length);
    const madang = idOf("oc-gng-morobe");
    const gulf = idOf("oc-bpo-papua-gulf");
    const shared = plan.filter(
      (border) =>
        (border.a === madang && border.b === gulf) || (border.a === gulf && border.b === madang),
    );
    expect(shared.length).toBeGreaterThan(0);
    // After the 1975 independence both sides are one owner, so the edge is not
    // national; before it, German and British ownership makes it national.
    const changed = new Map(ownerByProvinceId);
    changed.set(madang, "PNG");
    changed.set(gulf, "PNG");
    const changedPlan = planProvinceBorders(OCEANIA.borders, changed);
    const changedShared = changedPlan.filter(
      (border) =>
        (border.a === madang && border.b === gulf) || (border.a === gulf && border.b === madang),
    );
    if (changedShared.length > 0) {
      expect(changedShared.every((border) => border.national === false)).toBe(true);
    }

    // The PNG / Indonesia seam border becomes national once both sides change.
    const papua = new Set(
      [...OCEANIA.provinces]
        .filter(
          (province) =>
            province.key.startsWith("oc-bpo-papua-") || province.key.startsWith("oc-gng-"),
        )
        .map((province) => province.id),
    );
    const indonesiaBorder = PROVINCE_MAP_1900.borders.filter((border) => {
      if (border.b < 0) return false;
      const leftIsPapua = papua.has(border.a);
      const rightIsPapua = papua.has(border.b);
      if (!leftIsPapua && !rightIsPapua) return false;
      const otherId = leftIsPapua ? border.b : border.a;
      const otherProvince = COMBINED.find((province) => province.id === otherId);
      return otherProvince?.key.startsWith("as-dei-") ?? false;
    });
    expect(indonesiaBorder.length).toBeGreaterThan(0);
  });

  test("province hit testing is zoom-independent and picks the containing province", () => {
    const decoded = OCEANIA.provinces.map((province) => ({
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
    expect(checked).toBeGreaterThan(OCEANIA.provinces.length * 0.7);
    expect(mismatches / checked).toBeLessThan(0.1);
  });

  test("the map uses solid province hairlines and the established country weight", () => {
    const worldMap = readFileSync(
      join(ROOT, "packages/app/src/components/WorldMap.tsx"),
      "utf8",
    );
    expect(worldMap).toContain("PROVINCE_MAP_1900");
    expect(worldMap).toContain("PROVINCE_BORDER_COLOR");
    expect(worldMap).toContain("strokeOpacity");
    expect(worldMap).toContain("strokePx(COUNTRY_BORDER_WIDTH_PX)");
    expect(worldMap).toContain("provincesChanged");
    const renderPlan = readFileSync(
      join(ROOT, "packages/app/src/components/provinceRenderPlan.ts"),
      "utf8",
    );
    expect(renderPlan).toContain("pickProvinceAtPoint");
    expect(renderPlan).toContain("planProvinceBorders");
  });
});

describe("M12e combined five-bundle catalogue", () => {
  test("the five-bundle catalogue has unique ids, keys and one border list", () => {
    const combined = loadProvinceBundle();
    expect(combined.provinces.length).toBe(PROVINCES_AFTER_P2_REPAIR);
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
    expect(PROVINCE_MAP_1900.futurePolities.length).toBe(191);
    expect(PROVINCE_MAP_1900.provinces.filter((province) => province.key.startsWith("oc-"))).toHaveLength(
      OCEANIA.provinces.length,
    );
  });

  test("the generated app bundle matches the committed JSON bundle", () => {
    const source = readFileSync(
      join(ROOT, "packages/app/src/generated/provincesOceania1900.ts"),
      "utf8",
    );
    expect(source).toContain("PROVINCES_OCEANIA_1900");
    expect(source).toContain("scripts/m12e/build-oceania-provinces.mjs");
    expect(source).toContain("oc-");
  });
});

describe("M12e persistence and determinism", () => {
  test("save/load round-trips Oceanian ownership, control, claims and history", () => {
    const world = referenceWorld(9_120_001);
    australianFederation1901(world);
    germanNewGuineaOccupation1914(world);
    papuaNewGuineaIndependence1975(world);
    samoaSequence(world);
    addProvinceClaim(world, idOf("oc-bpo-heard-and-mcdonald-islands"), 57 as Id);
    setProvinceSpecialStatus(world, idOf("oc-nzl-tokelau"), "autonomous");
    const serialized = serializeWorld(world);
    const restored = deserializeWorld(serialized);
    assertValidWorld(restored);
    expect(restored.provinces).toEqual(world.provinces);
    expect(hashWorld(restored)).toBe(hashWorld(world));
    expect(ownerOf(restored, "oc-aus-new-south-wales")).toBe(futureId("AUS"));
    expect(ownerOf(restored, "oc-gng-madang")).toBe(futureId("PNG"));
    expect(ownerOf(restored, "oc-gsa-german-samoa")).toBe(futureId("WSM"));
    expect(
      ownershipOf(restored, "oc-bpo-heard-and-mcdonald-islands")?.claimantPolityIds,
    ).toEqual([57]);
  });

  test("M12a-era, M12b-era, M12c-era and M12d-era saves still load", () => {
    const cases: readonly [number, number][] = [
      [66001, EUROPE.provinces.length],
      [100239, EUROPE.provinces.length + ASIA.provinces.length],
      [
        200260,
        EUROPE.provinces.length + ASIA.provinces.length + AFRICA.provinces.length,
      ],
      [
        300469,
        EUROPE.provinces.length +
          ASIA.provinces.length +
          AFRICA.provinces.length +
          AMERICAS.provinces.length,
      ],
    ];
    for (const [maxId, expectedCount] of cases) {
      const world = referenceWorld();
      world.provinces.ownership = world.provinces.ownership.filter(
        (entry) => entry.provinceId <= maxId,
      );
      const restored = deserializeWorld(serializeWorld(world));
      assertValidWorld(restored);
      expect(restored.provinces.ownership.length).toBe(expectedCount);
      expect(restored.provinces.ownership.some((entry) => entry.provinceId >= 400001)).toBe(false);
    }
  });

  test("snapshots carry every Oceanian province ownership record", () => {
    const world = referenceWorld();
    australianFederation1901(world);
    const snapshot = snapshotFor(world);
    expect(provinceOwnershipRows(snapshot).length).toBe(PROVINCES_AFTER_P2_REPAIR);
    const byId = new Map(provinceOwnershipRows(snapshot).map((entry) => [entry.provinceId, entry]));
    expect(byId.get(idOf("oc-aus-new-south-wales"))?.ownerPolityId).toBe(futureId("AUS"));
    expect(byId.get(idOf("oc-gng-madang"))?.ownerPolityId).toBe(2);
    expect(byId.get(idOf("oc-bpo-papua-central"))?.ownerPolityId).toBe(1);
  });

  test("identical sequences produce the identical world hash", () => {
    const left = referenceWorld(4_321);
    const right = referenceWorld(4_321);
    for (const world of [left, right]) {
      australianFederation1901(world);
      germanNewGuineaOccupation1914(world);
      germanNewGuineaMandate1920(world);
      papuaNewGuineaIndependence1975(world);
      samoaSequence(world);
      micronesiaSequence(world);
      independenceWave(world);
    }
    expect(hashWorld(left)).toBe(hashWorld(right));
  });

  test("different transfer orders produce a different history", () => {
    const left = referenceWorld(654_321);
    const right = referenceWorld(654_321);
    transfer(
      left,
      idsFor("oc-gpn-nauru"),
      futureId("NRU"),
      "independence",
      "Nauru first",
      day(1968, 1, 31),
    );
    transfer(
      left,
      idsFor("oc-fji-"),
      futureId("FJI"),
      "independence",
      "Fiji second",
      day(1970, 10, 10),
    );
    transfer(
      right,
      idsFor("oc-fji-"),
      futureId("FJI"),
      "independence",
      "Fiji first",
      day(1970, 10, 10),
    );
    transfer(
      right,
      idsFor("oc-gpn-nauru"),
      futureId("NRU"),
      "independence",
      "Nauru second",
      day(1968, 1, 31),
    );
    expect(ownerOf(left, "oc-gpn-nauru")).toBe(futureId("NRU"));
    expect(ownerOf(left, "oc-fji-central-division")).toBe(futureId("FJI"));
    expect(hashWorld(left)).not.toBe(hashWorld(right));
  });

  test("the scenario still builds after the combined bundle is attached", () => {
    const scenario: EconomyScenarioDef = loadM11World();
    const world = createEconomyWorld(scenario, { seed: 1 });
    assertValidWorld(world);
    expect(world.provinces.ownership.length).toBe(scenario.provinces?.definitions.length);
    expect(world.provinces.ownership.length).toBe(PROVINCES_AFTER_P2_REPAIR);
  });
});
