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
import { MONEY_TOLERANCE_RUSD } from "../population/constants.js";
import type { Day, Id, MoneyRUSD } from "../types.js";
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
  "monetary-reserve-cash",
  "external-cash",
];

const CASH_SUBTYPE_SET: ReadonlySet<string> = new Set<string>(CASH_SUBTYPES);

const SUBTYPE_CATEGORY: Readonly<Record<AccountSubtype, AccountCategory>> = {
  "household-cash": "asset",
  "operating-cash": "asset",
  "system-reserve-cash": "asset",
  "treasury-cash": "asset",
  "construction-in-progress": "asset",
  "public-capital": "asset",
  "owner-equity": "equity",
  "retained-profit": "equity",
  "wage-income": "revenue",
  "sales-revenue": "revenue",
  "system-income": "revenue",
  "income-tax-revenue": "revenue",
  "business-tax-revenue": "revenue",
  "subsidy-revenue": "revenue",
  "welfare-income": "revenue",
  "administration-income": "revenue",
  "consumption-expense": "expense",
  "input-expense": "expense",
  "wage-expense": "expense",
  "upkeep-expense": "expense",
  "income-tax-expense": "expense",
  "business-tax-expense": "expense",
  "subsidy-expense": "expense",
  "welfare-expense": "expense",
  "administration-expense": "expense",
  "debt-liability": "liability",
  "interest-payable": "liability",
  "interest-expense": "expense",
  "bond-asset": "asset",
  "interest-receivable": "asset",
  "interest-income": "revenue",
  "education-income": "revenue",
  "education-expense": "expense",
  "training-income": "revenue",
  "training-expense": "expense",
  "freight-expense": "expense",
  "customs-duty-expense": "expense",
  "customs-duty-revenue": "revenue",
  "monetary-reserve-cash": "asset",
  "currency-liability": "liability",
  "monetary-equity": "equity",
  "external-cash": "asset",
  "external-currency-holding": "asset",
  "external-equity": "equity",
  "military-income": "revenue",
  "military-expense": "expense",
};

const SUBTYPE_OWNER_KINDS: Readonly<
  Record<AccountSubtype, readonly FinancialAccountOwnerKind[]>
> = {
  "household-cash": ["popBlock"],
  "operating-cash": ["building"],
  "system-reserve-cash": ["system"],
  "treasury-cash": ["country"],
  "construction-in-progress": ["country"],
  "public-capital": ["country"],
  "owner-equity": ["popBlock", "building", "country", "system"],
  "retained-profit": ["building"],
  "wage-income": ["popBlock"],
  "sales-revenue": ["building"],
  "system-income": ["system"],
  "income-tax-revenue": ["country"],
  "business-tax-revenue": ["country"],
  "subsidy-revenue": ["building"],
  "welfare-income": ["popBlock"],
  "administration-income": ["popBlock"],
  "consumption-expense": ["popBlock"],
  "input-expense": ["building"],
  "wage-expense": ["building"],
  "upkeep-expense": ["building"],
  "income-tax-expense": ["popBlock"],
  "business-tax-expense": ["building"],
  "subsidy-expense": ["country"],
  "welfare-expense": ["country"],
  "administration-expense": ["country"],
  "debt-liability": ["country"],
  "interest-payable": ["country"],
  "interest-expense": ["country"],
  "bond-asset": ["country", "popBlock"],
  "interest-receivable": ["country", "popBlock"],
  "interest-income": ["country", "popBlock"],
  "education-income": ["popBlock"],
  "education-expense": ["country"],
  "training-income": ["popBlock"],
  "training-expense": ["country"],
  "freight-expense": ["building"],
  "customs-duty-expense": ["building"],
  "customs-duty-revenue": ["country"],
  "monetary-reserve-cash": ["country"],
  "currency-liability": ["country"],
  "monetary-equity": ["country"],
  "external-cash": ["system"],
  "external-currency-holding": ["system"],
  "external-equity": ["system"],
  "military-income": ["popBlock"],
  "military-expense": ["country"],
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
  return (
    kind === "monetary-issuance" ||
    kind === "monetary-redemption" ||
    kind === "correction"
  );
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
  "administration-payroll": [
    { subtype: "administration-expense", side: "debit" },
    { subtype: "administration-income", side: "credit" },
  ],
  "education-payroll": [
    { subtype: "education-expense", side: "debit" },
    { subtype: "education-income", side: "credit" },
  ],
  "training-payroll": [
    { subtype: "training-expense", side: "debit" },
    { subtype: "training-income", side: "credit" },
  ],
  "training-stipend": [
    { subtype: "training-expense", side: "debit" },
    { subtype: "training-income", side: "credit" },
  ],
  "business-profit-tax": [
    { subtype: "business-tax-expense", side: "debit" },
    { subtype: "business-tax-revenue", side: "credit" },
  ],
  "construction-wage": [{ subtype: "wage-income", side: "credit" }],
  "construction-capitalization": [],
  "construction-writeoff": [],
  "construction-working-capital": [],
  "construction-material-purchase": [
    { subtype: "sales-revenue", side: "credit" },
  ],
  "production-subsidy": [
    { subtype: "subsidy-expense", side: "debit" },
    { subtype: "subsidy-revenue", side: "credit" },
  ],
  "trade-freight": [
    { subtype: "freight-expense", side: "debit" },
    { subtype: "system-income", side: "credit" },
  ],
  "customs-duty": [
    { subtype: "customs-duty-expense", side: "debit" },
    { subtype: "customs-duty-revenue", side: "credit" },
  ],
  "monetary-reserve-contribution": [],
  "fx-issuance": [],
  "fx-redemption": [],
  "fx-revaluation": [],
  "military-pay": [
    { subtype: "military-expense", side: "debit" },
    { subtype: "military-income", side: "credit" },
  ],
  "military-procurement": [
    { subtype: "military-expense", side: "debit" },
    { subtype: "system-income", side: "credit" },
  ],
  "public-enterprise-capital-contribution": [],
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
    if (!Number.isFinite(line.amountRUSD) || !(line.amountRUSD > 0)) {
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
          (blockExpense.get(account.ownerId) ?? 0) + line.amountRUSD,
        );
      } else if (account.subtype === "household-cash" && line.side === "credit") {
        if (account.ownerKind !== "popBlock" || account.ownerId === null) {
          throw new RangeError(`${path} household-cash must belong to a popBlock`);
        }
        blockCash.set(
          account.ownerId,
          (blockCash.get(account.ownerId) ?? 0) + line.amountRUSD,
        );
      } else if (account.subtype === "treasury-cash" && line.side === "debit") {
        if (account.ownerKind !== "country" || account.ownerId === null) {
          throw new RangeError(`${path} treasury-cash must belong to a country`);
        }
        countryOwners.add(account.ownerId);
        countryDebits.set(
          account.ownerId,
          (countryDebits.get(account.ownerId) ?? 0) + line.amountRUSD,
        );
      } else if (account.subtype === "income-tax-revenue" && line.side === "credit") {
        if (account.ownerKind !== "country" || account.ownerId === null) {
          throw new RangeError(`${path} income-tax-revenue must belong to a country`);
        }
        countryOwners.add(account.ownerId);
        countryCredits.set(
          account.ownerId,
          (countryCredits.get(account.ownerId) ?? 0) + line.amountRUSD,
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
          (countryDebits.get(account.ownerId) ?? 0) + line.amountRUSD,
        );
      } else if (account.subtype === "treasury-cash" && line.side === "credit") {
        if (account.ownerKind !== "country" || account.ownerId === null) {
          throw new RangeError(`${path} treasury-cash must belong to a country`);
        }
        countryOwners.add(account.ownerId);
        countryCredits.set(
          account.ownerId,
          (countryCredits.get(account.ownerId) ?? 0) + line.amountRUSD,
        );
      } else if (account.subtype === "household-cash" && line.side === "debit") {
        if (account.ownerKind !== "popBlock" || account.ownerId === null) {
          throw new RangeError(`${path} household-cash must belong to a popBlock`);
        }
        blockCash.set(
          account.ownerId,
          (blockCash.get(account.ownerId) ?? 0) + line.amountRUSD,
        );
      } else if (account.subtype === "welfare-income" && line.side === "credit") {
        if (account.ownerKind !== "popBlock" || account.ownerId === null) {
          throw new RangeError(`${path} welfare-income must belong to a popBlock`);
        }
        blockIncome.set(
          account.ownerId,
          (blockIncome.get(account.ownerId) ?? 0) + line.amountRUSD,
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
    MONEY_TOLERANCE_RUSD * Math.max(1, Math.abs(left), Math.abs(right));
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
 * Enforce the required legs of a country-to-household payroll transfer.
 *
 * One entry moves cash from exactly one country treasury to one or more
 * households: country `<expense>` debit / treasury credit; household cash debit /
 * `<income>` credit. The per-block income and cash legs must match and sum to the
 * country totals. Used by the M8 administration payroll and the M9 education
 * payroll, which share the same structure with different account subtypes.
 */
function assertPayrollPostingStructure(
  lines: readonly JournalLine[],
  accounts: ReadonlyMap<Id, FinancialAccount>,
  expenseSubtype: AccountSubtype,
  incomeSubtype: AccountSubtype,
  label: string,
  path: string,
): void {
  if (lines.length === 0) throw new RangeError(`${path} must contain ${label} lines`);
  const countryOwners = new Set<Id>();
  const countryDebits = new Map<Id, number>();
  const countryCredits = new Map<Id, number>();
  const blockIncome = new Map<Id, number>();
  const blockCash = new Map<Id, number>();
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined) throw new RangeError(`${path}.lines[${String(index)}] is missing`);
    const account = accounts.get(line.accountId);
    if (account === undefined) {
      throw new RangeError(
        `${path}.lines[${String(index)}] references unknown account ${String(line.accountId)}`,
      );
    }
    if (!Number.isFinite(line.amountRUSD) || !(line.amountRUSD > 0)) {
      throw new RangeError(
        `${path}.lines[${String(index)}] requires a strictly positive finite amount`,
      );
    }
    if (account.subtype === expenseSubtype && line.side === "debit") {
      if (account.ownerKind !== "country" || account.ownerId === null) {
        throw new RangeError(`${path} ${expenseSubtype} must belong to a country`);
      }
      countryOwners.add(account.ownerId);
      countryDebits.set(
        account.ownerId,
        (countryDebits.get(account.ownerId) ?? 0) + line.amountRUSD,
      );
    } else if (account.subtype === "treasury-cash" && line.side === "credit") {
      if (account.ownerKind !== "country" || account.ownerId === null) {
        throw new RangeError(`${path} treasury-cash must belong to a country`);
      }
      countryOwners.add(account.ownerId);
      countryCredits.set(
        account.ownerId,
        (countryCredits.get(account.ownerId) ?? 0) + line.amountRUSD,
      );
    } else if (account.subtype === incomeSubtype && line.side === "credit") {
      if (account.ownerKind !== "popBlock" || account.ownerId === null) {
        throw new RangeError(`${path} ${incomeSubtype} must belong to a popBlock`);
      }
      blockIncome.set(
        account.ownerId,
        (blockIncome.get(account.ownerId) ?? 0) + line.amountRUSD,
      );
    } else if (account.subtype === "household-cash" && line.side === "debit") {
      if (account.ownerKind !== "popBlock" || account.ownerId === null) {
        throw new RangeError(`${path} household-cash must belong to a popBlock`);
      }
      blockCash.set(
        account.ownerId,
        (blockCash.get(account.ownerId) ?? 0) + line.amountRUSD,
      );
    } else {
      throw new RangeError(
        `${path} has an invalid ${label} line for ${account.subtype} on the ${line.side} side`,
      );
    }
  }
  if (countryOwners.size !== 1) {
    throw new RangeError(`${path} ${label} must reference exactly one country`);
  }
  const owner = [...countryOwners][0];
  if (owner === undefined) throw new RangeError(`${path} ${label} has no country`);
  const tolerance = (left: number, right: number): number =>
    MONEY_TOLERANCE_RUSD * Math.max(1, Math.abs(left), Math.abs(right));
  const countryDebitTotal = countryDebits.get(owner) ?? 0;
  const countryCreditTotal = countryCredits.get(owner) ?? 0;
  if (!(countryDebitTotal > 0) || !(countryCreditTotal > 0)) {
    throw new RangeError(`${path} ${label} has no positive country total`);
  }
  if (blockIncome.size === 0 || blockCash.size === 0 || blockIncome.size !== blockCash.size) {
    throw new RangeError(`${path} ${label} requires matching block legs`);
  }
  let total = 0;
  for (const [popBlockId, income] of blockIncome) {
    const cash = blockCash.get(popBlockId);
    if (cash === undefined || Math.abs(income - cash) > tolerance(income, cash)) {
      throw new RangeError(
        `${path} ${label} block ${String(popBlockId)} income and cash legs do not match`,
      );
    }
    total += income;
  }
  if (
    Math.abs(total - countryDebitTotal) > tolerance(total, countryDebitTotal) ||
    Math.abs(total - countryCreditTotal) > tolerance(total, countryCreditTotal)
  ) {
    throw new RangeError(`${path} ${label} block totals do not match country totals`);
  }
}

/** Enforce the M8 administration-payroll structure. */
export function assertAdministrationPostingStructure(
  lines: readonly JournalLine[],
  accounts: ReadonlyMap<Id, FinancialAccount>,
  path = "journal posting",
): void {
  assertPayrollPostingStructure(
    lines,
    accounts,
    "administration-expense",
    "administration-income",
    "administration payroll",
    path,
  );
}

/** Enforce the M9 education-payroll structure. */
export function assertEducationPostingStructure(
  lines: readonly JournalLine[],
  accounts: ReadonlyMap<Id, FinancialAccount>,
  path = "journal posting",
): void {
  assertPayrollPostingStructure(
    lines,
    accounts,
    "education-expense",
    "education-income",
    "education payroll",
    path,
  );
}

/** Enforce the E5 training payroll/stipend structure. */
export function assertTrainingPostingStructure(
  lines: readonly JournalLine[],
  accounts: ReadonlyMap<Id, FinancialAccount>,
  path = "journal posting",
): void {
  assertPayrollPostingStructure(
    lines,
    accounts,
    "training-expense",
    "training-income",
    "training payment",
    path,
  );
}

/**
 * Enforce the required legs of the E2 business-profit tax kind.
 *
 * One entry moves cash from exactly one taxed building to exactly one country:
 *
 * - debit the building's `business-tax-expense`, credit its `operating-cash`;
 * - debit the country's `treasury-cash`, credit its `business-tax-revenue`.
 *
 * Both sides must carry the same total. This is structural validation only; the
 * month-end phase proves the amount equals `rate × positive period result` and
 * that the building belongs to the taxing country's provinces.
 */
export function assertBusinessTaxPostingStructure(
  lines: readonly JournalLine[],
  accounts: ReadonlyMap<Id, FinancialAccount>,
  path = "journal posting",
): void {
  if (lines.length === 0) {
    throw new RangeError(`${path} must contain business-profit-tax lines`);
  }
  const buildings = new Set<Id>();
  const countries = new Set<Id>();
  let expenseTotal = 0;
  let cashOutTotal = 0;
  let revenueTotal = 0;
  let cashInTotal = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined) throw new RangeError(`${path}.lines[${String(index)}] is missing`);
    if (!Number.isFinite(line.amountRUSD) || !(line.amountRUSD > 0)) {
      throw new RangeError(
        `${path}.lines[${String(index)}] requires a strictly positive finite amount`,
      );
    }
    const account = accounts.get(line.accountId);
    if (account === undefined) {
      throw new RangeError(
        `${path}.lines[${String(index)}] references unknown account ${String(line.accountId)}`,
      );
    }
    if (account.subtype === "business-tax-expense" && line.side === "debit") {
      if (account.ownerKind !== "building" || account.ownerId === null) {
        throw new RangeError(`${path} business-tax-expense must belong to a building`);
      }
      buildings.add(account.ownerId);
      expenseTotal += line.amountRUSD;
    } else if (account.subtype === "operating-cash" && line.side === "credit") {
      if (account.ownerKind !== "building" || account.ownerId === null) {
        throw new RangeError(`${path} operating-cash must belong to a building`);
      }
      buildings.add(account.ownerId);
      cashOutTotal += line.amountRUSD;
    } else if (account.subtype === "treasury-cash" && line.side === "debit") {
      if (account.ownerKind !== "country" || account.ownerId === null) {
        throw new RangeError(`${path} treasury-cash must belong to a country`);
      }
      countries.add(account.ownerId);
      cashInTotal += line.amountRUSD;
    } else if (account.subtype === "business-tax-revenue" && line.side === "credit") {
      if (account.ownerKind !== "country" || account.ownerId === null) {
        throw new RangeError(`${path} business-tax-revenue must belong to a country`);
      }
      countries.add(account.ownerId);
      revenueTotal += line.amountRUSD;
    } else {
      throw new RangeError(
        `${path} has an invalid business-profit-tax line for ${account.subtype} on the ${line.side} side`,
      );
    }
  }
  if (buildings.size !== 1) {
    throw new RangeError(`${path} business-profit-tax entry must reference exactly one building`);
  }
  if (countries.size !== 1) {
    throw new RangeError(`${path} business-profit-tax entry must reference exactly one country`);
  }
  const tolerance = (left: number, right: number): number =>
    MONEY_TOLERANCE_RUSD * Math.max(1, Math.abs(left), Math.abs(right));
  if (!(expenseTotal > 0) || !(revenueTotal > 0)) {
    throw new RangeError(`${path} business-profit-tax entry has no positive total`);
  }
  if (
    Math.abs(expenseTotal - cashOutTotal) > tolerance(expenseTotal, cashOutTotal) ||
    Math.abs(expenseTotal - revenueTotal) > tolerance(expenseTotal, revenueTotal) ||
    Math.abs(expenseTotal - cashInTotal) > tolerance(expenseTotal, cashInTotal)
  ) {
    throw new RangeError(`${path} business-profit-tax legs do not balance`);
  }
}

/**
 * Enforce the required legs of the E3 construction posting kinds.
 *
 * - `construction-wage`: one country's work-in-progress is debited and its
 *   treasury credited; one or more households are debited (cash) and credited
 *   (`wage-income`) for the same gross total. The entry is a cash-neutral
 *   capitalization of actual labor.
 * - `construction-capitalization`: one country moves completed work-in-progress
 *   to public capital (both assets).
 * - `construction-writeoff`: one country writes cancelled work-in-progress off
 *   against its owner equity.
 * - `construction-working-capital`: one country transfers a working-capital
 *   endowment to one completed state-owned building (country equity/cash to
 *   building cash/equity).
 *
 * This is structural validation only; the construction phase proves the amounts.
 */
export function assertConstructionPostingStructure(
  kind:
    | "construction-wage"
    | "construction-capitalization"
    | "construction-writeoff"
    | "construction-working-capital",
  lines: readonly JournalLine[],
  accounts: ReadonlyMap<Id, FinancialAccount>,
  path = "journal posting",
): void {
  if (lines.length === 0) throw new RangeError(`${path} must contain construction lines`);
  const countries = new Set<Id>();
  const buildings = new Set<Id>();
  const totals = new Map<string, number>();
  const add = (key: string, amount: number): void => {
    totals.set(key, (totals.get(key) ?? 0) + amount);
  };
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined) throw new RangeError(`${path}.lines[${String(index)}] is missing`);
    if (!Number.isFinite(line.amountRUSD) || !(line.amountRUSD > 0)) {
      throw new RangeError(
        `${path}.lines[${String(index)}] requires a strictly positive finite amount`,
      );
    }
    const account = accounts.get(line.accountId);
    if (account === undefined) {
      throw new RangeError(
        `${path}.lines[${String(index)}] references unknown account ${String(line.accountId)}`,
      );
    }
    if (account.ownerKind === "country" && account.ownerId !== null) {
      countries.add(account.ownerId);
    }
    if (account.ownerKind === "building" && account.ownerId !== null) {
      buildings.add(account.ownerId);
    }
    add(`${account.subtype}:${line.side}`, line.amountRUSD);
  }
  const tolerance = (left: number, right: number): number =>
    MONEY_TOLERANCE_RUSD * Math.max(1, Math.abs(left), Math.abs(right));
  const value = (key: string): number => totals.get(key) ?? 0;
  if (kind === "construction-wage") {
    if (countries.size !== 1) {
      throw new RangeError(`${path} construction-wage must reference exactly one country`);
    }
    if (buildings.size !== 0) {
      throw new RangeError(`${path} construction-wage must not reference a building`);
    }
    const gross = value("construction-in-progress:debit");
    if (
      !(gross > 0) ||
      Math.abs(gross - value("treasury-cash:credit")) > tolerance(gross, value("treasury-cash:credit")) ||
      Math.abs(gross - value("household-cash:debit")) > tolerance(gross, value("household-cash:debit")) ||
      Math.abs(gross - value("wage-income:credit")) > tolerance(gross, value("wage-income:credit"))
    ) {
      throw new RangeError(`${path} construction-wage legs do not balance`);
    }
    return;
  }
  if (kind === "construction-capitalization") {
    if (countries.size !== 1 || buildings.size !== 0) {
      throw new RangeError(`${path} construction-capitalization must reference exactly one country`);
    }
    const amount = value("construction-in-progress:credit");
    if (
      !(amount > 0) ||
      Math.abs(amount - value("public-capital:debit")) > tolerance(amount, value("public-capital:debit"))
    ) {
      throw new RangeError(`${path} construction-capitalization legs do not balance`);
    }
    return;
  }
  if (kind === "construction-writeoff") {
    if (countries.size !== 1 || buildings.size !== 0) {
      throw new RangeError(`${path} construction-writeoff must reference exactly one country`);
    }
    const amount = value("construction-in-progress:credit");
    if (
      !(amount > 0) ||
      Math.abs(amount - value("owner-equity:debit")) > tolerance(amount, value("owner-equity:debit"))
    ) {
      throw new RangeError(`${path} construction-writeoff legs do not balance`);
    }
    return;
  }
  if (countries.size !== 1 || buildings.size !== 1) {
    throw new RangeError(
      `${path} construction-working-capital must reference exactly one country and one building`,
    );
  }
  let countryEquityDebit = 0;
  let buildingEquityCredit = 0;
  for (const line of lines) {
    const account = accounts.get(line.accountId);
    if (account === undefined || account.subtype !== "owner-equity") continue;
    if (account.ownerKind === "country" && line.side === "debit") {
      countryEquityDebit += line.amountRUSD;
    } else if (account.ownerKind === "building" && line.side === "credit") {
      buildingEquityCredit += line.amountRUSD;
    } else {
      throw new RangeError(`${path} construction-working-capital has an invalid owner-equity leg`);
    }
  }
  const amount = value("treasury-cash:credit");
  if (
    !(amount > 0) ||
    Math.abs(amount - value("operating-cash:debit")) > tolerance(amount, value("operating-cash:debit")) ||
    Math.abs(amount - countryEquityDebit) > tolerance(amount, countryEquityDebit) ||
    Math.abs(amount - buildingEquityCredit) > tolerance(amount, buildingEquityCredit)
  ) {
    throw new RangeError(`${path} construction-working-capital legs do not balance`);
  }
}

/**
 * Enforce the required legs of E4 industrial postings.
 *
 * - `construction-material-purchase`: one country capitalizes materials
 *   (`construction-in-progress` debit, treasury credit) and pays one market
 *   seller (building operating cash debit, sales revenue credit). All four legs
 *   carry the same purchase value.
 * - `production-subsidy`: one country recognizes subsidy expense and pays one
 *   enterprise (country treasury debit / subsidy expense debit; building
 *   operating cash debit / subsidy revenue credit).
 * - `public-enterprise-capital-contribution`: one country transfers capital to
 *   one state enterprise (country treasury credit/equity debit; building cash
 *   debit/equity credit).
 */
export function assertIndustrialPostingStructure(
  kind:
    | "construction-material-purchase"
    | "production-subsidy"
    | "public-enterprise-capital-contribution",
  lines: readonly JournalLine[],
  accounts: ReadonlyMap<Id, FinancialAccount>,
  path = "journal posting",
): void {
  if (lines.length === 0) throw new RangeError(`${path} must contain industrial lines`);
  const countries = new Set<Id>();
  const buildings = new Set<Id>();
  const totals = new Map<string, number>();
  const add = (key: string, amount: number): void => {
    totals.set(key, (totals.get(key) ?? 0) + amount);
  };
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined) throw new RangeError(`${path}.lines[${String(index)}] is missing`);
    if (!Number.isFinite(line.amountRUSD) || !(line.amountRUSD > 0)) {
      throw new RangeError(
        `${path}.lines[${String(index)}] requires a strictly positive finite amount`,
      );
    }
    const account = accounts.get(line.accountId);
    if (account === undefined) {
      throw new RangeError(
        `${path}.lines[${String(index)}] references unknown account ${String(line.accountId)}`,
      );
    }
    if (account.ownerKind === "country" && account.ownerId !== null) {
      countries.add(account.ownerId);
    }
    if (account.ownerKind === "building" && account.ownerId !== null) {
      buildings.add(account.ownerId);
    }
    add(`${account.subtype}:${line.side}`, line.amountRUSD);
  }
  const tolerance = (left: number, right: number): number =>
    MONEY_TOLERANCE_RUSD * Math.max(1, Math.abs(left), Math.abs(right));
  const value = (key: string): number => totals.get(key) ?? 0;
  if (countries.size !== 1 || buildings.size !== 1) {
    throw new RangeError(
      `${path} ${kind} must reference exactly one country and one building`,
    );
  }
  if (kind === "construction-material-purchase") {
    const amount = value("construction-in-progress:debit");
    if (
      !(amount > 0) ||
      Math.abs(amount - value("treasury-cash:credit")) > tolerance(amount, value("treasury-cash:credit")) ||
      Math.abs(amount - value("operating-cash:debit")) > tolerance(amount, value("operating-cash:debit")) ||
      Math.abs(amount - value("sales-revenue:credit")) > tolerance(amount, value("sales-revenue:credit"))
    ) {
      throw new RangeError(`${path} construction-material-purchase legs do not balance`);
    }
    return;
  }
  if (kind === "production-subsidy") {
    const amount = value("subsidy-expense:debit");
    if (
      !(amount > 0) ||
      Math.abs(amount - value("treasury-cash:credit")) > tolerance(amount, value("treasury-cash:credit")) ||
      Math.abs(amount - value("operating-cash:debit")) > tolerance(amount, value("operating-cash:debit")) ||
      Math.abs(amount - value("subsidy-revenue:credit")) > tolerance(amount, value("subsidy-revenue:credit"))
    ) {
      throw new RangeError(`${path} production-subsidy legs do not balance`);
    }
    return;
  }
  const amount = value("treasury-cash:credit");
  if (
    !(amount > 0) ||
    Math.abs(amount - value("owner-equity:debit")) > tolerance(amount, value("owner-equity:debit")) ||
    Math.abs(amount - value("operating-cash:debit")) > tolerance(amount, value("operating-cash:debit")) ||
    Math.abs(amount - value("owner-equity:credit")) > tolerance(amount, value("owner-equity:credit"))
  ) {
    throw new RangeError(`${path} public-enterprise-capital-contribution legs do not balance`);
  }
}

/**
 * Enforce the required legs of the E6a trade kinds (D-079).
 *
 * - `trade-freight`: one building pays freight from operating cash to the existing
 *   system transport provider. Four equal legs: building `freight-expense` debit,
 *   building `operating-cash` credit, a `system-reserve-cash` debit, and
 *   `system-income` credit.
 * - `customs-duty`: one building pays an import duty to the destination customs
 *   administration's treasury. Four equal legs: building `customs-duty-expense`
 *   debit, building `operating-cash` credit, the country `treasury-cash` debit, and
 *   `customs-duty-revenue` credit.
 */
/**
 * Enforce the required legs of the E6b monetary kinds (D-080).
 *
 * Every kind is a four-line, equal-amount structure with explicit counterparts:
 *
 * - `monetary-reserve-contribution`: treasury cash and country equity exchange against
 *   the authority's reserve cash and monetary equity (capitalization or withdrawal).
 * - `fx-issuance`: the authority receives RUSD reserves and credits its currency
 *   liability; the external counterparty receives currency (RUSD-measured) and pays
 *   RUSD cash.
 * - `fx-redemption`: the reverse.
 * - `fx-revaluation`: a valuation change only — the currency liability and monetary
 *   equity adjust, and the external holding and external equity adjust oppositely. No
 *   cash line exists.
 */
export function assertMonetaryPostingStructure(
  kind:
    | "monetary-reserve-contribution"
    | "fx-issuance"
    | "fx-redemption"
    | "fx-revaluation",
  lines: readonly JournalLine[],
  accounts: ReadonlyMap<Id, FinancialAccount>,
  path = "journal posting",
): void {
  const patterns: Readonly<Record<string, readonly (readonly string[])[]>> = {
    "monetary-reserve-contribution": [
      ["treasury-cash:credit", "owner-equity:debit", "monetary-reserve-cash:debit", "monetary-equity:credit"],
      ["treasury-cash:debit", "owner-equity:credit", "monetary-reserve-cash:credit", "monetary-equity:debit"],
    ],
    "fx-issuance": [
      ["monetary-reserve-cash:debit", "currency-liability:credit", "external-currency-holding:debit", "external-cash:credit"],
    ],
    "fx-redemption": [
      ["monetary-reserve-cash:credit", "currency-liability:debit", "external-currency-holding:credit", "external-cash:debit"],
    ],
    "fx-revaluation": [
      ["currency-liability:credit", "monetary-equity:debit", "external-currency-holding:debit", "external-equity:credit"],
      ["currency-liability:debit", "monetary-equity:credit", "external-currency-holding:credit", "external-equity:debit"],
    ],
  };
  if (lines.length !== 4) {
    throw new RangeError(`${path} ${kind} must contain exactly four lines`);
  }
  const totals = new Map<string, number>();
  let amount = 0;
  const countryIds = new Set<Id>();
  let systemAccounts = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined) throw new RangeError(`${path}.lines[${String(index)}] is missing`);
    if (!Number.isFinite(line.amountRUSD) || !(line.amountRUSD > 0)) {
      throw new RangeError(
        `${path}.lines[${String(index)}] requires a strictly positive finite amount`,
      );
    }
    const account = accounts.get(line.accountId);
    if (account === undefined) {
      throw new RangeError(
        `${path}.lines[${String(index)}] references unknown account ${String(line.accountId)}`,
      );
    }
    if (account.ownerKind === "system") {
      systemAccounts += 1;
    } else if (account.ownerKind === "country" && account.ownerId !== null) {
      countryIds.add(account.ownerId);
    } else {
      throw new RangeError(`${path} ${kind} may only reference country and system accounts`);
    }
    if (index === 0) amount = line.amountRUSD;
    if (Math.abs(line.amountRUSD - amount) > toleranceMoney(amount, line.amountRUSD)) {
      throw new RangeError(`${path} ${kind} legs must carry equal amounts`);
    }
    totals.set(
      `${account.subtype}:${line.side}`,
      (totals.get(`${account.subtype}:${line.side}`) ?? 0) + line.amountRUSD,
    );
  }
  if (countryIds.size !== 1) {
    throw new RangeError(`${path} ${kind} must reference exactly one country authority`);
  }
  const actual = [...totals.keys()].filter((key) => (totals.get(key) ?? 0) > 0).sort();
  const expected = patterns[kind];
  if (expected === undefined) {
    throw new RangeError(`${path} ${kind} is not a registered monetary kind`);
  }
  const matches = expected.some(
    (pattern) =>
      pattern.length === actual.length &&
      pattern.slice().sort().every((key, index) => key === actual[index]),
  );
  if (!matches) {
    throw new RangeError(`${path} ${kind} legs do not match the required structure`);
  }
  if (kind === "fx-issuance" || kind === "fx-redemption" || kind === "fx-revaluation") {
    if (systemAccounts !== 2) {
      throw new RangeError(`${path} ${kind} requires exactly two external system accounts`);
    }
  } else if (systemAccounts !== 0) {
    throw new RangeError(`${path} ${kind} must not reference system accounts`);
  }
}

/**
 * Enforce the required legs of an owner capital injection (D-079).
 *
 * Two accepted forms:
 *
 * - **Cash transfer (pre-E6a contract, two lines):** building `operating-cash` debit /
 *   owner cash credit. This is the documented M3a posting for an owner moving cash into
 *   its enterprise and is preserved unchanged.
 * - **Full equity injection (E6a trade working capital, four lines):** the two cash legs
 *   above plus building `owner-equity` credit and owner `owner-equity` debit. The
 *   building credits its owner equity; the owner debits its own. No money is created,
 *   and the flow is not a loan or a receivable.
 */
export function assertOwnerCapitalInjectionStructure(
  lines: readonly JournalLine[],
  accounts: ReadonlyMap<Id, FinancialAccount>,
  path = "journal posting",
): void {
  if (lines.length !== 2 && lines.length !== 4) {
    throw new RangeError(
      `${path} owner-capital-injection must contain two (cash) or four (equity) lines`,
    );
  }
  const totals = new Map<string, number>();
  const buildingIds = new Set<Id>();
  const ownerKinds = new Set<string>();
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined) throw new RangeError(`${path}.lines[${String(index)}] is missing`);
    if (!Number.isFinite(line.amountRUSD) || !(line.amountRUSD > 0)) {
      throw new RangeError(
        `${path}.lines[${String(index)}] requires a strictly positive finite amount`,
      );
    }
    const account = accounts.get(line.accountId);
    if (account === undefined) {
      throw new RangeError(
        `${path}.lines[${String(index)}] references unknown account ${String(line.accountId)}`,
      );
    }
    if (account.ownerKind === "building" && account.ownerId !== null) {
      buildingIds.add(account.ownerId);
    } else if (account.ownerId !== null) {
      ownerKinds.add(`${account.ownerKind}:${String(account.ownerId)}`);
    }
    totals.set(
      `${account.subtype}:${line.side}`,
      (totals.get(`${account.subtype}:${line.side}`) ?? 0) + line.amountRUSD,
    );
  }
  const value = (key: string): number => totals.get(key) ?? 0;
  if (buildingIds.size !== 1) {
    throw new RangeError(`${path} owner-capital-injection must reference exactly one building`);
  }
  if (ownerKinds.size !== 1) {
    throw new RangeError(`${path} owner-capital-injection must reference exactly one owner`);
  }
  if (lines.length === 2) {
    // Pre-E6a cash-transfer contract: one building operating-cash line and one owner
    // cash line on opposite sides, equal amounts. Both directions have existing
    // callers (an injection into the enterprise and a withdrawal to its owner), so the
    // cash-form direction is not constrained here.
    const buildingCash = value("operating-cash:debit") + value("operating-cash:credit");
    const ownerCash =
      value("household-cash:debit") +
      value("household-cash:credit") +
      value("treasury-cash:debit") +
      value("treasury-cash:credit");
    if (
      !(buildingCash > 0) ||
      Math.abs(buildingCash - ownerCash) > toleranceMoney(buildingCash, ownerCash)
    ) {
      throw new RangeError(`${path} owner-capital-injection cash legs do not balance`);
    }
    return;
  }
  const amount = value("operating-cash:debit");
  if (!(amount > 0)) {
    throw new RangeError(`${path} owner-capital-injection requires a positive operating-cash debit`);
  }
  const ownerCash =
    value("household-cash:credit") + value("treasury-cash:credit");
  if (Math.abs(ownerCash - amount) > toleranceMoney(ownerCash, amount)) {
    throw new RangeError(`${path} owner-capital-injection requires matching owner cash`);
  }
  // Full equity form: the building credits equity, the owner debits it. Their amounts
  // must equal the cash legs; they are distinguished by owner kind.
  let buildingEquity = 0;
  let ownerEquity = 0;
  for (const line of lines) {
    const account = accounts.get(line.accountId);
    if (account === undefined || account.subtype !== "owner-equity") continue;
    if (line.side !== "credit" && line.side !== "debit") continue;
    if (account.ownerKind === "building" && line.side === "credit") {
      buildingEquity += line.amountRUSD;
    } else if (account.ownerKind !== "building" && line.side === "debit") {
      ownerEquity += line.amountRUSD;
    }
  }
  if (
    Math.abs(buildingEquity - amount) > toleranceMoney(buildingEquity, amount) ||
    Math.abs(ownerEquity - amount) > toleranceMoney(ownerEquity, amount)
  ) {
    throw new RangeError(`${path} owner-capital-injection equity legs do not balance`);
  }
}

export function assertTradePostingStructure(
  kind: "trade-freight" | "customs-duty",
  lines: readonly JournalLine[],
  accounts: ReadonlyMap<Id, FinancialAccount>,
  path = "journal posting",
): void {
  if (lines.length !== 4) {
    throw new RangeError(`${path} ${kind} must contain exactly four lines`);
  }
  const totals = new Map<string, number>();
  const buildingIds = new Set<Id>();
  const countryIds = new Set<Id>();
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined) throw new RangeError(`${path}.lines[${String(index)}] is missing`);
    if (!Number.isFinite(line.amountRUSD) || !(line.amountRUSD > 0)) {
      throw new RangeError(
        `${path}.lines[${String(index)}] requires a strictly positive finite amount`,
      );
    }
    const account = accounts.get(line.accountId);
    if (account === undefined) {
      throw new RangeError(
        `${path}.lines[${String(index)}] references unknown account ${String(line.accountId)}`,
      );
    }
    if (account.ownerKind === "building" && account.ownerId !== null) {
      buildingIds.add(account.ownerId);
    }
    if (account.ownerKind === "country" && account.ownerId !== null) {
      countryIds.add(account.ownerId);
    }
    totals.set(
      `${account.subtype}:${line.side}`,
      (totals.get(`${account.subtype}:${line.side}`) ?? 0) + line.amountRUSD,
    );
  }
  const value = (key: string): number => totals.get(key) ?? 0;
  const expenseSubtype = kind === "trade-freight" ? "freight-expense" : "customs-duty-expense";
  const revenueSubtype = kind === "trade-freight" ? "system-income" : "customs-duty-revenue";
  const providerCashSubtype = kind === "trade-freight" ? "system-reserve-cash" : "treasury-cash";
  const amount = value(`${expenseSubtype}:debit`);
  const legs = [
    `${expenseSubtype}:debit`,
    "operating-cash:credit",
    `${providerCashSubtype}:debit`,
    `${revenueSubtype}:credit`,
  ];
  if (!(amount > 0)) {
    throw new RangeError(`${path} ${kind} requires a positive ${expenseSubtype} debit`);
  }
  for (const leg of legs) {
    if (Math.abs(amount - value(leg)) > toleranceMoney(amount, value(leg))) {
      throw new RangeError(`${path} ${kind} legs do not balance (${leg})`);
    }
  }
  if (buildingIds.size !== 1) {
    throw new RangeError(`${path} ${kind} must reference exactly one paying building`);
  }
  if (kind === "customs-duty" && countryIds.size !== 1) {
    throw new RangeError(`${path} customs-duty must reference exactly one destination country`);
  }
}

/**
 * Enforce the required legs of the M10 military kinds (D-081).
 *
 * - `military-pay`: treasury cash moves to the soldiers' province households, so the
 *   country `military-expense` and the pop block `military-income` are the P&L legs.
 * - `military-procurement`: treasury cash moves to the system supplier for equipment.
 * Both are cash-conserving.
 */
export function assertMilitaryPostingStructure(
  kind: "military-pay" | "military-procurement",
  lines: readonly JournalLine[],
  accounts: ReadonlyMap<Id, FinancialAccount>,
  path = "journal posting",
): void {
  if (lines.length !== 4) {
    throw new RangeError(`${path} ${kind} must contain exactly four lines`);
  }
  const totals = new Map<string, number>();
  const countryIds = new Set<Id>();
  const popBlockIds = new Set<Id>();
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined) throw new RangeError(`${path}.lines[${String(index)}] is missing`);
    if (!Number.isFinite(line.amountRUSD) || !(line.amountRUSD > 0)) {
      throw new RangeError(
        `${path}.lines[${String(index)}] requires a strictly positive finite amount`,
      );
    }
    const account = accounts.get(line.accountId);
    if (account === undefined) {
      throw new RangeError(
        `${path}.lines[${String(index)}] references unknown account ${String(line.accountId)}`,
      );
    }
    if (account.ownerKind === "country" && account.ownerId !== null) {
      countryIds.add(account.ownerId);
    }
    if (account.ownerKind === "popBlock" && account.ownerId !== null) {
      popBlockIds.add(account.ownerId);
    }
    totals.set(
      `${account.subtype}:${line.side}`,
      (totals.get(`${account.subtype}:${line.side}`) ?? 0) + line.amountRUSD,
    );
  }
  const value = (key: string): number => totals.get(key) ?? 0;
  const amount = value("military-expense:debit");
  if (!(amount > 0)) {
    throw new RangeError(`${path} ${kind} requires a positive military-expense debit`);
  }
  const legs =
    kind === "military-pay"
      ? [
          "military-expense:debit",
          "treasury-cash:credit",
          "household-cash:debit",
          "military-income:credit",
        ]
      : [
          "military-expense:debit",
          "treasury-cash:credit",
          "system-reserve-cash:debit",
          "system-income:credit",
        ];
  for (const leg of legs) {
    if (Math.abs(amount - value(leg)) > toleranceMoney(amount, value(leg))) {
      throw new RangeError(`${path} ${kind} legs do not balance (${leg})`);
    }
  }
  if (countryIds.size !== 1) {
    throw new RangeError(`${path} ${kind} must reference exactly one paying country`);
  }
  if (kind === "military-pay" && popBlockIds.size !== 1) {
    throw new RangeError(`${path} military-pay must reference exactly one pop block`);
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
    if (!Number.isFinite(line.amountRUSD) || !(line.amountRUSD > 0)) {
      throw new RangeError(`${path}.lines[${String(index)}] requires a strictly positive finite amount`);
    }
    return { line, account };
  });
  const amount = resolved[0]?.line.amountRUSD ?? 0;
  for (const entry of resolved) {
    if (Math.abs(entry.line.amountRUSD - amount) > toleranceMoney(amount, entry.line.amountRUSD)) {
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
    if (!Number.isFinite(line.amountRUSD) || !(line.amountRUSD > 0)) {
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
      entries.reduce((total, entry) => total + entry.line.amountRUSD, 0);
    const issuerDebitTotal = sum(issuerDebits);
    const holderCreditTotal = sum(holderCredits);
    if (
      Math.abs(issuerDebitTotal - issuerEquity.line.amountRUSD) >
        toleranceMoney(issuerDebitTotal, issuerEquity.line.amountRUSD) ||
      Math.abs(holderCreditTotal - holderEquity.line.amountRUSD) >
        toleranceMoney(holderCreditTotal, holderEquity.line.amountRUSD)
    ) {
      throw new RangeError(`${path} ${kind} write-down legs do not balance to owner equity`);
    }
    return;
  }
  if (lines.length !== 4) {
    throw new RangeError(`${path} ${kind} must contain exactly four lines`);
  }
  const amount = resolved[0]?.line.amountRUSD ?? 0;
  for (const entry of resolved) {
    if (Math.abs(entry.line.amountRUSD - amount) > toleranceMoney(amount, entry.line.amountRUSD)) {
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
  const violation = semanticJournalLineViolation(kind, account, side);
  if (violation !== null) throw new RangeError(`${path}: ${violation}`);
}

/**
 * The D-047 semantic-matrix violation of one line, or null when the line is allowed.
 * Separate from `assertSemanticJournalLine` so the posting hot path builds the line
 * path only for a failing line (D-137).
 */
export function semanticJournalLineViolation(
  kind: TransactionKind,
  account: FinancialAccount,
  side: JournalSide,
): string | null {
  if (kind === "correction") {
    // A controlled correction is an audited administrative posting. It may
    // affect any account category; balance/cash/affordability invariants are
    // enforced by the correction API and the surrounding finance validation.
    return null;
  }
  if (account.category !== "revenue" && account.category !== "expense") return null;
  if (kind === "period-close") {
    const required: JournalSide = account.category === "revenue" ? "debit" : "credit";
    if (side !== required) {
      return `period-close may only ${required} ${account.category} account ${String(account.id)} (${account.subtype})`;
    }
    return null;
  }
  const rules = SEMANTIC_LINE_RULES[kind];
  if (!rules.some((rule) => rule.subtype === account.subtype && rule.side === side)) {
    return `transactionKind ${JSON.stringify(kind)} may not ${side} ${account.category} account ${String(account.id)} (${account.subtype}) under the M4b semantic matrix`;
  }
  return null;
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
            countryBudgetTotals: Object.fromEntries(
              Object.entries(summary.countryBudgetTotals).map(([countryId, totals]) => [
                countryId,
                { ...totals },
              ]),
            ),
          })),
    annualSummaries: finance.annualSummaries.map((summary) => ({
      ...summary,
      fiscalTotals: Object.fromEntries(
        Object.entries(summary.fiscalTotals).map(([countryId, totals]) => [
          countryId,
          { ...totals },
        ]),
      ),
      budgetTotals: Object.fromEntries(
        Object.entries(summary.budgetTotals).map(([countryId, totals]) => [
          countryId,
          { ...totals },
        ]),
      ),
      flowTotalsByKind: { ...summary.flowTotalsByKind },
      closingBalances: Object.fromEntries(
        Object.entries(summary.closingBalances).map(([countryId, balances]) => [
          countryId,
          { ...balances },
        ]),
      ),
    })),
    corrections: finance.corrections.map((correction) => ({
      ...correction,
      lines: correction.lines.map((line) => ({ ...line })),
    })),
    nextCorrectionId: finance.nextCorrectionId,
    debtContracts: finance.debtContracts.map((contract) => ({ ...contract })),
    debtHistory: finance.debtHistory.map((aggregate) => ({ ...aggregate })),
    nextContractId: finance.nextContractId,
    budgetMemosThisMonth: Object.fromEntries(
      Object.entries(finance.budgetMemosThisMonth).map(([countryId, memo]) => [
        countryId,
        { ...memo },
      ]),
    ),
    closedThroughDay: finance.closedThroughDay,
  };
}

/**
 * The finance a phase writes (D-137). Staged (the default): a deep copy that the
 * phase publishes only after every posting and check succeeded, so a failure
 * leaves `finance` untouched. In place: `finance` itself, for callers that own
 * atomicity at a larger scope (the integrated economic day). Every phase reads the
 * finance it writes, so both choices compute the same values; in place avoids
 * copying every account and keeps the cached finance index valid.
 */
export function phaseFinance(finance: FinanceState, inPlace: boolean | undefined): FinanceState {
  return inPlace === true ? finance : cloneFinanceState(finance);
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
): number | string {
  // D-137: numeric for integer owner ids (no string per account in validation);
  // other ids keep the string form, which can never equal a number.
  const ownerCode = ownerId === null ? 0 : ownerId + 1;
  if (Number.isInteger(ownerCode) && ownerCode >= 0 && ownerCode < NUMERIC_OWNER_KEY_LIMIT) {
    return ownerCode * 4 + OWNER_KIND_CODES[ownerKind];
  }
  return `${ownerKind}:${ownerId === null ? "-" : String(ownerId)}`;
}

/** Fold one account into an owner-equity tally map. */
export function tallyOwnerEquity(
  tallies: Map<number | string, OwnerEquityTally>,
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
  const tallies = new Map<number | string, OwnerEquityTally>();
  for (const value of requireArray(finance.accounts, "finance.accounts")) {
    tallyOwnerEquity(tallies, value as FinancialAccount);
  }
  assertOwnerEquityTallies(tallies.values());
}

function toleranceMoney(...values: number[]): number {
  let scale = 1;
  for (const value of values) scale = Math.max(scale, Math.abs(value));
  return MONEY_TOLERANCE_RUSD * scale;
}

/** Totals derived from authoritative account balances. */
export interface AccountingTotals {
  readonly assets: MoneyRUSD;
  readonly liabilities: MoneyRUSD;
  readonly equity: MoneyRUSD;
  readonly revenues: MoneyRUSD;
  readonly expenses: MoneyRUSD;
  /** assets - liabilities */
  readonly netWorth: MoneyRUSD;
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
    const balance = account.balanceRUSD;
    // `requireFiniteNumber`'s check and message, built only on failure (D-137).
    if (typeof balance !== "number" || !Number.isFinite(balance)) {
      throw new TypeError(`account ${String(account.id)}.balanceRUSD must be a finite number`);
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
export function designatedCashTotal(finance: FinanceState): MoneyRUSD {
  const accounts = requireArray(finance.accounts, "finance.accounts") as FinancialAccount[];
  let total = 0;
  // D-137: the cached designated-cash accounts, in array order (the order the scan
  // of every account summed them in).
  for (const account of accountLookup(accounts).cash) {
    const balance = account.balanceRUSD;
    // `requireFiniteNumber`'s check and message, built only on failure (D-137).
    if (typeof balance !== "number" || !Number.isFinite(balance)) {
      throw new TypeError(`account ${String(account.id)}.balanceRUSD must be a finite number`);
    }
    total += balance;
  }
  return total;
}

/** Transient owner/subtype lookup. Never serialized, never authoritative. */
export interface FinanceIndex {
  readonly accounts: readonly FinancialAccount[];
  readonly byId: ReadonlyMap<Id, FinancialAccount>;
  /** The account with this id (`byId.get`), through a dense id table when ids are dense (D-137). */
  account(id: Id): FinancialAccount | undefined;
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

const OWNER_KIND_CODES: Readonly<Record<FinancialAccountOwnerKind, number>> = {
  popBlock: 0,
  building: 1,
  country: 2,
  system: 3,
};
const SUBTYPE_CODES: ReadonlyMap<string, number> = new Map(
  ACCOUNT_SUBTYPES.map((subtype, index) => [subtype, index]),
);
/** Owner ids below this bound get a collision-free numeric key. */
const NUMERIC_OWNER_KEY_LIMIT = 2 ** 40;

/**
 * Owner/subtype lookup key. P1: a numeric key avoids building a string for every
 * lookup on the settlement hot path; unusual owner ids fall back to the string form,
 * which can never equal a number, so the two key spaces cannot collide.
 */
export function accountOwnerKey(
  ownerKind: FinancialAccountOwnerKind,
  ownerId: Id | null,
  subtype: AccountSubtype,
): number | string {
  return ownerKey(ownerKind, ownerId, subtype);
}

function ownerKey(
  ownerKind: FinancialAccountOwnerKind,
  ownerId: Id | null,
  subtype: AccountSubtype,
): number | string {
  const subtypeCode = SUBTYPE_CODES.get(subtype);
  const ownerCode = ownerId === null ? 0 : ownerId + 1;
  if (
    subtypeCode !== undefined &&
    subtypeCode < 64 &&
    Number.isInteger(ownerCode) &&
    ownerCode >= 0 &&
    ownerCode < NUMERIC_OWNER_KEY_LIMIT
  ) {
    return (ownerCode * 64 + subtypeCode) * 4 + OWNER_KIND_CODES[ownerKind];
  }
  return `${ownerKind}:${ownerId === null ? "-" : String(ownerId)}:${subtype}`;
}

/** Build the transient account index for one phase. O(accounts). */
interface AccountLookupCache {
  readonly length: number;
  readonly byId: Map<Id, FinancialAccount>;
  readonly byOwner: Map<number | string, FinancialAccount>;
  readonly bySubtype: Map<AccountSubtype, FinancialAccount[]>;
  /** Designated-cash accounts in array order (D-137; subtypes never change). */
  readonly cash: FinancialAccount[];
}

/**
 * P2 derived lookup over an accounts array (D-133). Account ids, owners and
 * subtypes never change after creation and accounts are never removed, so a map
 * built for an array stays valid until accounts are appended; the cache is keyed by
 * the array object and rebuilt when its length changes. It returns the live account
 * objects, holds no authoritative state and cannot change any result: every caller
 * gets exactly the account a linear scan would find.
 */
const accountLookupCache = new WeakMap<readonly FinancialAccount[], AccountLookupCache>();

function accountLookup(accounts: readonly FinancialAccount[]): AccountLookupCache {
  const cached = accountLookupCache.get(accounts);
  if (cached !== undefined && cached.length === accounts.length) return cached;
  const byId = new Map<Id, FinancialAccount>();
  const byOwner = new Map<number | string, FinancialAccount>();
  const bySubtype = new Map<AccountSubtype, FinancialAccount[]>();
  const cash: FinancialAccount[] = [];
  for (const account of accounts) {
    if (!byId.has(account.id)) byId.set(account.id, account);
    const key = ownerKey(account.ownerKind, account.ownerId, account.subtype);
    if (!byOwner.has(key)) byOwner.set(key, account);
    const list = bySubtype.get(account.subtype);
    if (list === undefined) bySubtype.set(account.subtype, [account]);
    else list.push(account);
    if (isCashAccount(account)) cash.push(account);
  }
  const entry = { length: accounts.length, byId, byOwner, bySubtype, cash };
  accountLookupCache.set(accounts, entry);
  return entry;
}

/** The first account with this id, as `accounts.find` would return it. */
export function findAccountById(
  accounts: readonly FinancialAccount[],
  accountId: Id,
): FinancialAccount | undefined {
  return accountLookup(accounts).byId.get(accountId);
}

/** The first account with this owner and subtype, as a linear `find` would return it. */
export function findAccountByOwner(
  accounts: readonly FinancialAccount[],
  ownerKind: FinancialAccountOwnerKind,
  ownerId: Id | null,
  subtype: AccountSubtype,
): FinancialAccount | undefined {
  return accountLookup(accounts).byOwner.get(ownerKey(ownerKind, ownerId, subtype));
}

/** All accounts of one subtype, in array order. */
export function findAccountsBySubtype(
  accounts: readonly FinancialAccount[],
  subtype: AccountSubtype,
): readonly FinancialAccount[] {
  return accountLookup(accounts).bySubtype.get(subtype) ?? [];
}

/**
 * Built indexes per accounts array (D-133). An index is a read-only view whose
 * duplicate checks passed when it was built; appending accounts changes the array
 * length and forces a rebuild with the checks. Ids, owners and subtypes are
 * immutable, so a cached index always equals a fresh build.
 */
const financeIndexCache = new WeakMap<readonly FinancialAccount[], { readonly length: number; readonly index: FinanceIndex }>();

export function buildFinanceIndex(finance: FinanceState): FinanceIndex {
  const cached = financeIndexCache.get(finance.accounts);
  if (cached !== undefined && cached.length === finance.accounts.length) return cached.index;
  const index = buildFinanceIndexUncached(finance);
  financeIndexCache.set(finance.accounts, { length: finance.accounts.length, index });
  return index;
}

function buildFinanceIndexUncached(finance: FinanceState): FinanceIndex {
  const accounts = requireArray(finance.accounts, "finance.accounts") as FinancialAccount[];
  const byId = new Map<Id, FinancialAccount>();
  const byOwner = new Map<number | string, FinancialAccount>();
  const cash: FinancialAccount[] = [];
  for (const account of accounts) {
    if (byId.has(account.id)) {
      throw new RangeError(`duplicate finance account id ${String(account.id)}`);
    }
    byId.set(account.id, account);
    const key = ownerKey(account.ownerKind, account.ownerId, account.subtype);
    // E6b external-counterparty accounts are per-country system accounts addressed by
    // their explicit monetary-state ids; they are the documented duplicate exception
    // (D-080). They are never looked up by owner/subtype.
    const perCountryExternalAccount =
      account.ownerKind === "system" &&
      (account.subtype === "external-cash" ||
        account.subtype === "external-currency-holding" ||
        account.subtype === "external-equity");
    if (byOwner.has(key) && !perCountryExternalAccount) {
      throw new RangeError(
        `duplicate ${account.subtype} account for ${account.ownerKind} ${String(account.ownerId)}`,
      );
    }
    if (!perCountryExternalAccount) byOwner.set(key, account);
    if (isCashAccount(account)) cash.push(account);
  }
  cash.sort((left, right) => left.id - right.id);
  // Account ids are allocated sequentially, so an id-indexed table is small; fall back
  // to the map for sparse ids.
  let maxId = 0;
  for (const account of accounts) if (account.id > maxId) maxId = account.id;
  const dense: (FinancialAccount | undefined)[] | null =
    Number.isSafeInteger(maxId) && maxId <= accounts.length * 4 + 1024
      ? new Array<FinancialAccount | undefined>(maxId + 1).fill(undefined)
      : null;
  if (dense !== null) for (const account of accounts) dense[account.id] = account;
  return {
    accounts,
    byId,
    account(id) {
      if (dense !== null && Number.isInteger(id) && id >= 0 && id < dense.length) return dense[id];
      return byId.get(id);
    },
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
  readonly balanceRUSD: MoneyRUSD;
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
    if (account.balanceRUSD !== 0) {
      throw new RangeError(
        `opening balances require zeroed account ${String(account.id)}; found ${String(account.balanceRUSD)}`,
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
      record.balanceRUSD,
      `opening[${String(index)}].balanceRUSD`,
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
      balanceRUSD: Object.is(balance, -0) ? 0 : balance,
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
    account.balanceRUSD = entry.balanceRUSD;
  }
  // M14 compatibility: the opening-balance checksum is a derived integrity
  // value that predates the RUSD rename. Hash it with the former field spelling
  // so unchanged balances produce the same historical checksum and world hash;
  // the authoritative account field remains balanceRUSD.
  const openingChecksumEntries = normalized.map((entry) => ({
    accountId: entry.accountId,
    balanceSUSD: entry.balanceRUSD,
  }));
  const opening: OpeningBalanceRecord = {
    dayIndex,
    accountCount: accounts.length,
    checksum: checksumOfJson(openingChecksumEntries),
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
