/**
 * P6 (D-153): the Households section of a country (presentation only).
 *
 * Runs the simulation's own demand plan (`planHouseholdDemand`) over the country's
 * blocks at the markets' smoothed prices, so the shares and saving rates shown are what
 * the households plan to spend today; housing figures are read from block state.
 * Nothing here mutates the world.
 */

import {
  adultEquivalents,
  createDemandPlanOutput,
  demandSystemOf,
  hasResearchedTechnology,
  MARGINAL_PROPENSITY_TO_CONSUME,
  planHouseholdDemand,
  populationTotal,
  provinceCrowding,
  WEALTH_CONSUMPTION_RATE_PER_YEAR,
  CASH_RESERVE_DAYS,
  dayIndexToCivilDate,
  daysInYear,
  type Country,
  type EconomyDefinitions,
  type PopulationDefinitions,
  type World,
} from "@century/sim";
import type { CountryHouseholdsSnapshot } from "./protocol.js";

const round = (value: number, digits = 4): number => Number(value.toFixed(digits));

export function countryHouseholdsSnapshot(
  world: World,
  country: Country,
  provinceIds: ReadonlySet<number>,
  definitions: EconomyDefinitions,
  populationDefinitions: PopulationDefinitions | undefined,
): CountryHouseholdsSnapshot | null {
  if (populationDefinitions === undefined) return null;
  const system = demandSystemOf(populationDefinitions, definitions);
  if (system === null) return null;
  const out = createDemandPlanOutput(system);
  const available = new Uint8Array(system.goodCount);
  const marketById = new Map(world.markets.map((market) => [market.id, market]));
  const provinceById = new Map(world.provinceEconomies.map((province) => [province.id, province]));
  const cashByAccount = new Map(world.finance.accounts.map((account) => [account.id, account.balanceRUSD]));
  const professionById = new Map(definitions.professions.map((profession) => [profession.id, profession]));
  const year = daysInYear(dayIndexToCivilDate(world.dayIndex).year);
  const categorySpend = new Float64Array(system.categoryKeys.length);
  let consumption = 0;
  const income = { lower: 0, middle: 0, upper: 0 };
  const spent = { lower: 0, middle: 0, upper: 0 };
  let persons = 0;
  let dwellings = 0;
  let crowdingWeighted = 0;
  let crowdingPersons = 0;
  const blocksByProvince = new Map<number, World["popBlocks"]>();
  for (const block of world.popBlocks) {
    if (!provinceIds.has(block.provinceId)) continue;
    const list = blocksByProvince.get(block.provinceId);
    if (list === undefined) blocksByProvince.set(block.provinceId, [block]);
    else list.push(block);
  }
  for (const provinceId of provinceIds) {
    const province = provinceById.get(provinceId);
    if (province === undefined) continue;
    const blocks = blocksByProvince.get(provinceId) ?? [];
    const crowding = provinceCrowding(blocks, province.housingReferencePersonsPerDwelling);
    let provincePersons = 0;
    for (const block of blocks) {
      const count = populationTotal(block);
      provincePersons += count;
      dwellings += block.dwellings;
      if (count <= 0 || province.marketId === null) continue;
      const market = marketById.get(province.marketId);
      const profession = professionById.get(block.professionId);
      if (market === undefined || profession === undefined) continue;
      const prices = market.priceSmoothedRUSD.length === market.priceRUSD.length ? market.priceSmoothedRUSD : market.priceRUSD;
      for (let goodId = 0; goodId < system.goodCount; goodId += 1) {
        const technology = system.requiredTechnologyId[goodId] ?? -1;
        available[goodId] = (prices[goodId] ?? 0) > 0 && (technology < 0 || hasResearchedTechnology(country, technology)) ? 1 : 0;
      }
      planHouseholdDemand(
        system,
        {
          adultEquivalents: adultEquivalents(block),
          persons: count,
          incomePerCapitaDay: block.incomeSmoothedRUSDPerCapitaDay,
          cash: cashByAccount.get(block.financialAccountId) ?? 0,
          marginalPropensityToConsume: MARGINAL_PROPENSITY_TO_CONSUME[profession.stratum],
          urbanShare: block.urbanShare,
          prices,
          available,
          taste: system.tasteByCountry.get(country.tag) ?? null,
          wealthConsumptionRatePerYear: WEALTH_CONSUMPTION_RATE_PER_YEAR,
          cashReserveDays: CASH_RESERVE_DAYS,
          daysInYear: year,
        },
        out,
      );
      consumption += out.consumption;
      for (let index = 0; index < categorySpend.length; index += 1) categorySpend[index] = (categorySpend[index] ?? 0) + (out.categorySpend[index] ?? 0);
      income[profession.stratum] += out.income;
      spent[profession.stratum] += out.consumption;
    }
    persons += provincePersons;
    if (crowding !== null) {
      crowdingWeighted += crowding * provincePersons;
      crowdingPersons += provincePersons;
    }
  }
  const savingRate = (stratum: "lower" | "middle" | "upper"): number | null =>
    income[stratum] > 0 ? round((income[stratum] - spent[stratum]) / income[stratum]) : null;
  const categoryShares = system.categoryKeys.map((key, index) => ({
    key,
    share: consumption > 0 ? round((categorySpend[index] ?? 0) / consumption) : 0,
  }));
  return {
    categoryShares,
    foodShare: categoryShares.find((entry) => entry.key === "food")?.share ?? 0,
    savingRate: { lower: savingRate("lower"), middle: savingRate("middle"), upper: savingRate("upper") },
    dwellings: round(dwellings, 1),
    personsPerDwelling: dwellings > 0 ? round(persons / dwellings, 3) : null,
    crowding: crowdingPersons > 0 ? round(crowdingWeighted / crowdingPersons) : null,
  };
}
