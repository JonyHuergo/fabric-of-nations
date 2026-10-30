/** Ad-hoc: split full-world tick cost into validation and phase work. */
import { createEconomyWorld } from "../../packages/sim/dist/index.js";
import { assertValidWorldForTick } from "../../packages/sim/dist/world.js";
import { assertValidPopulationDefinitions } from "../../packages/sim/dist/population/definitions.js";
import { loadM11World } from "../../packages/data/dist/index.js";

const scenario = loadM11World();
const world = createEconomyWorld(scenario, { seed: 20_261_023 });

for (let round = 0; round < 3; round += 1) {
  let started = performance.now();
  assertValidWorldForTick(world);
  const worldValidation = performance.now() - started;
  started = performance.now();
  assertValidPopulationDefinitions(scenario.population.definitions);
  const definitionsValidation = performance.now() - started;
  console.log(`round ${String(round)}: world validation ${worldValidation.toFixed(1)} ms, definitions validation ${definitionsValidation.toFixed(1)} ms`);
}
