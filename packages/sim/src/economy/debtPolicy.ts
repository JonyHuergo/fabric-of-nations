/**
 * M5b debt-policy and debt-contract validation. Kept separate from the debt
 * engine so state validation can use it without a circular import.
 */

import { CAMPAIGN_TERMINAL_DAY_INDEX } from "../constants.js";
import { MONEY_TOLERANCE_RUSD } from "../population/constants.js";
import type { Day, Id } from "../types.js";
import { requireFiniteNumber, requireInteger, requireRecord } from "../validation.js";
import {
  DEFAULT_DEBT_POLICY,
  MAX_DEBT_ARREARS_GRACE_DAYS,
  MAX_DEBT_COUPON_RATE,
  MAX_DEBT_PRINCIPAL_RUSD,
  MAX_DEBT_TERM_DAYS,
  MIN_DEBT_COUPON_RATE,
  MIN_DEBT_TERM_DAYS,
} from "./constants.js";
import type { DebtContract, DebtPolicy } from "./types.js";

/** Create a validated debt policy from optional scenario input and defaults. */
export function createDebtPolicy(input?: Partial<DebtPolicy>): DebtPolicy {
  const policy: DebtPolicy = {
    enabled: input?.enabled ?? DEFAULT_DEBT_POLICY.enabled,
    creditorKind: input?.creditorKind ?? DEFAULT_DEBT_POLICY.creditorKind,
    creditorId: input?.creditorId ?? DEFAULT_DEBT_POLICY.creditorId,
    annualCouponRate: input?.annualCouponRate ?? DEFAULT_DEBT_POLICY.annualCouponRate,
    termDays: input?.termDays ?? DEFAULT_DEBT_POLICY.termDays,
    maxOutstandingPrincipalRUSD:
      input?.maxOutstandingPrincipalRUSD ?? DEFAULT_DEBT_POLICY.maxOutstandingPrincipalRUSD,
    refinanceOnMaturity: input?.refinanceOnMaturity ?? DEFAULT_DEBT_POLICY.refinanceOnMaturity,
    arrearsGraceDays: input?.arrearsGraceDays ?? DEFAULT_DEBT_POLICY.arrearsGraceDays,
  };
  return assertValidDebtPolicy(policy, "country.debt");
}

/** Validate one debt policy, returning a normalized copy. */
export function assertValidDebtPolicy(value: unknown, path: string): DebtPolicy {
  const record = requireRecord(value, path);
  if (typeof record.enabled !== "boolean") {
    throw new TypeError(`${path}.enabled must be a boolean`);
  }
  if (record.creditorKind !== "country" && record.creditorKind !== "popBlock") {
    throw new RangeError(`${path}.creditorKind must be "country" or "popBlock"`);
  }
  const creditorId = requireInteger(record.creditorId, `${path}.creditorId`, 0, 0xffff_ffff);
  const annualCouponRate = requireFiniteNumber(
    record.annualCouponRate,
    `${path}.annualCouponRate`,
  );
  if (annualCouponRate < MIN_DEBT_COUPON_RATE || annualCouponRate > MAX_DEBT_COUPON_RATE) {
    throw new RangeError(
      `${path}.annualCouponRate must be in ${MIN_DEBT_COUPON_RATE}..${MAX_DEBT_COUPON_RATE}`,
    );
  }
  const termDays = requireInteger(
    record.termDays,
    `${path}.termDays`,
    MIN_DEBT_TERM_DAYS,
    MAX_DEBT_TERM_DAYS,
  );
  const maxOutstandingPrincipalRUSD = requireFiniteNumber(
    record.maxOutstandingPrincipalRUSD,
    `${path}.maxOutstandingPrincipalRUSD`,
  );
  if (
    maxOutstandingPrincipalRUSD < 0 ||
    maxOutstandingPrincipalRUSD > MAX_DEBT_PRINCIPAL_RUSD
  ) {
    throw new RangeError(
      `${path}.maxOutstandingPrincipalRUSD must be in 0..${String(MAX_DEBT_PRINCIPAL_RUSD)}`,
    );
  }
  if (typeof record.refinanceOnMaturity !== "boolean") {
    throw new TypeError(`${path}.refinanceOnMaturity must be a boolean`);
  }
  const arrearsGraceDays = requireInteger(
    record.arrearsGraceDays,
    `${path}.arrearsGraceDays`,
    0,
    MAX_DEBT_ARREARS_GRACE_DAYS,
  );
  return {
    enabled: record.enabled,
    creditorKind: record.creditorKind,
    creditorId,
    annualCouponRate,
    termDays,
    maxOutstandingPrincipalRUSD,
    refinanceOnMaturity: record.refinanceOnMaturity,
    arrearsGraceDays,
  };
}

/** Structural validation for one persisted debt contract. */
export function assertValidDebtContract(contract: DebtContract, path: string): void {
  const record = requireRecord(contract, path);
  requireInteger(record.id, `${path}.id`, 0, 0xffff_ffff);
  if (record.contractVersion !== 1) {
    throw new RangeError(`${path}.contractVersion must be 1`);
  }
  requireInteger(record.issuerCountryId, `${path}.issuerCountryId`, 0, 0xffff_ffff);
  if (record.holderKind !== "country" && record.holderKind !== "popBlock") {
    throw new RangeError(`${path}.holderKind must be "country" or "popBlock"`);
  }
  requireInteger(record.holderId, `${path}.holderId`, 0, 0xffff_ffff);
  const principal = requireFiniteNumber(record.principalRUSD, `${path}.principalRUSD`);
  if (!(principal > 0)) throw new RangeError(`${path}.principalRUSD must be positive`);
  const outstanding = requireFiniteNumber(
    record.outstandingPrincipalRUSD,
    `${path}.outstandingPrincipalRUSD`,
  );
  if (outstanding < 0 || outstanding > principal + MONEY_TOLERANCE_RUSD * principal) {
    throw new RangeError(`${path}.outstandingPrincipalRUSD must be in 0..principalRUSD`);
  }
  const coupon = requireFiniteNumber(record.annualCouponRate, `${path}.annualCouponRate`);
  if (coupon < MIN_DEBT_COUPON_RATE || coupon > MAX_DEBT_COUPON_RATE) {
    throw new RangeError(`${path}.annualCouponRate must be in 0..1`);
  }
  const issueDay = requireInteger(record.issueDay, `${path}.issueDay`, 0, CAMPAIGN_TERMINAL_DAY_INDEX);
  const maturityDay = requireInteger(
    record.maturityDay,
    `${path}.maturityDay`,
    0,
    CAMPAIGN_TERMINAL_DAY_INDEX,
  );
  if (maturityDay <= issueDay) {
    throw new RangeError(`${path}.maturityDay must be after issueDay`);
  }
  const accrued = requireFiniteNumber(record.accruedInterestRUSD, `${path}.accruedInterestRUSD`);
  if (!(accrued >= 0)) throw new RangeError(`${path}.accruedInterestRUSD must be non-negative`);
  if (
    record.status !== "active" &&
    record.status !== "arrears" &&
    record.status !== "repaid" &&
    record.status !== "defaulted"
  ) {
    throw new RangeError(`${path}.status is invalid`);
  }
  if (record.arrearsSinceDay !== null) {
    requireInteger(record.arrearsSinceDay, `${path}.arrearsSinceDay`, 0, CAMPAIGN_TERMINAL_DAY_INDEX);
  }
  if (
    record.status === "repaid" &&
    (outstanding > MONEY_TOLERANCE_RUSD || accrued > MONEY_TOLERANCE_RUSD)
  ) {
    throw new RangeError(`${path} repaid contract must have no outstanding principal or interest`);
  }
  if (record.status === "defaulted" && outstanding > MONEY_TOLERANCE_RUSD) {
    throw new RangeError(`${path} defaulted contract must have no outstanding principal`);
  }
}

/** Maturity for a contract, capped at the campaign terminal boundary. */
export function debtMaturityFor(issueDay: Day, termDays: number): Day {
  return Math.min(issueDay + termDays, CAMPAIGN_TERMINAL_DAY_INDEX);
}

/** Total outstanding principal for one issuer. */
export function debtOutstandingPrincipal(
  contracts: readonly DebtContract[],
  issuerCountryId: Id,
): number {
  let total = 0;
  for (const contract of contracts) {
    if (contract.issuerCountryId !== issuerCountryId) continue;
    if (contract.status === "active" || contract.status === "arrears") {
      total += contract.outstandingPrincipalRUSD;
    }
  }
  return total;
}
