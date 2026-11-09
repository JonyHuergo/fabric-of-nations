/**
 * P7 (D-154, plan §5.4, Q13, Q14): the one conserving reclassification operation.
 *
 * `moveBlockPeople` moves an integer number of people from one block to the block of
 * (destination province, destination profession), creating that block through a
 * validated step when it does not exist. Mobility (between professions inside a
 * province) and labour-market migration (between provinces, same profession) both use
 * it; later stages (expropriation, land reform, demobilisation, religious and
 * ideological flows) are meant to as well.
 *
 * Conservation (acceptance): persons by sex and age cell (largest remainder, keyed
 * ties), household cash (a balanced `migration-transfer` posting), literate persons (a
 * literate mover leaves the source's age rate recomputed without them and joins the
 * destination at literacy 1), dwellings (carried only by movers who keep their
 * settlement; the rest stay with the source) and urban persons (movers leave the source
 * pro rata and are placed in towns in the destination by the caller's urban fraction).
 *
 * `retireEmptyBlocks` removes blocks with no people and no employment (plan §5.4 item 7):
 * residual cash and owned buildings pass to the block that received most of their
 * people this month (else the province's most populous block of the same stratum, else
 * its most populous block), through a posting and one validated ownership update. A
 * block that holds public debt is kept. A retired block's accounts stay in the ledger
 * at zero assets, its id in `labourMarket.retiredPopBlockIds`.
 */

import { roundTo } from "../population/definitions.js";
import { MONEY_TOLERANCE_RUSD, RATE_DECIMAL_PLACES, WEALTH_DECIMAL_PLACES } from "../population/constants.js";
import { populationTotal, syncBlockLiteracy } from "../population/state.js";
import type { PopBlock } from "../population/types.js";
import { drawUint32 } from "../rng.js";
import type { DayIndex, Id } from "../types.js";
import type { World } from "../world.js";
import { postJournalBatch } from "./accounting.js";
import { categoryForSubtype } from "./accounts.js";
import { MOBILITY_AGE_REMAINDER_PURPOSE } from "./constants.js";
import { apportionLargestRemainder } from "./apportion.js";
import type { AccountSubtype, EconomyDefinitions, FinancialAccount } from "./types.js";
import { WORKING_AGE_END, WORKING_AGE_START } from "../population/constants.js";

export interface MoveOptions {
  /** Movers are literate working-age persons (a literacy-gated destination, plan §5.3). */
  readonly selectiveLiterate: boolean;
  /** Share of movers placed in towns at the destination, [0, 1]. */
  readonly destinationUrbanFraction: number;
  /** Share of the movers' pro-rata dwellings carried along, [0, 1] (plan §6.4). */
  readonly carriedDwellingShare: number;
}

export interface MoveResult {
  readonly destination: PopBlock;
  readonly created: boolean;
  readonly people: number;
  readonly cashRUSD: number;
  readonly dwellings: number;
}

/** Per-phase caches: the block account subtypes and the household cash accounts. */
export interface ReclassifyContext {
  readonly world: World;
  readonly definitions: EconomyDefinitions;
  readonly dayIndex: DayIndex;
  /** Owner block id → its accounts (built once per phase, extended on creation). */
  readonly accountsByBlock: Map<Id, FinancialAccount[]>;
  /** (province, profession) → block. */
  readonly blockByKey: Map<string, PopBlock>;
  /** Source block id → destination block id → people received this month. */
  readonly received: Map<Id, Map<Id, number>>;
  blocksCreated: number;
}

export function blockKey(provinceId: Id, professionId: Id): string {
  return `${String(provinceId)}:${String(professionId)}`;
}

export function createReclassifyContext(world: World, definitions: EconomyDefinitions, dayIndex: DayIndex): ReclassifyContext {
  const accountsByBlock = new Map<Id, FinancialAccount[]>();
  for (const account of world.finance.accounts) {
    if (account.ownerKind !== "popBlock" || account.ownerId === null) continue;
    const list = accountsByBlock.get(account.ownerId);
    if (list === undefined) accountsByBlock.set(account.ownerId, [account]);
    else list.push(account);
  }
  const blockByKey = new Map<string, PopBlock>();
  for (const block of world.popBlocks) blockByKey.set(blockKey(block.provinceId, block.professionId), block);
  return { world, definitions, dayIndex, accountsByBlock, blockByKey, received: new Map(), blocksCreated: 0 };
}

function householdCash(context: ReclassifyContext, blockId: Id): FinancialAccount {
  const account = context.accountsByBlock.get(blockId)?.find((entry) => entry.subtype === "household-cash");
  if (account === undefined) throw new RangeError(`popBlock ${String(blockId)} has no household cash account`);
  return account;
}

/** Split `count` movers over a block's sex and age cells (largest remainder, keyed ties). */
function splitCells(
  context: ReclassifyContext,
  source: PopBlock,
  count: number,
  selectiveLiterate: boolean,
): { male: Uint32Array; female: Uint32Array } {
  const ages = source.maleByAge.length;
  const weights: number[] = new Array<number>(ages * 2).fill(0);
  for (let age = 0; age < ages; age += 1) {
    const male = source.maleByAge[age] ?? 0;
    const female = source.femaleByAge[age] ?? 0;
    if (selectiveLiterate) {
      if (age < WORKING_AGE_START || age > WORKING_AGE_END) continue;
      const literacy = Math.min(1, Math.max(0, source.literacyByAge[age] ?? 0));
      weights[age] = Math.floor(male * literacy + 1e-9);
      weights[ages + age] = Math.floor(female * literacy + 1e-9);
    } else {
      weights[age] = male;
      weights[ages + age] = female;
    }
  }
  const available = weights.reduce((sum, value) => sum + value, 0);
  if (count > available) throw new RangeError("reclassification moves more people than the source can provide");
  const ties = weights.map((_, index) =>
    drawUint32({ seed: context.world.seed, day: context.dayIndex, entityId: source.id, purpose: MOBILITY_AGE_REMAINDER_PURPOSE, drawIndex: index }),
  );
  const allocation = apportionLargestRemainder(count, weights, ties);
  return {
    male: Uint32Array.from(allocation.slice(0, ages)),
    female: Uint32Array.from(allocation.slice(ages)),
  };
}

/** Movable people of a block for a move: all persons, or its literate working-age persons. */
export function movablePeople(block: PopBlock, selectiveLiterate: boolean): number {
  if (!selectiveLiterate) return populationTotal(block);
  let total = 0;
  for (let age = WORKING_AGE_START; age <= WORKING_AGE_END; age += 1) {
    const literacy = Math.min(1, Math.max(0, block.literacyByAge[age] ?? 0));
    total += Math.floor((block.maleByAge[age] ?? 0) * literacy + 1e-9) + Math.floor((block.femaleByAge[age] ?? 0) * literacy + 1e-9);
  }
  return total;
}

/** Create the block of (province, profession) with the source's attributes (plan §5.4 item 2). */
function createBlock(context: ReclassifyContext, source: PopBlock, provinceId: Id, professionId: Id): PopBlock {
  const { world } = context;
  const province = world.provinceEconomies.find((entry) => entry.id === provinceId);
  if (province === undefined) throw new RangeError(`unknown province ${String(provinceId)}`);
  if (!context.definitions.professions.some((profession) => profession.id === professionId)) {
    throw new RangeError(`unknown profession ${String(professionId)}`);
  }
  const id = world.labourMarket.nextPopBlockId;
  if (!Number.isSafeInteger(id + 1) || id + 1 > 0xffff_ffff) throw new RangeError("popBlock id overflow");
  // The new block opens the same account set as its source (every block of a world
  // has the same set), through the ledger's id allocator; balances start at zero.
  const sourceAccounts = context.accountsByBlock.get(source.id) ?? [];
  if (sourceAccounts.length === 0) throw new RangeError(`popBlock ${String(source.id)} has no accounts`);
  const subtypes: AccountSubtype[] = [...new Set(sourceAccounts.map((account) => account.subtype))];
  const created: FinancialAccount[] = [];
  for (const subtype of subtypes) {
    const accountId = world.finance.nextAccountId;
    world.finance.nextAccountId += 1;
    const account: FinancialAccount = {
      id: accountId,
      ownerKind: "popBlock",
      ownerId: id,
      category: categoryForSubtype(subtype),
      subtype,
      balanceRUSD: 0,
    };
    world.finance.accounts.push(account);
    created.push(account);
  }
  context.accountsByBlock.set(id, created);
  const cash = created.find((account) => account.subtype === "household-cash");
  if (cash === undefined) throw new RangeError("new popBlock has no household cash account");
  const block: PopBlock = {
    id,
    provinceId,
    professionId,
    maleByAge: new Uint32Array(source.maleByAge.length),
    femaleByAge: new Uint32Array(source.femaleByAge.length),
    literacy: 0,
    literacyByAge: new Array<number>(source.literacyByAge.length).fill(0),
    qualification: source.qualification,
    wealthLevel: source.wealthLevel,
    financialAccountId: cash.id,
    militancy: source.militancy,
    unmetSubsistenceDays: source.unmetSubsistenceDays,
    unmetBasicDays: source.unmetBasicDays,
    comfortFulfilledDays: source.comfortFulfilledDays,
    fractionalBirthRemainder: 0,
    fractionalMaleBirthRemainder: 0,
    fractionalDeathRemainder: 0,
    urbanShare: 0,
    fertilityResidual: source.fertilityResidual,
    childMortalityResidual: source.childMortalityResidual,
    adultMortalityResidual: source.adultMortalityResidual,
    childMortalityLagged: source.childMortalityLagged,
    foodSufficiency: source.foodSufficiency,
    incomeSmoothedRUSDPerCapitaDay: source.incomeSmoothedRUSDPerCapitaDay,
    dwellings: 0,
    housingReferencePersonsPerDwelling: source.housingReferencePersonsPerDwelling,
    housingReferenceIncomeRUSDPerCapitaDay: source.housingReferenceIncomeRUSDPerCapitaDay,
  };
  world.labourMarket.nextPopBlockId = id + 1;
  world.popBlocks.push(block);
  province.popBlockIds.push(id);
  province.popBlockIds.sort((left, right) => left - right);
  context.blockByKey.set(blockKey(provinceId, professionId), block);
  context.blocksCreated += 1;
  return block;
}

/**
 * Move `count` people of `source` to the block of (province, profession), validated
 * before mutation; creates the destination when absent. Returns what moved.
 */
export function moveBlockPeople(
  context: ReclassifyContext,
  source: PopBlock,
  destinationProvinceId: Id,
  destinationProfessionId: Id,
  count: number,
  options: MoveOptions,
): MoveResult {
  const { world } = context;
  if (!Number.isInteger(count) || count <= 0) throw new RangeError("reclassification count must be a positive integer");
  if (source.provinceId === destinationProvinceId && source.professionId === destinationProfessionId) {
    throw new RangeError("reclassification source and destination are the same block");
  }
  for (const value of [options.destinationUrbanFraction, options.carriedDwellingShare]) {
    if (!Number.isFinite(value) || value < 0 || value > 1) throw new RangeError("reclassification shares must be in [0, 1]");
  }
  const sourceBefore = populationTotal(source);
  if (count > movablePeople(source, options.selectiveLiterate)) throw new RangeError("reclassification exceeds the movable people");
  const cells = splitCells(context, source, count, options.selectiveLiterate);
  let destination = context.blockByKey.get(blockKey(destinationProvinceId, destinationProfessionId));
  const created = destination === undefined;
  if (destination === undefined) destination = createBlock(context, source, destinationProvinceId, destinationProfessionId);
  const destinationBefore = populationTotal(destination);

  // Cash: pro-rata household cash, balanced posting.
  const sourceCash = householdCash(context, source.id);
  const destinationCash = householdCash(context, destination.id);
  const transfer = Math.max(0, Math.min(sourceCash.balanceRUSD, (sourceCash.balanceRUSD * count) / sourceBefore));
  if (transfer > sourceCash.balanceRUSD + MONEY_TOLERANCE_RUSD * Math.max(1, sourceCash.balanceRUSD)) {
    throw new RangeError("reclassification transfer exceeds the source's cash");
  }
  if (transfer > 0) {
    postJournalBatch(world.finance, context.dayIndex, [
      {
        transactionKind: "migration-transfer",
        lines: [
          { accountId: destinationCash.id, side: "debit", amountRUSD: transfer },
          { accountId: sourceCash.id, side: "credit", amountRUSD: transfer },
        ],
        sourceEntityId: source.id,
        targetEntityId: destination.id,
      },
    ]);
  }

  // Literacy by age (before the cells move).
  const ages = source.maleByAge.length;
  for (let age = 0; age < ages; age += 1) {
    const moved = (cells.male[age] ?? 0) + (cells.female[age] ?? 0);
    if (moved <= 0) continue;
    const sourcePersons = (source.maleByAge[age] ?? 0) + (source.femaleByAge[age] ?? 0);
    const destinationPersons = (destination.maleByAge[age] ?? 0) + (destination.femaleByAge[age] ?? 0);
    const sourceLiteracy = source.literacyByAge[age] ?? 0;
    const moverLiteracy = options.selectiveLiterate ? 1 : sourceLiteracy;
    if (options.selectiveLiterate) {
      const remaining = sourcePersons - moved;
      source.literacyByAge[age] = remaining > 0 ? Math.min(1, Math.max(0, (sourceLiteracy * sourcePersons - moved) / remaining)) : sourceLiteracy;
    }
    const total = destinationPersons + moved;
    destination.literacyByAge[age] = ((destination.literacyByAge[age] ?? 0) * destinationPersons + moverLiteracy * moved) / total;
  }

  // Urban persons (plan §6.5): movers leave the source pro rata (its share is
  // unchanged) and the caller's share of them live in towns at the destination.
  const destinationUrban = destination.urbanShare * destinationBefore + options.destinationUrbanFraction * count;
  // Dwellings (plan §6.4).
  const carried = source.dwellings > 0 && sourceBefore > 0 ? (source.dwellings * count * options.carriedDwellingShare) / sourceBefore : 0;

  // Attributes merged by person weight (plan §5.4 item 3); a created block took the source's.
  const weight = (value: number, incoming: number): number => (value * destinationBefore + incoming * count) / (destinationBefore + count);
  if (!created) {
    destination.wealthLevel = roundTo(Math.max(0, Math.min(99, weight(destination.wealthLevel, source.wealthLevel))), WEALTH_DECIMAL_PLACES);
    destination.militancy = roundTo(Math.max(0, Math.min(1, weight(destination.militancy, source.militancy))), RATE_DECIMAL_PLACES);
    destination.qualification = roundTo(Math.max(0, Math.min(1, weight(destination.qualification, source.qualification))), RATE_DECIMAL_PLACES);
    destination.incomeSmoothedRUSDPerCapitaDay = Math.max(0, weight(destination.incomeSmoothedRUSDPerCapitaDay, source.incomeSmoothedRUSDPerCapitaDay));
    destination.foodSufficiency = Math.max(0, Math.min(1, weight(destination.foodSufficiency, source.foodSufficiency)));
    destination.childMortalityLagged = Math.max(0, weight(destination.childMortalityLagged, source.childMortalityLagged));
  }

  for (let age = 0; age < ages; age += 1) {
    const male = cells.male[age] ?? 0;
    const female = cells.female[age] ?? 0;
    if ((source.maleByAge[age] ?? 0) < male || (source.femaleByAge[age] ?? 0) < female) {
      throw new RangeError("reclassification would make an age cell negative");
    }
    source.maleByAge[age] = (source.maleByAge[age] ?? 0) - male;
    source.femaleByAge[age] = (source.femaleByAge[age] ?? 0) - female;
    destination.maleByAge[age] = (destination.maleByAge[age] ?? 0) + male;
    destination.femaleByAge[age] = (destination.femaleByAge[age] ?? 0) + female;
  }
  syncBlockLiteracy(source);
  syncBlockLiteracy(destination);
  const destinationAfter = destinationBefore + count;
  destination.urbanShare = roundTo(Math.min(1, Math.max(0, destinationUrban / destinationAfter)), RATE_DECIMAL_PLACES);
  if (carried > 0) {
    source.dwellings = Math.max(0, source.dwellings - carried);
    destination.dwellings += carried;
  }
  if (populationTotal(source) !== sourceBefore - count || populationTotal(destination) !== destinationAfter) {
    throw new RangeError("reclassification did not conserve people");
  }
  let bySource = context.received.get(source.id);
  if (bySource === undefined) {
    bySource = new Map();
    context.received.set(source.id, bySource);
  }
  bySource.set(destination.id, (bySource.get(destination.id) ?? 0) + count);
  return { destination, created, people: count, cashRUSD: transfer, dwellings: carried };
}

/**
 * Retire every block with no people and no employment (plan §5.4 item 7). Returns the
 * number retired. Call after the month's employment refresh.
 */
export function retireEmptyBlocks(context: ReclassifyContext): number {
  const { world } = context;
  const employed = new Set<Id>();
  for (const assignment of world.employment) employed.add(assignment.popBlockId);
  for (const assignment of world.labourMarket.institutionEmployment) employed.add(assignment.popBlockId);
  const debtHolders = new Set<Id>();
  for (const contract of world.finance.debtContracts) {
    if (contract.holderKind === "popBlock" && (contract.status === "active" || contract.status === "arrears")) debtHolders.add(contract.holderId);
  }
  const strataByProfession = new Map(context.definitions.professions.map((profession) => [profession.id, profession.stratum]));
  const candidates = [...world.popBlocks]
    .filter((block) => populationTotal(block) === 0 && !employed.has(block.id) && !debtHolders.has(block.id))
    .sort((left, right) => left.id - right.id);
  if (candidates.length === 0) return 0;
  const retired = new Set<Id>();
  for (const block of candidates) {
    const accounts = context.accountsByBlock.get(block.id) ?? [];
    if (accounts.some((account) => account.category === "asset" && account.subtype !== "household-cash" && Math.abs(account.balanceRUSD) > 0)) continue;
    // Recipient: the block that received most of its people this month, else the
    // province's most populous block of the same stratum, else its most populous block.
    let recipient: PopBlock | undefined;
    const received = context.received.get(block.id);
    if (received !== undefined) {
      let best = -1;
      for (const [destinationId, people] of [...received].sort((left, right) => left[0] - right[0])) {
        if (people > best && !retired.has(destinationId)) {
          const candidate = world.popBlocks.find((entry) => entry.id === destinationId);
          if (candidate !== undefined && populationTotal(candidate) > 0) {
            best = people;
            recipient = candidate;
          }
        }
      }
    }
    if (recipient === undefined) {
      const provinceBlocks = world.popBlocks
        .filter((entry) => entry.provinceId === block.provinceId && entry.id !== block.id && !retired.has(entry.id) && populationTotal(entry) > 0)
        .sort((left, right) => populationTotal(right) - populationTotal(left) || left.id - right.id);
      const stratum = strataByProfession.get(block.professionId);
      recipient = provinceBlocks.find((entry) => strataByProfession.get(entry.professionId) === stratum) ?? provinceBlocks[0];
    }
    if (recipient === undefined) continue; // nobody to inherit: the empty block stays
    const cash = householdCash(context, block.id);
    const recipientCash = householdCash(context, recipient.id);
    if (cash.balanceRUSD < 0) continue;
    if (cash.balanceRUSD > 0) {
      postJournalBatch(world.finance, context.dayIndex, [
        {
          transactionKind: "migration-transfer",
          lines: [
            { accountId: recipientCash.id, side: "debit", amountRUSD: cash.balanceRUSD },
            { accountId: cash.id, side: "credit", amountRUSD: cash.balanceRUSD },
          ],
          sourceEntityId: block.id,
          targetEntityId: recipient.id,
        },
      ]);
    }
    for (const building of world.buildings) {
      if (building.ownerAccountId === block.financialAccountId) building.ownerAccountId = recipient.financialAccountId;
    }
    if (block.dwellings > 0) {
      recipient.dwellings += block.dwellings;
      block.dwellings = 0;
    }
    retired.add(block.id);
  }
  if (retired.size === 0) return 0;
  world.popBlocks = world.popBlocks.filter((block) => !retired.has(block.id));
  for (const province of world.provinceEconomies) {
    if (province.popBlockIds.some((id) => retired.has(id))) province.popBlockIds = province.popBlockIds.filter((id) => !retired.has(id));
  }
  for (const [key, block] of context.blockByKey) if (retired.has(block.id)) context.blockByKey.delete(key);
  world.labourMarket.retiredPopBlockIds = [...world.labourMarket.retiredPopBlockIds, ...retired].sort((left, right) => left - right);
  return retired.size;
}
