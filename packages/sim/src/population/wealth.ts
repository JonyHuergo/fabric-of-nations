/**
 * Wealth/standard-of-living and daily pop-block militancy.
 *
 * The base wealth target is the GDD formula. Monthly smoothing is applied once
 * and then bounded, separately documented need effects are applied. Coefficients
 * are provisional and live in population/constants.ts.
 */

import { dayIndexToCivilDate } from "../calendar.js";
import type { World } from "../world.js";
import type { DayIndex } from "../types.js";
import {
  BASIC_WEALTH_LOSS_MAX,
  BASIC_WEALTH_SCALE_DAYS,
  COMFORT_WEALTH_GAIN_MAX,
  COMFORT_WEALTH_SCALE_DAYS,
  LUXURY_WEALTH_GAIN_MAX,
  MILITANCY_BASE,
  MILITANCY_BASIC_WEIGHT,
  MILITANCY_COMFORT_WEIGHT,
  MILITANCY_DAILY_SMOOTHING,
  MILITANCY_LUXURY_WEIGHT,
  MILITANCY_SCALE_DAYS,
  MILITANCY_SUBSISTENCE_WEIGHT,
  RATE_DECIMAL_PLACES,
  WEALTH_DECIMAL_PLACES,
  WEALTH_INTERCEPT,
  WEALTH_MAX,
  WEALTH_MIN,
  WEALTH_MONTHLY_SMOOTHING,
  WEALTH_SLOPE,
  WEALTH_TARGET_EPSILON,
} from "./constants.js";
import {
  annualSubsistenceCostPerCapita,
  clamp,
  roundTo,
  saturate,
} from "./definitions.js";
import type {
  PopBlockNeedsResult,
  PopulationDefinitions,
  PopulationInputs,
  PopulationNeedsDayResult,
  WealthUpdate,
} from "./types.js";

import { needsReader, type NeedsReader } from "./needsColumns.js";
/**
 * D-158: the needs result of each block of `blocks` by position. The integrated day lists
 * results in block order, so the result at the same position is the block's; otherwise
 * (another caller's order) the lookup falls back to a map by block id.
 */
export function needsByPosition(
  blocks: readonly { readonly id: number }[],
  results: readonly PopBlockNeedsResult[],
): (position: number) => PopBlockNeedsResult | undefined {
  let aligned = results.length === blocks.length;
  for (let index = 0; aligned && index < blocks.length; index += 1) {
    if (results[index]?.popBlockId !== blocks[index]?.id) aligned = false;
  }
  if (aligned) return (position) => results[position];
  const byId = new Map<number, PopBlockNeedsResult>();
  for (const result of results) byId.set(result.popBlockId, result);
  return (position) => byId.get(blocks[position]?.id ?? -1);
}

function luxuryFulfillmentRatio(reader: NeedsReader, position: number): number {
  if (!reader.hasTier(position, "luxury") || !reader.active(position, "luxury")) return 0;
  const desired = reader.desiredCostRUSD(position, "luxury");
  if (desired <= 0) return 0;
  return clamp(reader.spentRUSD(position, "luxury") / desired, 0, 1);
}

/**
 * Update wealth for every pop block. Call on the last civil day of a month.
 * Inputs are annual per-capita disposable income and annual subsistence cost.
 */
export function updateMonthlyWealth(
  world: World,
  definitions: PopulationDefinitions,
  inputs: PopulationInputs,
  dayIndex: DayIndex,
  needs: PopulationNeedsDayResult,
  annualSubsistenceCostByBlock?: ReadonlyMap<number, number>,
): WealthUpdate[] {
  const year = dayIndexToCivilDate(dayIndex).year;
  const annualSubsistenceCost = annualSubsistenceCostPerCapita(definitions, inputs, year);
  if (!(annualSubsistenceCost > 0)) {
    throw new RangeError(
      "annual subsistence basket cost must be positive for the wealth formula",
    );
  }
  // D-158: the result's columns (or objects) by block position.
  const reader = needsReader(world.popBlocks, needs);
  const incomeById = new Map<
    number,
    { annualSettledIncomePerCapitaRUSD: number; annualMandatoryPaymentsPerCapitaRUSD: number }
  >();
  for (const income of inputs.income) incomeById.set(income.popBlockId, income);

  const updates: WealthUpdate[] = [];
  for (let position = 0; position < world.popBlocks.length; position += 1) {
    const block = world.popBlocks[position] as World["popBlocks"][number];
    const income = incomeById.get(block.id);
    if (income === undefined) {
      throw new RangeError(`missing income fixture for popBlock ${String(block.id)}`);
    }
    // M5: a multi-market world has no single basket price. The caller may pass
    // the block's own market basket cost; otherwise the shared fixture cost is
    // used (M2 path).
    const blockSubsistenceCost = annualSubsistenceCostByBlock?.get(block.id);
    const subsistenceCost = blockSubsistenceCost ?? annualSubsistenceCost;
    if (!(subsistenceCost > 0)) {
      throw new RangeError(
        `subsistence basket cost must be positive for popBlock ${String(block.id)}`,
      );
    }
    const annualDisposable = Math.max(
      0,
      income.annualSettledIncomePerCapitaRUSD - income.annualMandatoryPaymentsPerCapitaRUSD,
    );
    const ratio = annualDisposable / subsistenceCost;
    const baseTarget = clamp(
      WEALTH_INTERCEPT + WEALTH_SLOPE * Math.log(Math.max(ratio, WEALTH_TARGET_EPSILON)),
      WEALTH_MIN,
      WEALTH_MAX,
    );
    const smoothed =
      block.wealthLevel + (baseTarget - block.wealthLevel) * WEALTH_MONTHLY_SMOOTHING;
    const basicLoss =
      BASIC_WEALTH_LOSS_MAX * saturate(block.unmetBasicDays, BASIC_WEALTH_SCALE_DAYS);
    const comfortGain =
      COMFORT_WEALTH_GAIN_MAX * saturate(block.comfortFulfilledDays, COMFORT_WEALTH_SCALE_DAYS);
    const luxuryGain =
      LUXURY_WEALTH_GAIN_MAX * luxuryFulfillmentRatio(reader, position);
    const newWealth = roundTo(
      clamp(smoothed - basicLoss + comfortGain + luxuryGain, WEALTH_MIN, WEALTH_MAX),
      WEALTH_DECIMAL_PLACES,
    );
    updates.push({
      popBlockId: block.id,
      oldWealthLevel: block.wealthLevel,
      targetWealthLevel: roundTo(baseTarget, WEALTH_DECIMAL_PLACES),
      newWealthLevel: newWealth,
      annualDisposableIncomePerCapitaRUSD: annualDisposable,
      annualSubsistenceCostPerCapitaRUSD: subsistenceCost,
    });
    block.wealthLevel = newWealth;
  }
  return updates;
}

/** Update daily pop-block militancy after the needs stage. */
export function updateDailyMilitancy(
  world: World,
  needs: PopulationNeedsDayResult,
): void {
  const reader = needsReader(world.popBlocks, needs);
  for (let position = 0; position < world.popBlocks.length; position += 1) {
    const block = world.popBlocks[position] as World["popBlocks"][number];
    const luxury =
      reader.hasTier(position, "luxury")
        ? {
            active: reader.active(position, "luxury"),
            spentRUSD: reader.spentRUSD(position, "luxury"),
            desiredCostRUSD: reader.desiredCostRUSD(position, "luxury"),
          }
        : undefined;
    const subsistencePressure = saturate(block.unmetSubsistenceDays, MILITANCY_SCALE_DAYS);
    const basicPressure = saturate(block.unmetBasicDays, MILITANCY_SCALE_DAYS);
    const comfortRelief = saturate(block.comfortFulfilledDays, MILITANCY_SCALE_DAYS);
    const luxuryRelief =
      luxury !== undefined && luxury.active
        ? clamp(luxury.spentRUSD / Math.max(luxury.desiredCostRUSD, WEALTH_TARGET_EPSILON), 0, 1)
        : 0;

    const target = clamp(
      MILITANCY_BASE +
        MILITANCY_SUBSISTENCE_WEIGHT * subsistencePressure +
        MILITANCY_BASIC_WEIGHT * basicPressure -
        MILITANCY_COMFORT_WEIGHT * comfortRelief -
        MILITANCY_LUXURY_WEIGHT * luxuryRelief,
      0,
      1,
    );
    const next = clamp(
      block.militancy + (target - block.militancy) * MILITANCY_DAILY_SMOOTHING,
      0,
      1,
    );
    block.militancy = roundTo(next, RATE_DECIMAL_PLACES);
  }
}
