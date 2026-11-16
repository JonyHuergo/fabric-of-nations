/**
 * D-162: an in-process kernel "worker" for pool tests. Messages are copied both ways by
 * structured clone (as between threads), the reply comes after `delayMs`, and the job runs with
 * the simulation's kernels (`runKernel`), as the kernel worker script does.
 */

import { runKernel, type KernelJob } from "@century/sim";
import type { KernelPort } from "../../../sim-worker/src/kernelPool.js";

export interface FakePortBehaviour {
  /** Kernel version the port answers the hello with (default 1, the current one). */
  readonly version?: number;
  /** Fail (as a crashed worker) when given a job. */
  readonly failOnJob?: boolean;
  /** Answer every job with a kernel error. */
  readonly kernelError?: boolean;
}

export function fakeKernelPort(delayMs: number, behaviour: FakePortBehaviour = {}): KernelPort {
  let onMessage: ((message: unknown) => void) | null = null;
  let onFailure: ((reason: string) => void) | null = null;
  let terminated = false;
  const later = (action: () => void, ms: number): void => {
    setTimeout(() => {
      if (!terminated) action();
    }, ms);
  };
  return {
    listen: (message, failure) => {
      onMessage = message;
      onFailure = failure;
    },
    postMessage: (raw) => {
      const message = structuredClone(raw) as { readonly type: string; readonly id?: number; readonly job?: KernelJob };
      if (message.type === "hello") {
        later(() => onMessage?.({ type: "ready", version: behaviour.version ?? 1 }), 1);
        return;
      }
      if (behaviour.failOnJob === true) {
        later(() => onFailure?.("simulated worker crash"), 1);
        return;
      }
      const job = message.job;
      later(() => {
        if (behaviour.kernelError === true || job === undefined) {
          onMessage?.({ type: "result", id: message.id, ok: false, arrays: {}, counts: {}, error: "simulated kernel error" });
          return;
        }
        // As the kernel worker entry: a kernel error is reported, not thrown.
        let output: ReturnType<typeof runKernel>;
        try {
          output = runKernel(job);
        } catch (error) {
          onMessage?.({ type: "result", id: message.id, ok: false, arrays: {}, counts: {}, error: error instanceof Error ? error.message : String(error) });
          return;
        }
        onMessage?.(structuredClone({ type: "result", id: message.id, ok: true, arrays: output.arrays, counts: output.counts }));
      }, delayMs);
    },
    terminate: () => {
      terminated = true;
    },
  };
}
