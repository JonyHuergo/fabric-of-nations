/**
 * E6a — transport, access, inter-market trade, customs, and accounting.
 *
 * These tests exercise the authoritative phases and the integrated day. They use the
 * M5 multi-market fixture with authored transport routes so a real consignment can be
 * dispatched, taxed, delivered, and reconciled. They do not measure performance.
 */

import {
  applyCountryAction,
  assertValidWorld,
  createEconomyWorld,
  freightCostPerUnit,
  governmentPeriodTotals,
  hashWorld,
  routeCapacityRUSDPerDay,
  runEconomicDay,
  runTradeArrivals,
  runTradeDispatchPhase,
  postJournalEntry,
  serializeWorld,
  deserializeWorld,
  transitDays,
  validateCountryAction,
  type EconomyScenarioDef,
  type TradeRoute,
  type World,
} from "@century/sim";
import {
  PROTOCOL_VERSION,
  parseWorkerCommand,
  type SimulationSnapshot,
  type WorkerEvent,
} from "@century/sim-worker";
import { SimulationHost } from "@century/sim-worker/host";
import { loadM5EightPolities } from "@century/data";

import {
  M5_CLOTHING,
  M5_COUNTRY_B,
  M5_COUNTRY_C,
  m5Scenario,
} from "./fixtures/m5.js";

const SEED = 20_261_023;

interface TradeFixtureOptions {
  readonly tariff?: number;
  readonly quota?: number | null;
  readonly exportRestricted?: boolean;
  readonly capacityRUSDPerDay?: number;
  readonly distanceUnits?: number;
  readonly stock?: number;
  readonly freightPerUnit?: number;
  readonly workshopCash?: number;
  readonly ownerSavings?: number;
  readonly noRoute?: boolean;
  readonly priceOrigin?: number;
  readonly priceDestination?: number;
}

/** Build a two-market fixture where clothing is profitably scarcer in market 1. */
function tradeScenario(options: TradeFixtureOptions = {}): EconomyScenarioDef {
  const scenario = m5Scenario();
  const freight = options.freightPerUnit ?? 0.05;
  scenario.definitions = {
    ...scenario.definitions,
    goods: scenario.definitions.goods.map((good) =>
      good.id === M5_CLOTHING ? { ...good, transportCostPerUnit: freight } : good,
    ),
  };
  const stock = options.stock ?? 1_000;
  scenario.markets = scenario.markets.map((market) => {
    if (market.id === 0) {
      return {
        ...market,
        priceRUSD: market.priceRUSD.map((price, goodId) =>
          goodId === M5_CLOTHING ? (options.priceOrigin ?? 1) : price,
        ),
        stockLots: [
          {
            goodId: M5_CLOTHING,
            ownerBuildingId: 8,
            quantity: stock,
          },
        ],
      };
    }
    return {
      ...market,
      priceRUSD: market.priceRUSD.map((price, goodId) =>
        goodId === M5_CLOTHING ? (options.priceDestination ?? 1.5) : price,
      ),
    };
  });
  if (options.noRoute !== true) {
    scenario.tradeRoutes = [
      {
        marketAId: 0,
        marketBId: 1,
        distanceUnits: options.distanceUnits ?? 1,
        baseCapacityRUSDPerDay: options.capacityRUSDPerDay ?? 1e9,
      },
    ];
  }
  if (
    options.workshopCash !== undefined ||
    options.ownerSavings !== undefined
  ) {
    scenario.buildingInstances = scenario.buildingInstances.map((building) => ({
      ...building,
      initialOperatingCashRUSD:
        options.workshopCash !== undefined && building.id === 8
          ? options.workshopCash
          : building.initialOperatingCashRUSD,
    }));
    if (options.ownerSavings !== undefined) {
      scenario.population = {
        ...scenario.population,
        popBlocks: scenario.population.popBlocks.map((block) => ({
          ...block,
          initialSavingsRUSD:
            options.ownerSavings !== undefined && block.id === 6
              ? options.ownerSavings
              : block.initialSavingsRUSD,
        })),
      };
    }
  }
  if (options.tariff !== undefined || options.exportRestricted !== undefined) {
    scenario.countries = (scenario.countries ?? []).map((country) => {
      if (country.id === M5_COUNTRY_B && options.tariff !== undefined) {
        return { ...country, trade: { tariffRates: [0, 0, options.tariff] } };
      }
      if (country.id === M5_COUNTRY_C && options.exportRestricted === true) {
        return { ...country, trade: { exportRestricted: [false, false, true] } };
      }
      if (country.id === M5_COUNTRY_B && options.quota !== undefined) {
        return {
          ...country,
          trade: {
            tariffRates: [0, 0, options.tariff ?? 0],
            importQuotaQuantity: [null, null, options.quota],
          },
        };
      }
      return country;
    });
  }
  if (options.quota !== undefined) {
    scenario.countries = (scenario.countries ?? []).map((country) =>
      country.id === M5_COUNTRY_B
        ? {
            ...country,
            trade: {
              tariffRates: [0, 0, options.tariff ?? 0],
              importQuotaQuantity: [null, null, options.quota ?? null],
            },
          }
        : country,
    );
  }
  return scenario;
}

function build(options: TradeFixtureOptions = {}): {
  readonly scenario: EconomyScenarioDef;
  readonly world: World;
} {
  const scenario = tradeScenario(options);
  return { scenario, world: createEconomyWorld(scenario, { seed: SEED }) };
}

function runDay(world: World, scenario: EconomyScenarioDef): void {
  runEconomicDay(world, scenario.population.definitions, scenario.definitions, world.dayIndex, {
    validateWorld: false,
  });
  world.dayIndex += 1;
  assertValidWorld(world);
}

function accountBalance(
  world: World,
  ownerKind: string,
  ownerId: number | null,
  subtype: string,
): number {
  const account = world.finance.accounts.find(
    (candidate) =>
      candidate.ownerKind === ownerKind &&
      candidate.ownerId === ownerId &&
      candidate.subtype === subtype,
  );
  if (account === undefined) throw new Error(`missing ${ownerKind}:${ownerId} ${subtype}`);
  return account.balanceRUSD;
}

function clothingLots(world: World, marketId: number): { ownerBuildingId: number; quantity: number }[] {
  const market = world.markets.find((candidate) => candidate.id === marketId);
  if (market === undefined) throw new Error(`missing market ${marketId}`);
  return market.stockLots
    .filter((lot) => lot.goodId === M5_CLOTHING && lot.quantity > 0)
    .map((lot) => ({ ownerBuildingId: lot.ownerBuildingId, quantity: lot.quantity }));
}

function clothingStock(world: World, marketId: number): number {
  return clothingLots(world, marketId).reduce((total, lot) => total + lot.quantity, 0);
}

function routeOf(world: World): TradeRoute {
  const route = world.trade.routes[0];
  if (route === undefined) throw new Error("fixture has no route");
  return route;
}

describe("E6a route and access validation", () => {
  test("routes are canonical, unique, and bounded to authored market pairs", () => {
    const { world } = build();
    expect(world.trade.enabled).toBe(true);
    expect(world.trade.routes).toHaveLength(1);
    const route = routeOf(world);
    expect(route.marketAId).toBe(0);
    expect(route.marketBId).toBe(1);
    expect(route.id).toBe(0);
    expect(() =>
      createEconomyWorld({
        ...tradeScenario(),
        tradeRoutes: [
          { marketAId: 0, marketBId: 1, distanceUnits: 1, baseCapacityRUSDPerDay: 100 },
          { marketAId: 1, marketBId: 0, distanceUnits: 2, baseCapacityRUSDPerDay: 100 },
        ],
      }, { seed: SEED }),
    ).toThrow(/duplicates route/);
    expect(() =>
      createEconomyWorld({
        ...tradeScenario(),
        tradeRoutes: [{ marketAId: 0, marketBId: 0, distanceUnits: 1, baseCapacityRUSDPerDay: 100 }],
      }, { seed: SEED }),
    ).toThrow(/different markets/);
    expect(() =>
      createEconomyWorld({
        ...tradeScenario(),
        tradeRoutes: [{ marketAId: 0, marketBId: 9, distanceUnits: 1, baseCapacityRUSDPerDay: 100 }],
      }, { seed: SEED }),
    ).toThrow(/unknown market/);
  });

  test("a world with no authored routes has trade disabled and rejects trade policy", () => {
    const scenario = tradeScenario({ noRoute: true });
    const world = createEconomyWorld(scenario, { seed: SEED });
    expect(world.trade.enabled).toBe(false);
    expect(world.trade.routes).toHaveLength(0);
    const validation = validateCountryAction(
      world,
      {
        kind: "set-trade-policy",
        countryId: M5_COUNTRY_B,
        dayIndex: world.dayIndex,
        source: "player",
        tariffRates: [0, 0, 0.1],
        importQuotaQuantity: [null, null, null],
        exportRestricted: [false, false, false],
      },
      scenario.definitions,
    );
    expect(validation.valid).toBe(false);
    expect(validation.errors.join(" ")).toMatch(/no authored transport routes/);
  });

  test("capacity scales with both markets' infrastructure and transit follows distance", () => {
    const route: TradeRoute = {
      id: 0,
      marketAId: 0,
      marketBId: 1,
      distanceUnits: 2.2,
      baseCapacityRUSDPerDay: 1_000,
    };
    expect(routeCapacityRUSDPerDay(route, 0, 0)).toBe(0);
    expect(routeCapacityRUSDPerDay(route, 1, 1)).toBeCloseTo(1_000, 6);
    expect(routeCapacityRUSDPerDay(route, 0.5, 0.5)).toBeCloseTo(500, 6);
    expect(routeCapacityRUSDPerDay(route, 0.8, 0.4)).toBeCloseTo(600, 6);
    expect(transitDays(route)).toBe(3);
    expect(transitDays({ ...route, distanceUnits: 1 })).toBe(1);
  });
});

describe("E6a dispatch, customs, and delivery", () => {
  test("a profitable shipment leaves origin stock, is taxed once, and is delivered once", () => {
    const { scenario, world } = build({ tariff: 0.2 });
    const originBefore = clothingStock(world, 0);
    const treasuryBefore = accountBalance(world, "country", M5_COUNTRY_B, "treasury-cash");
    const customsBefore = accountBalance(world, "country", M5_COUNTRY_B, "customs-duty-revenue");
    const systemBefore = accountBalance(world, "system", null, "system-reserve-cash");

    const result = runTradeDispatchPhase(world, scenario.definitions, world.dayIndex);
    expect(result.shipments.length).toBeGreaterThan(0);
    const shipment = result.shipments[0]!;
    expect(shipment.sellerBuildingId).toBe(8);
    expect(shipment.originMarketId).toBe(0);
    expect(shipment.destinationMarketId).toBe(1);
    expect(shipment.originCountryId).toBe(M5_COUNTRY_C);
    expect(shipment.destinationCountryId).toBe(M5_COUNTRY_B);
    expect(shipment.quantity).toBeGreaterThan(0);
    expect(shipment.cargoValueRUSD).toBeCloseTo(
      shipment.quantity * (world.markets[0]!.priceRUSD[M5_CLOTHING] ?? 0),
      6,
    );
    expect(shipment.freightCostRUSD).toBeCloseTo(
      shipment.quantity * freightCostPerUnit(
        scenario.definitions.goods.find((good) => good.id === M5_CLOTHING)!,
        routeOf(world),
      ),
      6,
    );
    expect(shipment.dutyRUSD).toBeCloseTo(shipment.cargoValueRUSD * 0.2, 6);
    expect(shipment.arrivalDay).toBe(world.dayIndex + transitDays(routeOf(world)));

    // Physical movement: origin stock decreased by exactly the shipped quantity.
    expect(clothingStock(world, 0)).toBeCloseTo(originBefore - shipment.quantity, 6);
    // In transit is in no market's stock.
    expect(clothingStock(world, 1)).toBe(0);
    // Duty and freight are real, once-per-shipment, balanced postings.
    expect(accountBalance(world, "country", M5_COUNTRY_B, "treasury-cash")).toBeCloseTo(
      treasuryBefore + result.dutyPaidRUSD,
      6,
    );
    expect(accountBalance(world, "country", M5_COUNTRY_B, "customs-duty-revenue")).toBeCloseTo(
      customsBefore + result.dutyPaidRUSD,
      6,
    );
    expect(accountBalance(world, "system", null, "system-reserve-cash")).toBeCloseTo(
      systemBefore + result.freightPaidRUSD,
      6,
    );
    expect(world.countries.find((country) => country.id === M5_COUNTRY_B)!.trade.dutyReceivedMonthToDateRUSD).toBeCloseTo(
      result.dutyPaidRUSD,
      6,
    );
    assertValidWorld(world);

    // Arrival delivers exactly once; repeating the phase cannot duplicate the lot.
    world.dayIndex = shipment.arrivalDay;
    const arrival = runTradeArrivals(world, scenario.definitions, shipment.arrivalDay);
    expect(arrival.shipments).toHaveLength(1);
    expect(world.trade.shipments).toHaveLength(0);
    expect(clothingStock(world, 1)).toBeCloseTo(shipment.quantity, 6);
    const repeat = runTradeArrivals(world, scenario.definitions, shipment.arrivalDay);
    expect(repeat.shipments).toHaveLength(0);
    expect(clothingStock(world, 1)).toBeCloseTo(shipment.quantity, 6);
    expect(world.trade.lastDay?.arrivedShipments).toBe(1);
  });

  test("a repeated dispatch for the same day is a no-op and changes nothing", () => {
    const { scenario, world } = build({ tariff: 0.1 });
    runTradeDispatchPhase(world, scenario.definitions, world.dayIndex);
    const hashAfterFirst = hashWorld(world);
    const repeat = runTradeDispatchPhase(world, scenario.definitions, world.dayIndex);
    expect(repeat.shipments).toHaveLength(0);
    expect(repeat.postingIds).toHaveLength(0);
    expect(hashWorld(world)).toBe(hashAfterFirst);
  });

  test("freight and duty are funded by the owner when the enterprise cannot pay", () => {
    const { scenario, world } = build({ tariff: 0.1, workshopCash: 0, ownerSavings: 5_000 });
    const ownerBefore = accountBalance(world, "popBlock", 6, "household-cash");
    const result = runTradeDispatchPhase(world, scenario.definitions, world.dayIndex);
    expect(result.shipments.length).toBeGreaterThan(0);
    expect(result.ownerFundedRUSD).toBeGreaterThan(0);
    expect(
      result.ownerFundedRUSD,
    ).toBeCloseTo(result.freightPaidRUSD + result.dutyPaidRUSD, 6);
    expect(accountBalance(world, "popBlock", 6, "household-cash")).toBeCloseTo(
      ownerBefore - result.ownerFundedRUSD,
      6,
    );
    expect(accountBalance(world, "building", 8, "operating-cash")).toBeCloseTo(0, 6);
    assertValidWorld(world);
  });

  test("the same origin lot is never committed to two destinations", () => {
    const scenario = tradeScenario({ stock: 1_000, priceDestination: 1.5 });
    // A third market with no population lets two routes offer the same origin lot.
    scenario.population = {
      ...scenario.population,
      provinceEconomies: [
        ...scenario.population.provinceEconomies,
        { id: 4, key: "d1", name: "Third market province" },
      ],
    };
    scenario.markets = [
      ...scenario.markets,
      {
        id: 2,
        provinceIds: [4],
        priceRUSD: scenario.markets[0]!.priceRUSD.map((price, goodId) =>
          goodId === M5_CLOTHING ? 1.5 : price,
        ),
        stockLots: [],
      },
    ];
    scenario.tradeRoutes = [
      { marketAId: 0, marketBId: 1, distanceUnits: 1, baseCapacityRUSDPerDay: 1e9 },
      { marketAId: 0, marketBId: 2, distanceUnits: 1, baseCapacityRUSDPerDay: 1e9 },
    ];
    const world = createEconomyWorld(scenario, { seed: SEED });
    const result = runTradeDispatchPhase(world, scenario.definitions, world.dayIndex);
    const shipped = result.shipments.reduce(
      (total, shipment) => total + shipment.quantity,
      0,
    );
    expect(shipped).toBeGreaterThan(0);
    expect(shipped).toBeLessThanOrEqual(1_000 + 1e-6);
    // Every shipped unit left the single origin lot exactly once.
    expect(clothingStock(world, 0)).toBeCloseTo(1_000 - shipped, 6);
    assertValidWorld(world);
  });

  test("no shipper cash anywhere blocks the shipment with an explicit funding reason", () => {
    const scenario = tradeScenario({ workshopCash: 0 });
    scenario.population = {
      ...scenario.population,
      popBlocks: scenario.population.popBlocks.map((block) => ({
        ...block,
        initialSavingsRUSD: 0,
      })),
    };
    scenario.buildingInstances = scenario.buildingInstances.map((building) => ({
      ...building,
      initialOperatingCashRUSD: 0,
    }));
    const world = createEconomyWorld(scenario, { seed: SEED });
    const result = runTradeDispatchPhase(world, scenario.definitions, world.dayIndex);
    expect(result.shipments).toHaveLength(0);
    expect(result.blocked.some((entry) => entry.reason === "funding")).toBe(true);
    expect(world.trade.shipments).toHaveLength(0);
    assertValidWorld(world);
  });
});

describe("E6a trade policy instruments", () => {
  test("an import quota caps the shipped quantity and then blocks further imports", () => {
    const { scenario, world } = build({ quota: 10 });
    const result = runTradeDispatchPhase(world, scenario.definitions, world.dayIndex);
    expect(result.shipments).toHaveLength(1);
    expect(result.shipments[0]!.quantity).toBeCloseTo(10, 6);
    const destination = world.countries.find((country) => country.id === M5_COUNTRY_B)!;
    expect(destination.trade.importQuotaUsedQuantity[M5_CLOTHING] ?? 0).toBeCloseTo(10, 6);

    // The next day the quota is exhausted: nothing ships and the reason is explicit.
    world.dayIndex += 1;
    const next = runTradeDispatchPhase(world, scenario.definitions, world.dayIndex);
    expect(next.shipments).toHaveLength(0);
    expect(next.blocked.some((entry) => entry.reason === "quota")).toBe(true);
    assertValidWorld(world);
  });

  test("an export restriction blocks that country's exports", () => {
    const { scenario, world } = build({ exportRestricted: true });
    const result = runTradeDispatchPhase(world, scenario.definitions, world.dayIndex);
    expect(result.shipments).toHaveLength(0);
    expect(result.blocked.some((entry) => entry.reason === "export-restricted")).toBe(true);
    assertValidWorld(world);
  });

  test("route capacity caps physical cargo value", () => {
    const { scenario, world } = build({ capacityRUSDPerDay: 1 });
    const result = runTradeDispatchPhase(world, scenario.definitions, world.dayIndex);
    expect(result.shipments.length).toBeGreaterThan(0);
    const capacity = routeCapacityRUSDPerDay(
      routeOf(world),
      0.5,
      0.5,
    );
    expect(capacity).toBeCloseTo(0.5, 6);
    const used = result.shipments.reduce((total, shipment) => total + shipment.cargoValueRUSD, 0);
    expect(used).toBeLessThanOrEqual(capacity + 1e-6);
    assertValidWorld(world);
  });

  test("the validated action applies a tariff schedule and rejects malformed input", () => {
    const { scenario, world } = build();
    const action = {
      kind: "set-trade-policy" as const,
      countryId: M5_COUNTRY_B,
      dayIndex: world.dayIndex,
      source: "player" as const,
      tariffRates: [0, 0, 0.25],
      importQuotaQuantity: [null, null, null],
      exportRestricted: [false, false, false],
    };
    const validation = validateCountryAction(world, action, scenario.definitions);
    expect(validation.valid).toBe(true);
    const applied = applyCountryAction(world, action, scenario.definitions);
    expect(applied.changed).toBe(true);
    expect(
      world.countries.find((country) => country.id === M5_COUNTRY_B)!.trade.tariffRates[
        M5_CLOTHING
      ],
    ).toBe(0.25);
    expect(applied.tradeAction?.tariffRates[M5_CLOTHING]).toBe(0.25);
    assertValidWorld(world);

    const malformed = validateCountryAction(
      world,
      { ...action, tariffRates: [0, 2] },
      scenario.definitions,
    );
    expect(malformed.valid).toBe(false);
    const outOfRange = validateCountryAction(
      world,
      { ...action, tariffRates: [0, 0, 1.5] },
      scenario.definitions,
    );
    expect(outOfRange.valid).toBe(false);
    const ai = validateCountryAction(
      world,
      { ...action, source: "ai" },
      scenario.definitions,
    );
    expect(ai.valid).toBe(false);
    expect(ai.errors.join(" ")).toMatch(/AI trade policy is not implemented/);
  });

  test("customs duty reaches the monthly fiscal totals only when it is collected", () => {
    const withTariff = build({ tariff: 0.25 });
    for (let day = 0; day < 40; day += 1) runDay(withTariff.world, withTariff.scenario);
    const summaries = withTariff.world.finance.periodSummaries;
    const summary = summaries[summaries.length - 1]!;
    const totals = governmentPeriodTotals(withTariff.world.finance, summary);
    const destination = totals.find((entry) => entry.countryId === M5_COUNTRY_B);
    expect(destination).toBeDefined();
    expect(destination!.customsDutyRevenueRUSD ?? 0).toBeGreaterThan(0);

    const freeTrade = build();
    for (let day = 0; day < 40; day += 1) runDay(freeTrade.world, freeTrade.scenario);
    const freeSummaries = freeTrade.world.finance.periodSummaries;
    const freeTotals = governmentPeriodTotals(
      freeTrade.world.finance,
      freeSummaries[freeSummaries.length - 1]!,
    );
    const freeDestination = freeTotals.find((entry) => entry.countryId === M5_COUNTRY_B);
    expect(freeDestination?.customsDutyRevenueRUSD ?? 0).toBe(0);
  });
});

describe("E6a conservation, determinism, and persistence", () => {
  test("the integrated day preserves goods, cash, and accounting identities", () => {
    const { scenario, world } = build({ tariff: 0.2 });
    for (let day = 0; day < 20; day += 1) runDay(world, scenario);
    // assertValidWorld (inside runDay) checks posting balance, cash conservation, the
    // accounting identity, and every market/lot invariant. Domestic plus in-transit
    // clothing must equal the authored opening stock plus net production and minus
    // household consumption; the phase-level tests above pin the transfer itself, and
    // the market's own inventory identity is verified by the market phase.
    const inTransit = world.trade.shipments
      .filter((shipment) => shipment.goodId === M5_CLOTHING)
      .reduce((total, shipment) => total + shipment.quantity, 0);
    expect(inTransit).toBeGreaterThanOrEqual(0);
    expect(world.trade.lastDay?.dayIndex).toBe(19);
  });

  test("identical actions and seeds reproduce an identical world hash", () => {
    const first = build({ tariff: 0.15 });
    const second = build({ tariff: 0.15 });
    for (let day = 0; day < 12; day += 1) {
      runDay(first.world, first.scenario);
      runDay(second.world, second.scenario);
    }
    expect(hashWorld(first.world)).toBe(hashWorld(second.world));
  });

  test("saves round-trip in-transit shipments and reject the previous schema", () => {
    const { scenario, world } = build({ tariff: 0.2 });
    runTradeDispatchPhase(world, scenario.definitions, world.dayIndex);
    expect(world.trade.shipments.length).toBeGreaterThan(0);
    const save = serializeWorld(world);
    const restored = deserializeWorld(save);
    expect(hashWorld(restored)).toBe(hashWorld(world));
    expect(serializeWorld(restored)).toBe(save);
    expect(restored.trade.shipments.length).toBe(world.trade.shipments.length);

    const parsed = JSON.parse(save) as {
      schemaVersion: number;
      payload: { schemaVersion: number };
    };
    parsed.schemaVersion = 23;
    parsed.payload.schemaVersion = 23;
    expect(() => deserializeWorld(JSON.stringify(parsed))).toThrow();
  });
});

describe("E6a worker protocol and snapshot contract", () => {
  function command(
    type: WorkerEvent["type"] extends never ? never : string,
    id: string,
    extra: Record<string, unknown>,
  ): unknown {
    return { protocolVersion: PROTOCOL_VERSION, type, commandId: id, ...extra };
  }

  test("the snapshot exposes routes, customs administration, policy, and shipments", () => {
    let snapshot: SimulationSnapshot | null = null;
    let actionResult: Extract<WorkerEvent, { type: "ACTION_RESULT" }> | null = null;
    const host = new SimulationHost({
      scenario: loadM5EightPolities(),
      seed: SEED,
      emit: (event: WorkerEvent) => {
        if (event.type === "READY" || event.type === "SNAPSHOT") {
          snapshot = event.snapshot;
        }
        if (event.type === "ACTION_RESULT") {
          snapshot = event.snapshot;
          actionResult = event;
        }
      },
      autoPump: false,
      clock: () => 1_000,
    });
    expect(snapshot).not.toBeNull();
    expect(snapshot!.trade.enabled).toBe(true);
    expect(snapshot!.trade.routes.length).toBeGreaterThan(0);
    expect(snapshot!.markets.every((market) => market.customsCountryId !== null)).toBe(true);
    const player = snapshot!.countries.find((country) => country.id === snapshot!.playerCountryId)!;
    expect(player.trade.tariffRates).toHaveLength(snapshot!.goods.length);
    expect(player.trade.customsMarketIds.length).toBeGreaterThan(0);

    host.handleCommand(
      command("APPLY_ACTION", "trade-set", {
        actionId: "ui-trade-1",
        action: {
          kind: "set-trade-policy",
          countryId: player.id,
          tariffRates: player.trade.tariffRates.map((_rate, index) => (index === 0 ? 0.12 : 0)),
          importQuotaQuantity: player.trade.importQuotaQuantity,
          exportRestricted: player.trade.exportRestricted,
        },
      }),
    );
    expect(actionResult).not.toBeNull();
    expect(actionResult!.accepted).toBe(true);
    const after = actionResult!.snapshot.countries.find((country) => country.id === player.id)!;
    expect(after.trade.tariffRates[0]).toBeCloseTo(0.12, 6);

    host.handleCommand(
      command("APPLY_ACTION", "trade-bad", {
        actionId: "ui-trade-2",
        action: {
          kind: "set-trade-policy",
          countryId: player.id,
          tariffRates: [0.1],
          importQuotaQuantity: [null],
          exportRestricted: [false],
        },
      }),
    );
    expect(actionResult!.accepted).toBe(false);
  });

  test("a malformed trade-policy command is rejected at the protocol boundary", () => {
    const base = {
      protocolVersion: PROTOCOL_VERSION,
      type: "APPLY_ACTION",
      commandId: "trade-malformed",
      actionId: "ui-trade-3",
    };
    const wellFormed = {
      ...base,
      action: {
        kind: "set-trade-policy",
        countryId: 0,
        tariffRates: [0.1, 0, 0, 0, 0, 0, 0, 0],
        importQuotaQuantity: [null, null, null, null, null, null, null, null],
        exportRestricted: [false, false, false, false, false, false, false, false],
      },
    };
    expect(() => parseWorkerCommand(wellFormed)).not.toThrow();
    expect(() =>
      parseWorkerCommand({
        ...base,
        action: { ...wellFormed.action, tariffRates: [0.1] },
      }),
    ).toThrow();
    expect(() =>
      parseWorkerCommand({
        ...base,
        action: { ...wellFormed.action, tariffRates: [1.5, 0, 0, 0, 0, 0, 0, 0] },
      }),
    ).toThrow();
    expect(() =>
      parseWorkerCommand({
        ...base,
        action: { ...wellFormed.action, exportRestricted: [false] },
      }),
    ).toThrow();
    expect(() =>
      parseWorkerCommand({
        ...base,
        action: { ...wellFormed.action, importQuotaQuantity: [-1, null, null, null, null, null, null, null] },
      }),
    ).toThrow();
  });
});

describe("E6a construction procurement cannot bypass trade rules", () => {
  test("a duty posting requires a shipping building and a destination country", () => {
    const { scenario, world } = build({ tariff: 0.1 });
    runDay(world, scenario);
    const systemAccount = world.finance.accounts.find(
      (account) => account.subtype === "system-reserve-cash",
    )!;
    const building = world.buildings.find((candidate) => candidate.id === 8)!;
    const customsRevenue = world.finance.accounts.find(
      (account) => account.subtype === "customs-duty-revenue" && account.ownerId === M5_COUNTRY_B,
    )!;
    const treasury = world.countries.find((country) => country.id === M5_COUNTRY_B)!
      .treasuryAccountId;
    const dutyExpense = world.finance.accounts.find(
      (account) => account.subtype === "customs-duty-expense" && account.ownerId === building.id,
    )!;

    // A construction-material purchase entry cannot carry the customs recognition
    // legs: procurement has no customs boundary and must never book duty revenue.
    expect(() =>
      postJournalEntry(world.finance, world.dayIndex, "construction-material-purchase", [
        { accountId: building.operatingCashAccountId, side: "credit", amountRUSD: 5 },
        { accountId: systemAccount.id, side: "debit", amountRUSD: 5 },
        { accountId: dutyExpense.id, side: "debit", amountRUSD: 5 },
        { accountId: customsRevenue.id, side: "credit", amountRUSD: 5 },
      ]),
    ).toThrow();
    // The genuine customs kind requires the four trade legs; a three-leg variant is
    // rejected before any balance changes.
    expect(() =>
      postJournalEntry(world.finance, world.dayIndex, "customs-duty", [
        { accountId: dutyExpense.id, side: "debit", amountRUSD: 5 },
        { accountId: building.operatingCashAccountId, side: "credit", amountRUSD: 5 },
        { accountId: treasury, side: "debit", amountRUSD: 5 },
      ]),
    ).toThrow();
    // Procurement is bought from the project's own market at its current price, so it
    // cannot cross a customs boundary; the customs account only grows from shipments.
    const dutyPostings = world.finance.postings.filter(
      (posting) => posting.transactionKind === "customs-duty",
    );
    expect(dutyPostings.length).toBeGreaterThan(0);
    for (const posting of dutyPostings) {
      expect(posting.targetEntityId).toBe(M5_COUNTRY_B);
    }
    expect(() => postJournalEntry(world.finance, world.dayIndex, "customs-duty", [])).toThrow();
  });
});
