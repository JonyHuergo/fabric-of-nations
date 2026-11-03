/**
 * E3 public construction (D-074).
 *
 * These tests run projects through the integrated daily pipeline: authorization,
 * idle-labor hiring, multi-day payroll/progress, completion into a real
 * state-owned building, production after completion, cancellation/pause, funding
 * and labor stalls, accounting, reporting, and save/replay.
 */

import {
  CAMPAIGN_TERMINAL_DAY_INDEX,
  applyCountryAction,
  asRusdPerCurrencyUnit,
  assertAccountingIdentity,
  assertValidWorld,
  constructionPlannedJobs,
  createEconomyWorld,
  designatedCashTotal,
  deserializeWorld,
  governmentPeriodTotals,
  hashWorld,
  initialLiteracyByAge,
  runConstructionPhase,
  serializeWorld,
  tick,
  validateCountryAction,
  type CountryAction,
  type ConstructionProject,
  type EconomyScenarioDef,
  type TickContext,
  type World,
} from "@century/sim";
import { loadM3SmallEconomy } from "@century/data";
import {
  PROTOCOL_VERSION,
  parseWorkerEvent,
  previewConstruction,
} from "@century/sim-worker";
import { buildSimulationSnapshot } from "@century/sim-worker/snapshot";

const SEED = 20_261_023;
const COUNTRY = 0;
const REGION = 0;
const FARM = 0;
const WAREHOUSE = 7;

interface Fixture {
  readonly scenario: EconomyScenarioDef;
  readonly world: World;
  readonly context: TickContext;
}

function fixture(): Fixture {
  // Use the full M3 small-economy population so the fixture has genuine idle
  // labor; the focused market fixture has only a few hundred workers, all
  // assigned to its authored production jobs.
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

type StartAction = Extract<CountryAction, { kind: "start-construction" }>;

function startAction(world: World, definitionId = FARM): StartAction {
  return {
    kind: "start-construction",
    countryId: COUNTRY,
    dayIndex: world.dayIndex,
    source: "player",
    provinceId: REGION,
    definitionId,
  };
}

function start(fixtureValue: Fixture, definitionId = FARM): number {
  const action = startAction(fixtureValue.world, definitionId);
  const validation = validateCountryAction(
    fixtureValue.world,
    action,
    fixtureValue.scenario.definitions,
  );
  if (!validation.valid) throw new Error(validation.errors.join("; "));
  const applied = applyCountryAction(
    fixtureValue.world,
    action,
    fixtureValue.scenario.definitions,
  );
  if (applied.constructionProject === null) throw new Error("project was not created");
  return applied.constructionProject.id;
}

function run(fixtureValue: Fixture, count: number): void {
  for (let index = 0; index < count; index += 1) {
    tick(fixtureValue.world, fixtureValue.context);
  }
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
  if (account === undefined) {
    throw new Error(`missing ${ownerKind} ${String(ownerId)} ${subtype}`);
  }
  return account.balanceRUSD;
}

describe("E3 construction selection and authorization", () => {
  test("offers only buildable state project types and lists real capacity", () => {
    const { scenario } = fixture();
    const buildable = scenario.definitions.buildings.filter(
      (definition) =>
        definition.ownershipAllowed.includes("state") &&
        definition.outputs.length > 0 &&
        definition.constructionCostRUSD > 0,
    );
    expect(buildable.length).toBeGreaterThan(0);
    expect(
      buildable.every((definition) => definition.constructionWorkers > 0),
    ).toBe(true);
    expect(buildable.every((definition) => constructionPlannedJobs(definition) > 0)).toBe(
      true,
    );
    expect(scenario.definitions.buildings[WAREHOUSE]?.outputs).toEqual([]);
  });

  test("authorization snapshots the definition cost, crew, and working capital", () => {
    const f = fixture();
    const projectId = start(f);
    const created = project(f.world, projectId);
    const definition = f.scenario.definitions.buildings[FARM]!;
    expect(created.status).toBe("authorized");
    expect(created.totalCostRUSD).toBe(definition.constructionCostRUSD);
    expect(created.workingCapitalRUSD).toBe(definition.dailyUpkeepRUSDAtLevelOne * 30);
    expect(created.spentRUSD).toBe(0);
    expect(created.buildingId).toBeNull();
    expect(f.world.construction.nextProjectId).toBe(projectId + 1);
    expect(f.world.buildings).toHaveLength(8);
  });

  test("rejects unsupported types, provinces, funds, AI source, and the active cap", () => {
    const f = fixture();
    const before = hashWorld(f.world);
    const invalid: CountryAction[] = [
      startAction(f.world, WAREHOUSE), // no productive output
      { ...startAction(f.world), provinceId: 99 },
      { ...startAction(f.world), source: "ai" },
      { ...startAction(f.world), countryId: 99 },
      { ...startAction(f.world), definitionId: 999 },
    ];
    for (const action of invalid) {
      expect(
        validateCountryAction(f.world, action, f.scenario.definitions).valid,
      ).toBe(false);
      expect(() =>
        applyCountryAction(f.world, action, f.scenario.definitions),
      ).toThrow();
      expect(hashWorld(f.world)).toBe(before);
    }

    // A private-only definition is not offered and cannot be authorized.
    const definition = f.scenario.definitions.buildings[FARM]!;
    const originalOwnership = [...definition.ownershipAllowed];
    definition.ownershipAllowed = ["private"];
    expect(
      validateCountryAction(
        f.world,
        startAction(f.world),
        f.scenario.definitions,
      ).valid,
    ).toBe(false);
    definition.ownershipAllowed = originalOwnership;

    // Insufficient treasury is rejected without mutation.
    const poor = fixture();
    poor.world.countries[COUNTRY]!.treasuryAccountId = 1000;
    const treasury = poor.world.finance.accounts.find(
      (entry) => entry.id === poor.world.countries[COUNTRY]!.treasuryAccountId,
    )!;
    const equity = poor.world.finance.accounts.find(
      (entry) =>
        entry.ownerKind === "country" &&
        entry.ownerId === COUNTRY &&
        entry.subtype === "owner-equity",
    )!;
    const drain = treasury.balanceRUSD;
    treasury.balanceRUSD -= drain;
    equity.balanceRUSD -= drain;
    assertValidWorld(poor.world);
    expect(
      validateCountryAction(
        poor.world,
        startAction(poor.world),
        poor.scenario.definitions,
      ).valid,
    ).toBe(false);

    // The active cap is enforced deterministically.
    const capped = fixture();
    for (let index = 0; index < 32; index += 1) start(capped);
    expect(
      validateCountryAction(
        capped.world,
        startAction(capped.world),
        capped.scenario.definitions,
      ).valid,
    ).toBe(false);
    expect(
      capped.world.construction.projects.filter(
        (entry) => entry.status !== "completed" && entry.status !== "cancelled",
      ),
    ).toHaveLength(32);
  });
});

describe("E3 construction progress and completion", () => {
  test("hires only idle workers, progresses across days, and completes exactly", () => {
    const f = fixture();
    const projectId = start(f);
    const beforeCash = designatedCashTotal(f.world.finance);
    const beforeHash = hashWorld(f.world);

    // Authorization day: no progress.
    run(f, 1);
    expect(project(f.world, projectId).status).toBe("authorized");
    expect(project(f.world, projectId).spentRUSD).toBe(0);
    expect(hashWorld(f.world)).not.toBe(beforeHash);

    run(f, 1); // first construction day
    const first = project(f.world, projectId);
    const spentAfterFirst = first.spentRUSD;
    expect(first.status).toBe("active");
    expect(first.lastWorkers).toBeGreaterThan(0);
    expect(first.startedDay).toBe(1);

    run(f, 1);
    const second = project(f.world, projectId);
    expect(second.spentRUSD).toBeGreaterThan(spentAfterFirst);
    expect(second.lastWorkers).toBeGreaterThan(0);
    // No worker is double-assigned: construction workers are not in world.employment.
    expect(
      f.world.employment.every((assignment) => assignment.workers >= 0),
    ).toBe(true);

    let ticks = 2;
    while (project(f.world, projectId).status !== "completed" && ticks < 200) {
      run(f, 1);
      ticks += 1;
    }
    const completed = project(f.world, projectId);
    expect(completed.status).toBe("completed");
    expect(completed.spentRUSD).toBeCloseTo(completed.totalCostRUSD, 9);
    expect(completed.completedDay).not.toBeNull();
    expect(completed.buildingId).not.toBeNull();
    expect(ticks).toBeGreaterThan(2);
    expect(designatedCashTotal(f.world.finance)).toBeCloseTo(beforeCash, 6);
    expect(() => assertAccountingIdentity(f.world.finance)).not.toThrow();

    const building = f.world.buildings.find((entry) => entry.id === completed.buildingId)!;
    expect(building.ownerKind).toBe("state");
    expect(building.ownerAccountId).toBe(f.world.countries[COUNTRY]!.treasuryAccountId);
    expect(building.provinceId).toBe(REGION);
    expect(building.definitionId).toBe(FARM);
    expect(building.level).toBe(1);
    expect(building.condition).toBe(1);
    expect(building.operational).toBe(true);
    expect(
      f.world.provinceEconomies.find((province) => province.id === REGION)!.buildingInstanceIds,
    ).toContain(building.id);
    expect(accountBalance(f.world, "country", COUNTRY, "construction-in-progress")).toBe(0);
    expect(accountBalance(f.world, "country", COUNTRY, "public-capital")).toBeCloseTo(
      completed.totalCostRUSD + completed.materialsSpentRUSD,
      6,
    );
    expect(accountBalance(f.world, "building", building.id, "operating-cash")).toBeCloseTo(
      completed.workingCapitalPaidRUSD,
      6,
    );
    expect(completed.workingCapitalPaidRUSD).toBeGreaterThan(0);

    // The new building participates in ordinary production and employment.
    run(f, 40);
    const assignments = f.world.employment.filter(
      (assignment) => assignment.buildingInstanceId === building.id,
    );
    expect(assignments.length).toBeGreaterThan(0);
    expect(
      f.world.finance.accounts.find(
        (entry) =>
          entry.ownerKind === "building" &&
          entry.ownerId === building.id &&
          entry.subtype === "sales-revenue",
      )?.balanceRUSD ?? 0,
    ).toBeGreaterThan(0);
    expect(designatedCashTotal(f.world.finance)).toBeCloseTo(beforeCash, 6);
  });

  test("a project can wait for labor and resume when a worker becomes idle", () => {
    const f = fixture();
    // Make every block ineligible for its profession and remove assignments, so
    // there is no idle construction labor at all.
    for (const block of f.world.popBlocks) {
      block.professionId = 1; // laborers
      block.literacyByAge = initialLiteracyByAge(0);
      block.literacy = 0;
    }
    f.world.employment = [];
    f.world.employmentDirty = false;
    // Ensure the farm's authored construction material can be bought, so this
    // test isolates the labor constraint from the material constraint.
    const market = f.world.markets[0]!;
    const grainLot = market.stockLots.find((lot) => lot.goodId === 0);
    if (grainLot !== undefined) grainLot.quantity = Math.max(grainLot.quantity, 1_000_000);
    else market.stockLots.push({ goodId: 0, ownerBuildingId: 0, quantity: 1_000_000 });
    assertValidWorld(f.world);
    const projectId = start(f);
    run(f, 2); // day 0 authorization, day 1 blocked
    expect(project(f.world, projectId).status).toBe("waiting");
    expect(project(f.world, projectId).blockedReason).toBe("labor");
    expect(project(f.world, projectId).spentRUSD).toBe(0);

    // Restore a single block as a peasant; no monthly refresh occurs on day 2,
    // so the construction queue sees it as idle and resumes.
    const block = f.world.popBlocks[0]!;
    block.professionId = 0;
    block.literacyByAge = initialLiteracyByAge(0.5);
    block.literacy = 0.5;
    assertValidWorld(f.world);
    run(f, 1);
    expect(project(f.world, projectId).status).toBe("active");
    expect(project(f.world, projectId).lastWorkers).toBeGreaterThan(0);
    expect(project(f.world, projectId).spentRUSD).toBeGreaterThan(0);
  });

  test("a project can wait for funds and resume after the treasury recovers", () => {
    const f = fixture();
    const projectId = start(f);
    run(f, 2);
    expect(project(f.world, projectId).spentRUSD).toBeGreaterThan(0);
    const country = f.world.countries.find((entry) => entry.id === COUNTRY)!;
    country.fiscal.welfareBudgetRUSDPerYear = 1_000_000_000;
    assertValidWorld(f.world);
    run(f, 1);
    expect(project(f.world, projectId).status).toBe("waiting");
    expect(project(f.world, projectId).blockedReason).toBe("funds");
    const stalled = project(f.world, projectId).spentRUSD;
    expect(accountBalance(f.world, "country", COUNTRY, "treasury-cash")).toBeGreaterThanOrEqual(
      0,
    );

    f.world.countries.find((entry) => entry.id === COUNTRY)!.fiscal.welfareBudgetRUSDPerYear = 0;
    // Fixture recapitalization: restore treasury liquidity and matching country
    // equity after the deliberately exhaustive welfare draw.
    const treasury = f.world.finance.accounts.find(
      (entry) =>
        entry.ownerKind === "country" &&
        entry.ownerId === COUNTRY &&
        entry.subtype === "treasury-cash",
    )!;
    const equity = f.world.finance.accounts.find(
      (entry) =>
        entry.ownerKind === "country" &&
        entry.ownerId === COUNTRY &&
        entry.subtype === "owner-equity",
    )!;
    treasury.balanceRUSD += 50_000;
    equity.balanceRUSD += 50_000;
    assertValidWorld(f.world);
    run(f, 1);
    expect(project(f.world, projectId).status).toBe("active");
    expect(project(f.world, projectId).spentRUSD).toBeGreaterThan(stalled);
  });
});

describe("E3 cancellation, suspension, and reporting", () => {
  test("cancellation writes off spent work in progress and never creates a building", () => {
    const f = fixture();
    const projectId = start(f);
    run(f, 4);
    const laborSpent = project(f.world, projectId).spentRUSD;
    const materialSpent = project(f.world, projectId).materialsSpentRUSD;
    const spent = laborSpent + materialSpent;
    expect(laborSpent).toBeGreaterThan(0);
    expect(materialSpent).toBeGreaterThan(0);
    const equityBefore = accountBalance(f.world, "country", COUNTRY, "owner-equity");
    const wipBefore = accountBalance(f.world, "country", COUNTRY, "construction-in-progress");
    const cashBefore = designatedCashTotal(f.world.finance);

    const action: CountryAction = {
      kind: "cancel-construction",
      countryId: COUNTRY,
      dayIndex: f.world.dayIndex,
      source: "player",
      projectId,
    };
    expect(validateCountryAction(f.world, action, f.scenario.definitions).valid).toBe(true);
    applyCountryAction(f.world, action, f.scenario.definitions);
    const cancelled = project(f.world, projectId);
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.cancelledDay).toBe(f.world.dayIndex);
    expect(cancelled.buildingId).toBeNull();
    expect(f.world.buildings).toHaveLength(8);
    expect(
      accountBalance(f.world, "country", COUNTRY, "construction-in-progress"),
    ).toBeCloseTo(
      wipBefore - spent,
      6,
    );
    expect(accountBalance(f.world, "country", COUNTRY, "owner-equity")).toBeCloseTo(
      equityBefore - spent,
      6,
    );
    expect(designatedCashTotal(f.world.finance)).toBeCloseTo(cashBefore, 6);
    expect(
      f.world.finance.budgetMemosThisMonth[COUNTRY]?.constructionWrittenOffRUSD,
    ).toBeCloseTo(spent, 6);
    assertValidWorld(f.world);

    // Cancelling again is rejected atomically.
    const before = hashWorld(f.world);
    expect(validateCountryAction(f.world, action, f.scenario.definitions).valid).toBe(false);
    expect(() => applyCountryAction(f.world, action, f.scenario.definitions)).toThrow();
    expect(hashWorld(f.world)).toBe(before);

    // The cancelled project never progresses or spends again.
    run(f, 3);
    expect(project(f.world, projectId).spentRUSD).toBeCloseTo(laborSpent, 9);
    expect(project(f.world, projectId).materialsSpentRUSD).toBeCloseTo(
      materialSpent,
      9,
    );
  });

  test("pause suspends hiring and resume continues from the same spend", () => {
    const f = fixture();
    const projectId = start(f);
    run(f, 3);
    const pause: CountryAction = {
      kind: "set-construction-paused",
      countryId: COUNTRY,
      dayIndex: f.world.dayIndex,
      source: "player",
      projectId,
      paused: true,
    };
    applyCountryAction(f.world, pause, f.scenario.definitions);
    expect(project(f.world, projectId).status).toBe("paused");
    const spent = project(f.world, projectId).spentRUSD;
    run(f, 4);
    expect(project(f.world, projectId).status).toBe("paused");
    expect(project(f.world, projectId).spentRUSD).toBeCloseTo(spent, 9);

    const resume: CountryAction = { ...pause, paused: false, dayIndex: f.world.dayIndex };
    applyCountryAction(f.world, resume, f.scenario.definitions);
    expect(project(f.world, projectId).status).toBe("active");
    run(f, 1);
    expect(project(f.world, projectId).spentRUSD).toBeGreaterThan(spent);
  });

  test("monthly and annual reports carry construction outlays separately from expense", () => {
    const f = fixture();
    const projectId = start(f);
    run(f, 31); // first civil month closes on day 30
    expect(project(f.world, projectId).status).toBe("completed");
    const monthly = f.world.finance.periodSummaries[0]!;
    const budget = monthly.countryBudgetTotals[COUNTRY]!;
    expect(budget.constructionSpentRUSD).toBeCloseTo(
      project(f.world, projectId).spentRUSD +
        project(f.world, projectId).materialsSpentRUSD,
      6,
    );
    const fiscal = governmentPeriodTotals(f.world.finance, monthly).find(
      (entry) => entry.countryId === COUNTRY,
    )!;
    // Construction spending is capitalized, not a welfare/interest expense.
    expect(fiscal.welfareExpenseRUSD).toBe(0);
    expect(fiscal.interestExpenseRUSD).toBe(0);
    expect(fiscal.netFiscalResultRUSD).toBe(0);

    run(f, 334); // complete the calendar year
    expect(f.world.finance.annualSummaries).toHaveLength(1);
    const annual = f.world.finance.annualSummaries[0]!;
    let monthlySpent = 0;
    for (const summary of f.world.finance.periodSummaries) {
      monthlySpent += summary.countryBudgetTotals[COUNTRY]?.constructionSpentRUSD ?? 0;
    }
    expect(annual.budgetTotals[COUNTRY]?.constructionSpentRUSD ?? 0).toBeCloseTo(
      monthlySpent,
      6,
    );
    expect(annual.budgetTotals[COUNTRY]?.constructionSpentRUSD ?? 0).toBeCloseTo(
      budget.constructionSpentRUSD,
      6,
    );
  });

  test("save/load and deterministic replay preserve queued and active projects", () => {
    const f = fixture();
    const projectId = start(f);
    run(f, 5);
    const save = serializeWorld(f.world);
    const restored = deserializeWorld(save);
    expect(hashWorld(restored)).toBe(hashWorld(f.world));
    expect(restored.construction).toEqual(f.world.construction);

    // Continue both from the same state; the completed outcomes must match.
    const other = deserializeWorld(save);
    run(f, 40);
    for (let index = 0; index < 40; index += 1) tick(other, f.context);
    expect(hashWorld(other)).toBe(hashWorld(f.world));
    expect(project(f.world, projectId).status).toBe("completed");
    expect(project(other, projectId).status).toBe("completed");
  });

  test("the terminal boundary cannot run construction", () => {
    const f = fixture();
    expect(() =>
      runConstructionPhase(
        f.world,
        f.scenario.definitions,
        CAMPAIGN_TERMINAL_DAY_INDEX,
        undefined,
        { validateWorld: false },
      ),
    ).toThrow(/terminal/);
  });

  test("the immutable snapshot exposes project types, queue, labor, and previews", () => {
    const f = fixture();
    const projectId = start(f);
    run(f, 3);
    const snapshot = buildSimulationSnapshot(
      f.world,
      f.scenario.definitions,
      { sequence: 1, running: false, speedDaysPerSecond: 1, achievedDaysPerSecond: 0 },
      f.scenario.population.definitions,
    );
    expect(snapshot.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(snapshot.constructionEnabled).toBe(true);
    expect(snapshot.projectTypes.length).toBeGreaterThan(0);
    const farmType = snapshot.projectTypes.find((type) => type.definitionId === FARM)!;
    expect(farmType.constructionCostRUSD).toBeGreaterThan(0);
    expect(farmType.constructionWorkers).toBeGreaterThan(0);
    expect(farmType.outputs.length).toBeGreaterThan(0);
    expect(farmType.outputs[0]?.dailyCapacityAtLevelOne).toBeGreaterThan(0);
    expect(snapshot.projectTypes.some((type) => type.definitionId === WAREHOUSE)).toBe(
      false,
    );

    const country = snapshot.countries.find((entry) => entry.id === COUNTRY)!;
    expect(country.constructionProjects).toHaveLength(1);
    expect(country.constructionProjects[0]?.id).toBe(projectId);
    expect(country.constructionLabor.idleWorkers).toBeGreaterThan(0);
    expect(country.constructionLabor.dailyWageRUSD).toBeGreaterThan(0);
    expect(country.constructionInProgressRUSD).toBeGreaterThan(0);
    expect(country.budgetMonthToDate.constructionSpentRUSD).toBeGreaterThan(0);

    const preview = previewConstruction(snapshot, country, FARM, REGION);
    expect(preview.valid).toBe(true);
    expect(preview.upfrontRequirementRUSD).toBeGreaterThan(preview.costRUSD);
    expect(preview.estimatedDays).not.toBeNull();
    expect(() =>
      parseWorkerEvent({
        protocolVersion: PROTOCOL_VERSION,
        type: "READY",
        snapshot,
      }),
    ).not.toThrow();

    const missing = { ...snapshot, projectTypes: undefined } as unknown;
    expect(() =>
      parseWorkerEvent({ protocolVersion: PROTOCOL_VERSION, type: "READY", snapshot: missing }),
    ).toThrow(/valid snapshot/);
  });

  test("terminated project detail is bounded and compacted into country aggregates", () => {
    const f = fixture();
    const projects: ConstructionProject[] = [];
    for (let id = 1; id <= 33; id += 1) {
      projects.push({
        id,
        countryId: COUNTRY,
        provinceId: REGION,
        definitionId: FARM,
        status: "cancelled",
        authorizedDay: 0,
        startedDay: null,
        completedDay: null,
        cancelledDay: 0,
        totalCostRUSD: 1000,
        workingCapitalRUSD: 600,
        workingCapitalPaidRUSD: 0,
        spentRUSD: 0,
        materialsSpentRUSD: 0,
        materials: [],
        lastWorkers: 0,
        blockedReason: null,
        buildingId: null,
      });
    }
    f.world.construction.projects = projects;
    f.world.construction.nextProjectId = 34;
    // The pre-state intentionally exceeds the retention bound; the phase's
    // compaction must restore it before publication.
    runConstructionPhase(
      f.world,
      f.scenario.definitions,
      f.world.dayIndex,
      undefined,
      { validateWorld: false },
    );
    expect(f.world.construction.projects).toHaveLength(32);
    expect(f.world.construction.history).toHaveLength(1);
    expect(f.world.construction.history[0]?.countryId).toBe(COUNTRY);
    expect(f.world.construction.history[0]?.projectsCancelled).toBe(1);
    expect(f.world.construction.history[0]?.totalWrittenOffRUSD).toBe(0);
    expect(f.world.construction.projects[0]?.id).toBe(2);
    assertValidWorld(f.world);
  });
});
