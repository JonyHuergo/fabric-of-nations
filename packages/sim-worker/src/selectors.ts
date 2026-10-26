/**
 * Pure snapshot selectors and formatters shared by the app.
 *
 * These functions never read `World`; they operate only on the immutable
 * `SimulationSnapshot` contract.
 */

import type {
  CountrySnapshot,
  GoodSnapshot,
  MarketSnapshot,
  RegionSnapshot,
  SimulationSnapshot,
} from "./protocol.js";

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

export function formatSUSD(value: number): string {
  const absolute = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (absolute >= 1_000_000_000) return `${sign}${(absolute / 1_000_000_000).toFixed(2)}B SUSD`;
  if (absolute >= 1_000_000) return `${sign}${(absolute / 1_000_000).toFixed(2)}M SUSD`;
  if (absolute >= 1_000) return `${sign}${(absolute / 1_000).toFixed(1)}k SUSD`;
  return `${sign}${absolute.toFixed(2)} SUSD`;
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
export function fiscalResultLabel(netFiscalResultSUSD: number): string {
  if (netFiscalResultSUSD > 0) return "Surplus";
  if (netFiscalResultSUSD < 0) return "Deficit";
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
  country: CountrySnapshot | null,
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

/** Markets sorted for the markets screen. */
export function sortedMarkets(snapshot: SimulationSnapshot): readonly MarketSnapshot[] {
  return [...snapshot.markets].sort((left, right) => left.id - right.id);
}
