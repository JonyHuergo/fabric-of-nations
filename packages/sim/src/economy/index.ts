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
export * from "./technology.js";
export * from "./labor.js";
export * from "./localWages.js";
export {
  assertValidTradePolicyState,
  assertValidTradeState,
  createTradePolicyState,
  createTradeState,
  freightCostPerUnit,
  isFirstCivilDayOfMonth,
  marketInfrastructureQuality,
  neutralTradePolicyState,
  routeCapacityRUSDPerDay,
  runTradeArrivals,
  runTradeDispatchPhase,
  transitDays,
  type TradeArrivalResult,
  type TradeCapacityUse,
  type TradeDispatchResult,
} from "./trade.js";
export {
  applyMonetaryPolicy,
  assertValidMonetaryState,
  assertValidPriceIndexState,
  authorityLiabilityRUSD,
  authorityReserveCoverMonths,
  authorityReservesRUSD,
  buildPriceIndexBasket,
  convertibilityState,
  createPriceIndexState,
  derivePriceIndexes,
  emptyMonetaryState,
  emptyPriceIndexState,
  externalCurrencyHoldingRUSD,
  isConvertibilitySuspended,
  managedRegimeEnabled,
  monetaryCurrencyForCountry,
  priceIndexCoverage,
  priceIndexInflation,
  runMonetaryPhase,
  validateMonetaryPolicy,
  type DerivedPriceIndexes,
  type MonetaryPhaseResult,
  type MonetaryPolicyInput,
  type MonetaryPolicyResult,
} from "./monetary.js";
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
  repayGovernmentDebt,
  validateDebtIssuance,
  validateDebtRepayment,
  runDebtPhase,
  type DebtContractResult,
  type DebtIssuanceInput,
  type DebtIssuanceResult,
  type DebtPhaseResult,
  type DebtRepaymentInput,
  type DebtRepaymentResult,
} from "./debt.js";
export {
  runBusinessTaxPhase,
  type BusinessTaxBuildingResult,
  type BusinessTaxCountryResult,
  type BusinessTaxPhaseResult,
} from "./businessTax.js";
export {
  runIndustrialSubsidyPhase,
  type IndustrialSubsidyBuildingResult,
  type IndustrialSubsidyCountryResult,
  type IndustrialSubsidyPhaseResult,
} from "./industrial.js";
export {
  setIndustrialPolicy,
  supportPublicEnterprise,
  validateIndustrialPolicyInput,
  validatePublicEnterpriseSupport,
  type PublicEnterpriseSupportInput,
} from "./industrialPolicy.js";
export {
  assertValidCountryPoliticsInput,
  assertValidPoliticsDefinitions,
  countryFranchise,
  countryPoliticsSummary,
  createCountryPoliticsState,
  createWorldPoliticsState,
  crisisPressure,
  effectiveTaxRateBounds,
  governmentStance,
  isFirstDayOfMonth,
  lawByKey,
  lawDefinition,
  lawSupport,
  regimeDefinition,
  refreshInstitution,
  refreshInterestGroups,
  runPoliticsDayStart,
  runUnrestPhase,
  taxCollectionEfficiency,
  constructionProgressFactor,
  productionStrikeFactor,
  type CountryPoliticsSummary,
} from "./politics.js";
export {
  lawEnactmentDuration,
  lawPrerequisitesMet,
  proposeLaw,
  setInstitutionFunding,
  validateInstitutionFunding,
  validateLawProposal,
  type InstitutionFundingResult,
  type LawProposalResult,
} from "./politicsActions.js";
export {
  cancelConstruction,
  inheritedTechnique,
  runConstructionPhase,
  setConstructionPaused,
  startConstruction,
  validateConstructionCancel,
  validateConstructionPause,
  validateConstructionStart,
  type ConstructionPhaseResult,
  type ConstructionProjectInput,
  type ConstructionProjectResult,
  type ConstructionStartInput,
} from "./construction.js";
export {
  assertValidConstructionState,
  constructionCanProgress,
  constructionDailyWage,
  constructionIdleWorkers,
  constructionIdleWorkersByBlock,
  constructionMaterialRemaining,
  constructionMaterialsProgress,
  constructionMaterialsReady,
  constructionPlannedJobs,
  constructionProjectIsLive,
  constructionProjectIsTerminal,
  constructionProjectProgress,
  constructionProjectRemaining,
  constructionWorkingCapital,
  summarizeConstructionProject,
  type ConstructionProjectSummary,
} from "./constructionModel.js";
export {
  accumulateBudgetMemo,
  addBudgetTotals,
  assertValidBudgetTotals,
  assertValidFinanceBudgetMemo,
  budgetTotalsFromMemo,
  emptyBudgetTotals,
  emptyFinanceBudgetMemo,
  readBudgetMemo,
} from "./budget.js";

export {
  activeWarBetween,
  applyMilitaryAction,
  areAtWar,
  armiesInProvince,
  armiesOfCountry,
  assertValidMilitaryState,
  controlledProvincesOf,
  countryById as militaryCountryById,
  createMilitaryState,
  emptyMilitaryState,
  militaryPeopleOutsideCivilian,
  militaryPersonnelTotal,
  recruitablePeople,
  provinceById as militaryProvinceById,
  provinceControllerCountryId,
  provinceSovereignCountryId,
  relationBetween,
  runMilitaryPhase,
  splitMilitaryCasualties,
  transferProvinceSovereignty,
  validateMilitaryAction,
  type AcceptPeaceInput,
  type DeclareWarInput,
  type DeployArmyInput,
  type MilitaryActionResult,
  type MilitaryBattleResult,
  type MilitaryPhaseResult,
  type MilitaryActionInput,
  type MilitaryPhaseOptions,
  type MilitaryValidation,
  type OfferPeaceInput,
  type RecruitArmyInput,
} from "./military.js";
export * from "./provinceTransfer.js";
