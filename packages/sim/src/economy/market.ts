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
import { deriveStockByGood } from "./inventory.js";
import {
  applyOverflowLosses,
  buildProductionLookups,
  runProductionPhase,
  type ProductionLookups,
  type InputReservation,
  type OverflowLoss,
  type ProductionPhaseResult,
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
   * Transient duplicate-settlement guard. M3e refuses to settle an already
   * settled result. This flag is not authoritative state and is never saved.
   */
  settled: boolean;
}

interface DemandState {
  readonly kind: "household" | "building";
  readonly buyerId: number;
  readonly tier: MarketTier;
  readonly goodId: number;
  readonly desired: number;
  readonly funded: number;
  eligible: boolean;
  passAFulfilled: number;
  passBFulfilled: number;
  fulfilled: number;
}

interface DemandAllocation {
  readonly demand: DemandState;
  readonly funded: number;
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
  readonly blockById: ReadonlyMap<number, World["popBlocks"][number]>;
  /** Buildings, province membership and production capacities (shared with M3c). */
  readonly production: ProductionLookups;
}

export function buildMarketDayLookups(world: World, definitions: EconomyDefinitions): MarketDayLookups {
  const blockById = new Map<number, World["popBlocks"][number]>();
  for (const block of world.popBlocks) {
    if (!blockById.has(block.id)) blockById.set(block.id, block);
  }
  return { blockById, production: buildProductionLookups(world, definitions) };
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
  const goodIds = new Set(definitions.goods.map((good) => good.id));
  const blockById = lookups.blockById;
  const buildingById = new Map(definitions.buildings.map((building) => [building.id, building]));
  const criticalGoods = criticalGoodIds(definitions, input.needs);
  // Good ids equal their definition index (validated), so these numeric keys are
  // collision-free for uint32 buyer ids.
  const goodCount = definitions.goods.length;
  const householdKeys = new Set<number>();
  for (let index = 0; index < input.householdDemands.length; index += 1) {
    const demand = input.householdDemands[index];
    if (demand === undefined) throw new RangeError("missing household demand");
    const path = `householdDemands[${String(index)}]`;
    if (!blockById.has(demand.popBlockId)) {
      throw new RangeError(`${path}.popBlockId references an unknown pop block`);
    }
    const block = blockById.get(demand.popBlockId);
    if (block !== undefined && !marketProvinceIdSet.has(block.provinceId)) {
      throw new RangeError(`${path}.popBlockId is outside market ${String(market.id)}`);
    }
    if (!isHouseholdTier(demand.tier)) {
      throw new RangeError(`${path}.tier must be 1, 3, or 6`);
    }
    if (!goodIds.has(demand.goodId)) throw new RangeError(`${path}.goodId is unknown`);
    const desired = assertQuantity(demand.desiredQuantity, `${path}.desiredQuantity`);
    const funded = assertQuantity(demand.fundedQuantity, `${path}.fundedQuantity`);
    if (funded > desired + tolerance(desired, funded)) {
      throw new RangeError(`${path}.fundedQuantity cannot exceed desiredQuantity`);
    }
    const key = (demand.popBlockId * 8 + demand.tier) * goodCount + demand.goodId;
    if (householdKeys.has(key)) throw new RangeError(`${path} duplicates a household demand`);
    householdKeys.add(key);
  }

  const productionKeys = new Set<number>();
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
    if (productionKeys.has(key)) throw new RangeError(`${path} duplicates a production demand`);
    productionKeys.add(key);
  }

  return { marketId: market.id, criticalGoods, buildingById };
}

interface HouseholdTierTotals {
  desired1: number;
  fulfilled1: number;
  desired3: number;
  fulfilled3: number;
}

/**
 * Desired and fulfilled household quantities of tiers 1 and 3 per pop block, summed
 * in demand order. Computed once per eligibility pass instead of rescanning every
 * demand for every demand (P2 scale).
 */
function householdTierTotals(demands: readonly DemandState[]): Map<number, HouseholdTierTotals> {
  const totals = new Map<number, HouseholdTierTotals>();
  for (const demand of demands) {
    if (demand.kind !== "household" || (demand.tier !== 1 && demand.tier !== 3)) continue;
    let entry = totals.get(demand.buyerId);
    if (entry === undefined) {
      entry = { desired1: 0, fulfilled1: 0, desired3: 0, fulfilled3: 0 };
      totals.set(demand.buyerId, entry);
    }
    if (demand.tier === 1) {
      entry.desired1 += demand.desired;
      entry.fulfilled1 += demand.fulfilled;
    } else {
      entry.desired3 += demand.desired;
      entry.fulfilled3 += demand.fulfilled;
    }
  }
  return totals;
}

function tierMet(desired: number, fulfilled: number): boolean {
  return desired <= tolerance(desired) || fulfilled >= desired - tolerance(desired, fulfilled);
}

function householdTierEligible(
  totals: ReadonlyMap<number, HouseholdTierTotals>,
  demand: DemandState,
): boolean {
  if (demand.kind !== "household") return true;
  if (demand.tier === 1) return true;
  const entry = totals.get(demand.buyerId);
  if (entry !== undefined && !tierMet(entry.desired1, entry.fulfilled1)) return false;
  if (demand.tier === 3) return true;
  return entry === undefined || tierMet(entry.desired3, entry.fulfilled3);
}

/**
 * Allocate funded demand for one market good and tier from remaining lots.
 * Returns the actual fulfilled quantity. Mutates demand fulfilled counters and
 * reservations/remaining lots.
 */
/**
 * Remaining seller lots by good, then seller building id (D-137). Replaces one map of
 * `"good:owner"` strings that every allocation re-parsed and filtered; each
 * allocation still reads its good's positive lots in ascending seller order.
 */
type LotBook = Map<number, Map<number, number>>;

function lotBookSet(book: LotBook, goodId: number, sellerBuildingId: number, quantity: number): void {
  let lots = book.get(goodId);
  if (lots === undefined) {
    lots = new Map<number, number>();
    book.set(goodId, lots);
  }
  lots.set(sellerBuildingId, quantity);
}

function lotBookAdd(book: LotBook, goodId: number, sellerBuildingId: number, quantity: number): void {
  let lots = book.get(goodId);
  if (lots === undefined) {
    lots = new Map<number, number>();
    book.set(goodId, lots);
  }
  lots.set(sellerBuildingId, (lots.get(sellerBuildingId) ?? 0) + quantity);
}

function lotBookGet(book: LotBook, goodId: number, sellerBuildingId: number): number | undefined {
  return book.get(goodId)?.get(sellerBuildingId);
}

function allocateTierGood(
  demands: readonly DemandAllocation[],
  goodId: number,
  remainingByLot: LotBook,
  reservations: MarketReservation[],
  phase: "A" | "B",
): { readonly totalFunded: number; readonly fulfilled: number } {
  // Canonical buyer order (households before buildings, then id and tier), so the
  // sequential pairing below never depends on the order demands arrive in (D-133).
  const relevant = demands
    .filter((demand) => demand.demand.goodId === goodId && demand.funded > 0)
    .sort(
      (left, right) =>
        Number(left.demand.kind === "building") - Number(right.demand.kind === "building") ||
        left.demand.buyerId - right.demand.buyerId ||
        left.demand.tier - right.demand.tier,
    );
  let totalFunded = 0;
  for (const demand of relevant) totalFunded += demand.funded;
  if (totalFunded <= tolerance(totalFunded)) {
    return { totalFunded: 0, fulfilled: 0 };
  }

  const goodLots = remainingByLot.get(goodId);
  const lots: { readonly sellerBuildingId: number; readonly quantity: number }[] = [];
  if (goodLots !== undefined) {
    for (const [sellerBuildingId, quantity] of goodLots) {
      if (quantity > 0) lots.push({ sellerBuildingId, quantity });
    }
  }
  lots.sort((left, right) => left.sellerBuildingId - right.sellerBuildingId);
  const available = lots.reduce((total, lot) => total + lot.quantity, 0);
  if (available <= 0) return { totalFunded, fulfilled: 0 };

  const fulfilledTotal = Math.min(totalFunded, available);
  const scale = fulfilledTotal / totalFunded;
  const planned = relevant.map((demand) =>
    totalFunded <= available ? demand.funded : demand.funded * scale,
  );
  let plannedTotal = 0;
  for (const quantity of planned) plannedTotal += quantity;
  if (Math.abs(plannedTotal - fulfilledTotal) > tolerance(plannedTotal, fulfilledTotal)) {
    throw new RangeError(`market allocation planned quantity does not reconcile for good ${String(goodId)}`);
  }

  // D-133 sequential pairing. Every lot sells its pro-rata share of the fulfilled
  // quantity and every buyer receives its planned quantity, exactly as before; the
  // pairs are formed by walking lots (ascending seller id) and buyers (demand
  // order) together, so a day creates at most lots + buyers reservations instead of
  // lots x buyers. Per-account payments and per-lot sales are unchanged because the
  // aggregated postings (D-125) sum per account.
  // Pairs are the overlaps of the cumulative lot intervals and the cumulative buyer
  // intervals on [0, fulfilledTotal], so each lot and each buyer total telescopes
  // to its share without any tolerance-based skipping.
  const lotEnd: number[] = [];
  let cumulative = 0;
  for (const lot of lots) {
    cumulative += (lot.quantity / available) * fulfilledTotal;
    lotEnd.push(cumulative);
  }
  lotEnd[lotEnd.length - 1] = fulfilledTotal;
  const buyerEnd: number[] = [];
  cumulative = 0;
  for (const quantity of planned) {
    cumulative += quantity;
    buyerEnd.push(cumulative);
  }
  if (buyerEnd.length > 0) buyerEnd[buyerEnd.length - 1] = fulfilledTotal;
  const reservedByLot = new Array<number>(lots.length).fill(0);
  let buyerIndex = 0;
  let actualFulfilled = 0;
  let lotStart = 0;
  for (let lotIndex = 0; lotIndex < lots.length; lotIndex += 1) {
    const lot = lots[lotIndex];
    if (lot === undefined) continue;
    const lotStop = lotEnd[lotIndex] ?? lotStart;
    while (buyerIndex < relevant.length) {
      const buyerStart = buyerIndex === 0 ? 0 : (buyerEnd[buyerIndex - 1] ?? 0);
      const buyerStop = buyerEnd[buyerIndex] ?? buyerStart;
      const quantity = Math.min(lotStop, buyerStop) - Math.max(lotStart, buyerStart);
      if (quantity > 0) {
        const demand = relevant[buyerIndex];
        if (demand === undefined) throw new RangeError("missing allocation demand");
        demand.demand.fulfilled += quantity;
        if (phase === "A") demand.demand.passAFulfilled += quantity;
        else demand.demand.passBFulfilled += quantity;
        reservations.push({
          buyerKind: demand.demand.kind,
          buyerId: demand.demand.buyerId,
          tier: demand.demand.tier,
          goodId,
          sellerBuildingId: lot.sellerBuildingId,
          quantity,
          phase,
        });
        reservedByLot[lotIndex] = (reservedByLot[lotIndex] ?? 0) + quantity;
      }
      if (buyerStop <= lotStop) buyerIndex += 1;
      else break;
    }
    lotStart = lotStop;
  }
  for (let lotIndex = 0; lotIndex < lots.length; lotIndex += 1) {
    const lot = lots[lotIndex];
    if (lot === undefined) continue;
    const reservedFromLot = reservedByLot[lotIndex] ?? 0;
    actualFulfilled += reservedFromLot;
    const remaining = lot.quantity - reservedFromLot;
    // A lot's reservation is the difference of two cumulative interval ends, so its
    // rounding error scales with the cumulative total, not with the lot (P2b
    // regression: a small lot in a 1e8-unit market overran by 1e-8 and threw).
    const lotTolerance = tolerance(lot.quantity, reservedFromLot, fulfilledTotal);
    if (remaining < -lotTolerance) {
      throw new RangeError(
        `market reservation exceeds seller lot ${String(goodId)}:${String(lot.sellerBuildingId)}`,
      );
    }
    if (remaining <= lotTolerance) goodLots?.delete(lot.sellerBuildingId);
    else goodLots?.set(lot.sellerBuildingId, remaining);
  }
  if (Math.abs(actualFulfilled - fulfilledTotal) > tolerance(actualFulfilled, fulfilledTotal)) {
    throw new RangeError(`market allocation does not reconcile for good ${String(goodId)}`);
  }

  return { totalFunded, fulfilled: actualFulfilled };
}

function demandStates(
  input: MarketDayInput,
): DemandState[] {
  const states: DemandState[] = [];
  for (const demand of input.householdDemands) {
    states.push({
      kind: "household",
      buyerId: demand.popBlockId,
      tier: demand.tier,
      goodId: demand.goodId,
      desired: demand.desiredQuantity,
      funded: demand.fundedQuantity,
      eligible: false,
      passAFulfilled: 0,
      passBFulfilled: 0,
      fulfilled: 0,
    });
  }
  for (const demand of input.productionDemands) {
    states.push({
      kind: "building",
      buyerId: demand.buyerBuildingId,
      tier: demand.tier,
      goodId: demand.goodId,
      desired: demand.desiredQuantity,
      funded: demand.fundedQuantity,
      eligible: false,
      passAFulfilled: 0,
      passBFulfilled: 0,
      fulfilled: 0,
    });
  }
  return states;
}

function openingLotBook(market: World["markets"][number]): LotBook {
  const book: LotBook = new Map();
  for (const lot of market.stockLots) {
    lotBookSet(book, lot.goodId, lot.ownerBuildingId, lot.quantity);
  }
  return book;
}

/** Demands of one tier grouped by good, each group in demand order (D-137). */
function demandsByGood(demands: readonly DemandState[]): Map<number, DemandState[]> {
  const groups = new Map<number, DemandState[]>();
  for (const demand of demands) {
    const group = groups.get(demand.goodId);
    if (group === undefined) groups.set(demand.goodId, [demand]);
    else group.push(demand);
  }
  return groups;
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
  const openingLots = market.stockLots.map((lot) => ({ ...lot }));
  const openingPrices = [...market.priceRUSD];
  const demands = demandStates(input);
  const reservations: MarketReservation[] = [];
  const remainingByLot = openingLotBook(market);
  const priceFundedByGood = new Array<number>(definitions.goods.length).fill(0);
  const blockedGoods = new Set<number>();

  try {
    for (const tier of M3_MARKET_TIERS) {
      const tierDemands = demands.filter((demand) => demand.tier === tier);
      const tierTotals = householdTierTotals(demands);
      for (const demand of tierDemands) {
        demand.eligible = householdTierEligible(tierTotals, demand);
        if (demand.eligible) {
          priceFundedByGood[demand.goodId] =
            (priceFundedByGood[demand.goodId] ?? 0) + demand.funded;
        }
      }
      const tierByGood = demandsByGood(tierDemands);
      for (let goodId = 0; goodId < definitions.goods.length; goodId += 1) {
        if (blockedGoods.has(goodId)) continue;
        const goodDemands = (tierByGood.get(goodId) ?? []).filter(
          (demand) => demand.eligible && demand.funded > 0,
        );
        const allocation = allocateTierGood(
          goodDemands.map((demand) => ({ demand, funded: demand.funded })),
          goodId,
          remainingByLot,
          reservations,
          "A",
        );
        if (
          allocation.totalFunded - allocation.fulfilled >
          tolerance(allocation.totalFunded, allocation.fulfilled)
        ) {
          blockedGoods.add(goodId);
        }
      }
    }

    const primaryReservations = [...reservations];
    const householdPassA = primaryReservations.filter(
      (reservation) => reservation.buyerKind === "household",
    );
    const inputReservations: InputReservation[] = primaryReservations
      .filter((reservation) => reservation.buyerKind === "building")
      .map((reservation) => ({
        buyerBuildingId: reservation.buyerId,
        marketId: market.id,
        goodId: reservation.goodId,
        sellerBuildingId: reservation.sellerBuildingId,
        quantity: reservation.quantity,
      }));

    const production = runProductionPhase(
      world,
      definitions,
      inputReservations,
      {
        applyOverflow: false,
        marketId: market.id,
        ...(options.lookups === undefined ? {} : { lookups: options.lookups.production }),
        ...(options.validateWorld === undefined
          ? {}
          : { validateWorld: options.validateWorld }),
      },
    );

    const householdReservedByLot: LotBook = new Map();
    const householdPassAByGood = new Map<number, number>();
    for (const reservation of householdPassA) {
      lotBookAdd(householdReservedByLot, reservation.goodId, reservation.sellerBuildingId, reservation.quantity);
      householdPassAByGood.set(
        reservation.goodId,
        (householdPassAByGood.get(reservation.goodId) ?? 0) + reservation.quantity,
      );
    }
    // `market.stockLots` already includes M3c output and excludes actual input
    // use. Do not add production again here; only remove outstanding household
    // Pass-A reservations.
    const passBLots: LotBook = new Map();
    for (const lot of market.stockLots) {
      const reserved = lotBookGet(householdReservedByLot, lot.goodId, lot.ownerBuildingId) ?? 0;
      const available = lot.quantity - reserved;
      if (
        available <
        -tolerance(lot.quantity, reserved, householdPassAByGood.get(lot.goodId) ?? 0)
      ) {
        throw new RangeError(
          `household reservation exceeds current seller lot ${String(lot.goodId)}:${String(lot.ownerBuildingId)}`,
        );
      }
      if (available > 0) lotBookSet(passBLots, lot.goodId, lot.ownerBuildingId, available);
    }

    const inputCriticalUnmet = new Set<number>();
    const inputRemainingUnmet = new Set<number>();
    for (const demand of demands) {
      if (demand.kind !== "building") continue;
      if (demand.funded - demand.fulfilled <= tolerance(demand.funded, demand.fulfilled)) {
        continue;
      }
      if (demand.tier === 2) inputCriticalUnmet.add(demand.goodId);
      else if (demand.tier === 5) inputRemainingUnmet.add(demand.goodId);
    }

    const passBBlocked = new Set<number>();
    for (const tier of [1, 3, 6] as const) {
      // Pass A eligibility reflects opening stock only. Pass B may fill a lower
      // tier from same-day production, so recompute eligibility after each
      // completed tier and include newly unlocked funded demand in the price
      // signal (it was excluded from the Pass-A signal).
      const tierTotals = householdTierTotals(demands);
      for (const demand of demands) {
        if (demand.kind !== "household" || demand.tier !== tier) continue;
        const wasEligible = demand.eligible;
        demand.eligible = householdTierEligible(tierTotals, demand);
        if (!wasEligible && demand.eligible) {
          priceFundedByGood[demand.goodId] =
            (priceFundedByGood[demand.goodId] ?? 0) + demand.funded;
        }
      }
      const tierDemands = demands.filter(
        (demand) =>
          demand.kind === "household" &&
          demand.tier === tier &&
          demand.eligible &&
          demand.funded - demand.passAFulfilled > tolerance(demand.funded, demand.passAFulfilled),
      );
      const tierByGood = demandsByGood(tierDemands);
      for (let goodId = 0; goodId < definitions.goods.length; goodId += 1) {
        if (passBBlocked.has(goodId)) continue;
        if (tier === 3 && inputCriticalUnmet.has(goodId)) continue;
        if (
          tier === 6 &&
          (inputCriticalUnmet.has(goodId) || inputRemainingUnmet.has(goodId))
        ) {
          continue;
        }
        const goodDemands = tierByGood.get(goodId) ?? [];
        const allocation = allocateTierGood(
          goodDemands.map((demand) => ({
            demand,
            funded: demand.funded - demand.passAFulfilled,
          })),
          goodId,
          passBLots,
          reservations,
          "B",
        );
        if (
          allocation.totalFunded - allocation.fulfilled >
          tolerance(allocation.totalFunded, allocation.fulfilled)
        ) {
          passBBlocked.add(goodId);
        }
      }
    }

    const householdReservations = reservations.filter(
      (reservation) => reservation.buyerKind === "household",
    );
    const householdByLot: LotBook = new Map();
    const householdByGood = new Map<number, number>();
    for (const reservation of householdReservations) {
      lotBookAdd(householdByLot, reservation.goodId, reservation.sellerBuildingId, reservation.quantity);
      householdByGood.set(reservation.goodId, (householdByGood.get(reservation.goodId) ?? 0) + reservation.quantity);
    }
    // `market.stockLots` holds one lot per (good, owner) (canonical after
    // production), so the remaining lots keep its order.
    const finalLots: World["markets"][number]["stockLots"] = [];
    for (const lot of market.stockLots) {
      const consumed = lotBookGet(householdByLot, lot.goodId, lot.ownerBuildingId) ?? 0;
      const remaining = lot.quantity - consumed;
      // D-136: reservations are differences of cumulative interval ends, so the
      // rounding error scales with the good's household total, not with one lot.
      if (remaining < -tolerance(lot.quantity, consumed, householdByGood.get(lot.goodId) ?? 0)) {
        throw new RangeError(
          `fulfilled household demand exceeds seller lot ${String(lot.goodId)}:${String(lot.ownerBuildingId)}`,
        );
      }
      if (remaining > 0) {
        finalLots.push({ goodId: lot.goodId, ownerBuildingId: lot.ownerBuildingId, quantity: remaining });
      }
    }
    market.stockLots = finalLots;
    const overflowLosses = applyOverflowLosses(
      world,
      definitions,
      market.id,
      options.validateWorld === undefined ? {} : { validateWorld: options.validateWorld },
    );

    // Used input per (buyer, good), summed in `reservationUses` order (one use per
    // buyer, good and seller), which is the order the per-demand scan summed it in.
    const usedInputByDemand = new Map<number, Map<number, number>>();
    for (const use of production.reservationUses) {
      let byGood = usedInputByDemand.get(use.buyerBuildingId);
      if (byGood === undefined) {
        byGood = new Map<number, number>();
        usedInputByDemand.set(use.buyerBuildingId, byGood);
      }
      byGood.set(use.goodId, (byGood.get(use.goodId) ?? 0) + use.usedQuantity);
    }

    const canonicalOrder = options.detail !== "summary";
    const householdDemandResults: HouseholdDemandResult[] = demands
      .filter((demand) => demand.kind === "household")
      .map((demand) => ({
        popBlockId: demand.buyerId,
        tier: demand.tier as HouseholdTier,
        goodId: demand.goodId,
        desiredQuantity: demand.desired,
        fundedQuantity: demand.funded,
        passAFulfilled: demand.passAFulfilled,
        passBFulfilled: demand.passBFulfilled,
        fulfilledQuantity: demand.fulfilled,
        unmetFunded: Math.max(0, demand.funded - demand.fulfilled),
        unmetDesired: Math.max(0, demand.desired - demand.fulfilled),
      }));
    if (canonicalOrder) {
      householdDemandResults.sort((left, right) =>
        left.popBlockId !== right.popBlockId
          ? left.popBlockId - right.popBlockId
          : left.tier !== right.tier
            ? left.tier - right.tier
            : left.goodId - right.goodId,
      );
    }

    const productionDemandResults: ProductionDemandResult[] = demands
      .filter((demand) => demand.kind === "building")
      .map((demand) => {
        const reserved = demand.fulfilled;
        const used = usedInputByDemand.get(demand.buyerId)?.get(demand.goodId) ?? 0;
        return {
          buyerBuildingId: demand.buyerId,
          tier: demand.tier as ProductionInputTier,
          goodId: demand.goodId,
          desiredQuantity: demand.desired,
          fundedQuantity: demand.funded,
          reservedQuantity: reserved,
          usedQuantity: used,
          releasedQuantity: Math.max(0, reserved - used),
        };
      });
    if (canonicalOrder) {
      productionDemandResults.sort((left, right) =>
        left.buyerBuildingId !== right.buyerBuildingId
          ? left.buyerBuildingId - right.buyerBuildingId
          : left.goodId - right.goodId,
      );
      reservations.sort((left, right) => {
        if (left.phase !== right.phase) return left.phase < right.phase ? -1 : 1;
        if (left.tier !== right.tier) return left.tier - right.tier;
        if (left.buyerKind !== right.buyerKind) return left.buyerKind < right.buyerKind ? -1 : 1;
        if (left.buyerId !== right.buyerId) return left.buyerId - right.buyerId;
        if (left.goodId !== right.goodId) return left.goodId - right.goodId;
        return left.sellerBuildingId - right.sellerBuildingId;
      });
    }

    const householdPurchases: HouseholdPurchase[] = householdReservations.map((reservation) => ({
      popBlockId: reservation.buyerId,
      tier: reservation.tier as HouseholdTier,
      goodId: reservation.goodId,
      sellerBuildingId: reservation.sellerBuildingId,
      quantity: reservation.quantity,
      unitPriceRUSD: openingPrices[reservation.goodId] ?? 0,
      totalRUSD: reservation.quantity * (openingPrices[reservation.goodId] ?? 0),
      phase: reservation.phase,
    }));
    if (canonicalOrder) {
      householdPurchases.sort((left, right) => {
        if (left.popBlockId !== right.popBlockId) return left.popBlockId - right.popBlockId;
        if (left.tier !== right.tier) return left.tier - right.tier;
        if (left.goodId !== right.goodId) return left.goodId - right.goodId;
        return left.sellerBuildingId - right.sellerBuildingId;
      });
    }

    // The phase-A building reservation of each (buyer, good, seller), the one
    // `reservations.find` returned for each input use (production rejects a second
    // reservation of the same buyer, good and seller, so it is unique).
    const inputReservationByKey = new Map<number, Map<number, Map<number, MarketReservation>>>();
    for (const reservation of reservations) {
      if (reservation.buyerKind !== "building" || reservation.phase !== "A") continue;
      let byGood = inputReservationByKey.get(reservation.buyerId);
      if (byGood === undefined) {
        byGood = new Map();
        inputReservationByKey.set(reservation.buyerId, byGood);
      }
      let bySeller = byGood.get(reservation.goodId);
      if (bySeller === undefined) {
        bySeller = new Map();
        byGood.set(reservation.goodId, bySeller);
      }
      if (!bySeller.has(reservation.sellerBuildingId)) bySeller.set(reservation.sellerBuildingId, reservation);
    }
    const pendingTransactions: PendingTransaction[] = [];
    for (const purchase of householdPurchases) {
      pendingTransactions.push({
        kind: "household-purchase",
        buyerPopBlockId: purchase.popBlockId,
        buyerBuildingId: null,
        sellerBuildingId: purchase.sellerBuildingId,
        goodId: purchase.goodId,
        quantity: purchase.quantity,
        unitPriceRUSD: purchase.unitPriceRUSD,
        totalRUSD: purchase.totalRUSD,
        tier: purchase.tier,
        phase: purchase.phase,
      });
    }
    for (const use of production.reservationUses) {
      if (!(use.usedQuantity > 0)) continue;
      const reservation = inputReservationByKey
        .get(use.buyerBuildingId)
        ?.get(use.goodId)
        ?.get(use.sellerBuildingId);
      if (reservation === undefined) {
        throw new RangeError("production input use has no matching reservation");
      }
      const unitPrice = openingPrices[use.goodId] ?? 0;
      pendingTransactions.push({
        kind: "input-purchase",
        buyerPopBlockId: null,
        buyerBuildingId: use.buyerBuildingId,
        sellerBuildingId: use.sellerBuildingId,
        goodId: use.goodId,
        quantity: use.usedQuantity,
        unitPriceRUSD: unitPrice,
        totalRUSD: use.usedQuantity * unitPrice,
        tier: reservation.tier,
        phase: "A",
      });
    }
    if (canonicalOrder) {
      pendingTransactions.sort((left, right) => {
        if (left.kind !== right.kind) return left.kind < right.kind ? -1 : 1;
        if (left.goodId !== right.goodId) return left.goodId - right.goodId;
        const leftBuyer = left.buyerPopBlockId ?? left.buyerBuildingId ?? -1;
        const rightBuyer = right.buyerPopBlockId ?? right.buyerBuildingId ?? -1;
        if (leftBuyer !== rightBuyer) return leftBuyer - rightBuyer;
        return left.sellerBuildingId - right.sellerBuildingId;
      });
    }

    // D-136 (amends D-040): sellable supply is the opening stock plus same-day output,
    // less the funded input demand of producers. Households may buy the day's output
    // (Pass B), but producers buy only from the opening stock, so a market must carry
    // one day of input demand into the next day; counting that carry as supply made
    // every balanced market with intermediate goods read as a glut and drift to the floor.
    const inputFundedByGood = new Array<number>(definitions.goods.length).fill(0);
    for (const demand of demands) {
      if (demand.kind === "building" && demand.eligible) {
        inputFundedByGood[demand.goodId] = (inputFundedByGood[demand.goodId] ?? 0) + demand.funded;
      }
    }
    const sellableSupplyByGood = definitions.goods.map((good) => {
      const intermediate = production.inventory.find((flow) => flow.goodId === good.id);
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

    const householdConsumptionByGood = new Array<number>(definitions.goods.length).fill(0);
    for (const reservation of householdReservations) {
      householdConsumptionByGood[reservation.goodId] =
        (householdConsumptionByGood[reservation.goodId] ?? 0) + reservation.quantity;
    }
    const lossByGood = new Array<number>(definitions.goods.length).fill(0);
    for (const loss of overflowLosses) {
      lossByGood[loss.goodId] = (lossByGood[loss.goodId] ?? 0) + loss.quantity;
    }
    const finalStock = deriveStockByGood(market, definitions.goods.length);
    const inventory: MarketInventoryFlow[] = definitions.goods.map((good) => {
      const goodId = good.id;
      const intermediate = production.inventory.find((flow) => flow.goodId === goodId);
      const opening = intermediate?.openingStock ?? 0;
      const produced = intermediate?.production ?? 0;
      const used = intermediate?.usedAsInput ?? 0;
      const household = householdConsumptionByGood[goodId] ?? 0;
      const loss = lossByGood[goodId] ?? 0;
      const closing = finalStock[goodId] ?? 0;
      const expected = opening + produced - used - household - loss;
      // Scale the physical tolerance by the gross terms, not only by the
      // residual: with large populations the conservation identity subtracts
      // large nearly equal quantities and can leave a tiny non-zero residual.
      if (
        Math.abs(expected - closing) >
        tolerance(opening, produced, used, household, loss, expected, closing)
      ) {
        throw new RangeError(
          `final inventory conservation failed for good ${String(goodId)}: ${String(expected)} != ${String(closing)}`,
        );
      }
      return {
        goodId,
        openingStock: opening,
        production: produced,
        usedAsInput: used,
        householdConsumption: household,
        recordedLoss: loss,
        closingStock: closing,
      };
    });

    return {
      marketId: market.id,
      dayIndex: input.dayIndex,
      openingPrices,
      updatedPrices: [...market.priceRUSD],
      householdDemands: householdDemandResults,
      productionDemands: productionDemandResults,
      reservations,
      householdPurchases,
      pendingTransactions,
      production,
      priceUpdates,
      inventory,
      overflowLosses,
      settled: false,
    };
  } catch (error) {
    market.stockLots = openingLots;
    market.priceRUSD = openingPrices;
    throw error;
  }
}
