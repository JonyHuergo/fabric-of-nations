/**
 * E1 monthly economic reports derived from immutable finance summaries.
 *
 * Fiscal amounts are closed-period flows. Treasury/debt/household-cash fields are
 * end-of-close balances only for the recent detailed window; compacted summaries
 * report `null` rather than a fabricated balance. No market/production history is
 * persisted, so current conditions must be shown separately and labelled.
 */

import type { CountrySnapshot, SnapshotAnnualReport, SnapshotFinancePeriod } from "./protocol.js";

export interface MonthlyBalanceChange {
  readonly endSUSD: number;
  /** Change from the previous detailed close, or null when not derivable. */
  readonly changeSUSD: number | null;
}

export interface MonthlyEconomicReport {
  readonly periodStartDay: number;
  readonly periodEndDay: number;
  readonly periodStartLabel: string;
  readonly periodEndLabel: string;
  readonly incomeTaxSUSD: number;
  readonly businessTaxRevenueSUSD: number;
  readonly welfareRequestedSUSD: number;
  readonly welfareExpenseSUSD: number;
  readonly welfareShortfallSUSD: number;
  readonly businessTaxAssessedSUSD: number;
  readonly businessTaxUncollectedSUSD: number;
  readonly debtIssuedSUSD: number;
  readonly principalRepaidSUSD: number;
  readonly interestExpenseSUSD: number;
  readonly interestPaidSUSD: number;
  readonly unfinancedRequirementSUSD: number;
  readonly constructionSpentSUSD: number;
  readonly constructionWrittenOffSUSD: number;
  readonly netFiscalResultSUSD: number;
  readonly grossFlowTotals: Readonly<Record<string, number>>;
  readonly detailedBalances: boolean;
  readonly treasuryCash: MonthlyBalanceChange | null;
  readonly debtOutstanding: MonthlyBalanceChange | null;
  readonly householdCash: MonthlyBalanceChange | null;
}

function balanceChange(
  current: number | null,
  previous: number | null,
): MonthlyBalanceChange | null {
  if (current === null) return null;
  return {
    endSUSD: current,
    changeSUSD: previous === null ? null : current - previous,
  };
}

/** Newest-first monthly reports for one country. */
export function buildMonthlyReports(country: CountrySnapshot): readonly MonthlyEconomicReport[] {
  const reports: MonthlyEconomicReport[] = [];
  for (let index = country.financeHistory.length - 1; index >= 0; index -= 1) {
    const period: SnapshotFinancePeriod | undefined = country.financeHistory[index];
    if (period === undefined) continue;
    const previous: SnapshotFinancePeriod | undefined =
      index > 0 ? country.financeHistory[index - 1] : undefined;
    reports.push({
      periodStartDay: period.periodStartDay,
      periodEndDay: period.periodEndDay,
      periodStartLabel: period.periodStartLabel,
      periodEndLabel: period.periodEndLabel,
      incomeTaxSUSD: period.incomeTaxSUSD,
      businessTaxRevenueSUSD: period.businessTaxRevenueSUSD,
      welfareRequestedSUSD: period.welfareRequestedSUSD,
      welfareExpenseSUSD: period.welfareExpenseSUSD,
      welfareShortfallSUSD: period.welfareShortfallSUSD,
      businessTaxAssessedSUSD: period.businessTaxAssessedSUSD,
      businessTaxUncollectedSUSD: period.businessTaxUncollectedSUSD,
      debtIssuedSUSD: period.debtIssuedSUSD,
      principalRepaidSUSD: period.principalRepaidSUSD,
      interestExpenseSUSD: period.interestExpenseSUSD,
      interestPaidSUSD: period.interestPaidSUSD,
      unfinancedRequirementSUSD: period.unfinancedRequirementSUSD,
      constructionSpentSUSD: period.constructionSpentSUSD,
      constructionWrittenOffSUSD: period.constructionWrittenOffSUSD,
      netFiscalResultSUSD: period.netFiscalResultSUSD,
      grossFlowTotals: period.grossFlowTotals,
      detailedBalances: period.treasuryCashEndSUSD !== null,
      treasuryCash: balanceChange(period.treasuryCashEndSUSD, previous?.treasuryCashEndSUSD ?? null),
      debtOutstanding: balanceChange(
        period.debtOutstandingEndSUSD,
        previous?.debtOutstandingEndSUSD ?? null,
      ),
      householdCash: balanceChange(
        period.householdCashEndSUSD,
        previous?.householdCashEndSUSD ?? null,
      ),
    });
  }
  return reports;
}

/** Latest closed annual report, or null before the first year-end. */
export function latestAnnualReport(country: CountrySnapshot): SnapshotAnnualReport | null {
  return country.annualReports[country.annualReports.length - 1] ?? null;
}

/** Newest-first retained annual reports. */
export function recentAnnualReports(
  country: CountrySnapshot,
  limit = 5,
): readonly SnapshotAnnualReport[] {
  if (limit <= 0) return [];
  return [...country.annualReports].reverse().slice(0, limit);
}

/** Latest closed monthly report, or null before the first close. */
export function latestMonthlyReport(country: CountrySnapshot): MonthlyEconomicReport | null {
  return buildMonthlyReports(country)[0] ?? null;
}
