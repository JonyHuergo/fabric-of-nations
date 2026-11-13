/**
 * Simulation isolation and the No-Mana Doctrine (AGENTS.md §3).
 * Merged in D-145 from `architecture.test.ts` and `no-mana.test.ts`.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../../..");
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

/**
 * Blank comments and string/template contents, keeping every other character and every
 * newline in place (the output has the input's length). D-155: the characters are written
 * to a code-unit buffer and decoded once; appending them one by one to a string built a
 * rope of tens of millions of nodes for the generated bundles (over 1 GB of heap).
 */
function stripCommentsAndStrings(source: string): string {
  const out = new Uint16Array(source.length);
  let written = 0;
  const SPACE = 32;
  const NEWLINE = 10;
  const put = (code: number): void => {
    out[written] = code;
    written += 1;
  };
  const blank = (char: string): number => (char === "\n" ? NEWLINE : SPACE);
  let state = "code";
  let index = 0;

  while (index < source.length) {
    const char = source[index] ?? "";
    const next = source[index + 1] ?? "";

    if (state === "code") {
      if (char === "/" && next === "/") {
        state = "line";
        put(SPACE);
        put(SPACE);
        index += 2;
      } else if (char === "/" && next === "*") {
        state = "block";
        put(SPACE);
        put(SPACE);
        index += 2;
      } else if (char === "'" || char === '"') {
        state = char;
        put(SPACE);
        index += 1;
      } else if (char === "`") {
        state = "template";
        put(SPACE);
        index += 1;
      } else {
        put(source.charCodeAt(index));
        index += 1;
      }
      continue;
    }

    if (state === "line") {
      if (char === "\n") {
        state = "code";
        put(NEWLINE);
      } else {
        put(SPACE);
      }
      index += 1;
      continue;
    }

    if (state === "block") {
      if (char === "*" && next === "/") {
        state = "code";
        put(SPACE);
        put(SPACE);
        index += 2;
      } else {
        put(blank(char));
        index += 1;
      }
      continue;
    }

    if (char === "\\") {
      put(blank(char));
      if (next !== "") put(blank(next));
      index += 2;
      continue;
    }
    if ((state === "template" && char === "`") || (state !== "template" && char === state)) {
      state = "code";
      put(SPACE);
      index += 1;
      continue;
    }
    put(blank(char));
    index += 1;
  }

  let output = "";
  const CHUNK = 0x8000;
  for (let start = 0; start < written; start += CHUNK) {
    output += String.fromCharCode(...out.subarray(start, Math.min(written, start + CHUNK)));
  }
  return output;
}

/** Public worker subpaths the app may import. The root barrel is always allowed. */
const APP_WORKER_PUBLIC_SUBPATHS = new Set(["@century/sim-worker", "@century/sim-worker/persistence"]);

function importSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const patterns = [
    /\b(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      if (match[1] !== undefined) specifiers.push(match[1]);
    }
  }
  return specifiers;
}

function appImportAllowed(specifier: string): boolean {
  if (specifier === "@century/sim" || specifier.startsWith("@century/sim/")) return false;
  if (specifier === "@century/data" || specifier.startsWith("@century/data/")) return false;
  if (specifier !== "@century/sim-worker" && !specifier.startsWith("@century/sim-worker/")) {
    return true;
  }
  return APP_WORKER_PUBLIC_SUBPATHS.has(specifier);
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

  test("the app consumes snapshots/protocol only and never simulation internals", () => {
    const appSource = walk(
      join(PACKAGES, "app"),
      (path) =>
        (path.endsWith(".ts") || path.endsWith(".tsx")) && !path.includes("generated"),
    );
    expect(appSource.length).toBeGreaterThan(0);
    let importsWorkerContract = false;
    let importsPersistenceContract = false;
    for (const file of appSource) {
      const source = readFileSync(file, "utf8");
      const specifiers = importSpecifiers(source);
      for (const specifier of specifiers) {
        expect({ file: relative(ROOT, file), specifier, allowed: appImportAllowed(specifier) }).toEqual({
          file: relative(ROOT, file),
          specifier,
          allowed: true,
        });
        if (specifier === "@century/sim-worker") importsWorkerContract = true;
        if (specifier === "@century/sim-worker/persistence") importsPersistenceContract = true;
      }
      expect(source).not.toMatch(
        /\b(createEconomyWorld|serializeWorld|deserializeWorld|runEconomicDay|assertValidWorld)\b/,
      );
    }
    expect(importsWorkerContract).toBe(true);
    expect(importsPersistenceContract).toBe(true);

    // The committed bundle is opaque generated worker script, not an app import
    // escape hatch: it must expose only these bundle constants and must not
    // import simulation/data modules itself.
    const generatedPath = join(PACKAGES, "app", "src", "generated", "simWorker.ts");
    const generated = readFileSync(generatedPath, "utf8");
    const generatedExports = [...generated.matchAll(/^export const ([A-Z0-9_]+)/gm)].map(
      (match) => match[1],
    );
    expect(generatedExports.sort()).toEqual([
      "SIM_WORKER_BUNDLE_BYTES",
      "SIM_WORKER_HTML",
      "SIM_WORKER_HTML_BYTES",
      "SIM_WORKER_SCRIPT",
    ]);
    expect(generated).not.toMatch(/@century\/(sim|data)/);

    const workerAppEntry = readFileSync(
      join(PACKAGES, "sim-worker", "src", "index.ts"),
      "utf8",
    );
    expect(workerAppEntry).not.toMatch(/@century\/sim|@century\/data/);
  });

  test("app import allowlist rejects internal worker and simulation subpaths", () => {
    const allowed = [
      "@century/sim-worker",
      "@century/sim-worker/persistence",
      "react",
      "node:fs",
      "../generated/simWorker",
    ];
    const denied = [
      "@century/sim-worker/host",
      "@century/sim-worker/snapshot",
      "@century/sim-worker/node",
      "@century/sim",
      "@century/sim/economy",
      "@century/data",
      "@century/data/load",
    ];
    for (const specifier of allowed) {
      expect({ specifier, allowed: appImportAllowed(specifier) }).toEqual({
        specifier,
        allowed: true,
      });
    }
    for (const specifier of denied) {
      expect({ specifier, allowed: appImportAllowed(specifier) }).toEqual({
        specifier,
        allowed: false,
      });
    }
  });

  test("app import fixtures distinguish supported contracts from privileged paths", () => {
    const fixtureDir = join(HERE, "../fixtures", "app-boundary");
    const allowedSpecifiers = importSpecifiers(
      readFileSync(join(fixtureDir, "allowed.txt"), "utf8"),
    );
    const forbiddenSpecifiers = importSpecifiers(
      readFileSync(join(fixtureDir, "forbidden.txt"), "utf8"),
    );
    expect(allowedSpecifiers.length).toBeGreaterThan(0);
    expect(forbiddenSpecifiers.length).toBeGreaterThan(0);
    for (const specifier of allowedSpecifiers) {
      expect({ specifier, allowed: appImportAllowed(specifier) }).toEqual({
        specifier,
        allowed: true,
      });
    }
    for (const specifier of forbiddenSpecifiers) {
      expect({ specifier, allowed: appImportAllowed(specifier) }).toEqual({
        specifier,
        allowed: false,
      });
    }
  });

  test("simulation code does not import calibration targets or the data package", () => {
    for (const file of simSourceFiles) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(/@century\/data|m2_population_targets|calibration\/m2/);
    }
  });
});

// No-Mana Doctrine (AGENTS.md §3): no spendable pools in runtime source, and a raw-text
// Math.random scan of sim, data, app and bench (stricter than the comment-stripped scan
// above because it also reads comments and strings).
describe("No-Mana Doctrine guard", () => {
  test("runtime source contains no known forbidden spendable pools", () => {
    const runtimeDirs = [
      join(PACKAGES, "sim", "src"),
      join(PACKAGES, "data", "src"),
      join(PACKAGES, "app", "src"),
      join(PACKAGES, "bench", "src"),
    ];

    const forbidden =
      /\bresearchPoints\b|\bpoliticalPower(?:Points)?\b|\bpoliticalPoints\b|\bdiplomaticPoints\b|\badministrativeCapacityPoints\b|\bcommandPoints\b|\bwarScore\b|\bmana(?:Pool|Points)?\b/i;

    for (const directory of runtimeDirs) {
      for (const file of walk(directory, (path) => path.endsWith(".ts"))) {
        const source = readFileSync(file, "utf8");
        expect({ file: relative(ROOT, file), forbidden: forbidden.test(source) }).toEqual({
          file: relative(ROOT, file),
          forbidden: false,
        });
      }
    }
  });

  test("no package source uses an ambient random stream", () => {
    const sourceFiles = [
      ...walk(join(PACKAGES, "sim", "src"), (path) => path.endsWith(".ts")),
      ...walk(join(PACKAGES, "data", "src"), (path) => path.endsWith(".ts")),
      ...walk(join(PACKAGES, "app", "src"), (path) => path.endsWith(".ts")),
      ...walk(join(PACKAGES, "bench", "src"), (path) => path.endsWith(".ts")),
    ];
    for (const file of sourceFiles) {
      const source = readFileSync(file, "utf8");
      expect({ file: relative(ROOT, file), random: /\bMath\s*\.\s*random\s*\(/.test(source) }).toEqual({
        file: relative(ROOT, file),
        random: false,
      });
    }
  });
});
