import {
  applyAnnualAgeing,
  buildFinanceIndex,
  createEconomyWorld,
  deriveEducation,
  deserializeWorld,
  hashWorld,
  lawDefinition,
  mergeBlockLiteracyByAge,
  proposeLaw,
  runEconomicDay,
  runPoliticsDayStart,
  serializeWorld,
  syncBlockLiteracy,
  tick,
  type EconomyScenarioDef,
  type TickContext,
  type World,
  countryProvinceIds,
} from "@century/sim";

import {
  M9_ACADEMICS_BLOCK,
  M9_EDUCATION_FUNDING,
  m9Scenario,
} from "../fixtures/m9.js";
import { M5_COUNTRY_A } from "../fixtures/m5.js";

const SEED = 20_261_029;

function contextFor(scenario: EconomyScenarioDef): TickContext {
  return {
    population: { definitions: scenario.population.definitions },
    economy: { definitions: scenario.definitions },
  };
}

function fixture(options: Parameters<typeof m9Scenario>[0] = {}): {
  readonly scenario: EconomyScenarioDef;
  readonly world: World;
  readonly context: TickContext;
  readonly country: World["countries"][number];
} {
  const scenario = m9Scenario(options);
  const world = createEconomyWorld(scenario, { seed: SEED });
  const country = world.countries.find((entry) => entry.id === M5_COUNTRY_A);
  if (country === undefined) throw new Error("fixture is missing country A");
  return { scenario, world, context: contextFor(scenario), country };
}

function academicsBlock(world: World): World["popBlocks"][number] {
  const block = world.popBlocks.find((entry) => entry.id === M9_ACADEMICS_BLOCK);
  if (block === undefined) throw new Error("fixture is missing the academics block");
  return block;
}

function designatedCash(world: World): number {
  return buildFinanceIndex(world.finance)
    .cash()
    .reduce((total, account) => total + account.balanceRUSD, 0);
}

describe("M9 education institution and staffing", () => {
  test("derives academic staffing, teaching capacity, attendance, and quality from real state", () => {
    const { scenario, world, country } = fixture();
    const derived = deriveEducation(world, country, scenario.definitions);
    expect(derived.availableAcademicWorkers).toBeGreaterThan(0);
    expect(derived.researchStaff).toBeGreaterThan(0);
    expect(derived.teacherStaff).toBeGreaterThan(0);
    expect(derived.schoolAgePopulation).toBeGreaterThan(0);
    expect(derived.teachingCapacityStudents).toBeGreaterThan(0);
    expect(derived.attendanceRate).toBeGreaterThan(0);
    expect(derived.attendanceRate).toBeLessThanOrEqual(1);
    expect(derived.quality).toBeGreaterThan(0);
    expect(derived.fundingAdequacy).toBeGreaterThan(0);
    expect(derived.researchStaff + derived.teacherStaff).toBeCloseTo(
      derived.availableAcademicWorkers,
      6,
    );
  });

  test("a country with no academics has no teaching or research staff", () => {
    const { scenario, world } = fixture();
    const countryB = world.countries.find((entry) => entry.id === 1);
    if (countryB === undefined) throw new Error("fixture is missing country B");
    const derived = deriveEducation(world, countryB, scenario.definitions);
    expect(derived.availableAcademicWorkers).toBe(0);
    expect(derived.teachingCapacityStudents).toBe(0);
    expect(derived.enrolledStudents).toBe(0);
    expect(derived.researchBlockedReason).toBe("no-academic-staff");
  });
});

describe("M9 education payroll accounting", () => {
  test("pays a cash-neutral education payroll and reports requested and shortfall", () => {
    const { scenario, world, country } = fixture();
    const cashBefore = designatedCash(world);
    runEconomicDay(
      world,
      scenario.population.definitions,
      scenario.definitions,
      world.dayIndex,
    );
    const after = buildFinanceIndex(world.finance);
    const treasury = after.get("country", M5_COUNTRY_A, "treasury-cash");
    const expense = after.get("country", M5_COUNTRY_A, "education-expense").balanceRUSD;
    const income = after.get("popBlock", M9_ACADEMICS_BLOCK, "education-income").balanceRUSD;
    // D-155: the schools pay their assigned teachers and researchers the market wage
    // (P7 plan Q4); the funding sets how many posts there are, so the day's payroll is
    // positive and at most the budget's daily share (formerly exactly that share, paid
    // to the academics' population).
    const expectedDaily = expense;
    expect(expense).toBeGreaterThan(0);
    expect(expense).toBeLessThanOrEqual(M9_EDUCATION_FUNDING / 365 + 1e-9);
    expect(income).toBeCloseTo(expense, 6);
    // The payroll's treasury credit equals the education expense.
    const payroll = world.finance.postings.find(
      (posting) => posting.transactionKind === "education-payroll",
    );
    expect(payroll).toBeDefined();
    const treasuryCredits = (payroll?.lines ?? [])
      .filter((line) => line.accountId === treasury.id && line.side === "credit")
      .reduce((total, line) => total + line.amountRUSD, 0);
    expect(treasuryCredits).toBeCloseTo(expense, 6);
    // The transfer moves existing designated cash; it does not create money.
    expect(designatedCash(world)).toBeCloseTo(cashBefore, 6);
    expect(
      world.finance.postings.some((posting) => posting.transactionKind === "education-payroll"),
    ).toBe(true);
    // The memo's request is the budget's daily share; nothing owed went unpaid.
    expect(country.education.fundingRequestedMonthToDateRUSD).toBeCloseTo(M9_EDUCATION_FUNDING / 365, 6);
    expect(country.education.fundingRequestedMonthToDateRUSD).toBeGreaterThanOrEqual(expectedDaily - 1e-9);
    expect(country.education.fundingShortfallMonthToDateRUSD).toBe(0);
  });

  test("treasury cash limits the payroll and records an explicit shortfall, not debt", () => {
    // D-155: the payroll is the assigned staff's wages (P7 plan Q4), which a large budget
    // does not raise past the posts the population can fill, so the treasury itself is
    // limited: the reserve target leaves 1 RUSD payable.
    const { scenario, world, country } = fixture({ fundingA: 1_000_000_000 });
    const treasuryCash = buildFinanceIndex(world.finance).get("country", M5_COUNTRY_A, "treasury-cash").balanceRUSD;
    country.fiscal = { ...country.fiscal, reserveTargetRUSD: Math.max(0, treasuryCash - 1) };
    runEconomicDay(
      world,
      scenario.population.definitions,
      scenario.definitions,
      world.dayIndex,
    );
    expect(country.education.fundingShortfallMonthToDateRUSD).toBeGreaterThan(0);
    // The unpaid part is recorded; the request (the budget's share) covers it and the paid part.
    expect(country.education.fundingRequestedMonthToDateRUSD).toBeGreaterThanOrEqual(
      country.education.fundingShortfallMonthToDateRUSD +
        buildFinanceIndex(world.finance).get("country", M5_COUNTRY_A, "education-expense").balanceRUSD -
        1e-6,
    );
    // No debt or payable account is created for the unpaid request.
    const liabilities = world.finance.accounts.filter(
      (account) => account.ownerKind === "country" && account.category === "liability",
    );
    expect(liabilities).toHaveLength(0);
  });

  test("the month-to-date memo resets at the next civil month", () => {
    const { scenario, world } = fixture();
    // Process days 0..31: day 31 is 1900-02-01, which resets the memo and then
    // accumulates that day's request. The clock then points at 1900-02-02.
    for (let index = 0; index < 32; index += 1) tick(world, contextFor(scenario));
    expect(world.dayIndex).toBe(32);
    const current = world.countries.find((entry) => entry.id === M5_COUNTRY_A);
    if (current === undefined) throw new Error("world lost country A after ticks");
    expect(current.education.fundingRequestedMonthToDateRUSD).toBeCloseTo(
      M9_EDUCATION_FUNDING / 365,
      6,
    );
  });
});

describe("M9 age-specific literacy", () => {
  test("schooling raises only the school-age cohort and leaves the adult aggregate unchanged", () => {
    const { scenario, world, country } = fixture();
    const block = academicsBlock(world);
    expect(block.literacyByAge.slice(5, 15).every((value) => value === 0)).toBe(true);
    expect(block.literacyByAge[15]).toBeCloseTo(0.95, 9);
    const adultBefore = block.literacy;

    runEconomicDay(
      world,
      scenario.population.definitions,
      scenario.definitions,
      world.dayIndex,
    );
    for (let age = 5; age <= 14; age += 1) {
      expect(block.literacyByAge[age]).toBeGreaterThan(0);
    }
    for (let age = 0; age < 5; age += 1) {
      expect(block.literacyByAge[age]).toBe(0);
    }
    for (let age = 15; age < block.literacyByAge.length; age += 1) {
      expect(block.literacyByAge[age]).toBeCloseTo(0.95, 9);
    }
    expect(block.literacy).toBeCloseTo(adultBefore, 9);
    expect(country.id).toBe(M5_COUNTRY_A);
  });

  test("no funding and no academic staff both block literacy gain", () => {
    const unfunded = fixture({ fundingA: 0 });
    const unfundedBlock = academicsBlock(unfunded.world);
    runEconomicDay(
      unfunded.world,
      unfunded.scenario.population.definitions,
      unfunded.scenario.definitions,
      unfunded.world.dayIndex,
    );
    expect(unfundedBlock.literacyByAge.slice(5, 15).every((value) => value === 0)).toBe(
      true,
    );

    const staffless = fixture({ fundingB: 10_000 });
    const countryB = staffless.world.countries.find((entry) => entry.id === 1);
    if (countryB === undefined) throw new Error("fixture is missing country B");
    const blocksBefore = staffless.world.popBlocks
      .filter((block) => countryProvinceIds(staffless.world, countryB.id).includes(block.provinceId))
      .map((block) => block.literacyByAge.slice());
    runEconomicDay(
      staffless.world,
      staffless.scenario.population.definitions,
      staffless.scenario.definitions,
      staffless.world.dayIndex,
    );
    const blocksAfter = staffless.world.popBlocks.filter((block) =>
      countryProvinceIds(staffless.world, countryB.id).includes(block.provinceId),
    );
    for (let index = 0; index < blocksAfter.length; index += 1) {
      expect(blocksAfter[index]?.literacyByAge).toEqual(blocksBefore[index]);
    }
  });

  test("annual ageing carries literacy with the cohort and blends the open-ended slot", () => {
    const { world } = fixture();
    const block = academicsBlock(world);
    block.literacyByAge[14] = 1;
    block.literacyByAge[15] = 0.2;
    syncBlockLiteracy(block);
    const adultBefore = block.literacy;

    applyAnnualAgeing(world);
    // Age 14's people and literacy moved into age 15.
    expect(block.literacyByAge[15]).toBeCloseTo(1, 9);
    expect(block.literacyByAge[14]).toBe(0);
    expect(block.literacy).toBeGreaterThan(adultBefore);

    // 80+ blends the incoming 79 cohort with the surviving 80+ population.
    block.maleByAge[79] = 10;
    block.femaleByAge[79] = 0;
    block.maleByAge[80] = 30;
    block.femaleByAge[80] = 0;
    block.literacyByAge[79] = 1;
    block.literacyByAge[80] = 0.4;
    applyAnnualAgeing(world);
    // 10 people at literacy 1 join 30 people at 0.4: (10 + 12) / 40 = 0.55.
    expect(block.literacyByAge[80]).toBeCloseTo(0.55, 9);
  });

  test("migration merges literacy by age with the moved cells", () => {
    const { world } = fixture();
    const destination = academicsBlock(world);
    const source = world.popBlocks.find(
      (block) => block.id !== destination.id && block.provinceId !== destination.provinceId,
    );
    if (source === undefined) throw new Error("fixture has no second-province block");
    destination.literacyByAge[5] = 0.9;
    source.literacyByAge[5] = 1;
    const destinationMaleBefore = [...destination.maleByAge];
    const destinationFemaleBefore = [...destination.femaleByAge];
    destinationMaleBefore[5] = 90;
    destinationFemaleBefore[5] = 0;
    destination.maleByAge[5] = 90;
    destination.femaleByAge[5] = 0;
    syncBlockLiteracy(destination);
    const moved = new Array<number>(destination.literacyByAge.length).fill(0);
    moved[5] = 10;
    mergeBlockLiteracyByAge(
      destination,
      source,
      destinationMaleBefore,
      destinationFemaleBefore,
      moved,
      moved.map(() => 0),
    );
    // (90 × 0.9 + 10 × 1) / 100 = 0.91
    expect(destination.literacyByAge[5]).toBeCloseTo(0.91, 9);
    // The source keeps its rate.
    expect(source.literacyByAge[5]).toBeCloseTo(1, 9);
  });

  test("literacy state round-trips through the canonical save", () => {
    const { scenario, world, context } = fixture();
    for (let index = 0; index < 3; index += 1) tick(world, context);
    const block = academicsBlock(world);
    const expected = [...block.literacyByAge];
    const restored = deserializeWorld(serializeWorld(world));
    expect(academicsBlock(restored).literacyByAge).toEqual(expected);
    expect(hashWorld(restored)).toBe(hashWorld(world));
    expect(scenario.definitions.technology).toBeDefined();
  });
});

describe("M9 education law integration", () => {
  test("a technology-gated education law becomes effective on its effective day and raises attendance", () => {
    // D-155: teachers are the posts the budget funds at the market wage (P7 plan Q4), so
    // the budget is large enough for school places not to bind and the law's attendance
    // floor to show (the fixture budget pays only a few teachers).
    const { scenario, world, country } = fixture({
      researchedA: ["primary-schooling", "compulsory-education-systems"],
      fundingA: 10_000_000,
    });
    const definitions = scenario.definitions;
    const politics = definitions.politics;
    if (politics === undefined) throw new Error("fixture has no politics definitions");
    const universal = lawDefinition(politics, 16);
    if (universal === null) throw new Error("fixture is missing the universal education law");
    expect(country.laws.education).toBe(13);
    const attendanceBefore = deriveEducation(world, country, definitions).attendanceRate;

    const proposal = proposeLaw(
      world,
      definitions,
      { countryId: M5_COUNTRY_A, lawId: 16 },
      world.dayIndex,
      "player",
    );
    expect(proposal.transition.effectiveDay).toBeGreaterThan(world.dayIndex);
    // Before the effective day the law is not applied.
    runPoliticsDayStart(world, definitions, proposal.transition.effectiveDay - 1);
    expect(country.laws.education).toBe(13);
    expect(deriveEducation(world, country, definitions).attendanceRate).toBeCloseTo(
      attendanceBefore,
      9,
    );
    // On the effective day the law applies forward.
    runPoliticsDayStart(world, definitions, proposal.transition.effectiveDay);
    expect(country.laws.education).toBe(16);
    const attendanceAfter = deriveEducation(world, country, definitions).attendanceRate;
    expect(attendanceAfter).toBeGreaterThan(attendanceBefore);
    expect(attendanceAfter).toBeLessThanOrEqual(1);
  });

  test("the compulsory education law is rejected until its technology is researched", () => {
    const { scenario, world } = fixture();
    expect(() =>
      proposeLaw(
        world,
        scenario.definitions,
        { countryId: M5_COUNTRY_A, lawId: 15 },
        world.dayIndex,
        "player",
      ),
    ).toThrow(/prerequisites/);
  });
});
