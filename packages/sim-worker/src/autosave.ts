/**
 * Debounced autosave scheduling (D-065).
 *
 * At most one autosave timer exists. Repeated requests while a timer is pending
 * are coalesced instead of queued. The save callback is only invoked when the
 * caller still reports that saving is safe (not busy with another critical
 * operation) at fire time.
 */

export interface AutosaveTimer {
  setTimeout(callback: () => void, milliseconds: number): unknown;
  clearTimeout(handle: unknown): void;
}

const DEFAULT_TIMER: AutosaveTimer = {
  setTimeout: (callback, milliseconds) => setTimeout(callback, milliseconds),
  clearTimeout: (handle) => {
    clearTimeout(handle as ReturnType<typeof setTimeout>);
  },
};

export interface AutosaveSchedulerOptions {
  readonly delayMs: number;
  readonly canSave: () => boolean;
  readonly save: () => void;
  readonly timer?: AutosaveTimer;
}

export class AutosaveScheduler {
  private readonly options: AutosaveSchedulerOptions;
  private readonly timer: AutosaveTimer;
  private handle: unknown = null;
  private disposed = false;

  public constructor(options: AutosaveSchedulerOptions) {
    this.options = options;
    this.timer = options.timer ?? DEFAULT_TIMER;
  }

  public get isPending(): boolean {
    return this.handle !== null;
  }

  /** Coalesce a request; returns true when a new timer was started. */
  public request(): boolean {
    if (this.disposed || this.handle !== null) return false;
    if (!this.options.canSave()) return false;
    this.handle = this.timer.setTimeout(() => {
      this.handle = null;
      if (this.disposed) return;
      if (!this.options.canSave()) return;
      this.options.save();
    }, this.options.delayMs);
    return true;
  }

  public cancel(): void {
    if (this.handle === null) return;
    this.timer.clearTimeout(this.handle);
    this.handle = null;
  }

  public dispose(): void {
    this.cancel();
    this.disposed = true;
  }
}
