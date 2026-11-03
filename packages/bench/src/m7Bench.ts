/**
 * M7 worker-host benchmark: complete tick + immutable snapshot, snapshot payload
 * size, and save compression. This is a Node diagnostic; it is not a mobile FPS,
 * memory, battery, or on-device tick measurement.
 */

import {
  PROTOCOL_VERSION,
  type SimulationSnapshot,
  type WorkerEvent,
} from "@century/sim-worker";
import { SimulationHost } from "@century/sim-worker/host";
import {
  compressSaveForStorage,
  decompressSaveFromStorage,
} from "@century/sim-worker/persistence";
import { loadM5EightPolities } from "@century/data";

const SEED = 20_261_023;
const WARMUP_TICKS = 1;
const MEASURED_TICKS = 8;
const SAVE_ITERATIONS = 3;

interface Stats {
  readonly count: number;
  readonly averageMs: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
}

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1));
  return sorted[index] ?? 0;
}

function stats(samples: readonly number[]): Stats {
  const sorted = [...samples].sort((left, right) => left - right);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  return {
    count: sorted.length,
    averageMs: sorted.length > 0 ? total / sorted.length : 0,
    p50Ms: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    p99Ms: percentile(sorted, 0.99),
  };
}

function formatMs(value: number): string {
  if (value >= 100) return value.toFixed(1);
  if (value >= 10) return value.toFixed(2);
  return value.toFixed(3);
}

function findSnapshot(events: readonly WorkerEvent[]): SimulationSnapshot | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event === undefined) continue;
    if (event.type === "SNAPSHOT" || event.type === "READY") return event.snapshot;
    if (event.type === "ACTION_RESULT" || event.type === "LOAD_RESULT") return event.snapshot;
  }
  return null;
}

/** Bounded M7 worker benchmark used by `pnpm run bench`. */
export function runM7Benchmarks(): boolean {
  const events: WorkerEvent[] = [];
  const host = new SimulationHost({
    scenario: loadM5EightPolities(),
    seed: SEED,
    emit: (event) => {
      events.push(event);
    },
    autoPump: false,
  });
  const initial = findSnapshot(events);
  if (initial === null) throw new Error("M7 worker produced no initial snapshot");
  const countries = initial.countries.length;
  const provinces = initial.provinceTable.ids.length;

  host.handleCommand({
    protocolVersion: PROTOCOL_VERSION,
    type: "STEP",
    commandId: "warmup",
    ticks: WARMUP_TICKS,
  });

  const samples: number[] = [];
  let snapshotBytes = 0;
  let lastSnapshot: SimulationSnapshot | null = null;
  for (let index = 0; index < MEASURED_TICKS; index += 1) {
    const start = process.hrtime.bigint();
    host.handleCommand({
      protocolVersion: PROTOCOL_VERSION,
      type: "STEP",
      commandId: `step-${String(index)}`,
      ticks: 1,
    });
    samples.push(Number(process.hrtime.bigint() - start) / 1_000_000);
    lastSnapshot = findSnapshot(events);
    if (lastSnapshot !== null) snapshotBytes = JSON.stringify(lastSnapshot).length;
  }
  if (lastSnapshot === null) throw new Error("M7 worker produced no snapshot");
  const tickStats = stats(samples);

  host.handleCommand({
    protocolVersion: PROTOCOL_VERSION,
    type: "SAVE",
    commandId: "save",
  });
  let save = "";
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.type === "SAVE_RESULT") {
      save = event.save;
      break;
    }
  }
  if (save.length === 0) throw new Error("M7 worker produced no save");

  const compressionSamples: number[] = [];
  let stored = "";
  for (let index = 0; index < SAVE_ITERATIONS; index += 1) {
    const start = process.hrtime.bigint();
    stored = compressSaveForStorage(save);
    const restored = decompressSaveFromStorage(stored);
    compressionSamples.push(Number(process.hrtime.bigint() - start) / 1_000_000);
    if (restored !== save) throw new Error("M7 save compression did not round-trip");
  }
  const compressionStats = stats(compressionSamples);

  console.log("");
  console.log(
    `M7 worker host: ${String(countries)} countries, ${String(provinces)} provinces, ` +
      `${String(MEASURED_TICKS)} measured ticks, seed ${String(SEED)}`,
  );
  console.log(
    `  complete tick + snapshot: avg ${formatMs(tickStats.averageMs)} ms, ` +
      `p50 ${formatMs(tickStats.p50Ms)} ms, p95 ${formatMs(tickStats.p95Ms)} ms, ` +
      `p99 ${formatMs(tickStats.p99Ms)} ms`,
  );
  console.log(
    `  snapshot payload: ${(snapshotBytes / 1024).toFixed(1)} KiB; ` +
      `save ${(save.length / 1024).toFixed(1)} KiB → ${(stored.length / 1024).toFixed(1)} KiB compressed`,
  );
  console.log(
    `  save compress + decompress: avg ${formatMs(compressionStats.averageMs)} ms, ` +
      `p50 ${formatMs(compressionStats.p50Ms)} ms, p95 ${formatMs(compressionStats.p95Ms)} ms`,
  );

  const valid =
    countries === 8 &&
    provinces === 16 &&
    tickStats.count === MEASURED_TICKS &&
    tickStats.p95Ms > 0 &&
    snapshotBytes > 0 &&
    save.length > 0 &&
    stored.startsWith("century-save-gzip1:") &&
    stored.length < save.length &&
    compressionStats.averageMs > 0;
  console.log(`M7 worker benchmark gates: ${valid ? "PASS" : "FAIL"}`);
  console.log(
    "  mobile FPS, memory, battery, cold start, and on-device tick p95: NOT EVALUATED (Node host benchmark)",
  );
  return valid;
}
