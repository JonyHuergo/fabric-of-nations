/**
 * M3 economy contracts.
 *
 * Units:
 * - A TU is one standard recipe batch, not a daily rate.
 * - Throughput and capacity are TU/day.
 * - Recipe coefficients are physical units per TU.
 * - Staffing coefficients are workers per (TU/day), equivalently worker-days/TU.
 *
 * Runtime state is separate from static definitions. Static definitions are
 * loaded from the data package and passed explicitly through an economy scenario;
 * they are not serialized into `World`.
 */

import type { Day, Id, MoneySUSD, Rate } from "../types.js";
import type { PopulationScenarioDef } from "../population/types.js";

export const GOOD_CATEGORIES = ["food", "raw", "industrial", "luxury", "service"] as const;
export type GoodCategory = (typeof GOOD_CATEGORIES)[number];

export interface GoodDef {
  id: Id;
  key: string;
  name: string;
  category: GoodCategory;
  /** Nominal 1900 SUSD per physical unit. Provisional. */
  basePrice1900SUSD: MoneySUSD;
  /** SUSD per physical unit. M3 single-market data uses 0. */
  transportCostPerUnit: MoneySUSD;
  /** Responsiveness parameter. Not used by M3a; provisional. */
  priceElasticity: number;
  /** Annual spoilage rate in 0..1. M3 uses 0 while spoilage is deferred. */
  spoilageRateAnnual: Rate;
  unitLabel: string;
}

export const PROFESSION_STRATA = ["lower", "middle", "upper"] as const;
export type ProfessionStratum = (typeof PROFESSION_STRATA)[number];

export interface ProfessionDef {
  id: Id;
  key: string;
  name: string;
  stratum: ProfessionStratum;
  /** Eligible working-age participation rate, 0..1. Provisional. */
  participationRate: Rate;
  /** Minimum literacy required for this profession, 0..1. */
  qualificationLiteracy: Rate;
  /** Minimum wealth level required for this profession, 0..99. */
  qualificationWealthLevel: number;
  /** Nominal 1900 annual wage in SUSD. Provisional. */
  baseWage1900SUSDPerYear: MoneySUSD;
  /** Training cost in SUSD. M3 has no training behavior. */
  trainingCostSUSD: MoneySUSD;
  /** Labor productivity modifier; strictly positive and dimensionless. */
  laborProductivityModifier: number;
}

export interface GoodQuantityDef {
  goodId: Id;
  /** Physical units per standard throughput unit (TU). */
  quantityPerThroughputUnit: number;
}

export interface ProfessionJobDef {
  professionId: Id;
  /** Workers per unit of sustained TU/day capacity. */
  workersPerThroughputUnit: number;
}

export interface StorageCapacityDef {
  goodId: Id;
  /** Physical storage capacity in the good's units. */
  quantity: number;
}

export interface BuildingDef {
  id: Id;
  key: string;
  name: string;
  /** Reference capacity at level 1, condition 1, full staffing, productivity 1, TU/day. */
  referenceThroughputPerDayAtLevelOne: number;
  inputs: GoodQuantityDef[];
  outputs: GoodQuantityDef[];
  jobs: ProfessionJobDef[];
  constructionCostSUSD: MoneySUSD;
  dailyUpkeepSUSDAtLevelOne: MoneySUSD;
  storageCapacityByGood: StorageCapacityDef[];
  /** M3 requires this list to be empty; regional resource limits are deferred. */
  resourceRequirements: GoodQuantityDef[];
  requiredTechnologyId: Id | null;
  ownershipAllowed: ("private" | "state")[];
  isEssentialInfrastructure: boolean;
}

export interface EconomyDefinitions {
  dataVersion: string;
  scenarioId: string;
  goods: GoodDef[];
  professions: ProfessionDef[];
  buildings: BuildingDef[];
}

export interface BuildingInstance {
  id: Id;
  definitionId: Id;
  regionId: Id;
  level: number;
  condition: Rate;
  ownerKind: "private" | "state";
  /** M3 requires a private owner account owned by a pop block. */
  ownerAccountId: Id;
  builtOnDay: Day;
  operational: boolean;
  operatingCashAccountId: Id;
}

export interface EmploymentAssignment {
  id: Id;
  popBlockId: Id;
  buildingInstanceId: Id;
  professionId: Id;
  workers: number;
}

export interface StockLot {
  goodId: Id;
  ownerBuildingId: Id;
  /** Physical units. */
  quantity: number;
}

export interface Market {
  id: Id;
  regionIds: Id[];
  /** SUSD per physical unit, indexed by good id. */
  priceSUSD: number[];
  /** Sole authoritative inventory representation. */
  stockLots: StockLot[];
}

export type FinancialAccountOwnerKind = "popBlock" | "building" | "system";
export type FinancialAccountKind = "household" | "operating" | "system-reserve";

export interface FinancialAccount {
  id: Id;
  ownerKind: FinancialAccountOwnerKind;
  /** Null only for system accounts. */
  ownerId: Id | null;
  accountKind: FinancialAccountKind;
  balanceSUSD: MoneySUSD;
}

export type JournalSide = "debit" | "credit";

export interface JournalLine {
  accountId: Id;
  side: JournalSide;
  /** Strictly positive SUSD. */
  amountSUSD: MoneySUSD;
}

export const TRANSACTION_KINDS = [
  "goods-purchase",
  "input-purchase",
  "wages",
  "upkeep",
  "profit-distribution",
  "owner-capital-injection",
] as const;
export type TransactionKind = (typeof TRANSACTION_KINDS)[number];

export interface JournalPosting {
  id: number;
  dayIndex: Day;
  transactionKind: TransactionKind;
  lines: JournalLine[];
  sourceEntityId: Id | null;
  targetEntityId: Id | null;
}

export interface FinanceState {
  accounts: FinancialAccount[];
  postings: JournalPosting[];
  nextPostingId: number;
}

export interface BuildingInstanceInitialDef {
  id: Id;
  definitionId: Id;
  regionId: Id;
  level: number;
  condition: Rate;
  ownerKind: "private" | "state";
  ownerAccountId: Id;
  builtOnDay: Day;
  operational: boolean;
  operatingCashAccountId: Id;
  initialOperatingCashSUSD: MoneySUSD;
}

export interface MarketInitialDef {
  id: Id;
  regionIds: Id[];
  priceSUSD: number[];
  stockLots: StockLot[];
}

export interface SystemAccountInitialDef {
  id: Id;
  accountKind: "system-reserve";
  balanceSUSD: MoneySUSD;
}

export interface EmploymentAssignmentInitialDef {
  id: Id;
  popBlockId: Id;
  buildingInstanceId: Id;
  professionId: Id;
  workers: number;
}

export interface EconomyScenarioDef {
  population: PopulationScenarioDef;
  definitions: EconomyDefinitions;
  buildingInstances: BuildingInstanceInitialDef[];
  markets: MarketInitialDef[];
  systemAccounts: SystemAccountInitialDef[];
  employment: EmploymentAssignmentInitialDef[];
}
