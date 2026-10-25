import { loadM3SmallEconomy } from "@century/data";
import {
  createEconomyWorld,
  refreshEmployment,
  type DayIndex,
  type EconomyScenarioDef,
  type EmploymentAssignmentInitialDef,
  type ProfessionJobDef,
  type World,
} from "@century/sim";

export const M3B_SEED = 20_261_023;

export function cloneM3bScenario(): EconomyScenarioDef {
  return JSON.parse(JSON.stringify(loadM3SmallEconomy())) as EconomyScenarioDef;
}

/** Place `total` working-age people in the 15-19 band, male side only. */
export function workingAgeGroups(total: number): number[] {
  if (!Number.isInteger(total) || total < 0) {
    throw new RangeError("workingAgeGroups total must be a non-negative integer");
  }
  const groups = new Array<number>(17).fill(0);
  groups[3] = total;
  return groups;
}

export function setBlockWorkforce(
  scenario: EconomyScenarioDef,
  blockId: number,
  total: number,
  professionId: number,
  literacy = 0.5,
  wealthLevel = 50,
): void {
  const block = scenario.population.popBlocks.find((candidate) => candidate.id === blockId);
  if (block === undefined) throw new Error(`missing block ${String(blockId)}`);
  block.professionId = professionId;
  block.literacy = literacy;
  block.wealthLevel = wealthLevel;
  block.maleAgeGroups = workingAgeGroups(total);
  block.femaleAgeGroups = new Array<number>(17).fill(0);
}

export function setBuildingJobs(
  scenario: EconomyScenarioDef,
  definitionId: number,
  jobs: ProfessionJobDef[],
): void {
  const definition = scenario.definitions.buildings.find(
    (candidate) => candidate.id === definitionId,
  );
  if (definition === undefined) throw new Error(`missing building definition ${String(definitionId)}`);
  definition.jobs = jobs;
}

export function controlledScenario(
  options: {
    readonly employment?: EmploymentAssignmentInitialDef[];
  } = {},
): EconomyScenarioDef {
  const scenario = cloneM3bScenario();
  for (const block of scenario.population.popBlocks) {
    block.maleAgeGroups = new Array<number>(17).fill(0);
    block.femaleAgeGroups = new Array<number>(17).fill(0);
  }
  setBlockWorkforce(scenario, 0, 100, 0);
  scenario.employment = options.employment === undefined ? [] : [...options.employment];
  return scenario;
}

export function m3bWorld(
  scenario: EconomyScenarioDef,
  seed = M3B_SEED,
): World {
  return createEconomyWorld(scenario, { seed });
}

export function refresh(
  world: World,
  scenario: EconomyScenarioDef,
  dayIndex: DayIndex = 0,
): ReturnType<typeof refreshEmployment> {
  return refreshEmployment(world, scenario.definitions, dayIndex, { force: true });
}
