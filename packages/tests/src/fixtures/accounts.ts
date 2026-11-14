/**
 * D-158 test helpers for the columnar account table. Production code appends accounts
 * through `appendAccount` (ids ascend); tests that build invalid or out-of-order ledgers
 * use these helpers instead of the former array `push`.
 */
import {
  accountRecords,
  accountTableFromRecords,
  reserveAccounts,
  ownerKindCode,
  subtypeCode,
  NO_ACCOUNT_OWNER,
  type AccountRecord,
  type AccountTable,
  type FinanceState,
} from "@century/sim";

/** Add an account at its id's place (the table is rebuilt in id order; duplicate ids throw). */
export function insertAccount(finance: FinanceState, record: AccountRecord): void {
  finance.accounts = accountTableFromRecords([...accountRecords(finance.accounts), record]);
}

/**
 * Write an account at the end of the table without any check (duplicate ids, ids out of
 * order): a corrupt ledger for validation tests.
 */
export function pushAccountUnchecked(table: AccountTable, record: AccountRecord): void {
  reserveAccounts(table, 1);
  const position = table.count;
  table.id[position] = record.id;
  table.ownerKind[position] = ownerKindCode(record.ownerKind);
  table.ownerId[position] = record.ownerId === null ? NO_ACCOUNT_OWNER : record.ownerId;
  table.subtype[position] = subtypeCode(record.subtype);
  table.balance[position] = record.balanceRUSD;
  table.count = position + 1;
}

/** A finance state's accounts from plain records (fixtures that list accounts by hand). */
export function accountsTable(records: readonly AccountRecord[]): AccountTable {
  return accountTableFromRecords(records);
}
