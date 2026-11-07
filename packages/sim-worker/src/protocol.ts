/**
 * Versioned Fabric of Nations worker protocol and immutable UI snapshot contract.
 *
 * This module is intentionally free of simulation, Node, React Native, and DOM
 * imports. The app may import it directly; it contains only plain data contracts,
 * protocol constants, and runtime validation of untrusted messages.
 */

/**
 * 18 (D-137): SAVE_RESULT returns and LOAD/PREVIEW_SAVE accept the stored save form
 * (`STORED_SAVE_PREFIX`, compressed in the worker); a canonical save is still accepted.
 */
/**
 * 21 (D-143): province ownership as columns (`provinceOwnership`), the harvest column
 * and the focused province's land section.
 */
export const PROTOCOL_VERSION = 22 as const;
export const MAX_PROTOCOL_ID_LENGTH = 128;
export const MAX_STEP_TICKS = 1_000;
export const MAX_LOAD_SAVE_LENGTH = 64 * 1024 * 1024;
export const MAX_SNAPSHOT_LEDGER_MONTHS = 12;
export const MAX_SNAPSHOT_ANNUAL_REPORTS = 12;
/**
 * Upper bound for a person count carried in a snapshot.
 *
 * The 1900 world starts at roughly 1.59 billion people and the campaign can run
 * to the year 2000, so 20 billion is far above any plausible simulated total
 * while still rejecting obviously corrupt values. A 100,000,000 bound rejected
 * the United Kingdom's valid construction labour pool (107.8M idle workers
 * across the UK and British India) and made that campaign impossible to start.
 */
export const MAX_SNAPSHOT_PEOPLE = 20_000_000_000;
/** E6a: bounded in-transit consignments and blocked diagnostics per snapshot. */
export const MAX_SNAPSHOT_TRADE_SHIPMENTS = 24;
export const MAX_SNAPSHOT_TRADE_BLOCKED = 24;
/**
 * Presentation bound matching the simulation's active-contract cap. The UI uses
 * it only to disable an obviously impossible issuance; the simulation remains the
 * authoritative validator.
 */
export const MAX_ACTIVE_DEBT_CONTRACTS = 64;

/**
 * Presentation bound matching the simulation's active-construction cap. The UI
 * uses it only to explain/disable an obviously impossible action; the simulation
 * remains the authoritative validator.
 */
export const MAX_ACTIVE_CONSTRUCTION_PROJECTS = 32;

/** Discrete speed choices exposed by the M7 UI, in simulated days per second. */
export const SPEED_VALUES = [1, 3, 10, 30] as const;
export type SpeedDaysPerSecond = (typeof SPEED_VALUES)[number];

export const DEFAULT_SPEED_DAYS_PER_SECOND: SpeedDaysPerSecond = 1;

/** A player action as sent by the UI. The worker stamps the day and source. */
export interface FiscalPolicyActionDto {
  readonly kind: "set-fiscal-policy";
  readonly countryId: number;
  readonly incomeTaxRate: number;
  readonly incomeTaxAllowanceRUSDPerYear: number;
  readonly welfareBudgetRUSDPerYear: number;
  readonly welfareMaxWealthLevel: number;
  readonly businessProfitTaxRate: number;
  readonly reserveTargetRUSD: number;
}

export interface IssueDebtActionDto {
  readonly kind: "issue-debt";
  readonly countryId: number;
  readonly amountRUSD: number;
}

export interface RepayDebtActionDto {
  readonly kind: "repay-debt";
  readonly countryId: number;
  readonly contractId: number;
  readonly amountRUSD: number;
}

export interface SetDebtPolicyActionDto {
  readonly kind: "set-debt-policy";
  readonly countryId: number;
  readonly refinanceOnMaturity: boolean;
  readonly maxOutstandingPrincipalRUSD: number;
}

export interface StartConstructionActionDto {
  readonly kind: "start-construction";
  readonly countryId: number;
  readonly provinceId: number;
  readonly definitionId: number;
}

export interface CancelConstructionActionDto {
  readonly kind: "cancel-construction";
  readonly countryId: number;
  readonly projectId: number;
}

/** Mirror of the validated E4 sector taxonomy size; the simulation is authoritative. */
export const SNAPSHOT_SECTOR_COUNT = 8;

export interface SetConstructionPausedActionDto {
  readonly kind: "set-construction-paused";
  readonly countryId: number;
  readonly projectId: number;
  readonly paused: boolean;
}

export interface SetIndustrialPolicyActionDto {
  readonly kind: "set-industrial-policy";
  readonly countryId: number;
  readonly sectorSubsidyRates: readonly number[];
}

export interface SupportPublicEnterpriseActionDto {
  readonly kind: "support-public-enterprise";
  readonly countryId: number;
  readonly buildingId: number;
  readonly amountRUSD: number;
}

/** M8: propose, change, or repeal a law by target law id. */
export interface ProposeLawActionDto {
  readonly kind: "propose-law";
  readonly countryId: number;
  readonly lawId: number;
}

/** M8: set the annual administration funding target. */
export interface SetInstitutionFundingActionDto {
  readonly kind: "set-institution-funding";
  readonly countryId: number;
  readonly annualRUSD: number;
}

/** M9: start researching one technology. */
export interface StartResearchActionDto {
  readonly kind: "start-research";
  readonly countryId: number;
  readonly technologyId: number;
}

/** M9: cancel the active research project. */
export interface CancelResearchActionDto {
  readonly kind: "cancel-research";
  readonly countryId: number;
}

/** M9: set the annual education/research payroll target. */
export interface SetEducationFundingActionDto {
  readonly kind: "set-education-funding";
  readonly countryId: number;
  readonly annualRUSD: number;
}

/** M9: set the share of academic staff time assigned to research. */
export interface SetResearchStaffShareActionDto {
  readonly kind: "set-research-staff-share";
  readonly countryId: number;
  readonly share: number;
}

/** E5: set the annual training provider budget. */
export interface SetTrainingBudgetActionDto {
  readonly kind: "set-training-budget";
  readonly countryId: number;
  readonly annualRUSD: number;
}

/** E5: set the annual training stipend per trainee. */
export interface SetTrainingStipendActionDto {
  readonly kind: "set-training-stipend";
  readonly countryId: number;
  readonly annualRUSD: number;
}

/** E5: set the share of academic staff time assigned to vocational training. */
export interface SetTrainingStaffShareActionDto {
  readonly kind: "set-training-staff-share";
  readonly countryId: number;
  readonly share: number;
}

/** E5: set the share of administration clerk staff assigned to public health. */
export interface SetHealthStaffShareActionDto {
  readonly kind: "set-health-staff-share";
  readonly countryId: number;
  readonly share: number;
}

/** E6a: set the country's tariff schedule, monthly import quotas, and export restrictions. */
export interface SetTradePolicyActionDto {
  readonly kind: "set-trade-policy";
  readonly countryId: number;
  readonly tariffRates: readonly number[];
  readonly importQuotaQuantity: readonly (number | null)[];
  readonly exportRestricted: readonly boolean[];
}

/** M10: declare war. */
export interface DeclareWarActionDto {
  readonly kind: "declare-war";
  readonly countryId: number;
  readonly targetCountryId: number;
  readonly casusBelli: "border-dispute" | "trade-dispute" | "alliance-obligation";
}

/** M10: offer peace. */
export interface OfferPeaceActionDto {
  readonly kind: "offer-peace";
  readonly countryId: number;
  readonly warId: number;
  readonly terms: "white-peace" | "cede-occupied";
}

/** M10: accept a peace offer. */
export interface AcceptPeaceActionDto {
  readonly kind: "accept-peace";
  readonly countryId: number;
  readonly warId: number;
  readonly offerId: number;
}

/** M10: recruit an army. */
export interface RecruitArmyActionDto {
  readonly kind: "recruit-army";
  readonly countryId: number;
  readonly provinceId: number;
  readonly personnel: number;
  readonly equipmentUnits?: number;
}

/** M10: deploy an army. */
export interface DeployArmyActionDto {
  readonly kind: "deploy-army";
  readonly countryId: number;
  readonly armyId: number;
  readonly targetProvinceId: number;
}

/** E6b: set the monetary regime/parity and perform a reserve or currency operation. */
export interface SetMonetaryPolicyActionDto {
  readonly kind: "set-monetary-policy";
  readonly countryId: number;
  readonly regime: "pegged" | "managed";
  readonly parityRusdPerUnit: number | null;
  readonly reserveTransferRUSD: number;
  readonly currencyConversionRUSD: number;
}

/** D-140 / D-150: give up the country's own currency for another registered currency. */
export interface AdoptCurrencyActionDto {
  readonly kind: "adopt-currency";
  readonly countryId: number;
  readonly currencyId: number;
}

/** D-140 / D-150: an independent country using another's currency creates its own. */
export interface EstablishCurrencyActionDto {
  readonly kind: "establish-currency";
  readonly countryId: number;
  readonly standard: "gold" | "silver" | "paper";
  readonly name: string | null;
  readonly reserveFundingRUSD: number;
}

/** Every action the player UI may request. */
export type CountryActionDto =
  | FiscalPolicyActionDto
  | IssueDebtActionDto
  | RepayDebtActionDto
  | SetDebtPolicyActionDto
  | StartConstructionActionDto
  | CancelConstructionActionDto
  | SetConstructionPausedActionDto
  | SetIndustrialPolicyActionDto
  | SupportPublicEnterpriseActionDto
  | ProposeLawActionDto
  | SetInstitutionFundingActionDto
  | StartResearchActionDto
  | CancelResearchActionDto
  | SetEducationFundingActionDto
  | SetResearchStaffShareActionDto
  | SetTrainingBudgetActionDto
  | SetTrainingStipendActionDto
  | SetTrainingStaffShareActionDto
  | SetHealthStaffShareActionDto
  | SetTradePolicyActionDto
  | SetMonetaryPolicyActionDto
  | AdoptCurrencyActionDto
  | EstablishCurrencyActionDto
  | DeclareWarActionDto
  | OfferPeaceActionDto
  | AcceptPeaceActionDto
  | RecruitArmyActionDto
  | DeployArmyActionDto;

export type WorkerCommand =
  | { readonly protocolVersion: typeof PROTOCOL_VERSION; readonly type: "START"; readonly commandId: string }
  | { readonly protocolVersion: typeof PROTOCOL_VERSION; readonly type: "PAUSE"; readonly commandId: string }
  | {
      readonly protocolVersion: typeof PROTOCOL_VERSION;
      readonly type: "STEP";
      readonly commandId: string;
      readonly ticks: number;
    }
  | {
      readonly protocolVersion: typeof PROTOCOL_VERSION;
      readonly type: "SET_SPEED";
      readonly commandId: string;
      readonly daysPerSecond: SpeedDaysPerSecond;
    }
  | {
      readonly protocolVersion: typeof PROTOCOL_VERSION;
      readonly type: "APPLY_ACTION";
      readonly commandId: string;
      readonly actionId: string;
      readonly action: CountryActionDto;
    }
  | {
      readonly protocolVersion: typeof PROTOCOL_VERSION;
      readonly type: "CREATE_GAME";
      readonly commandId: string;
      readonly playerCountryId: number;
    }
  | {
      readonly protocolVersion: typeof PROTOCOL_VERSION;
      readonly type: "SET_FOCUS";
      readonly commandId: string;
      readonly countryId: number;
    }
  | {
      readonly protocolVersion: typeof PROTOCOL_VERSION;
      readonly type: "SET_MARKET_FOCUS";
      readonly commandId: string;
      /** Protocol 22: the market whose prices the snapshot carries in full; null clears it. */
      readonly marketId: number | null;
    }
  | {
      readonly protocolVersion: typeof PROTOCOL_VERSION;
      readonly type: "SET_PROVINCE_FOCUS";
      readonly commandId: string;
      /** P4: the province whose pyramid the snapshot carries; null clears it. */
      readonly provinceId: number | null;
    }
  | {
      readonly protocolVersion: typeof PROTOCOL_VERSION;
      readonly type: "REQUEST_SNAPSHOT";
      readonly commandId: string;
    }
  | { readonly protocolVersion: typeof PROTOCOL_VERSION; readonly type: "SAVE"; readonly commandId: string }
  | {
      readonly protocolVersion: typeof PROTOCOL_VERSION;
      readonly type: "LOAD";
      readonly commandId: string;
      readonly save: string;
    }
  | {
      readonly protocolVersion: typeof PROTOCOL_VERSION;
      /** Read a save for display only; the authoritative world is not replaced. */
      readonly type: "PREVIEW_SAVE";
      readonly commandId: string;
      readonly save: string;
    }
  | { readonly protocolVersion: typeof PROTOCOL_VERSION; readonly type: "SHUTDOWN"; readonly commandId: string };

export interface SnapshotCivilDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  /** Canonical `YYYY-MM-DD` label. */
  readonly label: string;
}

export interface SnapshotFiscalPolicy {
  readonly incomeTaxRate: number;
  readonly incomeTaxAllowanceRUSDPerYear: number;
  readonly welfareBudgetRUSDPerYear: number;
  readonly welfareMaxWealthLevel: number;
  readonly businessProfitTaxRate: number;
  readonly reserveTargetRUSD: number;
}

/** E2 budget decomposition for one closed period (flows, not balances). */
export interface SnapshotBudgetTotals {
  readonly welfareRequestedRUSD: number;
  readonly welfareShortfallRUSD: number;
  readonly businessTaxAssessedRUSD: number;
  readonly businessTaxUncollectedRUSD: number;
  readonly debtIssuedRUSD: number;
  readonly principalRepaidRUSD: number;
  readonly interestPaidRUSD: number;
  readonly unfinancedRequirementRUSD: number;
  readonly constructionSpentRUSD: number;
  readonly constructionWrittenOffRUSD: number;
  readonly constructionMaterialsSpentRUSD: number;
  readonly subsidyRequestedRUSD: number;
  readonly subsidyShortfallRUSD: number;
  readonly publicEnterpriseSupportRUSD: number;
  readonly administrationRequestedRUSD?: number;
  readonly administrationShortfallRUSD?: number;
}

/** Current open-period budget memo. Values are flows so far this month. */
export interface SnapshotBudgetMonthToDate extends SnapshotBudgetTotals {
  readonly businessTaxBaseMonthToDateRUSD: number;
}

/** M5b debt policy plus derived financing constraints. */
export interface SnapshotDebtPolicy {
  readonly enabled: boolean;
  readonly refinanceOnMaturity: boolean;
  readonly maxOutstandingPrincipalRUSD: number;
  readonly creditorKind: "country" | "popBlock";
  readonly creditorId: number;
  readonly creditorLabel: string;
  readonly annualCouponRate: number;
  readonly termDays: number;
  readonly arrearsGraceDays: number;
  /** Creditor's current designated cash; a hard issuance limit. */
  readonly creditorCashRUSD: number;
  /** Remaining outstanding-principal headroom under the ceiling. */
  readonly headroomRUSD: number;
}

/** One outstanding debt contract exposed for repayment planning. */
export interface SnapshotDebtContract {
  readonly id: number;
  readonly holderKind: "country" | "popBlock";
  readonly holderId: number;
  readonly holderLabel: string;
  readonly principalRUSD: number;
  readonly outstandingPrincipalRUSD: number;
  readonly annualCouponRate: number;
  readonly issueDay: number;
  readonly maturityDay: number;
  readonly accruedInterestRUSD: number;
  readonly status: "active" | "arrears" | "repaid" | "defaulted";
}

/** Output capacity of a buildable project type at level 1 / condition 1. */
export interface SnapshotProjectOutput {
  readonly goodId: number;
  readonly goodKey: string;
  readonly goodName: string;
  readonly unitLabel: string;
  readonly quantityPerThroughputUnit: number;
  readonly dailyCapacityAtLevelOne: number;
}

/** One authored construction/commissioning material requirement. */
export interface SnapshotConstructionMaterialRequirement {
  readonly goodId: number;
  readonly goodKey: string;
  readonly goodName: string;
  readonly unitLabel: string;
  readonly quantity: number;
}

/** Buildable public-construction project type derived from validated data. */
export interface SnapshotProjectType {
  readonly definitionId: number;
  readonly key: string;
  readonly name: string;
  readonly sector: string;
  readonly constructionCostRUSD: number;
  readonly constructionWorkers: number;
  readonly plannedJobs: number;
  readonly dailyUpkeepRUSDAtLevelOne: number;
  readonly workingCapitalRUSD: number;
  readonly outputs: readonly SnapshotProjectOutput[];
  readonly materials: readonly SnapshotConstructionMaterialRequirement[];
}

/** Current material state of a construction project. */
export interface SnapshotProjectMaterial {
  readonly goodId: number;
  readonly goodKey: string;
  readonly goodName: string;
  readonly unitLabel: string;
  readonly requiredQuantity: number;
  readonly deliveredQuantity: number;
  readonly remainingQuantity: number;
  readonly unitPriceRUSD: number;
  readonly deliveredValueRUSD: number;
}

/** Current/persisted public-construction project. */
export interface SnapshotConstructionProject {
  readonly id: number;
  readonly countryId: number;
  readonly provinceId: number;
  readonly provinceName: string;
  readonly definitionId: number;
  readonly definitionKey: string;
  readonly definitionName: string;
  readonly status:
    | "authorized"
    | "active"
    | "waiting"
    | "paused"
    | "completed"
    | "cancelled";
  readonly authorizedDay: number;
  readonly startedDay: number | null;
  readonly completedDay: number | null;
  readonly cancelledDay: number | null;
  readonly totalCostRUSD: number;
  readonly workingCapitalRUSD: number;
  readonly workingCapitalPaidRUSD: number;
  readonly spentRUSD: number;
  readonly materialsSpentRUSD: number;
  readonly materials: readonly SnapshotProjectMaterial[];
  readonly progress: number;
  readonly materialsProgress: number;
  readonly remainingRUSD: number;
  readonly lastWorkers: number;
  readonly blockedReason: "labor" | "funds" | "materials" | null;
  readonly buildingId: number | null;
}

/** Bounded aggregate of compacted construction history for one country. */
export interface SnapshotConstructionHistory {
  readonly projectsCompleted: number;
  readonly projectsCancelled: number;
  readonly totalSpentRUSD: number;
  readonly totalWrittenOffRUSD: number;
}

/** Current construction-labor availability and wage estimate. */
export interface SnapshotConstructionLabor {
  readonly idleWorkers: number;
  /** Idle-worker-weighted mean daily base wage, 0 when no idle workers. */
  readonly dailyWageRUSD: number;
}

/** One validated building-sector row used by the industrial-policy UI. */
export interface SnapshotSector {
  readonly index: number;
  readonly key: string;
  readonly label: string;
  readonly subsidyRate: number;
  /** Presentation estimate: current sector capacity valued at current prices. */
  readonly estimatedDailyOutputValueRUSD: number;
}

/** Policy state and month-to-date subsidy outcome for one country. */
export interface SnapshotIndustrialPolicy {
  readonly sectors: readonly SnapshotSector[];
  readonly requestedMonthToDateRUSD: number;
  readonly paidMonthToDateRUSD: number;
  readonly shortfallMonthToDateRUSD: number;
}

/** A state-owned productive enterprise available for operating support. */
export interface SnapshotPublicEnterprise {
  readonly buildingId: number;
  readonly definitionId: number;
  readonly definitionKey: string;
  readonly definitionName: string;
  readonly provinceId: number;
  readonly provinceName: string;
  readonly sector: string;
  readonly level: number;
  readonly condition: number;
  readonly operatingCashRUSD: number;
  readonly ownerCountryId: number;
}

export interface SnapshotFiscalTotals {
  readonly periodStartDay: number;
  readonly periodEndDay: number;
  readonly incomeTaxRUSD: number;
  readonly welfareExpenseRUSD: number;
  readonly interestExpenseRUSD: number;
  readonly subsidyExpenseRUSD: number;
  readonly administrationExpenseRUSD?: number;
  /**
   * Additive, optional categories. Current snapshots always populate them; an
   * older protocol-13 snapshot may omit them, in which case reports show zero.
   */
  readonly educationExpenseRUSD?: number;
  readonly trainingExpenseRUSD?: number;
  readonly customsDutyRevenueRUSD?: number;
  readonly militaryExpenseRUSD?: number;
  readonly netFiscalResultRUSD: number;
}

export interface SnapshotProductionCapacity {
  readonly goodId: number;
  readonly goodKey: string;
  readonly goodName: string;
  readonly unitLabel: string;
  readonly category: string;
  /**
   * Estimated daily output at the current building level, condition, staffing,
   * and productivity. This is a capacity, not realized production or demand.
   */
  readonly dailyCapacity: number;
}

export interface SnapshotNeedTierGood {
  readonly goodId: number;
  readonly goodKey: string;
  readonly goodName: string;
  readonly unitLabel: string;
}

export interface SnapshotNeedTier {
  readonly tier: "subsistence" | "basic" | "comfort" | "luxury";
  readonly goods: readonly SnapshotNeedTierGood[];
}

export interface SnapshotFinancePeriod extends SnapshotFiscalTotals, SnapshotBudgetTotals {
  /** E2 business-profit tax revenue recognized in the period. */
  readonly businessTaxRevenueRUSD: number;
  /** World-wide gross flows for the four M4b flow kinds. */
  readonly grossFlowTotals: Readonly<Record<string, number>>;
  /** Canonical labels for the inclusive closed period. */
  readonly periodStartLabel: string;
  readonly periodEndLabel: string;
  /**
   * End-of-close balances when the summary still retains account detail
   * (the recent detailed window). Older compacted summaries keep only fiscal
   * flows, so these are null rather than a fabricated zero.
   */
  readonly treasuryCashEndRUSD: number | null;
  readonly debtOutstandingEndRUSD: number | null;
  readonly householdCashEndRUSD: number | null;
}

export interface SnapshotAnnualReport extends SnapshotBudgetTotals {
  readonly year: number;
  readonly periodStartDay: number;
  readonly periodEndDay: number;
  readonly periodStartLabel: string;
  readonly periodEndLabel: string;
  readonly complete: boolean;
  readonly incomeTaxRUSD: number;
  readonly businessTaxRevenueRUSD: number;
  readonly welfareExpenseRUSD: number;
  readonly interestExpenseRUSD: number;
  readonly subsidyExpenseRUSD: number;
  readonly administrationExpenseRUSD?: number;
  readonly educationExpenseRUSD?: number;
  readonly trainingExpenseRUSD?: number;
  readonly customsDutyRevenueRUSD?: number;
  readonly militaryExpenseRUSD?: number;
  readonly netFiscalResultRUSD: number;
  readonly treasuryCashEndRUSD: number;
  readonly debtLiabilityEndRUSD: number;
  readonly interestPayableEndRUSD: number;
  readonly correctionCount: number;
}

/** M8 interest-group view: derived, unspendable influence. */
export interface SnapshotInterestGroup {
  readonly key: string;
  readonly name: string;
  readonly membershipPopulation: number;
  readonly organization: number;
  readonly influence: number;
  readonly governmentStance: number;
}

/** M8 institution view: derived quality/overload and actual funding memo. */
export interface SnapshotInstitution {
  readonly fundedAnnualRUSD: number;
  readonly quality: number;
  readonly overload: number;
  readonly serviceOutputIndex: number;
  readonly staffedPopulation: number;
  readonly fundingRequestedMonthToDateRUSD: number;
  readonly fundingShortfallMonthToDateRUSD: number;
  readonly disruptionUntilDay: number | null;
}

/** M8 one proposable law option and its current support/eligibility. */
export interface SnapshotLawOption {
  readonly lawId: number;
  readonly slot: string;
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly enactmentDays: number;
  readonly support: number;
  readonly eligible: boolean;
  readonly prerequisitesMet: boolean;
  readonly alreadyEnacted: boolean;
  readonly transitionInProgress: boolean;
  readonly isBaseLaw: boolean;
  /** M9 research technologies required before this law is proposable. */
  readonly requiredTechnologyKeys: readonly string[];
  /** True when every required technology is researched. */
  readonly technologyPrerequisitesMet: boolean;
}

/** M8 law slot view. */
export interface SnapshotLawSlot {
  readonly slot: string;
  readonly enactedLawId: number;
  readonly enactedLawName: string;
  readonly options: readonly SnapshotLawOption[];
}

/** M8 in-flight law transition view. */
export interface SnapshotLawTransition {
  readonly id: number;
  readonly slot: string;
  readonly fromLawName: string;
  readonly toLawName: string;
  readonly proposedDay: number;
  readonly effectiveDay: number;
  readonly support: number;
}

/** M8 election result view (last election only). */
export interface SnapshotElection {
  readonly day: number;
  readonly eligiblePopulation: number;
  readonly votesForGovernment: number;
  readonly votesForOpposition: number;
  readonly governmentVoteShare: number;
  readonly turnoutShare: number;
  readonly previousGovernmentGroupKey: string;
  readonly winnerGroupKey: string;
}

/** M8 crisis stage view. */
export interface SnapshotCrisis {
  readonly stage: string;
  readonly sinceDay: number;
  readonly pressureDays: number;
  readonly pressure: number;
}

/** M8 country politics snapshot. */
export interface SnapshotPolitics {
  readonly enabled: boolean;
  readonly regimeKind: string;
  readonly regimeName: string;
  readonly governmentGroupKey: string;
  readonly governmentGroupName: string;
  readonly nextElectionDay: number | null;
  readonly lastElectionDay: number | null;
  readonly lastElection: SnapshotElection | null;
  readonly crisis: SnapshotCrisis;
  readonly franchiseShare: number;
  readonly eligiblePopulation: number;
  readonly supportForGovernment: number;
  readonly taxCollectionEfficiency: number;
  readonly constructionProgressFactor: number;
  readonly interestGroups: readonly SnapshotInterestGroup[];
  readonly institution: SnapshotInstitution;
  readonly lawSlots: readonly SnapshotLawSlot[];
  readonly lawTransitions: readonly SnapshotLawTransition[];
  /** Every implemented law option in a flat list for proposal selection. */
  readonly lawOptions: readonly SnapshotLawOption[];
  /** Slots whose mechanics are deliberately not implemented in M8. */
  readonly deferredLawSlots: readonly string[];
  /** Bounded recent political/event log entries, oldest first. */
  readonly recentLog: readonly {
    readonly id: number;
    readonly day: number;
    readonly kind: string;
    readonly summary: string;
    readonly provenance: string;
  }[];
}

/**
 * One validated technology definition. The catalog is immutable global content and
 * is sent once per snapshot, not duplicated per country.
 */
export interface SnapshotTechnologyCatalogEntry {
  readonly technologyId: number;
  readonly key: string;
  readonly name: string;
  readonly era: number;
  readonly eraName: string;
  readonly description: string;
  readonly prerequisites: readonly number[];
  readonly prerequisiteKeys: readonly string[];
  readonly researchWork: number;
  /** Human-readable effect descriptions derived from the validated effect data. */
  readonly effects: readonly string[];
  /** Building definition keys unlocked by this technology. */
  readonly unlockedBuildingKeys: readonly string[];
  /** Law keys enabled by this technology. */
  readonly requiredByLawKeys: readonly string[];
}

/** One country's research status for a catalog technology. */
export interface SnapshotTechnologyStatus {
  readonly technologyId: number;
  readonly status: "researched" | "active" | "available" | "locked";
  readonly workCompleted: number;
  readonly completedDay: number | null;
}

/** M9 country technology snapshot. Static catalog content lives at the snapshot root. */
export interface SnapshotTechnology {
  readonly enabled: boolean;
  readonly statuses: readonly SnapshotTechnologyStatus[];
  readonly researchedCount: number;
  readonly activeProjectTechnologyId: number | null;
  readonly researchBlockedReason: string | null;
  readonly productivityBySector: readonly {
    readonly sector: string;
    readonly factor: number;
  }[];
  readonly mortalityFactor: number;
  readonly educationBonus: number;
}

/** M9 country education institution snapshot (derived values labelled as such). */
export interface SnapshotEducation {
  readonly enabled: boolean;
  readonly fundedAnnualRUSD: number;
  readonly researchStaffShare: number;
  readonly academicPopulation: number;
  readonly availableAcademicWorkers: number;
  readonly researchStaff: number;
  readonly teacherStaff: number;
  readonly schoolAgePopulation: number;
  readonly teachingCapacityStudents: number;
  readonly enrolledStudents: number;
  readonly attendanceRate: number;
  readonly fundingAdequacy: number;
  readonly quality: number;
  readonly serviceOutputIndex: number;
  readonly fundingRequestedMonthToDateRUSD: number;
  readonly fundingShortfallMonthToDateRUSD: number;
  readonly researchBlockedReason: string | null;
  readonly educationBlockedReason: string | null;
  readonly lastUpdateDay: number | null;
}

export interface SnapshotLabor {
  /** E5 training policy and derived service. */
  readonly trainingBudgetRUSDPerYear: number;
  readonly trainingStipendPerTraineeRUSDPerYear: number;
  readonly trainingStaffShare: number;
  readonly trainingParticipation: number;
  readonly trainingInstructors: number;
  readonly eligibleWorkingAge: number;
  readonly capacityTrainees: number;
  readonly trainees: number;
  readonly trainingRequestedMonthToDateRUSD: number;
  readonly trainingShortfallMonthToDateRUSD: number;
  readonly trainingBlockedReason: string | null;
  /** Weighted average vocational qualification of the country's working-age people. */
  readonly qualificationAverage: number;
  /** E5 public-health service and statutory labor readouts. */
  readonly healthStaffShare: number;
  readonly healthStaff: number;
  readonly administrationStaff: number;
  readonly healthServiceOutputIndex: number;
  readonly healthMortalityFactor: number;
  readonly healthBlockedReason: string | null;
  readonly minimumWageRUSDPerYear: number;
  readonly hoursPerWeek: number;
  readonly hoursFactor: number;
}

/** E6a per-country trade policy, quota usage, and month-to-date trade memo. */
export interface SnapshotTradePolicy {
  readonly tariffRates: readonly number[];
  readonly importQuotaQuantity: readonly (number | null)[];
  readonly importQuotaUsedQuantity: readonly number[];
  readonly exportRestricted: readonly boolean[];
  /** Customs markets this country administers; empty when it administers none. */
  readonly customsMarketIds: readonly number[];
  readonly lastUpdateDay: number | null;
  readonly exportsValueMonthToDateRUSD: number;
  readonly importsValueMonthToDateRUSD: number;
  readonly dutyReceivedMonthToDateRUSD: number;
  readonly dutyPaidMonthToDateRUSD: number;
  readonly freightPaidMonthToDateRUSD: number;
}

/** One observed transport route and its derived daily capacity. */
export interface SnapshotTradeRoute {
  readonly id: number;
  readonly marketAId: number;
  readonly marketBId: number;
  readonly distanceUnits: number;
  readonly transitDays: number;
  readonly baseCapacityRUSDPerDay: number;
  /** Derived capacity at the current market infrastructure, per direction per day. */
  readonly capacityRUSDPerDay: number;
}

/** One observed in-transit consignment. */
export interface SnapshotTradeShipment {
  readonly id: number;
  readonly goodId: number;
  readonly goodKey: string;
  readonly quantity: number;
  readonly sellerBuildingId: number;
  readonly originMarketId: number;
  readonly destinationMarketId: number;
  readonly originCountryId: number | null;
  readonly destinationCountryId: number | null;
  readonly dispatchDay: number;
  readonly arrivalDay: number;
  readonly cargoValueRUSD: number;
  readonly freightCostRUSD: number;
  readonly dutyRUSD: number;
  readonly dutyRate: number;
}

/** One blocked-shipment diagnostic for the most recent processed day. */
export interface SnapshotTradeBlockedReason {
  readonly originMarketId: number;
  readonly destinationMarketId: number;
  readonly goodId: number;
  readonly goodKey: string;
  readonly reason: string;
}

/** E6a trade network and last-day outcome. */
export interface SnapshotTradeNetwork {
  readonly enabled: boolean;
  readonly routes: readonly SnapshotTradeRoute[];
  /** Newest in-transit consignments, ascending id, bounded. */
  readonly shipments: readonly SnapshotTradeShipment[];
  readonly inTransitShipmentCount: number;
  readonly shipmentsTruncated: boolean;
  readonly lastDay: {
    readonly dayIndex: number;
    readonly dispatchedShipments: number;
    readonly arrivedShipments: number;
    readonly freightPaidRUSD: number;
    readonly dutyPaidRUSD: number;
    readonly ownerFundedRUSD: number;
    readonly blocked: readonly SnapshotTradeBlockedReason[];
    readonly blockedTruncated: boolean;
  } | null;
}

/** One currency identity and its authoritative RUSD valuation, for the Money screen. */
export interface SnapshotCurrency {
  readonly id: number;
  readonly key: string;
  readonly name: string;
  readonly issuerKind: "country" | "foreign" | "union";
  readonly issuerCountryId: number | null;
  readonly valuationStatus: "specified" | "unavailable";
  /** RUSD per one currency unit; null when unavailable. Never a parity default. */
  readonly rusdPerUnit: number | null;
  readonly valuationSource: "scenario" | "policy" | "market" | null;
}

/** P3 (D-141): the valuations of one closed month, keyed by currency id. */
export interface SnapshotValuationMonth {
  readonly periodEndDay: number;
  /** RUSD per one unit at the close, by currency id; unavailable currencies are absent. */
  readonly rusdPerUnit: Readonly<Record<number, number>>;
}

/** P3 (D-141): the mean of a closed year's month-end valuations, keyed by currency id. */
export interface SnapshotValuationYear {
  readonly year: number;
  readonly meanRusdPerUnit: Readonly<Record<number, number>>;
}

/**
 * P3 (D-141): closing valuations the display converts history with. `months` covers the
 * ledger window; `years` covers the annual reports. Display-only data.
 */
export interface SnapshotValuationHistory {
  readonly months: readonly SnapshotValuationMonth[];
  readonly years: readonly SnapshotValuationYear[];
}

/** One fixed basket item of the price index. */
export interface SnapshotPriceIndexBasketItem {
  readonly goodId: number;
  readonly goodKey: string;
  readonly goodName: string;
  readonly weight: number;
}

/** One retained month-end world price-index observation. */
export interface SnapshotPriceIndexObservation {
  readonly year: number;
  readonly month: number;
  readonly dayIndex: number;
  readonly world: number;
}

/** World price-index definition and current measurement. */
export interface SnapshotPriceIndex {
  /** First processed day: the base period, normalized to 100. */
  readonly baseDayIndex: number;
  readonly basket: readonly SnapshotPriceIndexBasketItem[];
  readonly worldValue: number;
  /** Population-weighted basket coverage across markets, 0..1. */
  readonly coverage: number;
  readonly observations: readonly SnapshotPriceIndexObservation[];
  readonly monthOnMonthInflation: number | null;
  readonly yearOnYearInflation: number | null;
}

/** Country price-index measurement (a derived measure, not a spendable value). */
export interface SnapshotCountryPriceIndex {
  readonly baseDayIndex: number;
  readonly value: number;
  readonly coverage: number;
  readonly monthOnMonthInflation: number | null;
  readonly yearOnYearInflation: number | null;
}

/** E6b monetary-authority state for one country. */
export interface SnapshotMonetaryAuthority {
  /** True when the country issues its own currency and the monetary system is enabled. */
  readonly hasAuthority: boolean;
  readonly active: boolean;
  readonly regime: string;
  readonly parityRusdPerUnit: number | null;
  readonly valuationRusdPerUnit: number | null;
  readonly reserveCashRUSD: number;
  readonly currencyIssuedUnits: number;
  readonly liabilityRUSD: number;
  /** Reserves in months of the last completed month's imports; null when no imports. */
  readonly reserveCoverMonths: number | null;
  readonly convertibility: "no-authority" | "inactive" | "open" | "suspended";
  readonly lastParityChangeDay: number | null;
  readonly lastMonthExportsRUSD: number;
  readonly lastMonthImportsRUSD: number;
  /** Why the authority is not operating, or null. */
  readonly blockedReason: string | null;
  /** D-149: the currency's standard (`paper` without an authority). */
  readonly standard: "gold" | "silver" | "paper";
  /** D-149: legal fine metal per unit, grams; 0 for paper. */
  readonly fineGramsPerUnit: number;
  /** D-149: the mint's monetary metal, kg fine. */
  readonly metalReserveKg: number;
  /** D-149: that metal at today's price in the issuer's market, RUSD. */
  readonly metalReserveValueRUSD: number;
  /** D-149: the mint price, RUSD per kg fine; null for paper. */
  readonly mintPriceRUSDPerKg: number | null;
}

/** M11 constitutional status exposed to the app. */
export type CountryStatusDto =
  | "independent"
  | "personal-union"
  | "autonomous-vassal"
  | "dominion"
  | "self-governing-colony"
  | "protectorate"
  | "colony"
  | "occupation"
  | "autonomous-province"
  | "dependency";

/** M11 static polity metadata attached to a full country record. */
export interface CountryMetaSnapshot {
  readonly historicalName: string;
  readonly status: CountryStatusDto;
  readonly sovereignCountryId: number;
  readonly capitalName: string;
  readonly selectable: boolean;
  readonly population1900Estimate: number | null;
  readonly confidence: "low" | "medium" | "high";
  readonly notes: string;
}

/** M11 static metadata attached to a dependent-territory province. */
/**
 * P2 province economies as columns: entry i of every column belongs to province
 * `ids[i]` (ascending). A snapshot of 1,687 provinces would otherwise repeat every
 * field name per province; the columns keep the per-tick message small. Read rows
 * with `provinceEconomyRows`. Province names are static app content.
 */
export interface ProvinceEconomyTable {
  readonly ids: readonly number[];
  readonly countryId: readonly (number | null)[];
  readonly marketId: readonly (number | null)[];
  readonly population: readonly number[];
  /** One row per province, aligned with the snapshot's `professions` order. */
  readonly populationByProfession: readonly (readonly number[])[];
  readonly buildingCount: readonly number[];
  readonly buildingLevels: readonly number[];
  readonly employedWorkers: readonly number[];
  readonly unrest: readonly number[];
  readonly infrastructure: readonly number[];
  readonly urbanShare: readonly number[];
  readonly arableLandHa: readonly number[];
  readonly pastureHa: readonly number[];
  readonly literacy: readonly number[];
  readonly controllerCountryId: readonly (number | null)[];
  readonly controlledSinceDay: readonly (number | null)[];
  readonly territoryTag: readonly (string | null)[];
  readonly harvestFactor: readonly (number | null)[];
}

/** Encode province rows as a column table (rows ascending by id). */
export function encodeProvinceEconomyTable(
  rows: readonly ProvinceEconomySnapshot[],
  professions: readonly { readonly id: number }[],
): ProvinceEconomyTable {
  return {
    ids: rows.map((row) => row.id),
    countryId: rows.map((row) => row.countryId),
    marketId: rows.map((row) => row.marketId),
    population: rows.map((row) => row.population),
    populationByProfession: rows.map((row) =>
      professions.map((profession) => row.populationByProfession[String(profession.id)] ?? 0),
    ),
    buildingCount: rows.map((row) => row.buildingCount),
    buildingLevels: rows.map((row) => row.buildingLevels),
    employedWorkers: rows.map((row) => row.employedWorkers),
    unrest: rows.map((row) => row.unrest),
    infrastructure: rows.map((row) => row.infrastructure),
    urbanShare: rows.map((row) => row.urbanShare),
    arableLandHa: rows.map((row) => row.arableLandHa),
    pastureHa: rows.map((row) => row.pastureHa),
    literacy: rows.map((row) => row.literacy),
    controllerCountryId: rows.map((row) => row.controllerCountryId),
    controlledSinceDay: rows.map((row) => row.controlledSinceDay),
    territoryTag: rows.map((row) => row.territoryTag),
    harvestFactor: rows.map((row) => row.harvestFactor),
  };
}

const provinceRowsCache = new WeakMap<ProvinceEconomyTable, readonly ProvinceEconomySnapshot[]>();




/**
 * Province economy rows of a snapshot, decoded once per table (presentation-side
 * cache keyed by the immutable snapshot table; it holds no simulation state).
 */
export function provinceEconomyRows(
  snapshot: Pick<SimulationSnapshot, "provinceTable" | "professions">,
): readonly ProvinceEconomySnapshot[] {
  const table = snapshot.provinceTable;
  const cached = provinceRowsCache.get(table);
  if (cached !== undefined) return cached;
  const rows = table.ids.map((id, index): ProvinceEconomySnapshot => {
    const counts = table.populationByProfession[index] ?? [];
    const byProfession: Record<string, number> = {};
    snapshot.professions.forEach((profession, column) => {
      const count = counts[column] ?? 0;
      if (count > 0) byProfession[String(profession.id)] = count;
    });
    return Object.freeze({
      id,
      countryId: table.countryId[index] ?? null,
      marketId: table.marketId[index] ?? null,
      population: table.population[index] ?? 0,
      populationByProfession: Object.freeze(byProfession),
      buildingCount: table.buildingCount[index] ?? 0,
      buildingLevels: table.buildingLevels[index] ?? 0,
      employedWorkers: table.employedWorkers[index] ?? 0,
      unrest: table.unrest[index] ?? 0,
      infrastructure: table.infrastructure[index] ?? 0,
      urbanShare: table.urbanShare[index] ?? 0,
      arableLandHa: table.arableLandHa[index] ?? 0,
      pastureHa: table.pastureHa[index] ?? 0,
      literacy: table.literacy[index] ?? 0,
      controllerCountryId: table.controllerCountryId[index] ?? null,
      controlledSinceDay: table.controlledSinceDay[index] ?? null,
      territoryTag: table.territoryTag[index] ?? null,
      harvestFactor: table.harvestFactor[index] ?? null,
    });
  });
  provinceRowsCache.set(table, rows);
  return rows;
}

/** P2 dependent territory: a named set of provinces of its sovereign (D-118 §3). */
export interface TerritorySnapshot {
  readonly polityTag: string;
  /** Provinces of the territory, ascending. */
  readonly provinceIds: readonly number[];
  readonly historicalName: string;
  readonly status: CountryStatusDto;
  readonly sovereignCountryId: number;
  readonly capitalName: string;
  readonly confidence: "low" | "medium" | "high";
  readonly notes: string;
}

/**
 * Compact per-country record carried for every country on every snapshot.
 * Full detail is bounded to the player country and the focused country so a
 * world with dozens of countries stays within a practical snapshot size.
 */
export interface CountrySummarySnapshot {
  readonly id: number;
  readonly tag: string;
  readonly name: string;
  readonly historicalName: string;
  readonly status: CountryStatusDto;
  readonly sovereignCountryId: number;
  readonly capitalName: string;
  readonly selectable: boolean;
  readonly isPlayer: boolean;
  readonly isFocused: boolean;
  readonly provinceIds: readonly number[];
  readonly marketIds: readonly number[];
  readonly population: number;
  readonly workingAgePopulation: number;
  readonly employedWorkers: number;
  readonly treasuryCashRUSD: number;
  readonly hardshipPopulationShare: number;
  readonly literacy: number;
  readonly wealthLevel: number;
  readonly militancy: number;
  readonly militaryPersonnel: number;
  readonly latestNetFiscalResultRUSD: number | null;
}

export interface CountrySnapshot {
  readonly id: number;
  readonly tag: string;
  readonly name: string;
  /** P3 (D-141): the currency of the country's monetary arrangement (its own or adopted). */
  readonly currencyId: number;
  readonly monetaryArrangement: "own" | "adopted" | "shared";
  /** M11 static polity metadata; null for legacy scenarios without a catalog. */
  readonly meta: CountryMetaSnapshot | null;
  readonly provinceIds: readonly number[];
  /** P4 (D-142) demography, pyramid, causes and annual history; null without population definitions. */
  readonly demography: CountryDemographySnapshot | null;
  readonly fiscal: SnapshotFiscalPolicy;
  readonly treasuryCashRUSD: number;
  readonly debtEnabled: boolean;
  readonly debtOutstandingPrincipalRUSD: number;
  readonly debtInterestPayableRUSD: number;
  /** Player-visible debt policy and derived financing limits. */
  readonly debtPolicy: SnapshotDebtPolicy;
  /** Outstanding/arrears contracts, in ascending id order (bounded by the cap). */
  readonly debtContracts: readonly SnapshotDebtContract[];
  readonly population: number;
  readonly workingAgePopulation: number;
  readonly employedWorkers: number;
  /** Household cash stock across the country's population blocks. */
  readonly householdCashRUSD: number;
  /**
   * Estimated daily wage obligation/taxable wage base from current employment
   * at base wages. It is a current-base static estimate, not realized wages.
   */
  readonly estimatedDailyWageBaseRUSD: number;
  /**
   * Estimated daily taxable wage base after the current income-tax allowance.
   * Exact for the current policy given the base-wage estimate; not realized
   * wages, and not an exemption estimate for a different allowance.
   */
  readonly estimatedDailyTaxableWageBaseRUSD: number;
  /** Blocks with a positive estimated daily wage base (for allowance estimates). */
  readonly estimatedWageEarningBlockCount: number;
  /** Month-to-date taxable enterprise profit used by the business-tax preview. */
  readonly businessTaxBaseMonthToDateRUSD: number;
  /** Current open-period budget memo (flows so far this month). */
  readonly budgetMonthToDate: SnapshotBudgetMonthToDate;
  /** Population-weighted own-country indicators, 0..1 or 0..99 as named. */
  readonly literacy: number;
  readonly wealthLevel: number;
  readonly militancy: number;
  readonly hardshipPopulationShare: number;
  readonly blocksWithUnmetSubsistence: number;
  readonly blocksWithUnmetBasic: number;
  readonly buildingCount: number;
  /** Estimated capacity for every good in the catalog; zero means no capacity. */
  readonly productionCapacityByGood: readonly SnapshotProductionCapacity[];
  readonly latestFiscal: SnapshotFiscalTotals | null;
  readonly financeHistory: readonly SnapshotFinancePeriod[];
  /** Most recent closed annual reports; older annual summaries remain persisted. */
  readonly annualReports: readonly SnapshotAnnualReport[];
  /** E3 retained construction projects, ascending id. */
  readonly constructionProjects: readonly SnapshotConstructionProject[];
  /** Bounded aggregate of compacted completed/cancelled projects. */
  readonly constructionHistory: SnapshotConstructionHistory;
  /** Current idle construction labor and wage estimate. */
  readonly constructionLabor: SnapshotConstructionLabor;
  /** Country work-in-progress asset balance (capitalized labor not yet completed). */
  readonly constructionInProgressRUSD: number;
  /** Country capitalized public-capital asset balance. */
  readonly publicCapitalRUSD: number;
  /** E4 industrial policy, month-to-date subsidy outcome, and sector estimates. */
  readonly industrialPolicy: SnapshotIndustrialPolicy;
  /** Existing state-owned enterprises eligible for operating support. */
  readonly publicEnterprises: readonly SnapshotPublicEnterprise[];
  /** M8 political institutions, laws, groups, crisis, and event log. */
  readonly politics: SnapshotPolitics;
  /** M9 technology catalog, research status, and derived effects. */
  readonly technology: SnapshotTechnology;
  /** M9 education institution state and derived service indicators. */
  readonly education: SnapshotEducation;
  /** E5 training/qualification and public-health state. */
  readonly labor: SnapshotLabor;
  /** E6a tariff/quota/restriction policy and month-to-date trade memo. */
  readonly trade: SnapshotTradePolicy;
  /** E6b price-index measurement for this country. */
  readonly priceIndex: SnapshotCountryPriceIndex;
  /** E6b monetary authority, exchange-rate, and convertibility state. */
  readonly monetary: SnapshotMonetaryAuthority;
  /**
   * P5b (plan §11.2): the country's known natural resources by kind: remaining stock of
   * its discovered deposits and the amount extracted from them since 1900.
   */
  readonly resources: readonly {
    readonly resource: string;
    readonly unit: string;
    readonly remaining: number;
    readonly extracted: number;
  }[];
  /**
   * M10 armies and casualties for this country. `deaths` and `captured` are
   * cumulative (authoritative casualty records); `wounded` is the current roster
   * count, not a historical total.
   */
  readonly military: {
    readonly armies: readonly SnapshotArmy[];
    readonly deaths: number;
    readonly wounded: number;
    readonly captured: number;
    readonly relations: readonly SnapshotDiplomaticRelation[];
    readonly occupiedProvinceIds: readonly number[];
    readonly controlledProvinceIds: readonly number[];
  };
}

export interface SnapshotArmy {
  readonly id: number;
  readonly countryId: number;
  readonly provinceId: number;
  readonly personnel: number;
  readonly equipmentUnits: number;
  readonly organization: number;
  readonly supply: number;
  readonly wounded: number;
  readonly deaths: number;
  readonly captured: number;
  readonly readyDay: number;
  readonly destinationProvinceId: number | null;
  readonly arrivalDay: number | null;
}

export interface SnapshotWar {
  readonly id: number;
  readonly attackerCountryId: number;
  readonly defenderCountryId: number;
  readonly casusBelli: string;
  readonly startedDay: number;
  readonly endedDay: number | null;
  readonly truceUntilDay: number | null;
  readonly attackerPersonnel: number;
  readonly defenderPersonnel: number;
}

export interface SnapshotPeaceOffer {
  readonly id: number;
  readonly warId: number;
  readonly fromCountryId: number;
  readonly toCountryId: number;
  readonly terms: string;
  readonly proposedDay: number;
}

export interface SnapshotDiplomaticRelation {
  readonly countryId: number;
  readonly score: number;
  readonly truceUntilDay: number | null;
  readonly atWar: boolean;
  readonly warId: number | null;
}

export interface SnapshotOccupation {
  readonly provinceId: number;
  readonly sovereignCountryId: number | null;
  readonly controllerCountryId: number | null;
  readonly occupiedSinceDay: number | null;
}

/**
 * P2 population, economic and social state of one province (D-118). The legal owner
 * is `countryId`; `controllerCountryId` is set only while another country controls
 * the province (an occupation or an administration such as Cuba in 1900).
 */
/**
 * P4 (D-142) current demography of a province or country: rates implied by today's
 * levels and age structure (per 1,000 people per year), period TFR and life
 * expectancy, and the population-weighted causes the player can act on.
 */
export interface DemographyIndicatorsSnapshot {
  readonly crudeBirthRate: number;
  readonly crudeDeathRate: number;
  readonly totalFertility: number;
  readonly lifeExpectancy: number;
  readonly under5MortalityPer1000: number;
  readonly urbanShare: number;
  readonly femaleLiteracy: number;
  readonly foodSufficiency: number;
}

/** P4 population pyramid: people in the 17 five-year bands (0-4 ... 80+) by sex. */
export interface PopulationPyramidSnapshot {
  readonly male: readonly number[];
  readonly female: readonly number[];
}

/** P4 one closed civil year of a country's realised births and deaths. */
export interface DemographyYearSnapshot {
  readonly year: number;
  readonly populationStart: number;
  readonly populationEnd: number;
  readonly births: number;
  readonly deaths: number;
  /** Realised births and deaths per 1,000 mean population per year. */
  readonly crudeBirthRate: number;
  readonly crudeDeathRate: number;
  readonly totalFertility: number;
  readonly lifeExpectancy: number;
  readonly under5MortalityPer1000: number;
  readonly urbanShare: number;
}

/** P4 the country-level causes behind the levels (D-142). */
export interface DemographyCausesSnapshot {
  /** Combined health factor H (1 = none; lower = fewer deaths). */
  readonly healthFactor: number;
  /** Sanitation knowledge from research, 0..1. */
  readonly sanitationKnowledge: number;
  /** Public-health service output (staffing x quality), 0..1. */
  readonly healthServiceOutput: number;
  /** Realised sanitation coverage = knowledge x service, 0..1. */
  readonly sanitationCoverage: number;
  /** Fractional fertility reduction from contraception research. */
  readonly contraception: number;
}

/**
 * P4 (D-142) the focused province's demography: current rates and causes (null
 * without people) and its pyramid. One province per snapshot keeps the message small.
 */
export interface FocusProvinceSnapshot {
  readonly provinceId: number;
  readonly demography: DemographyIndicatorsSnapshot | null;
  readonly pyramid: PopulationPyramidSnapshot;
  /** P5 (D-143): land, today's harvest and own consumption, and known deposits. */
  readonly land: ProvinceLandSnapshot | null;
}

/** P5: one good's quantity today, physical units of the good. */
export interface GoodQuantitySnapshot {
  readonly goodId: number;
  readonly quantity: number;
}

/** P5: a discovered deposit of the focused province (hidden deposits are never sent). */
export interface DepositSnapshot {
  readonly resource: string;
  /** Unit of the stock (t, kg, m3, ...). */
  readonly unit: string;
  readonly remaining: number;
  readonly initialStock: number;
  /** Extraction quality, 0..1. */
  readonly quality: number;
  /** Day it was found; null when known in 1900. */
  readonly discoveredOnDay: number | null;
}

/** P5 (D-143): the focused province's land, harvest, own consumption and deposits. */
export interface ProvinceLandSnapshot {
  readonly croplandHa: number;
  readonly pastureHa: number;
  readonly harvestYear: number;
  /** This year's harvest weather factor, mean 1. */
  readonly harvestFactor: number;
  /** Land-using buildings (farms and ranches) and their levels. */
  readonly farms: number;
  readonly farmLevels: number;
  /** Workers on cropland farms per hectare of cropland. */
  readonly workersPerCroplandHa: number;
  /** Food the province's farms make today (kept plus marketed), by good. */
  readonly farmOutputToday: readonly GoodQuantitySnapshot[];
  /** Of it, kept by the owner households before the market, by good. */
  readonly keptToday: readonly GoodQuantitySnapshot[];
  readonly deposits: readonly DepositSnapshot[];
}

export interface CountryDemographySnapshot {
  readonly current: DemographyIndicatorsSnapshot;
  readonly pyramid: PopulationPyramidSnapshot;
  readonly causes: DemographyCausesSnapshot;
  /** Realised births and deaths of the current civil year so far; null before the first day. */
  readonly yearToDate: {
    readonly year: number;
    readonly births: number;
    readonly deaths: number;
    readonly days: number;
  } | null;
  /** Closed years, oldest first. */
  readonly history: readonly DemographyYearSnapshot[];
}

export interface ProvinceEconomySnapshot {
  readonly id: number;
  /** Owner country (simulation country), or null. */
  readonly countryId: number | null;
  /** Customs territory (market) of the province. */
  readonly marketId: number | null;
  readonly population: number;
  /** Population of each profession, by profession id (absent when zero). */
  readonly populationByProfession: Readonly<Record<string, number>>;
  readonly buildingCount: number;
  /** Total building levels (capacity) in the province. */
  readonly buildingLevels: number;
  /** Workers employed in the province's buildings. */
  readonly employedWorkers: number;
  /** M8 provincial militancy aggregate and provisional infrastructure quality. */
  readonly unrest: number;
  readonly infrastructure: number;
  /** Current urban share of the province's people, 0..1 (HYDE 3.3 in 1900; P4 block state). */
  readonly urbanShare: number;
  readonly arableLandHa: number;
  readonly pastureHa: number;
  /** Population-weighted literacy of ages 15+. */
  readonly literacy: number;
  /** Controller when it differs from the owner; null when the owner controls it. */
  readonly controllerCountryId: number | null;
  readonly controlledSinceDay: number | null;
  /** Dependent territory the province belongs to; null for a home province. */
  readonly territoryTag: string | null;
  /**
   * P5 (D-143 §3): this calendar year's harvest weather factor (mean 1), rounded to
   * 0.01; null for a province with no cropland or grazing land.
   */
  readonly harvestFactor: number | null;
}

/**
 * Mutable M12a political state of one permanent province.
 *
 * Static province metadata (historical name, grouping, geometry) is committed
 * app content; the snapshot carries only the political facts that can change.
 */
export interface ProvinceOwnershipSnapshot {
  readonly provinceId: number;
  readonly ownerPolityId: number;
  readonly controllerPolityId: number;
  readonly controlledSinceDay: number | null;
  readonly claimantPolityIds: readonly number[];
  readonly specialStatus: string;
}

/**
 * P5 (D-143): province ownership as columns. Row i is province `ids[i]` (ascending)
 * owned by `owners[i]`; a province whose control, claims or status differ from the
 * defaults (controlled by its owner, unclaimed, ordinary) is listed whole in
 * `exceptions`. Repeating six fields for 1,689 provinces took a third of the snapshot.
 * Read rows with `provinceOwnershipRows`.
 */
export interface ProvinceOwnershipTable {
  readonly ids: readonly number[];
  readonly owners: readonly number[];
  readonly exceptions: readonly ProvinceOwnershipSnapshot[];
}

function isDefaultOwnership(row: ProvinceOwnershipSnapshot): boolean {
  return (
    row.controllerPolityId === row.ownerPolityId &&
    row.controlledSinceDay === null &&
    row.claimantPolityIds.length === 0 &&
    row.specialStatus === "ordinary"
  );
}

/** Encode ownership rows (ascending by province id) as a column table. */
export function encodeProvinceOwnershipTable(rows: readonly ProvinceOwnershipSnapshot[]): ProvinceOwnershipTable {
  return {
    ids: rows.map((row) => row.provinceId),
    owners: rows.map((row) => row.ownerPolityId),
    exceptions: rows.filter((row) => !isDefaultOwnership(row)),
  };
}

const ownershipRowsCache = new WeakMap<ProvinceOwnershipTable, readonly ProvinceOwnershipSnapshot[]>();

/** Province ownership rows of a snapshot, decoded once per table (presentation cache). */
export function provinceOwnershipRows(
  snapshot: Pick<SimulationSnapshot, "provinceOwnership">,
): readonly ProvinceOwnershipSnapshot[] {
  const table = snapshot.provinceOwnership;
  const cached = ownershipRowsCache.get(table);
  if (cached !== undefined) return cached;
  const exceptions = new Map(table.exceptions.map((row) => [row.provinceId, row] as const));
  const rows = table.ids.map(
    (id, index): ProvinceOwnershipSnapshot =>
      exceptions.get(id) ??
      Object.freeze({
        provinceId: id,
        ownerPolityId: table.owners[index] ?? 0,
        controllerPolityId: table.owners[index] ?? 0,
        controlledSinceDay: null,
        claimantPolityIds: Object.freeze([]) as readonly number[],
        specialStatus: "ordinary",
      }),
  );
  Object.freeze(rows);
  ownershipRowsCache.set(table, rows);
  return rows;
}


export interface ProfessionSnapshot {
  readonly id: number;
  readonly key: string;
  readonly name: string;
}

export interface GoodSnapshot {
  readonly id: number;
  readonly key: string;
  readonly name: string;
  readonly unitLabel: string;
  readonly category: string;
  /** P5b: catalogue heading (one of eight), or null for legacy definitions. */
  readonly group: string | null;
  /** P5b: false for electricity and services. */
  readonly storable: boolean;
  /** P5b: false for goods never shipped between markets. */
  readonly tradeable: boolean;
}

/**
 * Protocol 22 (plan §6): a compact price row. The good's key, name and unit are in
 * `snapshot.goods`; a market in `full` detail lists only the goods present there (stock
 * or production capacity), the others are "not traded here".
 */
export interface MarketPriceSnapshot {
  readonly goodId: number;
  readonly priceRUSD: number;
  readonly stockQuantity: number;
  /** Estimated daily output capacity of buildings in this market, not demand. */
  readonly dailyProductionCapacity: number;
}

export interface MarketSnapshot {
  readonly id: number;
  /** Player-facing market name. Never the bare numeric id. */
  readonly label: string;
  readonly name: string;
  readonly description: string;
  readonly kind: "national" | "imperial" | "shared" | "unspecified";
  readonly provinceIds: readonly number[];
  /** Countries with at least one province in this market, ascending. */
  readonly memberCountryIds: readonly number[];
  /**
   * Protocol 22: `full` for the player's markets, the focus country's and the focused
   * market (`SET_MARKET_FOCUS`); `summary` markets carry no prices.
   */
  readonly detail: "full" | "summary";
  readonly prices: readonly MarketPriceSnapshot[];
  /** E6a customs administration of this market, or null. */
  readonly customsCountryId: number | null;
  /** Derived mean infrastructure quality of the market's provinces, 0..1. */
  readonly infrastructure: number;
}

export interface SnapshotDiagnostics {
  readonly invalidActionCount: number;
  readonly invariantFailureCount: number;
  readonly recentWarnings: readonly string[];
}

/** The complete immutable UI snapshot. It contains no live world references. */
export interface SimulationSnapshot {
  readonly protocolVersion: typeof PROTOCOL_VERSION;
  readonly sequence: number;
  readonly dayIndex: number;
  readonly date: SnapshotCivilDate;
  readonly running: boolean;
  readonly speedDaysPerSecond: number;
  /**
   * Measured recent throughput. It is presentation-only: it is derived from the
   * worker clock and never affects deterministic simulation state. Zero while
   * paused or before the first measured window.
   */
  readonly achievedDaysPerSecond: number;
  /** True because the selected speed is a target, not a guaranteed rate. */
  readonly speedIsBestEffort: boolean;
  readonly campaignComplete: boolean;
  readonly scenarioId: string;
  readonly dataVersion: string;
  readonly simVersion: string;
  /** Designated player country, or null when no player control is configured. */
  readonly playerCountryId: number | null;
  /** Presentation focus country whose full record is included; null when none. */
  readonly focusCountryId: number | null;
  /**
   * P4 (D-142) presentation focus province and its population pyramid; null when no
   * province is focused. Only one province's pyramid travels per snapshot.
   */
  readonly focusProvince: FocusProvinceSnapshot | null;
  /** State-enterprise ownership/remittance policy required by public construction. */
  readonly constructionEnabled: boolean;
  /** Full detail for the player country and the focused country only. */
  readonly countries: readonly CountrySnapshot[];
  /** Compact record for every country in the world. */
  readonly countrySummaries: readonly CountrySummarySnapshot[];
  /** P2 per-province population and economy as columns (D-118); see `provinceEconomyRows`. */
  readonly provinceTable: ProvinceEconomyTable;
  /** P2 dependent territories (static), ascending by polity tag. */
  readonly territories: readonly TerritorySnapshot[];
  /** M12a permanent provincial ownership and effective control, ascending by id. */
  /** M12a permanent provincial ownership and control (P5: as columns); see `provinceOwnershipRows`. */
  readonly provinceOwnership: ProvinceOwnershipTable;
  readonly markets: readonly MarketSnapshot[];
  readonly goods: readonly GoodSnapshot[];
  /** P2 profession names, for per-province population (static). */
  readonly professions: readonly ProfessionSnapshot[];
  /** Static authored need tiers, used for evidence-based diagnosis. */
  readonly needTiers: readonly SnapshotNeedTier[];
  /** Validated buildable public-construction project types. */
  readonly projectTypes: readonly SnapshotProjectType[];
  /** M9 technology era names, indexed from era 1. Empty when technology is disabled. */
  readonly technologyEraNames: readonly string[];
  /** M9 validated technology catalog; sent once, not per country. */
  readonly technologyCatalog: readonly SnapshotTechnologyCatalogEntry[];
  /** E6a transport routes, in-transit consignments, and last-day outcome. */
  readonly trade: SnapshotTradeNetwork;
  /** E6b world price-index definition and measurement. */
  readonly priceIndex: SnapshotPriceIndex;
  /** E6b currency identities and authoritative RUSD valuations. */
  readonly currencies: readonly SnapshotCurrency[];
  /** P3 (D-141) month-end and annual valuations for converting history at its own rate. */
  readonly valuationHistory: SnapshotValuationHistory;
  /** M10 wars, pending peace offers, and the enabled flag. */
  readonly military: {
    readonly enabled: boolean;
    readonly wars: readonly SnapshotWar[];
    readonly peaceOffers: readonly SnapshotPeaceOffer[];
    readonly armies: readonly SnapshotArmy[];
    readonly occupations: readonly SnapshotOccupation[];
  };
  readonly diagnostics: SnapshotDiagnostics;
}

export type WorkerEvent =
  | { readonly protocolVersion: typeof PROTOCOL_VERSION; readonly type: "READY"; readonly snapshot: SimulationSnapshot }
  | {
      readonly protocolVersion: typeof PROTOCOL_VERSION;
      readonly type: "SNAPSHOT";
      readonly commandId: string | null;
      readonly snapshot: SimulationSnapshot;
    }
  | {
      readonly protocolVersion: typeof PROTOCOL_VERSION;
      readonly type: "STATE";
      readonly commandId: string | null;
      readonly running: boolean;
      readonly speedDaysPerSecond: number;
      readonly achievedDaysPerSecond: number;
    }
  | {
      readonly protocolVersion: typeof PROTOCOL_VERSION;
      readonly type: "ACTION_RESULT";
      readonly commandId: string;
      readonly actionId: string;
      readonly accepted: boolean;
      readonly errors: readonly string[];
      readonly snapshot: SimulationSnapshot;
    }
  | {
      readonly protocolVersion: typeof PROTOCOL_VERSION;
      readonly type: "SAVE_RESULT";
      readonly commandId: string;
      readonly save: string;
    }
  | {
      readonly protocolVersion: typeof PROTOCOL_VERSION;
      readonly type: "LOAD_RESULT";
      readonly commandId: string;
      readonly accepted: boolean;
      readonly errors: readonly string[];
      readonly snapshot: SimulationSnapshot;
    }
  | {
      readonly protocolVersion: typeof PROTOCOL_VERSION;
      readonly type: "SAVE_PREVIEW";
      readonly commandId: string;
      readonly accepted: boolean;
      readonly errors: readonly string[];
      /** The saved world as it would load; null when the save was rejected. */
      readonly snapshot: SimulationSnapshot | null;
    }
  | {
      readonly protocolVersion: typeof PROTOCOL_VERSION;
      readonly type: "NEW_GAME_RESULT";
      readonly commandId: string;
      readonly accepted: boolean;
      readonly errors: readonly string[];
      readonly snapshot: SimulationSnapshot;
    }
  | {
      readonly protocolVersion: typeof PROTOCOL_VERSION;
      readonly type: "ERROR";
      readonly commandId: string | null;
      readonly code: string;
      readonly message: string;
    }
  | { readonly protocolVersion: typeof PROTOCOL_VERSION; readonly type: "FATAL"; readonly message: string }
  | {
      readonly protocolVersion: typeof PROTOCOL_VERSION;
      readonly type: "SHUTDOWN";
      readonly commandId: string | null;
    };

export class ProtocolError extends Error {
  public readonly code: string;

  public constructor(code: string, message: string) {
    super(message);
    this.name = "ProtocolError";
    this.code = code;
  }
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ProtocolError("invalid_message", `${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireString(
  value: unknown,
  path: string,
  options: { readonly minLength?: number; readonly maxLength?: number } = {},
): string {
  if (typeof value !== "string") {
    throw new ProtocolError("invalid_message", `${path} must be a string`);
  }
  const min = options.minLength ?? 0;
  const max = options.maxLength ?? MAX_PROTOCOL_ID_LENGTH;
  if (value.length < min || value.length > max) {
    throw new ProtocolError(
      "invalid_message",
      `${path} length must be in ${String(min)}..${String(max)}`,
    );
  }
  return value;
}

function requireFiniteNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ProtocolError("invalid_message", `${path} must be a finite number`);
  }
  return value;
}

/** Bounded array guard for action payload arrays (E6a trade policy). */
function requireActionArray(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new ProtocolError("invalid_action", `${path} must be an array`);
  }
  if (value.length > 256) {
    throw new ProtocolError("invalid_action", `${path} must contain at most 256 entries`);
  }
  return value;
}

function requireUint32(value: unknown, path: string): number {
  return requireInteger(value, path, 0, 0xffff_ffff);
}

function requireInteger(
  value: unknown,
  path: string,
  min: number,
  max: number,
): number {
  const number = requireFiniteNumber(value, path);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new ProtocolError(
      "invalid_message",
      `${path} must be an integer in ${String(min)}..${String(max)}`,
    );
  }
  return number;
}

function parseAction(value: unknown): CountryActionDto {
  const record = requireRecord(value, "command.action");
  const countryId = requireInteger(record.countryId, "command.action.countryId", 0, 0xffff_ffff);
  const kind = record.kind;
  if (kind === "set-fiscal-policy") {
    const incomeTaxRate = requireFiniteNumber(
      record.incomeTaxRate,
      "command.action.incomeTaxRate",
    );
    if (incomeTaxRate < 0 || incomeTaxRate > 1) {
      throw new ProtocolError("invalid_action", "command.action.incomeTaxRate must be in 0..1");
    }
    const businessProfitTaxRate = requireFiniteNumber(
      record.businessProfitTaxRate,
      "command.action.businessProfitTaxRate",
    );
    if (businessProfitTaxRate < 0 || businessProfitTaxRate > 1) {
      throw new ProtocolError(
        "invalid_action",
        "command.action.businessProfitTaxRate must be in 0..1",
      );
    }
    const incomeTaxAllowanceRUSDPerYear = requireFiniteNumber(
      record.incomeTaxAllowanceRUSDPerYear,
      "command.action.incomeTaxAllowanceRUSDPerYear",
    );
    if (incomeTaxAllowanceRUSDPerYear < 0) {
      throw new ProtocolError(
        "invalid_action",
        "command.action.incomeTaxAllowanceRUSDPerYear must be non-negative",
      );
    }
    const welfareBudgetRUSDPerYear = requireFiniteNumber(
      record.welfareBudgetRUSDPerYear,
      "command.action.welfareBudgetRUSDPerYear",
    );
    if (welfareBudgetRUSDPerYear < 0) {
      throw new ProtocolError(
        "invalid_action",
        "command.action.welfareBudgetRUSDPerYear must be non-negative",
      );
    }
    const welfareMaxWealthLevel = requireInteger(
      record.welfareMaxWealthLevel,
      "command.action.welfareMaxWealthLevel",
      0,
      99,
    );
    const reserveTargetRUSD = requireFiniteNumber(
      record.reserveTargetRUSD,
      "command.action.reserveTargetRUSD",
    );
    if (reserveTargetRUSD < 0) {
      throw new ProtocolError(
        "invalid_action",
        "command.action.reserveTargetRUSD must be non-negative",
      );
    }
    return {
      kind: "set-fiscal-policy",
      countryId,
      incomeTaxRate,
      incomeTaxAllowanceRUSDPerYear,
      welfareBudgetRUSDPerYear,
      welfareMaxWealthLevel,
      businessProfitTaxRate,
      reserveTargetRUSD,
    };
  }
  if (kind === "issue-debt") {
    const amountRUSD = requireFiniteNumber(record.amountRUSD, "command.action.amountRUSD");
    if (!(amountRUSD > 0)) {
      throw new ProtocolError("invalid_action", "command.action.amountRUSD must be positive");
    }
    return { kind: "issue-debt", countryId, amountRUSD };
  }
  if (kind === "repay-debt") {
    const contractId = requireInteger(
      record.contractId,
      "command.action.contractId",
      0,
      0xffff_ffff,
    );
    const amountRUSD = requireFiniteNumber(record.amountRUSD, "command.action.amountRUSD");
    if (!(amountRUSD > 0)) {
      throw new ProtocolError("invalid_action", "command.action.amountRUSD must be positive");
    }
    return { kind: "repay-debt", countryId, contractId, amountRUSD };
  }
  if (kind === "set-debt-policy") {
    if (typeof record.refinanceOnMaturity !== "boolean") {
      throw new ProtocolError(
        "invalid_action",
        "command.action.refinanceOnMaturity must be a boolean",
      );
    }
    const maxOutstandingPrincipalRUSD = requireFiniteNumber(
      record.maxOutstandingPrincipalRUSD,
      "command.action.maxOutstandingPrincipalRUSD",
    );
    if (maxOutstandingPrincipalRUSD < 0) {
      throw new ProtocolError(
        "invalid_action",
        "command.action.maxOutstandingPrincipalRUSD must be non-negative",
      );
    }
    return {
      kind: "set-debt-policy",
      countryId,
      refinanceOnMaturity: record.refinanceOnMaturity,
      maxOutstandingPrincipalRUSD,
    };
  }
  if (kind === "start-construction") {
    return {
      kind: "start-construction",
      countryId,
      provinceId: requireInteger(
        record.provinceId,
        "command.action.provinceId",
        0,
        0xffff_ffff,
      ),
      definitionId: requireInteger(
        record.definitionId,
        "command.action.definitionId",
        0,
        0xffff_ffff,
      ),
    };
  }
  if (kind === "cancel-construction") {
    return {
      kind: "cancel-construction",
      countryId,
      projectId: requireInteger(
        record.projectId,
        "command.action.projectId",
        1,
        0xffff_ffff,
      ),
    };
  }
  if (kind === "set-construction-paused") {
    if (typeof record.paused !== "boolean") {
      throw new ProtocolError(
        "invalid_action",
        "command.action.paused must be a boolean",
      );
    }
    return {
      kind: "set-construction-paused",
      countryId,
      projectId: requireInteger(
        record.projectId,
        "command.action.projectId",
        1,
        0xffff_ffff,
      ),
      paused: record.paused,
    };
  }
  if (kind === "set-industrial-policy") {
    if (!Array.isArray(record.sectorSubsidyRates)) {
      throw new ProtocolError(
        "invalid_action",
        "command.action.sectorSubsidyRates must be an array",
      );
    }
    if (record.sectorSubsidyRates.length !== SNAPSHOT_SECTOR_COUNT) {
      throw new ProtocolError(
        "invalid_action",
        `command.action.sectorSubsidyRates must contain ${String(SNAPSHOT_SECTOR_COUNT)} entries`,
      );
    }
    const rates: number[] = [];
    for (let index = 0; index < record.sectorSubsidyRates.length; index += 1) {
      const rate = requireFiniteNumber(
        record.sectorSubsidyRates[index],
        `command.action.sectorSubsidyRates[${String(index)}]`,
      );
      if (rate < 0 || rate > 1) {
        throw new ProtocolError(
          "invalid_action",
          `command.action.sectorSubsidyRates[${String(index)}] must be in 0..1`,
        );
      }
      rates.push(rate);
    }
    return { kind: "set-industrial-policy", countryId, sectorSubsidyRates: rates };
  }
  if (kind === "support-public-enterprise") {
    const amountRUSD = requireFiniteNumber(
      record.amountRUSD,
      "command.action.amountRUSD",
    );
    if (!(amountRUSD > 0)) {
      throw new ProtocolError(
        "invalid_action",
        "command.action.amountRUSD must be positive",
      );
    }
    return {
      kind: "support-public-enterprise",
      countryId,
      buildingId: requireInteger(
        record.buildingId,
        "command.action.buildingId",
        0,
        0xffff_ffff,
      ),
      amountRUSD,
    };
  }
  if (kind === "propose-law") {
    return {
      kind: "propose-law",
      countryId,
      lawId: requireInteger(record.lawId, "command.action.lawId", 1, 0xffff_ffff),
    };
  }
  if (kind === "set-institution-funding") {
    const annualRUSD = requireFiniteNumber(
      record.annualRUSD,
      "command.action.annualRUSD",
    );
    if (annualRUSD < 0) {
      throw new ProtocolError(
        "invalid_action",
        "command.action.annualRUSD must be non-negative",
      );
    }
    return { kind: "set-institution-funding", countryId, annualRUSD };
  }
  if (kind === "start-research") {
    return {
      kind: "start-research",
      countryId,
      technologyId: requireInteger(
        record.technologyId,
        "command.action.technologyId",
        0,
        0xffff_ffff,
      ),
    };
  }
  if (kind === "cancel-research") {
    return { kind: "cancel-research", countryId };
  }
  if (kind === "set-education-funding") {
    const annualRUSD = requireFiniteNumber(
      record.annualRUSD,
      "command.action.annualRUSD",
    );
    if (annualRUSD < 0) {
      throw new ProtocolError(
        "invalid_action",
        "command.action.annualRUSD must be non-negative",
      );
    }
    return { kind: "set-education-funding", countryId, annualRUSD };
  }
  if (kind === "set-research-staff-share") {
    const share = requireFiniteNumber(record.share, "command.action.share");
    if (share < 0 || share > 1) {
      throw new ProtocolError(
        "invalid_action",
        "command.action.share must be in 0..1",
      );
    }
    return { kind: "set-research-staff-share", countryId, share };
  }
  if (kind === "set-training-budget" || kind === "set-training-stipend") {
    const annualRUSD = requireFiniteNumber(
      record.annualRUSD,
      "command.action.annualRUSD",
    );
    if (annualRUSD < 0) {
      throw new ProtocolError(
        "invalid_action",
        "command.action.annualRUSD must be non-negative",
      );
    }
    return { kind, countryId, annualRUSD };
  }
  if (
    kind === "set-training-staff-share" ||
    kind === "set-health-staff-share"
  ) {
    const share = requireFiniteNumber(record.share, "command.action.share");
    if (share < 0 || share > 1) {
      throw new ProtocolError(
        "invalid_action",
        "command.action.share must be in 0..1",
      );
    }
    return { kind, countryId, share };
  }
  if (kind === "set-trade-policy") {
    const rawRates = requireActionArray(record.tariffRates, "command.action.tariffRates");
    const tariffRates: number[] = [];
    for (let index = 0; index < rawRates.length; index += 1) {
      const rate = requireFiniteNumber(
        rawRates[index],
        `command.action.tariffRates[${String(index)}]`,
      );
      if (rate < 0 || rate > 1) {
        throw new ProtocolError(
          "invalid_action",
          `command.action.tariffRates[${String(index)}] must be in 0..1`,
        );
      }
      tariffRates.push(rate);
    }
    const rawQuotas = requireActionArray(record.importQuotaQuantity, "command.action.importQuotaQuantity");
    const importQuotaQuantity: (number | null)[] = [];
    for (let index = 0; index < rawQuotas.length; index += 1) {
      const value = rawQuotas[index];
      if (value === null || value === undefined) {
        importQuotaQuantity.push(null);
        continue;
      }
      const quota = requireFiniteNumber(
        value,
        `command.action.importQuotaQuantity[${String(index)}]`,
      );
      if (quota < 0) {
        throw new ProtocolError(
          "invalid_action",
          `command.action.importQuotaQuantity[${String(index)}] must be non-negative or null`,
        );
      }
      importQuotaQuantity.push(quota);
    }
    const rawRestricted = requireActionArray(record.exportRestricted, "command.action.exportRestricted");
    const exportRestricted: boolean[] = [];
    for (let index = 0; index < rawRestricted.length; index += 1) {
      const value = rawRestricted[index];
      if (typeof value !== "boolean") {
        throw new ProtocolError(
          "invalid_action",
          `command.action.exportRestricted[${String(index)}] must be a boolean`,
        );
      }
      exportRestricted.push(value);
    }
    if (
      tariffRates.length !== importQuotaQuantity.length ||
      tariffRates.length !== exportRestricted.length
    ) {
      throw new ProtocolError(
        "invalid_action",
        "command.action trade arrays must all have the same length",
      );
    }
    return {
      kind: "set-trade-policy",
      countryId,
      tariffRates,
      importQuotaQuantity,
      exportRestricted,
    };
  }
  if (kind === "adopt-currency") {
    return {
      kind: "adopt-currency",
      countryId,
      currencyId: requireInteger(record.currencyId, "command.action.currencyId", 0, 0xffff_ffff),
    };
  }
  if (kind === "establish-currency") {
    const standard = requireString(record.standard, "command.action.standard");
    if (standard !== "gold" && standard !== "silver" && standard !== "paper") {
      throw new ProtocolError("invalid_action", 'command.action.standard must be "gold", "silver" or "paper"');
    }
    let name: string | null = null;
    if (record.name !== null && record.name !== undefined) {
      name = requireString(record.name, "command.action.name");
      if (name.trim().length === 0 || name.length > 64) {
        throw new ProtocolError("invalid_action", "command.action.name must be 1 to 64 characters");
      }
    }
    const reserveFundingRUSD = requireFiniteNumber(record.reserveFundingRUSD, "command.action.reserveFundingRUSD");
    if (reserveFundingRUSD < 0) {
      throw new ProtocolError("invalid_action", "command.action.reserveFundingRUSD must be non-negative");
    }
    return { kind: "establish-currency", countryId, standard, name, reserveFundingRUSD };
  }
  if (kind === "set-monetary-policy") {
    const regime = requireString(record.regime, "command.action.regime");
    if (regime !== "pegged" && regime !== "managed") {
      throw new ProtocolError(
        "invalid_action",
        'command.action.regime must be "pegged" or "managed"',
      );
    }
    let parityRusdPerUnit: number | null = null;
    if (record.parityRusdPerUnit !== null && record.parityRusdPerUnit !== undefined) {
      parityRusdPerUnit = requireFiniteNumber(
        record.parityRusdPerUnit,
        "command.action.parityRusdPerUnit",
      );
      if (!(parityRusdPerUnit > 0)) {
        throw new ProtocolError(
          "invalid_action",
          "command.action.parityRusdPerUnit must be positive or null",
        );
      }
    }
    const reserveTransferRUSD = requireFiniteNumber(
      record.reserveTransferRUSD,
      "command.action.reserveTransferRUSD",
    );
    const currencyConversionRUSD = requireFiniteNumber(
      record.currencyConversionRUSD,
      "command.action.currencyConversionRUSD",
    );
    return {
      kind: "set-monetary-policy",
      countryId,
      regime,
      parityRusdPerUnit,
      reserveTransferRUSD,
      currencyConversionRUSD,
    };
  }
  if (kind === "declare-war") {
    const targetCountryId = requireUint32(
      record.targetCountryId,
      "command.action.targetCountryId",
    );
    const casusBelli = requireString(record.casusBelli, "command.action.casusBelli");
    if (
      casusBelli !== "border-dispute" &&
      casusBelli !== "trade-dispute" &&
      casusBelli !== "alliance-obligation"
    ) {
      throw new ProtocolError("invalid_action", "command.action.casusBelli is invalid");
    }
    return { kind, countryId, targetCountryId, casusBelli };
  }
  if (kind === "offer-peace") {
    const warId = requireUint32(record.warId, "command.action.warId");
    const terms = requireString(record.terms, "command.action.terms");
    if (terms !== "white-peace" && terms !== "cede-occupied") {
      throw new ProtocolError("invalid_action", "command.action.terms is invalid");
    }
    return { kind, countryId, warId, terms };
  }
  if (kind === "accept-peace") {
    return {
      kind,
      countryId,
      warId: requireUint32(record.warId, "command.action.warId"),
      offerId: requireUint32(record.offerId, "command.action.offerId"),
    };
  }
  if (kind === "recruit-army") {
    const provinceId = requireUint32(record.provinceId, "command.action.provinceId");
    const personnel = requireInteger(
      record.personnel,
      "command.action.personnel",
      1,
      0xffff_ffff,
    );
    let equipmentUnits: number | undefined;
    if (record.equipmentUnits !== undefined && record.equipmentUnits !== null) {
      equipmentUnits = requireInteger(
        record.equipmentUnits,
        "command.action.equipmentUnits",
        0,
        0xffff_ffff,
      );
    }
    if (equipmentUnits === undefined) {
      return { kind, countryId, provinceId, personnel };
    }
    return { kind, countryId, provinceId, personnel, equipmentUnits };
  }
  if (kind === "deploy-army") {
    return {
      kind,
      countryId,
      armyId: requireUint32(record.armyId, "command.action.armyId"),
      targetProvinceId: requireUint32(record.targetProvinceId, "command.action.targetProvinceId"),
    };
  }
  throw new ProtocolError("invalid_action", "command.action.kind is not supported");
}

function isSpeed(value: number): value is SpeedDaysPerSecond {
  return (SPEED_VALUES as readonly number[]).includes(value);
}

/** Parse and validate an untrusted worker command. */
export function parseWorkerCommand(value: unknown): WorkerCommand {
  const record = requireRecord(value, "command");
  if (record.protocolVersion !== PROTOCOL_VERSION) {
    throw new ProtocolError(
      "unsupported_protocol",
      `unsupported protocol version ${String(record.protocolVersion)}; expected ${String(PROTOCOL_VERSION)}`,
    );
  }
  const type = requireString(record.type, "command.type", { minLength: 1, maxLength: 32 });
  const commandId = requireString(record.commandId, "command.commandId", {
    minLength: 1,
    maxLength: MAX_PROTOCOL_ID_LENGTH,
  });
  switch (type) {
    case "START":
      return { protocolVersion: PROTOCOL_VERSION, type, commandId };
    case "PAUSE":
      return { protocolVersion: PROTOCOL_VERSION, type, commandId };
    case "REQUEST_SNAPSHOT":
      return { protocolVersion: PROTOCOL_VERSION, type, commandId };
    case "SHUTDOWN":
      return { protocolVersion: PROTOCOL_VERSION, type, commandId };
    case "STEP":
      return {
        protocolVersion: PROTOCOL_VERSION,
        type,
        commandId,
        ticks: requireInteger(record.ticks, "command.ticks", 1, MAX_STEP_TICKS),
      };
    case "SET_SPEED": {
      const daysPerSecond = requireFiniteNumber(
        record.daysPerSecond,
        "command.daysPerSecond",
      );
      if (!isSpeed(daysPerSecond)) {
        throw new ProtocolError(
          "invalid_speed",
          `command.daysPerSecond must be one of ${SPEED_VALUES.join(", ")}`,
        );
      }
      return { protocolVersion: PROTOCOL_VERSION, type, commandId, daysPerSecond };
    }
    case "APPLY_ACTION": {
      const actionId = requireString(record.actionId, "command.actionId", {
        minLength: 1,
        maxLength: MAX_PROTOCOL_ID_LENGTH,
      });
      return {
        protocolVersion: PROTOCOL_VERSION,
        type,
        commandId,
        actionId,
        action: parseAction(record.action),
      };
    }
    case "SAVE":
      return { protocolVersion: PROTOCOL_VERSION, type, commandId };
    case "CREATE_GAME":
      return {
        protocolVersion: PROTOCOL_VERSION,
        type,
        commandId,
        playerCountryId: requireInteger(
          record.playerCountryId,
          "command.playerCountryId",
          0,
          0xffff_ffff,
        ),
      };
    case "SET_FOCUS":
      return {
        protocolVersion: PROTOCOL_VERSION,
        type,
        commandId,
        countryId: requireInteger(record.countryId, "command.countryId", 0, 0xffff_ffff),
      };
    case "SET_MARKET_FOCUS":
      return {
        protocolVersion: PROTOCOL_VERSION,
        type,
        commandId,
        marketId:
          record.marketId === null
            ? null
            : requireInteger(record.marketId, "command.marketId", 0, 0xffff_ffff),
      };
    case "SET_PROVINCE_FOCUS":
      return {
        protocolVersion: PROTOCOL_VERSION,
        type,
        commandId,
        provinceId:
          record.provinceId === null
            ? null
            : requireInteger(record.provinceId, "command.provinceId", 0, 0xffff_ffff),
      };
    case "LOAD":
    case "PREVIEW_SAVE":
      return {
        protocolVersion: PROTOCOL_VERSION,
        type,
        commandId,
        save: requireString(record.save, "command.save", {
          minLength: 1,
          maxLength: MAX_LOAD_SAVE_LENGTH,
        }),
      };
    default:
      throw new ProtocolError("unknown_command", `unknown command type ${JSON.stringify(type)}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown, maxLength = 512): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isIntegerIn(value: unknown, min: number, max: number): value is number {
  return isFiniteNumber(value) && Number.isInteger(value) && value >= min && value <= max;
}

function isNullableId(value: unknown): value is number | null {
  return value === null || isIntegerIn(value, 0, 0xffff_ffff);
}

function isFiniteNumberArray(value: unknown): value is readonly number[] {
  return Array.isArray(value) && value.every(isFiniteNumber);
}

function isNumberArray(value: unknown): value is readonly number[] {
  return Array.isArray(value) && value.every((entry) => isIntegerIn(entry, 0, 0xffff_ffff));
}

const OPTIONAL_FISCAL_TOTAL_FIELDS = [
  "administrationExpenseRUSD",
  "educationExpenseRUSD",
  "trainingExpenseRUSD",
  "customsDutyRevenueRUSD",
  "militaryExpenseRUSD",
] as const;

function optionalFiscalFieldsAreValid(value: Record<string, unknown>): boolean {
  return OPTIONAL_FISCAL_TOTAL_FIELDS.every(
    (field) => value[field] === undefined || isFiniteNumber(value[field]),
  );
}

function isFiscalTotals(value: unknown): value is SnapshotFiscalTotals {
  if (!isRecord(value)) return false;
  return (
    optionalFiscalFieldsAreValid(value) &&
    isIntegerIn(value.periodStartDay, 0, 36_524) &&
    isIntegerIn(value.periodEndDay, 0, 36_524) &&
    isFiniteNumber(value.incomeTaxRUSD) &&
    isFiniteNumber(value.welfareExpenseRUSD) &&
    isFiniteNumber(value.interestExpenseRUSD) &&
    isFiniteNumber(value.subsidyExpenseRUSD) &&
    isFiniteNumber(value.netFiscalResultRUSD)
  );
}

function isNullableFiniteNumber(value: unknown): value is number | null {
  return value === null || isFiniteNumber(value);
}

const BUDGET_TOTAL_FIELDS = [
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
] as const;

function isBudgetTotals(value: unknown): value is SnapshotBudgetTotals {
  if (!isRecord(value)) return false;
  return BUDGET_TOTAL_FIELDS.every(
    (field) => isFiniteNumber(value[field]) && (value[field] as number) >= 0,
  );
}

function isBudgetMonthToDate(value: unknown): value is SnapshotBudgetMonthToDate {
  if (!isBudgetTotals(value)) return false;
  const record = value as unknown as Record<string, unknown>;
  return isFiniteNumber(record.businessTaxBaseMonthToDateRUSD);
}

function isSnapshotDebtPolicy(value: unknown): value is SnapshotDebtPolicy {
  if (!isRecord(value)) return false;
  if (typeof value.enabled !== "boolean") return false;
  if (typeof value.refinanceOnMaturity !== "boolean") return false;
  for (const field of [
    "maxOutstandingPrincipalRUSD",
    "annualCouponRate",
    "creditorCashRUSD",
    "headroomRUSD",
  ] as const) {
    if (!isFiniteNumber(value[field])) return false;
  }
  if ((value.maxOutstandingPrincipalRUSD as number) < 0) return false;
  if ((value.creditorCashRUSD as number) < 0) return false;
  if ((value.headroomRUSD as number) < 0) return false;
  if ((value.annualCouponRate as number) < 0 || (value.annualCouponRate as number) > 1) {
    return false;
  }
  if (value.creditorKind !== "country" && value.creditorKind !== "popBlock") return false;
  if (!isIntegerIn(value.creditorId, 0, 0xffff_ffff)) return false;
  if (!isString(value.creditorLabel, 256)) return false;
  if (!isIntegerIn(value.termDays, 1, 36_500)) return false;
  if (!isIntegerIn(value.arrearsGraceDays, 0, 3_650)) return false;
  return true;
}

function isSnapshotDebtContract(value: unknown): value is SnapshotDebtContract {
  if (!isRecord(value)) return false;
  if (
    value.status !== "active" &&
    value.status !== "arrears" &&
    value.status !== "repaid" &&
    value.status !== "defaulted"
  ) {
    return false;
  }
  if (value.holderKind !== "country" && value.holderKind !== "popBlock") return false;
  return (
    isIntegerIn(value.id, 0, 0xffff_ffff) &&
    isIntegerIn(value.holderId, 0, 0xffff_ffff) &&
    isString(value.holderLabel, 256) &&
    isFiniteNumber(value.principalRUSD) &&
    isFiniteNumber(value.outstandingPrincipalRUSD) &&
    isFiniteNumber(value.annualCouponRate) &&
    isIntegerIn(value.issueDay, 0, 36_524) &&
    isIntegerIn(value.maturityDay, 0, 36_524) &&
    isFiniteNumber(value.accruedInterestRUSD)
  );
}

function isFinancePeriod(value: unknown): value is SnapshotFinancePeriod {
  if (!isFiscalTotals(value)) return false;
  const record = value as unknown as Record<string, unknown>;
  if (!isFiniteNumber(record.businessTaxRevenueRUSD)) return false;
  if (!isBudgetTotals(record)) return false;
  if (!isRecord(record.grossFlowTotals)) return false;
  if (!Object.values(record.grossFlowTotals).every((entry) => isFiniteNumber(entry))) {
    return false;
  }
  return (
    isString(record.periodStartLabel, 10) &&
    isString(record.periodEndLabel, 10) &&
    isNullableFiniteNumber(record.treasuryCashEndRUSD) &&
    isNullableFiniteNumber(record.debtOutstandingEndRUSD) &&
    isNullableFiniteNumber(record.householdCashEndRUSD)
  );
}

function isProductionCapacity(value: unknown): value is SnapshotProductionCapacity {
  if (!isRecord(value)) return false;
  return (
    isIntegerIn(value.goodId, 0, 0xffff_ffff) &&
    isString(value.goodKey, 64) &&
    isString(value.goodName, 256) &&
    isString(value.unitLabel, 64) &&
    isString(value.category, 64) &&
    isFiniteNumber(value.dailyCapacity) &&
    value.dailyCapacity >= 0
  );
}

function isNeedTier(value: unknown): value is SnapshotNeedTier {
  if (!isRecord(value)) return false;
  if (
    value.tier !== "subsistence" &&
    value.tier !== "basic" &&
    value.tier !== "comfort" &&
    value.tier !== "luxury"
  ) {
    return false;
  }
  if (!Array.isArray(value.goods)) return false;
  return value.goods.every(
    (good) =>
      isRecord(good) &&
      isIntegerIn(good.goodId, 0, 0xffff_ffff) &&
      isString(good.goodKey, 64) &&
      isString(good.goodName, 256) &&
      isString(good.unitLabel, 64),
  );
}

function isAnnualReport(value: unknown): value is SnapshotAnnualReport {
  if (!isRecord(value)) return false;
  if (!isBudgetTotals(value)) return false;
  if (!optionalFiscalFieldsAreValid(value)) return false;
  return (
    isIntegerIn(value.year, 1900, 1999) &&
    isIntegerIn(value.periodStartDay, 0, 36_524) &&
    isIntegerIn(value.periodEndDay, 0, 36_524) &&
    isString(value.periodStartLabel, 10) &&
    isString(value.periodEndLabel, 10) &&
    typeof value.complete === "boolean" &&
    isFiniteNumber(value.incomeTaxRUSD) &&
    isFiniteNumber(value.businessTaxRevenueRUSD) &&
    isFiniteNumber(value.welfareExpenseRUSD) &&
    isFiniteNumber(value.interestExpenseRUSD) &&
    isFiniteNumber(value.subsidyExpenseRUSD) &&
    isFiniteNumber(value.netFiscalResultRUSD) &&
    isFiniteNumber(value.treasuryCashEndRUSD) &&
    isFiniteNumber(value.debtLiabilityEndRUSD) &&
    isFiniteNumber(value.interestPayableEndRUSD) &&
    isIntegerIn(value.correctionCount, 0, 1_000_000)
  );
}

function isProjectOutput(value: unknown): value is SnapshotProjectOutput {
  if (!isRecord(value)) return false;
  return (
    isIntegerIn(value.goodId, 0, 0xffff_ffff) &&
    isString(value.goodKey, 128) &&
    isString(value.goodName, 256) &&
    isString(value.unitLabel, 64) &&
    isFiniteNumber(value.quantityPerThroughputUnit) &&
    isFiniteNumber(value.dailyCapacityAtLevelOne)
  );
}

function isConstructionMaterialRequirement(
  value: unknown,
): value is SnapshotConstructionMaterialRequirement {
  if (!isRecord(value)) return false;
  return (
    isIntegerIn(value.goodId, 0, 0xffff_ffff) &&
    isString(value.goodKey, 128) &&
    isString(value.goodName, 256) &&
    isString(value.unitLabel, 64) &&
    isFiniteNumber(value.quantity)
  );
}

function isProjectType(value: unknown): value is SnapshotProjectType {
  if (!isRecord(value)) return false;
  if (!Array.isArray(value.outputs) || !Array.isArray(value.materials)) return false;
  return (
    isIntegerIn(value.definitionId, 0, 0xffff_ffff) &&
    isString(value.key, 128) &&
    isString(value.name, 256) &&
    isString(value.sector, 64) &&
    isFiniteNumber(value.constructionCostRUSD) &&
    isIntegerIn(value.constructionWorkers, 1, 1_000_000) &&
    isFiniteNumber(value.plannedJobs) &&
    isFiniteNumber(value.dailyUpkeepRUSDAtLevelOne) &&
    isFiniteNumber(value.workingCapitalRUSD) &&
    value.outputs.every((output) => isProjectOutput(output)) &&
    value.materials.every((material) => isConstructionMaterialRequirement(material))
  );
}

function isProjectMaterial(value: unknown): value is SnapshotProjectMaterial {
  if (!isRecord(value)) return false;
  return (
    isIntegerIn(value.goodId, 0, 0xffff_ffff) &&
    isString(value.goodKey, 128) &&
    isString(value.goodName, 256) &&
    isString(value.unitLabel, 64) &&
    isFiniteNumber(value.requiredQuantity) &&
    isFiniteNumber(value.deliveredQuantity) &&
    isFiniteNumber(value.remainingQuantity) &&
    isFiniteNumber(value.unitPriceRUSD) &&
    isFiniteNumber(value.deliveredValueRUSD)
  );
}

function isConstructionProject(value: unknown): value is SnapshotConstructionProject {
  if (!isRecord(value)) return false;
  const status = value.status;
  if (
    status !== "authorized" &&
    status !== "active" &&
    status !== "waiting" &&
    status !== "paused" &&
    status !== "completed" &&
    status !== "cancelled"
  ) {
    return false;
  }
  if (
    value.blockedReason !== null &&
    value.blockedReason !== "labor" &&
    value.blockedReason !== "funds" &&
    value.blockedReason !== "materials"
  ) {
    return false;
  }
  if (!Array.isArray(value.materials)) return false;
  if (!value.materials.every((material) => isProjectMaterial(material))) return false;
  return (
    isIntegerIn(value.id, 1, 0xffff_ffff) &&
    isIntegerIn(value.countryId, 0, 0xffff_ffff) &&
    isIntegerIn(value.provinceId, 0, 0xffff_ffff) &&
    isString(value.provinceName, 256) &&
    isIntegerIn(value.definitionId, 0, 0xffff_ffff) &&
    isString(value.definitionKey, 128) &&
    isString(value.definitionName, 256) &&
    isIntegerIn(value.authorizedDay, 0, 36_524) &&
    (value.startedDay === null || isIntegerIn(value.startedDay, 0, 36_524)) &&
    (value.completedDay === null || isIntegerIn(value.completedDay, 0, 36_524)) &&
    (value.cancelledDay === null || isIntegerIn(value.cancelledDay, 0, 36_524)) &&
    isFiniteNumber(value.totalCostRUSD) &&
    isFiniteNumber(value.workingCapitalRUSD) &&
    isFiniteNumber(value.workingCapitalPaidRUSD) &&
    isFiniteNumber(value.spentRUSD) &&
    isFiniteNumber(value.materialsSpentRUSD) &&
    isFiniteNumber(value.progress) &&
    isFiniteNumber(value.materialsProgress) &&
    isFiniteNumber(value.remainingRUSD) &&
    isIntegerIn(value.lastWorkers, 0, 1_000_000) &&
    (value.buildingId === null || isIntegerIn(value.buildingId, 0, 0xffff_ffff))
  );
}

function isConstructionHistory(value: unknown): value is SnapshotConstructionHistory {
  if (!isRecord(value)) return false;
  return (
    isIntegerIn(value.projectsCompleted, 0, 1_000_000) &&
    isIntegerIn(value.projectsCancelled, 0, 1_000_000) &&
    isFiniteNumber(value.totalSpentRUSD) &&
    isFiniteNumber(value.totalWrittenOffRUSD)
  );
}

function isConstructionLabor(value: unknown): value is SnapshotConstructionLabor {
  if (!isRecord(value)) return false;
  return (
    isIntegerIn(value.idleWorkers, 0, MAX_SNAPSHOT_PEOPLE) &&
    isFiniteNumber(value.dailyWageRUSD)
  );
}

function isIndustrialPolicy(value: unknown): value is SnapshotIndustrialPolicy {
  if (!isRecord(value)) return false;
  if (!Array.isArray(value.sectors)) return false;
  return (
    value.sectors.every((sector) => {
      if (!isRecord(sector)) return false;
      return (
        isIntegerIn(sector.index, 0, SNAPSHOT_SECTOR_COUNT - 1) &&
        isString(sector.key, 64) &&
        isString(sector.label, 128) &&
        isFiniteNumber(sector.subsidyRate) &&
        isFiniteNumber(sector.estimatedDailyOutputValueRUSD)
      );
    }) &&
    isFiniteNumber(value.requestedMonthToDateRUSD) &&
    isFiniteNumber(value.paidMonthToDateRUSD) &&
    isFiniteNumber(value.shortfallMonthToDateRUSD)
  );
}

function isPublicEnterprise(value: unknown): value is SnapshotPublicEnterprise {
  if (!isRecord(value)) return false;
  return (
    isIntegerIn(value.buildingId, 0, 0xffff_ffff) &&
    isIntegerIn(value.definitionId, 0, 0xffff_ffff) &&
    isString(value.definitionKey, 128) &&
    isString(value.definitionName, 256) &&
    isIntegerIn(value.provinceId, 0, 0xffff_ffff) &&
    isString(value.provinceName, 256) &&
    isString(value.sector, 64) &&
    isFiniteNumber(value.level) &&
    isFiniteNumber(value.condition) &&
    isFiniteNumber(value.operatingCashRUSD) &&
    isIntegerIn(value.ownerCountryId, 0, 0xffff_ffff)
  );
}

function isTechnologyCatalogEntry(value: unknown): value is SnapshotTechnologyCatalogEntry {
  if (!isRecord(value)) return false;
  return (
    isIntegerIn(value.technologyId, 0, 0xffff_ffff) &&
    isString(value.key, 128) &&
    isString(value.name, 256) &&
    isIntegerIn(value.era, 1, 6) &&
    isString(value.eraName, 128) &&
    isString(value.description, 1_000) &&
    Array.isArray(value.prerequisites) &&
    value.prerequisites.every((id) => isIntegerIn(id, 0, 0xffff_ffff)) &&
    Array.isArray(value.prerequisiteKeys) &&
    value.prerequisiteKeys.every((key) => typeof key === "string") &&
    isFiniteNumber(value.researchWork) &&
    Array.isArray(value.effects) &&
    value.effects.every((effect) => typeof effect === "string") &&
    Array.isArray(value.unlockedBuildingKeys) &&
    value.unlockedBuildingKeys.every((key) => typeof key === "string") &&
    Array.isArray(value.requiredByLawKeys) &&
    value.requiredByLawKeys.every((key) => typeof key === "string")
  );
}

function isTechnologySnapshot(value: unknown): value is SnapshotTechnology {
  if (!isRecord(value)) return false;
  if (typeof value.enabled !== "boolean") return false;
  if (!isIntegerIn(value.researchedCount, 0, 1_000_000)) return false;
  if (
    value.activeProjectTechnologyId !== null &&
    !isIntegerIn(value.activeProjectTechnologyId, 0, 0xffff_ffff)
  ) {
    return false;
  }
  if (value.researchBlockedReason !== null && typeof value.researchBlockedReason !== "string") {
    return false;
  }
  if (!isFiniteNumber(value.mortalityFactor)) return false;
  if (!isFiniteNumber(value.educationBonus)) return false;
  if (!Array.isArray(value.productivityBySector)) return false;
  if (
    !value.productivityBySector.every(
      (entry) =>
        isRecord(entry) &&
        isString(entry.sector, 64) &&
        isFiniteNumber(entry.factor),
    )
  ) {
    return false;
  }
  if (!Array.isArray(value.statuses)) return false;
  return value.statuses.every((entry) => {
    if (!isRecord(entry)) return false;
    return (
      isIntegerIn(entry.technologyId, 0, 0xffff_ffff) &&
      (entry.status === "researched" ||
        entry.status === "active" ||
        entry.status === "available" ||
        entry.status === "locked") &&
      isFiniteNumber(entry.workCompleted) &&
      (entry.completedDay === null || isIntegerIn(entry.completedDay, 0, 36_524))
    );
  });
}

function isEducationSnapshot(value: unknown): value is SnapshotEducation {
  if (!isRecord(value)) return false;
  if (typeof value.enabled !== "boolean") return false;
  for (const field of [
    "fundedAnnualRUSD",
    "researchStaffShare",
    "academicPopulation",
    "availableAcademicWorkers",
    "researchStaff",
    "teacherStaff",
    "schoolAgePopulation",
    "teachingCapacityStudents",
    "enrolledStudents",
    "attendanceRate",
    "fundingAdequacy",
    "quality",
    "serviceOutputIndex",
    "fundingRequestedMonthToDateRUSD",
    "fundingShortfallMonthToDateRUSD",
  ] as const) {
    if (!isFiniteNumber(value[field])) return false;
  }
  for (const field of ["researchBlockedReason", "educationBlockedReason"] as const) {
    if (value[field] !== null && typeof value[field] !== "string") return false;
  }
  return (
    value.lastUpdateDay === null || isIntegerIn(value.lastUpdateDay, 0, 36_524)
  );
}

function isLaborSnapshot(value: unknown): value is SnapshotLabor {
  if (!isRecord(value)) return false;
  for (const field of [
    "trainingBudgetRUSDPerYear",
    "trainingStipendPerTraineeRUSDPerYear",
    "trainingStaffShare",
    "trainingParticipation",
    "trainingInstructors",
    "eligibleWorkingAge",
    "capacityTrainees",
    "trainees",
    "trainingRequestedMonthToDateRUSD",
    "trainingShortfallMonthToDateRUSD",
    "qualificationAverage",
    "healthStaffShare",
    "healthStaff",
    "administrationStaff",
    "healthServiceOutputIndex",
    "healthMortalityFactor",
    "minimumWageRUSDPerYear",
    "hoursPerWeek",
    "hoursFactor",
  ] as const) {
    if (!isFiniteNumber(value[field])) return false;
  }
  for (const field of ["trainingBlockedReason", "healthBlockedReason"] as const) {
    if (value[field] !== null && typeof value[field] !== "string") return false;
  }
  return true;
}

function isCountrySnapshot(value: unknown): value is CountrySnapshot {
  if (!isRecord(value)) return false;
  if (!isIntegerIn(value.id, 0, 0xffff_ffff)) return false;
  if (!isString(value.tag, 32) || !isString(value.name, 256)) return false;
  if (!isNumberArray(value.provinceIds)) return false;
  if (!isRecord(value.fiscal)) return false;
  for (const field of [
    "incomeTaxRate",
    "welfareBudgetRUSDPerYear",
    "incomeTaxAllowanceRUSDPerYear",
    "welfareMaxWealthLevel",
    "businessProfitTaxRate",
    "reserveTargetRUSD",
  ] as const) {
    if (!isFiniteNumber(value.fiscal[field])) return false;
  }
  if (!isFiniteNumber(value.treasuryCashRUSD)) return false;
  if (typeof value.debtEnabled !== "boolean") return false;
  if (!isFiniteNumber(value.debtOutstandingPrincipalRUSD)) return false;
  if (!isFiniteNumber(value.debtInterestPayableRUSD)) return false;
  if (!isSnapshotDebtPolicy(value.debtPolicy)) return false;
  if (!Array.isArray(value.debtContracts)) return false;
  if (!value.debtContracts.every((contract) => isSnapshotDebtContract(contract))) return false;
  if (!isFiniteNumber(value.population)) return false;
  if (!isFiniteNumber(value.workingAgePopulation)) return false;
  if (!isFiniteNumber(value.employedWorkers)) return false;
  if (!isFiniteNumber(value.householdCashRUSD)) return false;
  if (!isFiniteNumber(value.estimatedDailyWageBaseRUSD)) return false;
  if (!isFiniteNumber(value.estimatedDailyTaxableWageBaseRUSD)) return false;
  if (!isIntegerIn(value.estimatedWageEarningBlockCount, 0, 1_000_000)) return false;
  if (!isFiniteNumber(value.businessTaxBaseMonthToDateRUSD)) return false;
  if (!isBudgetMonthToDate(value.budgetMonthToDate)) return false;
  if (!isFiniteNumber(value.literacy)) return false;
  if (value.demography !== null && !isCountryDemography(value.demography)) return false;
  if (!isFiniteNumber(value.wealthLevel)) return false;
  if (!isFiniteNumber(value.militancy)) return false;
  if (!isFiniteNumber(value.hardshipPopulationShare)) return false;
  if (!isIntegerIn(value.blocksWithUnmetSubsistence, 0, 1_000_000)) return false;
  if (!isIntegerIn(value.blocksWithUnmetBasic, 0, 1_000_000)) return false;
  if (!isIntegerIn(value.buildingCount, 0, 1_000_000)) return false;
  if (!Array.isArray(value.productionCapacityByGood)) return false;
  if (!value.productionCapacityByGood.every(isProductionCapacity)) return false;
  if (value.latestFiscal !== null && !isFiscalTotals(value.latestFiscal)) return false;
  if (!Array.isArray(value.financeHistory)) return false;
  if (!value.financeHistory.every((period) => isFinancePeriod(period))) return false;
  if (!Array.isArray(value.annualReports)) return false;
  if (!value.annualReports.every((report) => isAnnualReport(report))) return false;
  if (!Array.isArray(value.constructionProjects)) return false;
  if (!value.constructionProjects.every((project) => isConstructionProject(project))) {
    return false;
  }
  if (!isConstructionHistory(value.constructionHistory)) return false;
  if (!isConstructionLabor(value.constructionLabor)) return false;
  if (!isFiniteNumber(value.constructionInProgressRUSD)) return false;
  if (!isFiniteNumber(value.publicCapitalRUSD)) return false;
  if (!isIndustrialPolicy(value.industrialPolicy)) return false;
  if (!Array.isArray(value.publicEnterprises)) return false;
  if (!value.publicEnterprises.every((enterprise) => isPublicEnterprise(enterprise))) {
    return false;
  }
  return (
    isTechnologySnapshot(value.technology) &&
    isEducationSnapshot(value.education) &&
    isLaborSnapshot(value.labor)
  );
}

function isGoodQuantityList(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every((entry) => isRecord(entry) && isIntegerIn(entry.goodId, 0, 0xffff) && isFiniteNumber(entry.quantity) && entry.quantity >= 0)
  );
}

function isProvinceLandSnapshot(value: unknown): value is ProvinceLandSnapshot {
  if (!isRecord(value)) return false;
  for (const field of ["croplandHa", "pastureHa", "harvestFactor", "farms", "farmLevels", "workersPerCroplandHa"] as const) {
    if (!isFiniteNumber(value[field]) || (value[field] as number) < 0) return false;
  }
  if (!isIntegerIn(value.harvestYear, 1900, 2100)) return false;
  if (!isGoodQuantityList(value.farmOutputToday) || !isGoodQuantityList(value.keptToday)) return false;
  return (
    Array.isArray(value.deposits) &&
    value.deposits.every(
      (deposit) =>
        isRecord(deposit) &&
        isString(deposit.resource, 32) &&
        isString(deposit.unit, 32) &&
        isFiniteNumber(deposit.remaining) &&
        isFiniteNumber(deposit.initialStock) &&
        isFiniteNumber(deposit.quality) &&
        isNullableId(deposit.discoveredOnDay),
    )
  );
}

function isProvinceEconomyTable(value: unknown): value is ProvinceEconomyTable {
  if (!isRecord(value) || !isNumberArray(value.ids)) return false;
  const length = value.ids.length;
  const numberColumns = [
    "population",
    "buildingCount",
    "buildingLevels",
    "employedWorkers",
    "unrest",
    "infrastructure",
    "urbanShare",
    "arableLandHa",
    "pastureHa",
    "literacy",
  ] as const;
  for (const column of numberColumns) {
    const entries = value[column];
    if (!isFiniteNumberArray(entries) || entries.length !== length) return false;
  }
  for (const column of ["countryId", "marketId", "controllerCountryId", "controlledSinceDay"] as const) {
    const entries = value[column];
    if (!Array.isArray(entries) || entries.length !== length || !entries.every(isNullableId)) return false;
  }
  const harvest = value.harvestFactor;
  if (
    !Array.isArray(harvest) ||
    harvest.length !== length ||
    !harvest.every((entry) => entry === null || (typeof entry === "number" && Number.isFinite(entry) && entry > 0))
  ) {
    return false;
  }
  const tags = value.territoryTag;
  if (!Array.isArray(tags) || tags.length !== length) return false;
  if (!tags.every((tag) => tag === null || isString(tag, 16))) return false;
  const counts = value.populationByProfession;
  return Array.isArray(counts) && counts.length === length && counts.every(isFiniteNumberArray);
}

const INDICATOR_FIELDS = [
  "crudeBirthRate",
  "crudeDeathRate",
  "totalFertility",
  "lifeExpectancy",
  "under5MortalityPer1000",
  "urbanShare",
  "femaleLiteracy",
  "foodSufficiency",
] as const;
const CAUSE_FIELDS = [
  "healthFactor",
  "sanitationKnowledge",
  "healthServiceOutput",
  "sanitationCoverage",
  "contraception",
] as const;
const YEAR_FIELDS = [
  "year",
  "populationStart",
  "populationEnd",
  "births",
  "deaths",
  "crudeBirthRate",
  "crudeDeathRate",
  "totalFertility",
  "lifeExpectancy",
  "under5MortalityPer1000",
  "urbanShare",
] as const;

function isCountryDemography(value: unknown): value is CountryDemographySnapshot {
  if (!isRecord(value)) return false;
  const current = value.current;
  if (!isRecord(current) || !INDICATOR_FIELDS.every((field) => isFiniteNumber(current[field]))) return false;
  const pyramid = value.pyramid;
  if (!isRecord(pyramid)) return false;
  if (!isFiniteNumberArray(pyramid.male) || pyramid.male.length !== 17) return false;
  if (!isFiniteNumberArray(pyramid.female) || pyramid.female.length !== 17) return false;
  const causes = value.causes;
  if (!isRecord(causes) || !CAUSE_FIELDS.every((field) => isFiniteNumber(causes[field]))) return false;
  const ytd = value.yearToDate;
  if (ytd !== null) {
    if (!isRecord(ytd)) return false;
    if (!(["year", "births", "deaths", "days"] as const).every((field) => isFiniteNumber(ytd[field]))) return false;
  }
  if (!Array.isArray(value.history)) return false;
  return value.history.every((row: unknown) => isRecord(row) && YEAR_FIELDS.every((field) => isFiniteNumber(row[field])));
}

function isTerritorySnapshot(value: unknown): value is TerritorySnapshot {
  if (!isRecord(value)) return false;
  return (
    isString(value.polityTag, 16) &&
    isNumberArray(value.provinceIds) &&
    isString(value.historicalName, 256) &&
    isIntegerIn(value.sovereignCountryId, 0, 0xffff_ffff)
  );
}

function isProvinceOwnershipSnapshot(value: unknown): value is ProvinceOwnershipSnapshot {
  if (!isRecord(value)) return false;
  if (!isIntegerIn(value.provinceId, 0, 0xffff_ffff)) return false;
  if (!isIntegerIn(value.ownerPolityId, 0, 0xffff_ffff)) return false;
  if (!isIntegerIn(value.controllerPolityId, 0, 0xffff_ffff)) return false;
  if (value.controlledSinceDay !== null && !isIntegerIn(value.controlledSinceDay, 0, 36_524)) {
    return false;
  }
  if (!Array.isArray(value.claimantPolityIds)) return false;
  if (!value.claimantPolityIds.every((id) => isIntegerIn(id, 0, 0xffff_ffff))) return false;
  return isString(value.specialStatus, 32);
}

function isGoodSnapshot(value: unknown): value is GoodSnapshot {
  if (!isRecord(value)) return false;
  return (
    isIntegerIn(value.id, 0, 0xffff_ffff) &&
    isString(value.key, 64) &&
    isString(value.name, 256) &&
    isString(value.unitLabel, 64) &&
    isString(value.category, 64)
  );
}

function isMarketSnapshot(value: unknown): value is MarketSnapshot {
  if (!isRecord(value)) return false;
  if (!isIntegerIn(value.id, 0, 0xffff_ffff)) return false;
  if (!isString(value.label, 256)) return false;
  if (!isNumberArray(value.provinceIds)) return false;
  if (!Array.isArray(value.prices)) return false;
  if (value.detail !== "full" && value.detail !== "summary") return false;
  if (value.detail === "summary" && value.prices.length > 0) return false;
  return value.prices.every((price) => {
    if (!isRecord(price)) return false;
    return (
      isIntegerIn(price.goodId, 0, 0xffff_ffff) &&
      isFiniteNumber(price.priceRUSD) &&
      isFiniteNumber(price.stockQuantity) &&
      isFiniteNumber(price.dailyProductionCapacity) &&
      price.dailyProductionCapacity >= 0
    );
  });
}

function isDiagnostics(value: unknown): value is SnapshotDiagnostics {
  if (!isRecord(value)) return false;
  return (
    isIntegerIn(value.invalidActionCount, 0, Number.MAX_SAFE_INTEGER) &&
    isIntegerIn(value.invariantFailureCount, 0, Number.MAX_SAFE_INTEGER) &&
    Array.isArray(value.recentWarnings) &&
    value.recentWarnings.every((warning) => isString(warning, 1_000))
  );
}

function isCountrySummary(value: unknown): value is CountrySummarySnapshot {
  if (!isRecord(value)) return false;
  if (!isIntegerIn(value.id, 0, 0xffff_ffff)) return false;
  if (!isString(value.tag, 8) || !isString(value.name, 200)) return false;
  if (!isString(value.historicalName, 200) || !isString(value.capitalName, 200)) return false;
  if (typeof value.status !== "string") return false;
  if (!isIntegerIn(value.sovereignCountryId, 0, 0xffff_ffff)) return false;
  if (
    typeof value.selectable !== "boolean" ||
    typeof value.isPlayer !== "boolean" ||
    typeof value.isFocused !== "boolean"
  ) {
    return false;
  }
  if (!isNumberArray(value.provinceIds) || !isNumberArray(value.marketIds)) return false;
  for (const key of [
    "population",
    "workingAgePopulation",
    "employedWorkers",
    "treasuryCashRUSD",
    "hardshipPopulationShare",
    "literacy",
    "wealthLevel",
    "militancy",
    "militaryPersonnel",
  ] as const) {
    if (!isFiniteNumber(value[key])) return false;
  }
  if (
    value.latestNetFiscalResultRUSD !== null &&
    !isFiniteNumber(value.latestNetFiscalResultRUSD)
  ) {
    return false;
  }
  return true;
}

function isSnapshot(value: unknown): value is SimulationSnapshot {
  if (!isRecord(value)) return false;
  if (value.protocolVersion !== PROTOCOL_VERSION) return false;
  if (!isIntegerIn(value.sequence, 0, Number.MAX_SAFE_INTEGER)) return false;
  if (!isIntegerIn(value.dayIndex, 0, 36_524)) return false;
  if (!isRecord(value.date)) return false;
  if (
    !isIntegerIn(value.date.year, 1900, 2000) ||
    !isIntegerIn(value.date.month, 1, 12) ||
    !isIntegerIn(value.date.day, 1, 31) ||
    !isString(value.date.label, 10)
  ) {
    return false;
  }
  if (typeof value.running !== "boolean") return false;
  if (!isFiniteNumber(value.speedDaysPerSecond) || !isSpeed(value.speedDaysPerSecond)) {
    return false;
  }
  if (!isFiniteNumber(value.achievedDaysPerSecond) || value.achievedDaysPerSecond < 0) {
    return false;
  }
  if (typeof value.speedIsBestEffort !== "boolean") return false;
  if (typeof value.campaignComplete !== "boolean") return false;
  if (!isString(value.scenarioId, 128)) return false;
  if (!isString(value.dataVersion, 128)) return false;
  if (!isString(value.simVersion, 128)) return false;
  if (!isNullableId(value.playerCountryId)) return false;
  if (!isNullableId(value.focusCountryId)) return false;
  if (value.focusProvince !== null) {
    if (!isRecord(value.focusProvince) || !isIntegerIn(value.focusProvince.provinceId, 0, 0xffff_ffff)) return false;
    const focusDemography = value.focusProvince.demography;
    if (
      focusDemography !== null &&
      (!isRecord(focusDemography) || !INDICATOR_FIELDS.every((field) => isFiniteNumber(focusDemography[field])))
    ) {
      return false;
    }
    const focusPyramid = value.focusProvince.pyramid;
    if (!isRecord(focusPyramid)) return false;
    if (!isFiniteNumberArray(focusPyramid.male) || focusPyramid.male.length !== 17) return false;
    if (!isFiniteNumberArray(focusPyramid.female) || focusPyramid.female.length !== 17) return false;
    if (value.focusProvince.land !== null && !isProvinceLandSnapshot(value.focusProvince.land)) return false;
  }
  if (typeof value.constructionEnabled !== "boolean") return false;
  if (!Array.isArray(value.countries) || !value.countries.every(isCountrySnapshot)) return false;
  if (
    value.playerCountryId !== null &&
    !value.countries.some((country) => country.id === value.playerCountryId)
  ) {
    return false;
  }
  if (
    value.focusCountryId !== null &&
    !value.countries.some((country) => country.id === value.focusCountryId)
  ) {
    return false;
  }
  if (
    !Array.isArray(value.countrySummaries) ||
    !value.countrySummaries.every(isCountrySummary)
  ) {
    return false;
  }
  if (
    value.playerCountryId !== null &&
    !value.countrySummaries.some((country) => country.id === value.playerCountryId)
  ) {
    return false;
  }
  if (!isProvinceEconomyTable(value.provinceTable)) return false;
  if (!Array.isArray(value.territories) || !value.territories.every(isTerritorySnapshot)) return false;
  if (!Array.isArray(value.professions)) return false;
  const ownership = value.provinceOwnership as Partial<ProvinceOwnershipTable> | undefined;
  if (
    ownership === undefined ||
    ownership === null ||
    !Array.isArray(ownership.ids) ||
    !Array.isArray(ownership.owners) ||
    ownership.ids.length !== ownership.owners.length ||
    !ownership.ids.every((id) => Number.isInteger(id)) ||
    !ownership.owners.every((id) => Number.isInteger(id)) ||
    !Array.isArray(ownership.exceptions) ||
    !ownership.exceptions.every(isProvinceOwnershipSnapshot)
  ) {
    return false;
  }
  if (!Array.isArray(value.markets) || !value.markets.every(isMarketSnapshot)) return false;
  if (!Array.isArray(value.goods) || !value.goods.every(isGoodSnapshot)) return false;
  if (!Array.isArray(value.needTiers) || !value.needTiers.every(isNeedTier)) return false;
  if (!Array.isArray(value.projectTypes) || !value.projectTypes.every(isProjectType)) {
    return false;
  }
  if (
    !Array.isArray(value.technologyEraNames) ||
    !value.technologyEraNames.every((name) => typeof name === "string")
  ) {
    return false;
  }
  if (
    !Array.isArray(value.technologyCatalog) ||
    !value.technologyCatalog.every(isTechnologyCatalogEntry)
  ) {
    return false;
  }
  return isDiagnostics(value.diagnostics);
}

function parseNullableCommandId(value: unknown, path: string): string | null {
  return value === null
    ? null
    : requireString(value, path, { minLength: 1, maxLength: MAX_PROTOCOL_ID_LENGTH });
}

/** Parse an untrusted worker event in the app/transport boundary. */
export function parseWorkerEvent(value: unknown): WorkerEvent {
  const record = requireRecord(value, "event");
  if (record.protocolVersion !== PROTOCOL_VERSION) {
    throw new ProtocolError(
      "unsupported_protocol",
      `unsupported worker protocol ${String(record.protocolVersion)}`,
    );
  }
  const type = requireString(record.type, "event.type", { minLength: 1, maxLength: 32 });
  switch (type) {
    case "READY": {
      if (!isSnapshot(record.snapshot)) {
        throw new ProtocolError("invalid_snapshot", "event.snapshot is not a valid snapshot");
      }
      return { protocolVersion: PROTOCOL_VERSION, type, snapshot: record.snapshot };
    }
    case "SNAPSHOT": {
      if (!isSnapshot(record.snapshot)) {
        throw new ProtocolError("invalid_snapshot", "event.snapshot is not a valid snapshot");
      }
      return {
        protocolVersion: PROTOCOL_VERSION,
        type,
        commandId: parseNullableCommandId(record.commandId, "event.commandId"),
        snapshot: record.snapshot,
      };
    }
    case "STATE":
      if (typeof record.running !== "boolean") {
        throw new ProtocolError("invalid_message", "event.running must be a boolean");
      }
      return {
        protocolVersion: PROTOCOL_VERSION,
        type,
        commandId: parseNullableCommandId(record.commandId, "event.commandId"),
        running: record.running,
        speedDaysPerSecond: requireFiniteNumber(
          record.speedDaysPerSecond,
          "event.speedDaysPerSecond",
        ),
        achievedDaysPerSecond: requireFiniteNumber(
          record.achievedDaysPerSecond,
          "event.achievedDaysPerSecond",
        ),
      };
    case "ACTION_RESULT": {
      if (!isSnapshot(record.snapshot)) {
        throw new ProtocolError("invalid_snapshot", "event.snapshot is not a valid snapshot");
      }
      const errors = Array.isArray(record.errors)
        ? record.errors.map((error, index) => requireString(error, `event.errors[${String(index)}]`, { maxLength: 2_000 }))
        : (() => {
            throw new ProtocolError("invalid_message", "event.errors must be an array");
          })();
      return {
        protocolVersion: PROTOCOL_VERSION,
        type,
        commandId: requireString(record.commandId, "event.commandId", { minLength: 1 }),
        actionId: requireString(record.actionId, "event.actionId", { minLength: 1 }),
        accepted: record.accepted === true,
        errors,
        snapshot: record.snapshot,
      };
    }
    case "SAVE_RESULT":
      return {
        protocolVersion: PROTOCOL_VERSION,
        type,
        commandId: requireString(record.commandId, "event.commandId", { minLength: 1 }),
        save: requireString(record.save, "event.save", {
          minLength: 1,
          maxLength: MAX_LOAD_SAVE_LENGTH,
        }),
      };
    case "SAVE_PREVIEW": {
      if (record.snapshot !== null && !isSnapshot(record.snapshot)) {
        throw new ProtocolError("invalid_snapshot", "event.snapshot is not a valid snapshot");
      }
      const errors = Array.isArray(record.errors)
        ? record.errors.map((error, index) => requireString(error, `event.errors[${String(index)}]`, { maxLength: 2_000 }))
        : (() => {
            throw new ProtocolError("invalid_message", "event.errors must be an array");
          })();
      const accepted = record.accepted === true;
      if (accepted === (record.snapshot === null)) {
        throw new ProtocolError("invalid_message", "event.snapshot must be present exactly when accepted");
      }
      return {
        protocolVersion: PROTOCOL_VERSION,
        type,
        commandId: requireString(record.commandId, "event.commandId", { minLength: 1 }),
        accepted,
        errors,
        snapshot: record.snapshot,
      };
    }
    case "LOAD_RESULT":
    case "NEW_GAME_RESULT": {
      if (!isSnapshot(record.snapshot)) {
        throw new ProtocolError("invalid_snapshot", "event.snapshot is not a valid snapshot");
      }
      const errors = Array.isArray(record.errors)
        ? record.errors.map((error, index) => requireString(error, `event.errors[${String(index)}]`, { maxLength: 2_000 }))
        : (() => {
            throw new ProtocolError("invalid_message", "event.errors must be an array");
          })();
      return {
        protocolVersion: PROTOCOL_VERSION,
        type: type as "LOAD_RESULT" | "NEW_GAME_RESULT",
        commandId: requireString(record.commandId, "event.commandId", { minLength: 1 }),
        accepted: record.accepted === true,
        errors,
        snapshot: record.snapshot,
      };
    }
    case "ERROR":
      return {
        protocolVersion: PROTOCOL_VERSION,
        type,
        commandId:
          record.commandId === null
            ? null
            : requireString(record.commandId, "event.commandId", { minLength: 1 }),
        code: requireString(record.code, "event.code", { minLength: 1, maxLength: 64 }),
        message: requireString(record.message, "event.message", { minLength: 1, maxLength: 4_000 }),
      };
    case "FATAL":
      return {
        protocolVersion: PROTOCOL_VERSION,
        type,
        message: requireString(record.message, "event.message", { minLength: 1, maxLength: 4_000 }),
      };
    case "SHUTDOWN":
      return {
        protocolVersion: PROTOCOL_VERSION,
        type,
        commandId: parseNullableCommandId(record.commandId, "event.commandId"),
      };
    default:
      throw new ProtocolError("unknown_event", `unknown event type ${JSON.stringify(type)}`);
  }
}
