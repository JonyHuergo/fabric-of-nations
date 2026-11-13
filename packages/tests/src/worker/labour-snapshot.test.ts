/**
 * P7 step 4 (D-156): protocol 24's labour-market fields. The snapshot reads the
 * simulation's own measurement, so each figure is checked against `measureLabourMarket`,
 * `minimumWagePreview` and the labour history it presents; the snapshot is pure (the world
 * hash is unchanged) and passes the worker-event validator.
 */

import {
  buildLabourWageTable,
  countryProvinceIds,
  createEconomyWorld,
  hashWorld,
  measureLabourMarket,
  minimumWagePreview,
  planInstitutionSlots,
  populationTotal,
  runLabourMonthPhase,
  type EconomyScenarioDef,
  type World,
} from "@century/sim";
import { parseWorkerEvent, PROTOCOL_VERSION, provinceEconomyRows, type SimulationSnapshot } from "@century/sim-worker";
import { buildSimulationSnapshot } from "@century/sim-worker/snapshot";

import { M5_COUNTRY_A, M5_LABORERS, M5_PEASANTS } from "../fixtures/m5.js";
import { M8_ACADEMICS_ID, M8_CLERKS_ID } from "../fixtures/m8.js";
import { p7InstitutionScenario } from "../fixtures/p7.js";

const FIRST_OF_FEBRUARY = 31;

function snapshotOf(world: World, scenario: EconomyScenarioDef, focusProvinceId: number | null = null): SimulationSnapshot {
  // As the host builds it: the population definitions carry the focused province's demography.
  return buildSimulationSnapshot(
    world,
    scenario.definitions,
    { sequence: 1, running: false, speedDaysPerSecond: 1, achievedDaysPerSecond: 0, focusCountryId: M5_COUNTRY_A, focusProvinceId },
    scenario.population.definitions,
  );
}

function measure(world: World, scenario: EconomyScenarioDef) {
  const wages = buildLabourWageTable(world, scenario.definitions);
  return measureLabourMarket(world, scenario.definitions, planInstitutionSlots(world, scenario.definitions, wages, world.dayIndex));
}

describe("P7 protocol 24 labour-market snapshot (D-156)", () => {
  let scenario: EconomyScenarioDef;
  let world: World;

  beforeAll(() => {
    scenario = p7InstitutionScenario();
    world = createEconomyWorld(scenario);
  });

  test("the snapshot is protocol 24, passes the event validator and leaves the world unchanged", () => {
    const before = hashWorld(world);
    const snapshot = snapshotOf(world, scenario, countryProvinceIds(world, M5_COUNTRY_A)[0] ?? null);
    expect(PROTOCOL_VERSION).toBe(24);
    expect(snapshot.protocolVersion).toBe(24);
    expect(() => parseWorkerEvent(JSON.parse(JSON.stringify({ protocolVersion: PROTOCOL_VERSION, type: "SNAPSHOT", commandId: null, snapshot })))).not.toThrow();
    expect(hashWorld(world)).toBe(before);
  });

  test("country rows equal the simulation's measurement over the country's provinces", () => {
    const snapshot = snapshotOf(world, scenario);
    const market = snapshot.countries.find((country) => country.id === M5_COUNTRY_A)?.labourMarket;
    if (market === undefined || market === null) throw new Error("no labour market section");
    const measured = measure(world, scenario);
    const provinceIds = countryProvinceIds(world, M5_COUNTRY_A);
    let eligible = 0;
    let employed = 0;
    for (const provinceId of provinceIds) {
      const counts = measured.byProvince.get(provinceId);
      if (counts === undefined) continue;
      for (let index = 0; index < measured.professionCount; index += 1) {
        eligible += counts.eligible[index] ?? 0;
        employed += Math.min(counts.employed[index] ?? 0, counts.eligible[index] ?? 0);
      }
    }
    expect(market.labourForce).toBe(Math.round(eligible));
    expect(market.employed).toBe(Math.round(employed));
    expect(market.unemploymentRate).toBeCloseTo((eligible - employed) / eligible, 4);
    const rows = market.territories.flatMap((territory) => territory.rows);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.reduce((sum, row) => sum + row.labourForce, 0)).toBeCloseTo(eligible, -1);
    for (const row of rows) {
      expect(row.employed).toBeLessThanOrEqual(row.labourForce);
      expect(row.wageRUSDPerYear).toBeGreaterThan(0);
      expect(row.unemploymentRate).toBeGreaterThanOrEqual(0);
      expect(row.unemploymentRate).toBeLessThanOrEqual(1);
    }
    expect(market.agriculturalEmploymentShare).toBeGreaterThan(0);
    expect(market.agriculturalEmploymentShare).toBeLessThanOrEqual(1);
    // Persons by profession are the country's people.
    const persons = world.popBlocks
      .filter((block) => provinceIds.includes(block.provinceId))
      .reduce((sum, block) => sum + populationTotal(block), 0);
    expect(market.professions.reduce((sum, row) => sum + row.persons, 0)).toBeCloseTo(persons, -1);
  });

  test("the province column is the province's unemployed ÷ labour force", () => {
    const snapshot = snapshotOf(world, scenario);
    const measured = measure(world, scenario);
    for (const row of provinceEconomyRows(snapshot)) {
      const counts = measured.byProvince.get(row.id);
      let eligible = 0;
      let unemployed = 0;
      for (let index = 0; index < measured.professionCount; index += 1) {
        eligible += counts?.eligible[index] ?? 0;
        unemployed += Math.max(0, (counts?.eligible[index] ?? 0) - (counts?.employed[index] ?? 0));
      }
      if (eligible > 0) expect(row.unemploymentRate).toBeCloseTo(unemployed / eligible, 4);
      else expect(row.unemploymentRate).toBeNull();
    }
  });

  test("the focused province carries its rows, wage index and servants", () => {
    const provinceId = countryProvinceIds(world, M5_COUNTRY_A)[0];
    if (provinceId === undefined) throw new Error("no province");
    const labour = snapshotOf(world, scenario, provinceId).focusProvince?.labour;
    if (labour === undefined || labour === null) throw new Error("no focus labour");
    const counts = measure(world, scenario).byProvince.get(provinceId);
    const eligible = counts === undefined ? 0 : [...counts.eligible].reduce((sum, value) => sum + value, 0);
    expect(labour.rows.reduce((sum, row) => sum + row.labourForce, 0)).toBeCloseTo(eligible, -1);
    expect(labour.wageIndex).toBeGreaterThan(0);
    expect(labour.servantsEmployed).toBeGreaterThanOrEqual(0);
  });

  test("the minimum-wage preview is the simulation's estimate at each law's floor", () => {
    const snapshot = snapshotOf(world, scenario);
    const previews = snapshot.countries.find((country) => country.id === M5_COUNTRY_A)?.labourMarket?.minimumWage ?? [];
    const laws = (scenario.definitions.politics?.laws ?? []).filter((law) => law.slot === "labor" && law.laborMinimumWageRUSDPerYear > 0);
    expect(previews.map((preview) => preview.lawId)).toEqual(laws.map((law) => law.id).sort((left, right) => left - right));
    for (const preview of previews) {
      const expected = minimumWagePreview(world, scenario.definitions, M5_COUNTRY_A, preview.floorRUSDPerYear, world.dayIndex);
      expect(preview.coveredWorkers).toBe(Math.round(expected.coveredWorkers));
      expect(preview.workersBelowFloor).toBe(Math.round(expected.workersBelowFloor));
      expect(preview.jobsAtRisk).toBe(Math.round(expected.jobsAtRisk));
      expect(preview.compliance).toBeCloseTo(expected.compliance, 4);
      expect(preview.enacted).toBe(false);
    }
  });

  test("profession groups and incomes come from roles", () => {
    const snapshot = snapshotOf(world, scenario);
    const group = new Map(snapshot.professions.map((profession) => [profession.id, profession]));
    expect(group.get(M5_PEASANTS)).toMatchObject({ group: "rural", earns: "own-work" });
    expect(group.get(M5_LABORERS)).toMatchObject({ group: "manual-service", earns: "wage" });
    expect(group.get(M8_CLERKS_ID)).toMatchObject({ group: "state-church", earns: "wage" });
    expect(group.get(M8_ACADEMICS_ID)).toMatchObject({ group: "professional", earns: "wage" });
  });

  test("the mobility report appears after the first month and repeats the labour history", () => {
    const local = createEconomyWorld(scenario);
    expect(snapshotOf(local, scenario).labourMobility).toBeNull();
    runLabourMonthPhase(local, scenario.definitions, FIRST_OF_FEBRUARY);
    const report = local.labourMarket.history.at(-1);
    if (report === undefined) throw new Error("no report");
    const mobility = snapshotOf(local, scenario).labourMobility;
    expect(mobility).toMatchObject({
      dayIndex: report.dayIndex,
      mobilityPeople: report.mobilityPeople,
      migrationPeople: report.migrationPeople,
      blocksCreated: report.blocksCreated,
      blocksRetired: report.blocksRetired,
      liveBlocks: local.popBlocks.length,
    });
    const net = new Map(mobility?.net.map((entry) => [entry.professionId, entry.net]));
    report.netByProfession.forEach((value, professionId) => expect(net.get(professionId) ?? 0).toBe(value));
  });
});
