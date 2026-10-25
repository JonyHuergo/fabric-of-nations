/**
 * Structural validation for M3/M4a-1 runtime economy state.
 *
 * Economically valid failures (unqualified populations, unstaffed buildings) are
 * not rejected here. Only malformed state, broken references, invalid ranges,
 * category violations, and accounting invariant violations are.
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
import {
  assertAccountingIdentity,
  assertValidAccountCategory,
  assertValidAccountSubtype,
  assertValidOpeningRecord,
  buildFinanceIndex,
  categoryAllowsNegativeBalance,
  categoryForSubtype,
  isCashAccount,
  subtypeAllowsOwnerKind,
  transactionKindChangesCash,
} from "./accounts.js";
import { assertValidCountryCurrencyState } from "./country.js";
import { MAX_AUDIT_POSTINGS } from "./constants.js";
import {
  TRANSACTION_KINDS,
  type BuildingInstance,
  type EmploymentAssignment,
  type FinanceState,
  type FinancialAccount,
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

export function assertValidFinancialAccount(account: FinancialAccount): void {
  const record = requireRecord(account, "finance.accounts[]");
  const id = requireInteger(record.id, "finance.accounts[].id", 0, 0xffff_ffff);
  const ownerKind = assertAccountOwnerKind(record.ownerKind, "finance.accounts[].ownerKind");
  const category = record.category;
  assertValidAccountCategory(category);
  const subtype = record.subtype;
  assertValidAccountSubtype(subtype);
  const expectedCategory = categoryForSubtype(subtype);
  if (category !== expectedCategory) {
    throw new RangeError(
      `finance account ${String(id)} category ${JSON.stringify(category)} does not match subtype ${JSON.stringify(subtype)} (${expectedCategory})`,
    );
  }
  if (!subtypeAllowsOwnerKind(subtype, ownerKind)) {
    throw new RangeError(
      `finance account ${String(id)} subtype ${JSON.stringify(subtype)} cannot be owned by ${ownerKind}`,
    );
  }
  const ownerId =
    record.ownerId === null
      ? null
      : requireInteger(record.ownerId, "finance.accounts[].ownerId", 0, 0xffff_ffff);
  const balance = requireFiniteNumber(record.balanceSUSD, "finance.accounts[].balanceSUSD");

  if (ownerKind === "system") {
    if (ownerId !== null) {
      throw new RangeError(`system account ${String(id)} must have ownerId null`);
    }
  } else if (ownerId === null) {
    throw new RangeError(`finance account ${String(id)} requires an ownerId for ${ownerKind}`);
  }
  if (isCashAccount(account) && ownerKind === "system" && ownerId !== null) {
    throw new RangeError(`system cash account ${String(id)} must have ownerId null`);
  }
  if (!categoryAllowsNegativeBalance(category) && balance < 0) {
    throw new RangeError(`finance account ${String(id)} has a negative ${category} balance`);
  }
}

interface PostingLineDelta {
  readonly debit: number;
  readonly credit: number;
  /** Signed change in the account's normal-side balance. */
  readonly normalDelta: number;
  readonly cashDelta: number;
}

function assertPostingLine(
  value: unknown,
  path: string,
  accounts: ReadonlyMap<number, FinancialAccount>,
): PostingLineDelta {
  const record = requireRecord(value, path);
  const accountId = requireInteger(record.accountId, `${path}.accountId`, 0, 0xffff_ffff);
  const account = accounts.get(accountId);
  if (account === undefined) {
    throw new RangeError(`${path} references unknown account ${String(accountId)}`);
  }
  if (record.side !== "debit" && record.side !== "credit") {
    throw new RangeError(`${path}.side must be debit or credit`);
  }
  const amount = requireFiniteNumber(record.amountSUSD, `${path}.amountSUSD`);
  if (!(amount > 0)) throw new RangeError(`${path}.amountSUSD must be strictly positive`);
  const normalSide = account.category === "asset" || account.category === "expense" ? "debit" : "credit";
  const normalDelta = record.side === normalSide ? amount : -amount;
  return {
    debit: record.side === "debit" ? amount : 0,
    credit: record.side === "credit" ? amount : 0,
    normalDelta,
    cashDelta: isCashAccount(account) ? normalDelta : 0,
  };
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
  let cashDelta = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const line = assertPostingLine(lines[index], `${path}.lines[${String(index)}]`, accounts);
    debits += line.debit;
    credits += line.credit;
    cashDelta += line.cashDelta;
  }
  if (Math.abs(debits - credits) > MONEY_TOLERANCE_SUSD) {
    throw new RangeError(
      `${path} is unbalanced: debits ${String(debits)} != credits ${String(credits)}`,
    );
  }
  if (transactionKindChangesCash(record.transactionKind as string)) {
    throw new RangeError(`${path}.transactionKind is not implemented in M4a-1`);
  }
  if (Math.abs(cashDelta) > MONEY_TOLERANCE_SUSD * Math.max(1, Math.abs(cashDelta))) {
    throw new RangeError(
      `${path} changes aggregate designated cash by ${String(cashDelta)} under a cash-neutral transaction kind`,
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
  const ownerKeys = new Set<string>();
  let maxAccountId = 0;
  for (const value of rawAccounts) {
    const account = value as FinancialAccount;
    assertValidFinancialAccount(account);
    if (accounts.has(account.id)) {
      throw new RangeError(`duplicate finance account id ${String(account.id)}`);
    }
    accounts.set(account.id, account);
    maxAccountId = Math.max(maxAccountId, account.id);
    const key = `${account.ownerKind}:${account.ownerId === null ? "-" : String(account.ownerId)}:${account.subtype}`;
    if (ownerKeys.has(key)) {
      throw new RangeError(
        `duplicate ${account.subtype} account for ${account.ownerKind} ${String(account.ownerId)}`,
      );
    }
    ownerKeys.add(key);
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
  const nextAccountId = requireInteger(
    record.nextAccountId,
    "world.finance.nextAccountId",
    1,
    Number.MAX_SAFE_INTEGER,
  );
  if (nextAccountId <= maxAccountId) {
    throw new RangeError("world.finance.nextAccountId must be greater than every account id");
  }

  const opening = record.opening as FinanceState["opening"];
  if (opening === null || opening === undefined) {
    for (const account of accounts.values()) {
      if (account.balanceSUSD !== 0) {
        throw new RangeError(
          `world.finance.opening is required when account ${String(account.id)} has a non-zero balance`,
        );
      }
    }
  } else {
    assertValidOpeningRecord(opening);
  }

  assertAccountingIdentity(finance);
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

function assertOwnerAccountSets(world: World, index: ReturnType<typeof buildFinanceIndex>): void {
  for (const block of world.popBlocks) {
    for (const subtype of ["owner-equity", "wage-income", "consumption-expense"] as const) {
      index.get("popBlock", block.id, subtype);
    }
  }
  for (const building of world.buildings) {
    for (const subtype of [
      "owner-equity",
      "sales-revenue",
      "input-expense",
      "wage-expense",
      "upkeep-expense",
    ] as const) {
      index.get("building", building.id, subtype);
    }
  }
  for (const account of world.finance.accounts) {
    if (account.ownerKind !== "system" || account.subtype !== "system-reserve-cash") continue;
    for (const subtype of ["owner-equity", "system-income"] as const) {
      index.get("system", null, subtype);
    }
  }
}

/** Validate M3/M4a-1 collections and their cross-references. */
export function assertValidEconomyState(world: World): void {
  assertValidFinanceState(world.finance);
  const accounts = buildFinanceIndex(world.finance);
  if (world.finance.opening !== null && world.finance.opening.dayIndex !== world.startDayIndex) {
    throw new RangeError("world.finance.opening.dayIndex must equal world.startDayIndex");
  }

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
  // Generic owner-reference invariant: every owner-owned account must point at
  // an existing owner, regardless of subtype or category. This intentionally
  // covers all current and future building-owned account roles.
  for (const account of world.finance.accounts) {
    if (account.ownerKind === "building") {
      if (account.ownerId === null || !buildingById.has(account.ownerId)) {
        throw new RangeError(
          `building-owned ${account.subtype} account ${String(account.id)} references unknown building owner ${String(account.ownerId)}`,
        );
      }
    } else if (account.ownerKind === "popBlock") {
      if (account.ownerId === null || !popBlockIds.has(account.ownerId)) {
        throw new RangeError(
          `popBlock-owned ${account.subtype} account ${String(account.id)} references unknown popBlock owner ${String(account.ownerId)}`,
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
    const ownerAccount = accounts.byId.get(building.ownerAccountId);
    if (ownerAccount === undefined) {
      throw new RangeError(`building ${String(building.id)} references unknown owner account`);
    }
    if (ownerAccount.subtype !== "household-cash") {
      throw new RangeError(`building ${String(building.id)} owner account must be household cash`);
    }
    const operatingAccount = accounts.byId.get(building.operatingCashAccountId);
    if (operatingAccount === undefined) {
      throw new RangeError(`building ${String(building.id)} references unknown operating account`);
    }
    if (operatingAccount.subtype !== "operating-cash" || operatingAccount.ownerId !== building.id) {
      throw new RangeError(
        `building ${String(building.id)} operating account must be an operating account owned by it`,
      );
    }
  }

  assertOwnerAccountSets(world, accounts);
  assertValidCountryCurrencyState({
    countries: world.countries,
    currencies: world.currencies,
    currencyValuations: world.currencyValuations,
    regionIds,
    expectedStartDay: world.startDayIndex,
  });
}

/** Export for tests and scenario validation. */
export { assertValidMarket, assertValidBuilding, assertValidEmployment };
export type { FinancialAccount, JournalLine };
