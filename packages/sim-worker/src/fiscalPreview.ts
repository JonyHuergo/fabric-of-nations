/**
 * E1/E2 pre-commitment previews.
 *
 * Every function is a pure calculation over the immutable snapshot. It never
 * mutates simulation state and never sends a command. Values are current-base
 * static estimates: they hold the current estimated wage base, employment,
 * month-to-date enterprise profit, and prices constant. They are not forecasts.
 */

import {
  MAX_ACTIVE_DEBT_CONTRACTS,
  type CountrySnapshot,
  type SimulationSnapshot,
  type SnapshotDebtContract,
} from "./protocol.js";

export interface FiscalPolicyPreview {
  readonly countryId: number;
  readonly isPlayerCountry: boolean;
  readonly currentIncomeTaxRate: number;
  readonly proposedIncomeTaxRate: number;
  readonly currentIncomeTaxAllowanceSUSDPerYear: number;
  readonly proposedIncomeTaxAllowanceSUSDPerYear: number;
  readonly currentWelfareBudgetSUSDPerYear: number;
  readonly proposedWelfareBudgetSUSDPerYear: number;
  readonly currentWelfareMaxWealthLevel: number;
  readonly proposedWelfareMaxWealthLevel: number;
  readonly currentBusinessProfitTaxRate: number;
  readonly proposedBusinessProfitTaxRate: number;
  readonly currentReserveTargetSUSD: number;
  readonly proposedReserveTargetSUSD: number;
  /** Current-base daily wage estimate used by both tax columns. */
  readonly estimatedDailyWageBaseSUSD: number;
  /** Exact current-base taxable wage base under the current exemption. */
  readonly estimatedDailyTaxableWageBaseSUSD: number;
  /** Estimated taxable base under the proposed exemption. */
  readonly proposedDailyTaxableWageBaseSUSD: number;
  /** True when the proposed taxable base is an estimate with an assumption. */
  readonly taxableBaseIsEstimate: boolean;
  readonly estimatedWageEarningBlockCount: number;
  readonly currentDailyIncomeTaxSUSD: number;
  readonly proposedDailyIncomeTaxSUSD: number;
  readonly dailyIncomeTaxDeltaSUSD: number;
  readonly monthlyIncomeTaxDeltaSUSD: number;
  readonly currentDailyWelfareSUSD: number;
  readonly proposedDailyWelfareSUSD: number;
  readonly dailyWelfareDeltaSUSD: number;
  readonly monthlyWelfareDeltaSUSD: number;
  /** Treasury cash above the current reserve target (welfare funding ceiling). */
  readonly currentWelfareCashCeilingSUSD: number;
  /** Treasury cash above the proposed reserve target. */
  readonly proposedWelfareCashCeilingSUSD: number;
  /** Static business-tax estimate on the current month-to-date profit base. */
  readonly currentBusinessTaxAtCurrentBaseSUSD: number;
  readonly proposedBusinessTaxAtCurrentBaseSUSD: number;
  readonly businessTaxBaseMonthToDateSUSD: number;
  /** Current-base monthly change from tax, welfare, and business tax. */
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

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Build the fiscal pre-commitment preview. Invalid/non-finite proposed values
 * produce zero deltas plus a constraint; the caller still must send the action
 * for authoritative validation.
 */
export function previewFiscalPolicy(
  snapshot: SimulationSnapshot,
  country: CountrySnapshot,
  proposedIncomeTaxRate: number,
  proposedWelfareBudgetSUSDPerYear: number,
  proposed?: {
    readonly incomeTaxAllowanceSUSDPerYear?: number;
    readonly welfareMaxWealthLevel?: number;
    readonly businessProfitTaxRate?: number;
    readonly reserveTargetSUSD?: number;
  },
): FiscalPolicyPreview {
  const fiscal = country.fiscal;
  const rateValid =
    Number.isFinite(proposedIncomeTaxRate) &&
    proposedIncomeTaxRate >= 0 &&
    proposedIncomeTaxRate <= 1;
  const welfareValid =
    Number.isFinite(proposedWelfareBudgetSUSDPerYear) &&
    proposedWelfareBudgetSUSDPerYear >= 0;
  const allowanceProposed = finiteOr(
    proposed?.incomeTaxAllowanceSUSDPerYear ?? fiscal.incomeTaxAllowanceSUSDPerYear,
    fiscal.incomeTaxAllowanceSUSDPerYear,
  );
  const allowanceValid = Number.isFinite(allowanceProposed) && allowanceProposed >= 0;
  const wealthLevelProposed = finiteOr(
    proposed?.welfareMaxWealthLevel ?? fiscal.welfareMaxWealthLevel,
    fiscal.welfareMaxWealthLevel,
  );
  const wealthLevelValid =
    Number.isInteger(wealthLevelProposed) && wealthLevelProposed >= 0 && wealthLevelProposed <= 99;
  const businessRateProposed = finiteOr(
    proposed?.businessProfitTaxRate ?? fiscal.businessProfitTaxRate,
    fiscal.businessProfitTaxRate,
  );
  const businessRateValid =
    Number.isFinite(businessRateProposed) &&
    businessRateProposed >= 0 &&
    businessRateProposed <= 1;
  const reserveProposed = finiteOr(
    proposed?.reserveTargetSUSD ?? fiscal.reserveTargetSUSD,
    fiscal.reserveTargetSUSD,
  );
  const reserveValid = Number.isFinite(reserveProposed) && reserveProposed >= 0;

  const rate = rateValid ? proposedIncomeTaxRate : fiscal.incomeTaxRate;
  const welfare = welfareValid ? proposedWelfareBudgetSUSDPerYear : fiscal.welfareBudgetSUSDPerYear;
  const allowance = allowanceValid ? allowanceProposed : fiscal.incomeTaxAllowanceSUSDPerYear;
  const wealthLevel = wealthLevelValid ? wealthLevelProposed : fiscal.welfareMaxWealthLevel;
  const businessRate = businessRateValid ? businessRateProposed : fiscal.businessProfitTaxRate;
  const reserve = reserveValid ? reserveProposed : fiscal.reserveTargetSUSD;

  const yearDays = daysInYear(snapshot.date.year);
  const monthDays = daysInMonth(snapshot.date.year, snapshot.date.month);
  const proposedDailyAllowance = allowance / yearDays;
  const wageBase = country.estimatedDailyWageBaseSUSD;
  const currentTaxableBase = country.estimatedDailyTaxableWageBaseSUSD;
  const allowanceUnchanged = allowance === fiscal.incomeTaxAllowanceSUSDPerYear;
  // A changed exemption cannot be recalculated exactly from the aggregate wage
  // base because block wage levels are not in the snapshot. The estimate assumes
  // every wage-earning block's wage exceeds the allowance, so it overstates the
  // taxable base (and therefore the estimated revenue) when wages are lower.
  const proposedTaxableBase = allowanceUnchanged
    ? currentTaxableBase
    : Math.max(
        0,
        wageBase - proposedDailyAllowance * country.estimatedWageEarningBlockCount,
      );
  const currentDailyTax = fiscal.incomeTaxRate * currentTaxableBase;
  const proposedDailyTax = rate * proposedTaxableBase;
  const currentDailyWelfare = fiscal.welfareBudgetSUSDPerYear / yearDays;
  const proposedDailyWelfare = welfare / yearDays;
  const dailyTaxDelta = proposedDailyTax - currentDailyTax;
  const dailyWelfareDelta = proposedDailyWelfare - currentDailyWelfare;
  const currentBusinessTaxAtCurrentBase =
    fiscal.businessProfitTaxRate * country.businessTaxBaseMonthToDateSUSD;
  const proposedBusinessTaxAtCurrentBase =
    businessRate * country.businessTaxBaseMonthToDateSUSD;
  const constraints: string[] = [];
  if (!rateValid) constraints.push("Income tax must be between 0% and 100%.");
  if (!allowanceValid) constraints.push("The income-tax exemption must be a non-negative SUSD amount.");
  if (!welfareValid) constraints.push("Welfare budget must be a non-negative annual SUSD amount.");
  if (!wealthLevelValid) {
    constraints.push("The welfare eligibility ceiling must be a whole wealth level from 0 to 99.");
  }
  if (!businessRateValid) {
    constraints.push("The business-profit tax must be between 0% and 100%.");
  }
  if (!reserveValid) constraints.push("The reserve target must be a non-negative SUSD amount.");
  constraints.push(
    "Tax and business-tax figures use current-base estimates, not realized future wages or profit; actual amounts can differ.",
    "The income-tax allowance estimate assumes every wage-earning block exceeds the allowance; actual relief can be larger.",
    "Changing the welfare eligibility ceiling changes the eligible population, which the snapshot does not retain per threshold; per-capita amounts are not estimated.",
    "Welfare is paid daily only from treasury cash above the reserve target; a shortfall reduces the transfer proportionally and is never a liability.",
    "Business-profit tax is assessed at month-end on each taxed building's positive month result and limited by its operating cash; an uncollected part is an explicit shortfall, not a receivable.",
    "Borrowing, principal repayment, and interest payment are not part of this fiscal result; changes apply at the next processed phase and the monthly close records the actual result.",
  );
  if (snapshot.playerCountryId !== country.id) {
    constraints.push("Only the player-controlled country may receive policy actions.");
  }
  return {
    countryId: country.id,
    isPlayerCountry: snapshot.playerCountryId === country.id,
    currentIncomeTaxRate: fiscal.incomeTaxRate,
    proposedIncomeTaxRate: rate,
    currentIncomeTaxAllowanceSUSDPerYear: fiscal.incomeTaxAllowanceSUSDPerYear,
    proposedIncomeTaxAllowanceSUSDPerYear: allowance,
    currentWelfareBudgetSUSDPerYear: fiscal.welfareBudgetSUSDPerYear,
    proposedWelfareBudgetSUSDPerYear: welfare,
    currentWelfareMaxWealthLevel: fiscal.welfareMaxWealthLevel,
    proposedWelfareMaxWealthLevel: wealthLevel,
    currentBusinessProfitTaxRate: fiscal.businessProfitTaxRate,
    proposedBusinessProfitTaxRate: businessRate,
    currentReserveTargetSUSD: fiscal.reserveTargetSUSD,
    proposedReserveTargetSUSD: reserve,
    estimatedDailyWageBaseSUSD: wageBase,
    estimatedDailyTaxableWageBaseSUSD: currentTaxableBase,
    proposedDailyTaxableWageBaseSUSD: proposedTaxableBase,
    taxableBaseIsEstimate: !allowanceUnchanged,
    estimatedWageEarningBlockCount: country.estimatedWageEarningBlockCount,
    currentDailyIncomeTaxSUSD: currentDailyTax,
    proposedDailyIncomeTaxSUSD: proposedDailyTax,
    dailyIncomeTaxDeltaSUSD: dailyTaxDelta,
    monthlyIncomeTaxDeltaSUSD: dailyTaxDelta * monthDays,
    currentDailyWelfareSUSD: currentDailyWelfare,
    proposedDailyWelfareSUSD: proposedDailyWelfare,
    dailyWelfareDeltaSUSD: dailyWelfareDelta,
    monthlyWelfareDeltaSUSD: dailyWelfareDelta * monthDays,
    currentWelfareCashCeilingSUSD: Math.max(
      0,
      country.treasuryCashSUSD - fiscal.reserveTargetSUSD,
    ),
    proposedWelfareCashCeilingSUSD: Math.max(0, country.treasuryCashSUSD - reserve),
    currentBusinessTaxAtCurrentBaseSUSD: currentBusinessTaxAtCurrentBase,
    proposedBusinessTaxAtCurrentBaseSUSD: proposedBusinessTaxAtCurrentBase,
    businessTaxBaseMonthToDateSUSD: country.businessTaxBaseMonthToDateSUSD,
    estimatedMonthlyFiscalDeltaSUSD: (dailyTaxDelta - dailyWelfareDelta) * monthDays,
    treasuryCashSUSD: country.treasuryCashSUSD,
    latestMonthlyInterestSUSD: country.latestFiscal?.interestExpenseSUSD ?? null,
    constraints,
  };
}

export interface DebtIssuancePreview {
  readonly countryId: number;
  readonly amountSUSD: number;
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly treasuryAfterSUSD: number;
  readonly outstandingAfterSUSD: number;
  readonly ceilingSUSD: number;
  readonly headroomSUSD: number;
  readonly creditorCashSUSD: number;
  readonly annualInterestSUSD: number;
  readonly monthlyInterestEstimateSUSD: number;
  readonly constraints: readonly string[];
}

/** Static preview of one discretionary debt issuance. */
export function previewDebtIssuance(
  snapshot: SimulationSnapshot,
  country: CountrySnapshot,
  amountSUSD: number,
): DebtIssuancePreview {
  const policy = country.debtPolicy;
  const errors: string[] = [];
  if (!policy.enabled) errors.push("This country has no enabled debt policy.");
  if (!Number.isFinite(amountSUSD) || amountSUSD <= 0) {
    errors.push("Principal must be a positive SUSD amount.");
  }
  if (Number.isFinite(amountSUSD) && amountSUSD > policy.headroomSUSD + 1e-6) {
    errors.push(
      `Principal exceeds the ${policy.headroomSUSD.toFixed(2)} SUSD ceiling headroom.`,
    );
  }
  if (Number.isFinite(amountSUSD) && amountSUSD > policy.creditorCashSUSD + 1e-6) {
    errors.push(
      `Principal exceeds the creditor's ${policy.creditorCashSUSD.toFixed(2)} SUSD available cash.`,
    );
  }
  if (country.debtContracts.length >= MAX_ACTIVE_DEBT_CONTRACTS) {
    errors.push(
      `The active-contract cap of ${String(MAX_ACTIVE_DEBT_CONTRACTS)} is already reached.`,
    );
  }
  const amount = Number.isFinite(amountSUSD) && amountSUSD > 0 ? amountSUSD : 0;
  const annualInterest = amount * policy.annualCouponRate;
  return {
    countryId: country.id,
    amountSUSD: amount,
    valid: errors.length === 0,
    errors,
    treasuryAfterSUSD: country.treasuryCashSUSD + amount,
    outstandingAfterSUSD: country.debtOutstandingPrincipalSUSD + amount,
    ceilingSUSD: policy.maxOutstandingPrincipalSUSD,
    headroomSUSD: policy.headroomSUSD,
    creditorCashSUSD: policy.creditorCashSUSD,
    annualInterestSUSD: annualInterest,
    monthlyInterestEstimateSUSD: annualInterest / 12,
    constraints: [
      `Preview for ${snapshot.date.label}: borrowing proceeds are a financing inflow, not revenue, so the fiscal result does not change.`,
      "Interest accrues daily at the contract coupon and is an expense; coupon cash is paid at month-end.",
      "The creditor must have the cash and the outstanding-principal ceiling must allow the issuance.",
      "Monthly interest is a simple annual/12 estimate; actual accrual uses the real civil-year and month lengths.",
    ],
  };
}

export interface DebtRepaymentPreview {
  readonly countryId: number;
  readonly contractId: number;
  readonly amountSUSD: number;
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly outstandingBeforeSUSD: number;
  readonly outstandingAfterSUSD: number;
  readonly treasuryAfterSUSD: number;
  readonly reserveTargetSUSD: number;
  readonly accruedInterestSUSD: number;
  readonly constraints: readonly string[];
}

/** Static preview of one early principal repayment. */
export function previewDebtRepayment(
  snapshot: SimulationSnapshot,
  country: CountrySnapshot,
  contractId: number,
  amountSUSD: number,
): DebtRepaymentPreview | null {
  const contract: SnapshotDebtContract | undefined = country.debtContracts.find(
    (candidate) => candidate.id === contractId,
  );
  if (contract === undefined) return null;
  const reserve = country.fiscal.reserveTargetSUSD;
  const errors: string[] = [];
  if (!Number.isFinite(amountSUSD) || amountSUSD <= 0) {
    errors.push("Repayment must be a positive SUSD amount.");
  }
  if (Number.isFinite(amountSUSD) && amountSUSD > contract.outstandingPrincipalSUSD + 1e-6) {
    errors.push(
      `Repayment exceeds the ${contract.outstandingPrincipalSUSD.toFixed(2)} SUSD outstanding principal.`,
    );
  }
  if (Number.isFinite(amountSUSD) && amountSUSD > country.treasuryCashSUSD + 1e-6) {
    errors.push("Repayment exceeds available treasury cash.");
  }
  if (
    Number.isFinite(amountSUSD) &&
    country.treasuryCashSUSD - amountSUSD < reserve - 1e-6
  ) {
    errors.push(
      `Repayment would take treasury cash below the ${reserve.toFixed(2)} SUSD reserve target.`,
    );
  }
  const amount = Number.isFinite(amountSUSD) && amountSUSD > 0 ? amountSUSD : 0;
  return {
    countryId: country.id,
    contractId,
    amountSUSD: amount,
    valid: errors.length === 0,
    errors,
    outstandingBeforeSUSD: contract.outstandingPrincipalSUSD,
    outstandingAfterSUSD: Math.max(0, contract.outstandingPrincipalSUSD - amount),
    treasuryAfterSUSD: country.treasuryCashSUSD - amount,
    reserveTargetSUSD: reserve,
    accruedInterestSUSD: contract.accruedInterestSUSD,
    constraints: [
      `Preview for ${snapshot.date.label}: principal repayment is a financing movement, not expenditure, so the fiscal result does not change.`,
      "Accrued interest remains payable through the normal month-end and maturity path.",
      "A repayment may not take treasury cash below the reserve target; maturity obligations are not subject to that discretionary floor.",
      "The contract's creditor receives the cash and its bond asset is reduced by the same amount.",
    ],
  };
}

export interface DebtPolicyPreview {
  readonly countryId: number;
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly currentRefinanceOnMaturity: boolean;
  readonly proposedRefinanceOnMaturity: boolean;
  readonly currentCeilingSUSD: number;
  readonly proposedCeilingSUSD: number;
  readonly outstandingPrincipalSUSD: number;
  readonly currentHeadroomSUSD: number;
  readonly proposedHeadroomSUSD: number;
  readonly constraints: readonly string[];
}

/** Static preview of a debt-policy change. */
export function previewDebtPolicy(
  snapshot: SimulationSnapshot,
  country: CountrySnapshot,
  proposedRefinanceOnMaturity: boolean,
  proposedMaxOutstandingPrincipalSUSD: number,
): DebtPolicyPreview {
  const policy = country.debtPolicy;
  const errors: string[] = [];
  if (!policy.enabled) errors.push("This country has no enabled debt policy.");
  if (
    !Number.isFinite(proposedMaxOutstandingPrincipalSUSD) ||
    proposedMaxOutstandingPrincipalSUSD < 0
  ) {
    errors.push("The debt ceiling must be a non-negative SUSD amount.");
  } else if (
    proposedMaxOutstandingPrincipalSUSD <
    country.debtOutstandingPrincipalSUSD - 1e-6
  ) {
    errors.push("The debt ceiling cannot be below the current outstanding principal.");
  }
  const ceiling = Number.isFinite(proposedMaxOutstandingPrincipalSUSD)
    ? Math.max(0, proposedMaxOutstandingPrincipalSUSD)
    : policy.maxOutstandingPrincipalSUSD;
  return {
    countryId: country.id,
    valid: errors.length === 0,
    errors,
    currentRefinanceOnMaturity: policy.refinanceOnMaturity,
    proposedRefinanceOnMaturity,
    currentCeilingSUSD: policy.maxOutstandingPrincipalSUSD,
    proposedCeilingSUSD: ceiling,
    outstandingPrincipalSUSD: country.debtOutstandingPrincipalSUSD,
    currentHeadroomSUSD: policy.headroomSUSD,
    proposedHeadroomSUSD: Math.max(0, ceiling - country.debtOutstandingPrincipalSUSD),
    constraints: [
      `Preview for ${snapshot.date.label}: the creditor, coupon, and term remain scenario/contract inputs; E2 exposes only refinancing policy and the ceiling.`,
      "A maturing contract is refinanced only when the policy allows it, no interest is overdue, and the ceiling still permits the replacement principal.",
      "Refinancing repays old principal and issues replacement principal in the same batch; both are financing movements.",
    ],
  };
}
