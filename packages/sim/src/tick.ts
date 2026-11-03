/**
 * Deterministic daily tick driver.
 *
 * M2-only worlds with pop blocks and no buildings/markets retain the
 * population-only path:
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
 *
 * Worlds with buildings or markets use the M3f integrated path. The complete day
 * is staged on a clone and published only after every phase succeeds.
 */

import { dayIndexToCivilDate, daysInMonth, isTerminalDayIndex } from "./calendar.js";
import { CAMPAIGN_TERMINAL_DAY_INDEX } from "./constants.js";
import { applyAnnualAgeing } from "./population/ageing.js";
import {
  assertValidPopulationDefinitions,
  assertValidPopulationInputs,
} from "./population/definitions.js";
import { applyDailyDemography } from "./population/demography.js";
import { settlePopulationNeeds } from "./population/needs.js";
import { workingAgePopulation, worldPopulation } from "./population/state.js";
import { updateDailyMilitancy, updateMonthlyWealth } from "./population/wealth.js";
import {
  cloneWorldForTick,
  runEconomicDay,
  type EconomyDayResult,
} from "./economy/day.js";
import { assertDailyWorldInvariants } from "./integrity.js";
import type {
  PopulationDefinitions,
  PopulationInputs,
  PopulationTickResult,
  TickContext,
} from "./population/types.js";
import type { Day } from "./types.js";
import { requireInteger } from "./validation.js";
import { assertValidWorldForTick, type World } from "./world.js";

/** Explicit result of one attempted daily transition. */
export interface TickResult {
  readonly advanced: boolean;
  readonly dayProcessed: Day | null;
  readonly dayIndex: Day;
  readonly campaignComplete: boolean;
  readonly population?: PopulationTickResult;
  readonly economy?: EconomyDayResult["economy"];
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
  assertValidPopulationDefinitions(population.definitions);
  if (population.inputs !== undefined) {
    assertValidPopulationInputs(world, population.definitions, population.inputs);
  }
  return population.definitions;
}

function populationInputs(context: TickContext): PopulationInputs {
  const inputs = context.population?.inputs;
  if (inputs === undefined) {
    throw new RangeError(
      "M2 needs require population.inputs; integrated M3f worlds use market demand instead",
    );
  }
  return inputs;
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
  const inputs = populationInputs(context);
  const date = dayIndexToCivilDate(dayIndex);
  const aged = date.month === 1 && date.day === 1 && dayIndex !== world.startDayIndex;
  const populationStart = worldPopulation(world);
  if (aged) applyAnnualAgeing(world);

  const demography = applyDailyDemography(world, definitions, dayIndex, aged);
  const needs = settlePopulationNeeds(
    world,
    definitions,
    inputs,
    dayIndex,
    population.collectNeedDetails ?? true,
  );
  updateDailyMilitancy(world, needs);

  let wealthUpdates: PopulationTickResult["wealthUpdates"] = [];
  if (lastDayOfMonth(dayIndex)) {
    wealthUpdates = updateMonthlyWealth(world, definitions, inputs, dayIndex, needs);
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
  if (context?.integrity === "phase" && isEconomicWorld(world)) {
    return tickPhaseMode(world, context);
  }
  assertValidWorldForTick(world);

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
  if (world.buildings.length > 0 || world.markets.length > 0) {
    const economy = context?.economy;
    const population = context?.population;
    if (economy === undefined) {
      throw new RangeError("an economy context is required for an economic world");
    }
    if (population === undefined) {
      throw new RangeError("a population context is required for an economic world");
    }
    const working = cloneWorldForTick(world);
    const day = runEconomicDay(
      working,
      population.definitions,
      economy.definitions,
      processedDay,
      { validateWorld: false },
    );
    working.dayIndex = processedDay + 1;
    assertValidWorldForTick(working);
    Object.assign(world, working);
    const base: TickResult = {
      advanced: true,
      dayProcessed: processedDay,
      dayIndex: world.dayIndex,
      campaignComplete: isTerminalDayIndex(world.dayIndex),
    };
    return { ...base, population: day.population, economy: day.economy };
  }
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

function isEconomicWorld(world: World): boolean {
  return world.buildings.length > 0 || world.markets.length > 0;
}

/**
 * D-116 phase-mode economic day, run in place.
 *
 * The day starts with the cheap daily invariants (the world was fully validated
 * when its rollback checkpoint was taken or at the previous month end), runs every
 * phase with its own precondition checks, and ends with the cheap invariants or,
 * at a civil month end and at the terminal boundary, whole-world validation. On
 * any error the world is left partly advanced: callers other than
 * `runTicksWithRollback` must use the default staged mode.
 */
export function tickPhaseMode(world: World, context: TickContext): TickResult {
  const observe = context.phaseObserver;
  observe?.("invariants-start");
  assertDailyWorldInvariants(world);
  if (world.dayIndex >= CAMPAIGN_TERMINAL_DAY_INDEX) {
    return {
      advanced: false,
      dayProcessed: null,
      dayIndex: world.dayIndex,
      campaignComplete: true,
    };
  }
  const economy = context.economy;
  const population = context.population;
  if (economy === undefined) {
    throw new RangeError("an economy context is required for an economic world");
  }
  if (population === undefined) {
    throw new RangeError("a population context is required for an economic world");
  }
  const processedDay = world.dayIndex;
  const day = runEconomicDay(
    world,
    population.definitions,
    economy.definitions,
    processedDay,
    {
      validateWorld: false,
      integrity: "phase",
      ...(observe === undefined ? {} : { phaseObserver: observe }),
    },
  );
  world.dayIndex = processedDay + 1;
  if (lastDayOfMonth(processedDay) || isTerminalDayIndex(world.dayIndex)) {
    observe?.("validate-month-end");
    assertValidWorldForTick(world);
  } else {
    observe?.("invariants-end");
    assertDailyWorldInvariants(world);
  }
  observe?.("result");
  return {
    advanced: true,
    dayProcessed: processedDay,
    dayIndex: world.dayIndex,
    campaignComplete: isTerminalDayIndex(world.dayIndex),
    population: day.population,
    economy: day.economy,
  };
}

function runUntil(
  world: World,
  limit: number,
  context?: TickContext,
): { readonly startDayIndex: Day; readonly ticksProcessed: number } {
  assertValidWorldForTick(world);
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
