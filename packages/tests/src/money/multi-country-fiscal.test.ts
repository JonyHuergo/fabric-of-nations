import {
  FLOW_TRANSACTION_KINDS,
  assertAccountingIdentity,
  assertValidWorld,
  createEconomyWorld,
  governmentPeriodTotals,
  runTicks,
  type TickContext,
  countryProvinceIds,
} from "@century/sim";
import {
  M5_COUNTRY_A,
  M5_COUNTRY_B,
  M5_COUNTRY_C,
  M5_REGION_A1,
  m5Scenario,
} from "../fixtures/m5.js";

function context(scenario: ReturnType<typeof m5Scenario>): TickContext {
  return {
    population: { definitions: scenario.population.definitions },
    economy: { definitions: scenario.definitions },
  };
}

describe("M5 multi-country finance and fiscal integrity", () => {
  test("reconciles each country's treasury with its own residents' income tax", () => {
    const scenario = m5Scenario({
      fiscal: { [M5_COUNTRY_B]: { incomeTaxRate: 0, welfareBudgetRUSDPerYear: 0 } },
    });
    const world = createEconomyWorld(scenario, { seed: 20_261_023 });
    runTicks(world, 10, context(scenario));
    const provinceOwners = new Map<number, number>();
    for (const country of world.countries) {
      for (const provinceId of countryProvinceIds(world, country.id)) provinceOwners.set(provinceId, country.id);
    }
    for (const country of world.countries) {
      const treasury = world.finance.accounts.find(
        (account) =>
          account.ownerKind === "country" &&
          account.ownerId === country.id &&
          account.subtype === "treasury-cash",
      );
      const taxRevenue = world.finance.accounts.find(
        (account) =>
          account.ownerKind === "country" &&
          account.ownerId === country.id &&
          account.subtype === "income-tax-revenue",
      );
      expect(treasury).toBeDefined();
      expect(taxRevenue).toBeDefined();
      if (treasury === undefined || taxRevenue === undefined) continue;
      const residentTax = world.popBlocks
        .filter((block) => provinceOwners.get(block.provinceId) === country.id)
        .reduce((total, block) => {
          const expense = world.finance.accounts.find(
            (account) =>
              account.ownerKind === "popBlock" &&
              account.ownerId === block.id &&
              account.subtype === "income-tax-expense",
          );
          return total + (expense?.balanceRUSD ?? 0);
        }, 0);
      expect(taxRevenue.balanceRUSD).toBeCloseTo(residentTax, 6);
      expect(treasury.balanceRUSD).toBeGreaterThanOrEqual(0);
      if (country.id === M5_COUNTRY_B) {
        expect(taxRevenue.balanceRUSD).toBe(0);
        expect(treasury.balanceRUSD).toBeCloseTo(10_000, 6);
      }
    }
    assertValidWorld(world);
  });

  test("closes the month once with the four flow kinds and a reconciled identity", () => {
    const scenario = m5Scenario();
    const world = createEconomyWorld(scenario, { seed: 20_261_023 });
    runTicks(world, 31, context(scenario));
    expect(world.dayIndex).toBe(31);
    expect(world.finance.closedThroughDay).toBe(30);
    expect(world.finance.periodSummaries).toHaveLength(1);
    const summary = world.finance.periodSummaries[0];
    expect(summary).toBeDefined();
    if (summary === undefined) return;
    expect(summary.periodStartDay).toBe(0);
    expect(summary.periodEndDay).toBe(30);
    expect(Object.keys(summary.flowTotalsByKind).sort()).toEqual(
      [...FLOW_TRANSACTION_KINDS].sort(),
    );
    for (const kind of FLOW_TRANSACTION_KINDS) {
      expect(summary.flowTotalsByKind[kind]).toBeGreaterThanOrEqual(0);
    }
    const totals = governmentPeriodTotals(world.finance, summary);
    expect(totals).toHaveLength(world.countries.length);
    for (const country of totals) {
      expect(country.incomeTaxRevenueRUSD).toBeGreaterThanOrEqual(0);
      expect(country.welfareExpenseRUSD).toBeGreaterThanOrEqual(0);
    }
    assertAccountingIdentity(world.finance);
    assertValidWorld(world);
  });

  test("repeated full-world simulation remains deterministic across countries", () => {
    const scenario = m5Scenario();
    const first = createEconomyWorld(scenario, { seed: 99 });
    const second = createEconomyWorld(scenario, { seed: 99 });
    runTicks(first, 20, context(scenario));
    runTicks(second, 20, context(scenario));
    expect(JSON.stringify(first.finance.periodSummaries)).toBe(
      JSON.stringify(second.finance.periodSummaries),
    );
    expect(first.finance.accounts.map((account) => account.balanceRUSD)).toEqual(
      second.finance.accounts.map((account) => account.balanceRUSD),
    );
  });

  test("country A and C share a market but keep separate treasuries", () => {
    const scenario = m5Scenario();
    const world = createEconomyWorld(scenario, { seed: 20_261_023 });
    runTicks(world, 5, context(scenario));
    const treasury = (countryId: number): number =>
      world.finance.accounts.find(
        (account) =>
          account.ownerKind === "country" &&
          account.ownerId === countryId &&
          account.subtype === "treasury-cash",
      )?.balanceRUSD ?? 0;
    expect(treasury(M5_COUNTRY_A)).not.toBe(treasury(M5_COUNTRY_C));
    expect(world.provinceEconomies.find((province) => province.id === M5_REGION_A1)?.marketId).toBe(0);
    // A market transfer is a goods purchase, not a fiscal flow.
    const summaryless = world.finance.periodSummaries.length;
    expect(summaryless).toBe(0);
  });
});
