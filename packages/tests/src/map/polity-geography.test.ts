/**
 * M11c historical geography, border reconstruction and final representation
 * audit.
 *
 * These tests are deliberately data-driven: they read the committed map bundle,
 * the catalog, the authored transfer/provenance file and the generated audit
 * report. No network access is required.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../../..");
const DATA = join(ROOT, "packages/data/data");
const MAP_PATH = join(DATA, "map/world_map_1900.json");
const AUDIT_PATH = join(DATA, "map/world_map_1900_audit.json");
const CATALOG_PATH = join(DATA, "historical/m11/polities_1900.json");
const BOUNDARIES_PATH = join(DATA, "historical/m11/boundaries_1900.json");

interface MapPolity {
  tag: string;
  kind: string;
  rings: number[][];
  holes: number[];
  area: number;
  bbox: number[];
  label: [number, number];
  small: boolean;
  markerOnly?: boolean;
  approximate?: string;
  provenance: {
    polityId: number;
    tag: string;
    historicalName: string;
    referenceDate: string;
    boundarySources: { id: string; title: string; url: string; license: string; date: string }[];
    geometryClass: string;
    confidence: string;
    underlyingBoundaryDate: string;
    deviationsFromModern: string;
    knownUncertainties: string;
    notes: string;
    transferIds: string[];
    components?: { name: string; adminStatus: string; confidence: string; notes: string }[];
  };
}

interface MapData {
  meta: {
    referenceDate: string;
    provenanceCount: number;
    transferCount: number;
    resolvedOverlaps: number;
    boundaryVersion: string;
    disputedAreaCount: number;
    resolvedDisputeCount: number;
    overlapResolutionCount: number;
  };
  boundarySources: { id: string; title: string; url: string; license: string; date: string; notes: string }[];
  land: number[][];
  resolvedDisputes: {
    id: string;
    name: string;
    strategy: string;
    components: {
      modernCode: string | null;
      modernName: string;
      targetTag: string;
      areaDegreesSquared: number;
    }[];
    sources: string[];
  }[];
  disputedAreas: {
    id: string;
    name: string;
    classification: string;
    referenceDate: string;
    confidence: string;
    rings: number[][];
    holes: number[];
    area: number;
    bbox: number[];
    label: [number, number];
    provenance: {
      sovereigntyClaims: string[];
      administration: string;
      sources: { id: string; title: string; url: string; license: string; date: string }[];
      notes: string;
    };
  }[];
  overlapResolutions: {
    pair: [string, string];
    areaBeforeDegreesSquared: number;
    intersectionBbox: number[];
    decision: string;
    historicalNote: string;
    sourceIds: string[];
  }[];
  polities: MapPolity[];
}

interface CatalogEntry {
  id: number;
  tag: string;
  name: string;
  kind: string;
  status: string;
  geometry: string[];
  markerOnly?: boolean;
}

interface Catalog {
  states: CatalogEntry[];
  territories: CatalogEntry[];
}

interface Boundaries {
  meta: {
    referenceDate: string;
    version: string;
    confidenceDefinitions: Record<string, string>;
    geometryClasses: Record<string, string>;
    sourceRegistry: { id: string; title: string; url: string; license: string }[];
  };
  patches: {
    id: string;
    description: string;
    to: string | null;
    from: string[];
    confidence: string;
    sourceIds: string[];
    notes: string;
  }[];
  provenance: Record<
    string,
    {
      polityId: number;
      tag: string;
      historicalName: string;
      referenceDate: string;
      boundarySources: { id: string }[];
      geometryClass: string;
      confidence: string;
      deviationsFromModern: string;
      knownUncertainties: string;
      notes: string;
      transferIds: string[];
      components?: { name: string }[];
    }
  >;
}

interface Audit {
  summary: {
    polities: number;
    markerOnly: number;
    provenanceCount: number;
    invalidRings: number;
    overlaps: number;
    largestOverlapDegreesSquared: number;
    disputedAreas: number;
    disputedAreaDegreesSquared: number;
    disputedOverlaps: number;
    unassignedSamples: number;
    unassignedComponents: number;
    largestUnassignedComponent: number;
    polygonUnassignedAreaDegreesSquared: number;
    intentionalUnassignedAreaDegreesSquared: number;
    generalizationSliverAreaDegreesSquared: number;
    generalizationSliverComponents: number;
    unexplainedUnassignedAreaDegreesSquared: number;
    unexplainedUnassignedComponents: number;
  };
  overlaps: { a: string; b: string; area: number }[];
  disputedOverlaps: { polity: string; disputed: string; area: number | null }[];
  invalidRings: unknown[];
  coverage: {
    unassignedSamples: number[][];
    components: { samples: number; bbox: number[] }[];
    polygon: {
      intentionalAreas?: { area: number; bbox: number[]; reason: string }[];
      unexplainedAreas?: { area: number; bbox: number[] }[];
      largestComponents: { area: number; bbox: number[] }[];
    };
  };
}

const MAP = JSON.parse(readFileSync(MAP_PATH, "utf8")) as MapData;
const CATALOG = JSON.parse(readFileSync(CATALOG_PATH, "utf8")) as Catalog;
const BOUNDARIES = JSON.parse(readFileSync(BOUNDARIES_PATH, "utf8")) as Boundaries;
const AUDIT = JSON.parse(readFileSync(AUDIT_PATH, "utf8")) as Audit;
const ALL = [...CATALOG.states, ...CATALOG.territories];
const MAP_BY_TAG = new Map(MAP.polities.map((polity) => [polity.tag, polity] as const));

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

function pointInRing(lon: number, lat: number, ring: readonly number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi = 0, yi = 0] = ring[i] ?? [];
    const [xj = 0, yj = 0] = ring[j] ?? [];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Even-odd point-in-polygon over every ring; holes therefore subtract. */
function contains(tag: string, lon: number, lat: number): boolean {
  const polity = MAP_BY_TAG.get(tag);
  if (polity === undefined) return false;
  let inside = false;
  for (const flat of polity.rings) {
    if (pointInRing(lon, lat, decodeRing(flat))) inside = !inside;
  }
  return inside;
}

function owners(lon: number, lat: number): string[] {
  return MAP.polities
    .filter((polity) => {
      const [minX = -180, minY = -90, maxX = 180, maxY = 90] = polity.bbox;
      return lon >= minX && lon <= maxX && lat >= minY && lat <= maxY && contains(polity.tag, lon, lat);
    })
    .map((polity) => polity.tag);
}

function disputedAt(lon: number, lat: number): string | null {
  for (const area of MAP.disputedAreas) {
    const [minX = -180, minY = -90, maxX = 180, maxY = 90] = area.bbox;
    if (lon < minX || lon > maxX || lat < minY || lat > maxY) continue;
    let inside = false;
    for (const flat of area.rings) {
      if (pointInRing(lon, lat, decodeRing(flat))) inside = !inside;
    }
    if (inside) return area.id;
  }
  return null;
}

describe("M11c catalog, map and provenance coverage", () => {
  test("the catalog, map and provenance retain the 133 stable polities", () => {
    expect(CATALOG.states).toHaveLength(67);
    expect(CATALOG.territories).toHaveLength(66);
    expect(ALL).toHaveLength(133);
    expect(MAP.polities).toHaveLength(133);
    expect(new Set(MAP.polities.map((polity) => polity.tag)).size).toBe(133);
    expect(new Set(ALL.map((entry) => entry.id)).size).toBe(133);
    expect(MAP.meta.referenceDate).toBe("1900-01-01");
    expect(MAP.meta.boundaryVersion).toBe(BOUNDARIES.meta.version);
    expect(MAP.meta.provenanceCount).toBe(133);
  });

  test("every catalogued polity resolves to one map feature and one provenance record", () => {
    for (const entry of ALL) {
      const polity = MAP_BY_TAG.get(entry.tag);
      expect(polity).toBeDefined();
      expect(polity?.provenance).toBeDefined();
      expect(polity?.provenance.polityId).toBe(entry.id);
      expect(polity?.provenance.tag).toBe(entry.tag);
      expect(polity?.provenance.historicalName).toBe(entry.name);
      expect(polity?.provenance.referenceDate).toBe("1900-01-01");
      expect(BOUNDARIES.provenance[entry.tag]).toBeDefined();
      expect(BOUNDARIES.provenance[entry.tag]?.referenceDate).toBe("1900-01-01");
    }
    const catalogIds = new Set(ALL.map((entry) => entry.id));
    for (const polity of MAP.polities) {
      expect(catalogIds.has(polity.provenance.polityId)).toBe(true);
    }
  });

  test("every geometry is classified, dated and sourced; no markers remain", () => {
    const classes = new Set(Object.keys(BOUNDARIES.meta.geometryClasses));
    const confidences = new Set(Object.keys(BOUNDARIES.meta.confidenceDefinitions));
    for (const polity of MAP.polities) {
      expect(polity.markerOnly).toBeUndefined();
      expect(polity.rings.length).toBeGreaterThan(0);
      expect(classes.has(polity.provenance.geometryClass)).toBe(true);
      expect(confidences.has(polity.provenance.confidence)).toBe(true);
      expect(polity.provenance.boundarySources.length).toBeGreaterThan(0);
      for (const source of polity.provenance.boundarySources) {
        expect(source.id.length).toBeGreaterThan(0);
        expect(source.title.length).toBeGreaterThan(0);
        expect(source.url.length).toBeGreaterThan(0);
        expect(source.license.length).toBeGreaterThan(0);
      }
      expect(polity.provenance.deviationsFromModern.length).toBeGreaterThan(10);
      expect(polity.provenance.knownUncertainties.length).toBeGreaterThan(10);
    }
    expect(AUDIT.summary.markerOnly).toBe(0);
    expect(AUDIT.summary.provenanceCount).toBe(133);
  });

  test("every transfer references known polities and known sources", () => {
    const tags = new Set(ALL.map((entry) => entry.tag));
    const sourceIds = new Set(BOUNDARIES.meta.sourceRegistry.map((source) => source.id));
    for (const patch of BOUNDARIES.patches) {
      if (patch.to !== null) expect(tags.has(patch.to)).toBe(true);
      for (const tag of patch.from) expect(tags.has(tag)).toBe(true);
      expect(["high", "medium", "low"]).toContain(patch.confidence);
      for (const sourceId of patch.sourceIds) expect(sourceIds.has(sourceId)).toBe(true);
      expect(patch.description.length).toBeGreaterThan(10);
      expect(patch.notes.length).toBeGreaterThan(10);
    }
    expect(BOUNDARIES.patches.length).toBeGreaterThanOrEqual(45);
  });
});

describe("M11c German Empire reconstruction", () => {
  test("the German Empire includes Alsace-Lorraine, the Prussian east and the 1900 frontier", () => {
    for (const [name, lon, lat] of [
      ["Berlin", 13.4, 52.52],
      ["Königsberg", 20.51, 54.71],
      ["Danzig", 18.65, 54.35],
      ["Posen", 16.93, 52.41],
      ["Breslau", 17.03, 51.11],
      ["Strasbourg", 7.75, 48.58],
      ["Metz", 6.18, 49.12],
      ["Kiel", 10.13, 54.32],
      ["Flensburg", 9.43, 54.78],
      ["Memel", 21.13, 55.7],
      ["Eupen", 6.03, 50.63],
      ["Tønder", 8.86, 54.94],
      ["Thorn", 18.6, 53.01],
    ] as const) {
      expect({ name, inside: contains("DEU", lon, lat) }).toEqual({ name, inside: true });
    }
  });

  test("the German Empire excludes Congress Poland, Austria-Hungary, France, Denmark and Switzerland", () => {
    for (const [name, lon, lat, tag] of [
      ["Warsaw", 21.01, 52.23, "RUS"],
      ["Kalisz", 18.08, 51.76, "RUS"],
      ["Częstochowa", 19.12, 50.81, "RUS"],
      ["Włocławek", 19.07, 52.65, "RUS"],
      ["Kraków", 19.94, 50.06, "AUT"],
      ["Vilnius", 25.28, 54.69, "RUS"],
      ["Copenhagen", 9.5, 55.5, "DNK"],
      ["Nancy", 6.18, 48.69, "FRA"],
      ["Belfort", 6.86, 47.64, "FRA"],
      ["Basel", 7.59, 47.56, "CHE"],
    ] as const) {
      expect({ name, inGermany: contains("DEU", lon, lat) }).toEqual({ name, inGermany: false });
      expect({ name, inExpected: contains(tag, lon, lat) }).toEqual({ name, inExpected: true });
    }
  });

  test("Alsace-Lorraine is German and the French border retains Belfort", () => {
    expect(contains("DEU", 7.75, 48.58)).toBe(true);
    expect(contains("FRA", 7.75, 48.58)).toBe(false);
    expect(contains("FRA", 6.86, 47.64)).toBe(true);
    expect(contains("DEU", 6.86, 47.64)).toBe(false);
  });
});

describe("M11c Libya and Ottoman North Africa", () => {
  test("Tripolitania, Cyrenaica and Fezzan resolve to the Ottoman Empire", () => {
    for (const [name, lon, lat] of [
      ["Tripoli", 13.19, 32.89],
      ["Benghazi", 20.07, 32.12],
      ["Sabha", 14.43, 27.04],
      ["Murzuq", 13.92, 25.92],
      ["Kufra", 23.13, 24.18],
      ["Ghadames", 9.5, 30.13],
    ] as const) {
      expect({ name, owners: owners(lon, lat) }).toEqual({ name, owners: ["OTT"] });
    }
    expect(MAP_BY_TAG.has("LBY")).toBe(false);
  });

  test("the Ottoman Libyan components are documented without inventing a Libyan state", () => {
    const provenance = MAP_BY_TAG.get("OTT")?.provenance;
    expect(provenance).toBeDefined();
    const components = provenance?.components ?? [];
    expect(components.map((component) => component.name)).toEqual([
      "Tripolitania",
      "Cyrenaica",
      "Fezzan",
    ]);
    expect(provenance?.geometryClass).toBe("reconstructed");
    expect(BOUNDARIES.provenance.OTT?.notes).toMatch(/Libya|Tripolitania|Cyrenaica|Fezzan/);
  });

  test("the former Aouzou–Tibesti uncertainty zone is split by current borders", () => {
    const libyaGaps = AUDIT.coverage.unassignedSamples.filter(
      ([lon = 0, lat = 0]) => lon >= 9 && lon <= 25 && lat >= 19 && lat <= 33.5,
    );
    expect(libyaGaps).toEqual([]);
    expect(contains("TUN", 10.18, 36.8)).toBe(true);
    expect(contains("EGY", 31.24, 30.04)).toBe(true);
    expect(contains("ALG", 3.06, 36.75)).toBe(true);
    expect(contains("FEA", 16.0, 12.0)).toBe(true); // central Chad / French Equatorial Africa
    expect(contains("SAH", -12.63, 23.97)).toBe(true);
    // Current Chad/Libya/Niger borders decide the former rectangle.
    expect(contains("FEA", 15.5, 21.5)).toBe(true); // Aouzou strip, Chad
    expect(contains("OTT", 15.5, 21.5)).toBe(false);
    expect(contains("FEA", 18.5, 21.5)).toBe(true); // Tibesti, Chad
    expect(contains("OTT", 18.8, 22.9)).toBe(true); // northern edge, Libya
    expect(contains("FWA", 15.1, 20.0)).toBe(true); // western edge, Niger
    expect(disputedAt(15.5, 21.5)).toBeNull();
    expect(disputedAt(18.5, 21.35)).toBeNull();
    expect(disputedAt(13.8, 18.7)).toBeNull(); // Bilma: French West African sphere
    expect(contains("FWA", 13.8, 18.7)).toBe(true);
    expect(disputedAt(18.5, 18.5)).toBeNull(); // Borkou: Wadai sphere/proxy
    expect(contains("WAD", 18.5, 18.5)).toBe(true);
    expect(disputedAt(22.0, 17.5)).toBeNull(); // Ennedi
    expect(contains("WAD", 22.0, 17.5)).toBe(true);
    expect(MAP.meta.disputedAreaCount).toBe(0);
    expect(MAP.disputedAreas).toEqual([]);
    expect(MAP.meta.resolvedDisputeCount).toBe(2);
    expect(AUDIT.summary.disputedOverlaps).toBe(0);
    // Current India/Pakistan/China polygons decide the former Siachen rectangle.
    expect(disputedAt(77.2, 35.4)).toBeNull();
    expect(contains("BIN", 77.2, 35.4)).toBe(true); // Siachen Glacier side, British India
    expect(contains("CHN", 77.7, 35.6)).toBe(true); // Chinese side
  });

  test("resolved disputes record the modern-border split and its sources", () => {
    const aouzou = MAP.resolvedDisputes.find((area) => area.id === "aouzou-tibesti");
    expect(aouzou?.strategy).toBe("split-by-current-borders");
    expect(aouzou?.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ modernCode: "TCD", targetTag: "FEA" }),
        expect.objectContaining({ modernCode: "LBY", targetTag: "OTT" }),
        expect.objectContaining({ modernCode: "NER", targetTag: "FWA" }),
      ]),
    );
    expect(aouzou?.sources).toEqual(
      expect.arrayContaining(["icj-libya-chad-1994", "icj-libya-chad-pleadings"]),
    );
    const siachen = MAP.resolvedDisputes.find((area) => area.id === "siachen-kashmir");
    expect(siachen?.strategy).toBe("split-by-current-borders");
    expect(siachen?.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ modernCode: "KAS", targetTag: "BIN" }),
        expect.objectContaining({ modernCode: "CHN", targetTag: "CHN" }),
      ]),
    );
  });
});

describe("M11c global historical-border corrections", () => {
  test("Austria-Hungary includes Galicia, Transylvania, Vojvodina and the Littoral", () => {
    for (const [name, lon, lat] of [
      ["Lviv", 24.03, 49.84],
      ["Kraków", 19.94, 50.06],
      ["Cluj", 23.6, 46.77],
      ["Timișoara", 21.23, 45.75],
      ["Novi Sad", 19.84, 45.25],
      ["Trieste", 13.77, 45.65],
      ["Trento", 11.12, 46.07],
      ["Kotor", 18.77, 42.42],
    ] as const) {
      expect({ name, inside: contains("AUT", lon, lat) }).toEqual({ name, inside: true });
    }
    expect(contains("ITA", 13.77, 45.65)).toBe(false);
    expect(contains("ROU", 23.6, 46.77)).toBe(false);
  });

  test("the Ottoman Empire retains its 1900 European and Anatolian provinces but loses Kars", () => {
    for (const [name, lon, lat] of [
      ["Ioannina", 20.85, 39.66],
      ["Thessaloniki", 22.94, 40.64],
      ["Rhodes", 27.9, 36.2],
      ["Baghdad", 44.36, 33.31],
      ["Mecca", 39.83, 21.42],
    ] as const) {
      expect({ name, inside: contains("OTT", lon, lat) }).toEqual({ name, inside: true });
    }
    expect(contains("AUT", 18.41, 43.86)).toBe(true); // Bosnia was Austria-Hungarian
    expect(contains("OTT", 18.41, 43.86)).toBe(false);
    expect(contains("OTT", 43.0, 40.5)).toBe(false); // Kars province
    expect(contains("RUS", 43.0, 40.5)).toBe(true);
    expect(contains("GRC", 22.94, 40.64)).toBe(false);
    expect(contains("CRT", 24.02, 35.51)).toBe(true);
  });

  test("Siam, India, Tibet, the Central Asian protectorates and the African sultanates are reconstructed", () => {
    expect(contains("THA", 103.2, 13.1)).toBe(true); // Battambang
    expect(contains("THA", 100.37, 6.12)).toBe(true); // Alor Setar / Kedah
    expect(contains("FIC", 103.2, 13.1)).toBe(false);
    expect(contains("MAL", 100.37, 6.12)).toBe(false);
    expect(contains("BIN", 45.1, 13.0)).toBe(true); // Aden
    expect(contains("BIN", 74.0, 15.3)).toBe(false); // Goa is Portuguese
    expect(contains("PAI", 74.0, 15.3)).toBe(true);
    expect(contains("TIB", 91.14, 29.65)).toBe(true);
    expect(contains("CHN", 91.14, 29.65)).toBe(false);
    expect(contains("KHI", 60.36, 41.38)).toBe(true);
    expect(contains("BUK", 64.42, 39.77)).toBe(true);
    expect(contains("SOK", 5.24, 13.06)).toBe(true);
    expect(contains("WAD", 20.83, 13.83)).toBe(true);
    expect(contains("DAR", 25.35, 13.63)).toBe(true);
    expect(contains("SHM", 41.69, 27.52)).toBe(true);
    expect(contains("OTT", 46.72, 24.63)).toBe(false); // Riyadh was Shammar in 1900
  });

  test("the Americas and Oceania corrections are applied", () => {
    expect(contains("BOL", -70.0, -9.0)).toBe(true); // Acre
    expect(contains("BRA", -70.0, -9.0)).toBe(false);
    expect(contains("CHL", -70.25, -18.0)).toBe(true); // Tacna
    expect(contains("PRU", -70.25, -18.0)).toBe(false);
    expect(contains("NFD", -52.71, 47.56)).toBe(true);
    expect(contains("CAN", -52.71, 47.56)).toBe(false);
    expect(contains("TON", -175.25, -21.15)).toBe(true);
    expect(contains("BPO", -175.25, -21.15)).toBe(false);
    expect(contains("SAR", 110.34, 1.55)).toBe(true);
    expect(contains("MAL", 110.34, 1.55)).toBe(false);
  });
});

describe("M11c coverage, validity and overlap audit", () => {
  test("there are no invalid or self-intersecting rings", () => {
    expect(AUDIT.summary.invalidRings).toBe(0);
    expect(AUDIT.invalidRings).toEqual([]);
    for (const polity of MAP.polities) {
      for (const flat of polity.rings) {
        expect(flat.length % 2).toBe(0);
        const ring = decodeRing(flat);
        expect(ring.length).toBeGreaterThanOrEqual(4);
        expect(ring[0]).toEqual(ring[ring.length - 1]);
        for (const point of ring) {
          const lon = point[0] ?? 0;
          const lat = point[1] ?? 0;
          expect(Number.isFinite(lon)).toBe(true);
          expect(Number.isFinite(lat)).toBe(true);
          expect(Math.abs(lat)).toBeLessThanOrEqual(90);
        }
      }
      for (const index of polity.holes) {
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(polity.rings.length);
      }
    }
  });

  test("the only residual overlaps are sub-0.01 documented slivers, with resolution records", () => {
    expect(AUDIT.overlaps.map((overlap) => `${overlap.a}:${overlap.b}`).sort()).toEqual([
      "CAN:NFD",
      "RUS:FIN",
    ]);
    expect(AUDIT.summary.largestOverlapDegreesSquared).toBeLessThanOrEqual(0.01);
    for (const overlap of AUDIT.overlaps) {
      expect(overlap.area).toBeLessThanOrEqual(0.01);
    }
    const resolutions = MAP.overlapResolutions;
    expect(resolutions.map((resolution) => resolution.pair.join(":"))).toEqual(
      expect.arrayContaining(["CAN:NFD", "BRA:BOL"]),
    );
    const canada = resolutions.find((resolution) => resolution.pair.join(":") === "CAN:NFD");
    expect(canada?.areaBeforeDegreesSquared).toBeCloseTo(0.249, 2);
    expect(canada?.intersectionBbox).toHaveLength(4);
    expect(canada?.historicalNote).toMatch(/Labrador|1927|Privy Council/);
    const acre = resolutions.find((resolution) => resolution.pair.join(":") === "BRA:BOL");
    expect(acre?.areaBeforeDegreesSquared).toBeCloseTo(0.016, 2);
    expect(acre?.historicalNote).toMatch(/Petr/);
  });

  test("no multi-sample land void remains; coverage is classified, not cosmetically zeroed", () => {
    expect(AUDIT.summary.unassignedComponents).toBe(AUDIT.summary.unassignedSamples);
    expect(AUDIT.summary.largestUnassignedComponent).toBe(1);
    expect(AUDIT.summary.unassignedSamples).toBeLessThanOrEqual(30);
    expect(AUDIT.coverage.components.every((component) => component.samples <= 1)).toBe(true);
    expect(AUDIT.summary.disputedAreas).toBe(0);
    expect(AUDIT.summary.disputedAreaDegreesSquared).toBe(0);
    expect(AUDIT.summary.intentionalUnassignedAreaDegreesSquared).toBeGreaterThan(4000);
    expect(AUDIT.summary.generalizationSliverComponents).toBeGreaterThan(5000);
    expect(AUDIT.summary.unexplainedUnassignedAreaDegreesSquared).toBeLessThan(2);
    expect(AUDIT.summary.unexplainedUnassignedComponents).toBeLessThan(100);
    expect(AUDIT.summary.polygonUnassignedAreaDegreesSquared).toBeGreaterThan(4000);
  });

  test("the map module bundles provenance and no runtime download", () => {
    const appMap = readFileSync(join(ROOT, "packages/app/src/generated/worldMap1900.ts"), "utf8");
    expect(appMap).toContain("WORLD_MAP_1900");
    expect(appMap).toContain("\"provenance\"");
    expect(appMap).toContain("\"referenceDate\":\"1900-01-01\"");
    expect(appMap).not.toContain("fetch(");
    expect(appMap).not.toContain("XMLHttpRequest");
  });
});

describe("M11c documentation", () => {
  test("the provenance, coverage, decisions and map-data documents record the audit", () => {
    const provenanceDoc = readFileSync(join(ROOT, "docs/HISTORICAL_MAP_PROVENANCE.md"), "utf8");
    const coverageDoc = readFileSync(join(ROOT, "docs/1900_CATALOG_COVERAGE.md"), "utf8");
    const decisions = readFileSync(join(ROOT, "DECISIONS.md"), "utf8");
    const mapDoc = readFileSync(join(ROOT, "docs/MAP_DATA.md"), "utf8");
    expect(provenanceDoc).toContain("Germany");
    expect(provenanceDoc).toContain("Libya");
    expect(provenanceDoc).toContain("Confidence");
    expect(coverageDoc).toContain("M11c");
    expect(decisions).toContain("M11c");
    expect(mapDoc).toContain("boundaries_1900.json");
  });

  test("the visual smoke images exist and are valid PNG files", () => {
    const images = [
      "before-world.png",
      "after-world.png",
      "before-europe.png",
      "after-europe.png",
      "before-germany.png",
      "after-germany.png",
      "before-north-africa.png",
      "after-north-africa.png",
      "after-libya.png",
      "after-central-asia.png",
    ];
    for (const image of images) {
      const path = join(ROOT, "docs/images/m11c", image);
      expect(existsSync(path)).toBe(true);
      expect(statSync(path).size).toBeGreaterThan(1000);
      const header = readFileSync(path).subarray(0, 8);
      expect([...header]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    }
    const doc = readFileSync(join(ROOT, "docs/HISTORICAL_MAP_PROVENANCE.md"), "utf8");
    expect(doc).toContain("after-germany.png");
    expect(doc).toContain("after-libya.png");
  });
});
