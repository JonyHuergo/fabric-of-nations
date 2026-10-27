/**
 * E3 construction model helpers and construction-state validation.
 *
 * This module is deliberately free of finance/validation imports so both the
 * construction phase and the world validator can use it without a cycle. It
 * defines the pure project projections (progress, remaining cost, planned jobs,
 * working-capital target, idle construction labor) and validates the persisted
 * project queue's structure, ownership references, caps, and status semantics.
 */

import { assertValidDayIndex } from "../calendar.js";
import { MONEY_TOLERANCE_SUSD } from "../population/constants.js";
import type { Day, Id } from "../types.js";
import type { World } from "../world.js";
import {
  MAX_ACTIVE_CONSTRUCTION_PROJECTS,
  MAX_CONSTRUCTION_HISTORY_AGGREGATES,
  MAX_RETAINED_TERMINATED_CONSTRUCTION_PROJECTS,
  CONSTRUCTION_WORKING_CAPITAL_DAYS,
} from "./constants.js";
import { eligibleWorkforceForBlock } from "./employment.js";
import type {
  BuildingDef,
  ConstructionProject,
  ConstructionProjectStatus,
  ConstructionState,
  EconomyDefinitions,
  ProfessionDef,
} from "./types.js";

/** True for statuses that no longer consume the active-project cap. */
export function constructionProjectIsTerminal(status: ConstructionProjectStatus): boolean {
  return status === "completed" || status === "cancelled";
}

/** True for statuses that may progress on a construction day. */
export function constructionProjectIsLive(status: ConstructionProjectStatus): boolean {
  return status === "authorized" || status === "active" || status === "waiting";
}

/** Completed fraction in 0..1, derived from capitalized labor actually spent. */
export function constructionProjectProgress(project: ConstructionProject): number {
  if (!(project.totalCostSUSD > 0)) return 1;
  const progress = project.spentSUSD / project.totalCostSUSD;
  if (progress <= 0) return 0;
  if (progress >= 1) return 1;
  return progress;
}

/** Delivered fraction of all required materials in 0..1. */
export function constructionMaterialsProgress(project: ConstructionProject): number {
  let required = 0;
  let delivered = 0;
  for (const material of project.materials) {
    required += material.requiredQuantity;
    delivered += Math.min(material.requiredQuantity, material.deliveredQuantity);
  }
  if (required <= 0) return 1;
  return Math.min(1, Math.max(0, delivered / required));
}

/** True when every authored material requirement has been delivered. */
export function constructionMaterialsReady(project: ConstructionProject): boolean {
  return project.materials.every(
    (material) =>
      material.deliveredQuantity >=
      material.requiredQuantity - toleranceMoney(material.requiredQuantity),
  );
}

/** Remaining physical quantity for one project material. */
export function constructionMaterialRemaining(
  material: ConstructionProject["materials"][number],
): number {
  return Math.max(0, material.requiredQuantity - material.deliveredQuantity);
}

/** Remaining authorized construction cost, never negative. */
export function constructionProjectRemaining(project: ConstructionProject): number {
  return Math.max(0, project.totalCostSUSD - project.spentSUSD);
}

/** Total planned jobs at level 1, condition 1 (a data-derived crew/size proxy). */
export function constructionPlannedJobs(definition: BuildingDef): number {
  let jobs = 0;
  for (const job of definition.jobs) {
    jobs += job.workersPerThroughputUnit * definition.referenceThroughputPerDayAtLevelOne;
  }
  return jobs;
}

/** Documented completion working-capital target: 30 days of daily upkeep. */
export function constructionWorkingCapital(definition: BuildingDef): number {
  return definition.dailyUpkeepSUSDAtLevelOne * CONSTRUCTION_WORKING_CAPITAL_DAYS;
}

/** Daily base wage in SUSD for a profession and civil year. */
export function constructionDailyWage(profession: ProfessionDef, yearDays: number): number {
  return profession.baseWage1900SUSDPerYear / yearDays;
}

/**
 * Eligible-but-unassigned workers for one country, by block.
 *
 * The construction queue may hire only workers who are not already assigned to
 * a production job, so the same worker is never counted twice. Returned counts
 * are whole workers in ascending block id order.
 */
export function constructionIdleWorkersByBlock(
  world: World,
  definitions: EconomyDefinitions,
  countryId: Id,
): Map<Id, number> {
  const country = world.countries.find((candidate) => candidate.id === countryId);
  if (country === undefined) throw new RangeError(`unknown country ${String(countryId)}`);
  const regionIds = new Set(country.regionIds);
  const assigned = new Map<Id, number>();
  for (const assignment of world.employment) {
    assigned.set(
      assignment.popBlockId,
      (assigned.get(assignment.popBlockId) ?? 0) + assignment.workers,
    );
  }
  const professionById = new Map(
    definitions.professions.map((profession) => [profession.id, profession]),
  );
  const idle = new Map<Id, number>();
  for (const block of [...world.popBlocks].sort((left, right) => left.id - right.id)) {
    if (!regionIds.has(block.regionId)) continue;
    const profession = professionById.get(block.professionId);
    if (profession === undefined) continue;
    const eligible = eligibleWorkforceForBlock(block, profession);
    const already = assigned.get(block.id) ?? 0;
    const available = Math.floor(eligible - already);
    idle.set(block.id, Math.max(0, available));
  }
  return idle;
}

/** Total idle construction workers in a country. */
export function constructionIdleWorkers(
  world: World,
  definitions: EconomyDefinitions,
  countryId: Id,
): number {
  let total = 0;
  for (const count of constructionIdleWorkersByBlock(world, definitions, countryId).values()) {
    total += count;
  }
  return total;
}

function toleranceMoney(...values: number[]): number {
  let scale = 1;
  for (const value of values) scale = Math.max(scale, Math.abs(value));
  return MONEY_TOLERANCE_SUSD * scale;
}

function requireProjectState(project: ConstructionProject): void {
  const path = `world.construction.projects[${String(project.id)}]`;
  if (!Number.isInteger(project.id) || project.id < 1) {
    throw new RangeError(`${path}.id must be a positive integer`);
  }
  if (
    project.status !== "authorized" &&
    project.status !== "active" &&
    project.status !== "waiting" &&
    project.status !== "paused" &&
    project.status !== "completed" &&
    project.status !== "cancelled"
  ) {
    throw new RangeError(`${path}.status is invalid`);
  }
  assertValidDayIndex(project.authorizedDay);
  for (const [field, value] of [
    ["startedDay", project.startedDay],
    ["completedDay", project.completedDay],
    ["cancelledDay", project.cancelledDay],
  ] as const) {
    if (value !== null) {
      assertValidDayIndex(value);
      if (value < project.authorizedDay) {
        throw new RangeError(`${path}.${field} must not precede authorizedDay`);
      }
    }
  }
  if (!Number.isFinite(project.totalCostSUSD) || !(project.totalCostSUSD > 0)) {
    throw new RangeError(`${path}.totalCostSUSD must be positive and finite`);
  }
  for (const [field, value] of [
    ["workingCapitalSUSD", project.workingCapitalSUSD],
    ["workingCapitalPaidSUSD", project.workingCapitalPaidSUSD],
    ["spentSUSD", project.spentSUSD],
    ["materialsSpentSUSD", project.materialsSpentSUSD],
  ] as const) {
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError(`${path}.${field} must be finite and non-negative`);
    }
  }
  if (!Array.isArray(project.materials)) {
    throw new RangeError(`${path}.materials must be an array`);
  }
  const materialGoods = new Set<Id>();
  for (let index = 0; index < project.materials.length; index += 1) {
    const material = project.materials[index];
    const materialPath = `${path}.materials[${String(index)}]`;
    if (material === undefined) throw new RangeError(`${materialPath} is missing`);
    if (!Number.isInteger(material.goodId) || material.goodId < 0) {
      throw new RangeError(`${materialPath}.goodId must be a non-negative integer`);
    }
    if (materialGoods.has(material.goodId)) {
      throw new RangeError(`${path}.materials contains duplicate good ${String(material.goodId)}`);
    }
    materialGoods.add(material.goodId);
    if (!Number.isFinite(material.requiredQuantity) || !(material.requiredQuantity > 0)) {
      throw new RangeError(`${materialPath}.requiredQuantity must be positive and finite`);
    }
    if (
      !Number.isFinite(material.deliveredQuantity) ||
      material.deliveredQuantity < 0 ||
      material.deliveredQuantity >
        material.requiredQuantity + toleranceMoney(material.requiredQuantity)
    ) {
      throw new RangeError(`${materialPath}.deliveredQuantity is outside its requirement`);
    }
  }
  if (
    project.spentSUSD >
    project.totalCostSUSD + toleranceMoney(project.spentSUSD, project.totalCostSUSD)
  ) {
    throw new RangeError(`${path}.spentSUSD must not exceed totalCostSUSD`);
  }
  if (
    project.workingCapitalPaidSUSD >
    project.workingCapitalSUSD +
      toleranceMoney(project.workingCapitalPaidSUSD, project.workingCapitalSUSD)
  ) {
    throw new RangeError(`${path}.workingCapitalPaidSUSD must not exceed its target`);
  }
  if (!Number.isInteger(project.lastWorkers) || project.lastWorkers < 0) {
    throw new RangeError(`${path}.lastWorkers must be a non-negative integer`);
  }
  if (
    project.blockedReason !== null &&
    project.blockedReason !== "labor" &&
    project.blockedReason !== "funds" &&
    project.blockedReason !== "materials"
  ) {
    throw new RangeError(`${path}.blockedReason is invalid`);
  }
  if (project.buildingId !== null) {
    if (!Number.isInteger(project.buildingId) || project.buildingId < 0) {
      throw new RangeError(`${path}.buildingId must be a non-negative integer or null`);
    }
  }
  if (project.workingCapitalPaidSUSD > 0 && project.status !== "completed") {
    throw new RangeError(`${path}.workingCapitalPaidSUSD must be zero before completion`);
  }
  if (project.status === "active" && project.lastWorkers < 0) {
    throw new RangeError(`${path} active project must report a non-negative worker count`);
  }
  const nearComplete =
    Math.abs(project.spentSUSD - project.totalCostSUSD) <=
    toleranceMoney(project.spentSUSD, project.totalCostSUSD);
  if (project.status === "authorized") {
    if (project.spentSUSD !== 0 || project.startedDay !== null) {
      throw new RangeError(`${path} authorized project must not have started or spent`);
    }
    if (
      project.materialsSpentSUSD !== 0 ||
      project.materials.some((material) => material.deliveredQuantity !== 0)
    ) {
      throw new RangeError(`${path} authorized project must not have procured materials`);
    }
    if (project.buildingId !== null || project.completedDay !== null) {
      throw new RangeError(`${path} authorized project must not be completed`);
    }
    if (project.cancelledDay !== null || project.blockedReason !== null) {
      throw new RangeError(`${path} authorized project has an invalid terminal/blocked state`);
    }
  } else if (project.status === "active") {
    if (project.buildingId !== null || project.completedDay !== null) {
      throw new RangeError(`${path} active project must not have a building`);
    }
    if (project.cancelledDay !== null || project.blockedReason !== null) {
      throw new RangeError(`${path} active project has an invalid terminal/blocked state`);
    }
    if (!(project.spentSUSD > 0)) {
      throw new RangeError(`${path} active project must have spending`);
    }
  } else if (project.status === "waiting") {
    if (project.buildingId !== null || project.completedDay !== null) {
      throw new RangeError(`${path} waiting project must not have a building`);
    }
    if (project.cancelledDay !== null || project.blockedReason === null) {
      throw new RangeError(`${path} waiting project must record a blocked reason`);
    }
    if (project.lastWorkers !== 0) {
      throw new RangeError(`${path} waiting project must not report workers`);
    }
  } else if (project.status === "paused") {
    if (project.buildingId !== null || project.completedDay !== null) {
      throw new RangeError(`${path} paused project must not have a building`);
    }
    if (project.cancelledDay !== null || project.blockedReason !== null) {
      throw new RangeError(`${path} paused project has an invalid blocked/terminal state`);
    }
    if (project.lastWorkers !== 0) {
      throw new RangeError(`${path} paused project must not report workers`);
    }
  } else if (project.status === "completed") {
    if (!nearComplete) {
      throw new RangeError(`${path} completed project must have spent its full cost`);
    }
    if (!constructionMaterialsReady(project)) {
      throw new RangeError(`${path} completed project must have delivered all materials`);
    }
    if (project.buildingId === null || project.completedDay === null) {
      throw new RangeError(`${path} completed project must record its building and day`);
    }
    if (project.cancelledDay !== null || project.blockedReason !== null) {
      throw new RangeError(`${path} completed project has an invalid terminal/blocked state`);
    }
  } else {
    if (project.buildingId !== null || project.completedDay !== null) {
      throw new RangeError(`${path} cancelled project must not have a building`);
    }
    if (project.cancelledDay === null || project.blockedReason !== null) {
      throw new RangeError(`${path} cancelled project must record its cancellation day`);
    }
    if (project.workingCapitalPaidSUSD !== 0) {
      throw new RangeError(`${path} cancelled project must not have working capital`);
    }
  }
}

/** Validate the complete authoritative construction state. */
export function assertValidConstructionState(world: World): void {
  const construction = world.construction as ConstructionState | undefined;
  if (construction === undefined || construction === null) {
    throw new RangeError("world.construction is required");
  }
  if (!Array.isArray(construction.projects)) {
    throw new RangeError("world.construction.projects must be an array");
  }
  if (!Array.isArray(construction.history)) {
    throw new RangeError("world.construction.history must be an array");
  }
  const countryIds = new Set(world.countries.map((country) => country.id));
  const regionOwners = new Map<Id, Id>();
  for (const country of world.countries) {
    for (const regionId of country.regionIds) regionOwners.set(regionId, country.id);
  }
  const buildingIds = new Set(world.buildings.map((building) => building.id));
  const projectIds = new Set<Id>();
  let active = 0;
  let terminated = 0;
  let previousId = 0;
  for (const project of construction.projects) {
    requireProjectState(project);
    if (projectIds.has(project.id)) {
      throw new RangeError(`duplicate construction project id ${String(project.id)}`);
    }
    if (project.id <= previousId) {
      throw new RangeError("world.construction.projects must be ordered by ascending id");
    }
    previousId = project.id;
    projectIds.add(project.id);
    if (!countryIds.has(project.countryId)) {
      throw new RangeError(
        `construction project ${String(project.id)} references unknown country ${String(project.countryId)}`,
      );
    }
    if (!world.regions.some((region) => region.id === project.regionId)) {
      throw new RangeError(
        `construction project ${String(project.id)} references unknown region ${String(project.regionId)}`,
      );
    }
    if (regionOwners.get(project.regionId) !== project.countryId) {
      throw new RangeError(
        `construction project ${String(project.id)} region must be owned by its country`,
      );
    }
    if (constructionProjectIsTerminal(project.status)) terminated += 1;
    else active += 1;
    if (project.buildingId !== null) {
      const building = world.buildings.find((candidate) => candidate.id === project.buildingId);
      if (building === undefined) {
        throw new RangeError(
          `construction project ${String(project.id)} references unknown building ${String(project.buildingId)}`,
        );
      }
      if (building.definitionId !== project.definitionId || building.regionId !== project.regionId) {
        throw new RangeError(
          `construction project ${String(project.id)} building does not match its definition/region`,
        );
      }
      if (building.ownerKind !== "state") {
        throw new RangeError(
          `construction project ${String(project.id)} building must be state-owned`,
        );
      }
    }
    if (!world.profitDistribution.enabled) {
      throw new RangeError(
        "construction projects require the state-enterprise profit-distribution policy",
      );
    }
  }
  if (active > MAX_ACTIVE_CONSTRUCTION_PROJECTS) {
    throw new RangeError(
      `world.construction.projects has ${String(active)} active projects; maximum ${String(
        MAX_ACTIVE_CONSTRUCTION_PROJECTS,
      )}`,
    );
  }
  if (terminated > MAX_RETAINED_TERMINATED_CONSTRUCTION_PROJECTS) {
    throw new RangeError(
      `world.construction.projects retains ${String(terminated)} terminated projects; maximum ${String(
        MAX_RETAINED_TERMINATED_CONSTRUCTION_PROJECTS,
      )}`,
    );
  }
  if (!Number.isInteger(construction.nextProjectId) || construction.nextProjectId < 1) {
    throw new RangeError("world.construction.nextProjectId must be a positive integer");
  }
  if (construction.nextProjectId <= previousId) {
    throw new RangeError(
      "world.construction.nextProjectId must be greater than every retained project id",
    );
  }
  if (!Number.isInteger(construction.nextBuildingId) || construction.nextBuildingId < 1) {
    throw new RangeError("world.construction.nextBuildingId must be a positive integer");
  }
  for (const buildingId of buildingIds) {
    if (construction.nextBuildingId <= buildingId) {
      throw new RangeError(
        "world.construction.nextBuildingId must be greater than every building id",
      );
    }
  }
  if (construction.history.length > MAX_CONSTRUCTION_HISTORY_AGGREGATES) {
    throw new RangeError(
      `world.construction.history must contain at most ${String(
        MAX_CONSTRUCTION_HISTORY_AGGREGATES,
      )} entries`,
    );
  }
  const historyCountries = new Set<Id>();
  for (const aggregate of construction.history) {
    if (!countryIds.has(aggregate.countryId)) {
      throw new RangeError(
        `construction history references unknown country ${String(aggregate.countryId)}`,
      );
    }
    if (historyCountries.has(aggregate.countryId)) {
      throw new RangeError(
        `duplicate construction history aggregate for country ${String(aggregate.countryId)}`,
      );
    }
    historyCountries.add(aggregate.countryId);
    for (const [field, value] of [
      ["projectsCompleted", aggregate.projectsCompleted],
      ["projectsCancelled", aggregate.projectsCancelled],
    ] as const) {
      if (!Number.isInteger(value) || value < 0) {
        throw new RangeError(`construction history ${field} must be a non-negative integer`);
      }
    }
    for (const [field, value] of [
      ["totalSpentSUSD", aggregate.totalSpentSUSD],
      ["totalWrittenOffSUSD", aggregate.totalWrittenOffSUSD],
    ] as const) {
      if (!Number.isFinite(value) || value < 0) {
        throw new RangeError(`construction history ${field} must be finite and non-negative`);
      }
    }
  }
}

/** Type guard for a day on which a project may progress. */
export function constructionCanProgress(project: ConstructionProject, dayIndex: Day): boolean {
  if (project.authorizedDay >= dayIndex) return false;
  return constructionProjectIsLive(project.status);
}

/** A bounded description used by reports/tests; not persisted. */
export interface ConstructionProjectSummary {
  readonly projectId: Id;
  readonly status: ConstructionProjectStatus;
  readonly progress: number;
  readonly remainingSUSD: number;
}

/** Summarize one project for callers that do not need the full record. */
export function summarizeConstructionProject(project: ConstructionProject): ConstructionProjectSummary {
  return {
    projectId: project.id,
    status: project.status,
    progress: constructionProjectProgress(project),
    remainingSUSD: constructionProjectRemaining(project),
  };
}
