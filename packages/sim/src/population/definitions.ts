/**
 * Validation of static population definitions and explicit fixture inputs, plus
 * deterministic schedule interpolation and shared numeric helpers.
 */

import { daysInYear } from "../calendar.js";
import { MAX_SCENARIO_ID_LENGTH } from "../constants.js";
import type { MoneyRUSD } from "../types.js";
import {
  requireArray,
  requireFiniteNumber,
  requireInteger,
  requireRecord,
  requireString,
} from "../validation.js";
import type { World } from "../world.js";
import {
  AGE_BAND_WIDTH,
  AGE_COHORT_COUNT,
  MATERNAL_AGE_GROUP_COUNT,
  MONEY_TOLERANCE_RUSD,
  NEED_TIER_ORDER,
  QUANTITY_TOLERANCE,
  SINGLE_AGE_COUNT,
  TERMINAL_AGE_INDEX,
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
  const male = requireArray(
    record.maleAnnualDeathsPer1000ByAgeBand,
    `${path}.maleAnnualDeathsPer1000ByAgeBand`,
  );
  const female = requireArray(
    record.femaleAnnualDeathsPer1000ByAgeBand,
    `${path}.femaleAnnualDeathsPer1000ByAgeBand`,
  );
  if (male.length !== AGE_COHORT_COUNT || female.length !== AGE_COHORT_COUNT) {
    throw new RangeError(`${path} must contain ${String(AGE_COHORT_COUNT)} male and female age rates`);
  }
  for (let index = 0; index < male.length; index += 1) {
    assertRateRange(
      male[index],
      `${path}.maleAnnualDeathsPer1000ByAgeBand[${String(index)}]`,
      1000,
    );
    assertRateRange(
      female[index],
      `${path}.femaleAnnualDeathsPer1000ByAgeBand[${String(index)}]`,
      1000,
    );
  }
  return {
    year,
    maleAnnualDeathsPer1000ByAgeBand: male as number[],
    femaleAnnualDeathsPer1000ByAgeBand: female as number[],
  };
}

function assertFertilityAnchor(value: unknown, path: string): FertilityAnchor {
  const record = requireRecord(value, path);
  const rates = requireArray(
    record.ageSpecificBirthsPer1000Women,
    `${path}.ageSpecificBirthsPer1000Women`,
  );
  if (rates.length !== MATERNAL_AGE_GROUP_COUNT) {
    throw new RangeError(
      `${path}.ageSpecificBirthsPer1000Women must contain ${String(MATERNAL_AGE_GROUP_COUNT)} rates`,
    );
  }
  for (let index = 0; index < rates.length; index += 1) {
    assertRateRange(
      rates[index],
      `${path}.ageSpecificBirthsPer1000Women[${String(index)}]`,
      1000,
    );
  }
  return {
    year: requireInteger(record.year, `${path}.year`, 1900, 2000),
    ageSpecificBirthsPer1000Women: rates as number[],
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

  const sexRatioAtBirth = requireFiniteNumber(
    record.sexRatioAtBirth,
    "definitions.sexRatioAtBirth",
  );
  if (!(sexRatioAtBirth > 0)) {
    throw new RangeError("definitions.sexRatioAtBirth must be positive");
  }

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
  if (world.provinceEconomies.length !== 1) {
    throw new RangeError("M2 needs fixture supports exactly one province");
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
    assertNonNegative(item.unitPriceRUSD, `population inputs.prices[${String(index)}].unitPriceRUSD`);
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
      item.annualSettledIncomePerCapitaRUSD,
      `population inputs.income[${String(index)}].annualSettledIncomePerCapitaRUSD`,
    );
    assertNonNegative(
      item.annualMandatoryPaymentsPerCapitaRUSD,
      `population inputs.income[${String(index)}].annualMandatoryPaymentsPerCapitaRUSD`,
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

/** Interpolate one five-year band's annual mortality rate per 1,000 for a sex. */
export function mortalityRatePer1000(
  definitions: PopulationDefinitions,
  year: number,
  ageBand: number,
  sex: "male" | "female",
): number {
  if (!Number.isInteger(ageBand) || ageBand < 0 || ageBand >= AGE_COHORT_COUNT) {
    throw new RangeError(`ageBand must be in 0..${String(AGE_COHORT_COUNT - 1)}`);
  }
  return interpolateAnchors(definitions.mortalityAnchors, year, (anchor) =>
    sex === "male"
      ? anchor.maleAnnualDeathsPer1000ByAgeBand[ageBand] ?? 0
      : anchor.femaleAnnualDeathsPer1000ByAgeBand[ageBand] ?? 0,
  );
}

/** Interpolate one maternal band's annual ASFR per 1,000 women for a civil year. */
export function ageSpecificFertilityRatePer1000(
  definitions: PopulationDefinitions,
  year: number,
  maternalBand: number,
): number {
  if (
    !Number.isInteger(maternalBand) ||
    maternalBand < 0 ||
    maternalBand >= MATERNAL_AGE_GROUP_COUNT
  ) {
    throw new RangeError(
      `maternalBand must be in 0..${String(MATERNAL_AGE_GROUP_COUNT - 1)}`,
    );
  }
  return interpolateAnchors(
    definitions.fertilityAnchors,
    year,
    (anchor) => anchor.ageSpecificBirthsPer1000Women[maternalBand] ?? 0,
  );
}

/** Map a single-year age to its five-year reporting band. */
export function fiveYearAgeGroupForAge(age: number): number {
  if (!Number.isInteger(age) || age < 0 || age >= SINGLE_AGE_COUNT) {
    throw new RangeError(`age must be in 0..${String(SINGLE_AGE_COUNT - 1)}`);
  }
  return Math.min(Math.floor(age / AGE_BAND_WIDTH), TERMINAL_AGE_INDEX);
}

/**
 * Expand 17 five-year age-group totals into 81 single-year ages.
 *
 * Within finite five-year bands, the remainder is assigned one person at a time
 * to the youngest ages before falling back to the quotient; this is a documented
 * uniform within-band assumption, not extra historical information. The 80+
 * band maps entirely to terminal age 80.
 */
export function expandAgeGroupsToSingle(
  groups: readonly number[],
  path: string,
): Uint32Array {
  if (groups.length !== AGE_COHORT_COUNT) {
    throw new RangeError(`${path} must contain ${String(AGE_COHORT_COUNT)} age groups`);
  }
  const output = new Uint32Array(SINGLE_AGE_COUNT);
  for (let band = 0; band < AGE_COHORT_COUNT; band += 1) {
    const raw = groups[band];
    if (raw === undefined) throw new RangeError(`${path}[${String(band)}] is missing`);
    const value = requireInteger(raw, `${path}[${String(band)}]`, 0, 0xffff_ffff);
    if (band === AGE_COHORT_COUNT - 1) {
      output[TERMINAL_AGE_INDEX] = value;
      continue;
    }
    const base = Math.floor(value / AGE_BAND_WIDTH);
    const remainder = value % AGE_BAND_WIDTH;
    for (let offset = 0; offset < AGE_BAND_WIDTH; offset += 1) {
      output[band * AGE_BAND_WIDTH + offset] = base + (offset < remainder ? 1 : 0);
    }
  }
  let total = 0;
  for (const value of output) total += value;
  if (!Number.isSafeInteger(total)) {
    throw new RangeError(`${path} expanded age total is not a safe integer`);
  }
  return output;
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

  // M2.1 WPP schedules are annual from 1950 onward. Avoid a search on the
  // hottest path when the definitions have that canonical layout.
  if (Number.isInteger(year) && year >= 1950 && anchors[2]?.year === 1950) {
    const annual = anchors[2 + (year - 1950)];
    if (annual?.year === year) return select(annual);
  }

  let low = 1;
  let high = anchors.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const anchor = anchors[middle];
    if (anchor === undefined) break;
    if (year <= anchor.year) high = middle;
    else low = middle + 1;
  }
  const upper = anchors[low];
  const lower = anchors[low - 1];
  if (lower === undefined || upper === undefined) return select(last);
  if (year === upper.year) return select(upper);
  const fraction = (year - lower.year) / (upper.year - lower.year);
  return select(lower) + (select(upper) - select(lower)) * fraction;
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
  return found.unitPriceRUSD;
}

/** Per-capita supply for a good, or a clear error. */
export function supplyForGood(inputs: PopulationInputs, goodKey: string): number {
  const found = inputs.supply.find((supply) => supply.goodKey === goodKey);
  if (found === undefined) throw new RangeError(`missing fixture supply for ${JSON.stringify(goodKey)}`);
  return found.availableQuantityPerCapita;
}

/** Daily per-capita disposable income; never negative. */
export function dailyDisposablePerCapita(
  annualIncomePerCapita: MoneyRUSD,
  annualMandatoryPerCapita: MoneyRUSD,
  daysInCivilYear: number,
): number {
  if (daysInCivilYear <= 0) throw new RangeError("daysInCivilYear must be positive");
  return Math.max(0, annualIncomePerCapita - annualMandatoryPerCapita) / daysInCivilYear;
}

/** Tolerance for physical quantity and supply invariant checks. */
/**
 * QUANTITY_TOLERANCE scaled by the largest magnitude, at least 1. Fixed arity (D-139): the
 * former rest parameter allocated an array on every call; a missing value is 0,
 * which never raises the scale above 1, so the result is unchanged.
 */
export function quantityTolerance(a: number, b = 0, c = 0, d = 0, e = 0, f = 0, g = 0, h = 0): number {
  return (
    QUANTITY_TOLERANCE *
    Math.max(1, Math.abs(a), Math.abs(b), Math.abs(c), Math.abs(d), Math.abs(e), Math.abs(f), Math.abs(g), Math.abs(h))
  );
}

/** Tolerance for RUSD invariant checks. */
/**
 * MONEY_TOLERANCE_RUSD scaled by the largest magnitude, at least 1. Fixed arity (D-139): the
 * former rest parameter allocated an array on every call; a missing value is 0,
 * which never raises the scale above 1, so the result is unchanged.
 */
export function moneyTolerance(a: number, b = 0, c = 0, d = 0, e = 0, f = 0, g = 0, h = 0): number {
  return (
    MONEY_TOLERANCE_RUSD *
    Math.max(1, Math.abs(a), Math.abs(b), Math.abs(c), Math.abs(d), Math.abs(e), Math.abs(f), Math.abs(g), Math.abs(h))
  );
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
