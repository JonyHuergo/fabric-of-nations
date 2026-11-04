/**
 * M3e deterministic monetary settlement.
 *
 * Sequence:
 * 1. Validate the M3d result, accounts, pending transactions, and employment.
 * 2. Settle all household and production-input market transactions as one
 *    atomic batch. Same-batch sales receipts may fund a building's purchases;
 *    every buyer must end non-negative.
 * 3. Pay daily wage obligations from each building operating account, after
 *    market settlement. If an employer is short, pay pro-rata and record the
 *    shortfall; no debt or negative balance is created.
 * 4. Pay daily upkeep from each operational building operating account to the
 *    single system-reserve account, after wages. Shortfalls are reported, not
 *    financed.
 * 5. Compute cash-basis producer revenue, input costs, wages paid, upkeep paid,
 *    and retained profit. No dividends, taxes, interest, or credit are created.
 *
 * All balances are authoritative `World.finance` accounts. The settlement
 * result is transient. `MarketDayResult.settled` is a non-persistent duplicate
 * guard for the same result object.
 */

import {
  assertValidDayIndex,
  dayIndexToCivilDate,
  daysInYear,
  isTerminalDayIndex,
} from "../calendar.js";
import { MONEY_TOLERANCE_RUSD } from "../population/constants.js";
import { drawUint32 } from "../rng.js";
import type { DayIndex, Id, Seed } from "../types.js";
import { assertValidWorldForTick, type PhaseValidationOptions, type World } from "../world.js";
import {
  postJournalBatch,
  postJournalColumns,
  retainDeferredPostings,
  type DeferredPostings,
  type JournalColumnEntry,
  type JournalEntryInput,
  type JournalLineColumns,
} from "./accounting.js";
import {
  buildFinanceIndex,
  designatedCashTotal,
  findAccountsBySubtype,
  type FinanceIndex,
} from "./accounts.js";
import { assertValidEconomyDefinitions } from "./definitions.js";
import { assertValidEmploymentState } from "./employment.js";
import {
  laborHoursFactor,
  laborMinimumWageRUSDPerYear,
  qualificationWageFactor,
} from "./labor.js";
import type {
  MarketDayResult,
  MarketTier,
  PendingColumns,
  PendingTransaction,
} from "./market.js";
import type {
  BuildingInstance,
  EconomyDefinitions,
  EmploymentAssignment,
  FinancialAccount,
  JournalLine,
  JournalPosting,
  ProfessionDef,
} from "./types.js";
import { buildProvinceOwnerMap } from "./country.js";
import { inIdOrder } from "../ordering.js";

export const M3E_WAGE_RESIDUAL_PURPOSE = "settlement.wage-residual";

export interface SettledMarketTransaction {
  readonly kind: "household-purchase" | "input-purchase";
  readonly buyerPopBlockId: number | null;
  readonly buyerBuildingId: number | null;
  readonly sellerBuildingId: number;
  readonly goodId: number;
  readonly quantity: number;
  readonly unitPriceRUSD: number;
  readonly totalRUSD: number;
  readonly tier: MarketTier;
  readonly phase: "A" | "B";
  readonly buyerAccountId: Id;
  readonly sellerAccountId: Id;
}

export interface WagePayment {
  readonly popBlockId: Id;
  readonly professionId: Id;
  readonly workers: number;
  readonly accountId: Id;
  readonly obligationRUSD: number;
  readonly paidRUSD: number;
  readonly unpaidRUSD: number;
}

export interface WageSettlement {
  readonly buildingId: Id;
  readonly operatingAccountId: Id;
  readonly obligationRUSD: number;
  readonly paidRUSD: number;
  readonly unpaidRUSD: number;
  readonly payments: readonly WagePayment[];
}

export interface UpkeepSettlement {
  readonly buildingId: Id;
  readonly operatingAccountId: Id;
  readonly systemAccountId: Id;
  readonly obligationRUSD: number;
  readonly paidRUSD: number;
  readonly unpaidRUSD: number;
}

export interface ProducerSettlement {
  readonly buildingId: Id;
  readonly ownerAccountId: Id;
  readonly operatingAccountId: Id;
  readonly initialCashRUSD: number;
  readonly revenueRUSD: number;
  readonly inputCostsRUSD: number;
  readonly wagesPaidRUSD: number;
  readonly wageObligationRUSD: number;
  readonly unpaidWagesRUSD: number;
  readonly upkeepPaidRUSD: number;
  readonly upkeepObligationRUSD: number;
  readonly unpaidUpkeepRUSD: number;
  readonly profitRUSD: number;
  /** Building cash after market/wages/upkeep settlement (fiscal does not touch it). */
  readonly endingCashAfterSettlementRUSD: number;
}

export interface HouseholdSettlement {
  readonly popBlockId: Id;
  readonly financialAccountId: Id;
  readonly initialCashRUSD: number;
  readonly marketPurchasesRUSD: number;
  readonly wagesReceivedRUSD: number;
  /** Household cash after market/wages/upkeep settlement, before the fiscal phase. */
  readonly endingCashAfterSettlementRUSD: number;
}

export interface SettlementTotals {
  readonly marketPurchasesRUSD: number;
  readonly householdPurchasesRUSD: number;
  readonly inputPurchasesRUSD: number;
  readonly wageObligationRUSD: number;
  readonly wagesPaidRUSD: number;
  readonly unpaidWagesRUSD: number;
  readonly upkeepObligationRUSD: number;
  readonly upkeepPaidRUSD: number;
  readonly unpaidUpkeepRUSD: number;
  readonly producerRevenueRUSD: number;
  readonly producerInputCostsRUSD: number;
  readonly producerWagesRUSD: number;
  readonly producerProfitRUSD: number;
  readonly initialCashRUSD: number;
  /** Aggregate cash after settlement; income tax and welfare are applied later. */
  readonly endingCashAfterSettlementRUSD: number;
}

export interface MarketSettlementResult {
  readonly dayIndex: DayIndex;
  readonly marketId: Id;
  /** Every market cleared by this settlement, in ascending id order. */
  readonly marketIds: readonly Id[];
  /**
   * Execution-context identity copied from the settled world. The fiscal phase
   * rejects a result that belongs to another seed, scenario, or start day.
   */
  readonly worldSeed: Seed;
  readonly scenarioId: string;
  readonly startDayIndex: DayIndex;
  /**
   * Posting-id boundary immediately after settlement. The fiscal phase rejects a
   * result if intervening postings changed the boundary, detecting a stale
   * settlement context without an extra full-state hash.
   */
  readonly settlementNextPostingId: number;
  /**
   * Transient single-use marker for the M4c fiscal phase. It is not persisted
   * and is set only after the staged fiscal state has been published.
   */
  fiscalApplied: boolean;
  readonly transactions: readonly SettledMarketTransaction[];
  readonly wages: readonly WageSettlement[];
  readonly upkeep: readonly UpkeepSettlement[];
  readonly producers: readonly ProducerSettlement[];
  readonly households: readonly HouseholdSettlement[];
  readonly totals: SettlementTotals;
  readonly postingIds: readonly number[];
}

interface WageGroup {
  readonly popBlockId: Id;
  readonly professionId: Id;
  readonly workers: number;
  readonly accountId: Id;
  readonly obligationRUSD: number;
}

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

function householdCash(index: FinanceIndex, popBlockId: Id): FinancialAccount {
  const account = index.find("popBlock", popBlockId, "household-cash");
  if (account === undefined) {
    throw new RangeError(`popBlock ${String(popBlockId)} has no valid household account`);
  }
  return account;
}

function operatingCash(index: FinanceIndex, buildingId: Id): FinancialAccount {
  const account = index.find("building", buildingId, "operating-cash");
  if (account === undefined) {
    throw new RangeError(`building ${String(buildingId)} has no valid operating account`);
  }
  return account;
}

function assertTransactionAmount(quantity: number, unitPriceRUSD: number, totalRUSD: number, index: number): void {
  // Same checks, order and messages as before; the path is built only on failure.
  const fail = (name: string): never => {
    throw new RangeError(`pendingTransactions[${String(index)}].${name} must be finite and strictly positive`);
  };
  if (!Number.isFinite(quantity) || !(quantity > 0)) fail("quantity");
  if (!Number.isFinite(unitPriceRUSD) || !(unitPriceRUSD > 0)) fail("unitPriceRUSD");
  if (!Number.isFinite(totalRUSD) || !(totalRUSD > 0)) fail("totalRUSD");
  const expected = quantity * unitPriceRUSD;
  if (Math.abs(expected - totalRUSD) > toleranceMoney(expected, totalRUSD)) {
    throw new RangeError(
      `pendingTransactions[${String(index)}].totalRUSD does not reconcile with quantity × unit price`,
    );
  }
}

function transactionKey(transaction: SettledMarketTransaction): string {
  const buyer =
    transaction.kind === "household-purchase"
      ? `household:${String(transaction.buyerPopBlockId)}`
      : `building:${String(transaction.buyerBuildingId)}`;
  return `${transaction.kind}:${buyer}:${String(transaction.sellerBuildingId)}:${String(transaction.goodId)}:${String(transaction.tier)}:${transaction.phase}`;
}

const MARKET_TRANSACTION_TIERS: ReadonlySet<number> = new Set([1, 2, 3, 5, 6]);

/**
 * Validated market transactions in columns (D-139). Position `i` is the `i`-th
 * transaction of the concatenated market days; `order` lists positions in the
 * canonical `transactionKey` order. The columns replace one prepared object per
 * transaction (about 40,000 a day in the 1900 world) and the object sort.
 */
interface PreparedColumns {
  readonly count: number;
  /** 0 = household-purchase, 1 = input-purchase. */
  readonly kind: Uint8Array;
  readonly buyer: Float64Array;
  readonly seller: Float64Array;
  readonly good: Float64Array;
  readonly tier: Float64Array;
  /** 0 = A, 1 = B. */
  readonly phase: Int32Array;
  readonly quantity: Float64Array;
  readonly unitPrice: Float64Array;
  readonly total: Float64Array;
  readonly buyerCash: Float64Array;
  readonly buyerExpense: Float64Array;
  readonly sellerCash: Float64Array;
  readonly sellerRevenue: Float64Array;
  readonly order: Int32Array;
}

/**
 * One market day's transactions: its columns when they describe its
 * `pendingTransactions` array exactly (D-139), otherwise its objects.
 */
type TransactionChunk =
  | { readonly objects: readonly PendingTransaction[]; readonly columns?: undefined }
  | { readonly columns: PendingColumns; readonly objects?: undefined };

function transactionChunk(marketDay: MarketDayResult): TransactionChunk {
  const columns = marketDay.columns?.transactions;
  return columns !== undefined && columns.forTransactions === marketDay.pendingTransactions
    ? { columns }
    : { objects: marketDay.pendingTransactions };
}

/** Account id from an owner table, or -1 (non-integer or out-of-range owners have none). */
function tableAccount(table: Int32Array, ownerId: number): number {
  return Number.isInteger(ownerId) && ownerId >= 0 && ownerId < table.length ? (table[ownerId] ?? -1) : -1;
}

/**
 * Sort key of `${value}:` compared as text, for 0 <= value < 10^7: the decimal digits
 * then the ':' terminator (above every digit), in base 11 over eight places.
 */
function decimalTextKey(value: number): number {
  let digits = 1;
  let bound = 10;
  while (value >= bound) {
    digits += 1;
    bound *= 10;
  }
  let key = 0;
  let divisor = bound / 10;
  for (let place = 0; place < 8; place += 1) {
    let symbol = 0;
    if (place < digits) {
      symbol = Math.floor(value / divisor) % 10;
      divisor /= 10;
    } else if (place === digits) {
      symbol = 10;
    }
    key = key * 11 + symbol;
  }
  return key;
}

/**
 * Rank of each value as its decimal text compares inside a `transactionKey`, where
 * every field is followed by `:` (D-137). No field contains `:`, so comparing two keys
 * equals comparing their fields in order as `text + ":"`. Values are validated
 * non-negative integers (D-139: typed rank tables instead of string maps).
 */
function decimalRanks(
  values: Float64Array,
  count: number,
): { readonly rank: (value: number) => number; readonly size: number } {
  // Distinct values in first-seen order; a stamp table when the values are small
  // non-negative integers (always, for validated ids), else a set (D-139).
  const distinct: number[] = [];
  let maxValue = 0;
  let integral = true;
  for (let index = 0; index < count; index += 1) {
    const value = values[index] ?? 0;
    if (!(Number.isInteger(value) && value >= 0)) integral = false;
    else if (value > maxValue) maxValue = value;
  }
  if (integral && maxValue <= count * 8 + 4096) {
    const seenTable = new Uint8Array(maxValue + 1);
    for (let index = 0; index < count; index += 1) {
      const value = values[index] ?? 0;
      if (seenTable[value] === 0) {
        seenTable[value] = 1;
        distinct.push(value);
      }
    }
  } else {
    const seen = new Set<number>();
    for (let index = 0; index < count; index += 1) {
      const value = values[index] ?? 0;
      if (!seen.has(value)) {
        seen.add(value);
        distinct.push(value);
      }
    }
  }
  if (distinct.every((value) => value < 10_000_000)) {
    const keys = new Float64Array(distinct.length);
    for (let index = 0; index < distinct.length; index += 1) {
      const value = distinct[index] ?? 0;
      keys[index] = decimalTextKey(value) * 2 ** 24 + value;
    }
    keys.sort();
    for (let index = 0; index < keys.length; index += 1) distinct[index] = (keys[index] ?? 0) % 2 ** 24;
  } else {
    const texts = new Map(distinct.map((value) => [value, `${String(value)}:`] as const));
    distinct.sort((left, right) => {
      const a = texts.get(left) ?? "";
      const b = texts.get(right) ?? "";
      return a < b ? -1 : a > b ? 1 : 0;
    });
  }
  let max = 0;
  for (const value of distinct) if (value > max) max = value;
  if (max <= distinct.length * 8 + 4096) {
    const table = new Int32Array(max + 1);
    for (let rank = 0; rank < distinct.length; rank += 1) table[distinct[rank] ?? 0] = rank;
    return { rank: (value) => table[value] ?? 0, size: distinct.length };
  }
  const map = new Map(distinct.map((value, rank) => [value, rank] as const));
  return { rank: (value) => map.get(value) ?? 0, size: distinct.length };
}

/** One stable counting-sort pass of `order` by a per-position key in 0..range-1. */
function countingSortPass(order: Int32Array, scratch: Int32Array, key: Int32Array, range: number): void {
  const counts = new Int32Array(range + 1);
  for (let index = 0; index < order.length; index += 1) {
    const slot = (key[order[index] ?? 0] ?? 0) + 1;
    counts[slot] = (counts[slot] ?? 0) + 1;
  }
  for (let slot = 1; slot <= range; slot += 1) counts[slot] = (counts[slot] ?? 0) + (counts[slot - 1] ?? 0);
  for (let index = 0; index < order.length; index += 1) {
    const position = order[index] ?? 0;
    const slot = key[position] ?? 0;
    const target = counts[slot] ?? 0;
    scratch[target] = position;
    counts[slot] = target + 1;
  }
  order.set(scratch);
}

/**
 * Validate the market days' transactions and resolve their accounts (same checks,
 * order and messages as the former per-object preparation, for objects and columns
 * alike), then order them canonically: kind, buyer, seller, good, tier and phase, each
 * compared as decimal text (D-137), by a stable LSD radix sort over field ranks
 * (D-139). Duplicates are rejected.
 */
function prepareTransactions(
  world: World,
  definitions: EconomyDefinitions,
  index: FinanceIndex,
  chunks: readonly TransactionChunk[],
): PreparedColumns {
  let count = 0;
  for (const chunk of chunks) count += chunk.columns !== undefined ? chunk.columns.kind.length : chunk.objects.length;
  let maxGood = -1;
  for (const good of definitions.goods) if (good.id > maxGood) maxGood = good.id;
  const goodKnown = new Uint8Array(Math.max(0, maxGood + 1));
  for (const good of definitions.goods) if (Number.isInteger(good.id) && good.id >= 0) goodKnown[good.id] = 1;
  let maxBuilding = -1;
  for (const building of world.buildings) if (building.id > maxBuilding) maxBuilding = building.id;
  // 1 = exists, 2 = exists and operational (the first building of an id, as a map built in array order).
  const buildingState = new Uint8Array(Math.max(0, maxBuilding + 1));
  for (const building of world.buildings) {
    if (Number.isInteger(building.id) && building.id >= 0 && buildingState[building.id] === 0) {
      buildingState[building.id] = building.operational ? 2 : 1;
    }
  }
  const stateOf = (id: number): number =>
    Number.isInteger(id) && id >= 0 && id < buildingState.length ? (buildingState[id] ?? 0) : 0;
  const operatingIds = index.ownerAccountIds("building", "operating-cash");
  const revenueIds = index.ownerAccountIds("building", "sales-revenue");
  const inputExpenseIds = index.ownerAccountIds("building", "input-expense");
  const householdIds = index.ownerAccountIds("popBlock", "household-cash");
  const consumptionIds = index.ownerAccountIds("popBlock", "consumption-expense");

  const prepared: PreparedColumns = {
    count,
    kind: new Uint8Array(count),
    buyer: new Float64Array(count),
    seller: new Float64Array(count),
    good: new Float64Array(count),
    tier: new Float64Array(count),
    phase: new Int32Array(count),
    quantity: new Float64Array(count),
    unitPrice: new Float64Array(count),
    total: new Float64Array(count),
    buyerCash: new Float64Array(count),
    buyerExpense: new Float64Array(count),
    sellerCash: new Float64Array(count),
    sellerRevenue: new Float64Array(count),
    order: new Int32Array(count),
  };
  // Validates one transaction from its field values and records it at `position`,
  // its index in the concatenated object list.
  const recordRow = (
    position: number,
    transactionKind: string,
    buyerPopBlockId: number | null,
    buyerBuildingId: number | null,
    sellerId: number,
    goodId: number,
    quantity: number,
    unitPriceRUSD: number,
    totalRUSD: number,
    tierValue: number,
    phaseValue: string,
  ): void => {
    assertTransactionAmount(quantity, unitPriceRUSD, totalRUSD, position);
    if (!(Number.isInteger(goodId) && goodId >= 0 && goodId < goodKnown.length && goodKnown[goodId] === 1)) {
      throw new RangeError(`pendingTransactions[${String(position)}].goodId is unknown`);
    }
    if (stateOf(sellerId) === 0) {
      throw new RangeError(`pendingTransactions[${String(position)}].sellerBuildingId is unknown`);
    }
    const sellerCashId = tableAccount(operatingIds, sellerId);
    if (sellerCashId < 0) {
      throw new RangeError(`building ${String(sellerId)} has no valid operating account`);
    }
    const sellerRevenueId = tableAccount(revenueIds, sellerId);
    if (sellerRevenueId < 0) {
      throw new RangeError(`missing sales-revenue account for building ${String(sellerId)}`);
    }
    let buyerId: number;
    let buyerCashId: number;
    let buyerExpenseId: number;
    if (transactionKind === "household-purchase") {
      if (buyerPopBlockId === null || buyerBuildingId !== null) {
        throw new RangeError(`pendingTransactions[${String(position)}] must identify exactly one household buyer`);
      }
      buyerId = buyerPopBlockId;
      buyerCashId = tableAccount(householdIds, buyerId);
      if (buyerCashId < 0) {
        throw new RangeError(`popBlock ${String(buyerId)} has no valid household account`);
      }
      buyerExpenseId = tableAccount(consumptionIds, buyerId);
      if (buyerExpenseId < 0) {
        throw new RangeError(`missing consumption-expense account for popBlock ${String(buyerId)}`);
      }
      prepared.kind[position] = 0;
    } else if (transactionKind === "input-purchase") {
      if (buyerBuildingId === null || buyerPopBlockId !== null) {
        throw new RangeError(`pendingTransactions[${String(position)}] must identify exactly one building buyer`);
      }
      buyerId = buyerBuildingId;
      if (stateOf(buyerId) !== 2) {
        throw new RangeError(
          `pendingTransactions[${String(position)}].buyerBuildingId must reference an operational building`,
        );
      }
      buyerCashId = tableAccount(operatingIds, buyerId);
      if (buyerCashId < 0) {
        throw new RangeError(`building ${String(buyerId)} has no valid operating account`);
      }
      buyerExpenseId = tableAccount(inputExpenseIds, buyerId);
      if (buyerExpenseId < 0) {
        throw new RangeError(`missing input-expense account for building ${String(buyerId)}`);
      }
      prepared.kind[position] = 1;
    } else {
      throw new RangeError(`pendingTransactions[${String(position)}].kind is invalid`);
    }
    if (!MARKET_TRANSACTION_TIERS.has(tierValue)) {
      throw new RangeError(`pendingTransactions[${String(position)}].tier is invalid`);
    }
    if (phaseValue !== "A" && phaseValue !== "B") {
      throw new RangeError(`pendingTransactions[${String(position)}].phase must be A or B`);
    }
    prepared.buyer[position] = buyerId;
    prepared.seller[position] = sellerId;
    prepared.good[position] = goodId;
    prepared.tier[position] = tierValue;
    prepared.phase[position] = phaseValue === "A" ? 0 : 1;
    prepared.quantity[position] = quantity;
    prepared.unitPrice[position] = unitPriceRUSD;
    prepared.total[position] = totalRUSD;
    prepared.buyerCash[position] = buyerCashId;
    prepared.buyerExpense[position] = buyerExpenseId;
    prepared.sellerCash[position] = sellerCashId;
    prepared.sellerRevenue[position] = sellerRevenueId;
  };
  let position = 0;
  for (const chunk of chunks) {
    if (chunk.columns !== undefined) {
      // D-139: market-day columns, checked inline with `recordRow`'s checks, order and
      // messages (their kind and phase are codes, so those two checks cannot fail).
      const columns = chunk.columns;
      for (let row = 0; row < columns.kind.length; row += 1) {
        const quantity = columns.quantity[row] ?? Number.NaN;
        const unitPriceRUSD = columns.unitPrice[row] ?? Number.NaN;
        const totalRUSD = columns.total[row] ?? Number.NaN;
        assertTransactionAmount(quantity, unitPriceRUSD, totalRUSD, position);
        const goodId = columns.good[row] ?? Number.NaN;
        if (!(Number.isInteger(goodId) && goodId >= 0 && goodId < goodKnown.length && goodKnown[goodId] === 1)) {
          throw new RangeError(`pendingTransactions[${String(position)}].goodId is unknown`);
        }
        const sellerId = columns.seller[row] ?? Number.NaN;
        if (stateOf(sellerId) === 0) {
          throw new RangeError(`pendingTransactions[${String(position)}].sellerBuildingId is unknown`);
        }
        const sellerCashId = tableAccount(operatingIds, sellerId);
        if (sellerCashId < 0) throw new RangeError(`building ${String(sellerId)} has no valid operating account`);
        const sellerRevenueId = tableAccount(revenueIds, sellerId);
        if (sellerRevenueId < 0) {
          throw new RangeError(`missing sales-revenue account for building ${String(sellerId)}`);
        }
        const buyerId = columns.buyer[row] ?? Number.NaN;
        const kindCode = columns.kind[row] ?? -1;
        let buyerCashId: number;
        let buyerExpenseId: number;
        if (kindCode === 0) {
          buyerCashId = tableAccount(householdIds, buyerId);
          if (buyerCashId < 0) throw new RangeError(`popBlock ${String(buyerId)} has no valid household account`);
          buyerExpenseId = tableAccount(consumptionIds, buyerId);
          if (buyerExpenseId < 0) {
            throw new RangeError(`missing consumption-expense account for popBlock ${String(buyerId)}`);
          }
        } else if (kindCode === 1) {
          if (stateOf(buyerId) !== 2) {
            throw new RangeError(
              `pendingTransactions[${String(position)}].buyerBuildingId must reference an operational building`,
            );
          }
          buyerCashId = tableAccount(operatingIds, buyerId);
          if (buyerCashId < 0) throw new RangeError(`building ${String(buyerId)} has no valid operating account`);
          buyerExpenseId = tableAccount(inputExpenseIds, buyerId);
          if (buyerExpenseId < 0) {
            throw new RangeError(`missing input-expense account for building ${String(buyerId)}`);
          }
        } else {
          throw new RangeError(`pendingTransactions[${String(position)}].kind is invalid`);
        }
        const tierValue = columns.tier[row] ?? 0;
        if (!MARKET_TRANSACTION_TIERS.has(tierValue)) {
          throw new RangeError(`pendingTransactions[${String(position)}].tier is invalid`);
        }
        const phaseCode = columns.phase[row] ?? -1;
        if (phaseCode !== 0 && phaseCode !== 1) {
          throw new RangeError(`pendingTransactions[${String(position)}].phase must be A or B`);
        }
        prepared.kind[position] = kindCode;
        prepared.buyer[position] = buyerId;
        prepared.seller[position] = sellerId;
        prepared.good[position] = goodId;
        prepared.tier[position] = tierValue;
        prepared.phase[position] = phaseCode;
        prepared.quantity[position] = quantity;
        prepared.unitPrice[position] = unitPriceRUSD;
        prepared.total[position] = totalRUSD;
        prepared.buyerCash[position] = buyerCashId;
        prepared.buyerExpense[position] = buyerExpenseId;
        prepared.sellerCash[position] = sellerCashId;
        prepared.sellerRevenue[position] = sellerRevenueId;
        position += 1;
      }
    } else {
      for (let row = 0; row < chunk.objects.length; row += 1) {
        const transaction = chunk.objects[row];
        if (transaction === undefined) throw new RangeError(`pending transaction ${String(position)} is missing`);
        recordRow(
          position,
          transaction.kind,
          transaction.buyerPopBlockId,
          transaction.buyerBuildingId,
          transaction.sellerBuildingId,
          transaction.goodId,
          transaction.quantity,
          transaction.unitPriceRUSD,
          transaction.totalRUSD,
          transaction.tier,
          transaction.phase,
        );
        position += 1;
      }
    }
  }

  // Canonical order by an LSD radix sort, least significant field first.
  const order = prepared.order;
  for (let item = 0; item < count; item += 1) order[item] = item;
  const scratch = new Int32Array(count);
  const fieldKeys: { readonly key: Int32Array; readonly range: number }[] = [{ key: prepared.phase, range: 2 }];
  for (const values of [prepared.tier, prepared.good, prepared.seller, prepared.buyer]) {
    const ranks = decimalRanks(values, count);
    const key = new Int32Array(count);
    for (let item = 0; item < count; item += 1) key[item] = ranks.rank(values[item] ?? 0);
    fieldKeys.push({ key, range: ranks.size });
  }
  fieldKeys.push({ key: Int32Array.from(prepared.kind), range: 2 });
  if (count > 1) {
    for (const field of fieldKeys) countingSortPass(order, scratch, field.key, field.range);
  }
  for (let item = 1; item < count; item += 1) {
    const previous = order[item - 1] ?? 0;
    const current = order[item] ?? 0;
    let same = true;
    for (let field = 0; field < fieldKeys.length && same; field += 1) {
      const key = (fieldKeys[field] as { readonly key: Int32Array }).key;
      same = key[previous] === key[current];
    }
    if (same) {
      throw new RangeError(`duplicate pending transaction ${transactionKey(settledRow(prepared, current))}`);
    }
  }
  return prepared;
}

/** One prepared transaction as a settled-transaction object. */
function settledRow(prepared: PreparedColumns, position: number): SettledMarketTransaction {
  const household = prepared.kind[position] === 0;
  const buyerId = prepared.buyer[position] ?? 0;
  return {
    kind: household ? "household-purchase" : "input-purchase",
    buyerPopBlockId: household ? buyerId : null,
    buyerBuildingId: household ? null : buyerId,
    sellerBuildingId: prepared.seller[position] ?? 0,
    goodId: prepared.good[position] ?? 0,
    quantity: prepared.quantity[position] ?? 0,
    unitPriceRUSD: prepared.unitPrice[position] ?? 0,
    totalRUSD: prepared.total[position] ?? 0,
    tier: (prepared.tier[position] ?? 1) as MarketTier,
    phase: prepared.phase[position] === 0 ? "A" : "B",
    buyerAccountId: prepared.buyerCash[position] ?? 0,
    sellerAccountId: prepared.sellerCash[position] ?? 0,
  };
}

/** The settled transactions in canonical order, for full result detail. */
function settledTransactions(prepared: PreparedColumns): SettledMarketTransaction[] {
  const settled: SettledMarketTransaction[] = [];
  for (let item = 0; item < prepared.count; item += 1) settled.push(settledRow(prepared, prepared.order[item] ?? 0));
  return settled;
}

/**
 * D-125 aggregated market postings: one balanced entry per (transaction kind, good)
 * instead of one per buyer × seller lot × tier × phase.
 *
 * Each buyer account gets one debit-expense/credit-cash pair and each seller account
 * one debit-cash/credit-revenue pair, with amounts summed over the prepared
 * transactions in their canonical key order. Pairs keep debits and credits summing
 * the same sequence of amounts, so every entry balances exactly. Quantities,
 * allocations and each account's net cash change are those of the individual
 * transactions; only the posting count and floating summation order differ.
 *
 * D-139: built from the columns. A buyer's transactions are contiguous in canonical
 * order (buyer is the second key), so per-good sums need only a per-good scratch;
 * sellers use a slot map. Each sum adds the same amounts in the same order as the
 * former per-group maps, and lines follow ascending account id as before.
 */
function aggregatedMarketEntries(
  prepared: PreparedColumns,
  goodCount: number,
): { readonly entries: JournalColumnEntry[]; readonly lines: JournalLineColumns } {
  const { count, order, kind, good, total } = prepared;
  const groupCount = 2 * goodCount;
  interface GroupLists {
    readonly buyerAccount: number[];
    readonly buyerExpense: number[];
    readonly buyerAmount: number[];
    readonly sellerAccount: number[];
    readonly sellerRevenue: number[];
    readonly sellerAmount: number[];
  }
  const groups: (GroupLists | undefined)[] = new Array<GroupLists | undefined>(groupCount);
  const listOf = (group: number): GroupLists => {
    let lists = groups[group];
    if (lists === undefined) {
      lists = {
        buyerAccount: [],
        buyerExpense: [],
        buyerAmount: [],
        sellerAccount: [],
        sellerRevenue: [],
        sellerAmount: [],
      };
      groups[group] = lists;
    }
    return lists;
  };
  // Buyer runs: per good, the first amount is taken as is and later amounts added,
  // exactly as the per-group buyer map did.
  const runAmount = new Float64Array(goodCount);
  const runTouched = new Int32Array(goodCount);
  const runSeen = new Uint8Array(goodCount);
  let runLength = 0;
  let runKind = -1;
  let runBuyer = -1;
  let runCash = -1;
  let runExpense = -1;
  const flushRun = (): void => {
    for (let item = 0; item < runLength; item += 1) {
      const goodId = runTouched[item] ?? 0;
      const lists = listOf(runKind * goodCount + goodId);
      lists.buyerAccount.push(runCash);
      lists.buyerExpense.push(runExpense);
      lists.buyerAmount.push(runAmount[goodId] ?? 0);
      runSeen[goodId] = 0;
    }
    runLength = 0;
  };
  // Seller slot per (group, seller building): a seller building has one cash account.
  let maxSeller = 0;
  for (let index = 0; index < count; index += 1) {
    const sellerId = prepared.seller[index] ?? 0;
    if (sellerId > maxSeller) maxSeller = sellerId;
  }
  const sellerStride = maxSeller + 1;
  const sellerSlot =
    groupCount * sellerStride <= 8_000_000 ? new Int32Array(groupCount * sellerStride).fill(-1) : null;
  const sellerSlotMap = sellerSlot === null ? new Map<number, number>() : null;
  for (let index = 0; index < count; index += 1) {
    const position = order[index] ?? 0;
    const transactionKind = kind[position] ?? 0;
    const buyerId = prepared.buyer[position] ?? 0;
    if (transactionKind !== runKind || buyerId !== runBuyer) {
      flushRun();
      runKind = transactionKind;
      runBuyer = buyerId;
      runCash = prepared.buyerCash[position] ?? 0;
      runExpense = prepared.buyerExpense[position] ?? 0;
    }
    const goodId = good[position] ?? 0;
    const amount = total[position] ?? 0;
    if (runSeen[goodId] === 0) {
      runSeen[goodId] = 1;
      runTouched[runLength] = goodId;
      runLength += 1;
      runAmount[goodId] = amount;
    } else {
      runAmount[goodId] = (runAmount[goodId] ?? 0) + amount;
    }
    const group = transactionKind * goodCount + goodId;
    const sellerAccountId = prepared.sellerCash[position] ?? 0;
    const slotKey = group * sellerStride + (prepared.seller[position] ?? 0);
    const found = sellerSlot !== null ? (sellerSlot[slotKey] ?? -1) : (sellerSlotMap?.get(slotKey) ?? -1);
    const slot = found < 0 ? undefined : found;
    const lists = listOf(group);
    if (slot === undefined) {
      if (sellerSlot !== null) sellerSlot[slotKey] = lists.sellerAccount.length;
      else sellerSlotMap?.set(slotKey, lists.sellerAccount.length);
      lists.sellerAccount.push(sellerAccountId);
      lists.sellerRevenue.push(prepared.sellerRevenue[position] ?? 0);
      lists.sellerAmount.push(amount);
    } else {
      lists.sellerAmount[slot] = (lists.sellerAmount[slot] ?? 0) + amount;
    }
  }
  flushRun();

  // Items of one group in ascending account id (account ids are unique per group).
  const byAccount = (accounts: readonly number[]): Int32Array => {
    const keys = new Float64Array(accounts.length);
    for (let item = 0; item < accounts.length; item += 1) keys[item] = (accounts[item] ?? 0) * 2 ** 20 + item;
    keys.sort();
    const sorted = new Int32Array(accounts.length);
    for (let item = 0; item < accounts.length; item += 1) sorted[item] = (keys[item] ?? 0) % 2 ** 20;
    return sorted;
  };
  const entries: JournalColumnEntry[] = [];
  const lines: JournalLineColumns = { accountId: [], debit: [], amount: [] };
  const pushLine = (accountId: number, debit: number, amount: number): void => {
    lines.accountId.push(accountId);
    lines.debit.push(debit);
    lines.amount.push(amount);
  };
  for (let transactionKind = 0; transactionKind < 2; transactionKind += 1) {
    for (let goodId = 0; goodId < goodCount; goodId += 1) {
      const lists = groups[transactionKind * goodCount + goodId];
      if (lists === undefined) continue;
      if (lists.buyerAccount.length >= 2 ** 20 || lists.sellerAccount.length >= 2 ** 20) {
        throw new RangeError("market posting group is too large");
      }
      const start = lines.accountId.length;
      for (const item of byAccount(lists.buyerAccount)) {
        const amount = lists.buyerAmount[item] ?? 0;
        if (!(amount > 0)) continue;
        pushLine(lists.buyerExpense[item] ?? 0, 1, amount);
        pushLine(lists.buyerAccount[item] ?? 0, 0, amount);
      }
      for (const item of byAccount(lists.sellerAccount)) {
        const amount = lists.sellerAmount[item] ?? 0;
        if (!(amount > 0)) continue;
        pushLine(lists.sellerAccount[item] ?? 0, 1, amount);
        pushLine(lists.sellerRevenue[item] ?? 0, 0, amount);
      }
      const end = lines.accountId.length;
      if (end > start) {
        entries.push({
          transactionKind: transactionKind === 0 ? "goods-purchase" : "input-purchase",
          start,
          end,
          sourceEntityId: null,
          targetEntityId: null,
        });
      }
    }
  }
  return { entries, lines };
}

function allocateMoney(
  world: World,
  dayIndex: DayIndex,
  total: number,
  groups: readonly WageGroup[],
): Map<Id, number> {
  const allocations = new Map<Id, number>();
  if (!(total > 0) || groups.length === 0) return allocations;
  let totalWeight = 0;
  for (const group of groups) totalWeight += group.obligationRUSD;
  if (!(totalWeight > 0)) return allocations;
  let allocated = 0;
  for (const group of groups) {
    const quantity = (total * group.obligationRUSD) / totalWeight;
    allocations.set(group.popBlockId, quantity);
    allocated += quantity;
  }
  let residual = total - allocated;
  // The keyed order is read only when a residual beyond tolerance remains; each
  // group's draw is computed once rather than twice per comparison (D-137).
  const order =
    Math.abs(residual) > toleranceMoney(residual)
      ? groups
          .map((group) => ({
            group,
            key: drawUint32({
              seed: world.seed,
              day: dayIndex,
              entityId: group.popBlockId,
              purpose: M3E_WAGE_RESIDUAL_PURPOSE,
              drawIndex: 0,
            }),
          }))
          .sort((left, right) => left.key - right.key || left.group.popBlockId - right.group.popBlockId)
          .map((entry) => entry.group)
      : [];
  for (let attempt = 0; attempt < order.length && Math.abs(residual) > toleranceMoney(residual); attempt += 1) {
    const group = order[attempt];
    if (group === undefined) break;
    const current = allocations.get(group.popBlockId) ?? 0;
    if (residual > 0) {
      allocations.set(group.popBlockId, current + residual);
      residual = 0;
    } else if (current >= -residual) {
      allocations.set(group.popBlockId, current + residual);
      residual = 0;
    }
  }
  if (Math.abs(residual) > toleranceMoney(residual)) {
    throw new RangeError("wage residual allocation failed");
  }
  return allocations;
}

/**
 * P1 lookup tables for daily wage settlement. Assignments keep `world.employment`
 * order per building and the owner is the first country in `world.countries` order,
 * matching the linear scans they replace.
 */
interface WageLookup {
  readonly assignmentsByBuilding: ReadonlyMap<Id, readonly EmploymentAssignment[]>;
  readonly blockById: ReadonlyMap<Id, World["popBlocks"][number]>;
  readonly ownerByProvince: ReadonlyMap<Id, World["countries"][number]>;
  /** P2b province wage tables by profession id; absent or empty means profession wages. */
  readonly wagesByProvince: ReadonlyMap<Id, readonly number[]>;
}

/**
 * P2b (D-135): the annual wage of one worker of a profession in a province. The
 * province's sourced wage table applies when it has an entry for the profession;
 * otherwise the profession's world reference wage (legacy fixtures).
 */
export function provinceWageRUSDPerYear(
  wages: readonly number[] | undefined,
  profession: ProfessionDef,
): number {
  const wage = wages?.[profession.id];
  return wage === undefined ? profession.baseWage1900RUSDPerYear : wage;
}

function buildWageLookup(world: World): WageLookup {
  const assignmentsByBuilding = new Map<Id, EmploymentAssignment[]>();
  for (const assignment of world.employment) {
    const list = assignmentsByBuilding.get(assignment.buildingInstanceId);
    if (list === undefined) assignmentsByBuilding.set(assignment.buildingInstanceId, [assignment]);
    else list.push(assignment);
  }
  const blockById = new Map<Id, World["popBlocks"][number]>();
  for (const block of world.popBlocks) {
    if (!blockById.has(block.id)) blockById.set(block.id, block);
  }
  const ownerByProvince = new Map<Id, World["countries"][number]>();
  const countryById = new Map(world.countries.map((country) => [country.id, country]));
  for (const [provinceId, countryId] of buildProvinceOwnerMap(world)) {
    const country = countryById.get(countryId);
    if (country !== undefined) ownerByProvince.set(provinceId, country);
  }
  const wagesByProvince = new Map<Id, readonly number[]>();
  for (const province of world.provinceEconomies) {
    if (province.wageRUSDPerYearByProfession.length > 0) {
      wagesByProvince.set(province.id, province.wageRUSDPerYearByProfession);
    }
  }
  return { assignmentsByBuilding, blockById, ownerByProvince, wagesByProvince };
}

function buildWageGroups(
  lookup: WageLookup,
  building: BuildingInstance,
  professions: ReadonlyMap<Id, ProfessionDef>,
  index: FinanceIndex,
  yearDays: number,
  laborStandards: {
    readonly minimumWageRUSDPerYear: number;
    readonly hoursFactor: number;
  },
): WageGroup[] {
  const groups = new Map<Id, WageGroup>();
  for (const assignment of lookup.assignmentsByBuilding.get(building.id) ?? []) {
    const block = lookup.blockById.get(assignment.popBlockId);
    if (block === undefined) throw new RangeError("employment assignment references an unknown block");
    const profession = professions.get(assignment.professionId);
    if (profession === undefined) throw new RangeError("employment assignment references an unknown profession");
    const account = householdCash(index, block.id);
    // E5: statutory floor and hours standard scale the wage obligation; the block's
    // vocational qualification adds a premium. All three are real labor-market
    // channels, not display modifiers.
    const annualBase = Math.max(
      provinceWageRUSDPerYear(lookup.wagesByProvince.get(block.provinceId), profession),
      laborStandards.minimumWageRUSDPerYear,
    );
    const dailyWage =
      (annualBase * laborStandards.hoursFactor * qualificationWageFactor(block)) /
      yearDays;
    if (!Number.isFinite(dailyWage) || !(dailyWage > 0)) {
      throw new RangeError(`invalid daily wage for profession ${String(profession.id)}`);
    }
    const current = groups.get(block.id);
    const obligation = dailyWage * assignment.workers;
    if (current === undefined) {
      groups.set(block.id, {
        popBlockId: block.id,
        professionId: profession.id,
        workers: assignment.workers,
        accountId: account.id,
        obligationRUSD: obligation,
      });
    } else {
      groups.set(block.id, {
        ...current,
        workers: current.workers + assignment.workers,
        obligationRUSD: current.obligationRUSD + obligation,
      });
    }
  }
  return [...groups.values()].sort((left, right) => left.popBlockId - right.popBlockId);
}

function producerProfit(
  initialCash: number,
  endingCash: number,
  revenue: number,
  inputCosts: number,
  wagesPaid: number,
  upkeepPaid: number,
): number {
  const expected =
    initialCash + revenue - inputCosts - wagesPaid - upkeepPaid;
  if (Math.abs(expected - endingCash) > toleranceMoney(expected, endingCash)) {
    throw new RangeError(
      `producer cash does not reconcile: expected ${String(expected)}, received ${String(endingCash)}`,
    );
  }
  return endingCash - initialCash;
}

/**
 * Settle one complete day of market results against authoritative financial
 * accounts.
 *
 * Public postcondition: callers must supply exactly one unsettled result for
 * every market in the world. Wages and upkeep are once-per-day obligations for
 * every building, so a partial batch is rejected before any mutation rather than
 * paying those obligations per market. Market purchases must be fully funded in
 * the aggregate batch. On success every result is marked settled; on failure the
 * finance accounts, postings, and posting counter are restored.
 */
export function settleMarketDays(
  world: World,
  definitions: EconomyDefinitions,
  marketDays: readonly MarketDayResult[],
  options: PhaseValidationOptions & {
    /**
     * `summary` (D-137, `TickContext.detail`) returns an empty `transactions` list;
     * every posting, balance and total is the same. Defaults to `full`.
     */
    readonly detail?: "full" | "summary";
    /**
     * Skip the employment precondition when the caller validated it immediately
     * before (the integrated day does, after migration). Defaults to checking.
     */
    readonly validateEmployment?: boolean;
    /**
     * Restore balances and postings on failure (default). The integrated day passes
     * false (D-139): its rollback runner or staged copy already owns atomicity.
     */
    readonly atomic?: boolean;
  } = {},
): MarketSettlementResult {
  if (options.validateWorld !== false) assertValidWorldForTick(world);
  // Staged mode: the integrated day validated the definitions once at its start.
  if (options.validateWorld !== false) assertValidEconomyDefinitions(definitions);
  if (definitions.dataVersion !== world.dataVersion || definitions.scenarioId !== world.scenarioId) {
    throw new RangeError("economy definitions do not match the world data/scenario identity");
  }
  if (marketDays.length === 0) {
    throw new RangeError("settlement requires at least one market-day result");
  }
  const seenMarketIds = new Set<number>();
  for (const marketDay of marketDays) {
    if (marketDay.settled) throw new RangeError("market-day result has already been settled");
    if (marketDay.dayIndex !== world.dayIndex) {
      throw new RangeError("market-day result dayIndex must match the world");
    }
    if (seenMarketIds.has(marketDay.marketId)) {
      throw new RangeError(`duplicate market-day result for market ${String(marketDay.marketId)}`);
    }
    seenMarketIds.add(marketDay.marketId);
    if (!world.markets.some((market) => market.id === marketDay.marketId)) {
      throw new RangeError(`market-day result references unknown market ${String(marketDay.marketId)}`);
    }
  }
  if (seenMarketIds.size !== world.markets.length) {
    throw new RangeError(
      `settlement requires exactly one market-day result for every world market; received ${String(seenMarketIds.size)} of ${String(world.markets.length)}`,
    );
  }
  assertValidDayIndex(world.dayIndex);
  if (isTerminalDayIndex(world.dayIndex)) {
    throw new RangeError("settlement cannot run at the terminal boundary");
  }
  // D-137: the integrated day validates employment immediately before the market
  // phase (after migration), so it can say so and avoid a second full pass; direct
  // callers keep the precondition check.
  if (options.validateEmployment !== false) assertValidEmploymentState(world, definitions);
  const sortedResults = [...marketDays].sort((left, right) => left.marketId - right.marketId);
  const result = settleMarketDaysInternal(
    world,
    definitions,
    sortedResults,
    options.detail ?? "full",
    options.atomic !== false,
  );
  for (const marketDay of marketDays) marketDay.settled = true;
  return result;
}

/**
 * Settle the single market of a one-market world.
 *
 * This convenience wrapper exists for the M3/M4 fixtures. A world with multiple
 * markets must call `settleMarketDays` with one result for every market, because
 * wages and upkeep are once-per-day obligations that must not be paid per market.
 */
export function settleMarketDay(
  world: World,
  definitions: EconomyDefinitions,
  marketDay: MarketDayResult,
  options: PhaseValidationOptions = {},
): MarketSettlementResult {
  if (world.markets.length !== 1) {
    throw new RangeError(
      `settleMarketDay is only valid for a single-market world; this world has ${String(world.markets.length)} markets. Use settleMarketDays with every market-day result`,
    );
  }
  return settleMarketDays(world, definitions, [marketDay], options);
}

function settleMarketDaysInternal(
  world: World,
  definitions: EconomyDefinitions,
  marketDays: readonly MarketDayResult[],
  detail: "full" | "summary",
  atomic: boolean,
): MarketSettlementResult {
  const dayIndex = marketDays[0]?.dayIndex;
  if (dayIndex === undefined) throw new RangeError("settlement requires a market-day result");
  const marketIds = marketDays.map((marketDay) => marketDay.marketId);
  const marketId = marketIds[0];
  if (marketId === undefined) throw new RangeError("settlement requires a market-day result");
  const index = buildFinanceIndex(world.finance);
  const transactions = prepareTransactions(world, definitions, index, marketDays.map(transactionChunk));

  // Opening balances in account order, restored on failure when the call owns its
  // atomicity (no account is created during settlement). D-139: the integrated day
  // passes `atomic: false`: its runner (phase mode) or staged copy (staged mode) owns
  // atomicity, so the 100k-account copy is skipped. The opening cash of each
  // producer and household is read before any posting either way.
  const accounts = world.finance.accounts;
  let openingBalanceArray: Float64Array | null = null;
  if (atomic) {
    openingBalanceArray = new Float64Array(accounts.length);
    for (let position = 0; position < accounts.length; position += 1) {
      openingBalanceArray[position] = (accounts[position] as FinancialAccount).balanceRUSD;
    }
  }
  const openingCashByAccount = new Map<Id, number>();
  for (const building of world.buildings) {
    openingCashByAccount.set(
      building.operatingCashAccountId,
      index.account(building.operatingCashAccountId)?.balanceRUSD ?? 0,
    );
  }
  const householdCashIds = index.ownerAccountIds("popBlock", "household-cash");
  for (const block of world.popBlocks) {
    const accountId = tableAccount(householdCashIds, block.id);
    if (accountId >= 0) openingCashByAccount.set(accountId, index.account(accountId)?.balanceRUSD ?? 0);
  }
  const initialCash = designatedCashTotal(world.finance);
  const openingPostings = [...world.finance.postings];
  const openingNextPostingId = world.finance.nextPostingId;

  // D-125/D-137: the aggregated market postings are also the batch affordability
  // check (their aggregate is exactly the net cash change below), so the former
  // per-account delta map duplicated a 100k-account pass; the posting batch rejects
  // an overdraw with the same invariant.

  const postings: JournalPosting[] = [];
  try {
    let goodCount = 0;
    for (const good of definitions.goods) if (good.id + 1 > goodCount) goodCount = good.id + 1;
    // D-139: market postings with column lines; their audit copies are materialised
    // below only if they can still be among the newest postings.
    let marketPostings: DeferredPostings | null = null;
    if (transactions.count > 0) {
      const market = aggregatedMarketEntries(transactions, goodCount);
      marketPostings = postJournalColumns(world.finance, dayIndex, market.entries, market.lines);
    }

    const professions = new Map(definitions.professions.map((profession) => [profession.id, profession]));
    const buildingDefinitions = new Map(
      definitions.buildings.map((definition) => [definition.id, definition]),
    );
    const yearDays = daysInYear(dayIndexToCivilDate(dayIndex).year);
    const wageSettlements: WageSettlement[] = [];
    const wageLookup = buildWageLookup(world);
    const wageEntries: JournalEntryInput[] = [];
    for (const building of inIdOrder(world.buildings)) {
      if (!building.operational) continue;
      const definition = buildingDefinitions.get(building.definitionId);
      if (definition === undefined) {
        throw new RangeError(`building ${String(building.id)} has no definition`);
      }
      const groups = buildWageGroups(
        wageLookup,
        building,
        professions,
        index,
        yearDays,
        (() => {
          const owner = wageLookup.ownerByProvince.get(building.provinceId);
          return owner === undefined
            ? { minimumWageRUSDPerYear: 0, hoursFactor: 1 }
            : {
                minimumWageRUSDPerYear: laborMinimumWageRUSDPerYear(owner, definitions),
                hoursFactor: laborHoursFactor(owner, definitions),
              };
        })(),
      );
      if (groups.length === 0) continue;
      const obligation = groups.reduce((total, group) => total + group.obligationRUSD, 0);
      const employer = operatingCash(index, building.id);
      const paid = Math.min(employer.balanceRUSD, obligation);
      const allocations = allocateMoney(world, dayIndex, paid, groups);
      const payments: WagePayment[] = groups.map((group) => {
        const paidRUSD = allocations.get(group.popBlockId) ?? 0;
        return {
          ...group,
          paidRUSD,
          unpaidRUSD: Math.max(0, group.obligationRUSD - paidRUSD),
        };
      });
      let paidTotal = payments.reduce((total, payment) => total + payment.paidRUSD, 0);
      if (paidTotal > employer.balanceRUSD) {
        let excess = paidTotal - employer.balanceRUSD;
        for (let index = payments.length - 1; index >= 0 && excess > 0; index -= 1) {
          const payment = payments[index];
          if (payment === undefined) continue;
          const reduction = Math.min(payment.paidRUSD, excess);
          if (reduction <= 0) continue;
          payments[index] = {
            ...payment,
            paidRUSD: payment.paidRUSD - reduction,
            unpaidRUSD: payment.unpaidRUSD + reduction,
          };
          excess -= reduction;
        }
        paidTotal = payments.reduce((total, payment) => total + payment.paidRUSD, 0);
      }
      // Proportional allocation can exceed the employer balance by one or two
      // binary64 ulps even though every amount is finite. A reduction smaller
      // than an ulp would be a no-op, so step by at least one representable ulp
      // until the paid total is genuinely affordable. The difference is paid as
      // reported shortfall, never as debt or negative cash.
      let roundingGuard = 0;
      while (paidTotal > employer.balanceRUSD && roundingGuard < 32) {
        let reduced = false;
        for (let index = payments.length - 1; index >= 0 && !reduced; index -= 1) {
          const payment = payments[index];
          if (payment === undefined || payment.paidRUSD <= 0) continue;
          const step = Math.max(
            paidTotal - employer.balanceRUSD,
            Math.abs(payment.paidRUSD) * Number.EPSILON * 2,
          );
          const reduction = Math.min(payment.paidRUSD, step);
          const nextPaid = payment.paidRUSD - reduction;
          if (!(nextPaid < payment.paidRUSD)) continue;
          payments[index] = {
            ...payment,
            paidRUSD: nextPaid,
            unpaidRUSD: payment.unpaidRUSD + (payment.paidRUSD - nextPaid),
          };
          reduced = true;
        }
        if (!reduced) break;
        paidTotal = payments.reduce((total, payment) => total + payment.paidRUSD, 0);
        roundingGuard += 1;
      }
      if (paidTotal > employer.balanceRUSD + toleranceMoney(paidTotal, employer.balanceRUSD)) {
        throw new RangeError(`wage payment exceeds employer cash for building ${String(building.id)}`);
      }
      if (paidTotal > 0) {
        const wageExpense = index.get("building", building.id, "wage-expense");
        const lines: JournalLine[] = [];
        for (const payment of payments) {
          if (payment.paidRUSD <= 0) continue;
          lines.push({
            accountId: payment.accountId,
            side: "debit",
            amountRUSD: payment.paidRUSD,
          });
        }
        lines.push({
          accountId: wageExpense.id,
          side: "debit",
          amountRUSD: paidTotal,
        });
        lines.push({
          accountId: employer.id,
          side: "credit",
          amountRUSD: paidTotal,
        });
        for (const payment of payments) {
          if (payment.paidRUSD <= 0) continue;
          const income = index.get("popBlock", payment.popBlockId, "wage-income");
          lines.push({
            accountId: income.id,
            side: "credit",
            amountRUSD: payment.paidRUSD,
          });
        }
        wageEntries.push({
          transactionKind: "wages",
          lines,
          sourceEntityId: building.id,
          targetEntityId: null,
        });
      }
      wageSettlements.push({
        buildingId: building.id,
        operatingAccountId: employer.id,
        obligationRUSD: obligation,
        paidRUSD: paidTotal,
        unpaidRUSD: Math.max(0, obligation - paidTotal),
        payments,
      });
    }
    if (wageEntries.length > 0) {
      postings.push(...postJournalBatch(world.finance, dayIndex, wageEntries, { adoptLines: true }));
    }

    const upkeepSettlements: UpkeepSettlement[] = [];
    const upkeepEntries: JournalEntryInput[] = [];
    const upkeepPaidByBuilding = new Map<Id, number>();
    const upkeepObligationByBuilding = new Map<Id, number>();
    const unpaidUpkeepByBuilding = new Map<Id, number>();
    let systemAccount: FinancialAccount | undefined;
    let systemIncome: FinancialAccount | undefined;
    for (const building of inIdOrder(world.buildings)) {
      if (!building.operational) continue;
      const definition = buildingDefinitions.get(building.definitionId);
      if (definition === undefined) {
        throw new RangeError(`building ${String(building.id)} has no definition`);
      }
      const obligation = definition.dailyUpkeepRUSDAtLevelOne * building.level;
      if (!Number.isFinite(obligation) || obligation < 0) {
        throw new RangeError(`invalid upkeep obligation for building ${String(building.id)}`);
      }
      if (obligation <= 0) continue;
      if (systemAccount === undefined) {
        const systemAccounts = findAccountsBySubtype(world.finance.accounts, "system-reserve-cash");
        if (systemAccounts.length !== 1) {
          throw new RangeError("M3e upkeep requires exactly one system-reserve account");
        }
        systemAccount = systemAccounts[0];
        if (systemAccount === undefined) {
          throw new RangeError("M3e upkeep requires a system-reserve account");
        }
        systemIncome = index.get("system", null, "system-income");
      }
      const employer = operatingCash(index, building.id);
      const paid = Math.min(employer.balanceRUSD, obligation);
      const unpaid = Math.max(0, obligation - paid);
      if (paid > 0) {
        const upkeepExpense = index.get("building", building.id, "upkeep-expense");
        upkeepEntries.push({
          transactionKind: "upkeep",
          lines: [
            { accountId: systemAccount.id, side: "debit", amountRUSD: paid },
            { accountId: upkeepExpense.id, side: "debit", amountRUSD: paid },
            { accountId: employer.id, side: "credit", amountRUSD: paid },
            { accountId: systemIncome!.id, side: "credit", amountRUSD: paid },
          ],
          sourceEntityId: building.id,
          targetEntityId: systemAccount.id,
        });
      }
      upkeepSettlements.push({
        buildingId: building.id,
        operatingAccountId: employer.id,
        systemAccountId: systemAccount.id,
        obligationRUSD: obligation,
        paidRUSD: paid,
        unpaidRUSD: unpaid,
      });
      upkeepPaidByBuilding.set(building.id, paid);
      upkeepObligationByBuilding.set(building.id, obligation);
      unpaidUpkeepByBuilding.set(building.id, unpaid);
    }
    if (upkeepEntries.length > 0) {
      postings.push(...postJournalBatch(world.finance, dayIndex, upkeepEntries, { adoptLines: true }));
    }
    if (marketPostings !== null) {
      retainDeferredPostings(world.finance, marketPostings, wageEntries.length + upkeepEntries.length);
    }

    // D-139: per-owner sums in canonical transaction order, in id-indexed tables. A
    // table entry starts at 0 and adds each amount, as the former `get ?? 0` maps did.
    let maxBuildingId = 0;
    for (const building of world.buildings) if (building.id > maxBuildingId) maxBuildingId = building.id;
    let maxBlockId = 0;
    for (const block of world.popBlocks) if (block.id > maxBlockId) maxBlockId = block.id;
    const revenueByBuilding = new Float64Array(maxBuildingId + 1);
    const inputCostsByBuilding = new Float64Array(maxBuildingId + 1);
    const purchasesByBlock = new Float64Array(maxBlockId + 1);
    let marketPurchasesTotal = 0;
    let householdPurchasesTotal = 0;
    let inputPurchasesTotal = 0;
    for (let item = 0; item < transactions.count; item += 1) {
      const position = transactions.order[item] ?? 0;
      const amount = transactions.total[position] ?? 0;
      const sellerId = transactions.seller[position] ?? 0;
      revenueByBuilding[sellerId] = (revenueByBuilding[sellerId] ?? 0) + amount;
      marketPurchasesTotal += amount;
      const buyerId = transactions.buyer[position] ?? 0;
      if (transactions.kind[position] === 1) {
        inputCostsByBuilding[buyerId] = (inputCostsByBuilding[buyerId] ?? 0) + amount;
        inputPurchasesTotal += amount;
      } else {
        purchasesByBlock[buyerId] = (purchasesByBlock[buyerId] ?? 0) + amount;
        householdPurchasesTotal += amount;
      }
    }
    const wagesByBuilding = new Map<Id, number>();
    const wageObligationByBuilding = new Map<Id, number>();
    const unpaidWagesByBuilding = new Map<Id, number>();
    const wagesByBlock = new Map<Id, number>();
    for (const settlement of wageSettlements) {
      wagesByBuilding.set(settlement.buildingId, settlement.paidRUSD);
      wageObligationByBuilding.set(settlement.buildingId, settlement.obligationRUSD);
      unpaidWagesByBuilding.set(settlement.buildingId, settlement.unpaidRUSD);
      for (const payment of settlement.payments) {
        wagesByBlock.set(
          payment.popBlockId,
          (wagesByBlock.get(payment.popBlockId) ?? 0) + payment.paidRUSD,
        );
      }
    }

    const producers: ProducerSettlement[] = inIdOrder(world.buildings)
      .map((building) => {
        const initialCash =
          openingCashByAccount.get(building.operatingCashAccountId) ?? 0;
        const current = operatingCash(index, building.id);
        const revenue = revenueByBuilding[building.id] ?? 0;
        const inputCosts = inputCostsByBuilding[building.id] ?? 0;
        const wagesPaid = wagesByBuilding.get(building.id) ?? 0;
        const upkeepPaid = upkeepPaidByBuilding.get(building.id) ?? 0;
        return {
          buildingId: building.id,
          ownerAccountId: building.ownerAccountId,
          operatingAccountId: building.operatingCashAccountId,
          initialCashRUSD: initialCash,
          revenueRUSD: revenue,
          inputCostsRUSD: inputCosts,
          wagesPaidRUSD: wagesPaid,
          wageObligationRUSD: wageObligationByBuilding.get(building.id) ?? 0,
          unpaidWagesRUSD: unpaidWagesByBuilding.get(building.id) ?? 0,
          upkeepPaidRUSD: upkeepPaid,
          upkeepObligationRUSD: upkeepObligationByBuilding.get(building.id) ?? 0,
          unpaidUpkeepRUSD: unpaidUpkeepByBuilding.get(building.id) ?? 0,
          profitRUSD: producerProfit(
            initialCash,
            current.balanceRUSD,
            revenue,
            inputCosts,
            wagesPaid,
            upkeepPaid,
          ),
          endingCashAfterSettlementRUSD: current.balanceRUSD,
        };
      });

    const households: HouseholdSettlement[] = inIdOrder(world.popBlocks)
      .map((block) => {
        const account = householdCash(index, block.id);
        const initialCash =
          openingCashByAccount.get(account.id) ?? 0;
        const purchases = purchasesByBlock[block.id] ?? 0;
        const wages = wagesByBlock.get(block.id) ?? 0;
        const expected = initialCash - purchases + wages;
        if (Math.abs(expected - account.balanceRUSD) > toleranceMoney(expected, account.balanceRUSD)) {
          throw new RangeError(`household cash does not reconcile for popBlock ${String(block.id)}`);
        }
        return {
          popBlockId: block.id,
          financialAccountId: account.id,
          initialCashRUSD: initialCash,
          marketPurchasesRUSD: purchases,
          wagesReceivedRUSD: wages,
          endingCashAfterSettlementRUSD: account.balanceRUSD,
        };
      });

    const endingCash = designatedCashTotal(world.finance);
    if (Math.abs(initialCash - endingCash) > toleranceMoney(initialCash, endingCash)) {
      throw new RangeError("market settlement did not conserve aggregate cash");
    }

    const totals: SettlementTotals = {
      marketPurchasesRUSD: marketPurchasesTotal,
      householdPurchasesRUSD: householdPurchasesTotal,
      inputPurchasesRUSD: inputPurchasesTotal,
      wageObligationRUSD: wageSettlements.reduce((total, settlement) => total + settlement.obligationRUSD, 0),
      wagesPaidRUSD: wageSettlements.reduce((total, settlement) => total + settlement.paidRUSD, 0),
      unpaidWagesRUSD: wageSettlements.reduce((total, settlement) => total + settlement.unpaidRUSD, 0),
      upkeepObligationRUSD: upkeepSettlements.reduce(
        (total, settlement) => total + settlement.obligationRUSD,
        0,
      ),
      upkeepPaidRUSD: upkeepSettlements.reduce((total, settlement) => total + settlement.paidRUSD, 0),
      unpaidUpkeepRUSD: upkeepSettlements.reduce(
        (total, settlement) => total + settlement.unpaidRUSD,
        0,
      ),
      producerRevenueRUSD: producers.reduce((total, producer) => total + producer.revenueRUSD, 0),
      producerInputCostsRUSD: producers.reduce((total, producer) => total + producer.inputCostsRUSD, 0),
      producerWagesRUSD: producers.reduce((total, producer) => total + producer.wagesPaidRUSD, 0),
      producerProfitRUSD: producers.reduce((total, producer) => total + producer.profitRUSD, 0),
      initialCashRUSD: initialCash,
      endingCashAfterSettlementRUSD: endingCash,
    };

    return {
      dayIndex,
      marketId,
      marketIds,
      worldSeed: world.seed,
      scenarioId: world.scenarioId,
      startDayIndex: world.startDayIndex,
      settlementNextPostingId: world.finance.nextPostingId,
      fiscalApplied: false,
      transactions: detail === "summary" ? [] : settledTransactions(transactions),
      wages: wageSettlements,
      upkeep: upkeepSettlements,
      producers,
      households,
      totals,
      postingIds: [
        ...(marketPostings === null
          ? []
          : Array.from({ length: marketPostings.count }, (_, offset) => marketPostings.firstId + offset)),
        ...postings.map((posting) => posting.id),
      ],
    };
  } catch (error) {
    if (openingBalanceArray === null) throw error;
    if (accounts.length !== openingBalanceArray.length) {
      throw new RangeError("settlement rollback found accounts created during settlement");
    }
    for (let position = 0; position < accounts.length; position += 1) {
      (accounts[position] as FinancialAccount).balanceRUSD = openingBalanceArray[position] ?? 0;
    }
    world.finance.postings = openingPostings;
    world.finance.nextPostingId = openingNextPostingId;
    throw error;
  }
}
