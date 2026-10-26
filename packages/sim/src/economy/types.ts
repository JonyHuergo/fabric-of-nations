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

export type FinancialAccountOwnerKind = "popBlock" | "building" | "country" | "system";

/**
 * Account categories determine the normal side and the balance constraint.
 * Asset and expense accounts are debit-normal; liability, equity, and revenue
 * accounts are credit-normal. Balances are stored in normal-side units.
 */
export const ACCOUNT_CATEGORIES = ["asset", "liability", "equity", "revenue", "expense"] as const;
export type AccountCategory = (typeof ACCOUNT_CATEGORIES)[number];

/**
 * Functional account roles. `CASH_SUBTYPES` in `accounts.ts` is the explicit
 * designated-cash set used by the aggregate cash-conservation invariant; it is
 * never "every asset account".
 */
export const ACCOUNT_SUBTYPES = [
  "household-cash",
  "operating-cash",
  "system-reserve-cash",
  "treasury-cash",
  "owner-equity",
  "wage-income",
  "sales-revenue",
  "system-income",
  "income-tax-revenue",
  "welfare-income",
  "consumption-expense",
  "input-expense",
  "wage-expense",
  "upkeep-expense",
  "income-tax-expense",
  "welfare-expense",
] as const;
export type AccountSubtype = (typeof ACCOUNT_SUBTYPES)[number];

export interface FinancialAccount {
  id: Id;
  ownerKind: FinancialAccountOwnerKind;
  /** Null only for system accounts. */
  ownerId: Id | null;
  category: AccountCategory;
  subtype: AccountSubtype;
  /** Balance in normal-side units; non-negative except equity, which may be signed. */
  balanceSUSD: MoneySUSD;
}

export type JournalSide = "debit" | "credit";

export interface JournalLine {
  accountId: Id;
  side: JournalSide;
  /** Strictly positive SUSD. */
  amountSUSD: MoneySUSD;
}

/**
 * Internal transaction kind available only to the M4b period-close helper. It is
 * cash-neutral by construction, so it belongs to the cash-neutral partition, but
 * the public posting APIs reject it at type and runtime boundaries (D-047).
 */
export const INTERNAL_TRANSACTION_KINDS = ["period-close"] as const;
export type InternalTransactionKind = (typeof INTERNAL_TRANSACTION_KINDS)[number];

/** Transaction kinds that must not change aggregate designated cash. */
export const CASH_NEUTRAL_TRANSACTION_KINDS = [
  "goods-purchase",
  "input-purchase",
  "wages",
  "upkeep",
  "income-tax",
  "welfare-transfer",
  "migration-transfer",
  "profit-distribution",
  "owner-capital-injection",
  ...INTERNAL_TRANSACTION_KINDS,
] as const;

/**
 * Transaction kinds allowed to change aggregate designated cash. They are
 * registered so the partition is total, but their mechanisms are future-stage
 * work and posting them is rejected in M4a-1.
 */
export const CASH_CHANGING_TRANSACTION_KINDS = [
  "monetary-issuance",
  "monetary-redemption",
] as const;

export const TRANSACTION_KINDS = [
  ...CASH_NEUTRAL_TRANSACTION_KINDS,
  ...CASH_CHANGING_TRANSACTION_KINDS,
] as const;
/** Every registered transaction kind, including the internal close-only kind. */
export type TransactionKind = (typeof TRANSACTION_KINDS)[number];

/**
 * Kind accepted by the public posting APIs. `period-close` is excluded at the
 * type level, so a public caller cannot construct arbitrary closing entries.
 */
export type PublicTransactionKind = Exclude<TransactionKind, InternalTransactionKind>;

/** True when `value` is the internal close-only transaction kind. */
export function isInternalTransactionKind(value: string): value is InternalTransactionKind {
  return (INTERNAL_TRANSACTION_KINDS as readonly string[]).includes(value);
}

/** The public transaction kinds in registry order. */
export const PUBLIC_TRANSACTION_KINDS: readonly PublicTransactionKind[] = TRANSACTION_KINDS.filter(
  (kind): kind is PublicTransactionKind => !isInternalTransactionKind(kind),
);

/**
 * The four gross period flows reported by an M4b monthly summary. Each flow is
 * derived from its mapped expense subtype (D-047); `period-close` is excluded.
 */
export const FLOW_TRANSACTION_KINDS = [
  "goods-purchase",
  "input-purchase",
  "wages",
  "upkeep",
] as const;
export type FlowTransactionKind = (typeof FLOW_TRANSACTION_KINDS)[number];

export interface JournalPosting {
  id: number;
  dayIndex: Day;
  transactionKind: TransactionKind;
  lines: JournalLine[];
  sourceEntityId: Id | null;
  targetEntityId: Id | null;
}

/**
 * Provenance record for the atomically applied opening balances. It is a guard
 * and audit summary, not a duplicate of account balances.
 */
export interface OpeningBalanceRecord {
  /** Day the opening balances belong to; must equal `World.startDayIndex`. */
  dayIndex: Day;
  /** Number of accounts present when the opening balances were applied. */
  accountCount: number;
  /** FNV-1a checksum over the canonical sorted opening entries. */
  checksum: string;
}

/**
 * Immutable monthly finance summary captured immediately before a period close
 * (D-047, GDD §5.5).
 *
 * `accountTotals` is the pre-close trial balance keyed by decimal account id. It
 * contains only nonzero accounts and includes opening balance-sheet balances as
 * well as the period's revenue and expense. Those opening balances are not period
 * activity.
 *
 * `flowTotalsByKind` carries the four gross flows derived from the mapped expense
 * balances. Given zero revenue/expense opening balances, the semantic posting
 * matrix, nonnegative expense balances, and exact closing zeroing, each expense
 * balance measures gross activity for exactly one period.
 */
export interface FinancePeriodSummary {
  /** Inclusive first day of the period; `World.startDayIndex` for the first period. */
  periodStartDay: Day;
  /** Inclusive last day; always a civil month-end. */
  periodEndDay: Day;
  accountTotals: Record<Id, MoneySUSD>;
  flowTotalsByKind: Record<FlowTransactionKind, MoneySUSD>;
}

export interface FinanceState {
  accounts: FinancialAccount[];
  /** Bounded recent audit buffer; never an unbounded transaction log. */
  postings: JournalPosting[];
  nextPostingId: number;
  /** Deterministic allocator for runtime/derived accounts. */
  nextAccountId: number;
  /** Null only when every account balance is zero (for example an empty world). */
  opening: OpeningBalanceRecord | null;
  /**
   * Closed monthly periods in ascending period-end order. M4b never compacts or
   * rewrites them; long-run finance history lives here, not in `postings`.
   */
  periodSummaries: FinancePeriodSummary[];
  /**
   * Inclusive last day of the most recently closed period, or null before the
   * first close. A published world requires `null` or `closedThroughDay <
   * dayIndex`; a staged close may temporarily equal `dayIndex`.
   */
  closedThroughDay: Day | null;
}

/**
 * SUSD-equivalent value of one unit of a currency.
 *
 * This is not a MoneySUSD amount: its unit is SUSD per one currency unit.
 * The brand is compile-time only; serialized state remains a plain JSON number.
 * D-003 deliberately avoided branded numeric types for ordinary state, but this
 * value has distinct dimensions and the M4a-2 design review explicitly requires
 * dimensional separation. It is the narrow exception recorded in D-044.
 */
declare const susdPerCurrencyUnitBrand: unique symbol;
export type SusdPerCurrencyUnit = number & {
  readonly [susdPerCurrencyUnitBrand]: true;
};

/** Identity of the entity that issues a currency. */
export type CurrencyIssuer =
  | { kind: "country"; countryId: Id }
  | { kind: "foreign"; issuerKey: string }
  | { kind: "union"; unionKey: string };

export interface Currency {
  id: Id;
  /** Stable lower-case key; never `susd` in any casing. */
  key: string;
  name: string;
  issuer: CurrencyIssuer;
}

/**
 * A country's domestic monetary arrangement. This is the sole authority for the
 * currency a country uses domestically; there is no top-level `Country.currencyId`.
 */
export type MonetaryArrangement =
  | { kind: "own"; currencyId: Id }
  | { kind: "adopted"; currencyId: Id }
  | { kind: "shared"; currencyId: Id; unionKey: string };

/**
 * M4c per-country fiscal policy state.
 *
 * `incomeTaxRate` is a dimensionless flat rate on wages actually received. It is
 * provisional hard-bounded state, not law-bounded: M8 taxation laws may replace
 * it. `welfareBudgetSUSDPerYear` is a requested annual nominal SUSD expenditure
 * target, not a spendable pool; it is paid daily as
 * `welfareBudgetSUSDPerYear / daysInYear(civil year)`.
 */
export interface FiscalPolicy {
  incomeTaxRate: Rate;
  welfareBudgetSUSDPerYear: MoneySUSD;
}

export interface Country {
  id: Id;
  tag: string;
  name: string;
  monetary: MonetaryArrangement;
  /** Sole authoritative country-to-region ownership mapping. */
  regionIds: Id[];
  /** The country's own designated `treasury-cash` account. */
  treasuryAccountId: Id;
  /** M4c provisional fiscal policy state. */
  fiscal: FiscalPolicy;
  /**
   * M5: whether this country admits foreign residents and cross-border workers.
   *
   * The GDD requires international migration to be permitted by an open-border
   * law or event. M5 has no law system, so the scenario initialises this
   * provisional policy flag and nothing mutates it. Emigration is unrestricted
   * in M5 (recorded assumption, D-052). Internal migration does not use it.
   */
  immigrationOpen: boolean;
}

/**
 * Scenario input for one country. `treasuryAccountId` is declared so account
 * allocation is deterministic and cannot collide with other declared accounts;
 * `initialTreasuryCashSUSD` is applied once through the opening-balance record.
 */
export interface CountryInitialDef {
  id: Id;
  tag: string;
  name: string;
  monetary: MonetaryArrangement;
  regionIds: Id[];
  treasuryAccountId: Id;
  initialTreasuryCashSUSD: MoneySUSD;
  fiscal: FiscalPolicy;
  /** Defaults to false for M4 fixtures that predate M5. */
  immigrationOpen?: boolean;
}

/**
 * Authoritative SUSD-relative valuation of one currency. `specified` carries
 * the value; `unavailable` explicitly records that no value is known and never
 * defaults to parity.
 */
export type CurrencyValuation =
  | {
      currencyId: Id;
      status: "specified";
      susdPerUnit: SusdPerCurrencyUnit;
      setOnDay: Day;
      source: "scenario";
    }
  | { currencyId: Id; status: "unavailable" };

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
  /** M4a-2 country identity plus M4c treasury/fiscal initial state. */
  countries?: CountryInitialDef[];
  currencies?: Currency[];
  currencyValuations?: CurrencyValuation[];
}
