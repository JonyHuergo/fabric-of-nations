import {
  CASH_NEUTRAL_TRANSACTION_KINDS,
  FLOW_TRANSACTION_KINDS,
  PUBLIC_TRANSACTION_KINDS,
  TRANSACTION_KINDS,
  accountingTotals,
  applyOpeningBalances,
  assertAccountingIdentity,
  assertValidJournalPosting,
  assertValidWorld,
  categoryForSubtype,
  civilDateToDayIndex,
  cloneWorld,
  closeFinancePeriod,
  createEconomyWorld,
  createInitialWorld,
  dayIndexToCivilDate,
  daysInMonth,
  designatedCashTotal,
  deserializeWorld,
  hashWorld,
  postCashTransfer,
  postJournalBatch,
  postJournalEntry,
  serializeWorld,
  tick,
  type AccountSubtype,
  type FinancePeriodSummary,
  type FinanceState,
  type FinancialAccount,
  type FinancialAccountOwnerKind,
  type JournalPosting,
  type PublicTransactionKind,
  type World,
} from "@century/sim";
import {
  economyTickContext,
  householdAccountId,
  setCashBalance,
} from "./fixtures/m3e.js";
import { marketScenario } from "./fixtures/m3d.js";
import { aggregateWorld, contextFor, makeInputs } from "./fixtures/m2.js";

const SEED = 20_261_023;
const FIRST_MONTH_END = civilDateToDayIndex(1900, 1, 31);
const SECOND_MONTH_END = civilDateToDayIndex(1900, 2, 28);

function accountOf(
  world: World,
  ownerKind: FinancialAccountOwnerKind,
  ownerId: number | null,
  subtype: AccountSubtype,
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

function accountById(world: World, accountId: number): FinancialAccount {
  const account = world.finance.accounts.find((candidate) => candidate.id === accountId);
  if (account === undefined) throw new Error(`missing account ${String(accountId)}`);
  return account;
}

function financeSnapshot(world: World): string {
  return JSON.stringify({
    accounts: world.finance.accounts,
    postings: world.finance.postings,
    nextPostingId: world.finance.nextPostingId,
    nextAccountId: world.finance.nextAccountId,
    opening: world.finance.opening,
    periodSummaries: world.finance.periodSummaries,
    closedThroughDay: world.finance.closedThroughDay,
  });
}

function manualFinance(
  entries: readonly {
    id: number;
    subtype: AccountSubtype;
    ownerKind?: FinancialAccountOwnerKind;
    ownerId?: number | null;
    balanceSUSD?: number;
  }[],
): FinanceState {
  return {
    accounts: entries.map((entry) => ({
      id: entry.id,
      ownerKind: entry.ownerKind ?? "popBlock",
      ownerId: entry.ownerId === undefined ? 0 : entry.ownerId,
      category: categoryForSubtype(entry.subtype),
      subtype: entry.subtype,
      balanceSUSD: entry.balanceSUSD ?? 0,
    })),
    postings: [],
    nextPostingId: 1,
    nextAccountId: entries.reduce((max, entry) => Math.max(max, entry.id), 0) + 1,
    opening: null,
    periodSummaries: [],
    annualSummaries: [],
    corrections: [],
    nextCorrectionId: 1,
    debtContracts: [],
    debtHistory: [],
    nextContractId: 1,
    welfareRequestedThisMonth: {},
    closedThroughDay: null,
  };
}

function periodClosePostings(world: World): JournalPosting[] {
  return world.finance.postings.filter((posting) => posting.transactionKind === "period-close");
}

function summaryTotal(summary: FinancePeriodSummary, accountId: number): number {
  return summary.accountTotals[accountId] ?? 0;
}

/**
 * Test-local re-implementation of the documented save integrity checksum
 * (canonical JSON + FNV-1a 32). It lets a test build a checksum-valid but
 * semantically invalid save envelope without widening the public API.
 */
function fnv1a32Hex(text: string): string {
  let hash = 0x811c_9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x0100_0193) >>> 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  if (typeof value === "number") return JSON.stringify(Object.is(value, -0) ? 0 : value);
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  throw new TypeError(`unsupported canonical JSON value: ${typeof value}`);
}

function saveChecksum(payload: unknown): string {
  return `fnv1a32:${fnv1a32Hex(canonicalJson(payload))}`;
}

const OWNER_KIND_RANK: Readonly<Record<FinancialAccountOwnerKind, number>> = {
  popBlock: 0,
  building: 1,
  country: 2,
  system: 3,
};

describe("M4b opening balances and the semantic posting matrix", () => {
  test("rejects nonzero opening revenue and expense balances without mutating state", () => {
    const revenueFinance = manualFinance([
      { id: 1, subtype: "household-cash" },
      { id: 2, subtype: "owner-equity" },
      { id: 3, subtype: "wage-income" },
    ]);
    const revenueBefore = revenueFinance.accounts.map((account) => ({ ...account }));
    expect(() =>
      applyOpeningBalances(revenueFinance, 0, [
        { accountId: 1, balanceSUSD: 50 },
        { accountId: 2, balanceSUSD: 40 },
        { accountId: 3, balanceSUSD: 10 },
      ]),
    ).toThrow(/revenue and expense accounts start at zero/i);
    expect(revenueFinance.accounts).toEqual(revenueBefore);
    expect(revenueFinance.opening).toBeNull();

    const expenseFinance = manualFinance([
      { id: 1, subtype: "household-cash" },
      { id: 2, subtype: "owner-equity" },
      { id: 3, subtype: "consumption-expense" },
    ]);
    const expenseBefore = expenseFinance.accounts.map((account) => ({ ...account }));
    expect(() =>
      applyOpeningBalances(expenseFinance, 0, [
        { accountId: 1, balanceSUSD: 8 },
        { accountId: 2, balanceSUSD: 20 },
        { accountId: 3, balanceSUSD: 12 },
      ]),
    ).toThrow(/revenue and expense accounts start at zero/i);
    expect(expenseFinance.accounts).toEqual(expenseBefore);
    expect(expenseFinance.opening).toBeNull();
  });

  test("zero-valued opening entries on revenue and expense accounts are allowed", () => {
    const finance = manualFinance([
      { id: 1, subtype: "household-cash" },
      { id: 2, subtype: "owner-equity" },
      { id: 3, subtype: "wage-income" },
      { id: 4, subtype: "consumption-expense" },
    ]);
    applyOpeningBalances(finance, 0, [
      { accountId: 1, balanceSUSD: 25 },
      { accountId: 2, balanceSUSD: 25 },
      { accountId: 3, balanceSUSD: 0 },
      { accountId: 4, balanceSUSD: 0 },
    ]);
    expect(finance.opening).not.toBeNull();
    expect(finance.accounts.find((account) => account.id === 3)?.balanceSUSD).toBe(0);
  });

  test("rejects invalid kind/subtype/side combinations for individual postings", () => {
    const world = createEconomyWorld(marketScenario(), { seed: SEED });
    const householdCash = accountOf(world, "popBlock", 0, "household-cash");
    const buildingCash = accountOf(world, "building", 0, "operating-cash");
    const consumption = accountOf(world, "popBlock", 0, "consumption-expense");
    const wageExpense = accountOf(world, "building", 0, "wage-expense");
    const sales = accountOf(world, "building", 0, "sales-revenue");
    const wageIncome = accountOf(world, "popBlock", 0, "wage-income");
    const equity = accountOf(world, "popBlock", 0, "owner-equity");
    const before = world.finance.accounts.map((account) => ({ ...account }));
    const postingCount = world.finance.postings.length;
    const nextPostingId = world.finance.nextPostingId;

    const expectMatrixRejection = (
      kind: PublicTransactionKind,
      lines: readonly {
        accountId: number;
        side: "debit" | "credit";
        amountSUSD: number;
      }[],
    ): void => {
      expect(() => postJournalEntry(world.finance, 0, kind, lines)).toThrow(
        /semantic matrix|may not/i,
      );
    };

    // goods-purchase may only debit consumption expense and credit sales revenue.
    expectMatrixRejection("goods-purchase", [
      { accountId: sales.id, side: "debit", amountSUSD: 5 },
      { accountId: householdCash.id, side: "credit", amountSUSD: 5 },
    ]);
    expectMatrixRejection("goods-purchase", [
      { accountId: wageExpense.id, side: "debit", amountSUSD: 5 },
      { accountId: householdCash.id, side: "credit", amountSUSD: 5 },
    ]);
    // input-purchase may only debit input expense.
    expectMatrixRejection("input-purchase", [
      { accountId: consumption.id, side: "debit", amountSUSD: 5 },
      { accountId: buildingCash.id, side: "credit", amountSUSD: 5 },
    ]);
    // wages may only debit wage expense and credit wage income.
    expectMatrixRejection("wages", [
      { accountId: wageExpense.id, side: "credit", amountSUSD: 5 },
      { accountId: wageIncome.id, side: "debit", amountSUSD: 5 },
    ]);
    // upkeep may only credit system income.
    expectMatrixRejection("upkeep", [
      { accountId: wageIncome.id, side: "credit", amountSUSD: 5 },
      { accountId: wageExpense.id, side: "debit", amountSUSD: 5 },
    ]);
    // Equity-transfer kinds may not post to revenue or expense accounts.
    expectMatrixRejection("owner-capital-injection", [
      { accountId: equity.id, side: "debit", amountSUSD: 5 },
      { accountId: wageIncome.id, side: "credit", amountSUSD: 5 },
    ]);
    expectMatrixRejection("profit-distribution", [
      { accountId: consumption.id, side: "credit", amountSUSD: 5 },
      { accountId: equity.id, side: "debit", amountSUSD: 5 },
    ]);

    expect(world.finance.accounts).toEqual(before);
    expect(world.finance.postings).toHaveLength(postingCount);
    expect(world.finance.nextPostingId).toBe(nextPostingId);
  });

  test("rejects an invalid batched posting atomically", () => {
    const world = createEconomyWorld(marketScenario(), { seed: SEED });
    const householdCash = accountOf(world, "popBlock", 0, "household-cash");
    const buildingCash = accountOf(world, "building", 0, "operating-cash");
    const consumption = accountOf(world, "popBlock", 0, "consumption-expense");
    const sales = accountOf(world, "building", 0, "sales-revenue");
    const wageIncome = accountOf(world, "popBlock", 0, "wage-income");
    const equity = accountOf(world, "popBlock", 0, "owner-equity");
    const before = world.finance.accounts.map((account) => ({ ...account }));
    const postingCount = world.finance.postings.length;
    const nextPostingId = world.finance.nextPostingId;

    expect(() =>
      postJournalBatch(world.finance, 0, [
        {
          transactionKind: "goods-purchase",
          lines: [
            { accountId: consumption.id, side: "debit", amountSUSD: 10 },
            { accountId: buildingCash.id, side: "debit", amountSUSD: 10 },
            { accountId: householdCash.id, side: "credit", amountSUSD: 10 },
            { accountId: sales.id, side: "credit", amountSUSD: 10 },
          ],
        },
        {
          transactionKind: "owner-capital-injection",
          lines: [
            { accountId: equity.id, side: "debit", amountSUSD: 1 },
            { accountId: wageIncome.id, side: "credit", amountSUSD: 1 },
          ],
        },
      ]),
    ).toThrow(/semantic matrix|may not/i);

    expect(world.finance.accounts).toEqual(before);
    expect(world.finance.postings).toHaveLength(postingCount);
    expect(world.finance.nextPostingId).toBe(nextPostingId);
  });

  test("valid production postings continue to reconcile under the matrix", () => {
    const world = createEconomyWorld(marketScenario(), { seed: SEED });
    const householdCash = accountOf(world, "popBlock", 0, "household-cash");
    const buildingCash = accountOf(world, "building", 0, "operating-cash");
    const consumption = accountOf(world, "popBlock", 0, "consumption-expense");
    const sales = accountOf(world, "building", 0, "sales-revenue");
    const cashBefore = designatedCashTotal(world.finance);

    postJournalEntry(world.finance, 0, "goods-purchase", [
      { accountId: consumption.id, side: "debit", amountSUSD: 10 },
      { accountId: buildingCash.id, side: "debit", amountSUSD: 10 },
      { accountId: householdCash.id, side: "credit", amountSUSD: 10 },
      { accountId: sales.id, side: "credit", amountSUSD: 10 },
    ]);
    expect(designatedCashTotal(world.finance)).toBeCloseTo(cashBefore, 9);
    expect(consumption.balanceSUSD).toBeCloseTo(10, 9);
    expect(sales.balanceSUSD).toBeCloseTo(10, 9);
    expect(() => assertAccountingIdentity(world.finance)).not.toThrow();
  });

  test("public posting APIs reject period-close at the runtime boundary", () => {
    const world = createEconomyWorld(marketScenario(), { seed: SEED });
    const householdCash = accountOf(world, "popBlock", 0, "household-cash");
    const buildingCash = accountOf(world, "building", 0, "operating-cash");
    const before = world.finance.accounts.map((account) => ({ ...account }));
    const postingCount = world.finance.postings.length;
    const internalKind = "period-close" as unknown as PublicTransactionKind;
    const lines = [
      { accountId: householdCash.id, side: "debit" as const, amountSUSD: 1 },
      { accountId: buildingCash.id, side: "credit" as const, amountSUSD: 1 },
    ];

    expect(() => postJournalEntry(world.finance, 0, internalKind, lines)).toThrow(
      /internal to the period-close helper/i,
    );
    expect(() => postJournalBatch(world.finance, 0, [{ transactionKind: internalKind, lines }])).toThrow(
      /internal to the period-close helper/i,
    );
    expect(() => postCashTransfer(world.finance, 0, internalKind, {
      fromAccountId: householdCash.id,
      toAccountId: buildingCash.id,
      amountSUSD: 1,
    })).toThrow(/internal to the period-close helper/i);
    expect(world.finance.accounts).toEqual(before);
    expect(world.finance.postings).toHaveLength(postingCount);

    expect(PUBLIC_TRANSACTION_KINDS).not.toContain("period-close");
    expect(TRANSACTION_KINDS).toContain("period-close");
    expect(CASH_NEUTRAL_TRANSACTION_KINDS).toContain("period-close");
    expect(FLOW_TRANSACTION_KINDS).not.toContain("period-close");
  });
});

function equityAccountOf(
  world: World,
  ownerKind: FinancialAccountOwnerKind,
  ownerId: number | null,
): FinancialAccount {
  return accountOf(world, ownerKind, ownerId, "owner-equity");
}

describe("M4b monthly periodic close", () => {
  test("closes at the first civil month-end after that day's activity, not before", () => {
    const scenario = marketScenario();
    const world = createEconomyWorld(scenario, { seed: SEED });
    const context = economyTickContext(scenario);
    let closeOnDay29: unknown = null;
    let closeOnDay30: unknown = null;
    for (let day = 0; day <= FIRST_MONTH_END; day += 1) {
      const result = tick(world, context);
      if (day === FIRST_MONTH_END - 1) closeOnDay29 = result.economy?.financeClose ?? null;
      if (day === FIRST_MONTH_END) closeOnDay30 = result.economy?.financeClose;
    }
    expect(closeOnDay29).toBeNull();
    expect(world.finance.periodSummaries).toHaveLength(1);
    expect(world.finance.closedThroughDay).toBe(FIRST_MONTH_END);
    expect(world.dayIndex).toBe(FIRST_MONTH_END + 1);
    expect(closeOnDay30).not.toBeNull();
    const summary = world.finance.periodSummaries[0];
    if (summary === undefined) throw new Error("missing first summary");
    expect(summary.periodStartDay).toBe(world.startDayIndex);
    expect(summary.periodEndDay).toBe(FIRST_MONTH_END);
    expect(dayIndexToCivilDate(summary.periodEndDay)).toEqual({ year: 1900, month: 1, day: 31 });
    expect(() => assertValidWorld(world)).not.toThrow();
  });

  test("summary capture matches settlement activity and pre-close accounts", () => {
    const scenario = marketScenario();
    const world = createEconomyWorld(scenario, { seed: SEED });
    world.dayIndex = FIRST_MONTH_END;
    const cashBefore = designatedCashTotal(world.finance);
    const postingsBefore = world.finance.postings.length;
    const result = tick(world, economyTickContext(scenario));
    const close = result.economy?.financeClose;
    if (close === null || close === undefined) throw new Error("missing close result");
    const settlement = result.economy?.settlement;
    if (settlement === undefined) throw new Error("missing settlement");
    const summary = close.summary;

    expect(summary.periodStartDay).toBe(0);
    expect(summary.periodEndDay).toBe(FIRST_MONTH_END);

    // Mapped gross period flows equal the settlement totals for the closed day.
    expect(summary.flowTotalsByKind["goods-purchase"]).toBeCloseTo(
      settlement.totals.householdPurchasesSUSD,
      9,
    );
    expect(summary.flowTotalsByKind["input-purchase"]).toBeCloseTo(
      settlement.totals.inputPurchasesSUSD,
      9,
    );
    expect(summary.flowTotalsByKind.wages).toBeCloseTo(settlement.totals.wagesPaidSUSD, 9);
    expect(summary.flowTotalsByKind.upkeep).toBeCloseTo(settlement.totals.upkeepPaidSUSD, 9);
    expect(Object.keys(summary.flowTotalsByKind).sort()).toEqual(
      [...FLOW_TRANSACTION_KINDS].sort(),
    );

    // Per-owner revenue/expense balances captured before the close.
    for (const producer of settlement.producers) {
      expect(summaryTotal(summary, accountOf(world, "building", producer.buildingId, "sales-revenue").id)).toBeCloseTo(
        producer.revenueSUSD,
        9,
      );
      expect(summaryTotal(summary, accountOf(world, "building", producer.buildingId, "input-expense").id)).toBeCloseTo(
        producer.inputCostsSUSD,
        9,
      );
      expect(summaryTotal(summary, accountOf(world, "building", producer.buildingId, "wage-expense").id)).toBeCloseTo(
        producer.wagesPaidSUSD,
        9,
      );
      expect(summaryTotal(summary, accountOf(world, "building", producer.buildingId, "upkeep-expense").id)).toBeCloseTo(
        producer.upkeepPaidSUSD,
        9,
      );
    }
    for (const household of settlement.households) {
      expect(
        summaryTotal(summary, accountOf(world, "popBlock", household.popBlockId, "consumption-expense").id),
      ).toBeCloseTo(household.marketPurchasesSUSD, 9);
      expect(
        summaryTotal(summary, accountOf(world, "popBlock", household.popBlockId, "wage-income").id),
      ).toBeCloseTo(household.wagesReceivedSUSD, 9);
    }
    expect(summaryTotal(summary, accountOf(world, "system", null, "system-income").id)).toBeCloseTo(
      settlement.totals.upkeepPaidSUSD,
      9,
    );

    // Opening balance-sheet balances remain in the pre-close trial balance. Cash
    // is not changed by a close, so its presence must match the live balance.
    for (const account of world.finance.accounts) {
      if (account.category !== "asset") continue;
      const total = summary.accountTotals[account.id];
      if (total === undefined) {
        expect(account.balanceSUSD).toBe(0);
      } else {
        expect(total).toBeCloseTo(account.balanceSUSD, 9);
        expect(account.balanceSUSD).not.toBe(0);
      }
    }
    // Equity was adjusted by the net period result, so the captured pre-close
    // equity equals the live equity minus that owner's net.
    for (const producer of settlement.producers) {
      const net =
        producer.revenueSUSD -
        producer.inputCostsSUSD -
        producer.wagesPaidSUSD -
        producer.upkeepPaidSUSD;
      expect(
        summaryTotal(summary, accountOf(world, "building", producer.buildingId, "owner-equity").id),
      ).toBeCloseTo(
        accountOf(world, "building", producer.buildingId, "owner-equity").balanceSUSD - net,
        9,
      );
    }
    for (const household of settlement.households) {
      const net = household.wagesReceivedSUSD - household.marketPurchasesSUSD;
      expect(
        summaryTotal(summary, accountOf(world, "popBlock", household.popBlockId, "owner-equity").id),
      ).toBeCloseTo(
        accountOf(world, "popBlock", household.popBlockId, "owner-equity").balanceSUSD - net,
        9,
      );
    }
    expect(summaryTotal(summary, accountOf(world, "system", null, "owner-equity").id)).toBeCloseTo(
      accountOf(world, "system", null, "owner-equity").balanceSUSD - settlement.totals.upkeepPaidSUSD,
      9,
    );
    for (const key of Object.keys(summary.accountTotals)) {
      expect(Number(key)).toBeGreaterThanOrEqual(0);
      expect(summary.accountTotals[Number(key)]).not.toBe(0);
    }

    // Closing entries zero revenue and expense exactly and never touch cash.
    for (const account of world.finance.accounts) {
      if (account.category === "revenue" || account.category === "expense") {
        expect(account.balanceSUSD).toBe(0);
      }
    }
    expect(designatedCashTotal(world.finance)).toBeCloseTo(cashBefore, 9);
    expect(() => assertAccountingIdentity(world.finance)).not.toThrow();
    const closePostings = periodClosePostings(world);
    expect(closePostings.length).toBe(close.postingIds.length);
    expect(closePostings.length).toBeGreaterThan(0);
    for (const posting of closePostings) {
      for (const line of posting.lines) {
        expect(accountById(world, line.accountId).category).not.toBe("asset");
        expect(accountById(world, line.accountId).category).not.toBe("liability");
      }
    }
    expect(world.finance.postings.length).toBeGreaterThan(postingsBefore);
  });

  test("closing entries use deterministic owner and account-id order", () => {
    const firstScenario = marketScenario();
    const secondScenario = marketScenario();
    const first = createEconomyWorld(firstScenario, { seed: SEED });
    const second = createEconomyWorld(secondScenario, { seed: SEED });
    first.dayIndex = FIRST_MONTH_END;
    second.dayIndex = FIRST_MONTH_END;
    tick(first, economyTickContext(firstScenario));
    tick(second, economyTickContext(secondScenario));

    const firstPostings = periodClosePostings(first);
    const secondPostings = periodClosePostings(second);
    expect(secondPostings).toEqual(firstPostings);
    expect(second.finance.periodSummaries).toEqual(first.finance.periodSummaries);

    let previousOwnerRank = -1;
    let previousOwnerId = -1;
    for (const posting of firstPostings) {
      const firstLine = posting.lines[0];
      if (firstLine === undefined) throw new Error("empty closing posting");
      const account = accountById(first, firstLine.accountId);
      const rank = OWNER_KIND_RANK[account.ownerKind];
      const ownerId = account.ownerId ?? -1;
      expect(rank >= previousOwnerRank).toBe(true);
      if (rank === previousOwnerRank) expect(ownerId).toBeGreaterThan(previousOwnerId);
      previousOwnerRank = rank;
      previousOwnerId = ownerId;

      const revenueExpenseAccounts = posting.lines
        .map((line) => accountById(first, line.accountId))
        .filter((candidate) => candidate.category === "revenue" || candidate.category === "expense");
      const ids = revenueExpenseAccounts.map((candidate) => candidate.id);
      expect(ids).toEqual([...ids].sort((left, right) => left - right));
      for (const candidate of posting.lines.map((line) => accountById(first, line.accountId))) {
        expect(candidate.ownerKind).toBe(account.ownerKind);
        expect(candidate.ownerId).toBe(account.ownerId);
      }
    }
  });

  test("a profitable owner credits equity and a loss-making owner debits it", () => {
    const scenario = marketScenario();
    const world = createEconomyWorld(scenario, { seed: SEED });
    const householdCash = accountOf(world, "popBlock", 0, "household-cash");
    const buildingCash = accountOf(world, "building", 0, "operating-cash");
    const consumption = accountOf(world, "popBlock", 0, "consumption-expense");
    const sales = accountOf(world, "building", 0, "sales-revenue");
    world.dayIndex = FIRST_MONTH_END;
    postJournalEntry(world.finance, FIRST_MONTH_END, "goods-purchase", [
      { accountId: consumption.id, side: "debit", amountSUSD: 12 },
      { accountId: buildingCash.id, side: "debit", amountSUSD: 12 },
      { accountId: householdCash.id, side: "credit", amountSUSD: 12 },
      { accountId: sales.id, side: "credit", amountSUSD: 12 },
    ]);
    const householdEquity = equityAccountOf(world, "popBlock", 0).balanceSUSD;
    const buildingEquity = equityAccountOf(world, "building", 0).balanceSUSD;
    const close = closeFinancePeriod(world);

    expect(equityAccountOf(world, "popBlock", 0).balanceSUSD).toBeCloseTo(householdEquity - 12, 9);
    expect(equityAccountOf(world, "building", 0).balanceSUSD).toBeCloseTo(buildingEquity + 12, 9);
    expect(close.summary.flowTotalsByKind["goods-purchase"]).toBeCloseTo(12, 9);
    expect(() => assertAccountingIdentity(world.finance)).not.toThrow();
  });

  test("a negative pre-close equity is corrected by the closing entry", () => {
    const scenario = marketScenario();
    const world = createEconomyWorld(scenario, { seed: SEED });
    const equity = equityAccountOf(world, "popBlock", 0);
    const revenue = accountOf(world, "popBlock", 0, "wage-income");
    const originalEquity = equity.balanceSUSD;
    const shift = equity.balanceSUSD + 100;
    equity.balanceSUSD = -100;
    revenue.balanceSUSD += shift;
    expect(equity.balanceSUSD).toBeLessThan(0);
    expect(() => assertValidWorld(world)).not.toThrow();

    world.dayIndex = FIRST_MONTH_END;
    const close = closeFinancePeriod(world);
    expect(close.summary.accountTotals[equity.id]).toBeCloseTo(-100, 9);
    expect(equityAccountOf(world, "popBlock", 0).balanceSUSD).toBeCloseTo(originalEquity, 9);
    expect(() => assertAccountingIdentity(world.finance)).not.toThrow();
  });

  test("a close with no balances still records an empty summary and advances the boundary", () => {
    const world = createInitialWorld({ seed: 1, scenarioId: "m4b-empty-close" });
    world.dayIndex = FIRST_MONTH_END;
    const result = closeFinancePeriod(world);
    expect(result.postingIds).toEqual([]);
    expect(result.summary.periodStartDay).toBe(0);
    expect(result.summary.periodEndDay).toBe(FIRST_MONTH_END);
    expect(result.summary.accountTotals).toEqual({});
    for (const kind of FLOW_TRANSACTION_KINDS) expect(result.summary.flowTotalsByKind[kind]).toBe(0);
    expect(world.finance.closedThroughDay).toBe(FIRST_MONTH_END);
    expect(world.finance.periodSummaries).toHaveLength(1);
    expect(() => assertValidWorld(world)).toThrow(/published state/i);
    world.dayIndex = FIRST_MONTH_END + 1;
    expect(() => assertValidWorld(world)).not.toThrow();
  });

  test("rejects duplicate and out-of-order closes without mutating state", () => {
    const fresh = createEconomyWorld(marketScenario(), { seed: SEED });
    fresh.dayIndex = FIRST_MONTH_END - 1;
    const freshSnapshot = financeSnapshot(fresh);
    expect(() => closeFinancePeriod(fresh)).toThrow(/month-end/i);
    expect(financeSnapshot(fresh)).toBe(freshSnapshot);

    const world = createEconomyWorld(marketScenario(), { seed: SEED });
    world.dayIndex = FIRST_MONTH_END;
    closeFinancePeriod(world);
    const afterFirst = financeSnapshot(world);
    expect(() => closeFinancePeriod(world)).toThrow(/duplicate or out-of-order/i);
    expect(financeSnapshot(world)).toBe(afterFirst);
  });

  test("rejects a gapped missing month-end instead of merging periods", () => {
    const world = createEconomyWorld(marketScenario(), { seed: SEED });
    world.dayIndex = FIRST_MONTH_END;
    closeFinancePeriod(world);
    const afterFirst = financeSnapshot(world);
    world.dayIndex = civilDateToDayIndex(1900, 3, 31);
    expect(() => closeFinancePeriod(world)).toThrow(/gapped|next period/i);
    expect(financeSnapshot(world)).toBe(afterFirst);
    expect(world.finance.periodSummaries).toHaveLength(1);
  });

  test("rolls the staged close back when the internal posting batch fails", () => {
    const world = createEconomyWorld(marketScenario(), { seed: SEED });
    const householdCash = accountOf(world, "popBlock", 0, "household-cash");
    const buildingCash = accountOf(world, "building", 0, "operating-cash");
    const consumption = accountOf(world, "popBlock", 0, "consumption-expense");
    const sales = accountOf(world, "building", 0, "sales-revenue");
    world.dayIndex = FIRST_MONTH_END;
    postJournalEntry(world.finance, FIRST_MONTH_END, "goods-purchase", [
      { accountId: consumption.id, side: "debit", amountSUSD: 7 },
      { accountId: buildingCash.id, side: "debit", amountSUSD: 7 },
      { accountId: householdCash.id, side: "credit", amountSUSD: 7 },
      { accountId: sales.id, side: "credit", amountSUSD: 7 },
    ]);
    world.finance.nextPostingId = Number.MAX_SAFE_INTEGER;
    const snapshot = financeSnapshot(world);
    const serialized = serializeWorld(world);
    expect(() => closeFinancePeriod(world)).toThrow(/posting id overflow/i);
    expect(financeSnapshot(world)).toBe(snapshot);
    expect(serializeWorld(world)).toBe(serialized);
    expect(world.finance.periodSummaries).toHaveLength(0);
    expect(world.finance.closedThroughDay).toBeNull();
  });

  test("missing owner equity fails safely, including the system owner without a reserve", () => {
    const scenario = marketScenario();
    const world = createEconomyWorld(scenario, { seed: SEED });
    world.dayIndex = FIRST_MONTH_END;
    world.finance.accounts = world.finance.accounts.filter(
      (account) =>
        !(
          account.ownerKind === "system" &&
          (account.subtype === "system-reserve-cash" || account.subtype === "owner-equity")
        ),
    );
    expect(
      world.finance.accounts.some(
        (account) => account.ownerKind === "system" && account.subtype === "system-income",
      ),
    ).toBe(true);
    const snapshot = financeSnapshot(world);
    expect(() => closeFinancePeriod(world)).toThrow(
      /system owner has revenue or expense accounts but no owner-equity/i,
    );
    expect(financeSnapshot(world)).toBe(snapshot);
    expect(() => assertValidWorld(world)).toThrow(/owner-equity/i);
    expect(() => tick(world, economyTickContext(scenario))).toThrow(/owner-equity/i);
  });

  test("a popBlock without an equity account also fails before mutation", () => {
    const scenario = marketScenario();
    const world = createEconomyWorld(scenario, { seed: SEED });
    world.dayIndex = FIRST_MONTH_END;
    setCashBalance(world, householdAccountId(world, 0), 0);
    world.finance.accounts = world.finance.accounts.filter(
      (account) =>
        !(account.ownerKind === "popBlock" && account.ownerId === 0 && account.subtype === "owner-equity"),
    );
    const snapshot = financeSnapshot(world);
    expect(() => closeFinancePeriod(world)).toThrow(/popBlock owner 0 .* no owner-equity/i);
    expect(financeSnapshot(world)).toBe(snapshot);
  });

  test("the last possible period ends 1999-12-31 and publishes at the terminal boundary", () => {
    const scenario = marketScenario();
    const lastDay = civilDateToDayIndex(1999, 12, 31);
    const world = createEconomyWorld(scenario, { seed: SEED, startDayIndex: lastDay });
    const result = tick(world, economyTickContext(scenario));
    expect(result.advanced).toBe(true);
    expect(result.dayIndex).toBe(36_524);
    expect(world.dayIndex).toBe(36_524);
    const close = result.economy?.financeClose;
    if (close === null || close === undefined) throw new Error("missing final close");
    expect(close.summary.periodStartDay).toBe(lastDay);
    expect(close.summary.periodEndDay).toBe(lastDay);
    expect(world.finance.closedThroughDay).toBe(lastDay);
    expect(() => assertValidWorld(world)).not.toThrow();
    expect(() => serializeWorld(world)).not.toThrow();
    expect(tick(world, economyTickContext(scenario)).advanced).toBe(false);
  });

  test("M2-only worlds never close and create no summaries", () => {
    const { scenario, world } = aggregateWorld();
    world.dayIndex = FIRST_MONTH_END;
    const result = tick(
      world,
      contextFor(
        scenario,
        makeInputs(world.popBlocks.map((block) => block.id)),
      ),
    );
    expect(result.economy).toBeUndefined();
    expect(world.finance.periodSummaries).toHaveLength(0);
    expect(world.finance.closedThroughDay).toBeNull();
    expect(() => assertValidWorld(world)).not.toThrow();
  });

  test("the terminal boundary is never closed", () => {
    const scenario = marketScenario();
    const world = createEconomyWorld(scenario, { seed: SEED });
    world.dayIndex = 36_524;
    expect(() => closeFinancePeriod(world)).toThrow(/terminal/i);
    const result = tick(world, economyTickContext(scenario));
    expect(result.advanced).toBe(false);
    expect(world.finance.periodSummaries).toHaveLength(0);
  });

  test("a partial first period and leap-year month-end close correctly", () => {
    const scenario = marketScenario();
    const start = civilDateToDayIndex(1904, 2, 1);
    const leapEnd = civilDateToDayIndex(1904, 2, 29);
    const world = createEconomyWorld(scenario, { seed: SEED, startDayIndex: start });
    world.dayIndex = leapEnd;
    const result = tick(world, economyTickContext(scenario));
    const close = result.economy?.financeClose;
    if (close === null || close === undefined) throw new Error("missing leap-year close");
    expect(close.summary.periodStartDay).toBe(start);
    expect(close.summary.periodEndDay).toBe(leapEnd);
    expect(dayIndexToCivilDate(close.summary.periodEndDay)).toEqual({
      year: 1904,
      month: 2,
      day: 29,
    });
    expect(daysInMonth(1904, 2)).toBe(29);
    expect(world.finance.closedThroughDay).toBe(leapEnd);
    expect(() => assertValidWorld(world)).not.toThrow();
  });

  test("two consecutive month-end closes stay contiguous and preserve earlier summaries", () => {
    const scenario = marketScenario();
    const world = createEconomyWorld(scenario, { seed: SEED });
    const context = economyTickContext(scenario);
    for (let day = 0; day <= SECOND_MONTH_END; day += 1) tick(world, context);
    expect(world.finance.periodSummaries).toHaveLength(2);
    const first = world.finance.periodSummaries[0];
    const second = world.finance.periodSummaries[1];
    if (first === undefined || second === undefined) throw new Error("missing summaries");
    const firstCopy = JSON.parse(JSON.stringify(first)) as FinancePeriodSummary;
    expect(first.periodStartDay).toBe(0);
    expect(first.periodEndDay).toBe(FIRST_MONTH_END);
    expect(second.periodStartDay).toBe(FIRST_MONTH_END + 1);
    expect(second.periodEndDay).toBe(SECOND_MONTH_END);
    expect(world.finance.closedThroughDay).toBe(SECOND_MONTH_END);

    // Later closes append; they never rewrite an existing summary.
    for (let day = SECOND_MONTH_END + 1; day <= civilDateToDayIndex(1900, 3, 31); day += 1) {
      tick(world, context);
    }
    expect(world.finance.periodSummaries).toHaveLength(3);
    expect(world.finance.periodSummaries[0]).toEqual(firstCopy);
  });

  test("staged close states are rejected until the day advances", () => {
    const world = createEconomyWorld(marketScenario(), { seed: SEED });
    world.dayIndex = FIRST_MONTH_END;
    const close = closeFinancePeriod(world);
    expect(world.finance.closedThroughDay).toBe(world.dayIndex);
    expect(close.summary.periodEndDay).toBe(world.dayIndex);

    expect(() => assertValidWorld(world)).toThrow(/published state/i);
    expect(() => serializeWorld(world)).toThrow(/published state/i);
    expect(() => hashWorld(world)).toThrow(/published state/i);

    world.dayIndex += 1;
    expect(() => assertValidWorld(world)).not.toThrow();
    expect(() => serializeWorld(world)).not.toThrow();
    expect(hashWorld(world)).toMatch(/^[0-9a-f]{16}$/);
  });

  test("closing is deterministic across repeated runs and preserves the accounting identity", () => {
    const firstScenario = marketScenario();
    const secondScenario = marketScenario();
    const first = createEconomyWorld(firstScenario, { seed: SEED });
    const second = createEconomyWorld(secondScenario, { seed: SEED });
    const firstContext = economyTickContext(firstScenario);
    const secondContext = economyTickContext(secondScenario);
    const cashBefore = designatedCashTotal(first.finance);
    for (let day = 0; day <= SECOND_MONTH_END; day += 1) {
      tick(first, firstContext);
      tick(second, secondContext);
      assertAccountingIdentity(first.finance);
      assertAccountingIdentity(second.finance);
    }
    expect(hashWorld(second)).toBe(hashWorld(first));
    expect(second.finance.periodSummaries).toEqual(first.finance.periodSummaries);
    expect(periodClosePostings(second)).toEqual(periodClosePostings(first));
    expect(designatedCashTotal(first.finance)).toBeCloseTo(cashBefore, 9);
  });
});

describe("M4b finance summary persistence and validation", () => {
  function closedWorld(): World {
    const scenario = marketScenario();
    const world = createEconomyWorld(scenario, { seed: SEED });
    for (let day = 0; day <= FIRST_MONTH_END; day += 1) {
      tick(world, economyTickContext(scenario));
    }
    return world;
  }

  test("clone, serialize, deserialize, and hash include summaries and the close boundary", () => {
    const world = closedWorld();
    const clone = cloneWorld(world);
    expect(clone.finance.periodSummaries).toEqual(world.finance.periodSummaries);
    expect(clone.finance.closedThroughDay).toBe(world.finance.closedThroughDay);
    expect(serializeWorld(clone)).toBe(serializeWorld(world));
    expect(hashWorld(clone)).toBe(hashWorld(world));

    const restored = deserializeWorld(serializeWorld(world));
    expect(restored.finance.periodSummaries).toEqual(world.finance.periodSummaries);
    expect(restored.finance.closedThroughDay).toBe(world.finance.closedThroughDay);
    expect(hashWorld(restored)).toBe(hashWorld(world));

    const summary = clone.finance.periodSummaries[0];
    if (summary === undefined) throw new Error("missing clone summary");
    summary.periodEndDay = 1;
    summary.flowTotalsByKind.wages = 123;
    expect(clone.finance.periodSummaries[0]).not.toBe(world.finance.periodSummaries[0]);
    expect(world.finance.periodSummaries[0]?.periodEndDay).toBe(FIRST_MONTH_END);
    expect(world.finance.periodSummaries[0]?.flowTotalsByKind.wages).not.toBe(123);

    const tampered = closedWorld();
    const tamperedSummary = tampered.finance.periodSummaries[0];
    if (tamperedSummary === undefined) throw new Error("missing tampered summary");
    const cashAccount = accountOf(tampered, "popBlock", 0, "household-cash");
    const equityAccount = accountOf(tampered, "popBlock", 0, "owner-equity");
    tamperedSummary.accountTotals[cashAccount.id] =
      (tamperedSummary.accountTotals[cashAccount.id] ?? 0) + 1;
    tamperedSummary.accountTotals[equityAccount.id] =
      (tamperedSummary.accountTotals[equityAccount.id] ?? 0) + 1;
    expect(hashWorld(tampered)).not.toBe(hashWorld(world));
    expect(() => assertValidWorld(tampered)).not.toThrow();
  });

  test("rejects malformed persisted summaries", () => {
    const base = closedWorld();
    const change = (mutate: (summary: FinancePeriodSummary, world: World) => void): World => {
      const world = cloneWorld(base);
      const summary = world.finance.periodSummaries[0];
      if (summary === undefined) throw new Error("missing summary");
      mutate(summary, world);
      return world;
    };

    expect(() =>
      assertValidWorld(change((summary) => {
        summary.periodEndDay = FIRST_MONTH_END - 1;
      })),
    ).toThrow(/month-end/i);

    expect(() =>
      assertValidWorld(change((summary) => {
        summary.periodStartDay = 1;
      })),
    ).toThrow(/startDayIndex/i);

    expect(() =>
      assertValidWorld(change((summary) => {
        summary.flowTotalsByKind.wages = -1;
      })),
    ).toThrow(/nonnegative/i);

    expect(() =>
      assertValidWorld(change((summary, world) => {
        const cash = accountOf(world, "popBlock", 0, "household-cash");
        summary.accountTotals[cash.id] = 0;
      })),
    ).toThrow(/omitted when zero/i);

    expect(() =>
      assertValidWorld(change((summary) => {
        summary.accountTotals[400] = 5;
      })),
    ).toThrow(/unknown account/i);

    expect(() =>
      assertValidWorld(change((summary) => {
        summary.accountTotals = {};
      })),
    ).toThrow(/mapped expense total/i);

    expect(() =>
      assertValidWorld(change((summary) => {
        summary.flowTotalsByKind.wages += 5;
      })),
    ).toThrow(/mapped expense total/i);

    const missingFlow = cloneWorld(base);
    const missingSummary = missingFlow.finance.periodSummaries[0];
    if (missingSummary === undefined) throw new Error("missing summary");
    delete (missingSummary.flowTotalsByKind as Partial<FinancePeriodSummary["flowTotalsByKind"]>).wages;
    expect(() => assertValidWorld(missingFlow)).toThrow(/four current flow kinds/i);

    const beyond = cloneWorld(base);
    const beyondSummary = beyond.finance.periodSummaries[0];
    if (beyondSummary === undefined) throw new Error("missing summary");
    beyondSummary.periodEndDay = SECOND_MONTH_END;
    beyond.finance.closedThroughDay = SECOND_MONTH_END;
    expect(() => assertValidWorld(beyond)).toThrow(/must not extend beyond the current day/i);

    const inconsistent = cloneWorld(base);
    inconsistent.finance.closedThroughDay = FIRST_MONTH_END - 1;
    expect(() => assertValidWorld(inconsistent)).toThrow(/last period end/i);

    const orphanSummary = cloneWorld(base);
    orphanSummary.finance.periodSummaries = [];
    expect(() => assertValidWorld(orphanSummary)).toThrow(/closedThroughDay must be null exactly/i);

    expect(() =>
      assertValidWorld(change((summary, world) => {
        const cash = accountOf(world, "popBlock", 0, "household-cash");
        summary.accountTotals[cash.id] = (summary.accountTotals[cash.id] ?? 0) + 1;
      })),
    ).toThrow(/accounting identity/i);
  });

  test("persisted period-close postings receive structural validation", () => {
    const world = closedWorld();
    const postings = periodClosePostings(world);
    expect(postings.length).toBeGreaterThan(0);
    const accounts = new Map(world.finance.accounts.map((account) => [account.id, account]));
    for (const posting of postings) {
      expect(() => assertValidJournalPosting(posting, accounts)).not.toThrow();
    }

    const profitable = postings.find((posting) =>
      posting.lines.some(
        (line) => accounts.get(line.accountId)?.category === "equity" && line.side === "credit",
      ),
    );
    if (profitable === undefined) throw new Error("missing profitable closing entry");
    const equityLine = profitable.lines.find(
      (line) => accounts.get(line.accountId)?.category === "equity",
    );
    if (equityLine === undefined) throw new Error("missing equity line");

    const flipped: JournalPosting = {
      ...profitable,
      lines: profitable.lines.map((line) =>
        line === equityLine ? { ...line, side: "debit" as const } : { ...line },
      ),
    };
    expect(() => assertValidJournalPosting(flipped, accounts)).toThrow(/unbalanced/i);

    const wrongAmount: JournalPosting = {
      ...profitable,
      lines: profitable.lines.map((line) =>
        line === equityLine ? { ...line, amountSUSD: line.amountSUSD + 1 } : { ...line },
      ),
    };
    expect(() => assertValidJournalPosting(wrongAmount, accounts)).toThrow(/unbalanced/i);

    const revenueLine = profitable.lines.find(
      (line) => accounts.get(line.accountId)?.category === "revenue",
    );
    if (revenueLine === undefined) throw new Error("missing revenue line");
    const reversed: JournalPosting = {
      ...profitable,
      lines: profitable.lines.map((line) =>
        line === revenueLine ? { ...line, side: "credit" as const } : { ...line },
      ),
    };
    expect(() => assertValidJournalPosting(reversed, accounts)).toThrow(/period-close may only debit/i);

    const unbalanced: JournalPosting = {
      ...profitable,
      lines: profitable.lines.map((line) =>
        line === revenueLine ? { ...line, amountSUSD: line.amountSUSD + 1 } : { ...line },
      ),
    };
    expect(() => assertValidJournalPosting(unbalanced, accounts)).toThrow(/unbalanced/i);

    const cashLine = accountOf(world, "popBlock", 0, "household-cash");
    const withCash: JournalPosting = {
      ...profitable,
      lines: [
        ...profitable.lines.map((line) => ({ ...line })),
        { accountId: cashLine.id, side: "debit", amountSUSD: 1 },
        { accountId: cashLine.id, side: "credit", amountSUSD: 1 },
      ],
    };
    expect(() => assertValidJournalPosting(withCash, accounts)).toThrow(/cash/i);
  });

  test("rejects non-close line categories and a zero-net equity line structurally", () => {
    const revenue: FinancialAccount = {
      id: 1,
      ownerKind: "popBlock",
      ownerId: 0,
      category: "revenue",
      subtype: "wage-income",
      balanceSUSD: 0,
    };
    const expense: FinancialAccount = {
      id: 2,
      ownerKind: "popBlock",
      ownerId: 0,
      category: "expense",
      subtype: "wage-expense",
      balanceSUSD: 0,
    };
    const equity: FinancialAccount = {
      id: 3,
      ownerKind: "popBlock",
      ownerId: 0,
      category: "equity",
      subtype: "owner-equity",
      balanceSUSD: 0,
    };
    const liability: FinancialAccount = {
      id: 4,
      ownerKind: "popBlock",
      ownerId: 0,
      category: "liability",
      subtype: "owner-equity",
      balanceSUSD: 0,
    };
    const accounts = new Map<number, FinancialAccount>([
      [revenue.id, revenue],
      [expense.id, expense],
      [equity.id, equity],
      [liability.id, liability],
    ]);
    const posting = (lines: JournalPosting["lines"]): JournalPosting => ({
      id: 1,
      dayIndex: FIRST_MONTH_END,
      transactionKind: "period-close",
      lines,
      sourceEntityId: null,
      targetEntityId: null,
    });

    expect(() =>
      assertValidJournalPosting(
        posting([
          { accountId: revenue.id, side: "debit", amountSUSD: 10 },
          { accountId: expense.id, side: "credit", amountSUSD: 10 },
        ]),
        accounts,
      ),
    ).not.toThrow();

    expect(() =>
      assertValidJournalPosting(
        posting([
          { accountId: revenue.id, side: "debit", amountSUSD: 10 },
          { accountId: expense.id, side: "credit", amountSUSD: 10 },
          { accountId: equity.id, side: "credit", amountSUSD: 1 },
          { accountId: equity.id, side: "debit", amountSUSD: 1 },
        ]),
        accounts,
      ),
    ).toThrow(/zero net|equity/i);

    expect(() =>
      assertValidJournalPosting(
        posting([
          { accountId: revenue.id, side: "debit", amountSUSD: 10 },
          { accountId: expense.id, side: "credit", amountSUSD: 10 },
          { accountId: liability.id, side: "credit", amountSUSD: 3 },
          { accountId: equity.id, side: "debit", amountSUSD: 3 },
        ]),
        accounts,
      ),
    ).toThrow(/may only reference/i);

    expect(() =>
      assertValidJournalPosting(
        posting([
          { accountId: revenue.id, side: "debit", amountSUSD: 10 },
          { accountId: expense.id, side: "credit", amountSUSD: 4 },
          { accountId: equity.id, side: "credit", amountSUSD: 5 },
          { accountId: equity.id, side: "credit", amountSUSD: 1 },
        ]),
        accounts,
      ),
    ).toThrow(/exactly one equity net line/i);

    expect(() =>
      assertValidJournalPosting(
        posting([
          { accountId: revenue.id, side: "debit", amountSUSD: 10 },
          { accountId: expense.id, side: "credit", amountSUSD: 4 },
          { accountId: equity.id, side: "credit", amountSUSD: 6 },
        ]),
        accounts,
      ),
    ).not.toThrow();

    // A balanced posting whose equity allocation disagrees with the net is
    // impossible with one equity line, so require exactly one net line.
    expect(() =>
      assertValidJournalPosting(
        posting([
          { accountId: revenue.id, side: "debit", amountSUSD: 10 },
          { accountId: expense.id, side: "credit", amountSUSD: 4 },
          { accountId: equity.id, side: "credit", amountSUSD: 5 },
        ]),
        accounts,
      ),
    ).toThrow(/unbalanced/i);
  });

  test("rejects schema-7 and simulation-0.7.0 saves with an actionable error", () => {
    const serialized = serializeWorld(closedWorld());

    const oldSchema = JSON.parse(serialized) as { schemaVersion?: unknown };
    oldSchema.schemaVersion = 7;
    expect(() => deserializeWorld(JSON.stringify(oldSchema))).toThrow(/schema 7/i);

    const oldSim = JSON.parse(serialized) as { simVersion?: unknown };
    oldSim.simVersion = "0.7.0";
    expect(() => deserializeWorld(JSON.stringify(oldSim))).toThrow(/simulation version/i);

    const stagedSave = JSON.parse(serialized) as {
      dayIndex?: unknown;
      checksum?: unknown;
      payload?: {
        dayIndex?: unknown;
        finance?: { closedThroughDay?: unknown };
      };
    };
    const stagedPayload = stagedSave.payload;
    if (stagedPayload === undefined || stagedPayload.finance === undefined) {
      throw new Error("missing finance payload");
    }
    // Recreate an unadvanced staged close: the period ends on the current day.
    stagedPayload.dayIndex = FIRST_MONTH_END;
    stagedPayload.finance.closedThroughDay = FIRST_MONTH_END;
    stagedSave.dayIndex = FIRST_MONTH_END;
    stagedSave.checksum = saveChecksum(stagedPayload);
    expect(() => deserializeWorld(JSON.stringify(stagedSave))).toThrow(/published state/i);
  });

  test("summary history is immutable across later days", () => {
    const world = closedWorld();
    const summary = world.finance.periodSummaries[0];
    if (summary === undefined) throw new Error("missing summary");
    const before = JSON.stringify(summary);
    const scenario = marketScenario();
    for (let day = 0; day < 5; day += 1) tick(world, economyTickContext(scenario));
    expect(JSON.stringify(world.finance.periodSummaries[0])).toBe(before);
    expect(accountingTotals(world.finance).revenues).toBeGreaterThan(0);
    expect(summaryTotal(summary, accountOf(world, "building", 0, "sales-revenue").id)).toBeGreaterThan(0);
  });
});
