/**
 * D-162: kernel workers started from a blob URL of the bundled kernel script, where the
 * platform allows it: the sim Web Worker on web (nested workers) and the hidden WebView page on
 * iOS and Android. Feature detection: `Worker`, `Blob` and `URL.createObjectURL` must exist and
 * construction must succeed; the pool's handshake then checks that every worker answers. When
 * any of this fails the pool is unavailable and every phase runs on the sim thread.
 */

import { createKernelPool, type KernelPool, type KernelPort } from "./kernelPool.js";

interface BrowserWorkerLike {
  postMessage(message: unknown, transfer: Transferable[]): void;
  terminate(): void;
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent<unknown>) => void) | null;
}

interface BrowserScope {
  readonly Worker?: new (url: string) => BrowserWorkerLike;
  readonly Blob?: typeof Blob;
  readonly URL?: { createObjectURL?: (blob: Blob) => string; revokeObjectURL?: (url: string) => void };
}

/** Whether this context can start blob-URL workers at all (the handshake decides the rest). */
export function browserWorkersAvailable(): boolean {
  const scope = globalThis as unknown as BrowserScope;
  return typeof scope.Worker === "function" && typeof scope.Blob === "function" && typeof scope.URL?.createObjectURL === "function";
}

/**
 * A pool of `workers` blob-URL kernel workers running `script`. Returns a pool that is
 * unavailable (every phase inline) when workers cannot be started here.
 */
export function createBrowserKernelPool(script: string, workers: number, options: { readonly minUnitsPerLane?: number } = {}): KernelPool {
  const scope = globalThis as unknown as BrowserScope;
  let url: string | null = null;
  const spawn = (): KernelPort => {
    if (!browserWorkersAvailable()) throw new Error("this context cannot start workers");
    if (url === null) {
      const BlobType = scope.Blob as typeof Blob;
      url = (scope.URL?.createObjectURL as (blob: Blob) => string)(new BlobType([script], { type: "text/javascript" }));
    }
    const WorkerType = scope.Worker as new (url: string) => BrowserWorkerLike;
    const worker = new WorkerType(url);
    return {
      postMessage: (message, transfer) => worker.postMessage(message, transfer),
      listen: (onMessage, onFailure) => {
        worker.onmessage = (event) => onMessage(event.data);
        worker.onerror = (event) => {
          event.preventDefault();
          onFailure(event.message.length > 0 ? event.message : "worker error");
        };
        worker.onmessageerror = () => onFailure("unreadable message");
      },
      terminate: () => worker.terminate(),
    };
  };
  const pool = createKernelPool({ workers, spawn, ...(options.minUnitsPerLane === undefined ? {} : { minUnitsPerLane: options.minUnitsPerLane }) });
  return {
    ...pool,
    close: () => {
      pool.close();
      if (url !== null) scope.URL?.revokeObjectURL?.(url);
    },
  };
}
