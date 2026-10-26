/**
 * M7 off-main-thread proof of concept:
 *   parent process -> worker_threads -> SimulationHost -> snapshots/save -> parent
 *
 * Run with `pnpm -F @century/sim-worker poc` after building the package. This is
 * a Node proof, not a mobile-device measurement.
 */

import { Worker } from "node:worker_threads";

import {
  PROTOCOL_VERSION,
  parseWorkerEvent,
  type WorkerCommand,
} from "./protocol.js";

const SEED = 20_261_023;
const worker = new Worker(new URL("./nodeWorkerEntry.js", import.meta.url));
let phase = "ready";
let save = "";
let step = 0;

function send(command: WorkerCommand): void {
  worker.postMessage(command);
}

function commandId(label: string): string {
  step += 1;
  return `${label}-${String(step)}`;
}

worker.on("message", (raw: unknown) => {
  let event;
  try {
    event = parseWorkerEvent(raw);
  } catch (error) {
    console.error("worker protocol error", error);
    process.exitCode = 1;
    void worker.terminate();
    return;
  }
  switch (event.type) {
    case "READY":
      console.log(
        `READY day=${String(event.snapshot.dayIndex)} countries=${String(event.snapshot.countries.length)} regions=${String(event.snapshot.regions.length)}`,
      );
      send({ protocolVersion: PROTOCOL_VERSION, type: "START", commandId: commandId("start") });
      return;
    case "STATE":
      if (event.running && phase === "ready") {
        phase = "running";
        send({ protocolVersion: PROTOCOL_VERSION, type: "PAUSE", commandId: commandId("pause") });
      } else if (!event.running && phase === "running") {
        phase = "paused";
        send({
          protocolVersion: PROTOCOL_VERSION,
          type: "STEP",
          commandId: commandId("step"),
          ticks: 1,
        });
      }
      return;
    case "SNAPSHOT":
      if (phase === "paused") {
        phase = "stepped";
        console.log(
          `SNAPSHOT day=${String(event.snapshot.dayIndex)} sequence=${String(event.snapshot.sequence)} hashable-countries=${String(event.snapshot.countries.length)}`,
        );
        send({ protocolVersion: PROTOCOL_VERSION, type: "SAVE", commandId: commandId("save") });
      }
      return;
    case "SAVE_RESULT":
      save = event.save;
      console.log(`SAVE bytes=${String(save.length)}`);
      send({
        protocolVersion: PROTOCOL_VERSION,
        type: "LOAD",
        commandId: commandId("load"),
        save,
      });
      return;
    case "LOAD_RESULT":
      if (!event.accepted) {
        console.error("load rejected", event.errors);
        process.exitCode = 1;
      } else {
        console.log(`LOAD day=${String(event.snapshot.dayIndex)} accepted=${String(event.accepted)}`);
      }
      send({ protocolVersion: PROTOCOL_VERSION, type: "SHUTDOWN", commandId: commandId("shutdown") });
      return;
    case "SHUTDOWN":
      console.log("SHUTDOWN");
      void worker.terminate();
      if (process.exitCode !== 1) {
        console.log(
          `M7 node worker POC: PASS (seed ${String(SEED)}, save ${String(save.length)} bytes)`,
        );
      }
      return;
    case "ERROR":
      console.error(`ERROR ${event.code}: ${event.message}`);
      process.exitCode = 1;
      void worker.terminate();
      return;
    case "FATAL":
      console.error(`FATAL: ${event.message}`);
      process.exitCode = 1;
      void worker.terminate();
      return;
    case "ACTION_RESULT":
      return;
    default:
      return;
  }
});

worker.on("error", (error) => {
  console.error("worker error", error);
  process.exitCode = 1;
});
