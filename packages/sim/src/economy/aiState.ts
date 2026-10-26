/**
 * M6 country-AI policy and persisted state contracts.
 *
 * This module deliberately has no dependency on the world, finance, or the rest
 * of the economy so state validation and serialization can use it without a
 * circular import. The deterministic decision and action engine lives in
 * `ai.ts`.
 */

import { CAMPAIGN_TERMINAL_DAY_INDEX } from "../constants.js";
import type { Day, Id } from "../types.js";
import {
  requireArray,
  requireInteger,
  requireRecord,
  requireString,
} from "../validation.js";
import {
  AI_EVALUATION_PERIOD_DAYS,
  DEFAULT_COUNTRY_AI_ENABLED,
  MAX_AI_ACTION_SUMMARY_LENGTH,
} from "./constants.js";
import {
  COUNTRY_AI_GOAL_IDS,
  type CountryAIGoalId,
  type CountryAIPolicy,
  type CountryAIState,
} from "./types.js";

/** Create a validated country-AI enable policy from optional scenario input. */
export function createCountryAIPolicy(input?: Partial<CountryAIPolicy>): CountryAIPolicy {
  return assertValidCountryAIPolicy(
    { enabled: input?.enabled ?? DEFAULT_COUNTRY_AI_ENABLED },
    "countryAI",
  );
}

/** Validate a country-AI enable policy, returning a normalized copy. */
export function assertValidCountryAIPolicy(value: unknown, path: string): CountryAIPolicy {
  const record = requireRecord(value, path);
  if (typeof record.enabled !== "boolean") {
    throw new TypeError(`${path}.enabled must be a boolean`);
  }
  return { enabled: record.enabled };
}

/** True when `value` is one of the persisted M6 goal identifiers. */
export function isCountryAIGoalId(value: string): value is CountryAIGoalId {
  return (COUNTRY_AI_GOAL_IDS as readonly string[]).includes(value);
}

/**
 * First scheduled evaluation day for a country.
 *
 * The schedule is strictly after the scenario start, so authored initial policy
 * is observed on the start day and is not rewritten before the first tick. The
 * absolute day index is congruent to the stable country id modulo the evaluation
 * period, which staggers evaluations across the week.
 *
 * Inputs: `startDayIndex` (0..36,524), `countryId` (uint32).
 * Output: a valid day index, clamped to the terminal boundary when no later day
 * exists. No wall-clock or random input is used.
 */
export function firstAIEvaluationDay(startDayIndex: Day, countryId: Id): Day {
  if (!Number.isInteger(startDayIndex) || startDayIndex < 0) {
    throw new RangeError("startDayIndex must be a non-negative integer");
  }
  if (!Number.isInteger(countryId) || countryId < 0) {
    throw new RangeError("countryId must be a non-negative integer");
  }
  const firstCandidate = startDayIndex + 1;
  const offset =
    ((countryId % AI_EVALUATION_PERIOD_DAYS) -
      (firstCandidate % AI_EVALUATION_PERIOD_DAYS) +
      AI_EVALUATION_PERIOD_DAYS) %
    AI_EVALUATION_PERIOD_DAYS;
  return Math.min(CAMPAIGN_TERMINAL_DAY_INDEX, firstCandidate + offset);
}

/** Create the fixed-size initial AI state for one country. */
export function createCountryAIState(countryId: Id, startDayIndex: Day): CountryAIState {
  return {
    nextEvaluationDay: firstAIEvaluationDay(startDayIndex, countryId),
    currentGoalId: null,
    lastDecisionDay: null,
    lastActionSummary: null,
  };
}

/**
 * Validate one persisted country-AI state.
 *
 * The goal and last-decision fields are either both set or both unset; a
 * decision always records the goal it selected. `nextEvaluationDay` never
 * precedes the last decision day. The summary is bounded so the field cannot
 * grow without limit.
 */
export function assertValidCountryAIState(value: unknown, path: string): CountryAIState {
  const record = requireRecord(value, path);
  const nextEvaluationDay = requireInteger(
    record.nextEvaluationDay,
    `${path}.nextEvaluationDay`,
    0,
    CAMPAIGN_TERMINAL_DAY_INDEX,
  );
  const lastDecisionDay =
    record.lastDecisionDay === null
      ? null
      : requireInteger(
          record.lastDecisionDay,
          `${path}.lastDecisionDay`,
          0,
          CAMPAIGN_TERMINAL_DAY_INDEX,
        );
  let currentGoalId: CountryAIGoalId | null = null;
  if (record.currentGoalId !== null) {
    const goal = requireString(record.currentGoalId, `${path}.currentGoalId`, {
      minLength: 1,
      maxLength: 64,
    });
    if (!isCountryAIGoalId(goal)) {
      throw new RangeError(`${path}.currentGoalId is not a registered M6 goal`);
    }
    currentGoalId = goal;
  }
  if ((currentGoalId === null) !== (lastDecisionDay === null)) {
    throw new RangeError(
      `${path}.currentGoalId and ${path}.lastDecisionDay must both be set or both be null`,
    );
  }
  if (lastDecisionDay !== null && nextEvaluationDay < lastDecisionDay) {
    throw new RangeError(
      `${path}.nextEvaluationDay must not precede ${path}.lastDecisionDay`,
    );
  }
  let lastActionSummary: string | null = null;
  if (record.lastActionSummary !== null) {
    lastActionSummary = requireString(
      record.lastActionSummary,
      `${path}.lastActionSummary`,
      { minLength: 1, maxLength: MAX_AI_ACTION_SUMMARY_LENGTH },
    );
  }
  return {
    nextEvaluationDay,
    currentGoalId,
    lastDecisionDay,
    lastActionSummary,
  };
}

/**
 * Validate every country's AI state and reject duplicate schedule ownership.
 * Country identity itself is validated by the country/currency pass.
 */
export function assertValidCountryAIStates(countries: readonly unknown[]): void {
  const ids = new Set<Id>();
  requireArray(countries, "world.countries");
  for (let index = 0; index < countries.length; index += 1) {
    const record = requireRecord(countries[index], `world.countries[${String(index)}]`);
    const id = requireInteger(
      record.id,
      `world.countries[${String(index)}].id`,
      0,
      0xffff_ffff,
    );
    if (ids.has(id)) throw new RangeError(`duplicate country id ${String(id)}`);
    ids.add(id);
    assertValidCountryAIState(record.ai, `country ${String(id)}.ai`);
  }
}
