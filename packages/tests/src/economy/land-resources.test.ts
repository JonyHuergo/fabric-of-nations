/**
 * P5 land, agriculture, harvests and resources (D-143; docs/PROSPERITY_PROGRAM.md §4 P5).
 *
 * - Storage overflow never leaves dust lots (the P4 century run's day-6,320 failure).
 * - Marginal product of farm labour falls as labour per hectare rises (property).
 * - Harvest weather: keyed per (province, year), mean 1, documented σ.
 * - Own consumption: owners keep their subsistence food; goods and money conserved.
 * - A bad harvest in a low-access market produces shortage, a price spike and
 *   mortality, the mortality only through food sufficiency.
 * - Deposits never go negative and depletion is conserved; discovery is deterministic
 *   under replay and save/load, and gated by technology.
 */

import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadM11World, loadM3SmallEconomy, loadM5EightPolities } from "@century/data";
import {
  applyOverflowToTable,
  assertValidWorld,
  civilDateToDayIndex,
  computeBuildingCapacity,
  shipmentFunding,
  createEconomyWorld,
  depositRemaining,
  deserializeWorld,
  effectiveAdultMortality,
  extractFromDeposit,
  effectiveChildMortality,
  farmLandFactor,
  FARM_LABOUR_ELASTICITY,
  FOOD_MORTALITY_WEIGHT_ADULT,
  FOOD_MORTALITY_WEIGHT_CHILD,
  harvestWeatherFactor,
  HARVEST_WEATHER_SIGMA,
  hashWorld,
  landKey,
  landPerLevelByProvince,
  lotTableFromLots,
  NEUTRAL_DEMOGRAPHY_FACTORS,
  populationTotal,
  QUANTITY_TOLERANCE,
  RESOURCE_KINDS,
  runDiscoveryPhase,
  serializeWorld,
  tick,
  validateConstructionStart,
  type DepositInitialDef,
  type EconomyScenarioDef,
  type Month,
  type World,
} from "@century/sim";

const GRAIN = 0;
const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

/**
 * The M3 small economy (one province, one market, no trade routes: a low-access
 * market) with P5 land: its two farms farm cropland and its ranch grazing land.
 * `grainScale` multiplies the farms' grain recipes; `savingsRUSD` sets every block's
 * opening savings (ample savings make the market supply-limited, not cash-limited);
 * `subsistenceGrainKg` sets the subsistence grain per person (the fixture's 0.9 kg is
 * 3,060 kcal, far above the 1,950 kcal requirement; the 1900 world's is 0.527 kg).
 */
function landScenario(grainScale = 1, savingsRUSD?: number, subsistenceGrainKg?: number): EconomyScenarioDef {
  const scenario = JSON.parse(JSON.stringify(loadM3SmallEconomy())) as EconomyScenarioDef;
  if (subsistenceGrainKg !== undefined) {
    const item = scenario.population.definitions.needs[0]!.items.find((entry) => entry.goodKey === "grain")!;
    (item as { quantityPerCapitaPerDay: number }).quantityPerCapitaPerDay = subsistenceGrainKg;
  }
  if (savingsRUSD !== undefined) {
    for (const block of scenario.population.popBlocks as unknown as { initialSavingsRUSD?: number }[]) block.initialSavingsRUSD = savingsRUSD;
  }
  const buildings = scenario.definitions.buildings as unknown as {
    landUse?: string;
    outputs: { goodId: number; quantityPerThroughputUnit: number }[];
  }[];
  buildings[0]!.landUse = "cropland";
  buildings[1]!.landUse = "cropland";
  buildings[2]!.landUse = "pasture";
  for (const index of [0, 1]) {
    for (const output of buildings[index]!.outputs) {
      if (output.goodId === GRAIN) output.quantityPerThroughputUnit *= grainScale;
    }
  }
  const province = scenario.population.provinceEconomies[0] as { arableLandHa?: number; pastureHa?: number };
  province.arableLandHa = 1_000_000;
  province.pastureHa = 1_000_000;
  return scenario;
}

function contextOf(scenario: EconomyScenarioDef, detail: "full" | "summary" = "summary") {
  return {
    population: { definitions: scenario.population.definitions },
    economy: { definitions: scenario.definitions },
    detail,
  };
}

/** Grain the building would produce today (no inputs: capacity × recipe). */
function grainOutput(world: World, scenario: EconomyScenarioDef, buildingId: number): number {
  const building = world.buildings.find((entry) => entry.id === buildingId)!;
  const definition = scenario.definitions.buildings.find((entry) => entry.id === building.definitionId)!;
  const perTU = definition.outputs.find((output) => output.goodId === GRAIN)?.quantityPerThroughputUnit ?? 0;
  return perTU * computeBuildingCapacity(world, scenario.definitions, buildingId).capacityTU;
}

describe("P5 storage overflow never leaves dust lots (day-6,320 regression)", () => {
  test("a lot that never sells is lost whole once it would fall below the tolerance", () => {
    // Two producers of good 0; storage holds 900 of the 1,000 + dust in stock.
    const table = lotTableFromLots(
      [
        { goodId: 0, ownerBuildingId: 1, quantity: 1_000 },
        { goodId: 0, ownerBuildingId: 2, quantity: 5e-10 },
      ],
      [1, 2],
      1,
    );
    const losses = applyOverflowToTable(table, [900], 1);
    const slot2 = table.slotOf.get(2) ?? -1;
    expect(table.present[slot2]).toBe(0);
    expect(table.quantity[slot2]).toBe(0);
    const lost = losses.reduce((sum, loss) => sum + loss.quantity, 0);
    const slot1 = table.slotOf.get(1) ?? -1;
    // The inventory identity holds exactly: opening = closing + recorded loss.
    expect((table.quantity[slot1] ?? 0) + lost).toBeCloseTo(1_000 + 5e-10, 9);
    expect(losses.find((loss) => loss.ownerBuildingId === 2)?.quantity).toBe(5e-10);
  });

  test("seventeen years of daily overflow on an unsold lot never produce a subnormal quantity", () => {
    // Producer 1 refills to 1,000 every day; producer 2's 10 kg never sells. On main the
    // daily proportional cut took such lots to 1.5e-323 kg by 1912 (price × quantity = 0).
    const table = lotTableFromLots(
      [
        { goodId: 0, ownerBuildingId: 1, quantity: 1_000 },
        { goodId: 0, ownerBuildingId: 2, quantity: 10 },
      ],
      [1, 2],
      1,
    );
    const slot1 = table.slotOf.get(1) ?? -1;
    const slot2 = table.slotOf.get(2) ?? -1;
    let lost = 0;
    let produced = 0;
    for (let day = 0; day < 6_400; day += 1) {
      const before = table.quantity[slot1] ?? 0;
      table.quantity[slot1] = before + 500;
      table.present[slot1] = 1;
      produced += 500;
      for (const loss of applyOverflowToTable(table, [1_000], 1)) lost += loss.quantity;
      const dust = table.quantity[slot2] ?? 0;
      if (table.present[slot2] === 1) expect(dust).toBeGreaterThanOrEqual(QUANTITY_TOLERANCE);
    }
    expect(table.present[slot2]).toBe(0);
    const closing = (table.quantity[slot1] ?? 0) + (table.quantity[slot2] ?? 0);
    expect(closing + lost).toBeCloseTo(1_010 + produced, 3);
  });
});

describe("P5 land: diminishing returns in labour per hectare (D-143 §1)", () => {
  test("marginal product of labour falls as labour per hectare rises (property)", () => {
    const scenario = landScenario();
    const world = createEconomyWorld(scenario, { seed: 5 });
    const assignment = world.employment.find((entry) => entry.buildingInstanceId === 0)!;
    const required = computeBuildingCapacity(world, scenario.definitions, 0).requiredWorkersByProfession[0]!.requiredWorkers;
    const outputs: number[] = [];
    for (let step = 0; step <= 20; step += 1) {
      assignment.workers = Math.round((required * step) / 20);
      outputs.push(grainOutput(world, scenario, 0));
    }
    expect(outputs[0]).toBe(0);
    for (let step = 1; step < outputs.length; step += 1) {
      const marginal = outputs[step]! - outputs[step - 1]!;
      expect(marginal).toBeGreaterThan(0);
      if (step > 1) expect(marginal).toBeLessThan(outputs[step - 1]! - outputs[step - 2]!);
    }
    // Doubling labour on the same land multiplies output by 2^0.6.
    const base = Math.round(required * 0.4);
    assignment.workers = base;
    const before = grainOutput(world, scenario, 0);
    assignment.workers = base * 2;
    expect(grainOutput(world, scenario, 0) / before).toBeCloseTo(2 ** FARM_LABOUR_ELASTICITY, 12);
  });

  test("more land per level raises output with diminishing returns; no land, no harvest", () => {
    const factors = [0.25, 0.5, 1, 2, 4].map((scale) => farmLandFactor(1_000 * scale));
    for (let index = 1; index < factors.length; index += 1) {
      expect(factors[index]!).toBeGreaterThan(factors[index - 1]!);
      expect(factors[index]! / factors[index - 1]!).toBeLessThan(2);
    }
    expect(farmLandFactor(0)).toBe(0);
  });

  test("a province's land is shared by its farms' levels: another level lowers land per level", () => {
    const scenario = landScenario();
    const world = createEconomyWorld(scenario, { seed: 5 });
    const definitionById = new Map(scenario.definitions.buildings.map((definition) => [definition.id, definition]));
    expect(landPerLevelByProvince(world, definitionById).get(landKey(0, "cropland"))).toBeCloseTo(500_000, 6);
    world.buildings.find((building) => building.id === 1)!.level = 3;
    expect(landPerLevelByProvince(world, definitionById).get(landKey(0, "cropland"))).toBeCloseTo(250_000, 6);
  });

  test("world creation keeps the calibrated 1900 output: technique x land factor = the scenario technique", () => {
    const scenario = loadM11World();
    const world = createEconomyWorld(scenario, { seed: 20_261_023 });
    const definitionById = new Map(scenario.definitions.buildings.map((definition) => [definition.id, definition]));
    const perLevel = landPerLevelByProvince(world, definitionById);
    const authored = new Map(scenario.buildingInstances.map((instance) => [instance.id, instance.technique ?? 1]));
    let farms = 0;
    for (const building of world.buildings) {
      const use = definitionById.get(building.definitionId)?.landUse;
      const original = authored.get(building.id)!;
      if (use === undefined) {
        expect(building.technique).toBe(original);
        continue;
      }
      farms += 1;
      const land = farmLandFactor(perLevel.get(landKey(building.provinceId, use))!);
      expect(Math.abs(building.technique * land - original) / original).toBeLessThan(1e-12);
    }
    expect(farms).toBeGreaterThan(1_500);
  });

  test("construction rejects a farm in a province without land of its kind", () => {
    const scenario = loadM11World();
    const world = createEconomyWorld(scenario, { seed: 20_261_023 });
    const farm = scenario.definitions.buildings.find((definition) => definition.key === "subsistence-farm")!;
    const province = world.provinceEconomies.find((entry) => entry.arableLandHa > 0)!;
    const owner = world.provinces.ownership.find((row) => row.provinceId === province.id)!.ownerPolityId;
    province.arableLandHa = 0;
    expect(() =>
      validateConstructionStart(world, scenario.definitions, { countryId: owner, provinceId: province.id, definitionId: farm.id }),
    ).toThrow(/has no cropland/);
  });
});

describe("P5 harvest weather (D-143 §3)", () => {
  test("keyed per (province, year): known answers, pure, mean 1 and the documented sigma", () => {
    expect(harvestWeatherFactor(227, 0, 1900)).toBe(0.6852018411033494);
    expect(harvestWeatherFactor(20_261_023, 1001, 1900)).toBe(harvestWeatherFactor(20_261_023, 1001, 1900));
    expect(harvestWeatherFactor(20_261_023, 1001, 1901)).not.toBe(harvestWeatherFactor(20_261_023, 1001, 1900));
    const values: number[] = [];
    for (let province = 0; province < 4_000; province += 1) values.push(harvestWeatherFactor(9, province, 1950));
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const logs = values.map((value) => Math.log(value));
    const logMean = logs.reduce((sum, value) => sum + value, 0) / logs.length;
    const logSd = Math.sqrt(logs.reduce((sum, value) => sum + (value - logMean) ** 2, 0) / (logs.length - 1));
    expect(Math.abs(mean - 1)).toBeLessThan(0.01);
    expect(Math.abs(logSd - HARVEST_WEATHER_SIGMA)).toBeLessThan(0.01);
    expect(Math.min(...values)).toBeGreaterThan(0);
  });

  test("a farm's capacity follows its province's weather for the calendar year", () => {
    const scenario = landScenario();
    const world = createEconomyWorld(scenario, { seed: 227 });
    const capacity1900 = computeBuildingCapacity(world, scenario.definitions, 0).capacityTU;
    world.dayIndex = 366; // 1 January 1901
    const capacity1901 = computeBuildingCapacity(world, scenario.definitions, 0).capacityTU;
    expect(capacity1901 / capacity1900).toBeCloseTo(
      harvestWeatherFactor(227, 0, 1901) / harvestWeatherFactor(227, 0, 1900),
      12,
    );
  });
});

describe("P5 own consumption (D-143 §2)", () => {
  test("owner households keep their subsistence food first; goods and money are conserved", () => {
    const scenario = landScenario(3);
    const world = createEconomyWorld(scenario, { seed: 5 });
    const assets = (): number =>
      world.finance.accounts.reduce((sum, account) => sum + (account.category === "asset" ? account.balanceRUSD : 0), 0);
    const cashBefore = assets();
    const result = tick(world, contextOf(scenario, "full"));
    const economy = result.economy!;
    const kept = economy.ownConsumption;
    expect(kept.length).toBeGreaterThan(0);
    // The farms belong to block 3, which keeps their food.
    for (const entry of kept) expect(entry.popBlockId).toBe(3);
    // Kept + marketed = produced (recipe x executed throughput; no technology here).
    for (const building of economy.market.production.buildings) {
      const definitionId = world.buildings.find((entry) => entry.id === building.buildingId)!.definitionId;
      const definition = scenario.definitions.buildings.find((entry) => entry.id === definitionId)!;
      for (const output of building.outputs) {
        const perTU = definition.outputs.find((entry) => entry.goodId === output.goodId)!.quantityPerThroughputUnit;
        expect(output.quantity + (output.ownConsumption ?? 0)).toBeCloseTo(perTU * building.executedTU, 6);
        const plan = kept.find((entry) => entry.buildingId === building.buildingId && entry.goodId === output.goodId);
        expect(output.ownConsumption ?? 0).toBe(plan?.quantity ?? 0);
      }
    }
    // The block keeps at most its subsistence quantity, and no money moves for it.
    const owner = world.popBlocks.find((block) => block.id === 3)!;
    const keptGrain = kept.filter((entry) => entry.goodId === GRAIN).reduce((sum, entry) => sum + entry.quantity, 0);
    expect(keptGrain).toBeLessThanOrEqual(0.9 * populationTotal(owner) * (1 + 1e-9));
    expect(Math.abs(assets() - cashBefore)).toBeLessThan(1e-3);
  });
});

describe("P5 bad harvest in a low-access market (acceptance)", () => {
  test("shortage, price spike and mortality, the mortality only through food sufficiency", () => {
    // Seed 227 gives the province a 1900 harvest of 0.685 (pinned above). The same
    // world with the farms' technique divided by that factor has a neutral harvest and
    // every other draw identical.
    const scenario = landScenario(1.86, 100_000_000, 0.55);
    const weather = harvestWeatherFactor(227, 0, 1900);
    const run = (neutral: boolean) => {
      const world = createEconomyWorld(scenario, { seed: 227 });
      if (neutral) {
        for (const building of world.buildings) if (building.definitionId <= 2) building.technique /= weather;
      }
      const context = contextOf(scenario, "full");
      let deaths = 0;
      let unmetGrain = 0;
      for (let day = 0; day < 120; day += 1) {
        const result = tick(world, context);
        deaths += result.population?.deaths ?? 0;
        for (const demand of result.economy?.market.householdDemands ?? []) {
          if (demand.goodId === GRAIN) unmetGrain += demand.desiredQuantity - demand.fulfilledQuantity;
        }
      }
      return { world, deaths, unmetGrain };
    };
    const bad = run(false);
    const fair = run(true);
    // Shortage: households go without grain; the price spikes.
    expect(bad.unmetGrain).toBeGreaterThan(fair.unmetGrain + 1_000_000);
    expect(bad.world.markets[0]!.priceRUSD[GRAIN]!).toBeGreaterThan(fair.world.markets[0]!.priceRUSD[GRAIN]! * 1.5);
    // Mortality rises, and only through food: every block's other causes are equal.
    expect(bad.deaths).toBeGreaterThan(fair.deaths);
    let hungry = 0;
    for (const badBlock of bad.world.popBlocks) {
      const fairBlock = fair.world.popBlocks.find((block) => block.id === badBlock.id)!;
      expect(badBlock.adultMortalityResidual).toBe(fairBlock.adultMortalityResidual);
      expect(badBlock.childMortalityResidual).toBe(fairBlock.childMortalityResidual);
      expect(badBlock.urbanShare).toBe(fairBlock.urbanShare);
      if (badBlock.foodSufficiency < fairBlock.foodSufficiency - 0.05) hungry += 1;
      const asFair = { ...badBlock, foodSufficiency: fairBlock.foodSufficiency };
      expect(
        effectiveAdultMortality(badBlock, NEUTRAL_DEMOGRAPHY_FACTORS) / effectiveAdultMortality(asFair, NEUTRAL_DEMOGRAPHY_FACTORS),
      ).toBeCloseTo(
        (1 + FOOD_MORTALITY_WEIGHT_ADULT * (1 - badBlock.foodSufficiency)) /
          (1 + FOOD_MORTALITY_WEIGHT_ADULT * (1 - fairBlock.foodSufficiency)),
        12,
      );
      expect(
        effectiveChildMortality(badBlock, NEUTRAL_DEMOGRAPHY_FACTORS) / effectiveChildMortality(asFair, NEUTRAL_DEMOGRAPHY_FACTORS),
      ).toBeCloseTo(
        (1 + FOOD_MORTALITY_WEIGHT_CHILD * (1 - badBlock.foodSufficiency)) /
          (1 + FOOD_MORTALITY_WEIGHT_CHILD * (1 - fairBlock.foodSufficiency)),
        12,
      );
    }
    expect(hungry).toBeGreaterThan(0);
  });
});

/** The M5 eight-polity sample with one deposit of each resource in every province. */
function depositScenario(requiredTechnologyId: number | null = null): EconomyScenarioDef {
  const scenario = JSON.parse(JSON.stringify(loadM5EightPolities())) as EconomyScenarioDef;
  const deposits: DepositInitialDef[] = [];
  let id = 1;
  for (const province of scenario.population.provinceEconomies) {
    for (const resource of RESOURCE_KINDS) {
      deposits.push({
        id,
        provinceId: province.id,
        resource,
        quality: 0.5 + ((id * 7) % 5) / 10,
        initialStock: 1_000 * id,
        discovered: id % 3 === 0,
        requiredTechnologyId: id % 3 === 1 ? requiredTechnologyId : null,
      });
      id += 1;
    }
    (province as { infrastructure?: number }).infrastructure = 1;
  }
  scenario.deposits = deposits;
  return scenario;
}

/** Run the monthly discovery on every first civil day of `months` months. */
function prospect(world: World, months: number): void {
  for (let month = 0; month < months; month += 1) {
    const year = 1900 + Math.floor(month / 12);
    world.dayIndex = civilDateToDayIndex(year, ((month % 12) + 1) as Month, 1);
    runDiscoveryPhase(world, world.dayIndex);
  }
}

describe("P5 deposits: depletion is conserved and never negative (acceptance)", () => {
  test("extraction takes at most the remaining stock; initial = remaining + extracted", () => {
    const scenario = depositScenario();
    const world = createEconomyWorld(scenario, { seed: 3 });
    const deposit = world.resources.deposits.find((entry) => entry.discovered)!;
    let taken = 0;
    const requests = [0, 100, 2.5, 1e-3, 777, 1e9, 5];
    for (const request of requests) {
      taken += extractFromDeposit(world, deposit.id, request);
      expect(depositRemaining(deposit)).toBeGreaterThanOrEqual(0);
      expect(deposit.extracted).toBeCloseTo(taken, 9);
      expect(depositRemaining(deposit) + deposit.extracted).toBe(deposit.initialStock);
    }
    expect(depositRemaining(deposit)).toBe(0);
    expect(extractFromDeposit(world, deposit.id, 10)).toBe(0);
    const hidden = world.resources.deposits.find((entry) => !entry.discovered)!;
    expect(() => extractFromDeposit(world, hidden.id, 1)).toThrow(/not been discovered/);
    expect(() => extractFromDeposit(world, deposit.id, -1)).toThrow();
    expect(() => extractFromDeposit(world, deposit.id, Number.NaN)).toThrow();
  });

  test("impossible deposit states are rejected, never clamped; saves round-trip the deposits", () => {
    const world = createEconomyWorld(depositScenario(), { seed: 3 });
    const deposit = world.resources.deposits.find((entry) => entry.discovered)!;
    extractFromDeposit(world, deposit.id, 250);
    const restored = deserializeWorld(serializeWorld(world));
    expect(restored.resources).toEqual(world.resources);
    expect(hashWorld(restored)).toBe(hashWorld(world));
    const broken = (mutate: (target: World) => void): (() => void) => () => {
      const copy = deserializeWorld(serializeWorld(world));
      mutate(copy);
      assertValidWorld(copy);
    };
    expect(broken((copy) => { copy.resources.deposits[0]!.extracted = copy.resources.deposits[0]!.initialStock + 1; })).toThrow(/exceed/);
    expect(broken((copy) => { copy.resources.deposits[0]!.extracted = -1; })).toThrow(/negative/);
    expect(broken((copy) => { (copy.resources.deposits[0] as { quality: number }).quality = 0; })).toThrow(/quality/);
    expect(broken((copy) => { (copy.resources.deposits[0] as { provinceId: number }).provinceId = 99_999; })).toThrow(/unknown province/);
    expect(broken((copy) => { copy.resources.deposits[1]!.extracted = Number.POSITIVE_INFINITY; })).toThrow();
  });
});

describe("P5 discovery is deterministic under replay (acceptance)", () => {
  test("prospecting reveals deposits by keyed monthly draws; replay and save/load give the same finds", () => {
    const scenario = depositScenario();
    const first = createEconomyWorld(scenario, { seed: 41 });
    const second = createEconomyWorld(scenario, { seed: 41 });
    prospect(first, 60);
    // The second run saves and reloads after two years.
    prospect(second, 24);
    const reloaded = deserializeWorld(serializeWorld(second));
    for (let month = 24; month < 60; month += 1) {
      const year = 1900 + Math.floor(month / 12);
      reloaded.dayIndex = civilDateToDayIndex(year, ((month % 12) + 1) as Month, 1);
      runDiscoveryPhase(reloaded, reloaded.dayIndex);
    }
    expect(reloaded.resources).toEqual(first.resources);
    const found = first.resources.deposits.filter((entry) => entry.discoveredOnDay !== null);
    // 112 prospectable hidden deposits at 1/120 a month for 60 months: about 40 % found.
    expect(found.length).toBeGreaterThan(20);
    expect(found.length).toBeLessThan(90);
    // A different seed finds different deposits.
    const other = createEconomyWorld(scenario, { seed: 42 });
    prospect(other, 60);
    expect(other.resources).not.toEqual(first.resources);
  });

  test("a deposit that needs a technology is found only after the owner knows it", () => {
    const scenario = depositScenario(0);
    const world = createEconomyWorld(scenario, { seed: 41 });
    for (const country of world.countries) country.technology.researched = country.technology.researched.filter((entry) => entry.technologyId !== 0);
    prospect(world, 60);
    const gated = world.resources.deposits.filter((entry) => entry.requiredTechnologyId === 0);
    expect(gated.length).toBeGreaterThan(0);
    expect(gated.every((entry) => !entry.discovered)).toBe(true);
    for (const country of world.countries) country.technology.researched.unshift({ technologyId: 0, completedDay: 0 });
    for (let month = 60; month < 180; month += 1) {
      const year = 1900 + Math.floor(month / 12);
      world.dayIndex = civilDateToDayIndex(year, ((month % 12) + 1) as Month, 1);
      runDiscoveryPhase(world, world.dayIndex);
    }
    expect(gated.some((entry) => entry.discovered)).toBe(true);
  });

  test("discovery runs only on the first civil day of a month", () => {
    const world = createEconomyWorld(depositScenario(), { seed: 41 });
    expect(runDiscoveryPhase(world, civilDateToDayIndex(1900, 1, 2)).ran).toBe(false);
    expect(runDiscoveryPhase(world, civilDateToDayIndex(1900, 2, 1)).ran).toBe(true);
  });
});

describe("P5 1900 deposits (D-121, D-143 §4)", () => {
  test("the 1900 world carries sourced deposits, hidden ones gated by prospecting technology", () => {
    const scenario = loadM11World();
    const world = createEconomyWorld(scenario, { seed: 20_261_023 });
    const deposits = world.resources.deposits;
    expect(deposits.length).toBeGreaterThan(3_000);
    const keyOf = new Map(world.provinceEconomies.map((province) => [province.id, province.key]));
    const find = (key: string, resource: string) =>
      deposits.find((deposit) => keyOf.get(deposit.provinceId) === key && deposit.resource === resource);
    const technologyId = (key: string) => scenario.definitions.technology!.technologies.find((entry) => entry.key === key)!.id;
    // Known in 1900: the Ruhr, Baku, the Rand, Mesabi; hidden: Texas (1901), the Gulf.
    expect(find("deu-westphalia", "coal")?.discovered).toBe(true);
    expect(find("as-rus-baku", "oil")?.discovered).toBe(true);
    expect(find("af-zar-pretoria-and-the-witwatersrand", "gold")?.discovered).toBe(true);
    expect(find("am-usa-minnesota", "iron")?.discovered).toBe(true);
    expect(find("am-usa-texas", "oil")?.requiredTechnologyId).toBe(technologyId("geological-surveying"));
    expect(find("as-ott-al-hasa", "oil")?.requiredTechnologyId).toBe(technologyId("geophysical-prospecting"));
    expect(find("as-rus-tobolsk", "gas")?.requiredTechnologyId).toBe(technologyId("airborne-geophysics"));
    // Every deposit is untouched at the start; hidden ones need a technology.
    for (const deposit of deposits) {
      expect(deposit.extracted).toBe(0);
      if (!deposit.discovered) expect(deposit.requiredTechnologyId).not.toBeNull();
    }
    // Countries with a national geological survey in 1900 start knowing it.
    const usaId = scenario.countries!.find((candidate) => candidate.tag === "USA")!.id;
    const usa = world.countries.find((country) => country.id === usaId)!;
    expect(usa.technology.researched.some((entry) => entry.technologyId === technologyId("geological-surveying"))).toBe(true);
  });

  test("the P5 generators are current", () => {
    const run = spawnSync(process.execPath, [join(ROOT, "scripts/p5/build-p5-world.mjs"), "--check"], { encoding: "utf8" });
    expect(run.stderr).toBe("");
    expect(run.status).toBe(0);
  });
});

describe("P5 trade funding never overdraws by rounding (day-460 regression)", () => {
  test("shipments funded from tracked cash never overdraw when posted as one batch", () => {
    // A no-input 1900 run failed on day 460: an owner committed 6,248.601058167046 RUSD
    // against 6,248.601058167045. The day's trade postings are one journal batch that
    // sums each account's lines, so cash tracked by sequential differences can differ
    // from the batch by a few ulps; the split keeps a margin on both accounts.
    let funded = 0;
    let ownerTopUps = 0;
    for (let trial = 1; trial <= 2_000; trial += 1) {
      const buildingStart = (trial * 7_919.123456789) % 6_249;
      const ownerStart = (trial * 104_729.987654321) % 9_000;
      let buildingTracked = buildingStart;
      let ownerTracked = ownerStart;
      let buildingDelta = 0;
      let ownerDelta = 0;
      for (let shipment = 1; shipment <= 12; shipment += 1) {
        const cost = ((trial * shipment * 3_571.3) % 2_500) + 0.1 / shipment;
        const split = shipmentFunding(buildingTracked, ownerTracked, cost);
        if (split === null) continue;
        funded += 1;
        if (split.ownerPortion > 0) ownerTopUps += 1;
        expect(split.buildingPortion + split.ownerPortion).toBeGreaterThanOrEqual(cost);
        // Batch order: the injection credits the enterprise and debits the owner, then the
        // enterprise pays the whole cost.
        buildingDelta += split.ownerPortion;
        buildingDelta -= cost;
        ownerDelta -= split.ownerPortion;
        buildingTracked -= split.buildingPortion;
        ownerTracked -= split.ownerPortion;
      }
      expect(buildingStart + buildingDelta).toBeGreaterThanOrEqual(0);
      expect(ownerStart + ownerDelta).toBeGreaterThanOrEqual(0);
    }
    expect(funded).toBeGreaterThan(5_000);
    expect(ownerTopUps).toBeGreaterThan(500);
    // The margin is far below a cent at 1900 money scale.
    const split = shipmentFunding(6_248.601058167045, 10_000, 7_000)!;
    expect(split.buildingPortion + split.ownerPortion - 7_000).toBeLessThan(1e-9);
    expect(shipmentFunding(10, 0, 5)).toEqual({ buildingPortion: 5, ownerPortion: 0 });
    expect(shipmentFunding(0, 5, 5)).toBeNull();
  });
});
