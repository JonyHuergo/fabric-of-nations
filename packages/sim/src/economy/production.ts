/**
 * M3c production phase.
 *
 * This module computes and applies one physical production phase. It does not
 * allocate scarce market stock, clear markets, post wages, settle purchases, or
 * mutate financial accounts. Input reservations are supplied explicitly by a
 * future market-clearing stage and remain transient.
 *
 * All plans are computed against the opening inventory snapshot before any
 * inventory is changed. An invalid reservation set is rejected before mutation.
 */

import { QUANTITY_TOLERANCE } from "../population/constants.js";
import { assertValidWorldForTick, type World } from "../world.js";
import { assertValidEconomyDefinitions } from "./definitions.js";
import { canonicalizeStockLots, deriveStockByGood } from "./inventory.js";
import { productionStrikeFactor } from "./politics.js";
import {
  laborHoursFactor,
  qualificationProductivityFactor,
} from "./labor.js";
import { technologyProductivityFactor } from "./technology.js";
import type {
  BuildingDef,
  BuildingInstance,
  EconomyDefinitions,
  EmploymentAssignment,
  GoodQuantityDef,
  ProfessionDef,
  StockLot,
} from "./types.js";
import { buildProvinceOwnerMap, marketProvinceIds } from "./country.js";

export interface InputReservation {
  readonly buyerBuildingId: number;
  readonly marketId: number;
  readonly goodId: number;
  readonly sellerBuildingId: number;
  /** Physical units reserved from the seller lot. */
  readonly quantity: number;
}

export interface BuildingCapacityResult {
  readonly buildingId: number;
  readonly isProductionBuilding: boolean;
  readonly operational: boolean;
  readonly referenceThroughputPerDayAtLevelOne: number;
  readonly level: number;
  readonly condition: number;
  readonly assignedWorkers: number;
  readonly requiredWorkersByProfession: readonly {
    readonly professionId: number;
    readonly requiredWorkers: number;
  }[];
  readonly staffingRatio: number;
  readonly productivityFactor: number;
  readonly capacityTU: number;
  readonly desiredInputs: readonly {
    readonly goodId: number;
    readonly quantity: number;
  }[];
}

export interface ReservationUse {
  readonly buyerBuildingId: number;
  readonly marketId: number;
  readonly goodId: number;
  readonly sellerBuildingId: number;
  readonly reservedQuantity: number;
  readonly usedQuantity: number;
  readonly releasedQuantity: number;
}

export interface BuildingProductionResult {
  readonly buildingId: number;
  readonly capacityTU: number;
  readonly executedTU: number;
  readonly staffingRatio: number;
  readonly productivityFactor: number;
  readonly inputs: readonly {
    readonly goodId: number;
    readonly reserved: number;
    readonly used: number;
    readonly released: number;
  }[];
  readonly outputs: readonly {
    readonly goodId: number;
    readonly quantity: number;
  }[];
}

export interface InventoryFlow {
  readonly goodId: number;
  readonly openingStock: number;
  readonly production: number;
  readonly usedAsInput: number;
  readonly recordedLoss: number;
  readonly closingStock: number;
}

export interface OverflowLoss {
  readonly goodId: number;
  readonly ownerBuildingId: number;
  readonly quantity: number;
}

export interface ProductionPhaseResult {
  readonly marketId: number;
  readonly buildings: readonly BuildingProductionResult[];
  readonly reservationUses: readonly ReservationUse[];
  readonly inventory: readonly InventoryFlow[];
  readonly overflowLosses: readonly OverflowLoss[];
}

export interface ProductionPhaseOptions {
  /**
   * Apply end-of-phase storage overflow. Defaults to true to preserve M3c
   * callers. M3d passes false so produced goods can serve Pass B before final
   * overflow is calculated.
   */
  readonly applyOverflow?: boolean;
  /**
   * M5 market scope. Defaults to `world.markets[0]` for the existing single-market
   * callers. Production, reservations, storage capacity, and overflow are all
   * scoped to that market so a multi-market world never mixes inventories.
   */
  readonly marketId?: number;
  /**
   * Whole-world validation control. Defaults to true. The integrated economic
   * day passes false because it validates once at the day boundary and again
   * before publishing the staged world; the phase's own input, reservation, and
   * inventory-conservation checks still run.
   */
  readonly validateWorld?: boolean;
  /**
   * Day-level lookups shared by every market's production (D-137). Blocks,
   * buildings, employment and province ownership do not change while markets
   * clear, so one capacity index and one capacity result per building serve the
   * whole market phase. Built for the call when omitted.
   */
  readonly lookups?: ProductionLookups;
}

/** See `ProductionPhaseOptions.lookups`. */
export interface ProductionLookups {
  readonly buildingById: ReadonlyMap<number, BuildingInstance>;
  readonly provinceOwners: ReadonlyMap<number, number>;
  readonly countryById: ReadonlyMap<number, World["countries"][number]>;
  readonly provinceIdsByMarket: ReadonlyMap<number, ReadonlySet<number>>;
  /** Building ids per market (owner province's market), ascending. */
  readonly buildingIdsByMarket: ReadonlyMap<number, readonly number[]>;
  readonly capacityIndex: BuildingCapacityIndex;
  /** `computeBuildingCapacity` for the day's state, computed once per building. */
  readonly capacityOf: (buildingId: number) => BuildingCapacityResult;
}

export function buildProductionLookups(
  world: World,
  definitions: EconomyDefinitions,
): ProductionLookups {
  const buildingById = new Map<number, BuildingInstance>();
  for (const building of world.buildings) {
    if (!buildingById.has(building.id)) buildingById.set(building.id, building);
  }
  const provinceIdsByMarket = new Map<number, Set<number>>();
  const marketByProvince = new Map<number, number>();
  for (const province of world.provinceEconomies) {
    if (province.marketId === null) continue;
    marketByProvince.set(province.id, province.marketId);
    let set = provinceIdsByMarket.get(province.marketId);
    if (set === undefined) {
      set = new Set<number>();
      provinceIdsByMarket.set(province.marketId, set);
    }
    set.add(province.id);
  }
  const buildingIdsByMarket = new Map<number, number[]>();
  for (const building of world.buildings) {
    const marketId = marketByProvince.get(building.provinceId);
    if (marketId === undefined) continue;
    const list = buildingIdsByMarket.get(marketId);
    if (list === undefined) buildingIdsByMarket.set(marketId, [building.id]);
    else list.push(building.id);
  }
  for (const list of buildingIdsByMarket.values()) list.sort((a, b) => a - b);
  const capacityIndex = buildBuildingCapacityIndex(world, definitions);
  const capacities = new Map<number, BuildingCapacityResult>();
  return {
    buildingById,
    provinceOwners: buildProvinceOwnerMap(world),
    countryById: new Map(world.countries.map((country) => [country.id, country])),
    provinceIdsByMarket,
    buildingIdsByMarket,
    capacityIndex,
    capacityOf(buildingId) {
      let capacity = capacities.get(buildingId);
      if (capacity === undefined) {
        capacity = computeBuildingCapacity(world, definitions, buildingId, capacityIndex);
        capacities.set(buildingId, capacity);
      }
      return capacity;
    },
  };
}

function tolerance(...values: number[]): number {
  let scale = 1;
  for (const value of values) scale = Math.max(scale, Math.abs(value));
  return QUANTITY_TOLERANCE * scale;
}


function profileById(
  definitions: EconomyDefinitions,
): Map<number, ProfessionDef> {
  return new Map(definitions.professions.map((profession) => [profession.id, profession]));
}

function definitionById(
  definitions: EconomyDefinitions,
): Map<number, BuildingDef> {
  return new Map(definitions.buildings.map((definition) => [definition.id, definition]));
}

function inputQuantity(
  definition: BuildingDef,
  goodId: number,
): number {
  const input = definition.inputs.find((candidate) => candidate.goodId === goodId);
  return input?.quantityPerThroughputUnit ?? 0;
}

/**
 * P1 read-only lookup tables for repeated capacity evaluation (D-116 hot path).
 *
 * Built once from the current world and reused for every building of one phase.
 * The index preserves the iteration orders of the linear scans it replaces
 * (assignments in `world.employment` order, the first owning country in
 * `world.countries` order), so capacity results are bit-identical. It must not be
 * reused after employment, buildings, blocks, or province ownership change.
 */
export interface BuildingCapacityIndex {
  readonly buildingById: ReadonlyMap<number, BuildingInstance>;
  readonly definitionById: ReadonlyMap<number, BuildingDef>;
  readonly professionById: ReadonlyMap<number, ProfessionDef>;
  readonly assignmentsByBuilding: ReadonlyMap<number, readonly EmploymentAssignment[]>;
  readonly blockById: ReadonlyMap<number, World["popBlocks"][number]>;
  readonly ownerByProvince: ReadonlyMap<number, World["countries"][number]>;
}

/** Build the capacity lookup tables for the current world state. */
export function buildBuildingCapacityIndex(
  world: World,
  definitions: EconomyDefinitions,
): BuildingCapacityIndex {
  const buildingById = new Map<number, BuildingInstance>();
  for (const building of world.buildings) {
    if (!buildingById.has(building.id)) buildingById.set(building.id, building);
  }
  const assignmentsByBuilding = new Map<number, EmploymentAssignment[]>();
  for (const assignment of world.employment) {
    const list = assignmentsByBuilding.get(assignment.buildingInstanceId);
    if (list === undefined) assignmentsByBuilding.set(assignment.buildingInstanceId, [assignment]);
    else list.push(assignment);
  }
  const blockById = new Map<number, World["popBlocks"][number]>();
  for (const block of world.popBlocks) {
    if (!blockById.has(block.id)) blockById.set(block.id, block);
  }
  const ownerByProvince = new Map<number, World["countries"][number]>();
  const countryById = new Map(world.countries.map((country) => [country.id, country]));
  for (const [provinceId, countryId] of buildProvinceOwnerMap(world)) {
    const country = countryById.get(countryId);
    if (country !== undefined) ownerByProvince.set(provinceId, country);
  }
  return {
    buildingById,
    definitionById: definitionById(definitions),
    professionById: profileById(definitions),
    assignmentsByBuilding,
    blockById,
    ownerByProvince,
  };
}

const NO_ASSIGNMENTS: readonly EmploymentAssignment[] = [];

/**
 * Compute a building's capacity and desired inputs from current staffing.
 *
 * Callers evaluating many buildings against one unchanged state pass an `index`
 * from `buildBuildingCapacityIndex`; otherwise one is built for this call.
 */
export function computeBuildingCapacity(
  world: World,
  definitions: EconomyDefinitions,
  buildingId: number,
  index: BuildingCapacityIndex = buildBuildingCapacityIndex(world, definitions),
): BuildingCapacityResult {
  const building = index.buildingById.get(buildingId);
  if (building === undefined) throw new RangeError(`unknown building ${String(buildingId)}`);
  const definition = index.definitionById.get(building.definitionId);
  if (definition === undefined) {
    throw new RangeError(`building ${String(building.id)} has no definition`);
  }
  const professions = index.professionById;
  const assignments = index.assignmentsByBuilding.get(building.id) ?? NO_ASSIGNMENTS;
  const assigned = new Map<number, number>();
  for (const assignment of assignments) {
    assigned.set(
      assignment.professionId,
      (assigned.get(assignment.professionId) ?? 0) + assignment.workers,
    );
  }
  let assignedWorkers = 0;
  for (const workers of assigned.values()) assignedWorkers += workers;
  const requiredWorkersByProfession = definition.jobs
    .map((job) => ({
      professionId: job.professionId,
      requiredWorkers:
        job.workersPerThroughputUnit *
        definition.referenceThroughputPerDayAtLevelOne *
        building.level *
        building.condition,
    }))
    .filter((job) => job.requiredWorkers > 0)
    .sort((left, right) => left.professionId - right.professionId);

  const isProductionBuilding = definition.outputs.length > 0;
  if (!isProductionBuilding || !building.operational) {
    return {
      buildingId: building.id,
      isProductionBuilding,
      operational: building.operational,
      referenceThroughputPerDayAtLevelOne:
        definition.referenceThroughputPerDayAtLevelOne,
      level: building.level,
      condition: building.condition,
      assignedWorkers,
      requiredWorkersByProfession,
      staffingRatio: isProductionBuilding ? 0 : 1,
      productivityFactor: 1,
      capacityTU: 0,
      desiredInputs: [],
    };
  }

  let staffingRatio = 1;
  for (const job of requiredWorkersByProfession) {
    const workers = assigned.get(job.professionId) ?? 0;
    const ratio = workers / job.requiredWorkers;
    if (ratio < staffingRatio) staffingRatio = ratio;
  }
  staffingRatio = Math.min(1, Math.max(0, staffingRatio));

  let productivityFactor = 1;
  if (assignedWorkers > 0) {
    let weighted = 0;
    for (const [professionId, workers] of assigned) {
      const profession = professions.get(professionId);
      if (profession === undefined) {
        throw new RangeError(
          `building ${String(building.id)} has an unknown profession ${String(professionId)}`,
        );
      }
      weighted += workers * profession.laborProductivityModifier;
    }
    productivityFactor = weighted / assignedWorkers;
  }

  const owner = index.ownerByProvince.get(building.provinceId);
  // E5: qualification raises effective labour productivity; part-time training time
  // reduces it. Both are weighted over the building's actual assignments.
  let e5LaborFactor = 1;
  if (owner !== undefined && assignedWorkers > 0) {
    let weighted = 0;
    for (const assignment of assignments) {
      const block = index.blockById.get(assignment.popBlockId);
      if (block === undefined) continue;
      weighted +=
        assignment.workers *
        qualificationProductivityFactor(block, owner.labor.trainingParticipation);
    }
    e5LaborFactor = weighted / assignedWorkers;
  }
  const hoursFactor =
    owner === undefined ? 1 : laborHoursFactor(owner, definitions);

  const capacityTU =
    definition.referenceThroughputPerDayAtLevelOne *
    building.level *
    building.condition *
    // P2b (D-135): the plant's technique scales output per staffed throughput unit.
    building.technique *
    staffingRatio *
    productivityFactor *
    e5LaborFactor *
    hoursFactor *
    (() => {
      return owner === undefined
        ? 1
        : productionStrikeFactor(world, owner.id, building.provinceId);
    })();
  if (!Number.isFinite(capacityTU) || capacityTU < 0) {
    throw new RangeError(`building ${String(building.id)} has invalid capacity`);
  }

  const desiredInputs = [...definition.inputs]
    .sort((left, right) => left.goodId - right.goodId)
    .map((input) => ({
      goodId: input.goodId,
      quantity: input.quantityPerThroughputUnit * capacityTU,
    }));

  return {
    buildingId: building.id,
    isProductionBuilding,
    operational: building.operational,
    referenceThroughputPerDayAtLevelOne:
      definition.referenceThroughputPerDayAtLevelOne,
    level: building.level,
    condition: building.condition,
    assignedWorkers,
    requiredWorkersByProfession,
    staffingRatio,
    productivityFactor,
    capacityTU,
    desiredInputs,
  };
}

/**
 * Derive per-good storage capacity from operational buildings.
 *
 * Provisional M3c rule: a storage contribution is
 * `definition.quantity × level × condition`. This is reversible and makes a
 * partially damaged or lower-level warehouse contribute less capacity.
 * Warehouses provide capacity only; they do not own stock.
 */
export function deriveStorageCapacityByGood(
  world: World,
  definitions: EconomyDefinitions,
  marketId?: number,
): number[] {
  const capacities = new Array<number>(definitions.goods.length).fill(0);
  const definitionsById = definitionById(definitions);
  const market =
    marketId === undefined ? undefined : world.markets.find((candidate) => candidate.id === marketId);
  if (marketId !== undefined && market === undefined) {
    throw new RangeError(`unknown market ${String(marketId)} for storage capacity`);
  }
  const provinceIds = market === undefined ? undefined : new Set(marketProvinceIds(world, market.id));
  for (const building of world.buildings) {
    if (!building.operational) continue;
    if (provinceIds !== undefined && !provinceIds.has(building.provinceId)) continue;
    const definition = definitionsById.get(building.definitionId);
    if (definition === undefined) {
      throw new RangeError(`building ${String(building.id)} has no definition`);
    }
    for (const storage of definition.storageCapacityByGood) {
      const quantity = storage.quantity * building.level * building.condition;
      if (!Number.isFinite(quantity) || quantity < 0) {
        throw new RangeError(`building ${String(building.id)} has invalid storage capacity`);
      }
      capacities[storage.goodId] = (capacities[storage.goodId] ?? 0) + quantity;
    }
  }
  return capacities;
}

function lotKey(goodId: number, ownerBuildingId: number): string {
  return `${String(goodId)}:${String(ownerBuildingId)}`;
}

function assertReservationShape(
  reservation: InputReservation,
  path: string,
): void {
  for (const [name, value] of [
    ["buyerBuildingId", reservation.buyerBuildingId],
    ["marketId", reservation.marketId],
    ["goodId", reservation.goodId],
    ["sellerBuildingId", reservation.sellerBuildingId],
  ] as const) {
    if (!Number.isInteger(value) || value < 0 || value > 0xffff_ffff) {
      throw new RangeError(`${path}.${name} must be an unsigned integer`);
    }
  }
  if (!Number.isFinite(reservation.quantity) || !(reservation.quantity > 0)) {
    throw new RangeError(`${path}.quantity must be a finite positive number`);
  }
}

function applyOverflowToLots(
  lots: Map<string, number>,
  capacityByGood: readonly number[],
  goodCount: number,
): OverflowLoss[] {
  const overflowLosses: OverflowLoss[] = [];
  for (let goodId = 0; goodId < goodCount; goodId += 1) {
    const goodLots = [...lots.entries()]
      .map(([key, quantity]) => {
        const [goodText, ownerText] = key.split(":");
        return { key, goodId: Number(goodText), ownerBuildingId: Number(ownerText), quantity };
      })
      .filter((lot) => lot.goodId === goodId && lot.quantity > 0)
      .sort((left, right) => left.ownerBuildingId - right.ownerBuildingId);
    const total = goodLots.reduce((sum, lot) => sum + lot.quantity, 0);
    const capacity = capacityByGood[goodId] ?? 0;
    if (total <= capacity + tolerance(total, capacity)) continue;
    const overflow = total - capacity;
    const losses = goodLots.map((lot) => ({
      lot,
      quantity: (lot.quantity * overflow) / total,
    }));
    const lost = losses.reduce((sum, loss) => sum + loss.quantity, 0);
    let residual = overflow - lost;
    for (let index = losses.length - 1; index >= 0 && residual > tolerance(residual); index -= 1) {
      const loss = losses[index];
      if (loss === undefined) continue;
      const headroom = loss.lot.quantity - loss.quantity;
      if (headroom <= 0) continue;
      const amount = Math.min(headroom, residual);
      loss.quantity += amount;
      residual -= amount;
    }
    if (residual > tolerance(residual)) {
      throw new RangeError(`unable to allocate overflow loss for good ${String(goodId)}`);
    }
    for (const loss of losses) {
      if (!(loss.quantity > 0)) continue;
      const remaining = loss.lot.quantity - loss.quantity;
      if (remaining < -tolerance(loss.lot.quantity, loss.quantity)) {
        throw new RangeError(`overflow loss makes lot ${loss.lot.key} negative`);
      }
      if (remaining <= 0) lots.delete(loss.lot.key);
      else lots.set(loss.lot.key, remaining);
      overflowLosses.push({
        goodId,
        ownerBuildingId: loss.lot.ownerBuildingId,
        quantity: loss.quantity,
      });
    }
  }
  return overflowLosses;
}

/**
 * Apply final storage overflow to the market's current lots. M3d calls this
 * after Pass B; M3c's default production phase calls it internally.
 */
export function applyOverflowLosses(
  world: World,
  definitions: EconomyDefinitions,
  marketId?: number,
  options: ProductionPhaseOptions = {},
): OverflowLoss[] {
  if (options.validateWorld !== false) assertValidWorldForTick(world);
  // Staged mode: the integrated day validated the definitions once at its start.
  if (options.validateWorld !== false) assertValidEconomyDefinitions(definitions);
  const market =
    marketId === undefined
      ? world.markets[0]
      : world.markets.find((candidate) => candidate.id === marketId);
  if (market === undefined) throw new RangeError("M3 overflow requires a market");
  const lots = new Map<string, number>();
  for (const lot of market.stockLots) {
    lots.set(lotKey(lot.goodId, lot.ownerBuildingId), lot.quantity);
  }
  const capacityByGood = deriveStorageCapacityByGood(world, definitions, market.id);
  const losses = applyOverflowToLots(lots, capacityByGood, definitions.goods.length);
  const canonicalLots = canonicalizeStockLots(
    [...lots.entries()].map(([key, quantity]) => {
      const [goodText, ownerText] = key.split(":");
      return {
        goodId: Number(goodText),
        ownerBuildingId: Number(ownerText),
        quantity,
      };
    }),
  );
  if (options.validateWorld !== false) {
    const candidateWorld: World = {
      ...world,
      markets: world.markets.map((candidate) =>
        candidate.id === market.id ? { ...candidate, stockLots: canonicalLots } : candidate,
      ),
    };
    assertValidWorldForTick(candidateWorld);
  }
  market.stockLots = canonicalLots;
  losses.sort((left, right) => {
    if (left.goodId !== right.goodId) return left.goodId - right.goodId;
    return left.ownerBuildingId - right.ownerBuildingId;
  });
  return losses;
}

/**
 * Run one physical production phase against the opening inventory snapshot.
 *
 * Reservations are transient and must refer to opening lots. The function
 * validates everything before changing `Market.stockLots`; invalid input leaves
 * inventory, prices, accounts, and employment untouched.
 */
export function runProductionPhase(
  world: World,
  definitions: EconomyDefinitions,
  reservations: readonly InputReservation[],
  options: ProductionPhaseOptions = {},
): ProductionPhaseResult {
  if (options.validateWorld !== false) assertValidWorldForTick(world);
  // Staged mode: the integrated day validated the definitions once at its start.
  if (options.validateWorld !== false) assertValidEconomyDefinitions(definitions);
  if (definitions.dataVersion !== world.dataVersion || definitions.scenarioId !== world.scenarioId) {
    throw new RangeError("economy definitions do not match the world data/scenario identity");
  }
  const market =
    options.marketId === undefined
      ? world.markets[0]
      : world.markets.find((candidate) => candidate.id === options.marketId);
  if (market === undefined) throw new RangeError("M3c production requires a market");
  const lookups = options.lookups ?? buildProductionLookups(world, definitions);
  const marketProvinceIdSet: ReadonlySet<number> =
    lookups.provinceIdsByMarket.get(market.id) ?? new Set(marketProvinceIds(world, market.id));
  const provinceOwners = lookups.provinceOwners;
  const buildingById = lookups.buildingById;
  const definitionsById = definitionById(definitions);
  const goods = definitions.goods;
  const goodIds = new Set(goods.map((good) => good.id));
  const openingByGood = deriveStockByGood(market, goods.length);
  const openingLots = new Map<string, number>();
  for (const lot of market.stockLots) {
    openingLots.set(lotKey(lot.goodId, lot.ownerBuildingId), lot.quantity);
  }

  const reservedByLot = new Map<string, number>();
  const reservedByBuyerGood = new Map<string, number>();
  const reservationsByBuyerGood = new Map<string, InputReservation[]>();
  const reservationKeys = new Set<string>();
  // D-136: reservations are differences of cumulative interval ends (D-133), so the
  // lot checks' tolerance scales with the good's reserved total.
  const reservedByGood = new Map<number, number>();
  for (const reservation of reservations) {
    reservedByGood.set(reservation.goodId, (reservedByGood.get(reservation.goodId) ?? 0) + reservation.quantity);
  }

  for (let index = 0; index < reservations.length; index += 1) {
    const reservation = reservations[index];
    if (reservation === undefined) throw new RangeError("missing reservation");
    const path = `inputReservations[${String(index)}]`;
    assertReservationShape(reservation, path);
    if (reservation.marketId !== market.id) {
      throw new RangeError(`${path}.marketId does not match the M3 market`);
    }
    if (!goodIds.has(reservation.goodId)) {
      throw new RangeError(`${path}.goodId references an unknown good`);
    }
    const buyer = buildingById.get(reservation.buyerBuildingId);
    if (buyer === undefined) {
      throw new RangeError(`${path} references an unknown buyer building`);
    }
    if (!buyer.operational) {
      throw new RangeError(`${path} references a non-operational buyer building`);
    }
    const buyerDefinition = definitionsById.get(buyer.definitionId);
    if (buyerDefinition === undefined) {
      throw new RangeError(`${path} buyer has no definition`);
    }
    if (buyerDefinition.outputs.length === 0) {
      throw new RangeError(`${path} buyer has no production recipe`);
    }
    if (inputQuantity(buyerDefinition, reservation.goodId) <= 0) {
      throw new RangeError(`${path}.goodId is not an input of the buyer recipe`);
    }
    if (!marketProvinceIdSet.has(buyer.provinceId)) {
      throw new RangeError(`${path} buyer building is outside the market`);
    }
    const seller = buildingById.get(reservation.sellerBuildingId);
    if (seller === undefined) {
      throw new RangeError(`${path} references an unknown seller building`);
    }
    if (!marketProvinceIdSet.has(seller.provinceId)) {
      // E6a: an imported lot is owned by a building in another market. The opening
      // lot existence check below is the real guard; a foreign owner is legitimate
      // only when trade is enabled (D-079 §8).
      if (!world.trade.enabled) {
        throw new RangeError(`${path} seller building is outside the market`);
      }
      if (!seller.operational) {
        throw new RangeError(`${path} seller building is not operational`);
      }
    }
    const sellerLotKey = lotKey(reservation.goodId, reservation.sellerBuildingId);
    const lotQuantity = openingLots.get(sellerLotKey);
    if (lotQuantity === undefined) {
      throw new RangeError(`${path} references a seller lot that does not exist on opening inventory`);
    }
    const duplicateKey = `${String(reservation.buyerBuildingId)}:${String(reservation.goodId)}:${String(reservation.sellerBuildingId)}`;
    if (reservationKeys.has(duplicateKey)) {
      throw new RangeError(`${path} duplicates a buyer/good/seller reservation`);
    }
    reservationKeys.add(duplicateKey);
    const reserved = (reservedByLot.get(sellerLotKey) ?? 0) + reservation.quantity;
    if (reserved > lotQuantity + tolerance(lotQuantity, reserved, reservedByGood.get(reservation.goodId) ?? 0)) {
      throw new RangeError(`${path} over-reserves seller lot ${sellerLotKey}`);
    }
    reservedByLot.set(sellerLotKey, reserved);
    const buyerGoodKey = `${String(reservation.buyerBuildingId)}:${String(reservation.goodId)}`;
    reservedByBuyerGood.set(
      buyerGoodKey,
      (reservedByBuyerGood.get(buyerGoodKey) ?? 0) + reservation.quantity,
    );
    const group = reservationsByBuyerGood.get(buyerGoodKey) ?? [];
    group.push(reservation);
    reservationsByBuyerGood.set(buyerGoodKey, group);
  }

  const productionByGood = new Array<number>(goods.length).fill(0);
  const usedByGood = new Array<number>(goods.length).fill(0);
  const buildingResults: BuildingProductionResult[] = [];
  const reservationUses: ReservationUse[] = [];
  const nextLots = new Map<string, number>(openingLots);

  const buildingIds = lookups.buildingIdsByMarket.get(market.id) ?? [];
  for (const buildingId of buildingIds) {
    const building = buildingById.get(buildingId);
    if (building === undefined) throw new RangeError(`unknown building ${String(buildingId)}`);
    const definition = definitionsById.get(building.definitionId);
    if (definition === undefined) throw new RangeError(`building ${String(building.id)} has no definition`);
    const capacity = lookups.capacityOf(building.id);
    if (!capacity.isProductionBuilding) continue;

    let executedTU = capacity.capacityTU;
    const inputResults: BuildingProductionResult["inputs"][number][] = [];
    const sortedInputs = [...definition.inputs].sort((left, right) => left.goodId - right.goodId);
    for (const input of sortedInputs) {
      const buyerGoodKey = `${String(building.id)}:${String(input.goodId)}`;
      const reserved = reservedByBuyerGood.get(buyerGoodKey) ?? 0;
      const fromInput = reserved / input.quantityPerThroughputUnit;
      if (fromInput < executedTU) executedTU = fromInput;
    }
    if (!Number.isFinite(executedTU) || executedTU < 0) {
      throw new RangeError(`building ${String(building.id)} has invalid executed throughput`);
    }

    for (const input of sortedInputs) {
      const buyerGoodKey = `${String(building.id)}:${String(input.goodId)}`;
      const reserved = reservedByBuyerGood.get(buyerGoodKey) ?? 0;
      let used = input.quantityPerThroughputUnit * executedTU;
      if (used > reserved + tolerance(reserved, used)) {
        throw new RangeError(`building ${String(building.id)} input use exceeds reservation`);
      }
      if (used > reserved) used = reserved;

      const group = reservationsByBuyerGood.get(buyerGoodKey) ?? [];
      let actualUsed = used;
      if (group.length > 0) {
        const totalReserved = group.reduce((total, reservation) => total + reservation.quantity, 0);
        actualUsed = 0;
        for (const reservation of group) {
          let reservationUsed: number;
          if (used <= tolerance(totalReserved)) reservationUsed = 0;
          else if (used >= totalReserved - tolerance(totalReserved, used)) reservationUsed = reservation.quantity;
          else reservationUsed = (used * reservation.quantity) / totalReserved;
          reservationUsed = Math.min(reservation.quantity, Math.max(0, reservationUsed));
          const reservationReleased = Math.max(0, reservation.quantity - reservationUsed);
          actualUsed += reservationUsed;
          reservationUses.push({
            buyerBuildingId: reservation.buyerBuildingId,
            marketId: reservation.marketId,
            goodId: reservation.goodId,
            sellerBuildingId: reservation.sellerBuildingId,
            reservedQuantity: reservation.quantity,
            usedQuantity: reservationUsed,
            releasedQuantity: reservationReleased,
          });
          const sellerKey = lotKey(reservation.goodId, reservation.sellerBuildingId);
          const current = nextLots.get(sellerKey);
          if (current === undefined) throw new RangeError(`missing seller lot ${sellerKey}`);
          const remaining = current - reservationUsed;
          if (remaining < -tolerance(current, reservationUsed, reservedByGood.get(reservation.goodId) ?? 0)) {
            throw new RangeError(`seller lot ${sellerKey} would become negative`);
          }
          if (remaining <= 0) nextLots.delete(sellerKey);
          else nextLots.set(sellerKey, remaining);
        }
        if (Math.abs(actualUsed - used) > tolerance(used, actualUsed)) {
          throw new RangeError(`reservation use does not reconcile for ${buyerGoodKey}`);
        }
      }
      const actualReleased = Math.max(0, reserved - actualUsed);
      inputResults.push({
        goodId: input.goodId,
        reserved,
        used: actualUsed,
        released: actualReleased,
      });
      usedByGood[input.goodId] = (usedByGood[input.goodId] ?? 0) + actualUsed;
    }

    const outputResults: BuildingProductionResult["outputs"][number][] = [];
    const sortedOutputs = [...definition.outputs].sort((left, right) => left.goodId - right.goodId);
    // M9 technology: researched sector productivity increases physical output from
    // the same executed throughput (and therefore the same inputs). It does not
    // change capacity, prices, or the input recipe.
    const ownerId = provinceOwners.get(building.provinceId);
    const owner = ownerId === undefined ? undefined : lookups.countryById.get(ownerId);
    const technologyFactor =
      owner === undefined
        ? 1
        : technologyProductivityFactor(owner, definitions, definition.sector);
    for (const output of sortedOutputs) {
      const quantity = output.quantityPerThroughputUnit * executedTU * technologyFactor;
      if (!Number.isFinite(quantity) || quantity < 0) {
        throw new RangeError(`building ${String(building.id)} produced an invalid output quantity`);
      }
      if (quantity > 0) {
        outputResults.push({ goodId: output.goodId, quantity });
        productionByGood[output.goodId] = (productionByGood[output.goodId] ?? 0) + quantity;
        const producerKey = lotKey(output.goodId, building.id);
        nextLots.set(producerKey, (nextLots.get(producerKey) ?? 0) + quantity);
      }
    }

    buildingResults.push({
      buildingId: building.id,
      capacityTU: capacity.capacityTU,
      executedTU,
      staffingRatio: capacity.staffingRatio,
      productivityFactor: capacity.productivityFactor,
      inputs: inputResults,
      outputs: outputResults,
    });
  }

  const applyOverflow = options.applyOverflow !== false;
  const capacityByGood = applyOverflow
    ? deriveStorageCapacityByGood(world, definitions, market.id)
    : new Array<number>(goods.length).fill(0);
  const overflowLosses = applyOverflow
    ? applyOverflowToLots(nextLots, capacityByGood, goods.length)
    : [];
  const lossByGood = new Array<number>(goods.length).fill(0);
  for (const loss of overflowLosses) {
    lossByGood[loss.goodId] = (lossByGood[loss.goodId] ?? 0) + loss.quantity;
  }

  const closingByGood = new Array<number>(goods.length).fill(0);
  for (const [key, quantity] of nextLots) {
    const [goodText] = key.split(":");
    const goodId = Number(goodText);
    closingByGood[goodId] = (closingByGood[goodId] ?? 0) + quantity;
  }

  const inventory: InventoryFlow[] = goods.map((good) => {
    const goodId = good.id;
    const opening = openingByGood[goodId] ?? 0;
    const production = productionByGood[goodId] ?? 0;
    const used = usedByGood[goodId] ?? 0;
    const loss = lossByGood[goodId] ?? 0;
    const closing = closingByGood[goodId] ?? 0;
    const expected = opening + production - used - loss;
    // Scale by the gross physical terms so large-population cancellation does not
    // masquerade as a conservation failure.
    if (
      Math.abs(expected - closing) >
      tolerance(opening, production, used, loss, expected, closing)
    ) {
      throw new RangeError(
        `inventory conservation failed for good ${String(goodId)}: ${String(expected)} != ${String(closing)}`,
      );
    }
    return {
      goodId,
      openingStock: opening,
      production,
      usedAsInput: used,
      recordedLoss: loss,
      closingStock: closing,
    };
  });

  const canonicalLots = canonicalizeStockLots(
    [...nextLots.entries()].map(([key, quantity]) => {
      const [goodText, ownerText] = key.split(":");
      return {
        goodId: Number(goodText),
        ownerBuildingId: Number(ownerText),
        quantity,
      };
    }),
  );
  if (options.validateWorld !== false) {
    const candidateWorld: World = {
      ...world,
      markets: world.markets.map((candidate) =>
        candidate.id === market.id ? { ...candidate, stockLots: canonicalLots } : candidate,
      ),
    };
    assertValidWorldForTick(candidateWorld);
  }
  market.stockLots = canonicalLots;

  reservationUses.sort((left, right) => {
    if (left.buyerBuildingId !== right.buyerBuildingId) {
      return left.buyerBuildingId - right.buyerBuildingId;
    }
    if (left.goodId !== right.goodId) return left.goodId - right.goodId;
    return left.sellerBuildingId - right.sellerBuildingId;
  });
  overflowLosses.sort((left, right) => {
    if (left.goodId !== right.goodId) return left.goodId - right.goodId;
    return left.ownerBuildingId - right.ownerBuildingId;
  });

  return {
    marketId: market.id,
    buildings: buildingResults,
    reservationUses,
    inventory,
    overflowLosses,
  };
}

/** Exposed for future market clearing; production itself never allocates stock. */
export function desiredInputsForBuilding(
  world: World,
  definitions: EconomyDefinitions,
  buildingId: number,
): readonly { readonly goodId: number; readonly quantity: number }[] {
  return computeBuildingCapacity(world, definitions, buildingId).desiredInputs;
}

/** Type helper for tests building reservations. */
export function makeInputReservation(
  buyerBuildingId: number,
  marketId: number,
  goodId: number,
  sellerBuildingId: number,
  quantity: number,
): InputReservation {
  return { buyerBuildingId, marketId, goodId, sellerBuildingId, quantity };
}

/** Re-export for tests that inspect lot types without importing internal modules. */
export type { StockLot, GoodQuantityDef, BuildingDef, BuildingInstance };
