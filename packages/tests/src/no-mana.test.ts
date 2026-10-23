import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");
const PACKAGES = join(ROOT, "packages");

function walk(directory: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(directory)) {
    const full = join(directory, entry);
    const info = statSync(full);
    if (info.isDirectory()) {
      if (entry === "node_modules" || entry === "dist" || entry === "coverage") continue;
      results.push(...walk(full));
    } else if (full.endsWith(".ts")) {
      results.push(full);
    }
  }
  return results;
}

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
      for (const file of walk(directory)) {
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
      ...walk(join(PACKAGES, "sim", "src")),
      ...walk(join(PACKAGES, "data", "src")),
      ...walk(join(PACKAGES, "app", "src")),
      ...walk(join(PACKAGES, "bench", "src")),
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
