/**
 * D-162: kernel workers on desktop Node (`worker_threads`), for benchmarks and tests. Each runs
 * the same bundled kernel script as the web and phone workers (`KERNEL_WORKER_SCRIPT`), given a
 * `postMessage`/`onmessage` pair over the thread's port; the pool, messages and merge are the
 * same code as on the other platforms. Not part of the browser bundle.
 */

import { Worker } from "node:worker_threads";

import { KERNEL_WORKER_SCRIPT } from "./generated/kernelWorkerScript.js";
import { createKernelPool, type KernelPool, type KernelPoolOptions } from "./kernelPool.js";

/** The Node prelude: the web worker scope's message pair over `parentPort`. */
const NODE_PRELUDE = `
const { parentPort } = require("node:worker_threads");
globalThis.postMessage = (message, transfer) => parentPort.postMessage(message, transfer);
parentPort.on("message", (data) => { if (typeof globalThis.onmessage === "function") globalThis.onmessage({ data }); });
`;

export function createNodeKernelPool(
  workers: number,
  options: Pick<KernelPoolOptions, "minUnitsPerLane" | "timeoutMs" | "mainLane"> = {},
): KernelPool {
  const pool = createKernelPool({
    workers,
    ...options,
    spawn: () => {
      const worker = new Worker(NODE_PRELUDE + KERNEL_WORKER_SCRIPT, { eval: true });
      return {
        postMessage: (message, transfer) => worker.postMessage(message, transfer),
        listen: (onMessage, onFailure) => {
          worker.on("message", onMessage);
          worker.on("error", (error: Error) => onFailure(error.message));
          worker.on("messageerror", () => onFailure("unreadable message"));
          worker.on("exit", (code: number) => onFailure(`exited with code ${String(code)}`));
        },
        terminate: () => {
          void worker.terminate();
        },
      };
    },
  });
  return pool;
}
