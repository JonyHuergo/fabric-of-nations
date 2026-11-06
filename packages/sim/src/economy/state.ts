/**
 * M3 scenario validation and world construction.
 *
 * Construction is structural only. It creates buildings, assignments, markets,
 * inventory lots, and cash accounts. It does not run employment matching,
 * production, market clearing, wages, or pricing.
 */

import { normaliseFarmTechniques } from "./agriculture.js";
import { assertValidResourceState, createResourceState } from "./resourceState.js";
import { calibrateDemographyForCountries } from "./demographyFactors.js";
import { assertValidDayIndex } from "../calendar.js";
import {
  AGE_BAND_WIDTH,
  QUANTITY_TOLERANCE,
  WORKING_AGE_END,
  WORKING_AGE_START,
} from "../population/constants.js";
import { createPopulationWorld } from "../population/state.js";
import type { Day, Id } from "../types.js";
import { requireFiniteNumber, requireInteger } from "../validation.js";
import { assertValidMoneyCoefficients } from "../world.js";
import { assertValidWorld, type World } from "../world.js";
import {
  assertValidProvinceScenario,
  createProvinceState,
  createProvinceStateFromOwners,
  emptyProvinceState,
} from "../provinces/state.js";
import {
  applyOpeningBalances,
  categoryForSubtype,
  type OpeningBalanceEntry,
} from "./accounts.js";
import {
  assertValidCountryCurrencyState,
  copyCurrency,
  copyCurrencyValuation,
  createFiscalPolicy,
  createIndustrialPolicy,
  fiscalPolicyIsActive,
} from "./country.js";
import {
  assertValidCountryAIPolicy,
  createCountryAIPolicy,
  createCountryAIState,
} from "./aiState.js";
import { canonicalizeStockLots } from "./inventory.js";
import { assertValidEconomyDefinitions } from "./definitions.js";
import {
  assertValidProfitDistributionPolicy,
  createProfitDistributionPolicy,
} from "./profit.js";
import { createDebtPolicy } from "./debtPolicy.js";
import {
  assertValidCountryTechnologyInput,
  createCountryTechnologyState,
  neutralCountryTechnologyState,
  neutralEducationState,
} from "./technology.js";
import { createLaborPolicyState } from "./labor.js";
import { createTradePolicyState, createTradeState } from "./trade.js";
import { createPriceIndexState } from "./monetary.js";
import { createMilitaryState } from "./military.js";
import { asRusdPerCurrencyUnit } from "./currency.js";
import {
  assertValidCountryPoliticsInput,
  createCountryPoliticsState,
  createWorldPoliticsState,
  neutralInstitutionState,
  neutralInterestGroups,
  neutralLaws,
  neutralRegimeState,
  refreshInstitution,
  refreshInterestGroups,
} from "./politics.js";
import type {
  AccountSubtype,
  BuildingDef,
  Country,
  CountryInitialDef,
  EconomyScenarioDef,
  EmploymentAssignment,
  GoodDef,
  Market,
  MonetaryCurrencyState,
  ProfessionDef,
} from "./types.js";

function professionIds(scenario: EconomyScenarioDef): Map<number, ProfessionDef> {
  return new Map(scenario.definitions.professions.map((profession) => [profession.id, profession]));
}

function buildingDefinitions(scenario: EconomyScenarioDef): Map<number, BuildingDef> {
  return new Map(scenario.definitions.buildings.map((building) => [building.id, building]));
}

function goodKeys(scenario: EconomyScenarioDef): Map<string, GoodDef> {
  return new Map(scenario.definitions.goods.map((good) => [good.key, good]));
}

function initialWorkingAge(block: {
  readonly maleAgeGroups: readonly number[];
  readonly femaleAgeGroups: readonly number[];
}): number {
  let total = 0;
  const firstBand = Math.floor(WORKING_AGE_START / AGE_BAND_WIDTH);
  const lastBand = Math.floor(WORKING_AGE_END / AGE_BAND_WIDTH);
  for (let band = firstBand; band <= lastBand; band += 1) {
    total += block.maleAgeGroups[band] ?? 0;
    total += block.femaleAgeGroups[band] ?? 0;
  }
  return total;
}

function assertInitialAccountIds(scenario: EconomyScenarioDef): Set<number> {
  const ids = new Set<number>();
  for (const block of scenario.population.popBlocks) {
    if (ids.has(block.financialAccountId)) {
      throw new RangeError(`duplicate household account id ${String(block.financialAccountId)}`);
    }
    ids.add(block.financialAccountId);
  }
  for (const building of scenario.buildingInstances) {
    if (ids.has(building.operatingCashAccountId)) {
      throw new RangeError(
        `duplicate operating account id ${String(building.operatingCashAccountId)}`,
      );
    }
    ids.add(building.operatingCashAccountId);
  }
  for (const account of scenario.systemAccounts) {
    if (ids.has(account.id)) {
      throw new RangeError(`duplicate system account id ${String(account.id)}`);
    }
    ids.add(account.id);
  }
  for (const country of scenario.countries ?? []) {
    if (ids.has(country.treasuryAccountId)) {
      throw new RangeError(
        `duplicate country treasury account id ${String(country.treasuryAccountId)}`,
      );
    }
    ids.add(country.treasuryAccountId);
  }
  return ids;
}

function assertCountryInitialDefs(
  scenario: EconomyScenarioDef,
  declaredAccountIds: ReadonlySet<number>,
): void {
  const countries = scenario.countries ?? [];
  for (const country of countries as readonly CountryInitialDef[]) {
    const path = `countries[${String(country.id)}]`;
    requireFiniteNumber(country.initialTreasuryCashRUSD, `${path}.initialTreasuryCashRUSD`);
    if (country.initialTreasuryCashRUSD < 0) {
      throw new RangeError(`${path}.initialTreasuryCashRUSD must be non-negative`);
    }
    if (country.immigrationOpen !== undefined && typeof country.immigrationOpen !== "boolean") {
      throw new TypeError(`${path}.immigrationOpen must be a boolean when provided`);
    }
    if (!declaredAccountIds.has(country.treasuryAccountId)) {
      throw new RangeError(`${path}.treasuryAccountId was not registered as a declared account`);
    }
    assertValidCountryPoliticsInput(
      country.politics,
      scenario.definitions.politics,
      `${path}.politics`,
    );
  }
}

/**
 * M4c: a country with an active fiscal policy must own every province that
 * contains population blocks or buildings, otherwise tax and welfare would
 * silently skip real economic entities. Zero-fiscal worlds keep the M4a-2
 * rule that unowned provinces are permitted.
 */
function assertFiscalProvinceOwnership(scenario: EconomyScenarioDef): void {
  const countries = scenario.countries ?? [];
  if (!countries.some((country) => fiscalPolicyIsActive(country.fiscal))) return;
  const claimed = new Map<number, number>();
  for (const country of countries) {
    for (const provinceId of country.provinceIds) {
      claimed.set(provinceId, (claimed.get(provinceId) ?? 0) + 1);
    }
  }
  const economicProvinces = new Set<number>();
  for (const block of scenario.population.popBlocks) economicProvinces.add(block.provinceId);
  for (const building of scenario.buildingInstances) economicProvinces.add(building.provinceId);
  for (const provinceId of economicProvinces) {
    const claims = claimed.get(provinceId) ?? 0;
    if (claims !== 1) {
      throw new RangeError(
        `province ${String(provinceId)} must be owned by exactly one country when a fiscal policy is active; found ${String(claims)}`,
      );
    }
  }
}

function assertNeedsGoodReferences(scenario: EconomyScenarioDef): void {
  const byKey = goodKeys(scenario);
  for (const tier of scenario.population.definitions.needs) {
    for (const item of tier.items) {
      if (!byKey.has(item.goodKey)) {
        throw new RangeError(
          `M3 needs tier ${tier.tier} references unknown or deferred good ${JSON.stringify(item.goodKey)}`,
        );
      }
    }
  }
}

function assertProfessionIdentities(scenario: EconomyScenarioDef): void {
  const byId = professionIds(scenario);
  for (const identity of scenario.population.professions) {
    const full = byId.get(identity.id);
    if (full === undefined) {
      throw new RangeError(
        `population profession ${String(identity.id)} is missing from economy definitions`,
      );
    }
    if (
      full.key !== identity.key ||
      full.name !== identity.name ||
      full.stratum !== identity.stratum
    ) {
      throw new RangeError(`population profession ${String(identity.id)} does not match economy definitions`);
    }
  }
}

function assertBuildingInstances(scenario: EconomyScenarioDef, accountIds: ReadonlySet<number>): void {
  const definitions = buildingDefinitions(scenario);
  const provinces = new Set(scenario.population.provinceEconomies.map((province) => province.id));
  const policy = scenario.profitDistribution ?? {
    enabled: false,
    privatePayoutRate: 0.5,
    stateRemittanceRate: 1,
  };
  const treasuryByAccount = new Map<number, number>();
  for (const country of scenario.countries ?? []) {
    treasuryByAccount.set(country.treasuryAccountId, country.id);
  }
  const instanceIds = new Set<number>();
  for (const instance of scenario.buildingInstances) {
    const path = `buildingInstances[${String(instance.id)}]`;
    requireInteger(instance.id, `${path}.id`, 0, 0xffff_ffff);
    if (instanceIds.has(instance.id)) {
      throw new RangeError(`duplicate building instance id ${String(instance.id)}`);
    }
    instanceIds.add(instance.id);
    const definition = definitions.get(instance.definitionId);
    if (definition === undefined) {
      throw new RangeError(`${path} references unknown building definition ${String(instance.definitionId)}`);
    }
    if (!provinces.has(instance.provinceId)) {
      throw new RangeError(`${path} references unknown province ${String(instance.provinceId)}`);
    }
    requireInteger(instance.level, `${path}.level`, 1, Number.MAX_SAFE_INTEGER);
    const condition = requireFiniteNumber(instance.condition, `${path}.condition`);
    if (condition < 0 || condition > 1) throw new RangeError(`${path}.condition must be in 0..1`);
    if (instance.ownerKind !== "private" && instance.ownerKind !== "state") {
      throw new RangeError(`${path}.ownerKind must be "private" or "state"`);
    }
    if (!definition.ownershipAllowed.includes(instance.ownerKind)) {
      throw new RangeError(
        `${path}.ownerKind ${JSON.stringify(instance.ownerKind)} is not permitted by its building definition`,
      );
    }
    if (!accountIds.has(instance.ownerAccountId)) {
      throw new RangeError(`${path}.ownerAccountId references unknown account`);
    }
    if (instance.ownerKind === "state") {
      if (!policy.enabled) {
        throw new RangeError(`${path} is state-owned but the M5a profit-distribution policy is disabled`);
      }
      if (!treasuryByAccount.has(instance.ownerAccountId)) {
        throw new RangeError(`${path}.ownerAccountId must be the owning country's treasury account`);
      }
    }
    assertValidDayIndex(instance.builtOnDay);
    if (typeof instance.operational !== "boolean") {
      throw new TypeError(`${path}.operational must be a boolean`);
    }
    if (instance.technique !== undefined) {
      const technique = requireFiniteNumber(instance.technique, `${path}.technique`);
      if (!(technique > 0)) throw new RangeError(`${path}.technique must be positive`);
    }
    if (!accountIds.has(instance.operatingCashAccountId)) {
      throw new RangeError(`${path}.operatingCashAccountId references unknown account`);
    }
    requireFiniteNumber(instance.initialOperatingCashRUSD, `${path}.initialOperatingCashRUSD`);
    if (instance.initialOperatingCashRUSD < 0) {
      throw new RangeError(`${path}.initialOperatingCashRUSD must be non-negative`);
    }
    if (definition.ownershipAllowed.length === 0) {
      throw new RangeError(`${path} definition has no permitted ownership`);
    }
  }
}

function assertMarkets(scenario: EconomyScenarioDef, buildingIds: ReadonlySet<number>): Map<number, number> {
  const provinceIds = new Set(scenario.population.provinceEconomies.map((province) => province.id));
  const goods = scenario.definitions.goods;
  const goodById = new Map(goods.map((good) => [good.id, good]));
  const definitions = buildingDefinitions(scenario);
  const instanceById = new Map(scenario.buildingInstances.map((building) => [building.id, building]));
  const marketIds = new Set<number>();
  const provinceToMarket = new Map<number, number>();

  for (const market of scenario.markets) {
    requireInteger(market.id, `markets[${String(market.id)}].id`, 0, 0xffff_ffff);
    if (marketIds.has(market.id)) {
      throw new RangeError(`duplicate market id ${String(market.id)}`);
    }
    marketIds.add(market.id);
    if (market.priceRUSD.length !== goods.length) {
      throw new RangeError(
        `market ${String(market.id)} priceRUSD must contain exactly ${String(goods.length)} prices`,
      );
    }
    for (let index = 0; index < market.priceRUSD.length; index += 1) {
      const price = requireFiniteNumber(
        market.priceRUSD[index],
        `market ${String(market.id)} priceRUSD[${String(index)}]`,
      );
      if (!(price > 0)) {
        throw new RangeError(`market ${String(market.id)} priceRUSD[${String(index)}] must be positive`);
      }
    }
    const seenProvinces = new Set<number>();
    if (market.provinceIds.length === 0) {
      throw new RangeError(`market ${String(market.id)} must list at least one province`);
    }
    for (const provinceId of market.provinceIds) {
      if (!provinceIds.has(provinceId)) {
        throw new RangeError(`market ${String(market.id)} references unknown province ${String(provinceId)}`);
      }
      if (seenProvinces.has(provinceId)) {
        throw new RangeError(`market ${String(market.id)} lists province ${String(provinceId)} twice`);
      }
      seenProvinces.add(provinceId);
      const existingMarket = provinceToMarket.get(provinceId);
      if (existingMarket !== undefined) {
        throw new RangeError(
          `province ${String(provinceId)} belongs to both market ${String(existingMarket)} and market ${String(market.id)}`,
        );
      }
      provinceToMarket.set(provinceId, market.id);
    }

    // Storage and initial lots are market-scoped: a warehouse in another market
    // must not provide capacity for this market's inventory.
    const capacityByGood = new Map<number, number>();
    for (const instance of scenario.buildingInstances) {
      if (!instance.operational) continue;
      if (!seenProvinces.has(instance.provinceId)) continue;
      const definition = definitions.get(instance.definitionId);
      if (definition === undefined) continue;
      for (const capacity of definition.storageCapacityByGood) {
        capacityByGood.set(
          capacity.goodId,
          (capacityByGood.get(capacity.goodId) ?? 0) + capacity.quantity * instance.level,
        );
      }
    }
    const lotKeys = new Set<string>();
    const stockByGood = new Map<number, number>();
    for (const lot of market.stockLots) {
      const good = goodById.get(lot.goodId);
      if (good === undefined) {
        throw new RangeError(`market ${String(market.id)} lot references unknown good ${String(lot.goodId)}`);
      }
      if (!buildingIds.has(lot.ownerBuildingId)) {
        throw new RangeError(
          `market ${String(market.id)} lot references unknown owner building ${String(lot.ownerBuildingId)}`,
        );
      }
      const owner = instanceById.get(lot.ownerBuildingId);
      if (owner === undefined || !seenProvinces.has(owner.provinceId)) {
        throw new RangeError(
          `market ${String(market.id)} lot owner building ${String(lot.ownerBuildingId)} is outside the market`,
        );
      }
      const quantity = requireFiniteNumber(lot.quantity, `market ${String(market.id)} lot quantity`);
      if (!(quantity > 0)) {
        throw new RangeError(`market ${String(market.id)} lot quantity must be strictly positive`);
      }
      const key = `${String(lot.goodId)}:${String(lot.ownerBuildingId)}`;
      if (lotKeys.has(key)) {
        throw new RangeError(
          `market ${String(market.id)} contains duplicate lot for good ${String(lot.goodId)} owner ${String(lot.ownerBuildingId)}`,
        );
      }
      lotKeys.add(key);
      stockByGood.set(lot.goodId, (stockByGood.get(lot.goodId) ?? 0) + quantity);
    }
    for (const [goodId, stock] of stockByGood) {
      const capacity = capacityByGood.get(goodId) ?? 0;
      const tolerance = QUANTITY_TOLERANCE * Math.max(1, stock, capacity);
      if (stock > capacity + tolerance) {
        throw new RangeError(
          `market ${String(market.id)} initial stock for good ${String(goodId)} (${String(stock)}) exceeds its storage capacity (${String(capacity)})`,
        );
      }
    }
  }

  if (scenario.markets.length > 0) {
    for (const province of scenario.population.provinceEconomies) {
      if (!provinceToMarket.has(province.id)) {
        throw new RangeError(`province ${String(province.id)} is not assigned to a market`);
      }
    }
    assertCountryMarketCoherence(scenario, provinceToMarket);
  }
  return provinceToMarket;
}

function countryByProvinceId(scenario: EconomyScenarioDef): Map<number, number> {
  const owners = new Map<number, number>();
  for (const country of scenario.countries ?? []) {
    for (const provinceId of country.provinceIds) owners.set(provinceId, country.id);
  }
  return owners;
}

/**
 * M5 restriction: a country's provinces all belong to one market. The GDD's first
 * multi-market model permits one market per country; mixed membership would need
 * an explicit customs-zone rule that is not part of M5.
 */
function assertCountryMarketCoherence(
  scenario: EconomyScenarioDef,
  provinceToMarket: ReadonlyMap<number, number>,
): void {
  for (const country of scenario.countries ?? []) {
    let marketId: number | undefined;
    for (const provinceId of country.provinceIds) {
      const candidate = provinceToMarket.get(provinceId);
      if (candidate === undefined) continue;
      if (marketId === undefined) marketId = candidate;
      else if (marketId !== candidate) {
        throw new RangeError(
          `country ${String(country.id)} spans markets ${String(marketId)} and ${String(candidate)}; M5 permits one market per country`,
        );
      }
    }
  }
}

function assertBuildingOwnershipGeography(scenario: EconomyScenarioDef): void {
  const blockByAccount = new Map(
    scenario.population.popBlocks.map((block) => [block.financialAccountId, block]),
  );
  const owners = countryByProvinceId(scenario);
  const treasuryOwner = new Map(
    (scenario.countries ?? []).map((country) => [country.treasuryAccountId, country.id]),
  );
  for (const building of scenario.buildingInstances) {
    const buildingCountry = owners.get(building.provinceId) ?? null;
    if (building.ownerKind === "state") {
      const ownerCountry = treasuryOwner.get(building.ownerAccountId);
      if (ownerCountry === undefined) {
        throw new RangeError(
          `building ${String(building.id)} state ownerAccountId must be a country treasury account`,
        );
      }
      if (buildingCountry !== ownerCountry) {
        throw new RangeError(
          `building ${String(building.id)} and its state owner country ${String(ownerCountry)} must belong to the same country`,
        );
      }
      continue;
    }
    const owner = blockByAccount.get(building.ownerAccountId);
    if (owner === undefined) {
      throw new RangeError(
        `building ${String(building.id)} ownerAccountId must be a pop-block household cash account`,
      );
    }
    const ownerCountry = owners.get(owner.provinceId) ?? null;
    if (buildingCountry !== ownerCountry) {
      throw new RangeError(
        `building ${String(building.id)} and its owner popBlock ${String(owner.id)} must belong to the same country`,
      );
    }
  }
}

function assertInitialEmployment(
  scenario: EconomyScenarioDef,
  definitionsById: ReadonlyMap<number, BuildingDef>,
): void {
  const professions = professionIds(scenario);
  const blocks = new Map(scenario.population.popBlocks.map((block) => [block.id, block]));
  const instances = new Map(
    scenario.buildingInstances.map((building) => [building.id, building]),
  );
  const owners = countryByProvinceId(scenario);
  const countries = new Map((scenario.countries ?? []).map((country) => [country.id, country]));
  const assignmentIds = new Set<number>();
  const assignmentKeys = new Set<string>();
  const blockAssigned = new Map<number, number>();
  const buildingProfessionAssigned = new Map<string, number>();

  for (const assignment of scenario.employment) {
    const path = `employment[${String(assignment.id)}]`;
    requireInteger(assignment.id, `${path}.id`, 0, 0xffff_ffff);
    if (assignmentIds.has(assignment.id)) {
      throw new RangeError(`duplicate employment assignment id ${String(assignment.id)}`);
    }
    assignmentIds.add(assignment.id);
    const block = blocks.get(assignment.popBlockId);
    if (block === undefined) {
      throw new RangeError(`${path} references unknown popBlock`);
    }
    const instance = instances.get(assignment.buildingInstanceId);
    if (instance === undefined) {
      throw new RangeError(`${path} references unknown building instance`);
    }
    const sourceCountry = owners.get(block.provinceId) ?? null;
    const destinationCountry = owners.get(instance.provinceId) ?? null;
    if (sourceCountry !== destinationCountry) {
      if (destinationCountry === null) {
        throw new RangeError(
          `${path} cannot assign a resident of country ${String(sourceCountry)} to an unowned province`,
        );
      }
      if (countries.get(destinationCountry)?.immigrationOpen !== true) {
        throw new RangeError(
          `${path} crosses a closed border into country ${String(destinationCountry)}`,
        );
      }
    }
    if (!instance.operational) {
      throw new RangeError(`${path} references a non-operational building`);
    }
    const definition = definitionsById.get(instance.definitionId);
    if (definition === undefined) {
      throw new RangeError(`${path} references a building with no definition`);
    }
    if (assignment.professionId !== block.professionId) {
      throw new RangeError(`${path} cannot assign a block to a different profession`);
    }
    const profession = professions.get(assignment.professionId);
    if (profession === undefined) {
      throw new RangeError(`${path} references unknown profession`);
    }
    if (block.literacy < profession.qualificationLiteracy) {
      throw new RangeError(`${path} assigns a block below the profession literacy qualification`);
    }
    if (block.wealthLevel < profession.qualificationWealthLevel) {
      throw new RangeError(`${path} assigns a block below the profession wealth qualification`);
    }
    requireInteger(assignment.workers, `${path}.workers`, 1, Number.MAX_SAFE_INTEGER);
    const job = definition.jobs.find((candidate) => candidate.professionId === assignment.professionId);
    if (job === undefined) {
      throw new RangeError(`${path} references a profession with no job slot`);
    }
    const requiredWorkers =
      job.workersPerThroughputUnit *
      definition.referenceThroughputPerDayAtLevelOne *
      instance.level *
      instance.condition;
    const slots = Math.floor(requiredWorkers);
    if (assignment.workers > slots) {
      throw new RangeError(`${path}.workers exceeds the building job slots`);
    }
    const key = `${String(assignment.popBlockId)}:${String(assignment.buildingInstanceId)}:${String(assignment.professionId)}`;
    if (assignmentKeys.has(key)) {
      throw new RangeError("duplicate employment assignment for the same block/building/profession");
    }
    assignmentKeys.add(key);
    blockAssigned.set(
      assignment.popBlockId,
      (blockAssigned.get(assignment.popBlockId) ?? 0) + assignment.workers,
    );
    const buildingKey = `${String(assignment.buildingInstanceId)}:${String(assignment.professionId)}`;
    buildingProfessionAssigned.set(
      buildingKey,
      (buildingProfessionAssigned.get(buildingKey) ?? 0) + assignment.workers,
    );
  }

  for (const [blockId, assigned] of blockAssigned) {
    const block = blocks.get(blockId);
    if (block === undefined) throw new RangeError(`unknown popBlock ${String(blockId)}`);
    const profession = professions.get(block.professionId);
    if (profession === undefined) throw new RangeError(`unknown profession for popBlock ${String(blockId)}`);
    const eligible = Math.floor(initialWorkingAge(block) * profession.participationRate);
    if (assigned > eligible) {
      throw new RangeError(`${pathForBlock(blockId)} assigns more workers than eligible workforce`);
    }
  }
  for (const [key, assigned] of buildingProfessionAssigned) {
    const [buildingIdText, professionIdText] = key.split(":");
    const buildingId = Number(buildingIdText);
    const professionId = Number(professionIdText);
    const instance = instances.get(buildingId);
    if (instance === undefined) throw new RangeError(`unknown building ${String(buildingId)}`);
    const definition = definitionsById.get(instance.definitionId);
    if (definition === undefined) throw new RangeError(`unknown building definition`);
    const job = definition.jobs.find((candidate) => candidate.professionId === professionId);
    if (job === undefined) throw new RangeError(`unknown job`);
    const slots = Math.floor(
      job.workersPerThroughputUnit *
        definition.referenceThroughputPerDayAtLevelOne *
        instance.level *
        instance.condition,
    );
    if (assigned > slots) {
      throw new RangeError(`building ${String(buildingId)} profession ${String(professionId)} exceeds job slots`);
    }
  }
}

/**
 * Resolve each market's E6a customs administration.
 *
 * An authored `customsCountryId` must be a country that owns at least one province of
 * the market. When omitted, the country owning the market's lowest province id is the
 * administration; a countryless market has no customs administration. The same rule
 * is used for validation and construction so the two cannot disagree.
 */
function resolveMarketCustomsCountries(
  scenario: EconomyScenarioDef,
): Map<number, Id | null> {
  const countryByProvince = countryByProvinceId(scenario);
  const result = new Map<number, Id | null>();
  for (const market of scenario.markets) {
    const owners = new Set<number>();
    for (const provinceId of market.provinceIds) {
      const countryId = countryByProvince.get(provinceId);
      if (countryId !== undefined) owners.add(countryId);
    }
    const declared = market.customsCountryId;
    if (declared !== undefined && declared !== null) {
      if (!owners.has(declared)) {
        throw new RangeError(
          `market ${String(market.id)} customsCountryId ${String(declared)} must own at least one of its provinces`,
        );
      }
      result.set(market.id, declared);
      continue;
    }
    if (owners.size === 0) {
      result.set(market.id, null);
      continue;
    }
    let lowestProvince: number | undefined;
    for (const provinceId of market.provinceIds) {
      if (countryByProvince.get(provinceId) === undefined) continue;
      if (lowestProvince === undefined || provinceId < lowestProvince) lowestProvince = provinceId;
    }
    result.set(
      market.id,
      lowestProvince === undefined ? null : (countryByProvince.get(lowestProvince) ?? null),
    );
  }
  return result;
}

function assertTradeScenario(scenario: EconomyScenarioDef): void {
  const trade = createTradeState(scenario.tradeRoutes);
  if (trade.routes.length > 0) {
    const marketIds = new Set(scenario.markets.map((market) => market.id));
    for (const route of trade.routes) {
      for (const marketId of [route.marketAId, route.marketBId]) {
        if (!marketIds.has(marketId)) {
          throw new RangeError(
            `trade route ${String(route.id)} references unknown market ${String(marketId)}`,
          );
        }
      }
    }
  }
  for (const market of scenario.markets) {
    if (
      market.customsCountryId !== undefined &&
      market.customsCountryId !== null &&
      !Number.isInteger(market.customsCountryId)
    ) {
      throw new RangeError(
        `market ${String(market.id)} customsCountryId must be an unsigned integer or null`,
      );
    }
  }
  resolveMarketCustomsCountries(scenario);
  if (scenario.countries !== undefined) {
    for (const market of scenario.markets) {
      const customs = market.customsCountryId;
      if (customs === null || customs === undefined) continue;
      if (!scenario.countries.some((country) => country.id === customs)) {
        throw new RangeError(
          `market ${String(market.id)} customsCountryId ${String(customs)} is not a registered country`,
        );
      }
    }
  }
}

function assertTradePolicyInputs(scenario: EconomyScenarioDef): void {
  const goodCount = scenario.definitions.goods.length;
  for (const country of scenario.countries ?? []) {
    createTradePolicyState(country.trade, goodCount, `countries[${String(country.id)}].trade`);
  }
}

/**
 * Validate the E6b monetary scenario input.
 *
 * A scenario may only initialize a pegged authority for a currency the country issues
 * and uses domestically. The managed regime is a policy outcome that requires an
 * enacted currency law, so it cannot be pre-set by scenario data. The initial reserve
 * funding must be payable from the country's opening treasury cash, and the external
 * counterparty's opening cash must cover the initial currency holding.
 */
function assertValidMonetaryInputs(scenario: EconomyScenarioDef): void {
  if (scenario.monetary === undefined) return;
  const currencyById = new Map((scenario.currencies ?? []).map((currency) => [currency.id, currency]));
  const countryById = new Map((scenario.countries ?? []).map((country) => [country.id, country]));
  const valuationByCurrency = new Map(
    (scenario.currencyValuations ?? []).map((valuation) => [valuation.currencyId, valuation]),
  );
  const seenCurrencies = new Set<number>();
  const seenCountries = new Set<number>();
  for (const input of scenario.monetary.currencies ?? []) {
    const path = `monetary.currencies[${String(input.currencyId)}]`;
    const currency = currencyById.get(input.currencyId);
    if (currency === undefined) {
      throw new RangeError(`${path} references unknown currency ${String(input.currencyId)}`);
    }
    if (seenCurrencies.has(currency.id)) {
      throw new RangeError(`${path} duplicates a currency entry`);
    }
    seenCurrencies.add(currency.id);
    if (currency.issuer.kind !== "country") {
      throw new RangeError(`${path} requires a simulated-country issuer`);
    }
    const country = countryById.get(currency.issuer.countryId);
    if (country === undefined) {
      throw new RangeError(`${path} issuer country is not registered`);
    }
    if (country.monetary.kind !== "own" || country.monetary.currencyId !== currency.id) {
      throw new RangeError(`${path} requires the country's own monetary arrangement`);
    }
    if (seenCountries.has(country.id)) {
      throw new RangeError(`${path} duplicates a country's monetary authority`);
    }
    seenCountries.add(country.id);
    const regime = input.regime ?? "pegged";
    if (regime !== "pegged") {
      throw new RangeError(
        `${path}.regime must be "pegged" in scenario data; a managed regime requires an enacted currency law`,
      );
    }
    const valuation = valuationByCurrency.get(currency.id);
    const parity =
      input.parityRusdPerUnit ??
      (valuation !== undefined && valuation.status === "specified"
        ? valuation.rusdPerUnit
        : undefined);
    if (parity === undefined) {
      throw new RangeError(`${path} requires a specified valuation or an explicit parity`);
    }
    if (!Number.isFinite(parity) || !(parity > 0)) {
      throw new RangeError(`${path}.parityRusdPerUnit must be positive`);
    }
    const funding = input.reserveFundingRUSD ?? 0;
    if (!Number.isFinite(funding) || funding < 0) {
      throw new RangeError(`${path}.reserveFundingRUSD must be finite and non-negative`);
    }
    if (funding > country.initialTreasuryCashRUSD + QUANTITY_TOLERANCE) {
      throw new RangeError(
        `${path}.reserveFundingRUSD exceeds the country's opening treasury cash`,
      );
    }
    const units = input.currencyIssuedUnits ?? 0;
    if (!Number.isFinite(units) || units < 0) {
      throw new RangeError(`${path}.currencyIssuedUnits must be finite and non-negative`);
    }
    const externalCash = input.externalCashRUSD ?? units * parity;
    if (!Number.isFinite(externalCash) || externalCash < 0) {
      throw new RangeError(`${path}.externalCashRUSD must be finite and non-negative`);
    }
    if (units * parity > externalCash + QUANTITY_TOLERANCE) {
      throw new RangeError(
        `${path}.externalCashRUSD must cover the initial currency holding`,
      );
    }
  }
}

/** Opening reserve funding per country, from the monetary scenario input. */
function monetaryFundingByCountry(scenario: EconomyScenarioDef): Map<number, number> {
  const funding = new Map<number, number>();
  if (scenario.monetary === undefined) return funding;
  const currencyById = new Map((scenario.currencies ?? []).map((currency) => [currency.id, currency]));
  for (const input of scenario.monetary.currencies ?? []) {
    const currency = currencyById.get(input.currencyId);
    if (currency === undefined || currency.issuer.kind !== "country") continue;
    const amount = input.reserveFundingRUSD ?? 0;
    if (!(amount > 0)) continue;
    funding.set(currency.issuer.countryId, (funding.get(currency.issuer.countryId) ?? 0) + amount);
  }
  return funding;
}

function pathForBlock(blockId: Id): string {
  return `popBlock ${String(blockId)}`;
}

/** Validate an M3 scenario before constructing authoritative state. */
export function assertValidEconomyScenario(scenario: EconomyScenarioDef): void {
  assertValidEconomyDefinitions(scenario.definitions);
  if (scenario.profitDistribution !== undefined) {
    assertValidProfitDistributionPolicy(
      scenario.profitDistribution,
      "scenario.profitDistribution",
    );
  }
  if (scenario.countryAI !== undefined) {
    assertValidCountryAIPolicy(scenario.countryAI, "scenario.countryAI");
  }
  if (scenario.playerCountryId !== undefined && scenario.playerCountryId !== null) {
    requireInteger(
      scenario.playerCountryId,
      "scenario.playerCountryId",
      0,
      0xffff_ffff,
    );
    if (!(scenario.countries ?? []).some((country) => country.id === scenario.playerCountryId)) {
      throw new RangeError("scenario.playerCountryId is not a registered country");
    }
  }
  if (scenario.population.dataVersion !== scenario.definitions.dataVersion) {
    throw new RangeError("scenario population and economy dataVersion must match");
  }
  if (scenario.population.scenarioId !== scenario.definitions.scenarioId) {
    throw new RangeError("scenario population and economy scenarioId must match");
  }
  assertNeedsGoodReferences(scenario);
  assertProfessionIdentities(scenario);

  const accountIds = assertInitialAccountIds(scenario);
  assertCountryInitialDefs(scenario, accountIds);
  assertBuildingInstances(scenario, accountIds);
  const buildingIds = new Set(scenario.buildingInstances.map((building) => building.id));
  assertMarkets(scenario, buildingIds);
  if (scenario.buildingInstances.length > 0 && scenario.markets.length === 0) {
    throw new RangeError("M3 buildings require at least one market");
  }
  assertBuildingOwnershipGeography(scenario);
  const definitionsById = buildingDefinitions(scenario);
  assertInitialEmployment(scenario, definitionsById);
  assertTradeScenario(scenario);
  assertTradePolicyInputs(scenario);
  assertValidMonetaryInputs(scenario);
  assertValidCountryCurrencyState({
    countries: scenario.countries ?? [],
    currencies: scenario.currencies ?? [],
    currencyValuations: scenario.currencyValuations ?? [],
    provinceIds: new Set(scenario.population.provinceEconomies.map((province) => province.id)),
    allowLegacyFiscalDefaults: true,
  });
  assertFiscalProvinceOwnership(scenario);
  if (scenario.provinces !== undefined) {
    assertValidProvinceScenario(scenario.provinces, {
      countryIds: new Set((scenario.countries ?? []).map((country) => country.id)),
      provinceIds: new Set(scenario.population.provinceEconomies.map((province) => province.id)),
      countryProvinceIds: new Map(
        (scenario.countries ?? []).map((country) => [country.id, country.provinceIds] as const),
      ),
    });
  }
}

/** Build an M3 world from a validated economy scenario. */
export function createEconomyWorld(
  scenario: EconomyScenarioDef,
  options: { readonly seed?: number; readonly scenarioId?: string; readonly startDayIndex?: Day } = {},
): World {
  assertValidEconomyScenario(scenario);
  const declaredIds = [
    ...scenario.population.popBlocks.map((block) => block.financialAccountId),
    ...scenario.buildingInstances.map((instance) => instance.operatingCashAccountId),
    ...scenario.systemAccounts.map((account) => account.id),
    ...(scenario.countries ?? []).map((country) => country.treasuryAccountId),
  ];
  const accountIdFloor = declaredIds.reduce((max, id) => Math.max(max, id), 0) + 1;
  const world = createPopulationWorld(scenario.population, {
    ...options,
    deferOpeningBalances: true,
    accountIdFloor,
    fiscalAccounts: (scenario.countries ?? []).length > 0,
    allowMultipleProvinces: true,
  });
  const profitDistribution = createProfitDistributionPolicy(scenario.profitDistribution);
  world.profitDistribution = profitDistribution;
  const countryAI = createCountryAIPolicy(scenario.countryAI);
  world.countryAI = countryAI;
  world.playerCountryId = scenario.playerCountryId ?? null;
  if (scenario.moneyCoefficients !== undefined) {
    assertValidMoneyCoefficients(scenario.moneyCoefficients, "scenario.moneyCoefficients");
    world.moneyCoefficients = { ...scenario.moneyCoefficients };
  }
  world.technology = { enabled: scenario.definitions.technology !== undefined };
  world.trade = createTradeState(scenario.tradeRoutes);
  const customsCountryByMarket = resolveMarketCustomsCountries(scenario);

  const countryInitialById = new Map<Id, CountryInitialDef>(
    (scenario.countries ?? []).map((country) => [country.id, country]),
  );
  world.countries = (scenario.countries ?? [])
    .map((initial): Country => {
      const technologyPath = `countries[${String(initial.id)}].technology`;
      assertValidCountryTechnologyInput(
        initial.technology,
        scenario.definitions.technology,
        technologyPath,
      );
      const technologyState =
        scenario.definitions.technology === undefined
          ? {
              technology: neutralCountryTechnologyState(),
              education: neutralEducationState(),
            }
          : createCountryTechnologyState(
              initial.technology,
              scenario.definitions.technology,
              world.startDayIndex,
              technologyPath,
            );
      const laborState = createLaborPolicyState(
        initial.labor,
        `countries[${String(initial.id)}].labor`,
      );
      const tradeState = createTradePolicyState(
        initial.trade,
        scenario.definitions.goods.length,
        `countries[${String(initial.id)}].trade`,
      );
      const base: Country = {
        id: initial.id,
        tag: initial.tag,
        name: initial.name,
        monetary: { ...initial.monetary },
        treasuryAccountId: initial.treasuryAccountId,
        fiscal: createFiscalPolicy(initial.fiscal, `countries[${String(initial.id)}].fiscal`),
        industrial: createIndustrialPolicy(
          initial.industrial,
          `countries[${String(initial.id)}].industrial`,
        ),
        debt: createDebtPolicy(initial.debt),
        ai: createCountryAIState(initial.id, world.startDayIndex),
        immigrationOpen: initial.immigrationOpen ?? false,
        regime: neutralRegimeState(world.startDayIndex),
        laws: neutralLaws(),
        lawTransitions: [],
        interestGroups: neutralInterestGroups(),
        institutions: neutralInstitutionState(),
        labor: laborState.labor,
        trade: tradeState,
        ...technologyState,
      };
      const politicsState = createCountryPoliticsState(
        base,
        initial.politics,
        scenario.definitions.politics,
        world.startDayIndex,
      );
      return {
        ...base,
        ...politicsState,
        institutions: {
          ...politicsState.institutions,
          healthStaffShare: laborState.healthStaffShare,
        },
      };
    })
    .sort((left, right) => left.id - right.id);
  // P2 provincial ownership (D-118). With M12a province definitions every province
  // starts with its authored 1900 owner and effective controller; scenarios without
  // definitions derive ownership from the countries' initial territory. Countryless
  // fixtures keep the layer disabled. Created right after the countries:
  // interest groups, institutions and initial armies all read country territory.
  const initialOwners: { provinceId: Id; ownerPolityId: Id }[] = [];
  for (const country of scenario.countries ?? []) {
    for (const provinceId of country.provinceIds) {
      initialOwners.push({ provinceId, ownerPolityId: country.id });
    }
  }
  world.provinces =
    scenario.provinces !== undefined
      ? createProvinceState(scenario.provinces, world.startDayIndex)
      : initialOwners.length > 0
        ? createProvinceStateFromOwners(initialOwners)
        : emptyProvinceState();

  world.politics = createWorldPoliticsState(
    world.startDayIndex,
    scenario.definitions.politics,
    world.countries,
  );
  if (scenario.definitions.politics !== undefined && world.countries.length > 0) {
    for (const country of [...world.countries].sort((left, right) => left.id - right.id)) {
      refreshInstitution(world, country, scenario.definitions, world.startDayIndex);
      refreshInterestGroups(world, country, scenario.definitions);
    }
  }
  world.currencies = (scenario.currencies ?? [])
    .map(copyCurrency)
    .sort((left, right) => left.id - right.id);
  world.currencyValuations = (scenario.currencyValuations ?? [])
    .map(copyCurrencyValuation)
    .sort((left, right) => left.currencyId - right.currencyId);

  let nextAccountId = world.finance.nextAccountId;
  const allocate = (
    ownerKind: "popBlock" | "building" | "country" | "system",
    ownerId: Id | null,
    subtype: AccountSubtype,
  ): Id => {
    const id = nextAccountId;
    nextAccountId += 1;
    world.finance.accounts.push({
      id,
      ownerKind,
      ownerId,
      category: categoryForSubtype(subtype),
      subtype,
      balanceRUSD: 0,
    });
    return id;
  };

  const opening: OpeningBalanceEntry[] = [];
  const initialSavingsByBlock = new Map(
    scenario.population.popBlocks.map((block) => [block.id, block.initialSavingsRUSD]),
  );
  const equityByBlock = new Map<Id, Id>();
  for (const account of world.finance.accounts) {
    if (
      account.ownerKind === "popBlock" &&
      account.ownerId !== null &&
      account.subtype === "owner-equity"
    ) {
      equityByBlock.set(account.ownerId, account.id);
    }
  }
  for (const block of world.popBlocks) {
    const savings = initialSavingsByBlock.get(block.id);
    if (savings === undefined) {
      throw new RangeError(`missing initial savings for popBlock ${String(block.id)}`);
    }
    const equityId = equityByBlock.get(block.id);
    if (equityId === undefined) {
      throw new RangeError(`missing owner-equity account for popBlock ${String(block.id)}`);
    }
    opening.push({ accountId: block.financialAccountId, balanceRUSD: savings });
    opening.push({ accountId: equityId, balanceRUSD: savings });
  }

  for (const account of scenario.systemAccounts) {
    world.finance.accounts.push({
      id: account.id,
      ownerKind: "system",
      ownerId: null,
      category: "asset",
      subtype: "system-reserve-cash",
      balanceRUSD: 0,
    });
  }
  if (scenario.systemAccounts.length > 0) {
    const equityId = allocate("system", null, "owner-equity");
    allocate("system", null, "system-income");
    let systemTotal = 0;
    for (const account of scenario.systemAccounts) {
      systemTotal += account.balanceRUSD;
      opening.push({ accountId: account.id, balanceRUSD: account.balanceRUSD });
    }
    opening.push({ accountId: equityId, balanceRUSD: systemTotal });
  }

  // M4c government accounts. The treasury cash id is scenario-declared; the
  // owner equity, tax revenue, and welfare expense accounts are allocated
  // deterministically. Opening treasury cash is balance-sheet state, not period
  // activity, so its equity counterpart keeps the opening set balanced.
  const reserveFundingByCountry = monetaryFundingByCountry(scenario);
  for (const country of [...world.countries].sort((left, right) => left.id - right.id)) {
    const initial = countryInitialById.get(country.id);
    if (initial === undefined) {
      throw new RangeError(`missing initial definition for country ${String(country.id)}`);
    }
    world.finance.accounts.push({
      id: country.treasuryAccountId,
      ownerKind: "country",
      ownerId: country.id,
      category: "asset",
      subtype: "treasury-cash",
      balanceRUSD: 0,
    });
    const equityId = allocate("country", country.id, "owner-equity");
    allocate("country", country.id, "income-tax-revenue");
    allocate("country", country.id, "business-tax-revenue");
    allocate("country", country.id, "construction-in-progress");
    allocate("country", country.id, "public-capital");
    allocate("country", country.id, "welfare-expense");
    allocate("country", country.id, "subsidy-expense");
    if (world.trade.enabled) {
      // E6a customs: each country may administer a customs zone and collect duty.
      allocate("country", country.id, "customs-duty-revenue");
    }
    opening.push({
      accountId: country.treasuryAccountId,
      balanceRUSD:
        initial.initialTreasuryCashRUSD - (reserveFundingByCountry.get(country.id) ?? 0),
    });
    opening.push({
      accountId: equityId,
      balanceRUSD:
        initial.initialTreasuryCashRUSD - (reserveFundingByCountry.get(country.id) ?? 0),
    });
  }

  // M8 administration payroll accounts. Created only for politics-enabled worlds
  // so legacy fixtures keep their accepted account sets.
  if (scenario.definitions.politics !== undefined && world.countries.length > 0) {
    for (const country of [...world.countries].sort((left, right) => left.id - right.id)) {
      allocate("country", country.id, "administration-expense");
    }
    for (const block of [...world.popBlocks].sort((left, right) => left.id - right.id)) {
      allocate("popBlock", block.id, "administration-income");
    }
  }

  // M9 education payroll accounts. Created only for technology-enabled worlds so
  // legacy fixtures keep their accepted account sets.
  if (world.technology.enabled && world.countries.length > 0) {
    for (const country of [...world.countries].sort((left, right) => left.id - right.id)) {
      allocate("country", country.id, "education-expense");
    }
    for (const block of [...world.popBlocks].sort((left, right) => left.id - right.id)) {
      allocate("popBlock", block.id, "education-income");
    }
  }

  // E5 training payroll and stipend accounts. They exist in every country world so
  // the training policy actions are usable without a technology opt-in.
  if (world.countries.length > 0) {
    for (const country of [...world.countries].sort((left, right) => left.id - right.id)) {
      allocate("country", country.id, "training-expense");
    }
    for (const block of [...world.popBlocks].sort((left, right) => left.id - right.id)) {
      allocate("popBlock", block.id, "training-income");
    }
  }

  // M5b public-debt accounts. They are created only when at least one country has
  // an enabled debt policy, so legacy fixtures keep their accepted account sets.
  const debtEnabled = world.countries.some((country) => country.debt.enabled);
  if (debtEnabled) {
    for (const country of [...world.countries].sort((left, right) => left.id - right.id)) {
      allocate("country", country.id, "debt-liability");
      allocate("country", country.id, "interest-payable");
      allocate("country", country.id, "interest-expense");
      allocate("country", country.id, "bond-asset");
      allocate("country", country.id, "interest-receivable");
      allocate("country", country.id, "interest-income");
    }
    for (const block of [...world.popBlocks].sort((left, right) => left.id - right.id)) {
      allocate("popBlock", block.id, "bond-asset");
      allocate("popBlock", block.id, "interest-receivable");
      allocate("popBlock", block.id, "interest-income");
    }
  }

  // M10 military accounts and state. Allocated only when the scenario enables the
  // military system so legacy fixtures keep their accepted account sets (D-081).
  if (scenario.military !== undefined) {
    for (const country of [...world.countries].sort((left, right) => left.id - right.id)) {
      allocate("country", country.id, "military-expense");
    }
    for (const block of [...world.popBlocks].sort((left, right) => left.id - right.id)) {
      allocate("popBlock", block.id, "military-income");
    }
    world.military = createMilitaryState(world, scenario.military, world.startDayIndex);
  }

  // E6b monetary authorities and external counterparty accounts. Allocated for every
  // own-currency country when the scenario enables the monetary system, so a dormant
  // authority can be established later by a validated policy action.
  if (scenario.monetary !== undefined) {
    const inputByCurrency = new Map(
      (scenario.monetary.currencies ?? []).map((input) => [input.currencyId, input]),
    );
    const currencyById = new Map(world.currencies.map((currency) => [currency.id, currency]));
    const valuationByCurrency = new Map(
      world.currencyValuations.map((valuation) => [valuation.currencyId, valuation]),
    );
    const authorityByCurrency = new Map<Id, Id>();
    for (const country of world.countries) {
      if (country.monetary.kind !== "own") continue;
      const currency = currencyById.get(country.monetary.currencyId);
      if (
        currency === undefined ||
        currency.issuer.kind !== "country" ||
        currency.issuer.countryId !== country.id
      ) {
        continue;
      }
      authorityByCurrency.set(currency.id, country.id);
    }
    const monetaryRecords: MonetaryCurrencyState[] = [];
    for (const currency of [...world.currencies].sort((left, right) => left.id - right.id)) {
      const issuerCountryId = authorityByCurrency.get(currency.id);
      if (issuerCountryId === undefined) {
        monetaryRecords.push({
          currencyId: currency.id,
          issuerCountryId: null,
          regime: "pegged",
          parityRusdPerUnit: null,
          referenceParityRusdPerUnit: null,
          currencyIssuedUnits: 0,
          active: false,
          reserveAccountId: null,
          liabilityAccountId: null,
          equityAccountId: null,
          externalCashAccountId: null,
          externalCurrencyAccountId: null,
          externalEquityAccountId: null,
          lastParityChangeDay: null,
          lastManagedUpdateDay: null,
          lastMonthEndDay: null,
          lastMonthExportsRUSD: 0,
          lastMonthImportsRUSD: 0,
        });
        continue;
      }
      const reserveAccountId = allocate("country", issuerCountryId, "monetary-reserve-cash");
      const liabilityAccountId = allocate("country", issuerCountryId, "currency-liability");
      const equityAccountId = allocate("country", issuerCountryId, "monetary-equity");
      const externalCashAccountId = allocate("system", null, "external-cash");
      const externalCurrencyAccountId = allocate("system", null, "external-currency-holding");
      const externalEquityAccountId = allocate("system", null, "external-equity");
      const valuation = valuationByCurrency.get(currency.id);
      const scenarioValuation =
        valuation !== undefined && valuation.status === "specified"
          ? valuation.rusdPerUnit
          : null;
      const input = inputByCurrency.get(currency.id);
      const active = input !== undefined;
      const parity = active
        ? (input.parityRusdPerUnit ?? scenarioValuation)
        : scenarioValuation;
      if (active) {
        if (parity === null) {
          throw new RangeError(
            `monetary authority for currency ${String(currency.id)} requires a parity`,
          );
        }        const funding = input.reserveFundingRUSD ?? 0;
        const units = input.currencyIssuedUnits ?? 0;
        const holdingValue = units * parity;
        const externalCash = input.externalCashRUSD ?? holdingValue;
        // The external counterparty buys the opening circulation with RUSD, so those
        // reserves join the treasury capitalization on the authority's balance sheet:
        // reserves = funding + holding value; equity = funding; liability = holding value.
        if (funding > 0 || holdingValue > 0) {
          opening.push({
            accountId: reserveAccountId,
            balanceRUSD: funding + holdingValue,
          });
        }
        if (funding > 0) {
          opening.push({ accountId: equityAccountId, balanceRUSD: funding });
        }
        if (units > 0) {
          opening.push({ accountId: liabilityAccountId, balanceRUSD: holdingValue });
          opening.push({ accountId: externalCurrencyAccountId, balanceRUSD: holdingValue });
          opening.push({
            accountId: externalCashAccountId,
            balanceRUSD: externalCash - holdingValue,
          });
          opening.push({ accountId: externalEquityAccountId, balanceRUSD: externalCash });
        } else if (externalCash > 0) {
          opening.push({ accountId: externalCashAccountId, balanceRUSD: externalCash });
          opening.push({ accountId: externalEquityAccountId, balanceRUSD: externalCash });
        }
      }
      const brandedParity = parity === null ? null : asRusdPerCurrencyUnit(parity);
      monetaryRecords.push({
        currencyId: currency.id,
        issuerCountryId,
        regime: "pegged",
        parityRusdPerUnit: brandedParity,
        referenceParityRusdPerUnit: active ? brandedParity : null,
        currencyIssuedUnits: active ? (input.currencyIssuedUnits ?? 0) : 0,
        active,
        reserveAccountId,
        liabilityAccountId,
        equityAccountId,
        externalCashAccountId,
        externalCurrencyAccountId,
        externalEquityAccountId,
        lastParityChangeDay: null,
        lastManagedUpdateDay: null,
        lastMonthEndDay: null,
        lastMonthExportsRUSD: 0,
        lastMonthImportsRUSD: 0,
      });
    }
    world.monetary = {
      enabled: true,
      currencies: monetaryRecords,
      lastUpdateDay: null,
    };
  }

  for (const instance of [...scenario.buildingInstances].sort((left, right) => left.id - right.id)) {    world.finance.accounts.push({
      id: instance.operatingCashAccountId,
      ownerKind: "building",
      ownerId: instance.id,
      category: "asset",
      subtype: "operating-cash",
      balanceRUSD: 0,
    });
    const equityId = allocate("building", instance.id, "owner-equity");
    allocate("building", instance.id, "sales-revenue");
    allocate("building", instance.id, "input-expense");
    allocate("building", instance.id, "wage-expense");
    allocate("building", instance.id, "upkeep-expense");
    if (world.trade.enabled) {
      // E6a trade: a shipping building pays freight and any import duty.
      allocate("building", instance.id, "freight-expense");
      allocate("building", instance.id, "customs-duty-expense");
    }
    if ((scenario.countries ?? []).length > 0) {
      // E2 business-profit tax: the paying building needs an expense account and
      // its taxing country needs a distinct revenue account.
      allocate("building", instance.id, "business-tax-expense");
      // E4 production subsidy: every enterprise can receive a sector subsidy.
      allocate("building", instance.id, "subsidy-revenue");
    }
    if (profitDistribution.enabled) {
      allocate("building", instance.id, "retained-profit");
    }
    opening.push({
      accountId: instance.operatingCashAccountId,
      balanceRUSD: instance.initialOperatingCashRUSD,
    });
    opening.push({ accountId: equityId, balanceRUSD: instance.initialOperatingCashRUSD });
    world.buildings.push({
      id: instance.id,
      definitionId: instance.definitionId,
      provinceId: instance.provinceId,
      level: instance.level,
      condition: instance.condition,
      ownerKind: instance.ownerKind,
      ownerAccountId: instance.ownerAccountId,
      builtOnDay: instance.builtOnDay,
      operational: instance.operational,
      operatingCashAccountId: instance.operatingCashAccountId,
      technique: instance.technique ?? 1,
    });
  }
  world.finance.nextAccountId = nextAccountId;
  world.buildings.sort((left, right) => left.id - right.id);
  applyOpeningBalances(world.finance, world.startDayIndex, opening);
  world.finance.accounts.sort((left, right) => left.id - right.id);

  for (const market of scenario.markets) {
    const built: Market = {
      id: market.id,
      priceRUSD: [...market.priceRUSD],
      stockLots: canonicalizeStockLots(market.stockLots),
      customsCountryId: customsCountryByMarket.get(market.id) ?? null,
    };
    world.markets.push(built);
  }
  world.markets.sort((left, right) => left.id - right.id);
  // E6b price index: the base period is the scenario's first processed day, so the
  // captured opening prices normalize the index to 100.
  world.priceIndex = createPriceIndexState(
    scenario.definitions,
    scenario.population.definitions,
    world.markets,
  );
  const marketByProvince = new Map<number, number>();
  for (const market of scenario.markets) {
    for (const provinceId of market.provinceIds) marketByProvince.set(provinceId, market.id);
  }
  const buildingIdsByProvince = new Map<number, number[]>();
  for (const building of world.buildings) {
    const list = buildingIdsByProvince.get(building.provinceId);
    if (list === undefined) buildingIdsByProvince.set(building.provinceId, [building.id]);
    else list.push(building.id);
  }
  const blockIdsByProvince = new Map<number, number[]>();
  for (const block of world.popBlocks) {
    const list = blockIdsByProvince.get(block.provinceId);
    if (list === undefined) blockIdsByProvince.set(block.provinceId, [block.id]);
    else list.push(block.id);
  }

  for (const province of world.provinceEconomies) {
    province.marketId = marketByProvince.get(province.id) ?? null;
    province.buildingInstanceIds = (buildingIdsByProvince.get(province.id) ?? []).sort(
      (left, right) => left - right,
    );
    province.popBlockIds = (blockIdsByProvince.get(province.id) ?? []).sort(
      (left, right) => left - right,
    );
  }

  for (const assignment of scenario.employment) {
    const built: EmploymentAssignment = {
      id: assignment.id,
      popBlockId: assignment.popBlockId,
      buildingInstanceId: assignment.buildingInstanceId,
      professionId: assignment.professionId,
      workers: assignment.workers,
    };
    world.employment.push(built);
  }
  world.employment.sort((left, right) => left.id - right.id);
  world.popBlocks.sort((left, right) => left.id - right.id);
  world.employmentDirty = true;
  world.construction.nextBuildingId =
    world.buildings.reduce((max, building) => Math.max(max, building.id), 0) + 1;

  // P4 (D-142): the blocks were calibrated with neutral factors; fix their residuals
  // under the countries' start-of-game health, sanitation and contraception.
  calibrateDemographyForCountries(world, scenario.definitions);
  // P5 (D-143 §1): farms' techniques absorb their starting land factor, so the
  // scenario's calibrated output is unchanged on day 0.
  normaliseFarmTechniques(world, scenario.definitions);
  // P5 (D-143 §4): the scenario's deposits; a required technology must exist.
  world.resources = createResourceState(scenario.deposits);
  const technologyIds = new Set((scenario.definitions.technology?.technologies ?? []).map((entry) => entry.id));
  assertValidResourceState(
    world.resources,
    new Set(world.provinceEconomies.map((province) => province.id)),
    scenario.definitions.technology === undefined ? null : technologyIds,
    "scenario.deposits",
  );

  assertValidWorld(world);
  return world;
}
