#!/usr/bin/env node
/**
 * P2 (D-128): after repair-provinces.mjs and repair-borders-1900.mjs change the province
 * bundles, rewrite the app's generated province modules from them and refresh the
 * province counts in the bundle audits. The M12 builders are not re-run, because they
 * would rebuild the pre-repair geometry from the Natural Earth sources.
 *
 * P2 (D-118): the M12 field `simulationRegionId` is deleted from every province here,
 * because provinces are the economic unit and the region layer no longer exists; the
 * repair scripts start from the M12 bundles, which still carry it.
 *
 * Usage: node scripts/p2/sync-app-provinces.mjs [--check]
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const MAP_DIR = join(ROOT, "packages/data/data/map");
const APP_DIR = join(ROOT, "packages/app/src/generated");
const PAIRS = [
  ["provinces_1900", "provinces1900"],
  ["provinces_asia_1900", "provincesAsia1900"],
  ["provinces_africa_1900", "provincesAfrica1900"],
  ["provinces_americas_1900", "provincesAmericas1900"],
  ["provinces_oceania_1900", "provincesOceania1900"],
];
const checkOnly = process.argv.includes("--check");
const stale = [];

for (const [bundleName, moduleName] of PAIRS) {
  const bundlePath = join(MAP_DIR, `${bundleName}.json`);
  const json = readFileSync(bundlePath, "utf8").trim();
  const bundle = JSON.parse(json);
  if (bundle.provinces.some((province) => "simulationRegionId" in province)) {
    for (const province of bundle.provinces) delete province.simulationRegionId;
    stale.push(bundlePath);
    if (!checkOnly) writeFileSync(bundlePath, JSON.stringify(bundle), "utf8");
  }
  const modulePath = join(APP_DIR, `${moduleName}.ts`);
  const source = readFileSync(modulePath, "utf8");
  const match = /export const ([A-Z0-9_]+) = \(/.exec(source);
  const tail = ") as unknown as ProvinceMapData;";
  const end = source.lastIndexOf(tail);
  if (match === null || end < 0) throw new Error(`${modulePath}: unexpected module shape`);
  const start = match.index + match[0].length;
  const next = `${source.slice(0, start)}${JSON.stringify(bundle)}${source.slice(end)}`;
  if (next !== source) {
    stale.push(modulePath);
    if (!checkOnly) writeFileSync(modulePath, next, "utf8");
  }
  const auditPath = join(MAP_DIR, `${bundleName}_audit.json`);
  const audit = JSON.parse(readFileSync(auditPath, "utf8"));
  if (typeof audit.provinceCount === "number" && audit.provinceCount !== bundle.provinces.length) {
    stale.push(auditPath);
    if (!checkOnly) {
      audit.provinceCount = bundle.provinces.length;
      audit.p2Repair = "province geometry repaired by scripts/p2 (D-128); see province_repair_report.json";
      writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
    }
  }
}

if (checkOnly && stale.length > 0) {
  console.error(`stale after the P2 province repair:\n  ${stale.join("\n  ")}`);
  process.exit(1);
}
console.log(checkOnly ? "app province modules are current" : `updated ${stale.length} file(s)`);
