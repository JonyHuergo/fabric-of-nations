/**
 * P2b (D-135) local cost of public services.
 *
 * The money coefficients price one teacher, instructor or unit of administration at the
 * reference (United States 1900) wage. A country pays its own staff at its own provinces'
 * wages, so the funding a service needs scales with the local wage of the professions
 * that staff it. This module returns that scale: the population-weighted mean wage of the
 * given professions over a set of blocks, divided by the same mean at the professions'
 * reference wages. P7 (D-154): the local wage is the labour market's paid wage (D-155: the
 * P2b province-table path for worlds without a labour market was removed).
 *
 * Inputs: the blocks (a country's), their provinces' wage tables, the profession
 * definitions. Units: dimensionless ratio, positive. Cadence: evaluated whenever a
 * service derivation runs. No state is written.
 */

import { populationTotal } from "../population/state.js";
import { buildLabourWageTable } from "./labourMarket.js";
import type { World } from "../world.js";
import type { EconomyDefinitions } from "./types.js";

export function localWageIndex(
  world: World,
  blocks: readonly World["popBlocks"][number][],
  definitions: EconomyDefinitions | undefined,
  professionKeys: ReadonlySet<string>,
): number {
  if (definitions === undefined || professionKeys.size === 0) return 1;
  const professionById = new Map(definitions.professions.map((profession) => [profession.id, profession]));
  // P7 (D-154): staff are priced at the current paid wages.
  const wages = buildLabourWageTable(world, definitions);
  let localLabour = 0;
  let referenceLabour = 0;
  for (const block of blocks) {
    const profession = professionById.get(block.professionId);
    if (profession === undefined || !professionKeys.has(profession.key)) continue;
    const people = populationTotal(block);
    if (people <= 0) continue;
    localLabour += people * wages.paid(block.provinceId, profession.id, true);
    referenceLabour += people * profession.baseWage1900RUSDPerYear;
  }
  return localLabour > 0 && referenceLabour > 0 ? localLabour / referenceLabour : 1;
}
