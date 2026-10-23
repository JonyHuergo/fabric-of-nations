import {
  CAMPAIGN_TICKS,
  CAMPAIGN_TERMINAL_DAY_INDEX,
  MAX_WARNING_LENGTH,
  createInitialWorld,
  dayIndexToCivilDate,
  hashWorld,
  isCampaignComplete,
  runCampaign,
  runTicks,
  tick,
  type World,
} from "@century/sim";

describe("M1 no-op tick driver", () => {
  test("starts on the next civil day, 1900-01-01", () => {
    const world = createInitialWorld({ seed: 7, scenarioId: "tick-test" });
    expect(world.dayIndex).toBe(0);
    expect(dayIndexToCivilDate(world.dayIndex)).toEqual({ year: 1900, month: 1, day: 1 });
    expect(world.diagnostics).toEqual({
      invariantFailureCount: 0,
      invalidActionCount: 0,
      eventApplicationCount: 0,
      recentWarnings: [],
    });
  });

  test("processes exactly one day and changes only the day index", () => {
    const world = createInitialWorld({ seed: 7, scenarioId: "tick-test" });
    const diagnosticsBefore = JSON.stringify(world.diagnostics);
    const before = {
      schemaVersion: world.schemaVersion,
      simVersion: world.simVersion,
      dataVersion: world.dataVersion,
      scenarioId: world.scenarioId,
      seed: world.seed,
    };

    const result = tick(world);

    expect(result).toEqual({
      advanced: true,
      dayProcessed: 0,
      dayIndex: 1,
      campaignComplete: false,
    });
    expect(world.dayIndex).toBe(1);
    expect(JSON.stringify(world.diagnostics)).toBe(diagnosticsBefore);
    expect({
      schemaVersion: world.schemaVersion,
      simVersion: world.simVersion,
      dataVersion: world.dataVersion,
      scenarioId: world.scenarioId,
      seed: world.seed,
    }).toEqual(before);
  });

  test("advances 36,524 transitions to the terminal boundary", () => {
    const world = createInitialWorld({ seed: 7, scenarioId: "tick-test" });
    const summary = runCampaign(world);

    expect(summary).toEqual({
      startDayIndex: 0,
      endDayIndex: CAMPAIGN_TERMINAL_DAY_INDEX,
      ticksProcessed: CAMPAIGN_TICKS,
      terminalReached: true,
    });
    expect(world.dayIndex).toBe(36_524);
    expect(isCampaignComplete(world)).toBe(true);
    expect(dayIndexToCivilDate(world.dayIndex)).toEqual({ year: 2000, month: 1, day: 1 });
  });

  test("does not process a day at the terminal boundary", () => {
    const world = createInitialWorld({ seed: 7, scenarioId: "tick-test" });
    runCampaign(world);
    const hashAtTerminal = hashWorld(world);

    const result = tick(world);

    expect(result).toEqual({
      advanced: false,
      dayProcessed: null,
      dayIndex: 36_524,
      campaignComplete: true,
    });
    expect(world.dayIndex).toBe(36_524);
    expect(hashWorld(world)).toBe(hashAtTerminal);
  });

  test("marks the final campaign day as complete", () => {
    const world = createInitialWorld({ seed: 7, scenarioId: "tick-test" });
    runTicks(world, 36_523);
    expect(world.dayIndex).toBe(36_523);
    expect(dayIndexToCivilDate(world.dayIndex)).toEqual({ year: 1999, month: 12, day: 31 });

    const result = tick(world);
    expect(result.advanced).toBe(true);
    expect(result.dayProcessed).toBe(36_523);
    expect(result.dayIndex).toBe(36_524);
    expect(result.campaignComplete).toBe(true);
  });

  test("runTicks is bounded and stops safely at the terminal boundary", () => {
    const world = createInitialWorld({ seed: 7, scenarioId: "tick-test" });
    const first = runTicks(world, 10);
    expect(first).toEqual({
      requestedTicks: 10,
      startDayIndex: 0,
      endDayIndex: 10,
      ticksProcessed: 10,
      terminalReached: false,
    });

    const rest = runTicks(world, CAMPAIGN_TICKS);
    expect(rest.requestedTicks).toBe(CAMPAIGN_TICKS);
    expect(rest.ticksProcessed).toBe(CAMPAIGN_TICKS - 10);
    expect(rest.endDayIndex).toBe(CAMPAIGN_TERMINAL_DAY_INDEX);
    expect(rest.terminalReached).toBe(true);

    const atTerminal = runTicks(world, 5);
    expect(atTerminal.ticksProcessed).toBe(0);
    expect(atTerminal.terminalReached).toBe(true);
  });

  test("rejects invalid tick counts", () => {
    const world = createInitialWorld({ seed: 7, scenarioId: "tick-test" });
    expect(() => runTicks(world, -1)).toThrow(RangeError);
    expect(() => runTicks(world, 1.5)).toThrow(TypeError);
  });

  test("rejects impossible world state before advancing", () => {
    const invalidDay: World = {
      ...createInitialWorld({ seed: 7, scenarioId: "tick-test" }),
      dayIndex: 36_525,
    };
    expect(() => tick(invalidDay)).toThrow(RangeError);
    expect(() => runTicks(invalidDay, 0)).toThrow(RangeError);
    expect(() => runCampaign(invalidDay)).toThrow(RangeError);

    const invalidWarning = createInitialWorld({ seed: 7, scenarioId: "tick-test" });
    invalidWarning.diagnostics.recentWarnings.push("x".repeat(MAX_WARNING_LENGTH + 1));
    expect(() => tick(invalidWarning)).toThrow(RangeError);
    expect(() => runTicks(invalidWarning, 0)).toThrow(RangeError);
  });
});
