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

/** Validated E4 building-sector taxonomy used by industrial policy. */
export const BUILDING_SECTORS = [
  "agriculture",
  "food-processing",
  "textiles",
  "manufacturing",
  "storage",
] as const;
export type BuildingSector = (typeof BUILDING_SECTORS)[number];

/** One authored construction/commissioning material requirement. */
export interface ConstructionMaterialDef {
  goodId: Id;
  /** Physical units of the good required by the project. */
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
  /** Validated E4 sector classification used for industrial policy eligibility. */
  sector: BuildingSector;
  constructionCostSUSD: MoneySUSD;
  /**
   * E3 maximum daily construction crew for this project type. The crew is hired
   * from idle eligible workers and paid their profession's base daily wage; the
   * project advances only as that gross payroll accumulates toward the cost.
   */
  constructionWorkers: number;
  /**
   * E4 materials/commissioning inputs bought from the regional market and consumed
   * by construction. Empty for project types with no modeled material requirement.
   */
  constructionMaterials: ConstructionMaterialDef[];
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
  /**
   * M8 validated political content. Omitted for legacy fixtures, which then have
   * `World.politics.enabled = false` and no M8 effects (D-076).
   */
  politics?: PoliticsDefinitions;
  /**
   * M9 validated technology content. Omitted for legacy fixtures, which then have
   * `World.technology.enabled = false` and no M9 effects (D-077).
   */
  technology?: TechnologyDefinitions;
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
  "construction-in-progress",
  "public-capital",
  "owner-equity",
  "retained-profit",
  "wage-income",
  "sales-revenue",
  "system-income",
  "income-tax-revenue",
  "business-tax-revenue",
  "subsidy-revenue",
  "welfare-income",
  "administration-income",
  "consumption-expense",
  "input-expense",
  "wage-expense",
  "upkeep-expense",
  "income-tax-expense",
  "business-tax-expense",
  "subsidy-expense",
  "welfare-expense",
  "administration-expense",
  "debt-liability",
  "interest-payable",
  "interest-expense",
  "bond-asset",
  "interest-receivable",
  "interest-income",
  "education-income",
  "education-expense",
  "training-income",
  "training-expense",
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
  "business-profit-tax",
  "construction-wage",
  "construction-capitalization",
  "construction-writeoff",
  "construction-working-capital",
  "construction-material-purchase",
  "production-subsidy",
  "public-enterprise-capital-contribution",
  "administration-payroll",
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
  "education-payroll",
  "training-payroll",
  "training-stipend",
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
  /**
   * E2 per-country budget decomposition: requested/paid/shortfall, financing
   * movements, and the explicit unfinanced requirement. Exact period values,
   * retained on both detailed and compacted summaries.
   */
  countryBudgetTotals: Record<Id, FinancePeriodBudgetTotals>;
}

/** Exact per-country fiscal totals retained in a period summary (D-047, E2). */
export interface FinancePeriodFiscalTotals {
  readonly incomeTaxRevenueSUSD: MoneySUSD;
  /** E2 business-profit tax revenue collected through the treasury. */
  readonly businessTaxRevenueSUSD: MoneySUSD;
  readonly welfareExpenseSUSD: MoneySUSD;
  readonly interestExpenseSUSD: MoneySUSD;
  /** E4 sectoral production-subsidy expense paid through the treasury. */
  readonly subsidyExpenseSUSD: MoneySUSD;
  /**
   * M8 public-administration payroll paid through the treasury. Optional for
   * pre-M8 summaries/fixtures; absent means zero (D-076).
   */
  readonly administrationExpenseSUSD?: MoneySUSD;
  /** M9 education/research payroll paid through the treasury. Optional pre-M9 = zero. */
  readonly educationExpenseSUSD?: MoneySUSD;
  /** E5 training provider payroll and trainee stipend. Optional pre-E5 = zero. */
  readonly trainingExpenseSUSD?: MoneySUSD;
  /** Tax revenue minus welfare, interest, subsidy, administration, education, and training expense. */
  readonly netFiscalResultSUSD: MoneySUSD;
}

/**
 * E2 budget decomposition retained per closed period (D-073).
 *
 * These amounts separate what was requested/assessed from what was actually paid
 * or collected, and separate deficit financing from revenue and expense:
 *
 * - `welfareRequestedSUSD` is the authorized daily budget share accumulated over
 *   the period, including any amount the treasury could not pay.
 * - `welfareShortfallSUSD` is the unpaid part. It is an unmet budget, never a
 *   liability, and `welfareRequested = welfarePaid + welfareShortfall` exactly
 *   (welfare paid is the period `welfareExpenseSUSD`).
 * - `businessTaxAssessedSUSD` is the period-end assessment; collected revenue is
 *   the period `businessTaxRevenueSUSD` and `businessTaxUncollectedSUSD` is the
 *   difference that exceeded a building's operating cash (no receivable is
 *   created).
 * - `debtIssuedSUSD` and `principalRepaidSUSD` are financing movements, not
 *   revenue or expense. `interestPaidSUSD` is the cash coupon/maturity payment,
 *   distinct from the accrued `interestExpenseSUSD`. `unfinancedRequirementSUSD`
 *   is the month-end financing requirement left unfunded by the creditor,
 *   ceiling, and contract-cap constraints.
 */
export interface FinancePeriodBudgetTotals {
  readonly welfareRequestedSUSD: MoneySUSD;
  readonly welfareShortfallSUSD: MoneySUSD;
  readonly businessTaxAssessedSUSD: MoneySUSD;
  readonly businessTaxUncollectedSUSD: MoneySUSD;
  readonly debtIssuedSUSD: MoneySUSD;
  readonly principalRepaidSUSD: MoneySUSD;
  readonly interestPaidSUSD: MoneySUSD;
  readonly unfinancedRequirementSUSD: MoneySUSD;
  /** E3 gross construction labor paid (capitalized, not an expense). */
  readonly constructionSpentSUSD: MoneySUSD;
  /** E3 work-in-progress written off on cancellation. */
  readonly constructionWrittenOffSUSD: MoneySUSD;
  /** E4 construction/commissioning materials purchased and capitalized. */
  readonly constructionMaterialsSpentSUSD: MoneySUSD;
  /** E4 sectoral subsidy entitlement and unpaid shortfall. */
  readonly subsidyRequestedSUSD: MoneySUSD;
  readonly subsidyShortfallSUSD: MoneySUSD;
  /** E4 public-enterprise capital contributions (capital transfer, not expense). */
  readonly publicEnterpriseSupportSUSD: MoneySUSD;
  /** M8 administration payroll requested/paid/shortfall. Optional pre-M8 = zero. */
  readonly administrationRequestedSUSD?: MoneySUSD;
  readonly administrationShortfallSUSD?: MoneySUSD;
  /** M9 education payroll requested/paid/shortfall. Optional pre-M9 = zero. */
  readonly educationRequestedSUSD?: MoneySUSD;
  readonly educationShortfallSUSD?: MoneySUSD;
  /** E5 training payroll+stipend requested/shortfall. Optional pre-E5 = zero. */
  readonly trainingRequestedSUSD?: MoneySUSD;
  readonly trainingShortfallSUSD?: MoneySUSD;
}

/**
 * E2 month-to-date budget memo accumulated by the daily fiscal phase, the
 * month-end business-profit tax phase, and the debt phase. It is moved into the
 * immutable period summary at the monthly close and reset. It is a reporting and
 * financing-requirement memo, not a liability.
 */
export interface FinanceBudgetMemo {
  readonly welfareRequestedSUSD: MoneySUSD;
  readonly welfareShortfallSUSD: MoneySUSD;
  readonly businessTaxAssessedSUSD: MoneySUSD;
  readonly businessTaxUncollectedSUSD: MoneySUSD;
  readonly debtIssuedSUSD: MoneySUSD;
  readonly principalRepaidSUSD: MoneySUSD;
  readonly interestPaidSUSD: MoneySUSD;
  readonly unfinancedRequirementSUSD: MoneySUSD;
  readonly constructionSpentSUSD: MoneySUSD;
  readonly constructionWrittenOffSUSD: MoneySUSD;
  readonly constructionMaterialsSpentSUSD: MoneySUSD;
  readonly subsidyRequestedSUSD: MoneySUSD;
  readonly subsidyShortfallSUSD: MoneySUSD;
  readonly publicEnterpriseSupportSUSD: MoneySUSD;
  /** M8 administration payroll requested/shortfall; optional pre-M8 = zero. */
  readonly administrationRequestedSUSD?: MoneySUSD;
  readonly administrationShortfallSUSD?: MoneySUSD;
  /** M9 education payroll requested/shortfall; optional pre-M9 = zero. */
  readonly educationRequestedSUSD?: MoneySUSD;
  readonly educationShortfallSUSD?: MoneySUSD;
  /** E5 training requested/shortfall; optional pre-E5 = zero. */
  readonly trainingRequestedSUSD?: MoneySUSD;
  readonly trainingShortfallSUSD?: MoneySUSD;
  /** Day of the most recent period-end business-tax assessment, if any. */
  readonly businessTaxAssessedDay: Day | null;
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
  /** Annual budget decomposition per country; exact sums of monthly values. */
  budgetTotals: Record<Id, FinancePeriodBudgetTotals>;
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
   * Month-to-date budget memo per country. This is a reporting and
   * financing-requirement memo, not a liability: unpaid welfare remains an unmet
   * budget and is never posted as a payable. Reset at monthly close after the
   * values are frozen into the period summary.
   */
  budgetMemosThisMonth: Record<Id, FinanceBudgetMemo>;
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
 * M4c/E2 per-country fiscal policy state.
 *
 * Every field is provisional hard-bounded policy, not law-bounded: M8 taxation
 * and budget laws may later replace enacted values. All amounts are nominal SUSD
 * and all rates are dimensionless.
 *
 * - `incomeTaxRate` is a flat rate on the taxable part of wages actually
 *   received, withheld daily by the fiscal phase.
 * - `incomeTaxAllowanceSUSDPerYear` is a per-pop-block annual exemption,
 *   pro-rated by the civil year length and subtracted from the block's actual
 *   daily wage receipt before the rate applies.
 * - `welfareBudgetSUSDPerYear` is a requested annual expenditure target, paid
 *   daily as `budget / daysInYear(civil year)`; it is not a spendable pool.
 * - `welfareMaxWealthLevel` is the inclusive eligibility ceiling on the block
 *   wealth level (0..99). 99 reproduces universal eligibility.
 * - `businessProfitTaxRate` is assessed once per civil month-end on each taxed
 *   building's positive period net result.
 * - `reserveTargetSUSD` is a treasury liquidity floor, not a spendable pool: the
 *   daily welfare transfer may not draw treasury cash below it, and a player
 *   principal repayment may not take cash below it.
 */
export interface FiscalPolicy {
  incomeTaxRate: Rate;
  incomeTaxAllowanceSUSDPerYear: MoneySUSD;
  welfareBudgetSUSDPerYear: MoneySUSD;
  welfareMaxWealthLevel: number;
  businessProfitTaxRate: Rate;
  reserveTargetSUSD: MoneySUSD;
}

/**
 * Scenario input for a fiscal policy. The M4c rate and welfare budget are
 * required for compatibility with existing authored content; E2 schedule,
 * eligibility, business-tax, and reserve fields default to their neutral values.
 */
export type FiscalPolicyInput = Pick<
  FiscalPolicy,
  "incomeTaxRate" | "welfareBudgetSUSDPerYear"
> &
  Partial<FiscalPolicy>;

/**
 * E4 industrial policy. `sectorSubsidyRates` is indexed by `BUILDING_SECTORS`
 * position and is an ad-valorem rate on verified daily gross output value at the
 * current market price. It is not a spendable pool: entitlement must be paid from
 * actual treasury cash and any shortfall is reported explicitly.
 */
export interface IndustrialPolicy {
  sectorSubsidyRates: Rate[];
}

export type IndustrialPolicyInput = Partial<IndustrialPolicy>;

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
 * E3 construction project status.
 *
 * - `authorized`: accepted but not yet started; it never progresses on the day
 *   it was authorized.
 * - `active`: at least one worker was hired on the most recent construction day.
 * - `waiting`: no progress that day because funds or idle labor were unavailable.
 * - `paused`: player-suspended; no hiring or spending.
 * - `completed`: the asset exists and the full authorized cost was spent.
 * - `cancelled`: stopped by the player; remaining budget is not a liability and
 *   the spent work-in-progress was written off.
 */
export const CONSTRUCTION_PROJECT_STATUSES = [
  "authorized",
  "active",
  "waiting",
  "paused",
  "completed",
  "cancelled",
] as const;
export type ConstructionProjectStatus = (typeof CONSTRUCTION_PROJECT_STATUSES)[number];

/**
 * One project's purchased/delivered material requirement. The required quantity
 * is snapshotted at authorization; delivered quantity increases only through real
 * market purchases. Purchases are immediately delivered to the project and their
 * cost is capitalized into work-in-progress.
 */
export interface ConstructionProjectMaterial {
  goodId: Id;
  requiredQuantity: number;
  deliveredQuantity: number;
}

/**
 * One persisted public-construction project.
 *
 * `totalCostSUSD` is the building definition's construction **labor** cost
 * snapshot at authorization; construction advances by gross labor payroll until
 * `spentSUSD` reaches it. `materialsSpentSUSD` is the actual market cost of
 * materials purchased/delivered for the project, also capitalized in
 * work-in-progress. `workingCapitalSUSD` is the completion endowment target
 * (30 days of the building's daily upkeep), paid from treasury only to the extent
 * cash is available. Project ids are stable and queue order is ascending id.
 */
export interface ConstructionProject {
  id: Id;
  countryId: Id;
  regionId: Id;
  definitionId: Id;
  status: ConstructionProjectStatus;
  authorizedDay: Day;
  startedDay: Day | null;
  completedDay: Day | null;
  cancelledDay: Day | null;
  totalCostSUSD: MoneySUSD;
  workingCapitalSUSD: MoneySUSD;
  workingCapitalPaidSUSD: MoneySUSD;
  /** Gross construction labor paid and capitalized. */
  spentSUSD: MoneySUSD;
  /** Actual market purchases of construction/commissioning materials, capitalized. */
  materialsSpentSUSD: MoneySUSD;
  /** Required and delivered material quantities, snapshotted at authorization. */
  materials: ConstructionProjectMaterial[];
  /** Workers hired on the most recent progress day (0 when waiting/paused). */
  lastWorkers: number;
  /** Why the most recent construction day made no progress, if it did not. */
  blockedReason: "labor" | "funds" | "materials" | null;
  /** Building created on completion; null otherwise. */
  buildingId: Id | null;
}

/**
 * Bounded per-country aggregate of projects whose individual records were
 * compacted. It preserves counts and capital amounts without building ids.
 */
export interface ConstructionHistoryAggregate {
  readonly countryId: Id;
  readonly projectsCompleted: number;
  readonly projectsCancelled: number;
  readonly totalSpentSUSD: MoneySUSD;
  readonly totalWrittenOffSUSD: MoneySUSD;
}

/** Authoritative E3 construction state. */
export interface ConstructionState {
  /** Active/paused projects plus the most recent terminated records. */
  projects: ConstructionProject[];
  /** Bounded aggregate of compacted completed/cancelled projects. */
  history: ConstructionHistoryAggregate[];
  /** Deterministic allocator for project ids. */
  nextProjectId: Id;
  /** Deterministic allocator for completed-building ids. */
  nextBuildingId: Id;
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

/**
 * M8 political definitions (GDD §9, D-076).
 *
 * These are validated static content. They are optional in `EconomyDefinitions`:
 * legacy M2–E4 fixtures carry no politics block and therefore no M8 behavior.
 */

/** The nine §9.2 law slots. Numeric ids are not slot ids; slots use these keys. */
export const LAW_SLOTS = [
  "suffrage",
  "taxation",
  "education",
  "health",
  "labor",
  "militaryService",
  "trade",
  "colonialPolicy",
  "currency",
] as const;
export type LawSlot = (typeof LAW_SLOTS)[number];

/** Slots with an implemented law option. Other slots are explicit deferrals. */
export const IMPLEMENTED_LAW_SLOTS: readonly LawSlot[] = [
  "suffrage",
  "taxation",
  "education",
  "health",
  "labor",
  "trade",
];

export const REGIME_KINDS = [
  "absolute-monarchy",
  "constitutional-monarchy",
  "republic",
] as const;
export type RegimeKind = (typeof REGIME_KINDS)[number];

export const INTEREST_GROUP_KEYS = [
  "aristocrats",
  "capitalists",
  "labor",
  "intelligentsia",
  "military",
  "bureaucrats",
  "rural",
] as const;
export type InterestGroupKey = (typeof INTEREST_GROUP_KEYS)[number];

export const CRISIS_STAGES = ["none", "unrest", "strike", "crisis", "revolution"] as const;
export type CrisisStage = (typeof CRISIS_STAGES)[number];

export const SUFFRAGE_KINDS = ["none", "property", "male", "universal"] as const;
export type SuffrageKind = (typeof SUFFRAGE_KINDS)[number];

export type TaxType = "incomeTax" | "businessProfitTax";

export interface LawTaxRateBound {
  taxType: TaxType;
  min: Rate;
  max: Rate;
}

export interface LawSuffrageRule {
  kind: SuffrageKind;
  /** Block wealth level at or above which a property-suffrage block is enfranchised. */
  propertyWealthLevel: number;
  /** Minimum voting age in completed years. */
  minAge: number;
}

/** One validated law definition. Ids are stable, positive, and slot-aware. */
export interface LawDef {
  id: Id;
  slot: LawSlot;
  key: string;
  name: string;
  description: string;
  /** Law ids that must already be enacted in their slots. */
  prerequisites: Id[];
  eligibleRegimes: RegimeKind[];
  /** Base enactment duration in civil days at institution quality 1. */
  enactmentDays: number;
  /** Statutory bounds applied to new fiscal actions and at enactment. */
  taxRateBounds: LawTaxRateBound[];
  /** Suffrage franchise definition for the suffrage slot, else null. */
  suffrage: LawSuffrageRule | null;
  /** Border access policy for the trade slot, else null. */
  borderPolicy: "open" | "closed" | null;
  /** Additive organisation for the labor group from the labor slot, otherwise 0. */
  laborOrganizationBonus: number;
  /** Additive grievance pressure from repression (0..1 scale), otherwise 0. */
  laborGrievance: number;
  /**
   * M9 education-slot attendance floor, 0..1. The effective floor is the
   * maximum with household attendance; actual attendance is still limited by
   * teaching capacity. Zero for every non-education law.
   */
  educationAttendanceFloor: Rate;
  /** M9 additive education-quality bonus, 0..1. Zero for non-education laws. */
  educationQualityBonus: Rate;
  /**
   * M9 technology prerequisites for this law. Every listed technology must be
   * researched by the country before the law is proposable.
   */
  requiredTechnologyIds: Id[];
  /**
   * E5 labor-slot full-time annual minimum wage floor in SUSD, or 0 when the law
   * imposes no floor. The daily obligation is the greater of the profession base
   * wage and this floor, prorated by the hours factor.
   */
  laborMinimumWageSUSDPerYear: MoneySUSD;
  /**
   * E5 labor-slot standard working week in hours, or 0 when the law does not set
   * one. The provisional 60-hour baseline scales capacity and wages; shorter weeks
   * reduce output and pay and modestly improve mortality.
   */
  laborHoursPerWeek: number;
  /**
   * E5 health-slot minimum public-health staff share of the administration clerk
   * base, 0..1, or 0 when the law sets no floor.
   */
  healthStaffFloor: Rate;
  /** Administrative load subtracted from institution quality/law factor. */
  institutionLoad: Rate;
  /** Authored stance for each interest group, -1..1. */
  groupStance: Record<InterestGroupKey, number>;
}

export interface RegimeDef {
  kind: RegimeKind;
  name: string;
  electionsEnabled: boolean;
  electionTermYears: number;
  /** Default law id per slot (0 means no enacted law). */
  defaultLaws: Record<LawSlot, Id>;
}

export interface InterestGroupDef {
  key: InterestGroupKey;
  name: string;
  /** Share of each profession's population claimed by this group, 0..1. */
  membershipByProfessionKey: Record<string, number>;
  /** Base organisation before literacy/wealth/law modifiers, 0..1. */
  organizationBase: Rate;
}

export type ScriptedEventEffect =
  | { kind: "militancy-pressure"; amount: Rate }
  | { kind: "unrest-pressure"; amount: Rate }
  | { kind: "institution-disruption"; days: number; qualityPenalty: Rate };

export interface ScriptedEventDef {
  id: Id;
  key: string;
  name: string;
  description: string;
  /** Country tag, or null for every country in the world. */
  countryTag: string | null;
  trigger: { year: number; month: number; day: number };
  effects: ScriptedEventEffect[];
  /** Data provenance for the event content (not a runtime claim). */
  provenance: string;
}

export interface PoliticsDefinitions {
  dataVersion: string;
  regimes: RegimeDef[];
  interestGroups: InterestGroupDef[];
  laws: LawDef[];
  events: ScriptedEventDef[];
  /** Profession keys whose population staffs the state administration. */
  administrationProfessionKeys: string[];
}

/**
 * M9 technology era ordinal. Era 1 is the earliest; a prerequisite may not come
 * from a later era than the technology it enables.
 */
export const MIN_TECHNOLOGY_ERA = 1;
export const MAX_TECHNOLOGY_ERA = 6;
export type TechnologyEra = 1 | 2 | 3 | 4 | 5 | 6;

/**
 * One validated technology effect (GDD §10.1, D-077).
 *
 * Building unlocks and law enables are declared on `BuildingDef.requiredTechnologyId`
 * and `LawDef.requiredTechnologyIds` so each has one source of truth; they are not
 * duplicated here. Military-capability effects belong to M10 and are not authored.
 */
export type TechnologyEffect =
  /**
   * Additive share applied to produced physical output for one building sector.
   * It increases output from the same executed throughput (and therefore the same
   * inputs); it is not a capacity or price modifier.
   */
  | { kind: "sector-productivity"; sector: BuildingSector; bonus: number }
  /** Multiplicative reduction of age/sex mortality (0..0.95). */
  | { kind: "mortality-reduction"; reduction: number }
  /** Additive education-quality term used by the literacy model (0..0.5). */
  | { kind: "education-effectiveness"; bonus: number };

/** One validated technology definition. */
export interface TechnologyDef {
  id: Id;
  key: string;
  name: string;
  era: TechnologyEra;
  description: string;
  /** Technology ids that must already be researched. */
  prerequisites: Id[];
  /** Required research work in researcher-days. Provisional content, not calibrated. */
  researchWork: number;
  effects: TechnologyEffect[];
}

/** Validated M9 technology content. Optional for legacy M2–M8 fixtures. */
export interface TechnologyDefinitions {
  dataVersion: string;
  /** Six human-readable era names, indexed from era 1. */
  eraNames: string[];
  technologies: TechnologyDef[];
  /** Profession keys whose people staff teaching and research. */
  academicProfessionKeys: string[];
}

/** One completed research result. */
export interface ResearchedTechnology {
  technologyId: Id;
  completedDay: Day;
}

/** The single active research project. Work lives in `workByTechnology`. */
export interface ResearchProject {
  technologyId: Id;
  startedDay: Day;
}

/**
 * Authoritative per-country technology state (D-077).
 *
 * `researched` is ascending by technology id and bounded by the definition count.
 * `workByTechnology` holds project-specific accumulated researcher-days for
 * started, incomplete projects only; work is never transferred between projects.
 */
export interface CountryTechnologyState {
  researched: ResearchedTechnology[];
  activeProject: ResearchProject | null;
  workByTechnology: Record<Id, number>;
}

/**
 * Authoritative per-country education institution state (D-077).
 *
 * Only the player's funding target, research staff share, and reporting memo are
 * stored. Staffing, capacity, enrollment, attendance, quality, and derived
 * productivity/mortality/education factors are recomputed from authoritative
 * population, technology, law, and finance state.
 */
export interface EducationState {
  /** Annual SUSD education/research payroll target. */
  fundedAnnualSUSD: MoneySUSD;
  /** Share of available academic workers assigned to research time, 0..1. */
  researchStaffShare: Rate;
  lastUpdateDay: Day | null;
  fundingRequestedMonthToDateSUSD: MoneySUSD;
  fundingShortfallMonthToDateSUSD: MoneySUSD;
}

/** Scenario input for one country's M9 technology and education state. */
export interface CountryTechnologyInput {
  /** Research technology keys that start completed. */
  researchedTechnologyKeys?: string[];
  educationFundingSUSDPerYear?: MoneySUSD;
  researchStaffShare?: Rate;
}

/** World-level M9 policy. `enabled` is authoritative scenario state. */
export interface TechnologySystemState {
  enabled: boolean;
}

/** Derived/cached M8 interest-group state (GDD §5.5). */
export interface InterestGroupState {
  id: Id;
  key: InterestGroupKey;
  membershipPopulation: number;
  organization: Rate;
  influence: Rate;
  stanceByLaw: Record<Id, number>;
}

/** Derived/cached M8 institution state (GDD §5.5, D-076). */
export interface InstitutionState {
  fundedAnnualSUSD: MoneySUSD;
  staffedByProfession: Record<Id, number>;
  serviceOutputIndex: number;
  quality: Rate;
  overload: Rate;
  /** First day after the most recent disruption, or null when undisturbed. */
  disruptionUntilDay: Day | null;
  /** Day of the most recent derivation, or null before world creation. */
  lastUpdateDay: Day | null;
  /** Month-to-date payroll request and unpaid shortfall (reporting memo). */
  fundingRequestedMonthToDateSUSD: MoneySUSD;
  fundingShortfallMonthToDateSUSD: MoneySUSD;
  /**
   * E5 share of the administration clerk base assigned to public health, 0..1.
   * Administration staffing is net of this share. Zero preserves M8 behaviour.
   */
  healthStaffShare: Rate;
}

/**
 * E5 labor/training policy and reporting memo.
 *
 * `trainingParticipation` is the authoritative monthly share of eligible
 * working-age people in part-time vocational training. It is set only by the
 * funded/staffed training service on the first civil day, not by time alone.
 */
export interface LaborPolicyState {
  /** Annual SUSD training provider payroll target. */
  trainingBudgetSUSDPerYear: MoneySUSD;
  /** Immediate annual stipend per trainee; zero means no stipend. */
  trainingStipendPerTraineeSUSDPerYear: MoneySUSD;
  /** Share of available academic staff time assigned to training, 0..1. */
  trainingStaffShare: Rate;
  /** Monthly training participation share of eligible working-age people, 0..1. */
  trainingParticipation: Rate;
  lastUpdateDay: Day | null;
  /** Month-to-date training request and unpaid shortfall (payroll + stipend). */
  trainingRequestedMonthToDateSUSD: MoneySUSD;
  trainingShortfallMonthToDateSUSD: MoneySUSD;
}

/** Scenario input for one country's E5 labor policy. */
export interface LaborPolicyInput {
  trainingBudgetSUSDPerYear?: MoneySUSD;
  trainingStipendPerTraineeSUSDPerYear?: MoneySUSD;
  trainingStaffShare?: Rate;
  healthStaffShare?: Rate;
}

export interface ElectionResult {
  day: Day;
  eligiblePopulation: number;
  votesForGovernment: number;
  votesForOpposition: number;
  governmentVoteShare: Rate;
  turnoutShare: Rate;
  previousGovernmentGroupKey: InterestGroupKey;
  winnerGroupKey: InterestGroupKey;
}

export interface CrisisState {
  stage: CrisisStage;
  sinceDay: Day;
  /** Accumulated days at or above the pressure threshold (hysteretic). */
  pressureDays: number;
  lastRevolutionDay: Day | null;
}

export interface RegimeState {
  kind: RegimeKind;
  sinceDay: Day;
  governmentGroupKey: InterestGroupKey;
  nextElectionDay: Day | null;
  lastElectionDay: Day | null;
  lastElection: ElectionResult | null;
  crisis: CrisisState;
}

/** One in-flight law transition. Bounded to `MAX_LAW_TRANSITIONS_PER_COUNTRY`. */
export interface LawTransition {
  id: Id;
  slot: LawSlot;
  fromLawId: Id;
  toLawId: Id;
  proposedDay: Day;
  effectiveDay: Day;
  source: "player" | "ai" | "event";
  support: number;
}

/** A scheduled scripted M8 event. `definitionId` refers to the politics data. */
export interface ScheduledEvent {
  id: Id;
  definitionId: Id;
  key: string;
  countryId: Id;
  dueDay: Day;
  appliedDay: Day | null;
  status: "scheduled" | "applied" | "skipped";
  provenance: string;
}

/** Bounded M8 event/decision log entry (provenance, not a second authority). */
export interface PoliticsLogEntry {
  id: Id;
  day: Day;
  kind: "event" | "election" | "law" | "crisis" | "revolution" | "warning";
  countryId: Id | null;
  summary: string;
  provenance: string;
}

/** World-level M8 state. `enabled` is an authoritative scenario policy. */
export interface PoliticsState {
  enabled: boolean;
  eventQueue: ScheduledEvent[];
  eventLog: PoliticsLogEntry[];
  nextEventId: Id;
  nextLogId: Id;
}

/** Scenario input for one country's M8 political state. */
export interface CountryPoliticsInput {
  regimeKind: RegimeKind;
  governmentGroupKey?: InterestGroupKey;
  /** Law keys by slot; omitted slots use the regime default. */
  laws?: Partial<Record<LawSlot, string>>;
  institutionFundingSUSDPerYear?: MoneySUSD;
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
  /** E4 sectoral production-subsidy policy. */
  industrial: IndustrialPolicy;
  /** M5b provisional public-debt policy state. */
  debt: DebtPolicy;
  /** M6 persisted country-AI schedule and goal state. */
  ai: CountryAIState;
  /** M8 regime, elections, and crisis state. */
  regime: RegimeState;
  /** M8 enacted law id per slot; 0 means no implemented law in that slot. */
  laws: Record<LawSlot, Id>;
  /** M8 in-flight law transitions, ascending id, bounded. */
  lawTransitions: LawTransition[];
  /** M8 derived/cached interest groups, fixed seven keys. */
  interestGroups: InterestGroupState[];
  /** M8 derived/cached state administration. */
  institutions: InstitutionState;
  /** M9 per-country technology and research state. */
  technology: CountryTechnologyState;
  /** M9 per-country education institution policy and reporting memo. */
  education: EducationState;
  /** E5 per-country training policy and reporting memo. */
  labor: LaborPolicyState;
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
  fiscal: FiscalPolicyInput;
  /** E4 industrial policy; omitted means all sector subsidy rates are zero. */
  industrial?: IndustrialPolicyInput;
  /** Defaults to disabled for M0–M5a fixtures. */
  debt?: DebtPolicy;
  /** Defaults to false for M4 fixtures that predate M5. */
  immigrationOpen?: boolean;
  /** M8 political state; omitted means the regime/definition defaults. */
  politics?: CountryPoliticsInput;
  /** M9 technology/education initial state; omitted means no researched techs and zero funding. */
  technology?: CountryTechnologyInput;
  /** E5 labor/health initial policy; omitted means neutral zero budgets/shares. */
  labor?: LaborPolicyInput;
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
