/**
 * M4c government fiscal phase (D-048).
 *
 * Runs inside the integrated economic day after market, wage, and upkeep
 * settlement and before the needs/militancy and month-end wealth updates (GDD
 * §4.2 step 12, fiscal part). It performs two cash-neutral flows:
 *
 * 1. Income tax: a flat residence-based rate applied to wages actually received
 *    by each pop block that day. The tax moves existing household cash to the
 *    country treasury and recognizes household tax expense and country tax
 *    revenue. Gross wage income and employer wage expense are untouched.
 *    Government payroll paid in this phase after withholding (administration) or
 *    in later phases (education, training, military) is not part of this
 *    withholding pass; construction wages are the documented E3 exception and
 *    are taxed at their separate payment path. See D-084.
 * 2. Welfare transfer: the country's daily budget share
 *    (`welfareBudgetRUSDPerYear / daysInYear(civil year)`) is paid from treasury
 *    cash to the country's population blocks in proportion to population. If the
 *    treasury cannot fund the request, only the payable amount is transferred
 *    and the difference is reported as a shortfall. No debt, arrears, or
 *    negative cash is created.
 *
 * All entries are built and applied to an isolated finance clone. The complete
 * staged world is validated before the clone replaces `world.finance`; any
 * failure leaves the original accounts and postings untouched. The fiscal phase
 * consumes the transient settlement result, so a duplicate call with the same
 * settlement is rejected. No keyed randomness is used: countries and blocks are
 * processed in ascending id order and the final recipient receives the exact
 * allocation remainder.
 *
 * This module is deliberately not re-exported from the package root. Tests may
 * import it directly; the supported simulation entry point is `runEconomicDay`
 * (through `tick`).
 */

import {
  assertValidDayIndex,
  dayIndexToCivilDate,
  daysInYear,
  isTerminalDayIndex,
} from "../calendar.js";
import { MONEY_TOLERANCE_RUSD } from "../population/constants.js";
import { populationTotal } from "../population/state.js";
import type { DayIndex, Id } from "../types.js";
import {
  assertValidWorldForTick,
  type PhaseValidationOptions,
  type World,
} from "../world.js";
import { postJournalBatch, type JournalEntryInput } from "./accounting.js";
import { buildFinanceIndex, phaseFinance } from "./accounts.js";
import { accumulateBudgetMemo } from "./budget.js";
import { buildProvinceOwnerMap, fiscalPolicyIsActive } from "./country.js";
import type { MarketSettlementResult } from "./settlement.js";
import type { Country, EconomyDefinitions, FinanceState, JournalLine } from "./types.js";
import { taxCollectionEfficiency } from "./politics.js";

/** Per-block fiscal result for one processed day. */
export interface FiscalBlockResult {
  readonly popBlockId: Id;
  readonly countryId: Id;
  /** Income tax actually withheld from that day's wage receipt. */
  readonly incomeTaxRUSD: number;
  /** Welfare actually received that day. */
  readonly welfareReceivedRUSD: number;
  /**
   * Household cash after tax and welfare for that block, read from the
   * authoritative staged account after all fiscal postings.
   */
  readonly endingCashAfterFiscalRUSD: number;
}

/** Per-country fiscal result for one processed day. */
export interface FiscalCountryResult {
  readonly countryId: Id;
  readonly incomeTaxRUSD: number;
  /** Budgeted daily welfare request before the cash and eligibility limits. */
  readonly welfareRequestedRUSD: number;
  readonly welfarePaidRUSD: number;
  readonly welfareShortfallRUSD: number;
  /** Blocks that were eligible for the transfer under the current policy. */
  readonly welfareEligibleBlocks: number;
  readonly welfareEligiblePopulation: number;
  /** M8 administration payroll request/paid/shortfall. */
  readonly administrationRequestedRUSD: number;
  readonly administrationPaidRUSD: number;
  readonly administrationShortfallRUSD: number;
  readonly treasuryCashStartRUSD: number;
  readonly reserveTargetRUSD: number;
  /** Treasury cash read from the authoritative staged account after posting. */
  readonly treasuryCashEndRUSD: number;
}

/** Aggregate fiscal totals for one processed day. */
export interface FiscalTotals {
  readonly incomeTaxRUSD: number;
  readonly welfareRequestedRUSD: number;
  readonly welfarePaidRUSD: number;
  readonly welfareShortfallRUSD: number;
  readonly administrationRequestedRUSD: number;
  readonly administrationPaidRUSD: number;
  readonly administrationShortfallRUSD: number;
}

/** Transient result of one fiscal phase. Never persisted as duplicate state. */
export interface FiscalPhaseResult {
  readonly dayIndex: DayIndex;
  readonly countries: readonly FiscalCountryResult[];
  readonly blocks: readonly FiscalBlockResult[];
  readonly totals: FiscalTotals;
  readonly postingIds: readonly number[];
}

/**
 * Test-only hook for proving publication atomicity. This module is not exported
 * from the package root, so the hook cannot be reached through the supported
 * simulation API.
 */
export interface FiscalPhaseTestHooks {
  readonly afterStagedPostings?: (staged: FinanceState) => void;
}

/** M8-aware fiscal phase options. `economyDefinitions` is needed for payroll. */
export interface FiscalPhaseOptions extends PhaseValidationOptions {
  readonly economyDefinitions?: EconomyDefinitions;
}

/**
 * Validate the fiscal phase's execution context before any mutation or staging.
 *
 * The check deliberately covers the world, day, terminal boundary, market, and
 * the settlement's execution identity so a stale or foreign settlement cannot
 * be applied to this world.
 */
function assertFiscalPreconditions(
  world: World,
  settlement: MarketSettlementResult,
  dayIndex: DayIndex,
  options: PhaseValidationOptions = {},
): void {
  assertValidDayIndex(dayIndex);
  if (isTerminalDayIndex(dayIndex)) {
    throw new RangeError("the terminal 2000-01-01 boundary cannot run the fiscal phase");
  }
  if (world.dayIndex !== dayIndex) {
    throw new RangeError(
      `fiscal phase day ${String(dayIndex)} does not match world.dayIndex ${String(world.dayIndex)}`,
    );
  }
  if (settlement.dayIndex !== dayIndex) {
    throw new RangeError("fiscal phase settlement day does not match the processed day");
  }
  if (settlement.fiscalApplied) {
    throw new RangeError("fiscal phase has already been applied to this settlement result");
  }
  if (
    settlement.worldSeed !== world.seed ||
    settlement.scenarioId !== world.scenarioId ||
    settlement.startDayIndex !== world.startDayIndex
  ) {
    throw new RangeError(
      "fiscal phase settlement does not belong to this world's execution context",
    );
  }
  if (settlement.settlementNextPostingId !== world.finance.nextPostingId) {
    throw new RangeError(
      "fiscal phase settlement is stale; finance postings changed after settlement",
    );
  }
  if (!world.markets.some((market) => market.id === settlement.marketId)) {
    throw new RangeError(
      `fiscal phase settlement references unknown market ${String(settlement.marketId)}`,
    );
  }
  // Validates country fiscal values, treasury references, account sets, NaN
  // balances, summaries, and all existing accounting/determinism invariants.
  if (options.validateWorld !== false) assertValidWorldForTick(world);
}

function toleranceMoney(...values: number[]): number {
  const scale = Math.max(1, ...values.map((value) => Math.abs(value)));
  return MONEY_TOLERANCE_RUSD * scale;
}

function sum(values: readonly number[]): number {
  let total = 0;
  for (const value of values) total += value;
  return total;
}

interface CountryBlockGroup {
  readonly country: Country;
  readonly blocks: {
    popBlockId: Id;
    population: number;
    wealthLevel: number;
    professionId: Id;
  }[];
}

interface BlockFiscalDraft {
  readonly popBlockId: Id;
  readonly countryId: Id;
  readonly incomeTaxRUSD: number;
  readonly welfareReceivedRUSD: number;
}

/**
 * Allocate `total` across population weights proportionally in the supplied
 * order. The last recipient receives the exact remainder so the result sums to
 * `total` without a random draw. Any tolerance-sized floating residue is moved
 * to the first recipient; only tolerance-sized negatives may be clamped.
 */
function allocateProportionally(
  total: number,
  weights: readonly { popBlockId: Id; population: number }[],
): Map<Id, number> {
  const allocations = new Map<Id, number>();
  if (!(total > 0) || weights.length === 0) return allocations;
  const totalWeight = weights.reduce((sum_, entry) => sum_ + entry.population, 0);
  if (!(totalWeight > 0)) return allocations;
  let allocated = 0;
  for (let index = 0; index < weights.length; index += 1) {
    const entry = weights[index];
    if (entry === undefined) continue;
    const amount =
      index === weights.length - 1 ? total - allocated : (total * entry.population) / totalWeight;
    allocations.set(entry.popBlockId, amount);
    allocated += amount;
  }
  for (const [popBlockId, amount] of allocations) {
    if (amount >= -toleranceMoney(total)) continue;
    throw new RangeError(
      `welfare allocation produced a negative amount for popBlock ${String(popBlockId)}`,
    );
  }
  const residual = total - sum([...allocations.values()]);
  if (Math.abs(residual) > toleranceMoney(total, residual)) {
    throw new RangeError("welfare allocation did not sum to the payable total");
  }
  if (residual !== 0) {
    const first = weights[0];
    if (first === undefined) throw new RangeError("welfare allocation has no recipient");
    allocations.set(first.popBlockId, (allocations.get(first.popBlockId) ?? 0) + residual);
  }
  for (const [popBlockId, amount] of allocations) {
    if (amount < 0) {
      if (amount < -toleranceMoney(total)) {
        throw new RangeError(
          `welfare allocation remained negative for popBlock ${String(popBlockId)}`,
        );
      }
      allocations.set(popBlockId, 0);
    }
  }
  return allocations;
}

/**
 * Execute the fiscal phase on an isolated finance clone and publish only after
 * the complete staged world validates.
 */
function executeFiscalPhase(
  world: World,
  settlement: MarketSettlementResult,
  dayIndex: DayIndex,
  hooks?: FiscalPhaseTestHooks,
  options: FiscalPhaseOptions = {},
): FiscalPhaseResult {
  assertFiscalPreconditions(world, settlement, dayIndex, options);

  const stagedFinance = phaseFinance(world.finance, options.financeInPlace);
  const index = buildFinanceIndex(stagedFinance);
  const yearDays = daysInYear(dayIndexToCivilDate(dayIndex).year);
  const wagesByBlock = new Map(
    settlement.households.map((household) => [household.popBlockId, household.wagesReceivedRUSD]),
  );
  const owners = buildProvinceOwnerMap(world);
  const countries = [...world.countries].sort((left, right) => left.id - right.id);
  const politics = options.economyDefinitions?.politics;
  const administrationProfessionKeys = new Set(
    politics?.administrationProfessionKeys ?? [],
  );
  const professionKeyById = new Map(
    (options.economyDefinitions?.professions ?? []).map((profession) => [
      profession.id,
      profession.key,
    ]),
  );

  const groups: CountryBlockGroup[] = countries.map((country) => ({
    country,
    blocks: [],
  }));
  const groupByCountry = new Map(groups.map((group) => [group.country.id, group]));
  const unowned: Id[] = [];
  for (const block of [...world.popBlocks].sort((left, right) => left.id - right.id)) {
    const countryId = owners.get(block.provinceId);
    if (countryId === undefined) {
      unowned.push(block.id);
      continue;
    }
    const group = groupByCountry.get(countryId);
    if (group === undefined) {
      throw new RangeError(`province owner ${String(countryId)} is not a registered country`);
    }
    group.blocks.push({
      popBlockId: block.id,
      population: populationTotal(block),
      wealthLevel: block.wealthLevel,
      professionId: block.professionId,
    });
  }
  const anyActive = countries.some((country) => fiscalPolicyIsActive(country.fiscal));
  if (anyActive && unowned.length > 0) {
    throw new RangeError(
      `fiscal policy is active but pop blocks ${unowned.map((id) => String(id)).join(", ")} are in unowned provinces`,
    );
  }

  const taxEntries: JournalEntryInput[] = [];
  const welfareEntries: JournalEntryInput[] = [];
  const administrationEntries: JournalEntryInput[] = [];
  const blockDrafts: BlockFiscalDraft[] = [];
  const countryDrafts: {
    countryId: Id;
    incomeTaxRUSD: number;
    welfareRequestedRUSD: number;
    welfarePaidRUSD: number;
    welfareShortfallRUSD: number;
    welfareEligibleBlocks: number;
    welfareEligiblePopulation: number;
    administrationRequestedRUSD: number;
    administrationPaidRUSD: number;
    administrationShortfallRUSD: number;
    treasuryCashStartRUSD: number;
    reserveTargetRUSD: number;
  }[] = [];

  interface CountryFiscalPlan {
    readonly group: CountryBlockGroup;
    readonly taxByBlock: ReadonlyMap<Id, number>;
    readonly incomeTaxRUSD: number;
    readonly treasuryCashStartRUSD: number;
    readonly welfareRequestedRUSD: number;
    readonly reserveTargetRUSD: number;
  }
  const plans: CountryFiscalPlan[] = [];

  // Pass 1: income tax. Posting it first makes the welfare phase read the exact
  // post-tax treasury balance, so paying the entire available cash leaves an
  // exact zero instead of a floating-association residual.
  for (const group of groups) {
    const country = group.country;
    const fiscal = country.fiscal;
    const rate = fiscal.incomeTaxRate;
    // E2 income-tax schedule: the annual exemption is pro-rated over the civil
    // year and subtracted from each block's actual daily wage receipt.
    const dailyAllowance = fiscal.incomeTaxAllowanceRUSDPerYear / yearDays;
    if (!Number.isFinite(dailyAllowance) || dailyAllowance < 0) {
      throw new RangeError(`invalid income-tax allowance for country ${String(country.id)}`);
    }
    const treasuryCashStart = index.get("country", country.id, "treasury-cash").balanceRUSD;
    const requested = fiscal.welfareBudgetRUSDPerYear / yearDays;
    if (!Number.isFinite(requested) || requested < 0) {
      throw new RangeError(`invalid welfare request for country ${String(country.id)}`);
    }
    const reserveTarget = fiscal.reserveTargetRUSD;
    if (!Number.isFinite(reserveTarget) || reserveTarget < 0) {
      throw new RangeError(`invalid reserve target for country ${String(country.id)}`);
    }
    const taxLines: JournalLine[] = [];
    const taxByBlock = new Map<Id, number>();
    let taxTotal = 0;
    const collectionEfficiency = taxCollectionEfficiency(country);
    if (rate > 0) {
      for (const block of group.blocks) {
        const wages = wagesByBlock.get(block.popBlockId) ?? 0;
        if (!Number.isFinite(wages) || wages < 0) {
          throw new RangeError(`invalid settled wages for popBlock ${String(block.popBlockId)}`);
        }
        const taxable = Math.max(0, wages - dailyAllowance);
        const tax = rate * taxable * collectionEfficiency;
        if (!Number.isFinite(tax) || tax < 0) {
          throw new RangeError(`invalid income tax for popBlock ${String(block.popBlockId)}`);
        }
        if (tax > wages + toleranceMoney(tax, wages)) {
          throw new RangeError(
            `income tax ${String(tax)} exceeds received wages ${String(wages)} for popBlock ${String(block.popBlockId)}`,
          );
        }
        if (!(tax > 0)) continue;
        const expense = index.get("popBlock", block.popBlockId, "income-tax-expense");
        const cash = index.get("popBlock", block.popBlockId, "household-cash");
        if (tax > cash.balanceRUSD + toleranceMoney(tax, cash.balanceRUSD)) {
          throw new RangeError(
            `income tax ${String(tax)} exceeds available cash ${String(cash.balanceRUSD)} for popBlock ${String(block.popBlockId)}`,
          );
        }
        taxLines.push({ accountId: expense.id, side: "debit", amountRUSD: tax });
        taxLines.push({ accountId: cash.id, side: "credit", amountRUSD: tax });
        taxByBlock.set(block.popBlockId, tax);
        taxTotal += tax;
      }
    }
    if (taxTotal > 0) {
      const treasury = index.get("country", country.id, "treasury-cash");
      const revenue = index.get("country", country.id, "income-tax-revenue");
      taxLines.push({ accountId: treasury.id, side: "debit", amountRUSD: taxTotal });
      taxLines.push({ accountId: revenue.id, side: "credit", amountRUSD: taxTotal });
      taxEntries.push({
        transactionKind: "income-tax",
        lines: taxLines,
        sourceEntityId: country.id,
        targetEntityId: null,
      });
    }
    plans.push({
      group,
      taxByBlock,
      incomeTaxRUSD: taxTotal,
      treasuryCashStartRUSD: treasuryCashStart,
      welfareRequestedRUSD: requested,
      reserveTargetRUSD: reserveTarget,
    });
  }
  const taxPostings = postJournalBatch(stagedFinance, dayIndex, taxEntries);

  // Pass 2: welfare. The index references the mutable staged accounts, so the
  // treasury balance already includes this day's income tax.
  for (const plan of plans) {
    const country = plan.group.country;
    const requested = plan.welfareRequestedRUSD;
    const available = index.get("country", country.id, "treasury-cash").balanceRUSD;
    if (available < 0) {
      throw new RangeError(`treasury cash is negative for country ${String(country.id)}`);
    }
    // E2 treasury reserve floor: welfare may not draw cash below the policy
    // target. The reserve is a liquidity policy, not a spendable pool, and it
    // never creates cash: when actual cash is already below the target, nothing
    // is transferred and the requested amount is an explicit shortfall.
    const payableCeiling = Math.max(0, available - plan.reserveTargetRUSD);
    // E2 welfare eligibility: only blocks at or below the wealth ceiling receive
    // the transfer. A policy with no eligible blocks pays nothing and reports the
    // full request as a shortfall, exactly as the zero-population case does.
    const eligible = plan.group.blocks.filter(
      (block) =>
        block.population > 0 &&
        block.wealthLevel <= country.fiscal.welfareMaxWealthLevel,
    );
    const eligiblePopulation = eligible.reduce((total, block) => total + block.population, 0);
    const payable =
      requested > 0 && eligible.length > 0 ? Math.min(requested, payableCeiling) : 0;
    const allocations =
      payable > 0 ? allocateProportionally(payable, eligible) : new Map<Id, number>();
    const paid = payable;
    const welfareLines: JournalLine[] = [];
    for (const block of eligible) {
      const amount = allocations.get(block.popBlockId) ?? 0;
      if (!(amount > 0)) continue;
      const cash = index.get("popBlock", block.popBlockId, "household-cash");
      const income = index.get("popBlock", block.popBlockId, "welfare-income");
      welfareLines.push({ accountId: cash.id, side: "debit", amountRUSD: amount });
      welfareLines.push({ accountId: income.id, side: "credit", amountRUSD: amount });
    }
    if (paid > available + toleranceMoney(paid, available)) {
      throw new RangeError(
        `welfare payment ${String(paid)} exceeds available treasury cash ${String(available)} for country ${String(country.id)}`,
      );
    }
    if (paid > 0) {
      const treasury = index.get("country", country.id, "treasury-cash");
      const expense = index.get("country", country.id, "welfare-expense");
      welfareLines.push({ accountId: expense.id, side: "debit", amountRUSD: paid });
      welfareLines.push({ accountId: treasury.id, side: "credit", amountRUSD: paid });
      welfareEntries.push({
        transactionKind: "welfare-transfer",
        lines: welfareLines,
        sourceEntityId: country.id,
        targetEntityId: null,
      });
    }
    const shortfall = Math.max(0, requested - paid);
    for (const block of plan.group.blocks) {
      blockDrafts.push({
        popBlockId: block.popBlockId,
        countryId: country.id,
        incomeTaxRUSD: plan.taxByBlock.get(block.popBlockId) ?? 0,
        welfareReceivedRUSD: allocations.get(block.popBlockId) ?? 0,
      });
    }
    if (requested > 0 || shortfall > 0) {
      accumulateBudgetMemo(stagedFinance, country.id, {
        welfareRequestedRUSD: requested,
        welfareShortfallRUSD: shortfall,
      });
    }
    countryDrafts.push({
      countryId: country.id,
      incomeTaxRUSD: plan.incomeTaxRUSD,
      welfareRequestedRUSD: requested,
      welfarePaidRUSD: paid,
      welfareShortfallRUSD: shortfall,
      welfareEligibleBlocks: eligible.length,
      welfareEligiblePopulation: eligiblePopulation,
      administrationRequestedRUSD: 0,
      administrationPaidRUSD: 0,
      administrationShortfallRUSD: 0,
      treasuryCashStartRUSD: plan.treasuryCashStartRUSD,
      reserveTargetRUSD: plan.reserveTargetRUSD,
    });
  }

  // Pass 3 (M8): administration payroll. Welfare is posted first so the payroll
  // reads the same post-welfare treasury balance and cannot overdraw.
  const welfarePostings = postJournalBatch(stagedFinance, dayIndex, welfareEntries);
  const administrationByCountry = new Map<
    Id,
    { requested: number; paid: number; shortfall: number }
  >();
  if (politics !== undefined && world.politics.enabled) {
    for (const plan of plans) {
      const country = plan.group.country;
      const requested = country.institutions.fundedAnnualRUSD / yearDays;
      if (!Number.isFinite(requested) || requested < 0) {
        throw new RangeError(`invalid administration funding for country ${String(country.id)}`);
      }
      if (!(requested > 0)) continue;
      const eligible = plan.group.blocks.filter((block) => {
        if (!(block.population > 0)) return false;
        const key = professionKeyById.get(block.professionId) ?? "";
        return administrationProfessionKeys.has(key);
      });
      const available = index.get("country", country.id, "treasury-cash").balanceRUSD;
      const payableCeiling = Math.max(0, available - plan.reserveTargetRUSD);
      const payable = eligible.length > 0 ? Math.min(requested, payableCeiling) : 0;
      const allocations =
        payable > 0 ? allocateProportionally(payable, eligible) : new Map<Id, number>();
      if (payable > 0) {
        const lines: JournalLine[] = [];
        for (const block of eligible) {
          const amount = allocations.get(block.popBlockId) ?? 0;
          if (!(amount > 0)) continue;
          const cash = index.get("popBlock", block.popBlockId, "household-cash");
          const income = index.get("popBlock", block.popBlockId, "administration-income");
          lines.push({ accountId: cash.id, side: "debit", amountRUSD: amount });
          lines.push({ accountId: income.id, side: "credit", amountRUSD: amount });
        }
        const treasury = index.get("country", country.id, "treasury-cash");
        const expense = index.get("country", country.id, "administration-expense");
        lines.push({ accountId: expense.id, side: "debit", amountRUSD: payable });
        lines.push({ accountId: treasury.id, side: "credit", amountRUSD: payable });
        administrationEntries.push({
          transactionKind: "administration-payroll",
          lines,
          sourceEntityId: country.id,
          targetEntityId: null,
        });
      }
      const shortfall = Math.max(0, requested - payable);
      administrationByCountry.set(country.id, {
        requested,
        paid: payable,
        shortfall,
      });
      accumulateBudgetMemo(stagedFinance, country.id, {
        administrationRequestedRUSD: requested,
        administrationShortfallRUSD: shortfall,
      });
    }
  }

  const administrationPostings = postJournalBatch(
    stagedFinance,
    dayIndex,
    administrationEntries,
  );
  const postings = [...taxPostings, ...welfarePostings, ...administrationPostings];
  hooks?.afterStagedPostings?.(stagedFinance);

  // Full staged-world validation covers balances, owner references, treasury
  // references, country fiscal values, summaries, and accounting invariants.
  if (options.validateWorld !== false) {
    assertValidWorldForTick({ ...world, finance: stagedFinance });
  }

  const blockResults: FiscalBlockResult[] = blockDrafts.map((draft) => ({
    ...draft,
    endingCashAfterFiscalRUSD: index.get("popBlock", draft.popBlockId, "household-cash").balanceRUSD,
  }));
  const countryResults: FiscalCountryResult[] = countryDrafts.map((draft) => {
    const administration = administrationByCountry.get(draft.countryId);
    return {
      ...draft,
      administrationRequestedRUSD: administration?.requested ?? 0,
      administrationPaidRUSD: administration?.paid ?? 0,
      administrationShortfallRUSD: administration?.shortfall ?? 0,
      treasuryCashEndRUSD: index.get("country", draft.countryId, "treasury-cash").balanceRUSD,
    };
  });
  for (const result of countryResults) {
    if (
      Math.abs(
        result.treasuryCashEndRUSD -
          (result.treasuryCashStartRUSD +
            result.incomeTaxRUSD -
            result.welfarePaidRUSD -
            result.administrationPaidRUSD),
      ) >
      toleranceMoney(result.treasuryCashEndRUSD, result.treasuryCashStartRUSD)
    ) {
      throw new RangeError(
        `treasury cash for country ${String(result.countryId)} does not reconcile after the fiscal phase`,
      );
    }
  }
  blockResults.sort((left, right) => left.popBlockId - right.popBlockId);
  countryResults.sort((left, right) => left.countryId - right.countryId);
  const totals: FiscalTotals = {
    incomeTaxRUSD: countryResults.reduce((total, result) => total + result.incomeTaxRUSD, 0),
    welfareRequestedRUSD: countryResults.reduce(
      (total, result) => total + result.welfareRequestedRUSD,
      0,
    ),
    welfarePaidRUSD: countryResults.reduce((total, result) => total + result.welfarePaidRUSD, 0),
    welfareShortfallRUSD: countryResults.reduce(
      (total, result) => total + result.welfareShortfallRUSD,
      0,
    ),
    administrationRequestedRUSD: countryResults.reduce(
      (total, result) => total + result.administrationRequestedRUSD,
      0,
    ),
    administrationPaidRUSD: countryResults.reduce(
      (total, result) => total + result.administrationPaidRUSD,
      0,
    ),
    administrationShortfallRUSD: countryResults.reduce(
      (total, result) => total + result.administrationShortfallRUSD,
      0,
    ),
  };

  // Publish only after every staged postcondition has passed.
  world.finance = stagedFinance;
  for (const [countryId, memo] of administrationByCountry) {
    const country = world.countries.find((candidate) => candidate.id === countryId);
    if (country === undefined) continue;
    country.institutions = {
      ...country.institutions,
      fundingRequestedMonthToDateRUSD:
        country.institutions.fundingRequestedMonthToDateRUSD + memo.requested,
      fundingShortfallMonthToDateRUSD:
        country.institutions.fundingShortfallMonthToDateRUSD + memo.shortfall,
    };
  }
  settlement.fiscalApplied = true;
  return {
    dayIndex,
    countries: countryResults,
    blocks: blockResults,
    totals,
    postingIds: postings.map((posting) => posting.id),
  };
}

/**
 * Run the fiscal phase. Exported for direct tests and `runEconomicDay`, but not
 * re-exported from the package root; callers must not invoke it twice for the
 * same settlement result.
 */
export function runFiscalPhase(
  world: World,
  settlement: MarketSettlementResult,
  dayIndex: DayIndex,
  options: FiscalPhaseOptions = {},
): FiscalPhaseResult {
  return executeFiscalPhase(world, settlement, dayIndex, undefined, options);
}

/** Test-only publication-atomicity hook. Not part of the package API. */
export function __runFiscalPhaseWithHooks(
  world: World,
  settlement: MarketSettlementResult,
  dayIndex: DayIndex,
  hooks: FiscalPhaseTestHooks,
  options: FiscalPhaseOptions = {},
): FiscalPhaseResult {
  return executeFiscalPhase(world, settlement, dayIndex, hooks, options);
}
