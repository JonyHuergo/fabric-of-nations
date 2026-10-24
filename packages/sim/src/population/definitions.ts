/**
 * Validation of static population definitions and explicit fixture inputs, plus
 * deterministic schedule interpolation and shared numeric helpers.
 */

import { daysInYear } from "../calendar.js";
import { MAX_SCENARIO_ID_LENGTH } from "../constants.js";
import type { MoneySUSD } from "../types.js";
import {
  requireArray,
  requireFiniteNumber,
  requireInteger,
  requireRecord,
  requireString,
} from "../validation.js";
import type { World } from "../world.js";
import {
  AGE_COHORT_COUNT,
  MONEY_TOLERANCE_SUSD,
  NEED_TIER_ORDER,
  QUANTITY_TOLERANCE,
  type NeedTier,
} from "./constants.js";
import type {
  FertilityAnchor,
  MortalityAnchor,
  NeedTierDef,
  PopulationDefinitions,
  PopulationInputs,
} from "./types.js";

function assertRateRange(value: unknown, path: string, maximum: number): number {
  const number = requireFiniteNumber(value, path);
  if (number < 0 || number > maximum) {
    throw new RangeError(`${path} must be in 0..${String(maximum)}, received ${String(number)}`);
  }
  return number;
}

function assertNonNegative(value: unknown, path: string): number {
  const number = requireFiniteNumber(value, path);
  if (number < 0) {
    throw new RangeError(`${path} must be non-negative, received ${String(number)}`);
  }
  return number;
}

function assertNeedTierDef(value: unknown, path: string): NeedTierDef {
  const record = requireRecord(value, path);
  const tier = requireString(record.tier, `${path}.tier`);
  if (!(NEED_TIER_ORDER as readonly string[]).includes(tier)) {
    throw new RangeError(`${path}.tier is not a valid need tier`);
  }
  const activation = requireFiniteNumber(record.activationWealthMin, `${path}.activationWealthMin`);
  if (activation < 0 || activation > 99) {
    throw new RangeError(`${path}.activationWealthMin must be in 0..99`);
  }
  const items = requireArray(record.items, `${path}.items`);
  const seenGoods = new Set<string>();
  for (let index = 0; index < items.length; index += 1) {
    const item = requireRecord(items[index], `${path}.items[${String(index)}]`);
    const goodKey = requireString(item.goodKey, `${path}.items[${String(index)}].goodKey`, {
      minLength: 1,
    });
    if (seenGoods.has(goodKey)) {
      throw new RangeError(`${path}.items contains duplicate goodKey ${JSON.stringify(goodKey)}`);
    }
    seenGoods.add(goodKey);
    assertNonNegative(
      item.quantityPerCapitaPerDay,
      `${path}.items[${String(index)}].quantityPerCapitaPerDay`,
    );
  }
  return {
    tier: tier as NeedTier,
    items: items as NeedTierDef["items"],
    activationWealthMin: activation,
  };
}

function assertMortalityAnchor(value: unknown, path: string): MortalityAnchor {
  const record = requireRecord(value, path);
  const year = requireInteger(record.year, `${path}.year`, 1900, 2000);
  const rates = requireArray(record.annualDeathsPer1000ByAgeBand, `${path}.annualDeathsPer1000ByAgeBand`);
  if (rates.length !== AGE_COHORT_COUNT) {
    throw new RangeError(`${path} must contain ${String(AGE_COHORT_COUNT)} age rates`);
  }
  for (let index = 0; index < rates.length; index += 1) {
    assertRateRange(rates[index], `${path}.annualDeathsPer1000ByAgeBand[${String(index)}]`, 1000);
  }
  return {
    year,
    annualDeathsPer1000ByAgeBand: rates as number[],
  };
}

function assertFertilityAnchor(value: unknown, path: string): FertilityAnchor {
  const record = requireRecord(value, path);
  return {
    year: requireInteger(record.year, `${path}.year`, 1900, 2000),
    annualBirthsPer1000: assertRateRange(
      record.annualBirthsPer1000,
      `${path}.annualBirthsPer1000`,
      1000,
    ),
  };
}

function assertSortedYears(values: readonly { year: number }[], path: string): void {
  for (let index = 1; index < values.length; index += 1) {
    const previous = values[index - 1];
    const current = values[index];
    if (previous === undefined || current === undefined || current.year <= previous.year) {
      throw new RangeError(`${path} years must be strictly increasing`);
    }
  }
}

/** Validate all immutable population definitions. */
export function assertValidPopulationDefinitions(definitions: PopulationDefinitions): void {
  const record = requireRecord(definitions, "definitions");
  requireString(record.dataVersion, "definitions.dataVersion", {
    minLength: 1,
    maxLength: MAX_SCENARIO_ID_LENGTH,
  });
  requireString(record.scenarioId, "definitions.scenarioId", {
    minLength: 1,
    maxLength: MAX_SCENARIO_ID_LENGTH,
  });

  const needs = requireArray(record.needs, "definitions.needs");
  if (needs.length !== NEED_TIER_ORDER.length) {
    throw new RangeError(`definitions.needs must contain exactly ${String(NEED_TIER_ORDER.length)} tiers`);
  }
  const validatedNeeds = needs.map((value, index) => assertNeedTierDef(value, `definitions.needs[${String(index)}]`));
  for (const tier of NEED_TIER_ORDER) {
    if (!validatedNeeds.some((need) => need.tier === tier)) {
      throw new RangeError(`definitions.needs is missing tier ${tier}`);
    }
  }
  const ordered = NEED_TIER_ORDER.map((tier) => {
    const found = validatedNeeds.find((need) => need.tier === tier);
    if (found === undefined) throw new RangeError(`missing need tier ${tier}`);
    return found;
  });
  if (
    ordered[0]?.activationWealthMin !== 0 ||
    ordered[1]?.activationWealthMin !== 0
  ) {
    throw new RangeError("subsistence and basic need tiers must activate at wealth 0");
  }
  if (
    ordered[1] === undefined ||
    ordered[2] === undefined ||
    ordered[3] === undefined ||
    ordered[2].activationWealthMin < ordered[1].activationWealthMin ||
    ordered[3].activationWealthMin < ordered[2].activationWealthMin
  ) {
    throw new RangeError("need-tier activation thresholds must be non-decreasing");
  }

  const mortality = requireArray(record.mortalityAnchors, "definitions.mortalityAnchors");
  if (mortality.length === 0) throw new RangeError("definitions.mortalityAnchors must not be empty");
  const mortalityAnchors = mortality.map((value, index) =>
    assertMortalityAnchor(value, `definitions.mortalityAnchors[${String(index)}]`),
  );
  assertSortedYears(mortalityAnchors, "definitions.mortalityAnchors");

  const fertility = requireArray(record.fertilityAnchors, "definitions.fertilityAnchors");
  if (fertility.length === 0) throw new RangeError("definitions.fertilityAnchors must not be empty");
  const fertilityAnchors = fertility.map((value, index) =>
    assertFertilityAnchor(value, `definitions.fertilityAnchors[${String(index)}]`),
  );
  assertSortedYears(fertilityAnchors, "definitions.fertilityAnchors");

  const multipliers = requireArray(record.fertilityMultipliers, "definitions.fertilityMultipliers");
  const professionIds = new Set<number>();
  for (let index = 0; index < multipliers.length; index += 1) {
    const item = requireRecord(multipliers[index], `definitions.fertilityMultipliers[${String(index)}]`);
    const professionId = requireInteger(
      item.professionId,
      `definitions.fertilityMultipliers[${String(index)}].professionId`,
      0,
      0xffff_ffff,
    );
    if (professionIds.has(professionId)) {
      throw new RangeError(`duplicate fertility multiplier for profession ${String(professionId)}`);
    }
    professionIds.add(professionId);
    assertNonNegative(
      item.multiplier,
      `definitions.fertilityMultipliers[${String(index)}].multiplier`,
    );
  }
}

/** Validate fixture inputs against the world and definitions. */
export function assertValidPopulationInputs(
  world: World,
  definitions: PopulationDefinitions,
  inputs: PopulationInputs,
): void {
  if (world.dataVersion !== definitions.dataVersion) {
    throw new RangeError("population definitions dataVersion does not match world.dataVersion");
  }
  if (world.scenarioId !== definitions.scenarioId) {
    throw new RangeError("population definitions scenarioId does not match world.scenarioId");
  }
  if (world.regions.length !== 1) {
    throw new RangeError("M2 needs fixture supports exactly one region");
  }

  const neededGoods = new Set<string>();
  for (const tier of definitions.needs) {
    for (const item of tier.items) neededGoods.add(item.goodKey);
  }

  const prices = requireArray(inputs.prices, "population inputs.prices");
  const priceKeys = new Set<string>();
  for (let index = 0; index < prices.length; index += 1) {
    const item = requireRecord(prices[index], `population inputs.prices[${String(index)}]`);
    const key = requireString(item.goodKey, `population inputs.prices[${String(index)}].goodKey`, {
      minLength: 1,
    });
    if (priceKeys.has(key)) {
      throw new RangeError(`duplicate fixture price for good ${JSON.stringify(key)}`);
    }
    priceKeys.add(key);
    assertNonNegative(item.unitPriceSUSD, `population inputs.prices[${String(index)}].unitPriceSUSD`);
  }
  for (const good of neededGoods) {
    if (!priceKeys.has(good)) {
      throw new RangeError(`missing fixture price for needed good ${JSON.stringify(good)}`);
    }
  }
  for (const key of priceKeys) {
    if (!neededGoods.has(key)) {
      throw new RangeError(`fixture price provided for unused good ${JSON.stringify(key)}`);
    }
  }

  const supply = requireArray(inputs.supply, "population inputs.supply");
  const supplyKeys = new Set<string>();
  for (let index = 0; index < supply.length; index += 1) {
    const item = requireRecord(supply[index], `population inputs.supply[${String(index)}]`);
    const key = requireString(item.goodKey, `population inputs.supply[${String(index)}].goodKey`, {
      minLength: 1,
    });
    if (supplyKeys.has(key)) {
      throw new RangeError(`duplicate fixture supply for good ${JSON.stringify(key)}`);
    }
    supplyKeys.add(key);
    assertNonNegative(
      item.availableQuantityPerCapita,
      `population inputs.supply[${String(index)}].availableQuantityPerCapita`,
    );
  }
  for (const good of neededGoods) {
    if (!supplyKeys.has(good)) {
      throw new RangeError(`missing fixture supply for needed good ${JSON.stringify(good)}`);
    }
  }
  for (const key of supplyKeys) {
    if (!neededGoods.has(key)) {
      throw new RangeError(`fixture supply provided for unused good ${JSON.stringify(key)}`);
    }
  }

  const income = requireArray(inputs.income, "population inputs.income");
  const incomeIds = new Set<number>();
  const blockIds = new Set<number>(world.popBlocks.map((block) => block.id));
  for (let index = 0; index < income.length; index += 1) {
    const item = requireRecord(income[index], `population inputs.income[${String(index)}]`);
    const popBlockId = requireInteger(
      item.popBlockId,
      `population inputs.income[${String(index)}].popBlockId`,
      0,
      0xffff_ffff,
    );
    if (incomeIds.has(popBlockId)) {
      throw new RangeError(`duplicate income fixture for popBlock ${String(popBlockId)}`);
    }
    incomeIds.add(popBlockId);
    assertNonNegative(
      item.annualSettledIncomePerCapitaSUSD,
      `population inputs.income[${String(index)}].annualSettledIncomePerCapitaSUSD`,
    );
    assertNonNegative(
      item.annualMandatoryPaymentsPerCapitaSUSD,
      `population inputs.income[${String(index)}].annualMandatoryPaymentsPerCapitaSUSD`,
    );
  }
  for (const block of world.popBlocks) {
    if (!incomeIds.has(block.id)) {
      throw new RangeError(`missing income fixture for popBlock ${String(block.id)}`);
    }
    if (!definitions.fertilityMultipliers.some((entry) => entry.professionId === block.professionId)) {
      throw new RangeError(
        `missing fertility multiplier for popBlock ${String(block.id)} profession ${String(block.professionId)}`,
      );
    }
  }
  for (const id of incomeIds) {
    if (!blockIds.has(id)) {
      throw new RangeError(`income fixture references unknown popBlock ${String(id)}`);
    }
  }

  const subsistence = orderedTier(definitions, "subsistence");
  let subsistenceCost = 0;
  for (const item of subsistence.items) {
    const price = priceForGood(inputs, item.goodKey);
    subsistenceCost += item.quantityPerCapitaPerDay * price;
  }
  if (!(subsistenceCost > 0)) {
    throw new RangeError(
      "subsistence basket must have a strictly positive annual cost for the wealth formula",
    );
  }
}

/** Interpolate one cohort's annual mortality rate per 1000 for a civil year. */
export function mortalityRatePer1000(
  definitions: PopulationDefinitions,
  year: number,
  cohortIndex: number,
): number {
  if (!Number.isInteger(cohortIndex) || cohortIndex < 0 || cohortIndex >= AGE_COHORT_COUNT) {
    throw new RangeError(`cohortIndex must be in 0..${String(AGE_COHORT_COUNT - 1)}`);
  }
  return interpolateAnchors(
    definitions.mortalityAnchors,
    year,
    (anchor) => anchor.annualDeathsPer1000ByAgeBand[cohortIndex] ?? 0,
  );
}

/** Interpolate the crude annual birth rate per 1000 for a civil year. */
export function crudeBirthRatePer1000(
  definitions: PopulationDefinitions,
  year: number,
): number {
  return interpolateAnchors(definitions.fertilityAnchors, year, (anchor) => anchor.annualBirthsPer1000);
}

function interpolateAnchors<T extends { year: number }>(
  anchors: readonly T[],
  year: number,
  select: (anchor: T) => number,
): number {
  const first = anchors[0];
  const last = anchors[anchors.length - 1];
  if (first === undefined || last === undefined) {
    throw new RangeError("cannot interpolate empty anchor list");
  }
  if (year <= first.year) return select(first);
  if (year >= last.year) return select(last);
  for (let index = 1; index < anchors.length; index += 1) {
    const lower = anchors[index - 1];
    const upper = anchors[index];
    if (lower === undefined || upper === undefined) continue;
    if (year <= upper.year) {
      const fraction = (year - lower.year) / (upper.year - lower.year);
      return select(lower) + (select(upper) - select(lower)) * fraction;
    }
  }
  return select(last);
}

/** Find a tier definition by key. */
export function orderedTier(
  definitions: PopulationDefinitions,
  tier: NeedTier,
): NeedTierDef {
  const found = definitions.needs.find((need) => need.tier === tier);
  if (found === undefined) throw new RangeError(`definitions missing need tier ${tier}`);
  return found;
}

/** Unit price for a good, or a clear error. */
export function priceForGood(inputs: PopulationInputs, goodKey: string): number {
  const found = inputs.prices.find((price) => price.goodKey === goodKey);
  if (found === undefined) throw new RangeError(`missing fixture price for ${JSON.stringify(goodKey)}`);
  return found.unitPriceSUSD;
}

/** Per-capita supply for a good, or a clear error. */
export function supplyForGood(inputs: PopulationInputs, goodKey: string): number {
  const found = inputs.supply.find((supply) => supply.goodKey === goodKey);
  if (found === undefined) throw new RangeError(`missing fixture supply for ${JSON.stringify(goodKey)}`);
  return found.availableQuantityPerCapita;
}

/** Daily per-capita disposable income; never negative. */
export function dailyDisposablePerCapita(
  annualIncomePerCapita: MoneySUSD,
  annualMandatoryPerCapita: MoneySUSD,
  daysInCivilYear: number,
): number {
  if (daysInCivilYear <= 0) throw new RangeError("daysInCivilYear must be positive");
  return Math.max(0, annualIncomePerCapita - annualMandatoryPerCapita) / daysInCivilYear;
}

/** Tolerance for physical quantity and supply invariant checks. */
export function quantityTolerance(...values: number[]): number {
  let scale = 1;
  for (const value of values) scale = Math.max(scale, Math.abs(value));
  return QUANTITY_TOLERANCE * scale;
}

/** Tolerance for SUSD invariant checks. */
export function moneyTolerance(...values: number[]): number {
  let scale = 1;
  for (const value of values) scale = Math.max(scale, Math.abs(value));
  return MONEY_TOLERANCE_SUSD * scale;
}

/** Saturating pressure in [0,1). */
export function saturate(days: number, scaleDays: number): number {
  if (days <= 0) return 0;
  if (!(scaleDays > 0)) throw new RangeError("scaleDays must be positive");
  return days / (days + scaleDays);
}

/** Round a stored floating indicator deterministically. */
export function roundTo(value: number, decimalPlaces: number): number {
  if (!Number.isFinite(value)) throw new RangeError("cannot round a non-finite value");
  const factor = 10 ** decimalPlaces;
  const rounded = Math.round(value * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/** Annual subsistence basket cost per person for one civil year. */
export function annualSubsistenceCostPerCapita(
  definitions: PopulationDefinitions,
  inputs: PopulationInputs,
  year: number,
): number {
  const subsistence = orderedTier(definitions, "subsistence");
  let dailyCost = 0;
  for (const item of subsistence.items) {
    dailyCost += item.quantityPerCapitaPerDay * priceForGood(inputs, item.goodKey);
  }
  return dailyCost * daysInYear(year);
}

/** Clamp helper used only for defined indicator ranges. */
export function clamp(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) throw new RangeError("cannot clamp a non-finite value");
  if (minimum > maximum) throw new RangeError("minimum must not exceed maximum");
  return Math.min(maximum, Math.max(minimum, value));
}

/** Assert a remainder is in [0,1). */
export function assertRemainderValue(value: number, path: string): void {
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new RangeError(`${path} must be in [0,1)`);
  }
}
