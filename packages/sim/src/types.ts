/**
 * Core primitive types for the Century simulation.
 *
 * These are plain aliases, matching GDD §5.2. They deliberately do not create
 * branded types: the simulation is serialized as JSON-compatible numbers and a
 * brand would require casts at every data boundary without adding determinism.
 */

/** A civil day represented by an integer day index. See `calendar.ts`. */
export type Day = number;

/** Alias used by the GDD for the same integer day index. */
export type DayIndex = Day;

/** Stable dense numeric identifier within one world. */
export type Id = number;

/** Nominal simulated USD accounting unit. */
export type MoneySUSD = number;

/** Normalized ratio, normally in 0..1. */
export type Rate = number;

/** Non-negative integer count of persons, jobs, or items. */
export type Count = number;

/** Deterministic world seed. Must be an unsigned 32-bit integer. */
export type Seed = number;

/** Gregorian calendar month, 1 = January. */
export type Month = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

/** A valid civil date inside the campaign window. */
export interface CivilDate {
  readonly year: number;
  readonly month: Month;
  readonly day: number;
}
