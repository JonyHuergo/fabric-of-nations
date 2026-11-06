/**
 * P4 cause-driven demography acceptance (D-124, D-142; docs/PROSPERITY_PROGRAM.md §4 P4).
 *
 * - 1900 crude birth and death rates per country within the documented tolerances;
 *   life expectancy, under-5 mortality and TFR per source geo.
 * - Fixtures that vary one cause at a time: TFR follows female literacy, urban share,
 *   income, lagged child mortality and contraception; mortality follows health,
 *   sanitation, urban share and food.
 * - A famine raises mortality only through food shortfall.
 * - Exact population conservation (births, deaths, migration, ageing) and the annual
 *   record; determinism and save round trip; validation rejects impossible states.
 * - The player's levers (sanitation research with public-health staff, contraception
 *   research) reach the levels.
 *
 * P4 was accepted on 2026-11-06 with the natural-fertility ceiling (D-144, D-146 B2).
 * Every fertility level these tests read is the saturated level; the ceiling itself,
 * its inverse refit and a deterministic year of births at the ceiling are tested in
 * `population/fertility-ceiling.test.ts`.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDemography1900, loadM11World } from "@century/data";
import {
  assertValidWorld,
  calibrateBlockDemography,
  createEconomyWorld,
  createPopulationWorld,
  createRollbackRunner,
  runTicksWithRollback,
  demographicIndicators,
  demographyFactorsByCountry,
  demographyFactorsOfBlock,
  deserializeWorld,
  effectiveAdultMortality,
  effectiveChildMortality,
  FERTILITY_NATURAL_CAP,
  FERTILITY_NATURAL_KNEE,
  fertilityLevel,
  FOOD_FERTILITY_WEIGHT,
  FOOD_MORTALITY_WEIGHT_ADULT,
  FOOD_MORTALITY_WEIGHT_CHILD,
  hashWorld,
  NEUTRAL_DEMOGRAPHY_FACTORS,
  populationTotal,
  runTicks,
  serializeWorld,
  tick,
  updateBlockDemographicLevels,
  type DemographyCountryFactors,
  type PopBlock,
  type World,
} from "@century/sim";
import { PROTOCOL_VERSION, type WorkerEvent } from "@century/sim-worker";
import { SimulationHost } from "@century/sim-worker/host";
import { contextFor, makeInputs, oneBlockScenario } from "../fixtures/m2.js";
import { m5World } from "../fixtures/m5.js";

const SIM_SRC = fileURLToPath(new URL("../../../sim/src/", import.meta.url));

/** A one-block population world with women of childbearing age and children. */
function fixture(): { world: World; block: PopBlock; scenario: ReturnType<typeof oneBlockScenario> } {
  const scenario = oneBlockScenario({ 0: 20_000, 1: 18_000, 3: 16_000, 4: 15_000, 5: 14_000, 6: 13_000, 7: 12_000, 8: 10_000, 10: 8_000 });
  const world = createPopulationWorld(scenario, { seed: 7 });
  const block = world.popBlocks[0]!;
  return { world, block, scenario };
}

/** Effective child and adult death-rate multipliers under factors (neutral by default). */
const child = (block: PopBlock, factors: DemographyCountryFactors = NEUTRAL_DEMOGRAPHY_FACTORS): number =>
  effectiveChildMortality(block, factors);
const adult = (block: PopBlock, factors: DemographyCountryFactors = NEUTRAL_DEMOGRAPHY_FACTORS): number =>
  effectiveAdultMortality(block, factors);

function tfr(world: World, scenario: ReturnType<typeof oneBlockScenario>): number {
  return demographicIndicators(world.popBlocks, scenario.definitions, () => NEUTRAL_DEMOGRAPHY_FACTORS).totalFertility;
}

function setLiteracy(block: PopBlock, rate: number): void {
  for (let age = 0; age < block.literacyByAge.length; age += 1) block.literacyByAge[age] = rate;
  block.literacy = rate;
}

describe("P4 1900 calibration (D-142)", () => {
  const scenario = loadM11World();
  const world = createEconomyWorld(scenario, { seed: 20_261_023 });
  const sources = loadDemography1900("historical/p4/demography_1900.json");
  const tolerance = sources.meta.acceptanceTolerances;
  const factorsOf = demographyFactorsOfBlock(world, demographyFactorsByCountry(world, scenario.definitions));
  const owner = new Map(world.provinces.ownership.map((row) => [row.provinceId, row.ownerPolityId]));

  test("every province has sourced levels and every block an urban share", () => {
    expect(sources.provinces).toHaveLength(world.provinceEconomies.length);
    expect(sources.blocks).toHaveLength(world.popBlocks.length);
    for (const block of world.popBlocks) {
      expect(block.foodSufficiency).toBe(1);
      expect(block.urbanShare).toBeGreaterThanOrEqual(0);
      expect(block.urbanShare).toBeLessThanOrEqual(1);
    }
    // 1900 starts differ by country.
    const levels = new Set(world.popBlocks.map((block) => fertilityLevel(block, factorsOf(block)).toFixed(4)));
    expect(levels.size).toBeGreaterThan(100);
  });

  test("life expectancy, under-5 mortality and TFR match each source geo", () => {
    const byGeo = new Map<string, PopBlock[]>();
    const geoOf = new Map(sources.provinces.map((row) => [row.provinceId, row.sourceGeo]));
    for (const block of world.popBlocks) {
      const geo = geoOf.get(block.provinceId)!;
      const list = byGeo.get(geo) ?? [];
      list.push(block);
      byGeo.set(geo, list);
    }
    const sourceOf = new Map(sources.provinces.map((row) => [row.sourceGeo, row.source]));
    let checked = 0;
    for (const [geo, blocks] of byGeo) {
      const indicators = demographicIndicators(blocks, scenario.population.definitions, factorsOf);
      const source = sourceOf.get(geo)!;
      // The geo's provinces share one level; a stable-population block reproduces it
      // up to the urban split of the residual, which is exact at the start.
      expect(Math.abs(indicators.lifeExpectancy - source.lifeExpectancy)).toBeLessThanOrEqual(tolerance.lifeExpectancyYears);
      expect(Math.abs(indicators.under5MortalityPer1000 / source.under5MortalityPer1000 - 1)).toBeLessThanOrEqual(
        tolerance.under5MortalityRelative,
      );
      expect(Math.abs(indicators.totalFertility / source.totalFertility - 1)).toBeLessThanOrEqual(
        tolerance.totalFertilityRelative,
      );
      checked += 1;
    }
    expect(checked).toBeGreaterThan(150);
  });

  /**
   * Gapminder's Greek crude birth rate (30.5) is inconsistent with its own TFR of 5.2
   * and life expectancy of 40.9, which imply about 38 in any population: Greek births
   * were under-registered around 1900. Crete takes the Greek record. Documented in
   * D-142 and the completion report; every other country must pass.
   */
  const CBR_EXCEPTIONS = new Set(["GRC", "CRT"]);

  test("per-country 1900 crude birth and death rates are within tolerance of their sources", () => {
    const blocksByCountry = new Map<number, PopBlock[]>();
    for (const block of world.popBlocks) {
      const country = owner.get(block.provinceId);
      if (country === undefined) continue;
      const list = blocksByCountry.get(country) ?? [];
      list.push(block);
      blocksByCountry.set(country, list);
    }
    const outside: string[] = [];
    for (const country of sources.countries) {
      if (country.source === undefined || country.stable === undefined) continue;
      const indicators = demographicIndicators(blocksByCountry.get(country.countryId) ?? [], scenario.population.definitions, factorsOf);
      // Crude death rate: the rate implied by the sourced life expectancy and under-5
      // mortality in the stable population (no open per-country 1900 source).
      expect(Math.abs(indicators.crudeDeathRate / country.stable.crudeDeathRate - 1)).toBeLessThanOrEqual(0.01);
      if (country.source.crudeBirthRate === null) continue;
      const relative = Math.abs(indicators.crudeBirthRate / country.source.crudeBirthRate - 1);
      if (relative > tolerance.crudeBirthRateRelative && !CBR_EXCEPTIONS.has(country.tag)) {
        outside.push(`${country.tag} ${indicators.crudeBirthRate.toFixed(1)} vs ${country.source.crudeBirthRate.toFixed(1)}`);
      }
    }
    expect(outside).toEqual([]);
  });
});

describe("P4 single-cause fixtures (D-142)", () => {
  const monthly = (block: PopBlock, factors: DemographyCountryFactors = NEUTRAL_DEMOGRAPHY_FACTORS): void =>
    updateBlockDemographicLevels(block, factors);

  test("TFR declines as female literacy rises, and only then", () => {
    const rising = fixture();
    const control = fixture();
    const start = tfr(rising.world, rising.scenario);
    const series: number[] = [];
    for (let year = 0; year < 10; year += 1) {
      setLiteracy(rising.block, 0.5 + 0.05 * (year + 1));
      monthly(rising.block);
      monthly(control.block);
      series.push(tfr(rising.world, rising.scenario));
    }
    for (let index = 1; index < series.length; index += 1) expect(series[index]!).toBeLessThan(series[index - 1]!);
    expect(series[series.length - 1]!).toBeLessThan(start * 0.8);
    expect(tfr(control.world, control.scenario)).toBeCloseTo(start, 9);
    // Mortality levels do not respond to literacy.
    expect(child(rising.block)).toBeCloseTo(child(control.block), 12);
    expect(adult(rising.block)).toBeCloseTo(adult(control.block), 12);
  });

  test("falling literacy raises TFR ever less near the natural-fertility ceiling and never past it (D-144)", () => {
    // Revised for D-144 (accepted, D-146 B2): a block whose causes push its level above
    // the knee keeps responding to a cause, with a shrinking step, and stays under the
    // cap however far the cause moves.
    const falling = fixture();
    calibrateBlockDemography(falling.block, { fertilityLevel: 1.6, childMortality: 1, adultMortality: 1 }, NEUTRAL_DEMOGRAPHY_FACTORS, "test");
    const cap = FERTILITY_NATURAL_CAP;
    const levels: number[] = [];
    for (let step = 0; step <= 10; step += 1) {
      setLiteracy(falling.block, 0.5 - 0.05 * step);
      monthly(falling.block);
      levels.push(fertilityLevel(falling.block, NEUTRAL_DEMOGRAPHY_FACTORS));
    }
    for (let index = 1; index < levels.length; index += 1) {
      expect(levels[index]!).toBeGreaterThan(levels[index - 1]!);
      expect(levels[index]!).toBeLessThan(cap);
    }
    const firstStep = levels[1]! - levels[0]!;
    const lastStep = levels[levels.length - 1]! - levels[levels.length - 2]!;
    expect(levels[levels.length - 2]!).toBeGreaterThan(FERTILITY_NATURAL_KNEE);
    expect(lastStep).toBeLessThan(firstStep);
  });

  test("TFR declines as the urban share rises; unsanitised towns raise mortality", () => {
    const rising = fixture();
    const control = fixture();
    // Full sanitation isolates the fertility effect: towns carry no excess mortality,
    // so lagged child mortality cannot feed back into fertility.
    const sanitised = { ...NEUTRAL_DEMOGRAPHY_FACTORS, sanitationCoverage: 1 };
    const start = tfr(rising.world, rising.scenario);
    let previous = start;
    for (let step = 1; step <= 5; step += 1) {
      rising.block.urbanShare = 0.2 * step;
      monthly(rising.block, sanitised);
      monthly(control.block, sanitised);
      const current = tfr(rising.world, rising.scenario);
      expect(current).toBeLessThan(previous);
      previous = current;
    }
    expect(previous / start).toBeCloseTo(0.75, 8);
    expect(child(rising.block, sanitised)).toBeCloseTo(child(control.block, sanitised), 12);
    // Without sanitation the same towns raise child and adult mortality.
    expect(child(rising.block) / child(control.block)).toBeCloseTo(1.5, 8);
    expect(adult(rising.block) / adult(control.block)).toBeCloseTo(1.3, 8);
  });

  test("higher income relative to subsistence lowers TFR", () => {
    const richer = fixture();
    const control = fixture();
    richer.block.wealthLevel = 60;
    monthly(richer.block);
    monthly(control.block);
    expect(tfr(richer.world, richer.scenario)).toBeLessThan(tfr(control.world, control.scenario));
  });

  test("falling child mortality lowers TFR with a lag", () => {
    const healthier = fixture();
    const control = fixture();
    const healthy: DemographyCountryFactors = { ...NEUTRAL_DEMOGRAPHY_FACTORS, healthFactor: 0.6 };
    const first: number[] = [];
    for (let month = 0; month < 120; month += 1) {
      monthly(healthier.block, healthy);
      monthly(control.block);
      first.push(tfr(healthier.world, healthier.scenario));
    }
    const controlTfr = tfr(control.world, control.scenario);
    // The first month already sees lower effective child mortality but only 1/60 of it
    // in the lagged term; the response keeps growing for years.
    expect(first[0]!).toBeLessThan(controlTfr);
    expect(controlTfr - first[0]!).toBeLessThan((controlTfr - first[119]!) / 10);
    for (let index = 1; index < first.length; index += 1) expect(first[index]!).toBeLessThan(first[index - 1]!);
  });

  test("contraception lowers TFR", () => {
    const planned = fixture();
    const control = fixture();
    monthly(planned.block, { ...NEUTRAL_DEMOGRAPHY_FACTORS, contraception: 0.15 });
    monthly(control.block);
    const plannedTfr = demographicIndicators(planned.world.popBlocks, planned.scenario.definitions, () => ({
      ...NEUTRAL_DEMOGRAPHY_FACTORS,
      contraception: 0.15,
    })).totalFertility;
    expect(plannedTfr / tfr(control.world, control.scenario)).toBeCloseTo(0.85, 9);
  });

  test("health services lower child mortality more than adult mortality", () => {
    const { block } = fixture();
    const served = { ...NEUTRAL_DEMOGRAPHY_FACTORS, healthFactor: 0.8 };
    const childRatio = child(block, served) / child(block);
    const adultRatio = adult(block, served) / adult(block);
    expect(adultRatio).toBeCloseTo(0.8, 12);
    expect(childRatio).toBeCloseTo(0.8 ** 1.5, 12);
  });
});

describe("P4 famine raises mortality only through food shortfall (D-142)", () => {
  test("cutting grain supply raises deaths through food sufficiency; prices alone do not", () => {
    const scenario = oneBlockScenario({ 0: 50_000, 3: 40_000, 5: 40_000, 8: 30_000, 12: 20_000, 15: 10_000 });
    const run = (supply: Record<string, number> | undefined, prices: Record<string, number> | undefined) => {
      const world = createPopulationWorld(scenario, { seed: 11 });
      const inputs = makeInputs([0], {
        ...(supply === undefined ? {} : { supply }),
        ...(prices === undefined ? {} : { prices }),
        annualIncomePerCapita: 2_000,
      });
      const context = contextFor(scenario, inputs, false);
      let deaths = 0;
      for (let day = 0; day < 120; day += 1) deaths += tick(world, context).population?.deaths ?? 0;
      return { world, deaths };
    };
    const fed = run(undefined, undefined);
    const famine = run({ grain: 0.15, "food-products": 0.01, fish: 0.01, livestock: 0.01, clothing: 0.02, services: 0.25, textiles: 0.005 }, undefined);
    const dearFood = run(undefined, { grain: 0.1, "food-products": 0.2, fish: 0.2, livestock: 0.4, clothing: 1, services: 0.5, textiles: 1 });

    const fedBlock = fed.world.popBlocks[0]!;
    const famineBlock = famine.world.popBlocks[0]!;
    expect(fedBlock.foodSufficiency).toBeGreaterThan(0.999);
    expect(famineBlock.foodSufficiency).toBeLessThan(0.5);
    expect(famine.deaths).toBeGreaterThan(fed.deaths * 1.5);
    // The causes other than food are identical: the residuals and urban share match,
    // so the excess mortality comes only through the food factor.
    expect(famineBlock.adultMortalityResidual).toBe(fedBlock.adultMortalityResidual);
    expect(famineBlock.childMortalityResidual).toBe(fedBlock.childMortalityResidual);
    expect(famineBlock.urbanShare).toBe(fedBlock.urbanShare);
    const expectedAdult = 1 + FOOD_MORTALITY_WEIGHT_ADULT * (1 - famineBlock.foodSufficiency);
    const expectedChild = 1 + FOOD_MORTALITY_WEIGHT_CHILD * (1 - famineBlock.foodSufficiency);
    const fedFood = { ...famineBlock, foodSufficiency: 1 };
    expect(adult(famineBlock) / adult(fedFood)).toBeCloseTo(expectedAdult, 12);
    expect(child(famineBlock) / child(fedFood)).toBeCloseTo(expectedChild, 12);
    // Famine also lowers births (D-142): fertility falls with the same shortfall.
    expect(fertilityLevel(famineBlock, NEUTRAL_DEMOGRAPHY_FACTORS) / fertilityLevel(fedFood, NEUTRAL_DEMOGRAPHY_FACTORS)).toBeCloseTo(
      1 - FOOD_FERTILITY_WEIGHT * (1 - famineBlock.foodSufficiency),
      12,
    );
    // Dearer food that is still bought in full does not raise the death rates. (Death
    // counts may differ slightly: dearer food lowers wealth, which acts on fertility,
    // and more or fewer infants are at risk — a fertility channel, not mortality.)
    const dearBlock = dearFood.world.popBlocks[0]!;
    expect(dearBlock.foodSufficiency).toBe(fedBlock.foodSufficiency);
    expect(adult(dearBlock)).toBe(adult(fedBlock));
    expect(child(dearBlock)).toBe(child(fedBlock));
  });
});

describe("P4 conservation, determinism and validation (D-142)", () => {
  test("population is conserved exactly through births, deaths, migration and ageing", () => {
    const { world, scenario } = m5World();
    const context = {
      population: { definitions: scenario.population.definitions },
      economy: { definitions: scenario.definitions },
      detail: "summary" as const,
    };
    const total = (): number => world.popBlocks.reduce((sum, block) => sum + populationTotal(block), 0);
    let births = 0;
    let deaths = 0;
    // Through a month start (migration), month ends and 1 January (ageing).
    for (let day = 0; day < 400; day += 1) {
      const before = total();
      const result = tick(world, context);
      const population = result.population!;
      births += population.births;
      deaths += population.deaths;
      expect(population.populationStart).toBe(before);
      expect(total()).toBe(before + population.births - population.deaths);
    }
    expect(world.demography.years.length).toBeGreaterThan(0);
    const closed = world.demography.years.filter((row) => row.year === 1900);
    const recordedBirths = closed.reduce((sum, row) => sum + row.births, 0);
    const recordedDeaths = closed.reduce((sum, row) => sum + row.deaths, 0);
    expect(recordedBirths).toBeGreaterThan(0);
    expect(recordedBirths).toBeLessThanOrEqual(births);
    expect(recordedDeaths).toBeLessThanOrEqual(deaths);
    for (const row of closed) {
      // Within a country: end = start + births − deaths ± migration (internal or
      // cross-border); world migration nets to zero.
      expect(row.days).toBe(365);
      expect(row.lifeExpectancy).toBeGreaterThan(0);
    }
    const worldStart = closed.reduce((sum, row) => sum + row.populationStart, 0);
    const worldEnd = closed.reduce((sum, row) => sum + row.populationEnd, 0);
    expect(worldEnd).toBe(worldStart + recordedBirths - recordedDeaths);
  });

  test("identical runs are identical; saves round-trip the P4 state", () => {
    const first = m5World();
    const second = m5World();
    const context = {
      population: { definitions: first.scenario.population.definitions },
      economy: { definitions: first.scenario.definitions },
      detail: "summary" as const,
    };
    runTicks(first.world, 70, context);
    runTicks(second.world, 70, context);
    expect(hashWorld(first.world)).toBe(hashWorld(second.world));
    const restored = deserializeWorld(serializeWorld(first.world));
    expect(hashWorld(restored)).toBe(hashWorld(first.world));
    runTicks(restored, 30, context);
    runTicks(first.world, 30, context);
    expect(hashWorld(restored)).toBe(hashWorld(first.world));
  });

  test("impossible demographic states are rejected, never clamped", () => {
    const { world } = fixture();
    const block = world.popBlocks[0]!;
    for (const [field, value] of [
      ["foodSufficiency", 1.2],
      ["foodSufficiency", Number.NaN],
      ["fertilityResidual", -0.1],
      ["childMortalityResidual", 0],
      ["urbanShare", 2],
      ["childMortalityLagged", Number.POSITIVE_INFINITY],
    ] as const) {
      const copy = { ...block, [field]: value };
      world.popBlocks[0] = copy;
      expect(() => assertValidWorld(world)).toThrow();
    }
    world.popBlocks[0] = block;
    expect(() => assertValidWorld(world)).not.toThrow();
    expect(() =>
      calibrateBlockDemography(block, { fertilityLevel: 1, childMortality: -1, adultMortality: 1 }, NEUTRAL_DEMOGRAPHY_FACTORS, "test"),
    ).toThrow();
  });

  test("no simulation code reads the WPP validation targets (D-124)", () => {
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (name.endsWith(".ts")) files.push(path);
      }
    };
    walk(SIM_SRC);
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      expect({ file, reads: /wpp_regions|wpp_world_schedules|validation\//.test(text) }).toEqual({ file, reads: false });
    }
  });
});

describe("P4 player levers reach the levels (D-142)", () => {
  test("sanitation research with public-health staff removes the urban penalty; contraception lowers fertility", () => {
    const scenario = loadM11World();
    const world = createEconomyWorld(scenario, { seed: 20_261_023 });
    const country = world.countries.find((entry) => entry.tag === "GBR")!;
    const before = demographyFactorsByCountry(world, scenario.definitions).get(country.id)!;
    const technology = scenario.definitions.technology!;
    const idOf = (key: string): number => technology.technologies.find((entry) => entry.key === key)!.id;
    const researched = new Set(country.technology.researched.map((entry) => entry.technologyId));
    for (const key of ["basic-sanitation", "public-health-administration", "water-treatment", "family-planning-programs"]) {
      if (!researched.has(idOf(key))) country.technology.researched.push({ technologyId: idOf(key), completedDay: 0 });
    }
    country.technology.researched.sort((left, right) => left.technologyId - right.technologyId);
    const knowledgeOnly = demographyFactorsByCountry(world, scenario.definitions).get(country.id)!;
    country.institutions.healthStaffShare = 0.5;
    const staffed = demographyFactorsByCountry(world, scenario.definitions).get(country.id)!;
    expect(knowledgeOnly.contraception).toBeCloseTo(0.15, 12);
    expect(before.contraception).toBe(0);
    // Knowledge needs a staffed public-health service to reach the towns.
    expect(staffed.sanitationCoverage).toBeGreaterThan(knowledgeOnly.sanitationCoverage);
    expect(staffed.healthFactor).toBeLessThan(before.healthFactor);
  });
});

describe("P4 demography reaches the worker snapshot (D-142)", () => {
  test("the player's country carries rates, pyramid and causes; one focused province carries its own", () => {
    const scenario = loadM11World();
    const events: WorkerEvent[] = [];
    const host = new SimulationHost({ scenario, seed: 20_261_023, autoPump: false, emit: (event) => events.push(event) });
    const send = (type: string, extra: Record<string, unknown> = {}): void =>
      host.handleCommand({ protocolVersion: PROTOCOL_VERSION, type, commandId: `${type}-p4`, ...extra });
    const usa = scenario.countries!.find((country) => country.tag === "USA")!;
    send("CREATE_GAME", { playerCountryId: usa.id });
    const snapshot = host.snapshot();
    const country = snapshot.countries.find((entry) => entry.id === usa.id)!;
    expect(country.demography).not.toBeNull();
    const demography = country.demography!;
    expect(demography.current.crudeBirthRate).toBeGreaterThan(20);
    expect(demography.current.lifeExpectancy).toBeGreaterThan(40);
    expect(demography.pyramid.male).toHaveLength(17);
    expect(demography.pyramid.male.reduce((sum, value) => sum + value, 0) + demography.pyramid.female.reduce((sum, value) => sum + value, 0)).toBe(country.population);
    expect(demography.history).toEqual([]);
    expect(snapshot.focusProvince).toBeNull();

    const provinceId = snapshot.provinceTable.ids.find((_id, index) => snapshot.provinceTable.countryId[index] === usa.id)!;
    send("SET_PROVINCE_FOCUS", { provinceId });
    const focused = host.snapshot();
    expect(focused.focusProvince?.provinceId).toBe(provinceId);
    expect(focused.focusProvince?.demography?.totalFertility).toBeGreaterThan(1);
    expect(focused.focusProvince?.pyramid.female).toHaveLength(17);
    // Presentation only: focusing changes no simulation state.
    expect(hashWorld((host as unknown as { world: World }).world)).toBe(
      hashWorld(createEconomyWorld({ ...scenario, playerCountryId: usa.id }, { seed: 20_261_023 })),
    );
    send("SET_PROVINCE_FOCUS", { provinceId: 999_999 });
    expect(events.some((event) => event.type === "ERROR")).toBe(true);
    send("SET_PROVINCE_FOCUS", { provinceId: null });
    expect(host.snapshot().focusProvince).toBeNull();
  }, 180_000);
});

describe("P4 regression: migration keeps the source's literacy aggregate (D-142)", () => {
  test("the 1900 world validates and saves after its first migration month", () => {
    const scenario = loadM11World();
    const runner = createRollbackRunner(createEconomyWorld(scenario, { seed: 20_261_023 }), { worldJustValidated: true });
    runTicksWithRollback(runner, 33, {
      population: { definitions: scenario.population.definitions },
      economy: { definitions: scenario.definitions },
      detail: "summary",
    });
    // Before the fix the first monthly migration left a source block's 15+ literacy
    // aggregate stale (off by about 1e-7), so full validation and every save failed.
    expect(() => assertValidWorld(runner.world)).not.toThrow();
    expect(hashWorld(deserializeWorld(serializeWorld(runner.world)))).toBe(hashWorld(runner.world));
  }, 300_000);
});
