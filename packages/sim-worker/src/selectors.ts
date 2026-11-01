/**
 * Pure snapshot selectors and formatters shared by the app.
 *
 * These functions never read `World`; they operate only on the immutable
 * `SimulationSnapshot` contract.
 */

import { RUSD_UNIT_ABBREVIATION } from "@century/sim";
import type {
  CountrySnapshot,
  GoodSnapshot,
  MarketSnapshot,
  RegionSnapshot,
  SimulationSnapshot,
} from "./protocol.js";

export { RUSD_UNIT_ABBREVIATION, RUSD_UNIT_NAME } from "@century/sim";

export const COUNTRY_COLORS = [
  "#356859",
  "#9a4f3c",
  "#4c5f8a",
  "#8a6a32",
  "#5b4a7a",
  "#2f6f7a",
  "#7a3f5c",
  "#4f6b37",
] as const;

export function countryById(
  snapshot: SimulationSnapshot,
  countryId: number | null,
): CountrySnapshot | null {
  if (countryId === null) return null;
  return snapshot.countries.find((country) => country.id === countryId) ?? null;
}

export function regionById(
  snapshot: SimulationSnapshot,
  regionId: number | null,
): RegionSnapshot | null {
  if (regionId === null) return null;
  return snapshot.regions.find((region) => region.id === regionId) ?? null;
}

export function marketById(
  snapshot: SimulationSnapshot,
  marketId: number | null,
): MarketSnapshot | null {
  if (marketId === null) return null;
  return snapshot.markets.find((market) => market.id === marketId) ?? null;
}

export function goodById(
  snapshot: SimulationSnapshot,
  goodId: number,
): GoodSnapshot | null {
  return snapshot.goods.find((good) => good.id === goodId) ?? null;
}

export function countryColor(countryId: number | null): string {
  if (countryId === null) return "#6f756f";
  return COUNTRY_COLORS[countryId % COUNTRY_COLORS.length] ?? "#6f756f";
}

export function formatRUSD(value: number): string {
  const absolute = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  const unit = RUSD_UNIT_ABBREVIATION;
  if (absolute >= 1_000_000_000) return `${sign}${(absolute / 1_000_000_000).toFixed(2)}B ${unit}`;
  if (absolute >= 1_000_000) return `${sign}${(absolute / 1_000_000).toFixed(2)}M ${unit}`;
  if (absolute >= 1_000) return `${sign}${(absolute / 1_000).toFixed(1)}k ${unit}`;
  return `${sign}${absolute.toFixed(2)} ${unit}`;
}

export function formatCount(value: number): string {
  if (Math.abs(value) >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return Math.round(value).toString();
}

export function formatRate(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function formatQuantity(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return value.toFixed(1);
}

export function formatPrice(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 10) return value.toFixed(2);
  if (Math.abs(value) >= 0.01) return value.toFixed(4);
  return value.toExponential(2);
}

export function formatSpeed(value: number): string {
  return value === 1 ? "1 day/s" : `${value} days/s`;
}

/** Human label for the most important budget line. */
export function fiscalResultLabel(netFiscalResultRUSD: number): string {
  if (netFiscalResultRUSD > 0) return "Surplus";
  if (netFiscalResultRUSD < 0) return "Deficit";
  return "Balanced";
}

/** Latest ledger period for one country, or null before the first close. */
export function latestFinancePeriod(country: CountrySnapshot) {
  return country.financeHistory.length === 0
    ? null
    : (country.financeHistory[country.financeHistory.length - 1] ?? null);
}

/** Selected market for a country: the market of its first owned region. */
export function marketForCountry(
  snapshot: SimulationSnapshot,
  country: { readonly regionIds: readonly number[] } | null,
): MarketSnapshot | null {
  if (country === null) return null;
  for (const regionId of country.regionIds) {
    const region = regionById(snapshot, regionId);
    if (region !== null && region.marketId !== null) {
      return marketById(snapshot, region.marketId);
    }
  }
  return null;
}

/** Every market containing at least one region owned by the country. */
export function marketsForCountry(
  snapshot: SimulationSnapshot,
  country: { readonly regionIds: readonly number[] } | null,
): readonly MarketSnapshot[] {
  if (country === null) return [];
  const countryRegions = new Set(country.regionIds);
  return snapshot.markets
    .filter((market) => market.regionIds.some((regionId) => countryRegions.has(regionId)))
    .sort((left, right) => left.id - right.id);
}

/** Static need tiers whose goods are essential for diagnosis (subsistence/basic). */
export function essentialGoodIds(snapshot: SimulationSnapshot): readonly number[] {
  const ids = new Set<number>();
  for (const tier of snapshot.needTiers) {
    if (tier.tier !== "subsistence" && tier.tier !== "basic") continue;
    for (const good of tier.goods) ids.add(good.goodId);
  }
  return [...ids].sort((left, right) => left - right);
}

/** Estimated current daily output capacity for one good, or zero. */
export function productionCapacityForGood(
  country: CountrySnapshot,
  goodId: number,
): number {
  return (
    country.productionCapacityByGood.find((entry) => entry.goodId === goodId)?.dailyCapacity ??
    0
  );
}

/** Markets sorted for the markets screen. */
export function sortedMarkets(snapshot: SimulationSnapshot): readonly MarketSnapshot[] {
  return [...snapshot.markets].sort((left, right) => left.id - right.id);
}
