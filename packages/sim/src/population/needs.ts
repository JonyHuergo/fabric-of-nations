/**
 * Daily needs evaluation against a deterministic fixture.
 *
 * The fixture supplies per-capita physical supply and per-capita annual income.
 * It is not a market and does not mutate money or accounts. One supply pool per
 * good is shared by all four tiers; only fulfilled quantities spend budget and
 * consume supply.
 */

import { dayIndexToCivilDate, daysInYear } from "../calendar.js";
import { NEED_TIER_ORDER, type NeedTier } from "./constants.js";
import {
  dailyDisposablePerCapita,
  moneyTolerance,
  orderedTier,
  quantityTolerance,
  supplyForGood,
} from "./definitions.js";
import { populationTotal } from "./state.js";
import type { World } from "../world.js";
import type { DayIndex, Id } from "../types.js";
import type {
  NeedGoodResult,
  NeedTierResult,
  NeedTierSummary,
  PopBlockNeedsResult,
  PopulationDefinitions,
  PopulationInputs,
  PopulationNeedsDayResult,
} from "./types.js";

interface DraftBlock {
  readonly blockId: Id;
  readonly population: number;
  budget: number;
  readonly budgetStart: number;
  spent: number;
  readonly tierSummaries: NeedTierSummary[];
  readonly tierResults: NeedTierResult[];
}

interface ActiveTierState {
  readonly blockId: Id;
  readonly draft: DraftBlock;
  readonly ratio: number;
  readonly fulfilled: number[];
}

function compareGoodKeys(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * Allocate a finite good supply across blocks in proportion to funded demand.
 * Results are stable for a fixed set of block IDs and are independent of input
 * array ordering.
 */
function allocateProportional(
  remainingSupply: number,
  funded: readonly number[],
): number[] {
  const allocation = new Array<number>(funded.length).fill(0);
  let totalDemand = 0;
  for (let index = 0; index < funded.length; index += 1) {
    totalDemand += funded[index] ?? 0;
  }
  if (totalDemand <= 0 || remainingSupply <= 0) {
    return allocation;
  }

  if (remainingSupply >= totalDemand - quantityTolerance(remainingSupply, totalDemand)) {
    for (let index = 0; index < funded.length; index += 1) {
      allocation[index] = Math.min(funded[index] ?? 0, remainingSupply);
    }
    return allocation;
  }

  const scale = remainingSupply / totalDemand;
  let allocated = 0;
  let largestIndex = -1;
  let largestDemand = -1;
  for (let index = 0; index < funded.length; index += 1) {
    const demand = funded[index] ?? 0;
    const value = Math.max(0, Math.min(demand, demand * scale));
    allocation[index] = value;
    allocated += value;
    if (demand > largestDemand) {
      largestDemand = demand;
      largestIndex = index;
    }
  }

  let residual = remainingSupply - allocated;
  if (Math.abs(residual) > quantityTolerance(remainingSupply, allocated) && largestIndex >= 0) {
    const current = allocation[largestIndex] ?? 0;
    const demand = funded[largestIndex] ?? 0;
    const adjusted = Math.max(0, Math.min(demand, current + residual));
    allocation[largestIndex] = adjusted;
    residual = remainingSupply - (allocated - current + adjusted);
  }
  if (Math.abs(residual) > quantityTolerance(remainingSupply, allocated)) {
    throw new RangeError(
      `proportional allocation failed to conserve supply: residual ${String(residual)}`,
    );
  }
  return allocation;
}

function summaryFor(
  tier: NeedTier,
  active: boolean,
  fullyMet: boolean,
  desiredCost: number,
  fundedCost: number,
  spent: number,
): NeedTierSummary {
  return {
    tier,
    active,
    fullyMet,
    desiredCostSUSD: desiredCost,
    fundedCostSUSD: fundedCost,
    spentSUSD: spent,
  };
}

/** Evaluate one day of needs for every pop block. */
export function settlePopulationNeeds(
  world: World,
  definitions: PopulationDefinitions,
  inputs: PopulationInputs,
  dayIndex: DayIndex,
  collectNeedDetails: boolean,
): PopulationNeedsDayResult {
  const date = dayIndexToCivilDate(dayIndex);
  const days = daysInYear(date.year);
  const region = world.regions[0];
  if (region === undefined) throw new RangeError("M2 needs requires one region");
  const blocks = [...world.popBlocks].sort((left, right) => left.id - right.id);
  const populationById = new Map<Id, number>();
  let population = 0;
  for (const block of blocks) {
    const blockPopulation = populationTotal(block);
    populationById.set(block.id, blockPopulation);
    population += blockPopulation;
  }

  const neededGoods = new Set<string>();
  for (const tier of definitions.needs) {
    for (const item of tier.items) neededGoods.add(item.goodKey);
  }
  const initialSupply: Record<string, number> = {};
  const remainingSupply: Record<string, number> = {};
  const consumedSupply: Record<string, number> = {};
  for (const goodKey of [...neededGoods].sort()) {
    const total = supplyForGood(inputs, goodKey) * population;
    initialSupply[goodKey] = total;
    remainingSupply[goodKey] = total;
    consumedSupply[goodKey] = 0;
  }
  const priceByGood = new Map<string, number>();
  for (const price of inputs.prices) {
    priceByGood.set(price.goodKey, price.unitPriceSUSD);
  }
  const incomeById = new Map<
    Id,
    { annualSettledIncomePerCapitaSUSD: number; annualMandatoryPaymentsPerCapitaSUSD: number }
  >();
  for (const income of inputs.income) {
    incomeById.set(income.popBlockId, income);
  }

  const drafts = new Map<Id, DraftBlock>();
  const lowerTiersMet = new Map<Id, boolean>();
  for (const block of blocks) {
    const blockPopulation = populationById.get(block.id);
    if (blockPopulation === undefined) throw new RangeError("missing block population");
    const income = incomeById.get(block.id);
    if (income === undefined) {
      throw new RangeError(`missing income fixture for popBlock ${String(block.id)}`);
    }
    const daily = dailyDisposablePerCapita(
      income.annualSettledIncomePerCapitaSUSD,
      income.annualMandatoryPaymentsPerCapitaSUSD,
      days,
    );
    const budgetStart = daily * blockPopulation;
    drafts.set(block.id, {
      blockId: block.id,
      population: blockPopulation,
      budget: budgetStart,
      budgetStart,
      spent: 0,
      tierSummaries: [],
      tierResults: [],
    });
    lowerTiersMet.set(block.id, true);
  }

  for (const tier of NEED_TIER_ORDER) {
    const tierDef = orderedTier(definitions, tier);
    const tierItems = [...tierDef.items].sort((left, right) =>
      compareGoodKeys(left.goodKey, right.goodKey),
    );
    const goodKeys = tierItems.map((item) => item.goodKey);
    const activeStates: ActiveTierState[] = [];

    for (const block of blocks) {
      const draft = drafts.get(block.id);
      if (draft === undefined) throw new RangeError(`missing population draft for ${String(block.id)}`);
      const active =
        draft.population > 0 &&
        (lowerTiersMet.get(block.id) ?? false) &&
        block.wealthLevel >= tierDef.activationWealthMin;
      if (!active) {
        draft.tierSummaries.push(summaryFor(tier, false, false, 0, 0, 0));
        if (collectNeedDetails) {
          draft.tierResults.push({ ...summaryFor(tier, false, false, 0, 0, 0), goods: [] });
        }
        continue;
      }

      let desiredCost = 0;
      for (let index = 0; index < tierItems.length; index += 1) {
        const item = tierItems[index];
        if (item === undefined) throw new RangeError("missing tier item");
        desiredCost +=
          item.quantityPerCapitaPerDay * draft.population * (priceByGood.get(item.goodKey) ?? 0);
      }
      const ratio = desiredCost > 0 ? Math.max(0, Math.min(1, draft.budget / desiredCost)) : 1;
      for (let index = 0; index < tierItems.length; index += 1) {
        const item = tierItems[index];
        if (item === undefined) throw new RangeError("missing tier item");
        const desired = item.quantityPerCapitaPerDay * draft.population;
        const funded = desired * ratio;
        if (funded > desired + quantityTolerance(desired, funded)) {
          throw new RangeError("funded demand exceeds desired demand");
        }
      }
      activeStates.push({
        blockId: block.id,
        draft,
        ratio,
        fulfilled: new Array<number>(tierItems.length).fill(0),
      });
    }

    for (let goodIndex = 0; goodIndex < goodKeys.length; goodIndex += 1) {
      const goodKey = goodKeys[goodIndex];
      const item = tierItems[goodIndex];
      if (goodKey === undefined || item === undefined) throw new RangeError("missing good key");
      const fundedValues = new Array<number>(activeStates.length).fill(0);
      for (let index = 0; index < activeStates.length; index += 1) {
        const state = activeStates[index];
        if (state === undefined) throw new RangeError("missing active tier state");
        const desired = item.quantityPerCapitaPerDay * state.draft.population;
        fundedValues[index] = desired * state.ratio;
      }
      const remaining = remainingSupply[goodKey] ?? 0;
      const allocation = allocateProportional(remaining, fundedValues);
      let allocatedTotal = 0;
      for (let index = 0; index < activeStates.length; index += 1) {
        const state = activeStates[index];
        if (state === undefined) throw new RangeError("missing active tier state");
        const value = allocation[index] ?? 0;
        const fundedValue = fundedValues[index] ?? 0;
        if (value < 0 || value > fundedValue + quantityTolerance(fundedValue, value)) {
          throw new RangeError("supply allocation exceeds funded demand");
        }
        state.fulfilled[goodIndex] = value;
        allocatedTotal += value;
      }
      if (allocatedTotal > remaining + quantityTolerance(remaining, allocatedTotal)) {
        throw new RangeError("supply allocation exceeds remaining supply");
      }
      remainingSupply[goodKey] = remaining - allocatedTotal;
      consumedSupply[goodKey] = (consumedSupply[goodKey] ?? 0) + allocatedTotal;
    }

    for (const state of activeStates) {
      const draft = state.draft;
      const goods: NeedGoodResult[] = [];
      let spent = 0;
      let fulfilledAll = true;
      for (let index = 0; index < goodKeys.length; index += 1) {
        const goodKey = goodKeys[index];
        const item = tierItems[index];
        if (goodKey === undefined || item === undefined) throw new RangeError("missing good key");
        const desiredValue = item.quantityPerCapitaPerDay * draft.population;
        const fundedValue = desiredValue * state.ratio;
        const fulfilledValue = state.fulfilled[index] ?? 0;
        if (fulfilledValue > fundedValue + quantityTolerance(fundedValue, fulfilledValue)) {
          throw new RangeError("fulfilled quantity exceeds funded quantity");
        }
        if (fulfilledValue > desiredValue + quantityTolerance(desiredValue, fulfilledValue)) {
          throw new RangeError("fulfilled quantity exceeds desired quantity");
        }
        if (fulfilledValue + quantityTolerance(desiredValue, fulfilledValue) < desiredValue) fulfilledAll = false;
        const unmetDesired = Math.max(0, desiredValue - fulfilledValue);
        const unmetFunded = Math.max(0, fundedValue - fulfilledValue);
        goods.push({
          goodKey,
          desired: desiredValue,
          funded: fundedValue,
          fulfilled: fulfilledValue,
          unmetDesired,
          unmetFunded,
        });
        spent += fulfilledValue * (priceByGood.get(goodKey) ?? 0);
      }
      if (spent > draft.budget + moneyTolerance(draft.budget, spent)) {
        throw new RangeError(
          `needs spend ${String(spent)} exceeds budget ${String(draft.budget)} for popBlock ${String(state.blockId)}`,
        );
      }
      draft.spent += spent;
      draft.budget = Math.max(0, draft.budget - spent);
      const desiredCost = goods.reduce(
        (total, good) => total + good.desired * (priceByGood.get(good.goodKey) ?? 0),
        0,
      );
      const fundedCost = goods.reduce(
        (total, good) => total + good.funded * (priceByGood.get(good.goodKey) ?? 0),
        0,
      );
      const summary = summaryFor(tier, true, fulfilledAll, desiredCost, fundedCost, spent);
      draft.tierSummaries.push(summary);
      if (collectNeedDetails) draft.tierResults.push({ ...summary, goods });
      if (!fulfilledAll) lowerTiersMet.set(state.blockId, false);
    }
  }

  // Update consecutive-needs counters once, after all tiers.
  for (const block of blocks) {
    const draft = drafts.get(block.id);
    if (draft === undefined) throw new RangeError("missing draft");
    if (draft.population === 0) {
      block.unmetSubsistenceDays = 0;
      block.unmetBasicDays = 0;
      block.comfortFulfilledDays = 0;
      continue;
    }
    const subsistence = draft.tierSummaries.find((summary) => summary.tier === "subsistence");
    const basic = draft.tierSummaries.find((summary) => summary.tier === "basic");
    const comfort = draft.tierSummaries.find((summary) => summary.tier === "comfort");
    const subsistenceMet = subsistence !== undefined && subsistence.active && subsistence.fullyMet;
    const basicMet = basic !== undefined && basic.active && basic.fullyMet;
    const comfortMet = comfort !== undefined && comfort.active && comfort.fullyMet;

    if (subsistenceMet) block.unmetSubsistenceDays = 0;
    else block.unmetSubsistenceDays += 1;

    if (basicMet) block.unmetBasicDays = 0;
    else block.unmetBasicDays += 1;

    if (comfortMet) block.comfortFulfilledDays += 1;
    else block.comfortFulfilledDays = 0;
  }

  const results: PopBlockNeedsResult[] = [];
  for (const block of blocks) {
    const draft = drafts.get(block.id);
    if (draft === undefined) throw new RangeError("missing draft result");
    results.push({
      popBlockId: block.id,
      population: draft.population,
      budgetStartSUSD: draft.budgetStart,
      budgetEndSUSD: draft.budget,
      spentSUSD: draft.spent,
      tiers: collectNeedDetails ? draft.tierResults : [],
      tierSummaries: draft.tierSummaries,
    });
  }

  for (const goodKey of neededGoods) {
    const initial = initialSupply[goodKey] ?? 0;
    const consumed = consumedSupply[goodKey] ?? 0;
    const remaining = remainingSupply[goodKey] ?? 0;
    if (consumed < -quantityTolerance(consumed) || remaining < -quantityTolerance(remaining)) {
      throw new RangeError(`negative supply for ${JSON.stringify(goodKey)}`);
    }
    if (Math.abs(initial - consumed - remaining) > quantityTolerance(initial, consumed, remaining)) {
      throw new RangeError(
        `supply conservation failed for ${JSON.stringify(goodKey)}: ${String(initial)} != ${String(consumed)} + ${String(remaining)}`,
      );
    }
  }

  return {
    blocks: results,
    initialSupplyByGood: initialSupply,
    remainingSupplyByGood: remainingSupply,
    consumedSupplyByGood: consumedSupply,
  };
}
