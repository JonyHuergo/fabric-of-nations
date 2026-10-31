/**
 * E6a trade state, policy construction, and structural validation.
 *
 * This module sits below `trade.ts`: it never imports the world initializer or
 * the whole-world validator, so `world.ts` and `economy/validation.ts` can
 * validate trade state without depending on the runtime trade phases. The phase
 * module re-exports these symbols for the public economy surface.
 */

import { MONEY_TOLERANCE_SUSD } from "../population/constants.js";
import type { World } from "../world.js";
import {
  MAX_TRADE_BLOCKED_DIAGNOSTICS,
  MAX_TRADE_ROUTES,
  MAX_TRADE_SHIPMENTS,
} from "./constants.js";
import {
  TRADE_BLOCK_REASONS,
  type TradePolicyInput,
  type TradePolicyState,
  type TradeRoute,
  type TradeRouteInitialDef,
  type TradeState,
} from "./types.js";

/** Neutral trade policy: free trade, no quota, no export restriction. */
export function neutralTradePolicyState(goodCount: number): TradePolicyState {
  return {
    tariffRates: new Array<number>(goodCount).fill(0),
    importQuotaQuantity: new Array<number | null>(goodCount).fill(null),
    importQuotaUsedQuantity: new Array<number>(goodCount).fill(0),
    exportRestricted: new Array<boolean>(goodCount).fill(false),
    lastUpdateDay: null,
    exportsValueMonthToDateSUSD: 0,
    importsValueMonthToDateSUSD: 0,
    dutyReceivedMonthToDateSUSD: 0,
    dutyPaidMonthToDateSUSD: 0,
    freightPaidMonthToDateSUSD: 0,
  };
}

function finitePositive(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || !(value > 0)) {
    throw new RangeError(`${path} must be a finite positive number`);
  }
  return value;
}

function finiteNonNegative(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new RangeError(`${path} must be a finite non-negative number`);
  }
  return value;
}

function rate(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${path} must be a finite rate in 0..1`);
  }
  return value;
}

/**
 * Build one country's authoritative trade policy from its optional scenario input.
 * Every omitted array is neutral, so a pre-E6a scenario keeps free trade.
 */
export function createTradePolicyState(
  input: TradePolicyInput | undefined,
  goodCount: number,
  path = "trade",
): TradePolicyState {
  const state = neutralTradePolicyState(goodCount);
  if (input === undefined) return state;
  if (typeof input !== "object" || input === null) {
    throw new TypeError(`${path} must be an object when provided`);
  }
  const pickRateArray = (
    values: readonly number[] | undefined,
    field: "tariffRates",
  ): number[] => {
    const result = [...state[field]];
    if (values === undefined) return result;
    if (!Array.isArray(values) || values.length !== goodCount) {
      throw new RangeError(`${path}.${field} must contain exactly ${String(goodCount)} entries`);
    }
    for (let index = 0; index < values.length; index += 1) {
      result[index] = rate(values[index], `${path}.${field}[${String(index)}]`);
    }
    return result;
  };
  const tariffRates = pickRateArray(input.tariffRates, "tariffRates");
  const importQuotaQuantity = [...state.importQuotaQuantity];
  if (input.importQuotaQuantity !== undefined) {
    if (
      !Array.isArray(input.importQuotaQuantity) ||
      input.importQuotaQuantity.length !== goodCount
    ) {
      throw new RangeError(
        `${path}.importQuotaQuantity must contain exactly ${String(goodCount)} entries`,
      );
    }
    for (let index = 0; index < input.importQuotaQuantity.length; index += 1) {
      const value = input.importQuotaQuantity[index];
      importQuotaQuantity[index] =
        value === null || value === undefined
          ? null
          : finiteNonNegative(value, `${path}.importQuotaQuantity[${String(index)}]`);
    }
  }
  const exportRestricted = [...state.exportRestricted];
  if (input.exportRestricted !== undefined) {
    if (!Array.isArray(input.exportRestricted) || input.exportRestricted.length !== goodCount) {
      throw new RangeError(
        `${path}.exportRestricted must contain exactly ${String(goodCount)} entries`,
      );
    }
    for (let index = 0; index < input.exportRestricted.length; index += 1) {
      const value = input.exportRestricted[index];
      if (typeof value !== "boolean") {
        throw new TypeError(`${path}.exportRestricted[${String(index)}] must be a boolean`);
      }
      exportRestricted[index] = value;
    }
  }
  return {
    ...state,
    tariffRates,
    importQuotaQuantity,
    exportRestricted,
  };
}

/** Validate one country's persisted trade policy against the good catalog. */
export function assertValidTradePolicyState(
  value: TradePolicyState,
  goodCount: number,
  path = "trade",
): void {
  if (typeof value !== "object" || value === null) {
    throw new TypeError(`${path} must be an object`);
  }
  for (const field of ["tariffRates"] as const) {
    const array = value[field];
    if (!Array.isArray(array) || array.length !== goodCount) {
      throw new RangeError(`${path}.${field} must contain exactly ${String(goodCount)} entries`);
    }
    for (let index = 0; index < array.length; index += 1) {
      rate(array[index], `${path}.${field}[${String(index)}]`);
    }
  }
  for (const field of ["importQuotaUsedQuantity"] as const) {
    const array = value[field];
    if (!Array.isArray(array) || array.length !== goodCount) {
      throw new RangeError(`${path}.${field} must contain exactly ${String(goodCount)} entries`);
    }
    for (let index = 0; index < array.length; index += 1) {
      finiteNonNegative(array[index], `${path}.${field}[${String(index)}]`);
    }
  }
  if (
    !Array.isArray(value.importQuotaQuantity) ||
    value.importQuotaQuantity.length !== goodCount
  ) {
    throw new RangeError(
      `${path}.importQuotaQuantity must contain exactly ${String(goodCount)} entries`,
    );
  }
  for (let index = 0; index < value.importQuotaQuantity.length; index += 1) {
    const quota = value.importQuotaQuantity[index];
    if (quota !== null) {
      finiteNonNegative(quota, `${path}.importQuotaQuantity[${String(index)}]`);
    }
  }
  if (!Array.isArray(value.exportRestricted) || value.exportRestricted.length !== goodCount) {
    throw new RangeError(
      `${path}.exportRestricted must contain exactly ${String(goodCount)} entries`,
    );
  }
  for (let index = 0; index < value.exportRestricted.length; index += 1) {
    if (typeof value.exportRestricted[index] !== "boolean") {
      throw new TypeError(`${path}.exportRestricted[${String(index)}] must be a boolean`);
    }
  }
  for (const field of [
    "exportsValueMonthToDateSUSD",
    "importsValueMonthToDateSUSD",
    "dutyReceivedMonthToDateSUSD",
    "dutyPaidMonthToDateSUSD",
    "freightPaidMonthToDateSUSD",
  ] as const) {
    finiteNonNegative(value[field], `${path}.${field}`);
  }
  if (value.lastUpdateDay !== null) {
    const day = value.lastUpdateDay;
    if (!Number.isInteger(day) || day < 0) {
      throw new RangeError(`${path}.lastUpdateDay must be a non-negative integer or null`);
    }
  }
}


/**
 * Build authoritative trade state from authored routes.
 *
 * Route ids are the ascending index of the canonical (marketAId, marketBId) pair, so
 * ids are stable regardless of authored order. An empty route list disables trade and
 * preserves pre-E6a behaviour exactly.
 */
export function createTradeState(routes: readonly TradeRouteInitialDef[] | undefined): TradeState {
  if (routes === undefined || routes.length === 0) {
    return {
      enabled: false,
      routes: [],
      shipments: [],
      nextShipmentId: 1,
      lastDispatchDay: null,
      lastDay: null,
    };
  }
  const pairs = new Set<string>();
  const canonical = routes.map((input, index) => {
    const path = `tradeRoutes[${String(index)}]`;
    const marketAId = input.marketAId;
    const marketBId = input.marketBId;
    if (!Number.isInteger(marketAId) || marketAId < 0) {
      throw new RangeError(`${path}.marketAId must be a non-negative integer`);
    }
    if (!Number.isInteger(marketBId) || marketBId < 0) {
      throw new RangeError(`${path}.marketBId must be a non-negative integer`);
    }
    if (marketAId === marketBId) {
      throw new RangeError(`${path} must connect two different markets`);
    }
    const lower = Math.min(marketAId, marketBId);
    const upper = Math.max(marketAId, marketBId);
    const key = `${String(lower)}:${String(upper)}`;
    if (pairs.has(key)) throw new RangeError(`${path} duplicates route between markets ${key}`);
    pairs.add(key);
    return {
      marketAId: lower,
      marketBId: upper,
      distanceUnits: finitePositive(input.distanceUnits, `${path}.distanceUnits`),
      baseCapacitySUSDPerDay: finitePositive(
        input.baseCapacitySUSDPerDay,
        `${path}.baseCapacitySUSDPerDay`,
      ),
    };
  });
  canonical.sort((left, right) =>
    left.marketAId !== right.marketAId
      ? left.marketAId - right.marketAId
      : left.marketBId - right.marketBId,
  );
  const builtRoutes: TradeRoute[] = canonical.map((route, index) => ({
    id: index,
    ...route,
  }));
  return {
    enabled: true,
    routes: builtRoutes,
    shipments: [],
    nextShipmentId: 1,
    lastDispatchDay: null,
    lastDay: null,
  };
}

/**
 * Validate authoritative E6a trade state and its relationships.
 *
 * The strictest invariant is that an in-transit shipment's arrival day is strictly
 * after the world's next day: a shipment that has arrived must already have been
 * delivered and removed, which makes duplicate delivery impossible to persist.
 */
export function assertValidTradeState(world: World, path = "world.trade"): void {
  const trade = world.trade;
  if (typeof trade !== "object" || trade === null) {
    throw new TypeError(`${path} must be an object`);
  }
  if (typeof trade.enabled !== "boolean") {
    throw new TypeError(`${path}.enabled must be a boolean`);
  }
  const marketIds = new Set(world.markets.map((market) => market.id));
  const buildingById = new Map(world.buildings.map((building) => [building.id, building]));
  const countryIds = new Set(world.countries.map((country) => country.id));
  const goodCount = world.markets[0]?.priceSUSD.length ?? 0;

  if (!Array.isArray(trade.routes)) throw new TypeError(`${path}.routes must be an array`);
  if (trade.routes.length > MAX_TRADE_ROUTES) {
    throw new RangeError(`${path}.routes must contain at most ${String(MAX_TRADE_ROUTES)} entries`);
  }
  if ((trade.routes.length > 0) !== trade.enabled) {
    throw new RangeError(`${path}.enabled must match the presence of authored routes`);
  }
  const routePairs = new Set<string>();
  for (let index = 0; index < trade.routes.length; index += 1) {
    const route = trade.routes[index];
    if (route === undefined) throw new RangeError(`${path}.routes[${String(index)}] is missing`);
    const entryPath = `${path}.routes[${String(index)}]`;
    if (route.id !== index) {
      throw new RangeError(`${entryPath}.id must equal its ascending index`);
    }
    if (!marketIds.has(route.marketAId) || !marketIds.has(route.marketBId)) {
      throw new RangeError(`${entryPath} references an unknown market`);
    }
    if (!(route.marketAId < route.marketBId)) {
      throw new RangeError(`${entryPath} must store the lower market id first`);
    }
    const pair = `${String(route.marketAId)}:${String(route.marketBId)}`;
    if (routePairs.has(pair)) throw new RangeError(`${entryPath} duplicates a market pair`);
    routePairs.add(pair);
    if (
      !Number.isFinite(route.distanceUnits) ||
      !(route.distanceUnits > 0) ||
      route.distanceUnits > 100
    ) {
      throw new RangeError(`${entryPath}.distanceUnits must be a positive bounded number`);
    }
    if (!Number.isFinite(route.baseCapacitySUSDPerDay) || !(route.baseCapacitySUSDPerDay > 0)) {
      throw new RangeError(`${entryPath}.baseCapacitySUSDPerDay must be positive`);
    }
  }

  if (!Array.isArray(trade.shipments)) throw new TypeError(`${path}.shipments must be an array`);
  if (trade.shipments.length > MAX_TRADE_SHIPMENTS) {
    throw new RangeError(
      `${path}.shipments must contain at most ${String(MAX_TRADE_SHIPMENTS)} entries`,
    );
  }
  let maxShipmentId = 0;
  for (let index = 0; index < trade.shipments.length; index += 1) {
    const shipment = trade.shipments[index];
    if (shipment === undefined) {
      throw new RangeError(`${path}.shipments[${String(index)}] is missing`);
    }
    const entryPath = `${path}.shipments[${String(index)}]`;
    if (!Number.isInteger(shipment.id) || shipment.id <= 0) {
      throw new RangeError(`${entryPath}.id must be a positive integer`);
    }
    if (index > 0 && (trade.shipments[index - 1]?.id ?? 0) >= shipment.id) {
      throw new RangeError(`${path}.shipments must be strictly ascending by id`);
    }
    if (shipment.id >= trade.nextShipmentId) {
      throw new RangeError(`${entryPath}.id must be below nextShipmentId`);
    }
    maxShipmentId = Math.max(maxShipmentId, shipment.id);
    if (!Number.isInteger(shipment.goodId) || shipment.goodId < 0 || shipment.goodId >= goodCount) {
      throw new RangeError(`${entryPath}.goodId is outside the good catalog`);
    }
    if (!Number.isFinite(shipment.quantity) || !(shipment.quantity > 0)) {
      throw new RangeError(`${entryPath}.quantity must be strictly positive`);
    }
    const seller = buildingById.get(shipment.sellerBuildingId);
    if (seller === undefined || !seller.operational) {
      throw new RangeError(`${entryPath}.sellerBuildingId must reference an operational building`);
    }
    if (!marketIds.has(shipment.originMarketId) || !marketIds.has(shipment.destinationMarketId)) {
      throw new RangeError(`${entryPath} references an unknown market`);
    }
    if (shipment.originMarketId === shipment.destinationMarketId) {
      throw new RangeError(`${entryPath} must move goods between two markets`);
    }
    if (shipment.originCountryId !== null && !countryIds.has(shipment.originCountryId)) {
      throw new RangeError(`${entryPath}.originCountryId is not a registered country`);
    }
    if (
      shipment.destinationCountryId !== null &&
      !countryIds.has(shipment.destinationCountryId)
    ) {
      throw new RangeError(`${entryPath}.destinationCountryId is not a registered country`);
    }
    if (!Number.isInteger(shipment.dispatchDay) || shipment.dispatchDay < 0) {
      throw new RangeError(`${entryPath}.dispatchDay must be a day index`);
    }
    if (!Number.isInteger(shipment.arrivalDay) || shipment.arrivalDay <= shipment.dispatchDay) {
      throw new RangeError(`${entryPath}.arrivalDay must be after dispatchDay`);
    }
    if (shipment.arrivalDay < world.dayIndex) {
      throw new RangeError(
        `${entryPath}.arrivalDay ${String(shipment.arrivalDay)} is before the world day ${String(world.dayIndex)}; an arrived shipment must have been delivered and removed`,
      );
    }
    for (const field of ["cargoValueSUSD", "freightCostSUSD", "dutySUSD"] as const) {
      if (!Number.isFinite(shipment[field]) || shipment[field] < 0) {
        throw new RangeError(`${entryPath}.${field} must be finite and non-negative`);
      }
    }
    if (!(shipment.cargoValueSUSD > 0)) {
      throw new RangeError(`${entryPath}.cargoValueSUSD must be positive`);
    }
    if (!Number.isFinite(shipment.dutyRate) || shipment.dutyRate < 0 || shipment.dutyRate > 1) {
      throw new RangeError(`${entryPath}.dutyRate must be a rate in 0..1`);
    }
    const expectedDuty = shipment.cargoValueSUSD * shipment.dutyRate;
    if (
      Math.abs(expectedDuty - shipment.dutySUSD) >
      MONEY_TOLERANCE_SUSD * Math.max(1, expectedDuty, shipment.dutySUSD)
    ) {
      throw new RangeError(`${entryPath}.dutySUSD does not reconcile with cargo value × rate`);
    }
  }
  if (!Number.isInteger(trade.nextShipmentId) || trade.nextShipmentId <= maxShipmentId) {
    throw new RangeError(`${path}.nextShipmentId must exceed every retained shipment id`);
  }
  if (trade.lastDispatchDay !== null) {
    if (!Number.isInteger(trade.lastDispatchDay) || trade.lastDispatchDay < 0) {
      throw new RangeError(`${path}.lastDispatchDay must be a day index or null`);
    }
    if (trade.lastDispatchDay > world.dayIndex) {
      throw new RangeError(`${path}.lastDispatchDay must not be after the world day`);
    }
  }

  const lastDay = trade.lastDay;
  if (lastDay !== null) {
    if (!Number.isInteger(lastDay.dayIndex) || lastDay.dayIndex < 0) {
      throw new RangeError(`${path}.lastDay.dayIndex must be a day index`);
    }
    if (lastDay.dayIndex > world.dayIndex) {
      throw new RangeError(`${path}.lastDay.dayIndex must not be after the world day`);
    }
    for (const field of ["dispatchedShipments", "arrivedShipments"] as const) {
      if (!Number.isInteger(lastDay[field]) || lastDay[field] < 0) {
        throw new RangeError(`${path}.lastDay.${field} must be a non-negative integer`);
      }
    }
    for (const field of ["freightPaidSUSD", "dutyPaidSUSD", "ownerFundedSUSD"] as const) {
      if (!Number.isFinite(lastDay[field]) || lastDay[field] < 0) {
        throw new RangeError(`${path}.lastDay.${field} must be finite and non-negative`);
      }
    }
    if (!Array.isArray(lastDay.blocked)) {
      throw new TypeError(`${path}.lastDay.blocked must be an array`);
    }
    if (lastDay.blocked.length > MAX_TRADE_BLOCKED_DIAGNOSTICS) {
      throw new RangeError(
        `${path}.lastDay.blocked must contain at most ${String(MAX_TRADE_BLOCKED_DIAGNOSTICS)} entries`,
      );
    }
    for (let index = 0; index < lastDay.blocked.length; index += 1) {
      const entry = lastDay.blocked[index];
      const entryPath = `${path}.lastDay.blocked[${String(index)}]`;
      if (entry === undefined) throw new RangeError(`${entryPath} is missing`);
      if (!marketIds.has(entry.originMarketId) || !marketIds.has(entry.destinationMarketId)) {
        throw new RangeError(`${entryPath} references an unknown market`);
      }
      if (!Number.isInteger(entry.goodId) || entry.goodId < 0 || entry.goodId >= goodCount) {
        throw new RangeError(`${entryPath}.goodId is outside the good catalog`);
      }
      if (!(TRADE_BLOCK_REASONS as readonly string[]).includes(entry.reason)) {
        throw new RangeError(`${entryPath}.reason is not a registered trade block reason`);
      }
    }
  }
}

