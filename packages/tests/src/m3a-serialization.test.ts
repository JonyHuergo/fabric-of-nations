import {
  WORLD_SCHEMA_VERSION,
  createEconomyWorld,
  deriveStockByGood,
  deserializeWorld,
  hashWorld,
  postCashTransfer,
  serializeWorld,
  type Market,
  type World,
} from "@century/sim";
import {
  M3_BUILDING_ACCOUNT_FIRST_ID,
  M3_HOUSEHOLD_ACCOUNT_IDS,
  cloneM3Scenario,
  m3Scenario,
} from "./fixtures/m3a.js";

interface ParsedPayload {
  schemaVersion?: unknown;
  simVersion?: unknown;
  dataVersion?: unknown;
  markets?: Array<{
    stockLots?: unknown;
    stockByGood?: unknown;
  }>;
  finance?: {
    postings?: unknown;
  };
  buildings?: unknown;
  employment?: unknown;
  employmentDirty?: unknown;
}

interface ParsedEnvelope {
  schemaVersion?: unknown;
  simVersion?: unknown;
  dataVersion?: unknown;
  payload?: ParsedPayload;
}

function parseEnvelope(text: string): ParsedEnvelope {
  return JSON.parse(text) as ParsedEnvelope;
}

function cloneWorld(): World {
  const scenario = m3Scenario();
  return createEconomyWorld(scenario, { seed: 20_261_023 });
}

describe("M3a schema-25 serialization", () => {
  test("matches the fixed M3a structural-world digest", () => {
    // Updated for schema 22: the world now serializes the M9 technology-system
    // flag and each pop block's authoritative age-specific literacy array. The
    // M3 fixture has technology disabled, so no behaviour changes. E6a (schema 24)
    // adds `World.trade` and `Market.customsCountryId`, so the structural digest is
    // intentionally re-pinned; the fixture still has trade disabled. M11 (simulation 0.27.0, data m3-economy-v12) changes the encoded version metadata, so the digest is re-pinned again without changing the fixture's behaviour.
    // P2 schema 28 (D-134): province economy record, land fields and the removed
    // market region list change the encoding, not the fixture's behaviour.
    expect(hashWorld(cloneWorld())).toBe("7d2bb34588596f03");
  });

  test("round-trips buildings, assignments, markets, lots, accounts, and postings", () => {
    const world = cloneWorld();
    postCashTransfer(world.finance, 0, "goods-purchase", {
      fromAccountId: M3_HOUSEHOLD_ACCOUNT_IDS[0],
      toAccountId: M3_BUILDING_ACCOUNT_FIRST_ID,
      amountRUSD: 25,
    });
    world.dayIndex = 30;

    const serialized = serializeWorld(world);
    const parsed = parseEnvelope(serialized);
    expect(parsed.schemaVersion).toBe(WORLD_SCHEMA_VERSION);
    expect(parsed.payload?.buildings).toHaveLength(8);
    expect(parsed.payload?.employment).toHaveLength(3);
    expect(parsed.payload?.employmentDirty).toBe(true);
    expect(parsed.payload?.markets).toHaveLength(1);
    expect(parsed.payload?.finance?.postings).toHaveLength(1);
    expect(parsed.payload?.markets?.[0]?.stockLots).toBeDefined();
    expect(parsed.payload?.markets?.[0]?.stockByGood).toBeUndefined();
    expect(serialized).not.toContain("stockByGood");

    const restored = deserializeWorld(serialized);
    expect(hashWorld(restored)).toBe(hashWorld(world));
    expect(restored.buildings).toEqual(world.buildings);
    expect(restored.employment).toEqual(world.employment);
    expect(restored.markets[0]?.priceRUSD).toEqual(world.markets[0]?.priceRUSD);
    expect(restored.markets[0]?.stockLots).toEqual(world.markets[0]?.stockLots);
    expect(restored.finance.accounts).toEqual(world.finance.accounts);
    expect(restored.finance.postings).toEqual(world.finance.postings);
    expect(restored.popBlocks[0]?.maleByAge).toBeInstanceOf(Uint32Array);
    expect(restored.popBlocks[0]?.femaleByAge).toBeInstanceOf(Uint32Array);
  });

  test("canonicalizes lots and ignores derived-stock caches in hashes", () => {
    const first = cloneWorld();
    const second = cloneWorld();
    const market = second.markets[0] as Market;
    market.stockLots.reverse();
    expect(hashWorld(second)).toBe(hashWorld(first));
    expect(serializeWorld(second)).toBe(serializeWorld(first));

    const hashBefore = hashWorld(first);
    const derived = deriveStockByGood(first.markets[0] as Market, 8);
    derived[0] = 999_999;
    (first.markets[0] as unknown as { stockByGood: number[] }).stockByGood = derived;
    expect(hashWorld(first)).toBe(hashBefore);
    expect(serializeWorld(first)).not.toContain("stockByGood");
  });

  test("save/resume at a tick boundary is deterministic", () => {
    const original = cloneWorld();
    original.dayIndex = 123;
    original.diagnostics.recentWarnings.push("m3a boundary save");
    const restored = deserializeWorld(serializeWorld(original));

    expect(restored.dayIndex).toBe(123);
    expect(hashWorld(restored)).toBe(hashWorld(original));
    expect(restored.diagnostics.recentWarnings).toEqual(original.diagnostics.recentWarnings);
  });

  test("rejects older schema, simulation, and data versions", () => {
    const serialized = serializeWorld(cloneWorld());

    const oldSchema = parseEnvelope(serialized);
    oldSchema.schemaVersion = 3;
    expect(() => deserializeWorld(JSON.stringify(oldSchema))).toThrow(/schema/i);

    const oldSim = parseEnvelope(serialized);
    oldSim.simVersion = "0.3.0";
    expect(() => deserializeWorld(JSON.stringify(oldSim))).toThrow(/simulation version/i);

    const oldData = parseEnvelope(serialized);
    oldData.dataVersion = "m2.1-population-v1";
    expect(() => deserializeWorld(JSON.stringify(oldData))).toThrow(/content version/i);
  });

  test("rejects duplicate lots before serialization", () => {
    const world = cloneWorld();
    const market = world.markets[0] as Market;
    const first = market.stockLots[0];
    if (first === undefined) throw new Error("missing lot");
    market.stockLots.push({ ...first });
    expect(() => serializeWorld(world)).toThrow(/duplicate|lot/i);
    expect(deserializeWorld(serializeWorld(cloneWorld()))).toBeDefined();
  });

  test("preserves the M2 population typed-array round trip", () => {
    const scenario = m3Scenario();
    const world = createEconomyWorld(scenario, { seed: 20_261_023 });
    const restored = deserializeWorld(serializeWorld(world));
    expect(restored.popBlocks.map((block) => block.id)).toEqual(
      world.popBlocks.map((block) => block.id),
    );
    expect(restored.popBlocks[0]?.maleByAge).toBeInstanceOf(Uint32Array);
  });

  test("rejects malformed decoded markets and references", () => {
    const invalid = cloneM3Scenario();
    invalid.markets[0]!.priceRUSD = [0.05];
    expect(() => createEconomyWorld(invalid)).toThrow(/price|good|length/i);
  });
});

