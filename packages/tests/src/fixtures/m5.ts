/**
 * M5 multi-region/multi-country fixture.
 *
 * Three countries, four regions, two markets, seven population blocks, and a
 * small set of producing buildings. Country A and country C share market 0
 * (cross-country pooled market); country B is isolated in market 1. Country C is
 * the only open-border country, so cross-country migration and employment from A
 * to C is permitted while A -> B is closed.
 */

import {
  createEconomyWorld,
  type EconomyDefinitions,
  type EconomyScenarioDef,
  type Id,
  type PopulationDefinitions,
  type World,
} from "@century/sim";

export const M5_GRAIN = 0;
export const M5_FOOD = 1;
export const M5_CLOTHING = 2;
export const M5_PEASANTS = 0;
export const M5_LABORERS = 1;

export const M5_REGION_A1 = 0;
export const M5_REGION_A2 = 1;
export const M5_REGION_B1 = 2;
export const M5_REGION_C1 = 3;

export const M5_COUNTRY_A = 0;
export const M5_COUNTRY_B = 1;
export const M5_COUNTRY_C = 2;

export const M5_FARM = 0;
export const M5_FOOD_PLANT = 1;
export const M5_WORKSHOP = 2;
export const M5_WAREHOUSE = 3;

export const M5_SYSTEM_ACCOUNT = 300;

export const M5_HOUSEHOLD_ACCOUNTS: readonly Id[] = [
  100, 101, 102, 103, 104, 105, 106,
] as const;

export function m5EconomyDefinitions(): EconomyDefinitions {
  return {
    dataVersion: "m3-economy-v5",
    scenarioId: "m5-fixture",
    goods: [
      {
        id: M5_GRAIN,
        key: "grain",
        name: "Grain",
        category: "food",
        basePrice1900SUSD: 0.05,
        transportCostPerUnit: 0,
        priceElasticity: 1,
        spoilageRateAnnual: 0,
        unitLabel: "kg",
      },
      {
        id: M5_FOOD,
        key: "food-products",
        name: "Food Products",
        category: "food",
        basePrice1900SUSD: 0.1,
        transportCostPerUnit: 0,
        priceElasticity: 1,
        spoilageRateAnnual: 0,
        unitLabel: "kg",
      },
      {
        id: M5_CLOTHING,
        key: "clothing",
        name: "Clothing",
        category: "industrial",
        basePrice1900SUSD: 1,
        transportCostPerUnit: 0,
        priceElasticity: 1,
        spoilageRateAnnual: 0,
        unitLabel: "garment",
      },
    ],
    professions: [
      {
        id: M5_PEASANTS,
        key: "peasants",
        name: "Peasants",
        stratum: "lower",
        participationRate: 0.5,
        qualificationLiteracy: 0,
        qualificationWealthLevel: 0,
        baseWage1900SUSDPerYear: 180,
        trainingCostSUSD: 0,
        laborProductivityModifier: 1,
      },
      {
        id: M5_LABORERS,
        key: "laborers",
        name: "Laborers",
        stratum: "lower",
        participationRate: 0.5,
        qualificationLiteracy: 0.1,
        qualificationWealthLevel: 0,
        baseWage1900SUSDPerYear: 250,
        trainingCostSUSD: 0,
        laborProductivityModifier: 1,
      },
    ],
    buildings: [
      {
        id: M5_FARM,
        key: "farm",
        name: "Farm",
        referenceThroughputPerDayAtLevelOne: 1,
        inputs: [],
        outputs: [{ goodId: M5_GRAIN, quantityPerThroughputUnit: 10_000 }],
        jobs: [{ professionId: M5_PEASANTS, workersPerThroughputUnit: 1_000 }],
        constructionCostSUSD: 1000,
        constructionWorkers: 20,
        sector: "agriculture",
        constructionMaterials: [{ goodId: M5_GRAIN, quantity: 500 }],
        dailyUpkeepSUSDAtLevelOne: 10,
        storageCapacityByGood: [],
        resourceRequirements: [],
        requiredTechnologyId: null,
        ownershipAllowed: ["private"],
        isEssentialInfrastructure: true,
      },
      {
        id: M5_FOOD_PLANT,
        key: "food-plant",
        name: "Food Plant",
        referenceThroughputPerDayAtLevelOne: 1,
        inputs: [{ goodId: M5_GRAIN, quantityPerThroughputUnit: 8_000 }],
        outputs: [{ goodId: M5_FOOD, quantityPerThroughputUnit: 1_000 }],
        jobs: [{ professionId: M5_LABORERS, workersPerThroughputUnit: 1_000 }],
        constructionCostSUSD: 2000,
        constructionWorkers: 30,
        sector: "food-processing",
        constructionMaterials: [
          { goodId: M5_GRAIN, quantity: 5000 },
          { goodId: M5_CLOTHING, quantity: 100 },
        ],
        dailyUpkeepSUSDAtLevelOne: 20,
        storageCapacityByGood: [],
        resourceRequirements: [],
        requiredTechnologyId: null,
        ownershipAllowed: ["private"],
        isEssentialInfrastructure: true,
      },
      {
        id: M5_WORKSHOP,
        key: "workshop",
        name: "Workshop",
        referenceThroughputPerDayAtLevelOne: 1,
        inputs: [],
        outputs: [{ goodId: M5_CLOTHING, quantityPerThroughputUnit: 500 }],
        jobs: [{ professionId: M5_LABORERS, workersPerThroughputUnit: 200 }],
        constructionCostSUSD: 1500,
        constructionWorkers: 20,
        sector: "manufacturing",
        constructionMaterials: [{ goodId: M5_CLOTHING, quantity: 1000 }],
        dailyUpkeepSUSDAtLevelOne: 10,
        storageCapacityByGood: [],
        resourceRequirements: [],
        requiredTechnologyId: null,
        ownershipAllowed: ["private"],
        isEssentialInfrastructure: false,
      },
      {
        id: M5_WAREHOUSE,
        key: "warehouse",
        name: "Warehouse",
        referenceThroughputPerDayAtLevelOne: 1,
        inputs: [],
        outputs: [],
        jobs: [],
        constructionCostSUSD: 500,
        constructionWorkers: 10,
        sector: "storage",
        constructionMaterials: [],
        dailyUpkeepSUSDAtLevelOne: 1,
        storageCapacityByGood: [
          { goodId: M5_GRAIN, quantity: 2_000_000 },
          { goodId: M5_FOOD, quantity: 2_000_000 },
          { goodId: M5_CLOTHING, quantity: 2_000_000 },
        ],
        resourceRequirements: [],
        requiredTechnologyId: null,
        ownershipAllowed: ["private"],
        isEssentialInfrastructure: true,
      },
    ],
  };
}

function mortality(year: number): {
  year: number;
  maleAnnualDeathsPer1000ByAgeBand: number[];
  femaleAnnualDeathsPer1000ByAgeBand: number[];
} {
  return {
    year,
    maleAnnualDeathsPer1000ByAgeBand: Array.from({ length: 17 }, (_value, index) =>
      index < 2 ? 40 : 10,
    ),
    femaleAnnualDeathsPer1000ByAgeBand: Array.from({ length: 17 }, (_value, index) =>
      index < 2 ? 35 : 9,
    ),
  };
}

export function m5PopulationDefinitions(): PopulationDefinitions {
  return {
    dataVersion: "m3-economy-v5",
    scenarioId: "m5-fixture",
    needs: [
      {
        tier: "subsistence",
        activationWealthMin: 0,
        items: [
          { goodKey: "grain", quantityPerCapitaPerDay: 0.9 },
          { goodKey: "food-products", quantityPerCapitaPerDay: 0.1 },
        ],
      },
      {
        tier: "basic",
        activationWealthMin: 0,
        items: [{ goodKey: "clothing", quantityPerCapitaPerDay: 0.005 }],
      },
      {
        tier: "comfort",
        activationWealthMin: 25,
        items: [{ goodKey: "clothing", quantityPerCapitaPerDay: 0.002 }],
      },
      {
        tier: "luxury",
        activationWealthMin: 60,
        items: [{ goodKey: "clothing", quantityPerCapitaPerDay: 0.001 }],
      },
    ],
    mortalityAnchors: [mortality(1900), mortality(2000)],
    fertilityAnchors: [
      { year: 1900, ageSpecificBirthsPer1000Women: [100, 120, 130, 120, 90, 50, 10] },
      { year: 2000, ageSpecificBirthsPer1000Women: [60, 90, 110, 100, 70, 30, 5] },
    ],
    sexRatioAtBirth: 1.05,
    fertilityMultipliers: [
      { professionId: M5_PEASANTS, multiplier: 1 },
      { professionId: M5_LABORERS, multiplier: 1 },
    ],
  };
}

/** Split a population total into 17 five-year bands with a working-age core. */
export function m5AgeGroups(population: number): number[] {
  const groups = new Array<number>(17).fill(0);
  const children = Math.floor(population * 0.35);
  const working = Math.floor(population * 0.55);
  const elderly = population - children - working;
  groups[0] = Math.floor(children / 3);
  groups[1] = Math.floor(children / 3);
  groups[2] = children - groups[0] - groups[1];
  const perBand = Math.floor(working / 10);
  for (let band = 3; band <= 12; band += 1) groups[band] = perBand;
  let assigned = groups.slice(3, 13).reduce((total, value) => total + value, 0);
  groups[3] = (groups[3] ?? 0) + (working - assigned);
  groups[15] = elderly;
  assigned = groups.reduce((total, value) => total + value, 0);
  groups[13] = (groups[13] ?? 0) + (population - assigned);
  return groups;
}

interface BlockSpec {
  readonly id: Id;
  readonly regionId: Id;
  readonly professionId: Id;
  readonly population: number;
  readonly literacy: number;
  readonly wealthLevel: number;
  readonly accountId: Id;
}

export interface M5FixtureOptions {
  /**
   * Optional authored building instance list. Defaults build one farm in each
   * region, a food plant in A1, a workshop in C1, and a warehouse in every
   * region.
   */
  readonly buildings?: EconomyScenarioDef["buildingInstances"];
  /** Country ids whose `immigrationOpen` is true. Defaults to country C only. */
  readonly openBorders?: readonly Id[];
  /** Override fiscal policies by country id. */
  readonly fiscal?: Readonly<Record<Id, { incomeTaxRate: number; welfareBudgetSUSDPerYear: number }>>;
  readonly employment?: EconomyScenarioDef["employment"];
}

function defaultBlocks(): BlockSpec[] {
  return [
    { id: 0, regionId: M5_REGION_A1, professionId: M5_PEASANTS, population: 10_000, literacy: 0.2, wealthLevel: 30, accountId: 100 },
    { id: 1, regionId: M5_REGION_A1, professionId: M5_LABORERS, population: 5_000, literacy: 0.3, wealthLevel: 35, accountId: 101 },
    { id: 2, regionId: M5_REGION_A2, professionId: M5_PEASANTS, population: 8_000, literacy: 0.2, wealthLevel: 25, accountId: 102 },
    { id: 3, regionId: M5_REGION_A2, professionId: M5_LABORERS, population: 2_000, literacy: 0.3, wealthLevel: 32, accountId: 103 },
    { id: 4, regionId: M5_REGION_B1, professionId: M5_PEASANTS, population: 6_000, literacy: 0.15, wealthLevel: 20, accountId: 104 },
    { id: 5, regionId: M5_REGION_C1, professionId: M5_PEASANTS, population: 6_000, literacy: 0.25, wealthLevel: 28, accountId: 105 },
    { id: 6, regionId: M5_REGION_C1, professionId: M5_LABORERS, population: 2_000, literacy: 0.35, wealthLevel: 33, accountId: 106 },
  ];
}

function defaultBuildings(): EconomyScenarioDef["buildingInstances"] {
  const instances: EconomyScenarioDef["buildingInstances"] = [];
  let nextId = 0;
  const add = (
    definitionId: number,
    regionId: Id,
    ownerAccountId: Id,
    operatingCashAccountId: Id,
  ): void => {
    instances.push({
      id: nextId,
      definitionId,
      regionId,
      level: 1,
      condition: 1,
      ownerKind: "private",
      ownerAccountId,
      builtOnDay: 0,
      operational: true,
      operatingCashAccountId,
      initialOperatingCashSUSD: 5_000,
    });
    nextId += 1;
  };
  add(M5_FARM, M5_REGION_A1, 100, 200);
  add(M5_FOOD_PLANT, M5_REGION_A1, 101, 201);
  add(M5_WAREHOUSE, M5_REGION_A1, 100, 202);
  add(M5_FARM, M5_REGION_A2, 102, 203);
  add(M5_WAREHOUSE, M5_REGION_A2, 102, 204);
  add(M5_FARM, M5_REGION_B1, 104, 205);
  add(M5_WAREHOUSE, M5_REGION_B1, 104, 206);
  add(M5_FARM, M5_REGION_C1, 105, 207);
  add(M5_WORKSHOP, M5_REGION_C1, 106, 208);
  add(M5_WAREHOUSE, M5_REGION_C1, 105, 209);
  return instances;
}

export function m5Scenario(options: M5FixtureOptions = {}): EconomyScenarioDef {
  const blocks = defaultBlocks();
  const open = new Set(options.openBorders ?? [M5_COUNTRY_C]);
  const fiscal = options.fiscal ?? {};
  const definitions = m5EconomyDefinitions();
  return {
    population: {
      dataVersion: "m3-economy-v5",
      scenarioId: "m5-fixture",
      professions: definitions.professions.map((profession) => ({
        id: profession.id,
        key: profession.key,
        name: profession.name,
        stratum: profession.stratum,
      })),
      regions: [
        { id: M5_REGION_A1, key: "a1", name: "Country A Region 1" },
        { id: M5_REGION_A2, key: "a2", name: "Country A Region 2" },
        { id: M5_REGION_B1, key: "b1", name: "Country B Region 1" },
        { id: M5_REGION_C1, key: "c1", name: "Country C Region 1" },
      ],
      popBlocks: blocks.map((block) => ({
        id: block.id,
        regionId: block.regionId,
        professionId: block.professionId,
        financialAccountId: block.accountId,
        maleAgeGroups: m5AgeGroups(Math.floor(block.population / 2)),
        femaleAgeGroups: m5AgeGroups(block.population - Math.floor(block.population / 2)),
        literacy: block.literacy,
        wealthLevel: block.wealthLevel,
        initialSavingsSUSD: block.population * 5,
        militancy: 0.05,
      })),
      definitions: m5PopulationDefinitions(),
    },
    definitions,
    buildingInstances: options.buildings ?? defaultBuildings(),
    markets: [
      {
        id: 0,
        regionIds: [M5_REGION_A1, M5_REGION_A2, M5_REGION_C1],
        priceSUSD: definitions.goods.map((good) => good.basePrice1900SUSD),
        stockLots: [],
      },
      {
        id: 1,
        regionIds: [M5_REGION_B1],
        priceSUSD: definitions.goods.map((good) => good.basePrice1900SUSD),
        stockLots: [],
      },
    ],
    systemAccounts: [{ id: M5_SYSTEM_ACCOUNT, accountKind: "system-reserve", balanceSUSD: 0 }],
    employment: options.employment ?? [],
    countries: [
      {
        id: M5_COUNTRY_A,
        tag: "AAA",
        name: "Country A",
        monetary: { kind: "own", currencyId: 0 },
        regionIds: [M5_REGION_A1, M5_REGION_A2],
        treasuryAccountId: 9000,
        initialTreasuryCashSUSD: 10_000,
        fiscal: fiscal[M5_COUNTRY_A] ?? { incomeTaxRate: 0.1, welfareBudgetSUSDPerYear: 0 },
        immigrationOpen: open.has(M5_COUNTRY_A),
      },
      {
        id: M5_COUNTRY_B,
        tag: "BBB",
        name: "Country B",
        monetary: { kind: "own", currencyId: 1 },
        regionIds: [M5_REGION_B1],
        treasuryAccountId: 9001,
        initialTreasuryCashSUSD: 10_000,
        fiscal: fiscal[M5_COUNTRY_B] ?? { incomeTaxRate: 0.1, welfareBudgetSUSDPerYear: 0 },
        immigrationOpen: open.has(M5_COUNTRY_B),
      },
      {
        id: M5_COUNTRY_C,
        tag: "CCC",
        name: "Country C",
        monetary: { kind: "own", currencyId: 2 },
        regionIds: [M5_REGION_C1],
        treasuryAccountId: 9002,
        initialTreasuryCashSUSD: 10_000,
        fiscal: fiscal[M5_COUNTRY_C] ?? { incomeTaxRate: 0.05, welfareBudgetSUSDPerYear: 0 },
        immigrationOpen: open.has(M5_COUNTRY_C),
      },
    ],
    currencies: [
      { id: 0, key: "aaa", name: "A currency", issuer: { kind: "country", countryId: M5_COUNTRY_A } },
      { id: 1, key: "bbb", name: "B currency", issuer: { kind: "country", countryId: M5_COUNTRY_B } },
      { id: 2, key: "ccc", name: "C currency", issuer: { kind: "country", countryId: M5_COUNTRY_C } },
    ],
    currencyValuations: [
      { currencyId: 0, status: "unavailable" },
      { currencyId: 1, status: "unavailable" },
      { currencyId: 2, status: "unavailable" },
    ],
  };
}

export function m5World(options: M5FixtureOptions = {}): {
  readonly scenario: EconomyScenarioDef;
  readonly world: World;
} {
  const scenario = m5Scenario(options);
  return { scenario, world: createEconomyWorld(scenario, { seed: 20_261_023 }) };
}
