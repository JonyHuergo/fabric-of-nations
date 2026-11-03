/**
 * Focused M9 fixture: the M8 fixture plus an academics population block, a
 * technology-gated building definition, shortened research work for a few real
 * technologies, and country A education funding. Country A is the player country
 * and the only one with academics, so research and schooling are exercised
 * against real population and institutional state.
 */

import type {
  BuildingDef,
  EconomyDefinitions,
  EconomyScenarioDef,
  TechnologyDefinitions,
} from "@century/sim";
import { loadM5EightPolities } from "@century/data";

import { M5_REGION_A1, M5_COUNTRY_A, M5_PEASANTS, m5AgeGroups } from "./m5.js";
import { M8_ACADEMICS_ID, m8Scenario, m8TechnologyDefinitions } from "./m8.js";

export const M9_ACADEMICS_BLOCK = 8;
export const M9_ACADEMICS_ACCOUNT = 501;
export const M9_TECH_GATED_BUILDING = 4;
export const M9_EDUCATION_FUNDING = 6_600;
export const M9_RESEARCH_SHARE = 0.5;

/** Real technology ids used by the M9 fixture and its assertions. */
export const M9_STEAM_POWER = 0;
export const M9_MECHANIZED_AGRICULTURE = 1;
export const M9_BASIC_SANITATION = 3;
export const M9_PRIMARY_SCHOOLING = 4;
export const M9_COMPULSORY_EDUCATION = 15;
export const M9_VOLUNTARY_EDUCATION = 14;

/** Technology definitions with shortened work for test-speed research. */
export function m9TechnologyDefinitions(): TechnologyDefinitions {
  const technology = m8TechnologyDefinitions();
  const technologies = technology.technologies.map((definition) => {
    if (definition.id === M9_STEAM_POWER) return { ...definition, researchWork: 20_000 };
    if (definition.id === M9_MECHANIZED_AGRICULTURE) {
      return { ...definition, researchWork: 30_000 };
    }
    if (definition.id === M9_BASIC_SANITATION) {
      return {
        ...definition,
        researchWork: 5_000,
        effects: definition.effects.map((effect) =>
          effect.kind === "mortality-reduction" ? { ...effect, reduction: 0.5 } : effect,
        ),
      };
    }
    if (definition.id === M9_PRIMARY_SCHOOLING) return { ...definition, researchWork: 3_000 };
    return definition;
  });
  return { ...technology, technologies };
}

/** One technology-gated building definition for the unlock path. */
export function m9TechnologyGatedBuilding(): BuildingDef {
  return {
    id: M9_TECH_GATED_BUILDING,
    key: "mechanized-farm-m9",
    name: "Mechanized Farm (M9 fixture)",
    referenceThroughputPerDayAtLevelOne: 1,
    inputs: [],
    outputs: [{ goodId: 0, quantityPerThroughputUnit: 400 }],
    jobs: [{ professionId: M5_PEASANTS, workersPerThroughputUnit: 50 }],
    constructionCostRUSD: 1_000,
    constructionWorkers: 8,
    constructionMaterials: [],
    dailyUpkeepRUSDAtLevelOne: 10,
    storageCapacityByGood: [],
    resourceRequirements: [],
    requiredTechnologyId: M9_MECHANIZED_AGRICULTURE,
    ownershipAllowed: ["private", "state"],
    isEssentialInfrastructure: false,
    sector: "agriculture",
  };
}

export interface M9FixtureOptions {
  /** Country A education funding; defaults to the fixture value. */
  readonly fundingA?: number;
  /** Country B education funding (no academics population); defaults to zero. */
  readonly fundingB?: number;
  /** Country A research staff share; defaults to 0.5. */
  readonly researchShareA?: number;
  /** Research technology keys already completed for country A. */
  readonly researchedA?: readonly string[];
  /** Add the technology-gated building definition. */
  readonly withTechGatedBuilding?: boolean;
}

/** Build the M9 fixture scenario. Fresh objects on every call. */
export function m9Scenario(options: M9FixtureOptions = {}): EconomyScenarioDef {
  const scenario = m8Scenario();
  const technology = m9TechnologyDefinitions();
  const definitions: EconomyDefinitions = {
    ...scenario.definitions,
    technology,
    buildings: options.withTechGatedBuilding === false
      ? scenario.definitions.buildings
      : [...scenario.definitions.buildings, m9TechnologyGatedBuilding()],
  };
  scenario.definitions = definitions;
  scenario.population = {
    ...scenario.population,
    popBlocks: [
      ...scenario.population.popBlocks,
      {
        id: M9_ACADEMICS_BLOCK,
        provinceId: M5_REGION_A1,
        professionId: M8_ACADEMICS_ID,
        financialAccountId: M9_ACADEMICS_ACCOUNT,
        maleAgeGroups: m5AgeGroups(10_000),
        femaleAgeGroups: m5AgeGroups(10_000),
        literacy: 0.95,
        wealthLevel: 60,
        initialSavingsRUSD: 100_000,
        militancy: 0.03,
      },
    ],
  };
  // The fixture enables profit distribution so the E3 construction path can be
  // exercised for the technology-gated building definition.
  scenario.profitDistribution = {
    enabled: true,
    privatePayoutRate: 0.5,
    stateRemittanceRate: 1,
  };
  scenario.countries = (scenario.countries ?? []).map((country) => {
    if (country.id === M5_COUNTRY_A) {
      return {
        ...country,
        technology: {
          researchedTechnologyKeys: [...(options.researchedA ?? [])],
          educationFundingRUSDPerYear: options.fundingA ?? M9_EDUCATION_FUNDING,
          researchStaffShare: options.researchShareA ?? M9_RESEARCH_SHARE,
        },
      };
    }
    if (country.id === 1 && options.fundingB !== undefined) {
      return {
        ...country,
        technology: {
          researchedTechnologyKeys: [],
          educationFundingRUSDPerYear: options.fundingB,
          researchStaffShare: 0,
        },
      };
    }
    return country;
  });
  scenario.playerCountryId = M5_COUNTRY_A;
  return scenario;
}

/** The M5 historical scenario for tests that need the full technology catalog. */
export function m9HistoricalTechnology(): TechnologyDefinitions {
  const scenario = loadM5EightPolities();
  if (scenario.definitions.technology === undefined) {
    throw new Error("historical scenario has no technology definitions");
  }
  return scenario.definitions.technology;
}
