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
import {
  copyLotTable,
  deriveStockByGood,
  lotTableFromLots,
  lotTableToLots,
  type LotTable,
} from "./inventory.js";
import { productionStrikeFactor } from "./politics.js";
import {
  laborHoursFactor,
  qualificationProductivityFactor,
} from "./labor.js";
import { technologyProductivityFactor } from "./technology.js";
import {
  type OwnConsumptionPlan,
  farmLandFactor,
  harvestWeatherFactor,
  harvestYearOf,
  landKey,
  landPerLevelByProvince,
} from "./agriculture.js";
import { FARM_LABOUR_ELASTICITY } from "./constants.js";
import type {
  BuildingDef,
  BuildingInstance,
  EconomyDefinitions,
  EmploymentAssignment,
  GoodQuantityDef,
  LandUse,
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
    /** Quantity added to the building's lot (marketed). */
    readonly quantity: number;
    /** P5 (D-143 §2): quantity the owner household kept; absent when none. */
    readonly ownConsumption?: number;
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
  /** Building definitions by id (D-139). */
  readonly definitionById?: ReadonlyMap<number, BuildingDef>;
  /** `deriveStorageCapacityByGood` of a market, computed once per market (D-139). */
  readonly storageCapacityOf?: (marketId: number) => readonly number[];
  /**
   * P5 (D-143 §2): the day's own-consumption plan. Production diverts each planned
   * quantity from the building's output before it reaches the building's lot; the
   * owner household consumes it. Absent means nothing is kept.
   */
  readonly ownConsumption?: OwnConsumptionPlan;
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
  // Storage: operational buildings bucketed by market in `world.buildings` order, the
  // order `deriveStorageCapacityByGood` sums them in.
  const storageBuildings = new Map<number, BuildingInstance[]>();
  for (const building of world.buildings) {
    if (!building.operational) continue;
    const marketId = marketByProvince.get(building.provinceId);
    if (marketId === undefined) continue;
    const list = storageBuildings.get(marketId);
    if (list === undefined) storageBuildings.set(marketId, [building]);
    else list.push(building);
  }
  const storage = new Map<number, number[]>();
  const definitionsById = capacityIndex.definitionById;
  return {
    definitionById: definitionsById,
    storageCapacityOf(marketId) {
      let capacities_ = storage.get(marketId);
      if (capacities_ === undefined) {
        capacities_ = new Array<number>(definitions.goods.length).fill(0);
        for (const building of storageBuildings.get(marketId) ?? []) {
          const definition = definitionsById.get(building.definitionId);
          if (definition === undefined) {
            throw new RangeError(`building ${String(building.id)} has no definition`);
          }
          for (const item of definition.storageCapacityByGood) {
            const quantity = item.quantity * building.level * building.condition;
            if (!Number.isFinite(quantity) || quantity < 0) {
              throw new RangeError(`building ${String(building.id)} has invalid storage capacity`);
            }
            capacities_[item.goodId] = (capacities_[item.goodId] ?? 0) + quantity;
          }
        }
        storage.set(marketId, capacities_);
      }
      return capacities_;
    },
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

/**
 * QUANTITY_TOLERANCE scaled by the largest magnitude, at least 1. Fixed arity (D-139): the
 * former rest parameter allocated an array on every call; a missing value is 0,
 * which never raises the scale above 1, so the result is unchanged.
 */
function tolerance(a: number, b = 0, c = 0, d = 0, e = 0, f = 0, g = 0, h = 0): number {
  return (
    QUANTITY_TOLERANCE *
    Math.max(1, Math.abs(a), Math.abs(b), Math.abs(c), Math.abs(d), Math.abs(e), Math.abs(f), Math.abs(g), Math.abs(h))
  );
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
  /** P5 (D-143): hectares per level by `landKey(province, land kind)`. */
  readonly landPerLevel: ReadonlyMap<number, number>;
  /** P5: world seed and calendar year of the harvest weather. */
  readonly seed: number;
  readonly harvestYear: number;
  /** P5: harvest weather by province, filled on first use (a pure derived cache). */
  readonly weatherByProvince: Map<number, number>;
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
  const definitionsById = definitionById(definitions);
  return {
    buildingById,
    definitionById: definitionsById,
    professionById: profileById(definitions),
    assignmentsByBuilding,
    blockById,
    ownerByProvince,
    landPerLevel: landPerLevelByProvince(world, definitionsById),
    seed: world.seed,
    harvestYear: harvestYearOf(world.dayIndex),
    weatherByProvince: new Map(),
  };
}

/**
 * P5 (D-143 §1): the land, labour and weather terms of a land-using building, or 1
 * for every other building. Returns the multiplier that replaces the linear staffing
 * ratio: staffing^labourElasticity × land factor × harvest weather.
 */
function farmFactor(
  index: BuildingCapacityIndex,
  building: BuildingInstance,
  use: LandUse,
  staffingRatio: number,
): number {
  if (!(staffingRatio > 0)) return 0;
  const land = farmLandFactor(index.landPerLevel.get(landKey(building.provinceId, use)) ?? 0);
  if (!(land > 0)) return 0;
  let weather = index.weatherByProvince.get(building.provinceId);
  if (weather === undefined) {
    weather = harvestWeatherFactor(index.seed, building.provinceId, index.harvestYear);
    index.weatherByProvince.set(building.provinceId, weather);
  }
  return staffingRatio ** FARM_LABOUR_ELASTICITY * land * weather;
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

  // P5 (D-143): a farm's labour has diminishing returns on its share of the province's
  // land, and its harvest follows the year's weather.
  const staffingTerm =
    definition.landUse === undefined
      ? staffingRatio
      : farmFactor(index, building, definition.landUse, staffingRatio);
  const capacityTU =
    definition.referenceThroughputPerDayAtLevelOne *
    building.level *
    building.condition *
    // P2b (D-135): the plant's technique scales output per staffed throughput unit.
    building.technique *
    staffingTerm *
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

/**
 * Storage overflow on a lot table (D-139; same arithmetic and order as the former
 * map version). Per good, the positive lots in ascending owner order lose the
 * overflow pro rata; the floating residual goes to the last lots with headroom.
 */
export function applyOverflowToTable(
  table: LotTable,
  capacityByGood: readonly number[],
  goodCount: number,
): OverflowLoss[] {
  const overflowLosses: OverflowLoss[] = [];
  const ownerCount = table.owners.length;
  const slots: number[] = [];
  const amounts: number[] = [];
  for (let goodId = 0; goodId < goodCount && goodId < table.goodCount; goodId += 1) {
    const base = goodId * ownerCount;
    slots.length = 0;
    let total = 0;
    for (let slot = 0; slot < ownerCount; slot += 1) {
      const quantity = table.quantity[base + slot] ?? 0;
      if (table.present[base + slot] === 1 && quantity > 0) {
        slots.push(slot);
        total += quantity;
      }
    }
    const capacity = capacityByGood[goodId] ?? 0;
    if (total <= capacity + tolerance(total, capacity)) continue;
    const overflow = total - capacity;
    amounts.length = 0;
    let lost = 0;
    for (const slot of slots) {
      const amount = ((table.quantity[base + slot] ?? 0) * overflow) / total;
      amounts.push(amount);
      lost += amount;
    }
    let residual = overflow - lost;
    for (let index = slots.length - 1; index >= 0 && residual > tolerance(residual); index -= 1) {
      const quantity = table.quantity[base + (slots[index] ?? 0)] ?? 0;
      const headroom = quantity - (amounts[index] ?? 0);
      if (headroom <= 0) continue;
      const amount = Math.min(headroom, residual);
      amounts[index] = (amounts[index] ?? 0) + amount;
      residual -= amount;
    }
    if (residual > tolerance(residual)) {
      throw new RangeError(`unable to allocate overflow loss for good ${String(goodId)}`);
    }
    for (let index = 0; index < slots.length; index += 1) {
      let amount = amounts[index] ?? 0;
      if (!(amount > 0)) continue;
      const slot = slots[index] ?? 0;
      const cell = base + slot;
      const quantity = table.quantity[cell] ?? 0;
      let remaining = quantity - amount;
      const owner = table.owners[slot] ?? 0;
      if (remaining < -tolerance(quantity, amount)) {
        throw new RangeError(`overflow loss makes lot ${lotKey(goodId, owner)} negative`);
      }
      // P5 (D-143 §5): a proportional cut repeated every day shrinks a lot that never
      // sells geometrically, into subnormal quantities whose price × quantity is 0 (the
      // P4 century run failed settlement on such a lot in 1917). A lot that would be
      // left below the quantity tolerance is lost whole; the dust is part of the
      // recorded loss, so the inventory identity still holds exactly.
      if (remaining > 0 && remaining < QUANTITY_TOLERANCE) {
        amount = quantity;
        remaining = 0;
      }
      if (remaining <= 0) {
        table.present[cell] = 0;
        table.quantity[cell] = 0;
      } else {
        table.quantity[cell] = remaining;
      }
      overflowLosses.push({ goodId, ownerBuildingId: owner, quantity: amount });
    }
  }
  return overflowLosses;
}

/** Storage capacity of one market, from the day lookups when available (D-139). */
export function storageCapacityOf(
  world: World,
  definitions: EconomyDefinitions,
  marketId: number,
  lookups: ProductionLookups | undefined,
): readonly number[] {
  return lookups?.storageCapacityOf !== undefined
    ? lookups.storageCapacityOf(marketId)
    : deriveStorageCapacityByGood(world, definitions, marketId);
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
  const table = lotTableFromLots(market.stockLots, [], definitions.goods.length);
  const capacityByGood = storageCapacityOf(world, definitions, market.id, options.lookups);
  const losses = applyOverflowToTable(table, capacityByGood, definitions.goods.length);
  const canonicalLots = lotTableToLots(table);
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
  // Already in (good, owner) order: goods ascending, owners ascending within a good.
  return losses;
}

/**
 * Input reservations in columns (D-139), in reservation order. The market day hands
 * these to production without building one object per reservation.
 */
export interface ReservationColumns {
  readonly buyer: readonly number[];
  readonly good: readonly number[];
  readonly seller: readonly number[];
  readonly quantity: readonly number[];
}

/** Reservation uses in columns, in (buyer, good, seller) order. */
export interface ReservationUseColumns {
  readonly buyer: number[];
  readonly good: number[];
  readonly seller: number[];
  readonly reserved: number[];
  readonly used: number[];
}

/** What `runProductionCore` returns besides the market's new lots. */
export interface ProductionCoreResult {
  readonly buildings: BuildingProductionResult[];
  readonly uses: ReservationUseColumns;
  readonly inventory: InventoryFlow[];
  readonly overflowLosses: OverflowLoss[];
  /** The market's lots after production (and overflow when applied). */
  readonly lots: LotTable;
}

/**
 * The M3c production phase on columns (D-139). The checks, their order and messages,
 * and every floating operation are those of the former object/map implementation;
 * `runProductionPhase` and the M3d market day both run it. `opening` is the market's
 * opening lot table and is not changed.
 */
export function runProductionCore(
  world: World,
  definitions: EconomyDefinitions,
  market: World["markets"][number],
  lookups: ProductionLookups,
  opening: LotTable,
  reservations: ReservationColumns,
  applyOverflow: boolean,
): ProductionCoreResult {
  const marketProvinceIdSet: ReadonlySet<number> =
    lookups.provinceIdsByMarket.get(market.id) ?? new Set(marketProvinceIds(world, market.id));
  const provinceOwners = lookups.provinceOwners;
  const buildingById = lookups.buildingById;
  const definitionsById = lookups.definitionById ?? definitionById(definitions);
  const goods = definitions.goods;
  const goodCount = goods.length;
  const goodKnown = new Uint8Array(goodCount);
  for (const good of goods) if (Number.isInteger(good.id) && good.id >= 0 && good.id < goodCount) goodKnown[good.id] = 1;
  const openingByGood = deriveStockByGood(market, goodCount);
  const ownerCount = opening.owners.length;
  const buildingIds = lookups.buildingIdsByMarket.get(market.id) ?? [];
  // Buyer slots: the market's buildings in ascending id order.
  const buyerSlot = new Map<number, number>();
  for (let slot = 0; slot < buildingIds.length; slot += 1) buyerSlot.set(buildingIds[slot] ?? 0, slot);

  const count = reservations.buyer.length;
  // D-136: reservations are differences of cumulative interval ends (D-133), so the
  // lot checks' tolerance scales with the good's reserved total.
  const reservedByGood = new Float64Array(goodCount);
  for (let index = 0; index < count; index += 1) {
    const goodId = reservations.good[index] ?? 0;
    if (goodId >= 0 && goodId < goodCount) {
      reservedByGood[goodId] = (reservedByGood[goodId] ?? 0) + (reservations.quantity[index] ?? 0);
    }
  }
  const reservedByLot = new Float64Array(goodCount * ownerCount);
  const reservedByBuyerGood = new Float64Array(buildingIds.length * goodCount);
  // Reservations of each (buyer, good) as a linked list in reservation order.
  const groupHead = new Int32Array(buildingIds.length * goodCount).fill(-1);
  const groupTail = new Int32Array(buildingIds.length * goodCount).fill(-1);
  const groupNext = new Int32Array(count).fill(-1);
  const reservationKeys = new Set<number>();
  for (let index = 0; index < count; index += 1) {
    const path = (): string => `inputReservations[${String(index)}]`;
    const buyerId = reservations.buyer[index] ?? 0;
    const goodId = reservations.good[index] ?? 0;
    const sellerId = reservations.seller[index] ?? 0;
    const quantity = reservations.quantity[index] ?? 0;
    if (!(goodId >= 0 && goodId < goodCount && goodKnown[goodId] === 1)) {
      throw new RangeError(`${path()}.goodId references an unknown good`);
    }
    const buyer = buildingById.get(buyerId);
    if (buyer === undefined) {
      throw new RangeError(`${path()} references an unknown buyer building`);
    }
    if (!buyer.operational) {
      throw new RangeError(`${path()} references a non-operational buyer building`);
    }
    const buyerDefinition = definitionsById.get(buyer.definitionId);
    if (buyerDefinition === undefined) {
      throw new RangeError(`${path()} buyer has no definition`);
    }
    if (buyerDefinition.outputs.length === 0) {
      throw new RangeError(`${path()} buyer has no production recipe`);
    }
    if (inputQuantity(buyerDefinition, goodId) <= 0) {
      throw new RangeError(`${path()}.goodId is not an input of the buyer recipe`);
    }
    if (!marketProvinceIdSet.has(buyer.provinceId)) {
      throw new RangeError(`${path()} buyer building is outside the market`);
    }
    const seller = buildingById.get(sellerId);
    if (seller === undefined) {
      throw new RangeError(`${path()} references an unknown seller building`);
    }
    if (!marketProvinceIdSet.has(seller.provinceId)) {
      // E6a: an imported lot is owned by a building in another market. The opening
      // lot existence check below is the real guard; a foreign owner is legitimate
      // only when trade is enabled (D-079 §8).
      if (!world.trade.enabled) {
        throw new RangeError(`${path()} seller building is outside the market`);
      }
      if (!seller.operational) {
        throw new RangeError(`${path()} seller building is not operational`);
      }
    }
    const sellerSlot = opening.slotOf.get(sellerId);
    const cell = sellerSlot === undefined ? -1 : goodId * ownerCount + sellerSlot;
    if (cell < 0 || opening.present[cell] !== 1) {
      throw new RangeError(`${path()} references a seller lot that does not exist on opening inventory`);
    }
    const lotQuantity = opening.quantity[cell] ?? 0;
    const slot = buyerSlot.get(buyerId) ?? -1;
    if (slot < 0) throw new RangeError(`${path()} buyer building is outside the market`);
    const duplicateKey = (slot * goodCount + goodId) * ownerCount + (sellerSlot ?? 0);
    if (reservationKeys.has(duplicateKey)) {
      throw new RangeError(`${path()} duplicates a buyer/good/seller reservation`);
    }
    reservationKeys.add(duplicateKey);
    const reserved = (reservedByLot[cell] ?? 0) + quantity;
    if (reserved > lotQuantity + tolerance(lotQuantity, reserved, reservedByGood[goodId] ?? 0)) {
      throw new RangeError(`${path()} over-reserves seller lot ${lotKey(goodId, sellerId)}`);
    }
    reservedByLot[cell] = reserved;
    const group = slot * goodCount + goodId;
    reservedByBuyerGood[group] = (reservedByBuyerGood[group] ?? 0) + quantity;
    if (groupHead[group] === -1) groupHead[group] = index;
    else groupNext[groupTail[group] ?? 0] = index;
    groupTail[group] = index;
  }

  const productionByGood = new Array<number>(goodCount).fill(0);
  const usedByGood = new Array<number>(goodCount).fill(0);
  const buildingResults: BuildingProductionResult[] = [];
  const uses: ReservationUseColumns = { buyer: [], good: [], seller: [], reserved: [], used: [] };
  const next = copyLotTable(opening);

  for (let buyerIndex = 0; buyerIndex < buildingIds.length; buyerIndex += 1) {
    const buildingId = buildingIds[buyerIndex] ?? 0;
    const building = buildingById.get(buildingId);
    if (building === undefined) throw new RangeError(`unknown building ${String(buildingId)}`);
    const definition = definitionsById.get(building.definitionId);
    if (definition === undefined) throw new RangeError(`building ${String(building.id)} has no definition`);
    const capacity = lookups.capacityOf(building.id);
    if (!capacity.isProductionBuilding) continue;

    let executedTU = capacity.capacityTU;
    const inputResults: BuildingProductionResult["inputs"][number][] = [];
    const sortedInputs = sortedByGood(definition.inputs);
    for (const input of sortedInputs) {
      const reserved = reservedByBuyerGood[buyerIndex * goodCount + input.goodId] ?? 0;
      const fromInput = reserved / input.quantityPerThroughputUnit;
      if (fromInput < executedTU) executedTU = fromInput;
    }
    if (!Number.isFinite(executedTU) || executedTU < 0) {
      throw new RangeError(`building ${String(building.id)} has invalid executed throughput`);
    }

    for (const input of sortedInputs) {
      const group = buyerIndex * goodCount + input.goodId;
      const reserved = reservedByBuyerGood[group] ?? 0;
      let used = input.quantityPerThroughputUnit * executedTU;
      if (used > reserved + tolerance(reserved, used)) {
        throw new RangeError(`building ${String(building.id)} input use exceeds reservation`);
      }
      if (used > reserved) used = reserved;

      let actualUsed = used;
      const head = groupHead[group] ?? -1;
      if (head >= 0) {
        let totalReserved = 0;
        for (let item = head; item >= 0; item = groupNext[item] ?? -1) totalReserved += reservations.quantity[item] ?? 0;
        actualUsed = 0;
        for (let item = head; item >= 0; item = groupNext[item] ?? -1) {
          const quantity = reservations.quantity[item] ?? 0;
          const sellerId = reservations.seller[item] ?? 0;
          let reservationUsed: number;
          if (used <= tolerance(totalReserved)) reservationUsed = 0;
          else if (used >= totalReserved - tolerance(totalReserved, used)) reservationUsed = quantity;
          else reservationUsed = (used * quantity) / totalReserved;
          reservationUsed = Math.min(quantity, Math.max(0, reservationUsed));
          actualUsed += reservationUsed;
          uses.buyer.push(building.id);
          uses.good.push(input.goodId);
          uses.seller.push(sellerId);
          uses.reserved.push(quantity);
          uses.used.push(reservationUsed);
          const cell = input.goodId * ownerCount + (next.slotOf.get(sellerId) ?? 0);
          if (next.present[cell] !== 1) throw new RangeError(`missing seller lot ${lotKey(input.goodId, sellerId)}`);
          const current = next.quantity[cell] ?? 0;
          const remaining = current - reservationUsed;
          if (remaining < -tolerance(current, reservationUsed, reservedByGood[input.goodId] ?? 0)) {
            throw new RangeError(`seller lot ${lotKey(input.goodId, sellerId)} would become negative`);
          }
          if (remaining <= 0) {
            next.present[cell] = 0;
            next.quantity[cell] = 0;
          } else {
            next.quantity[cell] = remaining;
          }
        }
        if (Math.abs(actualUsed - used) > tolerance(used, actualUsed)) {
          throw new RangeError(`reservation use does not reconcile for ${String(building.id)}:${String(input.goodId)}`);
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
    const sortedOutputs = sortedByGood(definition.outputs);
    // M9 technology: researched sector productivity increases physical output from
    // the same executed throughput (and therefore the same inputs). It does not
    // change capacity, prices, or the input recipe.
    const ownerId = provinceOwners.get(building.provinceId);
    const owner = ownerId === undefined ? undefined : lookups.countryById.get(ownerId);
    const technologyFactor =
      owner === undefined
        ? 1
        : technologyProductivityFactor(owner, definitions, definition.sector);
    const producerSlot = next.slotOf.get(building.id) ?? -1;
    const keptRow = lookups.ownConsumption?.byBuilding.get(building.id);
    for (const output of sortedOutputs) {
      const produced = output.quantityPerThroughputUnit * executedTU * technologyFactor;
      if (!Number.isFinite(produced) || produced < 0) {
        throw new RangeError(`building ${String(building.id)} produced an invalid output quantity`);
      }
      // P5 (D-143 §2): the owner household's kept food never reaches the lot. The plan
      // was computed from this same capacity, so it never exceeds the output.
      const kept = keptRow === undefined ? 0 : (keptRow[output.goodId] ?? 0);
      if (kept > produced + tolerance(produced, kept)) {
        throw new RangeError(`building ${String(building.id)} keeps more than it produced`);
      }
      const quantity = kept > 0 ? Math.max(0, produced - kept) : produced;
      if (kept > 0) outputResults.push({ goodId: output.goodId, quantity, ownConsumption: kept });
      if (quantity > 0) {
        if (!(kept > 0)) outputResults.push({ goodId: output.goodId, quantity });
        productionByGood[output.goodId] = (productionByGood[output.goodId] ?? 0) + quantity;
        if (producerSlot < 0) throw new RangeError(`building ${String(building.id)} has no lot slot`);
        const cell = output.goodId * ownerCount + producerSlot;
        if (next.present[cell] === 1) {
          next.quantity[cell] = (next.quantity[cell] ?? 0) + quantity;
        } else {
          next.present[cell] = 1;
          next.quantity[cell] = 0 + quantity;
        }
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

  const capacityByGood = applyOverflow
    ? storageCapacityOf(world, definitions, market.id, lookups)
    : new Array<number>(goodCount).fill(0);
  const overflowLosses = applyOverflow
    ? applyOverflowToTable(next, capacityByGood, goodCount)
    : [];
  const lossByGood = new Array<number>(goodCount).fill(0);
  for (const loss of overflowLosses) {
    lossByGood[loss.goodId] = (lossByGood[loss.goodId] ?? 0) + loss.quantity;
  }

  const closingByGood = new Array<number>(goodCount).fill(0);
  for (let goodId = 0; goodId < goodCount; goodId += 1) {
    const base = goodId * ownerCount;
    let closing = 0;
    for (let slot = 0; slot < ownerCount; slot += 1) {
      if (next.present[base + slot] === 1) closing += next.quantity[base + slot] ?? 0;
    }
    closingByGood[goodId] = closing;
  }

  const inventory: InventoryFlow[] = goods.map((good) => {
    const goodId = good.id;
    const openingStock = openingByGood[goodId] ?? 0;
    const production = productionByGood[goodId] ?? 0;
    const used = usedByGood[goodId] ?? 0;
    const loss = lossByGood[goodId] ?? 0;
    const closing = closingByGood[goodId] ?? 0;
    const expected = openingStock + production - used - loss;
    // Scale by the gross physical terms so large-population cancellation does not
    // masquerade as a conservation failure.
    if (
      Math.abs(expected - closing) >
      tolerance(openingStock, production, used, loss, expected, closing)
    ) {
      throw new RangeError(
        `inventory conservation failed for good ${String(goodId)}: ${String(expected)} != ${String(closing)}`,
      );
    }
    return {
      goodId,
      openingStock,
      production,
      usedAsInput: used,
      recordedLoss: loss,
      closingStock: closing,
    };
  });

  return { buildings: buildingResults, uses, inventory, overflowLosses, lots: next };
}

/** A recipe's items in ascending good order, memoised per item array (D-139). */
const sortedRecipeCache = new WeakMap<readonly GoodQuantityDef[], readonly GoodQuantityDef[]>();

function sortedByGood(items: readonly GoodQuantityDef[]): readonly GoodQuantityDef[] {
  let sorted = sortedRecipeCache.get(items);
  if (sorted === undefined) {
    sorted = [...items].sort((left, right) => left.goodId - right.goodId);
    sortedRecipeCache.set(items, sorted);
  }
  return sorted;
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
  const columns = { buyer: [] as number[], good: [] as number[], seller: [] as number[], quantity: [] as number[] };
  for (let index = 0; index < reservations.length; index += 1) {
    const reservation = reservations[index];
    if (reservation === undefined) throw new RangeError("missing reservation");
    const path = `inputReservations[${String(index)}]`;
    assertReservationShape(reservation, path);
    if (reservation.marketId !== market.id) {
      throw new RangeError(`${path}.marketId does not match the M3 market`);
    }
    columns.buyer.push(reservation.buyerBuildingId);
    columns.good.push(reservation.goodId);
    columns.seller.push(reservation.sellerBuildingId);
    columns.quantity.push(reservation.quantity);
  }
  const opening = lotTableFromLots(
    market.stockLots,
    lookups.buildingIdsByMarket.get(market.id) ?? [],
    definitions.goods.length,
  );
  const core = runProductionCore(
    world,
    definitions,
    market,
    lookups,
    opening,
    columns,
    options.applyOverflow !== false,
  );
  const canonicalLots = lotTableToLots(core.lots);
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
  return {
    marketId: market.id,
    buildings: core.buildings,
    reservationUses: reservationUseObjects(market.id, core.uses),
    inventory: core.inventory,
    overflowLosses: core.overflowLosses,
  };
}

/** Reservation uses as objects in (buyer, good, seller) order. */
export function reservationUseObjects(marketId: number, uses: ReservationUseColumns): ReservationUse[] {
  const objects: ReservationUse[] = [];
  for (let index = 0; index < uses.buyer.length; index += 1) {
    const reserved = uses.reserved[index] ?? 0;
    const used = uses.used[index] ?? 0;
    objects.push({
      buyerBuildingId: uses.buyer[index] ?? 0,
      marketId,
      goodId: uses.good[index] ?? 0,
      sellerBuildingId: uses.seller[index] ?? 0,
      reservedQuantity: reserved,
      usedQuantity: used,
      releasedQuantity: Math.max(0, reserved - used),
    });
  }
  objects.sort((left, right) => {
    if (left.buyerBuildingId !== right.buyerBuildingId) {
      return left.buyerBuildingId - right.buyerBuildingId;
    }
    if (left.goodId !== right.goodId) return left.goodId - right.goodId;
    return left.sellerBuildingId - right.sellerBuildingId;
  });
  return objects;
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
