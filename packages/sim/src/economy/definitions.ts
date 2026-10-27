/**
 * Validation for M3 static economy definitions.
 *
 * Structural invalidity is rejected. Economically weak but structurally valid
 * states (unqualified populations, unstaffed buildings) are not definitions
 * errors and are handled by later runtime logic.
 */

import { MAX_SCENARIO_ID_LENGTH } from "../constants.js";
import {
  requireArray,
  requireFiniteNumber,
  requireInteger,
  requireRecord,
  requireString,
} from "../validation.js";
import { M3_DEFERRED_GOOD_KEYS } from "./constants.js";
import {
  GOOD_CATEGORIES,
  PROFESSION_STRATA,
  type BuildingDef,
  type EconomyDefinitions,
  type GoodDef,
  type ProfessionDef,
} from "./types.js";

function assertNonNegative(value: unknown, path: string): number {
  const number = requireFiniteNumber(value, path);
  if (number < 0) throw new RangeError(`${path} must be non-negative`);
  return number;
}

function assertPositive(value: unknown, path: string): number {
  const number = requireFiniteNumber(value, path);
  if (!(number > 0)) throw new RangeError(`${path} must be strictly positive`);
  return number;
}

function assertRate(value: unknown, path: string): number {
  const number = requireFiniteNumber(value, path);
  if (number < 0 || number > 1) throw new RangeError(`${path} must be in 0..1`);
  return number;
}

function assertGood(value: unknown, path: string): GoodDef {
  const record = requireRecord(value, path);
  const good: GoodDef = {
    id: requireInteger(record.id, `${path}.id`, 0, 0xffff_ffff),
    key: requireString(record.key, `${path}.key`, { minLength: 1 }),
    name: requireString(record.name, `${path}.name`, { minLength: 1 }),
    category: requireString(record.category, `${path}.category`) as GoodDef["category"],
    basePrice1900SUSD: assertPositive(record.basePrice1900SUSD, `${path}.basePrice1900SUSD`),
    transportCostPerUnit: assertNonNegative(
      record.transportCostPerUnit,
      `${path}.transportCostPerUnit`,
    ),
    priceElasticity: assertNonNegative(record.priceElasticity, `${path}.priceElasticity`),
    spoilageRateAnnual: assertRate(record.spoilageRateAnnual, `${path}.spoilageRateAnnual`),
    unitLabel: requireString(record.unitLabel, `${path}.unitLabel`, { minLength: 1 }),
  };
  if (!(GOOD_CATEGORIES as readonly string[]).includes(good.category)) {
    throw new RangeError(`${path}.category is not a valid good category`);
  }
  if (good.category === "service") {
    throw new RangeError(`${path}.category "service" is deferred from M3`);
  }
  if ((M3_DEFERRED_GOOD_KEYS as readonly string[]).includes(good.key)) {
    throw new RangeError(
      `${path}.key ${JSON.stringify(good.key)} is deferred from M3 (non-storable service output)`,
    );
  }
  return good;
}

function assertProfession(value: unknown, path: string): ProfessionDef {
  const record = requireRecord(value, path);
  const profession: ProfessionDef = {
    id: requireInteger(record.id, `${path}.id`, 0, 0xffff_ffff),
    key: requireString(record.key, `${path}.key`, { minLength: 1 }),
    name: requireString(record.name, `${path}.name`, { minLength: 1 }),
    stratum: requireString(record.stratum, `${path}.stratum`) as ProfessionDef["stratum"],
    participationRate: assertRate(record.participationRate, `${path}.participationRate`),
    qualificationLiteracy: assertRate(
      record.qualificationLiteracy,
      `${path}.qualificationLiteracy`,
    ),
    qualificationWealthLevel: requireInteger(
      record.qualificationWealthLevel,
      `${path}.qualificationWealthLevel`,
      0,
      99,
    ),
    baseWage1900SUSDPerYear: assertNonNegative(
      record.baseWage1900SUSDPerYear,
      `${path}.baseWage1900SUSDPerYear`,
    ),
    trainingCostSUSD: assertNonNegative(record.trainingCostSUSD, `${path}.trainingCostSUSD`),
    laborProductivityModifier: assertPositive(
      record.laborProductivityModifier,
      `${path}.laborProductivityModifier`,
    ),
  };
  if (!(PROFESSION_STRATA as readonly string[]).includes(profession.stratum)) {
    throw new RangeError(`${path}.stratum is not a valid profession stratum`);
  }
  return profession;
}

function assertGoodQuantityList(
  value: unknown,
  path: string,
  goodIds: ReadonlySet<number>,
  label: "input" | "output",
): void {
  const items = requireArray(value, path);
  const seen = new Set<number>();
  for (let index = 0; index < items.length; index += 1) {
    const item = requireRecord(items[index], `${path}[${String(index)}]`);
    const goodId = requireInteger(item.goodId, `${path}[${String(index)}].goodId`, 0, 0xffff_ffff);
    if (!goodIds.has(goodId)) {
      throw new RangeError(`${path}[${String(index)}] references unknown good ${String(goodId)}`);
    }
    if (seen.has(goodId)) {
      throw new RangeError(`${path} contains duplicate ${label} good ${String(goodId)}`);
    }
    seen.add(goodId);
    assertPositive(
      item.quantityPerThroughputUnit,
      `${path}[${String(index)}].quantityPerThroughputUnit`,
    );
  }
}

function assertBuilding(
  value: unknown,
  path: string,
  goodIds: ReadonlySet<number>,
  professionIds: ReadonlySet<number>,
): BuildingDef {
  const record = requireRecord(value, path);
  const inputs = requireArray(record.inputs, `${path}.inputs`);
  const outputs = requireArray(record.outputs, `${path}.outputs`);
  assertGoodQuantityList(record.inputs, `${path}.inputs`, goodIds, "input");
  assertGoodQuantityList(record.outputs, `${path}.outputs`, goodIds, "output");

  const inputGoods = new Set<number>();
  for (const item of inputs) {
    const typed = item as { goodId: number };
    inputGoods.add(typed.goodId);
  }
  for (const item of outputs) {
    const typed = item as { goodId: number };
    if (inputGoods.has(typed.goodId)) {
      throw new RangeError(`${path} cannot consume its own output good ${String(typed.goodId)}`);
    }
  }

  const jobs = requireArray(record.jobs, `${path}.jobs`);
  const jobProfessions = new Set<number>();
  for (let index = 0; index < jobs.length; index += 1) {
    const item = requireRecord(jobs[index], `${path}.jobs[${String(index)}]`);
    const professionId = requireInteger(
      item.professionId,
      `${path}.jobs[${String(index)}].professionId`,
      0,
      0xffff_ffff,
    );
    if (!professionIds.has(professionId)) {
      throw new RangeError(
        `${path}.jobs[${String(index)}] references unknown profession ${String(professionId)}`,
      );
    }
    if (jobProfessions.has(professionId)) {
      throw new RangeError(`${path}.jobs contains duplicate profession ${String(professionId)}`);
    }
    jobProfessions.add(professionId);
    assertPositive(
      item.workersPerThroughputUnit,
      `${path}.jobs[${String(index)}].workersPerThroughputUnit`,
    );
  }

  const storage = requireArray(record.storageCapacityByGood, `${path}.storageCapacityByGood`);
  const storageGoods = new Set<number>();
  for (let index = 0; index < storage.length; index += 1) {
    const item = requireRecord(
      storage[index],
      `${path}.storageCapacityByGood[${String(index)}]`,
    );
    const goodId = requireInteger(
      item.goodId,
      `${path}.storageCapacityByGood[${String(index)}].goodId`,
      0,
      0xffff_ffff,
    );
    if (!goodIds.has(goodId)) {
      throw new RangeError(
        `${path}.storageCapacityByGood[${String(index)}] references unknown good ${String(goodId)}`,
      );
    }
    if (storageGoods.has(goodId)) {
      throw new RangeError(`${path}.storageCapacityByGood contains duplicate good ${String(goodId)}`);
    }
    storageGoods.add(goodId);
    assertPositive(
      item.quantity,
      `${path}.storageCapacityByGood[${String(index)}].quantity`,
    );
  }

  const resourceRequirements = requireArray(
    record.resourceRequirements,
    `${path}.resourceRequirements`,
  );
  if (resourceRequirements.length > 0) {
    throw new RangeError(
      `${path}.resourceRequirements must be empty in M3; resource-limited recipes are deferred`,
    );
  }
  if (record.requiredTechnologyId !== null) {
    throw new RangeError(`${path}.requiredTechnologyId must be null in M3`);
  }

  const ownership = requireArray(record.ownershipAllowed, `${path}.ownershipAllowed`);
  if (ownership.length === 0) {
    throw new RangeError(`${path}.ownershipAllowed must not be empty`);
  }
  for (const ownerKind of ownership) {
    if (ownerKind !== "private" && ownerKind !== "state") {
      throw new RangeError(`${path}.ownershipAllowed contains invalid owner kind`);
    }
  }
  if (!ownership.includes("private")) {
    throw new RangeError(`${path}.ownershipAllowed must include private ownership in M3`);
  }

  const building: BuildingDef = {
    id: requireInteger(record.id, `${path}.id`, 0, 0xffff_ffff),
    key: requireString(record.key, `${path}.key`, { minLength: 1 }),
    name: requireString(record.name, `${path}.name`, { minLength: 1 }),
    referenceThroughputPerDayAtLevelOne: assertPositive(
      record.referenceThroughputPerDayAtLevelOne,
      `${path}.referenceThroughputPerDayAtLevelOne`,
    ),
    inputs: inputs as BuildingDef["inputs"],
    outputs: outputs as BuildingDef["outputs"],
    jobs: jobs as BuildingDef["jobs"],
    constructionCostSUSD: assertNonNegative(
      record.constructionCostSUSD,
      `${path}.constructionCostSUSD`,
    ),
    constructionWorkers: requireInteger(
      record.constructionWorkers,
      `${path}.constructionWorkers`,
      1,
      1_000_000,
    ),
    dailyUpkeepSUSDAtLevelOne: assertNonNegative(
      record.dailyUpkeepSUSDAtLevelOne,
      `${path}.dailyUpkeepSUSDAtLevelOne`,
    ),
    storageCapacityByGood: storage as BuildingDef["storageCapacityByGood"],
    resourceRequirements: [],
    requiredTechnologyId: null,
    ownershipAllowed: ownership as BuildingDef["ownershipAllowed"],
    isEssentialInfrastructure: record.isEssentialInfrastructure === true,
  };
  if (typeof record.isEssentialInfrastructure !== "boolean") {
    throw new TypeError(`${path}.isEssentialInfrastructure must be a boolean`);
  }
  if (building.outputs.length === 0 && building.storageCapacityByGood.length === 0) {
    throw new RangeError(`${path} must have an output or storage capacity`);
  }
  return building;
}

function assertUniqueIdsAndKeys<T extends { id: number; key: string }>(
  values: readonly T[],
  path: string,
): void {
  const ids = new Set<number>();
  const keys = new Set<string>();
  for (const value of values) {
    if (ids.has(value.id)) throw new RangeError(`${path} contains duplicate id ${String(value.id)}`);
    if (keys.has(value.key)) {
      throw new RangeError(`${path} contains duplicate key ${JSON.stringify(value.key)}`);
    }
    ids.add(value.id);
    keys.add(value.key);
  }
}

/** Validate immutable M3 economy definitions. */
export function assertValidEconomyDefinitions(definitions: EconomyDefinitions): void {
  const record = requireRecord(definitions, "economyDefinitions");
  requireString(record.dataVersion, "economyDefinitions.dataVersion", {
    minLength: 1,
    maxLength: MAX_SCENARIO_ID_LENGTH,
  });
  requireString(record.scenarioId, "economyDefinitions.scenarioId", {
    minLength: 1,
    maxLength: MAX_SCENARIO_ID_LENGTH,
  });

  const rawGoods = requireArray(record.goods, "economyDefinitions.goods");
  if (rawGoods.length === 0) throw new RangeError("economyDefinitions.goods must not be empty");
  const goods = rawGoods.map((value, index) =>
    assertGood(value, `economyDefinitions.goods[${String(index)}]`),
  );
  assertUniqueIdsAndKeys(goods, "economyDefinitions.goods");
  for (let index = 0; index < goods.length; index += 1) {
    if (goods[index]?.id !== index) {
      throw new RangeError("economyDefinitions.goods ids must be dense 0..n-1");
    }
  }

  const rawProfessions = requireArray(record.professions, "economyDefinitions.professions");
  if (rawProfessions.length === 0) {
    throw new RangeError("economyDefinitions.professions must not be empty");
  }
  const professions = rawProfessions.map((value, index) =>
    assertProfession(value, `economyDefinitions.professions[${String(index)}]`),
  );
  assertUniqueIdsAndKeys(professions, "economyDefinitions.professions");

  const rawBuildings = requireArray(record.buildings, "economyDefinitions.buildings");
  const goodIds = new Set(goods.map((good) => good.id));
  const professionIds = new Set(professions.map((profession) => profession.id));
  const buildings = rawBuildings.map((value, index) =>
    assertBuilding(value, `economyDefinitions.buildings[${String(index)}]`, goodIds, professionIds),
  );
  assertUniqueIdsAndKeys(buildings, "economyDefinitions.buildings");
}
