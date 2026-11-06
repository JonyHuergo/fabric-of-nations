import {
  assertAccountingIdentity,
  assertValidProfitDistributionPolicy,
  assertValidWorld,
  cloneWorld,
  closeFinancePeriod,
  createEconomyWorld,
  designatedCashTotal,
  deserializeWorld,
  hashWorld,
  postJournalEntry,
  runProfitDistributionPhase,
  serializeWorld,
} from "@century/sim";
import {
  M5A_COUNTRY_B,
  M5A_STATE_BUILDING,
  M5A_TREASURY_B,
  m5aScenario,
  runM5aMonth,
  tickM5a,
} from "../fixtures/m5a.js";
import { m5Scenario } from "../fixtures/m5.js";

function account(
  world: ReturnType<typeof createEconomyWorld>,
  ownerKind: "building" | "popBlock" | "country",
  ownerId: number,
  subtype: string,
) {
  return world.finance.accounts.find(
    (candidate) =>
      candidate.ownerKind === ownerKind &&
      candidate.ownerId === ownerId &&
      candidate.subtype === subtype,
  );
}

describe("M5a profit distribution and state-enterprise remittance", () => {
  test("reclassifies private profit, distributes half, and retains the rest", () => {
    const scenario = m5aScenario();
    const { world, last } = runM5aMonth(scenario);
    const allocation = last.economy?.profitDistribution;
    expect(allocation).toBeDefined();
    if (allocation === null || allocation === undefined) return;
    expect(allocation.applied).toBe(true);
    const building = allocation.buildings.find((entry) => entry.buildingId === 0);
    expect(building).toBeDefined();
    if (building === undefined) return;
    expect(building.periodNetRUSD).toBeGreaterThan(0);
    expect(building.distributedRUSD).toBeCloseTo(building.periodNetRUSD * 0.5, 6);
    expect(building.retainedProfitAfterRUSD).toBeCloseTo(
      building.periodNetRUSD - building.distributedRUSD,
      6,
    );
    expect(account(world, "building", 0, "retained-profit")?.balanceRUSD).toBeCloseTo(
      building.retainedProfitAfterRUSD,
      6,
    );
    expect(account(world, "building", 0, "owner-equity")?.balanceRUSD).toBeCloseTo(5_000, 6);
    expect(account(world, "popBlock", 0, "owner-equity")?.balanceRUSD ?? 0).toBeGreaterThan(0);
    assertAccountingIdentity(world.finance);
    assertValidWorld(world);
  });

  test("remits state-enterprise profit to the owning country treasury", () => {
    const scenario = m5aScenario();
    const { world, last } = runM5aMonth(scenario);
    const allocation = last.economy?.profitDistribution;
    expect(allocation).toBeDefined();
    if (allocation === null || allocation === undefined) return;
    const state = allocation.buildings.find((entry) => entry.buildingId === M5A_STATE_BUILDING);
    expect(state).toBeDefined();
    if (state === undefined) return;
    expect(state.ownerKind).toBe("state");
    expect(state.ownerId).toBe(M5A_COUNTRY_B);
    expect(state.periodNetRUSD).toBeGreaterThan(0);
    expect(state.distributedRUSD).toBeCloseTo(state.periodNetRUSD, 6);
    const treasury = account(world, "country", M5A_COUNTRY_B, "treasury-cash");
    expect(treasury).toBeDefined();
    expect(treasury?.balanceRUSD ?? 0).toBeGreaterThan(10_000);
    expect(account(world, "country", M5A_COUNTRY_B, "treasury-cash")?.id).toBe(M5A_TREASURY_B);
    assertValidWorld(world);
  });

  test("keeps loss-making buildings at a negative retained result without cash movement", () => {
    const scenario = m5aScenario();
    const { world, last } = runM5aMonth(scenario);
    const allocation = last.economy?.profitDistribution;
    expect(allocation).toBeDefined();
    if (allocation === null || allocation === undefined) return;
    const loss = allocation.buildings.find((entry) => entry.periodNetRUSD < 0);
    expect(loss).toBeDefined();
    if (loss === undefined) return;
    expect(loss.distributedRUSD).toBe(0);
    expect(loss.retainedProfitAfterRUSD).toBeCloseTo(loss.periodNetRUSD, 6);
    expect(account(world, "building", loss.buildingId, "retained-profit")?.balanceRUSD).toBeCloseTo(
      loss.periodNetRUSD,
      6,
    );
  });

  test("rejects duplicate allocation against the same close result", () => {
    const scenario = m5aScenario();
    const world = createEconomyWorld(scenario, { seed: 20_261_023 });
    world.dayIndex = 30;
    const close = closeFinancePeriod(world);
    runProfitDistributionPhase(world, 30, close);
    const before = JSON.stringify(world.finance);
    expect(() => runProfitDistributionPhase(world, 30, close)).toThrow(/already been applied/);
    expect(JSON.stringify(world.finance)).toBe(before);
  });

  test("caps distribution at available operating cash", () => {
    const scenario = m5aScenario();
    const world = createEconomyWorld(scenario, { seed: 20_261_023 });
    world.dayIndex = 30;
    const close = closeFinancePeriod(world);
    // Set one building's state to a large retained profit with only 100 RUSD cash
    // while preserving the accounting identity: assets 100 = equity (1000 - 900).
    const cash = world.finance.accounts.find(
      (candidate) =>
        candidate.ownerKind === "building" &&
        candidate.ownerId === 0 &&
        candidate.subtype === "operating-cash",
    );
    const equity = account(world, "building", 0, "owner-equity");
    const retained = account(world, "building", 0, "retained-profit");
    if (cash === undefined || equity === undefined || retained === undefined) {
      throw new Error("missing building 0 accounts");
    }
    cash.balanceRUSD = 100;
    equity.balanceRUSD = -900;
    retained.balanceRUSD = 1_000;
    assertAccountingIdentity(world.finance);
    const result = runProfitDistributionPhase(world, 30, close);
    const building = result.buildings.find((entry) => entry.buildingId === 0);
    expect(building).toBeDefined();
    if (building === undefined) return;
    expect(building.distributableRUSD).toBeCloseTo(1_000, 6);
    expect(building.distributedRUSD).toBeCloseTo(100, 6);
    expect(building.retainedProfitAfterRUSD).toBeCloseTo(900, 6);
    expect(account(world, "building", 0, "operating-cash")?.balanceRUSD).toBeCloseTo(0, 6);
    expect(account(world, "building", 0, "retained-profit")?.balanceRUSD).toBeCloseTo(900, 6);
    assertAccountingIdentity(world.finance);
  });

  test("rejects a missing retained-profit account without mutating finance", () => {
    const scenario = m5aScenario();
    const world = createEconomyWorld(scenario, { seed: 20_261_023 });
    world.dayIndex = 30;
    const close = closeFinancePeriod(world);
    const financeBefore = JSON.stringify(world.finance);
    world.finance.accounts = world.finance.accounts.filter(
      (candidate) => !(candidate.ownerKind === "building" && candidate.subtype === "retained-profit"),
    );
    const broken = JSON.stringify(world.finance);
    expect(() => runProfitDistributionPhase(world, 30, close)).toThrow();
    expect(JSON.stringify(world.finance)).toBe(broken);
    expect(financeBefore).not.toBe(broken);
  });

  test("does not change the M4b four flow kinds or summaries", () => {
    const scenario = m5aScenario();
    const { world, last } = runM5aMonth(scenario);
    const close = last.economy?.financeClose;
    expect(close).toBeDefined();
    if (close === null || close === undefined) return;
    expect(Object.keys(close.summary.flowTotalsByKind).sort()).toEqual([
      "goods-purchase",
      "input-purchase",
      "upkeep",
      "wages",
    ]);
    expect(world.finance.periodSummaries).toHaveLength(1);
    expect(world.finance.closedThroughDay).toBe(30);
    assertAccountingIdentity(world.finance);
  });

  test("round-trips and resumes identically after allocation", () => {
    const scenario = m5aScenario();
    const { world } = runM5aMonth(scenario);
    const saved = serializeWorld(world);
    const restored = deserializeWorld(saved);
    expect(hashWorld(restored)).toBe(hashWorld(world));
    const direct = cloneWorld(world);
    tickM5a(restored, scenario, 5);
    tickM5a(direct, scenario, 5);
    expect(hashWorld(restored)).toBe(hashWorld(direct));
    expect(designatedCashTotal(restored.finance)).toBeCloseTo(
      designatedCashTotal(direct.finance),
      6,
    );
  });

  test("runs deterministically and independently of declaration order", () => {
    const scenario = m5aScenario();
    const first = createEconomyWorld(scenario, { seed: 7 });
    const second = createEconomyWorld(
      {
        ...scenario,
        population: {
          ...scenario.population,
          popBlocks: [...scenario.population.popBlocks].reverse(),
        },
        buildingInstances: [...scenario.buildingInstances].reverse(),
      },
      { seed: 7 },
    );
    tickM5a(first, scenario, 31);
    tickM5a(second, scenario, 31);
    expect(hashWorld(second)).toBe(hashWorld(first));
  });

  test("does not distribute when the policy is disabled", () => {
    const scenario = m5aScenario();
    scenario.profitDistribution = {
      enabled: false,
      privatePayoutRate: 0.5,
      stateRemittanceRate: 1,
    };
    // A disabled policy cannot coexist with the fixture's state-owned building.
    scenario.buildingInstances = scenario.buildingInstances.map((building) =>
      building.id === M5A_STATE_BUILDING
        ? { ...building, ownerKind: "private", ownerAccountId: 104 }
        : building,
    );
    const { world, last } = runM5aMonth(scenario);
    expect(last.economy?.profitDistribution?.applied).toBe(false);
    expect(
      world.finance.accounts.some((candidate) => candidate.subtype === "retained-profit"),
    ).toBe(false);
  });

  test("rejects state ownership while the policy is disabled", () => {
    const scenario = m5aScenario();
    scenario.profitDistribution = {
      enabled: false,
      privatePayoutRate: 0.5,
      stateRemittanceRate: 1,
    };
    expect(() => createEconomyWorld(scenario)).toThrow(/state-owned but the M5a/);
  });

  test("validates profit-allocation posting structure", () => {
    const scenario = m5aScenario();
    const world = createEconomyWorld(scenario, { seed: 20_261_023 });
    const buildingEquity = account(world, "building", 0, "owner-equity");
    const retained = account(world, "building", 0, "retained-profit");
    const operating = account(world, "building", 0, "operating-cash");
    const householdCash = account(world, "popBlock", 0, "household-cash");
    const householdEquity = account(world, "popBlock", 0, "owner-equity");
    const treasury = account(world, "country", M5A_COUNTRY_B, "treasury-cash");
    const countryEquity = account(world, "country", M5A_COUNTRY_B, "owner-equity");
    const stateRetained = account(world, "building", M5A_STATE_BUILDING, "retained-profit");
    const stateOperating = account(world, "building", M5A_STATE_BUILDING, "operating-cash");
    for (const value of [
      buildingEquity,
      retained,
      operating,
      householdCash,
      householdEquity,
      treasury,
      countryEquity,
      stateRetained,
      stateOperating,
    ]) {
      expect(value).toBeDefined();
    }
    if (
      buildingEquity === undefined ||
      retained === undefined ||
      operating === undefined ||
      householdCash === undefined ||
      householdEquity === undefined ||
      treasury === undefined ||
      countryEquity === undefined ||
      stateRetained === undefined ||
      stateOperating === undefined
    ) {
      return;
    }

    expect(() =>
      postJournalEntry(world.finance, 30, "profit-retention", [
        { accountId: buildingEquity.id, side: "debit", amountRUSD: 10 },
        { accountId: retained.id, side: "credit", amountRUSD: 10 },
      ]),
    ).not.toThrow();
    expect(() =>
      postJournalEntry(world.finance, 30, "profit-distribution", [
        { accountId: retained.id, side: "debit", amountRUSD: 10 },
        { accountId: operating.id, side: "credit", amountRUSD: 10 },
        { accountId: householdCash.id, side: "debit", amountRUSD: 10 },
        { accountId: householdEquity.id, side: "credit", amountRUSD: 10 },
      ]),
    ).not.toThrow();
    expect(() =>
      postJournalEntry(world.finance, 30, "state-enterprise-remittance", [
        { accountId: stateRetained.id, side: "debit", amountRUSD: 10 },
        { accountId: stateOperating.id, side: "credit", amountRUSD: 10 },
        { accountId: treasury.id, side: "debit", amountRUSD: 10 },
        { accountId: countryEquity.id, side: "credit", amountRUSD: 10 },
      ]),
    ).not.toThrow();

    expect(() =>
      postJournalEntry(world.finance, 30, "profit-retention", [
        { accountId: buildingEquity.id, side: "credit", amountRUSD: 10 },
        { accountId: retained.id, side: "credit", amountRUSD: 10 },
      ]),
    ).toThrow(/opposite sides|unbalanced/);
    expect(() =>
      postJournalEntry(world.finance, 30, "profit-distribution", [
        { accountId: retained.id, side: "debit", amountRUSD: 10 },
        { accountId: operating.id, side: "credit", amountRUSD: 10 },
        { accountId: treasury.id, side: "debit", amountRUSD: 10 },
        { accountId: householdEquity.id, side: "credit", amountRUSD: 10 },
      ]),
    ).toThrow(/household-cash debit/);
    expect(() =>
      postJournalEntry(world.finance, 30, "state-enterprise-remittance", [
        { accountId: stateRetained.id, side: "debit", amountRUSD: 10 },
        { accountId: stateOperating.id, side: "credit", amountRUSD: 10 },
        { accountId: householdCash.id, side: "debit", amountRUSD: 10 },
        { accountId: countryEquity.id, side: "credit", amountRUSD: 10 },
      ]),
    ).toThrow(/treasury-cash debit/);
    assertAccountingIdentity(world.finance);
  });

  test("rejects invalid policy rates", () => {
    expect(() =>
      assertValidProfitDistributionPolicy(
        { enabled: true, privatePayoutRate: 1.5, stateRemittanceRate: 1 },
        "policy",
      ),
    ).toThrow(/privatePayoutRate/);
    expect(() =>
      assertValidProfitDistributionPolicy(
        { enabled: true, privatePayoutRate: 0.5, stateRemittanceRate: -0.1 },
        "policy",
      ),
    ).toThrow(/stateRemittanceRate/);
  });

  test("creates retained-profit accounts only when enabled", () => {
    const enabled = createEconomyWorld(m5aScenario(), { seed: 1 });
    expect(
      enabled.finance.accounts.filter((candidate) => candidate.subtype === "retained-profit"),
    ).toHaveLength(enabled.buildings.length);
    const scenario = m5aScenario();
    scenario.profitDistribution = {
      enabled: false,
      privatePayoutRate: 0.5,
      stateRemittanceRate: 1,
    };
    scenario.buildingInstances = scenario.buildingInstances.map((building) =>
      building.id === M5A_STATE_BUILDING
        ? { ...building, ownerKind: "private", ownerAccountId: 104 }
        : building,
    );
    const disabled = createEconomyWorld(scenario, { seed: 1 });
    expect(
      disabled.finance.accounts.filter((candidate) => candidate.subtype === "retained-profit"),
    ).toHaveLength(0);
  });

  test("rejects a state building owned by the wrong country or a household", () => {
    const wrongCountry = m5aScenario();
    wrongCountry.buildingInstances = wrongCountry.buildingInstances.map((building) =>
      building.id === M5A_STATE_BUILDING
        ? { ...building, ownerAccountId: 9000 }
        : building,
    );
    expect(() => createEconomyWorld(wrongCountry)).toThrow(/same country/);

    const household = m5aScenario();
    household.buildingInstances = household.buildingInstances.map((building) =>
      building.id === M5A_STATE_BUILDING
        ? { ...building, ownerAccountId: 100 }
        : building,
    );
    expect(() => createEconomyWorld(household)).toThrow(/treasury account/);
  });

  test("rejects a retained-profit account when the policy is disabled", () => {
    const world = createEconomyWorld(m5Scenario(), { seed: 1 });
    const retainedId = world.finance.nextAccountId;
    world.finance.nextAccountId += 1;
    world.finance.accounts.push({
      id: retainedId,
      ownerKind: "building",
      ownerId: 0,
      category: "equity",
      subtype: "retained-profit",
      balanceRUSD: 0,
    });
    expect(() => assertValidWorld(world)).toThrow(/retained-profit/);
  });
});
