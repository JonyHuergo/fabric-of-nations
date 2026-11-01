/**
 * E5 labor/health previews. These are presentation estimates derived from an
 * immutable snapshot, not authoritative forecasts: the worker recomputes staffing,
 * funding, participation, and qualification from live state when an action is
 * applied. The UI must label them as estimates.
 */

import {
  HEALTH_TARGET_STAFF_PER_CAPITA,
  TRAINEES_PER_INSTRUCTOR,
  TRAINING_MAX_PARTICIPATION,
  TRAINING_QUALITY_INSTITUTION_WEIGHT,
  TRAINING_QUALITY_LITERACY_WEIGHT,
} from "@century/sim";

import type { CountrySnapshot, SimulationSnapshot } from "./protocol.js";

export interface TrainingPolicyPreview {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly annualCostRUSD: number;
  readonly instructors: number;
  readonly capacityTrainees: number;
  readonly participation: number;
  readonly trainees: number;
  /** Estimated annual qualification gain at current quality; a slow estimate. */
  readonly qualificationGainPerYear: number;
  readonly blockedReason: string | null;
  readonly notes: readonly string[];
}

export interface HealthPolicyPreview {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly clerkPopulation: number;
  readonly healthStaff: number;
  readonly administrationStaff: number;
  readonly staffingCoverage: number;
  readonly notes: readonly string[];
}

function clamp(value: number, minimum: number, maximum: number): number {
  if (value < minimum) return minimum;
  if (value > maximum) return maximum;
  return value;
}

/** Estimate the training service implied by proposed policy values. */
export function previewTrainingPolicy(
  snapshot: SimulationSnapshot,
  country: CountrySnapshot,
  proposed: {
    readonly trainingBudgetRUSDPerYear?: number;
    readonly trainingStipendPerTraineeRUSDPerYear?: number;
    readonly trainingStaffShare?: number;
  },
): TrainingPolicyPreview {
  const errors: string[] = [];
  if (snapshot.playerCountryId !== country.id) {
    errors.push("Only the player-controlled country may change labor policy.");
  }
  const labor = country.labor;
  const budget = proposed.trainingBudgetRUSDPerYear ?? labor.trainingBudgetRUSDPerYear;
  const stipend =
    proposed.trainingStipendPerTraineeRUSDPerYear ??
    labor.trainingStipendPerTraineeRUSDPerYear;
  const share = proposed.trainingStaffShare ?? labor.trainingStaffShare;
  if (budget < 0 || stipend < 0) errors.push("Training amounts must be non-negative.");
  if (share < 0 || share > 1) errors.push("Training staff share must be in 0..1.");
  if (share + country.education.researchStaffShare > 1 + 1e-9) {
    errors.push("Research and training academic staff shares must not exceed 100%.");
  }
  const instructors = Math.max(
    0,
    country.education.availableAcademicWorkers * clamp(share, 0, 1),
  );
  const capacityTrainees = Math.floor(instructors * TRAINEES_PER_INSTRUCTOR);
  const participation =
    budget > 0 && instructors > 0 && labor.eligibleWorkingAge > 0
      ? clamp(capacityTrainees / labor.eligibleWorkingAge, 0, TRAINING_MAX_PARTICIPATION)
      : 0;
  const trainees = participation * labor.eligibleWorkingAge;
  const annualCost = budget + stipend * trainees;
  const qualityProxy = clamp(
    0.5 *
      (instructors > 0 ? Math.min(1, budget / (instructors * 1)) : 0) +
      TRAINING_QUALITY_LITERACY_WEIGHT * 0.9 +
      TRAINING_QUALITY_INSTITUTION_WEIGHT * country.politics.institution.quality,
    0,
    1,
  );
  const qualificationGainPerYear =
    0.01 * 365 * participation * qualityProxy;
  const blockedReason =
    budget <= 0
      ? "no-funding"
      : instructors <= 0
        ? "no-academic-staff"
        : labor.eligibleWorkingAge <= 0
          ? "no-eligible-population"
          : null;
  return {
    valid: errors.length === 0,
    errors,
    annualCostRUSD: annualCost,
    instructors,
    capacityTrainees,
    participation,
    trainees,
    qualificationGainPerYear,
    blockedReason,
    notes: [
      "Estimate only: instructors, eligibility, funding adequacy, and participation are recomputed by the worker.",
      "Stipends are paid immediately from actual treasury cash; qualification gains accrue slowly and only for funded training.",
      "Training is part-time and reduces effective labor input; it does not create a separate population.",
    ],
  };
}

/** Estimate the health staff allocation implied by a proposed share. */
export function previewHealthPolicy(
  snapshot: SimulationSnapshot,
  country: CountrySnapshot,
  proposedShare: number,
): HealthPolicyPreview {
  const errors: string[] = [];
  if (snapshot.playerCountryId !== country.id) {
    errors.push("Only the player-controlled country may change health policy.");
  }
  if (proposedShare < 0 || proposedShare > 1) {
    errors.push("Health staff share must be in 0..1.");
  }
  const clerkPopulation = country.labor.healthStaff + country.labor.administrationStaff;
  const healthStaff = clerkPopulation * proposedShare;
  const administrationStaff = clerkPopulation - healthStaff;
  return {
    valid: errors.length === 0,
    errors,
    clerkPopulation,
    healthStaff,
    administrationStaff,
    staffingCoverage:
      clerkPopulation > 0
        ? clamp(
            healthStaff / clerkPopulation / HEALTH_TARGET_STAFF_PER_CAPITA,
            0,
            1,
          )
        : 0,
    notes: [
      "Public health is a share of the existing administration clerk base; it adds no new people or payment.",
      "A higher share reduces administrative capacity, which affects tax collection and construction.",
      "The mortality effect accumulates through the population over months and years, not immediately.",
    ],
  };
}
