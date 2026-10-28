/**
 * M9 technology and education previews. Pure snapshot arithmetic; the
 * authoritative validation, staffing, funding, and research work remain in the
 * simulation. These helpers never forecast a future state as if it were observed.
 */

import { EDUCATION_STUDENTS_PER_TEACHER } from "@century/sim";

import type { CountrySnapshot, SimulationSnapshot } from "./protocol.js";

export interface ResearchStartPreview {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly technologyId: number;
  readonly technologyKey: string | null;
  readonly researchWork: number;
  readonly workCompleted: number;
  readonly remainingWork: number;
  readonly constraints: readonly string[];
}

/** Preview selecting a research project. */
export function previewResearchStart(
  snapshot: SimulationSnapshot,
  country: CountrySnapshot,
  technologyId: number,
): ResearchStartPreview {
  const errors: string[] = [];
  if (snapshot.playerCountryId !== country.id) {
    errors.push("Only the player-controlled country may choose research.");
  }
  const technology = country.technology;
  if (!technology.enabled) {
    errors.push("Technology is not enabled for this world.");
  }
  const entry =
    snapshot.technologyCatalog.find(
      (candidate) => candidate.technologyId === technologyId,
    ) ?? null;
  const status =
    technology.statuses.find((candidate) => candidate.technologyId === technologyId) ?? null;
  if (entry === null || status === null) {
    errors.push("The selected technology is not in the validated catalog.");
  } else {
    if (status.status === "researched") {
      errors.push("That technology is already researched.");
    }
    if (status.status === "locked") {
      errors.push(
        `Prerequisites are researched: ${entry.prerequisiteKeys.join(", ") || "none"}. Not all are complete.`,
      );
    }
    if (technology.activeProjectTechnologyId !== null) {
      errors.push(
        "A research project is already active. Finish or cancel it before starting another.",
      );
    }
  }
  const workCompleted = status?.workCompleted ?? 0;
  return {
    valid: errors.length === 0,
    errors,
    technologyId,
    technologyKey: entry?.key ?? null,
    researchWork: entry?.researchWork ?? 0,
    workCompleted,
    remainingWork: Math.max(0, (entry?.researchWork ?? 0) - workCompleted),
    constraints: [
      "Work advances only from academic staff actually assigned to research, scaled by literacy, education quality, and funding adequacy.",
      "Accumulated work stays with its technology; cancelling a project does not transfer it to another.",
      "A technology completed today applies from the next civil day and never rewrites a closed period.",
      "AI research selection is not implemented in M9.",
    ],
  };
}

export interface EducationFundingPreview {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly annualSUSD: number;
  readonly dailyRequestSUSD: number;
  readonly currentAnnualSUSD: number;
  readonly treasuryCashSUSD: number;
  readonly constraints: readonly string[];
}

/** Preview an education/research funding target. Not a quality forecast. */
export function previewEducationFunding(
  snapshot: SimulationSnapshot,
  country: CountrySnapshot,
  annualSUSD: number,
): EducationFundingPreview {
  const errors: string[] = [];
  if (snapshot.playerCountryId !== country.id) {
    errors.push("Only the player-controlled country may set education funding.");
  }
  if (!country.education.enabled) {
    errors.push("Education is not enabled for this world.");
  }
  if (!Number.isFinite(annualSUSD) || annualSUSD < 0) {
    errors.push("The annual funding target must be a finite non-negative amount.");
  }
  const dailyRequestSUSD = Number.isFinite(annualSUSD) ? annualSUSD / 365 : 0;
  if (dailyRequestSUSD > country.treasuryCashSUSD) {
    errors.push(
      "The daily request exceeds current treasury cash; the education phase would pay only the available amount above the reserve floor.",
    );
  }
  return {
    valid: errors.length === 0,
    errors,
    annualSUSD,
    dailyRequestSUSD,
    currentAnnualSUSD: country.education.fundedAnnualSUSD,
    treasuryCashSUSD: country.treasuryCashSUSD,
    constraints: [
      "Education payroll is a daily cash-limited transfer to academic households; it is not money creation.",
      "Unpaid request is an explicit shortfall, not debt or a receivable.",
      "Funding adequacy and quality are derived from current staff, funding, literacy, law, and technology. The preview does not claim a future literacy outcome.",
    ],
  };
}

export interface ResearchStaffSharePreview {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly share: number;
  readonly currentShare: number;
  readonly availableAcademicWorkers: number;
  readonly researchStaff: number;
  readonly teacherStaff: number;
  readonly teachingCapacityStudents: number;
  readonly constraints: readonly string[];
}

/** Preview the academic research/teaching time split. */
export function previewResearchStaffShare(
  snapshot: SimulationSnapshot,
  country: CountrySnapshot,
  share: number,
): ResearchStaffSharePreview {
  const errors: string[] = [];
  if (snapshot.playerCountryId !== country.id) {
    errors.push("Only the player-controlled country may set research staffing.");
  }
  if (!country.education.enabled) {
    errors.push("Education is not enabled for this world.");
  }
  if (!Number.isFinite(share) || share < 0 || share > 1) {
    errors.push("The research staff share must be in 0..1.");
  }
  const available = country.education.availableAcademicWorkers;
  const safeShare = Number.isFinite(share) ? Math.min(1, Math.max(0, share)) : 0;
  const researchStaff = available * safeShare;
  const teacherStaff = available - researchStaff;
  return {
    valid: errors.length === 0,
    errors,
    share: safeShare,
    currentShare: country.education.researchStaffShare,
    availableAcademicWorkers: available,
    researchStaff,
    teacherStaff,
    teachingCapacityStudents: teacherStaff * EDUCATION_STUDENTS_PER_TEACHER,
    constraints: [
      "Academic staff are actual people: participating working-age academics minus any academic employment assignments.",
      "Research and teaching share the same staff pool, so more research time means fewer teachers and less schooling capacity.",
      "Capacity still limits actual attendance; a legal attendance floor cannot exceed teaching capacity.",
    ],
  };
}
