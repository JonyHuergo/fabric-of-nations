/**
 * M8 political institutions: laws, regimes, elections, interest groups,
 * provincial unrest, crisis/revolution, scripted events, and the state
 * administration (GDD §9, D-076).
 *
 * The module is deterministic and uses no random draw. Countries, groups, laws,
 * provinces, and events are always processed in ascending stable id/key order.
 * Influence and support are derived indicators, never spendable resources.
 */

import { administrationPostsFunded, institutionProfession, institutionStaff, labourEligibleWorkforce } from "./labourMarket.js";
import {
  dayIndexToCivilDate,
  civilDateToDayIndex,
  daysInMonth,
  daysInYear,
  isTerminalDayIndex,
} from "../calendar.js";
import { populationTotal } from "../population/state.js";
import { inIdOrder } from "../ordering.js";
import { localWageIndex } from "./localWages.js";
import type { PopulationDefinitions } from "../population/types.js";
import type { Day, Id, Month, Rate } from "../types.js";
import {
  requireArray,
  requireFiniteNumber,
  requireInteger,
  requireRecord,
  requireString,
} from "../validation.js";
import type { World } from "../world.js";
import {
  ADMIN_TARGET_CLERK_SHARE,
  CONSTRUCTION_MIN_FACTOR,
  CONSTRUCTION_OVERLOAD_PENALTY,
  CONSTRUCTION_QUALITY_PENALTY,
  CRISIS_CRISIS_DAYS,
  CRISIS_DISRUPTION_DAYS,
  CRISIS_EXCLUSION_WEIGHT,
  CRISIS_MILITANCY_WEIGHT,
  CRISIS_OVERLOAD_WEIGHT,
  CRISIS_PRESSURE_DECAY,
  CRISIS_PRESSURE_THRESHOLD,
  CRISIS_REVOLUTION_COOLDOWN_DAYS,
  CRISIS_REVOLUTION_DAYS,
  CRISIS_STRIKE_DAYS,
  CRISIS_UNMET_WEIGHT,
  CRISIS_UNREST_DAYS,
  CRISIS_UNREST_WEIGHT,
  ELECTION_MIN_INSTITUTION_QUALITY,
  GOVERNING_GROUP_SUPPORT_WEIGHT,
  INSTITUTION_DISRUPTION_QUALITY_PENALTY,
  INSTITUTION_FUNDING_SHORTFALL_PENALTY,
  INSTITUTION_FUNDING_WEIGHT,
  INSTITUTION_INFRASTRUCTURE_WEIGHT,
  INSTITUTION_LAW_WEIGHT,
  INSTITUTION_LITERACY_WEIGHT,
  INSTITUTION_STAFFING_WEIGHT,
  MAX_LABOR_HOURS_PER_WEEK,
  MAX_LABOR_MINIMUM_WAGE_RUSD_PER_YEAR,
  MAX_LAW_ENACTMENT_DAYS,
  MAX_LAW_OPTIONS_PER_SLOT,
  MAX_LAW_SUMMARY_LENGTH,
  MAX_LAW_TRANSITIONS_PER_COUNTRY,
  MAX_POLITICS_LOG_ENTRIES,
  MAX_SCRIPTED_EVENT_EFFECTS,
  MAX_SCRIPTED_EVENTS,
  MIN_LAW_ENACTMENT_DAYS,
  POLITICS_RATE_DECIMALS,
  STRIKE_OUTPUT_FACTOR,
  STRIKE_UNREST_THRESHOLD,
  SUFFRAGE_MIN_AGE,
  TAX_COLLECTION_BASE_EFFICIENCY,
  TAX_COLLECTION_MIN_EFFICIENCY,
  TAX_COLLECTION_OVERLOAD_PENALTY,
  TAX_COLLECTION_QUALITY_WEIGHT,
  UNREST_DAILY_SMOOTHING,
  UNREST_GRIEVANCE_WEIGHT,
  UNREST_CROWDING_WEIGHT,
  UNREST_INSTITUTION_RELIEF,
  UNREST_MILITANCY_WEIGHT,
  UNREST_OVERLOAD_WEIGHT,
  UNREST_UNEMPLOYMENT_WEIGHT,
  UNREST_UNMET_WEIGHT,
} from "./constants.js";
import { provinceCrowding } from "../population/housing.js";
import type {
  Country,
  CountryPoliticsInput,
  CrisisStage,
  ElectionResult,
  EconomyDefinitions,
  InterestGroupDef,
  InterestGroupKey,
  InterestGroupState,
  InstitutionState,
  LawDef,
  LawSlot,
  LawTransition,
  PoliticsDefinitions,
  PoliticsLogEntry,
  PoliticsState,
  RegimeDef,
  RegimeKind,
  RegimeState,
  ScriptedEventDef,
  SuffrageKind,
} from "./types.js";
import {
  CRISIS_STAGES,
  IMPLEMENTED_LAW_SLOTS,
  INTEREST_GROUP_KEYS,
  LAW_SLOTS,
  REGIME_KINDS,
  SUFFRAGE_KINDS,
} from "./types.js";
import { countryProvinceIds } from "./country.js";

const DEFAULT_INFRASTRUCTURE = 0.5;
const DEFAULT_ADULT_AGE = SUFFRAGE_MIN_AGE;

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, minimum: number, maximum: number): number {
  if (value < minimum) return minimum;
  if (value > maximum) return maximum;
  return value;
}

function toleranceFor(value: number): number {
  return Math.max(1, Math.abs(value)) * 1e-9;
}

/** True for the first civil day of a month. */
export function isFirstDayOfMonth(dayIndex: Day): boolean {
  return dayIndexToCivilDate(dayIndex).day === 1;
}

/** Add whole civil years to a day index, clamped to the terminal boundary. */
export function addCivilYears(dayIndex: Day, years: number): Day {
  const date = dayIndexToCivilDate(dayIndex);
  const targetYear = Math.min(1999, date.year + years);
  if (targetYear <= date.year) {
    return dayIndex;
  }
  const clampedDay = Math.min(date.day, daysInMonth(targetYear, date.month));
  let target = civilDateToDayIndex(targetYear, date.month, clampedDay);
  if (target > 36_523) target = 36_523;
  return target;
}

/** Structural validation for the M8 politics definitions block. */
export function assertValidPoliticsDefinitions(
  value: unknown,
  path = "economyDefinitions.politics",
): asserts value is PoliticsDefinitions {
  const record = requireRecord(value, path);
  requireString(record.dataVersion, `${path}.dataVersion`, { minLength: 1 });
  const regimes = requireArray(record.regimes, `${path}.regimes`);
  if (regimes.length === 0) throw new RangeError(`${path}.regimes must not be empty`);
  const regimeByKind = new Map<RegimeKind, RegimeDef>();
  for (let index = 0; index < regimes.length; index += 1) {
    const regimePath = `${path}.regimes[${String(index)}]`;
    const regime = requireRecord(regimes[index], regimePath);
    const kind = requireString(regime.kind, `${regimePath}.kind`, { minLength: 1 });
    if (!(REGIME_KINDS as readonly string[]).includes(kind)) {
      throw new RangeError(`${regimePath}.kind must be a registered regime kind`);
    }
    if (regimeByKind.has(kind as RegimeKind)) {
      throw new RangeError(`duplicate regime definition ${JSON.stringify(kind)}`);
    }
    requireString(regime.name, `${regimePath}.name`, { minLength: 1 });
    if (typeof regime.electionsEnabled !== "boolean") {
      throw new TypeError(`${regimePath}.electionsEnabled must be a boolean`);
    }
    const term = requireFiniteNumber(regime.electionTermYears, `${regimePath}.electionTermYears`);
    if (term < 1 || term > 12 || !Number.isInteger(term)) {
      throw new RangeError(`${regimePath}.electionTermYears must be an integer in 1..12`);
    }
    const defaults = requireRecord(regime.defaultLaws, `${regimePath}.defaultLaws`);
    const defaultLaws = {} as Record<LawSlot, Id>;
    for (const slot of LAW_SLOTS) {
      defaultLaws[slot] = requireInteger(
        defaults[slot],
        `${regimePath}.defaultLaws.${slot}`,
        0,
        0xffff_ffff,
      );
    }
    regimeByKind.set(kind as RegimeKind, {
      kind: kind as RegimeKind,
      name: requireString(regime.name, `${regimePath}.name`, { minLength: 1 }),
      electionsEnabled: regime.electionsEnabled,
      electionTermYears: term,
      defaultLaws,
    });
  }
  for (const kind of REGIME_KINDS) {
    if (!regimeByKind.has(kind)) {
      throw new RangeError(`${path}.regimes is missing ${JSON.stringify(kind)}`);
    }
  }

  const groups = requireArray(record.interestGroups, `${path}.interestGroups`);
  const groupKeys = new Set<string>();
  const interestGroups: InterestGroupDef[] = [];
  for (let index = 0; index < groups.length; index += 1) {
    const groupPath = `${path}.interestGroups[${String(index)}]`;
    const group = requireRecord(groups[index], groupPath);
    const key = requireString(group.key, `${groupPath}.key`, { minLength: 1 });
    if (!(INTEREST_GROUP_KEYS as readonly string[]).includes(key)) {
      throw new RangeError(`${groupPath}.key must be a registered interest group`);
    }
    if (groupKeys.has(key)) throw new RangeError(`duplicate interest group ${JSON.stringify(key)}`);
    groupKeys.add(key);
    const weights = requireRecord(
      group.membershipByProfessionKey,
      `${groupPath}.membershipByProfessionKey`,
    );
    const membershipByProfessionKey: Record<string, number> = {};
    for (const [professionKey, rawWeight] of Object.entries(weights)) {
      const weight = requireFiniteNumber(
        rawWeight,
        `${groupPath}.membershipByProfessionKey.${professionKey}`,
      );
      if (weight < 0 || weight > 1) {
        throw new RangeError(
          `${groupPath}.membershipByProfessionKey.${professionKey} must be in 0..1`,
        );
      }
      if (weight > 0) membershipByProfessionKey[professionKey] = weight;
    }
    const organizationBase = requireFiniteNumber(
      group.organizationBase,
      `${groupPath}.organizationBase`,
    );
    if (organizationBase < 0 || organizationBase > 1) {
      throw new RangeError(`${groupPath}.organizationBase must be in 0..1`);
    }
    interestGroups.push({
      key: key as InterestGroupKey,
      name: requireString(group.name, `${groupPath}.name`, { minLength: 1 }),
      membershipByProfessionKey,
      organizationBase,
    });
  }
  for (const key of INTEREST_GROUP_KEYS) {
    if (!groupKeys.has(key)) {
      throw new RangeError(`${path}.interestGroups is missing ${JSON.stringify(key)}`);
    }
  }

  const laws = requireArray(record.laws, `${path}.laws`);
  const lawIds = new Set<Id>();
  const lawKeys = new Set<string>();
  const lawsBySlot = new Map<LawSlot, LawDef[]>();
  for (let index = 0; index < laws.length; index += 1) {
    const lawPath = `${path}.laws[${String(index)}]`;
    const law = requireRecord(laws[index], lawPath);
    const id = requireInteger(law.id, `${lawPath}.id`, 1, 0xffff_ffff);
    if (lawIds.has(id)) throw new RangeError(`duplicate law id ${String(id)}`);
    lawIds.add(id);
    const slot = requireString(law.slot, `${lawPath}.slot`, { minLength: 1 });
    if (!(LAW_SLOTS as readonly string[]).includes(slot)) {
      throw new RangeError(`${lawPath}.slot must be a registered law slot`);
    }
    const key = requireString(law.key, `${lawPath}.key`, { minLength: 1 });
    if (lawKeys.has(key)) throw new RangeError(`duplicate law key ${JSON.stringify(key)}`);
    lawKeys.add(key);
    const prerequisites = requireArray(law.prerequisites, `${lawPath}.prerequisites`).map(
      (entry, prerequisiteIndex) =>
        requireInteger(
          entry,
          `${lawPath}.prerequisites[${String(prerequisiteIndex)}]`,
          1,
          0xffff_ffff,
        ),
    );
    const eligibleRegimesRaw = requireArray(
      law.eligibleRegimes,
      `${lawPath}.eligibleRegimes`,
    );
    if (eligibleRegimesRaw.length === 0) {
      throw new RangeError(`${lawPath}.eligibleRegimes must not be empty`);
    }
    const eligibleRegimes: RegimeKind[] = [];
    for (const rawRegime of eligibleRegimesRaw) {
      const regimeKind = requireString(rawRegime, `${lawPath}.eligibleRegimes[]`, {
        minLength: 1,
      });
      if (!(REGIME_KINDS as readonly string[]).includes(regimeKind)) {
        throw new RangeError(`${lawPath}.eligibleRegimes contains an unknown regime`);
      }
      eligibleRegimes.push(regimeKind as RegimeKind);
    }
    const enactmentDays = requireInteger(
      law.enactmentDays,
      `${lawPath}.enactmentDays`,
      MIN_LAW_ENACTMENT_DAYS,
      MAX_LAW_ENACTMENT_DAYS,
    );
    const boundsRaw = requireArray(law.taxRateBounds, `${lawPath}.taxRateBounds`);
    const taxRateBounds = boundsRaw.map((raw, boundIndex) => {
      const boundPath = `${lawPath}.taxRateBounds[${String(boundIndex)}]`;
      const bound = requireRecord(raw, boundPath);
      const taxType = requireString(bound.taxType, `${boundPath}.taxType`, { minLength: 1 });
      if (taxType !== "incomeTax" && taxType !== "businessProfitTax") {
        throw new RangeError(`${boundPath}.taxType must be incomeTax or businessProfitTax`);
      }
      const min = requireFiniteNumber(bound.min, `${boundPath}.min`);
      const max = requireFiniteNumber(bound.max, `${boundPath}.max`);
      if (min < 0 || max > 1 || min > max) {
        throw new RangeError(`${boundPath} must satisfy 0 <= min <= max <= 1`);
      }
      return { taxType, min, max } as const;
    });
    let suffrage: LawDef["suffrage"] = null;
    if (slot === "suffrage") {
      const suffrageRecord = requireRecord(law.suffrage, `${lawPath}.suffrage`);
      const kind = requireString(suffrageRecord.kind, `${lawPath}.suffrage.kind`, {
        minLength: 1,
      });
      if (!(SUFFRAGE_KINDS as readonly string[]).includes(kind)) {
        throw new RangeError(`${lawPath}.suffrage.kind must be a registered suffrage kind`);
      }
      const propertyWealthLevel = requireInteger(
        suffrageRecord.propertyWealthLevel,
        `${lawPath}.suffrage.propertyWealthLevel`,
        0,
        99,
      );
      const minAge = requireInteger(
        suffrageRecord.minAge,
        `${lawPath}.suffrage.minAge`,
        16,
        99,
      );
      suffrage = {
        kind: kind as SuffrageKind,
        propertyWealthLevel,
        minAge,
      };
    }
    let borderPolicy: LawDef["borderPolicy"] = null;
    if (slot === "trade") {
      const policy = requireString(law.borderPolicy, `${lawPath}.borderPolicy`, {
        minLength: 1,
      });
      if (policy !== "open" && policy !== "closed") {
        throw new RangeError(`${lawPath}.borderPolicy must be open or closed`);
      }
      borderPolicy = policy;
    }
    const laborOrganizationBonus = requireFiniteNumber(
      law.laborOrganizationBonus,
      `${lawPath}.laborOrganizationBonus`,
    );
    if (laborOrganizationBonus < -1 || laborOrganizationBonus > 1) {
      throw new RangeError(`${lawPath}.laborOrganizationBonus must be in -1..1`);
    }
    const laborGrievance = requireFiniteNumber(
      law.laborGrievance,
      `${lawPath}.laborGrievance`,
    );
    if (laborGrievance < 0 || laborGrievance > 1) {
      throw new RangeError(`${lawPath}.laborGrievance must be in 0..1`);
    }
    const educationAttendanceFloor =
      law.educationAttendanceFloor === undefined
        ? 0
        : requireFiniteNumber(
            law.educationAttendanceFloor,
            `${lawPath}.educationAttendanceFloor`,
          );
    if (educationAttendanceFloor < 0 || educationAttendanceFloor > 1) {
      throw new RangeError(`${lawPath}.educationAttendanceFloor must be in 0..1`);
    }
    const educationQualityBonus =
      law.educationQualityBonus === undefined
        ? 0
        : requireFiniteNumber(law.educationQualityBonus, `${lawPath}.educationQualityBonus`);
    if (educationQualityBonus < 0 || educationQualityBonus > 1) {
      throw new RangeError(`${lawPath}.educationQualityBonus must be in 0..1`);
    }
    const requiredTechnologyIdsRaw =
      law.requiredTechnologyIds === undefined
        ? []
        : requireArray(law.requiredTechnologyIds, `${lawPath}.requiredTechnologyIds`);
    const requiredTechnologyIds = requiredTechnologyIdsRaw.map((entry, technologyIndex) =>
      requireInteger(
        entry,
        `${lawPath}.requiredTechnologyIds[${String(technologyIndex)}]`,
        0,
        0xffff_ffff,
      ),
    );
    if (new Set(requiredTechnologyIds).size !== requiredTechnologyIds.length) {
      throw new RangeError(`${lawPath}.requiredTechnologyIds contains duplicates`);
    }
    const laborMinimumWageRUSDPerYear =
      law.laborMinimumWageRUSDPerYear === undefined
        ? 0
        : requireFiniteNumber(
            law.laborMinimumWageRUSDPerYear,
            `${lawPath}.laborMinimumWageRUSDPerYear`,
          );
    if (
      laborMinimumWageRUSDPerYear < 0 ||
      laborMinimumWageRUSDPerYear > MAX_LABOR_MINIMUM_WAGE_RUSD_PER_YEAR
    ) {
      throw new RangeError(`${lawPath}.laborMinimumWageRUSDPerYear is out of range`);
    }
    // P7 (plan §4.5): optional minimum-wage coverage of farm employees and domestic service.
    let laborMinimumWageCoverage: { farmEmployees: boolean; domesticService: boolean } | undefined;
    if (law.laborMinimumWageCoverage !== undefined) {
      const coverage = requireRecord(law.laborMinimumWageCoverage, `${lawPath}.laborMinimumWageCoverage`);
      for (const field of ["farmEmployees", "domesticService"] as const) {
        if (typeof coverage[field] !== "boolean") {
          throw new TypeError(`${lawPath}.laborMinimumWageCoverage.${field} must be a boolean`);
        }
      }
      laborMinimumWageCoverage = { farmEmployees: coverage.farmEmployees === true, domesticService: coverage.domesticService === true };
    }
    const laborHoursPerWeek =
      law.laborHoursPerWeek === undefined
        ? 0
        : requireFiniteNumber(law.laborHoursPerWeek, `${lawPath}.laborHoursPerWeek`);
    if (
      laborHoursPerWeek < 0 ||
      laborHoursPerWeek > MAX_LABOR_HOURS_PER_WEEK
    ) {
      throw new RangeError(`${lawPath}.laborHoursPerWeek is out of range`);
    }
    const healthStaffFloor =
      law.healthStaffFloor === undefined
        ? 0
        : requireFiniteNumber(law.healthStaffFloor, `${lawPath}.healthStaffFloor`);
    if (healthStaffFloor < 0 || healthStaffFloor > 1) {
      throw new RangeError(`${lawPath}.healthStaffFloor must be in 0..1`);
    }
    const currencyRegime =
      law.currencyRegime === undefined || law.currencyRegime === null
        ? null
        : law.currencyRegime;
    if (
      currencyRegime !== null &&
      currencyRegime !== "pegged" &&
      currencyRegime !== "managed"
    ) {
      throw new RangeError(`${lawPath}.currencyRegime must be "pegged", "managed", or null`);
    }
    if (currencyRegime !== null && slot !== "currency") {
      throw new RangeError(`${lawPath}.currencyRegime is only valid in the currency slot`);
    }
    const institutionLoad = requireFiniteNumber(
      law.institutionLoad,
      `${lawPath}.institutionLoad`,
    );
    if (institutionLoad < 0 || institutionLoad > 1) {
      throw new RangeError(`${lawPath}.institutionLoad must be in 0..1`);
    }
    const stanceRecord = requireRecord(law.groupStance, `${lawPath}.groupStance`);
    const groupStance = {} as Record<InterestGroupKey, number>;
    for (const groupKey of INTEREST_GROUP_KEYS) {
      const stance = requireFiniteNumber(
        stanceRecord[groupKey],
        `${lawPath}.groupStance.${groupKey}`,
      );
      if (stance < -1 || stance > 1) {
        throw new RangeError(`${lawPath}.groupStance.${groupKey} must be in -1..1`);
      }
      groupStance[groupKey] = stance;
    }
    const definition: LawDef = {
      id,
      slot: slot as LawSlot,
      key,
      name: requireString(law.name, `${lawPath}.name`, { minLength: 1 }),
      description: requireString(law.description, `${lawPath}.description`, {
        minLength: 1,
        maxLength: MAX_LAW_SUMMARY_LENGTH,
      }),
      prerequisites,
      eligibleRegimes,
      enactmentDays,
      taxRateBounds,
      suffrage,
      borderPolicy,
      laborOrganizationBonus,
      laborGrievance,
      educationAttendanceFloor,
      educationQualityBonus,
      requiredTechnologyIds,
      laborMinimumWageRUSDPerYear,
      ...(laborMinimumWageCoverage === undefined ? {} : { laborMinimumWageCoverage }),
      laborHoursPerWeek,
      healthStaffFloor,
      currencyRegime,
      institutionLoad,
      groupStance,
    };
    const slotLaws = lawsBySlot.get(definition.slot) ?? [];
    slotLaws.push(definition);
    lawsBySlot.set(definition.slot, slotLaws);
  }
  for (const [slot, slotLaws] of lawsBySlot) {
    if (slotLaws.length > MAX_LAW_OPTIONS_PER_SLOT) {
      throw new RangeError(
        `${path}.laws has more than ${String(MAX_LAW_OPTIONS_PER_SLOT)} options for ${slot}`,
      );
    }
    const base = slotLaws.filter((law) => law.prerequisites.length === 0);
    if (base.length === 0) {
      throw new RangeError(`${path}.laws slot ${slot} has no base law`);
    }
  }
  for (const law of lawsBySlot.values()) {
    for (const definition of law) {
      for (const prerequisite of definition.prerequisites) {
        if (!lawIds.has(prerequisite)) {
          throw new RangeError(
            `${path}.laws ${definition.key} references unknown prerequisite ${String(prerequisite)}`,
          );
        }
        if (prerequisite === definition.id) {
          throw new RangeError(`${path}.laws ${definition.key} requires itself`);
        }
      }
    }
  }
  // Normalise the validated law records back onto the definitions object so
  // optional M9 fields (technology prerequisites, education policy) are present
  // as the asserted `LawDef` contract requires, rather than leaving the raw input
  // shape behind.
  record.laws = [...lawsBySlot.values()].flat().sort((left, right) => left.id - right.id);
  for (const regime of regimeByKind.values()) {
    for (const slot of LAW_SLOTS) {
      const lawId = regime.defaultLaws[slot];
      if (lawId === 0) continue;
      if (!lawIds.has(lawId)) {
        throw new RangeError(
          `${path}.regimes ${regime.kind} default law ${String(lawId)} is not defined`,
        );
      }
    }
  }

  const eventsRaw = requireArray(record.events, `${path}.events`);
  const eventIds = new Set<Id>();
  const eventKeys = new Set<string>();
  const events: ScriptedEventDef[] = [];
  for (let index = 0; index < eventsRaw.length; index += 1) {
    const eventPath = `${path}.events[${String(index)}]`;
    const event = requireRecord(eventsRaw[index], eventPath);
    const id = requireInteger(event.id, `${eventPath}.id`, 1, 0xffff_ffff);
    if (eventIds.has(id)) throw new RangeError(`duplicate event id ${String(id)}`);
    eventIds.add(id);
    const key = requireString(event.key, `${eventPath}.key`, { minLength: 1 });
    if (eventKeys.has(key)) throw new RangeError(`duplicate event key ${JSON.stringify(key)}`);
    eventKeys.add(key);
    const trigger = requireRecord(event.trigger, `${eventPath}.trigger`);
    const year = requireInteger(trigger.year, `${eventPath}.trigger.year`, 1900, 1999);
    const month = requireInteger(trigger.month, `${eventPath}.trigger.month`, 1, 12);
    const day = requireInteger(trigger.day, `${eventPath}.trigger.day`, 1, 31);
    civilDateToDayIndex(year, month as Month, day);
    const effectsRaw = requireArray(event.effects, `${eventPath}.effects`);
    if (effectsRaw.length === 0 || effectsRaw.length > MAX_SCRIPTED_EVENT_EFFECTS) {
      throw new RangeError(
        `${eventPath}.effects must contain 1..${String(MAX_SCRIPTED_EVENT_EFFECTS)} entries`,
      );
    }
    const effects = effectsRaw.map((raw, effectIndex) => {
      const effectPath = `${eventPath}.effects[${String(effectIndex)}]`;
      const effect = requireRecord(raw, effectPath);
      const kind = requireString(effect.kind, `${effectPath}.kind`, { minLength: 1 });
      if (kind === "militancy-pressure" || kind === "unrest-pressure") {
        const amount = requireFiniteNumber(effect.amount, `${effectPath}.amount`);
        if (amount < 0 || amount > 1) {
          throw new RangeError(`${effectPath}.amount must be in 0..1`);
        }
        return { kind, amount } as const;
      }
      if (kind === "institution-disruption") {
        return {
          kind,
          days: requireInteger(effect.days, `${effectPath}.days`, 1, 10 * 365),
          qualityPenalty: (() => {
            const penalty = requireFiniteNumber(
              effect.qualityPenalty,
              `${effectPath}.qualityPenalty`,
            );
            if (penalty < 0 || penalty > 1) {
              throw new RangeError(`${effectPath}.qualityPenalty must be in 0..1`);
            }
            return penalty;
          })(),
        } as const;
      }
      throw new RangeError(`${effectPath}.kind is not supported`);
    });
    const countryTagRaw = event.countryTag;
    const countryTag =
      countryTagRaw === null
        ? null
        : requireString(countryTagRaw, `${eventPath}.countryTag`, { minLength: 1 });
    events.push({
      id,
      key,
      name: requireString(event.name, `${eventPath}.name`, { minLength: 1 }),
      description: requireString(event.description, `${eventPath}.description`, {
        minLength: 1,
        maxLength: MAX_LAW_SUMMARY_LENGTH,
      }),
      countryTag,
      trigger: { year, month, day },
      effects,
      provenance: requireString(event.provenance, `${eventPath}.provenance`, {
        minLength: 1,
        maxLength: MAX_LAW_SUMMARY_LENGTH,
      }),
    });
  }

  const adminKeys = requireArray(
    record.administrationProfessionKeys,
    `${path}.administrationProfessionKeys`,
  );
  if (adminKeys.length === 0) {
    throw new RangeError(`${path}.administrationProfessionKeys must not be empty`);
  }
  const administrationProfessionKeys = adminKeys.map((entry, index) =>
    requireString(entry, `${path}.administrationProfessionKeys[${String(index)}]`, {
      minLength: 1,
    }),
  );
  if (administrationProfessionKeys.length === 0) {
    throw new RangeError(`${path}.administrationProfessionKeys must not be empty`);
  }
}

/**
 * Neutral political state for legacy fixtures with no politics definitions.
 * It is inert: no elections, no laws, quality 1, overload 0.
 */
export function neutralRegimeState(day: Day): RegimeState {
  return {
    kind: "absolute-monarchy",
    sinceDay: day,
    governmentGroupKey: "aristocrats",
    nextElectionDay: null,
    lastElectionDay: null,
    lastElection: null,
    crisis: { stage: "none", sinceDay: day, pressureDays: 0, lastRevolutionDay: null },
  };
}

export function neutralLaws(): Record<LawSlot, Id> {
  const laws = {} as Record<LawSlot, Id>;
  for (const slot of LAW_SLOTS) laws[slot] = 0;
  return laws;
}

export function neutralInstitutionState(): InstitutionState {
  return {
    fundedAnnualRUSD: 0,
    staffedByProfession: {},
    serviceOutputIndex: 1,
    quality: 1,
    overload: 0,
    disruptionUntilDay: null,
    lastUpdateDay: null,
    fundingRequestedMonthToDateRUSD: 0,
    fundingShortfallMonthToDateRUSD: 0,
    healthStaffShare: 0,
  };
}

export function neutralInterestGroups(): InterestGroupState[] {
  return INTEREST_GROUP_KEYS.map((key, index) => ({
    id: index,
    key,
    membershipPopulation: 0,
    organization: 0,
    influence: 0,
    stanceByLaw: {},
  }));
}

export function createWorldPoliticsState(
  day: Day,
  definitions: PoliticsDefinitions | undefined,
  countries: readonly Country[],
): PoliticsState {
  const state: PoliticsState = {
    enabled: definitions !== undefined && countries.length > 0,
    eventQueue: [],
    eventLog: [],
    nextEventId: 1,
    nextLogId: 1,
  };
  if (definitions === undefined || countries.length === 0) return state;
  const start = day;
  for (const event of definitions.events) {
    const dueDate = event.trigger;
    const dueDay = civilDateToDayIndex(dueDate.year, dueDate.month as Month, dueDate.day);
    if (dueDay < start) continue;
    const targets =
      event.countryTag === null
        ? [...countries].sort((left, right) => left.id - right.id)
        : countries.filter((country) => country.tag === event.countryTag);
    for (const country of targets) {
      if (state.eventQueue.length >= MAX_SCRIPTED_EVENTS) {
        throw new RangeError(`scripted event queue exceeds ${String(MAX_SCRIPTED_EVENTS)} entries`);
      }
      state.eventQueue.push({
        id: state.nextEventId,
        definitionId: event.id,
        key: event.key,
        countryId: country.id,
        dueDay,
        appliedDay: null,
        status: "scheduled",
        provenance: event.provenance,
      });
      state.nextEventId += 1;
    }
  }
  state.eventQueue.sort((left, right) =>
    left.dueDay !== right.dueDay
      ? left.dueDay - right.dueDay
      : left.id - right.id,
  );
  return state;
}

/** Resolve a regime definition by kind. */
export function regimeDefinition(
  definitions: PoliticsDefinitions,
  kind: RegimeKind,
): RegimeDef {
  const regime = definitions.regimes.find((entry) => entry.kind === kind);
  if (regime === undefined) {
    throw new RangeError(`missing regime definition ${JSON.stringify(kind)}`);
  }
  return regime;
}

/** Resolve a law definition by id, or null for id 0. */
export function lawDefinition(
  definitions: PoliticsDefinitions,
  lawId: Id,
): LawDef | null {
  if (lawId === 0) return null;
  const law = definitions.laws.find((entry) => entry.id === lawId);
  if (law === undefined) throw new RangeError(`unknown law ${String(lawId)}`);
  return law;
}

/** Resolve a law definition by stable key. */
export function lawByKey(
  definitions: PoliticsDefinitions,
  key: string,
): LawDef {
  const law = definitions.laws.find((entry) => entry.key === key);
  if (law === undefined) throw new RangeError(`unknown law key ${JSON.stringify(key)}`);
  return law;
}

/** Validate a scenario country politics input without constructing a world. */
export function assertValidCountryPoliticsInput(
  value: unknown,
  definitions: PoliticsDefinitions | undefined,
  path: string,
): void {
  if (value === undefined || value === null) return;
  const input = requireRecord(value, path);
  if (definitions === undefined) {
    throw new RangeError(`${path} requires an economy politics definitions block`);
  }
  const kind = requireString(input.regimeKind, `${path}.regimeKind`, { minLength: 1 });
  if (!(REGIME_KINDS as readonly string[]).includes(kind)) {
    throw new RangeError(`${path}.regimeKind is not a registered regime kind`);
  }
  if (input.governmentGroupKey !== undefined) {
    const group = requireString(input.governmentGroupKey, `${path}.governmentGroupKey`, {
      minLength: 1,
    });
    if (!(INTEREST_GROUP_KEYS as readonly string[]).includes(group)) {
      throw new RangeError(`${path}.governmentGroupKey is not a registered group`);
    }
  }
  if (input.laws !== undefined) {
    const laws = requireRecord(input.laws, `${path}.laws`);
    for (const [slot, lawKey] of Object.entries(laws)) {
      if (!(LAW_SLOTS as readonly string[]).includes(slot)) {
        throw new RangeError(`${path}.laws has unknown slot ${JSON.stringify(slot)}`);
      }
      const key = requireString(lawKey, `${path}.laws.${slot}`, { minLength: 1 });
      const law = lawByKey(definitions, key);
      if (law.slot !== slot) {
        throw new RangeError(`${path}.laws.${slot} names a ${law.slot} law`);
      }
    }
  }
  if (input.institutionFundingRUSDPerYear !== undefined) {
    const funding = requireFiniteNumber(
      input.institutionFundingRUSDPerYear,
      `${path}.institutionFundingRUSDPerYear`,
    );
    if (funding < 0) {
      throw new RangeError(`${path}.institutionFundingRUSDPerYear must be non-negative`);
    }
  }
}

/** Create one country's initial M8 state from scenario input and definitions. */
export function createCountryPoliticsState(
  country: Country,
  input: CountryPoliticsInput | undefined,
  definitions: PoliticsDefinitions | undefined,
  day: Day,
): {
  regime: RegimeState;
  laws: Record<LawSlot, Id>;
  lawTransitions: LawTransition[];
  interestGroups: InterestGroupState[];
  institutions: InstitutionState;
} {
  const interestGroups = neutralInterestGroups();
  if (definitions === undefined) {
    return {
      regime: neutralRegimeState(day),
      laws: neutralLaws(),
      lawTransitions: [],
      interestGroups,
      institutions: neutralInstitutionState(),
    };
  }
  const kind = input?.regimeKind ?? "absolute-monarchy";
  if (!(REGIME_KINDS as readonly string[]).includes(kind)) {
    throw new RangeError(`country ${String(country.id)} has an unknown regime kind`);
  }
  const regimeDef = regimeDefinition(definitions, kind);
  const laws = { ...regimeDef.defaultLaws };
  if (input?.laws !== undefined) {
    for (const [slotKey, lawKey] of Object.entries(input.laws)) {
      if (!(LAW_SLOTS as readonly string[]).includes(slotKey)) {
        throw new RangeError(`country ${String(country.id)} has an unknown law slot ${slotKey}`);
      }
      if (lawKey === undefined) continue;
      const law = lawByKey(definitions, lawKey);
      if (law.slot !== slotKey) {
        throw new RangeError(
          `country ${String(country.id)} law ${lawKey} belongs to ${law.slot}, not ${slotKey}`,
        );
      }
      laws[law.slot] = law.id;
    }
  }
  const funding = input?.institutionFundingRUSDPerYear ?? 0;
  if (!Number.isFinite(funding) || funding < 0) {
    throw new RangeError(
      `country ${String(country.id)} institution funding must be finite and non-negative`,
    );
  }
  const governmentGroupKey = input?.governmentGroupKey ?? defaultGovernmentGroup(kind);
  if (!(INTEREST_GROUP_KEYS as readonly string[]).includes(governmentGroupKey)) {
    throw new RangeError(`country ${String(country.id)} has an unknown government group`);
  }
  const nextElectionDay = regimeDef.electionsEnabled
    ? addCivilYears(day, regimeDef.electionTermYears)
    : null;
  return {
    regime: {
      kind,
      sinceDay: day,
      governmentGroupKey,
      nextElectionDay,
      lastElectionDay: null,
      lastElection: null,
      crisis: { stage: "none", sinceDay: day, pressureDays: 0, lastRevolutionDay: null },
    },
    laws,
    lawTransitions: [],
    interestGroups,
    institutions: {
      ...neutralInstitutionState(),
      fundedAnnualRUSD: funding,
      lastUpdateDay: day,
    },
  };
}

function defaultGovernmentGroup(kind: RegimeKind): InterestGroupKey {
  if (kind === "republic") return "capitalists";
  if (kind === "constitutional-monarchy") return "aristocrats";
  return "aristocrats";
}

export interface InterestGroupRefreshResult {
  readonly countryId: Id;
  readonly groups: readonly InterestGroupState[];
  readonly franchiseShare: Rate;
  readonly eligiblePopulation: number;
}

function professionKeyById(definitions: EconomyDefinitions): Map<Id, string> {
  const map = new Map<Id, string>();
  for (const profession of definitions.professions) map.set(profession.id, profession.key);
  return map;
}

function countryBlocks(
  world: World,
  country: Country,
  lookups?: PoliticsLookups,
): readonly World["popBlocks"][number][] {
  if (lookups !== undefined) return lookups.blocksByCountry.get(country.id) ?? [];
  const provinceIds = new Set(countryProvinceIds(world, country.id));
  return [...world.popBlocks]
    .filter((block) => provinceIds.has(block.provinceId))
    .sort((left, right) => left.id - right.id);
}

/**
 * D-137: per-phase political lookups, built once instead of once per country and
 * use. Derived from the world when built; the politics phases change militancy,
 * unrest, laws and regimes, never which blocks or provinces a country has.
 *
 * - `blocksByCountry`: `countryBlocks` of every country (ascending block id).
 * - `blocksByProvince`: each province's blocks, ascending id; for a province of the
 *   country this equals the country's blocks filtered to that province.
 * - `provinceIdsByCountry`: `countryProvinceIds` of every country.
 * - `provinceById`: the first province economy with each id, as `find` returns it.
 */
export interface PoliticsLookups {
  readonly blocksByCountry: ReadonlyMap<Id, readonly World["popBlocks"][number][]>;
  readonly blocksByProvince: ReadonlyMap<Id, readonly World["popBlocks"][number][]>;
  readonly provinceIdsByCountry: ReadonlyMap<Id, readonly Id[]>;
  readonly provinceById: ReadonlyMap<Id, World["provinceEconomies"][number]>;
}

export function buildPoliticsLookups(world: World): PoliticsLookups {
  const sorted = inIdOrder(world.popBlocks);
  const provinceIdsByCountry = new Map<Id, Id[]>();
  const ownersByProvince = new Map<Id, Id[]>();
  if (world.provinces.enabled) {
    for (const record of world.provinces.ownership) {
      const list = provinceIdsByCountry.get(record.ownerPolityId);
      if (list === undefined) provinceIdsByCountry.set(record.ownerPolityId, [record.provinceId]);
      else list.push(record.provinceId);
      const owners = ownersByProvince.get(record.provinceId);
      if (owners === undefined) ownersByProvince.set(record.provinceId, [record.ownerPolityId]);
      else if (!owners.includes(record.ownerPolityId)) owners.push(record.ownerPolityId);
    }
  }
  const blocksByCountry = new Map<Id, World["popBlocks"][number][]>();
  const blocksByProvince = new Map<Id, World["popBlocks"][number][]>();
  for (const block of sorted) {
    const inProvince = blocksByProvince.get(block.provinceId);
    if (inProvince === undefined) blocksByProvince.set(block.provinceId, [block]);
    else inProvince.push(block);
    for (const ownerId of ownersByProvince.get(block.provinceId) ?? []) {
      const list = blocksByCountry.get(ownerId);
      if (list === undefined) blocksByCountry.set(ownerId, [block]);
      else list.push(block);
    }
  }
  const provinceById = new Map<Id, World["provinceEconomies"][number]>();
  for (const province of world.provinceEconomies) {
    if (!provinceById.has(province.id)) provinceById.set(province.id, province);
  }
  return { blocksByCountry, blocksByProvince, provinceIdsByCountry, provinceById };
}

function ageFraction(block: { maleByAge: Uint32Array; femaleByAge: Uint32Array }, minAge: number): number {
  let total = 0;
  let eligible = 0;
  for (let age = 0; age < 81; age += 1) {
    const count = (block.maleByAge[age] ?? 0) + (block.femaleByAge[age] ?? 0);
    total += count;
    if (age >= minAge) eligible += count;
  }
  return total > 0 ? eligible / total : 0;
}

function maleAdultFraction(
  block: { maleByAge: Uint32Array; femaleByAge: Uint32Array },
  minAge: number,
): number {
  let total = 0;
  let eligible = 0;
  for (let age = 0; age < 81; age += 1) {
    const male = block.maleByAge[age] ?? 0;
    const female = block.femaleByAge[age] ?? 0;
    total += male + female;
    if (age >= minAge) eligible += male;
  }
  return total > 0 ? eligible / total : 0;
}

function suffrageRuleForCountry(
  country: Country,
  definitions: PoliticsDefinitions,
): NonNullable<LawDef["suffrage"]> {
  const law = lawDefinition(definitions, country.laws.suffrage);
  if (law === null || law.suffrage === null) {
    return { kind: "none", propertyWealthLevel: 99, minAge: DEFAULT_ADULT_AGE };
  }
  return law.suffrage;
}

function blockEnfranchisement(
  block: { maleByAge: Uint32Array; femaleByAge: Uint32Array; wealthLevel: number },
  rule: NonNullable<LawDef["suffrage"]>,
): number {
  if (rule.kind === "none") return 0;
  if (rule.kind === "property") {
    return block.wealthLevel >= rule.propertyWealthLevel ? ageFraction(block, rule.minAge) : 0;
  }
  if (rule.kind === "male") return maleAdultFraction(block, rule.minAge);
  return ageFraction(block, rule.minAge);
}

/** Current franchise share and eligible population for one country. */
export function countryFranchise(
  world: World,
  country: Country,
  definitions: PoliticsDefinitions,
  lookups?: PoliticsLookups,
): { share: Rate; eligiblePopulation: number } {
  const rule = suffrageRuleForCountry(country, definitions);
  let population = 0;
  let eligible = 0;
  for (const block of countryBlocks(world, country, lookups)) {
    const count = populationTotal(block);
    population += count;
    eligible += count * blockEnfranchisement(block, rule);
  }
  return {
    share: population > 0 ? roundTo(eligible / population, POLITICS_RATE_DECIMALS) : 0,
    eligiblePopulation: Math.round(eligible),
  };
}

/** Recompute one country's seven interest groups from authoritative state. */
export function refreshInterestGroups(
  world: World,
  country: Country,
  definitions: EconomyDefinitions,
  lookups?: PoliticsLookups,
): InterestGroupRefreshResult {
  const politics = definitions.politics;
  if (politics === undefined) {
    return {
      countryId: country.id,
      groups: neutralInterestGroups(),
      franchiseShare: 0,
      eligiblePopulation: 0,
    };
  }
  const professionKey = professionKeyById(definitions);
  const blocks = countryBlocks(world, country, lookups);
  const franchise = countryFranchise(world, country, politics, lookups);
  let population = 0;
  for (const block of blocks) population += populationTotal(block);
  const laborLaw = lawDefinition(politics, country.laws.labor);
  const laborBonus = laborLaw?.laborOrganizationBonus ?? 0;

  const groupDefs = [...politics.interestGroups].sort(
    (left, right) =>
      INTEREST_GROUP_KEYS.indexOf(left.key) - INTEREST_GROUP_KEYS.indexOf(right.key),
  );
  const knownProfessionKeys = new Set<string>();
  for (const definition of groupDefs) {
    for (const key of Object.keys(definition.membershipByProfessionKey)) {
      knownProfessionKeys.add(key);
    }
  }
  const raw = groupDefs.map((definition) => {
    let membership = 0;
    let weightedLiteracy = 0;
    let weightedWealth = 0;
    for (const block of blocks) {
      const key = professionKey.get(block.professionId) ?? "unknown";
      let weight = definition.membershipByProfessionKey[key] ?? 0;
      if (!knownProfessionKeys.has(key) && definition.key === "labor") {
        // Unknown profession keys are explicitly assigned to labor with a
        // diagnostic warning at world creation; they never disappear.
        weight = 1;
      }
      const count = populationTotal(block) * weight;
      if (!(count > 0)) continue;
      membership += count;
      weightedLiteracy += block.literacy * count;
      weightedWealth += block.wealthLevel * count;
    }
    const literacy = membership > 0 ? weightedLiteracy / membership : 0;
    const wealth = membership > 0 ? weightedWealth / membership : 0;
    const organization = clamp(
      definition.organizationBase +
        0.3 * literacy +
        0.2 * (wealth / 99) +
        (definition.key === "labor" ? laborBonus : 0),
      0,
      1,
    );
    const membershipShare = population > 0 ? membership / population : 0;
    const institutionalAccess = 0.5 + 0.5 * country.institutions.quality;
    const influenceRaw =
      membershipShare *
      (0.5 + 0.5 * literacy) *
      organization *
      (0.5 + 0.5 * franchise.share) *
      institutionalAccess;
    return {
      key: definition.key,
      membership,
      organization,
      influenceRaw,
    };
  });
  const totalInfluence = raw.reduce((total, entry) => total + entry.influenceRaw, 0);
  const groups: InterestGroupState[] = raw.map((entry, index) => {
    const stanceByLaw: Record<Id, number> = {};
    for (const law of [...politics.laws].sort((left, right) => left.id - right.id)) {
      stanceByLaw[law.id] = law.groupStance[entry.key];
    }
    return {
      id: index,
      key: entry.key,
      membershipPopulation: Math.round(entry.membership),
      organization: roundTo(entry.organization, POLITICS_RATE_DECIMALS),
      influence:
        totalInfluence > 0
          ? roundTo(entry.influenceRaw / totalInfluence, POLITICS_RATE_DECIMALS)
          : 0,
      stanceByLaw,
    };
  });
  country.interestGroups = groups;
  return {
    countryId: country.id,
    groups,
    franchiseShare: franchise.share,
    eligiblePopulation: franchise.eligiblePopulation,
  };
}

/** Recompute one country's administration institution from authoritative state. */
export function refreshInstitution(
  world: World,
  country: Country,
  definitions: EconomyDefinitions,
  day: Day,
  lookups?: PoliticsLookups,
): InstitutionState {
  const politics = definitions.politics;
  if (politics === undefined) {
    country.institutions = neutralInstitutionState();
    return country.institutions;
  }
  const professionKey = professionKeyById(definitions);
  const adminKeys = new Set(politics.administrationProfessionKeys);
  const healthShare = clamp(country.institutions.healthStaffShare ?? 0, 0, 1);
  const staffedByProfession: Record<Id, number> = {};
  let staff = 0;
  let population = 0;
  let literacyWeighted = 0;
  let infrastructureWeighted = 0;
  let provinceCount = 0;
  for (const block of countryBlocks(world, country, lookups)) {
    const count = populationTotal(block);
    population += count;
    const key = professionKey.get(block.professionId) ?? "";
    if (adminKeys.has(key)) {
      // E5: a share of the administration clerk base is assigned to public health,
      // so administration staffing is the remainder. Zero share preserves M8 exactly.
      const net = count * (1 - healthShare);
      staffedByProfession[block.professionId] =
        (staffedByProfession[block.professionId] ?? 0) + net;
      staff += net;
    }
    literacyWeighted += block.literacy * count;
  }
  for (const provinceId of lookups?.provinceIdsByCountry.get(country.id) ?? countryProvinceIds(world, country.id)) {
    const province =
      lookups !== undefined
        ? lookups.provinceById.get(provinceId)
        : world.provinceEconomies.find((candidate) => candidate.id === provinceId);
    if (province === undefined) continue;
    infrastructureWeighted += province.infrastructure;
    provinceCount += 1;
  }
  const literacy = population > 0 ? literacyWeighted / population : 0;
  const infrastructure = provinceCount > 0 ? infrastructureWeighted / provinceCount : DEFAULT_INFRASTRUCTURE;
  const clerkShare = population > 0 ? staff / population : 0;
  let staffingRatio = clamp(clerkShare / ADMIN_TARGET_CLERK_SHARE, 0, 1);
  // P7 (D-154, plan Q4): in a labour-market world the administration's staff are the
  // bureaucrats it employs; staffing is its filled share of the posts its budget funds
  // (the funding ratio below still measures the budget against the benchmark).
  if (world.labourMarket.enabled) {
    const employed = institutionStaff(world, country.id, "administration");
    const funded = administrationPostsFunded(world, definitions, country);
    staffingRatio = funded > 0 ? clamp(employed / funded, 0, 1) : 0;
    for (const key of Object.keys(staffedByProfession)) delete staffedByProfession[Number(key)];
    const bureaucrat = institutionProfession(definitions, "administration");
    if (bureaucrat !== undefined && employed > 0) staffedByProfession[bureaucrat.id] = employed;
    staff = employed;
  }
  // P2b: administration is staffed at the country's own clerk wages (D-135).
  const fundingBenchmark =
    population *
    world.moneyCoefficients.adminFundingPerCapitaPerYearRUSD *
    localWageIndex(world, countryBlocks(world, country, lookups), definitions, adminKeys);
  const fundingRatio =
    fundingBenchmark > 0
      ? clamp(country.institutions.fundedAnnualRUSD / fundingBenchmark, 0, 1)
      : 0;
  let lawLoad = 0;
  for (const slot of IMPLEMENTED_LAW_SLOTS) {
    const law = lawDefinition(politics, country.laws[slot]);
    if (law !== null) lawLoad += law.institutionLoad;
  }
  lawLoad = clamp(lawLoad, 0, 1);
  const lawFactor = clamp(1 - lawLoad, 0, 1);
  const disrupted =
    country.institutions.disruptionUntilDay !== null &&
    day <= country.institutions.disruptionUntilDay;
  const disruptionPenalty = disrupted ? INSTITUTION_DISRUPTION_QUALITY_PENALTY : 0;
  const priorRequested = country.institutions.fundingRequestedMonthToDateRUSD;
  const priorShortfall = country.institutions.fundingShortfallMonthToDateRUSD;
  const fundingShortfallRatio =
    priorRequested > 0 ? clamp(priorShortfall / priorRequested, 0, 1) : 0;
  const quality = clamp(
    INSTITUTION_STAFFING_WEIGHT * staffingRatio +
      INSTITUTION_FUNDING_WEIGHT * fundingRatio +
      INSTITUTION_LITERACY_WEIGHT * literacy +
      INSTITUTION_INFRASTRUCTURE_WEIGHT * infrastructure +
      INSTITUTION_LAW_WEIGHT * lawFactor -
      disruptionPenalty -
      INSTITUTION_FUNDING_SHORTFALL_PENALTY * fundingShortfallRatio,
    0,
    1,
  );
  const overload = clamp(
    (1 - staffingRatio) + 0.5 * (1 - fundingRatio) + lawLoad,
    0,
    2,
  );
  country.institutions = {
    ...country.institutions,
    staffedByProfession,
    serviceOutputIndex: roundTo(quality * (1 - Math.min(overload, 1)), POLITICS_RATE_DECIMALS),
    quality: roundTo(quality, POLITICS_RATE_DECIMALS),
    overload: roundTo(overload, POLITICS_RATE_DECIMALS),
    lastUpdateDay: day,
  };
  return country.institutions;
}

/** Effective statutory bounds for one tax type, intersected with the hard 0..1. */
export function effectiveTaxRateBounds(
  country: Country,
  definitions: EconomyDefinitions | undefined,
  taxType: "incomeTax" | "businessProfitTax",
): { min: Rate; max: Rate } {
  let min = 0;
  let max = 1;
  const politics = definitions?.politics;
  if (politics === undefined) return { min, max };
  for (const slot of IMPLEMENTED_LAW_SLOTS) {
    const law = lawDefinition(politics, country.laws[slot]);
    if (law === null) continue;
    for (const bound of law.taxRateBounds) {
      if (bound.taxType !== taxType) continue;
      min = Math.max(min, bound.min);
      max = Math.min(max, bound.max);
    }
  }
  return { min, max };
}

/** Tax collection efficiency derived from institution quality and overload. */
export function taxCollectionEfficiency(country: Country): Rate {
  return clamp(
    TAX_COLLECTION_BASE_EFFICIENCY +
      TAX_COLLECTION_QUALITY_WEIGHT * country.institutions.quality -
      TAX_COLLECTION_OVERLOAD_PENALTY * Math.min(country.institutions.overload, 1),
    TAX_COLLECTION_MIN_EFFICIENCY,
    1,
  );
}

/** Construction progress factor derived from institution quality and overload. */
export function constructionProgressFactor(country: Country): Rate {
  return clamp(
    1 -
      CONSTRUCTION_OVERLOAD_PENALTY * Math.min(country.institutions.overload, 1) -
      CONSTRUCTION_QUALITY_PENALTY * (1 - country.institutions.quality),
    CONSTRUCTION_MIN_FACTOR,
    1,
  );
}

/** Provincial production factor during the strike/crisis/revolution stages. */
export function productionStrikeFactor(
  world: World,
  countryId: Id,
  provinceId: Id,
): Rate {
  if (!world.politics.enabled) return 1;
  const country = world.countries.find((candidate) => candidate.id === countryId);
  if (country === undefined) return 1;
  const stage = country.regime.crisis.stage;
  if (stage !== "strike" && stage !== "crisis" && stage !== "revolution") return 1;
  const province = world.provinceEconomies.find((candidate) => candidate.id === provinceId);
  if (province === undefined || province.unrest < STRIKE_UNREST_THRESHOLD) return 1;
  return STRIKE_OUTPUT_FACTOR;
}

/** Influence-weighted support for one law, -1..1. */
export function lawSupport(
  country: Country,
  law: LawDef,
  definitions: PoliticsDefinitions,
): number {
  void definitions;
  let weighted = 0;
  let total = 0;
  let governingInfluence = 0;
  let governingStance = 0;
  for (const group of country.interestGroups) {
    const stance = group.stanceByLaw[law.id] ?? 0;
    weighted += group.influence * stance;
    total += group.influence;
    if (group.key === country.regime.governmentGroupKey) {
      governingInfluence = group.influence;
      governingStance = stance;
    }
  }
  const base = total > 0 ? weighted / total : 0;
  const governingAlignment =
    GOVERNING_GROUP_SUPPORT_WEIGHT * governingInfluence * governingStance;
  return roundTo(clamp(base + governingAlignment, -1, 1), POLITICS_RATE_DECIMALS);
}

/** Average interest-group stance toward the current enacted-law programme. */
export function governmentStance(
  country: Country,
  definitions: PoliticsDefinitions,
): Map<InterestGroupKey, number> {
  const result = new Map<InterestGroupKey, number>();
  for (const group of country.interestGroups) {
    let total = 0;
    let count = 0;
    for (const slot of IMPLEMENTED_LAW_SLOTS) {
      const law = lawDefinition(definitions, country.laws[slot]);
      if (law === null) continue;
      total += group.stanceByLaw[law.id] ?? 0;
      count += 1;
    }
    result.set(group.key, count > 0 ? total / count : 0);
  }
  return result;
}

function appendLog(
  world: World,
  day: Day,
  kind: PoliticsLogEntry["kind"],
  countryId: Id | null,
  summary: string,
  provenance: string,
): void {
  if (world.politics.eventLog.length >= MAX_POLITICS_LOG_ENTRIES) {
    world.politics.eventLog.shift();
  }
  world.politics.eventLog.push({
    id: world.politics.nextLogId,
    day,
    kind,
    countryId,
    summary: summary.slice(0, MAX_LAW_SUMMARY_LENGTH),
    provenance: provenance.slice(0, MAX_LAW_SUMMARY_LENGTH),
  });
  world.politics.nextLogId += 1;
}

/** Apply a law's statutory effects forward from the effective day. */
export function applyLawEffects(
  world: World,
  country: Country,
  definitions: PoliticsDefinitions,
  lawId: Id,
  day: Day,
): void {
  const law = lawDefinition(definitions, lawId);
  if (law === null) return;
  if (law.slot === "trade" && law.borderPolicy !== null) {
    country.immigrationOpen = law.borderPolicy === "open";
  }
  if (law.taxRateBounds.length > 0) {
    let incomeRate = country.fiscal.incomeTaxRate;
    let businessRate = country.fiscal.businessProfitTaxRate;
    for (const bound of law.taxRateBounds) {
      if (bound.taxType === "incomeTax") {
        incomeRate = clamp(incomeRate, bound.min, bound.max);
      } else {
        businessRate = clamp(businessRate, bound.min, bound.max);
      }
    }
    if (
      incomeRate !== country.fiscal.incomeTaxRate ||
      businessRate !== country.fiscal.businessProfitTaxRate
    ) {
      country.fiscal = {
        ...country.fiscal,
        incomeTaxRate: roundTo(incomeRate, POLITICS_RATE_DECIMALS),
        businessProfitTaxRate: roundTo(businessRate, POLITICS_RATE_DECIMALS),
      };
      appendLog(
        world,
        day,
        "law",
        country.id,
        `statutory compliance: tax rates clamped to the ${law.name} bounds`,
        `law:${law.key}`,
      );
    }
  }
}

function lawName(definitions: PoliticsDefinitions, lawId: Id): string {
  if (lawId === 0) return "none";
  return lawDefinition(definitions, lawId)?.name ?? `law ${String(lawId)}`;
}

/** Apply due events and effective law transitions at the start of a day. */
export function runPoliticsDayStart(
  world: World,
  definitions: EconomyDefinitions | undefined,
  day: Day,
): void {
  if (definitions?.politics === undefined) return;
  if (!world.politics.enabled) return;
  const politics = definitions.politics;

  for (const scheduled of [...world.politics.eventQueue].sort((left, right) =>
    left.dueDay !== right.dueDay ? left.dueDay - right.dueDay : left.id - right.id,
  )) {
    if (scheduled.status !== "scheduled" || scheduled.dueDay > day) continue;
    const event = politics.events.find((entry) => entry.id === scheduled.definitionId);
    if (event === undefined) {
      scheduled.status = "skipped";
      appendLog(
        world,
        day,
        "warning",
        scheduled.countryId,
        `event ${scheduled.key} has no definition`,
        scheduled.provenance,
      );
      continue;
    }
    const country = world.countries.find((candidate) => candidate.id === scheduled.countryId);
    if (country === undefined) {
      scheduled.status = "skipped";
      continue;
    }
    for (const effect of event.effects) {
      if (effect.kind === "militancy-pressure") {
        for (const block of countryBlocks(world, country)) {
          block.militancy = roundTo(clamp(block.militancy + effect.amount, 0, 1), POLITICS_RATE_DECIMALS);
        }
      } else if (effect.kind === "unrest-pressure") {
        for (const provinceId of countryProvinceIds(world, country.id)) {
          const province = world.provinceEconomies.find((candidate) => candidate.id === provinceId);
          if (province === undefined) continue;
          province.unrest = roundTo(clamp(province.unrest + effect.amount, 0, 1), POLITICS_RATE_DECIMALS);
        }
      } else {
        country.institutions = {
          ...country.institutions,
          disruptionUntilDay: Math.max(
            country.institutions.disruptionUntilDay ?? day,
            day + effect.days,
          ),
        };
      }
    }
    scheduled.status = "applied";
    scheduled.appliedDay = day;
    appendLog(
      world,
      day,
      "event",
      country.id,
      `${event.name}: ${event.description}`,
      event.provenance,
    );
  }

  for (const country of [...world.countries].sort((left, right) => left.id - right.id)) {
    const due = country.lawTransitions
      .filter((transition) => transition.effectiveDay <= day)
      .sort((left, right) => left.id - right.id);
    if (due.length === 0) continue;
    for (const transition of due) {
      country.laws[transition.slot] = transition.toLawId;
      applyLawEffects(world, country, politics, transition.toLawId, day);
      appendLog(
        world,
        day,
        "law",
        country.id,
        `${transition.slot} law is now ${lawName(politics, transition.toLawId)}`,
        `law-transition:${String(transition.id)}`,
      );
    }
    country.lawTransitions = country.lawTransitions.filter(
      (transition) => !due.includes(transition),
    );
  }

  const monthly = isFirstDayOfMonth(day) || day === world.startDayIndex;
  const lookups = buildPoliticsLookups(world);
  for (const country of [...world.countries].sort((left, right) => left.id - right.id)) {
    if (monthly) {
      refreshInstitution(world, country, definitions, day, lookups);
      refreshInterestGroups(world, country, definitions, lookups);
      country.institutions = {
        ...country.institutions,
        fundingRequestedMonthToDateRUSD: 0,
        fundingShortfallMonthToDateRUSD: 0,
      };
      if (country.regime.nextElectionDay !== null && day >= country.regime.nextElectionDay) {
        runElection(world, country, politics, definitions, day);
      }
    }
    // Crisis pressure accumulates daily from measured conditions, not from a
    // monthly timer. Elections and the institution/group refresh remain monthly.
    updateCrisis(world, country, politics, day, lookups);
  }
}

function runElection(
  world: World,
  country: Country,
  definitions: PoliticsDefinitions,
  economyDefinitions: EconomyDefinitions,
  day: Day,
): void {
  const regimeDef = regimeDefinition(definitions, country.regime.kind);
  const franchise = countryFranchise(world, country, definitions);
  const reschedule = (): void => {
    country.regime = {
      ...country.regime,
      nextElectionDay: addCivilYears(day, regimeDef.electionTermYears),
    };
  };
  if (
    !regimeDef.electionsEnabled ||
    franchise.share <= 0 ||
    franchise.eligiblePopulation <= 0 ||
    country.institutions.quality < ELECTION_MIN_INSTITUTION_QUALITY
  ) {
    appendLog(
      world,
      day,
      "election",
      country.id,
      "election skipped: the regime, franchise, population, or institutional conditions are not met",
      `election:${country.regime.kind}`,
    );
    reschedule();
    return;
  }
  const stances = governmentStance(country, definitions);
  const groupDefs = [...country.interestGroups].sort((left, right) =>
    INTEREST_GROUP_KEYS.indexOf(left.key) - INTEREST_GROUP_KEYS.indexOf(right.key),
  );
  const electorates = new Map<InterestGroupKey, number>();
  for (const group of groupDefs) electorates.set(group.key, 0);
  const professionKey = professionKeyById(economyDefinitions);
  const definitionByKey = new Map(
    definitions.interestGroups.map((entry) => [entry.key, entry] as const),
  );
  const knownProfessionKeys = new Set<string>();
  for (const definition of definitions.interestGroups) {
    for (const key of Object.keys(definition.membershipByProfessionKey)) {
      knownProfessionKeys.add(key);
    }
  }
  const rule = suffrageRuleForCountry(country, definitions);
  for (const block of countryBlocks(world, country)) {
    const population = populationTotal(block);
    const enfranchised = population * blockEnfranchisement(block, rule);
    if (!(enfranchised > 0)) continue;
    const key = professionKey.get(block.professionId) ?? "unknown";
    for (const group of groupDefs) {
      const definition = definitionByKey.get(group.key);
      if (definition === undefined) continue;
      let weight = definition.membershipByProfessionKey[key] ?? 0;
      if (!knownProfessionKeys.has(key) && group.key === "labor") {
        weight = 1;
      }
      if (!(weight > 0)) continue;
      electorates.set(group.key, (electorates.get(group.key) ?? 0) + enfranchised * weight);
    }
  }
  let votesForGovernment = 0;
  let votesForOpposition = 0;
  const opposition = new Map<InterestGroupKey, number>();
  for (const group of groupDefs) {
    const electorate = electorates.get(group.key) ?? 0;
    const stance = stances.get(group.key) ?? 0;
    const support = clamp(0.5 + 0.5 * stance, 0, 1);
    votesForGovernment += electorate * support;
    votesForOpposition += electorate * (1 - support);
    opposition.set(group.key, electorate * (1 - support));
  }
  const totalVotes = votesForGovernment + votesForOpposition;
  const share = totalVotes > 0 ? votesForGovernment / totalVotes : 0;
  let winner: InterestGroupKey = country.regime.governmentGroupKey;
  if (share < 0.5) {
    const ranked = [...opposition.entries()].sort((left, right) => {
      if (right[1] !== left[1]) return right[1] - left[1];
      return INTEREST_GROUP_KEYS.indexOf(left[0]) - INTEREST_GROUP_KEYS.indexOf(right[0]);
    });
    winner = ranked[0]?.[0] ?? country.regime.governmentGroupKey;
  }
  const result: ElectionResult = {
    day,
    eligiblePopulation: franchise.eligiblePopulation,
    votesForGovernment: Math.round(votesForGovernment),
    votesForOpposition: Math.round(votesForOpposition),
    governmentVoteShare: roundTo(share, POLITICS_RATE_DECIMALS),
    turnoutShare: roundTo(franchise.share, POLITICS_RATE_DECIMALS),
    previousGovernmentGroupKey: country.regime.governmentGroupKey,
    winnerGroupKey: winner,
  };
  country.regime = {
    ...country.regime,
    governmentGroupKey: winner,
    lastElectionDay: day,
    lastElection: result,
    nextElectionDay: addCivilYears(day, regimeDef.electionTermYears),
  };
  appendLog(
    world,
    day,
    "election",
    country.id,
    `election: government vote share ${result.governmentVoteShare.toFixed(3)}; governing group ${winner}`,
    `election:${country.regime.kind}`,
  );
}

function updateCrisis(
  world: World,
  country: Country,
  definitions: PoliticsDefinitions,
  day: Day,
  lookups?: PoliticsLookups,
): void {
  const pressure = crisisPressure(world, country, definitions, lookups);
  const crisis = { ...country.regime.crisis };
  if (pressure >= CRISIS_PRESSURE_THRESHOLD) {
    crisis.pressureDays += 1;
  } else {
    crisis.pressureDays = Math.max(0, crisis.pressureDays - CRISIS_PRESSURE_DECAY);
  }
  const cooldown =
    crisis.lastRevolutionDay !== null &&
    day - crisis.lastRevolutionDay < CRISIS_REVOLUTION_COOLDOWN_DAYS;
  const revolutionBlocked = cooldown && crisis.pressureDays >= CRISIS_REVOLUTION_DAYS;
  if (revolutionBlocked) crisis.pressureDays = CRISIS_CRISIS_DAYS - 1;
  const nextStage: CrisisStage =
    crisis.pressureDays >= CRISIS_REVOLUTION_DAYS
      ? "revolution"
      : crisis.pressureDays >= CRISIS_CRISIS_DAYS
        ? "crisis"
        : crisis.pressureDays >= CRISIS_STRIKE_DAYS
          ? "strike"
          : crisis.pressureDays >= CRISIS_UNREST_DAYS
            ? "unrest"
            : "none";
  if (nextStage !== crisis.stage) {
    crisis.stage = nextStage;
    crisis.sinceDay = day;
    appendLog(
      world,
      day,
      "crisis",
      country.id,
      `crisis stage changed to ${nextStage} (pressure ${pressure.toFixed(3)}, ${String(crisis.pressureDays)} pressure days)`,
      "crisis-pressure",
    );
  }
  country.regime = { ...country.regime, crisis };
  if (nextStage === "revolution") {
    runRevolution(world, country, definitions, day);
  }
}

/** Crisis pressure from real simulated state (D-076). */
export function crisisPressure(
  world: World,
  country: Country,
  definitions: PoliticsDefinitions,
  lookups?: PoliticsLookups,
): number {
  const blocks = countryBlocks(world, country, lookups);
  let population = 0;
  let weightedMilitancy = 0;
  let unmetPopulation = 0;
  for (const block of blocks) {
    const count = populationTotal(block);
    population += count;
    weightedMilitancy += block.militancy * count;
    if (block.unmetSubsistenceDays >= 7) unmetPopulation += count;
  }
  const militancy = population > 0 ? weightedMilitancy / population : 0;
  const unmet = population > 0 ? unmetPopulation / population : 0;
  let weightedUnrest = 0;
  let unrestWeight = 0;
  for (const provinceId of lookups?.provinceIdsByCountry.get(country.id) ?? countryProvinceIds(world, country.id)) {
    const province =
      lookups !== undefined
        ? lookups.provinceById.get(provinceId)
        : world.provinceEconomies.find((candidate) => candidate.id === provinceId);
    if (province === undefined) continue;
    let provincePopulation = 0;
    if (lookups !== undefined) {
      for (const block of lookups.blocksByProvince.get(provinceId) ?? []) {
        provincePopulation += populationTotal(block);
      }
    } else {
      for (const block of blocks) {
        if (block.provinceId === provinceId) provincePopulation += populationTotal(block);
      }
    }
    weightedUnrest += province.unrest * provincePopulation;
    unrestWeight += provincePopulation;
  }
  const unrest = unrestWeight > 0 ? weightedUnrest / unrestWeight : 0;
  const franchise = countryFranchise(world, country, definitions, lookups);
  const exclusion = clamp(1 - franchise.share, 0, 1);
  const overload = Math.min(country.institutions.overload, 1);
  const labor = lawDefinition(definitions, country.laws.labor);
  const grievance = labor?.laborGrievance ?? 0;
  return clamp(
    CRISIS_MILITANCY_WEIGHT * militancy +
      CRISIS_UNREST_WEIGHT * unrest +
      CRISIS_UNMET_WEIGHT * unmet +
      CRISIS_EXCLUSION_WEIGHT * exclusion +
      CRISIS_OVERLOAD_WEIGHT * overload +
      0.1 * grievance,
    0,
    1,
  );
}

function runRevolution(
  world: World,
  country: Country,
  definitions: PoliticsDefinitions,
  day: Day,
): void {
  const republic = regimeDefinition(definitions, "republic");
  const stances = governmentStance(country, definitions);
  const ranked = [...country.interestGroups].sort((left, right) => {
    const leftOpposition = left.influence * (1 - (stances.get(left.key) ?? 0));
    const rightOpposition = right.influence * (1 - (stances.get(right.key) ?? 0));
    if (rightOpposition !== leftOpposition) return rightOpposition - leftOpposition;
    return INTEREST_GROUP_KEYS.indexOf(left.key) - INTEREST_GROUP_KEYS.indexOf(right.key);
  });
  const winner = ranked[0]?.key ?? "labor";
  country.regime = {
    kind: "republic",
    sinceDay: day,
    governmentGroupKey: winner,
    nextElectionDay: addCivilYears(day, republic.electionTermYears),
    lastElectionDay: country.regime.lastElectionDay,
    lastElection: country.regime.lastElection,
    crisis: {
      stage: "none",
      sinceDay: day,
      pressureDays: 0,
      lastRevolutionDay: day,
    },
  };
  country.laws = { ...republic.defaultLaws };
  country.lawTransitions = [];
  country.institutions = {
    ...country.institutions,
    disruptionUntilDay: day + CRISIS_DISRUPTION_DAYS,
  };
  for (const slot of IMPLEMENTED_LAW_SLOTS) {
    applyLawEffects(world, country, definitions, country.laws[slot], day);
  }
  appendLog(
    world,
    day,
    "revolution",
    country.id,
    `revolution: regime changed to republic; governing group ${winner}; laws reset to the republican defaults`,
    "crisis:revolution",
  );
}

/**
 * Update provincial unrest after the day's needs/militancy and before the close.
 * One-day lag: the tax/construction effects of today's unrest are read on the
 * next civil day.
 */
export function runUnrestPhase(
  world: World,
  definitions: EconomyDefinitions | undefined,
  day: Day,
): void {
  void day;
  if (definitions?.politics === undefined || !world.politics.enabled) return;
  const politics = definitions.politics;
  // P1: employed workers per block, summed in `world.employment` order exactly as the
  // per-block scan this replaces.
  const employedByBlock = new Map<Id, number>();
  for (const assignment of world.employment) {
    employedByBlock.set(
      assignment.popBlockId,
      (employedByBlock.get(assignment.popBlockId) ?? 0) + assignment.workers,
    );
  }
  // P7 (D-154, plan §13 item 13): a labour-market world counts institution staff as
  // employed and measures unemployment against the eligible labour force.
  const labour = world.labourMarket.enabled;
  if (labour) {
    for (const assignment of world.labourMarket.institutionEmployment) {
      employedByBlock.set(
        assignment.popBlockId,
        (employedByBlock.get(assignment.popBlockId) ?? 0) + assignment.workers,
      );
    }
  }
  const professionById = new Map((definitions?.professions ?? []).map((profession) => [profession.id, profession]));
  // D-137: provinces and their blocks by id once; a province's blocks in ascending id
  // are the country's blocks filtered to it, which the per-province scan read.
  const lookups = buildPoliticsLookups(world);
  for (const country of [...world.countries].sort((left, right) => left.id - right.id)) {
    const labor = lawDefinition(politics, country.laws.labor);
    const grievance = labor?.laborGrievance ?? 0;
    for (const provinceId of lookups.provinceIdsByCountry.get(country.id) ?? []) {
      const province = lookups.provinceById.get(provinceId);
      if (province === undefined) continue;
      let provincePopulation = 0;
      let weightedMilitancy = 0;
      let unmetPopulation = 0;
      let workingAge = 0;
      let employed = 0;
      let eligibleLabour = 0;
      for (const block of lookups.blocksByProvince.get(provinceId) ?? []) {
        const count = populationTotal(block);
        provincePopulation += count;
        weightedMilitancy += block.militancy * count;
        if (block.unmetSubsistenceDays >= 7) unmetPopulation += count;
        let blockWorkingAge = 0;
        for (let age = 15; age < 81; age += 1) {
          blockWorkingAge += (block.maleByAge[age] ?? 0) + (block.femaleByAge[age] ?? 0);
        }
        workingAge += blockWorkingAge;
        employed += employedByBlock.get(block.id) ?? 0;
        if (labour) {
          const profession = professionById.get(block.professionId);
          if (profession !== undefined) eligibleLabour += labourEligibleWorkforce(block, profession);
        }
      }
      if (!(provincePopulation > 0)) {
        province.unrest = roundTo(
          province.unrest + (0 - province.unrest) * UNREST_DAILY_SMOOTHING,
          POLITICS_RATE_DECIMALS,
        );
        continue;
      }
      const militancy = weightedMilitancy / provincePopulation;
      const unmet = unmetPopulation / provincePopulation;
      const unemployment = labour
        ? eligibleLabour > 0
          ? clamp(1 - employed / eligibleLabour, 0, 1)
          : 0
        : workingAge > 0
          ? clamp(1 - employed / workingAge, 0, 1)
          : 0;
      const overload = Math.min(country.institutions.overload, 1);
      // P6 (D-153): housing worse than the province's 1900 level adds unrest.
      const crowding = provinceCrowding(
        lookups.blocksByProvince.get(provinceId) ?? [],
        province.housingReferencePersonsPerDwelling,
      );
      const crowdingExcess = crowding === null ? 0 : Math.max(0, crowding - 1);
      const target = clamp(
        UNREST_MILITANCY_WEIGHT * militancy +
          UNREST_UNMET_WEIGHT * unmet +
          UNREST_UNEMPLOYMENT_WEIGHT * unemployment +
          UNREST_OVERLOAD_WEIGHT * overload +
          UNREST_GRIEVANCE_WEIGHT * grievance +
          UNREST_CROWDING_WEIGHT * crowdingExcess -
          UNREST_INSTITUTION_RELIEF * country.institutions.quality,
        0,
        1,
      );
      const next = clamp(
        province.unrest + (target - province.unrest) * UNREST_DAILY_SMOOTHING,
        0,
        1,
      );
      province.unrest = roundTo(next, POLITICS_RATE_DECIMALS);
    }
  }
}

/** Derived political figures for snapshots/reports. */
export interface CountryPoliticsSummary {
  readonly franchiseShare: Rate;
  readonly eligiblePopulation: number;
  readonly supportForGovernment: Rate;
  readonly crisisPressure: Rate;
  readonly taxCollectionEfficiency: Rate;
  readonly constructionProgressFactor: Rate;
}

export function countryPoliticsSummary(
  world: World,
  country: Country,
  definitions: EconomyDefinitions,
): CountryPoliticsSummary {
  const politics = definitions.politics;
  if (politics === undefined) {
    return {
      franchiseShare: 0,
      eligiblePopulation: 0,
      supportForGovernment: 0,
      crisisPressure: 0,
      taxCollectionEfficiency: 1,
      constructionProgressFactor: 1,
    };
  }
  const franchise = countryFranchise(world, country, politics);
  const stances = governmentStance(country, politics);
  let weighted = 0;
  let total = 0;
  for (const group of country.interestGroups) {
    weighted += group.influence * (0.5 + 0.5 * (stances.get(group.key) ?? 0));
    total += group.influence;
  }
  return {
    franchiseShare: franchise.share,
    eligiblePopulation: franchise.eligiblePopulation,
    supportForGovernment: total > 0 ? roundTo(weighted / total, POLITICS_RATE_DECIMALS) : 0,
    crisisPressure: roundTo(crisisPressure(world, country, politics), POLITICS_RATE_DECIMALS),
    taxCollectionEfficiency: roundTo(taxCollectionEfficiency(country), POLITICS_RATE_DECIMALS),
    constructionProgressFactor: roundTo(constructionProgressFactor(country), POLITICS_RATE_DECIMALS),
  };
}

/** Validate the seven derived group records against the fixed group set. */
export function assertValidInterestGroupStates(
  groups: readonly InterestGroupState[],
  path: string,
): void {
  if (groups.length !== INTEREST_GROUP_KEYS.length) {
    throw new RangeError(`${path} must contain exactly ${String(INTEREST_GROUP_KEYS.length)} groups`);
  }
  const seen = new Set<string>();
  for (let index = 0; index < groups.length; index += 1) {
    const group = groups[index];
    if (group === undefined) throw new RangeError(`${path}[${String(index)}] is missing`);
    const groupPath = `${path}[${String(index)}]`;
    const id = requireInteger(group.id, `${groupPath}.id`, 0, 0xffff_ffff);
    if (id !== index) throw new RangeError(`${groupPath}.id must equal its index`);
    const key = requireString(group.key, `${groupPath}.key`, { minLength: 1 });
    if (!(INTEREST_GROUP_KEYS as readonly string[]).includes(key)) {
      throw new RangeError(`${groupPath}.key is not a registered interest group`);
    }
    if (seen.has(key)) throw new RangeError(`${path} contains duplicate group ${key}`);
    seen.add(key);
    requireFiniteNumber(group.membershipPopulation, `${groupPath}.membershipPopulation`);
    const organization = requireFiniteNumber(group.organization, `${groupPath}.organization`);
    const influence = requireFiniteNumber(group.influence, `${groupPath}.influence`);
    if (organization < 0 || organization > 1) {
      throw new RangeError(`${groupPath}.organization must be in 0..1`);
    }
    if (influence < 0 || influence > 1) {
      throw new RangeError(`${groupPath}.influence must be in 0..1`);
    }
    const stanceRecord = requireRecord(group.stanceByLaw, `${groupPath}.stanceByLaw`);
    for (const [lawId, rawStance] of Object.entries(stanceRecord)) {
      if (!/^\d+$/.test(lawId)) {
        throw new RangeError(`${groupPath}.stanceByLaw key ${JSON.stringify(lawId)} is not a law id`);
      }
      const stance = requireFiniteNumber(rawStance, `${groupPath}.stanceByLaw.${lawId}`);
      if (stance < -1 || stance > 1) {
        throw new RangeError(`${groupPath}.stanceByLaw.${lawId} must be in -1..1`);
      }
    }
  }
  for (const key of INTEREST_GROUP_KEYS) {
    if (!seen.has(key)) throw new RangeError(`${path} is missing ${key}`);
  }
}

export function assertValidInstitutionState(
  value: InstitutionState,
  path: string,
  terminalDay: Day,
): void {
  const record = requireRecord(value, path);
  const funded = requireFiniteNumber(record.fundedAnnualRUSD, `${path}.fundedAnnualRUSD`);
  if (funded < 0) throw new RangeError(`${path}.fundedAnnualRUSD must be non-negative`);
  const staff = requireRecord(record.staffedByProfession, `${path}.staffedByProfession`);
  for (const [professionId, rawCount] of Object.entries(staff)) {
    if (!/^\d+$/.test(professionId)) {
      throw new RangeError(`${path}.staffedByProfession key ${professionId} is not a profession id`);
    }
    const count = requireFiniteNumber(rawCount, `${path}.staffedByProfession.${professionId}`);
    if (count < 0) throw new RangeError(`${path}.staffedByProfession.${professionId} is negative`);
  }
  const service = requireFiniteNumber(record.serviceOutputIndex, `${path}.serviceOutputIndex`);
  if (service < 0 || service > 1) {
    throw new RangeError(`${path}.serviceOutputIndex must be in 0..1`);
  }
  const quality = requireFiniteNumber(record.quality, `${path}.quality`);
  if (quality < 0 || quality > 1) throw new RangeError(`${path}.quality must be in 0..1`);
  const overload = requireFiniteNumber(record.overload, `${path}.overload`);
  if (overload < 0 || overload > 2) throw new RangeError(`${path}.overload must be in 0..2`);
  if (record.disruptionUntilDay !== null) {
    requireInteger(record.disruptionUntilDay, `${path}.disruptionUntilDay`, 0, terminalDay);
  }
  if (record.lastUpdateDay !== null) {
    requireInteger(record.lastUpdateDay, `${path}.lastUpdateDay`, 0, terminalDay);
  }
  const requested = requireFiniteNumber(
    record.fundingRequestedMonthToDateRUSD,
    `${path}.fundingRequestedMonthToDateRUSD`,
  );
  const shortfall = requireFiniteNumber(
    record.fundingShortfallMonthToDateRUSD,
    `${path}.fundingShortfallMonthToDateRUSD`,
  );
  if (requested < 0 || shortfall < 0 || shortfall > requested + toleranceFor(requested)) {
    throw new RangeError(`${path} funding memo is inconsistent`);
  }
  const healthShare = requireFiniteNumber(
    record.healthStaffShare ?? 0,
    `${path}.healthStaffShare`,
  );
  if (healthShare < 0 || healthShare > 1) {
    throw new RangeError(`${path}.healthStaffShare must be in 0..1`);
  }
}

export function assertValidCrisisState(
  value: RegimeState["crisis"],
  path: string,
  terminalDay: Day,
): void {
  const record = requireRecord(value, path);
  const stage = requireString(record.stage, `${path}.stage`, { minLength: 1 });
  if (!(CRISIS_STAGES as readonly string[]).includes(stage)) {
    throw new RangeError(`${path}.stage is not a registered crisis stage`);
  }
  requireInteger(record.sinceDay, `${path}.sinceDay`, 0, terminalDay);
  requireInteger(record.pressureDays, `${path}.pressureDays`, 0, 100_000);
  if (record.lastRevolutionDay !== null) {
    requireInteger(record.lastRevolutionDay, `${path}.lastRevolutionDay`, 0, terminalDay);
  }
}

export function assertValidRegimeState(
  value: RegimeState,
  path: string,
  terminalDay: Day,
): void {
  const record = requireRecord(value, path);
  const kind = requireString(record.kind, `${path}.kind`, { minLength: 1 });
  if (!(REGIME_KINDS as readonly string[]).includes(kind)) {
    throw new RangeError(`${path}.kind is not a registered regime kind`);
  }
  requireInteger(record.sinceDay, `${path}.sinceDay`, 0, terminalDay);
  const group = requireString(record.governmentGroupKey, `${path}.governmentGroupKey`, {
    minLength: 1,
  });
  if (!(INTEREST_GROUP_KEYS as readonly string[]).includes(group)) {
    throw new RangeError(`${path}.governmentGroupKey is not a registered group`);
  }
  if (record.nextElectionDay !== null) {
    requireInteger(record.nextElectionDay, `${path}.nextElectionDay`, 0, terminalDay);
  }
  if (record.lastElectionDay !== null) {
    requireInteger(record.lastElectionDay, `${path}.lastElectionDay`, 0, terminalDay);
  }
  if (record.lastElection !== null) {
    const election = requireRecord(record.lastElection, `${path}.lastElection`);
    requireInteger(election.day, `${path}.lastElection.day`, 0, terminalDay);
    for (const field of [
      "eligiblePopulation",
      "votesForGovernment",
      "votesForOpposition",
    ] as const) {
      requireFiniteNumber(election[field], `${path}.lastElection.${field}`);
    }
    for (const field of ["governmentVoteShare", "turnoutShare"] as const) {
      const rate = requireFiniteNumber(election[field], `${path}.lastElection.${field}`);
      if (rate < 0 || rate > 1) {
        throw new RangeError(`${path}.lastElection.${field} must be in 0..1`);
      }
    }
    for (const field of ["previousGovernmentGroupKey", "winnerGroupKey"] as const) {
      const value = requireString(election[field], `${path}.lastElection.${field}`, {
        minLength: 1,
      });
      if (!(INTEREST_GROUP_KEYS as readonly string[]).includes(value)) {
        throw new RangeError(`${path}.lastElection.${field} is not a registered group`);
      }
    }
  }
  assertValidCrisisState(record.crisis as RegimeState["crisis"], `${path}.crisis`, terminalDay);
}

export function assertValidLawTransitions(
  transitions: readonly LawTransition[],
  path: string,
  terminalDay: Day,
): void {
  if (transitions.length > MAX_LAW_TRANSITIONS_PER_COUNTRY) {
    throw new RangeError(
      `${path} must contain at most ${String(MAX_LAW_TRANSITIONS_PER_COUNTRY)} transitions`,
    );
  }
  const ids = new Set<number>();
  const slots = new Set<string>();
  for (let index = 0; index < transitions.length; index += 1) {
    const transition = transitions[index];
    if (transition === undefined) throw new RangeError(`${path}[${String(index)}] is missing`);
    const transitionPath = `${path}[${String(index)}]`;
    const id = requireInteger(transition.id, `${transitionPath}.id`, 1, 0xffff_ffff);
    if (ids.has(id)) throw new RangeError(`${path} contains duplicate transition id ${String(id)}`);
    ids.add(id);
    const slot = requireString(transition.slot, `${transitionPath}.slot`, { minLength: 1 });
    if (!(LAW_SLOTS as readonly string[]).includes(slot)) {
      throw new RangeError(`${transitionPath}.slot is not a registered slot`);
    }
    if (slots.has(slot)) throw new RangeError(`${path} has more than one transition for ${slot}`);
    slots.add(slot);
    requireInteger(transition.fromLawId, `${transitionPath}.fromLawId`, 0, 0xffff_ffff);
    requireInteger(transition.toLawId, `${transitionPath}.toLawId`, 1, 0xffff_ffff);
    if (transition.fromLawId === transition.toLawId) {
      throw new RangeError(`${transitionPath} does not change the law`);
    }
    requireInteger(transition.proposedDay, `${transitionPath}.proposedDay`, 0, terminalDay);
    requireInteger(transition.effectiveDay, `${transitionPath}.effectiveDay`, 0, terminalDay);
    if (transition.effectiveDay < transition.proposedDay) {
      throw new RangeError(`${transitionPath}.effectiveDay precedes proposedDay`);
    }
    if (
      transition.source !== "player" &&
      transition.source !== "ai" &&
      transition.source !== "event"
    ) {
      throw new RangeError(`${transitionPath}.source is invalid`);
    }
    const support = requireFiniteNumber(transition.support, `${transitionPath}.support`);
    if (support < -1 || support > 1) {
      throw new RangeError(`${transitionPath}.support must be in -1..1`);
    }
  }
}

export function assertValidPoliticsState(
  value: PoliticsState,
  path: string,
  terminalDay: Day,
): void {
  const record = requireRecord(value, path);
  if (typeof record.enabled !== "boolean") {
    throw new TypeError(`${path}.enabled must be a boolean`);
  }
  const queue = requireArray(record.eventQueue, `${path}.eventQueue`);
  if (queue.length > MAX_SCRIPTED_EVENTS) {
    throw new RangeError(`${path}.eventQueue must contain at most ${String(MAX_SCRIPTED_EVENTS)} entries`);
  }
  const queueIds = new Set<number>();
  for (let index = 0; index < queue.length; index += 1) {
    const entry = requireRecord(queue[index], `${path}.eventQueue[${String(index)}]`);
    const id = requireInteger(entry.id, `${path}.eventQueue[${String(index)}].id`, 1, 0xffff_ffff);
    if (queueIds.has(id)) throw new RangeError(`${path}.eventQueue contains duplicate id ${String(id)}`);
    queueIds.add(id);
    requireInteger(
      entry.definitionId,
      `${path}.eventQueue[${String(index)}].definitionId`,
      1,
      0xffff_ffff,
    );
    requireString(entry.key, `${path}.eventQueue[${String(index)}].key`, { minLength: 1 });
    requireInteger(
      entry.countryId,
      `${path}.eventQueue[${String(index)}].countryId`,
      0,
      0xffff_ffff,
    );
    requireInteger(entry.dueDay, `${path}.eventQueue[${String(index)}].dueDay`, 0, terminalDay);
    if (entry.appliedDay !== null) {
      requireInteger(
        entry.appliedDay,
        `${path}.eventQueue[${String(index)}].appliedDay`,
        0,
        terminalDay,
      );
    }
    if (entry.status !== "scheduled" && entry.status !== "applied" && entry.status !== "skipped") {
      throw new RangeError(`${path}.eventQueue[${String(index)}].status is invalid`);
    }
    if (entry.status === "applied" && entry.appliedDay === null) {
      throw new RangeError(`${path}.eventQueue[${String(index)}] applied without a day`);
    }
    requireString(entry.provenance, `${path}.eventQueue[${String(index)}].provenance`, {
      minLength: 1,
    });
  }
  const log = requireArray(record.eventLog, `${path}.eventLog`);
  if (log.length > MAX_POLITICS_LOG_ENTRIES) {
    throw new RangeError(`${path}.eventLog must contain at most ${String(MAX_POLITICS_LOG_ENTRIES)} entries`);
  }
  for (let index = 0; index < log.length; index += 1) {
    const entry = requireRecord(log[index], `${path}.eventLog[${String(index)}]`);
    requireInteger(entry.id, `${path}.eventLog[${String(index)}].id`, 1, 0xffff_ffff);
    requireInteger(entry.day, `${path}.eventLog[${String(index)}].day`, 0, terminalDay);
    const kind = requireString(entry.kind, `${path}.eventLog[${String(index)}].kind`, {
      minLength: 1,
    });
    if (!["event", "election", "law", "crisis", "revolution", "warning"].includes(kind)) {
      throw new RangeError(`${path}.eventLog[${String(index)}].kind is invalid`);
    }
    if (entry.countryId !== null) {
      requireInteger(
        entry.countryId,
        `${path}.eventLog[${String(index)}].countryId`,
        0,
        0xffff_ffff,
      );
    }
    requireString(entry.summary, `${path}.eventLog[${String(index)}].summary`, {
      maxLength: MAX_LAW_SUMMARY_LENGTH,
    });
    requireString(entry.provenance, `${path}.eventLog[${String(index)}].provenance`, {
      maxLength: MAX_LAW_SUMMARY_LENGTH,
    });
  }
  requireInteger(record.nextEventId, `${path}.nextEventId`, 1, 0xffff_ffff);
  requireInteger(record.nextLogId, `${path}.nextLogId`, 1, 0xffff_ffff);
  if (!record.enabled && queue.length > 0) {
    throw new RangeError(`${path}.eventQueue must be empty when politics is disabled`);
  }
}

/** Validate the country law map against a politics definition block. */
export function assertValidCountryLaws(
  country: Country,
  definitions: PoliticsDefinitions | undefined,
  path: string,
): void {
  const laws = country.laws as unknown as Record<string, unknown>;
  for (const slot of LAW_SLOTS) {
    const lawId = requireInteger(laws[slot], `${path}.${slot}`, 0, 0xffff_ffff);
    if (definitions === undefined) {
      // World validation does not receive the static definitions. The law id is
      // still range-validated; scenario creation and action validation check
      // slot membership and prerequisites.
      continue;
    }
    if (lawId === 0) continue;
    const law = lawDefinition(definitions, lawId);
    if (law === null) continue;
    if (law.slot !== slot) {
      throw new RangeError(`${path}.${slot} references a law from slot ${law.slot}`);
    }
  }
}

/** Sum of institution funding paid in the current political month. */
export function institutionFundingRemainingAnnualized(country: Country, day: Day): number {
  const days = daysInYear(dayIndexToCivilDate(day).year);
  return Math.max(
    0,
    country.institutions.fundedAnnualRUSD / days -
      country.institutions.fundingShortfallMonthToDateRUSD,
  );
}

/** True when nothing political is due; used by tests. */
export function politicsIsInert(world: World): boolean {
  return !world.politics.enabled && world.politics.eventQueue.length === 0;
}

/** Population definitions are accepted for symmetry but not needed. */
export type PoliticsTickContext = {
  readonly population?: { readonly definitions: PopulationDefinitions };
};

/** Terminal guard shared with the tick pipeline. */
export function assertPoliticsDay(day: Day): void {
  if (isTerminalDayIndex(day)) {
    throw new RangeError("the terminal 2000-01-01 boundary cannot run the politics phase");
  }
}
