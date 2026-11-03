/**
 * P2 test helpers for province ownership (D-118). Country territory and occupation
 * live on `World.provinces.ownership`; these helpers express the M10-era
 * assertions ("who occupies this province?") against that record.
 */
import {
  assertValidWorld,
  createInitialWorld,
  createProvinceState,
  type Day,
  type EconomyScenarioDef,
  type Id,
  type World,
} from "@century/sim";

/** The foreign controller of a province, or null when its owner controls it. */
export function occupierOf(world: World, provinceId: Id): Id | null {
  const record = world.provinces.ownership.find((entry) => entry.provinceId === provinceId);
  if (record === undefined || record.controllerPolityId === record.ownerPolityId) return null;
  return record.controllerPolityId;
}

/** Day the current foreign control began, or null when the owner controls it. */
export function occupiedSinceOf(world: World, provinceId: Id): Day | null {
  const record = world.provinces.ownership.find((entry) => entry.provinceId === provinceId);
  return record === undefined ? null : record.controlledSinceDay;
}

/** Put a province under a foreign controller directly (test setup only). */
export function setOccupier(world: World, provinceId: Id, controllerPolityId: Id, day: Day): void {
  const record = world.provinces.ownership.find((entry) => entry.provinceId === provinceId);
  if (record === undefined) throw new Error(`province ${String(provinceId)} has no ownership record`);
  record.controllerPolityId = controllerPolityId;
  record.controlledSinceDay = day;
  record.specialStatus = "occupied";
}

/**
 * A world that holds only the 1900 political geography: every province's ownership
 * record (owner, controller, claims, status and transfer history) and an empty
 * economic record, with no population, buildings, markets or countries.
 *
 * Since P2 (D-118) a legal transfer in an economic world moves the province's
 * economy into the recipient's customs territory, and transfers to polities that are
 * not yet simulation countries are rejected. The M12 reference sequences (Poland in
 * 1918, the 1960s independence waves, ...) transfer provinces to such future
 * polities, so they exercise the provincial ownership module on this world.
 */
export function politicalGeographyWorld(scenario: EconomyScenarioDef, seed: number): World {
  if (scenario.provinces === undefined) throw new Error("scenario has no province definitions");
  const world = createInitialWorld({ seed, scenarioId: scenario.population.scenarioId });
  world.provinces = createProvinceState(scenario.provinces, world.startDayIndex);
  world.provinceEconomies = [...scenario.population.provinceEconomies]
    .sort((left, right) => left.id - right.id)
    .map((province) => ({
      id: province.id,
      key: province.key,
      name: province.name,
      popBlockIds: [],
      marketId: null,
      buildingInstanceIds: [],
      unrest: 0,
      infrastructure: province.infrastructure ?? 0.5,
      arableLandHa: province.arableLandHa ?? 0,
      pastureHa: province.pastureHa ?? 0,
      urbanShare: province.urbanShare ?? 0,
      wageRUSDPerYearByProfession: [],
    }));
  assertValidWorld(world);
  return world;
}
