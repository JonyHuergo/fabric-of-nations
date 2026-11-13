/**
 * P7 (D-154): labour-market world creation and definition validation.
 *
 * Initial condition (plan §4.1): W_mp = the population-weighted mean over the territory's
 * provinces of the P2b province wage (the profession's reference wage where a province
 * has no table entry), and d_rp = that province's wage ÷ W_mp, so every province starts
 * at exactly its P2b wage and the differentials' population-weighted mean is 1. The
 * province tables then stop being authoritative and are cleared. Ceilings 1, no
 * institution assignments (the first refresh creates them), alternative income 0 until
 * the first monthly update measures it.
 */

import { populationTotal } from "../population/state.js";
import type { Id } from "../types.js";
import type { World } from "../world.js";
import {
  PROFESSION_GATES,
  PROFESSION_ROLES,
  PROFESSION_SETTLEMENTS,
  type EconomyDefinitions,
} from "./types.js";

function professionHasGate(profession: EconomyDefinitions["professions"][number], gate: "training" | "capital"): boolean {
  return profession.gates?.includes(gate) === true;
}

function professionIndexSize(definitions: EconomyDefinitions): number {
  return definitions.professions.reduce((max, profession) => Math.max(max, profession.id), -1) + 1;
}

export function initialiseLabourMarket(world: World, definitions: EconomyDefinitions): void {
  const size = professionIndexSize(definitions);
  const professionById = new Map(definitions.professions.map((profession) => [profession.id, profession]));
  const populationByProvince = new Map<Id, number>();
  for (const block of world.popBlocks) {
    populationByProvince.set(block.provinceId, (populationByProvince.get(block.provinceId) ?? 0) + populationTotal(block));
  }
  const provinces = [...world.provinceEconomies]
    .filter((province) => province.marketId !== null)
    .sort((left, right) => left.id - right.id);
  const fallbackWage = (professionId: Id): number => professionById.get(professionId)?.baseWage1900RUSDPerYear ?? 0;
  const wageOf = (province: World["provinceEconomies"][number], professionId: Id): number => {
    const table = province.wageRUSDPerYearByProfession[professionId];
    return table !== undefined && table > 0 ? table : fallbackWage(professionId);
  };
  const territories = [...world.markets]
    .sort((left, right) => left.id - right.id)
    .map((market) => {
      const members = provinces.filter((province) => province.marketId === market.id);
      const reference: number[] = [];
      for (let professionId = 0; professionId < size; professionId += 1) {
        // Ids without a profession (gaps in the definitions) hold a placeholder wage of
        // 1 RUSD that nothing reads, so the arrays stay indexed by profession id.
        if (!professionById.has(professionId)) {
          reference.push(1);
          continue;
        }
        let weighted = 0;
        let weight = 0;
        for (const province of members) {
          const population = populationByProvince.get(province.id) ?? 0;
          weighted += population * wageOf(province, professionId);
          weight += population;
        }
        const first = members[0];
        const mean = weight > 0 ? weighted / weight : first !== undefined ? wageOf(first, professionId) : fallbackWage(professionId);
        if (!Number.isFinite(mean) || !(mean > 0)) {
          throw new RangeError(`labour market: market ${String(market.id)} has no positive wage for profession ${String(professionId)}`);
        }
        reference.push(mean);
      }
      return {
        marketId: market.id,
        referenceWageRUSDPerYear: reference,
        previousReferenceWageRUSDPerYear: [...reference],
        priceIndexAtUpdate: 1,
      };
    });
  const territoryByMarket = new Map(territories.map((entry) => [entry.marketId, entry]));
  const provinceStates = provinces.map((province) => {
    const territory = territoryByMarket.get(province.marketId as Id);
    const differential: number[] = [];
    for (let professionId = 0; professionId < size; professionId += 1) {
      const reference = territory?.referenceWageRUSDPerYear[professionId] ?? 1;
      const wage = wageOf(province, professionId);
      differential.push(reference > 0 && wage > 0 ? wage / reference : 1);
    }
    return { provinceId: province.id, differential, peasantAlternativeIncomeRUSDPerYear: 0 };
  });
  for (const province of world.provinceEconomies) province.wageRUSDPerYearByProfession = [];
  world.labourMarket = {
    enabled: true,
    territories,
    provinces: provinceStates,
    institutionEmployment: [],
    nextInstitutionAssignmentId: 1,
    householdEmployment: [],
    nextHouseholdAssignmentId: 1,
    staffingCeilings: [],
    nextPopBlockId: world.popBlocks.reduce((max, block) => Math.max(max, block.id), -1) + 1,
    retiredPopBlockIds: [],
    history: [],
  };
}

/**
 * Validate the P7 definition fields: roles, gates, settlement, entry, course lengths
 * and entry capital. Every profession needs roles, trained professions a course length
 * and capital-gated professions an entry capital.
 */
export function assertValidLabourDefinitions(definitions: EconomyDefinitions): void {
  // D-155: the configuration is required (the static-wage path was removed); checked at
  // run time because definitions arrive from data files.
  const raw: unknown = (definitions as { readonly labourMarket?: unknown }).labourMarket;
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new RangeError("economyDefinitions.labourMarket is required (D-155)");
  }
  if (!Array.isArray(definitions.labourMarket.domesticServiceBuildingKeys)) {
    throw new RangeError("economyDefinitions.labourMarket.domesticServiceBuildingKeys must be an array");
  }
  const shares = definitions.labourMarket.domesticServiceShares ?? [];
  let previousProvince = -1;
  for (const [index, entry] of shares.entries()) {
    const path = `definitions.labourMarket.domesticServiceShares[${String(index)}]`;
    if (!Number.isInteger(entry.provinceId) || entry.provinceId <= previousProvince) throw new RangeError(`${path}.provinceId must be an integer in ascending order`);
    previousProvince = entry.provinceId;
    if (!Number.isFinite(entry.share) || entry.share < 0 || entry.share >= 1) throw new RangeError(`${path}.share must be in [0, 1)`);
  }
  const labour = definitions.labourMarket;
  for (const profession of definitions.professions) {
    const path = `economyDefinitions.professions[${String(profession.id)}]`;
    if (profession.roles !== undefined) {
      const seen = new Set<string>();
      for (const role of profession.roles) {
        if (!(PROFESSION_ROLES as readonly string[]).includes(role)) throw new RangeError(`${path}.roles has unknown role ${JSON.stringify(role)}`);
        if (seen.has(role)) throw new RangeError(`${path}.roles repeats ${role}`);
        seen.add(role);
      }
    }
    if (profession.gates !== undefined) {
      for (const gate of profession.gates) {
        if (!(PROFESSION_GATES as readonly string[]).includes(gate)) throw new RangeError(`${path}.gates has unknown gate ${JSON.stringify(gate)}`);
      }
    }
    if (profession.settlement !== undefined && !(PROFESSION_SETTLEMENTS as readonly string[]).includes(profession.settlement)) {
      throw new RangeError(`${path}.settlement is unknown`);
    }
    if (profession.entry !== undefined && profession.entry !== "open" && profession.entry !== "closed") {
      throw new RangeError(`${path}.entry must be open or closed`);
    }
    if (profession.courseLengthYears !== undefined && (!Number.isFinite(profession.courseLengthYears) || !(profession.courseLengthYears > 0))) {
      throw new RangeError(`${path}.courseLengthYears must be positive`);
    }
    if (profession.entryCapitalRUSD !== undefined && (!Number.isFinite(profession.entryCapitalRUSD) || profession.entryCapitalRUSD < 0)) {
      throw new RangeError(`${path}.entryCapitalRUSD must be finite and non-negative`);
    }
    if (profession.roles === undefined || profession.roles.length === 0) throw new RangeError(`${path} needs roles`);
    if (professionHasGate(profession, "training") && profession.courseLengthYears === undefined) {
      throw new RangeError(`${path} has the training gate but no course length`);
    }
    if (professionHasGate(profession, "capital") && profession.entryCapitalRUSD === undefined) {
      throw new RangeError(`${path} has the capital gate but no entry capital`);
    }
  }
  const keys = new Set(definitions.buildings.map((building) => building.key));
  for (const key of labour.domesticServiceBuildingKeys) {
    if (!keys.has(key)) {
      throw new RangeError(`economyDefinitions.labourMarket.domesticServiceBuildingKeys references unknown building ${JSON.stringify(key)}`);
    }
  }
}
