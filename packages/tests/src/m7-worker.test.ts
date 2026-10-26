import {
  PROTOCOL_VERSION,
  countryById,
  fiscalResultLabel,
  formatRate,
  formatSUSD,
  marketForCountry,
  type SimulationSnapshot,
  type WorkerCommand,
  type WorkerEvent,
} from "@century/sim-worker";
import { SimulationHost } from "@century/sim-worker/host";
import {
  base64ToBytes,
  bytesToBase64,
  compressSaveForStorage,
  decompressSaveFromStorage,
} from "@century/sim-worker/persistence";
import { loadM5EightPolities } from "@century/data";

const SEED = 20_261_023;

function command(type: WorkerCommand["type"], id: string, extra: Partial<WorkerCommand> = {}): WorkerCommand {
  return { protocolVersion: PROTOCOL_VERSION, type, commandId: id, ...extra } as WorkerCommand;
}

function createHarness(): {
  host: SimulationHost;
  events: WorkerEvent[];
  advanceClock: (ms: number) => void;
} {
  const events: WorkerEvent[] = [];
  let now = 1_000;
  const host = new SimulationHost({
    scenario: loadM5EightPolities(),
    seed: SEED,
    emit: (event) => {
      events.push(event);
    },
    autoPump: false,
    clock: () => now,
  });
  return {
    host,
    events,
    advanceClock: (ms: number) => {
      now += ms;
    },
  };
}

function lastSnapshot(events: readonly WorkerEvent[]): SimulationSnapshot {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event === undefined) continue;
    if (event.type === "SNAPSHOT" || event.type === "READY") return event.snapshot;
    if (event.type === "ACTION_RESULT" || event.type === "LOAD_RESULT") return event.snapshot;
  }
  throw new Error("no snapshot event");
}

function lastEvent<T extends WorkerEvent["type"]>(
  events: readonly WorkerEvent[],
  type: T,
): Extract<WorkerEvent, { type: T }> | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event !== undefined && event.type === type) {
      return event as Extract<WorkerEvent, { type: T }>;
    }
  }
  return undefined;
}

describe("M7 simulation worker host", () => {
  test("emits a bounded, frozen snapshot and never the live world", () => {
    const { events } = createHarness();
    const ready = lastEvent(events, "READY");
    expect(ready).toBeDefined();
    const snapshot = ready!.snapshot;
    expect(snapshot.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(snapshot.dayIndex).toBe(0);
    expect(snapshot.date.label).toBe("1900-01-01");
    expect(snapshot.countries).toHaveLength(8);
    expect(snapshot.regions).toHaveLength(16);
    expect(snapshot.markets).toHaveLength(5);
    expect(snapshot.goods).toHaveLength(8);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.countries)).toBe(true);
    expect(Object.isFrozen(snapshot.countries[0])).toBe(true);
    expect(Object.isFrozen(snapshot.countries[0]!.fiscal)).toBe(true);
    const json = JSON.stringify(snapshot);
    expect(json).not.toContain("maleByAge");
    expect(json).not.toContain("femaleByAge");
    expect(json).not.toContain("\"accounts\"");
    expect(json).not.toContain("\"postings\"");
    expect(json.length).toBeLessThan(400_000);
  });

  test("steps complete days and enforces pause/speed/tick behavior", () => {
    const { host, events, advanceClock } = createHarness();
    host.handleCommand(command("STEP", "step-1", { ticks: 1 }));
    expect(lastSnapshot(events).dayIndex).toBe(1);
    host.handleCommand(command("STEP", "step-2", { ticks: 2 }));
    expect(lastSnapshot(events).dayIndex).toBe(3);

    host.handleCommand(command("START", "start-1"));
    expect(lastEvent(events, "STATE")?.running).toBe(true);
    host.handleCommand(command("PAUSE", "pause-1"));
    expect(lastEvent(events, "STATE")?.running).toBe(false);

    // A one-day-per-second pump must not turn wall time into more than complete ticks.
    host.handleCommand(command("START", "start-2"));
    advanceClock(1_000);
    host.pump(2_000);
    const afterOneSecond = lastSnapshot(events).dayIndex;
    expect(afterOneSecond).toBe(4);
    host.handleCommand(command("SET_SPEED", "speed-1", { daysPerSecond: 10 }));
    advanceClock(1_000);
    host.pump(3_000);
    // The driver caps one pump at four complete ticks; it does not skip state.
    expect(lastSnapshot(events).dayIndex).toBe(8);
    host.handleCommand(command("PAUSE", "pause-2"));
  });

  test("applies a valid player action and rejects invalid actions atomically", () => {
    const { host, events } = createHarness();
    host.handleCommand(command("STEP", "step-1", { ticks: 1 }));
    const before = lastSnapshot(events);
    const countryBefore = before.countries[0]!;
    host.handleCommand({
      protocolVersion: PROTOCOL_VERSION,
      type: "APPLY_ACTION",
      commandId: "apply-1",
      actionId: "ui-fiscal-1",
      action: {
        kind: "set-fiscal-policy",
        countryId: countryBefore.id,
        incomeTaxRate: 0.2,
        welfareBudgetSUSDPerYear: 100,
      },
    });
    const accepted = lastEvent(events, "ACTION_RESULT");
    expect(accepted?.accepted).toBe(true);
    expect(accepted?.actionId).toBe("ui-fiscal-1");
    expect(lastSnapshot(events).countries[0]?.fiscal.incomeTaxRate).toBe(0.2);

    const afterAccept = lastSnapshot(events);
    host.handleCommand({
      protocolVersion: PROTOCOL_VERSION,
      type: "APPLY_ACTION",
      commandId: "apply-2",
      actionId: "ui-fiscal-2",
      action: {
        kind: "set-fiscal-policy",
        countryId: 99,
        incomeTaxRate: 0.2,
        welfareBudgetSUSDPerYear: 100,
      },
    });
    const rejected = lastEvent(events, "ACTION_RESULT");
    expect(rejected?.accepted).toBe(false);
    expect(rejected?.errors.length).toBeGreaterThan(0);
    expect(lastSnapshot(events).countries).toEqual(afterAccept.countries);
    expect(lastSnapshot(events).dayIndex).toBe(afterAccept.dayIndex);
  });

  test("save/load round-trips and bad loads leave the host state intact", () => {
    const { host, events } = createHarness();
    host.handleCommand(command("STEP", "step-1", { ticks: 1 }));
    host.handleCommand(command("SAVE", "save-1"));
    const save = lastEvent(events, "SAVE_RESULT")?.save;
    expect(typeof save).toBe("string");
    host.handleCommand(command("STEP", "step-2", { ticks: 2 }));
    expect(lastSnapshot(events).dayIndex).toBe(3);

    host.handleCommand({
      protocolVersion: PROTOCOL_VERSION,
      type: "LOAD",
      commandId: "load-1",
      save: save!,
    });
    const loaded = lastEvent(events, "LOAD_RESULT");
    expect(loaded?.accepted).toBe(true);
    expect(loaded?.snapshot.dayIndex).toBe(1);

    const beforeBad = lastSnapshot(events);
    host.handleCommand({
      protocolVersion: PROTOCOL_VERSION,
      type: "LOAD",
      commandId: "load-2",
      save: "{\"not\":\"a save\"}",
    });
    const bad = lastEvent(events, "LOAD_RESULT");
    expect(bad?.accepted).toBe(false);
    const afterBad = lastSnapshot(events);
    expect(afterBad.dayIndex).toBe(beforeBad.dayIndex);
    expect(afterBad.countries).toEqual(beforeBad.countries);
  });

  test("is deterministic across independent hosts", () => {
    const first = createHarness();
    const second = createHarness();
    for (const host of [first.host, second.host]) {
      host.handleCommand(command("STEP", "step-a", { ticks: 3 }));
      host.handleCommand(command("SAVE", "save-a"));
    }
    expect(lastSnapshot(first.events)).toEqual(lastSnapshot(second.events));
    expect(lastEvent(first.events, "SAVE_RESULT")?.save).toBe(
      lastEvent(second.events, "SAVE_RESULT")?.save,
    );
  });

  test("rejects malformed commands and shuts down cleanly", () => {
    const { host, events } = createHarness();
    host.handleCommand({ protocolVersion: 99, type: "START", commandId: "bad-1" });
    expect(lastEvent(events, "ERROR")?.code).toBe("unsupported_protocol");
    host.handleCommand({ protocolVersion: 1, type: "STEP", commandId: "bad-2", ticks: 0 });
    expect(lastEvent(events, "ERROR")?.code).toBe("invalid_message");
    host.handleCommand(command("SHUTDOWN", "shutdown-1"));
    expect(lastEvent(events, "SHUTDOWN")).toBeDefined();
    host.handleCommand(command("STEP", "step-after-shutdown", { ticks: 1 }));
    expect(lastEvent(events, "ERROR")?.code).toBe("closed");
  });

  test("pure snapshot selectors expose the expected country and market views", () => {
    const { events } = createHarness();
    const snapshot = lastSnapshot(events);
    const country = countryById(snapshot, snapshot.countries[0]?.id ?? null);
    expect(country).not.toBeNull();
    expect(country?.tag).toBe("USA");
    expect(formatSUSD(1_500_000)).toBe("1.50M SUSD");
    expect(formatRate(0.125)).toBe("12.5%");
    expect(fiscalResultLabel(-1)).toBe("Deficit");
    expect(marketForCountry(snapshot, country)?.regionIds.length).toBeGreaterThan(0);
  });

  test("compresses saves for storage and rejects malformed stored payloads", () => {
    const { host, events } = createHarness();
    host.handleCommand(command("SAVE", "save-1"));
    const save = lastEvent(events, "SAVE_RESULT")!.save;
    const stored = compressSaveForStorage(save);
    expect(stored.startsWith("century-save-gzip1:")).toBe(true);
    expect(decompressSaveFromStorage(stored)).toBe(save);
    expect(stored.length).toBeLessThan(save.length);

    const bytes = new Uint8Array([0, 1, 2, 250, 255]);
    expect([...base64ToBytes(bytesToBase64(bytes))]).toEqual([...bytes]);
    expect(() => decompressSaveFromStorage("not-compressed")).toThrow(/century-save-gzip1/);
    expect(() =>
      decompressSaveFromStorage(`century-save-gzip1:${"A".repeat(8)}`),
    ).toThrow();
  });
});
