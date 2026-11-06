/**
 * Batch 7 — data-version consistency.
 *
 * The data package version, the simulation default, every authored scenario
 * metadata block, and the historical scenario must agree. A validation-only
 * change does not require a bump; a scenario-content change that alters save
 * meaning must bump all of them together.
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { DEFAULT_DATA_VERSION } from "@century/sim";
import {
  DATA_PACKAGE_INFO,
  DATA_PACKAGE_VERSION,
  loadM5HistoricalData,
  loadM2WorldAggregate,
  loadM3SmallEconomy,
} from "@century/data";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../../..");
const SCENARIO_DIRECTORY = join(ROOT, "packages", "data", "data", "scenarios");

describe("data version consistency", () => {
  test("package, simulation default, and package info agree", () => {
    expect(DATA_PACKAGE_VERSION).toBe(DEFAULT_DATA_VERSION);
    expect(DATA_PACKAGE_INFO.version).toBe(DATA_PACKAGE_VERSION);
  });

  test("every authored scenario declares the package data version", () => {
    const scenarioFiles = readdirSync(SCENARIO_DIRECTORY).filter((file) => file.endsWith(".json"));
    expect(scenarioFiles.length).toBeGreaterThan(0);
    for (const file of scenarioFiles) {
      const scenario = JSON.parse(
        readFileSync(join(SCENARIO_DIRECTORY, file), "utf8"),
      ) as { dataVersion?: unknown; meta?: { dataVersion?: unknown } };
      const declared = scenario.meta?.dataVersion ?? scenario.dataVersion;
      expect({ file, dataVersion: declared }).toEqual({
        file,
        dataVersion: DATA_PACKAGE_VERSION,
      });
    }
  });

  test("loaded scenarios expose the package data version", () => {
    expect(loadM2WorldAggregate().dataVersion).toBe(DATA_PACKAGE_VERSION);
    expect(loadM3SmallEconomy().definitions.dataVersion).toBe(DATA_PACKAGE_VERSION);
    expect(loadM3SmallEconomy().population.dataVersion).toBe(DATA_PACKAGE_VERSION);
    expect(loadM5HistoricalData().meta.dataVersion).toBe(DATA_PACKAGE_VERSION);
  });
});
