import { prePhase4Digest } from "../fixtures/p4Encoding.js";
import { prePhase7Digest } from "../fixtures/p7Encoding.js";
import { prePhase5Digest } from "../fixtures/p5Encoding.js";
import { prePhase5bDigest } from "../fixtures/p5bEncoding.js";
import { prePhase6Digest } from "../fixtures/p6Encoding.js";
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

import { m5World } from "../fixtures/m5.js";

describe("determinism", () => {
  test("identical worlds produce identical century-scale driver results", () => {
    const first = createInitialWorld({ seed: 123_456_789, scenarioId: "m1-determinism" });
    const second = createInitialWorld({ seed: 123_456_789, scenarioId: "m1-determinism" });

    const firstSummary = runCampaign(first);
    const secondSummary = runCampaign(second);

    expect(secondSummary).toEqual(firstSummary);
    expect(firstSummary.ticksProcessed).toBe(CAMPAIGN_TICKS);
    expect(firstSummary.endDayIndex).toBe(CAMPAIGN_TERMINAL_DAY_INDEX);
    expect(hashWorld(second)).toBe(hashWorld(first));
  });

  test("matches the fixed empty-world century driver digest", () => {
    const world = createInitialWorld({ seed: 123_456_789, scenarioId: "m1-determinism" });
    expect(world.popBlocks).toHaveLength(0);
    expect(world.buildings).toHaveLength(0);
    expect(world.markets).toHaveLength(0);
    runCampaign(world);

    // Known-answer digest for the M1 empty-world tick driver under schema 26.
    // Schema 22 added the M9 technology-system flag and age-specific literacy; E6a
    // (schema 24) added `World.trade` and `Market.customsCountryId`, and M10
    // (schema 26) added military state. The M1 empty-world *behaviour* is unchanged;
    // only the encoded state shape changed, so this digest is intentionally
    // re-pinned. M11 (simulation 0.27.0, data m3-economy-v12) changes the version metadata encoded in the world, so the digest is re-pinned again; the empty world's behaviour is unchanged. A change here requires an intentional simulation-version decision.
    // P2 schema 28 (D-134) renames the encoded region collection to province
    // economies; the empty world's behaviour is unchanged, so the digest is re-pinned.
    // P2b schema 29 (D-135) adds province wage tables, building technique and money
    // coefficients to the encoding; the empty world's behaviour is unchanged.
    // P3 schema 30 (D-141): the schema number only; verified by running this test with the
    // constant set to 29, which reproduces the previous digest.
    // P4 schema 31 (D-142): encoding only — the schema number and the empty
    // `World.demography` record. Removing them reproduces the P3 digest.
    expect(prePhase4Digest(world)).toBe("f4a2b473a9d60631");
    // P5 schema 32 (D-143): encoding only — the schema number and the empty
    // `World.resources`. Removing them reproduces the P4 digest.
    expect(prePhase5Digest(world)).toBe("ed7c95c6ed740c64");
    // P5b schema 33 (D-147): encoding only — removing the P5b fields and restoring
    // schema 32 and simulation 0.28.0 reproduces the P5 digest.
    expect(prePhase5bDigest(world)).toBe("8f7987a7a6119c7d");
    // Data m3-economy-v13 (D-148): the content version in the encoding only; the proof
    // above restores m3-economy-v12 and still gives the P5 digest.
    // P6 schema 34 (D-153): encoding only — restoring schema 33, simulation 0.29.0 and
    // data m3-economy-v13 reproduces the P5b digest; this world has no demand system.
    expect(prePhase6Digest(world)).toBe("88433b30fbb759be");
    // P7 schema 35 (D-154): encoding only — restoring schema 34 and simulation 0.30.0 reproduces the P6 digest; this world has no labour market.
    expect(prePhase7Digest(world)).toBe("a9195048d679521e");
    expect(hashWorld(world)).toBe("1ae35968cf7255ce");
  });

  test("a one-year economic simulation is deterministic and save/resume safe", () => {
    const first = m5World();
    const second = m5World();
    const context = {
      population: { definitions: first.scenario.population.definitions },
      economy: { definitions: first.scenario.definitions },
    };
    const firstSummary = runTicks(first.world, 365, context);
    const secondSummary = runTicks(second.world, 365, context);
    expect(firstSummary.ticksProcessed).toBe(365);
    expect(secondSummary).toEqual(firstSummary);
    expect(hashWorld(second.world)).toBe(hashWorld(first.world));
    expect(serializeWorld(second.world)).toBe(serializeWorld(first.world));

    const resumed = m5World();
    runTicks(resumed.world, 180, context);
    const restored = deserializeWorld(serializeWorld(resumed.world));
    runTicks(resumed.world, 185, context);
    runTicks(restored, 185, context);
    expect(hashWorld(restored)).toBe(hashWorld(resumed.world));
    expect(serializeWorld(restored)).toBe(serializeWorld(resumed.world));
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

