/**
 * M4b monthly period close (D-047).
 *
 * An economic world closes its books on the last civil day of every Gregorian
 * month, after that day's daily postings, needs/militancy update, and month-end
 * wealth update, and before `dayIndex` advances (GDD §4.2 step 14). The first
 * period starts at `World.startDayIndex` and may be partial. M2-only worlds do
 * not close, and the terminal 2000-01-01 boundary is never closed.
 *
 * Closing is atomic: the complete finance change is staged on an isolated deep
 * copy. Closing entries and the immutable summary are created on the copy, the
 * closed boundary is advanced on the copy, and the complete staged finance state
 * is validated before replacing `world.finance`. Any failure leaves the original
 * accounts, balances, postings, summaries, and close boundary unchanged.
 *
 * The close is a staging operation. A staged close may temporarily have
 * `closedThroughDay === world.dayIndex`; publishing (validation, serialization,
 * hashing, deserialization, or `tick`) requires the day to advance first.
 *
 * Deferred by design: corporate/consumption/land/tariff taxes, government
 * services and procurement, debt, interest, banks, monetary issuance, FX
 * conversion, inflation, annual close, reopen/reversal, and retained-earnings
 * subtypes. M4c governments close income-tax revenue and welfare expense into
 * the country owner equity through the same monthly entry as other owners.
 */

import {
  assertValidDayIndex,
  civilDateToDayIndex,
  dayIndexToCivilDate,
  daysInMonth,
  isTerminalDayIndex,
} from "../calendar.js";
import { MONEY_TOLERANCE_SUSD } from "../population/constants.js";
import type { Day, Id, MoneySUSD, Month } from "../types.js";
import { requireInteger } from "../validation.js";
import type { World } from "../world.js";
import {
  accountNormalSide,
  assertAccountingIdentity,
  assertOwnerEquityInvariant,
  categoryAllowsNegativeBalance,
  cloneFinanceState,
  FLOW_EXPENSE_SUBTYPE,
} from "./accounts.js";
import {
  MAX_ANNUAL_SUMMARIES,
  MAX_AUDIT_POSTINGS,
  MAX_DETAILED_PERIOD_SUMMARIES,
} from "./constants.js";
import {
  addBudgetTotals,
  budgetTotalsFromMemo,
  emptyBudgetTotals,
  readBudgetMemo,
} from "./budget.js";
import {
  FLOW_TRANSACTION_KINDS,
  type AnnualClosingBalances,
  type AnnualFinanceSummary,
  type FinancePeriodBudgetTotals,
  type FinancePeriodFiscalTotals,
  type FinancePeriodSummary,
  type FinanceState,
  type FinancialAccount,
  type FinancialAccountOwnerKind,
  type FlowTransactionKind,
  type JournalLine,
  type JournalPosting,
} from "./types.js";
import { assertValidFinanceState, assertValidPeriodSummaries } from "./validation.js";

/** Result of one successful period close. */
export interface FinanceCloseResult {
  readonly summary: FinancePeriodSummary;
  readonly postingIds: readonly number[];
  /** Accounts zeroed by the closing entries, in posting order. */
  readonly closedAccountIds: readonly Id[];
  /**
   * Transient single-use marker for the M5a profit-allocation phase. It is not
   * persisted and is set only after the staged allocation has been published.
   */
  profitDistributionApplied: boolean;
}

/** Derived government totals for one persisted M4b summary. */
export interface GovernmentPeriodTotals {
  readonly countryId: Id;
  readonly incomeTaxRevenueSUSD: MoneySUSD;
  /** E2 business-profit tax revenue collected by the country. */
  readonly businessTaxRevenueSUSD: MoneySUSD;
  readonly welfareExpenseSUSD: MoneySUSD;
  /** M5b interest expense accrued in the period. */
  readonly interestExpenseSUSD: MoneySUSD;
  /** E4 sectoral production-subsidy expense paid in the period. */
  readonly subsidyExpenseSUSD: MoneySUSD;
  /** M8 public-administration payroll paid in the period. */
  readonly administrationExpenseSUSD?: MoneySUSD;
  /** M9 education/research payroll paid in the period. */
  readonly educationExpenseSUSD?: MoneySUSD;
  /** E5 training provider payroll and trainee stipend paid in the period. */
  readonly trainingExpenseSUSD?: MoneySUSD;
  /** M10 military pay, equipment, and garrison procurement paid in the period. */
  readonly militaryExpenseSUSD?: MoneySUSD;
  /** E6a customs duty collected by this country's customs administration. */
  readonly customsDutyRevenueSUSD?: MoneySUSD;
  /** Tax and customs revenue minus welfare, interest, subsidy, administration, education, and training expense. */
  readonly netFiscalResultSUSD: MoneySUSD;
}

/**
 * Derive per-country government totals from one frozen period summary and the
 * current account registry. This is reporting only: it stores no redundant
 * totals, does not modify the summary, and does not add a flow kind.
 *
 * The caller must supply the finance state whose accounts the summary references.
 * Account deletion/remapping is not implemented, so the registry remains valid
 * for historical summaries in the current schema.
 */
export function governmentPeriodTotals(
  finance: FinanceState,
  summary: FinancePeriodSummary,
): GovernmentPeriodTotals[] {
  if (summary.countryFiscalTotals !== undefined) {
    return Object.entries(summary.countryFiscalTotals)
      .map(([countryIdText, totals]) => {
        const countryId = Number(countryIdText);
        return {
          countryId,
          incomeTaxRevenueSUSD: totals.incomeTaxRevenueSUSD,
          businessTaxRevenueSUSD: totals.businessTaxRevenueSUSD,
          welfareExpenseSUSD: totals.welfareExpenseSUSD,
          interestExpenseSUSD: totals.interestExpenseSUSD,
          subsidyExpenseSUSD: totals.subsidyExpenseSUSD,
          administrationExpenseSUSD: totals.administrationExpenseSUSD ?? 0,
          educationExpenseSUSD: totals.educationExpenseSUSD ?? 0,
          trainingExpenseSUSD: totals.trainingExpenseSUSD ?? 0,
          militaryExpenseSUSD: totals.militaryExpenseSUSD ?? 0,
          customsDutyRevenueSUSD: totals.customsDutyRevenueSUSD ?? 0,
          netFiscalResultSUSD: totals.netFiscalResultSUSD,
        };
      })
      .sort((left, right) => left.countryId - right.countryId);
  }
  const accounts = new Map<Id, FinancialAccount>();
  for (const account of finance.accounts) accounts.set(account.id, account);
  const totals = new Map<
    Id,
    {
      tax: number;
      businessTax: number;
      welfare: number;
      interest: number;
      subsidy: number;
      administration: number;
      education: number;
      training: number;
      military: number;
      customs: number;
    }
  >();
  for (const account of finance.accounts) {
    if (account.ownerKind === "country" && account.ownerId !== null) {
      totals.set(
        account.ownerId,
        totals.get(account.ownerId) ?? {
          tax: 0,
          businessTax: 0,
          welfare: 0,
          interest: 0,
          subsidy: 0,
          administration: 0,
          education: 0,
          training: 0,
          military: 0,
          customs: 0,
        },
      );
    }
  }
  for (const [accountIdText, value] of Object.entries(summary.accountTotals)) {
    if (!Number.isFinite(value)) {
      throw new RangeError(`summary account total ${accountIdText} is not finite`);
    }
    const accountId = Number(accountIdText);
    if (!Number.isSafeInteger(accountId) || accountId < 0 || accountId > 0xffff_ffff) {
      throw new RangeError(`summary account total ${accountIdText} is not a valid account id`);
    }
    const account = accounts.get(accountId);
    if (account === undefined) {
      throw new RangeError(`summary account total ${accountIdText} references unknown account`);
    }
    if (account.ownerKind !== "country" || account.ownerId === null) continue;
    if (
      account.subtype !== "income-tax-revenue" &&
      account.subtype !== "business-tax-revenue" &&
      account.subtype !== "welfare-expense" &&
      account.subtype !== "interest-expense" &&
      account.subtype !== "subsidy-expense" &&
      account.subtype !== "administration-expense" &&
      account.subtype !== "education-expense" &&
      account.subtype !== "training-expense" &&
      account.subtype !== "military-expense" &&
      account.subtype !== "customs-duty-revenue"
    ) {
      continue;
    }
    const current =
      totals.get(account.ownerId) ?? {
        tax: 0,
        businessTax: 0,
        welfare: 0,
        interest: 0,
        subsidy: 0,
        administration: 0,
        education: 0,
        training: 0,
        military: 0,
        customs: 0,
      };
    if (account.subtype === "income-tax-revenue") current.tax += value;
    else if (account.subtype === "business-tax-revenue") current.businessTax += value;
    else if (account.subtype === "welfare-expense") current.welfare += value;
    else if (account.subtype === "interest-expense") current.interest += value;
    else if (account.subtype === "subsidy-expense") current.subsidy += value;
    else if (account.subtype === "education-expense") current.education += value;
    else if (account.subtype === "training-expense") current.training += value;
    else if (account.subtype === "military-expense") current.military += value;
    else if (account.subtype === "customs-duty-revenue") current.customs += value;
    else current.administration += value;
    totals.set(account.ownerId, current);
  }
  return [...totals.entries()]
    .map(([countryId, values]) => ({
      countryId,
      incomeTaxRevenueSUSD: values.tax,
      businessTaxRevenueSUSD: values.businessTax,
      welfareExpenseSUSD: values.welfare,
      interestExpenseSUSD: values.interest,
      subsidyExpenseSUSD: values.subsidy,
      administrationExpenseSUSD: values.administration,
      educationExpenseSUSD: values.education,
      trainingExpenseSUSD: values.training,
      militaryExpenseSUSD: values.military,
      customsDutyRevenueSUSD: values.customs,
      netFiscalResultSUSD:
        values.tax +
        values.businessTax +
        values.customs -
        values.welfare -
        values.interest -
        values.subsidy -
        values.administration -
        values.education -
        values.training -
        values.military,
    }))
    .sort((left, right) => left.countryId - right.countryId);
}

/**
 * Compact old monthly summaries to exact per-country fiscal totals plus the four
 * gross flow totals (D-065). The most recent `MAX_DETAILED_PERIOD_SUMMARIES`
 * retain their full pre-close trial balance for the Ledger window. This is a
 * deterministic state transformation: no simulation decision reads a historical
 * `accountTotals`, and every retained fiscal value is exact.
 *
 * Returns the number of newly compacted summaries.
 */
export function compactFinanceHistory(finance: FinanceState): number {
  const cutoff = Math.max(0, finance.periodSummaries.length - MAX_DETAILED_PERIOD_SUMMARIES);
  let compacted = 0;
  for (let index = 0; index < cutoff; index += 1) {
    const summary = finance.periodSummaries[index];
    if (summary === undefined || summary.countryFiscalTotals !== undefined) continue;
    const totals = governmentPeriodTotals(finance, summary);
    const countryFiscalTotals: Record<Id, FinancePeriodFiscalTotals> = {};
    for (const entry of totals) {
      countryFiscalTotals[entry.countryId] = {
        incomeTaxRevenueSUSD: entry.incomeTaxRevenueSUSD,
        businessTaxRevenueSUSD: entry.businessTaxRevenueSUSD,
        welfareExpenseSUSD: entry.welfareExpenseSUSD,
        interestExpenseSUSD: entry.interestExpenseSUSD,
        subsidyExpenseSUSD: entry.subsidyExpenseSUSD,
        administrationExpenseSUSD: entry.administrationExpenseSUSD ?? 0,
        educationExpenseSUSD: entry.educationExpenseSUSD ?? 0,
        trainingExpenseSUSD: entry.trainingExpenseSUSD ?? 0,
        customsDutyRevenueSUSD: entry.customsDutyRevenueSUSD ?? 0,
        netFiscalResultSUSD: entry.netFiscalResultSUSD,
      };
    }
    finance.periodSummaries[index] = {
      periodStartDay: summary.periodStartDay,
      periodEndDay: summary.periodEndDay,
      accountTotals: {},
      flowTotalsByKind: { ...summary.flowTotalsByKind },
      countryFiscalTotals,
      countryBudgetTotals: Object.fromEntries(
        Object.entries(summary.countryBudgetTotals).map(([countryId, budget]) => [
          countryId,
          { ...budget },
        ]),
      ),
    };
    compacted += 1;
  }
  return compacted;
}

function toleranceMoney(...values: number[]): number {
  let scale = 1;
  for (const value of values) scale = Math.max(scale, Math.abs(value));
  return MONEY_TOLERANCE_SUSD * scale;
}

function isLastCivilDayOfMonth(dayIndex: Day): boolean {
  const date = dayIndexToCivilDate(dayIndex);
  return date.day === daysInMonth(date.year, date.month);
}

/** Last day of the civil month containing `dayIndex`, or `dayIndex` itself. */
function monthEndOnOrAfter(dayIndex: Day): Day {
  const date = dayIndexToCivilDate(dayIndex);
  return dayIndex + (daysInMonth(date.year, date.month) - date.day);
}

/** First civil month-end strictly after `dayIndex`. */
function nextMonthEndAfter(dayIndex: Day): Day {
  const currentMonthEnd = monthEndOnOrAfter(dayIndex);
  if (currentMonthEnd > dayIndex) return currentMonthEnd;
  const date = dayIndexToCivilDate(dayIndex);
  const nextYear = date.month === 12 ? date.year + 1 : date.year;
  const nextMonth = (date.month === 12 ? 1 : date.month + 1) as Month;
  return dayIndex + daysInMonth(nextYear, nextMonth);
}

interface ClosePeriodBounds {
  readonly startDay: Day;
  readonly endDay: Day;
}

/**
 * Resolve the period being closed and reject duplicate, out-of-order, or gapped
 * closes before anything is staged.
 *
 * With no prior close, the first period is `[startDayIndex, dayIndex]` and may
 * be partial. Once a period has closed, the only legal next end is the first
 * month-end after `closedThroughDay`; missing a month-end is rejected instead of
 * being merged into a longer period.
 */
function resolveClosePeriod(world: World): ClosePeriodBounds {
  const dayIndex = world.dayIndex;
  assertValidDayIndex(dayIndex);
  if (isTerminalDayIndex(dayIndex)) {
    throw new RangeError("the terminal 2000-01-01 boundary is never closed");
  }
  if (!isLastCivilDayOfMonth(dayIndex)) {
    throw new RangeError(
      `period close requires a civil month-end; day ${String(dayIndex)} is not the last day of its month`,
    );
  }
  const closedThroughDay = world.finance.closedThroughDay;
  if (closedThroughDay === null) {
    if (dayIndex < world.startDayIndex) {
      throw new RangeError(
        `period close day ${String(dayIndex)} must not precede world.startDayIndex ${String(world.startDayIndex)}`,
      );
    }
    return { startDay: world.startDayIndex, endDay: dayIndex };
  }
  if (dayIndex <= closedThroughDay) {
    throw new RangeError(
      `duplicate or out-of-order period close: finance is already closed through day ${String(closedThroughDay)} and the current day is ${String(dayIndex)}`,
    );
  }
  const expectedEnd = nextMonthEndAfter(closedThroughDay);
  if (dayIndex !== expectedEnd) {
    throw new RangeError(
      `missing or gapped period close: the next period must end on day ${String(expectedEnd)}, received day ${String(dayIndex)}`,
    );
  }
  return { startDay: closedThroughDay + 1, endDay: dayIndex };
}

/**
 * Freeze the month-to-date budget memo into exact per-country period totals.
 *
 * Only countries with at least one nonzero period value are stored; a missing
 * entry is exactly zero. This keeps the bounded save small (most countries have
 * no welfare, business tax, or financing activity in a given month) without
 * losing any nonzero amount. Actual welfare paid and business tax collected
 * remain derivable from the account-based fiscal totals and are not duplicated.
 */
function captureBudgetTotals(finance: FinanceState): Record<Id, FinancePeriodBudgetTotals> {
  const countryIds = new Set<Id>();
  for (const account of finance.accounts) {
    if (account.ownerKind === "country" && account.ownerId !== null) {
      countryIds.add(account.ownerId);
    }
  }
  const totals: Record<Id, FinancePeriodBudgetTotals> = {};
  for (const countryId of [...countryIds].sort((left, right) => left - right)) {
    const periodTotals = budgetTotalsFromMemo(readBudgetMemo(finance, countryId));
    if (Object.values(periodTotals).some((value) => value !== 0)) {
      totals[countryId] = periodTotals;
    }
  }
  return totals;
}

/**
 * Capture the pre-close trial balance and gross period flows.
 *
 * `accountTotals` keeps only nonzero accounts and includes opening balance-sheet
 * balances. `flowTotalsByKind` is derived from the mapped expense balances, which
 * measure exactly one period because revenue/expense opening balances are
 * rejected, the semantic matrix is enforced, expense balances are nonnegative,
 * and every close zeroes them exactly.
 */
function capturePeriodSummary(
  finance: FinanceState,
  bounds: ClosePeriodBounds,
): FinancePeriodSummary {
  const accounts = [...finance.accounts].sort((left, right) => left.id - right.id);
  const accountTotals: Record<Id, MoneySUSD> = {};
  const flowTotalsByKind: Record<FlowTransactionKind, MoneySUSD> = {
    "goods-purchase": 0,
    "input-purchase": 0,
    wages: 0,
    upkeep: 0,
  };
  for (const account of accounts) {
    const balance = Object.is(account.balanceSUSD, -0) ? 0 : account.balanceSUSD;
    if (balance !== 0) accountTotals[account.id] = balance;
    for (const kind of FLOW_TRANSACTION_KINDS) {
      if (account.subtype !== FLOW_EXPENSE_SUBTYPE[kind]) continue;
      const total = flowTotalsByKind[kind] + balance;
      flowTotalsByKind[kind] = Object.is(total, -0) ? 0 : total;
    }
  }
  return {
    periodStartDay: bounds.startDay,
    periodEndDay: bounds.endDay,
    accountTotals,
    flowTotalsByKind,
    countryBudgetTotals: captureBudgetTotals(finance),
  };
}

/**
 * Cross-check the captured trial balance against the pre-close ledger. The
 * summary's own totals must satisfy the accounting identity, because they are a
 * frozen copy of the pre-close ledger.
 */
function assertSummaryTrialBalance(
  finance: FinanceState,
  summary: FinancePeriodSummary,
): void {
  const byId = new Map<number, FinancialAccount>();
  for (const account of finance.accounts) byId.set(account.id, account);
  let assets = 0;
  let liabilities = 0;
  let equity = 0;
  let revenues = 0;
  let expenses = 0;
  for (const key of Object.keys(summary.accountTotals)) {
    const accountId = Number(key);
    const account = byId.get(accountId);
    if (account === undefined) {
      throw new RangeError(`summary account total references unknown account ${String(accountId)}`);
    }
    const value = summary.accountTotals[accountId];
    if (value === undefined) {
      throw new RangeError(`summary account total ${String(accountId)} is missing a value`);
    }
    switch (account.category) {
      case "asset":
        assets += value;
        break;
      case "liability":
        liabilities += value;
        break;
      case "equity":
        equity += value;
        break;
      case "revenue":
        revenues += value;
        break;
      case "expense":
        expenses += value;
        break;
    }
  }
  const totals = assertAccountingIdentity(finance);
  const checks: readonly [string, number, number][] = [
    ["assets", assets, totals.assets],
    ["liabilities", liabilities, totals.liabilities],
    ["equity", equity, totals.equity],
    ["revenues", revenues, totals.revenues],
    ["expenses", expenses, totals.expenses],
  ];
  for (const [label, summaryValue, ledgerValue] of checks) {
    if (Math.abs(summaryValue - ledgerValue) > toleranceMoney(summaryValue, ledgerValue)) {
      throw new RangeError(
        `summary ${label} ${String(summaryValue)} does not match the pre-close ledger ${String(ledgerValue)}`,
      );
    }
  }
  const debits = assets + expenses;
  const credits = liabilities + equity + revenues;
  if (Math.abs(debits - credits) > toleranceMoney(debits, credits)) {
    throw new RangeError(
      `summary trial balance violates the accounting identity: assets+expenses ${String(debits)} != liabilities+equity+revenues ${String(credits)}`,
    );
  }
}

const OWNER_KIND_ORDER: Readonly<Record<FinancialAccountOwnerKind, number>> = {
  popBlock: 0,
  building: 1,
  country: 2,
  system: 3,
};

interface OwnerBooks {
  readonly ownerKind: FinancialAccountOwnerKind;
  readonly ownerId: Id | null;
  readonly revenue: FinancialAccount[];
  readonly expense: FinancialAccount[];
  equity: FinancialAccount | undefined;
}

interface ClosingEntry {
  readonly lines: readonly JournalLine[];
  readonly sourceEntityId: Id | null;
  readonly ownerLabel: string;
  /** Revenue/expense accounts zeroed by this entry, in line order. */
  readonly closedAccountIds: readonly Id[];
}

function ownerBooksKey(ownerKind: FinancialAccountOwnerKind, ownerId: Id | null): string {
  return `${ownerKind}:${ownerId === null ? "-" : String(ownerId)}`;
}

function compareOwnerBooks(left: OwnerBooks, right: OwnerBooks): number {
  const kindDelta = OWNER_KIND_ORDER[left.ownerKind] - OWNER_KIND_ORDER[right.ownerKind];
  if (kindDelta !== 0) return kindDelta;
  return (left.ownerId ?? -1) - (right.ownerId ?? -1);
}

function ownerLabel(ownerKind: FinancialAccountOwnerKind, ownerId: Id | null): string {
  return ownerKind === "system" ? "system owner" : `${ownerKind} ${String(ownerId)}`;
}

/**
 * Build one closing entry per owner with nonzero revenue or expense balances.
 *
 * For each owner: debit every revenue account, credit every expense account, and
 * post the net `revenue - expense` to the owner's existing `owner-equity`. A
 * positive net credits equity, a negative net debits it, and an exact zero net
 * needs no equity line. Equity may become negative. No cash account is touched.
 */
function buildClosingEntries(finance: FinanceState): ClosingEntry[] {
  const books = new Map<string, OwnerBooks>();
  for (const account of finance.accounts) {
    if (account.category === "equity" && account.subtype !== "owner-equity") continue;
    if (
      account.category !== "revenue" &&
      account.category !== "expense" &&
      account.subtype !== "owner-equity"
    ) {
      continue;
    }
    const key = ownerBooksKey(account.ownerKind, account.ownerId);
    let owner = books.get(key);
    if (owner === undefined) {
      owner = {
        ownerKind: account.ownerKind,
        ownerId: account.ownerId,
        revenue: [],
        expense: [],
        equity: undefined,
      };
      books.set(key, owner);
    }
    if (account.category === "revenue") owner.revenue.push(account);
    else if (account.category === "expense") owner.expense.push(account);
    else owner.equity = account;
  }

  const owners = [...books.values()]
    .filter((owner) => owner.revenue.length > 0 || owner.expense.length > 0)
    .sort(compareOwnerBooks);
  const entries: ClosingEntry[] = [];
  for (const owner of owners) {
    const revenue = [...owner.revenue].sort((left, right) => left.id - right.id);
    const expense = [...owner.expense].sort((left, right) => left.id - right.id);
    let revenueTotal = 0;
    for (const account of revenue) revenueTotal += account.balanceSUSD;
    let expenseTotal = 0;
    for (const account of expense) expenseTotal += account.balanceSUSD;
    if (revenueTotal === 0 && expenseTotal === 0) continue;
    const net = revenueTotal - expenseTotal;
    const label = ownerLabel(owner.ownerKind, owner.ownerId);
    if (net !== 0 && owner.equity === undefined) {
      throw new RangeError(
        `${label} has a nonzero period result but no owner-equity account to close into`,
      );
    }
    const lines: JournalLine[] = [];
    const closedAccountIds: Id[] = [];
    for (const account of revenue) {
      if (!(account.balanceSUSD > 0)) continue;
      lines.push({ accountId: account.id, side: "debit", amountSUSD: account.balanceSUSD });
      closedAccountIds.push(account.id);
    }
    for (const account of expense) {
      if (!(account.balanceSUSD > 0)) continue;
      lines.push({ accountId: account.id, side: "credit", amountSUSD: account.balanceSUSD });
      closedAccountIds.push(account.id);
    }
    if (net > 0) {
      if (owner.equity === undefined) throw new RangeError(`${label} has no owner-equity account`);
      lines.push({ accountId: owner.equity.id, side: "credit", amountSUSD: net });
    } else if (net < 0) {
      if (owner.equity === undefined) throw new RangeError(`${label} has no owner-equity account`);
      lines.push({ accountId: owner.equity.id, side: "debit", amountSUSD: -net });
    }
    entries.push({
      lines,
      sourceEntityId: owner.ownerKind === "system" ? null : owner.ownerId,
      ownerLabel: label,
      closedAccountIds,
    });
  }
  return entries;
}

interface PreparedClosingEntry {
  readonly lines: readonly JournalLine[];
  readonly sourceEntityId: Id | null;
}

/**
 * Apply the closing entries as one internal, atomic audit batch.
 *
 * This is the non-public posting path reserved for `period-close`. It validates
 * that every entry balances and that no non-equity balance would go negative,
 * then applies the complete batch. The staged finance state is re-validated
 * afterwards with the persisted-posting structural rules, so a malformed entry
 * can never reach `world.finance`.
 */
function postPeriodCloseEntries(
  finance: FinanceState,
  dayIndex: Day,
  entries: readonly ClosingEntry[],
): JournalPosting[] {
  assertValidDayIndex(dayIndex);
  if (entries.length === 0) return [];
  const accounts = new Map<number, FinancialAccount>();
  for (const account of finance.accounts) accounts.set(account.id, account);
  const nextPostingId = requireInteger(
    finance.nextPostingId,
    "finance.nextPostingId",
    1,
    Number.MAX_SAFE_INTEGER,
  );
  if (nextPostingId + entries.length > Number.MAX_SAFE_INTEGER) {
    throw new RangeError("finance posting id overflow");
  }

  const aggregate = new Map<number, number>();
  const prepared: PreparedClosingEntry[] = [];
  for (const entry of entries) {
    if (entry.lines.length === 0) {
      throw new RangeError(`closing entry for ${entry.ownerLabel} contains no lines`);
    }
    let debits = 0;
    let credits = 0;
    for (const line of entry.lines) {
      const account = accounts.get(line.accountId);
      if (account === undefined) {
        throw new RangeError(
          `closing entry for ${entry.ownerLabel} references unknown account ${String(line.accountId)}`,
        );
      }
      const amount = line.amountSUSD;
      if (!Number.isFinite(amount) || !(amount > 0)) {
        throw new RangeError(
          `closing entry for ${entry.ownerLabel} requires strictly positive finite amounts`,
        );
      }
      const signed = line.side === accountNormalSide(account.category) ? amount : -amount;
      if (line.side === "debit") debits += amount;
      else credits += amount;
      aggregate.set(line.accountId, (aggregate.get(line.accountId) ?? 0) + signed);
    }
    if (Math.abs(debits - credits) > toleranceMoney(debits, credits)) {
      throw new RangeError(
        `closing entry for ${entry.ownerLabel} is unbalanced: debits ${String(debits)} != credits ${String(credits)}`,
      );
    }
    prepared.push({
      lines: entry.lines.map((line) => ({ ...line })),
      sourceEntityId: entry.sourceEntityId,
    });
  }
  for (const [accountId, delta] of aggregate) {
    const account = accounts.get(accountId);
    if (account === undefined) throw new RangeError(`unknown account ${String(accountId)}`);
    const next = account.balanceSUSD + delta;
    if (!Number.isFinite(next)) {
      throw new RangeError(`period close would make account ${String(accountId)} non-finite`);
    }
    if (!categoryAllowsNegativeBalance(account.category) && next < 0) {
      throw new RangeError(
        `period close would make ${account.category} account ${String(accountId)} negative: ${String(account.balanceSUSD)} + ${String(delta)} < 0`,
      );
    }
  }

  for (const [accountId, delta] of aggregate) {
    const account = accounts.get(accountId);
    if (account === undefined) throw new RangeError(`unknown account ${String(accountId)}`);
    account.balanceSUSD += delta;
  }

  const postings: JournalPosting[] = [];
  let postingId = nextPostingId;
  for (const entry of prepared) {
    const posting: JournalPosting = {
      id: postingId,
      dayIndex,
      transactionKind: "period-close",
      lines: entry.lines.map((line) => ({ ...line })),
      sourceEntityId: entry.sourceEntityId,
      targetEntityId: null,
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
 * Build the immutable annual summary immediately after the December monthly
 * close. The monthly close has already zeroed revenue/expense into owner equity,
 * so the annual close adds no second closing entry and cannot double-count a
 * monthly flow. Annual flows are exact sums of that year's monthly summaries;
 * annual balances are scanned from the post-close account registry.
 */
function buildAnnualSummary(
  finance: FinanceState,
  world: World,
  endDay: Day,
): AnnualFinanceSummary {
  const date = dayIndexToCivilDate(endDay);
  const year = date.year;
  if (date.month !== 12 || date.day !== 31) {
    throw new RangeError("annual summary requires 31 December");
  }
  if (finance.annualSummaries.some((summary) => summary.year === year)) {
    throw new RangeError(`annual summary for ${String(year)} already exists`);
  }
  if (finance.annualSummaries.length >= MAX_ANNUAL_SUMMARIES) {
    throw new RangeError(
      `annual summaries are limited to ${String(MAX_ANNUAL_SUMMARIES)} entries`,
    );
  }
  const summaries = finance.periodSummaries.filter(
    (summary) => dayIndexToCivilDate(summary.periodEndDay).year === year,
  );
  if (summaries.length === 0) {
    throw new RangeError(`no monthly summaries exist for annual period ${String(year)}`);
  }
  const last = summaries[summaries.length - 1];
  if (last === undefined || last.periodEndDay !== endDay) {
    throw new RangeError("annual summary requires the current December monthly close");
  }
  // The December monthly close is the year-end closing entry. It must have
  // zeroed every revenue/expense account before an annual summary can exist.
  for (const account of finance.accounts) {
    if (account.category !== "revenue" && account.category !== "expense") continue;
    if (Math.abs(account.balanceSUSD) > toleranceMoney(account.balanceSUSD)) {
      throw new RangeError(
        `year-end account ${String(account.id)} retains a nonzero revenue/expense balance`,
      );
    }
  }

  const fiscalTotals: Record<
    Id,
    {
      incomeTaxRevenueSUSD: number;
      businessTaxRevenueSUSD: number;
      welfareExpenseSUSD: number;
      interestExpenseSUSD: number;
      subsidyExpenseSUSD: number;
      administrationExpenseSUSD: number;
      educationExpenseSUSD: number;
      trainingExpenseSUSD: number;
      militaryExpenseSUSD: number;
      customsDutyRevenueSUSD: number;
      netFiscalResultSUSD: number;
    }
  > = {};
  const budgetTotals: Record<Id, FinancePeriodBudgetTotals> = {};
  for (const country of [...world.countries].sort((left, right) => left.id - right.id)) {
    fiscalTotals[country.id] = {
      incomeTaxRevenueSUSD: 0,
      businessTaxRevenueSUSD: 0,
      welfareExpenseSUSD: 0,
      interestExpenseSUSD: 0,
      subsidyExpenseSUSD: 0,
      administrationExpenseSUSD: 0,
      educationExpenseSUSD: 0,
      trainingExpenseSUSD: 0,
      militaryExpenseSUSD: 0,
      customsDutyRevenueSUSD: 0,
      netFiscalResultSUSD: 0,
    };
    budgetTotals[country.id] = emptyBudgetTotals();
  }
  const flowTotalsByKind: Record<FlowTransactionKind, MoneySUSD> = {
    "goods-purchase": 0,
    "input-purchase": 0,
    wages: 0,
    upkeep: 0,
  };
  for (const summary of summaries) {
    for (const countryTotals of governmentPeriodTotals(finance, summary)) {
      const current = fiscalTotals[countryTotals.countryId];
      if (current === undefined) continue;
      fiscalTotals[countryTotals.countryId] = {
        incomeTaxRevenueSUSD:
          current.incomeTaxRevenueSUSD + countryTotals.incomeTaxRevenueSUSD,
        businessTaxRevenueSUSD:
          current.businessTaxRevenueSUSD + countryTotals.businessTaxRevenueSUSD,
        welfareExpenseSUSD: current.welfareExpenseSUSD + countryTotals.welfareExpenseSUSD,
        interestExpenseSUSD:
          current.interestExpenseSUSD + countryTotals.interestExpenseSUSD,
        subsidyExpenseSUSD:
          current.subsidyExpenseSUSD + countryTotals.subsidyExpenseSUSD,
        administrationExpenseSUSD:
          current.administrationExpenseSUSD +
          (countryTotals.administrationExpenseSUSD ?? 0),
        educationExpenseSUSD:
          current.educationExpenseSUSD + (countryTotals.educationExpenseSUSD ?? 0),
        trainingExpenseSUSD:
          current.trainingExpenseSUSD + (countryTotals.trainingExpenseSUSD ?? 0),
        militaryExpenseSUSD:
          current.militaryExpenseSUSD + (countryTotals.militaryExpenseSUSD ?? 0),
        customsDutyRevenueSUSD:
          current.customsDutyRevenueSUSD + (countryTotals.customsDutyRevenueSUSD ?? 0),
        netFiscalResultSUSD: 0,
      };
    }
    for (const [countryIdText, budget] of Object.entries(summary.countryBudgetTotals)) {
      const countryId = Number(countryIdText);
      const current = budgetTotals[countryId];
      if (current === undefined) continue;
      budgetTotals[countryId] = addBudgetTotals(current, budget);
    }
    for (const kind of FLOW_TRANSACTION_KINDS) {
      flowTotalsByKind[kind] += summary.flowTotalsByKind[kind];
    }
  }
  for (const totals of Object.values(fiscalTotals)) {
    totals.netFiscalResultSUSD =
      totals.incomeTaxRevenueSUSD +
      totals.businessTaxRevenueSUSD +
      totals.customsDutyRevenueSUSD -
      totals.welfareExpenseSUSD -
      totals.interestExpenseSUSD -
      totals.subsidyExpenseSUSD -
      totals.administrationExpenseSUSD -
      totals.educationExpenseSUSD -
      totals.trainingExpenseSUSD -
      totals.militaryExpenseSUSD;
  }
  // Zero-only annual budget entries carry no information; omit them exactly as
  // monthly summaries do. Missing entries are treated as zero by reporting.
  for (const key of Object.keys(budgetTotals)) {
    const totals = budgetTotals[Number(key)];
    if (totals !== undefined && Object.values(totals).every((value) => value === 0)) {
      delete budgetTotals[Number(key)];
    }
  }

  const closingBalances: Record<Id, AnnualClosingBalances> = {};
  for (const country of world.countries) {
    closingBalances[country.id] = {
      treasuryCashSUSD: 0,
      debtLiabilitySUSD: 0,
      interestPayableSUSD: 0,
    };
  }
  for (const account of finance.accounts) {
    if (account.ownerKind !== "country" || account.ownerId === null) continue;
    const balances = closingBalances[account.ownerId];
    if (balances === undefined) continue;
    let treasury = balances.treasuryCashSUSD;
    let debt = balances.debtLiabilitySUSD;
    let interest = balances.interestPayableSUSD;
    if (account.subtype === "treasury-cash") treasury += account.balanceSUSD;
    else if (account.subtype === "debt-liability") debt += account.balanceSUSD;
    else if (account.subtype === "interest-payable") interest += account.balanceSUSD;
    closingBalances[account.ownerId] = {
      treasuryCashSUSD: treasury,
      debtLiabilitySUSD: debt,
      interestPayableSUSD: interest,
    };
  }

  const correctionCount = finance.corrections.filter(
    (correction) => dayIndexToCivilDate(correction.dayIndex).year === year,
  ).length;
  const periodStartDay = summaries[0]?.periodStartDay ?? endDay;
  return {
    year,
    periodStartDay,
    periodEndDay: endDay,
    complete: periodStartDay === civilDateToDayIndex(year, 1, 1),
    fiscalTotals,
    budgetTotals,
    flowTotalsByKind,
    closingBalances,
    correctionCount,
  };
}

/**
 * Close the current month on a staged world.
 *
 * Inputs: an authoritative world whose `dayIndex` is a civil month-end.
 * Effects: replaces `world.finance` with a validated, closed copy; the caller is
 * responsible for advancing `dayIndex` before publishing.
 * Failure: throws before `world.finance` is replaced, leaving every account,
 * balance, posting, summary, and the close boundary unchanged.
 */
export function closeFinancePeriod(world: World): FinanceCloseResult {
  assertValidPeriodSummaries(world.finance, {
    startDayIndex: world.startDayIndex,
    dayIndex: world.dayIndex,
    allowUnadvancedClose: true,
  });
  const bounds = resolveClosePeriod(world);
  // D-047: fail before staging or mutating published state when an owner that
  // has revenue/expense accounts has no single owner-equity account.
  assertOwnerEquityInvariant(world.finance);

  const staged = cloneFinanceState(world.finance);
  assertValidFinanceState(staged);

  const summary = capturePeriodSummary(staged, bounds);
  assertSummaryTrialBalance(staged, summary);

  const entries = buildClosingEntries(staged);
  const postings = postPeriodCloseEntries(staged, world.dayIndex, entries);
  staged.periodSummaries.push(summary);
  staged.closedThroughDay = bounds.endDay;
  // The budget memo (requested/shortfall, assessments, and financing movements)
  // has been frozen into the summary. It is not a liability and starts a new
  // month at zero.
  staged.budgetMemosThisMonth = {};
  compactFinanceHistory(staged);
  if (dayIndexToCivilDate(world.dayIndex).month === 12) {
    staged.annualSummaries.push(buildAnnualSummary(staged, world, world.dayIndex));
  }

  assertOwnerEquityInvariant(staged);
  assertValidFinanceState(staged);
  assertValidPeriodSummaries(staged, {
    startDayIndex: world.startDayIndex,
    dayIndex: world.dayIndex,
    allowUnadvancedClose: true,
  });
  const closedAccountIds: Id[] = [];
  for (const entry of entries) closedAccountIds.push(...entry.closedAccountIds);

  world.finance = staged;
  return {
    summary,
    postingIds: postings.map((posting) => posting.id),
    closedAccountIds,
    profitDistributionApplied: false,
  };
}
