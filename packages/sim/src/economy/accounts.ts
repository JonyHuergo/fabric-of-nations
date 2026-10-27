/**
 * M4a-1 account model helpers, extended by M4b.
 *
 * Scope: category-aware double-entry accounts, the explicit designated-cash
 * set, the accounting-identity and aggregate-cash invariants, atomic opening
 * balances, a transient account index, the central D-047 semantic posting matrix
 * extended by M4c fiscal kinds, the owner-equity invariant, and finance-state
 * cloning. Country/currency identity (M4a-2) and the government fiscal loop
 * (M4c) are implemented; debt, interest, monetary issuance, and later finance
 * stages remain deferred.
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
  type JournalLine,
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
 * M4c adds `treasury-cash` for each country. A later monetary stage may add
 * `central-bank-cash`; the mapping is validated so an extension cannot silently
 * omit an account from `CASH`.
 */
export const CASH_SUBTYPES: readonly AccountSubtype[] = [
  "household-cash",
  "operating-cash",
  "system-reserve-cash",
  "treasury-cash",
];

const CASH_SUBTYPE_SET: ReadonlySet<string> = new Set<string>(CASH_SUBTYPES);

const SUBTYPE_CATEGORY: Readonly<Record<AccountSubtype, AccountCategory>> = {
  "household-cash": "asset",
  "operating-cash": "asset",
  "system-reserve-cash": "asset",
  "treasury-cash": "asset",
  "owner-equity": "equity",
  "retained-profit": "equity",
  "wage-income": "revenue",
  "sales-revenue": "revenue",
  "system-income": "revenue",
  "income-tax-revenue": "revenue",
  "welfare-income": "revenue",
  "consumption-expense": "expense",
  "input-expense": "expense",
  "wage-expense": "expense",
  "upkeep-expense": "expense",
  "income-tax-expense": "expense",
  "welfare-expense": "expense",
  "debt-liability": "liability",
  "interest-payable": "liability",
  "interest-expense": "expense",
  "bond-asset": "asset",
  "interest-receivable": "asset",
  "interest-income": "revenue",
};

const SUBTYPE_OWNER_KINDS: Readonly<
  Record<AccountSubtype, readonly FinancialAccountOwnerKind[]>
> = {
  "household-cash": ["popBlock"],
  "operating-cash": ["building"],
  "system-reserve-cash": ["system"],
  "treasury-cash": ["country"],
  "owner-equity": ["popBlock", "building", "country", "system"],
  "retained-profit": ["building"],
  "wage-income": ["popBlock"],
  "sales-revenue": ["building"],
  "system-income": ["system"],
  "income-tax-revenue": ["country"],
  "welfare-income": ["popBlock"],
  "consumption-expense": ["popBlock"],
  "input-expense": ["building"],
  "wage-expense": ["building"],
  "upkeep-expense": ["building"],
  "income-tax-expense": ["popBlock"],
  "welfare-expense": ["country"],
  "debt-liability": ["country"],
  "interest-payable": ["country"],
  "interest-expense": ["country"],
  "bond-asset": ["country", "popBlock"],
  "interest-receivable": ["country", "popBlock"],
  "interest-income": ["country", "popBlock"],
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
 * - `income-tax`: debit `income-tax-expense`, credit `income-tax-revenue`
 * - `welfare-transfer`: debit `welfare-expense`, credit `welfare-income`
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
  "income-tax": [
    { subtype: "income-tax-expense", side: "debit" },
    { subtype: "income-tax-revenue", side: "credit" },
  ],
  "welfare-transfer": [
    { subtype: "welfare-expense", side: "debit" },
    { subtype: "welfare-income", side: "credit" },
  ],
  "migration-transfer": [],
  "profit-retention": [],
  "profit-distribution": [],
  "state-enterprise-remittance": [],
  "debt-issuance": [],
  "debt-principal-repayment": [],
  "interest-accrual": [
    { subtype: "interest-expense", side: "debit" },
    { subtype: "interest-income", side: "credit" },
  ],
  "interest-payment": [],
  "debt-default-writeoff": [],
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
 * Enforce the required recognition and cash legs of the M4c fiscal kinds.
 *
 * The generic semantic matrix deliberately constrains only revenue/expense
 * subtypes, so cash-only or incomplete entries would otherwise pass public
 * posting validation. A fiscal entry must have, in one balanced entry:
 *
 * - income-tax: household income-tax expense and cash, plus country treasury
 *   cash and income-tax revenue, with equal totals and matching block/country
 *   owners;
 * - welfare-transfer: country welfare expense and treasury cash, plus household
 *   cash and welfare income, with the same totals and matching owners.
 *
 * This is structural validation. It proves the entry has the required legs and
 * balanced fiscal totals; it does not prove that a tax or welfare amount was
 * derived from the economically correct wage or budget calculation.
 */
export function assertFiscalPostingStructure(
  kind: "income-tax" | "welfare-transfer",
  lines: readonly JournalLine[],
  accounts: ReadonlyMap<Id, FinancialAccount>,
  path = "journal posting",
): void {
  if (lines.length === 0) {
    throw new RangeError(`${path} must contain fiscal lines`);
  }
  const countryDebits = new Map<Id, number>();
  const countryCredits = new Map<Id, number>();
  const blockExpense = new Map<Id, number>();
  const blockCash = new Map<Id, number>();
  const blockIncome = new Map<Id, number>();
  const countryOwners = new Set<Id>();
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined) throw new RangeError(`${path}.lines[${String(index)}] is missing`);
    const account = accounts.get(line.accountId);
    if (account === undefined) {
      throw new RangeError(
        `${path}.lines[${String(index)}] references unknown account ${String(line.accountId)}`,
      );
    }
    if (!Number.isFinite(line.amountSUSD) || !(line.amountSUSD > 0)) {
      throw new RangeError(
        `${path}.lines[${String(index)}] requires a strictly positive finite amount`,
      );
    }
    if (kind === "income-tax") {
      if (account.subtype === "income-tax-expense" && line.side === "debit") {
        if (account.ownerKind !== "popBlock" || account.ownerId === null) {
          throw new RangeError(`${path} income-tax-expense must belong to a popBlock`);
        }
        blockExpense.set(
          account.ownerId,
          (blockExpense.get(account.ownerId) ?? 0) + line.amountSUSD,
        );
      } else if (account.subtype === "household-cash" && line.side === "credit") {
        if (account.ownerKind !== "popBlock" || account.ownerId === null) {
          throw new RangeError(`${path} household-cash must belong to a popBlock`);
        }
        blockCash.set(
          account.ownerId,
          (blockCash.get(account.ownerId) ?? 0) + line.amountSUSD,
        );
      } else if (account.subtype === "treasury-cash" && line.side === "debit") {
        if (account.ownerKind !== "country" || account.ownerId === null) {
          throw new RangeError(`${path} treasury-cash must belong to a country`);
        }
        countryOwners.add(account.ownerId);
        countryDebits.set(
          account.ownerId,
          (countryDebits.get(account.ownerId) ?? 0) + line.amountSUSD,
        );
      } else if (account.subtype === "income-tax-revenue" && line.side === "credit") {
        if (account.ownerKind !== "country" || account.ownerId === null) {
          throw new RangeError(`${path} income-tax-revenue must belong to a country`);
        }
        countryOwners.add(account.ownerId);
        countryCredits.set(
          account.ownerId,
          (countryCredits.get(account.ownerId) ?? 0) + line.amountSUSD,
        );
      } else {
        throw new RangeError(
          `${path} has an invalid income-tax line for ${account.subtype} on the ${line.side} side`,
        );
      }
    } else {
      if (account.subtype === "welfare-expense" && line.side === "debit") {
        if (account.ownerKind !== "country" || account.ownerId === null) {
          throw new RangeError(`${path} welfare-expense must belong to a country`);
        }
        countryOwners.add(account.ownerId);
        countryDebits.set(
          account.ownerId,
          (countryDebits.get(account.ownerId) ?? 0) + line.amountSUSD,
        );
      } else if (account.subtype === "treasury-cash" && line.side === "credit") {
        if (account.ownerKind !== "country" || account.ownerId === null) {
          throw new RangeError(`${path} treasury-cash must belong to a country`);
        }
        countryOwners.add(account.ownerId);
        countryCredits.set(
          account.ownerId,
          (countryCredits.get(account.ownerId) ?? 0) + line.amountSUSD,
        );
      } else if (account.subtype === "household-cash" && line.side === "debit") {
        if (account.ownerKind !== "popBlock" || account.ownerId === null) {
          throw new RangeError(`${path} household-cash must belong to a popBlock`);
        }
        blockCash.set(
          account.ownerId,
          (blockCash.get(account.ownerId) ?? 0) + line.amountSUSD,
        );
      } else if (account.subtype === "welfare-income" && line.side === "credit") {
        if (account.ownerKind !== "popBlock" || account.ownerId === null) {
          throw new RangeError(`${path} welfare-income must belong to a popBlock`);
        }
        blockIncome.set(
          account.ownerId,
          (blockIncome.get(account.ownerId) ?? 0) + line.amountSUSD,
        );
      } else {
        throw new RangeError(
          `${path} has an invalid welfare-transfer line for ${account.subtype} on the ${line.side} side`,
        );
      }
    }
  }
  if (countryOwners.size !== 1) {
    throw new RangeError(`${path} fiscal entry must reference exactly one country`);
  }
  const owner = [...countryOwners][0];
  if (owner === undefined) throw new RangeError(`${path} fiscal entry has no country owner`);
  const tolerance = (left: number, right: number): number =>
    MONEY_TOLERANCE_SUSD * Math.max(1, Math.abs(left), Math.abs(right));
  const countryDebitTotal = countryDebits.get(owner) ?? 0;
  const countryCreditTotal = countryCredits.get(owner) ?? 0;
  if (!(countryDebitTotal > 0) || !(countryCreditTotal > 0)) {
    throw new RangeError(`${path} fiscal entry has no positive country-side total`);
  }
  if (kind === "income-tax") {
    if (blockExpense.size === 0 || blockCash.size === 0) {
      throw new RangeError(`${path} income-tax requires household expense and cash legs`);
    }
    if (blockExpense.size !== blockCash.size) {
      throw new RangeError(`${path} income-tax requires matching per-block expense and cash legs`);
    }
    let total = 0;
    for (const [popBlockId, expense] of blockExpense) {
      const cash = blockCash.get(popBlockId);
      if (cash === undefined || Math.abs(expense - cash) > tolerance(expense, cash)) {
        throw new RangeError(
          `${path} income-tax block ${String(popBlockId)} expense and cash legs do not match`,
        );
      }
      total += expense;
    }
    if (
      Math.abs(total - countryDebitTotal) > tolerance(total, countryDebitTotal) ||
      Math.abs(total - countryCreditTotal) > tolerance(total, countryCreditTotal)
    ) {
      throw new RangeError(`${path} income-tax block totals do not match country totals`);
    }
  } else {
    if (blockIncome.size === 0 || blockCash.size === 0) {
      throw new RangeError(
        `${path} welfare-transfer requires household income and cash legs`,
      );
    }
    if (blockIncome.size !== blockCash.size) {
      throw new RangeError(
        `${path} welfare-transfer requires matching per-block income and cash legs`,
      );
    }
    let total = 0;
    for (const [popBlockId, income] of blockIncome) {
      const cash = blockCash.get(popBlockId);
      if (cash === undefined || Math.abs(income - cash) > tolerance(income, cash)) {
        throw new RangeError(
          `${path} welfare-transfer block ${String(popBlockId)} income and cash legs do not match`,
        );
      }
      total += income;
    }
    if (
      Math.abs(total - countryDebitTotal) > tolerance(total, countryDebitTotal) ||
      Math.abs(total - countryCreditTotal) > tolerance(total, countryCreditTotal)
    ) {
      throw new RangeError(`${path} welfare-transfer block totals do not match country totals`);
    }
  }
}

/**
 * Enforce the required legs of the M5a profit-allocation kinds.
 *
 * - `profit-retention`: exactly two equity lines on the same building, one
 *   owner-equity and one retained-profit, opposite sides, equal amounts.
 * - `profit-distribution`: retained-profit and operating-cash on one building,
 *   plus household cash and pop-block owner equity on one recipient household,
 *   all four legs equal.
 * - `state-enterprise-remittance`: retained-profit and operating-cash on one
 *   building, plus country treasury cash and country owner equity, all four legs
 *   equal.
 *
 * This is structural validation only. It does not prove that the amount equals
 * the economically correct distributable profit; the phase and its tests do that.
 */
export function assertProfitAllocationStructure(
  kind: ProfitAllocationKind,
  lines: readonly JournalLine[],
  accounts: ReadonlyMap<Id, FinancialAccount>,
  path = "journal posting",
): void {
  if (lines.length === 0) throw new RangeError(`${path} must contain profit-allocation lines`);
  const resolved = lines.map((line, index) => {
    const account = accounts.get(line.accountId);
    if (account === undefined) {
      throw new RangeError(`${path}.lines[${String(index)}] references unknown account ${String(line.accountId)}`);
    }
    if (!Number.isFinite(line.amountSUSD) || !(line.amountSUSD > 0)) {
      throw new RangeError(`${path}.lines[${String(index)}] requires a strictly positive finite amount`);
    }
    return { line, account };
  });
  const amount = resolved[0]?.line.amountSUSD ?? 0;
  for (const entry of resolved) {
    if (Math.abs(entry.line.amountSUSD - amount) > toleranceMoney(amount, entry.line.amountSUSD)) {
      throw new RangeError(`${path} ${kind} legs must carry equal amounts`);
    }
  }
  const find = (
    predicate: (entry: (typeof resolved)[number]) => boolean,
    description: string,
  ): (typeof resolved)[number] => {
    const matches = resolved.filter(predicate);
    if (matches.length !== 1) {
      throw new RangeError(`${path} ${kind} requires exactly one ${description} leg`);
    }
    const match = matches[0];
    if (match === undefined) throw new RangeError(`${path} ${kind} is missing ${description}`);
    return match;
  };

  if (kind === "profit-retention") {
    if (resolved.length !== 2) {
      throw new RangeError(`${path} ${kind} must contain exactly two lines`);
    }
    const equity = find(
      (entry) => entry.account.ownerKind === "building" && entry.account.subtype === "owner-equity",
      "building owner-equity leg",
    );
    const retained = find(
      (entry) => entry.account.ownerKind === "building" && entry.account.subtype === "retained-profit",
      "building retained-profit leg",
    );
    if (equity.line.side === retained.line.side) {
      throw new RangeError(`${path} ${kind} legs must be on opposite sides`);
    }
    if (equity.account.ownerId === null || equity.account.ownerId !== retained.account.ownerId) {
      throw new RangeError(`${path} ${kind} legs must share one building owner`);
    }
    return;
  }

  const retained = find(
    (entry) =>
      entry.account.ownerKind === "building" &&
      entry.account.subtype === "retained-profit" &&
      entry.line.side === "debit",
    "building retained-profit debit",
  );
  const operating = find(
    (entry) =>
      entry.account.ownerKind === "building" &&
      entry.account.subtype === "operating-cash" &&
      entry.line.side === "credit",
    "building operating-cash credit",
  );
  if (retained.account.ownerId === null || retained.account.ownerId !== operating.account.ownerId) {
    throw new RangeError(`${path} ${kind} building legs must share one building owner`);
  }

  if (kind === "profit-distribution") {
    const cash = find(
      (entry) =>
        entry.account.ownerKind === "popBlock" &&
        entry.account.subtype === "household-cash" &&
        entry.line.side === "debit",
      "household-cash debit",
    );
    const equity = find(
      (entry) =>
        entry.account.ownerKind === "popBlock" &&
        entry.account.subtype === "owner-equity" &&
        entry.line.side === "credit",
      "popBlock owner-equity credit",
    );
    if (cash.account.ownerId === null || cash.account.ownerId !== equity.account.ownerId) {
      throw new RangeError(`${path} ${kind} recipient legs must share one popBlock owner`);
    }
    if (resolved.length !== 4) {
      throw new RangeError(`${path} ${kind} must contain exactly four lines`);
    }
    return;
  }

  const cash = find(
    (entry) =>
      entry.account.ownerKind === "country" &&
      entry.account.subtype === "treasury-cash" &&
      entry.line.side === "debit",
    "country treasury-cash debit",
  );
  const equity = find(
    (entry) =>
      entry.account.ownerKind === "country" &&
      entry.account.subtype === "owner-equity" &&
      entry.line.side === "credit",
    "country owner-equity credit",
  );
  if (cash.account.ownerId === null || cash.account.ownerId !== equity.account.ownerId) {
    throw new RangeError(`${path} ${kind} recipient legs must share one country owner`);
  }
  if (resolved.length !== 4) {
    throw new RangeError(`${path} ${kind} must contain exactly four lines`);
  }
}

/** Account categories and subtypes used by M5a profit allocation. */
export type ProfitAllocationKind =
  | "profit-retention"
  | "profit-distribution"
  | "state-enterprise-remittance";

/** True when `value` is one of the M5a profit-allocation transaction kinds. */
export function isProfitAllocationKind(value: string): value is ProfitAllocationKind {
  return (
    value === "profit-retention" ||
    value === "profit-distribution" ||
    value === "state-enterprise-remittance"
  );
}

/** M5b public-debt transaction kinds. */
export type DebtPostingKind =
  | "debt-issuance"
  | "debt-principal-repayment"
  | "interest-accrual"
  | "interest-payment"
  | "debt-default-writeoff";

/** True when `value` is an M5b debt transaction kind. */
export function isDebtPostingKind(value: string): value is DebtPostingKind {
  return (
    value === "debt-issuance" ||
    value === "debt-principal-repayment" ||
    value === "interest-accrual" ||
    value === "interest-payment" ||
    value === "debt-default-writeoff"
  );
}

/**
 * Enforce the required legs of the M5b debt transaction kinds.
 *
 * Issuance, principal repayment, interest accrual, and interest payment each have
 * exactly four legs: one issuer country account pair and one holder account pair,
 * with matching amounts and matching issuer/holder ownership. The default
 * write-down has a flexible six-leg shape (zero accrued interest omits its legs) and
 * is validated for owner pairing and equality only.
 */
export function assertDebtPostingStructure(
  kind: DebtPostingKind,
  lines: readonly JournalLine[],
  accounts: ReadonlyMap<Id, FinancialAccount>,
  path = "journal posting",
): void {
  if (lines.length === 0) throw new RangeError(`${path} must contain debt lines`);
  const resolved = lines.map((line, index) => {
    const account = accounts.get(line.accountId);
    if (account === undefined) {
      throw new RangeError(`${path}.lines[${String(index)}] references unknown account ${String(line.accountId)}`);
    }
    if (!Number.isFinite(line.amountSUSD) || !(line.amountSUSD > 0)) {
      throw new RangeError(`${path}.lines[${String(index)}] requires a strictly positive finite amount`);
    }
    return { line, account };
  });
  const find = (
    predicate: (entry: (typeof resolved)[number]) => boolean,
    description: string,
  ): (typeof resolved)[number] => {
    const matches = resolved.filter(predicate);
    if (matches.length !== 1) {
      throw new RangeError(`${path} ${kind} requires exactly one ${description} leg`);
    }
    const match = matches[0];
    if (match === undefined) throw new RangeError(`${path} ${kind} is missing ${description}`);
    return match;
  };
  if (kind === "debt-default-writeoff") {
    const issuerEquity = find(
      (entry) =>
        entry.account.ownerKind === "country" &&
        entry.account.subtype === "owner-equity" &&
        entry.line.side === "credit",
      "issuer owner-equity credit",
    );
    const holderEquity = find(
      (entry) =>
        (entry.account.ownerKind === "country" || entry.account.ownerKind === "popBlock") &&
        entry.account.subtype === "owner-equity" &&
        entry.line.side === "debit",
      "holder owner-equity debit",
    );
    const issuerId = issuerEquity.account.ownerId;
    if (issuerId === null || issuerId === holderEquity.account.ownerId) {
      throw new RangeError(`${path} ${kind} issuer and holder must differ`);
    }
    const issuerDebits = resolved.filter(
      (entry) =>
        entry.account.ownerKind === "country" &&
        entry.account.ownerId === issuerId &&
        entry.line.side === "debit",
    );
    const holderCredits = resolved.filter(
      (entry) =>
        entry.account.ownerKind === holderEquity.account.ownerKind &&
        entry.account.ownerId === holderEquity.account.ownerId &&
        entry.line.side === "credit",
    );
    if (issuerDebits.length === 0 || holderCredits.length === 0) {
      throw new RangeError(`${path} ${kind} requires issuer debit and holder credit legs`);
    }
    const sum = (entries: readonly (typeof resolved)[number][]): number =>
      entries.reduce((total, entry) => total + entry.line.amountSUSD, 0);
    const issuerDebitTotal = sum(issuerDebits);
    const holderCreditTotal = sum(holderCredits);
    if (
      Math.abs(issuerDebitTotal - issuerEquity.line.amountSUSD) >
        toleranceMoney(issuerDebitTotal, issuerEquity.line.amountSUSD) ||
      Math.abs(holderCreditTotal - holderEquity.line.amountSUSD) >
        toleranceMoney(holderCreditTotal, holderEquity.line.amountSUSD)
    ) {
      throw new RangeError(`${path} ${kind} write-down legs do not balance to owner equity`);
    }
    return;
  }
  if (lines.length !== 4) {
    throw new RangeError(`${path} ${kind} must contain exactly four lines`);
  }
  const amount = resolved[0]?.line.amountSUSD ?? 0;
  for (const entry of resolved) {
    if (Math.abs(entry.line.amountSUSD - amount) > toleranceMoney(amount, entry.line.amountSUSD)) {
      throw new RangeError(`${path} ${kind} legs must carry equal amounts`);
    }
  }

  if (kind === "interest-accrual") {
    const expense = find(
      (entry) => entry.account.subtype === "interest-expense" && entry.line.side === "debit",
      "issuer interest-expense debit",
    );
    const payable = find(
      (entry) => entry.account.subtype === "interest-payable" && entry.line.side === "credit",
      "issuer interest-payable credit",
    );
    const receivable = find(
      (entry) => entry.account.subtype === "interest-receivable" && entry.line.side === "debit",
      "holder interest-receivable debit",
    );
    const income = find(
      (entry) => entry.account.subtype === "interest-income" && entry.line.side === "credit",
      "holder interest-income credit",
    );
    if (expense.account.ownerId === null || expense.account.ownerId !== payable.account.ownerId) {
      throw new RangeError(`${path} ${kind} issuer legs must share one country owner`);
    }
    if (
      receivable.account.ownerId === null ||
      receivable.account.ownerId !== income.account.ownerId ||
      income.account.ownerKind !== receivable.account.ownerKind
    ) {
      throw new RangeError(`${path} ${kind} holder legs must share one owner`);
    }
    return;
  }

  if (kind === "interest-payment") {
    const payable = find(
      (entry) => entry.account.subtype === "interest-payable" && entry.line.side === "debit",
      "issuer interest-payable debit",
    );
    const treasury = find(
      (entry) => entry.account.subtype === "treasury-cash" && entry.line.side === "credit",
      "issuer treasury-cash credit",
    );
    const cash = find(
      (entry) => (entry.account.subtype === "household-cash" || entry.account.subtype === "treasury-cash") && entry.line.side === "debit",
      "holder cash debit",
    );
    const receivable = find(
      (entry) => entry.account.subtype === "interest-receivable" && entry.line.side === "credit",
      "holder interest-receivable credit",
    );
    if (payable.account.ownerId === null || payable.account.ownerId !== treasury.account.ownerId) {
      throw new RangeError(`${path} ${kind} issuer legs must share one country owner`);
    }
    if (
      cash.account.ownerId === null ||
      cash.account.ownerId !== receivable.account.ownerId ||
      cash.account.ownerKind !== receivable.account.ownerKind
    ) {
      throw new RangeError(`${path} ${kind} holder legs must share one owner`);
    }
    return;
  }

  const issuerDebt = find(
    (entry) => entry.account.ownerKind === "country" && entry.account.subtype === "debt-liability",
    "issuer debt-liability leg",
  );
  const issuerId = issuerDebt.account.ownerId;
  if (issuerId === null) throw new RangeError(`${path} ${kind} issuer debt-liability has no owner`);
  const issuerTreasury = find(
    (entry) => entry.account.ownerKind === "country" && entry.account.ownerId === issuerId && entry.account.subtype === "treasury-cash",
    "issuer treasury leg",
  );
  const holderCash = find(
    (entry) =>
      (entry.account.subtype === "household-cash" || entry.account.subtype === "treasury-cash") &&
      !(entry.account.ownerKind === "country" && entry.account.ownerId === issuerId),
    "holder cash leg",
  );
  const holderAsset = find(
    (entry) => entry.account.subtype === "bond-asset",
    "holder bond-asset leg",
  );
  if (
    holderCash.account.ownerKind !== holderAsset.account.ownerKind ||
    holderCash.account.ownerId === null ||
    holderCash.account.ownerId !== holderAsset.account.ownerId
  ) {
    throw new RangeError(`${path} ${kind} holder cash and bond legs must share one owner`);
  }
  const expectedIssuerSide = kind === "debt-issuance" ? "debit" : "credit";
  const expectedHolderCashSide = kind === "debt-issuance" ? "credit" : "debit";
  const expectedDebtSide = kind === "debt-issuance" ? "credit" : "debit";
  const expectedAssetSide = kind === "debt-issuance" ? "debit" : "credit";
  if (issuerTreasury.line.side !== expectedIssuerSide) {
    throw new RangeError(`${path} ${kind} issuer treasury leg has the wrong side`);
  }
  if (issuerDebt.line.side !== expectedDebtSide) {
    throw new RangeError(`${path} ${kind} issuer debt leg has the wrong side`);
  }
  if (holderCash.line.side !== expectedHolderCashSide) {
    throw new RangeError(`${path} ${kind} holder cash leg has the wrong side`);
  }
  if (holderAsset.line.side !== expectedAssetSide) {
    throw new RangeError(`${path} ${kind} holder bond leg has the wrong side`);
  }
}

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

/**
 * Deep-copy mutable authoritative finance state, including postings.
 *
 * By default closed `periodSummaries` are deep-copied too, preserving the public
 * clone-isolation contract: mutating a cloned summary must not affect the source.
 * The hot tick path can opt into sharing immutable summaries because the staged
 * close only appends a new summary to its own array and never edits an older one
 * (D-059). The default is safe; sharing is an explicit internal caller choice.
 */
export function cloneFinanceState(
  finance: FinanceState,
  options: { readonly shareImmutableSummaries?: boolean } = {},
): FinanceState {
  return {
    accounts: finance.accounts.map((account) => ({ ...account })),
    postings: finance.postings.map((posting) => ({
      ...posting,
      lines: posting.lines.map((line) => ({ ...line })),
    })),
    nextPostingId: finance.nextPostingId,
    nextAccountId: finance.nextAccountId,
    opening: finance.opening === null ? null : { ...finance.opening },
    periodSummaries:
      options.shareImmutableSummaries === true
        ? finance.periodSummaries.slice()
        : finance.periodSummaries.map((summary) => ({
            periodStartDay: summary.periodStartDay,
            periodEndDay: summary.periodEndDay,
            accountTotals: { ...summary.accountTotals },
            flowTotalsByKind: { ...summary.flowTotalsByKind },
            ...(summary.countryFiscalTotals === undefined
              ? {}
              : {
                  countryFiscalTotals: Object.fromEntries(
                    Object.entries(summary.countryFiscalTotals).map(([countryId, totals]) => [
                      countryId,
                      { ...totals },
                    ]),
                  ),
                }),
          })),
    debtContracts: finance.debtContracts.map((contract) => ({ ...contract })),
    nextContractId: finance.nextContractId,
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
