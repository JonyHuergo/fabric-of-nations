/**
 * M5a deterministic profit allocation.
 *
 * Runs once per economic month-end, after the M4b close. The closed period's net
 * result for each building (`sales revenue - input/wage/upkeep expense`, taken
 * from the frozen period summary) is reclassified from the building owner-equity
 * account into its `retained-profit` account. A building is then allowed to
 * distribute a policy fraction of its positive retained profit:
 *
 * - private ownership credits the designated owner household's cash and equity;
 * - state ownership remits to the owning country's treasury cash and equity.
 *
 * Every amount is capped by the building's actual operating cash after the close.
 * The remainder stays as retained profit; there is no liability, deferred
 * obligation, or money creation. Losses are carried as negative retained profit.
 *
 * The complete allocation is staged on a finance clone and published only after
 * every entry and the accounting identity validate.
 */

import { assertValidDayIndex, dayIndexToCivilDate, daysInMonth, isTerminalDayIndex } from "../calendar.js";
import { MONEY_TOLERANCE_RUSD } from "../population/constants.js";
import type { DayIndex, Id } from "../types.js";
import {
  assertAccountingIdentity,
  buildFinanceIndex,
  cloneFinanceState,
  designatedCashTotal,
  type FinanceIndex,
} from "./accounts.js";
import { postJournalBatch, type JournalEntryInput } from "./accounting.js";
import {
  DEFAULT_PRIVATE_PAYOUT_RATE,
  DEFAULT_PROFIT_DISTRIBUTION_ENABLED,
  DEFAULT_STATE_REMITTANCE_RATE,
  MAX_PROFIT_ALLOCATION_RATE,
  MIN_PROFIT_ALLOCATION_RATE,
} from "./constants.js";
import type { FinanceCloseResult } from "./period.js";
import type {
  BuildingInstance,
  FinancialAccount,
  ProfitDistributionPolicy,
} from "./types.js";
import {
  requireFiniteNumber,
  requireRecord,
} from "../validation.js";
import type { World } from "../world.js";
import { assertValidFinanceState, assertValidPeriodSummaries } from "./validation.js";

/** Create a validated policy from optional scenario input and documented defaults. */
export function createProfitDistributionPolicy(
  input?: Partial<ProfitDistributionPolicy>,
): ProfitDistributionPolicy {
  const policy: ProfitDistributionPolicy = {
    enabled: input?.enabled ?? DEFAULT_PROFIT_DISTRIBUTION_ENABLED,
    privatePayoutRate: input?.privatePayoutRate ?? DEFAULT_PRIVATE_PAYOUT_RATE,
    stateRemittanceRate: input?.stateRemittanceRate ?? DEFAULT_STATE_REMITTANCE_RATE,
  };
  return assertValidProfitDistributionPolicy(policy, "world.profitDistribution");
}

/** Validate one profit-allocation policy, returning a normalized copy. */
export function assertValidProfitDistributionPolicy(
  value: unknown,
  path: string,
): ProfitDistributionPolicy {
  const record = requireRecord(value, path);
  if (typeof record.enabled !== "boolean") {
    throw new TypeError(`${path}.enabled must be a boolean`);
  }
  const privatePayoutRate = requireFiniteNumber(record.privatePayoutRate, `${path}.privatePayoutRate`);
  const stateRemittanceRate = requireFiniteNumber(
    record.stateRemittanceRate,
    `${path}.stateRemittanceRate`,
  );
  for (const [name, rate] of [
    ["privatePayoutRate", privatePayoutRate],
    ["stateRemittanceRate", stateRemittanceRate],
  ] as const) {
    if (rate < MIN_PROFIT_ALLOCATION_RATE || rate > MAX_PROFIT_ALLOCATION_RATE) {
      throw new RangeError(
        `${path}.${name} must be in ${MIN_PROFIT_ALLOCATION_RATE}..${MAX_PROFIT_ALLOCATION_RATE}, received ${String(rate)}`,
      );
    }
  }
  return { enabled: record.enabled, privatePayoutRate, stateRemittanceRate };
}

/** One building's profit-allocation result for a closed month. */
export interface BuildingProfitAllocationResult {
  readonly buildingId: Id;
  readonly ownerKind: "private" | "state";
  readonly ownerId: Id;
  readonly periodNetRUSD: number;
  readonly retainedProfitBeforeRUSD: number;
  readonly retainedProfitAfterRUSD: number;
  readonly distributableRUSD: number;
  readonly distributedRUSD: number;
  readonly retainedRUSD: number;
}

/** Transient result of the M5a month-end allocation phase. */
export interface ProfitDistributionResult {
  readonly applied: boolean;
  readonly dayIndex: DayIndex;
  readonly periodEndDay: DayIndex | null;
  readonly buildings: readonly BuildingProfitAllocationResult[];
  readonly totalPrivateDistributionRUSD: number;
  readonly totalStateRemittanceRUSD: number;
  readonly totalRetainedRUSD: number;
  readonly postingIds: readonly number[];
}

function emptyResult(dayIndex: DayIndex): ProfitDistributionResult {
  return {
    applied: false,
    dayIndex,
    periodEndDay: null,
    buildings: [],
    totalPrivateDistributionRUSD: 0,
    totalStateRemittanceRUSD: 0,
    totalRetainedRUSD: 0,
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

function accountFor(
  index: FinanceIndex,
  buildingId: Id,
  subtype: "owner-equity" | "retained-profit" | "operating-cash" | "sales-revenue" | "input-expense" | "wage-expense" | "upkeep-expense",
): FinancialAccount {
  return index.get("building", buildingId, subtype);
}

function summaryBalance(close: FinanceCloseResult, accountId: Id): number {
  const value = close.summary.accountTotals[accountId];
  if (value === undefined) return 0;
  if (!Number.isFinite(value)) {
    throw new RangeError(`period summary account ${String(accountId)} is not finite`);
  }
  return value;
}

function recipientAccounts(
  index: FinanceIndex,
  building: BuildingInstance,
): { readonly cash: FinancialAccount; readonly equity: FinancialAccount } {
  const ownerAccount = index.byId.get(building.ownerAccountId);
  if (ownerAccount === undefined) {
    throw new RangeError(`building ${String(building.id)} references unknown owner account`);
  }
  if (building.ownerKind === "private") {
    if (
      ownerAccount.ownerKind !== "popBlock" ||
      ownerAccount.subtype !== "household-cash" ||
      ownerAccount.ownerId === null
    ) {
      throw new RangeError(
        `building ${String(building.id)} private owner account must be a pop-block household-cash account`,
      );
    }
    return {
      cash: ownerAccount,
      equity: index.get("popBlock", ownerAccount.ownerId, "owner-equity"),
    };
  }
  if (
    ownerAccount.ownerKind !== "country" ||
    ownerAccount.subtype !== "treasury-cash" ||
    ownerAccount.ownerId === null
  ) {
    throw new RangeError(
      `building ${String(building.id)} state owner account must be a country treasury-cash account`,
    );
  }
  return {
    cash: ownerAccount,
    equity: index.get("country", ownerAccount.ownerId, "owner-equity"),
  };
}

/**
 * Apply the M5a month-end allocation. Returns `applied: false` when the policy is
 * disabled or no close is supplied. A previously applied close result is
 * rejected without mutation.
 */
export function runProfitDistributionPhase(
  world: World,
  dayIndex: DayIndex,
  close: FinanceCloseResult,
): ProfitDistributionResult {
  assertValidDayIndex(dayIndex);
  if (isTerminalDayIndex(dayIndex)) {
    throw new RangeError("profit allocation cannot run at the terminal boundary");
  }
  if (dayIndex !== world.dayIndex) {
    throw new RangeError("profit-allocation day must match the world's next day");
  }
  const policy = assertValidProfitDistributionPolicy(
    world.profitDistribution,
    "world.profitDistribution",
  );
  if (!policy.enabled) return emptyResult(dayIndex);
  if (!isLastCivilDayOfMonth(dayIndex)) {
    throw new RangeError("profit allocation requires a civil month-end");
  }
  if (world.finance.closedThroughDay !== dayIndex) {
    throw new RangeError("profit allocation requires the current month-end to be closed");
  }
  if (close.summary.periodEndDay !== dayIndex) {
    throw new RangeError("profit allocation close summary must describe the current month-end");
  }
  if (close.profitDistributionApplied) {
    throw new RangeError("profit allocation has already been applied to this close result");
  }
  const lastSummary = world.finance.periodSummaries[world.finance.periodSummaries.length - 1];
  if (
    lastSummary === undefined ||
    lastSummary.periodEndDay !== close.summary.periodEndDay ||
    lastSummary.periodStartDay !== close.summary.periodStartDay
  ) {
    throw new RangeError("profit allocation requires the latest published period summary");
  }
  assertValidFinanceState(world.finance);
  assertValidPeriodSummaries(world.finance, {
    startDayIndex: world.startDayIndex,
    dayIndex,
    allowUnadvancedClose: true,
  });

  const staged = cloneFinanceState(world.finance);
  const index = buildFinanceIndex(staged);
  const openingCash = designatedCashTotal(world.finance);
  const entries: JournalEntryInput[] = [];
  const buildings: BuildingProfitAllocationResult[] = [];
  let totalPrivate = 0;
  let totalState = 0;
  let totalRetained = 0;

  for (const building of [...world.buildings].sort((left, right) => left.id - right.id)) {
    const ownerEquity = accountFor(index, building.id, "owner-equity");
    const retained = accountFor(index, building.id, "retained-profit");
    const operating = accountFor(index, building.id, "operating-cash");
    const revenue = accountFor(index, building.id, "sales-revenue");
    const inputExpense = accountFor(index, building.id, "input-expense");
    const wageExpense = accountFor(index, building.id, "wage-expense");
    const upkeepExpense = accountFor(index, building.id, "upkeep-expense");
    // E2: an assessed business-profit tax is a period expense of the payer, so
    // the distributable result is after tax. The account is absent in countryless
    // fixtures, where no business tax can be assessed.
    const businessTaxExpense = index.find("building", building.id, "business-tax-expense");
    const recipient = recipientAccounts(index, building);

    let periodNet =
      summaryBalance(close, revenue.id) -
      summaryBalance(close, inputExpense.id) -
      summaryBalance(close, wageExpense.id) -
      summaryBalance(close, upkeepExpense.id) -
      (businessTaxExpense === undefined ? 0 : summaryBalance(close, businessTaxExpense.id));
    if (!Number.isFinite(periodNet)) {
      throw new RangeError(`building ${String(building.id)} period net result is not finite`);
    }
    if (Math.abs(periodNet) <= toleranceMoney(periodNet)) periodNet = 0;
    const retainedBefore = retained.balanceRUSD;
    if (!Number.isFinite(retainedBefore)) {
      throw new RangeError(`building ${String(building.id)} retained profit is not finite`);
    }

    if (periodNet !== 0) {
      const amount = Math.abs(periodNet);
      entries.push({
        transactionKind: "profit-retention",
        lines:
          periodNet > 0
            ? [
                { accountId: ownerEquity.id, side: "debit", amountRUSD: amount },
                { accountId: retained.id, side: "credit", amountRUSD: amount },
              ]
            : [
                { accountId: retained.id, side: "debit", amountRUSD: amount },
                { accountId: ownerEquity.id, side: "credit", amountRUSD: amount },
              ],
        sourceEntityId: building.id,
        targetEntityId: null,
      });
    }

    const retainedAfter = retainedBefore + periodNet;
    if (!Number.isFinite(retainedAfter)) {
      throw new RangeError(`building ${String(building.id)} retained profit is not finite`);
    }
    const distributable = Math.max(0, retainedAfter);
    const rate =
      building.ownerKind === "state" ? policy.stateRemittanceRate : policy.privatePayoutRate;
    const target = distributable * rate;
    const availableCash = operating.balanceRUSD;
    if (!Number.isFinite(availableCash) || availableCash < 0) {
      throw new RangeError(`building ${String(building.id)} has invalid operating cash`);
    }
    const distributed = Math.min(target, availableCash);
    if (!Number.isFinite(distributed) || distributed < 0) {
      throw new RangeError(`building ${String(building.id)} profit distribution is invalid`);
    }
    if (distributed > 0) {
      const kind =
        building.ownerKind === "state"
          ? ("state-enterprise-remittance" as const)
          : ("profit-distribution" as const);
      entries.push({
        transactionKind: kind,
        lines: [
          { accountId: retained.id, side: "debit", amountRUSD: distributed },
          { accountId: operating.id, side: "credit", amountRUSD: distributed },
          { accountId: recipient.cash.id, side: "debit", amountRUSD: distributed },
          { accountId: recipient.equity.id, side: "credit", amountRUSD: distributed },
        ],
        sourceEntityId: building.id,
        targetEntityId:
          building.ownerKind === "state" ? recipient.cash.ownerId : recipient.equity.ownerId,
      });
      if (building.ownerKind === "state") totalState += distributed;
      else totalPrivate += distributed;
    }
    const retainedAfterDistribution = retainedAfter - distributed;
    totalRetained += retainedAfterDistribution;
    buildings.push({
      buildingId: building.id,
      ownerKind: building.ownerKind,
      ownerId:
        building.ownerKind === "state"
          ? (recipient.cash.ownerId ?? -1)
          : (recipient.equity.ownerId ?? -1),
      periodNetRUSD: periodNet,
      retainedProfitBeforeRUSD: retainedBefore,
      retainedProfitAfterRUSD: retainedAfterDistribution,
      distributableRUSD: distributable,
      distributedRUSD: distributed,
      retainedRUSD: retainedAfterDistribution,
    });
  }

  let postingIds: readonly number[] = [];
  if (entries.length > 0) {
    postingIds = postJournalBatch(staged, dayIndex, entries).map((posting) => posting.id);
  }
  assertValidFinanceState(staged);
  assertAccountingIdentity(staged);
  assertValidPeriodSummaries(staged, {
    startDayIndex: world.startDayIndex,
    dayIndex,
    allowUnadvancedClose: true,
  });
  const closingCash = designatedCashTotal(staged);
  if (Math.abs(openingCash - closingCash) > toleranceMoney(openingCash, closingCash)) {
    throw new RangeError("profit allocation did not conserve aggregate designated cash");
  }

  world.finance = staged;
  close.profitDistributionApplied = true;
  return {
    applied: true,
    dayIndex,
    periodEndDay: close.summary.periodEndDay,
    buildings,
    totalPrivateDistributionRUSD: totalPrivate,
    totalStateRemittanceRUSD: totalState,
    totalRetainedRUSD: totalRetained,
    postingIds,
  };
}
