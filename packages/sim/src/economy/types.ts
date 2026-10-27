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
  /**
   * The owner's designated cash account: a pop-block household-cash account for
   * private ownership, or the owning country's treasury-cash account for state
   * ownership (M5a).
   */
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
  "retained-profit",
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
  "debt-liability",
  "interest-payable",
  "interest-expense",
  "bond-asset",
  "interest-receivable",
  "interest-income",
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
 * Internal transaction kinds available only to controlled close/correction
 * helpers. The public posting APIs reject them at type and runtime boundaries
 * (D-047, D-072). `correction` may change cash because it can reverse a prior
 * cash posting; its dedicated API validates the result instead of imposing the
 * normal cash-neutral rule.
 */
export const INTERNAL_TRANSACTION_KINDS = ["period-close", "correction"] as const;
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
  "profit-retention",
  "profit-distribution",
  "state-enterprise-remittance",
  "debt-issuance",
  "debt-principal-repayment",
  "interest-accrual",
  "interest-payment",
  "debt-default-writeoff",
  "owner-capital-injection",
  "period-close",
] as const;

/**
 * Transaction kinds allowed to change aggregate designated cash. They are
 * registered so the partition is total, but their mechanisms are future-stage
 * work and posting them is rejected in M4a-1.
 */
export const CASH_CHANGING_TRANSACTION_KINDS = [
  "monetary-issuance",
  "monetary-redemption",
  "correction",
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
  /**
   * Pre-close account trial balance. Nonempty for the most recent
   * `MAX_DETAILED_PERIOD_SUMMARIES`; empty for compacted summaries, which retain
   * `countryFiscalTotals` and `flowTotalsByKind` instead.
   */
  accountTotals: Record<Id, MoneySUSD>;
  flowTotalsByKind: Record<FlowTransactionKind, MoneySUSD>;
  /**
   * Per-country fiscal totals retained after account-level compaction (D-065).
   * Absent on detailed summaries. Reporting-only, exact values from the
   * pre-close trial balance; not used by simulation decisions.
   */
  countryFiscalTotals?: Record<Id, FinancePeriodFiscalTotals>;
}

/** Exact per-country fiscal totals retained in a compacted period summary. */
export interface FinancePeriodFiscalTotals {
  readonly incomeTaxRevenueSUSD: MoneySUSD;
  readonly welfareExpenseSUSD: MoneySUSD;
  readonly interestExpenseSUSD: MoneySUSD;
  readonly netFiscalResultSUSD: MoneySUSD;
}

/** Year-end balance-sheet values retained by an annual summary. */
export interface AnnualClosingBalances {
  readonly treasuryCashSUSD: MoneySUSD;
  /** Debt principal liability, excluding accrued interest payable. */
  readonly debtLiabilitySUSD: MoneySUSD;
  readonly interestPayableSUSD: MoneySUSD;
}

/**
 * Immutable annual finance summary created immediately after the December
 * monthly close. Flows are exact sums of that year's monthly summaries; balances
 * are year-end account balances. No account-level trial balance is retained.
 */
export interface AnnualFinanceSummary {
  /** Civil year covered; 1900..1999 for the shipped campaign. */
  year: number;
  /** Inclusive first processed day of the year (may be mid-year for a partial first year). */
  periodStartDay: Day;
  /** Inclusive last processed day, always 31 December. */
  periodEndDay: Day;
  /** True only when the year starts on 1 January in the campaign. */
  complete: boolean;
  /** Annual government flows per country. */
  fiscalTotals: Record<Id, FinancePeriodFiscalTotals>;
  /** Annual world-wide gross flows for the four M4b flow kinds. */
  flowTotalsByKind: Record<FlowTransactionKind, MoneySUSD>;
  /** End-of-year balances per country. */
  closingBalances: Record<Id, AnnualClosingBalances>;
  /** Number of controlled correction records posted during the year. */
  correctionCount: number;
}

/**
 * Audited controlled correction/reversal posting. The new posting is the
 * authoritative accounting effect; monthly and annual summaries are never
 * rewritten. `lines` duplicates the posting for audit retention after the
 * bounded posting buffer evicts it.
 */
export interface FinanceCorrection {
  id: number;
  dayIndex: Day;
  postingId: number;
  originalPostingId: number;
  reason: string;
  lines: JournalLine[];
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
  /** Closed annual periods in ascending year order; bounded to the campaign. */
  annualSummaries: AnnualFinanceSummary[];
  /** Bounded controlled corrections, oldest first. */
  corrections: FinanceCorrection[];
  /** Deterministic allocator for correction records. */
  nextCorrectionId: number;
  /**
   * Bounded debt records: all active/arrears contracts plus the most recent
   * terminated contracts. Older terminated records are aggregated in
   * `debtHistory` (D-066).
   */
  debtContracts: DebtContract[];
  /** One bounded aggregate per issuer for compacted terminated contracts. */
  debtHistory: DebtHistoryAggregate[];
  /** Deterministic allocator for new debt contract ids. */
  nextContractId: number;
  /**
   * Month-to-date requested welfare budget per country. This is a reporting and
   * financing-requirement memo, not a liability: unpaid welfare remains an unmet
   * budget and is never posted as a payable. Reset at monthly close.
   */
  welfareRequestedThisMonth: Record<Id, MoneySUSD>;
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

/**
 * M5b provisional public-debt policy.
 *
 * When enabled, the country may issue debt to its designated simulated creditor
 * at each month-end to finance its accrued fiscal deficit, and may refinance
 * maturing principal. The creditor is an existing simulated country treasury or
 * pop-block household cash account; no bank, central bank, bond market, or
 * external investor pool is introduced. Creditor cash and the outstanding
 * principal ceiling are hard financing constraints. Rates, terms, and ceilings are
 * provisional, not calibrated.
 */
export interface DebtPolicy {
  enabled: boolean;
  creditorKind: "country" | "popBlock";
  creditorId: Id;
  /** Annual coupon rate on outstanding principal, 0..1. */
  annualCouponRate: Rate;
  /** Contract term in civil days, at least 1. */
  termDays: number;
  /** Maximum total outstanding principal, in SUSD. */
  maxOutstandingPrincipalSUSD: MoneySUSD;
  refinanceOnMaturity: boolean;
  /** Days after first arrears before the remaining debt is written off. */
  arrearsGraceDays: number;
}

/**
 * Bounded aggregate of retired debt contracts (D-066). One record per issuer
 * preserves principal history after individual terminated contracts are compacted.
 */
export interface DebtHistoryAggregate {
  readonly issuerCountryId: Id;
  /** Fully repaid or refinanced contracts removed from retained detail. */
  readonly contractsRetired: number;
  /** Defaulted contracts removed from retained detail. */
  readonly contractsDefaulted: number;
  readonly principalIssuedSUSD: MoneySUSD;
  readonly principalRepaidSUSD: MoneySUSD;
  readonly principalWrittenOffSUSD: MoneySUSD;
  readonly interestWrittenOffSUSD: MoneySUSD;
}

/** M5b public-debt contract. Persisted in `FinanceState`. */
export interface DebtContract {
  id: Id;
  /** Contract schema version; M5b defines version 1. */
  contractVersion: 1;
  issuerCountryId: Id;
  holderKind: "country" | "popBlock";
  holderId: Id;
  principalSUSD: MoneySUSD;
  outstandingPrincipalSUSD: MoneySUSD;
  annualCouponRate: Rate;
  issueDay: Day;
  maturityDay: Day;
  /** Accrued but unpaid coupon interest. */
  accruedInterestSUSD: MoneySUSD;
  status: "active" | "arrears" | "repaid" | "defaulted";
  arrearsSinceDay: Day | null;
}

/**
 * M6 country-AI goal identifiers.
 *
 * A goal persists in `CountryAIState.currentGoalId` until the next scheduled
 * evaluation changes the observed pressure, or the policy already matches the
 * goal's target. The identifiers are persisted and hashed, so their spelling is
 * part of the save contract.
 */
export const COUNTRY_AI_GOAL_IDS = [
  "maintain",
  "relieve-hardship",
  "restore-solvency",
] as const;
export type CountryAIGoalId = (typeof COUNTRY_AI_GOAL_IDS)[number];

/**
 * M6 persisted per-country AI state (GDD §5.6 `AIState`).
 *
 * The state is small and fixed-size: a schedule day, the current goal, the last
 * decision day, and a bounded diagnostic summary. It does not contain a
 * per-tick history or an unbounded action log. `lastActionSummary` is diagnostic
 * only and is never read as an authority for policy.
 */
export interface CountryAIState {
  /** Next day on which this country evaluates. */
  nextEvaluationDay: Day;
  /** Current persistent goal, or null before the first evaluation. */
  currentGoalId: CountryAIGoalId | null;
  /** Day of the most recent evaluation, or null before the first evaluation. */
  lastDecisionDay: Day | null;
  /** Bounded diagnostic summary of the most recently applied action. */
  lastActionSummary: string | null;
}

/**
 * M6 world-level country-AI enable policy. Disabled for legacy fixtures; the
 * M5 historical campaign enables it explicitly. This is a scenario-provided
 * policy, not a spendable resource.
 */
export interface CountryAIPolicy {
  enabled: boolean;
}

/**
 * M5a provisional profit-allocation policy.
 *
 * When enabled, each economic month-end after the M4b close reclassifies each
 * building's closed period net result into its `retained-profit` account and
 * distributes a fraction of positive retained profit. Private distributions go
 * to the designated owner household; state enterprises remit to the owning
 * country treasury. Both are capped by available operating cash. These rates are
 * provisional, not calibrated. Legacy M0–M5 fixtures default to disabled so
 * their accepted behavior is unchanged.
 */
export interface ProfitDistributionPolicy {
  enabled: boolean;
  /** Fraction of positive private retained profit distributed per month, 0..1. */
  privatePayoutRate: Rate;
  /** Fraction of positive state-enterprise retained profit remitted per month, 0..1. */
  stateRemittanceRate: Rate;
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
  /** M5b provisional public-debt policy state. */
  debt: DebtPolicy;
  /** M6 persisted country-AI schedule and goal state. */
  ai: CountryAIState;
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
  /** Defaults to disabled for M0–M5a fixtures. */
  debt?: DebtPolicy;
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
  /** M5a profit-allocation policy. Omitted means disabled defaults. */
  profitDistribution?: ProfitDistributionPolicy;
  /** M6 country-AI enable policy. Omitted means disabled defaults. */
  countryAI?: CountryAIPolicy;
  /**
   * Post-M7 player-control designation. The AI does not make fiscal decisions for
   * this country. Omitted or null means no designated player country (legacy
   * fixtures), and every country remains AI-eligible when the AI is enabled.
   */
  playerCountryId?: Id | null;
}
