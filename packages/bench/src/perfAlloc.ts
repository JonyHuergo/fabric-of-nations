/**
 * Allocation probe for performance work
 * (`node packages/bench/dist/perfAlloc.js [fromDay] [toDay] [top]`).
 *
 * Runs the 1900 world to `fromDay`, then samples heap allocations (V8 sampling heap
 * profiler, 32 KiB interval, objects collected since included) over days
 * `fromDay`..`toDay - 1` and prints the allocating functions by sampled bytes.
 * Node diagnostic only.
 */

import { Session } from "node:inspector/promises";
import { loadM11World } from "@century/data";
import { createEconomyWorld, createRollbackRunner, runTicksWithRollback, type TickContext } from "@century/sim";

const SEED = 20_261_023;

interface SamplingNode {
  readonly callFrame: { readonly functionName: string; readonly url: string; readonly lineNumber: number };
  readonly selfSize: number;
  readonly children: readonly SamplingNode[];
}

async function main(): Promise<void> {
  const fromDay = Number(process.argv[2] ?? "3");
  const toDay = Number(process.argv[3] ?? "7");
  const top = Number(process.argv[4] ?? "30");
  const scenario = loadM11World();
  const world = createEconomyWorld(scenario, { seed: SEED });
  const runner = createRollbackRunner(world, { worldJustValidated: true });
  const context: TickContext = {
    population: { definitions: scenario.population.definitions },
    economy: { definitions: scenario.definitions },
    detail: "summary",
  };
  runTicksWithRollback(runner, fromDay, context);
  const session = new Session();
  session.connect();
  await session.post("HeapProfiler.enable");
  await session.post("HeapProfiler.startSampling", {
    samplingInterval: 32 * 1024,
    includeObjectsCollectedByMajorGC: true,
    includeObjectsCollectedByMinorGC: true,
  });
  runTicksWithRollback(runner, toDay - fromDay, context);
  const { profile } = (await session.post("HeapProfiler.stopSampling")) as { profile: { head: SamplingNode } };
  session.disconnect();
  const bytes = new Map<string, number>();
  const visit = (node: SamplingNode): void => {
    const frame = node.callFrame;
    const key = `${frame.functionName || "(anon)"} ${frame.url.split("/").slice(-2).join("/")}:${String(frame.lineNumber + 1)}`;
    bytes.set(key, (bytes.get(key) ?? 0) + node.selfSize);
    for (const child of node.children) visit(child);
  };
  visit(profile.head);
  const days = toDay - fromDay;
  let total = 0;
  for (const value of bytes.values()) total += value;
  console.log(`sampled allocation ${(total / days / 2 ** 20).toFixed(1)} MiB/day`);
  for (const [key, value] of [...bytes].sort((left, right) => right[1] - left[1]).slice(0, top)) {
    console.log(`${(value / days / 2 ** 20).toFixed(2).padStart(8)} MiB/day  ${key}`);
  }
}

void main();
