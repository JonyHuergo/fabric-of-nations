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
  /**
   * P5b (C-8): absolute latitude of the province's centroid in degrees (0..90), or null
   * where no geometry was given (fixtures). Static geography; buildings with a
   * `maxAbsLatitudeDeg` (crop bands) work only where it is at or below that limit.
   */
  absLatitudeDeg: number | null;
  /**
   * P5b (C-12, D-146 A8): gross theoretical hydropower potential of the province's
   * rivers, MWh per year (sum over river reaches of water density x g x mean discharge x
   * elevation drop; HydroSHEDS RiverATLAS, D-148). Static geography, never depleted.
   * Hydro stations generate at most `HYDRO_TECHNICAL_SHARE` of it, spread evenly over
   * the year. Null where no potential was given (legacy worlds, fixtures): a hydro
   * station cannot work there.
   */
  hydroPotentialMWhPerYear: number | null;
  /**
   * P6 (D-153): persons per dwelling in the province at its 1900 census (or the
   * recorded proxy), the province's housing reference. Static. Null in worlds without
   * housing (legacy, fixtures). Province crowding = persons ÷ dwellings ÷ this value,
   * 1.0 in 1900.
   */
  housingReferencePersonsPerDwelling: number | null;
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

  // P6 (D-153) demand, saving and housing. All zero in worlds without a demand system.
  /**
   * Household income per person per day, RUSD, smoothed over INCOME_SMOOTHING_DAYS:
   * wages, welfare, distributed profits and public pay received, less income tax, plus
   * the value of food kept from the block's own farms (permanent income, plan Q15).
   */
  incomeSmoothedRUSDPerCapitaDay: number;
  /** Standard dwellings the block owns and lives in (plan Q4a, Q5a); real, ≥ 0. */
  dwellings: number;
  /** The block's persons per dwelling at world creation (crowding 1.0); fixed. */
  housingReferencePersonsPerDwelling: number;
  /** The block's smoothed income per person per day at world creation; fixed. */
  housingReferenceIncomeRUSDPerCapitaDay: number;
}

export interface NeedItemDef {
  /** Stable GDD good key; M3 maps this to a goods definition. */
  goodKey: string;
  /** Physical units per person per day. */
  quantityPerCapitaPerDay: number;
  /**
   * P5b (D-146, C-21): a technology that unlocks this item. The item is wanted by a
   * block whose country knows it, or whenever the block's market holds stock of the
   * good that morning (imports). Absent: always wanted.
   */
  requiredTechnologyKey?: string;
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

/**
 * P6 (D-153): one good of a demand category. Quantities are in the good's unit.
 */
export interface DemandGoodDef {
  goodKey: string;
  /** Committed (subsistence) quantity per adult equivalent per day; 0 for most goods. */
  committedPerAdultEquivalentPerDay: number;
  /**
   * Retail margin of an urban household: units of the commerce and transport services
   * bought with each unit of the good. A rural household pays this × its urban share.
   */
  retailCommercePerUnit: number;
  retailTransportPerUnit: number;
  /** A technology that gates the good (P5b C-21 rule); absent: always available. */
  requiredTechnologyKey?: string;
}

/** P6: a need category of the linear expenditure system. */
export interface DemandCategoryDef {
  key: string;
  /** Elasticity of substitution between the category's goods (CES), > 0. */
  substitutionElasticity: number;
  /** Committed quantities of this category go at market tier 1 (food) instead of 3. */
  committedAtSubsistenceTier: boolean;
  goods: readonly DemandGoodDef[];
}

/**
 * P6: one point of the marginal-share schedule (plan Q1b, Q2, Q13). `consumptionRatio`
 * is consumption per adult equivalent ÷ committed cost per adult equivalent
 * (dimensionless, > 1). Between knots shares and weights are linear in the ratio;
 * outside they are constant.
 */
export interface DemandKnotDef {
  consumptionRatio: number;
  /** Marginal budget share of each category (keys = category keys); they sum to 1. */
  marginalShares: Readonly<Record<string, number>>;
  /** Weight of each good inside its category (category key → good key → weight). */
  goodWeights: Readonly<Record<string, Readonly<Record<string, number>>>>;
}

/** P6 (Q16): a sourced national taste, a multiplier of a good's weight in a country. */
export interface DemandTasteDef {
  countryKey: string;
  goodKey: string;
  weightMultiplier: number;
}

/** P6 (D-153): the linear expenditure system that replaces the need tiers. */
export interface DemandSystemDef {
  /** Service goods bought as retail margins. */
  commerceGoodKey: string;
  transportGoodKey: string;
  categories: readonly DemandCategoryDef[];
  knots: readonly DemandKnotDef[];
  tastes: readonly DemandTasteDef[];
  /** The dwelling good households buy (plan §4.3); null: no housing. */
  dwellingGoodKey: string | null;
}

export interface PopulationDefinitions {
  dataVersion: string;
  scenarioId: string;
  needs: readonly NeedTierDef[];
  /**
   * P6 (D-153): the demand system. When present, households buy by it instead of the
   * need tiers (whose subsistence tier still prices the wealth indicator's basket);
   * absent in legacy worlds (plan Q9a).
   */
  demandSystem?: DemandSystemDef;
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
   * P6 (D-153): expected 1900 income per person per day, RUSD (the generator's wage and
   * profit estimate). Initialises the smoothed income and the housing reference. Absent:
   * 0 (worlds without a demand system).
   */
  incomeRUSDPerCapitaDay?: number;
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
  /** P5b absolute centroid latitude in degrees; defaults to null (no crop-band limit). */
  absLatitudeDeg?: number | null;
  /** P6 persons per dwelling at the 1900 census; defaults to null (no housing). */
  housingReferencePersonsPerDwelling?: number | null;
  /** P5b gross theoretical hydro potential, MWh/year; defaults to null (no hydro). */
  hydroPotentialMWhPerYear?: number | null;
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
