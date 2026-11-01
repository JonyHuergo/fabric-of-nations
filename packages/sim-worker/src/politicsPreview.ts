/**
 * M8 law and institution previews. Pure snapshot arithmetic; the authoritative
 * validation, support threshold, and enactment timing remain in the simulation.
 */

import type { CountrySnapshot, SimulationSnapshot, SnapshotLawOption } from "./protocol.js";

export interface LawProposalPreview {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly option: SnapshotLawOption | null;
  readonly support: number;
  readonly effectiveEnactmentDays: number;
  readonly constraints: readonly string[];
}

/** Preview a law proposal/change/repeal against the current snapshot. */
export function previewLawProposal(
  snapshot: SimulationSnapshot,
  country: CountrySnapshot,
  lawId: number,
): LawProposalPreview {
  const errors: string[] = [];
  const option = country.politics.lawOptions.find((entry) => entry.lawId === lawId) ?? null;
  if (snapshot.playerCountryId !== country.id) {
    errors.push("Only the player-controlled country may propose laws.");
  }
  if (option === null) {
    errors.push("The selected law option is not implemented.");
  } else {
    if (!option.eligible) {
      errors.push("The current regime is not eligible for this law.");
    }
    if (!option.prerequisitesMet) {
      errors.push("The law's prerequisites are not enacted.");
    }
    if (option.alreadyEnacted) {
      errors.push("That law is already enacted.");
    }
    if (
      country.politics.lawSlots.some(
        (slot) =>
          slot.slot === option.slot &&
          country.politics.lawTransitions.some((transition) => transition.slot === slot.slot),
      )
    ) {
      errors.push("A transition for this law slot is already in progress.");
    }
    if (option.support < 0.05) {
      errors.push(
        `Influence-weighted support ${(option.support * 100).toFixed(1)}% is below the 5.0% proposal threshold.`,
      );
    }
  }
  const quality = country.politics.institution.quality;
  const effectiveEnactmentDays =
    option === null
      ? 0
      : Math.max(
          option.enactmentDays,
          Math.ceil(option.enactmentDays / (0.5 + 0.5 * quality)),
        );
  return {
    valid: errors.length === 0,
    errors,
    option,
    support: option?.support ?? 0,
    effectiveEnactmentDays,
    constraints: [
      "Support is the influence-weighted stance of the seven interest groups; influence is derived and cannot be spent.",
      "A proposal only schedules a transition. The law becomes effective at the start of its effective day and never rewrites a closed period.",
      "Changing a law and repealing one use the same proposal path; the slot's base law is the repeal target.",
      "Statutory tax bounds clamp the current tax rate on the effective day; forward compliance is recorded in the event log.",
      "AI law proposals are not implemented in M8.",
    ],
  };
}

export interface InstitutionFundingPreview {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly annualRUSD: number;
  readonly dailyRequestRUSD: number;
  readonly currentAnnualRUSD: number;
  readonly treasuryCashRUSD: number;
  readonly constraints: readonly string[];
}

/** Preview an administration funding target. Not a projected quality forecast. */
export function previewInstitutionFunding(
  snapshot: SimulationSnapshot,
  country: CountrySnapshot,
  annualRUSD: number,
): InstitutionFundingPreview {
  const errors: string[] = [];
  if (snapshot.playerCountryId !== country.id) {
    errors.push("Only the player-controlled country may set administration funding.");
  }
  if (!Number.isFinite(annualRUSD) || annualRUSD < 0) {
    errors.push("The annual funding target must be a finite non-negative amount.");
  }
  const dailyRequestRUSD = Number.isFinite(annualRUSD) ? annualRUSD / 365 : 0;
  if (dailyRequestRUSD > country.treasuryCashRUSD) {
    errors.push(
      "The daily request exceeds current treasury cash; the fiscal phase would pay only the available amount above the reserve floor.",
    );
  }
  return {
    valid: errors.length === 0,
    errors,
    annualRUSD,
    dailyRequestRUSD,
    currentAnnualRUSD: country.politics.institution.fundedAnnualRUSD,
    treasuryCashRUSD: country.treasuryCashRUSD,
    constraints: [
      "Funding is a daily cash-limited payroll transfer to administration households, not money creation.",
      "Unpaid request is an explicit shortfall, not debt or a receivable.",
      "Quality also depends on clerk staffing, literacy, infrastructure, enacted-law load, and recent disruption; the UI does not forecast a future quality value.",
      "The measure is provisional and is not a historical budget claim.",
    ],
  };
}
