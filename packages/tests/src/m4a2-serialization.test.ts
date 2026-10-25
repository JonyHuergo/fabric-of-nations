import { loadM2WorldAggregate } from "@century/data";
import {
  assertValidWorld,
  cloneWorld,
  createEconomyWorld,
  createPopulationWorld,
  crossRateFor,
  deserializeWorld,
  hashWorld,
  serializeWorld,
  tick,
  type EconomyScenarioDef,
} from "@century/sim";
import { economyTickContext } from "./fixtures/m3e.js";
import {
  baseScenario,
  foreignAdoptionScenario,
  ownCurrencyScenario,
  unavailable,
  unavailableValuationScenario,
} from "./fixtures/m4a2.js";

function build(scenario: EconomyScenarioDef) {
  return createEconomyWorld(scenario, { seed: 20_261_023 });
}

describe("M4a-2 serialization and determinism", () => {
  test("round-trips countries, currencies, and specified valuations", () => {
    const world = build(foreignAdoptionScenario());
    const restored = deserializeWorld(serializeWorld(world));
    expect(restored.countries).toEqual(world.countries);
    expect(restored.currencies).toEqual(world.currencies);
    expect(restored.currencyValuations).toEqual(world.currencyValuations);
    expect(hashWorld(restored)).toBe(hashWorld(world));
    expect(() => assertValidWorld(restored)).not.toThrow();
    expect(crossRateFor(restored.currencyValuations, 0, 1)).toBeCloseTo(0.125, 12);
  });

  test("round-trips an unavailable valuation without fabricating a rate", () => {
    const world = build(unavailableValuationScenario());
    const restored = deserializeWorld(serializeWorld(world));
    expect(restored.currencyValuations).toEqual([
      { currencyId: 0, status: "unavailable" },
    ]);
    expect(hashWorld(restored)).toBe(hashWorld(world));
  });

  test("cloneWorld deep-copies every new collection and nested record", () => {
    const world = build(foreignAdoptionScenario());
    const original = serializeWorld(world);
    const clone = cloneWorld(world);
    expect(serializeWorld(clone)).toBe(original);
    expect(hashWorld(clone)).toBe(hashWorld(world));

    clone.countries[0]!.monetary = { kind: "adopted", currencyId: 0 };
    clone.countries[0]!.regionIds.push(1);
    clone.currencies[0]!.issuer = { kind: "foreign", issuerKey: "changed" };
    clone.currencyValuations[0] = unavailable(0);

    expect(serializeWorld(world)).toBe(original);
    expect(clone.countries[0]).not.toBe(world.countries[0]);
    expect(clone.countries[0]!.monetary).not.toBe(world.countries[0]!.monetary);
    expect(clone.countries[0]!.regionIds).not.toBe(world.countries[0]!.regionIds);
    expect(clone.currencies[0]).not.toBe(world.currencies[0]);
    expect(clone.currencies[0]!.issuer).not.toBe(world.currencies[0]!.issuer);
    expect(clone.currencyValuations[0]).not.toBe(world.currencyValuations[0]);
  });

  test("canonical ordering makes collection order irrelevant to the digest", () => {
    const world = build(simulatedForeignScenario());
    const reordered = cloneWorld(world);
    reordered.countries.reverse();
    reordered.currencies.reverse();
    reordered.currencyValuations.reverse();
    reordered.countries.forEach((country) => country.regionIds.reverse());
    expect(hashWorld(reordered)).toBe(hashWorld(world));
    expect(serializeWorld(reordered)).toBe(serializeWorld(world));
  });

  test("changing any new authoritative field changes the digest", () => {
    const base = build(foreignAdoptionScenario());
    const original = hashWorld(base);

    const countryChanged = cloneWorld(base);
    countryChanged.countries[0]!.tag = "ALT";
    expect(hashWorld(countryChanged)).not.toBe(original);

    const currencyChanged = cloneWorld(base);
    currencyChanged.currencies[0]!.name = "Renamed";
    expect(hashWorld(currencyChanged)).not.toBe(original);

    const valuationChanged = cloneWorld(base);
    valuationChanged.currencyValuations[0] = unavailable(0);
    expect(hashWorld(valuationChanged)).not.toBe(original);
  });

  test("save/resume continues deterministically", () => {
    const scenario = ownCurrencyScenario();
    const first = build(scenario);
    const second = build(scenario);
    const context = economyTickContext(scenario);
    tick(first, context);
    tick(second, context);
    expect(hashWorld(second)).toBe(hashWorld(first));

    const restored = deserializeWorld(serializeWorld(first));
    expect(hashWorld(restored)).toBe(hashWorld(first));
    tick(first, context);
    tick(restored, context);
    expect(hashWorld(restored)).toBe(hashWorld(first));
  });

  test("M2-only and M3 worlds without countries remain valid with empty collections", () => {
    const m2 = createPopulationWorld(loadM2WorldAggregate(), { seed: 1 });
    expect(m2.countries).toEqual([]);
    expect(m2.currencies).toEqual([]);
    expect(m2.currencyValuations).toEqual([]);
    expect(() => assertValidWorld(m2)).not.toThrow();
    const m2Restored = deserializeWorld(serializeWorld(m2));
    expect(hashWorld(m2Restored)).toBe(hashWorld(m2));

    const m3 = build(baseScenario());
    expect(m3.countries).toEqual([]);
    expect(m3.currencies).toEqual([]);
    expect(m3.currencyValuations).toEqual([]);
    const m3Restored = deserializeWorld(serializeWorld(m3));
    expect(hashWorld(m3Restored)).toBe(hashWorld(m3));
  });

  test("rejects schema-6 and simulation-0.6.0 saves", () => {
    const serialized = serializeWorld(build(ownCurrencyScenario()));

    const oldSchema = JSON.parse(serialized) as { schemaVersion?: unknown };
    oldSchema.schemaVersion = 6;
    expect(() => deserializeWorld(JSON.stringify(oldSchema))).toThrow(/schema/i);

    const oldSim = JSON.parse(serialized) as { simVersion?: unknown };
    oldSim.simVersion = "0.6.0";
    expect(() => deserializeWorld(JSON.stringify(oldSim))).toThrow(/simulation version/i);
  });

  test("rejects a corrupt specified valuation at decode", () => {
    const serialized = serializeWorld(build(ownCurrencyScenario()));
    const parsed = JSON.parse(serialized) as {
      payload?: { currencyValuations?: { susdPerUnit?: unknown }[] };
    };
    const valuation = parsed.payload?.currencyValuations?.[0];
    if (valuation === undefined) throw new Error("missing valuation payload");
    valuation.susdPerUnit = 0;
    expect(() => deserializeWorld(JSON.stringify(parsed))).toThrow(/checksum/i);
  });

  test("assertValidWorld rejects an invalid in-memory valuation", () => {
    const world = build(ownCurrencyScenario());
    const valuation = world.currencyValuations[0];
    if (valuation === undefined || valuation.status !== "specified") {
      throw new Error("missing specified valuation");
    }
    (valuation as unknown as { susdPerUnit: number }).susdPerUnit = 0;
    expect(() => assertValidWorld(world)).toThrow(/positive|1e-12/i);
  });
});

function simulatedForeignScenario(): EconomyScenarioDef {
  const scenario = foreignAdoptionScenario();
  scenario.countries = [
    scenario.countries![0]!,
    {
      id: 1,
      tag: "T1",
      name: "Second Country",
      monetary: { kind: "own", currencyId: 1 },
      regionIds: [],
    },
  ];
  scenario.currencies = [
    scenario.currencies![0]!,
    {
      id: 1,
      key: "fgn",
      name: "Foreign Unit",
      issuer: { kind: "country", countryId: 1 },
    },
  ];
  return scenario;
}
