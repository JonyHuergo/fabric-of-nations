import {
  SaveFormatError,
  SINGLE_AGE_COUNT,
  deserializeWorld,
  hashWorld,
  runTicks,
  serializeWorld,
  tick,
  type World,
} from "@century/sim";
import {
  aggregateWorld,
  contextFor,
  makeInputs,
  multiBlockWorld,
} from "../fixtures/m2.js";

interface EncodedArrayShape {
  encoding?: unknown;
  kind?: unknown;
}

interface ParsedEnvelope {
  schemaVersion?: unknown;
  simVersion?: unknown;
  payload?: {
    provinces?: unknown;
    popBlocks?: Array<{
      maleByAge?: EncodedArrayShape;
      femaleByAge?: EncodedArrayShape;
    }>;
    finance?: { accounts?: unknown };
  };
}

function parseEnvelope(text: string): ParsedEnvelope {
  return JSON.parse(text) as ParsedEnvelope;
}

describe("M2.1 serialization and restoration", () => {
  test("round-trips single-year sex arrays, accounts, and population fields", () => {
    const { scenario, world } = aggregateWorld();
    const inputs = makeInputs([0]);
    const context = contextFor(scenario, inputs);
    runTicks(world, 500, context);
    const serialized = serializeWorld(world);
    // Save format 2 (D-137): pop-block age arrays are stored as flat columns of
    // SINGLE_AGE_COUNT cells per block and accounts as columns.
    const parsed = JSON.parse(serialized) as {
      formatVersion: number;
      payload: {
        popBlocks: { ageCount: number; maleByAge: number[]; femaleByAge: number[] };
        finance: { accounts: { id: number[]; balanceRUSD: number[] } };
      };
    };
    expect(parsed.formatVersion).toBe(2);
    expect(parsed.payload.popBlocks.ageCount).toBe(SINGLE_AGE_COUNT);
    expect(parsed.payload.popBlocks.maleByAge).toHaveLength(world.popBlocks.length * SINGLE_AGE_COUNT);
    expect(parsed.payload.popBlocks.femaleByAge).toHaveLength(world.popBlocks.length * SINGLE_AGE_COUNT);
    expect(parsed.payload.finance.accounts.id).toHaveLength(world.finance.accounts.length);
    expect(parsed.payload.finance.accounts.balanceRUSD).toHaveLength(world.finance.accounts.length);

    const restored = deserializeWorld(serialized);
    expect(restored.popBlocks[0]?.maleByAge).toBeInstanceOf(Uint32Array);
    expect(restored.popBlocks[0]?.femaleByAge).toBeInstanceOf(Uint32Array);
    expect(restored.popBlocks[0]?.maleByAge).toHaveLength(SINGLE_AGE_COUNT);
    expect(restored.popBlocks[0]?.femaleByAge).toHaveLength(SINGLE_AGE_COUNT);
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
    expect(restored.finance.accounts).toHaveLength(12);
    for (const block of restored.popBlocks) {
      expect(
        restored.finance.accounts.some((account) => account.id === block.financialAccountId),
      ).toBe(true);
    }
    expect(hashWorld(restored)).toBe(hashWorld(world));
  });

  test("restores across a birth/death and annual age transition", () => {
    const { scenario, world } = aggregateWorld();
    const inputs = makeInputs([0]);
    const context = contextFor(scenario, inputs, false);
    runTicks(world, 365, context);
    const restored = deserializeWorld(serializeWorld(world));
    const originalResult = tick(world, context);
    const restoredResult = tick(restored, context);
    expect(originalResult.population?.aged).toBe(true);
    expect(restoredResult.population?.aged).toBe(true);
    expect(restoredResult.population?.demography.totalBirths).toBe(
      originalResult.population?.demography.totalBirths,
    );
    expect(restoredResult.population?.demography.totalDeaths).toBe(
      originalResult.population?.demography.totalDeaths,
    );
    expect(hashWorld(restored)).toBe(hashWorld(world));
  });

  test("rejects a schema-2 / simulation-0.2 save with a clear error", () => {
    const { world } = aggregateWorld();
    const serialized = serializeWorld(world);

    const oldSchema = parseEnvelope(serialized);
    oldSchema.schemaVersion = 2;
    expect(() => deserializeWorld(JSON.stringify(oldSchema))).toThrow(/schema/i);

    const oldSim = parseEnvelope(serialized);
    oldSim.simVersion = "0.2.0";
    expect(() => deserializeWorld(JSON.stringify(oldSim))).toThrow(/simulation version/i);
  });

  test("rejects corrupt payloads and malformed typed arrays", () => {
    const { world } = aggregateWorld();
    // Save format 2 (D-137): a flat age column with a value no Uint32Array can hold,
    // and one with a missing cell.
    const negative = JSON.parse(serializeWorld(world)) as {
      payload: { popBlocks: { femaleByAge: number[] } };
    };
    negative.payload.popBlocks.femaleByAge[0] = -1;
    expect(() => deserializeWorld(JSON.stringify(negative))).toThrow(SaveFormatError);
    const short = JSON.parse(serializeWorld(world)) as {
      payload: { popBlocks: { femaleByAge: number[] } };
    };
    short.payload.popBlocks.femaleByAge.pop();
    expect(() => deserializeWorld(JSON.stringify(short))).toThrow(SaveFormatError);
  });

  test("world state validation rejects invalid account references", () => {
    const { world } = aggregateWorld();
    world.popBlocks[0]!.financialAccountId = 999;
    expect(() => serializeWorld(world as World)).toThrow(/account|unknown/i);
  });
});
