/**
 * D-158: the columnar account table, the authoritative store of every finance account.
 *
 * Accounts were 481,000 objects in the 1900 world (twice, with the rollback checkpoint),
 * which the garbage collector traced on every full collection, and each phase that looked
 * them up by id or owner built maps of the same size. The table keeps the same fields as
 * typed columns indexed by the account's position: position `p` holds the account whose id
 * is `id[p]`. Positions follow ascending id (accounts are appended with ids above every
 * existing id, the invariant `assertValidAccountTable` checks), so an id lookup is a binary
 * search or a dense position table, and the encoded world lists accounts in position order.
 *
 * The table is plain data: a record of typed arrays and a count, cloned by copying the
 * arrays and encoded as the same account records as before (`encodeWorld`, hashes). Columns
 * may be longer than `count` (capacity for appends); entries at and after `count` are not
 * accounts. `FinancialAccount` objects remain as thin views (`accountView`) for cold paths,
 * tests and diagnostics: a view reads and writes the table, so it holds no state of its own.
 *
 * Codes: owner kind = index in `ACCOUNT_OWNER_KINDS`; subtype = index in `ACCOUNT_SUBTYPES`;
 * category = index in `ACCOUNT_CATEGORIES`, derived from the subtype (never stored).
 */

import type { Id, MoneyRUSD } from "../types.js";
import {
  ACCOUNT_CATEGORIES,
  ACCOUNT_SUBTYPES,
  type AccountCategory,
  type AccountSubtype,
  type FinancialAccount,
  type FinancialAccountOwnerKind,
} from "./types.js";

/** Owner kinds in code order (the save format's order). */
export const ACCOUNT_OWNER_KINDS = ["popBlock", "building", "country", "system"] as const;

/** Owner id column value of an account without an owner (system accounts). */
export const NO_ACCOUNT_OWNER = -1;

export interface AccountTable {
  /** Number of accounts; columns may be longer (capacity). */
  count: number;
  /** Account id (uint32), strictly ascending over positions `0..count-1`. */
  id: Float64Array;
  /** Owner kind code (`ACCOUNT_OWNER_KINDS`). */
  ownerKind: Uint8Array;
  /** Owner id (uint32), or `NO_ACCOUNT_OWNER` for an account without an owner. */
  ownerId: Float64Array;
  /** Subtype code (`ACCOUNT_SUBTYPES`). */
  subtype: Uint8Array;
  /** Balance in normal-side units, RUSD. */
  balance: Float64Array;
}

/** Fields of one account to append (the `FinancialAccount` shape without the derived category). */
export interface AccountRecord {
  readonly id: Id;
  readonly ownerKind: FinancialAccountOwnerKind;
  readonly ownerId: Id | null;
  readonly subtype: AccountSubtype;
  readonly balanceRUSD: MoneyRUSD;
  /** Accepted for convenience (object literals of the former shape); must match the subtype. */
  readonly category?: AccountCategory;
}

const OWNER_KIND_CODE: ReadonlyMap<string, number> = new Map(ACCOUNT_OWNER_KINDS.map((kind, code) => [kind, code]));
const SUBTYPE_CODE: ReadonlyMap<string, number> = new Map(ACCOUNT_SUBTYPES.map((subtype, code) => [subtype, code]));

/** Owner kind code of a kind, or -1. */
export function ownerKindCode(kind: string): number {
  return OWNER_KIND_CODE.get(kind) ?? -1;
}

/** Subtype code of a subtype, or -1. */
export function subtypeCode(subtype: string): number {
  return SUBTYPE_CODE.get(subtype) ?? -1;
}

/**
 * Category code by subtype code, filled from the subtype → category rule of `accounts.ts`
 * (`registerSubtypeCategories`, called once when that module loads; it owns the rule).
 */
export const CATEGORY_OF_SUBTYPE = new Uint8Array(ACCOUNT_SUBTYPES.length);

export function registerSubtypeCategories(categoryOf: (subtype: AccountSubtype) => AccountCategory): void {
  ACCOUNT_SUBTYPES.forEach((subtype, code) => {
    CATEGORY_OF_SUBTYPE[code] = ACCOUNT_CATEGORIES.indexOf(categoryOf(subtype));
  });
}

export function createAccountTable(capacity = 0): AccountTable {
  const size = Math.max(0, Math.floor(capacity));
  return {
    count: 0,
    id: new Float64Array(size),
    ownerKind: new Uint8Array(size),
    ownerId: new Float64Array(size),
    subtype: new Uint8Array(size),
    balance: new Float64Array(size),
  };
}

function grow<T extends Float64Array | Uint8Array>(column: T, size: number, make: (n: number) => T): T {
  const next = make(size);
  next.set(column.subarray(0, Math.min(column.length, size)));
  return next;
}

/** Make room for `extra` more accounts (capacity doubles). */
export function reserveAccounts(table: AccountTable, extra: number): void {
  const needed = table.count + extra;
  if (needed <= table.id.length) return;
  const size = Math.max(needed, table.id.length * 2, 16);
  table.id = grow(table.id, size, (n) => new Float64Array(n));
  table.ownerKind = grow(table.ownerKind, size, (n) => new Uint8Array(n));
  table.ownerId = grow(table.ownerId, size, (n) => new Float64Array(n));
  table.subtype = grow(table.subtype, size, (n) => new Uint8Array(n));
  table.balance = grow(table.balance, size, (n) => new Float64Array(n));
}

/**
 * Append one account and return its position. The id must be above every existing id
 * (positions follow ascending id); codes and the category are checked here, the rest of
 * the account rules by the finance validation.
 */
export function appendAccount(table: AccountTable, account: AccountRecord): number {
  const kind = ownerKindCode(account.ownerKind);
  const subtype = subtypeCode(account.subtype);
  if (kind < 0) throw new RangeError(`account ${String(account.id)} has an invalid owner kind`);
  if (subtype < 0) throw new RangeError(`account ${String(account.id)} has an invalid subtype`);
  if (
    account.category !== undefined &&
    ACCOUNT_CATEGORIES.indexOf(account.category) !== CATEGORY_OF_SUBTYPE[subtype]
  ) {
    throw new RangeError(
      `finance account ${String(account.id)} category ${JSON.stringify(account.category)} does not match subtype ${JSON.stringify(account.subtype)}`,
    );
  }
  if (!Number.isInteger(account.id) || account.id < 0 || account.id > 0xffff_ffff) {
    throw new RangeError(`account id ${String(account.id)} must be an integer in 0..${String(0xffff_ffff)}`);
  }
  if (table.count > 0 && !(account.id > (table.id[table.count - 1] ?? 0))) {
    throw new RangeError(
      `account id ${String(account.id)} must be above every existing account id (${String(table.id[table.count - 1])})`,
    );
  }
  reserveAccounts(table, 1);
  const position = table.count;
  table.id[position] = account.id;
  table.ownerKind[position] = kind;
  table.ownerId[position] = account.ownerId === null ? NO_ACCOUNT_OWNER : account.ownerId;
  table.subtype[position] = subtype;
  table.balance[position] = account.balanceRUSD;
  table.count = position + 1;
  return position;
}

/** A table of these accounts, sorted by id (the creation path; duplicates are rejected). */
export function accountTableFromRecords(records: readonly AccountRecord[]): AccountTable {
  const sorted = [...records].sort((left, right) => left.id - right.id);
  const table = createAccountTable(sorted.length);
  for (const record of sorted) {
    if (table.count > 0 && record.id === table.id[table.count - 1]) {
      throw new RangeError(`duplicate finance account id ${String(record.id)}`);
    }
    appendAccount(table, record);
  }
  return table;
}

/**
 * Truncation generation of each table (derived cache metadata, never authoritative): a
 * table truncated and appended back to the same count holds different accounts, so a
 * cached index keyed by count alone would be stale.
 */
const generations = new WeakMap<AccountTable, number>();

export function accountTableGeneration(table: AccountTable): number {
  return generations.get(table) ?? 0;
}

/** Drop the accounts at and after `count` (an action's staged appends being undone). */
export function truncateAccounts(table: AccountTable, count: number): void {
  if (!(Number.isInteger(count) && count >= 0 && count <= table.count)) {
    throw new RangeError(`cannot truncate ${String(table.count)} accounts to ${String(count)}`);
  }
  generations.set(table, accountTableGeneration(table) + 1);
  for (let position = count; position < table.count; position += 1) {
    table.id[position] = 0;
    table.ownerKind[position] = 0;
    table.ownerId[position] = 0;
    table.subtype[position] = 0;
    table.balance[position] = 0;
  }
  table.count = count;
}

/** A copy with the same accounts (capacity trimmed to the count). */
export function cloneAccountTable(table: AccountTable): AccountTable {
  const count = table.count;
  return {
    count,
    id: table.id.slice(0, count),
    ownerKind: table.ownerKind.slice(0, count),
    ownerId: table.ownerId.slice(0, count),
    subtype: table.subtype.slice(0, count),
    balance: table.balance.slice(0, count),
  };
}

/** Position of the account with this id, or -1 (binary search; positions follow ascending id). */
export function accountPosition(table: AccountTable, id: number): number {
  let low = 0;
  let high = table.count - 1;
  const ids = table.id;
  while (low <= high) {
    const middle = (low + high) >>> 1;
    const value = ids[middle] ?? 0;
    if (value === id) return middle;
    if (value < id) low = middle + 1;
    else high = middle - 1;
  }
  return -1;
}

export function accountOwnerKindAt(table: AccountTable, position: number): FinancialAccountOwnerKind {
  return ACCOUNT_OWNER_KINDS[table.ownerKind[position] ?? 0] as FinancialAccountOwnerKind;
}

export function accountOwnerIdAt(table: AccountTable, position: number): Id | null {
  const owner = table.ownerId[position] ?? NO_ACCOUNT_OWNER;
  return owner === NO_ACCOUNT_OWNER ? null : owner;
}

export function accountSubtypeAt(table: AccountTable, position: number): AccountSubtype {
  return ACCOUNT_SUBTYPES[table.subtype[position] ?? 0] as AccountSubtype;
}

export function accountCategoryAt(table: AccountTable, position: number): AccountCategory {
  return ACCOUNT_CATEGORIES[CATEGORY_OF_SUBTYPE[table.subtype[position] ?? 0] ?? 0] as AccountCategory;
}

/**
 * A live view of the account at `position` of `table`: reads, and writes of `balanceRUSD`,
 * go to the table (D-158). It holds no state of its own, only the table and the position,
 * and is valid while the table holds that account. The fields are prototype accessors, so a
 * view is cheap to make (the simulation's lookups); `JSON.stringify` gives the plain
 * record. A spread does not copy accessors: code that copies an account uses
 * `accountRecordAt`, and `listAccounts` (tests, diagnostics) gives views whose fields are
 * own properties.
 */
class AccountView implements FinancialAccount {
  readonly table: AccountTable;
  readonly position: number;

  constructor(table: AccountTable, position: number) {
    this.table = table;
    this.position = position;
  }

  get id(): Id {
    return this.table.id[this.position] ?? 0;
  }

  get ownerKind(): FinancialAccountOwnerKind {
    return accountOwnerKindAt(this.table, this.position);
  }

  get ownerId(): Id | null {
    return accountOwnerIdAt(this.table, this.position);
  }

  get category(): AccountCategory {
    return accountCategoryAt(this.table, this.position);
  }

  get subtype(): AccountSubtype {
    return accountSubtypeAt(this.table, this.position);
  }

  get balanceRUSD(): MoneyRUSD {
    return this.table.balance[this.position] ?? 0;
  }

  set balanceRUSD(value: MoneyRUSD) {
    this.table.balance[this.position] = value;
  }

  toJSON(): FinancialAccount {
    return accountRecordAt(this.table, this.position);
  }
}

/** A live view whose fields are own enumerable accessors (spread and `toEqual` see them). */
function makeOwnView(table: AccountTable, position: number): FinancialAccount {
  return {
    get id(): Id {
      return table.id[position] ?? 0;
    },
    get ownerKind(): FinancialAccountOwnerKind {
      return accountOwnerKindAt(table, position);
    },
    get ownerId(): Id | null {
      return accountOwnerIdAt(table, position);
    },
    get category(): AccountCategory {
      return accountCategoryAt(table, position);
    },
    get subtype(): AccountSubtype {
      return accountSubtypeAt(table, position);
    },
    get balanceRUSD(): MoneyRUSD {
      return table.balance[position] ?? 0;
    },
    set balanceRUSD(value: MoneyRUSD) {
      table.balance[position] = value;
    },
  };
}

export function accountView(table: AccountTable, position: number): FinancialAccount {
  if (!(Number.isInteger(position) && position >= 0 && position < table.count)) {
    throw new RangeError(`account position ${String(position)} is outside the table (${String(table.count)})`);
  }
  return new AccountView(table, position);
}

/** The account with this id as a live view, or undefined. */
export function accountById(table: AccountTable, id: number): FinancialAccount | undefined {
  const position = accountPosition(table, id);
  return position < 0 ? undefined : new AccountView(table, position);
}

/** A plain copy of the account at `position` (not live). */
export function accountRecordAt(table: AccountTable, position: number): FinancialAccount {
  return {
    id: table.id[position] ?? 0,
    ownerKind: accountOwnerKindAt(table, position),
    ownerId: accountOwnerIdAt(table, position),
    category: accountCategoryAt(table, position),
    subtype: accountSubtypeAt(table, position),
    balanceRUSD: table.balance[position] ?? 0,
  };
}

/** A mutable account record reused by whole-table scans (`readAccountRow`). */
export interface AccountRow {
  id: Id;
  ownerKind: FinancialAccountOwnerKind;
  ownerId: Id | null;
  category: AccountCategory;
  subtype: AccountSubtype;
  balanceRUSD: MoneyRUSD;
}

export function accountRowScratch(): AccountRow {
  return { id: 0, ownerKind: "system", ownerId: null, category: "asset", subtype: "household-cash", balanceRUSD: 0 };
}

/**
 * Load the account at `position` into `row` and return it (D-158): a scan over every account
 * reads the fields of the former objects without allocating. The row is overwritten by the
 * next call, so it must not be retained.
 */
export function readAccountRow(table: AccountTable, position: number, row: AccountRow): AccountRow {
  row.id = table.id[position] ?? 0;
  row.ownerKind = accountOwnerKindAt(table, position);
  row.ownerId = accountOwnerIdAt(table, position);
  row.category = accountCategoryAt(table, position);
  row.subtype = accountSubtypeAt(table, position);
  row.balanceRUSD = table.balance[position] ?? 0;
  return row;
}

/**
 * Every account as a live view with own enumerable fields, in position (id) order. For
 * tests and diagnostics (a spread or `toEqual` sees the fields); the simulation scans the
 * columns or `readAccountRow` instead.
 */
export function listAccounts(table: AccountTable): FinancialAccount[] {
  const views: FinancialAccount[] = new Array<FinancialAccount>(table.count);
  for (let position = 0; position < table.count; position += 1) views[position] = makeOwnView(table, position);
  return views;
}

/** Every account as a plain copy, in id order (the encoded form). */
export function accountRecords(table: AccountTable): FinancialAccount[] {
  const records: FinancialAccount[] = new Array<FinancialAccount>(table.count);
  for (let position = 0; position < table.count; position += 1) records[position] = accountRecordAt(table, position);
  return records;
}

/** True for a value shaped like an account table (validation boundary). */
export function isAccountTable(value: unknown): value is AccountTable {
  if (typeof value !== "object" || value === null) return false;
  const table = value as Partial<AccountTable>;
  return (
    typeof table.count === "number" &&
    table.id instanceof Float64Array &&
    table.ownerKind instanceof Uint8Array &&
    table.ownerId instanceof Float64Array &&
    table.subtype instanceof Uint8Array &&
    table.balance instanceof Float64Array
  );
}
