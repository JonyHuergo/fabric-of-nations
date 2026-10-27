/**
 * Transport-independent worker command supervisor (D-064).
 *
 * Responsibilities:
 * - bounded readiness timeout;
 * - per-command reply timeout;
 * - command/reply correlation by commandId;
 * - rejection of late or duplicate replies;
 * - a single in-flight critical operation (save/load/apply);
 * - monotonically increasing snapshot sequence gating;
 * - cleanup on failure/reset/dispose.
 *
 * It contains no simulation, DOM, React, or platform imports so the same logic
 * is used by the web worker, the native WebView transport, and tests.
 */

import type { WorkerCommand, WorkerEvent } from "./protocol.js";

export interface SupervisorScheduler {
  setTimeout(callback: () => void, milliseconds: number): unknown;
  clearTimeout(handle: unknown): void;
}

const DEFAULT_SCHEDULER: SupervisorScheduler = {
  setTimeout: (callback, milliseconds) => setTimeout(callback, milliseconds),
  clearTimeout: (handle) => {
    clearTimeout(handle as ReturnType<typeof setTimeout>);
  },
};

const CRITICAL_COMMANDS: ReadonlySet<WorkerCommand["type"]> = new Set([
  "SAVE",
  "LOAD",
  "APPLY_ACTION",
]);

export interface WorkerSupervisorOptions {
  readonly send: (command: WorkerCommand) => void;
  readonly onEvent: (event: WorkerEvent) => void;
  readonly onError: (message: string) => void;
  readonly onTimeout: (
    commandId: string | null,
    commandType: WorkerCommand["type"] | "READY",
    message: string,
  ) => void;
  readonly scheduler?: SupervisorScheduler;
  readonly readinessTimeoutMs?: number;
  readonly commandTimeoutMs?: number;
  readonly criticalTimeoutMs?: number;
}

interface PendingCommand {
  readonly type: WorkerCommand["type"];
  readonly timer: unknown;
  readonly critical: boolean;
}

const DEFAULT_READINESS_TIMEOUT_MS = 10_000;
const DEFAULT_COMMAND_TIMEOUT_MS = 15_000;
const DEFAULT_CRITICAL_TIMEOUT_MS = 60_000;

export class WorkerSupervisor {
  private readonly options: WorkerSupervisorOptions;
  private readonly scheduler: SupervisorScheduler;
  private readonly pending = new Map<string, PendingCommand>();
  private readinessTimer: unknown = null;
  private ready = false;
  private disposed = false;
  private lastSnapshotSequence = -1;

  public constructor(options: WorkerSupervisorOptions) {
    this.options = options;
    this.scheduler = options.scheduler ?? DEFAULT_SCHEDULER;
    this.startReadiness();
  }

  public get isReady(): boolean {
    return this.ready;
  }

  public get pendingCount(): number {
    return this.pending.size;
  }

  public get hasPendingCritical(): boolean {
    for (const pending of this.pending.values()) {
      if (pending.critical) return true;
    }
    return false;
  }

  /** Begin (or restart) the bounded readiness timeout. */
  public startReadiness(): void {
    this.clearReadiness();
    this.ready = false;
    if (this.disposed) return;
    const timeout = this.options.readinessTimeoutMs ?? DEFAULT_READINESS_TIMEOUT_MS;
    this.readinessTimer = this.scheduler.setTimeout(() => {
      this.readinessTimer = null;
      if (this.ready || this.disposed) return;
      const message =
        "The simulation worker did not become ready. Restart the worker and reload a saved game.";
      this.clearPending();
      this.options.onTimeout(null, "READY", message);
    }, timeout);
  }

  /** Mark the worker ready; called on READY or the first accepted snapshot. */
  public markReady(): void {
    this.ready = true;
    this.clearReadiness();
  }

  /**
   * Send a command and register its expected reply. Returns false when another
   * critical operation is unresolved or the transport throws.
   */
  public send(command: WorkerCommand): boolean {
    if (this.disposed) return false;
    const critical = CRITICAL_COMMANDS.has(command.type);
    if (critical && this.hasPendingCritical) {
      this.options.onError(
        "Another save, load, or policy action is still pending. Wait for it to finish or restart the worker.",
      );
      return false;
    }
    try {
      this.options.send(command);
    } catch (error) {
      this.options.onError(error instanceof Error ? error.message : String(error));
      return false;
    }
    const timeout = critical
      ? (this.options.criticalTimeoutMs ?? DEFAULT_CRITICAL_TIMEOUT_MS)
      : (this.options.commandTimeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS);
    const timer = this.scheduler.setTimeout(() => {
      this.onCommandTimeout(command.commandId, command.type);
    }, timeout);
    this.pending.set(command.commandId, { type: command.type, timer, critical });
    return true;
  }

  /**
   * Accept one parsed worker event. Late/duplicate command replies and stale
   * snapshots are dropped here, before the React provider sees them.
   */
  public receive(event: WorkerEvent): void {
    if (this.disposed) return;
    if (event.type === "FATAL") {
      this.clearPending();
      this.clearReadiness();
      this.options.onEvent(event);
      return;
    }
    if (event.type === "READY") {
      this.markReady();
      if (!this.acceptSnapshotSequence(event.snapshot.sequence)) return;
      this.options.onEvent(event);
      return;
    }
    if (event.type === "SNAPSHOT") {
      this.markReady();
      if (event.commandId !== null && !this.settle(event.commandId)) return;
      if (!this.acceptSnapshotSequence(event.snapshot.sequence)) return;
      this.options.onEvent(event);
      return;
    }
    if (event.type === "ERROR") {
      if (event.commandId !== null) {
        if (!this.settle(event.commandId)) return;
      }
      this.options.onEvent(event);
      return;
    }
    if (event.type === "STATE") {
      if (event.commandId !== null && !this.settle(event.commandId)) return;
      this.options.onEvent(event);
      return;
    }
    if (event.type === "ACTION_RESULT") {
      if (!this.settle(event.commandId)) return;
      this.options.onEvent(event);
      return;
    }
    if (event.type === "SAVE_RESULT") {
      if (!this.settle(event.commandId)) return;
      this.options.onEvent(event);
      return;
    }
    if (event.type === "LOAD_RESULT") {
      if (!this.settle(event.commandId)) return;
      this.options.onEvent(event);
      return;
    }
    if (event.type === "SHUTDOWN") {
      this.settle(event.commandId);
      this.clearReadiness();
      this.options.onEvent(event);
    }
  }

  /**
   * Transport-level failure. Clears pending timers and readiness so no late
   * timeout can fire after the provider has already handled the failure.
   */
  public fail(message: string): void {
    this.clearPending();
    this.clearReadiness();
    this.ready = false;
    this.options.onError(message);
  }

  /** Reset for a replacement worker instance. */
  public reset(): void {
    this.clearPending();
    this.clearReadiness();
    this.ready = false;
    this.lastSnapshotSequence = -1;
  }

  /** Permanently disable the supervisor and clear all timers. */
  public dispose(): void {
    this.disposed = true;
    this.reset();
  }

  /** True when a snapshot sequence is newer than the last accepted one. */
  public acceptSnapshotSequence(sequence: number): boolean {
    if (!Number.isInteger(sequence) || sequence <= this.lastSnapshotSequence) return false;
    this.lastSnapshotSequence = sequence;
    return true;
  }

  private settle(commandId: string | null): boolean {
    if (commandId === null) return true;
    const pending = this.pending.get(commandId);
    if (pending === undefined) return false;
    this.scheduler.clearTimeout(pending.timer);
    this.pending.delete(commandId);
    return true;
  }

  private onCommandTimeout(commandId: string, type: WorkerCommand["type"]): void {
    if (this.disposed) return;
    const pending = this.pending.get(commandId);
    if (pending === undefined) return;
    this.scheduler.clearTimeout(pending.timer);
    this.pending.delete(commandId);
    const message = `${type} did not receive a worker response within the timeout. The worker may be stuck; restart it and reload a saved game if needed.`;
    this.options.onTimeout(commandId, type, message);
  }

  private clearPending(): void {
    for (const pending of this.pending.values()) {
      this.scheduler.clearTimeout(pending.timer);
    }
    this.pending.clear();
  }

  private clearReadiness(): void {
    if (this.readinessTimer === null) return;
    this.scheduler.clearTimeout(this.readinessTimer);
    this.readinessTimer = null;
  }
}
