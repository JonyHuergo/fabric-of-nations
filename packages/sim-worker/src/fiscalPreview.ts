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
  readonly currentIncomeTaxAllowanceRUSDPerYear: number;
  readonly proposedIncomeTaxAllowanceRUSDPerYear: number;
  readonly currentWelfareBudgetRUSDPerYear: number;
  readonly proposedWelfareBudgetRUSDPerYear: number;
  readonly currentWelfareMaxWealthLevel: number;
  readonly proposedWelfareMaxWealthLevel: number;
  readonly currentBusinessProfitTaxRate: number;
  readonly proposedBusinessProfitTaxRate: number;
  readonly currentReserveTargetRUSD: number;
  readonly proposedReserveTargetRUSD: number;
  /** Current-base daily wage estimate used by both tax columns. */
  readonly estimatedDailyWageBaseRUSD: number;
  /** Exact current-base taxable wage base under the current exemption. */
  readonly estimatedDailyTaxableWageBaseRUSD: number;
  /** Estimated taxable base under the proposed exemption. */
  readonly proposedDailyTaxableWageBaseRUSD: number;
  /** True when the proposed taxable base is an estimate with an assumption. */
  readonly taxableBaseIsEstimate: boolean;
  readonly estimatedWageEarningBlockCount: number;
  readonly currentDailyIncomeTaxRUSD: number;
  readonly proposedDailyIncomeTaxRUSD: number;
  readonly dailyIncomeTaxDeltaRUSD: number;
  readonly monthlyIncomeTaxDeltaRUSD: number;
  readonly currentDailyWelfareRUSD: number;
  readonly proposedDailyWelfareRUSD: number;
  readonly dailyWelfareDeltaRUSD: number;
  readonly monthlyWelfareDeltaRUSD: number;
  /** Treasury cash above the current reserve target (welfare funding ceiling). */
  readonly currentWelfareCashCeilingRUSD: number;
  /** Treasury cash above the proposed reserve target. */
  readonly proposedWelfareCashCeilingRUSD: number;
  /** Static business-tax estimate on the current month-to-date profit base. */
  readonly currentBusinessTaxAtCurrentBaseRUSD: number;
  readonly proposedBusinessTaxAtCurrentBaseRUSD: number;
  readonly businessTaxBaseMonthToDateRUSD: number;
  /** Current-base monthly change from tax, welfare, and business tax. */
  readonly estimatedMonthlyFiscalDeltaRUSD: number;
  readonly treasuryCashRUSD: number;
  readonly latestMonthlyInterestRUSD: number | null;
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
  proposedWelfareBudgetRUSDPerYear: number,
  proposed?: {
    readonly incomeTaxAllowanceRUSDPerYear?: number;
    readonly welfareMaxWealthLevel?: number;
    readonly businessProfitTaxRate?: number;
    readonly reserveTargetRUSD?: number;
  },
): FiscalPolicyPreview {
  const fiscal = country.fiscal;
  const rateValid =
    Number.isFinite(proposedIncomeTaxRate) &&
    proposedIncomeTaxRate >= 0 &&
    proposedIncomeTaxRate <= 1;
  const welfareValid =
    Number.isFinite(proposedWelfareBudgetRUSDPerYear) &&
    proposedWelfareBudgetRUSDPerYear >= 0;
  const allowanceProposed = finiteOr(
    proposed?.incomeTaxAllowanceRUSDPerYear ?? fiscal.incomeTaxAllowanceRUSDPerYear,
    fiscal.incomeTaxAllowanceRUSDPerYear,
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
    proposed?.reserveTargetRUSD ?? fiscal.reserveTargetRUSD,
    fiscal.reserveTargetRUSD,
  );
  const reserveValid = Number.isFinite(reserveProposed) && reserveProposed >= 0;

  const rate = rateValid ? proposedIncomeTaxRate : fiscal.incomeTaxRate;
  const welfare = welfareValid ? proposedWelfareBudgetRUSDPerYear : fiscal.welfareBudgetRUSDPerYear;
  const allowance = allowanceValid ? allowanceProposed : fiscal.incomeTaxAllowanceRUSDPerYear;
  const wealthLevel = wealthLevelValid ? wealthLevelProposed : fiscal.welfareMaxWealthLevel;
  const businessRate = businessRateValid ? businessRateProposed : fiscal.businessProfitTaxRate;
  const reserve = reserveValid ? reserveProposed : fiscal.reserveTargetRUSD;

  const yearDays = daysInYear(snapshot.date.year);
  const monthDays = daysInMonth(snapshot.date.year, snapshot.date.month);
  const proposedDailyAllowance = allowance / yearDays;
  const wageBase = country.estimatedDailyWageBaseRUSD;
  const currentTaxableBase = country.estimatedDailyTaxableWageBaseRUSD;
  const allowanceUnchanged = allowance === fiscal.incomeTaxAllowanceRUSDPerYear;
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
  const currentDailyWelfare = fiscal.welfareBudgetRUSDPerYear / yearDays;
  const proposedDailyWelfare = welfare / yearDays;
  const dailyTaxDelta = proposedDailyTax - currentDailyTax;
  const dailyWelfareDelta = proposedDailyWelfare - currentDailyWelfare;
  const currentBusinessTaxAtCurrentBase =
    fiscal.businessProfitTaxRate * country.businessTaxBaseMonthToDateRUSD;
  const proposedBusinessTaxAtCurrentBase =
    businessRate * country.businessTaxBaseMonthToDateRUSD;
  const constraints: string[] = [];
  if (!rateValid) constraints.push("Income tax must be between 0% and 100%.");
  if (!allowanceValid) constraints.push("The income-tax exemption must be a non-negative RUSD amount.");
  if (!welfareValid) constraints.push("Welfare budget must be a non-negative annual RUSD amount.");
  if (!wealthLevelValid) {
    constraints.push("The welfare eligibility ceiling must be a whole wealth level from 0 to 99.");
  }
  if (!businessRateValid) {
    constraints.push("The business-profit tax must be between 0% and 100%.");
  }
  if (!reserveValid) constraints.push("The reserve target must be a non-negative RUSD amount.");
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
    currentIncomeTaxAllowanceRUSDPerYear: fiscal.incomeTaxAllowanceRUSDPerYear,
    proposedIncomeTaxAllowanceRUSDPerYear: allowance,
    currentWelfareBudgetRUSDPerYear: fiscal.welfareBudgetRUSDPerYear,
    proposedWelfareBudgetRUSDPerYear: welfare,
    currentWelfareMaxWealthLevel: fiscal.welfareMaxWealthLevel,
    proposedWelfareMaxWealthLevel: wealthLevel,
    currentBusinessProfitTaxRate: fiscal.businessProfitTaxRate,
    proposedBusinessProfitTaxRate: businessRate,
    currentReserveTargetRUSD: fiscal.reserveTargetRUSD,
    proposedReserveTargetRUSD: reserve,
    estimatedDailyWageBaseRUSD: wageBase,
    estimatedDailyTaxableWageBaseRUSD: currentTaxableBase,
    proposedDailyTaxableWageBaseRUSD: proposedTaxableBase,
    taxableBaseIsEstimate: !allowanceUnchanged,
    estimatedWageEarningBlockCount: country.estimatedWageEarningBlockCount,
    currentDailyIncomeTaxRUSD: currentDailyTax,
    proposedDailyIncomeTaxRUSD: proposedDailyTax,
    dailyIncomeTaxDeltaRUSD: dailyTaxDelta,
    monthlyIncomeTaxDeltaRUSD: dailyTaxDelta * monthDays,
    currentDailyWelfareRUSD: currentDailyWelfare,
    proposedDailyWelfareRUSD: proposedDailyWelfare,
    dailyWelfareDeltaRUSD: dailyWelfareDelta,
    monthlyWelfareDeltaRUSD: dailyWelfareDelta * monthDays,
    currentWelfareCashCeilingRUSD: Math.max(
      0,
      country.treasuryCashRUSD - fiscal.reserveTargetRUSD,
    ),
    proposedWelfareCashCeilingRUSD: Math.max(0, country.treasuryCashRUSD - reserve),
    currentBusinessTaxAtCurrentBaseRUSD: currentBusinessTaxAtCurrentBase,
    proposedBusinessTaxAtCurrentBaseRUSD: proposedBusinessTaxAtCurrentBase,
    businessTaxBaseMonthToDateRUSD: country.businessTaxBaseMonthToDateRUSD,
    estimatedMonthlyFiscalDeltaRUSD: (dailyTaxDelta - dailyWelfareDelta) * monthDays,
    treasuryCashRUSD: country.treasuryCashRUSD,
    latestMonthlyInterestRUSD: country.latestFiscal?.interestExpenseRUSD ?? null,
    constraints,
  };
}

export interface DebtIssuancePreview {
  readonly countryId: number;
  readonly amountRUSD: number;
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly treasuryAfterRUSD: number;
  readonly outstandingAfterRUSD: number;
  readonly ceilingRUSD: number;
  readonly headroomRUSD: number;
  readonly creditorCashRUSD: number;
  readonly annualInterestRUSD: number;
  readonly monthlyInterestEstimateRUSD: number;
  readonly constraints: readonly string[];
}

/** Static preview of one discretionary debt issuance. */
export function previewDebtIssuance(
  snapshot: SimulationSnapshot,
  country: CountrySnapshot,
  amountRUSD: number,
): DebtIssuancePreview {
  const policy = country.debtPolicy;
  const errors: string[] = [];
  if (!policy.enabled) errors.push("This country has no enabled debt policy.");
  if (!Number.isFinite(amountRUSD) || amountRUSD <= 0) {
    errors.push("Principal must be a positive RUSD amount.");
  }
  if (Number.isFinite(amountRUSD) && amountRUSD > policy.headroomRUSD + 1e-6) {
    errors.push(
      `Principal exceeds the ${policy.headroomRUSD.toFixed(2)} RUSD ceiling headroom.`,
    );
  }
  if (Number.isFinite(amountRUSD) && amountRUSD > policy.creditorCashRUSD + 1e-6) {
    errors.push(
      `Principal exceeds the creditor's ${policy.creditorCashRUSD.toFixed(2)} RUSD available cash.`,
    );
  }
  if (country.debtContracts.length >= MAX_ACTIVE_DEBT_CONTRACTS) {
    errors.push(
      `The active-contract cap of ${String(MAX_ACTIVE_DEBT_CONTRACTS)} is already reached.`,
    );
  }
  const amount = Number.isFinite(amountRUSD) && amountRUSD > 0 ? amountRUSD : 0;
  const annualInterest = amount * policy.annualCouponRate;
  return {
    countryId: country.id,
    amountRUSD: amount,
    valid: errors.length === 0,
    errors,
    treasuryAfterRUSD: country.treasuryCashRUSD + amount,
    outstandingAfterRUSD: country.debtOutstandingPrincipalRUSD + amount,
    ceilingRUSD: policy.maxOutstandingPrincipalRUSD,
    headroomRUSD: policy.headroomRUSD,
    creditorCashRUSD: policy.creditorCashRUSD,
    annualInterestRUSD: annualInterest,
    monthlyInterestEstimateRUSD: annualInterest / 12,
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
  readonly amountRUSD: number;
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly outstandingBeforeRUSD: number;
  readonly outstandingAfterRUSD: number;
  readonly treasuryAfterRUSD: number;
  readonly reserveTargetRUSD: number;
  readonly accruedInterestRUSD: number;
  readonly constraints: readonly string[];
}

/** Static preview of one early principal repayment. */
export function previewDebtRepayment(
  snapshot: SimulationSnapshot,
  country: CountrySnapshot,
  contractId: number,
  amountRUSD: number,
): DebtRepaymentPreview | null {
  const contract: SnapshotDebtContract | undefined = country.debtContracts.find(
    (candidate) => candidate.id === contractId,
  );
  if (contract === undefined) return null;
  const reserve = country.fiscal.reserveTargetRUSD;
  const errors: string[] = [];
  if (!Number.isFinite(amountRUSD) || amountRUSD <= 0) {
    errors.push("Repayment must be a positive RUSD amount.");
  }
  if (Number.isFinite(amountRUSD) && amountRUSD > contract.outstandingPrincipalRUSD + 1e-6) {
    errors.push(
      `Repayment exceeds the ${contract.outstandingPrincipalRUSD.toFixed(2)} RUSD outstanding principal.`,
    );
  }
  if (Number.isFinite(amountRUSD) && amountRUSD > country.treasuryCashRUSD + 1e-6) {
    errors.push("Repayment exceeds available treasury cash.");
  }
  if (
    Number.isFinite(amountRUSD) &&
    country.treasuryCashRUSD - amountRUSD < reserve - 1e-6
  ) {
    errors.push(
      `Repayment would take treasury cash below the ${reserve.toFixed(2)} RUSD reserve target.`,
    );
  }
  const amount = Number.isFinite(amountRUSD) && amountRUSD > 0 ? amountRUSD : 0;
  return {
    countryId: country.id,
    contractId,
    amountRUSD: amount,
    valid: errors.length === 0,
    errors,
    outstandingBeforeRUSD: contract.outstandingPrincipalRUSD,
    outstandingAfterRUSD: Math.max(0, contract.outstandingPrincipalRUSD - amount),
    treasuryAfterRUSD: country.treasuryCashRUSD - amount,
    reserveTargetRUSD: reserve,
    accruedInterestRUSD: contract.accruedInterestRUSD,
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
  readonly currentCeilingRUSD: number;
  readonly proposedCeilingRUSD: number;
  readonly outstandingPrincipalRUSD: number;
  readonly currentHeadroomRUSD: number;
  readonly proposedHeadroomRUSD: number;
  readonly constraints: readonly string[];
}

/** Static preview of a debt-policy change. */
export function previewDebtPolicy(
  snapshot: SimulationSnapshot,
  country: CountrySnapshot,
  proposedRefinanceOnMaturity: boolean,
  proposedMaxOutstandingPrincipalRUSD: number,
): DebtPolicyPreview {
  const policy = country.debtPolicy;
  const errors: string[] = [];
  if (!policy.enabled) errors.push("This country has no enabled debt policy.");
  if (
    !Number.isFinite(proposedMaxOutstandingPrincipalRUSD) ||
    proposedMaxOutstandingPrincipalRUSD < 0
  ) {
    errors.push("The debt ceiling must be a non-negative RUSD amount.");
  } else if (
    proposedMaxOutstandingPrincipalRUSD <
    country.debtOutstandingPrincipalRUSD - 1e-6
  ) {
    errors.push("The debt ceiling cannot be below the current outstanding principal.");
  }
  const ceiling = Number.isFinite(proposedMaxOutstandingPrincipalRUSD)
    ? Math.max(0, proposedMaxOutstandingPrincipalRUSD)
    : policy.maxOutstandingPrincipalRUSD;
  return {
    countryId: country.id,
    valid: errors.length === 0,
    errors,
    currentRefinanceOnMaturity: policy.refinanceOnMaturity,
    proposedRefinanceOnMaturity,
    currentCeilingRUSD: policy.maxOutstandingPrincipalRUSD,
    proposedCeilingRUSD: ceiling,
    outstandingPrincipalRUSD: country.debtOutstandingPrincipalRUSD,
    currentHeadroomRUSD: policy.headroomRUSD,
    proposedHeadroomRUSD: Math.max(0, ceiling - country.debtOutstandingPrincipalRUSD),
    constraints: [
      `Preview for ${snapshot.date.label}: the creditor, coupon, and term remain scenario/contract inputs; E2 exposes only refinancing policy and the ceiling.`,
      "A maturing contract is refinanced only when the policy allows it, no interest is overdue, and the ceiling still permits the replacement principal.",
      "Refinancing repays old principal and issues replacement principal in the same batch; both are financing movements.",
    ],
  };
}
