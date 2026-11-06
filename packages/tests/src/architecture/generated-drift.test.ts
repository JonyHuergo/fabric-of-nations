/**
 * Generated worker bundle integrity (post-M7 batch 7).
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
    // Generation 1: `--check` regenerates the bundle and compares it with the
    // committed file in full.
    const check = runWorkerScript(["--check"]);
    expect(check).toMatch(/worker bundle is current/);

    // Generation 2, independent of the first, must also equal the committed file
    // byte for byte, so the two generations are identical (D-145: formerly two
    // further generations compared with each other and with the committed file).
    // Buffer.equals compares the 12 MB bundle without Jest's element-wise deep
    // equality, which needs far more memory on a large heap.
    const directory = mkdtempSync(join(tmpdir(), "century-worker-"));
    try {
      const generated = join(directory, "generated.ts");
      runWorkerScript(["--output", generated]);
      const bytes = readFileSync(generated);
      const committed = readFileSync(COMMITTED);
      expect(bytes.length).toBe(committed.length);
      expect(bytes.equals(committed)).toBe(true);
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

describe("decision register index (D-145)", () => {
  test("the DECISIONS.md index lists every decision once, in order", () => {
    // `--check` fails on a stale index and on a duplicate or missing decision number.
    const output = execFileSync(process.execPath, [join(ROOT, "scripts", "docs", "decisions-index.mjs"), "--check"], {
      cwd: ROOT,
      encoding: "utf8",
    });
    expect(output).toMatch(/DECISIONS\.md index is current \(\d+ decisions\)/);
  });
});
