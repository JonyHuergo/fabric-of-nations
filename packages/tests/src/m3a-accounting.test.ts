import {
  MONEY_TOLERANCE_SUSD,
  postCashTransfer,
  postJournalEntry,
  type FinanceState,
  type JournalLine,
  type PublicTransactionKind,
} from "@century/sim";
import {
  M3_BUILDING_ACCOUNT_FIRST_ID,
  M3_HOUSEHOLD_ACCOUNT_IDS,
  M3_SYSTEM_ACCOUNT_ID,
  m3World,
  totalCash,
} from "./fixtures/m3a.js";

const HOUSEHOLD = M3_HOUSEHOLD_ACCOUNT_IDS[0];
const OTHER_HOUSEHOLD = M3_HOUSEHOLD_ACCOUNT_IDS[1];
const SELLER_BUILDING = M3_BUILDING_ACCOUNT_FIRST_ID;
const BUYER_BUILDING = M3_BUILDING_ACCOUNT_FIRST_ID + 1;

function financeOf(): FinanceState {
  return m3World().world.finance;
}

function transfer(
  finance: FinanceState,
  kind: PublicTransactionKind,
  from: number,
  to: number,
  amount: number,
): void {
  postCashTransfer(finance, 0, kind, {
    fromAccountId: from,
    toAccountId: to,
    amountSUSD: amount,
  });
}

describe("M3a minimal cash ledger", () => {
  test("goods purchase debits the receiving seller and credits the paying household", () => {
    const finance = financeOf();
    const beforeSeller = balanceOf(finance, SELLER_BUILDING);
    const beforeHousehold = balanceOf(finance, HOUSEHOLD);
    transfer(finance, "goods-purchase", HOUSEHOLD, SELLER_BUILDING, 20);

    expect(balanceOf(finance, SELLER_BUILDING)).toBeCloseTo(beforeSeller + 20, 9);
    expect(balanceOf(finance, HOUSEHOLD)).toBeCloseTo(beforeHousehold - 20, 9);
    expect(finance.postings).toHaveLength(1);
    expect(finance.postings[0]?.transactionKind).toBe("goods-purchase");
    expect(finance.postings[0]?.lines).toEqual([
      { accountId: SELLER_BUILDING, side: "debit", amountSUSD: 20 },
      { accountId: HOUSEHOLD, side: "credit", amountSUSD: 20 },
    ]);
  });

  test("input purchase debits the seller and credits the buying building", () => {
    const finance = financeOf();
    const beforeSeller = balanceOf(finance, SELLER_BUILDING);
    const beforeBuyer = balanceOf(finance, BUYER_BUILDING);
    transfer(finance, "input-purchase", BUYER_BUILDING, SELLER_BUILDING, 10);

    expect(balanceOf(finance, SELLER_BUILDING)).toBeCloseTo(beforeSeller + 10, 9);
    expect(balanceOf(finance, BUYER_BUILDING)).toBeCloseTo(beforeBuyer - 10, 9);
  });

  test("wages debit the receiving household and credit the paying building", () => {
    const finance = financeOf();
    const beforeBuilding = balanceOf(finance, SELLER_BUILDING);
    const beforeHousehold = balanceOf(finance, HOUSEHOLD);
    transfer(finance, "wages", SELLER_BUILDING, HOUSEHOLD, 15);

    expect(balanceOf(finance, HOUSEHOLD)).toBeCloseTo(beforeHousehold + 15, 9);
    expect(balanceOf(finance, SELLER_BUILDING)).toBeCloseTo(beforeBuilding - 15, 9);
  });

  test("upkeep debits the system reserve and credits the building", () => {
    const finance = financeOf();
    const beforeBuilding = balanceOf(finance, SELLER_BUILDING);
    const beforeSystem = balanceOf(finance, M3_SYSTEM_ACCOUNT_ID);
    transfer(finance, "upkeep", SELLER_BUILDING, M3_SYSTEM_ACCOUNT_ID, 3);

    expect(balanceOf(finance, M3_SYSTEM_ACCOUNT_ID)).toBeCloseTo(beforeSystem + 3, 9);
    expect(balanceOf(finance, SELLER_BUILDING)).toBeCloseTo(beforeBuilding - 3, 9);
  });

  test("profit distribution debits the owner household and credits the building", () => {
    const finance = financeOf();
    const beforeBuilding = balanceOf(finance, SELLER_BUILDING);
    const beforeOwner = balanceOf(finance, HOUSEHOLD);
    transfer(finance, "profit-distribution", SELLER_BUILDING, HOUSEHOLD, 7);

    expect(balanceOf(finance, HOUSEHOLD)).toBeCloseTo(beforeOwner + 7, 9);
    expect(balanceOf(finance, SELLER_BUILDING)).toBeCloseTo(beforeBuilding - 7, 9);
  });

  test("owner capital injection debits the receiving building and credits the owner", () => {
    const finance = financeOf();
    const beforeBuilding = balanceOf(finance, SELLER_BUILDING);
    const beforeOwner = balanceOf(finance, HOUSEHOLD);
    transfer(finance, "owner-capital-injection", HOUSEHOLD, SELLER_BUILDING, 12);

    expect(balanceOf(finance, SELLER_BUILDING)).toBeCloseTo(beforeBuilding + 12, 9);
    expect(balanceOf(finance, HOUSEHOLD)).toBeCloseTo(beforeOwner - 12, 9);
  });

  test("every transfer preserves total cash and balances exactly", () => {
    const world = m3World().world;
    const before = totalCash(world);
    postCashTransfer(world.finance, 0, "goods-purchase", {
      fromAccountId: HOUSEHOLD,
      toAccountId: SELLER_BUILDING,
      amountSUSD: 5,
    });
    postCashTransfer(world.finance, 1, "wages", {
      fromAccountId: SELLER_BUILDING,
      toAccountId: OTHER_HOUSEHOLD,
      amountSUSD: 2,
    });
    expect(totalCash(world)).toBeCloseTo(before, 9);
    for (const posting of world.finance.postings) {
      const debits = posting.lines
        .filter((line) => line.side === "debit")
        .reduce((total, line) => total + line.amountSUSD, 0);
      const credits = posting.lines
        .filter((line) => line.side === "credit")
        .reduce((total, line) => total + line.amountSUSD, 0);
      expect(Math.abs(debits - credits)).toBeLessThanOrEqual(MONEY_TOLERANCE_SUSD);
    }
  });

  test("supports multi-line wages postings", () => {
    const finance = financeOf();
    const building = balanceOf(finance, SELLER_BUILDING);
    const first = balanceOf(finance, HOUSEHOLD);
    const second = balanceOf(finance, OTHER_HOUSEHOLD);
    postJournalEntry(finance, 0, "wages", [
      { accountId: HOUSEHOLD, side: "debit", amountSUSD: 5 },
      { accountId: OTHER_HOUSEHOLD, side: "debit", amountSUSD: 4 },
      { accountId: SELLER_BUILDING, side: "credit", amountSUSD: 9 },
    ]);
    expect(balanceOf(finance, HOUSEHOLD)).toBeCloseTo(first + 5, 9);
    expect(balanceOf(finance, OTHER_HOUSEHOLD)).toBeCloseTo(second + 4, 9);
    expect(balanceOf(finance, SELLER_BUILDING)).toBeCloseTo(building - 9, 9);
  });

  test("rejects unbalanced, invalid, unknown-account, and overdraft postings atomically", () => {
    const finance = financeOf();
    const before = finance.accounts.map((account) => account.balanceSUSD);
    const postingCount = finance.postings.length;
    const baselineBuilding = balanceOf(finance, SELLER_BUILDING);

    expect(() =>
      postJournalEntry(finance, 0, "goods-purchase", [
        { accountId: SELLER_BUILDING, side: "debit", amountSUSD: 10 },
        { accountId: HOUSEHOLD, side: "credit", amountSUSD: 9 },
      ]),
    ).toThrow(/balance|debit|credit/i);

    expect(() =>
      postCashTransfer(finance, 0, "goods-purchase", {
        fromAccountId: HOUSEHOLD,
        toAccountId: SELLER_BUILDING,
        amountSUSD: 0,
      }),
    ).toThrow(/amount|positive/i);

    expect(() =>
      postCashTransfer(finance, 0, "goods-purchase", {
        fromAccountId: HOUSEHOLD,
        toAccountId: 999,
        amountSUSD: 1,
      }),
    ).toThrow(/account|unknown/i);

    expect(() =>
      postCashTransfer(finance, 0, "goods-purchase", {
        fromAccountId: HOUSEHOLD,
        toAccountId: SELLER_BUILDING,
        amountSUSD: baselineBuilding + 1,
      }),
    ).toThrow(/overdraft|balance|insufficient/i);

    expect(finance.accounts.map((account) => account.balanceSUSD)).toEqual(before);
    expect(finance.postings).toHaveLength(postingCount);
  });

  test("rejects invalid transaction kinds and day indices", () => {
    const finance = financeOf();
    expect(() =>
      postCashTransfer(finance, -1, "goods-purchase", {
        fromAccountId: HOUSEHOLD,
        toAccountId: SELLER_BUILDING,
        amountSUSD: 1,
      }),
    ).toThrow(/day/i);
    expect(() =>
      postCashTransfer(finance, 0, "not-a-kind" as PublicTransactionKind, {
        fromAccountId: HOUSEHOLD,
        toAccountId: SELLER_BUILDING,
        amountSUSD: 1,
      }),
    ).toThrow(/kind|transaction/i);
    const lines: JournalLine[] = [];
    expect(() => postJournalEntry(finance, 0, "wages", lines)).toThrow(/line|empty/i);
  });
});

function balanceOf(finance: FinanceState, accountId: number): number {
  const account = finance.accounts.find((candidate) => candidate.id === accountId);
  if (account === undefined) throw new Error(`missing account ${String(accountId)}`);
  return account.balanceSUSD;
}
