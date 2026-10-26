import {
  CurrencyValuationError,
  asSusdPerCurrencyUnit,
  assertValidSusdPerCurrencyUnit,
  assertValidWorld,
  createEconomyWorld,
  crossRate,
  crossRateFor,
  currencyFromSusd,
  regionOwner,
  requireCurrencyRate,
  ratesApproximatelyEqual,
  susdFromCurrency,
  type EconomyScenarioDef,
  type MoneySUSD,
  type SusdPerCurrencyUnit,
} from "@century/sim";
import {
  baseScenario,
  country,
  foreignAdoptionScenario,
  foreignCurrency,
  issuedCurrency,
  ownCurrencyScenario,
  simulatedAdoptionScenario,
  specified,
  unavailable,
  unavailableValuationScenario,
} from "./fixtures/m4a2.js";

function build(scenario: EconomyScenarioDef) {
  return createEconomyWorld(scenario, { seed: 20_261_023 });
}

describe("M4a-2 country and currency identity", () => {
  test("creates an own-currency country with a specified valuation", () => {
    const world = build(ownCurrencyScenario());
    expect(world.countries).toHaveLength(1);
    expect(world.currencies).toHaveLength(1);
    expect(world.currencyValuations).toHaveLength(1);
    expect(world.countries[0]?.monetary).toEqual({ kind: "own", currencyId: 0 });
    expect(world.currencies[0]?.issuer).toEqual({ kind: "country", countryId: 0 });
    expect(world.currencyValuations[0]?.status).toBe("specified");
    expect(() => assertValidWorld(world)).not.toThrow();
  });

  test("adopted arrangement can select a foreign-issued currency", () => {
    const world = build(foreignAdoptionScenario());
    expect(world.countries[0]?.monetary).toEqual({ kind: "adopted", currencyId: 1 });
    expect(world.currencies[1]?.issuer).toEqual({
      kind: "foreign",
      issuerKey: "external-metropole",
    });
    expect(() => assertValidWorld(world)).not.toThrow();
  });

  test("a country may adopt a foreign currency without issuing its own", () => {
    const scenario = baseScenario();
    scenario.countries = [country(0, { kind: "adopted", currencyId: 0 }, [0])];
    scenario.currencies = [foreignCurrency(0, "fgn", "external-metropole")];
    scenario.currencyValuations = [specified(0, 2)];
    const world = build(scenario);
    expect(world.currencies).toHaveLength(1);
    expect(world.countries[0]?.monetary).toEqual({ kind: "adopted", currencyId: 0 });
    expect(() => assertValidWorld(world)).not.toThrow();
  });

  test("adopted arrangement can select another simulated country's currency", () => {
    const world = build(simulatedAdoptionScenario());
    expect(world.countries[0]?.monetary).toEqual({ kind: "adopted", currencyId: 1 });
    expect(world.countries[1]?.monetary).toEqual({ kind: "own", currencyId: 1 });
    expect(world.currencies[1]?.issuer).toEqual({ kind: "country", countryId: 1 });
    expect(() => assertValidWorld(world)).not.toThrow();
  });

  test("a country may issue one currency and adopt a different one", () => {
    const world = build(foreignAdoptionScenario());
    const issuedByCountry = world.currencies.find(
      (currency) => currency.issuer.kind === "country" && currency.issuer.countryId === 0,
    );
    expect(issuedByCountry?.id).toBe(0);
    expect(world.countries[0]?.monetary.currencyId).toBe(1);
    const adopted = world.currencies.find(
      (currency) => currency.id === world.countries[0]?.monetary.currencyId,
    );
    expect(adopted?.issuer.kind).toBe("foreign");
  });

  test("an issued but unused simulated currency is valid", () => {
    const world = build(foreignAdoptionScenario());
    const unused = world.currencies[0];
    expect(unused?.id).toBe(0);
    expect(
      world.countries.some((candidate) => candidate.monetary.currencyId === unused?.id),
    ).toBe(false);
    expect(() => assertValidWorld(world)).not.toThrow();
  });

  test("an own arrangement rejects a currency issued by another country", () => {
    const scenario = baseScenario();
    scenario.countries = [
      country(0, { kind: "own", currencyId: 1 }, [0]),
      country(1, { kind: "own", currencyId: 1 }, []),
    ];
    scenario.currencies = [issuedCurrency(0, "aaa", 0), issuedCurrency(1, "bbb", 1)];
    scenario.currencyValuations = [specified(0, 1), specified(1, 2)];
    expect(() => build(scenario)).toThrow(/own arrangement.*not issued by it/i);
  });

  test("an adopted arrangement rejects a currency the country issues", () => {
    const scenario = ownCurrencyScenario();
    scenario.countries![0]!.monetary = { kind: "adopted", currencyId: 0 };
    expect(() => build(scenario)).toThrow(/adopted arrangement for a currency it issues/i);
  });

  test("rejects shared-currency arrangements and union issuers", () => {
    const shared = ownCurrencyScenario();
    shared.countries![0]!.monetary = {
      kind: "shared",
      currencyId: 0,
      unionKey: "test-union",
    };
    expect(() => build(shared)).toThrow(/shared.*not implemented/i);

    const union = ownCurrencyScenario();
    union.currencies![0]!.issuer = { kind: "union", unionKey: "test-union" };
    expect(() => build(union)).toThrow(/union.*not implemented/i);
  });

  test("a country may issue at most one currency in M4a-2", () => {
    const scenario = ownCurrencyScenario();
    scenario.currencies = [issuedCurrency(0, "aaa", 0), issuedCurrency(1, "bbb", 0)];
    scenario.currencyValuations = [specified(0, 1), specified(1, 2)];
    expect(() => build(scenario)).toThrow(/more than one currency/i);
  });

  test("a foreign-issued currency must be adopted by at least one country", () => {
    const scenario = ownCurrencyScenario();
    scenario.currencies = [issuedCurrency(0, "aaa", 0), foreignCurrency(1, "bbb", "external")];
    scenario.currencyValuations = [specified(0, 1), specified(1, 2)];
    expect(() => build(scenario)).toThrow(/foreign-issued currency.*adopted/i);
  });

  test("rejects SUSD as a currency key regardless of casing", () => {
    for (const key of ["susd", "SUSD", "Susd"]) {
      const scenario = ownCurrencyScenario();
      scenario.currencies![0]!.key = key;
      expect(() => build(scenario)).toThrow(/reserved for the SUSD/i);
    }
  });

  test("rejects duplicate country ids and tags", () => {
    const duplicateId = ownCurrencyScenario();
    duplicateId.countries = [
      duplicateId.countries![0]!,
      { ...duplicateId.countries![0]!, treasuryAccountId: 9002 },
    ];
    expect(() => build(duplicateId)).toThrow(/duplicate country id/i);

    const duplicateTag = ownCurrencyScenario();
    duplicateTag.countries = [
      duplicateTag.countries![0]!,
      { ...duplicateTag.countries![0]!, id: 1, treasuryAccountId: 9002 },
    ];
    expect(() => build(duplicateTag)).toThrow(/duplicate country tag/i);
  });

  test("rejects duplicate currency ids and keys", () => {
    const duplicateId = ownCurrencyScenario();
    duplicateId.currencies = [
      issuedCurrency(0, "aaa", 0),
      issuedCurrency(0, "bbb", 0),
    ];
    duplicateId.currencyValuations = [specified(0, 1)];
    expect(() => build(duplicateId)).toThrow(/duplicate currency id/i);

    const duplicateKey = ownCurrencyScenario();
    duplicateKey.currencies = [
      issuedCurrency(0, "aaa", 0),
      issuedCurrency(1, "aaa", 0),
    ];
    duplicateKey.currencyValuations = [specified(0, 1), specified(1, 2)];
    expect(() => build(duplicateKey)).toThrow(/duplicate currency key/i);
  });

  test("rejects unknown currency references and unknown issuer countries", () => {
    const unknownCurrency = ownCurrencyScenario();
    unknownCurrency.countries![0]!.monetary = { kind: "own", currencyId: 99 };
    expect(() => build(unknownCurrency)).toThrow(/unknown currency/i);

    const unknownIssuer = ownCurrencyScenario();
    unknownIssuer.currencies![0]!.issuer = { kind: "country", countryId: 99 };
    expect(() => build(unknownIssuer)).toThrow(/unknown country/i);
  });

  test("rejects duplicate and missing valuation records", () => {
    const duplicate = ownCurrencyScenario();
    duplicate.currencyValuations = [specified(0, 0.25), specified(0, 2)];
    expect(() => build(duplicate)).toThrow(/duplicate valuation/i);

    const missing = ownCurrencyScenario();
    missing.currencyValuations = [];
    expect(() => build(missing)).toThrow(/missing a valuation/i);
  });

  test("supports an explicit unavailable valuation", () => {
    const world = build(unavailableValuationScenario());
    expect(world.currencyValuations[0]).toEqual({
      currencyId: 0,
      status: "unavailable",
    });
    expect(() => assertValidWorld(world)).not.toThrow();
    expect(() => requireCurrencyRate(world.currencyValuations, 0)).toThrow(
      CurrencyValuationError,
    );
    expect(() => crossRateFor(world.currencyValuations, 0, 0)).toThrow(/unavailable/i);
  });

  test("rejects unknown and duplicated region claims", () => {
    const unknown = ownCurrencyScenario();
    unknown.countries![0]!.regionIds = [99];
    expect(() => build(unknown)).toThrow(/unknown region/i);

    const duplicateWithinCountry = ownCurrencyScenario();
    duplicateWithinCountry.countries![0]!.regionIds = [0, 0];
    expect(() => build(duplicateWithinCountry)).toThrow(/lists region.*twice/i);

    const duplicateClaim = ownCurrencyScenario();
    duplicateClaim.countries = [
      country(0, { kind: "own", currencyId: 0 }, [0]),
      country(1, { kind: "adopted", currencyId: 1 }, [0]),
    ];
    duplicateClaim.currencies = [issuedCurrency(0, "aaa", 0), foreignCurrency(1, "bbb", "external")];
    duplicateClaim.currencyValuations = [specified(0, 1), specified(1, 2)];
    expect(() => build(duplicateClaim)).toThrow(/claimed by both/i);
  });

  test("regionOwner returns the owner, null for unassigned, and throws for unknown", () => {
    const assigned = build(ownCurrencyScenario());
    expect(regionOwner(assigned, 0)).toBe(0);

    const unassignedScenario = ownCurrencyScenario();
    unassignedScenario.countries![0]!.regionIds = [];
    const unassigned = build(unassignedScenario);
    expect(regionOwner(unassigned, 0)).toBeNull();

    expect(() => regionOwner(assigned, 99)).toThrow(/unknown region/i);
  });

  test("a world with no countries leaves regions unassigned", () => {
    const world = build(baseScenario());
    expect(world.countries).toEqual([]);
    expect(regionOwner(world, 0)).toBeNull();
    expect(() => assertValidWorld(world)).not.toThrow();
  });

  test("a world with countries may leave regions unassigned", () => {
    const scenario = ownCurrencyScenario();
    scenario.countries![0]!.regionIds = [];
    const world = build(scenario);
    expect(world.regions).toHaveLength(1);
    expect(() => assertValidWorld(world)).not.toThrow();
  });
});

describe("M4a-2 conversion semantics", () => {
  const A = asSusdPerCurrencyUnit(0.25);
  const B = asSusdPerCurrencyUnit(2);
  const C = asSusdPerCurrencyUnit(1.6);

  test("cross rates use SUSD per unit in the documented direction", () => {
    expect(crossRate(A, B)).toBeCloseTo(0.125, 12);
    expect(crossRate(B, A)).toBeCloseTo(8, 12);
    expect(crossRate(A, B) * crossRate(B, A)).toBeCloseTo(1, 12);
  });

  test("triangular cross rates are consistent", () => {
    expect(crossRate(A, C)).toBeCloseTo(0.15625, 12);
    expect(crossRate(A, B) * crossRate(B, C)).toBeCloseTo(crossRate(A, C), 12);
  });

  test("converts amounts in both directions with round trips", () => {
    const susd = susdFromCurrency(1000, A);
    expect(susd).toBeCloseTo(250, 12);
    const b = currencyFromSusd(susd, B);
    expect(b).toBeCloseTo(125, 12);
    expect(currencyFromSusd(susdFromCurrency(1000, A), A)).toBeCloseTo(1000, 12);
  });

  test("crossRateFor uses authoritative currency valuations", () => {
    const world = build(foreignAdoptionScenario());
    expect(crossRateFor(world.currencyValuations, 0, 1)).toBeCloseTo(0.125, 12);
    expect(crossRateFor(world.currencyValuations, 1, 0)).toBeCloseTo(8, 12);
  });

  test("rejects invalid amounts and rates", () => {
    for (const amount of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1]) {
      expect(() => susdFromCurrency(amount, A)).toThrow(/finite|non-negative/i);
    }
    for (const rate of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1e-13, 1e13]) {
      expect(() =>
        susdFromCurrency(1, rate as SusdPerCurrencyUnit),
      ).toThrow(/positive|finite|in 1e-12/i);
    }
  });

  test("rejects overflow and positive underflow", () => {
    expect(() => susdFromCurrency(1e308, asSusdPerCurrencyUnit(1e12))).toThrow(/overflow/i);
    expect(() => susdFromCurrency(1e-320, asSusdPerCurrencyUnit(1e-12))).toThrow(/underflow/i);
    expect(() => currencyFromSusd(1e-320, asSusdPerCurrencyUnit(1e12))).toThrow(/underflow/i);
  });

  test("a zero amount is allowed and yields zero", () => {
    expect(susdFromCurrency(0, A)).toBe(0);
    expect(currencyFromSusd(0, A)).toBe(0);
  });

  test("unavailable and missing valuations never default to parity", () => {
    const unavailableError = (() => {
      try {
        requireCurrencyRate([unavailable(0)], 0);
      } catch (error) {
        return error;
      }
      return null;
    })();
    expect(unavailableError).toBeInstanceOf(CurrencyValuationError);
    expect((unavailableError as CurrencyValuationError).reason).toBe("unavailable");

    const missingError = (() => {
      try {
        requireCurrencyRate([], 0);
      } catch (error) {
        return error;
      }
      return null;
    })();
    expect(missingError).toBeInstanceOf(CurrencyValuationError);
    expect((missingError as CurrencyValuationError).reason).toBe("missing");

    expect(() => crossRateFor([unavailable(0), specified(1, 2)], 0, 1)).toThrow(
      /unavailable/i,
    );
  });

  test("rate comparisons use dimensionless relative tolerance", () => {
    expect(ratesApproximatelyEqual(0.125, 0.125 * (1 + 1e-13))).toBe(true);
    expect(ratesApproximatelyEqual(0.125, 0.125 * (1 + 1e-9))).toBe(false);
  });

  test("SusdPerCurrencyUnit is not interchangeable with MoneySUSD", () => {
    const amount: MoneySUSD = 2;
    // @ts-expect-error a MoneySUSD amount must not be accepted as a currency valuation
    const rate: SusdPerCurrencyUnit = amount;
    expect(typeof rate).toBe("number");
  });

  test("rate construction rejects non-finite and out-of-bounds values", () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, 0, -1, 1e-13, 1e13]) {
      expect(() => asSusdPerCurrencyUnit(value)).toThrow();
      expect(() => assertValidSusdPerCurrencyUnit(value)).toThrow();
    }
    expect(asSusdPerCurrencyUnit(0.25)).toBe(0.25);
  });
});
