import {
  AI_HARDSHIP_MIN_TAX_RATE,
  AI_TREASURY_BUFFER_MONTHS,
  AI_WELFARE_REVENUE_SHARE,
  assertValidWorld,
  assertValidWorldForTick,
  applyCountryAction,
  buildCountryAIObservation,
  cloneWorld,
  cloneWorldForTick,
  createEconomyWorld,
  deserializeWorld,
  firstAIEvaluationDay,
  hashWorld,
  planCountryActions,
  runCountryAIPhase,
  serializeWorld,
  tick,
  validateCountryAction,
  WORLD_SCHEMA_VERSION,
  type CountryAIObservation,
  type CountryAction,
  type EconomyScenarioDef,
  type FiscalPolicy,
  type SetFiscalPolicyAction,
  type TickContext,
  type World,
  countryProvinceIds,
} from "@century/sim";
import { M5_COUNTRY_A, M5_COUNTRY_B, m5Scenario } from "./fixtures/m5.js";

const SEED = 20_261_023;

function contextFor(scenario: EconomyScenarioDef): TickContext {
  return {
    population: { definitions: scenario.population.definitions },
    economy: { definitions: scenario.definitions },
  };
}

function aiScenario(): EconomyScenarioDef {
  const scenario = m5Scenario();
  scenario.countryAI = { enabled: true };
  return scenario;
}

function aiWorld(scenario: EconomyScenarioDef = aiScenario()): World {
  return createEconomyWorld(scenario, { seed: SEED });
}

function tickDays(world: World, scenario: EconomyScenarioDef, days: number): void {
  const context = contextFor(scenario);
  for (let index = 0; index < days; index += 1) tick(world, context);
}

function fiscalPolicy(overrides: Partial<FiscalPolicy> = {}): FiscalPolicy {
  return {
    incomeTaxRate: 0,
    incomeTaxAllowanceRUSDPerYear: 0,
    welfareBudgetRUSDPerYear: 0,
    welfareMaxWealthLevel: 99,
    businessProfitTaxRate: 0,
    reserveTargetRUSD: 0,
    ...overrides,
  };
}

function fiscalActionOf(action: CountryAction | undefined): SetFiscalPolicyAction {
  if (action === undefined || action.kind !== "set-fiscal-policy") {
    throw new Error("expected a set-fiscal-policy action");
  }
  return action;
}

function observation(overrides: Partial<CountryAIObservation> = {}): CountryAIObservation {
  return {
    countryId: M5_COUNTRY_A,
    dayIndex: 7,
    fiscal: fiscalPolicy(),
    treasuryCashRUSD: 1_000_000,
    provinceIds: [0],
    population: 1_000,
    blocks: [
      {
        popBlockId: 0,
        provinceId: 0,
        population: 1_000,
        literacy: 0.2,
        wealthLevel: 30,
        militancy: 0.2,
        unmetSubsistenceDays: 7,
        unmetBasicDays: 7,
        comfortFulfilledDays: 0,
      },
    ],
    lastClosedPeriod: null,
    debt: { enabled: false, outstandingPrincipalRUSD: 0 },
    ...overrides,
  };
}

function action(overrides: Partial<CountryAction> = {}): CountryAction {
  return {
    kind: "set-fiscal-policy",
    countryId: M5_COUNTRY_A,
    dayIndex: 0,
    source: "player",
    incomeTaxRate: 0.2,
    incomeTaxAllowanceRUSDPerYear: 0,
    welfareBudgetRUSDPerYear: 100,
    welfareMaxWealthLevel: 99,
    businessProfitTaxRate: 0,
    reserveTargetRUSD: 0,
    ...overrides,
  } as CountryAction;
}

describe("M6 country AI and action validation", () => {
  test("disabled AI and legacy fixtures keep their policy and state", () => {
    const scenario = m5Scenario();
    const world = createEconomyWorld(scenario, { seed: SEED });
    expect(world.countryAI.enabled).toBe(false);
    expect(world.countries.every((country) => country.ai.currentGoalId === null)).toBe(true);
    const before = hashWorld(world);
    expect(() => runCountryAIPhase(world, 0)).not.toThrow();
    expect(hashWorld(world)).toBe(before);
    expect(world.diagnostics.invalidActionCount).toBe(0);
  });

  test("evaluates every seven days, staggered by stable country id", () => {
    const scenario = aiScenario();
    const world = aiWorld(scenario);
    const context = contextFor(scenario);
    const evaluationDays = new Map<number, number[]>();
    for (let day = 0; day < 35; day += 1) {
      const result = tick(world, context);
      for (const evaluation of result.economy?.ai.evaluated ?? []) {
        const list = evaluationDays.get(evaluation.countryId) ?? [];
        list.push(day);
        evaluationDays.set(evaluation.countryId, list);
      }
    }
    for (const country of world.countries) {
      const days = evaluationDays.get(country.id) ?? [];
      expect(days.length).toBeGreaterThanOrEqual(4);
      expect(days[0]).toBe(firstAIEvaluationDay(0, country.id));
      for (let index = 1; index < days.length; index += 1) {
        expect((days[index] ?? 0) - (days[index - 1] ?? 0)).toBe(7);
      }
      expect(country.ai.lastDecisionDay).not.toBeNull();
      expect(country.ai.currentGoalId).not.toBeNull();
      expect(country.ai.nextEvaluationDay).toBeGreaterThan(country.ai.lastDecisionDay ?? 0);
    }
    expect(world.diagnostics.invalidActionCount).toBe(0);
  });

  test("relief raises the tax floor, then commits a stable share of observed revenue", () => {
    const noHistory = planCountryActions(observation());
    expect(noHistory.goalId).toBe("relieve-hardship");
    expect(noHistory.actions).toHaveLength(1);
    const noHistoryAction = fiscalActionOf(noHistory.actions[0]);
    expect(noHistoryAction.incomeTaxRate).toBe(AI_HARDSHIP_MIN_TAX_RATE);
    expect(noHistoryAction.welfareBudgetRUSDPerYear).toBe(0);

    const observed = planCountryActions(
      observation({
        lastClosedPeriod: {
          periodStartDay: 0,
          periodEndDay: 29,
          incomeTaxRUSD: 100_000,
          welfarePaidRUSD: 0,
          interestExpenseRUSD: 0,
        },
      }),
    );
    expect(observed.goalId).toBe("relieve-hardship");
    const proposed = fiscalActionOf(observed.actions[0]);
    expect(proposed.kind).toBe("set-fiscal-policy");
    expect(proposed.incomeTaxRate).toBe(AI_HARDSHIP_MIN_TAX_RATE);
    const annualTaxRevenue = (100_000 * 365) / 30;
    expect(proposed.welfareBudgetRUSDPerYear).toBeCloseTo(
      annualTaxRevenue * AI_WELFARE_REVENUE_SHARE,
      2,
    );
  });

  test("solvency takes priority over relief and cuts unaffordable welfare", () => {
    const decision = planCountryActions(
      observation({
        fiscal: fiscalPolicy({ incomeTaxRate: 0.1, welfareBudgetRUSDPerYear: 60_000 }),
        treasuryCashRUSD: 100,
        lastClosedPeriod: {
          periodStartDay: 0,
          periodEndDay: 29,
          incomeTaxRUSD: 1_000,
          welfarePaidRUSD: 5_000,
          interestExpenseRUSD: 0,
        },
      }),
    );
    expect(decision.goalId).toBe("restore-solvency");
    expect(decision.actions).toHaveLength(1);
    const solvencyAction = fiscalActionOf(decision.actions[0]);
    expect(solvencyAction.incomeTaxRate).toBeCloseTo(0.11, 12);
    expect(solvencyAction.welfareBudgetRUSDPerYear).toBeLessThan(60_000);
    expect(AI_TREASURY_BUFFER_MONTHS).toBeGreaterThan(0);
  });

  test("healthy, non-hardship countries make no policy change", () => {
    const decision = planCountryActions(
      observation({
        blocks: [
          {
            popBlockId: 0,
            provinceId: 0,
            population: 1_000,
            literacy: 0.2,
            wealthLevel: 40,
            militancy: 0.05,
            unmetSubsistenceDays: 0,
            unmetBasicDays: 0,
            comfortFulfilledDays: 10,
          },
        ],
        fiscal: fiscalPolicy({ incomeTaxRate: 0.05, welfareBudgetRUSDPerYear: 10_000 }),
        treasuryCashRUSD: 10_000_000,
        lastClosedPeriod: {
          periodStartDay: 0,
          periodEndDay: 29,
          incomeTaxRUSD: 100_000,
          welfarePaidRUSD: 10_000,
          interestExpenseRUSD: 0,
        },
      }),
    );
    expect(decision.goalId).toBe("maintain");
    expect(decision.actions).toEqual([]);
  });

  test("the observation excludes other countries' private state and the seed", () => {
    const firstScenario = aiScenario();
    const secondScenario = aiScenario();
    const first = aiWorld(firstScenario);
    const second = aiWorld(secondScenario);
    const dueDay = firstAIEvaluationDay(0, M5_COUNTRY_A);
    expect(dueDay).toBeGreaterThan(0);
    first.dayIndex = dueDay;
    second.dayIndex = dueDay;
    // Hidden changes: another country's fiscal policy, another pop block's
    // militancy, and the world seed. None may affect country A's decision.
    const otherCountry = second.countries.find((country) => country.id === M5_COUNTRY_B);
    if (otherCountry === undefined) throw new Error("missing country B");
    otherCountry.fiscal = fiscalPolicy({ incomeTaxRate: 0.9, welfareBudgetRUSDPerYear: 999_999 });
    const countryAProvinces = new Set(
      countryProvinceIds(second, M5_COUNTRY_A) ?? [],
    );
    const otherBlock = second.popBlocks.find((block) => !countryAProvinces.has(block.provinceId));
    if (otherBlock === undefined) throw new Error("missing non-A block");
    otherBlock.militancy = 0.99;
    second.seed = 7;
    expect(() => assertValidWorld(first)).not.toThrow();
    expect(() => assertValidWorld(second)).not.toThrow();

    const firstObservation = buildCountryAIObservation(first, M5_COUNTRY_A, dueDay);
    const secondObservation = buildCountryAIObservation(second, M5_COUNTRY_A, dueDay);
    expect(secondObservation).toEqual(firstObservation);
    const firstResult = runCountryAIPhase(first, dueDay);
    const secondResult = runCountryAIPhase(second, dueDay);
    expect(secondResult.evaluated.find((entry) => entry.countryId === M5_COUNTRY_A)).toEqual(
      firstResult.evaluated.find((entry) => entry.countryId === M5_COUNTRY_A),
    );
    expect(second.countries.find((country) => country.id === M5_COUNTRY_A)?.fiscal).toEqual(
      first.countries.find((country) => country.id === M5_COUNTRY_A)?.fiscal,
    );
    // The observation is a plain record, not the world object.
    expect(JSON.stringify(firstObservation)).not.toContain("treasuryAccountId");
    expect(JSON.stringify(firstObservation)).not.toContain("fiscalPolicyOfOther");
  });

  test("player and AI use the same validator and a failed action is atomic", () => {
    const scenario = aiScenario();
    const world = aiWorld(scenario);
    const valid = action({ countryId: M5_COUNTRY_A });
    expect(validateCountryAction(world, valid)).toEqual({ valid: true, errors: [] });
    const applied = applyCountryAction(world, valid);
    expect(applied.changed).toBe(true);
    expect(world.countries[0]?.fiscal.incomeTaxRate).toBe(0.2);
    expect(world.countries[0]?.ai.lastActionSummary).toBeNull();
    expect(() => assertValidWorld(world)).not.toThrow();

    const before = hashWorld(world);
    const invalidActions: CountryAction[] = [
      action({ dayIndex: 1 }),
      action({ countryId: 99 }),
      action({ incomeTaxRate: 1.5 }),
      action({ incomeTaxRate: Number.NaN }),
      action({ welfareBudgetRUSDPerYear: -1 }),
      action({ welfareBudgetRUSDPerYear: Number.POSITIVE_INFINITY }),
      action({ incomeTaxAllowanceRUSDPerYear: -1 }),
      action({ welfareMaxWealthLevel: 100 }),
      action({ businessProfitTaxRate: 1.5 }),
      action({ reserveTargetRUSD: -1 }),
    ];
    for (const invalid of invalidActions) {
      expect(validateCountryAction(world, invalid).valid).toBe(false);
      expect(() => applyCountryAction(world, invalid)).toThrow();
      expect(hashWorld(world)).toBe(before);
    }
  });

  test("AI actions are deterministic and survive save/resume", () => {
    const scenario = aiScenario();
    const first = aiWorld(scenario);
    const second = aiWorld(scenario);
    const context = contextFor(scenario);
    for (let day = 0; day < 45; day += 1) {
      tick(first, context);
      tick(second, context);
    }
    expect(hashWorld(second)).toBe(hashWorld(first));

    const savedAt20 = aiWorld(scenario);
    tickDays(savedAt20, scenario, 20);
    const restored = deserializeWorld(serializeWorld(savedAt20));
    expect(hashWorld(restored)).toBe(hashWorld(savedAt20));
    tickDays(savedAt20, scenario, 25);
    tickDays(restored, scenario, 25);
    expect(hashWorld(restored)).toBe(hashWorld(savedAt20));
    expect(hashWorld(restored)).toBe(hashWorld(first));
  });

  test("the sample campaign has zero invalid AI actions", () => {
    const scenario = aiScenario();
    const world = aiWorld(scenario);
    const context = contextFor(scenario);
    let proposed = 0;
    let applied = 0;
    for (let day = 0; day < 95; day += 1) {
      const result = tick(world, context);
      for (const evaluation of result.economy?.ai.evaluated ?? []) {
        proposed += evaluation.proposedActionCount;
        applied += evaluation.appliedActionCount;
        expect(evaluation.rejectedActionCount).toBe(0);
      }
    }
    expect(proposed).toBeGreaterThan(0);
    expect(applied).toBeGreaterThan(0);
    expect(world.diagnostics.invalidActionCount).toBe(0);
    expect(world.countries.every((country) => country.fiscal.incomeTaxRate <= 0.25)).toBe(true);
    expect(() => assertValidWorld(world)).not.toThrow();
  });

  test("state growth stays bounded and AI state is fixed-size", () => {
    const scenario = aiScenario();
    const world = aiWorld(scenario);
    const context = contextFor(scenario);
    tick(world, context);
    const accountsAfterOne = world.finance.accounts.length;
    const countryKeysAfterOne = world.countries.map((country) => Object.keys(country).sort());
    for (let day = 1; day < 120; day += 1) tick(world, context);
    expect(world.finance.accounts).toHaveLength(accountsAfterOne);
    expect(world.finance.postings.length).toBeLessThanOrEqual(256);
    expect(world.finance.periodSummaries.length).toBeLessThanOrEqual(5);
    for (let index = 0; index < world.countries.length; index += 1) {
      expect(Object.keys(world.countries[index] ?? {}).sort()).toEqual(countryKeysAfterOne[index]);
      expect(Object.keys(world.countries[index]?.ai ?? {}).sort()).toEqual([
        "currentGoalId",
        "lastActionSummary",
        "lastDecisionDay",
        "nextEvaluationDay",
      ]);
      expect((world.countries[index]?.ai.lastActionSummary ?? "").length).toBeLessThanOrEqual(500);
    }
    expect(serializeWorld(world).length).toBeLessThan(4 * 1024 * 1024);
  });

  test("serializes, validates, and rejects malformed AI state", () => {
    const scenario = aiScenario();
    const world = aiWorld(scenario);
    tickDays(world, scenario, 10);
    const serialized = serializeWorld(world);
    const payload = JSON.parse(serialized) as {
      schemaVersion: number;
      payload: { countryAI: { enabled: boolean }; countries: { ai: Record<string, unknown> }[] };
    };
    expect(payload.schemaVersion).toBe(WORLD_SCHEMA_VERSION);
    expect(payload.payload.countryAI.enabled).toBe(true);
    expect(payload.payload.countries[0]?.ai).toBeDefined();
    const restored = deserializeWorld(serialized);
    expect(hashWorld(restored)).toBe(hashWorld(world));

    const broken = deserializeWorld(serialized);
    broken.countries[0]!.ai.currentGoalId = null;
    broken.countries[0]!.ai.lastDecisionDay = 5;
    expect(() => assertValidWorld(broken)).toThrow(/currentGoalId|lastDecisionDay/);
    expect(() => serializeWorld(broken)).toThrow(/currentGoalId|lastDecisionDay/);
  });

  test("public clone isolates summaries; the tick clone shares only immutable ones", () => {
    const scenario = aiScenario();
    const world = aiWorld(scenario);
    tickDays(world, scenario, 31);
    tickDays(world, scenario, 29);
    const summaryCount = world.finance.periodSummaries.length;
    expect(summaryCount).toBeGreaterThan(1);

    // Public clone isolation remains the M4b contract: mutating a cloned summary
    // must not affect the source world.
    const clone = cloneWorld(world);
    expect(clone.finance.periodSummaries).not.toBe(world.finance.periodSummaries);
    expect(clone.finance.periodSummaries).toHaveLength(summaryCount);
    expect(clone.finance.periodSummaries[0]).not.toBe(world.finance.periodSummaries[0]);

    // The hot tick clone shares immutable summary objects but copies the array;
    // a staged close appends only to the clone and leaves the source untouched.
    const tickClone = cloneWorldForTick(world);
    expect(tickClone.finance.periodSummaries).not.toBe(world.finance.periodSummaries);
    expect(tickClone.finance.periodSummaries[0]).toBe(world.finance.periodSummaries[0]);
    tickDays(tickClone, scenario, 40);
    expect(world.finance.periodSummaries).toHaveLength(summaryCount);
    expect(tickClone.finance.periodSummaries.length).toBeGreaterThan(summaryCount);
  });

  test("old immutable summaries are fully validated at save boundaries but not on the tick hot path", () => {
    const scenario = aiScenario();
    const world = aiWorld(scenario);
    tickDays(world, scenario, 31);
    expect(world.finance.periodSummaries).toHaveLength(1);
    tickDays(world, scenario, 29);
    expect(world.finance.periodSummaries.length).toBeGreaterThan(1);
    // P5 (D-143 §6): older months are compacted (no account trial balance), so the
    // corruption is planted in what an old summary retains.
    const firstSummary = world.finance.periodSummaries[0]!;
    expect(Object.keys(firstSummary.accountTotals)).toHaveLength(0);
    firstSummary.flowTotalsByKind.wages = Number.NaN;
    expect(() => assertValidWorld(world)).toThrow(/flowTotalsByKind/);
    expect(() => assertValidWorldForTick(world)).not.toThrow();
    expect(() => serializeWorld(world)).toThrow(/flowTotalsByKind/);
    expect(() => createEconomyWorld(scenario, { seed: SEED })).not.toThrow();
  });
});
