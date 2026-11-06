/**
 * M12d American provincial system.
 *
 * The suite validates the committed American province inventory and geometry, the
 * combined Europe+Asia+Africa+Americas catalogue, and the authoritative
 * simulation through the twentieth-century sequences the milestone requires: the
 * 1902 independence of Cuba, the 1903 separation of Panama and the Acre transfer,
 * the 1917 Danish West Indies transfer, the 1929 return of Tacna, the 1949
 * Newfoundland union, the 1958-1962 West Indies Federation episode (not modelled
 * as a sovereign owner; see D-106), the 1962-1983 independence wave, the 1975
 * Suriname independence and the 1954/1986 Dutch Caribbean status changes.
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
const AMERICAS = JSON.parse(
  readFileSync(join(ROOT, "packages/data/data/map/provinces_americas_1900.json"), "utf8"),
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
const OCEANIA = JSON.parse(
  readFileSync(join(ROOT, "packages/data/data/map/provinces_oceania_1900.json"), "utf8"),
) as ProvinceMapData;
const AUDIT = JSON.parse(
  readFileSync(join(ROOT, "packages/data/data/map/provinces_americas_1900_audit.json"), "utf8"),
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
  borderSegmentCount: number;
};

const SCENARIO = loadM11World();
const DEFINITIONS = new Map(
  (SCENARIO.provinces?.definitions ?? []).map((definition) => [
    definition.provinceId,
    definition,
  ]),
);
const BY_KEY = new Map(AMERICAS.provinces.map((province) => [province.key, province]));
const AMERICAS_IDS = new Set(AMERICAS.provinces.map((province) => province.id));
const FUTURE_ID = new Map(
  AMERICAS.futurePolities.map((polity) => [polity.tag, polity.polityId]),
);
const REGION_IDS = new Set(SCENARIO.population.provinceEconomies.map((province) => province.id));

/** Province key prefix -> the modern successor state the province becomes. */
const SUCCESSOR_RULES: readonly (readonly [string, string])[] = [
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

function successorOf(key: string): string {
  for (const [prefix, tag] of SUCCESSOR_RULES) {
    if (key.startsWith(prefix)) return tag;
  }
  return "(unmapped)";
}

/**
 * Every modern American sovereign land border that the derived national border
 * must be able to draw. The non-sovereign Saint-Martin/Sint Maarten line is
 * deliberately outside this list; see D-106 and the audit script.
 */
const MODERN_LAND_BORDERS: readonly (readonly [string, string])[] = [
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

function day(year: number, month: number, date: number): number {
  return civilDateToDayIndex(year, month as 1, date);
}

function idOf(key: string): Id {
  const province = BY_KEY.get(key);
  if (province === undefined) throw new Error(`unknown Americas province ${key}`);
  return province.id;
}

function idsOf(...keys: readonly string[]): Id[] {
  return keys.map(idOf);
}

function idsFor(prefix: string): Id[] {
  return AMERICAS.provinces
    .filter((province) => province.key.startsWith(prefix))
    .map((province) => province.id);
}

function futureId(tag: string): Id {
  const id = FUTURE_ID.get(tag);
  if (id === undefined) throw new Error(`unknown Americas future polity ${tag}`);
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

function referenceWorld(seed = 91_000): World {
  // P2: the reference sequences run on the political geography alone (D-118).
  return politicalGeographyWorld(SCENARIO, seed);
}

/** 1915-1934: the United States occupies Haiti without changing ownership. */
function occupyHaiti1915(world: World): void {
  setProvinceControl(world, {
    provinceIds: idsFor("am-hti-"),
    controllerPolityId: 0 as Id,
    day: day(1915, 7, 28),
    note: "United States occupation of Haiti",
    kind: "occupation",
  });
}

/** 1934: the Haitian occupation ends and owner control is restored. */
function endHaitianOccupation1934(world: World): void {
  setProvinceControl(world, {
    provinceIds: idsFor("am-hti-"),
    controllerPolityId: null,
    day: day(1934, 8, 15),
    note: "End of the United States occupation of Haiti",
    kind: "liberation",
  });
}

/** 1902: the Republic of Cuba takes over from the United States occupation. */
function cubanIndependence1902(world: World): void {
  // D-129: Cuba already owns its provinces in 1900; independence ends United States control.
  setProvinceControl(world, {
    provinceIds: idsFor("am-cub-"),
    controllerPolityId: null,
    day: day(1902, 5, 20),
    note: "Cuban independence ends the United States military government",
    kind: "liberation",
  });
}

/** 1903: Panama separates from Colombia. */
function panamanianIndependence1903(world: World): void {
  transfer(
    world,
    idsFor("am-pan-"),
    futureId("PAN"),
    "independence",
    "Separation of Panama from Colombia",
    day(1903, 11, 3),
  );
}

/** 1903: the Treaty of PetrÃ³polis cedes Acre to Brazil. */
function acreTransfer1903(world: World): void {
  transfer(
    world,
    idsOf("am-bol-acre"),
    53 as Id,
    "cession",
    "Treaty of PetrÃ³polis cedes Acre to Brazil",
    day(1903, 11, 17),
  );
}

/** 1917: the Danish West Indies become the United States Virgin Islands. */
function danishWestIndies1917(world: World): void {
  transfer(
    world,
    idsFor("am-dwi-"),
    0 as Id,
    "cession",
    "Transfer of the Danish West Indies to the United States",
    day(1917, 3, 31),
  );
}

/** 1929: Tacna returns to Peru after the Chilean occupation. */
function tacnaReturn1929(world: World): void {
  transfer(
    world,
    idsOf("am-chl-tacna"),
    47 as Id,
    "transfer",
    "Treaty of Lima returns Tacna to Peru",
    day(1929, 6, 3),
  );
}

/** 1949: Newfoundland and Labrador join Canada. */
function newfoundlandUnion1949(world: World): void {
  transfer(
    world,
    idsFor("am-nfd-"),
    56 as Id,
    "union",
    "Newfoundland joins Canada",
    day(1949, 3, 31),
  );
}

/** 1954 and 1986: the Dutch Caribbean constituent countries. */
function dutchCaribbeanStatus(world: World): void {
  transfer(
    world,
    idsFor("am-dgc-"),
    futureId("ANT"),
    "transfer",
    "Netherlands Antilles becomes a constituent country",
    day(1954, 12, 15),
  );
  transfer(
    world,
    idsOf("am-dgc-aruba"),
    futureId("ARU"),
    "transfer",
    "Aruba becomes a separate constituent country",
    day(1986, 1, 1),
  );
}

/** 1962-1983: the British Caribbean independence wave plus Suriname 1975. */
function caribbeanIndependenceWave(world: World): void {
  const steps: readonly [string, string, number, number, number][] = [
    ["JAM", "am-bwi-jam-", 1962, 8, 6],
    ["TTO", "am-bwi-tto-", 1962, 8, 31],
    ["BRB", "am-bwi-brb-", 1966, 11, 30],
    ["GUY", "am-bwi-guy-", 1966, 5, 26],
    ["BHS", "am-bwi-bhs-", 1973, 7, 10],
    ["GRD", "am-bwi-grd-", 1974, 2, 7],
    ["SUR", "am-sur-", 1975, 11, 25],
    ["DMA", "am-bwi-dma-", 1978, 11, 3],
    ["LCA", "am-bwi-lca-", 1979, 2, 22],
    ["VCT", "am-bwi-vct-", 1979, 10, 27],
    ["ATG", "am-bwi-atg-", 1981, 11, 1],
    ["BLZ", "am-bwi-blz-", 1981, 9, 21],
    ["KNA", "am-bwi-kna-", 1983, 9, 19],
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
}

/** 1904-1979: the Panama Canal Zone as a United States-controlled special area. */
function panamaCanalOccupation1904(world: World): void {
  setProvinceControl(world, {
    provinceIds: idsOf("am-pan-panama"),
    controllerPolityId: 0 as Id,
    day: day(1904, 2, 26),
    note: "United States control of the Panama Canal Zone",
    kind: "occupation",
  });
  setProvinceSpecialStatus(world, idOf("am-pan-panama"), "autonomous");
}

/** 1979: the Canal Zone reverts to Panamanian control. */
function panamaCanalRevert1979(world: World): void {
  setProvinceControl(world, {
    provinceIds: idsOf("am-pan-panama"),
    controllerPolityId: null,
    day: day(1979, 10, 1),
    note: "Canal Zone reverted to Panama",
    kind: "liberation",
  });
  setProvinceSpecialStatus(world, idOf("am-pan-panama"), "ordinary");
}

describe("M12d Americas province inventory and geometry", () => {
  test("the committed bundle covers the Americas with stable unique ids", () => {
    expect(AMERICAS.provinces.length).toBeGreaterThan(400);
    expect(new Set(AMERICAS.provinces.map((province) => province.id)).size).toBe(
      AMERICAS.provinces.length,
    );
    expect(new Set(AMERICAS.provinces.map((province) => province.key)).size).toBe(
      AMERICAS.provinces.length,
    );
    expect(AUDIT.provinceCount).toBe(AMERICAS.provinces.length);
    expect(AUDIT.duplicateProvinceIds).toBe(0);
    expect(AUDIT.duplicateKeys).toBe(0);
    expect(AUDIT.duplicateUnitClaimCount).toBe(0);
    expect(AUDIT.unassignedUnitCount).toBe(0);
    for (const province of AMERICAS.provinces) {
      expect(province.id).toBeGreaterThan(300000);
      expect(province.key.startsWith("am-")).toBe(true);
    }
  });

  test("Americas ids, keys and future polities are disjoint from the earlier bundles", () => {
    const priorIds = new Set(
      [...EUROPE.provinces, ...ASIA.provinces, ...AFRICA.provinces].map(
        (province) => province.id,
      ),
    );
    const priorKeys = new Set(
      [...EUROPE.provinces, ...ASIA.provinces, ...AFRICA.provinces].map(
        (province) => province.key,
      ),
    );
    for (const province of AMERICAS.provinces) {
      expect(priorIds.has(province.id)).toBe(false);
      expect(priorKeys.has(province.key)).toBe(false);
    }
    const priorFuture = new Set(
      [
        ...EUROPE.futurePolities,
        ...ASIA.futurePolities,
        ...AFRICA.futurePolities,
      ].map((polity) => polity.polityId),
    );
    for (const polity of AMERICAS.futurePolities) {
      expect(polity.polityId).toBeGreaterThanOrEqual(1300);
      expect(polity.polityId).toBeLessThanOrEqual(1399);
      expect(priorFuture.has(polity.polityId)).toBe(false);
    }
  });

  test("the required American 1900 owners and map features are represented", () => {
    const owners = new Set(AMERICAS.provinces.map((province) => province.initialOwnerTag));
    for (const tag of [
      "USA", "GBR", "FRA", "NLD", "DNK", "MEX", "GUA", "HON", "SAL", "NIC",
      "COS", "COL", "VEN", "ECU", "PRU", "BOL", "CHL", "ARG", "URY", "PRY",
      "BRA", "HTI", "DOM", "CAN",
    ]) {
      expect(owners.has(tag)).toBe(true);
    }
    // D-132: Newfoundland is a British colony in 1900, not a separate owner.
    expect(owners.has("NFD")).toBe(false);
    const mapTags = new Set(AMERICAS.provinces.map((province) => province.mapTag));
    for (const tag of [
      "USA", "CAN", "NFD", "MEX", "GUA", "HON", "SAL", "NIC", "COS", "COL",
      "VEN", "ECU", "PRU", "BOL", "CHL", "ARG", "URY", "PRY", "BRA", "HTI",
      "DOM", "CUB", "PRI", "BWI", "BSA", "FCA", "DGC", "DWI", "SUR", "GRL",
      "FRA",
    ]) {
      expect(mapTags.has(tag)).toBe(true);
    }
    for (const province of AMERICAS.provinces) {
      // P2 (D-118): every province is an economic unit of its own; the region link is gone.
      expect(REGION_IDS.has(province.id)).toBe(true);
      expect("simulationRegionId" in province).toBe(false);
    }
  });

  test("every province has a 1900 owner, administrative metadata and provenance", () => {
    for (const province of AMERICAS.provinces) {
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
    for (const province of AMERICAS.provinces) {
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
    expect(ringCount).toBeGreaterThan(AMERICAS.provinces.length);
  });

  test("province borders are deduplicated open polylines", () => {
    let lineCount = 0;
    for (const border of AMERICAS.borders) {
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
    expect(lineCount).toBeGreaterThan(800);
  });

  test("American province edges become national only across current owners", () => {
    const ownerByProvinceId = new Map(
      AMERICAS.provinces.map((province) => [province.id, province.initialOwnerTag]),
    );
    const plan = planProvinceBorders(AMERICAS.borders, ownerByProvinceId);
    expect(plan.length).toBe(AMERICAS.borders.length);
    const panama = idOf("am-pan-panama");
    const darien = idOf("am-pan-darien-and-the-comarcas");
    const shared = plan.filter(
      (border) =>
        (border.a === panama && border.b === darien) ||
        (border.a === darien && border.b === panama),
    );
    expect(shared.length).toBeGreaterThan(0);
    expect(shared.every((border) => border.national === false)).toBe(true);
    const changed = new Map(ownerByProvinceId);
    changed.set(panama, "PAN");
    const changedPlan = planProvinceBorders(AMERICAS.borders, changed);
    const changedShared = changedPlan.filter(
      (border) =>
        (border.a === panama && border.b === darien) ||
        (border.a === darien && border.b === panama),
    );
    expect(changedShared.every((border) => border.national === true)).toBe(true);

    // A cross-feature frontier (Panama/Colombia) is a seam border, so it also
    // becomes national after the 1903 separation.
    const colombia = idOf("am-col-choco");
    const crossFeature = plan.filter(
      (border) =>
        (border.a === darien && border.b === colombia) ||
        (border.a === colombia && border.b === darien),
    );
    expect(crossFeature.length).toBeGreaterThan(0);
    expect(crossFeature.every((border) => border.national === false)).toBe(true);
    const crossChanged = planProvinceBorders(
      AMERICAS.borders,
      new Map(ownerByProvinceId).set(darien, "PAN"),
    ).filter(
      (border) =>
        (border.a === darien && border.b === colombia) ||
        (border.a === colombia && border.b === darien),
    );
    expect(crossChanged.every((border) => border.national === true)).toBe(true);
  });

  test("province hit testing is zoom-independent and picks the containing province", () => {
    const decoded = AMERICAS.provinces.map((province) => ({
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
    expect(checked).toBeGreaterThan(AMERICAS.provinces.length * 0.85);
    expect(mismatches / checked).toBeLessThan(0.05);
  });

  test("the coverage audit records a complete American partition", () => {
    expect(AUDIT.coverage.length).toBeGreaterThan(25);
    let totalResidual = 0;
    for (const entry of AUDIT.coverage) {
      if (entry.estimated) continue;
      // Simplification leaves small coastal and frontier slivers; the underlay
      // keeps the correct 1900 owner colour so they never become foreign enclaves.
      expect(entry.residualArea).toBeLessThan(3.5);
      totalResidual += entry.residualArea;
    }
    expect(totalResidual).toBeLessThan(10);
    expect(AUDIT.overlapCount).toBeLessThan(80);
    expect(AUDIT.unmatchedBorderSegments).toBeLessThan(50);
    expect(AUDIT.crossFeatureSeamBorderCount).toBeGreaterThan(0);
    expect(AUDIT.borderSegmentCount).toBeGreaterThan(100000);
  });

  test("successor-border split provinces share continuous edges", () => {
    const pairs: [string, string][] = [
      ["am-pan-panama", "am-pan-darien-and-the-comarcas"],
      ["am-pan-darien-and-the-comarcas", "am-col-choco"],
      ["am-pan-chiriqui-and-bocas-del-toro", "am-cos-puntarenas"],
      ["am-nfd-newfoundland-and-labrador", "am-can-quebec"],
      ["am-bol-acre", "am-bra-amazonas"],
      ["am-chl-tacna", "am-pru-puno"],
    ];
    for (const [leftKey, rightKey] of pairs) {
      const left = idOf(leftKey);
      const right = idOf(rightKey);
      const shared = AMERICAS.borders.filter(
        (border) =>
          (border.a === left && border.b === right) ||
          (border.a === right && border.b === left),
      );
      expect(shared.length).toBeGreaterThan(0);
      expect(shared.reduce((sum, border) => sum + border.lines.length, 0)).toBeGreaterThan(0);
    }
  });

  test("every modern American land border has a province edge", () => {
    const successorById = new Map(
      AMERICAS.provinces.map((province) => [province.id, successorOf(province.key)]),
    );
    const pairs = new Set<string>();
    for (const border of AMERICAS.borders) {
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
    // Non-sovereign land border: Saint-Martin (FRA) / Sint Maarten (NLD). It is
    // outside the sovereign audit because the M11c land mask does not resolve the
    // island; both halves are separate provinces, so the status is still
    // representable. See D-106.
    expect(pairs.has("FRA|NLD")).toBe(false);
  });

  test("every twentieth-century American sovereign state is registered", () => {
    const catalogTags = new Set((SCENARIO.countries ?? []).map((country) => country.tag));
    const catalog1900 = [
      "USA", "CAN", "MEX", "GUA", "HON", "SAL", "NIC", "COS", "COL", "VEN",
      "ECU", "PRU", "BOL", "CHL", "ARG", "URY", "PRY", "BRA", "HTI", "DOM",
      "CUB",
    ];
    for (const tag of catalog1900) expect(catalogTags.has(tag)).toBe(true);
    const successors = [
      "NFD", "PAN", "JAM", "TTO", "BRB", "GUY", "BHS", "GRD", "SUR", "DMA",
      "LCA", "VCT", "ATG", "BLZ", "KNA", "ANT", "ARU",
    ];
    for (const tag of successors) expect(FUTURE_ID.has(tag)).toBe(true);
    const terminal = civilDateToDayIndex(2000, 1, 1);
    for (const polity of AMERICAS.futurePolities) {
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

  test("the required historical subdivisions exist", () => {
    for (const key of [
      "am-usa-alaska",
      "am-usa-hawaii",
      "am-usa-oklahoma-territory-and-indian-territory",
      "am-usa-arizona-territory",
      "am-usa-new-mexico-territory",
      "am-can-ontario",
      "am-can-quebec",
      "am-can-northwest-territories",
      "am-can-alberta-district",
      "am-can-saskatchewan-district",
      "am-nfd-newfoundland-and-labrador",
      "am-mex-baja-california",
      "am-mex-yucatan",
      "am-mex-distrito-federal",
      "am-gua-peten",
      "am-hon-islas-de-la-bahia",
      "am-bwi-blz-belize",
      "am-pan-panama",
      "am-col-amazonas",
      "am-ven-nueva-esparta",
      "am-ecu-galapagos",
      "am-bol-acre",
      "am-chl-magallanes",
      "am-chl-tacna",
      "am-arg-tierra-del-fuego",
      "am-bra-amazonas",
      "am-bra-goias",
      "am-bwi-guy-essequibo",
      "am-sur-paramaribo-and-the-coast",
      "am-fra-french-guiana",
      "am-cub-oriente",
      "am-cub-isle-of-pines",
      "am-bwi-jam-surrey",
      "am-bwi-tto-trinidad",
      "am-bwi-tto-tobago",
      "am-bwi-brb-barbados",
      "am-bwi-bhs-new-providence",
      "am-bwi-bmu-bermuda",
      "am-bwi-tca-turks-and-caicos",
      "am-bwi-cym-cayman-islands",
      "am-bwi-vgb-british-virgin-islands",
      "am-bwi-aia-anguilla",
      "am-bwi-atg-antigua",
      "am-bwi-atg-barbuda",
      "am-bwi-kna-saint-kitts",
      "am-bwi-kna-nevis",
      "am-bwi-msr-montserrat",
      "am-bwi-dma-dominica",
      "am-bwi-lca-saint-lucia",
      "am-bwi-vct-saint-vincent",
      "am-bwi-vct-grenadines",
      "am-bwi-grd-grenada",
      "am-bsa-falkland-islands",
      "am-bsa-south-georgia",
      "am-fca-saint-martin",
      "am-fca-saint-barthelemy",
      "am-fca-saint-pierre",
      "am-fca-miquelon",
      "am-fca-guadeloupe-basse-terre",
      "am-fca-guadeloupe-grande-terre",
      "am-fca-marie-galante",
      "am-fca-martinique",
      "am-dgc-aruba",
      "am-dgc-curacao",
      "am-dgc-sint-maarten",
      "am-dwi-saint-croix",
      "am-dwi-saint-thomas",
      "am-dwi-saint-john",
      "am-grl-north-greenland",
      "am-grl-south-greenland",
      "am-pri-puerto-rico",
    ]) {
      expect(BY_KEY.has(key)).toBe(true);
    }
  });

  test("the combined five-bundle catalogue has unique ids and one border list", () => {
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

describe("M12d authoritative provincial ownership", () => {
  test("the 1900 world starts with one ownership record per combined province", () => {
    const world = referenceWorld(31_900_001);
    assertValidWorld(world);
    expect(world.provinces.enabled).toBe(true);
    expect(world.provinces.ownership.length).toBe(DEFINITIONS.size);
    expect(world.provinces.ownership.length).toBe(
      EUROPE.provinces.length +
        ASIA.provinces.length +
        AFRICA.provinces.length +
        AMERICAS.provinces.length +
        OCEANIA.provinces.length,
    );
    // D-129: Cuba is owned by Cuba and controlled by the United States on 1 January 1900.
    const cuba = ownershipOf(world, "am-cub-oriente");
    expect(cuba?.ownerPolityId).toBe(59);
    expect(cuba?.controllerPolityId).toBe(0);
    for (const key of ["am-usa-alaska", "am-nfd-newfoundland-and-labrador"]) {
      const entry = ownershipOf(world, key);
      expect(entry).toBeDefined();
      expect(entry?.ownerPolityId).toBe(entry?.controllerPolityId);
      expect(entry?.claimantPolityIds).toEqual([]);
      expect(entry?.controlledSinceDay).toBeNull();
    }
  });

  test("historical and breakaway polities are registered but own nothing in 1900", () => {
    const expected: Record<string, number> = {
      TEX: 1317,
      RGR: 1318,
      JUL: 1319,
      RRG: 1320,
      YUC: 1321,
      CAL: 1322,
      DES: 1323,
      CSA: 1324,
      HAW: 1325,
      ACR: 1326,
      AIA: 1327,
      WIF: 1328,
      CNU: 1329,
      WFL: 1330,
      FLR: 1331,
      INS: 1332,
      MDW: 1333,
      RCN: 1334,
      RLC: 1335,
      SON: 1336,
      LBC: 1337,
      EQT: 1338,
      BAH: 1339,
      PEM: 1340,
      GCO: 1341,
      UPR: 1342,
      ACF: 1343,
      SBA: 1344,
      PBC: 1345,
      ERY: 1346,
    };
    const historical = AMERICAS.futurePolities.filter(
      (polity) => polity.kind === "historical",
    );
    expect(historical.length).toBe(30);
    for (const polity of historical) {
      expect(expected[polity.tag]).toBe(polity.polityId);
      expect(polity.kind).toBe("historical");
      expect(polity.selectable1900).toBe(false);
    }
    const world = referenceWorld();
    for (const polity of historical) {
      expect(
        world.provinces.ownership.some((entry) => entry.ownerPolityId === polity.polityId),
      ).toBe(false);
    }
    for (const tag of ["TEX", "RGR", "CAL", "YUC", "CSA", "ACR", "AIA", "WIF"]) {
      expect(FUTURE_ID.has(tag)).toBe(true);
    }
  });

  test("a historical breakaway polity can receive a province by ordinary transfer", () => {
    const world = referenceWorld();
    transfer(
      world,
      idsOf("am-usa-texas"),
      futureId("TEX"),
      "independence",
      "Alternate-history Texas",
      day(1900, 1, 2),
    );
    transfer(
      world,
      idsOf("am-usa-california"),
      futureId("CAL"),
      "independence",
      "Alternate-history California",
      day(1900, 1, 2),
    );
    transfer(
      world,
      idsOf("am-bra-rio-grande-do-sul"),
      futureId("RGR"),
      "independence",
      "Alternate-history Riograndense Republic",
      day(1900, 1, 2),
    );
    transfer(
      world,
      idsOf("am-mex-yucatan"),
      futureId("YUC"),
      "independence",
      "Alternate-history Yucatán",
      day(1900, 1, 2),
    );
    expect(ownerOf(world, "am-usa-texas")).toBe(futureId("TEX"));
    expect(ownerOf(world, "am-usa-california")).toBe(futureId("CAL"));
    expect(ownerOf(world, "am-bra-rio-grande-do-sul")).toBe(futureId("RGR"));
    expect(ownerOf(world, "am-mex-yucatan")).toBe(futureId("YUC"));
    assertValidWorld(world);
  });

  test("the 1900 baseline keeps every future polity out", () => {
    const world = referenceWorld();
    const futureIds = new Set(AMERICAS.futurePolities.map((polity) => polity.polityId));
    for (const entry of world.provinces.ownership) {
      if (!AMERICAS_IDS.has(entry.provinceId)) continue;
      expect(futureIds.has(entry.ownerPolityId)).toBe(false);
    }
    // D-132: Newfoundland is owned by the United Kingdom, its 1900 sovereign.
    expect(ownerOf(world, "am-nfd-newfoundland-and-labrador")).toBe(1);
  });

  test("1902-1917 transitions are ordinary ownership changes", () => {
    const world = referenceWorld();
    cubanIndependence1902(world);
    panamanianIndependence1903(world);
    acreTransfer1903(world);
    danishWestIndies1917(world);
    expect(ownerOf(world, "am-cub-oriente")).toBe(59);
    expect(ownerOf(world, "am-pan-panama")).toBe(futureId("PAN"));
    expect(ownerOf(world, "am-bol-acre")).toBe(53);
    expect(ownerOf(world, "am-dwi-saint-croix")).toBe(0);
    expect(ownerOf(world, "am-dwi-saint-thomas")).toBe(0);
    expect(ownerOf(world, "am-dwi-saint-john")).toBe(0);
    expect(controllerOf(world, "am-cub-oriente")).toBe(59);
    assertValidWorld(world);
    // Geometry and ids never change.
    expect(BY_KEY.get("am-cub-oriente")?.id).toBe(idOf("am-cub-oriente"));
  });

  test("1929-1949 transitions return Tacna and unite Newfoundland with Canada", () => {
    const world = referenceWorld();
    tacnaReturn1929(world);
    newfoundlandUnion1949(world);
    expect(ownerOf(world, "am-chl-tacna")).toBe(47);
    expect(ownerOf(world, "am-nfd-newfoundland-and-labrador")).toBe(56);
    assertValidWorld(world);
  });

  test("the 1962-1983 independence wave and 1975 Suriname are ordinary transfers", () => {
    const world = referenceWorld();
    caribbeanIndependenceWave(world);
    for (const [tag, key] of [
      ["JAM", "am-bwi-jam-surrey"],
      ["TTO", "am-bwi-tto-trinidad"],
      ["BRB", "am-bwi-brb-barbados"],
      ["GUY", "am-bwi-guy-essequibo"],
      ["BHS", "am-bwi-bhs-new-providence"],
      ["GRD", "am-bwi-grd-grenada"],
      ["SUR", "am-sur-paramaribo-and-the-coast"],
      ["DMA", "am-bwi-dma-dominica"],
      ["LCA", "am-bwi-lca-saint-lucia"],
      ["VCT", "am-bwi-vct-saint-vincent"],
      ["ATG", "am-bwi-atg-antigua"],
      ["BLZ", "am-bwi-blz-belize"],
      ["KNA", "am-bwi-kna-saint-kitts"],
    ] as const) {
      expect(ownerOf(world, key)).toBe(futureId(tag));
    }
    // Colonies that did not become part of those states remain British.
    expect(ownerOf(world, "am-bwi-aia-anguilla")).toBe(1);
    expect(ownerOf(world, "am-bwi-msr-montserrat")).toBe(1);
    expect(ownerOf(world, "am-bwi-bmu-bermuda")).toBe(1);
    expect(ownerOf(world, "am-bwi-tca-turks-and-caicos")).toBe(1);
    expect(ownerOf(world, "am-bwi-cym-cayman-islands")).toBe(1);
    expect(ownerOf(world, "am-bwi-vgb-british-virgin-islands")).toBe(1);
    assertValidWorld(world);
  });

  test("the Dutch Caribbean status changes are ordinary transfers", () => {
    const world = referenceWorld();
    dutchCaribbeanStatus(world);
    expect(ownerOf(world, "am-dgc-curacao")).toBe(futureId("ANT"));
    expect(ownerOf(world, "am-dgc-sint-maarten")).toBe(futureId("ANT"));
    expect(ownerOf(world, "am-dgc-aruba")).toBe(futureId("ARU"));
    assertValidWorld(world);
  });

  test("occupation, claims and special status stay separate from ownership", () => {
    const world = referenceWorld();
    panamaCanalOccupation1904(world);
    expect(ownerOf(world, "am-pan-panama")).toBe(44);
    expect(controllerOf(world, "am-pan-panama")).toBe(0);
    expect(ownershipOf(world, "am-pan-panama")?.specialStatus).toBe("autonomous");
    panamaCanalRevert1979(world);
    expect(ownerOf(world, "am-pan-panama")).toBe(44);
    expect(controllerOf(world, "am-pan-panama")).toBe(44);
    expect(ownershipOf(world, "am-pan-panama")?.specialStatus).toBe("ordinary");
    addProvinceClaim(world, idOf("am-bsa-falkland-islands"), 50 as Id);
    expect(ownershipOf(world, "am-bsa-falkland-islands")?.claimantPolityIds).toEqual([50]);
    expect(ownerOf(world, "am-bsa-falkland-islands")).toBe(1);
    setProvinceSpecialStatus(world, idOf("am-pri-puerto-rico"), "occupied");
    expect(ownershipOf(world, "am-pri-puerto-rico")?.specialStatus).toBe("occupied");
    assertValidWorld(world);
  });
});

describe("M12d historical reference snapshots", () => {
  test("1900 snapshot: the United States, Canada and the European colonies", () => {
    const world = referenceWorld();
    expect(ownerOf(world, "am-usa-alaska")).toBe(0);
    expect(ownerOf(world, "am-usa-hawaii")).toBe(0);
    expect(ownerOf(world, "am-pri-puerto-rico")).toBe(0);
    // D-129: Cuba is owned by the 1900 Cuba country and controlled by the United States
    // military government (1899-1902), not owned by the United States.
    expect(ownerOf(world, "am-cub-oriente")).toBe(59);
    expect(controllerOf(world, "am-cub-oriente")).toBe(0);
    expect(ownerOf(world, "am-can-ontario")).toBe(56);
    expect(ownerOf(world, "am-nfd-newfoundland-and-labrador")).toBe(1); // D-132
    expect(ownerOf(world, "am-bwi-guy-essequibo")).toBe(1);
    expect(ownerOf(world, "am-sur-paramaribo-and-the-coast")).toBe(9);
    expect(ownerOf(world, "am-dwi-saint-thomas")).toBe(14);
    expect(ownerOf(world, "am-dgc-curacao")).toBe(9);
    expect(ownerOf(world, "am-fra-french-guiana")).toBe(3);
    expect(ownerOf(world, "am-bsa-falkland-islands")).toBe(1);
    expect(ownerOf(world, "am-grl-south-greenland")).toBe(14);
    expect(ownerOf(world, "am-bol-acre")).toBe(48);
    expect(ownerOf(world, "am-chl-tacna")).toBe(49);
  });

  test("1917 snapshot: the United States Virgin Islands", () => {
    const world = referenceWorld();
    danishWestIndies1917(world);
    expect(ownerOf(world, "am-dwi-saint-croix")).toBe(0);
    expect(ownerOf(world, "am-dwi-saint-thomas")).toBe(0);
    expect(ownerOf(world, "am-dwi-saint-john")).toBe(0);
    expect(world.provinces.transfers.some((record) => record.kind === "cession")).toBe(true);
  });

  test("1915–1936 snapshot: the United States occupation of Haiti changes control only", () => {
    const world = referenceWorld();
    occupyHaiti1915(world);
    expect(ownerOf(world, "am-hti-ouest")).toBe(54);
    expect(controllerOf(world, "am-hti-ouest")).toBe(0);
    expect(ownershipOf(world, "am-hti-ouest")?.controlledSinceDay).toBe(day(1915, 7, 28));
    endHaitianOccupation1934(world);
    expect(ownerOf(world, "am-hti-ouest")).toBe(54);
    expect(controllerOf(world, "am-hti-ouest")).toBe(54);
    assertValidWorld(world);
  });

  test("1949 snapshot: Newfoundland is part of Canada", () => {
    const world = referenceWorld();
    newfoundlandUnion1949(world);
    expect(ownerOf(world, "am-nfd-newfoundland-and-labrador")).toBe(56);
    expect(world.provinces.transfers.some((record) => record.kind === "union")).toBe(true);
  });

  test("1962-1983 snapshot: the independent Caribbean", () => {
    const world = referenceWorld();
    caribbeanIndependenceWave(world);
    expect(ownerOf(world, "am-bwi-jam-middlesex")).toBe(futureId("JAM"));
    expect(ownerOf(world, "am-bwi-tto-tobago")).toBe(futureId("TTO"));
    expect(ownerOf(world, "am-bwi-brb-barbados")).toBe(futureId("BRB"));
    expect(ownerOf(world, "am-bwi-guy-berbice")).toBe(futureId("GUY"));
    expect(ownerOf(world, "am-bwi-bhs-grand-bahama")).toBe(futureId("BHS"));
    expect(ownerOf(world, "am-bwi-grd-grenada")).toBe(futureId("GRD"));
    expect(ownerOf(world, "am-sur-suriname-interior")).toBe(futureId("SUR"));
    expect(ownerOf(world, "am-bwi-dma-dominica")).toBe(futureId("DMA"));
    expect(ownerOf(world, "am-bwi-lca-saint-lucia")).toBe(futureId("LCA"));
    expect(ownerOf(world, "am-bwi-vct-grenadines")).toBe(futureId("VCT"));
    expect(ownerOf(world, "am-bwi-atg-barbuda")).toBe(futureId("ATG"));
    expect(ownerOf(world, "am-bwi-blz-cayo")).toBe(futureId("BLZ"));
    expect(ownerOf(world, "am-bwi-kna-nevis")).toBe(futureId("KNA"));
    assertValidWorld(world);
  });
});

describe("M12d persistence and determinism", () => {
  test("save/load round-trips American ownership, control, claims and history", () => {
    const world = referenceWorld(9_120);
    panamanianIndependence1903(world);
    danishWestIndies1917(world);
    newfoundlandUnion1949(world);
    panamaCanalOccupation1904(world);
    addProvinceClaim(world, idOf("am-bsa-falkland-islands"), 50 as Id);
    setProvinceSpecialStatus(world, idOf("am-pri-puerto-rico"), "occupied");
    const serialized = serializeWorld(world);
    const restored = deserializeWorld(serialized);
    assertValidWorld(restored);
    expect(restored.provinces).toEqual(world.provinces);
    expect(hashWorld(restored)).toBe(hashWorld(world));
    expect(ownerOf(restored, "am-pan-panama")).toBe(futureId("PAN"));
    expect(ownerOf(restored, "am-dwi-saint-thomas")).toBe(0);
    expect(ownerOf(restored, "am-nfd-newfoundland-and-labrador")).toBe(56);
    expect(ownershipOf(restored, "am-bsa-falkland-islands")?.claimantPolityIds).toEqual([50]);
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

  test("an M12c-era save with only European, Asian and African records still loads", () => {
    const world = referenceWorld();
    world.provinces.ownership = world.provinces.ownership.filter(
      (entry) => entry.provinceId <= 200260,
    );
    const restored = deserializeWorld(serializeWorld(world));
    assertValidWorld(restored);
    expect(restored.provinces.ownership.length).toBe(
      EUROPE.provinces.length + ASIA.provinces.length + AFRICA.provinces.length,
    );
    expect(restored.provinces.ownership.some((entry) => entry.provinceId >= 300001)).toBe(false);
  });

  test("identical sequences produce the identical world hash", () => {
    const left = referenceWorld(321);
    const right = referenceWorld(321);
    for (const world of [left, right]) {
      cubanIndependence1902(world);
      panamanianIndependence1903(world);
      acreTransfer1903(world);
      danishWestIndies1917(world);
      tacnaReturn1929(world);
      newfoundlandUnion1949(world);
      caribbeanIndependenceWave(world);
    }
    expect(hashWorld(left)).toBe(hashWorld(right));
  });

  test("different transfer orders produce a different history", () => {
    const left = referenceWorld(654);
    const right = referenceWorld(654);
    transfer(left, idsOf("am-pan-panama"), futureId("PAN"), "independence", "Panama first", day(1903, 11, 3));
    transfer(left, idsOf("am-cub-oriente"), 59 as Id, "independence", "Cuba second", day(1902, 5, 20));
    transfer(right, idsOf("am-cub-oriente"), 59 as Id, "independence", "Cuba first", day(1902, 5, 20));
    transfer(right, idsOf("am-pan-panama"), futureId("PAN"), "independence", "Panama second", day(1903, 11, 3));
    expect(ownerOf(left, "am-pan-panama")).toBe(futureId("PAN"));
    expect(ownerOf(left, "am-cub-oriente")).toBe(59);
    expect(hashWorld(left)).not.toBe(hashWorld(right));
  });

  test("the scenario still builds after the combined bundle is attached", () => {
    const scenario: EconomyScenarioDef = loadM11World();
    const world = createEconomyWorld(scenario, { seed: 1 });
    assertValidWorld(world);
    expect(world.provinces.ownership.length).toBe(scenario.provinces?.definitions.length);
    expect(world.provinces.ownership.length).toBeGreaterThan(1500);
  });
});
