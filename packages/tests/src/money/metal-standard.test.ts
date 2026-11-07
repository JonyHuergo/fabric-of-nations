/**
 * D-140 / D-149: money as metal and paper (docs/P5B_PLAN.md §13) on the 1900 world.
 *
 * - opening position: the metal-standard authorities hold their sourced 1900 metal,
 *   circulation and treasury-funded mint cash, and the balance sheet balances;
 * - the mint window: below the buy point the mint buys the metal offered (sellers paid
 *   from reserve cash, metal into the reserve); at the export point it sells to the
 *   market's dealer; with no metal left convertibility is suspended;
 * - a convertible metal currency is worth its fine content at the metal's price;
 * - goods and designated cash are conserved; saves round-trip; the day is deterministic.
 */

import { loadM11World } from "@century/data";
import {
  convertibilityState,
  createEconomyWorld,
  createRollbackRunner,
  deserializeWorld,
  designatedCashTotal,
  hashWorld,
  issuerHomeMarketId,
  MINT_CHARGE,
  MINT_EXPORT_POINT,
  mintPriceRUSDPerKg,
  runTicksWithRollback,
  serializeWorld,
  tick,
  type EconomyScenarioDef,
  type MonetaryCurrencyState,
  type World,
} from "@century/sim";

const SEED = 20_261_023;
const scenario: EconomyScenarioDef = loadM11World();
const context = {
  population: { definitions: scenario.population.definitions },
  economy: { definitions: scenario.definitions },
  detail: "summary" as const,
};
const goldId = scenario.definitions.goods.find((good) => good.key === "gold")!.id;

function fresh(): World {
  return createEconomyWorld(scenario, { seed: SEED });
}
function authority(world: World, tag: string): MonetaryCurrencyState {
  const country = world.countries.find((entry) => entry.tag === tag)!;
  return world.monetary.currencies.find((record) => record.issuerCountryId === country.id)!;
}
function balance(world: World, accountId: number | null): number {
  return world.finance.accounts.find((account) => account.id === accountId)?.balanceRUSD ?? 0;
}
function valuation(world: World, currencyId: number): number {
  const entry = world.currencyValuations.find((value) => value.currencyId === currencyId);
  if (entry === undefined || entry.status !== "specified") throw new Error("no valuation");
  return entry.rusdPerUnit;
}
function goldInMarket(world: World, marketId: number): number {
  return world.markets.find((market) => market.id === marketId)!.stockLots.filter((lot) => lot.goodId === goldId).reduce((acc, lot) => acc + lot.quantity, 0);
}
function goldInTransit(world: World): number {
  return world.trade.shipments.filter((shipment) => shipment.goodId === goldId).reduce((acc, shipment) => acc + shipment.quantity, 0);
}
/** One full-detail day; returns the gold produced, used, eaten and lost in every market. */
function dayWithGoldFlows(world: World): number {
  const result = tick(world, { ...context, detail: "full" as const });
  let net = 0;
  for (const market of result.economy!.markets) {
    const flow = market.inventory.find((entry) => entry.goodId === goldId);
    if (flow !== undefined) net += flow.production - flow.usedAsInput - flow.householdConsumption - flow.recordedLoss;
  }
  return net;
}
function worldGold(world: World): number {
  let total = goldInTransit(world);
  for (const market of world.markets) total += goldInMarket(world, market.id);
  for (const record of world.monetary.currencies) if (record.standard === "gold") total += record.metalReserveKg;
  return total;
}

describe("D-140 opening position (D-149)", () => {
  const world = fresh();
  test("the 1900 metal-standard authorities are active with their sourced metal", () => {
    const metal = world.monetary.currencies.filter((record) => record.standard !== "paper");
    expect(metal.length).toBe(23);
    expect(metal.filter((record) => record.standard === "silver").map((record) => world.countries.find((c) => c.id === record.issuerCountryId)!.tag).sort()).toEqual(["CHN", "MEX", "THA"]);
    const usa = authority(world, "USA");
    // Director of the Mint: $1,110.8 million of gold at $0.664614 per fine gram.
    expect(usa.metalReserveKg).toBeCloseTo(1_110.8e6 / 664.614337592182, 3);
    expect(usa.fineGramsPerUnit).toBeCloseTo(1.504632, 5);
    expect(usa.convertible).toBe(true);
  });

  test("the balance sheet balances: metal + cash = liability + equity; circulation = money stock", () => {
    for (const record of world.monetary.currencies.filter((entry) => entry.standard !== "paper")) {
      const metal = balance(world, record.metalReserveAccountId);
      const cash = balance(world, record.reserveAccountId);
      const liability = balance(world, record.liabilityAccountId);
      const equity = balance(world, record.equityAccountId);
      expect(Math.abs(metal + cash - liability - equity)).toBeLessThan(1e-3 * Math.max(1, liability));
      expect(liability).toBeCloseTo(record.currencyIssuedUnits * valuation(world, record.currencyId), 0);
      const metalGood = scenario.definitions.goods.find((good) => good.key === record.standard)!;
      expect(metal).toBeCloseTo(record.metalReserveKg * metalGood.basePrice1900RUSD, 0);
    }
  });

  test("gold opens at its reference price in every market", () => {
    for (const market of world.markets) expect(market.priceRUSD[goldId]).toBe(scenario.definitions.goods[goldId]!.basePrice1900RUSD);
  });
});

describe("D-140 mint window (D-149)", () => {
  test("below the buy point the mint buys the metal offered; goods and cash are conserved", () => {
    const world = fresh();
    const usa = authority(world, "USA");
    const marketId = issuerHomeMarketId(world, usa.issuerCountryId!)!;
    const market = world.markets.find((entry) => entry.id === marketId)!;
    const mint = mintPriceRUSDPerKg(usa);
    // Just under the buy point: below it by less than any freight, so no trader exports it.
    market.priceRUSD[goldId] = mint * (1 - MINT_CHARGE) * (1 - 1e-6);
    const seller = world.buildings.find((building) => world.provinceEconomies.find((province) => province.id === building.provinceId)?.marketId === marketId && building.operational)!;
    market.stockLots.push({ goodId: goldId, ownerBuildingId: seller.id, quantity: 500 });
    market.stockLots.sort((left, right) => left.goodId - right.goodId || left.ownerBuildingId - right.ownerBuildingId);
    const goldBefore = worldGold(world);
    const cashBefore = designatedCashTotal(world.finance);
    const kgBefore = usa.metalReserveKg;
    const reserveBefore = balance(world, usa.reserveAccountId);
    // Gold mines produce today too; the market flows account for them.
    const net = dayWithGoldFlows(world);
    const after = authority(world, "USA");
    const bought = after.metalReserveKg - kgBefore;
    expect(bought).toBeGreaterThan(0);
    // Paid at the mint's buy price from the reserve cash.
    expect(reserveBefore - balance(world, after.reserveAccountId)).toBeCloseTo(bought * mint * (1 - MINT_CHARGE), 2);
    expect(worldGold(world)).toBeCloseTo(goldBefore + net, 6);
    expect(designatedCashTotal(world.finance)).toBeCloseTo(cashBefore, 0);
  }, 300_000);

  test("at the export point it sells to the dealer; with no metal left it suspends", () => {
    const world = fresh();
    const usa = authority(world, "USA");
    const marketId = issuerHomeMarketId(world, usa.issuerCountryId!)!;
    const market = world.markets.find((entry) => entry.id === marketId)!;
    market.priceRUSD[goldId] = mintPriceRUSDPerKg(usa) * (1 + MINT_EXPORT_POINT) * 1.2;
    const goldBefore = worldGold(world);
    const kgBefore = usa.metalReserveKg;
    const net = dayWithGoldFlows(world);
    const sold = kgBefore - authority(world, "USA").metalReserveKg;
    expect(sold).toBeGreaterThan(0);
    expect(goldInMarket(world, marketId)).toBeGreaterThan(0);
    expect(worldGold(world)).toBeCloseTo(goldBefore + net, 6);

    // Empty the reserve (and its account) and ask again: convertibility is suspended.
    const empty = fresh();
    const record = authority(empty, "USA");
    const metalAccount = empty.finance.accounts.find((account) => account.id === record.metalReserveAccountId)!;
    const equityAccount = empty.finance.accounts.find((account) => account.id === record.equityAccountId)!;
    equityAccount.balanceRUSD -= metalAccount.balanceRUSD;
    metalAccount.balanceRUSD = 0;
    record.metalReserveKg = 0;
    empty.markets.find((entry) => entry.id === marketId)!.priceRUSD[goldId] = mintPriceRUSDPerKg(record) * (1 + MINT_EXPORT_POINT) * 1.2;
    const runner2 = createRollbackRunner(empty);
    runTicksWithRollback(runner2, 1, context);
    expect(authority(runner2.world, "USA").convertible).toBe(false);
    expect(convertibilityState(runner2.world, record.issuerCountryId!).state).toBe("suspended");
  }, 300_000);

  test("a convertible metal currency is worth its fine content at the metal's price", () => {
    const world = fresh();
    const runner = createRollbackRunner(world);
    runTicksWithRollback(runner, 2, context);
    for (const record of runner.world.monetary.currencies.filter((entry) => entry.standard !== "paper" && entry.convertible)) {
      const marketId = issuerHomeMarketId(runner.world, record.issuerCountryId!)!;
      const metal = scenario.definitions.goods.find((good) => good.key === record.standard)!.id;
      const price = runner.world.markets.find((market) => market.id === marketId)!.priceRUSD[metal]!;
      expect(valuation(runner.world, record.currencyId)).toBeCloseTo((record.fineGramsPerUnit / 1000) * price, 9);
    }
  }, 300_000);

  test("saves round-trip the metal standard; two runs are identical", () => {
    const runs = [0, 1].map(() => {
      const runner = createRollbackRunner(fresh());
      runTicksWithRollback(runner, 2, context);
      return runner.world;
    });
    expect(hashWorld(runs[1]!)).toBe(hashWorld(runs[0]!));
    const restored = deserializeWorld(serializeWorld(runs[0]!));
    expect(hashWorld(restored)).toBe(hashWorld(runs[0]!));
    expect(authority(restored, "USA").metalReserveKg).toBe(authority(runs[0]!, "USA").metalReserveKg);
  }, 600_000);
});
