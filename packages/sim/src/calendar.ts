/**
 * Explicit Gregorian calendar support.
 *
 * The simulation never consults the host calendar, a time zone, or the clock.
 * Every conversion is a pure function over integer year/month/day or day-index
 * values.
 *
 * Day-index semantics (GDD §3.1):
 * - Index 0 is 1900-01-01.
 * - The campaign processes indices 0..36,523 (36,524 civil days).
 * - Index 36,524 is the terminal boundary 2000-01-01 and is not processed.
 * - `World.dayIndex` always means the next civil day to process, except at the
 *   terminal boundary where the campaign is complete.
 * - Therefore `dayIndex` is also the number of elapsed daily transitions for a
 *   world created at index 0.
 */

import {
  CAMPAIGN_END_YEAR,
  CAMPAIGN_START_DAY_INDEX,
  CAMPAIGN_START_YEAR,
  CAMPAIGN_TERMINAL_DAY_INDEX,
  CAMPAIGN_TICKS,
  VALID_DAY_INDEX_COUNT,
} from "./constants.js";
import type { CivilDate, Day, Month } from "./types.js";

const COMMON_MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

function assertInteger(value: number, name: string): void {
  if (!Number.isInteger(value)) {
    throw new RangeError(`${name} must be an integer, received ${String(value)}`);
  }
}

/** True when a year is a Gregorian leap year. */
export function isLeapYear(year: number): boolean {
  assertInteger(year, "year");
  if (year % 4 !== 0) return false;
  if (year % 100 !== 0) return true;
  return year % 400 === 0;
}

/** Number of days in a Gregorian month. */
export function daysInMonth(year: number, month: Month): number {
  assertInteger(year, "year");
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError(`month must be an integer in 1..12, received ${String(month)}`);
  }
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  const length = COMMON_MONTH_LENGTHS[month - 1];
  if (length === undefined) throw new RangeError(`unreachable month ${String(month)}`);
  return length;
}

/** Number of days in a Gregorian year. */
export function daysInYear(year: number): number {
  assertInteger(year, "year");
  return isLeapYear(year) ? 366 : 365;
}

/** True when `dayIndex` is an integer in 0..36,524, including the terminal boundary. */
export function isValidDayIndex(dayIndex: number): boolean {
  return (
    Number.isInteger(dayIndex) &&
    dayIndex >= CAMPAIGN_START_DAY_INDEX &&
    dayIndex <= CAMPAIGN_TERMINAL_DAY_INDEX
  );
}

/** Throw a clear error when `dayIndex` is not a valid index. */
export function assertValidDayIndex(dayIndex: number): void {
  if (!isValidDayIndex(dayIndex)) {
    throw new RangeError(
      `dayIndex must be an integer in ${CAMPAIGN_START_DAY_INDEX}..${CAMPAIGN_TERMINAL_DAY_INDEX}, received ${String(dayIndex)}`,
    );
  }
}

/** True when `dayIndex` is a campaign day that may still be processed (0..36,523). */
export function isProcessableDayIndex(dayIndex: number): boolean {
  return Number.isInteger(dayIndex) && dayIndex >= 0 && dayIndex < CAMPAIGN_TERMINAL_DAY_INDEX;
}

/** True when `dayIndex` is the terminal boundary 2000-01-01. */
export function isTerminalDayIndex(dayIndex: number): boolean {
  return dayIndex === CAMPAIGN_TERMINAL_DAY_INDEX;
}

/** Number of campaign days that remain to be processed from a valid index. */
export function remainingCampaignTicks(dayIndex: number): number {
  assertValidDayIndex(dayIndex);
  if (dayIndex === CAMPAIGN_TERMINAL_DAY_INDEX) return 0;
  return CAMPAIGN_TERMINAL_DAY_INDEX - dayIndex;
}

/** Number of daily transitions already elapsed from 1900-01-01. */
export function elapsedDailyTransitions(dayIndex: Day): number {
  assertValidDayIndex(dayIndex);
  return dayIndex;
}

/** Validate a civil date, including the requirement that it lies in the campaign window. */
export function isValidDate(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || year < CAMPAIGN_START_YEAR || year > CAMPAIGN_END_YEAR) {
    return false;
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) return false;
  if (!Number.isInteger(day) || day < 1) return false;
  if (day > daysInMonth(year, month as Month)) return false;
  // The campaign window is inclusive of 2000-01-01 and nothing later.
  if (year === CAMPAIGN_END_YEAR && (month > 1 || day > 1)) return false;
  return true;
}

/**
 * Convert a civil date in 1900-01-01..2000-01-01 to its day index.
 * Dates outside that inclusive range are rejected rather than wrapped.
 */
export function civilDateToDayIndex(year: number, month: Month, day: number): Day {
  if (!isValidDate(year, month, day)) {
    throw new RangeError(`invalid civil date ${String(year)}-${String(month)}-${String(day)}`);
  }
  let index = 0;
  for (let y = CAMPAIGN_START_YEAR; y < year; y += 1) {
    index += daysInYear(y);
  }
  for (let m = 1; m < month; m += 1) {
    index += daysInMonth(year, m as Month);
  }
  index += day - 1;
  if (index > CAMPAIGN_TERMINAL_DAY_INDEX) {
    throw new RangeError(
      `civil date ${String(year)}-${String(month)}-${String(day)} is after the terminal boundary`,
    );
  }
  return index;
}

/** Convert a valid day index to its Gregorian civil date. */
export function dayIndexToCivilDate(dayIndex: Day): CivilDate {
  assertValidDayIndex(dayIndex);
  let remaining = dayIndex;
  let year = CAMPAIGN_START_YEAR;
  while (true) {
    const yearLength = daysInYear(year);
    if (remaining < yearLength) break;
    remaining -= yearLength;
    year += 1;
  }
  let month: Month = 1;
  while (true) {
    const monthLength = daysInMonth(year, month);
    if (remaining < monthLength) break;
    remaining -= monthLength;
    month = (month + 1) as Month;
  }
  return { year, month, day: remaining + 1 };
}

/** Format a civil date as `YYYY-MM-DD` without locale or host calendar APIs. */
export function formatCivilDate(date: CivilDate): string {
  const year = String(date.year).padStart(4, "0");
  const month = String(date.month).padStart(2, "0");
  const day = String(date.day).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Format a day index as its ISO-like civil date. */
export function formatDayIndex(dayIndex: Day): string {
  return formatCivilDate(dayIndexToCivilDate(dayIndex));
}

/** Structural campaign bounds, exported for tests and drivers. */
export const CAMPAIGN_BOUNDS = {
  firstDayIndex: CAMPAIGN_START_DAY_INDEX,
  terminalDayIndex: CAMPAIGN_TERMINAL_DAY_INDEX,
  processedDays: CAMPAIGN_TICKS,
  validDayIndices: VALID_DAY_INDEX_COUNT,
} as const;
