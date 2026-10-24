import {
  SaveFormatError,
  deserializeWorld,
  hashWorld,
  runTicks,
  serializeWorld,
  type World,
} from "@century/sim";
import {
  aggregateWorld,
  contextFor,
  makeInputs,
  multiBlockWorld,
} from "./fixtures/m2.js";

interface EncodedArrayShape {
  encoding?: unknown;
  kind?: unknown;
}

interface ParsedEnvelope {
  schemaVersion?: unknown;
  simVersion?: unknown;
  payload?: {
    regions?: unknown;
    popBlocks?: Array<{
      ageCohorts?: EncodedArrayShape;
      agingCarry?: EncodedArrayShape;
    }>;
    finance?: { accounts?: unknown };
  };
}

function parseEnvelope(text: string): ParsedEnvelope {
  return JSON.parse(text) as ParsedEnvelope;
}

describe("M2 serialization and restoration", () => {
  test("round-trips typed arrays, accounts, and population fields", () => {
    const { scenario, world } = aggregateWorld();
    const inputs = makeInputs([0]);
    const context = contextFor(scenario, inputs);
    runTicks(world, 500, context);
    const serialized = serializeWorld(world);
    const parsed = parseEnvelope(serialized);
    const encodedBlock = parsed.payload?.popBlocks?.[0];
    expect(encodedBlock?.ageCohorts?.encoding).toBe("typed-array-v1");
    expect(encodedBlock?.ageCohorts?.kind).toBe("Uint32Array");
    expect(encodedBlock?.agingCarry?.encoding).toBe("typed-array-v1");
    expect(encodedBlock?.agingCarry?.kind).toBe("Uint8Array");
    expect(Array.isArray(parsed.payload?.finance?.accounts)).toBe(true);

    const restored = deserializeWorld(serialized);
    expect(restored.popBlocks[0]?.ageCohorts).toBeInstanceOf(Uint32Array);
    expect(restored.popBlocks[0]?.agingCarry).toBeInstanceOf(Uint8Array);
    expect(restored.popBlocks[0]?.ageCohorts).toHaveLength(17);
    expect(restored.popBlocks[0]?.agingCarry).toHaveLength(17);
    expect(hashWorld(restored)).toBe(hashWorld(world));
    expect(restored.finance.accounts).toEqual(world.finance.accounts);
  });

  test("continues deterministically after restoration", () => {
    const { scenario, world } = aggregateWorld();
    const inputs = makeInputs([0]);
    const context = contextFor(scenario, inputs, false);
    runTicks(world, 400, context);
    const restored = deserializeWorld(serializeWorld(world));
    expect(hashWorld(restored)).toBe(hashWorld(world));
    const originalSummary = runTicks(world, 1_000, context);
    const restoredSummary = runTicks(restored, 1_000, context);
    expect(restoredSummary).toEqual(originalSummary);
    expect(hashWorld(restored)).toBe(hashWorld(world));
  });

  test("restores a multi-block world with all account references intact", () => {
    const { world } = multiBlockWorld();
    const restored = deserializeWorld(serializeWorld(world));
    expect(restored.popBlocks).toHaveLength(3);
    expect(restored.finance.accounts).toHaveLength(3);
    for (const block of restored.popBlocks) {
      expect(
        restored.finance.accounts.some((account) => account.id === block.financialAccountId),
      ).toBe(true);
    }
    expect(hashWorld(restored)).toBe(hashWorld(world));
  });

  test("rejects a schema-1 / simulation-0.1 save with a clear error", () => {
    const { world } = aggregateWorld();
    const serialized = serializeWorld(world);

    const oldSchema = parseEnvelope(serialized);
    oldSchema.schemaVersion = 1;
    expect(() => deserializeWorld(JSON.stringify(oldSchema))).toThrow(/schema/i);

    const oldSim = parseEnvelope(serialized);
    oldSim.simVersion = "0.1.0";
    expect(() => deserializeWorld(JSON.stringify(oldSim))).toThrow(/simulation version/i);
  });

  test("rejects corrupt payloads and malformed typed arrays", () => {
    const { world } = aggregateWorld();
    const parsed = parseEnvelope(serializeWorld(world));
    if (parsed.payload?.popBlocks?.[0] === undefined) throw new Error("missing pop block");
    parsed.payload.popBlocks[0].agingCarry = {
      encoding: "typed-array-v1",
      kind: "Int32Array",
    };
    expect(() => deserializeWorld(JSON.stringify(parsed))).toThrow(SaveFormatError);
  });

  test("world state validation rejects invalid account references", () => {
    const { world } = aggregateWorld();
    world.popBlocks[0]!.financialAccountId = 999;
    expect(() => serializeWorld(world as World)).toThrow(/account|unknown/i);
  });
});
