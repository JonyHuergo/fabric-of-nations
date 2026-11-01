/**
 * E6a transport, access, and inter-market trade (D-079).
 *
 * Two deterministic phases run on the staged economic day:
 *
 * 1. `runTradeArrivals` (before market clearing) moves consignments whose transit
 *    time has elapsed from `TradeState.shipments` into exactly one destination
 *    market lot owned by the shipping building. Goods in transit are therefore held
 *    in one place only.
 * 2. `runTradeDispatch` (after settlement, before the fiscal phase) lets a
 *    producing building ship its own post-clearing surplus to another market when
 *    the destination price covers origin value, freight, duty, and a provisional
 *    margin. Freight and duty are paid from real operating cash in one atomic
 *    posting batch.
 *
 * The model adds no merchant, no order book, and no goods or money: the only cash
 * flows are a real freight charge and a real import duty, and the only physical
 * movement is stock leaving one market and entering another once.
 */

import { dayIndexToCivilDate } from "../calendar.js";
import { MONEY_TOLERANCE_RUSD, QUANTITY_TOLERANCE } from "../population/constants.js";
import type { DayIndex, Id } from "../types.js";
import { assertValidWorldForTick, type PhaseValidationOptions, type World } from "../world.js";
import { postJournalBatch, type JournalEntryInput } from "./accounting.js";
import {
  MAX_TRADE_BLOCKED_DIAGNOSTICS,
  MAX_TRADE_SHIPMENTS,
  TRADE_MIN_MARGIN_RATE,
} from "./constants.js";
import { assertValidEconomyDefinitions } from "./definitions.js";
import { buildRegionOwnerMap } from "./country.js";
import { isConvertibilitySuspended } from "./monetary.js";
import {
  type AccountSubtype,
  type EconomyDefinitions,
  type FinancialAccount,
  type GoodDef,
  type Market,
  type TradeBlockedDiagnostic,
  type TradePolicyState,
  type TradeRoute,
  type TradeShipment,
  type TradeState,
} from "./types.js";

export {
  assertValidTradePolicyState,
  assertValidTradeState,
  createTradePolicyState,
  createTradeState,
  neutralTradePolicyState,
} from "./tradeState.js";

/** True when `dayIndex` is the first civil day of its month. */
export function isFirstCivilDayOfMonth(dayIndex: DayIndex): boolean {
  return dayIndexToCivilDate(dayIndex).day === 1;
}


/** Derived infrastructure quality of a market: mean of its regions, or 0. */
export function marketInfrastructureQuality(world: World, market: Market): number {
  if (market.regionIds.length === 0) return 0;
  const byId = new Map(world.regions.map((region) => [region.id, region]));
  let total = 0;
  for (const regionId of market.regionIds) {
    const region = byId.get(regionId);
    total += region === undefined ? 0 : region.infrastructure;
  }
  return total / market.regionIds.length;
}

/**
 * Effective route capacity for one direction on one day.
 *
 * Capacity is a daily flow limit in RUSD of cargo value at the origin market price,
 * scaled by the mean of the two markets' infrastructure quality (D-079 §3). It is
 * never stored or accumulated.
 */
export function routeCapacityRUSDPerDay(
  route: TradeRoute,
  originInfrastructure: number,
  destinationInfrastructure: number,
): number {
  const factor = 0.5 * originInfrastructure + 0.5 * destinationInfrastructure;
  if (!Number.isFinite(factor) || factor <= 0) return 0;
  return route.baseCapacityRUSDPerDay * Math.min(1, factor);
}

/** Freight charged per physical unit on a route (RUSD). */
export function freightCostPerUnit(good: GoodDef, route: TradeRoute): number {
  return good.transportCostPerUnit * route.distanceUnits;
}

/** Transit time in civil days derived from the route distance (at least one day). */
export function transitDays(route: TradeRoute): number {
  return Math.max(1, Math.ceil(route.distanceUnits));
}

function lotKey(goodId: Id, ownerBuildingId: Id): string {
  return `${String(goodId)}:${String(ownerBuildingId)}`;
}

function canonicalLots(lots: readonly { goodId: Id; ownerBuildingId: Id; quantity: number }[]) {
  return [...lots]
    .filter((lot) => lot.quantity > 0)
    .sort((left, right) =>
      left.goodId !== right.goodId
        ? left.goodId - right.goodId
        : left.ownerBuildingId - right.ownerBuildingId,
    )
    .map((lot) => ({ ...lot }));
}

export interface TradeArrivalResult {
  readonly dayIndex: DayIndex;
  readonly shipments: readonly TradeShipment[];
}

/**
 * Deliver every consignment whose arrival day has come.
 *
 * Delivery is exact-once: a shipment is removed from the in-transit list and its
 * quantity is added to exactly one destination lot. The destination market is not
 * cleared here; the goods are available to the same day's market phase.
 */
export function runTradeArrivals(
  world: World,
  definitions: EconomyDefinitions,
  dayIndex: DayIndex,
  options: PhaseValidationOptions = {},
): TradeArrivalResult {
  if (options.validateWorld !== false) assertValidWorldForTick(world);
  assertValidEconomyDefinitions(definitions);
  if (definitions.dataVersion !== world.dataVersion || definitions.scenarioId !== world.scenarioId) {
    throw new RangeError("economy definitions do not match the world data/scenario identity");
  }
  if (!world.trade.enabled || world.trade.shipments.length === 0) {
    return { dayIndex, shipments: [] };
  }
  const due = world.trade.shipments
    .filter((shipment) => shipment.arrivalDay <= dayIndex)
    .sort((left, right) => left.id - right.id);
  if (due.length === 0) return { dayIndex, shipments: [] };

  const marketById = new Map(world.markets.map((market) => [market.id, market]));
  const dueIds = new Set(due.map((shipment) => shipment.id));
  const remaining = world.trade.shipments.filter((shipment) => !dueIds.has(shipment.id));

  for (const shipment of due) {
    const market = marketById.get(shipment.destinationMarketId);
    if (market === undefined) {
      throw new RangeError(
        `trade shipment ${String(shipment.id)} references unknown destination market ${String(shipment.destinationMarketId)}`,
      );
    }
    if (!Number.isFinite(shipment.quantity) || !(shipment.quantity > 0)) {
      throw new RangeError(`trade shipment ${String(shipment.id)} has an invalid quantity`);
    }
    const lots = new Map<string, number>();
    for (const lot of market.stockLots) lots.set(lotKey(lot.goodId, lot.ownerBuildingId), lot.quantity);
    const key = lotKey(shipment.goodId, shipment.sellerBuildingId);
    lots.set(key, (lots.get(key) ?? 0) + shipment.quantity);
    market.stockLots = canonicalLots(
      [...lots.entries()].map(([text, quantity]) => {
        const [goodText, ownerText] = text.split(":");
        return {
          goodId: Number(goodText),
          ownerBuildingId: Number(ownerText),
          quantity,
        };
      }),
    );
  }

  world.trade.shipments = remaining;
  const previous = world.trade.lastDay;
  world.trade.lastDay = {
    dayIndex,
    dispatchedShipments: previous?.dayIndex === dayIndex ? previous.dispatchedShipments : 0,
    freightPaidRUSD: previous?.dayIndex === dayIndex ? previous.freightPaidRUSD : 0,
    dutyPaidRUSD: previous?.dayIndex === dayIndex ? previous.dutyPaidRUSD : 0,
    ownerFundedRUSD: previous?.dayIndex === dayIndex ? previous.ownerFundedRUSD : 0,
    arrivedShipments:
      (previous?.dayIndex === dayIndex ? previous.arrivedShipments : 0) + due.length,
    blocked: previous?.dayIndex === dayIndex ? previous.blocked : [],
  };
  return { dayIndex, shipments: due };
}

export interface TradeCapacityUse {
  readonly routeId: Id;
  readonly originMarketId: Id;
  readonly destinationMarketId: Id;
  readonly capacityRUSD: number;
  readonly usedRUSD: number;
}

export interface TradeDispatchResult {
  readonly dayIndex: DayIndex;
  readonly shipments: readonly TradeShipment[];
  readonly freightPaidRUSD: number;
  readonly dutyPaidRUSD: number;
  readonly ownerFundedRUSD: number;
  readonly blocked: readonly TradeBlockedDiagnostic[];
  readonly capacityUse: readonly TradeCapacityUse[];
  readonly postingIds: readonly number[];
}

function accountByOwner(
  world: World,
  ownerKind: "building" | "country" | "system" | "popBlock",
  ownerId: Id | null,
  subtype: AccountSubtype,
): FinancialAccount {
  const account = world.finance.accounts.find(
    (candidate) =>
      candidate.ownerKind === ownerKind &&
      candidate.ownerId === ownerId &&
      candidate.subtype === subtype,
  );
  if (account === undefined) {
    throw new RangeError(
      `${ownerKind} ${String(ownerId)} has no ${subtype} account for E6a trade`,
    );
  }
  return account;
}

interface DispatchBlock {
  readonly originMarketId: Id;
  readonly destinationMarketId: Id;
  readonly goodId: Id;
  readonly reason: TradeBlockedDiagnostic["reason"];
}

/**
 * Dispatch profitable, capacity-limited consignments and post their freight/duty.
 *
 * The phase is atomic: trade state, every country's trade policy/memo, and every
 * market's lots are restored if any step fails. A repeated dispatch for the same day
 * is rejected outright, so a retried phase cannot double-charge or double-ship.
 */
export function runTradeDispatchPhase(
  world: World,
  definitions: EconomyDefinitions,
  dayIndex: DayIndex,
  options: PhaseValidationOptions = {},
): TradeDispatchResult {
  const openingTrade = cloneTradeState(world.trade);
  const openingCountryTrade = new Map<Id, TradePolicyState>();
  for (const country of world.countries) {
    openingCountryTrade.set(country.id, cloneTradePolicy(country.trade));
  }
  const openingLots = new Map<Id, { goodId: Id; ownerBuildingId: Id; quantity: number }[]>();
  for (const market of world.markets) {
    openingLots.set(
      market.id,
      market.stockLots.map((lot) => ({ ...lot })),
    );
  }
  try {
    return dispatchTrade(world, definitions, dayIndex, options);
  } catch (error) {
    world.trade = openingTrade;
    for (const country of world.countries) {
      const previous = openingCountryTrade.get(country.id);
      if (previous !== undefined) country.trade = previous;
    }
    for (const market of world.markets) {
      const previous = openingLots.get(market.id);
      if (previous !== undefined) market.stockLots = previous;
    }
    throw error;
  }
}

function cloneTradePolicy(policy: TradePolicyState): TradePolicyState {
  return {
    ...policy,
    tariffRates: [...policy.tariffRates],
    importQuotaQuantity: [...policy.importQuotaQuantity],
    importQuotaUsedQuantity: [...policy.importQuotaUsedQuantity],
    exportRestricted: [...policy.exportRestricted],
  };
}

function cloneTradeState(state: TradeState): TradeState {
  return {
    ...state,
    routes: state.routes.map((route) => ({ ...route })),
    shipments: state.shipments.map((shipment) => ({ ...shipment })),
    lastDay:
      state.lastDay === null
        ? null
        : { ...state.lastDay, blocked: state.lastDay.blocked.map((entry) => ({ ...entry })) },
  };
}

function dispatchTrade(
  world: World,
  definitions: EconomyDefinitions,
  dayIndex: DayIndex,
  options: PhaseValidationOptions = {},
): TradeDispatchResult {
  if (options.validateWorld !== false) assertValidWorldForTick(world);
  assertValidEconomyDefinitions(definitions);
  if (definitions.dataVersion !== world.dataVersion || definitions.scenarioId !== world.scenarioId) {
    throw new RangeError("economy definitions do not match the world data/scenario identity");
  }
  if (world.trade.lastDispatchDay === dayIndex) {
    // Idempotent repeat guard. A day can be re-run after an action in tests and tooling
    // (the staged-day pattern), and a second dispatch would double-charge freight and
    // duty for the same day. Return an empty result without mutating anything: the
    // already-recorded day report and shipments stand.
    return {
      dayIndex,
      shipments: [],
      freightPaidRUSD: 0,
      dutyPaidRUSD: 0,
      ownerFundedRUSD: 0,
      blocked: [],
      capacityUse: [],
      postingIds: [],
    };
  }
  const empty: TradeDispatchResult = {
    dayIndex,
    shipments: [],
    freightPaidRUSD: 0,
    dutyPaidRUSD: 0,
    ownerFundedRUSD: 0,
    blocked: [],
    capacityUse: [],
    postingIds: [],
  };
  if (!world.trade.enabled) {
    world.trade.lastDay = {
      dayIndex,
      dispatchedShipments: 0,
      freightPaidRUSD: 0,
      dutyPaidRUSD: 0,
      ownerFundedRUSD: 0,
      arrivedShipments: 0,
      blocked: [],
    };
    world.trade.lastDispatchDay = dayIndex;
    return empty;
  }

  // Monthly quota and memo reset on the first civil day. It is driven by the civil
  // calendar, so a retried day resets at most once per month.
  if (isFirstCivilDayOfMonth(dayIndex)) {
    for (const country of world.countries) {
      country.trade.importQuotaUsedQuantity = world.trade.enabled
        ? new Array<number>(definitions.goods.length).fill(0)
        : country.trade.importQuotaUsedQuantity;
      country.trade.exportsValueMonthToDateRUSD = 0;
      country.trade.importsValueMonthToDateRUSD = 0;
      country.trade.dutyReceivedMonthToDateRUSD = 0;
      country.trade.dutyPaidMonthToDateRUSD = 0;
      country.trade.freightPaidMonthToDateRUSD = 0;
    }
  }


  const goods = [...definitions.goods].sort((left, right) => left.id - right.id);
  const marketById = new Map(world.markets.map((market) => [market.id, market]));
  const buildingById = new Map(world.buildings.map((building) => [building.id, building]));
  const countryById = new Map(world.countries.map((country) => [country.id, country]));
  const regionOwner = buildRegionOwnerMap(world);
  const infrastructureByMarket = new Map<Id, number>();
  for (const market of world.markets) {
    infrastructureByMarket.set(market.id, marketInfrastructureQuality(world, market));
  }

  // Running cash per building so several shipments cannot overdraw the same account.
  const cashByBuilding = new Map<Id, number>();
  const cashOf = (buildingId: Id): number => {
    const existing = cashByBuilding.get(buildingId);
    if (existing !== undefined) return existing;
    const account = accountByOwner(world, "building", buildingId, "operating-cash");
    cashByBuilding.set(buildingId, account.balanceRUSD);
    return account.balanceRUSD;
  };
  // Running cash per account for owner funding, which several buildings may share.
  const cashByAccount = new Map<Id, number>();
  const cashOfAccount = (accountId: Id): number => {
    const existing = cashByAccount.get(accountId);
    if (existing !== undefined) return existing;
    const account = world.finance.accounts.find((candidate) => candidate.id === accountId);
    if (account === undefined) {
      throw new RangeError(`unknown cash account ${String(accountId)} for E6a trade`);
    }
    cashByAccount.set(accountId, account.balanceRUSD);
    return account.balanceRUSD;
  };

  const shipments: TradeShipment[] = [];
  const blocked: DispatchBlock[] = [];
  const capacityUse: TradeCapacityUse[] = [];
  const entries: JournalEntryInput[] = [];
  let nextShipmentId = world.trade.nextShipmentId;
  let freightPaidRUSD = 0;
  let dutyPaidRUSD = 0;
  let ownerFundedRUSD = 0;

  // Uncommitted lot quantity for the whole dispatch. A lot may be offered to several
  // destinations on different routes; this map is decremented by every shipment so the
  // same stock can never be sold twice (a market's lot is only mutated after the loop).
  const remainingByLot = new Map<
    string,
    { readonly marketId: Id; readonly goodId: Id; readonly ownerBuildingId: Id; quantity: number }
  >();
  for (const market of world.markets) {
    for (const lot of market.stockLots) {
      remainingByLot.set(`${String(market.id)}:${String(lot.goodId)}:${String(lot.ownerBuildingId)}`, {
        marketId: market.id,
        goodId: lot.goodId,
        ownerBuildingId: lot.ownerBuildingId,
        quantity: lot.quantity,
      });
    }
  }

  const noteBlock = (
    originMarketId: Id,
    destinationMarketId: Id,
    goodId: Id,
    reason: TradeBlockedDiagnostic["reason"],
  ): void => {
    blocked.push({ originMarketId, destinationMarketId, goodId, reason });
  };

  /** Domestic lots still available to export from `market`, ascending owner building. */
  const exportableLots = (
    market: Market,
    goodId: Id,
  ): { key: string; ownerBuildingId: Id; quantity: number }[] => {
    const regions = new Set(market.regionIds);
    const lots: { key: string; ownerBuildingId: Id; quantity: number }[] = [];
    for (const [key, entry] of remainingByLot) {
      if (entry.marketId !== market.id || entry.goodId !== goodId) continue;
      if (!(entry.quantity > 0)) continue;
      const building = buildingById.get(entry.ownerBuildingId);
      if (building === undefined || !building.operational) continue;
      // Only a building located inside the market may export from it. Imported lots
      // (owned by a foreign building) are sold locally; re-export/entrepôt trade is not
      // modeled in E6a.
      if (!regions.has(building.regionId)) continue;
      lots.push({
        key,
        ownerBuildingId: entry.ownerBuildingId,
        quantity: entry.quantity,
      });
    }
    lots.sort((left, right) => left.ownerBuildingId - right.ownerBuildingId);
    return lots;
  };

  for (const route of [...world.trade.routes].sort((left, right) => left.id - right.id)) {
    const marketA = marketById.get(route.marketAId);
    const marketB = marketById.get(route.marketBId);
    if (marketA === undefined || marketB === undefined) {
      throw new RangeError(`trade route ${String(route.id)} references an unknown market`);
    }
    const directions = [
      { origin: marketA, destination: marketB },
      { origin: marketB, destination: marketA },
    ];
    for (const direction of directions) {
      const origin = direction.origin;
      const destination = direction.destination;
      const capacityRUSD = routeCapacityRUSDPerDay(
        route,
        infrastructureByMarket.get(origin.id) ?? 0,
        infrastructureByMarket.get(destination.id) ?? 0,
      );
      let usedRUSD = 0;
      const destinationAdminId = destination.customsCountryId;
      const originAdminId = origin.customsCountryId;
      const dutiable =
        destinationAdminId !== null &&
        originAdminId !== null &&
        destinationAdminId !== originAdminId;
      const destinationCountry =
        destinationAdminId === null ? undefined : countryById.get(destinationAdminId);
      // E6b: a country whose monetary authority cannot convert (insufficient reserve
      // cover) cannot settle external imports, so shipments crossing into its customs
      // zone are blocked. Domestic (same-zone) allocation is unaffected.
      const fxSuspended =
        destinationAdminId !== null &&
        isConvertibilitySuspended(world, destinationAdminId);
      const destinationPrices = destination.priceRUSD;

      for (const good of goods) {
        const goodId = good.id;
        const originPrice = origin.priceRUSD[goodId];
        const destinationPrice = destinationPrices[goodId];
        if (
          originPrice === undefined ||
          !(originPrice > 0) ||
          destinationPrice === undefined ||
          !(destinationPrice > 0)
        ) {
          throw new RangeError(`market price for good ${String(goodId)} is invalid`);
        }

        if (dutiable && fxSuspended) {
          noteBlock(origin.id, destination.id, goodId, "fx-convertibility");
          continue;
        }

        // Exportable surplus: domestic lots of this good left after today's clearing and
        // after any shipment already dispatched earlier in this phase.
        const exportable = exportableLots(origin, goodId);
        const availableQuantity = exportable.reduce((total, lot) => total + lot.quantity, 0);
        if (!(availableQuantity > 0)) {
          if (destinationPrice > originPrice) {
            noteBlock(origin.id, destination.id, goodId, "stock");
          }
          continue;
        }

        const freightPerUnit = freightCostPerUnit(good, route);
        const dutyRate = dutiable && destinationCountry !== undefined
          ? (destinationCountry.trade.tariffRates[goodId] ?? 0)
          : 0;
        const dutyPerUnit = originPrice * dutyRate;
        const landedCostPerUnit = originPrice + freightPerUnit + dutyPerUnit;
        if (destinationPrice <= landedCostPerUnit * (1 + TRADE_MIN_MARGIN_RATE)) {
          if (destinationPrice > originPrice) {
            noteBlock(origin.id, destination.id, goodId, "margin");
          }
          continue;
        }

        // A per-good export prohibition is a real policy constraint, not a price.
        const exportingCountries = new Set<Id>();
        for (const lot of exportable) {
          const building = buildingById.get(lot.ownerBuildingId);
          if (building === undefined) continue;
          const countryId = regionOwner.get(building.regionId);
          if (countryId !== undefined) exportingCountries.add(countryId);
        }
        let restrictionAppliesToAll = exportingCountries.size > 0;
        for (const countryId of exportingCountries) {
          const country = countryById.get(countryId);
          if (country === undefined || country.trade.exportRestricted[goodId] !== true) {
            restrictionAppliesToAll = false;
            break;
          }
        }

        if (restrictionAppliesToAll) {
          noteBlock(origin.id, destination.id, goodId, "export-restricted");
          continue;
        }

        const remainingCapacity = Math.max(0, capacityRUSD - usedRUSD);
        if (!(remainingCapacity > 0) || inTransitCapReached(world, shipments.length)) {
          noteBlock(origin.id, destination.id, goodId, "capacity");
          continue;
        }
        const capacityQuantity = remainingCapacity / originPrice;
        let quantityCeiling = Math.min(availableQuantity, capacityQuantity);

        // Import quota of the destination customs administration, physical units.
        let quotaRemaining = Number.POSITIVE_INFINITY;
        if (dutiable && destinationCountry !== undefined) {
          const quota = destinationCountry.trade.importQuotaQuantity[goodId] ?? null;
          if (quota !== null) {
            const used = destinationCountry.trade.importQuotaUsedQuantity[goodId] ?? 0;
            quotaRemaining = Math.max(0, quota - used);
            quantityCeiling = Math.min(quantityCeiling, quotaRemaining);
          }
        }
        if (!(quantityCeiling > 0)) {
          noteBlock(
            origin.id,
            destination.id,
            goodId,
            quotaRemaining <= 0 ? "quota" : "capacity",
          );
          continue;
        }

        let shippedQuantity = 0;
        for (const lot of exportable) {
          if (quantityCeiling - shippedQuantity <= QUANTITY_TOLERANCE * Math.max(1, quantityCeiling)) {
            break;
          }
          const building = buildingById.get(lot.ownerBuildingId);
          if (building === undefined || !building.operational) continue;
          const countryId = regionOwner.get(building.regionId) ?? null;
          if (countryId !== null) {
            const country = countryById.get(countryId);
            if (country !== undefined && country.trade.exportRestricted[goodId] === true) continue;
          }
          const costPerUnit = freightPerUnit + dutyPerUnit;
          const buildingCash = cashOf(building.id);
          const owner = ownerFundingFor(world, building);
          const ownerCash = cashOfAccount(owner.cashAccountId);
          const availableCash = buildingCash + ownerCash;
          const cashQuantity =
            costPerUnit > 0
              ? Math.max(0, availableCash - MONEY_TOLERANCE_RUSD) / costPerUnit
              : Number.POSITIVE_INFINITY;
          const lotQuantity = Math.min(
            lot.quantity,
            quantityCeiling - shippedQuantity,
            cashQuantity,
          );
          if (!(lotQuantity > 0)) {
            if (cashQuantity <= 0) {
              noteBlock(origin.id, destination.id, goodId, "funding");
            }
            continue;
          }
          const cargoValue = lotQuantity * originPrice;
          const freightCost = lotQuantity * freightPerUnit;
          const dutyCost = lotQuantity * dutyPerUnit;
          const totalCost = freightCost + dutyCost;
          if (totalCost > availableCash + MONEY_TOLERANCE_RUSD * Math.max(1, availableCash)) {
            continue;
          }
          // Working-capital rule (D-079 §12a): the enterprise pays from its own cash;
          // any shortfall is funded by its owner as an explicit capital injection, never
          // a loan, payable, or negative balance.
          const buildingPortion = Math.min(buildingCash, totalCost);
          const ownerPortion = totalCost - buildingPortion;
          if (ownerPortion > ownerCash + MONEY_TOLERANCE_RUSD * Math.max(1, ownerCash)) {
            continue;
          }
          if (ownerPortion > 0) {
            entries.push({
              transactionKind: "owner-capital-injection",
              lines: [
                {
                  accountId: building.operatingCashAccountId,
                  side: "debit",
                  amountRUSD: ownerPortion,
                },
                {
                  accountId: accountByOwner(world, "building", building.id, "owner-equity").id,
                  side: "credit",
                  amountRUSD: ownerPortion,
                },
                {
                  accountId: owner.cashAccountId,
                  side: "credit",
                  amountRUSD: ownerPortion,
                },
                {
                  accountId: owner.equityAccountId,
                  side: "debit",
                  amountRUSD: ownerPortion,
                },
              ],
              sourceEntityId: owner.ownerId,
              targetEntityId: building.id,
            });
            cashByAccount.set(owner.cashAccountId, ownerCash - ownerPortion);
            ownerFundedRUSD += ownerPortion;
          }
          const shipment: TradeShipment = {
            id: nextShipmentId,
            goodId,
            quantity: lotQuantity,
            sellerBuildingId: building.id,
            originMarketId: origin.id,
            destinationMarketId: destination.id,
            originCountryId: countryId,
            destinationCountryId: destinationAdminId,
            dispatchDay: dayIndex,
            arrivalDay: dayIndex + transitDays(route),
            cargoValueRUSD: cargoValue,
            freightCostRUSD: freightCost,
            dutyRUSD: dutyCost,
            dutyRate,
          };
          nextShipmentId += 1;
          shipments.push(shipment);
          shippedQuantity += lotQuantity;
          usedRUSD += cargoValue;
          const remainingLot = remainingByLot.get(lot.key);
          if (remainingLot === undefined) {
            throw new RangeError(`trade dispatch lost lot ${lot.key}`);
          }
          remainingLot.quantity -= lotQuantity;
          cashByBuilding.set(building.id, buildingCash - buildingPortion);
          freightPaidRUSD += freightCost;
          dutyPaidRUSD += dutyCost;

          if (countryId !== null) {
            const exporter = countryById.get(countryId);
            if (exporter !== undefined) {
              exporter.trade.exportsValueMonthToDateRUSD += cargoValue;
              exporter.trade.dutyPaidMonthToDateRUSD += dutyCost;
              exporter.trade.freightPaidMonthToDateRUSD += freightCost;
            }
          }
          if (destinationCountry !== undefined) {
            destinationCountry.trade.importsValueMonthToDateRUSD += cargoValue;
            destinationCountry.trade.dutyReceivedMonthToDateRUSD += dutyCost;
            if (dutiable) {
              destinationCountry.trade.importQuotaUsedQuantity[goodId] =
                (destinationCountry.trade.importQuotaUsedQuantity[goodId] ?? 0) + lotQuantity;
            }
          }

          if (freightCost > 0) {
            entries.push({
              transactionKind: "trade-freight",
              lines: [
                {
                  accountId: accountByOwner(world, "building", building.id, "freight-expense").id,
                  side: "debit",
                  amountRUSD: freightCost,
                },
                {
                  accountId: building.operatingCashAccountId,
                  side: "credit",
                  amountRUSD: freightCost,
                },
                {
                  accountId: systemCashAccount(world).id,
                  side: "debit",
                  amountRUSD: freightCost,
                },
                {
                  accountId: accountByOwner(world, "system", null, "system-income").id,
                  side: "credit",
                  amountRUSD: freightCost,
                },
              ],
              sourceEntityId: building.id,
              targetEntityId: null,
            });
          }
          if (dutyCost > 0 && destinationCountry !== undefined) {
            entries.push({
              transactionKind: "customs-duty",
              lines: [
                {
                  accountId: accountByOwner(world, "building", building.id, "customs-duty-expense").id,
                  side: "debit",
                  amountRUSD: dutyCost,
                },
                {
                  accountId: building.operatingCashAccountId,
                  side: "credit",
                  amountRUSD: dutyCost,
                },
                {
                  accountId: destinationCountry.treasuryAccountId,
                  side: "debit",
                  amountRUSD: dutyCost,
                },
                {
                  accountId: accountByOwner(world, "country", destinationCountry.id, "customs-duty-revenue").id,
                  side: "credit",
                  amountRUSD: dutyCost,
                },
              ],
              sourceEntityId: building.id,
              targetEntityId: destinationCountry.id,
            });
          }
        }

        if (!(shippedQuantity > 0) && availableQuantity > 0) {
          noteBlock(origin.id, destination.id, goodId, "funding");
        }
      }
      capacityUse.push({
        routeId: route.id,
        originMarketId: origin.id,
        destinationMarketId: destination.id,
        capacityRUSD,
        usedRUSD,
      });
    }
  }

  // Apply the committed quantities to the origin markets. `remainingByLot` is the
  // single place that was decremented, so a lot can never be over-sold even when several
  // routes offer it to different destinations in the same phase.
  if (shipments.length > 0) {
    for (const market of world.markets) {
      const nextLots: { goodId: Id; ownerBuildingId: Id; quantity: number }[] = [];
      for (const entry of remainingByLot.values()) {
        if (entry.marketId !== market.id) continue;
        if (!(entry.quantity > 0)) continue;
        nextLots.push({
          goodId: entry.goodId,
          ownerBuildingId: entry.ownerBuildingId,
          quantity: entry.quantity,
        });
      }
      market.stockLots = canonicalLots(nextLots);
    }
  }

  // One atomic batch: either every freight/duty posting applies or none does.
  const postings = entries.length === 0 ? [] : postJournalBatch(world.finance, dayIndex, entries);

  world.trade.shipments = [...world.trade.shipments, ...shipments].sort(
    (left, right) => left.id - right.id,
  );
  if (world.trade.shipments.length > MAX_TRADE_SHIPMENTS) {
    throw new RangeError(
      `trade in-transit shipments exceed the bounded cap of ${String(MAX_TRADE_SHIPMENTS)}`,
    );
  }
  world.trade.nextShipmentId = nextShipmentId;
  world.trade.lastDispatchDay = dayIndex;

  blocked.sort((left, right) => {
    if (left.originMarketId !== right.originMarketId) {
      return left.originMarketId - right.originMarketId;
    }
    if (left.destinationMarketId !== right.destinationMarketId) {
      return left.destinationMarketId - right.destinationMarketId;
    }
    if (left.goodId !== right.goodId) return left.goodId - right.goodId;
    return left.reason < right.reason ? -1 : left.reason > right.reason ? 1 : 0;
  });
  const blockedDiagnostics: TradeBlockedDiagnostic[] = [];
  const seenBlocks = new Set<string>();
  for (const entry of blocked) {
    if (blockedDiagnostics.length >= MAX_TRADE_BLOCKED_DIAGNOSTICS) break;
    const key = `${String(entry.originMarketId)}:${String(entry.destinationMarketId)}:${String(entry.goodId)}:${entry.reason}`;
    if (seenBlocks.has(key)) continue;
    seenBlocks.add(key);
    blockedDiagnostics.push({
      originMarketId: entry.originMarketId,
      destinationMarketId: entry.destinationMarketId,
      goodId: entry.goodId,
      reason: entry.reason,
    });
  }

  const previousDay = world.trade.lastDay;
  world.trade.lastDay = {
    dayIndex,
    dispatchedShipments: shipments.length,
    freightPaidRUSD,
    dutyPaidRUSD,
    ownerFundedRUSD,
    arrivedShipments: previousDay?.dayIndex === dayIndex ? previousDay.arrivedShipments : 0,
    blocked: blockedDiagnostics,
  };

  return {
    dayIndex,
    shipments,
    freightPaidRUSD,
    dutyPaidRUSD,
    ownerFundedRUSD,
    blocked: blockedDiagnostics,
    capacityUse,
    postingIds: postings.map((posting) => posting.id),
  };
}

function systemCashAccount(world: World): FinancialAccount {
  const accounts = world.finance.accounts.filter(
    (account) => account.subtype === "system-reserve-cash",
  );
  if (accounts.length !== 1) {
    throw new RangeError("E6a freight requires exactly one system-reserve account");
  }
  const account = accounts[0];
  if (account === undefined) {
    throw new RangeError("E6a freight requires a system-reserve account");
  }
  return account;
}

/**
 * Resolve the owner that funds a building's trade charges beyond its own cash.
 *
 * Private ownership draws on the owner household's cash and equity; state ownership
 * draws on the owning country's treasury and equity. The owner cash account is the
 * building's declared `ownerAccountId`, so no new ownership link is invented.
 */
function ownerFundingFor(
  world: World,
  building: { readonly id: Id; readonly ownerKind: "private" | "state"; readonly ownerAccountId: Id },
): {
  readonly ownerKind: "popBlock" | "country";
  readonly ownerId: Id;
  readonly cashAccountId: Id;
  readonly equityAccountId: Id;
} {
  const ownerKind: "popBlock" | "country" =
    building.ownerKind === "private" ? "popBlock" : "country";
  const cashAccount = world.finance.accounts.find(
    (candidate) => candidate.id === building.ownerAccountId,
  );
  if (cashAccount === undefined || cashAccount.ownerId === null) {
    throw new RangeError(
      `building ${String(building.id)} owner account ${String(building.ownerAccountId)} is missing`,
    );
  }
  if (cashAccount.ownerKind !== ownerKind) {
    throw new RangeError(
      `building ${String(building.id)} owner account kind ${cashAccount.ownerKind} does not match ${ownerKind}`,
    );
  }
  const equity = accountByOwner(world, ownerKind, cashAccount.ownerId, "owner-equity");
  return {
    ownerKind,
    ownerId: cashAccount.ownerId,
    cashAccountId: cashAccount.id,
    equityAccountId: equity.id,
  };
}

function inTransitCapReached(world: World, newShipments: number): boolean {
  return world.trade.shipments.length + newShipments >= MAX_TRADE_SHIPMENTS;
}
