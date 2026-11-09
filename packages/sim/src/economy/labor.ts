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

import { buildLabourWageTable, institutionPayroll, institutionStaff } from "./labourMarket.js";
import { healthStaffFloor, laborHoursFactor } from "./labourLaws.js";
export { healthStaffFloor, laborHoursFactor, laborMinimumWageRUSDPerYear } from "./labourLaws.js";
import { dayIndexToCivilDate, daysInYear } from "../calendar.js";
import { MONEY_TOLERANCE_RUSD, RATE_DECIMAL_PLACES } from "../population/constants.js";
import { populationTotal, workingAgePopulation } from "../population/state.js";
import { localWageIndex } from "./localWages.js";
import type { Day, Id, Rate } from "../types.js";
import {
  requireFiniteNumber,
  requireInteger,
  requireRecord,
} from "../validation.js";
import type { World } from "../world.js";
import { buildFinanceIndex, phaseFinance } from "./accounts.js";
import { postJournalBatch, type JournalEntryInput } from "./accounting.js";
import { accumulateBudgetMemo } from "./budget.js";
import {
  E5_RATE_DECIMALS,
  HEALTH_MAX_MORTALITY_REDUCTION,
  HEALTH_QUALITY_FUNDING_WEIGHT,
  HEALTH_QUALITY_LITERACY_WEIGHT,
  HEALTH_QUALITY_STAFFING_WEIGHT,
  HEALTH_TARGET_STAFF_PER_CAPITA,
  LABOR_HOURS_MORTALITY_IMPROVEMENT,
  MAX_TRAINING_BUDGET_RUSD_PER_YEAR,
  MAX_TRAINING_STIPEND_RUSD_PER_YEAR,
  MIN_COMBINED_MORTALITY_FACTOR,
  QUALIFICATION_PRODUCTIVITY_PREMIUM,
  QUALIFICATION_WAGE_PREMIUM,
  TRAINEES_PER_INSTRUCTOR,
  TRAINING_DAILY_QUALIFICATION_GAIN,
  TRAINING_MAX_PARTICIPATION,
  TRAINING_MIN_LITERACY,
  TRAINING_QUALITY_FUNDING_WEIGHT,
  TRAINING_QUALITY_INSTITUTION_WEIGHT,
  TRAINING_QUALITY_LITERACY_WEIGHT,
  TRAINING_TIME_SHARE,
} from "./constants.js";
import { deriveEducation } from "./technology.js";
import type {
  Country,
  EconomyDefinitions,
  JournalLine,
  LaborPolicyInput,
  LaborPolicyState,
} from "./types.js";
import {
  buildCountryPopulationIndex,
  countryPopBlocks,
  type CountryPopulationIndex,
} from "./country.js";

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

function countryBlocks(
  world: World,
  country: Country,
  index?: CountryPopulationIndex,
): readonly World["popBlocks"][number][] {
  return countryPopBlocks(world, country.id, index);
}


/** Neutral E5 policy for worlds without labor/health inputs. */
export function neutralLaborPolicyState(): LaborPolicyState {
  return {
    trainingBudgetRUSDPerYear: 0,
    trainingStipendPerTraineeRUSDPerYear: 0,
    trainingStaffShare: 0,
    trainingParticipation: 0,
    lastUpdateDay: null,
    trainingRequestedMonthToDateRUSD: 0,
    trainingShortfallMonthToDateRUSD: 0,
  };
}

/** Validate one country's E5 scenario input. */
export function assertValidLaborPolicyInput(
  input: LaborPolicyInput | undefined,
  path: string,
): void {
  if (input === undefined) return;
  const record = requireRecord(input, path);
  if (record.trainingBudgetRUSDPerYear !== undefined) {
    const value = requireFiniteNumber(
      record.trainingBudgetRUSDPerYear,
      `${path}.trainingBudgetRUSDPerYear`,
    );
    if (value < 0 || value > MAX_TRAINING_BUDGET_RUSD_PER_YEAR) {
      throw new RangeError(`${path}.trainingBudgetRUSDPerYear is out of range`);
    }
  }
  if (record.trainingStipendPerTraineeRUSDPerYear !== undefined) {
    const value = requireFiniteNumber(
      record.trainingStipendPerTraineeRUSDPerYear,
      `${path}.trainingStipendPerTraineeRUSDPerYear`,
    );
    if (value < 0 || value > MAX_TRAINING_STIPEND_RUSD_PER_YEAR) {
      throw new RangeError(
        `${path}.trainingStipendPerTraineeRUSDPerYear is out of range`,
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
  labor.trainingBudgetRUSDPerYear = input?.trainingBudgetRUSDPerYear ?? 0;
  labor.trainingStipendPerTraineeRUSDPerYear =
    input?.trainingStipendPerTraineeRUSDPerYear ?? 0;
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
    record.trainingBudgetRUSDPerYear,
    `${path}.trainingBudgetRUSDPerYear`,
  );
  if (budget < 0 || budget > MAX_TRAINING_BUDGET_RUSD_PER_YEAR) {
    throw new RangeError(`${path}.trainingBudgetRUSDPerYear is out of range`);
  }
  const stipend = requireFiniteNumber(
    record.trainingStipendPerTraineeRUSDPerYear,
    `${path}.trainingStipendPerTraineeRUSDPerYear`,
  );
  if (stipend < 0 || stipend > MAX_TRAINING_STIPEND_RUSD_PER_YEAR) {
    throw new RangeError(`${path}.trainingStipendPerTraineeRUSDPerYear is out of range`);
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
    record.trainingRequestedMonthToDateRUSD,
    `${path}.trainingRequestedMonthToDateRUSD`,
  );
  const shortfall = requireFiniteNumber(
    record.trainingShortfallMonthToDateRUSD,
    `${path}.trainingShortfallMonthToDateRUSD`,
  );
  if (requested < 0 || shortfall < 0) {
    throw new RangeError(`${path} training memo must be non-negative`);
  }
  if (shortfall > requested + MONEY_TOLERANCE_RUSD * Math.max(1, requested)) {
    throw new RangeError(`${path}.trainingShortfallMonthToDateRUSD must not exceed the request`);
  }
}



/** Mortality factor from a shorter statutory week, bounded and one-directional. */
export function laborHoursMortalityFactor(
  country: Country,
  definitions: EconomyDefinitions | undefined,
): Rate {
  const factor = laborHoursFactor(country, definitions);
  return 1 - LABOR_HOURS_MORTALITY_IMPROVEMENT * (1 - factor);
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
  /** Shared per-phase lookups (D-137); built from `world` when omitted. */
  populationIndex?: CountryPopulationIndex,
): HealthDerived {
  const share = clamp(country.institutions.healthStaffShare ?? 0, 0, 1);
  const keys = administrationKeys(definitions);
  const professionById = new Map(
    (definitions?.professions ?? []).map((profession) => [profession.id, profession]),
  );
  let clerkPopulation = 0;
  let population = 0;
  let literacyWeighted = 0;
  const blocks = countryBlocks(world, country, populationIndex);
  for (const block of blocks) {
    const count = populationTotal(block);
    population += count;
    literacyWeighted += block.literacy * count;
    const profession = professionById.get(block.professionId);
    if (profession !== undefined && keys.has(profession.key)) clerkPopulation += count;
  }
  let healthStaff = clerkPopulation * share;
  let administrationStaff = clerkPopulation - healthStaff;
  // P7 (D-154, plan Q3): in a labour-market world the health service's staff are the
  // medics it employs and the administration's the bureaucrats it employs.
  if (world.labourMarket.enabled) {
    healthStaff = institutionStaff(world, country.id, "health");
    administrationStaff = institutionStaff(world, country.id, "administration");
    clerkPopulation = healthStaff + administrationStaff;
  }
  const staffingRatio =
    population > 0
      ? clamp(healthStaff / population / HEALTH_TARGET_STAFF_PER_CAPITA, 0, 1)
      : 0;
  // P2b: administration is staffed at the country's own clerk wages (D-135).
  const fundingBenchmark =
    population *
    world.moneyCoefficients.adminFundingPerCapitaPerYearRUSD *
    localWageIndex(world, blocks, definitions, keys, populationIndex?.wagesByProvince);
  const fundingRatio =
    fundingBenchmark > 0
      ? clamp(country.institutions.fundedAnnualRUSD / fundingBenchmark, 0, 1)
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
  index?: CountryPopulationIndex,
): TrainingEligibleBlock[] {
  const result: TrainingEligibleBlock[] = [];
  for (const block of countryBlocks(world, country, index)) {
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
  /** Shared per-phase lookups (D-137); built from `world` when omitted. */
  populationIndex?: CountryPopulationIndex,
): TrainingDerived {
  const index = populationIndex ?? buildCountryPopulationIndex(world);
  const education = deriveEducation(world, country, definitions, index);
  const eligible = trainingEligibleBlocks(world, country, index);
  const eligibleWorkingAge = eligible.reduce((total, entry) => total + entry.workingAge, 0);
  const instructors = Math.max(0, education.trainingStaff);
  const capacityTrainees = Math.floor(instructors * TRAINEES_PER_INSTRUCTOR);
  const labor = country.labor ?? neutralLaborPolicyState();
  const funded = labor.trainingBudgetRUSDPerYear > 0;
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
  readonly requestedRUSD: number;
  readonly paidRUSD: number;
  readonly shortfallRUSD: number;
  readonly payrollPaidRUSD: number;
  readonly stipendPaidRUSD: number;
  readonly quality: Rate;
  readonly qualifiedBlocks: number;
}

/** Daily E5 training-phase result. */
export interface TrainingPhaseResult {
  readonly dayIndex: Day;
  readonly countries: readonly TrainingCountryResult[];
  readonly totalPaidRUSD: number;
  readonly totalRequestedRUSD: number;
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
  // D-137: the loop writes only `country.labor`, which the lookups do not read.
  const populationIndex = buildCountryPopulationIndex(world);
  for (const country of [...world.countries].sort((left, right) => left.id - right.id)) {
    const derived = deriveTraining(world, country, definitions, populationIndex);
    country.labor = {
      ...neutralLaborPolicyState(),
      ...country.labor,
      trainingParticipation: derived.participation,
      trainingRequestedMonthToDateRUSD: 0,
      trainingShortfallMonthToDateRUSD: 0,
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
  options: { readonly financeInPlace?: boolean } = {},
): TrainingPhaseResult {
  if (definitions === undefined) {
    return { dayIndex: day, countries: [], totalPaidRUSD: 0, totalRequestedRUSD: 0 };
  }
  const yearDays = daysInYear(dayIndexToCivilDate(day).year);
  // D-137: one set of country lookups for the phase; the payroll changes balances and
  // the qualification gains below change `qualification`, neither of which they read.
  const populationIndex = buildCountryPopulationIndex(world);
  const derivedByCountry = new Map<Id, TrainingDerived>();
  for (const country of [...world.countries].sort((left, right) => left.id - right.id)) {
    derivedByCountry.set(country.id, deriveTraining(world, country, definitions, populationIndex));
  }
  const stagedFinance = phaseFinance(world.finance, options.financeInPlace);
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
    instructorCost: number;
  }[] = [];
  const academicProfessionKeys = new Set(
    definitions.technology?.academicProfessionKeys ?? [],
  );
  const professionById = new Map(
    definitions.professions.map((profession) => [profession.id, profession]),
  );
  const labourWages = world.labourMarket.enabled ? buildLabourWageTable(world, definitions) : null;

  for (const country of [...world.countries].sort((left, right) => left.id - right.id)) {
    const derived = derivedByCountry.get(country.id);
    if (derived === undefined) throw new RangeError("missing training derivation");
    if (!(derived.participation > 0)) continue;
    const labor = country.labor ?? neutralLaborPolicyState();
    const eligible = trainingEligibleBlocks(world, country, populationIndex);
    // P7 (D-154, plan Q4): a labour-market world pays the training institution's
    // assigned instructors the market wage; elsewhere the budget goes to the academics.
    const owedInstructors =
      labourWages !== null
        ? institutionPayroll(world, definitions, country.id, ["training"], yearDays, labourWages).map((entry) => ({
            id: entry.popBlockId,
            weight: entry.population,
          }))
        : null;
    const requestedPayroll =
      owedInstructors === null
        ? labor.trainingBudgetRUSDPerYear / yearDays
        : owedInstructors.reduce((total, entry) => total + entry.weight, 0);
    const requestedStipend =
      (labor.trainingStipendPerTraineeRUSDPerYear * derived.trainees) / yearDays;
    const requested = requestedPayroll + requestedStipend;
    if (!(requested > 0)) continue;
    const treasury = index.get("country", country.id, "treasury-cash");
    const ceiling = Math.max(0, treasury.balanceRUSD - country.fiscal.reserveTargetRUSD);
    const paid = Math.min(requested, ceiling);
    const scale = requested > 0 ? paid / requested : 0;
    const payrollPaid = requestedPayroll * scale;
    const stipendPaid = requestedStipend * scale;

    if (payrollPaid > 0) {
      const academicBlocks =
        owedInstructors ??
        countryBlocks(world, country, populationIndex)
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
          amountRUSD: amount,
        });
        lines.push({
          accountId: index.get("popBlock", block.id, "training-income").id,
          side: "credit",
          amountRUSD: amount,
        });
      }
      if (lines.length > 0) {
        lines.push({
          accountId: index.get("country", country.id, "training-expense").id,
          side: "debit",
          amountRUSD: payrollPaid,
        });
        lines.push({
          accountId: treasury.id,
          side: "credit",
          amountRUSD: payrollPaid,
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
          amountRUSD: amount,
        });
        lines.push({
          accountId: index.get("popBlock", entry.block.id, "training-income").id,
          side: "credit",
          amountRUSD: amount,
        });
      }
      if (lines.length > 0) {
        lines.push({
          accountId: index.get("country", country.id, "training-expense").id,
          side: "debit",
          amountRUSD: stipendPaid,
        });
        lines.push({
          accountId: treasury.id,
          side: "credit",
          amountRUSD: stipendPaid,
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
      trainingRequestedRUSD: requested,
      trainingShortfallRUSD: shortfall,
    });
    // P2b: instructors are paid at the country's own academic wages (D-135).
    const instructorCost =
      world.moneyCoefficients.trainingInstructorCostPerYearRUSD *
      localWageIndex(
        world,
        countryBlocks(world, country, populationIndex),
        definitions,
        academicProfessionKeys,
        populationIndex.wagesByProvince,
      );
    const instructorBenchmark = derived.instructors * instructorCost;
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
      instructorCost,
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
          (draft.payrollPaid / Math.max(1e-12, draft.derived.instructors * draft.instructorCost)) *
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
      trainingRequestedMonthToDateRUSD:
        draft.country.labor.trainingRequestedMonthToDateRUSD + draft.requested,
      trainingShortfallMonthToDateRUSD:
        draft.country.labor.trainingShortfallMonthToDateRUSD +
        Math.max(0, draft.requested - draft.paid),
      lastUpdateDay: day,
    };
    results.push({
      countryId: draft.country.id,
      instructors: draft.derived.instructors,
      trainees: roundTo(draft.derived.trainees, 2),
      requestedRUSD: roundTo(draft.requested, 6),
      paidRUSD: roundTo(draft.paid, 6),
      shortfallRUSD: roundTo(Math.max(0, draft.requested - draft.paid), 6),
      payrollPaidRUSD: roundTo(draft.payrollPaid, 6),
      stipendPaidRUSD: roundTo(draft.stipendPaid, 6),
      quality: roundTo(draft.quality, E5_RATE_DECIMALS),
      qualifiedBlocks,
    });
  }
  const totalPaidRUSD = results.reduce((total, result) => total + result.paidRUSD, 0);
  const totalRequestedRUSD = results.reduce(
    (total, result) => total + result.requestedRUSD,
    0,
  );
  return { dayIndex: day, countries: results, totalPaidRUSD, totalRequestedRUSD };
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
  input: { readonly countryId: Id; readonly annualRUSD: number },
): Country {
  void definitions;
  const country = countryForAction(world, input.countryId);
  const annual = requireFiniteNumber(input.annualRUSD, "action.annualRUSD");
  if (annual < 0 || annual > MAX_TRAINING_BUDGET_RUSD_PER_YEAR) {
    throw new RangeError("training budget is out of range");
  }
  return country;
}

/** Validate a training-stipend change without mutating. */
export function validateTrainingStipend(
  world: World,
  definitions: EconomyDefinitions | undefined,
  input: { readonly countryId: Id; readonly annualRUSD: number },
): Country {
  void definitions;
  const country = countryForAction(world, input.countryId);
  const annual = requireFiniteNumber(input.annualRUSD, "action.annualRUSD");
  if (annual < 0 || annual > MAX_TRAINING_STIPEND_RUSD_PER_YEAR) {
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
