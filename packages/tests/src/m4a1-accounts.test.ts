import {
  CASH_CHANGING_TRANSACTION_KINDS,
  CASH_NEUTRAL_TRANSACTION_KINDS,
  CASH_SUBTYPES,
  TRANSACTION_KINDS,
  accountingTotals,
  applyOpeningBalances,
  assertAccountingIdentity,
  assertValidWorld,
  categoryForSubtype,
  cloneWorld,
  createEconomyWorld,
  createInitialWorld,
  designatedCashTotal,
  deserializeWorld,
  hashWorld,
  postCashTransfer,
  postJournalBatch,
  postJournalEntry,
  serializeWorld,
  tick,
  transactionKindChangesCash,
  type FinanceState,
  type FinancialAccount,
  type PublicTransactionKind,
  type World,
} from "@century/sim";
import {
  M3_BUILDING_ACCOUNT_FIRST_ID,
  M3_HOUSEHOLD_ACCOUNT_IDS,
  m3Scenario,
  m3World,
} from "./fixtures/m3a.js";
import { aggregateWorld, contextFor, makeInputs } from "./fixtures/m2.js";
import {
  GRAIN_ID,
  household,
  marketScenario,
} from "./fixtures/m3d.js";
import {
  createSettlementWorld,
  economyTickContext,
  runSettlement,
  totalCash,
} from "./fixtures/m3e.js";

function accountOf(
  world: World,
  ownerKind: "popBlock" | "building" | "system",
  ownerId: number | null,
  subtype: FinancialAccount["subtype"],
): FinancialAccount {
  const account = world.finance.accounts.find(
    (candidate) =>
      candidate.ownerKind === ownerKind &&
      candidate.ownerId === ownerId &&
      candidate.subtype === subtype,
  );
  if (account === undefined) {
    throw new Error(`missing ${subtype} account for ${ownerKind} ${String(ownerId)}`);
  }
  return account;
}

function balanceOf(finance: FinanceState, accountId: number): number {
  const account = finance.accounts.find((candidate) => candidate.id === accountId);
  if (account === undefined) throw new Error(`missing account ${String(accountId)}`);
  return account.balanceSUSD;
}

function manualFinance(
  entries: readonly { id: number; subtype: FinancialAccount["subtype"]; balanceSUSD?: number }[],
): FinanceState {
  const accounts: FinancialAccount[] = entries.map((entry) => ({
    id: entry.id,
    ownerKind: "popBlock",
    ownerId: 0,
    category:
      entry.subtype === "household-cash"
        ? "asset"
        : entry.subtype === "owner-equity"
          ? "equity"
          : entry.subtype === "wage-income"
            ? "revenue"
            : "expense",
    subtype: entry.subtype,
    balanceSUSD: entry.balanceSUSD ?? 0,
  }));
  return {
    accounts,
    postings: [],
    nextPostingId: 1,
    nextAccountId: entries.reduce((max, entry) => Math.max(max, entry.id), 0) + 1,
    opening: null,
    periodSummaries: [],
    closedThroughDay: null,
  };
}

describe("M4a-1 opening balances", () => {
  test("applies opening balances exactly once and rejects a second application", () => {
    const world = m3World().world;
    expect(world.finance.opening).not.toBeNull();
    expect(() => applyOpeningBalances(world.finance, 0, [])).toThrow(/already been applied/i);

    const finance = manualFinance([
      { id: 1, subtype: "household-cash" },
      { id: 2, subtype: "owner-equity" },
    ]);
    const opening = applyOpeningBalances(finance, 0, [
      { accountId: 1, balanceSUSD: 100 },
      { accountId: 2, balanceSUSD: 100 },
    ]);
    expect(opening.dayIndex).toBe(0);
    expect(opening.accountCount).toBe(2);
    expect(opening.checksum.length).toBeGreaterThan(0);
    expect(balanceOf(finance, 1)).toBe(100);
    expect(() =>
      applyOpeningBalances(finance, 0, [{ accountId: 1, balanceSUSD: 1 }]),
    ).toThrow(/already been applied/i);
  });

  test("opening balances satisfy the accounting identity with explicit equity counterparts", () => {
    const world = m3World().world;
    const totals = accountingTotals(world.finance);
    expect(totals.assets).toBeGreaterThan(0);
    expect(totals.assets).toBeCloseTo(totals.equity, 9);
    expect(totals.liabilities).toBe(0);
    expect(totals.revenues).toBe(0);
    expect(totals.expenses).toBe(0);
    expect(() => assertAccountingIdentity(world.finance)).not.toThrow();
  });

  test("each owner has an explicit equity counterpart equal to its opening cash", () => {
    const world = m3World().world;
    for (const block of world.popBlocks) {
      const cash = accountOf(world, "popBlock", block.id, "household-cash");
      const equity = accountOf(world, "popBlock", block.id, "owner-equity");
      expect(equity.balanceSUSD).toBeCloseTo(cash.balanceSUSD, 9);
    }
    for (const building of world.buildings) {
      const cash = accountOf(world, "building", building.id, "operating-cash");
      const equity = accountOf(world, "building", building.id, "owner-equity");
      expect(equity.balanceSUSD).toBeCloseTo(cash.balanceSUSD, 9);
    }
    const systemCash = accountOf(world, "system", null, "system-reserve-cash");
    const systemEquity = accountOf(world, "system", null, "owner-equity");
    expect(systemEquity.balanceSUSD).toBeCloseTo(systemCash.balanceSUSD, 9);
  });

  test("rejects an unbalanced or negative-asset opening set without mutating state", () => {
    const unbalanced = manualFinance([
      { id: 1, subtype: "household-cash" },
      { id: 2, subtype: "owner-equity" },
    ]);
    expect(() =>
      applyOpeningBalances(unbalanced, 0, [
        { accountId: 1, balanceSUSD: 100 },
        { accountId: 2, balanceSUSD: 90 },
      ]),
    ).toThrow(/not balanced/i);
    expect(unbalanced.opening).toBeNull();
    expect(balanceOf(unbalanced, 1)).toBe(0);

    const negative = manualFinance([
      { id: 1, subtype: "household-cash" },
      { id: 2, subtype: "owner-equity" },
    ]);
    expect(() =>
      applyOpeningBalances(negative, 0, [
        { accountId: 1, balanceSUSD: -5 },
        { accountId: 2, balanceSUSD: -5 },
      ]),
    ).toThrow(/non-negative/i);
    expect(negative.opening).toBeNull();
  });

  test("rejects opening balances when an account is already non-zero", () => {
    const finance = manualFinance([{ id: 1, subtype: "household-cash", balanceSUSD: 5 }]);
    expect(() =>
      applyOpeningBalances(finance, 0, [{ accountId: 1, balanceSUSD: 5 }]),
    ).toThrow(/zeroed/i);
  });

  test("the opening record must belong to the world start day", () => {
    const world = m3World().world;
    if (world.finance.opening === null) throw new Error("missing opening record");
    world.finance.opening.dayIndex = 1;
    expect(() => assertValidWorld(world)).toThrow(/startDayIndex/i);
  });
});

describe("M4a-1 account semantics", () => {
  test("debit-normal accounts increase on debit and credit-normal accounts increase on credit", () => {
    const world = m3World().world;
    const householdId = M3_HOUSEHOLD_ACCOUNT_IDS[0];
    const householdCashBefore = balanceOf(world.finance, householdId);
    const buildingCashId = M3_BUILDING_ACCOUNT_FIRST_ID;
    const buildingCashBefore = balanceOf(world.finance, buildingCashId);
    const consumption = accountOf(world, "popBlock", 0, "consumption-expense");
    const sales = accountOf(world, "building", 0, "sales-revenue");
    const consumptionBefore = consumption.balanceSUSD;
    const salesBefore = sales.balanceSUSD;

    postJournalEntry(world.finance, 0, "goods-purchase", [
      { accountId: consumption.id, side: "debit", amountSUSD: 10 },
      { accountId: buildingCashId, side: "debit", amountSUSD: 10 },
      { accountId: householdId, side: "credit", amountSUSD: 10 },
      { accountId: sales.id, side: "credit", amountSUSD: 10 },
    ]);

    expect(balanceOf(world.finance, householdId)).toBeCloseTo(householdCashBefore - 10, 9);
    expect(balanceOf(world.finance, buildingCashId)).toBeCloseTo(buildingCashBefore + 10, 9);
    expect(consumption.balanceSUSD).toBeCloseTo(consumptionBefore + 10, 9);
    expect(sales.balanceSUSD).toBeCloseTo(salesBefore + 10, 9);
    expect(() => assertAccountingIdentity(world.finance)).not.toThrow();
  });

  test("rejects a posting that would make a designated cash account negative and leaves state unchanged", () => {
    const world = m3World().world;
    const householdId = M3_HOUSEHOLD_ACCOUNT_IDS[0];
    const before = world.finance.accounts.map((account) => ({ ...account }));
    const postingCount = world.finance.postings.length;
    expect(() =>
      postCashTransfer(world.finance, 0, "goods-purchase", {
        fromAccountId: householdId,
        toAccountId: M3_BUILDING_ACCOUNT_FIRST_ID,
        amountSUSD: balanceOf(world.finance, householdId) + 1,
      }),
    ).toThrow(/insufficient|negative/i);
    expect(world.finance.accounts).toEqual(before);
    expect(world.finance.postings).toHaveLength(postingCount);
  });

  test("allows a signed equity balance and rejects negative revenue and expense balances", () => {
    const world = m3World().world;
    // Negative equity is representable (category allows a signed balance); the
    // matrix now forbids reaching it by posting into a revenue/expense account
    // outside a period close, so construct the balanced state directly.
    const equity = accountOf(world, "popBlock", 0, "owner-equity");
    const revenue = accountOf(world, "popBlock", 0, "wage-income");
    const shift = equity.balanceSUSD + 100;
    equity.balanceSUSD = -100;
    revenue.balanceSUSD += shift;
    expect(equity.balanceSUSD).toBeLessThan(0);
    expect(() => assertValidWorld(world)).not.toThrow();
    expect(() => assertAccountingIdentity(world.finance)).not.toThrow();

    expect(() =>
      postJournalEntry(world.finance, 0, "owner-capital-injection", [
        { accountId: revenue.id, side: "debit", amountSUSD: 100 },
        { accountId: equity.id, side: "credit", amountSUSD: 100 },
      ]),
    ).toThrow(/semantic matrix|may not/i);

    const expense = accountOf(world, "popBlock", 0, "consumption-expense");
    expect(() =>
      postJournalEntry(world.finance, 0, "owner-capital-injection", [
        { accountId: expense.id, side: "credit", amountSUSD: 100 },
        { accountId: equity.id, side: "debit", amountSUSD: 100 },
      ]),
    ).toThrow(/semantic matrix|may not/i);

    const negativeRevenue = m3World().world;
    const revenueAccount = accountOf(negativeRevenue, "popBlock", 0, "wage-income");
    revenueAccount.balanceSUSD = -1;
    expect(() => assertValidWorld(negativeRevenue)).toThrow(/negative revenue/i);

    const negativeExpense = m3World().world;
    const expenseAccount = accountOf(negativeExpense, "popBlock", 0, "consumption-expense");
    expenseAccount.balanceSUSD = -1;
    expect(() => assertValidWorld(negativeExpense)).toThrow(/negative expense/i);
  });
});

describe("M4a-1 invariants", () => {
  test("every transaction kind belongs to exactly one cash partition", () => {
    const neutral = new Set<string>(CASH_NEUTRAL_TRANSACTION_KINDS);
    const changing = new Set<string>(CASH_CHANGING_TRANSACTION_KINDS);
    expect(neutral.size + changing.size).toBe(TRANSACTION_KINDS.length);
    for (const kind of TRANSACTION_KINDS) {
      expect(neutral.has(kind) !== changing.has(kind)).toBe(true);
      expect(transactionKindChangesCash(kind)).toBe(changing.has(kind));
    }
    for (const kind of CASH_CHANGING_TRANSACTION_KINDS) {
      expect(kind === "monetary-issuance" || kind === "monetary-redemption").toBe(true);
    }
  });

  test("the designated cash set is explicit and never every asset account", () => {
    expect(CASH_SUBTYPES).toEqual([
      "household-cash",
      "operating-cash",
      "system-reserve-cash",
      "treasury-cash",
    ]);
    const world = m3World().world;
    const cashAccounts = world.finance.accounts.filter((account) =>
      (CASH_SUBTYPES as readonly string[]).includes(account.subtype),
    );
    expect(cashAccounts.length).toBeGreaterThan(0);
    expect(cashAccounts.every((account) => account.category === "asset")).toBe(true);
  });

  test("rejects a cash-neutral posting that would change aggregate cash", () => {
    const world = m3World().world;
    const sales = accountOf(world, "building", 0, "sales-revenue");
    const before = designatedCashTotal(world.finance);
    expect(() =>
      postJournalEntry(world.finance, 0, "goods-purchase", [
        { accountId: M3_HOUSEHOLD_ACCOUNT_IDS[0], side: "debit", amountSUSD: 5 },
        { accountId: sales.id, side: "credit", amountSUSD: 5 },
      ]),
    ).toThrow(/aggregate designated cash/i);
    expect(designatedCashTotal(world.finance)).toBeCloseTo(before, 9);
  });

  test("rejects cash-changing transaction kinds in M4a-1", () => {
    const world = m3World().world;
    const kind = CASH_CHANGING_TRANSACTION_KINDS[0] as PublicTransactionKind;
    expect(() =>
      postJournalEntry(world.finance, 0, kind, [
        { accountId: M3_HOUSEHOLD_ACCOUNT_IDS[0], side: "debit", amountSUSD: 5 },
        { accountId: M3_BUILDING_ACCOUNT_FIRST_ID, side: "credit", amountSUSD: 5 },
      ]),
    ).toThrow(/not implemented/i);
  });

  test("the accounting identity and designated cash are conserved over a 30-day run", () => {
    const scenario = marketScenario();
    const world = createEconomyWorld(scenario, { seed: 20_261_023 });
    const context = economyTickContext(scenario);
    const cashBefore = designatedCashTotal(world.finance);
    for (let day = 0; day < 30; day += 1) {
      tick(world, context);
      assertAccountingIdentity(world.finance);
    }
    expect(designatedCashTotal(world.finance)).toBeCloseTo(cashBefore, 9);
  });

  test("every retained posting balances under the normal-side model", () => {
    const scenario = marketScenario();
    const world = createEconomyWorld(scenario, { seed: 20_261_023 });
    const context = economyTickContext(scenario);
    for (let day = 0; day < 3; day += 1) tick(world, context);
    expect(world.finance.postings.length).toBeGreaterThan(0);
    for (const posting of world.finance.postings) {
      let debits = 0;
      let credits = 0;
      for (const line of posting.lines) {
        if (line.side === "debit") debits += line.amountSUSD;
        else credits += line.amountSUSD;
      }
      expect(Math.abs(debits - credits)).toBeLessThanOrEqual(
        1e-6 * Math.max(1, debits, credits),
      );
    }
  });

  test("the audit buffer stays bounded and posting ids increase", () => {
    const scenario = marketScenario();
    const world = createEconomyWorld(scenario, { seed: 20_261_023 });
    const context = economyTickContext(scenario);
    for (let day = 0; day < 30; day += 1) tick(world, context);
    expect(world.finance.postings.length).toBeLessThanOrEqual(256);
    let previous = 0;
    for (const posting of world.finance.postings) {
      expect(posting.id).toBeGreaterThan(previous);
      previous = posting.id;
    }
    expect(world.finance.nextPostingId).toBeGreaterThan(previous);
  });

  test("derived account ids are unique and nextAccountId stays above every id", () => {
    const world = m3World().world;
    const ids = world.finance.accounts.map((account) => account.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(world.finance.nextAccountId).toBe(Math.max(...ids) + 1);
    const before = world.finance.nextAccountId;
    tick(world, economyTickContext(m3Scenario()));
    expect(world.finance.nextAccountId).toBe(before);
  });

  test("a rejected journal batch leaves balances, postings, and nextPostingId unchanged", () => {
    const world = m3World().world;
    const household = M3_HOUSEHOLD_ACCOUNT_IDS[0];
    const building = M3_BUILDING_ACCOUNT_FIRST_ID;
    const before = world.finance.accounts.map((account) => ({ ...account }));
    const postingCount = world.finance.postings.length;
    const nextPostingId = world.finance.nextPostingId;

    expect(() =>
      postJournalBatch(world.finance, 0, [
        {
          transactionKind: "goods-purchase",
          lines: [
            { accountId: building, side: "debit", amountSUSD: 1 },
            { accountId: household, side: "credit", amountSUSD: 1 },
          ],
        },
        {
          transactionKind: "goods-purchase",
          lines: [
            { accountId: building, side: "debit", amountSUSD: 1 },
            { accountId: household, side: "credit", amountSUSD: 0.5 },
          ],
        },
      ]),
    ).toThrow(/unbalanced/i);

    expect(world.finance.accounts).toEqual(before);
    expect(world.finance.postings).toHaveLength(postingCount);
    expect(world.finance.nextPostingId).toBe(nextPostingId);
  });
});

describe("M4a-1 owner-reference validation", () => {
  const buildingOwnedSubtypes = [
    "operating-cash",
    "owner-equity",
    "sales-revenue",
    "input-expense",
    "wage-expense",
    "upkeep-expense",
  ] as const;

  test("rejects every orphaned building-owned account subtype", () => {
    expect(() => assertValidWorld(m3World().world)).not.toThrow();
    for (const subtype of buildingOwnedSubtypes) {
      const world = m3World().world;
      const freeId = 4;
      expect(world.finance.accounts.some((account) => account.id === freeId)).toBe(false);
      expect(freeId).toBeLessThan(world.finance.nextAccountId);
      world.finance.accounts.push({
        id: freeId,
        ownerKind: "building",
        ownerId: 999,
        category: categoryForSubtype(subtype),
        subtype,
        balanceSUSD: 0,
      });
      expect(() => assertValidWorld(world)).toThrow(
        new RegExp(
          `building-owned ${subtype} account ${String(freeId)} references unknown building owner`,
          "i",
        ),
      );
    }
  });
});

describe("M4a-1 recognition preserves M3 cash behaviour", () => {
  test("a market sale recognizes expense and revenue without changing aggregate cash", () => {
    const { scenario, world } = createSettlementWorld({
      buildingIds: [],
      activeBuildingIds: [0, 7],
      lots: [{ goodId: GRAIN_ID, ownerBuildingId: 0, quantity: 10 }],
    });
    const cashBefore = totalCash(world);
    const sales = accountOf(world, "building", 0, "sales-revenue");
    const consumption = accountOf(world, "popBlock", 0, "consumption-expense");
    runSettlement(scenario, world, [household(0, 1, GRAIN_ID, 5)]);
    expect(totalCash(world)).toBeCloseTo(cashBefore, 9);
    expect(sales.balanceSUSD).toBeGreaterThan(0);
    expect(consumption.balanceSUSD).toBeCloseTo(sales.balanceSUSD, 9);
    expect(() => assertAccountingIdentity(world.finance)).not.toThrow();
  });

  test("wages recognize wage expense and household income without changing aggregate cash", () => {
    const { scenario, world } = createSettlementWorld({
      buildingIds: [0],
      activeBuildingIds: [0, 7],
      lots: [{ goodId: GRAIN_ID, ownerBuildingId: 0, quantity: 10 }],
    });
    const cashBefore = totalCash(world);
    const wageExpense = accountOf(world, "building", 0, "wage-expense");
    const income = accountOf(world, "popBlock", 0, "wage-income");
    const settlement = runSettlement(scenario, world);
    expect(settlement.settlement.totals.wagesPaidSUSD).toBeGreaterThan(0);
    expect(totalCash(world)).toBeCloseTo(cashBefore, 9);
    expect(wageExpense.balanceSUSD).toBeCloseTo(settlement.settlement.totals.wagesPaidSUSD, 9);
    expect(income.balanceSUSD).toBeCloseTo(settlement.settlement.totals.wagesPaidSUSD, 9);
  });

  test("upkeep recognizes operating expense and system income without changing aggregate cash", () => {
    const { scenario, world } = createSettlementWorld({
      buildingIds: [0],
      activeBuildingIds: [0, 7],
      lots: [{ goodId: GRAIN_ID, ownerBuildingId: 0, quantity: 10 }],
    });
    const cashBefore = totalCash(world);
    const upkeepExpense = accountOf(world, "building", 0, "upkeep-expense");
    const systemIncome = accountOf(world, "system", null, "system-income");
    const settlement = runSettlement(scenario, world);
    expect(settlement.settlement.totals.upkeepPaidSUSD).toBeGreaterThan(0);
    expect(totalCash(world)).toBeCloseTo(cashBefore, 9);
    const farmUpkeep = settlement.settlement.upkeep.find((entry) => entry.buildingId === 0);
    if (farmUpkeep === undefined) throw new Error("missing farm upkeep settlement");
    expect(upkeepExpense.balanceSUSD).toBeCloseTo(farmUpkeep.paidSUSD, 9);
    expect(systemIncome.balanceSUSD).toBeCloseTo(
      settlement.settlement.totals.upkeepPaidSUSD,
      9,
    );
  });

  test("producer cash reconciliation is unchanged by recognition legs", () => {
    const { scenario, world } = createSettlementWorld({
      buildingIds: [0, 4],
      activeBuildingIds: [0, 4, 7],
      lots: [{ goodId: GRAIN_ID, ownerBuildingId: 0, quantity: 10 }],
    });
    const settlement = runSettlement(scenario, world);
    for (const producer of settlement.settlement.producers) {
      const expected =
        producer.initialCashSUSD +
        producer.revenueSUSD -
        producer.inputCostsSUSD -
        producer.wagesPaidSUSD -
        producer.upkeepPaidSUSD;
      expect(producer.endingCashSUSD).toBeCloseTo(expected, 9);
    }
    expect(settlement.settlement.totals.endingCashSUSD).toBeCloseTo(
      settlement.settlement.totals.initialCashSUSD,
      9,
    );
  });
});

describe("M4a-1 persistence and compatibility", () => {
  test("save and load preserve accounts, categories, and the opening record", () => {
    const world = m3World().world;
    const restored = deserializeWorld(serializeWorld(world));
    expect(restored.finance.accounts).toEqual(world.finance.accounts);
    expect(restored.finance.opening).toEqual(world.finance.opening);
    expect(restored.finance.nextAccountId).toBe(world.finance.nextAccountId);
    expect(hashWorld(restored)).toBe(hashWorld(world));
  });

  test("cloneWorld copies accounts and the opening record without shared references", () => {
    const world = m3World().world;
    const clone = cloneWorld(world);
    expect(serializeWorld(clone)).toBe(serializeWorld(world));
    const original = serializeWorld(world);
    clone.finance.accounts[0]!.balanceSUSD += 1;
    if (clone.finance.opening === null) throw new Error("missing clone opening record");
    clone.finance.opening.checksum = "tampered";
    expect(serializeWorld(world)).toBe(original);
    expect(clone.finance.accounts[0]).not.toBe(world.finance.accounts[0]);
    expect(clone.finance.opening).not.toBe(world.finance.opening);
  });

  test("the M2-only population path keeps its accounts and creates no postings", () => {
    const { scenario, world } = aggregateWorld();
    expect(world.finance.accounts).toHaveLength(4);
    expect(world.finance.postings).toHaveLength(0);
    expect(world.finance.opening).not.toBeNull();
    const cashBefore = designatedCashTotal(world.finance);
    tick(world, contextFor(scenario, makeInputs([0])));
    expect(designatedCashTotal(world.finance)).toBe(cashBefore);
    expect(world.finance.postings).toHaveLength(0);
    expect(() => assertAccountingIdentity(world.finance)).not.toThrow();
  });

  test("an empty world stays valid with no accounts and no opening record", () => {
    const world = createInitialWorld({ seed: 1, scenarioId: "m4a1-empty" });
    expect(world.finance.opening).toBeNull();
    expect(() => assertValidWorld(world)).not.toThrow();
    tick(world);
    expect(() => assertValidWorld(world)).not.toThrow();
  });

  test("changing persisted finance state changes the world digest", () => {
    const first = m3World().world;
    const second = m3World().world;
    if (second.finance.opening === null) throw new Error("missing opening record");
    second.finance.opening.checksum = "different-checksum";
    expect(hashWorld(first)).not.toBe(hashWorld(second));
  });

  test("rejects an account whose category does not match its subtype", () => {
    const world = m3World().world;
    const account = world.finance.accounts[0];
    if (account === undefined) throw new Error("missing account");
    (account as unknown as { category: string }).category = "revenue";
    expect(() => assertValidWorld(world)).toThrow(/category|subtype/i);
  });
});
