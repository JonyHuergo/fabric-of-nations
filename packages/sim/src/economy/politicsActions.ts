/**
 * M8 validated player actions: propose/change/repeal a law and set the state
 * administration funding target (D-076).
 *
 * Both actions validate the complete candidate world before publishing. A
 * proposal only schedules a transition; it never applies the law immediately and
 * never rewrites a completed accounting period.
 */

import { assertValidDayIndex } from "../calendar.js";
import { requireFiniteNumber } from "../validation.js";
import type { DayIndex, Id } from "../types.js";
import { assertValidWorld, type World } from "../world.js";
import {
  MAX_FISCAL_BUDGET_SUSD_PER_YEAR,
  MAX_LAW_ENACTMENT_DAYS,
  MAX_LAW_TRANSITIONS_PER_COUNTRY,
  MIN_LAW_ENACTMENT_DAYS,
  LAW_SUPPORT_THRESHOLD,
} from "./constants.js";
import { lawDefinition, lawSupport, refreshInstitution } from "./politics.js";
import type {
  Country,
  EconomyDefinitions,
  LawDef,
  LawTransition,
  PoliticsDefinitions,
} from "./types.js";

function countryFor(world: World, countryId: Id): Country {
  const country = world.countries.find((entry) => entry.id === countryId);
  if (country === undefined) throw new RangeError(`unknown country ${String(countryId)}`);
  return country;
}

function politicsFor(definitions: EconomyDefinitions | undefined): PoliticsDefinitions {
  if (definitions?.politics === undefined) {
    throw new RangeError("M8 political institutions are not enabled for this world");
  }
  return definitions.politics;
}

/** Check the prerequisites of a target law against the enacted law map. */
export function lawPrerequisitesMet(
  country: Country,
  law: LawDef,
  definitions: PoliticsDefinitions,
): boolean {
  for (const prerequisiteId of law.prerequisites) {
    const prerequisite = lawDefinition(definitions, prerequisiteId);
    if (prerequisite === null) return false;
    if (prerequisite.slot === law.slot) {
      if (country.laws[law.slot] !== prerequisiteId) return false;
    } else if (country.laws[prerequisite.slot] !== prerequisiteId) {
      return false;
    }
  }
  return true;
}

/** Validate a law proposal without mutating the world. */
export function validateLawProposal(
  world: World,
  definitions: EconomyDefinitions | undefined,
  input: { readonly countryId: Id; readonly lawId: Id },
): LawDef {
  const politics = politicsFor(definitions);
  if (!world.politics.enabled) {
    throw new RangeError("M8 political institutions are not enabled for this world");
  }
  if (!Number.isInteger(input.lawId) || input.lawId < 1) {
    throw new RangeError("action.lawId must be a positive integer");
  }
  const country = countryFor(world, input.countryId);
  const law = lawDefinition(politics, input.lawId);
  if (law === null) throw new RangeError(`unknown law ${String(input.lawId)}`);
  if (!politics.laws.some((entry) => entry.id === law.id)) {
    throw new RangeError(`law ${String(law.id)} is not an implemented M8 option`);
  }
  if (country.laws[law.slot] === law.id) {
    throw new RangeError(`law ${law.key} is already enacted in the ${law.slot} slot`);
  }
  if (country.lawTransitions.some((transition) => transition.slot === law.slot)) {
    throw new RangeError(`a ${law.slot} law transition is already in progress`);
  }
  if (country.lawTransitions.length >= MAX_LAW_TRANSITIONS_PER_COUNTRY) {
    throw new RangeError(
      `at most ${String(MAX_LAW_TRANSITIONS_PER_COUNTRY)} law transitions may be in progress`,
    );
  }
  if (!law.eligibleRegimes.includes(country.regime.kind)) {
    throw new RangeError(
      `law ${law.key} is not available under the ${country.regime.kind} regime`,
    );
  }
  if (!lawPrerequisitesMet(country, law, politics)) {
    throw new RangeError(`law ${law.key} prerequisites are not met`);
  }
  const support = lawSupport(country, law, politics);
  if (support < LAW_SUPPORT_THRESHOLD) {
    throw new RangeError(
      `law ${law.key} has insufficient support ${support.toFixed(3)} (threshold ${LAW_SUPPORT_THRESHOLD.toFixed(3)})`,
    );
  }
  return law;
}

/** Effective-day duration from the current institution quality. */
export function lawEnactmentDuration(law: LawDef, quality: number): number {
  const divisor = 0.5 + 0.5 * Math.min(1, Math.max(0, quality));
  const duration = Math.ceil(law.enactmentDays / divisor);
  return Math.min(
    MAX_LAW_ENACTMENT_DAYS,
    Math.max(Math.max(MIN_LAW_ENACTMENT_DAYS, law.enactmentDays), duration),
  );
}

export interface LawProposalResult {
  readonly country: Country;
  readonly law: LawDef;
  readonly transition: LawTransition;
  readonly support: number;
}

/** Validate and atomically schedule one law transition. */
export function proposeLaw(
  world: World,
  definitions: EconomyDefinitions | undefined,
  input: { readonly countryId: Id; readonly lawId: Id },
  dayIndex: DayIndex,
  source: "player" | "ai" | "event",
): LawProposalResult {
  assertValidDayIndex(dayIndex);
  if (world.dayIndex !== dayIndex) {
    throw new RangeError("law proposal day must match the world day");
  }
  if (world.dayIndex >= 36_524) {
    throw new RangeError("the terminal boundary cannot start a law transition");
  }
  const law = validateLawProposal(world, definitions, input);
  const country = countryFor(world, input.countryId);
  const quality = country.institutions.quality;
  const duration = lawEnactmentDuration(law, quality);
  if (dayIndex + duration > 36_523) {
    throw new RangeError(
      "the law transition would become effective after the last processable campaign day",
    );
  }
  const transition: LawTransition = {
    id:
      country.lawTransitions.reduce((max, entry) => Math.max(max, entry.id), 0) + 1,
    slot: law.slot,
    fromLawId: country.laws[law.slot],
    toLawId: law.id,
    proposedDay: dayIndex,
    effectiveDay: Math.min(36_523, dayIndex + duration),
    source,
    support: lawSupport(country, law, politicsFor(definitions)),
  };
  const candidateCountry: Country = {
    ...country,
    lawTransitions: [...country.lawTransitions, transition].sort(
      (left, right) => left.id - right.id,
    ),
  };
  const candidate: World = {
    ...world,
    countries: world.countries.map((entry) =>
      entry.id === country.id ? candidateCountry : entry,
    ),
  };
  assertValidWorld(candidate);
  world.countries = candidate.countries;
  return { country: candidateCountry, law, transition, support: transition.support };
}

export interface InstitutionFundingResult {
  readonly country: Country;
  readonly previousAnnualSUSD: number;
  readonly annualSUSD: number;
  readonly changed: boolean;
}

/** Validate an institution-funding change without mutating the world. */
export function validateInstitutionFunding(
  world: World,
  definitions: EconomyDefinitions | undefined,
  input: { readonly countryId: Id; readonly annualSUSD: number },
): Country {
  politicsFor(definitions);
  const country = countryFor(world, input.countryId);
  const annual = requireFiniteNumber(input.annualSUSD, "action.annualSUSD");
  if (annual < 0) throw new RangeError("institution funding must be non-negative");
  if (annual > MAX_FISCAL_BUDGET_SUSD_PER_YEAR) {
    throw new RangeError(
      `institution funding must not exceed ${String(MAX_FISCAL_BUDGET_SUSD_PER_YEAR)}`,
    );
  }
  return country;
}

/** Validate and atomically set the state-administration funding target. */
export function setInstitutionFunding(
  world: World,
  definitions: EconomyDefinitions | undefined,
  input: { readonly countryId: Id; readonly annualSUSD: number },
  dayIndex: DayIndex,
): InstitutionFundingResult {
  assertValidDayIndex(dayIndex);
  if (world.dayIndex !== dayIndex) {
    throw new RangeError("institution funding day must match the world day");
  }
  politicsFor(definitions);
  const country = countryFor(world, input.countryId);
  const annual = requireFiniteNumber(input.annualSUSD, "action.annualSUSD");
  if (annual < 0) throw new RangeError("institution funding must be non-negative");
  if (annual > MAX_FISCAL_BUDGET_SUSD_PER_YEAR) {
    throw new RangeError(
      `institution funding must not exceed ${String(MAX_FISCAL_BUDGET_SUSD_PER_YEAR)}`,
    );
  }
  const previous = country.institutions.fundedAnnualSUSD;
  if (previous === annual) {
    return { country, previousAnnualSUSD: previous, annualSUSD: annual, changed: false };
  }
  const candidateCountry: Country = {
    ...country,
    institutions: {
      ...country.institutions,
      fundedAnnualSUSD: annual,
    },
  };
  const candidate: World = {
    ...world,
    countries: world.countries.map((entry) =>
      entry.id === country.id ? candidateCountry : entry,
    ),
  };
  refreshInstitution(candidate, candidateCountry, definitions as EconomyDefinitions, dayIndex);
  assertValidWorld(candidate);
  world.countries = candidate.countries;
  return {
    country: candidateCountry,
    previousAnnualSUSD: previous,
    annualSUSD: annual,
    changed: true,
  };
}
