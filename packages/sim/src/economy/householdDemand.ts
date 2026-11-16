/**
 * P6 (D-153): household demand rows from the linear expenditure system (plan §2).
 *
 * Replaces the tier quantities for worlds whose population definitions carry a demand
 * system. Each block's plan (`population/demandSystem.ts`) becomes market rows:
 * - committed quantities of subsistence-tier categories (food) at market tier 1 and
 *   label "subsistence"; other committed quantities at tier 3, label "basic";
 * - supernumerary quantities at tier 6, label "comfort";
 * - the retail-margin services of each row (commerce, transport) in the same tier;
 * - new dwellings (plan §4.3) at tier 6, label "luxury", funded last, from cash above the
 *   reserve.
 * Rows are funded tier by tier from the block's opening cash at today's market prices
 * (the rule of the tier path): a tier the cash cannot fully fund is funded
 * proportionally and later tiers are not generated. Food kept from the block's own
 * farms (P5a) is taken off its committed quantities first.
 */

import { daysInYear, dayIndexToCivilDate } from "../calendar.js";
import { scratchF64, scratchI32, scratchU8, type DayScratch } from "./dayScratch.js";
import { MONEY_TOLERANCE_RUSD } from "../population/constants.js";
import {
  CASH_RESERVE_DAYS,
  DWELLING_DEPRECIATION_RATE_PER_YEAR,
  HOUSING_ADJUSTMENT_DAYS,
  MARGINAL_PROPENSITY_TO_CONSUME,
  WEALTH_CONSUMPTION_RATE_PER_YEAR,
} from "../population/constants.js";
import {
  createDemandPlanOutput,
  planHouseholdDemand,
  retailPowers,
  type ResolvedDemandSystem,
  type RetailPowers,
} from "../population/demandSystem.js";
import { adultEquivalents, blockHasHousing, desiredDwellings } from "../population/housing.js";
import type { NeedTier } from "../population/constants.js";
import type { DayResultDetail } from "../population/types.js";
import type { Id } from "../types.js";
import type { World } from "../world.js";
import { inIdOrder } from "../ordering.js";
import type { FinanceIndex } from "./accounts.js";
import type { OwnConsumptionPlan } from "./agriculture.js";
import { buildProvinceOwnerMap } from "./country.js";
import type { HouseholdDemandRecord, HouseholdTier } from "./market.js";
import type { EconomyDefinitions } from "./types.js";
import {
  assertResponseCovers,
  isKernelArrayOf,
  outputArray,
  outputCount,
  runStepsInline,
  type DaySteps,
  type KernelAllocator,
  type KernelArrays,
  type KernelArrayType,
  type KernelJob,
  type KernelOutput,
  type UnitRange,
} from "../parallel.js";

import { personsOfBlock, type BlockTotals } from "../population/blockTotals.js";
/** Planned household spending of one country today (snapshot and report; RUSD). */
export interface HouseholdCountryDemand {
  readonly countryId: Id;
  persons: number;
  /** Income the plans read: smoothed income × persons plus drawdown. */
  income: number;
  consumption: number;
  committedCost: number;
  /** Planned spending by category (committed + supernumerary). */
  readonly categorySpend: Float64Array;
  /** Income and consumption by stratum: lower, middle, upper. */
  readonly incomeByStratum: Float64Array;
  readonly consumptionByStratum: Float64Array;
  /** Dwellings the country's blocks asked for today. */
  dwellingsDesired: number;
}

/** The LES day's household demand: rows in canonical (block, tier, good) order. */
/** D-158: need tier codes of the typed demand rows. */
export const NEED_TIER_CODE: Readonly<Record<NeedTier, number>> = { subsistence: 0, basic: 1, comfort: 2, luxury: 3 };

/**
 * D-158: the day's household demand rows in typed columns (rows of a block contiguous, blocks
 * in id order); large typed buffers live outside the collected heap.
 */
export interface LesHouseholdDemand {
  readonly count: number;
  readonly popBlockId: Float64Array;
  readonly marketId: Int32Array;
  readonly tier: Uint8Array;
  /** `NEED_TIER_CODE` of each row's need tier. */
  readonly needTierCode: Uint8Array;
  readonly goodId: Int32Array;
  readonly desired: Float64Array;
  readonly funded: Float64Array;
  /** First row and end row of each block by block id; -1 where the block has no rows. */
  readonly rowStart: Int32Array;
  readonly rowEnd: Int32Array;
  readonly records: HouseholdDemandRecord[];
  readonly categoryKeys: readonly string[];
  readonly byCountry: ReadonlyMap<Id, HouseholdCountryDemand>;
}

const STRATUM_INDEX = { lower: 0, middle: 1, upper: 2 } as const;

/** Gate of a technology-gated good (P5b C-21): the owner knows it, or the market holds stock. */
export type NeedGate = (provinceId: Id, marketId: Id, technologyId: Id, goodId: Id) => boolean;

/**
 * Ensure every market has smoothed prices (the first day of a demand-system world
 * starts them at the day's opening prices).
 */
export function initialiseSmoothedPrices(world: World): void {
  for (const market of world.markets) {
    if (market.priceSmoothedRUSD.length !== market.priceRUSD.length) market.priceSmoothedRUSD = [...market.priceRUSD];
  }
}

/** D-162: the stratum index and the propensity to consume of each stratum code (0 lower, 1 middle, 2 upper). */
const STRATUM_BY_CODE = ["lower", "middle", "upper"] as const;

/**
 * D-162: the household-demand units (blocks with persons, in id order) and everything a block's
 * plan reads, prepared on the sim thread. Row `u` of every column is unit `u`.
 */
interface LesUnits {
  count: number;
  readonly blockId: Float64Array;
  readonly marketId: Int32Array;
  /** Row of the unit's market in the price tables. */
  readonly marketIndex: Int32Array;
  readonly persons: Float64Array;
  readonly adultEquivalents: Float64Array;
  readonly income: Float64Array;
  readonly cash: Float64Array;
  /** `STRATUM_INDEX` of the block's profession. */
  readonly stratum: Uint8Array;
  readonly urbanShare: Float64Array;
  readonly availability: Int32Array;
  /** Row in the taste table, −1 for none. */
  readonly taste: Int32Array;
  /** Row in the kept-food table, −1 for none. */
  readonly kept: Int32Array;
  readonly hasHousing: Uint8Array;
  readonly dwellings: Float64Array;
  readonly desiredDwellings: Float64Array;
  /** Owning country of the block's province (−1 for none): the summary's key, sim thread only. */
  readonly ownerId: Int32Array;
}

/** D-162: the day's tables a block's plan reads (rows of `goodCount` entries). */
interface LesTables {
  readonly goodCount: number;
  readonly priceSmoothed: Float64Array;
  readonly priceSpot: Float64Array;
  readonly availability: Uint8Array;
  readonly taste: Float64Array;
  readonly kept: Float64Array;
}

/** D-162: a growable set of row columns. */
interface LesRowSink {
  count: number;
  block: Float64Array;
  market: Int32Array;
  tier: Uint8Array;
  need: Uint8Array;
  good: Int32Array;
  desired: Float64Array;
  funded: Float64Array;
}

/** D-162: each unit's plan figures, by unit − `from`. */
interface LesFigures {
  readonly rowEnd: Int32Array;
  readonly income: Float64Array;
  readonly consumption: Float64Array;
  readonly committedCost: Float64Array;
  /** `categoryCount` entries per unit. */
  readonly categorySpend: Float64Array;
  /** Dwellings the unit asked for (0 when its funding stopped before tier 6). */
  readonly dwellingsDesired: Float64Array;
}

function growSink(sink: LesRowSink): void {
  const capacity = Math.max(64, sink.block.length * 2);
  const wider = <T extends Float64Array | Int32Array | Uint8Array>(column: T, make: (size: number) => T): T => {
    const next = make(capacity);
    next.set(column.subarray(0, sink.count));
    return next;
  };
  sink.block = wider(sink.block, (size) => new Float64Array(size));
  sink.market = wider(sink.market, (size) => new Int32Array(size));
  sink.tier = wider(sink.tier, (size) => new Uint8Array(size));
  sink.need = wider(sink.need, (size) => new Uint8Array(size));
  sink.good = wider(sink.good, (size) => new Int32Array(size));
  sink.desired = wider(sink.desired, (size) => new Float64Array(size));
  sink.funded = wider(sink.funded, (size) => new Float64Array(size));
}

/** A table row as a view (a row past the table's end reads as no row). */
function tableRows<T extends Float64Array | Uint8Array>(table: T, goodCount: number): T[] {
  const rows: T[] = [];
  for (let start = 0; start + goodCount <= table.length && goodCount > 0; start += goodCount) {
    rows.push(table.subarray(start, start + goodCount) as T);
  }
  return rows;
}

/**
 * D-162: the plans and rows of units `[from, to)`. Each unit's rows and figures depend only on
 * that unit's inputs and the day's tables, so any split of the units gives the same rows; the
 * rows are appended to `sink` in unit order and `figures` gets each unit's plan.
 */
function runLesRange(
  system: ResolvedDemandSystem,
  year: number,
  tables: LesTables,
  units: LesUnits,
  from: number,
  to: number,
  sink: LesRowSink,
  figures: LesFigures,
): void {
  const goodCount = system.goodCount;
  if (tables.goodCount !== goodCount) throw new RangeError("household demand tables do not match the demand system");
  const out = createDemandPlanOutput(system);
  // Desired quantity per tier (0: tier 1, 1: tier 3, 2: tier 6) by good id.
  const desiredByTier = [new Float64Array(goodCount), new Float64Array(goodCount), new Float64Array(goodCount)];
  const tiers: readonly HouseholdTier[] = [1, 3, 6];
  const labels: readonly NeedTier[] = ["subsistence", "basic", "comfort"];
  const smoothedRows = tableRows(tables.priceSmoothed, goodCount);
  const spotRows = tableRows(tables.priceSpot, goodCount);
  const availabilityRows = tableRows(tables.availability, goodCount);
  const tasteRows = tableRows(tables.taste, goodCount);
  const keptRows = tableRows(tables.kept, goodCount);
  const dwellingGoodId = system.dwellingGoodId;
  const categoryCount = system.categoryKeys.length;
  // D-158: retail prices and price terms per (market, urban share), computed once each.
  const powersByMarket = new Map<number, Map<number, RetailPowers>>();
  const powersOf = (marketIndex: number, prices: ArrayLike<number>, urbanShare: number): RetailPowers => {
    let byUrban = powersByMarket.get(marketIndex);
    if (byUrban === undefined) {
      byUrban = new Map();
      powersByMarket.set(marketIndex, byUrban);
    }
    let powers = byUrban.get(urbanShare);
    if (powers === undefined) {
      powers = retailPowers(system, prices, urbanShare);
      byUrban.set(urbanShare, powers);
    }
    return powers;
  };
  const push = (blockId: Id, marketId: Id, tier: HouseholdTier, label: NeedTier, goodId: number, desired: number, funded: number): void => {
    if (sink.count === sink.block.length) growSink(sink);
    const row = sink.count;
    sink.block[row] = blockId;
    sink.market[row] = marketId;
    sink.tier[row] = tier;
    sink.need[row] = NEED_TIER_CODE[label];
    sink.good[row] = goodId;
    sink.desired[row] = desired;
    sink.funded[row] = funded;
    sink.count = row + 1;
  };

  for (let unit = from; unit < to; unit += 1) {
    const local = unit - from;
    const blockId = units.blockId[unit] ?? 0;
    const marketId = units.marketId[unit] ?? 0;
    const marketIndex = units.marketIndex[unit] ?? 0;
    const persons = units.persons[unit] ?? 0;
    const cash = units.cash[unit] ?? 0;
    const urban = units.urbanShare[unit] ?? 0;
    const smoothed = smoothedRows[marketIndex];
    const spot = spotRows[marketIndex];
    const available = availabilityRows[units.availability[unit] ?? -1];
    if (smoothed === undefined || spot === undefined || available === undefined) {
      throw new RangeError(`household demand unit ${String(unit)} refers to a missing table row`);
    }
    const tasteRow = units.taste[unit] ?? -1;
    const keptRow = units.kept[unit] ?? -1;
    const stratum = STRATUM_BY_CODE[units.stratum[unit] ?? 0] ?? "lower";
    planHouseholdDemand(
      system,
      {
        adultEquivalents: units.adultEquivalents[unit] ?? 0,
        persons,
        incomePerCapitaDay: units.income[unit] ?? 0,
        cash,
        marginalPropensityToConsume: MARGINAL_PROPENSITY_TO_CONSUME[stratum],
        urbanShare: urban,
        prices: smoothed,
        available,
        taste: tasteRow < 0 ? null : (tasteRows[tasteRow] ?? null),
        wealthConsumptionRatePerYear: WEALTH_CONSUMPTION_RATE_PER_YEAR,
        cashReserveDays: CASH_RESERVE_DAYS,
        daysInYear: year,
        powers: powersOf(marketIndex, smoothed, urban),
      },
      out,
    );
    figures.income[local] = out.income;
    figures.consumption[local] = out.consumption;
    figures.committedCost[local] = out.committedCost;
    for (let category = 0; category < categoryCount; category += 1) {
      figures.categorySpend[local * categoryCount + category] = out.categorySpend[category] ?? 0;
    }

    // Quantities by tier, kept food first, margins in the parent's tier.
    for (const array of desiredByTier) array.fill(0);
    const kept = keptRow < 0 ? undefined : keptRows[keptRow];
    for (let goodId = 0; goodId < goodCount; goodId += 1) {
      const category = system.categoryOfGood[goodId] ?? -1;
      if (category < 0) continue;
      let committedQuantity = out.committed[goodId] ?? 0;
      let superQuantity = out.supernumerary[goodId] ?? 0;
      const keptQuantity = kept?.[goodId] ?? 0;
      if (keptQuantity > 0) {
        const fromCommitted = Math.min(committedQuantity, keptQuantity);
        committedQuantity -= fromCommitted;
        superQuantity = Math.max(0, superQuantity - (keptQuantity - fromCommitted));
      }
      const committedTier = (system.categoryAtSubsistenceTier[category] ?? 0) === 1 ? 0 : 1;
      const commerce = urban * (system.commerceMargin[goodId] ?? 0);
      const transport = urban * (system.transportMargin[goodId] ?? 0);
      // D-157: the committed tier, then tier 6, without a pair array per good.
      for (let step = 0; step < 2; step += 1) {
        const quantity = step === 0 ? committedQuantity : superQuantity;
        if (!(quantity > 0)) continue;
        const target = desiredByTier[step === 0 ? committedTier : 2] as Float64Array;
        target[goodId] = (target[goodId] ?? 0) + quantity;
        if (commerce > 0) target[system.commerceGoodId] = (target[system.commerceGoodId] ?? 0) + quantity * commerce;
        if (transport > 0) target[system.transportGoodId] = (target[system.transportGoodId] ?? 0) + quantity * transport;
      }
    }

    // Fund tier by tier at today's prices.
    let remainingCash = cash;
    let stopped = false;
    let dwellingsAsked = 0;
    for (let tierIndex = 0; tierIndex < 3 && !stopped; tierIndex += 1) {
      const target = desiredByTier[tierIndex] as Float64Array;
      let cost = 0;
      for (let goodId = 0; goodId < goodCount; goodId += 1) {
        const quantity = target[goodId] ?? 0;
        if (quantity > 0) cost += quantity * (spot[goodId] ?? 0);
      }
      // Dwellings (tier 6, funded last from cash above the reserve).
      let dwellingDesired = 0;
      if (tierIndex === 2 && dwellingGoodId !== null && units.hasHousing[unit] === 1) {
        // Replacement of today's depreciation plus a share of the gap (plan §4.3).
        const dwellings = units.dwellings[unit] ?? 0;
        dwellingDesired =
          (dwellings * DWELLING_DEPRECIATION_RATE_PER_YEAR) / year +
          Math.max(0, (units.desiredDwellings[unit] ?? 0) - dwellings) / HOUSING_ADJUSTMENT_DAYS;
        if (dwellingDesired > 0) dwellingsAsked = dwellingDesired;
      }
      if (!(cost > 0) && !(dwellingDesired > 0)) continue;
      const spendable = Math.max(0, remainingCash - MONEY_TOLERANCE_RUSD);
      const ratio = cost > 0 ? (spendable >= cost ? 1 : spendable / cost) : 1;
      let fundedCost = 0;
      let dwellingFunded = 0;
      const dwellingPrice = dwellingGoodId === null ? 0 : (spot[dwellingGoodId] ?? 0);
      if (dwellingDesired > 0 && ratio === 1 && dwellingPrice > 0) {
        const room = Math.max(0, spendable - cost - out.reserve);
        dwellingFunded = Math.min(dwellingDesired, room / dwellingPrice);
      }
      for (let goodId = 0; goodId < goodCount; goodId += 1) {
        const quantity = target[goodId] ?? 0;
        const isDwelling = goodId === dwellingGoodId && dwellingDesired > 0;
        if (quantity > 0) {
          const funded = quantity * ratio;
          fundedCost += funded * (spot[goodId] ?? 0);
          push(blockId, marketId, tiers[tierIndex] as HouseholdTier, labels[tierIndex] as NeedTier, goodId, quantity, funded);
        }
        if (isDwelling) {
          fundedCost += dwellingFunded * dwellingPrice;
          push(blockId, marketId, 6, "luxury", goodId, dwellingDesired, dwellingFunded);
        }
      }
      if (fundedCost > remainingCash + Math.max(MONEY_TOLERANCE_RUSD, 1e-12 * Math.abs(remainingCash))) {
        throw new RangeError(`household funding exceeds available cash for popBlock ${String(blockId)}`);
      }
      remainingCash = Math.max(0, remainingCash - fundedCost);
      if (ratio < 1) stopped = true;
    }
    figures.dwellingsDesired[local] = dwellingsAsked;
    figures.rowEnd[local] = sink.count;
  }
}

/** D-162: the units and tables of the day, or the error the former loop met at unit `count`. */
interface LesPreparation {
  readonly units: LesUnits;
  readonly tables: LesTables;
  readonly error: unknown;
  readonly failed: boolean;
}

function prepareLesUnits(
  world: World,
  economyDefinitions: EconomyDefinitions,
  system: ResolvedDemandSystem,
  index: FinanceIndex,
  ownConsumption: OwnConsumptionPlan,
  gate: NeedGate | null,
  totals: BlockTotals | undefined,
  scratch: DayScratch | undefined,
): LesPreparation {
  const goodCount = system.goodCount;
  const owners = buildProvinceOwnerMap(world);
  const countryById = new Map(world.countries.map((country) => [country.id, country]));
  const marketById = new Map(world.markets.map((market) => [market.id, market]));
  const marketOfProvince = new Map(world.provinceEconomies.map((province) => [province.id, province.marketId]));
  const professionById = new Map(economyDefinitions.professions.map((profession) => [profession.id, profession]));
  const householdIds = index.ownerAccountIds("popBlock", "household-cash");
  const blockList = inIdOrder(world.popBlocks);
  const capacity = blockList.length;
  const units = {
    count: 0,
    blockId: scratchF64(scratch, "les.u.blockId", capacity),
    marketId: scratchI32(scratch, "les.u.marketId", capacity),
    marketIndex: scratchI32(scratch, "les.u.marketIndex", capacity),
    persons: scratchF64(scratch, "les.u.persons", capacity),
    adultEquivalents: scratchF64(scratch, "les.u.adultEquivalents", capacity),
    income: scratchF64(scratch, "les.u.income", capacity),
    cash: scratchF64(scratch, "les.u.cash", capacity),
    stratum: scratchU8(scratch, "les.u.stratum", capacity),
    urbanShare: scratchF64(scratch, "les.u.urbanShare", capacity),
    availability: scratchI32(scratch, "les.u.availability", capacity),
    taste: scratchI32(scratch, "les.u.taste", capacity),
    kept: scratchI32(scratch, "les.u.kept", capacity),
    hasHousing: scratchU8(scratch, "les.u.hasHousing", capacity),
    dwellings: scratchF64(scratch, "les.u.dwellings", capacity),
    desiredDwellings: scratchF64(scratch, "les.u.desiredDwellings", capacity),
    ownerId: scratchI32(scratch, "les.u.ownerId", capacity),
  };
  // Market rows of the price tables, in first-use order.
  const marketRow = new Map<Id, number>();
  const marketRows: World["markets"][number][] = [];
  // D-158: what a block can buy depends on its market (prices, stock) and its province's
  // owner (the technology gate) only, so it is derived once per (market, owner).
  const availabilityRow = new Map<Id, Map<number, number>>();
  const availabilityRows: Uint8Array[] = [];
  const tasteRow = new Map<Float64Array, number>();
  const tasteRows: Float64Array[] = [];
  const keptRows: Float64Array[] = [];
  let error: unknown = undefined;
  let failed = false;
  for (let blockIndex = 0; blockIndex < blockList.length; blockIndex += 1) {
    const block = blockList[blockIndex]!;
    try {
      const persons = personsOfBlock(totals, block);
      if (persons <= 0) continue;
      const marketId = marketOfProvince.get(block.provinceId) ?? null;
      if (marketId === null) throw new RangeError(`popBlock ${String(block.id)} is in a province with no market`);
      const market = marketById.get(marketId);
      if (market === undefined) throw new RangeError(`unknown market ${String(marketId)}`);
      if (market.priceSmoothedRUSD.length !== market.priceRUSD.length) {
        throw new RangeError(`market ${String(marketId)} has no smoothed prices`);
      }
      const accountId = block.id >= 0 && block.id < householdIds.length ? (householdIds[block.id] ?? -1) : -1;
      const account = accountId >= 0 ? index.account(accountId) : undefined;
      if (account === undefined) throw new RangeError(`missing household-cash account for popBlock ${String(block.id)}`);
      const profession = professionById.get(block.professionId);
      if (profession === undefined) throw new RangeError(`popBlock ${String(block.id)} has an unknown profession`);
      const ownerId = owners.get(block.provinceId);
      const owner = ownerId === undefined ? undefined : countryById.get(ownerId);
      let row = marketRow.get(marketId);
      if (row === undefined) {
        row = marketRows.length;
        marketRow.set(marketId, row);
        marketRows.push(market);
      }
      const availabilityKey = (ownerId ?? -1) + 1;
      let byOwner = availabilityRow.get(marketId);
      if (byOwner === undefined) {
        byOwner = new Map();
        availabilityRow.set(marketId, byOwner);
      }
      let available = byOwner.get(availabilityKey);
      if (available === undefined) {
        const flags = new Uint8Array(goodCount);
        for (let goodId = 0; goodId < goodCount; goodId += 1) {
          const technology = system.requiredTechnologyId[goodId] ?? -1;
          flags[goodId] =
            (market.priceSmoothedRUSD[goodId] ?? 0) > 0 && (technology < 0 || gate === null || gate(block.provinceId, marketId, technology, goodId))
              ? 1
              : 0;
        }
        available = availabilityRows.length;
        availabilityRows.push(flags);
        byOwner.set(availabilityKey, available);
      }
      const taste = owner === undefined ? null : (system.tasteByCountry.get(owner.tag) ?? null);
      let tasteIndex = -1;
      if (taste !== null) {
        let found = tasteRow.get(taste);
        if (found === undefined) {
          found = tasteRows.length;
          tasteRow.set(taste, found);
          tasteRows.push(taste);
        }
        tasteIndex = found;
      }
      const kept = ownConsumption.byBlock.get(block.id);
      let keptIndex = -1;
      if (kept !== undefined) {
        keptIndex = keptRows.length;
        keptRows.push(kept);
      }
      const unit = units.count;
      const hasHousing = blockHasHousing(block);
      units.blockId[unit] = block.id;
      units.marketId[unit] = marketId;
      units.marketIndex[unit] = row;
      units.persons[unit] = persons;
      units.adultEquivalents[unit] = adultEquivalents(block);
      units.income[unit] = block.incomeSmoothedRUSDPerCapitaDay;
      units.cash[unit] = account.balanceRUSD;
      units.stratum[unit] = STRATUM_INDEX[profession.stratum];
      units.urbanShare[unit] = block.urbanShare;
      units.availability[unit] = available;
      units.taste[unit] = tasteIndex;
      units.kept[unit] = keptIndex;
      units.hasHousing[unit] = hasHousing ? 1 : 0;
      units.dwellings[unit] = block.dwellings;
      units.desiredDwellings[unit] = hasHousing ? desiredDwellings(block, persons) : 0;
      units.ownerId[unit] = owner === undefined ? -1 : owner.id;
      units.count = unit + 1;
    } catch (caught) {
      error = caught;
      failed = true;
      break;
    }
  }
  // Tables: a missing entry reads as the former code's default (price 0, taste 1, kept 0).
  const fill = (rows: readonly ArrayLike<number>[], missing: number): Float64Array => {
    const table = new Float64Array(rows.length * goodCount);
    for (let row = 0; row < rows.length; row += 1) {
      const source = rows[row] as ArrayLike<number>;
      for (let goodId = 0; goodId < goodCount; goodId += 1) {
        const value = goodId < source.length ? source[goodId] : undefined;
        table[row * goodCount + goodId] = value ?? missing;
      }
    }
    return table;
  };
  const availability = new Uint8Array(availabilityRows.length * goodCount);
  for (let row = 0; row < availabilityRows.length; row += 1) availability.set(availabilityRows[row] as Uint8Array, row * goodCount);
  const tables: LesTables = {
    goodCount,
    priceSmoothed: fill(marketRows.map((market) => market.priceSmoothedRUSD), 0),
    priceSpot: fill(marketRows.map((market) => market.priceRUSD), 0),
    availability,
    taste: fill(tasteRows, 1),
    kept: fill(keptRows, 0),
  };
  return { units, tables, error, failed };
}

/** The unit columns of a household-demand job (the per-unit inputs the kernel reads). */
const LES_UNIT_F64 = ["blockId", "persons", "adultEquivalents", "income", "cash", "urbanShare", "dwellings", "desiredDwellings"] as const;
const LES_UNIT_I32 = ["marketId", "marketIndex", "availability", "taste", "kept"] as const;
const LES_UNIT_U8 = ["stratum", "hasHousing"] as const;

interface LesJobParams {
  readonly count: number;
  readonly year: number;
  readonly system: ResolvedDemandSystem;
  readonly goodCount: number;
}

/** D-162: the job of units `[from, to)`: their columns, the day's tables and their kept rows. */
function lesJob(
  prep: LesPreparation,
  system: ResolvedDemandSystem,
  year: number,
  from: number,
  to: number,
  allocator: KernelAllocator,
): KernelJob {
  const count = to - from;
  const goodCount = prep.tables.goodCount;
  const units = prep.units;
  const arrays: KernelArrays = {};
  for (const name of LES_UNIT_F64) {
    const column = allocator.f64(`les.${name}`, count);
    column.set(units[name].subarray(from, to));
    arrays[name] = column;
  }
  for (const name of LES_UNIT_I32) {
    const column = allocator.i32(`les.${name}`, count);
    column.set(units[name].subarray(from, to));
    arrays[name] = column;
  }
  for (const name of LES_UNIT_U8) {
    const column = allocator.u8(`les.${name}`, count);
    column.set(units[name].subarray(from, to));
    arrays[name] = column;
  }
  // The range's kept rows only, renumbered in unit order.
  const keptColumn = arrays.kept as Int32Array;
  let keptCount = 0;
  for (let local = 0; local < count; local += 1) if ((keptColumn[local] ?? -1) >= 0) keptCount += 1;
  const kept = allocator.f64("les.keptTable", keptCount * goodCount);
  let next = 0;
  for (let local = 0; local < count; local += 1) {
    const row = keptColumn[local] ?? -1;
    if (row < 0) continue;
    kept.set(prep.tables.kept.subarray(row * goodCount, (row + 1) * goodCount), next * goodCount);
    keptColumn[local] = next;
    next += 1;
  }
  const priceSmoothed = allocator.f64("les.priceSmoothed", prep.tables.priceSmoothed.length);
  priceSmoothed.set(prep.tables.priceSmoothed);
  const priceSpot = allocator.f64("les.priceSpot", prep.tables.priceSpot.length);
  priceSpot.set(prep.tables.priceSpot);
  const availabilityTable = allocator.u8("les.availabilityTable", prep.tables.availability.length);
  availabilityTable.set(prep.tables.availability);
  const tasteTable = allocator.f64("les.tasteTable", prep.tables.taste.length);
  tasteTable.set(prep.tables.taste);
  arrays.priceSmoothed = priceSmoothed;
  arrays.priceSpot = priceSpot;
  arrays.availabilityTable = availabilityTable;
  arrays.tasteTable = tasteTable;
  arrays.keptTable = kept;
  const params: LesJobParams = { count, year, system, goodCount };
  return { kernel: "household-demand", params, arrays };
}

function lesArray<T extends Float64Array | Int32Array | Uint8Array>(
  arrays: KernelArrays,
  name: string,
  type: KernelArrayType<T>,
  length: number,
): T {
  const array = arrays[name];
  if (!isKernelArrayOf(array, type) || array.length < length) {
    throw new RangeError(`household demand job array ${name} is missing or too short`);
  }
  return array;
}

/**
 * D-162: run a household-demand job (in a worker, or on the sim thread for its own lane): the
 * same per-unit code over the job's columns; rows and figures are handed back in its arrays.
 */
export function runHouseholdDemandKernel(params: unknown, arrays: KernelArrays, allocator?: KernelAllocator): KernelOutput {
  const job = params as LesJobParams;
  const count = job.count;
  if (!Number.isInteger(count) || count < 0) throw new RangeError("household demand job has an invalid unit count");
  const system = job.system;
  const categoryCount = system.categoryKeys.length;
  const units: LesUnits = {
    count,
    blockId: lesArray(arrays, "blockId", Float64Array, count),
    marketId: lesArray(arrays, "marketId", Int32Array, count),
    marketIndex: lesArray(arrays, "marketIndex", Int32Array, count),
    persons: lesArray(arrays, "persons", Float64Array, count),
    adultEquivalents: lesArray(arrays, "adultEquivalents", Float64Array, count),
    income: lesArray(arrays, "income", Float64Array, count),
    cash: lesArray(arrays, "cash", Float64Array, count),
    stratum: lesArray(arrays, "stratum", Uint8Array, count),
    urbanShare: lesArray(arrays, "urbanShare", Float64Array, count),
    availability: lesArray(arrays, "availability", Int32Array, count),
    taste: lesArray(arrays, "taste", Int32Array, count),
    kept: lesArray(arrays, "kept", Int32Array, count),
    hasHousing: lesArray(arrays, "hasHousing", Uint8Array, count),
    dwellings: lesArray(arrays, "dwellings", Float64Array, count),
    desiredDwellings: lesArray(arrays, "desiredDwellings", Float64Array, count),
    ownerId: new Int32Array(0),
  };
  const tables: LesTables = {
    goodCount: job.goodCount,
    priceSmoothed: lesArray(arrays, "priceSmoothed", Float64Array, 0),
    priceSpot: lesArray(arrays, "priceSpot", Float64Array, 0),
    availability: lesArray(arrays, "availabilityTable", Uint8Array, 0),
    taste: lesArray(arrays, "tasteTable", Float64Array, 0),
    kept: lesArray(arrays, "keptTable", Float64Array, 0),
  };
  // Outputs are made where the kernel runs (nothing empty crosses threads).
  const capacity = Math.max(64, count * 24);
  const f64 = (slot: string, length: number): Float64Array => (allocator === undefined ? new Float64Array(length) : allocator.f64(slot, length));
  const i32 = (slot: string, length: number): Int32Array => (allocator === undefined ? new Int32Array(length) : allocator.i32(slot, length));
  const u8 = (slot: string, length: number): Uint8Array => (allocator === undefined ? new Uint8Array(length) : allocator.u8(slot, length));
  const sink: LesRowSink = {
    count: 0,
    block: f64("les.out.block", capacity),
    market: i32("les.out.market", capacity),
    tier: u8("les.out.tier", capacity),
    need: u8("les.out.need", capacity),
    good: i32("les.out.good", capacity),
    desired: f64("les.out.desired", capacity),
    funded: f64("les.out.funded", capacity),
  };
  const figures: LesFigures = {
    rowEnd: i32("les.out.rowEnd", count),
    income: f64("les.out.income", count),
    consumption: f64("les.out.consumption", count),
    committedCost: f64("les.out.committedCost", count),
    categorySpend: f64("les.out.categorySpend", count * categoryCount),
    dwellingsDesired: f64("les.out.dwellings", count),
  };
  runLesRange(system, job.year, tables, units, 0, count, sink, figures);
  // Results are copied between threads, so only what the merge reads: each row's block and
  // market follow from the unit row ends.
  const rows = sink.count;
  return {
    arrays: {
      rowTier: sink.tier.subarray(0, rows),
      rowNeed: sink.need.subarray(0, rows),
      rowGood: sink.good.subarray(0, rows),
      rowDesired: sink.desired.subarray(0, rows),
      rowFunded: sink.funded.subarray(0, rows),
      rowEnd: figures.rowEnd,
      figIncome: figures.income,
      figConsumption: figures.consumption,
      figCommittedCost: figures.committedCost,
      figCategorySpend: figures.categorySpend,
      figDwellings: figures.dwellingsDesired,
    },
    counts: { rows },
  };
}

/** One range's figures for the country summary (unit `u` of the range at `u − from`). */
interface LesFigureSegment {
  readonly from: number;
  readonly to: number;
  readonly figures: LesFigures;
}

/** D-162: the country summaries, by unit in id order (the former loop's order of additions). */
function summariseByCountry(
  system: ResolvedDemandSystem,
  units: LesUnits,
  segments: readonly LesFigureSegment[],
): Map<Id, HouseholdCountryDemand> {
  const byCountry = new Map<Id, HouseholdCountryDemand>();
  const categoryCount = system.categoryKeys.length;
  for (const segment of segments) {
    const figures = segment.figures;
    for (let unit = segment.from; unit < segment.to; unit += 1) {
      const ownerId = units.ownerId[unit] ?? -1;
      if (ownerId < 0) continue;
      const local = unit - segment.from;
      let entry = byCountry.get(ownerId);
      if (entry === undefined) {
        entry = {
          countryId: ownerId,
          persons: 0,
          income: 0,
          consumption: 0,
          committedCost: 0,
          categorySpend: new Float64Array(categoryCount),
          incomeByStratum: new Float64Array(3),
          consumptionByStratum: new Float64Array(3),
          dwellingsDesired: 0,
        };
        byCountry.set(ownerId, entry);
      }
      const income = figures.income[local] ?? 0;
      const consumption = figures.consumption[local] ?? 0;
      entry.persons += units.persons[unit] ?? 0;
      entry.income += income;
      entry.consumption += consumption;
      entry.committedCost += figures.committedCost[local] ?? 0;
      for (let category = 0; category < categoryCount; category += 1) {
        entry.categorySpend[category] =
          (entry.categorySpend[category] ?? 0) + (figures.categorySpend[local * categoryCount + category] ?? 0);
      }
      const stratum = units.stratum[unit] ?? 0;
      entry.incomeByStratum[stratum] = (entry.incomeByStratum[stratum] ?? 0) + income;
      entry.consumptionByStratum[stratum] = (entry.consumptionByStratum[stratum] ?? 0) + consumption;
      const dwellings = figures.dwellingsDesired[local] ?? 0;
      if (dwellings > 0) entry.dwellingsDesired += dwellings;
    }
  }
  return byCountry;
}

/**
 * The day's household demand rows (D-162: a step that may plan its blocks on worker threads;
 * `buildLesHouseholdDemand` runs it inline).
 */
export function* lesHouseholdDemandSteps(
  world: World,
  economyDefinitions: EconomyDefinitions,
  system: ResolvedDemandSystem,
  index: FinanceIndex,
  detail: DayResultDetail,
  ownConsumption: OwnConsumptionPlan,
  gate: NeedGate | null,
  /** D-158: the day's measured block totals (the cells summed when absent). */
  totals?: BlockTotals,
  /**
   * D-161: reusable buffers for the row columns and block ranges, which the day reads only
   * before its next market attempt (the day result carries the record objects, not these).
   */
  scratch?: DayScratch,
): DaySteps<LesHouseholdDemand> {
  const year = daysInYear(dayIndexToCivilDate(world.dayIndex).year);
  const prep = prepareLesUnits(world, economyDefinitions, system, index, ownConsumption, gate, totals, scratch);
  const units = prep.units;
  const categoryCount = system.categoryKeys.length;
  const response = yield {
    kernel: "household-demand",
    units: units.count,
    splittable: !prep.failed,
    job: (from, to, allocator) => lesJob(prep, system, year, from, to, allocator),
  };
  let sink: LesRowSink;
  let segments: LesFigureSegment[];
  if (response === undefined) {
    // D-158: growable typed columns.
    const capacity = Math.max(1024, world.popBlocks.length * 24);
    sink = {
      count: 0,
      block: scratchF64(scratch, "les.block", capacity),
      market: scratchI32(scratch, "les.market", capacity),
      tier: scratchU8(scratch, "les.tier", capacity),
      need: scratchU8(scratch, "les.need", capacity),
      good: scratchI32(scratch, "les.good", capacity),
      desired: scratchF64(scratch, "les.desired", capacity),
      funded: scratchF64(scratch, "les.funded", capacity),
    };
    const figures: LesFigures = {
      rowEnd: scratchI32(scratch, "les.fig.rowEnd", units.count),
      income: scratchF64(scratch, "les.fig.income", units.count),
      consumption: scratchF64(scratch, "les.fig.consumption", units.count),
      committedCost: scratchF64(scratch, "les.fig.committedCost", units.count),
      categorySpend: scratchF64(scratch, "les.fig.categorySpend", units.count * categoryCount),
      dwellingsDesired: scratchF64(scratch, "les.fig.dwellings", units.count),
    };
    runLesRange(system, year, prep.tables, units, 0, units.count, sink, figures);
    // The former loop met this error at the block after the last unit.
    if (prep.failed) throw prep.error;
    segments = [{ from: 0, to: units.count, figures }];
  } else {
    assertResponseCovers(response, units.count);
    let total = 0;
    const rowsOf: number[] = [];
    for (const output of response.outputs) {
      const rows = outputCount(output, "rows");
      rowsOf.push(rows);
      total += rows;
    }
    sink = {
      count: 0,
      block: scratchF64(scratch, "les.block", total),
      market: scratchI32(scratch, "les.market", total),
      tier: scratchU8(scratch, "les.tier", total),
      need: scratchU8(scratch, "les.need", total),
      good: scratchI32(scratch, "les.good", total),
      desired: scratchF64(scratch, "les.desired", total),
      funded: scratchF64(scratch, "les.funded", total),
    };
    segments = [];
    for (let lane = 0; lane < response.ranges.length; lane += 1) {
      const range = response.ranges[lane] as UnitRange;
      const output = response.outputs[lane] as KernelOutput;
      const rows = rowsOf[lane] ?? 0;
      const count = range.to - range.from;
      const at = sink.count;
      sink.tier.set(outputArray(output, "rowTier", Uint8Array, rows).subarray(0, rows), at);
      sink.need.set(outputArray(output, "rowNeed", Uint8Array, rows).subarray(0, rows), at);
      sink.good.set(outputArray(output, "rowGood", Int32Array, rows).subarray(0, rows), at);
      sink.desired.set(outputArray(output, "rowDesired", Float64Array, rows).subarray(0, rows), at);
      sink.funded.set(outputArray(output, "rowFunded", Float64Array, rows).subarray(0, rows), at);
      // Row ends of the range, made global.
      const rowEnd = outputArray(output, "rowEnd", Int32Array, count);
      const globalEnd = new Int32Array(count);
      for (let local = 0; local < count; local += 1) {
        const end = rowEnd[local] ?? 0;
        if (end < 0 || end > rows || (local > 0 && end < (rowEnd[local - 1] ?? 0))) {
          throw new RangeError("household demand job returned an invalid row end");
        }
        globalEnd[local] = at + end;
        // The unit's rows: its block and market.
        const blockId = units.blockId[range.from + local] ?? 0;
        const marketId = units.marketId[range.from + local] ?? 0;
        for (let row = at + (local === 0 ? 0 : (rowEnd[local - 1] ?? 0)); row < at + end; row += 1) {
          sink.block[row] = blockId;
          sink.market[row] = marketId;
        }
      }
      sink.count = at + rows;
      segments.push({
        from: range.from,
        to: range.to,
        figures: {
          rowEnd: globalEnd,
          income: outputArray(output, "figIncome", Float64Array, count),
          consumption: outputArray(output, "figConsumption", Float64Array, count),
          committedCost: outputArray(output, "figCommittedCost", Float64Array, count),
          categorySpend: outputArray(output, "figCategorySpend", Float64Array, count * categoryCount),
          dwellingsDesired: outputArray(output, "figDwellings", Float64Array, count),
        },
      });
    }
  }
  const count = sink.count;
  let maxBlockId = 0;
  for (let blockIndex = 0; blockIndex < world.popBlocks.length; blockIndex += 1) {
    const block = world.popBlocks[blockIndex]!;
    if (block.id > maxBlockId) maxBlockId = block.id;
  }
  const rowStart = scratchI32(scratch, "les.rowStart", maxBlockId + 1, -1);
  const rowEnd = scratchI32(scratch, "les.rowEnd", maxBlockId + 1, -1);
  // Each unit's rows start where the previous unit's end (row ends are global here).
  let previousEnd = 0;
  for (const segment of segments) {
    for (let unit = segment.from; unit < segment.to; unit += 1) {
      const end = segment.figures.rowEnd[unit - segment.from] ?? 0;
      if (end > previousEnd) {
        const blockId = units.blockId[unit] ?? 0;
        rowStart[blockId] = previousEnd;
        rowEnd[blockId] = end;
      }
      previousEnd = end;
    }
  }
  const records: HouseholdDemandRecord[] = [];
  if (detail === "full") {
    for (let row = 0; row < count; row += 1) {
      records.push({
        popBlockId: sink.block[row] ?? 0,
        tier: (sink.tier[row] ?? 1) as HouseholdTier,
        goodId: sink.good[row] ?? 0,
        desiredQuantity: sink.desired[row] ?? 0,
        fundedQuantity: sink.funded[row] ?? 0,
      });
    }
  }
  return {
    count,
    popBlockId: sink.block.subarray(0, count),
    marketId: sink.market.subarray(0, count),
    tier: sink.tier.subarray(0, count),
    needTierCode: sink.need.subarray(0, count),
    goodId: sink.good.subarray(0, count),
    desired: sink.desired.subarray(0, count),
    funded: sink.funded.subarray(0, count),
    rowStart,
    rowEnd,
    records,
    categoryKeys: system.categoryKeys,
    byCountry: summariseByCountry(system, units, segments),
  };
}

export function buildLesHouseholdDemand(
  world: World,
  economyDefinitions: EconomyDefinitions,
  system: ResolvedDemandSystem,
  index: FinanceIndex,
  detail: DayResultDetail,
  ownConsumption: OwnConsumptionPlan,
  gate: NeedGate | null,
  /** D-158: the day's measured block totals (the cells summed when absent). */
  totals?: BlockTotals,
  /** D-161: reusable buffers (see `lesHouseholdDemandSteps`). */
  scratch?: DayScratch,
): LesHouseholdDemand {
  return runStepsInline(
    lesHouseholdDemandSteps(world, economyDefinitions, system, index, detail, ownConsumption, gate, totals, scratch),
  );
}

/**
 * After the market (plan §4.3): fulfilled dwelling purchases join the buyers' stock.
 * Returns the dwellings added.
 */
export function applyDwellingPurchases(
  world: World,
  system: ResolvedDemandSystem,
  household: LesHouseholdDemand,
  fulfilledByRecord: ArrayLike<number>,
): number {
  if (system.dwellingGoodId === null) return 0;
  const blockById = new Map(world.popBlocks.map((block) => [block.id, block]));
  let added = 0;
  for (let row = 0; row < household.count; row += 1) {
    if (household.goodId[row] !== system.dwellingGoodId) continue;
    const fulfilled = fulfilledByRecord[row] ?? 0;
    if (Number.isNaN(fulfilled)) throw new RangeError("missing market result for a dwelling purchase");
    if (!(fulfilled > 0)) continue;
    const block = blockById.get(household.popBlockId[row] ?? -1);
    if (block === undefined) throw new RangeError("dwelling purchase by an unknown block");
    block.dwellings += fulfilled;
    added += fulfilled;
  }
  return added;
}
