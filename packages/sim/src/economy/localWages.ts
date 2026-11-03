/**
 * P2b (D-135) local cost of public services.
 *
 * The money coefficients price one teacher, instructor or unit of administration at the
 * reference (United States 1900) wage. A country pays its own staff at its own provinces'
 * wages, so the funding a service needs scales with the local wage of the professions
 * that staff it. This module returns that scale: the population-weighted mean wage of the
 * given professions over a set of blocks, divided by the same mean at the professions'
 * reference wages. It is 1 for a world without province wage tables (legacy fixtures),
 * so their behaviour is unchanged.
 *
 * Inputs: the blocks (a country's), their provinces' wage tables, the profession
 * definitions. Units: dimensionless ratio, positive. Cadence: evaluated whenever a
 * service derivation runs. No state is written.
 */

import { populationTotal } from "../population/state.js";
import type { Id } from "../types.js";
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
  const wagesByProvince = new Map<Id, readonly number[]>();
  for (const province of world.provinceEconomies) {
    if (province.wageRUSDPerYearByProfession.length > 0) {
      wagesByProvince.set(province.id, province.wageRUSDPerYearByProfession);
    }
  }
  if (wagesByProvince.size === 0) return 1;
  let local = 0;
  let reference = 0;
  for (const block of blocks) {
    const profession = professionById.get(block.professionId);
    if (profession === undefined || !professionKeys.has(profession.key)) continue;
    const people = populationTotal(block);
    if (people <= 0) continue;
    const wage = wagesByProvince.get(block.provinceId)?.[profession.id] ?? profession.baseWage1900RUSDPerYear;
    local += people * wage;
    reference += people * profession.baseWage1900RUSDPerYear;
  }
  return local > 0 && reference > 0 ? local / reference : 1;
}
