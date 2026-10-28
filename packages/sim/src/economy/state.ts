/**
 * M3 scenario validation and world construction.
 *
 * Construction is structural only. It creates buildings, assignments, markets,
 * inventory lots, and cash accounts. It does not run employment matching,
 * production, market clearing, wages, or pricing.
 */

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
import { assertValidWorld, type World } from "../world.js";
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
    requireFiniteNumber(country.initialTreasuryCashSUSD, `${path}.initialTreasuryCashSUSD`);
    if (country.initialTreasuryCashSUSD < 0) {
      throw new RangeError(`${path}.initialTreasuryCashSUSD must be non-negative`);
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
 * M4c: a country with an active fiscal policy must own every region that
 * contains population blocks or buildings, otherwise tax and welfare would
 * silently skip real economic entities. Zero-fiscal worlds keep the M4a-2
 * rule that unowned regions are permitted.
 */
function assertFiscalRegionOwnership(scenario: EconomyScenarioDef): void {
  const countries = scenario.countries ?? [];
  if (!countries.some((country) => fiscalPolicyIsActive(country.fiscal))) return;
  const claimed = new Map<number, number>();
  for (const country of countries) {
    for (const regionId of country.regionIds) {
      claimed.set(regionId, (claimed.get(regionId) ?? 0) + 1);
    }
  }
  const economicRegions = new Set<number>();
  for (const block of scenario.population.popBlocks) economicRegions.add(block.regionId);
  for (const building of scenario.buildingInstances) economicRegions.add(building.regionId);
  for (const regionId of economicRegions) {
    const claims = claimed.get(regionId) ?? 0;
    if (claims !== 1) {
      throw new RangeError(
        `region ${String(regionId)} must be owned by exactly one country when a fiscal policy is active; found ${String(claims)}`,
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
  const regions = new Set(scenario.population.regions.map((region) => region.id));
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
    if (!regions.has(instance.regionId)) {
      throw new RangeError(`${path} references unknown region ${String(instance.regionId)}`);
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
    if (!accountIds.has(instance.operatingCashAccountId)) {
      throw new RangeError(`${path}.operatingCashAccountId references unknown account`);
    }
    requireFiniteNumber(instance.initialOperatingCashSUSD, `${path}.initialOperatingCashSUSD`);
    if (instance.initialOperatingCashSUSD < 0) {
      throw new RangeError(`${path}.initialOperatingCashSUSD must be non-negative`);
    }
    if (definition.ownershipAllowed.length === 0) {
      throw new RangeError(`${path} definition has no permitted ownership`);
    }
  }
}

function assertMarkets(scenario: EconomyScenarioDef, buildingIds: ReadonlySet<number>): Map<number, number> {
  const regionIds = new Set(scenario.population.regions.map((region) => region.id));
  const goods = scenario.definitions.goods;
  const goodById = new Map(goods.map((good) => [good.id, good]));
  const definitions = buildingDefinitions(scenario);
  const instanceById = new Map(scenario.buildingInstances.map((building) => [building.id, building]));
  const marketIds = new Set<number>();
  const regionToMarket = new Map<number, number>();

  for (const market of scenario.markets) {
    requireInteger(market.id, `markets[${String(market.id)}].id`, 0, 0xffff_ffff);
    if (marketIds.has(market.id)) {
      throw new RangeError(`duplicate market id ${String(market.id)}`);
    }
    marketIds.add(market.id);
    if (market.priceSUSD.length !== goods.length) {
      throw new RangeError(
        `market ${String(market.id)} priceSUSD must contain exactly ${String(goods.length)} prices`,
      );
    }
    for (let index = 0; index < market.priceSUSD.length; index += 1) {
      const price = requireFiniteNumber(
        market.priceSUSD[index],
        `market ${String(market.id)} priceSUSD[${String(index)}]`,
      );
      if (!(price > 0)) {
        throw new RangeError(`market ${String(market.id)} priceSUSD[${String(index)}] must be positive`);
      }
    }
    const seenRegions = new Set<number>();
    if (market.regionIds.length === 0) {
      throw new RangeError(`market ${String(market.id)} must list at least one region`);
    }
    for (const regionId of market.regionIds) {
      if (!regionIds.has(regionId)) {
        throw new RangeError(`market ${String(market.id)} references unknown region ${String(regionId)}`);
      }
      if (seenRegions.has(regionId)) {
        throw new RangeError(`market ${String(market.id)} lists region ${String(regionId)} twice`);
      }
      seenRegions.add(regionId);
      const existingMarket = regionToMarket.get(regionId);
      if (existingMarket !== undefined) {
        throw new RangeError(
          `region ${String(regionId)} belongs to both market ${String(existingMarket)} and market ${String(market.id)}`,
        );
      }
      regionToMarket.set(regionId, market.id);
    }

    // Storage and initial lots are market-scoped: a warehouse in another market
    // must not provide capacity for this market's inventory.
    const capacityByGood = new Map<number, number>();
    for (const instance of scenario.buildingInstances) {
      if (!instance.operational) continue;
      if (!seenRegions.has(instance.regionId)) continue;
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
      if (owner === undefined || !seenRegions.has(owner.regionId)) {
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
    for (const region of scenario.population.regions) {
      if (!regionToMarket.has(region.id)) {
        throw new RangeError(`region ${String(region.id)} is not assigned to a market`);
      }
    }
    assertCountryMarketCoherence(scenario, regionToMarket);
  }
  return regionToMarket;
}

function countryByRegionId(scenario: EconomyScenarioDef): Map<number, number> {
  const owners = new Map<number, number>();
  for (const country of scenario.countries ?? []) {
    for (const regionId of country.regionIds) owners.set(regionId, country.id);
  }
  return owners;
}

/**
 * M5 restriction: a country's regions all belong to one market. The GDD's first
 * multi-market model permits one market per country; mixed membership would need
 * an explicit customs-zone rule that is not part of M5.
 */
function assertCountryMarketCoherence(
  scenario: EconomyScenarioDef,
  regionToMarket: ReadonlyMap<number, number>,
): void {
  for (const country of scenario.countries ?? []) {
    let marketId: number | undefined;
    for (const regionId of country.regionIds) {
      const candidate = regionToMarket.get(regionId);
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
  const owners = countryByRegionId(scenario);
  const treasuryOwner = new Map(
    (scenario.countries ?? []).map((country) => [country.treasuryAccountId, country.id]),
  );
  for (const building of scenario.buildingInstances) {
    const buildingCountry = owners.get(building.regionId) ?? null;
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
    const ownerCountry = owners.get(owner.regionId) ?? null;
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
  const owners = countryByRegionId(scenario);
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
    const sourceCountry = owners.get(block.regionId) ?? null;
    const destinationCountry = owners.get(instance.regionId) ?? null;
    if (sourceCountry !== destinationCountry) {
      if (destinationCountry === null) {
        throw new RangeError(
          `${path} cannot assign a resident of country ${String(sourceCountry)} to an unowned region`,
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
  assertValidCountryCurrencyState({
    countries: scenario.countries ?? [],
    currencies: scenario.currencies ?? [],
    currencyValuations: scenario.currencyValuations ?? [],
    regionIds: new Set(scenario.population.regions.map((region) => region.id)),
    allowLegacyFiscalDefaults: true,
  });
  assertFiscalRegionOwnership(scenario);
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
    allowMultipleRegions: true,
  });
  const profitDistribution = createProfitDistributionPolicy(scenario.profitDistribution);
  world.profitDistribution = profitDistribution;
  const countryAI = createCountryAIPolicy(scenario.countryAI);
  world.countryAI = countryAI;
  world.playerCountryId = scenario.playerCountryId ?? null;

  const countryInitialById = new Map<Id, CountryInitialDef>(
    (scenario.countries ?? []).map((country) => [country.id, country]),
  );
  world.countries = (scenario.countries ?? [])
    .map((initial): Country => {
      const base: Country = {
        id: initial.id,
        tag: initial.tag,
        name: initial.name,
        monetary: { ...initial.monetary },
        regionIds: [...initial.regionIds].sort((left, right) => left - right),
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
      };
      return {
        ...base,
        ...createCountryPoliticsState(
          base,
          initial.politics,
          scenario.definitions.politics,
          world.startDayIndex,
        ),
      };
    })
    .sort((left, right) => left.id - right.id);
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
      balanceSUSD: 0,
    });
    return id;
  };

  const opening: OpeningBalanceEntry[] = [];
  const initialSavingsByBlock = new Map(
    scenario.population.popBlocks.map((block) => [block.id, block.initialSavingsSUSD]),
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
    opening.push({ accountId: block.financialAccountId, balanceSUSD: savings });
    opening.push({ accountId: equityId, balanceSUSD: savings });
  }

  for (const account of scenario.systemAccounts) {
    world.finance.accounts.push({
      id: account.id,
      ownerKind: "system",
      ownerId: null,
      category: "asset",
      subtype: "system-reserve-cash",
      balanceSUSD: 0,
    });
  }
  if (scenario.systemAccounts.length > 0) {
    const equityId = allocate("system", null, "owner-equity");
    allocate("system", null, "system-income");
    let systemTotal = 0;
    for (const account of scenario.systemAccounts) {
      systemTotal += account.balanceSUSD;
      opening.push({ accountId: account.id, balanceSUSD: account.balanceSUSD });
    }
    opening.push({ accountId: equityId, balanceSUSD: systemTotal });
  }

  // M4c government accounts. The treasury cash id is scenario-declared; the
  // owner equity, tax revenue, and welfare expense accounts are allocated
  // deterministically. Opening treasury cash is balance-sheet state, not period
  // activity, so its equity counterpart keeps the opening set balanced.
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
      balanceSUSD: 0,
    });
    const equityId = allocate("country", country.id, "owner-equity");
    allocate("country", country.id, "income-tax-revenue");
    allocate("country", country.id, "business-tax-revenue");
    allocate("country", country.id, "construction-in-progress");
    allocate("country", country.id, "public-capital");
    allocate("country", country.id, "welfare-expense");
    allocate("country", country.id, "subsidy-expense");
    opening.push({
      accountId: country.treasuryAccountId,
      balanceSUSD: initial.initialTreasuryCashSUSD,
    });
    opening.push({ accountId: equityId, balanceSUSD: initial.initialTreasuryCashSUSD });
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

  for (const instance of [...scenario.buildingInstances].sort((left, right) => left.id - right.id)) {
    world.finance.accounts.push({
      id: instance.operatingCashAccountId,
      ownerKind: "building",
      ownerId: instance.id,
      category: "asset",
      subtype: "operating-cash",
      balanceSUSD: 0,
    });
    const equityId = allocate("building", instance.id, "owner-equity");
    allocate("building", instance.id, "sales-revenue");
    allocate("building", instance.id, "input-expense");
    allocate("building", instance.id, "wage-expense");
    allocate("building", instance.id, "upkeep-expense");
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
      balanceSUSD: instance.initialOperatingCashSUSD,
    });
    opening.push({ accountId: equityId, balanceSUSD: instance.initialOperatingCashSUSD });
    world.buildings.push({
      id: instance.id,
      definitionId: instance.definitionId,
      regionId: instance.regionId,
      level: instance.level,
      condition: instance.condition,
      ownerKind: instance.ownerKind,
      ownerAccountId: instance.ownerAccountId,
      builtOnDay: instance.builtOnDay,
      operational: instance.operational,
      operatingCashAccountId: instance.operatingCashAccountId,
    });
  }
  world.finance.nextAccountId = nextAccountId;
  world.buildings.sort((left, right) => left.id - right.id);
  applyOpeningBalances(world.finance, world.startDayIndex, opening);
  world.finance.accounts.sort((left, right) => left.id - right.id);

  for (const market of scenario.markets) {
    const built: Market = {
      id: market.id,
      regionIds: [...market.regionIds].sort((left, right) => left - right),
      priceSUSD: [...market.priceSUSD],
      stockLots: canonicalizeStockLots(market.stockLots),
    };
    world.markets.push(built);
  }
  world.markets.sort((left, right) => left.id - right.id);
  const marketByRegion = new Map<number, number>();
  for (const market of world.markets) {
    for (const regionId of market.regionIds) marketByRegion.set(regionId, market.id);
  }

  for (const region of world.regions) {
    region.marketId = marketByRegion.get(region.id) ?? null;
    region.buildingInstanceIds = world.buildings
      .filter((building) => building.regionId === region.id)
      .map((building) => building.id)
      .sort((left, right) => left - right);
    region.popBlockIds = world.popBlocks
      .filter((block) => block.regionId === region.id)
      .map((block) => block.id)
      .sort((left, right) => left - right);
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

  assertValidWorld(world);
  return world;
}
