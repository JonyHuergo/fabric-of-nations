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

import type { Day, Id, MoneyRUSD, Rate } from "../types.js";
import type { PopulationScenarioDef } from "../population/types.js";
import type { ProvinceScenarioInput } from "../provinces/types.js";

export const GOOD_CATEGORIES = ["food", "raw", "industrial", "luxury", "service"] as const;
export type GoodCategory = (typeof GOOD_CATEGORIES)[number];

export interface GoodDef {
  id: Id;
  key: string;
  name: string;
  category: GoodCategory;
  /** Nominal 1900 RUSD per physical unit. Provisional. */
  basePrice1900RUSD: MoneyRUSD;
  /** RUSD per physical unit. M3 single-market data uses 0. */
  transportCostPerUnit: MoneyRUSD;
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
  /** Nominal 1900 annual wage in RUSD. Provisional. */
  baseWage1900RUSDPerYear: MoneyRUSD;
  /** Training cost in RUSD. M3 has no training behavior. */
  trainingCostRUSD: MoneyRUSD;
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
  constructionCostRUSD: MoneyRUSD;
  /**
   * E3 maximum daily construction crew for this project type. The crew is hired
   * from idle eligible workers and paid their profession's base daily wage; the
   * project advances only as that gross payroll accumulates toward the cost.
   */
  constructionWorkers: number;
  /**
   * E4 materials/commissioning inputs bought from the provincial market and consumed
   * by construction. Empty for project types with no modeled material requirement.
   */
  constructionMaterials: ConstructionMaterialDef[];
  dailyUpkeepRUSDAtLevelOne: MoneyRUSD;
  storageCapacityByGood: StorageCapacityDef[];
  /** M3 requires this list to be empty; provincial resource limits are deferred. */
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
  provinceId: Id;
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
  /**
   * P2b technique factor (D-135): output per staffed throughput unit relative to the
   * definition, dimensionless and positive. It stands for the land, capital and
   * method embodied in this plant that the model does not yet represent (P5 land,
   * P10 investment replace it); 1 is the definition's reference technique. Fixed for
   * the life of the building.
   */
  technique: number;
}

/**
 * P2b (D-135) scenario money coefficients: the RUSD amounts that have no per-entity
 * home in the data (military costs and the per-unit funding benchmarks). They belong
 * to the scenario's money scale, so each scenario authors them with its sources; a
 * scenario without them uses DEFAULT_MONEY_COEFFICIENTS (the pre-P2b constants).
 * All values are RUSD and strictly positive.
 */
export interface MoneyCoefficients {
  /** M10 signing cost per recruited soldier, paid to the soldiers' households. */
  recruitmentCostPerSoldierRUSD: number;
  /** M10 price of one equipment unit (equips M10_SOLDIERS_PER_EQUIPMENT_UNIT soldiers). */
  equipmentPriceRUSD: number;
  /** M10 daily pay per soldier. */
  soldierDailyPayRUSD: number;
  /** M10 daily upkeep per equipment unit. */
  equipmentDailyUpkeepRUSD: number;
  /** M10 daily garrison procurement per occupying soldier. */
  garrisonCostPerSoldierPerDayRUSD: number;
  /** M8/E5 administration funding benchmark per inhabitant per year. */
  adminFundingPerCapitaPerYearRUSD: number;
  /** M9 education funding benchmark per academic staff member per year. */
  educationFundingPerStaffPerYearRUSD: number;
  /** E5 provider cost per academic instructor per year. */
  trainingInstructorCostPerYearRUSD: number;
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

/**
 * A market is a customs territory (D-119): one inventory and price pool with one
 * tariff authority. Its provinces are derived from `ProvinceEconomy.marketId`; its
 * member countries are the owners of those provinces.
 */
export interface Market {
  id: Id;
  /** RUSD per physical unit, indexed by good id. */
  priceRUSD: number[];
  /** Sole authoritative inventory representation. */
  stockLots: StockLot[];
  /**
   * Administrator of the customs territory (D-119): the country whose tariff
   * schedule applies, or null in a countryless fixture. A shipment between two
   * markets is dutiable only when their administrations differ; intra-market pooled
   * allocation is never dutiable (D-079).
   */
  customsCountryId: Id | null;
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
  "freight-expense",
  "customs-duty-expense",
  "customs-duty-revenue",
  "monetary-reserve-cash",
  "currency-liability",
  "monetary-equity",
  "external-cash",
  "external-currency-holding",
  "external-equity",
  "military-income",
  "military-expense",
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
  balanceRUSD: MoneyRUSD;
}

export type JournalSide = "debit" | "credit";

export interface JournalLine {
  accountId: Id;
  side: JournalSide;
  /** Strictly positive RUSD. */
  amountRUSD: MoneyRUSD;
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
  "trade-freight",
  "customs-duty",
  "monetary-reserve-contribution",
  "fx-issuance",
  "fx-redemption",
  "fx-revaluation",
  "military-pay",
  "military-procurement",
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
  accountTotals: Record<Id, MoneyRUSD>;
  flowTotalsByKind: Record<FlowTransactionKind, MoneyRUSD>;
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
  readonly incomeTaxRevenueRUSD: MoneyRUSD;
  /** E2 business-profit tax revenue collected through the treasury. */
  readonly businessTaxRevenueRUSD: MoneyRUSD;
  readonly welfareExpenseRUSD: MoneyRUSD;
  readonly interestExpenseRUSD: MoneyRUSD;
  /** E4 sectoral production-subsidy expense paid through the treasury. */
  readonly subsidyExpenseRUSD: MoneyRUSD;
  /**
   * M8 public-administration payroll paid through the treasury. Optional for
   * pre-M8 summaries/fixtures; absent means zero (D-076).
   */
  readonly administrationExpenseRUSD?: MoneyRUSD;
  /** M9 education/research payroll paid through the treasury. Optional pre-M9 = zero. */
  readonly educationExpenseRUSD?: MoneyRUSD;
  /** E5 training provider payroll and trainee stipend. Optional pre-E5 = zero. */
  readonly trainingExpenseRUSD?: MoneyRUSD;
  /** M10 military pay, equipment, and garrison procurement. Optional pre-M10 = zero. */
  readonly militaryExpenseRUSD?: MoneyRUSD;
  /** E6a customs duty actually collected on dutiable shipments. Optional pre-E6a = zero. */
  readonly customsDutyRevenueRUSD?: MoneyRUSD;
  /** Tax revenue minus welfare, interest, subsidy, administration, education, training, and customs is not subtracted (customs is revenue). */
  readonly netFiscalResultRUSD: MoneyRUSD;
}

/**
 * E2 budget decomposition retained per closed period (D-073).
 *
 * These amounts separate what was requested/assessed from what was actually paid
 * or collected, and separate deficit financing from revenue and expense:
 *
 * - `welfareRequestedRUSD` is the authorized daily budget share accumulated over
 *   the period, including any amount the treasury could not pay.
 * - `welfareShortfallRUSD` is the unpaid part. It is an unmet budget, never a
 *   liability, and `welfareRequested = welfarePaid + welfareShortfall` exactly
 *   (welfare paid is the period `welfareExpenseRUSD`).
 * - `businessTaxAssessedRUSD` is the period-end assessment; collected revenue is
 *   the period `businessTaxRevenueRUSD` and `businessTaxUncollectedRUSD` is the
 *   difference that exceeded a building's operating cash (no receivable is
 *   created).
 * - `debtIssuedRUSD` and `principalRepaidRUSD` are financing movements, not
 *   revenue or expense. `interestPaidRUSD` is the cash coupon/maturity payment,
 *   distinct from the accrued `interestExpenseRUSD`. `unfinancedRequirementRUSD`
 *   is the month-end financing requirement left unfunded by the creditor,
 *   ceiling, and contract-cap constraints.
 */
export interface FinancePeriodBudgetTotals {
  readonly welfareRequestedRUSD: MoneyRUSD;
  readonly welfareShortfallRUSD: MoneyRUSD;
  readonly businessTaxAssessedRUSD: MoneyRUSD;
  readonly businessTaxUncollectedRUSD: MoneyRUSD;
  readonly debtIssuedRUSD: MoneyRUSD;
  readonly principalRepaidRUSD: MoneyRUSD;
  readonly interestPaidRUSD: MoneyRUSD;
  readonly unfinancedRequirementRUSD: MoneyRUSD;
  /** E3 gross construction labor paid (capitalized, not an expense). */
  readonly constructionSpentRUSD: MoneyRUSD;
  /** E3 work-in-progress written off on cancellation. */
  readonly constructionWrittenOffRUSD: MoneyRUSD;
  /** E4 construction/commissioning materials purchased and capitalized. */
  readonly constructionMaterialsSpentRUSD: MoneyRUSD;
  /** E4 sectoral subsidy entitlement and unpaid shortfall. */
  readonly subsidyRequestedRUSD: MoneyRUSD;
  readonly subsidyShortfallRUSD: MoneyRUSD;
  /** E4 public-enterprise capital contributions (capital transfer, not expense). */
  readonly publicEnterpriseSupportRUSD: MoneyRUSD;
  /** M8 administration payroll requested/paid/shortfall. Optional pre-M8 = zero. */
  readonly administrationRequestedRUSD?: MoneyRUSD;
  readonly administrationShortfallRUSD?: MoneyRUSD;
  /** M9 education payroll requested/paid/shortfall. Optional pre-M9 = zero. */
  readonly educationRequestedRUSD?: MoneyRUSD;
  readonly educationShortfallRUSD?: MoneyRUSD;
  /** E5 training payroll+stipend requested/shortfall. Optional pre-E5 = zero. */
  readonly trainingRequestedRUSD?: MoneyRUSD;
  readonly trainingShortfallRUSD?: MoneyRUSD;
}

/**
 * E2 month-to-date budget memo accumulated by the daily fiscal phase, the
 * month-end business-profit tax phase, and the debt phase. It is moved into the
 * immutable period summary at the monthly close and reset. It is a reporting and
 * financing-requirement memo, not a liability.
 */
export interface FinanceBudgetMemo {
  readonly welfareRequestedRUSD: MoneyRUSD;
  readonly welfareShortfallRUSD: MoneyRUSD;
  readonly businessTaxAssessedRUSD: MoneyRUSD;
  readonly businessTaxUncollectedRUSD: MoneyRUSD;
  readonly debtIssuedRUSD: MoneyRUSD;
  readonly principalRepaidRUSD: MoneyRUSD;
  readonly interestPaidRUSD: MoneyRUSD;
  readonly unfinancedRequirementRUSD: MoneyRUSD;
  readonly constructionSpentRUSD: MoneyRUSD;
  readonly constructionWrittenOffRUSD: MoneyRUSD;
  readonly constructionMaterialsSpentRUSD: MoneyRUSD;
  readonly subsidyRequestedRUSD: MoneyRUSD;
  readonly subsidyShortfallRUSD: MoneyRUSD;
  readonly publicEnterpriseSupportRUSD: MoneyRUSD;
  /** M8 administration payroll requested/shortfall; optional pre-M8 = zero. */
  readonly administrationRequestedRUSD?: MoneyRUSD;
  readonly administrationShortfallRUSD?: MoneyRUSD;
  /** M9 education payroll requested/shortfall; optional pre-M9 = zero. */
  readonly educationRequestedRUSD?: MoneyRUSD;
  readonly educationShortfallRUSD?: MoneyRUSD;
  /** E5 training requested/shortfall; optional pre-E5 = zero. */
  readonly trainingRequestedRUSD?: MoneyRUSD;
  readonly trainingShortfallRUSD?: MoneyRUSD;
  /** Day of the most recent period-end business-tax assessment, if any. */
  readonly businessTaxAssessedDay: Day | null;
}

/** Year-end balance-sheet values retained by an annual summary. */
export interface AnnualClosingBalances {
  readonly treasuryCashRUSD: MoneyRUSD;
  /** Debt principal liability, excluding accrued interest payable. */
  readonly debtLiabilityRUSD: MoneyRUSD;
  readonly interestPayableRUSD: MoneyRUSD;
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
  flowTotalsByKind: Record<FlowTransactionKind, MoneyRUSD>;
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
 * RUSD-equivalent value of one unit of a currency.
 *
 * This is not a MoneyRUSD amount: its unit is RUSD per one currency unit.
 * The brand is compile-time only; serialized state remains a plain JSON number.
 * D-003 deliberately avoided branded numeric types for ordinary state, but this
 * value has distinct dimensions and the M4a-2 design review explicitly requires
 * dimensional separation. It is the narrow exception recorded in D-044.
 */
declare const rusdPerCurrencyUnitBrand: unique symbol;
export type RusdPerCurrencyUnit = number & {
  readonly [rusdPerCurrencyUnitBrand]: true;
};

/** Identity of the entity that issues a currency. */
export type CurrencyIssuer =
  | { kind: "country"; countryId: Id }
  | { kind: "foreign"; issuerKey: string }
  | { kind: "union"; unionKey: string };

export interface Currency {
  id: Id;
  /** Stable lower-case key; never `rusd` in any casing. */
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
 * and budget laws may later replace enacted values. All amounts are nominal RUSD
 * and all rates are dimensionless.
 *
 * - `incomeTaxRate` is a flat rate on the taxable part of wages actually
 *   received, withheld daily by the fiscal phase.
 * - `incomeTaxAllowanceRUSDPerYear` is a per-pop-block annual exemption,
 *   pro-rated by the civil year length and subtracted from the block's actual
 *   daily wage receipt before the rate applies.
 * - `welfareBudgetRUSDPerYear` is a requested annual expenditure target, paid
 *   daily as `budget / daysInYear(civil year)`; it is not a spendable pool.
 * - `welfareMaxWealthLevel` is the inclusive eligibility ceiling on the block
 *   wealth level (0..99). 99 reproduces universal eligibility.
 * - `businessProfitTaxRate` is assessed once per civil month-end on each taxed
 *   building's positive period net result.
 * - `reserveTargetRUSD` is a treasury liquidity floor, not a spendable pool: the
 *   daily welfare transfer may not draw treasury cash below it, and a player
 *   principal repayment may not take cash below it.
 */
export interface FiscalPolicy {
  incomeTaxRate: Rate;
  incomeTaxAllowanceRUSDPerYear: MoneyRUSD;
  welfareBudgetRUSDPerYear: MoneyRUSD;
  welfareMaxWealthLevel: number;
  businessProfitTaxRate: Rate;
  reserveTargetRUSD: MoneyRUSD;
}

/**
 * Scenario input for a fiscal policy. The M4c rate and welfare budget are
 * required for compatibility with existing authored content; E2 schedule,
 * eligibility, business-tax, and reserve fields default to their neutral values.
 */
export type FiscalPolicyInput = Pick<
  FiscalPolicy,
  "incomeTaxRate" | "welfareBudgetRUSDPerYear"
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
  /** Maximum total outstanding principal, in RUSD. */
  maxOutstandingPrincipalRUSD: MoneyRUSD;
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
  readonly principalIssuedRUSD: MoneyRUSD;
  readonly principalRepaidRUSD: MoneyRUSD;
  readonly principalWrittenOffRUSD: MoneyRUSD;
  readonly interestWrittenOffRUSD: MoneyRUSD;
}

/** M5b public-debt contract. Persisted in `FinanceState`. */
export interface DebtContract {
  id: Id;
  /** Contract schema version; M5b defines version 1. */
  contractVersion: 1;
  issuerCountryId: Id;
  holderKind: "country" | "popBlock";
  holderId: Id;
  principalRUSD: MoneyRUSD;
  outstandingPrincipalRUSD: MoneyRUSD;
  annualCouponRate: Rate;
  issueDay: Day;
  maturityDay: Day;
  /** Accrued but unpaid coupon interest. */
  accruedInterestRUSD: MoneyRUSD;
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
 * `totalCostRUSD` is the building definition's construction **labor** cost
 * snapshot at authorization; construction advances by gross labor payroll until
 * `spentRUSD` reaches it. `materialsSpentRUSD` is the actual market cost of
 * materials purchased/delivered for the project, also capitalized in
 * work-in-progress. `workingCapitalRUSD` is the completion endowment target
 * (30 days of the building's daily upkeep), paid from treasury only to the extent
 * cash is available. Project ids are stable and queue order is ascending id.
 */
export interface ConstructionProject {
  id: Id;
  countryId: Id;
  provinceId: Id;
  definitionId: Id;
  status: ConstructionProjectStatus;
  authorizedDay: Day;
  startedDay: Day | null;
  completedDay: Day | null;
  cancelledDay: Day | null;
  totalCostRUSD: MoneyRUSD;
  workingCapitalRUSD: MoneyRUSD;
  workingCapitalPaidRUSD: MoneyRUSD;
  /** Gross construction labor paid and capitalized. */
  spentRUSD: MoneyRUSD;
  /** Actual market purchases of construction/commissioning materials, capitalized. */
  materialsSpentRUSD: MoneyRUSD;
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
  readonly totalSpentRUSD: MoneyRUSD;
  readonly totalWrittenOffRUSD: MoneyRUSD;
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
  "currency",
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
   * E5 labor-slot full-time annual minimum wage floor in RUSD, or 0 when the law
   * imposes no floor. The daily obligation is the greater of the profession base
   * wage and this floor, prorated by the hours factor.
   */
  laborMinimumWageRUSDPerYear: MoneyRUSD;
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
  /**
   * E6b currency-slot monetary regime backed by the law, or null when the law is not a
   * currency law. The managed regime is available only through an enacted law (D-080).
   */
  currencyRegime: MonetaryRegime | null;
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
  /** Annual RUSD education/research payroll target. */
  fundedAnnualRUSD: MoneyRUSD;
  /** Share of available academic workers assigned to research time, 0..1. */
  researchStaffShare: Rate;
  lastUpdateDay: Day | null;
  fundingRequestedMonthToDateRUSD: MoneyRUSD;
  fundingShortfallMonthToDateRUSD: MoneyRUSD;
}

/** Scenario input for one country's M9 technology and education state. */
export interface CountryTechnologyInput {
  /** Research technology keys that start completed. */
  researchedTechnologyKeys?: string[];
  educationFundingRUSDPerYear?: MoneyRUSD;
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
  fundedAnnualRUSD: MoneyRUSD;
  staffedByProfession: Record<Id, number>;
  serviceOutputIndex: number;
  quality: Rate;
  overload: Rate;
  /** First day after the most recent disruption, or null when undisturbed. */
  disruptionUntilDay: Day | null;
  /** Day of the most recent derivation, or null before world creation. */
  lastUpdateDay: Day | null;
  /** Month-to-date payroll request and unpaid shortfall (reporting memo). */
  fundingRequestedMonthToDateRUSD: MoneyRUSD;
  fundingShortfallMonthToDateRUSD: MoneyRUSD;
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
  /** Annual RUSD training provider payroll target. */
  trainingBudgetRUSDPerYear: MoneyRUSD;
  /** Immediate annual stipend per trainee; zero means no stipend. */
  trainingStipendPerTraineeRUSDPerYear: MoneyRUSD;
  /** Share of available academic staff time assigned to training, 0..1. */
  trainingStaffShare: Rate;
  /** Monthly training participation share of eligible working-age people, 0..1. */
  trainingParticipation: Rate;
  lastUpdateDay: Day | null;
  /** Month-to-date training request and unpaid shortfall (payroll + stipend). */
  trainingRequestedMonthToDateRUSD: MoneyRUSD;
  trainingShortfallMonthToDateRUSD: MoneyRUSD;
}

/** Scenario input for one country's E5 labor policy. */
export interface LaborPolicyInput {
  trainingBudgetRUSDPerYear?: MoneyRUSD;
  trainingStipendPerTraineeRUSDPerYear?: MoneyRUSD;
  trainingStaffShare?: Rate;
  healthStaffShare?: Rate;
}

/**
 * E6a per-country trade policy and month-to-date trade memo (D-079).
 *
 * Every array is indexed by good id and therefore bounded by the validated good
 * catalog. None is a spendable pool: `tariffRates` is an ad-valorem rate applied to
 * an actual dutiable shipment, `importQuotaQuantity` is a monthly physical quantity
 * ceiling with a deterministic month-to-date counter, and `exportRestricted` is a
 * per-good prohibition. The memo fields are reporting only and reset on the first
 * civil day of each month.
 */
export interface TradePolicyState {
  /** Ad-valorem import duty rate per good, 0..1, applied at the customs boundary. */
  tariffRates: Rate[];
  /** Monthly import quantity ceiling per good in physical units, or null for none. */
  importQuotaQuantity: (number | null)[];
  /** Month-to-date imported physical quantity per good. */
  importQuotaUsedQuantity: number[];
  /** Per-good prohibition on exports by this country's buildings. */
  exportRestricted: boolean[];
  /** Day of the most recent trade-policy change, or null before any change. */
  lastUpdateDay: Day | null;
  /** Month-to-date cargo value exported by this country's buildings. */
  exportsValueMonthToDateRUSD: MoneyRUSD;
  /** Month-to-date cargo value imported into this country's customs zone. */
  importsValueMonthToDateRUSD: MoneyRUSD;
  /** Month-to-date duty received as the importing administration. */
  dutyReceivedMonthToDateRUSD: MoneyRUSD;
  /** Month-to-date duty paid by this country's buildings as exporters. */
  dutyPaidMonthToDateRUSD: MoneyRUSD;
  /** Month-to-date freight paid by this country's buildings. */
  freightPaidMonthToDateRUSD: MoneyRUSD;
}

/** Scenario input for one country's E6a trade policy; omitted fields are neutral. */
export interface TradePolicyInput {
  tariffRates?: Rate[];
  importQuotaQuantity?: (number | null)[];
  exportRestricted?: boolean[];
}

/**
 * One authored, validated transport connection between two markets (D-079).
 *
 * `marketAId` is always the lower market id so the pair has one canonical identity.
 * Distance and base capacity are provisional sample content, not measurements. The
 * usable capacity is derived from these values and the two markets' infrastructure;
 * it is a daily flow limit, never accumulated.
 */
export interface TradeRoute {
  id: Id;
  marketAId: Id;
  marketBId: Id;
  /** Route distance in provisional distance units; transit days = ceil(distance). */
  distanceUnits: number;
  /** Unscaled daily cargo-value capacity in RUSD at infrastructure 1. */
  baseCapacityRUSDPerDay: MoneyRUSD;
}

/** Scenario input for one component route; ids are assigned deterministically. */
export interface TradeRouteInitialDef {
  marketAId: Id;
  marketBId: Id;
  distanceUnits: number;
  baseCapacityRUSDPerDay: MoneyRUSD;
}

/**
 * One in-transit consignment (D-079).
 *
 * The seller keeps ownership while the goods are in transit. The goods are not part
 * of any market's stock until arrival, so they are never double-counted. Freight and
 * duty were paid and posted at dispatch; `cargoValueRUSD` is the origin-price value
 * used for capacity, duty, and reporting.
 */
export interface TradeShipment {
  id: Id;
  goodId: Id;
  /** Physical units in transit. */
  quantity: number;
  sellerBuildingId: Id;
  originMarketId: Id;
  destinationMarketId: Id;
  originCountryId: Id | null;
  destinationCountryId: Id | null;
  dispatchDay: Day;
  arrivalDay: Day;
  cargoValueRUSD: MoneyRUSD;
  freightCostRUSD: MoneyRUSD;
  dutyRUSD: MoneyRUSD;
  dutyRate: Rate;
}

/** Why a would-be shipment did not happen. Diagnostic only, never an authority. */
export const TRADE_BLOCK_REASONS = [
  "stock",
  "capacity",
  "quota",
  "export-restricted",
  "margin",
  "funding",
  "fx-convertibility",
] as const;
export type TradeBlockReason = (typeof TRADE_BLOCK_REASONS)[number];

/** One bounded, deterministic blocked-shipment diagnostic. */
export interface TradeBlockedDiagnostic {
  originMarketId: Id;
  destinationMarketId: Id;
  goodId: Id;
  reason: TradeBlockReason;
}

/** Last processed day's trade outcome, retained for explanation. */
export interface TradeDayReport {
  dayIndex: Day;
  dispatchedShipments: number;
  freightPaidRUSD: MoneyRUSD;
  dutyPaidRUSD: MoneyRUSD;
  /** Freight/duty funded by the shipping building's owner as a capital injection. */
  ownerFundedRUSD: MoneyRUSD;
  arrivedShipments: number;
  /** Ascending (origin, destination, good, reason) order; bounded. */
  blocked: TradeBlockedDiagnostic[];
}

/** Authoritative E6a trade state. */
export interface TradeState {
  /** True only when the scenario authored at least one route. */
  enabled: boolean;
  /** Authored component routes, ascending id. */
  routes: TradeRoute[];
  /** Bounded in-transit consignments, ascending id. */
  shipments: TradeShipment[];
  /** Deterministic allocator for shipment ids. */
  nextShipmentId: Id;
  /**
   * Day of the most recent dispatch phase, used to reject a repeated dispatch for
   * the same day. `null` before the first processed day.
   */
  lastDispatchDay: Day | null;
  /** Last processed day's summary, or null before the first processed day. */
  lastDay: TradeDayReport | null;
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
  institutionFundingRUSDPerYear?: MoneyRUSD;
}

export interface Country {
  id: Id;
  tag: string;
  name: string;
  monetary: MonetaryArrangement;
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
  /** E6a per-country trade policy, quota usage, and reporting memo. */
  trade: TradePolicyState;
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
 * `initialTreasuryCashRUSD` is applied once through the opening-balance record.
 */
export interface CountryInitialDef {
  id: Id;
  tag: string;
  name: string;
  monetary: MonetaryArrangement;
  /**
   * Provinces this country owns on the start day. The world records them as
   * `ProvinceOwnership` (D-118); the country itself stores no territory. With province
   * definitions, this must equal the provinces whose initial owner is this country.
   */
  provinceIds: Id[];
  treasuryAccountId: Id;
  initialTreasuryCashRUSD: MoneyRUSD;
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
  /** E6a trade policy; omitted means zero tariffs, no quota, no export restriction. */
  trade?: TradePolicyInput;
}

/**
 * Authoritative RUSD-relative valuation of one currency. `specified` carries
 * the value; `unavailable` explicitly records that no value is known and never
 * defaults to parity.
 */
export type CurrencyValuation =
  | {
      currencyId: Id;
      status: "specified";
      rusdPerUnit: RusdPerCurrencyUnit;
      setOnDay: Day;
      source: "scenario" | "policy" | "market";
    }
  | { currencyId: Id; status: "unavailable" };

/** E6b exchange-rate regimes. `pegged` is the default; `managed` requires a law. */
export const MONETARY_REGIMES = ["pegged", "managed"] as const;
export type MonetaryRegime = (typeof MONETARY_REGIMES)[number];

/**
 * E6b per-currency monetary-authority state (D-080).
 *
 * The authority is a reserve-backed currency board: it holds RUSD reserves, issues its
 * currency against them, and holds monetary equity. All balances are RUSD; the currency
 * itself is recorded as units and measured at the authoritative `CurrencyValuation`.
 * `currencyIssuedUnits` is authoritative; the liability and the external holding are its
 * RUSD measurement and are validated against `units × valuation`.
 */
export interface MonetaryCurrencyState {
  currencyId: Id;
  /** Simulated country that issues the currency, or null when no authority exists. */
  issuerCountryId: Id | null;
  regime: MonetaryRegime;
  /** Current policy parity in RUSD per currency unit; null until a parity is declared. */
  parityRusdPerUnit: RusdPerCurrencyUnit | null;
  /** The declared reference parity; managed valuations are bounded around it. */
  referenceParityRusdPerUnit: RusdPerCurrencyUnit | null;
  /** Currency units in circulation. */
  currencyIssuedUnits: number;
  /** True once the authority has been established and is operating. */
  active: boolean;
  /** Explicit account ids; null when the monetary system is disabled. */
  reserveAccountId: Id | null;
  liabilityAccountId: Id | null;
  equityAccountId: Id | null;
  externalCashAccountId: Id | null;
  externalCurrencyAccountId: Id | null;
  externalEquityAccountId: Id | null;
  /** Day of the most recent parity change, or null. */
  lastParityChangeDay: Day | null;
  /** Day the managed valuation rule last ran (idempotency marker). */
  lastManagedUpdateDay: Day | null;
  /** Day of the last completed-mouth capture (idempotency marker). */
  lastMonthEndDay: Day | null;
  /** Realized exports/imports of the most recently completed month, RUSD. */
  lastMonthExportsRUSD: MoneyRUSD;
  lastMonthImportsRUSD: MoneyRUSD;
}

/** Authoritative E6b monetary-system state. */
export interface MonetaryState {
  /** True only when the scenario enables the monetary system. */
  enabled: boolean;
  /** One record per registered currency, ascending currency id. */
  currencies: MonetaryCurrencyState[];
  /** Last processed monetary phase day, or null before the first day. */
  lastUpdateDay: Day | null;
}

/** Scenario input for one currency's initial monetary-authority position. */
export interface MonetaryCurrencyInput {
  currencyId: Id;
  regime?: MonetaryRegime;
  /** Declared parity; defaults to the scenario's specified valuation. */
  parityRusdPerUnit?: number;
  /** Opening reserves capitalized by the issuing country's treasury. */
  reserveFundingRUSD?: MoneyRUSD;
  /** Opening currency units in circulation held by the external counterparty. */
  currencyIssuedUnits?: number;
  /** Opening RUSD cash of the external counterparty. Must cover its opening holding. */
  externalCashRUSD?: MoneyRUSD;
}

/** Scenario input for the E6b monetary system; omitted means disabled. */
export interface MonetarySystemInput {
  currencies?: MonetaryCurrencyInput[];
}

/** One fixed basket item of the E6b price index. */
export interface PriceIndexBasketItem {
  goodId: Id;
  /** Fixed base-quantity weight; dimensionless after normalization. */
  weight: number;
}

/** One market's base-period prices, captured at world creation. */
export interface PriceIndexBasePrices {
  marketId: Id;
  prices: number[];
}

/** One country's index value in an observation. */
export interface PriceIndexCountryValue {
  countryId: Id;
  value: number;
}

/** One bounded month-end price-index observation (base = 100 at world start). */
export interface PriceIndexObservation {
  year: number;
  month: number;
  dayIndex: Day;
  world: number;
  /** Ascending country id. */
  countries: PriceIndexCountryValue[];
}

/**
 * E6b price-index state (D-080): the fixed basket, the base-period prices, and at most
 * `MAX_PRICE_INDEX_OBSERVATIONS` month-end observations. Current index values are
 * derived from current prices and are not stored.
 */
export interface PriceIndexState {
  basket: PriceIndexBasketItem[];
  basePrices: PriceIndexBasePrices[];
  observations: PriceIndexObservation[];
  lastObservationDay: Day | null;
}

export interface BuildingInstanceInitialDef {  id: Id;
  definitionId: Id;
  provinceId: Id;
  level: number;
  condition: Rate;
  ownerKind: "private" | "state";
  ownerAccountId: Id;
  builtOnDay: Day;
  operational: boolean;
  operatingCashAccountId: Id;
  initialOperatingCashRUSD: MoneyRUSD;
  /** P2b technique factor; defaults to 1 (the definition's reference technique). */
  technique?: number;
}

export interface MarketInitialDef {
  id: Id;
  /** Provinces in this customs territory on the start day. */
  provinceIds: Id[];
  priceRUSD: number[];
  stockLots: StockLot[];
  /** Customs-territory administrator; omitted means the owner of the lowest province id. */
  customsCountryId?: Id | null;
}

export interface SystemAccountInitialDef {
  id: Id;
  accountKind: "system-reserve";
  balanceRUSD: MoneyRUSD;
}

export interface EmploymentAssignmentInitialDef {
  id: Id;
  popBlockId: Id;
  buildingInstanceId: Id;
  professionId: Id;
  workers: number;
}

/** M10 documented war justifications. No diplomatic-point resource exists. */
export const CASUS_BELLI = [
  "border-dispute",
  "trade-dispute",
  "alliance-obligation",
] as const;
export type CasusBelli = (typeof CASUS_BELLI)[number];

/** M10 supported peace terms. */
export const PEACE_TERMS = ["white-peace", "cede-occupied"] as const;
export type PeaceTermKind = (typeof PEACE_TERMS)[number];

/**
 * M10 bilateral diplomatic relation. `countryA < countryB` is canonical. An absent
 * pair has score 0 and no truce; only relations changed by an action are stored.
 */
export interface DiplomaticRelation {
  countryA: Id;
  countryB: Id;
  /** −100 (hostile) .. 100 (friendly), dimensionless. */
  score: Rate;
  truceUntilDay: Day | null;
}

/** M10 war between two countries. A pair has at most one active war. */
export interface WarState {
  id: Id;
  attackerCountryId: Id;
  defenderCountryId: Id;
  casusBelli: CasusBelli;
  startedDay: Day;
  endedDay: Day | null;
  /** Set on the peace that ended the war. */
  truceUntilDay: Day | null;
}

/** M10 pending peace offer. Only a belligerent may offer or accept. */
export interface PeaceOffer {
  id: Id;
  warId: Id;
  fromCountryId: Id;
  toCountryId: Id;
  terms: PeaceTermKind;
  proposedDay: Day;
}

/**
 * M10 army formation. People are drawn from pop blocks by recruitment and are no
 * longer civilians while serving; `deaths` and `captured` are cumulative and are
 * outside the roster. `wounded` people are outside the roster until they recover.
 */
export interface Army {
  id: Id;
  countryId: Id;
  provinceId: Id;
  /** Province the formation was raised in; retreat destination. */
  homeProvinceId: Id;
  personnel: number;
  equipmentUnits: number;
  /** 0..1 organization/cohesion. */
  organization: Rate;
  /** 0..1 supply status from the last paid upkeep. */
  supply: Rate;
  wounded: number;
  woundedReturnDay: Day | null;
  deaths: number;
  captured: number;
  /** Formation delay: no movement before this day. */
  readyDay: Day;
  destinationProvinceId: Id | null;
  arrivalDay: Day | null;
  lastBattleDay: Day | null;
}

/** Cumulative per-country military casualties and recoveries. */
export interface MilitaryCasualtyRecord {
  countryId: Id;
  deaths: number;
  woundedReturned: number;
  captured: number;
}

/**
 * M10 diplomacy and war state. Empty and disabled for worlds whose scenario omits
 * the military block (D-081). Province control lives on `ProvinceOwnership` (D-118).
 */
export interface MilitaryState {
  enabled: boolean;
  /** Ascending by id. */
  armies: Army[];
  wars: WarState[];
  relations: DiplomaticRelation[];
  peaceOffers: PeaceOffer[];
  /** One record per country that has fielded an army; ascending by country id. */
  casualties: MilitaryCasualtyRecord[];
  nextArmyId: Id;
  nextWarId: Id;
  nextOfferId: Id;
  /** Last day the military phase ran; the phase is idempotent per day. */
  lastPhaseDay: Day | null;
}

/** Scenario input for one initial army. */
export interface MilitaryArmyInput {
  countryId: Id;
  provinceId: Id;
  personnel: number;
  equipmentUnits?: number;
  organization?: Rate;
  supply?: Rate;
}

/** Scenario input for one initial bilateral relation. */
export interface MilitaryRelationInput {
  countryA: Id;
  countryB: Id;
  score?: Rate;
}

/** M10 scenario input. Omitted means the military system is disabled. */
export interface MilitarySystemInput {
  armies?: readonly MilitaryArmyInput[];
  relations?: readonly MilitaryRelationInput[];
}

/**
 * M11 constitutional status of a 1900 polity. The value is static scenario
 * content, not mutable authoritative state; it is never transferred by warfare
 * or occupation (D-081).
 */
export const COUNTRY_STATUSES = [
  "independent",
  "personal-union",
  "autonomous-vassal",
  "dominion",
  "self-governing-colony",
  "protectorate",
  "colony",
  "occupation",
  "autonomous-province",
  "dependency",
] as const;
export type CountryStatus = (typeof COUNTRY_STATUSES)[number];

/** M11 static metadata for one simulation country. */
export interface CountryMetaDef {
  readonly countryId: Id;
  readonly historicalName: string;
  readonly status: CountryStatus;
  /** Sovereign country id; the country itself for an independent state. */
  readonly sovereignCountryId: Id;
  readonly capitalName: string;
  /** Player-facing name of the country's home territory (its non-dependent provinces). */
  readonly homeTerritoryName: string;
  readonly selectable: boolean;
  readonly population1900Estimate: number | null;
  readonly confidence: "low" | "medium" | "high";
  readonly notes: string;
}

/**
 * Static identity of one customs territory (D-119), which is one market. `kind` is
 * `national` (one country), `imperial` (a sovereign with its colonies and
 * protectorates) or `shared` (a customs union of several states). The member
 * countries are the owners of the market's provinces; `customsCountryId` is the
 * administrator whose tariff schedule applies.
 */
export interface MarketMetaDef {
  readonly marketId: Id;
  readonly key: string;
  readonly name: string;
  readonly kind: "national" | "imperial" | "shared";
  readonly description: string;
  readonly customsCountryId: Id | null;
  /** Simulation countries owning provinces in this territory, ascending. */
  readonly memberCountryIds: readonly Id[];
}

/**
 * Static metadata of one dependent territory (D-118 §3): a set of provinces of its
 * sovereign with a colonial, protectorate or other dependent status. It is not a
 * separate entity in the world; it names and describes those provinces.
 */
export interface TerritoryMetaDef {
  readonly polityTag: string;
  /** Provinces of the territory, ascending; all owned by `sovereignCountryId` in 1900. */
  readonly provinceIds: readonly Id[];
  readonly historicalName: string;
  readonly status: CountryStatus;
  readonly sovereignCountryId: Id;
  readonly capitalName: string;
  readonly selectable: boolean;
  readonly confidence: "low" | "medium" | "high";
  readonly notes: string;
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
  /**
   * M11 static polity metadata. Optional so pre-M11 fixtures keep working.
   * These records are scenario content: they are not serialized with the world.
   */
  countryMeta?: CountryMetaDef[];
  marketMeta?: MarketMetaDef[];
  /** Dependent-territory metadata (D-118 §3). */
  territoryMeta?: TerritoryMetaDef[];
  /**
   * M12a permanent provincial geography and its initial political ownership.
   * Omitted for scenarios that predate M12a. Province geometry lives in the
   * app/data map bundle, never in the simulation; this is static content.
   */
  provinces?: ProvinceScenarioInput;
  currencies?: Currency[];
  currencyValuations?: CurrencyValuation[];
  /** M5a profit-allocation policy. Omitted means disabled defaults. */
  profitDistribution?: ProfitDistributionPolicy;
  /** M6 country-AI enable policy. Omitted means disabled defaults. */
  countryAI?: CountryAIPolicy;
  /**
   * E6a authored transport routes. Omitted or empty means trade is disabled and the
   * world keeps its pre-E6a behaviour (D-079).
   */
  tradeRoutes?: TradeRouteInitialDef[];
  /**
   * E6b monetary system. Omitted means disabled and the world keeps its pre-E6b
   * behaviour; the price index is still derived because it is pure measurement.
   */
  monetary?: MonetarySystemInput;
  /**
   * M10 diplomacy and warfare. Omitted means disabled and the world keeps its
   * pre-M10 behaviour (D-081).
   */
  military?: MilitarySystemInput;
  /**
   * Post-M7 player-control designation. The AI does not make fiscal decisions for
   * this country. Omitted or null means no designated player country (legacy
   * fixtures), and every country remains AI-eligible when the AI is enabled.
   */
  playerCountryId?: Id | null;
  /** P2b money coefficients (D-135); omitted means DEFAULT_MONEY_COEFFICIENTS. */
  moneyCoefficients?: MoneyCoefficients;
}
