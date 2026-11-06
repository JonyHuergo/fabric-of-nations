/**
 * M13 — Fabric of Nations rebranding regressions.
 *
 * The rebranding must be visible where players look, must not leak the former
 * name into current generated metadata, and must not invalidate saves produced
 * before the rename. The branding audit is the broad check; these tests pin the
 * specific player-facing surfaces and the save-compatibility contract.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { deserializeWorld } from "@century/sim";
import { decompressSaveFromStorage, readSaveMetadata } from "@century/sim-worker/persistence";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../../..");
const APP = join(ROOT, "packages/app");

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

describe("M13 save compatibility", () => {
  test("a compressed Century-era save is read, then rejected as incompatible (D-120)", () => {
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
    expect(() => deserializeWorld(canonical)).toThrow(
      /format version 1 is incompatible with this build \(2\)/u,
    );
  }, 60_000);
});
