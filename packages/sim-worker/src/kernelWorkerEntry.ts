/**
 * D-162: the kernel worker. One script (bundled by `packages/app/scripts/build-worker.mjs` and
 * embedded in the sim worker bundle) runs in every kernel thread:
 *
 * - a nested Web Worker started by the sim worker from a blob URL (web);
 * - a Web Worker started from a blob URL by the hidden WebView page that runs the sim (iOS and
 *   Android);
 * - a Node `worker_threads` worker (`nodeKernelPool.ts`, desktop benchmarks and tests), which
 *   gives the script a `postMessage`/`onmessage` pair before it runs.
 *
 * It answers the pool's hello with the kernel version and runs each job with the simulation's
 * kernels (`runKernel`), posting the outputs back as compact copies. Nothing is transferred, so
 * this thread never detaches a buffer (see `kernelPool.ts`). It holds no state between jobs.
 */

import { KERNEL_PROTOCOL_VERSION, runKernel } from "@century/sim";

import { compactArrays, type KernelWorkerReply, type KernelWorkerRequest } from "./kernelPool.js";

interface KernelWorkerScope {
  postMessage(message: unknown, transfer?: ArrayBuffer[]): void;
  onmessage: ((event: { readonly data: unknown }) => void) | null;
}

const scope = globalThis as unknown as KernelWorkerScope;

function reply(message: KernelWorkerReply): void {
  scope.postMessage(message, []);
}

scope.onmessage = (event) => {
  const message = event.data as KernelWorkerRequest | null;
  if (message === null || typeof message !== "object") return;
  if (message.type === "hello") {
    reply({ type: "ready", version: KERNEL_PROTOCOL_VERSION });
    return;
  }
  if (message.type !== "job") return;
  const job = message.job;
  try {
    const output = runKernel(job);
    reply({ type: "result", id: message.id, ok: true, arrays: compactArrays(output.arrays), counts: output.counts });
  } catch (error) {
    // The phase is re-run on the sim thread, which reproduces the error there.
    reply({
      type: "result",
      id: message.id,
      ok: false,
      arrays: {},
      counts: {},
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
