/**
 * E1/E2 bounded confirmed player-action history.
 *
 * Records are presentation-only and exist for the current app session. They are
 * appended only from an authoritative ACTION_RESULT, not when the UI sends a
 * command. No authoritative world state, schema, save, or hash is changed.
 */

export const MAX_PLAYER_ACTION_HISTORY = 48;

/** Confirmed E2 fiscal-policy values. */
export interface FiscalPolicyRequestValues {
  readonly incomeTaxRate: number;
  readonly incomeTaxAllowanceSUSDPerYear: number;
  readonly welfareBudgetSUSDPerYear: number;
  readonly welfareMaxWealthLevel: number;
  readonly businessProfitTaxRate: number;
  readonly reserveTargetSUSD: number;
}

/** A requested or confirmed player action, discriminated by kind. */
export type PlayerActionRequest =
  | ({ readonly kind: "set-fiscal-policy" } & FiscalPolicyRequestValues)
  | { readonly kind: "issue-debt"; readonly amountSUSD: number }
  | {
      readonly kind: "repay-debt";
      readonly contractId: number;
      readonly amountSUSD: number;
    }
  | {
      readonly kind: "set-debt-policy";
      readonly refinanceOnMaturity: boolean;
      readonly maxOutstandingPrincipalSUSD: number;
    }
  | {
      readonly kind: "start-construction";
      readonly regionId: number;
      readonly definitionId: number;
    }
  | { readonly kind: "cancel-construction"; readonly projectId: number }
  | {
      readonly kind: "set-construction-paused";
      readonly projectId: number;
      readonly paused: boolean;
    }
  | {
      readonly kind: "set-industrial-policy";
      readonly sectorSubsidyRates: readonly number[];
    }
  | {
      readonly kind: "support-public-enterprise";
      readonly buildingId: number;
      readonly amountSUSD: number;
    }
  | { readonly kind: "propose-law"; readonly lawId: number }
  | { readonly kind: "set-institution-funding"; readonly annualSUSD: number }
  | { readonly kind: "start-research"; readonly technologyId: number }
  | { readonly kind: "cancel-research" }
  | { readonly kind: "set-education-funding"; readonly annualSUSD: number }
  | { readonly kind: "set-research-staff-share"; readonly share: number }
  | { readonly kind: "set-training-budget"; readonly annualSUSD: number }
  | { readonly kind: "set-training-stipend"; readonly annualSUSD: number }
  | { readonly kind: "set-training-staff-share"; readonly share: number }
  | { readonly kind: "set-health-staff-share"; readonly share: number }
  | {
      readonly kind: "set-trade-policy";
      readonly tariffRates: readonly number[];
      readonly importQuotaQuantity: readonly (number | null)[];
      readonly exportRestricted: readonly boolean[];
    }
  | {
      readonly kind: "set-monetary-policy";
      readonly regime: "pegged" | "managed";
      readonly paritySusdPerUnit: number | null;
      readonly reserveTransferSUSD: number;
      readonly currencyConversionSUSD: number;
    }
  | { readonly kind: "declare-war"; readonly targetCountryId: number; readonly casusBelli: string }
  | { readonly kind: "offer-peace"; readonly warId: number; readonly terms: string }
  | { readonly kind: "accept-peace"; readonly warId: number; readonly offerId: number }
  | {
      readonly kind: "recruit-army";
      readonly regionId: number;
      readonly personnel: number;
      readonly equipmentUnits?: number;
    }
  | { readonly kind: "deploy-army"; readonly armyId: number; readonly targetRegionId: number };

export interface PlayerActionRecord {
  readonly actionId: string;
  readonly kind: PlayerActionRequest["kind"];
  readonly countryId: number;
  readonly countryTag: string | null;
  readonly dayIndex: number;
  readonly dateLabel: string;
  readonly requested: PlayerActionRequest | null;
  readonly accepted: boolean;
  /** Snapshot-confirmed applied values; null when rejected or not derivable. */
  readonly applied: PlayerActionRequest | null;
  readonly errors: readonly string[];
}

/** Append a confirmed record, keeping the newest bounded window. */
export function appendPlayerAction(
  history: readonly PlayerActionRecord[],
  record: PlayerActionRecord,
  limit = MAX_PLAYER_ACTION_HISTORY,
): readonly PlayerActionRecord[] {
  if (limit <= 0) return [];
  const withoutDuplicate = history.filter((entry) => entry.actionId !== record.actionId);
  const bounded = withoutDuplicate.slice(-(limit - 1));
  return [...bounded, record];
}

/** Newest-first view for display. */
export function recentPlayerActions(
  history: readonly PlayerActionRecord[],
  limit = 12,
): readonly PlayerActionRecord[] {
  if (limit <= 0) return [];
  return [...history].reverse().slice(0, limit);
}

/** Short human-readable summary of a requested/applied action. */
export function describePlayerAction(action: PlayerActionRequest | null): string {
  if (action === null) return "unknown";
  switch (action.kind) {
    case "set-fiscal-policy":
      return `tax ${(action.incomeTaxRate * 100).toFixed(2)}%, exemption ${action.incomeTaxAllowanceSUSDPerYear.toFixed(0)}/yr, welfare ${action.welfareBudgetSUSDPerYear.toFixed(0)}/yr, welfare ceiling wealth ${String(action.welfareMaxWealthLevel)}, business tax ${(action.businessProfitTaxRate * 100).toFixed(2)}%, reserve ${action.reserveTargetSUSD.toFixed(0)}`;
    case "issue-debt":
      return `borrow ${action.amountSUSD.toFixed(2)} SUSD`;
    case "repay-debt":
      return `repay ${action.amountSUSD.toFixed(2)} SUSD on contract ${String(action.contractId)}`;
    case "set-debt-policy":
      return `ceiling ${action.maxOutstandingPrincipalSUSD.toFixed(2)} SUSD, refinance on maturity ${action.refinanceOnMaturity ? "on" : "off"}`;
    case "start-construction":
      return `start construction type ${String(action.definitionId)} in region ${String(action.regionId)}`;
    case "cancel-construction":
      return `cancel construction project ${String(action.projectId)}`;
    case "set-construction-paused":
      return `${action.paused ? "pause" : "resume"} construction project ${String(action.projectId)}`;
    case "set-industrial-policy":
      return `set sector subsidy rates ${action.sectorSubsidyRates
        .map((rate) => `${(rate * 100).toFixed(1)}%`)
        .join("/")}`;
    case "support-public-enterprise":
      return `support enterprise ${String(action.buildingId)} with ${action.amountSUSD.toFixed(2)} SUSD`;
    case "propose-law":
      return `propose law ${String(action.lawId)}`;
    case "set-institution-funding":
      return `administration funding ${action.annualSUSD.toFixed(2)} SUSD/year`;
    case "start-research":
      return `start research on technology ${String(action.technologyId)}`;
    case "cancel-research":
      return "cancel the active research project";
    case "set-education-funding":
      return `education funding ${action.annualSUSD.toFixed(2)} SUSD/year`;
    case "set-research-staff-share":
      return `research staff share ${(action.share * 100).toFixed(1)}%`;
    case "set-training-budget":
      return `training budget ${action.annualSUSD.toFixed(2)} SUSD/year`;
    case "set-training-stipend":
      return `training stipend ${action.annualSUSD.toFixed(2)} SUSD/trainee/year`;
    case "set-training-staff-share":
      return `training staff share ${(action.share * 100).toFixed(1)}%`;
    case "set-health-staff-share":
      return `public-health staff share ${(action.share * 100).toFixed(1)}%`;
    case "set-trade-policy":
      return `tariffs ${action.tariffRates
        .map((rate) => `${(rate * 100).toFixed(1)}%`)
        .join("/")}, quotas ${action.importQuotaQuantity
        .map((quota) => (quota === null ? "-" : quota.toFixed(0)))
        .join("/")}, export bans ${action.exportRestricted.filter(Boolean).length}`;
    case "declare-war":
      return `declare war on country ${action.targetCountryId} (${action.casusBelli})`;
    case "offer-peace":
      return `offer ${action.terms} in war ${action.warId}`;
    case "accept-peace":
      return `accept peace offer ${action.offerId} in war ${action.warId}`;
    case "recruit-army":
      return `recruit ${action.personnel} soldiers in region ${action.regionId}`;
    case "deploy-army":
      return `deploy army ${action.armyId} to region ${action.targetRegionId}`;
    case "set-monetary-policy":
      return `${action.regime} monetary policy, parity ${
        action.paritySusdPerUnit === null ? "unchanged" : action.paritySusdPerUnit.toFixed(6)
      } SUSD/unit, reserve transfer ${action.reserveTransferSUSD.toFixed(2)} SUSD, currency conversion ${action.currencyConversionSUSD.toFixed(2)} SUSD`;
  }
}
