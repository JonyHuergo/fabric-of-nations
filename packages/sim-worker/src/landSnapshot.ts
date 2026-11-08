/**
 * P5 (D-143) land sections of the UI snapshot: the harvest weather column of every
 * province (the harvest lens) and, for the focused province, its land, today's farm
 * output and own consumption, and its discovered deposits. Presentation only: computed
 * from the world after the day with the simulation's own functions, never written back.
 * Hidden deposits are never sent.
 */

import {
  buildFinanceIndex,
  buildProductionLookups,
  dayIndexToCivilDate,
  depositRemaining,
  harvestWeatherFactor,
  hydroCapacityPerDay,
  hydroRoomPerDay,
  planOwnConsumption,
  RESOURCE_UNITS,
  technologyProductivityFactor,
  type EconomyDefinitions,
  type Id,
  type PopulationDefinitions,
  type World,
} from "@century/sim";
import type { GoodQuantitySnapshot, ProvinceLandSnapshot } from "./protocol.js";

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** This year's harvest factor of a province with farm land, rounded to 0.01; else null. */
export function provinceHarvestFactor(
  world: World,
  province: { readonly id: Id; readonly arableLandHa: number; readonly pastureHa: number },
): number | null {
  if (!(province.arableLandHa > 0) && !(province.pastureHa > 0)) return null;
  return round(harvestWeatherFactor(world.seed, province.id, dayIndexToCivilDate(world.dayIndex).year), 2);
}

function quantities(byGood: Map<number, number>): readonly GoodQuantitySnapshot[] {
  return [...byGood.entries()]
    .filter(([, quantity]) => quantity > 0)
    .sort((left, right) => left[0] - right[0])
    .map(([goodId, quantity]) => ({ goodId, quantity: round(quantity, 1) }));
}

/** The focused province's land, harvest, own consumption and known deposits; null when unknown. */
export function provinceLandSnapshot(
  world: World,
  definitions: EconomyDefinitions,
  populationDefinitions: PopulationDefinitions | undefined,
  provinceId: Id | null,
): ProvinceLandSnapshot | null {
  if (provinceId === null) return null;
  const province = world.provinceEconomies.find((entry) => entry.id === provinceId);
  if (province === undefined) return null;
  const definitionById = new Map(definitions.buildings.map((definition) => [definition.id, definition]));
  const lookups = buildProductionLookups(world, definitions);
  const ownerId = lookups.provinceOwners.get(province.id);
  const owner = ownerId === undefined ? undefined : lookups.countryById.get(ownerId);

  let farms = 0;
  let farmLevels = 0;
  let croplandWorkers = 0;
  const output = new Map<number, number>();
  for (const building of world.buildings) {
    if (building.provinceId !== province.id || !building.operational) continue;
    const definition = definitionById.get(building.definitionId);
    if (definition === undefined) continue;
    if (definition.landUse !== undefined) {
      farms += 1;
      farmLevels += building.level;
    }
    if (definition.sector !== "agriculture" || definition.inputs.length > 0) continue;
    const capacity = lookups.capacityOf(building.id);
    if (definition.landUse === "cropland") croplandWorkers += capacity.assignedWorkers;
    const technology = owner === undefined ? 1 : technologyProductivityFactor(owner, definitions, definition.sector);
    for (const item of definition.outputs) {
      const quantity = item.quantityPerThroughputUnit * capacity.capacityTU * technology;
      if (quantity > 0) output.set(item.goodId, (output.get(item.goodId) ?? 0) + quantity);
    }
  }

  const kept = new Map<number, number>();
  if (populationDefinitions !== undefined && output.size > 0) {
    const plan = planOwnConsumption(
      world,
      definitions,
      populationDefinitions,
      lookups,
      buildFinanceIndex(world.finance),
      new Set([province.id]),
    );
    const buildingProvince = new Map(world.buildings.map((building) => [building.id, building.provinceId]));
    for (const entry of plan.entries) {
      if (buildingProvince.get(entry.buildingId) !== province.id) continue;
      kept.set(entry.goodId, (kept.get(entry.goodId) ?? 0) + entry.quantity);
    }
  }

  const deposits = world.resources.deposits
    .filter((deposit) => deposit.provinceId === province.id && deposit.discovered)
    .map((deposit) => ({
      resource: deposit.resource,
      unit: RESOURCE_UNITS[deposit.resource],
      remaining: round(depositRemaining(deposit), 0),
      initialStock: deposit.initialStock,
      quality: deposit.quality,
      discoveredOnDay: deposit.discoveredOnDay,
    }));

  return {
    croplandHa: province.arableLandHa,
    pastureHa: province.pastureHa,
    harvestYear: dayIndexToCivilDate(world.dayIndex).year,
    harvestFactor: round(harvestWeatherFactor(world.seed, province.id, dayIndexToCivilDate(world.dayIndex).year), 3),
    farms,
    farmLevels,
    workersPerCroplandHa: province.arableLandHa > 0 ? round(croplandWorkers / province.arableLandHa, 4) : 0,
    farmOutputToday: quantities(output),
    keptToday: quantities(kept),
    deposits,
    // P5b (C-12): the province's river flow for hydro stations, null where it has none.
    hydro:
      province.hydroPotentialMWhPerYear !== null && province.hydroPotentialMWhPerYear > 0
        ? {
            capacityMWhPerDay: round(hydroCapacityPerDay(province), 1),
            roomMWhPerDay: round(hydroRoomPerDay(world, definitions, province.id), 1),
          }
        : null,
  };
}
