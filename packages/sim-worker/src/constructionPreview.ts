/**
 * E3 construction pre-commitment preview. Pure calculations over the immutable
 * snapshot; no simulation state is read or mutated.
 */

import {
  MAX_ACTIVE_CONSTRUCTION_PROJECTS,
  type CountrySnapshot,
  type SimulationSnapshot,
} from "./protocol.js";
import type { MoneyText } from "./selectors.js";

export interface ConstructionMaterialPreview {
  readonly goodId: number;
  readonly goodName: string;
  readonly unitLabel: string;
  readonly requiredQuantity: number;
  readonly marketStock: number;
  readonly unitPriceRUSD: number;
  readonly estimatedCostRUSD: number;
  readonly shortfallQuantity: number;
}

export interface ConstructionPreview {
  readonly countryId: number;
  readonly definitionId: number;
  readonly provinceId: number;
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly costRUSD: number;
  readonly workingCapitalRUSD: number;
  readonly treasuryCashRUSD: number;
  readonly upfrontRequirementRUSD: number;
  readonly materials: readonly ConstructionMaterialPreview[];
  readonly estimatedMaterialsCostRUSD: number;
  readonly totalInvestmentRUSD: number;
  readonly activeProjects: number;
  readonly maxActiveProjects: number;
  readonly idleWorkers: number;
  readonly desiredCrew: number;
  readonly dailyWageEstimateRUSD: number;
  readonly estimatedDailyPayrollRUSD: number;
  /** Whole days at the current idle crew, or null when no worker is available. */
  readonly estimatedDays: number | null;
  readonly constraints: readonly string[];
}

/** Static project selection preview with explicit assumptions and limits. */
export function previewConstruction(
  snapshot: SimulationSnapshot,
  country: CountrySnapshot,
  definitionId: number,
  provinceId: number,
  money: MoneyText,
): ConstructionPreview {
  const projectType = snapshot.projectTypes.find(
    (candidate) => candidate.definitionId === definitionId,
  );
  const errors: string[] = [];
  const constraints: string[] = [];
  if (projectType === undefined) {
    errors.push("The selected project type is not buildable under the current rules.");
  }
  if (!snapshot.constructionEnabled) {
    errors.push(
      "Public construction requires the state-enterprise profit-distribution policy, which is disabled in this scenario.",
    );
  }
  if (!country.provinceIds.includes(provinceId)) {
    errors.push("The selected province is not owned by this country.");
  }
  if (snapshot.playerCountryId !== country.id) {
    errors.push("Only the player-controlled country may authorize construction.");
  }
  const activeProjects = country.constructionProjects.filter(
    (project) =>
      project.status !== "completed" && project.status !== "cancelled",
  ).length;
  if (activeProjects >= MAX_ACTIVE_CONSTRUCTION_PROJECTS) {
    errors.push(
      `The active-project cap of ${String(MAX_ACTIVE_CONSTRUCTION_PROJECTS)} is reached.`,
    );
  }
  const cost = projectType?.constructionCostRUSD ?? 0;
  const workingCapital = projectType?.workingCapitalRUSD ?? 0;
  const upfront = cost + workingCapital;
  if (country.treasuryCashRUSD + 1e-6 < upfront) {
    errors.push(
      `Treasury cash ${money.format(country.treasuryCashRUSD)} does not cover the ${money.format(upfront)} cost plus working capital.`,
    );
  }
  const idleWorkers = country.constructionLabor.idleWorkers;
  const desiredCrew = Math.min(projectType?.constructionWorkers ?? 0, idleWorkers);
  const dailyWage = country.constructionLabor.dailyWageRUSD;
  const dailyPayroll = desiredCrew * dailyWage;
  const estimatedDays =
    dailyPayroll > 0 && cost > 0 ? Math.ceil(cost / dailyPayroll) : null;
  const market = snapshot.markets.find((entry) => entry.provinceIds.includes(provinceId));
  const priceByGood = new Map(
    (market?.prices ?? []).map((price) => [price.goodId, price]),
  );
  const materials = (projectType?.materials ?? []).map((material) => {
    const marketPrice = priceByGood.get(material.goodId);
    const unitPrice = marketPrice?.priceRUSD ?? 0;
    const marketStock = marketPrice?.stockQuantity ?? 0;
    return {
      goodId: material.goodId,
      goodName: material.goodName,
      unitLabel: material.unitLabel,
      requiredQuantity: material.quantity,
      marketStock,
      unitPriceRUSD: unitPrice,
      estimatedCostRUSD: material.quantity * unitPrice,
      shortfallQuantity: Math.max(0, material.quantity - marketStock),
    };
  });
  const estimatedMaterialsCost = materials.reduce(
    (total, material) => total + material.estimatedCostRUSD,
    0,
  );
  const totalInvestment = cost + workingCapital + estimatedMaterialsCost;
  for (const material of materials) {
    if (material.shortfallQuantity > 0) {
      constraints.push(
        `Market stock of ${material.goodName} is below the required quantity; the project will wait for materials rather than receiving goods it did not buy.`,
      );
    }
  }
  if (projectType !== undefined && idleWorkers === 0) {
    constraints.push(
      "No idle eligible workers are currently available; the project will wait for labor rather than take workers from production.",
    );
  }
  constraints.push(
    "The cost is the authored construction labor budget. Materials are bought from actual provincial market stock at the current price and delivered before labor starts.",
    "Projects hire only idle eligible workers and pay their profession base daily wage; the existing income tax is withheld.",
    "Authorization requires treasury cash for the labor cost plus a 30-day-upkeep working-capital target; material purchases and later wages are paid as they occur and are not escrowed.",
    "Construction is pay-as-you-go; a project can wait for funds, labor, or materials and does not create a liability.",
    "The duration estimate assumes today's idle crew, wage, and continuous funding/materials; actual duration can differ.",
    "Completion creates a state-owned building that produces through the ordinary market and employment systems; it first produces on the next processed day.",
  );
  return {
    countryId: country.id,
    definitionId,
    provinceId,
    valid: errors.length === 0,
    errors,
    costRUSD: cost,
    workingCapitalRUSD: workingCapital,
    treasuryCashRUSD: country.treasuryCashRUSD,
    upfrontRequirementRUSD: upfront,
    materials,
    estimatedMaterialsCostRUSD: estimatedMaterialsCost,
    totalInvestmentRUSD: totalInvestment,
    activeProjects,
    maxActiveProjects: MAX_ACTIVE_CONSTRUCTION_PROJECTS,
    idleWorkers,
    desiredCrew,
    dailyWageEstimateRUSD: dailyWage,
    estimatedDailyPayrollRUSD: dailyPayroll,
    estimatedDays,
    constraints,
  };
}
