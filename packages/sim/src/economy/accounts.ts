/**
 * M4a-1 account model helpers, extended by M4b.
 *
 * Scope: category-aware double-entry accounts, the explicit designated-cash
 * set, the accounting-identity and aggregate-cash invariants, atomic opening
 * balances, a transient account index, the central D-047 semantic posting matrix,
 * the owner-equity invariant, and finance-state cloning. Country/currency
 * identity, taxes, debt, and monetary issuance are later milestones.
 *
 * Balances are stored in normal-side units: asset and expense accounts are
 * debit-normal, liability, equity, and revenue accounts are credit-normal.
 * Consequently a debit increases an asset balance and a credit increases a
 * revenue balance, which keeps all balances readable as positive magnitudes
 * except equity (which may be negative as an accumulated deficit).
 */

import { assertValidDayIndex } from "../calendar.js";
import { checksumOfJson } from "../hash.js";
import { MONEY_TOLERANCE_SUSD } from "../population/constants.js";
import type { Day, Id, MoneySUSD } from "../types.js";
import {
  requireArray,
  requireFiniteNumber,
  requireInteger,
  requireRecord,
  requireString,
  requireUint32,
} from "../validation.js";
import {
  ACCOUNT_CATEGORIES,
  ACCOUNT_SUBTYPES,
  type AccountCategory,
  type AccountSubtype,
  type FinanceState,
  type FinancialAccount,
  type FinancialAccountOwnerKind,
  type FlowTransactionKind,
  type JournalSide,
  type OpeningBalanceRecord,
  type PublicTransactionKind,
  type TransactionKind,
} from "./types.js";

/**
 * The explicit designated-cash set for I-2. Never substitute "every asset
 * account": later stages add non-cash assets (bond holdings) that must not be
 * counted as simulated cash.
 *
 * `operating-cash` is the building cash subtype, named for consistency with
 * `BuildingInstance.operatingCashAccountId`; the earlier plan wording
 * `building-cash` is superseded.
 *
 * M4a-2/M4g extend `ACCOUNT_SUBTYPES` with `treasury-cash` and
 * `central-bank-cash` when those accounts exist; the mapping is validated so an
 * extension cannot silently omit an account from `CASH`.
 */
export const CASH_SUBTYPES: readonly AccountSubtype[] = [
  "household-cash",
  "operating-cash",
  "system-reserve-cash",
];

const CASH_SUBTYPE_SET: ReadonlySet<string> = new Set<string>(CASH_SUBTYPES);

const SUBTYPE_CATEGORY: Readonly<Record<AccountSubtype, AccountCategory>> = {
  "household-cash": "asset",
  "operating-cash": "asset",
  "system-reserve-cash": "asset",
  "owner-equity": "equity",
  "wage-income": "revenue",
  "sales-revenue": "revenue",
  "system-income": "revenue",
  "consumption-expense": "expense",
  "input-expense": "expense",
  "wage-expense": "expense",
  "upkeep-expense": "expense",
};

const SUBTYPE_OWNER_KINDS: Readonly<
  Record<AccountSubtype, readonly FinancialAccountOwnerKind[]>
> = {
  "household-cash": ["popBlock"],
  "operating-cash": ["building"],
  "system-reserve-cash": ["system"],
  "owner-equity": ["popBlock", "building", "system"],
  "wage-income": ["popBlock"],
  "sales-revenue": ["building"],
  "system-income": ["system"],
  "consumption-expense": ["popBlock"],
  "input-expense": ["building"],
  "wage-expense": ["building"],
  "upkeep-expense": ["building"],
};

const ACCOUNT_SUBTYPE_SET: ReadonlySet<string> = new Set<string>(ACCOUNT_SUBTYPES);
const ACCOUNT_CATEGORY_SET: ReadonlySet<string> = new Set<string>(ACCOUNT_CATEGORIES);

/** Throw unless `value` is a registered account category. */
export function assertValidAccountCategory(value: unknown): asserts value is AccountCategory {
  const text = requireString(value, "account.category", { minLength: 1 });
  if (!ACCOUNT_CATEGORY_SET.has(text)) {
    throw new RangeError(`account.category ${JSON.stringify(text)} is not a registered category`);
  }
}

/** Throw unless `value` is a registered account subtype. */
export function assertValidAccountSubtype(value: unknown): asserts value is AccountSubtype {
  const text = requireString(value, "account.subtype", { minLength: 1 });
  if (!ACCOUNT_SUBTYPE_SET.has(text)) {
    throw new RangeError(`account.subtype ${JSON.stringify(text)} is not a registered subtype`);
  }
}

/** Category implied by a subtype. */
export function categoryForSubtype(subtype: AccountSubtype): AccountCategory {
  return SUBTYPE_CATEGORY[subtype];
}

/** Normal side of an account category. */
export function accountNormalSide(category: AccountCategory): JournalSide {
  return category === "asset" || category === "expense" ? "debit" : "credit";
}

/** True when the subtype belongs to the designated-cash set. */
export function isCashSubtype(subtype: AccountSubtype): boolean {
  return CASH_SUBTYPE_SET.has(subtype);
}

/** True when the account belongs to the designated-cash set. */
export function isCashAccount(account: FinancialAccount): boolean {
  return isCashSubtype(account.subtype);
}

/** True when the subtype may be owned by `ownerKind`. */
export function subtypeAllowsOwnerKind(
  subtype: AccountSubtype,
  ownerKind: FinancialAccountOwnerKind,
): boolean {
  return SUBTYPE_OWNER_KINDS[subtype].includes(ownerKind);
}

/** Sign constraint for a category: equity is the only signed category. */
export function categoryAllowsNegativeBalance(category: AccountCategory): boolean {
  return category === "equity";
}

/** True when the transaction kind may change aggregate designated cash. */
export function transactionKindChangesCash(kind: string): boolean {
  return kind === "monetary-issuance" || kind === "monetary-redemption";
}

/**
 * One permitted revenue/expense journal line for a transaction kind. Cash and
 * equity lines are not listed: they remain governed by the account and cash
 * invariants.
 */
export interface SemanticLineRule {
  readonly subtype: AccountSubtype;
  readonly side: JournalSide;
}

/**
 * D-047 semantic posting matrix, defined once and enforced centrally for
 * individual postings, batched postings, and persisted-posting validation.
 *
 * - `goods-purchase`: debit `consumption-expense`, credit `sales-revenue`
 * - `input-purchase`: debit `input-expense`, credit `sales-revenue`
 * - `wages`: debit `wage-expense`, credit `wage-income`
 * - `upkeep`: debit `upkeep-expense`, credit `system-income`
 *
 * `profit-distribution` and `owner-capital-injection` may not post to revenue or
 * expense accounts. The cash-changing monetary kinds are registered with no
 * revenue/expense semantics; posting them is rejected by the cash invariant.
 */
export const SEMANTIC_LINE_RULES: Readonly<
  Record<PublicTransactionKind, readonly SemanticLineRule[]>
> = {
  "goods-purchase": [
    { subtype: "consumption-expense", side: "debit" },
    { subtype: "sales-revenue", side: "credit" },
  ],
  "input-purchase": [
    { subtype: "input-expense", side: "debit" },
    { subtype: "sales-revenue", side: "credit" },
  ],
  wages: [
    { subtype: "wage-expense", side: "debit" },
    { subtype: "wage-income", side: "credit" },
  ],
  upkeep: [
    { subtype: "upkeep-expense", side: "debit" },
    { subtype: "system-income", side: "credit" },
  ],
  "profit-distribution": [],
  "owner-capital-injection": [],
  "monetary-issuance": [],
  "monetary-redemption": [],
};

/**
 * Expense subtype that measures each gross period flow (D-047). The close derives
 * flow totals from these balances instead of maintaining a redundant accumulator.
 */
export const FLOW_EXPENSE_SUBTYPE: Readonly<Record<FlowTransactionKind, AccountSubtype>> = {
  "goods-purchase": "consumption-expense",
  "input-purchase": "input-expense",
  wages: "wage-expense",
  upkeep: "upkeep-expense",
};

/**
 * Enforce the semantic matrix for one journal line. Lines on asset, liability,
 * and equity accounts are accepted here and remain governed by the account and
 * cash invariants.
 *
 * `period-close` is internal: it may only debit revenue and credit expense
 * accounts, which is what the closing entries do. The remaining close structure
 * (no cash, exactly one net equity line) is validated separately.
 */
export function assertSemanticJournalLine(
  kind: TransactionKind,
  account: FinancialAccount,
  side: JournalSide,
  path: string,
): void {
  if (account.category !== "revenue" && account.category !== "expense") return;
  if (kind === "period-close") {
    const required: JournalSide = account.category === "revenue" ? "debit" : "credit";
    if (side !== required) {
      throw new RangeError(
        `${path}: period-close may only ${required} ${account.category} account ${String(account.id)} (${account.subtype})`,
      );
    }
    return;
  }
  const rules = SEMANTIC_LINE_RULES[kind];
  if (!rules.some((rule) => rule.subtype === account.subtype && rule.side === side)) {
    throw new RangeError(
      `${path}: transactionKind ${JSON.stringify(kind)} may not ${side} ${account.category} account ${String(account.id)} (${account.subtype}) under the M4b semantic matrix`,
    );
  }
}

/** Deep-copy authoritative finance state, including summaries and postings. */
export function cloneFinanceState(finance: FinanceState): FinanceState {
  return {
    accounts: finance.accounts.map((account) => ({ ...account })),
    postings: finance.postings.map((posting) => ({
      ...posting,
      lines: posting.lines.map((line) => ({ ...line })),
    })),
    nextPostingId: finance.nextPostingId,
    nextAccountId: finance.nextAccountId,
    opening: finance.opening === null ? null : { ...finance.opening },
    periodSummaries: finance.periodSummaries.map((summary) => ({
      periodStartDay: summary.periodStartDay,
      periodEndDay: summary.periodEndDay,
      accountTotals: { ...summary.accountTotals },
      flowTotalsByKind: { ...summary.flowTotalsByKind },
    })),
    closedThroughDay: finance.closedThroughDay,
  };
}

/**
 * Mutable per-owner tally used by the D-047 owner-equity invariant. Validation
 * collects tallies inside an existing account pass so the invariant adds no extra
 * per-tick scan.
 */
export interface OwnerEquityTally {
  readonly ownerKind: FinancialAccountOwnerKind;
  readonly ownerId: Id | null;
  requiresEquity: boolean;
  equityAccountCount: number;
}

/** Stable map key for one owner. */
export function ownerEquityKey(
  ownerKind: FinancialAccountOwnerKind,
  ownerId: Id | null,
): string {
  return `${ownerKind}:${ownerId === null ? "-" : String(ownerId)}`;
}

/** Fold one account into an owner-equity tally map. */
export function tallyOwnerEquity(
  tallies: Map<string, OwnerEquityTally>,
  account: FinancialAccount,
): void {
  const key = ownerEquityKey(account.ownerKind, account.ownerId);
  let tally = tallies.get(key);
  if (tally === undefined) {
    tally = {
      ownerKind: account.ownerKind,
      ownerId: account.ownerId,
      requiresEquity: false,
      equityAccountCount: 0,
    };
    tallies.set(key, tally);
  }
  if (account.category === "revenue" || account.category === "expense") {
    tally.requiresEquity = true;
  }
  if (account.subtype === "owner-equity") tally.equityAccountCount += 1;
}

/** Throw unless every owner with revenue/expense accounts has one owner-equity. */
export function assertOwnerEquityTallies(tallies: Iterable<OwnerEquityTally>): void {
  for (const tally of tallies) {
    if (!tally.requiresEquity) continue;
    const label =
      tally.ownerKind === "system"
        ? "system owner"
        : `${tally.ownerKind} owner ${String(tally.ownerId)}`;
    if (tally.equityAccountCount === 0) {
      throw new RangeError(
        `${label} has revenue or expense accounts but no owner-equity account`,
      );
    }
    if (tally.equityAccountCount > 1) {
      throw new RangeError(`${label} has more than one owner-equity account`);
    }
  }
}

/**
 * D-047 owner-equity invariant: every owner with at least one revenue or expense
 * account must have exactly one `owner-equity` account so the close can post the
 * net period result. System owners are covered independently of whether a
 * system-reserve cash account exists.
 *
 * The close calls this before staging any mutation. Published/staged economy
 * validation runs the same check from tallies collected in an existing account
 * pass. It never creates an equity account implicitly.
 */
export function assertOwnerEquityInvariant(finance: FinanceState): void {
  const tallies = new Map<string, OwnerEquityTally>();
  for (const value of requireArray(finance.accounts, "finance.accounts")) {
    tallyOwnerEquity(tallies, value as FinancialAccount);
  }
  assertOwnerEquityTallies(tallies.values());
}

function toleranceMoney(...values: number[]): number {
  let scale = 1;
  for (const value of values) scale = Math.max(scale, Math.abs(value));
  return MONEY_TOLERANCE_SUSD * scale;
}

/** Totals derived from authoritative account balances. */
export interface AccountingTotals {
  readonly assets: MoneySUSD;
  readonly liabilities: MoneySUSD;
  readonly equity: MoneySUSD;
  readonly revenues: MoneySUSD;
  readonly expenses: MoneySUSD;
  /** assets - liabilities */
  readonly netWorth: MoneySUSD;
}

/** Sum authoritative balances by category. Never clamps or repairs. */
export function accountingTotals(finance: FinanceState): AccountingTotals {
  const accounts = requireArray(finance.accounts, "finance.accounts");
  let assets = 0;
  let liabilities = 0;
  let equity = 0;
  let revenues = 0;
  let expenses = 0;
  for (const value of accounts) {
    const account = value as FinancialAccount;
    const balance = requireFiniteNumber(account.balanceSUSD, `account ${String(account.id)}.balanceSUSD`);
    switch (account.category) {
      case "asset":
        assets += balance;
        break;
      case "liability":
        liabilities += balance;
        break;
      case "equity":
        equity += balance;
        break;
      case "revenue":
        revenues += balance;
        break;
      case "expense":
        expenses += balance;
        break;
    }
  }
  return { assets, liabilities, equity, revenues, expenses, netWorth: assets - liabilities };
}

/**
 * I-1: `assets + expenses = liabilities + equity + revenues`.
 * Called after complete entries and at day boundaries, never per line.
 */
export function assertAccountingIdentity(finance: FinanceState): AccountingTotals {
  const totals = accountingTotals(finance);
  const debits = totals.assets + totals.expenses;
  const credits = totals.liabilities + totals.equity + totals.revenues;
  if (Math.abs(debits - credits) > toleranceMoney(debits, credits)) {
    throw new RangeError(
      `accounting identity violated: assets+expenses ${String(debits)} != liabilities+equity+revenues ${String(credits)}`,
    );
  }
  return totals;
}

/**
 * I-2: aggregate designated cash. Ordinary transactions must not change it.
 * Monetary issuance/redemption are the only authorized exceptions and are not
 * implemented in M4a-1.
 */
export function designatedCashTotal(finance: FinanceState): MoneySUSD {
  const accounts = requireArray(finance.accounts, "finance.accounts");
  let total = 0;
  for (const value of accounts) {
    const account = value as FinancialAccount;
    if (!isCashAccount(account)) continue;
    total += requireFiniteNumber(account.balanceSUSD, `account ${String(account.id)}.balanceSUSD`);
  }
  return total;
}

/** Transient owner/subtype lookup. Never serialized, never authoritative. */
export interface FinanceIndex {
  readonly accounts: readonly FinancialAccount[];
  readonly byId: ReadonlyMap<Id, FinancialAccount>;
  /** Look up exactly one account for an owner and subtype, or throw. */
  get(ownerKind: FinancialAccountOwnerKind, ownerId: Id | null, subtype: AccountSubtype): FinancialAccount;
  /** Look up an account for an owner and subtype, or return undefined. */
  find(
    ownerKind: FinancialAccountOwnerKind,
    ownerId: Id | null,
    subtype: AccountSubtype,
  ): FinancialAccount | undefined;
  /** Designated-cash accounts in stable id order. */
  cash(): readonly FinancialAccount[];
}

function ownerKey(
  ownerKind: FinancialAccountOwnerKind,
  ownerId: Id | null,
  subtype: AccountSubtype,
): string {
  return `${ownerKind}:${ownerId === null ? "-" : String(ownerId)}:${subtype}`;
}

/** Build the transient account index for one phase. O(accounts). */
export function buildFinanceIndex(finance: FinanceState): FinanceIndex {
  const accounts = requireArray(finance.accounts, "finance.accounts") as FinancialAccount[];
  const byId = new Map<Id, FinancialAccount>();
  const byOwner = new Map<string, FinancialAccount>();
  const cash: FinancialAccount[] = [];
  for (const account of accounts) {
    if (byId.has(account.id)) {
      throw new RangeError(`duplicate finance account id ${String(account.id)}`);
    }
    byId.set(account.id, account);
    const key = ownerKey(account.ownerKind, account.ownerId, account.subtype);
    if (byOwner.has(key)) {
      throw new RangeError(
        `duplicate ${account.subtype} account for ${account.ownerKind} ${String(account.ownerId)}`,
      );
    }
    byOwner.set(key, account);
    if (isCashAccount(account)) cash.push(account);
  }
  cash.sort((left, right) => left.id - right.id);
  return {
    accounts,
    byId,
    get(ownerKind, ownerId, subtype) {
      const account = byOwner.get(ownerKey(ownerKind, ownerId, subtype));
      if (account === undefined) {
        throw new RangeError(
          `missing ${subtype} account for ${ownerKind} ${String(ownerId)}`,
        );
      }
      return account;
    },
    find(ownerKind, ownerId, subtype) {
      return byOwner.get(ownerKey(ownerKind, ownerId, subtype));
    },
    cash() {
      return cash;
    },
  };
}

/** One opening balance to apply. */
export interface OpeningBalanceEntry {
  readonly accountId: Id;
  readonly balanceSUSD: MoneySUSD;
}

/**
 * D-046a/D-047: apply opening balances once, atomically, with explicit equity
 * counterparts supplied by the caller.
 *
 * - Rejects a second application.
 * - Requires every account to start at zero, so balances cannot be silently
 *   re-initialized.
 * - Rejects nonzero opening entries for revenue and expense accounts: those
 *   accounts start at zero so an expense balance measures exactly one period's
 *   gross activity. Opening balance-sheet balances remain allowed.
 * - Validates every entry against its account and category before mutating.
 * - Validates the aggregate accounting identity before mutating.
 * - Records a provenance record and returns it.
 *
 * Opening balances are the initial condition, not a transaction, so they do not
 * create journal postings; every later change posts in full.
 */
export function applyOpeningBalances(
  finance: FinanceState,
  dayIndex: Day,
  entries: readonly OpeningBalanceEntry[],
): OpeningBalanceRecord {
  assertValidDayIndex(dayIndex);
  if (finance.opening !== null) {
    throw new RangeError("opening balances have already been applied");
  }
  const accounts = requireArray(finance.accounts, "finance.accounts") as FinancialAccount[];
  const byId = new Map<Id, FinancialAccount>();
  for (const account of accounts) {
    if (byId.has(account.id)) {
      throw new RangeError(`duplicate finance account id ${String(account.id)}`);
    }
    byId.set(account.id, account);
    if (account.balanceSUSD !== 0) {
      throw new RangeError(
        `opening balances require zeroed account ${String(account.id)}; found ${String(account.balanceSUSD)}`,
      );
    }
  }

  const seen = new Set<Id>();
  const normalized: OpeningBalanceEntry[] = [];
  let assets = 0;
  let liabilities = 0;
  let equity = 0;
  let revenues = 0;
  let expenses = 0;
  for (let index = 0; index < entries.length; index += 1) {
    const record = requireRecord(entries[index], `opening[${String(index)}]`);
    const accountId = requireUint32(record.accountId, `opening[${String(index)}].accountId`);
    if (seen.has(accountId)) {
      throw new RangeError(`duplicate opening balance for account ${String(accountId)}`);
    }
    seen.add(accountId);
    const account = byId.get(accountId);
    if (account === undefined) {
      throw new RangeError(`opening balance references unknown account ${String(accountId)}`);
    }
    const balance = requireFiniteNumber(
      record.balanceSUSD,
      `opening[${String(index)}].balanceSUSD`,
    );
    if (!categoryAllowsNegativeBalance(account.category) && balance < 0) {
      throw new RangeError(
        `opening balance for ${account.category} account ${String(accountId)} must be non-negative`,
      );
    }
    if ((account.category === "revenue" || account.category === "expense") && balance !== 0) {
      throw new RangeError(
        `opening balance for ${account.category} account ${String(accountId)} must be zero; revenue and expense accounts start at zero so expense balances measure gross period activity`,
      );
    }
    switch (account.category) {
      case "asset":
        assets += balance;
        break;
      case "liability":
        liabilities += balance;
        break;
      case "equity":
        equity += balance;
        break;
      case "revenue":
        revenues += balance;
        break;
      case "expense":
        expenses += balance;
        break;
    }
    normalized.push({
      accountId,
      balanceSUSD: Object.is(balance, -0) ? 0 : balance,
    });
  }

  const debits = assets + expenses;
  const credits = liabilities + equity + revenues;
  if (Math.abs(debits - credits) > toleranceMoney(debits, credits)) {
    throw new RangeError(
      `opening balances are not balanced: assets+expenses ${String(debits)} != liabilities+equity+revenues ${String(credits)}`,
    );
  }

  normalized.sort((left, right) => left.accountId - right.accountId);
  for (const entry of normalized) {
    const account = byId.get(entry.accountId);
    if (account === undefined) throw new RangeError(`unknown account ${String(entry.accountId)}`);
    account.balanceSUSD = entry.balanceSUSD;
  }
  const opening: OpeningBalanceRecord = {
    dayIndex,
    accountCount: accounts.length,
    checksum: checksumOfJson(normalized),
  };
  finance.opening = opening;
  return opening;
}

/** Validate the persisted opening record shape. */
export function assertValidOpeningRecord(record: OpeningBalanceRecord): void {
  const value = requireRecord(record, "finance.opening");
  const dayIndex = requireInteger(
    value.dayIndex,
    "finance.opening.dayIndex",
    0,
    Number.MAX_SAFE_INTEGER,
  );
  assertValidDayIndex(dayIndex);
  requireInteger(value.accountCount, "finance.opening.accountCount", 0, Number.MAX_SAFE_INTEGER);
  requireString(value.checksum, "finance.opening.checksum", { minLength: 1 });
}

/** Export the subtype/category map for validation and reporting. */
export function accountSubtypeCategory(): Readonly<Record<AccountSubtype, AccountCategory>> {
  return SUBTYPE_CATEGORY;
}
