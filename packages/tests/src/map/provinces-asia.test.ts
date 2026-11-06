/**
 * M12b Asian provincial system.
 *
 * The suite validates the committed Asian province inventory and geometry, the
 * combined Europe+Asia catalogue, and the authoritative simulation through the
 * historical transfer sequences the milestone requires: the Ottoman partition,
 * the Caucasus republics, Manchukuo and the Japanese occupation, the 1945
 * restoration, the 1949 Chinese and Korean divisions, and the 1991 Soviet
 * successor states. Reference snapshots are validation references, not forced
 * outcomes.
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
const ASIA = JSON.parse(
  readFileSync(join(ROOT, "packages/data/data/map/provinces_asia_1900.json"), "utf8"),
) as ProvinceMapData;
const EUROPE = JSON.parse(
  readFileSync(join(ROOT, "packages/data/data/map/provinces_1900.json"), "utf8"),
) as ProvinceMapData;
const AUDIT = JSON.parse(
  readFileSync(join(ROOT, "packages/data/data/map/provinces_asia_1900_audit.json"), "utf8"),
) as {
  provinceCount: number;
  duplicateProvinceIds: number;
  duplicateKeys: number;
  unassignedUnitCount: number;
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
const BY_KEY = new Map(ASIA.provinces.map((province) => [province.key, province]));
const ASIA_IDS = new Set(ASIA.provinces.map((province) => province.id));
const FUTURE_ID = new Map(ASIA.futurePolities.map((polity) => [polity.tag, polity.polityId]));
const REGION_IDS = new Set(SCENARIO.population.provinceEconomies.map((province) => province.id));

function day(year: number, month: number, date: number): number {
  return civilDateToDayIndex(year, month as 1, date);
}

function idOf(key: string): Id {
  const province = BY_KEY.get(key);
  if (province === undefined) throw new Error(`unknown Asia province ${key}`);
  return province.id;
}

function idsOf(...keys: readonly string[]): Id[] {
  return keys.map(idOf);
}

function ownerOf(world: World, key: string): Id {
  const entry = world.provinces.ownership.find((candidate) => candidate.provinceId === idOf(key));
  if (entry === undefined) throw new Error(`province ${key} is missing from the world`);
  return entry.ownerPolityId;
}

function controllerOf(world: World, key: string): Id {
  const entry = world.provinces.ownership.find((candidate) => candidate.provinceId === idOf(key));
  if (entry === undefined) throw new Error(`province ${key} is missing from the world`);
  return entry.controllerPolityId;
}

function ownershipOf(world: World, key: string) {
  return world.provinces.ownership.find((candidate) => candidate.provinceId === idOf(key));
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
  transferProvinceOwnership(world, { provinceIds: [...provinceIds], toPolityId, kind, day: at, note });
}

function referenceWorld(seed = 77_000): World {
  // P2: the reference sequences run on the political geography alone (D-118).
  return politicalGeographyWorld(SCENARIO, seed);
}

/** 1918-1920: the Ottoman Arab provinces, Hejaz, Yemen and the Caucasus. */
function dissolveOttomanAsia(world: World): void {
  const at = day(1918, 11, 1);
  const syr = FUTURE_ID.get("SYR") as Id;
  const lbn = FUTURE_ID.get("LBN") as Id;
  const irq = FUTURE_ID.get("IRQ") as Id;
  const jor = FUTURE_ID.get("JOR") as Id;
  const hej = FUTURE_ID.get("HEJ") as Id;
  const yem = FUTURE_ID.get("YEM") as Id;
  const geo = FUTURE_ID.get("GEO") as Id;
  const arm = FUTURE_ID.get("ARM") as Id;
  const aze = FUTURE_ID.get("AZE") as Id;
  transfer(world, idsOf("as-ott-lebanon"), lbn, "cession", "French mandate of Lebanon", at);
  transfer(
    world,
    idsOf("as-ott-damascus", "as-ott-syrian-coast", "as-ott-aleppo", "as-ott-urfa", "as-ott-hatay"),
    syr,
    "dissolution",
    "Arab Kingdom of Syria and the French mandate",
    at,
  );
  transfer(world, idsOf("as-ott-jerusalem", "as-ott-palestine"), 1 as Id, "transfer", "British Mandate of Palestine", at);
  transfer(world, idsOf("as-ott-transjordan"), jor, "transfer", "Emirate of Transjordan", at);
  transfer(
    world,
    idsOf("as-ott-baghdad", "as-ott-basra", "as-ott-mosul"),
    irq,
    "transfer",
    "British Mandate of Mesopotamia",
    at,
  );
  transfer(world, idsOf("as-ott-hejaz"), hej, "independence", "Kingdom of Hejaz", at);
  transfer(world, idsOf("as-ott-yemen"), yem, "independence", "Mutawakkilite Kingdom of Yemen", at);
  transfer(world, idsOf("as-ott-dodecanese"), 6 as Id, "annexation", "Italian occupation of the Dodecanese", day(1912, 5, 1));
  transfer(
    world,
    idsOf("as-rus-tiflis", "as-rus-kutais", "as-rus-batum"),
    geo,
    "independence",
    "Democratic Republic of Georgia",
    at,
  );
  transfer(world, idsOf("as-rus-erivan", "as-rus-kars"), arm, "independence", "Republic of Armenia", at);
  transfer(
    world,
    idsOf("as-rus-baku", "as-rus-elisavetpol", "as-rus-zakatala", "as-rus-nakhchivan"),
    aze,
    "independence",
    "Azerbaijan Democratic Republic",
    at,
  );
  // Mandates were legally separate polities but administered by a mandatory power.
  setProvinceControl(world, {
    provinceIds: idsOf(
      "as-ott-lebanon",
      "as-ott-syrian-coast",
      "as-ott-damascus",
      "as-ott-aleppo",
      "as-ott-urfa",
      "as-ott-hatay",
    ),
    controllerPolityId: 3 as Id,
    day: at,
    note: "French mandate administration",
    kind: "occupation",
  });
  setProvinceControl(world, {
    provinceIds: idsOf(
      "as-ott-jerusalem",
      "as-ott-palestine",
      "as-ott-transjordan",
      "as-ott-baghdad",
      "as-ott-basra",
      "as-ott-mosul",
    ),
    controllerPolityId: 1 as Id,
    day: at,
    note: "British mandate administration",
    kind: "occupation",
  });
}

/**
 * 1921-1923: Turkey settles its modern frontiers. Kars, Ardahan, Artvin and
 * IÄŸdÄ±r return to Turkey, Urfa passes from Syria to Turkey, and Afghan
 * sovereignty over the Wakhan is recognised.
 */
function settleTurkey1923(world: World): void {
  const ot = day(1923, 10, 29);
  const tur = FUTURE_ID.get("TUR") as Id;
  const remaining = world.provinces.ownership
    .filter((entry) => ASIA_IDS.has(entry.provinceId) && entry.ownerPolityId === 20)
    .map((entry) => entry.provinceId);
  transfer(world, remaining, tur, "dissolution", "Proclamation of the Republic of Turkey", ot);
  transfer(
    world,
    idsOf("as-rus-kars", "as-rus-artvin", "as-rus-igdir"),
    tur,
    "cession",
    "Kars, Ardahan, Artvin and IÄŸdÄ±r restored to Turkey",
    day(1921, 10, 13),
  );
  transfer(world, idsOf("as-ott-urfa"), tur, "cession", "Urfa and Maras restored to Turkey", day(1921, 10, 20));
  transfer(world, idsOf("as-rus-wakhan"), 29 as Id, "independence", "Afghan sovereignty over the Wakhan", day(1919, 8, 8));
}

/** 1932-1937: Manchukuo and the Japanese occupation of the Chinese coast. */
function manchukuoAndOccupation(world: World): void {
  transfer(
    world,
    idsOf("as-chn-fengtian", "as-chn-jilin", "as-chn-heilongjiang", "as-chn-xing-an"),
    FUTURE_ID.get("MAN") as Id,
    "independence",
    "Establishment of Manchukuo",
    day(1932, 3, 1),
  );
  transfer(
    world,
    idsOf("as-chn-rehe"),
    FUTURE_ID.get("MAN") as Id,
    "annexation",
    "Manchukuo annexes Rehe (Jehol)",
    day(1933, 3, 1),
  );
  setProvinceControl(world, {
    provinceIds: idsOf("as-chn-jiangsu"),
    controllerPolityId: 5 as Id,
    day: day(1937, 11, 12),
    note: "Japanese occupation of Shanghai and the lower Yangtze",
    kind: "occupation",
  });
}

/** 1945: Manchukuo and Taiwan are restored to China; Korea leaves Japan. */
function settle1945(world: World): void {
  const at = day(1945, 8, 18);
  transfer(
    world,
    idsOf(
      "as-chn-fengtian",
      "as-chn-jilin",
      "as-chn-heilongjiang",
      "as-chn-rehe",
      "as-chn-xing-an",
    ),
    FUTURE_ID.get("ROC") as Id,
    "liberation",
    "Manchukuo dissolved; sovereignty returns to China",
    at,
  );
  transfer(
    world,
    idsOf("as-twn-taihoku", "as-twn-taichung", "as-twn-tainan"),
    FUTURE_ID.get("ROC") as Id,
    "liberation",
    "Retrocession of Taiwan",
    at,
  );
  // The Republic of China succeeded the Qing on the mainland in 1912; the 1945
  // snapshot records the restoration of Chinese sovereignty over the whole
  // mainland after the Japanese surrender.
  const roc = FUTURE_ID.get("ROC") as Id;
  const remainingChina = world.provinces.ownership
    .filter((entry) => {
      if (entry.ownerPolityId !== 26) return false;
      const province = ASIA.provinces.find((candidate) => candidate.id === entry.provinceId);
      return province !== undefined && province.mapTag === "CHN";
    })
    .map((entry) => entry.provinceId);
  transfer(world, remainingChina, roc, "liberation", "Restoration of Chinese sovereignty", at);
}

/** 1948: the Korean peninsula is divided; 1949: the Chinese civil war ends. */
function divideKoreaAndChina(world: World): void {
  const at = day(1948, 8, 15);
  const prk = FUTURE_ID.get("PRK") as Id;
  const rok = FUTURE_ID.get("ROK") as Id;
  transfer(
    world,
    idsOf("as-kor-hamgyong", "as-kor-pyongan", "as-kor-hwanghae", "as-kor-north-kangwon"),
    prk,
    "dissolution",
    "Democratic People's Republic of Korea north of the 38th parallel",
    at,
  );
  transfer(
    world,
    idsOf("as-kor-gangwon", "as-kor-gyeonggi", "as-kor-chungcheong", "as-kor-jeolla", "as-kor-gyeongsang"),
    rok,
    "dissolution",
    "Republic of Korea south of the 38th parallel",
    at,
  );
  const prc = FUTURE_ID.get("PRC") as Id;
  const roc = FUTURE_ID.get("ROC") as Id;
  const rocMainland = world.provinces.ownership
    .filter((entry) => {
      if (entry.ownerPolityId !== roc) return false;
      const province = ASIA.provinces.find((candidate) => candidate.id === entry.provinceId);
      return province !== undefined && province.mapTag !== "TWN";
    })
    .map((entry) => entry.provinceId);
  transfer(
    world,
    rocMainland,
    prc,
    "dissolution",
    "People's Republic of China on the mainland",
    day(1949, 10, 1),
  );
}

/** 1947-1971: the partition of British India, Pakistan and Bangladesh. */
function partitionIndia1947(world: World): void {
  const at = day(1947, 8, 15);
  const ind = FUTURE_ID.get("IND") as Id;
  const pak = FUTURE_ID.get("PAK") as Id;
  const bgd = FUTURE_ID.get("BGD") as Id;
  const binIds = ASIA.provinces
    .filter(
      (province) =>
        province.mapTag === "BIN" &&
        province.initialOwnerTag === "GBR" &&
        !["as-bin-burma", "as-bin-shan-states", "as-bin-frontier-divisions", "as-bin-aden"].includes(
          province.key,
        ),
    )
    .map((province) => province.id);
  transfer(world, binIds, ind, "independence", "Indian independence and partition", at);
  transfer(
    world,
    idsOf("as-bin-west-punjab", "as-bin-sind", "as-bin-north-west-frontier", "as-bin-baluchistan", "as-bin-azad-kashmir"),
    pak,
    "independence",
    "Dominion of Pakistan",
    at,
  );
  transfer(world, idsOf("as-bin-eastern-bengal"), pak, "independence", "East Bengal joins Pakistan", at);
  transfer(world, idsOf("as-bin-eastern-bengal"), bgd, "independence", "Bangladesh liberation war", day(1971, 3, 26));
  transfer(world, idsOf("as-bin-aksai-chin"), 26 as Id, "annexation", "Chinese administration of Aksai Chin", day(1962, 11, 21));
}

/** 1948-1988: Israel and Palestine as separate owners of the former mandate. */
function settlePalestine(world: World): void {
  transfer(
    world,
    idsOf("as-ott-jerusalem"),
    FUTURE_ID.get("ISR") as Id,
    "independence",
    "Declaration of the State of Israel",
    day(1948, 5, 14),
  );
  transfer(
    world,
    idsOf("as-ott-palestine"),
    FUTURE_ID.get("PSE") as Id,
    "independence",
    "Declaration of the State of Palestine",
    day(1988, 11, 15),
  );
}

/** 1939: Hatay passes from French-mandate Syria to Turkey. */
function annexHatay1939(world: World): void {
  transfer(
    world,
    idsOf("as-ott-hatay"),
    FUTURE_ID.get("TUR") as Id,
    "cession",
    "Hatay joins Turkey",
    day(1939, 6, 29),
  );
}

/** 1991: the Central Asian and Caucasian republics leave the Soviet Union. */
function sovietSuccessors1991(world: World): void {
  const at = day(1991, 12, 16);
  const transfers: [Id, string[]][] = [
    [
      FUTURE_ID.get("KAZ") as Id,
      [
        "as-rus-uralsk",
        "as-rus-turgai",
        "as-rus-akmolinsk",
        "as-rus-semipalatinsk",
        "as-rus-semirechye",
        "as-rus-kazakh-syr-darya",
      ],
    ],
    [
      FUTURE_ID.get("UZB") as Id,
      [
        "as-rus-uzbek-syr-darya",
        "as-rus-fergana",
        "as-rus-samarkand",
        "as-khi-khiva",
        "as-khi-karakalpak",
        "as-buk-bukhara",
      ],
    ],
    [FUTURE_ID.get("TKM") as Id, ["as-rus-transcaspia", "as-khi-tashauz"]],
    [FUTURE_ID.get("TJK") as Id, ["as-rus-khojand", "as-buk-eastern-bukhara", "as-rus-pamir"]],
    [FUTURE_ID.get("KGZ") as Id, ["as-rus-kyrgyz-steppe", "as-rus-osh"]],
    [FUTURE_ID.get("GEO") as Id, ["as-rus-tiflis", "as-rus-kutais", "as-rus-batum"]],
    [FUTURE_ID.get("ARM") as Id, ["as-rus-erivan"]],
    [FUTURE_ID.get("AZE") as Id, ["as-rus-baku", "as-rus-elisavetpol", "as-rus-zakatala", "as-rus-nakhchivan"]],
  ];
  for (const [polityId, keys] of transfers) {
    transfer(world, idsOf(...keys), polityId, "independence", "Dissolution of the Soviet Union", at);
  }
}

describe("M12b Asia province inventory and geometry", () => {
  test("the committed bundle covers Asia with stable unique ids", () => {
    expect(ASIA.provinces.length).toBeGreaterThan(200);
    expect(new Set(ASIA.provinces.map((province) => province.id)).size).toBe(ASIA.provinces.length);
    expect(new Set(ASIA.provinces.map((province) => province.key)).size).toBe(ASIA.provinces.length);
    expect(AUDIT.duplicateProvinceIds).toBe(0);
    expect(AUDIT.duplicateKeys).toBe(0);
    expect(AUDIT.provinceCount).toBe(ASIA.provinces.length);
    expect(AUDIT.unassignedUnitCount).toBe(0);
    for (const province of ASIA.provinces) {
      expect(province.id).toBeGreaterThan(66001);
      expect(province.key.startsWith("as-")).toBe(true);
    }
  });

  test("Asia ids and keys are disjoint from the M12a European bundle", () => {
    const europeIds = new Set(EUROPE.provinces.map((province) => province.id));
    const europeKeys = new Set(EUROPE.provinces.map((province) => province.key));
    for (const province of ASIA.provinces) {
      expect(europeIds.has(province.id)).toBe(false);
      expect(europeKeys.has(province.key)).toBe(false);
    }
    const europeFuture = new Set(EUROPE.futurePolities.map((polity) => polity.polityId));
    for (const polity of ASIA.futurePolities) {
      expect(polity.polityId).toBeGreaterThanOrEqual(1100);
      expect(europeFuture.has(polity.polityId)).toBe(false);
    }
  });

  test("the required Asian 1900 owners and provinces are represented", () => {
    const owners = new Set(ASIA.provinces.map((province) => province.initialOwnerTag));
    for (const tag of [
      "OTT", "SHM", "OMN", "PER", "AFG", "NPL", "THA", "CHN", "KOR", "JPN",
      "RUS", "GBR", "FRA", "NLD", "PRT", "USA",
    ]) {
      expect(owners.has(tag)).toBe(true);
    }
    const mapTags = new Set(ASIA.provinces.map((province) => province.mapTag));
    for (const tag of [
      "OTT", "BIN", "CEY", "MAL", "SAR", "HKG", "MAC", "DEI", "FIC", "PHL",
      "PTM", "CHN", "TIB", "KOR", "JPN", "TWN", "RUS", "PER", "AFG", "NPL",
      "BHU", "THA", "OMN", "KHI", "BUK", "KUW", "TRU", "SHM", "BPO",
    ]) {
      expect(mapTags.has(tag)).toBe(true);
    }
    for (const province of ASIA.provinces) {
      // P2 (D-118): every province is an economic unit of its own; the region link is gone.
      expect(REGION_IDS.has(province.id)).toBe(true);
      expect("simulationRegionId" in province).toBe(false);
    }
  });

  test("every province has a 1900 owner, administrative metadata and provenance", () => {
    for (const province of ASIA.provinces) {
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
    for (const province of ASIA.provinces) {
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
    expect(ringCount).toBeGreaterThan(ASIA.provinces.length);
  });

  test("province borders are deduplicated open polylines", () => {
    let lineCount = 0;
    for (const border of ASIA.borders) {
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
    expect(lineCount).toBeGreaterThan(500);
  });

  test("Asian province edges become national only across current owners", () => {
    const ownerByProvinceId = new Map(
      ASIA.provinces.map((province) => [province.id, province.initialOwnerTag]),
    );
    const plan = planProvinceBorders(ASIA.borders, ownerByProvinceId);
    expect(plan.length).toBe(ASIA.borders.length);
    const bengal = idOf("as-bin-bengal");
    const easternBengal = idOf("as-bin-eastern-bengal");
    const shared = plan.filter(
      (border) =>
        (border.a === bengal && border.b === easternBengal) ||
        (border.a === easternBengal && border.b === bengal),
    );
    expect(shared.length).toBeGreaterThan(0);
    expect(shared.every((border) => border.national === false)).toBe(true);
    const changed = new Map(ownerByProvinceId);
    changed.set(easternBengal, "PAK");
    const changedPlan = planProvinceBorders(ASIA.borders, changed);
    const changedShared = changedPlan.filter(
      (border) =>
        (border.a === bengal && border.b === easternBengal) ||
        (border.a === easternBengal && border.b === bengal),
    );
    expect(changedShared.every((border) => border.national === true)).toBe(true);
  });

  test("province hit testing is zoom-independent and picks the containing province", () => {
    const decoded = ASIA.provinces.map((province) => ({
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
    expect(checked).toBeGreaterThan(ASIA.provinces.length * 0.9);
    expect(mismatches / checked).toBeLessThan(0.03);
  });

  test("the coverage audit records a complete Asian partition", () => {
    expect(AUDIT.coverage.length).toBeGreaterThan(25);
    for (const entry of AUDIT.coverage) {
      if (entry.estimated) continue;
      // Simplification leaves small coastal and frontier slivers; the underlay
      // keeps the correct 1900 owner colour so they never become foreign enclaves.
      expect(entry.residualArea).toBeLessThan(3.5);
    }
    expect(AUDIT.overlapCount).toBeLessThan(120);
    expect(AUDIT.unmatchedBorderSegments).toBeLessThan(200);
  });

  test("successor-border split provinces share continuous edges", () => {
    const pairs: [string, string][] = [
      ["as-bin-punjab", "as-bin-west-punjab"],
      ["as-bin-kashmir", "as-bin-azad-kashmir"],
      ["as-bin-kashmir", "as-bin-aksai-chin"],
      ["as-bin-azad-kashmir", "as-bin-aksai-chin"],
      ["as-ott-lebanon", "as-ott-syrian-coast"],
      ["as-ott-jerusalem", "as-ott-palestine"],
      ["as-ott-aleppo", "as-ott-urfa"],
      ["as-ott-aleppo", "as-ott-hatay"],
      ["as-kor-gangwon", "as-kor-north-kangwon"],
      ["as-rus-batum", "as-rus-artvin"],
      ["as-rus-erivan", "as-rus-igdir"],
      ["as-rus-kazakh-syr-darya", "as-rus-uzbek-syr-darya"],
      ["as-rus-fergana", "as-rus-osh"],
      ["as-rus-samarkand", "as-rus-khojand"],
      ["as-rus-pamir", "as-rus-wakhan"],
      ["as-khi-khiva", "as-khi-tashauz"],
    ];
    for (const [leftKey, rightKey] of pairs) {
      const left = idOf(leftKey);
      const right = idOf(rightKey);
      const shared = ASIA.borders.filter(
        (border) =>
          (border.a === left && border.b === right) ||
          (border.a === right && border.b === left),
      );
      expect(shared.length).toBeGreaterThan(0);
      expect(shared.reduce((sum, border) => sum + border.lines.length, 0)).toBeGreaterThan(0);
    }

    // Cross-split successor frontiers that must exist even though the two
    // provinces were already separate in 1900.
    const successorFrontiers: [string, string][] = [
      ["as-bin-west-punjab", "as-bin-sind"],
      ["as-bin-west-punjab", "as-bin-kashmir"],
      ["as-bin-eastern-bengal", "as-bin-bengal"],
      ["as-ott-lebanon", "as-ott-syrian-coast"],
      ["as-ott-damascus", "as-ott-transjordan"],
      ["as-ott-aleppo", "as-ott-baghdad"],
      ["as-ott-jerusalem", "as-ott-transjordan"],
      ["as-kor-hwanghae", "as-kor-gyeonggi"],
      ["as-kor-north-kangwon", "as-kor-gangwon"],
      ["as-rus-erivan", "as-rus-elisavetpol"],
      ["as-rus-tiflis", "as-rus-zakatala"],
      ["as-rus-kazakh-syr-darya", "as-rus-uzbek-syr-darya"],
      ["as-rus-fergana", "as-rus-osh"],
      ["as-khi-tashauz", "as-rus-transcaspia"],
      ["as-rus-pamir", "as-rus-wakhan"],
    ];
    for (const [leftKey, rightKey] of successorFrontiers) {
      const left = idOf(leftKey);
      const right = idOf(rightKey);
      const shared = ASIA.borders.some(
        (border) =>
          (border.a === left && border.b === right) ||
          (border.a === right && border.b === left),
      );
      expect(shared).toBe(true);
    }
  });

  test("the required historical subdivisions exist", () => {
    for (const key of [
      "as-ott-ankara",
      "as-ott-lebanon",
      "as-ott-syrian-coast",
      "as-ott-aleppo",
      "as-ott-urfa",
      "as-ott-hatay",
      "as-ott-baghdad",
      "as-ott-jerusalem",
      "as-ott-palestine",
      "as-ott-transjordan",
      "as-ott-hejaz",
      "as-ott-yemen",
      "as-ott-al-hasa",
      "as-per-tehran",
      "as-afg-kabul",
      "as-npl-eastern-nepal",
      "as-bhu-western-bhutan",
      "as-rus-tiflis",
      "as-rus-baku",
      "as-rus-kars",
      "as-rus-artvin",
      "as-rus-igdir",
      "as-rus-tobolsk",
      "as-rus-uralsk",
      "as-rus-kazakh-syr-darya",
      "as-rus-uzbek-syr-darya",
      "as-rus-fergana",
      "as-rus-osh",
      "as-rus-samarkand",
      "as-rus-khojand",
      "as-rus-pamir",
      "as-rus-wakhan",
      "as-khi-khiva",
      "as-khi-tashauz",
      "as-buk-bukhara",
      "as-chn-zhili",
      "as-chn-xinjiang",
      "as-chn-khalkha-mongolia",
      "as-tib-u-tsang",
      "as-chn-fengtian",
      "as-chn-jilin",
      "as-chn-heilongjiang",
      "as-chn-rehe",
      "as-chn-xing-an",
      "as-jpn-kanto",
      "as-kor-hamgyong",
      "as-kor-north-kangwon",
      "as-twn-taihoku",
      "as-bin-bengal",
      "as-bin-eastern-bengal",
      "as-bin-punjab",
      "as-bin-west-punjab",
      "as-bin-kashmir",
      "as-bin-azad-kashmir",
      "as-bin-aksai-chin",
      "as-bin-burma",
      "as-cey-western-ceylon",
      "as-mal-straits-settlements",
      "as-sar-sarawak",
      "as-hkg-hong-kong",
      "as-mac-macao",
      "as-fic-tonkin",
      "as-dei-west-java",
      "as-phl-manila-and-central-luzon",
      "as-ptm-timor",
      "as-tha-bangkok",
      "as-omn-muscat",
    ]) {
      expect(BY_KEY.has(key)).toBe(true);
    }
  });
});

describe("M12b authoritative provincial ownership", () => {
  test("the 1900 world starts with one ownership record per combined province", () => {
    const world = referenceWorld(20_260_201);
    assertValidWorld(world);
    expect(world.provinces.enabled).toBe(true);
    expect(world.provinces.ownership.length).toBe(DEFINITIONS.size);
    for (const province of ASIA.provinces) {
      const entry = ownershipOf(world, province.key);
      expect(entry?.ownerPolityId).toBe(province.initialOwnerPolityId);
      expect(entry?.controllerPolityId).toBe(province.initialOwnerPolityId);
      expect(entry?.claimantPolityIds).toEqual([]);
    }
  });

  test("ownership transfers preserve province ids and geometry references", () => {
    const world = referenceWorld();
    const bengal = BY_KEY.get("as-bin-bengal");
    if (bengal === undefined) throw new Error("missing as-bin-bengal");
    transfer(world, [idOf("as-bin-bengal")], FUTURE_ID.get("IND") as Id, "independence", "Indian independence", day(1947, 8, 15));
    expect(ownerOf(world, "as-bin-bengal")).toBe(FUTURE_ID.get("IND"));
    expect(controllerOf(world, "as-bin-bengal")).toBe(FUTURE_ID.get("IND"));
    const definition = DEFINITIONS.get(idOf("as-bin-bengal"));
    expect(definition?.key).toBe("as-bin-bengal");
    expect(decodeProvinceGeometry(bengal).path).not.toBeNull();
  });

  test("occupation changes control without changing legal ownership", () => {
    const world = referenceWorld();
    setProvinceControl(world, {
      provinceIds: [idOf("as-bin-bombay")],
      controllerPolityId: 5 as Id,
      day: day(1942, 4, 1),
      note: "Japanese naval pressure in the Indian Ocean",
      kind: "occupation",
    });
    expect(ownerOf(world, "as-bin-bombay")).toBe(1);
    expect(controllerOf(world, "as-bin-bombay")).toBe(5);
    expect(ownershipOf(world, "as-bin-bombay")?.specialStatus).toBe("occupied");
    setProvinceControl(world, {
      provinceIds: [idOf("as-bin-bombay")],
      controllerPolityId: null,
      day: day(1945, 9, 2),
      note: "British control restored",
      kind: "liberation",
    });
    expect(ownerOf(world, "as-bin-bombay")).toBe(1);
    expect(controllerOf(world, "as-bin-bombay")).toBe(1);
  });

  test("claims never imply ownership and survive transfers deterministically", () => {
    const world = referenceWorld();
    const kashmir = idOf("as-bin-kashmir");
    addProvinceClaim(world, kashmir, FUTURE_ID.get("IND") as Id);
    expect(ownershipOf(world, "as-bin-kashmir")?.ownerPolityId).toBe(1);
    expect(ownershipOf(world, "as-bin-kashmir")?.claimantPolityIds).toEqual([
      FUTURE_ID.get("IND") as Id,
    ]);
    transfer(world, [kashmir], FUTURE_ID.get("PAK") as Id, "cession", "Accession dispute", day(1947, 10, 1));
    const entry = ownershipOf(world, "as-bin-kashmir");
    expect(entry?.ownerPolityId).toBe(FUTURE_ID.get("PAK"));
    expect(entry?.claimantPolityIds).toEqual([FUTURE_ID.get("IND") as Id]);
  });

  test("mandate and autonomy status are explicit and survive a transfer", () => {
    const world = referenceWorld();
    translateLebanon(world);
    expect(ownershipOf(world, "as-ott-lebanon")?.specialStatus).toBe("mandate");
    expect(ownershipOf(world, "as-bin-hyderabad")?.specialStatus).toBe("autonomous");
  });
});

function translateLebanon(world: World): void {
  transfer(world, [idOf("as-ott-lebanon")], FUTURE_ID.get("LBN") as Id, "dissolution", "State of Greater Lebanon", day(1920, 9, 1));
  setProvinceSpecialStatus(world, idOf("as-ott-lebanon"), "mandate");
}

describe("M12b historical reference snapshots", () => {
  test("1918-1920 partitions Ottoman Asia into mandates and successor states", () => {
    const world = referenceWorld();
    dissolveOttomanAsia(world);
    expect(ownerOf(world, "as-ott-lebanon")).toBe(FUTURE_ID.get("LBN"));
    expect(controllerOf(world, "as-ott-lebanon")).toBe(3);
    expect(ownerOf(world, "as-ott-syrian-coast")).toBe(FUTURE_ID.get("SYR"));
    expect(ownerOf(world, "as-ott-damascus")).toBe(FUTURE_ID.get("SYR"));
    expect(ownerOf(world, "as-ott-aleppo")).toBe(FUTURE_ID.get("SYR"));
    expect(ownerOf(world, "as-ott-urfa")).toBe(FUTURE_ID.get("SYR"));
    expect(ownerOf(world, "as-ott-hatay")).toBe(FUTURE_ID.get("SYR"));
    expect(ownerOf(world, "as-ott-jerusalem")).toBe(1);
    expect(ownerOf(world, "as-ott-palestine")).toBe(1);
    expect(ownerOf(world, "as-ott-transjordan")).toBe(FUTURE_ID.get("JOR"));
    expect(ownerOf(world, "as-ott-baghdad")).toBe(FUTURE_ID.get("IRQ"));
    expect(ownerOf(world, "as-ott-hejaz")).toBe(FUTURE_ID.get("HEJ"));
    expect(ownerOf(world, "as-ott-yemen")).toBe(FUTURE_ID.get("YEM"));
    expect(ownerOf(world, "as-rus-tiflis")).toBe(FUTURE_ID.get("GEO"));
    expect(ownerOf(world, "as-rus-erivan")).toBe(FUTURE_ID.get("ARM"));
    expect(ownerOf(world, "as-rus-baku")).toBe(FUTURE_ID.get("AZE"));
    settleTurkey1923(world);
    expect(ownerOf(world, "as-ott-ankara")).toBe(FUTURE_ID.get("TUR"));
    expect(ownerOf(world, "as-ott-van")).toBe(FUTURE_ID.get("TUR"));
    // The 1923 settlement gives Turkey its modern eastern and south-eastern
    // frontier; Hatay stays in Syria until 1939.
    expect(ownerOf(world, "as-rus-kars")).toBe(FUTURE_ID.get("TUR"));
    expect(ownerOf(world, "as-rus-artvin")).toBe(FUTURE_ID.get("TUR"));
    expect(ownerOf(world, "as-rus-igdir")).toBe(FUTURE_ID.get("TUR"));
    expect(ownerOf(world, "as-ott-urfa")).toBe(FUTURE_ID.get("TUR"));
    expect(ownerOf(world, "as-ott-hatay")).toBe(FUTURE_ID.get("SYR"));
    expect(ownerOf(world, "as-rus-wakhan")).toBe(29);
    expect(
      world.provinces.ownership.filter(
        (entry) => ASIA_IDS.has(entry.provinceId) && entry.ownerPolityId === 20,
      ),
    ).toEqual([]);
  });

  test("1932-1939 Manchukuo and the Japanese occupation are ordinary transfers", () => {
    const world = referenceWorld();
    manchukuoAndOccupation(world);
    expect(ownerOf(world, "as-chn-fengtian")).toBe(FUTURE_ID.get("MAN"));
    expect(ownerOf(world, "as-chn-jilin")).toBe(FUTURE_ID.get("MAN"));
    expect(ownerOf(world, "as-chn-heilongjiang")).toBe(FUTURE_ID.get("MAN"));
    expect(ownerOf(world, "as-chn-rehe")).toBe(FUTURE_ID.get("MAN"));
    expect(ownerOf(world, "as-chn-xing-an")).toBe(FUTURE_ID.get("MAN"));
    expect(ownerOf(world, "as-chn-zhili")).toBe(26);
    expect(ownerOf(world, "as-chn-jiangsu")).toBe(26);
    expect(controllerOf(world, "as-chn-jiangsu")).toBe(5);
    expect(ownershipOf(world, "as-chn-jiangsu")?.specialStatus).toBe("occupied");
  });

  test("1945 restores Manchuria and Taiwan and leaves Korea as one polity", () => {
    const world = referenceWorld();
    manchukuoAndOccupation(world);
    settle1945(world);
    expect(ownerOf(world, "as-chn-fengtian")).toBe(FUTURE_ID.get("ROC"));
    expect(ownerOf(world, "as-chn-rehe")).toBe(FUTURE_ID.get("ROC"));
    expect(ownerOf(world, "as-chn-xing-an")).toBe(FUTURE_ID.get("ROC"));
    expect(ownerOf(world, "as-twn-taihoku")).toBe(FUTURE_ID.get("ROC"));
    expect(ownerOf(world, "as-kor-hamgyong")).toBe(27);
    expect(ownerOf(world, "as-kor-gyeonggi")).toBe(27);
    expect(
      world.provinces.ownership.filter(
        (entry) =>
          ASIA_IDS.has(entry.provinceId) &&
          entry.ownerPolityId === 5 &&
          ASIA.provinces.find((province) => province.id === entry.provinceId)?.mapTag === "TWN",
      ),
    ).toEqual([]);
  });

  test("1948-1949 divide Korea and China along the historical lines", () => {
    const world = referenceWorld();
    manchukuoAndOccupation(world);
    settle1945(world);
    divideKoreaAndChina(world);
    expect(ownerOf(world, "as-kor-hamgyong")).toBe(FUTURE_ID.get("PRK"));
    expect(ownerOf(world, "as-kor-north-kangwon")).toBe(FUTURE_ID.get("PRK"));
    expect(ownerOf(world, "as-kor-gangwon")).toBe(FUTURE_ID.get("ROK"));
    expect(ownerOf(world, "as-kor-gyeonggi")).toBe(FUTURE_ID.get("ROK"));
    expect(ownerOf(world, "as-chn-zhili")).toBe(FUTURE_ID.get("PRC"));
    expect(ownerOf(world, "as-twn-taihoku")).toBe(FUTURE_ID.get("ROC"));
    expect(ownerOf(world, "as-twn-tainan")).toBe(FUTURE_ID.get("ROC"));
  });

  test("1991 creates the Central Asian and Caucasian republics on split provinces", () => {
    const world = referenceWorld();
    sovietSuccessors1991(world);
    expect(ownerOf(world, "as-rus-uralsk")).toBe(FUTURE_ID.get("KAZ"));
    expect(ownerOf(world, "as-rus-kazakh-syr-darya")).toBe(FUTURE_ID.get("KAZ"));
    expect(ownerOf(world, "as-rus-uzbek-syr-darya")).toBe(FUTURE_ID.get("UZB"));
    expect(ownerOf(world, "as-rus-fergana")).toBe(FUTURE_ID.get("UZB"));
    expect(ownerOf(world, "as-rus-osh")).toBe(FUTURE_ID.get("KGZ"));
    expect(ownerOf(world, "as-rus-samarkand")).toBe(FUTURE_ID.get("UZB"));
    expect(ownerOf(world, "as-rus-khojand")).toBe(FUTURE_ID.get("TJK"));
    expect(ownerOf(world, "as-rus-transcaspia")).toBe(FUTURE_ID.get("TKM"));
    expect(ownerOf(world, "as-khi-tashauz")).toBe(FUTURE_ID.get("TKM"));
    expect(ownerOf(world, "as-rus-pamir")).toBe(FUTURE_ID.get("TJK"));
    expect(ownerOf(world, "as-rus-kyrgyz-steppe")).toBe(FUTURE_ID.get("KGZ"));
    expect(ownerOf(world, "as-rus-tiflis")).toBe(FUTURE_ID.get("GEO"));
    expect(ownerOf(world, "as-rus-erivan")).toBe(FUTURE_ID.get("ARM"));
    expect(ownerOf(world, "as-rus-kars")).not.toBe(FUTURE_ID.get("ARM"));
    expect(ownerOf(world, "as-rus-baku")).toBe(FUTURE_ID.get("AZE"));
    // The Russian core in Siberia remains Russian.
    expect(ownerOf(world, "as-rus-tobolsk")).toBe(4);
    expect(ownerOf(world, "as-rus-yakutsk")).toBe(4);
    // No Central Asian or Caucasian province is left to Russia.
    const russianCentralAsia = world.provinces.ownership.filter((entry) => {
      if (entry.ownerPolityId !== 4) return false;
      const province = ASIA.provinces.find((candidate) => candidate.id === entry.provinceId);
      return province !== undefined && /^as-(rus-(uralsk|turgai|akmolinsk|semipalatinsk|semirechye|kazakh-syr|uzbek-syr|fergana|osh|samarkand|khojand|pamir|kyrgyz|transcaspia|tiflis|kutais|batum|erivan|baku|elisavetpol|zakatala|nakhchivan)|khi-)/u.test(province.key);
    });
    expect(russianCentralAsia).toEqual([]);
  });

  test("M12a European provinces already allow Ukraine and its neighbours", () => {
    const world = referenceWorld();
    const ukr = 1014 as Id; // M12a Europe future polity: Ukraine
    const blr = 1015 as Id; // M12a Europe future polity: Belarus
    const mda = 1016 as Id; // M12a Europe future polity: Moldova
    const ukrainian = EUROPE.provinces
      .filter((province) => province.initialOwnerTag === "RUS" && province.key.startsWith("rus-ukr-"))
      .map((province) => province.id);
    const belarusian = EUROPE.provinces
      .filter((province) => province.initialOwnerTag === "RUS" && province.key.startsWith("rus-blr-"))
      .map((province) => province.id);
    const moldovan = EUROPE.provinces
      .filter((province) => province.initialOwnerTag === "RUS" && province.key.startsWith("rus-mda-"))
      .map((province) => province.id);
    transfer(world, ukrainian, ukr, "independence", "Ukrainian independence", day(1991, 8, 24));
    transfer(world, belarusian, blr, "independence", "Belarusian independence", day(1991, 8, 25));
    transfer(world, moldovan, mda, "independence", "Moldovan independence", day(1991, 8, 27));
    const ownerById = (id: Id): Id | undefined =>
      world.provinces.ownership.find((entry) => entry.provinceId === id)?.ownerPolityId;
    expect(ownerById(EUROPE.provinces.find((province) => province.key === "rus-ukr-kiev")?.id as Id)).toBe(ukr);
    expect(ownerById(EUROPE.provinces.find((province) => province.key === "rus-blr-minsk")?.id as Id)).toBe(blr);
    expect(ownerById(EUROPE.provinces.find((province) => province.key === "rus-mda-kishinev")?.id as Id)).toBe(mda);
    expect(ownerById(EUROPE.provinces.find((province) => province.key === "rus-moscow")?.id as Id)).toBe(4);
  });

  test("1938-1939 alternative configurations remain possible", () => {
    const world = referenceWorld();
    manchukuoAndOccupation(world);
    // A negotiated restoration is an ordinary transfer with no special case.
    transfer(
      world,
      idsOf(
        "as-chn-fengtian",
        "as-chn-jilin",
        "as-chn-heilongjiang",
        "as-chn-rehe",
        "as-chn-xing-an",
      ),
      26 as Id,
      "cession",
      "Alternative negotiated restoration of Manchuria",
      day(1939, 9, 1),
    );
    expect(ownerOf(world, "as-chn-fengtian")).toBe(26);
  });

  test("1939 Hatay can pass from Syria to Turkey without moving any polygon", () => {
    const world = referenceWorld();
    dissolveOttomanAsia(world);
    settleTurkey1923(world);
    annexHatay1939(world);
    expect(ownerOf(world, "as-ott-hatay")).toBe(FUTURE_ID.get("TUR"));
    expect(ownerOf(world, "as-ott-aleppo")).toBe(FUTURE_ID.get("SYR"));
  });

  test("1947-1971 partition creates Pakistan, India and Bangladesh", () => {
    const world = referenceWorld();
    partitionIndia1947(world);
    expect(ownerOf(world, "as-bin-west-punjab")).toBe(FUTURE_ID.get("PAK"));
    expect(ownerOf(world, "as-bin-punjab")).toBe(FUTURE_ID.get("IND"));
    expect(ownerOf(world, "as-bin-sind")).toBe(FUTURE_ID.get("PAK"));
    expect(ownerOf(world, "as-bin-north-west-frontier")).toBe(FUTURE_ID.get("PAK"));
    expect(ownerOf(world, "as-bin-baluchistan")).toBe(FUTURE_ID.get("PAK"));
    expect(ownerOf(world, "as-bin-azad-kashmir")).toBe(FUTURE_ID.get("PAK"));
    expect(ownerOf(world, "as-bin-kashmir")).toBe(FUTURE_ID.get("IND"));
    expect(ownerOf(world, "as-bin-bengal")).toBe(FUTURE_ID.get("IND"));
    expect(ownerOf(world, "as-bin-eastern-bengal")).toBe(FUTURE_ID.get("BGD"));
    expect(ownerOf(world, "as-bin-aksai-chin")).toBe(26);
    // The two Punjabs and the two Kashmirs are independent provinces, which is
    // what makes the Radcliffe and ceasefire lines representable at all.
    expect(idOf("as-bin-punjab")).not.toBe(idOf("as-bin-west-punjab"));
    expect(idOf("as-bin-kashmir")).not.toBe(idOf("as-bin-azad-kashmir"));
  });

  test("1948-1988 Israel and Palestine can own separate provinces", () => {
    const world = referenceWorld();
    settlePalestine(world);
    expect(ownerOf(world, "as-ott-jerusalem")).toBe(FUTURE_ID.get("ISR"));
    expect(ownerOf(world, "as-ott-palestine")).toBe(FUTURE_ID.get("PSE"));
    expect(idOf("as-ott-jerusalem")).not.toBe(idOf("as-ott-palestine"));
  });
});

describe("M12b persistence and determinism", () => {
  test("save/load round-trips Asian ownership, control, claims and history", () => {
    const world = referenceWorld(9_001);
    dissolveOttomanAsia(world);
    setProvinceSpecialStatus(world, idOf("as-ott-lebanon"), "mandate");
    addProvinceClaim(world, idOf("as-bin-kashmir"), FUTURE_ID.get("IND") as Id);
    const serialized = serializeWorld(world);
    const restored = deserializeWorld(serialized);
    assertValidWorld(restored);
    expect(restored.provinces).toEqual(world.provinces);
    expect(hashWorld(restored)).toBe(hashWorld(world));
    expect(ownerOf(restored, "as-ott-lebanon")).toBe(FUTURE_ID.get("LBN"));
    expect(ownerOf(restored, "as-rus-baku")).toBe(FUTURE_ID.get("AZE"));
  });

  test("identical sequences produce the identical world hash", () => {
    const left = referenceWorld(321);
    const right = referenceWorld(321);
    for (const world of [left, right]) {
      manchukuoAndOccupation(world);
      settle1945(world);
      divideKoreaAndChina(world);
      sovietSuccessors1991(world);
    }
    expect(hashWorld(left)).toBe(hashWorld(right));
  });

  test("different transfer orders produce a different history", () => {
    const left = referenceWorld(654);
    const right = referenceWorld(654);
    transfer(left, [idOf("as-ott-hejaz")], FUTURE_ID.get("HEJ") as Id, "independence", "Hejaz first", day(1916, 6, 10));
    transfer(left, [idOf("as-ott-yemen")], FUTURE_ID.get("YEM") as Id, "independence", "Yemen second", day(1918, 10, 30));
    transfer(right, [idOf("as-ott-yemen")], FUTURE_ID.get("YEM") as Id, "independence", "Yemen first", day(1918, 10, 30));
    transfer(right, [idOf("as-ott-hejaz")], FUTURE_ID.get("HEJ") as Id, "independence", "Hejaz second", day(1916, 6, 10));
    expect(ownerOf(left, "as-ott-hejaz")).toBe(FUTURE_ID.get("HEJ"));
    expect(ownerOf(left, "as-ott-yemen")).toBe(FUTURE_ID.get("YEM"));
    expect(hashWorld(left)).not.toBe(hashWorld(right));
  });

  test("the scenario still builds after the combined bundle is attached", () => {
    const scenario: EconomyScenarioDef = loadM11World();
    const world = createEconomyWorld(scenario, { seed: 1 });
    assertValidWorld(world);
    expect(world.provinces.ownership.length).toBe(scenario.provinces?.definitions.length);
  });
});


