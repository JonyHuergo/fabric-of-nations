/**
 * M14 — RUSD monetary terminology regressions.
 *
 * The rename is terminology-only: numeric values, scales, conversions,
 * starting conditions and deterministic behavior must be unchanged. These tests
 * also pin the legacy save alias, the canonical RUSD serialization and the
 * distinction between the reference unit and actual national currencies.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadM11World } from "@century/data";
import {
  LEGACY_SUSD_CURRENCY_KEY,
  RUSD_CURRENCY_KEY,
  RUSD_UNIT_ABBREVIATION,
  RUSD_UNIT_NAME,
  createEconomyWorld,
  deserializeWorld,
  hashWorld,
  serializeWorld,
} from "@century/sim";
import {
  PROTOCOL_VERSION,
  formatRUSD,
} from "@century/sim-worker";
import {
  decompressSaveFromStorage,
  readSaveMetadata,
} from "@century/sim-worker/persistence";

import { ownCurrencyScenario } from "./fixtures/m4a2.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");
const APP = join(ROOT, "packages/app");

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function hasLegacyMonetaryKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasLegacyMonetaryKey);
  if (value !== null && typeof value === "object") {
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (/SUSD|Susd|susd/.test(key) || hasLegacyMonetaryKey(entry)) return true;
    }
  }
  return false;
}

describe("M14 canonical RUSD identity", () => {
  test("the canonical unit is RUSD — Reference US Dollars", () => {
    expect(RUSD_CURRENCY_KEY).toBe("rusd");
    expect(RUSD_UNIT_ABBREVIATION).toBe("RUSD");
    expect(RUSD_UNIT_NAME).toBe("Reference US Dollars");
    expect(LEGACY_SUSD_CURRENCY_KEY).toBe("susd");
  });

  test("RUSD is not USD and actual USD remains a national currency", () => {
    expect(RUSD_CURRENCY_KEY).not.toBe("usd");
    expect(RUSD_UNIT_NAME).not.toMatch(/\bUSD\b/);
    const countries = JSON.parse(
      readFileSync(join(ROOT, "packages/data/data/historical/m11/countries_1900.json"), "utf8"),
    ) as { currency: { key: string } }[];
    expect(countries.some((country) => country.currency.key === "usd")).toBe(true);
    expect(countries.some((country) => country.currency.key === "rusd")).toBe(false);
    expect(countries.some((country) => country.currency.key === "susd")).toBe(false);
  });

  test("RUSD cannot be adopted or issued as a national currency", () => {
    for (const key of ["rusd", "RUSD", "Rusd", "susd", "SUSD", "Susd"]) {
      const scenario = ownCurrencyScenario();
      scenario.currencies![0]!.key = key;
      expect(() => createEconomyWorld(scenario, { seed: 1 })).toThrow(/reserved for the RUSD/i);
    }
  });

  test("the UI formats amounts with the RUSD suffix and explains the concept", () => {
    expect(formatRUSD(1_000)).toBe("1.0k RUSD");
    expect(formatRUSD(12.5)).toBe("12.50 RUSD");
    const money = readFileSync(join(APP, "src/screens/MoneyScreen.tsx"), "utf8");
    expect(money).toContain("RUSD_UNIT_NAME");
    expect(money).toContain("not an actual national currency or legal tender");
    expect(money).not.toMatch(/\bSUSD\b/);
    for (const screen of ["BudgetScreen.tsx", "LedgerScreen.tsx", "TradeScreen.tsx", "CountryScreen.tsx"]) {
      expect(readFileSync(join(APP, "src/screens", screen), "utf8")).not.toMatch(/\bSUSD\b/);
    }
  });
});

describe("M14 monetary equivalence and determinism", () => {
  const scenario = loadM11World();
  const world = createEconomyWorld(scenario, { seed: 20_261_023 });

  // Re-pinned 2026-11-02: the M14 rename left this hash unchanged (0c99bb73270294e5);
  // the D-128 province repair (1,687 provinces, Hultschin, Cuba owner/controller) and the
  // D-129 sourced population corrections (Wadai, Darfur, German Pacific islands, Guam)
  // changed the 1900 world afterwards. Prices and currency valuations were verified equal
  // to the pre-M14 save before re-pinning. The test comparing this world with the pre-M14
  // save was retired with the designer's approval: the save predates D-128/D-129, and the
  // P2 schema break (D-120) makes it incompatible.
  // Re-pinned for P2: the 1900 world is the province world (D-131, D-132, schema 28).
  // Re-pinned for P2b: the 1900 world's money values, wages, techniques and levels are
  // re-derived from sources (D-135, schema 29).
  test("the 1900 world hash is pinned", () => {
    expect(hashWorld(world)).toBe("62e80932e1b0d0d4");
  });

  test("canonical saves use RUSD field names and round-trip deterministically", () => {
    const save = serializeWorld(world);
    const envelope = JSON.parse(save) as { format: string; schemaVersion: number; payload: unknown };
    expect(envelope.format).toBe("century-save");
    // P2b (D-135): schema 29 adds province wages, building technique and money coefficients.
    expect(envelope.schemaVersion).toBe(29);
    expect(hasLegacyMonetaryKey(envelope.payload)).toBe(false);
    expect(save).toContain("balanceRUSD");
    expect(save).not.toMatch(/SUSD|Susd|susd/);
    const restored = deserializeWorld(save);
    expect(hashWorld(restored)).toBe(hashWorld(world));
    expect(serializeWorld(restored)).toBe(save);
  }, 60_000);

  test("a pre-M14 SUSD save keeps readable metadata and is rejected as incompatible (D-120)", () => {
    const fixture = JSON.parse(
      readFileSync(join(HERE, "fixtures/century-era-save.json"), "utf8"),
    ) as { stored: string; worldHash: string; schemaVersion: number };
    const canonical = decompressSaveFromStorage(fixture.stored);
    const metadata = readSaveMetadata(canonical);
    expect(metadata.schemaVersion).toBe(27);
    expect(metadata.formatVersion).toBe(1);
    expect(metadata.scenarioId).toBe("m11-world-1900");
    expect(() => deserializeWorld(canonical)).toThrow(/incompatible/u);
  }, 60_000);
});

describe("M14 current documentation and protocol", () => {
  test("the current GDD and README use RUSD and explain the distinction", () => {
    const gdd = read("Fabric_of_Nations_GDD.md");
    const readme = read("README.md");
    expect(gdd).toContain("Reference US Dollars");
    expect(gdd).toContain("not a currency issued by any country");
    expect(readme).toContain("RUSD — Reference US Dollars");
    expect(readme).toMatch(/formerly \*\*SUSD/);
  });

  test("the worker protocol version reflects the snapshot vocabulary change", () => {
    // 17: P2 province economy table, territories and professions (D-134).
    expect(PROTOCOL_VERSION).toBe(17);
  });

  test("the monetary terminology audit passes", () => {
    const result = spawnSync(
      process.execPath,
      [join(ROOT, "scripts/m14/monetary-terminology-audit.mjs")],
      { cwd: ROOT, encoding: "utf8", timeout: 120_000 },
    );
    expect(`${result.stdout}${result.stderr}`).toContain("Monetary terminology audit passed");
    expect(result.status).toBe(0);
  }, 130_000);
});
