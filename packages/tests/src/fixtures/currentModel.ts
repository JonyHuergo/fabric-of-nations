/**
 * D-155: the current model for the small test worlds.
 *
 * Every economy world now runs the P7 labour market and buys by the P6 demand system;
 * the static-wage, need-tier and M5-migration paths were removed (designer's
 * instruction of 2026-11-11, reversing P7 plan Q21(a)). The small worlds the unit
 * suites use (the M3 small economy, the M5 multi-country fixture, the M5 sample and the
 * fixtures built on them) predate both systems. `withCurrentModel` gives such a scenario
 * the two configurations, derived from what the scenario already states, so a suite
 * keeps testing its own subsystem on the same world:
 *
 * - Labour market: `labourMarket: { domesticServiceBuildingKeys: [] }` and, for every
 *   profession without roles, the roles and settlement its key names (`ROLES_BY_KEY`,
 *   the 1900 world's assignments for the same professions without their entry gates);
 *   any other profession is wage labour employed where its job is.
 * - Demand system: one food category with the subsistence tier's goods (committed at
 *   the tier's quantity per person), one category with every other tier good
 *   (committed at the basic tier's quantity), equal good weights, food's marginal share
 *   falling from 0.6 to 0.2 between consumption ratios 1.5 and 20 (the P6 fixture's
 *   knots), no retail margins, no dwelling good and no tastes. A technology-gated item
 *   is never committed (the demand system's rule).
 *
 * A scenario that already carries either configuration keeps it. Fresh objects every
 * call; the input is not mutated.
 */
import type {
  DemandCategoryDef,
  DemandSystemDef,
  EconomyScenarioDef,
  ProfessionDef,
  ProfessionRole,
  ProfessionSettlement,
} from "@century/sim";

const ROLES_BY_KEY: Readonly<Record<string, { readonly roles: ProfessionRole[]; readonly settlement: ProfessionSettlement }>> = {
  peasants: { roles: ["subsistence"], settlement: "rural" },
  laborers: { roles: ["wage-labour"], settlement: "by-job" },
  clerks: { roles: ["wage-labour", "administration", "health"], settlement: "urban" },
  capitalists: { roles: ["owns-capital", "management"], settlement: "urban" },
  academics: { roles: ["education", "research", "training"], settlement: "urban" },
  farmers: { roles: ["owner-operator"], settlement: "rural" },
};

function withRoles(profession: ProfessionDef): ProfessionDef {
  if (profession.roles !== undefined && profession.roles.length > 0) return profession;
  const assigned = ROLES_BY_KEY[profession.key] ?? { roles: ["wage-labour"], settlement: "by-job" };
  return { ...profession, roles: [...assigned.roles], settlement: profession.settlement ?? assigned.settlement };
}

/** The demand system implied by a scenario's need tiers (see the module comment). */
export function tierDemandSystem(scenario: EconomyScenarioDef): DemandSystemDef {
  const needs = scenario.population.definitions.needs;
  const goodKeys = new Set(scenario.definitions.goods.map((good) => good.key));
  const seen = new Set<string>();
  const food: DemandCategoryDef["goods"][number][] = [];
  const other: DemandCategoryDef["goods"][number][] = [];
  for (const tier of needs) {
    for (const item of tier.items) {
      if (!goodKeys.has(item.goodKey) || seen.has(item.goodKey)) continue;
      seen.add(item.goodKey);
      const gated = item.requiredTechnologyKey !== undefined;
      const committed = gated || (tier.tier !== "subsistence" && tier.tier !== "basic") ? 0 : item.quantityPerCapitaPerDay;
      const good = {
        goodKey: item.goodKey,
        committedPerAdultEquivalentPerDay: committed,
        retailCommercePerUnit: 0,
        retailTransportPerUnit: 0,
        ...(gated ? { requiredTechnologyKey: item.requiredTechnologyKey } : {}),
      };
      (tier.tier === "subsistence" ? food : other).push(good);
    }
  }
  const first = food[0] ?? other[0];
  if (first === undefined) throw new RangeError("tierDemandSystem: the scenario's need tiers name no goods");
  const categories: DemandCategoryDef[] = [];
  if (food.length > 0) categories.push({ key: "food", substitutionElasticity: 1.5, committedAtSubsistenceTier: true, goods: food });
  if (other.length > 0) categories.push({ key: "other", substitutionElasticity: 1.2, committedAtSubsistenceTier: false, goods: other });
  const weights = (goods: readonly { goodKey: string }[]): Record<string, number> =>
    Object.fromEntries(goods.map((good) => [good.goodKey, 1 / goods.length]));
  const knot = (consumptionRatio: number, foodShare: number) => {
    const marginalShares: Record<string, number> = {};
    const goodWeights: Record<string, Record<string, number>> = {};
    if (food.length > 0) {
      marginalShares.food = other.length > 0 ? foodShare : 1;
      goodWeights.food = weights(food);
    }
    if (other.length > 0) {
      marginalShares.other = food.length > 0 ? 1 - foodShare : 1;
      goodWeights.other = weights(other);
    }
    return { consumptionRatio, marginalShares, goodWeights };
  };
  return {
    commerceGoodKey: first.goodKey,
    transportGoodKey: first.goodKey,
    categories,
    knots: [knot(1.5, 0.6), knot(20, 0.2)],
    tastes: [],
    dwellingGoodKey: null,
  };
}

/** The scenario with the labour-market configuration and a demand system (D-155). */
export function withCurrentModel(scenario: EconomyScenarioDef): EconomyScenarioDef {
  const definitions = scenario.definitions as EconomyScenarioDef["definitions"] & { labourMarket?: EconomyScenarioDef["definitions"]["labourMarket"] };
  const professions = definitions.professions.map(withRoles);
  const demandSystem = scenario.population.definitions.demandSystem ?? tierDemandSystem(scenario);
  return {
    ...scenario,
    definitions: {
      ...definitions,
      professions,
      labourMarket: definitions.labourMarket ?? { domesticServiceBuildingKeys: [] },
    },
    population: {
      ...scenario.population,
      definitions: { ...scenario.population.definitions, demandSystem },
    },
  };
}
