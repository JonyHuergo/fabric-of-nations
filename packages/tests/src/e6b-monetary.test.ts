/**
 * E6b — monetary foundations, exchange-rate valuation, and price measurement.
 *
 * Tests exercise the authoritative phases and the integrated day: the price index and
 * its definition, the currency board's reserve/issue/revaluation accounting, the managed
 * and pegged exchange-rate rules, convertibility and its real trade effect, and the
 * worker/snapshot contract. No benchmark is executed.
 */

import {
  applyCountryAction,
  assertValidWorld,
  authorityLiabilityRUSD,
  authorityReservesRUSD,
  convertibilityState,
  civilDateToDayIndex,
  createEconomyWorld,
  currencyFromRusd,
  daysInMonth,
  derivePriceIndexes,
  deserializeWorld,
  hashWorld,
  priceIndexCoverage,
  priceIndexInflation,
  requireCurrencyRate,
  runEconomicDay,
  runMonetaryPhase,
  runTradeDispatchPhase,
  serializeWorld,
  rusdFromCurrency,
  validateCountryAction,
  type EconomyScenarioDef,
  type Month,
  type World,
} from "@century/sim";
import {
  PROTOCOL_VERSION,
  parseWorkerCommand,
  type SimulationSnapshot,
  type WorkerEvent,
} from "@century/sim-worker";
import { SimulationHost } from "@century/sim-worker/host";
import { loadM5EightPolities } from "@century/data";

import {
  M5_CLOTHING,
  M5_COUNTRY_A,
  M5_COUNTRY_B,
  M5_COUNTRY_C,
  m5Scenario,
} from "./fixtures/m5.js";

const SEED = 20_261_105;

const SPECIFIED_A = {
  currencyId: 0,
  status: "specified" as const,
  rusdPerUnit: 0.5 as never,
  setOnDay: 0,
  source: "scenario" as const,
};

function monetaryScenario(
  options: {
    readonly reserves?: number;
    readonly units?: number;
    readonly externalCash?: number;
    readonly parity?: number;
    readonly active?: boolean;
  } = {},
): EconomyScenarioDef {
  const scenario = m5Scenario();
  scenario.currencyValuations = [
    SPECIFIED_A,
    { currencyId: 1, status: "unavailable" },
    { currencyId: 2, status: "unavailable" },
  ];
  if (options.active !== false) {
    scenario.monetary = {
      currencies: [
        {
          currencyId: 0,
          parityRusdPerUnit: options.parity ?? 0.5,
          reserveFundingRUSD: options.reserves ?? 2_000,
          currencyIssuedUnits: options.units ?? 1_000,
          externalCashRUSD: options.externalCash ?? 5_000,
        },
      ],
    };
  } else {
    scenario.monetary = {};
  }
  return scenario;
}

function buildMonetary(options: Parameters<typeof monetaryScenario>[0] = {}): {
  readonly scenario: EconomyScenarioDef;
  readonly world: World;
} {
  const scenario = monetaryScenario(options);
  return { scenario, world: createEconomyWorld(scenario, { seed: SEED }) };
}

function authority(world: World) {
  const record = world.monetary.currencies.find((entry) => entry.currencyId === 0);
  if (record === undefined || record.issuerCountryId === null) {
    throw new Error("fixture has no monetary authority");
  }
  return record;
}

function balance(world: World, ownerKind: string, ownerId: number | null, subtype: string): number {
  const account = world.finance.accounts.find(
    (candidate) =>
      candidate.ownerKind === ownerKind &&
      candidate.ownerId === ownerId &&
      candidate.subtype === subtype,
  );
  if (account === undefined) throw new Error(`missing ${ownerKind}:${ownerId} ${subtype}`);
  return account.balanceRUSD;
}

function designatedCash(world: World): number {
  return world.finance.accounts
    .filter((account) =>
      ["household-cash", "operating-cash", "system-reserve-cash", "treasury-cash", "monetary-reserve-cash", "external-cash"].includes(
        account.subtype,
      ),
    )
    .reduce((total, account) => total + account.balanceRUSD, 0);
}

function runDay(world: World, scenario: EconomyScenarioDef): void {
  runEconomicDay(world, scenario.population.definitions, scenario.definitions, world.dayIndex, {
    validateWorld: false,
  });
  world.dayIndex += 1;
  assertValidWorld(world);
}

function monetaryAction(overrides: Record<string, unknown> = {}) {
  return {
    kind: "set-monetary-policy" as const,
    countryId: M5_COUNTRY_A,
    dayIndex: 0,
    source: "player" as const,
    regime: "pegged" as const,
    parityRusdPerUnit: null as number | null,
    reserveTransferRUSD: 0,
    currencyConversionRUSD: 0,
    ...overrides,
  };
}

describe("E6b currency valuation and conversion", () => {
  test("valuation direction and conversion are unambiguous and reversible", () => {
    const rate = requireCurrencyRate(
      [{ currencyId: 0, status: "specified", rusdPerUnit: 0.5 as never, setOnDay: 0, source: "scenario" }],
      0,
    );
    expect(rusdFromCurrency(100, rate)).toBeCloseTo(50, 10);
    expect(currencyFromRusd(50, rate)).toBeCloseTo(100, 10);
    expect(currencyFromRusd(rusdFromCurrency(123.456, rate), rate)).toBeCloseTo(123.456, 10);
    // Missing and unavailable are named errors, never a silent parity.
    expect(() =>
      requireCurrencyRate([{ currencyId: 1, status: "unavailable" }], 1),
    ).toThrow(/unavailable/);
    expect(() => requireCurrencyRate([], 9)).toThrow(/missing/);
  });

  test("monetary scenario input is validated and no rate is invented", () => {
    // A managed regime cannot be pre-set by scenario data; it needs an enacted law.
    expect(() =>
      createEconomyWorld(
        {
          ...monetaryScenario(),
          monetary: {
            currencies: [{ currencyId: 0, regime: "managed" as never, parityRusdPerUnit: 0.5 }],
          },
        },
        { seed: SEED },
      ),
    ).toThrow(/managed regime requires an enacted currency law/);
    // Reserve funding cannot exceed the opening treasury.
    expect(() =>
      createEconomyWorld(
        {
          ...monetaryScenario(),
          monetary: {
            currencies: [{ currencyId: 0, reserveFundingRUSD: 10_000_000 }],
          },
        },
        { seed: SEED },
      ),
    ).toThrow(/exceeds the country's opening treasury/);
    // The external counterparty must be able to pay for the opening circulation.
    expect(() =>
      createEconomyWorld(
        {
          ...monetaryScenario(),
          monetary: {
            currencies: [
              { currencyId: 0, parityRusdPerUnit: 0.5, currencyIssuedUnits: 10_000, externalCashRUSD: 1 },
            ],
          },
        },
        { seed: SEED },
      ),
    ).toThrow(/cover the initial currency holding/);
    // A foreign or unknown currency has no authority.
    expect(() =>
      createEconomyWorld(
        { ...monetaryScenario(), monetary: { currencies: [{ currencyId: 99 }] } },
        { seed: SEED },
      ),
    ).toThrow(/unknown currency/);
  });

  test("an adopted currency has no independent authority", () => {
    const scenario = monetaryScenario();
    scenario.countries = (scenario.countries ?? []).map((country) =>
      country.id === M5_COUNTRY_C
        ? { ...country, monetary: { kind: "adopted" as const, currencyId: 0 } }
        : country,
    );
    scenario.monetary = { currencies: [{ currencyId: 0, parityRusdPerUnit: 0.5, reserveFundingRUSD: 100 }] };
    const world = createEconomyWorld(scenario, { seed: SEED });
    const validation = validateCountryAction(
      world,
      monetaryAction({ countryId: M5_COUNTRY_C, parityRusdPerUnit: 0.4, reserveTransferRUSD: 10 }),
      scenario.definitions,
    );
    expect(validation.valid).toBe(false);
    expect(validation.errors.join(" ")).toMatch(/adopted or shares|adopts or shares|no independent/);
  });
});

describe("E6b price index and inflation measurement", () => {
  test("the basket is derived from needs and the base period normalizes to 100", () => {
    const { world } = buildMonetary();
    expect(world.priceIndex.basket.length).toBeGreaterThan(0);
    expect(world.priceIndex.basePrices.length).toBe(world.markets.length);
    for (const market of world.markets) {
      const values = derivePriceIndexes(world);
      expect(values.markets.get(market.id)).toBeCloseTo(100, 9);
    }
    const values = derivePriceIndexes(world);
    expect(values.world).toBeCloseTo(100, 9);
    expect([...values.countries.values()].every((value) => Math.abs(value - 100) < 1e-9)).toBe(true);
    expect(priceIndexCoverage(world, 0)).toBe(1);
  });

  test("a price change moves the index by its basket weight and never touches accounts", () => {
    const { world } = buildMonetary();
    const cashBefore = designatedCash(world);
    const hashBefore = hashWorld(world);
    const basket = world.priceIndex.basket;
    const target = basket[0]!;
    const totalWeight = basket.reduce((total, item) => total + item.weight, 0);
    const market = world.markets[0]!;
    market.priceRUSD[target.goodId] = (market.priceRUSD[target.goodId] ?? 0) * 1.1;
    const values = derivePriceIndexes(world);
    const expected = 100 + (target.weight / totalWeight) * 10;
    expect(values.markets.get(market.id)).toBeCloseTo(expected, 6);
    expect(designatedCash(world)).toBe(cashBefore);
    expect(hashWorld(world)).not.toBe(hashBefore);
  });

  test("missing prices are excluded with reduced coverage, and new goods are excluded", () => {
    const { world } = buildMonetary();
    const basket = world.priceIndex.basket;
    const target = basket[0]!;
    const market = world.markets[0]!;
    market.priceRUSD[target.goodId] = 0;
    const coverage = priceIndexCoverage(world, market.id);
    const totalWeight = basket.reduce((total, item) => total + item.weight, 0);
    expect(coverage).toBeCloseTo((totalWeight - target.weight) / totalWeight, 9);
    const values = derivePriceIndexes(world);
    // Excluded from both sums, so the remaining goods still normalize near 100.
    expect(Number.isFinite(values.markets.get(market.id))).toBe(true);
  });

  test("month-end observations are bounded, idempotent, and drive MoM/YoY", () => {
    const { scenario, world } = buildMonetary();
    // Roll to a month-end without running the whole day: append via the phase.
    const endOfJanuary = 30;
    world.dayIndex = endOfJanuary;
    const first = runMonetaryPhase(world, scenario.definitions, endOfJanuary);
    expect(first.priceObservationCaptured).toBe(true);
    expect(world.priceIndex.observations).toHaveLength(1);
    const repeat = runMonetaryPhase(world, scenario.definitions, endOfJanuary);
    expect(repeat.priceObservationCaptured).toBe(false);
    expect(world.priceIndex.observations).toHaveLength(1);
    expect(priceIndexInflation(world, null, 1)).toBeNull();
    expect(priceIndexInflation(world, null, 12)).toBeNull();
    let year = 1900;
    let month = 1 as Month;
    for (let index = 0; index < 30; index += 1) {
      month = (month + 1) as Month;
      if (month > 12) {
        month = 1 as Month;
        year += 1;
      }
      const monthEnd = civilDateToDayIndex(year, month, daysInMonth(year, month));
      world.dayIndex = monthEnd;
      runMonetaryPhase(world, scenario.definitions, monthEnd);
    }
    expect(world.priceIndex.observations.length).toBe(24);
    expect(priceIndexInflation(world, null, 1)).not.toBeNull();
    assertValidWorld(world);
  });

  test("inflation measurement applies no behavioural effect", () => {
    const { scenario, world } = buildMonetary();
    const before = hashWorld(world);
    const values = derivePriceIndexes(world);
    expect(values.world).toBeCloseTo(100, 9);
    expect(hashWorld(world)).toBe(before);
    // No account or price is rescaled by the index.
    const market = world.markets[0]!;
    const prices = [...market.priceRUSD];
    runMonetaryPhase(world, scenario.definitions, 30);
    expect(market.priceRUSD).toEqual(prices);
  });
});

describe("E6b monetary authority accounting", () => {
  test("the opening currency board balances reserves, equity, and liability", () => {
    const { world } = buildMonetary({ reserves: 2_000, units: 1_000, parity: 0.5, externalCash: 5_000 });
    const record = authority(world);
    expect(record.active).toBe(true);
    expect(record.currencyIssuedUnits).toBeCloseTo(1_000, 9);
    expect(authorityReservesRUSD(world, record)).toBeCloseTo(2_500, 9);
    expect(authorityLiabilityRUSD(world, record)).toBeCloseTo(500, 9);
    expect(balance(world, "country", M5_COUNTRY_A, "monetary-equity")).toBeCloseTo(2_000, 9);
    expect(balance(world, "country", M5_COUNTRY_A, "treasury-cash")).toBeCloseTo(8_000, 9);
    expect(balance(world, "system", null, "external-cash")).toBeCloseTo(4_500, 9);
    expect(balance(world, "system", null, "external-currency-holding")).toBeCloseTo(500, 9);
    expect(balance(world, "system", null, "external-equity")).toBeCloseTo(5_000, 9);
    assertValidWorld(world);
  });

  test("a devaluation revalues the liability with no cash or goods change", () => {
    const { scenario, world } = buildMonetary({ reserves: 2_000, units: 1_000, parity: 0.5 });
    const record = authority(world);
    const cashBefore = designatedCash(world);
    const goodsBefore = world.markets.reduce(
      (total, market) => total + market.stockLots.reduce((sum, lot) => sum + lot.quantity, 0),
      0,
    );
    const result = applyCountryAction(
      world,
      monetaryAction({ parityRusdPerUnit: 0.4, reserveTransferRUSD: 0 }),
      scenario.definitions,
    );
    expect(result.monetaryAction?.parityRusdPerUnit).toBeCloseTo(0.4, 9);
    expect(authorityLiabilityRUSD(world, record)).toBeCloseTo(400, 6);
    expect(balance(world, "system", null, "external-currency-holding")).toBeCloseTo(400, 6);
    expect(designatedCash(world)).toBeCloseTo(cashBefore, 6);
    expect(
      world.markets.reduce(
        (total, market) => total + market.stockLots.reduce((sum, lot) => sum + lot.quantity, 0),
        0,
      ),
    ).toBeCloseTo(goodsBefore, 6);
    // The revaluation is explicit, not a cash settlement.
    const revaluations = world.finance.postings.filter(
      (posting) => posting.transactionKind === "fx-revaluation",
    );
    expect(revaluations.length).toBe(1);
    assertValidWorld(world);
  });

  test("currency issue and redemption exchange reserves for currency units", () => {
    const { scenario, world } = buildMonetary({ reserves: 2_000, units: 1_000, parity: 0.5, externalCash: 5_000 });
    const record = authority(world);
    const cashBefore = designatedCash(world);
    applyCountryAction(
      world,
      monetaryAction({ currencyConversionRUSD: 250 }),
      scenario.definitions,
    );
    expect(record.currencyIssuedUnits).toBeCloseTo(1_500, 6);
    expect(authorityLiabilityRUSD(world, record)).toBeCloseTo(750, 6);
    expect(authorityReservesRUSD(world, record)).toBeCloseTo(2_750, 6);
    expect(designatedCash(world)).toBeCloseTo(cashBefore, 6);
    applyCountryAction(
      world,
      monetaryAction({ currencyConversionRUSD: -100 }),
      scenario.definitions,
    );
    expect(record.currencyIssuedUnits).toBeCloseTo(1_300, 6);
    expect(authorityReservesRUSD(world, record)).toBeCloseTo(2_650, 6);
    const issuance = world.finance.postings.filter(
      (posting) => posting.transactionKind === "fx-issuance",
    );
    const redemption = world.finance.postings.filter(
      (posting) => posting.transactionKind === "fx-redemption",
    );
    expect(issuance).toHaveLength(1);
    expect(redemption).toHaveLength(1);
    assertValidWorld(world);
  });

  test("reserve capitalization and withdrawal move treasury cash only", () => {
    const { scenario, world } = buildMonetary({ reserves: 2_000, units: 1_000, parity: 0.5 });
    const record = authority(world);
    const cashBefore = designatedCash(world);
    applyCountryAction(
      world,
      monetaryAction({ reserveTransferRUSD: 500 }),
      scenario.definitions,
    );
    expect(authorityReservesRUSD(world, record)).toBeCloseTo(3_000, 6);
    expect(balance(world, "country", M5_COUNTRY_A, "treasury-cash")).toBeCloseTo(7_500, 6);
    applyCountryAction(
      world,
      monetaryAction({ reserveTransferRUSD: -500 }),
      scenario.definitions,
    );
    expect(authorityReservesRUSD(world, record)).toBeCloseTo(2_500, 6);
    expect(designatedCash(world)).toBeCloseTo(cashBefore, 6);
    expect(() =>
      applyCountryAction(
        world,
        monetaryAction({ reserveTransferRUSD: -1_000_000 }),
        scenario.definitions,
      ),
    ).toThrow(/reserves/);
    assertValidWorld(world);
  });

  test("an inactive authority is established by declaring a parity and funding reserves", () => {
    const { scenario, world } = buildMonetary({ active: false });
    const record = authority(world);
    expect(world.monetary.enabled).toBe(true);
    expect(record.active).toBe(false);
    expect(world.currencyValuations.find((value) => value.currencyId === 0)?.status).toBe("specified");
    const result = applyCountryAction(
      world,
      monetaryAction({ parityRusdPerUnit: 0.25, reserveTransferRUSD: 1_000 }),
      scenario.definitions,
    );
    expect(result.monetaryAction?.parityRusdPerUnit).toBeCloseTo(0.25, 9);
    expect(record.active).toBe(true);
    expect(authorityReservesRUSD(world, record)).toBeCloseTo(1_000, 6);
    expect(record.currencyIssuedUnits).toBe(0);
    assertValidWorld(world);
  });

  test("parity changes respect bounds, cooldown, and the AI boundary", () => {
    const { scenario, world } = buildMonetary();
    // More than the per-action limit.
    expect(() =>
      applyCountryAction(
        world,
        monetaryAction({ parityRusdPerUnit: 1.5 }),
        scenario.definitions,
      ),
    ).toThrow(/moves more than/);
    // AI source is not implemented.
    const ai = validateCountryAction(
      world,
      monetaryAction({ parityRusdPerUnit: 0.45, source: "ai" }),
      scenario.definitions,
    );
    expect(ai.valid).toBe(false);
    expect(ai.errors.join(" ")).toMatch(/AI monetary policy/);
    // Valid change, then a second one inside the cooldown window is rejected.
    applyCountryAction(world, monetaryAction({ parityRusdPerUnit: 0.45 }), scenario.definitions);
    world.dayIndex = 10;
    expect(() =>
      applyCountryAction(
        world,
        monetaryAction({ parityRusdPerUnit: 0.42, dayIndex: 10 }),
        scenario.definitions,
      ),
    ).toThrow(/days since the last one/);
  });

  test("the managed regime requires the currency law and follows the bounded rule", () => {
    // Policy validation without the law.
    const { scenario, world } = buildMonetary();
    expect(() =>
      applyCountryAction(world, monetaryAction({ regime: "managed" }), scenario.definitions),
    ).toThrow(/requires an enacted currency law/);

    // Full sample: activate the USA currency, enact the managed-currency law.
    const sample = loadM5EightPolities();
    const managedLaw = sample.definitions.politics?.laws.find(
      (law) => law.slot === "currency" && law.currencyRegime === "managed",
    );
    expect(managedLaw).toBeDefined();
    sample.currencyValuations = (sample.currencyValuations ?? []).map((valuation) =>
      valuation.currencyId === 0
        ? { currencyId: 0, status: "specified" as const, rusdPerUnit: 0.2 as never, setOnDay: 0, source: "scenario" as const }
        : valuation,
    );
    sample.countries = (sample.countries ?? []).map((country) =>
      country.id === 0
        ? { ...country, politics: { ...(country.politics ?? { regimeKind: "republic", laws: {} }), laws: { ...(country.politics?.laws ?? {}), currency: managedLaw!.key } } }
        : country,
    );
    sample.monetary = {
      currencies: [
        {
          currencyId: 0,
          parityRusdPerUnit: 0.2,
          reserveFundingRUSD: 50_000,
          currencyIssuedUnits: 100_000,
          externalCashRUSD: 40_000,
        },
      ],
    };
    const managedWorld = createEconomyWorld(sample, { seed: SEED });
    const record = managedWorld.monetary.currencies.find((entry) => entry.currencyId === 0)!;
    expect(record.regime).toBe("pegged");
    const applied = applyCountryAction(
      managedWorld,
      {
        kind: "set-monetary-policy",
        countryId: 0,
        dayIndex: managedWorld.dayIndex,
        source: "player",
        regime: "managed",
        parityRusdPerUnit: null,
        reserveTransferRUSD: 0,
        currencyConversionRUSD: 0,
      },
      sample.definitions,
    );
    expect(applied.monetaryAction?.regime).toBe("managed");
    // Realized deficit pressure depreciates the managed valuation by the bounded step.
    record.lastMonthExportsRUSD = 0;
    record.lastMonthImportsRUSD = 100_000;
    const before = requireCurrencyRate(managedWorld.currencyValuations, 0);
    runMonetaryPhase(managedWorld, sample.definitions, managedWorld.dayIndex);
    const after = requireCurrencyRate(managedWorld.currencyValuations, 0);
    expect(after).toBeLessThan(before);
    expect(after).toBeGreaterThanOrEqual((record.referenceParityRusdPerUnit ?? 0.2) * 0.5 - 1e-12);
    assertValidWorld(managedWorld);
  });
});

describe("E6b convertibility and E6a integration", () => {
  test("suspended convertibility blocks imports and restored cover allows them", () => {
    const scenario = m5Scenario();
    // Two markets: clothing cheap in market 0, expensive in market 1 (country B).
    scenario.definitions = {
      ...scenario.definitions,
      goods: scenario.definitions.goods.map((good) =>
        good.id === M5_CLOTHING ? { ...good, transportCostPerUnit: 0.05 } : good,
      ),
    };
    scenario.markets = scenario.markets.map((market) =>
      market.id === 0
        ? {
            ...market,
            priceRUSD: market.priceRUSD.map((price, goodId) => (goodId === M5_CLOTHING ? 1 : price)),
            stockLots: [{ goodId: M5_CLOTHING, ownerBuildingId: 8, quantity: 1_000 }],
          }
        : {
            ...market,
            priceRUSD: market.priceRUSD.map((price, goodId) => (goodId === M5_CLOTHING ? 1.5 : price)),
          },
    );
    scenario.tradeRoutes = [{ marketAId: 0, marketBId: 1, distanceUnits: 1, baseCapacityRUSDPerDay: 1e9 }];
    scenario.currencyValuations = [
      { currencyId: 0, status: "unavailable" },
      { currencyId: 1, status: "specified", rusdPerUnit: 0.5 as never, setOnDay: 0, source: "scenario" },
      { currencyId: 2, status: "unavailable" },
    ];
    // Country B (market 1's customs administration) holds almost no reserves.
    scenario.monetary = {
      currencies: [
        {
          currencyId: 1,
          parityRusdPerUnit: 0.5,
          reserveFundingRUSD: 100,
          currencyIssuedUnits: 0,
          externalCashRUSD: 0,
        },
      ],
    };
    const world = createEconomyWorld(scenario, { seed: SEED });
    const record = world.monetary.currencies.find((entry) => entry.currencyId === 1)!;
    // A completed month with 1,000 RUSD of imports needs 500 RUSD of cover.
    record.lastMonthImportsRUSD = 1_000;
    record.lastMonthExportsRUSD = 0;
    expect(convertibilityState(world, M5_COUNTRY_B).state).toBe("suspended");
    const blocked = runTradeDispatchPhase(world, scenario.definitions, world.dayIndex);
    expect(blocked.shipments).toHaveLength(0);
    expect(blocked.blocked.some((entry) => entry.reason === "fx-convertibility")).toBe(true);
    expect(world.trade.shipments).toHaveLength(0);

    // Fund reserves from the treasury; convertibility resumes and trade flows.
    applyCountryAction(
      world,
      {
        kind: "set-monetary-policy",
        countryId: M5_COUNTRY_B,
        dayIndex: world.dayIndex,
        source: "player",
        regime: "pegged",
        parityRusdPerUnit: 0.5,
        reserveTransferRUSD: 900,
        currencyConversionRUSD: 0,
      },
      scenario.definitions,
    );
    expect(convertibilityState(world, M5_COUNTRY_B).state).toBe("open");
    world.dayIndex += 1;
    const allowed = runTradeDispatchPhase(world, scenario.definitions, world.dayIndex);
    expect(allowed.shipments.length).toBeGreaterThan(0);
    assertValidWorld(world);
  });

  test("monetary operations never create or destroy goods", () => {
    const { scenario, world } = buildMonetary({ reserves: 2_000, units: 1_000, parity: 0.5 });
    const goodsBefore = world.markets.reduce(
      (total, market) => total + market.stockLots.reduce((sum, lot) => sum + lot.quantity, 0),
      0,
    );
    applyCountryAction(world, monetaryAction({ parityRusdPerUnit: 0.45 }), scenario.definitions);
    applyCountryAction(world, monetaryAction({ currencyConversionRUSD: 100 }), scenario.definitions);
    expect(
      world.markets.reduce(
        (total, market) => total + market.stockLots.reduce((sum, lot) => sum + lot.quantity, 0),
        0,
      ),
    ).toBeCloseTo(goodsBefore, 6);
    assertValidWorld(world);
  });
});

describe("E6b determinism, persistence, and worker contract", () => {
  test("two identical monetary runs produce the same world hash", () => {
    const first = buildMonetary();
    const second = buildMonetary();
    applyCountryAction(first.world, monetaryAction({ parityRusdPerUnit: 0.45 }), first.scenario.definitions);
    applyCountryAction(second.world, monetaryAction({ parityRusdPerUnit: 0.45 }), second.scenario.definitions);
    for (let day = 0; day < 8; day += 1) {
      runDay(first.world, first.scenario);
      runDay(second.world, second.scenario);
    }
    expect(hashWorld(first.world)).toBe(hashWorld(second.world));
  });

  test("saves round-trip monetary and index state and reject the previous schema", () => {
    const { scenario, world } = buildMonetary();
    runDay(world, scenario);
    const save = serializeWorld(world);
    const restored = deserializeWorld(save);
    expect(hashWorld(restored)).toBe(hashWorld(world));
    expect(serializeWorld(restored)).toBe(save);
    expect(restored.monetary.currencies).toHaveLength(world.monetary.currencies.length);
    expect(restored.priceIndex.basket).toEqual(world.priceIndex.basket);
    const parsed = JSON.parse(save) as { schemaVersion: number; payload: { schemaVersion: number } };
    parsed.schemaVersion = 24;
    parsed.payload.schemaVersion = 24;
    expect(() => deserializeWorld(JSON.stringify(parsed))).toThrow();
  });

  test("the worker exposes monetary/price state and validates the action", () => {
    let snapshot: SimulationSnapshot | null = null;
    let actionResult: Extract<WorkerEvent, { type: "ACTION_RESULT" }> | null = null;
    const host = new SimulationHost({
      scenario: loadM5EightPolities(),
      seed: SEED,
      emit: (event: WorkerEvent) => {
        if (event.type === "READY" || event.type === "SNAPSHOT") snapshot = event.snapshot;
        if (event.type === "ACTION_RESULT") {
          snapshot = event.snapshot;
          actionResult = event;
        }
      },
      autoPump: false,
      clock: () => 1_000,
    });
    expect(snapshot).not.toBeNull();
    expect(snapshot!.priceIndex.basket.length).toBeGreaterThan(0);
    expect(snapshot!.priceIndex.baseDayIndex).toBe(0);
    expect(snapshot!.currencies).toHaveLength(8);
    const player = snapshot!.countries.find((country) => country.id === snapshot!.playerCountryId)!;
    expect(player.monetary.hasAuthority).toBe(true);
    expect(player.monetary.active).toBe(false);
    expect(player.monetary.blockedReason).toBe("no-declared-parity");
    expect(player.priceIndex.value).toBeCloseTo(100, 6);

    host.handleCommand({
      protocolVersion: PROTOCOL_VERSION,
      type: "APPLY_ACTION",
      commandId: "monetary-set",
      actionId: "ui-monetary-1",
      action: {
        kind: "set-monetary-policy",
        countryId: player.id,
        regime: "pegged",
        parityRusdPerUnit: 0.25,
        reserveTransferRUSD: 10_000,
        currencyConversionRUSD: 0,
      },
    });
    expect(actionResult).not.toBeNull();
    expect(actionResult!.accepted).toBe(true);
    const after = actionResult!.snapshot.countries.find((country) => country.id === player.id)!;
    expect(after.monetary.active).toBe(true);
    expect(after.monetary.parityRusdPerUnit).toBeCloseTo(0.25, 9);
    expect(after.monetary.valuationRusdPerUnit).toBeCloseTo(0.25, 9);
  });

  test("malformed monetary commands are rejected at the protocol boundary", () => {
    const base = {
      protocolVersion: PROTOCOL_VERSION,
      type: "APPLY_ACTION",
      commandId: "monetary-malformed",
      actionId: "ui-monetary-2",
      action: {
        kind: "set-monetary-policy",
        countryId: 0,
        regime: "pegged",
        parityRusdPerUnit: 0.25,
        reserveTransferRUSD: 100,
        currencyConversionRUSD: 0,
      },
    };
    expect(() => parseWorkerCommand(base)).not.toThrow();
    expect(() =>
      parseWorkerCommand({ ...base, action: { ...base.action, regime: "float" } }),
    ).toThrow();
    expect(() =>
      parseWorkerCommand({ ...base, action: { ...base.action, parityRusdPerUnit: -1 } }),
    ).toThrow();
    expect(() =>
      parseWorkerCommand({ ...base, action: { ...base.action, reserveTransferRUSD: "10" } }),
    ).toThrow();
  });
});
