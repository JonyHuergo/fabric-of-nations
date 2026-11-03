/**
 * M9 technology and education model (GDD §10, D-077).
 *
 * The module owns:
 * - validation of the authoritative technology definitions and runtime state;
 * - derived technology effect factors (sector productivity, mortality, education);
 * - the derived education institution (staffing, capacity, attendance, quality);
 * - the daily education/research phase, including the cash-neutral education
 *   payroll posting and age-specific literacy gains;
 * - validated research and education policy actions.
 *
 * Technology definitions are static content passed explicitly through
 * `EconomyDefinitions`; they are never serialized into `World`. Runtime state is
 * plain data and is recomputed into derived values on demand.
 */

import { dayIndexToCivilDate, daysInYear } from "../calendar.js";
import { RATE_DECIMAL_PLACES } from "../population/constants.js";
import { populationTotal, syncBlockLiteracy, workingAgePopulation } from "../population/state.js";
import { localWageIndex } from "./localWages.js";
import type { Day, Id, Rate } from "../types.js";
import {
  requireArray,
  requireFiniteNumber,
  requireInteger,
  requireRecord,
  requireString,
} from "../validation.js";
import type { World } from "../world.js";
import { buildFinanceIndex, phaseFinance } from "./accounts.js";
import { postJournalBatch, type JournalEntryInput } from "./accounting.js";
import { accumulateBudgetMemo } from "./budget.js";
import {
  EDUCATION_ATTENDANCE_BASE,
  EDUCATION_ATTENDANCE_WEALTH_WEIGHT,
  EDUCATION_DAILY_LITERACY_GAIN,
  EDUCATION_QUALITY_COVERAGE_WEIGHT,
  EDUCATION_QUALITY_LITERACY_WEIGHT,
  EDUCATION_SCHOOL_AGE_MAX,
  EDUCATION_SCHOOL_AGE_MIN,
  EDUCATION_STUDENTS_PER_TEACHER,
  MAX_EDUCATION_FUNDING_RUSD_PER_YEAR,
  MAX_TECHNOLOGY_DEFINITIONS,
  MAX_TECHNOLOGY_EDUCATION_BONUS,
  MAX_TECHNOLOGY_PRODUCTIVITY_BONUS,
  MAX_TECHNOLOGY_RESEARCH_WORK,
  MIN_TECHNOLOGY_MORTALITY_FACTOR,
  TECHNOLOGY_RATE_DECIMALS,
} from "./constants.js";
import { lawDefinition } from "./politics.js";
import {
  BUILDING_SECTORS,
  MAX_TECHNOLOGY_ERA,
  MIN_TECHNOLOGY_ERA,
  type BuildingSector,
  type Country,
  type CountryTechnologyInput,
  type CountryTechnologyState,
  type EconomyDefinitions,
  type EducationState,
  type JournalLine,
  type TechnologyDef,
  type TechnologyDefinitions,
  type TechnologyEra,
} from "./types.js";
import {
  buildCountryPopulationIndex,
  buildProvinceOwnerMap,
  countryPopBlocks,
  type CountryPopulationIndex,
} from "./country.js";

const MAX_TECHNOLOGY_DESCRIPTION_LENGTH = 500;
const MAX_TECHNOLOGY_KEY_LENGTH = 64;
const MAX_TECHNOLOGY_NAME_LENGTH = 128;
const MAX_ACADEMIC_PROFESSION_KEYS = 16;
const MAX_TECHNOLOGY_EFFECTS = 8;
const MIN_MORTALITY_REDUCTION = 0;
const MAX_MORTALITY_REDUCTION = 0.95;

function clamp(value: number, minimum: number, maximum: number): number {
  if (value < minimum) return minimum;
  if (value > maximum) return maximum;
  return value;
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function isBuildingSector(value: string): value is BuildingSector {
  return (BUILDING_SECTORS as readonly string[]).includes(value);
}

/** One parsed technology effect. */
function parseEffect(raw: unknown, path: string): TechnologyDef["effects"][number] {
  const record = requireRecord(raw, path);
  const kind = requireString(record.kind, `${path}.kind`, { minLength: 1 });
  if (kind === "sector-productivity") {
    const sector = requireString(record.sector, `${path}.sector`, { minLength: 1 });
    if (!isBuildingSector(sector)) {
      throw new RangeError(`${path}.sector is not a registered building sector`);
    }
    const bonus = requireFiniteNumber(record.bonus, `${path}.bonus`);
    if (bonus <= 0 || bonus > MAX_TECHNOLOGY_PRODUCTIVITY_BONUS) {
      throw new RangeError(
        `${path}.bonus must be in (0, ${String(MAX_TECHNOLOGY_PRODUCTIVITY_BONUS)}]`,
      );
    }
    return { kind, sector, bonus };
  }
  if (kind === "mortality-reduction") {
    const reduction = requireFiniteNumber(record.reduction, `${path}.reduction`);
    if (reduction < MIN_MORTALITY_REDUCTION || reduction > MAX_MORTALITY_REDUCTION) {
      throw new RangeError(`${path}.reduction must be in 0..${String(MAX_MORTALITY_REDUCTION)}`);
    }
    return { kind, reduction };
  }
  if (kind === "education-effectiveness") {
    const bonus = requireFiniteNumber(record.bonus, `${path}.bonus`);
    if (bonus < 0 || bonus > MAX_TECHNOLOGY_EDUCATION_BONUS) {
      throw new RangeError(
        `${path}.bonus must be in 0..${String(MAX_TECHNOLOGY_EDUCATION_BONUS)}`,
      );
    }
    return { kind, bonus };
  }
  throw new RangeError(`${path}.kind is not a supported technology effect`);
}

/** Structural validation of the M9 technology definitions block. */
export function assertValidTechnologyDefinitions(
  value: unknown,
  path = "economyDefinitions.technology",
): asserts value is TechnologyDefinitions {
  const record = requireRecord(value, path);
  requireString(record.dataVersion, `${path}.dataVersion`, { minLength: 1 });
  const eraNames = requireArray(record.eraNames, `${path}.eraNames`);
  if (eraNames.length !== MAX_TECHNOLOGY_ERA) {
    throw new RangeError(`${path}.eraNames must contain exactly ${String(MAX_TECHNOLOGY_ERA)} names`);
  }
  for (let index = 0; index < eraNames.length; index += 1) {
    requireString(eraNames[index], `${path}.eraNames[${String(index)}]`, { minLength: 1 });
  }
  const academicKeys = requireArray(
    record.academicProfessionKeys,
    `${path}.academicProfessionKeys`,
  );
  if (academicKeys.length === 0 || academicKeys.length > MAX_ACADEMIC_PROFESSION_KEYS) {
    throw new RangeError(
      `${path}.academicProfessionKeys must contain 1..${String(MAX_ACADEMIC_PROFESSION_KEYS)} keys`,
    );
  }
  const academicProfessionKeys: string[] = [];
  const seenAcademicKeys = new Set<string>();
  for (let index = 0; index < academicKeys.length; index += 1) {
    const key = requireString(academicKeys[index], `${path}.academicProfessionKeys[${String(index)}]`, {
      minLength: 1,
      maxLength: MAX_TECHNOLOGY_KEY_LENGTH,
    });
    if (seenAcademicKeys.has(key)) {
      throw new RangeError(`${path}.academicProfessionKeys contains duplicate ${JSON.stringify(key)}`);
    }
    seenAcademicKeys.add(key);
    academicProfessionKeys.push(key);
  }

  const rawTechnologies = requireArray(record.technologies, `${path}.technologies`);
  if (rawTechnologies.length === 0) {
    throw new RangeError(`${path}.technologies must not be empty`);
  }
  if (rawTechnologies.length > MAX_TECHNOLOGY_DEFINITIONS) {
    throw new RangeError(
      `${path}.technologies must contain at most ${String(MAX_TECHNOLOGY_DEFINITIONS)} entries`,
    );
  }
  const byId = new Map<Id, TechnologyDef>();
  const keys = new Set<string>();
  for (let index = 0; index < rawTechnologies.length; index += 1) {
    const techPath = `${path}.technologies[${String(index)}]`;
    const raw = requireRecord(rawTechnologies[index], techPath);
    const id = requireInteger(raw.id, `${techPath}.id`, 0, MAX_TECHNOLOGY_DEFINITIONS - 1);
    if (byId.has(id)) throw new RangeError(`duplicate technology id ${String(id)}`);
    if (id !== index) {
      throw new RangeError(`${techPath}.id must equal its array position ${String(index)}`);
    }
    const key = requireString(raw.key, `${techPath}.key`, {
      minLength: 1,
      maxLength: MAX_TECHNOLOGY_KEY_LENGTH,
    });
    if (keys.has(key)) throw new RangeError(`duplicate technology key ${JSON.stringify(key)}`);
    keys.add(key);
    const era = requireInteger(raw.era, `${techPath}.era`, MIN_TECHNOLOGY_ERA, MAX_TECHNOLOGY_ERA);
    const prerequisitesRaw = requireArray(raw.prerequisites, `${techPath}.prerequisites`);
    const prerequisites = prerequisitesRaw.map((entry, prerequisiteIndex) =>
      requireInteger(
        entry,
        `${techPath}.prerequisites[${String(prerequisiteIndex)}]`,
        0,
        MAX_TECHNOLOGY_DEFINITIONS - 1,
      ),
    );
    const researchWork = requireFiniteNumber(raw.researchWork, `${techPath}.researchWork`);
    if (!(researchWork > 0) || researchWork > MAX_TECHNOLOGY_RESEARCH_WORK) {
      throw new RangeError(
        `${techPath}.researchWork must be in (0, ${String(MAX_TECHNOLOGY_RESEARCH_WORK)}]`,
      );
    }
    const effectsRaw = requireArray(raw.effects, `${techPath}.effects`);
    if (effectsRaw.length > MAX_TECHNOLOGY_EFFECTS) {
      throw new RangeError(
        `${techPath}.effects must contain at most ${String(MAX_TECHNOLOGY_EFFECTS)} entries`,
      );
    }
    const effects = effectsRaw.map((effect, effectIndex) =>
      parseEffect(effect, `${techPath}.effects[${String(effectIndex)}]`),
    );
    const definition: TechnologyDef = {
      id,
      key,
      name: requireString(raw.name, `${techPath}.name`, {
        minLength: 1,
        maxLength: MAX_TECHNOLOGY_NAME_LENGTH,
      }),
      era: era as TechnologyEra,
      description: requireString(raw.description, `${techPath}.description`, {
        minLength: 1,
        maxLength: MAX_TECHNOLOGY_DESCRIPTION_LENGTH,
      }),
      prerequisites,
      researchWork,
      effects,
    };
    byId.set(id, definition);
  }
  for (const definition of byId.values()) {
    const seen = new Set<Id>();
    for (const prerequisite of definition.prerequisites) {
      if (prerequisite === definition.id) {
        throw new RangeError(`${path}.technologies ${definition.key} requires itself`);
      }
      if (seen.has(prerequisite)) {
        throw new RangeError(
          `${path}.technologies ${definition.key} repeats prerequisite ${String(prerequisite)}`,
        );
      }
      seen.add(prerequisite);
      const prerequisiteDef = byId.get(prerequisite);
      if (prerequisiteDef === undefined) {
        throw new RangeError(
          `${path}.technologies ${definition.key} references unknown prerequisite ${String(prerequisite)}`,
        );
      }
      if (prerequisiteDef.era > definition.era) {
        throw new RangeError(
          `${path}.technologies ${definition.key} has a prerequisite from a later era`,
        );
      }
    }
  }
  // Explicit acyclic check: depth-first with three colours, independent of order.
  const state = new Map<Id, 1 | 2>();
  const visit = (id: Id, trail: readonly Id[]): void => {
    const current = state.get(id);
    if (current === 2) return;
    if (current === 1) {
      throw new RangeError(
        `${path}.technologies has a prerequisite cycle: ${[...trail, id].join(" -> ")}`,
      );
    }
    state.set(id, 1);
    const definition = byId.get(id);
    if (definition !== undefined) {
      for (const prerequisite of definition.prerequisites) visit(prerequisite, [...trail, id]);
    }
    state.set(id, 2);
  };
  for (const id of [...byId.keys()].sort((left, right) => left - right)) visit(id, []);
}

/** Look up a technology definition by id. */
export function technologyDefinition(
  definitions: TechnologyDefinitions | undefined,
  technologyId: Id,
): TechnologyDef | null {
  if (definitions === undefined) return null;
  return definitions.technologies.find((entry) => entry.id === technologyId) ?? null;
}

/** Look up a technology definition by stable key. */
export function technologyByKey(
  definitions: TechnologyDefinitions,
  key: string,
): TechnologyDef | null {
  return definitions.technologies.find((entry) => entry.key === key) ?? null;
}

/** Neutral technology state for worlds without technology definitions. */
export function neutralCountryTechnologyState(): CountryTechnologyState {
  return { researched: [], activeProject: null, workByTechnology: {} };
}

/** Neutral education policy state for worlds without technology definitions. */
export function neutralEducationState(): EducationState {
  return {
    fundedAnnualRUSD: 0,
    researchStaffShare: 0,
    lastUpdateDay: null,
    fundingRequestedMonthToDateRUSD: 0,
    fundingShortfallMonthToDateRUSD: 0,
  };
}

/** Validate one country's scenario technology input. */
export function assertValidCountryTechnologyInput(
  input: CountryTechnologyInput | undefined,
  definitions: TechnologyDefinitions | undefined,
  path: string,
): void {
  if (input === undefined) return;
  if (definitions === undefined) {
    throw new RangeError(`${path} requires technology definitions`);
  }
  const record = requireRecord(input, path);
  if (record.researchedTechnologyKeys !== undefined) {
    const rawKeys = requireArray(record.researchedTechnologyKeys, `${path}.researchedTechnologyKeys`);
    const seen = new Set<string>();
    for (let index = 0; index < rawKeys.length; index += 1) {
      const key = requireString(rawKeys[index], `${path}.researchedTechnologyKeys[${String(index)}]`, {
        minLength: 1,
      });
      if (seen.has(key)) {
        throw new RangeError(`${path}.researchedTechnologyKeys contains duplicate ${JSON.stringify(key)}`);
      }
      seen.add(key);
      if (technologyByKey(definitions, key) === null) {
        throw new RangeError(
          `${path}.researchedTechnologyKeys references unknown technology ${JSON.stringify(key)}`,
        );
      }
    }
  }
  if (record.educationFundingRUSDPerYear !== undefined) {
    const funding = requireFiniteNumber(
      record.educationFundingRUSDPerYear,
      `${path}.educationFundingRUSDPerYear`,
    );
    if (funding < 0 || funding > MAX_EDUCATION_FUNDING_RUSD_PER_YEAR) {
      throw new RangeError(`${path}.educationFundingRUSDPerYear is out of range`);
    }
  }
  if (record.researchStaffShare !== undefined) {
    const share = requireFiniteNumber(record.researchStaffShare, `${path}.researchStaffShare`);
    if (share < 0 || share > 1) {
      throw new RangeError(`${path}.researchStaffShare must be in 0..1`);
    }
  }
}

/** Build the initial technology/education state for one country. */
export function createCountryTechnologyState(
  input: CountryTechnologyInput | undefined,
  definitions: TechnologyDefinitions | undefined,
  day: Day,
  path: string,
): { technology: CountryTechnologyState; education: EducationState } {
  assertValidCountryTechnologyInput(input, definitions, path);
  const technology = neutralCountryTechnologyState();
  const education = neutralEducationState();
  if (input === undefined || definitions === undefined) return { technology, education };
  const definitionsById = new Map(definitions.technologies.map((entry) => [entry.id, entry]));
  const researchedIds: Id[] = [];
  for (const key of input.researchedTechnologyKeys ?? []) {
    const definition = technologyByKey(definitions, key);
    if (definition === null) {
      throw new RangeError(`${path} references unknown technology ${JSON.stringify(key)}`);
    }
    researchedIds.push(definition.id);
  }
  researchedIds.sort((left, right) => left - right);
  technology.researched = researchedIds.map((technologyId) => ({
    technologyId,
    completedDay: day,
  }));
  // Scenario-reviewed state: every listed technology must have its prerequisites
  // satisfied by another listed technology or by an earlier definition.
  for (const technologyId of researchedIds) {
    const definition = definitionsById.get(technologyId);
    if (definition === undefined) {
      throw new RangeError(`${path} references unknown technology ${String(technologyId)}`);
    }
    for (const prerequisite of definition.prerequisites) {
      if (!researchedIds.includes(prerequisite)) {
        throw new RangeError(
          `${path} includes ${definition.key} without prerequisite ${String(prerequisite)}`,
        );
      }
    }
  }
  education.fundedAnnualRUSD = input.educationFundingRUSDPerYear ?? 0;
  education.researchStaffShare = input.researchStaffShare ?? 0;
  return { technology, education };
}

/** Structural validation for one country's technology state. */
export function assertValidCountryTechnologyState(
  state: CountryTechnologyState,
  path: string,
  dayIndex: Day,
): void {
  const record = requireRecord(state, path);
  const researched = requireArray(record.researched, `${path}.researched`);
  if (researched.length > MAX_TECHNOLOGY_DEFINITIONS) {
    throw new RangeError(
      `${path}.researched must contain at most ${String(MAX_TECHNOLOGY_DEFINITIONS)} entries`,
    );
  }
  let previous = -1;
  const researchedIds = new Set<Id>();
  for (let index = 0; index < researched.length; index += 1) {
    const entryPath = `${path}.researched[${String(index)}]`;
    const entry = requireRecord(researched[index], entryPath);
    const technologyId = requireInteger(
      entry.technologyId,
      `${entryPath}.technologyId`,
      0,
      MAX_TECHNOLOGY_DEFINITIONS - 1,
    );
    if (technologyId <= previous) {
      throw new RangeError(`${path}.researched must be strictly ascending by technology id`);
    }
    previous = technologyId;
    researchedIds.add(technologyId);
    requireInteger(entry.completedDay, `${entryPath}.completedDay`, 0, dayIndex);
  }
  const work = requireRecord(record.workByTechnology, `${path}.workByTechnology`);
  const workIds = new Set<Id>();
  for (const [rawId, rawWork] of Object.entries(work)) {
    const technologyId = Number(rawId);
    if (!Number.isInteger(technologyId) || technologyId < 0 || String(technologyId) !== rawId) {
      throw new RangeError(`${path}.workByTechnology contains an invalid technology id ${JSON.stringify(rawId)}`);
    }
    if (researchedIds.has(technologyId)) {
      throw new RangeError(
        `${path}.workByTechnology must not retain work for completed technology ${String(technologyId)}`,
      );
    }
    const amount = requireFiniteNumber(rawWork, `${path}.workByTechnology.${rawId}`);
    if (!(amount > 0) || amount > MAX_TECHNOLOGY_RESEARCH_WORK) {
      throw new RangeError(`${path}.workByTechnology.${rawId} is out of range`);
    }
    workIds.add(technologyId);
  }
  if (workIds.size > MAX_TECHNOLOGY_DEFINITIONS) {
    throw new RangeError(`${path}.workByTechnology has too many entries`);
  }
  if (record.activeProject !== null) {
    const projectPath = `${path}.activeProject`;
    const project = requireRecord(record.activeProject, projectPath);
    const technologyId = requireInteger(
      project.technologyId,
      `${projectPath}.technologyId`,
      0,
      MAX_TECHNOLOGY_DEFINITIONS - 1,
    );
    if (researchedIds.has(technologyId)) {
      throw new RangeError(`${projectPath} references an already researched technology`);
    }
    requireInteger(project.startedDay, `${projectPath}.startedDay`, 0, dayIndex);
  }
}

/** Structural validation for one country's education policy state. */
export function assertValidEducationState(
  state: EducationState,
  path: string,
  dayIndex: Day,
): void {
  const record = requireRecord(state, path);
  const funding = requireFiniteNumber(record.fundedAnnualRUSD, `${path}.fundedAnnualRUSD`);
  if (funding < 0 || funding > MAX_EDUCATION_FUNDING_RUSD_PER_YEAR) {
    throw new RangeError(`${path}.fundedAnnualRUSD is out of range`);
  }
  const share = requireFiniteNumber(record.researchStaffShare, `${path}.researchStaffShare`);
  if (share < 0 || share > 1) {
    throw new RangeError(`${path}.researchStaffShare must be in 0..1`);
  }
  if (record.lastUpdateDay !== null) {
    requireInteger(record.lastUpdateDay, `${path}.lastUpdateDay`, 0, dayIndex);
  }
  const requested = requireFiniteNumber(
    record.fundingRequestedMonthToDateRUSD,
    `${path}.fundingRequestedMonthToDateRUSD`,
  );
  const shortfall = requireFiniteNumber(
    record.fundingShortfallMonthToDateRUSD,
    `${path}.fundingShortfallMonthToDateRUSD`,
  );
  if (requested < 0 || shortfall < 0) {
    throw new RangeError(`${path} funding memo must be non-negative`);
  }
  if (shortfall > requested + 1e-6 * Math.max(1, requested)) {
    throw new RangeError(`${path}.fundingShortfallMonthToDateRUSD must not exceed the request`);
  }
}

/** Validate the world-level M9 policy and every country's M9 state. */
export function assertValidTechnologyState(world: World): void {
  const system = requireRecord(world.technology, "world.technology");
  if (typeof system.enabled !== "boolean") {
    throw new TypeError("world.technology.enabled must be a boolean");
  }
  for (const country of world.countries) {
    assertValidCountryTechnologyState(
      country.technology,
      `country ${String(country.id)}.technology`,
      world.dayIndex,
    );
    assertValidEducationState(
      country.education,
      `country ${String(country.id)}.education`,
      world.dayIndex,
    );
  }
}

/**
 * Definitions-aware cross-check, run at the tick boundary and before actions.
 * Structural validation cannot know whether ids exist or whether prerequisites
 * are satisfied.
 */
export function assertTechnologyStateMatchesDefinitions(
  world: World,
  definitions: EconomyDefinitions,
): void {
  const content = definitions.technology;
  if (content === undefined) return;
  const byId = new Map(content.technologies.map((entry) => [entry.id, entry]));
  for (const country of world.countries) {
    const researched = new Set<Id>();
    for (const entry of country.technology.researched) {
      if (!byId.has(entry.technologyId)) {
        throw new RangeError(
          `country ${String(country.id)} has researched unknown technology ${String(entry.technologyId)}`,
        );
      }
      researched.add(entry.technologyId);
    }
    for (const [rawId] of Object.entries(country.technology.workByTechnology)) {
      const technologyId = Number(rawId);
      if (!byId.has(technologyId)) {
        throw new RangeError(
          `country ${String(country.id)} retains work for unknown technology ${rawId}`,
        );
      }
    }
    if (country.technology.activeProject !== null) {
      const activeId = country.technology.activeProject.technologyId;
      if (!byId.has(activeId)) {
        throw new RangeError(
          `country ${String(country.id)} has an active unknown technology ${String(activeId)}`,
        );
      }
      if (researched.has(activeId)) {
        throw new RangeError(
          `country ${String(country.id)} is researching completed technology ${String(activeId)}`,
        );
      }
    }
  }
}

/** True when the country has researched the technology. */
export function hasResearchedTechnology(country: Country, technologyId: Id): boolean {
  return country.technology.researched.some((entry) => entry.technologyId === technologyId);
}

/** Sum of researched sector-productivity bonuses for one sector, 0 when none. */
export function technologyProductivityBonus(
  country: Country,
  definitions: EconomyDefinitions | undefined,
  sector: BuildingSector,
): number {
  const content = definitions?.technology;
  if (content === undefined) return 0;
  let bonus = 0;
  for (const entry of country.technology.researched) {
    const definition = technologyDefinition(content, entry.technologyId);
    if (definition === null) continue;
    for (const effect of definition.effects) {
      if (effect.kind === "sector-productivity" && effect.sector === sector) bonus += effect.bonus;
    }
  }
  return clamp(bonus, 0, MAX_TECHNOLOGY_PRODUCTIVITY_BONUS);
}

/** Sector output multiplier, 1 when no researched technology applies. */
export function technologyProductivityFactor(
  country: Country,
  definitions: EconomyDefinitions | undefined,
  sector: BuildingSector,
): number {
  return 1 + technologyProductivityBonus(country, definitions, sector);
}

/** Mortality multiplier from researched technologies, bounded to a positive factor. */
export function technologyMortalityFactor(
  country: Country,
  definitions: EconomyDefinitions | undefined,
): number {
  const content = definitions?.technology;
  if (content === undefined) return 1;
  let reduction = 0;
  for (const entry of country.technology.researched) {
    const definition = technologyDefinition(content, entry.technologyId);
    if (definition === null) continue;
    for (const effect of definition.effects) {
      if (effect.kind === "mortality-reduction") reduction += effect.reduction;
    }
  }
  return clamp(1 - reduction, MIN_TECHNOLOGY_MORTALITY_FACTOR, 1);
}

/** Additive education-quality bonus from researched technologies. */
export function technologyEducationBonus(
  country: Country,
  definitions: EconomyDefinitions | undefined,
): number {
  const content = definitions?.technology;
  if (content === undefined) return 0;
  let bonus = 0;
  for (const entry of country.technology.researched) {
    const definition = technologyDefinition(content, entry.technologyId);
    if (definition === null) continue;
    for (const effect of definition.effects) {
      if (effect.kind === "education-effectiveness") bonus += effect.bonus;
    }
  }
  return clamp(bonus, 0, MAX_TECHNOLOGY_EDUCATION_BONUS);
}

/** Country that owns a province, or null. */
export function countryForProvince(world: World, provinceId: Id): Country | null {
  const ownerId = buildProvinceOwnerMap(world).get(provinceId);
  return ownerId === undefined ? null : (world.countries.find((country) => country.id === ownerId) ?? null);
}

function countryBlocks(
  world: World,
  country: Country,
  index?: CountryPopulationIndex,
): readonly World["popBlocks"][number][] {
  return countryPopBlocks(world, country.id, index);
}

function professionKeyById(definitions: EconomyDefinitions): Map<Id, string> {
  return new Map(definitions.professions.map((profession) => [profession.id, profession.key]));
}

/** Attendance and quality policy contributed by the enacted education law. */
export function educationLawPolicy(
  country: Country,
  definitions: EconomyDefinitions | undefined,
): { attendanceFloor: Rate; qualityBonus: Rate } {
  const politics = definitions?.politics;
  if (politics === undefined) return { attendanceFloor: 0, qualityBonus: 0 };
  const law = lawDefinition(politics, country.laws.education);
  if (law === null) return { attendanceFloor: 0, qualityBonus: 0 };
  return {
    attendanceFloor: clamp(law.educationAttendanceFloor, 0, 1),
    qualityBonus: clamp(law.educationQualityBonus, 0, 1),
  };
}

/** Derived education institution values. Never stored as authoritative state. */
export interface EducationDerived {
  readonly countryId: Id;
  readonly academicPopulation: number;
  readonly availableAcademicWorkers: number;
  readonly academicLiteracy: Rate;
  readonly researchStaff: number;
  readonly trainingStaff: number;
  readonly teacherStaff: number;
  readonly schoolAgePopulation: number;
  readonly teachingCapacityStudents: number;
  readonly enrolledStudents: number;
  readonly attendanceRate: Rate;
  readonly fundingAdequacy: Rate;
  readonly quality: Rate;
  readonly serviceOutputIndex: number;
  readonly researchBlockedReason:
    | "no-technology-definitions"
    | "no-academic-staff"
    | "no-funding"
    | "no-active-project"
    | null;
  readonly educationBlockedReason:
    | "no-technology-definitions"
    | "no-academic-staff"
    | "no-funding"
    | "no-school-age-population"
    | null;
}

function schoolAgeOf(block: World["popBlocks"][number]): number {
  let schoolAge = 0;
  for (let age = EDUCATION_SCHOOL_AGE_MIN; age <= EDUCATION_SCHOOL_AGE_MAX; age += 1) {
    schoolAge += (block.maleByAge[age] ?? 0) + (block.femaleByAge[age] ?? 0);
  }
  return schoolAge;
}

/** Recompute one country's education institution from authoritative state. */
export function deriveEducation(
  world: World,
  country: Country,
  definitions: EconomyDefinitions | undefined,
  /** Shared per-phase lookups (D-137); built from `world` when omitted. */
  populationIndex?: CountryPopulationIndex,
): EducationDerived {
  const content = definitions?.technology;
  const blocks = countryBlocks(world, country, populationIndex);
  if (content === undefined || definitions === undefined) {
    let schoolAge = 0;
    for (const block of blocks) schoolAge += schoolAgeOf(block);
    return {
      countryId: country.id,
      academicPopulation: 0,
      availableAcademicWorkers: 0,
      academicLiteracy: 0,
      researchStaff: 0,
      trainingStaff: 0,
      teacherStaff: 0,
      schoolAgePopulation: schoolAge,
      teachingCapacityStudents: 0,
      enrolledStudents: 0,
      attendanceRate: 0,
      fundingAdequacy: 0,
      quality: 0,
      serviceOutputIndex: 0,
      researchBlockedReason: "no-technology-definitions",
      educationBlockedReason: "no-technology-definitions",
    };
  }
  const academicKeys = new Set(content.academicProfessionKeys);
  const professionById = new Map(definitions.professions.map((entry) => [entry.id, entry]));
  const assignedByBlock = (populationIndex ?? buildCountryPopulationIndex(world)).assignedByBlock;
  let academicPopulation = 0;
  let availableAcademicWorkers = 0;
  let literacyWeighted = 0;
  let schoolAgePopulation = 0;
  const blockSchoolAge = new Map<Id, number>();
  for (const block of blocks) {
    const population = populationTotal(block);
    const schoolAge = schoolAgeOf(block);
    blockSchoolAge.set(block.id, schoolAge);
    schoolAgePopulation += schoolAge;
    if (population <= 0) continue;
    const profession = professionById.get(block.professionId);
    if (profession === undefined) continue;
    if (!academicKeys.has(profession.key)) continue;
    const workingAge = workingAgePopulation(block);
    const available = Math.max(
      0,
      workingAge * profession.participationRate - (assignedByBlock.get(block.id) ?? 0),
    );
    academicPopulation += population;
    availableAcademicWorkers += available;
    literacyWeighted += available * block.literacy;
  }
  const academicLiteracy =
    availableAcademicWorkers > 0 ? literacyWeighted / availableAcademicWorkers : 0;
  const researchStaff = availableAcademicWorkers * country.education.researchStaffShare;
  // E5: vocational-training instructors are a third claim on academic staff time.
  const trainingStaff =
    availableAcademicWorkers * clamp(country.labor?.trainingStaffShare ?? 0, 0, 1);
  const teacherStaff = Math.max(
    0,
    availableAcademicWorkers - researchStaff - trainingStaff,
  );
  const teachingCapacityStudents = teacherStaff * EDUCATION_STUDENTS_PER_TEACHER;
  const accessRatio =
    schoolAgePopulation > 0
      ? clamp(teachingCapacityStudents / schoolAgePopulation, 0, 1)
      : 0;
  const lawPolicy = educationLawPolicy(country, definitions);
  let enrolledStudents = 0;
  for (const block of blocks) {
    const schoolAge = blockSchoolAge.get(block.id) ?? 0;
    if (schoolAge <= 0) continue;
    const familyAttendance = clamp(
      EDUCATION_ATTENDANCE_BASE +
        EDUCATION_ATTENDANCE_WEALTH_WEIGHT * (block.wealthLevel / 99) +
        lawPolicy.attendanceFloor,
      0,
      1,
    );
    enrolledStudents += schoolAge * Math.min(accessRatio, familyAttendance);
  }
  const attendanceRate = schoolAgePopulation > 0 ? enrolledStudents / schoolAgePopulation : 0;
  // P2b: teachers are paid at the country's own academic wages (D-135).
  const fundingBenchmark =
    availableAcademicWorkers *
    world.moneyCoefficients.educationFundingPerStaffPerYearRUSD *
    localWageIndex(
      world,
      blocks,
      definitions,
      new Set(content.academicProfessionKeys),
      populationIndex?.wagesByProvince,
    );
  const fundingAdequacy =
    fundingBenchmark > 0
      ? clamp(country.education.fundedAnnualRUSD / fundingBenchmark, 0, 1)
      : 0;
  const quality = clamp(
    EDUCATION_QUALITY_COVERAGE_WEIGHT * accessRatio +
      EDUCATION_QUALITY_LITERACY_WEIGHT * academicLiteracy +
      lawPolicy.qualityBonus +
      technologyEducationBonus(country, definitions),
    0,
    1,
  );
  const researchBlockedReason =
    availableAcademicWorkers <= 0
      ? "no-academic-staff"
      : !(country.education.fundedAnnualRUSD > 0)
        ? "no-funding"
        : country.technology.activeProject === null
          ? "no-active-project"
          : null;
  const educationBlockedReason =
    availableAcademicWorkers <= 0
      ? "no-academic-staff"
      : !(country.education.fundedAnnualRUSD > 0)
        ? "no-funding"
        : schoolAgePopulation <= 0
          ? "no-school-age-population"
          : null;
  return {
    countryId: country.id,
    academicPopulation,
    availableAcademicWorkers: roundTo(availableAcademicWorkers, RATE_DECIMAL_PLACES),
    academicLiteracy: roundTo(academicLiteracy, TECHNOLOGY_RATE_DECIMALS),
    researchStaff: roundTo(researchStaff, RATE_DECIMAL_PLACES),
    trainingStaff: roundTo(trainingStaff, RATE_DECIMAL_PLACES),
    teacherStaff: roundTo(teacherStaff, RATE_DECIMAL_PLACES),
    schoolAgePopulation,
    teachingCapacityStudents: roundTo(teachingCapacityStudents, RATE_DECIMAL_PLACES),
    enrolledStudents: roundTo(enrolledStudents, RATE_DECIMAL_PLACES),
    attendanceRate: roundTo(attendanceRate, TECHNOLOGY_RATE_DECIMALS),
    fundingAdequacy: roundTo(fundingAdequacy, TECHNOLOGY_RATE_DECIMALS),
    quality: roundTo(quality, TECHNOLOGY_RATE_DECIMALS),
    serviceOutputIndex: roundTo(quality * accessRatio * fundingAdequacy, TECHNOLOGY_RATE_DECIMALS),
    researchBlockedReason,
    educationBlockedReason,
  };
}

/** One country's result from the daily education/research phase. */
export interface EducationCountryResult {
  readonly countryId: Id;
  readonly requestedRUSD: number;
  readonly paidRUSD: number;
  readonly shortfallRUSD: number;
  readonly researchWork: number;
  readonly completedTechnologyId: Id | null;
  readonly literacyGainPopulation: number;
}

/** Daily education/research phase result. */
export interface EducationPhaseResult {
  readonly dayIndex: Day;
  readonly countries: readonly EducationCountryResult[];
  readonly totalPaidRUSD: number;
  readonly completedTechnologyIds: readonly Id[];
}

function allocateProportionally(
  amount: number,
  blocks: readonly { id: Id; population: number }[],
): Map<Id, number> {
  const total = blocks.reduce((sum, block) => sum + block.population, 0);
  const allocations = new Map<Id, number>();
  if (!(amount > 0) || total <= 0) return allocations;
  // Exact proportional allocation: the final block absorbs the floating-point
  // residual so the household legs sum to the country total within tolerance.
  let remaining = amount;
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (block === undefined) continue;
    const share =
      index === blocks.length - 1 ? remaining : (amount * block.population) / total;
    if (share > 0) allocations.set(block.id, share);
    remaining -= share;
  }
  return allocations;
}

function isFirstDayOfMonth(day: number): boolean {
  return dayIndexToCivilDate(day).day === 1;
}

/** Reset the month-to-date education memo on the start of a month. */
function resetEducationMemoIfDue(world: World, day: Day): void {
  if (day !== world.startDayIndex && !isFirstDayOfMonth(day)) return;
  for (const country of world.countries) {
    country.education = {
      ...country.education,
      fundingRequestedMonthToDateRUSD: 0,
      fundingShortfallMonthToDateRUSD: 0,
    };
  }
}

/**
 * Apply one day of education and research.
 *
 * The phase is deterministic and applies once per processed day. It pays the
 * education/research payroll from actual treasury cash, raises the literacy of the
 * school-age cohort, advances the active research project, and records the
 * month-to-date funding memo. A technology completed today applies from the next
 * civil day; no closed period is rewritten.
 */
export function runEducationPhase(
  world: World,
  definitions: EconomyDefinitions | undefined,
  day: Day,
  options: { readonly validateWorld?: boolean; readonly financeInPlace?: boolean } = {},
): EducationPhaseResult {
  if (definitions?.technology === undefined || !world.technology.enabled) {
    return {
      dayIndex: day,
      countries: [],
      totalPaidRUSD: 0,
      completedTechnologyIds: [],
    };
  }
  resetEducationMemoIfDue(world, day);
  const content = definitions.technology;
  const yearDays = daysInYear(dayIndexToCivilDate(day).year);
  // D-137: one set of country lookups for the whole phase; the payroll below changes
  // only balances, never the blocks, assignments or wage tables it reads.
  const populationIndex = buildCountryPopulationIndex(world);
  const derivedByCountry = new Map<Id, EducationDerived>();
  for (const country of [...world.countries].sort((left, right) => left.id - right.id)) {
    derivedByCountry.set(country.id, deriveEducation(world, country, definitions, populationIndex));
  }

  // Stage the finance mutation. Posting errors leave the world untouched (direct
  // callers); the integrated day writes in place (D-137).
  const stagedFinance = phaseFinance(world.finance, options.financeInPlace);
  const index = buildFinanceIndex(stagedFinance);
  const countryDrafts: {
    countryId: Id;
    requested: number;
    paid: number;
    shortfall: number;
    blocks: { id: Id; population: number }[];
  }[] = [];
  const entries: JournalEntryInput[] = [];
  const academicKeys = new Set(content.academicProfessionKeys);
  const professionKey = professionKeyById(definitions);
  for (const country of [...world.countries].sort((left, right) => left.id - right.id)) {
    const requested = country.education.fundedAnnualRUSD / yearDays;
    if (!Number.isFinite(requested) || requested < 0) {
      throw new RangeError(`invalid education funding for country ${String(country.id)}`);
    }
    if (!(requested > 0)) continue;
    const eligible = countryBlocks(world, country, populationIndex)
      .filter(
        (block) =>
          populationTotal(block) > 0 &&
          academicKeys.has(professionKey.get(block.professionId) ?? ""),
      )
      .map((block) => ({ id: block.id, population: populationTotal(block) }));
    const treasury = index.get("country", country.id, "treasury-cash");
    const payableCeiling = Math.max(0, treasury.balanceRUSD - country.fiscal.reserveTargetRUSD);
    const payable = eligible.length > 0 ? Math.min(requested, payableCeiling) : 0;
    const allocations = allocateProportionally(payable, eligible);
    const lines: JournalLine[] = [];
    for (const block of eligible) {
      const amount = allocations.get(block.id) ?? 0;
      if (!(amount > 0)) continue;
      const cash = index.get("popBlock", block.id, "household-cash");
      const income = index.get("popBlock", block.id, "education-income");
      lines.push({ accountId: cash.id, side: "debit", amountRUSD: amount });
      lines.push({ accountId: income.id, side: "credit", amountRUSD: amount });
    }
    if (payable > 0) {
      const expense = index.get("country", country.id, "education-expense");
      lines.push({ accountId: expense.id, side: "debit", amountRUSD: payable });
      lines.push({ accountId: treasury.id, side: "credit", amountRUSD: payable });
      entries.push({
        transactionKind: "education-payroll",
        lines,
        sourceEntityId: country.id,
        targetEntityId: null,
      });
    }
    const shortfall = Math.max(0, requested - payable);
    accumulateBudgetMemo(stagedFinance, country.id, {
      educationRequestedRUSD: requested,
      educationShortfallRUSD: shortfall,
    });
    countryDrafts.push({
      countryId: country.id,
      requested,
      paid: payable,
      shortfall,
      blocks: eligible,
    });
  }
  postJournalBatch(stagedFinance, day, entries);
  world.finance = stagedFinance;

  const countryResults: EducationCountryResult[] = [];
  const completedTechnologyIds: Id[] = [];
  for (const country of [...world.countries].sort((left, right) => left.id - right.id)) {
    const derived = derivedByCountry.get(country.id);
    if (derived === undefined) throw new RangeError("missing education derivation");
    const draft = countryDrafts.find((entry) => entry.countryId === country.id);
    const paid = draft?.paid ?? 0;
    const requested = draft?.requested ?? 0;
    const shortfall = draft?.shortfall ?? 0;

    // Literacy gain for the school-age cohort only. The gain closes a fraction of
    // each age cell's remaining gap and is scaled by capacity-limited attendance,
    // household resources, education quality, and researched technology.
    let gainPopulation = 0;
    if (
      derived.quality > 0 &&
      derived.attendanceRate > 0 &&
      derived.fundingAdequacy > 0
    ) {
      const lawPolicy = educationLawPolicy(country, definitions);
      for (const block of countryBlocks(world, country, populationIndex)) {
        let schoolAge = 0;
        for (let age = EDUCATION_SCHOOL_AGE_MIN; age <= EDUCATION_SCHOOL_AGE_MAX; age += 1) {
          schoolAge += (block.maleByAge[age] ?? 0) + (block.femaleByAge[age] ?? 0);
        }
        if (schoolAge <= 0) continue;
        const familyAttendance = clamp(
          EDUCATION_ATTENDANCE_BASE +
            EDUCATION_ATTENDANCE_WEALTH_WEIGHT * (block.wealthLevel / 99) +
            lawPolicy.attendanceFloor,
          0,
          1,
        );
        const accessRatio =
          derived.schoolAgePopulation > 0
            ? clamp(
                derived.teachingCapacityStudents / derived.schoolAgePopulation,
                0,
                1,
              )
            : 0;
        const blockAttendance = Math.min(accessRatio, familyAttendance);
        if (blockAttendance <= 0) continue;
        for (let age = EDUCATION_SCHOOL_AGE_MIN; age <= EDUCATION_SCHOOL_AGE_MAX; age += 1) {
          const literacy = block.literacyByAge[age] ?? 0;
          if (literacy >= 1) continue;
          const gained =
            EDUCATION_DAILY_LITERACY_GAIN *
            blockAttendance *
            derived.quality *
            derived.fundingAdequacy *
            (1 - literacy);
          block.literacyByAge[age] = roundTo(
            clamp(literacy + gained, 0, 1),
            RATE_DECIMAL_PLACES,
          );
        }
        syncBlockLiteracy(block);
        gainPopulation += schoolAge;
      }
    }

    // Research work: actual assigned research staff, their literacy, institution
    // quality, and funding. Zero staff, share, or funding yields zero work.
    let researchWork = 0;
    let completedTechnologyId: Id | null = null;
    const active = country.technology.activeProject;
    if (active !== null) {
      const work =
        derived.researchStaff *
        derived.academicLiteracy *
        derived.quality *
        derived.fundingAdequacy;
      if (Number.isFinite(work) && work > 0) {
        const current = country.technology.workByTechnology[active.technologyId] ?? 0;
        country.technology.workByTechnology[active.technologyId] = current + work;
        researchWork = work;
        const definition = technologyDefinition(content, active.technologyId);
        if (definition === null) {
          throw new RangeError(
            `country ${String(country.id)} is researching unknown technology ${String(active.technologyId)}`,
          );
        }
        if ((country.technology.workByTechnology[active.technologyId] ?? 0) >= definition.researchWork) {
          delete country.technology.workByTechnology[active.technologyId];
          const researched = [
            ...country.technology.researched,
            { technologyId: active.technologyId, completedDay: day },
          ].sort((left, right) => left.technologyId - right.technologyId);
          country.technology.researched = researched;
          country.technology.activeProject = null;
          completedTechnologyId = active.technologyId;
          completedTechnologyIds.push(active.technologyId);
        }
      }
    }
    country.education = {
      ...country.education,
      fundingRequestedMonthToDateRUSD:
        country.education.fundingRequestedMonthToDateRUSD + requested,
      fundingShortfallMonthToDateRUSD:
        country.education.fundingShortfallMonthToDateRUSD + shortfall,
      lastUpdateDay: day,
    };
    countryResults.push({
      countryId: country.id,
      requestedRUSD: roundTo(requested, 6),
      paidRUSD: roundTo(paid, 6),
      shortfallRUSD: roundTo(shortfall, 6),
      researchWork: roundTo(researchWork, 6),
      completedTechnologyId,
      literacyGainPopulation: gainPopulation,
    });
  }
  const totalPaidRUSD = countryResults.reduce((total, result) => total + result.paidRUSD, 0);
  if (options.validateWorld !== false) {
    assertTechnologyStateMatchesDefinitions(world, definitions);
    assertValidTechnologyState(world);
  }
  return { dayIndex: day, countries: countryResults, totalPaidRUSD, completedTechnologyIds };
}

/** Population-weighted adult literacy of the country's academic blocks. */

/** Validate a research project start without mutating. */
export function validateResearchStart(
  world: World,
  definitions: EconomyDefinitions | undefined,
  input: { readonly countryId: Id; readonly technologyId: Id },
): void {
  if (definitions?.technology === undefined || !world.technology.enabled) {
    throw new RangeError("M9 technology is not enabled for this world");
  }
  const country = world.countries.find((entry) => entry.id === input.countryId);
  if (country === undefined) throw new RangeError(`unknown country ${String(input.countryId)}`);
  const definition = technologyDefinition(definitions.technology, input.technologyId);
  if (definition === null) {
    throw new RangeError(`unknown technology ${String(input.technologyId)}`);
  }
  if (hasResearchedTechnology(country, definition.id)) {
    throw new RangeError(`technology ${definition.key} is already researched`);
  }
  if (country.technology.activeProject !== null) {
    throw new RangeError("a research project is already active");
  }
  for (const prerequisite of definition.prerequisites) {
    if (!hasResearchedTechnology(country, prerequisite)) {
      const prerequisiteDef = technologyDefinition(definitions.technology, prerequisite);
      throw new RangeError(
        `technology ${definition.key} requires ${prerequisiteDef?.key ?? String(prerequisite)}`,
      );
    }
  }
}

/** Validate a research project cancellation without mutating. */
export function validateResearchCancel(
  world: World,
  definitions: EconomyDefinitions | undefined,
  input: { readonly countryId: Id },
): void {
  if (definitions?.technology === undefined || !world.technology.enabled) {
    throw new RangeError("M9 technology is not enabled for this world");
  }
  const country = world.countries.find((entry) => entry.id === input.countryId);
  if (country === undefined) throw new RangeError(`unknown country ${String(input.countryId)}`);
  if (country.technology.activeProject === null) {
    throw new RangeError("there is no active research project to cancel");
  }
}

/** Start one research project; accumulated work on that technology is retained. */
export function startResearch(
  world: World,
  definitions: EconomyDefinitions | undefined,
  input: { readonly countryId: Id; readonly technologyId: Id },
  day: Day,
): TechnologyDef {
  if (world.dayIndex !== day) throw new RangeError("research day must match the world day");
  validateResearchStart(world, definitions, input);
  const country = world.countries.find((entry) => entry.id === input.countryId);
  if (country === undefined) throw new RangeError(`unknown country ${String(input.countryId)}`);
  const definition = technologyDefinition(definitions?.technology, input.technologyId);
  if (definition === null) throw new RangeError(`unknown technology ${String(input.technologyId)}`);
  country.technology.activeProject = {
    technologyId: definition.id,
    startedDay: day,
  };
  return definition;
}

/** Cancel the active research project. Accumulated project work is retained. */
export function cancelResearch(
  world: World,
  definitions: EconomyDefinitions | undefined,
  input: { readonly countryId: Id },
): void {
  validateResearchCancel(world, definitions, input);
  const country = world.countries.find((entry) => entry.id === input.countryId);
  if (country === undefined) throw new RangeError(`unknown country ${String(input.countryId)}`);
  country.technology.activeProject = null;
}

/** Validate an education funding change without mutating. */
export function validateEducationFunding(
  world: World,
  definitions: EconomyDefinitions | undefined,
  input: { readonly countryId: Id; readonly annualRUSD: number },
): Country {
  if (definitions?.technology === undefined || !world.technology.enabled) {
    throw new RangeError("M9 technology is not enabled for this world");
  }
  const country = world.countries.find((entry) => entry.id === input.countryId);
  if (country === undefined) throw new RangeError(`unknown country ${String(input.countryId)}`);
  const annual = requireFiniteNumber(input.annualRUSD, "action.annualRUSD");
  if (annual < 0 || annual > MAX_EDUCATION_FUNDING_RUSD_PER_YEAR) {
    throw new RangeError("education funding is out of range");
  }
  return country;
}

/** Validate a research staff share change without mutating. */
export function validateResearchStaffShare(
  world: World,
  definitions: EconomyDefinitions | undefined,
  input: { readonly countryId: Id; readonly share: number },
): Country {
  if (definitions?.technology === undefined || !world.technology.enabled) {
    throw new RangeError("M9 technology is not enabled for this world");
  }
  const country = world.countries.find((entry) => entry.id === input.countryId);
  if (country === undefined) throw new RangeError(`unknown country ${String(input.countryId)}`);
  const share = requireFiniteNumber(input.share, "action.share");
  if (share < 0 || share > 1) throw new RangeError("action.share must be in 0..1");
  return country;
}

/** Validate a law's technology prerequisites against the country's researched set. */
export function lawTechnologyPrerequisitesMet(
  country: Country,
  requiredTechnologyIds: readonly Id[],
): boolean {
  for (const technologyId of requiredTechnologyIds) {
    if (!hasResearchedTechnology(country, technologyId)) return false;
  }
  return true;
}
