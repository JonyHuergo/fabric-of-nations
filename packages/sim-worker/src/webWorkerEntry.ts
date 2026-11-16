/**
 * Browser/WebView worker entry.
 *
 * The same IIFE bundle runs in:
 * - a Web Worker created from a Blob URL on web, and
 * - a hidden React Native WebView on iOS/Android, which executes JavaScript in a
 *   separate WebView context rather than the React Native JS/UI thread.
 *
 * The app communicates with this entry only through the versioned protocol.
 *
 * D-162: in both contexts the entry starts kernel worker threads from a blob URL of the
 * bundled kernel script when the context can (feature detection and a handshake; otherwise
 * every day runs on this thread). The count is `globalThis.__fonSimWorkers`, which the app sets
 * before the script (`packages/app/src/worker/simThreads.ts`): a count (0 = single thread) or
 * "auto" (the device default); absent or invalid, 0.
 */

import { SimulationHost } from "./host.js";
import { createBrowserKernelPool, browserWorkersAvailable } from "./browserKernelPool.js";
import { KERNEL_WORKER_SCRIPT } from "./generated/kernelWorkerScript.js";
import { WORLD_SCENARIO } from "./generated/worldScenario.js";
import { defaultKernelWorkerCount } from "./kernelPool.js";
import { PROTOCOL_VERSION, type WorkerEvent } from "./protocol.js";

interface ReactNativeBridge {
  readonly ReactNativeWebView?: {
    postMessage(message: string): void;
  };
  __centuryReceive?: (message: string) => void;
}

interface KernelWorkerSettings {
  readonly __fonSimWorkers?: unknown;
  readonly navigator?: { readonly hardwareConcurrency?: number };
}

/** Kernel workers to start: the app's setting (0..8, or "auto" for the device default), else 0. */
function requestedKernelWorkers(): number {
  const settings = globalThis as unknown as KernelWorkerSettings;
  const asked = settings.__fonSimWorkers;
  if (asked === "auto") return defaultKernelWorkerCount(settings.navigator?.hardwareConcurrency);
  if (typeof asked === "number" && Number.isInteger(asked) && asked >= 0) return Math.min(asked, 8);
  return 0;
}

interface WorkerScopeLike {
  postMessage?: (event: WorkerEvent) => void;
  onmessage?: ((event: MessageEvent<unknown>) => void) | null;
  addEventListener?: (
    type: string,
    listener: (event: MessageEvent<unknown>) => void,
  ) => void;
}

const windowObject = typeof window === "undefined" ? undefined : (window as Window & ReactNativeBridge);
const workerScope = globalThis as unknown as WorkerScopeLike;

function send(event: WorkerEvent): void {
  if (windowObject?.ReactNativeWebView?.postMessage !== undefined) {
    windowObject.ReactNativeWebView.postMessage(JSON.stringify(event));
    return;
  }
  workerScope.postMessage?.(event);
}

function sendProtocolError(message: string): void {
  send({
    protocolVersion: PROTOCOL_VERSION,
    type: "ERROR",
    commandId: null,
    code: "invalid_message",
    message,
  });
}

const kernelWorkers = requestedKernelWorkers();
const parallel =
  kernelWorkers > 0 && browserWorkersAvailable() ? createBrowserKernelPool(KERNEL_WORKER_SCRIPT, kernelWorkers) : undefined;

const host = new SimulationHost({
  scenario: WORLD_SCENARIO,
  seed: 20_261_023,
  emit: send,
  ...(parallel === undefined ? {} : { parallel }),
});

function receive(raw: unknown): void {
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw) as unknown;
    } catch (error) {
      sendProtocolError(error instanceof Error ? error.message : String(error));
      return;
    }
  }
  host.handleCommand(value);
}

if (windowObject !== undefined) {
  windowObject.__centuryReceive = (message: string) => {
    receive(message);
  };
  windowObject.addEventListener("message", (event: MessageEvent<unknown>) => {
    // Ignore messages posted by this same window (for example the fallback send
    // path in a plain browser). In the native WebView the app calls
    // `window.__centuryReceive` directly and posts back through ReactNativeWebView.
    if (event.source === windowObject) return;
    if (event.data !== undefined) receive(event.data);
  });
  if (typeof document !== "undefined") {
    const legacyAndroidListener: EventListener = (event) => {
      const data = (event as MessageEvent<unknown>).data;
      if (data !== undefined) receive(data);
    };
    document.addEventListener("message", legacyAndroidListener);
  }
} else {
  workerScope.onmessage = (event: MessageEvent<unknown>) => {
    receive(event.data);
  };
}
