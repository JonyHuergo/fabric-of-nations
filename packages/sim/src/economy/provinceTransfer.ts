/**
 * P2 conserving provincial ownership transfer (D-118 §4, D-119).
 *
 * A legal ownership change moves a province — with its population blocks,
 * buildings and the stock those buildings hold — into the receiving country's
 * customs territory in one validated operation:
 *
 * 1. Every non-terminal construction project of another country in the province
 *    is cancelled first through the E3 cancellation path (its work in progress is
 *    written off), because a country cannot build on land it no longer owns.
 * 2. Political ownership changes through `transferProvinceOwnership` (owner and
 *    controller become the recipient; one audit record).
 * 3. When the recipient's customs territory differs, `ProvinceEconomy.marketId`
 *    is rewritten and every stock lot owned by a building in the province moves
 *    to the new market pool, merged by (good, owner). Quantities are unchanged.
 * 4. Employment assignments that the new border closes (a worker and a building on
 *    different sides without open immigration) are released; the people stay in
 *    their blocks and employment is marked dirty for the next refresh.
 *
 * Accounts, balances, people and buildings never change: cash, population and
 * goods are conserved exactly, and the result is checked with whole-world
 * validation before it is published. Transfers to a registry polity with no
 * simulation country are rejected (D-118 §4) until a country-instantiation stage
 * exists. On any failure the world is left unchanged.
 */

import type { Day, Id } from "../types.js";
import { assertValidWorld, type World } from "../world.js";
import { transferProvinceOwnership } from "../provinces/state.js";
import type { ProvinceTransferKind, ProvinceTransferRecord } from "../provinces/types.js";
import { cancelConstruction } from "./construction.js";
import { constructionProjectIsTerminal } from "./constructionModel.js";
import { buildProvinceOwnerMap } from "./country.js";
import { laborAccessAllowed } from "./employment.js";
import { canonicalizeStockLots } from "./inventory.js";

export interface ProvinceCountryTransferRequest {
  readonly provinceIds: readonly Id[];
  readonly toCountryId: Id;
  readonly kind: ProvinceTransferKind;
  readonly day: Day;
  readonly note: string;
}

export interface ProvinceCountryTransferResult {
  readonly record: ProvinceTransferRecord;
  /** Construction projects cancelled because their province changed owner. */
  readonly cancelledProjectIds: readonly Id[];
  /** Stock lots moved between markets (count of lots before merging). */
  readonly movedLotCount: number;
  /** Employment assignments released by the new border. */
  readonly releasedAssignmentIds: readonly Id[];
}

/** The market of the recipient's customs territory: the market of its other provinces. */
function recipientMarketId(world: World, toCountryId: Id, moving: ReadonlySet<Id>): Id | null {
  const owners = buildProvinceOwnerMap(world);
  let marketId: Id | null | undefined;
  for (const province of world.provinceEconomies) {
    if (moving.has(province.id) || owners.get(province.id) !== toCountryId) continue;
    if (marketId === undefined) marketId = province.marketId;
    else if (marketId !== province.marketId) {
      throw new RangeError(`country ${String(toCountryId)} spans more than one customs territory`);
    }
  }
  if (marketId === undefined) {
    throw new RangeError(
      `country ${String(toCountryId)} owns no other province, so it has no customs territory to receive the transfer`,
    );
  }
  return marketId;
}

/**
 * Transfer the legal ownership of provinces to a simulation country, moving their
 * economy into its customs territory. Conserves people, cash and goods exactly.
 */
export function transferProvincesToCountry(
  world: World,
  request: ProvinceCountryTransferRequest,
): ProvinceCountryTransferResult {
  if (!world.provinces.enabled) {
    throw new RangeError("provincial ownership is not enabled in this world");
  }
  if (!world.countries.some((country) => country.id === request.toCountryId)) {
    throw new RangeError(
      `polity ${String(request.toCountryId)} is not a simulation country; transfers to non-instantiated polities are rejected (D-118)`,
    );
  }
  if (request.provinceIds.length === 0) throw new RangeError("provinceIds must not be empty");
  const moving = new Set(request.provinceIds);
  for (const provinceId of moving) {
    if (!world.provinceEconomies.some((province) => province.id === provinceId)) {
      throw new RangeError(`unknown province ${String(provinceId)}`);
    }
  }
  const targetMarketId = recipientMarketId(world, request.toCountryId, moving);

  // Cancellation replaces (never mutates) `world.finance` and `world.construction`,
  // so keeping the references is enough to restore them if a later step fails.
  const savedFinance = world.finance;
  const savedConstruction = world.construction;
  try {
    return applyTransfer(world, request, moving, targetMarketId);
  } catch (error) {
    world.finance = savedFinance;
    world.construction = savedConstruction;
    throw error;
  }
}

function applyTransfer(
  world: World,
  request: ProvinceCountryTransferRequest,
  moving: ReadonlySet<Id>,
  targetMarketId: Id | null,
): ProvinceCountryTransferResult {
  // 1. Cancel other countries' projects on the moving land, on the valid pre-transfer world.
  const cancelledProjectIds: Id[] = [];
  const projects = world.construction.projects
    .filter(
      (project) =>
        moving.has(project.provinceId) &&
        project.countryId !== request.toCountryId &&
        !constructionProjectIsTerminal(project.status),
    )
    .sort((left, right) => left.id - right.id);
  for (const project of projects) {
    cancelConstruction(world, { countryId: project.countryId, projectId: project.id }, request.day);
    cancelledProjectIds.push(project.id);
  }

  // Stage the parts the transfer mutates so a validation failure leaves the world unchanged.
  const staged: World = {
    ...world,
    provinces: {
      ...world.provinces,
      ownership: world.provinces.ownership.map((entry) => ({
        ...entry,
        claimantPolityIds: [...entry.claimantPolityIds],
      })),
      transfers: [...world.provinces.transfers],
    },
    provinceEconomies: world.provinceEconomies.map((province) =>
      moving.has(province.id) ? { ...province } : province,
    ),
    markets: world.markets.map((market) => ({ ...market, stockLots: [...market.stockLots] })),
    employment: [...world.employment],
  };

  // 2. Legal ownership and control.
  const record = transferProvinceOwnership(staged, {
    provinceIds: [...moving],
    toPolityId: request.toCountryId,
    kind: request.kind,
    day: request.day,
    note: request.note,
  });

  // 3. Customs territory and stock.
  let movedLotCount = 0;
  const movingBuildings = new Set<Id>();
  for (const building of staged.buildings) {
    if (moving.has(building.provinceId)) movingBuildings.add(building.id);
  }
  const target = staged.markets.find((market) => market.id === targetMarketId);
  for (const province of staged.provinceEconomies) {
    if (!moving.has(province.id) || province.marketId === targetMarketId) continue;
    const source = staged.markets.find((market) => market.id === province.marketId);
    if (source === undefined || target === undefined) {
      throw new RangeError(`province ${String(province.id)} has no market to move between`);
    }
    province.marketId = targetMarketId;
  }
  if (target !== undefined) {
    const carried = [];
    for (const market of staged.markets) {
      if (market.id === target.id) continue;
      const kept = [];
      for (const lot of market.stockLots) {
        if (movingBuildings.has(lot.ownerBuildingId)) {
          carried.push(lot);
          movedLotCount += 1;
        } else kept.push(lot);
      }
      market.stockLots = kept;
    }
    if (carried.length > 0) target.stockLots = canonicalizeStockLots([...target.stockLots, ...carried]);
  }

  // 4. Employment the new border closes.
  const owners = buildProvinceOwnerMap(staged);
  const countries = new Map(staged.countries.map((country) => [country.id, country]));
  const blockProvince = new Map(staged.popBlocks.map((block) => [block.id, block.provinceId]));
  const buildingProvince = new Map(staged.buildings.map((building) => [building.id, building.provinceId]));
  const releasedAssignmentIds: Id[] = [];
  staged.employment = staged.employment.filter((assignment) => {
    const source = blockProvince.get(assignment.popBlockId);
    const destination = buildingProvince.get(assignment.buildingInstanceId);
    if (source === undefined || destination === undefined) return true;
    if (!moving.has(source) && !moving.has(destination)) return true;
    if (laborAccessAllowed(owners, countries, source, destination)) return true;
    releasedAssignmentIds.push(assignment.id);
    return false;
  });
  if (releasedAssignmentIds.length > 0 || moving.size > 0) staged.employmentDirty = true;

  assertValidWorld(staged);
  world.provinces = staged.provinces;
  world.provinceEconomies = staged.provinceEconomies;
  world.markets = staged.markets;
  world.employment = staged.employment;
  world.employmentDirty = staged.employmentDirty;
  return { record, cancelledProjectIds, movedLotCount, releasedAssignmentIds };
}
