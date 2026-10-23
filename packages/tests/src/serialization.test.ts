import {
  SaveFormatError,
  createInitialWorld,
  decodeTypedArray,
  deserializeWorld,
  encodeTypedArray,
  hashWorld,
  runCampaign,
  runTicks,
  serializeWorld,
  type SupportedTypedArray,
  type World,
} from "@century/sim";

interface ParsedTypedArray {
  encoding?: unknown;
  kind?: unknown;
  length?: unknown;
  values?: unknown;
}

interface ParsedEnvelope {
  format?: unknown;
  formatVersion?: unknown;
  schemaVersion?: unknown;
  simVersion?: unknown;
  dataVersion?: unknown;
  scenarioId?: unknown;
  dayIndex?: unknown;
  seed?: unknown;
  checksum?: unknown;
  payload?: {
    dayIndex?: unknown;
    scenarioId?: unknown;
  };
}

function parseEnvelope(text: string): ParsedEnvelope {
  return JSON.parse(text) as ParsedEnvelope;
}

function reorderKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => reorderKeys(item));
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const reordered: Record<string, unknown> = {};
    for (const key of Object.keys(record).reverse()) {
      reordered[key] = reorderKeys(record[key]);
    }
    return reordered;
  }
  return value;
}

describe("world serialization and restoration", () => {
  test("checksum and decoding do not depend on JSON object key order", () => {
    const world = createInitialWorld({ seed: 31, scenarioId: "key-order-test" });
    runTicks(world, 25);
    world.diagnostics.recentWarnings.push("order-independent");
    const serialized = serializeWorld(world);

    const reorderedText = JSON.stringify(reorderKeys(JSON.parse(serialized) as unknown));
    if (reorderedText === undefined) throw new Error("expected reordered JSON text");
    expect(reorderedText).not.toBe(serialized);

    const restored = deserializeWorld(reorderedText);
    expect(hashWorld(restored)).toBe(hashWorld(world));
  });
  test("round-trips all authoritative fields", () => {
    const world = createInitialWorld({ seed: 123_456_789, scenarioId: "serialization-test" });
    runTicks(world, 1_234);
    world.diagnostics.recentWarnings.push("round-trip diagnostic");

    const serialized = serializeWorld(world);
    expect(serializeWorld(world)).toBe(serialized);
    expect(serialized).not.toContain("processedDayRing");

    const restored = deserializeWorld(serialized);
    expect(restored).not.toBe(world);
    expect(restored.schemaVersion).toBe(world.schemaVersion);
    expect(restored.simVersion).toBe(world.simVersion);
    expect(restored.dataVersion).toBe(world.dataVersion);
    expect(restored.scenarioId).toBe(world.scenarioId);
    expect(restored.dayIndex).toBe(world.dayIndex);
    expect(restored.seed).toBe(world.seed);
    expect(restored.diagnostics.invariantFailureCount).toBe(
      world.diagnostics.invariantFailureCount,
    );
    expect(restored.diagnostics.invalidActionCount).toBe(world.diagnostics.invalidActionCount);
    expect(restored.diagnostics.eventApplicationCount).toBe(
      world.diagnostics.eventApplicationCount,
    );
    expect(restored.diagnostics.recentWarnings).toEqual(world.diagnostics.recentWarnings);
    expect(hashWorld(restored)).toBe(hashWorld(world));
  });

  test("restored state continues with identical subsequent behavior", () => {
    const original = createInitialWorld({ seed: 42, scenarioId: "resume-test" });
    runTicks(original, 12_345);
    const restored = deserializeWorld(serializeWorld(original));
    expect(hashWorld(restored)).toBe(hashWorld(original));

    const originalSummary = runTicks(original, 5_000);
    const restoredSummary = runTicks(restored, 5_000);
    expect(restoredSummary).toEqual(originalSummary);
    expect(hashWorld(restored)).toBe(hashWorld(original));
  });

  test("save and restore at the terminal boundary preserves the completed state", () => {
    const world = createInitialWorld({ seed: 42, scenarioId: "terminal-save" });
    runCampaign(world);
    const restored = deserializeWorld(serializeWorld(world));

    expect(restored.dayIndex).toBe(36_524);
    expect(hashWorld(restored)).toBe(hashWorld(world));
    expect(runTicks(restored, 1).ticksProcessed).toBe(0);
    expect(hashWorld(restored)).toBe(hashWorld(world));
  });

  test("rejects malformed JSON and non-string input with SaveFormatError", () => {
    expect(() => deserializeWorld("{not json")).toThrow(SaveFormatError);
    expect(() => deserializeWorld("")).toThrow(SaveFormatError);
    expect(() => deserializeWorld(42 as unknown as string)).toThrow(SaveFormatError);
    expect(() => deserializeWorld("null")).toThrow(SaveFormatError);
    expect(() => deserializeWorld("[]")).toThrow(SaveFormatError);
  });

  test("rejects checksum mismatch from payload tampering", () => {
    const world = createInitialWorld({ seed: 5, scenarioId: "checksum-test" });
    runTicks(world, 10);
    const parsed = parseEnvelope(serializeWorld(world));
    if (parsed.payload === undefined) throw new Error("expected a payload");
    parsed.payload.dayIndex = 11;
    expect(() => deserializeWorld(JSON.stringify(parsed))).toThrow(/checksum/i);
  });

  test("rejects envelope and payload metadata mismatch", () => {
    const world = createInitialWorld({ seed: 5, scenarioId: "metadata-test" });
    const serialized = serializeWorld(world);

    const badScenario = parseEnvelope(serialized);
    badScenario.scenarioId = "different-scenario";
    expect(() => deserializeWorld(JSON.stringify(badScenario))).toThrow(/metadata/i);

    const badDay = parseEnvelope(serialized);
    badDay.dayIndex = 1;
    expect(() => deserializeWorld(JSON.stringify(badDay))).toThrow(/metadata/i);

    const badSeed = parseEnvelope(serialized);
    badSeed.seed = 6;
    expect(() => deserializeWorld(JSON.stringify(badSeed))).toThrow(/metadata/i);
  });

  test("rejects incompatible format and version metadata", () => {
    const serialized = serializeWorld(createInitialWorld({ seed: 5, scenarioId: "version-test" }));

    const badFormat = parseEnvelope(serialized);
    badFormat.format = "other-game";
    expect(() => deserializeWorld(JSON.stringify(badFormat))).toThrow(/format/i);

    const badFormatVersion = parseEnvelope(serialized);
    badFormatVersion.formatVersion = 99;
    expect(() => deserializeWorld(JSON.stringify(badFormatVersion))).toThrow(/format version/i);

    const badSchema = parseEnvelope(serialized);
    badSchema.schemaVersion = 99;
    expect(() => deserializeWorld(JSON.stringify(badSchema))).toThrow(/schema/i);

    const badSim = parseEnvelope(serialized);
    badSim.simVersion = "0.0.1";
    expect(() => deserializeWorld(JSON.stringify(badSim))).toThrow(/simulation version/i);

    const badData = parseEnvelope(serialized);
    badData.dataVersion = "other-data";
    expect(() => deserializeWorld(JSON.stringify(badData))).toThrow(/content version/i);

    const badDay = parseEnvelope(serialized);
    badDay.dayIndex = 36_525;
    expect(() => deserializeWorld(JSON.stringify(badDay))).toThrow(SaveFormatError);

    const missingPayload = parseEnvelope(serialized);
    delete missingPayload.payload;
    expect(() => deserializeWorld(JSON.stringify(missingPayload))).toThrow(SaveFormatError);

    const missingChecksum = parseEnvelope(serialized);
    delete missingChecksum.checksum;
    expect(() => deserializeWorld(JSON.stringify(missingChecksum))).toThrow(SaveFormatError);
  });

  test("refuses to serialize impossible world state", () => {
    const invalid: World = {
      ...createInitialWorld({ seed: 5, scenarioId: "invalid-save" }),
      dayIndex: 36_525,
    };
    expect(() => serializeWorld(invalid)).toThrow(RangeError);
  });
});

describe("typed-array encoding", () => {
  test("survives an isolated JSON serialization fixture", () => {
    const fixture = {
      fixtureVersion: 1,
      samples: encodeTypedArray(new Float64Array([0.25, -1.5, 1e-300])),
      counts: encodeTypedArray(new Int32Array([-2, 0, 7])),
    };

    const parsed = JSON.parse(JSON.stringify(fixture)) as {
      samples: ParsedTypedArray;
      counts: ParsedTypedArray;
    };
    const samples = decodeTypedArray(parsed.samples);
    const counts = decodeTypedArray(parsed.counts);

    expect(samples).toBeInstanceOf(Float64Array);
    expect(counts).toBeInstanceOf(Int32Array);
    expect(Array.from(samples)).toEqual([0.25, -1.5, 1e-300]);
    expect(Array.from(counts)).toEqual([-2, 0, 7]);
  });

  test("round-trips every supported numeric typed-array kind", () => {
    const cases: SupportedTypedArray[] = [
      new Int8Array([-128, -1, 0, 127]),
      new Uint8Array([0, 1, 255]),
      new Uint8ClampedArray([0, 128, 255]),
      new Int16Array([-32_768, 0, 32_767]),
      new Uint16Array([0, 65_535]),
      new Int32Array([-2_147_483_648, 0, 2_147_483_647]),
      new Uint32Array([0, 4_294_967_295]),
      new Float32Array([0.5, -2.25, 1]),
      new Float64Array([0.1, -1.5, 1e-300]),
    ];

    for (const array of cases) {
      const encoded = encodeTypedArray(array);
      expect(encoded.encoding).toBe("typed-array-v1");
      expect(encoded.length).toBe(array.length);
      const decoded = decodeTypedArray(encoded);
      expect(decoded.constructor).toBe(array.constructor);
      expect(Array.from(decoded)).toEqual(Array.from(array));
    }
  });

  test("normalizes negative zero so JSON round trips are lossless", () => {
    const encoded = encodeTypedArray(new Float64Array([-0, 0]));
    expect(encoded.values).toEqual([0, 0]);
    const decoded = decodeTypedArray(encoded);
    expect(Array.from(decoded)).toEqual([0, 0]);
    expect(Object.is(decoded[0], -0)).toBe(false);
  });

  test("rejects malformed and out-of-range encoded arrays", () => {
    expect(() => decodeTypedArray(null)).toThrow(TypeError);
    expect(() =>
      decodeTypedArray({ encoding: "other", kind: "Int32Array", length: 0, values: [] }),
    ).toThrow(/encoding/i);
    expect(() =>
      decodeTypedArray({ encoding: "typed-array-v1", kind: "NopeArray", length: 0, values: [] }),
    ).toThrow(/kind/i);
    expect(() =>
      decodeTypedArray({
        encoding: "typed-array-v1",
        kind: "Int32Array",
        length: 2,
        values: [1],
      }),
    ).toThrow(/length/i);
    expect(() =>
      decodeTypedArray({
        encoding: "typed-array-v1",
        kind: "Uint8Array",
        length: 1,
        values: [256],
      }),
    ).toThrow(RangeError);
    expect(() =>
      decodeTypedArray({
        encoding: "typed-array-v1",
        kind: "Int32Array",
        length: 1,
        values: [1.5],
      }),
    ).toThrow(TypeError);
    expect(() =>
      decodeTypedArray({
        encoding: "typed-array-v1",
        kind: "Float64Array",
        length: 1,
        values: [Number.POSITIVE_INFINITY],
      }),
    ).toThrow(TypeError);
    expect(() =>
      decodeTypedArray({
        encoding: "typed-array-v1",
        kind: "Float32Array",
        length: 1,
        values: [0.1],
      }),
    ).toThrow(RangeError);
  });
});
