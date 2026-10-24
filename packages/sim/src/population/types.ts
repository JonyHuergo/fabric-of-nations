/**
 * M2 population state, static definitions, fixture inputs, and explicit results.
 *
 * Runtime state is deliberately separate from static definitions. Definitions
 * live in the data package and are passed through `TickContext`; they are not
 * serialized into `World`. Only `scenarioId`/`dataVersion` are stored in the
 * world so a save can be matched to the same definitions.
 */

import type { Id, MoneySUSD, Rate } from "../types.js";
import type { NeedTier } from "./constants.js";

export interface Region {
  id: Id;
  key: string;
  name: string;
  popBlockIds: Id[];
}

/** M2 subset of the GDD financial account contract. */
export interface FinancialAccount {
  id: Id;
  ownerKind: "popBlock";
  ownerId: Id;
  accountKind: "household";
  balanceSUSD: MoneySUSD;
}

/** M2 subset of the GDD finance state. M4 extends this type. */
export interface FinanceState {
  accounts: FinancialAccount[];
}

/** Authoritative population block state. */
export interface PopBlock {
  id: Id;
  regionId: Id;
  professionId: Id;

  /** 17 five-year cohort counts, persons. */
  ageCohorts: Uint32Array;
  /** Integer carry in fifths of a person for the 1/5 annual transfer, 0..4. */
  agingCarry: Uint8Array;

  literacy: Rate;
  wealthLevel: number;
  financialAccountId: Id;
  militancy: Rate;

  /** Consecutive days with unmet subsistence needs. */
  unmetSubsistenceDays: number;
  /** Consecutive days with unmet basic needs. */
  unmetBasicDays: number;
  /** Consecutive days with fully met, active comfort needs. */
  comfortFulfilledDays: number;

  /** Fractional person remainder for births. */
  fractionalBirthRemainder: number;
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
  /** 17 annual death rates per 1,000 persons in each age band. */
  annualDeathsPer1000ByAgeBand: readonly number[];
}

export interface FertilityAnchor {
  year: number;
  /** Crude annual births per 1,000 persons. */
  annualBirthsPer1000: number;
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
  fertilityMultipliers: readonly FertilityMultiplierDef[];
}

export interface PopBlockInitialDef {
  id: Id;
  regionId: Id;
  professionId: Id;
  financialAccountId: Id;
  ageCohorts: readonly number[];
  literacy: Rate;
  wealthLevel: number;
  initialSavingsSUSD: MoneySUSD;
  militancy: Rate;
}

export interface RegionInitialDef {
  id: Id;
  key: string;
  name: string;
}

export interface PopulationScenarioDef {
  dataVersion: string;
  scenarioId: string;
  professions: readonly ProfessionIdentityDef[];
  regions: readonly RegionInitialDef[];
  popBlocks: readonly PopBlockInitialDef[];
  definitions: PopulationDefinitions;
}

export interface GoodPriceInput {
  goodKey: string;
  unitPriceSUSD: number;
}

export interface GoodSupplyInput {
  goodKey: string;
  availableQuantityPerCapita: number;
}

export interface PopBlockIncomeInput {
  popBlockId: Id;
  annualSettledIncomePerCapitaSUSD: number;
  annualMandatoryPaymentsPerCapitaSUSD: number;
}

export interface PopulationInputs {
  prices: readonly GoodPriceInput[];
  supply: readonly GoodSupplyInput[];
  income: readonly PopBlockIncomeInput[];
}

/** Optional per-tick population context. */
export interface PopulationTickContext {
  definitions: PopulationDefinitions;
  inputs: PopulationInputs;
  /** Detailed per-good needs results are omitted when false (benchmarks). */
  collectNeedDetails?: boolean;
}

export interface TickContext {
  population?: PopulationTickContext;
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
  desiredCostSUSD: number;
  fundedCostSUSD: number;
  spentSUSD: number;
}

export interface NeedTierResult extends NeedTierSummary {
  goods: readonly NeedGoodResult[];
}

export interface PopBlockNeedsResult {
  popBlockId: Id;
  population: number;
  budgetStartSUSD: number;
  budgetEndSUSD: number;
  spentSUSD: number;
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
  deaths: number;
  populationEnd: number;
}

export interface DemographyDayResult {
  aged: boolean;
  blocks: readonly DemographyBlockResult[];
  totalBirths: number;
  totalDeaths: number;
  populationStart: number;
  populationEnd: number;
}

export interface WealthUpdate {
  popBlockId: Id;
  oldWealthLevel: number;
  targetWealthLevel: number;
  newWealthLevel: number;
  annualDisposableIncomePerCapitaSUSD: number;
  annualSubsistenceCostPerCapitaSUSD: number;
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
