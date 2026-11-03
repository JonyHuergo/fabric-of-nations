import {
  PROTOCOL_VERSION,
  SPEED_VALUES,
  countryById,
  fiscalResultLabel,
  formatRate,
  formatRUSD,
  marketForCountry,
  type SimulationSnapshot,
  type WorkerCommand,
  type WorkerEvent,
  provinceEconomyRows,
} from "@century/sim-worker";
import { SimulationHost } from "@century/sim-worker/host";
import {
  STORED_SAVE_PREFIX,
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
    expect(provinceEconomyRows(snapshot)).toHaveLength(16);
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

  test("advertises the documented speed set and rejects unsupported values", () => {
    expect(SPEED_VALUES).toEqual([1, 3, 10, 30]);
    const { host, events } = createHarness();
    for (const speed of SPEED_VALUES) {
      host.handleCommand(command("SET_SPEED", `speed-${String(speed)}`, { daysPerSecond: speed }));
      expect(lastSnapshot(events).speedDaysPerSecond).toBe(speed);
    }
    for (const unsupported of [0, 2, 5, 11, 30.5, -1]) {
      host.handleCommand({
        protocolVersion: PROTOCOL_VERSION,
        type: "SET_SPEED",
        commandId: `bad-speed-${String(unsupported)}`,
        daysPerSecond: unsupported,
      } as unknown as WorkerCommand);
      const error = lastEvent(events, "ERROR");
      expect(error?.code).toBe("invalid_speed");
      expect(error?.message).toContain("must be one of 1, 3, 10, 30");
      expect(lastSnapshot(events).speedDaysPerSecond).toBe(30);
    }
  });

  test("schedules 3x and 30x with complete ticks only", () => {
    const slow = createHarness();
    slow.host.handleCommand(command("SET_SPEED", "speed-3", { daysPerSecond: 3 }));
    slow.host.handleCommand(command("START", "start-3"));
    for (let index = 1; index <= 10; index += 1) {
      slow.advanceClock(100);
      slow.host.pump(1_000 + index * 100);
    }
    // Ten 100 ms pumps at 3x produce exactly three complete ticks.
    expect(lastSnapshot(slow.events).dayIndex).toBe(3);

    const fast = createHarness();
    fast.host.handleCommand(command("SET_SPEED", "speed-30", { daysPerSecond: 30 }));
    fast.host.handleCommand(command("START", "start-30"));
    for (let index = 1; index <= 4; index += 1) {
      fast.advanceClock(100);
      fast.host.pump(1_000 + index * 100);
    }
    // The normal 100 ms pump cadence yields three ticks per pump at 30x; the
    // four-tick pump cap remains the bounded catch-up policy for stalls.
    expect(lastSnapshot(fast.events).dayIndex).toBe(12);
  });

  test("round-trips an industrial-policy action and rejects unaffordable enterprise support", () => {
    const { host, events } = createHarness();
    const before = lastSnapshot(events);
    const country = before.countries.find((entry) => entry.id === before.playerCountryId)!;
    host.handleCommand({
      protocolVersion: PROTOCOL_VERSION,
      type: "APPLY_ACTION",
      commandId: "industrial-set",
      actionId: "ui-industrial-1",
      action: {
        kind: "set-industrial-policy",
        countryId: country.id,
        sectorSubsidyRates: [0.1, 0, 0, 0, 0],
      },
    });
    expect(lastEvent(events, "ACTION_RESULT")?.accepted).toBe(true);
    const after = lastSnapshot(events).countries.find((entry) => entry.id === country.id)!;
    expect(after.industrialPolicy.sectors[0]?.subsidyRate).toBe(0.1);
    expect(after.industrialPolicy.sectors).toHaveLength(5);

    host.handleCommand({
      protocolVersion: PROTOCOL_VERSION,
      type: "APPLY_ACTION",
      commandId: "industrial-support-bad",
      actionId: "ui-industrial-2",
      action: {
        kind: "support-public-enterprise",
        countryId: country.id,
        buildingId: 0,
        amountRUSD: 100,
      },
    });
    expect(lastEvent(events, "ACTION_RESULT")?.accepted).toBe(false);
    expect(
      lastSnapshot(events).countries.find((entry) => entry.id === country.id)!
        .treasuryCashRUSD,
    ).toBeCloseTo(country.treasuryCashRUSD, 6);
  });

  test("round-trips a construction action through the validated worker protocol", () => {
    const { host, events } = createHarness();
    const before = lastSnapshot(events);
    const country = before.countries.find((entry) => entry.id === before.playerCountryId)!;
    const projectType = before.projectTypes.find((entry) => entry.outputs.length > 0)!;
    expect(projectType).toBeDefined();
    const provinceId = country.provinceIds[0]!;
    host.handleCommand({
      protocolVersion: PROTOCOL_VERSION,
      type: "APPLY_ACTION",
      commandId: "construct-start",
      actionId: "ui-construct-1",
      action: {
        kind: "start-construction",
        countryId: country.id,
        provinceId,
        definitionId: projectType.definitionId,
      },
    });
    const accepted = lastEvent(events, "ACTION_RESULT");
    expect(accepted?.accepted).toBe(true);
    expect(accepted?.actionId).toBe("ui-construct-1");
    const afterStart = lastSnapshot(events);
    const startedCountry = afterStart.countries.find((entry) => entry.id === country.id)!;
    expect(startedCountry.constructionProjects).toHaveLength(1);
    const projectId = startedCountry.constructionProjects[0]!.id;
    expect(startedCountry.constructionProjects[0]?.status).toBe("authorized");
    expect(startedCountry.constructionLabor.idleWorkers).toBeGreaterThan(0);

    host.handleCommand(command("STEP", "construct-step-1", { ticks: 2 }));
    const progressing = lastSnapshot(events).countries.find((entry) => entry.id === country.id)!;
    expect(progressing.constructionProjects[0]?.status).toBe("active");
    expect(progressing.constructionProjects[0]?.spentRUSD).toBeGreaterThan(0);
    expect(progressing.constructionInProgressRUSD).toBeGreaterThan(0);

    host.handleCommand({
      protocolVersion: PROTOCOL_VERSION,
      type: "APPLY_ACTION",
      commandId: "construct-pause",
      actionId: "ui-construct-2",
      action: {
        kind: "set-construction-paused",
        countryId: country.id,
        projectId,
        paused: true,
      },
    });
    expect(lastEvent(events, "ACTION_RESULT")?.accepted).toBe(true);
    expect(
      lastSnapshot(events).countries.find((entry) => entry.id === country.id)!
        .constructionProjects[0]?.status,
    ).toBe("paused");

    host.handleCommand({
      protocolVersion: PROTOCOL_VERSION,
      type: "APPLY_ACTION",
      commandId: "construct-cancel",
      actionId: "ui-construct-3",
      action: {
        kind: "cancel-construction",
        countryId: country.id,
        projectId,
      },
    });
    expect(lastEvent(events, "ACTION_RESULT")?.accepted).toBe(true);
    const cancelled = lastSnapshot(events).countries.find((entry) => entry.id === country.id)!;
    expect(cancelled.constructionProjects[0]?.status).toBe("cancelled");
    expect(cancelled.constructionInProgressRUSD).toBeCloseTo(0, 6);
  });

  test("rejects a construction action with invalid province/definition ids", () => {
    const { host, events } = createHarness();
    const before = lastSnapshot(events);
    const country = before.countries.find((entry) => entry.id === before.playerCountryId)!;
    // The worker always supplies definitions; this asserts the UI cannot smuggle
    // an action that bypasses the same validation by sending a malformed type.
    host.handleCommand({
      protocolVersion: PROTOCOL_VERSION,
      type: "APPLY_ACTION",
      commandId: "construct-bad",
      actionId: "ui-construct-bad",
      action: {
        kind: "start-construction",
        countryId: country.id,
        provinceId: 99_999,
        definitionId: 99_999,
      },
    });
    expect(lastEvent(events, "ACTION_RESULT")?.accepted).toBe(false);
    expect(lastSnapshot(events).countries.find((entry) => entry.id === country.id)!
      .constructionProjects).toHaveLength(0);
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
        incomeTaxAllowanceRUSDPerYear: 0,
        welfareBudgetRUSDPerYear: 100,
        welfareMaxWealthLevel: 99,
        businessProfitTaxRate: 0,
        reserveTargetRUSD: 0,
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
        incomeTaxAllowanceRUSDPerYear: 0,
        welfareBudgetRUSDPerYear: 100,
        welfareMaxWealthLevel: 99,
        businessProfitTaxRate: 0,
        reserveTargetRUSD: 0,
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
    host.handleCommand({ protocolVersion: PROTOCOL_VERSION, type: "STEP", commandId: "bad-2", ticks: 0 });
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
    expect(formatRUSD(1_500_000)).toBe("1.50M RUSD");
    expect(formatRate(0.125)).toBe("12.5%");
    expect(fiscalResultLabel(-1)).toBe("Deficit");
    expect(marketForCountry(snapshot, country)?.provinceIds.length).toBeGreaterThan(0);
  });

  test("bounds a long elapsed-time stall instead of replaying the backlog", () => {
    const { host, events, advanceClock } = createHarness();
    host.handleCommand(command("START", "start-stall"));
    advanceClock(60_000);
    host.pump(61_000);
    expect(lastSnapshot(events).dayIndex).toBe(1);
    for (let index = 1; index <= 10; index += 1) {
      host.pump(61_000 + index * 100);
    }
    // 60 seconds of wall time must not become 60 simulated days.
    expect(lastSnapshot(events).dayIndex).toBeLessThanOrEqual(2);
    expect(lastSnapshot(events).running).toBe(true);
  });

  test("pause/resume and speed changes discard outstanding wall-time debt", () => {
    const paused = createHarness();
    paused.host.handleCommand(command("START", "start-pause"));
    paused.advanceClock(60_000);
    paused.host.handleCommand(command("PAUSE", "pause-after-stall"));
    paused.advanceClock(100);
    paused.host.handleCommand(command("START", "resume-after-pause"));
    paused.host.pump(61_100);
    paused.advanceClock(1_000);
    paused.host.pump(62_100);
    expect(lastSnapshot(paused.events).dayIndex).toBe(1);

    const sped = createHarness();
    sped.host.handleCommand(command("START", "start-speed"));
    sped.advanceClock(5_000);
    sped.host.handleCommand(
      command("SET_SPEED", "speed-change", { daysPerSecond: 10 }),
    );
    sped.host.pump(6_000);
    sped.advanceClock(100);
    sped.host.pump(6_100);
    // The 5 s accumulated at 1x is discarded when the speed changes.
    expect(lastSnapshot(sped.events).dayIndex).toBe(1);
    expect(lastSnapshot(sped.events).speedDaysPerSecond).toBe(10);
  });

  test("STEP and START behave predictably at the terminal boundary", () => {
    const scenario = loadM5EightPolities();
    const terminalScenario = {
      ...scenario,
      population: { ...scenario.population, startDayIndex: 36_524 },
    };
    const events: WorkerEvent[] = [];
    let now = 1_000;
    const host = new SimulationHost({
      scenario: terminalScenario,
      seed: SEED,
      emit: (event) => events.push(event),
      autoPump: false,
      clock: () => now,
    });
    expect(lastSnapshot(events).dayIndex).toBe(36_524);
    host.handleCommand(command("START", "start-terminal"));
    expect(lastEvent(events, "ERROR")?.code).toBe("campaign_complete");
    host.handleCommand(command("STEP", "step-terminal", { ticks: 1 }));
    expect(lastSnapshot(events).dayIndex).toBe(36_524);
    expect(lastSnapshot(events).running).toBe(false);
    now += 1_000;
  });

  test("correlates command replies and leaves pump snapshots uncorrelated", () => {
    const { host, events } = createHarness();
    host.handleCommand(command("START", "start-correlated"));
    expect(lastEvent(events, "STATE")?.commandId).toBe("start-correlated");
    host.handleCommand(command("REQUEST_SNAPSHOT", "snapshot-correlated"));
    const snapshotEvent = lastEvent(events, "SNAPSHOT");
    expect(snapshotEvent?.commandId).toBe("snapshot-correlated");
    host.handleCommand(command("PAUSE", "pause-correlated"));
    expect(lastEvent(events, "STATE")?.commandId).toBe("pause-correlated");
  });

  test("compresses saves for storage and rejects malformed stored payloads", () => {
    const { host, events } = createHarness();
    host.handleCommand(command("SAVE", "save-1"));
    // D-137: the worker compresses off the app thread, so SAVE_RESULT carries the
    // stored form (metadata line + deflate level 1 + base64) and the app stores it
    // as-is. Compressing it again is idempotent; the canonical save is larger.
    const save = lastEvent(events, "SAVE_RESULT")!.save;
    expect(save.startsWith(STORED_SAVE_PREFIX)).toBe(true);
    const stored = compressSaveForStorage(save);
    expect(stored).toBe(save);
    const canonical = decompressSaveFromStorage(stored);
    expect(canonical.startsWith('{"checksum":')).toBe(true);
    expect(stored.length).toBeLessThan(canonical.length);
    expect(decompressSaveFromStorage(compressSaveForStorage(canonical))).toBe(canonical);

    const bytes = new Uint8Array([0, 1, 2, 250, 255]);
    expect([...base64ToBytes(bytesToBase64(bytes))]).toEqual([...bytes]);
    expect(() => decompressSaveFromStorage("not-compressed")).toThrow(
      /fon-save-deflate2|century-save-gzip1/,
    );
    expect(() =>
      decompressSaveFromStorage(`century-save-gzip1:${"A".repeat(8)}`),
    ).toThrow();
  });
});
