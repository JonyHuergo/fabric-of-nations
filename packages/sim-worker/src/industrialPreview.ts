/**
 * E4 industrial-policy and public-enterprise previews. Pure snapshot arithmetic;
 * authoritative validation remains in the simulation.
 */

import type { CountrySnapshot, SimulationSnapshot } from "./protocol.js";

export interface IndustrialSectorPreview {
  readonly index: number;
  readonly key: string;
  readonly label: string;
  readonly rate: number;
  readonly estimatedDailyOutputValueSUSD: number;
  readonly estimatedDailySubsidySUSD: number;
}

export interface IndustrialPolicyPreview {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly sectors: readonly IndustrialSectorPreview[];
  readonly estimatedDailySubsidySUSD: number;
  readonly treasuryCashSUSD: number;
  readonly requestedMonthToDateSUSD: number;
  readonly paidMonthToDateSUSD: number;
  readonly shortfallMonthToDateSUSD: number;
  readonly constraints: readonly string[];
}

/** Preview a proposed per-sector production-subsidy schedule. */
export function previewIndustrialPolicy(
  snapshot: SimulationSnapshot,
  country: CountrySnapshot,
  rates: readonly number[],
): IndustrialPolicyPreview {
  const errors: string[] = [];
  const constraints: string[] = [];
  if (rates.length !== country.industrialPolicy.sectors.length) {
    errors.push("The subsidy schedule must cover every registered sector.");
  }
  if (snapshot.playerCountryId !== country.id) {
    errors.push("Only the player-controlled country may set industrial policy.");
  }
  for (const rate of rates) {
    if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
      errors.push("Every sector subsidy rate must be between 0% and 100%.");
      break;
    }
  }
  const sectors = country.industrialPolicy.sectors.map((sector) => {
    const rate = rates[sector.index] ?? 0;
    return {
      index: sector.index,
      key: sector.key,
      label: sector.label,
      rate,
      estimatedDailyOutputValueSUSD: sector.estimatedDailyOutputValueSUSD,
      estimatedDailySubsidySUSD: sector.estimatedDailyOutputValueSUSD * rate,
    };
  });
  const estimatedDailySubsidySUSD = sectors.reduce(
    (total, sector) => total + sector.estimatedDailySubsidySUSD,
    0,
  );
  if (estimatedDailySubsidySUSD > country.treasuryCashSUSD) {
    constraints.push(
      "The static daily entitlement exceeds current treasury cash; actual payment will be rationed in building-id order and the unpaid part reported as a shortfall.",
    );
  }
  constraints.push(
    "The base is verified daily physical output valued at the current market price, not capacity, sales, or a target.",
    "Subsidy revenue is taxable enterprise revenue and is included in the month-end business-profit tax base.",
    "Payments are limited by actual treasury cash; an unpaid entitlement is a shortfall, never debt or a receivable.",
    "The estimate uses current capacity, prices, and the proposed rates; it is not a forecast of future output or prices.",
  );
  return {
    valid: errors.length === 0,
    errors,
    sectors,
    estimatedDailySubsidySUSD,
    treasuryCashSUSD: country.treasuryCashSUSD,
    requestedMonthToDateSUSD: country.industrialPolicy.requestedMonthToDateSUSD,
    paidMonthToDateSUSD: country.industrialPolicy.paidMonthToDateSUSD,
    shortfallMonthToDateSUSD: country.industrialPolicy.shortfallMonthToDateSUSD,
    constraints,
  };
}

export interface PublicEnterpriseSupportPreview {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly buildingId: number;
  readonly amountSUSD: number;
  readonly treasuryCashSUSD: number;
  readonly operatingCashSUSD: number;
  readonly constraints: readonly string[];
}

/** Preview a capital contribution to one existing state enterprise. */
export function previewPublicEnterpriseSupport(
  snapshot: SimulationSnapshot,
  country: CountrySnapshot,
  buildingId: number,
  amountSUSD: number,
): PublicEnterpriseSupportPreview {
  const errors: string[] = [];
  const enterprise = country.publicEnterprises.find(
    (candidate) => candidate.buildingId === buildingId,
  );
  if (enterprise === undefined) {
    errors.push("The selected building is not a state-owned enterprise of this country.");
  }
  if (snapshot.playerCountryId !== country.id) {
    errors.push("Only the player-controlled country may support a public enterprise.");
  }
  if (!Number.isFinite(amountSUSD) || !(amountSUSD > 0)) {
    errors.push("The support amount must be positive.");
  } else if (amountSUSD > country.treasuryCashSUSD + 1e-6) {
    errors.push("Treasury cash does not cover the support amount.");
  }
  return {
    valid: errors.length === 0,
    errors,
    buildingId,
    amountSUSD,
    treasuryCashSUSD: country.treasuryCashSUSD,
    operatingCashSUSD: enterprise?.operatingCashSUSD ?? 0,
    constraints: [
      "The payment is a capital contribution from country treasury/equity to the enterprise's operating cash/equity; it is not an expense, loan, or guaranteed return.",
      "It does not guarantee inputs, sales, profitability, or continued operation; ordinary production, wages, upkeep, tax, and remittance still apply.",
      "The contribution is cash-neutral between designated accounts and immediately available to the enterprise.",
    ],
  };
}
