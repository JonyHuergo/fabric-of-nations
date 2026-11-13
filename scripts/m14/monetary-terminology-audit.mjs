#!/usr/bin/env node
/**
 * M14 RUSD monetary-terminology audit.
 *
 * Fails when obsolete SUSD terminology appears in current player-facing source,
 * generated data, snapshots, current documentation or the current GDD. It
 * distinguishes:
 *
 *   - current RUSD terminology (must be used);
 *   - the audits and tests that look for the former spelling (D-155 removed the
 *     legacy aliases: the reserved key, the hash view and the opening checksum);
 *   - historical milestone documents, GDD versions, change reports and
 *     screenshots that keep their original wording;
 *   - actual USD references, which are distinct and must remain.
 *
 * Run with `pnpm audit:monetary`.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const DIAGNOSTIC = process.argv.includes("--verbose");

const errors = [];
const checked = [];
const allowed = { legacy: 0, historical: 0 };

/**
 * Files that name the former spelling in order to look for it. D-155 removed every
 * legacy alias (the reserved key, the hash view and the opening checksum), so no
 * simulation, data or worker source may mention it.
 */
const LEGACY_COMPATIBILITY_FILES = new Set([
  "packages/tests/src/architecture/naming-audits.test.ts",
  "scripts/m14/monetary-terminology-audit.mjs",
  "scripts/m14/playtest-rusd.mjs",
]);

function isHistorical(relativePath) {
  const name = relativePath.split("/").pop() ?? "";
  return (
    // D-145: GDD editions, change reports, completion reports and milestone records
    // live in docs/archive/; the P4 and P5 completion reports stay at the root until
    // those stages are accepted.
    relativePath.startsWith("docs/archive/") ||
    /_COMPLETION_REPORT\.md$/.test(name) ||
    relativePath === "DECISIONS.md" ||
    relativePath.startsWith("docs/images/")
  );
}

function walk(directory, extensions, output = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === ".expo") continue;
    if (entry.name === "dist" || entry.name.startsWith("dist-")) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) walk(path, extensions, output);
    else if (extensions.some((extension) => entry.name.endsWith(extension))) output.push(path);
  }
  return output;
}

function lineNumberAt(text, index) {
  let line = 1;
  for (let cursor = 0; cursor < index; cursor += 1) if (text[cursor] === "\n") line += 1;
  return line;
}

/**
 * The atlas page embeds binary payloads as base64, where any short word can occur
 * by chance. Long runs are blanked; its code and catalogue text are still scanned.
 */
function withoutBase64Runs(text) {
  const isBase64 = (code) =>
    (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || code === 43 || code === 47 || code === 61;
  let output = "";
  let kept = 0;
  let run = -1;
  for (let index = 0; index <= text.length; index += 1) {
    if (index < text.length && isBase64(text.charCodeAt(index))) {
      if (run < 0) run = index;
    } else {
      if (run >= 0 && index - run >= 1000) {
        output += text.slice(kept, run);
        kept = index;
      }
      run = -1;
    }
  }
  return output + text.slice(kept);
}

function scanFile(path) {
  const relativePath = relative(ROOT, path).replaceAll("\\", "/");
  if (isHistorical(relativePath)) return;
  // The committed worker bundle is generated from the audited source. Its
  // minified legacy alias string is checked by check:worker, and the 2 MB line
  // is not useful audit output.
  if (relativePath === "packages/app/src/generated/simWorker.ts") return;
  const text = withoutBase64Runs(readFileSync(path, "utf8"));
  checked.push(relativePath);
  const pattern = /SUSD|Susd|susd|Simulated US Dollars|Simulated USD|simulated US Dollars|simulated USD/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const lineStart = text.lastIndexOf("\n", match.index) + 1;
    const lineEnd = text.indexOf("\n", match.index);
    const line = text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd);
    if (LEGACY_COMPATIBILITY_FILES.has(relativePath)) {
      allowed.legacy += 1;
      if (DIAGNOSTIC) {
        console.log(
          `allowed legacy: ${relativePath}:${String(lineNumberAt(text, match.index))}: ${line.trim()}`,
        );
      }
      continue;
    }
    if (/formerly\s+\*{0,2}SUSD|formerly\s+\*{0,2}Simulated US Dollars/i.test(line)) {
      allowed.historical += 1;
      if (DIAGNOSTIC) {
        console.log(
          `allowed historical: ${relativePath}:${String(lineNumberAt(text, match.index))}: ${line.trim()}`,
        );
      }
      continue;
    }
    errors.push(
      `${relativePath}:${String(lineNumberAt(text, match.index))}: obsolete SUSD terminology is not rebranded: ${line.trim()}`,
    );
  }
}

function requireEqual(label, actual, expected) {
  if (actual !== expected) {
    errors.push(`${label} is ${JSON.stringify(actual)}; expected ${JSON.stringify(expected)}`);
  }
}

function requireIncludes(label, text, needle) {
  if (!text.includes(needle)) errors.push(`${label} does not contain ${JSON.stringify(needle)}`);
}

/* ------------------------------------------------------------------ */
/* 1. Current text scan                                                */
/* ------------------------------------------------------------------ */

const roots = ["packages", "scripts", "docs"];
const extensions = [".ts", ".tsx", ".mjs", ".js", ".json", ".md", ".html", ".py"];
for (const root of roots) {
  for (const path of walk(join(ROOT, root), extensions)) scanFile(path);
}
for (const name of ["README.md", "AGENTS.md", "Fabric_of_Nations_GDD.md"]) {
  scanFile(join(ROOT, name));
}

/* ------------------------------------------------------------------ */
/* 2. Canonical unit and non-currency identity                         */
/* ------------------------------------------------------------------ */

const constants = readFileSync(join(ROOT, "packages/sim/src/constants.ts"), "utf8");
requireIncludes("canonical RUSD key", constants, 'RUSD_CURRENCY_KEY = "rusd"');
requireIncludes("canonical RUSD name", constants, 'RUSD_UNIT_NAME = "Reference US Dollars"');
requireIncludes("canonical RUSD abbreviation", constants, 'RUSD_UNIT_ABBREVIATION = "RUSD"');

const gdd = readFileSync(join(ROOT, "Fabric_of_Nations_GDD.md"), "utf8");
requireIncludes("current GDD unit definition", gdd, "RUSD` — **Reference US Dollars**");
requireIncludes("current GDD non-currency rule", gdd, "not a currency issued by any country");
requireIncludes("current GDD USD distinction", gdd, "not defined as one real US");

const readme = readFileSync(join(ROOT, "README.md"), "utf8");
requireIncludes("README unit name", readme, "RUSD — Reference US Dollars");
requireIncludes("README non-currency rule", readme, "not a national currency, legal tender");

const moneyScreen = readFileSync(join(ROOT, "packages/app/src/screens/MoneyScreen.tsx"), "utf8");
requireIncludes("Money screen explanation", moneyScreen, "RUSD_UNIT_NAME");
requireIncludes("Money screen measurement explanation", moneyScreen, "standard unit of economic measurement");
requireIncludes("Money screen non-currency explanation", moneyScreen, "not an actual national currency or legal tender");
if (/\bSUSD\b/.test(moneyScreen)) errors.push("Money screen still displays SUSD");

const formatter = readFileSync(join(ROOT, "packages/sim-worker/src/selectors.ts"), "utf8");
requireIncludes("RUSD formatter", formatter, "export function formatRUSD");
requireIncludes("RUSD formatter canonical unit", formatter, "const unit = RUSD_UNIT_ABBREVIATION");

/* ------------------------------------------------------------------ */
/* 3. Data and serialization vocabulary                                */
/* ------------------------------------------------------------------ */

// D-155: the 1900 world's goods catalogue (the M3 catalogue moved to the test fixtures).
const goods = JSON.parse(readFileSync(join(ROOT, "packages/data/data/historical/p5b/goods_1900.json"), "utf8"));
const goodsText = JSON.stringify(goods);
requireIncludes("goods base price key", goodsText, "basePrice1900RUSD");
if (/SUSD/.test(goodsText)) errors.push("goods data still contains SUSD keys");

const countriesText = readFileSync(
  join(ROOT, "packages/data/data/historical/m11/countries_1900.json"),
  "utf8",
);
requireIncludes("actual USD national currency", countriesText, '"key": "usd"');
if (/"key":\s*"(rusd|susd)"/.test(countriesText)) {
  errors.push("the reference unit is registered as a national currency");
}

const serialization = readFileSync(join(ROOT, "packages/sim/src/serialization.ts"), "utf8");
// D-137: save format 2 rejects every format-1 save as incompatible before decoding;
// D-155 removed the last legacy spellings (hash view, opening checksum).
requireIncludes("format-1 saves rejected as incompatible", serialization, "is incompatible with this build");
requireIncludes("canonical RUSD save fields", serialization, "balanceRUSD");


/* ------------------------------------------------------------------ */
/* 4. Save envelope and protocol status                                */
/* ------------------------------------------------------------------ */

requireIncludes("save format unchanged", serialization, 'format: "century-save"');
requireIncludes("save format version unchanged", serialization, "formatVersion: SAVE_FORMAT_VERSION");
const protocol = readFileSync(join(ROOT, "packages/sim-worker/src/protocol.ts"), "utf8");
// 18: D-137 stored save form on SAVE_RESULT/LOAD; 19: P3 (D-141) currency link and
// valuation history in the snapshot; 20: P4 (D-142) demography in the snapshot and the
// province focus command; 21: P5 (D-143) province ownership columns, harvest column and
// province land (the m14 test pins the value).
requireIncludes("worker protocol version", protocol, "PROTOCOL_VERSION = 24");
if (!existsSync(join(ROOT, "docs/archive/milestones/M14_RUSD_RENAMING_REPORT.md"))) {
  errors.push("the M14 renaming report is missing");
}

/* ------------------------------------------------------------------ */
/* 5. Result                                                           */
/* ------------------------------------------------------------------ */

if (errors.length > 0) {
  console.error(`Monetary terminology audit failed (${String(errors.length)} problem(s)):`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exitCode = 1;
} else {
  console.log(
    `Monetary terminology audit passed: ${String(checked.length)} current files scanned, ` +
      `${String(allowed.legacy)} documented legacy alias reference(s) and ` +
      `${String(allowed.historical)} historical reference(s) deliberately allowed.`,
  );
}
