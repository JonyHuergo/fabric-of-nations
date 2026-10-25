/**
 * Minimal balanced cash ledger for M3.
 *
 * M3 accounts are cash asset accounts. A debit increases the balance and a
 * credit decreases it. In a transfer the receiving account is debited and the
 * paying account is credited. Every posting is validated atomically before any
 * balance changes.
 */

import { assertValidDayIndex } from "../calendar.js";
import { MONEY_TOLERANCE_SUSD } from "../population/constants.js";
import type { Day, Id } from "../types.js";
import { requireArray, requireFiniteNumber, requireInteger, requireRecord } from "../validation.js";
import { MAX_AUDIT_POSTINGS } from "./constants.js";
import {
  TRANSACTION_KINDS,
  type FinanceState,
  type FinancialAccount,
  type JournalLine,
  type JournalPosting,
  type TransactionKind,
} from "./types.js";

export interface CashTransferOptions {
  readonly fromAccountId: Id;
  readonly toAccountId: Id;
  readonly amountSUSD: number;
}

export interface JournalEntryInput {
  readonly transactionKind: TransactionKind;
  readonly lines: readonly JournalLine[];
  readonly sourceEntityId?: Id | null;
  readonly targetEntityId?: Id | null;
}

interface ValidatedLines {
  readonly deltas: Map<number, number>;
  readonly debits: number;
  readonly credits: number;
}

function accountMap(finance: FinanceState): Map<number, FinancialAccount> {
  const accounts = requireArray(finance.accounts, "finance.accounts");
  const map = new Map<number, FinancialAccount>();
  for (const value of accounts) {
    const account = value as FinancialAccount;
    if (map.has(account.id)) {
      throw new RangeError(`duplicate finance account id ${String(account.id)}`);
    }
    map.set(account.id, account);
  }
  return map;
}

function assertTransactionKind(value: unknown): asserts value is TransactionKind {
  if (!(TRANSACTION_KINDS as readonly string[]).includes(value as string)) {
    throw new RangeError(
      `transactionKind ${JSON.stringify(String(value))} is not a valid M3 transaction kind`,
    );
  }
}

function validatePostingLines(
  lines: readonly JournalLine[],
  accounts: Map<number, FinancialAccount>,
): ValidatedLines {
  if (lines.length === 0) throw new RangeError("journal posting must contain at least one line");
  const deltas = new Map<number, number>();
  let debits = 0;
  let credits = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const record = requireRecord(lines[index], `journal line ${String(index)}`);
    const accountId = requireInteger(
      record.accountId,
      `journal line ${String(index)}.accountId`,
      0,
      0xffff_ffff,
    );
    const account = accounts.get(accountId);
    if (account === undefined) {
      throw new RangeError(`journal line ${String(index)} references unknown account ${String(accountId)}`);
    }
    const side = record.side;
    if (side !== "debit" && side !== "credit") {
      throw new RangeError(`journal line ${String(index)}.side must be debit or credit`);
    }
    const amount = requireFiniteNumber(
      record.amountSUSD,
      `journal line ${String(index)}.amountSUSD`,
    );
    if (!(amount > 0)) {
      throw new RangeError(`journal line ${String(index)}.amountSUSD must be strictly positive`);
    }
    if (side === "debit") {
      debits += amount;
      deltas.set(accountId, (deltas.get(accountId) ?? 0) + amount);
    } else {
      credits += amount;
      deltas.set(accountId, (deltas.get(accountId) ?? 0) - amount);
    }
  }
  if (Math.abs(debits - credits) > MONEY_TOLERANCE_SUSD) {
    throw new RangeError(
      `journal posting is unbalanced: debits ${String(debits)} != credits ${String(credits)}`,
    );
  }
  return { deltas, debits, credits };
}

function assertNonNegativeBalances(
  accounts: Map<number, FinancialAccount>,
  deltas: Map<number, number>,
): void {
  for (const [accountId, delta] of deltas) {
    const account = accounts.get(accountId);
    if (account === undefined) throw new RangeError(`unknown account ${String(accountId)}`);
    const next = account.balanceSUSD + delta;
    if (next < 0) {
      throw new RangeError(
        `insufficient funds; posting would overdraw account ${String(accountId)}: ${String(account.balanceSUSD)} + ${String(delta)} < 0`,
      );
    }
  }
}

function validateLines(
  lines: readonly JournalLine[],
  accounts: Map<number, FinancialAccount>,
): { readonly deltas: Map<number, number> } {
  const validated = validatePostingLines(lines, accounts);
  assertNonNegativeBalances(accounts, validated.deltas);
  return { deltas: validated.deltas };
}

/**
 * Post a balanced entry. Validation is atomic: no balance or posting changes
 * occur when any line, account, balance, or balance check fails.
 */
export function postJournalEntry(
  finance: FinanceState,
  dayIndex: Day,
  transactionKind: TransactionKind,
  lines: readonly JournalLine[],
  sourceEntityId: Id | null = null,
  targetEntityId: Id | null = null,
): JournalPosting {
  assertValidDayIndex(dayIndex);
  assertTransactionKind(transactionKind);
  const nextId = requireInteger(finance.nextPostingId, "finance.nextPostingId", 1, Number.MAX_SAFE_INTEGER);
  const accounts = accountMap(finance);
  const { deltas } = validateLines(lines, accounts);

  // Apply only after every line and every resulting balance has been validated.
  for (const [accountId, delta] of deltas) {
    const account = accounts.get(accountId);
    if (account === undefined) throw new RangeError(`unknown account ${String(accountId)}`);
    account.balanceSUSD += delta;
  }

  const posting: JournalPosting = {
    id: nextId,
    dayIndex,
    transactionKind,
    lines: lines.map((line) => ({ ...line })),
    sourceEntityId,
    targetEntityId,
  };
  finance.postings.push(posting);
  finance.nextPostingId = nextId + 1;
  if (finance.postings.length > MAX_AUDIT_POSTINGS) {
    finance.postings.splice(0, finance.postings.length - MAX_AUDIT_POSTINGS);
  }
  return posting;
}

/**
 * Post several balanced entries atomically. Individual entries are validated
 * against their own debits/credits; account affordability is checked against the
 * net effect of the whole batch before any balance changes. This permits
 * same-settlement sales receipts to fund purchases without an order dependency.
 */
export function postJournalBatch(
  finance: FinanceState,
  dayIndex: Day,
  entries: readonly JournalEntryInput[],
): JournalPosting[] {
  assertValidDayIndex(dayIndex);
  const accounts = accountMap(finance);
  const nextId = requireInteger(
    finance.nextPostingId,
    "finance.nextPostingId",
    1,
    Number.MAX_SAFE_INTEGER,
  );
  if (entries.length === 0) return [];
  if (nextId + entries.length - 1 > Number.MAX_SAFE_INTEGER) {
    throw new RangeError("finance posting id overflow");
  }

  const aggregate = new Map<number, number>();
  const prepared: {
    readonly transactionKind: TransactionKind;
    readonly lines: readonly JournalLine[];
    readonly sourceEntityId: Id | null;
    readonly targetEntityId: Id | null;
  }[] = [];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (entry === undefined) throw new RangeError(`journal batch entry ${String(index)} is missing`);
    assertTransactionKind(entry.transactionKind);
    const validated = validatePostingLines(entry.lines, accounts);
    for (const [accountId, delta] of validated.deltas) {
      aggregate.set(accountId, (aggregate.get(accountId) ?? 0) + delta);
    }
    prepared.push({
      transactionKind: entry.transactionKind,
      lines: entry.lines.map((line) => ({ ...line })),
      sourceEntityId: entry.sourceEntityId ?? null,
      targetEntityId: entry.targetEntityId ?? null,
    });
  }
  assertNonNegativeBalances(accounts, aggregate);

  for (const [accountId, delta] of aggregate) {
    const account = accounts.get(accountId);
    if (account === undefined) throw new RangeError(`unknown account ${String(accountId)}`);
    account.balanceSUSD += delta;
  }

  const postings: JournalPosting[] = [];
  let postingId = nextId;
  for (const entry of prepared) {
    const posting: JournalPosting = {
      id: postingId,
      dayIndex,
      transactionKind: entry.transactionKind,
      lines: entry.lines.map((line) => ({ ...line })),
      sourceEntityId: entry.sourceEntityId,
      targetEntityId: entry.targetEntityId,
    };
    finance.postings.push(posting);
    postings.push(posting);
    postingId += 1;
  }
  finance.nextPostingId = postingId;
  if (finance.postings.length > MAX_AUDIT_POSTINGS) {
    finance.postings.splice(0, finance.postings.length - MAX_AUDIT_POSTINGS);
  }
  return postings;
}

/** Post a single debit/credit cash transfer. */
export function postCashTransfer(
  finance: FinanceState,
  dayIndex: Day,
  transactionKind: TransactionKind,
  options: CashTransferOptions,
  sourceEntityId: Id | null = null,
  targetEntityId: Id | null = null,
): JournalPosting {
  if (options.fromAccountId === options.toAccountId) {
    throw new RangeError("cash transfer payer and receiver must be different accounts");
  }
  return postJournalEntry(
    finance,
    dayIndex,
    transactionKind,
    [
      { accountId: options.toAccountId, side: "debit", amountSUSD: options.amountSUSD },
      { accountId: options.fromAccountId, side: "credit", amountSUSD: options.amountSUSD },
    ],
    sourceEntityId,
    targetEntityId,
  );
}
