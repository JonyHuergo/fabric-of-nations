/**
 * M7a annual accounting and controlled corrections.
 *
 * The fixtures use the shipped eight-polity sample for a complete year and a
 * partial year; no campaign-scale or performance workload is executed.
 */

import {
  civilDateToDayIndex,
  createEconomyWorld,
  deserializeWorld,
  governmentPeriodTotals,
  hashWorld,
  postFinanceCorrection,
  runTicks,
  serializeWorld,
  tick,
  type EconomyScenarioDef,
  type TickContext,
  type World,
} from "@century/sim";
import { loadM5EightPolities } from "@century/data";
import { PROTOCOL_VERSION } from "@century/sim-worker";
import { buildSimulationSnapshot } from "@century/sim-worker/snapshot";
import { marketScenario } from "./fixtures/m3d.js";

const SEED = 20_261_023;

function contextFor(scenario: EconomyScenarioDef): TickContext {
  return {
    population: { definitions: scenario.population.definitions },
    economy: { definitions: scenario.definitions },
  };
}

function worldAt(startDayIndex: number): { readonly scenario: EconomyScenarioDef; readonly world: World } {
  const scenario = loadM5EightPolities();
  return {
    scenario,
    world: createEconomyWorld(scenario, { seed: SEED, startDayIndex }),
  };
}

function accountBalance(world: World, countryId: number, subtype: string): number {
  return (
    world.finance.accounts.find(
      (account) =>
        account.ownerKind === "country" &&
        account.ownerId === countryId &&
        account.subtype === subtype,
    )?.balanceSUSD ?? 0
  );
}

describe("M7a annual accounting", () => {
  test("a complete year reconciles annual flows to its twelve monthly closes", () => {
    const { scenario, world } = worldAt(0);
    runTicks(world, 365, contextFor(scenario));
    expect(world.dayIndex).toBe(civilDateToDayIndex(1901, 1, 1));
    expect(world.finance.annualSummaries).toHaveLength(1);
    const annual = world.finance.annualSummaries[0]!;
    expect(annual.year).toBe(1900);
    expect(annual.complete).toBe(true);
    expect(annual.periodStartDay).toBe(civilDateToDayIndex(1900, 1, 1));
    expect(annual.periodEndDay).toBe(civilDateToDayIndex(1900, 12, 31));
    const monthly = world.finance.periodSummaries.filter(
      (summary) => summary.periodEndDay >= annual.periodStartDay && summary.periodEndDay <= annual.periodEndDay,
    );
    expect(monthly).toHaveLength(12);
    for (const country of world.countries) {
      let tax = 0;
      let businessTax = 0;
      let welfare = 0;
      let interest = 0;
      let subsidy = 0;
      let administration = 0;
      let education = 0;
      for (const summary of monthly) {
        const totals = governmentPeriodTotals(world.finance, summary).find(
          (entry) => entry.countryId === country.id,
        );
        tax += totals?.incomeTaxRevenueSUSD ?? 0;
        businessTax += totals?.businessTaxRevenueSUSD ?? 0;
        welfare += totals?.welfareExpenseSUSD ?? 0;
        interest += totals?.interestExpenseSUSD ?? 0;
        subsidy += totals?.subsidyExpenseSUSD ?? 0;
        administration += totals?.administrationExpenseSUSD ?? 0;
        education += totals?.educationExpenseSUSD ?? 0;
      }
      const annualCountry = annual.fiscalTotals[country.id]!;
      expect(annualCountry.incomeTaxRevenueSUSD).toBeCloseTo(tax, 6);
      expect(annualCountry.welfareExpenseSUSD).toBeCloseTo(welfare, 6);
      expect(annualCountry.interestExpenseSUSD).toBeCloseTo(interest, 6);
      expect(annualCountry.educationExpenseSUSD ?? 0).toBeCloseTo(education, 6);
      expect(annualCountry.netFiscalResultSUSD).toBeCloseTo(
        tax + businessTax - welfare - interest - subsidy - administration - education,
        6,
      );
    }
    const country = world.countries[0]!;
    expect(annual.closingBalances[country.id]?.treasuryCashSUSD).toBeCloseTo(
      accountBalance(world, country.id, "treasury-cash"),
      6,
    );
    expect(world.finance.corrections).toHaveLength(0);
  });

  test("a leap year closes on 31 December after 366 daily transitions", () => {
    const scenario = marketScenario();
    const world = createEconomyWorld(scenario, {
      seed: SEED,
      startDayIndex: civilDateToDayIndex(1904, 1, 1),
    });
    runTicks(world, 366, contextFor(scenario));
    expect(world.dayIndex).toBe(civilDateToDayIndex(1905, 1, 1));
    expect(world.finance.annualSummaries).toHaveLength(1);
    const annual = world.finance.annualSummaries[0]!;
    expect(annual.year).toBe(1904);
    expect(annual.complete).toBe(true);
    expect(annual.periodStartDay).toBe(civilDateToDayIndex(1904, 1, 1));
    expect(annual.periodEndDay).toBe(civilDateToDayIndex(1904, 12, 31));
    expect(
      world.finance.periodSummaries.filter(
        (summary) =>
          summary.periodEndDay >= annual.periodStartDay &&
          summary.periodEndDay <= annual.periodEndDay,
      ),
    ).toHaveLength(12);
  });

  test("a partial first year and the terminal boundary are labelled without a 2000 year", () => {
    const partial = worldAt(civilDateToDayIndex(1900, 12, 1));
    runTicks(partial.world, 31, contextFor(partial.scenario));
    expect(partial.world.dayIndex).toBe(civilDateToDayIndex(1901, 1, 1));
    expect(partial.world.finance.annualSummaries).toHaveLength(1);
    expect(partial.world.finance.annualSummaries[0]?.complete).toBe(false);
    expect(partial.world.finance.annualSummaries[0]?.periodStartDay).toBe(
      civilDateToDayIndex(1900, 12, 1),
    );

    const terminal = worldAt(civilDateToDayIndex(1999, 12, 1));
    runTicks(terminal.world, 31, contextFor(terminal.scenario));
    expect(terminal.world.dayIndex).toBe(civilDateToDayIndex(2000, 1, 1));
    expect(terminal.world.finance.annualSummaries).toHaveLength(1);
    expect(terminal.world.finance.annualSummaries[0]?.year).toBe(1999);
    expect(terminal.world.finance.annualSummaries[0]?.complete).toBe(false);
    tick(terminal.world, contextFor(terminal.scenario));
    expect(terminal.world.finance.annualSummaries).toHaveLength(1);
  });

  test("annual summaries survive serialization and snapshot projection", () => {
    const { scenario, world } = worldAt(civilDateToDayIndex(1900, 12, 1));
    runTicks(world, 31, contextFor(scenario));
    const save = serializeWorld(world);
    const restored = deserializeWorld(save);
    expect(hashWorld(restored)).toBe(hashWorld(world));
    expect(restored.finance.annualSummaries).toEqual(world.finance.annualSummaries);
    const snapshot = buildSimulationSnapshot(
      world,
      scenario.definitions,
      { sequence: 1, running: false, speedDaysPerSecond: 1, achievedDaysPerSecond: 0 },
      scenario.population.definitions,
    );
    expect(snapshot.protocolVersion).toBe(PROTOCOL_VERSION);
    const report = snapshot.countries[0]?.annualReports[0];
    expect(report?.year).toBe(1900);
    expect(report?.complete).toBe(false);
    expect(report?.periodStartLabel).toBe("1900-12-01");
    expect(report?.periodEndLabel).toBe("1900-12-31");
  });

  test("annual history survives monthly-history compaction", () => {
    const scenario = marketScenario();
    const world = createEconomyWorld(scenario, { seed: SEED });
    runTicks(world, 396, contextFor(scenario));
    expect(world.finance.periodSummaries.length).toBe(13);
    expect(world.finance.periodSummaries[0]?.accountTotals).toEqual({});
    expect(world.finance.periodSummaries[0]?.countryFiscalTotals).toBeDefined();
    expect(world.finance.annualSummaries).toHaveLength(1);
    expect(world.finance.annualSummaries[0]?.year).toBe(1900);
    expect(world.finance.annualSummaries[0]?.complete).toBe(true);
  });

  test("save/load continues across a year boundary and annual summaries stay ordered", () => {
    const scenario = marketScenario();
    const world = createEconomyWorld(scenario, { seed: SEED });
    runTicks(world, 365, contextFor(scenario));
    expect(world.finance.annualSummaries.map((summary) => summary.year)).toEqual([1900]);
    const restored = deserializeWorld(serializeWorld(world));
    expect(restored.finance.annualSummaries).toEqual(world.finance.annualSummaries);
    runTicks(restored, 365, contextFor(scenario));
    expect(restored.finance.annualSummaries.map((summary) => summary.year)).toEqual([
      1900, 1901,
    ]);
    for (const summary of restored.finance.annualSummaries) {
      expect(summary.complete).toBe(true);
      expect(summary.periodEndDay).toBe(civilDateToDayIndex(summary.year, 12, 31));
    }
  });

  test("a controlled correction posts once, is audited, and never rewrites monthly history", () => {
    const { scenario, world } = worldAt(civilDateToDayIndex(1900, 12, 1));
    const country = world.countries[0]!;
    const block = world.popBlocks.find((entry) => entry.regionId === country.regionIds[0])!;
    const cash = world.finance.accounts.find(
      (account) => account.ownerKind === "popBlock" && account.ownerId === block.id && account.subtype === "household-cash",
    )!;
    const equity = world.finance.accounts.find(
      (account) => account.ownerKind === "popBlock" && account.ownerId === block.id && account.subtype === "owner-equity",
    )!;
    const beforeSummary = JSON.stringify(world.finance.periodSummaries);
    const beforeHash = hashWorld(world);
    const result = postFinanceCorrection(world, world.dayIndex, {
      originalPostingId: 1,
      reason: "test owner capital correction",
      lines: [
        { accountId: cash.id, side: "debit", amountSUSD: 10 },
        { accountId: equity.id, side: "credit", amountSUSD: 10 },
      ],
    });
    expect(result.postingId).toBeGreaterThan(0);
    expect(world.finance.corrections).toHaveLength(1);
    expect(world.finance.corrections[0]?.originalPostingId).toBe(1);
    expect(world.finance.corrections[0]?.reason).toBe("test owner capital correction");
    expect(world.finance.periodSummaries).toEqual(JSON.parse(beforeSummary));
    expect(hashWorld(world)).not.toBe(beforeHash);

    const beforeInvalidHash = hashWorld(world);
    expect(() =>
      postFinanceCorrection(world, world.dayIndex, {
        originalPostingId: 2,
        reason: "invalid unbalanced",
        lines: [{ accountId: cash.id, side: "debit", amountSUSD: 1 }],
      }),
    ).toThrow(/unbalanced/);
    expect(hashWorld(world)).toBe(beforeInvalidHash);
    expect(world.finance.corrections).toHaveLength(1);

    runTicks(world, 31, contextFor(scenario));
    expect(world.finance.annualSummaries[0]?.correctionCount).toBe(1);
  });
});
