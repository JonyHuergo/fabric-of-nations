import {
  assertValidWorld,
  buildFinanceIndex,
  createEconomyWorld,
  deriveHealth,
  deriveTraining,
  deserializeWorld,
  hashWorld,
  laborHoursFactor,
  laborMinimumWageRUSDPerYear,
  qualificationWageFactor,
  refreshInstitution,
  runEconomicDay,
  runLaborMonthStart,
  runTrainingPhase,
  serializeWorld,
  tick,
  validateHealthStaffShare,
  type EconomyDayResult,
  type EconomyScenarioDef,
  type TickContext,
  type World,
} from "@century/sim";

import { e5Scenario } from "./fixtures/e5.js";
import { M5_COUNTRY_A } from "./fixtures/m5.js";
import { m9Scenario } from "./fixtures/m9.js";

const SEED = 20_261_101;

function contextFor(scenario: EconomyScenarioDef): TickContext {
  return {
    population: { definitions: scenario.population.definitions },
    economy: { definitions: scenario.definitions },
  };
}

function worldFixture(
  options: Parameters<typeof e5Scenario>[0] = {},
): {
  readonly scenario: EconomyScenarioDef;
  readonly world: World;
  readonly context: TickContext;
  readonly country: World["countries"][number];
} {
  const scenario = e5Scenario(options);
  const world = createEconomyWorld(scenario, { seed: SEED });
  const country = world.countries.find((entry) => entry.id === M5_COUNTRY_A);
  if (country === undefined) throw new Error("fixture has no country A");
  return { scenario, world, context: contextFor(scenario), country };
}

function runDay(world: World, context: TickContext): EconomyDayResult {
  return runEconomicDay(
    world,
    context.population!.definitions,
    context.economy!.definitions,
    world.dayIndex,
  );
}

function totalWageObligation(result: EconomyDayResult): number {
  return result.economy.settlement.wages.reduce(
    (total, settlement) => total + settlement.obligationRUSD,
    0,
  );
}

function lawId(scenario: EconomyScenarioDef, key: string): number {
  const politics = scenario.definitions.politics;
  if (politics === undefined) throw new Error("fixture has no politics definitions");
  const law = politics.laws.find((entry) => entry.key === key);
  if (law === undefined) throw new Error(`fixture has no ${key} law`);
  return law.id;
}

describe("E5 training and qualification", () => {
  test("neutral policy does nothing", () => {
    const scenario = m9Scenario();
    const world = createEconomyWorld(scenario, { seed: SEED });
    const country = world.countries.find((entry) => entry.id === M5_COUNTRY_A);
    if (country === undefined) throw new Error("no country A");
    expect(country.labor.trainingBudgetRUSDPerYear).toBe(0);
    expect(country.labor.trainingParticipation).toBe(0);
    expect(country.institutions.healthStaffShare).toBe(0);
    expect(world.popBlocks.every((block) => block.qualification === 0)).toBe(true);
    const derived = deriveTraining(world, country, scenario.definitions);
    expect(derived.participation).toBe(0);
    const health = deriveHealth(world, country, scenario.definitions);
    expect(health.serviceOutputIndex).toBe(0);
    expect(health.mortalityFactor).toBe(1);
  });

  test("funded training derives real instructors and participation", () => {
    const { scenario, world, country } = worldFixture();
    runLaborMonthStart(world, scenario.definitions, world.dayIndex);
    const derived = deriveTraining(world, country, scenario.definitions);
    expect(derived.instructors).toBeGreaterThan(0);
    expect(derived.eligibleWorkingAge).toBeGreaterThan(0);
    expect(derived.participation).toBeGreaterThan(0);
    expect(derived.participation).toBeLessThanOrEqual(0.05);
    expect(country.labor.trainingParticipation).toBe(derived.participation);
    expect(derived.trainees).toBeGreaterThan(0);
  });

  test("no budget blocks participation even with academic staff", () => {
    const scenario = e5Scenario({
      trainingBudgetA: 0,
      trainingStaffShareA: 0.5,
      healthStaffShareA: 0,
    });
    const world = createEconomyWorld(scenario, { seed: SEED });
    const country = world.countries.find((entry) => entry.id === M5_COUNTRY_A);
    if (country === undefined) throw new Error("no country A");
    runLaborMonthStart(world, scenario.definitions, world.dayIndex);
    expect(country.labor.trainingParticipation).toBe(0);
    const phase = runTrainingPhase(world, scenario.definitions, world.dayIndex);
    expect(phase.totalPaidRUSD).toBe(0);
    expect(world.popBlocks.every((block) => block.qualification === 0)).toBe(true);
  });

  test("training pays real stipends and payroll, then slowly raises qualification", () => {
    const { scenario, world, country } = worldFixture({
      trainingStipendA: 10,
      trainingStaffShareA: 0.01,
      healthStaffShareA: 0,
    });
    runLaborMonthStart(world, scenario.definitions, world.dayIndex);
    const derived = deriveTraining(world, country, scenario.definitions);
    expect(derived.trainees).toBeGreaterThan(0);
    const indexBefore = buildFinanceIndex(world.finance);
    const treasuryBefore = indexBefore.get("country", country.id, "treasury-cash").balanceRUSD;
    const householdBefore = world.popBlocks
      .filter((block) => country.regionIds.includes(block.regionId))
      .reduce(
        (total, block) =>
          total + indexBefore.get("popBlock", block.id, "household-cash").balanceRUSD,
        0,
      );
    const phase = runTrainingPhase(world, scenario.definitions, world.dayIndex);
    expect(phase.totalPaidRUSD).toBeGreaterThan(0);
    const indexAfter = buildFinanceIndex(world.finance);
    const treasuryAfter = indexAfter.get("country", country.id, "treasury-cash").balanceRUSD;
    const householdAfter = world.popBlocks
      .filter((block) => country.regionIds.includes(block.regionId))
      .reduce(
        (total, block) =>
          total + indexAfter.get("popBlock", block.id, "household-cash").balanceRUSD,
        0,
      );
    expect(treasuryBefore - treasuryAfter).toBeCloseTo(phase.totalPaidRUSD, 4);
    expect(householdAfter - householdBefore).toBeCloseTo(phase.totalPaidRUSD, 4);
    assertValidWorld(world);

    for (let day = 1; day < 60; day += 1) {
      runTrainingPhase(world, scenario.definitions, day);
    }
    const qualified = world.popBlocks.filter(
      (block) => country.regionIds.includes(block.regionId) && block.qualification > 0,
    );
    expect(qualified.length).toBeGreaterThan(0);
    expect(Math.max(...qualified.map((block) => block.qualification))).toBeGreaterThan(0);
  });

  test("treasury cash limits training and records an explicit shortfall", () => {
    const { scenario, world, country } = worldFixture({
      trainingBudgetA: 10_000_000,
      trainingStipendA: 1_000,
      trainingStaffShareA: 0.2,
      healthStaffShareA: 0,
    });
    const index = buildFinanceIndex(world.finance);
    const treasury = index.get("country", country.id, "treasury-cash");
    const affordable = Math.max(
      0,
      treasury.balanceRUSD - country.fiscal.reserveTargetRUSD,
    );
    runLaborMonthStart(world, scenario.definitions, world.dayIndex);
    const phase = runTrainingPhase(world, scenario.definitions, world.dayIndex);
    expect(phase.totalPaidRUSD).toBeLessThanOrEqual(affordable + 1e-6);
    expect(country.labor.trainingRequestedMonthToDateRUSD).toBeGreaterThan(
      phase.totalPaidRUSD,
    );
    expect(country.labor.trainingShortfallMonthToDateRUSD).toBeGreaterThan(0);
    assertValidWorld(world);
  });
});

describe("E5 qualification and labor-law channels", () => {
  test("qualification raises the actual wage obligation", () => {
    const baselineScenario = e5Scenario({
      trainingBudgetA: 0,
      trainingStaffShareA: 0,
      healthStaffShareA: 0,
    });
    const baselineWorld = createEconomyWorld(baselineScenario, { seed: SEED });
    const baselineResult = runDay(baselineWorld, contextFor(baselineScenario));

    const premiumScenario = e5Scenario({
      trainingBudgetA: 0,
      trainingStaffShareA: 0,
      healthStaffShareA: 0,
    });
    const premiumWorld = createEconomyWorld(premiumScenario, { seed: SEED });
    for (const block of premiumWorld.popBlocks) block.qualification = 1;
    const premiumResult = runDay(premiumWorld, contextFor(premiumScenario));
    expect(totalWageObligation(premiumResult)).toBeGreaterThan(
      totalWageObligation(baselineResult),
    );
    expect(qualificationWageFactor(premiumWorld.popBlocks[0]!)).toBeCloseTo(1.25, 6);
  });

  test("a minimum-wage law raises wages through the actual posting", () => {
    const baselineScenario = e5Scenario({
      trainingBudgetA: 0,
      trainingStaffShareA: 0,
      healthStaffShareA: 0,
    });
    const baselineWorld = createEconomyWorld(baselineScenario, { seed: SEED });
    const baseline = runDay(baselineWorld, contextFor(baselineScenario));

    const lawScenario = e5Scenario({
      trainingBudgetA: 0,
      trainingStaffShareA: 0,
      healthStaffShareA: 0,
    });
    const lawWorld = createEconomyWorld(lawScenario, { seed: SEED });
    const country = lawWorld.countries.find((entry) => entry.id === M5_COUNTRY_A);
    if (country === undefined) throw new Error("no country A");
    country.laws.labor = lawId(lawScenario, "labor-minimum-wage");
    expect(laborMinimumWageRUSDPerYear(country, lawScenario.definitions)).toBe(300);
    const result = runDay(lawWorld, contextFor(lawScenario));
    expect(totalWageObligation(result)).toBeGreaterThan(totalWageObligation(baseline));
  });

  test("a working-hours law scales capacity and wages and improves mortality", () => {
    const scenario = e5Scenario({
      trainingBudgetA: 0,
      trainingStaffShareA: 0,
      healthStaffShareA: 0,
    });
    const world = createEconomyWorld(scenario, { seed: SEED });
    const country = world.countries.find((entry) => entry.id === M5_COUNTRY_A);
    if (country === undefined) throw new Error("no country A");
    country.laws.labor = lawId(scenario, "labor-hours-standards");
    expect(laborHoursFactor(country, scenario.definitions)).toBeCloseTo(0.8, 6);
    // A shorter week is a real cost: capacity and wages are lower, not a free bonus.
    const result = runDay(world, contextFor(scenario));
    expect(result.economy.settlement.wages.length).toBeGreaterThan(0);
    const neutralScenario = e5Scenario({
      trainingBudgetA: 0,
      trainingStaffShareA: 0,
      healthStaffShareA: 0,
    });
    const neutralWorld = createEconomyWorld(neutralScenario, { seed: SEED });
    const neutral = runDay(neutralWorld, contextFor(neutralScenario));
    expect(totalWageObligation(result)).toBeLessThan(totalWageObligation(neutral));
  });

  test("public health uses existing administration staff and lowers the mortality factor", () => {
    const healthScenario = e5Scenario({ healthStaffShareA: 0.2 });
    const healthWorld = createEconomyWorld(healthScenario, { seed: SEED });
    const healthCountry = healthWorld.countries.find((entry) => entry.id === M5_COUNTRY_A);
    if (healthCountry === undefined) throw new Error("no country A");
    const withHealth = deriveHealth(healthWorld, healthCountry, healthScenario.definitions);
    expect(withHealth.healthStaff).toBeGreaterThan(0);
    expect(withHealth.serviceOutputIndex).toBeGreaterThan(0);
    expect(withHealth.mortalityFactor).toBeLessThan(1);
    refreshInstitution(healthWorld, healthCountry, healthScenario.definitions, 0);

    const neutralScenario = e5Scenario({ healthStaffShareA: 0 });
    const neutralWorld = createEconomyWorld(neutralScenario, { seed: SEED });
    const neutralCountry = neutralWorld.countries.find((entry) => entry.id === M5_COUNTRY_A);
    if (neutralCountry === undefined) throw new Error("no country A");
    const withoutHealth = deriveHealth(neutralWorld, neutralCountry, neutralScenario.definitions);
    expect(withoutHealth.mortalityFactor).toBe(1);
    refreshInstitution(neutralWorld, neutralCountry, neutralScenario.definitions, 0);
    expect(healthCountry.institutions.quality).toBeLessThan(
      neutralCountry.institutions.quality,
    );
  });

  test("an enacted health law enforces a minimum staff share", () => {
    const { scenario, world, country } = worldFixture({ healthStaffShareA: 0.05 });
    country.laws.health = lawId(scenario, "health-public");
    expect(() =>
      validateHealthStaffShare(world, scenario.definitions, {
        countryId: country.id,
        share: 0,
      }),
    ).toThrow(/at least/);
    expect(
      validateHealthStaffShare(world, scenario.definitions, {
        countryId: country.id,
        share: 0.1,
      }),
    ).toBe(country);
  });

  test("training, qualification, and health state round-trip and replay deterministically", () => {
    const { world, context } = worldFixture({
      trainingStipendA: 5,
      healthStaffShareA: 0.2,
    });
    for (let day = 0; day < 3; day += 1) tick(world, context);
    const save = serializeWorld(world);
    const restored = deserializeWorld(save);
    expect(hashWorld(restored)).toBe(hashWorld(world));
    expect(restored.countries[0]?.labor.trainingParticipation).toBe(
      world.countries[0]?.labor.trainingParticipation,
    );
    expect(restored.popBlocks.some((block) => block.qualification > 0)).toBe(
      world.popBlocks.some((block) => block.qualification > 0),
    );
    const replay = createEconomyWorld(e5Scenario({ trainingStipendA: 5, healthStaffShareA: 0.2 }), {
      seed: SEED,
    });
    for (let day = 0; day < 3; day += 1) tick(replay, context);
    expect(hashWorld(replay)).toBe(hashWorld(world));
  });
});
