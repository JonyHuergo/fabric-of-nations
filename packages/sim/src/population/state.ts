/**
 * Population/finance state validation and scenario construction.
 *
 * These functions never clamp or repair state. Invalid state is rejected with a
 * field path so a corrupt save or malformed fixture cannot silently produce a
 * different simulation.
 */

import { MAX_SCENARIO_ID_LENGTH, SIM_VERSION, WORLD_SCHEMA_VERSION } from "../constants.js";
import type { Id, Rate, Seed } from "../types.js";
import {
  requireArray,
  requireFiniteNumber,
  requireInteger,
  requireRecord,
  requireString,
  requireUint32,
} from "../validation.js";
import type { World, CreateWorldOptions } from "../world.js";
import {
  AGE_COHORT_COUNT,
  WORKING_AGE_FIRST_COHORT,
  WORKING_AGE_LAST_COHORT,
} from "./constants.js";
import { assertValidPopulationDefinitions } from "./definitions.js";
import type {
  FinanceState,
  FinancialAccount,
  PopBlock,
  PopulationScenarioDef,
  Region,
} from "./types.js";

function assertId(value: unknown, path: string): asserts value is Id {
  requireUint32(value, path);
}

function assertRate(value: unknown, path: string): asserts value is Rate {
  const number = requireFiniteNumber(value, path);
  if (number < 0 || number > 1) {
    throw new RangeError(`${path} must be in 0..1, received ${String(number)}`);
  }
}

function assertWealth(value: unknown, path: string): asserts value is number {
  const number = requireFiniteNumber(value, path);
  if (number < 0 || number > 99) {
    throw new RangeError(`${path} must be in 0..99, received ${String(number)}`);
  }
}

function assertNonNegative(value: unknown, path: string): asserts value is number {
  const number = requireFiniteNumber(value, path);
  if (number < 0) {
    throw new RangeError(`${path} must be non-negative, received ${String(number)}`);
  }
}

function assertRemainder(value: unknown, path: string): asserts value is number {
  const number = requireFiniteNumber(value, path);
  if (number < 0 || number >= 1) {
    throw new RangeError(`${path} must be in [0, 1), received ${String(number)}`);
  }
}

/** Validate one region. */
export function assertValidRegion(region: Region): void {
  const record = requireRecord(region, "region");
  assertId(record.id, "region.id");
  requireString(record.key, "region.key", { minLength: 1 });
  requireString(record.name, "region.name", { minLength: 1 });
  const popBlockIds = requireArray(record.popBlockIds, "region.popBlockIds");
  const seen = new Set<number>();
  for (let index = 0; index < popBlockIds.length; index += 1) {
    const id = popBlockIds[index];
    assertId(id, `region.popBlockIds[${String(index)}]`);
    if (seen.has(id)) {
      throw new RangeError(`region.popBlockIds contains duplicate id ${String(id)}`);
    }
    seen.add(id);
  }
}

/** Validate one household financial account. */
export function assertValidFinancialAccount(account: FinancialAccount): void {
  const record = requireRecord(account, "finance.accounts[]");
  assertId(record.id, "finance.accounts[].id");
  if (record.ownerKind !== "popBlock") {
    throw new RangeError('finance account ownerKind must be "popBlock" in M2');
  }
  assertId(record.ownerId, "finance.accounts[].ownerId");
  if (record.accountKind !== "household") {
    throw new RangeError('finance account accountKind must be "household" in M2');
  }
  assertNonNegative(record.balanceSUSD, "finance.accounts[].balanceSUSD");
}

/** Validate the minimal M2 finance state. */
export function assertValidFinanceState(finance: FinanceState): void {
  const record = requireRecord(finance, "world.finance");
  const accounts = requireArray(record.accounts, "world.finance.accounts");
  const ids = new Set<number>();
  const owners = new Set<number>();
  for (let index = 0; index < accounts.length; index += 1) {
    const account = accounts[index] as unknown;
    assertValidFinancialAccount(account as FinancialAccount);
    const typed = account as FinancialAccount;
    if (ids.has(typed.id)) {
      throw new RangeError(`duplicate finance account id ${String(typed.id)}`);
    }
    if (owners.has(typed.ownerId)) {
      throw new RangeError(`pop block ${String(typed.ownerId)} has multiple household accounts`);
    }
    ids.add(typed.id);
    owners.add(typed.ownerId);
  }
}

/** Validate one pop block's dense and scalar state. */
export function assertValidPopBlock(block: PopBlock): void {
  const record = requireRecord(block, "popBlock");
  assertId(record.id, "popBlock.id");
  assertId(record.regionId, "popBlock.regionId");
  assertId(record.professionId, "popBlock.professionId");
  assertId(record.financialAccountId, "popBlock.financialAccountId");

  const cohorts = record.ageCohorts;
  if (!(cohorts instanceof Uint32Array)) {
    throw new TypeError("popBlock.ageCohorts must be a Uint32Array");
  }
  if (cohorts.length !== AGE_COHORT_COUNT) {
    throw new RangeError(
      `popBlock.ageCohorts must have length ${AGE_COHORT_COUNT}, received ${String(cohorts.length)}`,
    );
  }
  let total = 0;
  for (let index = 0; index < cohorts.length; index += 1) {
    const value = cohorts[index];
    if (value === undefined) throw new RangeError(`popBlock.ageCohorts[${String(index)}] missing`);
    total += value;
  }
  if (!Number.isSafeInteger(total)) {
    throw new RangeError("popBlock.ageCohorts total is not a safe integer");
  }

  const carry = record.agingCarry;
  if (!(carry instanceof Uint8Array)) {
    throw new TypeError("popBlock.agingCarry must be a Uint8Array");
  }
  if (carry.length !== AGE_COHORT_COUNT) {
    throw new RangeError(
      `popBlock.agingCarry must have length ${AGE_COHORT_COUNT}, received ${String(carry.length)}`,
    );
  }
  for (let index = 0; index < carry.length; index += 1) {
    const value = carry[index];
    if (value === undefined || value > 4) {
      throw new RangeError(`popBlock.agingCarry[${String(index)}] must be in 0..4`);
    }
  }
  if (carry[AGE_COHORT_COUNT - 1] !== 0) {
    throw new RangeError("popBlock.agingCarry[16] must be zero; the 80+ cohort does not age out");
  }

  assertRate(record.literacy, "popBlock.literacy");
  assertWealth(record.wealthLevel, "popBlock.wealthLevel");
  assertRate(record.militancy, "popBlock.militancy");
  requireInteger(record.unmetSubsistenceDays, "popBlock.unmetSubsistenceDays", 0, Number.MAX_SAFE_INTEGER);
  requireInteger(record.unmetBasicDays, "popBlock.unmetBasicDays", 0, Number.MAX_SAFE_INTEGER);
  requireInteger(record.comfortFulfilledDays, "popBlock.comfortFulfilledDays", 0, Number.MAX_SAFE_INTEGER);
  assertRemainder(record.fractionalBirthRemainder, "popBlock.fractionalBirthRemainder");
  assertRemainder(record.fractionalDeathRemainder, "popBlock.fractionalDeathRemainder");
}

function assertUnique<T>(values: readonly T[], key: (value: T) => string | number, path: string): void {
  const seen = new Set<string | number>();
  for (const value of values) {
    const selected = key(value);
    if (seen.has(selected)) {
      throw new RangeError(`${path} contains duplicate value ${String(selected)}`);
    }
    seen.add(selected);
  }
}

/**
 * Validate population/finance state and all cross-references. Empty regions,
 * pop blocks, and accounts are valid for M1-style empty worlds.
 */
export function assertValidPopulationState(world: World): void {
  const regions = requireArray(world.regions, "world.regions");
  const blocks = requireArray(world.popBlocks, "world.popBlocks");
  if (regions.length > 1) {
    throw new RangeError("M2 supports at most one region");
  }
  for (let index = 0; index < regions.length; index += 1) {
    assertValidRegion(regions[index] as Region);
  }
  assertUnique(regions as Region[], (region) => region.id, "world.regions");
  assertUnique(regions as Region[], (region) => region.key, "world.regions");
  const regionIds = new Set<number>((regions as Region[]).map((region) => region.id));

  for (let index = 0; index < blocks.length; index += 1) {
    assertValidPopBlock(blocks[index] as PopBlock);
  }
  assertUnique(blocks as PopBlock[], (block) => block.id, "world.popBlocks");
  const blockIds = new Set<number>((blocks as PopBlock[]).map((block) => block.id));

  assertValidFinanceState(world.finance);
  const accountById = new Map<number, FinancialAccount>();
  for (const account of world.finance.accounts) {
    accountById.set(account.id, account);
  }
  const accountOwners = new Set<number>();
  for (const block of blocks as PopBlock[]) {
    if (!regionIds.has(block.regionId)) {
      throw new RangeError(`popBlock ${String(block.id)} references unknown region ${String(block.regionId)}`);
    }
    const account = accountById.get(block.financialAccountId);
    if (account === undefined) {
      throw new RangeError(
        `popBlock ${String(block.id)} references unknown financial account ${String(block.financialAccountId)}`,
      );
    }
    if (account.ownerId !== block.id) {
      throw new RangeError(
        `financial account ${String(account.id)} is not owned by popBlock ${String(block.id)}`,
      );
    }
    if (accountOwners.has(account.id)) {
      throw new RangeError(`financial account ${String(account.id)} is referenced by multiple pop blocks`);
    }
    accountOwners.add(account.id);
  }
  for (const account of world.finance.accounts) {
    if (!blockIds.has(account.ownerId)) {
      throw new RangeError(
        `financial account ${String(account.id)} references unknown popBlock ${String(account.ownerId)}`,
      );
    }
  }

  for (const region of regions as Region[]) {
    const expected = (blocks as PopBlock[])
      .filter((block) => block.regionId === region.id)
      .map((block) => block.id)
      .sort((left, right) => left - right);
    const actual = [...region.popBlockIds].sort((left, right) => left - right);
    if (expected.length !== actual.length || expected.some((value, index) => value !== actual[index])) {
      throw new RangeError(`region ${String(region.id)} popBlockIds do not match its pop blocks`);
    }
    for (const id of region.popBlockIds) {
      if (!blockIds.has(id)) {
        throw new RangeError(`region ${String(region.id)} references unknown popBlock ${String(id)}`);
      }
    }
  }
}

/** Sum all 17 cohorts of one pop block. */
export function populationTotal(block: PopBlock): number {
  let total = 0;
  for (let index = 0; index < block.ageCohorts.length; index += 1) {
    total += block.ageCohorts[index] ?? 0;
  }
  return total;
}

/** Sum the 15-64 cohorts (indices 3 through 12 inclusive). */
export function workingAgePopulation(block: PopBlock): number {
  let total = 0;
  for (let index = WORKING_AGE_FIRST_COHORT; index <= WORKING_AGE_LAST_COHORT; index += 1) {
    total += block.ageCohorts[index] ?? 0;
  }
  return total;
}

/** Sum population across all blocks. */
export function worldPopulation(world: World): number {
  let total = 0;
  for (const block of world.popBlocks) total += populationTotal(block);
  return total;
}

/** Sum population across all blocks in one region. */
export function regionPopulation(world: World, regionId: Id): number {
  let total = 0;
  for (const block of world.popBlocks) {
    if (block.regionId === regionId) total += populationTotal(block);
  }
  return total;
}

/**
 * Build an M2 world from a scenario definition.
 *
 * The scenario is validated before state is created. Typed arrays are copied so
 * the world does not alias static definition arrays.
 */
export function createPopulationWorld(
  scenario: PopulationScenarioDef,
  options: CreateWorldOptions = {},
): World {
  const seed: Seed = options.seed ?? 0;
  requireUint32(seed, "seed");
  requireString(options.scenarioId ?? scenario.scenarioId, "scenarioId", {
    minLength: 1,
    maxLength: MAX_SCENARIO_ID_LENGTH,
  });
  if ((options.scenarioId ?? scenario.scenarioId) !== scenario.scenarioId) {
    throw new RangeError("options.scenarioId must match the scenario definition");
  }
  if (scenario.dataVersion.length === 0) {
    throw new RangeError("scenario.dataVersion must be non-empty");
  }
  if (scenario.definitions.dataVersion !== scenario.dataVersion) {
    throw new RangeError("scenario and definitions dataVersion must match");
  }
  if (scenario.definitions.scenarioId !== scenario.scenarioId) {
    throw new RangeError("scenario and definitions scenarioId must match");
  }
  assertValidPopulationDefinitions(scenario.definitions);

  if (scenario.regions.length !== 1) {
    throw new RangeError("M2 population scenarios must define exactly one region");
  }
  if (scenario.professions.length === 0) {
    throw new RangeError("M2 scenario must define at least one profession identity");
  }
  assertUnique(scenario.professions, (profession) => profession.id, "scenario.professions");
  assertUnique(scenario.professions, (profession) => profession.key, "scenario.professions");
  assertUnique(scenario.regions, (region) => region.id, "scenario.regions");
  assertUnique(scenario.popBlocks, (block) => block.id, "scenario.popBlocks");
  assertUnique(scenario.popBlocks, (block) => block.financialAccountId, "scenario.popBlocks");

  const professionIds = new Set(scenario.professions.map((profession) => profession.id));
  const fertilityProfessionIds = new Set(
    scenario.definitions.fertilityMultipliers.map((entry) => entry.professionId),
  );
  for (const profession of scenario.professions) {
    if (!fertilityProfessionIds.has(profession.id)) {
      throw new RangeError(
        `missing fertility multiplier for profession ${String(profession.id)}`,
      );
    }
  }
  for (const professionId of fertilityProfessionIds) {
    if (!professionIds.has(professionId)) {
      throw new RangeError(
        `fertility multiplier references unknown profession ${String(professionId)}`,
      );
    }
  }
  const region = scenario.regions[0];
  if (region === undefined) throw new RangeError("scenario.regions[0] is missing");

  const accounts: FinancialAccount[] = [];
  const blocks: PopBlock[] = [];
  for (const initial of scenario.popBlocks) {
    if (!professionIds.has(initial.professionId)) {
      throw new RangeError(
        `popBlock ${String(initial.id)} references unknown profession ${String(initial.professionId)}`,
      );
    }
    if (initial.regionId !== region.id) {
      throw new RangeError(`popBlock ${String(initial.id)} must belong to the single M2 region`);
    }
    if (initial.ageCohorts.length !== AGE_COHORT_COUNT) {
      throw new RangeError(
        `popBlock ${String(initial.id)} ageCohorts must have length ${AGE_COHORT_COUNT}`,
      );
    }
    const cohorts = new Uint32Array(AGE_COHORT_COUNT);
    let total = 0;
    for (let index = 0; index < initial.ageCohorts.length; index += 1) {
      const value = initial.ageCohorts[index];
      if (value === undefined) throw new RangeError("initial cohort value missing");
      requireInteger(value, `popBlock ${String(initial.id)} ageCohorts[${String(index)}]`, 0, 0xffff_ffff);
      cohorts[index] = value;
      total += value;
    }
    if (!Number.isSafeInteger(total)) {
      throw new RangeError(`popBlock ${String(initial.id)} population is not a safe integer`);
    }
    assertRate(initial.literacy, `popBlock ${String(initial.id)} literacy`);
    assertWealth(initial.wealthLevel, `popBlock ${String(initial.id)} wealthLevel`);
    assertNonNegative(initial.initialSavingsSUSD, `popBlock ${String(initial.id)} initialSavingsSUSD`);
    assertRate(initial.militancy, `popBlock ${String(initial.id)} militancy`);

    const block: PopBlock = {
      id: initial.id,
      regionId: initial.regionId,
      professionId: initial.professionId,
      ageCohorts: cohorts,
      agingCarry: new Uint8Array(AGE_COHORT_COUNT),
      literacy: initial.literacy,
      wealthLevel: initial.wealthLevel,
      financialAccountId: initial.financialAccountId,
      militancy: initial.militancy,
      unmetSubsistenceDays: 0,
      unmetBasicDays: 0,
      comfortFulfilledDays: 0,
      fractionalBirthRemainder: 0,
      fractionalDeathRemainder: 0,
    };
    blocks.push(block);
    accounts.push({
      id: initial.financialAccountId,
      ownerKind: "popBlock",
      ownerId: initial.id,
      accountKind: "household",
      balanceSUSD: initial.initialSavingsSUSD,
    });
  }

  const worldRegion: Region = {
    id: region.id,
    key: region.key,
    name: region.name,
    popBlockIds: blocks.map((block) => block.id),
  };

  const world: World = {
    schemaVersion: WORLD_SCHEMA_VERSION,
    simVersion: SIM_VERSION,
    dataVersion: scenario.dataVersion,
    scenarioId: scenario.scenarioId,
    dayIndex: 0,
    seed,
    regions: [worldRegion],
    popBlocks: blocks,
    finance: { accounts } satisfies FinanceState,
    diagnostics: {
      invariantFailureCount: 0,
      invalidActionCount: 0,
      eventApplicationCount: 0,
      recentWarnings: [],
    },
  };

  assertValidPopulationState(world);
  return world;
}
