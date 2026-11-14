/**
 * D-158: the columnar account table, its views and the finance index over it.
 */

import {
  accountRecords,
  accountTableFromRecords,
  accountView,
  appendAccount,
  cloneAccountTable,
  createAccountTable,
  financeIndexOfTable,
  listAccounts,
  truncateAccounts,
  type AccountRecord,
} from "@century/sim";

const base: AccountRecord[] = [
  { id: 10, ownerKind: "popBlock", ownerId: 1, subtype: "household-cash", balanceRUSD: 5 },
  { id: 11, ownerKind: "popBlock", ownerId: 1, subtype: "owner-equity", balanceRUSD: 5 },
  { id: 12, ownerKind: "building", ownerId: 7, subtype: "operating-cash", balanceRUSD: 2 },
  { id: 13, ownerKind: "system", ownerId: null, subtype: "system-reserve-cash", balanceRUSD: 0 },
];

describe("D-158 account table", () => {
  test("records round-trip in id order with derived categories", () => {
    const table = accountTableFromRecords([...base].reverse());
    expect(table.count).toBe(4);
    expect(accountRecords(table).map((account) => account.id)).toEqual([10, 11, 12, 13]);
    expect(accountRecords(table)[1]).toEqual({
      id: 11,
      ownerKind: "popBlock",
      ownerId: 1,
      category: "equity",
      subtype: "owner-equity",
      balanceRUSD: 5,
    });
    expect(accountRecords(table)[3]?.ownerId).toBeNull();
  });

  test("appends only above the last id and rejects a category that contradicts the subtype", () => {
    const table = accountTableFromRecords(base);
    expect(() => appendAccount(table, { id: 9, ownerKind: "popBlock", ownerId: 2, subtype: "wage-income", balanceRUSD: 0 })).toThrow(/above every existing/);
    expect(() =>
      appendAccount(table, { id: 20, ownerKind: "popBlock", ownerId: 2, subtype: "wage-income", category: "asset", balanceRUSD: 0 }),
    ).toThrow(/does not match subtype/);
    expect(() => accountTableFromRecords([...base, { ...base[0]! }])).toThrow(/duplicate finance account id/);
  });

  test("views read and write the table; spreads of listed views copy values", () => {
    const table = accountTableFromRecords(base);
    const view = accountView(table, 2);
    view.balanceRUSD = 9;
    expect(table.balance[2]).toBe(9);
    const [first] = listAccounts(table);
    expect({ ...first }).toEqual({ id: 10, ownerKind: "popBlock", ownerId: 1, category: "asset", subtype: "household-cash", balanceRUSD: 5 });
    expect(JSON.parse(JSON.stringify(view))).toMatchObject({ id: 12, balanceRUSD: 9 });
  });

  test("an index built before appends answers as before; a new index sees the appended accounts", () => {
    const table = accountTableFromRecords(base);
    const before = financeIndexOfTable(table);
    expect(before.position(12)).toBe(2);
    appendAccount(table, { id: 40, ownerKind: "building", ownerId: 7, subtype: "sales-revenue", balanceRUSD: 0 });
    appendAccount(table, { id: 41, ownerKind: "popBlock", ownerId: 3, subtype: "household-cash", balanceRUSD: 1 });
    const after = financeIndexOfTable(table);
    expect(after.count).toBe(6);
    expect(after.position(41)).toBe(5);
    expect(after.find("popBlock", 3, "household-cash")?.id).toBe(41);
    expect(after.ownerAccountIds("building", "sales-revenue")[7]).toBe(40);
    expect(after.cashPositions()).toEqual(Int32Array.from([0, 2, 3, 5]));
    // The earlier index still answers for its own four accounts.
    expect(before.position(41)).toBe(-1);
    expect(before.find("popBlock", 3, "household-cash")).toBeUndefined();
    expect(before.ownerAccountIds("building", "sales-revenue")[7] ?? -1).toBe(-1);
    // A duplicate owner and subtype is rejected when the index is extended.
    appendAccount(table, { id: 42, ownerKind: "popBlock", ownerId: 3, subtype: "household-cash", balanceRUSD: 0 });
    expect(() => financeIndexOfTable(table)).toThrow(/duplicate household-cash account for popBlock 3/);
  });

  test("a truncated table appended back to the same count is indexed afresh", () => {
    const table = accountTableFromRecords(base);
    appendAccount(table, { id: 50, ownerKind: "country", ownerId: 4, subtype: "treasury-cash", balanceRUSD: 0 });
    expect(financeIndexOfTable(table).find("country", 4, "treasury-cash")?.id).toBe(50);
    truncateAccounts(table, 4);
    appendAccount(table, { id: 50, ownerKind: "country", ownerId: 5, subtype: "treasury-cash", balanceRUSD: 0 });
    const index = financeIndexOfTable(table);
    expect(index.find("country", 4, "treasury-cash")).toBeUndefined();
    expect(index.find("country", 5, "treasury-cash")?.id).toBe(50);
  });

  test("a clone is independent of its source", () => {
    const table = accountTableFromRecords(base);
    const copy = cloneAccountTable(table);
    copy.balance[0] = 100;
    appendAccount(copy, { id: 60, ownerKind: "popBlock", ownerId: 9, subtype: "wage-income", balanceRUSD: 0 });
    expect(table.balance[0]).toBe(5);
    expect(table.count).toBe(4);
    expect(createAccountTable().count).toBe(0);
  });
});
