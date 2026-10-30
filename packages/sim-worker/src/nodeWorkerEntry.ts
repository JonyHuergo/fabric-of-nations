/**
 * Node worker-thread entry used by the M7 worker proof of concept and tests.
 *
 * This file is not part of the browser bundle. It proves that the same host can
 * run off the caller's thread with the versioned protocol.
 */

import { parentPort } from "node:worker_threads";

import { SimulationHost } from "./host.js";
import { WORLD_SCENARIO } from "./generated/worldScenario.js";

const port = parentPort;
if (port === null) {
  throw new Error("nodeWorkerEntry must run inside a worker_threads Worker");
}

const host = new SimulationHost({
  scenario: WORLD_SCENARIO,
  seed: 20_261_023,
  emit: (event) => port.postMessage(event),
});

port.on("message", (message: unknown) => {
  host.handleCommand(message);
});
