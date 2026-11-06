/**
 * M11e simulation dependency regressions.
 *
 * The Expo web development bundle used to report three `Require cycle` warnings
 * from `packages/sim/dist`: world -> validation -> trade/monetary/military ->
 * world. These assertions pin the acyclic source hierarchy and the reusable
 * dependency-graph check so a future milestone cannot silently reintroduce the
 * cycles.
 */

import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../../..");
const SIM_SRC = join(ROOT, "packages/sim/src");
const SIM_DIST = join(ROOT, "packages/sim/dist");
const SYMBOLS = ["tradeState", "monetaryState", "militaryState"] as const;

describe("M11e simulation dependency graph", () => {
  test("the reusable dependency check reports no runtime cycles", () => {
    const result = spawnSync(
      process.execPath,
      [join(ROOT, "scripts/m11e/check-sim-dependencies.mjs"), "--source-only"],
      { cwd: ROOT, encoding: "utf8" },
    );
    expect(`${result.stdout}${result.stderr}`).toContain("0 cyclic component(s)");
    expect(result.status).toBe(0);
  });

  test("the generated bundle has no runtime cycles when it has been built", () => {
    if (!existsSync(join(SIM_DIST, "index.js"))) return;
    const result = spawnSync(
      process.execPath,
      [join(ROOT, "scripts/m11e/check-sim-dependencies.mjs"), "--require-dist"],
      { cwd: ROOT, encoding: "utf8" },
    );
    expect(`${result.stdout}${result.stderr}`).toMatch(
      /simulation dist \(runtime imports\): \d+ modules, 0 cyclic component\(s\)/u,
    );
    expect(result.status).toBe(0);
  });

  test("the low-level economy state modules do not import the world initializer at runtime", () => {
    for (const module of SYMBOLS) {
      const source = readFileSync(join(SIM_SRC, `economy/${module}.ts`), "utf8");
      expect(source).toContain('import type { World } from "../world.js"');
      // A value import of world.js here is exactly the cycle that Metro reported.
      const withoutTypeImports = source.replace(
        /import\s+type\s+[\s\S]*?from\s+["'][^"']+["'];?/gu,
        "",
      );
      expect(withoutTypeImports).not.toContain('from "../world.js"');
      expect(source).not.toMatch(/^import\s+\*\s+as/m);
    }
  });

  test("world initialization imports validators, not the runtime phase modules", () => {
    const world = readFileSync(join(SIM_SRC, "world.ts"), "utf8");
    expect(world).toContain('from "./economy/tradeState.js"');
    expect(world).toContain('from "./economy/monetaryState.js"');
    expect(world).toContain('from "./economy/militaryState.js"');
    expect(world).not.toContain('from "./economy/trade.js"');
    expect(world).not.toContain('from "./economy/monetary.js"');
    expect(world).not.toContain('from "./economy/military.js"');
  });

  test("the phase modules re-export their state surface for API compatibility", () => {
    const trade = readFileSync(join(SIM_SRC, "economy/trade.ts"), "utf8");
    const monetary = readFileSync(join(SIM_SRC, "economy/monetary.ts"), "utf8");
    const military = readFileSync(join(SIM_SRC, "economy/military.ts"), "utf8");
    expect(trade).toContain('} from "./tradeState.js";');
    expect(monetary).toContain('} from "./monetaryState.js";');
    expect(military).toContain('} from "./militaryState.js";');
  });
});
