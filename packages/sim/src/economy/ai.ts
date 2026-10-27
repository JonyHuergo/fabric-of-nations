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
 * (`incomeTaxRate`, `welfareBudgetSUSDPerYear`). Construction queues, infrastructure
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
import { MONEY_TOLERANCE_SUSD } from "../population/constants.js";
import { populationTotal } from "../population/state.js";
import type { Day, Id, MoneySUSD, Rate } from "../types.js";
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
  MAX_DEBT_PRINCIPAL_SUSD,
  MAX_FISCAL_BUDGET_SUSD_PER_YEAR,
} from "./constants.js";
import { assertValidFiscalPolicy } from "./country.js";
import { debtOutstandingPrincipal } from "./debtPolicy.js";
import {
  issueGovernmentDebt,
  repayGovernmentDebt,
  validateDebtIssuance,
  validateDebtRepayment,
} from "./debt.js";
import { governmentPeriodTotals } from "./period.js";
import type {
  Country,
  CountryAIGoalId,
  CountryAIState,
  DebtContract,
  DebtPolicy,
  FiscalPolicy,
  FinancialAccount,
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
  /** Per-pop-block annual wage exemption in nominal SUSD. */
  readonly incomeTaxAllowanceSUSDPerYear: MoneySUSD;
  /** Nominal annual welfare expenditure target in SUSD. */
  readonly welfareBudgetSUSDPerYear: MoneySUSD;
  /** Inclusive block wealth ceiling for welfare eligibility, 0..99. */
  readonly welfareMaxWealthLevel: number;
  /** Dimensionless rate on the positive monthly building net result, 0..1. */
  readonly businessProfitTaxRate: Rate;
  /** Treasury liquidity floor in nominal SUSD. */
  readonly reserveTargetSUSD: MoneySUSD;
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
  /** Principal to borrow in nominal SUSD. */
  readonly amountSUSD: MoneySUSD;
}

/** Repay part or all of one outstanding contract's principal early. */
export interface RepayDebtAction {
  readonly kind: "repay-debt";
  readonly countryId: Id;
  readonly dayIndex: Day;
  readonly source: "player" | "ai";
  readonly contractId: Id;
  /** Principal to repay in nominal SUSD. */
  readonly amountSUSD: MoneySUSD;
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
  readonly maxOutstandingPrincipalSUSD: MoneySUSD;
}

/** Every implemented country action. */
export type CountryAction =
  | SetFiscalPolicyAction
  | IssueDebtAction
  | RepayDebtAction
  | SetDebtPolicyAction;

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
  readonly principalPaidSUSD: MoneySUSD;
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
  readonly incomeTaxSUSD: number;
  readonly welfarePaidSUSD: number;
  readonly interestExpenseSUSD: number;
}

/** Own-country debt exposure. Contracts held by others are not exposed. */
export interface CountryAIObservedDebt {
  readonly enabled: boolean;
  readonly outstandingPrincipalSUSD: number;
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
  readonly treasuryCashSUSD: number;
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
  return MONEY_TOLERANCE_SUSD * scale;
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
      incomeTaxSUSD: totals.incomeTaxRevenueSUSD,
      welfarePaidSUSD: totals.welfareExpenseSUSD,
      interestExpenseSUSD: totals.interestExpenseSUSD,
    };
  }
  return {
    countryId,
    dayIndex,
    fiscal: { ...country.fiscal },
    treasuryCashSUSD: treasuryAccountOf(world, countryId).balanceSUSD,
    regionIds: [...country.regionIds],
    population,
    blocks,
    lastClosedPeriod,
    debt: {
      enabled: country.debt.enabled,
      outstandingPrincipalSUSD: debtOutstandingPrincipal(
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
      : annualize(observation.lastClosedPeriod.incomeTaxSUSD, periodDays, yearDays);
  const annualWelfarePaid =
    observation.lastClosedPeriod === null
      ? 0
      : annualize(observation.lastClosedPeriod.welfarePaidSUSD, periodDays, yearDays);
  const annualInterest =
    observation.lastClosedPeriod === null
      ? 0
      : annualize(observation.lastClosedPeriod.interestExpenseSUSD, periodDays, yearDays);
  const committedWelfare = Math.max(
    observation.fiscal.welfareBudgetSUSDPerYear,
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
    observation.treasuryCashSUSD,
  );
  const lowTreasury =
    observation.treasuryCashSUSD + solvencyTolerance < bufferTarget;
  // Revenue is unknown before the first close, not zero. Do not infer a deficit
  // from missing history; the first observed period supplies the revenue basis.
  const runningDeficit =
    observation.lastClosedPeriod !== null &&
    annualOutlays > annualTaxRevenue + solvencyTolerance;
  const { hardship, hardshipPopulationShare, weightedMilitancy } =
    reliefHardship(observation);

  let goalId: CountryAIGoalId = "maintain";
  let targetTax = observation.fiscal.incomeTaxRate;
  let targetWelfare = observation.fiscal.welfareBudgetSUSDPerYear;

  if (lowTreasury || runningDeficit) {
    goalId = "restore-solvency";
    targetTax = Math.min(
      AI_MAX_TAX_RATE,
      roundTo(observation.fiscal.incomeTaxRate + AI_TAX_STEP, AI_TAX_RATE_DECIMALS),
    );
    targetWelfare = Math.min(
      observation.fiscal.welfareBudgetSUSDPerYear,
      Math.max(0, affordableWelfare),
    );
  } else if (hardship) {
    goalId = "relieve-hardship";
    targetTax = Math.max(observation.fiscal.incomeTaxRate, AI_HARDSHIP_MIN_TAX_RATE);
    targetWelfare = Math.max(
      observation.fiscal.welfareBudgetSUSDPerYear,
      Math.max(0, affordableWelfare),
    );
  }

  targetTax = clamp(roundTo(targetTax, AI_TAX_RATE_DECIMALS), 0, 1);
  targetWelfare = Math.min(
    MAX_FISCAL_BUDGET_SUSD_PER_YEAR,
    Math.max(0, roundTo(targetWelfare, AI_MONEY_DECIMALS)),
  );

  const currentWelfare = observation.fiscal.welfareBudgetSUSDPerYear;
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
          incomeTaxAllowanceSUSDPerYear:
            observation.fiscal.incomeTaxAllowanceSUSDPerYear,
          welfareBudgetSUSDPerYear: targetWelfare,
          welfareMaxWealthLevel: observation.fiscal.welfareMaxWealthLevel,
          businessProfitTaxRate: observation.fiscal.businessProfitTaxRate,
          reserveTargetSUSD: observation.fiscal.reserveTargetSUSD,
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
): CountryActionValidation {
  const errors: string[] = [];
  if (action === null || typeof action !== "object") {
    return { valid: false, errors: ["action must be an object"] };
  }
  if (
    action.kind !== "set-fiscal-policy" &&
    action.kind !== "issue-debt" &&
    action.kind !== "repay-debt" &&
    action.kind !== "set-debt-policy"
  ) {
    return {
      valid: false,
      errors: [
        'action.kind must be "set-fiscal-policy", "issue-debt", "repay-debt", or "set-debt-policy"',
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
            incomeTaxAllowanceSUSDPerYear: action.incomeTaxAllowanceSUSDPerYear,
            welfareBudgetSUSDPerYear: action.welfareBudgetSUSDPerYear,
            welfareMaxWealthLevel: action.welfareMaxWealthLevel,
            businessProfitTaxRate: action.businessProfitTaxRate,
            reserveTargetSUSD: action.reserveTargetSUSD,
          },
          "action.fiscal",
        );
      } catch (error) {
        errors.push(errorMessage(error));
      }
    } else if (action.kind === "issue-debt") {
      try {
        validateDebtIssuance(world, {
          issuerCountryId: country.id,
          holderKind: country.debt.creditorKind,
          holderId: country.debt.creditorId,
          principalSUSD: action.amountSUSD,
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
          amountSUSD: action.amountSUSD,
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
  const ceiling = action.maxOutstandingPrincipalSUSD;
  if (typeof ceiling !== "number" || !Number.isFinite(ceiling) || ceiling < 0) {
    throw new RangeError("action.maxOutstandingPrincipalSUSD must be a finite non-negative number");
  }
  if (ceiling > MAX_DEBT_PRINCIPAL_SUSD) {
    throw new RangeError(
      `action.maxOutstandingPrincipalSUSD must not exceed ${String(MAX_DEBT_PRINCIPAL_SUSD)}`,
    );
  }
  const outstanding = debtOutstandingPrincipal(world.finance.debtContracts, country.id);
  if (ceiling < outstanding - MONEY_TOLERANCE_SUSD) {
    throw new RangeError(
      `action.maxOutstandingPrincipalSUSD ${String(ceiling)} is below the outstanding principal ${String(outstanding)}`,
    );
  }
}

/**
 * Apply one validated country action atomically.
 *
 * The action is validated first, then the complete candidate world is validated
 * before publication. A failed validation leaves the original world unchanged.
 */
export function applyCountryAction(
  world: World,
  action: CountryAction,
): CountryActionApplication {
  const validation = validateCountryAction(world, action);
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
      incomeTaxAllowanceSUSDPerYear: action.incomeTaxAllowanceSUSDPerYear,
      welfareBudgetSUSDPerYear: action.welfareBudgetSUSDPerYear,
      welfareMaxWealthLevel: action.welfareMaxWealthLevel,
      businessProfitTaxRate: action.businessProfitTaxRate,
      reserveTargetSUSD: action.reserveTargetSUSD,
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
        principalPaidSUSD: 0,
        changed: false,
      };
    }
    const candidateCountry: Country = { ...country, fiscal };
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
      fiscal: { ...fiscal },
      previousDebt,
      debt: { ...candidateCountry.debt },
      debtContract: null,
      principalPaidSUSD: 0,
      changed: true,
    };
  }

  if (action.kind === "issue-debt") {
    const issuance = issueGovernmentDebt(world, {
      issuerCountryId: country.id,
      holderKind: country.debt.creditorKind,
      holderId: country.debt.creditorId,
      principalSUSD: action.amountSUSD,
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
      principalPaidSUSD: 0,
      changed: true,
    };
  }

  if (action.kind === "repay-debt") {
    const repayment = repayGovernmentDebt(world, {
      issuerCountryId: country.id,
      contractId: action.contractId,
      amountSUSD: action.amountSUSD,
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
      principalPaidSUSD: repayment.principalPaidSUSD,
      changed: true,
    };
  }

  const debt: DebtPolicy = {
    ...country.debt,
    refinanceOnMaturity: action.refinanceOnMaturity,
    maxOutstandingPrincipalSUSD: action.maxOutstandingPrincipalSUSD,
  };
  const changed =
    debt.refinanceOnMaturity !== previousDebt.refinanceOnMaturity ||
    debt.maxOutstandingPrincipalSUSD !== previousDebt.maxOutstandingPrincipalSUSD;
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
      principalPaidSUSD: 0,
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
    principalPaidSUSD: 0,
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
  options: { readonly validateWorld?: boolean } = {},
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
      applyCountryAction(world, action);
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
