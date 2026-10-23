/**
 * Minimal authoritative world state for M1.
 *
 * M1 intentionally does not define countries, regions, population, markets,
 * buildings, or finance state. Those contracts are introduced with their
 * milestones so M1 cannot accidentally grow speculative economy behavior. The
 * fields below are the complete authoritative state needed to serialize, restore,
 * and continue the no-op tick driver deterministically.
 *
 * The M1 world contains no dense numeric arrays yet. The serializer nevertheless
 * keeps an explicit tagged typed-array codec, tested in isolation, because later
 * milestones will store dense population/market data as typed arrays. Diagnostics
 * here are scalar counters and a bounded warning list only; no per-day history is
 * stored.
 */

import { assertValidDayIndex } from "./calendar.js";
import {
  CAMPAIGN_TERMINAL_DAY_INDEX,
  DEFAULT_DATA_VERSION,
  DEFAULT_SCENARIO_ID,
  MAX_RECENT_WARNINGS,
  MAX_SCENARIO_ID_LENGTH,
  MAX_WARNING_LENGTH,
  SIM_VERSION,
  WORLD_SCHEMA_VERSION,
} from "./constants.js";
import type { Day, Id, Seed } from "./types.js";
import {
  requireArray,
  requireInteger,
  requireRecord,
  requireString,
  requireUint32,
} from "./validation.js";

/** Diagnostic counters and bounded buffers. None of these affect game outcomes. */
export interface SimulationDiagnostics {
  /** Number of detected invariant failures. */
  invariantFailureCount: number;
  /** Number of rejected player/AI actions. */
  invalidActionCount: number;
  /** Number of scheduled effects applied. */
  eventApplicationCount: number;
  /** Bounded recent warning messages. */
  recentWarnings: string[];
}

/** Authoritative M1 world state. */
export interface World {
  /** Save/world schema version. */
  schemaVersion: number;
  /** Simulation behavior version. */
  simVersion: string;
  /** Static content/data version. */
  dataVersion: string;
  /** Scenario identifier. */
  scenarioId: string;
  /** Next civil day to process; 36,524 is the terminal boundary. */
  dayIndex: Day;
  /** Unsigned 32-bit deterministic world seed. */
  seed: Seed;
  /** Diagnostic state. */
  diagnostics: SimulationDiagnostics;
}

/** Options accepted by `createInitialWorld`. */
export interface CreateWorldOptions {
  readonly seed?: Seed;
  readonly scenarioId?: string;
}

/** Create a new M1 world at 1900-01-01. */
export function createInitialWorld(options: CreateWorldOptions = {}): World {
  const seed = options.seed ?? 0;
  const scenarioId = options.scenarioId ?? DEFAULT_SCENARIO_ID;

  requireUint32(seed, "seed");
  requireString(scenarioId, "scenarioId", {
    minLength: 1,
    maxLength: MAX_SCENARIO_ID_LENGTH,
  });

  const world: World = {
    schemaVersion: WORLD_SCHEMA_VERSION,
    simVersion: SIM_VERSION,
    dataVersion: DEFAULT_DATA_VERSION,
    scenarioId,
    dayIndex: 0,
    seed,
    diagnostics: {
      invariantFailureCount: 0,
      invalidActionCount: 0,
      eventApplicationCount: 0,
      recentWarnings: [],
    },
  };

  assertValidWorld(world);
  return world;
}

/**
 * Validate all authoritative world fields and their relationships.
 *
 * This is intentionally strict: it is called before every tick and before save
 * encoding, so corrupt or impossible state cannot silently propagate. It never
 * clamps or repairs values.
 */
export function assertValidWorld(world: World): void {
  requireInteger(
    world.schemaVersion,
    "world.schemaVersion",
    WORLD_SCHEMA_VERSION,
    WORLD_SCHEMA_VERSION,
  );
  requireString(world.simVersion, "world.simVersion", { minLength: 1 });
  if (world.simVersion !== SIM_VERSION) {
    throw new RangeError(
      `world.simVersion ${JSON.stringify(world.simVersion)} is incompatible with ${JSON.stringify(SIM_VERSION)}`,
    );
  }
  requireString(world.dataVersion, "world.dataVersion", {
    minLength: 1,
    maxLength: MAX_SCENARIO_ID_LENGTH,
  });
  if (world.dataVersion !== DEFAULT_DATA_VERSION) {
    throw new RangeError(
      `world.dataVersion ${JSON.stringify(world.dataVersion)} is incompatible with ${JSON.stringify(DEFAULT_DATA_VERSION)}`,
    );
  }
  requireString(world.scenarioId, "world.scenarioId", {
    minLength: 1,
    maxLength: MAX_SCENARIO_ID_LENGTH,
  });
  assertValidDayIndex(world.dayIndex);
  requireUint32(world.seed, "world.seed");

  const diagnostics = requireRecord(world.diagnostics, "world.diagnostics");
  requireInteger(
    diagnostics.invariantFailureCount,
    "world.diagnostics.invariantFailureCount",
    0,
    Number.MAX_SAFE_INTEGER,
  );
  requireInteger(
    diagnostics.invalidActionCount,
    "world.diagnostics.invalidActionCount",
    0,
    Number.MAX_SAFE_INTEGER,
  );
  requireInteger(
    diagnostics.eventApplicationCount,
    "world.diagnostics.eventApplicationCount",
    0,
    Number.MAX_SAFE_INTEGER,
  );

  const warnings = requireArray(diagnostics.recentWarnings, "world.diagnostics.recentWarnings");
  if (warnings.length > MAX_RECENT_WARNINGS) {
    throw new RangeError(
      `world.diagnostics.recentWarnings must contain at most ${MAX_RECENT_WARNINGS} entries`,
    );
  }
  for (let index = 0; index < warnings.length; index += 1) {
    requireString(warnings[index], `world.diagnostics.recentWarnings[${String(index)}]`, {
      maxLength: MAX_WARNING_LENGTH,
    });
  }
}

/** True when the world has reached the terminal boundary and no day remains. */
export function isCampaignComplete(world: World): boolean {
  return world.dayIndex === CAMPAIGN_TERMINAL_DAY_INDEX;
}

/** Numeric IDs are stable non-negative integers. Kept here for future subsystems. */
export function isValidId(id: number): id is Id {
  return Number.isInteger(id) && id >= 0 && id <= 0xffff_ffff;
}
