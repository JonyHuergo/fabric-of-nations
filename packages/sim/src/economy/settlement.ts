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
  type JournalEntryInput,
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

interface PreparedTransaction extends SettledMarketTransaction {
  readonly transactionKind: "goods-purchase" | "input-purchase";
  readonly buyerExpenseAccountId: Id;
  readonly sellerRevenueAccountId: Id;
}

interface WageGroup {
  readonly popBlockId: Id;
  readonly professionId: Id;
  readonly workers: number;
  readonly accountId: Id;
  readonly obligationRUSD: number;
}

function toleranceMoney(...values: number[]): number {
  let scale = 1;
  for (const value of values) scale = Math.max(scale, Math.abs(value));
  return MONEY_TOLERANCE_RUSD * scale;
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

function assertTransactionAmount(transaction: PendingTransaction, index: number): void {
  // Same checks, order and messages as before; the path is built only on failure.
  const fail = (name: string): never => {
    throw new RangeError(`pendingTransactions[${String(index)}].${name} must be finite and strictly positive`);
  };
  if (!Number.isFinite(transaction.quantity) || !(transaction.quantity > 0)) fail("quantity");
  if (!Number.isFinite(transaction.unitPriceRUSD) || !(transaction.unitPriceRUSD > 0)) fail("unitPriceRUSD");
  if (!Number.isFinite(transaction.totalRUSD) || !(transaction.totalRUSD > 0)) fail("totalRUSD");
  const expected = transaction.quantity * transaction.unitPriceRUSD;
  if (Math.abs(expected - transaction.totalRUSD) > toleranceMoney(expected, transaction.totalRUSD)) {
    throw new RangeError(
      `pendingTransactions[${String(index)}].totalRUSD does not reconcile with quantity × unit price`,
    );
  }
}

function transactionKey(transaction: PendingTransaction): string {
  const buyer =
    transaction.kind === "household-purchase"
      ? `household:${String(transaction.buyerPopBlockId)}`
      : `building:${String(transaction.buyerBuildingId)}`;
  return `${transaction.kind}:${buyer}:${String(transaction.sellerBuildingId)}:${String(transaction.goodId)}:${String(transaction.tier)}:${transaction.phase}`;
}

const MARKET_TRANSACTION_TIERS: ReadonlySet<number> = new Set([1, 2, 3, 5, 6]);

/**
 * Rank of each value as its decimal text compares inside a `transactionKey`, where
 * every field is followed by `:` (D-137). No field contains `:`, so comparing two
 * keys equals comparing their fields in order as `text + ":"`; ranking each field's
 * distinct values once reproduces the string sort with numeric comparisons only.
 */
function keyFieldRanks(values: Iterable<number | null>): Map<number | null, number> {
  const distinct = [...new Set(values)].map((value) => ({ value, text: `${String(value)}:` }));
  distinct.sort((left, right) => (left.text < right.text ? -1 : left.text > right.text ? 1 : 0));
  return new Map(distinct.map((entry, rank) => [entry.value, rank] as const));
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
 */
function aggregatedMarketEntries(transactions: readonly PreparedTransaction[]): JournalEntryInput[] {
  interface Group {
    readonly transactionKind: PreparedTransaction["transactionKind"];
    readonly goodId: number;
    readonly buyers: Map<Id, { expenseAccountId: Id; amount: number }>;
    readonly sellers: Map<Id, { revenueAccountId: Id; amount: number }>;
  }
  // D-137: numeric (kind, good) group keys; groups are ordered explicitly below.
  const groups = new Map<number, Group>();
  for (const transaction of transactions) {
    const key = (transaction.transactionKind === "goods-purchase" ? 0 : 2 ** 32) + transaction.goodId;
    let group = groups.get(key);
    if (group === undefined) {
      group = {
        transactionKind: transaction.transactionKind,
        goodId: transaction.goodId,
        buyers: new Map(),
        sellers: new Map(),
      };
      groups.set(key, group);
    }
    const buyer = group.buyers.get(transaction.buyerAccountId);
    if (buyer === undefined) {
      group.buyers.set(transaction.buyerAccountId, {
        expenseAccountId: transaction.buyerExpenseAccountId,
        amount: transaction.totalRUSD,
      });
    } else {
      buyer.amount += transaction.totalRUSD;
    }
    const seller = group.sellers.get(transaction.sellerAccountId);
    if (seller === undefined) {
      group.sellers.set(transaction.sellerAccountId, {
        revenueAccountId: transaction.sellerRevenueAccountId,
        amount: transaction.totalRUSD,
      });
    } else {
      seller.amount += transaction.totalRUSD;
    }
  }
  const ordered = [...groups.values()].sort((left, right) =>
    left.transactionKind === right.transactionKind
      ? left.goodId - right.goodId
      : left.transactionKind < right.transactionKind
        ? -1
        : 1,
  );
  const entries: JournalEntryInput[] = [];
  for (const group of ordered) {
    const lines: JournalLine[] = [];
    for (const [accountId, buyer] of [...group.buyers].sort((left, right) => left[0] - right[0])) {
      if (!(buyer.amount > 0)) continue;
      lines.push({ accountId: buyer.expenseAccountId, side: "debit", amountRUSD: buyer.amount });
      lines.push({ accountId, side: "credit", amountRUSD: buyer.amount });
    }
    for (const [accountId, seller] of [...group.sellers].sort((left, right) => left[0] - right[0])) {
      if (!(seller.amount > 0)) continue;
      lines.push({ accountId, side: "debit", amountRUSD: seller.amount });
      lines.push({ accountId: seller.revenueAccountId, side: "credit", amountRUSD: seller.amount });
    }
    if (lines.length > 0) {
      entries.push({
        transactionKind: group.transactionKind,
        lines,
        sourceEntityId: null,
        targetEntityId: null,
      });
    }
  }
  return entries;
}

function prepareTransactions(
  world: World,
  definitions: EconomyDefinitions,
  index: FinanceIndex,
  transactions: readonly PendingTransaction[],
): PreparedTransaction[] {
  const goodIds = new Set(definitions.goods.map((good) => good.id));
  const buildingById = new Map(world.buildings.map((building) => [building.id, building]));
  // Accounts per owner, looked up once (an owner appears in many transactions).
  const sellerAccounts = new Map<Id, { readonly cash: FinancialAccount; readonly revenue: FinancialAccount }>();
  const householdAccounts = new Map<Id, { readonly cash: FinancialAccount; readonly expense: FinancialAccount }>();
  const buildingBuyerAccounts = new Map<Id, { readonly cash: FinancialAccount; readonly expense: FinancialAccount }>();
  const prepared: PreparedTransaction[] = [];
  for (let index_ = 0; index_ < transactions.length; index_ += 1) {
    const transaction = transactions[index_];
    if (transaction === undefined) throw new RangeError(`pending transaction ${String(index_)} is missing`);
    assertTransactionAmount(transaction, index_);
    if (!goodIds.has(transaction.goodId)) {
      throw new RangeError(`pendingTransactions[${String(index_)}].goodId is unknown`);
    }
    if (!buildingById.has(transaction.sellerBuildingId)) {
      throw new RangeError(`pendingTransactions[${String(index_)}].sellerBuildingId is unknown`);
    }
    let seller = sellerAccounts.get(transaction.sellerBuildingId);
    if (seller === undefined) {
      seller = {
        cash: operatingCash(index, transaction.sellerBuildingId),
        revenue: index.get("building", transaction.sellerBuildingId, "sales-revenue"),
      };
      sellerAccounts.set(transaction.sellerBuildingId, seller);
    }
    let buyer: { readonly cash: FinancialAccount; readonly expense: FinancialAccount };
    if (transaction.kind === "household-purchase") {
      if (transaction.buyerPopBlockId === null || transaction.buyerBuildingId !== null) {
        throw new RangeError(`pendingTransactions[${String(index_)}] must identify exactly one household buyer`);
      }
      const cached = householdAccounts.get(transaction.buyerPopBlockId);
      if (cached === undefined) {
        buyer = {
          cash: householdCash(index, transaction.buyerPopBlockId),
          expense: index.get("popBlock", transaction.buyerPopBlockId, "consumption-expense"),
        };
        householdAccounts.set(transaction.buyerPopBlockId, buyer);
      } else {
        buyer = cached;
      }
    } else if (transaction.kind === "input-purchase") {
      if (transaction.buyerBuildingId === null || transaction.buyerPopBlockId !== null) {
        throw new RangeError(`pendingTransactions[${String(index_)}] must identify exactly one building buyer`);
      }
      const buyerBuilding = buildingById.get(transaction.buyerBuildingId);
      if (buyerBuilding === undefined || !buyerBuilding.operational) {
        throw new RangeError(
          `pendingTransactions[${String(index_)}].buyerBuildingId must reference an operational building`,
        );
      }
      const cached = buildingBuyerAccounts.get(transaction.buyerBuildingId);
      if (cached === undefined) {
        buyer = {
          cash: operatingCash(index, transaction.buyerBuildingId),
          expense: index.get("building", transaction.buyerBuildingId, "input-expense"),
        };
        buildingBuyerAccounts.set(transaction.buyerBuildingId, buyer);
      } else {
        buyer = cached;
      }
    } else {
      throw new RangeError(`pendingTransactions[${String(index_)}].kind is invalid`);
    }
    if (!MARKET_TRANSACTION_TIERS.has(transaction.tier)) {
      throw new RangeError(`pendingTransactions[${String(index_)}].tier is invalid`);
    }
    if (transaction.phase !== "A" && transaction.phase !== "B") {
      throw new RangeError(`pendingTransactions[${String(index_)}].phase must be A or B`);
    }
    prepared.push({
      kind: transaction.kind,
      buyerPopBlockId: transaction.buyerPopBlockId,
      buyerBuildingId: transaction.buyerBuildingId,
      sellerBuildingId: transaction.sellerBuildingId,
      goodId: transaction.goodId,
      quantity: transaction.quantity,
      unitPriceRUSD: transaction.unitPriceRUSD,
      totalRUSD: transaction.totalRUSD,
      tier: transaction.tier,
      phase: transaction.phase,
      buyerAccountId: buyer.cash.id,
      sellerAccountId: seller.cash.id,
      buyerExpenseAccountId: buyer.expense.id,
      sellerRevenueAccountId: seller.revenue.id,
      transactionKind:
        transaction.kind === "household-purchase" ? "goods-purchase" : "input-purchase",
    });
  }
  // Canonical `transactionKey` order (D-137: by field ranks, see `keyFieldRanks`).
  // "household-purchase" sorts before "input-purchase", and the buyer word is fixed
  // by the kind, so the buyer id is the next field that can differ.
  const buyerRank = keyFieldRanks(
    prepared.map((transaction) => transaction.buyerPopBlockId ?? transaction.buyerBuildingId),
  );
  const sellerRank = keyFieldRanks(prepared.map((transaction) => transaction.sellerBuildingId));
  const goodRank = keyFieldRanks(prepared.map((transaction) => transaction.goodId));
  const tierRank = keyFieldRanks(prepared.map((transaction) => transaction.tier));
  const ranked = prepared.map((transaction) => ({
    transaction,
    kind: transaction.kind === "household-purchase" ? 0 : 1,
    buyer: buyerRank.get(transaction.buyerPopBlockId ?? transaction.buyerBuildingId) ?? 0,
    seller: sellerRank.get(transaction.sellerBuildingId) ?? 0,
    good: goodRank.get(transaction.goodId) ?? 0,
    tier: tierRank.get(transaction.tier) ?? 0,
    phase: transaction.phase === "A" ? 0 : 1,
  }));
  ranked.sort(
    (left, right) =>
      left.kind - right.kind ||
      left.buyer - right.buyer ||
      left.seller - right.seller ||
      left.good - right.good ||
      left.tier - right.tier ||
      left.phase - right.phase,
  );
  for (let position = 1; position < ranked.length; position += 1) {
    const previous = ranked[position - 1];
    const current = ranked[position];
    if (
      previous !== undefined &&
      current !== undefined &&
      previous.kind === current.kind &&
      previous.buyer === current.buyer &&
      previous.seller === current.seller &&
      previous.good === current.good &&
      previous.tier === current.tier &&
      previous.phase === current.phase
    ) {
      throw new RangeError(`duplicate pending transaction ${transactionKey(current.transaction)}`);
    }
  }
  return ranked.map((entry) => entry.transaction);
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
  } = {},
): MarketSettlementResult {
  if (options.validateWorld !== false) assertValidWorldForTick(world);
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
  if (seenMarketIds.size !== world.markets.length) {
    throw new RangeError(
      `settlement requires exactly one market-day result for every world market; received ${String(seenMarketIds.size)} of ${String(world.markets.length)}`,
    );
  }
  assertValidDayIndex(world.dayIndex);
  if (isTerminalDayIndex(world.dayIndex)) {
    throw new RangeError("settlement cannot run at the terminal boundary");
  }
  assertValidEmploymentState(world, definitions);
  const sortedResults = [...marketDays].sort((left, right) => left.marketId - right.marketId);
  const result = settleMarketDaysInternal(world, definitions, sortedResults, options.detail ?? "full");
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
): MarketSettlementResult {
  const dayIndex = marketDays[0]?.dayIndex;
  if (dayIndex === undefined) throw new RangeError("settlement requires a market-day result");
  const marketIds = marketDays.map((marketDay) => marketDay.marketId);
  const marketId = marketIds[0];
  if (marketId === undefined) throw new RangeError("settlement requires a market-day result");
  const pendingTransactions = marketDays.flatMap((marketDay) => marketDay.pendingTransactions);
  const index = buildFinanceIndex(world.finance);
  const transactions = prepareTransactions(world, definitions, index, pendingTransactions);

  // D-137: opening balances as one array in account order (restored on failure; no
  // account is created during settlement), plus the opening cash of each producer
  // and household and the opening designated-cash total, read before any posting.
  // These are the values the former per-account map returned.
  const accounts = world.finance.accounts;
  const openingBalanceArray = new Float64Array(accounts.length);
  let maxAccountId = 0;
  for (let position = 0; position < accounts.length; position += 1) {
    const account = accounts[position] as FinancialAccount;
    openingBalanceArray[position] = account.balanceRUSD;
    if (account.id > maxAccountId) maxAccountId = account.id;
  }
  // D-137: opening cash by account id in a dense table when ids allow it (the
  // common case: ids are allocated sequentially); the producer and household loops
  // then read an array instead of building two maps per day.
  const denseOpening =
    Number.isSafeInteger(maxAccountId) && maxAccountId <= accounts.length * 4 + 1024;
  const openingByAccountId = denseOpening ? new Float64Array(maxAccountId + 1) : null;
  if (openingByAccountId !== null) {
    for (const account of accounts) openingByAccountId[account.id] = account.balanceRUSD;
  }
  const openingProducerCash = new Map<Id, number>();
  if (openingByAccountId === null) {
    for (const building of world.buildings) {
      openingProducerCash.set(
        building.operatingCashAccountId,
        index.byId.get(building.operatingCashAccountId)?.balanceRUSD ?? 0,
      );
    }
  }
  const openingHouseholdCash = new Map<Id, number>();
  if (openingByAccountId === null) {
    for (const block of world.popBlocks) {
      const account = index.find("popBlock", block.id, "household-cash");
      if (account !== undefined) openingHouseholdCash.set(account.id, account.balanceRUSD);
    }
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
    if (transactions.length > 0) {
      postings.push(
        ...postJournalBatch(world.finance, dayIndex, aggregatedMarketEntries(transactions)),
      );
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
      postings.push(...postJournalBatch(world.finance, dayIndex, wageEntries));
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
      postings.push(...postJournalBatch(world.finance, dayIndex, upkeepEntries));
    }

    const revenueByBuilding = new Map<Id, number>();
    const inputCostsByBuilding = new Map<Id, number>();
    const purchasesByBlock = new Map<Id, number>();
    for (const transaction of transactions) {
      revenueByBuilding.set(
        transaction.sellerBuildingId,
        (revenueByBuilding.get(transaction.sellerBuildingId) ?? 0) + transaction.totalRUSD,
      );
      if (transaction.kind === "input-purchase" && transaction.buyerBuildingId !== null) {
        inputCostsByBuilding.set(
          transaction.buyerBuildingId,
          (inputCostsByBuilding.get(transaction.buyerBuildingId) ?? 0) + transaction.totalRUSD,
        );
      }
      if (transaction.buyerPopBlockId !== null) {
        purchasesByBlock.set(
          transaction.buyerPopBlockId,
          (purchasesByBlock.get(transaction.buyerPopBlockId) ?? 0) + transaction.totalRUSD,
        );
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
          openingByAccountId !== null
            ? (openingByAccountId[building.operatingCashAccountId] ?? 0)
            : (openingProducerCash.get(building.operatingCashAccountId) ?? 0);
        const current = operatingCash(index, building.id);
        const revenue = revenueByBuilding.get(building.id) ?? 0;
        const inputCosts = inputCostsByBuilding.get(building.id) ?? 0;
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
          openingByAccountId !== null
            ? (openingByAccountId[account.id] ?? 0)
            : (openingHouseholdCash.get(account.id) ?? 0);
        const purchases = purchasesByBlock.get(block.id) ?? 0;
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
      marketPurchasesRUSD: transactions.reduce((total, transaction) => total + transaction.totalRUSD, 0),
      householdPurchasesRUSD: transactions
        .filter((transaction) => transaction.kind === "household-purchase")
        .reduce((total, transaction) => total + transaction.totalRUSD, 0),
      inputPurchasesRUSD: transactions
        .filter((transaction) => transaction.kind === "input-purchase")
        .reduce((total, transaction) => total + transaction.totalRUSD, 0),
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
      transactions: (detail === "summary" ? [] : transactions).map((transaction) => ({
        kind: transaction.kind,
        buyerPopBlockId: transaction.buyerPopBlockId,
        buyerBuildingId: transaction.buyerBuildingId,
        sellerBuildingId: transaction.sellerBuildingId,
        goodId: transaction.goodId,
        quantity: transaction.quantity,
        unitPriceRUSD: transaction.unitPriceRUSD,
        totalRUSD: transaction.totalRUSD,
        tier: transaction.tier,
        phase: transaction.phase,
        buyerAccountId: transaction.buyerAccountId,
        sellerAccountId: transaction.sellerAccountId,
      })),
      wages: wageSettlements,
      upkeep: upkeepSettlements,
      producers,
      households,
      totals,
      postingIds: postings.map((posting) => posting.id),
    };
  } catch (error) {
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
