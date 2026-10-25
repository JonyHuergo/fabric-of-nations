import {
  deserializeWorld,
  hashWorld,
  runMarketDay,
  serializeWorld,
  settleMarketDay,
  type MarketDayResult,
} from "@century/sim";
import {
  accountBalance,
  buildingAccountId,
  createSettlementWorld,
  householdAccountId,
  runSettlement,
  totalCash,
} from "./fixtures/m3e.js";
import {
  GRAIN_ID,
  household,
  marketInput,
  productionDemand,
} from "./fixtures/m3d.js";

const DAILY_PEASANT_WAGE = 180 / 365;
const DAILY_LABORER_WAGE = 250 / 365;
const FARM_WAGE = 45 * DAILY_PEASANT_WAGE;
const PROCESSOR_WAGE = 50 * DAILY_LABORER_WAGE;
const FARM_UPKEEP = 20;
const COMMERCIAL_FARM_UPKEEP = 40;
const PROCESSOR_UPKEEP = 35;
const MILL_UPKEEP = 50;
const WAREHOUSE_UPKEEP = 10;
const SYSTEM_ACCOUNT_ID = 20;

describe("M3e market settlement", () => {
  test("debits a household buyer and credits the attributed seller", () => {
    const { scenario, world } = createSettlementWorld({
      buildingIds: [],
      activeBuildingIds: [0, 7],
      lots: [{ goodId: GRAIN_ID, ownerBuildingId: 0, quantity: 10 }],
    });
    const householdId = householdAccountId(world, 0);
    const sellerId = buildingAccountId(world, 0);
    const startHousehold = accountBalance(world, householdId);
    const startSeller = accountBalance(world, sellerId);
    const startSystem = accountBalance(world, SYSTEM_ACCOUNT_ID);

    const { marketDay, settlement } = runSettlement(scenario, world, [
      household(0, 1, GRAIN_ID, 10),
    ]);

    expect(settlement.transactions).toHaveLength(1);
    expect(settlement.transactions[0]).toMatchObject({
      kind: "household-purchase",
      buyerPopBlockId: 0,
      sellerBuildingId: 0,
      quantity: 10,
      unitPriceSUSD: 0.05,
      totalSUSD: 0.5,
      buyerAccountId: householdId,
      sellerAccountId: sellerId,
    });
    expect(accountBalance(world, householdId)).toBeCloseTo(startHousehold - 0.5, 9);
    expect(accountBalance(world, sellerId)).toBeCloseTo(
      startSeller + 0.5 - FARM_UPKEEP,
      9,
    );
    expect(accountBalance(world, SYSTEM_ACCOUNT_ID)).toBeCloseTo(
      startSystem + FARM_UPKEEP + WAREHOUSE_UPKEEP,
      9,
    );
    expect(marketDay.settled).toBe(true);
    expect(settlement.totals.marketPurchasesSUSD).toBeCloseTo(0.5, 9);
    expect(settlement.totals.producerProfitSUSD).toBeCloseTo(
      0.5 - FARM_UPKEEP - WAREHOUSE_UPKEEP,
      9,
    );
  });

  test("settles an input purchase against the correct building and seller accounts", () => {
    const { scenario, world } = createSettlementWorld({
      buildingIds: [4],
      activeBuildingIds: [0, 4, 7],
      lots: [{ goodId: GRAIN_ID, ownerBuildingId: 0, quantity: 10 }],
    });
    const sellerId = buildingAccountId(world, 0);
    const buyerId = buildingAccountId(world, 4);
    const startSeller = accountBalance(world, sellerId);
    const startBuyer = accountBalance(world, buyerId);

    const { settlement } = runSettlement(
      scenario,
      world,
      [],
      [productionDemand(4, 2, GRAIN_ID, 5)],
    );

    const transaction = settlement.transactions[0];
    expect(transaction).toMatchObject({
      kind: "input-purchase",
      buyerBuildingId: 4,
      sellerBuildingId: 0,
      quantity: 5,
      unitPriceSUSD: 0.05,
      totalSUSD: 0.25,
      buyerAccountId: buyerId,
      sellerAccountId: sellerId,
    });
    expect(accountBalance(world, sellerId)).toBeCloseTo(
      startSeller + 0.25 - FARM_UPKEEP,
      9,
    );
    expect(accountBalance(world, buyerId)).toBeCloseTo(
      startBuyer - 0.25 - PROCESSOR_WAGE - PROCESSOR_UPKEEP,
      9,
    );
    expect(settlement.producers.find((producer) => producer.buildingId === 4)).toMatchObject({
      revenueSUSD: 0,
      inputCostsSUSD: 0.25,
      wagesPaidSUSD: PROCESSOR_WAGE,
      upkeepPaidSUSD: PROCESSOR_UPKEEP,
    });
  });

  test("settles all seller-attributed lots when one buyer has multiple sellers", () => {
    const { scenario, world } = createSettlementWorld({
      buildingIds: [],
      activeBuildingIds: [0, 1, 7],
      lots: [
        { goodId: GRAIN_ID, ownerBuildingId: 0, quantity: 5 },
        { goodId: GRAIN_ID, ownerBuildingId: 1, quantity: 5 },
      ],
    });
    const householdId = householdAccountId(world, 0);
    const firstSeller = buildingAccountId(world, 0);
    const secondSeller = buildingAccountId(world, 1);
    const startHousehold = accountBalance(world, householdId);
    const startFirst = accountBalance(world, firstSeller);
    const startSecond = accountBalance(world, secondSeller);

    const { settlement } = runSettlement(scenario, world, [
      household(0, 1, GRAIN_ID, 10),
    ]);

    expect(settlement.transactions).toHaveLength(2);
    expect(settlement.transactions.map((transaction) => transaction.sellerBuildingId)).toEqual([0, 1]);
    expect(accountBalance(world, householdId)).toBeCloseTo(startHousehold - 0.5, 9);
    expect(accountBalance(world, firstSeller)).toBeCloseTo(
      startFirst + 0.25 - FARM_UPKEEP,
      9,
    );
    expect(accountBalance(world, secondSeller)).toBeCloseTo(
      startSecond + 0.25 - COMMERCIAL_FARM_UPKEEP,
      9,
    );
  });
});

describe("M3e wages", () => {
  test("pays actual assigned workers, not unfilled slots", () => {
    const { scenario, world } = createSettlementWorld({
      buildingIds: [0],
      activeBuildingIds: [0, 7],
    });
    const householdId = householdAccountId(world, 0);
    const employerId = buildingAccountId(world, 0);
    const startHousehold = accountBalance(world, householdId);
    const startEmployer = accountBalance(world, employerId);
    const startSystem = accountBalance(world, SYSTEM_ACCOUNT_ID);

    const { settlement } = runSettlement(scenario, world);
    expect(settlement.wages).toHaveLength(1);
    const wage = settlement.wages.find((entry) => entry.buildingId === 0);
    expect(wage?.obligationSUSD).toBeCloseTo(FARM_WAGE, 9);
    expect(wage?.paidSUSD).toBeCloseTo(FARM_WAGE, 9);
    expect(wage?.unpaidSUSD).toBe(0);
    expect(wage?.payments).toHaveLength(1);
    expect(wage?.payments[0]?.workers).toBe(45);
    expect(accountBalance(world, householdId)).toBeCloseTo(startHousehold + FARM_WAGE, 9);
    expect(accountBalance(world, employerId)).toBeCloseTo(
      startEmployer - FARM_WAGE - FARM_UPKEEP,
      9,
    );
    expect(accountBalance(world, SYSTEM_ACCOUNT_ID)).toBeCloseTo(
      startSystem + FARM_UPKEEP + WAREHOUSE_UPKEEP,
      9,
    );
    expect(settlement.producers.find((producer) => producer.buildingId === 0)?.profitSUSD).toBeCloseTo(
      -FARM_WAGE - FARM_UPKEEP,
      9,
    );
  });

  test("settles same-day sales receipts and input purchases in one net-safe batch", () => {
    const { scenario, world } = createSettlementWorld({
      buildingIds: [5],
      activeBuildingIds: [0, 5, 7],
      lots: [{ goodId: GRAIN_ID, ownerBuildingId: 0, quantity: 10 }],
    });
    const millId = buildingAccountId(world, 5);
    world.finance.accounts.find((account) => account.id === millId)!.balanceSUSD = 0;
    const householdId = householdAccountId(world, 0);
    const workerHouseholdId = householdAccountId(world, 1);
    const sellerId = buildingAccountId(world, 0);
    const startHousehold = accountBalance(world, householdId);
    const startWorker = accountBalance(world, workerHouseholdId);
    const startSeller = accountBalance(world, sellerId);
    const startSystem = accountBalance(world, SYSTEM_ACCOUNT_ID);

    const { settlement } = runSettlement(
      scenario,
      world,
      [household(0, 6, 5, 2)],
      [productionDemand(5, 5, GRAIN_ID, 5)],
    );

    expect(settlement.transactions).toHaveLength(2);
    expect(settlement.totals.householdPurchasesSUSD).toBeCloseTo(2, 9);
    expect(settlement.totals.inputPurchasesSUSD).toBeCloseTo(0.25, 9);
    expect(accountBalance(world, sellerId)).toBeCloseTo(
      startSeller + 0.25 - FARM_UPKEEP,
      9,
    );
    expect(accountBalance(world, householdId)).toBeCloseTo(startHousehold - 2, 9);
    expect(accountBalance(world, workerHouseholdId)).toBeCloseTo(
      startWorker + 1.75,
      9,
    );
    expect(accountBalance(world, millId)).toBeCloseTo(0, 9);
    expect(accountBalance(world, SYSTEM_ACCOUNT_ID)).toBeCloseTo(
      startSystem + FARM_UPKEEP + WAREHOUSE_UPKEEP,
      9,
    );
    const millWage = settlement.wages.find((wage) => wage.buildingId === 5);
    expect(millWage?.paidSUSD).toBeCloseTo(1.75, 9);
    expect(millWage?.unpaidSUSD).toBeCloseTo(PROCESSOR_WAGE - 1.75, 9);
    expect(settlement.upkeep.find((entry) => entry.buildingId === 5)).toMatchObject({
      obligationSUSD: MILL_UPKEEP,
      paidSUSD: 0,
      unpaidSUSD: MILL_UPKEEP,
    });
    expect(settlement.producers.find((producer) => producer.buildingId === 5)?.profitSUSD).toBeCloseTo(
      0,
      9,
    );
  });

  test("partially pays wages without overdrawing an underfunded employer", () => {
    const { scenario, world } = createSettlementWorld({
      buildingIds: [0],
      activeBuildingIds: [0, 7],
    });
    const marketDay = runMarketDay(
      world,
      scenario.definitions,
      marketInput(scenario, world, []),
    );
    const householdId = householdAccountId(world, 0);
    const employerId = buildingAccountId(world, 0);
    world.finance.accounts.find((account) => account.id === employerId)!.balanceSUSD = 10;
    const startHousehold = accountBalance(world, householdId);

    const settlement = settleMarketDay(world, scenario.definitions, marketDay);
    const wage = settlement.wages.find((entry) => entry.buildingId === 0);
    expect(wage?.obligationSUSD).toBeCloseTo(FARM_WAGE, 9);
    expect(wage?.paidSUSD).toBeCloseTo(10, 9);
    expect(wage?.unpaidSUSD).toBeCloseTo(FARM_WAGE - 10, 9);
    expect(accountBalance(world, employerId)).toBeCloseTo(0, 9);
    expect(accountBalance(world, householdId)).toBeCloseTo(startHousehold + 10, 9);
    expect(settlement.totals.unpaidWagesSUSD).toBeCloseTo(FARM_WAGE - 10, 9);
    expect(settlement.upkeep.find((entry) => entry.buildingId === 0)).toMatchObject({
      obligationSUSD: FARM_UPKEEP,
      paidSUSD: 0,
      unpaidSUSD: FARM_UPKEEP,
    });
    expect(settlement.totals.unpaidUpkeepSUSD).toBeCloseTo(FARM_UPKEEP, 9);
    expect(settlement.producers.find((producer) => producer.buildingId === 0)?.profitSUSD).toBeCloseTo(
      -10,
      9,
    );
  });
});

describe("M3e upkeep", () => {
  test("charges operational buildings daily upkeep scaled by level to the system reserve", () => {
    const { scenario, world } = createSettlementWorld({
      buildingIds: [],
      activeBuildingIds: [0, 7],
    });
    world.buildings.find((building) => building.id === 0)!.level = 2;
    const startFarm = accountBalance(world, buildingAccountId(world, 0));
    const startWarehouse = accountBalance(world, buildingAccountId(world, 7));
    const startSystem = accountBalance(world, SYSTEM_ACCOUNT_ID);

    const { settlement } = runSettlement(scenario, world);

    expect(settlement.upkeep).toHaveLength(2);
    expect(settlement.upkeep.find((entry) => entry.buildingId === 0)).toMatchObject({
      obligationSUSD: FARM_UPKEEP * 2,
      paidSUSD: FARM_UPKEEP * 2,
      unpaidSUSD: 0,
      systemAccountId: SYSTEM_ACCOUNT_ID,
    });
    expect(settlement.upkeep.find((entry) => entry.buildingId === 7)).toMatchObject({
      obligationSUSD: WAREHOUSE_UPKEEP,
      paidSUSD: WAREHOUSE_UPKEEP,
      unpaidSUSD: 0,
    });
    expect(accountBalance(world, buildingAccountId(world, 0))).toBeCloseTo(
      startFarm - FARM_UPKEEP * 2,
      9,
    );
    expect(accountBalance(world, buildingAccountId(world, 7))).toBeCloseTo(
      startWarehouse - WAREHOUSE_UPKEEP,
      9,
    );
    expect(accountBalance(world, SYSTEM_ACCOUNT_ID)).toBeCloseTo(
      startSystem + FARM_UPKEEP * 2 + WAREHOUSE_UPKEEP,
      9,
    );
    expect(settlement.totals.upkeepPaidSUSD).toBeCloseTo(
      FARM_UPKEEP * 2 + WAREHOUSE_UPKEEP,
      9,
    );
    expect(settlement.producers.find((producer) => producer.buildingId === 0)?.profitSUSD).toBeCloseTo(
      -FARM_UPKEEP * 2,
      9,
    );
  });

  test("does not charge upkeep for a non-operational building", () => {
    const { scenario, world } = createSettlementWorld({
      buildingIds: [],
      activeBuildingIds: [0],
    });
    const startSystem = accountBalance(world, SYSTEM_ACCOUNT_ID);
    const { settlement } = runSettlement(scenario, world);
    expect(settlement.upkeep.map((entry) => entry.buildingId)).toEqual([0]);
    expect(accountBalance(world, SYSTEM_ACCOUNT_ID)).toBeCloseTo(
      startSystem + FARM_UPKEEP,
      9,
    );
  });

  test("partially pays upkeep without overdrawing an underfunded building", () => {
    const { scenario, world } = createSettlementWorld({
      buildingIds: [],
      activeBuildingIds: [0, 7],
    });
    const farmId = buildingAccountId(world, 0);
    world.finance.accounts.find((account) => account.id === farmId)!.balanceSUSD = 5;
    const startSystem = accountBalance(world, SYSTEM_ACCOUNT_ID);
    const { settlement } = runSettlement(scenario, world);
    const upkeep = settlement.upkeep.find((entry) => entry.buildingId === 0);
    expect(upkeep).toMatchObject({
      obligationSUSD: FARM_UPKEEP,
      paidSUSD: 5,
      unpaidSUSD: FARM_UPKEEP - 5,
    });
    expect(accountBalance(world, farmId)).toBeCloseTo(0, 9);
    expect(accountBalance(world, SYSTEM_ACCOUNT_ID)).toBeCloseTo(
      startSystem + 5 + WAREHOUSE_UPKEEP,
      9,
    );
    expect(settlement.totals.unpaidUpkeepSUSD).toBeCloseTo(FARM_UPKEEP - 5, 9);
    expect(settlement.producers.find((producer) => producer.buildingId === 0)?.profitSUSD).toBeCloseTo(
      -5,
      9,
    );
  });
});

describe("M3e producer profit and household cash", () => {
  test("reconciles revenue, input cost, wage cost, upkeep, profit, and household assets", () => {
    const { scenario, world } = createSettlementWorld({
      buildingIds: [0, 4],
      activeBuildingIds: [0, 4, 7],
      lots: [{ goodId: GRAIN_ID, ownerBuildingId: 0, quantity: 10 }],
    });
    const start = totalCash(world);
    const householdId = householdAccountId(world, 0);
    const otherHouseholdId = householdAccountId(world, 1);
    const ownerId = householdAccountId(world, 3);
    const startHousehold = accountBalance(world, householdId);
    const startOther = accountBalance(world, otherHouseholdId);
    const startOwner = accountBalance(world, ownerId);
    const startSystem = accountBalance(world, SYSTEM_ACCOUNT_ID);

    const { settlement } = runSettlement(
      scenario,
      world,
      [household(0, 1, GRAIN_ID, 5)],
      [productionDemand(4, 2, GRAIN_ID, 5)],
    );

    const farm = settlement.producers.find((producer) => producer.buildingId === 0);
    const processor = settlement.producers.find((producer) => producer.buildingId === 4);
    const warehouse = settlement.producers.find((producer) => producer.buildingId === 7);
    expect(farm).toMatchObject({
      revenueSUSD: 0.5,
      inputCostsSUSD: 0,
      wagesPaidSUSD: FARM_WAGE,
      upkeepPaidSUSD: FARM_UPKEEP,
    });
    expect(farm?.profitSUSD).toBeCloseTo(0.5 - FARM_WAGE - FARM_UPKEEP, 9);
    expect(processor).toMatchObject({
      revenueSUSD: 0,
      inputCostsSUSD: 0.25,
      wagesPaidSUSD: PROCESSOR_WAGE,
      upkeepPaidSUSD: PROCESSOR_UPKEEP,
    });
    expect(processor?.profitSUSD).toBeCloseTo(
      -0.25 - PROCESSOR_WAGE - PROCESSOR_UPKEEP,
      9,
    );
    expect(warehouse?.profitSUSD).toBeCloseTo(-WAREHOUSE_UPKEEP, 9);
    expect(accountBalance(world, householdId)).toBeCloseTo(
      startHousehold - 0.25 + FARM_WAGE,
      9,
    );
    expect(accountBalance(world, otherHouseholdId)).toBeCloseTo(
      startOther + PROCESSOR_WAGE,
      9,
    );
    expect(accountBalance(world, ownerId)).toBeCloseTo(startOwner, 9);
    expect(accountBalance(world, SYSTEM_ACCOUNT_ID)).toBeCloseTo(
      startSystem + FARM_UPKEEP + PROCESSOR_UPKEEP + WAREHOUSE_UPKEEP,
      9,
    );
    expect(totalCash(world)).toBeCloseTo(start, 9);
    expect(settlement.totals.marketPurchasesSUSD).toBeCloseTo(0.5, 9);
    expect(settlement.totals.producerRevenueSUSD).toBeCloseTo(0.5, 9);
    expect(settlement.totals.producerInputCostsSUSD).toBeCloseTo(0.25, 9);
    expect(settlement.totals.wagesPaidSUSD).toBeCloseTo(FARM_WAGE + PROCESSOR_WAGE, 9);
    expect(settlement.totals.upkeepPaidSUSD).toBeCloseTo(
      FARM_UPKEEP + PROCESSOR_UPKEEP + WAREHOUSE_UPKEEP,
      9,
    );
    expect(settlement.totals.producerProfitSUSD).toBeCloseTo(
      0.5 -
        0.25 -
        FARM_WAGE -
        PROCESSOR_WAGE -
        FARM_UPKEEP -
        PROCESSOR_UPKEEP -
        WAREHOUSE_UPKEEP,
      9,
    );
  });
});

describe("M3e validation, atomicity, and duplicate protection", () => {
  test("rejects insufficient market funds without mutating any balance or posting", () => {
    const { scenario, world } = createSettlementWorld({
      buildingIds: [],
      activeBuildingIds: [0, 7],
      lots: [{ goodId: GRAIN_ID, ownerBuildingId: 0, quantity: 10 }],
    });
    const marketDay = runMarketDay(
      world,
      scenario.definitions,
      marketInput(scenario, world, [household(0, 1, GRAIN_ID, 10)]),
    );
    const householdId = householdAccountId(world, 0);
    world.finance.accounts.find((account) => account.id === householdId)!.balanceSUSD = 0.1;
    const before = world.finance.accounts.map((account) => ({ ...account }));
    const postings = [...world.finance.postings];
    const nextPostingId = world.finance.nextPostingId;

    expect(() => settleMarketDay(world, scenario.definitions, marketDay)).toThrow(
      /insufficient|overdraw/i,
    );
    expect(world.finance.accounts).toEqual(before);
    expect(world.finance.postings).toHaveLength(postings.length);
    expect(world.finance.nextPostingId).toBe(nextPostingId);
    expect(marketDay.settled).toBe(false);
  });

  test("market purchases cannot be funded by wages that settle later in the same day", () => {
    const { scenario, world } = createSettlementWorld({
      buildingIds: [0],
      activeBuildingIds: [0, 7],
      lots: [{ goodId: GRAIN_ID, ownerBuildingId: 0, quantity: 10 }],
    });
    const householdId = householdAccountId(world, 0);
    world.finance.accounts.find((account) => account.id === householdId)!.balanceSUSD = 0;
    const marketDay = runMarketDay(
      world,
      scenario.definitions,
      marketInput(scenario, world, [household(0, 1, GRAIN_ID, 10)]),
    );
    const balances = world.finance.accounts.map((account) => ({ ...account }));
    expect(() => settleMarketDay(world, scenario.definitions, marketDay)).toThrow(
      /insufficient|overdraw/i,
    );
    expect(world.finance.accounts).toEqual(balances);
    expect(world.finance.postings).toHaveLength(0);
    expect(marketDay.settled).toBe(false);
  });

  test("rolls back market and wage postings when upkeep routing fails", () => {
    const { scenario, world } = createSettlementWorld({
      buildingIds: [0],
      activeBuildingIds: [0, 7],
      lots: [{ goodId: GRAIN_ID, ownerBuildingId: 0, quantity: 10 }],
    });
    world.finance.accounts = world.finance.accounts.filter(
      (account) => account.id !== SYSTEM_ACCOUNT_ID,
    );
    const marketDay = runMarketDay(
      world,
      scenario.definitions,
      marketInput(scenario, world, [household(0, 1, GRAIN_ID, 5)]),
    );
    const balances = world.finance.accounts.map((account) => ({ ...account }));
    const postings = [...world.finance.postings];
    const nextPostingId = world.finance.nextPostingId;

    expect(() => settleMarketDay(world, scenario.definitions, marketDay)).toThrow(
      /system-reserve/i,
    );
    expect(world.finance.accounts).toEqual(balances);
    expect(world.finance.postings).toEqual(postings);
    expect(world.finance.nextPostingId).toBe(nextPostingId);
    expect(marketDay.settled).toBe(false);
  });

  test("rejects a second settlement of the same result", () => {
    const { scenario, world } = createSettlementWorld({
      buildingIds: [],
      activeBuildingIds: [0, 7],
      lots: [{ goodId: GRAIN_ID, ownerBuildingId: 0, quantity: 10 }],
    });
    const marketDay = runMarketDay(
      world,
      scenario.definitions,
      marketInput(scenario, world, [household(0, 1, GRAIN_ID, 5)]),
    );
    settleMarketDay(world, scenario.definitions, marketDay);
    const balances = world.finance.accounts.map((account) => ({ ...account }));
    const postingCount = world.finance.postings.length;
    expect(() => settleMarketDay(world, scenario.definitions, marketDay)).toThrow(/already been settled/i);
    expect(world.finance.accounts).toEqual(balances);
    expect(world.finance.postings).toHaveLength(postingCount);
  });

  test("rejects duplicate pending transactions before changing balances", () => {
    const { scenario, world } = createSettlementWorld({
      buildingIds: [],
      activeBuildingIds: [0, 7],
      lots: [{ goodId: GRAIN_ID, ownerBuildingId: 0, quantity: 10 }],
    });
    const marketDay = runMarketDay(
      world,
      scenario.definitions,
      marketInput(scenario, world, [household(0, 1, GRAIN_ID, 5)]),
    );
    const duplicate: MarketDayResult = {
      ...marketDay,
      settled: false,
      pendingTransactions: [
        ...marketDay.pendingTransactions,
        ...marketDay.pendingTransactions,
      ],
    };
    const balances = world.finance.accounts.map((account) => ({ ...account }));
    expect(() => settleMarketDay(world, scenario.definitions, duplicate)).toThrow(/duplicate pending/i);
    expect(world.finance.accounts).toEqual(balances);
  });

  test("rejects invalid buyers, malformed amounts, and mismatched totals atomically", () => {
    const { scenario, world } = createSettlementWorld({
      buildingIds: [],
      activeBuildingIds: [0, 7],
      lots: [{ goodId: GRAIN_ID, ownerBuildingId: 0, quantity: 10 }],
    });
    const marketDay = runMarketDay(
      world,
      scenario.definitions,
      marketInput(scenario, world, [household(0, 1, GRAIN_ID, 5)]),
    );
    const balances = world.finance.accounts.map((account) => ({ ...account }));
    const original = marketDay.pendingTransactions[0]!;

    const invalidBuyer: MarketDayResult = {
      ...marketDay,
      settled: false,
      pendingTransactions: [{ ...original, buyerPopBlockId: 999 }],
    };
    expect(() => settleMarketDay(world, scenario.definitions, invalidBuyer)).toThrow(
      /unknown popBlock|household account/i,
    );
    expect(world.finance.accounts).toEqual(balances);

    const nonFinite: MarketDayResult = {
      ...marketDay,
      settled: false,
      pendingTransactions: [{ ...original, quantity: Number.NaN }],
    };
    expect(() => settleMarketDay(world, scenario.definitions, nonFinite)).toThrow(/quantity/i);
    expect(world.finance.accounts).toEqual(balances);

    const badTotal: MarketDayResult = {
      ...marketDay,
      settled: false,
      pendingTransactions: [{ ...original, totalSUSD: original.totalSUSD + 1 }],
    };
    expect(() => settleMarketDay(world, scenario.definitions, badTotal)).toThrow(/reconcile/i);
    expect(world.finance.accounts).toEqual(balances);
  });
});

describe("M3e conservation, determinism, and inventory separation", () => {
  test("conserves cash, balances every posting, and leaves inventory unchanged", () => {
    const { scenario, world } = createSettlementWorld({
      buildingIds: [0, 4],
      activeBuildingIds: [0, 4, 7],
      lots: [{ goodId: GRAIN_ID, ownerBuildingId: 0, quantity: 10 }],
    });
    const marketDay = runMarketDay(
      world,
      scenario.definitions,
      marketInput(
        scenario,
        world,
        [household(0, 1, GRAIN_ID, 5)],
        [productionDemand(4, 2, GRAIN_ID, 5)],
      ),
    );
    const lotsBefore = world.markets[0]!.stockLots.map((lot) => ({ ...lot }));
    const pricesBefore = [...world.markets[0]!.priceSUSD];
    const before = totalCash(world);
    const systemBefore = accountBalance(world, SYSTEM_ACCOUNT_ID);
    const settlement = settleMarketDay(world, scenario.definitions, marketDay);

    expect(world.markets[0]!.stockLots).toEqual(lotsBefore);
    expect(world.markets[0]!.priceSUSD).toEqual(pricesBefore);
    expect(totalCash(world)).toBeCloseTo(before, 9);
    expect(settlement.totals.initialCashSUSD).toBeCloseTo(before, 9);
    expect(settlement.totals.endingCashSUSD).toBeCloseTo(before, 9);
    for (const posting of world.finance.postings) {
      const debits = posting.lines
        .filter((line) => line.side === "debit")
        .reduce((total, line) => total + line.amountSUSD, 0);
      const credits = posting.lines
        .filter((line) => line.side === "credit")
        .reduce((total, line) => total + line.amountSUSD, 0);
      expect(Math.abs(debits - credits)).toBeLessThanOrEqual(1e-6);
    }
    const producerProfit = settlement.producers.reduce(
      (total, producer) => total + producer.profitSUSD,
      0,
    );
    const householdChange = settlement.households.reduce(
      (total, householdResult) =>
        total + householdResult.endingCashSUSD - householdResult.initialCashSUSD,
      0,
    );
    const systemChange = accountBalance(world, SYSTEM_ACCOUNT_ID) - systemBefore;
    expect(producerProfit + householdChange + systemChange).toBeCloseTo(0, 9);
  });

  test("settled balances and postings survive the existing save codec", () => {
    const { scenario, world } = createSettlementWorld({
      buildingIds: [0],
      activeBuildingIds: [0, 7],
    });
    runSettlement(scenario, world);
    const restored = deserializeWorld(serializeWorld(world));
    expect(restored.finance.accounts).toEqual(world.finance.accounts);
    expect(restored.finance.postings).toEqual(world.finance.postings);
    expect(hashWorld(restored)).toBe(hashWorld(world));
  });

  test("identical worlds and market results settle to identical balances and hash", () => {
    const firstCase = createSettlementWorld({
      buildingIds: [0, 4],
      activeBuildingIds: [0, 4, 7],
      lots: [{ goodId: GRAIN_ID, ownerBuildingId: 0, quantity: 10 }],
    });
    const secondCase = createSettlementWorld({
      buildingIds: [0, 4],
      activeBuildingIds: [0, 4, 7],
      lots: [{ goodId: GRAIN_ID, ownerBuildingId: 0, quantity: 10 }],
    });
    const first = runSettlement(
      firstCase.scenario,
      firstCase.world,
      [household(0, 1, GRAIN_ID, 5)],
      [productionDemand(4, 2, GRAIN_ID, 5)],
    );
    const second = runSettlement(
      secondCase.scenario,
      secondCase.world,
      [household(0, 1, GRAIN_ID, 5)],
      [productionDemand(4, 2, GRAIN_ID, 5)],
    );
    expect(second.settlement).toEqual(first.settlement);
    expect(hashWorld(secondCase.world)).toBe(hashWorld(firstCase.world));
  });
});
