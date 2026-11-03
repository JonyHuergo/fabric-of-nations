/**
 * D-116 checkpoint rollback runner for phase-mode economic days.
 *
 * The runner advances the live world in place (`tickPhaseMode`) and keeps one
 * validated deep copy of the last good state. A checkpoint is taken when the
 * runner is created, at the start of every civil month and whenever the caller
 * reports an accepted action (`checkpointRollbackRunner`). Because actions only
 * enter between days and a checkpoint follows each one, the days between the
 * checkpoint and any later day are pure deterministic ticks.
 *
 * When a day fails, the runner rebuilds the start of that day by replaying from
 * the checkpoint, checks the replayed state against the fingerprint
 * recorded at the start of the failed day, and puts it back into the caller's
 * world object. No partial day is ever left in the live world:
 *
 * - any error is rethrown as `DayRolledBackError` after restoration;
 * - a replay failure or fingerprint mismatch is an `IntegrityFailureError`; the
 *   live world is then left at the checkpoint and the run must not continue.
 *
 * The runner record is plain data owned by the caller; the module holds no state.
 */

import { dayIndexToCivilDate } from "./calendar.js";
import { CAMPAIGN_TERMINAL_DAY_INDEX } from "./constants.js";
import { cloneWorld } from "./economy/day.js";
import { worldDayFingerprint } from "./integrity.js";
import type { TickContext } from "./population/types.js";
import { tickPhaseMode, type TickResult } from "./tick.js";
import type { Day } from "./types.js";
import { requireInteger } from "./validation.js";
import type { World } from "./world.js";

/** Caller-owned rollback state. */
export interface RollbackRunner {
  /** The live world. It is advanced in place and restored in place. */
  readonly world: World;
  /** Validated deep copy of the last good state. Never mutated. */
  checkpoint: World;
  /** Diagnostics; they never affect simulation outcomes. */
  checkpointsTaken: number;
  rollbacks: number;
}

/** A day failed; the world was restored to the start of that day. */
export class DayRolledBackError extends Error {
  readonly dayIndex: Day;

  constructor(dayIndex: Day, cause: unknown) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    super(`day ${String(dayIndex)} failed and was rolled back to its start: ${reason}`, {
      cause,
    });
    this.name = "DayRolledBackError";
    this.dayIndex = dayIndex;
  }
}

/** Rollback could not reconstruct the start of the failed day. */
export class IntegrityFailureError extends Error {
  readonly dayIndex: Day;

  constructor(dayIndex: Day, reason: string, cause?: unknown) {
    super(`integrity failure while rolling back day ${String(dayIndex)}: ${reason}`, { cause });
    this.name = "IntegrityFailureError";
    this.dayIndex = dayIndex;
  }
}

export interface RollbackRunSummary {
  readonly requestedTicks: number;
  readonly startDayIndex: Day;
  readonly endDayIndex: Day;
  readonly ticksProcessed: number;
  readonly terminalReached: boolean;
  /** Result of the last processed day, or null when no day was processed. */
  readonly lastResult: TickResult | null;
}

function phaseContext(context: TickContext): TickContext {
  return { ...context, integrity: "phase" };
}

/**
 * Create a runner for a world; the world is fully validated by the checkpoint copy,
 * unless the caller states it validated this exact world just before (D-137: a world
 * returned by `createEconomyWorld` or `deserializeWorld`, which validate it), so the
 * same validation does not run twice.
 */
export function createRollbackRunner(
  world: World,
  options: { readonly worldJustValidated?: boolean } = {},
): RollbackRunner {
  return {
    world,
    checkpoint: cloneWorld(world, { validate: options.worldJustValidated !== true }),
    checkpointsTaken: 1,
    rollbacks: 0,
  };
}

/**
 * Replace the checkpoint with a validated copy of the current world. Call after
 * every accepted action and after loading a save.
 */
export function checkpointRollbackRunner(runner: RollbackRunner): void {
  runner.checkpoint = cloneWorld(runner.world);
  runner.checkpointsTaken += 1;
}

function isFirstDayOfMonth(dayIndex: Day): boolean {
  return dayIndexToCivilDate(dayIndex).day === 1;
}

/** Rebuild the start of `dayIndex` from the checkpoint and publish it into the live world. */
function restoreStartOfDay(
  runner: RollbackRunner,
  dayIndex: Day,
  fingerprint: string,
  context: TickContext,
): void {
  runner.rollbacks += 1;
  const restored = cloneWorld(runner.checkpoint, { validate: false });
  try {
    while (restored.dayIndex < dayIndex) {
      tickPhaseMode(restored, context);
    }
  } catch (error) {
    Object.assign(runner.world, cloneWorld(runner.checkpoint, { validate: false }));
    throw new IntegrityFailureError(dayIndex, "replay from the checkpoint failed", error);
  }
  if (restored.dayIndex !== dayIndex || worldDayFingerprint(restored) !== fingerprint) {
    Object.assign(runner.world, cloneWorld(runner.checkpoint, { validate: false }));
    throw new IntegrityFailureError(
      dayIndex,
      "the replayed start of day does not match the state recorded before the day",
    );
  }
  Object.assign(runner.world, restored);
}

/** Run one day in phase mode with rollback. */
function runOneDay(runner: RollbackRunner, context: TickContext): TickResult {
  const world = runner.world;
  const dayIndex = world.dayIndex;
  if (isFirstDayOfMonth(dayIndex) && runner.checkpoint.dayIndex !== dayIndex) {
    context.phaseObserver?.("checkpoint");
    // The previous day ended a civil month, so the whole world was validated then.
    runner.checkpoint = cloneWorld(world, { validate: false });
    runner.checkpointsTaken += 1;
  }
  context.phaseObserver?.("fingerprint");
  const fingerprint = worldDayFingerprint(world);
  try {
    return tickPhaseMode(world, context);
  } catch (error) {
    restoreStartOfDay(runner, dayIndex, fingerprint, context);
    throw new DayRolledBackError(dayIndex, error);
  }
}

/**
 * Run at most `count` phase-mode days with rollback. Stops at the terminal
 * boundary. Throws `DayRolledBackError` (world at the start of the failed day) or
 * `IntegrityFailureError` (world at the checkpoint; do not continue).
 */
export function runTicksWithRollback(
  runner: RollbackRunner,
  count: number,
  context: TickContext,
): RollbackRunSummary {
  requireInteger(count, "count", 0, Number.MAX_SAFE_INTEGER);
  const phase = phaseContext(context);
  const startDayIndex = runner.world.dayIndex;
  let ticksProcessed = 0;
  let lastResult: TickResult | null = null;
  while (ticksProcessed < count && runner.world.dayIndex < CAMPAIGN_TERMINAL_DAY_INDEX) {
    const result = runOneDay(runner, phase);
    if (!result.advanced) break;
    lastResult = result;
    ticksProcessed += 1;
  }
  return {
    requestedTicks: count,
    startDayIndex,
    endDayIndex: runner.world.dayIndex,
    ticksProcessed,
    terminalReached: runner.world.dayIndex >= CAMPAIGN_TERMINAL_DAY_INDEX,
    lastResult,
  };
}
