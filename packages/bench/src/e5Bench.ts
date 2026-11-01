/**
 * E5 labor/social benchmark.
 *
 * Node regression harness, not a mobile-performance claim. It measures the
 * integrated tick with active training/health policy on the authored eight-polity
 * scenario, the isolated training phase, and save/restore with E5 state. It asserts
 * determinism and validity; it does not impose a new timing threshold. This file is
 * registered but is not executed under the no-benchmark restriction.
 */

import {
  assertValidWorld,
  createEconomyWorld,
  deserializeWorld,
  hashWorld,
  runLaborMonthStart,
  runTicks,
  runTrainingPhase,
  serializeWorld,
  type EconomyScenarioDef,
  type TickContext,
} from "@century/sim";
import { loadM5EightPolities } from "@century/data";

const SEED = 20_261_103;
const E5_WARMUP_TICKS = 2;
const E5_MEASURED_TICKS = 4;
const E5_PHASE_ITERATIONS = 4;
const E5_SERIALIZATION_ITERATIONS = 2;

function scenarioWithE5(): EconomyScenarioDef {
  const scenario = loadM5EightPolities();
  scenario.countries = (scenario.countries ?? []).map((country) =>
    country.id === 0
      ? {
          ...country,
          labor: {
            trainingBudgetRUSDPerYear: 200_000,
            trainingStipendPerTraineeRUSDPerYear: 1,
            trainingStaffShare: 0.2,
            healthStaffShare: 0.2,
          },
        }
      : country,
  );
  return scenario;
}

function contextFor(scenario: EconomyScenarioDef): TickContext {
  return {
    population: { definitions: scenario.population.definitions },
    economy: { definitions: scenario.definitions },
  };
}

export function runE5Benchmarks(): boolean {
  const scenario = scenarioWithE5();
  const context = contextFor(scenario);
  const world = createEconomyWorld(scenario, { seed: SEED });
  runTicks(world, E5_WARMUP_TICKS, context);

  const tickSamples: number[] = [];
  for (let run = 0; run < E5_MEASURED_TICKS; run += 1) {
    const start = process.hrtime.bigint();
    runTicks(world, 1, context);
    tickSamples.push(Number(process.hrtime.bigint() - start) / 1_000_000);
  }
  const trainingSamples: number[] = [];
  for (let iteration = 0; iteration < E5_PHASE_ITERATIONS; iteration += 1) {
    const phaseWorld = createEconomyWorld(scenario, { seed: SEED + iteration });
    runTicks(phaseWorld, E5_WARMUP_TICKS, context);
    runLaborMonthStart(phaseWorld, scenario.definitions, phaseWorld.dayIndex);
    const start = process.hrtime.bigint();
    runTrainingPhase(phaseWorld, scenario.definitions, phaseWorld.dayIndex);
    trainingSamples.push(Number(process.hrtime.bigint() - start) / 1_000_000);
  }
  const saveSamples: number[] = [];
  for (let iteration = 0; iteration < E5_SERIALIZATION_ITERATIONS; iteration += 1) {
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
  const replay = createEconomyWorld(scenarioWithE5(), { seed: SEED });
  runTicks(replay, E5_WARMUP_TICKS + E5_MEASURED_TICKS, context);
  const deterministic = hashWorld(replay) === hashWorld(world);
  const average = (samples: number[]): number =>
    samples.length === 0
      ? 0
      : samples.reduce((total, value) => total + value, 0) / samples.length;
  console.log(
    `E5 labor/social tick ${average(tickSamples).toFixed(2)} ms, ` +
      `training phase ${average(trainingSamples).toFixed(2)} ms, ` +
      `save/load ${average(saveSamples).toFixed(2)} ms, ` +
      `deterministic ${deterministic ? "PASS" : "FAIL"}`,
  );
  return deterministic;
}
