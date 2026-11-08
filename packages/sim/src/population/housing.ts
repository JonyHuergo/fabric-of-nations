/**
 * P6 (D-153) housing: the dwelling stock of a population block, its crowding and the
 * stock it wants. Pure functions of block state; nothing here touches markets or money.
 *
 * - A block owns the standard dwellings it lives in (plan Q4a, Q5a). Its 1900 persons
 *   per dwelling and 1900 income are fixed references, so crowding is 1.0 for every
 *   block at world creation (plan Q6a).
 * - Crowding c = (persons ÷ dwellings) ÷ reference, bounded by CROWDING_MAX (a model
 *   domain for a block with almost no dwellings). A block with no housing reference
 *   (legacy worlds) has crowding 1 and no housing effects.
 * - Mortality rises by 1 + K × max(0, c − 1) (plan Q7a); improvements below the 1900
 *   level act through sanitation and health as before.
 * - Desired dwellings = persons ÷ reference × (income ÷ reference income)^ε.
 */

import {
  ADULT_EQUIVALENT_FEMALE_BY_AGE,
  ADULT_EQUIVALENT_MALE_BY_AGE,
  CROWDING_MAX,
  DWELLING_DEPRECIATION_RATE_PER_YEAR,
  DWELLING_INCOME_ELASTICITY,
} from "./constants.js";
import type { PopBlock } from "./types.js";

/**
 * Relative tolerance of crowding around 1: the reference is persons ÷ dwellings at
 * creation, so the ratio recomputed from the same numbers can differ from 1 by a few
 * units in the last place. Within this tolerance crowding is exactly 1.
 */
const CROWDING_TOLERANCE = 1e-9;

/** Persons in a block (single-year cells summed). */
function personsOf(block: PopBlock): number {
  let total = 0;
  for (let index = 0; index < block.maleByAge.length; index += 1) total += block.maleByAge[index] ?? 0;
  for (let index = 0; index < block.femaleByAge.length; index += 1) total += block.femaleByAge[index] ?? 0;
  return total;
}

/** Adult equivalents of a block on Atwater's dietary scale (plan Q14). */
export function adultEquivalents(block: PopBlock): number {
  let total = 0;
  for (let age = 0; age < block.maleByAge.length; age += 1) {
    total += (block.maleByAge[age] ?? 0) * (ADULT_EQUIVALENT_MALE_BY_AGE[age] ?? 1);
  }
  for (let age = 0; age < block.femaleByAge.length; age += 1) {
    total += (block.femaleByAge[age] ?? 0) * (ADULT_EQUIVALENT_FEMALE_BY_AGE[age] ?? 0.8);
  }
  return total;
}

/** Whether the block takes part in housing (it has a 1900 reference). */
export function blockHasHousing(block: PopBlock): boolean {
  return block.housingReferencePersonsPerDwelling > 0;
}

/** Crowding of a block: persons per dwelling ÷ its 1900 persons per dwelling. */
export function blockCrowding(block: PopBlock): number {
  if (!blockHasHousing(block)) return 1;
  const persons = personsOf(block);
  if (persons <= 0) return 1;
  if (!(block.dwellings > 0)) return CROWDING_MAX;
  const crowding = persons / block.dwellings / block.housingReferencePersonsPerDwelling;
  if (Math.abs(crowding - 1) <= CROWDING_TOLERANCE) return 1;
  return Math.min(CROWDING_MAX, crowding);
}

/**
 * Crowding of a province (plan §4.5): its persons ÷ its blocks' dwellings ÷ its 1900
 * persons per dwelling; 1.0 in 1900. Null where the province has no housing reference.
 */
export function provinceCrowding(
  blocks: readonly PopBlock[],
  referencePersonsPerDwelling: number | null,
): number | null {
  if (referencePersonsPerDwelling === null) return null;
  let persons = 0;
  let dwellings = 0;
  for (const block of blocks) {
    persons += personsOf(block);
    dwellings += block.dwellings;
  }
  if (persons <= 0) return 1;
  if (!(dwellings > 0)) return CROWDING_MAX;
  const crowding = persons / dwellings / referencePersonsPerDwelling;
  if (Math.abs(crowding - 1) <= CROWDING_TOLERANCE) return 1;
  return Math.min(CROWDING_MAX, crowding);
}

/** Death-rate factor of crowding above the 1900 level (plan Q7a). */
export function crowdingMortalityFactor(crowding: number, weight: number): number {
  return 1 + weight * Math.max(0, crowding - 1);
}

/** Dwellings the block wants at its smoothed income (plan §4.3). */
export function desiredDwellings(block: PopBlock): number {
  if (!blockHasHousing(block)) return 0;
  const persons = personsOf(block);
  const base = persons / block.housingReferencePersonsPerDwelling;
  const reference = block.housingReferenceIncomeRUSDPerCapitaDay;
  const income = block.incomeSmoothedRUSDPerCapitaDay;
  if (!(reference > 0) || !(income > 0)) return base;
  return base * Math.pow(income / reference, DWELLING_INCOME_ELASTICITY);
}

/**
 * Daily depreciation of a block's dwellings; returns the dwellings removed. The stock
 * after removal plus the removal equals the stock before (conservation is exact up to
 * one rounding of the product).
 */
export function depreciateDwellings(block: PopBlock, daysInYear: number): number {
  if (!(block.dwellings > 0)) return 0;
  const removed = (block.dwellings * DWELLING_DEPRECIATION_RATE_PER_YEAR) / daysInYear;
  block.dwellings -= removed;
  return removed;
}

/**
 * World creation (plan §4.2): split a province's 1900 dwellings (persons ÷ census
 * persons per dwelling) among its blocks in proportion to persons × income^ε, so that
 * richer classes live in more dwellings per person and each block's desired stock
 * equals its stock. Sets each block's dwellings and fixed references.
 */
export function initialiseProvinceHousing(blocks: readonly PopBlock[], personsPerDwelling: number): void {
  if (!(personsPerDwelling > 0) || !Number.isFinite(personsPerDwelling)) {
    throw new RangeError(`province persons per dwelling ${String(personsPerDwelling)} must be positive`);
  }
  let persons = 0;
  let weightSum = 0;
  const weights = blocks.map((block) => {
    const count = personsOf(block);
    persons += count;
    const income = block.incomeSmoothedRUSDPerCapitaDay;
    const weight = count * (income > 0 ? Math.pow(income, DWELLING_INCOME_ELASTICITY) : 1);
    weightSum += weight;
    return weight;
  });
  const total = persons / personsPerDwelling;
  blocks.forEach((block, index) => {
    const count = personsOf(block);
    const dwellings = weightSum > 0 ? (total * (weights[index] ?? 0)) / weightSum : 0;
    block.dwellings = dwellings;
    block.housingReferencePersonsPerDwelling = count > 0 && dwellings > 0 ? count / dwellings : personsPerDwelling;
    block.housingReferenceIncomeRUSDPerCapitaDay = block.incomeSmoothedRUSDPerCapitaDay;
  });
}

/** Validation of a block's P6 fields: finite and non-negative. */
export function assertValidBlockHousing(block: PopBlock, path: string): void {
  for (const field of [
    "incomeSmoothedRUSDPerCapitaDay",
    "dwellings",
    "housingReferencePersonsPerDwelling",
    "housingReferenceIncomeRUSDPerCapitaDay",
  ] as const) {
    const value = block[field];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      throw new RangeError(`${path}.${field} must be a finite non-negative number`);
    }
  }
}
