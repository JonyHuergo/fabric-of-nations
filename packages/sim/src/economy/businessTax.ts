/**
 * E2 business-profit tax phase (D-073).
 *
 * Assessed once per civil month-end, after the daily fiscal phase and before the
 * debt phase and the M4b close. The tax base is the building's already-recognized
 * current-period net result:
 *
 *   max(0, sales-revenue + subsidy-revenue - input-expense - wage-expense - upkeep-expense)
 *
 * Sectoral production subsidies are taxable enterprise revenue, so they are part
 * of the recognized current-period result. The subsidy itself remains a separate
 * country expense; it is not netted out of the tax base.
 *
 * i.e. actual revenue minus eligible costs, not gross sales. Only positive
 * results are taxable. A loss is not refunded, not carried forward as a tax
 * deduction, and not converted into a receivable: M5a retained profit already
 * absorbs losses for distribution purposes, and E2 deliberately does not invent a
 * second loss-carryforward mechanism. Retained profit later distributed to an
 * owner is not revenue, so the same profit is never taxed twice.
 *
 * Collection is limited by the building's actual operating cash. Any assessed
 * amount that cannot be paid is reported as an explicit uncollected shortfall; no
 * negative cash, receivable, liability, or arrears state is created.
 *
 * Accounting: debit the building's `business-tax-expense` and credit its
 * `operating-cash`; debit the country's `treasury-cash` and credit its distinct
 * `business-tax-revenue`. Country receipts are never income-tax revenue. The phase
 * is staged atomically and publishes only after the complete candidate world
 * validates.
 */

import {
  assertValidDayIndex,
  dayIndexToCivilDate,
  daysInMonth,
  isTerminalDayIndex,
} from "../calendar.js";
import { MONEY_TOLERANCE_RUSD } from "../population/constants.js";
import type { DayIndex, Id } from "../types.js";
import {
  assertValidWorldForTick,
  type PhaseValidationOptions,
  type World,
} from "../world.js";
import { postJournalBatch, type JournalEntryInput } from "./accounting.js";
import {
  assertAccountingIdentity,
  buildFinanceIndex,
  cloneFinanceState,
  designatedCashTotal,
  type FinanceIndex,
} from "./accounts.js";
import { accumulateBudgetMemo, readBudgetMemo } from "./budget.js";
import { buildProvinceOwnerMap } from "./country.js";
import { assertValidFinanceState } from "./validation.js";
import type { FinanceState } from "./types.js";

/** One building assessment in a processed month-end. */
export interface BusinessTaxBuildingResult {
  readonly buildingId: Id;
  readonly countryId: Id;
  readonly taxableProfitRUSD: number;
  readonly assessedRUSD: number;
  readonly collectedRUSD: number;
  readonly uncollectedRUSD: number;
}

/** One country's business-profit tax result. */
export interface BusinessTaxCountryResult {
  readonly countryId: Id;
  readonly assessedRUSD: number;
  readonly collectedRUSD: number;
  readonly uncollectedRUSD: number;
}

/** Transient result of one business-profit tax phase. */
export interface BusinessTaxPhaseResult {
  readonly ran: boolean;
  readonly dayIndex: DayIndex;
  readonly countries: readonly BusinessTaxCountryResult[];
  readonly buildings: readonly BusinessTaxBuildingResult[];
  readonly assessedRUSD: number;
  readonly collectedRUSD: number;
  readonly uncollectedRUSD: number;
  readonly postingIds: readonly number[];
}

function emptyResult(dayIndex: DayIndex): BusinessTaxPhaseResult {
  return {
    ran: false,
    dayIndex,
    countries: [],
    buildings: [],
    assessedRUSD: 0,
    collectedRUSD: 0,
    uncollectedRUSD: 0,
    postingIds: [],
  };
}

function toleranceMoney(...values: number[]): number {
  let scale = 1;
  for (const value of values) scale = Math.max(scale, Math.abs(value));
  return MONEY_TOLERANCE_RUSD * scale;
}

function isLastCivilDayOfMonth(dayIndex: DayIndex): boolean {
  const date = dayIndexToCivilDate(dayIndex);
  return date.day === daysInMonth(date.year, date.month);
}

/** Current open-period net result of one building, from its authoritative accounts. */
function periodNetResult(index: FinanceIndex, buildingId: Id): number {
  const revenue = index.get("building", buildingId, "sales-revenue").balanceRUSD;
  const subsidy = index.get("building", buildingId, "subsidy-revenue").balanceRUSD;
  const input = index.get("building", buildingId, "input-expense").balanceRUSD;
  const wage = index.get("building", buildingId, "wage-expense").balanceRUSD;
  const upkeep = index.get("building", buildingId, "upkeep-expense").balanceRUSD;
  const result = revenue + subsidy - input - wage - upkeep;
  if (!Number.isFinite(result)) {
    throw new RangeError(`building ${String(buildingId)} period net result is not finite`);
  }
  return Object.is(result, -0) ? 0 : result;
}

/**
 * Run the business-profit tax phase. Exported for direct tests and
 * `runEconomicDay`; callers must not invoke it twice for the same day.
 */
export function runBusinessTaxPhase(
  world: World,
  dayIndex: DayIndex,
  options: PhaseValidationOptions = {},
): BusinessTaxPhaseResult {
  assertValidDayIndex(dayIndex);
  if (isTerminalDayIndex(dayIndex)) {
    throw new RangeError("the terminal 2000-01-01 boundary cannot run the business-tax phase");
  }
  if (world.dayIndex !== dayIndex) {
    throw new RangeError(
      `business-tax phase day ${String(dayIndex)} does not match world.dayIndex ${String(world.dayIndex)}`,
    );
  }
  const active = world.countries.some((country) => country.fiscal.businessProfitTaxRate > 0);
  if (!active) return emptyResult(dayIndex);
  if (!isLastCivilDayOfMonth(dayIndex)) return emptyResult(dayIndex);
  if (options.validateWorld !== false) assertValidFinanceState(world.finance);

  const staged: FinanceState = cloneFinanceState(world.finance);
  const index = buildFinanceIndex(staged);
  const owners = buildProvinceOwnerMap(world);
  const openingCash = designatedCashTotal(world.finance);
  const entries: JournalEntryInput[] = [];
  const buildingResults: BusinessTaxBuildingResult[] = [];
  const countryTotals = new Map<Id, { assessed: number; collected: number; uncollected: number }>();
  const countries = [...world.countries].sort((left, right) => left.id - right.id);
  const buildings = [...world.buildings].sort((left, right) => left.id - right.id);

  for (const country of countries) {
    const rate = country.fiscal.businessProfitTaxRate;
    if (!(rate > 0)) continue;
    if (readBudgetMemo(staged, country.id).businessTaxAssessedDay === dayIndex) {
      throw new RangeError(
        `country ${String(country.id)} business-profit tax was already assessed on day ${String(dayIndex)}`,
      );
    }
    for (const building of buildings) {
      const ownerCountryId = owners.get(building.provinceId);
      if (ownerCountryId !== country.id) continue;
      const netResult = periodNetResult(index, building.id);
      const taxable = Math.max(0, netResult);
      if (!(taxable > 0)) continue;
      const assessed = rate * taxable;
      if (!Number.isFinite(assessed) || assessed < 0) {
        throw new RangeError(`invalid business-profit tax for building ${String(building.id)}`);
      }
      if (!(assessed > 0)) continue;
      const operatingCash = index.get("building", building.id, "operating-cash").balanceRUSD;
      const available = Math.max(0, operatingCash);
      const collected = Math.min(assessed, available);
      if (collected < 0 || !Number.isFinite(collected)) {
        throw new RangeError(
          `invalid business-profit tax collection for building ${String(building.id)}`,
        );
      }
      // Amounts at or below the money tolerance are treated as no payment so a
      // floating residual never creates a posting line of size ~1e-6.
      const paid = collected > toleranceMoney(collected) ? collected : 0;
      const uncollected = assessed - paid;
      if (paid > 0) {
        entries.push({
          transactionKind: "business-profit-tax",
          lines: [
            {
              accountId: index.get("building", building.id, "business-tax-expense").id,
              side: "debit",
              amountRUSD: paid,
            },
            {
              accountId: index.get("building", building.id, "operating-cash").id,
              side: "credit",
              amountRUSD: paid,
            },
            {
              accountId: index.get("country", country.id, "treasury-cash").id,
              side: "debit",
              amountRUSD: paid,
            },
            {
              accountId: index.get("country", country.id, "business-tax-revenue").id,
              side: "credit",
              amountRUSD: paid,
            },
          ],
          sourceEntityId: country.id,
          targetEntityId: building.id,
        });
      }
      buildingResults.push({
        buildingId: building.id,
        countryId: country.id,
        taxableProfitRUSD: taxable,
        assessedRUSD: assessed,
        collectedRUSD: paid,
        uncollectedRUSD: uncollected,
      });
      const total = countryTotals.get(country.id) ?? {
        assessed: 0,
        collected: 0,
        uncollected: 0,
      };
      countryTotals.set(country.id, {
        assessed: total.assessed + assessed,
        collected: total.collected + paid,
        uncollected: total.uncollected + uncollected,
      });
    }
    if (!countryTotals.has(country.id)) {
      countryTotals.set(country.id, { assessed: 0, collected: 0, uncollected: 0 });
    }
  }

  const postings = postJournalBatch(staged, dayIndex, entries);
  for (const country of countries) {
    const totals = countryTotals.get(country.id);
    if (totals === undefined) continue;
    accumulateBudgetMemo(staged, country.id, {
      businessTaxAssessedRUSD: totals.assessed,
      businessTaxUncollectedRUSD: totals.uncollected,
      businessTaxAssessedDay: dayIndex,
    });
  }

  if (options.validateWorld !== false) {
    assertValidFinanceState(staged);
    assertAccountingIdentity(staged);
  }
  const closingCash = designatedCashTotal(staged);
  if (Math.abs(openingCash - closingCash) > toleranceMoney(openingCash, closingCash)) {
    throw new RangeError("business-tax phase did not conserve aggregate designated cash");
  }
  const candidate: World = { ...world, finance: staged };
  if (options.validateWorld !== false) assertValidWorldForTick(candidate);
  world.finance = staged;

  const countriesResult = [...countryTotals.entries()]
    .map(([countryId, totals]) => ({
      countryId,
      assessedRUSD: totals.assessed,
      collectedRUSD: totals.collected,
      uncollectedRUSD: totals.uncollected,
    }))
    .sort((left, right) => left.countryId - right.countryId);
  buildingResults.sort((left, right) => left.buildingId - right.buildingId);
  return {
    ran: true,
    dayIndex,
    countries: countriesResult,
    buildings: buildingResults,
    assessedRUSD: countriesResult.reduce((total, entry) => total + entry.assessedRUSD, 0),
    collectedRUSD: countriesResult.reduce((total, entry) => total + entry.collectedRUSD, 0),
    uncollectedRUSD: countriesResult.reduce(
      (total, entry) => total + entry.uncollectedRUSD,
      0,
    ),
    postingIds: postings.map((posting) => posting.id),
  };
}
