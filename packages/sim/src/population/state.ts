/**
 * Population/finance state validation and scenario construction.
 *
 * These functions never clamp or repair state. Invalid state is rejected with a
 * field path so a corrupt save or malformed fixture cannot silently produce a
 * different simulation.
 */

import { assertValidDayIndex } from "../calendar.js";
import { DEFAULT_DATA_VERSION, MAX_SCENARIO_ID_LENGTH, SIM_VERSION, WORLD_SCHEMA_VERSION } from "../constants.js";
import { applyOpeningBalances, categoryForSubtype } from "../economy/accounts.js";
import type { OpeningBalanceEntry } from "../economy/accounts.js";
import type { AccountSubtype } from "../economy/types.js";
import type { Day, Id, Rate, Seed } from "../types.js";
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
  AGE_BAND_WIDTH,
  AGE_COHORT_COUNT,
  SINGLE_AGE_COUNT,
  TERMINAL_AGE_INDEX,
  WORKING_AGE_END,
  WORKING_AGE_START,
} from "./constants.js";
import { assertValidPopulationDefinitions, expandAgeGroupsToSingle } from "./definitions.js";
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
  if (record.marketId !== null) {
    assertId(record.marketId, "region.marketId");
  }
  const buildingIds = requireArray(record.buildingInstanceIds, "region.buildingInstanceIds");
  const seenBuildings = new Set<number>();
  for (let index = 0; index < buildingIds.length; index += 1) {
    const id = buildingIds[index];
    assertId(id, `region.buildingInstanceIds[${String(index)}]`);
    if (seenBuildings.has(id)) {
      throw new RangeError(`region.buildingInstanceIds contains duplicate id ${String(id)}`);
    }
    seenBuildings.add(id);
  }
  const resourceCaps = requireArray(record.resourceCapsPerDay, "region.resourceCapsPerDay");
  for (let index = 0; index < resourceCaps.length; index += 1) {
    const cap = requireFiniteNumber(
      resourceCaps[index],
      `region.resourceCapsPerDay[${String(index)}]`,
    );
    if (cap < 0) {
      throw new RangeError(`region.resourceCapsPerDay[${String(index)}] must be non-negative`);
    }
  }
  for (const field of ["unrest", "infrastructure"] as const) {
    const rate = requireFiniteNumber(record[field], `region.${field}`);
    if (rate < 0 || rate > 1) {
      throw new RangeError(`region.${field} must be in 0..1`);
    }
  }
}

/** Validate one pop block's dense and scalar state. */
export function assertValidPopBlock(block: PopBlock): void {
  const record = requireRecord(block, "popBlock");
  assertId(record.id, "popBlock.id");
  assertId(record.regionId, "popBlock.regionId");
  assertId(record.professionId, "popBlock.professionId");
  assertId(record.financialAccountId, "popBlock.financialAccountId");

  const male = record.maleByAge;
  const female = record.femaleByAge;
  if (!(male instanceof Uint32Array)) {
    throw new TypeError("popBlock.maleByAge must be a Uint32Array");
  }
  if (!(female instanceof Uint32Array)) {
    throw new TypeError("popBlock.femaleByAge must be a Uint32Array");
  }
  if (male.length !== SINGLE_AGE_COUNT || female.length !== SINGLE_AGE_COUNT) {
    throw new RangeError(
      `popBlock sex-age arrays must have length ${String(SINGLE_AGE_COUNT)}`,
    );
  }
  let total = 0;
  for (let index = 0; index < SINGLE_AGE_COUNT; index += 1) {
    const maleValue = male[index];
    const femaleValue = female[index];
    if (maleValue === undefined || femaleValue === undefined) {
      throw new RangeError(`popBlock sex-age value missing at age ${String(index)}`);
    }
    total += maleValue;
    total += femaleValue;
  }
  if (!Number.isSafeInteger(total)) {
    throw new RangeError("popBlock population is not a safe integer");
  }

  assertRate(record.literacy, "popBlock.literacy");
  assertWealth(record.wealthLevel, "popBlock.wealthLevel");
  assertRate(record.militancy, "popBlock.militancy");
  requireInteger(record.unmetSubsistenceDays, "popBlock.unmetSubsistenceDays", 0, Number.MAX_SAFE_INTEGER);
  requireInteger(record.unmetBasicDays, "popBlock.unmetBasicDays", 0, Number.MAX_SAFE_INTEGER);
  requireInteger(record.comfortFulfilledDays, "popBlock.comfortFulfilledDays", 0, Number.MAX_SAFE_INTEGER);
  assertRemainder(record.fractionalBirthRemainder, "popBlock.fractionalBirthRemainder");
  assertRemainder(record.fractionalMaleBirthRemainder, "popBlock.fractionalMaleBirthRemainder");
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
  // M2 construction still creates exactly one region, but M5 economic worlds may
  // author several. Region/market relationships are validated by the economy
  // state pass, which knows the market collection.
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

  const accountById = new Map<number, FinancialAccount>();
  for (const account of world.finance.accounts) {
    if (accountById.has(account.id)) {
      throw new RangeError(`duplicate finance account id ${String(account.id)}`);
    }
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
    if (account.subtype !== "household-cash" || account.ownerKind !== "popBlock") {
      throw new RangeError(
        `financial account ${String(account.id)} must be a popBlock household cash account`,
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
    if (account.ownerKind === "popBlock" && (account.ownerId === null || !blockIds.has(account.ownerId))) {
      throw new RangeError(
        `popBlock financial account ${String(account.id)} references unknown popBlock`,
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

/** Sum all male and female single-age counts of one pop block. */
export function populationTotal(block: PopBlock): number {
  let total = 0;
  for (let index = 0; index < SINGLE_AGE_COUNT; index += 1) {
    total += block.maleByAge[index] ?? 0;
    total += block.femaleByAge[index] ?? 0;
  }
  return total;
}

/** Derive male five-year age-group totals without storing duplicate state. */
export function maleFiveYearAgeGroups(block: PopBlock): Uint32Array {
  const groups = new Uint32Array(AGE_COHORT_COUNT);
  for (let age = 0; age < SINGLE_AGE_COUNT; age += 1) {
    const band = Math.min(Math.floor(age / AGE_BAND_WIDTH), TERMINAL_AGE_INDEX);
    groups[band] = (groups[band] ?? 0) + (block.maleByAge[age] ?? 0);
  }
  return groups;
}

/** Derive female five-year age-group totals without storing duplicate state. */
export function femaleFiveYearAgeGroups(block: PopBlock): Uint32Array {
  const groups = new Uint32Array(AGE_COHORT_COUNT);
  for (let age = 0; age < SINGLE_AGE_COUNT; age += 1) {
    const band = Math.min(Math.floor(age / AGE_BAND_WIDTH), TERMINAL_AGE_INDEX);
    groups[band] = (groups[band] ?? 0) + (block.femaleByAge[age] ?? 0);
  }
  return groups;
}

/** Derive combined five-year age-group totals without storing duplicate state. */
export function fiveYearAgeGroups(block: PopBlock): Uint32Array {
  const male = maleFiveYearAgeGroups(block);
  const female = femaleFiveYearAgeGroups(block);
  const groups = new Uint32Array(AGE_COHORT_COUNT);
  for (let index = 0; index < AGE_COHORT_COUNT; index += 1) {
    groups[index] = (male[index] ?? 0) + (female[index] ?? 0);
  }
  return groups;
}

/** Sum the 15-64 population across both sexes. */
export function workingAgePopulation(block: PopBlock): number {
  let total = 0;
  for (let age = WORKING_AGE_START; age <= WORKING_AGE_END; age += 1) {
    total += block.maleByAge[age] ?? 0;
    total += block.femaleByAge[age] ?? 0;
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
  const startDayIndex: Day = options.startDayIndex ?? scenario.startDayIndex ?? 0;
  requireUint32(seed, "seed");
  assertValidDayIndex(startDayIndex);
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
  if (scenario.dataVersion !== DEFAULT_DATA_VERSION) {
    throw new RangeError(
      `scenario.dataVersion ${JSON.stringify(scenario.dataVersion)} is incompatible with this build (${JSON.stringify(DEFAULT_DATA_VERSION)})`,
    );
  }
  if (scenario.definitions.dataVersion !== scenario.dataVersion) {
    throw new RangeError("scenario and definitions dataVersion must match");
  }
  if (scenario.definitions.scenarioId !== scenario.scenarioId) {
    throw new RangeError("scenario and definitions scenarioId must match");
  }
  assertValidPopulationDefinitions(scenario.definitions);

  if (options.allowMultipleRegions !== true && scenario.regions.length !== 1) {
    throw new RangeError("M2 population scenarios must define exactly one region");
  }
  if (scenario.regions.length === 0) {
    throw new RangeError("scenario must define at least one region");
  }
  if (scenario.professions.length === 0) {
    throw new RangeError("M2 scenario must define at least one profession identity");
  }
  assertUnique(scenario.professions, (profession) => profession.id, "scenario.professions");
  assertUnique(scenario.professions, (profession) => profession.key, "scenario.professions");
  assertUnique(scenario.regions, (region) => region.id, "scenario.regions");
  assertUnique(scenario.regions, (region) => region.key, "scenario.regions");
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
  const regionById = new Map<number, (typeof scenario.regions)[number]>();
  for (const region of scenario.regions) regionById.set(region.id, region);

  const floor = options.accountIdFloor ?? 1;
  const maxDeclared = scenario.popBlocks.reduce(
    (max, block) => Math.max(max, block.financialAccountId),
    0,
  );
  let nextAccountId = Math.max(floor, maxDeclared + 1);

  const accounts: FinancialAccount[] = [];
  const blocks: PopBlock[] = [];
  const openingEntries: OpeningBalanceEntry[] = [];
  const sortedPopBlocks = [...scenario.popBlocks].sort((left, right) => left.id - right.id);
  for (const initial of sortedPopBlocks) {
    if (!professionIds.has(initial.professionId)) {
      throw new RangeError(
        `popBlock ${String(initial.id)} references unknown profession ${String(initial.professionId)}`,
      );
    }
    if (!regionById.has(initial.regionId)) {
      throw new RangeError(
        `popBlock ${String(initial.id)} references unknown region ${String(initial.regionId)}`,
      );
    }
    if (initial.maleAgeGroups.length !== AGE_COHORT_COUNT) {
      throw new RangeError(
        `popBlock ${String(initial.id)} maleAgeGroups must have length ${String(AGE_COHORT_COUNT)}`,
      );
    }
    if (initial.femaleAgeGroups.length !== AGE_COHORT_COUNT) {
      throw new RangeError(
        `popBlock ${String(initial.id)} femaleAgeGroups must have length ${String(AGE_COHORT_COUNT)}`,
      );
    }
    const maleByAge = expandAgeGroupsToSingle(
      initial.maleAgeGroups,
      `popBlock ${String(initial.id)} maleAgeGroups`,
    );
    const femaleByAge = expandAgeGroupsToSingle(
      initial.femaleAgeGroups,
      `popBlock ${String(initial.id)} femaleAgeGroups`,
    );
    let total = 0;
    for (const value of maleByAge) total += value;
    for (const value of femaleByAge) total += value;
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
      maleByAge,
      femaleByAge,
      literacy: initial.literacy,
      wealthLevel: initial.wealthLevel,
      financialAccountId: initial.financialAccountId,
      militancy: initial.militancy,
      unmetSubsistenceDays: 0,
      unmetBasicDays: 0,
      comfortFulfilledDays: 0,
      fractionalBirthRemainder: 0,
      fractionalMaleBirthRemainder: 0,
      fractionalDeathRemainder: 0,
    };
    blocks.push(block);

    // The cash account id is scenario-declared; the rest are deterministically
    // allocated. M4c fiscal accounts are conditional: they are created only when
    // the economy scenario declares at least one country and passes
    // `fiscalAccounts: true`. Countryless M2/M3 worlds keep their original
    // four-account owner set and have no fiscal phase.
    const equityAccountId = nextAccountId;
    nextAccountId += 1;
    const incomeAccountId = nextAccountId;
    nextAccountId += 1;
    const expenseAccountId = nextAccountId;
    nextAccountId += 1;
    const ownerAccounts: { id: Id; subtype: AccountSubtype }[] = [
      { id: initial.financialAccountId, subtype: "household-cash" },
      { id: equityAccountId, subtype: "owner-equity" },
      { id: incomeAccountId, subtype: "wage-income" },
      { id: expenseAccountId, subtype: "consumption-expense" },
    ];
    if (options.fiscalAccounts === true) {
      const taxExpenseAccountId = nextAccountId;
      nextAccountId += 1;
      const welfareIncomeAccountId = nextAccountId;
      nextAccountId += 1;
      ownerAccounts.push(
        { id: taxExpenseAccountId, subtype: "income-tax-expense" },
        { id: welfareIncomeAccountId, subtype: "welfare-income" },
      );
    }
    for (const ownerAccount of ownerAccounts) {
      accounts.push({
        id: ownerAccount.id,
        ownerKind: "popBlock",
        ownerId: initial.id,
        category: categoryForSubtype(ownerAccount.subtype),
        subtype: ownerAccount.subtype,
        balanceSUSD: 0,
      });
    }
    openingEntries.push({
      accountId: initial.financialAccountId,
      balanceSUSD: initial.initialSavingsSUSD,
    });
    openingEntries.push({
      accountId: equityAccountId,
      balanceSUSD: initial.initialSavingsSUSD,
    });
  }

  const worldRegions: Region[] = [...scenario.regions]
    .sort((left, right) => left.id - right.id)
    .map((region) => ({
      id: region.id,
      key: region.key,
      name: region.name,
      popBlockIds: blocks
        .filter((block) => block.regionId === region.id)
        .map((block) => block.id)
        .sort((left, right) => left - right),
      marketId: null,
      buildingInstanceIds: [],
      resourceCapsPerDay: [...(region.resourceCapsPerDay ?? [])],
      unrest: 0,
      infrastructure: region.infrastructure ?? 0.5,
    }));

  const world: World = {
    schemaVersion: WORLD_SCHEMA_VERSION,
    simVersion: SIM_VERSION,
    dataVersion: scenario.dataVersion,
    scenarioId: scenario.scenarioId,
    dayIndex: startDayIndex,
    startDayIndex,
    seed,
    regions: worldRegions,
    countries: [],
    currencies: [],
    currencyValuations: [],
    popBlocks: blocks,
    buildings: [],
    employment: [],
    employmentDirty: false,
    markets: [],
    finance: {
      accounts,
      postings: [],
      nextPostingId: 1,
      nextAccountId,
      opening: null,
      periodSummaries: [],
      annualSummaries: [],
      corrections: [],
      nextCorrectionId: 1,
      closedThroughDay: null,
      debtContracts: [],
      debtHistory: [],
      nextContractId: 1,
      budgetMemosThisMonth: {},
    } satisfies FinanceState,
    profitDistribution: {
      enabled: false,
      privatePayoutRate: 0.5,
      stateRemittanceRate: 1,
    },
    countryAI: { enabled: false },
    construction: {
      projects: [],
      history: [],
      nextProjectId: 1,
      nextBuildingId: 1,
    },
    playerCountryId: null,
    politics: {
      enabled: false,
      eventQueue: [],
      eventLog: [],
      nextEventId: 1,
      nextLogId: 1,
    },
    diagnostics: {
      invariantFailureCount: 0,
      invalidActionCount: 0,
      eventApplicationCount: 0,
      recentWarnings: [],
    },
  };

  if (options.deferOpeningBalances !== true) {
    applyOpeningBalances(world.finance, startDayIndex, openingEntries);
  }
  assertValidPopulationState(world);
  return world;
}
