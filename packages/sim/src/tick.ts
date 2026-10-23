/**
 * Deterministic no-op tick driver for M1.
 *
 * M1 implements only the boundary check and the day-advance stage of the GDD
 * §4.2 pipeline. There are no events, demographics, markets, finance, or AI
 * stages yet, so no other behavior is simulated. The only authoritative change
 * is `dayIndex`.
 *
 * `World.dayIndex` is the next civil day to process. `tick` processes exactly
 * that index and increments the index by one. At the terminal boundary 36,524 it
 * returns without mutation.
 */

import { isTerminalDayIndex } from "./calendar.js";
import { CAMPAIGN_TERMINAL_DAY_INDEX } from "./constants.js";
import type { Day } from "./types.js";
import { requireInteger } from "./validation.js";
import { assertValidWorld, type World } from "./world.js";

/** Explicit result of one attempted daily transition. */
export interface TickResult {
  /** True when a campaign day was processed and the index advanced. */
  readonly advanced: boolean;
  /** The day index processed by this call, or null at the terminal boundary. */
  readonly dayProcessed: Day | null;
  /** The next civil day to process after this call. */
  readonly dayIndex: Day;
  /** True when `dayIndex` is now the terminal boundary 2000-01-01. */
  readonly campaignComplete: boolean;
}

/** Summary of a bounded or complete campaign run. */
export interface CampaignRunSummary {
  readonly startDayIndex: Day;
  readonly endDayIndex: Day;
  readonly ticksProcessed: number;
  readonly terminalReached: boolean;
}

/** Summary of `runTicks`, including the caller's requested tick count. */
export interface TickRunSummary extends CampaignRunSummary {
  readonly requestedTicks: number;
}

/**
 * Process at most one civil day.
 *
 * Inputs: the explicit world state.
 * Effects: on success, increments `dayIndex` by exactly one. At the terminal
 * boundary nothing is mutated.
 * Returns: an explicit result describing whether a day was processed.
 */
export function tick(world: World): TickResult {
  assertValidWorld(world);

  if (world.dayIndex >= CAMPAIGN_TERMINAL_DAY_INDEX) {
    return {
      advanced: false,
      dayProcessed: null,
      dayIndex: world.dayIndex,
      campaignComplete: true,
    };
  }

  const processedDay = world.dayIndex;
  world.dayIndex = processedDay + 1;

  return {
    advanced: true,
    dayProcessed: processedDay,
    dayIndex: world.dayIndex,
    campaignComplete: isTerminalDayIndex(world.dayIndex),
  };
}

function runUntil(
  world: World,
  limit: number,
): { readonly startDayIndex: Day; readonly ticksProcessed: number } {
  assertValidWorld(world);
  const startDayIndex = world.dayIndex;
  let ticksProcessed = 0;
  while (ticksProcessed < limit && world.dayIndex < CAMPAIGN_TERMINAL_DAY_INDEX) {
    const result = tick(world);
    if (!result.advanced) break;
    ticksProcessed += 1;
  }
  return { startDayIndex, ticksProcessed };
}

/** Run at most `count` daily transitions, stopping early at the terminal boundary. */
export function runTicks(world: World, count: number): TickRunSummary {
  requireInteger(count, "count", 0, Number.MAX_SAFE_INTEGER);
  const { startDayIndex, ticksProcessed } = runUntil(world, count);
  return {
    requestedTicks: count,
    startDayIndex,
    endDayIndex: world.dayIndex,
    ticksProcessed,
    terminalReached: isTerminalDayIndex(world.dayIndex),
  };
}

/** Run from the current day to the 2000-01-01 terminal boundary. */
export function runCampaign(world: World): CampaignRunSummary {
  const { startDayIndex, ticksProcessed } = runUntil(world, Number.MAX_SAFE_INTEGER);
  return {
    startDayIndex,
    endDayIndex: world.dayIndex,
    ticksProcessed,
    terminalReached: isTerminalDayIndex(world.dayIndex),
  };
}

/** Explicit synonym for `runCampaign`, matching the century-scale requirement. */
export function runCentury(world: World): CampaignRunSummary {
  return runCampaign(world);
}
