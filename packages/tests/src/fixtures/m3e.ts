import {
  createEconomyWorld,
  designatedCashTotal,
  refreshEmployment,
  runMarketDay,
  settleMarketDay,
  type EconomyScenarioDef,
  type MarketDayResult,
  type MarketSettlementResult,
  type TickContext,
  type World,
} from "@century/sim";
import {
  marketInput,
  marketScenario,
  productionDemand,
  household,
} from "./m3d.js";

export function accountBalance(world: World, accountId: number): number {
  const account = world.finance.accounts.find((candidate) => candidate.id === accountId);
  if (account === undefined) throw new Error(`missing account ${String(accountId)}`);
  return account.balanceRUSD;
}

export function economyTickContext(scenario: EconomyScenarioDef): TickContext {
  return {
    population: { definitions: scenario.population.definitions },
    economy: { definitions: scenario.definitions },
  };
}

export function householdAccountId(world: World, popBlockId: number): number {
  const block = world.popBlocks.find((candidate) => candidate.id === popBlockId);
  if (block === undefined) throw new Error(`missing popBlock ${String(popBlockId)}`);
  return block.financialAccountId;
}

export function buildingAccountId(world: World, buildingId: number): number {
  const building = world.buildings.find((candidate) => candidate.id === buildingId);
  if (building === undefined) throw new Error(`missing building ${String(buildingId)}`);
  return building.operatingCashAccountId;
}

export function totalCash(world: World): number {
  return designatedCashTotal(world.finance);
}

/**
 * Set a designated cash balance and adjust the matching owner-equity account by
 * the same delta so the accounting identity stays valid. Test-only helper.
 */
export function setCashBalance(world: World, accountId: number, balanceRUSD: number): void {
  const account = world.finance.accounts.find((candidate) => candidate.id === accountId);
  if (account === undefined) throw new Error(`missing account ${String(accountId)}`);
  if (
    account.subtype !== "household-cash" &&
    account.subtype !== "operating-cash" &&
    account.subtype !== "system-reserve-cash"
  ) {
    throw new Error(`account ${String(accountId)} is not a designated cash account`);
  }
  const equity = world.finance.accounts.find(
    (candidate) =>
      candidate.subtype === "owner-equity" &&
      candidate.ownerKind === account.ownerKind &&
      candidate.ownerId === account.ownerId,
  );
  if (equity === undefined) {
    throw new Error(`missing owner-equity account for cash account ${String(accountId)}`);
  }
  equity.balanceRUSD += balanceRUSD - account.balanceRUSD;
  account.balanceRUSD = balanceRUSD;
}

export interface SettlementCase {
  readonly scenario: EconomyScenarioDef;
  readonly world: World;
  readonly marketDay: MarketDayResult;
  readonly settlement: MarketSettlementResult;
}

export function runSettlement(
  scenario: EconomyScenarioDef,
  world: World,
  householdDemands: Parameters<typeof marketInput>[2] = [],
  productionDemands: Parameters<typeof marketInput>[3] = [],
): SettlementCase {
  const marketDay = runMarketDay(
    world,
    scenario.definitions,
    marketInput(scenario, world, householdDemands, productionDemands),
  );
  const settlement = settleMarketDay(world, scenario.definitions, marketDay);
  return { scenario, world, marketDay, settlement };
}

export function singleBuildingScenario(options: {
  readonly buildingIds: readonly number[];
  readonly lots?: readonly { goodId: number; ownerBuildingId: number; quantity: number }[];
} = { buildingIds: [] }): EconomyScenarioDef {
  const scenario = marketScenario({
    produce: true,
    lots: options.lots ?? [],
  });
  scenario.employment = scenario.employment.filter((assignment) =>
    options.buildingIds.includes(assignment.buildingInstanceId),
  );
  // D-155: the labour market staffs every job it can at creation and does not read the
  // assignment list, so a producer outside `buildingIds` gives its jobs to the clerks,
  // whose block is empty in this fixture: it has no workers, as it had no assignments.
  for (const building of scenario.buildingInstances) {
    if (options.buildingIds.includes(building.id)) continue;
    const definition = scenario.definitions.buildings.find((candidate) => candidate.id === building.definitionId);
    const first = definition?.jobs[0];
    if (definition !== undefined && first !== undefined) definition.jobs = [{ ...first, professionId: 2 }];
  }
  return scenario;
}

export function createSettlementWorld(
  options: {
    readonly buildingIds: readonly number[];
    readonly lots?: readonly { goodId: number; ownerBuildingId: number; quantity: number }[];
    readonly activeBuildingIds?: readonly number[];
  } = { buildingIds: [] },
): { readonly scenario: EconomyScenarioDef; readonly world: World } {
  const scenario = singleBuildingScenario(options);
  const world = createEconomyWorld(scenario, { seed: 20_261_023 });
  if (options.activeBuildingIds !== undefined) {
    const active = new Set(options.activeBuildingIds);
    for (const building of world.buildings) {
      if (!active.has(building.id)) building.operational = false;
    }
    // D-155: the labour market keeps no assignment at a closed building; a closure is
    // followed by the forced refresh the game runs (`markEmploymentDirty`).
    refreshEmployment(world, scenario.definitions, world.dayIndex, { force: true });
  }
  return { scenario, world };
}

export { household, productionDemand };
