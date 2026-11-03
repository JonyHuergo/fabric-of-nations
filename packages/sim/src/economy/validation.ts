/**
 * Structural validation for M3/M4a/M4b runtime economy state.
 *
 * Economically valid failures (unqualified populations, unstaffed buildings) are
 * not rejected here. Only malformed state, broken references, invalid ranges,
 * category violations, semantic-posting violations, accounting invariant
 * violations, and period-summary violations are.
 */

import { assertValidDayIndex, civilDateToDayIndex, dayIndexToCivilDate, daysInMonth } from "../calendar.js";
import { CAMPAIGN_TERMINAL_DAY_INDEX } from "../constants.js";
import { MONEY_TOLERANCE_RUSD } from "../population/constants.js";
import { workingAgePopulation } from "../population/state.js";
import {
  requireArray,
  requireFiniteNumber,
  requireInteger,
  requireRecord,
} from "../validation.js";
import type { Day, Id } from "../types.js";
import type { World } from "../world.js";
import {
  assertBusinessTaxPostingStructure,
  assertAccountingIdentity,
  assertConstructionPostingStructure,
  assertIndustrialPostingStructure,
  assertFiscalPostingStructure,
  assertAdministrationPostingStructure,
  assertEducationPostingStructure,
  assertTrainingPostingStructure,
  assertOwnerEquityTallies,
  assertProfitAllocationStructure,
  assertDebtPostingStructure,
  assertSemanticJournalLine,
  assertValidAccountCategory,
  assertValidAccountSubtype,
  assertValidOpeningRecord,
  buildFinanceIndex,
  categoryAllowsNegativeBalance,
  categoryForSubtype,
  FLOW_EXPENSE_SUBTYPE,
  isCashAccount,
  subtypeAllowsOwnerKind,
  tallyOwnerEquity,
  accountOwnerKey,
  transactionKindChangesCash,
  type OwnerEquityTally,
} from "./accounts.js";
import {
  assertValidCountryCurrencyState,
  buildProvinceOwnerMap,
  assertValidIndustrialPolicy,
  fiscalPolicyIsActive,
  buildCountryProvinceMap,
} from "./country.js";
import {
  assertValidCountryLaws,
  assertValidInstitutionState,
  assertValidInterestGroupStates,
  assertValidLawTransitions,
  assertValidPoliticsState,
  assertValidRegimeState,
} from "./politics.js";
import { assertValidLaborPolicyState } from "./labor.js";
import { assertValidTradePolicyState } from "./tradeState.js";
import { assertValidConstructionState } from "./constructionModel.js";
import {
  assertValidBudgetTotals,
  assertValidFinanceBudgetMemo,
} from "./budget.js";
import {
  assertValidDebtContract,
  assertValidDebtPolicy,
  debtOutstandingPrincipal,
} from "./debtPolicy.js";
import {
  MAX_ACTIVE_DEBT_CONTRACTS,
  MAX_ANNUAL_SUMMARIES,
  MAX_AUDIT_POSTINGS,
  MAX_CORRECTION_REASON_LENGTH,
  MAX_DEBT_HISTORY_AGGREGATES,
  MAX_FINANCE_CORRECTIONS,
  MAX_PERIOD_SUMMARIES,
  MAX_RETAINED_TERMINATED_DEBT_CONTRACTS,
} from "./constants.js";
import {
  FLOW_TRANSACTION_KINDS,
  TRANSACTION_KINDS,
  type AnnualFinanceSummary,
  type BuildingInstance,
  type DebtContract,
  type DebtHistoryAggregate,
  type EmploymentAssignment,
  type FinanceCorrection,
  type FinancePeriodBudgetTotals,
  type FinancePeriodSummary,
  type FinanceState,
  type FinancialAccount,
  type FinancialAccountOwnerKind,
  type FlowTransactionKind,
  type JournalLine,
  type JournalPosting,
  type Market,
  type StockLot,
  type TransactionKind,
} from "./types.js";

function toleranceMoney(...values: number[]): number {
  let scale = 1;
  for (const value of values) scale = Math.max(scale, Math.abs(value));
  return MONEY_TOLERANCE_RUSD * scale;
}

/** True when `dayIndex` is the last civil day of its Gregorian month. */
function isCivilMonthEnd(dayIndex: Day): boolean {
  const date = dayIndexToCivilDate(dayIndex);
  return date.day === daysInMonth(date.year, date.month);
}

/** Compact `year-month` label used to require at most one summary per month. */
function civilMonthLabel(dayIndex: Day): string {
  const date = dayIndexToCivilDate(dayIndex);
  return `${String(date.year)}-${String(date.month)}`;
}

function assertAccountOwnerKind(value: unknown, path: string): FinancialAccountOwnerKind {
  if (
    value !== "popBlock" &&
    value !== "building" &&
    value !== "country" &&
    value !== "system"
  ) {
    throw new RangeError(`${path} must be popBlock, building, country, or system`);
  }
  return value;
}

export function assertValidFinancialAccount(account: FinancialAccount): void {
  const record = requireRecord(account, "finance.accounts[]");
  const id = requireInteger(record.id, "finance.accounts[].id", 0, 0xffff_ffff);
  const ownerKind = assertAccountOwnerKind(record.ownerKind, "finance.accounts[].ownerKind");
  const category = record.category;
  assertValidAccountCategory(category);
  const subtype = record.subtype;
  assertValidAccountSubtype(subtype);
  const expectedCategory = categoryForSubtype(subtype);
  if (category !== expectedCategory) {
    throw new RangeError(
      `finance account ${String(id)} category ${JSON.stringify(category)} does not match subtype ${JSON.stringify(subtype)} (${expectedCategory})`,
    );
  }
  if (!subtypeAllowsOwnerKind(subtype, ownerKind)) {
    throw new RangeError(
      `finance account ${String(id)} subtype ${JSON.stringify(subtype)} cannot be owned by ${ownerKind}`,
    );
  }
  const ownerId =
    record.ownerId === null
      ? null
      : requireInteger(record.ownerId, "finance.accounts[].ownerId", 0, 0xffff_ffff);
  const balance = requireFiniteNumber(record.balanceRUSD, "finance.accounts[].balanceRUSD");

  if (ownerKind === "system") {
    if (ownerId !== null) {
      throw new RangeError(`system account ${String(id)} must have ownerId null`);
    }
  } else if (ownerId === null) {
    throw new RangeError(`finance account ${String(id)} requires an ownerId for ${ownerKind}`);
  }
  if (isCashAccount(account) && ownerKind === "system" && ownerId !== null) {
    throw new RangeError(`system cash account ${String(id)} must have ownerId null`);
  }
  if (!categoryAllowsNegativeBalance(category) && balance < 0) {
    throw new RangeError(`finance account ${String(id)} has a negative ${category} balance`);
  }
}

interface PostingLineDelta {
  readonly account: FinancialAccount;
  readonly debit: number;
  readonly credit: number;
  /** Signed change in the account's normal-side balance. */
  readonly normalDelta: number;
  readonly cashDelta: number;
}

function assertPostingLine(
  value: unknown,
  path: string,
  accounts: ReadonlyMap<number, FinancialAccount>,
  transactionKind: TransactionKind,
): PostingLineDelta {
  const record = requireRecord(value, path);
  const accountId = requireInteger(record.accountId, `${path}.accountId`, 0, 0xffff_ffff);
  const account = accounts.get(accountId);
  if (account === undefined) {
    throw new RangeError(`${path} references unknown account ${String(accountId)}`);
  }
  if (record.side !== "debit" && record.side !== "credit") {
    throw new RangeError(`${path}.side must be debit or credit`);
  }
  const amount = requireFiniteNumber(record.amountRUSD, `${path}.amountRUSD`);
  if (!(amount > 0)) throw new RangeError(`${path}.amountRUSD must be strictly positive`);
  // D-047 semantic matrix: applies to revenue/expense lines for every kind.
  assertSemanticJournalLine(transactionKind, account, record.side, path);
  const normalSide = account.category === "asset" || account.category === "expense" ? "debit" : "credit";
  const normalDelta = record.side === normalSide ? amount : -amount;
  return {
    account,
    debit: record.side === "debit" ? amount : 0,
    credit: record.side === "credit" ? amount : 0,
    normalDelta,
    cashDelta: isCashAccount(account) ? normalDelta : 0,
  };
}

/**
 * Structural validation for a persisted internal `period-close` posting.
 *
 * Public callers cannot create closing entries, so a persisted close posting is
 * only structurally validated: no cash lines, revenue debits only, expense
 * credits only, revenue/expense/equity accounts only, and a single equity net
 * line whose side and amount equal `revenue - expense`. A zero net needs no
 * equity line. The posting must still balance exactly.
 */
function assertValidPeriodClosePosting(
  lines: readonly unknown[],
  accounts: ReadonlyMap<number, FinancialAccount>,
  path: string,
): void {
  let debits = 0;
  let credits = 0;
  let revenue = 0;
  let expense = 0;
  let equityCount = 0;
  let equityDebit = 0;
  let equityCredit = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const linePath = `${path}.lines[${String(index)}]`;
    const line = assertPostingLine(lines[index], linePath, accounts, "period-close");
    debits += line.debit;
    credits += line.credit;
    if (isCashAccount(line.account)) {
      throw new RangeError(`${linePath} must not reference a designated cash account`);
    }
    switch (line.account.category) {
      case "revenue":
        revenue += line.debit;
        break;
      case "expense":
        expense += line.credit;
        break;
      case "equity":
        equityCount += 1;
        equityDebit += line.debit;
        equityCredit += line.credit;
        break;
      default:
        throw new RangeError(
          `${linePath} may only reference revenue, expense, or equity accounts in a period-close posting`,
        );
    }
  }
  if (Math.abs(debits - credits) > toleranceMoney(debits, credits)) {
    throw new RangeError(
      `${path} is unbalanced: debits ${String(debits)} != credits ${String(credits)}`,
    );
  }
  const net = revenue - expense;
  if (net === 0) {
    if (equityCount !== 0) {
      throw new RangeError(`${path} has a zero net but includes an equity line`);
    }
    return;
  }
  if (equityCount !== 1) {
    throw new RangeError(`${path} must include exactly one equity net line for a nonzero net`);
  }
  if (net > 0) {
    if (equityDebit !== 0 || Math.abs(equityCredit - net) > toleranceMoney(equityCredit, net)) {
      throw new RangeError(
        `${path} must credit owner equity by the net ${String(net)} for a profitable period`,
      );
    }
    return;
  }
  const loss = -net;
  if (equityCredit !== 0 || Math.abs(equityDebit - loss) > toleranceMoney(equityDebit, loss)) {
    throw new RangeError(
      `${path} must debit owner equity by the net loss ${String(loss)} for a loss period`,
    );
  }
}

export function assertValidJournalPosting(
  posting: JournalPosting,
  accounts: ReadonlyMap<number, FinancialAccount>,
  path = "finance.postings[]",
): void {
  const record = requireRecord(posting, path);
  requireInteger(record.id, `${path}.id`, 1, Number.MAX_SAFE_INTEGER);
  const lines = requireArray(record.lines, `${path}.lines`);
  if (lines.length === 0) throw new RangeError(`${path}.lines must not be empty`);
  assertValidDayIndex(record.dayIndex as number);
  if (!(TRANSACTION_KINDS as readonly string[]).includes(record.transactionKind as string)) {
    throw new RangeError(`${path}.transactionKind is invalid`);
  }
  const transactionKind = record.transactionKind as TransactionKind;
  if (transactionKind === "period-close") {
    assertValidPeriodClosePosting(lines, accounts, path);
  } else {
    let debits = 0;
    let credits = 0;
    let cashDelta = 0;
    const journalLines: JournalLine[] = [];
    for (let index = 0; index < lines.length; index += 1) {
      const line = assertPostingLine(
        lines[index],
        `${path}.lines[${String(index)}]`,
        accounts,
        transactionKind,
      );
      debits += line.debit;
      credits += line.credit;
      cashDelta += line.cashDelta;
      journalLines.push({
        accountId: line.account.id,
        side: line.debit > 0 ? "debit" : "credit",
        amountRUSD: line.debit > 0 ? line.debit : line.credit,
      });
    }
    if (Math.abs(debits - credits) > MONEY_TOLERANCE_RUSD) {
      throw new RangeError(
        `${path} is unbalanced: debits ${String(debits)} != credits ${String(credits)}`,
      );
    }
    if (transactionKind !== "correction" && transactionKindChangesCash(transactionKind)) {
      throw new RangeError(`${path}.transactionKind is not implemented in M4a-1`);
    }
    if (
      transactionKind !== "correction" &&
      Math.abs(cashDelta) > MONEY_TOLERANCE_RUSD * Math.max(1, Math.abs(cashDelta))
    ) {
      throw new RangeError(
        `${path} changes aggregate designated cash by ${String(cashDelta)} under a cash-neutral transaction kind`,
      );
    }
    if (transactionKind === "income-tax" || transactionKind === "welfare-transfer") {
      assertFiscalPostingStructure(transactionKind, journalLines, accounts, path);
    }
    if (transactionKind === "administration-payroll") {
      assertAdministrationPostingStructure(journalLines, accounts, path);
    }
    if (transactionKind === "education-payroll") {
      assertEducationPostingStructure(journalLines, accounts, path);
    }
    if (
      transactionKind === "training-payroll" ||
      transactionKind === "training-stipend"
    ) {
      assertTrainingPostingStructure(journalLines, accounts, path);
    }
    if (transactionKind === "business-profit-tax") {
      assertBusinessTaxPostingStructure(journalLines, accounts, path);
    }
    if (
      transactionKind === "construction-wage" ||
      transactionKind === "construction-capitalization" ||
      transactionKind === "construction-writeoff" ||
      transactionKind === "construction-working-capital"
    ) {
      assertConstructionPostingStructure(transactionKind, journalLines, accounts, path);
    }
    if (
      transactionKind === "construction-material-purchase" ||
      transactionKind === "production-subsidy" ||
      transactionKind === "public-enterprise-capital-contribution"
    ) {
      assertIndustrialPostingStructure(transactionKind, journalLines, accounts, path);
    }
    if (
      transactionKind === "profit-retention" ||
      transactionKind === "profit-distribution" ||
      transactionKind === "state-enterprise-remittance"
    ) {
      assertProfitAllocationStructure(transactionKind, journalLines, accounts, path);
    }
    if (
      transactionKind === "debt-issuance" ||
      transactionKind === "debt-principal-repayment" ||
      transactionKind === "interest-accrual" ||
      transactionKind === "interest-payment" ||
      transactionKind === "debt-default-writeoff"
    ) {
      assertDebtPostingStructure(transactionKind, journalLines, accounts, path);
    }
  }
  if (record.sourceEntityId !== null) {
    requireInteger(record.sourceEntityId, `${path}.sourceEntityId`, 0, 0xffff_ffff);
  }
  if (record.targetEntityId !== null) {
    requireInteger(record.targetEntityId, `${path}.targetEntityId`, 0, 0xffff_ffff);
  }
}

function assertValidAnnualSummary(
  summary: AnnualFinanceSummary,
  finance: FinanceState,
  path: string,
): void {
  const record = requireRecord(summary, path);
  const year = requireInteger(record.year, `${path}.year`, 1900, 1999);
  const startDay = requireInteger(
    record.periodStartDay,
    `${path}.periodStartDay`,
    0,
    CAMPAIGN_TERMINAL_DAY_INDEX,
  );
  const endDay = requireInteger(
    record.periodEndDay,
    `${path}.periodEndDay`,
    0,
    CAMPAIGN_TERMINAL_DAY_INDEX,
  );
  if (startDay > endDay) throw new RangeError(`${path}.periodStartDay must not exceed periodEndDay`);
  const endDate = dayIndexToCivilDate(endDay as Day);
  const startDate = dayIndexToCivilDate(startDay as Day);
  if (endDate.year !== year || endDate.month !== 12 || endDate.day !== 31) {
    throw new RangeError(`${path} must end on 31 December of its year`);
  }
  if (startDate.year !== year) {
    throw new RangeError(`${path}.periodStartDay must belong to the annual year`);
  }
  if (typeof record.complete !== "boolean") {
    throw new RangeError(`${path}.complete must be a boolean`);
  }
  const januaryFirst = civilDateToDayIndex(year, 1, 1);
  if (record.complete !== (startDay === januaryFirst)) {
    throw new RangeError(`${path}.complete does not match its period start`);
  }

  const fiscal = requireRecord(record.fiscalTotals, `${path}.fiscalTotals`);
  for (const key of Object.keys(fiscal)) {
    const countryId = parseAccountTotalKey(key, `${path}.fiscalTotals`);
    const totals = requireRecord(fiscal[key], `${path}.fiscalTotals.${key}`);
    // Sparse encoding: a missing field decodes as zero.
    const valueOf = (field: string): number =>
      totals[field] === undefined
        ? 0
        : requireFiniteNumber(
            totals[field],
            `${path}.fiscalTotals.${String(countryId)}.${field}`,
          );
    const tax = valueOf("incomeTaxRevenueRUSD");
    const businessTax = valueOf("businessTaxRevenueRUSD");
    const welfare = valueOf("welfareExpenseRUSD");
    const interest = valueOf("interestExpenseRUSD");
    const subsidy = valueOf("subsidyExpenseRUSD");
    const administration = valueOf("administrationExpenseRUSD");
    const education = valueOf("educationExpenseRUSD");
    const training = valueOf("trainingExpenseRUSD");
    const military = valueOf("militaryExpenseRUSD");
const customs = valueOf("customsDutyRevenueRUSD");
    const net = valueOf("netFiscalResultRUSD");
    if (
      tax < 0 ||
      businessTax < 0 ||
      welfare < 0 ||
      interest < 0 ||
      subsidy < 0 ||
      administration < 0 ||
      education < 0 ||
      training < 0 ||
      military < 0 ||
      customs < 0
    ) {
      throw new RangeError(`${path}.fiscalTotals.${String(countryId)} components must be non-negative`);
    }
    if (
      Math.abs(
        net -
          (tax +
            businessTax +
            customs -
            welfare -
            interest -
            subsidy -
            administration -
            education -
            training -
        military),
      ) >
      toleranceMoney(
        net,
        tax,
        businessTax,
        customs,
        welfare,
        interest,
        subsidy,
        administration,
        education,
        training,
      )
    ) {
      throw new RangeError(`${path}.fiscalTotals.${String(countryId)} net result does not reconcile`);
    }
  }

  const budget = requireRecord(record.budgetTotals, `${path}.budgetTotals`);
  for (const key of Object.keys(budget)) {
    const countryId = parseAccountTotalKey(key, `${path}.budgetTotals`);
    assertValidBudgetTotals(
      budget[key] as FinancePeriodBudgetTotals,
      `${path}.budgetTotals.${String(countryId)}`,
    );
  }

  const flows = requireRecord(record.flowTotalsByKind, `${path}.flowTotalsByKind`);
  for (const kind of FLOW_TRANSACTION_KINDS) {
    const value = requireFiniteNumber(flows[kind], `${path}.flowTotalsByKind.${kind}`);
    if (value < 0) throw new RangeError(`${path}.flowTotalsByKind.${kind} must be non-negative`);
  }

  const balances = requireRecord(record.closingBalances, `${path}.closingBalances`);
  for (const key of Object.keys(balances)) {
    const countryId = parseAccountTotalKey(key, `${path}.closingBalances`);
    const values = requireRecord(balances[key], `${path}.closingBalances.${key}`);
    for (const field of [
      "treasuryCashRUSD",
      "debtLiabilityRUSD",
      "interestPayableRUSD",
    ] as const) {
      const value = requireFiniteNumber(
        values[field],
        `${path}.closingBalances.${String(countryId)}.${field}`,
      );
      if (value < 0) {
        throw new RangeError(
          `${path}.closingBalances.${String(countryId)}.${field} must be non-negative`,
        );
      }
    }
  }
  requireInteger(record.correctionCount, `${path}.correctionCount`, 0, 1_000_000);
  if (finance.annualSummaries.some((entry) => entry !== summary && entry.year === year)) {
    throw new RangeError(`${path} duplicates annual year ${String(year)}`);
  }
}

function assertValidFinanceCorrection(
  correction: FinanceCorrection,
  accounts: ReadonlyMap<number, FinancialAccount>,
  path: string,
): void {
  const record = requireRecord(correction, path);
  requireInteger(record.id, `${path}.id`, 1, Number.MAX_SAFE_INTEGER);
  requireInteger(record.dayIndex, `${path}.dayIndex`, 0, CAMPAIGN_TERMINAL_DAY_INDEX);
  requireInteger(record.postingId, `${path}.postingId`, 1, Number.MAX_SAFE_INTEGER);
  requireInteger(
    record.originalPostingId,
    `${path}.originalPostingId`,
    1,
    Number.MAX_SAFE_INTEGER,
  );
  if (typeof record.reason !== "string") throw new RangeError(`${path}.reason must be a string`);
  if (record.reason.trim().length === 0 || record.reason.length > MAX_CORRECTION_REASON_LENGTH) {
    throw new RangeError(`${path}.reason is empty or too long`);
  }
  const lines = requireArray(record.lines, `${path}.lines`);
  if (lines.length === 0) throw new RangeError(`${path}.lines must not be empty`);
  let debits = 0;
  let credits = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const linePath = `${path}.lines[${String(index)}]`;
    const line = requireRecord(lines[index], linePath);
    const accountId = requireInteger(line.accountId, `${linePath}.accountId`, 0, 0xffff_ffff);
    if (!accounts.has(accountId)) {
      throw new RangeError(`${linePath} references unknown account ${String(accountId)}`);
    }
    if (line.side !== "debit" && line.side !== "credit") {
      throw new RangeError(`${linePath}.side must be debit or credit`);
    }
    const amount = requireFiniteNumber(line.amountRUSD, `${linePath}.amountRUSD`);
    if (!(amount > 0)) throw new RangeError(`${linePath}.amountRUSD must be positive`);
    if (line.side === "debit") debits += amount;
    else credits += amount;
  }
  if (Math.abs(debits - credits) > toleranceMoney(debits, credits)) {
    throw new RangeError(`${path} is unbalanced: debits ${String(debits)} != credits ${String(credits)}`);
  }
}

function assertValidAnnualState(
  finance: FinanceState,
  accounts: ReadonlyMap<number, FinancialAccount>,
): void {
  if (finance.annualSummaries.length > MAX_ANNUAL_SUMMARIES) {
    throw new RangeError(
      `world.finance.annualSummaries must contain at most ${String(MAX_ANNUAL_SUMMARIES)} entries`,
    );
  }
  let previousEnd: Day | null = null;
  for (let index = 0; index < finance.annualSummaries.length; index += 1) {
    const summary = finance.annualSummaries[index];
    if (summary === undefined) throw new RangeError("annual summary is missing");
    const path = `world.finance.annualSummaries[${String(index)}]`;
    assertValidAnnualSummary(summary, finance, path);
    if (previousEnd !== null && summary.periodStartDay !== previousEnd + 1) {
      throw new RangeError(`${path} must start immediately after the previous annual close`);
    }
    previousEnd = summary.periodEndDay;
  }
  if (
    finance.closedThroughDay !== null &&
    finance.annualSummaries.length > 0 &&
    (finance.annualSummaries[finance.annualSummaries.length - 1]?.periodEndDay ?? -1) >
      finance.closedThroughDay
  ) {
    throw new RangeError("annual summaries must not extend beyond the monthly close boundary");
  }

  if (finance.corrections.length > MAX_FINANCE_CORRECTIONS) {
    throw new RangeError(
      `world.finance.corrections must contain at most ${String(MAX_FINANCE_CORRECTIONS)} entries`,
    );
  }
  let previousCorrectionId = 0;
  for (let index = 0; index < finance.corrections.length; index += 1) {
    const correction = finance.corrections[index];
    if (correction === undefined) throw new RangeError("finance correction is missing");
    const path = `world.finance.corrections[${String(index)}]`;
    assertValidFinanceCorrection(correction, accounts, path);
    if (index > 0 && correction.id !== previousCorrectionId + 1) {
      throw new RangeError(`${path}.id is not the next deterministic correction id`);
    }
    previousCorrectionId = correction.id;
    const posting = finance.postings.find((entry) => entry.id === correction.postingId);
    if (posting !== undefined) {
      if (posting.transactionKind !== "correction" || posting.dayIndex !== correction.dayIndex) {
        throw new RangeError(`${path} does not match its retained correction posting`);
      }
    }
  }
  const nextCorrectionId = requireInteger(
    finance.nextCorrectionId,
    "world.finance.nextCorrectionId",
    1,
    Number.MAX_SAFE_INTEGER,
  );
  if (nextCorrectionId <= previousCorrectionId) {
    throw new RangeError(
      "world.finance.nextCorrectionId must be greater than every retained correction id",
    );
  }
}

export function assertValidFinanceState(finance: FinanceState): void {
  const record = requireRecord(finance, "world.finance");
  const rawAccounts = requireArray(record.accounts, "world.finance.accounts");
  const accounts = new Map<number, FinancialAccount>();
  const ownerKeys = new Set<number | string>();
  let maxAccountId = 0;
  for (const value of rawAccounts) {
    const account = value as FinancialAccount;
    assertValidFinancialAccount(account);
    if (accounts.has(account.id)) {
      throw new RangeError(`duplicate finance account id ${String(account.id)}`);
    }
    accounts.set(account.id, account);
    maxAccountId = Math.max(maxAccountId, account.id);
    // D-137: the collision-free numeric owner key of the finance index (no string per
    // account); unusual owner ids fall back to the string form.
    const key = accountOwnerKey(account.ownerKind, account.ownerId, account.subtype);
    // E6b external-counterparty accounts are per-country system accounts identified by
    // explicit ids in `World.monetary`; they are the one documented exception to the
    // one-account-per-owner/subtype rule (D-080).
    const perCountryExternalAccount =
      account.ownerKind === "system" &&
      (account.subtype === "external-cash" ||
        account.subtype === "external-currency-holding" ||
        account.subtype === "external-equity");
    if (ownerKeys.has(key) && !perCountryExternalAccount) {
      throw new RangeError(
        `duplicate ${account.subtype} account for ${account.ownerKind} ${String(account.ownerId)}`,
      );
    }
    ownerKeys.add(key);
  }

  const rawPostings = requireArray(record.postings, "world.finance.postings");
  if (rawPostings.length > MAX_AUDIT_POSTINGS) {
    throw new RangeError(
      `world.finance.postings must contain at most ${String(MAX_AUDIT_POSTINGS)} entries`,
    );
  }
  const postingIds = new Set<number>();
  let maxPostingId = 0;
  for (let index = 0; index < rawPostings.length; index += 1) {
    const posting = rawPostings[index] as JournalPosting;
    assertValidJournalPosting(
      posting,
      accounts,
      `world.finance.postings[${String(index)}]`,
    );
    if (postingIds.has(posting.id)) {
      throw new RangeError(`duplicate journal posting id ${String(posting.id)}`);
    }
    postingIds.add(posting.id);
    maxPostingId = Math.max(maxPostingId, posting.id);
  }
  const nextPostingId = requireInteger(
    record.nextPostingId,
    "world.finance.nextPostingId",
    1,
    Number.MAX_SAFE_INTEGER,
  );
  if (nextPostingId <= maxPostingId) {
    throw new RangeError("world.finance.nextPostingId must be greater than every posting id");
  }
  const nextAccountId = requireInteger(
    record.nextAccountId,
    "world.finance.nextAccountId",
    1,
    Number.MAX_SAFE_INTEGER,
  );
  if (nextAccountId <= maxAccountId) {
    throw new RangeError("world.finance.nextAccountId must be greater than every account id");
  }

  const rawContracts = requireArray(record.debtContracts, "world.finance.debtContracts");
  const contractIds = new Set<number>();
  let maxContractId = 0;
  let activeContracts = 0;
  let terminatedContracts = 0;
  for (let index = 0; index < rawContracts.length; index += 1) {
    const contract = rawContracts[index] as DebtContract;
    assertValidDebtContract(contract, `world.finance.debtContracts[${String(index)}]`);
    if (contractIds.has(contract.id)) {
      throw new RangeError(`duplicate debt contract id ${String(contract.id)}`);
    }
    contractIds.add(contract.id);
    maxContractId = Math.max(maxContractId, contract.id);
    if (contract.status === "active" || contract.status === "arrears") activeContracts += 1;
    else terminatedContracts += 1;
  }
  if (activeContracts > MAX_ACTIVE_DEBT_CONTRACTS) {
    throw new RangeError(
      `world.finance.debtContracts has ${String(activeContracts)} active contracts; maximum ${String(
        MAX_ACTIVE_DEBT_CONTRACTS,
      )}`,
    );
  }
  if (terminatedContracts > MAX_RETAINED_TERMINATED_DEBT_CONTRACTS) {
    throw new RangeError(
      `world.finance.debtContracts retains ${String(terminatedContracts)} terminated contracts; maximum ${String(
        MAX_RETAINED_TERMINATED_DEBT_CONTRACTS,
      )}`,
    );
  }
  const nextContractId = requireInteger(
    record.nextContractId,
    "world.finance.nextContractId",
    1,
    Number.MAX_SAFE_INTEGER,
  );
  if (nextContractId <= maxContractId) {
    throw new RangeError(
      "world.finance.nextContractId must be greater than every debt contract id",
    );
  }

  const rawHistory = requireArray(record.debtHistory, "world.finance.debtHistory");
  if (rawHistory.length > MAX_DEBT_HISTORY_AGGREGATES) {
    throw new RangeError(
      `world.finance.debtHistory must contain at most ${String(MAX_DEBT_HISTORY_AGGREGATES)} entries`,
    );
  }
  const historyIssuers = new Set<number>();
  for (let index = 0; index < rawHistory.length; index += 1) {
    const aggregate = rawHistory[index] as DebtHistoryAggregate;
    const path = `world.finance.debtHistory[${String(index)}]`;
    const recordHistory = requireRecord(aggregate, path);
    const issuer = requireInteger(recordHistory.issuerCountryId, `${path}.issuerCountryId`, 0, 0xffff_ffff);
    if (historyIssuers.has(issuer)) {
      throw new RangeError(`duplicate debt history aggregate for issuer ${String(issuer)}`);
    }
    historyIssuers.add(issuer);
    for (const field of [
      "contractsRetired",
      "contractsDefaulted",
    ] as const) {
      requireInteger(recordHistory[field], `${path}.${field}`, 0, 1_000_000);
    }
    for (const field of [
      "principalIssuedRUSD",
      "principalRepaidRUSD",
      "principalWrittenOffRUSD",
      "interestWrittenOffRUSD",
    ] as const) {
      const value = requireFiniteNumber(recordHistory[field], `${path}.${field}`);
      if (value < 0) throw new RangeError(`${path}.${field} must be non-negative`);
    }
  }

  const rawMemos = requireRecord(
    record.budgetMemosThisMonth,
    "world.finance.budgetMemosThisMonth",
  );
  for (const key of Object.keys(rawMemos)) {
    const countryId = parseAccountTotalKey(
      key,
      "world.finance.budgetMemosThisMonth",
    );
    assertValidFinanceBudgetMemo(
      rawMemos[key] as FinanceState["budgetMemosThisMonth"][Id],
      `world.finance.budgetMemosThisMonth.${String(countryId)}`,
    );
  }

  assertValidAnnualState(finance, accounts);

  const opening = record.opening as FinanceState["opening"];
  if (opening === null || opening === undefined) {
    for (const account of accounts.values()) {
      if (account.balanceRUSD !== 0) {
        throw new RangeError(
          `world.finance.opening is required when account ${String(account.id)} has a non-zero balance`,
        );
      }
    }
  } else {
    assertValidOpeningRecord(opening);
  }

  assertAccountingIdentity(finance);
}

/** One canonical decimal account-id key of a summary total map. */
function parseAccountTotalKey(key: string, path: string): Id {
  if (!/^(0|[1-9][0-9]*)$/.test(key)) {
    throw new RangeError(`${path} key ${JSON.stringify(key)} is not a canonical decimal account id`);
  }
  const accountId = Number(key);
  if (!Number.isSafeInteger(accountId) || accountId > 0xffff_ffff) {
    throw new RangeError(`${path} key ${JSON.stringify(key)} is outside the account id range`);
  }
  return accountId;
}

/**
 * Validate one persisted monthly summary shape and its references.
 *
 * Totals are the pre-close trial balance, so only nonzero accounts are listed.
 * A non-equity balance is never negative at a close boundary; equity may be
 * signed. The four current flow totals are always present, finite, and
 * nonnegative. Cross-period properties (contiguity, month boundaries, ordering)
 * are checked by `assertValidPeriodSummaries`.
 */
export function assertValidFinancePeriodSummary(
  summary: FinancePeriodSummary,
  accounts: ReadonlyMap<number, FinancialAccount>,
  path: string,
): void {
  const record = requireRecord(summary, path);
  const start = requireInteger(
    record.periodStartDay,
    `${path}.periodStartDay`,
    0,
    CAMPAIGN_TERMINAL_DAY_INDEX,
  );
  const end = requireInteger(
    record.periodEndDay,
    `${path}.periodEndDay`,
    0,
    CAMPAIGN_TERMINAL_DAY_INDEX,
  );
  if (start > end) {
    throw new RangeError(`${path}.periodStartDay must not be after periodEndDay`);
  }
  if (!isCivilMonthEnd(end)) {
    throw new RangeError(`${path}.periodEndDay ${String(end)} is not a civil month-end`);
  }

  const totals = requireRecord(record.accountTotals, `${path}.accountTotals`);
  const compacted = record.countryFiscalTotals !== undefined;
  const totalsByAccount = new Map<number, number>();
  const countryIds = new Set<number>();
  for (const account of accounts.values()) {
    if (account.ownerKind === "country" && account.ownerId !== null) {
      countryIds.add(account.ownerId);
    }
  }
  if (compacted) {
    if (Object.keys(totals).length !== 0) {
      throw new RangeError(
        `${path}.accountTotals must be empty when countryFiscalTotals is present`,
      );
    }
    const fiscal = requireRecord(record.countryFiscalTotals, `${path}.countryFiscalTotals`);
    for (const key of Object.keys(fiscal)) {
      const countryId = parseAccountTotalKey(key, `${path}.countryFiscalTotals`);
      if (!countryIds.has(countryId)) {
        throw new RangeError(
          `${path}.countryFiscalTotals references unknown country ${String(countryId)}`,
        );
      }
      const entry = requireRecord(fiscal[key], `${path}.countryFiscalTotals.${key}`);
      // Sparse encoding: a missing fiscal field decodes as zero.
      const valueOf = (field: string): number =>
        entry[field] === undefined
          ? 0
          : requireFiniteNumber(
              entry[field],
              `${path}.countryFiscalTotals.${key}.${field}`,
            );
      const tax = valueOf("incomeTaxRevenueRUSD");
      const businessTax = valueOf("businessTaxRevenueRUSD");
      const welfare = valueOf("welfareExpenseRUSD");
      const interest = valueOf("interestExpenseRUSD");
      const net = valueOf("netFiscalResultRUSD");
      const subsidy = valueOf("subsidyExpenseRUSD");
      const administration = valueOf("administrationExpenseRUSD");
      const education = valueOf("educationExpenseRUSD");
      const training = valueOf("trainingExpenseRUSD");
      const military = valueOf("militaryExpenseRUSD");
const customs = valueOf("customsDutyRevenueRUSD");
      if (
        tax < 0 ||
        businessTax < 0 ||
        welfare < 0 ||
        interest < 0 ||
        subsidy < 0 ||
        administration < 0 ||
        education < 0 ||
        training < 0 ||
        military < 0 ||
        customs < 0
      ) {
        throw new RangeError(`${path}.countryFiscalTotals.${key} revenue/expense must be nonnegative`);
      }
      const expectedNet =
        tax +
        businessTax +
        customs -
        welfare -
        interest -
        subsidy -
        administration -
        education -
        training -
        military;
      if (Math.abs(net - expectedNet) > toleranceMoney(net, expectedNet)) {
        throw new RangeError(
          `${path}.countryFiscalTotals.${key}.netFiscalResultRUSD ${String(net)} does not equal ${String(expectedNet)}`,
        );
      }
    }
  } else {
    let assets = 0;
    let liabilities = 0;
    let equity = 0;
    let revenues = 0;
    let expenses = 0;
    // D-137: the checks of `parseAccountTotalKey` and `requireFiniteNumber`, with their
    // paths built only for a failing entry.
    const totalsPath = `${path}.accountTotals`;
    for (const key of Object.keys(totals)) {
      const numericKey = Number(key);
      const accountId =
        String(numericKey) === key && Number.isSafeInteger(numericKey) && numericKey >= 0 && numericKey <= 0xffff_ffff
          ? numericKey
          : parseAccountTotalKey(key, totalsPath);
      const account = accounts.get(accountId);
      if (account === undefined) {
        throw new RangeError(`${path}.accountTotals references unknown account ${String(accountId)}`);
      }
      const rawValue = totals[key];
      const value =
        typeof rawValue === "number" && Number.isFinite(rawValue)
          ? rawValue
          : requireFiniteNumber(rawValue, `${path}.accountTotals.${key}`);
      if (value === 0) {
        throw new RangeError(`${path}.accountTotals.${key} must be omitted when zero`);
      }
      if (value < 0 && !categoryAllowsNegativeBalance(account.category)) {
        throw new RangeError(
          `${path}.${key} must not be negative for ${account.category} account ${String(accountId)}`,
        );
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
      totalsByAccount.set(accountId, value);
    }
    // The pre-close trial balance frozen in the summary satisfies the identity.
    const debitSide = assets + expenses;
    const creditSide = liabilities + equity + revenues;
    if (Math.abs(debitSide - creditSide) > toleranceMoney(debitSide, creditSide)) {
      throw new RangeError(
        `${path}.accountTotals violates the accounting identity: assets+expenses ${String(debitSide)} != liabilities+equity+revenues ${String(creditSide)}`,
      );
    }
  }

  const budget = requireRecord(record.countryBudgetTotals, `${path}.countryBudgetTotals`);
  if (Object.keys(budget).length > countryIds.size) {
    throw new RangeError(
      `${path}.countryBudgetTotals must not contain more entries than there are countries`,
    );
  }
  for (const key of Object.keys(budget)) {
    const countryId = parseAccountTotalKey(key, `${path}.countryBudgetTotals`);
    if (!countryIds.has(countryId)) {
      throw new RangeError(
        `${path}.countryBudgetTotals references unknown country ${String(countryId)}`,
      );
    }
    assertValidBudgetTotals(
      budget[key] as FinancePeriodBudgetTotals,
      `${path}.countryBudgetTotals.${String(countryId)}`,
    );
  }

  const flows = requireRecord(record.flowTotalsByKind, `${path}.flowTotalsByKind`);
  const flowKeys = Object.keys(flows);
  for (const key of flowKeys) {
    if (!(FLOW_TRANSACTION_KINDS as readonly string[]).includes(key)) {
      throw new RangeError(`${path}.flowTotalsByKind contains unknown flow kind ${JSON.stringify(key)}`);
    }
  }
  if (flowKeys.length !== FLOW_TRANSACTION_KINDS.length) {
    throw new RangeError(
      `${path}.flowTotalsByKind must contain exactly the four current flow kinds`,
    );
  }
  const derivedFlows: Record<FlowTransactionKind, number> = {
    "goods-purchase": 0,
    "input-purchase": 0,
    wages: 0,
    upkeep: 0,
  };
  if (!compacted) {
    for (const [accountId, value] of totalsByAccount) {
      const account = accounts.get(accountId);
      if (account === undefined) continue;
      for (const kind of FLOW_TRANSACTION_KINDS) {
        if (account.subtype === FLOW_EXPENSE_SUBTYPE[kind]) derivedFlows[kind] += value;
      }
    }
  }
  for (const kind of FLOW_TRANSACTION_KINDS) {
    const value = requireFiniteNumber(flows[kind], `${path}.flowTotalsByKind.${kind}`);
    if (value < 0) {
      throw new RangeError(`${path}.flowTotalsByKind.${kind} must be nonnegative`);
    }
    if (!compacted) {
      const derived = derivedFlows[kind];
      if (Math.abs(value - derived) > toleranceMoney(value, derived)) {
        throw new RangeError(
          `${path}.flowTotalsByKind.${kind} ${String(value)} does not match the mapped expense total ${String(derived)}`,
        );
      }
    }
  }
}

/** Context required to validate period summaries against the world calendar. */
export interface PeriodSummaryValidationContext {
  readonly startDayIndex: Day;
  readonly dayIndex: Day;
  /**
   * True only for a staged close whose day has not advanced yet. A published
   * world always passes `false` (D-047 staged-versus-published distinction).
   */
  readonly allowUnadvancedClose: boolean;
}

/**
 * How much immutable period-summary history to revalidate.
 *
 * `"all"` is the default and is required at save/load/construction boundaries,
 * where untrusted or newly built state must be checked completely.
 *
 * `"latest"` validates the newest summary and the cross-period links needed to
 * publish the current close state, but does not re-parse every older immutable
 * summary. M6 uses it on the hot tick path after profiling showed repeated
 * validation of the growing summary history dominating the full-campaign
 * benchmark. Older summaries are created by the atomic close and are never
 * mutated, so this changes validation cost, not simulation semantics (D-059).
 */
export type PeriodSummaryValidationMode = "all" | "latest";

/** Optional economy-validation scope. */
export interface EconomyValidationOptions {
  readonly periodSummaries?: PeriodSummaryValidationMode;
  /**
   * Allow the transient end-of-day state where a close has been staged but the
   * day has not advanced yet. Published worlds keep this false (D-047/D-067).
   */
  readonly allowUnadvancedClose?: boolean;
}

/**
 * Validate the ordered, contiguous summary history and its consistency with
 * `closedThroughDay`.
 *
 * - `closedThroughDay` is null exactly when there are no summaries.
 * - The first period starts at `World.startDayIndex` and may be partial.
 * - Later periods start the day after the previous end.
 * - Every end is a civil month-end, and each later period starts the day after
 *   the previous end, so at most one summary exists per civil month.
 * - No summary extends beyond the current day and the last end equals
 *   `closedThroughDay`.
 * - Published state additionally requires `closedThroughDay < dayIndex`.
 */
export function assertValidPeriodSummaries(
  finance: FinanceState,
  context: PeriodSummaryValidationContext,
  mode: PeriodSummaryValidationMode = "all",
): void {
  const record = requireRecord(finance, "world.finance");
  const rawSummaries = requireArray(record.periodSummaries, "world.finance.periodSummaries");
  if (rawSummaries.length > MAX_PERIOD_SUMMARIES) {
    throw new RangeError(
      `world.finance.periodSummaries must contain at most ${String(MAX_PERIOD_SUMMARIES)} entries`,
    );
  }
  const rawClosed = record.closedThroughDay;
  const closedThroughDay =
    rawClosed === null
      ? null
      : requireInteger(
          rawClosed,
          "world.finance.closedThroughDay",
          0,
          CAMPAIGN_TERMINAL_DAY_INDEX,
        );
  if ((rawSummaries.length === 0) !== (closedThroughDay === null)) {
    throw new RangeError(
      "world.finance.closedThroughDay must be null exactly when no period summaries exist",
    );
  }
  // Fast path for worlds that have never closed (M2-only and any world before
  // its first month-end): no per-account work is needed on the hot tick path.
  if (rawSummaries.length === 0) return;

  const accounts = new Map<number, FinancialAccount>();
  for (const value of requireArray(record.accounts, "world.finance.accounts")) {
    const account = value as FinancialAccount;
    accounts.set(account.id, account);
  }

  const firstIndex = mode === "latest" ? rawSummaries.length - 1 : 0;
  let previousEnd: Day | null =
    firstIndex === 0
      ? null
      : ((rawSummaries[firstIndex - 1] as FinancePeriodSummary | undefined)
          ?.periodEndDay ?? null);
  for (let index = firstIndex; index < rawSummaries.length; index += 1) {
    const summary = rawSummaries[index] as FinancePeriodSummary;
    const path = `world.finance.periodSummaries[${String(index)}]`;
    assertValidFinancePeriodSummary(summary, accounts, path);
    const start = summary.periodStartDay;
    const end = summary.periodEndDay;
    if (index === 0) {
      if (start !== context.startDayIndex) {
        throw new RangeError(
          `${path}.periodStartDay ${String(start)} must equal world.startDayIndex ${String(context.startDayIndex)}`,
        );
      }
    } else if (previousEnd === null || start !== previousEnd + 1) {
      throw new RangeError(
        `${path} is not contiguous; periodStartDay ${String(start)} must follow the previous period end`,
      );
    } else if (civilMonthLabel(start) === civilMonthLabel(previousEnd)) {
      throw new RangeError(
        `${path} duplicates the civil month of the previous period; at most one summary exists per month`,
      );
    }
    if (end > context.dayIndex) {
      throw new RangeError(
        `${path}.periodEndDay ${String(end)} must not extend beyond the current day ${String(context.dayIndex)}`,
      );
    }
    previousEnd = end;
  }

  if (closedThroughDay !== null && previousEnd !== closedThroughDay) {
    throw new RangeError(
      `world.finance.closedThroughDay ${String(closedThroughDay)} must equal the last period end ${String(previousEnd)}`,
    );
  }
  if (closedThroughDay !== null) {
    if (closedThroughDay > context.dayIndex) {
      throw new RangeError(
        `world.finance.closedThroughDay ${String(closedThroughDay)} must not be after the current day ${String(context.dayIndex)}`,
      );
    }
    if (!context.allowUnadvancedClose && closedThroughDay === context.dayIndex) {
      throw new RangeError(
        `world.finance.closedThroughDay ${String(closedThroughDay)} must be earlier than world.dayIndex in published state; advance the day before publishing a closed world`,
      );
    }
  }
}

function assertValidBuilding(building: BuildingInstance): void {
  const record = requireRecord(building, "world.buildings[]");
  requireInteger(record.id, "world.buildings[].id", 0, 0xffff_ffff);
  requireInteger(record.definitionId, "world.buildings[].definitionId", 0, 0xffff_ffff);
  requireInteger(record.provinceId, "world.buildings[].provinceId", 0, 0xffff_ffff);
  requireInteger(record.level, "world.buildings[].level", 1, Number.MAX_SAFE_INTEGER);
  const condition = requireFiniteNumber(record.condition, "world.buildings[].condition");
  if (condition < 0 || condition > 1) {
    throw new RangeError("world.buildings[].condition must be in 0..1");
  }
  if (record.ownerKind !== "private" && record.ownerKind !== "state") {
    throw new RangeError("world.buildings[].ownerKind must be private or state");
  }
  requireInteger(record.ownerAccountId, "world.buildings[].ownerAccountId", 0, 0xffff_ffff);
  assertValidDayIndex(record.builtOnDay as number);
  if (typeof record.operational !== "boolean") {
    throw new TypeError("world.buildings[].operational must be a boolean");
  }
  const technique = requireFiniteNumber(record.technique, "world.buildings[].technique");
  if (!(technique > 0)) throw new RangeError("world.buildings[].technique must be positive");
  requireInteger(
    record.operatingCashAccountId,
    "world.buildings[].operatingCashAccountId",
    0,
    0xffff_ffff,
  );
}

function assertValidEmployment(assignment: EmploymentAssignment): void {
  const record = requireRecord(assignment, "world.employment[]");
  requireInteger(record.id, "world.employment[].id", 0, 0xffff_ffff);
  requireInteger(record.popBlockId, "world.employment[].popBlockId", 0, 0xffff_ffff);
  requireInteger(
    record.buildingInstanceId,
    "world.employment[].buildingInstanceId",
    0,
    0xffff_ffff,
  );
  requireInteger(record.professionId, "world.employment[].professionId", 0, 0xffff_ffff);
  requireInteger(record.workers, "world.employment[].workers", 1, Number.MAX_SAFE_INTEGER);
}

function assertValidLot(
  lot: StockLot,
  path: string,
  buildingIds: ReadonlySet<number>,
  goodCount: number,
): void {
  const record = requireRecord(lot, path);
  const goodId = requireInteger(record.goodId, `${path}.goodId`, 0, 0xffff_ffff);
  if (goodId >= goodCount) {
    throw new RangeError(`${path}.goodId ${String(goodId)} is outside the market price range`);
  }
  const ownerBuildingId = requireInteger(
    record.ownerBuildingId,
    `${path}.ownerBuildingId`,
    0,
    0xffff_ffff,
  );
  if (!buildingIds.has(ownerBuildingId)) {
    throw new RangeError(`${path} references unknown owner building ${String(ownerBuildingId)}`);
  }
  const quantity = requireFiniteNumber(record.quantity, `${path}.quantity`);
  if (!(quantity > 0)) throw new RangeError(`${path}.quantity must be strictly positive`);
}

function assertValidMarket(
  market: Market,
  path: string,
  buildingIds: ReadonlySet<number>,
): void {
  const record = requireRecord(market, path);
  requireInteger(record.id, `${path}.id`, 0, 0xffff_ffff);

  const rawPrices = requireArray(record.priceRUSD, `${path}.priceRUSD`);
  if (rawPrices.length === 0) throw new RangeError(`${path}.priceRUSD must not be empty`);
  for (let index = 0; index < rawPrices.length; index += 1) {
    const price = requireFiniteNumber(rawPrices[index], `${path}.priceRUSD[${String(index)}]`);
    if (!(price > 0)) throw new RangeError(`${path}.priceRUSD[${String(index)}] must be positive`);
  }

  const rawLots = requireArray(record.stockLots, `${path}.stockLots`);
  const lots = new Set<string>();
  for (let index = 0; index < rawLots.length; index += 1) {
    const lot = rawLots[index] as StockLot;
    assertValidLot(lot, `${path}.stockLots[${String(index)}]`, buildingIds, rawPrices.length);
    const key = `${String(lot.goodId)}:${String(lot.ownerBuildingId)}`;
    if (lots.has(key)) {
      throw new RangeError(
        `${path}.stockLots contains duplicate lot for good ${String(lot.goodId)} owner ${String(lot.ownerBuildingId)}`,
      );
    }
    lots.add(key);
  }
}

function assertOwnerAccountSets(world: World, index: ReturnType<typeof buildFinanceIndex>): void {
  const fiscalAccountsRequired = world.countries.length > 0;
  const debtAccountsRequired =
    world.finance.debtContracts.length > 0 ||
    world.countries.some((country) => country.debt.enabled);
  for (const block of world.popBlocks) {
    const subtypes = [
      "owner-equity",
      "wage-income",
      "consumption-expense",
    ] as const;
    for (const subtype of subtypes) index.get("popBlock", block.id, subtype);
    if (fiscalAccountsRequired) {
      index.get("popBlock", block.id, "income-tax-expense");
      index.get("popBlock", block.id, "welfare-income");
    }
    if (debtAccountsRequired) {
      index.get("popBlock", block.id, "bond-asset");
      index.get("popBlock", block.id, "interest-receivable");
      index.get("popBlock", block.id, "interest-income");
    }
  }
  for (const building of world.buildings) {
    for (const subtype of [
      "owner-equity",
      "sales-revenue",
      "input-expense",
      "wage-expense",
      "upkeep-expense",
    ] as const) {
      index.get("building", building.id, subtype);
    }
    if (fiscalAccountsRequired) {
      index.get("building", building.id, "business-tax-expense");
      index.get("building", building.id, "subsidy-revenue");
    }
    if (world.profitDistribution.enabled) {
      index.get("building", building.id, "retained-profit");
    }
  }
  for (const country of world.countries) {
    const treasury = index.get("country", country.id, "treasury-cash");
    if (treasury.id !== country.treasuryAccountId) {
      throw new RangeError(
        `country ${String(country.id)} treasuryAccountId ${String(country.treasuryAccountId)} does not reference its own treasury-cash account ${String(treasury.id)}`,
      );
    }
    for (const subtype of [
      "owner-equity",
      "income-tax-revenue",
      "business-tax-revenue",
      "construction-in-progress",
      "public-capital",
      "welfare-expense",
      "subsidy-expense",
    ] as const) {
      index.get("country", country.id, subtype);
    }
    if (debtAccountsRequired) {
      for (const subtype of [
        "debt-liability",
        "interest-payable",
        "interest-expense",
        "bond-asset",
        "interest-receivable",
        "interest-income",
      ] as const) {
        index.get("country", country.id, subtype);
      }
    }
  }
  for (const account of world.finance.accounts) {
    if (account.ownerKind !== "system" || account.subtype !== "system-reserve-cash") continue;
    for (const subtype of ["owner-equity", "system-income"] as const) {
      index.get("system", null, subtype);
    }
  }
}

/**
 * M4c: when any fiscal policy is active, every province that contains pop blocks
 * or buildings must be claimed by exactly one country. Country validation has
 * already rejected duplicate claims, so this only needs to reject gaps.
 */
function assertFiscalProvinceOwnership(world: World): void {
  if (!world.countries.some((country) => fiscalPolicyIsActive(country.fiscal))) return;
  const claimed = buildProvinceOwnerMap(world);
  const economicProvinces = new Set<number>();
  for (const block of world.popBlocks) economicProvinces.add(block.provinceId);
  for (const building of world.buildings) economicProvinces.add(building.provinceId);
  for (const provinceId of economicProvinces) {
    if (!claimed.has(provinceId)) {
      throw new RangeError(
        `province ${String(provinceId)} must be owned by a country when a fiscal policy is active`,
      );
    }
  }
}

/** Validate M3/M4a/M4b collections and their cross-references. */
export function assertValidEconomyState(
  world: World,
  options: EconomyValidationOptions = {},
): void {
  assertValidFinanceState(world.finance);
  assertValidPeriodSummaries(
    world.finance,
    {
      startDayIndex: world.startDayIndex,
      dayIndex: world.dayIndex,
      allowUnadvancedClose: options.allowUnadvancedClose ?? false,
    },
    options.periodSummaries ?? "all",
  );
  const accounts = buildFinanceIndex(world.finance);
  if (world.finance.opening !== null && world.finance.opening.dayIndex !== world.startDayIndex) {
    throw new RangeError("world.finance.opening.dayIndex must equal world.startDayIndex");
  }

  const rawBuildings = requireArray(world.buildings, "world.buildings");
  const buildingById = new Map<number, BuildingInstance>();
  for (const value of rawBuildings) {
    const building = value as BuildingInstance;
    assertValidBuilding(building);
    if (buildingById.has(building.id)) {
      throw new RangeError(`duplicate building instance id ${String(building.id)}`);
    }
    buildingById.set(building.id, building);
  }

  const popBlockIds = new Set<number>(world.popBlocks.map((block) => block.id));
  const countryIds = new Set<number>(world.countries.map((country) => country.id));
  // Generic owner-reference invariant: every owner-owned account must point at
  // an existing owner, regardless of subtype or category. This intentionally
  // covers all current and future building-owned account roles.
  //
  // The same pass collects the D-047 owner-equity tallies, so the invariant adds
  // no extra per-account scan. Reference errors are reported first.
  const ownerEquityTallies = new Map<number | string, OwnerEquityTally>();
  for (const account of world.finance.accounts) {
    if (account.ownerKind === "building") {
      if (account.ownerId === null || !buildingById.has(account.ownerId)) {
        throw new RangeError(
          `building-owned ${account.subtype} account ${String(account.id)} references unknown building owner ${String(account.ownerId)}`,
        );
      }
      if (account.subtype === "retained-profit" && !world.profitDistribution.enabled) {
        throw new RangeError(
          `building ${String(account.ownerId)} has a retained-profit account but profit distribution is disabled`,
        );
      }
    } else if (account.ownerKind === "popBlock") {
      if (account.ownerId === null || !popBlockIds.has(account.ownerId)) {
        throw new RangeError(
          `popBlock-owned ${account.subtype} account ${String(account.id)} references unknown popBlock owner ${String(account.ownerId)}`,
        );
      }
    } else if (account.ownerKind === "country") {
      if (account.ownerId === null || !countryIds.has(account.ownerId)) {
        throw new RangeError(
          `country-owned ${account.subtype} account ${String(account.id)} references unknown country owner ${String(account.ownerId)}`,
        );
      }
    }
    const debtSubtype =
      account.subtype === "debt-liability" ||
      account.subtype === "interest-payable" ||
      account.subtype === "interest-expense" ||
      account.subtype === "bond-asset" ||
      account.subtype === "interest-receivable" ||
      account.subtype === "interest-income";
    if (
      debtSubtype &&
      world.finance.debtContracts.length === 0 &&
      !world.countries.some((country) => country.debt.enabled)
    ) {
      throw new RangeError(
        `account ${String(account.id)} has debt subtype ${account.subtype} but public debt is disabled`,
      );
    }
    tallyOwnerEquity(ownerEquityTallies, account);
  }
  // D-047 owner-equity invariant: independent of whether a system-reserve cash
  // account exists.
  assertOwnerEquityTallies(ownerEquityTallies.values());

  // D-137: blocks by id once, first occurrence first, as the per-assignment
  // `world.popBlocks.find` scans returned them.
  const blockById = new Map<number, World["popBlocks"][number]>();
  for (const block of world.popBlocks) {
    if (!blockById.has(block.id)) blockById.set(block.id, block);
  }
  const rawAssignments = requireArray(world.employment, "world.employment");
  const assignmentIds = new Set<number>();
  const assignmentKeys = new Set<string>();
  const assignedByBlock = new Map<number, number>();
  for (const value of rawAssignments) {
    const assignment = value as EmploymentAssignment;
    assertValidEmployment(assignment);
    if (assignmentIds.has(assignment.id)) {
      throw new RangeError(`duplicate employment assignment id ${String(assignment.id)}`);
    }
    assignmentIds.add(assignment.id);
    const key = `${String(assignment.popBlockId)}:${String(assignment.buildingInstanceId)}:${String(assignment.professionId)}`;
    if (assignmentKeys.has(key)) {
      throw new RangeError("duplicate employment assignment for the same block/building/profession");
    }
    assignmentKeys.add(key);
    const building = buildingById.get(assignment.buildingInstanceId);
    if (building === undefined) {
      throw new RangeError(
        `employment assignment references unknown building ${String(assignment.buildingInstanceId)}`,
      );
    }
    if (!building.operational) {
      throw new RangeError("employment assignment references a non-operational building");
    }
    const block = blockById.get(assignment.popBlockId);
    if (block === undefined) {
      throw new RangeError(
        `employment assignment references unknown popBlock ${String(assignment.popBlockId)}`,
      );
    }
    assignedByBlock.set(
      assignment.popBlockId,
      (assignedByBlock.get(assignment.popBlockId) ?? 0) + assignment.workers,
    );
  }
  for (const [blockId, assigned] of assignedByBlock) {
    const block = blockById.get(blockId);
    if (block === undefined) throw new RangeError(`unknown popBlock ${String(blockId)}`);
    if (assigned > workingAgePopulation(block)) {
      throw new RangeError(
        `popBlock ${String(blockId)} is assigned ${String(assigned)} workers but has only ${String(workingAgePopulation(block))} working-age people`,
      );
    }
  }

  const rawMarkets = requireArray(world.markets, "world.markets");
  const provinceIds = new Set<number>(world.provinceEconomies.map((province) => province.id));
  const marketIds = new Set<number>();
  const marketById = new Map<number, Market>();
  const buildingIds = new Set<number>(buildingById.keys());
  for (const value of rawMarkets) {
    const market = value as Market;
    assertValidMarket(market, "world.markets[]", buildingIds);
    if (marketIds.has(market.id)) {
      throw new RangeError(`duplicate market id ${String(market.id)}`);
    }
    marketIds.add(market.id);
    marketById.set(market.id, market);
  }

  // D-119: a market's provinces are derived from `ProvinceEconomy.marketId`.
  const provinceMarket = new Map<number, number>();
  const provincesByMarket = new Map<number, number[]>();
  for (const province of world.provinceEconomies) {
    if (province.marketId === null) continue;
    provinceMarket.set(province.id, province.marketId);
    const list = provincesByMarket.get(province.marketId);
    if (list === undefined) provincesByMarket.set(province.marketId, [province.id]);
    else list.push(province.id);
  }
  for (const market of marketById.values()) {
    if ((provincesByMarket.get(market.id) ?? []).length === 0) {
      throw new RangeError(`market ${String(market.id)} must contain at least one province`);
    }
    {
      for (const lot of market.stockLots) {
        const owner = buildingById.get(lot.ownerBuildingId);
        if (owner === undefined) {
          throw new RangeError(
            `market ${String(market.id)} lot references unknown owner building ${String(lot.ownerBuildingId)}`,
          );
        }
        if (provinceMarket.get(owner.provinceId) !== market.id) {
          // E6a: a lot owned by a building outside the market is an imported good
          // delivered by the trade arrivals phase. Only trade-enabled worlds may hold
          // them, and the owner must still be a real operational building (D-079 §8).
          if (!world.trade.enabled) {
            throw new RangeError(
              `market ${String(market.id)} lot owner building ${String(owner.id)} is outside the market`,
            );
          }
          if (!owner.operational) {
            throw new RangeError(
              `market ${String(market.id)} imported lot owner building ${String(owner.id)} is not operational`,
            );
          }
        }
      }
    }
  }

  // E6a customs administration: null only in a world with no countries, otherwise a
  // country that owns at least one of the market's provinces.
  const provinceOwnerById = buildProvinceOwnerMap(world);
  const countryIdSet = new Set(world.countries.map((country) => country.id));
  for (const market of marketById.values()) {
    const declared = market.customsCountryId;
    if (declared === null) {
      for (const provinceId of provincesByMarket.get(market.id) ?? []) {
        if (provinceOwnerById.get(provinceId) !== undefined) {
          throw new RangeError(
            `market ${String(market.id)} has owned provinces and therefore requires a customsCountryId`,
          );
        }
      }
      continue;
    }
    if (!countryIdSet.has(declared)) {
      throw new RangeError(
        `market ${String(market.id)} customsCountryId ${String(declared)} is not a registered country`,
      );
    }
    let ownsProvince = false;
    for (const provinceId of provincesByMarket.get(market.id) ?? []) {
      if (provinceOwnerById.get(provinceId) === declared) {
        ownsProvince = true;
        break;
      }
    }
    if (!ownsProvince) {
      throw new RangeError(
        `market ${String(market.id)} customsCountryId ${String(declared)} owns no province of the market`,
      );
    }
  }

  const buildingIdsByProvince = new Map<number, number[]>();
  for (const value of rawBuildings) {
    const building = value as BuildingInstance;
    const list = buildingIdsByProvince.get(building.provinceId);
    if (list === undefined) buildingIdsByProvince.set(building.provinceId, [building.id]);
    else list.push(building.id);
  }
  // D-118: every province with political state must have its economic record.
  if (world.provinces.enabled) {
    const economicProvinceIds = new Set(world.provinceEconomies.map((province) => province.id));
    for (const record of world.provinces.ownership) {
      if (!economicProvinceIds.has(record.provinceId)) {
        throw new RangeError(
          `province ${String(record.provinceId)} has ownership but no province economy record`,
        );
      }
    }
  }
  for (const province of world.provinceEconomies) {
    if (world.markets.length === 0) {
      if (province.marketId !== null) {
        throw new RangeError(`province ${String(province.id)} references a market but none exists`);
      }
      if (province.buildingInstanceIds.length > 0) {
        throw new RangeError(`province ${String(province.id)} has buildings but no market`);
      }
    } else {
      if (province.marketId === null) {
        throw new RangeError(`province ${String(province.id)} has no market`);
      }
      const market = marketById.get(province.marketId);
      if (market === undefined) {
        throw new RangeError(
          `province ${String(province.id)} references unknown market ${String(province.marketId)}`,
        );
      }
    }
    const expectedBuildings = (buildingIdsByProvince.get(province.id) ?? []).sort(
      (left, right) => left - right,
    );
    const actualBuildings = [...province.buildingInstanceIds].sort((left, right) => left - right);
    if (
      expectedBuildings.length !== actualBuildings.length ||
      expectedBuildings.some((id, index) => id !== actualBuildings[index])
    ) {
      throw new RangeError(`province ${String(province.id)} buildingInstanceIds do not match its buildings`);
    }
    for (const buildingId of province.buildingInstanceIds) {
      if (!buildingIds.has(buildingId)) {
        throw new RangeError(
          `province ${String(province.id)} references unknown building ${String(buildingId)}`,
        );
      }
    }
  }

  const provinceOwners = buildProvinceOwnerMap(world);
  const countryProvinces = buildCountryProvinceMap(world);
  const countryById = new Map(world.countries.map((country) => [country.id, country]));
  for (const country of world.countries) {
    if (typeof country.immigrationOpen !== "boolean") {
      throw new TypeError(
        `country ${String(country.id)} immigrationOpen must be a boolean`,
      );
    }
    assertValidIndustrialPolicy(
      country.industrial,
      `country ${String(country.id)}.industrial`,
    );
    assertValidDebtPolicy(country.debt, `country ${String(country.id)}.debt`);
    assertValidRegimeState(
      country.regime,
      `country ${String(country.id)}.regime`,
      CAMPAIGN_TERMINAL_DAY_INDEX,
    );
    assertValidCountryLaws(
      country,
      undefined,
      `country ${String(country.id)}.laws`,
    );
    assertValidLawTransitions(
      country.lawTransitions,
      `country ${String(country.id)}.lawTransitions`,
      CAMPAIGN_TERMINAL_DAY_INDEX,
    );
    assertValidInterestGroupStates(
      country.interestGroups,
      `country ${String(country.id)}.interestGroups`,
    );
    assertValidInstitutionState(
      country.institutions,
      `country ${String(country.id)}.institutions`,
      CAMPAIGN_TERMINAL_DAY_INDEX,
    );
    assertValidLaborPolicyState(
      country.labor,
      `country ${String(country.id)}.labor`,
      CAMPAIGN_TERMINAL_DAY_INDEX,
    );
    assertValidTradePolicyState(
      country.trade,
      world.markets[0]?.priceRUSD.length ?? 0,
      `country ${String(country.id)}.trade`,
    );
    if (country.debt.enabled) {
      if (country.debt.creditorKind === "country") {
        if (country.debt.creditorId === country.id) {
          throw new RangeError(`country ${String(country.id)} cannot be its own debt creditor`);
        }
        if (!countryIds.has(country.debt.creditorId)) {
          throw new RangeError(
            `country ${String(country.id)} debt creditor references unknown country ${String(country.debt.creditorId)}`,
          );
        }
      } else if (!popBlockIds.has(country.debt.creditorId)) {
        throw new RangeError(
          `country ${String(country.id)} debt creditor references unknown popBlock ${String(country.debt.creditorId)}`,
        );
      }
    }
    let countryMarket: number | undefined;
    for (const provinceId of countryProvinces.get(country.id) ?? []) {
      const marketId = provinceMarket.get(provinceId);
      if (marketId === undefined) {
        throw new RangeError(
          `country ${String(country.id)} owns province ${String(provinceId)} which has no market`,
        );
      }
      if (countryMarket === undefined) countryMarket = marketId;
      else if (countryMarket !== marketId) {
        throw new RangeError(
          `country ${String(country.id)} spans markets ${String(countryMarket)} and ${String(marketId)}; a country belongs to one customs territory (D-119)`,
        );
      }
    }
  }

  const contractIds = new Set<number>();
  let maxContractId = 0;
  for (const contract of world.finance.debtContracts) {
    assertValidDebtContract(contract, `debt contract ${String(contract.id)}`);
    if (contractIds.has(contract.id)) {
      throw new RangeError(`duplicate debt contract id ${String(contract.id)}`);
    }
    contractIds.add(contract.id);
    maxContractId = Math.max(maxContractId, contract.id);
    if (!countryIds.has(contract.issuerCountryId)) {
      throw new RangeError(
        `debt contract ${String(contract.id)} references unknown issuer country ${String(contract.issuerCountryId)}`,
      );
    }
    if (contract.holderKind === "country") {
      if (!countryIds.has(contract.holderId)) {
        throw new RangeError(
          `debt contract ${String(contract.id)} references unknown holder country ${String(contract.holderId)}`,
        );
      }
      if (contract.holderId === contract.issuerCountryId) {
        throw new RangeError(`debt contract ${String(contract.id)} is held by its own issuer`);
      }
    } else if (!popBlockIds.has(contract.holderId)) {
      throw new RangeError(
        `debt contract ${String(contract.id)} references unknown holder popBlock ${String(contract.holderId)}`,
      );
    }
  }
  if (world.finance.nextContractId <= maxContractId) {
    throw new RangeError(
      "world.finance.nextContractId must be greater than every debt contract id",
    );
  }
  for (const country of world.countries) {
    if (debtOutstandingPrincipal(world.finance.debtContracts, country.id) < 0) {
      throw new RangeError(`country ${String(country.id)} has invalid outstanding debt`);
    }
  }

  for (const building of buildingById.values()) {
    if (!provinceIds.has(building.provinceId)) {
      throw new RangeError(
        `building ${String(building.id)} references unknown province ${String(building.provinceId)}`,
      );
    }
    if (world.markets.length > 0 && !provinceMarket.has(building.provinceId)) {
      throw new RangeError(
        `building ${String(building.id)} is in a province with no market`,
      );
    }
    const ownerAccount = accounts.byId.get(building.ownerAccountId);
    if (ownerAccount === undefined) {
      throw new RangeError(`building ${String(building.id)} references unknown owner account`);
    }
    if (building.ownerKind === "state") {
      if (!world.profitDistribution.enabled) {
        throw new RangeError(
          `building ${String(building.id)} is state-owned but profit distribution is disabled`,
        );
      }
      if (
        ownerAccount.ownerKind !== "country" ||
        ownerAccount.subtype !== "treasury-cash" ||
        ownerAccount.ownerId === null
      ) {
        throw new RangeError(
          `building ${String(building.id)} state owner account must be a country treasury-cash account`,
        );
      }
      const buildingCountry = provinceOwners.get(building.provinceId) ?? null;
      if (buildingCountry !== ownerAccount.ownerId) {
        throw new RangeError(
          `building ${String(building.id)} must be owned by the country that owns its province`,
        );
      }
      const operatingAccount = accounts.byId.get(building.operatingCashAccountId);
      if (operatingAccount === undefined) {
        throw new RangeError(`building ${String(building.id)} references unknown operating account`);
      }
      if (operatingAccount.subtype !== "operating-cash" || operatingAccount.ownerId !== building.id) {
        throw new RangeError(
          `building ${String(building.id)} operating account must be an operating account owned by it`,
        );
      }
      continue;
    }
    if (ownerAccount.subtype !== "household-cash") {
      throw new RangeError(`building ${String(building.id)} owner account must be household cash`);
    }
    const ownerBlock =
      ownerAccount.ownerId === null
        ? undefined
        : blockById.get(ownerAccount.ownerId);
    if (ownerBlock === undefined) {
      throw new RangeError(
        `building ${String(building.id)} owner account must belong to a pop block`,
      );
    }
    const buildingCountry = provinceOwners.get(building.provinceId) ?? null;
    const ownerCountry = provinceOwners.get(ownerBlock.provinceId) ?? null;
    if (buildingCountry !== ownerCountry) {
      throw new RangeError(
        `building ${String(building.id)} and its owner popBlock ${String(ownerBlock.id)} must belong to the same country`,
      );
    }
    const operatingAccount = accounts.byId.get(building.operatingCashAccountId);
    if (operatingAccount === undefined) {
      throw new RangeError(`building ${String(building.id)} references unknown operating account`);
    }
    if (operatingAccount.subtype !== "operating-cash" || operatingAccount.ownerId !== building.id) {
      throw new RangeError(
        `building ${String(building.id)} operating account must be an operating account owned by it`,
      );
    }
  }

  for (const assignment of world.employment) {
    const block = blockById.get(assignment.popBlockId);
    const building = buildingById.get(assignment.buildingInstanceId);
    if (block === undefined || building === undefined) continue;
    const sourceCountry = provinceOwners.get(block.provinceId) ?? null;
    const destinationCountry = provinceOwners.get(building.provinceId) ?? null;
    if (sourceCountry === destinationCountry) continue;
    if (destinationCountry === null) {
      throw new RangeError(
        `employment assignment cannot move country ${String(sourceCountry)} residents into an unowned province`,
      );
    }
    if (countryById.get(destinationCountry)?.immigrationOpen !== true) {
      throw new RangeError(
        `employment assignment crosses a closed border into country ${String(destinationCountry)}`,
      );
    }
  }

  assertOwnerAccountSets(world, accounts);
  assertValidConstructionState(world);
  assertValidPoliticsState(
    world.politics,
    "world.politics",
    CAMPAIGN_TERMINAL_DAY_INDEX,
  );
  assertValidCountryCurrencyState({
    countries: world.countries,
    currencies: world.currencies,
    currencyValuations: world.currencyValuations,
    provinceIds,
    expectedStartDay: world.startDayIndex,
  });
  assertFiscalProvinceOwnership(world);
}

/** Export for tests and scenario validation. */
export { assertValidMarket, assertValidBuilding, assertValidEmployment };
export type { FinancialAccount, JournalLine };
