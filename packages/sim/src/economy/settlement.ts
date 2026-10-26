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
import { MONEY_TOLERANCE_SUSD } from "../population/constants.js";
import { drawUint32 } from "../rng.js";
import type { DayIndex, Id, Seed } from "../types.js";
import { assertValidWorld, type World } from "../world.js";
import {
  postJournalBatch,
  type JournalEntryInput,
} from "./accounting.js";
import {
  buildFinanceIndex,
  designatedCashTotal,
  isCashAccount,
  type FinanceIndex,
} from "./accounts.js";
import { assertValidEconomyDefinitions } from "./definitions.js";
import { assertValidEmploymentState } from "./employment.js";
import type {
  MarketDayResult,
  MarketTier,
  PendingTransaction,
} from "./market.js";
import type {
  BuildingInstance,
  EconomyDefinitions,
  FinancialAccount,
  JournalLine,
  JournalPosting,
  ProfessionDef,
} from "./types.js";

export const M3E_WAGE_RESIDUAL_PURPOSE = "settlement.wage-residual";

export interface SettledMarketTransaction {
  readonly kind: "household-purchase" | "input-purchase";
  readonly buyerPopBlockId: number | null;
  readonly buyerBuildingId: number | null;
  readonly sellerBuildingId: number;
  readonly goodId: number;
  readonly quantity: number;
  readonly unitPriceSUSD: number;
  readonly totalSUSD: number;
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
  readonly obligationSUSD: number;
  readonly paidSUSD: number;
  readonly unpaidSUSD: number;
}

export interface WageSettlement {
  readonly buildingId: Id;
  readonly operatingAccountId: Id;
  readonly obligationSUSD: number;
  readonly paidSUSD: number;
  readonly unpaidSUSD: number;
  readonly payments: readonly WagePayment[];
}

export interface UpkeepSettlement {
  readonly buildingId: Id;
  readonly operatingAccountId: Id;
  readonly systemAccountId: Id;
  readonly obligationSUSD: number;
  readonly paidSUSD: number;
  readonly unpaidSUSD: number;
}

export interface ProducerSettlement {
  readonly buildingId: Id;
  readonly ownerAccountId: Id;
  readonly operatingAccountId: Id;
  readonly initialCashSUSD: number;
  readonly revenueSUSD: number;
  readonly inputCostsSUSD: number;
  readonly wagesPaidSUSD: number;
  readonly wageObligationSUSD: number;
  readonly unpaidWagesSUSD: number;
  readonly upkeepPaidSUSD: number;
  readonly upkeepObligationSUSD: number;
  readonly unpaidUpkeepSUSD: number;
  readonly profitSUSD: number;
  /** Building cash after market/wages/upkeep settlement (fiscal does not touch it). */
  readonly endingCashAfterSettlementSUSD: number;
}

export interface HouseholdSettlement {
  readonly popBlockId: Id;
  readonly financialAccountId: Id;
  readonly initialCashSUSD: number;
  readonly marketPurchasesSUSD: number;
  readonly wagesReceivedSUSD: number;
  /** Household cash after market/wages/upkeep settlement, before the fiscal phase. */
  readonly endingCashAfterSettlementSUSD: number;
}

export interface SettlementTotals {
  readonly marketPurchasesSUSD: number;
  readonly householdPurchasesSUSD: number;
  readonly inputPurchasesSUSD: number;
  readonly wageObligationSUSD: number;
  readonly wagesPaidSUSD: number;
  readonly unpaidWagesSUSD: number;
  readonly upkeepObligationSUSD: number;
  readonly upkeepPaidSUSD: number;
  readonly unpaidUpkeepSUSD: number;
  readonly producerRevenueSUSD: number;
  readonly producerInputCostsSUSD: number;
  readonly producerWagesSUSD: number;
  readonly producerProfitSUSD: number;
  readonly initialCashSUSD: number;
  /** Aggregate cash after settlement; income tax and welfare are applied later. */
  readonly endingCashAfterSettlementSUSD: number;
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

interface PreparedTransaction extends SettledMarketTransaction {
  readonly key: string;
  readonly transactionKind: "goods-purchase" | "input-purchase";
  readonly buyerExpenseAccountId: Id;
  readonly sellerRevenueAccountId: Id;
}

interface WageGroup {
  readonly popBlockId: Id;
  readonly professionId: Id;
  readonly workers: number;
  readonly accountId: Id;
  readonly obligationSUSD: number;
}

function toleranceMoney(...values: number[]): number {
  let scale = 1;
  for (const value of values) scale = Math.max(scale, Math.abs(value));
  return MONEY_TOLERANCE_SUSD * scale;
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

function assertTransactionAmount(transaction: PendingTransaction, path: string): void {
  for (const [name, value] of [
    ["quantity", transaction.quantity],
    ["unitPriceSUSD", transaction.unitPriceSUSD],
    ["totalSUSD", transaction.totalSUSD],
  ] as const) {
    if (!Number.isFinite(value) || !(value > 0)) {
      throw new RangeError(`${path}.${name} must be finite and strictly positive`);
    }
  }
  const expected = transaction.quantity * transaction.unitPriceSUSD;
  if (Math.abs(expected - transaction.totalSUSD) > toleranceMoney(expected, transaction.totalSUSD)) {
    throw new RangeError(`${path}.totalSUSD does not reconcile with quantity × unit price`);
  }
}

function transactionKey(transaction: PendingTransaction): string {
  const buyer =
    transaction.kind === "household-purchase"
      ? `household:${String(transaction.buyerPopBlockId)}`
      : `building:${String(transaction.buyerBuildingId)}`;
  return `${transaction.kind}:${buyer}:${String(transaction.sellerBuildingId)}:${String(transaction.goodId)}:${String(transaction.tier)}:${transaction.phase}`;
}

function prepareTransactions(
  world: World,
  definitions: EconomyDefinitions,
  index: FinanceIndex,
  transactions: readonly PendingTransaction[],
): PreparedTransaction[] {
  const goodIds = new Set(definitions.goods.map((good) => good.id));
  const buildingById = new Map(world.buildings.map((building) => [building.id, building]));
  const seen = new Set<string>();
  const prepared: PreparedTransaction[] = [];
  for (let index_ = 0; index_ < transactions.length; index_ += 1) {
    const transaction = transactions[index_];
    if (transaction === undefined) throw new RangeError(`pending transaction ${String(index_)} is missing`);
    const path = `pendingTransactions[${String(index_)}]`;
    assertTransactionAmount(transaction, path);
    if (!goodIds.has(transaction.goodId)) throw new RangeError(`${path}.goodId is unknown`);
    if (!buildingById.has(transaction.sellerBuildingId)) {
      throw new RangeError(`${path}.sellerBuildingId is unknown`);
    }
    const seller = operatingCash(index, transaction.sellerBuildingId);
    const sellerRevenue = index.get("building", transaction.sellerBuildingId, "sales-revenue");
    let buyer: FinancialAccount;
    let buyerExpense: FinancialAccount;
    if (transaction.kind === "household-purchase") {
      if (transaction.buyerPopBlockId === null || transaction.buyerBuildingId !== null) {
        throw new RangeError(`${path} must identify exactly one household buyer`);
      }
      buyer = householdCash(index, transaction.buyerPopBlockId);
      buyerExpense = index.get("popBlock", transaction.buyerPopBlockId, "consumption-expense");
    } else if (transaction.kind === "input-purchase") {
      if (transaction.buyerBuildingId === null || transaction.buyerPopBlockId !== null) {
        throw new RangeError(`${path} must identify exactly one building buyer`);
      }
      const buyerBuilding = buildingById.get(transaction.buyerBuildingId);
      if (buyerBuilding === undefined || !buyerBuilding.operational) {
        throw new RangeError(`${path}.buyerBuildingId must reference an operational building`);
      }
      buyer = operatingCash(index, transaction.buyerBuildingId);
      buyerExpense = index.get("building", transaction.buyerBuildingId, "input-expense");
    } else {
      throw new RangeError(`${path}.kind is invalid`);
    }
    if (![1, 2, 3, 5, 6].includes(transaction.tier)) {
      throw new RangeError(`${path}.tier is invalid`);
    }
    if (transaction.phase !== "A" && transaction.phase !== "B") {
      throw new RangeError(`${path}.phase must be A or B`);
    }
    const key = transactionKey(transaction);
    if (seen.has(key)) throw new RangeError(`duplicate pending transaction ${key}`);
    seen.add(key);
    prepared.push({
      ...transaction,
      buyerAccountId: buyer.id,
      sellerAccountId: seller.id,
      buyerExpenseAccountId: buyerExpense.id,
      sellerRevenueAccountId: sellerRevenue.id,
      transactionKind:
        transaction.kind === "household-purchase" ? "goods-purchase" : "input-purchase",
      key,
    });
  }
  prepared.sort((left, right) => (left.key < right.key ? -1 : left.key > right.key ? 1 : 0));
  return prepared;
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
  for (const group of groups) totalWeight += group.obligationSUSD;
  if (!(totalWeight > 0)) return allocations;
  let allocated = 0;
  for (const group of groups) {
    const quantity = (total * group.obligationSUSD) / totalWeight;
    allocations.set(group.popBlockId, quantity);
    allocated += quantity;
  }
  let residual = total - allocated;
  const order = [...groups].sort((left, right) => {
    const leftKey = drawUint32({
      seed: world.seed,
      day: dayIndex,
      entityId: left.popBlockId,
      purpose: M3E_WAGE_RESIDUAL_PURPOSE,
      drawIndex: 0,
    });
    const rightKey = drawUint32({
      seed: world.seed,
      day: dayIndex,
      entityId: right.popBlockId,
      purpose: M3E_WAGE_RESIDUAL_PURPOSE,
      drawIndex: 0,
    });
    return leftKey - rightKey || left.popBlockId - right.popBlockId;
  });
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

function buildWageGroups(
  world: World,
  building: BuildingInstance,
  professions: ReadonlyMap<Id, ProfessionDef>,
  index: FinanceIndex,
  yearDays: number,
): WageGroup[] {
  const groups = new Map<Id, WageGroup>();
  for (const assignment of world.employment) {
    if (assignment.buildingInstanceId !== building.id) continue;
    const block = world.popBlocks.find((candidate) => candidate.id === assignment.popBlockId);
    if (block === undefined) throw new RangeError("employment assignment references an unknown block");
    const profession = professions.get(assignment.professionId);
    if (profession === undefined) throw new RangeError("employment assignment references an unknown profession");
    const account = householdCash(index, block.id);
    const dailyWage = profession.baseWage1900SUSDPerYear / yearDays;
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
        obligationSUSD: obligation,
      });
    } else {
      groups.set(block.id, {
        ...current,
        workers: current.workers + assignment.workers,
        obligationSUSD: current.obligationSUSD + obligation,
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
 * Settle one or more M3d market-day results against authoritative financial
 * accounts. Market purchases must be fully funded in the aggregate batch; wages
 * and upkeep are paid once per day across every market.
 */
export function settleMarketDays(
  world: World,
  definitions: EconomyDefinitions,
  marketDays: readonly MarketDayResult[],
): MarketSettlementResult {
  assertValidWorld(world);
  assertValidEconomyDefinitions(definitions);
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
  assertValidDayIndex(world.dayIndex);
  if (isTerminalDayIndex(world.dayIndex)) {
    throw new RangeError("settlement cannot run at the terminal boundary");
  }
  assertValidEmploymentState(world, definitions);
  const sortedResults = [...marketDays].sort((left, right) => left.marketId - right.marketId);
  const result = settleMarketDaysInternal(world, definitions, sortedResults);
  for (const marketDay of marketDays) marketDay.settled = true;
  return result;
}

/** Settle one market-day result. Retained for the single-market M3/M4 callers. */
export function settleMarketDay(
  world: World,
  definitions: EconomyDefinitions,
  marketDay: MarketDayResult,
): MarketSettlementResult {
  return settleMarketDays(world, definitions, [marketDay]);
}

function settleMarketDaysInternal(
  world: World,
  definitions: EconomyDefinitions,
  marketDays: readonly MarketDayResult[],
): MarketSettlementResult {
  const dayIndex = marketDays[0]?.dayIndex;
  if (dayIndex === undefined) throw new RangeError("settlement requires a market-day result");
  const marketIds = marketDays.map((marketDay) => marketDay.marketId);
  const marketId = marketIds[0];
  if (marketId === undefined) throw new RangeError("settlement requires a market-day result");
  const pendingTransactions = marketDays.flatMap((marketDay) => marketDay.pendingTransactions);
  const index = buildFinanceIndex(world.finance);
  const transactions = prepareTransactions(world, definitions, index, pendingTransactions);

  const openingBalances = new Map<Id, number>();
  for (const account of world.finance.accounts) openingBalances.set(account.id, account.balanceSUSD);
  const openingPostings = [...world.finance.postings];
  const openingNextPostingId = world.finance.nextPostingId;

  const marketDeltas = new Map<Id, number>();
  for (const transaction of transactions) {
    marketDeltas.set(
      transaction.sellerAccountId,
      (marketDeltas.get(transaction.sellerAccountId) ?? 0) + transaction.totalSUSD,
    );
    marketDeltas.set(
      transaction.buyerAccountId,
      (marketDeltas.get(transaction.buyerAccountId) ?? 0) - transaction.totalSUSD,
    );
  }
  for (const [accountId, delta] of marketDeltas) {
    const account = index.byId.get(accountId);
    if (account === undefined) throw new RangeError(`unknown settlement account ${String(accountId)}`);
    if (account.balanceSUSD + delta < 0) {
      throw new RangeError(
        `insufficient funds; market settlement would overdraw account ${String(accountId)}`,
      );
    }
  }

  const postings: JournalPosting[] = [];
  try {
    if (transactions.length > 0) {
      const marketEntries: JournalEntryInput[] = transactions.map((transaction) => ({
        transactionKind: transaction.transactionKind,
        lines: [
          {
            accountId: transaction.buyerExpenseAccountId,
            side: "debit",
            amountSUSD: transaction.totalSUSD,
          },
          {
            accountId: transaction.sellerAccountId,
            side: "debit",
            amountSUSD: transaction.totalSUSD,
          },
          {
            accountId: transaction.buyerAccountId,
            side: "credit",
            amountSUSD: transaction.totalSUSD,
          },
          {
            accountId: transaction.sellerRevenueAccountId,
            side: "credit",
            amountSUSD: transaction.totalSUSD,
          },
        ],
        sourceEntityId: transaction.buyerPopBlockId ?? transaction.buyerBuildingId,
        targetEntityId: transaction.sellerBuildingId,
      }));
      postings.push(...postJournalBatch(world.finance, dayIndex, marketEntries));
    }

    const professions = new Map(definitions.professions.map((profession) => [profession.id, profession]));
    const buildingDefinitions = new Map(
      definitions.buildings.map((definition) => [definition.id, definition]),
    );
    const yearDays = daysInYear(dayIndexToCivilDate(dayIndex).year);
    const wageSettlements: WageSettlement[] = [];
    const wageEntries: JournalEntryInput[] = [];
    for (const building of [...world.buildings].sort((left, right) => left.id - right.id)) {
      if (!building.operational) continue;
      const definition = buildingDefinitions.get(building.definitionId);
      if (definition === undefined) {
        throw new RangeError(`building ${String(building.id)} has no definition`);
      }
      const groups = buildWageGroups(world, building, professions, index, yearDays);
      if (groups.length === 0) continue;
      const obligation = groups.reduce((total, group) => total + group.obligationSUSD, 0);
      const employer = operatingCash(index, building.id);
      const paid = Math.min(employer.balanceSUSD, obligation);
      const allocations = allocateMoney(world, dayIndex, paid, groups);
      const payments: WagePayment[] = groups.map((group) => {
        const paidSUSD = allocations.get(group.popBlockId) ?? 0;
        return {
          ...group,
          paidSUSD,
          unpaidSUSD: Math.max(0, group.obligationSUSD - paidSUSD),
        };
      });
      let paidTotal = payments.reduce((total, payment) => total + payment.paidSUSD, 0);
      if (paidTotal > employer.balanceSUSD) {
        let excess = paidTotal - employer.balanceSUSD;
        for (let index = payments.length - 1; index >= 0 && excess > 0; index -= 1) {
          const payment = payments[index];
          if (payment === undefined) continue;
          const reduction = Math.min(payment.paidSUSD, excess);
          if (reduction <= 0) continue;
          payments[index] = {
            ...payment,
            paidSUSD: payment.paidSUSD - reduction,
            unpaidSUSD: payment.unpaidSUSD + reduction,
          };
          excess -= reduction;
        }
        paidTotal = payments.reduce((total, payment) => total + payment.paidSUSD, 0);
      }
      // Proportional allocation can exceed the employer balance by one or two
      // binary64 ulps even though every amount is finite. A reduction smaller
      // than an ulp would be a no-op, so step by at least one representable ulp
      // until the paid total is genuinely affordable. The difference is paid as
      // reported shortfall, never as debt or negative cash.
      let roundingGuard = 0;
      while (paidTotal > employer.balanceSUSD && roundingGuard < 32) {
        let reduced = false;
        for (let index = payments.length - 1; index >= 0 && !reduced; index -= 1) {
          const payment = payments[index];
          if (payment === undefined || payment.paidSUSD <= 0) continue;
          const step = Math.max(
            paidTotal - employer.balanceSUSD,
            Math.abs(payment.paidSUSD) * Number.EPSILON * 2,
          );
          const reduction = Math.min(payment.paidSUSD, step);
          const nextPaid = payment.paidSUSD - reduction;
          if (!(nextPaid < payment.paidSUSD)) continue;
          payments[index] = {
            ...payment,
            paidSUSD: nextPaid,
            unpaidSUSD: payment.unpaidSUSD + (payment.paidSUSD - nextPaid),
          };
          reduced = true;
        }
        if (!reduced) break;
        paidTotal = payments.reduce((total, payment) => total + payment.paidSUSD, 0);
        roundingGuard += 1;
      }
      if (paidTotal > employer.balanceSUSD + toleranceMoney(paidTotal, employer.balanceSUSD)) {
        throw new RangeError(`wage payment exceeds employer cash for building ${String(building.id)}`);
      }
      if (paidTotal > 0) {
        const wageExpense = index.get("building", building.id, "wage-expense");
        const lines: JournalLine[] = [];
        for (const payment of payments) {
          if (payment.paidSUSD <= 0) continue;
          lines.push({
            accountId: payment.accountId,
            side: "debit",
            amountSUSD: payment.paidSUSD,
          });
        }
        lines.push({
          accountId: wageExpense.id,
          side: "debit",
          amountSUSD: paidTotal,
        });
        lines.push({
          accountId: employer.id,
          side: "credit",
          amountSUSD: paidTotal,
        });
        for (const payment of payments) {
          if (payment.paidSUSD <= 0) continue;
          const income = index.get("popBlock", payment.popBlockId, "wage-income");
          lines.push({
            accountId: income.id,
            side: "credit",
            amountSUSD: payment.paidSUSD,
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
        obligationSUSD: obligation,
        paidSUSD: paidTotal,
        unpaidSUSD: Math.max(0, obligation - paidTotal),
        payments,
      });
    }
    if (wageEntries.length > 0) {
      postings.push(...postJournalBatch(world.finance, dayIndex, wageEntries));
    }

    const upkeepSettlements: UpkeepSettlement[] = [];
    const upkeepEntries: JournalEntryInput[] = [];
    const upkeepPaidByBuilding = new Map<Id, number>();
    const upkeepObligationByBuilding = new Map<Id, number>();
    const unpaidUpkeepByBuilding = new Map<Id, number>();
    let systemAccount: FinancialAccount | undefined;
    let systemIncome: FinancialAccount | undefined;
    for (const building of [...world.buildings].sort((left, right) => left.id - right.id)) {
      if (!building.operational) continue;
      const definition = buildingDefinitions.get(building.definitionId);
      if (definition === undefined) {
        throw new RangeError(`building ${String(building.id)} has no definition`);
      }
      const obligation = definition.dailyUpkeepSUSDAtLevelOne * building.level;
      if (!Number.isFinite(obligation) || obligation < 0) {
        throw new RangeError(`invalid upkeep obligation for building ${String(building.id)}`);
      }
      if (obligation <= 0) continue;
      if (systemAccount === undefined) {
        const systemAccounts = world.finance.accounts.filter(
          (account) => account.subtype === "system-reserve-cash",
        );
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
      const paid = Math.min(employer.balanceSUSD, obligation);
      const unpaid = Math.max(0, obligation - paid);
      if (paid > 0) {
        const upkeepExpense = index.get("building", building.id, "upkeep-expense");
        upkeepEntries.push({
          transactionKind: "upkeep",
          lines: [
            { accountId: systemAccount.id, side: "debit", amountSUSD: paid },
            { accountId: upkeepExpense.id, side: "debit", amountSUSD: paid },
            { accountId: employer.id, side: "credit", amountSUSD: paid },
            { accountId: systemIncome!.id, side: "credit", amountSUSD: paid },
          ],
          sourceEntityId: building.id,
          targetEntityId: systemAccount.id,
        });
      }
      upkeepSettlements.push({
        buildingId: building.id,
        operatingAccountId: employer.id,
        systemAccountId: systemAccount.id,
        obligationSUSD: obligation,
        paidSUSD: paid,
        unpaidSUSD: unpaid,
      });
      upkeepPaidByBuilding.set(building.id, paid);
      upkeepObligationByBuilding.set(building.id, obligation);
      unpaidUpkeepByBuilding.set(building.id, unpaid);
    }
    if (upkeepEntries.length > 0) {
      postings.push(...postJournalBatch(world.finance, dayIndex, upkeepEntries));
    }

    const revenueByBuilding = new Map<Id, number>();
    const inputCostsByBuilding = new Map<Id, number>();
    const purchasesByBlock = new Map<Id, number>();
    for (const transaction of transactions) {
      revenueByBuilding.set(
        transaction.sellerBuildingId,
        (revenueByBuilding.get(transaction.sellerBuildingId) ?? 0) + transaction.totalSUSD,
      );
      if (transaction.kind === "input-purchase" && transaction.buyerBuildingId !== null) {
        inputCostsByBuilding.set(
          transaction.buyerBuildingId,
          (inputCostsByBuilding.get(transaction.buyerBuildingId) ?? 0) + transaction.totalSUSD,
        );
      }
      if (transaction.buyerPopBlockId !== null) {
        purchasesByBlock.set(
          transaction.buyerPopBlockId,
          (purchasesByBlock.get(transaction.buyerPopBlockId) ?? 0) + transaction.totalSUSD,
        );
      }
    }
    const wagesByBuilding = new Map<Id, number>();
    const wageObligationByBuilding = new Map<Id, number>();
    const unpaidWagesByBuilding = new Map<Id, number>();
    const wagesByBlock = new Map<Id, number>();
    for (const settlement of wageSettlements) {
      wagesByBuilding.set(settlement.buildingId, settlement.paidSUSD);
      wageObligationByBuilding.set(settlement.buildingId, settlement.obligationSUSD);
      unpaidWagesByBuilding.set(settlement.buildingId, settlement.unpaidSUSD);
      for (const payment of settlement.payments) {
        wagesByBlock.set(
          payment.popBlockId,
          (wagesByBlock.get(payment.popBlockId) ?? 0) + payment.paidSUSD,
        );
      }
    }

    const producers: ProducerSettlement[] = [...world.buildings]
      .sort((left, right) => left.id - right.id)
      .map((building) => {
        const initialCash = openingBalances.get(building.operatingCashAccountId) ?? 0;
        const current = operatingCash(index, building.id);
        const revenue = revenueByBuilding.get(building.id) ?? 0;
        const inputCosts = inputCostsByBuilding.get(building.id) ?? 0;
        const wagesPaid = wagesByBuilding.get(building.id) ?? 0;
        const upkeepPaid = upkeepPaidByBuilding.get(building.id) ?? 0;
        return {
          buildingId: building.id,
          ownerAccountId: building.ownerAccountId,
          operatingAccountId: building.operatingCashAccountId,
          initialCashSUSD: initialCash,
          revenueSUSD: revenue,
          inputCostsSUSD: inputCosts,
          wagesPaidSUSD: wagesPaid,
          wageObligationSUSD: wageObligationByBuilding.get(building.id) ?? 0,
          unpaidWagesSUSD: unpaidWagesByBuilding.get(building.id) ?? 0,
          upkeepPaidSUSD: upkeepPaid,
          upkeepObligationSUSD: upkeepObligationByBuilding.get(building.id) ?? 0,
          unpaidUpkeepSUSD: unpaidUpkeepByBuilding.get(building.id) ?? 0,
          profitSUSD: producerProfit(
            initialCash,
            current.balanceSUSD,
            revenue,
            inputCosts,
            wagesPaid,
            upkeepPaid,
          ),
          endingCashAfterSettlementSUSD: current.balanceSUSD,
        };
      });

    const households: HouseholdSettlement[] = [...world.popBlocks]
      .sort((left, right) => left.id - right.id)
      .map((block) => {
        const account = householdCash(index, block.id);
        const initialCash = openingBalances.get(account.id) ?? 0;
        const purchases = purchasesByBlock.get(block.id) ?? 0;
        const wages = wagesByBlock.get(block.id) ?? 0;
        const expected = initialCash - purchases + wages;
        if (Math.abs(expected - account.balanceSUSD) > toleranceMoney(expected, account.balanceSUSD)) {
          throw new RangeError(`household cash does not reconcile for popBlock ${String(block.id)}`);
        }
        return {
          popBlockId: block.id,
          financialAccountId: account.id,
          initialCashSUSD: initialCash,
          marketPurchasesSUSD: purchases,
          wagesReceivedSUSD: wages,
          endingCashAfterSettlementSUSD: account.balanceSUSD,
        };
      });

    let initialCash = 0;
    for (const account of world.finance.accounts) {
      if (!isCashAccount(account)) continue;
      initialCash += openingBalances.get(account.id) ?? 0;
    }
    const endingCash = designatedCashTotal(world.finance);
    if (Math.abs(initialCash - endingCash) > toleranceMoney(initialCash, endingCash)) {
      throw new RangeError("market settlement did not conserve aggregate cash");
    }

    const totals: SettlementTotals = {
      marketPurchasesSUSD: transactions.reduce((total, transaction) => total + transaction.totalSUSD, 0),
      householdPurchasesSUSD: transactions
        .filter((transaction) => transaction.kind === "household-purchase")
        .reduce((total, transaction) => total + transaction.totalSUSD, 0),
      inputPurchasesSUSD: transactions
        .filter((transaction) => transaction.kind === "input-purchase")
        .reduce((total, transaction) => total + transaction.totalSUSD, 0),
      wageObligationSUSD: wageSettlements.reduce((total, settlement) => total + settlement.obligationSUSD, 0),
      wagesPaidSUSD: wageSettlements.reduce((total, settlement) => total + settlement.paidSUSD, 0),
      unpaidWagesSUSD: wageSettlements.reduce((total, settlement) => total + settlement.unpaidSUSD, 0),
      upkeepObligationSUSD: upkeepSettlements.reduce(
        (total, settlement) => total + settlement.obligationSUSD,
        0,
      ),
      upkeepPaidSUSD: upkeepSettlements.reduce((total, settlement) => total + settlement.paidSUSD, 0),
      unpaidUpkeepSUSD: upkeepSettlements.reduce(
        (total, settlement) => total + settlement.unpaidSUSD,
        0,
      ),
      producerRevenueSUSD: producers.reduce((total, producer) => total + producer.revenueSUSD, 0),
      producerInputCostsSUSD: producers.reduce((total, producer) => total + producer.inputCostsSUSD, 0),
      producerWagesSUSD: producers.reduce((total, producer) => total + producer.wagesPaidSUSD, 0),
      producerProfitSUSD: producers.reduce((total, producer) => total + producer.profitSUSD, 0),
      initialCashSUSD: initialCash,
      endingCashAfterSettlementSUSD: endingCash,
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
      transactions: transactions.map(({ key: _key, transactionKind: _kind, ...transaction }) => transaction),
      wages: wageSettlements,
      upkeep: upkeepSettlements,
      producers,
      households,
      totals,
      postingIds: postings.map((posting) => posting.id),
    };
  } catch (error) {
    for (const account of world.finance.accounts) {
      const balance = openingBalances.get(account.id);
      if (balance === undefined) throw new RangeError(`settlement rollback lost account ${String(account.id)}`);
      account.balanceSUSD = balance;
    }
    world.finance.postings = openingPostings;
    world.finance.nextPostingId = openingNextPostingId;
    throw error;
  }
}
