/**
 * E6b monetary/price-measurement benchmark.
 *
 * Node regression harness, not a mobile-performance claim. It measures the integrated
 * tick with an active currency-board authority, the isolated monetary phase, and
 * save/restore with monetary and price-index state. It asserts determinism and validity;
 * it does not impose a new timing threshold. This file is registered but is not executed
 * under the no-benchmark restriction.
 */

import {
  applyMonetaryPolicy,
  assertValidWorld,
  createEconomyWorld,
  deserializeWorld,
  hashWorld,
  runMonetaryPhase,
  runTicks,
  serializeWorld,
  type EconomyScenarioDef,
  type TickContext,
} from "@century/sim";
import { loadM5EightPolities } from "@century/data";

const SEED = 20_261_106;
const E6B_WARMUP_TICKS = 2;
const E6B_MEASURED_TICKS = 4;
const E6B_PHASE_ITERATIONS = 4;
const E6B_SERIALIZATION_ITERATIONS = 2;

/** Scenario with the USA currency activated as a reserve-backed pegged authority. */
function scenarioWithE6b(): EconomyScenarioDef {
  const scenario = loadM5EightPolities();
  scenario.currencyValuations = (scenario.currencyValuations ?? []).map((valuation) =>
    valuation.currencyId === 0
      ? {
          currencyId: 0,
          status: "specified" as const,
          susdPerUnit: 0.2 as never,
          setOnDay: 0,
          source: "scenario" as const,
        }
      : valuation,
  );
  scenario.monetary = {
    currencies: [
      {
        currencyId: 0,
        paritySusdPerUnit: 0.2,
        reserveFundingSUSD: 50_000,
        currencyIssuedUnits: 100_000,
        externalCashSUSD: 40_000,
      },
    ],
  };
  return scenario;
}

function contextFor(scenario: EconomyScenarioDef): TickContext {
  return {
    population: { definitions: scenario.population.definitions },
    economy: { definitions: scenario.definitions },
  };
}

export function runE6bBenchmarks(): boolean {
  const scenario = scenarioWithE6b();
  const context = contextFor(scenario);
  const world = createEconomyWorld(scenario, { seed: SEED });
  runTicks(world, E6B_WARMUP_TICKS, context);

  const tickSamples: number[] = [];
  for (let run = 0; run < E6B_MEASURED_TICKS; run += 1) {
    const start = process.hrtime.bigint();
    runTicks(world, 1, context);
    tickSamples.push(Number(process.hrtime.bigint() - start) / 1_000_000);
  }

  const phaseSamples: number[] = [];
  for (let iteration = 0; iteration < E6B_PHASE_ITERATIONS; iteration += 1) {
    const phaseWorld = createEconomyWorld(scenario, { seed: SEED + iteration });
    runTicks(phaseWorld, E6B_WARMUP_TICKS, context);
    // A parity change exercises the revaluation path inside the phase.
    applyMonetaryPolicy(
      phaseWorld,
      scenario.definitions,
      {
        countryId: 0,
        regime: "pegged",
        paritySusdPerUnit: 0.19,
        reserveTransferSUSD: 0,
        currencyConversionSUSD: 0,
      },
      phaseWorld.dayIndex,
    );
    const start = process.hrtime.bigint();
    runMonetaryPhase(phaseWorld, scenario.definitions, phaseWorld.dayIndex, {
      validateWorld: false,
    });
    phaseSamples.push(Number(process.hrtime.bigint() - start) / 1_000_000);
  }

  const saveSamples: number[] = [];
  for (let iteration = 0; iteration < E6B_SERIALIZATION_ITERATIONS; iteration += 1) {
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
  const replay = createEconomyWorld(scenarioWithE6b(), { seed: SEED });
  runTicks(replay, E6B_WARMUP_TICKS + E6B_MEASURED_TICKS, context);
  const deterministic = hashWorld(replay) === hashWorld(world);
  const average = (samples: number[]): number =>
    samples.length === 0
      ? 0
      : samples.reduce((total, value) => total + value, 0) / samples.length;
  console.log(
    `E6b monetary tick ${average(tickSamples).toFixed(2)} ms, ` +
      `monetary phase ${average(phaseSamples).toFixed(2)} ms, ` +
      `save/load ${average(saveSamples).toFixed(2)} ms, ` +
      `deterministic ${deterministic ? "PASS" : "FAIL"}`,
  );
  return deterministic;
}
