/**
 * Category-aware balanced ledger for M4a-1, extended by M4a-3/M4b semantics.
 *
 * Accounts store a balance in normal-side units: asset and expense accounts are
 * debit-normal, liability, equity, and revenue accounts are credit-normal. A
 * posting is validated atomically before any balance changes.
 *
 * Three independent invariants are enforced here:
 * - I-1: every posting's total debits equal its total credits.
 * - I-2: ordinary (cash-neutral) postings do not change aggregate designated
 *   cash. Monetary issuance/redemption are registered but not implemented in
 *   M4a-1, so posting them is rejected.
 * - D-047: the semantic matrix governs which transaction kinds may debit or
 *   credit revenue and expense accounts. It is enforced centrally for individual
 *   postings, batches, and persisted-posting validation.
 *
 * Total asset balances are deliberately not conserved (I-3): a future bond
 * issuance can create an asset against a liability without moving cash.
 */

import { assertValidDayIndex } from "../calendar.js";
import { MONEY_TOLERANCE_SUSD } from "../population/constants.js";
import type { Day, Id } from "../types.js";
import { requireArray, requireFiniteNumber, requireInteger, requireRecord } from "../validation.js";
import {
  accountNormalSide,
  assertBusinessTaxPostingStructure,
  assertConstructionPostingStructure,
  assertIndustrialPostingStructure,
  assertFiscalPostingStructure,
  assertAdministrationPostingStructure,
  assertEducationPostingStructure,
  assertTrainingPostingStructure,
  assertProfitAllocationStructure,
  assertDebtPostingStructure,
  assertSemanticJournalLine,
  categoryAllowsNegativeBalance,
  isCashAccount,
  isDebtPostingKind,
  isProfitAllocationKind,
  transactionKindChangesCash,
} from "./accounts.js";
import { MAX_AUDIT_POSTINGS } from "./constants.js";
import {
  TRANSACTION_KINDS,
  isInternalTransactionKind,
  type FinanceState,
  type FinancialAccount,
  type JournalLine,
  type JournalPosting,
  type PublicTransactionKind,
  type TransactionKind,
} from "./types.js";

export interface CashTransferOptions {
  readonly fromAccountId: Id;
  readonly toAccountId: Id;
  readonly amountSUSD: number;
}

export interface JournalEntryInput {
  readonly transactionKind: PublicTransactionKind;
  readonly lines: readonly JournalLine[];
  readonly sourceEntityId?: Id | null;
  readonly targetEntityId?: Id | null;
}

interface ValidatedLines {
  readonly deltas: Map<number, number>;
  readonly debits: number;
  readonly credits: number;
  /** Signed change to the aggregate designated-cash total. */
  readonly cashDelta: number;
}

function toleranceMoney(...values: number[]): number {
  let scale = 1;
  for (const value of values) scale = Math.max(scale, Math.abs(value));
  return MONEY_TOLERANCE_SUSD * scale;
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
      `transactionKind ${JSON.stringify(String(value))} is not a valid transaction kind`,
    );
  }
}

/**
 * Runtime half of the public/internal transaction-kind boundary. The public
 * posting signatures exclude internal kinds at the type level; this rejects a
 * cast or untyped caller before any validation or mutation.
 */
function assertPublicTransactionKind(value: unknown): asserts value is PublicTransactionKind {
  assertTransactionKind(value);
  if (isInternalTransactionKind(value)) {
    throw new RangeError(
      `transactionKind ${JSON.stringify(value)} is internal to the period-close helper (and the controlled correction helper) and cannot be posted through the public posting API`,
    );
  }
}

function validatePostingLines(
  lines: readonly JournalLine[],
  accounts: Map<number, FinancialAccount>,
  transactionKind: TransactionKind,
): ValidatedLines {
  if (lines.length === 0) throw new RangeError("journal posting must contain at least one line");
  const deltas = new Map<number, number>();
  let debits = 0;
  let credits = 0;
  let cashDelta = 0;
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
    // D-047 semantic matrix: applies to revenue/expense lines for every kind.
    assertSemanticJournalLine(transactionKind, account, side, `journal line ${String(index)}`);
    const normalSide = accountNormalSide(account.category);
    const signed = side === normalSide ? amount : -amount;
    if (side === "debit") debits += amount;
    else credits += amount;
    deltas.set(accountId, (deltas.get(accountId) ?? 0) + signed);
    if (isCashAccount(account)) cashDelta += signed;
  }
  if (Math.abs(debits - credits) > MONEY_TOLERANCE_SUSD) {
    throw new RangeError(
      `journal posting is unbalanced: debits ${String(debits)} != credits ${String(credits)}`,
    );
  }
  if (transactionKind === "income-tax" || transactionKind === "welfare-transfer") {
    assertFiscalPostingStructure(transactionKind, lines, accounts);
  }
  if (transactionKind === "administration-payroll") {
    assertAdministrationPostingStructure(lines, accounts);
  }
  if (transactionKind === "education-payroll") {
    assertEducationPostingStructure(lines, accounts);
  }
  if (
    transactionKind === "training-payroll" ||
    transactionKind === "training-stipend"
  ) {
    assertTrainingPostingStructure(lines, accounts);
  }
  if (transactionKind === "business-profit-tax") {
    assertBusinessTaxPostingStructure(lines, accounts);
  }
  if (
    transactionKind === "construction-wage" ||
    transactionKind === "construction-capitalization" ||
    transactionKind === "construction-writeoff" ||
    transactionKind === "construction-working-capital"
  ) {
    assertConstructionPostingStructure(transactionKind, lines, accounts);
  }
  if (
    transactionKind === "construction-material-purchase" ||
    transactionKind === "production-subsidy" ||
    transactionKind === "public-enterprise-capital-contribution"
  ) {
    assertIndustrialPostingStructure(transactionKind, lines, accounts);
  }
  if (isProfitAllocationKind(transactionKind)) {
    assertProfitAllocationStructure(transactionKind, lines, accounts);
  }
  if (isDebtPostingKind(transactionKind)) {
    assertDebtPostingStructure(transactionKind, lines, accounts);
  }
  return { deltas, debits, credits, cashDelta };
}

function assertBalanceConstraints(
  accounts: Map<number, FinancialAccount>,
  deltas: Map<number, number>,
): void {
  for (const [accountId, delta] of deltas) {
    const account = accounts.get(accountId);
    if (account === undefined) throw new RangeError(`unknown account ${String(accountId)}`);
    const next = account.balanceSUSD + delta;
    if (!Number.isFinite(next)) {
      throw new RangeError(`posting would make account ${String(accountId)} non-finite`);
    }
    if (!categoryAllowsNegativeBalance(account.category) && next < 0) {
      throw new RangeError(
        `insufficient funds; posting would make ${account.category} account ${String(accountId)} negative: ${String(account.balanceSUSD)} + ${String(delta)} < 0`,
      );
    }
  }
}

function assertCashConservation(kind: TransactionKind, cashDelta: number): void {
  if (transactionKindChangesCash(kind)) {
    throw new RangeError(
      `transactionKind ${JSON.stringify(kind)} changes aggregate cash and is not implemented in M4a-1`,
    );
  }
  if (Math.abs(cashDelta) > toleranceMoney(cashDelta)) {
    throw new RangeError(
      `cash-neutral posting ${JSON.stringify(kind)} would change aggregate designated cash by ${String(cashDelta)}`,
    );
  }
}

/**
 * Post a balanced entry. Validation is atomic: no balance or posting changes
 * occur when any line, account, balance, category, or invariant check fails.
 */
export function postJournalEntry(
  finance: FinanceState,
  dayIndex: Day,
  transactionKind: PublicTransactionKind,
  lines: readonly JournalLine[],
  sourceEntityId: Id | null = null,
  targetEntityId: Id | null = null,
): JournalPosting {
  assertValidDayIndex(dayIndex);
  assertPublicTransactionKind(transactionKind);
  const nextId = requireInteger(finance.nextPostingId, "finance.nextPostingId", 1, Number.MAX_SAFE_INTEGER);
  const accounts = accountMap(finance);
  const validated = validatePostingLines(lines, accounts, transactionKind);
  assertBalanceConstraints(accounts, validated.deltas);
  assertCashConservation(transactionKind, validated.cashDelta);

  // Apply only after every line, balance, and invariant has been validated.
  for (const [accountId, delta] of validated.deltas) {
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
 * Apply a controlled correction posting. This is deliberately not a public
 * transaction kind: only `postFinanceCorrection` can call it. The correction is
 * balanced and affordability-checked, but may change designated cash because it
 * can reverse a prior cash-bearing posting.
 */
export function postCorrectionEntry(
  finance: FinanceState,
  dayIndex: Day,
  lines: readonly JournalLine[],
  sourceEntityId: Id | null = null,
  targetEntityId: Id | null = null,
): JournalPosting {
  assertValidDayIndex(dayIndex);
  const nextId = requireInteger(
    finance.nextPostingId,
    "finance.nextPostingId",
    1,
    Number.MAX_SAFE_INTEGER,
  );
  const accounts = accountMap(finance);
  const validated = validatePostingLines(lines, accounts, "correction");
  assertBalanceConstraints(accounts, validated.deltas);
  for (const [accountId, delta] of validated.deltas) {
    const account = accounts.get(accountId);
    if (account === undefined) throw new RangeError(`unknown account ${String(accountId)}`);
    account.balanceSUSD += delta;
  }
  const posting: JournalPosting = {
    id: nextId,
    dayIndex,
    transactionKind: "correction",
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
 * against their own debits/credits and cash conservation; account affordability
 * is checked against the net effect of the whole batch before any balance
 * changes. This permits same-settlement sales receipts to fund purchases
 * without an order dependency.
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
  if (nextId + entries.length > Number.MAX_SAFE_INTEGER) {
    throw new RangeError("finance posting id overflow");
  }

  const aggregate = new Map<number, number>();
  const prepared: {
    readonly transactionKind: PublicTransactionKind;
    readonly lines: readonly JournalLine[];
    readonly sourceEntityId: Id | null;
    readonly targetEntityId: Id | null;
  }[] = [];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (entry === undefined) throw new RangeError(`journal batch entry ${String(index)} is missing`);
    assertPublicTransactionKind(entry.transactionKind);
    const validated = validatePostingLines(entry.lines, accounts, entry.transactionKind);
    assertCashConservation(entry.transactionKind, validated.cashDelta);
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
  assertBalanceConstraints(accounts, aggregate);

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

/**
 * Post a single debit/credit cash transfer. Both accounts must be designated
 * cash accounts; use `postJournalEntry` for entries that also recognize expense
 * or revenue.
 */
export function postCashTransfer(
  finance: FinanceState,
  dayIndex: Day,
  transactionKind: PublicTransactionKind,
  options: CashTransferOptions,
  sourceEntityId: Id | null = null,
  targetEntityId: Id | null = null,
): JournalPosting {
  if (options.fromAccountId === options.toAccountId) {
    throw new RangeError("cash transfer payer and receiver must be different accounts");
  }
  for (const accountId of [options.fromAccountId, options.toAccountId]) {
    const account = finance.accounts.find((candidate) => candidate.id === accountId);
    if (account !== undefined && !isCashAccount(account)) {
      throw new RangeError(
        `cash transfer requires designated cash accounts; account ${String(accountId)} is ${account.subtype}`,
      );
    }
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
