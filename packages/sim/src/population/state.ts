/**
 * Population/finance state validation and scenario construction.
 *
 * These functions never clamp or repair state. Invalid state is rejected with a
 * field path so a corrupt save or malformed fixture cannot silently produce a
 * different simulation.
 */

import { emptyResourceState } from "../economy/resourceState.js";
import { emptyDemographyReport } from "../economy/demographyReportState.js";
import {
  assertValidBlockDemography,
  calibrateBlockDemography,
  NEUTRAL_DEMOGRAPHY_FACTORS,
  sourcedLevelsOf,
} from "./demographicLevels.js";
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
import { emptyProvinceState } from "../provinces/state.js";
import { DEFAULT_MONEY_COEFFICIENTS } from "../economy/constants.js";
import {
  ADULT_LITERACY_MIN_AGE,
  AGE_BAND_WIDTH,
  AGE_COHORT_COUNT,
  LITERACY_AGGREGATE_TOLERANCE,
  RATE_DECIMAL_PLACES,
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
  ProvinceEconomy,
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

/** Validate one province. */
export function assertValidProvinceEconomy(province: ProvinceEconomy): void {
  const record = requireRecord(province, "province");
  assertId(record.id, "province.id");
  requireString(record.key, "province.key", { minLength: 1 });
  requireString(record.name, "province.name", { minLength: 1 });
  const popBlockIds = requireArray(record.popBlockIds, "province.popBlockIds");
  const seen = new Set<number>();
  for (let index = 0; index < popBlockIds.length; index += 1) {
    const id = popBlockIds[index];
    assertId(id, `province.popBlockIds[${String(index)}]`);
    if (seen.has(id)) {
      throw new RangeError(`province.popBlockIds contains duplicate id ${String(id)}`);
    }
    seen.add(id);
  }
  if (record.marketId !== null) {
    assertId(record.marketId, "province.marketId");
  }
  const buildingIds = requireArray(record.buildingInstanceIds, "province.buildingInstanceIds");
  const seenBuildings = new Set<number>();
  for (let index = 0; index < buildingIds.length; index += 1) {
    const id = buildingIds[index];
    assertId(id, `province.buildingInstanceIds[${String(index)}]`);
    if (seenBuildings.has(id)) {
      throw new RangeError(`province.buildingInstanceIds contains duplicate id ${String(id)}`);
    }
    seenBuildings.add(id);
  }
  for (const field of ["arableLandHa", "pastureHa"] as const) {
    const hectares = requireFiniteNumber(record[field], `province.${field}`);
    if (hectares < 0) throw new RangeError(`province.${field} must be non-negative`);
  }
  if (record.absLatitudeDeg !== null) {
    const latitude = requireFiniteNumber(record.absLatitudeDeg, "province.absLatitudeDeg");
    if (latitude < 0 || latitude > 90) throw new RangeError("province.absLatitudeDeg must be in 0..90");
  }
  if (record.hydroPotentialMWhPerYear !== null) {
    const potential = requireFiniteNumber(record.hydroPotentialMWhPerYear, "province.hydroPotentialMWhPerYear");
    if (potential < 0) throw new RangeError("province.hydroPotentialMWhPerYear must be non-negative");
  }
  for (const field of ["unrest", "infrastructure", "urbanShare"] as const) {
    const rate = requireFiniteNumber(record[field], `province.${field}`);
    if (rate < 0 || rate > 1) {
      throw new RangeError(`province.${field} must be in 0..1`);
    }
  }
  const wages = requireArray(record.wageRUSDPerYearByProfession, "province.wageRUSDPerYearByProfession");
  for (let index = 0; index < wages.length; index += 1) {
    const wage = requireFiniteNumber(wages[index], `province.wageRUSDPerYearByProfession[${String(index)}]`);
    if (!(wage > 0)) throw new RangeError("province.wageRUSDPerYearByProfession entries must be positive");
  }
}

/** Validate one pop block's dense and scalar state. */
export function assertValidPopBlock(block: PopBlock): void {
  const record = requireRecord(block, "popBlock");
  assertId(record.id, "popBlock.id");
  assertId(record.provinceId, "popBlock.provinceId");
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
  const literacyByAge = requireArray(record.literacyByAge, "popBlock.literacyByAge");
  if (literacyByAge.length !== SINGLE_AGE_COUNT) {
    throw new RangeError(
      `popBlock.literacyByAge must have length ${String(SINGLE_AGE_COUNT)}`,
    );
  }
  for (let age = 0; age < SINGLE_AGE_COUNT; age += 1) {
    // `assertRate`, with the path built only for a failing cell (D-137).
    const value: unknown = literacyByAge[age];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
      assertRate(value, `popBlock.literacyByAge[${String(age)}]`);
    }
  }
  const derived = adultLiteracy(block);
  if (Math.abs(derived - record.literacy) > LITERACY_AGGREGATE_TOLERANCE) {
    throw new RangeError(
      `popBlock.literacy ${String(record.literacy)} does not match the 15+ aggregate ${String(derived)}`,
    );
  }
  assertWealth(record.wealthLevel, "popBlock.wealthLevel");
  assertRate(record.militancy, "popBlock.militancy");
  assertRate(record.qualification, "popBlock.qualification");
  requireInteger(record.unmetSubsistenceDays, "popBlock.unmetSubsistenceDays", 0, Number.MAX_SAFE_INTEGER);
  requireInteger(record.unmetBasicDays, "popBlock.unmetBasicDays", 0, Number.MAX_SAFE_INTEGER);
  requireInteger(record.comfortFulfilledDays, "popBlock.comfortFulfilledDays", 0, Number.MAX_SAFE_INTEGER);
  assertRemainder(record.fractionalBirthRemainder, "popBlock.fractionalBirthRemainder");
  assertRemainder(record.fractionalMaleBirthRemainder, "popBlock.fractionalMaleBirthRemainder");
  assertRemainder(record.fractionalDeathRemainder, "popBlock.fractionalDeathRemainder");
  assertValidBlockDemography(block, `popBlock ${String(block.id)}`);
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
 * Validate population/finance state and all cross-references. Empty provinces,
 * pop blocks, and accounts are valid for M1-style empty worlds.
 */
export function assertValidPopulationState(world: World): void {
  const provinces = requireArray(world.provinceEconomies, "world.provinceEconomies");
  const blocks = requireArray(world.popBlocks, "world.popBlocks");
  // M2 construction still creates exactly one province, but M5 economic worlds may
  // author several. ProvinceEconomy/market relationships are validated by the economy
  // state pass, which knows the market collection.
  for (let index = 0; index < provinces.length; index += 1) {
    assertValidProvinceEconomy(provinces[index] as ProvinceEconomy);
  }
  assertUnique(provinces as ProvinceEconomy[], (province) => province.id, "world.provinceEconomies");
  assertUnique(provinces as ProvinceEconomy[], (province) => province.key, "world.provinceEconomies");
  const provinceIds = new Set<number>((provinces as ProvinceEconomy[]).map((province) => province.id));

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
    if (!provinceIds.has(block.provinceId)) {
      throw new RangeError(`popBlock ${String(block.id)} references unknown province ${String(block.provinceId)}`);
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

  // D-137: block ids per province once (was a filter of every block per province).
  const blockIdsByProvince = new Map<number, number[]>();
  for (const block of blocks as PopBlock[]) {
    const list = blockIdsByProvince.get(block.provinceId);
    if (list === undefined) blockIdsByProvince.set(block.provinceId, [block.id]);
    else list.push(block.id);
  }
  for (const province of provinces as ProvinceEconomy[]) {
    const expected = [...(blockIdsByProvince.get(province.id) ?? [])].sort((left, right) => left - right);
    const actual = [...province.popBlockIds].sort((left, right) => left - right);
    if (expected.length !== actual.length || expected.some((value, index) => value !== actual[index])) {
      throw new RangeError(`province ${String(province.id)} popBlockIds do not match its pop blocks`);
    }
    for (const id of province.popBlockIds) {
      if (!blockIds.has(id)) {
        throw new RangeError(`province ${String(province.id)} references unknown popBlock ${String(id)}`);
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

/**
 * Build the provisional initial age-specific literacy array from one adult rate.
 *
 * The authored scenarios supply a single adult literacy rate per pop block and no
 * source-backed age-specific series. M9 therefore initialises every age at or
 * above `ADULT_LITERACY_MIN_AGE` to that rate and every younger age to zero, so the
 * derived aggregate equals the authored rate exactly at world creation. This is a
 * documented provisional initialisation, not a historical observation (D-077).
 */
export function initialLiteracyByAge(rate: Rate): number[] {
  assertRate(rate, "literacy rate");
  const values = new Array<number>(SINGLE_AGE_COUNT).fill(0);
  for (let age = ADULT_LITERACY_MIN_AGE; age < SINGLE_AGE_COUNT; age += 1) {
    values[age] = rate;
  }
  return values;
}

/** Population-weighted adult (15+) literacy derived from the age-specific array. */
export function adultLiteracy(block: PopBlock): number {
  let people = 0;
  let weighted = 0;
  for (let age = ADULT_LITERACY_MIN_AGE; age < SINGLE_AGE_COUNT; age += 1) {
    const count = (block.maleByAge[age] ?? 0) + (block.femaleByAge[age] ?? 0);
    people += count;
    weighted += count * (block.literacyByAge[age] ?? 0);
  }
  // A block with no adult population has no meaningful adult literacy aggregate.
  // Keep the authored scalar rather than fabricating a zero rate; such a block has
  // no working-age people, so this cannot affect employment or qualification.
  if (people <= 0) return block.literacy;
  const factor = 10 ** RATE_DECIMAL_PLACES;
  return Math.round((weighted / people) * factor) / factor;
}

/** Recompute `block.literacy` from the authoritative age-specific array. */
export function syncBlockLiteracy(block: PopBlock): void {
  block.literacy = adultLiteracy(block);
}

/**
 * Merge migrants' age-specific literacy into the destination block.
 *
 * `maleMoved`/`femaleMoved` are the per-age counts moved by the migration phase.
 * The destination's pre-flow cell counts must be supplied so the incoming cohort is
 * weighted correctly. Source literacy values are read from `source` and are not
 * modified: a rate does not change when people leave.
 */
export function mergeBlockLiteracyByAge(
  destination: PopBlock,
  source: PopBlock,
  destinationMaleBefore: ArrayLike<number>,
  destinationFemaleBefore: ArrayLike<number>,
  maleMoved: ArrayLike<number>,
  femaleMoved: ArrayLike<number>,
): void {
  for (let age = 0; age < SINGLE_AGE_COUNT; age += 1) {
    const incoming = (maleMoved[age] ?? 0) + (femaleMoved[age] ?? 0);
    if (incoming <= 0) continue;
    const existing =
      (destinationMaleBefore[age] ?? 0) + (destinationFemaleBefore[age] ?? 0);
    const total = incoming + existing;
    const existingLiteracy = destination.literacyByAge[age] ?? 0;
    const incomingLiteracy = source.literacyByAge[age] ?? 0;
    destination.literacyByAge[age] =
      total > 0
        ? (existingLiteracy * existing + incomingLiteracy * incoming) / total
        : existingLiteracy;
  }
  syncBlockLiteracy(destination);
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

/** Sum population across all blocks in one province. */
export function provincePopulation(world: World, provinceId: Id): number {
  let total = 0;
  for (const block of world.popBlocks) {
    if (block.provinceId === provinceId) total += populationTotal(block);
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

  if (options.allowMultipleProvinces !== true && scenario.provinceEconomies.length !== 1) {
    throw new RangeError("M2 population scenarios must define exactly one province");
  }
  if (scenario.provinceEconomies.length === 0) {
    throw new RangeError("scenario must define at least one province");
  }
  if (scenario.professions.length === 0) {
    throw new RangeError("M2 scenario must define at least one profession identity");
  }
  assertUnique(scenario.professions, (profession) => profession.id, "scenario.professions");
  assertUnique(scenario.professions, (profession) => profession.key, "scenario.professions");
  assertUnique(scenario.provinceEconomies, (province) => province.id, "scenario.provinceEconomies");
  assertUnique(scenario.provinceEconomies, (province) => province.key, "scenario.provinceEconomies");
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
  const provinceById = new Map<number, (typeof scenario.provinceEconomies)[number]>();
  for (const province of scenario.provinceEconomies) provinceById.set(province.id, province);

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
    if (!provinceById.has(initial.provinceId)) {
      throw new RangeError(
        `popBlock ${String(initial.id)} references unknown province ${String(initial.provinceId)}`,
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
    assertNonNegative(initial.initialSavingsRUSD, `popBlock ${String(initial.id)} initialSavingsRUSD`);
    assertRate(initial.militancy, `popBlock ${String(initial.id)} militancy`);

    const block: PopBlock = {
      id: initial.id,
      provinceId: initial.provinceId,
      professionId: initial.professionId,
      maleByAge,
      femaleByAge,
      literacy: initial.literacy,
      literacyByAge: initialLiteracyByAge(initial.literacy),
      // E5: no source-backed qualification series exists; funded training builds it.
      qualification: 0,
      wealthLevel: initial.wealthLevel,
      financialAccountId: initial.financialAccountId,
      militancy: initial.militancy,
      unmetSubsistenceDays: 0,
      unmetBasicDays: 0,
      comfortFulfilledDays: 0,
      fractionalBirthRemainder: 0,
      fractionalMaleBirthRemainder: 0,
      fractionalDeathRemainder: 0,
      // P4 (D-142): set by `calibrateBlockDemography` below.
      urbanShare: 0,
      fertilityResidual: 1,
      childMortalityResidual: 1,
      adultMortalityResidual: 1,
      childMortalityLagged: 1,
      foodSufficiency: 1,
    };
    const sourced = sourcedLevelsOf(initial.demography);
    assertRate(sourced.urbanShare, `popBlock ${String(initial.id)} demography.urbanShare`);
    block.urbanShare = sourced.urbanShare;
    // Population worlds see neutral country factors; economy worlds recalibrate once
    // their countries exist (`calibrateDemographyForCountries`).
    calibrateBlockDemography(
      block,
      sourced.levels,
      NEUTRAL_DEMOGRAPHY_FACTORS,
      `popBlock ${String(initial.id)}`,
    );
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
        balanceRUSD: 0,
      });
    }
    openingEntries.push({
      accountId: initial.financialAccountId,
      balanceRUSD: initial.initialSavingsRUSD,
    });
    openingEntries.push({
      accountId: equityAccountId,
      balanceRUSD: initial.initialSavingsRUSD,
    });
  }

  const blockIdsByProvince = new Map<number, number[]>();
  for (const block of blocks) {
    const list = blockIdsByProvince.get(block.provinceId);
    if (list === undefined) blockIdsByProvince.set(block.provinceId, [block.id]);
    else list.push(block.id);
  }
  const worldProvinces: ProvinceEconomy[] = [...scenario.provinceEconomies]
    .sort((left, right) => left.id - right.id)
    .map((province) => ({
      id: province.id,
      key: province.key,
      name: province.name,
      popBlockIds: (blockIdsByProvince.get(province.id) ?? []).sort((left, right) => left - right),
      marketId: null,
      buildingInstanceIds: [],
      unrest: 0,
      infrastructure: province.infrastructure ?? 0.5,
      arableLandHa: province.arableLandHa ?? 0,
      pastureHa: province.pastureHa ?? 0,
      urbanShare: province.urbanShare ?? 0,
      wageRUSDPerYearByProfession: [...(province.wageRUSDPerYearByProfession ?? [])],
      absLatitudeDeg: province.absLatitudeDeg ?? null,
      hydroPotentialMWhPerYear: province.hydroPotentialMWhPerYear ?? null,
    }));

  const world: World = {
    schemaVersion: WORLD_SCHEMA_VERSION,
    simVersion: SIM_VERSION,
    dataVersion: scenario.dataVersion,
    scenarioId: scenario.scenarioId,
    dayIndex: startDayIndex,
    startDayIndex,
    seed,
    provinceEconomies: worldProvinces,
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
    moneyCoefficients: { ...DEFAULT_MONEY_COEFFICIENTS },
    demography: emptyDemographyReport(),
    resources: emptyResourceState(),
    politics: {
      enabled: false,
      eventQueue: [],
      eventLog: [],
      nextEventId: 1,
      nextLogId: 1,
    },
    technology: { enabled: false },
    trade: {
      enabled: false,
      routes: [],
      shipments: [],
      nextShipmentId: 1,
      lastDispatchDay: null,
      lastDay: null,
    },
    priceIndex: {
      basket: [],
      basePrices: [],
      observations: [],
      lastObservationDay: null,
    },
    monetary: {
      enabled: false,
      currencies: [],
      lastUpdateDay: null,
    },
    military: {
      enabled: false,
      armies: [],
      wars: [],
      relations: [],
      peaceOffers: [],
      casualties: [],
      nextArmyId: 1,
      nextWarId: 1,
      nextOfferId: 1,
      lastPhaseDay: null,
    },
    provinces: emptyProvinceState(),
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
