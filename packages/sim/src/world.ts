/**
 * Authoritative world state.
 *
 * M1 fields remain. M2/M2.1 add a single-province population collection and
 * household accounts. M3a adds buildings, employment assignments, markets with
 * authoritative stock lots, and a minimal cash ledger. M3b adds the persisted
 * employment-dirty scheduling marker. M4a-1 adds category-aware accounts.
 * M4a-2 adds authoritative country, currency-issuer, monetary-arrangement, and
 * RUSD-relative valuation state. Later systems (debt, armies, events, history)
 * remain future milestones and are not invented here.
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
import { assertValidEconomyState } from "./economy/validation.js";
import { DEFAULT_MONEY_COEFFICIENTS, MONEY_COEFFICIENT_KEYS } from "./economy/constants.js";
import type { MoneyCoefficients } from "./economy/types.js";
import { assertValidTechnologyState } from "./economy/technology.js";
import type { EconomyValidationOptions } from "./economy/validation.js";
import { assertValidCountryAIPolicy, assertValidCountryAIStates } from "./economy/aiState.js";
import { assertValidProfitDistributionPolicy } from "./economy/profit.js";
import type {
  BuildingInstance,
  Country,
  CountryAIPolicy,
  ConstructionState,
  Currency,
  CurrencyValuation,
  EmploymentAssignment,
  FinanceState,
  Market,
  MilitaryState,
  PoliticsState,
  PriceIndexState,
  ProfitDistributionPolicy,
  MonetaryState,
  TechnologySystemState,
  TradeState,
} from "./economy/types.js";
import { assertValidPopulationState } from "./population/state.js";
import { assertValidTradeState } from "./economy/tradeState.js";
import {
  assertValidMonetaryState,
  assertValidPriceIndexState,
} from "./economy/monetaryState.js";
import { assertValidMilitaryState } from "./economy/militaryState.js";
import type { PopBlock, ProvinceEconomy } from "./population/types.js";
import type { ProvinceState } from "./provinces/types.js";
import { assertValidProvinceState, emptyProvinceState } from "./provinces/state.js";
import { emptyMilitaryState } from "./economy/militaryState.js";
import type { Day, Id, Seed } from "./types.js";
import {
  requireArray,
  requireInteger,
  requireRecord,
  requireString,
  requireUint32,
} from "./validation.js";
import { recordWorldValidation } from "./validationStats.js";

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

/** Authoritative world state. */
export interface World {
  schemaVersion: number;
  simVersion: string;
  dataVersion: string;
  scenarioId: string;
  /** Next civil day to process; 36,524 is the terminal boundary. */
  dayIndex: Day;
  /** First day represented by this scenario; annual ageing is skipped on it. */
  startDayIndex: Day;
  /** Unsigned 32-bit deterministic world seed. */
  seed: Seed;
  /** M2 supports at most one province; the collection is future-compatible. */
  provinceEconomies: ProvinceEconomy[];
  /** M4a-2 country identity. Empty for earlier population/economy fixtures. */
  countries: Country[];
  /** M4a-2 currency identity and issuer. */
  currencies: Currency[];
  /** M4a-2 RUSD-relative valuations, one per registered currency. */
  currencyValuations: CurrencyValuation[];
  popBlocks: PopBlock[];
  /** M3 building instances. Empty for population-only M2 worlds. */
  buildings: BuildingInstance[];
  /** M3 explicit employment assignments, maintained by the M3b refresh routine. */
  employment: EmploymentAssignment[];
  /**
   * True when an employment evaluation is required before the next economic
   * tick: initial scenario evaluation, building closure, or changed job capacity.
   * Monthly evaluation is derived from the civil calendar.
   */
  employmentDirty: boolean;
  /** M3 markets. Empty for population-only M2 worlds. */
  markets: Market[];
  /** M3 cash ledger accounts and bounded posting history. */
  finance: FinanceState;
  /** M5a provisional profit-allocation policy; disabled for legacy fixtures. */
  profitDistribution: ProfitDistributionPolicy;
  /** M6 country-AI enable policy; disabled for legacy fixtures. */
  countryAI: CountryAIPolicy;
  /** E3 public-construction project queue and bounded history. */
  construction: ConstructionState;
  /**
   * M8 political state and bounded scripted-event queue/log. A world whose
   * economy definitions carry no politics block has `enabled: false` and no M8
   * effects (D-076).
   */
  politics: PoliticsState;
  /** M9 technology-system policy. A world whose economy definitions carry no
   * technology block has `enabled: false` and no M9 effects (D-077). */
  technology: TechnologySystemState;
  /** E6a authored transport routes, in-transit shipments, and last-day report (D-079). */
  trade: TradeState;
  /** E6b price-index basket, base prices, and bounded month-end observations (D-080). */
  priceIndex: PriceIndexState;
  /** E6b monetary authorities and reserve-backed currency state (D-080). */
  monetary: MonetaryState;
  /** M10 diplomacy, armies, wars, and occupation (D-081). */
  military: MilitaryState;
  /**
   * M12a permanent provincial ownership, effective control, formal claims and
   * special administrative status. Disabled and empty for legacy scenarios.
   * Province geometry and names are static content and are not serialized.
   */
  provinces: ProvinceState;
  /**
   * Post-M7 designated player country. Null for legacy fixtures and for worlds
   * with no player-control designation. The AI skips fiscal decisions for this
   * country; player actions still use the shared validator/application path.
   */
  playerCountryId: Id | null;
  /** P2b scenario money coefficients (D-135); defaults to the pre-P2b constants. */
  moneyCoefficients: MoneyCoefficients;
  diagnostics: SimulationDiagnostics;
}

/** Validate the P2b money coefficients: every listed coefficient is a positive finite RUSD amount. */
export function assertValidMoneyCoefficients(value: MoneyCoefficients, path: string): void {
  if (value === null || typeof value !== "object") throw new TypeError(`${path} must be an object`);
  const keys = Object.keys(value);
  if (keys.length !== MONEY_COEFFICIENT_KEYS.length) {
    throw new RangeError(`${path} must have exactly the ${String(MONEY_COEFFICIENT_KEYS.length)} money coefficients`);
  }
  for (const key of MONEY_COEFFICIENT_KEYS) {
    const amount = value[key];
    if (typeof amount !== "number" || !Number.isFinite(amount) || !(amount > 0)) {
      throw new RangeError(`${path}.${key} must be a positive finite RUSD amount`);
    }
  }
}

/** Options accepted by `createInitialWorld` and `createPopulationWorld`. */
export interface CreateWorldOptions {
  readonly seed?: Seed;
  readonly scenarioId?: string;
  readonly startDayIndex?: Day;
  /**
   * Internal construction control. Economy worlds defer opening-balance
   * application until every account (buildings, system) exists, then apply the
   * complete opening set exactly once.
   */
  readonly deferOpeningBalances?: boolean;
  /** Internal construction control: first derived account id to allocate. */
  readonly accountIdFloor?: number;
  /**
   * Internal construction control. M4c fiscal accounts are created only for
   * worlds that declare countries; countryless M2/M3 fixtures have no fiscal
   * system and retain their original owner account set.
   */
  readonly fiscalAccounts?: boolean;
  /**
   * Internal construction control. The public M2 path still creates exactly one
   * province; integrated economy construction passes true so a scenario may author
   * several provinces.
   */
  readonly allowMultipleProvinces?: boolean;
}

/** Create an empty M2-schema world at 1900-01-01. */
export function createInitialWorld(options: CreateWorldOptions = {}): World {
  const seed = options.seed ?? 0;
  const scenarioId = options.scenarioId ?? DEFAULT_SCENARIO_ID;
  const startDayIndex = options.startDayIndex ?? 0;

  requireUint32(seed, "seed");
  requireString(scenarioId, "scenarioId", {
    minLength: 1,
    maxLength: MAX_SCENARIO_ID_LENGTH,
  });
  assertValidDayIndex(startDayIndex);

  const world: World = {
    schemaVersion: WORLD_SCHEMA_VERSION,
    simVersion: SIM_VERSION,
    dataVersion: DEFAULT_DATA_VERSION,
    scenarioId,
    dayIndex: startDayIndex,
    startDayIndex,
    seed,
    provinceEconomies: [],
    countries: [],
    currencies: [],
    currencyValuations: [],
    popBlocks: [],
    buildings: [],
    employment: [],
    employmentDirty: false,
    markets: [],
    finance: {
      accounts: [],
      postings: [],
      nextPostingId: 1,
      nextAccountId: 1,
      opening: null,
      periodSummaries: [],
      annualSummaries: [],
      corrections: [],
      nextCorrectionId: 1,
      closedThroughDay: null,
      debtContracts: [],
      debtHistory: [],
      nextContractId: 1,
      budgetMemosThisMonth: {},
    },
    profitDistribution: {
      enabled: false,
      privatePayoutRate: 0.5,
      stateRemittanceRate: 1,
    },
    countryAI: { enabled: false },
    construction: {
      projects: [],
      history: [],
      nextProjectId: 1,
      nextBuildingId: 1,
    },
    politics: {
      enabled: false,
      eventQueue: [],
      eventLog: [],
      nextEventId: 1,
      nextLogId: 1,
    },
    technology: { enabled: false },
    trade: {
      enabled: false,
      routes: [],
      shipments: [],
      nextShipmentId: 1,
      lastDispatchDay: null,
      lastDay: null,
    },
    priceIndex: {
      basket: [],
      basePrices: [],
      observations: [],
      lastObservationDay: null,
    },
    monetary: {
      enabled: false,
      currencies: [],
      lastUpdateDay: null,
    },
    military: emptyMilitaryState(),
    provinces: emptyProvinceState(),
    playerCountryId: null,
    moneyCoefficients: { ...DEFAULT_MONEY_COEFFICIENTS },
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
 * Phase-level validation control for the staged integrated day.
 *
 * Public phase entry points validate the whole world by default. The integrated
 * `runEconomicDay` pipeline passes `validateWorld: false` because it has already
 * validated the world at the day boundary and publishes only after the caller
 * revalidates the complete staged world. Phase-specific checks (reservation
 * shape, inventory conservation, accounting identity, posting structure,
 * revaluation, and rollback) always remain active.
 */
export interface PhaseValidationOptions {
  readonly validateWorld?: boolean;
  /**
   * D-137: the caller owns the phase's atomicity. Inside the integrated economic day
   * the staged-day clone, or the D-116 rollback runner, restores the whole world when
   * any phase fails, so a phase writes `world.finance` in place instead of staging its
   * postings on a copy (`phaseFinance`). Direct callers keep the staged copy and its
   * guarantee that a failed phase leaves finance untouched.
   */
  readonly financeInPlace?: boolean;
}

/**
 * Validate all authoritative world fields and their relationships.
 *
 * This is intentionally strict: it is called before every tick and before save
 * encoding. It never clamps or repairs values.
 */
export function assertValidWorld(
  world: World,
  options: EconomyValidationOptions = {},
): void {
  recordWorldValidation();
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
  requireString(world.scenarioId, "world.scenarioId", {
    minLength: 1,
    maxLength: MAX_SCENARIO_ID_LENGTH,
  });
  assertValidDayIndex(world.dayIndex);
  assertValidDayIndex(world.startDayIndex);
  if (world.startDayIndex > world.dayIndex) {
    throw new RangeError("world.startDayIndex must not be after world.dayIndex");
  }
  requireUint32(world.seed, "world.seed");
  if (typeof world.employmentDirty !== "boolean") {
    throw new TypeError("world.employmentDirty must be a boolean");
  }
  assertValidProfitDistributionPolicy(world.profitDistribution, "world.profitDistribution");
  assertValidCountryAIPolicy(world.countryAI, "world.countryAI");
  assertValidCountryAIStates(world.countries);
  assertValidMoneyCoefficients(world.moneyCoefficients, "world.moneyCoefficients");
  if (world.playerCountryId !== null) {
    const playerCountryId = requireUint32(world.playerCountryId, "world.playerCountryId");
    if (!world.countries.some((country) => country.id === playerCountryId)) {
      throw new RangeError(
        `world.playerCountryId ${String(playerCountryId)} is not a registered country`,
      );
    }
  }

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

  assertValidPopulationState(world);
  assertValidEconomyState(world, options);
  assertValidTechnologyState(world);
  assertValidTradeState(world);
  assertValidPriceIndexState(world);
  assertValidMonetaryState(world);
  assertValidMilitaryState(world);
  assertValidProvinceState(world.provinces);
}

/**
 * Hot-path validation used inside the tick pipeline.
 *
 * Immutable closed-period summaries are validated completely at creation,
 * save/load, and close boundaries, but only the newest summary and its links are
 * revalidated before publication on every tick. This keeps per-tick validation
 * from growing with the century-long summary history (D-059).
 */
export function assertValidWorldForTick(
  world: World,
  options: EconomyValidationOptions = {},
): void {
  assertValidWorld(world, { ...options, periodSummaries: "latest" });
}

/** True when the world has reached the terminal boundary and no day remains. */
export function isCampaignComplete(world: World): boolean {
  return world.dayIndex === CAMPAIGN_TERMINAL_DAY_INDEX;
}

/** Numeric IDs are stable non-negative integers. */
export function isValidId(id: number): id is Id {
  return Number.isInteger(id) && id >= 0 && id <= 0xffff_ffff;
}
