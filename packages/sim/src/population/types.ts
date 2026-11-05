/**
 * M2 population state, static definitions, fixture inputs, and explicit results.
 *
 * Runtime state is deliberately separate from static definitions. Definitions
 * live in the data package and are passed through `TickContext`; they are not
 * serialized into `World`. Only `scenarioId`/`dataVersion` are stored in the
 * world so a save can be matched to the same definitions.
 */

import type { Day, Id, MoneyRUSD, Rate } from "../types.js";
import type { EconomyDefinitions } from "../economy/types.js";
import type { NeedTier } from "./constants.js";

export type {
  FinanceState,
  FinancialAccount,
  JournalLine,
  JournalPosting,
} from "../economy/types.js";

/**
 * P2 population, economic and social state of one permanent province (D-118).
 *
 * `id` is the permanent province id shared with `ProvinceOwnership` and the map
 * bundle. Political facts (legal owner, effective controller, claims, special
 * status) live only on `World.provinces.ownership`; this record holds what lives
 * in the province: its population blocks, buildings, unrest, infrastructure, land
 * and urban share. Country territory is derived from ownership, never stored here.
 */
export interface ProvinceEconomy {
  id: Id;
  key: string;
  name: string;
  popBlockIds: Id[];
  /**
   * The province's market: the customs territory of its owner (D-119). Null only for
   * population-only worlds with no market. Validated against the owner's territory
   * and rewritten only by a validated provincial transfer.
   */
  marketId: Id | null;
  buildingInstanceIds: Id[];
  /** M8 provincial unrest, 0..1; updated daily by the politics phase. */
  unrest: Rate;
  /** M8 provisional provincial infrastructure quality, 0..1. */
  infrastructure: Rate;
  /** P2 cropland on 1 January 1900 (HYDE 3.3), hectares; static until P5. */
  arableLandHa: number;
  /** P2 pasture and rangeland on 1 January 1900 (HYDE 3.3), hectares; static until P5. */
  pastureHa: number;
  /** P2 urban share of the 1900 population (HYDE 3.3), 0..1; static until P4/P7. */
  urbanShare: Rate;
  /**
   * P2b annual wage in RUSD per worker, indexed by profession id (D-135). Empty means
   * the profession's `baseWage1900RUSDPerYear` applies (legacy fixtures). Authored from
   * the sourced 1900 wage table and read-only until the P7 labour market adjusts it.
   */
  wageRUSDPerYearByProfession: number[];
}

/** Authoritative population block state. */
export interface PopBlock {
  id: Id;
  provinceId: Id;
  professionId: Id;

  /** Male persons by single year of age: 0..79, then open-ended 80+. */
  maleByAge: Uint32Array;
  /** Female persons by single year of age: 0..79, then open-ended 80+. */
  femaleByAge: Uint32Array;

  literacy: Rate;
  /**
   * M9 authoritative single-year literacy, 81 slots (0..79 plus 80+). `literacy`
   * is the derived population-weighted rate of ages 15+ and must equal the
   * aggregate of this array (D-077).
   */
  literacyByAge: number[];
  /**
   * E5 authoritative vocational qualification rate, 0..1, over the block's
   * working-age people. It is built only by the funded training service and drives
   * the wage and labour-productivity premiums (D-078). Initialised to zero because
   * no source-backed qualification series exists.
   */
  qualification: Rate;
  wealthLevel: number;
  financialAccountId: Id;
  militancy: Rate;

  /** Consecutive days with unmet subsistence needs. */
  unmetSubsistenceDays: number;
  /** Consecutive days with unmet basic needs. */
  unmetBasicDays: number;
  /** Consecutive days with fully met, active comfort needs. */
  comfortFulfilledDays: number;

  /** Fractional person remainder for total births. */
  fractionalBirthRemainder: number;
  /** Fractional remainder for allocating births to male vs female. */
  fractionalMaleBirthRemainder: number;
  /** Fractional person remainder for deaths. */
  fractionalDeathRemainder: number;

  // P4 cause-driven demography (D-124, D-142). Levels are dimensionless
  // multipliers of the definitions' WPP 1950 standard schedule (the age pattern).
  /**
   * Share of the block living in towns, 0..1 (HYDE 3.3, D-121). Fixed until the P7
   * labour market moves people between town and country; migrants join the
   * destination block's settlement pattern.
   */
  urbanShare: Rate;
  /**
   * Persistent factors the model does not simulate (marriage pattern, breastfeeding,
   * disease environment), fixed at world creation so the 1900 levels equal their
   * sources: residual = sourced 1900 level ÷ cause factors at the start. Never
   * changes and never accumulates.
   */
  fertilityResidual: number;
  childMortalityResidual: number;
  adultMortalityResidual: number;
  /** Effective child-mortality multiplier smoothed over `CHILD_MORTALITY_LAG_MONTHS`. */
  childMortalityLagged: number;
  /**
   * Dietary energy actually consumed ÷ requirement, capped at 1 (saturation of the
   * requirement, not a repair) and smoothed over `FOOD_SUFFICIENCY_SMOOTHING_DAYS`.
   */
  foodSufficiency: Rate;
}

export interface NeedItemDef {
  /** Stable GDD good key; M3 maps this to a goods definition. */
  goodKey: string;
  /** Physical units per person per day. */
  quantityPerCapitaPerDay: number;
}

export interface NeedTierDef {
  tier: NeedTier;
  items: readonly NeedItemDef[];
  /** Need tier activates when wealthLevel >= this value. */
  activationWealthMin: number;
}

/**
 * P4 (D-124): the age *pattern* of fertility and mortality. Levels are per-block
 * state derived from causes; this schedule only shapes them across ages and sexes.
 */
export interface StandardDemographicSchedule {
  /** Source year of the schedule (WPP 2024 world, 1950). */
  sourceYear: number;
  /** 17 annual central death rates per 1,000 males in each five-year band. */
  maleAnnualDeathsPer1000ByAgeBand: readonly number[];
  /** 17 annual central death rates per 1,000 females in each five-year band. */
  femaleAnnualDeathsPer1000ByAgeBand: readonly number[];
  /** Seven annual ASFRs per 1,000 women, ages 15-19 through 45-49. */
  ageSpecificBirthsPer1000Women: readonly number[];
}

/** P4: dietary energy of one physical unit of a food good. */
export interface FoodEnergyDef {
  goodKey: string;
  /** Kilocalories per physical unit of the good (its `unitLabel`). */
  kcalPerUnit: number;
}

export interface FertilityMultiplierDef {
  professionId: Id;
  multiplier: number;
}

export interface ProfessionIdentityDef {
  id: Id;
  key: string;
  name: string;
  stratum: "lower" | "middle" | "upper";
}

export interface PopulationDefinitions {
  dataVersion: string;
  scenarioId: string;
  needs: readonly NeedTierDef[];
  /** P4 age pattern of fertility and mortality (D-124). */
  standardSchedule: StandardDemographicSchedule;
  /** P4 dietary energy of the food goods; goods absent here provide none. */
  foodEnergy: readonly FoodEnergyDef[];
  /** Male births per one female birth; provisional unless sourced. */
  sexRatioAtBirth: number;
  fertilityMultipliers: readonly FertilityMultiplierDef[];
}

export interface PopBlockInitialDef {
  id: Id;
  provinceId: Id;
  professionId: Id;
  financialAccountId: Id;
  /** Male population in 17 five-year bands; expanded to single years at creation. */
  maleAgeGroups: readonly number[];
  /** Female population in 17 five-year bands; expanded to single years at creation. */
  femaleAgeGroups: readonly number[];
  literacy: Rate;
  wealthLevel: number;
  initialSavingsRUSD: MoneyRUSD;
  militancy: Rate;
  /**
   * P4 sourced 1900 demography of the block (D-142). Absent fields default to the
   * standard schedule (levels 1) and a rural block.
   */
  demography?: PopBlockDemographyInitialDef;
}

/** P4 initial demographic levels of one block. */
export interface PopBlockDemographyInitialDef {
  /** Urban share 0..1. */
  urbanShare?: Rate;
  /** TFR ÷ standard TFR at the start. */
  fertilityLevel?: number;
  /** Effective child (0–4) death-rate multiplier at the start, food sufficient. */
  childMortalityLevel?: number;
  /** Effective adult (5+) death-rate multiplier at the start, food sufficient. */
  adultMortalityLevel?: number;
}

export interface ProvinceEconomyInitialDef {
  /** Permanent province id. */
  id: Id;
  key: string;
  name: string;
  /** M8 provisional infrastructure quality, 0..1; defaults to 0.5. */
  infrastructure?: Rate;
  /** Cropland in hectares; defaults to 0. */
  arableLandHa?: number;
  /** Pasture and rangeland in hectares; defaults to 0. */
  pastureHa?: number;
  /** Urban share of the population, 0..1; defaults to 0. */
  urbanShare?: Rate;
  /** P2b annual wage per worker by profession id, RUSD; defaults to empty (profession wages). */
  wageRUSDPerYearByProfession?: readonly number[];
}

export interface PopulationScenarioDef {
  dataVersion: string;
  scenarioId: string;
  /** Optional non-1900 validation start; defaults to day 0. */
  startDayIndex?: Day;
  professions: readonly ProfessionIdentityDef[];
  provinceEconomies: readonly ProvinceEconomyInitialDef[];
  popBlocks: readonly PopBlockInitialDef[];
  definitions: PopulationDefinitions;
}

export interface GoodPriceInput {
  goodKey: string;
  unitPriceRUSD: number;
}

export interface GoodSupplyInput {
  goodKey: string;
  availableQuantityPerCapita: number;
}

export interface PopBlockIncomeInput {
  popBlockId: Id;
  annualSettledIncomePerCapitaRUSD: number;
  annualMandatoryPaymentsPerCapitaRUSD: number;
}

export interface PopulationInputs {
  prices: readonly GoodPriceInput[];
  supply: readonly GoodSupplyInput[];
  income: readonly PopBlockIncomeInput[];
}

/** Optional per-tick population context. */
export interface PopulationTickContext {
  definitions: PopulationDefinitions;
  /** Required by the M2-only needs fixture; omitted for integrated M3f worlds. */
  inputs?: PopulationInputs;
  /** Detailed per-good needs results are omitted when false (benchmarks). */
  collectNeedDetails?: boolean;
}

export interface EconomyTickContext {
  readonly definitions: EconomyDefinitions;
}

/**
 * D-116 integrity mode for economic worlds.
 *
 * - `staged` (default): the M3f whole-day clone with whole-world validation at both
 *   day boundaries; a failure leaves the caller's world untouched.
 * - `phase`: the day runs in place. Phases check their own preconditions, cheap
 *   global invariants run every day and the whole world is validated at month end.
 *   A failure leaves the world partly advanced, so this mode is only valid through
 *   `runTicksWithRollback`, which restores the start of the failed day.
 */
export type TickIntegrityMode = "staged" | "phase";

export interface TickContext {
  population?: PopulationTickContext;
  /** Present only for integrated M3f economic worlds. */
  economy?: EconomyTickContext;
  /** Economic-world integrity mode; defaults to `staged`. */
  integrity?: TickIntegrityMode;
  /**
   * Benchmark hook (D-137): called with a phase name when a phase-mode day enters
   * that phase. The simulation never reads a clock and never reads anything back
   * from the observer, so outcomes cannot depend on it. Omitted in the app.
   */
  phaseObserver?: DayPhaseObserver;
  /**
   * Detail of the day's result (D-137). `full` (default) returns every diagnostic
   * list in canonical order, as tests read them. `summary` is for callers that do not
   * read the per-transaction diagnostics (the worker host): the market-day result
   * lists are left in production order instead of being sorted, settlement omits its
   * per-transaction copies and the needs result omits per-good detail. The world
   * state after the day is identical at both levels.
   */
  detail?: DayResultDetail;
}

/** See `TickContext.detail`. */
export type DayResultDetail = "full" | "summary";

/** See `TickContext.phaseObserver`. */
export type DayPhaseObserver = (phase: string) => void;

export interface NeedGoodResult {
  goodKey: string;
  desired: number;
  funded: number;
  fulfilled: number;
  unmetDesired: number;
  unmetFunded: number;
}

export interface NeedTierSummary {
  tier: NeedTier;
  active: boolean;
  fullyMet: boolean;
  desiredCostRUSD: number;
  fundedCostRUSD: number;
  spentRUSD: number;
}

export interface NeedTierResult extends NeedTierSummary {
  goods: readonly NeedGoodResult[];
}

export interface PopBlockNeedsResult {
  /** P4: dietary energy fulfilled today across all need tiers, kcal (D-142). */
  kcalConsumed: number;
  popBlockId: Id;
  population: number;
  /** Cash/goods budget at the start of the needs phase, before market spending. */
  budgetStartBeforeNeedsRUSD: number;
  /** Remaining budget after needs spending; excludes any later fiscal phase. */
  budgetEndAfterNeedsRUSD: number;
  spentRUSD: number;
  tiers: readonly NeedTierResult[];
  tierSummaries: readonly NeedTierSummary[];
}

export interface PopulationNeedsDayResult {
  blocks: readonly PopBlockNeedsResult[];
  initialSupplyByGood: Readonly<Record<string, number>>;
  remainingSupplyByGood: Readonly<Record<string, number>>;
  consumedSupplyByGood: Readonly<Record<string, number>>;
}

export interface DemographyBlockResult {
  popBlockId: Id;
  populationStart: number;
  births: number;
  maleBirths: number;
  femaleBirths: number;
  deaths: number;
  populationEnd: number;
}

export interface DemographyDayResult {
  aged: boolean;
  blocks: readonly DemographyBlockResult[];
  totalBirths: number;
  totalMaleBirths: number;
  totalFemaleBirths: number;
  totalDeaths: number;
  populationStart: number;
  populationEnd: number;
}

export interface WealthUpdate {
  popBlockId: Id;
  oldWealthLevel: number;
  targetWealthLevel: number;
  newWealthLevel: number;
  annualDisposableIncomePerCapitaRUSD: number;
  annualSubsistenceCostPerCapitaRUSD: number;
}

export interface PopulationTickResult {
  aged: boolean;
  populationStart: number;
  births: number;
  deaths: number;
  populationEnd: number;
  workingAgePopulation: number;
  demography: DemographyDayResult;
  needs: PopulationNeedsDayResult;
  wealthUpdates: readonly WealthUpdate[];
}
