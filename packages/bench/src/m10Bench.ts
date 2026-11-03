/**
 * M10 diplomacy/warfare benchmark.
 *
 * Node regression harness, not a mobile-performance claim. It measures the integrated
 * tick with an active war and two fielded armies, the isolated military phase, and
 * save/restore with military and occupation state. It asserts determinism and validity;
 * it does not impose a new timing threshold. This file is registered but is not executed
 * under the no-benchmark restriction.
 */

import {
  applyMilitaryAction,
  assertValidWorld,
  createEconomyWorld,
  deserializeWorld,
  hashWorld,
  runMilitaryPhase,
  runTicks,
  serializeWorld,
  type EconomyScenarioDef,
  type TickContext,
  type World,
} from "@century/sim";
import { loadM5EightPolities } from "@century/data";

const SEED = 20_261_108;
const M10_WARMUP_TICKS = 2;
const M10_MEASURED_TICKS = 4;
const M10_PHASE_ITERATIONS = 4;
const M10_SERIALIZATION_ITERATIONS = 2;

/** Sample scenario with two fielded armies; the war is declared on each world. */
function scenarioWithArmies(): {
  scenario: EconomyScenarioDef;
  firstCountryId: number;
  secondCountryId: number;
} {
  const scenario = loadM5EightPolities();
  const first = scenario.countries?.[0];
  const second = scenario.countries?.[1];
  if (first === undefined || second === undefined) throw new Error("M10 bench needs two countries");
  const firstProvince = first.provinceIds[0];
  const secondProvince = second.provinceIds[0];
  if (firstProvince === undefined || secondProvince === undefined) {
    throw new Error("M10 bench needs two provinces");
  }
  scenario.military = {
    armies: [
      { countryId: first.id, provinceId: firstProvince, personnel: 2_000, equipmentUnits: 40 },
      { countryId: second.id, provinceId: secondProvince, personnel: 2_000, equipmentUnits: 40 },
    ],
  };
  return {
    scenario,
    firstCountryId: first.id,
    secondCountryId: second.id,
  };
}

/** Create the benchmark world and declare the benchmark war. */
function buildWorld(seed: number): { world: World; scenario: EconomyScenarioDef } {
  const { scenario, firstCountryId, secondCountryId } = scenarioWithArmies();
  const world = createEconomyWorld(scenario, { seed });
  applyMilitaryAction(
    world,
    {
      kind: "declare-war",
      countryId: firstCountryId,
      dayIndex: 0,
      source: "player",
      targetCountryId: secondCountryId,
      casusBelli: "border-dispute",
    },
    0,
  );
  return { world, scenario };
}

function contextFor(scenario: EconomyScenarioDef): TickContext {
  return {
    population: { definitions: scenario.population.definitions },
    economy: { definitions: scenario.definitions },
  };
}

export function runM10Benchmarks(): boolean {
  const { world, scenario } = buildWorld(SEED);
  const context = contextFor(scenario);
  runTicks(world, M10_WARMUP_TICKS, context);

  const tickSamples: number[] = [];
  for (let run = 0; run < M10_MEASURED_TICKS; run += 1) {
    const start = process.hrtime.bigint();
    runTicks(world, 1, context);
    tickSamples.push(Number(process.hrtime.bigint() - start) / 1_000_000);
  }

  const phaseSamples: number[] = [];
  for (let iteration = 0; iteration < M10_PHASE_ITERATIONS; iteration += 1) {
    const phase = buildWorld(SEED + iteration);
    runTicks(phase.world, M10_WARMUP_TICKS, context);
    const start = process.hrtime.bigint();
    runMilitaryPhase(phase.world, phase.world.dayIndex, { validateWorld: false });
    phaseSamples.push(Number(process.hrtime.bigint() - start) / 1_000_000);
  }

  const saveSamples: number[] = [];
  for (let iteration = 0; iteration < M10_SERIALIZATION_ITERATIONS; iteration += 1) {
    const start = process.hrtime.bigint();
    const save = serializeWorld(world);
    const restored = deserializeWorld(save);
    if (hashWorld(restored) !== hashWorld(world)) {
      return false;
    }
    saveSamples.push(Number(process.hrtime.bigint() - start) / 1_000_000);
  }
  try {
    assertValidWorld(world);
  } catch {
    return false;
  }
  const replay = buildWorld(SEED).world;
  runTicks(replay, M10_WARMUP_TICKS + M10_MEASURED_TICKS, context);
  const deterministic = hashWorld(replay) === hashWorld(world);
  const average = (samples: number[]): number =>
    samples.length === 0
      ? 0
      : samples.reduce((total, value) => total + value, 0) / samples.length;
  console.log(
    `M10 warfare tick ${average(tickSamples).toFixed(2)} ms, ` +
      `military phase ${average(phaseSamples).toFixed(2)} ms, ` +
      `save/load ${average(saveSamples).toFixed(2)} ms, ` +
      `deterministic ${deterministic ? "PASS" : "FAIL"}`,
  );
  return deterministic;
}
