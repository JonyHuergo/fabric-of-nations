#!/usr/bin/env node
/**
 * Dependency-free boundary checks for the Century monorepo.
 *
 * This is a guardrail, not a replacement for tests or TypeScript. It inspects
 * source after removing comments and string/template contents so documentation
 * that mentions a forbidden API does not trigger a false positive.
 *
 * Rules:
 * - `Math.random` is banned in every package source file.
 * - `packages/sim` may not use host time, platform/browser APIs, Node APIs,
 *   ambient entropy, external imports, or explicit `any`.
 * - `packages/sim/tsconfig.json` must compile with only `lib: ["ES2022"]` and no
 *   ambient `@types`, and the package must have no runtime dependencies.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const PACKAGES = join(ROOT, "packages");
const SIM = join(PACKAGES, "sim");
const SIM_SRC_PREFIX = `${resolve(SIM, "src")}${sep}`;

const errors = [];

function rel(path) {
  return relative(ROOT, path).replaceAll("\\", "/");
}

function walk(directory, predicate) {
  const results = [];
  for (const entry of readdirSync(directory)) {
    const full = join(directory, entry);
    const info = statSync(full);
    if (info.isDirectory()) {
      if (entry === "node_modules" || entry === "dist" || entry === "coverage") continue;
      results.push(...walk(full, predicate));
    } else if (predicate(full)) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Replace comments and string/template contents with spaces while preserving
 * newlines, so line-oriented matching stays meaningful.
 */
function stripCommentsAndStrings(source) {
  let output = "";
  let state = "code";
  let index = 0;

  const blank = (char) => (char === "\n" ? "\n" : " ");

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];

    if (state === "code") {
      if (char === "/" && next === "/") {
        state = "line";
        output += "  ";
        index += 2;
      } else if (char === "/" && next === "*") {
        state = "block";
        output += "  ";
        index += 2;
      } else if (char === "'" || char === '"') {
        state = char;
        output += " ";
        index += 1;
      } else if (char === "`") {
        state = "template";
        output += " ";
        index += 1;
      } else {
        output += char;
        index += 1;
      }
      continue;
    }

    if (state === "line") {
      if (char === "\n") {
        state = "code";
        output += "\n";
      } else {
        output += " ";
      }
      index += 1;
      continue;
    }

    if (state === "block") {
      if (char === "*" && next === "/") {
        state = "code";
        output += "  ";
        index += 2;
      } else {
        output += blank(char);
        index += 1;
      }
      continue;
    }

    // Single-quoted, double-quoted, or template literal content.
    if (char === "\\") {
      output += blank(char);
      if (next !== undefined) output += blank(next);
      index += 2;
      continue;
    }
    if ((state === "template" && char === "`") || (state !== "template" && char === state)) {
      state = "code";
      output += " ";
      index += 1;
      continue;
    }
    output += blank(char);
    index += 1;
  }

  return output;
}

function report(file, message) {
  errors.push(`${rel(file)}: ${message}`);
}

const sourceFiles = walk(PACKAGES, (path) => path.endsWith(".ts"));
const simSourceFiles = sourceFiles.filter((path) => path.startsWith(`${SIM}${sep}`));
const simForbidden = [
  [/\bMath\s*\.\s*random\s*\(/, "Math.random() is forbidden"],
  [/\bDate\b/, "Date/host calendar APIs are forbidden"],
  [/\bperformance\s*\./, "performance APIs are forbidden"],
  [/\bwindow\b/, "browser window API is forbidden"],
  [/\bdocument\b/, "DOM document API is forbidden"],
  [/\bnavigator\b/, "browser navigator API is forbidden"],
  [/\blocalStorage\b/, "browser storage API is forbidden"],
  [/\bfetch\s*\(/, "network fetch is forbidden"],
  [/\brequire\s*\(/, "CommonJS require is forbidden"],
  [/\bprocess\s*\./, "Node process APIs are forbidden"],
  [/\bglobalThis\b/, "global object access is forbidden"],
  [/\bsetTimeout\s*\(/, "timers are forbidden"],
  [/\bsetInterval\s*\(/, "timers are forbidden"],
  [/\bconsole\s*\./, "console output is forbidden"],
];

for (const file of sourceFiles) {
  const source = readFileSync(file, "utf8");
  const code = stripCommentsAndStrings(source);

  if (/\bMath\s*\.\s*random\s*\(/.test(code)) {
    report(file, "Math.random() is forbidden in packages/");
  }

  if (!file.startsWith(`${SIM}${sep}`)) continue;

  for (const [pattern, message] of simForbidden) {
    if (pattern.test(code)) report(file, message);
  }

  if (/(?::\s*any\b|\bas\s+any\b|<any>|\bany\s*\[\s*\])/.test(code)) {
    report(file, "explicit any is forbidden in packages/sim");
  }

  const importPatterns = [
    /\b(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const importPattern of importPatterns) {
    for (const match of source.matchAll(importPattern)) {
      const specifier = match[1];
      if (!specifier.startsWith(".") || !specifier.endsWith(".js")) {
        report(
          file,
          `simulation import ${JSON.stringify(specifier)} must be a relative .js path`,
        );
        continue;
      }
      const resolved = resolve(dirname(file), specifier);
      if (!resolved.startsWith(SIM_SRC_PREFIX)) {
        report(
          file,
          `simulation import ${JSON.stringify(specifier)} resolves outside packages/sim/src`,
        );
      }
    }
  }
}

const simPackage = JSON.parse(readFileSync(join(SIM, "package.json"), "utf8"));
for (const field of ["dependencies", "peerDependencies", "optionalDependencies"]) {
  const value = simPackage[field];
  if (value !== undefined && Object.keys(value).length > 0) {
    errors.push(`packages/sim/package.json: ${field} must be empty for the pure simulation package`);
  }
}

const simTsconfig = JSON.parse(readFileSync(join(SIM, "tsconfig.json"), "utf8"));
const options = simTsconfig.compilerOptions ?? {};
if (JSON.stringify(options.lib) !== JSON.stringify(["ES2022"])) {
  errors.push('packages/sim/tsconfig.json: lib must be exactly ["ES2022"]');
}
if (JSON.stringify(options.types) !== JSON.stringify([])) {
  errors.push("packages/sim/tsconfig.json: types must be [] to exclude ambient platform types");
}

if (errors.length > 0) {
  console.error("Boundary checks failed:");
  for (const error of errors) console.error(`  - ${error}`);
  process.exitCode = 1;
} else {
  console.log(
    `Boundary checks passed (${String(sourceFiles.length)} TypeScript files, ${String(simSourceFiles.length)} in packages/sim).`,
  );
}
