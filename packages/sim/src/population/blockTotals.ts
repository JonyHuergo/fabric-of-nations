/**
 * D-158: the day's population totals of every block, measured once.
 *
 * Twenty phases summed each block's 202 age cells again (persons, working-age persons),
 * about a dozen times a day for 20,739 blocks. The cells change only in the day's
 * demography and the month-start labour phase, so after those the totals are fixed for
 * the rest of the day; `runEconomicDay` measures them then and passes this record to the
 * later phases explicitly. It is derived (recomputable from the cells at any time), never
 * stored in the world, and only valid until a block's cells change again.
 *
 * Sums of integer cells are exact in any order, so a phase reading the record computes the
 * same values as one summing the cells.
 */

import { populationTotal, workingAgePopulation } from "./state.js";
import type { PopBlock } from "./types.js";

export interface BlockTotals {
  /** Persons by block id; NaN for an id without a block. */
  readonly population: Float64Array;
  /** Working-age persons by block id; NaN for an id without a block. */
  readonly workingAge: Float64Array;
}

/** Measure every block's totals (a block id beyond the record's range is measured on demand). */
export function measureBlockTotals(blocks: readonly PopBlock[]): BlockTotals {
  let maxId = -1;
  for (let blockIndex = 0; blockIndex < blocks.length; blockIndex += 1) {
    const block = blocks[blockIndex]!;
    if (block.id > maxId) maxId = block.id;
  }
  const population = new Float64Array(maxId + 1).fill(Number.NaN);
  const workingAge = new Float64Array(maxId + 1).fill(Number.NaN);
  for (let blockIndex = 0; blockIndex < blocks.length; blockIndex += 1) {
    const block = blocks[blockIndex]!;
    population[block.id] = populationTotal(block);
    workingAge[block.id] = workingAgePopulation(block);
  }
  return { population, workingAge };
}

/** Persons of a block: the measured total, or the cells summed when none was measured. */
export function personsOfBlock(totals: BlockTotals | undefined, block: PopBlock): number {
  if (totals !== undefined && block.id >= 0 && block.id < totals.population.length) {
    const value = totals.population[block.id] ?? Number.NaN;
    if (!Number.isNaN(value)) return value;
  }
  return populationTotal(block);
}

/** Working-age persons of a block: the measured total, or the cells summed. */
export function workingAgeOfBlock(totals: BlockTotals | undefined, block: PopBlock): number {
  if (totals !== undefined && block.id >= 0 && block.id < totals.workingAge.length) {
    const value = totals.workingAge[block.id] ?? Number.NaN;
    if (!Number.isNaN(value)) return value;
  }
  return workingAgePopulation(block);
}
