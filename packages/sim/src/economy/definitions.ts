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
import { RESOURCE_KINDS } from "./resourceState.js";
import {
  BUILDING_SECTORS,
  GOOD_CATEGORIES,
  GOOD_GROUPS,
  LAND_USES,
  PRICE_BASES,
  PROFESSION_STRATA,
  type BuildingDef,
  type BuildingSector,
  type EconomyDefinitions,
  type GoodDef,
  type LandUse,
  type PoliticsDefinitions,
  type ProfessionDef,
  type TechnologyDefinitions,
} from "./types.js";
import { assertValidPoliticsDefinitions } from "./politics.js";
import { assertValidTechnologyDefinitions } from "./technology.js";

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
    basePrice1900RUSD: assertPositive(record.basePrice1900RUSD, `${path}.basePrice1900RUSD`),
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
  // P5b (D-146): new optional catalogue fields.
  if (record.group !== undefined) {
    if (typeof record.group !== "string" || !(GOOD_GROUPS as readonly string[]).includes(record.group)) {
      throw new RangeError(`${path}.group is not a catalogue group`);
    }
    good.group = record.group as NonNullable<GoodDef["group"]>;
  }
  for (const flag of ["storable", "tradeable"] as const) {
    if (record[flag] !== undefined) {
      if (typeof record[flag] !== "boolean") throw new TypeError(`${path}.${flag} must be a boolean`);
      good[flag] = record[flag] as boolean;
    }
  }
  if (record.tradeRequiresTechnologyId !== undefined && record.tradeRequiresTechnologyId !== null) {
    good.tradeRequiresTechnologyId = requireInteger(
      record.tradeRequiresTechnologyId,
      `${path}.tradeRequiresTechnologyId`,
      0,
      0xffff_ffff,
    );
  }
  if (record.priceBasis !== undefined) {
    if (typeof record.priceBasis !== "string" || !(PRICE_BASES as readonly string[]).includes(record.priceBasis)) {
      throw new RangeError(`${path}.priceBasis is not a price basis`);
    }
    good.priceBasis = record.priceBasis as NonNullable<GoodDef["priceBasis"]>;
  }
  if (record.internationalPrice !== undefined) {
    if (typeof record.internationalPrice !== "boolean") throw new RangeError(`${path}.internationalPrice must be a boolean`);
    if (record.internationalPrice) good.internationalPrice = true;
  }
  // Services were deferred by M3 as non-storable outputs; P5b models them as goods that
  // cannot be stored (D-146 A13, C-6), so a service must say so.
  if (good.category === "service" && good.storable !== false) {
    throw new RangeError(`${path}.category "service" requires storable: false (services cannot be stored)`);
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
    baseWage1900RUSDPerYear: assertNonNegative(
      record.baseWage1900RUSDPerYear,
      `${path}.baseWage1900RUSDPerYear`,
    ),
    trainingCostRUSD: assertNonNegative(record.trainingCostRUSD, `${path}.trainingCostRUSD`),
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
  technologyIds: ReadonlySet<number> | null,
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
  let requiredTechnologyId: number | null = null;
  if (record.requiredTechnologyId !== null && record.requiredTechnologyId !== undefined) {
    if (technologyIds === null) {
      throw new RangeError(
        `${path}.requiredTechnologyId requires technology definitions in this world`,
      );
    }
    requiredTechnologyId = requireInteger(
      record.requiredTechnologyId,
      `${path}.requiredTechnologyId`,
      0,
      0xffff_ffff,
    );
    if (!technologyIds.has(requiredTechnologyId)) {
      throw new RangeError(
        `${path}.requiredTechnologyId references unknown technology ${String(requiredTechnologyId)}`,
      );
    }
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

  const sector = record.sector;
  if (
    typeof sector !== "string" ||
    !(BUILDING_SECTORS as readonly string[]).includes(sector)
  ) {
    throw new RangeError(`${path}.sector is not a registered building sector`);
  }
  const materials = requireArray(record.constructionMaterials, `${path}.constructionMaterials`);
  const materialGoods = new Set<number>();
  for (let index = 0; index < materials.length; index += 1) {
    const item = requireRecord(
      materials[index],
      `${path}.constructionMaterials[${String(index)}]`,
    );
    const goodId = requireInteger(
      item.goodId,
      `${path}.constructionMaterials[${String(index)}].goodId`,
      0,
      0xffff_ffff,
    );
    if (!goodIds.has(goodId)) {
      throw new RangeError(
        `${path}.constructionMaterials[${String(index)}] references unknown good ${String(goodId)}`,
      );
    }
    if (materialGoods.has(goodId)) {
      throw new RangeError(
        `${path}.constructionMaterials contains duplicate good ${String(goodId)}`,
      );
    }
    materialGoods.add(goodId);
    assertPositive(
      item.quantity,
      `${path}.constructionMaterials[${String(index)}].quantity`,
    );
  }

  const landUse = record.landUse;
  if (landUse !== undefined && !(LAND_USES as readonly unknown[]).includes(landUse)) {
    throw new RangeError(`${path}.landUse must be one of ${LAND_USES.join(", ")}`);
  }
  // P5b (D-146): extraction, optional and maintenance inputs, crop bands.
  const extracts = record.extracts;
  if (extracts !== undefined) {
    if (typeof extracts !== "string" || !(RESOURCE_KINDS as readonly string[]).includes(extracts)) {
      throw new RangeError(`${path}.extracts must be one of ${RESOURCE_KINDS.join(", ")}`);
    }
    if (outputs.length === 0) throw new RangeError(`${path} extracts a resource but has no output`);
  }
  const purchaseGoods = new Set<number>(inputGoods);
  const optionalInputs =
    record.optionalInputs === undefined ? undefined : requireArray(record.optionalInputs, `${path}.optionalInputs`);
  for (let index = 0; index < (optionalInputs?.length ?? 0); index += 1) {
    const at = `${path}.optionalInputs[${String(index)}]`;
    const item = requireRecord(optionalInputs?.[index], at);
    const goodId = requireInteger(item.goodId, `${at}.goodId`, 0, 0xffff_ffff);
    if (!goodIds.has(goodId)) throw new RangeError(`${at} references unknown good ${String(goodId)}`);
    if (purchaseGoods.has(goodId)) throw new RangeError(`${path}.optionalInputs repeats good ${String(goodId)}`);
    purchaseGoods.add(goodId);
    assertPositive(item.quantityPerThroughputUnit, `${at}.quantityPerThroughputUnit`);
    const elasticity = requireFiniteNumber(item.outputElasticity, `${at}.outputElasticity`);
    if (!(elasticity > 0 && elasticity < 1)) throw new RangeError(`${at}.outputElasticity must be in (0, 1)`);
  }
  const maintenanceInputs =
    record.maintenanceInputs === undefined
      ? undefined
      : requireArray(record.maintenanceInputs, `${path}.maintenanceInputs`);
  for (let index = 0; index < (maintenanceInputs?.length ?? 0); index += 1) {
    const at = `${path}.maintenanceInputs[${String(index)}]`;
    const item = requireRecord(maintenanceInputs?.[index], at);
    const goodId = requireInteger(item.goodId, `${at}.goodId`, 0, 0xffff_ffff);
    if (!goodIds.has(goodId)) throw new RangeError(`${at} references unknown good ${String(goodId)}`);
    if (purchaseGoods.has(goodId)) throw new RangeError(`${path}.maintenanceInputs repeats good ${String(goodId)}`);
    purchaseGoods.add(goodId);
    assertPositive(item.quantityPerLevelPerDay, `${at}.quantityPerLevelPerDay`);
  }
  for (const item of outputs) {
    const goodId = (item as { goodId: number }).goodId;
    if (purchaseGoods.has(goodId)) throw new RangeError(`${path} cannot buy its own output good ${String(goodId)}`);
  }
  let maxAbsLatitudeDeg: number | undefined;
  if (record.maxAbsLatitudeDeg !== undefined) {
    maxAbsLatitudeDeg = requireFiniteNumber(record.maxAbsLatitudeDeg, `${path}.maxAbsLatitudeDeg`);
    if (!(maxAbsLatitudeDeg > 0 && maxAbsLatitudeDeg <= 90)) {
      throw new RangeError(`${path}.maxAbsLatitudeDeg must be in (0, 90]`);
    }
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
    sector: sector as BuildingSector,
    constructionCostRUSD: assertNonNegative(
      record.constructionCostRUSD,
      `${path}.constructionCostRUSD`,
    ),
    constructionWorkers: requireInteger(
      record.constructionWorkers,
      `${path}.constructionWorkers`,
      1,
      1_000_000,
    ),
    constructionMaterials: materials as BuildingDef["constructionMaterials"],
    dailyUpkeepRUSDAtLevelOne: assertNonNegative(
      record.dailyUpkeepRUSDAtLevelOne,
      `${path}.dailyUpkeepRUSDAtLevelOne`,
    ),
    storageCapacityByGood: storage as BuildingDef["storageCapacityByGood"],
    resourceRequirements: [],
    requiredTechnologyId,
    ownershipAllowed: ownership as BuildingDef["ownershipAllowed"],
    isEssentialInfrastructure: record.isEssentialInfrastructure === true,
    ...(landUse === undefined ? {} : { landUse: landUse as LandUse }),
    ...(extracts === undefined ? {} : { extracts: extracts as NonNullable<BuildingDef["extracts"]> }),
    ...(optionalInputs === undefined
      ? {}
      : { optionalInputs: optionalInputs as NonNullable<BuildingDef["optionalInputs"]> }),
    ...(maintenanceInputs === undefined
      ? {}
      : { maintenanceInputs: maintenanceInputs as NonNullable<BuildingDef["maintenanceInputs"]> }),
    ...(maxAbsLatitudeDeg === undefined ? {} : { maxAbsLatitudeDeg }),
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

  // M9 technology content is validated before buildings so a building's required
  // technology can be checked against the same authoritative definition set.
  let technology: TechnologyDefinitions | undefined;
  let technologyIds: ReadonlySet<number> | null = null;
  if (record.technology !== undefined && record.technology !== null) {
    assertValidTechnologyDefinitions(record.technology, "economyDefinitions.technology");
    technology = record.technology as TechnologyDefinitions;
    if (technology.dataVersion !== definitions.dataVersion) {
      throw new RangeError(
        "economyDefinitions.technology.dataVersion must match economyDefinitions.dataVersion",
      );
    }
    technologyIds = new Set(technology.technologies.map((entry) => entry.id));
  }

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
    assertBuilding(
      value,
      `economyDefinitions.buildings[${String(index)}]`,
      goodIds,
      professionIds,
      technologyIds,
    ),
  );
  assertUniqueIdsAndKeys(buildings, "economyDefinitions.buildings");

  // P5b (D-146 A4): goods that cannot be stored get no storage; their producers run in
  // the first production wave, so they may not need such a good themselves; optional
  // and maintenance purchases come from stock, so they must be storable.
  const nonStorable = new Set(goods.filter((good) => good.storable === false).map((good) => good.id));
  if (nonStorable.size > 0) {
    for (let index = 0; index < buildings.length; index += 1) {
      const building = buildings[index] as BuildingDef;
      const path = `economyDefinitions.buildings[${String(index)}]`;
      for (const storage of building.storageCapacityByGood) {
        if (nonStorable.has(storage.goodId)) {
          throw new RangeError(`${path} stores good ${String(storage.goodId)}, which cannot be stored`);
        }
      }
      const makesNonStorable = building.outputs.some((output) => nonStorable.has(output.goodId));
      if (makesNonStorable && building.inputs.some((input) => nonStorable.has(input.goodId))) {
        throw new RangeError(`${path} makes a non-storable good from a non-storable input`);
      }
      for (const item of [...(building.optionalInputs ?? []), ...(building.maintenanceInputs ?? [])]) {
        if (nonStorable.has(item.goodId)) {
          throw new RangeError(`${path} buys non-storable good ${String(item.goodId)} as an optional or maintenance input`);
        }
      }
    }
  }
  for (const good of goods) {
    if (good.tradeRequiresTechnologyId === undefined || good.tradeRequiresTechnologyId === null) continue;
    if (technologyIds === null || !technologyIds.has(good.tradeRequiresTechnologyId)) {
      throw new RangeError(`economyDefinitions.goods[${String(good.id)}].tradeRequiresTechnologyId references unknown technology`);
    }
  }

  if (technology !== undefined) {
    const professionKeys = new Set(professions.map((profession) => profession.key));
    for (const key of technology.academicProfessionKeys) {
      if (!professionKeys.has(key)) {
        throw new RangeError(
          `economyDefinitions.technology.academicProfessionKeys references unknown profession ${JSON.stringify(key)}`,
        );
      }
    }
  }

  if (record.politics !== undefined && record.politics !== null) {
    assertValidPoliticsDefinitions(record.politics, "economyDefinitions.politics");
    const politics = record.politics as PoliticsDefinitions;
    if (politics.dataVersion !== definitions.dataVersion) {
      throw new RangeError(
        "economyDefinitions.politics.dataVersion must match economyDefinitions.dataVersion",
      );
    }
    for (const law of politics.laws) {
      for (const technologyId of law.requiredTechnologyIds) {
        if (technologyIds === null) {
          throw new RangeError(
            `economyDefinitions.politics law ${law.key} requires technology ${String(technologyId)} but the world has no technology definitions`,
          );
        }
        if (!technologyIds.has(technologyId)) {
          throw new RangeError(
            `economyDefinitions.politics law ${law.key} references unknown technology ${String(technologyId)}`,
          );
        }
      }
    }
  }
}
