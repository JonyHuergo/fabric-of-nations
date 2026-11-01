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
  readonly endRUSD: number;
  /** Change from the previous detailed close, or null when not derivable. */
  readonly changeRUSD: number | null;
}

export interface MonthlyEconomicReport {
  readonly periodStartDay: number;
  readonly periodEndDay: number;
  readonly periodStartLabel: string;
  readonly periodEndLabel: string;
  readonly incomeTaxRUSD: number;
  readonly businessTaxRevenueRUSD: number;
  readonly welfareRequestedRUSD: number;
  readonly welfareExpenseRUSD: number;
  readonly welfareShortfallRUSD: number;
  readonly businessTaxAssessedRUSD: number;
  readonly businessTaxUncollectedRUSD: number;
  readonly debtIssuedRUSD: number;
  readonly principalRepaidRUSD: number;
  readonly interestExpenseRUSD: number;
  readonly interestPaidRUSD: number;
  readonly unfinancedRequirementRUSD: number;
  readonly constructionSpentRUSD: number;
  readonly constructionWrittenOffRUSD: number;
  readonly constructionMaterialsSpentRUSD: number;
  readonly subsidyRequestedRUSD: number;
  readonly subsidyShortfallRUSD: number;
  readonly publicEnterpriseSupportRUSD: number;
  readonly subsidyExpenseRUSD: number;
  readonly administrationRequestedRUSD: number;
  readonly administrationExpenseRUSD: number;
  readonly administrationShortfallRUSD: number;
  readonly educationExpenseRUSD: number;
  readonly trainingExpenseRUSD: number;
  readonly customsDutyRevenueRUSD: number;
  readonly militaryExpenseRUSD: number;
  readonly netFiscalResultRUSD: number;
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
    endRUSD: current,
    changeRUSD: previous === null ? null : current - previous,
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
      incomeTaxRUSD: period.incomeTaxRUSD,
      businessTaxRevenueRUSD: period.businessTaxRevenueRUSD,
      welfareRequestedRUSD: period.welfareRequestedRUSD,
      welfareExpenseRUSD: period.welfareExpenseRUSD,
      welfareShortfallRUSD: period.welfareShortfallRUSD,
      businessTaxAssessedRUSD: period.businessTaxAssessedRUSD,
      businessTaxUncollectedRUSD: period.businessTaxUncollectedRUSD,
      debtIssuedRUSD: period.debtIssuedRUSD,
      principalRepaidRUSD: period.principalRepaidRUSD,
      interestExpenseRUSD: period.interestExpenseRUSD,
      interestPaidRUSD: period.interestPaidRUSD,
      unfinancedRequirementRUSD: period.unfinancedRequirementRUSD,
      constructionSpentRUSD: period.constructionSpentRUSD,
      constructionWrittenOffRUSD: period.constructionWrittenOffRUSD,
      constructionMaterialsSpentRUSD: period.constructionMaterialsSpentRUSD,
      subsidyRequestedRUSD: period.subsidyRequestedRUSD,
      subsidyShortfallRUSD: period.subsidyShortfallRUSD,
      publicEnterpriseSupportRUSD: period.publicEnterpriseSupportRUSD,
      subsidyExpenseRUSD: period.subsidyExpenseRUSD,
      administrationRequestedRUSD: period.administrationRequestedRUSD ?? 0,
      administrationExpenseRUSD: period.administrationExpenseRUSD ?? 0,
      administrationShortfallRUSD: period.administrationShortfallRUSD ?? 0,
      educationExpenseRUSD: period.educationExpenseRUSD ?? 0,
      trainingExpenseRUSD: period.trainingExpenseRUSD ?? 0,
      customsDutyRevenueRUSD: period.customsDutyRevenueRUSD ?? 0,
      militaryExpenseRUSD: period.militaryExpenseRUSD ?? 0,
      netFiscalResultRUSD: period.netFiscalResultRUSD,
      grossFlowTotals: period.grossFlowTotals,
      detailedBalances: period.treasuryCashEndRUSD !== null,
      treasuryCash: balanceChange(period.treasuryCashEndRUSD, previous?.treasuryCashEndRUSD ?? null),
      debtOutstanding: balanceChange(
        period.debtOutstandingEndRUSD,
        previous?.debtOutstandingEndRUSD ?? null,
      ),
      householdCash: balanceChange(
        period.householdCashEndRUSD,
        previous?.householdCashEndRUSD ?? null,
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
