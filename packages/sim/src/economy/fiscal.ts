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
 * 2. Welfare transfer: the country's daily budget share
 *    (`welfareBudgetSUSDPerYear / daysInYear(civil year)`) is paid from treasury
 *    cash to the country's population blocks in proportion to population. If the
 *    treasury cannot fund the request, only the payable amount is transferred
 *    and the difference is reported as a shortfall. No debt, arrears, or
 *    negative cash is created.
 *
 * All entries are built and checked first, then posted as one atomic batch. The
 * phase uses the same day's settlement result and never estimates wages from
 * accumulated account balances. No keyed randomness is used: countries and
 * blocks are processed in ascending id order and the final recipient receives
 * the exact allocation remainder.
 */

import { assertValidDayIndex, dayIndexToCivilDate, daysInYear } from "../calendar.js";
import { MONEY_TOLERANCE_SUSD } from "../population/constants.js";
import { populationTotal } from "../population/state.js";
import type { DayIndex, Id } from "../types.js";
import type { World } from "../world.js";
import { postJournalBatch, type JournalEntryInput } from "./accounting.js";
import { buildFinanceIndex } from "./accounts.js";
import { buildRegionOwnerMap } from "./country.js";
import type { MarketSettlementResult } from "./settlement.js";
import type { Country, JournalLine } from "./types.js";

/** Per-block fiscal result for one processed day. */
export interface FiscalBlockResult {
  readonly popBlockId: Id;
  readonly countryId: Id;
  /** Income tax actually withheld from that day's wage receipt. */
  readonly incomeTaxSUSD: number;
  /** Welfare actually received that day. */
  readonly welfareReceivedSUSD: number;
}

/** Per-country fiscal result for one processed day. */
export interface FiscalCountryResult {
  readonly countryId: Id;
  readonly incomeTaxSUSD: number;
  readonly welfareRequestedSUSD: number;
  readonly welfarePaidSUSD: number;
  readonly welfareShortfallSUSD: number;
  readonly treasuryCashStartSUSD: number;
  readonly treasuryCashEndSUSD: number;
}

/** Aggregate fiscal totals for one processed day. */
export interface FiscalTotals {
  readonly incomeTaxSUSD: number;
  readonly welfareRequestedSUSD: number;
  readonly welfarePaidSUSD: number;
  readonly welfareShortfallSUSD: number;
}

/** Transient result of one fiscal phase. Never persisted as duplicate state. */
export interface FiscalPhaseResult {
  readonly dayIndex: DayIndex;
  readonly countries: readonly FiscalCountryResult[];
  readonly blocks: readonly FiscalBlockResult[];
  readonly totals: FiscalTotals;
  readonly postingIds: readonly number[];
}

function toleranceMoney(...values: number[]): number {
  const scale = Math.max(1, ...values.map((value) => Math.abs(value)));
  return MONEY_TOLERANCE_SUSD * scale;
}

function sum(values: readonly number[]): number {
  let total = 0;
  for (const value of values) total += value;
  return total;
}

interface CountryBlockGroup {
  readonly country: Country;
  readonly blocks: { popBlockId: Id; population: number }[];
}

/**
 * Allocate `total` across `weights` proportionally in the given order. The last
 * recipient receives the exact remainder so the result sums to `total` without
 * a random draw. Every weight is a non-negative integer population count.
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
  // Floating-point proportionality can leave a tiny negative remainder on the
  // last entry when earlier terms round upward. Move that tolerance-sized amount
  // from the largest allocation so every recipient is non-negative.
  for (const [popBlockId, amount] of allocations) {
    if (amount >= -toleranceMoney(total)) continue;
    throw new RangeError(
      `welfare allocation produced a negative amount for popBlock ${String(popBlockId)}`,
    );
  }
  let residual = total - sum([...allocations.values()]);
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
 * Run the M4c fiscal phase against already-settled authoritative state.
 *
 * Inputs: a world and the settlement result of the same day.
 * Effects: posts income-tax and welfare-transfer entries to `world.finance`.
 * Failure: throws before any balance or posting changes.
 */
export function runFiscalPhase(
  world: World,
  settlement: MarketSettlementResult,
  dayIndex: DayIndex,
): FiscalPhaseResult {
  assertValidDayIndex(dayIndex);
  if (settlement.dayIndex !== dayIndex) {
    throw new RangeError("fiscal phase settlement day does not match the processed day");
  }
  const index = buildFinanceIndex(world.finance);
  const yearDays = daysInYear(dayIndexToCivilDate(dayIndex).year);
  const wagesByBlock = new Map(
    settlement.households.map((household) => [household.popBlockId, household.wagesReceivedSUSD]),
  );
  const owners = buildRegionOwnerMap(world);
  const countries = [...world.countries].sort((left, right) => left.id - right.id);

  const groups: CountryBlockGroup[] = countries.map((country) => ({
    country,
    blocks: [],
  }));
  const groupByCountry = new Map(groups.map((group) => [group.country.id, group]));
  const unowned: Id[] = [];
  for (const block of [...world.popBlocks].sort((left, right) => left.id - right.id)) {
    const countryId = owners.get(block.regionId);
    if (countryId === undefined) {
      unowned.push(block.id);
      continue;
    }
    const group = groupByCountry.get(countryId);
    if (group === undefined) {
      throw new RangeError(`region owner ${String(countryId)} is not a registered country`);
    }
    group.blocks.push({
      popBlockId: block.id,
      population: populationTotal(block),
    });
  }
  const anyActive = countries.some(
    (country) =>
      country.fiscal.incomeTaxRate > 0 || country.fiscal.welfareBudgetSUSDPerYear > 0,
  );
  if (anyActive && unowned.length > 0) {
    throw new RangeError(
      `fiscal policy is active but pop blocks ${unowned.map((id) => String(id)).join(", ")} are in unowned regions`,
    );
  }

  const taxEntries: JournalEntryInput[] = [];
  const welfareEntries: JournalEntryInput[] = [];
  const blockResults: FiscalBlockResult[] = [];
  const countryResults: FiscalCountryResult[] = [];

  for (const group of groups) {
    const country = group.country;
    const rate = country.fiscal.incomeTaxRate;
    const treasuryCashStart = index.get("country", country.id, "treasury-cash").balanceSUSD;
    const taxLines: JournalLine[] = [];
    const taxByBlock = new Map<Id, number>();
    let taxTotal = 0;
    if (rate > 0) {
      for (const block of group.blocks) {
        const wages = wagesByBlock.get(block.popBlockId) ?? 0;
        if (!Number.isFinite(wages) || wages < 0) {
          throw new RangeError(`invalid settled wages for popBlock ${String(block.popBlockId)}`);
        }
        const tax = rate * wages;
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
        if (tax > cash.balanceSUSD + toleranceMoney(tax, cash.balanceSUSD)) {
          throw new RangeError(
            `income tax ${String(tax)} exceeds available cash ${String(cash.balanceSUSD)} for popBlock ${String(block.popBlockId)}`,
          );
        }
        taxLines.push({ accountId: expense.id, side: "debit", amountSUSD: tax });
        taxLines.push({ accountId: cash.id, side: "credit", amountSUSD: tax });
        taxByBlock.set(block.popBlockId, tax);
        taxTotal += tax;
      }
    }
    if (taxTotal > 0) {
      const treasury = index.get("country", country.id, "treasury-cash");
      const revenue = index.get("country", country.id, "income-tax-revenue");
      taxLines.push({ accountId: treasury.id, side: "debit", amountSUSD: taxTotal });
      taxLines.push({ accountId: revenue.id, side: "credit", amountSUSD: taxTotal });
      taxEntries.push({
        transactionKind: "income-tax",
        lines: taxLines,
        sourceEntityId: country.id,
        targetEntityId: null,
      });
    }

    const requested = country.fiscal.welfareBudgetSUSDPerYear / yearDays;
    if (!Number.isFinite(requested) || requested < 0) {
      throw new RangeError(`invalid welfare request for country ${String(country.id)}`);
    }
    const available = treasuryCashStart + taxTotal;
    if (available < 0) {
      throw new RangeError(`treasury cash is negative for country ${String(country.id)}`);
    }
    const payable = requested > 0 ? Math.min(requested, Math.max(0, available)) : 0;
    const allocations =
      payable > 0
        ? allocateProportionally(
            payable,
            group.blocks.filter((block) => block.population > 0),
          )
        : new Map<Id, number>();
    let paid = 0;
    const welfareLines: JournalLine[] = [];
    for (const block of group.blocks) {
      const amount = allocations.get(block.popBlockId) ?? 0;
      if (!(amount > 0)) continue;
      const cash = index.get("popBlock", block.popBlockId, "household-cash");
      const income = index.get("popBlock", block.popBlockId, "welfare-income");
      welfareLines.push({ accountId: cash.id, side: "debit", amountSUSD: amount });
      welfareLines.push({ accountId: income.id, side: "credit", amountSUSD: amount });
      paid += amount;
    }
    if (paid > available + toleranceMoney(paid, available)) {
      throw new RangeError(
        `welfare payment ${String(paid)} exceeds available treasury cash ${String(available)} for country ${String(country.id)}`,
      );
    }
    if (paid > 0) {
      const treasury = index.get("country", country.id, "treasury-cash");
      const expense = index.get("country", country.id, "welfare-expense");
      welfareLines.push({ accountId: expense.id, side: "debit", amountSUSD: paid });
      welfareLines.push({ accountId: treasury.id, side: "credit", amountSUSD: paid });
      welfareEntries.push({
        transactionKind: "welfare-transfer",
        lines: welfareLines,
        sourceEntityId: country.id,
        targetEntityId: null,
      });
    }
    const shortfall = Math.max(0, requested - paid);
    const treasuryCashEnd = treasuryCashStart + taxTotal - paid;
    if (treasuryCashEnd < 0) {
      throw new RangeError(`fiscal phase would overdraw treasury for country ${String(country.id)}`);
    }
    for (const block of group.blocks) {
      blockResults.push({
        popBlockId: block.popBlockId,
        countryId: country.id,
        incomeTaxSUSD: taxByBlock.get(block.popBlockId) ?? 0,
        welfareReceivedSUSD: allocations.get(block.popBlockId) ?? 0,
      });
    }
    countryResults.push({
      countryId: country.id,
      incomeTaxSUSD: taxTotal,
      welfareRequestedSUSD: requested,
      welfarePaidSUSD: paid,
      welfareShortfallSUSD: shortfall,
      treasuryCashStartSUSD: treasuryCashStart,
      treasuryCashEndSUSD: treasuryCashEnd,
    });
  }

  const entries = [...taxEntries, ...welfareEntries];
  const postings = postJournalBatch(world.finance, dayIndex, entries);
  for (const result of countryResults) {
    const treasury = index.get("country", result.countryId, "treasury-cash");
    if (
      Math.abs(treasury.balanceSUSD - result.treasuryCashEndSUSD) >
      toleranceMoney(treasury.balanceSUSD, result.treasuryCashEndSUSD)
    ) {
      throw new RangeError(
        `treasury cash for country ${String(result.countryId)} does not reconcile after the fiscal phase`,
      );
    }
  }
  blockResults.sort((left, right) => left.popBlockId - right.popBlockId);
  countryResults.sort((left, right) => left.countryId - right.countryId);
  return {
    dayIndex,
    countries: countryResults,
    blocks: blockResults,
    totals: {
      incomeTaxSUSD: countryResults.reduce((total, result) => total + result.incomeTaxSUSD, 0),
      welfareRequestedSUSD: countryResults.reduce(
        (total, result) => total + result.welfareRequestedSUSD,
        0,
      ),
      welfarePaidSUSD: countryResults.reduce((total, result) => total + result.welfarePaidSUSD, 0),
      welfareShortfallSUSD: countryResults.reduce(
        (total, result) => total + result.welfareShortfallSUSD,
        0,
      ),
    },
    postingIds: postings.map((posting) => posting.id),
  };
}
