#!/usr/bin/env node
/**
 * Fabric of Nations branding audit.
 *
 * The rebranding must be complete for everything a player can see, while
 * deliberately retained save/package identifiers and historical documents are
 * allowed to keep the old name. This audit therefore has two jobs:
 *
 *   1. fail when "Century" appears in current player-facing source, current
 *      generated content, project metadata or current documentation unless the
 *      occurrence is an explicitly allowed internal identifier or a documented
 *      historical reference;
 *   2. verify the browser/PWA/application metadata, the current GDD/README and
 *      the save compatibility constants directly.
 *
 * Run with `pnpm audit:branding`. Add `--dist` after an export to also inspect
 * the built `packages/app/dist-web` output. Add `--verbose` to list every
 * allowed historical/internal occurrence.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const checkDist = process.argv.includes("--dist");
const verbose = process.argv.includes("--verbose");

const BRAND = "Fabric of Nations";
const OLD_FAVICON_SHA256 = "5c98f7ead0d6df5934093b631ea565beb031a636908b1245dc55cd10ccbf542f";
const CURRENT_GDD = "Fabric_of_Nations_GDD.md";

const errors = [];
const checked = [];
const allowed = { internal: 0, historical: 0 };

/**
 * Occurrences that are intentionally retained. Each pattern is narrow enough
 * that a normal player-facing sentence cannot hide behind it.
 */
const ALLOWED_PATTERNS = [
  { kind: "internal", pattern: /@century\// },
  { kind: "internal", pattern: /\bCenturyRoot\b/ },
  { kind: "internal", pattern: /\brunCentury\b/ },
  { kind: "internal", pattern: /\b__centuryReceive\b/ },
  { kind: "internal", pattern: /\bcentury-save-gzip1:/ },
  { kind: "internal", pattern: /\bcentury-save\b/ },
  { kind: "internal", pattern: /\bcentury\.m7\.save\.v1\b/ },
  { kind: "historical", pattern: /\bCentury_GDD_v2\.\d+\b/ },
  { kind: "historical", pattern: /\bCentury-era\b/ },
  { kind: "historical", pattern: /\bCentury-scale\b/ },
  { kind: "historical", pattern: /\bformerly\s+\*?Century\*?/i },
];

/** Historical documents are preserved byte-for-byte, not rebranded. */
function isHistorical(relativePath) {
  const name = relativePath.split("/").pop() ?? "";
  return (
    /^Century_GDD_v2/.test(name) ||
    /^GDD_V2.*_CHANGE_REPORT\.md$/.test(name) ||
    /_COMPLETION_REPORT\.md$/.test(name) ||
    relativePath === "DECISIONS.md" ||
    relativePath.startsWith("docs/images/") ||
    relativePath === "docs/M11D_PLAYTEST_REPORT.md" ||
    relativePath === "docs/M11E_RUNTIME_ERRORS_REPORT.md" ||
    relativePath === "docs/M13_REBRANDING_REPORT.md" ||
    relativePath === "docs/M14_RUSD_RENAMING_REPORT.md" ||
    relativePath === "packages/tests/src/fixtures/century-era-save.json" ||
    relativePath === "packages/tests/src/architecture/naming-audits.test.ts" ||
    relativePath === "scripts/m13/branding-audit.mjs" ||
    relativePath === "scripts/m13/playtest-rebrand.mjs" ||
    relativePath === "scripts/m14/monetary-terminology-audit.mjs" ||
    relativePath === "scripts/m14/playtest-rusd.mjs"
  );
}

function walk(directory, extensions, output = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === ".expo") continue;
    if (entry.name === "dist" || entry.name.startsWith("dist-")) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(path, extensions, output);
    } else if (extensions.some((extension) => entry.name.endsWith(extension))) {
      output.push(path);
    }
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
  // The minified worker bundle is generated and validated by check:worker. Its
  // only old-name token is the internal __centuryReceive bridge, which is
  // deliberately retained. Scanning it line-wise would only print a 2 MB line.
  if (relativePath === "packages/app/src/generated/simWorker.ts") return;
  const text = withoutBase64Runs(readFileSync(path, "utf8"));
  checked.push(relativePath);
  const pattern = /CENTURY|Century/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const lineStart = text.lastIndexOf("\n", match.index) + 1;
    const lineEnd = text.indexOf("\n", match.index);
    const line = text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd);
    const allowance = ALLOWED_PATTERNS.find((candidate) => candidate.pattern.test(line));
    if (allowance !== undefined) {
      allowed[allowance.kind] += 1;
      if (verbose) {
        console.log(
          `allowed ${allowance.kind}: ${relativePath}:${String(lineNumberAt(text, match.index))}: ${line.trim()}`,
        );
      }
      continue;
    }
    errors.push(
      `${relativePath}:${String(lineNumberAt(text, match.index))}: player-facing "${match[0]}" is not rebranded: ${line.trim()}`,
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

function pngSize(path) {
  const buffer = readFileSync(path);
  if (buffer.toString("ascii", 1, 4) !== "PNG") return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/* ------------------------------------------------------------------ */
/* 1. Text scan                                                        */
/* ------------------------------------------------------------------ */

const roots = [
  join(ROOT, "packages"),
  join(ROOT, "scripts"),
  join(ROOT, "docs"),
];
const extensions = [".ts", ".tsx", ".mjs", ".js", ".json", ".md", ".html", ".webmanifest", ".py"];
for (const root of roots) {
  for (const path of walk(root, extensions)) scanFile(path);
}
for (const name of ["README.md", "AGENTS.md", CURRENT_GDD, "package.json"]) {
  const path = join(ROOT, name);
  if (existsSync(path)) scanFile(path);
}

/* ------------------------------------------------------------------ */
/* 2. Application and web metadata                                     */
/* ------------------------------------------------------------------ */

const appRoot = join(ROOT, "packages/app");
const appConfig = JSON.parse(readFileSync(join(appRoot, "app.json"), "utf8")).expo;
requireEqual("Expo application name", appConfig.name, BRAND);
requireEqual("Expo project slug", appConfig.slug, "fabric-of-nations");
requireEqual("Expo web name", appConfig.web?.name, BRAND);
requireEqual("Expo web shortName", appConfig.web?.shortName, BRAND);
requireEqual("Expo web lang", appConfig.web?.lang, "en");
requireEqual("Expo display name", appConfig.name, BRAND);

for (const [label, path] of [
  ["application icon", join(appRoot, "assets/icon.png")],
  ["favicon source", join(appRoot, "assets/favicon.png")],
  ["Android adaptive icon", join(appRoot, "assets/adaptive-icon.png")],
  ["PWA 192 icon", join(appRoot, "public/icons/icon-192.png")],
  ["PWA 512 icon", join(appRoot, "public/icons/icon-512.png")],
  ["PWA maskable icon", join(appRoot, "public/icons/maskable-512.png")],
  ["apple touch icon", join(appRoot, "public/icons/apple-touch-icon.png")],
]) {
  if (!existsSync(path)) {
    errors.push(`missing ${label}: ${relative(ROOT, path)}`);
    continue;
  }
  const size = pngSize(path);
  if (size === null) errors.push(`${label} is not a PNG: ${relative(ROOT, path)}`);
  else if (size.width !== size.height) errors.push(`${label} is not square: ${String(size.width)}x${String(size.height)}`);
}
const faviconPath = join(appRoot, "assets/favicon.png");
if (existsSync(faviconPath) && sha256(faviconPath) === OLD_FAVICON_SHA256) {
  errors.push("favicon is still the obsolete Century 'C' asset");
}

const indexHtml = readFileSync(join(appRoot, "public/index.html"), "utf8");
requireIncludes("web index.html", indexHtml, "<title>%WEB_TITLE%</title>");
requireIncludes("web index.html", indexHtml, 'rel="manifest"');
requireIncludes("web index.html", indexHtml, "Fabric of Nations");

const manifest = JSON.parse(readFileSync(join(appRoot, "public/manifest.webmanifest"), "utf8"));
requireEqual("PWA manifest name", manifest.name, BRAND);
requireEqual("PWA manifest short_name", manifest.short_name, BRAND);
requireEqual("PWA manifest display", manifest.display, "standalone");
requireEqual("PWA manifest theme_color", manifest.theme_color, "#0d1419");
if (!Array.isArray(manifest.icons) || manifest.icons.length < 3) {
  errors.push("PWA manifest must declare any, 512px and maskable icons");
}

/* ------------------------------------------------------------------ */
/* 3. Current documentation                                            */
/* ------------------------------------------------------------------ */

const gddPath = join(ROOT, CURRENT_GDD);
if (!existsSync(gddPath)) {
  errors.push(`current GDD ${CURRENT_GDD} is missing`);
} else {
  const gdd = readFileSync(gddPath, "utf8");
  const firstLine = gdd.split("\n")[0] ?? "";
  if (!/FABRIC OF NATIONS/i.test(firstLine)) {
    errors.push(`current GDD title does not name Fabric of Nations: ${firstLine}`);
  }
}
const readme = readFileSync(join(ROOT, "README.md"), "utf8");
if (!/^#\s+Fabric of Nations\b/m.test(readme)) {
  errors.push("README title does not name Fabric of Nations");
}
const agents = readFileSync(join(ROOT, "AGENTS.md"), "utf8");
if (!/^#\s+Fabric of Nations\b/m.test(agents)) {
  errors.push("AGENTS.md title does not name Fabric of Nations");
}
if (!existsSync(join(ROOT, "docs/M13_REBRANDING_REPORT.md"))) {
  errors.push("the M13 rebranding report is missing");
}

/* ------------------------------------------------------------------ */
/* 4. Save compatibility constants                                     */
/* ------------------------------------------------------------------ */

const persistence = readFileSync(join(ROOT, "packages/sim-worker/src/persistence.ts"), "utf8");
const serialization = readFileSync(join(ROOT, "packages/sim/src/serialization.ts"), "utf8");
requireIncludes("save storage prefix", persistence, 'COMPRESSED_SAVE_PREFIX = "century-save-gzip1:"');
requireIncludes("primary save storage key", persistence, '"century.m7.save.v1"');
requireIncludes("previous save storage key", persistence, '"century.m7.save.v1.previous"');
requireIncludes("staging save storage key", persistence, '"century.m7.save.v1.staging"');
requireIncludes("save envelope format", serialization, 'format: "century-save"');
requireIncludes("save format parser", serialization, 'format !== "century-save"');

/* ------------------------------------------------------------------ */
/* 5. Optional exported web output                                     */
/* ------------------------------------------------------------------ */

if (checkDist) {
  const distRoot = join(appRoot, "dist-web");
  const indexPath = join(distRoot, "index.html");
  if (!existsSync(indexPath)) {
    errors.push("dist-web/index.html is missing; run pnpm -F @century/app export:web");
  } else {
    const exported = readFileSync(indexPath, "utf8");
    requireIncludes("exported browser tab title", exported, `<title>${BRAND}</title>`);
    requireIncludes("exported PWA manifest link", exported, "manifest.webmanifest");
    requireIncludes("exported theme colour", exported, 'name="theme-color" content="#0d1419"');
    for (const path of [
      join(distRoot, "manifest.webmanifest"),
      join(distRoot, "favicon.ico"),
      join(distRoot, "icons/icon-192.png"),
      join(distRoot, "icons/icon-512.png"),
      join(distRoot, "icons/maskable-512.png"),
      join(distRoot, "icons/apple-touch-icon.png"),
    ]) {
      if (!existsSync(path)) errors.push(`exported web asset is missing: ${relative(ROOT, path)}`);
    }
  }
}

/* ------------------------------------------------------------------ */
/* 6. Result                                                           */
/* ------------------------------------------------------------------ */

if (errors.length > 0) {
  console.error(`Branding audit failed (${String(errors.length)} problem(s)):`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exitCode = 1;
} else {
  console.log(
    `Branding audit passed: ${String(checked.length)} current files scanned, ` +
      `${String(allowed.internal)} internal identifier reference(s) and ` +
      `${String(allowed.historical)} historical reference(s) deliberately allowed` +
      `${checkDist ? ", exported web output verified" : ""}.`,
  );
}
