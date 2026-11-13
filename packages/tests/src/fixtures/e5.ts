/**
 * E5 fixture: the M9 fixture with a player-country training/health policy. The
 * population, academics, and country setup are real M9 state; only the E5 policy
 * inputs are authored here.
 */

import type { EconomyScenarioDef } from "@century/sim";

import { M5_COUNTRY_A } from "./m5.js";
import { m9Scenario, type M9FixtureOptions } from "./m9.js";
import { withCurrentModel } from "./currentModel.js";

export const E5_TRAINING_BUDGET = 200_000;
export const E5_TRAINING_STIPEND = 1;
export const E5_TRAINING_STAFF_SHARE = 0.2;
export const E5_HEALTH_STAFF_SHARE = 0.2;

export interface E5FixtureOptions extends M9FixtureOptions {
  readonly trainingBudgetA?: number;
  readonly trainingStipendA?: number;
  readonly trainingStaffShareA?: number;
  readonly healthStaffShareA?: number;
}

/** Build the E5 fixture scenario. Fresh objects on every call. */
/** D-155: the fixture with the labour-market roles and demand system (`withCurrentModel`). */
export function e5Scenario(options: E5FixtureOptions = {}): EconomyScenarioDef {
  return withCurrentModel(e5ScenarioBase(options));
}

function e5ScenarioBase(options: E5FixtureOptions): EconomyScenarioDef {
  const scenario = m9Scenario(options);
  scenario.countries = (scenario.countries ?? []).map((country) => {
    if (country.id !== M5_COUNTRY_A) return country;
    return {
      ...country,
      labor: {
        trainingBudgetRUSDPerYear: options.trainingBudgetA ?? E5_TRAINING_BUDGET,
        trainingStipendPerTraineeRUSDPerYear:
          options.trainingStipendA ?? E5_TRAINING_STIPEND,
        trainingStaffShare: options.trainingStaffShareA ?? E5_TRAINING_STAFF_SHARE,
        healthStaffShare: options.healthStaffShareA ?? E5_HEALTH_STAFF_SHARE,
      },
    };
  });
  return scenario;
}
