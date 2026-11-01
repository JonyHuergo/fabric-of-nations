/**
 * Focused M8 fixture: the small M5 three-country world plus the validated M8
 * political content and one clerk block. Country A is a republic, B an absolute
 * monarchy, and C a constitutional monarchy. The fixture is deliberately small so
 * law timing, elections, crisis, and payroll can be exercised over hundreds of
 * days without the eight-polity historical load.
 */

import type {
  EconomyScenarioDef,
  PoliticsDefinitions,
  TechnologyDefinitions,
} from "@century/sim";
import { loadM5EightPolities } from "@century/data";

import {
  M5_COUNTRY_A,
  M5_COUNTRY_B,
  M5_COUNTRY_C,
  M5_REGION_A1,
  m5AgeGroups,
  m5Scenario,
} from "./m5.js";

export const M8_COUNTRY_A = M5_COUNTRY_A;
export const M8_COUNTRY_B = M5_COUNTRY_B;
export const M8_COUNTRY_C = M5_COUNTRY_C;
export const M8_CLERKS_ID = 2;
export const M8_CLERKS_BLOCK = 7;
export const M8_CLERKS_ACCOUNT = 500;

export function m8PoliticsDefinitions(): PoliticsDefinitions {
  const scenario = loadM5EightPolities();
  if (scenario.definitions.politics === undefined) {
    throw new Error("M5 historical scenario does not carry M8 politics definitions");
  }
  return scenario.definitions.politics;
}

/**
 * M9 validated technology content. The M8 fixture carries it because the
 * education law options declare technology prerequisites; the fixture has no
 * academics population, so research and schooling are inert.
 */
export function m8TechnologyDefinitions(): TechnologyDefinitions {
  const scenario = loadM5EightPolities();
  if (scenario.definitions.technology === undefined) {
    throw new Error("M5 historical scenario does not carry M9 technology definitions");
  }
  return scenario.definitions.technology;
}

export const M8_ACADEMICS_ID = 4;

export interface M8FixtureOptions {
  /** Override country A's administration funding target. */
  readonly fundingA?: number;
  /** Override country C's administration funding target. */
  readonly fundingC?: number;
}

/** Build the M8 fixture scenario. Fresh objects on every call. */
export function m8Scenario(options: M8FixtureOptions = {}): EconomyScenarioDef {
  const scenario = m5Scenario();
  const clerks = {
    id: M8_CLERKS_ID,
    key: "clerks",
    name: "Clerks",
    stratum: "middle" as const,
    participationRate: 0.55,
    qualificationLiteracy: 0.7,
    qualificationWealthLevel: 20,
    baseWage1900RUSDPerYear: 450,
    trainingCostRUSD: 0,
    laborProductivityModifier: 1.1,
  };
  const academics = {
    id: M8_ACADEMICS_ID,
    key: "academics",
    name: "Academics",
    stratum: "middle" as const,
    participationRate: 0.6,
    qualificationLiteracy: 0.85,
    qualificationWealthLevel: 40,
    baseWage1900RUSDPerYear: 320,
    trainingCostRUSD: 0,
    laborProductivityModifier: 1.15,
  };
  scenario.definitions = {
    ...scenario.definitions,
    professions: [...scenario.definitions.professions, clerks, academics],
    politics: m8PoliticsDefinitions(),
    technology: m8TechnologyDefinitions(),
  };
  scenario.population = {
    ...scenario.population,
    professions: [
      ...scenario.population.professions,
      { id: clerks.id, key: clerks.key, name: clerks.name, stratum: clerks.stratum },
      {
        id: academics.id,
        key: academics.key,
        name: academics.name,
        stratum: academics.stratum,
      },
    ],
    definitions: {
      ...scenario.population.definitions,
      fertilityMultipliers: [
        ...scenario.population.definitions.fertilityMultipliers,
        { professionId: clerks.id, multiplier: 0.8 },
        { professionId: academics.id, multiplier: 0.8 },
      ],
    },
    popBlocks: [
      ...scenario.population.popBlocks,
      {
        id: M8_CLERKS_BLOCK,
        regionId: M5_REGION_A1,
        professionId: M8_CLERKS_ID,
        financialAccountId: M8_CLERKS_ACCOUNT,
        maleAgeGroups: m5AgeGroups(2_500),
        femaleAgeGroups: m5AgeGroups(2_500),
        literacy: 0.9,
        wealthLevel: 60,
        initialSavingsRUSD: 10_000,
        militancy: 0.04,
      },
    ],
  };
  scenario.countries = (scenario.countries ?? []).map((country) => {
    if (country.id === M8_COUNTRY_A) {
      return {
        ...country,
        politics: {
          regimeKind: "republic" as const,
          governmentGroupKey: "capitalists" as const,
          laws: {
            suffrage: "suffrage-male",
            taxation: "taxation-flat",
            labor: "labor-association",
            trade: "trade-open",
          },
          institutionFundingRUSDPerYear: options.fundingA ?? 2_000,
        },
      };
    }
    if (country.id === M8_COUNTRY_B) {
      return {
        ...country,
        politics: {
          regimeKind: "absolute-monarchy" as const,
          governmentGroupKey: "aristocrats" as const,
          laws: {
            suffrage: "suffrage-none",
            taxation: "taxation-restrictive",
            labor: "labor-repression",
            trade: "trade-restricted",
          },
          institutionFundingRUSDPerYear: 0,
        },
      };
    }
    return {
      ...country,
      politics: {
        regimeKind: "constitutional-monarchy" as const,
        governmentGroupKey: "aristocrats" as const,
        laws: {
          suffrage: "suffrage-property",
          taxation: "taxation-restrictive",
          labor: "labor-repression",
          trade: "trade-restricted",
        },
        institutionFundingRUSDPerYear: options.fundingC ?? 500,
      },
    };
  });
  scenario.playerCountryId = M8_COUNTRY_A;
  return scenario;
}
