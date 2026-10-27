/**
 * Versioned Century worker protocol and immutable UI snapshot contract.
 *
 * This module is intentionally free of simulation, Node, React Native, and DOM
 * imports. The app may import it directly; it contains only plain data contracts,
 * protocol constants, and runtime validation of untrusted messages.
 */

export const PROTOCOL_VERSION = 2 as const;
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
  | { readonly protocolVersion: 2; readonly type: "START"; readonly commandId: string }
  | { readonly protocolVersion: 2; readonly type: "PAUSE"; readonly commandId: string }
  | {
      readonly protocolVersion: 2;
      readonly type: "STEP";
      readonly commandId: string;
      readonly ticks: number;
    }
  | {
      readonly protocolVersion: 2;
      readonly type: "SET_SPEED";
      readonly commandId: string;
      readonly daysPerSecond: SpeedDaysPerSecond;
    }
  | {
      readonly protocolVersion: 2;
      readonly type: "APPLY_ACTION";
      readonly commandId: string;
      readonly actionId: string;
      readonly action: FiscalPolicyActionDto;
    }
  | {
      readonly protocolVersion: 2;
      readonly type: "REQUEST_SNAPSHOT";
      readonly commandId: string;
    }
  | { readonly protocolVersion: 2; readonly type: "SAVE"; readonly commandId: string }
  | {
      readonly protocolVersion: 2;
      readonly type: "LOAD";
      readonly commandId: string;
      readonly save: string;
    }
  | { readonly protocolVersion: 2; readonly type: "SHUTDOWN"; readonly commandId: string };

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
  readonly protocolVersion: 2;
  readonly sequence: number;
  readonly dayIndex: number;
  readonly date: SnapshotCivilDate;
  readonly running: boolean;
  readonly speedDaysPerSecond: number;
  /**
   * Measured recent throughput. It is presentation-only: it is derived from the
   * worker clock and never affects deterministic simulation state. Zero while
   * paused or before the first measured window.
   */
  readonly achievedDaysPerSecond: number;
  /** True because the selected speed is a target, not a guaranteed rate. */
  readonly speedIsBestEffort: boolean;
  readonly campaignComplete: boolean;
  readonly scenarioId: string;
  readonly dataVersion: string;
  readonly simVersion: string;
  /** Designated player country, or null when no player control is configured. */
  readonly playerCountryId: number | null;
  readonly countries: readonly CountrySnapshot[];
  readonly regions: readonly RegionSnapshot[];
  readonly markets: readonly MarketSnapshot[];
  readonly goods: readonly GoodSnapshot[];
  readonly diagnostics: SnapshotDiagnostics;
}

export type WorkerEvent =
  | { readonly protocolVersion: 2; readonly type: "READY"; readonly snapshot: SimulationSnapshot }
  | {
      readonly protocolVersion: 2;
      readonly type: "SNAPSHOT";
      readonly commandId: string | null;
      readonly snapshot: SimulationSnapshot;
    }
  | {
      readonly protocolVersion: 2;
      readonly type: "STATE";
      readonly commandId: string | null;
      readonly running: boolean;
      readonly speedDaysPerSecond: number;
      readonly achievedDaysPerSecond: number;
    }
  | {
      readonly protocolVersion: 2;
      readonly type: "ACTION_RESULT";
      readonly commandId: string;
      readonly actionId: string;
      readonly accepted: boolean;
      readonly errors: readonly string[];
      readonly snapshot: SimulationSnapshot;
    }
  | {
      readonly protocolVersion: 2;
      readonly type: "SAVE_RESULT";
      readonly commandId: string;
      readonly save: string;
    }
  | {
      readonly protocolVersion: 2;
      readonly type: "LOAD_RESULT";
      readonly commandId: string;
      readonly accepted: boolean;
      readonly errors: readonly string[];
      readonly snapshot: SimulationSnapshot;
    }
  | {
      readonly protocolVersion: 2;
      readonly type: "ERROR";
      readonly commandId: string | null;
      readonly code: string;
      readonly message: string;
    }
  | { readonly protocolVersion: 2; readonly type: "FATAL"; readonly message: string }
  | {
      readonly protocolVersion: 2;
      readonly type: "SHUTDOWN";
      readonly commandId: string | null;
    };

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown, maxLength = 512): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isIntegerIn(value: unknown, min: number, max: number): value is number {
  return isFiniteNumber(value) && Number.isInteger(value) && value >= min && value <= max;
}

function isNullableId(value: unknown): value is number | null {
  return value === null || isIntegerIn(value, 0, 0xffff_ffff);
}

function isNumberArray(value: unknown): value is readonly number[] {
  return Array.isArray(value) && value.every((entry) => isIntegerIn(entry, 0, 0xffff_ffff));
}

function isFiscalTotals(value: unknown): value is SnapshotFiscalTotals {
  if (!isRecord(value)) return false;
  return (
    isIntegerIn(value.periodStartDay, 0, 36_524) &&
    isIntegerIn(value.periodEndDay, 0, 36_524) &&
    isFiniteNumber(value.incomeTaxSUSD) &&
    isFiniteNumber(value.welfareExpenseSUSD) &&
    isFiniteNumber(value.interestExpenseSUSD) &&
    isFiniteNumber(value.netFiscalResultSUSD)
  );
}

function isFinancePeriod(value: unknown): value is SnapshotFinancePeriod {
  if (!isFiscalTotals(value)) return false;
  const record = value as unknown as Record<string, unknown>;
  if (!isRecord(record.grossFlowTotals)) return false;
  return Object.values(record.grossFlowTotals).every((entry) => isFiniteNumber(entry));
}

function isCountrySnapshot(value: unknown): value is CountrySnapshot {
  if (!isRecord(value)) return false;
  if (!isIntegerIn(value.id, 0, 0xffff_ffff)) return false;
  if (!isString(value.tag, 32) || !isString(value.name, 256)) return false;
  if (!isNumberArray(value.regionIds)) return false;
  if (!isRecord(value.fiscal)) return false;
  if (!isFiniteNumber(value.fiscal.incomeTaxRate)) return false;
  if (!isFiniteNumber(value.fiscal.welfareBudgetSUSDPerYear)) return false;
  if (!isFiniteNumber(value.treasuryCashSUSD)) return false;
  if (typeof value.debtEnabled !== "boolean") return false;
  if (!isFiniteNumber(value.debtOutstandingPrincipalSUSD)) return false;
  if (!isFiniteNumber(value.population)) return false;
  if (!isFiniteNumber(value.workingAgePopulation)) return false;
  if (!isFiniteNumber(value.employedWorkers)) return false;
  if (!isFiniteNumber(value.literacy)) return false;
  if (!isFiniteNumber(value.wealthLevel)) return false;
  if (!isFiniteNumber(value.militancy)) return false;
  if (!isFiniteNumber(value.hardshipPopulationShare)) return false;
  if (!isIntegerIn(value.blocksWithUnmetSubsistence, 0, 1_000_000)) return false;
  if (!isIntegerIn(value.blocksWithUnmetBasic, 0, 1_000_000)) return false;
  if (!isIntegerIn(value.buildingCount, 0, 1_000_000)) return false;
  if (value.latestFiscal !== null && !isFiscalTotals(value.latestFiscal)) return false;
  if (!Array.isArray(value.financeHistory)) return false;
  return value.financeHistory.every((period) => isFinancePeriod(period));
}

function isRegionSnapshot(value: unknown): value is RegionSnapshot {
  if (!isRecord(value)) return false;
  return (
    isIntegerIn(value.id, 0, 0xffff_ffff) &&
    isString(value.key, 128) &&
    isString(value.name, 256) &&
    isNullableId(value.countryId) &&
    isNullableId(value.marketId) &&
    isFiniteNumber(value.population) &&
    isIntegerIn(value.buildingCount, 0, 1_000_000)
  );
}

function isGoodSnapshot(value: unknown): value is GoodSnapshot {
  if (!isRecord(value)) return false;
  return (
    isIntegerIn(value.id, 0, 0xffff_ffff) &&
    isString(value.key, 64) &&
    isString(value.name, 256) &&
    isString(value.unitLabel, 64) &&
    isString(value.category, 64)
  );
}

function isMarketSnapshot(value: unknown): value is MarketSnapshot {
  if (!isRecord(value)) return false;
  if (!isIntegerIn(value.id, 0, 0xffff_ffff)) return false;
  if (!isString(value.label, 256)) return false;
  if (!isNumberArray(value.regionIds)) return false;
  if (!Array.isArray(value.prices)) return false;
  return value.prices.every((price) => {
    if (!isRecord(price)) return false;
    return (
      isIntegerIn(price.goodId, 0, 0xffff_ffff) &&
      isString(price.goodKey, 64) &&
      isString(price.goodName, 256) &&
      isString(price.unitLabel, 64) &&
      isFiniteNumber(price.priceSUSD) &&
      isFiniteNumber(price.stockQuantity)
    );
  });
}

function isDiagnostics(value: unknown): value is SnapshotDiagnostics {
  if (!isRecord(value)) return false;
  return (
    isIntegerIn(value.invalidActionCount, 0, Number.MAX_SAFE_INTEGER) &&
    isIntegerIn(value.invariantFailureCount, 0, Number.MAX_SAFE_INTEGER) &&
    Array.isArray(value.recentWarnings) &&
    value.recentWarnings.every((warning) => isString(warning, 1_000))
  );
}

function isSnapshot(value: unknown): value is SimulationSnapshot {
  if (!isRecord(value)) return false;
  if (value.protocolVersion !== PROTOCOL_VERSION) return false;
  if (!isIntegerIn(value.sequence, 0, Number.MAX_SAFE_INTEGER)) return false;
  if (!isIntegerIn(value.dayIndex, 0, 36_524)) return false;
  if (!isRecord(value.date)) return false;
  if (
    !isIntegerIn(value.date.year, 1900, 2000) ||
    !isIntegerIn(value.date.month, 1, 12) ||
    !isIntegerIn(value.date.day, 1, 31) ||
    !isString(value.date.label, 10)
  ) {
    return false;
  }
  if (typeof value.running !== "boolean") return false;
  if (!isFiniteNumber(value.speedDaysPerSecond) || !isSpeed(value.speedDaysPerSecond)) {
    return false;
  }
  if (!isFiniteNumber(value.achievedDaysPerSecond) || value.achievedDaysPerSecond < 0) {
    return false;
  }
  if (typeof value.speedIsBestEffort !== "boolean") return false;
  if (typeof value.campaignComplete !== "boolean") return false;
  if (!isString(value.scenarioId, 128)) return false;
  if (!isString(value.dataVersion, 128)) return false;
  if (!isString(value.simVersion, 128)) return false;
  if (!isNullableId(value.playerCountryId)) return false;
  if (!Array.isArray(value.countries) || !value.countries.every(isCountrySnapshot)) return false;
  if (
    value.playerCountryId !== null &&
    !value.countries.some((country) => country.id === value.playerCountryId)
  ) {
    return false;
  }
  if (!Array.isArray(value.regions) || !value.regions.every(isRegionSnapshot)) return false;
  if (!Array.isArray(value.markets) || !value.markets.every(isMarketSnapshot)) return false;
  if (!Array.isArray(value.goods) || !value.goods.every(isGoodSnapshot)) return false;
  return isDiagnostics(value.diagnostics);
}

function parseNullableCommandId(value: unknown, path: string): string | null {
  return value === null
    ? null
    : requireString(value, path, { minLength: 1, maxLength: MAX_PROTOCOL_ID_LENGTH });
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
    case "READY": {
      if (!isSnapshot(record.snapshot)) {
        throw new ProtocolError("invalid_snapshot", "event.snapshot is not a valid snapshot");
      }
      return { protocolVersion: PROTOCOL_VERSION, type, snapshot: record.snapshot };
    }
    case "SNAPSHOT": {
      if (!isSnapshot(record.snapshot)) {
        throw new ProtocolError("invalid_snapshot", "event.snapshot is not a valid snapshot");
      }
      return {
        protocolVersion: PROTOCOL_VERSION,
        type,
        commandId: parseNullableCommandId(record.commandId, "event.commandId"),
        snapshot: record.snapshot,
      };
    }
    case "STATE":
      if (typeof record.running !== "boolean") {
        throw new ProtocolError("invalid_message", "event.running must be a boolean");
      }
      return {
        protocolVersion: PROTOCOL_VERSION,
        type,
        commandId: parseNullableCommandId(record.commandId, "event.commandId"),
        running: record.running,
        speedDaysPerSecond: requireFiniteNumber(
          record.speedDaysPerSecond,
          "event.speedDaysPerSecond",
        ),
        achievedDaysPerSecond: requireFiniteNumber(
          record.achievedDaysPerSecond,
          "event.achievedDaysPerSecond",
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
        commandId: requireString(record.commandId, "event.commandId", { minLength: 1 }),
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
      return {
        protocolVersion: PROTOCOL_VERSION,
        type,
        commandId: parseNullableCommandId(record.commandId, "event.commandId"),
      };
    default:
      throw new ProtocolError("unknown_event", `unknown event type ${JSON.stringify(type)}`);
  }
}
