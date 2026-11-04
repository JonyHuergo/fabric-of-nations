/**
 * E4 sectoral production-subsidy phase (D-075).
 *
 * The subsidy is an ad-valorem payment on **verified daily gross output value**
 * at the current market price. It is not a production order, a price control, or a
 * spendable pool:
 *
 * - the base is the physical output recorded by the already-completed production
 *   phase, valued at the market's post-clearing price;
 * - the rate is a validated country policy per building sector;
 * - payment is limited by actual treasury cash, in ascending building-id order;
 * - paid amounts are a country `subsidy-expense` and enterprise `subsidy-revenue`,
 *   with matching treasury/operating-cash legs (cash-neutral);
 * - unpaid entitlement is an explicit shortfall, never a liability or receivable.
 *
 * The phase runs after the market/fiscal phases and before business tax, so the
 * month-end business-tax base includes the recognized subsidy revenue. It never
 * changes physical output, market stock, employment, or building ownership.
 */

import {
  assertValidDayIndex,
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
  phaseFinance,
  designatedCashTotal,
} from "./accounts.js";
import { accumulateBudgetMemo } from "./budget.js";
import { assertValidEconomyDefinitions } from "./definitions.js";
import type { MarketDayResult } from "./market.js";
import { assertValidFinanceState } from "./validation.js";
import type { BuildingDef, EconomyDefinitions } from "./types.js";
import { BUILDING_SECTORS } from "./types.js";
import { buildProvinceOwnerMap } from "./country.js";

/**
 * MONEY_TOLERANCE_RUSD scaled by the largest magnitude, at least 1. Fixed arity (D-139): the
 * former rest parameter allocated an array on every call; a missing value is 0,
 * which never raises the scale above 1, so the result is unchanged.
 */
function toleranceMoney(a: number, b = 0, c = 0, d = 0, e = 0, f = 0, g = 0, h = 0): number {
  return (
    MONEY_TOLERANCE_RUSD *
    Math.max(1, Math.abs(a), Math.abs(b), Math.abs(c), Math.abs(d), Math.abs(e), Math.abs(f), Math.abs(g), Math.abs(h))
  );
}

export interface IndustrialSubsidyBuildingResult {
  readonly buildingId: Id;
  readonly countryId: Id;
  readonly sector: BuildingDef["sector"];
  readonly outputValueRUSD: number;
  readonly rate: number;
  readonly entitlementRUSD: number;
  readonly paidRUSD: number;
  readonly shortfallRUSD: number;
}

export interface IndustrialSubsidyCountryResult {
  readonly countryId: Id;
  readonly requestedRUSD: number;
  readonly paidRUSD: number;
  readonly shortfallRUSD: number;
}

export interface IndustrialSubsidyPhaseResult {
  readonly ran: boolean;
  readonly dayIndex: DayIndex;
  readonly buildings: readonly IndustrialSubsidyBuildingResult[];
  readonly countries: readonly IndustrialSubsidyCountryResult[];
  readonly requestedRUSD: number;
  readonly paidRUSD: number;
  readonly shortfallRUSD: number;
  readonly postingIds: readonly number[];
}

function emptyResult(dayIndex: DayIndex): IndustrialSubsidyPhaseResult {
  return {
    ran: false,
    dayIndex,
    buildings: [],
    countries: [],
    requestedRUSD: 0,
    paidRUSD: 0,
    shortfallRUSD: 0,
    postingIds: [],
  };
}

/** Run one deterministic sectoral-subsidy phase on a validated market day. */
export function runIndustrialSubsidyPhase(
  world: World,
  definitions: EconomyDefinitions,
  markets: readonly MarketDayResult[],
  dayIndex: DayIndex,
  options: PhaseValidationOptions = {},
): IndustrialSubsidyPhaseResult {
  assertValidDayIndex(dayIndex);
  if (isTerminalDayIndex(dayIndex)) {
    throw new RangeError("the terminal 2000-01-01 boundary cannot run industrial subsidies");
  }
  if (world.dayIndex !== dayIndex) {
    throw new RangeError("industrial subsidy day does not match the world day");
  }
  if (
    definitions.dataVersion !== world.dataVersion ||
    definitions.scenarioId !== world.scenarioId
  ) {
    throw new RangeError("industrial definitions do not match the world identity");
  }
  // Staged mode: the integrated day validated the definitions once at its start.
  if (options.validateWorld !== false) assertValidEconomyDefinitions(definitions);
  if (options.validateWorld !== false) assertValidWorldForTick(world);
  if (
    !world.countries.some((country) =>
      country.industrial.sectorSubsidyRates.some((rate) => rate > 0),
    )
  ) {
    return emptyResult(dayIndex);
  }

  const definitionById = new Map(
    definitions.buildings.map((definition) => [definition.id, definition]),
  );
  const provinceOwner = buildProvinceOwnerMap(world);
  const countryById = new Map(world.countries.map((country) => [country.id, country]));
  const buildingById = new Map(world.buildings.map((building) => [building.id, building]));

  // Gather every verified production building result once. A building appears in
  // exactly one market's production result, so there is no double entitlement.
  const candidates: {
    buildingId: Id;
    countryId: Id;
    sector: BuildingDef["sector"];
    outputValueRUSD: number;
    rate: number;
  }[] = [];
  for (const market of [...markets].sort((left, right) => left.marketId - right.marketId)) {
    for (const production of market.production.buildings) {
      const building = buildingById.get(production.buildingId);
      if (building === undefined) continue;
      const definition = definitionById.get(building.definitionId);
      if (definition === undefined) continue;
      const countryId = provinceOwner.get(building.provinceId);
      if (countryId === undefined) continue;
      const country = countryById.get(countryId);
      if (country === undefined) continue;
      const sectorIndex = BUILDING_SECTORS.indexOf(definition.sector);
      const rate = country.industrial.sectorSubsidyRates[sectorIndex] ?? 0;
      if (!(rate > 0)) continue;
      let outputValue = 0;
      for (const output of production.outputs) {
        const price = market.updatedPrices[output.goodId];
        if (price === undefined || !Number.isFinite(price) || price < 0) {
          throw new RangeError(
            `market ${String(market.marketId)} has no valid price for subsidized output ${String(output.goodId)}`,
          );
        }
        outputValue += output.quantity * price;
      }
      if (!Number.isFinite(outputValue) || outputValue < 0) {
        throw new RangeError(`building ${String(building.id)} output value is invalid`);
      }
      if (!(outputValue > 0)) continue;
      candidates.push({
        buildingId: building.id,
        countryId,
        sector: definition.sector,
        outputValueRUSD: outputValue,
        rate,
      });
    }
  }
  candidates.sort((left, right) => left.buildingId - right.buildingId);
  if (candidates.length === 0) return emptyResult(dayIndex);

  // Opening designated cash before any posting (read here so an in-place phase,
  // D-137, compares the same two totals as a staged one).
  const openingCash = designatedCashTotal(world.finance);
  const stagedFinance = phaseFinance(world.finance, options.financeInPlace);
  const index = buildFinanceIndex(stagedFinance);
  const cashByCountry = new Map<Id, number>();
  const entries: JournalEntryInput[] = [];
  const buildingResults: IndustrialSubsidyBuildingResult[] = [];
  const requestedByCountry = new Map<Id, number>();
  const paidByCountry = new Map<Id, number>();
  let requestedRUSD = 0;
  let paidRUSD = 0;
  let shortfallRUSD = 0;
  for (const candidate of candidates) {
    const treasury = index.get("country", candidate.countryId, "treasury-cash");
    if (!cashByCountry.has(candidate.countryId)) {
      cashByCountry.set(candidate.countryId, treasury.balanceRUSD);
    }
    let cash = cashByCountry.get(candidate.countryId) ?? 0;
    const entitlement = candidate.outputValueRUSD * candidate.rate;
    const paid = Math.min(entitlement, cash);
    const shortfall = Math.max(0, entitlement - paid);
    requestedByCountry.set(
      candidate.countryId,
      (requestedByCountry.get(candidate.countryId) ?? 0) + entitlement,
    );
    paidByCountry.set(
      candidate.countryId,
      (paidByCountry.get(candidate.countryId) ?? 0) + paid,
    );
    requestedRUSD += entitlement;
    paidRUSD += paid;
    shortfallRUSD += shortfall;
    if (paid > toleranceMoney(paid)) {
      const buildingCash = index.get("building", candidate.buildingId, "operating-cash");
      const subsidyRevenue = index.get("building", candidate.buildingId, "subsidy-revenue");
      const subsidyExpense = index.get("country", candidate.countryId, "subsidy-expense");
      entries.push({
        transactionKind: "production-subsidy",
        lines: [
          { accountId: subsidyExpense.id, side: "debit", amountRUSD: paid },
          { accountId: treasury.id, side: "credit", amountRUSD: paid },
          { accountId: buildingCash.id, side: "debit", amountRUSD: paid },
          { accountId: subsidyRevenue.id, side: "credit", amountRUSD: paid },
        ],
        sourceEntityId: candidate.countryId,
        targetEntityId: candidate.buildingId,
      });
      cash -= paid;
      cashByCountry.set(candidate.countryId, cash);
    }
    buildingResults.push({
      buildingId: candidate.buildingId,
      countryId: candidate.countryId,
      sector: candidate.sector,
      outputValueRUSD: candidate.outputValueRUSD,
      rate: candidate.rate,
      entitlementRUSD: entitlement,
      paidRUSD: paid,
      shortfallRUSD: shortfall,
    });
  }
  for (const [countryId, requested] of [...requestedByCountry.entries()].sort(
    (left, right) => left[0] - right[0],
  )) {
    const paid = paidByCountry.get(countryId) ?? 0;
    accumulateBudgetMemo(stagedFinance, countryId, {
      subsidyRequestedRUSD: requested,
      subsidyShortfallRUSD: Math.max(0, requested - paid),
    });
  }
  const postings = postJournalBatch(stagedFinance, dayIndex, entries);
  assertValidFinanceState(stagedFinance);
  assertAccountingIdentity(stagedFinance);
  const closingCash = designatedCashTotal(stagedFinance);
  if (Math.abs(openingCash - closingCash) > toleranceMoney(openingCash, closingCash)) {
    throw new RangeError("industrial subsidy phase did not conserve designated cash");
  }
  if (options.validateWorld !== false) assertValidWorldForTick(world);
  world.finance = stagedFinance;
  return {
    ran: true,
    dayIndex,
    buildings: buildingResults,
    countries: [...requestedByCountry.entries()]
      .map(([countryId, requested]) => ({
        countryId,
        requestedRUSD: requested,
        paidRUSD: paidByCountry.get(countryId) ?? 0,
        shortfallRUSD: Math.max(0, requested - (paidByCountry.get(countryId) ?? 0)),
      }))
      .sort((left, right) => left.countryId - right.countryId),
    requestedRUSD,
    paidRUSD,
    shortfallRUSD,
    postingIds: postings.map((posting) => posting.id),
  };
}
