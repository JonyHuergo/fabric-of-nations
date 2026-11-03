/**
 * M10 diplomacy, warfare, and territorial control (D-081).
 *
 * Sovereignty is `ProvinceOwnership.ownerPolityId`; temporary military control is
 * `ProvinceOwnership.controllerPolityId` (D-118). Occupation never changes
 * sovereignty, market membership, buildings, people, accounts, treasuries, or
 * monetary authorities. Only a validated peace-treaty cession changes sovereignty;
 * it moves the ceded provinces into the recipient's customs territory (D-119).
 *
 * This module owns the military state, the five player/AI actions, and the daily
 * military phase. All randomness is keyed by the world seed and day; iteration is
 * by stable ids. Population and payment allocations are proportional to eligible
 * or household-population weights, never pop-block array order or numeric-id
 * order (GDD §4.3).
 */

import { assertValidWorld, type World } from "../world.js";
import {
  activeWarBetween,
  countryById,
  emptyMilitaryState,
  isWarPair,
  provinceById,
  provinceControllerCountryId,
  provinceSovereignCountryId,
} from "./militaryState.js";
import { countryProvinceIds } from "./country.js";
import { transferProvincesToCountry } from "./provinceTransfer.js";
import { setProvinceControl } from "../provinces/state.js";
import type { Day, Id } from "../types.js";
import type { PopBlock } from "../population/types.js";
import {
  CASUS_BELLI,
  PEACE_TERMS,
  type Army,
  type CasusBelli,
  type DiplomaticRelation,
  type MilitaryArmyInput,
  type MilitaryCasualtyRecord,
  type MilitaryState,
  type MilitarySystemInput,
  type PeaceOffer,
  type PeaceTermKind,
  type WarState,
} from "./types.js";
import {
  M10_AI_PEACE_MIN_WAR_DAYS,
  M10_ARMY_FORMATION_DAYS,
  M10_BASE_CASUALTY_FRACTION,
  M10_CAPTURED_SHARE,
  M10_CASUALTY_STRENGTH_SCALE,
  M10_DEATH_SHARE,
  M10_DEPLOYMENT_DAYS,
  M10_MAX_CASUALTY_FRACTION,
  M10_MIN_ORGANIZATION,
  M10_OCCUPATION_UNREST_PER_DAY,
  M10_PEACE_RELATION_SCORE,
  M10_SOLDIERS_PER_EQUIPMENT_UNIT,
  M10_SUPPLY_LOSS_PER_DAY,
  M10_SUPPLY_RECOVERY_PER_DAY,
  M10_TRUCE_DAYS,
  M10_UNPAID_ORGANIZATION_LOSS,
  M10_WAR_RELATION_SCORE,
  M10_WOUND_RECOVERY_DAYS,
  M10_WOUNDED_SHARE,
  MAX_ARMIES,
  MAX_MILITARY_RELATIONS,
  MAX_PEACE_OFFERS,
  MAX_WARS,
} from "./constants.js";
import { postJournalBatch, type JournalEntryInput } from "./accounting.js";
import { cloneFinanceState } from "./accounts.js";
import { drawUint32 } from "../rng.js";
import { assertValidDayIndex, isTerminalDayIndex } from "../calendar.js";
import {
  MONEY_TOLERANCE_RUSD,
  WORKING_AGE_END,
  WORKING_AGE_START,
} from "../population/constants.js";

/** Minimum working age for recruitment. */
const RECRUIT_MIN_AGE = 18;
/** Maximum working age for recruitment. */
const RECRUIT_MAX_AGE = 45;

/**
 * Purpose identifiers for the keyed tie-break draws used by military
 * apportionment. They are stable, deterministic, and independent of storage
 * order; the block id is only an entity key, never an ordering rule.
 */
const M10_RECRUITMENT_REMAINDER_PURPOSE = "m10-recruitment-remainder";
const M10_MILITARY_PAY_REMAINDER_PURPOSE = "m10-military-pay-remainder";
const M10_RETURN_REMAINDER_PURPOSE = "m10-return-remainder";

/** One block's share of a recruitment action. */
interface RecruitmentRemoval {
  readonly popBlockId: Id;
  readonly males: number;
  readonly females: number;
}

/** A candidate block for a population-weighted military payment. */
interface PayRecipient {
  readonly popBlockId: Id;
  readonly weight: number;
  readonly totalPopulation: number;
  readonly tie: number;
}

/** One block's share of a military payment. */
interface MilitaryPayShare {
  readonly popBlockId: Id;
  readonly amountRUSD: number;
}

/** Outcome of one military action. */
export interface MilitaryActionResult {
  readonly kind: MilitaryActionInput["kind"];
  readonly countryId: Id;
  readonly dayIndex: Day;
  readonly warId: Id | null;
  readonly offerId: Id | null;
  readonly armyId: Id | null;
  readonly provinceId: Id | null;
  readonly personnel: number;
  readonly equipmentUnits: number;
  readonly spentRUSD: number;
}

export interface DeclareWarInput {
  readonly countryId: Id;
  readonly targetCountryId: Id;
  readonly casusBelli: CasusBelli;
}

export interface OfferPeaceInput {
  readonly countryId: Id;
  readonly warId: Id;
  readonly terms: PeaceTermKind;
}

export interface AcceptPeaceInput {
  readonly countryId: Id;
  readonly warId: Id;
  readonly offerId: Id;
}

export interface RecruitArmyInput {
  readonly countryId: Id;
  readonly provinceId: Id;
  readonly personnel: number;
  readonly equipmentUnits?: number;
}

export interface DeployArmyInput {
  readonly countryId: Id;
  readonly armyId: Id;
  readonly targetProvinceId: Id;
}

export type MilitaryActionInput = (
  | ({ readonly kind: "declare-war" } & DeclareWarInput)
  | ({ readonly kind: "offer-peace" } & OfferPeaceInput)
  | ({ readonly kind: "accept-peace" } & AcceptPeaceInput)
  | ({ readonly kind: "recruit-army" } & RecruitArmyInput)
  | ({ readonly kind: "deploy-army" } & DeployArmyInput)
) & {
  /** Optional action context; the authoritative day is passed to the phase/apply call. */
  readonly dayIndex?: Day;
  readonly source?: "player" | "ai";
};

export interface MilitaryValidation {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

export interface MilitaryBattleResult {
  readonly provinceId: Id;
  readonly attackerCountryId: Id;
  readonly defenderCountryId: Id;
  readonly attackerLosses: number;
  readonly defenderLosses: number;
  readonly attackerDeaths: number;
  readonly defenderDeaths: number;
}

export interface MilitaryPhaseResult {
  readonly dayIndex: Day;
  readonly battles: readonly MilitaryBattleResult[];
  readonly occupiedProvinceIds: readonly Id[];
  readonly liberatedProvinceIds: readonly Id[];
  readonly movedArmyIds: readonly Id[];
  readonly recoveredWounded: number;
  readonly paidRUSD: number;
  readonly shortfallRUSD: number;
  readonly endedWarIds: readonly Id[];
}

/** Empty phase result, also used when the phase is idempotently skipped. */
function emptyPhaseResult(dayIndex: Day): MilitaryPhaseResult {
  return {
    dayIndex,
    battles: [],
    occupiedProvinceIds: [],
    liberatedProvinceIds: [],
    movedArmyIds: [],
    recoveredWounded: 0,
    paidRUSD: 0,
    shortfallRUSD: 0,
    endedWarIds: [],
  };
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

export function relationBetween(
  world: World,
  firstCountryId: Id,
  secondCountryId: Id,
): DiplomaticRelation | undefined {
  const a = Math.min(firstCountryId, secondCountryId);
  const b = Math.max(firstCountryId, secondCountryId);
  return world.military.relations.find(
    (relation) => relation.countryA === a && relation.countryB === b,
  );
}

export function areAtWar(world: World, firstCountryId: Id, secondCountryId: Id): boolean {
  return activeWarBetween(world, firstCountryId, secondCountryId) !== null;
}

export function armiesOfCountry(world: World, countryId: Id): Army[] {
  return world.military.armies.filter((army) => army.countryId === countryId);
}

export function armiesInProvince(world: World, provinceId: Id): Army[] {
  return world.military.armies.filter((army) => army.provinceId === provinceId);
}

/** Active war opponents of a country, ascending. */
export function warOpponents(world: World, countryId: Id): Id[] {
  const opponents = new Set<Id>();
  for (const war of world.military.wars) {
    if (war.endedDay !== null) continue;
    if (war.attackerCountryId === countryId) opponents.add(war.defenderCountryId);
    if (war.defenderCountryId === countryId) opponents.add(war.attackerCountryId);
  }
  return [...opponents].sort((left, right) => left - right);
}

/**
 * Total people outside civilian pop blocks: serving personnel, wounded, cumulative
 * deaths, and captured. Casualty records duplicate the army totals and are not added.
 */
export function militaryPeopleOutsideCivilian(world: World): number {
  let total = 0;
  for (const army of world.military.armies) {
    total += army.personnel + army.wounded;
  }
  for (const record of world.military.casualties) {
    total += record.deaths + record.captured;
  }
  return total;
}

// ---------------------------------------------------------------------------
// Scenario creation
// ---------------------------------------------------------------------------

/**
 * Build the M10 state from scenario input. Initial armies are part of the opening
 * state: their people are removed from the province's pop blocks and their equipment
 * is opening stock (no opening money postings). Omitted input leaves the system
 * disabled.
 */
export function createMilitaryState(
  world: World,
  input: MilitarySystemInput | undefined,
  dayIndex: Day,
): MilitaryState {
  if (input === undefined) return emptyMilitaryState();
  const state = emptyMilitaryState();
  state.enabled = true;
  const relations = input.relations ?? [];
  if (relations.length > MAX_MILITARY_RELATIONS) {
    throw new RangeError("military.relations exceeds the bound");
  }
  for (const relation of relations) {
    const a = Math.min(relation.countryA, relation.countryB);
    const b = Math.max(relation.countryA, relation.countryB);
    if (a === b) throw new RangeError("military relation requires two distinct countries");
    if (countryById(world, a) === undefined || countryById(world, b) === undefined) {
      throw new RangeError("military relation references an unknown country");
    }
    if (state.relations.some((entry) => entry.countryA === a && entry.countryB === b)) {
      throw new RangeError("military relation is duplicated");
    }
    const score = relation.score ?? 0;
    if (!Number.isFinite(score) || score < -100 || score > 100) {
      throw new RangeError("military relation score must be in -100..100");
    }
    state.relations.push({ countryA: a, countryB: b, score, truceUntilDay: null });
  }
  state.relations.sort(
    (left, right) => left.countryA - right.countryA || left.countryB - right.countryB,
  );
  const armies = input.armies ?? [];
  if (armies.length > MAX_ARMIES) throw new RangeError("military.armies exceeds the bound");
  for (const inputArmy of armies) {
    const army = createInitialArmy(world, inputArmy, dayIndex, state.nextArmyId);
    state.nextArmyId += 1;
    state.armies.push(army);
    recordCasualty(state, army.countryId);
  }
  state.armies.sort((left, right) => left.id - right.id);
  return state;
}

function createInitialArmy(
  world: World,
  input: MilitaryArmyInput,
  dayIndex: Day,
  id: Id,
): Army {
  const country = countryById(world, input.countryId);
  if (country === undefined) throw new RangeError("military army references an unknown country");
  const province = provinceById(world, input.provinceId);
  if (province === undefined) throw new RangeError("military army references an unknown province");
  if (provinceSovereignCountryId(world, input.provinceId) !== country.id) {
    throw new RangeError("military army must start in a province its country owns");
  }
  if (!Number.isInteger(input.personnel) || input.personnel <= 0) {
    throw new RangeError("military army personnel must be a positive integer");
  }
  const available = recruitablePeople(world, input.provinceId);
  if (input.personnel > available) {
    throw new RangeError("military army personnel exceeds the province's recruitable people");
  }
  removePeople(world, input.provinceId, input.personnel, dayIndex);
  const equipmentUnits =
    input.equipmentUnits ??
    Math.ceil(input.personnel / M10_SOLDIERS_PER_EQUIPMENT_UNIT);
  if (!Number.isInteger(equipmentUnits) || equipmentUnits < 0) {
    throw new RangeError("military army equipmentUnits must be a non-negative integer");
  }
  const organization = input.organization ?? 0.5;
  const supply = input.supply ?? 0.6;
  if (!(organization >= 0 && organization <= 1) || !(supply >= 0 && supply <= 1)) {
    throw new RangeError("military army organization/supply must be in 0..1");
  }
  return {
    id,
    countryId: country.id,
    provinceId: province.id,
    homeProvinceId: province.id,
    personnel: input.personnel,
    equipmentUnits,
    organization,
    supply,
    wounded: 0,
    woundedReturnDay: null,
    deaths: 0,
    captured: 0,
    readyDay: dayIndex,
    destinationProvinceId: null,
    arrivalDay: null,
    lastBattleDay: null,
  };
}

function recordCasualty(state: MilitaryState, countryId: Id): MilitaryCasualtyRecord {
  let record = state.casualties.find((entry) => entry.countryId === countryId);
  if (record === undefined) {
    record = { countryId, deaths: 0, woundedReturned: 0, captured: 0 };
    state.casualties.push(record);
    state.casualties.sort((left, right) => left.countryId - right.countryId);
  }
  return record;
}

// ---------------------------------------------------------------------------
// Population helpers
// ---------------------------------------------------------------------------

/** People aged 18..45 in one sex array. */
function eligibleAgeCount(ages: Uint32Array): number {
  let total = 0;
  for (let age = RECRUIT_MIN_AGE; age <= RECRUIT_MAX_AGE; age += 1) {
    total += ages[age] ?? 0;
  }
  return total;
}

/** Total civilian population of a block, all ages and both sexes. */
function blockPopulation(block: PopBlock): number {
  let total = 0;
  for (const value of block.maleByAge) total += value;
  for (const value of block.femaleByAge) total += value;
  return total;
}

/** People aged 18..45 in the province, the recruitment pool. */
export function recruitablePeople(world: World, provinceId: Id): number {
  let total = 0;
  for (const block of world.popBlocks) {
    if (block.provinceId !== provinceId) continue;
    total += eligibleAgeCount(block.maleByAge) + eligibleAgeCount(block.femaleByAge);
  }
  return total;
}

/**
 * Largest-remainder apportionment of `total` integer units across integer
 * `weights`.
 *
 * Ranking order is explicit and deterministic:
 * 1. larger fractional remainder;
 * 2. larger weight (the larger cohort absorbs a rounding unit first);
 * 3. larger total block population;
 * 4. the caller's keyed tie draw (stable entity/day/purpose, never array order);
 * 5. the input index only as a final collision fallback.
 *
 * With `capacityCapped`, each recipient receives at most its weight (used for
 * removing people). Without it, weights are shares only and the total may exceed
 * their sum (used for returning people to a province). Exact BigInt remainders
 * avoid floating-point drift in the largest-remainder comparison.
 */
function apportionLargestRemainder(
  total: number,
  weights: readonly number[],
  tieKeys: readonly number[],
  totalPopulations: readonly number[],
  capacityCapped: boolean,
): number[] {
  if (!Number.isSafeInteger(total) || total < 0) {
    throw new RangeError("apportionment total must be a non-negative safe integer");
  }
  const allocations = new Array<number>(weights.length).fill(0);
  if (total === 0 || weights.length === 0) return allocations;

  let totalWeight = 0;
  for (let index = 0; index < weights.length; index += 1) {
    const weight = weights[index] ?? 0;
    if (!Number.isSafeInteger(weight) || weight < 0) {
      throw new RangeError("apportionment weights must be non-negative safe integers");
    }
    totalWeight += weight;
  }
  if (totalWeight === 0) {
    if (capacityCapped) {
      throw new RangeError("apportionment requires at least one eligible person");
    }
    return allocations;
  }
  if (capacityCapped && total > totalWeight) {
    throw new RangeError("apportionment total cannot exceed the sum of weights");
  }

  const totalBig = BigInt(total);
  const totalWeightBig = BigInt(totalWeight);
  let allocated = 0;
  const candidates: Array<{
    index: number;
    remainder: bigint;
    weight: number;
    totalPopulation: number;
    tie: number;
  }> = [];
  for (let index = 0; index < weights.length; index += 1) {
    const weight = weights[index] ?? 0;
    if (weight === 0) continue;
    const numerator = totalBig * BigInt(weight);
    const whole = Number(numerator / totalWeightBig);
    allocations[index] = whole;
    allocated += whole;
    if (capacityCapped && whole >= weight) continue;
    candidates.push({
      index,
      remainder: numerator % totalWeightBig,
      weight,
      totalPopulation: totalPopulations[index] ?? 0,
      tie: tieKeys[index] ?? 0,
    });
  }

  const leftover = total - allocated;
  if (leftover < 0 || leftover > candidates.length) {
    throw new RangeError("largest-remainder apportionment ran out of capacity");
  }
  candidates.sort((left, right) => {
    if (left.remainder !== right.remainder) return left.remainder > right.remainder ? -1 : 1;
    if (left.weight !== right.weight) return right.weight - left.weight;
    if (left.totalPopulation !== right.totalPopulation) {
      return right.totalPopulation - left.totalPopulation;
    }
    if (left.tie !== right.tie) return left.tie - right.tie;
    return left.index - right.index;
  });
  for (let index = 0; index < leftover; index += 1) {
    const candidate = candidates[index];
    if (candidate === undefined) {
      throw new RangeError("largest-remainder apportionment ran out of capacity");
    }
    allocations[candidate.index] = (allocations[candidate.index] ?? 0) + 1;
  }
  return allocations;
}

/** The recipient with the largest weight, using the documented tie order. */
function bestRecipient<T extends PayRecipient>(recipients: readonly T[]): T {
  const first = recipients[0];
  if (first === undefined) throw new RangeError("military pay allocation has no recipient");
  let best = first;
  for (const candidate of recipients) {
    if (
      candidate.weight > best.weight ||
      (candidate.weight === best.weight &&
        (candidate.totalPopulation > best.totalPopulation ||
          (candidate.totalPopulation === best.totalPopulation &&
            (candidate.tie < best.tie ||
              (candidate.tie === best.tie && candidate.popBlockId < best.popBlockId)))))
    ) {
      best = candidate;
    }
  }
  return best;
}

/**
 * Remove `count` people from a province's blocks, preserving the documented
 * "males 18..45 first, then females 18..45" eligibility rule. Within each sex,
 * recruitment is apportioned across blocks in proportion to that block's
 * available eligible people, so no block can supply more than it has.
 */
function removePeople(
  world: World,
  provinceId: Id,
  count: number,
  dayIndex: Day,
): RecruitmentRemoval[] {
  const blocks = world.popBlocks.filter((block) => block.provinceId === provinceId);
  if (blocks.length === 0) {
    throw new RangeError(`province ${String(provinceId)} has no pop block`);
  }
  const totalPopulations = blocks.map(blockPopulation);
  const maleWeights = blocks.map((block) => eligibleAgeCount(block.maleByAge));
  const femaleWeights = blocks.map((block) => eligibleAgeCount(block.femaleByAge));
  const malePool = maleWeights.reduce((total, value) => total + value, 0);
  const femalePool = femaleWeights.reduce((total, value) => total + value, 0);
  if (count > malePool + femalePool) {
    throw new RangeError(`province ${String(provinceId)} lacks ${String(count)} recruitable people`);
  }
  const maleTake = Math.min(count, malePool);
  const femaleTake = count - maleTake;
  const maleTies = blocks.map((block) => {
    return drawUint32({
      seed: world.seed,
      day: dayIndex,
      entityId: block.id,
      purpose: M10_RECRUITMENT_REMAINDER_PURPOSE,
      drawIndex: 0,
    });
  });
  const femaleTies = blocks.map((block) => {
    return drawUint32({
      seed: world.seed,
      day: dayIndex,
      entityId: block.id,
      purpose: M10_RECRUITMENT_REMAINDER_PURPOSE,
      drawIndex: 1,
    });
  });
  const maleAllocations = apportionLargestRemainder(
    maleTake,
    maleWeights,
    maleTies,
    totalPopulations,
    true,
  );
  const femaleAllocations = apportionLargestRemainder(
    femaleTake,
    femaleWeights,
    femaleTies,
    totalPopulations,
    true,
  );

  const removals: RecruitmentRemoval[] = [];
  let totalRemoved = 0;
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (block === undefined) throw new RangeError("missing recruitment pop block");
    const males = maleAllocations[index] ?? 0;
    const females = femaleAllocations[index] ?? 0;
    const removedMales = removeFromArray(block.maleByAge, males);
    const removedFemales = removeFromArray(block.femaleByAge, females);
    if (removedMales !== males || removedFemales !== females) {
      throw new RangeError(
        `pop block ${String(block.id)} could not supply its recruitment allocation`,
      );
    }
    totalRemoved += males + females;
    removals.push({ popBlockId: block.id, males, females });
  }
  if (totalRemoved !== count) {
    throw new RangeError("recruitment did not remove exactly the requested personnel");
  }
  return removals;
}

function removeFromArray(ages: Uint32Array, count: number): number {
  let remaining = count;
  for (let age = RECRUIT_MIN_AGE; age <= RECRUIT_MAX_AGE && remaining > 0; age += 1) {
    const available = ages[age] ?? 0;
    const take = Math.min(available, remaining);
    ages[age] = available - take;
    remaining -= take;
  }
  return count - remaining;
}

/** Civilian working-age population used by employment validation. */
function workingAgeCount(block: PopBlock): number {
  let total = 0;
  for (let age = WORKING_AGE_START; age <= WORKING_AGE_END; age += 1) {
    total += block.maleByAge[age] ?? 0;
    total += block.femaleByAge[age] ?? 0;
  }
  return total;
}

/**
 * Keep civilian employment consistent with a recruitment removal.
 *
 * Recruits are people aged 18..45, so they necessarily reduce the working-age
 * population. Existing assignments are retained where the remaining population
 * still supports them; any excess is released deterministically in ascending
 * assignment-id order, and the employment system is marked dirty so the next
 * refresh can reassign the remaining civilians. This avoids an immediate
 * whole-world validation failure while preserving explicit employment state.
 */
function reconcileRecruitmentEmployment(
  world: World,
  removals: readonly RecruitmentRemoval[],
): void {
  let removedAny = false;
  for (const removal of removals) {
    const removed = removal.males + removal.females;
    if (removed <= 0) continue;
    removedAny = true;
    const block = world.popBlocks.find((candidate) => candidate.id === removal.popBlockId);
    if (block === undefined) continue;
    const availableWorkingAge = workingAgeCount(block);
    let assigned = 0;
    for (const assignment of world.employment) {
      if (assignment.popBlockId === block.id) assigned += assignment.workers;
    }
    let excess = assigned - availableWorkingAge;
    if (excess <= 0) continue;
    const assignments = world.employment
      .filter((assignment) => assignment.popBlockId === block.id)
      .sort((left, right) => left.id - right.id);
    for (const assignment of assignments) {
      if (excess <= 0) break;
      const release = Math.min(assignment.workers, excess);
      assignment.workers -= release;
      excess -= release;
    }
    world.employment = world.employment.filter((assignment) => assignment.workers > 0);
  }
  if (removedAny) world.employmentDirty = true;
}

// ---------------------------------------------------------------------------
// Accounting helpers
// ---------------------------------------------------------------------------

function accountId(
  world: World,
  ownerKind: "country" | "popBlock" | "system",
  ownerId: Id | null,
  subtype: string,
): Id {
  const account = world.finance.accounts.find(
    (candidate) =>
      candidate.ownerKind === ownerKind &&
      candidate.ownerId === ownerId &&
      candidate.subtype === subtype,
  );
  if (account === undefined) {
    throw new RangeError(`missing ${ownerKind} ${String(ownerId)} ${subtype} account`);
  }
  return account.id;
}

function treasuryCash(world: World, countryId: Id): number {
  const country = countryById(world, countryId);
  if (country === undefined) return 0;
  const account = world.finance.accounts.find(
    (candidate) => candidate.id === country.treasuryAccountId,
  );
  return account?.balanceRUSD ?? 0;
}

/**
 * Post a military payment from the treasury to one or more pop-block households.
 *
 * Each recipient receives its own balanced four-line `military-pay` entry, so the
 * existing posting contract (one country, one pop block, four legs) is preserved
 * while the payment is distributed. Entries are emitted in ascending recipient
 * id solely as a canonical serialization order; the amounts are decided by the
 * documented allocation rule, not by that order.
 */
function postMilitaryPay(
  world: World,
  dayIndex: Day,
  countryId: Id,
  shares: readonly MilitaryPayShare[],
): void {
  const ordered = [...shares].sort((left, right) => left.popBlockId - right.popBlockId);
  const entries: JournalEntryInput[] = [];
  for (const share of ordered) {
    if (!(share.amountRUSD > 0)) continue;
    entries.push({
      transactionKind: "military-pay",
      sourceEntityId: countryId,
      targetEntityId: share.popBlockId,
      lines: [
        {
          accountId: accountId(world, "country", countryId, "military-expense"),
          side: "debit",
          amountRUSD: share.amountRUSD,
        },
        {
          accountId: accountId(world, "country", countryId, "treasury-cash"),
          side: "credit",
          amountRUSD: share.amountRUSD,
        },
        {
          accountId: accountId(world, "popBlock", share.popBlockId, "household-cash"),
          side: "debit",
          amountRUSD: share.amountRUSD,
        },
        {
          accountId: accountId(world, "popBlock", share.popBlockId, "military-income"),
          side: "credit",
          amountRUSD: share.amountRUSD,
        },
      ],
    });
  }
  if (entries.length === 0) return;
  postJournalBatch(world.finance, dayIndex, entries);
}

function postMilitaryProcurement(
  world: World,
  dayIndex: Day,
  countryId: Id,
  amount: number,
): void {
  if (!(amount > 0)) return;
  postJournalBatch(world.finance, dayIndex, [
    {
      transactionKind: "military-procurement",
      sourceEntityId: countryId,
      targetEntityId: null,
      lines: [
        {
          accountId: accountId(world, "country", countryId, "military-expense"),
          side: "debit",
          amountRUSD: amount,
        },
        {
          accountId: accountId(world, "country", countryId, "treasury-cash"),
          side: "credit",
          amountRUSD: amount,
        },
        {
          accountId: accountId(world, "system", null, "system-reserve-cash"),
          side: "debit",
          amountRUSD: amount,
        },
        {
          accountId: accountId(world, "system", null, "system-income"),
          side: "credit",
          amountRUSD: amount,
        },
      ],
    },
  ]);
}

/**
 * Population-weighted recipients for daily pay or a garrison payment.
 *
 * Weights are the province's recruitment-eligible people when any exist, otherwise
 * its total civilian population. No formation-source record is persisted, so a
 * coherent household-population rule is used instead of tracking every soldier's
 * original block.
 */
function payRecipients(
  world: World,
  provinceId: Id,
  dayIndex: Day,
): PayRecipient[] {
  const blocks = world.popBlocks.filter((block) => block.provinceId === provinceId);
  if (blocks.length === 0) return [];
  const totalPopulations = blocks.map(blockPopulation);
  const eligible = blocks.map(
    (block) => eligibleAgeCount(block.maleByAge) + eligibleAgeCount(block.femaleByAge),
  );
  const eligibleTotal = eligible.reduce((total, value) => total + value, 0);
  const weights = eligibleTotal > 0 ? eligible : totalPopulations;
  const weightTotal = weights.reduce((total, value) => total + value, 0);
  if (weightTotal === 0) return [];
  return blocks.map((block, index) => ({
    popBlockId: block.id,
    weight: weights[index] ?? 0,
    totalPopulation: totalPopulations[index] ?? 0,
    tie: drawUint32({
      seed: world.seed,
      day: dayIndex,
      entityId: block.id,
      purpose: M10_MILITARY_PAY_REMAINDER_PURPOSE,
      drawIndex: 0,
    }),
  }));
}

/**
 * Split a money total across weighted pop blocks. Exact shares are proportional;
 * the floating remainder is assigned to the documented best recipient so the
 * posted amounts always sum to the payable total.
 */
function allocateMoneyAcrossBlocks(
  total: number,
  recipients: readonly PayRecipient[],
): MilitaryPayShare[] {
  if (!(total > 0)) return [];
  const usable = recipients.filter((recipient) => recipient.weight > 0);
  if (usable.length === 0) return [];
  const totalWeight = usable.reduce((sum, recipient) => sum + recipient.weight, 0);
  if (!(totalWeight > 0)) return [];
  const shares = usable.map((recipient) => ({
    ...recipient,
    amountRUSD: (total * recipient.weight) / totalWeight,
  }));
  const positive = shares.filter((share) => share.amountRUSD > 0);
  if (positive.length === 0) {
    const best = bestRecipient(usable);
    return [{ popBlockId: best.popBlockId, amountRUSD: total }];
  }
  const allocated = positive.reduce((sum, share) => sum + share.amountRUSD, 0);
  const residual = total - allocated;
  const tolerance = MONEY_TOLERANCE_RUSD * Math.max(1, Math.abs(total));
  if (Math.abs(residual) > tolerance) {
    throw new RangeError("military pay allocation did not sum to the payable total");
  }
  if (residual !== 0) {
    const target = bestRecipient(positive);
    target.amountRUSD += residual;
    if (!(target.amountRUSD > 0)) {
      throw new RangeError("military pay allocation produced a non-positive share");
    }
  }
  return positive.map((share) => ({
    popBlockId: share.popBlockId,
    amountRUSD: share.amountRUSD,
  }));
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function fail(errors: string[], message: string): void {
  errors.push(message);
}

function validateCountry(world: World, countryId: Id, errors: string[]): void {
  if (countryById(world, countryId) === undefined) {
    fail(errors, `unknown country ${String(countryId)}`);
  }
}

/** Validate a military action's day against the world and open accounting period. */
function militaryActionDayError(world: World, dayIndex: Day): string | null {
  if (!Number.isInteger(dayIndex) || dayIndex < 0) {
    return "the military action day must be a non-negative integer";
  }
  if (dayIndex !== world.dayIndex) {
    return `military action day ${String(dayIndex)} does not match world day ${String(world.dayIndex)}`;
  }
  if (isTerminalDayIndex(dayIndex)) {
    return "the terminal 2000-01-01 boundary cannot apply a military action";
  }
  if (
    world.finance.closedThroughDay !== null &&
    dayIndex <= world.finance.closedThroughDay
  ) {
    return `the accounting period through day ${String(world.finance.closedThroughDay)} is closed`;
  }
  return null;
}

/**
 * Validate a `cede-occupied` term against the current world.
 *
 * The ceding country is the opponent of the offerer. Cession transfers every
 * province of that opponent that the offerer currently controls, so the opponent
 * must retain at least one sovereign province after all transfers.
 */
function cessionError(
  world: World,
  offererCountryId: Id,
  cedingCountryId: Id,
): string | null {
  const cedingCountry = countryById(world, cedingCountryId);
  if (cedingCountry === undefined) {
    return `unknown country ${String(cedingCountryId)}`;
  }
  if (cedingCountry.id === offererCountryId) {
    return "cession requires two distinct belligerents";
  }
  const transferred = controlledProvincesOf(world, offererCountryId, cedingCountryId);
  if (transferred.length === 0) {
    return "cession requires control of at least one enemy province";
  }
  if (countryProvinceIds(world, cedingCountry.id).length - transferred.length < 1) {
    return `cession would remove the last province of country ${String(cedingCountry.id)}`;
  }
  return null;
}

export function validateDeclareWar(world: World, input: DeclareWarInput): MilitaryValidation {
  const errors: string[] = [];
  if (!world.military.enabled) fail(errors, "the military system is not enabled");
  validateCountry(world, input.countryId, errors);
  validateCountry(world, input.targetCountryId, errors);
  if (input.countryId === input.targetCountryId) {
    fail(errors, "a country cannot declare war on itself");
  }
  if (!(CASUS_BELLI as readonly string[]).includes(input.casusBelli)) {
    fail(errors, "unknown casus belli");
  }
  if (activeWarBetween(world, input.countryId, input.targetCountryId) !== null) {
    fail(errors, "the countries are already at war");
  }
  const relation = relationBetween(world, input.countryId, input.targetCountryId);
  // Inclusive last prohibited day: a peace on P sets this to P+365, so full
  // truce days are P+1..P+365 and the first legal declaration is P+366. The
  // peace day itself is also prohibited by the inclusive comparison.
  if (
    relation !== undefined &&
    relation.truceUntilDay !== null &&
    world.dayIndex <= relation.truceUntilDay
  ) {
    fail(errors, "a truce forbids a new war");
  }
  return { valid: errors.length === 0, errors };
}

export function validateOfferPeace(world: World, input: OfferPeaceInput): MilitaryValidation {
  const errors: string[] = [];
  if (!world.military.enabled) fail(errors, "the military system is not enabled");
  const war = world.military.wars.find((entry) => entry.id === input.warId);
  if (war === undefined || war.endedDay !== null) {
    fail(errors, "the war is not active");
  }
  if (war !== undefined) {
    if (input.countryId !== war.attackerCountryId && input.countryId !== war.defenderCountryId) {
      fail(errors, "only a belligerent may offer peace");
    }
    const other =
      input.countryId === war.attackerCountryId
        ? war.defenderCountryId
        : war.attackerCountryId;
    if ((PEACE_TERMS as readonly string[]).includes(input.terms)) {
      if (input.terms === "cede-occupied") {
        const cession = cessionError(world, input.countryId, other);
        if (cession !== null) fail(errors, cession);
      }
      if (
        world.military.peaceOffers.some(
          (offer) =>
            offer.warId === war.id &&
            offer.fromCountryId === input.countryId &&
            offer.terms === input.terms,
        )
      ) {
        fail(errors, "an identical peace offer is already pending");
      }
    } else {
      fail(errors, "unknown peace terms");
    }
  }
  if (world.military.peaceOffers.length >= MAX_PEACE_OFFERS) {
    fail(errors, "the peace-offer limit is reached");
  }
  return { valid: errors.length === 0, errors };
}

export function validateAcceptPeace(world: World, input: AcceptPeaceInput): MilitaryValidation {
  const errors: string[] = [];
  if (!world.military.enabled) fail(errors, "the military system is not enabled");
  const war = world.military.wars.find((entry) => entry.id === input.warId);
  if (war === undefined || war.endedDay !== null) fail(errors, "the war is not active");
  const offer = world.military.peaceOffers.find((entry) => entry.id === input.offerId);
  if (offer === undefined || offer.warId !== input.warId) {
    fail(errors, "the peace offer does not exist for that war");
  } else if (offer.toCountryId !== input.countryId) {
    fail(errors, "only the offer's recipient may accept it");
  } else if (
    war !== undefined &&
    !isWarPair(war, offer.fromCountryId, offer.toCountryId)
  ) {
    fail(errors, "the peace offer parties do not match the war's belligerents");
  } else if (!(PEACE_TERMS as readonly string[]).includes(offer.terms)) {
    fail(errors, "unknown peace terms");
  } else if (war !== undefined && offer.terms === "cede-occupied") {
    // Re-validate cession against the current world: occupations may have
    // changed since the offer was created.
    const cession = cessionError(world, offer.fromCountryId, offer.toCountryId);
    if (cession !== null) fail(errors, cession);
  }
  return { valid: errors.length === 0, errors };
}

export function validateRecruitArmy(world: World, input: RecruitArmyInput): MilitaryValidation {
  const errors: string[] = [];
  if (!world.military.enabled) fail(errors, "the military system is not enabled");
  const country = countryById(world, input.countryId);
  if (country === undefined) {
    fail(errors, `unknown country ${String(input.countryId)}`);
  }
  const province = provinceById(world, input.provinceId);
  if (province === undefined) {
    fail(errors, `unknown province ${String(input.provinceId)}`);
  }
  if (country !== undefined && province !== undefined) {
    const owner = provinceSovereignCountryId(world, input.provinceId);
    if (owner !== country.id) {
      fail(errors, "armies may only be recruited in a province the country owns");
    }
    if (!Number.isInteger(input.personnel) || input.personnel <= 0) {
      fail(errors, "personnel must be a positive integer");
    } else if (input.personnel > recruitablePeople(world, input.provinceId)) {
      fail(errors, "personnel exceeds the province's recruitable people");
    }
    const equipment =
      input.equipmentUnits ?? Math.ceil(Math.max(0, input.personnel) / M10_SOLDIERS_PER_EQUIPMENT_UNIT);
    if (!Number.isInteger(equipment) || equipment < 0) {
      fail(errors, "equipmentUnits must be a non-negative integer");
    }
    if (errors.length === 0) {
      const cost =
        input.personnel * world.moneyCoefficients.recruitmentCostPerSoldierRUSD +
        equipment * world.moneyCoefficients.equipmentPriceRUSD;
      if (cost > treasuryCash(world, country.id) + 1e-9) {
        fail(errors, "the treasury cannot fund recruitment and equipment");
      }
    }
    if (world.military.armies.length >= MAX_ARMIES) {
      fail(errors, "the army limit is reached");
    }
  }
  return { valid: errors.length === 0, errors };
}

export function validateDeployArmy(world: World, input: DeployArmyInput): MilitaryValidation {
  const errors: string[] = [];
  if (!world.military.enabled) fail(errors, "the military system is not enabled");
  const army = world.military.armies.find((entry) => entry.id === input.armyId);
  if (army === undefined) {
    fail(errors, "unknown army");
  } else {
    if (army.countryId !== input.countryId) fail(errors, "the army belongs to another country");
    if (world.dayIndex < army.readyDay) fail(errors, "the formation is not ready");
    if (army.destinationProvinceId !== null) fail(errors, "the army is already moving");
    const target = provinceById(world, input.targetProvinceId);
    if (target === undefined) {
      fail(errors, "unknown target province");
    } else if (input.targetProvinceId === army.provinceId) {
      fail(errors, "the army is already in that province");
    } else {
      const sovereign = provinceSovereignCountryId(world, input.targetProvinceId);
      const allowed =
        sovereign === army.countryId ||
        provinceControllerCountryId(world, target.id) === army.countryId ||
        (sovereign !== null && areAtWar(world, army.countryId, sovereign));
      if (!allowed) {
        fail(errors, "the target province is not own, controlled, or at war");
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

export function validateMilitaryAction(
  world: World,
  action: MilitaryActionInput,
): MilitaryValidation {
  let validation: MilitaryValidation;
  switch (action.kind) {
    case "declare-war":
      validation = validateDeclareWar(world, action);
      break;
    case "offer-peace":
      validation = validateOfferPeace(world, action);
      break;
    case "accept-peace":
      validation = validateAcceptPeace(world, action);
      break;
    case "recruit-army":
      validation = validateRecruitArmy(world, action);
      break;
    case "deploy-army":
      validation = validateDeployArmy(world, action);
      break;
  }
  const dayError =
    action.dayIndex === undefined ? null : militaryActionDayError(world, action.dayIndex);
  if (dayError === null) return validation;
  return { valid: false, errors: [dayError, ...validation.errors] };
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function relationForUpdate(
  state: MilitaryState,
  firstCountryId: Id,
  secondCountryId: Id,
): DiplomaticRelation {
  const a = Math.min(firstCountryId, secondCountryId);
  const b = Math.max(firstCountryId, secondCountryId);
  let relation = state.relations.find(
    (entry) => entry.countryA === a && entry.countryB === b,
  );
  if (relation === undefined) {
    relation = { countryA: a, countryB: b, score: 0, truceUntilDay: null };
    state.relations.push(relation);
    state.relations.sort(
      (left, right) => left.countryA - right.countryA || left.countryB - right.countryB,
    );
  }
  return relation;
}

/** Remove a destroyed formation from the roster; casualties were already recorded. */
function removeDestroyedArmies(world: World, dayIndex: Day): void {
  for (const army of world.military.armies) {
    if (army.personnel > 0) continue;
    if (army.wounded > 0) {
      returnPeople(world, army.homeProvinceId, army.wounded, dayIndex);
      recordCasualty(world.military, army.countryId).woundedReturned += army.wounded;
    }
  }
  world.military.armies = world.military.armies.filter((army) => army.personnel > 0);
}

/**
 * Return wounded or demobilised people to a province's population.
 *
 * No source block is persisted for a formation, so returns follow the same
 * documented population rule as recruitment: proportional to the province's
 * current eligible people, falling back to total population and finally to an
 * even split when a province is fully depopulated. People return into male
 * 18..45 cells, matching the existing M10 convention.
 */
function returnPeople(world: World, provinceId: Id, count: number, dayIndex: Day): void {
  if (!(count > 0)) return;
  const blocks = world.popBlocks.filter((candidate) => candidate.provinceId === provinceId);
  if (blocks.length === 0) {
    throw new RangeError(`province ${String(provinceId)} has no pop block for returning people`);
  }
  const totalPopulations = blocks.map(blockPopulation);
  const eligible = blocks.map(
    (block) => eligibleAgeCount(block.maleByAge) + eligibleAgeCount(block.femaleByAge),
  );
  let weights = eligible;
  if (weights.reduce((total, value) => total + value, 0) === 0) {
    weights = totalPopulations;
  }
  if (weights.reduce((total, value) => total + value, 0) === 0) {
    weights = blocks.map(() => 1);
  }
  const tieKeys = blocks.map((block) => {
    return drawUint32({
      seed: world.seed,
      day: dayIndex,
      entityId: block.id,
      purpose: M10_RETURN_REMAINDER_PURPOSE,
      drawIndex: 0,
    });
  });
  const allocations = apportionLargestRemainder(count, weights, tieKeys, totalPopulations, false);
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (block === undefined) throw new RangeError("missing pop block for returning people");
    let remaining = allocations[index] ?? 0;
    let age = RECRUIT_MIN_AGE;
    while (remaining > 0) {
      block.maleByAge[age] = (block.maleByAge[age] ?? 0) + 1;
      remaining -= 1;
      age += 1;
      if (age > RECRUIT_MAX_AGE) age = RECRUIT_MIN_AGE;
    }
  }
}

/** Provinces the country militarily controls that belong to `targetCountryId`. */
export function controlledProvincesOf(
  world: World,
  countryId: Id,
  targetCountryId: Id,
): Id[] {
  const provinces: Id[] = [];
  if (!world.provinces.enabled) return provinces;
  for (const record of world.provinces.ownership) {
    if (record.controllerPolityId !== countryId || record.ownerPolityId === countryId) continue;
    if (record.ownerPolityId === targetCountryId) provinces.push(record.provinceId);
  }
  return provinces.sort((left, right) => left - right);
}

/**
 * Cede provinces to a country by treaty. This is the only M10 operation that
 * changes legal ownership. Through `transferProvincesToCountry` (D-118 §4) the
 * provinces join the recipient's customs territory with their blocks, buildings
 * and stock; people, accounts and cash are conserved and monetary authority is
 * untouched. A country can never cede its last province.
 */
export function transferProvinceSovereignty(
  world: World,
  provinceIds: readonly Id[],
  toCountryId: Id,
  dayIndex: Day,
): void {
  if (countryById(world, toCountryId) === undefined) {
    throw new RangeError(`unknown country ${String(toCountryId)}`);
  }
  const moving = [...new Set(provinceIds)]
    .filter((provinceId) => provinceSovereignCountryId(world, provinceId) !== toCountryId)
    .sort((left, right) => left - right);
  if (moving.length === 0) return;
  const losses = new Map<Id, number>();
  for (const provinceId of moving) {
    const fromCountryId = provinceSovereignCountryId(world, provinceId);
    if (fromCountryId === null) continue;
    losses.set(fromCountryId, (losses.get(fromCountryId) ?? 0) + 1);
  }
  for (const [fromCountryId, lost] of losses) {
    if (countryProvinceIds(world, fromCountryId).length - lost < 1) {
      throw new RangeError(`country ${String(fromCountryId)} cannot cede its last province`);
    }
  }
  transferProvincesToCountry(world, {
    provinceIds: moving,
    toCountryId,
    kind: "cession",
    day: dayIndex,
    note: "Ceded by peace treaty",
  });
}

function applyPeace(
  world: World,
  war: WarState,
  terms: PeaceTermKind,
  fromCountryId: Id,
  dayIndex: Day,
): void {
  const winnerSide = war.attackerCountryId;
  const loserSide = war.defenderCountryId;
  let cessionProvinces: Id[] = [];
  if (terms === "cede-occupied") {
    const other = fromCountryId === winnerSide ? loserSide : winnerSide;
    const cession = cessionError(world, fromCountryId, other);
    if (cession !== null) throw new RangeError(cession);
    cessionProvinces = controlledProvincesOf(world, fromCountryId, other);
  }
  war.endedDay = dayIndex;
  // `truceUntilDay` is the last prohibited day. A peace on day P is followed by
  // 365 full truce days P+1..P+365; a new declaration is first legal on P+366.
  // The peace day P itself is also rejected defensively.
  war.truceUntilDay = dayIndex + M10_TRUCE_DAYS;
  const relation = relationForUpdate(world.military, winnerSide, loserSide);
  relation.truceUntilDay = dayIndex + M10_TRUCE_DAYS;
  relation.score = Math.min(relation.score, M10_PEACE_RELATION_SCORE);
  // The ended war's offers go first: the cession validates the whole world.
  world.military.peaceOffers = world.military.peaceOffers.filter(
    (offer) => offer.warId !== war.id,
  );
  if (cessionProvinces.length > 0) {
    transferProvinceSovereignty(world, cessionProvinces, fromCountryId, dayIndex);
  }
  // Every remaining occupation between the two belligerents is cleared on peace.
  const liberated: Id[] = [];
  if (world.provinces.enabled) {
    for (const record of world.provinces.ownership) {
      const controller = record.controllerPolityId;
      const sovereign = record.ownerPolityId;
      const pair =
        (controller === winnerSide && sovereign === loserSide) ||
        (controller === loserSide && sovereign === winnerSide);
      if (pair) liberated.push(record.provinceId);
    }
  }
  if (liberated.length > 0) {
    setProvinceControl(world, {
      provinceIds: liberated,
      controllerPolityId: null,
      kind: "liberation",
      day: dayIndex,
      note: "Occupation ended by peace",
    });
  }
}

/** Deep enough copy to restore a failed action atomically. */
function snapshotForAction(world: World): {
  military: MilitaryState;
  provinces: World["provinces"];
  provinceEconomies: World["provinceEconomies"];
  markets: World["markets"];
  construction: World["construction"];
  finance: World["finance"];
  popBlocks: PopBlock[];
  employment: World["employment"];
  employmentDirty: boolean;
} {
  return {
    military: {
      ...world.military,
      armies: world.military.armies.map((army) => ({ ...army })),
      wars: world.military.wars.map((war) => ({ ...war })),
      relations: world.military.relations.map((relation) => ({ ...relation })),
      peaceOffers: world.military.peaceOffers.map((offer) => ({ ...offer })),
      casualties: world.military.casualties.map((record) => ({ ...record })),
    },
    // A peace cession moves provinces between customs territories (D-118), so the
    // province, market and construction state are part of the atomic snapshot.
    provinces: {
      ...world.provinces,
      ownership: world.provinces.ownership.map((entry) => ({
        ...entry,
        claimantPolityIds: [...entry.claimantPolityIds],
      })),
      transfers: [...world.provinces.transfers],
    },
    provinceEconomies: world.provinceEconomies.map((province) => ({
      ...province,
      popBlockIds: [...province.popBlockIds],
      buildingInstanceIds: [...province.buildingInstanceIds],
    })),
    markets: world.markets.map((market) => ({
      ...market,
      priceRUSD: [...market.priceRUSD],
      stockLots: market.stockLots.map((lot) => ({ ...lot })),
    })),
    construction: world.construction,
    finance: cloneFinanceState(world.finance),
    popBlocks: world.popBlocks.map((block) => ({
      ...block,
      maleByAge: block.maleByAge.slice(),
      femaleByAge: block.femaleByAge.slice(),
    })),
    employment: world.employment.map((assignment) => ({ ...assignment })),
    employmentDirty: world.employmentDirty,
  };
}

function restoreActionSnapshot(
  world: World,
  snapshot: ReturnType<typeof snapshotForAction>,
): void {
  world.military = snapshot.military;
  world.provinces = snapshot.provinces;
  world.provinceEconomies = snapshot.provinceEconomies;
  world.markets = snapshot.markets;
  world.construction = snapshot.construction;
  world.finance = snapshot.finance;
  world.popBlocks = snapshot.popBlocks;
  world.employment = snapshot.employment;
  world.employmentDirty = snapshot.employmentDirty;
}

export function applyMilitaryAction(
  world: World,
  action: MilitaryActionInput,
  dayIndex: Day,
): MilitaryActionResult {
  const dayError = militaryActionDayError(world, dayIndex);
  if (dayError !== null) {
    throw new RangeError(`invalid military action: ${dayError}`);
  }
  const validation = validateMilitaryAction(world, action);
  if (!validation.valid) {
    throw new RangeError(`invalid military action: ${validation.errors.join("; ")}`);
  }
  const snapshot = snapshotForAction(world);
  try {
    const result = executeMilitaryAction(world, action, dayIndex);
    assertValidWorld(world);
    return result;
  } catch (error) {
    restoreActionSnapshot(world, snapshot);
    throw error;
  }
}

function executeMilitaryAction(
  world: World,
  action: MilitaryActionInput,
  dayIndex: Day,
): MilitaryActionResult {
  switch (action.kind) {
    case "declare-war": {
      const warId = world.military.nextWarId;
      if (world.military.wars.length >= MAX_WARS) {
        throw new RangeError("the war-record limit is reached");
      }
      world.military.nextWarId += 1;
      world.military.wars.push({
        id: warId,
        attackerCountryId: action.countryId,
        defenderCountryId: action.targetCountryId,
        casusBelli: action.casusBelli,
        startedDay: dayIndex,
        endedDay: null,
        truceUntilDay: null,
      });
      const relation = relationForUpdate(
        world.military,
        action.countryId,
        action.targetCountryId,
      );
      relation.score = Math.min(relation.score, M10_WAR_RELATION_SCORE);
      relation.truceUntilDay = null;
      return {
        kind: action.kind,
        countryId: action.countryId,
        dayIndex,
        warId,
        offerId: null,
        armyId: null,
        provinceId: null,
        personnel: 0,
        equipmentUnits: 0,
        spentRUSD: 0,
      };
    }
    case "offer-peace": {
      const offerId = world.military.nextOfferId;
      world.military.nextOfferId += 1;
      const war = world.military.wars.find((entry) => entry.id === action.warId);
      if (war === undefined) throw new RangeError("missing war");
      const toCountryId =
        action.countryId === war.attackerCountryId
          ? war.defenderCountryId
          : war.attackerCountryId;
      world.military.peaceOffers.push({
        id: offerId,
        warId: war.id,
        fromCountryId: action.countryId,
        toCountryId,
        terms: action.terms,
        proposedDay: dayIndex,
      });
      return {
        kind: action.kind,
        countryId: action.countryId,
        dayIndex,
        warId: war.id,
        offerId,
        armyId: null,
        provinceId: null,
        personnel: 0,
        equipmentUnits: 0,
        spentRUSD: 0,
      };
    }
    case "accept-peace": {
      const war = world.military.wars.find((entry) => entry.id === action.warId);
      const offer = world.military.peaceOffers.find((entry) => entry.id === action.offerId);
      if (war === undefined || offer === undefined) {
        throw new RangeError("missing war or peace offer");
      }
      applyPeace(world, war, offer.terms, offer.fromCountryId, dayIndex);
      return {
        kind: action.kind,
        countryId: action.countryId,
        dayIndex,
        warId: war.id,
        offerId: offer.id,
        armyId: null,
        provinceId: null,
        personnel: 0,
        equipmentUnits: 0,
        spentRUSD: 0,
      };
    }
    case "recruit-army": {
      const equipmentUnits =
        action.equipmentUnits ??
        Math.ceil(action.personnel / M10_SOLDIERS_PER_EQUIPMENT_UNIT);
      const recruitmentCost = action.personnel * world.moneyCoefficients.recruitmentCostPerSoldierRUSD;
      const equipmentCost = equipmentUnits * world.moneyCoefficients.equipmentPriceRUSD;
      const province = provinceById(world, action.provinceId);
      if (province === undefined) throw new RangeError("missing recruitment province");
      const removals = removePeople(world, province.id, action.personnel, dayIndex);
      reconcileRecruitmentEmployment(world, removals);
      // Signing costs follow the actual supplier blocks: each block is paid for
      // exactly the recruits it supplied. This is a real treasury-to-household
      // transfer and needs no persisted source record.
      const signingShares: MilitaryPayShare[] = [];
      for (const removal of removals) {
        const recruits = removal.males + removal.females;
        if (recruits <= 0) continue;
        signingShares.push({
          popBlockId: removal.popBlockId,
          amountRUSD: recruits * world.moneyCoefficients.recruitmentCostPerSoldierRUSD,
        });
      }
      postMilitaryPay(world, dayIndex, action.countryId, signingShares);
      postMilitaryProcurement(world, dayIndex, action.countryId, equipmentCost);
      const armyId = world.military.nextArmyId;
      world.military.nextArmyId += 1;
      world.military.armies.push({
        id: armyId,
        countryId: action.countryId,
        provinceId: province.id,
        homeProvinceId: province.id,
        personnel: action.personnel,
        equipmentUnits,
        organization: 0.5,
        supply: 0.6,
        wounded: 0,
        woundedReturnDay: null,
        deaths: 0,
        captured: 0,
        readyDay: dayIndex + M10_ARMY_FORMATION_DAYS,
        destinationProvinceId: null,
        arrivalDay: null,
        lastBattleDay: null,
      });
      recordCasualty(world.military, action.countryId);
      return {
        kind: action.kind,
        countryId: action.countryId,
        dayIndex,
        warId: null,
        offerId: null,
        armyId,
        provinceId: province.id,
        personnel: action.personnel,
        equipmentUnits,
        spentRUSD: recruitmentCost + equipmentCost,
      };
    }
    case "deploy-army": {
      const army = world.military.armies.find((entry) => entry.id === action.armyId);
      if (army === undefined) throw new RangeError("missing army");
      army.destinationProvinceId = action.targetProvinceId;
      army.arrivalDay = dayIndex + M10_DEPLOYMENT_DAYS;
      return {
        kind: action.kind,
        countryId: action.countryId,
        dayIndex,
        warId: null,
        offerId: null,
        armyId: army.id,
        provinceId: action.targetProvinceId,
        personnel: army.personnel,
        equipmentUnits: army.equipmentUnits,
        spentRUSD: 0,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Daily phase
// ---------------------------------------------------------------------------

function strengthOf(army: Army): number {
  const equipmentRatio = Math.min(
    1,
    (army.equipmentUnits * M10_SOLDIERS_PER_EQUIPMENT_UNIT) / Math.max(1, army.personnel),
  );
  return (
    army.personnel *
    (0.4 + 0.6 * army.organization) *
    (0.5 + 0.5 * equipmentRatio) *
    (0.5 + 0.5 * army.supply)
  );
}

function casualtyJitter(
  world: World,
  warId: Id,
  dayIndex: Day,
  provinceId: Id,
  side: number,
): number {
  const draw = drawUint32({
    seed: world.seed,
    day: dayIndex,
    entityId: warId,
    purpose: "m10-combat",
    drawIndex: provinceId * 2 + side,
  });
  return draw / 0xffff_ffff;
}

interface BattleApplication {
  readonly result: MilitaryBattleResult;
}

/** Scale used to convert the configured casualty shares to exact integer weights. */
const CASUALTY_SHARE_SCALE = 1_000;

/**
 * Split integer battle losses across deaths, wounded, and captured using the
 * configured shares and deterministic largest-remainder apportionment.
 *
 * Deaths, wounded, and captured always sum exactly to `losses`. Equal fractional
 * remainders are broken in category order (deaths, then wounded, then captured),
 * which keeps the result independent of randomness and guarantees that every
 * configured share, including `M10_CAPTURED_SHARE`, actually controls behavior.
 */
export function splitMilitaryCasualties(losses: number): {
  readonly deaths: number;
  readonly wounded: number;
  readonly captured: number;
} {
  if (!Number.isSafeInteger(losses) || losses < 0) {
    throw new RangeError("casualty losses must be a non-negative safe integer");
  }
  const weights = [M10_DEATH_SHARE, M10_WOUNDED_SHARE, M10_CAPTURED_SHARE].map(
    (share) => Math.round(share * CASUALTY_SHARE_SCALE),
  );
  const totalWeight = weights.reduce((total, weight) => total + weight, 0);
  if (totalWeight !== CASUALTY_SHARE_SCALE) {
    throw new RangeError("casualty shares must sum to exactly one");
  }
  if (losses === 0) return { deaths: 0, wounded: 0, captured: 0 };
  const allocations = weights.map((weight) => Math.floor((losses * weight) / totalWeight));
  let allocated = allocations.reduce((total, value) => total + value, 0);
  const remainders = weights
    .map((weight, index) => ({
      index,
      remainder: (losses * weight) % totalWeight,
    }))
    .sort((left, right) => right.remainder - left.remainder || left.index - right.index);
  const leftover = losses - allocated;
  if (leftover > remainders.length) {
    throw new RangeError("casualty apportionment ran out of capacity");
  }
  for (let index = 0; index < leftover; index += 1) {
    const candidate = remainders[index];
    if (candidate === undefined) {
      throw new RangeError("casualty apportionment ran out of capacity");
    }
    allocations[candidate.index] = (allocations[candidate.index] ?? 0) + 1;
  }
  allocated = allocations.reduce((total, value) => total + value, 0);
  if (allocated !== losses) {
    throw new RangeError("casualty apportionment did not conserve losses");
  }
  return {
    deaths: allocations[0] ?? 0,
    wounded: allocations[1] ?? 0,
    captured: allocations[2] ?? 0,
  };
}

function applyCasualties(
  state: MilitaryState,
  army: Army,
  losses: number,
  dayIndex: Day,
): number {
  const split = splitMilitaryCasualties(losses);
  const deaths = split.deaths;
  const wounded = split.wounded;
  const captured = split.captured;
  army.personnel = Math.max(0, army.personnel - (deaths + wounded + captured));
  army.deaths += deaths;
  army.captured += captured;
  const record = recordCasualty(state, army.countryId);
  record.deaths += deaths;
  record.captured += captured;
  if (wounded > 0) {
    army.wounded += wounded;
    if (army.woundedReturnDay === null) {
      army.woundedReturnDay = dayIndex + M10_WOUND_RECOVERY_DAYS;
    }
  }
  const equipmentLoss = Math.min(
    army.equipmentUnits,
    Math.round(army.equipmentUnits * (losses / Math.max(1, army.personnel + losses))),
  );
  army.equipmentUnits -= equipmentLoss;
  return deaths;
}

function resolveBattle(
  world: World,
  state: MilitaryState,
  war: WarState,
  dayIndex: Day,
  provinceId: Id,
  attacker: Army,
  defender: Army,
): BattleApplication {
  const attackerStrength = strengthOf(attacker);
  const defenderStrength = strengthOf(defender);
  const total = Math.max(1e-9, attackerStrength + defenderStrength);
  const attackerLossRate = Math.min(
    M10_MAX_CASUALTY_FRACTION,
    (M10_BASE_CASUALTY_FRACTION +
      M10_CASUALTY_STRENGTH_SCALE * (defenderStrength / total)) *
      (0.8 + 0.4 * casualtyJitter(world, war.id, dayIndex, provinceId, 0)),
  );
  const defenderLossRate = Math.min(
    M10_MAX_CASUALTY_FRACTION,
    (M10_BASE_CASUALTY_FRACTION +
      M10_CASUALTY_STRENGTH_SCALE * (attackerStrength / total)) *
      (0.8 + 0.4 * casualtyJitter(world, war.id, dayIndex, provinceId, 1)),
  );
  const attackerLosses = Math.min(
    attacker.personnel,
    Math.max(1, Math.round(attacker.personnel * attackerLossRate)),
  );
  const defenderLosses = Math.min(
    defender.personnel,
    Math.max(1, Math.round(defender.personnel * defenderLossRate)),
  );
  const attackerDeaths = applyCasualties(state, attacker, attackerLosses, dayIndex);
  const defenderDeaths = applyCasualties(state, defender, defenderLosses, dayIndex);
  attacker.lastBattleDay = dayIndex;
  defender.lastBattleDay = dayIndex;
  return {
    result: {
      provinceId,
      attackerCountryId: attacker.countryId,
      defenderCountryId: defender.countryId,
      attackerLosses,
      defenderLosses,
      attackerDeaths,
      defenderDeaths,
    },
  };
}

function payUpkeep(
  world: World,
  army: Army,
  dayIndex: Day,
): { paid: number; shortfall: number } {
  const payRequired = army.personnel * world.moneyCoefficients.soldierDailyPayRUSD;
  const equipmentRequired = army.equipmentUnits * world.moneyCoefficients.equipmentDailyUpkeepRUSD;
  const required = payRequired + equipmentRequired;
  if (!(required > 0)) return { paid: 0, shortfall: 0 };
  const recipients = payRecipients(world, army.provinceId, dayIndex);
  // Soldiers' pay needs a household recipient. If the province has none, only the
  // equipment supplier can be paid; the unpaid pay remains an honest shortfall.
  const payable = recipients.length > 0 ? required : equipmentRequired;
  const available = treasuryCash(world, army.countryId);
  const paid = payable > 0 ? Math.min(payable, Math.max(0, available)) : 0;
  const ratio = paid / required;
  if (ratio >= 1 - 1e-9) {
    army.supply = Math.min(1, army.supply + M10_SUPPLY_RECOVERY_PER_DAY);
  } else {
    army.supply = Math.max(0, army.supply - M10_SUPPLY_LOSS_PER_DAY);
    army.organization = Math.max(
      M10_MIN_ORGANIZATION,
      army.organization - M10_UNPAID_ORGANIZATION_LOSS,
    );
  }
  let paidPay = 0;
  let paidEquipment = 0;
  if (recipients.length > 0) {
    const paidRatio = paid / required;
    paidPay = payRequired * paidRatio;
    paidEquipment = equipmentRequired * paidRatio;
    if (paidPay > 0) {
      postMilitaryPay(
        world,
        dayIndex,
        army.countryId,
        allocateMoneyAcrossBlocks(paidPay, recipients),
      );
    }
  } else {
    paidEquipment = paid;
  }
  postMilitaryProcurement(world, dayIndex, army.countryId, paidEquipment);
  return { paid, shortfall: required - paid };
}

function shouldAiAccept(
  world: World,
  war: WarState,
  offer: PeaceOffer,
  dayIndex: Day,
): boolean {
  const recipient = countryById(world, offer.toCountryId);
  if (recipient === undefined) return false;
  if (recipient.id === world.playerCountryId) return false;
  if (offer.terms !== "white-peace") return false;
  if (dayIndex - war.startedDay >= M10_AI_PEACE_MIN_WAR_DAYS) return true;
  const controlledAgainst = controlledProvincesOf(world, recipient.id, offer.fromCountryId).length;
  const enemyControlled = controlledProvincesOf(world, offer.fromCountryId, recipient.id).length;
  return enemyControlled > controlledAgainst;
}

export interface MilitaryPhaseOptions {
  readonly validateWorld?: boolean;
}

export function runMilitaryPhase(
  world: World,
  dayIndex: Day,
  options: MilitaryPhaseOptions = {},
): MilitaryPhaseResult {
  if (!world.military.enabled) return emptyPhaseResult(dayIndex);
  if (world.military.lastPhaseDay === dayIndex) return emptyPhaseResult(dayIndex);
  if (options.validateWorld !== false) assertValidWorld(world);
  assertValidDayIndex(dayIndex);
  const result = {
    dayIndex,
    battles: [] as MilitaryBattleResult[],
    occupiedProvinceIds: [] as Id[],
    liberatedProvinceIds: [] as Id[],
    movedArmyIds: [] as Id[],
    recoveredWounded: 0,
    paidRUSD: 0,
    shortfallRUSD: 0,
    endedWarIds: [] as Id[],
  };

  // 1. Movement arrivals.
  for (const army of [...world.military.armies].sort((left, right) => left.id - right.id)) {
    if (army.destinationProvinceId === null || army.arrivalDay === null) continue;
    if (army.arrivalDay > dayIndex) continue;
    army.provinceId = army.destinationProvinceId;
    army.destinationProvinceId = null;
    army.arrivalDay = null;
    result.movedArmyIds.push(army.id);
  }

  // 2. Battles: one battle per province per day between the first hostile pair.
  const provinceIds = world.provinceEconomies.map((province) => province.id).sort((left, right) => left - right);
  for (const provinceId of provinceIds) {
    const armies = armiesInProvince(world, provinceId).sort((left, right) => left.id - right.id);
    if (armies.length < 2) continue;
    let attacker: Army | undefined;
    let defender: Army | undefined;
    for (let i = 0; i < armies.length && attacker === undefined; i += 1) {
      for (let j = i + 1; j < armies.length; j += 1) {
        const first = armies[i];
        const second = armies[j];
        if (first === undefined || second === undefined) continue;
        const war = activeWarBetween(world, first.countryId, second.countryId);
        if (war === null) continue;
        const sovereign = provinceSovereignCountryId(world, provinceId);
        if (sovereign !== null && first.countryId === sovereign) {
          defender = first;
          attacker = second;
        } else if (sovereign !== null && second.countryId === sovereign) {
          defender = second;
          attacker = first;
        } else {
          attacker = first;
          defender = second;
        }
        const battle = resolveBattle(world, world.military, war, dayIndex, provinceId, attacker, defender);
        result.battles.push(battle.result);
        break;
      }
    }
  }
  removeDestroyedArmies(world, dayIndex);

  // 3. Occupation and liberation.
  // Occupation is province control (D-118). Only war occupations are created and
  // lifted here; war-free administrative control (D-129) is left untouched. Only
  // provinces that host an army or are already occupied can change, so the scan
  // is over armies and occupied provinces, not every province.
  const countryIds = new Set(world.countries.map((country) => country.id));
  const candidateProvinceIds = new Set<Id>();
  for (const army of world.military.armies) candidateProvinceIds.add(army.provinceId);
  if (world.provinces.enabled) {
    for (const record of world.provinces.ownership) {
      if (record.controllerPolityId !== record.ownerPolityId) candidateProvinceIds.add(record.provinceId);
    }
  }
  const occupiedNow = new Map<Id, Id>();
  for (const provinceId of [...candidateProvinceIds].sort((left, right) => left - right)) {
    const record = world.provinces.enabled
      ? world.provinces.ownership.find((entry) => entry.provinceId === provinceId)
      : undefined;
    if (record === undefined || !countryIds.has(record.ownerPolityId)) continue;
    const sovereign = record.ownerPolityId;
    const armies = armiesInProvince(world, provinceId);
    if (record.controllerPolityId !== sovereign) {
      const controller = record.controllerPolityId;
      // War-free control is administrative (peace already lifted every war
      // occupation between former belligerents), so it is not touched here.
      if (!countryIds.has(controller) || !areAtWar(world, controller, sovereign)) continue;
      if (armies.some((army) => army.countryId === controller)) {
        occupiedNow.set(provinceId, controller);
      } else {
        setProvinceControl(world, {
          provinceIds: [provinceId],
          controllerPolityId: null,
          kind: "liberation",
          day: dayIndex,
          note: "Occupier withdrew",
        });
        result.liberatedProvinceIds.push(provinceId);
      }
      continue;
    }
    if (armies.some((army) => army.countryId === sovereign)) continue;
    const occupier = armies
      .filter((army) => areAtWar(world, army.countryId, sovereign))
      .sort((left, right) => left.id - right.id)[0];
    if (occupier !== undefined) {
      setProvinceControl(world, {
        provinceIds: [provinceId],
        controllerPolityId: occupier.countryId,
        kind: "occupation",
        day: dayIndex,
        note: "Military occupation",
      });
      occupiedNow.set(provinceId, occupier.countryId);
      result.occupiedProvinceIds.push(provinceId);
    }
  }

  // 4. Occupation effects: unrest and garrison procurement paid by the controller.
  const provinceEconomyById = new Map(world.provinceEconomies.map((province) => [province.id, province]));
  for (const [provinceId, controller] of [...occupiedNow].sort((left, right) => left[0] - right[0])) {
    const province = provinceEconomyById.get(provinceId);
    if (province === undefined) continue;
    province.unrest = Math.min(1, province.unrest + M10_OCCUPATION_UNREST_PER_DAY);
    const occupier = armiesInProvince(world, province.id)
      .filter((army) => army.countryId === controller)
      .sort((left, right) => left.id - right.id)[0];
    if (occupier === undefined) continue;
    const requested = occupier.personnel * world.moneyCoefficients.garrisonCostPerSoldierPerDayRUSD;
    const recipients = payRecipients(world, province.id, dayIndex);
    if (recipients.length === 0) {
      // No occupied-province household can receive the payment, so no treasury
      // cash moves and the full amount is an honest shortfall.
      result.shortfallRUSD += requested;
      continue;
    }
    const available = treasuryCash(world, controller);
    const paid = Math.min(requested, Math.max(0, available));
    if (paid > 0) {
      postMilitaryPay(
        world,
        dayIndex,
        controller,
        allocateMoneyAcrossBlocks(paid, recipients),
      );
    }
    result.paidRUSD += paid;
    result.shortfallRUSD += requested - paid;
  }

  // 5. Upkeep and wounded recovery.
  for (const army of [...world.military.armies].sort((left, right) => left.id - right.id)) {
    const upkeep = payUpkeep(world, army, dayIndex);
    result.paidRUSD += upkeep.paid;
    result.shortfallRUSD += upkeep.shortfall;
    if (army.woundedReturnDay !== null && dayIndex >= army.woundedReturnDay) {
      const record = recordCasualty(world.military, army.countryId);
      record.woundedReturned += army.wounded;
      result.recoveredWounded += army.wounded;
      army.personnel += army.wounded;
      army.wounded = 0;
      army.woundedReturnDay = null;
    }
  }

  // 6. Minimal deterministic AI: accept a pending white peace when exhausted or losing.
  for (const offer of [...world.military.peaceOffers].sort((left, right) => left.id - right.id)) {
    const war = world.military.wars.find((entry) => entry.id === offer.warId);
    if (war === undefined || war.endedDay !== null) continue;
    if (!shouldAiAccept(world, war, offer, dayIndex)) continue;
    applyPeace(world, war, offer.terms, offer.fromCountryId, dayIndex);
    result.endedWarIds.push(war.id);
  }

  world.military.lastPhaseDay = dayIndex;
  return result;
}

/** The number of people who left civilian life for the military in this world. */
export function militaryPersonnelTotal(world: World): number {
  let total = 0;
  for (const army of world.military.armies) total += army.personnel;
  return total;
}

export {
  activeWarBetween,
  assertValidMilitaryState,
  countryById,
  emptyMilitaryState,
  provinceById,
  provinceControllerCountryId,
  provinceSovereignCountryId,
} from "./militaryState.js";
