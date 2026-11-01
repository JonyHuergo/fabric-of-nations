/**
 * E2 public-budget memo helpers (D-073).
 *
 * The month-to-date memo accumulates requested/assessed amounts and financing
 * movements reported alongside the accounting flows. It is not a liability and
 * never substitutes for an account posting:
 *
 * - requested welfare the treasury could not pay is an unmet budget, not debt;
 * - assessed business tax that exceeds a building's operating cash is an
 *   uncollected shortfall, not a receivable;
 * - borrowing and principal repayment are financing movements, not revenue or
 *   expense.
 *
 * Helpers are pure with respect to the finance object passed in: callers stage a
 * finance clone, mutate the clone through these helpers, and publish only after
 * validation.
 */

import { CAMPAIGN_TERMINAL_DAY_INDEX } from "../constants.js";
import { MONEY_TOLERANCE_RUSD } from "../population/constants.js";
import type { Day, Id, MoneyRUSD } from "../types.js";
import { requireFiniteNumber, requireInteger, requireRecord } from "../validation.js";
import type {
  FinanceBudgetMemo,
  FinancePeriodBudgetTotals,
  FinanceState,
} from "./types.js";

/** The zero memo for a country with no current-period activity. */
export function emptyFinanceBudgetMemo(): FinanceBudgetMemo {
  return {
    welfareRequestedRUSD: 0,
    welfareShortfallRUSD: 0,
    businessTaxAssessedRUSD: 0,
    businessTaxUncollectedRUSD: 0,
    debtIssuedRUSD: 0,
    principalRepaidRUSD: 0,
    interestPaidRUSD: 0,
    unfinancedRequirementRUSD: 0,
    constructionSpentRUSD: 0,
    constructionWrittenOffRUSD: 0,
    constructionMaterialsSpentRUSD: 0,
    subsidyRequestedRUSD: 0,
    subsidyShortfallRUSD: 0,
    publicEnterpriseSupportRUSD: 0,
    administrationRequestedRUSD: 0,
    administrationShortfallRUSD: 0,
    educationRequestedRUSD: 0,
    educationShortfallRUSD: 0,
    trainingRequestedRUSD: 0,
    trainingShortfallRUSD: 0,
    businessTaxAssessedDay: null,
  };
}

/** Current memo for one country, or the zero memo. Never mutates. */
export function readBudgetMemo(finance: FinanceState, countryId: Id): FinanceBudgetMemo {
  return finance.budgetMemosThisMonth[countryId] ?? emptyFinanceBudgetMemo();
}

/** Add one nonnegative amount to a memo field with finite-result checking. */
function addAmount(current: number, delta: number, label: string): number {
  if (!Number.isFinite(delta) || delta < 0) {
    throw new RangeError(`budget memo ${label} delta must be a finite nonnegative amount`);
  }
  const next = current + delta;
  if (!Number.isFinite(next) || next < 0) {
    throw new RangeError(`budget memo ${label} would become non-finite`);
  }
  return next;
}

/**
 * Accumulate period activity into one country's memo. The memo entry is created
 * only when something is recorded, so a world with no fiscal activity keeps an
 * empty map and an unchanged canonical form.
 */
export function accumulateBudgetMemo(
  finance: FinanceState,
  countryId: Id,
  delta: {
    readonly welfareRequestedRUSD?: MoneyRUSD;
    readonly welfareShortfallRUSD?: MoneyRUSD;
    readonly businessTaxAssessedRUSD?: MoneyRUSD;
    readonly businessTaxUncollectedRUSD?: MoneyRUSD;
    readonly debtIssuedRUSD?: MoneyRUSD;
    readonly principalRepaidRUSD?: MoneyRUSD;
    readonly interestPaidRUSD?: MoneyRUSD;
    readonly unfinancedRequirementRUSD?: MoneyRUSD;
    readonly constructionSpentRUSD?: MoneyRUSD;
    readonly constructionWrittenOffRUSD?: MoneyRUSD;
    readonly constructionMaterialsSpentRUSD?: MoneyRUSD;
    readonly subsidyRequestedRUSD?: MoneyRUSD;
    readonly subsidyShortfallRUSD?: MoneyRUSD;
    readonly publicEnterpriseSupportRUSD?: MoneyRUSD;
    readonly administrationRequestedRUSD?: MoneyRUSD;
    readonly administrationShortfallRUSD?: MoneyRUSD;
    readonly educationRequestedRUSD?: MoneyRUSD;
    readonly educationShortfallRUSD?: MoneyRUSD;
    readonly trainingRequestedRUSD?: MoneyRUSD;
    readonly trainingShortfallRUSD?: MoneyRUSD;
    readonly businessTaxAssessedDay?: Day;
  },
): FinanceBudgetMemo {
  const current = readBudgetMemo(finance, countryId);
  const next: FinanceBudgetMemo = {
    welfareRequestedRUSD: addAmount(
      current.welfareRequestedRUSD,
      delta.welfareRequestedRUSD ?? 0,
      "welfareRequestedRUSD",
    ),
    welfareShortfallRUSD: addAmount(
      current.welfareShortfallRUSD,
      delta.welfareShortfallRUSD ?? 0,
      "welfareShortfallRUSD",
    ),
    businessTaxAssessedRUSD: addAmount(
      current.businessTaxAssessedRUSD,
      delta.businessTaxAssessedRUSD ?? 0,
      "businessTaxAssessedRUSD",
    ),
    businessTaxUncollectedRUSD: addAmount(
      current.businessTaxUncollectedRUSD,
      delta.businessTaxUncollectedRUSD ?? 0,
      "businessTaxUncollectedRUSD",
    ),
    debtIssuedRUSD: addAmount(
      current.debtIssuedRUSD,
      delta.debtIssuedRUSD ?? 0,
      "debtIssuedRUSD",
    ),
    principalRepaidRUSD: addAmount(
      current.principalRepaidRUSD,
      delta.principalRepaidRUSD ?? 0,
      "principalRepaidRUSD",
    ),
    interestPaidRUSD: addAmount(
      current.interestPaidRUSD,
      delta.interestPaidRUSD ?? 0,
      "interestPaidRUSD",
    ),
    unfinancedRequirementRUSD: addAmount(
      current.unfinancedRequirementRUSD,
      delta.unfinancedRequirementRUSD ?? 0,
      "unfinancedRequirementRUSD",
    ),
    constructionSpentRUSD: addAmount(
      current.constructionSpentRUSD,
      delta.constructionSpentRUSD ?? 0,
      "constructionSpentRUSD",
    ),
    constructionWrittenOffRUSD: addAmount(
      current.constructionWrittenOffRUSD,
      delta.constructionWrittenOffRUSD ?? 0,
      "constructionWrittenOffRUSD",
    ),
    constructionMaterialsSpentRUSD: addAmount(
      current.constructionMaterialsSpentRUSD,
      delta.constructionMaterialsSpentRUSD ?? 0,
      "constructionMaterialsSpentRUSD",
    ),
    subsidyRequestedRUSD: addAmount(
      current.subsidyRequestedRUSD,
      delta.subsidyRequestedRUSD ?? 0,
      "subsidyRequestedRUSD",
    ),
    subsidyShortfallRUSD: addAmount(
      current.subsidyShortfallRUSD,
      delta.subsidyShortfallRUSD ?? 0,
      "subsidyShortfallRUSD",
    ),
    publicEnterpriseSupportRUSD: addAmount(
      current.publicEnterpriseSupportRUSD,
      delta.publicEnterpriseSupportRUSD ?? 0,
      "publicEnterpriseSupportRUSD",
    ),
    administrationRequestedRUSD: addAmount(
      current.administrationRequestedRUSD ?? 0,
      delta.administrationRequestedRUSD ?? 0,
      "administrationRequestedRUSD",
    ),
    administrationShortfallRUSD: addAmount(
      current.administrationShortfallRUSD ?? 0,
      delta.administrationShortfallRUSD ?? 0,
      "administrationShortfallRUSD",
    ),
    educationRequestedRUSD: addAmount(
      current.educationRequestedRUSD ?? 0,
      delta.educationRequestedRUSD ?? 0,
      "educationRequestedRUSD",
    ),
    educationShortfallRUSD: addAmount(
      current.educationShortfallRUSD ?? 0,
      delta.educationShortfallRUSD ?? 0,
      "educationShortfallRUSD",
    ),
    trainingRequestedRUSD: addAmount(
      current.trainingRequestedRUSD ?? 0,
      delta.trainingRequestedRUSD ?? 0,
      "trainingRequestedRUSD",
    ),
    trainingShortfallRUSD: addAmount(
      current.trainingShortfallRUSD ?? 0,
      delta.trainingShortfallRUSD ?? 0,
      "trainingShortfallRUSD",
    ),
    businessTaxAssessedDay:
      delta.businessTaxAssessedDay ?? current.businessTaxAssessedDay,
  };
  finance.budgetMemosThisMonth[countryId] = next;
  return next;
}

/** Frozen period budget totals from a month-to-date memo. */
export function budgetTotalsFromMemo(memo: FinanceBudgetMemo): FinancePeriodBudgetTotals {
  return {
    welfareRequestedRUSD: memo.welfareRequestedRUSD,
    welfareShortfallRUSD: memo.welfareShortfallRUSD,
    businessTaxAssessedRUSD: memo.businessTaxAssessedRUSD,
    businessTaxUncollectedRUSD: memo.businessTaxUncollectedRUSD,
    debtIssuedRUSD: memo.debtIssuedRUSD,
    principalRepaidRUSD: memo.principalRepaidRUSD,
    interestPaidRUSD: memo.interestPaidRUSD,
    unfinancedRequirementRUSD: memo.unfinancedRequirementRUSD,
    constructionSpentRUSD: memo.constructionSpentRUSD,
    constructionWrittenOffRUSD: memo.constructionWrittenOffRUSD,
    constructionMaterialsSpentRUSD: memo.constructionMaterialsSpentRUSD,
    subsidyRequestedRUSD: memo.subsidyRequestedRUSD,
    subsidyShortfallRUSD: memo.subsidyShortfallRUSD,
    publicEnterpriseSupportRUSD: memo.publicEnterpriseSupportRUSD,
    administrationRequestedRUSD: memo.administrationRequestedRUSD ?? 0,
    administrationShortfallRUSD: memo.administrationShortfallRUSD ?? 0,
    educationRequestedRUSD: memo.educationRequestedRUSD ?? 0,
    educationShortfallRUSD: memo.educationShortfallRUSD ?? 0,
    trainingRequestedRUSD: memo.trainingRequestedRUSD ?? 0,
    trainingShortfallRUSD: memo.trainingShortfallRUSD ?? 0,
  };
}

/** Exact field-by-field sum used for annual aggregation. */
export function addBudgetTotals(
  left: FinancePeriodBudgetTotals,
  right: FinancePeriodBudgetTotals,
): FinancePeriodBudgetTotals {
  return {
    welfareRequestedRUSD: left.welfareRequestedRUSD + right.welfareRequestedRUSD,
    welfareShortfallRUSD: left.welfareShortfallRUSD + right.welfareShortfallRUSD,
    businessTaxAssessedRUSD:
      left.businessTaxAssessedRUSD + right.businessTaxAssessedRUSD,
    businessTaxUncollectedRUSD:
      left.businessTaxUncollectedRUSD + right.businessTaxUncollectedRUSD,
    debtIssuedRUSD: left.debtIssuedRUSD + right.debtIssuedRUSD,
    principalRepaidRUSD: left.principalRepaidRUSD + right.principalRepaidRUSD,
    interestPaidRUSD: left.interestPaidRUSD + right.interestPaidRUSD,
    unfinancedRequirementRUSD:
      left.unfinancedRequirementRUSD + right.unfinancedRequirementRUSD,
    constructionSpentRUSD:
      left.constructionSpentRUSD + right.constructionSpentRUSD,
    constructionWrittenOffRUSD:
      left.constructionWrittenOffRUSD + right.constructionWrittenOffRUSD,
    constructionMaterialsSpentRUSD:
      left.constructionMaterialsSpentRUSD + right.constructionMaterialsSpentRUSD,
    subsidyRequestedRUSD:
      left.subsidyRequestedRUSD + right.subsidyRequestedRUSD,
    subsidyShortfallRUSD:
      left.subsidyShortfallRUSD + right.subsidyShortfallRUSD,
    publicEnterpriseSupportRUSD:
      left.publicEnterpriseSupportRUSD + right.publicEnterpriseSupportRUSD,
    administrationRequestedRUSD:
      (left.administrationRequestedRUSD ?? 0) +
      (right.administrationRequestedRUSD ?? 0),
    administrationShortfallRUSD:
      (left.administrationShortfallRUSD ?? 0) +
      (right.administrationShortfallRUSD ?? 0),
    educationRequestedRUSD:
      (left.educationRequestedRUSD ?? 0) + (right.educationRequestedRUSD ?? 0),
    educationShortfallRUSD:
      (left.educationShortfallRUSD ?? 0) + (right.educationShortfallRUSD ?? 0),
    trainingRequestedRUSD:
      (left.trainingRequestedRUSD ?? 0) + (right.trainingRequestedRUSD ?? 0),
    trainingShortfallRUSD:
      (left.trainingShortfallRUSD ?? 0) + (right.trainingShortfallRUSD ?? 0),
  };
}

/** Zero period budget totals. */
export function emptyBudgetTotals(): FinancePeriodBudgetTotals {
  return {
    welfareRequestedRUSD: 0,
    welfareShortfallRUSD: 0,
    businessTaxAssessedRUSD: 0,
    businessTaxUncollectedRUSD: 0,
    debtIssuedRUSD: 0,
    principalRepaidRUSD: 0,
    interestPaidRUSD: 0,
    unfinancedRequirementRUSD: 0,
    constructionSpentRUSD: 0,
    constructionWrittenOffRUSD: 0,
    constructionMaterialsSpentRUSD: 0,
    subsidyRequestedRUSD: 0,
    subsidyShortfallRUSD: 0,
    publicEnterpriseSupportRUSD: 0,
    administrationRequestedRUSD: 0,
    administrationShortfallRUSD: 0,
    educationRequestedRUSD: 0,
    educationShortfallRUSD: 0,
    trainingRequestedRUSD: 0,
    trainingShortfallRUSD: 0,
  };
}

/** Validate one memo record. */
export function assertValidFinanceBudgetMemo(memo: FinanceBudgetMemo, path: string): void {
  const record = requireRecord(memo, path);
  const welfareRequested = requireFiniteNumber(
    record.welfareRequestedRUSD,
    `${path}.welfareRequestedRUSD`,
  );
  const welfareShortfall = requireFiniteNumber(
    record.welfareShortfallRUSD,
    `${path}.welfareShortfallRUSD`,
  );
  const businessTaxAssessed = requireFiniteNumber(
    record.businessTaxAssessedRUSD,
    `${path}.businessTaxAssessedRUSD`,
  );
  const businessTaxUncollected = requireFiniteNumber(
    record.businessTaxUncollectedRUSD,
    `${path}.businessTaxUncollectedRUSD`,
  );
  for (const field of [
    "debtIssuedRUSD",
    "principalRepaidRUSD",
    "interestPaidRUSD",
    "unfinancedRequirementRUSD",
    "constructionSpentRUSD",
    "constructionWrittenOffRUSD",
    "constructionMaterialsSpentRUSD",
    "subsidyRequestedRUSD",
    "subsidyShortfallRUSD",
    "publicEnterpriseSupportRUSD",
  ] as const) {
    const value = requireFiniteNumber(record[field], `${path}.${field}`);
    if (value < 0) throw new RangeError(`${path}.${field} must be non-negative`);
  }
  for (const [label, value] of [
    ["welfareRequestedRUSD", welfareRequested],
    ["welfareShortfallRUSD", welfareShortfall],
    ["businessTaxAssessedRUSD", businessTaxAssessed],
    ["businessTaxUncollectedRUSD", businessTaxUncollected],
  ] as const) {
    if (value < 0) throw new RangeError(`${path}.${label} must be non-negative`);
  }
  if (welfareShortfall > welfareRequested + MONEY_TOLERANCE_RUSD) {
    throw new RangeError(`${path}.welfareShortfallRUSD must not exceed the request`);
  }
  if (businessTaxUncollected > businessTaxAssessed + MONEY_TOLERANCE_RUSD) {
    throw new RangeError(`${path}.businessTaxUncollectedRUSD must not exceed the assessment`);
  }
  const subsidyRequested = requireFiniteNumber(
    record.subsidyRequestedRUSD,
    `${path}.subsidyRequestedRUSD`,
  );
  const subsidyShortfall = requireFiniteNumber(
    record.subsidyShortfallRUSD,
    `${path}.subsidyShortfallRUSD`,
  );
  if (subsidyShortfall > subsidyRequested + MONEY_TOLERANCE_RUSD) {
    throw new RangeError(`${path}.subsidyShortfallRUSD must not exceed the request`);
  }
  const administrationRequested =
    record.administrationRequestedRUSD === undefined
      ? 0
      : requireFiniteNumber(
          record.administrationRequestedRUSD,
          `${path}.administrationRequestedRUSD`,
        );
  const administrationShortfall =
    record.administrationShortfallRUSD === undefined
      ? 0
      : requireFiniteNumber(
          record.administrationShortfallRUSD,
          `${path}.administrationShortfallRUSD`,
        );
  if (administrationRequested < 0 || administrationShortfall < 0) {
    throw new RangeError(`${path} administration memo must be non-negative`);
  }
  if (administrationShortfall > administrationRequested + MONEY_TOLERANCE_RUSD) {
    throw new RangeError(
      `${path}.administrationShortfallRUSD must not exceed the request`,
    );
  }
  const educationRequested =
    record.educationRequestedRUSD === undefined
      ? 0
      : requireFiniteNumber(
          record.educationRequestedRUSD,
          `${path}.educationRequestedRUSD`,
        );
  const educationShortfall =
    record.educationShortfallRUSD === undefined
      ? 0
      : requireFiniteNumber(
          record.educationShortfallRUSD,
          `${path}.educationShortfallRUSD`,
        );
  if (educationRequested < 0 || educationShortfall < 0) {
    throw new RangeError(`${path} education memo must be non-negative`);
  }
  if (educationShortfall > educationRequested + MONEY_TOLERANCE_RUSD) {
    throw new RangeError(`${path}.educationShortfallRUSD must not exceed the request`);
  }
  const trainingRequested =
    record.trainingRequestedRUSD === undefined
      ? 0
      : requireFiniteNumber(
          record.trainingRequestedRUSD,
          `${path}.trainingRequestedRUSD`,
        );
  const trainingShortfall =
    record.trainingShortfallRUSD === undefined
      ? 0
      : requireFiniteNumber(
          record.trainingShortfallRUSD,
          `${path}.trainingShortfallRUSD`,
        );
  if (trainingRequested < 0 || trainingShortfall < 0) {
    throw new RangeError(`${path} training memo must be non-negative`);
  }
  if (trainingShortfall > trainingRequested + MONEY_TOLERANCE_RUSD) {
    throw new RangeError(`${path}.trainingShortfallRUSD must not exceed the request`);
  }
  if (record.businessTaxAssessedDay !== null) {
    requireInteger(
      record.businessTaxAssessedDay,
      `${path}.businessTaxAssessedDay`,
      0,
      CAMPAIGN_TERMINAL_DAY_INDEX,
    );
  }
}

/** Validate one frozen period budget total record. Missing (sparse) fields are zero. */
export function assertValidBudgetTotals(
  totals: FinancePeriodBudgetTotals,
  path: string,
): void {
  const record = requireRecord(totals, path);
  const valueOf = (field: string): number =>
    record[field] === undefined
      ? 0
      : requireFiniteNumber(record[field], `${path}.${field}`);
  const welfareRequested = valueOf("welfareRequestedRUSD");
  const welfareShortfall = valueOf("welfareShortfallRUSD");
  const businessTaxAssessed = valueOf("businessTaxAssessedRUSD");
  const businessTaxUncollected = valueOf("businessTaxUncollectedRUSD");
  for (const field of [
    "welfareRequestedRUSD",
    "welfareShortfallRUSD",
    "businessTaxAssessedRUSD",
    "businessTaxUncollectedRUSD",
    "debtIssuedRUSD",
    "principalRepaidRUSD",
    "interestPaidRUSD",
    "unfinancedRequirementRUSD",
    "constructionSpentRUSD",
    "constructionWrittenOffRUSD",
    "constructionMaterialsSpentRUSD",
    "subsidyRequestedRUSD",
    "subsidyShortfallRUSD",
    "publicEnterpriseSupportRUSD",
    "administrationRequestedRUSD",
    "administrationShortfallRUSD",
    "educationRequestedRUSD",
    "educationShortfallRUSD",
    "trainingRequestedRUSD",
    "trainingShortfallRUSD",
  ] as const) {
    if (valueOf(field) < 0) {
      throw new RangeError(`${path}.${field} must be non-negative`);
    }
  }
  if (welfareShortfall > welfareRequested + MONEY_TOLERANCE_RUSD) {
    throw new RangeError(`${path}.welfareShortfallRUSD must not exceed the request`);
  }
  if (businessTaxUncollected > businessTaxAssessed + MONEY_TOLERANCE_RUSD) {
    throw new RangeError(`${path}.businessTaxUncollectedRUSD must not exceed the assessment`);
  }
  if (
    valueOf("subsidyShortfallRUSD") >
    valueOf("subsidyRequestedRUSD") + MONEY_TOLERANCE_RUSD
  ) {
    throw new RangeError(`${path}.subsidyShortfallRUSD must not exceed the request`);
  }
  if (
    valueOf("administrationShortfallRUSD") >
    valueOf("administrationRequestedRUSD") + MONEY_TOLERANCE_RUSD
  ) {
    throw new RangeError(`${path}.administrationShortfallRUSD must not exceed the request`);
  }
  if (
    valueOf("educationShortfallRUSD") >
    valueOf("educationRequestedRUSD") + MONEY_TOLERANCE_RUSD
  ) {
    throw new RangeError(`${path}.educationShortfallRUSD must not exceed the request`);
  }
  if (
    valueOf("trainingShortfallRUSD") >
    valueOf("trainingRequestedRUSD") + MONEY_TOLERANCE_RUSD
  ) {
    throw new RangeError(`${path}.trainingShortfallRUSD must not exceed the request`);
  }
}
