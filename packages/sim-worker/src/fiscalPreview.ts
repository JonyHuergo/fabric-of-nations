/**
 * E1 fiscal-policy preview.
 *
 * The preview is a pure calculation over the immutable snapshot. It never
 * mutates simulation state. Values are current-base static estimates: they hold
 * the current estimated wage base, employment, and welfare request constant.
 */

import type { CountrySnapshot, SimulationSnapshot } from "./protocol.js";

export interface FiscalPolicyPreview {
  readonly countryId: number;
  readonly isPlayerCountry: boolean;
  readonly currentIncomeTaxRate: number;
  readonly proposedIncomeTaxRate: number;
  readonly currentWelfareBudgetSUSDPerYear: number;
  readonly proposedWelfareBudgetSUSDPerYear: number;
  /** Current-base daily wage estimate used by both tax columns. */
  readonly estimatedDailyWageBaseSUSD: number;
  readonly currentDailyIncomeTaxSUSD: number;
  readonly proposedDailyIncomeTaxSUSD: number;
  readonly dailyIncomeTaxDeltaSUSD: number;
  readonly monthlyIncomeTaxDeltaSUSD: number;
  readonly currentDailyWelfareSUSD: number;
  readonly proposedDailyWelfareSUSD: number;
  readonly dailyWelfareDeltaSUSD: number;
  readonly monthlyWelfareDeltaSUSD: number;
  /** Static monthly change before interest/debt effects and behavioural response. */
  readonly estimatedMonthlyFiscalDeltaSUSD: number;
  readonly treasuryCashSUSD: number;
  readonly latestMonthlyInterestSUSD: number | null;
  readonly constraints: readonly string[];
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInYear(year: number): number {
  return isLeapYear(year) ? 366 : 365;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 30;
}

/**
 * Build the pre-commitment preview. Invalid/non-finite proposed values produce
 * zero deltas plus a constraint; the caller is still responsible for rejecting
 * the action before it is sent.
 */
export function previewFiscalPolicy(
  snapshot: SimulationSnapshot,
  country: CountrySnapshot,
  proposedIncomeTaxRate: number,
  proposedWelfareBudgetSUSDPerYear: number,
): FiscalPolicyPreview {
  const taxValid =
    Number.isFinite(proposedIncomeTaxRate) &&
    proposedIncomeTaxRate >= 0 &&
    proposedIncomeTaxRate <= 1;
  const welfareValid =
    Number.isFinite(proposedWelfareBudgetSUSDPerYear) &&
    proposedWelfareBudgetSUSDPerYear >= 0;
  const rate = taxValid ? proposedIncomeTaxRate : country.fiscal.incomeTaxRate;
  const welfare = welfareValid
    ? proposedWelfareBudgetSUSDPerYear
    : country.fiscal.welfareBudgetSUSDPerYear;
  const yearDays = daysInYear(snapshot.date.year);
  const monthDays = daysInMonth(snapshot.date.year, snapshot.date.month);
  const wageBase = country.estimatedDailyWageBaseSUSD;
  const currentDailyTax = country.fiscal.incomeTaxRate * wageBase;
  const proposedDailyTax = rate * wageBase;
  const currentDailyWelfare = country.fiscal.welfareBudgetSUSDPerYear / yearDays;
  const proposedDailyWelfare = welfare / yearDays;
  const dailyTaxDelta = proposedDailyTax - currentDailyTax;
  const dailyWelfareDelta = proposedDailyWelfare - currentDailyWelfare;
  const constraints: string[] = [];
  if (!taxValid) constraints.push("Income tax must be between 0% and 100%.");
  if (!welfareValid) constraints.push("Welfare budget must be a non-negative annual SUSD amount.");
  constraints.push(
    "Tax figures use the current estimated wage base, not realized future wages; actual revenue can differ.",
    "The estimate excludes any change in wages, employment, prices, production, or behaviour.",
    "Welfare is paid daily only to the extent treasury cash is available; a shortfall reduces the transfer proportionally.",
    "Changes apply at the next processed fiscal phase; the monthly close records the actual result.",
  );
  if (snapshot.playerCountryId !== country.id) {
    constraints.push("Only the player-controlled country may receive policy actions.");
  }
  return {
    countryId: country.id,
    isPlayerCountry: snapshot.playerCountryId === country.id,
    currentIncomeTaxRate: country.fiscal.incomeTaxRate,
    proposedIncomeTaxRate: rate,
    currentWelfareBudgetSUSDPerYear: country.fiscal.welfareBudgetSUSDPerYear,
    proposedWelfareBudgetSUSDPerYear: welfare,
    estimatedDailyWageBaseSUSD: wageBase,
    currentDailyIncomeTaxSUSD: currentDailyTax,
    proposedDailyIncomeTaxSUSD: proposedDailyTax,
    dailyIncomeTaxDeltaSUSD: dailyTaxDelta,
    monthlyIncomeTaxDeltaSUSD: dailyTaxDelta * monthDays,
    currentDailyWelfareSUSD: currentDailyWelfare,
    proposedDailyWelfareSUSD: proposedDailyWelfare,
    dailyWelfareDeltaSUSD: dailyWelfareDelta,
    monthlyWelfareDeltaSUSD: dailyWelfareDelta * monthDays,
    estimatedMonthlyFiscalDeltaSUSD: (dailyTaxDelta - dailyWelfareDelta) * monthDays,
    treasuryCashSUSD: country.treasuryCashSUSD,
    latestMonthlyInterestSUSD: country.latestFiscal?.interestExpenseSUSD ?? null,
    constraints,
  };
}
