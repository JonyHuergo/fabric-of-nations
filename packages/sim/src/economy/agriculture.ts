/**
 * P5 (D-143) land, harvests and own consumption.
 *
 * Land. A province's HYDE 3.3 cropland (`arableLandHa`) and grazing land (`pastureHa`)
 * are shared among its operational buildings that farm that kind of land
 * (`BuildingDef.landUse`), in proportion to their levels. A building's land factor is
 * `(hectares per level / FARM_REFERENCE_HECTARES_PER_LEVEL)^FARM_LAND_ELASTICITY`, and
 * its staffing enters as `staffing^FARM_LABOUR_ELASTICITY` (production.ts). Because
 * the elasticities sum to 1 the function has constant returns, and the marginal
 * product of labour falls as labour per hectare rises. A building with no land of its
 * kind produces nothing; world creation and construction reject such placements.
 *
 * Harvest weather. One keyed draw per (province, calendar year), purpose
 * `harvest.weather`, gives a lognormal factor with mean 1. It is a pure function of the
 * seed, province and year, so nothing is stored and replay is exact.
 *
 * Own consumption. A household that owns a primary food building (an agriculture
 * building without inputs, owned privately by a population block) keeps the
 * subsistence quantities of the food goods it makes before anything reaches the
 * market. The plan is computed before market clearing from the same capacity results
 * production uses; production diverts the kept quantity from the owner's output lot,
 * the block's market demand is reduced by it, its calories count toward food
 * sufficiency, and settlement treats its value at the opening price as a wage in kind
 * to the owner block (day.ts, settlement.ts). No money moves.
 *
 * Cadence: land shares and weather are evaluated with the daily capacity; the plan is
 * daily. All functions are pure in the world they receive.
 */

import { civilDateToDayIndex, dayIndexToCivilDate } from "../calendar.js";
import { QUANTITY_TOLERANCE } from "../population/constants.js";
import { populationTotal } from "../population/state.js";
import type { PopulationDefinitions } from "../population/types.js";
import { drawUint32 } from "../rng.js";
import type { Id, Seed } from "../types.js";
import type { World } from "../world.js";
import type { FinanceIndex } from "./accounts.js";
import {
  FARM_LAND_ELASTICITY,
  FARM_REFERENCE_HECTARES_PER_LEVEL,
  HARVEST_WEATHER_PURPOSE,
  HARVEST_WEATHER_SIGMA,
} from "./constants.js";
import type { BuildingCapacityResult, ProductionLookups } from "./production.js";
import { technologyProductivityFactor } from "./technology.js";
import type { BuildingDef, EconomyDefinitions, LandUse } from "./types.js";

const UINT32_RANGE = 4_294_967_296;

/**
 * Harvest weather factor of a province in a calendar year, dimensionless, mean 1.
 * Z is standard normal by Box–Muller from two keyed uniforms (draw indices 0 and 1)
 * keyed to 1 January of the year; factor = exp(σZ − σ²/2).
 */
export function harvestWeatherFactor(seed: Seed, provinceId: Id, year: number): number {
  const day = civilDateToDayIndex(year, 1, 1);
  const first = drawUint32({ seed, day, entityId: provinceId, purpose: HARVEST_WEATHER_PURPOSE, drawIndex: 0 });
  const second = drawUint32({ seed, day, entityId: provinceId, purpose: HARVEST_WEATHER_PURPOSE, drawIndex: 1 });
  // (0, 1]: never log(0).
  const u1 = (first + 1) / UINT32_RANGE;
  const u2 = second / UINT32_RANGE;
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.exp(HARVEST_WEATHER_SIGMA * z - (HARVEST_WEATHER_SIGMA * HARVEST_WEATHER_SIGMA) / 2);
}

/** Hectares of one land kind in a province record. */
export function provinceLandHa(
  province: { readonly arableLandHa: number; readonly pastureHa: number },
  use: LandUse,
): number {
  return use === "cropland" ? province.arableLandHa : province.pastureHa;
}

/**
 * Hectares per building level by province and land kind: the province's land of the
 * kind divided by the summed levels of its operational buildings of that kind.
 * Provinces without such buildings are absent. Key: `provinceId * 2 + kind`.
 */
export function landPerLevelByProvince(
  world: World,
  definitionById: ReadonlyMap<Id, BuildingDef>,
): Map<number, number> {
  const levels = new Map<number, number>();
  for (const building of world.buildings) {
    if (!building.operational) continue;
    const use = definitionById.get(building.definitionId)?.landUse;
    if (use === undefined) continue;
    const key = landKey(building.provinceId, use);
    levels.set(key, (levels.get(key) ?? 0) + building.level);
  }
  const result = new Map<number, number>();
  if (levels.size === 0) return result;
  const provinceById = new Map(world.provinceEconomies.map((province) => [province.id, province]));
  for (const [key, level] of levels) {
    const provinceId = Math.floor(key / 2);
    const use: LandUse = key % 2 === 0 ? "cropland" : "pasture";
    const province = provinceById.get(provinceId);
    const land = province === undefined ? 0 : provinceLandHa(province, use);
    result.set(key, level > 0 ? land / level : 0);
  }
  return result;
}

/** Key of a (province, land kind) pair in `landPerLevelByProvince`. */
export function landKey(provinceId: Id, use: LandUse): number {
  return provinceId * 2 + (use === "cropland" ? 0 : 1);
}

/** Land factor of a building with `hectaresPerLevel`: (h / reference)^landElasticity. */
export function farmLandFactor(hectaresPerLevel: number): number {
  if (!(hectaresPerLevel > 0)) return 0;
  return (hectaresPerLevel / FARM_REFERENCE_HECTARES_PER_LEVEL) ** FARM_LAND_ELASTICITY;
}

/**
 * World creation (D-143 §1): divide each land-using building's technique by its land
 * factor under the starting land shares, so its 1900 output is the scenario's
 * calibrated output. A land-using building in a province without land of its kind is
 * rejected: it could never produce.
 */
export function normaliseFarmTechniques(world: World, definitions: EconomyDefinitions): void {
  const definitionById = new Map(definitions.buildings.map((definition) => [definition.id, definition]));
  const perLevel = landPerLevelByProvince(world, definitionById);
  for (const building of world.buildings) {
    const use = definitionById.get(building.definitionId)?.landUse;
    if (use === undefined) continue;
    if (!building.operational) {
      throw new RangeError(
        `building ${String(building.id)} farms ${use} but starts closed; land shares need operational farms`,
      );
    }
    const factor = farmLandFactor(perLevel.get(landKey(building.provinceId, use)) ?? 0);
    if (!(factor > 0)) {
      throw new RangeError(
        `building ${String(building.id)} farms ${use} in province ${String(building.provinceId)}, which has none`,
      );
    }
    building.technique /= factor;
    if (!Number.isFinite(building.technique) || !(building.technique > 0)) {
      throw new RangeError(`building ${String(building.id)} has an invalid land-normalised technique`);
    }
  }
}

/** One building's kept output of one good (physical units). */
export interface OwnConsumptionEntry {
  readonly buildingId: Id;
  readonly popBlockId: Id;
  readonly goodId: number;
  readonly quantity: number;
}

/**
 * The day's own-consumption plan. `byBuilding` and `byBlock` index kept quantities by
 * good id; `entries` lists them in (block, building, good) order.
 */
export interface OwnConsumptionPlan {
  readonly goodCount: number;
  readonly byBuilding: ReadonlyMap<Id, Float64Array>;
  readonly byBlock: ReadonlyMap<Id, Float64Array>;
  /** Owner block of every building in the plan. */
  readonly ownerBlockOf: ReadonlyMap<Id, Id>;
  readonly entries: readonly OwnConsumptionEntry[];
}

export const EMPTY_OWN_CONSUMPTION: OwnConsumptionPlan = {
  goodCount: 0,
  byBuilding: new Map(),
  byBlock: new Map(),
  ownerBlockOf: new Map(),
  entries: [],
};

/** Whether a definition is a primary food producer whose owner keeps its food. */
export function isOwnFoodBuilding(definition: BuildingDef, foodGoodIds: ReadonlySet<number>): boolean {
  return (
    definition.sector === "agriculture" &&
    definition.inputs.length === 0 &&
    definition.outputs.some((output) => foodGoodIds.has(output.goodId))
  );
}

/**
 * Build the day's plan. For each owner block and good its own food buildings make,
 * kept = min(subsistence quantity per person × population, the buildings' output
 * today), spread over the buildings in proportion to their output. Expected output is
 * `quantityPerThroughputUnit × capacityTU × technology factor`, the exact expression
 * production uses for a building without inputs.
 */
export function planOwnConsumption(
  world: World,
  definitions: EconomyDefinitions,
  populationDefinitions: PopulationDefinitions,
  lookups: ProductionLookups,
  index: FinanceIndex,
  /**
   * Presentation only: plan the buildings of these provinces alone (the UI's focused
   * province). The simulation always plans the whole world.
   */
  onlyProvinceIds?: ReadonlySet<Id>,
): OwnConsumptionPlan {
  const goodCount = definitions.goods.length;
  const goodIdByKey = new Map(definitions.goods.map((good) => [good.key, good.id]));
  const subsistence = new Float64Array(goodCount);
  const subsistenceGoods = new Set<number>();
  for (const need of populationDefinitions.needs) {
    if (need.tier !== "subsistence") continue;
    for (const item of need.items) {
      const goodId = goodIdByKey.get(item.goodKey);
      if (goodId === undefined) continue;
      subsistence[goodId] = (subsistence[goodId] ?? 0) + item.quantityPerCapitaPerDay;
      subsistenceGoods.add(goodId);
    }
  }
  if (subsistenceGoods.size === 0) return EMPTY_OWN_CONSUMPTION;
  const definitionById = lookups.definitionById ?? new Map(definitions.buildings.map((d) => [d.id, d]));

  // Owner block → its own food buildings (ascending id) with their expected output.
  const buildingsOfBlock = new Map<Id, { buildingId: Id; output: Float64Array }[]>();
  const blockById = new Map(world.popBlocks.map((block) => [block.id, block]));
  for (const building of world.buildings) {
    if (!building.operational || building.ownerKind !== "private") continue;
    if (onlyProvinceIds !== undefined && !onlyProvinceIds.has(building.provinceId)) continue;
    const definition = definitionById.get(building.definitionId);
    if (definition === undefined || !isOwnFoodBuilding(definition, subsistenceGoods)) continue;
    const account = index.account(building.ownerAccountId);
    if (account === undefined || account.ownerKind !== "popBlock" || account.ownerId === null) continue;
    if (account.subtype !== "household-cash" || !blockById.has(account.ownerId)) continue;
    const capacity: BuildingCapacityResult = lookups.capacityOf(building.id);
    if (!capacity.isProductionBuilding || !(capacity.capacityTU > 0)) continue;
    const ownerId = lookups.provinceOwners.get(building.provinceId);
    const owner = ownerId === undefined ? undefined : lookups.countryById.get(ownerId);
    const technologyFactor =
      owner === undefined ? 1 : technologyProductivityFactor(owner, definitions, definition.sector);
    const output = new Float64Array(goodCount);
    let any = false;
    for (const item of definition.outputs) {
      if (!subsistenceGoods.has(item.goodId)) continue;
      const quantity = item.quantityPerThroughputUnit * capacity.capacityTU * technologyFactor;
      if (quantity > 0) {
        output[item.goodId] = quantity;
        any = true;
      }
    }
    if (!any) continue;
    const list = buildingsOfBlock.get(account.ownerId);
    if (list === undefined) buildingsOfBlock.set(account.ownerId, [{ buildingId: building.id, output }]);
    else list.push({ buildingId: building.id, output });
  }

  const byBuilding = new Map<Id, Float64Array>();
  const byBlock = new Map<Id, Float64Array>();
  const ownerBlockOf = new Map<Id, Id>();
  const entries: OwnConsumptionEntry[] = [];
  const blockIds = [...buildingsOfBlock.keys()].sort((left, right) => left - right);
  for (const blockId of blockIds) {
    const block = blockById.get(blockId);
    const list = buildingsOfBlock.get(blockId);
    if (block === undefined || list === undefined) continue;
    const population = populationTotal(block);
    if (population <= 0) continue;
    list.sort((left, right) => left.buildingId - right.buildingId);
    const kept = new Float64Array(goodCount);
    for (let goodId = 0; goodId < goodCount; goodId += 1) {
      const need = (subsistence[goodId] ?? 0) * population;
      if (!(need > 0)) continue;
      let available = 0;
      for (const entry of list) available += entry.output[goodId] ?? 0;
      if (!(available > 0)) continue;
      // Share of each building's output kept: all of it when the need exceeds it.
      const share = need >= available ? 1 : need / available;
      for (const entry of list) {
        const produced = entry.output[goodId] ?? 0;
        if (!(produced > 0)) continue;
        const quantity = share === 1 ? produced : produced * share;
        if (!(quantity > QUANTITY_TOLERANCE)) continue;
        let row = byBuilding.get(entry.buildingId);
        if (row === undefined) {
          row = new Float64Array(goodCount);
          byBuilding.set(entry.buildingId, row);
          ownerBlockOf.set(entry.buildingId, blockId);
        }
        row[goodId] = quantity;
        kept[goodId] = (kept[goodId] ?? 0) + quantity;
      }
    }
    let anyKept = false;
    for (let goodId = 0; goodId < goodCount; goodId += 1) if ((kept[goodId] ?? 0) > 0) anyKept = true;
    if (anyKept) byBlock.set(blockId, kept);
  }
  for (const blockId of blockIds) {
    for (const entry of buildingsOfBlock.get(blockId) ?? []) {
      const row = byBuilding.get(entry.buildingId);
      if (row === undefined) continue;
      for (let goodId = 0; goodId < goodCount; goodId += 1) {
        const quantity = row[goodId] ?? 0;
        if (quantity > 0) entries.push({ buildingId: entry.buildingId, popBlockId: blockId, goodId, quantity });
      }
    }
  }
  return { goodCount, byBuilding, byBlock, ownerBlockOf, entries };
}

/** Calendar year of a world day (harvest weather key). */
export function harvestYearOf(dayIndex: number): number {
  return dayIndexToCivilDate(dayIndex).year;
}
