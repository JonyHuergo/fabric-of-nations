/**
 * Versioned Century worker protocol and immutable UI snapshot contract.
 *
 * This module is intentionally free of simulation, Node, React Native, and DOM
 * imports. The app may import it directly; it contains only plain data contracts,
 * protocol constants, and runtime validation of untrusted messages.
 */

export const PROTOCOL_VERSION = 14 as const;
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
  readonly incomeTaxAllowanceSUSDPerYear: number;
  readonly welfareBudgetSUSDPerYear: number;
  readonly welfareMaxWealthLevel: number;
  readonly businessProfitTaxRate: number;
  readonly reserveTargetSUSD: number;
}

export interface IssueDebtActionDto {
  readonly kind: "issue-debt";
  readonly countryId: number;
  readonly amountSUSD: number;
}

export interface RepayDebtActionDto {
  readonly kind: "repay-debt";
  readonly countryId: number;
  readonly contractId: number;
  readonly amountSUSD: number;
}

export interface SetDebtPolicyActionDto {
  readonly kind: "set-debt-policy";
  readonly countryId: number;
  readonly refinanceOnMaturity: boolean;
  readonly maxOutstandingPrincipalSUSD: number;
}

export interface StartConstructionActionDto {
  readonly kind: "start-construction";
  readonly countryId: number;
  readonly regionId: number;
  readonly definitionId: number;
}

export interface CancelConstructionActionDto {
  readonly kind: "cancel-construction";
  readonly countryId: number;
  readonly projectId: number;
}

/** Mirror of the validated E4 sector taxonomy size; the simulation is authoritative. */
export const SNAPSHOT_SECTOR_COUNT = 5;

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
  readonly amountSUSD: number;
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
  readonly annualSUSD: number;
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
  readonly annualSUSD: number;
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
  readonly annualSUSD: number;
}

/** E5: set the annual training stipend per trainee. */
export interface SetTrainingStipendActionDto {
  readonly kind: "set-training-stipend";
  readonly countryId: number;
  readonly annualSUSD: number;
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
  readonly regionId: number;
  readonly personnel: number;
  readonly equipmentUnits?: number;
}

/** M10: deploy an army. */
export interface DeployArmyActionDto {
  readonly kind: "deploy-army";
  readonly countryId: number;
  readonly armyId: number;
  readonly targetRegionId: number;
}

/** E6b: set the monetary regime/parity and perform a reserve or currency operation. */
export interface SetMonetaryPolicyActionDto {
  readonly kind: "set-monetary-policy";
  readonly countryId: number;
  readonly regime: "pegged" | "managed";
  readonly paritySusdPerUnit: number | null;
  readonly reserveTransferSUSD: number;
  readonly currencyConversionSUSD: number;
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
  readonly incomeTaxAllowanceSUSDPerYear: number;
  readonly welfareBudgetSUSDPerYear: number;
  readonly welfareMaxWealthLevel: number;
  readonly businessProfitTaxRate: number;
  readonly reserveTargetSUSD: number;
}

/** E2 budget decomposition for one closed period (flows, not balances). */
export interface SnapshotBudgetTotals {
  readonly welfareRequestedSUSD: number;
  readonly welfareShortfallSUSD: number;
  readonly businessTaxAssessedSUSD: number;
  readonly businessTaxUncollectedSUSD: number;
  readonly debtIssuedSUSD: number;
  readonly principalRepaidSUSD: number;
  readonly interestPaidSUSD: number;
  readonly unfinancedRequirementSUSD: number;
  readonly constructionSpentSUSD: number;
  readonly constructionWrittenOffSUSD: number;
  readonly constructionMaterialsSpentSUSD: number;
  readonly subsidyRequestedSUSD: number;
  readonly subsidyShortfallSUSD: number;
  readonly publicEnterpriseSupportSUSD: number;
  readonly administrationRequestedSUSD?: number;
  readonly administrationShortfallSUSD?: number;
}

/** Current open-period budget memo. Values are flows so far this month. */
export interface SnapshotBudgetMonthToDate extends SnapshotBudgetTotals {
  readonly businessTaxBaseMonthToDateSUSD: number;
}

/** M5b debt policy plus derived financing constraints. */
export interface SnapshotDebtPolicy {
  readonly enabled: boolean;
  readonly refinanceOnMaturity: boolean;
  readonly maxOutstandingPrincipalSUSD: number;
  readonly creditorKind: "country" | "popBlock";
  readonly creditorId: number;
  readonly creditorLabel: string;
  readonly annualCouponRate: number;
  readonly termDays: number;
  readonly arrearsGraceDays: number;
  /** Creditor's current designated cash; a hard issuance limit. */
  readonly creditorCashSUSD: number;
  /** Remaining outstanding-principal headroom under the ceiling. */
  readonly headroomSUSD: number;
}

/** One outstanding debt contract exposed for repayment planning. */
export interface SnapshotDebtContract {
  readonly id: number;
  readonly holderKind: "country" | "popBlock";
  readonly holderId: number;
  readonly holderLabel: string;
  readonly principalSUSD: number;
  readonly outstandingPrincipalSUSD: number;
  readonly annualCouponRate: number;
  readonly issueDay: number;
  readonly maturityDay: number;
  readonly accruedInterestSUSD: number;
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
  readonly constructionCostSUSD: number;
  readonly constructionWorkers: number;
  readonly plannedJobs: number;
  readonly dailyUpkeepSUSDAtLevelOne: number;
  readonly workingCapitalSUSD: number;
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
  readonly unitPriceSUSD: number;
  readonly deliveredValueSUSD: number;
}

/** Current/persisted public-construction project. */
export interface SnapshotConstructionProject {
  readonly id: number;
  readonly countryId: number;
  readonly regionId: number;
  readonly regionName: string;
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
  readonly totalCostSUSD: number;
  readonly workingCapitalSUSD: number;
  readonly workingCapitalPaidSUSD: number;
  readonly spentSUSD: number;
  readonly materialsSpentSUSD: number;
  readonly materials: readonly SnapshotProjectMaterial[];
  readonly progress: number;
  readonly materialsProgress: number;
  readonly remainingSUSD: number;
  readonly lastWorkers: number;
  readonly blockedReason: "labor" | "funds" | "materials" | null;
  readonly buildingId: number | null;
}

/** Bounded aggregate of compacted construction history for one country. */
export interface SnapshotConstructionHistory {
  readonly projectsCompleted: number;
  readonly projectsCancelled: number;
  readonly totalSpentSUSD: number;
  readonly totalWrittenOffSUSD: number;
}

/** Current construction-labor availability and wage estimate. */
export interface SnapshotConstructionLabor {
  readonly idleWorkers: number;
  /** Idle-worker-weighted mean daily base wage, 0 when no idle workers. */
  readonly dailyWageSUSD: number;
}

/** One validated building-sector row used by the industrial-policy UI. */
export interface SnapshotSector {
  readonly index: number;
  readonly key: string;
  readonly label: string;
  readonly subsidyRate: number;
  /** Presentation estimate: current sector capacity valued at current prices. */
  readonly estimatedDailyOutputValueSUSD: number;
}

/** Policy state and month-to-date subsidy outcome for one country. */
export interface SnapshotIndustrialPolicy {
  readonly sectors: readonly SnapshotSector[];
  readonly requestedMonthToDateSUSD: number;
  readonly paidMonthToDateSUSD: number;
  readonly shortfallMonthToDateSUSD: number;
}

/** A state-owned productive enterprise available for operating support. */
export interface SnapshotPublicEnterprise {
  readonly buildingId: number;
  readonly definitionId: number;
  readonly definitionKey: string;
  readonly definitionName: string;
  readonly regionId: number;
  readonly regionName: string;
  readonly sector: string;
  readonly level: number;
  readonly condition: number;
  readonly operatingCashSUSD: number;
  readonly ownerCountryId: number;
}

export interface SnapshotFiscalTotals {
  readonly periodStartDay: number;
  readonly periodEndDay: number;
  readonly incomeTaxSUSD: number;
  readonly welfareExpenseSUSD: number;
  readonly interestExpenseSUSD: number;
  readonly subsidyExpenseSUSD: number;
  readonly administrationExpenseSUSD?: number;
  /**
   * Additive, optional categories. Current snapshots always populate them; an
   * older protocol-13 snapshot may omit them, in which case reports show zero.
   */
  readonly educationExpenseSUSD?: number;
  readonly trainingExpenseSUSD?: number;
  readonly customsDutyRevenueSUSD?: number;
  readonly militaryExpenseSUSD?: number;
  readonly netFiscalResultSUSD: number;
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
  readonly businessTaxRevenueSUSD: number;
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
  readonly treasuryCashEndSUSD: number | null;
  readonly debtOutstandingEndSUSD: number | null;
  readonly householdCashEndSUSD: number | null;
}

export interface SnapshotAnnualReport extends SnapshotBudgetTotals {
  readonly year: number;
  readonly periodStartDay: number;
  readonly periodEndDay: number;
  readonly periodStartLabel: string;
  readonly periodEndLabel: string;
  readonly complete: boolean;
  readonly incomeTaxSUSD: number;
  readonly businessTaxRevenueSUSD: number;
  readonly welfareExpenseSUSD: number;
  readonly interestExpenseSUSD: number;
  readonly subsidyExpenseSUSD: number;
  readonly administrationExpenseSUSD?: number;
  readonly educationExpenseSUSD?: number;
  readonly trainingExpenseSUSD?: number;
  readonly customsDutyRevenueSUSD?: number;
  readonly militaryExpenseSUSD?: number;
  readonly netFiscalResultSUSD: number;
  readonly treasuryCashEndSUSD: number;
  readonly debtLiabilityEndSUSD: number;
  readonly interestPayableEndSUSD: number;
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
  readonly fundedAnnualSUSD: number;
  readonly quality: number;
  readonly overload: number;
  readonly serviceOutputIndex: number;
  readonly staffedPopulation: number;
  readonly fundingRequestedMonthToDateSUSD: number;
  readonly fundingShortfallMonthToDateSUSD: number;
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
  readonly fundedAnnualSUSD: number;
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
  readonly fundingRequestedMonthToDateSUSD: number;
  readonly fundingShortfallMonthToDateSUSD: number;
  readonly researchBlockedReason: string | null;
  readonly educationBlockedReason: string | null;
  readonly lastUpdateDay: number | null;
}

export interface SnapshotLabor {
  /** E5 training policy and derived service. */
  readonly trainingBudgetSUSDPerYear: number;
  readonly trainingStipendPerTraineeSUSDPerYear: number;
  readonly trainingStaffShare: number;
  readonly trainingParticipation: number;
  readonly trainingInstructors: number;
  readonly eligibleWorkingAge: number;
  readonly capacityTrainees: number;
  readonly trainees: number;
  readonly trainingRequestedMonthToDateSUSD: number;
  readonly trainingShortfallMonthToDateSUSD: number;
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
  readonly minimumWageSUSDPerYear: number;
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
  readonly exportsValueMonthToDateSUSD: number;
  readonly importsValueMonthToDateSUSD: number;
  readonly dutyReceivedMonthToDateSUSD: number;
  readonly dutyPaidMonthToDateSUSD: number;
  readonly freightPaidMonthToDateSUSD: number;
}

/** One observed transport route and its derived daily capacity. */
export interface SnapshotTradeRoute {
  readonly id: number;
  readonly marketAId: number;
  readonly marketBId: number;
  readonly distanceUnits: number;
  readonly transitDays: number;
  readonly baseCapacitySUSDPerDay: number;
  /** Derived capacity at the current market infrastructure, per direction per day. */
  readonly capacitySUSDPerDay: number;
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
  readonly cargoValueSUSD: number;
  readonly freightCostSUSD: number;
  readonly dutySUSD: number;
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
    readonly freightPaidSUSD: number;
    readonly dutyPaidSUSD: number;
    readonly ownerFundedSUSD: number;
    readonly blocked: readonly SnapshotTradeBlockedReason[];
    readonly blockedTruncated: boolean;
  } | null;
}

/** One currency identity and its authoritative SUSD valuation, for the Money screen. */
export interface SnapshotCurrency {
  readonly id: number;
  readonly key: string;
  readonly name: string;
  readonly issuerKind: "country" | "foreign" | "union";
  readonly issuerCountryId: number | null;
  readonly valuationStatus: "specified" | "unavailable";
  /** SUSD per one currency unit; null when unavailable. Never a parity default. */
  readonly susdPerUnit: number | null;
  readonly valuationSource: "scenario" | "policy" | "market" | null;
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
  readonly paritySusdPerUnit: number | null;
  readonly valuationSusdPerUnit: number | null;
  readonly reserveCashSUSD: number;
  readonly currencyIssuedUnits: number;
  readonly liabilitySUSD: number;
  /** Reserves in months of the last completed month's imports; null when no imports. */
  readonly reserveCoverMonths: number | null;
  readonly convertibility: "no-authority" | "inactive" | "open" | "suspended";
  readonly lastParityChangeDay: number | null;
  readonly lastMonthExportsSUSD: number;
  readonly lastMonthImportsSUSD: number;
  /** Why the authority is not operating, or null. */
  readonly blockedReason: string | null;
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

/** M11 static metadata attached to a dependent-territory region. */
export interface RegionMetaSnapshot {
  readonly polityTag: string;
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
  readonly regionIds: readonly number[];
  readonly marketIds: readonly number[];
  readonly population: number;
  readonly workingAgePopulation: number;
  readonly employedWorkers: number;
  readonly treasuryCashSUSD: number;
  readonly hardshipPopulationShare: number;
  readonly literacy: number;
  readonly wealthLevel: number;
  readonly militancy: number;
  readonly militaryPersonnel: number;
  readonly latestNetFiscalResultSUSD: number | null;
}

export interface CountrySnapshot {
  readonly id: number;
  readonly tag: string;
  readonly name: string;
  /** M11 static polity metadata; null for legacy scenarios without a catalog. */
  readonly meta: CountryMetaSnapshot | null;
  readonly regionIds: readonly number[];
  readonly fiscal: SnapshotFiscalPolicy;
  readonly treasuryCashSUSD: number;
  readonly debtEnabled: boolean;
  readonly debtOutstandingPrincipalSUSD: number;
  readonly debtInterestPayableSUSD: number;
  /** Player-visible debt policy and derived financing limits. */
  readonly debtPolicy: SnapshotDebtPolicy;
  /** Outstanding/arrears contracts, in ascending id order (bounded by the cap). */
  readonly debtContracts: readonly SnapshotDebtContract[];
  readonly population: number;
  readonly workingAgePopulation: number;
  readonly employedWorkers: number;
  /** Household cash stock across the country's population blocks. */
  readonly householdCashSUSD: number;
  /**
   * Estimated daily wage obligation/taxable wage base from current employment
   * at base wages. It is a current-base static estimate, not realized wages.
   */
  readonly estimatedDailyWageBaseSUSD: number;
  /**
   * Estimated daily taxable wage base after the current income-tax allowance.
   * Exact for the current policy given the base-wage estimate; not realized
   * wages, and not an exemption estimate for a different allowance.
   */
  readonly estimatedDailyTaxableWageBaseSUSD: number;
  /** Blocks with a positive estimated daily wage base (for allowance estimates). */
  readonly estimatedWageEarningBlockCount: number;
  /** Month-to-date taxable enterprise profit used by the business-tax preview. */
  readonly businessTaxBaseMonthToDateSUSD: number;
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
  readonly constructionInProgressSUSD: number;
  /** Country capitalized public-capital asset balance. */
  readonly publicCapitalSUSD: number;
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
    readonly occupiedRegionIds: readonly number[];
    readonly controlledRegionIds: readonly number[];
  };
}

export interface SnapshotArmy {
  readonly id: number;
  readonly countryId: number;
  readonly regionId: number;
  readonly personnel: number;
  readonly equipmentUnits: number;
  readonly organization: number;
  readonly supply: number;
  readonly wounded: number;
  readonly deaths: number;
  readonly captured: number;
  readonly readyDay: number;
  readonly destinationRegionId: number | null;
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
  readonly regionId: number;
  readonly sovereignCountryId: number | null;
  readonly controllerCountryId: number | null;
  readonly occupiedSinceDay: number | null;
}

export interface RegionSnapshot {
  readonly id: number;
  readonly key: string;
  readonly name: string;
  readonly countryId: number | null;
  readonly marketId: number | null;
  readonly population: number;
  readonly buildingCount: number;
  /** M8 regional militancy aggregate and provisional infrastructure quality. */
  readonly unrest: number;
  readonly infrastructure: number;
  /** M10 sovereign owner; equal to countryId and never changes on occupation. */
  readonly sovereignCountryId: number | null;
  /** M10 temporary military controller; null means the sovereign controls it. */
  readonly controllerCountryId: number | null;
  readonly occupiedSinceDay: number | null;
  /** M11 dependent-territory metadata; null for a sovereign home region. */
  readonly meta: RegionMetaSnapshot | null;
}

export interface GoodSnapshot {
  readonly id: number;
  readonly key: string;
  readonly name: string;
  readonly unitLabel: string;
  readonly category: string;
}

export interface MarketPriceSnapshot {
  readonly goodId: number;
  readonly goodKey: string;
  readonly goodName: string;
  readonly unitLabel: string;
  readonly priceSUSD: number;
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
  readonly regionIds: readonly number[];
  /** Countries with at least one region in this market, ascending. */
  readonly memberCountryIds: readonly number[];
  readonly prices: readonly MarketPriceSnapshot[];
  /** E6a customs administration of this market, or null. */
  readonly customsCountryId: number | null;
  /** Derived mean infrastructure quality of the market's regions, 0..1. */
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
  /** State-enterprise ownership/remittance policy required by public construction. */
  readonly constructionEnabled: boolean;
  /** Full detail for the player country and the focused country only. */
  readonly countries: readonly CountrySnapshot[];
  /** Compact record for every country in the world. */
  readonly countrySummaries: readonly CountrySummarySnapshot[];
  readonly regions: readonly RegionSnapshot[];
  readonly markets: readonly MarketSnapshot[];
  readonly goods: readonly GoodSnapshot[];
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
  /** E6b currency identities and authoritative SUSD valuations. */
  readonly currencies: readonly SnapshotCurrency[];
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
    const incomeTaxAllowanceSUSDPerYear = requireFiniteNumber(
      record.incomeTaxAllowanceSUSDPerYear,
      "command.action.incomeTaxAllowanceSUSDPerYear",
    );
    if (incomeTaxAllowanceSUSDPerYear < 0) {
      throw new ProtocolError(
        "invalid_action",
        "command.action.incomeTaxAllowanceSUSDPerYear must be non-negative",
      );
    }
    const welfareBudgetSUSDPerYear = requireFiniteNumber(
      record.welfareBudgetSUSDPerYear,
      "command.action.welfareBudgetSUSDPerYear",
    );
    if (welfareBudgetSUSDPerYear < 0) {
      throw new ProtocolError(
        "invalid_action",
        "command.action.welfareBudgetSUSDPerYear must be non-negative",
      );
    }
    const welfareMaxWealthLevel = requireInteger(
      record.welfareMaxWealthLevel,
      "command.action.welfareMaxWealthLevel",
      0,
      99,
    );
    const reserveTargetSUSD = requireFiniteNumber(
      record.reserveTargetSUSD,
      "command.action.reserveTargetSUSD",
    );
    if (reserveTargetSUSD < 0) {
      throw new ProtocolError(
        "invalid_action",
        "command.action.reserveTargetSUSD must be non-negative",
      );
    }
    return {
      kind: "set-fiscal-policy",
      countryId,
      incomeTaxRate,
      incomeTaxAllowanceSUSDPerYear,
      welfareBudgetSUSDPerYear,
      welfareMaxWealthLevel,
      businessProfitTaxRate,
      reserveTargetSUSD,
    };
  }
  if (kind === "issue-debt") {
    const amountSUSD = requireFiniteNumber(record.amountSUSD, "command.action.amountSUSD");
    if (!(amountSUSD > 0)) {
      throw new ProtocolError("invalid_action", "command.action.amountSUSD must be positive");
    }
    return { kind: "issue-debt", countryId, amountSUSD };
  }
  if (kind === "repay-debt") {
    const contractId = requireInteger(
      record.contractId,
      "command.action.contractId",
      0,
      0xffff_ffff,
    );
    const amountSUSD = requireFiniteNumber(record.amountSUSD, "command.action.amountSUSD");
    if (!(amountSUSD > 0)) {
      throw new ProtocolError("invalid_action", "command.action.amountSUSD must be positive");
    }
    return { kind: "repay-debt", countryId, contractId, amountSUSD };
  }
  if (kind === "set-debt-policy") {
    if (typeof record.refinanceOnMaturity !== "boolean") {
      throw new ProtocolError(
        "invalid_action",
        "command.action.refinanceOnMaturity must be a boolean",
      );
    }
    const maxOutstandingPrincipalSUSD = requireFiniteNumber(
      record.maxOutstandingPrincipalSUSD,
      "command.action.maxOutstandingPrincipalSUSD",
    );
    if (maxOutstandingPrincipalSUSD < 0) {
      throw new ProtocolError(
        "invalid_action",
        "command.action.maxOutstandingPrincipalSUSD must be non-negative",
      );
    }
    return {
      kind: "set-debt-policy",
      countryId,
      refinanceOnMaturity: record.refinanceOnMaturity,
      maxOutstandingPrincipalSUSD,
    };
  }
  if (kind === "start-construction") {
    return {
      kind: "start-construction",
      countryId,
      regionId: requireInteger(
        record.regionId,
        "command.action.regionId",
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
    const amountSUSD = requireFiniteNumber(
      record.amountSUSD,
      "command.action.amountSUSD",
    );
    if (!(amountSUSD > 0)) {
      throw new ProtocolError(
        "invalid_action",
        "command.action.amountSUSD must be positive",
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
      amountSUSD,
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
    const annualSUSD = requireFiniteNumber(
      record.annualSUSD,
      "command.action.annualSUSD",
    );
    if (annualSUSD < 0) {
      throw new ProtocolError(
        "invalid_action",
        "command.action.annualSUSD must be non-negative",
      );
    }
    return { kind: "set-institution-funding", countryId, annualSUSD };
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
    const annualSUSD = requireFiniteNumber(
      record.annualSUSD,
      "command.action.annualSUSD",
    );
    if (annualSUSD < 0) {
      throw new ProtocolError(
        "invalid_action",
        "command.action.annualSUSD must be non-negative",
      );
    }
    return { kind: "set-education-funding", countryId, annualSUSD };
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
    const annualSUSD = requireFiniteNumber(
      record.annualSUSD,
      "command.action.annualSUSD",
    );
    if (annualSUSD < 0) {
      throw new ProtocolError(
        "invalid_action",
        "command.action.annualSUSD must be non-negative",
      );
    }
    return { kind, countryId, annualSUSD };
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
  if (kind === "set-monetary-policy") {
    const regime = requireString(record.regime, "command.action.regime");
    if (regime !== "pegged" && regime !== "managed") {
      throw new ProtocolError(
        "invalid_action",
        'command.action.regime must be "pegged" or "managed"',
      );
    }
    let paritySusdPerUnit: number | null = null;
    if (record.paritySusdPerUnit !== null && record.paritySusdPerUnit !== undefined) {
      paritySusdPerUnit = requireFiniteNumber(
        record.paritySusdPerUnit,
        "command.action.paritySusdPerUnit",
      );
      if (!(paritySusdPerUnit > 0)) {
        throw new ProtocolError(
          "invalid_action",
          "command.action.paritySusdPerUnit must be positive or null",
        );
      }
    }
    const reserveTransferSUSD = requireFiniteNumber(
      record.reserveTransferSUSD,
      "command.action.reserveTransferSUSD",
    );
    const currencyConversionSUSD = requireFiniteNumber(
      record.currencyConversionSUSD,
      "command.action.currencyConversionSUSD",
    );
    return {
      kind: "set-monetary-policy",
      countryId,
      regime,
      paritySusdPerUnit,
      reserveTransferSUSD,
      currencyConversionSUSD,
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
    const regionId = requireUint32(record.regionId, "command.action.regionId");
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
      return { kind, countryId, regionId, personnel };
    }
    return { kind, countryId, regionId, personnel, equipmentUnits };
  }
  if (kind === "deploy-army") {
    return {
      kind,
      countryId,
      armyId: requireUint32(record.armyId, "command.action.armyId"),
      targetRegionId: requireUint32(record.targetRegionId, "command.action.targetRegionId"),
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
    case "LOAD":
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

function isNumberArray(value: unknown): value is readonly number[] {
  return Array.isArray(value) && value.every((entry) => isIntegerIn(entry, 0, 0xffff_ffff));
}

const OPTIONAL_FISCAL_TOTAL_FIELDS = [
  "administrationExpenseSUSD",
  "educationExpenseSUSD",
  "trainingExpenseSUSD",
  "customsDutyRevenueSUSD",
  "militaryExpenseSUSD",
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
    isFiniteNumber(value.incomeTaxSUSD) &&
    isFiniteNumber(value.welfareExpenseSUSD) &&
    isFiniteNumber(value.interestExpenseSUSD) &&
    isFiniteNumber(value.subsidyExpenseSUSD) &&
    isFiniteNumber(value.netFiscalResultSUSD)
  );
}

function isNullableFiniteNumber(value: unknown): value is number | null {
  return value === null || isFiniteNumber(value);
}

const BUDGET_TOTAL_FIELDS = [
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
  return isFiniteNumber(record.businessTaxBaseMonthToDateSUSD);
}

function isSnapshotDebtPolicy(value: unknown): value is SnapshotDebtPolicy {
  if (!isRecord(value)) return false;
  if (typeof value.enabled !== "boolean") return false;
  if (typeof value.refinanceOnMaturity !== "boolean") return false;
  for (const field of [
    "maxOutstandingPrincipalSUSD",
    "annualCouponRate",
    "creditorCashSUSD",
    "headroomSUSD",
  ] as const) {
    if (!isFiniteNumber(value[field])) return false;
  }
  if ((value.maxOutstandingPrincipalSUSD as number) < 0) return false;
  if ((value.creditorCashSUSD as number) < 0) return false;
  if ((value.headroomSUSD as number) < 0) return false;
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
    isFiniteNumber(value.principalSUSD) &&
    isFiniteNumber(value.outstandingPrincipalSUSD) &&
    isFiniteNumber(value.annualCouponRate) &&
    isIntegerIn(value.issueDay, 0, 36_524) &&
    isIntegerIn(value.maturityDay, 0, 36_524) &&
    isFiniteNumber(value.accruedInterestSUSD)
  );
}

function isFinancePeriod(value: unknown): value is SnapshotFinancePeriod {
  if (!isFiscalTotals(value)) return false;
  const record = value as unknown as Record<string, unknown>;
  if (!isFiniteNumber(record.businessTaxRevenueSUSD)) return false;
  if (!isBudgetTotals(record)) return false;
  if (!isRecord(record.grossFlowTotals)) return false;
  if (!Object.values(record.grossFlowTotals).every((entry) => isFiniteNumber(entry))) {
    return false;
  }
  return (
    isString(record.periodStartLabel, 10) &&
    isString(record.periodEndLabel, 10) &&
    isNullableFiniteNumber(record.treasuryCashEndSUSD) &&
    isNullableFiniteNumber(record.debtOutstandingEndSUSD) &&
    isNullableFiniteNumber(record.householdCashEndSUSD)
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
    isFiniteNumber(value.incomeTaxSUSD) &&
    isFiniteNumber(value.businessTaxRevenueSUSD) &&
    isFiniteNumber(value.welfareExpenseSUSD) &&
    isFiniteNumber(value.interestExpenseSUSD) &&
    isFiniteNumber(value.subsidyExpenseSUSD) &&
    isFiniteNumber(value.netFiscalResultSUSD) &&
    isFiniteNumber(value.treasuryCashEndSUSD) &&
    isFiniteNumber(value.debtLiabilityEndSUSD) &&
    isFiniteNumber(value.interestPayableEndSUSD) &&
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
    isFiniteNumber(value.constructionCostSUSD) &&
    isIntegerIn(value.constructionWorkers, 1, 1_000_000) &&
    isFiniteNumber(value.plannedJobs) &&
    isFiniteNumber(value.dailyUpkeepSUSDAtLevelOne) &&
    isFiniteNumber(value.workingCapitalSUSD) &&
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
    isFiniteNumber(value.unitPriceSUSD) &&
    isFiniteNumber(value.deliveredValueSUSD)
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
    isIntegerIn(value.regionId, 0, 0xffff_ffff) &&
    isString(value.regionName, 256) &&
    isIntegerIn(value.definitionId, 0, 0xffff_ffff) &&
    isString(value.definitionKey, 128) &&
    isString(value.definitionName, 256) &&
    isIntegerIn(value.authorizedDay, 0, 36_524) &&
    (value.startedDay === null || isIntegerIn(value.startedDay, 0, 36_524)) &&
    (value.completedDay === null || isIntegerIn(value.completedDay, 0, 36_524)) &&
    (value.cancelledDay === null || isIntegerIn(value.cancelledDay, 0, 36_524)) &&
    isFiniteNumber(value.totalCostSUSD) &&
    isFiniteNumber(value.workingCapitalSUSD) &&
    isFiniteNumber(value.workingCapitalPaidSUSD) &&
    isFiniteNumber(value.spentSUSD) &&
    isFiniteNumber(value.materialsSpentSUSD) &&
    isFiniteNumber(value.progress) &&
    isFiniteNumber(value.materialsProgress) &&
    isFiniteNumber(value.remainingSUSD) &&
    isIntegerIn(value.lastWorkers, 0, 1_000_000) &&
    (value.buildingId === null || isIntegerIn(value.buildingId, 0, 0xffff_ffff))
  );
}

function isConstructionHistory(value: unknown): value is SnapshotConstructionHistory {
  if (!isRecord(value)) return false;
  return (
    isIntegerIn(value.projectsCompleted, 0, 1_000_000) &&
    isIntegerIn(value.projectsCancelled, 0, 1_000_000) &&
    isFiniteNumber(value.totalSpentSUSD) &&
    isFiniteNumber(value.totalWrittenOffSUSD)
  );
}

function isConstructionLabor(value: unknown): value is SnapshotConstructionLabor {
  if (!isRecord(value)) return false;
  return (
    isIntegerIn(value.idleWorkers, 0, MAX_SNAPSHOT_PEOPLE) &&
    isFiniteNumber(value.dailyWageSUSD)
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
        isFiniteNumber(sector.estimatedDailyOutputValueSUSD)
      );
    }) &&
    isFiniteNumber(value.requestedMonthToDateSUSD) &&
    isFiniteNumber(value.paidMonthToDateSUSD) &&
    isFiniteNumber(value.shortfallMonthToDateSUSD)
  );
}

function isPublicEnterprise(value: unknown): value is SnapshotPublicEnterprise {
  if (!isRecord(value)) return false;
  return (
    isIntegerIn(value.buildingId, 0, 0xffff_ffff) &&
    isIntegerIn(value.definitionId, 0, 0xffff_ffff) &&
    isString(value.definitionKey, 128) &&
    isString(value.definitionName, 256) &&
    isIntegerIn(value.regionId, 0, 0xffff_ffff) &&
    isString(value.regionName, 256) &&
    isString(value.sector, 64) &&
    isFiniteNumber(value.level) &&
    isFiniteNumber(value.condition) &&
    isFiniteNumber(value.operatingCashSUSD) &&
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
    "fundedAnnualSUSD",
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
    "fundingRequestedMonthToDateSUSD",
    "fundingShortfallMonthToDateSUSD",
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
    "trainingBudgetSUSDPerYear",
    "trainingStipendPerTraineeSUSDPerYear",
    "trainingStaffShare",
    "trainingParticipation",
    "trainingInstructors",
    "eligibleWorkingAge",
    "capacityTrainees",
    "trainees",
    "trainingRequestedMonthToDateSUSD",
    "trainingShortfallMonthToDateSUSD",
    "qualificationAverage",
    "healthStaffShare",
    "healthStaff",
    "administrationStaff",
    "healthServiceOutputIndex",
    "healthMortalityFactor",
    "minimumWageSUSDPerYear",
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
  if (!isNumberArray(value.regionIds)) return false;
  if (!isRecord(value.fiscal)) return false;
  for (const field of [
    "incomeTaxRate",
    "welfareBudgetSUSDPerYear",
    "incomeTaxAllowanceSUSDPerYear",
    "welfareMaxWealthLevel",
    "businessProfitTaxRate",
    "reserveTargetSUSD",
  ] as const) {
    if (!isFiniteNumber(value.fiscal[field])) return false;
  }
  if (!isFiniteNumber(value.treasuryCashSUSD)) return false;
  if (typeof value.debtEnabled !== "boolean") return false;
  if (!isFiniteNumber(value.debtOutstandingPrincipalSUSD)) return false;
  if (!isFiniteNumber(value.debtInterestPayableSUSD)) return false;
  if (!isSnapshotDebtPolicy(value.debtPolicy)) return false;
  if (!Array.isArray(value.debtContracts)) return false;
  if (!value.debtContracts.every((contract) => isSnapshotDebtContract(contract))) return false;
  if (!isFiniteNumber(value.population)) return false;
  if (!isFiniteNumber(value.workingAgePopulation)) return false;
  if (!isFiniteNumber(value.employedWorkers)) return false;
  if (!isFiniteNumber(value.householdCashSUSD)) return false;
  if (!isFiniteNumber(value.estimatedDailyWageBaseSUSD)) return false;
  if (!isFiniteNumber(value.estimatedDailyTaxableWageBaseSUSD)) return false;
  if (!isIntegerIn(value.estimatedWageEarningBlockCount, 0, 1_000_000)) return false;
  if (!isFiniteNumber(value.businessTaxBaseMonthToDateSUSD)) return false;
  if (!isBudgetMonthToDate(value.budgetMonthToDate)) return false;
  if (!isFiniteNumber(value.literacy)) return false;
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
  if (!isFiniteNumber(value.constructionInProgressSUSD)) return false;
  if (!isFiniteNumber(value.publicCapitalSUSD)) return false;
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

function isRegionSnapshot(value: unknown): value is RegionSnapshot {
  if (!isRecord(value)) return false;
  return (
    isIntegerIn(value.id, 0, 0xffff_ffff) &&
    isString(value.key, 128) &&
    isString(value.name, 256) &&
    isNullableId(value.countryId) &&
    isNullableId(value.marketId) &&
    isFiniteNumber(value.population) &&
    isIntegerIn(value.buildingCount, 0, 1_000_000)
  );
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
  if (!isNumberArray(value.regionIds)) return false;
  if (!Array.isArray(value.prices)) return false;
  return value.prices.every((price) => {
    if (!isRecord(price)) return false;
    return (
      isIntegerIn(price.goodId, 0, 0xffff_ffff) &&
      isString(price.goodKey, 64) &&
      isString(price.goodName, 256) &&
      isString(price.unitLabel, 64) &&
      isFiniteNumber(price.priceSUSD) &&
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
  if (!isNumberArray(value.regionIds) || !isNumberArray(value.marketIds)) return false;
  for (const key of [
    "population",
    "workingAgePopulation",
    "employedWorkers",
    "treasuryCashSUSD",
    "hardshipPopulationShare",
    "literacy",
    "wealthLevel",
    "militancy",
    "militaryPersonnel",
  ] as const) {
    if (!isFiniteNumber(value[key])) return false;
  }
  if (
    value.latestNetFiscalResultSUSD !== null &&
    !isFiniteNumber(value.latestNetFiscalResultSUSD)
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
  if (!Array.isArray(value.regions) || !value.regions.every(isRegionSnapshot)) return false;
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
