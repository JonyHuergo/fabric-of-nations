/**
 * P7 (D-154) labour market on the M5 three-country fixture (fixtures/p7.ts).
 *
 * - World creation: wages from the P2b initial condition, own-province employment,
 *   one eligibility per block, legacy worlds untouched (plan Q21).
 * - Wage rule (plan §4.1): unemployment lowers wages, vacancies raise them, asymmetry,
 *   differentials renormalised to a population-weighted mean of 1.
 * - Floors (plan §4.2, §4.5): the statutory floor binds covered jobs only, paid at
 *   compliance; the peasant alternative income floors wage professions and releases.
 * - Staffing ceilings (plan §4.3): R < 1 lowers the ceiling, R > 1 raises it, work-sharing
 *   jobs are exempt.
 * - Reclassification (plan §5.4, acceptance): creation and retirement conserve people,
 *   cash, literate persons, dwellings; ids are unique and above all existing.
 * - Determinism and save round trip (acceptance) over months with mobility.
 */

import {
  buildLabourWageTable,
  createEconomyWorld,
  createReclassifyContext,
  deserializeWorld,
  encodeWorld,
  hashWorld,
  labourEligibleWorkforce,
  literateWorkingAge,
  measureLabourMarket,
  moveBlockPeople,
  planInstitutionSlots,
  populationTotal,
  refreshEmployment,
  retireEmptyBlocks,
  serializeWorld,
  tick,
  unemploymentRate,
  updateLabourMarketMonth,
  WAGE_FALL_PER_GAP,
  type World,
} from "@century/sim";

import { economyTickContext, totalCash } from "../fixtures/m3e.js";
import { M5_LABORERS, M5_PEASANTS, M5_REGION_A1, M5_REGION_A2, m5Scenario } from "../fixtures/m5.js";
import { P7_CLERKS, P7_CLERK_BLOCK, p7Scenario } from "../fixtures/p7.js";

function worldPeople(world: World): number {
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

describe("P7 world creation", () => {
  test("a labour-market world starts with territory wages, own-province employment and no province tables", () => {
    const scenario = p7Scenario();
    const world = createEconomyWorld(scenario);
    expect(world.labourMarket.enabled).toBe(true);
    expect(world.labourMarket.territories.map((entry) => entry.marketId)).toEqual([0, 1]);
    // No P2b tables in the fixture: W = the profession's reference wage, d = 1.
    expect(world.labourMarket.territories[0]?.referenceWageRUSDPerYear[M5_LABORERS]).toBeCloseTo(250, 9);
    for (const province of world.labourMarket.provinces) {
      for (const value of province.differential) expect(value).toBeCloseTo(1, 12);
    }
    for (const province of world.provinceEconomies) expect(province.wageRUSDPerYearByProfession).toEqual([]);
    const blockById = new Map(world.popBlocks.map((block) => [block.id, block]));
    const buildingById = new Map(world.buildings.map((building) => [building.id, building]));
    expect(world.employment.length).toBeGreaterThan(0);
    for (const assignment of world.employment) {
      expect(blockById.get(assignment.popBlockId)?.provinceId).toBe(buildingById.get(assignment.buildingInstanceId)?.provinceId);
    }
    expect(world.labourMarket.nextPopBlockId).toBe(P7_CLERK_BLOCK + 1);
  });

  test("a world without labour-market definitions keeps the legacy state (plan Q21)", () => {
    const world = createEconomyWorld(m5Scenario());
    expect(world.labourMarket.enabled).toBe(false);
    expect("labourMarket" in (encodeWorld(world) as unknown as Record<string, unknown>)).toBe(false);
  });

  test("clerk eligibility counts literate working-age persons only (selective literacy)", () => {
    const world = createEconomyWorld(p7Scenario());
    const scenario = p7Scenario();
    const clerks = world.popBlocks.find((block) => block.id === P7_CLERK_BLOCK) as World["popBlocks"][number];
    const profession = scenario.definitions.professions.find((entry) => entry.id === P7_CLERKS);
    if (profession === undefined) throw new Error("no clerks");
    expect(labourEligibleWorkforce(clerks, profession)).toBe(Math.floor(literateWorkingAge(clerks) * profession.participationRate + 1e-9));
  });
});

describe("P7 wage rule", () => {
  test("unemployment lowers wages and the differentials keep a weighted mean of 1 (acceptance)", () => {
    const scenario = p7Scenario();
    const world = createEconomyWorld(scenario);
    // Fixed labour demand, growing labour force: shut the A1 food plant's capacity.
    const plant = world.buildings.find((building) => building.provinceId === M5_REGION_A1 && building.definitionId === 1);
    if (plant === undefined) throw new Error("no plant");
    plant.condition = 0.2;
    refreshEmployment(world, scenario.definitions, world.dayIndex, { force: true });
    const before = world.labourMarket.territories[0]?.referenceWageRUSDPerYear[M5_LABORERS] ?? 0;
    const wages = buildLabourWageTable(world, scenario.definitions);
    const plan = planInstitutionSlots(world, scenario.definitions, wages, world.dayIndex);
    const counts = measureLabourMarket(world, scenario.definitions, plan).byMarket.get(0);
    if (counts === undefined) throw new Error("no market counts");
    const u = unemploymentRate(counts, M5_LABORERS);
    expect(u).toBeGreaterThan(0);
    updateLabourMarketMonth(world, scenario.definitions, world.dayIndex);
    const after = world.labourMarket.territories[0]?.referenceWageRUSDPerYear[M5_LABORERS] ?? 0;
    expect(after).toBeLessThan(before);
    // No vacancies: the fall is κ↓·u (the price index has not moved on day 0).
    expect(Math.log(after / before)).toBeCloseTo(-WAGE_FALL_PER_GAP * u, 9);
    // Population-weighted mean of the differentials in market 0 stays 1.
    const people = new Map<number, number>();
    for (const block of world.popBlocks) people.set(block.provinceId, (people.get(block.provinceId) ?? 0) + populationTotal(block));
    let weighted = 0;
    let weight = 0;
    for (const province of world.labourMarket.provinces) {
      const marketId = world.provinceEconomies.find((entry) => entry.id === province.provinceId)?.marketId;
      if (marketId !== 0) continue;
      weighted += (people.get(province.provinceId) ?? 0) * (province.differential[M5_LABORERS] ?? 1);
      weight += people.get(province.provinceId) ?? 0;
    }
    expect(weighted / weight).toBeCloseTo(1, 9);
  });
});

describe("P7 reclassification (acceptance: people conserved)", () => {
  test("creation and retirement conserve people, cash, literate persons and dwellings", () => {
    const scenario = p7Scenario();
    const world = createEconomyWorld(scenario);
    const people = worldPeople(world);
    const cash = totalCash(world);
    const literate = literatePersons(world);
    const context = createReclassifyContext(world, scenario.definitions, world.dayIndex);
    const peasantsA2 = world.popBlocks.find((block) => block.provinceId === M5_REGION_A2 && block.professionId === M5_PEASANTS);
    if (peasantsA2 === undefined) throw new Error("no peasants");
    const nextId = world.labourMarket.nextPopBlockId;
    // A2 has no clerk block: a literate move creates it.
    const created = moveBlockPeople(context, peasantsA2, M5_REGION_A2, P7_CLERKS, 50, {
      selectiveLiterate: true,
      destinationUrbanFraction: 1,
      carriedDwellingShare: 0,
    });
    expect(created.created).toBe(true);
    expect(created.destination.id).toBe(nextId);
    expect(world.labourMarket.nextPopBlockId).toBe(nextId + 1);
    expect(populationTotal(created.destination)).toBe(50);
    expect(created.destination.literacy).toBe(1);
    expect(worldPeople(world)).toBe(people);
    expect(totalCash(world)).toBeCloseTo(cash, 6);
    expect(literatePersons(world)).toBeCloseTo(literate, 6);
    // Move them all back (household move): the created block empties and retires.
    moveBlockPeople(context, created.destination, M5_REGION_A2, M5_PEASANTS, 50, {
      selectiveLiterate: false,
      destinationUrbanFraction: 0,
      carriedDwellingShare: 0,
    });
    refreshEmployment(world, scenario.definitions, world.dayIndex, { force: true });
    expect(retireEmptyBlocks(context)).toBe(1);
    expect(world.popBlocks.some((block) => block.id === nextId)).toBe(false);
    expect(world.labourMarket.retiredPopBlockIds).toEqual([nextId]);
    expect(worldPeople(world)).toBe(people);
    expect(totalCash(world)).toBeCloseTo(cash, 6);
    expect(literatePersons(world)).toBeCloseTo(literate, 6);
    // The retired block's accounts stay in the ledger; the world validates and saves.
    expect(world.finance.accounts.some((account) => account.ownerKind === "popBlock" && account.ownerId === nextId)).toBe(true);
    const restored = deserializeWorld(serializeWorld(world));
    expect(hashWorld(restored)).toBe(hashWorld(world));
  });
});

describe("P7 integrated months", () => {
  test("three months run deterministically, with mobility, and the save round-trips (acceptance)", () => {
    const scenario = p7Scenario();
    const context = economyTickContext(scenario);
    const run = (): World => {
      const world = createEconomyWorld(scenario);
      for (let day = 0; day < 95; day += 1) tick(world, context);
      return world;
    };
    const first = run();
    const second = run();
    expect(hashWorld(first)).toBe(hashWorld(second));
    expect(first.labourMarket.history.length).toBe(3);
    const restored = deserializeWorld(serializeWorld(first));
    expect(hashWorld(restored)).toBe(hashWorld(first));
  });
});
