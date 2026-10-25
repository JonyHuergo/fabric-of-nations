/**
 * Structural validation for M3 runtime economy state.
 *
 * Economically valid failures (unqualified populations, unstaffed buildings) are
 * not rejected here. Only malformed state, broken references, invalid ranges, and
 * accounting violations are.
 */

import { assertValidDayIndex } from "../calendar.js";
import { MONEY_TOLERANCE_SUSD } from "../population/constants.js";
import { workingAgePopulation } from "../population/state.js";
import {
  requireArray,
  requireFiniteNumber,
  requireInteger,
  requireRecord,
} from "../validation.js";
import type { World } from "../world.js";
import { MAX_AUDIT_POSTINGS } from "./constants.js";
import {
  TRANSACTION_KINDS,
  type BuildingInstance,
  type EmploymentAssignment,
  type FinanceState,
  type FinancialAccount,
  type FinancialAccountKind,
  type FinancialAccountOwnerKind,
  type JournalLine,
  type JournalPosting,
  type Market,
  type StockLot,
} from "./types.js";

function assertAccountOwnerKind(value: unknown, path: string): FinancialAccountOwnerKind {
  if (value !== "popBlock" && value !== "building" && value !== "system") {
    throw new RangeError(`${path} must be popBlock, building, or system`);
  }
  return value;
}

function assertAccountKind(value: unknown, path: string): FinancialAccountKind {
  if (value !== "household" && value !== "operating" && value !== "system-reserve") {
    throw new RangeError(`${path} must be household, operating, or system-reserve`);
  }
  return value;
}

export function assertValidFinancialAccount(account: FinancialAccount): void {
  const record = requireRecord(account, "finance.accounts[]");
  const id = requireInteger(record.id, "finance.accounts[].id", 0, 0xffff_ffff);
  const ownerKind = assertAccountOwnerKind(record.ownerKind, "finance.accounts[].ownerKind");
  const accountKind = assertAccountKind(record.accountKind, "finance.accounts[].accountKind");
  const ownerId =
    record.ownerId === null
      ? null
      : requireInteger(record.ownerId, "finance.accounts[].ownerId", 0, 0xffff_ffff);
  const balance = requireFiniteNumber(record.balanceSUSD, "finance.accounts[].balanceSUSD");
  if (balance < 0) throw new RangeError(`finance account ${String(id)} has a negative balance`);

  if (accountKind === "household") {
    if (ownerKind !== "popBlock" || ownerId === null) {
      throw new RangeError("household accounts must be owned by a popBlock");
    }
  } else if (accountKind === "operating") {
    if (ownerKind !== "building" || ownerId === null) {
      throw new RangeError("operating accounts must be owned by a building");
    }
  } else if (ownerKind !== "system" || ownerId !== null) {
    throw new RangeError("system-reserve accounts must be owned by the system with ownerId null");
  }
}

function assertPostingLine(
  value: unknown,
  path: string,
  accounts: ReadonlyMap<number, FinancialAccount>,
): number {
  const record = requireRecord(value, path);
  const accountId = requireInteger(record.accountId, `${path}.accountId`, 0, 0xffff_ffff);
  if (!accounts.has(accountId)) {
    throw new RangeError(`${path} references unknown account ${String(accountId)}`);
  }
  if (record.side !== "debit" && record.side !== "credit") {
    throw new RangeError(`${path}.side must be debit or credit`);
  }
  const amount = requireFiniteNumber(record.amountSUSD, `${path}.amountSUSD`);
  if (!(amount > 0)) throw new RangeError(`${path}.amountSUSD must be strictly positive`);
  return record.side === "debit" ? amount : -amount;
}

export function assertValidJournalPosting(
  posting: JournalPosting,
  accounts: ReadonlyMap<number, FinancialAccount>,
  path = "finance.postings[]",
): void {
  const record = requireRecord(posting, path);
  requireInteger(record.id, `${path}.id`, 1, Number.MAX_SAFE_INTEGER);
  const lines = requireArray(record.lines, `${path}.lines`);
  if (lines.length === 0) throw new RangeError(`${path}.lines must not be empty`);
  assertValidDayIndex(record.dayIndex as number);
  if (!(TRANSACTION_KINDS as readonly string[]).includes(record.transactionKind as string)) {
    throw new RangeError(`${path}.transactionKind is invalid`);
  }
  let debits = 0;
  let credits = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const signed = assertPostingLine(lines[index], `${path}.lines[${String(index)}]`, accounts);
    if (signed > 0) debits += signed;
    else credits += -signed;
  }
  if (Math.abs(debits - credits) > MONEY_TOLERANCE_SUSD) {
    throw new RangeError(
      `${path} is unbalanced: debits ${String(debits)} != credits ${String(credits)}`,
    );
  }
  if (record.sourceEntityId !== null) {
    requireInteger(record.sourceEntityId, `${path}.sourceEntityId`, 0, 0xffff_ffff);
  }
  if (record.targetEntityId !== null) {
    requireInteger(record.targetEntityId, `${path}.targetEntityId`, 0, 0xffff_ffff);
  }
}

export function assertValidFinanceState(finance: FinanceState): void {
  const record = requireRecord(finance, "world.finance");
  const rawAccounts = requireArray(record.accounts, "world.finance.accounts");
  const accounts = new Map<number, FinancialAccount>();
  const householdOwners = new Set<number>();
  const buildingOwners = new Set<number>();
  for (const value of rawAccounts) {
    const account = value as FinancialAccount;
    assertValidFinancialAccount(account);
    if (accounts.has(account.id)) {
      throw new RangeError(`duplicate finance account id ${String(account.id)}`);
    }
    accounts.set(account.id, account);
    if (account.accountKind === "household" && account.ownerId !== null) {
      if (householdOwners.has(account.ownerId)) {
        throw new RangeError(`popBlock ${String(account.ownerId)} has multiple household accounts`);
      }
      householdOwners.add(account.ownerId);
    }
    if (account.accountKind === "operating" && account.ownerId !== null) {
      if (buildingOwners.has(account.ownerId)) {
        throw new RangeError(`building ${String(account.ownerId)} has multiple operating accounts`);
      }
      buildingOwners.add(account.ownerId);
    }
  }

  const rawPostings = requireArray(record.postings, "world.finance.postings");
  if (rawPostings.length > MAX_AUDIT_POSTINGS) {
    throw new RangeError(
      `world.finance.postings must contain at most ${String(MAX_AUDIT_POSTINGS)} entries`,
    );
  }
  const postingIds = new Set<number>();
  let maxPostingId = 0;
  for (let index = 0; index < rawPostings.length; index += 1) {
    const posting = rawPostings[index] as JournalPosting;
    assertValidJournalPosting(
      posting,
      accounts,
      `world.finance.postings[${String(index)}]`,
    );
    if (postingIds.has(posting.id)) {
      throw new RangeError(`duplicate journal posting id ${String(posting.id)}`);
    }
    postingIds.add(posting.id);
    maxPostingId = Math.max(maxPostingId, posting.id);
  }
  const nextPostingId = requireInteger(
    record.nextPostingId,
    "world.finance.nextPostingId",
    1,
    Number.MAX_SAFE_INTEGER,
  );
  if (nextPostingId <= maxPostingId) {
    throw new RangeError("world.finance.nextPostingId must be greater than every posting id");
  }
}

function assertValidBuilding(building: BuildingInstance): void {
  const record = requireRecord(building, "world.buildings[]");
  requireInteger(record.id, "world.buildings[].id", 0, 0xffff_ffff);
  requireInteger(record.definitionId, "world.buildings[].definitionId", 0, 0xffff_ffff);
  requireInteger(record.regionId, "world.buildings[].regionId", 0, 0xffff_ffff);
  requireInteger(record.level, "world.buildings[].level", 1, Number.MAX_SAFE_INTEGER);
  const condition = requireFiniteNumber(record.condition, "world.buildings[].condition");
  if (condition < 0 || condition > 1) {
    throw new RangeError("world.buildings[].condition must be in 0..1");
  }
  if (record.ownerKind !== "private") {
    throw new RangeError("M3 buildings must have private ownership");
  }
  requireInteger(record.ownerAccountId, "world.buildings[].ownerAccountId", 0, 0xffff_ffff);
  assertValidDayIndex(record.builtOnDay as number);
  if (typeof record.operational !== "boolean") {
    throw new TypeError("world.buildings[].operational must be a boolean");
  }
  requireInteger(
    record.operatingCashAccountId,
    "world.buildings[].operatingCashAccountId",
    0,
    0xffff_ffff,
  );
}

function assertValidEmployment(assignment: EmploymentAssignment): void {
  const record = requireRecord(assignment, "world.employment[]");
  requireInteger(record.id, "world.employment[].id", 0, 0xffff_ffff);
  requireInteger(record.popBlockId, "world.employment[].popBlockId", 0, 0xffff_ffff);
  requireInteger(
    record.buildingInstanceId,
    "world.employment[].buildingInstanceId",
    0,
    0xffff_ffff,
  );
  requireInteger(record.professionId, "world.employment[].professionId", 0, 0xffff_ffff);
  requireInteger(record.workers, "world.employment[].workers", 1, Number.MAX_SAFE_INTEGER);
}

function assertValidLot(
  lot: StockLot,
  path: string,
  buildingIds: ReadonlySet<number>,
  goodCount: number,
): void {
  const record = requireRecord(lot, path);
  const goodId = requireInteger(record.goodId, `${path}.goodId`, 0, 0xffff_ffff);
  if (goodId >= goodCount) {
    throw new RangeError(`${path}.goodId ${String(goodId)} is outside the market price range`);
  }
  const ownerBuildingId = requireInteger(
    record.ownerBuildingId,
    `${path}.ownerBuildingId`,
    0,
    0xffff_ffff,
  );
  if (!buildingIds.has(ownerBuildingId)) {
    throw new RangeError(`${path} references unknown owner building ${String(ownerBuildingId)}`);
  }
  const quantity = requireFiniteNumber(record.quantity, `${path}.quantity`);
  if (!(quantity > 0)) throw new RangeError(`${path}.quantity must be strictly positive`);
}

function assertValidMarket(
  market: Market,
  path: string,
  regionIds: ReadonlySet<number>,
  buildingIds: ReadonlySet<number>,
): void {
  const record = requireRecord(market, path);
  requireInteger(record.id, `${path}.id`, 0, 0xffff_ffff);
  const rawRegionIds = requireArray(record.regionIds, `${path}.regionIds`);
  if (rawRegionIds.length === 0) {
    throw new RangeError(`${path}.regionIds must contain at least one region`);
  }
  const seenRegions = new Set<number>();
  for (let index = 0; index < rawRegionIds.length; index += 1) {
    const regionId = requireInteger(
      rawRegionIds[index],
      `${path}.regionIds[${String(index)}]`,
      0,
      0xffff_ffff,
    );
    if (!regionIds.has(regionId)) {
      throw new RangeError(`${path}.regionIds references unknown region ${String(regionId)}`);
    }
    if (seenRegions.has(regionId)) {
      throw new RangeError(`${path}.regionIds contains duplicate region ${String(regionId)}`);
    }
    seenRegions.add(regionId);
  }

  const rawPrices = requireArray(record.priceSUSD, `${path}.priceSUSD`);
  if (rawPrices.length === 0) throw new RangeError(`${path}.priceSUSD must not be empty`);
  for (let index = 0; index < rawPrices.length; index += 1) {
    const price = requireFiniteNumber(rawPrices[index], `${path}.priceSUSD[${String(index)}]`);
    if (!(price > 0)) throw new RangeError(`${path}.priceSUSD[${String(index)}] must be positive`);
  }

  const rawLots = requireArray(record.stockLots, `${path}.stockLots`);
  const lots = new Set<string>();
  for (let index = 0; index < rawLots.length; index += 1) {
    const lot = rawLots[index] as StockLot;
    assertValidLot(lot, `${path}.stockLots[${String(index)}]`, buildingIds, rawPrices.length);
    const key = `${String(lot.goodId)}:${String(lot.ownerBuildingId)}`;
    if (lots.has(key)) {
      throw new RangeError(
        `${path}.stockLots contains duplicate lot for good ${String(lot.goodId)} owner ${String(lot.ownerBuildingId)}`,
      );
    }
    lots.add(key);
  }
}

/** Validate M3 collections and their cross-references. */
export function assertValidEconomyState(world: World): void {
  assertValidFinanceState(world.finance);

  const rawBuildings = requireArray(world.buildings, "world.buildings");
  const buildingById = new Map<number, BuildingInstance>();
  for (const value of rawBuildings) {
    const building = value as BuildingInstance;
    assertValidBuilding(building);
    if (buildingById.has(building.id)) {
      throw new RangeError(`duplicate building instance id ${String(building.id)}`);
    }
    buildingById.set(building.id, building);
  }

  const popBlockIds = new Set<number>(world.popBlocks.map((block) => block.id));
  for (const account of world.finance.accounts) {
    if (account.accountKind === "operating") {
      if (account.ownerId === null || !buildingById.has(account.ownerId)) {
        throw new RangeError(
          `operating account ${String(account.id)} references unknown building owner`,
        );
      }
    } else if (account.accountKind === "household") {
      if (account.ownerId === null || !popBlockIds.has(account.ownerId)) {
        throw new RangeError(
          `household account ${String(account.id)} references unknown popBlock owner`,
        );
      }
    }
  }

  const rawAssignments = requireArray(world.employment, "world.employment");
  const assignmentIds = new Set<number>();
  const assignmentKeys = new Set<string>();
  const assignedByBlock = new Map<number, number>();
  for (const value of rawAssignments) {
    const assignment = value as EmploymentAssignment;
    assertValidEmployment(assignment);
    if (assignmentIds.has(assignment.id)) {
      throw new RangeError(`duplicate employment assignment id ${String(assignment.id)}`);
    }
    assignmentIds.add(assignment.id);
    const key = `${String(assignment.popBlockId)}:${String(assignment.buildingInstanceId)}:${String(assignment.professionId)}`;
    if (assignmentKeys.has(key)) {
      throw new RangeError("duplicate employment assignment for the same block/building/profession");
    }
    assignmentKeys.add(key);
    const building = buildingById.get(assignment.buildingInstanceId);
    if (building === undefined) {
      throw new RangeError(
        `employment assignment references unknown building ${String(assignment.buildingInstanceId)}`,
      );
    }
    if (!building.operational) {
      throw new RangeError("employment assignment references a non-operational building");
    }
    const block = world.popBlocks.find((candidate) => candidate.id === assignment.popBlockId);
    if (block === undefined) {
      throw new RangeError(
        `employment assignment references unknown popBlock ${String(assignment.popBlockId)}`,
      );
    }
    assignedByBlock.set(
      assignment.popBlockId,
      (assignedByBlock.get(assignment.popBlockId) ?? 0) + assignment.workers,
    );
  }
  for (const [blockId, assigned] of assignedByBlock) {
    const block = world.popBlocks.find((candidate) => candidate.id === blockId);
    if (block === undefined) throw new RangeError(`unknown popBlock ${String(blockId)}`);
    if (assigned > workingAgePopulation(block)) {
      throw new RangeError(
        `popBlock ${String(blockId)} is assigned ${String(assigned)} workers but has only ${String(workingAgePopulation(block))} working-age people`,
      );
    }
  }

  const rawMarkets = requireArray(world.markets, "world.markets");
  if (rawMarkets.length > 1) throw new RangeError("M3 supports at most one market");
  const regionIds = new Set<number>(world.regions.map((region) => region.id));
  const marketIds = new Set<number>();
  const buildingIds = new Set<number>(buildingById.keys());
  for (const value of rawMarkets) {
    const market = value as Market;
    assertValidMarket(market, "world.markets[]", regionIds, buildingIds);
    if (marketIds.has(market.id)) {
      throw new RangeError(`duplicate market id ${String(market.id)}`);
    }
    marketIds.add(market.id);
  }

  const market = world.markets[0];
  for (const region of world.regions) {
    if (market === undefined) {
      if (region.marketId !== null) {
        throw new RangeError(`region ${String(region.id)} references a market but none exists`);
      }
      if (region.buildingInstanceIds.length > 0) {
        throw new RangeError(`region ${String(region.id)} has buildings but no market`);
      }
    } else {
      if (region.marketId !== market.id) {
        throw new RangeError(`region ${String(region.id)} marketId does not match the market`);
      }
      if (!market.regionIds.includes(region.id)) {
        throw new RangeError(`market ${String(market.id)} does not list region ${String(region.id)}`);
      }
    }
    const expectedBuildings = [...rawBuildings]
      .map((value) => value as BuildingInstance)
      .filter((building) => building.regionId === region.id)
      .map((building) => building.id)
      .sort((left, right) => left - right);
    const actualBuildings = [...region.buildingInstanceIds].sort((left, right) => left - right);
    if (
      expectedBuildings.length !== actualBuildings.length ||
      expectedBuildings.some((id, index) => id !== actualBuildings[index])
    ) {
      throw new RangeError(`region ${String(region.id)} buildingInstanceIds do not match its buildings`);
    }
    for (const buildingId of region.buildingInstanceIds) {
      if (!buildingIds.has(buildingId)) {
        throw new RangeError(
          `region ${String(region.id)} references unknown building ${String(buildingId)}`,
        );
      }
    }
  }

  for (const building of buildingById.values()) {
    if (!regionIds.has(building.regionId)) {
      throw new RangeError(
        `building ${String(building.id)} references unknown region ${String(building.regionId)}`,
      );
    }
    const ownerAccount = world.finance.accounts.find(
      (account) => account.id === building.ownerAccountId,
    );
    if (ownerAccount === undefined) {
      throw new RangeError(`building ${String(building.id)} references unknown owner account`);
    }
    if (ownerAccount.accountKind !== "household") {
      throw new RangeError(`building ${String(building.id)} owner account must be a household`);
    }
    const operatingAccount = world.finance.accounts.find(
      (account) => account.id === building.operatingCashAccountId,
    );
    if (operatingAccount === undefined) {
      throw new RangeError(`building ${String(building.id)} references unknown operating account`);
    }
    if (operatingAccount.accountKind !== "operating" || operatingAccount.ownerId !== building.id) {
      throw new RangeError(
        `building ${String(building.id)} operating account must be an operating account owned by it`,
      );
    }
  }
}

/** Export for tests and scenario validation. */
export { assertValidMarket, assertValidBuilding, assertValidEmployment };
export type { FinancialAccount, JournalLine };
