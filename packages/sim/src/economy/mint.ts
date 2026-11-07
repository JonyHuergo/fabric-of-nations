/**
 * D-140 / D-149: the mint window of a metal-standard currency (docs/P5B_PLAN.md §13).
 *
 * A gold or silver currency is worth its legal fine content at the metal's price in the
 * issuer's home market. The mint price is the reference parity ÷ the fine content
 * (RUSD per kg fine). The gold points are flows, not a clamp:
 *
 * - **Buy.** While the metal's price is at or below mint price × (1 − MINT_CHARGE), the
 *   authority stands ready to buy: its reserve cash ÷ that price is extra funded demand
 *   in the market's price update (`mintStandingOffers`), and after the day's trade it
 *   buys the metal held in the market's lots at that price (`runMintWindow`): seller
 *   buildings are paid from the reserve cash and the metal joins `metalReserveKg`.
 * - **Sell.** While the price is at or above mint price × (1 + MINT_EXPORT_POINT) and the
 *   currency is convertible, up to MINT_MAX_DAILY_SALE_SHARE of the reserve is offered:
 *   extra sellable supply in the price update, and a sale at the market price to the
 *   market's largest storage building holding capacity for the metal (the bullion
 *   dealer), limited by the dealer's cash. The metal becomes the dealer's lot.
 * - **Suspension.** A sale wanted with no metal left suspends convertibility; it resumes
 *   when the reserve covers MINT_RESUME_SALE_DAYS of the last daily sale and the price is
 *   back below the export point. A suspended currency follows the managed rule.
 *
 * Every flow is an ordinary transaction (`mint-purchase`, `mint-sale`), so goods and
 * designated cash are conserved; the reserve is measured at the day's metal price
 * (`metal-revaluation`) before the currency is revalued.
 */

import { QUANTITY_TOLERANCE } from "../population/constants.js";
import {
  MINT_CHARGE,
  MINT_EXPORT_POINT,
  MINT_MAX_DAILY_SALE_SHARE,
  MINT_RESUME_SALE_DAYS,
} from "./constants.js";
import { buildFinanceIndex } from "./accounts.js";
import type { JournalEntryInput } from "./accounting.js";
import { lotTableFromLots, lotTableToLots } from "./inventory.js";
import { accountBalanceRUSD } from "./monetaryState.js";
import type { EconomyDefinitions, MonetaryCurrencyState } from "./types.js";
import type { Id } from "../types.js";
import type { World } from "../world.js";

/** One authority's mint flows of one day (a transient result; never saved). */
export interface MintFlow {
  readonly currencyId: Id;
  readonly marketId: Id;
  readonly goodId: Id;
  readonly mintPriceRUSDPerKg: number;
  readonly marketPriceRUSDPerKg: number;
  readonly boughtKg: number;
  readonly boughtRUSD: number;
  readonly soldKg: number;
  readonly soldRUSD: number;
  readonly dealerBuildingId: Id | null;
  readonly suspended: boolean;
  readonly resumed: boolean;
}

/**
 * The standing offer of one mint in its home market (price formation, `market.ts`).
 * Below the buy point the mint bids enough to bring the price back up to it; above the
 * export point (while convertible) it offers enough to bring the price down to it;
 * between the points it takes up excess supply or meets excess demand, so the price
 * stays. Every bid is bounded by the mint's cash (`buyCapacity`) and every offer by its
 * daily sale limit (`sellCapacity`): with neither left the price moves freely.
 */
export interface MintStandingOffer {
  readonly goodId: Id;
  /** The mint's buy price, RUSD per kg (mint price x (1 - charge)). */
  readonly buyPrice: number;
  /** The export point, RUSD per kg (mint price x (1 + point)). */
  readonly sellPrice: number;
  /** Most the mint can buy today at its buy price (reserve cash ÷ price), kg. */
  readonly buyCapacity: number;
  /** Most the mint sells today at the export point, kg. */
  readonly sellCapacity: number;
}

/** The metal good of a standard, or undefined (paper, or definitions without it). */
export function metalGoodId(definitions: EconomyDefinitions, record: MonetaryCurrencyState): Id | undefined {
  if (record.standard === "paper") return undefined;
  return definitions.goods.find((good) => good.key === record.standard)?.id;
}

/** Mint price, RUSD per kg fine: the reference parity ÷ the fine content. */
export function mintPriceRUSDPerKg(record: MonetaryCurrencyState): number {
  const parity = record.referenceParityRusdPerUnit ?? 0;
  return record.fineGramsPerUnit > 0 ? parity / (record.fineGramsPerUnit / 1000) : 0;
}

/**
 * The issuer's home market: the market of its customs administration, else the market
 * holding most of the country's provinces (lowest id on a tie).
 */
export function issuerHomeMarketId(world: World, countryId: Id): Id | undefined {
  const customs = world.markets.filter((market) => market.customsCountryId === countryId).sort((left, right) => left.id - right.id)[0];
  if (customs !== undefined) return customs.id;
  const owned = new Set<Id>();
  for (const record of world.provinces.ownership) if (record.ownerPolityId === countryId) owned.add(record.provinceId);
  const counts = new Map<Id, number>();
  for (const province of world.provinceEconomies) {
    if (owned.has(province.id) && province.marketId !== null) counts.set(province.marketId, (counts.get(province.marketId) ?? 0) + 1);
  }
  return [...counts].sort((left, right) => right[1] - left[1] || left[0] - right[0])[0]?.[0];
}

/** Active metal authorities with their home market and metal, in currency order. */
function metalAuthorities(world: World, definitions: EconomyDefinitions): { record: MonetaryCurrencyState; marketId: Id; goodId: Id }[] {
  const result: { record: MonetaryCurrencyState; marketId: Id; goodId: Id }[] = [];
  if (!world.monetary.enabled) return result;
  for (const record of world.monetary.currencies) {
    if (!record.active || record.standard === "paper" || record.issuerCountryId === null) continue;
    const goodId = metalGoodId(definitions, record);
    const marketId = issuerHomeMarketId(world, record.issuerCountryId);
    if (goodId === undefined || marketId === undefined) continue;
    result.push({ record, marketId, goodId });
  }
  return result.sort((left, right) => left.record.currencyId - right.record.currencyId);
}

/**
 * The mints' standing offers by market, from the morning's prices, reserves and metal.
 * Empty for worlds without a metal standard, so their markets are unchanged.
 */
export function mintStandingOffers(world: World, definitions: EconomyDefinitions): Map<Id, MintStandingOffer[]> {
  const offers = new Map<Id, MintStandingOffer[]>();
  for (const { record, marketId, goodId } of metalAuthorities(world, definitions)) {
    const market = world.markets.find((candidate) => candidate.id === marketId);
    if (market === undefined) continue;
    const price = market.priceRUSD[goodId] ?? 0;
    const mint = mintPriceRUSDPerKg(record);
    const buyPrice = mint * (1 - MINT_CHARGE);
    const sellPrice = mint * (1 + MINT_EXPORT_POINT);
    const cash = accountBalanceRUSD(world, record.reserveAccountId);
    // Inside the band the mint offers both ways (it cancels the day's imbalance); below
    // the buy point it only buys, above the export point it only sells.
    const buyCapacity = price < sellPrice && cash > 0 && buyPrice > 0 ? cash / buyPrice : 0;
    const sellCapacity = price > buyPrice && record.convertible ? record.metalReserveKg * MINT_MAX_DAILY_SALE_SHARE : 0;
    if (!(buyCapacity > 0) && !(sellCapacity > 0)) continue;
    const list = offers.get(marketId) ?? [];
    list.push({ goodId, buyPrice, sellPrice, buyCapacity, sellCapacity });
    offers.set(marketId, list);
  }
  return offers;
}

/**
 * The dealer of a market for a metal: the building with the largest storage capacity
 * for it (level x capacity per level), lowest id on a tie.
 */
function dealerFor(world: World, definitions: EconomyDefinitions, marketId: Id, goodId: Id): Id | undefined {
  const marketOfProvince = new Map<Id, Id | null>(world.provinceEconomies.map((province) => [province.id, province.marketId]));
  const definitionById = new Map(definitions.buildings.map((definition) => [definition.id, definition]));
  let best: { id: Id; capacity: number } | undefined;
  for (const building of world.buildings) {
    if (!building.operational || marketOfProvince.get(building.provinceId) !== marketId) continue;
    const perLevel = definitionById.get(building.definitionId)?.storageCapacityByGood.find((item) => item.goodId === goodId)?.quantity ?? 0;
    const capacity = perLevel * building.level;
    if (!(capacity > 0)) continue;
    if (best === undefined || capacity > best.capacity || (capacity === best.capacity && building.id < best.id)) best = { id: building.id, capacity };
  }
  return best?.id;
}

/**
 * Run one authority's mint window for the day (after settlement and trade dispatch, on
 * the closing lots), appending its postings to `entries`. Mutates the market's lots and
 * the authority's metal and convertibility; the caller posts the entries in one batch.
 * `spentByBuilding` carries dealer cash already committed today.
 */
export function runMintWindow(
  world: World,
  definitions: EconomyDefinitions,
  record: MonetaryCurrencyState,
  entries: JournalEntryInput[],
  spentByBuilding: Map<Id, number>,
): MintFlow | null {
  const authority = metalAuthorities(world, definitions).find((entry) => entry.record.currencyId === record.currencyId);
  if (authority === undefined || record.issuerCountryId === null || record.reserveAccountId === null || record.metalReserveAccountId === null) return null;
  const { marketId, goodId } = authority;
  const market = world.markets.find((candidate) => candidate.id === marketId);
  if (market === undefined) return null;
  const index = buildFinanceIndex(world.finance);
  const price = market.priceRUSD[goodId] ?? 0;
  const mint = mintPriceRUSDPerKg(record);
  const buyPrice = mint * (1 - MINT_CHARGE);
  const sellPrice = mint * (1 + MINT_EXPORT_POINT);
  let reserveCash = accountBalanceRUSD(world, record.reserveAccountId);
  let boughtKg = 0;
  let boughtRUSD = 0;
  let soldKg = 0;
  let soldRUSD = 0;
  let dealerId: Id | null = null;
  let suspended = false;
  let resumed = false;

  const table = lotTableFromLots(market.stockLots, [], definitions.goods.length);
  const ownerCount = table.owners.length;
  // Buy: every lot of the metal in seller order, while the reserve's cash lasts.
  if (price <= buyPrice && buyPrice > 0) {
    for (let slot = 0; slot < ownerCount && reserveCash > QUANTITY_TOLERANCE; slot += 1) {
      const cell = goodId * ownerCount + slot;
      if (table.present[cell] !== 1) continue;
      const available = table.quantity[cell] ?? 0;
      const affordable = reserveCash / buyPrice;
      const take = Math.min(available, affordable);
      if (!(take > QUANTITY_TOLERANCE)) continue;
      // The last purchase spends exactly the cash left (no rounding past zero).
      const amount = take === affordable ? reserveCash : Math.min(take * buyPrice, reserveCash);
      const sellerId = table.owners[slot] ?? 0;
      entries.push({
        transactionKind: "mint-purchase",
        lines: [
          { accountId: record.metalReserveAccountId, side: "debit", amountRUSD: amount },
          { accountId: record.reserveAccountId, side: "credit", amountRUSD: amount },
          { accountId: index.get("building", sellerId, "operating-cash").id, side: "debit", amountRUSD: amount },
          { accountId: index.get("building", sellerId, "sales-revenue").id, side: "credit", amountRUSD: amount },
        ],
        sourceEntityId: record.issuerCountryId,
        targetEntityId: sellerId,
      });
      const remaining = available - take;
      if (remaining > QUANTITY_TOLERANCE) table.quantity[cell] = remaining;
      else {
        table.present[cell] = 0;
        table.quantity[cell] = 0;
      }
      reserveCash -= amount;
      boughtKg += take;
      boughtRUSD += amount;
    }
    record.metalReserveKg += boughtKg;
  }

  // Sell: convertible, at or above the export point.
  if (price >= sellPrice && record.convertible) {
    if (!(record.metalReserveKg > QUANTITY_TOLERANCE)) {
      record.convertible = false;
      suspended = true;
    } else {
      const dealer = dealerFor(world, definitions, marketId, goodId);
      if (dealer !== undefined) {
        const cash = index.get("building", dealer, "operating-cash");
        const available = Math.max(0, cash.balanceRUSD - (spentByBuilding.get(dealer) ?? 0));
        const byCash = available / price;
        const quantity = Math.min(record.metalReserveKg * MINT_MAX_DAILY_SALE_SHARE, byCash);
        if (quantity > QUANTITY_TOLERANCE) {
          const amount = quantity === byCash ? available : Math.min(quantity * price, available);
          entries.push({
            transactionKind: "mint-sale",
            lines: [
              { accountId: index.get("building", dealer, "input-expense").id, side: "debit", amountRUSD: amount },
              { accountId: cash.id, side: "credit", amountRUSD: amount },
              { accountId: record.reserveAccountId, side: "debit", amountRUSD: amount },
              { accountId: record.metalReserveAccountId, side: "credit", amountRUSD: amount },
            ],
            sourceEntityId: record.issuerCountryId,
            targetEntityId: dealer,
          });
          spentByBuilding.set(dealer, (spentByBuilding.get(dealer) ?? 0) + amount);
          const merged = lotTableFromLots(lotTableToLots(table), [dealer], definitions.goods.length);
          const cell = goodId * merged.owners.length + (merged.slotOf.get(dealer) ?? 0);
          merged.quantity[cell] = (merged.quantity[cell] ?? 0) + quantity;
          merged.present[cell] = 1;
          market.stockLots = lotTableToLots(merged);
          record.metalReserveKg -= quantity;
          record.lastMintSaleKg = quantity;
          soldKg = quantity;
          soldRUSD = amount;
          dealerId = dealer;
        }
      }
    }
  }
  if (soldKg === 0 && boughtKg > 0) market.stockLots = lotTableToLots(table);
  if (record.metalReserveKg < 0 && record.metalReserveKg > -QUANTITY_TOLERANCE) record.metalReserveKg = 0;

  // Resumption (plan §13.5).
  if (!record.convertible && !suspended && price < sellPrice && record.metalReserveKg >= MINT_RESUME_SALE_DAYS * record.lastMintSaleKg && record.metalReserveKg > 0) {
    record.convertible = true;
    resumed = true;
  }
  return {
    currencyId: record.currencyId,
    marketId,
    goodId,
    mintPriceRUSDPerKg: mint,
    marketPriceRUSDPerKg: price,
    boughtKg,
    boughtRUSD,
    soldKg,
    soldRUSD,
    dealerBuildingId: dealerId,
    suspended,
    resumed,
  };
}

/** The metal price of an authority's home market today, RUSD per kg (0 when absent). */
export function homeMetalPrice(world: World, definitions: EconomyDefinitions, record: MonetaryCurrencyState): number {
  const authority = metalAuthorities(world, definitions).find((entry) => entry.record.currencyId === record.currencyId);
  if (authority === undefined) return 0;
  return world.markets.find((market) => market.id === authority.marketId)?.priceRUSD[authority.goodId] ?? 0;
}
