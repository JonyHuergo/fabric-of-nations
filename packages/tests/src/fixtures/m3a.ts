import { loadM3SmallEconomy } from "@century/data";
import {
  createEconomyWorld,
  designatedCashTotal,
  type EconomyScenarioDef,
  type World,
} from "@century/sim";

export const M3A_SEED = 20_261_023;

export const M3_HOUSEHOLD_ACCOUNT_IDS = [0, 1, 2, 3] as const;
export const M3_BUILDING_ACCOUNT_FIRST_ID = 10;
export const M3_SYSTEM_ACCOUNT_ID = 20;

export function m3Scenario(): EconomyScenarioDef {
  return loadM3SmallEconomy();
}

export function cloneM3Scenario(): EconomyScenarioDef {
  return JSON.parse(JSON.stringify(m3Scenario())) as EconomyScenarioDef;
}

export function m3World(seed = M3A_SEED): {
  scenario: EconomyScenarioDef;
  world: World;
} {
  const scenario = m3Scenario();
  return { scenario, world: createEconomyWorld(scenario, { seed }) };
}

export function accountBalance(world: World, accountId: number): number {
  const account = world.finance.accounts.find((candidate) => candidate.id === accountId);
  if (account === undefined) throw new Error(`missing account ${String(accountId)}`);
  return account.balanceRUSD;
}

export function totalCash(world: World): number {
  return designatedCashTotal(world.finance);
}
