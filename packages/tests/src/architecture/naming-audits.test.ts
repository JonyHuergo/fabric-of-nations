/**
 * Naming audits: the M13 rebranding (Fabric of Nations) and the M14 unit rename (RUSD).
 *
 * The rebranding must be visible where players look and must not leak the former
 * name into current generated metadata. The RUSD rename is terminology-only: numeric
 * values, scales, conversions, starting conditions and deterministic behaviour are
 * unchanged, and the reference unit stays distinct from actual national currencies.
 * The two audit scripts are the broad checks; these tests pin the specific surfaces.
 * The legacy-save rejection both renames once pinned lives in
 * `serialization/save-compatibility.test.ts`.
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

import { ownCurrencyScenario } from "../fixtures/m4a2.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../../..");
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

describe("M13 branding audit", () => {
  test("the branding audit passes on current source and metadata", () => {
    const result = spawnSync(process.execPath, [join(ROOT, "scripts/m13/branding-audit.mjs")], {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 120_000,
    });
    expect(`${result.stdout}${result.stderr}`).toContain("Branding audit passed");
    expect(result.status).toBe(0);
  }, 130_000);
});

describe("M13 player-facing identity", () => {
  const appConfig = JSON.parse(readFileSync(join(APP, "app.json"), "utf8")).expo;
  const manifest = JSON.parse(readFileSync(join(APP, "public/manifest.webmanifest"), "utf8"));
  const mainMenu = readFileSync(join(APP, "src/screens/MainMenuScreen.tsx"), "utf8");
  const appShell = readFileSync(join(APP, "App.tsx"), "utf8");

  test("the application, web title and install metadata use the official name", () => {
    expect(appConfig.name).toBe("Fabric of Nations");
    expect(appConfig.slug).toBe("fabric-of-nations");
    expect(appConfig.web.name).toBe("Fabric of Nations");
    expect(appConfig.web.shortName).toBe("Fabric of Nations");
    expect(manifest.name).toBe("Fabric of Nations");
    expect(manifest.short_name).toBe("Fabric of Nations");
  });

  test("the main menu and loading screen display the official name", () => {
    expect(mainMenu).toContain("FABRIC OF NATIONS");
    expect(mainMenu).not.toMatch(/\bCENTURY\b/);
    expect(appShell).toContain("FABRIC OF NATIONS");
    expect(appShell).not.toMatch(/>\s*CENTURY\s*</);
  });

  test("the current GDD and README use the official name", () => {
    const gdd = readFileSync(join(ROOT, "Fabric_of_Nations_GDD.md"), "utf8");
    const readme = readFileSync(join(ROOT, "README.md"), "utf8");
    expect(gdd.split("\n")[0]).toContain("FABRIC OF NATIONS");
    expect(readme.split("\n")[0]).toContain("Fabric of Nations");
  });
});

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
  // Re-pinned for P3: sourced 1900 currency valuations, adopted arrangements, corrected
  // currency names and schema 30 (D-141). The P3 equivalence test and
  // `p3Equivalence.js` show that no simulated quantity changed.
  // Re-pinned for P4: the 1900 world starts from per-province stable age structures and
  // sourced demographic levels, blocks carry their demographic state, technologies gain
  // the sanitation and contraception effects, and the schema is 31 (D-142).
  // Re-pinned for P5: farms' techniques absorb their 1900 land factor, the world carries
  // its sourced deposits, survey countries know geological surveying, three prospecting
  // technologies exist and the schema is 32 (D-143).
  // Re-pinned for P5b step 3 (D-146, D-147): 22 added deposits (A10), bounded land in
  // Guam, Pohnpei and Monaco (C-7), the pipelines and nuclear-power technologies, eight
  // industrial-policy sectors and schema 33.
  test("the 1900 world hash is pinned", () => {
    expect(hashWorld(world)).toBe("3b32d520c298985a");
  });

  test("canonical saves use RUSD field names and round-trip deterministically", () => {
    const save = serializeWorld(world);
    const envelope = JSON.parse(save) as { format: string; schemaVersion: number; payload: unknown };
    expect(envelope.format).toBe("century-save");
    // P2b (D-135): schema 29 adds province wages, building technique and money coefficients.
    // P3 (D-141): schema 30 adds the month-end closing valuations.
    // P4 (D-142): schema 31 adds the block demography and the annual record.
    // P5 (D-143): schema 32 adds the deposits and the monthly closing balances.
    // P5b (D-146): schema 33 adds the deposit link, province latitude and three sectors.
    expect(envelope.schemaVersion).toBe(33);
    expect(hasLegacyMonetaryKey(envelope.payload)).toBe(false);
    expect(save).toContain("balanceRUSD");
    expect(save).not.toMatch(/SUSD|Susd|susd/);
    const restored = deserializeWorld(save);
    expect(hashWorld(restored)).toBe(hashWorld(world));
    expect(serializeWorld(restored)).toBe(save);
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
    // 18: stored save form on SAVE_RESULT and LOAD (D-137).
    // 19: country currency link and valuation history in the snapshot (D-141).
    // 20: demography in the snapshot and the province focus command (D-142).
    // 21: province ownership columns, harvest column and province land (D-143).
    expect(PROTOCOL_VERSION).toBe(21);
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
