/**
 * P7 (D-154, R8): a building's own job mix replaces its definition's jobs for slots,
 * staffing and employment, keeps the definition's total workers, survives a save round
 * trip, and is rejected when it changes the total or names an unknown profession.
 */
import { assertValidJobMix, buildingJobs, createEconomyWorld, deserializeWorld, encodeWorld, jobSlotsForBuilding, serializeWorld } from "@century/sim";

import { M5_LABORERS, M5_PEASANTS } from "../fixtures/m5.js";
import { p7Scenario } from "../fixtures/p7.js";

function scenarioWithMix() {
  const scenario = p7Scenario();
  const instance = scenario.buildingInstances.find((candidate) => {
    const definition = scenario.definitions.buildings.find((d) => d.id === candidate.definitionId);
    return definition !== undefined && definition.jobs.length === 1;
  });
  if (instance === undefined) throw new Error("fixture has no single-job building");
  const definition = scenario.definitions.buildings.find((d) => d.id === instance.definitionId);
  if (definition === undefined) throw new Error("missing definition");
  const total = definition.jobs[0]?.workersPerThroughputUnit ?? 0;
  const other = definition.jobs[0]?.professionId === M5_PEASANTS ? M5_LABORERS : M5_PEASANTS;
  const ids = [definition.jobs[0]?.professionId ?? 0, other].sort((left, right) => left - right);
  instance.jobMix = ids.map((professionId, index) => ({ professionId, workersPerThroughputUnit: index === 0 ? total * 0.75 : total * 0.25 }));
  return { scenario, instanceId: instance.id, definition, total };
}

describe("P7 building job mix (R8)", () => {
  test("the job mix replaces the definition's jobs for slots and keeps the total", () => {
    const { scenario, instanceId, definition } = scenarioWithMix();
    const world = createEconomyWorld(scenario);
    const building = world.buildings.find((candidate) => candidate.id === instanceId);
    expect(building?.jobMix).toBeDefined();
    if (building === undefined) return;
    const jobs = buildingJobs(definition, building);
    expect(jobs).toHaveLength(2);
    const slots = jobs.map((job) => jobSlotsForBuilding(definition, building, job.professionId));
    const full = Math.floor((definition.jobs[0]?.workersPerThroughputUnit ?? 0) * definition.referenceThroughputPerDayAtLevelOne * building.level * building.condition);
    expect(slots.reduce((sum, value) => sum + value, 0)).toBeLessThanOrEqual(full);
    expect(slots.reduce((sum, value) => sum + value, 0)).toBeGreaterThanOrEqual(full - 2);
  });

  test("a world with a job mix survives a save round trip unchanged", () => {
    const { scenario } = scenarioWithMix();
    const world = createEconomyWorld(scenario);
    const restored = deserializeWorld(serializeWorld(world));
    expect(encodeWorld(restored)).toEqual(encodeWorld(world));
  });

  test("worlds without job mixes encode without the field", () => {
    const world = createEconomyWorld(p7Scenario());
    const encoded = JSON.stringify(encodeWorld(world));
    expect(encoded.includes("jobMix")).toBe(false);
  });

  test("a mix that changes the total or names an unknown profession is rejected", () => {
    const { definition, total } = scenarioWithMix();
    const professions = new Set([M5_PEASANTS, M5_LABORERS]);
    expect(() => assertValidJobMix(definition, [{ professionId: M5_PEASANTS, workersPerThroughputUnit: total * 2 }], professions, "mix")).toThrow(/total workers/);
    expect(() => assertValidJobMix(definition, [{ professionId: 99, workersPerThroughputUnit: total }], professions, "mix")).toThrow(/unknown profession/);
    const { scenario } = scenarioWithMix();
    const instance = scenario.buildingInstances.find((candidate) => candidate.jobMix !== undefined);
    if (instance?.jobMix) instance.jobMix = [{ professionId: M5_LABORERS, workersPerThroughputUnit: 1e9 }];
    expect(() => createEconomyWorld(scenario)).toThrow(/jobMix/);
  });
});
