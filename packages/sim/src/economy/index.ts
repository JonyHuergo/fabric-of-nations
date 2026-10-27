/** Public M3/M4 economy contracts and validated state helpers. */

export * from "./types.js";
export * from "./constants.js";
export * from "./accounts.js";
export * from "./currency.js";
export * from "./country.js";
export * from "./definitions.js";
export * from "./inventory.js";
export * from "./accounting.js";
export * from "./validation.js";
export * from "./state.js";
export * from "./employment.js";
export * from "./production.js";
export * from "./market.js";
export * from "./settlement.js";
export * from "./migration.js";
export * from "./aiState.js";
export * from "./ai.js";
export * from "./day.js";
/**
 * M4b period close. Only the public close operation and its result type are
 * exported; the internal `period-close` posting helper stays module-private so
 * public callers cannot create arbitrary closing entries.
 */
export {
  closeFinancePeriod,
  compactFinanceHistory,
  governmentPeriodTotals,
  type FinanceCloseResult,
  type GovernmentPeriodTotals,
} from "./period.js";
export {
  postFinanceCorrection,
  type FinanceCorrectionRequest,
  type FinanceCorrectionResult,
} from "./corrections.js";
export {
  assertValidProfitDistributionPolicy,
  createProfitDistributionPolicy,
  runProfitDistributionPhase,
  type BuildingProfitAllocationResult,
  type ProfitDistributionResult,
} from "./profit.js";
export {
  createDebtPolicy,
  assertValidDebtPolicy,
  assertValidDebtContract,
  debtMaturityFor,
  debtOutstandingPrincipal,
} from "./debtPolicy.js";
export {
  issueGovernmentDebt,
  runDebtPhase,
  type DebtContractResult,
  type DebtIssuanceInput,
  type DebtIssuanceResult,
  type DebtPhaseResult,
} from "./debt.js";
