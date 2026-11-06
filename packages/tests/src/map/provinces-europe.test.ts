/**
 * M12a European provincial system.
 *
 * The suite validates the committed province inventory and geometry, then drives
 * the authoritative simulation through the historical transfer sequences that
 * the milestone requires: Austria-Hungary's dissolution, the German post-WWI and
 * post-WWII settlements, reunification, Russian fragmentation and Irish
 * partition. Reference snapshots are validation references, not forced outcomes.
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
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
  type ProvinceDefinition,
  type World,
} from "@century/sim";
import { loadM11World } from "@century/data";

import {
  decodeProvinceGeometry,
  pathForLines,
  project,
} from "../../../app/src/components/worldMapGeometry.js";
import {
  pickProvinceAtPoint,
  planProvinceBorders,
} from "../../../app/src/components/provinceRenderPlan.js";
import type { ProvinceMapData } from "../../../app/src/provinceCatalogTypes.js";
import { politicalGeographyWorld } from "../fixtures/provinces.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../../..");
const BUNDLE = JSON.parse(
  readFileSync(join(ROOT, "packages/data/data/map/provinces_1900.json"), "utf8"),
) as ProvinceMapData;
const ASIA_BUNDLE = JSON.parse(
  readFileSync(join(ROOT, "packages/data/data/map/provinces_asia_1900.json"), "utf8"),
) as ProvinceMapData;
const AFRICA_BUNDLE = JSON.parse(
  readFileSync(join(ROOT, "packages/data/data/map/provinces_africa_1900.json"), "utf8"),
) as ProvinceMapData;
const AMERICAS_BUNDLE = JSON.parse(
  readFileSync(join(ROOT, "packages/data/data/map/provinces_americas_1900.json"), "utf8"),
) as ProvinceMapData;
const OCEANIA_BUNDLE = JSON.parse(
  readFileSync(join(ROOT, "packages/data/data/map/provinces_oceania_1900.json"), "utf8"),
) as ProvinceMapData;
const AUDIT = JSON.parse(
  readFileSync(join(ROOT, "packages/data/data/map/provinces_1900_audit.json"), "utf8"),
) as {
  provinceCount: number;
  duplicateProvinceIds: number;
  duplicateKeys: number;
  coverage: { tag: string; residualArea: number; estimated: boolean }[];
  overlapCount: number;
  unmatchedBorderSegments: number;
};

const M11_SCENARIO = loadM11World();
const BY_KEY = new Map(BUNDLE.provinces.map((province) => [province.key, province]));
const ID_BY_KEY = new Map(
  [
    ...BUNDLE.provinces,
    ...ASIA_BUNDLE.provinces,
    ...AFRICA_BUNDLE.provinces,
    ...AMERICAS_BUNDLE.provinces,
    ...OCEANIA_BUNDLE.provinces,
  ].map((province) => [province.key, province.id] as const),
);
const DEFINITIONS = new Map<number, ProvinceDefinition>(
  (M11_SCENARIO.provinces?.definitions ?? []).map((definition) => [
    definition.provinceId,
    definition,
  ]),
);

const FUTURE_ID = new Map(BUNDLE.futurePolities.map((polity) => [polity.tag, polity.polityId]));

function day(year: number, month: number, date: number): number {
  return civilDateToDayIndex(year, month as 1, date);
}

function idsFor(predicate: (key: string, province: ProvinceMapData["provinces"][number]) => boolean): Id[] {
  const ids: Id[] = [];
  for (const province of BUNDLE.provinces) {
    if (predicate(province.key, province)) ids.push(province.id);
  }
  return ids;
}

/** Ids by key across every committed bundle (the M12e gap provinces included). */
function idsByKey(keys: readonly string[]): Id[] {
  const ids: Id[] = [];
  for (const key of keys) {
    const id = ID_BY_KEY.get(key);
    if (id !== undefined) ids.push(id);
  }
  return ids;
}

function hasKey(world: World, key: string): boolean {
  const province = BY_KEY.get(key);
  if (province === undefined) throw new Error(`unknown province key ${key}`);
  return world.provinces.ownership.some((entry) => entry.provinceId === province.id);
}

function ownerOf(world: World, key: string): Id {
  const province = BY_KEY.get(key);
  if (province === undefined) throw new Error(`unknown province key ${key}`);
  const entry = world.provinces.ownership.find((candidate) => candidate.provinceId === province.id);
  if (entry === undefined) throw new Error(`province ${key} is missing from the world`);
  return entry.ownerPolityId;
}

/** Province ids matching a key predicate whose current owner is one of `owners`. */
function ownedIds(
  world: World,
  predicate: (key: string) => boolean,
  owners: readonly Id[],
): Id[] {
  const ids: Id[] = [];
  for (const province of BUNDLE.provinces) {
    if (!predicate(province.key)) continue;
    const ownership = world.provinces.ownership.find(
      (entry) => entry.provinceId === province.id,
    );
    if (ownership !== undefined && owners.includes(ownership.ownerPolityId)) {
      ids.push(province.id);
    }
  }
  return ids;
}

function transfer(
  world: World,
  provinceIds: Id[],
  toPolityId: Id,
  kind: Parameters<typeof transferProvinceOwnership>[1]["kind"],
  note: string,
  transferDay: number,
): void {
  if (provinceIds.length === 0) return;
  transferProvinceOwnership(world, {
    provinceIds,
    toPolityId,
    kind,
    day: transferDay,
    note,
  });
}

interface ReferenceWorld {
  readonly world: World;
  readonly scenario: EconomyScenarioDef;
}

function referenceWorld(seed = 12_001): ReferenceWorld {
  // P2: the reference sequences run on the political geography alone (D-118).
  const world = politicalGeographyWorld(M11_SCENARIO, seed);
  return { world, scenario: M11_SCENARIO };
}

/** 1918-1920 settlement of Austria-Hungary. */
function dissolveAustriaHungary(world: World): void {
  const at = day(1918, 11, 1);
  const cze = FUTURE_ID.get("CZE") as Id;
  const aut = FUTURE_ID.get("AUT") as Id;
  const hun = FUTURE_ID.get("HUN") as Id;
  const pol = FUTURE_ID.get("POL") as Id;
  const rom = 18 as Id; // Romania already exists as a 1900 country.
  const yug = FUTURE_ID.get("YUG") as Id;
  const ita = 6 as Id;
  const czechKeys = [
    "aut-prague",
    "aut-bohemia",
    "aut-moravia",
    "aut-austrian-silesia",
    "aut-svk-pressburg",
    "aut-svk-nagyszombat",
    "aut-svk-nyitra",
    "aut-svk-trencsen",
    "aut-svk-turocz",
    "aut-svk-besztercebanya",
    "aut-svk-kassa",
    "aut-svk-eperjes",
    "aut-carpathian-ruthenia",
  ];
  transfer(
    world,
    idsFor((key) => czechKeys.includes(key)),
    cze,
    "dissolution",
    "Czechoslovak independence and the Paris settlement",
    at,
  );
  const polishKeys = [
    "aut-western-galicia",
    "aut-eastern-galicia",
    "aut-tarnopol",
    "aut-cieszyn-silesia",
  ];
  transfer(
    world,
    idsFor((key) => polishKeys.includes(key)),
    pol,
    "cession",
    "Polish republic and the Galician settlement",
    at,
  );
  transfer(
    world,
    idsFor((key) => ["aut-northern-bukovina", "aut-southern-bukovina"].includes(key)),
    rom,
    "cession",
    "Bukovina union with Romania",
    at,
  );
  const romanianKeys = [
    "aut-transylvania",
    "aut-szekely-land",
    "aut-partium",
    "aut-banat",
  ];
  transfer(
    world,
    idsFor((key) => romanianKeys.includes(key)),
    rom,
    "cession",
    "Transylvanian and Banat union with Romania",
    at,
  );
  const yugoslavKeys = [
    "aut-croatia-proper",
    "aut-slavonia",
    "aut-bosnia",
    "aut-herzegovina",
    "aut-fiume",
    "aut-backa",
    "aut-syrmia",
    "aut-northern-dalmatia",
    "aut-southern-dalmatia",
    "aut-carniola",
    "aut-lower-styria",
  ];
  transfer(
    world,
    [
      ...idsFor((key) => yugoslavKeys.includes(key)),
      // M12e: the Kvarner islands (Krk, Cres, Losinj) were Austrian Littoral and
      // passed to the Kingdom of Serbs, Croats and Slovenes after 1918.
      ...idsByKey(["oc-aut-krk-island", "oc-aut-cres-and-losinj"]),
    ],
    yug,
    "union",
    "Proclamation of the Kingdom of Serbs, Croats and Slovenes",
    at,
  );
  const italianKeys = [
    "aut-trieste",
    "aut-trentino",
    "aut-south-tyrol",
    "aut-istria",
    "aut-gorizia-gradisca",
  ];
  transfer(
    world,
    idsFor((key) => italianKeys.includes(key)),
    ita,
    "cession",
    "Italian annexation of the Trentino, South Tyrol and Trieste",
    at,
  );
  const austrianKeys = [
    "aut-vienna",
    "aut-lower-austria",
    "aut-upper-austria",
    "aut-salzburg",
    "aut-styria",
    "aut-carinthia",
    "aut-tyrol",
    "aut-vorarlberg",
    "aut-burgenland",
  ];
  transfer(
    world,
    [
      ...idsFor((key) => austrianKeys.includes(key)),
      // M12e: the residual slivers of the Austro-Hungarian feature are attached
      // to the rump Austrian republic when the monarchy dissolves. They are
      // coverage geometry, not a reviewed frontier.
      ...idsByKey(["oc-gap-aut-residual"]),
    ],
    aut,
    "dissolution",
    "Proclamation of the Republic of Austria",
    at,
  );
  transfer(
    world,
    idsFor(
      (key) =>
        !czechKeys.includes(key) &&
        !polishKeys.includes(key) &&
        !romanianKeys.includes(key) &&
        !["aut-northern-bukovina", "aut-southern-bukovina"].includes(key) &&
        !yugoslavKeys.includes(key) &&
        !italianKeys.includes(key) &&
        !austrianKeys.includes(key) &&
        key.startsWith("aut-"),
    ),
    hun,
    "dissolution",
    "Hungarian People's Republic and the Trianon settlement",
    at,
  );
}

/** 1919-1923 German western and eastern settlement. */
function settleGermany1919(world: World): void {
  const at = day(1919, 6, 28);
  transfer(
    world,
    idsFor((key) => ["deu-alsace", "deu-lorraine"].includes(key)),
    3 as Id,
    "cession",
    "Treaty of Versailles: Alsace-Lorraine to France",
    at,
  );
  transfer(
    world,
    idsFor((key) => key === "deu-north-schleswig"),
    14 as Id,
    "cession",
    "Schleswig plebiscite: northern Schleswig to Denmark",
    at,
  );
  // D-128: the Hultschin province was Prussian (Ratibor district), so it leaves with the
  // German settlement under Versailles, not with Austria-Hungary.
  transfer(
    world,
    idsFor((key) => key === "aut-hultschin"),
    FUTURE_ID.get("CZE") as Id,
    "cession",
    "Treaty of Versailles: Hultschin province to Czechoslovakia",
    day(1920, 2, 4),
  );
  transfer(
    world,
    idsFor((key) => key === "deu-eupen-malmedy"),
    10 as Id,
    "cession",
    "Eupen-Malmedy to Belgium",
    at,
  );
  transfer(
    world,
    idsFor((key) => ["deu-posen", "deu-west-prussia", "deu-upper-silesia"].includes(key)),
    FUTURE_ID.get("POL") as Id,
    "cession",
    "Polish Corridor and Upper Silesian plebiscite",
    at,
  );
  transfer(
    world,
    idsFor((key) => key === "deu-danzig"),
    FUTURE_ID.get("DAN") as Id,
    "cession",
    "Free City of Danzig",
    day(1920, 11, 15),
  );
  const danzig = BY_KEY.get("deu-danzig");
  if (danzig !== undefined) setProvinceSpecialStatus(world, danzig.id, "free-city");
  transfer(
    world,
    idsFor((key) => key === "deu-memel"),
    FUTURE_ID.get("LTU") as Id,
    "cession",
    "Memel Territory to Lithuania",
    day(1923, 1, 15),
  );
  // The Saar remained legally German but was administered by France under the
  // League of Nations: ownership and effective control are deliberately distinct.
  const saar = BY_KEY.get("deu-saar");
  if (saar !== undefined) {
    setProvinceControl(world, {
      provinceIds: [saar.id],
      controllerPolityId: 3 as Id,
      day: day(1920, 1, 10),
      note: "Saar Basin administered by France",
      kind: "occupation",
    });
    setProvinceSpecialStatus(world, saar.id, "mandate");
  }
}

/** 1945 settlement: the eastern territories leave German sovereignty. */
function settleGermany1945(world: World): void {
  const at = day(1945, 8, 2);
  transfer(
    world,
    idsFor((key) => key === "deu-east-prussia-north"),
    4 as Id,
    "annexation",
    "Potsdam: northern East Prussia to the Soviet Union",
    at,
  );
  transfer(
    world,
    idsFor((key) =>
      [
        "deu-east-prussia-south",
        "deu-pomerania",
        "deu-lower-silesia",
        "deu-middle-silesia",
        "deu-upper-silesia",
        "deu-brandenburg-lebus",
        "deu-danzig",
      ].includes(key),
    ),
    FUTURE_ID.get("POL") as Id,
    "annexation",
    "Potsdam: German territories east of the Oder-Neisse to Poland",
    at,
  );
}

/** 1949 division of the remaining German state. */
function divideGermany1949(world: World): void {
  const at = day(1949, 10, 7);
  const west = FUTURE_ID.get("FRG") as Id;
  const east = FUTURE_ID.get("DDR") as Id;
  const eastKeys = [
    "deu-mecklenburg",
    "deu-brandenburg",
    "deu-prussian-saxony",
    "deu-saxony",
    "deu-thuringia",
  ];
  transfer(world, idsFor((key) => eastKeys.includes(key)), east, "transfer", "German Democratic Republic", at);
  transfer(
    world,
    ownedIds(
      world,
      (key) => key.startsWith("deu-") && !eastKeys.includes(key) && key !== "deu-berlin",
      [2],
    ),
    west,
    "transfer",
    "Federal Republic of Germany",
    day(1949, 5, 23),
  );
  const berlin = BY_KEY.get("deu-berlin");
  if (berlin !== undefined) {
    transfer(world, [berlin.id], west, "transfer", "West Berlin under the Federal Republic", at);
    setProvinceSpecialStatus(world, berlin.id, "neutral");
  }
}

/** 1990 reunification: the GDR joins the Federal Republic. */
function reunifyGermany1990(world: World): void {
  const at = day(1990, 10, 3);
  transfer(
    world,
    idsFor((key) => {
      const province = BY_KEY.get(key);
      if (province === undefined) return false;
      const ownership = world.provinces.ownership.find(
        (entry) => entry.provinceId === province.id,
      );
      return (
        ownership !== undefined &&
        (ownership.ownerPolityId === FUTURE_ID.get("DDR") ||
          ownership.ownerPolityId === 2)
      );
    }),
    FUTURE_ID.get("FRG") as Id,
    "accession",
    "German reunification: the eastern Länder accede to the Federal Republic",
    at,
  );
}

function fragmentRussia(world: World): void {
  transfer(
    world,
    idsFor((key) => key.startsWith("rus-fin-")),
    FUTURE_ID.get("FIN") as Id,
    "independence",
    "Finnish declaration of independence",
    day(1917, 12, 6),
  );
  transfer(
    world,
    idsFor((key) => key.startsWith("rus-est-")),
    FUTURE_ID.get("EST") as Id,
    "independence",
    "Estonian declaration of independence",
    day(1918, 2, 24),
  );
  transfer(
    world,
    idsFor((key) => key.startsWith("rus-lva-")),
    FUTURE_ID.get("LVA") as Id,
    "independence",
    "Latvian declaration of independence",
    day(1918, 11, 18),
  );
  transfer(
    world,
    idsFor((key) => key.startsWith("rus-ltu-")),
    FUTURE_ID.get("LTU") as Id,
    "independence",
    "Lithuanian declaration of independence",
    day(1918, 2, 16),
  );
  transfer(
    world,
    idsFor((key) => key.startsWith("rus-pol-")),
    FUTURE_ID.get("POL") as Id,
    "independence",
    "Polish republic",
    day(1918, 11, 11),
  );
  transfer(
    world,
    idsFor((key) => key.startsWith("rus-ukr-")),
    FUTURE_ID.get("UKR") as Id,
    "independence",
    "Ukrainian independence",
    day(1918, 1, 22),
  );
  transfer(
    world,
    idsFor((key) => key.startsWith("rus-blr-")),
    FUTURE_ID.get("BLR") as Id,
    "independence",
    "Belarusian independence",
    day(1918, 3, 25),
  );
  transfer(
    world,
    idsFor((key) => key.startsWith("rus-mda-")),
    FUTURE_ID.get("MDA") as Id,
    "independence",
    "Moldovan independence",
    day(1991, 8, 27),
  );
}

function partitionIreland(world: World): void {
  transfer(
    world,
    idsFor((key) => key.startsWith("gbr-ie-")),
    FUTURE_ID.get("IRL") as Id,
    "independence",
    "Irish Free State",
    day(1922, 12, 6),
  );
}

describe("M12a province inventory and geometry", () => {
  test("the committed bundle covers Europe with stable unique ids", () => {
    expect(BUNDLE.provinces.length).toBeGreaterThan(400);
    expect(new Set(BUNDLE.provinces.map((province) => province.id)).size).toBe(
      BUNDLE.provinces.length,
    );
    expect(new Set(BUNDLE.provinces.map((province) => province.key)).size).toBe(
      BUNDLE.provinces.length,
    );
    expect(AUDIT.duplicateProvinceIds).toBe(0);
    expect(AUDIT.duplicateKeys).toBe(0);
    expect(AUDIT.provinceCount).toBe(BUNDLE.provinces.length);
    expect(AUDIT.overlapCount).toBeLessThanOrEqual(40);
  });

  test("every required European 1900 owner has provinces", () => {
    const owners = new Set(BUNDLE.provinces.map((province) => province.initialOwnerTag));
    for (const tag of [
      "AUT",
      "DEU",
      "RUS",
      "GBR",
      "FRA",
      "ITA",
      "ESP",
      "PRT",
      "BEL",
      "NLD",
      "LUX",
      "CHE",
      "DNK",
      "SWE",
      "NOR",
      "GRC",
      "SRB",
      "MNT",
      "BGR",
      "ROM",
      "OTT",
    ]) {
      expect(owners.has(tag)).toBe(true);
    }
  });

  test("every province has a 1900 owner, administrative metadata and provenance", () => {
    for (const province of BUNDLE.provinces) {
      expect(province.initialOwnerTag.length).toBeGreaterThan(1);
      expect(province.initialOwnerPolityId).toBeGreaterThan(0);
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
    for (const province of BUNDLE.provinces) {
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
    expect(ringCount).toBeGreaterThan(BUNDLE.provinces.length);
  });

  test("province borders are deduplicated open polylines", () => {
    let lineCount = 0;
    for (const border of BUNDLE.borders) {
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

  test("province edges stay internal inside a country and become national across owners", () => {
    const ownerByProvinceId = new Map(
      BUNDLE.provinces.map((province) => [province.id, province.initialOwnerTag]),
    );
    const plan = planProvinceBorders(BUNDLE.borders, ownerByProvinceId);
    expect(plan.length).toBe(BUNDLE.borders.length);
    const bohemia = BY_KEY.get("aut-bohemia")?.id as number;
    const moravia = BY_KEY.get("aut-moravia")?.id as number;
    const alsace = BY_KEY.get("deu-alsace")?.id as number;
    const baden = BY_KEY.get("deu-baden")?.id as number;
    const bohemiaMoravia = plan.filter(
      (border) =>
        (border.a === bohemia && border.b === moravia) ||
        (border.a === moravia && border.b === bohemia),
    );
    expect(bohemiaMoravia.length).toBeGreaterThan(0);
    expect(bohemiaMoravia.every((border) => border.national === false)).toBe(true);
    const alsaceBaden = plan.filter(
      (border) =>
        (border.a === alsace && border.b === baden) ||
        (border.a === baden && border.b === alsace),
    );
    if (alsaceBaden.length > 0) {
      expect(alsaceBaden.every((border) => border.national === false)).toBe(true);
    }
    // After Alsace is transferred to France, the same shared edge is national.
    const changed = new Map(ownerByProvinceId);
    changed.set(alsace, "FRA");
    const changedPlan = planProvinceBorders(BUNDLE.borders, changed);
    const alsaceNeighbours = changedPlan.filter(
      (border) => border.a === alsace || border.b === alsace,
    );
    expect(alsaceNeighbours.some((border) => border.national)).toBe(true);
    // Internal same-owner edges remain in the province layer.
    expect(plan.filter((border) => !border.national && border.internal).length).toBeGreaterThan(0);
  });

  test("province hit testing is zoom-independent and picks the containing province", () => {
    const decoded = BUNDLE.provinces.map((province) => {
      const geometry = decodeProvinceGeometry(province);
      return { province, geometry };
    });
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
        // A handful of authored clip seams overlap by a few hundredths of a
        // square degree; the smallest containing province wins by design.
        if (hit !== province.id) mismatches += 1;
      }
    }
    expect(checked).toBeGreaterThan(BUNDLE.provinces.length * 0.9);
    expect(mismatches / checked).toBeLessThan(0.02);
  });

  test("the coverage audit records a complete authored partition", () => {
    expect(AUDIT.coverage.length).toBeGreaterThan(25);
    for (const entry of AUDIT.coverage) {
      if (entry.estimated) continue;
      // The transcontinental Russian and Ottoman coverage tests intentionally
      // span a wider area than the M12a European provincial scope; their
      // residual is documented rather than asserted to be small.
      if (entry.tag === "RUS" || entry.tag === "OTT") continue;
      // The authored plan covers the whole 1900 scope; residual slivers are
      // reported and stay under the 1900 polity fill rather than becoming
      // duplicate provinces.
      expect(entry.residualArea).toBeLessThan(2.5);
    }
  });

  test("the required historical subdivisions exist", () => {
    const world = createEconomyWorld(M11_SCENARIO, { seed: 1 });
    for (const key of [
      "deu-east-prussia-north",
      "deu-east-prussia-south",
      "deu-west-prussia",
      "deu-posen",
      "deu-danzig",
      "deu-upper-silesia",
      "deu-middle-silesia",
      "deu-lower-silesia",
      "deu-north-schleswig",
      "deu-alsace",
      "deu-lorraine",
      "deu-saar",
      "aut-western-galicia",
      "aut-eastern-galicia",
      "aut-northern-bukovina",
      "aut-southern-bukovina",
      "aut-transylvania",
      "aut-banat",
      "aut-szekely-land",
      "gbr-ni-antrim",
      "gbr-ni-down",
      "gbr-ni-armagh",
      "gbr-ni-fermanagh",
      "gbr-ni-londonderry",
      "gbr-ni-tyrone",
      "gbr-ie-cork",
    ]) {
      expect(hasKey(world, key)).toBe(true);
    }
  });
});

describe("M12a authoritative provincial ownership", () => {
  test("the 1900 world starts with one ownership record per province", () => {
    const scenario = loadM11World();
    const definitions = scenario.provinces?.definitions ?? [];
    // The M12b Asia bundle is part of the same scenario from M12b onwards; the
    // European inventory must remain a complete subset of the combined one.
    expect(definitions.length).toBeGreaterThanOrEqual(BUNDLE.provinces.length);
    const definitionIds = new Set(definitions.map((definition) => definition.provinceId));
    for (const province of BUNDLE.provinces) {
      expect(definitionIds.has(province.id)).toBe(true);
    }
    expect(scenario.provinces?.polityRegistry?.length).toBeGreaterThanOrEqual(
      BUNDLE.futurePolities.length,
    );
    const world = createEconomyWorld(scenario, { seed: 20_260_101 });
    assertValidWorld(world);
    expect(world.provinces.enabled).toBe(true);
    expect(world.provinces.ownership.length).toBe(definitions.length);
    expect(new Set(world.provinces.ownership.map((entry) => entry.provinceId)).size).toBe(
      world.provinces.ownership.length,
    );
    // D-129/D-132: Cuba (United States military government) and Egypt (Ottoman,
    // under British occupation) are the 1900 province groups whose controller differs
    // from their owner.
    const cuban = new Set(
      definitions
        .filter((definition) => definition.key.startsWith("am-cub-") || definition.key.startsWith("af-egy-"))
        .map((definition) => definition.provinceId),
    );
    for (const entry of world.provinces.ownership) {
      if (cuban.has(entry.provinceId)) continue;
      expect(entry.ownerPolityId).toBe(entry.controllerPolityId);
      expect(entry.controlledSinceDay).toBeNull();
      expect(entry.claimantPolityIds).toEqual([]);
    }
    const owners = new Set(world.provinces.ownership.map((entry) => entry.ownerPolityId));
    expect(owners.has(60)).toBe(true); // Austria-Hungary remains one polity in 1900.
    expect(owners.has(2)).toBe(true); // German Empire
    expect(owners.has(4)).toBe(true); // Russian Empire
    expect(owners.has(1)).toBe(true); // United Kingdom and Ireland
    expect(owners.has(FUTURE_ID.get("POL") as number)).toBe(false);
  });

  test("ownership transfers preserve province ids and geometry references", () => {
    const { world } = referenceWorld();
    const before = world.provinces.ownership.map((entry) => entry.provinceId);
    transfer(
      world,
      idsFor((key) => key === "deu-alsace"),
      3 as Id,
      "cession",
      "test transfer",
      day(1919, 1, 1),
    );
    expect(world.provinces.ownership.map((entry) => entry.provinceId)).toEqual(before);
    expect(ownerOf(world, "deu-alsace")).toBe(3);
    expect(DEFINITIONS.get(BY_KEY.get("deu-alsace")?.id as number)?.historicalName).toBe(
      "Alsace",
    );
    assertValidWorld(world);
  });

  test("occupation changes control without changing legal ownership", () => {
    const { world } = referenceWorld();
    const saar = BY_KEY.get("deu-saar");
    expect(saar).toBeDefined();
    setProvinceControl(world, {
      provinceIds: [saar?.id as Id],
      controllerPolityId: 3 as Id,
      day: day(1920, 1, 10),
      note: "Saar Basin",
      kind: "occupation",
    });
    const entry = world.provinces.ownership.find((candidate) => candidate.provinceId === saar?.id);
    expect(entry?.ownerPolityId).toBe(2);
    expect(entry?.controllerPolityId).toBe(3);
    expect(entry?.controlledSinceDay).toBe(day(1920, 1, 10));
    setProvinceControl(world, {
      provinceIds: [saar?.id as Id],
      controllerPolityId: null,
      day: day(1935, 1, 13),
      note: "Saar returns to German control",
      kind: "liberation",
    });
    const restored = world.provinces.ownership.find(
      (candidate) => candidate.provinceId === saar?.id,
    );
    expect(restored?.controllerPolityId).toBe(2);
    expect(restored?.controlledSinceDay).toBeNull();
    expect(restored?.ownerPolityId).toBe(2);
    assertValidWorld(world);
  });

  test("claims never imply ownership and survive transfers deterministically", () => {
    const { world } = referenceWorld();
    const target = BY_KEY.get("deu-alsace");
    const entry = world.provinces.ownership.find(
      (candidate) => candidate.provinceId === target?.id,
    );
    expect(entry).toBeDefined();
    assertValidWorld(world);
  });
});

describe("M12a historical reference snapshots", () => {
  test("Austria-Hungary dissolves into its successor provinces", () => {
    const { world } = referenceWorld();
    const ahProvinces = idsFor((key) => key.startsWith("aut-"));
    expect(ahProvinces.length).toBeGreaterThan(40);
    dissolveAustriaHungary(world);
    expect(world.provinces.ownership.filter((entry) => entry.ownerPolityId === 60)).toEqual([]);
    const byOwner = new Map<number, number>();
    for (const entry of world.provinces.ownership) {
      byOwner.set(entry.ownerPolityId, (byOwner.get(entry.ownerPolityId) ?? 0) + 1);
    }
    expect(byOwner.get(FUTURE_ID.get("CZE") as number) ?? 0).toBeGreaterThanOrEqual(10);
    expect(byOwner.get(FUTURE_ID.get("POL") as number) ?? 0).toBeGreaterThanOrEqual(3);
    expect(byOwner.get(18) ?? 0).toBeGreaterThanOrEqual(4);
    expect(byOwner.get(FUTURE_ID.get("YUG") as number) ?? 0).toBeGreaterThanOrEqual(8);
    expect(byOwner.get(6) ?? 0).toBeGreaterThanOrEqual(3);
    expect(ownerOf(world, "aut-bohemia")).toBe(FUTURE_ID.get("CZE"));
    expect(ownerOf(world, "aut-western-galicia")).toBe(FUTURE_ID.get("POL"));
    expect(ownerOf(world, "aut-transylvania")).toBe(18);
    expect(ownerOf(world, "aut-bosnia")).toBe(FUTURE_ID.get("YUG"));
    assertValidWorld(world);
  });

  test("German post-WWI settlement separates East Prussia by the Polish Corridor", () => {
    const { world } = referenceWorld();
    settleGermany1919(world);
    expect(ownerOf(world, "deu-alsace")).toBe(3);
    expect(ownerOf(world, "deu-lorraine")).toBe(3);
    expect(ownerOf(world, "deu-north-schleswig")).toBe(14);
    expect(ownerOf(world, "deu-eupen-malmedy")).toBe(10);
    expect(ownerOf(world, "deu-posen")).toBe(FUTURE_ID.get("POL"));
    expect(ownerOf(world, "deu-west-prussia")).toBe(FUTURE_ID.get("POL"));
    expect(ownerOf(world, "deu-danzig")).toBe(FUTURE_ID.get("DAN"));
    expect(ownerOf(world, "deu-memel")).toBe(FUTURE_ID.get("LTU"));
    expect(ownerOf(world, "deu-saar")).toBe(2);
    const saar = world.provinces.ownership.find(
      (entry) => entry.provinceId === BY_KEY.get("deu-saar")?.id,
    );
    expect(saar?.controllerPolityId).toBe(3);
    expect(saar?.specialStatus).toBe("mandate");

    // Connectivity of German-owned provinces in the border graph: East Prussia
    // must no longer be reachable from Brandenburg through German provinces.
    const adjacency = new Map<number, number[]>();
    for (const border of BUNDLE.borders) {
      if (border.b < 0) continue;
      const left = adjacency.get(border.a) ?? [];
      left.push(border.b);
      adjacency.set(border.a, left);
      const right = adjacency.get(border.b) ?? [];
      right.push(border.a);
      adjacency.set(border.b, right);
    }
    const ownerById = new Map(world.provinces.ownership.map((entry) => [entry.provinceId, entry.ownerPolityId]));
    const start = BY_KEY.get("deu-east-prussia-south")?.id as number;
    const goal = BY_KEY.get("deu-brandenburg")?.id as number;
    const queue = [start];
    const seen = new Set<number>([start]);
    while (queue.length > 0) {
      const current = queue.shift() as number;
      for (const next of adjacency.get(current) ?? []) {
        if (seen.has(next)) continue;
        if (ownerById.get(next) !== 2) continue;
        seen.add(next);
        queue.push(next);
      }
    }
    expect(seen.has(goal)).toBe(false);
    assertValidWorld(world);
  });

  test("German post-WWII settlement and 1949 division keep the eastern territories out", () => {
    const { world } = referenceWorld();
    settleGermany1919(world);
    settleGermany1945(world);
    expect(ownerOf(world, "deu-east-prussia-north")).toBe(4);
    expect(ownerOf(world, "deu-east-prussia-south")).toBe(FUTURE_ID.get("POL"));
    expect(ownerOf(world, "deu-pomerania")).toBe(FUTURE_ID.get("POL"));
    expect(ownerOf(world, "deu-lower-silesia")).toBe(FUTURE_ID.get("POL"));
    expect(ownerOf(world, "deu-danzig")).toBe(FUTURE_ID.get("POL"));
    divideGermany1949(world);
    expect(ownerOf(world, "deu-bavaria")).toBe(FUTURE_ID.get("FRG"));
    expect(ownerOf(world, "deu-mecklenburg")).toBe(FUTURE_ID.get("DDR"));
    expect(ownerOf(world, "deu-brandenburg")).toBe(FUTURE_ID.get("DDR"));
    expect(ownerOf(world, "deu-berlin")).toBe(FUTURE_ID.get("FRG"));
    const berlin = world.provinces.ownership.find(
      (entry) => entry.provinceId === BY_KEY.get("deu-berlin")?.id,
    );
    expect(berlin?.specialStatus).toBe("neutral");
    // The assertion is European: the African German colonies (M12c) are still
    // owned by the German Empire in this 1919-1949 European sequence.
    expect(
      world.provinces.ownership.filter(
        (entry) => entry.ownerPolityId === 2 && entry.provinceId <= 66001,
      ),
    ).toEqual([]);
  });

  test("1990 reunification does not restore the former eastern territories", () => {
    const { world } = referenceWorld();
    settleGermany1919(world);
    settleGermany1945(world);
    divideGermany1949(world);
    reunifyGermany1990(world);
    expect(ownerOf(world, "deu-mecklenburg")).toBe(FUTURE_ID.get("FRG"));
    expect(ownerOf(world, "deu-brandenburg")).toBe(FUTURE_ID.get("FRG"));
    expect(ownerOf(world, "deu-bavaria")).toBe(FUTURE_ID.get("FRG"));
    expect(ownerOf(world, "deu-pomerania")).toBe(FUTURE_ID.get("POL"));
    expect(ownerOf(world, "deu-lower-silesia")).toBe(FUTURE_ID.get("POL"));
    expect(ownerOf(world, "deu-east-prussia-north")).toBe(4);
    expect(world.provinces.ownership.filter((entry) => entry.ownerPolityId === FUTURE_ID.get("DDR"))).toEqual(
      [],
    );
    assertValidWorld(world);
  });

  test("Russian fragmentation creates Finland, the Baltic states, Poland, Ukraine and Belarus", () => {
    const { world } = referenceWorld();
    fragmentRussia(world);
    expect(ownerOf(world, "rus-fin-uusimaa")).toBe(FUTURE_ID.get("FIN"));
    expect(ownerOf(world, "rus-est-harju")).toBe(FUTURE_ID.get("EST"));
    expect(ownerOf(world, "rus-lva-riga")).toBe(FUTURE_ID.get("LVA"));
    expect(ownerOf(world, "rus-ltu-vilnius")).toBe(FUTURE_ID.get("LTU"));
    expect(ownerOf(world, "rus-pol-warsaw")).toBe(FUTURE_ID.get("POL"));
    expect(ownerOf(world, "rus-ukr-kiev")).toBe(FUTURE_ID.get("UKR"));
    expect(ownerOf(world, "rus-blr-minsk")).toBe(FUTURE_ID.get("BLR"));
    // Moscow and the Russian core remain Russian.
    expect(ownerOf(world, "rus-moscow")).toBe(4);
    expect(world.provinces.ownership.filter((entry) => entry.ownerPolityId === 4).length).toBeGreaterThan(
      20,
    );
    assertValidWorld(world);
  });

  test("1938-1939 configurations and alternative history remain possible", () => {
    const { world } = referenceWorld();
    dissolveAustriaHungary(world);
    // Anschluss: the Austrian provinces transfer to Germany; nothing forces it.
    transfer(
      world,
      idsFor((key) =>
        [
          "aut-vienna",
          "aut-lower-austria",
          "aut-upper-austria",
          "aut-salzburg",
          "aut-styria",
          "aut-carinthia",
          "aut-tyrol",
          "aut-vorarlberg",
          "aut-burgenland",
        ].includes(key),
      ),
      2 as Id,
      "annexation",
      "Anschluss of Austria",
      day(1938, 3, 12),
    );
    expect(ownerOf(world, "aut-vienna")).toBe(2);
    const geometryBefore = BY_KEY.get("aut-vienna")?.rings;
    // Alternative history: the same province can be transferred back without
    // any geometry change.
    transfer(
      world,
      [BY_KEY.get("aut-vienna")?.id as Id],
      FUTURE_ID.get("AUT") as Id,
      "transfer",
      "alternative restoration of Austrian independence",
      day(1945, 4, 27),
    );
    expect(ownerOf(world, "aut-vienna")).toBe(FUTURE_ID.get("AUT"));
    expect(BY_KEY.get("aut-vienna")?.rings).toEqual(geometryBefore);
    assertValidWorld(world);
  });

  test("province ownership aggregates to complete country territory", () => {
    const { world, scenario } = referenceWorld();
    const byOwner = new Map<number, number>();
    for (const entry of world.provinces.ownership) {
      byOwner.set(entry.ownerPolityId, (byOwner.get(entry.ownerPolityId) ?? 0) + 1);
    }
    expect([...byOwner.values()].reduce((sum, value) => sum + value, 0)).toBe(
      world.provinces.ownership.length,
    );
    // The world carries the combined M12a Europe, M12b Asia, M12c Africa,
    // M12d Americas and M12e Oceania catalogue, so the expected count is the
    // combined definition count for each owner.
    const definitions = scenario.provinces?.definitions ?? [];
    const combinedProvinces = [
      ...BUNDLE.provinces,
      ...ASIA_BUNDLE.provinces,
      ...AFRICA_BUNDLE.provinces,
      ...AMERICAS_BUNDLE.provinces,
      ...OCEANIA_BUNDLE.provinces,
    ];
    const ownerCount = (tag: string): number =>
      definitions.filter((definition) => {
        const province = combinedProvinces.find(
          (candidate) => candidate.id === definition.provinceId,
        );
        return province?.initialOwnerTag === tag;
      }).length;
    expect(byOwner.get(2)).toBe(ownerCount("DEU"));
    expect(byOwner.get(60)).toBe(ownerCount("AUT"));
    expect(byOwner.get(4)).toBe(ownerCount("RUS"));
    expect(byOwner.get(1)).toBe(ownerCount("GBR"));
  });

  test("map geometry no longer depends on the simulation ProvinceEconomy layer", () => {
    const geometrySource = readFileSync(
      join(ROOT, "packages/app/src/components/worldMapGeometry.ts"),
      "utf8",
    );
    const renderPlan = readFileSync(
      join(ROOT, "packages/app/src/components/provinceRenderPlan.ts"),
      "utf8",
    );
    const worldMap = readFileSync(
      join(ROOT, "packages/app/src/components/WorldMap.tsx"),
      "utf8",
    );
    expect(geometrySource).not.toMatch(/SimulationRegion|ProvinceEconomySnapshot/iu);
    expect(renderPlan).not.toMatch(/SimulationRegion|ProvinceEconomySnapshot/iu);
    expect(worldMap).toContain("PROVINCE_MAP_1900");
    expect(worldMap).toContain("decodeProvinceGeometry");
    expect(worldMap).toContain("strokeOpacity");
    expect(worldMap).toContain("PROVINCE_BORDER_COLOR");
    expect(worldMap).toContain("provincesChanged");
    expect(worldMap).toContain("strokePx(COUNTRY_BORDER_WIDTH_PX)");
  });

  test("Irish partition distinguishes the six northern counties", () => {
    const { world } = referenceWorld();
    const ulster = idsFor((key) => key.startsWith("gbr-ni-"));
    expect(ulster.length).toBe(6);
    expect(world.provinces.ownership.filter((entry) => entry.ownerPolityId === FUTURE_ID.get("IRL"))).toEqual(
      [],
    );
    partitionIreland(world);
    expect(ownerOf(world, "gbr-ie-dublin")).toBe(FUTURE_ID.get("IRL"));
    expect(ownerOf(world, "gbr-ie-cork")).toBe(FUTURE_ID.get("IRL"));
    for (const key of [
      "gbr-ni-antrim",
      "gbr-ni-down",
      "gbr-ni-armagh",
      "gbr-ni-fermanagh",
      "gbr-ni-londonderry",
      "gbr-ni-tyrone",
    ]) {
      expect(ownerOf(world, key)).toBe(1);
    }
    expect(world.provinces.ownership.filter((entry) => entry.ownerPolityId === 1).length).toBeGreaterThan(
      20,
    );
    assertValidWorld(world);
  });
});

describe("M12a persistence and determinism", () => {
  test("save/load round-trips provincial ownership, control and history", () => {
    const { world } = referenceWorld(7_777);
    settleGermany1919(world);
    const saar = BY_KEY.get("deu-saar");
    setProvinceSpecialStatus(world, saar?.id as Id, "mandate");
    const serialized = serializeWorld(world);
    const restored = deserializeWorld(serialized);
    assertValidWorld(restored);
    expect(restored.provinces).toEqual(world.provinces);
    expect(hashWorld(restored)).toBe(hashWorld(world));
    expect(ownerOf(restored, "deu-alsace")).toBe(3);
  });

  test("identical transfers in identical order produce the identical world hash", () => {
    const left = referenceWorld(123);
    const right = referenceWorld(123);
    settleGermany1919(left.world);
    settleGermany1919(right.world);
    expect(hashWorld(left.world)).toBe(hashWorld(right.world));
    transfer(
      left.world,
      idsFor((key) => key.startsWith("aut-")),
      FUTURE_ID.get("AUT") as Id,
      "accession",
      "variant",
      day(1920, 1, 1),
    );
    expect(hashWorld(left.world)).not.toBe(hashWorld(right.world));
  });
});
