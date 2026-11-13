/**
 * The day result of the monthly labour phase's migration (D-155). The M5 migration
 * model that first produced this shape was removed; the P7 labour phase reports its
 * movers in `totalPeople` and leaves the per-flow fields empty.
 */

import type { DayIndex, Id } from "../types.js";
import type { EmploymentRefreshResult } from "./employment.js";

/** One applied aggregate migration flow. Transient; never persisted. */
export interface MigrationFlow {
  readonly sourcePopBlockId: Id;
  readonly destinationPopBlockId: Id;
  readonly sourceProvinceId: Id;
  readonly destinationProvinceId: Id;
  readonly professionId: Id;
  readonly people: number;
  readonly financialTransferRUSD: number;
}

export interface MigrationDayResult {
  readonly ran: boolean;
  readonly dayIndex: DayIndex;
  readonly flows: readonly MigrationFlow[];
  readonly totalPeople: number;
  readonly totalFinancialTransferRUSD: number;
  readonly sourceBlocksConsidered: number;
  readonly destinationsCappedByInflowLimit: number;
  /** The employment refresh the labour phase performed, or null when none ran. */
  readonly employmentRefresh: EmploymentRefreshResult | null;
}
