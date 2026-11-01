import {
  applyMilitaryAction,
  cloneWorld,
  createEconomyWorld,
  createInitialWorld,
  deserializeWorld,
  hashWorld,
  populationTotal,
  serializeWorld,
  tick,
  type EconomyScenarioDef,
  type TickContext,
  type World,
} from "@century/sim";
import { loadM5EightPolities } from "@century/data";
import {
  accountBalance,
  buildingAccountId,
  economyTickContext,
  householdAccountId,
  setCashBalance,
  totalCash,
} from "./fixtures/m3e.js";
import {
  CLOTHING_ID,
  FOOD_ID,
  GRAIN_ID,
  TEXTILES_ID,
  marketScenario,
} from "./fixtures/m3d.js";

const FULL_LOTS = [
  { goodId: GRAIN_ID, ownerBuildingId: 0, quantity: 1000 },
  { goodId: 1, ownerBuildingId: 2, quantity: 100 },
  { goodId: 2, ownerBuildingId: 3, quantity: 100 },
  { goodId: FOOD_ID, ownerBuildingId: 4, quantity: 100 },
  { goodId: TEXTILES_ID, ownerBuildingId: 5, quantity: 100 },
  { goodId: CLOTHING_ID, ownerBuildingId: 6, quantity: 100 },
];

const SYSTEM_ACCOUNT_ID = 20;
const TERMINAL_DAY = 36_524;

function fullScenario(): EconomyScenarioDef {
  const scenario = marketScenario({ lots: FULL_LOTS });
  const warehouse = scenario.definitions.buildings.find((definition) => definition.id === 7);
  if (warehouse === undefined) throw new Error("missing warehouse");
  warehouse.storageCapacityByGood.push({ goodId: 2, quantity: 2000 });
  return scenario;
}

function worldFor(scenario: EconomyScenarioDef, active?: readonly number[]): World {
  const world = createEconomyWorld(scenario, { seed: 20_261_023 });
  if (active !== undefined) {
    const activeIds = new Set(active);
    for (const building of world.buildings) {
      if (!activeIds.has(building.id)) building.operational = false;
    }
  }
  return world;
}

function contextFor(scenario: EconomyScenarioDef): TickContext {
  return economyTickContext(scenario);
}

function balance(world: World, accountId: number): number {
  return accountBalance(world, accountId);
}

describe("M3f integrated economic day", () => {
  test("runs one complete day with needs, production, trades, wages, upkeep, and profit", () => {
    const scenario = fullScenario();
    const world = worldFor(scenario);
    const beforeCash = totalCash(world);
    const result = tick(world, contextFor(scenario));

    expect(result.advanced).toBe(true);
    expect(result.dayProcessed).toBe(0);
    expect(result.dayIndex).toBe(1);
    expect(result.population?.aged).toBe(false);
    expect(result.economy).toBeDefined();
    expect(result.economy?.fallbackUsed).toBe(false);
    expect(result.economy?.market.settled).toBe(true);
    expect(result.economy?.market.pendingTransactions.length).toBeGreaterThan(0);
    expect(result.economy?.settlement.wages.length).toBeGreaterThan(0);
    expect(result.economy?.settlement.upkeep.length).toBeGreaterThan(0);
    expect(result.economy?.settlement.transactions.length).toBeGreaterThan(0);
    expect(
      new Set(result.economy?.settlement.transactions.map((transaction) => transaction.sellerBuildingId))
        .size,
    ).toBeGreaterThan(1);
    expect(result.economy?.settlement.totals.producerProfitRUSD).toBeLessThan(0);
    expect(result.economy?.employment.refreshed).toBe(true);
    expect(world.dayIndex).toBe(1);
    expect(totalCash(world)).toBeCloseTo(beforeCash, 9);

    for (const flow of result.economy!.market.inventory) {
      expect(
        flow.openingStock +
          flow.production -
          flow.usedAsInput -
          flow.householdConsumption -
          flow.recordedLoss,
      ).toBeCloseTo(flow.closingStock, 9);
    }
    expect(result.population?.needs.blocks.length).toBe(world.popBlocks.length);
    expect(result.population?.needs.blocks[0]?.tierSummaries).toHaveLength(4);
  });

  test("funds household purchases from opening cash only", () => {
    const scenario = fullScenario();
    const world = worldFor(scenario);
    const householdId = householdAccountId(world, 0);
    setCashBalance(world, householdId, 0.5);
    const result = tick(world, contextFor(scenario));
    const household = result.economy?.settlement.households.find(
      (entry) => entry.popBlockId === 0,
    );
    expect(household?.marketPurchasesRUSD).toBeLessThanOrEqual(0.5 + 1e-9);
    expect(balance(world, householdId)).toBeGreaterThanOrEqual(0);
    const fundedCost = result.economy!.householdDemands
      .filter((demand) => demand.popBlockId === 0)
      .reduce(
        (total, demand) =>
          total + demand.fundedQuantity * (result.economy!.market.openingPrices[demand.goodId] ?? 0),
        0,
      );
    expect(fundedCost).toBeLessThanOrEqual(0.5 + 1e-9);
  });

  test("does not use same-day wages to fund earlier household purchases", () => {
    const scenario = fullScenario();
    const world = worldFor(scenario);
    const householdId = householdAccountId(world, 0);
    setCashBalance(world, householdId, 0);
    const result = tick(world, contextFor(scenario));
    const household = result.economy?.settlement.households.find(
      (entry) => entry.popBlockId === 0,
    );
    expect(household?.marketPurchasesRUSD).toBe(0);
    expect(household?.wagesReceivedRUSD).toBeGreaterThan(0);
    expect(household?.endingCashAfterSettlementRUSD).toBeGreaterThan(0);
  });

  test("uses valid same-batch sales receipts to fund a production-input purchase", () => {
    const scenario = fullScenario();
    const block = scenario.population.popBlocks.find((candidate) => candidate.id === 1);
    if (block === undefined) throw new Error("missing block 1");
    block.wealthLevel = 80;
    scenario.employment = scenario.employment.filter(
      (assignment) => assignment.buildingInstanceId !== 4,
    );
    const world = worldFor(scenario, [0, 5, 7]);
    const millId = buildingAccountId(world, 5);
    setCashBalance(world, millId, 0);
    const openingMillCash = 0;
    const sellerId = buildingAccountId(world, 0);
    const openingSellerCash = balance(world, sellerId);
    const grainFlowBefore = world.markets[0]?.stockLots
      .filter((lot) => lot.goodId === GRAIN_ID)
      .reduce((total, lot) => total + lot.quantity, 0) ?? 0;
    const textileFlowBefore = world.markets[0]?.stockLots
      .filter((lot) => lot.goodId === TEXTILES_ID)
      .reduce((total, lot) => total + lot.quantity, 0) ?? 0;

    const result = tick(world, contextFor(scenario));
    expect(result.economy?.fallbackUsed).toBe(false);
    const millInput = result.economy?.settlement.transactions.find(
      (transaction) =>
        transaction.kind === "input-purchase" &&
        transaction.buyerBuildingId === 5 &&
        transaction.sellerBuildingId === 0,
    );
    const millSale = result.economy?.settlement.transactions.find(
      (transaction) =>
        transaction.kind === "household-purchase" &&
        transaction.sellerBuildingId === 5 &&
        transaction.buyerPopBlockId === 1,
    );
    const millProducer = result.economy?.settlement.producers.find(
      (producer) => producer.buildingId === 5,
    );
    const sellerProducer = result.economy?.settlement.producers.find(
      (producer) => producer.buildingId === 0,
    );
    if (
      millInput === undefined ||
      millSale === undefined ||
      millProducer === undefined ||
      sellerProducer === undefined
    ) {
      throw new Error("missing receipt-funded transactions");
    }

    expect(openingMillCash).toBeLessThan(millInput.totalRUSD);
    expect(millSale.totalRUSD).toBeGreaterThanOrEqual(millInput.totalRUSD);
    expect(millInput.buyerAccountId).toBe(millId);
    expect(millInput.sellerAccountId).toBe(sellerId);
    expect(millProducer.initialCashRUSD).toBe(openingMillCash);
    expect(millProducer.revenueRUSD).toBeCloseTo(millSale.totalRUSD, 9);
    expect(millProducer.inputCostsRUSD).toBeCloseTo(millInput.totalRUSD, 9);
    expect(millProducer.endingCashAfterSettlementRUSD).toBeCloseTo(
      millProducer.initialCashRUSD +
        millProducer.revenueRUSD -
        millProducer.inputCostsRUSD -
        millProducer.wagesPaidRUSD -
        millProducer.upkeepPaidRUSD,
      9,
    );
    expect(millProducer.endingCashAfterSettlementRUSD).toBeGreaterThanOrEqual(0);
    expect(sellerProducer.initialCashRUSD).toBe(openingSellerCash);
    expect(sellerProducer.revenueRUSD).toBeGreaterThanOrEqual(millInput.totalRUSD);
    expect(balance(world, sellerId)).toBeCloseTo(sellerProducer.endingCashAfterSettlementRUSD, 9);
    expect(balance(world, millId)).toBeCloseTo(millProducer.endingCashAfterSettlementRUSD, 9);

    const grainFlow = result.economy?.market.inventory.find(
      (flow) => flow.goodId === GRAIN_ID,
    );
    const textileFlow = result.economy?.market.inventory.find(
      (flow) => flow.goodId === TEXTILES_ID,
    );
    if (grainFlow === undefined || textileFlow === undefined) {
      throw new Error("missing inventory flows");
    }
    expect(grainFlow.openingStock).toBe(grainFlowBefore);
    expect(grainFlow.usedAsInput).toBeGreaterThanOrEqual(millInput.quantity - 1e-9);
    expect(textileFlow.openingStock).toBe(textileFlowBefore);
    expect(textileFlow.householdConsumption).toBeGreaterThanOrEqual(
      millSale.quantity - 1e-9,
    );
    expect(textileFlow.closingStock).toBeCloseTo(
      textileFlow.openingStock +
        textileFlow.production -
        textileFlow.usedAsInput -
        textileFlow.householdConsumption -
        textileFlow.recordedLoss,
      9,
    );
  });

  test("falls back to cash-funded production when expected sales do not materialize", () => {
    const scenario = fullScenario();
    scenario.employment = scenario.employment.filter(
      (assignment) => assignment.buildingInstanceId !== 4,
    );
    const world = worldFor(scenario, [0, 5, 7]);
    const millId = buildingAccountId(world, 5);
    setCashBalance(world, millId, 0);
    const market = world.markets[0];
    if (market === undefined) throw new Error("missing market");
    const openingPrices = [...market.priceRUSD];
    const openingLots = market.stockLots.map((lot) => ({ ...lot }));
    const openingStockByGood = scenario.definitions.goods.map((good) =>
      openingLots
        .filter((lot) => lot.goodId === good.id)
        .reduce((total, lot) => total + lot.quantity, 0),
    );
    const beforeCash = totalCash(world);
    const beforePostingId = world.finance.nextPostingId;

    const result = tick(world, contextFor(scenario));
    expect(result.economy?.fallbackUsed).toBe(true);
    expect(world.finance.nextPostingId).toBe(
      beforePostingId + (result.economy?.settlement.postingIds.length ?? -1),
    );
    expect(
      result.economy?.settlement.transactions.some(
        (transaction) => transaction.buyerBuildingId === 5,
      ),
    ).toBe(false);
    expect(
      result.economy?.productionDemands.some(
        (demand) => demand.buyerBuildingId === 5,
      ),
    ).toBe(false);
    expect(result.economy?.market.openingPrices).toEqual(openingPrices);
    expect(
      result.economy?.market.inventory.map((flow) => flow.openingStock),
    ).toEqual(openingStockByGood);
    expect(balance(world, millId)).toBeGreaterThanOrEqual(0);
    for (const account of world.finance.accounts) {
      expect(account.balanceRUSD).toBeGreaterThanOrEqual(0);
    }
    expect(totalCash(world)).toBeCloseTo(beforeCash, 9);
    expect(world.dayIndex).toBe(1);
  });

  test("releases unused production inputs when another input limits throughput", () => {
    const scenario = fullScenario();
    const processor = scenario.definitions.buildings.find((definition) => definition.id === 4);
    if (processor === undefined) throw new Error("missing processor");
    processor.inputs.push({ goodId: TEXTILES_ID, quantityPerThroughputUnit: 5 });
    const market = scenario.markets[0];
    if (market === undefined) throw new Error("missing market");
    market.stockLots = [
      ...FULL_LOTS.filter((lot) => lot.goodId !== TEXTILES_ID),
      { goodId: TEXTILES_ID, ownerBuildingId: 5, quantity: 2 },
    ];
    const world = worldFor(scenario);
    const result = tick(world, contextFor(scenario));
    const processorInputs = result.economy?.market.productionDemands.filter(
      (demand) => demand.buyerBuildingId === 4,
    );
    expect(processorInputs).toBeDefined();
    expect(
      processorInputs?.some(
        (demand) => demand.reservedQuantity > demand.usedQuantity + 1e-9,
      ),
    ).toBe(true);
    expect(result.economy?.settlement.transactions.length).toBeGreaterThan(0);
  });

  test("pays partial wages and upkeep without negative balances", () => {
    const scenario = fullScenario();
    const world = worldFor(scenario);
    for (const building of world.buildings) {
      const account = world.finance.accounts.find(
        (candidate) => candidate.id === building.operatingCashAccountId,
      );
      if (account !== undefined) setCashBalance(world, account.id, 0);
    }
    const result = tick(world, contextFor(scenario));
    expect(result.economy?.settlement.totals.unpaidWagesRUSD).toBeGreaterThan(0);
    expect(result.economy?.settlement.totals.unpaidUpkeepRUSD).toBeGreaterThan(0);
    for (const account of world.finance.accounts) {
      expect(account.balanceRUSD).toBeGreaterThanOrEqual(0);
    }
  });

  test("structural staging clones every authoritative field without shared references", () => {
    const scenario = fullScenario();
    const world = worldFor(scenario);
    tick(world, contextFor(scenario));
    const clone = cloneWorld(world);
    expect(serializeWorld(clone)).toBe(serializeWorld(world));
    const originalSerialized = serializeWorld(world);
    const originalAgeCell = world.popBlocks[0]!.maleByAge[0] ?? 0;
    const originalBalance = clone.finance.accounts[0]!.balanceRUSD;
    const originalLot = clone.markets[0]!.stockLots[0]!.quantity;

    clone.popBlocks[0]!.maleByAge[0] = originalAgeCell + 1;
    clone.finance.accounts[0]!.balanceRUSD += 1;
    clone.markets[0]!.stockLots[0]!.quantity += 1;
    clone.diagnostics.recentWarnings.push("clone-only");
    const clonePosting = clone.finance.postings[0];
    if (clonePosting !== undefined) clonePosting.lines[0]!.amountRUSD += 1;

    // The clone changed exactly where it was mutated...
    expect(clone.popBlocks[0]!.maleByAge[0]).toBe(originalAgeCell + 1);
    expect(clone.finance.accounts[0]!.balanceRUSD).toBeCloseTo(originalBalance + 1, 9);
    expect(clone.markets[0]!.stockLots[0]!.quantity).toBeCloseTo(originalLot + 1, 9);
    // ...and the source world remains byte-identical.
    expect(serializeWorld(world)).toBe(originalSerialized);
    expect(clone.popBlocks[0]!.maleByAge).not.toBe(world.popBlocks[0]!.maleByAge);
    expect(clone.finance.accounts[0]).not.toBe(world.finance.accounts[0]);
    expect(clone.finance.postings).not.toBe(world.finance.postings);
    if (world.finance.postings[0] !== undefined) {
      expect(clone.finance.postings[0]!.lines[0]).not.toBe(
        world.finance.postings[0]!.lines[0],
      );
    }
    expect(clone.markets[0]!.stockLots[0]).not.toBe(world.markets[0]!.stockLots[0]);
  });

  test("rolls the whole day back when settlement routing fails", () => {
    const scenario = fullScenario();
    const world = worldFor(scenario);
    world.finance.accounts = world.finance.accounts.filter(
      (account) => account.id !== SYSTEM_ACCOUNT_ID,
    );
    const beforeHash = hashWorld(world);
    const beforeSerialized = serializeWorld(world);
    const beforeDay = world.dayIndex;
    const beforePostingId = world.finance.nextPostingId;
    const beforeBalances = world.finance.accounts.map((account) => account.balanceRUSD);
    const beforeLots = world.markets[0]?.stockLots.map((lot) => ({ ...lot }));
    const beforePrices = world.markets[0]?.priceRUSD.slice();
    const beforeMaleByAge = world.popBlocks.map((block) => block.maleByAge.slice());
    const beforeFemaleByAge = world.popBlocks.map((block) => block.femaleByAge.slice());
    const beforeNeeds = world.popBlocks.map((block) => ({
      subsistence: block.unmetSubsistenceDays,
      basic: block.unmetBasicDays,
      comfort: block.comfortFulfilledDays,
      militancy: block.militancy,
      wealth: block.wealthLevel,
    }));

    expect(() => tick(world, contextFor(scenario))).toThrow(/system-reserve/i);

    expect(world.dayIndex).toBe(beforeDay);
    expect(world.finance.nextPostingId).toBe(beforePostingId);
    expect(world.finance.accounts.map((account) => account.balanceRUSD)).toEqual(beforeBalances);
    expect(world.markets[0]?.stockLots).toEqual(beforeLots);
    expect(world.markets[0]?.priceRUSD).toEqual(beforePrices);
    expect(world.popBlocks.map((block) => block.maleByAge)).toEqual(beforeMaleByAge);
    expect(world.popBlocks.map((block) => block.femaleByAge)).toEqual(beforeFemaleByAge);
    expect(
      world.popBlocks.map((block) => ({
        subsistence: block.unmetSubsistenceDays,
        basic: block.unmetBasicDays,
        comfort: block.comfortFulfilledDays,
        militancy: block.militancy,
        wealth: block.wealthLevel,
      })),
    ).toEqual(beforeNeeds);
    expect(hashWorld(world)).toBe(beforeHash);
    expect(serializeWorld(world)).toBe(beforeSerialized);
  });

  test("applies monthly wealth re-estimation from actual settled wages", () => {
    const scenario = fullScenario();
    const world = worldFor(scenario);
    world.dayIndex = 30;
    const result = tick(world, contextFor(scenario));
    expect(result.population?.wealthUpdates).toHaveLength(world.popBlocks.length);
    const block = world.popBlocks.find((candidate) => candidate.id === 0);
    const update = result.population?.wealthUpdates.find((entry) => entry.popBlockId === 0);
    const household = result.economy?.settlement.households.find(
      (entry) => entry.popBlockId === 0,
    );
    if (block === undefined || update === undefined || household === undefined) {
      throw new Error("missing block 0 wealth inputs");
    }
    expect(update.annualDisposableIncomePerCapitaRUSD).toBeCloseTo(
      (household.wagesReceivedRUSD / populationTotal(block)) * 365,
      9,
    );
    expect(update.annualSubsistenceCostPerCapitaRUSD).toBeGreaterThan(0);
    expect(update.newWealthLevel).not.toBe(update.oldWealthLevel);
    expect(block.wealthLevel).toBe(update.newWealthLevel);
  });

  test("does not re-estimate wealth on a non-month-end day", () => {
    const scenario = fullScenario();
    const world = worldFor(scenario);
    world.dayIndex = 29;
    const result = tick(world, contextFor(scenario));
    expect(result.population?.wealthUpdates).toEqual([]);
  });

  test("monthly wealth changes next-day comfort demand activation", () => {
    const scenario = fullScenario();
    const world = worldFor(scenario);
    const block = world.popBlocks.find((candidate) => candidate.id === 1);
    if (block === undefined) throw new Error("missing block 1");
    block.wealthLevel = 24;
    world.dayIndex = 30;
    const monthEnd = tick(world, contextFor(scenario));
    const update = monthEnd.population?.wealthUpdates.find(
      (entry) => entry.popBlockId === 1,
    );
    expect(update?.newWealthLevel).toBeGreaterThanOrEqual(25);
    expect(
      monthEnd.economy?.householdDemands.some(
        (demand) => demand.popBlockId === 1 && demand.tier === 6,
      ),
    ).toBe(false);

    const nextDay = tick(world, contextFor(scenario));
    expect(
      nextDay.economy?.householdDemands.some(
        (demand) => demand.popBlockId === 1 && demand.tier === 6,
      ),
    ).toBe(true);
  });

  test("updates wealth on 1900-12-31, then applies January 1 ageing across save/load", () => {
    const directScenario = fullScenario();
    const reloadScenario = fullScenario();
    const direct = worldFor(directScenario);
    direct.dayIndex = 364;
    const endOfYear = tick(direct, contextFor(directScenario));
    expect(endOfYear.population?.wealthUpdates.length).toBeGreaterThan(0);
    const january = tick(direct, contextFor(directScenario));
    expect(january.population?.aged).toBe(true);
    expect(january.population?.wealthUpdates).toEqual([]);

    const reloaded = worldFor(reloadScenario);
    reloaded.dayIndex = 364;
    tick(reloaded, contextFor(reloadScenario));
    const restored = deserializeWorld(serializeWorld(reloaded));
    const restoredJanuary = tick(restored, contextFor(reloadScenario));
    expect(restoredJanuary.population?.aged).toBe(true);
    expect(restoredJanuary.population?.wealthUpdates).toEqual([]);
    expect(hashWorld(restored)).toBe(hashWorld(direct));
  });

  test("refreshes employment when dirty or monthly and not otherwise", () => {
    const scenario = fullScenario();
    const world = worldFor(scenario);
    const first = tick(world, contextFor(scenario));
    expect(first.economy?.employment.refreshed).toBe(true);
    const second = tick(world, contextFor(scenario));
    expect(second.economy?.employment.refreshed).toBe(false);
    world.employmentDirty = true;
    const third = tick(world, contextFor(scenario));
    expect(third.economy?.employment.refreshed).toBe(true);
  });

  test("applies annual ageing on January 1 and not on the scenario start", () => {
    const scenario = fullScenario();
    const world = worldFor(scenario);
    world.dayIndex = 365;
    const result = tick(world, contextFor(scenario));
    expect(result.population?.aged).toBe(true);
    expect(result.dayProcessed).toBe(365);
    expect(result.dayIndex).toBe(366);
  });

  test("does not process beyond the terminal boundary", () => {
    const scenario = fullScenario();
    const world = worldFor(scenario);
    world.dayIndex = TERMINAL_DAY;
    const beforeHash = hashWorld(world);
    const result = tick(world, contextFor(scenario));
    expect(result.advanced).toBe(false);
    expect(result.dayProcessed).toBeNull();
    expect(world.dayIndex).toBe(TERMINAL_DAY);
    expect(hashWorld(world)).toBe(beforeHash);
  });

  test("repeats deterministically across identical worlds and ticks", () => {
    const firstScenario = fullScenario();
    const secondScenario = fullScenario();
    const firstWorld = worldFor(firstScenario);
    const secondWorld = worldFor(secondScenario);
    const firstResult = tick(firstWorld, contextFor(firstScenario));
    const secondResult = tick(secondWorld, contextFor(secondScenario));
    expect(secondResult.economy?.settlement.totals).toEqual(
      firstResult.economy?.settlement.totals,
    );
    expect(hashWorld(secondWorld)).toBe(hashWorld(firstWorld));

    tick(firstWorld, contextFor(firstScenario));
    tick(secondWorld, contextFor(secondScenario));
    expect(hashWorld(secondWorld)).toBe(hashWorld(firstWorld));
  });

  test("save/load continuation matches uninterrupted execution", () => {
    const uninterrupted = fullScenario();
    const reloaded = fullScenario();
    const firstWorld = worldFor(uninterrupted);
    tick(firstWorld, contextFor(uninterrupted));
    tick(firstWorld, contextFor(uninterrupted));

    const secondWorld = worldFor(reloaded);
    tick(secondWorld, contextFor(reloaded));
    const restored = deserializeWorld(serializeWorld(secondWorld));
    tick(restored, contextFor(reloaded));
    expect(hashWorld(restored)).toBe(hashWorld(firstWorld));
  });

  test("M2-only worlds keep the existing non-economic tick path", () => {
    const world = createInitialWorld({ seed: 7, scenarioId: "m3f-m2-regression" });
    const result = tick(world);
    expect(result.advanced).toBe(true);
    expect(result.economy).toBeUndefined();
    expect(world.dayIndex).toBe(1);
  });

  test("staging isolates military and country trade subtrees", () => {
    const scenario = loadM5EightPolities();
    const world = createEconomyWorld(scenario, { seed: 20_261_107 });
    applyMilitaryAction(
      world,
      {
        kind: "recruit-army",
        countryId: 0,
        dayIndex: world.dayIndex,
        source: "player",
        regionId: 0,
        personnel: 100,
      },
      world.dayIndex,
    );
    const clone = cloneWorld(world);
    expect(clone.military).not.toBe(world.military);
    expect(clone.military.armies).not.toBe(world.military.armies);
    expect(clone.military.armies[0]).not.toBe(world.military.armies[0]);
    expect(clone.military.wars).not.toBe(world.military.wars);
    expect(clone.military.relations).not.toBe(world.military.relations);
    expect(clone.military.peaceOffers).not.toBe(world.military.peaceOffers);
    expect(clone.military.casualties).not.toBe(world.military.casualties);
    for (let index = 0; index < world.countries.length; index += 1) {
      const original = world.countries[index];
      const copy = clone.countries[index];
      if (original === undefined || copy === undefined) throw new Error("missing country");
      expect(copy.trade).not.toBe(original.trade);
      expect(copy.trade.tariffRates).not.toBe(original.trade.tariffRates);
      expect(copy.trade.importQuotaQuantity).not.toBe(original.trade.importQuotaQuantity);
      expect(copy.trade.importQuotaUsedQuantity).not.toBe(
        original.trade.importQuotaUsedQuantity,
      );
      expect(copy.trade.exportRestricted).not.toBe(original.trade.exportRestricted);
    }
  });

  test("a late-phase failure leaves the complete original world unchanged", () => {
    const scenario = loadM5EightPolities();
    const world = createEconomyWorld(scenario, { seed: 20_261_107 });
    applyMilitaryAction(
      world,
      {
        kind: "recruit-army",
        countryId: 0,
        dayIndex: world.dayIndex,
        source: "player",
        regionId: 0,
        personnel: 500,
      },
      world.dayIndex,
    );
    // Force a failure after the military phase. The day starts from this exact
    // state, so the comparison below measures only the failed tick's side effects.
    world.finance.accounts = world.finance.accounts.filter(
      (account) =>
        !(
          account.ownerKind === "country" &&
          account.ownerId === 0 &&
          account.subtype === "education-expense"
        ),
    );
    const beforeHash = hashWorld(world);
    const beforeSerialized = serializeWorld(world);
    const beforeDay = world.dayIndex;
    const beforePhase = world.military.lastPhaseDay;
    const armyBefore = world.military.armies[0];
    if (armyBefore === undefined) throw new Error("military fixture has no army");
    const beforeSupply = armyBefore.supply;
    const beforeImports = world.countries.map(
      (country) => country.trade.importsValueMonthToDateRUSD,
    );
    const beforeQuota = world.countries.map((country) => [
      ...country.trade.importQuotaUsedQuantity,
    ]);

    expect(() => tick(world, contextFor(scenario))).toThrow(/education-expense/);

    expect(world.dayIndex).toBe(beforeDay);
    expect(world.military.lastPhaseDay).toBe(beforePhase);
    expect(armyBefore.supply).toBe(beforeSupply);
    expect(world.countries.map((country) => country.trade.importsValueMonthToDateRUSD)).toEqual(
      beforeImports,
    );
    expect(world.countries.map((country) => [...country.trade.importQuotaUsedQuantity])).toEqual(
      beforeQuota,
    );
    expect(hashWorld(world)).toBe(beforeHash);
    expect(serializeWorld(world)).toBe(beforeSerialized);
  });
});
