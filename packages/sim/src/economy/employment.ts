/**
 * Deterministic M3b employment evaluation.
 *
 * A block can fill only jobs of its existing profession, subject to literacy and
 * wealth qualification, participation, and working age. Job slots use the M3
 * throughput/job-coefficient formula. Existing assignments are retained where
 * possible; remaining vacancies are filled by largest-remainder apportionment
 * across eligible blocks, then distributed across building vacancies.
 *
 * No production, market clearing, wages, or pricing is implemented here.
 */

import { assertValidDayIndex, dayIndexToCivilDate, isTerminalDayIndex } from "../calendar.js";
import { workingAgePopulation } from "../population/state.js";
import { drawUint32 } from "../rng.js";
import type { DayIndex, Id } from "../types.js";
import type { World } from "../world.js";
import { buildProvinceOwnerMap } from "./country.js";
import { assertValidEconomyDefinitions } from "./definitions.js";
import {
  assertValidLabourEmployment,
  refreshLabourEmployment,
  repairLabourEmploymentAfterDemography,
} from "./labourMarket.js";
import type {
  BuildingDef,
  BuildingInstance,
  EconomyDefinitions,
  EmploymentAssignment,
  ProfessionDef,
} from "./types.js";

/** Purpose identifiers for the keyed tie-break draws. */
export const EMPLOYMENT_RETENTION_PURPOSE = "employment.retain";
export const EMPLOYMENT_BLOCK_REMAINDER_PURPOSE = "employment.block-remainder";
/** Retired by D-133 (pairing needs no fill-order draw); kept so audits resolve the name. */
export const EMPLOYMENT_FILL_ORDER_PURPOSE = "employment.fill-order";
export const EMPLOYMENT_BUILDING_REMAINDER_PURPOSE = "employment.building-remainder";

export interface EmploymentRefreshOptions {
  /** Run even when the calendar/dirty check would not otherwise be due. */
  readonly force?: boolean;
}

export interface EmploymentRefreshResult {
  readonly refreshed: boolean;
  readonly dayIndex: DayIndex;
  readonly retainedAssignments: number;
  readonly releasedAssignments: number;
  readonly releasedWorkers: number;
  readonly createdAssignments: number;
  readonly assignedWorkers: number;
  readonly unemployedEligible: number;
  readonly unfilledSlots: number;
}

function emptyResult(dayIndex: DayIndex): EmploymentRefreshResult {
  return {
    refreshed: false,
    dayIndex,
    retainedAssignments: 0,
    releasedAssignments: 0,
    releasedWorkers: 0,
    createdAssignments: 0,
    assignedWorkers: 0,
    unemployedEligible: 0,
    unfilledSlots: 0,
  };
}

/** Integer job slots at the building's current level and condition. */
export function jobSlotsForBuilding(
  definition: BuildingDef,
  building: BuildingInstance,
  professionId: Id,
): number {
  if (!building.operational) return 0;
  const job = definition.jobs.find((candidate) => candidate.professionId === professionId);
  if (job === undefined) return 0;
  const raw =
    job.workersPerThroughputUnit *
    definition.referenceThroughputPerDayAtLevelOne *
    building.level *
    building.condition;
  if (!Number.isFinite(raw) || raw < 0) {
    throw new RangeError("building job-slot capacity must be finite and non-negative");
  }
  return Math.floor(raw);
}

/** Qualified, participating workforce of a block for one profession. */
export function eligibleWorkforceForBlock(
  block: World["popBlocks"][number],
  profession: ProfessionDef,
): number {
  if (block.professionId !== profession.id) return 0;
  if (block.literacy < profession.qualificationLiteracy) return 0;
  if (block.wealthLevel < profession.qualificationWealthLevel) return 0;
  return Math.floor(workingAgePopulation(block) * profession.participationRate);
}

/**
 * M5 labor-access rule.
 *
 * A resident may take a job in any province of their own country (internal labor
 * mobility). A cross-country assignment additionally requires the destination
 * country's provisional open-border policy. Countryless provinces form a single
 * unrestricted area so pre-M5 fixtures keep their behavior.
 *
 * The GDD describes travel/migration limits without fixing them; this is the
 * smallest documented rule that prevents an unconstrained global labor pool
 * (D-052).
 */
export function laborAccessAllowed(
  provinceOwners: ReadonlyMap<Id, Id>,
  countries: ReadonlyMap<Id, World["countries"][number]>,
  sourceProvinceId: Id,
  destinationProvinceId: Id,
): boolean {
  const sourceCountry = provinceOwners.get(sourceProvinceId) ?? null;
  const destinationCountry = provinceOwners.get(destinationProvinceId) ?? null;
  if (sourceCountry === destinationCountry) return true;
  if (destinationCountry === null) return false;
  return countries.get(destinationCountry)?.immigrationOpen === true;
}

function countryMaps(world: World): {
  readonly provinceOwners: ReadonlyMap<Id, Id>;
  readonly countries: ReadonlyMap<Id, World["countries"][number]>;
} {
  return {
    provinceOwners: buildProvinceOwnerMap(world),
    countries: new Map(world.countries.map((country) => [country.id, country])),
  };
}

/** True when the civil calendar or dirty marker requires employment evaluation. */
export function isEmploymentRefreshDue(world: World, dayIndex: DayIndex): boolean {  assertValidDayIndex(dayIndex);
  if (isTerminalDayIndex(dayIndex)) return false;
  if (dayIndex < world.startDayIndex) {
    throw new RangeError("employment refresh day must not precede the scenario start");
  }
  if (typeof world.employmentDirty !== "boolean") {
    throw new TypeError("world.employmentDirty must be a boolean");
  }
  return world.employmentDirty || dayIndexToCivilDate(dayIndex).day === 1;
}

/** Mark employment for immediate reassignment (closure or capacity change). */
export function markEmploymentDirty(world: World): void {
  world.employmentDirty = true;
}

function keyedTie(
  world: World,
  dayIndex: DayIndex,
  entityId: Id,
  purpose: string,
): number {
  return drawUint32({
    seed: world.seed,
    day: dayIndex,
    entityId,
    purpose,
    drawIndex: 0,
  });
}

export { apportionLargestRemainder } from "./apportion.js";
import { apportionLargestRemainder } from "./apportion.js";

function assignmentKey(popBlockId: Id, buildingInstanceId: Id, professionId: Id): string {
  return `${String(popBlockId)}:${String(buildingInstanceId)}:${String(professionId)}`;
}

function validateAssignments(
  world: World,
  definitions: EconomyDefinitions,
  assignments: readonly EmploymentAssignment[],
): void {
  const professionById = new Map(definitions.professions.map((p) => [p.id, p]));
  const buildingById = new Map(world.buildings.map((b) => [b.id, b]));
  const definitionById = new Map(definitions.buildings.map((b) => [b.id, b]));
  const blockById = new Map(world.popBlocks.map((b) => [b.id, b]));
  const { provinceOwners, countries } = countryMaps(world);
  const assignedByBlock = new Map<Id, number>();
  // D-137: slots and duplicate keys in nested numeric maps (no key strings or
  // `split` per assignment); slots keep first-appearance order for the cap checks,
  // and each block's eligible workforce (an age-cell sum) is computed once.
  interface SlotUse {
    readonly buildingId: Id;
    readonly professionId: Id;
    assigned: number;
    readonly blocks: Set<Id>;
  }
  const slots = new Map<Id, Map<Id, SlotUse>>();
  const slotOrder: SlotUse[] = [];
  const eligibleByBlock = new Map<Id, number>();

  for (const assignment of assignments) {
    if (!Number.isInteger(assignment.workers) || assignment.workers <= 0) {
      throw new RangeError("employment assignment workers must be a positive integer");
    }
    let byProfession = slots.get(assignment.buildingInstanceId);
    if (byProfession === undefined) {
      byProfession = new Map();
      slots.set(assignment.buildingInstanceId, byProfession);
    }
    let slot = byProfession.get(assignment.professionId);
    if (slot === undefined) {
      slot = {
        buildingId: assignment.buildingInstanceId,
        professionId: assignment.professionId,
        assigned: 0,
        blocks: new Set<Id>(),
      };
      byProfession.set(assignment.professionId, slot);
      slotOrder.push(slot);
    }
    if (slot.blocks.has(assignment.popBlockId)) {
      throw new RangeError(
        `duplicate employment assignment ${assignmentKey(assignment.popBlockId, assignment.buildingInstanceId, assignment.professionId)}`,
      );
    }
    slot.blocks.add(assignment.popBlockId);
    const block = blockById.get(assignment.popBlockId);
    const building = buildingById.get(assignment.buildingInstanceId);
    const profession = professionById.get(assignment.professionId);
    const key = (): string =>
      assignmentKey(assignment.popBlockId, assignment.buildingInstanceId, assignment.professionId);
    if (block === undefined || building === undefined || profession === undefined) {
      throw new RangeError(`employment assignment ${key()} has a broken reference`);
    }
    if (!building.operational) {
      throw new RangeError(`employment assignment ${key()} references a non-operational building`);
    }
    if (
      !laborAccessAllowed(provinceOwners, countries, block.provinceId, building.provinceId)
    ) {
      throw new RangeError(
        `employment assignment ${key()} crosses a closed border between provinces ${String(block.provinceId)} and ${String(building.provinceId)}`,
      );
    }
    const eligible = eligibleWorkforceForBlock(block, profession);
    if (eligible <= 0) {
      throw new RangeError(`employment assignment ${key()} assigns an ineligible block`);
    }
    if (block.professionId === profession.id) eligibleByBlock.set(block.id, eligible);
    assignedByBlock.set(
      assignment.popBlockId,
      (assignedByBlock.get(assignment.popBlockId) ?? 0) + assignment.workers,
    );
    slot.assigned += assignment.workers;
  }

  for (const [blockId, assigned] of assignedByBlock) {
    const block = blockById.get(blockId);
    if (block === undefined) throw new RangeError(`unknown popBlock ${String(blockId)}`);
    const profession = professionById.get(block.professionId);
    if (profession === undefined) throw new RangeError(`unknown profession for popBlock ${String(blockId)}`);
    const eligible = eligibleByBlock.get(blockId) ?? eligibleWorkforceForBlock(block, profession);
    if (assigned > eligible) {
      throw new RangeError(`popBlock ${String(blockId)} exceeds its eligible workforce`);
    }
  }
  for (const slot of slotOrder) {
    const building = buildingById.get(slot.buildingId);
    if (building === undefined) throw new RangeError(`unknown building ${String(slot.buildingId)}`);
    const definition = definitionById.get(building.definitionId);
    if (definition === undefined) throw new RangeError(`unknown building definition`);
    if (slot.assigned > jobSlotsForBuilding(definition, building, slot.professionId)) {
      throw new RangeError(
        `building ${String(slot.buildingId)} profession ${String(slot.professionId)} exceeds job slots`,
      );
    }
  }
}

/** Validate all current assignments and caps against the supplied definitions. */
export function assertValidEmploymentState(
  world: World,
  definitions: EconomyDefinitions,
): void {
  // P7 (D-154): a labour-market world has its own rules (own province, ceilings, institutions).
  if (world.labourMarket.enabled) {
    assertValidLabourEmployment(world, definitions);
    return;
  }
  validateAssignments(world, definitions, world.employment);
}

/**
 * Run employment evaluation if due, or force it. Returns a transient summary;
 * no employment totals or slot counts are stored in authoritative world state.
 */
export function refreshEmployment(
  world: World,
  definitions: EconomyDefinitions,
  dayIndex: DayIndex,
  options: EmploymentRefreshOptions = {},
): EmploymentRefreshResult {
  assertValidDayIndex(dayIndex);
  if (isTerminalDayIndex(dayIndex)) {
    throw new RangeError("employment refresh cannot run at the terminal boundary");
  }
  if (dayIndex < world.startDayIndex) {
    throw new RangeError("employment refresh day must not precede the scenario start");
  }
  if (typeof world.employmentDirty !== "boolean") {
    throw new TypeError("world.employmentDirty must be a boolean");
  }
  if (options.force !== true && !isEmploymentRefreshDue(world, dayIndex)) {
    return emptyResult(dayIndex);
  }
  assertValidEconomyDefinitions(definitions);
  if (definitions.dataVersion !== world.dataVersion || definitions.scenarioId !== world.scenarioId) {
    throw new RangeError("economy definitions do not match the world data/scenario identity");
  }
  // P7 (D-154): the labour-market allocator (own province, ceilings, institutions).
  if (world.labourMarket.enabled) {
    if (definitions.labourMarket === undefined) throw new RangeError("labour-market world needs labour-market definitions");
    return refreshLabourEmployment(world, definitions, dayIndex);
  }

  const professionById = new Map(definitions.professions.map((profession) => [profession.id, profession]));
  const buildingDefinitionById = new Map(
    definitions.buildings.map((definition) => [definition.id, definition]),
  );
  const blockById = new Map(world.popBlocks.map((block) => [block.id, block]));
  const buildingById = new Map(world.buildings.map((building) => [building.id, building]));
  const { provinceOwners, countries } = countryMaps(world);
  for (const building of world.buildings) {
    if (!buildingDefinitionById.has(building.definitionId)) {
      throw new RangeError(
        `building ${String(building.id)} references missing definition ${String(building.definitionId)}`,
      );
    }
  }

  let maxExistingId = 0;
  const existingIds = new Set<number>();
  for (const assignment of world.employment) {
    if (existingIds.has(assignment.id)) {
      throw new RangeError(`duplicate employment assignment id ${String(assignment.id)}`);
    }
    existingIds.add(assignment.id);
    maxExistingId = Math.max(maxExistingId, assignment.id);
  }
  let nextId = maxExistingId + 1;
  if (!Number.isSafeInteger(nextId)) throw new RangeError("employment assignment id overflow");

  let releasedAssignments = 0;
  let releasedWorkers = 0;
  const validExisting: EmploymentAssignment[] = [];
  const existingKeys = new Set<string>();
  for (const assignment of world.employment) {
    const key = assignmentKey(
      assignment.popBlockId,
      assignment.buildingInstanceId,
      assignment.professionId,
    );
    if (existingKeys.has(key)) {
      throw new RangeError(`duplicate employment assignment ${key}`);
    }
    existingKeys.add(key);
    const block = blockById.get(assignment.popBlockId);
    const building = buildingById.get(assignment.buildingInstanceId);
    const profession = professionById.get(assignment.professionId);
    const definition = building === undefined ? undefined : buildingDefinitionById.get(building.definitionId);
    if (
      block === undefined ||
      building === undefined ||
      profession === undefined ||
      definition === undefined ||
      !building.operational ||
      assignment.professionId !== block.professionId ||
      !laborAccessAllowed(provinceOwners, countries, block.provinceId, building.provinceId) ||
      eligibleWorkforceForBlock(block, profession) <= 0 ||
      jobSlotsForBuilding(definition, building, assignment.professionId) <= 0
    ) {
      releasedAssignments += 1;
      releasedWorkers += assignment.workers;
      continue;
    }
    validExisting.push({ ...assignment });
  }

  // D-137: each assignment's keyed draw once (was two draws per comparison).
  const retentionKey = new Map<Id, number>();
  for (const assignment of validExisting) {
    retentionKey.set(assignment.id, keyedTie(world, dayIndex, assignment.id, EMPLOYMENT_RETENTION_PURPOSE));
  }
  validExisting.sort((left, right) => {
    const leftKey = retentionKey.get(left.id) ?? 0;
    const rightKey = retentionKey.get(right.id) ?? 0;
    return leftKey - rightKey || left.id - right.id;
  });

  const usedSlots = new Map<string, number>();
  const usedByBlock = new Map<Id, number>();
  const retainedByKey = new Map<string, EmploymentAssignment>();
  let retainedAssignments = 0;

  for (const assignment of validExisting) {
    const building = buildingById.get(assignment.buildingInstanceId);
    const block = blockById.get(assignment.popBlockId);
    const profession = professionById.get(assignment.professionId);
    if (building === undefined || block === undefined || profession === undefined) {
      throw new RangeError("employment assignment lost a reference during retention");
    }
    const definition = buildingDefinitionById.get(building.definitionId);
    if (definition === undefined) throw new RangeError("employment assignment has no building definition");
    const slots = jobSlotsForBuilding(definition, building, profession.id);
    const slotKey = `${String(building.id)}:${String(profession.id)}`;
    const remainingSlots = slots - (usedSlots.get(slotKey) ?? 0);
    const remainingEligible =
      eligibleWorkforceForBlock(block, profession) - (usedByBlock.get(block.id) ?? 0);
    const keep = Math.min(assignment.workers, remainingSlots, remainingEligible);
    if (keep <= 0) {
      releasedAssignments += 1;
      releasedWorkers += assignment.workers;
      continue;
    }
    const retained: EmploymentAssignment = { ...assignment, workers: keep };
    retainedByKey.set(
      assignmentKey(retained.popBlockId, retained.buildingInstanceId, retained.professionId),
      retained,
    );
    usedSlots.set(slotKey, (usedSlots.get(slotKey) ?? 0) + keep);
    usedByBlock.set(block.id, (usedByBlock.get(block.id) ?? 0) + keep);
    releasedWorkers += assignment.workers - keep;
    retainedAssignments += 1;
  }

  let createdAssignments = 0;
  const professions = [...definitions.professions].sort((left, right) =>
    left.key < right.key ? -1 : left.key > right.key ? 1 : left.id - right.id,
  );

  function vacancyBuildingsFor(profession: ProfessionDef): BuildingInstance[] {
    return [...world.buildings]
      .filter((building) => {
        const definition = buildingDefinitionById.get(building.definitionId);
        if (definition === undefined) return false;
        const slots = jobSlotsForBuilding(definition, building, profession.id);
        return slots - (usedSlots.get(`${String(building.id)}:${String(profession.id)}`) ?? 0) > 0;
      })
      .sort((left, right) => left.id - right.id);
  }

  function fillVacancies(
    profession: ProfessionDef,
    eligibleBlocks: readonly World["popBlocks"][number][],
    vacancyBuildings: readonly BuildingInstance[],
  ): void {
    if (eligibleBlocks.length === 0 || vacancyBuildings.length === 0) return;
    const blockWeights = eligibleBlocks.map(
      (block) => eligibleWorkforceForBlock(block, profession) - (usedByBlock.get(block.id) ?? 0),
    );
    const totalEligible = blockWeights.reduce((total, weight) => total + weight, 0);
    const buildingWeights = vacancyBuildings.map((building) => {
      const definition = buildingDefinitionById.get(building.definitionId);
      if (definition === undefined) throw new RangeError("vacancy building has no definition");
      return (
        jobSlotsForBuilding(definition, building, profession.id) -
        (usedSlots.get(`${String(building.id)}:${String(profession.id)}`) ?? 0)
      );
    });
    const totalVacancies = buildingWeights.reduce((total, weight) => total + weight, 0);
    const assignable = Math.min(totalEligible, totalVacancies);
    if (assignable <= 0) return;

    const blockQuotas = apportionLargestRemainder(
      assignable,
      blockWeights,
      eligibleBlocks.map((block) =>
        keyedTie(world, dayIndex, block.id, EMPLOYMENT_BLOCK_REMAINDER_PURPOSE),
      ),
    );
    // D-133: each building's fill is apportioned once over its vacancies, then block
    // quotas and building fills are paired, first within each province and then the
    // remainders in ascending province order. Block and building totals are those of
    // the apportionments; the pairing creates at most blocks + buildings assignments.
    const buildingQuotas = apportionLargestRemainder(
      assignable,
      buildingWeights,
      vacancyBuildings.map((building) =>
        keyedTie(world, dayIndex, building.id, EMPLOYMENT_BUILDING_REMAINDER_PURPOSE),
      ),
    );
    const blockLeft = eligibleBlocks
      .map((block, index) => ({ block, left: blockQuotas[index] ?? 0 }))
      .filter((entry) => entry.left > 0)
      .sort((left, right) => left.block.provinceId - right.block.provinceId || left.block.id - right.block.id);
    const buildingLeft = vacancyBuildings
      .map((building, index) => ({ building, left: buildingQuotas[index] ?? 0 }))
      .filter((entry) => entry.left > 0)
      .sort((left, right) => left.building.provinceId - right.building.provinceId || left.building.id - right.building.id);
    const pairs: { block: World["popBlocks"][number]; building: BuildingInstance; workers: number }[] = [];
    const pairSequential = (
      blocks: readonly { block: World["popBlocks"][number]; left: number }[],
      buildings: readonly { building: BuildingInstance; left: number }[],
    ): void => {
      let buildingIndex = 0;
      for (const blockEntry of blocks) {
        while (blockEntry.left > 0 && buildingIndex < buildings.length) {
          const buildingEntry = buildings[buildingIndex];
          if (buildingEntry === undefined) break;
          if (buildingEntry.left <= 0) {
            buildingIndex += 1;
            continue;
          }
          const workers = Math.min(blockEntry.left, buildingEntry.left);
          pairs.push({ block: blockEntry.block, building: buildingEntry.building, workers });
          blockEntry.left -= workers;
          buildingEntry.left -= workers;
        }
      }
    };
    const buildingsByProvince = new Map<Id, { building: BuildingInstance; left: number }[]>();
    for (const entry of buildingLeft) {
      const list = buildingsByProvince.get(entry.building.provinceId);
      if (list === undefined) buildingsByProvince.set(entry.building.provinceId, [entry]);
      else list.push(entry);
    }
    let provinceStart = 0;
    while (provinceStart < blockLeft.length) {
      const provinceId = blockLeft[provinceStart]!.block.provinceId;
      let provinceEnd = provinceStart;
      while (provinceEnd < blockLeft.length && blockLeft[provinceEnd]!.block.provinceId === provinceId) {
        provinceEnd += 1;
      }
      pairSequential(blockLeft.slice(provinceStart, provinceEnd), buildingsByProvince.get(provinceId) ?? []);
      provinceStart = provinceEnd;
    }
    pairSequential(blockLeft, buildingLeft);
    if (blockLeft.some((entry) => entry.left !== 0) || buildingLeft.some((entry) => entry.left !== 0)) {
      throw new RangeError("employment pairing did not reconcile block quotas with building fills");
    }

    for (const pair of pairs) {
      const candidate = { block: pair.block };
      const building = pair.building;
      const allocation = pair.workers;
      {
        const key = assignmentKey(candidate.block.id, building.id, profession.id);
        const existing = retainedByKey.get(key);
        if (existing !== undefined) {
          existing.workers += allocation;
        } else {
          const created: EmploymentAssignment = {
            id: nextId,
            popBlockId: candidate.block.id,
            buildingInstanceId: building.id,
            professionId: profession.id,
            workers: allocation,
          };
          nextId += 1;
          if (!Number.isSafeInteger(nextId)) {
            throw new RangeError("employment assignment id overflow");
          }
          retainedByKey.set(key, created);
          createdAssignments += 1;
        }
        const slotKey = `${String(building.id)}:${String(profession.id)}`;
        usedSlots.set(slotKey, (usedSlots.get(slotKey) ?? 0) + allocation);
        usedByBlock.set(
          candidate.block.id,
          (usedByBlock.get(candidate.block.id) ?? 0) + allocation,
        );
      }
    }
  }

  function groupBuildingsByCountry(
    buildings: readonly BuildingInstance[],
  ): Map<number | null, BuildingInstance[]> {
    const groups = new Map<number | null, BuildingInstance[]>();
    for (const building of buildings) {
      const countryId = provinceOwners.get(building.provinceId) ?? null;
      const list = groups.get(countryId);
      if (list === undefined) groups.set(countryId, [building]);
      else list.push(building);
    }
    return groups;
  }

  const countrySortKey = (countryId: number | null): number => (countryId === null ? -1 : countryId);

  // Pass 1: domestic labor. A country's own residents fill its vacancies before
  // any foreign labor is considered, so an open border cannot displace domestic
  // workers in the allocation.
  for (const profession of professions) {
    const buildings = vacancyBuildingsFor(profession);
    if (buildings.length === 0) continue;
    const groups = groupBuildingsByCountry(buildings);
    const countryIds = [...groups.keys()].sort(
      (left, right) => countrySortKey(left) - countrySortKey(right),
    );
    for (const countryId of countryIds) {
      const groupBuildings = groups.get(countryId) ?? [];
      const eligibleBlocks = world.popBlocks
        .filter(
          (block) =>
            (provinceOwners.get(block.provinceId) ?? null) === countryId &&
            eligibleWorkforceForBlock(block, profession) - (usedByBlock.get(block.id) ?? 0) > 0,
        )
        .sort((left, right) => left.id - right.id);
      fillVacancies(profession, eligibleBlocks, groupBuildings);
    }
  }

  // Pass 2: cross-border labor, only for destination countries whose provisional
  // policy admits foreign workers. Remaining vacancies and remaining foreign
  // eligible workers are allocated deterministically by ascending country id.
  const openCountryIds = [...countries.values()]
    .filter((country) => country.immigrationOpen)
    .map((country) => country.id)
    .sort((left, right) => left - right);
  for (const profession of professions) {
    for (const countryId of openCountryIds) {
      const groupBuildings = vacancyBuildingsFor(profession).filter(
        (building) => (provinceOwners.get(building.provinceId) ?? null) === countryId,
      );
      if (groupBuildings.length === 0) continue;
      const eligibleBlocks = world.popBlocks
        .filter(
          (block) =>
            (provinceOwners.get(block.provinceId) ?? null) !== countryId &&
            eligibleWorkforceForBlock(block, profession) - (usedByBlock.get(block.id) ?? 0) > 0,
        )
        .sort((left, right) => left.id - right.id);
      fillVacancies(profession, eligibleBlocks, groupBuildings);
    }
  }

  const assignments = [...retainedByKey.values()].sort((left, right) => left.id - right.id);
  validateAssignments(world, definitions, assignments);

  world.employment = assignments;
  world.employmentDirty = false;

  let assignedWorkers = 0;
  for (const assignment of assignments) assignedWorkers += assignment.workers;
  const assignedByBlock = new Map<Id, number>();
  const assignedBySlot = new Map<string, number>();
  for (const assignment of assignments) {
    assignedByBlock.set(assignment.popBlockId, (assignedByBlock.get(assignment.popBlockId) ?? 0) + assignment.workers);
    const slotKey = `${String(assignment.buildingInstanceId)}:${String(assignment.professionId)}`;
    assignedBySlot.set(slotKey, (assignedBySlot.get(slotKey) ?? 0) + assignment.workers);
  }
  let unemployedEligible = 0;
  for (const block of world.popBlocks) {
    const profession = professionById.get(block.professionId);
    if (profession === undefined) continue;
    const eligible = eligibleWorkforceForBlock(block, profession);
    const assigned = assignedByBlock.get(block.id) ?? 0;
    unemployedEligible += Math.max(0, eligible - assigned);
  }
  let unfilledSlots = 0;
  for (const building of world.buildings) {
    const definition = buildingDefinitionById.get(building.definitionId);
    if (definition === undefined) {
      throw new RangeError(`building ${String(building.id)} has no definition`);
    }
    for (const job of definition.jobs) {
      const slots = jobSlotsForBuilding(definition, building, job.professionId);
      const assigned = assignedBySlot.get(`${String(building.id)}:${String(job.professionId)}`) ?? 0;
      unfilledSlots += Math.max(0, slots - assigned);
    }
  }

  return {
    refreshed: true,
    dayIndex,
    retainedAssignments,
    releasedAssignments,
    releasedWorkers,
    createdAssignments,
    assignedWorkers,
    unemployedEligible,
    unfilledSlots,
  };
}

/**
 * D-126 minimal repair after daily demography.
 *
 * Deaths can leave a block with more assigned workers than its eligible workforce.
 * Instead of a full reassignment, each such block's assignments are trimmed by the
 * excess, proportionally to their workers with largest-remainder rounding (ties to
 * the lower assignment id); emptied assignments are removed. The freed job slots are
 * refilled by the next monthly or dirty refresh. Returns false, after restoring the
 * original assignments, when the state still fails validation for any other reason;
 * the caller then requests a full refresh.
 */
export function repairEmploymentAfterDemography(
  world: World,
  definitions: EconomyDefinitions,
): boolean {
  if (world.labourMarket.enabled) return repairLabourEmploymentAfterDemography(world, definitions);
  const professionById = new Map(definitions.professions.map((p) => [p.id, p]));
  const blockById = new Map(world.popBlocks.map((block) => [block.id, block]));
  const byBlock = new Map<Id, EmploymentAssignment[]>();
  for (const assignment of world.employment) {
    const list = byBlock.get(assignment.popBlockId);
    if (list === undefined) byBlock.set(assignment.popBlockId, [assignment]);
    else list.push(assignment);
  }
  const reductions = new Map<Id, number>();
  for (const [blockId, assignments] of [...byBlock].sort((left, right) => left[0] - right[0])) {
    const block = blockById.get(blockId);
    const profession = block === undefined ? undefined : professionById.get(block.professionId);
    if (block === undefined || profession === undefined) continue;
    let assigned = 0;
    for (const assignment of assignments) assigned += assignment.workers;
    const eligible = eligibleWorkforceForBlock(block, profession);
    const excess = assigned - eligible;
    if (excess <= 0 || eligible <= 0) continue;
    const ordered = [...assignments].sort((left, right) => left.id - right.id);
    const shares = ordered.map((assignment) => {
      const exact = (excess * assignment.workers) / assigned;
      const whole = Math.min(assignment.workers, Math.floor(exact));
      return { assignment, whole, fraction: exact - Math.floor(exact) };
    });
    let remaining = excess - shares.reduce((total, share) => total + share.whole, 0);
    const byRemainder = [...shares].sort((left, right) =>
      right.fraction !== left.fraction
        ? right.fraction - left.fraction
        : left.assignment.id - right.assignment.id,
    );
    while (remaining > 0) {
      let progressed = false;
      for (const share of byRemainder) {
        if (remaining <= 0) break;
        if (share.whole >= share.assignment.workers) continue;
        share.whole += 1;
        remaining -= 1;
        progressed = true;
      }
      if (!progressed) break;
    }
    for (const share of shares) {
      if (share.whole > 0) reductions.set(share.assignment.id, share.whole);
    }
  }
  if (reductions.size === 0) return false;
  const original = world.employment;
  world.employment = original
    .map((assignment) => {
      const reduction = reductions.get(assignment.id) ?? 0;
      return reduction === 0 ? assignment : { ...assignment, workers: assignment.workers - reduction };
    })
    .filter((assignment) => assignment.workers > 0);
  try {
    validateAssignments(world, definitions, world.employment);
    return true;
  } catch {
    world.employment = original;
    return false;
  }
}

/** Run employment evaluation only when the calendar or dirty state requires it. */
export function refreshEmploymentIfDue(
  world: World,
  definitions: EconomyDefinitions,
  dayIndex: DayIndex,
): EmploymentRefreshResult {
  if (!isEmploymentRefreshDue(world, dayIndex)) return emptyResult(dayIndex);
  return refreshEmployment(world, definitions, dayIndex, { force: true });
}
