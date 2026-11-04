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
import { MONEY_TOLERANCE_RUSD } from "../population/constants.js";
import type { Day, Id } from "../types.js";
import { isRecord, requireArray, requireInteger } from "../validation.js";
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
  assertTradePostingStructure,
  assertOwnerCapitalInjectionStructure,
  assertMonetaryPostingStructure,
  assertMilitaryPostingStructure,
  semanticJournalLineViolation,
  categoryAllowsNegativeBalance,
  isCashAccount,
  isDebtPostingKind,
  isProfitAllocationKind,
  transactionKindChangesCash,
  buildFinanceIndex,
} from "./accounts.js";
import { MAX_AUDIT_POSTINGS } from "./constants.js";
import {
  TRANSACTION_KINDS,
  isInternalTransactionKind,
  type FinanceState,
  type FinancialAccount,
  type JournalLine,
  type JournalPosting,
  type JournalSide,
  type PublicTransactionKind,
  type TransactionKind,
} from "./types.js";

export interface CashTransferOptions {
  readonly fromAccountId: Id;
  readonly toAccountId: Id;
  readonly amountRUSD: number;
}

export interface JournalEntryInput {
  readonly transactionKind: PublicTransactionKind;
  readonly lines: readonly JournalLine[];
  readonly sourceEntityId?: Id | null;
  readonly targetEntityId?: Id | null;
}

/**
 * Batch delta accumulator over account positions (D-139). It replaces a map with one
 * entry per touched account: `touched` keeps first-touch order, which is the order
 * the map iterated, and each account's delta is summed in the same line order.
 */
interface BatchDeltas {
  readonly positionOf: (id: number) => number;
  readonly delta: Float64Array;
  readonly seen: Uint8Array;
  readonly touched: number[];
}

interface ValidatedLines {
  readonly deltas: Map<number, number> | null;
  readonly debits: number;
  readonly credits: number;
  /** Signed change to the aggregate designated-cash total. */
  readonly cashDelta: number;
}

/**
 * MONEY_TOLERANCE_RUSD scaled by the largest magnitude, at least 1. Fixed arity (D-139): the
 * former rest parameter allocated an array on every call; a missing value is 0,
 * which never raises the scale above 1, so the result is unchanged.
 */
function toleranceMoney(a: number, b = 0, c = 0, d = 0, e = 0, f = 0, g = 0, h = 0): number {
  return (
    MONEY_TOLERANCE_RUSD *
    Math.max(1, Math.abs(a), Math.abs(b), Math.abs(c), Math.abs(d), Math.abs(e), Math.abs(f), Math.abs(g), Math.abs(h))
  );
}

/** Accounts by id with the duplicate-id check, from the cached finance index (D-133). */
function accountMap(finance: FinanceState): ReadonlyMap<number, FinancialAccount> {
  requireArray(finance.accounts, "finance.accounts");
  return buildFinanceIndex(finance).byId;
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
  accounts: ReadonlyMap<number, FinancialAccount>,
  transactionKind: TransactionKind,
  /** `accounts.get` through the finance index's dense id table (D-137). */
  accountOf: (id: number) => FinancialAccount | undefined = (id) => accounts.get(id),
  /**
   * Optional accumulator for the batch path (D-137): validated line deltas are added
   * straight into the batch aggregate instead of a per-entry map. The per-entry map
   * remains for single postings and for callers that need it.
   */
  deltasOut?: Map<number, number>,
  batch?: BatchDeltas,
): ValidatedLines {
  if (lines.length === 0) throw new RangeError("journal posting must contain at least one line");
  const deltas = batch !== undefined ? null : (deltasOut ?? new Map<number, number>());
  let debits = 0;
  let credits = 0;
  let cashDelta = 0;
  // The checks and messages are those of `requireRecord`, `requireInteger` and
  // `requireFiniteNumber`; each line's path is built only when it fails (D-137).
  for (let index = 0; index < lines.length; index += 1) {
    const record: unknown = lines[index];
    if (!isRecord(record)) throw new TypeError(`journal line ${String(index)} must be an object`);
    const accountId = record.accountId;
    if (typeof accountId !== "number" || !Number.isInteger(accountId)) {
      throw new TypeError(`journal line ${String(index)}.accountId must be an integer`);
    }
    if (accountId < 0 || accountId > 0xffff_ffff) {
      throw new RangeError(
        `journal line ${String(index)}.accountId must be in 0..${String(0xffff_ffff)}, received ${String(accountId)}`,
      );
    }
    const account = accountOf(accountId);
    if (account === undefined) {
      throw new RangeError(`journal line ${String(index)} references unknown account ${String(accountId)}`);
    }
    const side = record.side;
    if (side !== "debit" && side !== "credit") {
      throw new RangeError(`journal line ${String(index)}.side must be debit or credit`);
    }
    const amount = record.amountRUSD;
    if (typeof amount !== "number" || !Number.isFinite(amount)) {
      throw new TypeError(`journal line ${String(index)}.amountRUSD must be a finite number`);
    }
    if (!(amount > 0)) {
      throw new RangeError(`journal line ${String(index)}.amountRUSD must be strictly positive`);
    }
    // D-047 semantic matrix: applies to revenue/expense lines for every kind.
    const violation = semanticJournalLineViolation(transactionKind, account, side);
    if (violation !== null) throw new RangeError(`journal line ${String(index)}: ${violation}`);
    const normalSide = accountNormalSide(account.category);
    const signed = side === normalSide ? amount : -amount;
    if (side === "debit") debits += amount;
    else credits += amount;
    if (deltas !== null) {
      deltas.set(accountId, (deltas.get(accountId) ?? 0) + signed);
    } else if (batch !== undefined) {
      const position = batch.positionOf(accountId);
      if (batch.seen[position] === 0) {
        batch.seen[position] = 1;
        batch.delta[position] = 0 + signed;
        batch.touched.push(position);
      } else {
        batch.delta[position] = (batch.delta[position] ?? 0) + signed;
      }
    }
    if (isCashAccount(account)) cashDelta += signed;
  }
  if (Math.abs(debits - credits) > MONEY_TOLERANCE_RUSD) {
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
  if (transactionKind === "trade-freight" || transactionKind === "customs-duty") {
    assertTradePostingStructure(transactionKind, lines, accounts);
  }
  if (transactionKind === "owner-capital-injection") {
    assertOwnerCapitalInjectionStructure(lines, accounts);
  }
  if (
    transactionKind === "monetary-reserve-contribution" ||
    transactionKind === "fx-issuance" ||
    transactionKind === "fx-redemption" ||
    transactionKind === "fx-revaluation"
  ) {
    assertMonetaryPostingStructure(transactionKind, lines, accounts);
  }
  if (transactionKind === "military-pay" || transactionKind === "military-procurement") {
    assertMilitaryPostingStructure(transactionKind, lines, accounts);
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
  accounts: ReadonlyMap<number, FinancialAccount>,
  deltas: Map<number, number>,
): void {
  for (const [accountId, delta] of deltas) {
    const account = accounts.get(accountId);
    if (account === undefined) throw new RangeError(`unknown account ${String(accountId)}`);
    const next = account.balanceRUSD + delta;
    if (!Number.isFinite(next)) {
      throw new RangeError(`posting would make account ${String(accountId)} non-finite`);
    }
    if (!categoryAllowsNegativeBalance(account.category) && next < 0) {
      throw new RangeError(
        `insufficient funds; posting would make ${account.category} account ${String(accountId)} negative: ${String(account.balanceRUSD)} + ${String(delta)} < 0`,
      );
    }
  }
}

/**
 * A cash-neutral posting may leave a floating residual in the designated-cash total.
 * The tolerance is relative to the posting's gross amount (its debits), the scale of
 * the summation error: at 1900 money scales a single posting reaches 1e9-1e10 RUSD
 * (D-135), where an absolute 1e-6 bound is below double-precision resolution.
 */
function assertCashConservation(kind: TransactionKind, cashDelta: number, grossRUSD: number): void {
  if (transactionKindChangesCash(kind)) {
    throw new RangeError(
      `transactionKind ${JSON.stringify(kind)} changes aggregate cash and is not implemented in M4a-1`,
    );
  }
  if (Math.abs(cashDelta) > toleranceMoney(cashDelta, grossRUSD)) {
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
  const lineDeltas = validated.deltas ?? new Map<number, number>();
  assertBalanceConstraints(accounts, lineDeltas);
  assertCashConservation(transactionKind, validated.cashDelta, validated.debits);

  // Apply only after every line, balance, and invariant has been validated.
  for (const [accountId, delta] of lineDeltas) {
    const account = accounts.get(accountId);
    if (account === undefined) throw new RangeError(`unknown account ${String(accountId)}`);
    account.balanceRUSD += delta;
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
  const lineDeltas = validated.deltas ?? new Map<number, number>();
  assertBalanceConstraints(accounts, lineDeltas);
  for (const [accountId, delta] of lineDeltas) {
    const account = accounts.get(accountId);
    if (account === undefined) throw new RangeError(`unknown account ${String(accountId)}`);
    account.balanceRUSD += delta;
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
  options: {
    /**
     * The caller built each entry's line array and line objects for this call and
     * keeps no reference to them (D-139), so retained postings adopt the lines
     * instead of copying them. Defaults to copying.
     */
    readonly adoptLines?: boolean;
  } = {},
): JournalPosting[] {
  assertValidDayIndex(dayIndex);
  const accounts = accountMap(finance);
  const financeIndex = buildFinanceIndex(finance);
  const accountOf = (id: number): FinancialAccount | undefined => financeIndex.account(id);
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

  // Only the newest MAX_AUDIT_POSTINGS entries can remain in the audit buffer after
  // the trim below: older entries are evicted from the front first. Earlier entries
  // are still validated and applied, but their posting objects are not materialised
  // (D-137): a settlement batch creates thousands of wage/upkeep entries per day and
  // the buffer keeps 256.
  const retainedStart = Math.max(0, entries.length - MAX_AUDIT_POSTINGS);
  const accountList = finance.accounts;
  const batch: BatchDeltas = {
    positionOf: (id) => financeIndex.position(id),
    delta: new Float64Array(accountList.length),
    seen: new Uint8Array(accountList.length),
    touched: [],
  };
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (entry === undefined) throw new RangeError(`journal batch entry ${String(index)} is missing`);
    assertPublicTransactionKind(entry.transactionKind);
    const validated = validatePostingLines(
      entry.lines,
      accounts,
      entry.transactionKind,
      accountOf,
      undefined,
      batch,
    );
    assertCashConservation(entry.transactionKind, validated.cashDelta, validated.debits);
  }
  // `assertBalanceConstraints` over the batch, in first-touch order (D-139).
  for (const position of batch.touched) {
    const account = accountList[position] as FinancialAccount;
    const delta = batch.delta[position] ?? 0;
    const next = account.balanceRUSD + delta;
    if (!Number.isFinite(next)) {
      throw new RangeError(`posting would make account ${String(account.id)} non-finite`);
    }
    if (!categoryAllowsNegativeBalance(account.category) && next < 0) {
      throw new RangeError(
        `insufficient funds; posting would make ${account.category} account ${String(account.id)} negative: ${String(account.balanceRUSD)} + ${String(delta)} < 0`,
      );
    }
  }

  for (const position of batch.touched) {
    const account = accountList[position] as FinancialAccount;
    account.balanceRUSD += batch.delta[position] ?? 0;
  }

  // Materialise postings only after every entry is validated and affordable, so a
  // rejected batch leaves the audit buffer and posting id untouched (as before).
  const postings: JournalPosting[] = [];
  let postingId = nextId;
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (entry === undefined) throw new RangeError(`journal batch entry ${String(index)} is missing`);
    // Only the retained tail is copied into the buffer. The returned array keeps the
    // entry's own line array for evicted entries, so callers that read ids or lengths
    // see the same shape.
    const retained = index >= retainedStart;
    const posting: JournalPosting = {
      id: postingId,
      dayIndex,
      transactionKind: entry.transactionKind,
      lines:
        retained && options.adoptLines !== true
          ? entry.lines.map((line) => ({ ...line }))
          : (entry.lines as JournalLine[]),
      sourceEntityId: entry.sourceEntityId ?? null,
      targetEntityId: entry.targetEntityId ?? null,
    };
    if (retained) finance.postings.push(posting);
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
      { accountId: options.toAccountId, side: "debit", amountRUSD: options.amountRUSD },
      { accountId: options.fromAccountId, side: "credit", amountRUSD: options.amountRUSD },
    ],
    sourceEntityId,
    targetEntityId,
  );
}

/**
 * Journal lines of several entries in columns (D-139). Entry `e` owns lines
 * `[entryStart[e], entryStart[e + 1])`; `debit` is 1 for a debit line, 0 for a credit.
 */
export interface JournalLineColumns {
  readonly accountId: number[];
  readonly debit: number[];
  readonly amount: number[];
}

export interface JournalColumnEntry {
  readonly transactionKind: PublicTransactionKind;
  readonly start: number;
  readonly end: number;
  readonly sourceEntityId: Id | null;
  readonly targetEntityId: Id | null;
}

/** Postings applied by `postJournalColumns`, materialised on demand. */
export interface DeferredPostings {
  readonly firstId: number;
  readonly count: number;
  /** Posting objects of entries `from..count - 1` (lines materialised). */
  materialize(from: number): JournalPosting[];
}

/** Kinds whose structure checks read whole line objects; none is a market kind. */
function needsLineObjects(kind: TransactionKind): boolean {
  return !(kind === "goods-purchase" || kind === "input-purchase" || kind === "wages" || kind === "upkeep");
}

/**
 * `postJournalBatch` for entries whose lines are columns (D-139). Every check, its
 * order and message, the batch affordability rule and each account's summation order
 * are those of `postJournalBatch`. The postings get their ids and the balances change,
 * but nothing is added to the audit buffer: the caller materialises the postings that
 * can still be among the newest `MAX_AUDIT_POSTINGS` once it knows how many postings
 * follow them (see `retainDeferredPostings`).
 */
export function postJournalColumns(
  finance: FinanceState,
  dayIndex: Day,
  entries: readonly JournalColumnEntry[],
  lines: JournalLineColumns,
): DeferredPostings {
  assertValidDayIndex(dayIndex);
  const accounts = accountMap(finance);
  const financeIndex = buildFinanceIndex(finance);
  const accountOf = (id: number): FinancialAccount | undefined => financeIndex.account(id);
  const nextId = requireInteger(
    finance.nextPostingId,
    "finance.nextPostingId",
    1,
    Number.MAX_SAFE_INTEGER,
  );
  const lineObjects = (entry: JournalColumnEntry): JournalLine[] => {
    const objects: JournalLine[] = [];
    for (let line = entry.start; line < entry.end; line += 1) {
      objects.push({
        accountId: lines.accountId[line] ?? 0,
        side: lines.debit[line] === 1 ? "debit" : "credit",
        amountRUSD: lines.amount[line] ?? 0,
      });
    }
    return objects;
  };
  const deferred = (count: number): DeferredPostings => ({
    firstId: nextId,
    count,
    materialize(from) {
      const postings: JournalPosting[] = [];
      for (let index = Math.max(0, from); index < count; index += 1) {
        const entry = entries[index] as JournalColumnEntry;
        postings.push({
          id: nextId + index,
          dayIndex,
          transactionKind: entry.transactionKind,
          lines: lineObjects(entry),
          sourceEntityId: entry.sourceEntityId,
          targetEntityId: entry.targetEntityId,
        });
      }
      return postings;
    },
  });
  if (entries.length === 0) return deferred(0);
  if (nextId + entries.length > Number.MAX_SAFE_INTEGER) {
    throw new RangeError("finance posting id overflow");
  }
  const accountList = finance.accounts;
  const batch: BatchDeltas = {
    positionOf: (id) => financeIndex.position(id),
    delta: new Float64Array(accountList.length),
    seen: new Uint8Array(accountList.length),
    touched: [],
  };
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (entry === undefined) throw new RangeError(`journal batch entry ${String(index)} is missing`);
    assertPublicTransactionKind(entry.transactionKind);
    if (needsLineObjects(entry.transactionKind)) {
      const validated = validatePostingLines(
        lineObjects(entry),
        accounts,
        entry.transactionKind,
        accountOf,
        undefined,
        batch,
      );
      assertCashConservation(entry.transactionKind, validated.cashDelta, validated.debits);
      continue;
    }
    if (entry.end <= entry.start) throw new RangeError("journal posting must contain at least one line");
    let debits = 0;
    let credits = 0;
    let cashDelta = 0;
    for (let line = entry.start; line < entry.end; line += 1) {
      const index_ = line - entry.start;
      const accountId = lines.accountId[line];
      if (typeof accountId !== "number" || !Number.isInteger(accountId)) {
        throw new TypeError(`journal line ${String(index_)}.accountId must be an integer`);
      }
      if (accountId < 0 || accountId > 0xffff_ffff) {
        throw new RangeError(
          `journal line ${String(index_)}.accountId must be in 0..${String(0xffff_ffff)}, received ${String(accountId)}`,
        );
      }
      const account = accountOf(accountId);
      if (account === undefined) {
        throw new RangeError(`journal line ${String(index_)} references unknown account ${String(accountId)}`);
      }
      const debit = lines.debit[line];
      if (debit !== 0 && debit !== 1) {
        throw new RangeError(`journal line ${String(index_)}.side must be debit or credit`);
      }
      const side: JournalSide = debit === 1 ? "debit" : "credit";
      const amount = lines.amount[line];
      if (typeof amount !== "number" || !Number.isFinite(amount)) {
        throw new TypeError(`journal line ${String(index_)}.amountRUSD must be a finite number`);
      }
      if (!(amount > 0)) {
        throw new RangeError(`journal line ${String(index_)}.amountRUSD must be strictly positive`);
      }
      const violation = semanticJournalLineViolation(entry.transactionKind, account, side);
      if (violation !== null) throw new RangeError(`journal line ${String(index_)}: ${violation}`);
      const signed = side === accountNormalSide(account.category) ? amount : -amount;
      if (debit === 1) debits += amount;
      else credits += amount;
      const position = batch.positionOf(accountId);
      if (batch.seen[position] === 0) {
        batch.seen[position] = 1;
        batch.delta[position] = 0 + signed;
        batch.touched.push(position);
      } else {
        batch.delta[position] = (batch.delta[position] ?? 0) + signed;
      }
      if (isCashAccount(account)) cashDelta += signed;
    }
    if (Math.abs(debits - credits) > MONEY_TOLERANCE_RUSD) {
      throw new RangeError(
        `journal posting is unbalanced: debits ${String(debits)} != credits ${String(credits)}`,
      );
    }
    assertCashConservation(entry.transactionKind, cashDelta, debits);
  }
  for (const position of batch.touched) {
    const account = accountList[position] as FinancialAccount;
    const delta = batch.delta[position] ?? 0;
    const next = account.balanceRUSD + delta;
    if (!Number.isFinite(next)) {
      throw new RangeError(`posting would make account ${String(account.id)} non-finite`);
    }
    if (!categoryAllowsNegativeBalance(account.category) && next < 0) {
      throw new RangeError(
        `insufficient funds; posting would make ${account.category} account ${String(account.id)} negative: ${String(account.balanceRUSD)} + ${String(delta)} < 0`,
      );
    }
  }
  for (const position of batch.touched) {
    const account = accountList[position] as FinancialAccount;
    account.balanceRUSD += batch.delta[position] ?? 0;
  }
  finance.nextPostingId = nextId + entries.length;
  return deferred(entries.length);
}

/**
 * Add the deferred postings that are still among the newest `MAX_AUDIT_POSTINGS`
 * to the audit buffer (D-139). `laterPostings` is the number of postings applied
 * after them. The buffer then holds exactly what posting them eagerly would have
 * left: the newest postings by id.
 */
export function retainDeferredPostings(
  finance: FinanceState,
  deferredPostings: DeferredPostings,
  laterPostings: number,
): void {
  const survivors = Math.max(0, MAX_AUDIT_POSTINGS - laterPostings);
  if (survivors === 0 || deferredPostings.count === 0) return;
  const retained = deferredPostings.materialize(deferredPostings.count - survivors);
  const merged = [...finance.postings, ...retained].sort((left, right) => left.id - right.id);
  finance.postings = merged.length > MAX_AUDIT_POSTINGS ? merged.slice(merged.length - MAX_AUDIT_POSTINGS) : merged;
}
