/**
 * Save compatibility (D-013, D-120): a save written by an earlier world schema,
 * simulation version or content version is rejected with an actionable error and is
 * never migrated, and a stored legacy save keeps readable metadata so the save library
 * can list it with its reason.
 *
 * Collected from the milestone suites that each pinned their own predecessor (M2.1,
 * M3a, M4a-2, M4c, M5, M13, M14 and P2). Every case keeps the world, the mutation and
 * the error its original test used. Version checks that sit inside a subsystem's own
 * round-trip test (M4b, M9, M10, E6a, E6b) stay with that test.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  WORLD_SCHEMA_VERSION,
  createEconomyWorld,
  deserializeWorld,
  serializeWorld,
  type World,
} from "@century/sim";
import { decompressSaveFromStorage, readSaveMetadata } from "@century/sim-worker/persistence";

import { aggregateWorld } from "../fixtures/m2.js";
import { m3Scenario } from "../fixtures/m3a.js";
import { ownCurrencyScenario } from "../fixtures/m4a2.js";
import { fiscalScenario } from "../fixtures/m4c.js";
import { m5World } from "../fixtures/m5.js";

const HERE = dirname(fileURLToPath(import.meta.url));

interface VersionCase {
  readonly world: string;
  readonly build: () => World;
  readonly schemas: readonly { readonly version: number; readonly error: RegExp }[];
  readonly simulation: { readonly version: string; readonly error: RegExp };
  readonly content?: { readonly version: string; readonly error: RegExp };
}

const CASES: readonly VersionCase[] = [
  {
    world: "the M2.1 population world",
    build: () => aggregateWorld().world,
    schemas: [{ version: 2, error: /schema/i }],
    simulation: { version: "0.2.0", error: /simulation version/i },
  },
  {
    world: "the M3a economy world",
    build: () => createEconomyWorld(m3Scenario(), { seed: 20_261_023 }),
    schemas: [{ version: 3, error: /schema/i }],
    simulation: { version: "0.3.0", error: /simulation version/i },
    content: { version: "m2.1-population-v1", error: /content version/i },
  },
  {
    world: "the M4a-2 own-currency world",
    build: () => createEconomyWorld(ownCurrencyScenario(), { seed: 20_261_023 }),
    schemas: [{ version: 6, error: /schema/i }],
    simulation: { version: "0.6.0", error: /simulation version/i },
  },
  {
    world: "the M4c fiscal world",
    build: () => createEconomyWorld(fiscalScenario({ rate: 0.1 }), { seed: 20_261_023 }),
    schemas: [{ version: 8, error: /schema 8/i }],
    simulation: { version: "0.8.0", error: /simulation version/i },
  },
  {
    world: "the M5 multi-country world",
    build: () => m5World().world,
    // P5b (D-146, D-147): schema 32 (P5a) is incompatible with schema 33.
    schemas: [9, 10, 11, 12, 32].map((version) => ({
      version,
      error: new RegExp(`Save world schema ${String(version)} is incompatible`),
    })),
    // The envelope still claims the current schema, so the simulation-version check
    // is the one that rejects the save.
    simulation: { version: "0.9.0", error: /Save simulation version "0\.9\.0" is incompatible/ },
  },
];

function mutated(save: string, field: "schemaVersion" | "simVersion" | "dataVersion", value: unknown): string {
  const envelope = JSON.parse(save) as Record<string, unknown>;
  envelope[field] = value;
  return JSON.stringify(envelope);
}

describe("an earlier save version is rejected, never migrated (D-013)", () => {
  test.each(CASES.map((entry) => [entry.world, entry] as const))(
    "%s: earlier schema, simulation and content versions are rejected",
    (_name, entry) => {
      const save = serializeWorld(entry.build());
      for (const schema of entry.schemas) {
        expect(() => deserializeWorld(mutated(save, "schemaVersion", schema.version))).toThrow(schema.error);
      }
      expect(() => deserializeWorld(mutated(save, "simVersion", entry.simulation.version))).toThrow(
        entry.simulation.error,
      );
      if (entry.content !== undefined) {
        expect(() => deserializeWorld(mutated(save, "dataVersion", entry.content?.version))).toThrow(
          entry.content.error,
        );
      }
    },
  );
});

describe("a stored legacy save is listed, then refused (D-120)", () => {
  // One stored save from schema 27, before the rename (M13), the unit rename (M14) and
  // the P2 schema break. Formerly asserted three times (M13, M14 and P2).
  test("a compressed Century-era schema-27 save keeps readable metadata and is rejected as incompatible", () => {
    // P2b (D-135) moved the schema to 29; a schema-27 save stays incompatible.
    expect(WORLD_SCHEMA_VERSION).toBeGreaterThanOrEqual(28);
    const fixture = JSON.parse(
      readFileSync(join(HERE, "../fixtures/century-era-save.json"), "utf8"),
    ) as {
      readonly format: string;
      readonly formatVersion: number;
      readonly schemaVersion: number;
      readonly worldHash: string;
      readonly stored: string;
    };
    expect(fixture.format).toBe("century-save");
    expect(fixture.formatVersion).toBe(1);
    expect(fixture.schemaVersion).toBe(27);
    expect(fixture.stored.startsWith("century-save-gzip1:")).toBe(true);

    const canonical = decompressSaveFromStorage(fixture.stored);
    const metadata = readSaveMetadata(canonical);
    expect(metadata.schemaVersion).toBe(27);
    expect(metadata.formatVersion).toBe(1);
    expect(metadata.scenarioId).toBe("m11-world-1900");

    // P2 (schema 28, D-134): the envelope and metadata stay readable, so the game can
    // list the save with its reason, but the world is never migrated.
    // D-137 save format 2 rejects every format-1 save before decoding (the legacy
    // pre-rename key normalizer is gone), so this pre-format-2 save is refused by its
    // format version; its metadata above is still readable for the library.
    expect(() => deserializeWorld(canonical)).toThrow(/incompatible/u);
    expect(() => deserializeWorld(canonical)).toThrow(
      /format version 1 is incompatible with this build \(2\)/u,
    );
  }, 60_000);
});
