/**
 * P4 (D-142): the country-level causes of demographic levels.
 *
 * - Health factor H: the M9/E5 combined mortality factor (researched medical
 *   technology × public-health service × statutory hours), unchanged from E5.
 * - Sanitation coverage: sanitation knowledge (summed `urban-sanitation` effects of
 *   researched technologies, 0..1) realised through the E5 public-health service
 *   output (staffing × quality, 0..1). Knowing how to build sewers is not enough;
 *   someone has to staff and fund the service.
 * - Contraception: summed `contraception` effects of researched technologies.
 *
 * Pure functions of start-of-day world state; nothing here mutates the world.
 */

import {
  calibrateBlockDemography,
  effectiveAdultMortality,
  effectiveChildMortality,
  fertilityLevel,
  NEUTRAL_DEMOGRAPHY_FACTORS,
  type DemographyCountryFactors,
} from "../population/demographicLevels.js";
import type { PopBlock } from "../population/types.js";
import type { Id } from "../types.js";
import type { World } from "../world.js";
import {
  buildCountryPopulationIndex,
  buildProvinceOwnerMap,
  type CountryPopulationIndex,
} from "./country.js";
import {
  combinedMortalityFactor,
  deriveHealth,
  laborHoursMortalityFactor,
} from "./labor.js";
import {
  technologyContraception,
  technologyMortalityFactor,
  technologySanitationKnowledge,
} from "./technology.js";
import type { EconomyDefinitions } from "./types.js";

/** Demographic causes of one country from its start-of-day state. */
export function demographyFactorsForCountry(
  world: World,
  definitions: EconomyDefinitions | undefined,
  country: World["countries"][number],
  countryPopulation: CountryPopulationIndex,
): DemographyCountryFactors & { readonly healthServiceOutput: number } {
  const technology = world.technology.enabled && definitions?.technology !== undefined;
  const health = deriveHealth(world, country, definitions, countryPopulation);
  const technologyFactor = technology ? technologyMortalityFactor(country, definitions) : 1;
  const hoursFactor = laborHoursMortalityFactor(country, definitions);
  return {
    healthFactor: combinedMortalityFactor(technologyFactor, health.mortalityFactor, hoursFactor),
    sanitationCoverage: technology
      ? technologySanitationKnowledge(country, definitions) * health.serviceOutputIndex
      : 0,
    contraception: technology ? technologyContraception(country, definitions) : 0,
    healthServiceOutput: health.serviceOutputIndex,
  };
}

/** Demographic causes of every country, keyed by country id. */
export function demographyFactorsByCountry(
  world: World,
  definitions: EconomyDefinitions | undefined,
): Map<Id, DemographyCountryFactors> {
  const result = new Map<Id, DemographyCountryFactors>();
  if (world.countries.length === 0) return result;
  const countryPopulation = buildCountryPopulationIndex(world);
  for (const country of world.countries) {
    const factors = demographyFactorsForCountry(world, definitions, country, countryPopulation);
    result.set(country.id, {
      healthFactor: factors.healthFactor,
      sanitationCoverage: factors.sanitationCoverage,
      contraception: factors.contraception,
    });
  }
  return result;
}

/** Factor lookup by block through current province ownership. */
export function demographyFactorsOfBlock(
  world: World,
  factorsByCountry: ReadonlyMap<Id, DemographyCountryFactors>,
): (block: PopBlock) => DemographyCountryFactors {
  const owners = buildProvinceOwnerMap(world);
  return (block) => {
    const owner = owners.get(block.provinceId);
    return (owner === undefined ? undefined : factorsByCountry.get(owner)) ?? NEUTRAL_DEMOGRAPHY_FACTORS;
  };
}

/**
 * Economy-world creation (D-142): population blocks were calibrated with neutral
 * factors; recalibrate their residuals under their countries' start-of-game factors
 * so the 1900 effective levels equal their sources. Valid only on a world that has
 * not been ticked, where each block's levels still hold its sourced values
 * (fertility level, lagged child mortality, adult level under a neutral H).
 */
export function calibrateDemographyForCountries(
  world: World,
  definitions: EconomyDefinitions | undefined,
): void {
  if (world.dayIndex !== world.startDayIndex) {
    throw new RangeError("demographic calibration applies only to an unticked world");
  }
  const factorsOf = demographyFactorsOfBlock(world, demographyFactorsByCountry(world, definitions));
  for (const block of world.popBlocks) {
    // Under neutral factors the derived levels are the sourced effective levels.
    const sourced = {
      fertilityLevel: fertilityLevel(block, NEUTRAL_DEMOGRAPHY_FACTORS),
      childMortality: effectiveChildMortality(block, NEUTRAL_DEMOGRAPHY_FACTORS),
      adultMortality: effectiveAdultMortality(block, NEUTRAL_DEMOGRAPHY_FACTORS),
    };
    calibrateBlockDemography(block, sourced, factorsOf(block), `popBlock ${String(block.id)}`);
  }
}
