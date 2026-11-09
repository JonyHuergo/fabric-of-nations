/**
 * P7 (D-154) labour market, second part: institutions as employers (plan Q3, Q4), floors
 * and the minimum wage's coverage, compliance and preview (plan §4.2, §4.5), staffing
 * ceilings (plan §4.3), mobility gates (plan §5.3), the two acceptance fixtures of plan
 * §7 (the agricultural share falls in a growing economy; unemployment lowers wages),
 * replay through the rollback runner, and schema-34 saves rejected (plan Q20, D-120).
 */

import {
  assertValidLabourEmployment,
  buildLabourWageTable,
  createEconomyWorld,
  createRollbackRunner,
  deserializeWorld,
  hashWorld,
  institutionFundingRUSDPerYear,
  institutionProfession,
  jobIsCovered,
  labourEligibleWorkforce,
  minimumWagePreview,
  planInstitutionSlots,
  populationTotal,
  refreshEmployment,
  runLabourMonthPhase,
  runTicksWithRollback,
  serializeWorld,
  STAFFING_CEILING_RATE,
  tick,
  updateLabourMarketMonth,
  type EconomyScenarioDef,
  type World,
} from "@century/sim";

import { economyTickContext, totalCash } from "../fixtures/m3e.js";
import { M5_COUNTRY_A, M5_FARM, M5_LABORERS, M5_PEASANTS, M5_REGION_A1, M5_WORKSHOP } from "../fixtures/m5.js";
import { M8_CLERKS_ID } from "../fixtures/m8.js";
import { P7_CLERKS, p7InstitutionScenario, p7Scenario } from "../fixtures/p7.js";

function people(world: World): number {
  return world.popBlocks.reduce((sum, block) => sum + populationTotal(block), 0);
}

function literatePersons(world: World): number {
  let total = 0;
  for (const block of world.popBlocks) {
    for (let age = 0; age < block.maleByAge.length; age += 1) {
      total += ((block.maleByAge[age] ?? 0) + (block.femaleByAge[age] ?? 0)) * (block.literacyByAge[age] ?? 0);
    }
  }
  return total;
}

function withMinimumWageLaw(scenario: EconomyScenarioDef, coverage?: { farmEmployees: boolean; domesticService: boolean }): EconomyScenarioDef {
  const politics = scenario.definitions.politics;
  if (politics === undefined) throw new Error("no politics");
  return {
    ...scenario,
    definitions: {
      ...scenario.definitions,
      politics: {
        ...politics,
        laws: politics.laws.map((law) =>
          law.key === "labor-minimum-wage" && coverage !== undefined ? { ...law, laborMinimumWageCoverage: coverage } : law,
        ),
      },
    },
  };
}

function enactMinimumWage(world: World, scenario: EconomyScenarioDef, countryId: number): void {
  const law = scenario.definitions.politics?.laws.find((entry) => entry.key === "labor-minimum-wage");
  const country = world.countries.find((entry) => entry.id === countryId);
  if (law === undefined || country === undefined) throw new Error("no law or country");
  country.laws.labor = law.id;
}

describe("P7 institutions as employers (plan Q3, Q4)", () => {
  test("institution slots are funding ÷ wage and are filled by the role's profession, one job per worker", () => {
    const scenario = p7InstitutionScenario();
    const world = createEconomyWorld(scenario);
    const country = world.countries.find((entry) => entry.id === M5_COUNTRY_A);
    if (country === undefined) throw new Error("no country A");
    const wages = buildLabourWageTable(world, scenario.definitions);
    const plan = planInstitutionSlots(world, scenario.definitions, wages, world.dayIndex);
    const admin = plan.byCountry.get(M5_COUNTRY_A)?.get("administration");
    if (admin === undefined) throw new Error("no administration slots");
    const funding = institutionFundingRUSDPerYear(world, scenario.definitions, country, "administration");
    expect(admin.slots).toBe(Math.floor(funding / admin.wageRUSDPerYear));
    expect(institutionProfession(scenario.definitions, "administration")?.id).toBe(M8_CLERKS_ID);
    expect(world.labourMarket.institutionEmployment.length).toBeGreaterThan(0);
    for (const assignment of world.labourMarket.institutionEmployment) {
      const block = world.popBlocks.find((entry) => entry.id === assignment.popBlockId);
      expect(block?.professionId).toBe(institutionProfession(scenario.definitions, assignment.institution)?.id);
    }
    expect(() => assertValidLabourEmployment(world, scenario.definitions)).not.toThrow();
  });

  test("a higher wage buys fewer institution staff from the same budget (plan §4.5 item 5)", () => {
    const scenario = p7InstitutionScenario();
    const world = createEconomyWorld(scenario);
    const before = planInstitutionSlots(world, scenario.definitions, buildLabourWageTable(world, scenario.definitions), world.dayIndex)
      .byCountry.get(M5_COUNTRY_A)?.get("administration")?.slots ?? 0;
    for (const territory of world.labourMarket.territories) {
      territory.referenceWageRUSDPerYear[M8_CLERKS_ID] = (territory.referenceWageRUSDPerYear[M8_CLERKS_ID] ?? 0) * 2;
    }
    const after = planInstitutionSlots(world, scenario.definitions, buildLabourWageTable(world, scenario.definitions), world.dayIndex)
      .byCountry.get(M5_COUNTRY_A)?.get("administration")?.slots ?? 0;
    expect(after).toBeLessThan(before);
    expect(after).toBeGreaterThanOrEqual(Math.floor(before / 2) - 1);
  });
});

describe("P7 floors and the minimum wage (plan §4.2, §4.5)", () => {
  test("the statutory floor binds covered jobs at compliance; the self-employed and excluded farm jobs are never floored", () => {
    const scenario = withMinimumWageLaw(p7InstitutionScenario(), { farmEmployees: false, domesticService: false });
    const world = createEconomyWorld(scenario);
    enactMinimumWage(world, scenario, M5_COUNTRY_A);
    const country = world.countries.find((entry) => entry.id === M5_COUNTRY_A);
    if (country === undefined) throw new Error("no country");
    country.institutions.quality = 0.5;
    const wages = buildLabourWageTable(world, scenario.definitions);
    const floor = wages.minimumWage(M5_REGION_A1);
    expect(floor).toBe(300);
    const laborerBase = wages.base(M5_REGION_A1, M5_LABORERS);
    expect(laborerBase).toBeLessThan(floor);
    expect(wages.paid(M5_REGION_A1, M5_LABORERS, true)).toBeCloseTo(laborerBase + 0.5 * (floor - laborerBase), 9);
    expect(wages.paid(M5_REGION_A1, M5_LABORERS, false)).toBe(laborerBase);
    const farm = scenario.definitions.buildings.find((entry) => entry.id === M5_FARM);
    const workshop = scenario.definitions.buildings.find((entry) => entry.id === M5_WORKSHOP);
    const peasant = scenario.definitions.professions.find((entry) => entry.id === M5_PEASANTS);
    const laborer = scenario.definitions.professions.find((entry) => entry.id === M5_LABORERS);
    if (farm === undefined || workshop === undefined || peasant === undefined || laborer === undefined) throw new Error("fixture");
    const coverage = wages.coverage(M5_REGION_A1);
    expect(jobIsCovered(farm, peasant, coverage, wages.domesticServiceKeys)).toBe(false); // self-employed
    expect(jobIsCovered(farm, laborer, coverage, wages.domesticServiceKeys)).toBe(false); // farm employee, excluded
    expect(jobIsCovered(workshop, laborer, coverage, wages.domesticServiceKeys)).toBe(true);
  });

  test("the peasant alternative income floors wage professions and releases when it falls", () => {
    const scenario = p7Scenario();
    const world = createEconomyWorld(scenario);
    const province = world.labourMarket.provinces.find((entry) => entry.provinceId === M5_REGION_A1);
    if (province === undefined) throw new Error("no province state");
    province.peasantAlternativeIncomeRUSDPerYear = 400;
    let wages = buildLabourWageTable(world, scenario.definitions);
    expect(wages.base(M5_REGION_A1, M5_LABORERS)).toBe(400);
    expect(wages.base(M5_REGION_A1, M5_PEASANTS)).toBeCloseTo(180, 9); // the floor is not their own
    province.peasantAlternativeIncomeRUSDPerYear = 100;
    wages = buildLabourWageTable(world, scenario.definitions);
    expect(wages.base(M5_REGION_A1, M5_LABORERS)).toBeCloseTo(250, 9); // released, no ratchet
  });

  test("the preview counts covered workers, workers below the floor and jobs at risk (short-run estimate)", () => {
    const scenario = withMinimumWageLaw(p7InstitutionScenario());
    const world = createEconomyWorld(scenario);
    const preview = minimumWagePreview(world, scenario.definitions, M5_COUNTRY_A, 100_000, world.dayIndex);
    expect(preview.coveredWorkers).toBeGreaterThan(0);
    expect(preview.workersBelowFloor).toBe(preview.coveredWorkers); // everyone earns less than 100,000
    expect(preview.jobsAtRisk).toBeGreaterThan(0); // nothing breaks even at that wage
    const none = minimumWagePreview(world, scenario.definitions, M5_COUNTRY_A, 0, world.dayIndex);
    expect(none.workersBelowFloor).toBe(0);
    expect(none.jobsAtRisk).toBeLessThanOrEqual(preview.jobsAtRisk);
  });
});

describe("P7 staffing ceilings (plan §4.3)", () => {
  test("a building whose value added does not cover the wage lowers its ceiling; work-sharing farms are exempt", () => {
    const scenario = p7Scenario();
    const world = createEconomyWorld(scenario);
    // Clothing worth nothing: the workshop's R is 0, so its ceiling falls by η.
    for (const market of world.markets) market.priceRUSD[2] = 1e-9;
    updateLabourMarketMonth(world, scenario.definitions, world.dayIndex);
    const workshop = world.buildings.find((building) => building.definitionId === M5_WORKSHOP);
    if (workshop === undefined) throw new Error("no workshop");
    const ceiling = world.labourMarket.staffingCeilings.find((entry) => entry.buildingId === workshop.id)?.ceiling;
    expect(ceiling).toBeCloseTo(1 - STAFFING_CEILING_RATE, 6);
    for (const farm of world.buildings.filter((building) => building.definitionId === M5_FARM)) {
      expect(world.labourMarket.staffingCeilings.some((entry) => entry.buildingId === farm.id)).toBe(false);
    }
    // The refresh lays off down to the offered slots.
    refreshEmployment(world, scenario.definitions, world.dayIndex, { force: true });
    const employed = world.employment.filter((entry) => entry.buildingInstanceId === workshop.id).reduce((sum, entry) => sum + entry.workers, 0);
    expect(employed).toBeLessThanOrEqual(Math.floor(200 * (1 - STAFFING_CEILING_RATE)));
    // Prices back: R > 1 raises the ceiling again.
    for (const market of world.markets) market.priceRUSD[2] = 1;
    updateLabourMarketMonth(world, scenario.definitions, world.dayIndex);
    expect(world.labourMarket.staffingCeilings.some((entry) => entry.buildingId === workshop.id)).toBe(false);
  });
});

describe("P7 mobility gates (plan §5.3)", () => {
  const firstOfFebruary = 31;

  function mobilityWorld(adjust?: (scenario: EconomyScenarioDef) => EconomyScenarioDef): { world: World; scenario: EconomyScenarioDef } {
    let scenario = p7Scenario({ clerkJobsPerThroughputUnit: 3_000 });
    if (adjust !== undefined) scenario = adjust(scenario);
    const world = createEconomyWorld(scenario);
    world.dayIndex = firstOfFebruary;
    return { world, scenario };
  }

  test("movers into a literate profession are literate; people, cash and literate persons are conserved", () => {
    const { world, scenario } = mobilityWorld();
    const clerksBefore = world.popBlocks.filter((block) => block.professionId === P7_CLERKS).reduce((sum, block) => sum + populationTotal(block), 0);
    const total = people(world);
    const cash = totalCash(world);
    const literate = literatePersons(world);
    const result = runLabourMonthPhase(world, scenario.definitions, firstOfFebruary);
    expect(result.ran).toBe(true);
    const clerksAfter = world.popBlocks.filter((block) => block.professionId === P7_CLERKS).reduce((sum, block) => sum + populationTotal(block), 0);
    expect(clerksAfter).toBeGreaterThan(clerksBefore);
    expect(people(world)).toBe(total);
    expect(totalCash(world)).toBeCloseTo(cash, 4);
    expect(literatePersons(world)).toBeCloseTo(literate, 4);
    expect(world.labourMarket.history.at(-1)?.mobilityPeople).toBe(result.mobilityPeople);
  });

  test("a closed profession takes nobody, and a capital gate the source cannot meet blocks entry", () => {
    for (const change of [
      (profession: EconomyScenarioDef["definitions"]["professions"][number]) => ({ ...profession, entry: "closed" as const }),
      (profession: EconomyScenarioDef["definitions"]["professions"][number]) => ({ ...profession, gates: [...(profession.gates ?? []), "capital" as const], entryCapitalRUSD: 1e9 }),
    ]) {
      const { world, scenario } = mobilityWorld((base) => ({
        ...base,
        definitions: { ...base.definitions, professions: base.definitions.professions.map((profession) => (profession.id === P7_CLERKS ? change(profession) : profession)) },
      }));
      const before = world.popBlocks.filter((block) => block.professionId === P7_CLERKS).reduce((sum, block) => sum + populationTotal(block), 0);
      runLabourMonthPhase(world, scenario.definitions, firstOfFebruary);
      const after = world.popBlocks.filter((block) => block.professionId === P7_CLERKS).reduce((sum, block) => sum + populationTotal(block), 0);
      expect(after).toBe(before);
    }
  });
});

describe("P7 acceptance fixtures (plan §7)", () => {
  test("in a growing economy with no inputs the agricultural employment share falls year on year", () => {
    // A small open economy: its goods sell at reference (world) prices, which the test
    // holds each day, so the industrial sector's profitability is set by wages alone;
    // labour demand grows by one workshop level a quarter (the stand-in for
    // reinvestment, no new mechanics). The food plant gets a viable recipe (the M5
    // recipe has negative value added, so the hiring rule would close it).
    const base = p7Scenario();
    const scenario: EconomyScenarioDef = {
      ...base,
      definitions: {
        ...base.definitions,
        buildings: base.definitions.buildings.map((building) =>
          building.key === "food-plant"
            ? { ...building, inputs: [{ goodId: 0, quantityPerThroughputUnit: 500 }], jobs: building.jobs.map((job) => ({ ...job, workersPerThroughputUnit: 100 })) }
            : building,
        ),
      },
    };
    const world = createEconomyWorld(scenario);
    const context = economyTickContext(scenario);
    const reference = scenario.definitions.goods.map((good) => good.basePrice1900RUSD);
    const workshopId = world.buildings.find((building) => building.definitionId === M5_WORKSHOP)?.id;
    if (workshopId === undefined) throw new Error("no workshop");
    const definitionById = new Map(scenario.definitions.buildings.map((definition) => [definition.id, definition]));
    const agriculturalShare = (): number => {
      let agricultural = 0;
      let employed = 0;
      for (const assignment of world.employment) {
        employed += assignment.workers;
        const building = world.buildings.find((entry) => entry.id === assignment.buildingInstanceId);
        if (building !== undefined && definitionById.get(building.definitionId)?.sector === "agriculture") agricultural += assignment.workers;
      }
      return agricultural / employed;
    };
    const shares = [agriculturalShare()];
    for (let year = 0; year < 3; year += 1) {
      for (let day = 0; day < 365; day += 1) {
        if (day % 91 === 0) {
          // The staged day publishes fresh building records: look the workshop up each time.
          const workshop = world.buildings.find((building) => building.id === workshopId);
          if (workshop === undefined) throw new Error("workshop lost");
          workshop.level += 1;
          world.employmentDirty = true;
        }
        for (const market of world.markets) reference.forEach((price, goodId) => (market.priceRUSD[goodId] = price));
        tick(world, context);
      }
      shares.push(agriculturalShare());
    }
    for (let index = 1; index < shares.length; index += 1) expect(shares[index]).toBeLessThan(shares[index - 1] as number);
  });

  test("with labour demand fixed and the labour force growing, unemployment rises and wages fall", () => {
    const scenario = p7Scenario();
    const world = createEconomyWorld(scenario);
    const context = economyTickContext(scenario);
    const plant = world.buildings.find((building) => building.provinceId === M5_REGION_A1 && building.definitionId === 1);
    if (plant === undefined) throw new Error("no plant");
    plant.operational = false;
    refreshEmployment(world, scenario.definitions, world.dayIndex, { force: true });
    const wages: number[] = [];
    // Prices held at reference so the price term of the wage rule is zero.
    const reference = scenario.definitions.goods.map((good) => good.basePrice1900RUSD);
    for (let day = 0; day < 4 * 31; day += 1) {
      for (const market of world.markets) reference.forEach((price, goodId) => (market.priceRUSD[goodId] = price));
      tick(world, context);
      if (world.labourMarket.history.length > wages.length) wages.push(world.labourMarket.territories[0]?.referenceWageRUSDPerYear[M5_LABORERS] ?? 0);
    }
    expect(wages.length).toBeGreaterThanOrEqual(3);
    for (let index = 1; index < wages.length; index += 1) expect(wages[index]).toBeLessThan(wages[index - 1] as number);
    const laborers = world.popBlocks.filter((block) => block.professionId === M5_LABORERS && block.provinceId === M5_REGION_A1);
    const laborer = scenario.definitions.professions.find((entry) => entry.id === M5_LABORERS);
    if (laborer === undefined) throw new Error("no laborers");
    const eligible = laborers.reduce((sum, block) => sum + labourEligibleWorkforce(block, laborer), 0);
    expect(eligible).toBeGreaterThan(0);
  });
});

describe("P7 replay and saves", () => {
  test("the rollback runner reproduces months with mobility and block creation", () => {
    const scenario = p7Scenario({ clerkJobsPerThroughputUnit: 3_000 });
    const context = { ...economyTickContext(scenario), integrity: "phase" as const };
    const staged = createEconomyWorld(scenario);
    for (let day = 0; day < 70; day += 1) tick(staged, economyTickContext(scenario));
    const runner = createRollbackRunner(createEconomyWorld(scenario), { worldJustValidated: true });
    runTicksWithRollback(runner, 70, context);
    expect(hashWorld(runner.world)).toBe(hashWorld(staged));
  });

  test("a schema-34 save is rejected as incompatible (plan Q20, D-120)", () => {
    const save = serializeWorld(createEconomyWorld(p7Scenario()));
    const envelope = JSON.parse(save) as Record<string, unknown>;
    envelope.schemaVersion = 34;
    expect(() => deserializeWorld(JSON.stringify(envelope))).toThrow(/Save world schema 34 is incompatible/);
  });
});
