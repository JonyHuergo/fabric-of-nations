import {
  createEconomyWorld,
  tick,
  type DebtPolicy,
  type EconomyScenarioDef,
  type TickContext,
  type TickResult,
} from "@century/sim";
import { M5_COUNTRY_A, M5_COUNTRY_B, m5Scenario } from "./m5.js";

export const M5B_COUNTRY_A = M5_COUNTRY_A;
export const M5B_COUNTRY_B = M5_COUNTRY_B;
export const M5B_TREASURY_A = 9000;
export const M5B_TREASURY_B = 9001;

export interface M5bOptions {
  readonly debt?: Partial<DebtPolicy>;
  readonly incomeTaxRate?: number;
  readonly welfareBudgetRUSDPerYear?: number;
  readonly initialState?: (scenario: EconomyScenarioDef) => void;
}

/**
 * M5 fixture with country A allowed to borrow from country B's treasury.
 * Default terms are deliberately short and cheap so a focused test can reach
 * interest, maturity, refinancing, and default within a few dozen ticks.
 */
export function m5bScenario(options: M5bOptions = {}): EconomyScenarioDef {
  const scenario = m5Scenario();
  scenario.countries = (scenario.countries ?? []).map((country) => ({
    ...country,
    fiscal:
      country.id === M5B_COUNTRY_A
        ? {
            incomeTaxRate: options.incomeTaxRate ?? 0,
            welfareBudgetRUSDPerYear: options.welfareBudgetRUSDPerYear ?? 0,
          }
        : { incomeTaxRate: 0, welfareBudgetRUSDPerYear: 0 },
    ...(country.id === M5B_COUNTRY_A
      ? {
          debt: {
            enabled: true,
            creditorKind: "country" as const,
            creditorId: M5B_COUNTRY_B,
            annualCouponRate: 0.12,
            termDays: 10,
            maxOutstandingPrincipalRUSD: 1_000_000,
            refinanceOnMaturity: false,
            arrearsGraceDays: 0,
            ...options.debt,
          },
        }
      : {}),
  }));
  options.initialState?.(scenario);
  return scenario;
}

export function m5bContext(scenario: EconomyScenarioDef): TickContext {
  return {
    population: { definitions: scenario.population.definitions },
    economy: { definitions: scenario.definitions },
  };
}

export function createM5bWorld(
  scenario: EconomyScenarioDef,
): ReturnType<typeof createEconomyWorld> {
  return createEconomyWorld(scenario, { seed: 20_261_023 });
}

export function tickM5b(
  world: ReturnType<typeof createEconomyWorld>,
  scenario: EconomyScenarioDef,
  ticks: number,
): TickResult {
  let last: TickResult | undefined;
  for (let index = 0; index < ticks; index += 1) last = tick(world, m5bContext(scenario));
  if (last === undefined) throw new Error("no M5b tick ran");
  return last;
}
