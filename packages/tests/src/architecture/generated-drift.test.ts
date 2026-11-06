/**
 * Batch 7 — generated worker bundle integrity.
 *
 * These tests exercise the real build-worker script. The check path must pass for
 * the committed bundle, fail for an intentionally stale copy without overwriting
 * it, and produce byte-identical output across two independent generations.
 */

import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../../..");
const SCRIPT = join(ROOT, "packages", "app", "scripts", "build-worker.mjs");
const COMMITTED = join(ROOT, "packages", "app", "src", "generated", "simWorker.ts");

function runWorkerScript(args: readonly string[]): string {
  return execFileSync(process.execPath, [SCRIPT, ...args], {
    cwd: ROOT,
    encoding: "utf8",
  });
}

describe("generated worker bundle drift", () => {
  test("the committed bundle is current and generation is deterministic", () => {
    const check = runWorkerScript(["--check"]);
    expect(check).toMatch(/worker bundle is current/);

    const directory = mkdtempSync(join(tmpdir(), "century-worker-"));
    try {
      const first = join(directory, "first.ts");
      const second = join(directory, "second.ts");
      runWorkerScript(["--output", first]);
      runWorkerScript(["--output", second]);
      expect(readFileSync(first)).toEqual(readFileSync(second));
      expect(readFileSync(first)).toEqual(readFileSync(COMMITTED));
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test("a stale bundle fails the check and is not overwritten", () => {
    const directory = mkdtempSync(join(tmpdir(), "century-worker-drift-"));
    try {
      const stale = join(directory, "simWorker.ts");
      copyFileSync(COMMITTED, stale);
      writeFileSync(stale, `${readFileSync(stale, "utf8")}\n// intentional drift\n`, "utf8");
      const before = readFileSync(stale, "utf8");
      let status = 0;
      let stderr = "";
      try {
        runWorkerScript(["--check", "--output", stale]);
      } catch (error) {
        const failure = error as { status?: number; stderr?: unknown };
        status = failure.status ?? 0;
        stderr = String(failure.stderr ?? "");
      }
      expect(status).toBe(1);
      expect(stderr).toMatch(/worker bundle is stale/);
      expect(readFileSync(stale, "utf8")).toBe(before);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
