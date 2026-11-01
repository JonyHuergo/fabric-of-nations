/**
 * E1 economic clarity selectors and snapshot contract.
 *
 * These tests use the real eight-polity world and snapshot builder for the
 * contract/report checks, plus an isolated synthetic copy for the explanation
 * rules. No authoritative state is mutated by the selectors.
 */

import {
  createEconomyWorld,
  runTicks,
  type EconomyScenarioDef,
  type TickContext,
} from "@century/sim";
import { loadM5EightPolities } from "@century/data";
import {
  MAX_PLAYER_ACTION_HISTORY,
  PROTOCOL_VERSION,
  appendPlayerAction,
  buildEconomicExplanations,
  buildMonthlyReports,
  latestMonthlyReport,
  parseWorkerEvent,
  previewFiscalPolicy,
  recentPlayerActions,
  type PlayerActionRecord,
  type SimulationSnapshot,
} from "@century/sim-worker";
import { buildSimulationSnapshot } from "@century/sim-worker/snapshot";

const SEED = 20_261_023;

type DeepMutable<T> = T extends readonly (infer U)[]
  ? DeepMutable<U>[]
  : T extends object
    ? { -readonly [K in keyof T]: DeepMutable<T[K]> }
    : T;

function contextFor(scenario: EconomyScenarioDef): TickContext {
  return {
    population: { definitions: scenario.population.definitions },
    economy: { definitions: scenario.definitions },
  };
}

function snapshotAt(ticks: number): { readonly snapshot: SimulationSnapshot; readonly scenario: EconomyScenarioDef } {
  const scenario = loadM5EightPolities();
  const world = createEconomyWorld(scenario, { seed: SEED });
  if (ticks > 0) runTicks(world, ticks, contextFor(scenario));
  const snapshot = buildSimulationSnapshot(
    world,
    scenario.definitions,
    {
      sequence: 1,
      running: false,
      speedDaysPerSecond: 1,
      achievedDaysPerSecond: 0,
    },
    scenario.population.definitions,
  );
  return { snapshot, scenario };
}

function actionRecord(
  index: number,
  accepted: boolean,
): PlayerActionRecord {
  return {
    actionId: `action-${String(index)}`,
    kind: "set-fiscal-policy",
    countryId: 0,
    countryTag: "USA",
    dayIndex: 10 + index,
    dateLabel: "1900-01-11",
    requested: {
      kind: "set-fiscal-policy",
      incomeTaxRate: 0.1,
      incomeTaxAllowanceRUSDPerYear: 0,
      welfareBudgetRUSDPerYear: 1000,
      welfareMaxWealthLevel: 99,
      businessProfitTaxRate: 0,
      reserveTargetRUSD: 0,
    },
    accepted,
    applied: accepted
      ? {
          kind: "set-fiscal-policy",
          incomeTaxRate: 0.1,
          incomeTaxAllowanceRUSDPerYear: 0,
          welfareBudgetRUSDPerYear: 1000,
          welfareMaxWealthLevel: 99,
          businessProfitTaxRate: 0,
          reserveTargetRUSD: 0,
        }
      : null,
    errors: accepted ? [] : ["policy rejected by shared validator"],
  };
}

describe("E1 economic clarity", () => {
  test("the snapshot exposes supported production, wage, need, and capacity data", () => {
    const { snapshot } = snapshotAt(0);
    expect(snapshot.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(snapshot.needTiers.length).toBeGreaterThan(0);
    expect(snapshot.needTiers.some((tier) => tier.tier === "subsistence")).toBe(true);
    for (const country of snapshot.countries) {
      expect(country.productionCapacityByGood).toHaveLength(snapshot.goods.length);
      expect(country.estimatedDailyWageBaseRUSD).toBeGreaterThanOrEqual(0);
      expect(country.householdCashRUSD).toBeGreaterThanOrEqual(0);
      expect(country.debtInterestPayableRUSD).toBeGreaterThanOrEqual(0);
    }
    for (const market of snapshot.markets) {
      for (const price of market.prices) {
        expect(price.dailyProductionCapacity).toBeGreaterThanOrEqual(0);
      }
    }
    expect(() =>
      parseWorkerEvent({ protocolVersion: PROTOCOL_VERSION, type: "READY", snapshot }),
    ).not.toThrow();
    const missing = {
      ...snapshot,
      needTiers: undefined,
    } as unknown as SimulationSnapshot;
    expect(() =>
      parseWorkerEvent({ protocolVersion: PROTOCOL_VERSION, type: "READY", snapshot: missing }),
    ).toThrow(/valid snapshot/);
  });

  test("monthly reports separate closed-period flows from close balances", () => {
    const { snapshot } = snapshotAt(31);
    const country = snapshot.countries.find((entry) => entry.id === 0);
    expect(country).toBeDefined();
    if (country === undefined) return;
    expect(country.financeHistory.length).toBeGreaterThan(0);
    const reports = buildMonthlyReports(country);
    expect(reports.length).toBe(country.financeHistory.length);
    const latest = latestMonthlyReport(country);
    expect(latest).not.toBeNull();
    if (latest === null) return;
    const period = country.financeHistory[country.financeHistory.length - 1]!;
    expect(latest.periodEndLabel).toBe(period.periodEndLabel);
    expect(latest.incomeTaxRUSD).toBe(period.incomeTaxRUSD);
    expect(latest.welfareExpenseRUSD).toBe(period.welfareExpenseRUSD);
    expect(latest.interestExpenseRUSD).toBe(period.interestExpenseRUSD);
    // The most recent summary retains account detail, so close balances exist.
    expect(period.treasuryCashEndRUSD).not.toBeNull();
    expect(latest.treasuryCash?.endRUSD).toBe(period.treasuryCashEndRUSD);
    expect(latest.treasuryCash?.changeRUSD).toBeNull(); // no earlier detailed close
    expect(latest.detailedBalances).toBe(true);
  });

  test("fiscal preview is a current-base static calculation", () => {
    const { snapshot } = snapshotAt(0);
    const country = snapshot.countries.find((entry) => entry.id === 0);
    expect(country).toBeDefined();
    if (country === undefined) return;
    const preview = previewFiscalPolicy(snapshot, country, 0.2, 200_000);
    expect(preview.isPlayerCountry).toBe(true);
    expect(preview.proposedDailyIncomeTaxRUSD).toBeCloseTo(
      0.2 * preview.estimatedDailyWageBaseRUSD,
      8,
    );
    expect(preview.proposedDailyWelfareRUSD).toBeCloseTo(200_000 / 365, 8);
    expect(preview.monthlyIncomeTaxDeltaRUSD).toBeCloseTo(
      (0.2 - country.fiscal.incomeTaxRate) * preview.estimatedDailyWageBaseRUSD * 31,
      8,
    );
    expect(preview.constraints.length).toBeGreaterThan(0);
    expect(preview.constraints.join(" ")).toMatch(/not realized future wages/);
    // The preview operates on immutable snapshot data only.
    expect(snapshot.countries[0]?.fiscal.incomeTaxRate).toBe(country.fiscal.incomeTaxRate);
  });

  test("explanations use evidence, period caveats, and no fabricated attribution", () => {
    const { snapshot } = snapshotAt(0);
    const source = snapshot.countries.find((entry) => entry.id === 0);
    expect(source).toBeDefined();
    if (source === undefined) return;
    const synthetic = JSON.parse(JSON.stringify(snapshot)) as DeepMutable<SimulationSnapshot>;
    const country = synthetic.countries.find((entry) => entry.id === 0)!;
    country.blocksWithUnmetSubsistence = 2;
    country.blocksWithUnmetBasic = 3;
    country.hardshipPopulationShare = 0.2;
    country.householdCashRUSD = 1000;
    country.estimatedDailyWageBaseRUSD = 50;
    for (const entry of country.productionCapacityByGood) entry.dailyCapacity = 0;
    for (const market of synthetic.markets) {
      for (const price of market.prices) price.stockQuantity = 0;
    }
    const explanations = buildEconomicExplanations(synthetic, country);
    expect(explanations.length).toBeGreaterThan(0);
    const subsistence = explanations.find((entry) => entry.id === "subsistence-unmet");
    expect(subsistence).toBeDefined();
    expect(subsistence?.severity).toBe("critical");
    expect(subsistence?.evidence.join(" ")).toMatch(/zero current market stock/);
    expect(subsistence?.caveat).toMatch(/not proof of a single cause/);
    expect(explanations.every((entry) => entry.observation.length > 0)).toBe(true);
    expect(explanations.every((entry) => !/% caused by/.test(entry.observation))).toBe(true);
  });

  test("compacted summaries do not fabricate close balances", () => {
    const { snapshot } = snapshotAt(31);
    const source = snapshot.countries.find((entry) => entry.id === 0);
    expect(source).toBeDefined();
    if (source === undefined) return;
    const base = source.financeHistory[0];
    expect(base).toBeDefined();
    if (base === undefined) return;
    const synthetic = JSON.parse(JSON.stringify(snapshot)) as DeepMutable<SimulationSnapshot>;
    const country = synthetic.countries.find((entry) => entry.id === 0)!;
    country.financeHistory = [
      {
        ...base,
        periodEndDay: base.periodEndDay - 30,
        treasuryCashEndRUSD: null,
        debtOutstandingEndRUSD: null,
        householdCashEndRUSD: null,
      },
      {
        ...base,
        periodEndDay: base.periodEndDay,
        treasuryCashEndRUSD: 120,
        debtOutstandingEndRUSD: 40,
        householdCashEndRUSD: 900,
      },
    ];
    const reports = buildMonthlyReports(country);
    expect(reports[0]?.detailedBalances).toBe(true);
    expect(reports[0]?.treasuryCash?.endRUSD).toBe(120);
    // The preceding summary is compacted, so no change is invented.
    expect(reports[0]?.treasuryCash?.changeRUSD).toBeNull();
    expect(reports[1]?.detailedBalances).toBe(false);
    expect(reports[1]?.treasuryCash).toBeNull();
    expect(reports[1]?.debtOutstanding).toBeNull();
  });

  test("confirmed action history is bounded and a rejected action is never applied", () => {
    let history: readonly PlayerActionRecord[] = [];
    for (let index = 0; index < MAX_PLAYER_ACTION_HISTORY + 5; index += 1) {
      history = appendPlayerAction(history, actionRecord(index, true));
    }
    expect(history).toHaveLength(MAX_PLAYER_ACTION_HISTORY);
    expect(history[0]?.actionId).toBe("action-5");
    const recent = recentPlayerActions(history, 12);
    expect(recent).toHaveLength(12);
    expect(recent[0]?.actionId).toBe(`action-${String(MAX_PLAYER_ACTION_HISTORY + 4)}`);

    const rejected = actionRecord(999, false);
    history = appendPlayerAction(history, rejected);
    const last = history[history.length - 1];
    expect(last?.accepted).toBe(false);
    expect(last?.applied).toBeNull();
    expect(last?.errors).toEqual(["policy rejected by shared validator"]);
  });
});
