/**
 * Batch 5 — verification for the relocated whole-world validation boundary.
 *
 * D-067 moves repeated whole-world validation out of individual market,
 * production, overflow, settlement, fiscal, migration, and debt calls when they
 * run inside the staged integrated day. The day/boundary validation remains:
 * `tick` validates the input world once and the complete staged world once before
 * publication, and every public phase entry point still validates by default.
 *
 * These tests pin the following:
 * - the deterministic state hash recorded before the optimization;
 * - two boundary validations per tick, independent of market count and the
 *   market-funding fallback path, plus one candidate validation per applied AI
 *   action;
 * - public phase entry points still reject an invalid world by default;
 * - phase-scoped checks (reservation shape) are still active in staged mode;
 * - multi-market ordering and exactly-once settlement;
 * - per-tick designated-cash conservation and finance validity on a multi-country
 *   scenario;
 * - deterministic continuation through a monthly close after save/load;
 * - debt-phase staged mode matches the default validated path.
 */

import {
  assertValidFinanceState,
  assertValidWorld,
  cloneWorld,
  createEconomyWorld,
  designatedCashTotal,
  deserializeWorld,
  hashWorld,
  issueGovernmentDebt,
  readValidationInstrumentation,
  resetValidationInstrumentation,
  runDebtPhase,
  runEconomicDay,
  runMigrationPhase,
  runProductionPhase,
  runTicks,
  serializeWorld,
  setValidationInstrumentationEnabled,
  settleMarketDays,
  tick,
  type EconomyScenarioDef,
  type TickContext,
} from "@century/sim";
import { loadM5EightPolities } from "@century/data";
import { GRAIN_ID, productionWorld, reservation } from "./fixtures/m3c.js";

const SEED = 20_261_023;

/**
 * Hash of the eight-polity sample after 22 ticks (seed 20261023), updated for
 * schema-22 M9 technology/literacy state. The Batch 5 validation optimization must not
 * change simulation behavior; only the serialized state shape changed.
 */
// E6a (schema 24) adds `World.trade` and `Market.customsCountryId` to the encoded
// state shape, so this earlier-run digest is intentionally re-pinned. The Batch 5
// validation optimization must not change simulation behavior.
const PRE_BATCH5_HASH_AFTER_22_TICKS = "c0e07a6893e6f23e";

function contextFor(scenario: EconomyScenarioDef): TickContext {
  return {
    population: { definitions: scenario.population.definitions },
    economy: { definitions: scenario.definitions },
  };
}

function eightPolities(): EconomyScenarioDef {
  return loadM5EightPolities();
}

function requireEconomy(result: ReturnType<typeof tick>) {
  const economy = result.economy;
  if (economy === undefined) throw new Error("expected an integrated economy result");
  return economy;
}

function cashConserved(before: number, after: number): boolean {
  const scale = Math.max(1, Math.abs(before), Math.abs(after));
  return Math.abs(after - before) <= 1e-12 * scale;
}

describe("Batch 5 validation boundary and determinism", () => {
  test("the pre-optimization state hash is unchanged after 22 ticks", () => {
    const scenario = eightPolities();
    const world = createEconomyWorld(scenario, { seed: SEED });
    runTicks(world, 22, contextFor(scenario));
    expect(world.dayIndex).toBe(22);
    expect(hashWorld(world)).toBe(PRE_BATCH5_HASH_AFTER_22_TICKS);
  });

  test("a tick performs exactly one entry and one publication validation", () => {
    const scenario = eightPolities();
    const world = createEconomyWorld(scenario, { seed: SEED });
    // Disable AI so the measurement isolates boundary validation; applied AI
    // actions legitimately add one candidate validation each (next test).
    world.countryAI.enabled = false;
    const context = contextFor(scenario);
    tick(world, context); // settle the opening day outside the measured window

    setValidationInstrumentationEnabled(true);
    try {
      resetValidationInstrumentation();
      let fallbackTicks = 0;
      for (let index = 0; index < 6; index += 1) {
        const result = tick(world, context);
        if (requireEconomy(result).fallbackUsed) fallbackTicks += 1;
      }
      const { worldValidations } = readValidationInstrumentation();
      // Five markets, repeated market attempts on funding fallback, settlement,
      // fiscal, migration, and debt all fit inside the two boundary checks.
      expect(world.markets.length).toBe(5);
      expect(fallbackTicks).toBeGreaterThan(0);
      expect(worldValidations).toBe(12);
    } finally {
      setValidationInstrumentationEnabled(false);
    }
  });

  test("only applied AI actions add a candidate validation", () => {
    const scenario = eightPolities();
    const world = createEconomyWorld(scenario, { seed: SEED });
    const context = contextFor(scenario);
    tick(world, context);

    setValidationInstrumentationEnabled(true);
    try {
      resetValidationInstrumentation();
      let appliedActions = 0;
      for (let index = 0; index < 20; index += 1) {
        appliedActions += requireEconomy(tick(world, context)).ai.appliedActionCount;
      }
      const { worldValidations } = readValidationInstrumentation();
      expect(appliedActions).toBeGreaterThan(0);
      expect(worldValidations).toBe(2 * 20 + appliedActions);
    } finally {
      setValidationInstrumentationEnabled(false);
    }
  });

  test("public phase entry points still validate the whole world by default", () => {
    const scenario = eightPolities();
    const world = createEconomyWorld(scenario, { seed: SEED });
    world.dayIndex = 5;
    const account = world.finance.accounts[0];
    if (account === undefined) throw new Error("fixture has no accounts");
    account.balanceSUSD = Number.NaN;

    expect(() => runMigrationPhase(world, scenario.definitions, 5)).toThrow(
      /balance/i,
    );
    // The staged-day caller may opt out only explicitly; the day boundary then
    // owns validation. This non-month-start day returns without mutation.
    expect(runMigrationPhase(world, scenario.definitions, 5, { validateWorld: false })).toMatchObject({
      ran: false,
      dayIndex: 5,
    });
  });

  test("phase-scoped reservation validation remains active in staged mode", () => {
    const { scenario, world } = productionWorld();
    expect(() =>
      runProductionPhase(
        world,
        scenario.definitions,
        [reservation(4, GRAIN_ID, 0, -1)],
        { validateWorld: false },
      ),
    ).toThrow(/quantity must be a finite positive number/);
    // The rejected reservation must not mutate authoritative inventory.
    expect(() => assertValidWorld(world)).not.toThrow();
  });

  test("markets are cleared in ascending id order and settled exactly once", () => {
    const scenario = eightPolities();
    const world = createEconomyWorld(scenario, { seed: SEED });
    const economy = requireEconomy(tick(world, contextFor(scenario)));
    const expectedMarketIds = [...world.markets]
      .map((market) => market.id)
      .sort((left, right) => left - right);
    expect(economy.markets.map((market) => market.marketId)).toEqual(expectedMarketIds);
    expect(new Set(expectedMarketIds).size).toBe(economy.markets.length);
    expect(economy.markets.every((market) => market.settled)).toBe(true);
    expect(economy.fallbackUsed).toBe(false);
    expect(() => settleMarketDays(world, scenario.definitions, economy.markets)).toThrow(
      /already been settled/,
    );
  });

  test("designated cash is conserved every tick and finance stays valid", () => {
    const scenario = eightPolities();
    const world = createEconomyWorld(scenario, { seed: SEED });
    const context = contextFor(scenario);
    let before = designatedCashTotal(world.finance);
    for (let index = 0; index < 5; index += 1) {
      tick(world, context);
      const after = designatedCashTotal(world.finance);
      expect(cashConserved(before, after)).toBe(true);
      before = after;
    }
    assertValidFinanceState(world.finance);
    assertValidWorld(world);
  });

  test("save/load continuation through a monthly close is deterministic", () => {
    const scenario = eightPolities();
    const context = contextFor(scenario);

    // Start two days before the January close so the window covers monthly close
    // (day 30), profit allocation, and the first February migration (day 31)
    // without replaying an entire month in the test suite.
    const uninterrupted = createEconomyWorld(scenario, { seed: SEED });
    uninterrupted.dayIndex = 28;
    runTicks(uninterrupted, 6, context);

    const saved = createEconomyWorld(scenario, { seed: SEED });
    saved.dayIndex = 28;
    runTicks(saved, 2, context);
    const restored = deserializeWorld(serializeWorld(saved));
    runTicks(restored, 4, context);

    expect(restored.dayIndex).toBe(34);
    expect(hashWorld(restored)).toBe(hashWorld(uninterrupted));
    expect(uninterrupted.finance.periodSummaries.length).toBeGreaterThan(0);
    expect(designatedCashTotal(restored.finance)).toBeCloseTo(
      designatedCashTotal(uninterrupted.finance),
      6,
    );
  });

  test("direct runEconomicDay validates a staged month-end close", () => {
    const scenario = eightPolities();
    const world = createEconomyWorld(scenario, { seed: SEED });
    world.dayIndex = 30; // civil month-end
    const result = runEconomicDay(
      world,
      scenario.population.definitions,
      scenario.definitions,
      30,
    );
    expect(result.economy.financeClose).not.toBeNull();
    expect(world.dayIndex).toBe(30);
    expect(world.finance.closedThroughDay).toBe(30);
    // The direct day result is intentionally pre-advance; published-state
    // validation continues to reject a world that was not advanced after close.
    expect(() => assertValidWorld(world)).toThrow(/advance the day/);
  });

  test("debt-phase staged mode matches the default validated path", () => {
    const scenario = eightPolities();
    const world = createEconomyWorld(scenario, { seed: SEED });
    // The shipped scenario enables debt only for the USA (country 0), with the
    // GBR treasury (country 1) as designated creditor.
    const issuer = world.countries.find((country) => country.debt.enabled);
    if (issuer === undefined) throw new Error("fixture has no debt-enabled country");
    issueGovernmentDebt(world, {
      issuerCountryId: issuer.id,
      holderKind: "country",
      holderId: issuer.debt.creditorId,
      principalSUSD: 100_000,
      annualCouponRate: 0.04,
      termDays: 365,
    });
    world.dayIndex = 30; // civil month-end: coupon interest is paid

    const validated = cloneWorld(world);
    const staged = cloneWorld(world);
    const validatedCash = designatedCashTotal(validated.finance);
    const stagedCash = designatedCashTotal(staged.finance);
    expect(stagedCash).toBe(validatedCash);

    const validatedResult = runDebtPhase(validated, 30);
    const stagedResult = runDebtPhase(staged, 30, { validateWorld: false });

    expect(validatedResult.interestAccruedSUSD).toBeGreaterThan(0);
    expect(validatedResult.interestPaidSUSD).toBeGreaterThan(0);
    expect(stagedResult).toEqual(validatedResult);
    expect(hashWorld(staged)).toBe(hashWorld(validated));
    expect(designatedCashTotal(staged.finance)).toBe(designatedCashTotal(validated.finance));
    expect(validated.finance.debtContracts.length).toBeGreaterThan(0);
    assertValidFinanceState(staged.finance);
    expect(() => assertValidWorld(staged)).not.toThrow();
  });
});
