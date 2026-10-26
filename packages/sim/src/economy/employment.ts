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
import { buildRegionOwnerMap } from "./country.js";
import { assertValidEconomyDefinitions } from "./definitions.js";
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
 * A resident may take a job in any region of their own country (internal labor
 * mobility). A cross-country assignment additionally requires the destination
 * country's provisional open-border policy. Countryless regions form a single
 * unrestricted area so pre-M5 fixtures keep their behavior.
 *
 * The GDD describes travel/migration limits without fixing them; this is the
 * smallest documented rule that prevents an unconstrained global labor pool
 * (D-052).
 */
export function laborAccessAllowed(
  regionOwners: ReadonlyMap<Id, Id>,
  countries: ReadonlyMap<Id, World["countries"][number]>,
  sourceRegionId: Id,
  destinationRegionId: Id,
): boolean {
  const sourceCountry = regionOwners.get(sourceRegionId) ?? null;
  const destinationCountry = regionOwners.get(destinationRegionId) ?? null;
  if (sourceCountry === destinationCountry) return true;
  if (destinationCountry === null) return false;
  return countries.get(destinationCountry)?.immigrationOpen === true;
}

function countryMaps(world: World): {
  readonly regionOwners: ReadonlyMap<Id, Id>;
  readonly countries: ReadonlyMap<Id, World["countries"][number]>;
} {
  return {
    regionOwners: buildRegionOwnerMap(world),
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

/**
 * Largest-remainder apportionment of `total` integer units across weights.
 * Callers must ensure `total <= sum(weights)`. Equal remainders use the supplied
 * keyed tie keys ascending; the original index is only a final collision fallback.
 */
function apportionLargestRemainder(
  total: number,
  weights: readonly number[],
  tieKeys: readonly number[],
): number[] {
  if (!Number.isInteger(total) || total < 0) {
    throw new RangeError("apportionment total must be a non-negative integer");
  }
  const allocations = new Array<number>(weights.length).fill(0);
  if (total === 0 || weights.length === 0) return allocations;
  let totalWeight = 0;
  for (let index = 0; index < weights.length; index += 1) {
    const weight = weights[index] ?? 0;
    if (!Number.isInteger(weight) || weight < 0) {
      throw new RangeError("apportionment weights must be non-negative integers");
    }
    totalWeight += weight;
  }
  if (totalWeight === 0) return allocations;
  if (total > totalWeight) {
    throw new RangeError("apportionment total cannot exceed the sum of weights");
  }

  let allocated = 0;
  const remainders: Array<{ index: number; remainder: number; tie: number }> = [];
  for (let index = 0; index < weights.length; index += 1) {
    const weight = weights[index] ?? 0;
    const exact = (total * weight) / totalWeight;
    const whole = Math.floor(exact);
    allocations[index] = whole;
    allocated += whole;
    if (whole < weight) {
      remainders.push({
        index,
        remainder: exact - whole,
        tie: tieKeys[index] ?? 0,
      });
    }
  }

  let leftover = total - allocated;
  remainders.sort(
    (left, right) =>
      right.remainder - left.remainder || left.tie - right.tie || left.index - right.index,
  );
  for (let index = 0; index < leftover; index += 1) {
    const candidate = remainders[index];
    if (candidate === undefined) {
      throw new RangeError("largest-remainder apportionment ran out of capacity");
    }
    allocations[candidate.index] = (allocations[candidate.index] ?? 0) + 1;
  }
  return allocations;
}

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
  const { regionOwners, countries } = countryMaps(world);
  const assignedByBlock = new Map<Id, number>();
  const assignedBySlot = new Map<string, number>();
  const keys = new Set<string>();

  for (const assignment of assignments) {
    if (!Number.isInteger(assignment.workers) || assignment.workers <= 0) {
      throw new RangeError("employment assignment workers must be a positive integer");
    }
    const key = assignmentKey(
      assignment.popBlockId,
      assignment.buildingInstanceId,
      assignment.professionId,
    );
    if (keys.has(key)) throw new RangeError(`duplicate employment assignment ${key}`);
    keys.add(key);
    const block = blockById.get(assignment.popBlockId);
    const building = buildingById.get(assignment.buildingInstanceId);
    const profession = professionById.get(assignment.professionId);
    if (block === undefined || building === undefined || profession === undefined) {
      throw new RangeError(`employment assignment ${key} has a broken reference`);
    }
    if (!building.operational) {
      throw new RangeError(`employment assignment ${key} references a non-operational building`);
    }
    if (
      !laborAccessAllowed(regionOwners, countries, block.regionId, building.regionId)
    ) {
      throw new RangeError(
        `employment assignment ${key} crosses a closed border between regions ${String(block.regionId)} and ${String(building.regionId)}`,
      );
    }
    const eligible = eligibleWorkforceForBlock(block, profession);
    if (eligible <= 0) {
      throw new RangeError(`employment assignment ${key} assigns an ineligible block`);
    }
    assignedByBlock.set(
      assignment.popBlockId,
      (assignedByBlock.get(assignment.popBlockId) ?? 0) + assignment.workers,
    );
    const slotKey = `${String(assignment.buildingInstanceId)}:${String(assignment.professionId)}`;
    assignedBySlot.set(
      slotKey,
      (assignedBySlot.get(slotKey) ?? 0) + assignment.workers,
    );
  }

  for (const [blockId, assigned] of assignedByBlock) {
    const block = blockById.get(blockId);
    if (block === undefined) throw new RangeError(`unknown popBlock ${String(blockId)}`);
    const profession = professionById.get(block.professionId);
    if (profession === undefined) throw new RangeError(`unknown profession for popBlock ${String(blockId)}`);
    if (assigned > eligibleWorkforceForBlock(block, profession)) {
      throw new RangeError(`popBlock ${String(blockId)} exceeds its eligible workforce`);
    }
  }
  for (const [slotKey, assigned] of assignedBySlot) {
    const [buildingIdText, professionIdText] = slotKey.split(":");
    const buildingId = Number(buildingIdText);
    const professionId = Number(professionIdText);
    const building = buildingById.get(buildingId);
    if (building === undefined) throw new RangeError(`unknown building ${String(buildingId)}`);
    const definition = definitionById.get(building.definitionId);
    if (definition === undefined) throw new RangeError(`unknown building definition`);
    if (assigned > jobSlotsForBuilding(definition, building, professionId)) {
      throw new RangeError(`building ${String(buildingId)} profession ${String(professionId)} exceeds job slots`);
    }
  }
}

/** Validate all current assignments and caps against the supplied definitions. */
export function assertValidEmploymentState(
  world: World,
  definitions: EconomyDefinitions,
): void {
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

  const professionById = new Map(definitions.professions.map((profession) => [profession.id, profession]));
  const buildingDefinitionById = new Map(
    definitions.buildings.map((definition) => [definition.id, definition]),
  );
  const blockById = new Map(world.popBlocks.map((block) => [block.id, block]));
  const buildingById = new Map(world.buildings.map((building) => [building.id, building]));
  const { regionOwners, countries } = countryMaps(world);
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
      !laborAccessAllowed(regionOwners, countries, block.regionId, building.regionId) ||
      eligibleWorkforceForBlock(block, profession) <= 0 ||
      jobSlotsForBuilding(definition, building, assignment.professionId) <= 0
    ) {
      releasedAssignments += 1;
      releasedWorkers += assignment.workers;
      continue;
    }
    validExisting.push({ ...assignment });
  }

  validExisting.sort((left, right) => {
    const leftKey = keyedTie(world, dayIndex, left.id, EMPLOYMENT_RETENTION_PURPOSE);
    const rightKey = keyedTie(world, dayIndex, right.id, EMPLOYMENT_RETENTION_PURPOSE);
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
    const fillOrder = eligibleBlocks
      .map((block, index) => ({
        block,
        quota: blockQuotas[index] ?? 0,
        order: keyedTie(world, dayIndex, block.id, EMPLOYMENT_FILL_ORDER_PURPOSE),
      }))
      .filter((candidate) => candidate.quota > 0)
      .sort((left, right) => left.order - right.order || left.block.id - right.block.id);

    for (const candidate of fillOrder) {
      const remainingVacancies = vacancyBuildings.map((building) => {
        const definition = buildingDefinitionById.get(building.definitionId);
        if (definition === undefined) throw new RangeError("vacancy building has no definition");
        return (
          jobSlotsForBuilding(definition, building, profession.id) -
          (usedSlots.get(`${String(building.id)}:${String(profession.id)}`) ?? 0)
        );
      });
      const remainingTotal = remainingVacancies.reduce((total, value) => total + value, 0);
      if (candidate.quota > remainingTotal) {
        throw new RangeError("employment fill quota exceeds remaining building vacancies");
      }
      const buildingAllocations = apportionLargestRemainder(
        candidate.quota,
        remainingVacancies,
        vacancyBuildings.map((building) =>
          keyedTie(world, dayIndex, building.id, EMPLOYMENT_BUILDING_REMAINDER_PURPOSE),
        ),
      );
      for (let index = 0; index < vacancyBuildings.length; index += 1) {
        const allocation = buildingAllocations[index] ?? 0;
        if (allocation === 0) continue;
        const building = vacancyBuildings[index];
        if (building === undefined) throw new RangeError("missing vacancy building");
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
      const countryId = regionOwners.get(building.regionId) ?? null;
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
            (regionOwners.get(block.regionId) ?? null) === countryId &&
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
        (building) => (regionOwners.get(building.regionId) ?? null) === countryId,
      );
      if (groupBuildings.length === 0) continue;
      const eligibleBlocks = world.popBlocks
        .filter(
          (block) =>
            (regionOwners.get(block.regionId) ?? null) !== countryId &&
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
  let unemployedEligible = 0;
  for (const block of world.popBlocks) {
    const profession = professionById.get(block.professionId);
    if (profession === undefined) continue;
    const eligible = eligibleWorkforceForBlock(block, profession);
    const assigned = assignments
      .filter((assignment) => assignment.popBlockId === block.id)
      .reduce((total, assignment) => total + assignment.workers, 0);
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
      const assigned = assignments
        .filter(
          (assignment) =>
            assignment.buildingInstanceId === building.id &&
            assignment.professionId === job.professionId,
        )
        .reduce((total, assignment) => total + assignment.workers, 0);
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

/** Run employment evaluation only when the calendar or dirty state requires it. */
export function refreshEmploymentIfDue(
  world: World,
  definitions: EconomyDefinitions,
  dayIndex: DayIndex,
): EmploymentRefreshResult {
  if (!isEmploymentRefreshDue(world, dayIndex)) return emptyResult(dayIndex);
  return refreshEmployment(world, definitions, dayIndex, { force: true });
}
