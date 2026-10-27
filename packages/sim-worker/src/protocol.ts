/**
 * Versioned Century worker protocol and immutable UI snapshot contract.
 *
 * This module is intentionally free of simulation, Node, React Native, and DOM
 * imports. The app may import it directly; it contains only plain data contracts,
 * protocol constants, and runtime validation of untrusted messages.
 */

export const PROTOCOL_VERSION = 6 as const;
export const MAX_PROTOCOL_ID_LENGTH = 128;
export const MAX_STEP_TICKS = 1_000;
export const MAX_LOAD_SAVE_LENGTH = 64 * 1024 * 1024;
export const MAX_SNAPSHOT_LEDGER_MONTHS = 12;
export const MAX_SNAPSHOT_ANNUAL_REPORTS = 12;
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
export const SPEED_VALUES = [1, 2, 5, 10] as const;
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

export interface SetConstructionPausedActionDto {
  readonly kind: "set-construction-paused";
  readonly countryId: number;
  readonly projectId: number;
  readonly paused: boolean;
}

/** Every action the player UI may request. */
export type CountryActionDto =
  | FiscalPolicyActionDto
  | IssueDebtActionDto
  | RepayDebtActionDto
  | SetDebtPolicyActionDto
  | StartConstructionActionDto
  | CancelConstructionActionDto
  | SetConstructionPausedActionDto;

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

/** Buildable public-construction project type derived from validated data. */
export interface SnapshotProjectType {
  readonly definitionId: number;
  readonly key: string;
  readonly name: string;
  readonly constructionCostSUSD: number;
  readonly constructionWorkers: number;
  readonly plannedJobs: number;
  readonly dailyUpkeepSUSDAtLevelOne: number;
  readonly workingCapitalSUSD: number;
  readonly outputs: readonly SnapshotProjectOutput[];
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
  readonly progress: number;
  readonly remainingSUSD: number;
  readonly lastWorkers: number;
  readonly blockedReason: "labor" | "funds" | null;
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

export interface SnapshotFiscalTotals {
  readonly periodStartDay: number;
  readonly periodEndDay: number;
  readonly incomeTaxSUSD: number;
  readonly welfareExpenseSUSD: number;
  readonly interestExpenseSUSD: number;
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
  readonly netFiscalResultSUSD: number;
  readonly treasuryCashEndSUSD: number;
  readonly debtLiabilityEndSUSD: number;
  readonly interestPayableEndSUSD: number;
  readonly correctionCount: number;
}

export interface CountrySnapshot {
  readonly id: number;
  readonly tag: string;
  readonly name: string;
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
}

export interface RegionSnapshot {
  readonly id: number;
  readonly key: string;
  readonly name: string;
  readonly countryId: number | null;
  readonly marketId: number | null;
  readonly population: number;
  readonly buildingCount: number;
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
  readonly label: string;
  readonly regionIds: readonly number[];
  readonly prices: readonly MarketPriceSnapshot[];
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
  readonly countries: readonly CountrySnapshot[];
  readonly regions: readonly RegionSnapshot[];
  readonly markets: readonly MarketSnapshot[];
  readonly goods: readonly GoodSnapshot[];
  /** Static authored need tiers, used for evidence-based diagnosis. */
  readonly needTiers: readonly SnapshotNeedTier[];
  /** Validated buildable public-construction project types. */
  readonly projectTypes: readonly SnapshotProjectType[];
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

function isFiscalTotals(value: unknown): value is SnapshotFiscalTotals {
  if (!isRecord(value)) return false;
  return (
    isIntegerIn(value.periodStartDay, 0, 36_524) &&
    isIntegerIn(value.periodEndDay, 0, 36_524) &&
    isFiniteNumber(value.incomeTaxSUSD) &&
    isFiniteNumber(value.welfareExpenseSUSD) &&
    isFiniteNumber(value.interestExpenseSUSD) &&
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

function isProjectType(value: unknown): value is SnapshotProjectType {
  if (!isRecord(value)) return false;
  if (!Array.isArray(value.outputs)) return false;
  return (
    isIntegerIn(value.definitionId, 0, 0xffff_ffff) &&
    isString(value.key, 128) &&
    isString(value.name, 256) &&
    isFiniteNumber(value.constructionCostSUSD) &&
    isIntegerIn(value.constructionWorkers, 1, 1_000_000) &&
    isFiniteNumber(value.plannedJobs) &&
    isFiniteNumber(value.dailyUpkeepSUSDAtLevelOne) &&
    isFiniteNumber(value.workingCapitalSUSD) &&
    value.outputs.every((output) => isProjectOutput(output))
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
    value.blockedReason !== "funds"
  ) {
    return false;
  }
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
    isFiniteNumber(value.progress) &&
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
  return isIntegerIn(value.idleWorkers, 0, 100_000_000) && isFiniteNumber(value.dailyWageSUSD);
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
  return isFiniteNumber(value.publicCapitalSUSD);
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
  if (!Array.isArray(value.countries) || !value.countries.every(isCountrySnapshot)) return false;
  if (
    value.playerCountryId !== null &&
    !value.countries.some((country) => country.id === value.playerCountryId)
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
    case "LOAD_RESULT": {
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
