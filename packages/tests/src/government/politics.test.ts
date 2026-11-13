import {
  applyCountryAction,
  assertValidWorld,
  buildFinanceIndex,
  createEconomyWorld,
  deserializeWorld,
  designatedCashTotal,
  governmentPeriodTotals,
  hashWorld,
  lawByKey,
  serializeWorld,
  setInstitutionFunding,
  taxCollectionEfficiency,
  constructionProgressFactor,
  tick,
  validateCountryAction,
  type CountryAction,
  type EconomyScenarioDef,
  type TickContext,
  type World,
  countryProvinceIds,
} from "@century/sim";
import { SimulationHost } from "@century/sim-worker/host";
import { PROTOCOL_VERSION, type WorkerEvent } from "@century/sim-worker";

import {
  M8_COUNTRY_A,
  M8_COUNTRY_B,
  m8PoliticsDefinitions,
  m8Scenario,
} from "../fixtures/m8.js";

const SEED = 20_261_023;

function contextFor(scenario: EconomyScenarioDef): TickContext {
  return {
    population: { definitions: scenario.population.definitions },
    economy: { definitions: scenario.definitions },
  };
}

function worldFor(scenario: EconomyScenarioDef): World {
  return createEconomyWorld(scenario, { seed: SEED });
}

function run(world: World, scenario: EconomyScenarioDef, count: number): void {
  const context = contextFor(scenario);
  for (let index = 0; index < count; index += 1) tick(world, context);
}

function account(
  world: World,
  ownerKind: "country" | "popBlock",
  ownerId: number,
  subtype: "income-tax-revenue" | "administration-expense" | "administration-income",
): number {
  return buildFinanceIndex(world.finance).find(ownerKind, ownerId, subtype)?.balanceRUSD ?? 0;
}

function fiscalAction(countryId: number, rate: number, dayIndex: number): CountryAction {
  return {
    kind: "set-fiscal-policy",
    countryId,
    dayIndex,
    source: "player",
    incomeTaxRate: rate,
    incomeTaxAllowanceRUSDPerYear: 0,
    welfareBudgetRUSDPerYear: 0,
    welfareMaxWealthLevel: 99,
    businessProfitTaxRate: 0,
    reserveTargetRUSD: 0,
  };
}

describe("M8 political institutions", () => {
  test("derives seven interest groups, a state administration, and per-law stances", () => {
    const scenario = m8Scenario();
    const world = worldFor(scenario);
    assertValidWorld(world);
    const country = world.countries.find((entry) => entry.id === M8_COUNTRY_A)!;
    expect(country.interestGroups).toHaveLength(7);
    expect(country.interestGroups.map((group) => group.key)).toEqual([
      "aristocrats",
      "capitalists",
      "labor",
      "intelligentsia",
      "military",
      "bureaucrats",
      "rural",
    ]);
    const ownedPopulation = world.popBlocks
      .filter((block) => countryProvinceIds(world, country.id).includes(block.provinceId))
      .reduce(
        (total, block) =>
          total +
          block.maleByAge.reduce((sum, value) => sum + value, 0) +
          block.femaleByAge.reduce((sum, value) => sum + value, 0),
        0,
      );
    const membership = country.interestGroups.reduce(
      (total, group) => total + group.membershipPopulation,
      0,
    );
    expect(Math.abs(membership - ownedPopulation)).toBeLessThanOrEqual(5);
    const influence = country.interestGroups.reduce((total, group) => total + group.influence, 0);
    expect(influence).toBeCloseTo(1, 5);
    const laws = m8PoliticsDefinitions().laws;
    for (const group of country.interestGroups) {
      expect(Object.keys(group.stanceByLaw)).toHaveLength(laws.length);
    }
    // D-155: the administration's staff are the bureaucrats the labour market assigns,
    // and the creation-time institution state precedes that first assignment, so the
    // administration is read after its first daily refresh.
    run(world, scenario, 1);
    const staffed = world.countries.find((entry) => entry.id === M8_COUNTRY_A)!;
    expect(staffed.institutions.staffedByProfession[2]).toBeGreaterThan(0);
    expect(staffed.institutions.quality).toBeGreaterThan(0);
    expect(staffed.institutions.quality).toBeLessThanOrEqual(1);
    expect(world.politics.eventLog.length).toBeLessThanOrEqual(64);
    expect(world.politics.eventQueue.length).toBeLessThanOrEqual(256);
    expect(country.lawTransitions.length).toBeLessThanOrEqual(4);
  });

  test("pays actual administration payroll and preserves designated cash", () => {
    const scenario = m8Scenario({ fundingA: 3_650 });
    const world = worldFor(scenario);
    const beforeCash = designatedCashTotal(world.finance);
    run(world, scenario, 1);
    const country = world.countries.find((entry) => entry.id === M8_COUNTRY_A)!;
    const paid = account(world, "country", country.id, "administration-expense");
    const received = account(world, "popBlock", 7, "administration-income");
    expect(paid).toBeGreaterThan(0);
    expect(received).toBeCloseTo(paid, 6);
    expect(designatedCashTotal(world.finance)).toBeCloseTo(beforeCash, 6);
    expect(country.institutions.fundingRequestedMonthToDateRUSD).toBeGreaterThan(0);
    expect(country.institutions.fundingShortfallMonthToDateRUSD).toBeGreaterThanOrEqual(0);
    assertValidWorld(world);
  });

  test("higher administration funding raises derived quality and actual income-tax collection", () => {
    const high = m8Scenario({ fundingA: 10_000 });
    const low = m8Scenario({ fundingA: 0 });
    const highWorld = worldFor(high);
    const lowWorld = worldFor(low);
    // D-155: institution quality follows the assigned staff, read after the first day.
    run(highWorld, high, 1);
    run(lowWorld, low, 1);
    const highCountry = highWorld.countries.find((entry) => entry.id === M8_COUNTRY_A)!;
    const lowCountry = lowWorld.countries.find((entry) => entry.id === M8_COUNTRY_A)!;
    expect(highCountry.institutions.quality).toBeGreaterThan(lowCountry.institutions.quality);
    expect(taxCollectionEfficiency(highCountry)).toBeGreaterThan(
      taxCollectionEfficiency(lowCountry),
    );
    run(highWorld, high, 5);
    run(lowWorld, low, 5);
    const highTax = account(highWorld, "country", M8_COUNTRY_A, "income-tax-revenue");
    const lowTax = account(lowWorld, "country", M8_COUNTRY_A, "income-tax-revenue");
    expect(highTax).toBeGreaterThan(lowTax);
  });

  test("institution overload reduces construction progress and lengthens enactment", () => {
    const scenario = m8Scenario({ fundingA: 0 });
    const world = worldFor(scenario);
    const country = world.countries.find((entry) => entry.id === M8_COUNTRY_A)!;
    country.institutions = { ...country.institutions, quality: 0.4, overload: 1 };
    expect(constructionProgressFactor(country)).toBeLessThan(1);
    expect(taxCollectionEfficiency(country)).toBeLessThan(1);
    const progressive = lawByKey(m8PoliticsDefinitions(), "taxation-progressive");
    const applied = applyCountryAction(
      world,
      {
        kind: "propose-law",
        countryId: M8_COUNTRY_A,
        dayIndex: 0,
        source: "player",
        lawId: progressive.id,
      },
      scenario.definitions,
    );
    expect(applied.lawAction?.effectiveDay).toBeGreaterThan(progressive.enactmentDays);
  });

  test("a law proposal validates support, regime, prerequisites, and enacting state", () => {
    const scenario = m8Scenario();
    const world = worldFor(scenario);
    const progressive = lawByKey(m8PoliticsDefinitions(), "taxation-progressive");
    const maleSuffrage = lawByKey(m8PoliticsDefinitions(), "suffrage-male");
    const noSuffrage = lawByKey(m8PoliticsDefinitions(), "suffrage-none");

    const invalidRegime = validateCountryAction(world, {
      kind: "propose-law",
      countryId: M8_COUNTRY_B,
      dayIndex: 0,
      source: "player",
      lawId: maleSuffrage.id,}, scenario.definitions);
    expect(invalidRegime.valid).toBe(false);
    expect(invalidRegime.errors.some((error) => /regime/.test(error))).toBe(true);

    const rejectedSupport = validateCountryAction(world, {
      kind: "propose-law",
      countryId: M8_COUNTRY_A,
      dayIndex: 0,
      source: "player",
      lawId: noSuffrage.id,}, scenario.definitions);
    expect(rejectedSupport.valid).toBe(false);

    const already = validateCountryAction(world, {
      kind: "propose-law",
      countryId: M8_COUNTRY_A,
      dayIndex: 0,
      source: "player",
      lawId: maleSuffrage.id,}, scenario.definitions);
    expect(already.valid).toBe(false);

    const ai = validateCountryAction(world, {
      kind: "propose-law",
      countryId: M8_COUNTRY_A,
      dayIndex: 0,
      source: "ai",
      lawId: progressive.id,}, scenario.definitions);
    expect(ai.valid).toBe(false);

    const valid = validateCountryAction(world, {
      kind: "propose-law",
      countryId: M8_COUNTRY_A,
      dayIndex: 0,
      source: "player",
      lawId: progressive.id,}, scenario.definitions);
    expect(valid.valid).toBe(true);
  });

  test("a law becomes effective only on its effective day and then constrains fiscal policy", () => {
    const scenario = m8Scenario();
    const world = worldFor(scenario);
    const progressive = lawByKey(m8PoliticsDefinitions(), "taxation-progressive");
    const proposed = applyCountryAction(
      world,
      {
        kind: "propose-law",
        countryId: M8_COUNTRY_A,
        dayIndex: 0,
        source: "player",
        lawId: progressive.id,
      },
      scenario.definitions,
    );
    expect(proposed.lawAction?.effectiveDay).toBeGreaterThan(0);
    const effectiveDay = proposed.lawAction!.effectiveDay;

    const before = validateCountryAction(world, fiscalAction(M8_COUNTRY_A, 0.5, 0), scenario.definitions);
    expect(before.valid).toBe(false);

    run(world, scenario, effectiveDay + 1);
    expect(world.dayIndex).toBe(effectiveDay + 1);
    const afterCountry = world.countries.find((entry) => entry.id === M8_COUNTRY_A)!;
    expect(afterCountry.laws.taxation).toBe(progressive.id);
    const after = validateCountryAction(
      world,
      fiscalAction(M8_COUNTRY_A, 0.5, effectiveDay + 1),
      scenario.definitions,
    );
    expect(after.valid).toBe(true);
    applyCountryAction(
      world,
      fiscalAction(M8_COUNTRY_A, 0.5, effectiveDay + 1),
      scenario.definitions,
    );
    const appliedCountry = world.countries.find((entry) => entry.id === M8_COUNTRY_A)!;
    expect(appliedCountry.fiscal.incomeTaxRate).toBeCloseTo(0.5, 9);
    assertValidWorld(world);
  });

  test("a successful election changes the governing group; a timer alone does not", () => {
    const scenario = m8Scenario();
    const politics = JSON.parse(JSON.stringify(m8PoliticsDefinitions())) as ReturnType<
      typeof m8PoliticsDefinitions
    >;
    for (const law of politics.laws) {
      for (const key of Object.keys(law.groupStance)) {
        (law.groupStance as Record<string, number>)[key] = -1;
      }
    }
    scenario.definitions = { ...scenario.definitions, politics };
    const world = worldFor(scenario);
    const initial = world.countries.find((entry) => entry.id === M8_COUNTRY_A)!;
    initial.laws = {
      ...initial.laws,
      suffrage: lawByKey(politics, "suffrage-male").id,
    };
    initial.regime = { ...initial.regime, nextElectionDay: 31 };
    run(world, scenario, 32);
    const country = world.countries.find((entry) => entry.id === M8_COUNTRY_A)!;
    expect(country.regime.lastElectionDay).toBe(31);
    expect(country.regime.lastElection).not.toBeNull();
    expect(country.regime.lastElection?.governmentVoteShare).toBeLessThan(0.5);
    expect(country.regime.governmentGroupKey).not.toBe("capitalists");

    const monarchyScenario = m8Scenario();
    const monarchyWorld = worldFor(monarchyScenario);
    const monarchy = monarchyWorld.countries.find((entry) => entry.id === M8_COUNTRY_B)!;
    monarchy.regime = { ...monarchy.regime, nextElectionDay: 0 };
    run(monarchyWorld, monarchyScenario, 1);
    const monarchyAfter = monarchyWorld.countries.find((entry) => entry.id === M8_COUNTRY_B)!;
    expect(monarchyAfter.regime.lastElection).toBeNull();
  });

  test("sustained pressure produces a regime crisis and revolution from simulated causes", () => {
    const scenario = m8Scenario();
    const world = worldFor(scenario);
    run(world, scenario, 31);
    expect(world.dayIndex).toBe(31);
    const country = world.countries.find((entry) => entry.id === M8_COUNTRY_B)!;
    for (const block of world.popBlocks) {
      if (countryProvinceIds(world, country.id).includes(block.provinceId)) {
        block.militancy = 0.95;
        block.unmetSubsistenceDays = 30;
      }
    }
    for (const provinceId of countryProvinceIds(world, country.id)) {
      const province = world.provinceEconomies.find((entry) => entry.id === provinceId)!;
      province.unrest = 0.95;
    }
    country.regime = {
      ...country.regime,
      crisis: { ...country.regime.crisis, pressureDays: 360 },
    };
    run(world, scenario, 1);
    const after = world.countries.find((entry) => entry.id === M8_COUNTRY_B)!;
    expect(after.regime.kind).toBe("republic");
    expect(after.regime.crisis.lastRevolutionDay).toBe(31);
    expect(after.laws.suffrage).toBe(
      m8PoliticsDefinitions().regimes.find((regime) => regime.kind === "republic")!
        .defaultLaws.suffrage,
    );
    expect(after.institutions.disruptionUntilDay).not.toBeNull();
    expect(world.politics.eventLog.some((entry) => entry.kind === "revolution")).toBe(true);
    assertValidWorld(world);
  });

  test("provincial unrest responds to real needs and militancy", () => {
    const scenario = m8Scenario();
    const world = worldFor(scenario);
    const country = world.countries.find((entry) => entry.id === M8_COUNTRY_A)!;
    for (const block of world.popBlocks) {
      if (countryProvinceIds(world, country.id).includes(block.provinceId)) {
        block.militancy = 0.8;
        block.unmetSubsistenceDays = 14;
      }
    }
    const before = world.provinceEconomies[0]!.unrest;
    run(world, scenario, 10);
    expect(world.provinceEconomies[0]!.unrest).toBeGreaterThan(before);
  });

  test("scripted events apply once with provenance and survive save/load", () => {
    const scenario = m8Scenario();
    const world = worldFor(scenario);
    const eventDef = m8PoliticsDefinitions().events[0]!;
    world.politics.eventQueue.push({
      id: world.politics.nextEventId,
      definitionId: eventDef.id,
      key: eventDef.key,
      countryId: M8_COUNTRY_A,
      dueDay: 0,
      appliedDay: null,
      status: "scheduled",
      provenance: eventDef.provenance,
    });
    world.politics.nextEventId += 1;
    run(world, scenario, 1);
    const entry = world.politics.eventQueue.find((event) => event.key === eventDef.key)!;
    expect(entry.status).toBe("applied");
    expect(entry.appliedDay).toBe(0);
    expect(world.politics.eventLog.some((log) => log.provenance === eventDef.provenance)).toBe(
      true,
    );
    const unrestAfterFirst = world.provinceEconomies[0]!.unrest;
    run(world, scenario, 1);
    expect(entry.status).toBe("applied");
    expect(world.provinceEconomies[0]!.unrest).not.toBeCloseTo(unrestAfterFirst + 0.15, 9);

    const roundTripped = deserializeWorld(serializeWorld(world));
    expect(hashWorld(roundTripped)).toBe(hashWorld(world));
  });

  test("law state and institution funding round-trip and replay deterministically", () => {
    const scenario = m8Scenario();
    const first = worldFor(scenario);
    const progressive = lawByKey(m8PoliticsDefinitions(), "taxation-progressive");
    applyCountryAction(
      first,
      {
        kind: "propose-law",
        countryId: M8_COUNTRY_A,
        dayIndex: 0,
        source: "player",
        lawId: progressive.id,
      },
      scenario.definitions,
    );
    setInstitutionFunding(
      first,
      scenario.definitions,
      { countryId: M8_COUNTRY_A, annualRUSD: 4_000 },
      0,
    );
    const saved = serializeWorld(first);
    const resumed = deserializeWorld(saved);
    expect(hashWorld(resumed)).toBe(hashWorld(first));
    run(first, scenario, 400);
    run(resumed, scenario, 400);
    expect(hashWorld(resumed)).toBe(hashWorld(first));
  });

  test("monthly reports carry administration expense and reconcile", () => {
    const scenario = m8Scenario({ fundingA: 3_650 });
    const world = worldFor(scenario);
    run(world, scenario, 31);
    const summary = world.finance.periodSummaries[0]!;
    const totals = governmentPeriodTotals(world.finance, summary).find(
      (entry) => entry.countryId === M8_COUNTRY_A,
    )!;
    const budget = summary.countryBudgetTotals[M8_COUNTRY_A]!;
    expect(totals.administrationExpenseRUSD).toBeGreaterThan(0);
    expect(budget.administrationRequestedRUSD).toBeGreaterThanOrEqual(
      totals.administrationExpenseRUSD ?? 0,
    );
    expect(totals.netFiscalResultRUSD).toBeCloseTo(
      totals.incomeTaxRevenueRUSD +
        totals.businessTaxRevenueRUSD -
        totals.welfareExpenseRUSD -
        totals.interestExpenseRUSD -
        totals.subsidyExpenseRUSD -
        (totals.administrationExpenseRUSD ?? 0),
      6,
    );
  });

  test("worker protocol validates political actions and exposes an immutable snapshot", () => {
    const events: WorkerEvent[] = [];
    const host = new SimulationHost({
      scenario: m8Scenario(),
      seed: SEED,
      emit: (event) => events.push(event),
      autoPump: false,
      clock: () => 1_000,
    });
    const command = (type: string, id: string, extra: Record<string, unknown> = {}): void => {
      host.handleCommand({ protocolVersion: PROTOCOL_VERSION, type, commandId: id, ...extra });
    };
    const progressive = lawByKey(m8PoliticsDefinitions(), "taxation-progressive");
    command("APPLY_ACTION", "a1", {
      actionId: "law-1",
      action: { kind: "propose-law", countryId: M8_COUNTRY_A, lawId: progressive.id },
    });
    command("APPLY_ACTION", "a2", {
      actionId: "fund-1",
      action: { kind: "set-institution-funding", countryId: M8_COUNTRY_A, annualRUSD: 1_000 },
    });
    command("REQUEST_SNAPSHOT", "s1");
    const snapshot = events
      .filter(
        (event): event is Extract<WorkerEvent, { type: "SNAPSHOT" }> => event.type === "SNAPSHOT",
      )
      .at(-1)!.snapshot;
    const country = snapshot.countries.find((entry) => entry.id === M8_COUNTRY_A)!;
    expect(country.politics.enabled).toBe(true);
    expect(country.politics.lawTransitions).toHaveLength(1);
    expect(country.politics.institution.fundedAnnualRUSD).toBe(1_000);
    expect(Object.isFrozen(country.politics)).toBe(true);

    command("SAVE", "save-before");
    const saveBefore = events
      .filter(
        (event): event is Extract<WorkerEvent, { type: "SAVE_RESULT" }> =>
          event.type === "SAVE_RESULT",
      )
      .at(-1)!.save;
    command("APPLY_ACTION", "a3", {
      actionId: "law-2",
      action: { kind: "propose-law", countryId: M8_COUNTRY_A, lawId: 999 },
    });
    const rejected = events
      .filter((event) => event.type === "ACTION_RESULT")
      .at(-1) as Extract<WorkerEvent, { type: "ACTION_RESULT" }>;
    expect(rejected.accepted).toBe(false);
    command("SAVE", "save-after");
    const saveAfter = events
      .filter(
        (event): event is Extract<WorkerEvent, { type: "SAVE_RESULT" }> =>
          event.type === "SAVE_RESULT",
      )
      .at(-1)!.save;
    expect(saveAfter).toBe(saveBefore);
  });
});
