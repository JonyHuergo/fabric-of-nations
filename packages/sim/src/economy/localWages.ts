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
import { buildLabourWageTable } from "./labourMarket.js";
import type { Id } from "../types.js";
import type { World } from "../world.js";
import type { EconomyDefinitions } from "./types.js";

export function localWageIndex(
  world: World,
  blocks: readonly World["popBlocks"][number][],
  definitions: EconomyDefinitions | undefined,
  professionKeys: ReadonlySet<string>,
  /** The non-empty province wage tables, when the caller already built them (D-137). */
  provinceWages?: ReadonlyMap<Id, readonly number[]>,
): number {
  if (definitions === undefined || professionKeys.size === 0) return 1;
  const professionById = new Map(definitions.professions.map((profession) => [profession.id, profession]));
  // P7 (D-154): a labour-market world prices its staff at the current paid wages.
  if (world.labourMarket.enabled && definitions.labourMarket !== undefined) {
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
  let wagesByProvince = provinceWages;
  if (wagesByProvince === undefined) {
    const built = new Map<Id, readonly number[]>();
    for (const province of world.provinceEconomies) {
      if (province.wageRUSDPerYearByProfession.length > 0) {
        built.set(province.id, province.wageRUSDPerYearByProfession);
      }
    }
    wagesByProvince = built;
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
