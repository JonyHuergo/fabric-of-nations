/**
 * E1 bounded confirmed player-action history.
 *
 * Records are presentation-only and exist for the current app session. They are
 * appended only from an authoritative ACTION_RESULT, not when the UI sends a
 * command. No authoritative world state, schema, save, or hash is changed.
 */

export const MAX_PLAYER_ACTION_HISTORY = 48;

export interface FiscalPolicyRequestValues {
  readonly incomeTaxRate: number;
  readonly welfareBudgetSUSDPerYear: number;
}

export interface PlayerActionRecord {
  readonly actionId: string;
  readonly kind: "set-fiscal-policy";
  readonly countryId: number;
  readonly countryTag: string | null;
  readonly dayIndex: number;
  readonly dateLabel: string;
  readonly requested: FiscalPolicyRequestValues | null;
  readonly accepted: boolean;
  /** Snapshot-confirmed applied policy values; null when rejected or unknown. */
  readonly applied: FiscalPolicyRequestValues | null;
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
