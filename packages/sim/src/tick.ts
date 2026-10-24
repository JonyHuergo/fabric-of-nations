/**
 * Deterministic daily tick driver for M2.
 *
 * The M1 boundary and day-advance stages are preserved. When a population
 * context is supplied and the world contains pop blocks, the implementation
 * follows the GDD daily order:
 *   1. validate/boundary
 *   2. events/policy (no-op)
 *   3. annual ageing when due
 *   4. daily births/deaths
 *   5-8. labor/production/market (no-op)
 *   9-10. needs fixture
 *   11-12. cash settlement/finance (no-op)
 *   13. daily militancy and month-end wealth
 *   14. diagnostics (no history)
 *   15. advance day
 */

import { dayIndexToCivilDate, daysInMonth, isTerminalDayIndex } from "./calendar.js";
import { CAMPAIGN_TERMINAL_DAY_INDEX } from "./constants.js";
import { applyAnnualAgeing } from "./population/ageing.js";
import {
  assertValidPopulationInputs,
} from "./population/definitions.js";
import { applyDailyDemography } from "./population/demography.js";
import { settlePopulationNeeds } from "./population/needs.js";
import { workingAgePopulation, worldPopulation } from "./population/state.js";
import { updateDailyMilitancy, updateMonthlyWealth } from "./population/wealth.js";
import type {
  PopulationDefinitions,
  PopulationTickResult,
  TickContext,
} from "./population/types.js";
import type { Day } from "./types.js";
import { requireInteger } from "./validation.js";
import { assertValidWorld, type World } from "./world.js";

/** Explicit result of one attempted daily transition. */
export interface TickResult {
  readonly advanced: boolean;
  readonly dayProcessed: Day | null;
  readonly dayIndex: Day;
  readonly campaignComplete: boolean;
  readonly population?: PopulationTickResult;
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

function validatePopulationContext(world: World, context: TickContext | undefined): PopulationDefinitions {
  if (world.popBlocks.length === 0) {
    throw new RangeError("no population context is available for a population world");
  }
  const population = context?.population;
  if (population === undefined) {
    throw new RangeError("a population context is required when the world contains pop blocks");
  }
  assertValidPopulationInputs(world, population.definitions, population.inputs);
  return population.definitions;
}

function lastDayOfMonth(dayIndex: Day): boolean {
  const date = dayIndexToCivilDate(dayIndex);
  return date.day === daysInMonth(date.year, date.month);
}

function runPopulationDay(
  world: World,
  dayIndex: Day,
  context: TickContext,
): PopulationTickResult {
  const population = context.population;
  if (population === undefined) throw new RangeError("missing population context");
  const definitions = validatePopulationContext(world, context);
  const date = dayIndexToCivilDate(dayIndex);
  const aged = date.month === 1 && date.day === 1 && dayIndex !== world.startDayIndex;
  const populationStart = worldPopulation(world);
  if (aged) applyAnnualAgeing(world);

  const demography = applyDailyDemography(world, definitions, dayIndex, aged);
  const needs = settlePopulationNeeds(
    world,
    definitions,
    population.inputs,
    dayIndex,
    population.collectNeedDetails ?? true,
  );
  updateDailyMilitancy(world, needs);

  let wealthUpdates: PopulationTickResult["wealthUpdates"] = [];
  if (lastDayOfMonth(dayIndex)) {
    wealthUpdates = updateMonthlyWealth(world, definitions, population.inputs, dayIndex, needs);
  }

  let workingAge = 0;
  for (const block of world.popBlocks) workingAge += workingAgePopulation(block);

  return {
    aged,
    populationStart,
    births: demography.totalBirths,
    deaths: demography.totalDeaths,
    populationEnd: demography.populationEnd,
    workingAgePopulation: workingAge,
    demography,
    needs,
    wealthUpdates,
  };
}

/**
 * Process at most one civil day.
 *
 * Inputs: explicit world state and optional population context.
 * Effects: advances `dayIndex` by one on success; mutates population state when
 * a population context is supplied. No hidden state or wall-clock dependency.
 */
export function tick(world: World, context?: TickContext): TickResult {
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
  let populationResult: PopulationTickResult | undefined;
  if (world.popBlocks.length > 0) {
    populationResult = runPopulationDay(world, processedDay, context ?? {});
  }

  world.dayIndex = processedDay + 1;
  const base: TickResult = {
    advanced: true,
    dayProcessed: processedDay,
    dayIndex: world.dayIndex,
    campaignComplete: isTerminalDayIndex(world.dayIndex),
  };
  return populationResult === undefined ? base : { ...base, population: populationResult };
}

function runUntil(
  world: World,
  limit: number,
  context?: TickContext,
): { readonly startDayIndex: Day; readonly ticksProcessed: number } {
  assertValidWorld(world);
  const startDayIndex = world.dayIndex;
  let ticksProcessed = 0;
  while (ticksProcessed < limit && world.dayIndex < CAMPAIGN_TERMINAL_DAY_INDEX) {
    const result = tick(world, context);
    if (!result.advanced) break;
    ticksProcessed += 1;
  }
  return { startDayIndex, ticksProcessed };
}

/** Run at most `count` daily transitions. */
export function runTicks(world: World, count: number, context?: TickContext): TickRunSummary {
  requireInteger(count, "count", 0, Number.MAX_SAFE_INTEGER);
  const { startDayIndex, ticksProcessed } = runUntil(world, count, context);
  return {
    requestedTicks: count,
    startDayIndex,
    endDayIndex: world.dayIndex,
    ticksProcessed,
    terminalReached: isTerminalDayIndex(world.dayIndex),
  };
}

/** Run from the current day to the 2000-01-01 terminal boundary. */
export function runCampaign(world: World, context?: TickContext): CampaignRunSummary {
  const { startDayIndex, ticksProcessed } = runUntil(world, Number.MAX_SAFE_INTEGER, context);
  return {
    startDayIndex,
    endDayIndex: world.dayIndex,
    ticksProcessed,
    terminalReached: isTerminalDayIndex(world.dayIndex),
  };
}

/** Explicit synonym for `runCampaign`. */
export function runCentury(world: World, context?: TickContext): CampaignRunSummary {
  return runCampaign(world, context);
}

/** Exported for tests of the monthly cadence. */
export { lastDayOfMonth };
