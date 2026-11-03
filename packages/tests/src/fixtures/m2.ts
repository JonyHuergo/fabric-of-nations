import { loadM2MultiBlock, loadM2WorldAggregate } from "@century/data";
import {
  createPopulationWorld,
  type PopulationInputs,
  type PopulationScenarioDef,
  type TickContext,
  type World,
} from "@century/sim";

export const M2_GOOD_KEYS = [
  "grain",
  "food-products",
  "fish",
  "livestock",
  "clothing",
  "services",
  "textiles",
] as const;

export const BASE_PRICES_BY_GOOD: Readonly<Record<string, number>> = {
  grain: 0.05,
  "food-products": 0.1,
  fish: 0.1,
  livestock: 0.2,
  clothing: 1,
  services: 0.5,
  textiles: 1,
};

export const BASE_SUPPLY_PER_CAPITA: Readonly<Record<string, number>> = {
  grain: 1.2,
  "food-products": 0.12,
  fish: 0.05,
  livestock: 0.05,
  clothing: 0.02,
  services: 0.25,
  textiles: 0.005,
};

export const BASE_ANNUAL_INCOME_PER_CAPITA = 250;
export const BASE_ANNUAL_MANDATORY_PER_CAPITA = 50;

export function makeInputs(
  blockIds: readonly number[],
  overrides: {
    prices?: Readonly<Record<string, number>>;
    supply?: Readonly<Record<string, number>>;
    annualIncomePerCapita?: number;
    annualMandatoryPerCapita?: number;
    incomeByBlock?: Readonly<Record<number, { income: number; mandatory: number }>>;
  } = {},
): PopulationInputs {
  const prices = overrides.prices ?? BASE_PRICES_BY_GOOD;
  const supply = overrides.supply ?? BASE_SUPPLY_PER_CAPITA;
  const income = blockIds.map((popBlockId) => {
    const override = overrides.incomeByBlock?.[popBlockId];
    return {
      popBlockId,
      annualSettledIncomePerCapitaRUSD:
        override?.income ?? overrides.annualIncomePerCapita ?? BASE_ANNUAL_INCOME_PER_CAPITA,
      annualMandatoryPaymentsPerCapitaRUSD:
        override?.mandatory ??
        overrides.annualMandatoryPerCapita ??
        BASE_ANNUAL_MANDATORY_PER_CAPITA,
    };
  });
  return {
    prices: Object.entries(prices).map(([goodKey, unitPriceRUSD]) => ({
      goodKey,
      unitPriceRUSD,
    })),
    supply: Object.entries(supply).map(([goodKey, availableQuantityPerCapita]) => ({
      goodKey,
      availableQuantityPerCapita,
    })),
    income,
  };
}

export function aggregateScenario(): PopulationScenarioDef {
  return loadM2WorldAggregate();
}

export function multiBlockScenario(): PopulationScenarioDef {
  return loadM2MultiBlock();
}

export function aggregateWorld(seed = 20_261_023): {
  scenario: PopulationScenarioDef;
  world: World;
} {
  const scenario = aggregateScenario();
  return { scenario, world: createPopulationWorld(scenario, { seed }) };
}

export function multiBlockWorld(seed = 20_261_023): {
  scenario: PopulationScenarioDef;
  world: World;
} {
  const scenario = multiBlockScenario();
  return { scenario, world: createPopulationWorld(scenario, { seed }) };
}

export function contextFor(
  scenario: PopulationScenarioDef,
  inputs: PopulationInputs,
  collectNeedDetails = true,
): TickContext {
  return {
    population: {
      definitions: scenario.definitions,
      inputs,
      collectNeedDetails,
    },
  };
}

export function cohorts(
  values: Partial<Record<number, number>> = {},
): number[] {
  const result = new Array<number>(17).fill(0);
  for (const [index, value] of Object.entries(values)) {
    result[Number(index)] = value ?? 0;
  }
  return result;
}

export function splitAgeGroups(
  groups: readonly number[],
  maleShare = 0.5,
): { male: number[]; female: number[] } {
  const male: number[] = [];
  const female: number[] = [];
  for (const value of groups) {
    const maleValue = Math.round(value * maleShare);
    male.push(maleValue);
    female.push(value - maleValue);
  }
  return { male, female };
}

export function customScenario(
  popBlocks: PopulationScenarioDef["popBlocks"],
  base: PopulationScenarioDef = aggregateScenario(),
): PopulationScenarioDef {
  return {
    ...base,
    provinceEconomies: [{ ...base.provinceEconomies[0]!, key: "test-province", name: "Test province" }],
    popBlocks,
  };
}

export function oneBlockScenario(totalPerCohort: Partial<Record<number, number>>): PopulationScenarioDef {
  const groups = cohorts(totalPerCohort);
  const split = splitAgeGroups(groups);
  return customScenario([
    {
      id: 0,
      provinceId: 0,
      professionId: 0,
      financialAccountId: 0,
      maleAgeGroups: split.male,
      femaleAgeGroups: split.female,
      literacy: 0.5,
      wealthLevel: 30,
      initialSavingsRUSD: 1000,
      militancy: 0.1,
    },
  ]);
}


export function inputOverridesWithSupply(
  multiplier: number,
): Readonly<Record<string, number>> {
  const result: Record<string, number> = {};
  for (const [key, value] of Object.entries(BASE_SUPPLY_PER_CAPITA)) {
    result[key] = value * multiplier;
  }
  return result;
}
