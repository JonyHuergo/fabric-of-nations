import {
  parseWorkerEvent,
  PROTOCOL_VERSION,
  type WorkerCommand,
  type WorkerEvent,
} from "@century/sim-worker";

import { SIM_WORKER_SCRIPT } from "../generated/simWorker";

export type EventListener = (event: WorkerEvent) => void;
export type ErrorListener = (message: string) => void;

export interface WorkerClient {
  send(command: WorkerCommand): void;
  subscribe(listener: EventListener): () => void;
  subscribeErrors(listener: ErrorListener): () => void;
  close(): void;
}

/** Web Worker transport used on web and react-native-web. */
export class WebWorkerClient implements WorkerClient {
  private readonly worker: Worker;
  private readonly url: string;
  private readonly listeners = new Set<EventListener>();
  private readonly errorListeners = new Set<ErrorListener>();
  private closed = false;

  public constructor() {
    const blob = new Blob([SIM_WORKER_SCRIPT], { type: "text/javascript" });
    this.url = URL.createObjectURL(blob);
    this.worker = new Worker(this.url);
    this.worker.onmessage = (event: MessageEvent<unknown>) => {
      this.handleMessage(event.data);
    };
    this.worker.onerror = (event: ErrorEvent) => {
      this.fail(event.message.length > 0 ? event.message : "web worker failed");
    };
    this.worker.onmessageerror = () => {
      this.fail("web worker returned an unreadable message");
    };
  }

  public get isOpen(): boolean {
    return !this.closed;
  }

  public send(command: WorkerCommand): void {
    if (this.closed) {
      throw new Error("web worker is closed");
    }
    try {
      this.worker.postMessage(command);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.fail(`web worker failed to accept a command: ${message}`);
      throw error;
    }
  }

  public subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public subscribeErrors(listener: ErrorListener): () => void {
    this.errorListeners.add(listener);
    return () => {
      this.errorListeners.delete(listener);
    };
  }

  public close(): void {
    if (this.closed) return;
    this.closed = true;
    this.worker.terminate();
    URL.revokeObjectURL(this.url);
    this.listeners.clear();
    this.errorListeners.clear();
  }

  private handleMessage(raw: unknown): void {
    try {
      const event = parseWorkerEvent(raw);
      for (const listener of this.listeners) listener(event);
    } catch (error) {
      this.emitError(error instanceof Error ? error.message : String(error));
    }
  }

  private fail(message: string): void {
    if (this.closed) return;
    this.closed = true;
    try {
      this.worker.terminate();
    } finally {
      URL.revokeObjectURL(this.url);
    }
    const errorListeners = [...this.errorListeners];
    this.listeners.clear();
    this.errorListeners.clear();
    for (const listener of errorListeners) listener(message);
  }

  private emitError(message: string): void {
    for (const listener of this.errorListeners) listener(message);
  }
}

export function isWebWorkerAvailable(): boolean {
  return typeof Worker !== "undefined" && typeof Blob !== "undefined";
}

export const INITIAL_REQUEST: WorkerCommand = {
  protocolVersion: PROTOCOL_VERSION,
  type: "REQUEST_SNAPSHOT",
  commandId: "app-initial",
};
