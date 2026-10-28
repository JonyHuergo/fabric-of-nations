import {
  CAMPAIGN_TERMINAL_DAY_INDEX,
  CAMPAIGN_TICKS,
  createInitialWorld,
  deserializeWorld,
  hashWorld,
  runCampaign,
  runTicks,
  serializeWorld,
} from "@century/sim";

describe("determinism", () => {
  test("identical worlds produce identical century-scale results", () => {
    const first = createInitialWorld({ seed: 123_456_789, scenarioId: "m1-determinism" });
    const second = createInitialWorld({ seed: 123_456_789, scenarioId: "m1-determinism" });

    const firstSummary = runCampaign(first);
    const secondSummary = runCampaign(second);

    expect(secondSummary).toEqual(firstSummary);
    expect(firstSummary.ticksProcessed).toBe(CAMPAIGN_TICKS);
    expect(firstSummary.endDayIndex).toBe(CAMPAIGN_TERMINAL_DAY_INDEX);
    expect(hashWorld(second)).toBe(hashWorld(first));
  });

  test("matches the fixed century-run regression digest", () => {
    const world = createInitialWorld({ seed: 123_456_789, scenarioId: "m1-determinism" });
    runCampaign(world);

    // Known-answer digest for the M1 empty-world tick driver under schema 20.
    // A change here requires an intentional simulation-version decision.
    expect(hashWorld(world)).toBe("f67498f3b49a5ef1");
  });

  test("same seed with different scenarios or data identity is distinguishable", () => {
    const first = createInitialWorld({ seed: 7, scenarioId: "scenario-a" });
    const second = createInitialWorld({ seed: 7, scenarioId: "scenario-b" });
    runTicks(first, 100);
    runTicks(second, 100);
    expect(hashWorld(first)).not.toBe(hashWorld(second));

    const differentSeed = createInitialWorld({ seed: 8, scenarioId: "scenario-a" });
    runTicks(differentSeed, 100);
    expect(hashWorld(differentSeed)).not.toBe(hashWorld(first));
  });

  test("a restored world continues to the same final state as the original", () => {
    const original = createInitialWorld({ seed: 987_654_321, scenarioId: "resume-century" });
    runTicks(original, 20_000);
    const restored = deserializeWorld(serializeWorld(original));

    expect(hashWorld(restored)).toBe(hashWorld(original));
    const originalSummary = runCampaign(original);
    const restoredSummary = runCampaign(restored);
    expect(restoredSummary).toEqual(originalSummary);
    expect(hashWorld(restored)).toBe(hashWorld(original));
  });

  test("the digest covers diagnostics, not just the day index", () => {
    const first = createInitialWorld({ seed: 1, scenarioId: "digest-test" });
    const second = createInitialWorld({ seed: 1, scenarioId: "digest-test" });
    runTicks(first, 100);
    runTicks(second, 100);
    expect(hashWorld(second)).toBe(hashWorld(first));

    second.diagnostics.recentWarnings.push("diagnostic-only change");
    expect(hashWorld(second)).not.toBe(hashWorld(first));
  });

  test("save/resume neither skips nor duplicates a simulated day", () => {
    const original = createInitialWorld({ seed: 55, scenarioId: "resume-day" });
    const restored = deserializeWorld(serializeWorld(original));

    expect(restored.dayIndex).toBe(0);
    const originalTick = runTicks(original, 1);
    const restoredTick = runTicks(restored, 1);
    expect(restoredTick).toEqual(originalTick);
    expect(restored.dayIndex).toBe(1);
    expect(hashWorld(restored)).toBe(hashWorld(original));

    runTicks(original, CAMPAIGN_TERMINAL_DAY_INDEX - 2);
    const nearBoundary = deserializeWorld(serializeWorld(original));
    expect(nearBoundary.dayIndex).toBe(CAMPAIGN_TERMINAL_DAY_INDEX - 1);

    const originalFinal = runTicks(original, 1);
    const restoredFinal = runTicks(nearBoundary, 1);
    expect(restoredFinal).toEqual(originalFinal);
    expect(restoredFinal.ticksProcessed).toBe(1);
    expect(nearBoundary.dayIndex).toBe(CAMPAIGN_TERMINAL_DAY_INDEX);
    expect(hashWorld(nearBoundary)).toBe(hashWorld(original));
  });
});
