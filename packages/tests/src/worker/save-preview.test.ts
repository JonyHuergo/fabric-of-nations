/**
 * The title screen shows the world of the saved campaign behind its menu. The
 * worker reads the save for display through PREVIEW_SAVE; reading it must never
 * replace, advance or re-sequence the authoritative world.
 */

import {
  PROTOCOL_VERSION,
  WorkerSupervisor,
  parseWorkerCommand,
  parseWorkerEvent,
  type SimulationSnapshot,
  type WorkerCommand,
  type WorkerEvent,
} from "@century/sim-worker";
import { SimulationHost } from "@century/sim-worker/host";
import { loadM5Sample } from "../fixtures/smallWorlds.js";

const SEED = 20_261_023;

function command(type: WorkerCommand["type"], id: string, extra: Partial<WorkerCommand> = {}): WorkerCommand {
  return { protocolVersion: PROTOCOL_VERSION, type, commandId: id, ...extra } as WorkerCommand;
}

function harness(): { host: SimulationHost; events: WorkerEvent[] } {
  const events: WorkerEvent[] = [];
  const host = new SimulationHost({
    scenario: loadM5Sample(),
    seed: SEED,
    emit: (event) => {
      events.push(event);
    },
    autoPump: false,
    clock: () => 1_000,
  });
  return { host, events };
}

function last<T extends WorkerEvent["type"]>(
  events: readonly WorkerEvent[],
  type: T,
): Extract<WorkerEvent, { type: T }> {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.type === type) return event as Extract<WorkerEvent, { type: T }>;
  }
  throw new Error(`no ${type} event`);
}

function liveSnapshot(host: SimulationHost, events: WorkerEvent[], id: string): SimulationSnapshot {
  host.handleCommand(command("REQUEST_SNAPSHOT", id));
  return last(events, "SNAPSHOT").snapshot;
}

describe("saved-world preview for the title screen", () => {
  test("shows the saved world exactly as LOAD would, without adopting it", () => {
    const { host, events } = harness();
    host.handleCommand(command("STEP", "step-1", { ticks: 1 }));
    host.handleCommand(command("SAVE", "save-1"));
    const save = last(events, "SAVE_RESULT").save;
    host.handleCommand(command("STEP", "step-2", { ticks: 2 }));
    const before = liveSnapshot(host, events, "snap-1");
    expect(before.dayIndex).toBe(3);

    host.handleCommand(command("PREVIEW_SAVE", "preview-1", { save }));
    const preview = last(events, "SAVE_PREVIEW");
    expect(preview.accepted).toBe(true);
    expect(preview.errors).toEqual([]);
    expect(preview.snapshot?.dayIndex).toBe(1);
    expect(preview.snapshot?.running).toBe(false);

    // The live world, its day and its snapshot sequence are untouched.
    const after = liveSnapshot(host, events, "snap-2");
    expect(after.dayIndex).toBe(3);
    expect(after.sequence).toBe(before.sequence + 1);
    expect(after.countries).toEqual(before.countries);

    // What the menu shows is what Continue then loads.
    host.handleCommand(command("LOAD", "load-1", { save }));
    const loaded = last(events, "LOAD_RESULT");
    expect(loaded.accepted).toBe(true);
    expect(preview.snapshot?.provinceOwnership).toEqual(loaded.snapshot.provinceOwnership);
    expect(preview.snapshot?.provinceTable.marketId).toEqual(loaded.snapshot.provinceTable.marketId);
    expect(preview.snapshot?.playerCountryId).toBe(loaded.snapshot.playerCountryId);
  });

  test("an unreadable save is refused with reasons and no world", () => {
    const { host, events } = harness();
    const before = liveSnapshot(host, events, "snap-1");
    host.handleCommand(command("PREVIEW_SAVE", "preview-bad", { save: "{\"not\":\"a save\"}" }));
    const preview = last(events, "SAVE_PREVIEW");
    expect(preview.accepted).toBe(false);
    expect(preview.snapshot).toBeNull();
    expect(preview.errors.length).toBeGreaterThan(0);
    expect(liveSnapshot(host, events, "snap-2").dayIndex).toBe(before.dayIndex);
  });

  test("is deterministic: the same save previews identically on independent hosts", () => {
    const first = harness();
    first.host.handleCommand(command("STEP", "step", { ticks: 2 }));
    first.host.handleCommand(command("SAVE", "save"));
    const save = last(first.events, "SAVE_RESULT").save;
    const previews = [harness(), harness()].map(({ host, events }) => {
      host.handleCommand(command("PREVIEW_SAVE", "preview", { save }));
      return last(events, "SAVE_PREVIEW").snapshot;
    });
    expect(previews[0]?.provinceOwnership).toEqual(previews[1]?.provinceOwnership);
    expect(previews[0]?.countrySummaries).toEqual(previews[1]?.countrySummaries);
  });

  test("the protocol validates both directions at the boundary", () => {
    expect(parseWorkerCommand(command("PREVIEW_SAVE", "p", { save: "x" }))).toEqual(
      command("PREVIEW_SAVE", "p", { save: "x" }),
    );
    expect(() => parseWorkerCommand(command("PREVIEW_SAVE", "p", { save: "" }))).toThrow();

    const { host, events } = harness();
    host.handleCommand(command("SAVE", "save"));
    host.handleCommand(command("PREVIEW_SAVE", "preview", { save: last(events, "SAVE_RESULT").save }));
    const accepted = last(events, "SAVE_PREVIEW");
    expect(parseWorkerEvent(JSON.parse(JSON.stringify(accepted)))).toMatchObject({ accepted: true });

    const base = { protocolVersion: PROTOCOL_VERSION, type: "SAVE_PREVIEW", commandId: "p", errors: [] };
    expect(() => parseWorkerEvent({ ...base, accepted: true, snapshot: null })).toThrow();
    expect(() => parseWorkerEvent({ ...base, accepted: false, snapshot: accepted.snapshot })).toThrow();
    expect(() => parseWorkerEvent({ ...base, accepted: true, snapshot: { not: "a snapshot" } })).toThrow();
    expect(parseWorkerEvent({ ...base, accepted: false, snapshot: null })).toMatchObject({ accepted: false });
  });

  test("the supervisor never lets a preview block a save, load or action", () => {
    const sent: WorkerCommand[] = [];
    const received: WorkerEvent[] = [];
    const errors: string[] = [];
    const supervisor = new WorkerSupervisor({
      send: (next) => sent.push(next),
      onEvent: (event) => received.push(event),
      onError: (message) => errors.push(message),
      onTimeout: () => undefined,
      scheduler: { setTimeout: () => 0, clearTimeout: () => undefined },
    });
    expect(supervisor.send(command("PREVIEW_SAVE", "preview", { save: "x" }))).toBe(true);
    expect(supervisor.hasPendingCritical).toBe(false);
    expect(supervisor.send(command("LOAD", "load", { save: "x" }))).toBe(true);
    expect(errors).toEqual([]);

    const reply: WorkerEvent = {
      protocolVersion: PROTOCOL_VERSION,
      type: "SAVE_PREVIEW",
      commandId: "preview",
      accepted: false,
      errors: ["unreadable"],
      snapshot: null,
    };
    supervisor.receive(reply);
    supervisor.receive(reply);
    // The reply settles its command once; a duplicate is dropped.
    expect(received.filter((event) => event.type === "SAVE_PREVIEW")).toHaveLength(1);
    expect(supervisor.pendingCount).toBe(1);
    supervisor.dispose();
  });
});
