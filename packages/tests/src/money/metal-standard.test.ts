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
  applyCountryAction,
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
  validateCountryAction,
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
/**
 * One day; returns the gold produced, used, eaten and lost in every market. D-155: the
 * market inventory flows are part of the summary detail (D-137), so the day no longer
 * builds the full-detail record lists of the 1900 world.
 */
function dayWithGoldFlows(world: World): number {
  const result = tick(world, context);
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
    // D-155: the first world lives only inside this function, so it is released before the
    // second (emptied) world is built.
    const marketId = ((): number => {
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
      return marketId;
    })();

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
    const run = (): World => {
      const runner = createRollbackRunner(fresh());
      runTicksWithRollback(runner, 2, context);
      return runner.world;
    };
    // D-155: the first run is reduced to its hash, its save and its reserve before the
    // second run is built, so two 1900 worlds and their checkpoints are never alive together.
    const first = ((): { hash: string; save: string; reserveKg: number } => {
      const world = run();
      return { hash: hashWorld(world), save: serializeWorld(world), reserveKg: authority(world, "USA").metalReserveKg };
    })();
    expect(hashWorld(run())).toBe(first.hash);
    const restored = deserializeWorld(first.save);
    expect(hashWorld(restored)).toBe(first.hash);
    expect(authority(restored, "USA").metalReserveKg).toBe(first.reserveKg);
  }, 600_000);
});

describe("D-140 currency actions (D-150)", () => {
  test("adopting: circulation redeemed, reserve cash to the treasury, metal sold off; cash conserved", () => {
    const world = fresh();
    const usa = world.countries.find((country) => country.tag === "USA")!;
    const gbp = world.countries.find((country) => country.tag === "GBR")!.monetary.currencyId;
    const record = authority(world, "USA");
    const treasuryBefore = balance(world, usa.treasuryAccountId);
    const reserveBefore = balance(world, record.reserveAccountId);
    const kgBefore = record.metalReserveKg;
    const cashBefore = designatedCashTotal(world.finance);
    const action = { kind: "adopt-currency" as const, countryId: usa.id, dayIndex: world.dayIndex, source: "player" as const, currencyId: gbp };
    expect(validateCountryAction(world, action, scenario.definitions).valid).toBe(true);
    expect(validateCountryAction(world, { ...action, source: "ai" }, scenario.definitions).valid).toBe(false);
    applyCountryAction(world, action, scenario.definitions);
    expect(usa.monetary).toEqual({ kind: "adopted", currencyId: gbp });
    expect(record.active).toBe(false);
    expect(record.currencyIssuedUnits).toBe(0);
    expect(balance(world, record.liabilityAccountId)).toBeCloseTo(0, 2);
    expect(balance(world, usa.treasuryAccountId) - treasuryBefore).toBeCloseTo(reserveBefore, 2);
    expect(designatedCashTotal(world.finance)).toBeCloseTo(cashBefore, 0);
    expect(record.metalReserveKg).toBe(kgBefore);
    expect(convertibilityState(world, usa.id).state).toBe("no-authority");
    const runner = createRollbackRunner(world);
    runTicksWithRollback(runner, 2, context);
    expect(authority(runner.world, "USA").metalReserveKg).toBeLessThan(kgBefore);
  }, 300_000);

  test("establishing: a new currency at the old unit's value, funded by the treasury", () => {
    const ausId = fresh().countries.find((country) => country.tag === "AUS")!.id;
    const world = createEconomyWorld({ ...scenario, playerCountryId: ausId }, { seed: SEED });
    const adopter = world.countries.find((country) => country.monetary.kind === "adopted" && country.tag === "AUS")!;
    const used = adopter.monetary.currencyId;
    const treasuryBefore = balance(world, adopter.treasuryAccountId);
    const action = {
      kind: "establish-currency" as const,
      countryId: adopter.id,
      dayIndex: world.dayIndex,
      source: "player" as const,
      standard: "gold" as const,
      name: "Australian pound",
      reserveFundingRUSD: treasuryBefore / 10,
    };
    expect(validateCountryAction(world, action, scenario.definitions).errors).toEqual([]);
    applyCountryAction(world, action, scenario.definitions);
    expect(adopter.monetary).toEqual({ kind: "own", currencyId: adopter.id });
    const record = world.monetary.currencies.find((entry) => entry.currencyId === adopter.id)!;
    expect(record.active).toBe(true);
    expect(record.standard).toBe("gold");
    expect(valuation(world, adopter.id)).toBeCloseTo(valuation(world, used), 12);
    expect(record.fineGramsPerUnit).toBeCloseTo((valuation(world, used) / scenario.definitions.goods[goldId]!.basePrice1900RUSD) * 1000, 9);
    expect(balance(world, record.reserveAccountId)).toBeCloseTo(treasuryBefore / 10, 2);
    expect(balance(world, adopter.treasuryAccountId)).toBeCloseTo(treasuryBefore * 0.9, 2);
    expect(world.currencies.find((currency) => currency.id === adopter.id)?.name).toBe("Australian pound");
    const restored = deserializeWorld(serializeWorld(world));
    expect(hashWorld(restored)).toBe(hashWorld(world));
  }, 300_000);
});
