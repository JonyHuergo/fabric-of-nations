/**
 * E5 labor and social institutions (GDD §17A.9, D-078).
 *
 * The module owns:
 * - validation and creation of per-country training/health policy state;
 * - the monthly training-participation decision and the daily training phase
 *   (treasury-limited provider payroll and trainee stipend, qualification gains);
 * - derived public-health service and mortality factors;
 * - statutory labor/health readouts (minimum wage, hours factor, health floor);
 * - validated player actions for the E5 instruments.
 *
 * Training is part-time and in-service. Participants remain in their existing
 * employment/education state; the model applies a documented time cost to their
 * effective labour input, so no person is double-assigned to an incompatible role.
 * Public health is a share of the existing administration clerk base; it adds no
 * new profession, payment, or duplicate people.
 */

import { dayIndexToCivilDate, daysInYear } from "../calendar.js";
import { MONEY_TOLERANCE_SUSD, RATE_DECIMAL_PLACES } from "../population/constants.js";
import { populationTotal, workingAgePopulation } from "../population/state.js";
import type { Day, Id, MoneySUSD, Rate } from "../types.js";
import {
  requireFiniteNumber,
  requireInteger,
  requireRecord,
} from "../validation.js";
import type { World } from "../world.js";
import { buildFinanceIndex, cloneFinanceState } from "./accounts.js";
import { postJournalBatch, type JournalEntryInput } from "./accounting.js";
import { accumulateBudgetMemo } from "./budget.js";
import {
  ADMIN_FUNDING_PER_CAPITA_PER_YEAR_SUSD,
  E5_RATE_DECIMALS,
  HEALTH_MAX_MORTALITY_REDUCTION,
  HEALTH_QUALITY_FUNDING_WEIGHT,
  HEALTH_QUALITY_LITERACY_WEIGHT,
  HEALTH_QUALITY_STAFFING_WEIGHT,
  HEALTH_TARGET_STAFF_PER_CAPITA,
  LABOR_HOURS_CAPACITY_MIN,
  LABOR_HOURS_MORTALITY_IMPROVEMENT,
  LABOR_MIN_HOURS_PER_WEEK,
  LABOR_STANDARD_HOURS_PER_WEEK,
  MAX_LABOR_HOURS_PER_WEEK,
  MAX_LABOR_MINIMUM_WAGE_SUSD_PER_YEAR,
  MAX_TRAINING_BUDGET_SUSD_PER_YEAR,
  MAX_TRAINING_STIPEND_SUSD_PER_YEAR,
  MIN_COMBINED_MORTALITY_FACTOR,
  QUALIFICATION_PRODUCTIVITY_PREMIUM,
  QUALIFICATION_WAGE_PREMIUM,
  TRAINEES_PER_INSTRUCTOR,
  TRAINING_DAILY_QUALIFICATION_GAIN,
  TRAINING_INSTRUCTOR_COST_PER_YEAR_SUSD,
  TRAINING_MAX_PARTICIPATION,
  TRAINING_MIN_LITERACY,
  TRAINING_QUALITY_FUNDING_WEIGHT,
  TRAINING_QUALITY_INSTITUTION_WEIGHT,
  TRAINING_QUALITY_LITERACY_WEIGHT,
  TRAINING_TIME_SHARE,
} from "./constants.js";
import { lawDefinition } from "./politics.js";
import { deriveEducation } from "./technology.js";
import type {
  Country,
  EconomyDefinitions,
  JournalLine,
  LaborPolicyInput,
  LaborPolicyState,
  LawDef,
} from "./types.js";

function clamp(value: number, minimum: number, maximum: number): number {
  if (value < minimum) return minimum;
  if (value > maximum) return maximum;
  return value;
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function isFirstDayOfMonth(day: Day): boolean {
  return dayIndexToCivilDate(day).day === 1;
}

function countryBlocks(world: World, country: Country): World["popBlocks"] {
  const regions = new Set(country.regionIds);
  return world.popBlocks.filter((block) => regions.has(block.regionId));
}

function lawInSlot(
  country: Country,
  definitions: EconomyDefinitions | undefined,
  slot: "labor" | "health",
): LawDef | null {
  const politics = definitions?.politics;
  if (politics === undefined) return null;
  return lawDefinition(politics, country.laws[slot]);
}

/** Neutral E5 policy for worlds without labor/health inputs. */
export function neutralLaborPolicyState(): LaborPolicyState {
  return {
    trainingBudgetSUSDPerYear: 0,
    trainingStipendPerTraineeSUSDPerYear: 0,
    trainingStaffShare: 0,
    trainingParticipation: 0,
    lastUpdateDay: null,
    trainingRequestedMonthToDateSUSD: 0,
    trainingShortfallMonthToDateSUSD: 0,
  };
}

/** Validate one country's E5 scenario input. */
export function assertValidLaborPolicyInput(
  input: LaborPolicyInput | undefined,
  path: string,
): void {
  if (input === undefined) return;
  const record = requireRecord(input, path);
  if (record.trainingBudgetSUSDPerYear !== undefined) {
    const value = requireFiniteNumber(
      record.trainingBudgetSUSDPerYear,
      `${path}.trainingBudgetSUSDPerYear`,
    );
    if (value < 0 || value > MAX_TRAINING_BUDGET_SUSD_PER_YEAR) {
      throw new RangeError(`${path}.trainingBudgetSUSDPerYear is out of range`);
    }
  }
  if (record.trainingStipendPerTraineeSUSDPerYear !== undefined) {
    const value = requireFiniteNumber(
      record.trainingStipendPerTraineeSUSDPerYear,
      `${path}.trainingStipendPerTraineeSUSDPerYear`,
    );
    if (value < 0 || value > MAX_TRAINING_STIPEND_SUSD_PER_YEAR) {
      throw new RangeError(
        `${path}.trainingStipendPerTraineeSUSDPerYear is out of range`,
      );
    }
  }
  if (record.trainingStaffShare !== undefined) {
    const value = requireFiniteNumber(
      record.trainingStaffShare,
      `${path}.trainingStaffShare`,
    );
    if (value < 0 || value > 1) {
      throw new RangeError(`${path}.trainingStaffShare must be in 0..1`);
    }
  }
  if (record.healthStaffShare !== undefined) {
    const value = requireFiniteNumber(
      record.healthStaffShare,
      `${path}.healthStaffShare`,
    );
    if (value < 0 || value > 1) {
      throw new RangeError(`${path}.healthStaffShare must be in 0..1`);
    }
  }
}

/** Build the initial E5 policy state for one country. */
export function createLaborPolicyState(
  input: LaborPolicyInput | undefined,
  path: string,
): { labor: LaborPolicyState; healthStaffShare: Rate } {
  assertValidLaborPolicyInput(input, path);
  const labor = neutralLaborPolicyState();
  labor.trainingBudgetSUSDPerYear = input?.trainingBudgetSUSDPerYear ?? 0;
  labor.trainingStipendPerTraineeSUSDPerYear =
    input?.trainingStipendPerTraineeSUSDPerYear ?? 0;
  labor.trainingStaffShare = input?.trainingStaffShare ?? 0;
  return { labor, healthStaffShare: input?.healthStaffShare ?? 0 };
}

/** Structural validation for one country's E5 policy state. */
export function assertValidLaborPolicyState(
  state: LaborPolicyState,
  path: string,
  dayIndex: Day,
): void {
  const record = requireRecord(state, path);
  const budget = requireFiniteNumber(
    record.trainingBudgetSUSDPerYear,
    `${path}.trainingBudgetSUSDPerYear`,
  );
  if (budget < 0 || budget > MAX_TRAINING_BUDGET_SUSD_PER_YEAR) {
    throw new RangeError(`${path}.trainingBudgetSUSDPerYear is out of range`);
  }
  const stipend = requireFiniteNumber(
    record.trainingStipendPerTraineeSUSDPerYear,
    `${path}.trainingStipendPerTraineeSUSDPerYear`,
  );
  if (stipend < 0 || stipend > MAX_TRAINING_STIPEND_SUSD_PER_YEAR) {
    throw new RangeError(`${path}.trainingStipendPerTraineeSUSDPerYear is out of range`);
  }
  const share = requireFiniteNumber(record.trainingStaffShare, `${path}.trainingStaffShare`);
  if (share < 0 || share > 1) {
    throw new RangeError(`${path}.trainingStaffShare must be in 0..1`);
  }
  const participation = requireFiniteNumber(
    record.trainingParticipation,
    `${path}.trainingParticipation`,
  );
  if (participation < 0 || participation > 1) {
    throw new RangeError(`${path}.trainingParticipation must be in 0..1`);
  }
  if (record.lastUpdateDay !== null) {
    requireInteger(record.lastUpdateDay, `${path}.lastUpdateDay`, 0, dayIndex);
  }
  const requested = requireFiniteNumber(
    record.trainingRequestedMonthToDateSUSD,
    `${path}.trainingRequestedMonthToDateSUSD`,
  );
  const shortfall = requireFiniteNumber(
    record.trainingShortfallMonthToDateSUSD,
    `${path}.trainingShortfallMonthToDateSUSD`,
  );
  if (requested < 0 || shortfall < 0) {
    throw new RangeError(`${path} training memo must be non-negative`);
  }
  if (shortfall > requested + MONEY_TOLERANCE_SUSD * Math.max(1, requested)) {
    throw new RangeError(`${path}.trainingShortfallMonthToDateSUSD must not exceed the request`);
  }
}

/** Statutory minimum-wage floor for a country, or 0 when none applies. */
export function laborMinimumWageSUSDPerYear(
  country: Country,
  definitions: EconomyDefinitions | undefined,
): MoneySUSD {
  const law = lawInSlot(country, definitions, "labor");
  if (law === null) return 0;
  return clamp(law.laborMinimumWageSUSDPerYear, 0, MAX_LABOR_MINIMUM_WAGE_SUSD_PER_YEAR);
}

/**
 * Effective hours factor for capacity and wages. The provisional 60-hour week is
 * the baseline; a statutory shorter week scales both proportionally.
 */
export function laborHoursFactor(
  country: Country,
  definitions: EconomyDefinitions | undefined,
): Rate {
  const law = lawInSlot(country, definitions, "labor");
  if (law === null || !(law.laborHoursPerWeek > 0)) return 1;
  const hours = clamp(
    law.laborHoursPerWeek,
    LABOR_MIN_HOURS_PER_WEEK,
    MAX_LABOR_HOURS_PER_WEEK,
  );
  return clamp(hours / LABOR_STANDARD_HOURS_PER_WEEK, LABOR_HOURS_CAPACITY_MIN, 1);
}

/** Mortality factor from a shorter statutory week, bounded and one-directional. */
export function laborHoursMortalityFactor(
  country: Country,
  definitions: EconomyDefinitions | undefined,
): Rate {
  const factor = laborHoursFactor(country, definitions);
  return 1 - LABOR_HOURS_MORTALITY_IMPROVEMENT * (1 - factor);
}

/** Enacted health-law minimum staff share, or 0. */
export function healthStaffFloor(
  country: Country,
  definitions: EconomyDefinitions | undefined,
): Rate {
  const law = lawInSlot(country, definitions, "health");
  if (law === null) return 0;
  return clamp(law.healthStaffFloor, 0, 1);
}

/** Derived public-health service from the existing administration clerk base. */
export interface HealthDerived {
  readonly countryId: Id;
  readonly clerkPopulation: number;
  readonly healthStaff: number;
  readonly administrationStaff: number;
  readonly staffingRatio: Rate;
  readonly fundingRatio: Rate;
  readonly quality: Rate;
  readonly serviceOutputIndex: number;
  readonly mortalityFactor: Rate;
  readonly staffShare: Rate;
}

function administrationKeys(
  definitions: EconomyDefinitions | undefined,
): ReadonlySet<string> {
  return new Set(definitions?.politics?.administrationProfessionKeys ?? []);
}

/** Recompute one country's public-health service from authoritative state. */
export function deriveHealth(
  world: World,
  country: Country,
  definitions: EconomyDefinitions | undefined,
): HealthDerived {
  const share = clamp(country.institutions.healthStaffShare ?? 0, 0, 1);
  const keys = administrationKeys(definitions);
  const professionById = new Map(
    (definitions?.professions ?? []).map((profession) => [profession.id, profession]),
  );
  let clerkPopulation = 0;
  let population = 0;
  let literacyWeighted = 0;
  for (const block of countryBlocks(world, country)) {
    const count = populationTotal(block);
    population += count;
    literacyWeighted += block.literacy * count;
    const profession = professionById.get(block.professionId);
    if (profession !== undefined && keys.has(profession.key)) clerkPopulation += count;
  }
  const healthStaff = clerkPopulation * share;
  const administrationStaff = clerkPopulation - healthStaff;
  const staffingRatio =
    population > 0
      ? clamp(healthStaff / population / HEALTH_TARGET_STAFF_PER_CAPITA, 0, 1)
      : 0;
  const fundingBenchmark = population * ADMIN_FUNDING_PER_CAPITA_PER_YEAR_SUSD;
  const fundingRatio =
    fundingBenchmark > 0
      ? clamp(country.institutions.fundedAnnualSUSD / fundingBenchmark, 0, 1)
      : 0;
  const literacy = population > 0 ? literacyWeighted / population : 0;
  const quality = clamp(
    HEALTH_QUALITY_STAFFING_WEIGHT * staffingRatio +
      HEALTH_QUALITY_FUNDING_WEIGHT * fundingRatio +
      HEALTH_QUALITY_LITERACY_WEIGHT * literacy,
    0,
    1,
  );
  const serviceOutputIndex = quality * staffingRatio;
  const mortalityFactor = clamp(
    1 - HEALTH_MAX_MORTALITY_REDUCTION * serviceOutputIndex,
    1 - HEALTH_MAX_MORTALITY_REDUCTION,
    1,
  );
  return {
    countryId: country.id,
    clerkPopulation,
    healthStaff: roundTo(healthStaff, E5_RATE_DECIMALS),
    administrationStaff: roundTo(administrationStaff, E5_RATE_DECIMALS),
    staffingRatio: roundTo(staffingRatio, E5_RATE_DECIMALS),
    fundingRatio: roundTo(fundingRatio, E5_RATE_DECIMALS),
    quality: roundTo(quality, E5_RATE_DECIMALS),
    serviceOutputIndex: roundTo(serviceOutputIndex, E5_RATE_DECIMALS),
    mortalityFactor,
    staffShare: roundTo(share, E5_RATE_DECIMALS),
  };
}

/** One eligible block for training and its working-age population. */
interface TrainingEligibleBlock {
  readonly block: World["popBlocks"][number];
  readonly workingAge: number;
}

function trainingEligibleBlocks(
  world: World,
  country: Country,
): TrainingEligibleBlock[] {
  const result: TrainingEligibleBlock[] = [];
  for (const block of countryBlocks(world, country)) {
    const workingAge = workingAgePopulation(block);
    if (workingAge <= 0) continue;
    if (block.literacy < TRAINING_MIN_LITERACY) continue;
    result.push({ block, workingAge });
  }
  return result;
}

/** Derived training service capacity and participation. */
export interface TrainingDerived {
  readonly countryId: Id;
  readonly instructors: number;
  readonly eligibleWorkingAge: number;
  readonly capacityTrainees: number;
  readonly participation: Rate;
  readonly trainees: number;
  readonly academicLiteracy: Rate;
  readonly institutionQuality: Rate;
}

/** Recompute one country's training capacity from authoritative state. */
export function deriveTraining(
  world: World,
  country: Country,
  definitions: EconomyDefinitions | undefined,
): TrainingDerived {
  const education = deriveEducation(world, country, definitions);
  const eligible = trainingEligibleBlocks(world, country);
  const eligibleWorkingAge = eligible.reduce((total, entry) => total + entry.workingAge, 0);
  const instructors = Math.max(0, education.trainingStaff);
  const capacityTrainees = Math.floor(instructors * TRAINEES_PER_INSTRUCTOR);
  const labor = country.labor ?? neutralLaborPolicyState();
  const funded = labor.trainingBudgetSUSDPerYear > 0;
  const rawParticipation =
    funded && instructors > 0 && eligibleWorkingAge > 0
      ? clamp(
          capacityTrainees / eligibleWorkingAge,
          0,
          TRAINING_MAX_PARTICIPATION,
        )
      : 0;
  const participation = roundTo(rawParticipation, E5_RATE_DECIMALS);
  return {
    countryId: country.id,
    instructors: roundTo(instructors, E5_RATE_DECIMALS),
    eligibleWorkingAge,
    capacityTrainees,
    participation,
    trainees: participation * eligibleWorkingAge,
    academicLiteracy: education.academicLiteracy,
    institutionQuality: country.institutions.quality,
  };
}

/** One country's training-phase result. */
export interface TrainingCountryResult {
  readonly countryId: Id;
  readonly instructors: number;
  readonly trainees: number;
  readonly requestedSUSD: number;
  readonly paidSUSD: number;
  readonly shortfallSUSD: number;
  readonly payrollPaidSUSD: number;
  readonly stipendPaidSUSD: number;
  readonly quality: Rate;
  readonly qualifiedBlocks: number;
}

/** Daily E5 training-phase result. */
export interface TrainingPhaseResult {
  readonly dayIndex: Day;
  readonly countries: readonly TrainingCountryResult[];
  readonly totalPaidSUSD: number;
  readonly totalRequestedSUSD: number;
}

function allocateExact(
  amount: number,
  entries: readonly { id: Id; weight: number }[],
): Map<Id, number> {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  const allocations = new Map<Id, number>();
  if (!(amount > 0) || total <= 0) return allocations;
  let remaining = amount;
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (entry === undefined) continue;
    const share =
      index === entries.length - 1 ? remaining : (amount * entry.weight) / total;
    if (share > 0) allocations.set(entry.id, share);
    remaining -= share;
  }
  return allocations;
}

/**
 * Monthly E5 labor decision. Runs on the first civil day (and the scenario start
 * day), sets training participation from real instructors/funding/eligibility, and
 * resets the month-to-date training memo. No other phase mutates participation.
 */
export function runLaborMonthStart(
  world: World,
  definitions: EconomyDefinitions | undefined,
  day: Day,
): void {
  if (day !== world.startDayIndex && !isFirstDayOfMonth(day)) return;
  for (const country of [...world.countries].sort((left, right) => left.id - right.id)) {
    const derived = deriveTraining(world, country, definitions);
    country.labor = {
      ...neutralLaborPolicyState(),
      ...country.labor,
      trainingParticipation: derived.participation,
      trainingRequestedMonthToDateSUSD: 0,
      trainingShortfallMonthToDateSUSD: 0,
      lastUpdateDay: day,
    };
  }
}

/**
 * Daily E5 training phase: treasury-limited provider payroll and trainee stipend,
 * then qualification gains for participating blocks. Applies once per processed
 * day; the caller publishes only after full validation.
 */
export function runTrainingPhase(
  world: World,
  definitions: EconomyDefinitions | undefined,
  day: Day,
): TrainingPhaseResult {
  if (definitions === undefined) {
    return { dayIndex: day, countries: [], totalPaidSUSD: 0, totalRequestedSUSD: 0 };
  }
  const yearDays = daysInYear(dayIndexToCivilDate(day).year);
  const derivedByCountry = new Map<Id, TrainingDerived>();
  for (const country of [...world.countries].sort((left, right) => left.id - right.id)) {
    derivedByCountry.set(country.id, deriveTraining(world, country, definitions));
  }
  const stagedFinance = cloneFinanceState(world.finance);
  const index = buildFinanceIndex(stagedFinance);
  const entries: JournalEntryInput[] = [];
  const drafts: {
    country: Country;
    derived: TrainingDerived;
    requested: number;
    paid: number;
    payrollPaid: number;
    stipendPaid: number;
    quality: number;
    eligible: TrainingEligibleBlock[];
  }[] = [];
  const academicProfessionKeys = new Set(
    definitions.technology?.academicProfessionKeys ?? [],
  );
  const professionById = new Map(
    definitions.professions.map((profession) => [profession.id, profession]),
  );

  for (const country of [...world.countries].sort((left, right) => left.id - right.id)) {
    const derived = derivedByCountry.get(country.id);
    if (derived === undefined) throw new RangeError("missing training derivation");
    if (!(derived.participation > 0)) continue;
    const labor = country.labor ?? neutralLaborPolicyState();
    const eligible = trainingEligibleBlocks(world, country);
    const requestedPayroll = labor.trainingBudgetSUSDPerYear / yearDays;
    const requestedStipend =
      (labor.trainingStipendPerTraineeSUSDPerYear * derived.trainees) / yearDays;
    const requested = requestedPayroll + requestedStipend;
    if (!(requested > 0)) continue;
    const treasury = index.get("country", country.id, "treasury-cash");
    const ceiling = Math.max(0, treasury.balanceSUSD - country.fiscal.reserveTargetSUSD);
    const paid = Math.min(requested, ceiling);
    const scale = requested > 0 ? paid / requested : 0;
    const payrollPaid = requestedPayroll * scale;
    const stipendPaid = requestedStipend * scale;

    if (payrollPaid > 0) {
      const academicBlocks = countryBlocks(world, country)
        .filter(
          (block) =>
            populationTotal(block) > 0 &&
            academicProfessionKeys.has(professionById.get(block.professionId)?.key ?? ""),
        )
        .map((block) => ({ id: block.id, weight: populationTotal(block) }));
      const allocations = allocateExact(payrollPaid, academicBlocks);
      const lines: JournalLine[] = [];
      for (const block of academicBlocks) {
        const amount = allocations.get(block.id) ?? 0;
        if (!(amount > 0)) continue;
        lines.push({
          accountId: index.get("popBlock", block.id, "household-cash").id,
          side: "debit",
          amountSUSD: amount,
        });
        lines.push({
          accountId: index.get("popBlock", block.id, "training-income").id,
          side: "credit",
          amountSUSD: amount,
        });
      }
      if (lines.length > 0) {
        lines.push({
          accountId: index.get("country", country.id, "training-expense").id,
          side: "debit",
          amountSUSD: payrollPaid,
        });
        lines.push({
          accountId: treasury.id,
          side: "credit",
          amountSUSD: payrollPaid,
        });
        entries.push({
          transactionKind: "training-payroll",
          lines,
          sourceEntityId: country.id,
          targetEntityId: null,
        });
      }
    }

    if (stipendPaid > 0) {
      const allocations = allocateExact(
        stipendPaid,
        eligible.map((entry) => ({ id: entry.block.id, weight: entry.workingAge })),
      );
      const lines: JournalLine[] = [];
      for (const entry of eligible) {
        const amount = allocations.get(entry.block.id) ?? 0;
        if (!(amount > 0)) continue;
        lines.push({
          accountId: index.get("popBlock", entry.block.id, "household-cash").id,
          side: "debit",
          amountSUSD: amount,
        });
        lines.push({
          accountId: index.get("popBlock", entry.block.id, "training-income").id,
          side: "credit",
          amountSUSD: amount,
        });
      }
      if (lines.length > 0) {
        lines.push({
          accountId: index.get("country", country.id, "training-expense").id,
          side: "debit",
          amountSUSD: stipendPaid,
        });
        lines.push({
          accountId: treasury.id,
          side: "credit",
          amountSUSD: stipendPaid,
        });
        entries.push({
          transactionKind: "training-stipend",
          lines,
          sourceEntityId: country.id,
          targetEntityId: null,
        });
      }
    }

    const shortfall = Math.max(0, requested - paid);
    accumulateBudgetMemo(stagedFinance, country.id, {
      trainingRequestedSUSD: requested,
      trainingShortfallSUSD: shortfall,
    });
    const instructorBenchmark =
      derived.instructors * TRAINING_INSTRUCTOR_COST_PER_YEAR_SUSD;
    const fundingAdequacy =
      instructorBenchmark > 0 ? clamp(payrollPaid / instructorBenchmark, 0, 1) : 0;
    const quality = clamp(
      TRAINING_QUALITY_FUNDING_WEIGHT * fundingAdequacy +
        TRAINING_QUALITY_LITERACY_WEIGHT * derived.academicLiteracy +
        TRAINING_QUALITY_INSTITUTION_WEIGHT * derived.institutionQuality,
      0,
      1,
    );
    drafts.push({
      country,
      derived,
      requested,
      paid,
      payrollPaid,
      stipendPaid,
      quality,
      eligible,
    });
  }
  postJournalBatch(stagedFinance, day, entries);
  world.finance = stagedFinance;

  const results: TrainingCountryResult[] = [];
  for (const draft of drafts) {
    let qualifiedBlocks = 0;
    if (draft.payrollPaid > 0 && draft.quality > 0) {
      for (const entry of draft.eligible) {
        const block = entry.block;
        if (block.literacy < TRAINING_MIN_LITERACY) continue;
        const gap = Math.max(0, 1 - block.qualification);
        if (gap <= 0) continue;
        const gain =
          TRAINING_DAILY_QUALIFICATION_GAIN *
          draft.derived.participation *
          draft.quality *
          // Funding adequacy gates the service: a nominally staffed but unfunded
          // program cannot produce qualification gains.
          (draft.payrollPaid / Math.max(1e-12, draft.derived.instructors * TRAINING_INSTRUCTOR_COST_PER_YEAR_SUSD)) *
          gap;
        if (gain <= 0) continue;
        block.qualification = roundTo(
          clamp(block.qualification + gain, 0, 1),
          RATE_DECIMAL_PLACES,
        );
        qualifiedBlocks += 1;
      }
    }
    draft.country.labor = {
      ...neutralLaborPolicyState(),
      ...draft.country.labor,
      trainingRequestedMonthToDateSUSD:
        draft.country.labor.trainingRequestedMonthToDateSUSD + draft.requested,
      trainingShortfallMonthToDateSUSD:
        draft.country.labor.trainingShortfallMonthToDateSUSD +
        Math.max(0, draft.requested - draft.paid),
      lastUpdateDay: day,
    };
    results.push({
      countryId: draft.country.id,
      instructors: draft.derived.instructors,
      trainees: roundTo(draft.derived.trainees, 2),
      requestedSUSD: roundTo(draft.requested, 6),
      paidSUSD: roundTo(draft.paid, 6),
      shortfallSUSD: roundTo(Math.max(0, draft.requested - draft.paid), 6),
      payrollPaidSUSD: roundTo(draft.payrollPaid, 6),
      stipendPaidSUSD: roundTo(draft.stipendPaid, 6),
      quality: roundTo(draft.quality, E5_RATE_DECIMALS),
      qualifiedBlocks,
    });
  }
  const totalPaidSUSD = results.reduce((total, result) => total + result.paidSUSD, 0);
  const totalRequestedSUSD = results.reduce(
    (total, result) => total + result.requestedSUSD,
    0,
  );
  return { dayIndex: day, countries: results, totalPaidSUSD, totalRequestedSUSD };
}

/** Qualification wage multiplier for one block. */
export function qualificationWageFactor(block: World["popBlocks"][number]): number {
  return 1 + QUALIFICATION_WAGE_PREMIUM * clamp(block.qualification, 0, 1);
}

/**
 * Qualification productivity multiplier and training-time cost for one assigned
 * block. Training is part-time; participants remain employed but contribute less
 * effective labour.
 */
export function qualificationProductivityFactor(
  block: World["popBlocks"][number],
  trainingParticipation: Rate,
): number {
  const qualification = 1 + QUALIFICATION_PRODUCTIVITY_PREMIUM * clamp(block.qualification, 0, 1);
  const timeCost =
    block.literacy >= TRAINING_MIN_LITERACY
      ? 1 - TRAINING_TIME_SHARE * clamp(trainingParticipation, 0, 1)
      : 1;
  return qualification * timeCost;
}

/** Combined mortality factor from technology, public health, and labor standards. */
export function combinedMortalityFactor(
  technologyFactor: number,
  healthFactor: number,
  hoursFactor: number,
): number {
  return clamp(
    technologyFactor * healthFactor * hoursFactor,
    MIN_COMBINED_MORTALITY_FACTOR,
    1,
  );
}

function countryForAction(world: World, countryId: Id): Country {
  const country = world.countries.find((entry) => entry.id === countryId);
  if (country === undefined) throw new RangeError(`unknown country ${String(countryId)}`);
  return country;
}

/** Validate a training-budget change without mutating. */
export function validateTrainingBudget(
  world: World,
  definitions: EconomyDefinitions | undefined,
  input: { readonly countryId: Id; readonly annualSUSD: number },
): Country {
  void definitions;
  const country = countryForAction(world, input.countryId);
  const annual = requireFiniteNumber(input.annualSUSD, "action.annualSUSD");
  if (annual < 0 || annual > MAX_TRAINING_BUDGET_SUSD_PER_YEAR) {
    throw new RangeError("training budget is out of range");
  }
  return country;
}

/** Validate a training-stipend change without mutating. */
export function validateTrainingStipend(
  world: World,
  definitions: EconomyDefinitions | undefined,
  input: { readonly countryId: Id; readonly annualSUSD: number },
): Country {
  void definitions;
  const country = countryForAction(world, input.countryId);
  const annual = requireFiniteNumber(input.annualSUSD, "action.annualSUSD");
  if (annual < 0 || annual > MAX_TRAINING_STIPEND_SUSD_PER_YEAR) {
    throw new RangeError("training stipend is out of range");
  }
  return country;
}

/** Validate a training staff-share change without mutating. */
export function validateTrainingStaffShare(
  world: World,
  definitions: EconomyDefinitions | undefined,
  input: { readonly countryId: Id; readonly share: number },
): Country {
  void definitions;
  const country = countryForAction(world, input.countryId);
  const share = requireFiniteNumber(input.share, "action.share");
  if (share < 0 || share > 1) throw new RangeError("action.share must be in 0..1");
  if (share + country.education.researchStaffShare > 1 + 1e-9) {
    throw new RangeError(
      "academic research and training staff shares must not exceed 1",
    );
  }
  return country;
}

/** Validate a public-health staff-share change without mutating. */
export function validateHealthStaffShare(
  world: World,
  definitions: EconomyDefinitions | undefined,
  input: { readonly countryId: Id; readonly share: number },
): Country {
  const country = countryForAction(world, input.countryId);
  const share = requireFiniteNumber(input.share, "action.share");
  if (share < 0 || share > 1) throw new RangeError("action.share must be in 0..1");
  const floor = healthStaffFloor(country, definitions);
  if (share + 1e-9 < floor) {
    throw new RangeError(
      `the enacted health law requires a staff share of at least ${String(floor)}`,
    );
  }
  return country;
}

/** Structural check for the health staff share. */
export function assertValidHealthStaffShare(share: Rate, path: string): void {
  const value = requireFiniteNumber(share, path);
  if (value < 0 || value > 1) throw new RangeError(`${path} must be in 0..1`);
}

/** Training phase diagnostic helper for tests: eligible working-age total. */
export function trainingEligibleWorkingAge(
  world: World,
  country: Country,
): number {
  return trainingEligibleBlocks(world, country).reduce(
    (total, entry) => total + entry.workingAge,
    0,
  );
}
