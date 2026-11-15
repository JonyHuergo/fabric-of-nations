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

import { DOMESTIC_WAGE_RATIO } from "./constants.js";
import { buildLabourWageTable, jobIsCovered, type MinimumWageCoverage } from "./labourMarket.js";
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
  createJournalLines,
  postJournalColumns,
  pushJournalLine,
  retainDeferredPostings,
  type DeferredPostings,
  type JournalColumnEntry,
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
  qualificationWageFactor,
} from "./labor.js";
import type {
  MarketDayResult,
  MarketTier,
  PendingColumns,
  PendingTransaction,
  MarketFlowColumns,
} from "./market.js";
import type {
  AccountSubtype,
  EconomyDefinitions,
  EmploymentAssignment,
  FinancialAccount,
  JournalPosting,
} from "./types.js";
import { buildProvinceOwnerMap } from "./country.js";
import { inIdOrder } from "../ordering.js";

import { ownerKindCode, accountOwnerIdAt } from "./accountTable.js";
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
  /** Cash wage owed today (after any wage in kind, P5). */
  readonly obligationRUSD: number;
  /** P5 (D-143 §2): wage paid in kind (kept food at opening prices); absent when none. */
  readonly paidInKindRUSD?: number;
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

/**
 * D-160: the household settlement of every block as typed columns indexed by block id (a
 * transient, non-enumerable companion of a settlement result, like the market day's columns).
 * `settled` is 1 for each settled block; the amounts are those of `HouseholdSettlement`.
 * `households` lists the same values as objects in full detail only.
 */
export interface SettlementHouseholdColumns {
  readonly settled: Uint8Array;
  readonly initialCashRUSD: Float64Array;
  readonly marketPurchasesRUSD: Float64Array;
  readonly wagesReceivedRUSD: Float64Array;
  readonly endingCashAfterSettlementRUSD: Float64Array;
}

/** D-160: a block's household settlement, from the columns or the result's objects. */
export interface SettledHouseholdReader {
  has(popBlockId: Id): boolean;
  initialCashRUSD(popBlockId: Id): number;
  marketPurchasesRUSD(popBlockId: Id): number;
  wagesReceivedRUSD(popBlockId: Id): number;
}

const SETTLEMENT_COLUMNS = "householdColumns";

/** D-160: the household columns a settlement attached to its result, if any. */
export function settlementHouseholdColumns(settlement: MarketSettlementResult): SettlementHouseholdColumns | undefined {
  return (settlement as { readonly [SETTLEMENT_COLUMNS]?: SettlementHouseholdColumns })[SETTLEMENT_COLUMNS];
}

/**
 * D-160: read the household settlement of a result. A result from `settleMarketDays`
 * carries columns; a copy or hand-built result is read from its `households` list (the
 * last entry of a block, as the maps built from that list kept). Absent blocks read 0.
 */
export function settledHouseholds(settlement: MarketSettlementResult): SettledHouseholdReader {
  const columns = settlementHouseholdColumns(settlement);
  if (columns !== undefined) {
    const at = (values: Float64Array, id: Id): number =>
      Number.isInteger(id) && id >= 0 && id < values.length && columns.settled[id] === 1 ? (values[id] ?? 0) : 0;
    return {
      has: (id) => Number.isInteger(id) && id >= 0 && id < columns.settled.length && columns.settled[id] === 1,
      initialCashRUSD: (id) => at(columns.initialCashRUSD, id),
      marketPurchasesRUSD: (id) => at(columns.marketPurchasesRUSD, id),
      wagesReceivedRUSD: (id) => at(columns.wagesReceivedRUSD, id),
    };
  }
  const byBlock = new Map(settlement.households.map((entry) => [entry.popBlockId, entry]));
  return {
    has: (id) => byBlock.has(id),
    initialCashRUSD: (id) => byBlock.get(id)?.initialCashRUSD ?? 0,
    marketPurchasesRUSD: (id) => byBlock.get(id)?.marketPurchasesRUSD ?? 0,
    wagesReceivedRUSD: (id) => byBlock.get(id)?.wagesReceivedRUSD ?? 0,
  };
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

const POP_BLOCK_KIND = ownerKindCode("popBlock");
/** D-160: the shared empty assignment list of a building without workers (never written). */
const NO_WAGE_ASSIGNMENTS: readonly World["employment"][number][] = [];

/** An owner's account id from an owner table, or the lookup's error (D-158). */
function ownerAccountOrThrow(table: Int32Array, ownerId: number, subtype: AccountSubtype, ownerKind: "popBlock" | "building"): number {
  const id = tableAccount(table, ownerId);
  if (id < 0) throw new RangeError(`missing ${subtype} account for ${ownerKind} ${String(ownerId)}`);
  return id;
}

/** `householdCash(...).id` through the owner table (D-158). */
function householdCashId(index: FinanceIndex, table: Int32Array, popBlockId: Id): number {
  const id = tableAccount(table, popBlockId);
  if (id < 0) return householdCash(index, popBlockId).id;
  return id;
}

/** `operatingCash(...).id` through the owner table (D-158). */
function operatingCashId(index: FinanceIndex, table: Int32Array, buildingId: Id): number {
  const id = tableAccount(table, buildingId);
  if (id < 0) return operatingCash(index, buildingId).id;
  return id;
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

/** D-158: the money flows of validated transactions, in their canonical order. */
function flowsOfTransactions(prepared: PreparedColumns): MarketFlowColumns {
  const householdBuyer: number[] = [];
  const householdSpend: number[] = [];
  const householdSellerId: number[] = [];
  const householdSellerAmount: number[] = [];
  const inputBuyer: number[] = [];
  const inputSeller: number[] = [];
  const inputAmount: number[] = [];
  for (let item = 0; item < prepared.count; item += 1) {
    const position = prepared.order[item] ?? 0;
    const buyer = prepared.buyer[position] ?? 0;
    const seller = prepared.seller[position] ?? 0;
    const total = prepared.total[position] ?? 0;
    if (prepared.kind[position] === 0) {
      householdBuyer.push(buyer);
      householdSpend.push(total);
      householdSellerId.push(seller);
      householdSellerAmount.push(total);
    } else {
      inputBuyer.push(buyer);
      inputSeller.push(seller);
      inputAmount.push(total);
    }
  }
  return {
    householdBuyer: Float64Array.from(householdBuyer),
    householdSpend: Float64Array.from(householdSpend),
    householdSellerId,
    householdSellerAmount,
    inputBuyer,
    inputSeller,
    inputAmount,
  };
}

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
 * P1 lookup tables for daily wage settlement. Assignments keep `world.employment`
 * order per building and the owner is the first country in `world.countries` order,
 * matching the linear scans they replace.
 */
interface WageLookup {
  readonly assignmentsByBuilding: { get(id: Id): readonly EmploymentAssignment[] | undefined };
  readonly blockById: { get(id: Id): World["popBlocks"][number] | undefined };
  readonly ownerByProvince: ReadonlyMap<Id, World["countries"][number]>;
}

/**
 * D-158: an id-indexed table (the first entry per id, as the former maps kept), or a map when
 * the ids are too sparse for a table.
 */
function idTable<T>(entries: readonly T[], idOf: (entry: T) => Id, keepFirst: boolean, group: false): { get(id: Id): T | undefined };
function idTable<T>(entries: readonly T[], idOf: (entry: T) => Id, keepFirst: boolean, group: true): { get(id: Id): T[] | undefined };
function idTable<T>(entries: readonly T[], idOf: (entry: T) => Id, keepFirst: boolean, group: boolean): { get(id: Id): unknown } {
  let maxId = -1;
  let dense = true;
  for (const entry of entries) {
    const id = idOf(entry);
    if (!(Number.isInteger(id) && id >= 0)) dense = false;
    else if (id > maxId) maxId = id;
  }
  if (dense && maxId <= entries.length * 4 + 1024) {
    const table: unknown[] = new Array<unknown>(maxId + 1);
    for (const entry of entries) {
      const id = idOf(entry);
      if (group) {
        const list = table[id] as T[] | undefined;
        if (list === undefined) table[id] = [entry];
        else list.push(entry);
      } else if (!keepFirst || table[id] === undefined) {
        table[id] = entry;
      }
    }
    return { get: (id) => (Number.isInteger(id) && id >= 0 && id <= maxId ? table[id] : undefined) };
  }
  const map = new Map<Id, unknown>();
  for (const entry of entries) {
    const id = idOf(entry);
    if (group) {
      const list = map.get(id) as T[] | undefined;
      if (list === undefined) map.set(id, [entry]);
      else list.push(entry);
    } else if (!keepFirst || !map.has(id)) {
      map.set(id, entry);
    }
  }
  return { get: (id) => map.get(id) };
}

function buildWageLookup(world: World): WageLookup {
  const assignmentsByBuilding = idTable(world.employment, (assignment) => assignment.buildingInstanceId, false, true);
  const blockById = idTable(world.popBlocks, (block) => block.id, true, false);
  const ownerByProvince = new Map<Id, World["countries"][number]>();
  const countryById = new Map(world.countries.map((country) => [country.id, country]));
  for (const [provinceId, countryId] of buildProvinceOwnerMap(world)) {
    const country = countryById.get(countryId);
    if (country !== undefined) ownerByProvince.set(provinceId, country);
  }
  return { assignmentsByBuilding, blockById, ownerByProvince };
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
    /**
     * P5 (D-143 §2): value at opening prices of the food each building's owner block
     * kept from it today. It is paid as a wage in kind: the building's cash wage to
     * that block falls by it (never below zero); any remainder was the owner's draw.
     */
    readonly inKindWages?: ReadonlyMap<Id, { readonly popBlockId: Id; readonly valueRUSD: number }>;
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
    options.inKindWages,
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

/**
 * D-158: the market postings of the day from the markets' money flows. One entry per market
 * and kind: households' purchases (each block's consumption expense and cash, then each
 * seller's cash and sales revenue) and producers' input purchases (each buyer's input expense
 * and cash, then each seller's), every amount summed over goods. Buyers are listed in flow
 * order and sellers in first-receipt order; both are aggregated per account.
 */
function marketFlowEntries(
  world: World,
  index: FinanceIndex,
  marketDays: readonly MarketDayResult[],
  flows: readonly MarketFlowColumns[],
): { readonly entries: JournalColumnEntry[]; readonly lines: JournalLineColumns } {
  const householdIds = index.ownerAccountIds("popBlock", "household-cash");
  const consumptionIds = index.ownerAccountIds("popBlock", "consumption-expense");
  const operatingIds = index.ownerAccountIds("building", "operating-cash");
  const revenueIds = index.ownerAccountIds("building", "sales-revenue");
  const inputExpenseIds = index.ownerAccountIds("building", "input-expense");
  const accountOf = (table: Int32Array, ownerId: number, what: string): number => {
    const id = tableAccount(table, ownerId);
    if (id < 0) throw new RangeError(`missing ${what} account for ${String(ownerId)}`);
    return id;
  };
  let maxBuilding = 0;
  for (const building of world.buildings) if (building.id > maxBuilding) maxBuilding = building.id;
  const sellerAmount = new Float64Array(maxBuilding + 1);
  const buyerAmount = new Float64Array(maxBuilding + 1);
  const entries: JournalColumnEntry[] = [];
  // D-160: typed line columns (they double when this estimate is short).
  const lines = createJournalLines(2 * (world.popBlocks.length + 2 * world.buildings.length));
  const push = (accountId: number, debit: number, amount: number): void => {
    pushJournalLine(lines, accountId, debit, amount);
  };
  const close = (kind: "goods-purchase" | "input-purchase", start: number): void => {
    if (lines.count > start) {
      entries.push({ transactionKind: kind, start, end: lines.count, sourceEntityId: null, targetEntityId: null });
    }
  };
  // D-160: sellers of the current entry with a fill count (was cleared with `length = 0`).
  const sellerList = new Int32Array(maxBuilding + 1);
  let sellerCount = 0;
  const addSeller = (sellerId: number, amount: number): void => {
    if (!(amount > 0)) return;
    if (!(Number.isInteger(sellerId) && sellerId >= 0 && sellerId <= maxBuilding)) {
      throw new RangeError(`market receipt for unknown building ${String(sellerId)}`);
    }
    if (sellerAmount[sellerId] === 0) {
      sellerList[sellerCount] = sellerId;
      sellerCount += 1;
    }
    sellerAmount[sellerId] = (sellerAmount[sellerId] ?? 0) + amount;
  };
  const flushSellers = (): void => {
    for (let item = 0; item < sellerCount; item += 1) {
      const sellerId = sellerList[item] ?? 0;
      const amount = sellerAmount[sellerId] ?? 0;
      push(accountOf(operatingIds, sellerId, "operating-cash"), 1, amount);
      push(accountOf(revenueIds, sellerId, "sales-revenue"), 0, amount);
      sellerAmount[sellerId] = 0;
    }
    sellerCount = 0;
  };
  for (let market = 0; market < marketDays.length; market += 1) {
    const flow = flows[market] as MarketFlowColumns;
    // Households: rows of a block are contiguous.
    let start = lines.count;
    let runBlock = -1;
    let runAmount = 0;
    const flushBlock = (): void => {
      if (runBlock >= 0 && runAmount > 0) {
        push(accountOf(consumptionIds, runBlock, "consumption-expense"), 1, runAmount);
        push(accountOf(householdIds, runBlock, "household-cash"), 0, runAmount);
      }
    };
    for (let row = 0; row < flow.householdSpend.length; row += 1) {
      const blockId = flow.householdBuyer[row] ?? 0;
      if (blockId !== runBlock) {
        flushBlock();
        runBlock = blockId;
        runAmount = 0;
      }
      runAmount += flow.householdSpend[row] ?? 0;
    }
    flushBlock();
    for (let item = 0; item < flow.householdSellerId.length; item += 1) {
      addSeller(flow.householdSellerId[item] ?? 0, flow.householdSellerAmount[item] ?? 0);
    }
    flushSellers();
    close("goods-purchase", start);
    // Producers' inputs.
    start = lines.count;
    const buyerList: number[] = [];
    for (let item = 0; item < flow.inputBuyer.length; item += 1) {
      const amount = flow.inputAmount[item] ?? 0;
      if (!(amount > 0)) continue;
      const buyerId = flow.inputBuyer[item] ?? 0;
      if (!(Number.isInteger(buyerId) && buyerId >= 0 && buyerId <= maxBuilding)) {
        throw new RangeError(`input purchase by unknown building ${String(buyerId)}`);
      }
      if (buyerAmount[buyerId] === 0) buyerList.push(buyerId);
      buyerAmount[buyerId] = (buyerAmount[buyerId] ?? 0) + amount;
    }
    for (const buyerId of buyerList) {
      const amount = buyerAmount[buyerId] ?? 0;
      push(accountOf(inputExpenseIds, buyerId, "input-expense"), 1, amount);
      push(accountOf(operatingIds, buyerId, "operating-cash"), 0, amount);
      buyerAmount[buyerId] = 0;
    }
    for (let item = 0; item < flow.inputBuyer.length; item += 1) {
      addSeller(flow.inputSeller[item] ?? 0, flow.inputAmount[item] ?? 0);
    }
    flushSellers();
    close("input-purchase", start);
  }
  return { entries, lines };
}

function settleMarketDaysInternal(
  world: World,
  definitions: EconomyDefinitions,
  marketDays: readonly MarketDayResult[],
  detail: "full" | "summary",
  atomic: boolean,
  inKindWages?: ReadonlyMap<Id, { readonly popBlockId: Id; readonly valueRUSD: number }>,
): MarketSettlementResult {
  const dayIndex = marketDays[0]?.dayIndex;
  if (dayIndex === undefined) throw new RangeError("settlement requires a market-day result");
  const marketIds = marketDays.map((marketDay) => marketDay.marketId);
  const marketId = marketIds[0];
  if (marketId === undefined) throw new RangeError("settlement requires a market-day result");
  const index = buildFinanceIndex(world.finance);
  // D-158: settlement posts the money flows a market run attached to its result; the
  // validated transaction list is built only for full detail, where it is reported. A result
  // without them (a copy or a hand-built result: the flows are a non-enumerable companion)
  // is settled from its own transaction list, validated first.
  const flows = marketDays.map((marketDay) => {
    const columns = marketDay.columns?.flows;
    if (columns !== undefined) return columns;
    return flowsOfTransactions(prepareTransactions(world, definitions, index, [transactionChunk(marketDay)]));
  });
  const transactions =
    detail === "full" ? prepareTransactions(world, definitions, index, marketDays.map(transactionChunk)) : null;

  // Opening balances in account order, restored on failure when the call owns its
  // atomicity (no account is created during settlement). D-139: the integrated day
  // passes `atomic: false`: its runner (phase mode) or staged copy (staged mode) owns
  // atomicity, so the 100k-account copy is skipped. The opening cash of each
  // producer and household is read before any posting either way.
  const accounts = world.finance.accounts;
  const openingBalanceArray: Float64Array | null = atomic ? accounts.balance.slice(0, accounts.count) : null;
  const balanceOfId = (accountId: Id): number => {
    const position = index.position(accountId);
    return position < 0 ? 0 : (accounts.balance[position] ?? 0);
  };
  // D-160: opening cash by building id and block id (the former map keyed each by its cash
  // account id, one account per building and block); an absent account reads 0 as before.
  let maxBuildingId = 0;
  for (const building of world.buildings) if (building.id > maxBuildingId) maxBuildingId = building.id;
  let maxBlockId = 0;
  for (const block of world.popBlocks) if (block.id > maxBlockId) maxBlockId = block.id;
  const openingBuildingCash = new Float64Array(maxBuildingId + 1);
  for (const building of world.buildings) {
    openingBuildingCash[building.id] = balanceOfId(building.operatingCashAccountId);
  }
  const householdCashIds = index.ownerAccountIds("popBlock", "household-cash");
  const openingBlockCash = new Float64Array(maxBlockId + 1);
  for (const block of world.popBlocks) {
    const accountId = tableAccount(householdCashIds, block.id);
    if (accountId >= 0) openingBlockCash[block.id] = balanceOfId(accountId);
  }
  const initialCash = designatedCashTotal(world.finance);
  // The audit buffer is restored only by an atomic call (D-139: the day owns atomicity).
  const openingPostings = atomic ? [...world.finance.postings] : world.finance.postings;
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
    void goodCount;
    const market = marketFlowEntries(world, index, marketDays, flows);
    if (market.entries.length > 0) {
      marketPostings = postJournalColumns(world.finance, dayIndex, market.entries, market.lines);
    }

    const professions = new Map(definitions.professions.map((profession) => [profession.id, profession]));
    const buildingDefinitions = new Map(
      definitions.buildings.map((definition) => [definition.id, definition]),
    );
    const yearDays = daysInYear(dayIndexToCivilDate(dayIndex).year);
    const wageSettlements: WageSettlement[] = [];
    const wageLookup = buildWageLookup(world);
    const labourWages = buildLabourWageTable(world, definitions);
    // D-158: wages in columns. Per building, the groups (one per worker block, merged and in
    // block-id order), the in-kind deduction, the proportional allocation of what the
    // employer can pay with its keyed residual and ulp guards, and one "wages" entry in
    // journal columns: the same rules as the former object path. Per-building and per-block
    // totals go into id-indexed tables; the per-building objects are built in full detail only.
    let maxWageBuilding = 0;
    for (const building of world.buildings) if (building.id > maxWageBuilding) maxWageBuilding = building.id;
    let maxWageBlock = 0;
    for (const block of world.popBlocks) if (block.id > maxWageBlock) maxWageBlock = block.id;
    const wagePaidByBuilding = new Float64Array(maxWageBuilding + 1);
    const wageObligationOfBuilding = new Float64Array(maxWageBuilding + 1);
    const wageUnpaidByBuilding = new Float64Array(maxWageBuilding + 1);
    const wagePaidByBlock = new Float64Array(maxWageBlock + 1);
    let wageObligationTotal = 0;
    let wagePaidTotal = 0;
    let wageUnpaidTotal = 0;
    const householdCashTable = index.ownerAccountIds("popBlock", "household-cash");
    const wageIncomeTable = index.ownerAccountIds("popBlock", "wage-income");
    const operatingTable = index.ownerAccountIds("building", "operating-cash");
    const wageExpenseTable = index.ownerAccountIds("building", "wage-expense");
    const hoursByCountry = new Map<Id, number>();
    // D-158: the paid wage of a (province, profession, covered) job and whether a building
    // definition's job is covered under a coverage rule, each derived once per settlement.
    let stride = 1;
    for (const profession of definitions.professions) if (profession.id + 1 > stride) stride = profession.id + 1;
    const paidWage = new Map<number, number>();
    const coveredJob = new Map<MinimumWageCoverage, Map<number, boolean>>();
    const wageEntries: JournalColumnEntry[] = [];
    // D-160: typed line columns; a building's wage entry has at most two lines per assignment
    // and two more, so this capacity is never exceeded.
    const wageLines = createJournalLines(2 * world.employment.length + 2 * world.buildings.length);
    // Groups of the current building (scratch). D-160: typed columns with a fill count `gCount`
    // (they were cleared with `length = 0` per building, which drops their storage); they double
    // when a building has more groups than they hold.
    let gBlock: Float64Array = new Float64Array(16);
    let gProfession: Float64Array = new Float64Array(16);
    let gWorkers: Float64Array = new Float64Array(16);
    let gAccount: Float64Array = new Float64Array(16);
    let gObligation: Float64Array = new Float64Array(16);
    let gInKind: Float64Array = new Float64Array(16);
    let gPaid: Float64Array = new Float64Array(16);
    let gCount = 0;
    const grownGroups = (column: Float64Array): Float64Array => {
      const grown = new Float64Array(column.length * 2);
      grown.set(column);
      return grown;
    };
    const accountIn = (table: Int32Array, ownerId: number, what: string): number => {
      const id = tableAccount(table, ownerId);
      if (id < 0) throw new RangeError(`missing ${what} account for ${String(ownerId)}`);
      return id;
    };
    for (const building of inIdOrder(world.buildings)) {
      if (!building.operational) continue;
      const definition = buildingDefinitions.get(building.definitionId);
      if (definition === undefined) {
        throw new RangeError(`building ${String(building.id)} has no definition`);
      }
      const owner = wageLookup.ownerByProvince.get(building.provinceId);
      let hoursFactor = 1;
      if (owner !== undefined) {
        const known = hoursByCountry.get(owner.id);
        if (known === undefined) {
          hoursFactor = laborHoursFactor(owner, definitions);
          hoursByCountry.set(owner.id, hoursFactor);
        } else {
          hoursFactor = known;
        }
      }
      gCount = 0;
      // P7 (D-154, R2): a block working in a building it owns is paid the building's residual.
      const ownerPosition = index.position(building.ownerAccountId);
      const ownerBlockId =
        ownerPosition >= 0 && accounts.ownerKind[ownerPosition] === POP_BLOCK_KIND
          ? accountOwnerIdAt(accounts, ownerPosition)
          : null;
      const coverage = labourWages.coverage(building.provinceId);
      for (const assignment of wageLookup.assignmentsByBuilding.get(building.id) ?? NO_WAGE_ASSIGNMENTS) {
        const block = wageLookup.blockById.get(assignment.popBlockId);
        if (block === undefined) throw new RangeError("employment assignment references an unknown block");
        if (ownerBlockId !== null && ownerBlockId === block.id) continue;
        const profession = professions.get(assignment.professionId);
        if (profession === undefined) throw new RangeError("employment assignment references an unknown profession");
        let coveredBy = coveredJob.get(coverage);
        if (coveredBy === undefined) {
          coveredBy = new Map();
          coveredJob.set(coverage, coveredBy);
        }
        const jobKey = definition.id * stride + profession.id;
        let covered = coveredBy.get(jobKey);
        if (covered === undefined) {
          covered = jobIsCovered(definition, profession, coverage, labourWages.domesticServiceKeys);
          coveredBy.set(jobKey, covered);
        }
        const wageKey = (building.provinceId * stride + profession.id) * 2 + (covered ? 1 : 0);
        let annualBase = paidWage.get(wageKey);
        if (annualBase === undefined) {
          annualBase = labourWages.paid(building.provinceId, profession.id, covered);
          paidWage.set(wageKey, annualBase);
        }
        const dailyWage = (annualBase * hoursFactor * qualificationWageFactor(block)) / yearDays;
        if (!Number.isFinite(dailyWage) || !(dailyWage > 0)) {
          throw new RangeError(`invalid daily wage for profession ${String(profession.id)}`);
        }
        const obligation = dailyWage * assignment.workers;
        let group = -1;
        for (let item = 0; item < gCount; item += 1) if (gBlock[item] === block.id) group = item;
        if (group < 0) {
          // Insert in block-id order (shift the later groups up by one).
          let at = gCount;
          if (gCount === gBlock.length) {
            gBlock = grownGroups(gBlock);
            gProfession = grownGroups(gProfession);
            gWorkers = grownGroups(gWorkers);
            gAccount = grownGroups(gAccount);
            gObligation = grownGroups(gObligation);
            gInKind = grownGroups(gInKind);
            gPaid = grownGroups(gPaid);
          }
          gCount += 1;
          while (at > 0 && (gBlock[at - 1] ?? 0) > block.id) {
            gBlock[at] = gBlock[at - 1] ?? 0;
            gProfession[at] = gProfession[at - 1] ?? 0;
            gWorkers[at] = gWorkers[at - 1] ?? 0;
            gAccount[at] = gAccount[at - 1] ?? 0;
            gObligation[at] = gObligation[at - 1] ?? 0;
            gInKind[at] = gInKind[at - 1] ?? 0;
            at -= 1;
          }
          gBlock[at] = block.id;
          gProfession[at] = profession.id;
          gWorkers[at] = assignment.workers;
          gAccount[at] = accountIn(householdCashTable, block.id, "household-cash");
          gObligation[at] = obligation;
          gInKind[at] = 0;
        } else {
          gWorkers[group] = (gWorkers[group] ?? 0) + assignment.workers;
          gObligation[group] = (gObligation[group] ?? 0) + obligation;
        }
      }
      const groupCount = gCount;
      if (groupCount === 0) continue;
      // P5 (D-143 §2): the owner block's kept food is a wage in kind, up to its cash wage here.
      const inKind = inKindWages?.get(building.id);
      if (inKind !== undefined && inKind.valueRUSD > 0) {
        for (let item = 0; item < groupCount; item += 1) {
          if (gBlock[item] !== inKind.popBlockId) continue;
          const applied = Math.min(gObligation[item] ?? 0, inKind.valueRUSD);
          if (!(applied > 0)) continue;
          gObligation[item] = (gObligation[item] ?? 0) - applied;
          gInKind[item] = applied;
        }
      }
      let obligation = 0;
      for (let item = 0; item < groupCount; item += 1) obligation += gObligation[item] ?? 0;
      const employerId = accountIn(operatingTable, building.id, "operating-cash");
      // D-158: the employer's balance, read once (nothing posts until the loop has run).
      const employer = { id: employerId, balanceRUSD: balanceOfId(employerId) };
      const paid = Math.min(employer.balanceRUSD, obligation);
      // Proportional allocation with the keyed residual (allocateMoney).
      for (let item = 0; item < groupCount; item += 1) gPaid[item] = 0;
      if (paid > 0 && obligation > 0) {
        let allocated = 0;
        for (let item = 0; item < groupCount; item += 1) {
          const quantity = (paid * (gObligation[item] ?? 0)) / obligation;
          gPaid[item] = quantity;
          allocated += quantity;
        }
        let residual = paid - allocated;
        if (Math.abs(residual) > toleranceMoney(residual)) {
          const order = Array.from(gBlock.subarray(0, groupCount), (blockId, item) => ({
              item,
              blockId,
              key: drawUint32({ seed: world.seed, day: dayIndex, entityId: blockId, purpose: M3E_WAGE_RESIDUAL_PURPOSE, drawIndex: 0 }),
            }))
            .sort((left, right) => left.key - right.key || left.blockId - right.blockId);
          for (let attempt = 0; attempt < order.length && Math.abs(residual) > toleranceMoney(residual); attempt += 1) {
            const item = (order[attempt] as { item: number }).item;
            const current = gPaid[item] ?? 0;
            if (residual > 0) {
              gPaid[item] = current + residual;
              residual = 0;
            } else if (current >= -residual) {
              gPaid[item] = current + residual;
              residual = 0;
            }
          }
          if (Math.abs(residual) > toleranceMoney(residual)) throw new RangeError("wage residual allocation failed");
        }
      }
      let paidTotal = 0;
      for (let item = 0; item < groupCount; item += 1) paidTotal += gPaid[item] ?? 0;
      if (paidTotal > employer.balanceRUSD) {
        let excess = paidTotal - employer.balanceRUSD;
        for (let item = groupCount - 1; item >= 0 && excess > 0; item -= 1) {
          const reduction = Math.min(gPaid[item] ?? 0, excess);
          if (reduction <= 0) continue;
          gPaid[item] = (gPaid[item] ?? 0) - reduction;
          excess -= reduction;
        }
        paidTotal = 0;
        for (let item = 0; item < groupCount; item += 1) paidTotal += gPaid[item] ?? 0;
      }
      // Proportional allocation can exceed the employer balance by an ulp or two; step down by at
      // least one representable ulp until the total is affordable (the rest stays unpaid).
      let roundingGuard = 0;
      while (paidTotal > employer.balanceRUSD && roundingGuard < 32) {
        let reduced = false;
        for (let item = groupCount - 1; item >= 0 && !reduced; item -= 1) {
          const current = gPaid[item] ?? 0;
          if (current <= 0) continue;
          const step = Math.max(paidTotal - employer.balanceRUSD, Math.abs(current) * Number.EPSILON * 2);
          const nextPaid = current - Math.min(current, step);
          if (!(nextPaid < current)) continue;
          gPaid[item] = nextPaid;
          reduced = true;
        }
        if (!reduced) break;
        paidTotal = 0;
        for (let item = 0; item < groupCount; item += 1) paidTotal += gPaid[item] ?? 0;
        roundingGuard += 1;
      }
      if (paidTotal > employer.balanceRUSD + toleranceMoney(paidTotal, employer.balanceRUSD)) {
        throw new RangeError(`wage payment exceeds employer cash for building ${String(building.id)}`);
      }
      if (paidTotal > 0) {
        const start = wageLines.count;
        for (let item = 0; item < groupCount; item += 1) {
          const amount = gPaid[item] ?? 0;
          if (amount <= 0) continue;
          pushJournalLine(wageLines, gAccount[item] ?? 0, 1, amount);
        }
        pushJournalLine(wageLines, accountIn(wageExpenseTable, building.id, "wage-expense"), 1, paidTotal);
        pushJournalLine(wageLines, employer.id, 0, paidTotal);
        for (let item = 0; item < groupCount; item += 1) {
          const amount = gPaid[item] ?? 0;
          if (amount <= 0) continue;
          pushJournalLine(wageLines, accountIn(wageIncomeTable, gBlock[item] ?? 0, "wage-income"), 0, amount);
        }
        wageEntries.push({
          transactionKind: "wages",
          start,
          end: wageLines.count,
          sourceEntityId: building.id,
          targetEntityId: null,
        });
      }
      for (let item = 0; item < groupCount; item += 1) {
        const blockId = gBlock[item] ?? 0;
        wagePaidByBlock[blockId] = (wagePaidByBlock[blockId] ?? 0) + (gPaid[item] ?? 0);
      }
      wagePaidByBuilding[building.id] = paidTotal;
      wageObligationOfBuilding[building.id] = obligation;
      wageUnpaidByBuilding[building.id] = Math.max(0, obligation - paidTotal);
      wageObligationTotal += obligation;
      wagePaidTotal += paidTotal;
      wageUnpaidTotal += Math.max(0, obligation - paidTotal);
      if (detail === "full") {
        const payments: WagePayment[] = [];
        for (let item = 0; item < groupCount; item += 1) {
          const paidRUSD = gPaid[item] ?? 0;
          const obligationRUSD = gObligation[item] ?? 0;
          payments.push({
            popBlockId: gBlock[item] ?? 0,
            professionId: gProfession[item] ?? 0,
            workers: gWorkers[item] ?? 0,
            accountId: gAccount[item] ?? 0,
            obligationRUSD,
            ...((gInKind[item] ?? 0) > 0 ? { paidInKindRUSD: gInKind[item] ?? 0 } : {}),
            paidRUSD,
            unpaidRUSD: Math.max(0, obligationRUSD - paidRUSD),
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
    }
    let wagePostings: DeferredPostings | null = null;
    if (wageEntries.length > 0) {
      wagePostings = postJournalColumns(world.finance, dayIndex, wageEntries, wageLines);
    }
    // P7 (D-154, docs/P7_EMPLOYERS_PROPOSAL.md §4.1): households pay their domestic servants the
    // province's paid wage of the servant's profession × DOMESTIC_WAGE_RATIO, from the employer's
    // household cash (consumption of the employer, wage income of the servant). The employer
    // pays from the cash it held before today's wages: today's wages stay in its account for
    // the fiscal phase, whose income tax is a share of them. An employer without such cash
    // leaves the day unpaid; the next refresh rehires by income.
    // D-158: the domestic-service entries in journal columns (the same lines, in the same
    // order, posted as one batch with the same checks as the former entry objects).
    const householdEntries: JournalColumnEntry[] = [];
    const householdLines = createJournalLines(4 * world.labourMarket.householdEmployment.length);
    const consumptionTable = index.ownerAccountIds("popBlock", "consumption-expense");
    const spent = new Map<Id, number>();
    const domesticReceived = new Map<Id, number>();
    if (labourWages !== undefined && world.labourMarket.householdEmployment.length > 0) {
      for (const assignment of world.labourMarket.householdEmployment) {
        const servant = wageLookup.blockById.get(assignment.popBlockId);
        const employer = wageLookup.blockById.get(assignment.employerBlockId);
        if (servant === undefined || employer === undefined) continue;
        const covered = labourWages.coverage(servant.provinceId).domesticService;
        const annual = labourWages.paid(servant.provinceId, servant.professionId, covered) * DOMESTIC_WAGE_RATIO;
        const obligation = (annual * assignment.workers) / yearDays;
        const employerCashId = householdCashId(index, householdCashTable, employer.id);
        const employerCash = { id: employerCashId, balanceRUSD: balanceOfId(employerCashId) };
        const prior = spent.get(employer.id) ?? 0;
        const limit = Math.max(0, employerCash.balanceRUSD - (wagePaidByBlock[employer.id] ?? 0));
        let paid = Math.min(obligation, Math.max(0, limit - prior));
        // The batch debits the employer's cash by the running sum of its payments; when the
        // employer pays out its last spendable cash, `prior + paid` can exceed the limit by an
        // ulp. As for wages above, step down by at least one ulp until the sum is affordable;
        // the difference stays unpaid.
        let roundingGuard = 0;
        while (paid > 0 && prior + paid > limit && roundingGuard < 32) {
          paid = Math.max(0, paid - Math.max(prior + paid - limit, Math.abs(paid) * Number.EPSILON * 2));
          roundingGuard += 1;
        }
        if (!Number.isFinite(paid) || !(paid > 0) || prior + paid > limit) continue;
        spent.set(employer.id, prior + paid);
        domesticReceived.set(servant.id, (domesticReceived.get(servant.id) ?? 0) + paid);
        const start = householdLines.count;
        const consumptionId = ownerAccountOrThrow(consumptionTable, employer.id, "consumption-expense", "popBlock");
        const servantCashId = householdCashId(index, householdCashTable, servant.id);
        const servantIncomeId = ownerAccountOrThrow(wageIncomeTable, servant.id, "wage-income", "popBlock");
        pushJournalLine(householdLines, consumptionId, 1, paid);
        pushJournalLine(householdLines, employerCash.id, 0, paid);
        pushJournalLine(householdLines, servantCashId, 1, paid);
        pushJournalLine(householdLines, servantIncomeId, 0, paid);
        householdEntries.push({
          transactionKind: "domestic-service",
          start,
          end: householdLines.count,
          sourceEntityId: employer.id,
          targetEntityId: servant.id,
        });
      }
    }
    let householdPostings: DeferredPostings | null = null;
    if (householdEntries.length > 0) {
      householdPostings = postJournalColumns(world.finance, dayIndex, householdEntries, householdLines);
    }

    const upkeepSettlements: UpkeepSettlement[] = [];
    // D-158: upkeep entries in journal columns (same lines and order, one batch as before).
    const upkeepEntries: JournalColumnEntry[] = [];
    const upkeepLines = createJournalLines(4 * world.buildings.length);
    const upkeepExpenseTable = index.ownerAccountIds("building", "upkeep-expense");
    // D-160: per-building upkeep by id (0 for a building without upkeep, as the maps' `?? 0`)
    // and the totals summed in settlement order; the objects are built in full detail only.
    const upkeepPaidByBuilding = new Float64Array(maxBuildingId + 1);
    const upkeepObligationByBuilding = new Float64Array(maxBuildingId + 1);
    const unpaidUpkeepByBuilding = new Float64Array(maxBuildingId + 1);
    let upkeepObligationTotal = 0;
    let upkeepPaidTotal = 0;
    let upkeepUnpaidTotal = 0;
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
      const employerId = operatingCashId(index, operatingTable, building.id);
      const employer = { id: employerId, balanceRUSD: balanceOfId(employerId) };
      const paid = Math.min(employer.balanceRUSD, obligation);
      const unpaid = Math.max(0, obligation - paid);
      if (paid > 0) {
        const start = upkeepLines.count;
        const upkeepExpenseId = ownerAccountOrThrow(upkeepExpenseTable, building.id, "upkeep-expense", "building");
        pushJournalLine(upkeepLines, systemAccount.id, 1, paid);
        pushJournalLine(upkeepLines, upkeepExpenseId, 1, paid);
        pushJournalLine(upkeepLines, employer.id, 0, paid);
        pushJournalLine(upkeepLines, systemIncome!.id, 0, paid);
        upkeepEntries.push({
          transactionKind: "upkeep",
          start,
          end: upkeepLines.count,
          sourceEntityId: building.id,
          targetEntityId: systemAccount.id,
        });
      }
      if (detail === "full") {
        upkeepSettlements.push({
          buildingId: building.id,
          operatingAccountId: employer.id,
          systemAccountId: systemAccount.id,
          obligationRUSD: obligation,
          paidRUSD: paid,
          unpaidRUSD: unpaid,
        });
      }
      upkeepObligationTotal += obligation;
      upkeepPaidTotal += paid;
      upkeepUnpaidTotal += unpaid;
      upkeepPaidByBuilding[building.id] = paid;
      upkeepObligationByBuilding[building.id] = obligation;
      unpaidUpkeepByBuilding[building.id] = unpaid;
    }
    let upkeepPostings: DeferredPostings | null = null;
    if (upkeepEntries.length > 0) {
      upkeepPostings = postJournalColumns(world.finance, dayIndex, upkeepEntries, upkeepLines);
    }
    if (marketPostings !== null) {
      retainDeferredPostings(world.finance, marketPostings, wageEntries.length + householdEntries.length + upkeepEntries.length);
    }
    if (wagePostings !== null) {
      retainDeferredPostings(world.finance, wagePostings, householdEntries.length + upkeepEntries.length);
    }
    if (householdPostings !== null) {
      retainDeferredPostings(world.finance, householdPostings, upkeepEntries.length);
    }
    if (upkeepPostings !== null) retainDeferredPostings(world.finance, upkeepPostings, 0);

    // D-139: per-owner sums in canonical transaction order, in id-indexed tables. A
    // table entry starts at 0 and adds each amount, as the former `get ?? 0` maps did.
    // D-158: the same per-owner sums from the markets' flows, in market and flow order.
    const revenueByBuilding = new Float64Array(maxBuildingId + 1);
    const inputCostsByBuilding = new Float64Array(maxBuildingId + 1);
    const purchasesByBlock = new Float64Array(maxBlockId + 1);
    let householdPurchasesTotal = 0;
    let inputPurchasesTotal = 0;
    for (const flow of flows) {
      for (let row = 0; row < flow.householdSpend.length; row += 1) {
        const amount = flow.householdSpend[row] ?? 0;
        if (!(amount > 0)) continue;
        const blockId = flow.householdBuyer[row] ?? 0;
        purchasesByBlock[blockId] = (purchasesByBlock[blockId] ?? 0) + amount;
        householdPurchasesTotal += amount;
      }
      for (let item = 0; item < flow.householdSellerId.length; item += 1) {
        const sellerId = flow.householdSellerId[item] ?? 0;
        revenueByBuilding[sellerId] = (revenueByBuilding[sellerId] ?? 0) + (flow.householdSellerAmount[item] ?? 0);
      }
      for (let item = 0; item < flow.inputBuyer.length; item += 1) {
        const amount = flow.inputAmount[item] ?? 0;
        const buyerId = flow.inputBuyer[item] ?? 0;
        const sellerId = flow.inputSeller[item] ?? 0;
        inputCostsByBuilding[buyerId] = (inputCostsByBuilding[buyerId] ?? 0) + amount;
        revenueByBuilding[sellerId] = (revenueByBuilding[sellerId] ?? 0) + amount;
        inputPurchasesTotal += amount;
      }
    }
    const marketPurchasesTotal = householdPurchasesTotal + inputPurchasesTotal;

    // D-160: each producer's reconciliation and the producer totals (summed in id order, as the
    // former reductions over the list); the objects are built in full detail only.
    // The per-building and per-block bodies are functions of their own, so they run optimised
    // (a once-a-day loop body otherwise runs in on-stack-replacement code that de-optimises at
    // each loop exit and boxes its numbers); the totals accumulate in a typed array for the same
    // reason. Sums: revenue, input costs, wages, profit.
    const producers: ProducerSettlement[] = [];
    const producerSums = new Float64Array(4);
    const settleProducer = (building: World["buildings"][number]): void => {
      const initialCash = openingBuildingCash[building.id] ?? 0;
      const currentId = operatingCashId(index, operatingTable, building.id);
      const currentBalance = balanceOfId(currentId);
      const revenue = revenueByBuilding[building.id] ?? 0;
      const inputCosts = inputCostsByBuilding[building.id] ?? 0;
      const wagesPaid = wagePaidByBuilding[building.id] ?? 0;
      const upkeepPaid = upkeepPaidByBuilding[building.id] ?? 0;
      const profit = producerProfit(initialCash, currentBalance, revenue, inputCosts, wagesPaid, upkeepPaid);
      producerSums[0] = (producerSums[0] ?? 0) + revenue;
      producerSums[1] = (producerSums[1] ?? 0) + inputCosts;
      producerSums[2] = (producerSums[2] ?? 0) + wagesPaid;
      producerSums[3] = (producerSums[3] ?? 0) + profit;
      if (detail !== "full") return;
      producers.push({
        buildingId: building.id,
        ownerAccountId: building.ownerAccountId,
        operatingAccountId: building.operatingCashAccountId,
        initialCashRUSD: initialCash,
        revenueRUSD: revenue,
        inputCostsRUSD: inputCosts,
        wagesPaidRUSD: wagesPaid,
        wageObligationRUSD: wageObligationOfBuilding[building.id] ?? 0,
        unpaidWagesRUSD: wageUnpaidByBuilding[building.id] ?? 0,
        upkeepPaidRUSD: upkeepPaid,
        upkeepObligationRUSD: upkeepObligationByBuilding[building.id] ?? 0,
        unpaidUpkeepRUSD: unpaidUpkeepByBuilding[building.id] ?? 0,
        profitRUSD: profit,
        endingCashAfterSettlementRUSD: currentBalance,
      });
    };
    for (const building of inIdOrder(world.buildings)) settleProducer(building);
    const producerRevenueTotal = producerSums[0] ?? 0;
    const producerInputCostsTotal = producerSums[1] ?? 0;
    const producerWagesTotal = producerSums[2] ?? 0;
    const producerProfitTotal = producerSums[3] ?? 0;

    // D-160: the household settlement in columns by block id (every detail); the objects in
    // full detail only.
    const householdColumns: SettlementHouseholdColumns = {
      settled: new Uint8Array(maxBlockId + 1),
      initialCashRUSD: new Float64Array(maxBlockId + 1),
      marketPurchasesRUSD: new Float64Array(maxBlockId + 1),
      wagesReceivedRUSD: new Float64Array(maxBlockId + 1),
      endingCashAfterSettlementRUSD: new Float64Array(maxBlockId + 1),
    };
    const households: HouseholdSettlement[] = [];
    const settleHousehold = (block: World["popBlocks"][number]): void => {
      const accountId = householdCashId(index, householdCashTable, block.id);
      const balance = balanceOfId(accountId);
      const initialCash = openingBlockCash[block.id] ?? 0;
      const purchases = purchasesByBlock[block.id] ?? 0;
      // §4.1: a servant's pay is wage income; an employer's is household spending outside the market.
      const wages = (wagePaidByBlock[block.id] ?? 0) + (domesticReceived.get(block.id) ?? 0);
      const expected = initialCash - purchases - (spent.get(block.id) ?? 0) + wages;
      if (Math.abs(expected - balance) > toleranceMoney(expected, balance)) {
        throw new RangeError(`household cash does not reconcile for popBlock ${String(block.id)}`);
      }
      householdColumns.settled[block.id] = 1;
      householdColumns.initialCashRUSD[block.id] = initialCash;
      householdColumns.marketPurchasesRUSD[block.id] = purchases;
      householdColumns.wagesReceivedRUSD[block.id] = wages;
      householdColumns.endingCashAfterSettlementRUSD[block.id] = balance;
      if (detail !== "full") return;
      households.push({
        popBlockId: block.id,
        financialAccountId: accountId,
        initialCashRUSD: initialCash,
        marketPurchasesRUSD: purchases,
        wagesReceivedRUSD: wages,
        endingCashAfterSettlementRUSD: balance,
      });
    };
    for (const block of inIdOrder(world.popBlocks)) settleHousehold(block);

    const endingCash = designatedCashTotal(world.finance);
    if (Math.abs(initialCash - endingCash) > toleranceMoney(initialCash, endingCash)) {
      throw new RangeError("market settlement did not conserve aggregate cash");
    }

    const totals: SettlementTotals = {
      marketPurchasesRUSD: marketPurchasesTotal,
      householdPurchasesRUSD: householdPurchasesTotal,
      inputPurchasesRUSD: inputPurchasesTotal,
      wageObligationRUSD: wageObligationTotal,
      wagesPaidRUSD: wagePaidTotal,
      unpaidWagesRUSD: wageUnpaidTotal,
      upkeepObligationRUSD: upkeepObligationTotal,
      upkeepPaidRUSD: upkeepPaidTotal,
      unpaidUpkeepRUSD: upkeepUnpaidTotal,
      producerRevenueRUSD: producerRevenueTotal,
      producerInputCostsRUSD: producerInputCostsTotal,
      producerWagesRUSD: producerWagesTotal,
      producerProfitRUSD: producerProfitTotal,
      initialCashRUSD: initialCash,
      endingCashAfterSettlementRUSD: endingCash,
    };

    // D-160: the posting ids in one list (the same ids, in batch order).
    const postingIds: number[] = [];
    for (const batch of [marketPostings, wagePostings, householdPostings, upkeepPostings]) {
      if (batch === null) continue;
      for (let offset = 0; offset < batch.count; offset += 1) postingIds.push(batch.firstId + offset);
    }
    for (const posting of postings) postingIds.push(posting.id);

    const settlementResult: MarketSettlementResult = {
      dayIndex,
      marketId,
      marketIds,
      worldSeed: world.seed,
      scenarioId: world.scenarioId,
      startDayIndex: world.startDayIndex,
      settlementNextPostingId: world.finance.nextPostingId,
      fiscalApplied: false,
      transactions: transactions === null ? [] : settledTransactions(transactions),
      wages: wageSettlements,
      upkeep: upkeepSettlements,
      producers,
      households,
      totals,
      postingIds,
    };
    Object.defineProperty(settlementResult, SETTLEMENT_COLUMNS, {
      value: householdColumns,
      enumerable: false,
      writable: false,
    });
    return settlementResult;
  } catch (error) {
    if (openingBalanceArray === null) throw error;
    if (accounts.count !== openingBalanceArray.length) {
      throw new RangeError("settlement rollback found accounts created during settlement");
    }
    accounts.balance.set(openingBalanceArray);
    world.finance.postings = openingPostings;
    world.finance.nextPostingId = openingNextPostingId;
    throw error;
  }
}
