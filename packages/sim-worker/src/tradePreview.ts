/**
 * E6a trade-policy previews.
 *
 * These are presentation estimates derived from an immutable snapshot, not
 * authoritative forecasts: the worker recomputes duty, capacity, quota, stock, and
 * shipping decisions from live state when a day runs. The UI must label them as
 * estimates and must never imply that goods will be delivered.
 */

import type { CountrySnapshot, SimulationSnapshot, SnapshotTradeRoute } from "./protocol.js";
import type { MoneyText } from "./selectors.js";

export interface TradePolicyPreview {
  readonly valid: boolean;
  readonly errors: readonly string[];
  /** Markets whose customs frontier this country administers. */
  readonly customsMarketIds: readonly number[];
  /** True when the country administers no customs frontier, so tariffs cannot apply. */
  readonly tariffInert: boolean;
  /** Estimated duty on a unit of each good at the current market price, by good id. */
  readonly estimatedDutyPerUnitRUSD: readonly number[];
  /** Goods whose current export ban removes a real flow. */
  readonly exportBannedGoodCount: number;
  readonly notes: readonly string[];
}

function clampRate(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * Estimate the direct incidence of a proposed tariff/quota/restriction set.
 *
 * The estimate uses the destination market's current price as the dutiable value
 * basis (the authoritative base is the origin-market cargo value at dispatch). It is
 * an order-of-magnitude preview, not a forecast of trade volume or revenue.
 */
export function previewTradePolicy(
  snapshot: SimulationSnapshot,
  country: CountrySnapshot,
  proposed: {
    readonly tariffRates?: readonly number[];
    readonly importQuotaQuantity?: readonly (number | null)[];
    readonly exportRestricted?: readonly boolean[];
  },
): TradePolicyPreview {
  const errors: string[] = [];
  if (snapshot.playerCountryId !== country.id) {
    errors.push("Only the player-controlled country may change trade policy.");
  }
  const current = country.trade;
  const customsMarketIds = current.customsMarketIds;
  if (!snapshot.trade.enabled) {
    errors.push("This campaign has no authored transport routes, so trade policy has no effect.");
  }
  const goodCount = current.tariffRates.length;
  const rates = proposed.tariffRates ?? current.tariffRates;
  if (rates.length !== goodCount) {
    errors.push(`Tariff schedule must list ${String(goodCount)} goods.`);
  }
  for (let index = 0; index < rates.length; index += 1) {
    const rate = rates[index] ?? 0;
    if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
      errors.push(`Tariff rate for good ${String(index)} must be in 0..100%.`);
    }
  }
  const quotas = proposed.importQuotaQuantity ?? current.importQuotaQuantity;
  for (let index = 0; index < quotas.length; index += 1) {
    const quota = quotas[index];
    if (quota !== null && quota !== undefined) {
      if (!Number.isFinite(quota) || quota < 0) {
        errors.push(`Import quota for good ${String(index)} must be a non-negative quantity.`);
      }
    }
  }
  const restrictions = proposed.exportRestricted ?? current.exportRestricted;
  if (restrictions.length !== goodCount) {
    errors.push(`Export restrictions must list ${String(goodCount)} goods.`);
  }

  // Estimated duty per unit uses the highest current destination price among the
  // administered markets; an observed market price, not a forecast.
  const administeredMarkets = new Set(customsMarketIds);
  const estimatedDutyPerUnitRUSD: number[] = [];
  for (let goodId = 0; goodId < goodCount; goodId += 1) {
    let referencePrice = 0;
    for (const market of snapshot.markets) {
      if (!administeredMarkets.has(market.id)) continue;
      const price = market.prices.find((entry) => entry.goodId === goodId);
      if (price !== undefined && price.priceRUSD > referencePrice) {
        referencePrice = price.priceRUSD;
      }
    }
    estimatedDutyPerUnitRUSD.push(
      Math.round(referencePrice * clampRate(rates[goodId] ?? 0) * 1_000_000) / 1_000_000,
    );
  }

  const notes = [
    "Estimates use current observed prices; the authoritative duty base is the origin-market cargo value at dispatch.",
    "Tariffs apply only to shipments entering a market this country administers; a customs-union member's schedule does not apply to its partner's frontier.",
    "No estimate here implies that stock, transport capacity, quota, or shipper funds will be available at dispatch.",
  ];
  if (customsMarketIds.length === 0) {
    notes.push(
      "This country administers no customs frontier in the current campaign, so its tariff schedule cannot be collected on any import.",
    );
  }
  if (snapshot.trade.routes.length === 0) {
    notes.push("No transport routes are authored, so no inter-market trade can occur.");
  }
  return {
    valid: errors.length === 0,
    errors,
    customsMarketIds,
    tariffInert: customsMarketIds.length === 0,
    estimatedDutyPerUnitRUSD,
    exportBannedGoodCount: restrictions.filter(Boolean).length,
    notes,
  };
}

/** Describe one route's derived capacity for display (observed, not a forecast). */
export function describeTradeRoute(
  route: SnapshotTradeRoute,
  marketLabel: (marketId: number) => string,
  money: MoneyText,
): string {
  return `${marketLabel(route.marketAId)} ↔ ${marketLabel(route.marketBId)}: distance ${route.distanceUnits.toFixed(1)}, ${route.transitDays} day(s) transit, capacity ${money.format(route.capacityRUSDPerDay)}/day per direction (base ${money.format(route.baseCapacityRUSDPerDay)})`;
}
