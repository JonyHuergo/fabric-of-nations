/**
 * M7a controlled finance corrections (D-072).
 *
 * A correction is a new, audited posting with provenance: it names the original
 * posting id and a reason. It never edits or deletes an earlier posting, a closed
 * monthly summary, or a closed annual summary. If it affects a previously
 * reported period, the accounting effect lands in the current open period; the
 * annual report exposes the count of correction records in that year.
 */

import { assertValidDayIndex, isTerminalDayIndex } from "../calendar.js";
import type { Day } from "../types.js";
import type { World } from "../world.js";
import { postCorrectionEntry } from "./accounting.js";
import { cloneFinanceState } from "./accounts.js";
import {
  MAX_CORRECTION_REASON_LENGTH,
  MAX_FINANCE_CORRECTIONS,
} from "./constants.js";
import type {
  FinanceCorrection,
  JournalLine,
} from "./types.js";
import { assertValidFinanceState } from "./validation.js";

export interface FinanceCorrectionRequest {
  /** Posting whose effect is being corrected/reversed; need not remain in the audit buffer. */
  readonly originalPostingId: number;
  /** Human-auditable reason, nonempty and bounded. */
  readonly reason: string;
  /** Balanced correction lines. They are posted; no historical row is edited. */
  readonly lines: readonly JournalLine[];
}

export interface FinanceCorrectionResult {
  readonly correction: FinanceCorrection;
  readonly postingId: number;
}

function requirePostingId(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
  return value;
}

function normalizeReason(reason: string): string {
  const trimmed = reason.trim();
  if (trimmed.length === 0) {
    throw new RangeError("finance correction reason must not be empty");
  }
  if (trimmed.length > MAX_CORRECTION_REASON_LENGTH) {
    throw new RangeError(
      `finance correction reason must contain at most ${String(MAX_CORRECTION_REASON_LENGTH)} characters`,
    );
  }
  return trimmed;
}

/**
 * Post a balanced correction against the current open period.
 *
 * Failure is atomic: the staged finance copy is discarded and `world.finance`
 * remains byte-for-byte unchanged. The terminal 2000-01-01 boundary rejects
 * corrections because no period remains open.
 */
export function postFinanceCorrection(
  world: World,
  dayIndex: Day,
  request: FinanceCorrectionRequest,
): FinanceCorrectionResult {
  assertValidDayIndex(dayIndex);
  if (dayIndex !== world.dayIndex) {
    throw new RangeError(
      `finance correction requires day ${String(world.dayIndex)}, received ${String(dayIndex)}`,
    );
  }
  if (isTerminalDayIndex(dayIndex)) {
    throw new RangeError("finance corrections are not accepted at the terminal boundary");
  }
  const originalPostingId = requirePostingId(
    request.originalPostingId,
    "finance correction originalPostingId",
  );
  const reason = normalizeReason(request.reason);
  if (request.lines.length === 0) {
    throw new RangeError("finance correction requires at least one line");
  }
  assertValidFinanceState(world.finance);

  const staged = cloneFinanceState(world.finance);
  const original = staged.postings.find((posting) => posting.id === originalPostingId);
  const posting = postCorrectionEntry(
    staged,
    dayIndex,
    request.lines,
    original?.sourceEntityId ?? null,
    null,
  );
  const correctionId = staged.nextCorrectionId;
  if (!Number.isSafeInteger(correctionId) || correctionId < 1) {
    throw new RangeError("finance nextCorrectionId must be a positive safe integer");
  }
  const correction: FinanceCorrection = {
    id: correctionId,
    dayIndex,
    postingId: posting.id,
    originalPostingId,
    reason,
    lines: posting.lines.map((line) => ({ ...line })),
  };
  staged.corrections.push(correction);
  staged.nextCorrectionId = correctionId + 1;
  if (staged.corrections.length > MAX_FINANCE_CORRECTIONS) {
    staged.corrections.splice(0, staged.corrections.length - MAX_FINANCE_CORRECTIONS);
  }
  assertValidFinanceState(staged);
  world.finance = staged;
  return { correction, postingId: posting.id };
}
