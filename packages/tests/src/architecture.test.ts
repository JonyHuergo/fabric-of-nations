import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");
const PACKAGES = join(ROOT, "packages");
const SIM = join(PACKAGES, "sim");

interface TsConfigShape {
  compilerOptions?: {
    lib?: unknown;
    types?: unknown;
  };
}

interface PackageShape {
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

function walk(directory: string, predicate: (path: string) => boolean): string[] {
  const results: string[] = [];
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

function stripCommentsAndStrings(source: string): string {
  let output = "";
  let state = "code";
  let index = 0;
  const blank = (char: string): string => (char === "\n" ? "\n" : " ");

  while (index < source.length) {
    const char = source[index] ?? "";
    const next = source[index + 1] ?? "";

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

    if (char === "\\") {
      output += blank(char);
      if (next !== "") output += blank(next);
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

describe("simulation isolation", () => {
  const simSourceFiles = walk(join(SIM, "src"), (path) => path.endsWith(".ts"));

  test("packages/sim compiles with ES2022 only and no ambient platform types", () => {
    const tsconfig = JSON.parse(readFileSync(join(SIM, "tsconfig.json"), "utf8")) as TsConfigShape;
    expect(tsconfig.compilerOptions?.lib).toEqual(["ES2022"]);
    expect(tsconfig.compilerOptions?.types).toEqual([]);
  });

  test("packages/sim has no runtime dependencies", () => {
    const manifest = JSON.parse(readFileSync(join(SIM, "package.json"), "utf8")) as PackageShape;
    expect(manifest.dependencies ?? {}).toEqual({});
    expect(manifest.peerDependencies ?? {}).toEqual({});
    expect(manifest.optionalDependencies ?? {}).toEqual({});
  });

  test("packages/sim imports only relative compiled modules", () => {
    for (const file of simSourceFiles) {
      const source = readFileSync(file, "utf8");
      const importPatterns = [
        /\b(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g,
        /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
      ];
      for (const pattern of importPatterns) {
        for (const match of source.matchAll(pattern)) {
          const specifier = match[1] ?? "";
          expect({ file: relative(ROOT, file), specifier }).toEqual({
            file: relative(ROOT, file),
            specifier: expect.stringMatching(/^\.\.?\/.*\.js$/),
          });
          const relativeToSimSource = relative(
            join(SIM, "src"),
            resolve(dirname(file), specifier),
          );
          expect({
            file: relative(ROOT, file),
            specifier,
            escapesSimSource: relativeToSimSource.startsWith(".."),
          }).toEqual({
            file: relative(ROOT, file),
            specifier,
            escapesSimSource: false,
          });
        }
      }
    }
  });

  test("packages/sim code contains no host, browser, Node, or entropy APIs", () => {
    const forbidden: ReadonlyArray<readonly [RegExp, string]> = [
      [/\bMath\s*\.\s*random\s*\(/, "Math.random"],
      [/\bDate\b/, "Date"],
      [/\bperformance\s*\./, "performance"],
      [/\bwindow\b/, "window"],
      [/\bdocument\b/, "document"],
      [/\bnavigator\b/, "navigator"],
      [/\blocalStorage\b/, "localStorage"],
      [/\bfetch\s*\(/, "fetch"],
      [/\brequire\s*\(/, "require"],
      [/\bprocess\s*\./, "process"],
      [/\bglobalThis\b/, "globalThis"],
      [/\bsetTimeout\s*\(/, "setTimeout"],
      [/\bsetInterval\s*\(/, "setInterval"],
      [/\bconsole\s*\./, "console"],
    ];

    for (const file of simSourceFiles) {
      const code = stripCommentsAndStrings(readFileSync(file, "utf8"));
      for (const [pattern, name] of forbidden) {
        expect({ file: relative(ROOT, file), api: name, found: pattern.test(code) }).toEqual({
          file: relative(ROOT, file),
          api: name,
          found: false,
        });
      }
    }
  });

  test("no package source calls Math.random", () => {
    const allSource = walk(PACKAGES, (path) => path.endsWith(".ts"));
    for (const file of allSource) {
      const code = stripCommentsAndStrings(readFileSync(file, "utf8"));
      expect({ file: relative(ROOT, file), random: /\bMath\s*\.\s*random\s*\(/.test(code) }).toEqual({
        file: relative(ROOT, file),
        random: false,
      });
    }
  });

  test("the app package is a placeholder with no simulation imports", () => {
    const appSource = walk(join(PACKAGES, "app", "src"), (path) => path.endsWith(".ts"));
    expect(appSource.length).toBeGreaterThan(0);
    for (const file of appSource) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(
        /\bfrom\s+['"]@century\/sim['"]|\bimport\s*\(\s*['"]@century\/sim['"]/,
      );
    }
  });
});
