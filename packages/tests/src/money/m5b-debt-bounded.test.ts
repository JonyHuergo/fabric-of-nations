import {
  MAX_ACTIVE_DEBT_CONTRACTS,
  MAX_RETAINED_TERMINATED_DEBT_CONTRACTS,
  assertValidFinanceState,
  assertValidWorld,
  cloneWorld,
  deserializeWorld,
  hashWorld,
  issueGovernmentDebt,
  serializeWorld,
  type DebtContract,
} from "@century/sim";
import { loadM5EightPolities } from "@century/data";
import {
  createM5bWorld,
  m5bScenario,
  tickM5b,
  M5B_COUNTRY_A,
  M5B_COUNTRY_B,
  tickM5b as tick,
} from "../fixtures/m5b.js";

function treasuryCash(world: ReturnType<typeof createM5bWorld>, countryId: number): number {
  const account = world.finance.accounts.find(
    (candidate) =>
      candidate.ownerKind === "country" &&
      candidate.ownerId === countryId &&
      candidate.subtype === "treasury-cash",
  );
  if (account === undefined) throw new Error("missing treasury account");
  return account.balanceRUSD;
}

function issueMany(
  world: ReturnType<typeof createM5bWorld>,
  count: number,
  termDays: number,
): void {
  for (let index = 0; index < count; index += 1) {
    issueGovernmentDebt(world, {
      issuerCountryId: M5B_COUNTRY_A,
      holderKind: "country",
      holderId: M5B_COUNTRY_B,
      principalRUSD: 1_000,
      annualCouponRate: 0,
      termDays,
    });
  }
}

describe("bounded debt contracts and financing semantics", () => {
  test("treasury liquidity prevents unnecessary issuance, including prior cash inflows", () => {
    const scenario = m5bScenario({
      welfareBudgetRUSDPerYear: 36_500,
      initialState: (value) => {
        const country = value.countries?.find((candidate) => candidate.id === M5B_COUNTRY_A);
        if (country === undefined) throw new Error("missing fixture country");
        country.initialTreasuryCashRUSD = 100_000;
        const creditor = value.countries?.find((candidate) => candidate.id === M5B_COUNTRY_B);
        if (creditor === undefined) throw new Error("missing creditor country");
        creditor.initialTreasuryCashRUSD = 100_000;
      },
    });
    const world = createM5bWorld(scenario);
    const last = tick(world, scenario, 31);
    expect(last.economy!.debt.financingRequirementRUSD).toBe(0);
    expect(last.economy!.debt.debtIssuedForDeficitRUSD).toBe(0);
    expect(world.finance.debtContracts).toHaveLength(0);
    expect(treasuryCash(world, M5B_COUNTRY_A)).toBeGreaterThan(90_000);
  });

  test("unpaid welfare is a memo in the financing requirement, never a back-pay liability", () => {
    const scenario = m5bScenario({
      welfareBudgetRUSDPerYear: 36_500,
      initialState: (value) => {
        const country = value.countries?.find((candidate) => candidate.id === M5B_COUNTRY_A);
        if (country === undefined) throw new Error("missing fixture country");
        country.initialTreasuryCashRUSD = 0;
      },
    });
    const world = createM5bWorld(scenario);
    const last = tick(world, scenario, 31);
    const fiscal = last.economy!.fiscal.countries.find(
      (country) => country.countryId === M5B_COUNTRY_A,
    );
    expect(fiscal?.welfareShortfallRUSD).toBeCloseTo(100, 6);
    expect(last.economy!.debt.debtIssuedForDeficitRUSD).toBeCloseTo(3_100, 6);
    expect(
      world.finance.budgetMemosThisMonth[M5B_COUNTRY_A]?.welfareRequestedRUSD ?? 0,
    ).toBe(0);
    // Borrowing adds cash but does not retroactively post welfare expense.
    expect(treasuryCash(world, M5B_COUNTRY_A)).toBeCloseTo(3_100, 6);
    expect(
      world.finance.accounts.some(
        (account) =>
          account.ownerKind === "country" &&
          account.ownerId === M5B_COUNTRY_A &&
          account.subtype === "welfare-expense" &&
          account.balanceRUSD > 0,
      ),
    ).toBe(false);
  });

  test("caps active contracts explicitly and retains bounded terminated detail", () => {
    const scenario = m5bScenario({
      debt: { termDays: 1, maxOutstandingPrincipalRUSD: 1_000_000 },
      initialState: (value) => {
        for (const country of value.countries ?? []) {
          country.initialTreasuryCashRUSD = 100_000;
        }
      },
    });
    const world = createM5bWorld(scenario);
    issueMany(world, 40, 1);
    expect(world.finance.debtContracts).toHaveLength(40);
    tick(world, scenario, 2);
    expect(world.finance.debtContracts).toHaveLength(MAX_RETAINED_TERMINATED_DEBT_CONTRACTS);
    expect(world.finance.debtHistory).toHaveLength(1);
    expect(world.finance.debtHistory[0]?.contractsRetired).toBe(40);
    expect(world.finance.debtHistory[0]?.principalRepaidRUSD).toBeCloseTo(40_000, 6);
    expect(() => assertValidFinanceState(world.finance)).not.toThrow();

    const save = serializeWorld(world);
    const restored = deserializeWorld(save);
    expect(hashWorld(restored)).toBe(hashWorld(world));
    expect(restored.finance.debtContracts).toHaveLength(MAX_RETAINED_TERMINATED_DEBT_CONTRACTS);
    expect(restored.finance.debtHistory).toEqual(world.finance.debtHistory);

    const over = cloneWorld(world);
    const template = over.finance.debtContracts[0] as DebtContract;
    for (let index = 0; index < MAX_ACTIVE_DEBT_CONTRACTS + 1; index += 1) {
      over.finance.debtContracts.push({
        ...template,
        id: 10_000 + index,
        status: "active",
        outstandingPrincipalRUSD: 1,
        principalRUSD: 1,
        maturityDay: template.maturityDay + 100,
      });
    }
    over.finance.nextContractId = 20_000;
    expect(() => assertValidFinanceState(over.finance)).toThrow(/active contracts|maximum/i);
  });

  test("the shipped USA policy is active and produces real borrowing", () => {
    const scenario = loadM5EightPolities();
    const usa = scenario.countries?.find((country) => country.tag === "USA");
    expect(usa?.debt?.enabled).toBe(true);
    expect(usa?.debt?.creditorKind).toBe("country");
    expect(usa?.debt?.creditorId).toBe(1);
    expect(usa?.fiscal.welfareBudgetRUSDPerYear).toBeGreaterThan(0);
    expect(
      scenario.countries?.filter((country) => country.debt?.enabled === true).length,
    ).toBeLessThan(8);

    const world = createM5bWorld(scenario as never);
    const last = tickM5b(world, scenario as never, 31);
    expect(last.economy!.debt.debtIssuedForDeficitRUSD).toBeGreaterThan(0);
    expect(world.finance.debtContracts.length).toBeGreaterThan(0);
    expect(world.finance.debtHistory.length).toBe(0);
    const liability = world.finance.accounts.find(
      (account) =>
        account.ownerKind === "country" &&
        account.ownerId === usa?.id &&
        account.subtype === "debt-liability",
    );
    expect(liability?.balanceRUSD ?? 0).toBeGreaterThan(0);
    const activePrincipal = world.finance.debtContracts
      .filter((contract) => contract.status === "active" || contract.status === "arrears")
      .reduce((total, contract) => total + contract.outstandingPrincipalRUSD, 0);
    expect(liability?.balanceRUSD ?? 0).toBeCloseTo(activePrincipal, 6);
    const bondAsset = world.finance.accounts.find(
      (account) =>
        account.ownerKind === "country" &&
        account.ownerId === 1 &&
        account.subtype === "bond-asset",
    );
    expect(bondAsset?.balanceRUSD ?? 0).toBeCloseTo(activePrincipal, 6);
    expect(() => assertValidWorld(world)).not.toThrow();
  });
});
