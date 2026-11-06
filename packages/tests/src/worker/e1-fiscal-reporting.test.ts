/**
 * E1 fiscal-report completeness regression for AUDIT-004.
 *
 * The authoritative period totals include education, training, customs duty, and
 * military expense. The snapshot/report DTOs must carry the same categories so a
 * player can reconcile the displayed net result. The fixture uses a valid
 * compacted monthly history and a valid annual summary with every category
 * nonzero; zero-valued categories would not detect the omission.
 */

import {
  assertValidWorld,
  civilDateToDayIndex,
  createEconomyWorld,
  daysInMonth,
  type FinancePeriodFiscalTotals,
  type FinancePeriodSummary,
  type Month,
  type World,
} from "@century/sim";
import { loadM5EightPolities } from "@century/data";
import { buildSimulationSnapshot } from "@century/sim-worker/snapshot";

const SEED = 20_261_107;
const COUNTRY_ID = 0;

const TOTALS: FinancePeriodFiscalTotals = {
  incomeTaxRevenueRUSD: 1_000,
  businessTaxRevenueRUSD: 200,
  welfareExpenseRUSD: 300,
  interestExpenseRUSD: 50,
  subsidyExpenseRUSD: 70,
  administrationExpenseRUSD: 110,
  educationExpenseRUSD: 130,
  trainingExpenseRUSD: 170,
  customsDutyRevenueRUSD: 190,
  militaryExpenseRUSD: 230,
  netFiscalResultRUSD:
    1_000 + 200 + 190 - 300 - 50 - 70 - 110 - 130 - 170 - 230,
};

function zeroFlowTotals(): FinancePeriodSummary["flowTotalsByKind"] {
  return {
    "goods-purchase": 0,
    "input-purchase": 0,
    wages: 0,
    upkeep: 0,
  };
}

function monthlySummaries(): FinancePeriodSummary[] {
  const periods: FinancePeriodSummary[] = [];
  let previousEnd = -1;
  for (let index = 0; index < 12; index += 1) {
    const month = (index + 1) as Month;
    const end = civilDateToDayIndex(1900, month, daysInMonth(1900, month));
    periods.push({
      periodStartDay: previousEnd + 1,
      periodEndDay: end,
      accountTotals: {},
      flowTotalsByKind: zeroFlowTotals(),
      countryBudgetTotals: {},
      countryFiscalTotals: { [COUNTRY_ID]: { ...TOTALS } },
    });
    previousEnd = end;
  }
  return periods;
}

function worldWithReports(): World {
  const scenario = loadM5EightPolities();
  const world = createEconomyWorld(scenario, { seed: SEED });
  const periods = monthlySummaries();
  world.finance.periodSummaries = periods;
  world.finance.closedThroughDay = periods.at(-1)?.periodEndDay ?? null;
  world.finance.annualSummaries = [
    {
      year: 1900,
      periodStartDay: 0,
      periodEndDay: 364,
      complete: true,
      fiscalTotals: { [COUNTRY_ID]: { ...TOTALS } },
      budgetTotals: {},
      flowTotalsByKind: zeroFlowTotals(),
      closingBalances: {},
      correctionCount: 0,
    },
  ];
  world.dayIndex = 365;
  assertValidWorld(world);
  return world;
}

function snapshotFor(world: World) {
  const scenario = loadM5EightPolities();
  return buildSimulationSnapshot(
    world,
    scenario.definitions,
    { sequence: 1, running: false, speedDaysPerSecond: 1, achievedDaysPerSecond: 0 },
    scenario.population.definitions,
  );
}

describe("fiscal reporting completeness", () => {
  test("monthly and annual snapshots carry every authoritative category", () => {
    const world = worldWithReports();
    const snapshot = snapshotFor(world);
    const country = snapshot.countries.find((entry) => entry.id === COUNTRY_ID);
    if (country === undefined) throw new Error("missing country snapshot");

    const latest = country.latestFiscal;
    if (latest === null) throw new Error("missing latest fiscal totals");
    expect(latest.educationExpenseRUSD ?? 0).toBeCloseTo(130, 6);
    expect(latest.trainingExpenseRUSD ?? 0).toBeCloseTo(170, 6);
    expect(latest.customsDutyRevenueRUSD ?? 0).toBeCloseTo(190, 6);
    expect(latest.militaryExpenseRUSD ?? 0).toBeCloseTo(230, 6);
    const history = country.financeHistory[country.financeHistory.length - 1];
    if (history === undefined) throw new Error("missing finance history");
    expect(history.militaryExpenseRUSD ?? 0).toBeCloseTo(230, 6);
    expect(history.educationExpenseRUSD ?? 0).toBeCloseTo(130, 6);
    expect(history.trainingExpenseRUSD ?? 0).toBeCloseTo(170, 6);
    expect(history.customsDutyRevenueRUSD ?? 0).toBeCloseTo(190, 6);
    expect(history.netFiscalResultRUSD).toBeCloseTo(
      history.incomeTaxRUSD +
        history.businessTaxRevenueRUSD +
        (history.customsDutyRevenueRUSD ?? 0) -
        history.welfareExpenseRUSD -
        history.interestExpenseRUSD -
        history.subsidyExpenseRUSD -
        (history.administrationExpenseRUSD ?? 0) -
        (history.educationExpenseRUSD ?? 0) -
        (history.trainingExpenseRUSD ?? 0) -
        (history.militaryExpenseRUSD ?? 0),
      6,
    );

    const annual = country.annualReports[0];
    if (annual === undefined) throw new Error("missing annual report");
    expect(annual.educationExpenseRUSD ?? 0).toBeCloseTo(130, 6);
    expect(annual.trainingExpenseRUSD ?? 0).toBeCloseTo(170, 6);
    expect(annual.customsDutyRevenueRUSD ?? 0).toBeCloseTo(190, 6);
    expect(annual.militaryExpenseRUSD ?? 0).toBeCloseTo(230, 6);
  });
});
