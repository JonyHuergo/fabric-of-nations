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

export interface Region {
  id: Id;
  key: string;
  name: string;
  popBlockIds: Id[];
  /** Null only for population-only M2 worlds with no market. */
  marketId: Id | null;
  buildingInstanceIds: Id[];
  /** Reserved for future regional resource limits; M3 does not read or apply it. */
  resourceCapsPerDay: number[];
  /** M8 regional unrest, 0..1; updated daily by the politics phase. */
  unrest: Rate;
  /** M8 provisional regional infrastructure quality, 0..1. */
  infrastructure: Rate;
  /**
   * M10 temporary military controller. Null means the sovereign controls the region.
   * This never changes `Country.regionIds`, which is the sovereignty record (D-081).
   */
  controllerCountryId: Id | null;
  /** Day the current occupation began; null when not occupied. */
  occupiedSinceDay: Day | null;
}

/**
 * Explicit alias for the historical `Region` concept.
 *
 * A SimulationRegion is a population/economy accounting unit. It is NOT a
 * geographical subdivision: since M12a the sole geographical layer beneath a
 * polity is the permanent `Province`. The runtime field keeps the name
 * `regions` for save compatibility, but new code should use this alias.
 */
export type SimulationRegion = Region;

/** Explicit alias for the simulation-region scenario input (not geography). */
export type SimulationRegionInitialDef = RegionInitialDef;

/** Authoritative population block state. */
export interface PopBlock {
  id: Id;
  regionId: Id;
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

export interface MortalityAnchor {
  year: number;
  /** 17 annual central death rates per 1,000 males in each five-year band. */
  maleAnnualDeathsPer1000ByAgeBand: readonly number[];
  /** 17 annual central death rates per 1,000 females in each five-year band. */
  femaleAnnualDeathsPer1000ByAgeBand: readonly number[];
}

export interface FertilityAnchor {
  year: number;
  /** Seven annual ASFRs per 1,000 women, ages 15-19 through 45-49. */
  ageSpecificBirthsPer1000Women: readonly number[];
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
  mortalityAnchors: readonly MortalityAnchor[];
  fertilityAnchors: readonly FertilityAnchor[];
  /** Male births per one female birth; provisional unless sourced. */
  sexRatioAtBirth: number;
  fertilityMultipliers: readonly FertilityMultiplierDef[];
}

export interface PopBlockInitialDef {
  id: Id;
  regionId: Id;
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
}

export interface RegionInitialDef {
  id: Id;
  key: string;
  name: string;
  /** Optional future regional resource caps. M3 does not read them. */
  resourceCapsPerDay?: readonly number[];
  /** M8 provisional infrastructure quality, 0..1; defaults to 0.5. */
  infrastructure?: Rate;
}

export interface PopulationScenarioDef {
  dataVersion: string;
  scenarioId: string;
  /** Optional non-1900 validation start; defaults to day 0. */
  startDayIndex?: Day;
  professions: readonly ProfessionIdentityDef[];
  regions: readonly RegionInitialDef[];
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
}

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
