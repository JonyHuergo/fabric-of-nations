/**
 * Headless Fabric of Nations simulation host used by the native WebView worker and the
 * Node worker proof of concept.
 *
 * The host owns the authoritative world. Commands are applied only between
 * completed ticks, never in the middle of one. Snapshots are immutable plain
 * data; the app never receives the world, finance state, or typed arrays.
 */

import {
  applyCountryAction,
  assertValidWorld,
  checkpointRollbackRunner,
  createEconomyWorld,
  createRollbackRunner,
  deserializeWorld,
  isCampaignComplete,
  runTicksWithRollback,
  serializeWorld,
  validateCountryAction,
} from "@century/sim";
import type {
  CountryAction,
  EconomyScenarioDef,
  RollbackRunner,
  TickContext,
  World,
} from "@century/sim";

import {
  DEFAULT_SPEED_DAYS_PER_SECOND,
  PROTOCOL_VERSION,
  ProtocolError,
  parseWorkerCommand,
  type CountryActionDto,
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
  private readonly seed: number;
  /** Scenario content, including M11 static polity/market metadata. */
  private readonly baseScenario: EconomyScenarioDef;
  private scenario: EconomyScenarioDef;
  private readonly context: TickContext;
  private world: World;
  /**
   * D-116 rollback state for `world`: days run in phase mode and a failed day is
   * restored to its start. Replaced whenever `world` is replaced and checkpointed
   * after every accepted action.
   */
  private runner: RollbackRunner;
  private focusCountryId: number | null = null;
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
    this.seed = options.seed;
    this.baseScenario = options.scenario;
    this.scenario = options.scenario;
    this.context = {
      population: { definitions: options.scenario.population.definitions },
      economy: { definitions: options.scenario.definitions },
    };
    this.world = createEconomyWorld(options.scenario, { seed: options.seed });
    this.runner = createRollbackRunner(this.world);
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
      focusCountryId: this.focusCountryId,
      ...(this.scenario.countryMeta === undefined ? {} : { countryMeta: this.scenario.countryMeta }),
      ...(this.scenario.marketMeta === undefined ? {} : { marketMeta: this.scenario.marketMeta }),
      ...(this.scenario.territoryMeta === undefined ? {} : { territoryMeta: this.scenario.territoryMeta }),
    }, this.scenario.population.definitions);
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
      case "SET_FOCUS":
        this.setFocus(command.commandId, command.countryId);
        return;
      case "CREATE_GAME":
        this.createGame(command.commandId, command.playerCountryId);
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
      case "PREVIEW_SAVE":
        this.previewSave(command.commandId, command.save);
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
        const result = runTicksWithRollback(this.runner, 1, this.context);
        if (result.ticksProcessed === 0) {
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
    action: CountryActionDto,
  ): void {
    // The DTO union mirrors the validated action union; only the worker-stamped
    // day and source are added here. Narrowing by `kind` is preserved at runtime.
    const command = {
      ...action,
      dayIndex: this.world.dayIndex,
      source: "player",
    } as CountryAction;
    const validation = validateCountryAction(
      this.world,
      command,
      this.scenario.definitions,
    );
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
      applyCountryAction(this.world, command, this.scenario.definitions);
      checkpointRollbackRunner(this.runner);
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

  /**
   * Presentation-only focus selection. It never mutates simulation state; it
   * only decides which country's full record is included in snapshots.
   */
  private setFocus(commandId: string, countryId: number): void {
    if (!this.world.countries.some((country) => country.id === countryId)) {
      this.emitError(commandId, "invalid_focus", `country ${String(countryId)} is not registered`);
      return;
    }
    this.focusCountryId = countryId;
    this.emitSnapshot("SNAPSHOT", commandId);
  }

  /**
   * Start a fresh 1900 world with an explicitly selected player country. The
   * selection is validated against the scenario catalog: unknown countries and
   * non-selectable dependencies are rejected, never silently defaulted.
   */
  private createGame(commandId: string, playerCountryId: number): void {
    const reject = (errors: string[]): void => {
      this.emitEvent({
        protocolVersion: PROTOCOL_VERSION,
        type: "NEW_GAME_RESULT",
        commandId,
        accepted: false,
        errors,
        snapshot: this.snapshot(),
      });
    };
    const countries = this.baseScenario.countries ?? [];
    if (!countries.some((country) => country.id === playerCountryId)) {
      reject([`country ${String(playerCountryId)} is not part of this scenario`]);
      return;
    }
    const meta = this.baseScenario.countryMeta?.find(
      (entry) => entry.countryId === playerCountryId,
    );
    if (meta !== undefined && !meta.selectable) {
      reject([
        `${meta.historicalName} is a ${meta.status.replaceAll("-", " ")} and cannot be selected as a player country`,
      ]);
      return;
    }
    let scenario: EconomyScenarioDef;
    let world: World;
    try {
      scenario = { ...this.baseScenario, playerCountryId };
      world = createEconomyWorld(scenario, { seed: this.seed });
    } catch (error) {
      reject([`new campaign could not be created: ${errorMessage(error)}`]);
      return;
    }
    this.pause();
    this.scenario = scenario;
    this.world = world;
    this.runner = createRollbackRunner(world);
    this.focusCountryId = null;
    this.lastSnapshotMs = this.clock();
    this.emitEvent({
      protocolVersion: PROTOCOL_VERSION,
      type: "NEW_GAME_RESULT",
      commandId,
      accepted: true,
      errors: [],
      snapshot: this.snapshot(),
    });
  }

  /** Reasons a deserialized save does not belong to this scenario; empty when it does. */
  private saveCompatibilityErrors(loaded: World): string[] {
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
    return errors;
  }

  /**
   * Describe a stored save without adopting it, for the main-menu backdrop. The
   * save goes through the same validation as LOAD, but the authoritative world,
   * pacing and snapshot sequence are untouched.
   */
  private previewSave(commandId: string, save: string): void {
    const reject = (errors: readonly string[]): void => {
      this.emitEvent({
        protocolVersion: PROTOCOL_VERSION,
        type: "SAVE_PREVIEW",
        commandId,
        accepted: false,
        errors,
        snapshot: null,
      });
    };
    let loaded: World;
    try {
      loaded = deserializeWorld(save);
      assertValidWorld(loaded);
    } catch (error) {
      reject([errorMessage(error)]);
      return;
    }
    const errors = this.saveCompatibilityErrors(loaded);
    if (errors.length > 0) {
      reject(errors);
      return;
    }
    this.emitEvent({
      protocolVersion: PROTOCOL_VERSION,
      type: "SAVE_PREVIEW",
      commandId,
      accepted: true,
      errors: [],
      snapshot: buildSimulationSnapshot(loaded, this.scenario.definitions, {
        sequence: this.sequence,
        running: false,
        speedDaysPerSecond: this.speed,
        achievedDaysPerSecond: 0,
        focusCountryId: null,
        ...(this.scenario.countryMeta === undefined ? {} : { countryMeta: this.scenario.countryMeta }),
        ...(this.scenario.marketMeta === undefined ? {} : { marketMeta: this.scenario.marketMeta }),
        ...(this.scenario.territoryMeta === undefined ? {} : { territoryMeta: this.scenario.territoryMeta }),
      }, this.scenario.population.definitions),
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
    const errors = this.saveCompatibilityErrors(loaded);
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
    this.runner = createRollbackRunner(loaded);
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
