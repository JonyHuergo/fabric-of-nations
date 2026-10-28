/**
 * E6a transport/trade/customs benchmark.
 *
 * Node regression harness, not a mobile-performance claim. It measures the integrated
 * tick with active inter-market trade on the authored eight-polity scenario, the
 * isolated trade arrivals and dispatch phases, and save/restore with in-transit
 * shipments. It asserts determinism and validity; it does not impose a new timing
 * threshold. This file is registered but is not executed under the no-benchmark
 * restriction.
 */

import {
  assertValidWorld,
  createEconomyWorld,
  deserializeWorld,
  hashWorld,
  runTicks,
  runTradeArrivals,
  runTradeDispatchPhase,
  serializeWorld,
  type EconomyScenarioDef,
  type TickContext,
} from "@century/sim";
import { loadM5EightPolities } from "@century/data";

const SEED = 20_261_104;
const E6A_WARMUP_TICKS = 2;
const E6A_MEASURED_TICKS = 4;
const E6A_PHASE_ITERATIONS = 4;
const E6A_SERIALIZATION_ITERATIONS = 2;

/** Authored trade with a tariff set by the market-0 customs administration. */
function scenarioWithE6a(): EconomyScenarioDef {
  const scenario = loadM5EightPolities();
  scenario.countries = (scenario.countries ?? []).map((country) =>
    country.id === 0
      ? {
          ...country,
          trade: {
            tariffRates: scenario.definitions.goods.map(() => 0.05),
            importQuotaQuantity: scenario.definitions.goods.map(() => null),
            exportRestricted: scenario.definitions.goods.map(() => false),
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

export function runE6aBenchmarks(): boolean {
  const scenario = scenarioWithE6a();
  const context = contextFor(scenario);
  const world = createEconomyWorld(scenario, { seed: SEED });
  runTicks(world, E6A_WARMUP_TICKS, context);

  const tickSamples: number[] = [];
  for (let run = 0; run < E6A_MEASURED_TICKS; run += 1) {
    const start = process.hrtime.bigint();
    runTicks(world, 1, context);
    tickSamples.push(Number(process.hrtime.bigint() - start) / 1_000_000);
  }

  const arrivalSamples: number[] = [];
  const dispatchSamples: number[] = [];
  for (let iteration = 0; iteration < E6A_PHASE_ITERATIONS; iteration += 1) {
    const phaseWorld = createEconomyWorld(scenario, { seed: SEED + iteration });
    runTicks(phaseWorld, E6A_WARMUP_TICKS, context);
    const arrivalStart = process.hrtime.bigint();
    runTradeArrivals(phaseWorld, scenario.definitions, phaseWorld.dayIndex, {
      validateWorld: false,
    });
    arrivalSamples.push(Number(process.hrtime.bigint() - arrivalStart) / 1_000_000);
    const dispatchStart = process.hrtime.bigint();
    runTradeDispatchPhase(phaseWorld, scenario.definitions, phaseWorld.dayIndex, {
      validateWorld: false,
    });
    dispatchSamples.push(Number(process.hrtime.bigint() - dispatchStart) / 1_000_000);
  }

  const saveSamples: number[] = [];
  for (let iteration = 0; iteration < E6A_SERIALIZATION_ITERATIONS; iteration += 1) {
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
  const replay = createEconomyWorld(scenarioWithE6a(), { seed: SEED });
  runTicks(replay, E6A_WARMUP_TICKS + E6A_MEASURED_TICKS, context);
  const deterministic = hashWorld(replay) === hashWorld(world);
  const average = (samples: number[]): number =>
    samples.length === 0
      ? 0
      : samples.reduce((total, value) => total + value, 0) / samples.length;
  console.log(
    `E6a trade tick ${average(tickSamples).toFixed(2)} ms, ` +
      `arrivals ${average(arrivalSamples).toFixed(2)} ms, ` +
      `dispatch ${average(dispatchSamples).toFixed(2)} ms, ` +
      `save/load ${average(saveSamples).toFixed(2)} ms, ` +
      `deterministic ${deterministic ? "PASS" : "FAIL"}`,
  );
  return deterministic;
}
