/**
 * E2 fiscal management (D-073).
 *
 * Covers the implemented instruments end to end: the income-tax exemption,
 * welfare eligibility and affordability, the treasury reserve floor, the
 * business-profit tax assessment/collection, budget decomposition, financing
 * actions, report reconciliation, ordering, and determinism.
 */

import {
  assertAccountingIdentity,
  assertValidWorld,
  applyCountryAction,
  civilDateToDayIndex,
  createEconomyWorld,
  designatedCashTotal,
  deserializeWorld,
  governmentPeriodTotals,
  hashWorld,
  issueGovernmentDebt,
  populationTotal,
  postJournalBatch,
  postJournalEntry,
  runBusinessTaxPhase,
  serializeWorld,
  tick,
  validateCountryAction,
  type CountryAction,
  type EconomyScenarioDef,
  type World,
} from "@century/sim";
import { loadM5EightPolities } from "@century/data";
import { economyTickContext } from "./fixtures/m3e.js";
import { fiscalScenario } from "./fixtures/m4c.js";
import {
  M5B_COUNTRY_A,
  M5B_COUNTRY_B,
  createM5bWorld,
  m5bContext,
  m5bScenario,
  tickM5b,
} from "./fixtures/m5b.js";

const SEED = 20_261_023;

function contextFor(scenario: EconomyScenarioDef) {
  return economyTickContext(scenario);
}

function runTicks(world: World, scenario: EconomyScenarioDef, count: number) {
  let last;
  for (let index = 0; index < count; index += 1) {
    last = tick(world, contextFor(scenario));
  }
  if (last === undefined) throw new Error("no tick ran");
  return last;
}

/**
 * Make every building strongly profitable so the business-tax assessment and
 * its monthly/annual aggregation are exercised by a deterministic fixture. Only
 * the focused report tests use this; definitions are cloned per scenario.
 */
function makeBuildingsProfitable(scenario: EconomyScenarioDef): void {
  const grain = scenario.definitions.goods[0];
  if (grain === undefined) throw new Error("fixture has no goods");
  for (const building of scenario.definitions.buildings) {
    building.inputs = [];
    building.dailyUpkeepSUSDAtLevelOne = 0;
    building.outputs = [{ goodId: grain.id, quantityPerThroughputUnit: 1_000 }];
  }
}

function account(
  world: World,
  ownerKind: "popBlock" | "building" | "country",
  ownerId: number,
  subtype: string,
) {
  const found = world.finance.accounts.find(
    (entry) =>
      entry.ownerKind === ownerKind && entry.ownerId === ownerId && entry.subtype === subtype,
  );
  if (found === undefined) {
    throw new Error(`missing ${ownerKind} ${String(ownerId)} ${subtype} account`);
  }
  return found;
}

function fiscalAction(
  world: World,
  countryId: number,
  overrides: Partial<Extract<CountryAction, { kind: "set-fiscal-policy" }>> = {},
): CountryAction {
  const country = world.countries.find((candidate) => candidate.id === countryId);
  if (country === undefined) throw new Error("missing country");
  return {
    kind: "set-fiscal-policy",
    countryId,
    dayIndex: world.dayIndex,
    source: "player",
    incomeTaxRate: country.fiscal.incomeTaxRate,
    incomeTaxAllowanceSUSDPerYear: country.fiscal.incomeTaxAllowanceSUSDPerYear,
    welfareBudgetSUSDPerYear: country.fiscal.welfareBudgetSUSDPerYear,
    welfareMaxWealthLevel: country.fiscal.welfareMaxWealthLevel,
    businessProfitTaxRate: country.fiscal.businessProfitTaxRate,
    reserveTargetSUSD: country.fiscal.reserveTargetSUSD,
    ...overrides,
  };
}

describe("E2 income-tax schedule", () => {
  test("withholding is rate x (actual wages - exempt allowance), exactly", () => {
    const scenario = fiscalScenario({ rate: 0.5, budget: 0, treasuryCash: 0 });
    const world = createEconomyWorld(scenario, { seed: SEED });
    const result = tick(world, contextFor(scenario));
    const fiscal = result.economy!.fiscal;
    const wagesByBlock = new Map(
      result.economy!.settlement.households.map((household) => [
        household.popBlockId,
        household.wagesReceivedSUSD,
      ]),
    );
    for (const block of fiscal.blocks) {
      const wages = wagesByBlock.get(block.popBlockId) ?? 0;
      const expected = 0.5 * Math.max(0, wages);
      expect(block.incomeTaxSUSD).toBeCloseTo(expected, 9);
    }
    expect(fiscal.totals.incomeTaxSUSD).toBeGreaterThan(0);
    // The treasury receives exactly the withheld amount.
    expect(account(world, "country", 0, "treasury-cash").balanceSUSD).toBeCloseTo(
      fiscal.totals.incomeTaxSUSD,
      9,
    );
  });

  test("an allowance above every wage removes the liability without an error", () => {
    const scenario = fiscalScenario({
      rate: 1,
      budget: 0,
      treasuryCash: 0,
    });
    const world = createEconomyWorld(scenario, { seed: SEED });
    const country = world.countries[0]!;
    country.fiscal.incomeTaxAllowanceSUSDPerYear = 365 * 1_000_000;
    assertValidWorld(world);
    const result = tick(world, contextFor(scenario));
    expect(result.economy!.fiscal.totals.incomeTaxSUSD).toBe(0);
    expect(account(world, "country", 0, "treasury-cash").balanceSUSD).toBe(0);
  });

  test("a partial exemption taxes only the excess with the exact daily share", () => {
    const scenario = fiscalScenario({ rate: 0.25, budget: 0, treasuryCash: 0 });
    const world = createEconomyWorld(scenario, { seed: SEED });
    const country = world.countries[0]!;
    country.fiscal.incomeTaxAllowanceSUSDPerYear = 365; // exactly 1 SUSD/day
    assertValidWorld(world);
    const result = tick(world, contextFor(scenario));
    const wagesByBlock = new Map(
      result.economy!.settlement.households.map((household) => [
        household.popBlockId,
        household.wagesReceivedSUSD,
      ]),
    );
    for (const block of result.economy!.fiscal.blocks) {
      const wages = wagesByBlock.get(block.popBlockId) ?? 0;
      expect(block.incomeTaxSUSD).toBeCloseTo(0.25 * Math.max(0, wages - 1), 9);
    }
  });
});

describe("E2 welfare allocation, affordability, and reserve floor", () => {
  test("only blocks at or below the wealth ceiling receive the transfer", () => {
    const scenario = fiscalScenario({
      rate: 0,
      budget: 3_650, // 10 SUSD/day
      treasuryCash: 1_000,
    });
    const world = createEconomyWorld(scenario, { seed: SEED });
    const country = world.countries[0]!;
    country.fiscal.welfareMaxWealthLevel = 0;
    assertValidWorld(world);
    for (const block of world.popBlocks) block.wealthLevel = 50;
    const target = world.popBlocks[0]!;
    target.wealthLevel = 0;
    const result = tick(world, contextFor(scenario));
    const fiscal = result.economy!.fiscal.countries[0]!;
    expect(fiscal.welfareRequestedSUSD).toBeCloseTo(10, 9);
    expect(fiscal.welfarePaidSUSD).toBeCloseTo(10, 9);
    expect(fiscal.welfareEligibleBlocks).toBe(1);
    for (const block of result.economy!.fiscal.blocks) {
      const expected = block.popBlockId === target.id ? 10 : 0;
      expect(block.welfareReceivedSUSD).toBeCloseTo(expected, 9);
    }
    // Universal eligibility pays every populated block and keeps the total exact.
    world.countries.find((entry) => entry.id === 0)!.fiscal.welfareMaxWealthLevel = 99;
    assertValidWorld(world);
    const universal = tick(world, contextFor(scenario));
    const universalFiscal = universal.economy!.fiscal.countries[0]!;
    expect(universalFiscal.welfareEligibleBlocks).toBe(
      world.popBlocks.filter((block) => populationTotal(block) > 0).length,
    );
    expect(universalFiscal.welfarePaidSUSD).toBeCloseTo(10, 9);
  });

  test("the reserve target rations welfare cash and never creates cash or liability", () => {
    const scenario = fiscalScenario({
      rate: 0,
      budget: 3_650,
      treasuryCash: 100,
    });
    const world = createEconomyWorld(scenario, { seed: SEED });
    const country = world.countries[0]!;
    country.fiscal.reserveTargetSUSD = 95;
    assertValidWorld(world);
    const first = tick(world, contextFor(scenario));
    const firstFiscal = first.economy!.fiscal.countries[0]!;
    expect(firstFiscal.welfarePaidSUSD).toBeCloseTo(5, 9);
    expect(firstFiscal.welfareShortfallSUSD).toBeCloseTo(5, 9);
    expect(firstFiscal.treasuryCashEndSUSD).toBeCloseTo(95, 9);

    const second = tick(world, contextFor(scenario));
    const secondFiscal = second.economy!.fiscal.countries[0]!;
    expect(secondFiscal.welfarePaidSUSD).toBe(0);
    expect(secondFiscal.welfareShortfallSUSD).toBeCloseTo(10, 9);
    expect(secondFiscal.treasuryCashEndSUSD).toBeCloseTo(95, 9);
    // No welfare payable or debt liability account exists; the shortfall is a memo.
    expect(
      world.finance.accounts.some((entry) => entry.subtype === "debt-liability"),
    ).toBe(false);
    expect(account(world, "country", 0, "treasury-cash").balanceSUSD).toBeCloseTo(95, 9);
    expect(() => assertAccountingIdentity(world.finance)).not.toThrow();
  });

  test("a budget change never rewrites a closed month", () => {
    const scenario = fiscalScenario({ rate: 0.1, budget: 365_000, treasuryCash: 50_000 });
    const world = createEconomyWorld(scenario, { seed: SEED });
    runTicks(world, scenario, 31);
    const firstSummary = JSON.stringify(world.finance.periodSummaries[0]);
    const before = world.countries[0]!.fiscal.incomeTaxRate;
    applyCountryAction(world, fiscalAction(world, 0, { incomeTaxRate: before + 0.05 }));
    runTicks(world, scenario, 31);
    expect(JSON.stringify(world.finance.periodSummaries[0])).toBe(firstSummary);
  });
});

describe("E2 business-profit tax", () => {
  test("assesses rate x positive recognized period result and collects into treasury", () => {
    const scenario = fiscalScenario({ rate: 0, budget: 0, treasuryCash: 0 });
    const world = createEconomyWorld(scenario, { seed: SEED });
    const country = world.countries[0]!;
    country.fiscal.businessProfitTaxRate = 0.5;
    // Move the world to a civil month-end and post a balanced, cash-funded sale
    // so the building's period result is known exactly.
    world.dayIndex = civilDateToDayIndex(1900, 1, 31);
    assertValidWorld(world);
    const buildingId = world.buildings[0]!.id;
    const sale = 400;
    postJournalBatch(world.finance, world.dayIndex, [
      {
        transactionKind: "goods-purchase",
        lines: [
          {
            accountId: account(world, "popBlock", world.popBlocks[0]!.id, "household-cash").id,
            side: "credit",
            amountSUSD: sale,
          },
          {
            accountId: account(world, "popBlock", world.popBlocks[0]!.id, "consumption-expense").id,
            side: "debit",
            amountSUSD: sale,
          },
          {
            accountId: account(world, "building", buildingId, "operating-cash").id,
            side: "debit",
            amountSUSD: sale,
          },
          {
            accountId: account(world, "building", buildingId, "sales-revenue").id,
            side: "credit",
            amountSUSD: sale,
          },
        ],
        sourceEntityId: world.popBlocks[0]!.id,
        targetEntityId: buildingId,
      },
    ]);
    assertValidWorld(world);
    const cashBefore = designatedCashTotal(world.finance);
    const treasuryBefore = account(world, "country", 0, "treasury-cash").balanceSUSD;
    const tax = runBusinessTaxPhase(world, world.dayIndex);
    expect(tax.ran).toBe(true);
    const building = tax.buildings.find((entry) => entry.buildingId === buildingId);
    expect(building?.taxableProfitSUSD).toBeCloseTo(sale, 9);
    expect(building?.assessedSUSD).toBeCloseTo(sale * 0.5, 9);
    expect(building?.collectedSUSD).toBeCloseTo(sale * 0.5, 9);
    expect(building?.uncollectedSUSD).toBe(0);
    expect(account(world, "country", 0, "business-tax-revenue").balanceSUSD).toBeCloseTo(
      sale * 0.5,
      9,
    );
    expect(account(world, "country", 0, "treasury-cash").balanceSUSD).toBeCloseTo(
      treasuryBefore + sale * 0.5,
      9,
    );
    expect(account(world, "building", buildingId, "business-tax-expense").balanceSUSD).toBeCloseTo(
      sale * 0.5,
      9,
    );
    // Cash-neutral transfer: the building paid exactly what the country received.
    expect(designatedCashTotal(world.finance)).toBeCloseTo(cashBefore, 9);
    expect(() => assertAccountingIdentity(world.finance)).not.toThrow();
    const memo = world.finance.budgetMemosThisMonth[0]!;
    expect(memo.businessTaxAssessedSUSD).toBeCloseTo(sale * 0.5, 9);
    expect(memo.businessTaxAssessedDay).toBe(world.dayIndex);
    // A second assessment on the same day is rejected without mutation.
    const before = hashWorld(world);
    expect(() => runBusinessTaxPhase(world, world.dayIndex)).toThrow(/already assessed/);
    expect(hashWorld(world)).toBe(before);
  });

  test("collection is limited by operating cash and reports an explicit shortfall", () => {
    const scenario = fiscalScenario({ rate: 0, budget: 0, treasuryCash: 0 });
    const world = createEconomyWorld(scenario, { seed: SEED });
    const country = world.countries[0]!;
    country.fiscal.businessProfitTaxRate = 0.5;
    world.dayIndex = civilDateToDayIndex(1900, 1, 31);
    assertValidWorld(world);
    const buildingId = world.buildings[0]!.id;
    // Fixture transfer: withdraw the building's starting operating cash to its
    // household owner so a recognized-but-unpaid result cannot be collected.
    const buildingCash = account(world, "building", buildingId, "operating-cash").balanceSUSD;
    postJournalEntry(
      world.finance,
      world.dayIndex,
      "owner-capital-injection",
      [
        {
          accountId: account(world, "popBlock", world.popBlocks[0]!.id, "household-cash").id,
          side: "debit",
          amountSUSD: buildingCash,
        },
        {
          accountId: account(world, "building", buildingId, "operating-cash").id,
          side: "credit",
          amountSUSD: buildingCash,
        },
      ],
      buildingId,
      world.popBlocks[0]!.id,
    );
    // Recognized revenue without a cash receipt leaves operating cash at zero.
    postJournalBatch(world.finance, world.dayIndex, [
      {
        transactionKind: "goods-purchase",
        lines: [
          {
            accountId: account(world, "popBlock", world.popBlocks[0]!.id, "consumption-expense").id,
            side: "debit",
            amountSUSD: 600,
          },
          {
            accountId: account(world, "building", buildingId, "sales-revenue").id,
            side: "credit",
            amountSUSD: 600,
          },
        ],
        sourceEntityId: world.popBlocks[0]!.id,
        targetEntityId: buildingId,
      },
    ]);
    assertValidWorld(world);
    const treasuryBefore = account(world, "country", 0, "treasury-cash").balanceSUSD;
    const tax = runBusinessTaxPhase(world, world.dayIndex);
    const building = tax.buildings.find((entry) => entry.buildingId === buildingId);
    expect(building?.assessedSUSD).toBeCloseTo(300, 9);
    expect(building?.collectedSUSD).toBe(0);
    expect(building?.uncollectedSUSD).toBeCloseTo(300, 9);
    expect(account(world, "country", 0, "business-tax-revenue").balanceSUSD).toBe(0);
    expect(account(world, "country", 0, "treasury-cash").balanceSUSD).toBe(treasuryBefore);
    expect(world.finance.budgetMemosThisMonth[0]?.businessTaxUncollectedSUSD).toBeCloseTo(
      300,
      9,
    );
    // No receivable or liability was invented.
    expect(
      world.finance.accounts.some(
        (entry) => entry.ownerKind === "country" && entry.category === "liability",
      ),
    ).toBe(false);
  });
});

describe("E2 financing actions", () => {
  test("discretionary borrowing is financing, bounded, and reduces later automatic issuance", () => {
    const scenario = m5bScenario({
      welfareBudgetSUSDPerYear: 36_500,
      initialState: (value) => {
        const country = value.countries?.find((candidate) => candidate.id === M5B_COUNTRY_A);
        if (country === undefined) throw new Error("missing fixture country");
        country.initialTreasuryCashSUSD = 0;
      },
    });
    const controlWorld = createM5bWorld(scenario);
    const control = tickM5b(controlWorld, scenario, 31);

    const world = createM5bWorld(scenario);
    runTicks(world, scenario, 30);
    const before = world.finance.accounts.find(
      (entry) =>
        entry.ownerKind === "country" &&
        entry.ownerId === M5B_COUNTRY_A &&
        entry.subtype === "treasury-cash",
    )!.balanceSUSD;
    expect(before).toBe(0);
    applyCountryAction(world, {
      kind: "issue-debt",
      countryId: M5B_COUNTRY_A,
      dayIndex: world.dayIndex,
      source: "player",
      amountSUSD: 500,
    });
    const fiscal = tick(world, m5bContext(scenario));
    const manual = world.finance.debtContracts.find((contract) => contract.principalSUSD === 500);
    expect(manual).toBeDefined();
    expect(manual?.status).toBe("active");
    // Welfare of 100 SUSD was paid from the borrowed cash; the remaining 400
    // reduces the month-end financing requirement instead of being borrowed again.
    expect(fiscal.economy!.fiscal.countries[0]!.welfarePaidSUSD).toBeCloseTo(100, 6);
    expect(control.economy!.debt.debtIssuedForDeficitSUSD).toBeCloseTo(3_100, 6);
    expect(fiscal.economy!.debt.debtIssuedForDeficitSUSD).toBeCloseTo(2_700, 6);
    const outstanding = world.finance.debtContracts
      .filter(
        (contract) =>
          contract.issuerCountryId === M5B_COUNTRY_A &&
          (contract.status === "active" || contract.status === "arrears"),
      )
      .reduce((total, contract) => total + contract.outstandingPrincipalSUSD, 0);
    expect(outstanding).toBeCloseTo(3_200, 6);
    expect(
      world.finance.periodSummaries.at(-1)?.countryBudgetTotals[M5B_COUNTRY_A]?.debtIssuedSUSD,
    ).toBeCloseTo(3_200, 6);
  });

  test("principal repayment is not expenditure and respects the reserve floor", () => {
    const scenario = m5bScenario({ debt: { termDays: 365, maxOutstandingPrincipalSUSD: 1_000_000 } });
    const world = createM5bWorld(scenario);
    const country = world.countries.find((entry) => entry.id === M5B_COUNTRY_A)!;
    country.fiscal.reserveTargetSUSD = 0;
    assertValidWorld(world);
    const issuance = issueGovernmentDebt(world, {
      issuerCountryId: M5B_COUNTRY_A,
      holderKind: "country",
      holderId: M5B_COUNTRY_B,
      principalSUSD: 1_000,
      annualCouponRate: 0.12,
      termDays: 365,
    });
    const treasuryBefore = account(world, "country", M5B_COUNTRY_A, "treasury-cash").balanceSUSD;
    const applied = applyCountryAction(world, {
      kind: "repay-debt",
      countryId: M5B_COUNTRY_A,
      dayIndex: world.dayIndex,
      source: "player",
      contractId: issuance.contract.id,
      amountSUSD: 400,
    });
    expect(applied.principalPaidSUSD).toBe(400);
    expect(applied.debtContract?.outstandingPrincipalSUSD).toBeCloseTo(600, 9);
    expect(account(world, "country", M5B_COUNTRY_A, "treasury-cash").balanceSUSD).toBeCloseTo(
      treasuryBefore - 400,
      9,
    );
    // Principal repayment is a financing movement, not an expense or revenue.
    expect(account(world, "country", M5B_COUNTRY_A, "interest-expense").balanceSUSD).toBe(0);
    expect(world.finance.budgetMemosThisMonth[M5B_COUNTRY_A]?.principalRepaidSUSD).toBeCloseTo(
      400,
      9,
    );

    // The reserve target blocks a discretionary repayment that would breach it.
    const treasuryNow = account(world, "country", M5B_COUNTRY_A, "treasury-cash").balanceSUSD;
    country.fiscal.reserveTargetSUSD = treasuryNow - 100;
    assertValidWorld(world);
    const breaching: CountryAction = {
      kind: "repay-debt",
      countryId: M5B_COUNTRY_A,
      dayIndex: world.dayIndex,
      source: "player",
      contractId: issuance.contract.id,
      amountSUSD: 150,
    };
    const before = hashWorld(world);
    expect(validateCountryAction(world, breaching).valid).toBe(false);
    expect(() => applyCountryAction(world, breaching)).toThrow(/reserve target/);
    expect(hashWorld(world)).toBe(before);
    // A repayment that leaves exactly the reserve floor is accepted.
    applyCountryAction(world, {
      ...breaching,
      amountSUSD: 100,
    });
    expect(account(world, "country", M5B_COUNTRY_A, "treasury-cash").balanceSUSD).toBeCloseTo(
      treasuryNow - 100,
      9,
    );
  });

  test("the debt-policy action controls refinancing and the ceiling", () => {
    const scenario = m5bScenario({
      debt: { termDays: 10, maxOutstandingPrincipalSUSD: 10_000 },
    });
    const world = createM5bWorld(scenario);
    const issuance = issueGovernmentDebt(world, {
      issuerCountryId: M5B_COUNTRY_A,
      holderKind: "country",
      holderId: M5B_COUNTRY_B,
      principalSUSD: 1_000,
      annualCouponRate: 0.12,
      termDays: 10,
    });
    const applied = applyCountryAction(world, {
      kind: "set-debt-policy",
      countryId: M5B_COUNTRY_A,
      dayIndex: world.dayIndex,
      source: "player",
      refinanceOnMaturity: true,
      maxOutstandingPrincipalSUSD: 10_000,
    });
    expect(applied.debt.refinanceOnMaturity).toBe(true);
    runTicks(world, scenario, 11);
    const original = world.finance.debtContracts.find(
      (contract) => contract.id === issuance.contract.id,
    );
    expect(original?.status).toBe("repaid");
    const replacement = world.finance.debtContracts.find(
      (contract) =>
        contract.issuerCountryId === M5B_COUNTRY_A &&
        contract.status === "active" &&
        contract.principalSUSD === 1_000 &&
        contract.id !== issuance.contract.id,
    );
    expect(replacement).toBeDefined();
    // A ceiling below the outstanding principal is rejected without mutation.
    const invalid: CountryAction = {
      kind: "set-debt-policy",
      countryId: M5B_COUNTRY_A,
      dayIndex: world.dayIndex,
      source: "player",
      refinanceOnMaturity: true,
      maxOutstandingPrincipalSUSD: 0,
    };
    const before = hashWorld(world);
    expect(validateCountryAction(world, invalid).valid).toBe(false);
    expect(() => applyCountryAction(world, invalid)).toThrow(/below the outstanding principal/);
    expect(hashWorld(world)).toBe(before);
  });

  test("invalid or unaffordable actions are rejected atomically", () => {
    const scenario = m5bScenario({ debt: { termDays: 365, maxOutstandingPrincipalSUSD: 600 } });
    const world = createM5bWorld(scenario);
    const before = hashWorld(world);
    const actions: CountryAction[] = [
      {
        kind: "issue-debt",
        countryId: M5B_COUNTRY_A,
        dayIndex: world.dayIndex,
        source: "player",
        amountSUSD: 1_000,
      },
      {
        kind: "issue-debt",
        countryId: M5B_COUNTRY_A,
        dayIndex: world.dayIndex,
        source: "player",
        amountSUSD: -1,
      },
      {
        kind: "repay-debt",
        countryId: M5B_COUNTRY_A,
        dayIndex: world.dayIndex,
        source: "player",
        contractId: 1,
        amountSUSD: 100,
      },
      {
        kind: "set-debt-policy",
        countryId: M5B_COUNTRY_A,
        dayIndex: world.dayIndex,
        source: "player",
        refinanceOnMaturity: false,
        maxOutstandingPrincipalSUSD: -5,
      },
      {
        kind: "issue-debt",
        countryId: M5B_COUNTRY_B,
        dayIndex: world.dayIndex,
        source: "player",
        amountSUSD: 100,
      },
    ];
    for (const action of actions) {
      expect(validateCountryAction(world, action).valid).toBe(false);
      expect(() => applyCountryAction(world, action)).toThrow();
      expect(hashWorld(world)).toBe(before);
    }
    expect(() => assertValidWorld(world)).not.toThrow();
  });
});

describe("E2 reporting, ordering, and determinism", () => {
  test("monthly reports reconcile requested/paid/shortfall and financing exactly", () => {
    const scenario = fiscalScenario({
      rate: 0.12,
      budget: 500_000,
      treasuryCash: 20_000,
    });
    makeBuildingsProfitable(scenario);
    const world = createEconomyWorld(scenario, { seed: SEED });
    const country = world.countries[0]!;
    country.fiscal.businessProfitTaxRate = 0.15;
    assertValidWorld(world);
    runTicks(world, scenario, 31);
    const summary = world.finance.periodSummaries[0]!;
    const totals = governmentPeriodTotals(world.finance, summary).find(
      (entry) => entry.countryId === 0,
    )!;
    const budget = summary.countryBudgetTotals[0]!;
    expect(budget.welfareRequestedSUSD).toBeGreaterThan(0);
    expect(budget.welfareRequestedSUSD).toBeCloseTo(
      totals.welfareExpenseSUSD + budget.welfareShortfallSUSD,
      6,
    );
    expect(budget.businessTaxAssessedSUSD).toBeGreaterThan(0);
    expect(budget.businessTaxAssessedSUSD).toBeCloseTo(
      totals.businessTaxRevenueSUSD + budget.businessTaxUncollectedSUSD,
      6,
    );
    expect(totals.netFiscalResultSUSD).toBeCloseTo(
      totals.incomeTaxRevenueSUSD +
        totals.businessTaxRevenueSUSD -
        totals.welfareExpenseSUSD -
        totals.interestExpenseSUSD,
      6,
    );
    // The memo has been frozen into the summary and reset for the new month.
    expect(world.finance.budgetMemosThisMonth[0]).toBeUndefined();
  });

  test("annual flows are exact sums of the year's monthly closes", () => {
    const scenario = fiscalScenario({
      rate: 0.1,
      budget: 1_000_000,
      treasuryCash: 100_000,
    });
    makeBuildingsProfitable(scenario);
    const world = createEconomyWorld(scenario, { seed: SEED });
    const country = world.countries[0]!;
    country.fiscal.businessProfitTaxRate = 0.1;
    assertValidWorld(world);
    runTicks(world, scenario, 365);
    expect(world.finance.annualSummaries).toHaveLength(1);
    const annual = world.finance.annualSummaries[0]!;
    expect(annual.complete).toBe(true);
    const monthly = world.finance.periodSummaries.filter(
      (summary) => summary.periodEndDay <= annual.periodEndDay,
    );
    expect(monthly).toHaveLength(12);
    let incomeTax = 0;
    let businessTax = 0;
    let welfare = 0;
    let interest = 0;
    let requestedWelfare = 0;
    let welfareShortfall = 0;
    let debtIssued = 0;
    let principalRepaid = 0;
    for (const summary of monthly) {
      const totals = governmentPeriodTotals(world.finance, summary).find(
        (entry) => entry.countryId === 0,
      )!;
      incomeTax += totals.incomeTaxRevenueSUSD;
      businessTax += totals.businessTaxRevenueSUSD;
      welfare += totals.welfareExpenseSUSD;
      interest += totals.interestExpenseSUSD;
      const budget = summary.countryBudgetTotals[0];
      requestedWelfare += budget?.welfareRequestedSUSD ?? 0;
      welfareShortfall += budget?.welfareShortfallSUSD ?? 0;
      debtIssued += budget?.debtIssuedSUSD ?? 0;
      principalRepaid += budget?.principalRepaidSUSD ?? 0;
    }
    const annualFiscal = annual.fiscalTotals[0]!;
    expect(annualFiscal.incomeTaxRevenueSUSD).toBeCloseTo(incomeTax, 6);
    expect(annualFiscal.businessTaxRevenueSUSD).toBeCloseTo(businessTax, 6);
    expect(annualFiscal.welfareExpenseSUSD).toBeCloseTo(welfare, 6);
    expect(annualFiscal.interestExpenseSUSD).toBeCloseTo(interest, 6);
    expect(annualFiscal.netFiscalResultSUSD).toBeCloseTo(
      incomeTax + businessTax - welfare - interest,
      6,
    );
    expect(annual.budgetTotals[0]?.welfareRequestedSUSD ?? 0).toBeCloseTo(
      requestedWelfare,
      6,
    );
    expect(annual.budgetTotals[0]?.welfareShortfallSUSD ?? 0).toBeCloseTo(
      welfareShortfall,
      6,
    );
    expect(annual.budgetTotals[0]?.debtIssuedSUSD ?? 0).toBeCloseTo(debtIssued, 6);
    expect(annual.budgetTotals[0]?.principalRepaidSUSD ?? 0).toBeCloseTo(
      principalRepaid,
      6,
    );
    // Year-end balances are stocks read from the accounts, not flows.
    expect(annual.closingBalances[0]?.treasuryCashSUSD).toBeCloseTo(
      account(world, "country", 0, "treasury-cash").balanceSUSD,
      6,
    );
    expect(annual.budgetTotals[0]?.businessTaxAssessedSUSD ?? 0).toBeGreaterThan(0);
  });

  test("save/load and deterministic replay preserve fiscal state and history", () => {
    const scenario = fiscalScenario({ rate: 0.15, budget: 200_000, treasuryCash: 50_000 });
    const first = createEconomyWorld(scenario, { seed: SEED });
    first.countries[0]!.fiscal.businessProfitTaxRate = 0.2;
    first.countries[0]!.fiscal.reserveTargetSUSD = 1_000;
    assertValidWorld(first);
    runTicks(first, scenario, 31);
    const restored = deserializeWorld(serializeWorld(first));
    expect(hashWorld(restored)).toBe(hashWorld(first));
    expect(restored.finance.periodSummaries).toEqual(first.finance.periodSummaries);
    runTicks(first, scenario, 20);
    runTicks(restored, scenario, 20);
    expect(hashWorld(restored)).toBe(hashWorld(first));

    const replay = createEconomyWorld(scenario, { seed: SEED });
    replay.countries[0]!.fiscal.businessProfitTaxRate = 0.2;
    replay.countries[0]!.fiscal.reserveTargetSUSD = 1_000;
    assertValidWorld(replay);
    runTicks(replay, scenario, 51);
    expect(hashWorld(replay)).toBe(hashWorld(first));
  });

  test("the player country boundary is enforced for every action kind", () => {
    const scenario = loadM5EightPolities();
    const world = createEconomyWorld(scenario, { seed: SEED });
    const playerId = world.playerCountryId;
    expect(playerId).not.toBeNull();
    const other = world.countries.find((country) => country.id !== playerId)!;
    const playerAction = fiscalAction(world, other.id);
    expect(validateCountryAction(world, playerAction).errors.join(" ")).toMatch(
      /only target the designated player country/,
    );
    const aiAction = {
      ...fiscalAction(world, playerId!),
      source: "ai",
    } as CountryAction;
    expect(validateCountryAction(world, aiAction).errors.join(" ")).toMatch(
      /AI must not target the player/,
    );
    expect(() => applyCountryAction(world, aiAction)).toThrow();
    // The AI phase never evaluates the player country.
    expect(
      world.countries.find((country) => country.id === playerId)?.ai.lastDecisionDay,
    ).toBeNull();
  });
});
