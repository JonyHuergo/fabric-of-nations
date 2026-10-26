/**
 * Versioned Century worker protocol and immutable UI snapshot contract.
 *
 * This module is intentionally free of simulation, Node, React Native, and DOM
 * imports. The app may import it directly; it contains only plain data contracts,
 * protocol constants, and runtime validation of untrusted messages.
 */

export const PROTOCOL_VERSION = 1 as const;
export const MAX_PROTOCOL_ID_LENGTH = 128;
export const MAX_STEP_TICKS = 1_000;
export const MAX_LOAD_SAVE_LENGTH = 64 * 1024 * 1024;
export const MAX_SNAPSHOT_LEDGER_MONTHS = 12;

/** Discrete speed choices exposed by the M7 UI, in simulated days per second. */
export const SPEED_VALUES = [1, 2, 5, 10] as const;
export type SpeedDaysPerSecond = (typeof SPEED_VALUES)[number];

export const DEFAULT_SPEED_DAYS_PER_SECOND: SpeedDaysPerSecond = 1;

/** A set-fiscal-policy request as sent by the UI. The worker stamps the day. */
export interface FiscalPolicyActionDto {
  readonly kind: "set-fiscal-policy";
  readonly countryId: number;
  readonly incomeTaxRate: number;
  readonly welfareBudgetSUSDPerYear: number;
}

export type WorkerCommand =
  | { readonly protocolVersion: 1; readonly type: "START"; readonly commandId: string }
  | { readonly protocolVersion: 1; readonly type: "PAUSE"; readonly commandId: string }
  | {
      readonly protocolVersion: 1;
      readonly type: "STEP";
      readonly commandId: string;
      readonly ticks: number;
    }
  | {
      readonly protocolVersion: 1;
      readonly type: "SET_SPEED";
      readonly commandId: string;
      readonly daysPerSecond: SpeedDaysPerSecond;
    }
  | {
      readonly protocolVersion: 1;
      readonly type: "APPLY_ACTION";
      readonly commandId: string;
      readonly actionId: string;
      readonly action: FiscalPolicyActionDto;
    }
  | {
      readonly protocolVersion: 1;
      readonly type: "REQUEST_SNAPSHOT";
      readonly commandId: string;
    }
  | { readonly protocolVersion: 1; readonly type: "SAVE"; readonly commandId: string }
  | {
      readonly protocolVersion: 1;
      readonly type: "LOAD";
      readonly commandId: string;
      readonly save: string;
    }
  | { readonly protocolVersion: 1; readonly type: "SHUTDOWN"; readonly commandId: string };

export interface SnapshotCivilDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  /** Canonical `YYYY-MM-DD` label. */
  readonly label: string;
}

export interface SnapshotFiscalPolicy {
  readonly incomeTaxRate: number;
  readonly welfareBudgetSUSDPerYear: number;
}

export interface SnapshotFiscalTotals {
  readonly periodStartDay: number;
  readonly periodEndDay: number;
  readonly incomeTaxSUSD: number;
  readonly welfareExpenseSUSD: number;
  readonly interestExpenseSUSD: number;
  readonly netFiscalResultSUSD: number;
}

export interface SnapshotFinancePeriod extends SnapshotFiscalTotals {
  /** World-wide gross flows for the four M4b flow kinds. */
  readonly grossFlowTotals: Readonly<Record<string, number>>;
}

export interface CountrySnapshot {
  readonly id: number;
  readonly tag: string;
  readonly name: string;
  readonly regionIds: readonly number[];
  readonly fiscal: SnapshotFiscalPolicy;
  readonly treasuryCashSUSD: number;
  readonly debtEnabled: boolean;
  readonly debtOutstandingPrincipalSUSD: number;
  readonly population: number;
  readonly workingAgePopulation: number;
  readonly employedWorkers: number;
  /** Population-weighted own-country indicators, 0..1 or 0..99 as named. */
  readonly literacy: number;
  readonly wealthLevel: number;
  readonly militancy: number;
  readonly hardshipPopulationShare: number;
  readonly blocksWithUnmetSubsistence: number;
  readonly blocksWithUnmetBasic: number;
  readonly buildingCount: number;
  readonly latestFiscal: SnapshotFiscalTotals | null;
  readonly financeHistory: readonly SnapshotFinancePeriod[];
}

export interface RegionSnapshot {
  readonly id: number;
  readonly key: string;
  readonly name: string;
  readonly countryId: number | null;
  readonly marketId: number | null;
  readonly population: number;
  readonly buildingCount: number;
}

export interface GoodSnapshot {
  readonly id: number;
  readonly key: string;
  readonly name: string;
  readonly unitLabel: string;
  readonly category: string;
}

export interface MarketPriceSnapshot {
  readonly goodId: number;
  readonly goodKey: string;
  readonly goodName: string;
  readonly unitLabel: string;
  readonly priceSUSD: number;
  readonly stockQuantity: number;
}

export interface MarketSnapshot {
  readonly id: number;
  readonly label: string;
  readonly regionIds: readonly number[];
  readonly prices: readonly MarketPriceSnapshot[];
}

export interface SnapshotDiagnostics {
  readonly invalidActionCount: number;
  readonly invariantFailureCount: number;
  readonly recentWarnings: readonly string[];
}

/** The complete immutable UI snapshot. It contains no live world references. */
export interface SimulationSnapshot {
  readonly protocolVersion: 1;
  readonly sequence: number;
  readonly dayIndex: number;
  readonly date: SnapshotCivilDate;
  readonly running: boolean;
  readonly speedDaysPerSecond: number;
  readonly campaignComplete: boolean;
  readonly scenarioId: string;
  readonly dataVersion: string;
  readonly simVersion: string;
  readonly countries: readonly CountrySnapshot[];
  readonly regions: readonly RegionSnapshot[];
  readonly markets: readonly MarketSnapshot[];
  readonly goods: readonly GoodSnapshot[];
  readonly diagnostics: SnapshotDiagnostics;
}

export type WorkerEvent =
  | { readonly protocolVersion: 1; readonly type: "READY"; readonly snapshot: SimulationSnapshot }
  | {
      readonly protocolVersion: 1;
      readonly type: "SNAPSHOT";
      readonly snapshot: SimulationSnapshot;
    }
  | {
      readonly protocolVersion: 1;
      readonly type: "STATE";
      readonly running: boolean;
      readonly speedDaysPerSecond: number;
    }
  | {
      readonly protocolVersion: 1;
      readonly type: "ACTION_RESULT";
      readonly actionId: string;
      readonly accepted: boolean;
      readonly errors: readonly string[];
      readonly snapshot: SimulationSnapshot;
    }
  | {
      readonly protocolVersion: 1;
      readonly type: "SAVE_RESULT";
      readonly commandId: string;
      readonly save: string;
    }
  | {
      readonly protocolVersion: 1;
      readonly type: "LOAD_RESULT";
      readonly commandId: string;
      readonly accepted: boolean;
      readonly errors: readonly string[];
      readonly snapshot: SimulationSnapshot;
    }
  | {
      readonly protocolVersion: 1;
      readonly type: "ERROR";
      readonly commandId: string | null;
      readonly code: string;
      readonly message: string;
    }
  | { readonly protocolVersion: 1; readonly type: "FATAL"; readonly message: string }
  | { readonly protocolVersion: 1; readonly type: "SHUTDOWN" };

export class ProtocolError extends Error {
  public readonly code: string;

  public constructor(code: string, message: string) {
    super(message);
    this.name = "ProtocolError";
    this.code = code;
  }
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ProtocolError("invalid_message", `${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireString(
  value: unknown,
  path: string,
  options: { readonly minLength?: number; readonly maxLength?: number } = {},
): string {
  if (typeof value !== "string") {
    throw new ProtocolError("invalid_message", `${path} must be a string`);
  }
  const min = options.minLength ?? 0;
  const max = options.maxLength ?? MAX_PROTOCOL_ID_LENGTH;
  if (value.length < min || value.length > max) {
    throw new ProtocolError(
      "invalid_message",
      `${path} length must be in ${String(min)}..${String(max)}`,
    );
  }
  return value;
}

function requireFiniteNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ProtocolError("invalid_message", `${path} must be a finite number`);
  }
  return value;
}

function requireInteger(
  value: unknown,
  path: string,
  min: number,
  max: number,
): number {
  const number = requireFiniteNumber(value, path);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new ProtocolError(
      "invalid_message",
      `${path} must be an integer in ${String(min)}..${String(max)}`,
    );
  }
  return number;
}

function parseAction(value: unknown): FiscalPolicyActionDto {
  const record = requireRecord(value, "command.action");
  if (record.kind !== "set-fiscal-policy") {
    throw new ProtocolError("invalid_action", 'command.action.kind must be "set-fiscal-policy"');
  }
  const incomeTaxRate = requireFiniteNumber(
    record.incomeTaxRate,
    "command.action.incomeTaxRate",
  );
  if (incomeTaxRate < 0 || incomeTaxRate > 1) {
    throw new ProtocolError("invalid_action", "command.action.incomeTaxRate must be in 0..1");
  }
  const welfareBudgetSUSDPerYear = requireFiniteNumber(
    record.welfareBudgetSUSDPerYear,
    "command.action.welfareBudgetSUSDPerYear",
  );
  if (welfareBudgetSUSDPerYear < 0) {
    throw new ProtocolError(
      "invalid_action",
      "command.action.welfareBudgetSUSDPerYear must be non-negative",
    );
  }
  return {
    kind: "set-fiscal-policy",
    countryId: requireInteger(record.countryId, "command.action.countryId", 0, 0xffff_ffff),
    incomeTaxRate,
    welfareBudgetSUSDPerYear,
  };
}

function isSpeed(value: number): value is SpeedDaysPerSecond {
  return (SPEED_VALUES as readonly number[]).includes(value);
}

/** Parse and validate an untrusted worker command. */
export function parseWorkerCommand(value: unknown): WorkerCommand {
  const record = requireRecord(value, "command");
  if (record.protocolVersion !== PROTOCOL_VERSION) {
    throw new ProtocolError(
      "unsupported_protocol",
      `unsupported protocol version ${String(record.protocolVersion)}; expected ${String(PROTOCOL_VERSION)}`,
    );
  }
  const type = requireString(record.type, "command.type", { minLength: 1, maxLength: 32 });
  const commandId = requireString(record.commandId, "command.commandId", {
    minLength: 1,
    maxLength: MAX_PROTOCOL_ID_LENGTH,
  });
  switch (type) {
    case "START":
      return { protocolVersion: PROTOCOL_VERSION, type, commandId };
    case "PAUSE":
      return { protocolVersion: PROTOCOL_VERSION, type, commandId };
    case "REQUEST_SNAPSHOT":
      return { protocolVersion: PROTOCOL_VERSION, type, commandId };
    case "SHUTDOWN":
      return { protocolVersion: PROTOCOL_VERSION, type, commandId };
    case "STEP":
      return {
        protocolVersion: PROTOCOL_VERSION,
        type,
        commandId,
        ticks: requireInteger(record.ticks, "command.ticks", 1, MAX_STEP_TICKS),
      };
    case "SET_SPEED": {
      const daysPerSecond = requireFiniteNumber(
        record.daysPerSecond,
        "command.daysPerSecond",
      );
      if (!isSpeed(daysPerSecond)) {
        throw new ProtocolError(
          "invalid_speed",
          `command.daysPerSecond must be one of ${SPEED_VALUES.join(", ")}`,
        );
      }
      return { protocolVersion: PROTOCOL_VERSION, type, commandId, daysPerSecond };
    }
    case "APPLY_ACTION": {
      const actionId = requireString(record.actionId, "command.actionId", {
        minLength: 1,
        maxLength: MAX_PROTOCOL_ID_LENGTH,
      });
      return {
        protocolVersion: PROTOCOL_VERSION,
        type,
        commandId,
        actionId,
        action: parseAction(record.action),
      };
    }
    case "SAVE":
      return { protocolVersion: PROTOCOL_VERSION, type, commandId };
    case "LOAD":
      return {
        protocolVersion: PROTOCOL_VERSION,
        type,
        commandId,
        save: requireString(record.save, "command.save", {
          minLength: 1,
          maxLength: MAX_LOAD_SAVE_LENGTH,
        }),
      };
    default:
      throw new ProtocolError("unknown_command", `unknown command type ${JSON.stringify(type)}`);
  }
}

function isSnapshot(value: unknown): value is SimulationSnapshot {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    record.protocolVersion === PROTOCOL_VERSION &&
    typeof record.sequence === "number" &&
    Number.isInteger(record.sequence) &&
    typeof record.dayIndex === "number" &&
    Number.isInteger(record.dayIndex) &&
    typeof record.running === "boolean" &&
    typeof record.speedDaysPerSecond === "number" &&
    typeof record.scenarioId === "string" &&
    Array.isArray(record.countries) &&
    Array.isArray(record.regions) &&
    Array.isArray(record.markets) &&
    Array.isArray(record.goods) &&
    typeof record.date === "object" &&
    record.date !== null &&
    typeof record.diagnostics === "object" &&
    record.diagnostics !== null
  );
}

/** Parse an untrusted worker event in the app/transport boundary. */
export function parseWorkerEvent(value: unknown): WorkerEvent {
  const record = requireRecord(value, "event");
  if (record.protocolVersion !== PROTOCOL_VERSION) {
    throw new ProtocolError(
      "unsupported_protocol",
      `unsupported worker protocol ${String(record.protocolVersion)}`,
    );
  }
  const type = requireString(record.type, "event.type", { minLength: 1, maxLength: 32 });
  switch (type) {
    case "READY":
    case "SNAPSHOT": {
      if (!isSnapshot(record.snapshot)) {
        throw new ProtocolError("invalid_snapshot", "event.snapshot is not a valid snapshot");
      }
      return { protocolVersion: PROTOCOL_VERSION, type, snapshot: record.snapshot };
    }
    case "STATE":
      if (typeof record.running !== "boolean") {
        throw new ProtocolError("invalid_message", "event.running must be a boolean");
      }
      return {
        protocolVersion: PROTOCOL_VERSION,
        type,
        running: record.running,
        speedDaysPerSecond: requireFiniteNumber(
          record.speedDaysPerSecond,
          "event.speedDaysPerSecond",
        ),
      };
    case "ACTION_RESULT": {
      if (!isSnapshot(record.snapshot)) {
        throw new ProtocolError("invalid_snapshot", "event.snapshot is not a valid snapshot");
      }
      const errors = Array.isArray(record.errors)
        ? record.errors.map((error, index) => requireString(error, `event.errors[${String(index)}]`, { maxLength: 2_000 }))
        : (() => {
            throw new ProtocolError("invalid_message", "event.errors must be an array");
          })();
      return {
        protocolVersion: PROTOCOL_VERSION,
        type,
        actionId: requireString(record.actionId, "event.actionId", { minLength: 1 }),
        accepted: record.accepted === true,
        errors,
        snapshot: record.snapshot,
      };
    }
    case "SAVE_RESULT":
      return {
        protocolVersion: PROTOCOL_VERSION,
        type,
        commandId: requireString(record.commandId, "event.commandId", { minLength: 1 }),
        save: requireString(record.save, "event.save", {
          minLength: 1,
          maxLength: MAX_LOAD_SAVE_LENGTH,
        }),
      };
    case "LOAD_RESULT": {
      if (!isSnapshot(record.snapshot)) {
        throw new ProtocolError("invalid_snapshot", "event.snapshot is not a valid snapshot");
      }
      const errors = Array.isArray(record.errors)
        ? record.errors.map((error, index) => requireString(error, `event.errors[${String(index)}]`, { maxLength: 2_000 }))
        : (() => {
            throw new ProtocolError("invalid_message", "event.errors must be an array");
          })();
      return {
        protocolVersion: PROTOCOL_VERSION,
        type,
        commandId: requireString(record.commandId, "event.commandId", { minLength: 1 }),
        accepted: record.accepted === true,
        errors,
        snapshot: record.snapshot,
      };
    }
    case "ERROR":
      return {
        protocolVersion: PROTOCOL_VERSION,
        type,
        commandId:
          record.commandId === null
            ? null
            : requireString(record.commandId, "event.commandId", { minLength: 1 }),
        code: requireString(record.code, "event.code", { minLength: 1, maxLength: 64 }),
        message: requireString(record.message, "event.message", { minLength: 1, maxLength: 4_000 }),
      };
    case "FATAL":
      return {
        protocolVersion: PROTOCOL_VERSION,
        type,
        message: requireString(record.message, "event.message", { minLength: 1, maxLength: 4_000 }),
      };
    case "SHUTDOWN":
      return { protocolVersion: PROTOCOL_VERSION, type };
    default:
      throw new ProtocolError("unknown_event", `unknown event type ${JSON.stringify(type)}`);
  }
}
