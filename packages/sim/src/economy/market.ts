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
import { drawUint32 } from "../rng.js";
import type { DayIndex } from "../types.js";
import { assertValidWorld, type World } from "../world.js";
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
  runProductionPhase,
  type InputReservation,
  type OverflowLoss,
  type ProductionPhaseResult,
} from "./production.js";
import type { BuildingDef, EconomyDefinitions } from "./types.js";

export const M3_MARKET_TIERS = [1, 2, 3, 5, 6] as const;
export type MarketTier = (typeof M3_MARKET_TIERS)[number];
export type HouseholdTier = 1 | 3 | 6;
export type ProductionInputTier = 2 | 5;

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
  readonly unitPriceSUSD: number;
  readonly totalSUSD: number;
  readonly phase: "A" | "B";
}

export interface PendingTransaction {
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
}

export interface PriceUpdate {
  readonly goodId: number;
  readonly oldPriceSUSD: number;
  readonly newPriceSUSD: number;
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

function validateMarketDayInput(
  world: World,
  definitions: EconomyDefinitions,
  input: MarketDayInput,
): {
  readonly marketId: number;
  readonly criticalGoods: ReadonlySet<number>;
  readonly buildingById: Map<number, BuildingDef>;
  readonly blockIds: Set<number>;
} {
  assertValidWorld(world);
  assertValidEconomyDefinitions(definitions);
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
  if (market.priceSUSD.length !== definitions.goods.length) {
    throw new RangeError("market price array does not match the goods definitions");
  }
  const marketRegionIds = new Set(market.regionIds);
  const goodIds = new Set(definitions.goods.map((good) => good.id));
  const blockIds = new Set(world.popBlocks.map((block) => block.id));
  const blockById = new Map(world.popBlocks.map((block) => [block.id, block]));
  const buildingById = new Map(definitions.buildings.map((building) => [building.id, building]));
  const criticalGoods = criticalGoodIds(definitions, input.needs);
  const householdKeys = new Set<string>();
  for (let index = 0; index < input.householdDemands.length; index += 1) {
    const demand = input.householdDemands[index];
    if (demand === undefined) throw new RangeError("missing household demand");
    const path = `householdDemands[${String(index)}]`;
    if (!blockIds.has(demand.popBlockId)) {
      throw new RangeError(`${path}.popBlockId references an unknown pop block`);
    }
    const block = blockById.get(demand.popBlockId);
    if (block !== undefined && !marketRegionIds.has(block.regionId)) {
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
    const key = `${String(demand.popBlockId)}:${String(demand.tier)}:${String(demand.goodId)}`;
    if (householdKeys.has(key)) throw new RangeError(`${path} duplicates a household demand`);
    householdKeys.add(key);
  }

  const productionKeys = new Set<string>();
  for (let index = 0; index < input.productionDemands.length; index += 1) {
    const demand = input.productionDemands[index];
    if (demand === undefined) throw new RangeError("missing production demand");
    const path = `productionDemands[${String(index)}]`;
    const building = world.buildings.find((candidate) => candidate.id === demand.buyerBuildingId);
    if (building === undefined) {
      throw new RangeError(`${path}.buyerBuildingId references an unknown building`);
    }
    if (!marketRegionIds.has(building.regionId)) {
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
    const key = `${String(demand.buyerBuildingId)}:${String(demand.goodId)}`;
    if (productionKeys.has(key)) throw new RangeError(`${path} duplicates a production demand`);
    productionKeys.add(key);
  }

  return { marketId: market.id, criticalGoods, buildingById, blockIds };
}

function householdTierMet(
  demands: readonly DemandState[],
  popBlockId: number,
  tier: HouseholdTier,
): boolean {
  let desired = 0;
  let fulfilled = 0;
  for (const demand of demands) {
    if (demand.kind !== "household" || demand.buyerId !== popBlockId || demand.tier !== tier) {
      continue;
    }
    desired += demand.desired;
    fulfilled += demand.fulfilled;
  }
  return desired <= tolerance(desired) || fulfilled >= desired - tolerance(desired, fulfilled);
}

function householdTierEligible(
  demands: readonly DemandState[],
  demand: DemandState,
): boolean {
  if (demand.kind !== "household") return true;
  const popBlockId = demand.buyerId;
  if (demand.tier === 1) return true;
  if (!householdTierMet(demands, popBlockId, 1)) return false;
  if (demand.tier === 3) return true;
  return householdTierMet(demands, popBlockId, 3);
}

function residualOrder(
  world: World,
  dayIndex: DayIndex,
  demands: readonly DemandAllocation[],
): number[] {
  const indexes = demands.map((_demand, index) => index);
  indexes.sort((left, right) => {
    const leftDemand = demands[left]?.demand;
    const rightDemand = demands[right]?.demand;
    if (leftDemand === undefined || rightDemand === undefined) return left - right;
    const leftKey = drawUint32({
      seed: world.seed,
      day: dayIndex,
      entityId: leftDemand.buyerId,
      purpose:
        leftDemand.kind === "household"
          ? M3_MARKET_HOUSEHOLD_RESIDUAL_PURPOSE
          : M3_MARKET_BUILDING_RESIDUAL_PURPOSE,
      drawIndex: 0,
    });
    const rightKey = drawUint32({
      seed: world.seed,
      day: dayIndex,
      entityId: rightDemand.buyerId,
      purpose:
        rightDemand.kind === "household"
          ? M3_MARKET_HOUSEHOLD_RESIDUAL_PURPOSE
          : M3_MARKET_BUILDING_RESIDUAL_PURPOSE,
      drawIndex: 0,
    });
    return leftKey - rightKey || leftDemand.buyerId - rightDemand.buyerId;
  });
  return indexes;
}

/**
 * Allocate funded demand for one market good and tier from remaining lots.
 * Returns the actual fulfilled quantity. Mutates demand fulfilled counters and
 * reservations/remaining lots.
 */
function allocateTierGood(
  world: World,
  dayIndex: DayIndex,
  demands: readonly DemandAllocation[],
  goodId: number,
  remainingByLot: Map<string, number>,
  reservations: MarketReservation[],
  phase: "A" | "B",
): { readonly totalFunded: number; readonly fulfilled: number } {
  const relevant = demands.filter((demand) => demand.demand.goodId === goodId && demand.funded > 0);
  let totalFunded = 0;
  for (const demand of relevant) totalFunded += demand.funded;
  if (totalFunded <= tolerance(totalFunded)) {
    return { totalFunded: 0, fulfilled: 0 };
  }

  const lots = [...remainingByLot.entries()]
    .map(([key, quantity]) => {
      const [goodText, ownerText] = key.split(":");
      return { key, goodId: Number(goodText), sellerBuildingId: Number(ownerText), quantity };
    })
    .filter((lot) => lot.goodId === goodId && lot.quantity > 0)
    .sort((left, right) => left.sellerBuildingId - right.sellerBuildingId);
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

  const order = residualOrder(world, dayIndex, relevant);
  let actualFulfilled = 0;
  for (const lot of lots) {
    const lotReserved = (lot.quantity / available) * fulfilledTotal;
    const allocations = planned.map((quantity) => (lotReserved * quantity) / plannedTotal);
    let allocated = 0;
    for (const quantity of allocations) allocated += quantity;
    let residual = lotReserved - allocated;
    if (Math.abs(residual) > tolerance(lotReserved, allocated)) {
      throw new RangeError(`market lot allocation does not reconcile for seller lot ${lot.key}`);
    }
    for (let attempt = 0; attempt < order.length && Math.abs(residual) > tolerance(residual); attempt += 1) {
      const index = order[attempt];
      if (index === undefined) break;
      const current = allocations[index] ?? 0;
      if (residual > 0) {
        allocations[index] = current + residual;
        residual = 0;
      } else if (current >= -residual) {
        allocations[index] = current + residual;
        residual = 0;
      }
    }
    if (Math.abs(residual) > tolerance(residual)) {
      throw new RangeError(`market residual allocation failed for seller lot ${lot.key}`);
    }

    let reservedFromLot = 0;
    for (let index = 0; index < relevant.length; index += 1) {
      const quantity = allocations[index] ?? 0;
      if (!(quantity > 0)) continue;
      const demand = relevant[index];
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
      reservedFromLot += quantity;
    }
    actualFulfilled += reservedFromLot;
    const remaining = lot.quantity - reservedFromLot;
    if (remaining < -tolerance(lot.quantity, reservedFromLot)) {
      throw new RangeError(`market reservation exceeds seller lot ${lot.key}`);
    }
    if (remaining <= 0) remainingByLot.delete(lot.key);
    else remainingByLot.set(lot.key, remaining);
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

function openingLotMap(world: World, marketId: number): Map<string, number> {
  const market = world.markets.find((candidate) => candidate.id === marketId);
  if (market === undefined) throw new RangeError("missing market");
  const map = new Map<string, number>();
  for (const lot of market.stockLots) {
    map.set(`${String(lot.goodId)}:${String(lot.ownerBuildingId)}`, lot.quantity);
  }
  return map;
}

/** Update all market prices once, after clearing, using bounded incremental rules. */
export function updateMarketPrices(
  market: { readonly id: number; priceSUSD: number[] },
  goods: readonly { readonly id: number; readonly basePrice1900SUSD: number }[],
  fundedDemandByGood: readonly number[],
  sellableSupplyByGood: readonly number[],
): PriceUpdate[] {
  if (market.priceSUSD.length !== goods.length) {
    throw new RangeError("market price array does not match goods");
  }
  const updates: PriceUpdate[] = [];
  const newPrices = [...market.priceSUSD];
  for (const good of goods) {
    const goodId = good.id;
    const oldPrice = market.priceSUSD[goodId];
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
    const lower = good.basePrice1900SUSD * M3_PRICE_MIN_RATIO;
    const upper = good.basePrice1900SUSD * M3_PRICE_MAX_RATIO;
    const newPrice = Math.min(upper, Math.max(lower, oldPrice * (1 + boundedChange)));
    if (!Number.isFinite(newPrice) || !(newPrice > 0)) {
      throw new RangeError(`updated price for good ${String(goodId)} is invalid`);
    }
    newPrices[goodId] = newPrice;
    updates.push({
      goodId,
      oldPriceSUSD: oldPrice,
      newPriceSUSD: newPrice,
      fundedDemand,
      sellableSupply,
      imbalance,
      dailyChange: newPrice / oldPrice - 1,
    });
  }
  market.priceSUSD = newPrices;
  return updates;
}

/** Run one deterministic market-day clearing phase. Returns transient pending results. */
export function runMarketDay(
  world: World,
  definitions: EconomyDefinitions,
  input: MarketDayInput,
): MarketDayResult {
  const validated = validateMarketDayInput(world, definitions, input);
  const market = world.markets.find((candidate) => candidate.id === validated.marketId);
  if (market === undefined) throw new RangeError("missing market");
  const openingLots = market.stockLots.map((lot) => ({ ...lot }));
  const openingPrices = [...market.priceSUSD];
  const demands = demandStates(input);
  const reservations: MarketReservation[] = [];
  const remainingByLot = openingLotMap(world, market.id);
  const priceFundedByGood = new Array<number>(definitions.goods.length).fill(0);
  const blockedGoods = new Set<number>();

  try {
    for (const tier of M3_MARKET_TIERS) {
      const tierDemands = demands.filter((demand) => demand.tier === tier);
      for (const demand of tierDemands) {
        demand.eligible = householdTierEligible(demands, demand);
        if (demand.eligible) {
          priceFundedByGood[demand.goodId] =
            (priceFundedByGood[demand.goodId] ?? 0) + demand.funded;
        }
      }
      for (let goodId = 0; goodId < definitions.goods.length; goodId += 1) {
        if (blockedGoods.has(goodId)) continue;
        const goodDemands = tierDemands.filter(
          (demand) => demand.goodId === goodId && demand.eligible && demand.funded > 0,
        );
        const allocation = allocateTierGood(
          world,
          input.dayIndex,
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
      { applyOverflow: false, marketId: market.id },
    );

    const householdReservedByLot = new Map<string, number>();
    for (const reservation of householdPassA) {
      const key = `${String(reservation.goodId)}:${String(reservation.sellerBuildingId)}`;
      householdReservedByLot.set(
        key,
        (householdReservedByLot.get(key) ?? 0) + reservation.quantity,
      );
    }
    // `market.stockLots` already includes M3c output and excludes actual input
    // use. Do not add production again here; only remove outstanding household
    // Pass-A reservations.
    const passBLots = new Map<string, number>();
    for (const lot of market.stockLots) {
      const key = `${String(lot.goodId)}:${String(lot.ownerBuildingId)}`;
      const available = lot.quantity - (householdReservedByLot.get(key) ?? 0);
      if (available < -tolerance(lot.quantity, householdReservedByLot.get(key) ?? 0)) {
        throw new RangeError(`household reservation exceeds current seller lot ${key}`);
      }
      if (available > 0) passBLots.set(key, available);
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
      const tierDemands = demands.filter(
        (demand) =>
          demand.kind === "household" &&
          demand.tier === tier &&
          demand.eligible &&
          demand.funded - demand.passAFulfilled > tolerance(demand.funded, demand.passAFulfilled),
      );
      for (let goodId = 0; goodId < definitions.goods.length; goodId += 1) {
        if (passBBlocked.has(goodId)) continue;
        if (tier === 3 && inputCriticalUnmet.has(goodId)) continue;
        if (
          tier === 6 &&
          (inputCriticalUnmet.has(goodId) || inputRemainingUnmet.has(goodId))
        ) {
          continue;
        }
        const goodDemands = tierDemands.filter((demand) => demand.goodId === goodId);
        const allocation = allocateTierGood(
          world,
          input.dayIndex,
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
    const householdByLot = new Map<string, number>();
    for (const reservation of householdReservations) {
      const key = `${String(reservation.goodId)}:${String(reservation.sellerBuildingId)}`;
      householdByLot.set(key, (householdByLot.get(key) ?? 0) + reservation.quantity);
    }
    const finalLots = new Map<string, number>();
    for (const lot of market.stockLots) {
      const key = `${String(lot.goodId)}:${String(lot.ownerBuildingId)}`;
      const consumed = householdByLot.get(key) ?? 0;
      const remaining = lot.quantity - consumed;
      if (remaining < -tolerance(lot.quantity, consumed)) {
        throw new RangeError(`fulfilled household demand exceeds seller lot ${key}`);
      }
      if (remaining > 0) finalLots.set(key, remaining);
    }
    market.stockLots = [...finalLots.entries()].map(([key, quantity]) => {
      const [goodText, ownerText] = key.split(":");
      return {
        goodId: Number(goodText),
        ownerBuildingId: Number(ownerText),
        quantity,
      };
    });
    const overflowLosses = applyOverflowLosses(world, definitions, market.id);

    const usedInputByDemand = new Map<string, number>();
    for (const use of production.reservationUses) {
      const key = `${String(use.buyerBuildingId)}:${String(use.goodId)}:${String(use.sellerBuildingId)}`;
      usedInputByDemand.set(key, (usedInputByDemand.get(key) ?? 0) + use.usedQuantity);
    }

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
      }))
      .sort((left, right) =>
        left.popBlockId !== right.popBlockId
          ? left.popBlockId - right.popBlockId
          : left.tier !== right.tier
            ? left.tier - right.tier
            : left.goodId - right.goodId,
      );

    const productionDemandResults: ProductionDemandResult[] = demands
      .filter((demand) => demand.kind === "building")
      .map((demand) => {
        const reserved = demand.fulfilled;
        let used = 0;
        for (const [key, quantity] of usedInputByDemand) {
          const [buildingText, goodText] = key.split(":");
          if (Number(buildingText) === demand.buyerId && Number(goodText) === demand.goodId) {
            used += quantity;
          }
        }
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
      })
      .sort((left, right) =>
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

    const householdPurchases: HouseholdPurchase[] = householdReservations.map((reservation) => ({
      popBlockId: reservation.buyerId,
      tier: reservation.tier as HouseholdTier,
      goodId: reservation.goodId,
      sellerBuildingId: reservation.sellerBuildingId,
      quantity: reservation.quantity,
      unitPriceSUSD: openingPrices[reservation.goodId] ?? 0,
      totalSUSD: reservation.quantity * (openingPrices[reservation.goodId] ?? 0),
      phase: reservation.phase,
    }));
    householdPurchases.sort((left, right) => {
      if (left.popBlockId !== right.popBlockId) return left.popBlockId - right.popBlockId;
      if (left.tier !== right.tier) return left.tier - right.tier;
      if (left.goodId !== right.goodId) return left.goodId - right.goodId;
      return left.sellerBuildingId - right.sellerBuildingId;
    });

    const pendingTransactions: PendingTransaction[] = [];
    for (const purchase of householdPurchases) {
      pendingTransactions.push({
        kind: "household-purchase",
        buyerPopBlockId: purchase.popBlockId,
        buyerBuildingId: null,
        sellerBuildingId: purchase.sellerBuildingId,
        goodId: purchase.goodId,
        quantity: purchase.quantity,
        unitPriceSUSD: purchase.unitPriceSUSD,
        totalSUSD: purchase.totalSUSD,
        tier: purchase.tier,
        phase: purchase.phase,
      });
    }
    for (const use of production.reservationUses) {
      if (!(use.usedQuantity > 0)) continue;
      const reservation = reservations.find(
        (candidate) =>
          candidate.buyerKind === "building" &&
          candidate.buyerId === use.buyerBuildingId &&
          candidate.goodId === use.goodId &&
          candidate.sellerBuildingId === use.sellerBuildingId &&
          candidate.phase === "A",
      );
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
        unitPriceSUSD: unitPrice,
        totalSUSD: use.usedQuantity * unitPrice,
        tier: reservation.tier,
        phase: "A",
      });
    }
    pendingTransactions.sort((left, right) => {
      if (left.kind !== right.kind) return left.kind < right.kind ? -1 : 1;
      if (left.goodId !== right.goodId) return left.goodId - right.goodId;
      const leftBuyer = left.buyerPopBlockId ?? left.buyerBuildingId ?? -1;
      const rightBuyer = right.buyerPopBlockId ?? right.buyerBuildingId ?? -1;
      if (leftBuyer !== rightBuyer) return leftBuyer - rightBuyer;
      return left.sellerBuildingId - right.sellerBuildingId;
    });

    const sellableSupplyByGood = definitions.goods.map((good) => {
      const intermediate = production.inventory.find((flow) => flow.goodId === good.id);
      return (intermediate?.openingStock ?? 0) + (intermediate?.production ?? 0);
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
      updatedPrices: [...market.priceSUSD],
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
    market.priceSUSD = openingPrices;
    throw error;
  }
}
