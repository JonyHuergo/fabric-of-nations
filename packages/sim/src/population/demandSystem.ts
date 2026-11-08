/**
 * P6 (D-153): the linear expenditure system of households (plan §2, Q1b, Q2, Q13–Q16).
 *
 * For a block with A adult equivalents, persons N, smoothed income y per person per day,
 * cash M and marginal propensity to consume μ (by stratum):
 *
 *   p̃_g   = p_g + u (m^c_g p_commerce + m^t_g p_transport)   retail price (u = urban share)
 *   c      = Σ_g p̃_g γ_g                                     committed cost per adult equivalent
 *   Y      = y N + λ/D · max(0, M − R)                         income plus drawdown above the reserve R
 *   C      = cA + μ (Y − cA)                                   consumption (the rest is saved)
 *   x      = C / (cA)                                          consumption ratio (≥ 1)
 *   S_k    = cA · G_k(x),  G_k(x) = ∫₁ˣ β_k(u) du               supernumerary spending of category k
 *   w_g    ∝ α_g(x) · τ_g · (p̃_g / b_g)^(1−σ_k)               CES share inside the category
 *   q_g    = A γ_g + S_k w_g / p̃_g                             quantity bought
 *
 * β_k and α_g are linear in x between the data's knots and constant outside, so G_k has
 * an exact piecewise closed form and Σ_k G_k(x) = x − 1 (adding-up) whenever the shares
 * of every knot sum to 1. Below subsistence (Y ≤ cA) the block buys its committed
 * quantities only, from cash. b_g is the good's reference price, so α_g is the good's
 * share of its category at reference prices for a rural household. τ_g is a sourced
 * national taste (Q16), 1 by default.
 *
 * Pure: inputs are numbers and arrays; outputs are written into caller-owned arrays.
 */

import type { DemandSystemDef } from "./types.js";

/** A demand system resolved to good ids for the daily loop. */
export interface ResolvedDemandSystem {
  readonly goodCount: number;
  readonly commerceGoodId: number;
  readonly transportGoodId: number;
  readonly dwellingGoodId: number | null;
  readonly categoryKeys: readonly string[];
  readonly categorySigma: Float64Array;
  readonly categoryGoods: readonly Int32Array[];
  readonly categoryAtSubsistenceTier: Uint8Array;
  /** Category index of each good id, −1 for goods outside the system. */
  readonly categoryOfGood: Int32Array;
  /** Committed quantity per adult equivalent per day, by good id. */
  readonly committed: Float64Array;
  readonly commerceMargin: Float64Array;
  readonly transportMargin: Float64Array;
  /** Reference price b_g by good id (RUSD per unit). */
  readonly referencePrice: Float64Array;
  /** Gating technology id by good id, −1 for none. */
  readonly requiredTechnologyId: Int32Array;
  readonly knotRatio: Float64Array;
  /** Marginal share per knot, per category. */
  readonly knotShare: readonly Float64Array[];
  /** Cumulative supernumerary spending ratio G_k at each knot, per category. */
  readonly knotCumulative: readonly Float64Array[];
  /** Good weight per knot, by good id. */
  readonly knotWeight: readonly Float64Array[];
  /** Taste multipliers by country key, by good id. */
  readonly tasteByCountry: ReadonlyMap<string, Float64Array>;
}

/** Tolerance for the marginal shares of a knot summing to 1 (data rounding). */
const SHARE_SUM_TOLERANCE = 1e-9;

/** Resolve and validate a demand system against the goods and technologies. */
export function resolveDemandSystem(
  definition: DemandSystemDef,
  goods: readonly { readonly id: number; readonly key: string; readonly basePrice1900RUSD: number }[],
  technologyIdByKey: ReadonlyMap<string, number>,
): ResolvedDemandSystem {
  const goodCount = goods.reduce((max, good) => Math.max(max, good.id + 1), 0);
  const idOf = (key: string, path: string): number => {
    const good = goods.find((entry) => entry.key === key);
    if (good === undefined) throw new RangeError(`${path} references unknown good ${JSON.stringify(key)}`);
    return good.id;
  };
  const referencePrice = new Float64Array(goodCount);
  for (const good of goods) {
    if (!(good.basePrice1900RUSD > 0)) throw new RangeError(`good ${good.key} needs a positive reference price`);
    referencePrice[good.id] = good.basePrice1900RUSD;
  }
  const categoryOfGood = new Int32Array(goodCount).fill(-1);
  const committed = new Float64Array(goodCount);
  const commerceMargin = new Float64Array(goodCount);
  const transportMargin = new Float64Array(goodCount);
  const requiredTechnologyId = new Int32Array(goodCount).fill(-1);
  const categoryKeys: string[] = [];
  const categoryGoods: Int32Array[] = [];
  const categorySigma = new Float64Array(definition.categories.length);
  const categoryAtSubsistenceTier = new Uint8Array(definition.categories.length);
  definition.categories.forEach((category, index) => {
    const path = `demandSystem.categories[${String(index)}]`;
    if (categoryKeys.includes(category.key)) throw new RangeError(`${path} duplicates category ${category.key}`);
    if (!(category.substitutionElasticity > 0) || !Number.isFinite(category.substitutionElasticity)) {
      throw new RangeError(`${path}.substitutionElasticity must be positive and finite`);
    }
    if (category.goods.length === 0) throw new RangeError(`${path} has no goods`);
    categoryKeys.push(category.key);
    categorySigma[index] = category.substitutionElasticity;
    categoryAtSubsistenceTier[index] = category.committedAtSubsistenceTier ? 1 : 0;
    const ids = category.goods.map((good, goodIndex) => {
      const goodPath = `${path}.goods[${String(goodIndex)}]`;
      const id = idOf(good.goodKey, goodPath);
      if (categoryOfGood[id] !== -1) throw new RangeError(`${goodPath}: good ${good.goodKey} is in two categories`);
      categoryOfGood[id] = index;
      for (const field of ["committedPerAdultEquivalentPerDay", "retailCommercePerUnit", "retailTransportPerUnit"] as const) {
        if (!(good[field] >= 0) || !Number.isFinite(good[field])) throw new RangeError(`${goodPath}.${field} must be finite and non-negative`);
      }
      committed[id] = good.committedPerAdultEquivalentPerDay;
      commerceMargin[id] = good.retailCommercePerUnit;
      transportMargin[id] = good.retailTransportPerUnit;
      if (good.requiredTechnologyKey !== undefined) {
        const technology = technologyIdByKey.get(good.requiredTechnologyKey);
        if (technology === undefined) throw new RangeError(`${goodPath} references unknown technology ${good.requiredTechnologyKey}`);
        if (good.committedPerAdultEquivalentPerDay > 0) throw new RangeError(`${goodPath}: a gated good cannot be committed`);
        requiredTechnologyId[id] = technology;
      }
      return id;
    });
    categoryGoods.push(Int32Array.from(ids));
  });
  if (definition.knots.length === 0) throw new RangeError("demandSystem.knots is empty");
  const knotRatio = new Float64Array(definition.knots.length);
  const knotShare: Float64Array[] = [];
  const knotWeight: Float64Array[] = [];
  definition.knots.forEach((knot, index) => {
    const path = `demandSystem.knots[${String(index)}]`;
    if (!(knot.consumptionRatio > 1) || !Number.isFinite(knot.consumptionRatio)) {
      throw new RangeError(`${path}.consumptionRatio must be finite and above 1`);
    }
    if (index > 0 && !(knot.consumptionRatio > (knotRatio[index - 1] ?? 0))) {
      throw new RangeError(`${path}.consumptionRatio must increase`);
    }
    knotRatio[index] = knot.consumptionRatio;
    const shares = new Float64Array(categoryKeys.length);
    let sum = 0;
    for (const key of Object.keys(knot.marginalShares)) {
      if (!categoryKeys.includes(key)) throw new RangeError(`${path}.marginalShares has unknown category ${key}`);
    }
    categoryKeys.forEach((key, category) => {
      const share = knot.marginalShares[key] ?? 0;
      if (!(share >= 0) || !Number.isFinite(share)) throw new RangeError(`${path}.marginalShares.${key} must be finite and non-negative`);
      shares[category] = share;
      sum += share;
    });
    if (Math.abs(sum - 1) > SHARE_SUM_TOLERANCE) throw new RangeError(`${path}.marginalShares sum to ${String(sum)}, not 1`);
    knotShare.push(shares);
    const weights = new Float64Array(goodCount);
    categoryKeys.forEach((key, category) => {
      const table = knot.goodWeights[key] ?? {};
      let categorySum = 0;
      for (const [goodKey, weight] of Object.entries(table)) {
        const id = idOf(goodKey, `${path}.goodWeights.${key}`);
        if (categoryOfGood[id] !== category) throw new RangeError(`${path}.goodWeights.${key}: ${goodKey} is not in the category`);
        if (!(weight >= 0) || !Number.isFinite(weight)) throw new RangeError(`${path}.goodWeights.${key}.${goodKey} must be finite and non-negative`);
        weights[id] = weight;
        categorySum += weight;
      }
      if ((shares[category] ?? 0) > 0 && !(categorySum > 0)) {
        throw new RangeError(`${path}.goodWeights.${key} is empty but the category has a marginal share`);
      }
    });
    knotWeight.push(weights);
  });
  // Cumulative G_k at each knot, from ratio 1 (β constant below the first knot).
  const knotCumulative = knotShare.map(() => new Float64Array(categoryKeys.length));
  for (let category = 0; category < categoryKeys.length; category += 1) {
    let cumulative = (knotShare[0]?.[category] ?? 0) * ((knotRatio[0] ?? 1) - 1);
    (knotCumulative[0] as Float64Array)[category] = cumulative;
    for (let index = 1; index < knotRatio.length; index += 1) {
      const width = (knotRatio[index] ?? 0) - (knotRatio[index - 1] ?? 0);
      cumulative += (((knotShare[index - 1]?.[category] ?? 0) + (knotShare[index]?.[category] ?? 0)) / 2) * width;
      (knotCumulative[index] as Float64Array)[category] = cumulative;
    }
  }
  const tasteByCountry = new Map<string, Float64Array>();
  definition.tastes.forEach((taste, index) => {
    const path = `demandSystem.tastes[${String(index)}]`;
    const id = idOf(taste.goodKey, path);
    if (categoryOfGood[id] === -1) throw new RangeError(`${path}: ${taste.goodKey} is not in a category`);
    if (!(taste.weightMultiplier >= 0) || !Number.isFinite(taste.weightMultiplier)) {
      throw new RangeError(`${path}.weightMultiplier must be finite and non-negative`);
    }
    let table = tasteByCountry.get(taste.countryKey);
    if (table === undefined) {
      table = new Float64Array(goodCount).fill(1);
      tasteByCountry.set(taste.countryKey, table);
    }
    table[id] = taste.weightMultiplier;
  });
  const commerceGoodId = idOf(definition.commerceGoodKey, "demandSystem.commerceGoodKey");
  const transportGoodId = idOf(definition.transportGoodKey, "demandSystem.transportGoodKey");
  const dwellingGoodId =
    definition.dwellingGoodKey === null ? null : idOf(definition.dwellingGoodKey, "demandSystem.dwellingGoodKey");
  if (dwellingGoodId !== null && categoryOfGood[dwellingGoodId] !== -1) {
    throw new RangeError("demandSystem: the dwelling good cannot be in a consumption category");
  }
  return {
    goodCount,
    commerceGoodId,
    transportGoodId,
    dwellingGoodId,
    categoryKeys,
    categorySigma,
    categoryGoods,
    categoryAtSubsistenceTier,
    categoryOfGood,
    committed,
    commerceMargin,
    transportMargin,
    referencePrice,
    requiredTechnologyId,
    knotRatio,
    knotShare,
    knotCumulative,
    knotWeight,
    tasteByCountry,
  };
}

/** Segment of the knot list holding ratio x: −1 below the first knot, n−1 at or above the last. */
function segmentOf(knotRatio: Float64Array, x: number): number {
  if (x < (knotRatio[0] ?? Infinity)) return -1;
  let low = 0;
  let high = knotRatio.length - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if ((knotRatio[middle] ?? Infinity) <= x) low = middle;
    else high = middle - 1;
  }
  return low;
}

/** G_k(x) = ∫₁ˣ β_k(u) du for x ≥ 1 (exact for the piecewise-linear schedule). */
export function cumulativeSupernumeraryShare(system: ResolvedDemandSystem, category: number, x: number): number {
  const { knotRatio, knotShare, knotCumulative } = system;
  const segment = segmentOf(knotRatio, x);
  if (segment < 0) return (knotShare[0]?.[category] ?? 0) * (x - 1);
  const r0 = knotRatio[segment] ?? 0;
  const g0 = knotCumulative[segment]?.[category] ?? 0;
  const b0 = knotShare[segment]?.[category] ?? 0;
  if (segment === knotRatio.length - 1) return g0 + b0 * (x - r0);
  const r1 = knotRatio[segment + 1] ?? 0;
  const b1 = knotShare[segment + 1]?.[category] ?? 0;
  const bx = b0 + ((b1 - b0) * (x - r0)) / (r1 - r0);
  return g0 + ((b0 + bx) / 2) * (x - r0);
}

/** α_g(x): the good's weight at ratio x (linear between knots, constant outside). */
export function goodWeightAt(system: ResolvedDemandSystem, goodId: number, x: number): number {
  const { knotRatio, knotWeight } = system;
  const segment = segmentOf(knotRatio, x);
  if (segment < 0) return knotWeight[0]?.[goodId] ?? 0;
  const w0 = knotWeight[segment]?.[goodId] ?? 0;
  if (segment === knotRatio.length - 1) return w0;
  const r0 = knotRatio[segment] ?? 0;
  const r1 = knotRatio[segment + 1] ?? 0;
  const w1 = knotWeight[segment + 1]?.[goodId] ?? 0;
  return w0 + ((w1 - w0) * (x - r0)) / (r1 - r0);
}

/** One block's inputs to the demand plan. */
export interface DemandPlanInput {
  readonly adultEquivalents: number;
  readonly persons: number;
  /** Smoothed income per person per day, RUSD. */
  readonly incomePerCapitaDay: number;
  /** Household cash, RUSD. */
  readonly cash: number;
  readonly marginalPropensityToConsume: number;
  readonly urbanShare: number;
  /** Prices households read (smoothed), RUSD per unit, by good id. */
  readonly prices: ArrayLike<number>;
  /** 1 where the good can be bought today (gate open, price positive), by good id. */
  readonly available: Uint8Array;
  /** National taste multipliers by good id, or null. */
  readonly taste: Float64Array | null;
  readonly wealthConsumptionRatePerYear: number;
  readonly cashReserveDays: number;
  readonly daysInYear: number;
}

/** Caller-owned outputs (reused across blocks). */
export interface DemandPlanOutput {
  /** Committed quantity by good id. */
  readonly committed: Float64Array;
  /** Supernumerary quantity by good id. */
  readonly supernumerary: Float64Array;
  /** Retail price used, by good id. */
  readonly retailPrice: Float64Array;
  /** Planned spending by category (committed + supernumerary), RUSD. */
  readonly categorySpend: Float64Array;
  /** Scratch per category (no allocation per block). */
  readonly scratchSpend: Float64Array;
  readonly scratchWeight: Float64Array;
  /** Scalars of the last plan. */
  committedCost: number;
  income: number;
  consumption: number;
  reserve: number;
  ratio: number;
}

export function createDemandPlanOutput(system: ResolvedDemandSystem): DemandPlanOutput {
  return {
    committed: new Float64Array(system.goodCount),
    supernumerary: new Float64Array(system.goodCount),
    retailPrice: new Float64Array(system.goodCount),
    categorySpend: new Float64Array(system.categoryKeys.length),
    scratchSpend: new Float64Array(system.categoryKeys.length),
    scratchWeight: new Float64Array(system.categoryKeys.length),
    committedCost: 0,
    income: 0,
    consumption: 0,
    reserve: 0,
    ratio: 1,
  };
}

/** Retail price of good g for a household with urban share u. */
export function retailPrice(system: ResolvedDemandSystem, prices: ArrayLike<number>, goodId: number, urbanShare: number): number {
  return (
    (prices[goodId] ?? 0) +
    urbanShare *
      ((system.commerceMargin[goodId] ?? 0) * (prices[system.commerceGoodId] ?? 0) +
        (system.transportMargin[goodId] ?? 0) * (prices[system.transportGoodId] ?? 0))
  );
}

/** Plan one block's purchases (quantities into `out`). */
export function planHouseholdDemand(system: ResolvedDemandSystem, input: DemandPlanInput, out: DemandPlanOutput): void {
  const { committed, supernumerary, retailPrice: retail, categorySpend } = out;
  committed.fill(0);
  supernumerary.fill(0);
  categorySpend.fill(0);
  const ae = input.adultEquivalents;
  // Retail prices and the committed cost.
  let committedPerAe = 0;
  for (let goodId = 0; goodId < system.goodCount; goodId += 1) {
    if ((system.categoryOfGood[goodId] ?? -1) < 0) {
      retail[goodId] = 0;
      continue;
    }
    const price = retailPrice(system, input.prices, goodId, input.urbanShare);
    retail[goodId] = price;
    const gamma = system.committed[goodId] ?? 0;
    if (gamma > 0) {
      committedPerAe += price * gamma;
      committed[goodId] = gamma * ae;
      const category = system.categoryOfGood[goodId] ?? 0;
      categorySpend[category] = (categorySpend[category] ?? 0) + price * gamma * ae;
    }
  }
  const committedCost = committedPerAe * ae;
  const reserve = input.cashReserveDays * committedCost;
  const drawdown = (input.wealthConsumptionRatePerYear / input.daysInYear) * Math.max(0, input.cash - reserve);
  const income = input.incomePerCapitaDay * input.persons + drawdown;
  out.committedCost = committedCost;
  out.reserve = reserve;
  out.income = income;
  if (!(committedCost > 0) || income <= committedCost) {
    out.consumption = committedCost;
    out.ratio = 1;
    return;
  }
  const consumption = committedCost + input.marginalPropensityToConsume * (income - committedCost);
  const x = consumption / committedCost;
  out.consumption = consumption;
  out.ratio = x;
  // Supernumerary spending by category; categories with nothing to buy pass theirs on
  // to the others in proportion, so adding-up holds.
  const categoryCount = system.categoryKeys.length;
  let spendOpen = 0;
  let spendClosed = 0;
  const spend = out.scratchSpend;
  const weightSum = out.scratchWeight;
  for (let category = 0; category < categoryCount; category += 1) {
    const value = committedCost * cumulativeSupernumeraryShare(system, category, x);
    spend[category] = value;
    const sigma = system.categorySigma[category] ?? 1;
    let sum = 0;
    const goodIds = system.categoryGoods[category] as Int32Array;
    for (let index = 0; index < goodIds.length; index += 1) {
      const goodId = goodIds[index] as number;
      if (input.available[goodId] !== 1 || !((retail[goodId] ?? 0) > 0)) continue;
      const weight = goodWeightAt(system, goodId, x) * (input.taste?.[goodId] ?? 1);
      if (!(weight > 0)) continue;
      sum += weight * Math.pow((retail[goodId] ?? 0) / (system.referencePrice[goodId] ?? 1), 1 - sigma);
    }
    weightSum[category] = sum;
    if (sum > 0) spendOpen += value;
    else spendClosed += value;
  }
  const scale = spendOpen > 0 ? (spendOpen + spendClosed) / spendOpen : 0;
  for (let category = 0; category < categoryCount; category += 1) {
    const sum = weightSum[category] ?? 0;
    if (!(sum > 0)) continue;
    const categoryValue = (spend[category] ?? 0) * scale;
    categorySpend[category] = (categorySpend[category] ?? 0) + categoryValue;
    const sigma = system.categorySigma[category] ?? 1;
    const goodIds = system.categoryGoods[category] as Int32Array;
    for (let index = 0; index < goodIds.length; index += 1) {
      const goodId = goodIds[index] as number;
      const price = retail[goodId] ?? 0;
      if (input.available[goodId] !== 1 || !(price > 0)) continue;
      const weight = goodWeightAt(system, goodId, x) * (input.taste?.[goodId] ?? 1);
      if (!(weight > 0)) continue;
      const share = (weight * Math.pow(price / (system.referencePrice[goodId] ?? 1), 1 - sigma)) / sum;
      supernumerary[goodId] = (categoryValue * share) / price;
    }
  }
}
