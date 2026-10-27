import {
  assertAccountingIdentity,
  assertValidWorld,
  cloneWorld,
  createEconomyWorld,
  deserializeWorld,
  governmentPeriodTotals,
  hashWorld,
  issueGovernmentDebt,
  serializeWorld,
  type FinancialAccount,
  type World,
} from "@century/sim";
import {
  M5B_COUNTRY_A,
  M5B_COUNTRY_B,
  createM5bWorld,
  m5bScenario,
  tickM5b,
} from "./fixtures/m5b.js";
import { m5Scenario } from "./fixtures/m5.js";

function account(
  world: World,
  ownerKind: FinancialAccount["ownerKind"],
  ownerId: number,
  subtype: FinancialAccount["subtype"],
): FinancialAccount {
  const found = world.finance.accounts.find(
    (candidate) =>
      candidate.ownerKind === ownerKind &&
      candidate.ownerId === ownerId &&
      candidate.subtype === subtype,
  );
  if (found === undefined) throw new Error(`missing ${ownerKind}/${String(ownerId)}/${subtype}`);
  return found;
}

function treasury(world: World, id: number): FinancialAccount {
  return account(world, "country", id, "treasury-cash");
}

function issue(
  world: World,
  principal = 1000,
  termDays = 10,
  holderKind: "country" | "popBlock" = "country",
  holderId = M5B_COUNTRY_B,
) {
  return issueGovernmentDebt(world, {
    issuerCountryId: M5B_COUNTRY_A,
    holderKind,
    holderId,
    principalSUSD: principal,
    annualCouponRate: 0.12,
    termDays,
  });
}

describe("M5b public debt and deficit financing", () => {
  test("legacy fixtures have no debt policy, accounts, or contracts", () => {
    const world = createEconomyWorld(m5Scenario(), { seed: 1 });
    expect(world.countries.every((country) => country.debt.enabled === false)).toBe(true);
    expect(world.finance.debtContracts).toHaveLength(0);
    expect(world.finance.accounts.some((entry) => entry.subtype === "debt-liability")).toBe(false);
    expect(world.finance.accounts.some((entry) => entry.subtype === "bond-asset")).toBe(false);
    expect(() => assertValidWorld(world)).not.toThrow();
  });

  test("issuance moves existing cash and records matching liability and asset", () => {
    const world = createM5bWorld(m5bScenario());
    const beforeA = treasury(world, M5B_COUNTRY_A).balanceSUSD;
    const beforeB = treasury(world, M5B_COUNTRY_B).balanceSUSD;
    const result = issue(world);
    expect(result.contract.id).toBe(1);
    expect(result.contract.status).toBe("active");
    expect(result.contract.outstandingPrincipalSUSD).toBe(1000);
    expect(treasury(world, M5B_COUNTRY_A).balanceSUSD).toBeCloseTo(beforeA + 1000, 8);
    expect(treasury(world, M5B_COUNTRY_B).balanceSUSD).toBeCloseTo(beforeB - 1000, 8);
    expect(account(world, "country", M5B_COUNTRY_A, "debt-liability").balanceSUSD).toBeCloseTo(1000, 8);
    expect(account(world, "country", M5B_COUNTRY_B, "bond-asset").balanceSUSD).toBeCloseTo(1000, 8);
    expect(world.finance.postings.at(-1)?.transactionKind).toBe("debt-issuance");
    assertAccountingIdentity(world.finance);
    expect(() => assertValidWorld(world)).not.toThrow();
  });

  test("rejects issuance without creditor cash, over the ceiling, or to a wrong holder", () => {
    const poor = m5bScenario();
    const poorCountry = poor.countries?.find((country) => country.id === M5B_COUNTRY_B);
    if (poorCountry === undefined) throw new Error("missing fixture country");
    poorCountry.initialTreasuryCashSUSD = 10;
    const poorWorld = createM5bWorld(poor);
    expect(() => issue(poorWorld, 1000)).toThrow(/insufficient cash/);

    const ceiling = m5bScenario({ debt: { maxOutstandingPrincipalSUSD: 500 } });
    expect(() => issue(createM5bWorld(ceiling), 1000)).toThrow(/ceiling/);

    const wrong = createM5bWorld(m5bScenario());
    expect(() => issue(wrong, 1000, 10, "country", 0)).toThrow(/designated debt creditor/);

    const disabled = createEconomyWorld(m5Scenario(), { seed: 1 });
    expect(() => issue(disabled)).toThrow(/no enabled debt policy/);
  });

  test("accrues daily interest and pays the coupon at month-end", () => {
    const scenario = m5bScenario({ debt: { termDays: 60, maxOutstandingPrincipalSUSD: 1000 } });
    const world = createM5bWorld(scenario);
    issue(world, 1000, 60);
    const treasuryABefore = treasury(world, M5B_COUNTRY_A).balanceSUSD;
    const treasuryBBefore = treasury(world, M5B_COUNTRY_B).balanceSUSD;
    tickM5b(world, scenario, 31);
    // Contract issued on day 0; days 1..30 accrue one 365th of the annual coupon.
    const expectedInterest = (1000 * 0.12 * 30) / 365;
    expect(treasury(world, M5B_COUNTRY_A).balanceSUSD).toBeCloseTo(
      treasuryABefore - expectedInterest,
      8,
    );
    expect(treasury(world, M5B_COUNTRY_B).balanceSUSD).toBeCloseTo(
      treasuryBBefore + expectedInterest,
      8,
    );
    expect(account(world, "country", M5B_COUNTRY_B, "interest-income").balanceSUSD).toBe(0);
    expect(account(world, "country", M5B_COUNTRY_A, "interest-expense").balanceSUSD).toBe(0);
    const contract = world.finance.debtContracts[0]!;
    expect(contract.accruedInterestSUSD).toBeCloseTo(0, 8);
    expect(contract.outstandingPrincipalSUSD).toBeCloseTo(1000, 8);
    const summary = world.finance.periodSummaries.at(-1)!;
    const totals = governmentPeriodTotals(world.finance, summary).find(
      (entry) => entry.countryId === M5B_COUNTRY_A,
    )!;
    expect(totals.interestExpenseSUSD).toBeCloseTo(expectedInterest, 8);
    const payments = world.finance.postings.filter(
      (posting) => posting.transactionKind === "interest-payment",
    );
    expect(payments).toHaveLength(1);
    assertAccountingIdentity(world.finance);
    expect(() => assertValidWorld(world)).not.toThrow();
  });

  test("does not borrow when treasury liquidity covers the accrued budget gap", () => {
    const scenario = m5bScenario({ welfareBudgetSUSDPerYear: 36_500 });
    const world = createM5bWorld(scenario);
    const last = tickM5b(world, scenario, 31);
    expect(last.economy!.debt.financingRequirementSUSD).toBe(0);
    expect(last.economy!.debt.debtIssuedForDeficitSUSD).toBe(0);
    expect(world.finance.debtContracts).toHaveLength(0);
    expect(treasury(world, M5B_COUNTRY_A).balanceSUSD).toBeCloseTo(6_900, 6);
  });

  test("finances a genuine month-end shortfall with explicit debt, not revenue", () => {
    const scenario = m5bScenario({
      welfareBudgetSUSDPerYear: 36_500,
      initialState: (value) => {
        const country = value.countries?.find((candidate) => candidate.id === M5B_COUNTRY_A);
        if (country === undefined) throw new Error("missing fixture country");
        country.initialTreasuryCashSUSD = 0;
      },
    });
    const world = createM5bWorld(scenario);
    const last = tickM5b(world, scenario, 31);
    expect(last.economy!.debt.financingRequirementSUSD).toBeCloseTo(3_100, 6);
    expect(last.economy!.debt.debtIssuedForDeficitSUSD).toBeCloseTo(3_100, 6);
    const contract = world.finance.debtContracts[0]!;
    expect(contract.issuerCountryId).toBe(M5B_COUNTRY_A);
    expect(contract.holderId).toBe(M5B_COUNTRY_B);
    expect(contract.principalSUSD).toBeCloseTo(3_100, 6);
    expect(treasury(world, M5B_COUNTRY_A).balanceSUSD).toBeCloseTo(3_100, 6);
    expect(treasury(world, M5B_COUNTRY_B).balanceSUSD).toBeCloseTo(6_900, 6);
    expect(account(world, "country", M5B_COUNTRY_A, "debt-liability").balanceSUSD).toBeCloseTo(3_100, 6);
    expect(last.economy!.financeClose).not.toBeNull();
    expect(Object.keys(last.economy!.financeClose!.summary.flowTotalsByKind)).toHaveLength(4);
    expect(world.finance.debtContracts).toHaveLength(1);
  });

  test("repays principal at maturity and retires the contract", () => {
    const scenario = m5bScenario();
    const world = createM5bWorld(scenario);
    issue(world, 1000, 10);
    const treasuryABefore = treasury(world, M5B_COUNTRY_A).balanceSUSD;
    const treasuryBBefore = treasury(world, M5B_COUNTRY_B).balanceSUSD;
    tickM5b(world, scenario, 11);
    // Days 1..10 accrue; maturity on day 10 pays the coupon and the principal.
    const expectedInterest = (1000 * 0.12 * 10) / 365;
    const contract = world.finance.debtContracts[0]!;
    expect(contract.status).toBe("repaid");
    expect(contract.outstandingPrincipalSUSD).toBe(0);
    expect(treasury(world, M5B_COUNTRY_A).balanceSUSD).toBeCloseTo(
      treasuryABefore - expectedInterest - 1000,
      8,
    );
    expect(treasury(world, M5B_COUNTRY_B).balanceSUSD).toBeCloseTo(
      treasuryBBefore + expectedInterest + 1000,
      8,
    );
    expect(account(world, "country", M5B_COUNTRY_B, "bond-asset").balanceSUSD).toBe(0);
    expect(account(world, "country", M5B_COUNTRY_A, "debt-liability").balanceSUSD).toBe(0);
    expect(world.finance.postings.some((posting) => posting.transactionKind === "debt-principal-repayment")).toBe(true);
    assertAccountingIdentity(world.finance);
  });

  test("refinances maturing principal with explicit replacement contract", () => {
    const scenario = m5bScenario({ debt: { termDays: 10, refinanceOnMaturity: true } });
    const world = createM5bWorld(scenario);
    issue(world, 1000, 10);
    const treasuryABefore = treasury(world, M5B_COUNTRY_A).balanceSUSD;
    const treasuryBBefore = treasury(world, M5B_COUNTRY_B).balanceSUSD;
    tickM5b(world, scenario, 11);
    const expectedInterest = (1000 * 0.12 * 10) / 365;
    expect(world.finance.debtContracts).toHaveLength(2);
    const [oldContract, replacement] = world.finance.debtContracts;
    expect(oldContract?.status).toBe("repaid");
    expect(oldContract?.outstandingPrincipalSUSD).toBe(0);
    expect(replacement?.status).toBe("active");
    expect(replacement?.outstandingPrincipalSUSD).toBeCloseTo(1000, 8);
    // Refinancing transfers principal from the replacement, so only the coupon
    // moves net cash between the two treasuries.
    expect(treasury(world, M5B_COUNTRY_A).balanceSUSD).toBeCloseTo(
      treasuryABefore - expectedInterest,
      8,
    );
    expect(treasury(world, M5B_COUNTRY_B).balanceSUSD).toBeCloseTo(
      treasuryBBefore + expectedInterest,
      8,
    );
    expect(account(world, "country", M5B_COUNTRY_A, "debt-liability").balanceSUSD).toBeCloseTo(1000, 8);
    expect(account(world, "country", M5B_COUNTRY_B, "bond-asset").balanceSUSD).toBeCloseTo(1000, 8);
    const oldHistory = world.finance.debtHistory.find(
      (entry) => entry.issuerCountryId === M5B_COUNTRY_A,
    );
    expect(oldHistory?.contractsRetired).toBe(1);
    expect(oldHistory?.principalRepaidSUSD).toBeCloseTo(1000, 8);
    assertAccountingIdentity(world.finance);
  });

  test("marks arrears and defaults explicitly when principal cannot be paid", () => {
    const scenario = m5bScenario({
      welfareBudgetSUSDPerYear: 365_000,
      debt: { termDays: 10, arrearsGraceDays: 30, maxOutstandingPrincipalSUSD: 1000 },
      initialState: (value) => {
        const country = value.countries?.find((candidate) => candidate.id === M5B_COUNTRY_A);
        if (country === undefined) throw new Error("missing fixture country");
        country.initialTreasuryCashSUSD = 0;
      },
    });
    const world = createM5bWorld(scenario);
    issue(world, 1000, 10);
    tickM5b(world, scenario, 11);
    const contract = world.finance.debtContracts[0]!;
    expect(contract.status).toBe("arrears");
    expect(contract.outstandingPrincipalSUSD).toBeCloseTo(1000, 8);
    expect(contract.arrearsSinceDay).toBe(10);
    tickM5b(world, scenario, 31);
    const defaulted = world.finance.debtContracts[0]!;
    expect(defaulted.status).toBe("defaulted");
    expect(defaulted.outstandingPrincipalSUSD).toBe(0);
    expect(defaulted.accruedInterestSUSD).toBe(0);
    expect(account(world, "country", M5B_COUNTRY_A, "debt-liability").balanceSUSD).toBe(0);
    expect(account(world, "country", M5B_COUNTRY_B, "bond-asset").balanceSUSD).toBe(0);
    expect(world.finance.postings.some((posting) => posting.transactionKind === "debt-default-writeoff")).toBe(true);
    // Day 40 is the first day at or after the 30-day grace period. Days 1..40
    // accrue before the write-off: 1000 * 0.12 * 40 / 365.
    const expectedWrittenOffInterest = (1000 * 0.12 * 40) / 365;
    const history = world.finance.debtHistory.find(
      (entry) => entry.issuerCountryId === M5B_COUNTRY_A,
    )!;
    expect(history.contractsDefaulted).toBe(1);
    expect(history.contractsRetired).toBe(0);
    expect(history.principalIssuedSUSD).toBeCloseTo(1000, 8);
    expect(history.principalWrittenOffSUSD).toBeCloseTo(1000, 8);
    expect(history.interestWrittenOffSUSD).toBeCloseTo(expectedWrittenOffInterest, 8);
    assertAccountingIdentity(world.finance);
  });

  test("reports interest expense in fiscal totals without adding a flow kind", () => {
    const scenario = m5bScenario({ debt: { termDays: 60, maxOutstandingPrincipalSUSD: 1000 } });
    const world = createM5bWorld(scenario);
    issue(world, 1000, 60);
    tickM5b(world, scenario, 31);
    const summary = world.finance.periodSummaries.at(-1)!;
    const totals = governmentPeriodTotals(world.finance, summary).find((entry) => entry.countryId === M5B_COUNTRY_A)!;
    expect(totals.interestExpenseSUSD).toBeGreaterThan(0);
    expect(totals.netFiscalResultSUSD).toBeCloseTo(-totals.interestExpenseSUSD, 8);
    expect(Object.keys(summary.flowTotalsByKind)).toHaveLength(4);
  });

  test("supports a domestic household creditor with matching cash and bond legs", () => {
    const scenario = m5bScenario({
      debt: { creditorKind: "popBlock", creditorId: 0, termDays: 60 },
    });
    const world = createM5bWorld(scenario);
    const before = account(world, "popBlock", 0, "household-cash").balanceSUSD;
    issue(world, 100, 60, "popBlock", 0);
    expect(account(world, "popBlock", 0, "household-cash").balanceSUSD).toBeCloseTo(before - 100, 8);
    expect(account(world, "popBlock", 0, "bond-asset").balanceSUSD).toBeCloseTo(100, 8);
    expect(account(world, "country", M5B_COUNTRY_A, "debt-liability").balanceSUSD).toBeCloseTo(100, 8);
    assertAccountingIdentity(world.finance);
    expect(() => assertValidWorld(world)).not.toThrow();
  });

  test("round-trips, resumes, and replays debt deterministically", () => {
    const scenario = m5bScenario({ debt: { termDays: 60, maxOutstandingPrincipalSUSD: 1000 } });
    const first = createM5bWorld(scenario);
    issue(first, 1000, 60);
    tickM5b(first, scenario, 5);
    const saved = serializeWorld(first);
    const restored = deserializeWorld(saved);
    expect(hashWorld(restored)).toBe(hashWorld(first));
    tickM5b(first, scenario, 5);
    tickM5b(restored, scenario, 5);
    expect(hashWorld(restored)).toBe(hashWorld(first));
    expect(hashWorld(cloneWorld(first))).toBe(hashWorld(first));
    assertAccountingIdentity(first.finance);
    assertAccountingIdentity(restored.finance);
  });

  test("invalid policies and contracts are rejected", () => {
    const badCoupon = m5bScenario({ debt: { annualCouponRate: 1.5 } });
    expect(() => createM5bWorld(badCoupon)).toThrow(/annualCouponRate/);
    const badTerm = m5bScenario({ debt: { termDays: 0 } });
    expect(() => createM5bWorld(badTerm)).toThrow(/termDays/);
    const badCreditor = m5bScenario({ debt: { creditorId: 99 } });
    expect(() => createM5bWorld(badCreditor)).toThrow(/unknown country 99/);
    const world = createM5bWorld(m5bScenario());
    issue(world, 1000);
    world.finance.debtContracts[0]!.outstandingPrincipalSUSD = 2_000;
    expect(() => assertValidWorld(world)).toThrow(/outstandingPrincipalSUSD/);
  });

  test("failure to find a debt account rolls back issuance", () => {
    const world = createM5bWorld(m5bScenario());
    const bond = account(world, "country", M5B_COUNTRY_B, "bond-asset");
    world.finance.accounts = world.finance.accounts.filter((entry) => entry.id !== bond.id);
    const beforeContracts = world.finance.debtContracts.length;
    const beforeId = world.finance.nextContractId;
    expect(() => issue(world)).toThrow();
    expect(world.finance.debtContracts).toHaveLength(beforeContracts);
    expect(world.finance.nextContractId).toBe(beforeId);
  });
});
