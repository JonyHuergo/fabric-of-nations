/**
 * Headless Century simulation host used by the native WebView worker and the
 * Node worker proof of concept.
 *
 * The host owns the authoritative world. Commands are applied only between
 * completed ticks, never in the middle of one. Snapshots are immutable plain
 * data; the app never receives the world, finance state, or typed arrays.
 */

import {
  applyCountryAction,
  assertValidWorld,
  createEconomyWorld,
  deserializeWorld,
  isCampaignComplete,
  serializeWorld,
  tick,
  validateCountryAction,
} from "@century/sim";
import type {
  CountryAction,
  EconomyScenarioDef,
  TickContext,
  World,
} from "@century/sim";

import {
  DEFAULT_SPEED_DAYS_PER_SECOND,
  PROTOCOL_VERSION,
  ProtocolError,
  parseWorkerCommand,
  type FiscalPolicyActionDto,
  type SimulationSnapshot,
  type SpeedDaysPerSecond,
  type WorkerCommand,
  type WorkerEvent,
} from "./protocol.js";
import { buildSimulationSnapshot } from "./snapshot.js";

const PUMP_INTERVAL_MS = 100;
const SNAPSHOT_INTERVAL_MS = 100;
const MAX_TICKS_PER_PUMP = 4;
/**
 * Pacing policy (D-064): a timer stall may advance the simulation by at most
 * this much wall time, and the retained backlog is capped at the same value.
 * A suspended tab/WebView therefore cannot replay minutes or months of ticks.
 */
const MAX_ELAPSED_MS_PER_PUMP = 1_000;
const MAX_BACKLOG_MS = 1_000;
/** Window used for the presentation-only achieved-throughput measurement. */
const RATE_WINDOW_MS = 500;

export interface SimulationHostOptions {
  readonly scenario: EconomyScenarioDef;
  readonly seed: number;
  readonly emit: (event: WorkerEvent) => void;
  /** Test injection; defaults to `Date.now`. */
  readonly clock?: () => number;
  /** Tests disable the wall-clock pump and call `pump`/`step` explicitly. */
  readonly autoPump?: boolean;
}

function commandIdOf(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return null;
  const commandId = (value as Record<string, unknown>).commandId;
  return typeof commandId === "string" && commandId.length > 0 ? commandId : null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function protocolCode(error: unknown): string {
  return error instanceof ProtocolError ? error.code : "command_failed";
}

export class SimulationHost {
  private readonly emitEvent: (event: WorkerEvent) => void;
  private readonly clock: () => number;
  private readonly autoPump: boolean;
  private readonly scenario: EconomyScenarioDef;
  private readonly context: TickContext;
  private world: World;
  private running = false;
  private speed: SpeedDaysPerSecond = DEFAULT_SPEED_DAYS_PER_SECOND;
  private sequence = 0;
  private accumulatorMs = 0;
  private lastClockMs: number;
  private lastSnapshotMs: number;
  private achievedDaysPerSecond = 0;
  private rateWindowElapsedMs = 0;
  private rateWindowTicks = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private closed = false;

  public constructor(options: SimulationHostOptions) {
    this.emitEvent = options.emit;
    this.clock = options.clock ?? (() => Date.now());
    this.autoPump = options.autoPump !== false;
    this.scenario = options.scenario;
    this.context = {
      population: { definitions: options.scenario.population.definitions },
      economy: { definitions: options.scenario.definitions },
    };
    this.world = createEconomyWorld(options.scenario, { seed: options.seed });
    this.lastClockMs = this.clock();
    this.lastSnapshotMs = this.lastClockMs;
    this.emitSnapshot("READY");
  }

  /** True after SHUTDOWN; all further commands are rejected. */
  public get isClosed(): boolean {
    return this.closed;
  }

  /** Current immutable snapshot, built on demand. */
  public snapshot(): SimulationSnapshot {
    this.sequence += 1;
    return buildSimulationSnapshot(this.world, this.scenario.definitions, {
      sequence: this.sequence,
      running: this.running,
      speedDaysPerSecond: this.speed,
      achievedDaysPerSecond: this.achievedDaysPerSecond,
    });
  }

  /** Discard pending wall-time debt and reset the achieved-rate window. */
  private resetPacing(): void {
    this.lastClockMs = this.clock();
    this.accumulatorMs = 0;
    this.achievedDaysPerSecond = 0;
    this.rateWindowElapsedMs = 0;
    this.rateWindowTicks = 0;
  }

  private recordAchieved(ticks: number, elapsedMs: number): void {
    if (elapsedMs <= 0 || ticks <= 0) return;
    this.rateWindowElapsedMs += elapsedMs;
    this.rateWindowTicks += ticks;
    if (this.rateWindowElapsedMs < RATE_WINDOW_MS) return;
    this.achievedDaysPerSecond = this.rateWindowTicks / (this.rateWindowElapsedMs / 1000);
    this.rateWindowElapsedMs = 0;
    this.rateWindowTicks = 0;
  }

  /** Apply one untrusted command. Invalid input never mutates the world. */
  public handleCommand(raw: unknown): void {
    if (this.closed) {
      this.emitError(commandIdOf(raw), "closed", "simulation host is shut down");
      return;
    }
    let command: WorkerCommand;
    try {
      command = parseWorkerCommand(raw);
    } catch (error) {
      this.emitError(commandIdOf(raw), protocolCode(error), errorMessage(error));
      return;
    }
    try {
      this.dispatch(command);
    } catch (error) {
      this.emitError(command.commandId, protocolCode(error), errorMessage(error));
    }
  }

  private dispatch(command: WorkerCommand): void {
    switch (command.type) {
      case "START":
        this.start(command.commandId);
        return;
      case "PAUSE":
        this.pause();
        this.emitState(command.commandId);
        this.emitSnapshot("SNAPSHOT");
        return;
      case "STEP": {
        this.pause();
        if (!this.advanceTicks(command.ticks)) return;
        this.emitState(command.commandId);
        this.emitSnapshot("SNAPSHOT");
        return;
      }
      case "SET_SPEED":
        this.speed = command.daysPerSecond;
        this.resetPacing();
        this.emitState(command.commandId);
        this.emitSnapshot("SNAPSHOT");
        return;
      case "APPLY_ACTION":
        this.applyAction(command.commandId, command.actionId, command.action);
        return;
      case "REQUEST_SNAPSHOT":
        this.emitSnapshot("SNAPSHOT", command.commandId);
        return;
      case "SAVE":
        this.emitEvent({
          protocolVersion: PROTOCOL_VERSION,
          type: "SAVE_RESULT",
          commandId: command.commandId,
          save: serializeWorld(this.world),
        });
        return;
      case "LOAD":
        this.load(command.commandId, command.save);
        return;
      case "SHUTDOWN":
        this.shutdown(command.commandId);
        return;
      default: {
        const exhaustive: never = command;
        throw new Error(`unhandled command ${JSON.stringify(exhaustive)}`);
      }
    }
  }

  private start(commandId: string): void {
    if (isCampaignComplete(this.world)) {
      this.emitError(commandId, "campaign_complete", "the campaign is already at 2000-01-01");
      return;
    }
    this.running = true;
    this.resetPacing();
    this.startTimer();
    this.emitState(commandId);
    this.emitSnapshot("SNAPSHOT");
  }

  private pause(): void {
    this.running = false;
    this.stopTimer();
    this.resetPacing();
  }

  private startTimer(): void {
    if (!this.autoPump || this.timer !== null) return;
    this.timer = setInterval(() => {
      this.pump(this.clock());
    }, PUMP_INTERVAL_MS);
  }

  private stopTimer(): void {
    if (this.timer === null) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * Advance the wall-clock driver. This is the only place wall time enters the
   * worker; it decides how many complete deterministic ticks to run, never what a
   * tick computes.
   */
  public pump(nowMs: number): void {
    if (!this.running || this.closed) return;
    const elapsed = Math.max(0, nowMs - this.lastClockMs);
    this.lastClockMs = nowMs;
    // Drop time beyond the bounded catch-up window and cap the retained debt.
    // A tab/WebView stall can therefore advance at most one second of wall time,
    // never the entire suspended interval.
    this.accumulatorMs = Math.min(
      this.accumulatorMs + Math.min(elapsed, MAX_ELAPSED_MS_PER_PUMP),
      MAX_BACKLOG_MS,
    );
    const ticks = Math.min(
      Math.floor((this.accumulatorMs / 1000) * this.speed),
      MAX_TICKS_PER_PUMP,
    );
    if (ticks > 0) {
      this.accumulatorMs -= (ticks / this.speed) * 1000;
      if (!this.advanceTicks(ticks)) return;
      this.recordAchieved(ticks, elapsed);
    }
    if (nowMs - this.lastSnapshotMs >= SNAPSHOT_INTERVAL_MS) {
      this.lastSnapshotMs = nowMs;
      this.emitSnapshot("SNAPSHOT");
    }
  }

  /** Run exactly `count` complete ticks. Returns false after a fatal tick error. */
  private advanceTicks(count: number): boolean {
    for (let index = 0; index < count; index += 1) {
      if (isCampaignComplete(this.world)) {
        this.pause();
        this.emitSnapshot("SNAPSHOT");
        return true;
      }
      try {
        const result = tick(this.world, this.context);
        if (!result.advanced) {
          this.pause();
          this.emitSnapshot("SNAPSHOT");
          return true;
        }
      } catch (error) {
        this.pause();
        this.emitEvent({
          protocolVersion: PROTOCOL_VERSION,
          type: "FATAL",
          message: `simulation tick failed: ${errorMessage(error)}`,
        });
        return false;
      }
    }
    if (isCampaignComplete(this.world)) this.pause();
    return true;
  }

  private applyAction(
    commandId: string,
    actionId: string,
    action: FiscalPolicyActionDto,
  ): void {
    const command: CountryAction = {
      kind: "set-fiscal-policy",
      countryId: action.countryId,
      dayIndex: this.world.dayIndex,
      source: "player",
      incomeTaxRate: action.incomeTaxRate,
      welfareBudgetSUSDPerYear: action.welfareBudgetSUSDPerYear,
    };
    const validation = validateCountryAction(this.world, command);
    if (!validation.valid) {
      this.emitEvent({
        protocolVersion: PROTOCOL_VERSION,
        type: "ACTION_RESULT",
        commandId,
        actionId,
        accepted: false,
        errors: validation.errors,
        snapshot: this.snapshot(),
      });
      return;
    }
    try {
      applyCountryAction(this.world, command);
    } catch (error) {
      this.emitEvent({
        protocolVersion: PROTOCOL_VERSION,
        type: "ACTION_RESULT",
        commandId,
        actionId,
        accepted: false,
        errors: [errorMessage(error)],
        snapshot: this.snapshot(),
      });
      return;
    }
    this.emitEvent({
      protocolVersion: PROTOCOL_VERSION,
      type: "ACTION_RESULT",
      commandId,
      actionId,
      accepted: true,
      errors: [],
      snapshot: this.snapshot(),
    });
  }

  private load(commandId: string, save: string): void {
    let loaded: World;
    try {
      loaded = deserializeWorld(save);
      assertValidWorld(loaded);
    } catch (error) {
      this.emitEvent({
        protocolVersion: PROTOCOL_VERSION,
        type: "LOAD_RESULT",
        commandId,
        accepted: false,
        errors: [errorMessage(error)],
        snapshot: this.snapshot(),
      });
      return;
    }
    const expectedStart = this.scenario.population.startDayIndex ?? 0;
    const expectedScenarioId = this.scenario.definitions.scenarioId;
    const errors: string[] = [];
    if (loaded.scenarioId !== expectedScenarioId) {
      errors.push(
        `save scenarioId ${JSON.stringify(loaded.scenarioId)} does not match ${JSON.stringify(expectedScenarioId)}`,
      );
    }
    if (loaded.dataVersion !== this.scenario.definitions.dataVersion) {
      errors.push(
        `save dataVersion ${JSON.stringify(loaded.dataVersion)} does not match ${JSON.stringify(this.scenario.definitions.dataVersion)}`,
      );
    }
    if (loaded.startDayIndex !== expectedStart) {
      errors.push(
        `save startDayIndex ${String(loaded.startDayIndex)} does not match ${String(expectedStart)}`,
      );
    }
    if (errors.length > 0) {
      this.emitEvent({
        protocolVersion: PROTOCOL_VERSION,
        type: "LOAD_RESULT",
        commandId,
        accepted: false,
        errors,
        snapshot: this.snapshot(),
      });
      return;
    }
    this.pause();
    this.world = loaded;
    this.resetPacing();
    this.lastSnapshotMs = this.lastClockMs;
    this.emitEvent({
      protocolVersion: PROTOCOL_VERSION,
      type: "LOAD_RESULT",
      commandId,
      accepted: true,
      errors: [],
      snapshot: this.snapshot(),
    });
  }

  private shutdown(commandId: string): void {
    this.running = false;
    this.stopTimer();
    this.closed = true;
    this.emitEvent({ protocolVersion: PROTOCOL_VERSION, type: "SHUTDOWN", commandId });
  }

  private emitState(commandId: string | null): void {
    this.emitEvent({
      protocolVersion: PROTOCOL_VERSION,
      type: "STATE",
      commandId,
      running: this.running,
      speedDaysPerSecond: this.speed,
      achievedDaysPerSecond: this.achievedDaysPerSecond,
    });
  }

  private emitError(commandId: string | null, code: string, message: string): void {
    this.emitEvent({
      protocolVersion: PROTOCOL_VERSION,
      type: "ERROR",
      commandId,
      code,
      message,
    });
  }

  private emitSnapshot(type: "READY" | "SNAPSHOT", commandId: string | null = null): void {
    const snapshot = this.snapshot();
    if (type === "READY") {
      this.emitEvent({ protocolVersion: PROTOCOL_VERSION, type, snapshot });
      return;
    }
    this.emitEvent({ protocolVersion: PROTOCOL_VERSION, type, commandId, snapshot });
  }
}
