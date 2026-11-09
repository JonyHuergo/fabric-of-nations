/**
 * P7 (D-154) labour-market fixture: the M5 three-country world (four provinces, two
 * markets) with profession roles and the labour-market configuration, plus a literate
 * clerk profession for the gates. Peasants are the work-sharing (subsistence)
 * profession, laborers wage workers, clerks literate wage workers.
 */
import type { EconomyScenarioDef, ProfessionDef } from "@century/sim";

import { e5Scenario } from "./e5.js";
import { M5_LABORERS, M5_PEASANTS, M5_REGION_A1, m5AgeGroups, m5Scenario, type M5FixtureOptions } from "./m5.js";
import { M8_ACADEMICS_ID, M8_CLERKS_ID } from "./m8.js";

export const P7_CLERKS = 2;
export const P7_CLERK_BLOCK = 20;
export const P7_CLERK_ACCOUNT = 120;

export function p7Professions(base: readonly ProfessionDef[]): ProfessionDef[] {
  const withRoles = base.map((profession): ProfessionDef => {
    if (profession.id === M5_PEASANTS) return { ...profession, roles: ["subsistence"], settlement: "rural" };
    if (profession.id === M5_LABORERS) return { ...profession, roles: ["wage-labour"], settlement: "by-job" };
    return profession;
  });
  return [
    ...withRoles,
    {
      id: P7_CLERKS,
      key: "clerks",
      name: "Clerks",
      stratum: "middle",
      participationRate: 0.55,
      qualificationLiteracy: 0.7,
      qualificationWealthLevel: 20,
      baseWage1900RUSDPerYear: 450,
      trainingCostRUSD: 0,
      laborProductivityModifier: 1,
      roles: ["wage-labour"],
      gates: ["literacy"],
      settlement: "urban",
    },
  ];
}

export interface P7FixtureOptions extends M5FixtureOptions {
  /** Clerk jobs per level of the A1 food plant (0: none). */
  readonly clerkJobsPerThroughputUnit?: number;
}

/**
 * The E5 world (politics, education, training, health; clerks and academics in A1) as a
 * labour-market world: clerks staff the administration and the health service,
 * academics the schools, research and training (plan Q3, Q4).
 */
export function p7InstitutionScenario(): EconomyScenarioDef {
  const scenario = e5Scenario();
  const professions = scenario.definitions.professions.map((profession): ProfessionDef => {
    if (profession.id === M5_PEASANTS) return { ...profession, roles: ["subsistence"], settlement: "rural" };
    if (profession.id === M5_LABORERS) return { ...profession, roles: ["wage-labour"], settlement: "by-job" };
    if (profession.id === M8_CLERKS_ID) return { ...profession, roles: ["administration", "health"], gates: ["literacy"], settlement: "urban" };
    if (profession.id === M8_ACADEMICS_ID) return { ...profession, roles: ["education", "research", "training"], gates: ["literacy"], settlement: "urban" };
    return profession;
  });
  scenario.definitions = { ...scenario.definitions, professions, labourMarket: { domesticServiceBuildingKeys: [] } };
  return scenario;
}

/** The labour-market fixture scenario; fresh objects on every call. */
export function p7Scenario(options: P7FixtureOptions = {}): EconomyScenarioDef {
  const scenario = m5Scenario(options);
  const professions = p7Professions(scenario.definitions.professions);
  const clerkJobs = options.clerkJobsPerThroughputUnit ?? 100;
  scenario.definitions = {
    ...scenario.definitions,
    professions,
    buildings: scenario.definitions.buildings.map((building) =>
      building.key === "food-plant" && clerkJobs > 0
        ? { ...building, jobs: [...building.jobs, { professionId: P7_CLERKS, workersPerThroughputUnit: clerkJobs }] }
        : building,
    ),
    labourMarket: { domesticServiceBuildingKeys: [] },
  };
  scenario.population = {
    ...scenario.population,
    professions: professions.map((profession) => ({ id: profession.id, key: profession.key, name: profession.name, stratum: profession.stratum })),
    definitions: {
      ...scenario.population.definitions,
      fertilityMultipliers: [...scenario.population.definitions.fertilityMultipliers, { professionId: P7_CLERKS, multiplier: 0.8 }],
    },
    popBlocks: [
      ...scenario.population.popBlocks,
      {
        id: P7_CLERK_BLOCK,
        provinceId: M5_REGION_A1,
        professionId: P7_CLERKS,
        financialAccountId: P7_CLERK_ACCOUNT,
        maleAgeGroups: m5AgeGroups(400),
        femaleAgeGroups: m5AgeGroups(400),
        literacy: 0.9,
        wealthLevel: 50,
        initialSavingsRUSD: 8_000,
        militancy: 0.02,
      },
    ],
  };
  return scenario;
}
