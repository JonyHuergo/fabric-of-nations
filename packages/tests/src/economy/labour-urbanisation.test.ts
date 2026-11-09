/**
 * P7 (D-154) labour market, third part: definition validation of the profession roles
 * (plan §3.1, §10), the housing factor (plan §6.3), the urban share from counts and the
 * settlement of movers (plan §6.1, §6.5), dwellings on a move (plan §6.4), and the
 * minimum wage's regional bite (plan §4.5 item 2).
 */

import {
  assertValidEconomyDefinitions,
  buildingProfitability,
  buildLabourWageTable,
  createEconomyWorld,
  createReclassifyContext,
  housingPull,
  moveBlockPeople,
  populationTotal,
  runLabourMonthPhase,
  type PopBlock,
  type World,
} from "@century/sim";

import { M5_COUNTRY_A, M5_LABORERS, M5_PEASANTS, M5_REGION_A1, M5_REGION_A2, M5_WORKSHOP } from "../fixtures/m5.js";
import { P7_CLERKS, p7InstitutionScenario, p7Scenario } from "../fixtures/p7.js";

describe("P7 definitions (plan §3.1, §10)", () => {
  test("roles, gates and the labour-market configuration are validated", () => {
    const scenario = p7Scenario();
    expect(() => assertValidEconomyDefinitions(scenario.definitions)).not.toThrow();
    const withProfession = (change: Record<string, unknown>) => ({
      ...scenario.definitions,
      professions: scenario.definitions.professions.map((profession) => (profession.id === P7_CLERKS ? { ...profession, ...change } : profession)),
    });
    expect(() => assertValidEconomyDefinitions(withProfession({ roles: ["telepathy"] }) as never)).toThrow(/unknown role/);
    expect(() => assertValidEconomyDefinitions(withProfession({ roles: [] }))).toThrow(/needs roles/);
    expect(() => assertValidEconomyDefinitions(withProfession({ gates: ["training"] }))).toThrow(/course length/);
    expect(() => assertValidEconomyDefinitions(withProfession({ gates: ["capital"] }))).toThrow(/entry capital/);
    expect(() =>
      assertValidEconomyDefinitions({ ...scenario.definitions, labourMarket: { domesticServiceBuildingKeys: ["no-such-building"] } }),
    ).toThrow(/unknown building/);
  });
});

describe("P7 housing in the decision (plan §6.3)", () => {
  test("a block short of dwellings or more crowded than in 1900 pulls less", () => {
    const base = {
      maleByAge: new Uint32Array(81).fill(10),
      femaleByAge: new Uint32Array(81).fill(10),
      housingReferencePersonsPerDwelling: 5,
      housingReferenceIncomeRUSDPerCapitaDay: 1,
      incomeSmoothedRUSDPerCapitaDay: 1,
    };
    const persons = 81 * 20;
    const block = (dwellings: number): PopBlock => ({ ...base, dwellings } as unknown as PopBlock);
    expect(housingPull(block(persons / 5))).toBeCloseTo(1, 9);
    const short = housingPull(block(persons / 10));
    expect(short).toBeLessThan(1);
    // Half the dwellings wanted, crowding 2: (1/2)^0.5 ÷ (1 + 0.5 × 1).
    expect(short).toBeCloseTo(Math.sqrt(0.5) / 1.5, 9);
    // No housing reference (legacy blocks): no effect.
    expect(housingPull({ ...block(0), housingReferencePersonsPerDwelling: 0 } as PopBlock)).toBe(1);
  });
});

describe("P7 urbanisation (plan §6.1, §6.4, §6.5)", () => {
  function urbanPersons(world: World): number {
    return world.popBlocks.reduce((sum, block) => sum + block.urbanShare * populationTotal(block), 0);
  }

  test("movers carry the urban persons the caller places, and dwellings only when they keep their settlement", () => {
    const scenario = p7Scenario();
    const world = createEconomyWorld(scenario);
    const peasants = world.popBlocks.find((block) => block.provinceId === M5_REGION_A1 && block.professionId === M5_PEASANTS);
    const laborers = world.popBlocks.find((block) => block.provinceId === M5_REGION_A1 && block.professionId === M5_LABORERS);
    if (peasants === undefined || laborers === undefined) throw new Error("fixture");
    peasants.dwellings = 2_000;
    peasants.housingReferencePersonsPerDwelling = 5;
    const dwellings = world.popBlocks.reduce((sum, block) => sum + block.dwellings, 0);
    const urbanBefore = urbanPersons(world);
    const context = createReclassifyContext(world, scenario.definitions, world.dayIndex);
    const persons = populationTotal(peasants);
    // 100 peasants become town laborers: they leave their dwellings behind.
    moveBlockPeople(context, peasants, M5_REGION_A1, M5_LABORERS, 100, { selectiveLiterate: false, destinationUrbanFraction: 1, carriedDwellingShare: 0 });
    // Urban shares are stored to nine decimals, so urban persons agree within persons × 1e-9.
    expect(Math.abs(urbanPersons(world) - (urbanBefore + 100 - 100 * peasants.urbanShare))).toBeLessThan(1e-9 * 50_000);
    expect(peasants.dwellings).toBe(2_000);
    // 100 more keep their settlement: they carry their pro-rata dwellings.
    moveBlockPeople(context, peasants, M5_REGION_A1, M5_LABORERS, 100, { selectiveLiterate: false, destinationUrbanFraction: 0, carriedDwellingShare: 1 });
    expect(peasants.dwellings).toBeCloseTo(2_000 - (2_000 * 100) / (persons - 100), 9);
    expect(world.popBlocks.reduce((sum, block) => sum + block.dwellings, 0)).toBeCloseTo(dwellings, 9);
  });

  test("a province's urban share is its urban persons ÷ persons after the month's flows", () => {
    const scenario = p7Scenario({ clerkJobsPerThroughputUnit: 3_000 });
    const world = createEconomyWorld(scenario);
    world.dayIndex = 31;
    // The monthly labour phase recomputes the province shares from the blocks.
    runLabourMonthPhase(world, scenario.definitions, 31);
    for (const province of world.provinceEconomies) {
      const blocks = world.popBlocks.filter((block) => block.provinceId === province.id);
      const persons = blocks.reduce((sum, block) => sum + populationTotal(block), 0);
      if (persons === 0) continue;
      const urban = blocks.reduce((sum, block) => sum + block.urbanShare * populationTotal(block), 0);
      expect(province.urbanShare).toBeCloseTo(urban / persons, 8);
    }
  });
});

describe("P7 minimum wage: regional bite (plan §4.5 item 2)", () => {
  test("one national floor lowers R in the low-wage province and not in the high-wage one", () => {
    const scenario = p7InstitutionScenario();
    const world = createEconomyWorld(scenario);
    const law = scenario.definitions.politics?.laws.find((entry) => entry.key === "labor-minimum-wage");
    const country = world.countries.find((entry) => entry.id === M5_COUNTRY_A);
    if (law === undefined || country === undefined) throw new Error("fixture");
    // A poor A1 and a rich A2 laborer market around the same territory wage.
    for (const province of world.labourMarket.provinces) {
      if (province.provinceId === M5_REGION_A1) province.differential[M5_LABORERS] = 0.6;
      if (province.provinceId === M5_REGION_A2) province.differential[M5_LABORERS] = 1.6;
    }
    const definition = scenario.definitions.buildings.find((entry) => entry.id === M5_WORKSHOP);
    if (definition === undefined) throw new Error("no workshop definition");
    const probe = (provinceId: number) => ({ ...world.buildings[0]!, id: 999, definitionId: M5_WORKSHOP, provinceId });
    const professionById = new Map(scenario.definitions.professions.map((profession) => [profession.id, profession]));
    const r = (provinceId: number): number => {
      const wages = buildLabourWageTable(world, scenario.definitions);
      return (
        buildingProfitability(world, scenario.definitions, wages, probe(provinceId), definition, {
          market: world.markets[0],
          landPerLevel: new Map(),
          ceiling: 1,
          yearDays: 365,
          professionById,
        }) ?? 0
      );
    };
    const poorBefore = r(M5_REGION_A1);
    const richBefore = r(M5_REGION_A2);
    country.laws.labor = law.id; // 300 RUSD a year, between 0.6 × 250 and 1.6 × 250
    country.institutions.quality = 1;
    expect(r(M5_REGION_A1)).toBeLessThan(poorBefore);
    expect(r(M5_REGION_A2)).toBeCloseTo(richBefore, 12);
  });
});
