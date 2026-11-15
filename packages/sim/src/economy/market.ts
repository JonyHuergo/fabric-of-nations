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

import type { MintStandingOffer } from "./mint.js";
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
  purchaseRole,
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
import { attachProductionColumns, mergeProductionColumns, productionBuildingObjects } from "./productionColumns.js";
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
  /**
   * D-149: the standing offers of the mints whose home is this market. Their demand is
   * added to the metal's funded demand and their supply to its sellable supply in the
   * price update only; the purchases and sales themselves run in the monetary phase.
   */
  readonly mintOffers?: readonly MintStandingOffer[];
}

/** Household demand records in columns, row `i` being record `i` (D-139). */
export interface HouseholdDemandColumns {
  readonly popBlockId: ArrayLike<number>;
  readonly tier: ArrayLike<number>;
  readonly goodId: ArrayLike<number>;
  readonly desired: ArrayLike<number>;
  readonly funded: ArrayLike<number>;
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

/**
 * QUANTITY_TOLERANCE scaled by the largest magnitude, at least 1. Fixed arity (D-139): the
 * former rest parameter allocated an array on every call; a missing value is 0,
 * which never raises the scale above 1, so the result is unchanged.
 */
function tolerance(a: number, b = 0, c = 0, d = 0, e = 0, f = 0, g = 0, h = 0): number {
  return (
    QUANTITY_TOLERANCE *
    Math.max(1, Math.abs(a), Math.abs(b), Math.abs(c), Math.abs(d), Math.abs(e), Math.abs(f), Math.abs(g), Math.abs(h))
  );
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
  /** P5b: ids of the goods that cannot be stored (production waves). */
  readonly nonStorableGoods: ReadonlySet<number>;
}

export function buildMarketDayLookups(world: World, definitions: EconomyDefinitions): MarketDayLookups {
  const blockById = new Map<number, World["popBlocks"][number]>();
  for (const block of world.popBlocks) {
    if (!blockById.has(block.id)) blockById.set(block.id, block);
  }
  const nonStorableGoods = new Set(definitions.goods.filter((good) => good.storable === false).map((good) => good.id));
  return { definitions, blockById, production: buildProductionLookups(world, definitions), nonStorableGoods };
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
  /**
   * D-158: the integrated day built the demand rows itself (household demand from the
   * demand system, producers' from their recipes and cash), so the per-row checks of
   * `validateMarketDayInput` and the per-reservation checks of production are skipped.
   * Direct callers keep every check.
   */
  readonly trustedInput?: boolean;
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
  const householdRows =
    options.trustedInput === true ? 0 : columns !== undefined ? columns.popBlockId.length : input.householdDemands.length;
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
    // `assertQuantity`'s check and message; the path is built only on failure (D-139).
    if (typeof desiredValue !== "number" || !Number.isFinite(desiredValue) || desiredValue < 0) {
      throw new RangeError(`${path()}.desiredQuantity must be a finite non-negative number`);
    }
    if (typeof fundedValue !== "number" || !Number.isFinite(fundedValue) || fundedValue < 0) {
      throw new RangeError(`${path()}.fundedQuantity must be a finite non-negative number`);
    }
    const desired = desiredValue;
    const funded = fundedValue;
    if (funded > desired + tolerance(desired, funded)) {
      throw new RangeError(`${path()}.fundedQuantity cannot exceed desiredQuantity`);
    }
    const key = (popBlockId * 8 + tier) * goodCount + goodId;
    if (!householdKeys.add(key)) throw new RangeError(`${path()} duplicates a household demand`);
  }

  const productionKeys = duplicateKeys();
  const productionRows = options.trustedInput === true ? 0 : input.productionDemands.length;
  for (let index = 0; index < productionRows; index += 1) {
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
    const role = purchaseRole(definition, demand.goodId);
    if (role === null) {
      throw new RangeError(`${path}.goodId is not an input of the buyer recipe`);
    }
    if (!isProductionTier(demand.tier)) {
      throw new RangeError(`${path}.tier must be 2 or 5`);
    }
    // P5b: optional and maintenance purchases are always non-critical (tier 5).
    const expectedTier = role === "input" ? productionInputTier(definition, criticalGoods) : 5;
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

/**
 * D-158: the money of one market day, as settlement posts it. Household spend is the sum of
 * each demand row's pieces at the opening price; sellers' household receipts the same pieces
 * by seller; input purchases one entry per used reservation (quantity used × opening price).
 */
export interface MarketFlowColumns {
  /** Buyer block of each household demand row (input order). */
  readonly householdBuyer: Float64Array;
  /** Spend of each household demand row, RUSD. */
  readonly householdSpend: Float64Array;
  /** Household-purchase receipts by seller building, in lot-slot order. */
  readonly householdSellerId: number[];
  readonly householdSellerAmount: number[];
  /** Input purchases (buyer building, seller building, RUSD), in use order. */
  readonly inputBuyer: number[];
  readonly inputSeller: number[];
  readonly inputAmount: number[];
}

/** Transient columnar companions of a market-day result (D-139). */
export interface MarketDayColumns {
  /** Full detail only (D-158): the transactions behind `pendingTransactions`. */
  readonly transactions: PendingColumns;
  /** Fulfilled quantity of each `input.householdDemands` record, in input order. */
  readonly householdFulfilled: Float64Array;
  /** D-158: the day's money flows of this market. */
  readonly flows: MarketFlowColumns;
}

/**
 * Ascending (household before building, buyer id, tier), the allocation order (D-133), of
 * the first `count` indices. D-160: typed scratch with a count; an unsorted run is sorted
 * through an array with the same stable sort and comparator as before.
 */
function allocationOrderSorted(
  indices: Int32Array,
  count: number,
  kind: Uint8Array,
  buyer: Float64Array,
  tier: Uint8Array,
): void {
  const before = (left: number, right: number): number =>
    (kind[left] ?? 0) - (kind[right] ?? 0) ||
    (buyer[left] ?? 0) - (buyer[right] ?? 0) ||
    (tier[left] ?? 0) - (tier[right] ?? 0);
  for (let index = 1; index < count; index += 1) {
    if (before(indices[index - 1] ?? 0, indices[index] ?? 0) > 0) {
      const sorted = Array.from(indices.subarray(0, count)).sort(before);
      indices.set(sorted);
      return;
    }
  }
}

/**
 * P5b (D-146 A4): the production waves of one market day, or null when no producer
 * has funded demand for a non-storable good (the single-wave path). The first wave is
 * every building of the market that makes a non-storable good; the second, the rest.
 */
function productionWaves(
  definitions: EconomyDefinitions,
  marketId: number,
  lookups: MarketDayLookups,
  kind: Uint8Array,
  goodOf: Int32Array,
  funded: Float64Array,
  householdCount: number,
  demandCount: number,
): { first: ReadonlySet<number>; second: ReadonlySet<number>; goods: readonly number[] } | null {
  const nonStorable = lookups.nonStorableGoods;
  if (nonStorable.size === 0) return null;
  const goods = new Set<number>();
  for (let index = householdCount; index < demandCount; index += 1) {
    if (kind[index] !== 1) continue;
    const goodId = goodOf[index] ?? 0;
    if (nonStorable.has(goodId) && (funded[index] ?? 0) > 0) goods.add(goodId);
  }
  if (goods.size === 0) return null;
  const definitionById = lookups.production.definitionById ?? new Map(definitions.buildings.map((entry) => [entry.id, entry]));
  const first = new Set<number>();
  const second = new Set<number>();
  for (const buildingId of lookups.production.buildingIdsByMarket.get(marketId) ?? []) {
    const building = lookups.production.buildingById.get(buildingId);
    const definition = building === undefined ? undefined : definitionById.get(building.definitionId);
    if (definition !== undefined && definition.outputs.some((output) => nonStorable.has(output.goodId))) first.add(buildingId);
    else second.add(buildingId);
  }
  return { first, second, goods: [...goods].sort((left, right) => left - right) };
}

/**
 * D-149: the funded demand and sellable supply of a metal once the issuer's mint has bid
 * or offered. The price rule is change = clamp(KAPPA x (D - S) / max(D, S, EPSILON));
 * the mint's quantity is the one that makes the rule move the price to its target (the
 * buy point from below, the export point from above, no change between them), within the
 * mint's capacity. The flows are what the mint stands ready to trade, not a price clamp:
 * without cash or metal the price moves freely.
 */
export function mintAdjustedFlows(
  price: number,
  funded: number,
  supply: number,
  offer: MintStandingOffer,
): { readonly funded: number; readonly supply: number } {
  const target = price < offer.buyPrice ? offer.buyPrice : price > offer.sellPrice ? offer.sellPrice : price;
  const change = Math.max(-M3_PRICE_MAX_DAILY_CHANGE, Math.min(M3_PRICE_MAX_DAILY_CHANGE, target / price - 1));
  const x = change / M3_PRICE_KAPPA; // the imbalance that gives this change
  if (x === 0) {
    // Between the points: take up excess supply or meet excess demand, so the price stays.
    if (supply > funded) return { funded: funded + Math.min(offer.buyCapacity, supply - funded), supply };
    return { funded, supply: supply + Math.min(offer.sellCapacity, funded - supply) };
  }
  if (x > 0) {
    // Demand D' with (D' - S) / max(D', S, EPS) = x.
    let wanted: number;
    if (x >= 1) wanted = Number.POSITIVE_INFINITY;
    else if (supply + x * M3_PRICE_EPSILON <= M3_PRICE_EPSILON) wanted = Math.max(supply + x * M3_PRICE_EPSILON, supply);
    else wanted = supply / (1 - x);
    const bid = Math.max(0, Math.min(offer.buyCapacity, wanted - funded));
    return { funded: funded + bid, supply };
  }
  // Supply S' with (D - S') / max(D, S', EPS) = x (x < 0).
  let wanted: number;
  if (x <= -1) wanted = Number.POSITIVE_INFINITY;
  else if (funded - x * M3_PRICE_EPSILON <= M3_PRICE_EPSILON) wanted = Math.max(funded - x * M3_PRICE_EPSILON, funded);
  else wanted = funded / (1 + x);
  const ask = Math.max(0, Math.min(offer.sellCapacity, wanted - supply));
  return { funded, supply: supply + ask };
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
  const trusted = options.trustedInput === true;

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
    // D-158: typed columns are copied in bulk.
    buyer.set(householdColumns.popBlockId);
    tierOf.set(householdColumns.tier);
    goodOf.set(householdColumns.goodId);
    desired.set(householdColumns.desired);
    funded.set(householdColumns.funded);
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
  // D-158: demand indices grouped by (tier, good), each group in demand order, by one stable
  // counting sort; group = tier position (M3_MARKET_TIERS order) × goods + good. A tier's
  // groups are contiguous, so a tier is one range too.
  const tierPosition = new Int8Array(8).fill(-1);
  M3_MARKET_TIERS.forEach((tier, position) => {
    tierPosition[tier] = position;
  });
  const groupCount = M3_MARKET_TIERS.length * goodCount;
  const groupStart = new Int32Array(groupCount + 1);
  const groupOfDemand = new Int32Array(demandCount);
  for (let index = 0; index < demandCount; index += 1) {
    const position = tierPosition[tierOf[index] ?? 0] ?? -1;
    const goodId = goodOf[index] ?? 0;
    const group = position < 0 || goodId < 0 || goodId >= goodCount ? -1 : position * goodCount + goodId;
    groupOfDemand[index] = group;
    if (group >= 0) groupStart[group + 1] = (groupStart[group + 1] ?? 0) + 1;
  }
  for (let group = 0; group < groupCount; group += 1) groupStart[group + 1] = (groupStart[group + 1] ?? 0) + (groupStart[group] ?? 0);
  const groupOrder = new Int32Array(groupStart[groupCount] ?? 0);
  {
    const fill = groupStart.slice(0, groupCount);
    for (let index = 0; index < demandCount; index += 1) {
      const group = groupOfDemand[index] ?? -1;
      if (group < 0) continue;
      groupOrder[fill[group] ?? 0] = index;
      fill[group] = (fill[group] ?? 0) + 1;
    }
  }
  const tierRangeStart = (tier: number): number => groupStart[(tierPosition[tier] ?? 0) * goodCount] ?? 0;
  const tierRangeEnd = (tier: number): number => groupStart[((tierPosition[tier] ?? 0) + 1) * goodCount] ?? 0;
  const groupOf = (tier: number, goodId: number): number => (tierPosition[tier] ?? 0) * goodCount + goodId;
  // D-160: a group's candidates (and below, its relevant rows) never exceed the largest group.
  let largestGroup = 0;
  for (let group = 0; group < groupCount; group += 1) {
    const size = (groupStart[group + 1] ?? 0) - (groupStart[group] ?? 0);
    if (size > largestGroup) largestGroup = size;
  }
  /** Candidate scratch for one (tier, good) allocation. */
  const candidates = new Int32Array(largestGroup);
  // Household blocks with tier 1/3 demands get a slot for the eligibility totals.
  // D-158: slots by block id in a typed table (first-use order, as the former map); a buyer id
  // the table cannot address (not a small non-negative integer) falls back to the map.
  let maxBuyerId = -1;
  let denseBuyers = true;
  for (let index = 0; index < householdCount; index += 1) {
    const id = buyer[index] ?? 0;
    if (!(Number.isInteger(id) && id >= 0 && id < 2 ** 24)) denseBuyers = false;
    else if (id > maxBuyerId) maxBuyerId = id;
  }
  const slotById = denseBuyers ? new Int32Array(maxBuyerId + 1).fill(-1) : null;
  const slotMap = denseBuyers ? null : new Map<number, number>();
  let slotCount = 0;
  const slotOfBlock = (id: number): number =>
    slotById !== null ? (slotById[id] ?? -1) : ((slotMap as Map<number, number>).get(id) ?? -1);
  // D-160: typed with a fill count (was an array grown by push in every market).
  const tierOneThree = new Int32Array(householdCount);
  let tierOneThreeCount = 0;
  for (let index = 0; index < householdCount; index += 1) {
    const tier = tierOf[index];
    if (tier !== 1 && tier !== 3) continue;
    tierOneThree[tierOneThreeCount] = index;
    tierOneThreeCount += 1;
    const id = buyer[index] ?? 0;
    if (slotOfBlock(id) < 0) {
      if (slotById !== null) slotById[id] = slotCount;
      else (slotMap as Map<number, number>).set(id, slotCount);
      slotCount += 1;
    }
  }
  const blockSlot = { size: slotCount };
  const desired1 = new Float64Array(blockSlot.size);
  const fulfilled1 = new Float64Array(blockSlot.size);
  const desired3 = new Float64Array(blockSlot.size);
  const fulfilled3 = new Float64Array(blockSlot.size);
  /**
   * D-158: `tierMet` of each slot's tier-1 and tier-3 totals, computed when the totals are
   * refreshed (its only inputs), instead of once per demand row that asks.
   */
  const met1 = new Uint8Array(blockSlot.size);
  const met3 = new Uint8Array(blockSlot.size);
  const slotOfDemand = new Int32Array(householdCount).fill(-1);
  for (let index = 0; index < householdCount; index += 1) slotOfDemand[index] = slotOfBlock(buyer[index] ?? 0);
  // `householdTierTotals` over the current fulfilment, summed in demand order.
  // D-139: desired totals never change; fulfilled totals are re-summed (in the same
  // demand order, from zero) only after an allocation changed a tier-1/3 household
  // fulfilment, which is when the former per-pass recomputation could differ.
  for (let item = 0; item < tierOneThreeCount; item += 1) {
    const index = tierOneThree[item] as number;
    const slot = slotOfDemand[index] ?? 0;
    if (tierOf[index] === 1) desired1[slot] = (desired1[slot] ?? 0) + (desired[index] ?? 0);
    else desired3[slot] = (desired3[slot] ?? 0) + (desired[index] ?? 0);
  }
  let totalsStale = true;
  const refreshTotals = (): void => {
    if (!totalsStale) return;
    totalsStale = false;
    fulfilled1.fill(0);
    fulfilled3.fill(0);
    for (let item = 0; item < tierOneThreeCount; item += 1) {
      const index = tierOneThree[item] as number;
      const slot = slotOfDemand[index] ?? 0;
      if (tierOf[index] === 1) fulfilled1[slot] = (fulfilled1[slot] ?? 0) + (fulfilled[index] ?? 0);
      else fulfilled3[slot] = (fulfilled3[slot] ?? 0) + (fulfilled[index] ?? 0);
    }
    for (let slot = 0; slot < met1.length; slot += 1) {
      met1[slot] = tierMet(desired1[slot] ?? 0, fulfilled1[slot] ?? 0) ? 1 : 0;
      met3[slot] = tierMet(desired3[slot] ?? 0, fulfilled3[slot] ?? 0) ? 1 : 0;
    }
  };
  const isEligible = (index: number): boolean => {
    if (kind[index] !== 0) return true;
    const tier = tierOf[index];
    if (tier === 1) return true;
    const slot = slotOfDemand[index] ?? -1;
    if (slot >= 0 && met1[slot] !== 1) return false;
    if (tier === 3) return true;
    return slot < 0 || met3[slot] === 1;
  };

  // Reservations in columns, in creation order. D-158: household pieces are kept only in full
  // detail; their quantities and money go straight into the totals declared with the lots.
  const storeHouseholdPieces = detail === "full";
  // D-160: typed columns with a fill count `resCount`, doubled when full (were arrays grown by
  // push); the unread seller-slot column is gone.
  let resCapacity = Math.max(64, 2 * (demandCount - householdCount) + (storeHouseholdPieces ? householdCount : 0));
  let resKind = new Uint8Array(resCapacity);
  let resBuyer = new Float64Array(resCapacity);
  let resTier = new Uint8Array(resCapacity);
  let resGood = new Int32Array(resCapacity);
  let resSeller = new Float64Array(resCapacity);
  let resQuantity = new Float64Array(resCapacity);
  let resPhase = new Uint8Array(resCapacity);
  let resCount = 0;
  const pushPiece = (
    pieceKind: number,
    pieceBuyer: number,
    pieceTier: number,
    pieceGood: number,
    pieceSeller: number,
    pieceQuantity: number,
    piecePhase: number,
  ): void => {
    if (resCount === resCapacity) {
      resCapacity *= 2;
      const kinds = new Uint8Array(resCapacity);
      kinds.set(resKind);
      resKind = kinds;
      const buyers = new Float64Array(resCapacity);
      buyers.set(resBuyer);
      resBuyer = buyers;
      const tiers = new Uint8Array(resCapacity);
      tiers.set(resTier);
      resTier = tiers;
      const goods = new Int32Array(resCapacity);
      goods.set(resGood);
      resGood = goods;
      const sellers = new Float64Array(resCapacity);
      sellers.set(resSeller);
      resSeller = sellers;
      const quantities = new Float64Array(resCapacity);
      quantities.set(resQuantity);
      resQuantity = quantities;
      const phases = new Uint8Array(resCapacity);
      phases.set(resPhase);
      resPhase = phases;
    }
    resKind[resCount] = pieceKind;
    resBuyer[resCount] = pieceBuyer;
    resTier[resCount] = pieceTier;
    resGood[resCount] = pieceGood;
    resSeller[resCount] = pieceSeller;
    resQuantity[resCount] = pieceQuantity;
    resPhase[resCount] = piecePhase;
    resCount += 1;
  };

  // Allocation of one (tier, good) group from a lot table (`allocateTierGood`).
  // D-160: typed scratch of the market day with fill counts (the former arrays were cleared
  // with `length = 0`, which drops their storage, and regrown on every call). Candidates:
  // at most the largest group; lots: at most one per owner slot (`lotScratchFor`, below).
  const relevant = new Int32Array(largestGroup);
  const plannedQuantity = new Float64Array(largestGroup);
  const buyerEnd = new Float64Array(largestGroup);
  /**
   * D-158: the amount a candidate is allocated: funded (Pass A), funded less Pass A (Pass B),
   * or funded less fulfilled (Pass A2). D-160: computed once per candidate into this scratch
   * (by demand row) before pairing changes Pass A or fulfilment, as the three former calls
   * per candidate all ran before it.
   */
  const amountOf = new Float64Array(demandCount);
  const allocate = (
    count: number,
    mode: 0 | 1 | 2,
    goodId: number,
    lots: LotTable,
    phase: 0 | 1,
  ): { readonly totalFunded: number; readonly fulfilled: number } => {
    let relevantCount = 0;
    for (let item = 0; item < count; item += 1) {
      const index = candidates[item] as number;
      const amount =
        mode === 0
          ? (funded[index] ?? 0)
          : mode === 1
            ? (funded[index] ?? 0) - (passA[index] ?? 0)
            : (funded[index] ?? 0) - (fulfilled[index] ?? 0);
      if (amount > 0) {
        relevant[relevantCount] = index;
        amountOf[index] = amount;
        relevantCount += 1;
      }
    }
    allocationOrderSorted(relevant, relevantCount, kind, buyer, tierOf);
    let totalFunded = 0;
    for (let item = 0; item < relevantCount; item += 1) totalFunded += amountOf[relevant[item] as number] ?? 0;
    if (totalFunded <= tolerance(totalFunded)) return { totalFunded: 0, fulfilled: 0 };

    const ownerCount = lots.owners.length;
    const base = goodId * ownerCount;
    const scratch = lotScratchFor(ownerCount);
    const lotSlots = scratch.slots;
    const lotEnd = scratch.end;
    const reservedByLot = scratch.reserved;
    let lotCount = 0;
    let available = 0;
    for (let slot = 0; slot < ownerCount; slot += 1) {
      const quantity = lots.quantity[base + slot] ?? 0;
      if (lots.present[base + slot] === 1 && quantity > 0) {
        lotSlots[lotCount] = slot;
        lotCount += 1;
        available += quantity;
      }
    }
    if (available <= 0) return { totalFunded, fulfilled: 0 };

    const fulfilledTotal = Math.min(totalFunded, available);
    const scale = fulfilledTotal / totalFunded;
    let plannedTotal = 0;
    for (let item = 0; item < relevantCount; item += 1) {
      const index = relevant[item] as number;
      const quantity = totalFunded <= available ? (amountOf[index] ?? 0) : (amountOf[index] ?? 0) * scale;
      plannedQuantity[item] = quantity;
      plannedTotal += quantity;
    }
    if (Math.abs(plannedTotal - fulfilledTotal) > tolerance(plannedTotal, fulfilledTotal)) {
      throw new RangeError(`market allocation planned quantity does not reconcile for good ${String(goodId)}`);
    }

    // D-133 sequential pairing over the cumulative lot and buyer intervals.
    let cumulative = 0;
    for (let item = 0; item < lotCount; item += 1) {
      const slot = lotSlots[item] as number;
      cumulative += ((lots.quantity[base + slot] ?? 0) / available) * fulfilledTotal;
      lotEnd[item] = cumulative;
    }
    lotEnd[lotCount - 1] = fulfilledTotal;
    cumulative = 0;
    for (let item = 0; item < relevantCount; item += 1) {
      cumulative += plannedQuantity[item] as number;
      buyerEnd[item] = cumulative;
    }
    if (relevantCount > 0) buyerEnd[relevantCount - 1] = fulfilledTotal;
    reservedByLot.fill(0, 0, lotCount);
    let buyerIndex = 0;
    let lotStart = 0;
    for (let lotIndex = 0; lotIndex < lotCount; lotIndex += 1) {
      const lotStop = lotEnd[lotIndex] ?? lotStart;
      const sellerId = lots.owners[lotSlots[lotIndex] ?? 0] ?? 0;
      while (buyerIndex < relevantCount) {
        const buyerStart = buyerIndex === 0 ? 0 : (buyerEnd[buyerIndex - 1] ?? 0);
        const buyerStop = buyerEnd[buyerIndex] ?? buyerStart;
        const quantity = Math.min(lotStop, buyerStop) - Math.max(lotStart, buyerStart);
        if (quantity > 0) {
          const demand = relevant[buyerIndex] ?? 0;
          fulfilled[demand] = (fulfilled[demand] ?? 0) + quantity;
          if (kind[demand] === 0 && (tierOf[demand] === 1 || tierOf[demand] === 3)) totalsStale = true;
          if (phase === 0) passA[demand] = (passA[demand] ?? 0) + quantity;
          else passB[demand] = (passB[demand] ?? 0) + quantity;
          const household = kind[demand] === 0;
          if (household) {
            const cell = base + (lotSlots[lotIndex] ?? 0);
            const amount = quantity * (openingPrices[goodId] ?? 0);
            householdTakenByCell[cell] = (householdTakenByCell[cell] ?? 0) + quantity;
            householdTakenByGood[goodId] = (householdTakenByGood[goodId] ?? 0) + quantity;
            householdReceiptByCell[cell] = (householdReceiptByCell[cell] ?? 0) + amount;
            householdSpend[demand] = (householdSpend[demand] ?? 0) + amount;
          }
          if (!household || storeHouseholdPieces) {
            pushPiece(kind[demand] ?? 0, buyer[demand] ?? 0, tierOf[demand] ?? 0, goodId, sellerId, quantity, phase);
          }
          reservedByLot[lotIndex] = (reservedByLot[lotIndex] ?? 0) + quantity;
        }
        if (buyerStop <= lotStop) buyerIndex += 1;
        else break;
      }
      lotStart = lotStop;
    }
    let actualFulfilled = 0;
    for (let lotIndex = 0; lotIndex < lotCount; lotIndex += 1) {
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
  /** D-160: lot scratch of `allocate`, one entry per owner slot (the day's tables share the owners). */
  let lotScratch = { slots: new Int32Array(ownerCount), end: new Float64Array(ownerCount), reserved: new Float64Array(ownerCount) };
  const lotScratchFor = (owners: number): typeof lotScratch => {
    if (lotScratch.slots.length < owners) {
      lotScratch = { slots: new Int32Array(owners), end: new Float64Array(owners), reserved: new Float64Array(owners) };
    }
    return lotScratch;
  };
  /** D-158: household takings by lot cell (good × owner slot) and by good, in piece order. */
  const householdTakenByCell = new Float64Array(goodCount * ownerCount);
  const householdTakenByGood = new Float64Array(goodCount);
  /** D-158: household receipts by lot cell and spend by demand row, RUSD at opening prices. */
  const householdReceiptByCell = new Float64Array(goodCount * ownerCount);
  const householdSpend = new Float64Array(householdCount);

  try {
    // Pass A: opening stock, tiers 1, 2, 3, 5, 6.
    const remaining = copyLotTable(opening);
    const blockedGoods = new Uint8Array(goodCount);
    for (const tier of M3_MARKET_TIERS) {
      refreshTotals();
      // Every good of a tier is classified before the tier allocates (as before).
      for (let item = tierRangeStart(tier); item < tierRangeEnd(tier); item += 1) {
        const index = groupOrder[item] ?? 0;
        const isNow = isEligible(index);
        eligible[index] = isNow ? 1 : 0;
        if (isNow) {
          const goodId = goodOf[index] ?? 0;
          priceFundedByGood[goodId] = (priceFundedByGood[goodId] ?? 0) + (funded[index] ?? 0);
        }
      }
      for (let goodId = 0; goodId < goodCount; goodId += 1) {
        if (blockedGoods[goodId] === 1) continue;
        const group = groupOf(tier, goodId);
        let count = 0;
        for (let item = groupStart[group] ?? 0; item < (groupStart[group + 1] ?? 0); item += 1) {
          const index = groupOrder[item] ?? 0;
          if (eligible[index] === 1 && (funded[index] ?? 0) > 0) {
            candidates[count] = index;
            count += 1;
          }
        }
        if (count === 0) continue;
        const allocation = allocate(count, 0, goodId, remaining, 0);
        if (
          allocation.totalFunded - allocation.fulfilled >
          tolerance(allocation.totalFunded, allocation.fulfilled)
        ) {
          blockedGoods[goodId] = 1;
        }
      }
    }
    const primaryCount = resCount;
    const householdPassATakenByCell = householdTakenByCell.slice();
    const householdPassATakenByGood = householdTakenByGood.slice();

    // M3c production from the building reservations of Pass A.
    // D-160: typed columns of exactly the building pieces.
    let buildingPieces = 0;
    for (let index = 0; index < primaryCount; index += 1) if (resKind[index] === 1) buildingPieces += 1;
    const inputColumns = {
      buyer: new Float64Array(buildingPieces),
      good: new Float64Array(buildingPieces),
      seller: new Float64Array(buildingPieces),
      quantity: new Float64Array(buildingPieces),
    } satisfies ReservationColumns;
    for (let index = 0, at = 0; index < primaryCount; index += 1) {
      if (resKind[index] !== 1) continue;
      inputColumns.buyer[at] = resBuyer[index] ?? 0;
      inputColumns.good[at] = resGood[index] ?? 0;
      inputColumns.seller[at] = resSeller[index] ?? 0;
      inputColumns.quantity[at] = resQuantity[index] ?? 0;
      at += 1;
    }
    if (options.validateWorld !== false) {
      // `runProductionPhase` checks for direct callers (validated above as well).
      if (definitions.dataVersion !== world.dataVersion || definitions.scenarioId !== world.scenarioId) {
        throw new RangeError("economy definitions do not match the world data/scenario identity");
      }
    }
    // P5b (D-146 A4): goods that cannot be stored (electricity) have no opening stock,
    // so producers that need them buy from the same day's output. Their producers run
    // in a first wave; that output is allocated to producers' demand (Pass A2, tier
    // order); then the other buildings produce. Without such demand the single wave
    // below is exactly the former path.
    const waves = productionWaves(definitions, market.id, lookups, kind, goodOf, funded, householdCount, demandCount);
    let productionCore: ReturnType<typeof runProductionCore>;
    if (waves === null) {
      productionCore = runProductionCore(world, definitions, market, lookups.production, opening, inputColumns, false, undefined, trusted, detail === "full");
    } else {
      const firstColumns: ReservationColumns = { buyer: [], good: [], seller: [], quantity: [] };
      const secondColumns: ReservationColumns = { buyer: [], good: [], seller: [], quantity: [] };
      for (let index = 0; index < inputColumns.buyer.length; index += 1) {
        const target = waves.first.has(inputColumns.buyer[index] ?? 0) ? firstColumns : secondColumns;
        (target.buyer as number[]).push(inputColumns.buyer[index] ?? 0);
        (target.good as number[]).push(inputColumns.good[index] ?? 0);
        (target.seller as number[]).push(inputColumns.seller[index] ?? 0);
        (target.quantity as number[]).push(inputColumns.quantity[index] ?? 0);
      }
      const first = runProductionCore(world, definitions, market, lookups.production, opening, firstColumns, false, waves.first, trusted, false);
      // Pass A2: same-day output of non-storable goods to producers, tiers 2 then 5.
      const sameDay = copyLotTable(first.lots);
      const beforeA2 = resCount;
      for (const tier of [2, 5] as const) {
        for (const goodId of waves.goods) {
          const group = groupOf(tier, goodId);
          let count = 0;
          for (let item = groupStart[group] ?? 0; item < (groupStart[group + 1] ?? 0); item += 1) {
            const index = groupOrder[item] ?? 0;
            if (index < householdCount) continue;
            if ((funded[index] ?? 0) - (fulfilled[index] ?? 0) > tolerance(funded[index] ?? 0)) {
              candidates[count] = index;
              count += 1;
            }
          }
          if (count === 0) continue;
          allocate(count, 2, goodId, sameDay, 0);
        }
      }
      for (let index = beforeA2; index < resCount; index += 1) {
        (secondColumns.buyer as number[]).push(resBuyer[index] ?? 0);
        (secondColumns.good as number[]).push(resGood[index] ?? 0);
        (secondColumns.seller as number[]).push(resSeller[index] ?? 0);
        (secondColumns.quantity as number[]).push(resQuantity[index] ?? 0);
      }
      const second = runProductionCore(world, definitions, market, lookups.production, first.lots, secondColumns, false, waves.second, trusted, false);
      // D-160: the waves' rows merged in building-id order (the former sorted objects).
      const mergedColumns = mergeProductionColumns(first.columns, second.columns);
      productionCore = {
        buildings: detail === "full" ? productionBuildingObjects(mergedColumns) : [],
        columns: mergedColumns,
        uses: {
          buyer: [...first.uses.buyer, ...second.uses.buyer],
          good: [...first.uses.good, ...second.uses.good],
          seller: [...first.uses.seller, ...second.uses.seller],
          reserved: [...first.uses.reserved, ...second.uses.reserved],
          used: [...first.uses.used, ...second.uses.used],
        },
        inventory: first.inventory.map((flow, index) => {
          const later = second.inventory[index] ?? flow;
          return {
            goodId: flow.goodId,
            openingStock: flow.openingStock,
            production: flow.production + later.production,
            usedAsInput: flow.usedAsInput + later.usedAsInput,
            recordedLoss: flow.recordedLoss + later.recordedLoss,
            closingStock: later.closingStock,
          };
        }),
        overflowLosses: [...first.overflowLosses, ...second.overflowLosses],
        lots: second.lots,
      };
    }
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
    // D-158: the totals were summed piece by piece in creation order, as the former loop over
    // the stored pieces summed them; Pass A2 takes no household pieces.
    const householdReservedByLot = householdPassATakenByCell;
    const householdPassAByGood = householdPassATakenByGood;
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
      for (let item = tierRangeStart(tier); item < tierRangeEnd(tier); item += 1) {
        const index = groupOrder[item] ?? 0;
        if (kind[index] !== 0) continue;
        const wasEligible = eligible[index] === 1;
        const isNow = isEligible(index);
        eligible[index] = isNow ? 1 : 0;
        if (!wasEligible && isNow) {
          const goodId = goodOf[index] ?? 0;
          priceFundedByGood[goodId] = (priceFundedByGood[goodId] ?? 0) + (funded[index] ?? 0);
        }
      }
      for (let goodId = 0; goodId < goodCount; goodId += 1) {
        if (passBBlocked[goodId] === 1) continue;
        if (tier === 3 && inputCriticalUnmet[goodId] === 1) continue;
        if (tier === 6 && (inputCriticalUnmet[goodId] === 1 || inputRemainingUnmet[goodId] === 1)) continue;
        // The open demands of the tier and good, in demand order (Pass A amounts and the
        // eligibility above do not change while Pass B allocates).
        const group = groupOf(tier, goodId);
        let count = 0;
        for (let item = groupStart[group] ?? 0; item < (groupStart[group + 1] ?? 0); item += 1) {
          const index = groupOrder[item] ?? 0;
          if (
            kind[index] === 0 &&
            eligible[index] === 1 &&
            (funded[index] ?? 0) - (passA[index] ?? 0) > tolerance(funded[index] ?? 0, passA[index] ?? 0)
          ) {
            candidates[count] = index;
            count += 1;
          }
        }
        if (count === 0) continue;
        const allocation = allocate(count, 1, goodId, passBLots, 1);
        if (
          allocation.totalFunded - allocation.fulfilled >
          tolerance(allocation.totalFunded, allocation.fulfilled)
        ) {
          passBBlocked[goodId] = 1;
        }
      }
    }

    // Final lots: the produced lots less every household reservation (A then B).
    const householdByLot = householdTakenByCell;
    const householdByGood = householdTakenByGood;
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
      lookups.nonStorableGoods,
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
    // D-160: the transactions are appended where they arise, read from the piece and use
    // columns (a call per piece with seven numbers boxed them once this function grew past
    // the compiler's inlining budget). The same values, in the same order.
    if (storeHouseholdPieces) {
      for (let index = 0; index < resCount; index += 1) {
        if (resKind[index] !== 0) continue;
        const goodId = resGood[index] ?? 0;
        const quantity = resQuantity[index] ?? 0;
        const unitPrice = openingPrices[goodId] ?? 0;
        transactions.kind.push(0);
        transactions.buyer.push(resBuyer[index] ?? 0);
        transactions.seller.push(resSeller[index] ?? 0);
        transactions.good.push(goodId);
        transactions.tier.push(resTier[index] ?? 0);
        transactions.phase.push(resPhase[index] ?? 0);
        transactions.quantity.push(quantity);
        transactions.unitPrice.push(unitPrice);
        transactions.total.push(quantity * unitPrice);
      }
    }
    const uses = productionCore.uses;
    const inputBuyer: number[] = [];
    const inputSeller: number[] = [];
    const inputAmount: number[] = [];
    for (let index = 0; index < uses.buyer.length; index += 1) {
      const used = uses.used[index] ?? 0;
      if (!(used > 0)) continue;
      const buyerId = uses.buyer[index] ?? 0;
      const goodId = uses.good[index] ?? 0;
      const tier = inputTier.get(buyerId * goodCount + goodId);
      if (tier === undefined) throw new RangeError("production input use has no matching reservation");
      const sellerId = uses.seller[index] ?? 0;
      inputBuyer.push(buyerId);
      inputSeller.push(sellerId);
      inputAmount.push(used * (openingPrices[goodId] ?? 0));
      if (storeHouseholdPieces) {
        const unitPrice = openingPrices[goodId] ?? 0;
        transactions.kind.push(1);
        transactions.buyer.push(buyerId);
        transactions.seller.push(sellerId);
        transactions.good.push(goodId);
        transactions.tier.push(tier);
        transactions.phase.push(0);
        transactions.quantity.push(used);
        transactions.unitPrice.push(unitPrice);
        transactions.total.push(used * unitPrice);
      }
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
    for (const offer of input.mintOffers ?? []) {
      if (
        !(offer.goodId >= 0 && offer.goodId < goodCount) ||
        !(offer.buyCapacity >= 0) || !Number.isFinite(offer.buyCapacity) ||
        !(offer.sellCapacity >= 0) || !Number.isFinite(offer.sellCapacity)
      ) {
        throw new RangeError(`market ${String(market.id)} has an invalid mint offer`);
      }
      const adjusted = mintAdjustedFlows(
        market.priceRUSD[offer.goodId] ?? 0,
        priceFundedByGood[offer.goodId] ?? 0,
        sellableSupplyByGood[offer.goodId] ?? 0,
        offer,
      );
      priceFundedByGood[offer.goodId] = adjusted.funded;
      sellableSupplyByGood[offer.goodId] = adjusted.supply;
    }
    const priceUpdates = updateMarketPrices(
      market,
      definitions.goods,
      priceFundedByGood,
      sellableSupplyByGood,
    );

    const householdConsumptionByGood = householdTakenByGood;
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
    attachProductionColumns(production, productionCore.columns);
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
    const householdSellerId: number[] = [];
    const householdSellerAmount: number[] = [];
    for (let slot = 0; slot < ownerCount; slot += 1) {
      let amount = 0;
      for (let goodId = 0; goodId < goodCount; goodId += 1) amount += householdReceiptByCell[goodId * ownerCount + slot] ?? 0;
      if (amount > 0) {
        householdSellerId.push(opening.owners[slot] ?? 0);
        householdSellerAmount.push(amount);
      }
    }
    const flows: MarketFlowColumns = {
      householdBuyer: buyer.slice(0, householdCount),
      householdSpend,
      householdSellerId,
      householdSellerAmount,
      inputBuyer,
      inputSeller,
      inputAmount,
    };
    Object.defineProperty(result, "columns", {
      value: { transactions, householdFulfilled, flows } satisfies MarketDayColumns,
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
        reservations: {
          resKind: resKind.subarray(0, resCount),
          resBuyer: resBuyer.subarray(0, resCount),
          resTier: resTier.subarray(0, resCount),
          resGood: resGood.subarray(0, resCount),
          resSeller: resSeller.subarray(0, resCount),
          resQuantity: resQuantity.subarray(0, resCount),
          resPhase: resPhase.subarray(0, resCount),
        },
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
      readonly resKind: ArrayLike<number>;
      readonly resBuyer: ArrayLike<number>;
      readonly resTier: ArrayLike<number>;
      readonly resGood: ArrayLike<number>;
      readonly resSeller: ArrayLike<number>;
      readonly resQuantity: ArrayLike<number>;
      readonly resPhase: ArrayLike<number>;
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
