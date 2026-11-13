/**
 * P4 (D-142) demography sections of the UI snapshot: per-province current rates and
 * pyramid, and for the player and focused countries the current rates, pyramid,
 * causes and annual history. Presentation only: computed from the world after the
 * day, never written back.
 */

import {
  buildCountryPopulationIndex,
  buildProvinceOwnerMap,
  demographicIndicators,
  demographyFactorsForCountry,
  NEUTRAL_DEMOGRAPHY_FACTORS,
  technologySanitationKnowledge,
  type DemographicIndicators,
  type DemographyCountryFactors,
  type EconomyDefinitions,
  type Id,
  type PopBlock,
  type PopulationDefinitions,
  type World,
} from "@century/sim";
import type {
  CountryDemographySnapshot,
  FocusProvinceSnapshot,
  DemographyIndicatorsSnapshot,
  PopulationPyramidSnapshot,
} from "./protocol.js";

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function indicatorsSnapshot(value: DemographicIndicators): DemographyIndicatorsSnapshot {
  return {
    crudeBirthRate: round(value.crudeBirthRate, 2),
    crudeDeathRate: round(value.crudeDeathRate, 2),
    totalFertility: round(value.totalFertility, 3),
    lifeExpectancy: round(value.lifeExpectancy, 2),
    under5MortalityPer1000: round(value.under5MortalityPer1000, 1),
    urbanShare: round(value.urbanShare, 4),
    femaleLiteracy: round(value.femaleLiteracy, 4),
    foodSufficiency: round(value.foodSufficiency, 4),
  };
}

function pyramidSnapshot(value: DemographicIndicators): PopulationPyramidSnapshot {
  return { male: [...value.maleByBand], female: [...value.femaleByBand] };
}

type CountryFactors = DemographyCountryFactors & { readonly healthServiceOutput: number };

/**
 * Demography state shared by the sections of one snapshot. Country factors are
 * derived lazily: a snapshot only needs the player's, the focused country's and the
 * focused province's owner's, not all of them.
 */
export interface DemographySnapshotContext {
  readonly definitions: PopulationDefinitions;
  readonly factorsOfCountry: (countryId: Id) => CountryFactors;
  readonly factorsOf: (block: PopBlock) => DemographyCountryFactors;
}

export function demographySnapshotContext(
  world: World,
  economyDefinitions: EconomyDefinitions,
  populationDefinitions: PopulationDefinitions | undefined,
): DemographySnapshotContext | null {
  if (populationDefinitions === undefined) return null;
  const owners = buildProvinceOwnerMap(world);
  const countryById = new Map(world.countries.map((country) => [country.id, country]));
  const cache = new Map<Id, CountryFactors>();
  let populationIndex: ReturnType<typeof buildCountryPopulationIndex> | null = null;
  const neutral: CountryFactors = { ...NEUTRAL_DEMOGRAPHY_FACTORS, healthServiceOutput: 0 };
  const factorsOfCountry = (countryId: Id): CountryFactors => {
    let factors = cache.get(countryId);
    if (factors === undefined) {
      const country = countryById.get(countryId);
      if (country === undefined) return neutral;
      populationIndex ??= buildCountryPopulationIndex(world);
      factors = demographyFactorsForCountry(world, economyDefinitions, country, populationIndex);
      cache.set(countryId, factors);
    }
    return factors;
  };
  return {
    definitions: populationDefinitions,
    factorsOfCountry,
    factorsOf: (block) => {
      const owner = owners.get(block.provinceId);
      return owner === undefined ? neutral : factorsOfCountry(owner);
    },
  };
}

/** The focused province's pyramid, or null (unknown province or no definitions). */
export function focusProvinceSnapshot(
  world: World,
  provinceId: Id | null,
  context: DemographySnapshotContext | null,
): Omit<FocusProvinceSnapshot, "land" | "labour"> | null {
  if (provinceId === null || context === null) return null;
  if (!world.provinceEconomies.some((province) => province.id === provinceId)) return null;
  const blocks = world.popBlocks.filter((block) => block.provinceId === provinceId);
  const indicators = demographicIndicators(blocks, context.definitions, context.factorsOf);
  return {
    provinceId,
    demography: indicators.population > 0 ? indicatorsSnapshot(indicators) : null,
    pyramid: pyramidSnapshot(indicators),
  };
}

/** Player/focus country demography with causes and annual history. */
export function countryDemographySnapshot(
  world: World,
  country: World["countries"][number],
  provinceIds: ReadonlySet<Id>,
  economyDefinitions: EconomyDefinitions,
  context: DemographySnapshotContext | null,
): CountryDemographySnapshot | null {
  if (context === null) return null;
  const blocks = world.popBlocks.filter((block) => provinceIds.has(block.provinceId));
  const indicators = demographicIndicators(blocks, context.definitions, context.factorsOf);
  const factors = context.factorsOfCountry(country.id);
  const running = world.demography.current.find((entry) => entry.countryId === country.id);
  const history = world.demography.years
    .filter((row) => row.countryId === country.id)
    .map((row) => {
      const meanPopulation = (row.populationStart + row.populationEnd) / 2;
      const years = row.days > 0 ? row.days / 365 : 1;
      const perThousand = (count: number): number =>
        meanPopulation > 0 ? round((count / meanPopulation / years) * 1000, 2) : 0;
      return {
        year: row.year,
        populationStart: row.populationStart,
        populationEnd: row.populationEnd,
        births: row.births,
        deaths: row.deaths,
        crudeBirthRate: perThousand(row.births),
        crudeDeathRate: perThousand(row.deaths),
        totalFertility: round(row.totalFertility, 3),
        lifeExpectancy: round(row.lifeExpectancy, 2),
        under5MortalityPer1000: round(row.under5MortalityPer1000, 1),
        urbanShare: round(row.urbanShare, 4),
      };
    });
  return {
    current: indicatorsSnapshot(indicators),
    pyramid: pyramidSnapshot(indicators),
    causes: {
      healthFactor: round(factors.healthFactor, 4),
      sanitationKnowledge: round(technologySanitationKnowledge(country, economyDefinitions), 4),
      healthServiceOutput: round(factors.healthServiceOutput, 4),
      sanitationCoverage: round(factors.sanitationCoverage, 4),
      contraception: round(factors.contraception, 4),
    },
    yearToDate:
      running === undefined || world.demography.currentYear === null
        ? null
        : { year: world.demography.currentYear, births: running.births, deaths: running.deaths, days: running.days },
    history,
  };
}
