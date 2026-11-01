/**
 * E1 evidence-based economic explanations.
 *
 * Each explanation states the observation, the exact snapshot fields used, the
 * period, and a caveat. These are diagnosis aids, not causal proofs or forecasts.
 */

import type { CountrySnapshot, SimulationSnapshot } from "./protocol.js";
import {
  essentialGoodIds,
  formatQuantity,
  formatRUSD,
  marketsForCountry,
  productionCapacityForGood,
} from "./selectors.js";

export type EconomicExplanationSeverity = "critical" | "warning" | "info";
export type EconomicExplanationTarget = "markets" | "population" | "budget" | "ledger";

export interface EconomicExplanation {
  readonly id: string;
  readonly severity: EconomicExplanationSeverity;
  readonly title: string;
  readonly observation: string;
  readonly evidence: readonly string[];
  readonly caveat: string;
  readonly target: EconomicExplanationTarget;
}

interface EssentialGoodCondition {
  readonly goodId: number;
  readonly goodName: string;
  readonly unitLabel: string;
  readonly stock: number;
  readonly capacity: number;
  readonly minPrice: number | null;
  readonly maxPrice: number | null;
}

function essentialConditions(
  snapshot: SimulationSnapshot,
  country: CountrySnapshot,
): readonly EssentialGoodCondition[] {
  const markets = marketsForCountry(snapshot, country);
  return essentialGoodIds(snapshot)
    .map((goodId) => {
      const good = snapshot.goods.find((entry) => entry.id === goodId);
      if (good === undefined) return null;
      let stock = 0;
      let minPrice: number | null = null;
      let maxPrice: number | null = null;
      for (const market of markets) {
        const price = market.prices.find((entry) => entry.goodId === goodId);
        if (price === undefined) continue;
        stock += price.stockQuantity;
        minPrice = minPrice === null ? price.priceRUSD : Math.min(minPrice, price.priceRUSD);
        maxPrice = maxPrice === null ? price.priceRUSD : Math.max(maxPrice, price.priceRUSD);
      }
      return {
        goodId,
        goodName: good.name,
        unitLabel: good.unitLabel,
        stock,
        capacity: productionCapacityForGood(country, goodId),
        minPrice,
        maxPrice,
      };
    })
    .filter((value): value is EssentialGoodCondition => value !== null);
}

function priceLabel(condition: EssentialGoodCondition): string {
  if (condition.minPrice === null || condition.maxPrice === null) return "no quoted price";
  if (condition.minPrice === condition.maxPrice) {
    return `${condition.minPrice.toFixed(4)} RUSD/${condition.unitLabel}`;
  }
  return `${condition.minPrice.toFixed(4)}–${condition.maxPrice.toFixed(4)} RUSD/${condition.unitLabel}`;
}

function rank(severity: EconomicExplanationSeverity): number {
  return severity === "critical" ? 0 : severity === "warning" ? 1 : 2;
}

/**
 * Small, high-quality explanation set. Returns at most five entries, ordered by
 * severity then by a stable rule id.
 */
export function buildEconomicExplanations(
  snapshot: SimulationSnapshot,
  country: CountrySnapshot,
): readonly EconomicExplanation[] {
  const explanations: EconomicExplanation[] = [];
  const conditions = essentialConditions(snapshot, country);
  const emptyGoods = conditions.filter((condition) => condition.stock <= 0);
  const noCapacityGoods = conditions.filter((condition) => condition.capacity <= 0);
  const stockEvidence = conditions
    .slice(0, 4)
    .map(
      (condition) =>
        `${condition.goodName}: ${formatQuantity(condition.stock)} ${condition.unitLabel} in country markets; ` +
        `estimated ${formatQuantity(condition.capacity)} ${condition.unitLabel}/day domestic capacity; ` +
        `${priceLabel(condition)}`,
    );

  if (country.blocksWithUnmetSubsistence > 0) {
    explanations.push({
      id: "subsistence-unmet",
      severity: "critical",
      title: "Subsistence needs are not fully met",
      observation:
        `${String(country.blocksWithUnmetSubsistence)} population block(s) report at least one unmet subsistence day; ` +
        `${(country.hardshipPopulationShare * 100).toFixed(1)}% of the population is in blocks with 7+ unmet subsistence days.`,
      evidence:
        stockEvidence.length === 0
          ? ["No subsistence/basic good definition is exposed in this snapshot."]
          : [
              ...stockEvidence,
              emptyGoods.length > 0
                ? `Essential goods with zero current market stock: ${emptyGoods.map((good) => good.goodName).join(", ")}.`
                : "Essential goods currently have positive market stock in the country's markets.",
            ],
      caveat:
        "The snapshot carries current market stock and daily need counters, not a per-good unmet history. Low stock is supporting evidence, not proof of a single cause; household cash and access can also constrain purchases.",
      target: emptyGoods.length > 0 ? "markets" : "population",
    });
  }

  if (country.blocksWithUnmetBasic > 0) {
    explanations.push({
      id: "basic-unmet",
      severity: "warning",
      title: "Basic needs remain unmet",
      observation: `${String(country.blocksWithUnmetBasic)} population block(s) report at least one unmet basic-needs day.`,
      evidence: stockEvidence.slice(0, 3),
      caveat:
        "Basic-needs history is not retained per good. Use Markets for current supply, prices, and capacity; household cash is shown under Population.",
      target: "population",
    });
  }

  if (country.hardshipPopulationShare > 0) {
    const cashPerCapita =
      country.population > 0 ? country.householdCashRUSD / country.population : 0;
    explanations.push({
      id: "household-purchasing-power",
      severity: "warning",
      title: "Household purchasing power may be constrained",
      observation:
        `Households hold ${formatRUSD(country.householdCashRUSD)} in cash (${formatRUSD(cashPerCapita)} per capita); ` +
        `estimated daily wage base is ${formatRUSD(country.estimatedDailyWageBaseRUSD)}; wealth index ${country.wealthLevel.toFixed(1)}.`,
      evidence: [
        `Employed workers: ${country.employedWorkers.toLocaleString("en-US")} of ${country.workingAgePopulation.toLocaleString("en-US")} working-age people.`,
        `The wage base is a current-employment estimate at base wages, not realized household income.`,
      ],
      caveat:
        "This is a condition summary, not proof that cash alone causes hardship. Needs counters, prices, taxes, and access all contribute; no exact attribution is available.",
      target: "population",
    });
  }

  const latest = country.latestFiscal;
  if (latest !== null) {
    const monthlyOutflow = latest.welfareExpenseRUSD + latest.interestExpenseRUSD;
    if (latest.netFiscalResultRUSD < 0 || country.treasuryCashRUSD < monthlyOutflow) {
      explanations.push({
        id: "fiscal-pressure",
        severity: latest.netFiscalResultRUSD < 0 ? "warning" : "info",
        title: "Public finances are under pressure",
        observation:
          `Latest closed month: tax ${formatRUSD(latest.incomeTaxRUSD)}, welfare ${formatRUSD(latest.welfareExpenseRUSD)}, ` +
          `interest ${formatRUSD(latest.interestExpenseRUSD)}, net ${formatRUSD(latest.netFiscalResultRUSD)}. ` +
          `Treasury cash is ${formatRUSD(country.treasuryCashRUSD)}.`,
        evidence: [
          `Outstanding principal: ${formatRUSD(country.debtOutstandingPrincipalRUSD)}; accrued interest payable: ${formatRUSD(country.debtInterestPayableRUSD)}.`,
          country.treasuryCashRUSD < monthlyOutflow
            ? "Treasury cash is below last month's welfare plus interest outflow."
            : "Treasury cash currently covers last month's welfare plus interest outflow.",
        ],
        caveat:
          "Next month's revenue and spending can differ. Borrowing can fund a deficit but is not revenue; principal repayment is not ordinary expenditure. The model does not forecast future tax receipts.",
        target: "budget",
      });
    }
  }

  if (noCapacityGoods.length > 0) {
    const zeroStockNoCapacity = noCapacityGoods.filter((condition) => condition.stock <= 0);
    explanations.push({
      id: "essential-capacity-gap",
      severity: zeroStockNoCapacity.length > 0 ? "warning" : "info",
      title: "Some essential goods have no domestic production capacity",
      observation: `${String(noCapacityGoods.length)} essential good(s) have zero estimated domestic daily capacity.`,
      evidence: noCapacityGoods
        .slice(0, 4)
        .map(
          (condition) =>
            `${condition.goodName}: ${formatQuantity(condition.stock)} ${condition.unitLabel} current stock; ${priceLabel(condition)}`,
        ),
      caveat:
        "Capacity is estimated from current buildings, staffing, level, and condition. There is no inter-market trade model in E1, so stock cannot be replenished from another market.",
      target: "markets",
    });
  }

  explanations.sort(
    (left, right) =>
      rank(left.severity) - rank(right.severity) ||
      (left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
  );
  return explanations.slice(0, 5);
}
