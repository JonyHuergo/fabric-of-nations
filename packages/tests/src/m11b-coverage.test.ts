/**
 * M11b 1900 catalog coverage audit.
 *
 * Reconciles the researched independent-state inventory against the canonical
 * catalog, verifies that every pre-existing polity kept its stable ID, checks
 * the new countries' map and picker integration, and verifies the five old
 * monogram cases are resolved.
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadM11World } from "@century/data";
import {
  createEconomyWorld,
  deserializeWorld,
  serializeWorld,
} from "@century/sim";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");
const DATA = join(ROOT, "packages/data/data/historical/m11");
const APP = join(ROOT, "packages/app");

interface CatalogEntry {
  id: number;
  tag: string;
  name: string;
  kind: "state" | "territory";
  status: string;
  sovereignTag: string | null;
  selectable: boolean;
  capital: { name: string; lat: number; lon: number };
  market: string | null;
  markerOnly?: boolean;
}

const catalog = JSON.parse(readFileSync(join(DATA, "polities_1900.json"), "utf8")) as {
  states: CatalogEntry[];
  territories: CatalogEntry[];
  markets: { id: number; key: string }[];
};
const map = JSON.parse(
  readFileSync(join(ROOT, "packages/data/data/map/world_map_1900.json"), "utf8"),
) as {
  polities: {
    tag: string;
    kind: string;
    rings: number[][];
    label: [number, number];
    markerOnly?: boolean;
    approximate?: string;
  }[];
};
const oldCatalog = JSON.parse(
  readFileSync(join(HERE, "fixtures/m11-catalog-v1.json"), "utf8"),
) as { id: number; tag: string; kind: string }[];
const flags = JSON.parse(readFileSync(join(DATA, "flags_1900.json"), "utf8")) as {
  flags: Record<string, { sourceType: string; flagKind?: string }>;
  polities: Record<string, { tag: string; flag: string | null; basis: string; fallbackReason?: string }>;
  meta: { flagKinds?: Record<string, string> };
};
const coverageDoc = readFileSync(join(ROOT, "docs/1900_CATALOG_COVERAGE.md"), "utf8");
const appCatalogSource = readFileSync(join(APP, "src/generated/worldCatalog.ts"), "utf8");
const mapSource = readFileSync(join(APP, "src/generated/worldMap1900.ts"), "utf8");
const pickerSource = readFileSync(join(APP, "src/screens/CountrySelectionScreen.tsx"), "utf8");
const menuSource = readFileSync(join(APP, "src/screens/MainMenuScreen.tsx"), "utf8");

const all = [...catalog.states, ...catalog.territories];
const byId = new Map(all.map((entry) => [entry.id, entry]));
const byTag = new Map(all.map((entry) => [entry.tag, entry]));
const mapByTag = new Map(map.polities.map((entry) => [entry.tag, entry]));

const EXPECTED_INDEPENDENT = [
  // Europe
  "AND", "AUT", "BEL", "DNK", "FRA", "DEU", "GRC", "ITA", "LIE", "LUX", "MCO",
  "MNT", "NLD", "OTT", "PRT", "ROM", "RUS", "SMR", "SRB", "ESP", "SWE", "CHE",
  "GBR",
  // Asia
  "AFG", "CHN", "JPN", "KOR", "NPL", "OMN", "PER", "THA", "SHM",
  // Africa
  "ETH", "LBR", "MAR", "ORF", "ZAR", "SOK", "WAD", "DAR",
  // Americas
  "USA", "MEX", "GUA", "HON", "SAL", "NIC", "COS", "COL", "VEN", "ECU", "PRU",
  "BOL", "CHL", "ARG", "URY", "PRY", "BRA", "HTI", "DOM",
  // Oceania
  "TON",
].sort();

const ADDED_STATES = ["AUT", "TON", "SOK", "WAD", "DAR", "SHM", "CRT"];
const ADDED_TERRITORIES = ["TIB", "KHI", "BUK", "SAR"];
const ADDED_INDEPENDENT = ["AUT", "TON", "SOK", "WAD", "DAR", "SHM"];

function flagKind(id: string): string {
  return flags.flags[id]?.flagKind ?? flags.meta.flagKinds?.[id] ?? "exact-national";
}

function polityFlag(tag: string) {
  const entry = byTag.get(tag);
  if (entry === undefined) throw new Error(`missing polity ${tag}`);
  const flag = flags.polities[String(entry.id)];
  if (flag === undefined) throw new Error(`missing flag mapping for ${tag}`);
  return flag;
}

describe("M11b catalog coverage — inventory reconciliation", () => {
  test("all 60 researched independent countries are present and selectable", () => {
    const independent = catalog.states
      .filter((state) => state.status === "independent")
      .map((state) => state.tag)
      .sort();
    expect(independent).toEqual(EXPECTED_INDEPENDENT);
    expect(independent).toHaveLength(60);
    for (const tag of independent) {
      const entry = byTag.get(tag);
      expect(entry?.kind).toBe("state");
      expect(entry?.selectable).toBe(true);
    }
  });

  test("the new independent countries are exactly the six added states", () => {
    const before = new Set(
      oldCatalog.filter((entry) => entry.kind === "state").map((entry) => entry.tag),
    );
    const added = catalog.states
      .filter((state) => !before.has(state.tag))
      .map((state) => state.tag)
      .sort();
    expect(added).toEqual([...ADDED_INDEPENDENT, "CRT"].sort());
    for (const tag of ADDED_INDEPENDENT) {
      const entry = byTag.get(tag);
      expect(entry?.status).toBe("independent");
      expect(entry?.selectable).toBe(true);
      expect(coverageDoc).toContain(tag);
    }
    // Crete is a self-governing autonomous state, not one of the independent six.
    expect(byTag.get("CRT")?.status).toBe("autonomous-vassal");
  });

  test("all 122 pre-existing polities keep their stable ID and tag", () => {
    expect(oldCatalog).toHaveLength(122);
    for (const old of oldCatalog) {
      const current = byId.get(old.id);
      expect({ id: old.id, tag: current?.tag, kind: current?.kind }).toEqual(old);
    }
    const newStateIds = catalog.states
      .filter((state) => !oldCatalog.some((old) => old.id === state.id))
      .map((state) => state.id)
      .sort((left, right) => left - right);
    const newTerritoryIds = catalog.territories
      .filter((territory) => !oldCatalog.some((old) => old.id === territory.id))
      .map((territory) => territory.id)
      .sort((left, right) => left - right);
    expect(newStateIds).toEqual([60, 61, 62, 63, 64, 65, 66]);
    expect(newTerritoryIds).toEqual([162, 163, 164, 165]);
  });

  test("the final catalog totals and status classification are consistent", () => {
    expect(catalog.states).toHaveLength(67);
    expect(catalog.territories).toHaveLength(66);
    expect(catalog.markets).toHaveLength(20);
    expect(all).toHaveLength(133);
    expect(catalog.states.filter((state) => state.selectable)).toHaveLength(66);
    expect(new Set(all.map((entry) => entry.id)).size).toBe(133);
    expect(new Set(all.map((entry) => entry.tag)).size).toBe(133);
    for (const territory of catalog.territories) {
      expect(territory.selectable).toBe(false);
      expect(territory.status).not.toBe("independent");
      expect(byTag.has(territory.sovereignTag ?? "")).toBe(true);
    }
  });
});

describe("M11b catalog coverage — map and picker integration", () => {
  test("every catalogued polity is in the map bundle and every map entry is catalogued", () => {
    expect(map.polities).toHaveLength(133);
    expect(new Set(map.polities.map((entry) => entry.tag)).size).toBe(133);
    for (const entry of all) {
      expect(mapByTag.has(entry.tag)).toBe(true);
    }
    for (const old of oldCatalog) {
      expect(mapByTag.has(old.tag)).toBe(true);
    }
  });

  test("Austria-Hungary has a real polygon and the new small polities are markers", () => {
    const austria = mapByTag.get("AUT");
    expect(austria?.rings.length ?? 0).toBeGreaterThan(0);
    expect(austria?.markerOnly).toBeUndefined();
    for (const tag of ["TON", "SOK", "WAD", "DAR", "SHM", "CRT", "TIB", "KHI", "BUK", "SAR"]) {
      const entry = byTag.get(tag);
      const mapEntry = mapByTag.get(tag);
      expect(mapEntry?.markerOnly).toBe(true);
      expect(mapEntry?.rings).toEqual([]);
      expect(mapEntry?.label[0]).toBeCloseTo(entry?.capital.lon ?? 0, 3);
      expect(mapEntry?.label[1]).toBeCloseTo(entry?.capital.lat ?? 0, 3);
      expect(mapEntry?.approximate).toMatch(/marker-only approximation/);
    }
  });

  test("the generated app catalog and map include every new polity", () => {
    for (const tag of [...ADDED_STATES, ...ADDED_TERRITORIES]) {
      expect(appCatalogSource).toContain(`"tag": "${tag}"`);
      expect(mapSource).toContain(`"tag":"${tag}"`);
    }
    expect(appCatalogSource).toContain("Austro-Hungarian Monarchy");
    expect(appCatalogSource).toContain("Sokoto Caliphate");
    expect(appCatalogSource).toContain("Kingdom of Tonga");
  });

  test("the picker and menu are data-driven and expose the new counts", () => {
    expect(pickerSource).toContain("catalog.entries");
    expect(pickerSource).toContain("catalog.entries.filter((entry) => entry.selectable).length");
    expect(pickerSource).toContain("kind === \"territory\"");
    expect(pickerSource).not.toContain("Fifty-nine");
    expect(pickerSource).not.toContain("62 dependent territories");
    expect(menuSource).toContain("String(playable)");
    expect(menuSource).not.toContain("Fifty-nine");
  });
});

describe("M11b catalog coverage — dependencies, flags and saves", () => {
  test("every new dependency has the correct sovereign and remains non-selectable", () => {
    const expected: Record<string, string> = {
      TIB: "CHN",
      KHI: "RUS",
      BUK: "RUS",
      SAR: "GBR",
    };
    for (const [tag, sovereign] of Object.entries(expected)) {
      const entry = byTag.get(tag);
      expect(entry?.kind).toBe("territory");
      expect(entry?.selectable).toBe(false);
      expect(entry?.sovereignTag).toBe(sovereign);
      expect(polityFlag(tag).basis).toBe("sovereign-flag");
    }
  });

  test("the five M11 monogram cases are resolved and only Wadai/Darfur remain", () => {
    const fallbacks = Object.entries(flags.polities)
      .filter(([, entry]) => entry.flag === null)
      .map(([, entry]) => entry.tag)
      .sort();
    expect(fallbacks).toEqual(["DAR", "WAD"]);
    for (const tag of ["ESP", "SAH", "SGG", "MNT", "ZAR"]) {
      expect(polityFlag(tag).flag).not.toBeNull();
    }
    expect(polityFlag("AUT").flag).toBe("austria-hungary-civil-ensign");
    expect(flagKind("austria-hungary-civil-ensign")).toBe("representative-common-ensign");
    expect(flagKind("spain-restoration")).toBe("project-reconstruction");
    expect(flagKind("transvaal-vierkleur")).toBe("project-reconstruction");
    expect(flags.flags["spain-restoration"]?.sourceType).toBe("project");
    expect(flags.flags["transvaal-vierkleur"]?.sourceType).toBe("project");
    expect(coverageDoc).toContain("monogram fallbacks are");
  });

  test("the expanded scenario initializes, and old and new player countries survive a save round trip", () => {
    const scenario = loadM11World();
    const oldPlayer = byTag.get("USA")?.id ?? 0;
    const newPlayer = byTag.get("AUT")?.id ?? 60;
    for (const playerCountryId of [oldPlayer, newPlayer]) {
      const custom = { ...scenario, playerCountryId };
      const world = createEconomyWorld(custom, { seed: 11 });
      expect(world.countries).toHaveLength(67);
      expect(world.regions).toHaveLength(133);
      expect(world.playerCountryId).toBe(playerCountryId);
      const restored = deserializeWorld(serializeWorld(world));
      expect(restored.playerCountryId).toBe(playerCountryId);
      expect(restored.countries).toHaveLength(67);
      expect(restored.regions).toHaveLength(133);
    }
  });
});
