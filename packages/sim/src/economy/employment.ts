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

import { buildingJobs } from "./buildingJobs.js";
import { assertValidDayIndex, dayIndexToCivilDate, isTerminalDayIndex } from "../calendar.js";
import { workingAgePopulation } from "../population/state.js";
import type { DayIndex, Id } from "../types.js";
import type { World } from "../world.js";
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
  ProfessionDef,
} from "./types.js";

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
  const job = buildingJobs(definition, building).find((candidate) => candidate.professionId === professionId);
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

export { apportionLargestRemainder } from "./apportion.js";

/** Validate all current assignments and caps against the supplied definitions. */
export function assertValidEmploymentState(
  world: World,
  definitions: EconomyDefinitions,
): void {
  // P7 (D-154): the labour market's rules (own province, ceilings, institutions).
  requireLabourMarket(world);
  assertValidLabourEmployment(world, definitions);
}

/** D-155: every economy world runs the P7 labour market; its static-wage allocator was removed. */
function requireLabourMarket(world: World): void {
  if (!world.labourMarket.enabled) throw new RangeError("an economy world needs the labour market (D-155)");
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
  requireLabourMarket(world);
  return refreshLabourEmployment(world, definitions, dayIndex);
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
  requireLabourMarket(world);
  return repairLabourEmploymentAfterDemography(world, definitions);
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
