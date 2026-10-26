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
  NeedTierSummary,
  PopBlockNeedsResult,
  PopulationDefinitions,
  PopulationInputs,
  PopulationNeedsDayResult,
  WealthUpdate,
} from "./types.js";

function tierSummary(
  blockNeeds: PopBlockNeedsResult | undefined,
  tier: "subsistence" | "basic" | "comfort" | "luxury",
): NeedTierSummary | undefined {
  return blockNeeds?.tierSummaries.find((summary) => summary.tier === tier);
}

function luxuryFulfillmentRatio(blockNeeds: PopBlockNeedsResult | undefined): number {
  const summary = tierSummary(blockNeeds, "luxury");
  if (summary === undefined || !summary.active || summary.desiredCostSUSD <= 0) return 0;
  return clamp(summary.spentSUSD / summary.desiredCostSUSD, 0, 1);
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
  const needsByBlock = new Map<number, PopBlockNeedsResult>();
  for (const blockNeeds of needs.blocks) needsByBlock.set(blockNeeds.popBlockId, blockNeeds);
  const incomeById = new Map<
    number,
    { annualSettledIncomePerCapitaSUSD: number; annualMandatoryPaymentsPerCapitaSUSD: number }
  >();
  for (const income of inputs.income) incomeById.set(income.popBlockId, income);

  const updates: WealthUpdate[] = [];
  for (const block of world.popBlocks) {
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
      income.annualSettledIncomePerCapitaSUSD - income.annualMandatoryPaymentsPerCapitaSUSD,
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
      LUXURY_WEALTH_GAIN_MAX * luxuryFulfillmentRatio(needsByBlock.get(block.id));
    const newWealth = roundTo(
      clamp(smoothed - basicLoss + comfortGain + luxuryGain, WEALTH_MIN, WEALTH_MAX),
      WEALTH_DECIMAL_PLACES,
    );
    updates.push({
      popBlockId: block.id,
      oldWealthLevel: block.wealthLevel,
      targetWealthLevel: roundTo(baseTarget, WEALTH_DECIMAL_PLACES),
      newWealthLevel: newWealth,
      annualDisposableIncomePerCapitaSUSD: annualDisposable,
      annualSubsistenceCostPerCapitaSUSD: subsistenceCost,
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
  const needsByBlock = new Map<number, PopBlockNeedsResult>();
  for (const blockNeeds of needs.blocks) needsByBlock.set(blockNeeds.popBlockId, blockNeeds);
  for (const block of world.popBlocks) {
    const luxury = tierSummary(needsByBlock.get(block.id), "luxury");
    const subsistencePressure = saturate(block.unmetSubsistenceDays, MILITANCY_SCALE_DAYS);
    const basicPressure = saturate(block.unmetBasicDays, MILITANCY_SCALE_DAYS);
    const comfortRelief = saturate(block.comfortFulfilledDays, MILITANCY_SCALE_DAYS);
    const luxuryRelief =
      luxury !== undefined && luxury.active
        ? clamp(luxury.spentSUSD / Math.max(luxury.desiredCostSUSD, WEALTH_TARGET_EPSILON), 0, 1)
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
