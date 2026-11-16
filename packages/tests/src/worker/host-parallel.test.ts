/**
 * D-162: the simulation host with a kernel pool. A day then runs asynchronously; the commands
 * that arrive meanwhile wait and apply in order once it ends (so commands still apply only
 * between days), the snapshot reports the threads of the last day, and the world is the same as
 * the synchronous host's.
 */

import { PROTOCOL_VERSION, type SimulationSnapshot, type WorkerCommand, type WorkerEvent } from "@century/sim-worker";
import { SimulationHost } from "@century/sim-worker/host";
import { createKernelPool } from "../../../sim-worker/src/kernelPool.js";
import { fakeKernelPort } from "../fixtures/kernelPorts.js";
import { loadM5Sample } from "../fixtures/smallWorlds.js";

const SEED = 20_261_023;

function command(type: WorkerCommand["type"], id: string, extra: Partial<WorkerCommand> = {}): WorkerCommand {
  return { protocolVersion: PROTOCOL_VERSION, type, commandId: id, ...extra } as WorkerCommand;
}

function snapshotsOf(events: readonly WorkerEvent[]): SimulationSnapshot[] {
  const snapshots: SimulationSnapshot[] = [];
  for (const event of events) if (event.type === "SNAPSHOT" || event.type === "READY") snapshots.push(event.snapshot);
  return snapshots;
}

async function settle(events: readonly WorkerEvent[], done: (events: readonly WorkerEvent[]) => boolean): Promise<void> {
  for (let attempt = 0; attempt < 4_000 && !done(events); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  if (!done(events)) throw new Error("the host did not finish");
}

describe("D-162 simulation host with kernel workers", () => {
  test("a STEP runs on the pool, waiting commands apply in order after it, and the world matches the synchronous host", async () => {
    const reference: WorkerEvent[] = [];
    const sync = new SimulationHost({ scenario: loadM5Sample(), seed: SEED, emit: (event) => reference.push(event), autoPump: false, clock: () => 1_000 });
    sync.handleCommand(command("STEP", "step", { ticks: 3 }));
    sync.handleCommand(command("REQUEST_SNAPSHOT", "after"));
    const expected = snapshotsOf(reference).at(-1);

    const pool = createKernelPool({ workers: 2, minUnitsPerLane: 1, spawn: (index) => fakeKernelPort(1 + index) });
    expect(await pool.ready).toBe(true);
    const events: WorkerEvent[] = [];
    const host = new SimulationHost({ scenario: loadM5Sample(), seed: SEED, emit: (event) => events.push(event), autoPump: false, clock: () => 1_000, parallel: pool });
    host.handleCommand(command("STEP", "step", { ticks: 3 }));
    // Arrives while the days run: held, then answered after the STEP's own events.
    host.handleCommand(command("REQUEST_SNAPSHOT", "after"));
    expect(events.filter((event) => event.type === "STATE")).toHaveLength(0);
    await settle(events, (list) => list.some((event) => event.type === "SNAPSHOT" && event.commandId === "after"));

    const order = events.filter((event) => event.type !== "READY").map((event) => `${event.type}:${"commandId" in event ? String(event.commandId) : "-"}`);
    expect(order).toEqual(["STATE:step", "SNAPSHOT:null", "SNAPSHOT:after"]);
    const last = snapshotsOf(events).at(-1);
    expect(last?.dayIndex).toBe(3);
    expect(last?.simulationThreads).toBe(3);
    expect(expected?.simulationThreads).toBe(1);
    // The same world: every snapshot field but the presentation-only sequence and threads.
    const comparable = (snapshot: SimulationSnapshot | undefined): unknown => (snapshot === undefined ? undefined : { ...snapshot, sequence: 0, simulationThreads: 0 });
    expect(comparable(last)).toEqual(comparable(expected));

    host.handleCommand(command("SHUTDOWN", "bye"));
    expect(pool.status().state).toBe("unavailable");
    expect(pool.status().reason).toBe("closed");
  }, 600_000);
});
