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
import { MONEY_TOLERANCE_SUSD } from "../population/constants.js";
import type { Day, Id, MoneySUSD } from "../types.js";
import { requireFiniteNumber, requireInteger, requireRecord } from "../validation.js";
import type {
  FinanceBudgetMemo,
  FinancePeriodBudgetTotals,
  FinanceState,
} from "./types.js";

/** The zero memo for a country with no current-period activity. */
export function emptyFinanceBudgetMemo(): FinanceBudgetMemo {
  return {
    welfareRequestedSUSD: 0,
    welfareShortfallSUSD: 0,
    businessTaxAssessedSUSD: 0,
    businessTaxUncollectedSUSD: 0,
    debtIssuedSUSD: 0,
    principalRepaidSUSD: 0,
    interestPaidSUSD: 0,
    unfinancedRequirementSUSD: 0,
    constructionSpentSUSD: 0,
    constructionWrittenOffSUSD: 0,
    constructionMaterialsSpentSUSD: 0,
    subsidyRequestedSUSD: 0,
    subsidyShortfallSUSD: 0,
    publicEnterpriseSupportSUSD: 0,
    administrationRequestedSUSD: 0,
    administrationShortfallSUSD: 0,
    educationRequestedSUSD: 0,
    educationShortfallSUSD: 0,
    trainingRequestedSUSD: 0,
    trainingShortfallSUSD: 0,
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
    readonly welfareRequestedSUSD?: MoneySUSD;
    readonly welfareShortfallSUSD?: MoneySUSD;
    readonly businessTaxAssessedSUSD?: MoneySUSD;
    readonly businessTaxUncollectedSUSD?: MoneySUSD;
    readonly debtIssuedSUSD?: MoneySUSD;
    readonly principalRepaidSUSD?: MoneySUSD;
    readonly interestPaidSUSD?: MoneySUSD;
    readonly unfinancedRequirementSUSD?: MoneySUSD;
    readonly constructionSpentSUSD?: MoneySUSD;
    readonly constructionWrittenOffSUSD?: MoneySUSD;
    readonly constructionMaterialsSpentSUSD?: MoneySUSD;
    readonly subsidyRequestedSUSD?: MoneySUSD;
    readonly subsidyShortfallSUSD?: MoneySUSD;
    readonly publicEnterpriseSupportSUSD?: MoneySUSD;
    readonly administrationRequestedSUSD?: MoneySUSD;
    readonly administrationShortfallSUSD?: MoneySUSD;
    readonly educationRequestedSUSD?: MoneySUSD;
    readonly educationShortfallSUSD?: MoneySUSD;
    readonly trainingRequestedSUSD?: MoneySUSD;
    readonly trainingShortfallSUSD?: MoneySUSD;
    readonly businessTaxAssessedDay?: Day;
  },
): FinanceBudgetMemo {
  const current = readBudgetMemo(finance, countryId);
  const next: FinanceBudgetMemo = {
    welfareRequestedSUSD: addAmount(
      current.welfareRequestedSUSD,
      delta.welfareRequestedSUSD ?? 0,
      "welfareRequestedSUSD",
    ),
    welfareShortfallSUSD: addAmount(
      current.welfareShortfallSUSD,
      delta.welfareShortfallSUSD ?? 0,
      "welfareShortfallSUSD",
    ),
    businessTaxAssessedSUSD: addAmount(
      current.businessTaxAssessedSUSD,
      delta.businessTaxAssessedSUSD ?? 0,
      "businessTaxAssessedSUSD",
    ),
    businessTaxUncollectedSUSD: addAmount(
      current.businessTaxUncollectedSUSD,
      delta.businessTaxUncollectedSUSD ?? 0,
      "businessTaxUncollectedSUSD",
    ),
    debtIssuedSUSD: addAmount(
      current.debtIssuedSUSD,
      delta.debtIssuedSUSD ?? 0,
      "debtIssuedSUSD",
    ),
    principalRepaidSUSD: addAmount(
      current.principalRepaidSUSD,
      delta.principalRepaidSUSD ?? 0,
      "principalRepaidSUSD",
    ),
    interestPaidSUSD: addAmount(
      current.interestPaidSUSD,
      delta.interestPaidSUSD ?? 0,
      "interestPaidSUSD",
    ),
    unfinancedRequirementSUSD: addAmount(
      current.unfinancedRequirementSUSD,
      delta.unfinancedRequirementSUSD ?? 0,
      "unfinancedRequirementSUSD",
    ),
    constructionSpentSUSD: addAmount(
      current.constructionSpentSUSD,
      delta.constructionSpentSUSD ?? 0,
      "constructionSpentSUSD",
    ),
    constructionWrittenOffSUSD: addAmount(
      current.constructionWrittenOffSUSD,
      delta.constructionWrittenOffSUSD ?? 0,
      "constructionWrittenOffSUSD",
    ),
    constructionMaterialsSpentSUSD: addAmount(
      current.constructionMaterialsSpentSUSD,
      delta.constructionMaterialsSpentSUSD ?? 0,
      "constructionMaterialsSpentSUSD",
    ),
    subsidyRequestedSUSD: addAmount(
      current.subsidyRequestedSUSD,
      delta.subsidyRequestedSUSD ?? 0,
      "subsidyRequestedSUSD",
    ),
    subsidyShortfallSUSD: addAmount(
      current.subsidyShortfallSUSD,
      delta.subsidyShortfallSUSD ?? 0,
      "subsidyShortfallSUSD",
    ),
    publicEnterpriseSupportSUSD: addAmount(
      current.publicEnterpriseSupportSUSD,
      delta.publicEnterpriseSupportSUSD ?? 0,
      "publicEnterpriseSupportSUSD",
    ),
    administrationRequestedSUSD: addAmount(
      current.administrationRequestedSUSD ?? 0,
      delta.administrationRequestedSUSD ?? 0,
      "administrationRequestedSUSD",
    ),
    administrationShortfallSUSD: addAmount(
      current.administrationShortfallSUSD ?? 0,
      delta.administrationShortfallSUSD ?? 0,
      "administrationShortfallSUSD",
    ),
    educationRequestedSUSD: addAmount(
      current.educationRequestedSUSD ?? 0,
      delta.educationRequestedSUSD ?? 0,
      "educationRequestedSUSD",
    ),
    educationShortfallSUSD: addAmount(
      current.educationShortfallSUSD ?? 0,
      delta.educationShortfallSUSD ?? 0,
      "educationShortfallSUSD",
    ),
    trainingRequestedSUSD: addAmount(
      current.trainingRequestedSUSD ?? 0,
      delta.trainingRequestedSUSD ?? 0,
      "trainingRequestedSUSD",
    ),
    trainingShortfallSUSD: addAmount(
      current.trainingShortfallSUSD ?? 0,
      delta.trainingShortfallSUSD ?? 0,
      "trainingShortfallSUSD",
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
    welfareRequestedSUSD: memo.welfareRequestedSUSD,
    welfareShortfallSUSD: memo.welfareShortfallSUSD,
    businessTaxAssessedSUSD: memo.businessTaxAssessedSUSD,
    businessTaxUncollectedSUSD: memo.businessTaxUncollectedSUSD,
    debtIssuedSUSD: memo.debtIssuedSUSD,
    principalRepaidSUSD: memo.principalRepaidSUSD,
    interestPaidSUSD: memo.interestPaidSUSD,
    unfinancedRequirementSUSD: memo.unfinancedRequirementSUSD,
    constructionSpentSUSD: memo.constructionSpentSUSD,
    constructionWrittenOffSUSD: memo.constructionWrittenOffSUSD,
    constructionMaterialsSpentSUSD: memo.constructionMaterialsSpentSUSD,
    subsidyRequestedSUSD: memo.subsidyRequestedSUSD,
    subsidyShortfallSUSD: memo.subsidyShortfallSUSD,
    publicEnterpriseSupportSUSD: memo.publicEnterpriseSupportSUSD,
    administrationRequestedSUSD: memo.administrationRequestedSUSD ?? 0,
    administrationShortfallSUSD: memo.administrationShortfallSUSD ?? 0,
    educationRequestedSUSD: memo.educationRequestedSUSD ?? 0,
    educationShortfallSUSD: memo.educationShortfallSUSD ?? 0,
    trainingRequestedSUSD: memo.trainingRequestedSUSD ?? 0,
    trainingShortfallSUSD: memo.trainingShortfallSUSD ?? 0,
  };
}

/** Exact field-by-field sum used for annual aggregation. */
export function addBudgetTotals(
  left: FinancePeriodBudgetTotals,
  right: FinancePeriodBudgetTotals,
): FinancePeriodBudgetTotals {
  return {
    welfareRequestedSUSD: left.welfareRequestedSUSD + right.welfareRequestedSUSD,
    welfareShortfallSUSD: left.welfareShortfallSUSD + right.welfareShortfallSUSD,
    businessTaxAssessedSUSD:
      left.businessTaxAssessedSUSD + right.businessTaxAssessedSUSD,
    businessTaxUncollectedSUSD:
      left.businessTaxUncollectedSUSD + right.businessTaxUncollectedSUSD,
    debtIssuedSUSD: left.debtIssuedSUSD + right.debtIssuedSUSD,
    principalRepaidSUSD: left.principalRepaidSUSD + right.principalRepaidSUSD,
    interestPaidSUSD: left.interestPaidSUSD + right.interestPaidSUSD,
    unfinancedRequirementSUSD:
      left.unfinancedRequirementSUSD + right.unfinancedRequirementSUSD,
    constructionSpentSUSD:
      left.constructionSpentSUSD + right.constructionSpentSUSD,
    constructionWrittenOffSUSD:
      left.constructionWrittenOffSUSD + right.constructionWrittenOffSUSD,
    constructionMaterialsSpentSUSD:
      left.constructionMaterialsSpentSUSD + right.constructionMaterialsSpentSUSD,
    subsidyRequestedSUSD:
      left.subsidyRequestedSUSD + right.subsidyRequestedSUSD,
    subsidyShortfallSUSD:
      left.subsidyShortfallSUSD + right.subsidyShortfallSUSD,
    publicEnterpriseSupportSUSD:
      left.publicEnterpriseSupportSUSD + right.publicEnterpriseSupportSUSD,
    administrationRequestedSUSD:
      (left.administrationRequestedSUSD ?? 0) +
      (right.administrationRequestedSUSD ?? 0),
    administrationShortfallSUSD:
      (left.administrationShortfallSUSD ?? 0) +
      (right.administrationShortfallSUSD ?? 0),
    educationRequestedSUSD:
      (left.educationRequestedSUSD ?? 0) + (right.educationRequestedSUSD ?? 0),
    educationShortfallSUSD:
      (left.educationShortfallSUSD ?? 0) + (right.educationShortfallSUSD ?? 0),
    trainingRequestedSUSD:
      (left.trainingRequestedSUSD ?? 0) + (right.trainingRequestedSUSD ?? 0),
    trainingShortfallSUSD:
      (left.trainingShortfallSUSD ?? 0) + (right.trainingShortfallSUSD ?? 0),
  };
}

/** Zero period budget totals. */
export function emptyBudgetTotals(): FinancePeriodBudgetTotals {
  return {
    welfareRequestedSUSD: 0,
    welfareShortfallSUSD: 0,
    businessTaxAssessedSUSD: 0,
    businessTaxUncollectedSUSD: 0,
    debtIssuedSUSD: 0,
    principalRepaidSUSD: 0,
    interestPaidSUSD: 0,
    unfinancedRequirementSUSD: 0,
    constructionSpentSUSD: 0,
    constructionWrittenOffSUSD: 0,
    constructionMaterialsSpentSUSD: 0,
    subsidyRequestedSUSD: 0,
    subsidyShortfallSUSD: 0,
    publicEnterpriseSupportSUSD: 0,
    administrationRequestedSUSD: 0,
    administrationShortfallSUSD: 0,
    educationRequestedSUSD: 0,
    educationShortfallSUSD: 0,
    trainingRequestedSUSD: 0,
    trainingShortfallSUSD: 0,
  };
}

/** Validate one memo record. */
export function assertValidFinanceBudgetMemo(memo: FinanceBudgetMemo, path: string): void {
  const record = requireRecord(memo, path);
  const welfareRequested = requireFiniteNumber(
    record.welfareRequestedSUSD,
    `${path}.welfareRequestedSUSD`,
  );
  const welfareShortfall = requireFiniteNumber(
    record.welfareShortfallSUSD,
    `${path}.welfareShortfallSUSD`,
  );
  const businessTaxAssessed = requireFiniteNumber(
    record.businessTaxAssessedSUSD,
    `${path}.businessTaxAssessedSUSD`,
  );
  const businessTaxUncollected = requireFiniteNumber(
    record.businessTaxUncollectedSUSD,
    `${path}.businessTaxUncollectedSUSD`,
  );
  for (const field of [
    "debtIssuedSUSD",
    "principalRepaidSUSD",
    "interestPaidSUSD",
    "unfinancedRequirementSUSD",
    "constructionSpentSUSD",
    "constructionWrittenOffSUSD",
    "constructionMaterialsSpentSUSD",
    "subsidyRequestedSUSD",
    "subsidyShortfallSUSD",
    "publicEnterpriseSupportSUSD",
  ] as const) {
    const value = requireFiniteNumber(record[field], `${path}.${field}`);
    if (value < 0) throw new RangeError(`${path}.${field} must be non-negative`);
  }
  for (const [label, value] of [
    ["welfareRequestedSUSD", welfareRequested],
    ["welfareShortfallSUSD", welfareShortfall],
    ["businessTaxAssessedSUSD", businessTaxAssessed],
    ["businessTaxUncollectedSUSD", businessTaxUncollected],
  ] as const) {
    if (value < 0) throw new RangeError(`${path}.${label} must be non-negative`);
  }
  if (welfareShortfall > welfareRequested + MONEY_TOLERANCE_SUSD) {
    throw new RangeError(`${path}.welfareShortfallSUSD must not exceed the request`);
  }
  if (businessTaxUncollected > businessTaxAssessed + MONEY_TOLERANCE_SUSD) {
    throw new RangeError(`${path}.businessTaxUncollectedSUSD must not exceed the assessment`);
  }
  const subsidyRequested = requireFiniteNumber(
    record.subsidyRequestedSUSD,
    `${path}.subsidyRequestedSUSD`,
  );
  const subsidyShortfall = requireFiniteNumber(
    record.subsidyShortfallSUSD,
    `${path}.subsidyShortfallSUSD`,
  );
  if (subsidyShortfall > subsidyRequested + MONEY_TOLERANCE_SUSD) {
    throw new RangeError(`${path}.subsidyShortfallSUSD must not exceed the request`);
  }
  const administrationRequested =
    record.administrationRequestedSUSD === undefined
      ? 0
      : requireFiniteNumber(
          record.administrationRequestedSUSD,
          `${path}.administrationRequestedSUSD`,
        );
  const administrationShortfall =
    record.administrationShortfallSUSD === undefined
      ? 0
      : requireFiniteNumber(
          record.administrationShortfallSUSD,
          `${path}.administrationShortfallSUSD`,
        );
  if (administrationRequested < 0 || administrationShortfall < 0) {
    throw new RangeError(`${path} administration memo must be non-negative`);
  }
  if (administrationShortfall > administrationRequested + MONEY_TOLERANCE_SUSD) {
    throw new RangeError(
      `${path}.administrationShortfallSUSD must not exceed the request`,
    );
  }
  const educationRequested =
    record.educationRequestedSUSD === undefined
      ? 0
      : requireFiniteNumber(
          record.educationRequestedSUSD,
          `${path}.educationRequestedSUSD`,
        );
  const educationShortfall =
    record.educationShortfallSUSD === undefined
      ? 0
      : requireFiniteNumber(
          record.educationShortfallSUSD,
          `${path}.educationShortfallSUSD`,
        );
  if (educationRequested < 0 || educationShortfall < 0) {
    throw new RangeError(`${path} education memo must be non-negative`);
  }
  if (educationShortfall > educationRequested + MONEY_TOLERANCE_SUSD) {
    throw new RangeError(`${path}.educationShortfallSUSD must not exceed the request`);
  }
  const trainingRequested =
    record.trainingRequestedSUSD === undefined
      ? 0
      : requireFiniteNumber(
          record.trainingRequestedSUSD,
          `${path}.trainingRequestedSUSD`,
        );
  const trainingShortfall =
    record.trainingShortfallSUSD === undefined
      ? 0
      : requireFiniteNumber(
          record.trainingShortfallSUSD,
          `${path}.trainingShortfallSUSD`,
        );
  if (trainingRequested < 0 || trainingShortfall < 0) {
    throw new RangeError(`${path} training memo must be non-negative`);
  }
  if (trainingShortfall > trainingRequested + MONEY_TOLERANCE_SUSD) {
    throw new RangeError(`${path}.trainingShortfallSUSD must not exceed the request`);
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
  const welfareRequested = valueOf("welfareRequestedSUSD");
  const welfareShortfall = valueOf("welfareShortfallSUSD");
  const businessTaxAssessed = valueOf("businessTaxAssessedSUSD");
  const businessTaxUncollected = valueOf("businessTaxUncollectedSUSD");
  for (const field of [
    "welfareRequestedSUSD",
    "welfareShortfallSUSD",
    "businessTaxAssessedSUSD",
    "businessTaxUncollectedSUSD",
    "debtIssuedSUSD",
    "principalRepaidSUSD",
    "interestPaidSUSD",
    "unfinancedRequirementSUSD",
    "constructionSpentSUSD",
    "constructionWrittenOffSUSD",
    "constructionMaterialsSpentSUSD",
    "subsidyRequestedSUSD",
    "subsidyShortfallSUSD",
    "publicEnterpriseSupportSUSD",
    "administrationRequestedSUSD",
    "administrationShortfallSUSD",
    "educationRequestedSUSD",
    "educationShortfallSUSD",
    "trainingRequestedSUSD",
    "trainingShortfallSUSD",
  ] as const) {
    if (valueOf(field) < 0) {
      throw new RangeError(`${path}.${field} must be non-negative`);
    }
  }
  if (welfareShortfall > welfareRequested + MONEY_TOLERANCE_SUSD) {
    throw new RangeError(`${path}.welfareShortfallSUSD must not exceed the request`);
  }
  if (businessTaxUncollected > businessTaxAssessed + MONEY_TOLERANCE_SUSD) {
    throw new RangeError(`${path}.businessTaxUncollectedSUSD must not exceed the assessment`);
  }
  if (
    valueOf("subsidyShortfallSUSD") >
    valueOf("subsidyRequestedSUSD") + MONEY_TOLERANCE_SUSD
  ) {
    throw new RangeError(`${path}.subsidyShortfallSUSD must not exceed the request`);
  }
  if (
    valueOf("administrationShortfallSUSD") >
    valueOf("administrationRequestedSUSD") + MONEY_TOLERANCE_SUSD
  ) {
    throw new RangeError(`${path}.administrationShortfallSUSD must not exceed the request`);
  }
  if (
    valueOf("educationShortfallSUSD") >
    valueOf("educationRequestedSUSD") + MONEY_TOLERANCE_SUSD
  ) {
    throw new RangeError(`${path}.educationShortfallSUSD must not exceed the request`);
  }
  if (
    valueOf("trainingShortfallSUSD") >
    valueOf("trainingRequestedSUSD") + MONEY_TOLERANCE_SUSD
  ) {
    throw new RangeError(`${path}.trainingShortfallSUSD must not exceed the request`);
  }
}
