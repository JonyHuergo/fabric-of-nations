/**
 * M3d deterministic market-day phase.
 *
 * This is not a complete economic tick and does not settle money. It accepts
 * explicit desired/funded demand, allocates opening inventory by GDD priority,
 * hands accepted input reservations to M3c production, resolves remaining
 * household demand against same-day output, applies final overflow, and updates
 * prices boundedly. Allocations, reservations, and pending financial results are
 * transient.
 */

import { assertValidDayIndex, isTerminalDayIndex } from "../calendar.js";
import { QUANTITY_TOLERANCE } from "../population/constants.js";
import type { NeedTierDef } from "../population/types.js";
import type { DayIndex } from "../types.js";
import { assertValidWorldForTick, type PhaseValidationOptions, type World } from "../world.js";
import {
  M3_PRICE_EPSILON,
  M3_PRICE_KAPPA,
  M3_PRICE_MAX_DAILY_CHANGE,
  M3_PRICE_MAX_RATIO,
  M3_PRICE_MIN_RATIO,
} from "./constants.js";
import { assertValidEconomyDefinitions } from "./definitions.js";
import {
  copyLotTable,
  deriveStockByGood,
  lotTableFromLots,
  lotTableToLots,
  type LotTable,
} from "./inventory.js";
import {
  applyOverflowToTable,
  buildProductionLookups,
  reservationUseObjects,
  runProductionCore,
  storageCapacityOf,
  type InventoryFlow,
  type ProductionLookups,
  type OverflowLoss,
  type ProductionPhaseResult,
  type ReservationColumns,
  type ReservationUse,
  type ReservationUseColumns,
} from "./production.js";
import type { BuildingDef, EconomyDefinitions } from "./types.js";
import { marketProvinceIds } from "./country.js";

export const M3_MARKET_TIERS = [1, 2, 3, 5, 6] as const;
export type MarketTier = (typeof M3_MARKET_TIERS)[number];
export type HouseholdTier = 1 | 3 | 6;
export type ProductionInputTier = 2 | 5;

/**
 * Purpose ids of the retired keyed residual tie-break (D-133: sequential pairing
 * needs no draw). Kept so older documentation and audits resolve the names.
 */
export const M3_MARKET_HOUSEHOLD_RESIDUAL_PURPOSE = "market.household-residual";
export const M3_MARKET_BUILDING_RESIDUAL_PURPOSE = "market.building-residual";

export interface HouseholdDemandRecord {
  readonly popBlockId: number;
  readonly tier: HouseholdTier;
  readonly goodId: number;
  readonly desiredQuantity: number;
  readonly fundedQuantity: number;
}

export interface ProductionDemandRecord {
  readonly buyerBuildingId: number;
  readonly tier: ProductionInputTier;
  readonly goodId: number;
  readonly desiredQuantity: number;
  readonly fundedQuantity: number;
}

export interface MarketDayInput {
  readonly dayIndex: DayIndex;
  readonly marketId: number;
  /** M3 needs, used only for the approved critical-input classification. */
  readonly needs: readonly NeedTierDef[];
  readonly householdDemands: readonly HouseholdDemandRecord[];
  readonly productionDemands: readonly ProductionDemandRecord[];
  /**
   * Household demand in columns (D-139), used by the integrated day instead of one
   * record object per row. When present, `householdDemands` must be empty; the rows
   * are validated exactly as records are, with the same paths and messages.
   */
  readonly householdColumns?: HouseholdDemandColumns;
}

/** Household demand records in columns, row `i` being record `i` (D-139). */
export interface HouseholdDemandColumns {
  readonly popBlockId: readonly number[];
  readonly tier: readonly HouseholdTier[];
  readonly goodId: readonly number[];
  readonly desired: readonly number[];
  readonly funded: readonly number[];
}

export interface HouseholdDemandResult {
  readonly popBlockId: number;
  readonly tier: HouseholdTier;
  readonly goodId: number;
  readonly desiredQuantity: number;
  readonly fundedQuantity: number;
  readonly passAFulfilled: number;
  readonly passBFulfilled: number;
  readonly fulfilledQuantity: number;
  readonly unmetFunded: number;
  readonly unmetDesired: number;
}

export interface ProductionDemandResult {
  readonly buyerBuildingId: number;
  readonly tier: ProductionInputTier;
  readonly goodId: number;
  readonly desiredQuantity: number;
  readonly fundedQuantity: number;
  readonly reservedQuantity: number;
  readonly usedQuantity: number;
  readonly releasedQuantity: number;
}

export interface MarketReservation {
  readonly buyerKind: "household" | "building";
  readonly buyerId: number;
  readonly tier: MarketTier;
  readonly goodId: number;
  readonly sellerBuildingId: number;
  readonly quantity: number;
  readonly phase: "A" | "B";
}

export interface HouseholdPurchase {
  readonly popBlockId: number;
  readonly tier: HouseholdTier;
  readonly goodId: number;
  readonly sellerBuildingId: number;
  readonly quantity: number;
  readonly unitPriceRUSD: number;
  readonly totalRUSD: number;
  readonly phase: "A" | "B";
}

export interface PendingTransaction {
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
}

export interface PriceUpdate {
  readonly goodId: number;
  readonly oldPriceRUSD: number;
  readonly newPriceRUSD: number;
  readonly fundedDemand: number;
  readonly sellableSupply: number;
  readonly imbalance: number;
  readonly dailyChange: number;
}

export interface MarketInventoryFlow {
  readonly goodId: number;
  readonly openingStock: number;
  readonly production: number;
  readonly usedAsInput: number;
  readonly householdConsumption: number;
  readonly recordedLoss: number;
  readonly closingStock: number;
}

export interface MarketDayResult {
  readonly marketId: number;
  readonly dayIndex: DayIndex;
  readonly openingPrices: readonly number[];
  readonly updatedPrices: readonly number[];
  readonly householdDemands: readonly HouseholdDemandResult[];
  readonly productionDemands: readonly ProductionDemandResult[];
  readonly reservations: readonly MarketReservation[];
  readonly householdPurchases: readonly HouseholdPurchase[];
  readonly pendingTransactions: readonly PendingTransaction[];
  readonly production: ProductionPhaseResult;
  readonly priceUpdates: readonly PriceUpdate[];
  readonly inventory: readonly MarketInventoryFlow[];
  readonly overflowLosses: readonly OverflowLoss[];
  /**
   * Columnar companions used by settlement and the integrated day (D-139). Not
   * authoritative and never saved; non-enumerable, and absent on results built or
   * copied by hand.
   */
  readonly columns?: MarketDayColumns;
  /**
   * Transient duplicate-settlement guard. M3e refuses to settle an already
   * settled result. This flag is not authoritative state and is never saved.
   */
  settled: boolean;
}

function tolerance(...values: number[]): number {
  let scale = 1;
  for (const value of values) scale = Math.max(scale, Math.abs(value));
  return QUANTITY_TOLERANCE * scale;
}

function assertQuantity(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new RangeError(`${path} must be a finite non-negative number`);
  }
  return value;
}

function isHouseholdTier(value: number): value is HouseholdTier {
  return value === 1 || value === 3 || value === 6;
}

function isProductionTier(value: number): value is ProductionInputTier {
  return value === 2 || value === 5;
}

function criticalGoodIds(
  definitions: EconomyDefinitions,
  needs: readonly NeedTierDef[],
): Set<number> {
  const goodByKey = new Map(definitions.goods.map((good) => [good.key, good.id]));
  const critical = new Set<number>();
  for (const tier of needs) {
    if (tier.tier !== "subsistence" && tier.tier !== "basic") continue;
    for (const item of tier.items) {
      const goodId = goodByKey.get(item.goodKey);
      if (goodId === undefined) {
        throw new RangeError(
          `market needs reference unknown good ${JSON.stringify(item.goodKey)}`,
        );
      }
      critical.add(goodId);
    }
  }
  return critical;
}

function productionInputTier(
  definition: BuildingDef,
  criticalGoods: ReadonlySet<number>,
): ProductionInputTier {
  if (definition.isEssentialInfrastructure) return 2;
  if (definition.outputs.some((output) => criticalGoods.has(output.goodId))) return 2;
  return 5;
}

/**
 * Lookups the integrated day builds once for all of its market-day calls
 * (performance stage, D-137). They are derived from the world at the start of the
 * market phase: blocks, buildings and province membership do not change while
 * markets clear (production moves stock and prices only). A direct caller that
 * passes none gets the same lookups built for its single call.
 */
export interface MarketDayLookups {
  /** The definitions the lookups were built for (D-139 validation memo key). */
  readonly definitions?: EconomyDefinitions;
  readonly blockById: ReadonlyMap<number, World["popBlocks"][number]>;
  /** Buildings, province membership and production capacities (shared with M3c). */
  readonly production: ProductionLookups;
}

export function buildMarketDayLookups(world: World, definitions: EconomyDefinitions): MarketDayLookups {
  const blockById = new Map<number, World["popBlocks"][number]>();
  for (const block of world.popBlocks) {
    if (!blockById.has(block.id)) blockById.set(block.id, block);
  }
  return { definitions, blockById, production: buildProductionLookups(world, definitions) };
}

export interface MarketDayOptions extends PhaseValidationOptions {
  /** Day-level lookups (D-137); built for this call when omitted. */
  readonly lookups?: MarketDayLookups;
  /**
   * `summary` (D-137, `TickContext.detail`) leaves the result lists in production
   * order: no later computation depends on their order (settlement sorts its
   * transactions by their full canonical key). Defaults to `full`.
   */
  readonly detail?: "full" | "summary";
}

/**
 * Duplicate detection for numeric keys (D-139). Rows built by the integrated day
 * arrive in strictly increasing key order, where no duplicate is possible; the set
 * is built only if the order breaks. `add` returns false for a duplicate.
 */
function duplicateKeys(): { add(key: number): boolean } {
  const keys: number[] = [];
  let set: Set<number> | null = null;
  return {
    add(key) {
      if (set === null) {
        const last = keys[keys.length - 1];
        if (last === undefined || key > last) {
          keys.push(key);
          return true;
        }
        set = new Set(keys);
      }
      if (set.has(key)) return false;
      set.add(key);
      return true;
    },
  };
}

interface ValidationMemo {
  readonly goodIds: ReadonlySet<number>;
  readonly buildingById: Map<number, BuildingDef>;
  readonly criticalGoods: ReadonlySet<number>;
}

/** Per-day validation sets, keyed by the day lookups and the needs array (D-139). */
const validationMemos = new WeakMap<MarketDayLookups, Map<readonly NeedTierDef[], ValidationMemo>>();

function validationMemo(
  lookups: MarketDayLookups,
  definitions: EconomyDefinitions,
  needs: readonly NeedTierDef[],
): ValidationMemo {
  let byNeeds = validationMemos.get(lookups);
  if (byNeeds === undefined) {
    byNeeds = new Map();
    validationMemos.set(lookups, byNeeds);
  }
  let memo = byNeeds.get(needs);
  if (memo === undefined || lookups.definitions !== definitions) {
    memo = {
      goodIds: new Set(definitions.goods.map((good) => good.id)),
      buildingById: new Map(definitions.buildings.map((building) => [building.id, building])),
      criticalGoods: criticalGoodIds(definitions, needs),
    };
    if (lookups.definitions === definitions) byNeeds.set(needs, memo);
  }
  return memo;
}

function validateMarketDayInput(
  world: World,
  definitions: EconomyDefinitions,
  input: MarketDayInput,
  options: MarketDayOptions = {},
): {
  readonly marketId: number;
  readonly criticalGoods: ReadonlySet<number>;
  readonly buildingById: Map<number, BuildingDef>;
} {
  if (options.validateWorld !== false) assertValidWorldForTick(world);
  // Staged mode: the integrated day validated the definitions once at its start.
  if (options.validateWorld !== false) assertValidEconomyDefinitions(definitions);
  if (definitions.dataVersion !== world.dataVersion || definitions.scenarioId !== world.scenarioId) {
    throw new RangeError("economy definitions do not match the world data/scenario identity");
  }
  assertValidDayIndex(input.dayIndex);
  if (isTerminalDayIndex(input.dayIndex)) {
    throw new RangeError("market-day clearing cannot run at the terminal boundary");
  }
  if (input.dayIndex !== world.dayIndex) {
    throw new RangeError("market-day input dayIndex must match the world's next day");
  }
  const market = world.markets.find((candidate) => candidate.id === input.marketId);
  if (market === undefined) {
    throw new RangeError(`market-day input references unknown market ${String(input.marketId)}`);
  }
  if (market.priceRUSD.length !== definitions.goods.length) {
    throw new RangeError("market price array does not match the goods definitions");
  }
  const lookups = options.lookups ?? buildMarketDayLookups(world, definitions);
  const marketProvinceIdSet: ReadonlySet<number> =
    lookups.production.provinceIdsByMarket.get(market.id) ?? new Set(marketProvinceIds(world, market.id));
  // D-139: definition-derived sets once per day (memoised on the day lookups).
  const memo = validationMemo(lookups, definitions, input.needs);
  const goodIds = memo.goodIds;
  const blockById = lookups.blockById;
  const buildingById = memo.buildingById;
  const criticalGoods = memo.criticalGoods;
  // Good ids equal their definition index (validated), so these numeric keys are
  // collision-free for uint32 buyer ids.
  const goodCount = definitions.goods.length;
  const householdKeys = duplicateKeys();
  const columns = input.householdColumns;
  if (columns !== undefined && input.householdDemands.length > 0) {
    throw new RangeError("market-day input must not carry both household records and columns");
  }
  const householdRows = columns !== undefined ? columns.popBlockId.length : input.householdDemands.length;
  for (let index = 0; index < householdRows; index += 1) {
    let popBlockId: number;
    let tier: number;
    let goodId: number;
    let desiredValue: unknown;
    let fundedValue: unknown;
    if (columns !== undefined) {
      popBlockId = columns.popBlockId[index] ?? Number.NaN;
      tier = columns.tier[index] ?? 0;
      goodId = columns.goodId[index] ?? Number.NaN;
      desiredValue = columns.desired[index];
      fundedValue = columns.funded[index];
    } else {
      const demand = input.householdDemands[index];
      if (demand === undefined) throw new RangeError("missing household demand");
      popBlockId = demand.popBlockId;
      tier = demand.tier;
      goodId = demand.goodId;
      desiredValue = demand.desiredQuantity;
      fundedValue = demand.fundedQuantity;
    }
    const path = (): string => `householdDemands[${String(index)}]`;
    const block = blockById.get(popBlockId);
    if (block === undefined) {
      throw new RangeError(`${path()}.popBlockId references an unknown pop block`);
    }
    if (!marketProvinceIdSet.has(block.provinceId)) {
      throw new RangeError(`${path()}.popBlockId is outside market ${String(market.id)}`);
    }
    if (!isHouseholdTier(tier)) {
      throw new RangeError(`${path()}.tier must be 1, 3, or 6`);
    }
    if (!goodIds.has(goodId)) throw new RangeError(`${path()}.goodId is unknown`);
    const desired = assertQuantity(desiredValue, `${path()}.desiredQuantity`);
    const funded = assertQuantity(fundedValue, `${path()}.fundedQuantity`);
    if (funded > desired + tolerance(desired, funded)) {
      throw new RangeError(`${path()}.fundedQuantity cannot exceed desiredQuantity`);
    }
    const key = (popBlockId * 8 + tier) * goodCount + goodId;
    if (!householdKeys.add(key)) throw new RangeError(`${path()} duplicates a household demand`);
  }

  const productionKeys = duplicateKeys();
  for (let index = 0; index < input.productionDemands.length; index += 1) {
    const demand = input.productionDemands[index];
    if (demand === undefined) throw new RangeError("missing production demand");
    const path = `productionDemands[${String(index)}]`;
    const building = lookups.production.buildingById.get(demand.buyerBuildingId);
    if (building === undefined) {
      throw new RangeError(`${path}.buyerBuildingId references an unknown building`);
    }
    if (!marketProvinceIdSet.has(building.provinceId)) {
      throw new RangeError(`${path}.buyerBuildingId is outside market ${String(market.id)}`);
    }
    if (!building.operational) {
      throw new RangeError(`${path} references a non-operational building`);
    }
    const definition = buildingById.get(building.definitionId);
    if (definition === undefined) throw new RangeError(`${path} buyer has no definition`);
    if (definition.outputs.length === 0) {
      throw new RangeError(`${path} buyer has no production recipe`);
    }
    if (!definition.inputs.some((candidate) => candidate.goodId === demand.goodId)) {
      throw new RangeError(`${path}.goodId is not an input of the buyer recipe`);
    }
    if (!isProductionTier(demand.tier)) {
      throw new RangeError(`${path}.tier must be 2 or 5`);
    }
    const expectedTier = productionInputTier(definition, criticalGoods);
    if (demand.tier !== expectedTier) {
      throw new RangeError(
        `${path}.tier does not match the approved critical-input classification`,
      );
    }
    const desired = assertQuantity(demand.desiredQuantity, `${path}.desiredQuantity`);
    const funded = assertQuantity(demand.fundedQuantity, `${path}.fundedQuantity`);
    if (funded > desired + tolerance(desired, funded)) {
      throw new RangeError(`${path}.fundedQuantity cannot exceed desiredQuantity`);
    }
    const key = demand.buyerBuildingId * goodCount + demand.goodId;
    if (!productionKeys.add(key)) throw new RangeError(`${path} duplicates a production demand`);
  }

  return { marketId: market.id, criticalGoods, buildingById };
}

function tierMet(desired: number, fulfilled: number): boolean {
  return desired <= tolerance(desired) || fulfilled >= desired - tolerance(desired, fulfilled);
}

/** Update all market prices once, after clearing, using bounded incremental rules. */
export function updateMarketPrices(
  market: { readonly id: number; priceRUSD: number[] },
  goods: readonly { readonly id: number; readonly basePrice1900RUSD: number }[],
  fundedDemandByGood: readonly number[],
  sellableSupplyByGood: readonly number[],
): PriceUpdate[] {
  if (market.priceRUSD.length !== goods.length) {
    throw new RangeError("market price array does not match goods");
  }
  const updates: PriceUpdate[] = [];
  const newPrices = [...market.priceRUSD];
  for (const good of goods) {
    const goodId = good.id;
    const oldPrice = market.priceRUSD[goodId];
    if (oldPrice === undefined || !Number.isFinite(oldPrice) || !(oldPrice > 0)) {
      throw new RangeError(`market price for good ${String(goodId)} is invalid`);
    }
    const fundedDemand = fundedDemandByGood[goodId] ?? 0;
    const sellableSupply = sellableSupplyByGood[goodId] ?? 0;
    if (!Number.isFinite(fundedDemand) || fundedDemand < 0) {
      throw new RangeError(`funded demand for good ${String(goodId)} is invalid`);
    }
    if (!Number.isFinite(sellableSupply) || sellableSupply < 0) {
      throw new RangeError(`sellable supply for good ${String(goodId)} is invalid`);
    }
    const denominator = Math.max(fundedDemand, sellableSupply, M3_PRICE_EPSILON);
    const imbalance = (fundedDemand - sellableSupply) / denominator;
    const boundedChange = Math.max(
      -M3_PRICE_MAX_DAILY_CHANGE,
      Math.min(M3_PRICE_MAX_DAILY_CHANGE, M3_PRICE_KAPPA * imbalance),
    );
    const lower = good.basePrice1900RUSD * M3_PRICE_MIN_RATIO;
    const upper = good.basePrice1900RUSD * M3_PRICE_MAX_RATIO;
    const newPrice = Math.min(upper, Math.max(lower, oldPrice * (1 + boundedChange)));
    if (!Number.isFinite(newPrice) || !(newPrice > 0)) {
      throw new RangeError(`updated price for good ${String(goodId)} is invalid`);
    }
    newPrices[goodId] = newPrice;
    updates.push({
      goodId,
      oldPriceRUSD: oldPrice,
      newPriceRUSD: newPrice,
      fundedDemand,
      sellableSupply,
      imbalance,
      dailyChange: newPrice / oldPrice - 1,
    });
  }
  market.priceRUSD = newPrices;
  return updates;
}

/**
 * Market transactions of one or more market days in columns (D-139). Settlement reads
 * these instead of one object per transaction. `forTransactions` is the exact
 * `pendingTransactions` array they describe: a result whose list was replaced (for
 * example by a test building a malformed result) is settled from its objects.
 */
export interface PendingColumns {
  readonly forTransactions: readonly PendingTransaction[];
  /** 0 = household-purchase, 1 = input-purchase. */
  readonly kind: number[];
  readonly buyer: number[];
  readonly seller: number[];
  readonly good: number[];
  readonly tier: number[];
  /** 0 = A, 1 = B. */
  readonly phase: number[];
  readonly quantity: number[];
  readonly unitPrice: number[];
  readonly total: number[];
}

/** Transient columnar companions of a market-day result (D-139). */
export interface MarketDayColumns {
  readonly transactions: PendingColumns;
  /** Fulfilled quantity of each `input.householdDemands` record, in input order. */
  readonly householdFulfilled: Float64Array;
}

/** Ascending (household before building, buyer id, tier), the allocation order (D-133). */
function allocationOrderSorted(
  indices: number[],
  kind: Uint8Array,
  buyer: Float64Array,
  tier: Uint8Array,
): void {
  const before = (left: number, right: number): number =>
    (kind[left] ?? 0) - (kind[right] ?? 0) ||
    (buyer[left] ?? 0) - (buyer[right] ?? 0) ||
    (tier[left] ?? 0) - (tier[right] ?? 0);
  for (let index = 1; index < indices.length; index += 1) {
    if (before(indices[index - 1] ?? 0, indices[index] ?? 0) > 0) {
      indices.sort(before);
      return;
    }
  }
}

/** Run one deterministic market-day clearing phase. Returns transient pending results. */
export function runMarketDay(
  world: World,
  definitions: EconomyDefinitions,
  input: MarketDayInput,
  options: MarketDayOptions = {},
): MarketDayResult {
  const validated = validateMarketDayInput(world, definitions, input, options);
  const market = world.markets.find((candidate) => candidate.id === validated.marketId);
  if (market === undefined) throw new RangeError("missing market");
  const openingLotArray = market.stockLots;
  const openingPrices = [...market.priceRUSD];
  const lookups = options.lookups ?? buildMarketDayLookups(world, definitions);
  const goodCount = definitions.goods.length;
  const detail = options.detail ?? "full";

  // Demand columns: household records first, then production records (input order).
  const householdColumns = input.householdColumns;
  const householdCount =
    householdColumns !== undefined ? householdColumns.popBlockId.length : input.householdDemands.length;
  const demandCount = householdCount + input.productionDemands.length;
  const kind = new Uint8Array(demandCount);
  const buyer = new Float64Array(demandCount);
  const tierOf = new Uint8Array(demandCount);
  const goodOf = new Int32Array(demandCount);
  const desired = new Float64Array(demandCount);
  const funded = new Float64Array(demandCount);
  const eligible = new Uint8Array(demandCount);
  const passA = new Float64Array(demandCount);
  const passB = new Float64Array(demandCount);
  const fulfilled = new Float64Array(demandCount);
  if (householdColumns !== undefined) {
    for (let index = 0; index < householdCount; index += 1) {
      buyer[index] = householdColumns.popBlockId[index] ?? 0;
      tierOf[index] = householdColumns.tier[index] ?? 0;
      goodOf[index] = householdColumns.goodId[index] ?? 0;
      desired[index] = householdColumns.desired[index] ?? 0;
      funded[index] = householdColumns.funded[index] ?? 0;
    }
  } else {
    for (let index = 0; index < householdCount; index += 1) {
      const demand = input.householdDemands[index] as HouseholdDemandRecord;
      buyer[index] = demand.popBlockId;
      tierOf[index] = demand.tier;
      goodOf[index] = demand.goodId;
      desired[index] = demand.desiredQuantity;
      funded[index] = demand.fundedQuantity;
    }
  }
  for (let index = householdCount; index < demandCount; index += 1) {
    const demand = input.productionDemands[index - householdCount] as ProductionDemandRecord;
    kind[index] = 1;
    buyer[index] = demand.buyerBuildingId;
    tierOf[index] = demand.tier;
    goodOf[index] = demand.goodId;
    desired[index] = demand.desiredQuantity;
    funded[index] = demand.fundedQuantity;
  }
  // Demand indices per tier, then per (tier, good), each in demand order.
  const tierList = new Map<number, number[]>();
  for (const tier of M3_MARKET_TIERS) tierList.set(tier, []);
  for (let index = 0; index < demandCount; index += 1) tierList.get(tierOf[index] ?? 0)?.push(index);
  // Household blocks with tier 1/3 demands get a slot for the eligibility totals.
  const blockSlot = new Map<number, number>();
  const tierOneThree: number[] = [];
  for (let index = 0; index < householdCount; index += 1) {
    const tier = tierOf[index];
    if (tier !== 1 && tier !== 3) continue;
    tierOneThree.push(index);
    if (!blockSlot.has(buyer[index] ?? 0)) blockSlot.set(buyer[index] ?? 0, blockSlot.size);
  }
  const desired1 = new Float64Array(blockSlot.size);
  const fulfilled1 = new Float64Array(blockSlot.size);
  const desired3 = new Float64Array(blockSlot.size);
  const fulfilled3 = new Float64Array(blockSlot.size);
  const slotOfDemand = new Int32Array(householdCount).fill(-1);
  for (let index = 0; index < householdCount; index += 1) slotOfDemand[index] = blockSlot.get(buyer[index] ?? 0) ?? -1;
  // `householdTierTotals` over the current fulfilment, summed in demand order.
  const refreshTotals = (): void => {
    desired1.fill(0);
    fulfilled1.fill(0);
    desired3.fill(0);
    fulfilled3.fill(0);
    for (const index of tierOneThree) {
      const slot = slotOfDemand[index] ?? 0;
      if (tierOf[index] === 1) {
        desired1[slot] = (desired1[slot] ?? 0) + (desired[index] ?? 0);
        fulfilled1[slot] = (fulfilled1[slot] ?? 0) + (fulfilled[index] ?? 0);
      } else {
        desired3[slot] = (desired3[slot] ?? 0) + (desired[index] ?? 0);
        fulfilled3[slot] = (fulfilled3[slot] ?? 0) + (fulfilled[index] ?? 0);
      }
    }
  };
  const isEligible = (index: number): boolean => {
    if (kind[index] !== 0) return true;
    const tier = tierOf[index];
    if (tier === 1) return true;
    const slot = slotOfDemand[index] ?? -1;
    if (slot >= 0 && !tierMet(desired1[slot] ?? 0, fulfilled1[slot] ?? 0)) return false;
    if (tier === 3) return true;
    return slot < 0 || tierMet(desired3[slot] ?? 0, fulfilled3[slot] ?? 0);
  };
  const byGood = (indices: readonly number[]): number[][] => {
    const groups: number[][] = [];
    for (let goodId = 0; goodId < goodCount; goodId += 1) groups.push([]);
    for (const index of indices) groups[goodOf[index] ?? 0]?.push(index);
    return groups;
  };

  // Reservations in columns, in creation order.
  const resKind: number[] = [];
  const resBuyer: number[] = [];
  const resTier: number[] = [];
  const resGood: number[] = [];
  const resSeller: number[] = [];
  const resQuantity: number[] = [];
  const resPhase: number[] = [];

  // Allocation of one (tier, good) group from a lot table (`allocateTierGood`).
  const relevant: number[] = [];
  const plannedQuantity: number[] = [];
  const buyerEnd: number[] = [];
  const lotSlots: number[] = [];
  const lotEnd: number[] = [];
  const allocate = (
    candidates: readonly number[],
    fundedOf: (index: number) => number,
    goodId: number,
    lots: LotTable,
    phase: 0 | 1,
  ): { readonly totalFunded: number; readonly fulfilled: number } => {
    relevant.length = 0;
    for (let item = 0; item < candidates.length; item += 1) {
      const index = candidates[item] as number;
      if (fundedOf(index) > 0) relevant.push(index);
    }
    allocationOrderSorted(relevant, kind, buyer, tierOf);
    let totalFunded = 0;
    for (let item = 0; item < relevant.length; item += 1) totalFunded += fundedOf(relevant[item] as number);
    if (totalFunded <= tolerance(totalFunded)) return { totalFunded: 0, fulfilled: 0 };

    const ownerCount = lots.owners.length;
    const base = goodId * ownerCount;
    lotSlots.length = 0;
    let available = 0;
    for (let slot = 0; slot < ownerCount; slot += 1) {
      const quantity = lots.quantity[base + slot] ?? 0;
      if (lots.present[base + slot] === 1 && quantity > 0) {
        lotSlots.push(slot);
        available += quantity;
      }
    }
    if (available <= 0) return { totalFunded, fulfilled: 0 };

    const fulfilledTotal = Math.min(totalFunded, available);
    const scale = fulfilledTotal / totalFunded;
    plannedQuantity.length = 0;
    let plannedTotal = 0;
    for (let item = 0; item < relevant.length; item += 1) {
      const index = relevant[item] as number;
      const quantity = totalFunded <= available ? fundedOf(index) : fundedOf(index) * scale;
      plannedQuantity.push(quantity);
      plannedTotal += quantity;
    }
    if (Math.abs(plannedTotal - fulfilledTotal) > tolerance(plannedTotal, fulfilledTotal)) {
      throw new RangeError(`market allocation planned quantity does not reconcile for good ${String(goodId)}`);
    }

    // D-133 sequential pairing over the cumulative lot and buyer intervals.
    lotEnd.length = 0;
    let cumulative = 0;
    for (let item = 0; item < lotSlots.length; item += 1) {
      const slot = lotSlots[item] as number;
      cumulative += ((lots.quantity[base + slot] ?? 0) / available) * fulfilledTotal;
      lotEnd.push(cumulative);
    }
    lotEnd[lotEnd.length - 1] = fulfilledTotal;
    buyerEnd.length = 0;
    cumulative = 0;
    for (let item = 0; item < plannedQuantity.length; item += 1) {
      cumulative += plannedQuantity[item] as number;
      buyerEnd.push(cumulative);
    }
    if (buyerEnd.length > 0) buyerEnd[buyerEnd.length - 1] = fulfilledTotal;
    const reservedByLot = new Array<number>(lotSlots.length).fill(0);
    let buyerIndex = 0;
    let lotStart = 0;
    for (let lotIndex = 0; lotIndex < lotSlots.length; lotIndex += 1) {
      const lotStop = lotEnd[lotIndex] ?? lotStart;
      const sellerId = lots.owners[lotSlots[lotIndex] ?? 0] ?? 0;
      while (buyerIndex < relevant.length) {
        const buyerStart = buyerIndex === 0 ? 0 : (buyerEnd[buyerIndex - 1] ?? 0);
        const buyerStop = buyerEnd[buyerIndex] ?? buyerStart;
        const quantity = Math.min(lotStop, buyerStop) - Math.max(lotStart, buyerStart);
        if (quantity > 0) {
          const demand = relevant[buyerIndex] ?? 0;
          fulfilled[demand] = (fulfilled[demand] ?? 0) + quantity;
          if (phase === 0) passA[demand] = (passA[demand] ?? 0) + quantity;
          else passB[demand] = (passB[demand] ?? 0) + quantity;
          resKind.push(kind[demand] ?? 0);
          resBuyer.push(buyer[demand] ?? 0);
          resTier.push(tierOf[demand] ?? 0);
          resGood.push(goodId);
          resSeller.push(sellerId);
          resQuantity.push(quantity);
          resPhase.push(phase);
          reservedByLot[lotIndex] = (reservedByLot[lotIndex] ?? 0) + quantity;
        }
        if (buyerStop <= lotStop) buyerIndex += 1;
        else break;
      }
      lotStart = lotStop;
    }
    let actualFulfilled = 0;
    for (let lotIndex = 0; lotIndex < lotSlots.length; lotIndex += 1) {
      const cell = base + (lotSlots[lotIndex] ?? 0);
      const quantity = lots.quantity[cell] ?? 0;
      const reservedFromLot = reservedByLot[lotIndex] ?? 0;
      actualFulfilled += reservedFromLot;
      const remaining = quantity - reservedFromLot;
      // A lot's reservation is the difference of two cumulative interval ends, so its
      // rounding error scales with the cumulative total, not with the lot (P2b).
      const lotTolerance = tolerance(quantity, reservedFromLot, fulfilledTotal);
      if (remaining < -lotTolerance) {
        throw new RangeError(
          `market reservation exceeds seller lot ${String(goodId)}:${String(lots.owners[lotSlots[lotIndex] ?? 0] ?? 0)}`,
        );
      }
      if (remaining <= lotTolerance) {
        lots.present[cell] = 0;
        lots.quantity[cell] = 0;
      } else {
        lots.quantity[cell] = remaining;
      }
    }
    if (Math.abs(actualFulfilled - fulfilledTotal) > tolerance(actualFulfilled, fulfilledTotal)) {
      throw new RangeError(`market allocation does not reconcile for good ${String(goodId)}`);
    }
    return { totalFunded, fulfilled: actualFulfilled };
  };

  const priceFundedByGood = new Array<number>(goodCount).fill(0);
  const buildingIds = lookups.production.buildingIdsByMarket.get(market.id) ?? [];
  const opening = lotTableFromLots(market.stockLots, buildingIds, goodCount);
  const ownerCount = opening.owners.length;

  try {
    // Pass A: opening stock, tiers 1, 2, 3, 5, 6.
    const remaining = copyLotTable(opening);
    const blockedGoods = new Uint8Array(goodCount);
    for (const tier of M3_MARKET_TIERS) {
      const tierDemands = tierList.get(tier) ?? [];
      refreshTotals();
      for (const index of tierDemands) {
        const isNow = isEligible(index);
        eligible[index] = isNow ? 1 : 0;
        if (isNow) {
          const goodId = goodOf[index] ?? 0;
          priceFundedByGood[goodId] = (priceFundedByGood[goodId] ?? 0) + (funded[index] ?? 0);
        }
      }
      const tierByGood = byGood(tierDemands);
      for (let goodId = 0; goodId < goodCount; goodId += 1) {
        if (blockedGoods[goodId] === 1) continue;
        const candidates = (tierByGood[goodId] ?? []).filter(
          (index) => eligible[index] === 1 && (funded[index] ?? 0) > 0,
        );
        if (candidates.length === 0) continue;
        const allocation = allocate(candidates, (index) => funded[index] ?? 0, goodId, remaining, 0);
        if (
          allocation.totalFunded - allocation.fulfilled >
          tolerance(allocation.totalFunded, allocation.fulfilled)
        ) {
          blockedGoods[goodId] = 1;
        }
      }
    }
    const primaryCount = resKind.length;

    // M3c production from the building reservations of Pass A.
    const inputColumns: ReservationColumns = { buyer: [], good: [], seller: [], quantity: [] };
    for (let index = 0; index < primaryCount; index += 1) {
      if (resKind[index] !== 1) continue;
      (inputColumns.buyer as number[]).push(resBuyer[index] ?? 0);
      (inputColumns.good as number[]).push(resGood[index] ?? 0);
      (inputColumns.seller as number[]).push(resSeller[index] ?? 0);
      (inputColumns.quantity as number[]).push(resQuantity[index] ?? 0);
    }
    if (options.validateWorld !== false) {
      // `runProductionPhase` checks for direct callers (validated above as well).
      if (definitions.dataVersion !== world.dataVersion || definitions.scenarioId !== world.scenarioId) {
        throw new RangeError("economy definitions do not match the world data/scenario identity");
      }
    }
    const productionCore = runProductionCore(
      world,
      definitions,
      market,
      lookups.production,
      opening,
      inputColumns,
      false,
    );
    const produced = productionCore.lots;
    if (options.validateWorld !== false) {
      const candidateLots = lotTableToLots(produced);
      assertValidWorldForTick({
        ...world,
        markets: world.markets.map((candidate) =>
          candidate.id === market.id ? { ...candidate, stockLots: candidateLots } : candidate,
        ),
      });
    }

    // Pass B lots: the produced lots less outstanding household Pass-A reservations.
    const householdReservedByLot = new Float64Array(goodCount * ownerCount);
    const householdPassAByGood = new Float64Array(goodCount);
    for (let index = 0; index < primaryCount; index += 1) {
      if (resKind[index] !== 0) continue;
      const goodId = resGood[index] ?? 0;
      const cell = goodId * ownerCount + (opening.slotOf.get(resSeller[index] ?? 0) ?? 0);
      householdReservedByLot[cell] = (householdReservedByLot[cell] ?? 0) + (resQuantity[index] ?? 0);
      householdPassAByGood[goodId] = (householdPassAByGood[goodId] ?? 0) + (resQuantity[index] ?? 0);
    }
    const passBLots: LotTable = {
      goodCount,
      owners: opening.owners,
      slotOf: opening.slotOf,
      quantity: new Float64Array(goodCount * ownerCount),
      present: new Uint8Array(goodCount * ownerCount),
    };
    for (let cell = 0; cell < goodCount * ownerCount; cell += 1) {
      if (produced.present[cell] !== 1) continue;
      const quantity = produced.quantity[cell] ?? 0;
      const reserved = householdReservedByLot[cell] ?? 0;
      const available = quantity - reserved;
      const goodId = Math.floor(cell / ownerCount);
      if (available < -tolerance(quantity, reserved, householdPassAByGood[goodId] ?? 0)) {
        throw new RangeError(
          `household reservation exceeds current seller lot ${String(goodId)}:${String(opening.owners[cell % ownerCount] ?? 0)}`,
        );
      }
      if (available > 0) {
        passBLots.present[cell] = 1;
        passBLots.quantity[cell] = available;
      }
    }

    const inputCriticalUnmet = new Uint8Array(goodCount);
    const inputRemainingUnmet = new Uint8Array(goodCount);
    for (let index = householdCount; index < demandCount; index += 1) {
      if ((funded[index] ?? 0) - (fulfilled[index] ?? 0) <= tolerance(funded[index] ?? 0, fulfilled[index] ?? 0)) {
        continue;
      }
      const goodId = goodOf[index] ?? 0;
      if (tierOf[index] === 2) inputCriticalUnmet[goodId] = 1;
      else if (tierOf[index] === 5) inputRemainingUnmet[goodId] = 1;
    }

    // Pass B: households only, tiers 1, 3, 6, from same-day output.
    const passBBlocked = new Uint8Array(goodCount);
    for (const tier of [1, 3, 6] as const) {
      // Pass A eligibility reflects opening stock only. Pass B may fill a lower
      // tier from same-day production, so recompute eligibility after each
      // completed tier and include newly unlocked funded demand in the price
      // signal (it was excluded from the Pass-A signal).
      refreshTotals();
      const tierDemands = tierList.get(tier) ?? [];
      for (const index of tierDemands) {
        if (kind[index] !== 0) continue;
        const wasEligible = eligible[index] === 1;
        const isNow = isEligible(index);
        eligible[index] = isNow ? 1 : 0;
        if (!wasEligible && isNow) {
          const goodId = goodOf[index] ?? 0;
          priceFundedByGood[goodId] = (priceFundedByGood[goodId] ?? 0) + (funded[index] ?? 0);
        }
      }
      const open = tierDemands.filter(
        (index) =>
          kind[index] === 0 &&
          eligible[index] === 1 &&
          (funded[index] ?? 0) - (passA[index] ?? 0) > tolerance(funded[index] ?? 0, passA[index] ?? 0),
      );
      const tierByGood = byGood(open);
      for (let goodId = 0; goodId < goodCount; goodId += 1) {
        if (passBBlocked[goodId] === 1) continue;
        if (tier === 3 && inputCriticalUnmet[goodId] === 1) continue;
        if (tier === 6 && (inputCriticalUnmet[goodId] === 1 || inputRemainingUnmet[goodId] === 1)) continue;
        const candidates = tierByGood[goodId] ?? [];
        if (candidates.length === 0) continue;
        const allocation = allocate(
          candidates,
          (index) => (funded[index] ?? 0) - (passA[index] ?? 0),
          goodId,
          passBLots,
          1,
        );
        if (
          allocation.totalFunded - allocation.fulfilled >
          tolerance(allocation.totalFunded, allocation.fulfilled)
        ) {
          passBBlocked[goodId] = 1;
        }
      }
    }

    // Final lots: the produced lots less every household reservation (A then B).
    const householdByLot = new Float64Array(goodCount * ownerCount);
    const householdByGood = new Float64Array(goodCount);
    for (let index = 0; index < resKind.length; index += 1) {
      if (resKind[index] !== 0) continue;
      const goodId = resGood[index] ?? 0;
      const cell = goodId * ownerCount + (opening.slotOf.get(resSeller[index] ?? 0) ?? 0);
      householdByLot[cell] = (householdByLot[cell] ?? 0) + (resQuantity[index] ?? 0);
      householdByGood[goodId] = (householdByGood[goodId] ?? 0) + (resQuantity[index] ?? 0);
    }
    const finalLots: LotTable = {
      goodCount,
      owners: opening.owners,
      slotOf: opening.slotOf,
      quantity: new Float64Array(goodCount * ownerCount),
      present: new Uint8Array(goodCount * ownerCount),
    };
    for (let cell = 0; cell < goodCount * ownerCount; cell += 1) {
      if (produced.present[cell] !== 1) continue;
      const quantity = produced.quantity[cell] ?? 0;
      const consumed = householdByLot[cell] ?? 0;
      const remainingQuantity = quantity - consumed;
      const goodId = Math.floor(cell / ownerCount);
      // D-136: reservations are differences of cumulative interval ends, so the
      // rounding error scales with the good's household total, not with one lot.
      if (remainingQuantity < -tolerance(quantity, consumed, householdByGood[goodId] ?? 0)) {
        throw new RangeError(
          `fulfilled household demand exceeds seller lot ${String(goodId)}:${String(opening.owners[cell % ownerCount] ?? 0)}`,
        );
      }
      if (remainingQuantity > 0) {
        finalLots.present[cell] = 1;
        finalLots.quantity[cell] = remainingQuantity;
      }
    }
    const overflowLosses = applyOverflowToTable(
      finalLots,
      storageCapacityOf(world, definitions, market.id, lookups.production),
      goodCount,
    );
    const closingLots = lotTableToLots(finalLots);
    if (options.validateWorld !== false) {
      assertValidWorldForTick({
        ...world,
        markets: world.markets.map((candidate) =>
          candidate.id === market.id ? { ...candidate, stockLots: closingLots } : candidate,
        ),
      });
    }
    market.stockLots = closingLots;

    // Pending transactions: household reservations, then input uses.
    const inputTier = new Map<number, number>();
    for (let index = householdCount; index < demandCount; index += 1) {
      inputTier.set((buyer[index] ?? 0) * goodCount + (goodOf[index] ?? 0), tierOf[index] ?? 0);
    }
    const pendingTransactions: PendingTransaction[] = [];
    const transactions: PendingColumns = {
      forTransactions: pendingTransactions,
      kind: [],
      buyer: [],
      seller: [],
      good: [],
      tier: [],
      phase: [],
      quantity: [],
      unitPrice: [],
      total: [],
    };
    const pushTransaction = (
      transactionKind: 0 | 1,
      buyerId: number,
      sellerId: number,
      goodId: number,
      tier: number,
      phase: number,
      quantity: number,
    ): void => {
      const unitPrice = openingPrices[goodId] ?? 0;
      transactions.kind.push(transactionKind);
      transactions.buyer.push(buyerId);
      transactions.seller.push(sellerId);
      transactions.good.push(goodId);
      transactions.tier.push(tier);
      transactions.phase.push(phase);
      transactions.quantity.push(quantity);
      transactions.unitPrice.push(unitPrice);
      transactions.total.push(quantity * unitPrice);
    };
    for (let index = 0; index < resKind.length; index += 1) {
      if (resKind[index] !== 0) continue;
      pushTransaction(
        0,
        resBuyer[index] ?? 0,
        resSeller[index] ?? 0,
        resGood[index] ?? 0,
        resTier[index] ?? 0,
        resPhase[index] ?? 0,
        resQuantity[index] ?? 0,
      );
    }
    const uses = productionCore.uses;
    for (let index = 0; index < uses.buyer.length; index += 1) {
      const used = uses.used[index] ?? 0;
      if (!(used > 0)) continue;
      const buyerId = uses.buyer[index] ?? 0;
      const goodId = uses.good[index] ?? 0;
      const tier = inputTier.get(buyerId * goodCount + goodId);
      if (tier === undefined) throw new RangeError("production input use has no matching reservation");
      pushTransaction(1, buyerId, uses.seller[index] ?? 0, goodId, tier, 0, used);
    }

    // D-136 (amends D-040): sellable supply is the opening stock plus same-day output,
    // less the funded input demand of producers. Households may buy the day's output
    // (Pass B), but producers buy only from the opening stock, so a market must carry
    // one day of input demand into the next day; counting that carry as supply made
    // every balanced market with intermediate goods read as a glut and drift to the floor.
    const inputFundedByGood = new Array<number>(goodCount).fill(0);
    for (let index = householdCount; index < demandCount; index += 1) {
      if (eligible[index] === 1) {
        const goodId = goodOf[index] ?? 0;
        inputFundedByGood[goodId] = (inputFundedByGood[goodId] ?? 0) + (funded[index] ?? 0);
      }
    }
    const productionInventory = productionCore.inventory;
    const flowOf = (goodId: number): InventoryFlow | undefined =>
      productionInventory[goodId]?.goodId === goodId
        ? productionInventory[goodId]
        : productionInventory.find((flow) => flow.goodId === goodId);
    const sellableSupplyByGood = definitions.goods.map((good) => {
      const intermediate = flowOf(good.id);
      return Math.max(
        0,
        (intermediate?.openingStock ?? 0) + (intermediate?.production ?? 0) - (inputFundedByGood[good.id] ?? 0),
      );
    });
    const priceUpdates = updateMarketPrices(
      market,
      definitions.goods,
      priceFundedByGood,
      sellableSupplyByGood,
    );

    const householdConsumptionByGood = new Array<number>(goodCount).fill(0);
    for (let index = 0; index < resKind.length; index += 1) {
      if (resKind[index] !== 0) continue;
      const goodId = resGood[index] ?? 0;
      householdConsumptionByGood[goodId] = (householdConsumptionByGood[goodId] ?? 0) + (resQuantity[index] ?? 0);
    }
    const lossByGood = new Array<number>(goodCount).fill(0);
    for (const loss of overflowLosses) {
      lossByGood[loss.goodId] = (lossByGood[loss.goodId] ?? 0) + loss.quantity;
    }
    const finalStock = deriveStockByGood(market, goodCount);
    const inventory: MarketInventoryFlow[] = definitions.goods.map((good) => {
      const goodId = good.id;
      const intermediate = flowOf(goodId);
      const openingStock = intermediate?.openingStock ?? 0;
      const producedQuantity = intermediate?.production ?? 0;
      const used = intermediate?.usedAsInput ?? 0;
      const household = householdConsumptionByGood[goodId] ?? 0;
      const loss = lossByGood[goodId] ?? 0;
      const closing = finalStock[goodId] ?? 0;
      const expected = openingStock + producedQuantity - used - household - loss;
      // Scale the physical tolerance by the gross terms, not only by the
      // residual: with large populations the conservation identity subtracts
      // large nearly equal quantities and can leave a tiny non-zero residual.
      if (
        Math.abs(expected - closing) >
        tolerance(openingStock, producedQuantity, used, household, loss, expected, closing)
      ) {
        throw new RangeError(
          `final inventory conservation failed for good ${String(goodId)}: ${String(expected)} != ${String(closing)}`,
        );
      }
      return {
        goodId,
        openingStock,
        production: producedQuantity,
        usedAsInput: used,
        householdConsumption: household,
        recordedLoss: loss,
        closingStock: closing,
      };
    });

    const householdFulfilled = fulfilled.slice(0, householdCount);
    const production: ProductionPhaseResult = {
      marketId: market.id,
      buildings: productionCore.buildings,
      reservationUses: detail === "full" ? reservationUseObjects(market.id, uses) : [],
      inventory: productionInventory,
      overflowLosses: [],
    };
    const result: MarketDayResult = {
      marketId: market.id,
      dayIndex: input.dayIndex,
      openingPrices,
      updatedPrices: [...market.priceRUSD],
      householdDemands: [],
      productionDemands: [],
      reservations: [],
      householdPurchases: [],
      pendingTransactions,
      production,
      priceUpdates,
      inventory,
      overflowLosses,
      settled: false,
    };
    // Transient companions (D-139), non-enumerable: they are a cache of this result,
    // not part of its public shape, so equality checks and copies (`{ ...result }`)
    // see the same result as before and a copied result settles from its objects.
    Object.defineProperty(result, "columns", {
      value: { transactions, householdFulfilled } satisfies MarketDayColumns,
      enumerable: false,
      writable: false,
    });
    if (detail === "full") {
      fillFullDetail(result, {
        householdCount,
        kind,
        buyer,
        tierOf,
        goodOf,
        desired,
        funded,
        passA,
        passB,
        fulfilled,
        uses,
        reservations: { resKind, resBuyer, resTier, resGood, resSeller, resQuantity, resPhase },
      });
    }
    return result;
  } catch (error) {
    market.stockLots = openingLotArray;
    market.priceRUSD = openingPrices;
    throw error;
  }
}

/**
 * The full-detail result lists (D-137 `detail: "full"`), built from the columns in
 * the canonical orders of the former implementation. `pendingTransactions` is filled
 * in place so the columns keep describing that exact array.
 */
function fillFullDetail(
  result: MarketDayResult,
  data: {
    readonly householdCount: number;
    readonly kind: Uint8Array;
    readonly buyer: Float64Array;
    readonly tierOf: Uint8Array;
    readonly goodOf: Int32Array;
    readonly desired: Float64Array;
    readonly funded: Float64Array;
    readonly passA: Float64Array;
    readonly passB: Float64Array;
    readonly fulfilled: Float64Array;
    readonly uses: ReservationUseColumns;
    readonly reservations: {
      readonly resKind: readonly number[];
      readonly resBuyer: readonly number[];
      readonly resTier: readonly number[];
      readonly resGood: readonly number[];
      readonly resSeller: readonly number[];
      readonly resQuantity: readonly number[];
      readonly resPhase: readonly number[];
    };
  },
): void {
  const { householdCount, kind, buyer, tierOf, goodOf, desired, funded, passA, passB, fulfilled } = data;
  const mutable = result as {
    -readonly [K in keyof MarketDayResult]: MarketDayResult[K];
  };
  const householdDemandResults: HouseholdDemandResult[] = [];
  const productionDemandResults: ProductionDemandResult[] = [];
  const usedInputByDemand = new Map<number, number>();
  const goodCount = result.openingPrices.length;
  for (let index = 0; index < data.uses.buyer.length; index += 1) {
    const key = (data.uses.buyer[index] ?? 0) * goodCount + (data.uses.good[index] ?? 0);
    usedInputByDemand.set(key, (usedInputByDemand.get(key) ?? 0) + (data.uses.used[index] ?? 0));
  }
  for (let index = 0; index < kind.length; index += 1) {
    if (kind[index] === 0) {
      householdDemandResults.push({
        popBlockId: buyer[index] ?? 0,
        tier: (tierOf[index] ?? 1) as HouseholdTier,
        goodId: goodOf[index] ?? 0,
        desiredQuantity: desired[index] ?? 0,
        fundedQuantity: funded[index] ?? 0,
        passAFulfilled: passA[index] ?? 0,
        passBFulfilled: passB[index] ?? 0,
        fulfilledQuantity: fulfilled[index] ?? 0,
        unmetFunded: Math.max(0, (funded[index] ?? 0) - (fulfilled[index] ?? 0)),
        unmetDesired: Math.max(0, (desired[index] ?? 0) - (fulfilled[index] ?? 0)),
      });
    } else {
      const reserved = fulfilled[index] ?? 0;
      const used = usedInputByDemand.get((buyer[index] ?? 0) * goodCount + (goodOf[index] ?? 0)) ?? 0;
      productionDemandResults.push({
        buyerBuildingId: buyer[index] ?? 0,
        tier: (tierOf[index] ?? 2) as ProductionInputTier,
        goodId: goodOf[index] ?? 0,
        desiredQuantity: desired[index] ?? 0,
        fundedQuantity: funded[index] ?? 0,
        reservedQuantity: reserved,
        usedQuantity: used,
        releasedQuantity: Math.max(0, reserved - used),
      });
    }
  }
  void householdCount;
  householdDemandResults.sort((left, right) =>
    left.popBlockId !== right.popBlockId
      ? left.popBlockId - right.popBlockId
      : left.tier !== right.tier
        ? left.tier - right.tier
        : left.goodId - right.goodId,
  );
  productionDemandResults.sort((left, right) =>
    left.buyerBuildingId !== right.buyerBuildingId
      ? left.buyerBuildingId - right.buyerBuildingId
      : left.goodId - right.goodId,
  );
  const r = data.reservations;
  const reservations: MarketReservation[] = [];
  const householdPurchases: HouseholdPurchase[] = [];
  for (let index = 0; index < r.resKind.length; index += 1) {
    const reservation: MarketReservation = {
      buyerKind: r.resKind[index] === 0 ? "household" : "building",
      buyerId: r.resBuyer[index] ?? 0,
      tier: (r.resTier[index] ?? 1) as MarketTier,
      goodId: r.resGood[index] ?? 0,
      sellerBuildingId: r.resSeller[index] ?? 0,
      quantity: r.resQuantity[index] ?? 0,
      phase: r.resPhase[index] === 0 ? "A" : "B",
    };
    reservations.push(reservation);
    if (reservation.buyerKind === "household") {
      const unitPrice = result.openingPrices[reservation.goodId] ?? 0;
      householdPurchases.push({
        popBlockId: reservation.buyerId,
        tier: reservation.tier as HouseholdTier,
        goodId: reservation.goodId,
        sellerBuildingId: reservation.sellerBuildingId,
        quantity: reservation.quantity,
        unitPriceRUSD: unitPrice,
        totalRUSD: reservation.quantity * unitPrice,
        phase: reservation.phase,
      });
    }
  }
  reservations.sort((left, right) => {
    if (left.phase !== right.phase) return left.phase < right.phase ? -1 : 1;
    if (left.tier !== right.tier) return left.tier - right.tier;
    if (left.buyerKind !== right.buyerKind) return left.buyerKind < right.buyerKind ? -1 : 1;
    if (left.buyerId !== right.buyerId) return left.buyerId - right.buyerId;
    if (left.goodId !== right.goodId) return left.goodId - right.goodId;
    return left.sellerBuildingId - right.sellerBuildingId;
  });
  householdPurchases.sort((left, right) => {
    if (left.popBlockId !== right.popBlockId) return left.popBlockId - right.popBlockId;
    if (left.tier !== right.tier) return left.tier - right.tier;
    if (left.goodId !== right.goodId) return left.goodId - right.goodId;
    return left.sellerBuildingId - right.sellerBuildingId;
  });
  const columns = result.columns?.transactions;
  const pending = result.pendingTransactions as PendingTransaction[];
  if (columns !== undefined) {
    for (let index = 0; index < columns.kind.length; index += 1) {
      const household = columns.kind[index] === 0;
      pending.push({
        kind: household ? "household-purchase" : "input-purchase",
        buyerPopBlockId: household ? (columns.buyer[index] ?? 0) : null,
        buyerBuildingId: household ? null : (columns.buyer[index] ?? 0),
        sellerBuildingId: columns.seller[index] ?? 0,
        goodId: columns.good[index] ?? 0,
        quantity: columns.quantity[index] ?? 0,
        unitPriceRUSD: columns.unitPrice[index] ?? 0,
        totalRUSD: columns.total[index] ?? 0,
        tier: (columns.tier[index] ?? 1) as MarketTier,
        phase: columns.phase[index] === 0 ? "A" : "B",
      });
    }
  }
  pending.sort((left, right) => {
    if (left.kind !== right.kind) return left.kind < right.kind ? -1 : 1;
    if (left.goodId !== right.goodId) return left.goodId - right.goodId;
    const leftBuyer = left.buyerPopBlockId ?? left.buyerBuildingId ?? -1;
    const rightBuyer = right.buyerPopBlockId ?? right.buyerBuildingId ?? -1;
    if (leftBuyer !== rightBuyer) return leftBuyer - rightBuyer;
    return left.sellerBuildingId - right.sellerBuildingId;
  });
  mutable.householdDemands = householdDemandResults;
  mutable.productionDemands = productionDemandResults;
  mutable.reservations = reservations;
  mutable.householdPurchases = householdPurchases;
  (mutable.production as { reservationUses: readonly ReservationUse[] }).reservationUses = reservationUseObjects(
    result.marketId,
    data.uses,
  );
}
