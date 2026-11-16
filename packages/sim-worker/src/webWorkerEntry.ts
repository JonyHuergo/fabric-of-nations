/**
 * Browser/WebView worker entry.
 *
 * The same IIFE bundle runs in:
 * - a Web Worker created from a Blob URL on web, and
 * - a hidden React Native WebView on iOS/Android, which executes JavaScript in a
 *   separate WebView context rather than the React Native JS/UI thread.
 *
 * The app communicates with this entry only through the versioned protocol.
 */

import { SimulationHost } from "./host.js";
import { WORLD_SCENARIO } from "./generated/worldScenario.js";
import { PROTOCOL_VERSION, type WorkerEvent } from "./protocol.js";

interface ReactNativeBridge {
  readonly ReactNativeWebView?: {
    postMessage(message: string): void;
  };
  __centuryReceive?: (message: string) => void;
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

const host = new SimulationHost({
  scenario: WORLD_SCENARIO,
  seed: 20_261_023,
  emit: send,
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
