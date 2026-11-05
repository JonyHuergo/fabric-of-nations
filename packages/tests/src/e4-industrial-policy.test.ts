/**
 * E4 industrial policy, construction materials/procurement, and public-enterprise
 * support (D-075). These tests cross the simulation, accounting, worker-snapshot,
 * and player-action boundaries rather than testing isolated helpers.
 */

import {
  applyCountryAction,
  asRusdPerCurrencyUnit,
  assertAccountingIdentity,
  assertValidWorld,
  constructionMaterialRemaining,
  createEconomyWorld,
  designatedCashTotal,
  deserializeWorld,
  governmentPeriodTotals,
  hashWorld,
  runConstructionPhase,
  serializeWorld,
  tick,
  validateCountryAction,
  type CountryAction,
  type EconomyScenarioDef,
  type TickContext,
  type World,
} from "@century/sim";
import { loadM3SmallEconomy } from "@century/data";
import {
  PROTOCOL_VERSION,
  parseWorkerEvent,
  RUSD_MONEY_TEXT,
  previewConstruction,
  previewIndustrialPolicy,
  previewPublicEnterpriseSupport,
} from "@century/sim-worker";
import { buildSimulationSnapshot } from "@century/sim-worker/snapshot";

const SEED = 20_261_024;
const COUNTRY = 0;
const REGION = 0;
const FARM = 0;
const PRIVATE_BUILDING = 0;

interface Fixture {
  readonly scenario: EconomyScenarioDef;
  readonly world: World;
  readonly context: TickContext;
}

function fixture(): Fixture {
  const scenario = loadM3SmallEconomy();
  scenario.countries = [
    {
      id: COUNTRY,
      tag: "TST",
      name: "Test Country",
      monetary: { kind: "own", currencyId: 0 },
      provinceIds: [REGION],
      treasuryAccountId: 1000,
      initialTreasuryCashRUSD: 100_000,
      fiscal: { incomeTaxRate: 0, welfareBudgetRUSDPerYear: 0 },
    },
  ];
  scenario.currencies = [
    {
      id: 0,
      key: "tst",
      name: "Test Currency",
      issuer: { kind: "country", countryId: COUNTRY },
    },
  ];
  scenario.currencyValuations = [
    {
      currencyId: 0,
      status: "specified",
      rusdPerUnit: asRusdPerCurrencyUnit(1),
      setOnDay: 0,
      source: "scenario",
    },
  ];
  scenario.profitDistribution = {
    enabled: true,
    privatePayoutRate: 0.5,
    stateRemittanceRate: 1,
  };
  scenario.playerCountryId = COUNTRY;
  const world = createEconomyWorld(scenario, { seed: SEED });
  const context: TickContext = {
    population: { definitions: scenario.population.definitions },
    economy: { definitions: scenario.definitions },
  };
  return { scenario, world, context };
}

function run(f: Fixture, count: number): void {
  for (let index = 0; index < count; index += 1) tick(f.world, f.context);
}

function project(world: World, projectId: number) {
  const found = world.construction.projects.find((entry) => entry.id === projectId);
  if (found === undefined) throw new Error(`missing project ${String(projectId)}`);
  return found;
}

function accountBalance(
  world: World,
  ownerKind: "country" | "building" | "popBlock",
  ownerId: number,
  subtype: string,
): number {
  const account = world.finance.accounts.find(
    (entry) =>
      entry.ownerKind === ownerKind && entry.ownerId === ownerId && entry.subtype === subtype,
  );
  if (account === undefined) throw new Error(`missing ${ownerKind} ${String(ownerId)} ${subtype}`);
  return account.balanceRUSD;
}

function startFarm(f: Fixture): number {
  const action: CountryAction = {
    kind: "start-construction",
    countryId: COUNTRY,
    dayIndex: f.world.dayIndex,
    source: "player",
    provinceId: REGION,
    definitionId: FARM,
  };
  const validation = validateCountryAction(f.world, action, f.scenario.definitions);
  if (!validation.valid) throw new Error(validation.errors.join("; "));
  const applied = applyCountryAction(f.world, action, f.scenario.definitions);
  if (applied.constructionProject === null) throw new Error("project not created");
  return applied.constructionProject.id;
}

function runToCompletion(f: Fixture, projectId: number): void {
  for (let index = 0; index < 200; index += 1) {
    if (project(f.world, projectId).status === "completed") return;
    run(f, 1);
  }
  throw new Error("project did not complete");
}

function policyAction(rates: readonly number[]): CountryAction {
  return {
    kind: "set-industrial-policy",
    countryId: COUNTRY,
    dayIndex: 0,
    source: "player",
    sectorSubsidyRates: rates,
  };
}

function supportAction(buildingId: number, amountRUSD: number): CountryAction {
  return {
    kind: "support-public-enterprise",
    countryId: COUNTRY,
    dayIndex: 0,
    source: "player",
    buildingId,
    amountRUSD,
  };
}

function withDay(f: Fixture, action: CountryAction): CountryAction {
  return { ...action, dayIndex: f.world.dayIndex } as CountryAction;
}

function snapshotOf(f: Fixture) {
  return buildSimulationSnapshot(
    f.world,
    f.scenario.definitions,
    { sequence: 1, running: false, speedDaysPerSecond: 1, achievedDaysPerSecond: 0 },
    f.scenario.population.definitions,
  );
}

describe("E4 sector classification and construction materials", () => {
  test("validated sectors and existing-good material requirements reach the snapshot", () => {
    const f = fixture();
    const snapshot = snapshotOf(f);
    const farm = snapshot.projectTypes.find((type) => type.definitionId === FARM)!;
    expect(farm.sector).toBe("agriculture");
    expect(farm.materials.length).toBeGreaterThan(0);
    expect(farm.materials.every((material) => material.quantity > 0)).toBe(true);
    const sectors = snapshot.countries[COUNTRY]!.industrialPolicy.sectors;
    expect(sectors).toHaveLength(5);
    expect(sectors.map((sector) => sector.key)).toEqual([
      "agriculture",
      "food-processing",
      "textiles",
      "manufacturing",
      "storage",
    ]);
  });

  test("construction buys real market materials and capitalizes them", () => {
    const f = fixture();
    const projectId = startFarm(f);
    run(f, 2);
    const started = project(f.world, projectId);
    expect(started.materialsSpentRUSD).toBeGreaterThan(0);
    expect(started.materials.every((material) => material.deliveredQuantity > 0)).toBe(true);
    expect(accountBalance(f.world, "country", COUNTRY, "construction-in-progress")).toBeCloseTo(
      started.spentRUSD + started.materialsSpentRUSD,
      6,
    );
    runToCompletion(f, projectId);
    const completed = project(f.world, projectId);
    expect(completed.status).toBe("completed");
    expect(
      completed.materials.every((material) =>
        constructionMaterialRemaining(material) <= 1e-9,
      ),
    ).toBe(true);
    expect(accountBalance(f.world, "country", COUNTRY, "public-capital")).toBeCloseTo(
      completed.spentRUSD + completed.materialsSpentRUSD,
      6,
    );
    expect(accountBalance(f.world, "country", COUNTRY, "construction-in-progress")).toBe(0);
    expect(
      f.world.finance.budgetMemosThisMonth[COUNTRY]?.constructionMaterialsSpentRUSD ??
        0,
    ).toBeCloseTo(completed.materialsSpentRUSD, 6);
    expect(
      f.world.finance.budgetMemosThisMonth[COUNTRY]?.constructionSpentRUSD ?? 0,
    ).toBeCloseTo(completed.spentRUSD + completed.materialsSpentRUSD, 6);
    expect(() => assertAccountingIdentity(f.world.finance)).not.toThrow();
    expect(designatedCashTotal(f.world.finance)).toBeGreaterThan(0);
  });

  test("replaying the same construction day cannot duplicate a material delivery", () => {
    const f = fixture();
    const projectId = startFarm(f);
    const grainBefore = f.world.markets[0]!.stockLots
      .filter((lot) => lot.goodId === 0)
      .reduce((total, lot) => total + lot.quantity, 0);
    const sellerRevenueBefore = f.world.finance.accounts
      .filter(
        (account) =>
          account.ownerKind === "building" && account.subtype === "sales-revenue",
      )
      .reduce((total, account) => total + account.balanceRUSD, 0);
    f.world.dayIndex = 1;
    runConstructionPhase(f.world, f.scenario.definitions, 1, undefined, {
      validateWorld: false,
    });
    const first = project(f.world, projectId);
    const delivered = first.materials.map((material) => material.deliveredQuantity);
    const spent = first.materialsSpentRUSD;
    expect(spent).toBeGreaterThan(0);
    const grainAfter = f.world.markets[0]!.stockLots
      .filter((lot) => lot.goodId === 0)
      .reduce((total, lot) => total + lot.quantity, 0);
    expect(grainBefore - grainAfter).toBeCloseTo(
      first.materials.find((material) => material.goodId === 0)!.deliveredQuantity,
      6,
    );
    const sellerRevenueAfter = f.world.finance.accounts
      .filter(
        (account) =>
          account.ownerKind === "building" && account.subtype === "sales-revenue",
      )
      .reduce((total, account) => total + account.balanceRUSD, 0);
    expect(sellerRevenueAfter - sellerRevenueBefore).toBeCloseTo(spent, 6);
    runConstructionPhase(f.world, f.scenario.definitions, 1, undefined, {
      validateWorld: false,
    });
    const second = project(f.world, projectId);
    expect(second.materials.map((material) => material.deliveredQuantity)).toEqual(delivered);
    expect(second.materialsSpentRUSD).toBeCloseTo(spent, 6);
    expect(
      f.world.markets[0]!.stockLots
        .filter((lot) => lot.goodId === 0)
        .reduce((total, lot) => total + lot.quantity, 0),
    ).toBeCloseTo(grainAfter, 6);
  });

  test("a material shortage waits and resumes when actual stock arrives", () => {
    const f = fixture();
    // Remove the farm's grain material from the market. This is a shortage of
    // actual goods, not a fake order or a negative stock.
    const market = f.world.markets[0]!;
    const grainBefore = market.stockLots
      .filter((lot) => lot.goodId === 0)
      .reduce((total, lot) => total + lot.quantity, 0);
    market.stockLots = market.stockLots.filter((lot) => lot.goodId !== 0);
    const projectId = startFarm(f);

    // Run construction directly at a synthetic next day so market clearing cannot
    // refill the missing good within the same test step.
    f.world.dayIndex = 1;
    runConstructionPhase(f.world, f.scenario.definitions, 1, undefined, {
      validateWorld: false,
    });
    const waiting = project(f.world, projectId);
    expect(waiting.status).toBe("waiting");
    expect(waiting.blockedReason).toBe("materials");
    expect(waiting.spentRUSD).toBe(0);
    expect(waiting.materialsSpentRUSD).toBe(0);

    // Deliver actual grain stock through an existing operational warehouse seller.
    f.world.markets[0]!.stockLots.push({
      goodId: 0,
      ownerBuildingId: 7,
      quantity: 1_000_000,
    });
    f.world.dayIndex = 2;
    runConstructionPhase(f.world, f.scenario.definitions, 2, undefined, {
      validateWorld: false,
    });
    const resumed = project(f.world, projectId);
    expect(resumed.materialsSpentRUSD).toBeGreaterThan(0);
    expect(resumed.materials.every((material) => material.deliveredQuantity > 0)).toBe(true);
    expect(grainBefore).toBeGreaterThanOrEqual(0);
  });
});

describe("E4 sectoral production subsidy", () => {
  test("a validated policy pays verified output from cash and reports the exact split", () => {
    const f = fixture();
    run(f, 2);
    const action = withDay(f, policyAction([0.1, 0, 0, 0, 0]));
    expect(validateCountryAction(f.world, action, f.scenario.definitions).valid).toBe(true);
    const applied = applyCountryAction(f.world, action, f.scenario.definitions);
    expect(applied.changed).toBe(true);
    expect(applied.industrialPolicy?.sectorSubsidyRates[0]).toBe(0.1);
    const beforeTreasury = accountBalance(f.world, "country", COUNTRY, "treasury-cash");
    run(f, 1);
    const subsidyExpense = accountBalance(f.world, "country", COUNTRY, "subsidy-expense");
    const afterTreasury = accountBalance(f.world, "country", COUNTRY, "treasury-cash");
    expect(subsidyExpense).toBeGreaterThan(0);
    expect(afterTreasury).toBeLessThan(beforeTreasury);
    const memo = f.world.finance.budgetMemosThisMonth[COUNTRY]!;
    expect(memo.subsidyRequestedRUSD).toBeGreaterThan(0);
    expect(memo.subsidyRequestedRUSD - memo.subsidyShortfallRUSD).toBeCloseTo(
      subsidyExpense,
      6,
    );
    expect(
      f.world.finance.accounts.some(
        (account) =>
          account.ownerKind === "building" &&
          account.subtype === "subsidy-revenue" &&
          account.balanceRUSD > 0,
      ),
    ).toBe(true);
    expect(() => assertAccountingIdentity(f.world.finance)).not.toThrow();
  });

  test("a cash-constrained subsidy reports a shortfall and never overdraws", () => {
    const f = fixture();
    run(f, 2);
    // Drain treasury to a token amount while preserving the accounting identity.
    const treasury = f.world.finance.accounts.find(
      (account) =>
        account.ownerKind === "country" &&
        account.ownerId === COUNTRY &&
        account.subtype === "treasury-cash",
    )!;
    const equity = f.world.finance.accounts.find(
      (account) =>
        account.ownerKind === "country" &&
        account.ownerId === COUNTRY &&
        account.subtype === "owner-equity",
    )!;
    const drain = treasury.balanceRUSD - 0.01;
    treasury.balanceRUSD -= drain;
    equity.balanceRUSD -= drain;
    assertValidWorld(f.world);
    const action = withDay(f, policyAction([1, 0, 0, 0, 0]));
    applyCountryAction(f.world, action, f.scenario.definitions);
    run(f, 1);
    expect(accountBalance(f.world, "country", COUNTRY, "treasury-cash")).toBeGreaterThanOrEqual(0);
    const memo = f.world.finance.budgetMemosThisMonth[COUNTRY]!;
    expect(memo.subsidyRequestedRUSD).toBeGreaterThan(0);
    expect(memo.subsidyShortfallRUSD).toBeGreaterThan(0);
    expect(memo.subsidyRequestedRUSD - memo.subsidyShortfallRUSD).toBeCloseTo(
      accountBalance(f.world, "country", COUNTRY, "subsidy-expense"),
      6,
    );
    expect(() => assertAccountingIdentity(f.world.finance)).not.toThrow();
  });

  test("invalid rates and AI authorization are rejected atomically", () => {
    const f = fixture();
    const before = hashWorld(f.world);
    const invalid = [
      withDay(f, policyAction([0.1, 0])),
      withDay(f, policyAction([2, 0, 0, 0, 0])),
      withDay(f, { ...policyAction([0.1, 0, 0, 0, 0]), source: "ai" }),
    ];
    for (const action of invalid) {
      expect(validateCountryAction(f.world, action, f.scenario.definitions).valid).toBe(false);
      expect(() => applyCountryAction(f.world, action, f.scenario.definitions)).toThrow();
      expect(hashWorld(f.world)).toBe(before);
    }
  });
});

describe("E4 public-enterprise support", () => {
  test("capital support moves treasury cash into enterprise cash/equity, not expense", () => {
    const f = fixture();
    const projectId = startFarm(f);
    runToCompletion(f, projectId);
    const buildingId = project(f.world, projectId).buildingId!;
    const action = withDay(f, supportAction(buildingId, 500));
    expect(validateCountryAction(f.world, action, f.scenario.definitions).valid).toBe(true);
    const beforeCash = designatedCashTotal(f.world.finance);
    const beforeTreasury = accountBalance(f.world, "country", COUNTRY, "treasury-cash");
    const beforeCountryEquity = accountBalance(f.world, "country", COUNTRY, "owner-equity");
    const beforeBuildingCash = accountBalance(f.world, "building", buildingId, "operating-cash");
    const beforeBuildingEquity = accountBalance(f.world, "building", buildingId, "owner-equity");
    const beforeSubsidy = accountBalance(f.world, "country", COUNTRY, "subsidy-expense");
    const applied = applyCountryAction(f.world, action, f.scenario.definitions);
    expect(applied.publicEnterpriseSupport?.amountRUSD).toBe(500);
    expect(accountBalance(f.world, "country", COUNTRY, "treasury-cash")).toBeCloseTo(
      beforeTreasury - 500,
      6,
    );
    expect(accountBalance(f.world, "country", COUNTRY, "owner-equity")).toBeCloseTo(
      beforeCountryEquity - 500,
      6,
    );
    expect(accountBalance(f.world, "building", buildingId, "operating-cash")).toBeCloseTo(
      beforeBuildingCash + 500,
      6,
    );
    expect(accountBalance(f.world, "building", buildingId, "owner-equity")).toBeCloseTo(
      beforeBuildingEquity + 500,
      6,
    );
    expect(accountBalance(f.world, "country", COUNTRY, "subsidy-expense")).toBeCloseTo(
      beforeSubsidy,
      6,
    );
    expect(designatedCashTotal(f.world.finance)).toBeCloseTo(beforeCash, 6);
    expect(
      f.world.finance.budgetMemosThisMonth[COUNTRY]?.publicEnterpriseSupportRUSD ?? 0,
    ).toBeCloseTo(500, 6);
    expect(() => assertAccountingIdentity(f.world.finance)).not.toThrow();
  });

  test("support rejects private, foreign, and unaffordable targets atomically", () => {
    const f = fixture();
    const privateAction = withDay(f, supportAction(PRIVATE_BUILDING, 100));
    expect(
      validateCountryAction(f.world, privateAction, f.scenario.definitions).valid,
    ).toBe(false);
    expect(() =>
      applyCountryAction(f.world, privateAction, f.scenario.definitions),
    ).toThrow();

    const f2 = fixture();
    const projectId = startFarm(f2);
    runToCompletion(f2, projectId);
    const buildingId = project(f2.world, projectId).buildingId!;
    const tooLarge = withDay(f2, supportAction(buildingId, 1_000_000_000));
    expect(validateCountryAction(f2.world, tooLarge, f2.scenario.definitions).valid).toBe(false);
    const ai = withDay(f2, {
      ...supportAction(buildingId, 100),
      source: "ai",
    });
    expect(validateCountryAction(f2.world, ai, f2.scenario.definitions).valid).toBe(false);
    expect(() => applyCountryAction(f2.world, ai, f2.scenario.definitions)).toThrow();
  });
});

describe("E4 integration, snapshots, and persistence", () => {
  test("snapshot previews expose material, sector, and enterprise decisions", () => {
    const f = fixture();
    const projectId = startFarm(f);
    runToCompletion(f, projectId);
    const snapshot = snapshotOf(f);
    const country = snapshot.countries[COUNTRY]!;
    const preview = previewConstruction(snapshot, country, FARM, REGION, RUSD_MONEY_TEXT);
    expect(preview.materials.length).toBeGreaterThan(0);
    expect(preview.estimatedMaterialsCostRUSD).toBeGreaterThan(0);
    expect(preview.totalInvestmentRUSD).toBeGreaterThan(preview.upfrontRequirementRUSD);
    expect(country.publicEnterprises.length).toBeGreaterThan(0);
    const enterprise = country.publicEnterprises[0]!;
    const supportPreview = previewPublicEnterpriseSupport(
      snapshot,
      country,
      enterprise.buildingId,
      500,
    );
    expect(supportPreview.valid).toBe(true);
    const industrial = previewIndustrialPolicy(
      snapshot,
      country,
      country.industrialPolicy.sectors.map((sector) => sector.subsidyRate),
    );
    expect(industrial.valid).toBe(true);
    expect(industrial.sectors).toHaveLength(5);
    expect(() =>
      parseWorkerEvent({
        protocolVersion: PROTOCOL_VERSION,
        type: "READY",
        snapshot,
      }),
    ).not.toThrow();
  });

  test("save/load and replay preserve policy, materials, and support state", () => {
    const f = fixture();
    const projectId = startFarm(f);
    run(f, 5);
    const policy = withDay(f, policyAction([0.05, 0.02, 0, 0, 0]));
    applyCountryAction(f.world, policy, f.scenario.definitions);
    run(f, 1);
    const saved = serializeWorld(f.world);
    const restored = deserializeWorld(saved);
    expect(hashWorld(restored)).toBe(hashWorld(f.world));
    expect(restored.countries[COUNTRY]!.industrial.sectorSubsidyRates[0]).toBe(0.05);
    expect(restored.construction.projects[0]!.materials).toEqual(
      f.world.construction.projects[0]!.materials,
    );

    runToCompletion(f, projectId);
    const other = deserializeWorld(saved);
    for (let index = 0; index < 200; index += 1) {
      if (project(other, projectId).status === "completed") break;
      tick(other, f.context);
    }
    expect(hashWorld(other)).toBe(hashWorld(f.world));
  });

  test("monthly and annual reports reconcile subsidy and capital support", () => {
    const f = fixture();
    const projectId = startFarm(f);
    runToCompletion(f, projectId);
    const buildingId = project(f.world, projectId).buildingId!;
    applyCountryAction(
      f.world,
      withDay(f, supportAction(buildingId, 500)),
      f.scenario.definitions,
    );
    const policy = withDay(f, policyAction([0.1, 0, 0, 0, 0]));
    applyCountryAction(f.world, policy, f.scenario.definitions);
    run(f, 31);
    const month = f.world.finance.periodSummaries[0]!;
    const fiscal = governmentPeriodTotals(f.world.finance, month).find(
      (entry) => entry.countryId === COUNTRY,
    )!;
    const budget = month.countryBudgetTotals[COUNTRY]!;
    expect(budget.constructionMaterialsSpentRUSD).toBeGreaterThanOrEqual(0);
    expect(budget.publicEnterpriseSupportRUSD).toBeCloseTo(500, 6);
    expect(fiscal.subsidyExpenseRUSD).toBeCloseTo(
      budget.subsidyRequestedRUSD - budget.subsidyShortfallRUSD,
      6,
    );
    expect(fiscal.netFiscalResultRUSD).toBeCloseTo(
      fiscal.incomeTaxRevenueRUSD +
        fiscal.businessTaxRevenueRUSD -
        fiscal.welfareExpenseRUSD -
        fiscal.interestExpenseRUSD -
        fiscal.subsidyExpenseRUSD,
      6,
    );
  });
});
