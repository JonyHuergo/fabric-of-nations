/**
 * M6 deterministic country AI v1, player/AI action validation, and the
 * world-facing action application boundary.
 *
 * Design boundary (GDD §12):
 * - The decision function only receives a `CountryAIObservation`. That record
 *   contains own-country state plus public market-independent fiscal/need
 *   indicators; it never contains another country's treasury, fiscal policy,
 *   debt, or population blocks, and it never contains future events or the world
 *   seed.
 * - Decisions are pure and deterministic. No keyed random draw is used in v1;
 *   if a future rule needs one it must use the documented keyed RNG with a stable
 *   purpose id.
 * - The AI and a player call the same `validateCountryAction` /
 *   `applyCountryAction` path. An action is validated before any mutation and the
 *   candidate world is validated before publication.
 * - AI evaluation runs at the start of the economic day (pipeline step 2), every
 *   seven days per country, staggered by stable country id.
 *
 * M6's only implemented action is setting the existing M4c fiscal policy
 * (`incomeTaxRate`, `welfareBudgetRUSDPerYear`). Construction queues, infrastructure
 * priorities, laws, debt actions, and diplomacy/military actions are not
 * implemented because their underlying systems do not exist yet (D-058).
 */

import {
  assertValidDayIndex,
  dayIndexToCivilDate,
  daysInYear,
  isTerminalDayIndex,
} from "../calendar.js";
import { CAMPAIGN_TERMINAL_DAY_INDEX, MAX_RECENT_WARNINGS } from "../constants.js";
import { MONEY_TOLERANCE_RUSD } from "../population/constants.js";
import { populationTotal } from "../population/state.js";
import type { Day, Id, MoneyRUSD, Rate } from "../types.js";
import { assertValidWorld, type World } from "../world.js";
import {
  assertValidCountryAIState,
  isCountryAIGoalId,
} from "./aiState.js";
import {
  AI_EVALUATION_PERIOD_DAYS,
  AI_HARDSHIP_MIN_TAX_RATE,
  AI_HARDSHIP_POPULATION_SHARE,
  AI_HARDSHIP_SUBSISTENCE_DAYS,
  AI_MAX_TAX_RATE,
  AI_MONEY_DECIMALS,
  AI_POLICY_MONEY_EPSILON,
  AI_POLICY_RATE_EPSILON,
  AI_TAX_RATE_DECIMALS,
  AI_TAX_STEP,
  AI_TREASURY_BUFFER_MONTHS,
  AI_UNREST_MILITANCY_THRESHOLD,
  AI_WELFARE_ADJUSTMENT_RELATIVE_THRESHOLD,
  AI_WELFARE_REVENUE_SHARE,
  MAX_AI_ACTION_SUMMARY_LENGTH,
  MAX_DEBT_PRINCIPAL_RUSD,
  MAX_FISCAL_BUDGET_RUSD_PER_YEAR,
  MAX_TRADE_QUOTA_QUANTITY,
} from "./constants.js";
import { assertValidFiscalPolicy } from "./country.js";
import { createTradePolicyState } from "./trade.js";
import { applyMonetaryPolicy, validateMonetaryPolicy } from "./monetary.js";
import { applyMilitaryAction, validateMilitaryAction } from "./military.js";
import { debtOutstandingPrincipal } from "./debtPolicy.js";
import {
  cancelConstruction,
  setConstructionPaused,
  startConstruction,
  validateConstructionCancel,
  validateConstructionPause,
  validateConstructionStart,
} from "./construction.js";
import {
  setIndustrialPolicy,
  supportPublicEnterprise,
  validateIndustrialPolicyInput,
  validatePublicEnterpriseSupport,
} from "./industrialPolicy.js";
import {
  proposeLaw,
  setInstitutionFunding,
  validateInstitutionFunding,
  validateLawProposal,
} from "./politicsActions.js";
import { effectiveTaxRateBounds } from "./politics.js";
import {
  cancelResearch,
  startResearch,
  validateEducationFunding,
  validateResearchCancel,
  validateResearchStaffShare,
  validateResearchStart,
} from "./technology.js";
import {
  validateHealthStaffShare,
  validateTrainingBudget,
  validateTrainingStipend,
  validateTrainingStaffShare,
} from "./labor.js";
import {
  issueGovernmentDebt,
  repayGovernmentDebt,
  validateDebtIssuance,
  validateDebtRepayment,
} from "./debt.js";
import { governmentPeriodTotals } from "./period.js";
import type {
  ConstructionProject,
  Country,
  CountryAIGoalId,
  CountryAIState,
  DebtContract,
  DebtPolicy,
  EconomyDefinitions,
  FiscalPolicy,
  FinancialAccount,
  IndustrialPolicy,
  MonetaryRegime,
  CasusBelli,
  PeaceTermKind,
} from "./types.js";

/**
 * Set the complete E2 fiscal policy. Schedule, eligibility, business-tax, and
 * reserve fields are part of the same validated action so a policy change can
 * never silently leave a stale schedule or reserve target in place.
 */
export interface SetFiscalPolicyAction {
  readonly kind: "set-fiscal-policy";
  readonly countryId: Id;
  /** Day the action is offered; must equal `World.dayIndex`. */
  readonly dayIndex: Day;
  readonly source: "player" | "ai";
  /** Dimensionless flat rate on taxable realized wages, 0..1. */
  readonly incomeTaxRate: Rate;
  /** Per-pop-block annual wage exemption in nominal RUSD. */
  readonly incomeTaxAllowanceRUSDPerYear: MoneyRUSD;
  /** Nominal annual welfare expenditure target in RUSD. */
  readonly welfareBudgetRUSDPerYear: MoneyRUSD;
  /** Inclusive block wealth ceiling for welfare eligibility, 0..99. */
  readonly welfareMaxWealthLevel: number;
  /** Dimensionless rate on the positive monthly building net result, 0..1. */
  readonly businessProfitTaxRate: Rate;
  /** Treasury liquidity floor in nominal RUSD. */
  readonly reserveTargetRUSD: MoneyRUSD;
}

/**
 * Issue one discretionary debt contract to the country's designated creditor,
 * within the existing contract, ceiling, and creditor-cash rules.
 */
export interface IssueDebtAction {
  readonly kind: "issue-debt";
  readonly countryId: Id;
  readonly dayIndex: Day;
  readonly source: "player" | "ai";
  /** Principal to borrow in nominal RUSD. */
  readonly amountRUSD: MoneyRUSD;
}

/** Repay part or all of one outstanding contract's principal early. */
export interface RepayDebtAction {
  readonly kind: "repay-debt";
  readonly countryId: Id;
  readonly dayIndex: Day;
  readonly source: "player" | "ai";
  readonly contractId: Id;
  /** Principal to repay in nominal RUSD. */
  readonly amountRUSD: MoneyRUSD;
}

/**
 * Change the player-controlled debt policy within the existing M5b contract
 * model: whether a maturing contract is refinanced, and the outstanding-principal
 * ceiling. The creditor, coupon, and term remain scenario/contract inputs.
 */
export interface SetDebtPolicyAction {
  readonly kind: "set-debt-policy";
  readonly countryId: Id;
  readonly dayIndex: Day;
  readonly source: "player" | "ai";
  readonly refinanceOnMaturity: boolean;
  readonly maxOutstandingPrincipalRUSD: MoneyRUSD;
}

/** Start one E3 public-construction project in a country-owned region. */
export interface StartConstructionAction {
  readonly kind: "start-construction";
  readonly countryId: Id;
  readonly dayIndex: Day;
  readonly source: "player" | "ai";
  readonly regionId: Id;
  readonly definitionId: Id;
}

/** Cancel one non-terminal construction project. */
export interface CancelConstructionAction {
  readonly kind: "cancel-construction";
  readonly countryId: Id;
  readonly dayIndex: Day;
  readonly source: "player" | "ai";
  readonly projectId: Id;
}

/** Pause or resume one non-terminal construction project. */
export interface SetConstructionPausedAction {
  readonly kind: "set-construction-paused";
  readonly countryId: Id;
  readonly dayIndex: Day;
  readonly source: "player" | "ai";
  readonly projectId: Id;
  readonly paused: boolean;
}

/** Set the country's sectoral production-subsidy rates. */
export interface SetIndustrialPolicyAction {
  readonly kind: "set-industrial-policy";
  readonly countryId: Id;
  readonly dayIndex: Day;
  readonly source: "player" | "ai";
  readonly sectorSubsidyRates: readonly number[];
}

/** Contribute treasury capital to an existing state-owned enterprise. */
export interface SupportPublicEnterpriseAction {
  readonly kind: "support-public-enterprise";
  readonly countryId: Id;
  readonly dayIndex: Day;
  readonly source: "player" | "ai";
  readonly buildingId: Id;
  readonly amountRUSD: MoneyRUSD;
}

/** M8: propose, change, or repeal a law (target may be the slot's base law). */
export interface ProposeLawAction {
  readonly kind: "propose-law";
  readonly countryId: Id;
  readonly dayIndex: Day;
  readonly source: "player" | "ai";
  readonly lawId: Id;
}

/** M8: set the annual state-administration funding target. */
export interface SetInstitutionFundingAction {
  readonly kind: "set-institution-funding";
  readonly countryId: Id;
  readonly dayIndex: Day;
  readonly source: "player" | "ai";
  readonly annualRUSD: MoneyRUSD;
}

/** M9: set the active research project. */
export interface StartResearchAction {
  readonly kind: "start-research";
  readonly countryId: Id;
  readonly dayIndex: Day;
  readonly source: "player" | "ai";
  readonly technologyId: Id;
}

/** M9: cancel the active research project, retaining its accumulated work. */
export interface CancelResearchAction {
  readonly kind: "cancel-research";
  readonly countryId: Id;
  readonly dayIndex: Day;
  readonly source: "player" | "ai";
}

/** M9: set the annual education/research payroll target. */
export interface SetEducationFundingAction {
  readonly kind: "set-education-funding";
  readonly countryId: Id;
  readonly dayIndex: Day;
  readonly source: "player" | "ai";
  readonly annualRUSD: MoneyRUSD;
}

/** M9: set the share of academic staff time assigned to research. */
export interface SetResearchStaffShareAction {
  readonly kind: "set-research-staff-share";
  readonly countryId: Id;
  readonly dayIndex: Day;
  readonly source: "player" | "ai";
  readonly share: Rate;
}

/** E5: set the annual training provider budget. */
export interface SetTrainingBudgetAction {
  readonly kind: "set-training-budget";
  readonly countryId: Id;
  readonly dayIndex: Day;
  readonly source: "player" | "ai";
  readonly annualRUSD: MoneyRUSD;
}

/** E5: set the annual training stipend per trainee. */
export interface SetTrainingStipendAction {
  readonly kind: "set-training-stipend";
  readonly countryId: Id;
  readonly dayIndex: Day;
  readonly source: "player" | "ai";
  readonly annualRUSD: MoneyRUSD;
}

/** E5: set the share of academic staff time assigned to vocational training. */
export interface SetTrainingStaffShareAction {
  readonly kind: "set-training-staff-share";
  readonly countryId: Id;
  readonly dayIndex: Day;
  readonly source: "player" | "ai";
  readonly share: Rate;
}

/** E5: set the share of administration clerk staff assigned to public health. */
export interface SetHealthStaffShareAction {
  readonly kind: "set-health-staff-share";
  readonly countryId: Id;
  readonly dayIndex: Day;
  readonly source: "player" | "ai";
  readonly share: Rate;
}

/** E6a: set the country's tariff schedule, monthly import quotas, and export restrictions. */
export interface SetTradePolicyAction {
  readonly kind: "set-trade-policy";
  readonly countryId: Id;
  readonly dayIndex: Day;
  readonly source: "player" | "ai";
  readonly tariffRates: readonly Rate[];
  readonly importQuotaQuantity: readonly (number | null)[];
  readonly exportRestricted: readonly boolean[];
}

/** M10: declare war with a documented casus belli. */
export interface DeclareWarAction {
  readonly kind: "declare-war";
  readonly countryId: Id;
  readonly dayIndex: Day;
  readonly source: "player" | "ai";
  readonly targetCountryId: Id;
  readonly casusBelli: CasusBelli;
}

/** M10: offer peace terms to the other belligerent. */
export interface OfferPeaceAction {
  readonly kind: "offer-peace";
  readonly countryId: Id;
  readonly dayIndex: Day;
  readonly source: "player" | "ai";
  readonly warId: Id;
  readonly terms: PeaceTermKind;
}

/** M10: accept a pending peace offer addressed to this country. */
export interface AcceptPeaceAction {
  readonly kind: "accept-peace";
  readonly countryId: Id;
  readonly dayIndex: Day;
  readonly source: "player" | "ai";
  readonly warId: Id;
  readonly offerId: Id;
}

/** M10: recruit an army from a region's people and treasury. */
export interface RecruitArmyAction {
  readonly kind: "recruit-army";
  readonly countryId: Id;
  readonly dayIndex: Day;
  readonly source: "player" | "ai";
  readonly regionId: Id;
  readonly personnel: number;
  readonly equipmentUnits?: number;
}

/** M10: deploy a ready army to a legal target region. */
export interface DeployArmyAction {
  readonly kind: "deploy-army";
  readonly countryId: Id;
  readonly dayIndex: Day;
  readonly source: "player" | "ai";
  readonly armyId: Id;
  readonly targetRegionId: Id;
}

/** E6b: set the monetary regime/parity and perform a reserve or currency operation. */
export interface SetMonetaryPolicyAction {
  readonly kind: "set-monetary-policy";
  readonly countryId: Id;
  readonly dayIndex: Day;
  readonly source: "player" | "ai";
  readonly regime: MonetaryRegime;
  readonly parityRusdPerUnit: number | null;
  readonly reserveTransferRUSD: number;
  readonly currencyConversionRUSD: number;
}

/** Every implemented country action. */
export type CountryAction =
  | SetFiscalPolicyAction
  | IssueDebtAction
  | RepayDebtAction
  | SetDebtPolicyAction
  | StartConstructionAction
  | CancelConstructionAction
  | SetConstructionPausedAction
  | SetIndustrialPolicyAction
  | SupportPublicEnterpriseAction
  | ProposeLawAction
  | SetInstitutionFundingAction
  | StartResearchAction
  | CancelResearchAction
  | SetEducationFundingAction
  | SetResearchStaffShareAction
  | SetTrainingBudgetAction
  | SetTrainingStipendAction
  | SetTrainingStaffShareAction
  | SetHealthStaffShareAction
  | SetTradePolicyAction
  | SetMonetaryPolicyAction
  | DeclareWarAction
  | OfferPeaceAction
  | AcceptPeaceAction
  | RecruitArmyAction
  | DeployArmyAction;

/** Explicit validation result. Invalid actions never mutate the world. */
export interface CountryActionValidation {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

/** Result of a successful, atomically applied player/AI action. */
export interface CountryActionApplication {
  readonly countryId: Id;
  readonly dayIndex: Day;
  readonly kind: CountryAction["kind"];
  readonly changed: boolean;
  readonly previousFiscal: FiscalPolicy;
  readonly fiscal: FiscalPolicy;
  readonly previousDebt: DebtPolicy;
  readonly debt: DebtPolicy;
  /** New or affected contract for debt actions, else null. */
  readonly debtContract: DebtContract | null;
  /** Principal repaid by a `repay-debt` action, else zero. */
  readonly principalPaidRUSD: MoneyRUSD;
  /** Started/cancelled/paused project for construction actions, else null. */
  readonly constructionProject: ConstructionProject | null;
  /** New industrial policy for `set-industrial-policy`, else null. */
  readonly industrialPolicy?: IndustrialPolicy | null;
  /** Supported enterprise for `support-public-enterprise`, else null. */
  readonly publicEnterpriseSupport?: {
    readonly buildingId: Id;
    readonly amountRUSD: MoneyRUSD;
  } | null;
  /** Law transition for `propose-law`, else null. */
  readonly lawAction?: {
    readonly lawId: Id;
    readonly transitionId: Id;
    readonly effectiveDay: Day;
    readonly support: number;
  } | null;
  /** Institution funding change for `set-institution-funding`, else null. */
  readonly institutionFunding?: {
    readonly previousAnnualRUSD: MoneyRUSD;
    readonly annualRUSD: MoneyRUSD;
    readonly changed: boolean;
  } | null;
  /** Started research technology for `start-research`, else null. */
  readonly researchAction?: {
    readonly technologyId: Id;
    readonly startedDay: Day;
  } | null;
  /** Cancelled research technology for `cancel-research`, else null. */
  readonly cancelledResearchTechnologyId?: Id | null;
  /** Education funding/share change for the M9 policy actions, else null. */
  readonly educationAction?: {
    readonly previousFundedAnnualRUSD: MoneyRUSD;
    readonly fundedAnnualRUSD: MoneyRUSD;
    readonly previousResearchStaffShare: Rate;
    readonly researchStaffShare: Rate;
  } | null;
  /** E5 training/health policy change, else null. */
  readonly laborAction?: {
    readonly previousTrainingBudgetRUSDPerYear: MoneyRUSD;
    readonly trainingBudgetRUSDPerYear: MoneyRUSD;
    readonly previousTrainingStipendPerTraineeRUSDPerYear: MoneyRUSD;
    readonly trainingStipendPerTraineeRUSDPerYear: MoneyRUSD;
    readonly previousTrainingStaffShare: Rate;
    readonly trainingStaffShare: Rate;
    readonly previousHealthStaffShare: Rate;
    readonly healthStaffShare: Rate;
  } | null;
  /** E6a trade-policy change, else null. */
  readonly tradeAction?: {
    readonly previousTariffRates: readonly Rate[];
    readonly tariffRates: readonly Rate[];
    readonly previousImportQuotaQuantity: readonly (number | null)[];
    readonly importQuotaQuantity: readonly (number | null)[];
    readonly previousExportRestricted: readonly boolean[];
    readonly exportRestricted: readonly boolean[];
  } | null;
  /** M10 military/diplomatic action result, else null. */
  readonly militaryAction?: {
    readonly kind: string;
    readonly warId: Id | null;
    readonly offerId: Id | null;
    readonly armyId: Id | null;
    readonly regionId: Id | null;
    readonly personnel: number;
    readonly equipmentUnits: number;
    readonly spentRUSD: MoneyRUSD;
  } | null;
  /** E6b monetary operation applied by the action, else null. */
  readonly monetaryAction?: {
    readonly currencyId: Id;
    readonly regime: MonetaryRegime;
    readonly parityRusdPerUnit: number;
    readonly valuationRusdPerUnit: number;
    readonly reserveTransferRUSD: MoneyRUSD;
    readonly currencyConversionRUSD: MoneyRUSD;
    readonly currencyIssuedUnits: number;
    readonly revaluationRUSD: MoneyRUSD;
  } | null;
}

/** One observed population block. Own-country blocks only. */
export interface CountryAIObservedBlock {
  readonly popBlockId: Id;
  readonly regionId: Id;
  readonly population: number;
  readonly literacy: Rate;
  readonly wealthLevel: number;
  readonly militancy: Rate;
  readonly unmetSubsistenceDays: number;
  readonly unmetBasicDays: number;
  readonly comfortFulfilledDays: number;
}

/** Own-country fiscal totals from the most recently closed month. */
export interface CountryAIObservedPeriod {
  readonly periodStartDay: Day;
  readonly periodEndDay: Day;
  readonly incomeTaxRUSD: number;
  readonly welfarePaidRUSD: number;
  readonly interestExpenseRUSD: number;
}

/** Own-country debt exposure. Contracts held by others are not exposed. */
export interface CountryAIObservedDebt {
  readonly enabled: boolean;
  readonly outstandingPrincipalRUSD: number;
}

/**
 * The complete information set available to one country's AI. This is the only
 * input to `planCountryActions`, which makes the hidden-information boundary
 * explicit and testable.
 */
export interface CountryAIObservation {
  readonly countryId: Id;
  readonly dayIndex: Day;
  readonly fiscal: FiscalPolicy;
  readonly treasuryCashRUSD: number;
  readonly regionIds: readonly Id[];
  readonly population: number;
  readonly blocks: readonly CountryAIObservedBlock[];
  readonly lastClosedPeriod: CountryAIObservedPeriod | null;
  readonly debt: CountryAIObservedDebt;
}

/** Pure decision output for one evaluation. */
export interface CountryAIDecision {
  readonly goalId: CountryAIGoalId;
  readonly actions: readonly CountryAction[];
  /** Bounded diagnostic summary; never an input to policy. */
  readonly summary: string;
}

/** Per-country evaluation result. */
export interface CountryAIEvaluationResult {
  readonly countryId: Id;
  readonly goalId: CountryAIGoalId;
  readonly proposedActionCount: number;
  readonly appliedActionCount: number;
  readonly rejectedActionCount: number;
  readonly summary: string;
}

/** Result of one AI phase. Empty when the policy is disabled or nothing is due. */
export interface CountryAIPhaseResult {
  readonly dayIndex: Day;
  readonly evaluated: readonly CountryAIEvaluationResult[];
  readonly appliedActionCount: number;
  readonly rejectedActionCount: number;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function clamp(value: number, minimum: number, maximum: number): number {
  if (value < minimum) return minimum;
  if (value > maximum) return maximum;
  return value;
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function toleranceFor(...values: readonly number[]): number {
  let scale = 1;
  for (const value of values) scale = Math.max(scale, Math.abs(value));
  return MONEY_TOLERANCE_RUSD * scale;
}

function treasuryAccountOf(world: World, countryId: Id): FinancialAccount {
  const account = world.finance.accounts.find(
    (candidate) =>
      candidate.ownerKind === "country" &&
      candidate.ownerId === countryId &&
      candidate.subtype === "treasury-cash",
  );
  if (account === undefined) {
    throw new RangeError(`country ${String(countryId)} has no treasury-cash account`);
  }
  return account;
}

/**
 * Build the exact information set one country may use. Other countries' private
 * state, future events, the seed, and the hidden contents of other households are
 * deliberately absent.
 */
export function buildCountryAIObservation(
  world: World,
  countryId: Id,
  dayIndex: Day,
): CountryAIObservation {
  const country = world.countries.find((candidate) => candidate.id === countryId);
  if (country === undefined) throw new RangeError(`unknown country ${String(countryId)}`);
  const regionIds = new Set(country.regionIds);
  const blocks: CountryAIObservedBlock[] = [];
  let population = 0;
  for (const block of [...world.popBlocks].sort((left, right) => left.id - right.id)) {
    if (!regionIds.has(block.regionId)) continue;
    const blockPopulation = populationTotal(block);
    population += blockPopulation;
    blocks.push({
      popBlockId: block.id,
      regionId: block.regionId,
      population: blockPopulation,
      literacy: block.literacy,
      wealthLevel: block.wealthLevel,
      militancy: block.militancy,
      unmetSubsistenceDays: block.unmetSubsistenceDays,
      unmetBasicDays: block.unmetBasicDays,
      comfortFulfilledDays: block.comfortFulfilledDays,
    });
  }
  const latestSummary = world.finance.periodSummaries.at(-1);
  let lastClosedPeriod: CountryAIObservedPeriod | null = null;
  if (latestSummary !== undefined) {
    const totals = governmentPeriodTotals(world.finance, latestSummary).find(
      (entry) => entry.countryId === countryId,
    );
    if (totals === undefined) {
      throw new RangeError(
        `closed period ${String(latestSummary.periodEndDay)} has no fiscal totals for country ${String(countryId)}`,
      );
    }
    lastClosedPeriod = {
      periodStartDay: latestSummary.periodStartDay,
      periodEndDay: latestSummary.periodEndDay,
      incomeTaxRUSD: totals.incomeTaxRevenueRUSD,
      welfarePaidRUSD: totals.welfareExpenseRUSD,
      interestExpenseRUSD: totals.interestExpenseRUSD,
    };
  }
  return {
    countryId,
    dayIndex,
    fiscal: { ...country.fiscal },
    treasuryCashRUSD: treasuryAccountOf(world, countryId).balanceRUSD,
    regionIds: [...country.regionIds],
    population,
    blocks,
    lastClosedPeriod,
    debt: {
      enabled: country.debt.enabled,
      outstandingPrincipalRUSD: debtOutstandingPrincipal(
        world.finance.debtContracts,
        countryId,
      ),
    },
  };
}

function annualize(periodAmount: number, periodDays: number, yearDays: number): number {
  if (!(periodDays > 0) || !(periodAmount > 0)) return 0;
  return (periodAmount * yearDays) / periodDays;
}

function reliefHardship(observation: CountryAIObservation): {
  readonly hardship: boolean;
  readonly hardshipPopulationShare: number;
  readonly weightedMilitancy: number;
} {
  let hardshipPopulation = 0;
  let weightedMilitancy = 0;
  for (const block of observation.blocks) {
    if (block.unmetSubsistenceDays >= AI_HARDSHIP_SUBSISTENCE_DAYS) {
      hardshipPopulation += block.population;
    }
    weightedMilitancy += block.militancy * block.population;
  }
  const share =
    observation.population > 0 ? hardshipPopulation / observation.population : 0;
  const militancy =
    observation.population > 0 ? weightedMilitancy / observation.population : 0;
  return {
    hardship:
      share >= AI_HARDSHIP_POPULATION_SHARE ||
      militancy >= AI_UNREST_MILITANCY_THRESHOLD,
    hardshipPopulationShare: share,
    weightedMilitancy: militancy,
  };
}

/**
 * Deterministic M6 fiscal decision.
 *
 * Priority follows GDD §12.1: solvency before relief. The AI never borrows,
 * never changes debt policy, never creates a spendable pool, and never uses an
 * outcome variable as a direct lever. It only changes the two existing fiscal
 * policy fields.
 */
export function planCountryActions(observation: CountryAIObservation): CountryAIDecision {
  const periodDays =
    observation.lastClosedPeriod === null
      ? 0
      : observation.lastClosedPeriod.periodEndDay -
        observation.lastClosedPeriod.periodStartDay +
        1;
  const yearDays =
    observation.lastClosedPeriod === null
      ? daysInYear(dayIndexToCivilDate(observation.dayIndex).year)
      : daysInYear(dayIndexToCivilDate(observation.lastClosedPeriod.periodEndDay).year);
  const annualTaxRevenue =
    observation.lastClosedPeriod === null
      ? 0
      : annualize(observation.lastClosedPeriod.incomeTaxRUSD, periodDays, yearDays);
  const annualWelfarePaid =
    observation.lastClosedPeriod === null
      ? 0
      : annualize(observation.lastClosedPeriod.welfarePaidRUSD, periodDays, yearDays);
  const annualInterest =
    observation.lastClosedPeriod === null
      ? 0
      : annualize(observation.lastClosedPeriod.interestExpenseRUSD, periodDays, yearDays);
  const committedWelfare = Math.max(
    observation.fiscal.welfareBudgetRUSDPerYear,
    annualWelfarePaid,
  );
  const annualOutlays = committedWelfare + annualInterest;
  const bufferTarget =
    (AI_TREASURY_BUFFER_MONTHS / 12) * annualOutlays;
  // Treasury reserves are a solvency buffer, not an ongoing spending target.
  // The welfare target is a stable share of observed tax revenue; v1 does not
  // chase a growing surplus with ever-larger transfers.
  const affordableWelfare = annualTaxRevenue * AI_WELFARE_REVENUE_SHARE;
  const solvencyTolerance = toleranceFor(
    annualOutlays,
    annualTaxRevenue,
    observation.treasuryCashRUSD,
  );
  const lowTreasury =
    observation.treasuryCashRUSD + solvencyTolerance < bufferTarget;
  // Revenue is unknown before the first close, not zero. Do not infer a deficit
  // from missing history; the first observed period supplies the revenue basis.
  const runningDeficit =
    observation.lastClosedPeriod !== null &&
    annualOutlays > annualTaxRevenue + solvencyTolerance;
  const { hardship, hardshipPopulationShare, weightedMilitancy } =
    reliefHardship(observation);

  let goalId: CountryAIGoalId = "maintain";
  let targetTax = observation.fiscal.incomeTaxRate;
  let targetWelfare = observation.fiscal.welfareBudgetRUSDPerYear;

  if (lowTreasury || runningDeficit) {
    goalId = "restore-solvency";
    targetTax = Math.min(
      AI_MAX_TAX_RATE,
      roundTo(observation.fiscal.incomeTaxRate + AI_TAX_STEP, AI_TAX_RATE_DECIMALS),
    );
    targetWelfare = Math.min(
      observation.fiscal.welfareBudgetRUSDPerYear,
      Math.max(0, affordableWelfare),
    );
  } else if (hardship) {
    goalId = "relieve-hardship";
    targetTax = Math.max(observation.fiscal.incomeTaxRate, AI_HARDSHIP_MIN_TAX_RATE);
    targetWelfare = Math.max(
      observation.fiscal.welfareBudgetRUSDPerYear,
      Math.max(0, affordableWelfare),
    );
  }

  targetTax = clamp(roundTo(targetTax, AI_TAX_RATE_DECIMALS), 0, 1);
  targetWelfare = Math.min(
    MAX_FISCAL_BUDGET_RUSD_PER_YEAR,
    Math.max(0, roundTo(targetWelfare, AI_MONEY_DECIMALS)),
  );

  const currentWelfare = observation.fiscal.welfareBudgetRUSDPerYear;
  const welfareDelta = Math.abs(targetWelfare - currentWelfare);
  const welfareChanged =
    welfareDelta > AI_POLICY_MONEY_EPSILON &&
    (currentWelfare <= 0 ||
      welfareDelta / currentWelfare >= AI_WELFARE_ADJUSTMENT_RELATIVE_THRESHOLD);
  const actionNeeded =
    Math.abs(targetTax - observation.fiscal.incomeTaxRate) > AI_POLICY_RATE_EPSILON ||
    welfareChanged;
  const actions: CountryAction[] = actionNeeded
    ? [
        {
          kind: "set-fiscal-policy",
          countryId: observation.countryId,
          dayIndex: observation.dayIndex,
          source: "ai",
          incomeTaxRate: targetTax,
          incomeTaxAllowanceRUSDPerYear:
            observation.fiscal.incomeTaxAllowanceRUSDPerYear,
          welfareBudgetRUSDPerYear: targetWelfare,
          welfareMaxWealthLevel: observation.fiscal.welfareMaxWealthLevel,
          businessProfitTaxRate: observation.fiscal.businessProfitTaxRate,
          reserveTargetRUSD: observation.fiscal.reserveTargetRUSD,
        },
      ]
    : [];
  const summary = actionNeeded
    ? `set fiscal policy tax=${targetTax.toFixed(AI_TAX_RATE_DECIMALS)} welfare=${targetWelfare.toFixed(AI_MONEY_DECIMALS)} (${goalId})`
    : `no policy change (${goalId}; hardship share=${hardshipPopulationShare.toFixed(3)}, militancy=${weightedMilitancy.toFixed(3)})`;
  return {
    goalId,
    actions,
    summary: summary.slice(0, MAX_AI_ACTION_SUMMARY_LENGTH),
  };
}

/**
 * Validate a country action without mutating the world.
 *
 * This is the single validation path used by a player and by the AI. Invalid
 * input is reported, never clamped. Player-sourced actions may only target the
 * designated player country, and AI-sourced actions may never target it, so a
 * client cannot use the shared path to bypass the control boundary.
 */
export function validateCountryAction(
  world: World,
  action: CountryAction,
  definitions?: EconomyDefinitions,
): CountryActionValidation {
  const errors: string[] = [];
  if (action === null || typeof action !== "object") {
    return { valid: false, errors: ["action must be an object"] };
  }
  if (
    action.kind !== "set-fiscal-policy" &&
    action.kind !== "issue-debt" &&
    action.kind !== "repay-debt" &&
    action.kind !== "set-debt-policy" &&
    action.kind !== "start-construction" &&
    action.kind !== "cancel-construction" &&
    action.kind !== "set-construction-paused" &&
    action.kind !== "set-industrial-policy" &&
    action.kind !== "support-public-enterprise" &&
    action.kind !== "propose-law" &&
    action.kind !== "set-institution-funding" &&
    action.kind !== "start-research" &&
    action.kind !== "cancel-research" &&
    action.kind !== "set-education-funding" &&
    action.kind !== "set-research-staff-share" &&
    action.kind !== "set-training-budget" &&
    action.kind !== "set-training-stipend" &&
    action.kind !== "set-training-staff-share" &&
    action.kind !== "set-health-staff-share" &&
    action.kind !== "set-trade-policy" &&
    action.kind !== "set-monetary-policy" &&
    action.kind !== "declare-war" &&
    action.kind !== "offer-peace" &&
    action.kind !== "accept-peace" &&
    action.kind !== "recruit-army" &&
    action.kind !== "deploy-army"
  ) {
    return {
      valid: false,
      errors: [
        'action.kind must be one of the implemented country actions',
      ],
    };
  }
  if (action.source !== "player" && action.source !== "ai") {
    errors.push('action.source must be "player" or "ai"');
  }
  if (!Number.isInteger(action.countryId) || action.countryId < 0) {
    errors.push("action.countryId must be a non-negative integer");
  }
  if (!Number.isInteger(action.dayIndex) || action.dayIndex < 0) {
    errors.push("action.dayIndex must be a non-negative integer");
  } else if (action.dayIndex !== world.dayIndex) {
    errors.push(
      `action.dayIndex ${String(action.dayIndex)} does not match world.dayIndex ${String(world.dayIndex)}`,
    );
  }
  if (isTerminalDayIndex(world.dayIndex)) {
    errors.push("the terminal 2000-01-01 boundary cannot apply a country action");
  }
  const country = world.countries.find((candidate) => candidate.id === action.countryId);
  if (country === undefined) {
    errors.push(`action.countryId ${String(action.countryId)} is not a registered country`);
  }
  if (country !== undefined && world.playerCountryId !== null) {
    if (action.source === "player" && action.countryId !== world.playerCountryId) {
      errors.push(
        `player actions may only target the designated player country ${String(world.playerCountryId)}`,
      );
    }
    if (action.source === "ai" && action.countryId === world.playerCountryId) {
      errors.push("the AI must not target the player-controlled country's policy");
    }
  }
  if (country !== undefined) {
    if (action.kind === "set-fiscal-policy") {
      try {
        assertValidFiscalPolicy(
          {
            incomeTaxRate: action.incomeTaxRate,
            incomeTaxAllowanceRUSDPerYear: action.incomeTaxAllowanceRUSDPerYear,
            welfareBudgetRUSDPerYear: action.welfareBudgetRUSDPerYear,
            welfareMaxWealthLevel: action.welfareMaxWealthLevel,
            businessProfitTaxRate: action.businessProfitTaxRate,
            reserveTargetRUSD: action.reserveTargetRUSD,
          },
          "action.fiscal",
        );
      } catch (error) {
        errors.push(errorMessage(error));
      }
      const incomeBounds = effectiveTaxRateBounds(country, definitions, "incomeTax");
      if (
        action.incomeTaxRate < incomeBounds.min ||
        action.incomeTaxRate > incomeBounds.max
      ) {
        errors.push(
          `action.incomeTaxRate must be in the statutory range ${String(incomeBounds.min)}..${String(incomeBounds.max)}`,
        );
      }
      const businessBounds = effectiveTaxRateBounds(
        country,
        definitions,
        "businessProfitTax",
      );
      if (
        action.businessProfitTaxRate < businessBounds.min ||
        action.businessProfitTaxRate > businessBounds.max
      ) {
        errors.push(
          `action.businessProfitTaxRate must be in the statutory range ${String(businessBounds.min)}..${String(businessBounds.max)}`,
        );
      }
    } else if (action.kind === "issue-debt") {
      try {
        validateDebtIssuance(world, {
          issuerCountryId: country.id,
          holderKind: country.debt.creditorKind,
          holderId: country.debt.creditorId,
          principalRUSD: action.amountRUSD,
          annualCouponRate: country.debt.annualCouponRate,
          termDays: country.debt.termDays,
        });
      } catch (error) {
        errors.push(errorMessage(error));
      }
    } else if (action.kind === "repay-debt") {
      try {
        validateDebtRepayment(world, {
          issuerCountryId: country.id,
          contractId: action.contractId,
          amountRUSD: action.amountRUSD,
        });
      } catch (error) {
        errors.push(errorMessage(error));
      }
    } else if (action.kind === "start-construction") {
      if (action.source === "ai") {
        errors.push("AI public construction is not implemented");
      }
      if (definitions === undefined) {
        errors.push("start-construction requires the validated economy definitions");
      } else {
        try {
          validateConstructionStart(world, definitions, {
            countryId: country.id,
            regionId: action.regionId,
            definitionId: action.definitionId,
          });
        } catch (error) {
          errors.push(errorMessage(error));
        }
      }
    } else if (action.kind === "cancel-construction") {
      if (action.source === "ai") {
        errors.push("AI public construction is not implemented");
      }
      try {
        validateConstructionCancel(world, {
          countryId: country.id,
          projectId: action.projectId,
        });
      } catch (error) {
        errors.push(errorMessage(error));
      }
    } else if (action.kind === "set-construction-paused") {
      if (action.source === "ai") {
        errors.push("AI public construction is not implemented");
      }
      try {
        validateConstructionPause(
          world,
          { countryId: country.id, projectId: action.projectId },
          action.paused,
        );
      } catch (error) {
        errors.push(errorMessage(error));
      }
    } else if (action.kind === "set-industrial-policy") {
      if (action.source === "ai") {
        errors.push("AI industrial policy is not implemented");
      }
      try {
        validateIndustrialPolicyInput(action.sectorSubsidyRates);
      } catch (error) {
        errors.push(errorMessage(error));
      }
    } else if (action.kind === "support-public-enterprise") {
      if (action.source === "ai") {
        errors.push("AI public-enterprise support is not implemented");
      }
      try {
        validatePublicEnterpriseSupport(world, {
          countryId: country.id,
          buildingId: action.buildingId,
          amountRUSD: action.amountRUSD,
        });
      } catch (error) {
        errors.push(errorMessage(error));
      }
    } else if (action.kind === "propose-law") {
      if (action.source === "ai") {
        errors.push("AI law proposals are not implemented in M8");
      }
      if (definitions === undefined) {
        errors.push("propose-law requires the validated economy definitions");
      } else {
        try {
          validateLawProposal(world, definitions, {
            countryId: country.id,
            lawId: action.lawId,
          });
        } catch (error) {
          errors.push(errorMessage(error));
        }
      }
    } else if (action.kind === "set-institution-funding") {
      if (action.source === "ai") {
        errors.push("AI institution funding is not implemented in M8");
      }
      try {
        validateInstitutionFunding(world, definitions, {
          countryId: country.id,
          annualRUSD: action.annualRUSD,
        });
      } catch (error) {
        errors.push(errorMessage(error));
      }
    } else if (action.kind === "start-research") {
      if (action.source === "ai") {
        errors.push("AI research selection is not implemented in M9");
      }
      try {
        validateResearchStart(world, definitions, {
          countryId: country.id,
          technologyId: action.technologyId,
        });
      } catch (error) {
        errors.push(errorMessage(error));
      }
    } else if (action.kind === "cancel-research") {
      if (action.source === "ai") {
        errors.push("AI research selection is not implemented in M9");
      }
      try {
        validateResearchCancel(world, definitions, { countryId: country.id });
      } catch (error) {
        errors.push(errorMessage(error));
      }
    } else if (action.kind === "set-education-funding") {
      if (action.source === "ai") {
        errors.push("AI education funding is not implemented in M9");
      }
      try {
        validateEducationFunding(world, definitions, {
          countryId: country.id,
          annualRUSD: action.annualRUSD,
        });
      } catch (error) {
        errors.push(errorMessage(error));
      }
    } else if (action.kind === "set-research-staff-share") {
      if (action.source === "ai") {
        errors.push("AI research staffing is not implemented in M9");
      }
      try {
        validateResearchStaffShare(world, definitions, {
          countryId: country.id,
          share: action.share,
        });
      } catch (error) {
        errors.push(errorMessage(error));
      }
    } else if (action.kind === "set-training-budget") {
      if (action.source === "ai") {
        errors.push("AI training policy is not implemented in E5");
      }
      try {
        validateTrainingBudget(world, definitions, {
          countryId: country.id,
          annualRUSD: action.annualRUSD,
        });
      } catch (error) {
        errors.push(errorMessage(error));
      }
    } else if (action.kind === "set-training-stipend") {
      if (action.source === "ai") {
        errors.push("AI training policy is not implemented in E5");
      }
      try {
        validateTrainingStipend(world, definitions, {
          countryId: country.id,
          annualRUSD: action.annualRUSD,
        });
      } catch (error) {
        errors.push(errorMessage(error));
      }
    } else if (action.kind === "set-training-staff-share") {
      if (action.source === "ai") {
        errors.push("AI training policy is not implemented in E5");
      }
      try {
        validateTrainingStaffShare(world, definitions, {
          countryId: country.id,
          share: action.share,
        });
      } catch (error) {
        errors.push(errorMessage(error));
      }
    } else if (action.kind === "set-trade-policy") {
      if (action.source === "ai") {
        errors.push("AI trade policy is not implemented in E6a");
      }
      if (definitions === undefined) {
        errors.push("set-trade-policy requires the validated economy definitions");
      } else {
        if (!world.trade.enabled) {
          errors.push(
            "this world has no authored transport routes, so trade policy would have no effect",
          );
        }
        try {
          const state = createTradePolicyState(
            {
              tariffRates: [...action.tariffRates],
              importQuotaQuantity: [...action.importQuotaQuantity],
              exportRestricted: [...action.exportRestricted],
            },
            definitions.goods.length,
            "action.trade",
          );
          for (let goodId = 0; goodId < state.importQuotaQuantity.length; goodId += 1) {
            const quota = state.importQuotaQuantity[goodId] ?? null;
            if (quota !== null && quota > MAX_TRADE_QUOTA_QUANTITY) {
              errors.push(
                `action.importQuotaQuantity[${String(goodId)}] must not exceed ${String(MAX_TRADE_QUOTA_QUANTITY)}`,
              );
            }
          }
        } catch (error) {
          errors.push(errorMessage(error));
        }
      }
    } else if (
      action.kind === "declare-war" ||
      action.kind === "offer-peace" ||
      action.kind === "accept-peace" ||
      action.kind === "recruit-army" ||
      action.kind === "deploy-army"
    ) {
      const militaryValidation = validateMilitaryAction(world, action);
      for (const error of militaryValidation.errors) errors.push(error);
    } else if (action.kind === "set-monetary-policy") {
      if (action.source === "ai") {
        errors.push("AI monetary policy is not implemented in E6b");
      }
      if (definitions === undefined) {
        errors.push("set-monetary-policy requires the validated economy definitions");
      }
      try {
        validateMonetaryPolicy(world, definitions, {
          countryId: country.id,
          regime: action.regime,
          parityRusdPerUnit: action.parityRusdPerUnit,
          reserveTransferRUSD: action.reserveTransferRUSD,
          currencyConversionRUSD: action.currencyConversionRUSD,
        });
      } catch (error) {
        errors.push(errorMessage(error));
      }
    } else if (action.kind === "set-health-staff-share") {
      if (action.source === "ai") {
        errors.push("AI health policy is not implemented in E5");
      }
      try {
        validateHealthStaffShare(world, definitions, {
          countryId: country.id,
          share: action.share,
        });
      } catch (error) {
        errors.push(errorMessage(error));
      }
    } else {
      try {
        validateDebtPolicyChange(world, country, action);
      } catch (error) {
        errors.push(errorMessage(error));
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Validate a debt-policy change against the existing M5b policy and contracts.
 * The ceiling may not fall below the country's current outstanding principal, so
 * a policy change cannot orphan or make existing debt non-conforming.
 */
function validateDebtPolicyChange(
  world: World,
  country: Country,
  action: SetDebtPolicyAction,
): void {
  if (!country.debt.enabled) {
    throw new RangeError(
      `country ${String(country.id)} has no enabled debt policy to update`,
    );
  }
  if (typeof action.refinanceOnMaturity !== "boolean") {
    throw new TypeError("action.refinanceOnMaturity must be a boolean");
  }
  const ceiling = action.maxOutstandingPrincipalRUSD;
  if (typeof ceiling !== "number" || !Number.isFinite(ceiling) || ceiling < 0) {
    throw new RangeError("action.maxOutstandingPrincipalRUSD must be a finite non-negative number");
  }
  if (ceiling > MAX_DEBT_PRINCIPAL_RUSD) {
    throw new RangeError(
      `action.maxOutstandingPrincipalRUSD must not exceed ${String(MAX_DEBT_PRINCIPAL_RUSD)}`,
    );
  }
  const outstanding = debtOutstandingPrincipal(world.finance.debtContracts, country.id);
  if (ceiling < outstanding - MONEY_TOLERANCE_RUSD) {
    throw new RangeError(
      `action.maxOutstandingPrincipalRUSD ${String(ceiling)} is below the outstanding principal ${String(outstanding)}`,
    );
  }
}

/**
 * Apply one validated country action atomically.
 *
 * The action is validated first, then the complete candidate world is validated
 * before publication. A failed validation leaves the original world unchanged.
 *
 * `options.validateWorld` defaults to true. The integrated day's AI phase passes
 * false (D-067/D-116 staged mode): a fiscal-policy action changes only the
 * country's fiscal policy, so the candidate policy is validated structurally and
 * the rest of the world is covered by the day's boundary validation.
 */
export function applyCountryAction(
  world: World,
  action: CountryAction,
  definitions?: EconomyDefinitions,
  options: { readonly validateWorld?: boolean } = {},
): CountryActionApplication {
  const validation = validateCountryAction(world, action, definitions);
  if (!validation.valid) {
    throw new RangeError(`invalid country action: ${validation.errors.join("; ")}`);
  }
  const index = world.countries.findIndex((candidate) => candidate.id === action.countryId);
  if (index < 0) throw new RangeError(`unknown country ${String(action.countryId)}`);
  const country = world.countries[index];
  if (country === undefined) throw new RangeError(`missing country ${String(action.countryId)}`);
  const previousFiscal: FiscalPolicy = { ...country.fiscal };
  const previousDebt: DebtPolicy = { ...country.debt };

  if (action.kind === "set-fiscal-policy") {
    const fiscal: FiscalPolicy = {
      incomeTaxRate: action.incomeTaxRate,
      incomeTaxAllowanceRUSDPerYear: action.incomeTaxAllowanceRUSDPerYear,
      welfareBudgetRUSDPerYear: action.welfareBudgetRUSDPerYear,
      welfareMaxWealthLevel: action.welfareMaxWealthLevel,
      businessProfitTaxRate: action.businessProfitTaxRate,
      reserveTargetRUSD: action.reserveTargetRUSD,
    };
    const changed = (
      Object.keys(fiscal) as (keyof FiscalPolicy)[]
    ).some((field) => fiscal[field] !== previousFiscal[field]);
    if (!changed) {
      return {
        countryId: country.id,
        dayIndex: action.dayIndex,
        kind: action.kind,
        previousFiscal,
        fiscal: previousFiscal,
        previousDebt,
        debt: previousDebt,
        debtContract: null,
        principalPaidRUSD: 0,
        constructionProject: null,
        changed: false,
      };
    }
    const candidateCountry: Country = { ...country, fiscal };
    if (options.validateWorld === false) {
      assertValidFiscalPolicy(fiscal, `countries[${String(index)}].fiscal`);
    } else {
      const candidateWorld: World = {
        ...world,
        countries: world.countries.map((entry, entryIndex) =>
          entryIndex === index ? candidateCountry : entry,
        ),
      };
      assertValidWorld(candidateWorld);
    }
    world.countries[index] = candidateCountry;
    return {
      countryId: country.id,
      dayIndex: action.dayIndex,
      kind: action.kind,
      previousFiscal,
      fiscal: { ...fiscal },
      previousDebt,
      debt: { ...candidateCountry.debt },
      debtContract: null,
      principalPaidRUSD: 0,
      constructionProject: null,
      changed: true,
    };
  }

  if (action.kind === "issue-debt") {
    const issuance = issueGovernmentDebt(world, {
      issuerCountryId: country.id,
      holderKind: country.debt.creditorKind,
      holderId: country.debt.creditorId,
      principalRUSD: action.amountRUSD,
      annualCouponRate: country.debt.annualCouponRate,
      termDays: country.debt.termDays,
    });
    return {
      countryId: country.id,
      dayIndex: action.dayIndex,
      kind: action.kind,
      previousFiscal,
      fiscal: { ...country.fiscal },
      previousDebt,
      debt: { ...country.debt },
      debtContract: issuance.contract,
      principalPaidRUSD: 0,
      constructionProject: null,
      changed: true,
    };
  }

  if (action.kind === "repay-debt") {
    const repayment = repayGovernmentDebt(world, {
      issuerCountryId: country.id,
      contractId: action.contractId,
      amountRUSD: action.amountRUSD,
    });
    return {
      countryId: country.id,
      dayIndex: action.dayIndex,
      kind: action.kind,
      previousFiscal,
      fiscal: { ...country.fiscal },
      previousDebt,
      debt: { ...country.debt },
      debtContract: repayment.contract,
      principalPaidRUSD: repayment.principalPaidRUSD,
      constructionProject: null,
      changed: true,
    };
  }

  if (action.kind === "start-construction") {
    if (definitions === undefined) {
      throw new RangeError("start-construction requires the validated economy definitions");
    }
    const project = startConstruction(world, definitions, {
      countryId: country.id,
      regionId: action.regionId,
      definitionId: action.definitionId,
    });
    return {
      countryId: country.id,
      dayIndex: action.dayIndex,
      kind: action.kind,
      previousFiscal,
      fiscal: { ...country.fiscal },
      previousDebt,
      debt: { ...country.debt },
      debtContract: null,
      principalPaidRUSD: 0,
      constructionProject: project,
      changed: true,
    };
  }

  if (action.kind === "cancel-construction") {
    const cancelled = cancelConstruction(
      world,
      { countryId: country.id, projectId: action.projectId },
      action.dayIndex,
    );
    return {
      countryId: country.id,
      dayIndex: action.dayIndex,
      kind: action.kind,
      previousFiscal,
      fiscal: { ...country.fiscal },
      previousDebt,
      debt: { ...country.debt },
      debtContract: null,
      principalPaidRUSD: 0,
      constructionProject: cancelled.project,
      changed: true,
    };
  }

  if (action.kind === "set-construction-paused") {
    const project = setConstructionPaused(
      world,
      { countryId: country.id, projectId: action.projectId },
      action.paused,
    );
    return {
      countryId: country.id,
      dayIndex: action.dayIndex,
      kind: action.kind,
      previousFiscal,
      fiscal: { ...country.fiscal },
      previousDebt,
      debt: { ...country.debt },
      debtContract: null,
      principalPaidRUSD: 0,
      constructionProject: project,
      changed: true,
    };
  }

  if (action.kind === "set-industrial-policy") {
    const updated = setIndustrialPolicy(world, country.id, action.sectorSubsidyRates);
    return {
      countryId: country.id,
      dayIndex: action.dayIndex,
      kind: action.kind,
      previousFiscal,
      fiscal: { ...updated.fiscal },
      previousDebt,
      debt: { ...updated.debt },
      debtContract: null,
      principalPaidRUSD: 0,
      constructionProject: null,
      industrialPolicy: {
        sectorSubsidyRates: [...updated.industrial.sectorSubsidyRates],
      },
      publicEnterpriseSupport: null,
      changed: true,
    };
  }

  if (action.kind === "support-public-enterprise") {
    const supported = supportPublicEnterprise(
      world,
      {
        countryId: country.id,
        buildingId: action.buildingId,
        amountRUSD: action.amountRUSD,
      },
      action.dayIndex,
    );
    return {
      countryId: country.id,
      dayIndex: action.dayIndex,
      kind: action.kind,
      previousFiscal,
      fiscal: { ...country.fiscal },
      previousDebt,
      debt: { ...country.debt },
      debtContract: null,
      principalPaidRUSD: 0,
      constructionProject: null,
      industrialPolicy: null,
      publicEnterpriseSupport: {
        buildingId: supported.building.id,
        amountRUSD: supported.amountRUSD,
      },
      changed: true,
    };
  }

  if (action.kind === "propose-law") {
    if (definitions === undefined) {
      throw new RangeError("propose-law requires the validated economy definitions");
    }
    const proposal = proposeLaw(
      world,
      definitions,
      { countryId: country.id, lawId: action.lawId },
      action.dayIndex,
      action.source,
    );
    return {
      countryId: country.id,
      dayIndex: action.dayIndex,
      kind: action.kind,
      previousFiscal,
      fiscal: { ...proposal.country.fiscal },
      previousDebt,
      debt: { ...proposal.country.debt },
      debtContract: null,
      principalPaidRUSD: 0,
      constructionProject: null,
      lawAction: {
        lawId: proposal.law.id,
        transitionId: proposal.transition.id,
        effectiveDay: proposal.transition.effectiveDay,
        support: proposal.support,
      },
      changed: true,
    };
  }

  if (action.kind === "set-institution-funding") {
    const result = setInstitutionFunding(
      world,
      definitions,
      { countryId: country.id, annualRUSD: action.annualRUSD },
      action.dayIndex,
    );
    return {
      countryId: country.id,
      dayIndex: action.dayIndex,
      kind: action.kind,
      previousFiscal,
      fiscal: { ...result.country.fiscal },
      previousDebt,
      debt: { ...result.country.debt },
      debtContract: null,
      principalPaidRUSD: 0,
      constructionProject: null,
      institutionFunding: {
        previousAnnualRUSD: result.previousAnnualRUSD,
        annualRUSD: result.annualRUSD,
        changed: result.changed,
      },
      changed: result.changed,
    };
  }

  if (action.kind === "start-research") {
    if (definitions === undefined) {
      throw new RangeError("start-research requires the validated economy definitions");
    }
    const previousTechnology = { ...country.technology };
    const definition = startResearch(
      world,
      definitions,
      { countryId: country.id, technologyId: action.technologyId },
      action.dayIndex,
    );
    try {
      assertValidWorld(world);
    } catch (error) {
      country.technology = previousTechnology;
      throw error;
    }
    return {
      countryId: country.id,
      dayIndex: action.dayIndex,
      kind: action.kind,
      previousFiscal,
      fiscal: { ...country.fiscal },
      previousDebt,
      debt: { ...country.debt },
      debtContract: null,
      principalPaidRUSD: 0,
      constructionProject: null,
      researchAction: {
        technologyId: definition.id,
        startedDay: action.dayIndex,
      },
      changed: true,
    };
  }

  if (action.kind === "cancel-research") {
    if (definitions === undefined) {
      throw new RangeError("cancel-research requires the validated economy definitions");
    }
    const cancelled = country.technology.activeProject?.technologyId ?? null;
    const previousTechnology = { ...country.technology };
    cancelResearch(world, definitions, { countryId: country.id });
    try {
      assertValidWorld(world);
    } catch (error) {
      country.technology = previousTechnology;
      throw error;
    }
    return {
      countryId: country.id,
      dayIndex: action.dayIndex,
      kind: action.kind,
      previousFiscal,
      fiscal: { ...country.fiscal },
      previousDebt,
      debt: { ...country.debt },
      debtContract: null,
      principalPaidRUSD: 0,
      constructionProject: null,
      cancelledResearchTechnologyId: cancelled,
      changed: true,
    };
  }

  if (
    action.kind === "set-education-funding" ||
    action.kind === "set-research-staff-share"
  ) {
    if (definitions === undefined) {
      throw new RangeError("education policy actions require the validated economy definitions");
    }
    const previousEducation = { ...country.education };
    if (action.kind === "set-education-funding") {
      validateEducationFunding(world, definitions, {
        countryId: country.id,
        annualRUSD: action.annualRUSD,
      });
      country.education = { ...country.education, fundedAnnualRUSD: action.annualRUSD };
    } else {
      validateResearchStaffShare(world, definitions, {
        countryId: country.id,
        share: action.share,
      });
      country.education = { ...country.education, researchStaffShare: action.share };
    }
    try {
      assertValidWorld(world);
    } catch (error) {
      country.education = previousEducation;
      throw error;
    }
    const changed =
      country.education.fundedAnnualRUSD !== previousEducation.fundedAnnualRUSD ||
      country.education.researchStaffShare !== previousEducation.researchStaffShare;
    return {
      countryId: country.id,
      dayIndex: action.dayIndex,
      kind: action.kind,
      previousFiscal,
      fiscal: { ...country.fiscal },
      previousDebt,
      debt: { ...country.debt },
      debtContract: null,
      principalPaidRUSD: 0,
      constructionProject: null,
      educationAction: {
        previousFundedAnnualRUSD: previousEducation.fundedAnnualRUSD,
        fundedAnnualRUSD: country.education.fundedAnnualRUSD,
        previousResearchStaffShare: previousEducation.researchStaffShare,
        researchStaffShare: country.education.researchStaffShare,
      },
      changed,
    };
  }

  if (
    action.kind === "set-training-budget" ||
    action.kind === "set-training-stipend" ||
    action.kind === "set-training-staff-share" ||
    action.kind === "set-health-staff-share"
  ) {
    if (definitions === undefined) {
      throw new RangeError("E5 labor policy actions require the validated economy definitions");
    }
    const previousLabor = { ...country.labor };
    const previousInstitutions = { ...country.institutions };
    if (action.kind === "set-training-budget") {
      validateTrainingBudget(world, definitions, {
        countryId: country.id,
        annualRUSD: action.annualRUSD,
      });
      country.labor = {
        ...country.labor,
        trainingBudgetRUSDPerYear: action.annualRUSD,
      };
    } else if (action.kind === "set-training-stipend") {
      validateTrainingStipend(world, definitions, {
        countryId: country.id,
        annualRUSD: action.annualRUSD,
      });
      country.labor = {
        ...country.labor,
        trainingStipendPerTraineeRUSDPerYear: action.annualRUSD,
      };
    } else if (action.kind === "set-training-staff-share") {
      validateTrainingStaffShare(world, definitions, {
        countryId: country.id,
        share: action.share,
      });
      country.labor = { ...country.labor, trainingStaffShare: action.share };
    } else {
      validateHealthStaffShare(world, definitions, {
        countryId: country.id,
        share: action.share,
      });
      country.institutions = {
        ...country.institutions,
        healthStaffShare: action.share,
      };
    }
    try {
      assertValidWorld(world);
    } catch (error) {
      country.labor = previousLabor;
      country.institutions = previousInstitutions;
      throw error;
    }
    const changed =
      country.labor.trainingBudgetRUSDPerYear !==
        previousLabor.trainingBudgetRUSDPerYear ||
      country.labor.trainingStipendPerTraineeRUSDPerYear !==
        previousLabor.trainingStipendPerTraineeRUSDPerYear ||
      country.labor.trainingStaffShare !== previousLabor.trainingStaffShare ||
      country.institutions.healthStaffShare !== previousInstitutions.healthStaffShare;
    return {
      countryId: country.id,
      dayIndex: action.dayIndex,
      kind: action.kind,
      previousFiscal,
      fiscal: { ...country.fiscal },
      previousDebt,
      debt: { ...country.debt },
      debtContract: null,
      principalPaidRUSD: 0,
      constructionProject: null,
      laborAction: {
        previousTrainingBudgetRUSDPerYear: previousLabor.trainingBudgetRUSDPerYear,
        trainingBudgetRUSDPerYear: country.labor.trainingBudgetRUSDPerYear,
        previousTrainingStipendPerTraineeRUSDPerYear:
          previousLabor.trainingStipendPerTraineeRUSDPerYear,
        trainingStipendPerTraineeRUSDPerYear:
          country.labor.trainingStipendPerTraineeRUSDPerYear,
        previousTrainingStaffShare: previousLabor.trainingStaffShare,
        trainingStaffShare: country.labor.trainingStaffShare,
        previousHealthStaffShare: previousInstitutions.healthStaffShare,
        healthStaffShare: country.institutions.healthStaffShare,
      },
      changed,
    };
  }

  if (action.kind === "set-trade-policy") {
    if (definitions === undefined) {
      throw new RangeError("set-trade-policy requires the validated economy definitions");
    }
    const previousTrade = { ...country.trade };
    const updated = createTradePolicyState(
      {
        tariffRates: [...action.tariffRates],
        importQuotaQuantity: [...action.importQuotaQuantity],
        exportRestricted: [...action.exportRestricted],
      },
      definitions.goods.length,
      "action.trade",
    );
    country.trade = {
      ...country.trade,
      tariffRates: updated.tariffRates,
      importQuotaQuantity: updated.importQuotaQuantity,
      exportRestricted: updated.exportRestricted,
      lastUpdateDay: action.dayIndex,
    };
    try {
      assertValidWorld(world);
    } catch (error) {
      country.trade = previousTrade;
      throw error;
    }
    const changed =
      previousTrade.tariffRates.some(
        (rate, index) => rate !== country.trade.tariffRates[index],
      ) ||
      previousTrade.importQuotaQuantity.some(
        (quota, index) => quota !== country.trade.importQuotaQuantity[index],
      ) ||
      previousTrade.exportRestricted.some(
        (restricted, index) => restricted !== country.trade.exportRestricted[index],
      );
    return {
      countryId: country.id,
      dayIndex: action.dayIndex,
      kind: action.kind,
      previousFiscal,
      fiscal: { ...country.fiscal },
      previousDebt,
      debt: { ...country.debt },
      debtContract: null,
      principalPaidRUSD: 0,
      constructionProject: null,
      tradeAction: {
        previousTariffRates: [...previousTrade.tariffRates],
        tariffRates: [...country.trade.tariffRates],
        previousImportQuotaQuantity: [...previousTrade.importQuotaQuantity],
        importQuotaQuantity: [...country.trade.importQuotaQuantity],
        previousExportRestricted: [...previousTrade.exportRestricted],
        exportRestricted: [...country.trade.exportRestricted],
      },
      changed,
    };
  }

  if (
    action.kind === "declare-war" ||
    action.kind === "offer-peace" ||
    action.kind === "accept-peace" ||
    action.kind === "recruit-army" ||
    action.kind === "deploy-army"
  ) {
    const result = applyMilitaryAction(world, action, action.dayIndex);
    return {
      countryId: country.id,
      dayIndex: action.dayIndex,
      kind: action.kind,
      previousFiscal,
      fiscal: { ...country.fiscal },
      previousDebt,
      debt: { ...country.debt },
      debtContract: null,
      principalPaidRUSD: 0,
      constructionProject: null,
      militaryAction: {
        kind: result.kind,
        warId: result.warId,
        offerId: result.offerId,
        armyId: result.armyId,
        regionId: result.regionId,
        personnel: result.personnel,
        equipmentUnits: result.equipmentUnits,
        spentRUSD: result.spentRUSD,
      },
      changed: true,
    };
  }

  if (action.kind === "set-monetary-policy") {
    if (definitions === undefined) {
      throw new RangeError("set-monetary-policy requires the validated economy definitions");
    }
    const result = applyMonetaryPolicy(world, definitions, {
      countryId: country.id,
      regime: action.regime,
      parityRusdPerUnit: action.parityRusdPerUnit,
      reserveTransferRUSD: action.reserveTransferRUSD,
      currencyConversionRUSD: action.currencyConversionRUSD,
    }, action.dayIndex);
    try {
      assertValidWorld(world);
    } catch (error) {
      throw error;
    }
    return {
      countryId: country.id,
      dayIndex: action.dayIndex,
      kind: action.kind,
      previousFiscal,
      fiscal: { ...country.fiscal },
      previousDebt,
      debt: { ...country.debt },
      debtContract: null,
      principalPaidRUSD: 0,
      constructionProject: null,
      monetaryAction: {
        currencyId: result.currencyId,
        regime: result.regime,
        parityRusdPerUnit: result.parityRusdPerUnit,
        valuationRusdPerUnit: result.valuationRusdPerUnit,
        reserveTransferRUSD: result.reserveTransferRUSD,
        currencyConversionRUSD: result.currencyConversionRUSD,
        currencyIssuedUnits: result.currencyIssuedUnits,
        revaluationRUSD: result.revaluationRUSD,
      },
      changed: true,
    };
  }

  const debt: DebtPolicy = {
    ...country.debt,
    refinanceOnMaturity: action.refinanceOnMaturity,
    maxOutstandingPrincipalRUSD: action.maxOutstandingPrincipalRUSD,
  };
  const changed =
    debt.refinanceOnMaturity !== previousDebt.refinanceOnMaturity ||
    debt.maxOutstandingPrincipalRUSD !== previousDebt.maxOutstandingPrincipalRUSD;
  if (!changed) {
    return {
      countryId: country.id,
      dayIndex: action.dayIndex,
      kind: action.kind,
      previousFiscal,
      fiscal: { ...country.fiscal },
      previousDebt,
      debt: previousDebt,
      debtContract: null,
      principalPaidRUSD: 0,
      constructionProject: null,
      changed: false,
    };
  }
  const candidateCountry: Country = { ...country, debt };
  const candidateWorld: World = {
    ...world,
    countries: world.countries.map((entry, entryIndex) =>
      entryIndex === index ? candidateCountry : entry,
    ),
  };
  assertValidWorld(candidateWorld);
  world.countries[index] = candidateCountry;
  return {
    countryId: country.id,
    dayIndex: action.dayIndex,
    kind: action.kind,
    previousFiscal,
    fiscal: { ...candidateCountry.fiscal },
    previousDebt,
    debt: { ...debt },
    debtContract: null,
    principalPaidRUSD: 0,
    constructionProject: null,
    changed: true,
  };
}

function recordRejectedAction(world: World, message: string): void {
  world.diagnostics.invalidActionCount += 1;
  if (world.diagnostics.recentWarnings.length >= MAX_RECENT_WARNINGS) {
    world.diagnostics.recentWarnings.shift();
  }
  world.diagnostics.recentWarnings.push(
    `AI action rejected: ${message}`.slice(0, MAX_AI_ACTION_SUMMARY_LENGTH),
  );
}

/**
 * Run the deterministic AI phase for one day.
 *
 * Evaluation is staggered by stable country id and runs only when
 * `dayIndex >= nextEvaluationDay`. Every proposed action is validated with the
 * same public validator a player uses. A rejected proposal is counted and
 * skipped; it does not corrupt the day. The phase changes only country fiscal
 * policy, country AI state, and bounded diagnostics.
 *
 * `options.validateWorld` defaults to true. The integrated day passes false
 * because it has already validated the staged world; all changed state is still
 * validated locally, and every applied action validates its candidate world.
 */
export function runCountryAIPhase(
  world: World,
  dayIndex: Day,
  options: {
    readonly validateWorld?: boolean;
    /**
     * Whole-world validation of every applied action's candidate world (D-067).
     * Defaults to true; D-116 phase-mode days pass false and validate the candidate
     * fiscal policy structurally, relying on the day's month-end validation.
     */
    readonly validateActionWorlds?: boolean;
  } = {},
): CountryAIPhaseResult {
  assertValidDayIndex(dayIndex);
  if (isTerminalDayIndex(dayIndex)) {
    throw new RangeError("the terminal 2000-01-01 boundary cannot run the country AI");
  }
  if (world.dayIndex !== dayIndex) {
    throw new RangeError(
      `country AI day ${String(dayIndex)} does not match world.dayIndex ${String(world.dayIndex)}`,
    );
  }
  if (options.validateWorld !== false) assertValidWorld(world);
  if (!world.countryAI.enabled) {
    return {
      dayIndex,
      evaluated: [],
      appliedActionCount: 0,
      rejectedActionCount: 0,
    };
  }
  const evaluated: CountryAIEvaluationResult[] = [];
  let appliedActionCount = 0;
  let rejectedActionCount = 0;

  for (const country of [...world.countries].sort((left, right) => left.id - right.id)) {
    // Post-M7 player control: the designated player country is never governed by
    // the AI, so the player's fiscal settings cannot be silently overwritten.
    // AI-controlled countries still use the same observation, validator, and
    // application path below.
    if (world.playerCountryId !== null && country.id === world.playerCountryId) continue;
    if (dayIndex < country.ai.nextEvaluationDay) continue;
    const observation = buildCountryAIObservation(world, country.id, dayIndex);
    const decision = planCountryActions(observation);
    let applied = 0;
    let rejected = 0;
    for (const action of decision.actions) {
      const validation = validateCountryAction(world, action);
      if (!validation.valid) {
        rejected += 1;
        recordRejectedAction(world, validation.errors.join("; "));
        continue;
      }
      applyCountryAction(world, action, undefined, {
        validateWorld: options.validateActionWorlds !== false,
      });
      applied += 1;
    }
    appliedActionCount += applied;
    rejectedActionCount += rejected;
    const current = world.countries.find((candidate) => candidate.id === country.id);
    if (current === undefined) {
      throw new RangeError(`country ${String(country.id)} disappeared during AI evaluation`);
    }
    const nextEvaluationDay = Math.min(
      dayIndex + AI_EVALUATION_PERIOD_DAYS,
      CAMPAIGN_TERMINAL_DAY_INDEX,
    );
    const updatedAI: CountryAIState = {
      nextEvaluationDay,
      currentGoalId: decision.goalId,
      lastDecisionDay: dayIndex,
      lastActionSummary:
        applied > 0
          ? decision.summary.slice(0, MAX_AI_ACTION_SUMMARY_LENGTH)
          : current.ai.lastActionSummary,
    };
    assertValidCountryAIState(updatedAI, `country ${String(country.id)}.ai`);
    current.ai = updatedAI;
    evaluated.push({
      countryId: country.id,
      goalId: decision.goalId,
      proposedActionCount: decision.actions.length,
      appliedActionCount: applied,
      rejectedActionCount: rejected,
      summary: decision.summary,
    });
  }

  return { dayIndex, evaluated, appliedActionCount, rejectedActionCount };
}

/** Re-exported so callers do not need to import the state module directly. */
export { isCountryAIGoalId };
