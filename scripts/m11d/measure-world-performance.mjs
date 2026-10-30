/** Ad-hoc M11d measurement: full 1900 world tick and snapshot cost in Node. */
import { createEconomyWorld, tick } from "../../packages/sim/dist/index.js";
import { loadM11World } from "../../packages/data/dist/index.js";
import { buildSimulationSnapshot } from "../../packages/sim-worker/dist/snapshot.js";

const scenario = loadM11World();
const seed = 20_261_023;

const created = Date.now();
const world = createEconomyWorld(scenario, { seed });
console.log("create world ms:", Date.now() - created);

const context = { population: { definitions: scenario.population.definitions }, economy: { definitions: scenario.definitions } };


const tickTimes = [];
for (let day = 0; day < 30; day += 1) {
  const started = performance.now();
  tick(world, context);
  tickTimes.push(performance.now() - started);
}
tickTimes.sort((a, b) => a - b);
console.log("tick ms: min", tickTimes[0].toFixed(1), "median", tickTimes[Math.floor(tickTimes.length / 2)].toFixed(1), "p95", tickTimes[Math.floor(tickTimes.length * 0.95)].toFixed(1), "max", tickTimes.at(-1).toFixed(1));

const snapshotTimes = [];
for (let index = 0; index < 5; index += 1) {
  const started = performance.now();
  const snapshot = buildSimulationSnapshot(world, scenario.definitions, {
    sequence: index + 1,
    running: false,
    speedDaysPerSecond: 1,
    achievedDaysPerSecond: 0,
    focusCountryId: world.playerCountryId,
    ...(scenario.countryMeta === undefined ? {} : { countryMeta: scenario.countryMeta }),
    ...(scenario.marketMeta === undefined ? {} : { marketMeta: scenario.marketMeta }),
    ...(scenario.regionMeta === undefined ? {} : { regionMeta: scenario.regionMeta }),
  });
  snapshotTimes.push(performance.now() - started);
  if (index === 0) {
    console.log("snapshot countries", snapshot.countries.length, "summaries", snapshot.countrySummaries.length, "regions", snapshot.regions.length, "bytes", JSON.stringify(snapshot).length);
  }
}
console.log("snapshot ms:", snapshotTimes.map((value) => value.toFixed(1)).join(", "));
console.log("world regions", world.regions.length, "popBlocks", world.popBlocks.length, "buildings", world.buildings.length, "employment", world.employment.length);
