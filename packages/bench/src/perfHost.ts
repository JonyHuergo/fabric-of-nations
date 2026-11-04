/**
 * Host-path profiler for performance work
 * (`node packages/bench/dist/perfHost.js [fromDay] [toDay] [out.cpuprofile]`).
 *
 * Drives the worker host as the app does (CREATE_GAME, then one STEP per day),
 * unprofiled to `fromDay`, then records a V8 CPU profile of the STEP commands of
 * days `fromDay`..`toDay - 1` and prints each STEP's wall time split into the tick
 * and the snapshot build. Node diagnostic only.
 */

import { writeFileSync } from "node:fs";
import { Session } from "node:inspector/promises";
import { loadM11World } from "@century/data";
import { PROTOCOL_VERSION } from "@century/sim-worker";
import { SimulationHost } from "@century/sim-worker/host";

const SEED = 20_261_023;

function command(type: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { protocolVersion: PROTOCOL_VERSION, type, commandId: `${type}-${String(performance.now())}`, ...extra };
}

async function main(): Promise<void> {
  const fromDay = Number(process.argv[2] ?? "3");
  const toDay = Number(process.argv[3] ?? "9");
  const out = process.argv[4];
  const scenario = loadM11World();
  let snapshotChars = 0;
  const host = new SimulationHost({
    scenario,
    seed: SEED,
    autoPump: false,
    emit: (event) => {
      if (event.type === "SNAPSHOT") snapshotChars = JSON.stringify(event).length;
    },
  });
  host.handleCommand(command("CREATE_GAME", { playerCountryId: 0 }));
  for (let day = 0; day < fromDay; day += 1) host.handleCommand(command("STEP", { ticks: 1 }));
  const session = new Session();
  if (out !== undefined) {
    session.connect();
    await session.post("Profiler.enable");
    await session.post("Profiler.setSamplingInterval", { interval: 250 });
    await session.post("Profiler.start");
  }
  let total = 0;
  for (let day = fromDay; day < toDay; day += 1) {
    const start = performance.now();
    host.handleCommand(command("STEP", { ticks: 1 }));
    const elapsed = performance.now() - start;
    total += elapsed;
    console.log(`STEP day ${String(day)}: ${elapsed.toFixed(0)} ms (snapshot ${String(snapshotChars)} chars)`);
  }
  console.log(`mean STEP ${(total / (toDay - fromDay)).toFixed(1)} ms`);
  if (out !== undefined) {
    const { profile } = await session.post("Profiler.stop");
    writeFileSync(out, JSON.stringify(profile));
    session.disconnect();
    console.log(`wrote ${out}`);
  }
}

void main();
