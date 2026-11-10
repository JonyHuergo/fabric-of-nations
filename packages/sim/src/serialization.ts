/**
 * Explicit, versioned serialization for the M3 world.
 *
 * A save is a canonical JSON envelope with save format, schema, simulation, and
 * content versions; scenario/day/seed metadata; a checksum; and the complete
 * encoded payload. The payload includes diagnostics, population, buildings,
 * employment assignments and the dirty marker, markets with authoritative stock
 * lots, and the cash ledger.
 *
 * Typed arrays are never left to `JSON.parse`: each is encoded as a tagged
 * object with an explicit kind, length, and values, and reconstructed as the
 * corresponding typed-array class. Population age state uses this codec for
 * `Uint32Array`. Version mismatches, malformed data, checksum failures, and
 * invalid state all produce a `SaveFormatError` instead of a partially restored
 * world.
 *
 * The checksum is FNV-1a 32 over canonical JSON. It detects accidental
 * corruption and is not a security signature.
 */

import { decodeLabourMarket, encodeLabourMarket, type SerializedLabourMarket } from "./economy/labourState.js";
import type { LabourMarketState } from "./economy/types.js";
import {
  decodeSerializedResourceState,
  encodeResourceState,
  type ResourceState,
  type SerializedResourceState,
} from "./economy/resourceState.js";
import {
  decodeDemographyReport,
  encodeDemographyReport,
  type DemographyReportState,
} from "./economy/demographyReportState.js";
import { assertValidDayIndex } from "./calendar.js";
import {
  CAMPAIGN_END_YEAR,
  CAMPAIGN_START_YEAR,
  CAMPAIGN_TERMINAL_DAY_INDEX,
  DEFAULT_DATA_VERSION,
  MAX_FOREIGN_ISSUER_KEY_LENGTH,
  MAX_RECENT_WARNINGS,
  MAX_SCENARIO_ID_LENGTH,
  MAX_WARNING_LENGTH,
  SAVE_CHECKSUM_PREFIX,
  SAVE_FORMAT_VERSION,
  SIM_VERSION,
  WORLD_SCHEMA_VERSION,
} from "./constants.js";
import { categoryForSubtype } from "./economy/accounts.js";
import { checksumOfJson, fnv1a32Hex, stableStringify } from "./hash.js";
import { MONEY_COEFFICIENT_KEYS } from "./economy/constants.js";
import type { MoneyCoefficients } from "./economy/types.js";
import { canonicalizeStockLots } from "./economy/inventory.js";
import { CASUS_BELLI, MONETARY_STANDARDS, PEACE_TERMS } from "./economy/types.js";
import type {
  AccountCategory,
  AccountSubtype,
  AnnualFinanceSummary,
  BuildingInstance,
  ConstructionProject,
  ConstructionState,
  Country,
  CountryAIGoalId,
  CountryAIPolicy,
  CountryAIState,
  CountryTechnologyState,
  Currency,
  CurrencyIssuer,
  CurrencyValuation,
  DebtContract,
  DebtPolicy,
  EducationState,
  LaborPolicyState,
  EmploymentAssignment,
  FinanceBudgetMemo,
  FinanceCorrection,
  FinancePeriodBudgetTotals,
  FinancePeriodFiscalTotals,
  FinancePeriodSummary,
  FinanceState,
  FinancialAccount,
  FinancialAccountOwnerKind,
  FiscalPolicy,
  FlowTransactionKind,
  IndustrialPolicy,
  JournalLine,
  JournalPosting,
  LawTransition,
  Market,
  MonetaryArrangement,
  OpeningBalanceRecord,
  PoliticsState,
  RegimeState,
  InstitutionState,
  InterestGroupState,
  StockLot,
  RusdPerCurrencyUnit,
  Army,
  CasusBelli,
  MilitaryState,
  PeaceTermKind,
  WarState,
  MonetaryCurrencyState,
  MonetaryStandard,
  MonetaryState,
  PriceIndexState,
  TradeBlockReason,
  TradePolicyState,
  TradeState,
  TransactionKind,
} from "./economy/types.js";
import {
  ACCOUNT_CATEGORIES,
  ACCOUNT_SUBTYPES,
  FLOW_TRANSACTION_KINDS,
  LAW_SLOTS,
  TRADE_BLOCK_REASONS,
  TRANSACTION_KINDS,
} from "./economy/types.js";
import {
  assertValidCountryAIPolicy,
  assertValidCountryAIState,
} from "./economy/aiState.js";
import { asRusdPerCurrencyUnit } from "./economy/currency.js";
import { assertValidClosingValuations, assertValidCountryClosingBalances } from "./economy/validation.js";
import { assertValidProfitDistributionPolicy } from "./economy/profit.js";
import { assertValidProvinceState } from "./provinces/state.js";
import type {
  ProvinceOwnership,
  ProvinceSpecialStatus,
  ProvinceState,
  ProvinceTransferKind,
  ProvinceTransferRecord,
} from "./provinces/types.js";
import {
  PROVINCE_SPECIAL_STATUSES,
  PROVINCE_TRANSFER_KINDS,
} from "./provinces/types.js";
import { assertValidFiscalPolicy, assertValidIndustrialPolicy } from "./economy/country.js";
import { assertValidDebtPolicy } from "./economy/debtPolicy.js";
import { SINGLE_AGE_COUNT } from "./population/constants.js";
import type { PopBlock, ProvinceEconomy } from "./population/types.js";
import { assertValidWorld, type World } from "./world.js";
import {
  requireArray,
  requireFiniteNumber,
  requireInteger,
  requireRecord,
  requireString,
  requireUint32,
} from "./validation.js";

/** Maximum accepted length of one encoded typed array. */
export const MAX_TYPED_ARRAY_LENGTH = 10_000_000;

/** Numeric typed arrays supported by the M1 serializer. BigInt arrays are excluded. */
export type SupportedTypedArray =
  | Int8Array
  | Uint8Array
  | Uint8ClampedArray
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array
  | Float32Array
  | Float64Array;

/** Discriminator for an encoded typed array. */
export type TypedArrayKind =
  | "Int8Array"
  | "Uint8Array"
  | "Uint8ClampedArray"
  | "Int16Array"
  | "Uint16Array"
  | "Int32Array"
  | "Uint32Array"
  | "Float32Array"
  | "Float64Array";

type IntegerTypedArrayKind = Exclude<TypedArrayKind, "Float32Array" | "Float64Array">;

const TYPED_ARRAY_KINDS: readonly TypedArrayKind[] = [
  "Int8Array",
  "Uint8Array",
  "Uint8ClampedArray",
  "Int16Array",
  "Uint16Array",
  "Int32Array",
  "Uint32Array",
  "Float32Array",
  "Float64Array",
];

const INTEGER_RANGES: Readonly<Record<IntegerTypedArrayKind, readonly [number, number]>> = {
  Int8Array: [-128, 127],
  Uint8Array: [0, 255],
  Uint8ClampedArray: [0, 255],
  Int16Array: [-32_768, 32_767],
  Uint16Array: [0, 65_535],
  Int32Array: [-2_147_483_648, 2_147_483_647],
  Uint32Array: [0, 4_294_967_295],
};

/** Tagged JSON representation of one typed array. */
export type EncodedTypedArray = {
  readonly encoding: "typed-array-v1";
  readonly kind: TypedArrayKind;
  readonly length: number;
  readonly values: readonly number[];
};

/** Encoded diagnostics payload. */
export type SerializedDiagnostics = {
  readonly invariantFailureCount: number;
  readonly invalidActionCount: number;
  readonly eventApplicationCount: number;
  readonly recentWarnings: readonly string[];
};

/** Encoded province economy (schema 29). */
export type SerializedProvinceEconomy = {
  readonly id: number;
  readonly key: string;
  readonly name: string;
  readonly popBlockIds: readonly number[];
  readonly marketId: number | null;
  readonly buildingInstanceIds: readonly number[];
  readonly unrest: number;
  readonly infrastructure: number;
  readonly arableLandHa: number;
  readonly pastureHa: number;
  readonly urbanShare: number;
  readonly wageRUSDPerYearByProfession: readonly number[];
  readonly absLatitudeDeg: number | null;
  /**
   * P5b (C-12): present on every province (null where it has none) when any province of
   * the world has a hydro potential, and absent on all of them otherwise (absent means
   * null), so worlds without hydro data keep their schema-33 encoding and the save's
   * column table keeps one set of fields.
   */
  readonly hydroPotentialMWhPerYear?: number | null;
  /**
   * P6 (D-153): present on every province (null where it has none) in a world with a
   * demand system, absent on all of them otherwise (absent means null).
   */
  readonly housingReferencePersonsPerDwelling?: number | null;
};

/** Encoded financial account. */
export type SerializedFinancialAccount = {
  readonly id: number;
  readonly ownerKind: FinancialAccountOwnerKind;
  readonly ownerId: number | null;
  readonly category: AccountCategory;
  readonly subtype: AccountSubtype;
  readonly balanceRUSD: number;
};

/** Encoded journal line. */
export type SerializedJournalLine = {
  readonly accountId: number;
  readonly side: "debit" | "credit";
  readonly amountRUSD: number;
};

/** Encoded journal posting. */
export type SerializedJournalPosting = {
  readonly id: number;
  readonly dayIndex: number;
  readonly transactionKind: TransactionKind;
  readonly lines: readonly SerializedJournalLine[];
  readonly sourceEntityId: number | null;
  readonly targetEntityId: number | null;
};

/** Encoded opening-balance provenance record. */
export type SerializedOpeningBalance = {
  readonly dayIndex: number;
  readonly accountCount: number;
  readonly checksum: string;
};

/** Encoded finance state. */
export type SerializedFinanceState = {
  readonly accounts: readonly SerializedFinancialAccount[];
  readonly postings: readonly SerializedJournalPosting[];
  readonly nextPostingId: number;
  readonly nextAccountId: number;
  readonly opening: SerializedOpeningBalance | null;
  readonly periodSummaries: readonly SerializedFinancePeriodSummary[];
  readonly annualSummaries: readonly SerializedAnnualFinanceSummary[];
  readonly corrections: readonly SerializedFinanceCorrection[];
  readonly nextCorrectionId: number;
  readonly debtContracts: readonly SerializedDebtContract[];
  readonly debtHistory: readonly SerializedDebtHistoryAggregate[];
  readonly nextContractId: number;
  readonly budgetMemosThisMonth: Readonly<Record<string, SerializedFinanceBudgetMemo>>;
  readonly closedThroughDay: number | null;
};

/** Encoded E2 month-to-date budget memo for one country. */
export type SerializedFinanceBudgetMemo = {
  readonly welfareRequestedRUSD: number;
  readonly welfareShortfallRUSD: number;
  readonly businessTaxAssessedRUSD: number;
  readonly businessTaxUncollectedRUSD: number;
  readonly debtIssuedRUSD: number;
  readonly principalRepaidRUSD: number;
  readonly interestPaidRUSD: number;
  readonly unfinancedRequirementRUSD: number;
  readonly constructionSpentRUSD: number;
  readonly constructionWrittenOffRUSD: number;
  readonly constructionMaterialsSpentRUSD: number;
  readonly subsidyRequestedRUSD: number;
  readonly subsidyShortfallRUSD: number;
  readonly publicEnterpriseSupportRUSD: number;
  readonly businessTaxAssessedDay: number | null;
};

/** Encoded E2 per-country budget decomposition. Zero fields may be omitted. */
export type SerializedFinanceBudgetTotals = {
  readonly welfareRequestedRUSD?: number;
  readonly welfareShortfallRUSD?: number;
  readonly businessTaxAssessedRUSD?: number;
  readonly businessTaxUncollectedRUSD?: number;
  readonly debtIssuedRUSD?: number;
  readonly principalRepaidRUSD?: number;
  readonly interestPaidRUSD?: number;
  readonly unfinancedRequirementRUSD?: number;
  readonly constructionSpentRUSD?: number;
  readonly constructionWrittenOffRUSD?: number;
  readonly constructionMaterialsSpentRUSD?: number;
  readonly subsidyRequestedRUSD?: number;
  readonly subsidyShortfallRUSD?: number;
  readonly publicEnterpriseSupportRUSD?: number;
  readonly administrationRequestedRUSD?: number;
  readonly administrationShortfallRUSD?: number;
  readonly educationRequestedRUSD?: number;
  readonly educationShortfallRUSD?: number;
  readonly trainingRequestedRUSD?: number;
  readonly trainingShortfallRUSD?: number;
};

/** Encoded E4 construction/commissioning material requirement. */
export type SerializedConstructionMaterial = {
  readonly goodId: number;
  readonly requiredQuantity: number;
  readonly deliveredQuantity: number;
};

/** Encoded E3 construction project. */
export type SerializedConstructionProject = {
  readonly id: number;
  readonly countryId: number;
  readonly provinceId: number;
  readonly definitionId: number;
  readonly status: ConstructionProject["status"];
  readonly authorizedDay: number;
  readonly startedDay: number | null;
  readonly completedDay: number | null;
  readonly cancelledDay: number | null;
  readonly totalCostRUSD: number;
  readonly workingCapitalRUSD: number;
  readonly workingCapitalPaidRUSD: number;
  readonly spentRUSD: number;
  readonly materialsSpentRUSD: number;
  readonly materials: readonly SerializedConstructionMaterial[];
  readonly lastWorkers: number;
  readonly blockedReason: "labor" | "funds" | "materials" | null;
  readonly buildingId: number | null;
};

/** Encoded compacted construction history aggregate. */
export type SerializedConstructionHistoryAggregate = {
  readonly countryId: number;
  readonly projectsCompleted: number;
  readonly projectsCancelled: number;
  readonly totalSpentRUSD: number;
  readonly totalWrittenOffRUSD: number;
};

/** Encoded E3 construction state. */
export type SerializedConstructionState = {
  readonly projects: readonly SerializedConstructionProject[];
  readonly history: readonly SerializedConstructionHistoryAggregate[];
  readonly nextProjectId: number;
  readonly nextBuildingId: number;
};

/** Encoded per-country fiscal totals retained by a compacted summary. Zero fields may be omitted. */
export type SerializedCountryFiscalTotals = {
  readonly incomeTaxRevenueRUSD?: number;
  readonly businessTaxRevenueRUSD?: number;
  readonly welfareExpenseRUSD?: number;
  readonly interestExpenseRUSD?: number;
  readonly subsidyExpenseRUSD?: number;
  readonly administrationExpenseRUSD?: number;
  readonly educationExpenseRUSD?: number;
  readonly trainingExpenseRUSD?: number;
  readonly militaryExpenseRUSD?: number;
  readonly customsDutyRevenueRUSD?: number;
  readonly netFiscalResultRUSD?: number;
};

/** Encoded aggregate of compacted terminated debt contracts. */
export type SerializedDebtHistoryAggregate = {
  readonly issuerCountryId: number;
  readonly contractsRetired: number;
  readonly contractsDefaulted: number;
  readonly principalIssuedRUSD: number;
  readonly principalRepaidRUSD: number;
  readonly principalWrittenOffRUSD: number;
  readonly interestWrittenOffRUSD: number;
};

/**
 * Encoded monthly finance summary. `accountTotals` keys are canonical decimal
 * account ids; `flowTotalsByKind` uses the four registered flow-kind keys.
 */
export type SerializedFinancePeriodSummary = {
  readonly periodStartDay: number;
  readonly periodEndDay: number;
  readonly accountTotals: Readonly<Record<string, number>>;
  readonly flowTotalsByKind: Readonly<Record<string, number>>;
  /** Present only on compacted summaries; `accountTotals` is then empty. */
  readonly countryFiscalTotals?: Readonly<Record<string, SerializedCountryFiscalTotals>>;
  /** E2 budget decomposition per country; present on every summary. */
  readonly countryBudgetTotals: Readonly<Record<string, SerializedFinanceBudgetTotals>>;
  /** P3 (D-141) specified valuations at the close, ascending currency id. */
  readonly closingValuations?: readonly { readonly currencyId: number; readonly rusdPerUnit: number }[];
  /** P5 (D-143 §6) per-country closing balances, ascending country id. */
  readonly countryClosingBalances?: readonly {
    readonly countryId: number;
    readonly treasuryCashRUSD: number;
    readonly debtOutstandingRUSD: number;
    readonly householdCashRUSD: number;
  }[];
};

/** Encoded annual finance summary. No account-level trial balance is stored. */
export type SerializedAnnualFinanceSummary = {
  readonly year: number;
  readonly periodStartDay: number;
  readonly periodEndDay: number;
  readonly complete: boolean;
  readonly fiscalTotals: Readonly<Record<string, SerializedCountryFiscalTotals>>;
  readonly budgetTotals: Readonly<Record<string, SerializedFinanceBudgetTotals>>;
  readonly flowTotalsByKind: Readonly<Record<string, number>>;
  readonly closingBalances: Readonly<
    Record<
      string,
      {
        readonly treasuryCashRUSD: number;
        readonly debtLiabilityRUSD: number;
        readonly interestPayableRUSD: number;
      }
    >
  >;
  readonly correctionCount: number;
};

/** Encoded controlled correction record. */
export type SerializedFinanceCorrection = {
  readonly id: number;
  readonly dayIndex: number;
  readonly postingId: number;
  readonly originalPostingId: number;
  readonly reason: string;
  readonly lines: readonly {
    readonly accountId: number;
    readonly side: "debit" | "credit";
    readonly amountRUSD: number;
  }[];
};

/** Encoded currency issuer. */
export type SerializedCurrencyIssuer =
  | { readonly kind: "country"; readonly countryId: number }
  | { readonly kind: "foreign"; readonly issuerKey: string }
  | { readonly kind: "union"; readonly unionKey: string };

/** Encoded currency identity. */
export type SerializedCurrency = {
  readonly id: number;
  readonly key: string;
  readonly name: string;
  readonly issuer: SerializedCurrencyIssuer;
};

/** Encoded domestic monetary arrangement. */
export type SerializedMonetaryArrangement =
  | { readonly kind: "own"; readonly currencyId: number }
  | { readonly kind: "adopted"; readonly currencyId: number }
  | { readonly kind: "shared"; readonly currencyId: number; readonly unionKey: string };

/** Encoded fiscal policy. */
export type SerializedFiscalPolicy = {
  readonly incomeTaxRate: number;
  readonly incomeTaxAllowanceRUSDPerYear: number;
  readonly welfareBudgetRUSDPerYear: number;
  readonly welfareMaxWealthLevel: number;
  readonly businessProfitTaxRate: number;
  readonly reserveTargetRUSD: number;
};

/** Encoded M5a profit-allocation policy. */
export type SerializedProfitDistributionPolicy = {
  readonly enabled: boolean;
  readonly privatePayoutRate: number;
  readonly stateRemittanceRate: number;
};

/** Encoded M6 country-AI enable policy. */
export type SerializedCountryAIPolicy = {
  readonly enabled: boolean;
};

/** Encoded fixed-size M6 per-country AI state. */
export type SerializedCountryAIState = {
  readonly nextEvaluationDay: number;
  readonly currentGoalId: CountryAIGoalId | null;
  readonly lastDecisionDay: number | null;
  readonly lastActionSummary: string | null;
};

/** Encoded M5b public-debt policy. */
export type SerializedDebtPolicy = {
  readonly enabled: boolean;
  readonly creditorKind: "country" | "popBlock";
  readonly creditorId: number;
  readonly annualCouponRate: number;
  readonly termDays: number;
  readonly maxOutstandingPrincipalRUSD: number;
  readonly refinanceOnMaturity: boolean;
  readonly arrearsGraceDays: number;
};

/** Encoded M5b debt contract. */
export type SerializedDebtContract = {
  readonly id: number;
  readonly contractVersion: 1;
  readonly issuerCountryId: number;
  readonly holderKind: "country" | "popBlock";
  readonly holderId: number;
  readonly principalRUSD: number;
  readonly outstandingPrincipalRUSD: number;
  readonly annualCouponRate: number;
  readonly issueDay: number;
  readonly maturityDay: number;
  readonly accruedInterestRUSD: number;
  readonly status: "active" | "arrears" | "repaid" | "defaulted";
  readonly arrearsSinceDay: number | null;
};

/** Encoded country identity, province ownership, treasury, and fiscal policy. */
/** Encoded M8 regime, laws, groups, institutions, and world politics state. */
export type SerializedElectionResult = {
  readonly day: number;
  readonly eligiblePopulation: number;
  readonly votesForGovernment: number;
  readonly votesForOpposition: number;
  readonly governmentVoteShare: number;
  readonly turnoutShare: number;
  readonly previousGovernmentGroupKey: string;
  readonly winnerGroupKey: string;
};

export type SerializedCrisisState = {
  readonly stage: string;
  readonly sinceDay: number;
  readonly pressureDays: number;
  readonly lastRevolutionDay: number | null;
};

export type SerializedRegimeState = {
  readonly kind: string;
  readonly sinceDay: number;
  readonly governmentGroupKey: string;
  readonly nextElectionDay: number | null;
  readonly lastElectionDay: number | null;
  readonly lastElection: SerializedElectionResult | null;
  readonly crisis: SerializedCrisisState;
};

export type SerializedInterestGroupState = {
  readonly id: number;
  readonly key: string;
  readonly membershipPopulation: number;
  readonly organization: number;
  readonly influence: number;
  readonly stanceByLaw: Readonly<Record<string, number>>;
};

export type SerializedInstitutionState = {
  readonly fundedAnnualRUSD: number;
  readonly staffedByProfession: Readonly<Record<string, number>>;
  readonly serviceOutputIndex: number;
  readonly quality: number;
  readonly overload: number;
  readonly disruptionUntilDay: number | null;
  readonly lastUpdateDay: number | null;
  readonly fundingRequestedMonthToDateRUSD: number;
  readonly fundingShortfallMonthToDateRUSD: number;
};

export type SerializedLawTransition = {
  readonly id: number;
  readonly slot: string;
  readonly fromLawId: number;
  readonly toLawId: number;
  readonly proposedDay: number;
  readonly effectiveDay: number;
  readonly source: "player" | "ai" | "event";
  readonly support: number;
};

export type SerializedScheduledEvent = {
  readonly id: number;
  readonly definitionId: number;
  readonly key: string;
  readonly countryId: number;
  readonly dueDay: number;
  readonly appliedDay: number | null;
  readonly status: "scheduled" | "applied" | "skipped";
  readonly provenance: string;
};

export type SerializedPoliticsLogEntry = {
  readonly id: number;
  readonly day: number;
  readonly kind: string;
  readonly countryId: number | null;
  readonly summary: string;
  readonly provenance: string;
};

export type SerializedPoliticsState = {
  readonly enabled: boolean;
  readonly eventQueue: readonly SerializedScheduledEvent[];
  readonly eventLog: readonly SerializedPoliticsLogEntry[];
  readonly nextEventId: number;
  readonly nextLogId: number;
};

/** Encoded M8 per-country politics block. */
export type SerializedCountryPolitics = {
  readonly regime: SerializedRegimeState;
  readonly laws: Readonly<Record<string, number>>;
  readonly lawTransitions: readonly SerializedLawTransition[];
  readonly interestGroups: readonly SerializedInterestGroupState[];
  readonly institutions: SerializedInstitutionState;
};

/** Encoded M9 per-country technology state. */
export type SerializedCountryTechnology = {
  readonly researched: readonly {
    readonly technologyId: number;
    readonly completedDay: number;
  }[];
  readonly activeProject: {
    readonly technologyId: number;
    readonly startedDay: number;
  } | null;
  readonly workByTechnology: Readonly<Record<string, number>>;
};

/** Encoded M9 per-country education policy state. */
export type SerializedEducationState = {
  readonly fundedAnnualRUSD: number;
  readonly researchStaffShare: number;
  readonly lastUpdateDay: number | null;
  readonly fundingRequestedMonthToDateRUSD: number;
  readonly fundingShortfallMonthToDateRUSD: number;
};

/** Encoded E5 per-country labor/training policy state. */
export type SerializedLaborPolicyState = {
  readonly trainingBudgetRUSDPerYear: number;
  readonly trainingStipendPerTraineeRUSDPerYear: number;
  readonly trainingStaffShare: number;
  readonly trainingParticipation: number;
  readonly lastUpdateDay: number | null;
  readonly trainingRequestedMonthToDateRUSD: number;
  readonly trainingShortfallMonthToDateRUSD: number;
};

/** Encoded E6a per-country trade policy and month-to-date memo. */
export type SerializedTradePolicyState = {
  readonly tariffRates: readonly number[];
  readonly importQuotaQuantity: readonly (number | null)[];
  readonly importQuotaUsedQuantity: readonly number[];
  readonly exportRestricted: readonly boolean[];
  readonly lastUpdateDay: number | null;
  readonly exportsValueMonthToDateRUSD: number;
  readonly importsValueMonthToDateRUSD: number;
  readonly dutyReceivedMonthToDateRUSD: number;
  readonly dutyPaidMonthToDateRUSD: number;
  readonly freightPaidMonthToDateRUSD: number;
};

/** Encoded E6a transport route. */
export type SerializedTradeRoute = {
  readonly id: number;
  readonly marketAId: number;
  readonly marketBId: number;
  readonly distanceUnits: number;
  readonly baseCapacityRUSDPerDay: number;
};

/** Encoded E6a in-transit consignment. */
export type SerializedTradeShipment = {
  readonly id: number;
  readonly goodId: number;
  readonly quantity: number;
  readonly sellerBuildingId: number;
  readonly originMarketId: number;
  readonly destinationMarketId: number;
  readonly originCountryId: number | null;
  readonly destinationCountryId: number | null;
  readonly dispatchDay: number;
  readonly arrivalDay: number;
  readonly cargoValueRUSD: number;
  readonly freightCostRUSD: number;
  readonly dutyRUSD: number;
  readonly dutyRate: number;
};

/** Encoded E6a blocked-shipment diagnostic. */
export type SerializedTradeBlockedDiagnostic = {
  readonly originMarketId: number;
  readonly destinationMarketId: number;
  readonly goodId: number;
  readonly reason: string;
};

/** Encoded E6a last-day trade report. */
export type SerializedTradeDayReport = {
  readonly dayIndex: number;
  readonly dispatchedShipments: number;
  readonly freightPaidRUSD: number;
  readonly dutyPaidRUSD: number;
  readonly ownerFundedRUSD: number;
  readonly arrivedShipments: number;
  readonly blocked: readonly SerializedTradeBlockedDiagnostic[];
};

/** Encoded E6a trade state. */
export type SerializedTradeState = {
  readonly enabled: boolean;
  readonly routes: readonly SerializedTradeRoute[];
  readonly shipments: readonly SerializedTradeShipment[];
  readonly nextShipmentId: number;
  readonly lastDispatchDay: number | null;
  readonly lastDay: SerializedTradeDayReport | null;
};

/** Encoded E6b price-index observation. */
export type SerializedPriceIndexObservation = {
  readonly year: number;
  readonly month: number;
  readonly dayIndex: number;
  readonly world: number;
  readonly countries: readonly { readonly countryId: number; readonly value: number }[];
};

/** Encoded E6b price-index state. */
export type SerializedPriceIndexState = {
  readonly basket: readonly { readonly goodId: number; readonly weight: number }[];
  readonly basePrices: readonly {
    readonly marketId: number;
    readonly prices: readonly number[];
  }[];
  readonly observations: readonly SerializedPriceIndexObservation[];
  readonly lastObservationDay: number | null;
};

/** Encoded E6b per-currency monetary-authority state. */
export type SerializedMonetaryCurrencyState = {
  readonly currencyId: number;
  readonly issuerCountryId: number | null;
  readonly regime: string;
  readonly parityRusdPerUnit: number | null;
  readonly referenceParityRusdPerUnit: number | null;
  readonly currencyIssuedUnits: number;
  readonly active: boolean;
  readonly reserveAccountId: number | null;
  readonly liabilityAccountId: number | null;
  readonly equityAccountId: number | null;
  readonly externalCashAccountId: number | null;
  readonly externalCurrencyAccountId: number | null;
  readonly externalEquityAccountId: number | null;
  readonly lastParityChangeDay: number | null;
  readonly lastManagedUpdateDay: number | null;
  readonly lastMonthEndDay: number | null;
  readonly lastMonthExportsRUSD: number;
  readonly lastMonthImportsRUSD: number;
  readonly standard: string;
  readonly fineGramsPerUnit: number;
  readonly metalReserveKg: number;
  readonly metalReserveAccountId: number | null;
  readonly convertible: boolean;
  readonly lastMintSaleKg: number;
};

/** Encoded M10 army. */
export type SerializedArmy = {
  readonly id: number;
  readonly countryId: number;
  readonly provinceId: number;
  readonly homeProvinceId: number;
  readonly personnel: number;
  readonly equipmentUnits: number;
  readonly organization: number;
  readonly supply: number;
  readonly wounded: number;
  readonly woundedReturnDay: number | null;
  readonly deaths: number;
  readonly captured: number;
  readonly readyDay: number;
  readonly destinationProvinceId: number | null;
  readonly arrivalDay: number | null;
  readonly lastBattleDay: number | null;
};

export type SerializedWar = {
  readonly id: number;
  readonly attackerCountryId: number;
  readonly defenderCountryId: number;
  readonly casusBelli: string;
  readonly startedDay: number;
  readonly endedDay: number | null;
  readonly truceUntilDay: number | null;
};

export type SerializedDiplomaticRelation = {
  readonly countryA: number;
  readonly countryB: number;
  readonly score: number;
  readonly truceUntilDay: number | null;
};

export type SerializedPeaceOffer = {
  readonly id: number;
  readonly warId: number;
  readonly fromCountryId: number;
  readonly toCountryId: number;
  readonly terms: string;
  readonly proposedDay: number;
};

export type SerializedMilitaryCasualty = {
  readonly countryId: number;
  readonly deaths: number;
  readonly woundedReturned: number;
  readonly captured: number;
};

/** Encoded M10 military state. */
export type SerializedMilitaryState = {
  readonly enabled: boolean;
  readonly armies: readonly SerializedArmy[];
  readonly wars: readonly SerializedWar[];
  readonly relations: readonly SerializedDiplomaticRelation[];
  readonly peaceOffers: readonly SerializedPeaceOffer[];
  readonly casualties: readonly SerializedMilitaryCasualty[];
  readonly nextArmyId: number;
  readonly nextWarId: number;
  readonly nextOfferId: number;
  readonly lastPhaseDay: number | null;
};

/** Encoded E6b monetary state. */
export type SerializedMonetaryState = {
  readonly enabled: boolean;
  readonly currencies: readonly SerializedMonetaryCurrencyState[];
  readonly lastUpdateDay: number | null;
};

export type SerializedCountry = {  readonly id: number;
  readonly tag: string;
  readonly name: string;
  readonly monetary: SerializedMonetaryArrangement;
  readonly treasuryAccountId: number;
  readonly fiscal: SerializedFiscalPolicy;
  readonly industrial: SerializedIndustrialPolicy;
  readonly debt: SerializedDebtPolicy;
  readonly ai: SerializedCountryAIState;
  readonly immigrationOpen: boolean;
  readonly politics: SerializedCountryPolitics;
  readonly technology: SerializedCountryTechnology;
  readonly education: SerializedEducationState;
  readonly labor: SerializedLaborPolicyState;
  readonly trade: SerializedTradePolicyState;
};

/** Encoded E4 industrial policy. */
export type SerializedIndustrialPolicy = {
  readonly sectorSubsidyRates: readonly number[];
};

/** Encoded RUSD-relative valuation. */
export type SerializedCurrencyValuation =
  | {
      readonly currencyId: number;
      readonly status: "specified";
      readonly rusdPerUnit: number;
      readonly setOnDay: number;
      readonly source: "scenario" | "policy" | "market";
    }
  | { readonly currencyId: number; readonly status: "unavailable" };

/** Encoded inventory lot. */
export type SerializedStockLot = {
  readonly goodId: number;
  readonly ownerBuildingId: number;
  readonly quantity: number;
};

/** Encoded building instance. */
export type SerializedBuilding = {
  readonly id: number;
  readonly definitionId: number;
  readonly provinceId: number;
  readonly level: number;
  readonly condition: number;
  readonly ownerKind: "private" | "state";
  readonly ownerAccountId: number;
  readonly builtOnDay: number;
  readonly operational: boolean;
  readonly operatingCashAccountId: number;
  readonly technique: number;
  readonly depositId: number | null;
  /**
   * P7 (R8): the building's own job mix, null for the definition's jobs. Encoded on every
   * building when any building has one (the column table needs the same fields on each row),
   * absent otherwise (as hydroPotentialMWhPerYear).
   */
  readonly jobMix?: readonly { readonly professionId: number; readonly workersPerThroughputUnit: number }[] | null;
};

/** Encoded employment assignment. */
export type SerializedEmploymentAssignment = {
  readonly id: number;
  readonly popBlockId: number;
  readonly buildingInstanceId: number;
  readonly professionId: number;
  readonly workers: number;
};

/** Encoded market. */
export type SerializedMarket = {
  readonly id: number;
  readonly priceRUSD: readonly number[];
  readonly stockLots: readonly SerializedStockLot[];
  readonly customsCountryId: number | null;
  /** P6 (D-153): present on every market of a world with a demand system; absent means empty. */
  readonly priceSmoothedRUSD?: readonly number[];
};

/** Encoded population block with explicit typed-array tags. */
export type SerializedPopBlock = {
  readonly id: number;
  readonly provinceId: number;
  readonly professionId: number;
  readonly maleByAge: EncodedTypedArray;
  readonly femaleByAge: EncodedTypedArray;
  readonly literacy: number;
  readonly literacyByAge: readonly number[];
  readonly qualification: number;
  readonly wealthLevel: number;
  readonly financialAccountId: number;
  readonly militancy: number;
  readonly unmetSubsistenceDays: number;
  readonly unmetBasicDays: number;
  readonly comfortFulfilledDays: number;
  readonly fractionalBirthRemainder: number;
  readonly fractionalMaleBirthRemainder: number;
  readonly fractionalDeathRemainder: number;
  readonly urbanShare: number;
  readonly fertilityResidual: number;
  readonly childMortalityResidual: number;
  readonly adultMortalityResidual: number;
  readonly childMortalityLagged: number;
  readonly foodSufficiency: number;
  /** P6 (D-153): present on every block of a world with a demand system; absent means 0. */
  readonly incomeSmoothedRUSDPerCapitaDay?: number;
  readonly dwellings?: number;
  readonly housingReferencePersonsPerDwelling?: number;
  readonly housingReferenceIncomeRUSDPerCapitaDay?: number;
};

/** Encoded M12a province ownership record. */
export type SerializedProvinceOwnership = {
  readonly provinceId: number;
  readonly ownerPolityId: number;
  readonly controllerPolityId: number;
  readonly controlledSinceDay: number | null;
  readonly claimantPolityIds: readonly number[];
  readonly specialStatus: ProvinceSpecialStatus;
};

/** Encoded M12a province ownership change record. */
export type SerializedProvinceTransfer = {
  readonly id: number;
  readonly day: number;
  readonly provinceIds: readonly number[];
  readonly fromPolityId: number | null;
  readonly toPolityId: number;
  readonly kind: ProvinceTransferKind;
  readonly note: string;
};

/** Encoded M12a provincial state. */
export type SerializedProvinceState = {
  readonly enabled: boolean;
  readonly ownership: readonly SerializedProvinceOwnership[];
  readonly transfers: readonly SerializedProvinceTransfer[];
  readonly nextTransferId: number;
};

/** Complete encoded world payload. */
export type SerializedWorld = {
  readonly schemaVersion: number;
  readonly simVersion: string;
  readonly dataVersion: string;
  readonly scenarioId: string;
  readonly dayIndex: number;
  readonly startDayIndex: number;
  readonly seed: number;
  readonly provinceEconomies: readonly SerializedProvinceEconomy[];
  readonly countries: readonly SerializedCountry[];
  readonly currencies: readonly SerializedCurrency[];
  readonly currencyValuations: readonly SerializedCurrencyValuation[];
  readonly popBlocks: readonly SerializedPopBlock[];
  readonly buildings: readonly SerializedBuilding[];
  readonly employment: readonly SerializedEmploymentAssignment[];
  readonly employmentDirty: boolean;
  readonly markets: readonly SerializedMarket[];
  readonly finance: SerializedFinanceState;
  readonly profitDistribution: SerializedProfitDistributionPolicy;
  readonly countryAI: SerializedCountryAIPolicy;
  readonly construction: SerializedConstructionState;
  readonly politics: SerializedPoliticsState;
  readonly technology: { readonly enabled: boolean };
  readonly trade: SerializedTradeState;
  readonly priceIndex: SerializedPriceIndexState;
  readonly monetary: SerializedMonetaryState;
  /** P4 per-country annual demographic record (D-142). */
  readonly demography: DemographyReportState;
  /** P5 natural-resource deposits (D-143 §4), as columns. */
  readonly resources: SerializedResourceState;
  /** P7 (D-154): written only when the labour market is enabled; absent means disabled. */
  readonly labourMarket?: SerializedLabourMarket;
  readonly military: SerializedMilitaryState;
  /** M12a provincial ownership/control state; definitions and geometry are static. */
  readonly provinces: SerializedProvinceState;
  readonly playerCountryId: number | null;
  readonly moneyCoefficients: MoneyCoefficients;
  readonly diagnostics: SerializedDiagnostics;
};

/** Versioned save envelope. */
export interface SaveEnvelope {
  readonly format: "century-save";
  readonly formatVersion: number;
  readonly schemaVersion: number;
  readonly simVersion: string;
  readonly dataVersion: string;
  readonly scenarioId: string;
  readonly dayIndex: number;
  readonly seed: number;
  readonly checksum: string;
  readonly payload: SerializedWorld;
}

/** Error thrown for malformed, corrupt, or incompatible save data. */
export class SaveFormatError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "SaveFormatError";
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function typedArrayKind(array: SupportedTypedArray): TypedArrayKind {
  if (array instanceof Uint8ClampedArray) return "Uint8ClampedArray";
  if (array instanceof Int8Array) return "Int8Array";
  if (array instanceof Uint8Array) return "Uint8Array";
  if (array instanceof Int16Array) return "Int16Array";
  if (array instanceof Uint16Array) return "Uint16Array";
  if (array instanceof Int32Array) return "Int32Array";
  if (array instanceof Uint32Array) return "Uint32Array";
  if (array instanceof Float32Array) return "Float32Array";
  return "Float64Array";
}

function isTypedArrayKind(value: string): value is TypedArrayKind {
  return (TYPED_ARRAY_KINDS as readonly string[]).includes(value);
}

function validateTypedArrayValue(
  kind: TypedArrayKind,
  value: number,
  path: string,
): number {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${path} must be a finite number`);
  }
  const normalized = Object.is(value, -0) ? 0 : value;

  if (kind === "Float64Array") return normalized;
  if (kind === "Float32Array") {
    if (Math.fround(normalized) !== normalized) {
      throw new RangeError(`${path} is not exactly representable as a Float32 value`);
    }
    return normalized;
  }

  if (!Number.isInteger(normalized)) {
    throw new TypeError(`${path} must be an integer for ${kind}`);
  }
  const range = INTEGER_RANGES[kind];
  if (normalized < range[0] || normalized > range[1]) {
    throw new RangeError(
      `${path} must be in ${range[0]}..${range[1]} for ${kind}, received ${String(normalized)}`,
    );
  }
  return normalized;
}

/** Encode a numeric typed array as a tagged, JSON-safe object. */
export function encodeTypedArray(array: SupportedTypedArray): EncodedTypedArray {
  if (array.length > MAX_TYPED_ARRAY_LENGTH) {
    throw new RangeError(
      `typed array length ${String(array.length)} exceeds the maximum ${String(MAX_TYPED_ARRAY_LENGTH)}`,
    );
  }
  const kind = typedArrayKind(array);
  // D-137: every element of a Uint32Array is a valid uint32 by construction, so the
  // per-element check (and its path string) cannot fail; the values are the same.
  if (array instanceof Uint32Array) {
    return { encoding: "typed-array-v1", kind, length: array.length, values: Array.from(array) };
  }
  const values: number[] = [];
  for (let index = 0; index < array.length; index += 1) {
    const value = array[index];
    if (value === undefined) {
      throw new RangeError(`typed array value at ${String(index)} is missing`);
    }
    values.push(validateTypedArrayValue(kind, value, `typed array[${String(index)}]`));
  }
  return { encoding: "typed-array-v1", kind, length: array.length, values };
}

function constructTypedArray(
  kind: TypedArrayKind,
  values: readonly number[],
): SupportedTypedArray {
  switch (kind) {
    case "Int8Array":
      return new Int8Array(values);
    case "Uint8Array":
      return new Uint8Array(values);
    case "Uint8ClampedArray":
      return new Uint8ClampedArray(values);
    case "Int16Array":
      return new Int16Array(values);
    case "Uint16Array":
      return new Uint16Array(values);
    case "Int32Array":
      return new Int32Array(values);
    case "Uint32Array":
      return new Uint32Array(values);
    case "Float32Array":
      return new Float32Array(values);
    case "Float64Array":
      return new Float64Array(values);
  }
}

/** Decode and validate a tagged typed array from untrusted save data. */
export function decodeTypedArray(value: unknown): SupportedTypedArray {
  const record = requireRecord(value, "encoded typed array");
  const encoding = requireString(record.encoding, "encoded typed array.encoding");
  if (encoding !== "typed-array-v1") {
    throw new SaveFormatError(
      `Unsupported typed-array encoding ${JSON.stringify(encoding)}; expected "typed-array-v1"`,
    );
  }
  const kindValue = requireString(record.kind, "encoded typed array.kind");
  if (!isTypedArrayKind(kindValue)) {
    throw new SaveFormatError(`Unsupported typed-array kind ${JSON.stringify(kindValue)}`);
  }
  const length = requireInteger(
    record.length,
    "encoded typed array.length",
    0,
    MAX_TYPED_ARRAY_LENGTH,
  );
  const rawValues = requireArray(record.values, "encoded typed array.values");
  if (rawValues.length !== length) {
    throw new SaveFormatError(
      `Typed-array length ${String(length)} does not match ${String(rawValues.length)} encoded values`,
    );
  }

  const values: number[] = [];
  for (let index = 0; index < rawValues.length; index += 1) {
    const raw = rawValues[index];
    if (typeof raw !== "number") {
      throw new SaveFormatError(
        `Encoded typed array value at ${String(index)} must be a number`,
      );
    }
    // Validate before constructing the typed array. This prevents classes such
    // as Uint8ClampedArray from silently clamping out-of-range save data.
    values.push(validateTypedArrayValue(kindValue, raw, `typed array[${String(index)}]`));
  }
  return constructTypedArray(kindValue, values);
}

/**
 * Canonical decimal account-id key for a period-summary total map. Numeric
 * object keys are always stored as strings in JSON, so the canonical form is the
 * plain unsigned decimal representation.
 */
function accountTotalKey(accountId: number): string {
  return String(accountId);
}

function encodeCountryFiscalTotals(
  totals: Record<number, FinancePeriodFiscalTotals>,
): Record<string, SerializedCountryFiscalTotals> {
  const encoded: Record<string, SerializedCountryFiscalTotals> = {};
  for (const countryId of Object.keys(totals)
    .map((key) => Number(key))
    .sort((left, right) => left - right)) {
    const entry = totals[countryId];
    if (entry === undefined) {
      throw new RangeError(`summary country fiscal total ${String(countryId)} is missing`);
    }
    // Sparse encoding: a zero field is omitted and decodes as zero. Exact values
    // are retained; this only removes redundant zero keys from long histories, so
    // the bounded canonical save stays within its target as stages add lines.
    const encodedEntry: Record<string, number> = {};
    for (const field of [
      "incomeTaxRevenueRUSD",
      "businessTaxRevenueRUSD",
      "welfareExpenseRUSD",
      "interestExpenseRUSD",
      "subsidyExpenseRUSD",
      "administrationExpenseRUSD",
      "educationExpenseRUSD",
      "trainingExpenseRUSD",
      "militaryExpenseRUSD",
      "customsDutyRevenueRUSD",
      "netFiscalResultRUSD",
    ] as const) {
      const value = entry[field] ?? 0;
      if (value !== 0) encodedEntry[field] = value;
    }
    encoded[accountTotalKey(countryId)] =
      encodedEntry as SerializedCountryFiscalTotals;
  }
  return encoded;
}

function encodeBudgetTotals(
  totals: Record<number, FinancePeriodBudgetTotals>,
): Record<string, SerializedFinanceBudgetTotals> {
  const encoded: Record<string, SerializedFinanceBudgetTotals> = {};
  for (const countryId of Object.keys(totals)
    .map((key) => Number(key))
    .sort((left, right) => left - right)) {
    const entry = totals[countryId];
    if (entry === undefined) {
      throw new RangeError(`summary country budget total ${String(countryId)} is missing`);
    }
    // Sparse encoding: zero fields are omitted. Decode and validation treat a
    // missing field as zero, which keeps long histories bounded without a new
    // summary schema.
    const encodedEntry: Record<string, number> = {};
    for (const field of [
      "welfareRequestedRUSD",
      "welfareShortfallRUSD",
      "businessTaxAssessedRUSD",
      "businessTaxUncollectedRUSD",
      "debtIssuedRUSD",
      "principalRepaidRUSD",
      "interestPaidRUSD",
      "unfinancedRequirementRUSD",
      "constructionSpentRUSD",
      "constructionWrittenOffRUSD",
      "constructionMaterialsSpentRUSD",
      "subsidyRequestedRUSD",
      "subsidyShortfallRUSD",
      "publicEnterpriseSupportRUSD",
      "administrationRequestedRUSD",
      "administrationShortfallRUSD",
      "educationRequestedRUSD",
      "educationShortfallRUSD",
      "trainingRequestedRUSD",
      "trainingShortfallRUSD",
    ] as const) {
      const value = entry[field] ?? 0;
      if (value !== 0) encodedEntry[field] = value;
    }
    encoded[accountTotalKey(countryId)] =
      encodedEntry as SerializedFinanceBudgetTotals;
  }
  return encoded;
}

function encodePeriodSummary(summary: FinancePeriodSummary): SerializedFinancePeriodSummary {
  const accountTotals: Record<string, number> = {};
  const accountIds = Object.keys(summary.accountTotals)
    .map((key) => Number(key))
    .sort((left, right) => left - right);
  for (const accountId of accountIds) {
    const value = summary.accountTotals[accountId];
    if (value === undefined) {
      throw new RangeError(`summary account total ${String(accountId)} is missing a value`);
    }
    accountTotals[accountTotalKey(accountId)] = value;
  }
  const flowTotalsByKind: Record<string, number> = {};
  for (const kind of FLOW_TRANSACTION_KINDS) {
    flowTotalsByKind[kind] = summary.flowTotalsByKind[kind];
  }
  const countryBudgetTotals = encodeBudgetTotals(summary.countryBudgetTotals);
  const closingValuations =
    summary.closingValuations === undefined
      ? {}
      : {
          closingValuations: summary.closingValuations.map((entry) => ({
            currencyId: entry.currencyId,
            rusdPerUnit: entry.rusdPerUnit,
          })),
        };
  const countryClosingBalances =
    summary.countryClosingBalances === undefined
      ? {}
      : {
          countryClosingBalances: summary.countryClosingBalances.map((entry) => ({
            countryId: entry.countryId,
            treasuryCashRUSD: entry.treasuryCashRUSD,
            debtOutstandingRUSD: entry.debtOutstandingRUSD,
            householdCashRUSD: entry.householdCashRUSD,
          })),
        };
  if (summary.countryFiscalTotals === undefined) {
    return {
      periodStartDay: summary.periodStartDay,
      periodEndDay: summary.periodEndDay,
      accountTotals,
      flowTotalsByKind,
      countryBudgetTotals,
      ...closingValuations,
      ...countryClosingBalances,
    };
  }
  return {
    periodStartDay: summary.periodStartDay,
    periodEndDay: summary.periodEndDay,
    accountTotals,
    flowTotalsByKind,
    countryFiscalTotals: encodeCountryFiscalTotals(summary.countryFiscalTotals),
    countryBudgetTotals,
    ...closingValuations,
    ...countryClosingBalances,
  };
}

/** Encode all authoritative world fields. Validates the world first. */
export function encodeWorld(world: World): SerializedWorld {
  assertValidWorld(world);
  // P5b (C-12): the hydro field is written for every province or for none.
  const encodeHydro = world.provinceEconomies.some((entry) => entry.hydroPotentialMWhPerYear !== null);
  const encodeJobMix = world.buildings.some((building) => building.jobMix !== undefined && building.jobMix !== null);
  // P6 (D-153): the demand and housing fields are written for every record or for none,
  // so worlds without a demand system keep their earlier encoding.
  const encodeDemand = worldHasDemandState(world);
  return {
    schemaVersion: world.schemaVersion,
    simVersion: world.simVersion,
    dataVersion: world.dataVersion,
    scenarioId: world.scenarioId,
    dayIndex: world.dayIndex,
    startDayIndex: world.startDayIndex,
    seed: world.seed,
    provinceEconomies: world.provinceEconomies.map((province) => ({
      id: province.id,
      key: province.key,
      name: province.name,
      popBlockIds: [...province.popBlockIds],
      marketId: province.marketId,
      buildingInstanceIds: [...province.buildingInstanceIds].sort((left, right) => left - right),
      unrest: province.unrest,
      infrastructure: province.infrastructure,
      arableLandHa: province.arableLandHa,
      pastureHa: province.pastureHa,
      urbanShare: province.urbanShare,
      wageRUSDPerYearByProfession: [...province.wageRUSDPerYearByProfession],
      absLatitudeDeg: province.absLatitudeDeg,
      ...(encodeHydro ? { hydroPotentialMWhPerYear: province.hydroPotentialMWhPerYear } : {}),
      ...(encodeDemand ? { housingReferencePersonsPerDwelling: province.housingReferencePersonsPerDwelling } : {}),
    })),
    countries: [...world.countries]
      .sort((left, right) => left.id - right.id)
      .map((country) => ({
        id: country.id,
        tag: country.tag,
        name: country.name,
        monetary: { ...country.monetary },
        treasuryAccountId: country.treasuryAccountId,
        fiscal: {
          incomeTaxRate: country.fiscal.incomeTaxRate,
          incomeTaxAllowanceRUSDPerYear: country.fiscal.incomeTaxAllowanceRUSDPerYear,
          welfareBudgetRUSDPerYear: country.fiscal.welfareBudgetRUSDPerYear,
          welfareMaxWealthLevel: country.fiscal.welfareMaxWealthLevel,
          businessProfitTaxRate: country.fiscal.businessProfitTaxRate,
          reserveTargetRUSD: country.fiscal.reserveTargetRUSD,
        },
        debt: {
          enabled: country.debt.enabled,
          creditorKind: country.debt.creditorKind,
          creditorId: country.debt.creditorId,
          annualCouponRate: country.debt.annualCouponRate,
          termDays: country.debt.termDays,
          maxOutstandingPrincipalRUSD: country.debt.maxOutstandingPrincipalRUSD,
          refinanceOnMaturity: country.debt.refinanceOnMaturity,
          arrearsGraceDays: country.debt.arrearsGraceDays,
        },
        ai: {
          nextEvaluationDay: country.ai.nextEvaluationDay,
          currentGoalId: country.ai.currentGoalId,
          lastDecisionDay: country.ai.lastDecisionDay,
          lastActionSummary: country.ai.lastActionSummary,
        },
        immigrationOpen: country.immigrationOpen,
        industrial: {
          sectorSubsidyRates: [...country.industrial.sectorSubsidyRates],
        },
        politics: {
          regime: {
            kind: country.regime.kind,
            sinceDay: country.regime.sinceDay,
            governmentGroupKey: country.regime.governmentGroupKey,
            nextElectionDay: country.regime.nextElectionDay,
            lastElectionDay: country.regime.lastElectionDay,
            lastElection:
              country.regime.lastElection === null
                ? null
                : { ...country.regime.lastElection },
            crisis: { ...country.regime.crisis },
          },
          laws: { ...country.laws },
          lawTransitions: [...country.lawTransitions]
            .sort((left, right) => left.id - right.id)
            .map((transition) => ({ ...transition })),
          interestGroups: [...country.interestGroups]
            .sort((left, right) => left.id - right.id)
            .map((group) => ({
              ...group,
              stanceByLaw: { ...group.stanceByLaw },
            })),
          institutions: {
            ...country.institutions,
            staffedByProfession: { ...country.institutions.staffedByProfession },
          },
        },
        technology: {
          researched: [...country.technology.researched]
            .sort((left, right) => left.technologyId - right.technologyId)
            .map((entry) => ({
              technologyId: entry.technologyId,
              completedDay: entry.completedDay,
            })),
          activeProject:
            country.technology.activeProject === null
              ? null
              : {
                  technologyId: country.technology.activeProject.technologyId,
                  startedDay: country.technology.activeProject.startedDay,
                },
          workByTechnology: Object.fromEntries(
            Object.entries(country.technology.workByTechnology)
              .map(([rawId, work]) => [Number(rawId), work] as const)
              .sort((left, right) => left[0] - right[0])
              .map(([id, work]) => [String(id), work]),
          ),
        },
        education: {
          fundedAnnualRUSD: country.education.fundedAnnualRUSD,
          researchStaffShare: country.education.researchStaffShare,
          lastUpdateDay: country.education.lastUpdateDay,
          fundingRequestedMonthToDateRUSD:
            country.education.fundingRequestedMonthToDateRUSD,
          fundingShortfallMonthToDateRUSD:
            country.education.fundingShortfallMonthToDateRUSD,
        },
        labor: {
          trainingBudgetRUSDPerYear: country.labor.trainingBudgetRUSDPerYear,
          trainingStipendPerTraineeRUSDPerYear:
            country.labor.trainingStipendPerTraineeRUSDPerYear,
          trainingStaffShare: country.labor.trainingStaffShare,
          trainingParticipation: country.labor.trainingParticipation,
          lastUpdateDay: country.labor.lastUpdateDay,
          trainingRequestedMonthToDateRUSD:
            country.labor.trainingRequestedMonthToDateRUSD,
          trainingShortfallMonthToDateRUSD:
            country.labor.trainingShortfallMonthToDateRUSD,
        },
        trade: {
          tariffRates: [...country.trade.tariffRates],
          importQuotaQuantity: [...country.trade.importQuotaQuantity],
          importQuotaUsedQuantity: [...country.trade.importQuotaUsedQuantity],
          exportRestricted: [...country.trade.exportRestricted],
          lastUpdateDay: country.trade.lastUpdateDay,
          exportsValueMonthToDateRUSD: country.trade.exportsValueMonthToDateRUSD,
          importsValueMonthToDateRUSD: country.trade.importsValueMonthToDateRUSD,
          dutyReceivedMonthToDateRUSD: country.trade.dutyReceivedMonthToDateRUSD,
          dutyPaidMonthToDateRUSD: country.trade.dutyPaidMonthToDateRUSD,
          freightPaidMonthToDateRUSD: country.trade.freightPaidMonthToDateRUSD,
        },
      })),
    currencies: [...world.currencies]
      .sort((left, right) => left.id - right.id)
      .map((currency) => ({
        id: currency.id,
        key: currency.key,
        name: currency.name,
        issuer: { ...currency.issuer },
      })),
    currencyValuations: [...world.currencyValuations]
      .sort((left, right) => left.currencyId - right.currencyId)
      .map((valuation) =>
        valuation.status === "specified"
          ? {
              currencyId: valuation.currencyId,
              status: "specified" as const,
              rusdPerUnit: valuation.rusdPerUnit,
              setOnDay: valuation.setOnDay,
              source: valuation.source,
            }
          : { currencyId: valuation.currencyId, status: "unavailable" as const },
      ),
    popBlocks: world.popBlocks.map((block) => ({
      id: block.id,
      provinceId: block.provinceId,
      professionId: block.professionId,
      maleByAge: encodeTypedArray(block.maleByAge),
      femaleByAge: encodeTypedArray(block.femaleByAge),
      literacy: block.literacy,
      literacyByAge: [...block.literacyByAge],
      qualification: block.qualification,
      wealthLevel: block.wealthLevel,
      financialAccountId: block.financialAccountId,
      militancy: block.militancy,
      unmetSubsistenceDays: block.unmetSubsistenceDays,
      unmetBasicDays: block.unmetBasicDays,
      comfortFulfilledDays: block.comfortFulfilledDays,
      fractionalBirthRemainder: block.fractionalBirthRemainder,
      fractionalMaleBirthRemainder: block.fractionalMaleBirthRemainder,
      fractionalDeathRemainder: block.fractionalDeathRemainder,
      urbanShare: block.urbanShare,
      fertilityResidual: block.fertilityResidual,
      childMortalityResidual: block.childMortalityResidual,
      adultMortalityResidual: block.adultMortalityResidual,
      childMortalityLagged: block.childMortalityLagged,
      foodSufficiency: block.foodSufficiency,
      ...(encodeDemand
        ? {
            incomeSmoothedRUSDPerCapitaDay: block.incomeSmoothedRUSDPerCapitaDay,
            dwellings: block.dwellings,
            housingReferencePersonsPerDwelling: block.housingReferencePersonsPerDwelling,
            housingReferenceIncomeRUSDPerCapitaDay: block.housingReferenceIncomeRUSDPerCapitaDay,
          }
        : {}),
    })),
    buildings: [...world.buildings]
      .sort((left, right) => left.id - right.id)
      .map((building) => ({
        id: building.id,
        definitionId: building.definitionId,
        provinceId: building.provinceId,
        level: building.level,
        condition: building.condition,
        ownerKind: building.ownerKind,
        ownerAccountId: building.ownerAccountId,
        builtOnDay: building.builtOnDay,
        operational: building.operational,
        operatingCashAccountId: building.operatingCashAccountId,
        technique: building.technique,
        depositId: building.depositId,
        ...(encodeJobMix
          ? {
              jobMix:
                building.jobMix === undefined || building.jobMix === null
                  ? null
                  : building.jobMix.map((job) => ({ professionId: job.professionId, workersPerThroughputUnit: job.workersPerThroughputUnit })),
            }
          : {}),
      })),
    employment: [...world.employment]
      .sort((left, right) => left.id - right.id)
      .map((assignment) => ({
        id: assignment.id,
        popBlockId: assignment.popBlockId,
        buildingInstanceId: assignment.buildingInstanceId,
        professionId: assignment.professionId,
        workers: assignment.workers,
      })),
    employmentDirty: world.employmentDirty,
    markets: [...world.markets]
      .sort((left, right) => left.id - right.id)
      .map((market) => ({
        id: market.id,
        priceRUSD: [...market.priceRUSD],
        stockLots: canonicalizeStockLots(market.stockLots).map((lot) => ({
          goodId: lot.goodId,
          ownerBuildingId: lot.ownerBuildingId,
          quantity: lot.quantity,
        })),
        customsCountryId: market.customsCountryId,
        ...(encodeDemand ? { priceSmoothedRUSD: [...market.priceSmoothedRUSD] } : {}),
      })),
    finance: {
      accounts: [...world.finance.accounts]
        .sort((left, right) => left.id - right.id)
        .map((account) => ({
          id: account.id,
          ownerKind: account.ownerKind,
          ownerId: account.ownerId,
          category: account.category,
          subtype: account.subtype,
          balanceRUSD: account.balanceRUSD,
        })),
      postings: [...world.finance.postings]
        .sort((left, right) => left.id - right.id)
        .map((posting) => ({
          id: posting.id,
          dayIndex: posting.dayIndex,
          transactionKind: posting.transactionKind,
          lines: posting.lines.map((line) => ({
            accountId: line.accountId,
            side: line.side,
            amountRUSD: line.amountRUSD,
          })),
          sourceEntityId: posting.sourceEntityId,
          targetEntityId: posting.targetEntityId,
        })),
      nextPostingId: world.finance.nextPostingId,
      nextAccountId: world.finance.nextAccountId,
      opening:
        world.finance.opening === null
          ? null
          : {
              dayIndex: world.finance.opening.dayIndex,
              accountCount: world.finance.opening.accountCount,
              checksum: world.finance.opening.checksum,
            },
      periodSummaries: [...world.finance.periodSummaries]
        .sort((left, right) => left.periodEndDay - right.periodEndDay)
        .map(encodePeriodSummary),
      annualSummaries: [...world.finance.annualSummaries]
        .sort((left, right) => left.year - right.year)
        .map((summary) => ({
          year: summary.year,
          periodStartDay: summary.periodStartDay,
          periodEndDay: summary.periodEndDay,
          complete: summary.complete,
          fiscalTotals: encodeCountryFiscalTotals(summary.fiscalTotals),
          budgetTotals: encodeBudgetTotals(summary.budgetTotals),
          flowTotalsByKind: { ...summary.flowTotalsByKind },
          closingBalances: Object.fromEntries(
            Object.entries(summary.closingBalances)
              .sort((left, right) => Number(left[0]) - Number(right[0]))
              .map(([countryId, balances]) => [
                countryId,
                {
                  treasuryCashRUSD: balances.treasuryCashRUSD,
                  debtLiabilityRUSD: balances.debtLiabilityRUSD,
                  interestPayableRUSD: balances.interestPayableRUSD,
                },
              ]),
          ),
          correctionCount: summary.correctionCount,
        })),
      corrections: [...world.finance.corrections]
        .sort((left, right) => left.id - right.id)
        .map((correction) => ({
          id: correction.id,
          dayIndex: correction.dayIndex,
          postingId: correction.postingId,
          originalPostingId: correction.originalPostingId,
          reason: correction.reason,
          lines: correction.lines.map((line) => ({
            accountId: line.accountId,
            side: line.side,
            amountRUSD: line.amountRUSD,
          })),
        })),
      nextCorrectionId: world.finance.nextCorrectionId,
      debtContracts: [...world.finance.debtContracts]
        .sort((left, right) => left.id - right.id)
        .map((contract) => ({
          id: contract.id,
          contractVersion: contract.contractVersion,
          issuerCountryId: contract.issuerCountryId,
          holderKind: contract.holderKind,
          holderId: contract.holderId,
          principalRUSD: contract.principalRUSD,
          outstandingPrincipalRUSD: contract.outstandingPrincipalRUSD,
          annualCouponRate: contract.annualCouponRate,
          issueDay: contract.issueDay,
          maturityDay: contract.maturityDay,
          accruedInterestRUSD: contract.accruedInterestRUSD,
          status: contract.status,
          arrearsSinceDay: contract.arrearsSinceDay,
        })),
      debtHistory: [...world.finance.debtHistory]
        .sort((left, right) => left.issuerCountryId - right.issuerCountryId)
        .map((aggregate) => ({
          issuerCountryId: aggregate.issuerCountryId,
          contractsRetired: aggregate.contractsRetired,
          contractsDefaulted: aggregate.contractsDefaulted,
          principalIssuedRUSD: aggregate.principalIssuedRUSD,
          principalRepaidRUSD: aggregate.principalRepaidRUSD,
          principalWrittenOffRUSD: aggregate.principalWrittenOffRUSD,
          interestWrittenOffRUSD: aggregate.interestWrittenOffRUSD,
        })),
      nextContractId: world.finance.nextContractId,
      budgetMemosThisMonth: Object.fromEntries(
        Object.entries(world.finance.budgetMemosThisMonth)
          .sort((left, right) => Number(left[0]) - Number(right[0]))
          .map(([countryId, memo]) => [
            countryId,
            {
              welfareRequestedRUSD: memo.welfareRequestedRUSD,
              welfareShortfallRUSD: memo.welfareShortfallRUSD,
              businessTaxAssessedRUSD: memo.businessTaxAssessedRUSD,
              businessTaxUncollectedRUSD: memo.businessTaxUncollectedRUSD,
              debtIssuedRUSD: memo.debtIssuedRUSD,
              principalRepaidRUSD: memo.principalRepaidRUSD,
              interestPaidRUSD: memo.interestPaidRUSD,
              unfinancedRequirementRUSD: memo.unfinancedRequirementRUSD,
              constructionSpentRUSD: memo.constructionSpentRUSD,
              constructionWrittenOffRUSD: memo.constructionWrittenOffRUSD,
              constructionMaterialsSpentRUSD: memo.constructionMaterialsSpentRUSD,
              subsidyRequestedRUSD: memo.subsidyRequestedRUSD,
              subsidyShortfallRUSD: memo.subsidyShortfallRUSD,
              publicEnterpriseSupportRUSD: memo.publicEnterpriseSupportRUSD,
              administrationRequestedRUSD: memo.administrationRequestedRUSD ?? 0,
              administrationShortfallRUSD: memo.administrationShortfallRUSD ?? 0,
              educationRequestedRUSD: memo.educationRequestedRUSD ?? 0,
              educationShortfallRUSD: memo.educationShortfallRUSD ?? 0,
              trainingRequestedRUSD: memo.trainingRequestedRUSD ?? 0,
              trainingShortfallRUSD: memo.trainingShortfallRUSD ?? 0,
              businessTaxAssessedDay: memo.businessTaxAssessedDay,
            },
          ]),
      ),
      closedThroughDay: world.finance.closedThroughDay,
    },
    profitDistribution: {
      enabled: world.profitDistribution.enabled,
      privatePayoutRate: world.profitDistribution.privatePayoutRate,
      stateRemittanceRate: world.profitDistribution.stateRemittanceRate,
    },
    countryAI: { enabled: world.countryAI.enabled },
    construction: {
      projects: [...world.construction.projects]
        .sort((left, right) => left.id - right.id)
        .map((project) => ({
          id: project.id,
          countryId: project.countryId,
          provinceId: project.provinceId,
          definitionId: project.definitionId,
          status: project.status,
          authorizedDay: project.authorizedDay,
          startedDay: project.startedDay,
          completedDay: project.completedDay,
          cancelledDay: project.cancelledDay,
          totalCostRUSD: project.totalCostRUSD,
          workingCapitalRUSD: project.workingCapitalRUSD,
          workingCapitalPaidRUSD: project.workingCapitalPaidRUSD,
          spentRUSD: project.spentRUSD,
          materialsSpentRUSD: project.materialsSpentRUSD,
          materials: [...project.materials]
            .sort((left, right) => left.goodId - right.goodId)
            .map((material) => ({
              goodId: material.goodId,
              requiredQuantity: material.requiredQuantity,
              deliveredQuantity: material.deliveredQuantity,
            })),
          lastWorkers: project.lastWorkers,
          blockedReason: project.blockedReason,
          buildingId: project.buildingId,
        })),
      history: [...world.construction.history]
        .sort((left, right) => left.countryId - right.countryId)
        .map((aggregate) => ({
          countryId: aggregate.countryId,
          projectsCompleted: aggregate.projectsCompleted,
          projectsCancelled: aggregate.projectsCancelled,
          totalSpentRUSD: aggregate.totalSpentRUSD,
          totalWrittenOffRUSD: aggregate.totalWrittenOffRUSD,
        })),
      nextProjectId: world.construction.nextProjectId,
      nextBuildingId: world.construction.nextBuildingId,
    },
    politics: {
      enabled: world.politics.enabled,
      eventQueue: [...world.politics.eventQueue]
        .sort((left, right) =>
          left.dueDay !== right.dueDay ? left.dueDay - right.dueDay : left.id - right.id,
        )
        .map((event) => ({ ...event })),
      eventLog: [...world.politics.eventLog]
        .sort((left, right) => left.id - right.id)
        .map((entry) => ({ ...entry })),
      nextEventId: world.politics.nextEventId,
      nextLogId: world.politics.nextLogId,
    },
    technology: { enabled: world.technology.enabled },
    trade: {
      enabled: world.trade.enabled,      routes: [...world.trade.routes]
        .sort((left, right) => left.id - right.id)
        .map((route) => ({
          id: route.id,
          marketAId: route.marketAId,
          marketBId: route.marketBId,
          distanceUnits: route.distanceUnits,
          baseCapacityRUSDPerDay: route.baseCapacityRUSDPerDay,
        })),
      shipments: [...world.trade.shipments]
        .sort((left, right) => left.id - right.id)
        .map((shipment) => ({
          id: shipment.id,
          goodId: shipment.goodId,
          quantity: shipment.quantity,
          sellerBuildingId: shipment.sellerBuildingId,
          originMarketId: shipment.originMarketId,
          destinationMarketId: shipment.destinationMarketId,
          originCountryId: shipment.originCountryId,
          destinationCountryId: shipment.destinationCountryId,
          dispatchDay: shipment.dispatchDay,
          arrivalDay: shipment.arrivalDay,
          cargoValueRUSD: shipment.cargoValueRUSD,
          freightCostRUSD: shipment.freightCostRUSD,
          dutyRUSD: shipment.dutyRUSD,
          dutyRate: shipment.dutyRate,
        })),
      nextShipmentId: world.trade.nextShipmentId,
      lastDispatchDay: world.trade.lastDispatchDay,
      lastDay:
        world.trade.lastDay === null
          ? null
          : {
              dayIndex: world.trade.lastDay.dayIndex,
              dispatchedShipments: world.trade.lastDay.dispatchedShipments,
              freightPaidRUSD: world.trade.lastDay.freightPaidRUSD,
              dutyPaidRUSD: world.trade.lastDay.dutyPaidRUSD,
              ownerFundedRUSD: world.trade.lastDay.ownerFundedRUSD,
              arrivedShipments: world.trade.lastDay.arrivedShipments,
              blocked: world.trade.lastDay.blocked.map((entry) => ({
                originMarketId: entry.originMarketId,
                destinationMarketId: entry.destinationMarketId,
                goodId: entry.goodId,
                reason: entry.reason,
              })),
            },
    },
    demography: encodeDemographyReport(world.demography),
    resources: encodeResourceState(world.resources),
    ...(world.labourMarket.enabled ? { labourMarket: encodeLabourMarket(world.labourMarket) } : {}),
    priceIndex: {
      basket: [...world.priceIndex.basket]
        .sort((left, right) => left.goodId - right.goodId)
        .map((item) => ({ goodId: item.goodId, weight: item.weight })),
      basePrices: [...world.priceIndex.basePrices]
        .sort((left, right) => left.marketId - right.marketId)
        .map((base) => ({ marketId: base.marketId, prices: [...base.prices] })),
      observations: [...world.priceIndex.observations]
        .sort((left, right) => left.dayIndex - right.dayIndex)
        .map((observation) => ({
          year: observation.year,
          month: observation.month,
          dayIndex: observation.dayIndex,
          world: observation.world,
          countries: [...observation.countries]
            .sort((left, right) => left.countryId - right.countryId)
            .map((entry) => ({ countryId: entry.countryId, value: entry.value })),
        })),
      lastObservationDay: world.priceIndex.lastObservationDay,
    },
    monetary: {
      enabled: world.monetary.enabled,
      currencies: [...world.monetary.currencies]
        .sort((left, right) => left.currencyId - right.currencyId)
        .map((record) => ({
          currencyId: record.currencyId,
          issuerCountryId: record.issuerCountryId,
          regime: record.regime,
          parityRusdPerUnit: record.parityRusdPerUnit,
          referenceParityRusdPerUnit: record.referenceParityRusdPerUnit,
          currencyIssuedUnits: record.currencyIssuedUnits,
          active: record.active,
          reserveAccountId: record.reserveAccountId,
          liabilityAccountId: record.liabilityAccountId,
          equityAccountId: record.equityAccountId,
          externalCashAccountId: record.externalCashAccountId,
          externalCurrencyAccountId: record.externalCurrencyAccountId,
          externalEquityAccountId: record.externalEquityAccountId,
          lastParityChangeDay: record.lastParityChangeDay,
          lastManagedUpdateDay: record.lastManagedUpdateDay,
          lastMonthEndDay: record.lastMonthEndDay,
          lastMonthExportsRUSD: record.lastMonthExportsRUSD,
          lastMonthImportsRUSD: record.lastMonthImportsRUSD,
          // D-149 (schema 33): the metal standard.
          standard: record.standard,
          fineGramsPerUnit: record.fineGramsPerUnit,
          metalReserveKg: record.metalReserveKg,
          metalReserveAccountId: record.metalReserveAccountId,
          convertible: record.convertible,
          lastMintSaleKg: record.lastMintSaleKg,
        })),
      lastUpdateDay: world.monetary.lastUpdateDay,
    },
    military: {
      enabled: world.military.enabled,
      armies: [...world.military.armies]
        .sort((left, right) => left.id - right.id)
        .map((army) => ({ ...army })),
      wars: [...world.military.wars]
        .sort((left, right) => left.id - right.id)
        .map((war) => ({ ...war })),
      relations: [...world.military.relations]
        .sort(
          (left, right) =>
            left.countryA - right.countryA || left.countryB - right.countryB,
        )
        .map((relation) => ({ ...relation })),
      peaceOffers: [...world.military.peaceOffers]
        .sort((left, right) => left.id - right.id)
        .map((offer) => ({ ...offer })),
      casualties: [...world.military.casualties]
        .sort((left, right) => left.countryId - right.countryId)
        .map((record) => ({ ...record })),
      nextArmyId: world.military.nextArmyId,
      nextWarId: world.military.nextWarId,
      nextOfferId: world.military.nextOfferId,
      lastPhaseDay: world.military.lastPhaseDay,
    },
    provinces: {
      enabled: world.provinces.enabled,
      ownership: world.provinces.ownership.map((entry) => ({
        provinceId: entry.provinceId,
        ownerPolityId: entry.ownerPolityId,
        controllerPolityId: entry.controllerPolityId,
        controlledSinceDay: entry.controlledSinceDay,
        claimantPolityIds: [...entry.claimantPolityIds],
        specialStatus: entry.specialStatus,
      })),
      transfers: world.provinces.transfers.map((transfer) => ({
        id: transfer.id,
        day: transfer.day,
        provinceIds: [...transfer.provinceIds],
        fromPolityId: transfer.fromPolityId,
        toPolityId: transfer.toPolityId,
        kind: transfer.kind,
        note: transfer.note,
      })),
      nextTransferId: world.provinces.nextTransferId,
    },
    playerCountryId: world.playerCountryId,
    moneyCoefficients: { ...world.moneyCoefficients },
    diagnostics: {
      invariantFailureCount: world.diagnostics.invariantFailureCount,
      invalidActionCount: world.diagnostics.invalidActionCount,
      eventApplicationCount: world.diagnostics.eventApplicationCount,
      recentWarnings: [...world.diagnostics.recentWarnings],
    },
  };
}

function decodeProvinceEconomy(value: unknown, path: string): ProvinceEconomy {
  const record = requireRecord(value, path);
  const popBlockIds = requireArray(record.popBlockIds, `${path}.popBlockIds`);
  const ids: number[] = [];
  for (let index = 0; index < popBlockIds.length; index += 1) {
    ids.push(requireUint32(popBlockIds[index], `${path}.popBlockIds[${String(index)}]`));
  }
  const buildingIds = requireArray(record.buildingInstanceIds, `${path}.buildingInstanceIds`);
  const buildings: number[] = [];
  for (let index = 0; index < buildingIds.length; index += 1) {
    buildings.push(
      requireUint32(buildingIds[index], `${path}.buildingInstanceIds[${String(index)}]`),
    );
  }
  const marketId =
    record.marketId === null ? null : requireUint32(record.marketId, `${path}.marketId`);
  const wageValues = requireArray(
    record.wageRUSDPerYearByProfession,
    `${path}.wageRUSDPerYearByProfession`,
  );
  const wages: number[] = [];
  for (let index = 0; index < wageValues.length; index += 1) {
    wages.push(
      requireFiniteNumber(wageValues[index], `${path}.wageRUSDPerYearByProfession[${String(index)}]`),
    );
  }
  return {
    id: requireUint32(record.id, `${path}.id`),
    key: requireString(record.key, `${path}.key`, { minLength: 1 }),
    name: requireString(record.name, `${path}.name`, { minLength: 1 }),
    popBlockIds: ids,
    marketId,
    buildingInstanceIds: buildings,
    unrest: requireFiniteNumber(record.unrest, `${path}.unrest`),
    infrastructure: requireFiniteNumber(record.infrastructure, `${path}.infrastructure`),
    arableLandHa: requireFiniteNumber(record.arableLandHa, `${path}.arableLandHa`),
    pastureHa: requireFiniteNumber(record.pastureHa, `${path}.pastureHa`),
    urbanShare: requireFiniteNumber(record.urbanShare, `${path}.urbanShare`),
    wageRUSDPerYearByProfession: wages,
    absLatitudeDeg:
      record.absLatitudeDeg === null ? null : requireFiniteNumber(record.absLatitudeDeg, `${path}.absLatitudeDeg`),
    hydroPotentialMWhPerYear:
      record.hydroPotentialMWhPerYear === undefined || record.hydroPotentialMWhPerYear === null
        ? null
        : requireFiniteNumber(record.hydroPotentialMWhPerYear, `${path}.hydroPotentialMWhPerYear`),
    housingReferencePersonsPerDwelling:
      record.housingReferencePersonsPerDwelling === undefined || record.housingReferencePersonsPerDwelling === null
        ? null
        : requireFiniteNumber(record.housingReferencePersonsPerDwelling, `${path}.housingReferencePersonsPerDwelling`),
  };
}

function decodeCurrencyIssuer(value: unknown, path: string): CurrencyIssuer {
  const record = requireRecord(value, path);
  const kind = record.kind;
  if (kind === "country") {
    return {
      kind: "country",
      countryId: requireUint32(record.countryId, `${path}.countryId`),
    };
  }
  if (kind === "foreign") {
    return {
      kind: "foreign",
      issuerKey: requireString(record.issuerKey, `${path}.issuerKey`, {
        minLength: 1,
        maxLength: MAX_FOREIGN_ISSUER_KEY_LENGTH,
      }),
    };
  }
  if (kind === "union") {
    return {
      kind: "union",
      unionKey: requireString(record.unionKey, `${path}.unionKey`, { minLength: 1 }),
    };
  }
  throw new SaveFormatError(`${path}.kind is invalid`);
}

function decodeMonetaryArrangement(value: unknown, path: string): MonetaryArrangement {
  const record = requireRecord(value, path);
  const kind = record.kind;
  const currencyId = requireUint32(record.currencyId, `${path}.currencyId`);
  if (kind === "own" || kind === "adopted") {
    return { kind, currencyId };
  }
  if (kind === "shared") {
    return {
      kind: "shared",
      currencyId,
      unionKey: requireString(record.unionKey, `${path}.unionKey`, { minLength: 1 }),
    };
  }
  throw new SaveFormatError(`${path}.kind is invalid`);
}

function decodeFiscalPolicy(value: unknown, path: string): FiscalPolicy {
  try {
    return assertValidFiscalPolicy(value, path);
  } catch (error) {
    throw new SaveFormatError(`${path} is invalid: ${errorMessage(error)}`);
  }
}

function decodeIndustrialPolicy(value: unknown, path: string): IndustrialPolicy {
  try {
    return assertValidIndustrialPolicy(value, path);
  } catch (error) {
    throw new SaveFormatError(`${path} is invalid: ${errorMessage(error)}`);
  }
}

function decodeCountryFiscalTotals(
  value: unknown,
  path: string,
): Record<number, FinancePeriodFiscalTotals> {
  const raw = requireRecord(value, path);
  const totals: Record<number, FinancePeriodFiscalTotals> = {};
  for (const key of Object.keys(raw)) {
    if (!/^(0|[1-9][0-9]*)$/.test(key)) {
      throw new SaveFormatError(`${path} key ${JSON.stringify(key)} is not a canonical decimal country id`);
    }
    const countryId = Number(key);
    if (!Number.isSafeInteger(countryId) || countryId < 0 || countryId > 0xffff_ffff) {
      throw new SaveFormatError(`${path} key ${JSON.stringify(key)} is out of range`);
    }
    const entry = requireRecord(raw[key], `${path}[${key}]`);
    const optionalNumber = (field: string): number =>
      entry[field] === undefined
        ? 0
        : requireFiniteNumber(entry[field], `${path}[${key}].${field}`);
    totals[countryId] = {
      incomeTaxRevenueRUSD: optionalNumber("incomeTaxRevenueRUSD"),
      businessTaxRevenueRUSD: optionalNumber("businessTaxRevenueRUSD"),
      welfareExpenseRUSD: optionalNumber("welfareExpenseRUSD"),
      interestExpenseRUSD: optionalNumber("interestExpenseRUSD"),
      subsidyExpenseRUSD: optionalNumber("subsidyExpenseRUSD"),
      administrationExpenseRUSD: optionalNumber("administrationExpenseRUSD"),
      educationExpenseRUSD: optionalNumber("educationExpenseRUSD"),
      trainingExpenseRUSD: optionalNumber("trainingExpenseRUSD"),
      militaryExpenseRUSD: optionalNumber("militaryExpenseRUSD"),
      customsDutyRevenueRUSD: optionalNumber("customsDutyRevenueRUSD"),
      netFiscalResultRUSD: optionalNumber("netFiscalResultRUSD"),
    };
  }
  return totals;
}

function decodeBudgetTotals(
  value: unknown,
  path: string,
): Record<number, FinancePeriodBudgetTotals> {
  const raw = requireRecord(value, path);
  const totals: Record<number, FinancePeriodBudgetTotals> = {};
  for (const key of Object.keys(raw)) {
    if (!/^(0|[1-9][0-9]*)$/.test(key)) {
      throw new SaveFormatError(`${path} key ${JSON.stringify(key)} is not a canonical decimal country id`);
    }
    const countryId = Number(key);
    if (!Number.isSafeInteger(countryId) || countryId < 0 || countryId > 0xffff_ffff) {
      throw new SaveFormatError(`${path} key ${JSON.stringify(key)} is out of range`);
    }
    const entry = requireRecord(raw[key], `${path}[${key}]`);
    const optionalNumber = (field: string): number =>
      entry[field] === undefined
        ? 0
        : requireFiniteNumber(entry[field], `${path}[${key}].${field}`);
    totals[countryId] = {
      welfareRequestedRUSD: optionalNumber("welfareRequestedRUSD"),
      welfareShortfallRUSD: optionalNumber("welfareShortfallRUSD"),
      businessTaxAssessedRUSD: optionalNumber("businessTaxAssessedRUSD"),
      businessTaxUncollectedRUSD: optionalNumber("businessTaxUncollectedRUSD"),
      debtIssuedRUSD: optionalNumber("debtIssuedRUSD"),
      principalRepaidRUSD: optionalNumber("principalRepaidRUSD"),
      interestPaidRUSD: optionalNumber("interestPaidRUSD"),
      unfinancedRequirementRUSD: optionalNumber("unfinancedRequirementRUSD"),
      constructionSpentRUSD: optionalNumber("constructionSpentRUSD"),
      constructionWrittenOffRUSD: optionalNumber("constructionWrittenOffRUSD"),
      constructionMaterialsSpentRUSD: optionalNumber("constructionMaterialsSpentRUSD"),
      subsidyRequestedRUSD: optionalNumber("subsidyRequestedRUSD"),
      subsidyShortfallRUSD: optionalNumber("subsidyShortfallRUSD"),
      publicEnterpriseSupportRUSD: optionalNumber("publicEnterpriseSupportRUSD"),
      administrationRequestedRUSD: optionalNumber("administrationRequestedRUSD"),
      administrationShortfallRUSD: optionalNumber("administrationShortfallRUSD"),
      educationRequestedRUSD: optionalNumber("educationRequestedRUSD"),
      educationShortfallRUSD: optionalNumber("educationShortfallRUSD"),
      trainingRequestedRUSD: optionalNumber("trainingRequestedRUSD"),
      trainingShortfallRUSD: optionalNumber("trainingShortfallRUSD"),
    };
  }
  return totals;
}

function decodeBudgetMemo(
  value: unknown,
  path: string,
): FinanceBudgetMemo {
  const record = requireRecord(value, path);
  return {
    welfareRequestedRUSD: requireFiniteNumber(
      record.welfareRequestedRUSD,
      `${path}.welfareRequestedRUSD`,
    ),
    welfareShortfallRUSD: requireFiniteNumber(
      record.welfareShortfallRUSD,
      `${path}.welfareShortfallRUSD`,
    ),
    businessTaxAssessedRUSD: requireFiniteNumber(
      record.businessTaxAssessedRUSD,
      `${path}.businessTaxAssessedRUSD`,
    ),
    businessTaxUncollectedRUSD: requireFiniteNumber(
      record.businessTaxUncollectedRUSD,
      `${path}.businessTaxUncollectedRUSD`,
    ),
    debtIssuedRUSD: requireFiniteNumber(record.debtIssuedRUSD, `${path}.debtIssuedRUSD`),
    principalRepaidRUSD: requireFiniteNumber(
      record.principalRepaidRUSD,
      `${path}.principalRepaidRUSD`,
    ),
    interestPaidRUSD: requireFiniteNumber(record.interestPaidRUSD, `${path}.interestPaidRUSD`),
    unfinancedRequirementRUSD: requireFiniteNumber(
      record.unfinancedRequirementRUSD,
      `${path}.unfinancedRequirementRUSD`,
    ),
    constructionSpentRUSD: requireFiniteNumber(
      record.constructionSpentRUSD,
      `${path}.constructionSpentRUSD`,
    ),
    constructionWrittenOffRUSD: requireFiniteNumber(
      record.constructionWrittenOffRUSD,
      `${path}.constructionWrittenOffRUSD`,
    ),
    constructionMaterialsSpentRUSD: requireFiniteNumber(
      record.constructionMaterialsSpentRUSD,
      `${path}.constructionMaterialsSpentRUSD`,
    ),
    subsidyRequestedRUSD: requireFiniteNumber(
      record.subsidyRequestedRUSD,
      `${path}.subsidyRequestedRUSD`,
    ),
    subsidyShortfallRUSD: requireFiniteNumber(
      record.subsidyShortfallRUSD,
      `${path}.subsidyShortfallRUSD`,
    ),
    publicEnterpriseSupportRUSD: requireFiniteNumber(
      record.publicEnterpriseSupportRUSD,
      `${path}.publicEnterpriseSupportRUSD`,
    ),
    administrationRequestedRUSD:
      record.administrationRequestedRUSD === undefined
        ? 0
        : requireFiniteNumber(
            record.administrationRequestedRUSD,
            `${path}.administrationRequestedRUSD`,
          ),
    administrationShortfallRUSD:
      record.administrationShortfallRUSD === undefined
        ? 0
        : requireFiniteNumber(
            record.administrationShortfallRUSD,
            `${path}.administrationShortfallRUSD`,
          ),
    educationRequestedRUSD:
      record.educationRequestedRUSD === undefined
        ? 0
        : requireFiniteNumber(
            record.educationRequestedRUSD,
            `${path}.educationRequestedRUSD`,
          ),
    educationShortfallRUSD:
      record.educationShortfallRUSD === undefined
        ? 0
        : requireFiniteNumber(
            record.educationShortfallRUSD,
            `${path}.educationShortfallRUSD`,
          ),
    trainingRequestedRUSD:
      record.trainingRequestedRUSD === undefined
        ? 0
        : requireFiniteNumber(
            record.trainingRequestedRUSD,
            `${path}.trainingRequestedRUSD`,
          ),
    trainingShortfallRUSD:
      record.trainingShortfallRUSD === undefined
        ? 0
        : requireFiniteNumber(
            record.trainingShortfallRUSD,
            `${path}.trainingShortfallRUSD`,
          ),
    businessTaxAssessedDay:
      record.businessTaxAssessedDay === null
        ? null
        : requireInteger(
            record.businessTaxAssessedDay,
            `${path}.businessTaxAssessedDay`,
            0,
            CAMPAIGN_TERMINAL_DAY_INDEX,
          ),
  };
}

function decodeDebtPolicy(value: unknown, path: string): DebtPolicy {
  const record = requireRecord(value, path);
  try {
    return assertValidDebtPolicy(
      {
        enabled: record.enabled,
        creditorKind: record.creditorKind,
        creditorId: record.creditorId,
        annualCouponRate: record.annualCouponRate,
        termDays: record.termDays,
        maxOutstandingPrincipalRUSD: record.maxOutstandingPrincipalRUSD,
        refinanceOnMaturity: record.refinanceOnMaturity,
        arrearsGraceDays: record.arrearsGraceDays,
      },
      path,
    );
  } catch (error) {
    throw new SaveFormatError(`${path} is invalid: ${errorMessage(error)}`);
  }
}

function decodeCountryAIPolicy(value: unknown, path: string): CountryAIPolicy {
  try {
    return assertValidCountryAIPolicy(value, path);
  } catch (error) {
    throw new SaveFormatError(`${path} is invalid: ${errorMessage(error)}`);
  }
}

function decodeCountryAIState(value: unknown, path: string): CountryAIState {
  try {
    return assertValidCountryAIState(value, path);
  } catch (error) {
    throw new SaveFormatError(`${path} is invalid: ${errorMessage(error)}`);
  }
}

function decodeDebtContract(value: unknown, path: string): DebtContract {
  const record = requireRecord(value, path);
  const status = record.status;
  if (status !== "active" && status !== "arrears" && status !== "repaid" && status !== "defaulted") {
    throw new SaveFormatError(`${path}.status is invalid`);
  }
  if (record.holderKind !== "country" && record.holderKind !== "popBlock") {
    throw new SaveFormatError(`${path}.holderKind is invalid`);
  }
  if (record.contractVersion !== 1) {
    throw new SaveFormatError(`${path}.contractVersion must be 1`);
  }
  return {
    id: requireUint32(record.id, `${path}.id`),
    contractVersion: 1,
    issuerCountryId: requireUint32(record.issuerCountryId, `${path}.issuerCountryId`),
    holderKind: record.holderKind,
    holderId: requireUint32(record.holderId, `${path}.holderId`),
    principalRUSD: requireFiniteNumber(record.principalRUSD, `${path}.principalRUSD`),
    outstandingPrincipalRUSD: requireFiniteNumber(
      record.outstandingPrincipalRUSD,
      `${path}.outstandingPrincipalRUSD`,
    ),
    annualCouponRate: requireFiniteNumber(record.annualCouponRate, `${path}.annualCouponRate`),
    issueDay: requireInteger(record.issueDay, `${path}.issueDay`, 0, CAMPAIGN_TERMINAL_DAY_INDEX),
    maturityDay: requireInteger(
      record.maturityDay,
      `${path}.maturityDay`,
      0,
      CAMPAIGN_TERMINAL_DAY_INDEX,
    ),
    accruedInterestRUSD: requireFiniteNumber(
      record.accruedInterestRUSD,
      `${path}.accruedInterestRUSD`,
    ),
    status,
    arrearsSinceDay:
      record.arrearsSinceDay === null
        ? null
        : requireInteger(
            record.arrearsSinceDay,
            `${path}.arrearsSinceDay`,
            0,
            CAMPAIGN_TERMINAL_DAY_INDEX,
          ),
  };
}

function decodePoliticsState(value: unknown, path: string): PoliticsState {
  const record = requireRecord(value, path);
  if (typeof record.enabled !== "boolean") {
    throw new SaveFormatError(`${path}.enabled must be a boolean`);
  }
  const queue = requireArray(record.eventQueue, `${path}.eventQueue`).map((raw, index) => {
    const entryPath = `${path}.eventQueue[${String(index)}]`;
    const entry = requireRecord(raw, entryPath);
    const status = requireString(entry.status, `${entryPath}.status`, { minLength: 1 });
    if (status !== "scheduled" && status !== "applied" && status !== "skipped") {
      throw new SaveFormatError(`${entryPath}.status is invalid`);
    }
    return {
      id: requireUint32(entry.id, `${entryPath}.id`),
      definitionId: requireUint32(entry.definitionId, `${entryPath}.definitionId`),
      key: requireString(entry.key, `${entryPath}.key`, { minLength: 1 }),
      countryId: requireUint32(entry.countryId, `${entryPath}.countryId`),
      dueDay: requireInteger(entry.dueDay, `${entryPath}.dueDay`, 0, CAMPAIGN_TERMINAL_DAY_INDEX),
      appliedDay:
        entry.appliedDay === null
          ? null
          : requireInteger(
              entry.appliedDay,
              `${entryPath}.appliedDay`,
              0,
              CAMPAIGN_TERMINAL_DAY_INDEX,
            ),
      status,
      provenance: requireString(entry.provenance, `${entryPath}.provenance`, { minLength: 1 }),
    } as PoliticsState["eventQueue"][number];
  });
  const log = requireArray(record.eventLog, `${path}.eventLog`).map((raw, index) => {
    const entryPath = `${path}.eventLog[${String(index)}]`;
    const entry = requireRecord(raw, entryPath);
    const kind = requireString(entry.kind, `${entryPath}.kind`, { minLength: 1 });
    return {
      id: requireUint32(entry.id, `${entryPath}.id`),
      day: requireInteger(entry.day, `${entryPath}.day`, 0, CAMPAIGN_TERMINAL_DAY_INDEX),
      kind,
      countryId:
        entry.countryId === null ? null : requireUint32(entry.countryId, `${entryPath}.countryId`),
      summary: requireString(entry.summary, `${entryPath}.summary`),
      provenance: requireString(entry.provenance, `${entryPath}.provenance`),
    } as PoliticsState["eventLog"][number];
  });
  return {
    enabled: record.enabled,
    eventQueue: queue,
    eventLog: log,
    nextEventId: requireUint32(record.nextEventId, `${path}.nextEventId`),
    nextLogId: requireUint32(record.nextLogId, `${path}.nextLogId`),
  };
}

function decodeRegimeState(value: unknown, path: string): RegimeState {
  const record = requireRecord(value, path);
  const crisisRecord = requireRecord(record.crisis, `${path}.crisis`);
  const lastElectionRecord =
    record.lastElection === null
      ? null
      : requireRecord(record.lastElection, `${path}.lastElection`);
  return {
    kind: requireString(record.kind, `${path}.kind`, { minLength: 1 }) as RegimeState["kind"],
    sinceDay: requireInteger(record.sinceDay, `${path}.sinceDay`, 0, CAMPAIGN_TERMINAL_DAY_INDEX),
    governmentGroupKey: requireString(
      record.governmentGroupKey,
      `${path}.governmentGroupKey`,
      { minLength: 1 },
    ) as RegimeState["governmentGroupKey"],
    nextElectionDay:
      record.nextElectionDay === null
        ? null
        : requireInteger(
            record.nextElectionDay,
            `${path}.nextElectionDay`,
            0,
            CAMPAIGN_TERMINAL_DAY_INDEX,
          ),
    lastElectionDay:
      record.lastElectionDay === null
        ? null
        : requireInteger(
            record.lastElectionDay,
            `${path}.lastElectionDay`,
            0,
            CAMPAIGN_TERMINAL_DAY_INDEX,
          ),
    lastElection:
      lastElectionRecord === null
        ? null
        : {
            day: requireInteger(
              lastElectionRecord.day,
              `${path}.lastElection.day`,
              0,
              CAMPAIGN_TERMINAL_DAY_INDEX,
            ),
            eligiblePopulation: requireFiniteNumber(
              lastElectionRecord.eligiblePopulation,
              `${path}.lastElection.eligiblePopulation`,
            ),
            votesForGovernment: requireFiniteNumber(
              lastElectionRecord.votesForGovernment,
              `${path}.lastElection.votesForGovernment`,
            ),
            votesForOpposition: requireFiniteNumber(
              lastElectionRecord.votesForOpposition,
              `${path}.lastElection.votesForOpposition`,
            ),
            governmentVoteShare: requireFiniteNumber(
              lastElectionRecord.governmentVoteShare,
              `${path}.lastElection.governmentVoteShare`,
            ),
            turnoutShare: requireFiniteNumber(
              lastElectionRecord.turnoutShare,
              `${path}.lastElection.turnoutShare`,
            ),
            previousGovernmentGroupKey: requireString(
              lastElectionRecord.previousGovernmentGroupKey,
              `${path}.lastElection.previousGovernmentGroupKey`,
              { minLength: 1 },
            ) as RegimeState["governmentGroupKey"],
            winnerGroupKey: requireString(
              lastElectionRecord.winnerGroupKey,
              `${path}.lastElection.winnerGroupKey`,
              { minLength: 1 },
            ) as RegimeState["governmentGroupKey"],
          },
    crisis: {
      stage: requireString(crisisRecord.stage, `${path}.crisis.stage`, {
        minLength: 1,
      }) as RegimeState["crisis"]["stage"],
      sinceDay: requireInteger(
        crisisRecord.sinceDay,
        `${path}.crisis.sinceDay`,
        0,
        CAMPAIGN_TERMINAL_DAY_INDEX,
      ),
      pressureDays: requireInteger(crisisRecord.pressureDays, `${path}.crisis.pressureDays`, 0, 100_000),
      lastRevolutionDay:
        crisisRecord.lastRevolutionDay === null
          ? null
          : requireInteger(
              crisisRecord.lastRevolutionDay,
              `${path}.crisis.lastRevolutionDay`,
              0,
              CAMPAIGN_TERMINAL_DAY_INDEX,
            ),
    },
  };
}

function decodeCountryPolitics(value: unknown, path: string) {
  const record = requireRecord(value, path);
  const lawsRecord = requireRecord(record.laws, `${path}.laws`);
  const laws = {} as Record<string, number>;
  for (const slot of LAW_SLOTS) {
    laws[slot] = requireUint32(lawsRecord[slot], `${path}.laws.${slot}`);
  }
  const lawTransitions: LawTransition[] = requireArray(
    record.lawTransitions,
    `${path}.lawTransitions`,
  ).map((raw, index) => {
    const entryPath = `${path}.lawTransitions[${String(index)}]`;
    const entry = requireRecord(raw, entryPath);
    const source = requireString(entry.source, `${entryPath}.source`, { minLength: 1 });
    if (source !== "player" && source !== "ai" && source !== "event") {
      throw new SaveFormatError(`${entryPath}.source is invalid`);
    }
    return {
      id: requireUint32(entry.id, `${entryPath}.id`),
      slot: requireString(entry.slot, `${entryPath}.slot`, {
        minLength: 1,
      }) as LawTransition["slot"],
      fromLawId: requireUint32(entry.fromLawId, `${entryPath}.fromLawId`),
      toLawId: requireUint32(entry.toLawId, `${entryPath}.toLawId`),
      proposedDay: requireInteger(
        entry.proposedDay,
        `${entryPath}.proposedDay`,
        0,
        CAMPAIGN_TERMINAL_DAY_INDEX,
      ),
      effectiveDay: requireInteger(
        entry.effectiveDay,
        `${entryPath}.effectiveDay`,
        0,
        CAMPAIGN_TERMINAL_DAY_INDEX,
      ),
      source,
      support: requireFiniteNumber(entry.support, `${entryPath}.support`),
    };
  });
  const interestGroups: InterestGroupState[] = requireArray(
    record.interestGroups,
    `${path}.interestGroups`,
  ).map((raw, index) => {
    const entryPath = `${path}.interestGroups[${String(index)}]`;
    const entry = requireRecord(raw, entryPath);
    const stanceRecord = requireRecord(entry.stanceByLaw, `${entryPath}.stanceByLaw`);
    const stanceByLaw: Record<number, number> = {};
    for (const [lawId, rawStance] of Object.entries(stanceRecord)) {
      stanceByLaw[Number(lawId)] = requireFiniteNumber(
        rawStance,
        `${entryPath}.stanceByLaw.${lawId}`,
      );
    }
    return {
      id: requireUint32(entry.id, `${entryPath}.id`),
      key: requireString(entry.key, `${entryPath}.key`, {
        minLength: 1,
      }) as InterestGroupState["key"],
      membershipPopulation: requireFiniteNumber(
        entry.membershipPopulation,
        `${entryPath}.membershipPopulation`,
      ),
      organization: requireFiniteNumber(entry.organization, `${entryPath}.organization`),
      influence: requireFiniteNumber(entry.influence, `${entryPath}.influence`),
      stanceByLaw,
    };
  });
  const institutionsRecord = requireRecord(record.institutions, `${path}.institutions`);
  const staffRecord = requireRecord(
    institutionsRecord.staffedByProfession,
    `${path}.institutions.staffedByProfession`,
  );
  const staffedByProfession: Record<number, number> = {};
  for (const [professionId, rawCount] of Object.entries(staffRecord)) {
    staffedByProfession[Number(professionId)] = requireFiniteNumber(
      rawCount,
      `${path}.institutions.staffedByProfession.${professionId}`,
    );
  }
  const institutions: InstitutionState = {
    fundedAnnualRUSD: requireFiniteNumber(
      institutionsRecord.fundedAnnualRUSD,
      `${path}.institutions.fundedAnnualRUSD`,
    ),
    staffedByProfession,
    serviceOutputIndex: requireFiniteNumber(
      institutionsRecord.serviceOutputIndex,
      `${path}.institutions.serviceOutputIndex`,
    ),
    quality: requireFiniteNumber(institutionsRecord.quality, `${path}.institutions.quality`),
    overload: requireFiniteNumber(institutionsRecord.overload, `${path}.institutions.overload`),
    disruptionUntilDay:
      institutionsRecord.disruptionUntilDay === null
        ? null
        : requireInteger(
            institutionsRecord.disruptionUntilDay,
            `${path}.institutions.disruptionUntilDay`,
            0,
            CAMPAIGN_TERMINAL_DAY_INDEX,
          ),
    lastUpdateDay:
      institutionsRecord.lastUpdateDay === null
        ? null
        : requireInteger(
            institutionsRecord.lastUpdateDay,
            `${path}.institutions.lastUpdateDay`,
            0,
            CAMPAIGN_TERMINAL_DAY_INDEX,
          ),
    fundingRequestedMonthToDateRUSD: requireFiniteNumber(
      institutionsRecord.fundingRequestedMonthToDateRUSD,
      `${path}.institutions.fundingRequestedMonthToDateRUSD`,
    ),
    fundingShortfallMonthToDateRUSD: requireFiniteNumber(
      institutionsRecord.fundingShortfallMonthToDateRUSD,
      `${path}.institutions.fundingShortfallMonthToDateRUSD`,
    ),
    healthStaffShare:
      institutionsRecord.healthStaffShare === undefined
        ? 0
        : requireFiniteNumber(
            institutionsRecord.healthStaffShare,
            `${path}.institutions.healthStaffShare`,
          ),
  };
  return {
    regime: decodeRegimeState(record.regime, `${path}.regime`),
    laws: laws as Country["laws"],
    lawTransitions,
    interestGroups,
    institutions,
  };
}

function decodeCountryTechnology(
  value: unknown,
  path: string,
): CountryTechnologyState {
  const record = requireRecord(value, path);
  const rawResearched = requireArray(record.researched, `${path}.researched`);
  const researched = rawResearched.map((raw, index) => {
    const entryPath = `${path}.researched[${String(index)}]`;
    const entry = requireRecord(raw, entryPath);
    return {
      technologyId: requireInteger(entry.technologyId, `${entryPath}.technologyId`, 0, 0xffff_ffff),
      completedDay: requireInteger(
        entry.completedDay,
        `${entryPath}.completedDay`,
        0,
        CAMPAIGN_TERMINAL_DAY_INDEX,
      ),
    };
  });
  const activeProject =
    record.activeProject === null || record.activeProject === undefined
      ? null
      : (() => {
          const projectPath = `${path}.activeProject`;
          const project = requireRecord(record.activeProject, projectPath);
          return {
            technologyId: requireInteger(
              project.technologyId,
              `${projectPath}.technologyId`,
              0,
              0xffff_ffff,
            ),
            startedDay: requireInteger(
              project.startedDay,
              `${projectPath}.startedDay`,
              0,
              CAMPAIGN_TERMINAL_DAY_INDEX,
            ),
          };
        })();
  const workRecord = requireRecord(record.workByTechnology, `${path}.workByTechnology`);
  const workByTechnology: Record<number, number> = {};
  for (const [rawId, rawWork] of Object.entries(workRecord)) {
    if (!/^(0|[1-9][0-9]*)$/.test(rawId)) {
      throw new SaveFormatError(`${path}.workByTechnology key ${JSON.stringify(rawId)} is invalid`);
    }
    workByTechnology[Number(rawId)] = requireFiniteNumber(
      rawWork,
      `${path}.workByTechnology.${rawId}`,
    );
  }
  return { researched, activeProject, workByTechnology };
}

function decodeEducationState(value: unknown, path: string): EducationState {
  const record = requireRecord(value, path);
  return {
    fundedAnnualRUSD: requireFiniteNumber(record.fundedAnnualRUSD, `${path}.fundedAnnualRUSD`),
    researchStaffShare: requireFiniteNumber(
      record.researchStaffShare,
      `${path}.researchStaffShare`,
    ),
    lastUpdateDay:
      record.lastUpdateDay === null || record.lastUpdateDay === undefined
        ? null
        : requireInteger(
            record.lastUpdateDay,
            `${path}.lastUpdateDay`,
            0,
            CAMPAIGN_TERMINAL_DAY_INDEX,
          ),
    fundingRequestedMonthToDateRUSD: requireFiniteNumber(
      record.fundingRequestedMonthToDateRUSD,
      `${path}.fundingRequestedMonthToDateRUSD`,
    ),
    fundingShortfallMonthToDateRUSD: requireFiniteNumber(
      record.fundingShortfallMonthToDateRUSD,
      `${path}.fundingShortfallMonthToDateRUSD`,
    ),
  };
}

function decodeLaborPolicyState(value: unknown, path: string): LaborPolicyState {
  const record = requireRecord(value, path);
  return {
    trainingBudgetRUSDPerYear: requireFiniteNumber(
      record.trainingBudgetRUSDPerYear,
      `${path}.trainingBudgetRUSDPerYear`,
    ),
    trainingStipendPerTraineeRUSDPerYear: requireFiniteNumber(
      record.trainingStipendPerTraineeRUSDPerYear,
      `${path}.trainingStipendPerTraineeRUSDPerYear`,
    ),
    trainingStaffShare: requireFiniteNumber(
      record.trainingStaffShare,
      `${path}.trainingStaffShare`,
    ),
    trainingParticipation: requireFiniteNumber(
      record.trainingParticipation,
      `${path}.trainingParticipation`,
    ),
    lastUpdateDay:
      record.lastUpdateDay === null || record.lastUpdateDay === undefined
        ? null
        : requireInteger(
            record.lastUpdateDay,
            `${path}.lastUpdateDay`,
            0,
            CAMPAIGN_TERMINAL_DAY_INDEX,
          ),
    trainingRequestedMonthToDateRUSD: requireFiniteNumber(
      record.trainingRequestedMonthToDateRUSD,
      `${path}.trainingRequestedMonthToDateRUSD`,
    ),
    trainingShortfallMonthToDateRUSD: requireFiniteNumber(
      record.trainingShortfallMonthToDateRUSD,
      `${path}.trainingShortfallMonthToDateRUSD`,
    ),
  };
}

function decodeTradePolicyState(value: unknown, path: string): TradePolicyState {
  const record = requireRecord(value, path);
  const tariffRates = requireArray(record.tariffRates, `${path}.tariffRates`).map(
    (entry, index) => requireFiniteNumber(entry, `${path}.tariffRates[${String(index)}]`),
  );
  const importQuotaQuantity = requireArray(
    record.importQuotaQuantity,
    `${path}.importQuotaQuantity`,
  ).map((entry, index) => {
    if (entry === null || entry === undefined) return null;
    return requireFiniteNumber(entry, `${path}.importQuotaQuantity[${String(index)}]`);
  });
  const importQuotaUsedQuantity = requireArray(
    record.importQuotaUsedQuantity,
    `${path}.importQuotaUsedQuantity`,
  ).map((entry, index) =>
    requireFiniteNumber(entry, `${path}.importQuotaUsedQuantity[${String(index)}]`),
  );
  const exportRestricted = requireArray(record.exportRestricted, `${path}.exportRestricted`).map(
    (entry, index) => {
      if (typeof entry !== "boolean") {
        throw new SaveFormatError(`${path}.exportRestricted[${String(index)}] must be a boolean`);
      }
      return entry;
    },
  );
  const lastUpdateDay =
    record.lastUpdateDay === null || record.lastUpdateDay === undefined
      ? null
      : requireInteger(
          record.lastUpdateDay,
          `${path}.lastUpdateDay`,
          0,
          CAMPAIGN_TERMINAL_DAY_INDEX,
        );
  return {
    tariffRates,
    importQuotaQuantity,
    importQuotaUsedQuantity,
    exportRestricted,
    lastUpdateDay,
    exportsValueMonthToDateRUSD: requireFiniteNumber(
      record.exportsValueMonthToDateRUSD,
      `${path}.exportsValueMonthToDateRUSD`,
    ),
    importsValueMonthToDateRUSD: requireFiniteNumber(
      record.importsValueMonthToDateRUSD,
      `${path}.importsValueMonthToDateRUSD`,
    ),
    dutyReceivedMonthToDateRUSD: requireFiniteNumber(
      record.dutyReceivedMonthToDateRUSD,
      `${path}.dutyReceivedMonthToDateRUSD`,
    ),
    dutyPaidMonthToDateRUSD: requireFiniteNumber(
      record.dutyPaidMonthToDateRUSD,
      `${path}.dutyPaidMonthToDateRUSD`,
    ),
    freightPaidMonthToDateRUSD: requireFiniteNumber(
      record.freightPaidMonthToDateRUSD,
      `${path}.freightPaidMonthToDateRUSD`,
    ),
  };
}

function decodeTradeState(value: unknown, path: string): TradeState {
  const record = requireRecord(value, path);
  if (typeof record.enabled !== "boolean") {
    throw new SaveFormatError(`${path}.enabled must be a boolean`);
  }
  const routes = requireArray(record.routes, `${path}.routes`).map((entry, index) => {
    const routePath = `${path}.routes[${String(index)}]`;
    const route = requireRecord(entry, routePath);
    return {
      id: requireInteger(route.id, `${routePath}.id`, 0, Number.MAX_SAFE_INTEGER),
      marketAId: requireUint32(route.marketAId, `${routePath}.marketAId`),
      marketBId: requireUint32(route.marketBId, `${routePath}.marketBId`),
      distanceUnits: requireFiniteNumber(route.distanceUnits, `${routePath}.distanceUnits`),
      baseCapacityRUSDPerDay: requireFiniteNumber(
        route.baseCapacityRUSDPerDay,
        `${routePath}.baseCapacityRUSDPerDay`,
      ),
    };
  });
  const shipments = requireArray(record.shipments, `${path}.shipments`).map((entry, index) => {
    const shipmentPath = `${path}.shipments[${String(index)}]`;
    const shipment = requireRecord(entry, shipmentPath);
    const optionalCountry = (raw: unknown, fieldPath: string): number | null =>
      raw === null || raw === undefined ? null : requireUint32(raw, fieldPath);
    return {
      id: requireInteger(shipment.id, `${shipmentPath}.id`, 1, Number.MAX_SAFE_INTEGER),
      goodId: requireUint32(shipment.goodId, `${shipmentPath}.goodId`),
      quantity: requireFiniteNumber(shipment.quantity, `${shipmentPath}.quantity`),
      sellerBuildingId: requireUint32(
        shipment.sellerBuildingId,
        `${shipmentPath}.sellerBuildingId`,
      ),
      originMarketId: requireUint32(shipment.originMarketId, `${shipmentPath}.originMarketId`),
      destinationMarketId: requireUint32(
        shipment.destinationMarketId,
        `${shipmentPath}.destinationMarketId`,
      ),
      originCountryId: optionalCountry(
        shipment.originCountryId,
        `${shipmentPath}.originCountryId`,
      ),
      destinationCountryId: optionalCountry(
        shipment.destinationCountryId,
        `${shipmentPath}.destinationCountryId`,
      ),
      dispatchDay: requireInteger(
        shipment.dispatchDay,
        `${shipmentPath}.dispatchDay`,
        0,
        CAMPAIGN_TERMINAL_DAY_INDEX,
      ),
      arrivalDay: requireInteger(
        shipment.arrivalDay,
        `${shipmentPath}.arrivalDay`,
        0,
        CAMPAIGN_TERMINAL_DAY_INDEX,
      ),
      cargoValueRUSD: requireFiniteNumber(
        shipment.cargoValueRUSD,
        `${shipmentPath}.cargoValueRUSD`,
      ),
      freightCostRUSD: requireFiniteNumber(
        shipment.freightCostRUSD,
        `${shipmentPath}.freightCostRUSD`,
      ),
      dutyRUSD: requireFiniteNumber(shipment.dutyRUSD, `${shipmentPath}.dutyRUSD`),
      dutyRate: requireFiniteNumber(shipment.dutyRate, `${shipmentPath}.dutyRate`),
    };
  });
  let lastDay: TradeState["lastDay"] = null;
  if (record.lastDay !== null && record.lastDay !== undefined) {
    const reportPath = `${path}.lastDay`;
    const report = requireRecord(record.lastDay, reportPath);
    const blocked = requireArray(report.blocked, `${reportPath}.blocked`).map(
      (entry, index) => {
        const blockPath = `${reportPath}.blocked[${String(index)}]`;
        const block = requireRecord(entry, blockPath);
        const reason = requireString(block.reason, `${blockPath}.reason`);
        if (!(TRADE_BLOCK_REASONS as readonly string[]).includes(reason)) {
          throw new SaveFormatError(`${blockPath}.reason is not a registered trade block reason`);
        }
        return {
          originMarketId: requireUint32(block.originMarketId, `${blockPath}.originMarketId`),
          destinationMarketId: requireUint32(
            block.destinationMarketId,
            `${blockPath}.destinationMarketId`,
          ),
          goodId: requireUint32(block.goodId, `${blockPath}.goodId`),
          reason: reason as TradeBlockReason,
        };
      },
    );
    lastDay = {
      dayIndex: requireInteger(
        report.dayIndex,
        `${reportPath}.dayIndex`,
        0,
        CAMPAIGN_TERMINAL_DAY_INDEX,
      ),
      dispatchedShipments: requireInteger(
        report.dispatchedShipments,
        `${reportPath}.dispatchedShipments`,
        0,
        Number.MAX_SAFE_INTEGER,
      ),
      freightPaidRUSD: requireFiniteNumber(
        report.freightPaidRUSD,
        `${reportPath}.freightPaidRUSD`,
      ),
      dutyPaidRUSD: requireFiniteNumber(report.dutyPaidRUSD, `${reportPath}.dutyPaidRUSD`),
      ownerFundedRUSD: requireFiniteNumber(
        report.ownerFundedRUSD,
        `${reportPath}.ownerFundedRUSD`,
      ),
      arrivedShipments: requireInteger(
        report.arrivedShipments,
        `${reportPath}.arrivedShipments`,
        0,
        Number.MAX_SAFE_INTEGER,
      ),
      blocked,
    };
  }
  return {
    enabled: record.enabled,
    routes,
    shipments,
    nextShipmentId: requireInteger(
      record.nextShipmentId,
      `${path}.nextShipmentId`,
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    lastDispatchDay:
      record.lastDispatchDay === null || record.lastDispatchDay === undefined
        ? null
        : requireInteger(
            record.lastDispatchDay,
            `${path}.lastDispatchDay`,
            0,
            CAMPAIGN_TERMINAL_DAY_INDEX,
          ),
    lastDay,
  };
}

function decodePriceIndexState(value: unknown, path: string): PriceIndexState {
  const record = requireRecord(value, path);
  const basket = requireArray(record.basket, `${path}.basket`).map((entry, index) => {
    const itemPath = `${path}.basket[${String(index)}]`;
    const item = requireRecord(entry, itemPath);
    return {
      goodId: requireUint32(item.goodId, `${itemPath}.goodId`),
      weight: requireFiniteNumber(item.weight, `${itemPath}.weight`),
    };
  });
  const basePrices = requireArray(record.basePrices, `${path}.basePrices`).map(
    (entry, index) => {
      const basePath = `${path}.basePrices[${String(index)}]`;
      const base = requireRecord(entry, basePath);
      return {
        marketId: requireUint32(base.marketId, `${basePath}.marketId`),
        prices: requireArray(base.prices, `${basePath}.prices`).map((price, priceIndex) =>
          requireFiniteNumber(price, `${basePath}.prices[${String(priceIndex)}]`),
        ),
      };
    },
  );
  const observations = requireArray(record.observations, `${path}.observations`).map(
    (entry, index) => {
      const observationPath = `${path}.observations[${String(index)}]`;
      const observation = requireRecord(entry, observationPath);
      return {
        year: requireInteger(
          observation.year,
          `${observationPath}.year`,
          CAMPAIGN_START_YEAR,
          CAMPAIGN_END_YEAR,
        ),
        month: requireInteger(observation.month, `${observationPath}.month`, 1, 12),
        dayIndex: requireInteger(
          observation.dayIndex,
          `${observationPath}.dayIndex`,
          0,
          CAMPAIGN_TERMINAL_DAY_INDEX,
        ),
        world: requireFiniteNumber(observation.world, `${observationPath}.world`),
        countries: requireArray(
          observation.countries,
          `${observationPath}.countries`,
        ).map((value, countryIndex) => {
          const valuePath = `${observationPath}.countries[${String(countryIndex)}]`;
          const country = requireRecord(value, valuePath);
          return {
            countryId: requireUint32(country.countryId, `${valuePath}.countryId`),
            value: requireFiniteNumber(country.value, `${valuePath}.value`),
          };
        }),
      };
    },
  );
  return {
    basket,
    basePrices,
    observations,
    lastObservationDay:
      record.lastObservationDay === null || record.lastObservationDay === undefined
        ? null
        : requireInteger(
            record.lastObservationDay,
            `${path}.lastObservationDay`,
            0,
            CAMPAIGN_TERMINAL_DAY_INDEX,
          ),
  };
}

function decodeMonetaryCurrencyState(
  value: unknown,
  path: string,
): MonetaryCurrencyState {
  const record = requireRecord(value, path);
  const optionalDay = (field: string): number | null =>
    record[field] === null || record[field] === undefined
      ? null
      : requireInteger(record[field], `${path}.${field}`, 0, CAMPAIGN_TERMINAL_DAY_INDEX);
  const optionalAccount = (field: string): number | null =>
    record[field] === null || record[field] === undefined
      ? null
      : requireUint32(record[field], `${path}.${field}`);
  const optionalRate = (field: string): RusdPerCurrencyUnit | null => {
    if (record[field] === null || record[field] === undefined) return null;
    try {
      return asRusdPerCurrencyUnit(requireFiniteNumber(record[field], `${path}.${field}`));
    } catch (error) {
      throw new SaveFormatError(`${path}.${field} is invalid: ${errorMessage(error)}`);
    }
  };
  const regime = requireString(record.regime, `${path}.regime`);
  if (regime !== "pegged" && regime !== "managed") {
    throw new SaveFormatError(`${path}.regime is invalid`);
  }
  if (typeof record.active !== "boolean") {
    throw new SaveFormatError(`${path}.active must be a boolean`);
  }
  return {
    currencyId: requireUint32(record.currencyId, `${path}.currencyId`),
    issuerCountryId: optionalAccount("issuerCountryId"),
    regime,
    parityRusdPerUnit: optionalRate("parityRusdPerUnit"),
    referenceParityRusdPerUnit: optionalRate("referenceParityRusdPerUnit"),
    currencyIssuedUnits: requireFiniteNumber(
      record.currencyIssuedUnits,
      `${path}.currencyIssuedUnits`,
    ),
    active: record.active,
    reserveAccountId: optionalAccount("reserveAccountId"),
    liabilityAccountId: optionalAccount("liabilityAccountId"),
    equityAccountId: optionalAccount("equityAccountId"),
    externalCashAccountId: optionalAccount("externalCashAccountId"),
    externalCurrencyAccountId: optionalAccount("externalCurrencyAccountId"),
    externalEquityAccountId: optionalAccount("externalEquityAccountId"),
    lastParityChangeDay: optionalDay("lastParityChangeDay"),
    lastManagedUpdateDay: optionalDay("lastManagedUpdateDay"),
    lastMonthEndDay: optionalDay("lastMonthEndDay"),
    lastMonthExportsRUSD: requireFiniteNumber(
      record.lastMonthExportsRUSD,
      `${path}.lastMonthExportsRUSD`,
    ),
    lastMonthImportsRUSD: requireFiniteNumber(
      record.lastMonthImportsRUSD,
      `${path}.lastMonthImportsRUSD`,
    ),
    standard: decodeMonetaryStandard(record.standard, `${path}.standard`),
    fineGramsPerUnit: requireFiniteNumber(record.fineGramsPerUnit, `${path}.fineGramsPerUnit`),
    metalReserveKg: requireFiniteNumber(record.metalReserveKg, `${path}.metalReserveKg`),
    metalReserveAccountId: optionalAccount("metalReserveAccountId"),
    convertible: decodeBoolean(record.convertible, `${path}.convertible`),
    lastMintSaleKg: requireFiniteNumber(record.lastMintSaleKg, `${path}.lastMintSaleKg`),
  };
}

function decodeMonetaryStandard(value: unknown, path: string): MonetaryStandard {
  const standard = requireString(value, path);
  if (!(MONETARY_STANDARDS as readonly string[]).includes(standard)) {
    throw new SaveFormatError(`${path} is invalid`);
  }
  return standard as MonetaryStandard;
}

function decodeBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") throw new SaveFormatError(`${path} must be a boolean`);
  return value;
}

function decodeMonetaryState(value: unknown, path: string): MonetaryState {
  const record = requireRecord(value, path);
  if (typeof record.enabled !== "boolean") {
    throw new SaveFormatError(`${path}.enabled must be a boolean`);
  }
  return {
    enabled: record.enabled,
    currencies: requireArray(record.currencies, `${path}.currencies`).map((entry, index) =>
      decodeMonetaryCurrencyState(entry, `${path}.currencies[${String(index)}]`),
    ),
    lastUpdateDay:
      record.lastUpdateDay === null || record.lastUpdateDay === undefined
        ? null
        : requireInteger(
            record.lastUpdateDay,
            `${path}.lastUpdateDay`,
            0,
            CAMPAIGN_TERMINAL_DAY_INDEX,
          ),
  };
}

function decodeArmy(value: unknown, path: string): Army {
  const record = requireRecord(value, path);
  const optionalDay = (field: string): number | null =>
    record[field] === null || record[field] === undefined
      ? null
      : requireInteger(record[field], `${path}.${field}`, 0, CAMPAIGN_TERMINAL_DAY_INDEX);
  const integerField = (field: string): number =>
    requireInteger(record[field], `${path}.${field}`, 0, 0xffff_ffff);
  return {
    id: requireUint32(record.id, `${path}.id`),
    countryId: requireUint32(record.countryId, `${path}.countryId`),
    provinceId: requireUint32(record.provinceId, `${path}.provinceId`),
    homeProvinceId: requireUint32(record.homeProvinceId, `${path}.homeProvinceId`),
    personnel: integerField("personnel"),
    equipmentUnits: integerField("equipmentUnits"),
    organization: requireFiniteNumber(record.organization, `${path}.organization`),
    supply: requireFiniteNumber(record.supply, `${path}.supply`),
    wounded: integerField("wounded"),
    woundedReturnDay: optionalDay("woundedReturnDay"),
    deaths: integerField("deaths"),
    captured: integerField("captured"),
    readyDay: requireInteger(record.readyDay, `${path}.readyDay`, 0, CAMPAIGN_TERMINAL_DAY_INDEX),
    destinationProvinceId:
      record.destinationProvinceId === null || record.destinationProvinceId === undefined
        ? null
        : requireUint32(record.destinationProvinceId, `${path}.destinationProvinceId`),
    arrivalDay: optionalDay("arrivalDay"),
    lastBattleDay: optionalDay("lastBattleDay"),
  };
}

function decodeWar(value: unknown, path: string): WarState {
  const record = requireRecord(value, path);
  const casusBelli = requireString(record.casusBelli, `${path}.casusBelli`);
  if (!(CASUS_BELLI as readonly string[]).includes(casusBelli)) {
    throw new SaveFormatError(`${path}.casusBelli is invalid`);
  }
  const optionalDay = (field: string): number | null =>
    record[field] === null || record[field] === undefined
      ? null
      : requireInteger(record[field], `${path}.${field}`, 0, CAMPAIGN_TERMINAL_DAY_INDEX);
  return {
    id: requireUint32(record.id, `${path}.id`),
    attackerCountryId: requireUint32(record.attackerCountryId, `${path}.attackerCountryId`),
    defenderCountryId: requireUint32(record.defenderCountryId, `${path}.defenderCountryId`),
    casusBelli: casusBelli as CasusBelli,
    startedDay: requireInteger(record.startedDay, `${path}.startedDay`, 0, CAMPAIGN_TERMINAL_DAY_INDEX),
    endedDay: optionalDay("endedDay"),
    truceUntilDay: optionalDay("truceUntilDay"),
  };
}

function decodeMilitaryState(value: unknown, path: string): MilitaryState {
  const record = requireRecord(value, path);
  if (typeof record.enabled !== "boolean") {
    throw new SaveFormatError(`${path}.enabled must be a boolean`);
  }
  const arrays = ["armies", "wars", "relations", "peaceOffers", "casualties"] as const;
  for (const field of arrays) {
    if (!Array.isArray(record[field])) {
      throw new SaveFormatError(`${path}.${field} must be an array`);
    }
  }
  return {
    enabled: record.enabled,
    armies: requireArray(record.armies, `${path}.armies`).map((entry, index) =>
      decodeArmy(entry, `${path}.armies[${String(index)}]`),
    ),
    wars: requireArray(record.wars, `${path}.wars`).map((entry, index) =>
      decodeWar(entry, `${path}.wars[${String(index)}]`),
    ),
    relations: requireArray(record.relations, `${path}.relations`).map((entry, index) => {
      const relationPath = `${path}.relations[${String(index)}]`;
      const relation = requireRecord(entry, relationPath);
      return {
        countryA: requireUint32(relation.countryA, `${relationPath}.countryA`),
        countryB: requireUint32(relation.countryB, `${relationPath}.countryB`),
        score: requireFiniteNumber(relation.score, `${relationPath}.score`),
        truceUntilDay:
          relation.truceUntilDay === null || relation.truceUntilDay === undefined
            ? null
            : requireInteger(
                relation.truceUntilDay,
                `${relationPath}.truceUntilDay`,
                0,
                CAMPAIGN_TERMINAL_DAY_INDEX,
              ),
      };
    }),
    peaceOffers: requireArray(record.peaceOffers, `${path}.peaceOffers`).map((entry, index) => {
      const offerPath = `${path}.peaceOffers[${String(index)}]`;
      const offer = requireRecord(entry, offerPath);
      const terms = requireString(offer.terms, `${offerPath}.terms`);
      if (!(PEACE_TERMS as readonly string[]).includes(terms)) {
        throw new SaveFormatError(`${offerPath}.terms is invalid`);
      }
      return {
        id: requireUint32(offer.id, `${offerPath}.id`),
        warId: requireUint32(offer.warId, `${offerPath}.warId`),
        fromCountryId: requireUint32(offer.fromCountryId, `${offerPath}.fromCountryId`),
        toCountryId: requireUint32(offer.toCountryId, `${offerPath}.toCountryId`),
        terms: terms as PeaceTermKind,
        proposedDay: requireInteger(
          offer.proposedDay,
          `${offerPath}.proposedDay`,
          0,
          CAMPAIGN_TERMINAL_DAY_INDEX,
        ),
      };
    }),
    casualties: requireArray(record.casualties, `${path}.casualties`).map((entry, index) => {
      const casualtyPath = `${path}.casualties[${String(index)}]`;
      const casualty = requireRecord(entry, casualtyPath);
      return {
        countryId: requireUint32(casualty.countryId, `${casualtyPath}.countryId`),
        deaths: requireInteger(casualty.deaths, `${casualtyPath}.deaths`, 0, 0xffff_ffff),
        woundedReturned: requireInteger(
          casualty.woundedReturned,
          `${casualtyPath}.woundedReturned`,
          0,
          0xffff_ffff,
        ),
        captured: requireInteger(casualty.captured, `${casualtyPath}.captured`, 0, 0xffff_ffff),
      };
    }),
    nextArmyId: requireInteger(record.nextArmyId, `${path}.nextArmyId`, 1, 0xffff_ffff),
    nextWarId: requireInteger(record.nextWarId, `${path}.nextWarId`, 1, 0xffff_ffff),
    nextOfferId: requireInteger(record.nextOfferId, `${path}.nextOfferId`, 1, 0xffff_ffff),
    lastPhaseDay:
      record.lastPhaseDay === null || record.lastPhaseDay === undefined
        ? null
        : requireInteger(
            record.lastPhaseDay,
            `${path}.lastPhaseDay`,
            0,
            CAMPAIGN_TERMINAL_DAY_INDEX,
          ),
  };
}

function decodeCountry(value: unknown, path: string): Country {
  const record = requireRecord(value, path);
  if (typeof record.immigrationOpen !== "boolean") {
    throw new SaveFormatError(`${path}.immigrationOpen must be a boolean`);
  }
  return {
    id: requireUint32(record.id, `${path}.id`),
    tag: requireString(record.tag, `${path}.tag`, { minLength: 1 }),
    name: requireString(record.name, `${path}.name`, { minLength: 1 }),
    monetary: decodeMonetaryArrangement(record.monetary, `${path}.monetary`),
    treasuryAccountId: requireUint32(record.treasuryAccountId, `${path}.treasuryAccountId`),
    fiscal: decodeFiscalPolicy(record.fiscal, `${path}.fiscal`),
    industrial: decodeIndustrialPolicy(record.industrial, `${path}.industrial`),
    debt: decodeDebtPolicy(record.debt, `${path}.debt`),
    ai: decodeCountryAIState(record.ai, `${path}.ai`),
    immigrationOpen: record.immigrationOpen,
    ...decodeCountryPolitics(record.politics, `${path}.politics`),
    technology: decodeCountryTechnology(record.technology, `${path}.technology`),
    education: decodeEducationState(record.education, `${path}.education`),
    labor: decodeLaborPolicyState(record.labor, `${path}.labor`),
    trade: decodeTradePolicyState(record.trade, `${path}.trade`),
  };
}

function decodeCurrency(value: unknown, path: string): Currency {
  const record = requireRecord(value, path);
  return {
    id: requireUint32(record.id, `${path}.id`),
    key: requireString(record.key, `${path}.key`, { minLength: 1 }),
    name: requireString(record.name, `${path}.name`, { minLength: 1 }),
    issuer: decodeCurrencyIssuer(record.issuer, `${path}.issuer`),
  };
}

function decodeCurrencyValuation(value: unknown, path: string): CurrencyValuation {
  const record = requireRecord(value, path);
  const currencyId = requireUint32(record.currencyId, `${path}.currencyId`);
  const status = record.status;
  if (status === "unavailable") {
    return { currencyId, status: "unavailable" };
  }
  if (status !== "specified") {
    throw new SaveFormatError(`${path}.status is invalid`);
  }
  const rawRate = requireFiniteNumber(record.rusdPerUnit, `${path}.rusdPerUnit`);
  let rate: RusdPerCurrencyUnit;
  try {
    rate = asRusdPerCurrencyUnit(rawRate);
  } catch (error) {
    throw new SaveFormatError(`${path}.rusdPerUnit is invalid: ${errorMessage(error)}`);
  }
  const source = requireString(record.source, `${path}.source`, { minLength: 1 });
  if (source !== "scenario" && source !== "policy" && source !== "market") {
    throw new SaveFormatError(`${path}.source is not a supported valuation source`);
  }
  return {
    currencyId,
    status: "specified",
    rusdPerUnit: rate,
    setOnDay: requireInteger(
      record.setOnDay,
      `${path}.setOnDay`,
      0,
      CAMPAIGN_TERMINAL_DAY_INDEX,
    ),
    source: source as "scenario" | "policy" | "market",
  };
}

function decodeFinancialAccount(value: unknown, path: string): FinancialAccount {
  const record = requireRecord(value, path);
  const ownerKind = record.ownerKind;
  if (
    ownerKind !== "popBlock" &&
    ownerKind !== "building" &&
    ownerKind !== "country" &&
    ownerKind !== "system"
  ) {
    throw new SaveFormatError(`${path}.ownerKind is invalid`);
  }
  const category = requireString(record.category, `${path}.category`, { minLength: 1 });
  if (!(ACCOUNT_CATEGORIES as readonly string[]).includes(category)) {
    throw new SaveFormatError(`${path}.category is invalid`);
  }
  const subtype = requireString(record.subtype, `${path}.subtype`, { minLength: 1 });
  if (!(ACCOUNT_SUBTYPES as readonly string[]).includes(subtype)) {
    throw new SaveFormatError(`${path}.subtype is invalid`);
  }
  const ownerId =
    record.ownerId === null ? null : requireUint32(record.ownerId, `${path}.ownerId`);
  if (ownerKind === "system") {
    if (ownerId !== null) {
      throw new SaveFormatError(`${path} system accounts must have ownerId null`);
    }
  } else if (ownerId === null) {
    throw new SaveFormatError(`${path}.ownerId is required for ${ownerKind} accounts`);
  }
  return {
    id: requireUint32(record.id, `${path}.id`),
    ownerKind,
    ownerId,
    category: category as AccountCategory,
    subtype: subtype as AccountSubtype,
    balanceRUSD: requireFiniteNumber(record.balanceRUSD, `${path}.balanceRUSD`),
  };
}

function decodeJournalLine(value: unknown, path: string): JournalLine {
  const record = requireRecord(value, path);
  if (record.side !== "debit" && record.side !== "credit") {
    throw new SaveFormatError(`${path}.side must be debit or credit`);
  }
  return {
    accountId: requireUint32(record.accountId, `${path}.accountId`),
    side: record.side,
    amountRUSD: requireFiniteNumber(record.amountRUSD, `${path}.amountRUSD`),
  };
}

function decodeJournalPosting(value: unknown, path: string): JournalPosting {
  const record = requireRecord(value, path);
  if (!(TRANSACTION_KINDS as readonly string[]).includes(record.transactionKind as string)) {
    throw new SaveFormatError(`${path}.transactionKind is invalid`);
  }
  const rawLines = requireArray(record.lines, `${path}.lines`);
  const lines = rawLines.map((line, index) =>
    decodeJournalLine(line, `${path}.lines[${String(index)}]`),
  );
  return {
    id: requireUint32(record.id, `${path}.id`),
    dayIndex: requireInteger(record.dayIndex, `${path}.dayIndex`, 0, CAMPAIGN_TERMINAL_DAY_INDEX),
    transactionKind: record.transactionKind as TransactionKind,
    lines,
    sourceEntityId:
      record.sourceEntityId === null
        ? null
        : requireUint32(record.sourceEntityId, `${path}.sourceEntityId`),
    targetEntityId:
      record.targetEntityId === null
        ? null
        : requireUint32(record.targetEntityId, `${path}.targetEntityId`),
  };
}

function decodeOpeningBalance(value: unknown): OpeningBalanceRecord | null {
  if (value === null) return null;
  const record = requireRecord(value, "save payload.finance.opening");
  return {
    dayIndex: requireInteger(
      record.dayIndex,
      "save payload.finance.opening.dayIndex",
      0,
      CAMPAIGN_TERMINAL_DAY_INDEX,
    ),
    accountCount: requireInteger(
      record.accountCount,
      "save payload.finance.opening.accountCount",
      0,
      Number.MAX_SAFE_INTEGER,
    ),
    checksum: requireString(record.checksum, "save payload.finance.opening.checksum", {
      minLength: 1,
    }),
  };
}

function decodeAnnualSummary(value: unknown, path: string): AnnualFinanceSummary {
  const record = requireRecord(value, path);
  const fiscalTotals = decodeCountryFiscalTotals(
    record.fiscalTotals,
    `${path}.fiscalTotals`,
  );
  const budgetTotals = decodeBudgetTotals(record.budgetTotals, `${path}.budgetTotals`);
  const rawFlows = requireRecord(record.flowTotalsByKind, `${path}.flowTotalsByKind`);
  const flowTotalsByKind = {} as Record<FlowTransactionKind, number>;
  for (const kind of FLOW_TRANSACTION_KINDS) {
    flowTotalsByKind[kind] = requireFiniteNumber(
      rawFlows[kind],
      `${path}.flowTotalsByKind.${kind}`,
    );
  }
  const rawBalances = requireRecord(record.closingBalances, `${path}.closingBalances`);
  const closingBalances: AnnualFinanceSummary["closingBalances"] = {};
  for (const key of Object.keys(rawBalances)) {
    if (!/^(0|[1-9][0-9]*)$/.test(key)) {
      throw new SaveFormatError(`${path}.closingBalances key ${JSON.stringify(key)} is not canonical`);
    }
    const countryId = Number(key);
    if (!Number.isSafeInteger(countryId) || countryId < 0 || countryId > 0xffff_ffff) {
      throw new SaveFormatError(`${path}.closingBalances key ${JSON.stringify(key)} is out of range`);
    }
    const entry = requireRecord(rawBalances[key], `${path}.closingBalances[${key}]`);
    closingBalances[countryId] = {
      treasuryCashRUSD: requireFiniteNumber(
        entry.treasuryCashRUSD,
        `${path}.closingBalances[${key}].treasuryCashRUSD`,
      ),
      debtLiabilityRUSD: requireFiniteNumber(
        entry.debtLiabilityRUSD,
        `${path}.closingBalances[${key}].debtLiabilityRUSD`,
      ),
      interestPayableRUSD: requireFiniteNumber(
        entry.interestPayableRUSD,
        `${path}.closingBalances[${key}].interestPayableRUSD`,
      ),
    };
  }
  if (typeof record.complete !== "boolean") {
    throw new SaveFormatError(`${path}.complete must be a boolean`);
  }
  return {
    year: requireInteger(record.year, `${path}.year`, 1900, 1999),
    periodStartDay: requireInteger(
      record.periodStartDay,
      `${path}.periodStartDay`,
      0,
      CAMPAIGN_TERMINAL_DAY_INDEX,
    ),
    periodEndDay: requireInteger(
      record.periodEndDay,
      `${path}.periodEndDay`,
      0,
      CAMPAIGN_TERMINAL_DAY_INDEX,
    ),
    complete: record.complete,
    fiscalTotals,
    budgetTotals,
    flowTotalsByKind,
    closingBalances,
    correctionCount: requireInteger(
      record.correctionCount,
      `${path}.correctionCount`,
      0,
      1_000_000,
    ),
  };
}

function decodeFinanceCorrection(value: unknown, path: string): FinanceCorrection {
  const record = requireRecord(value, path);
  const rawLines = requireArray(record.lines, `${path}.lines`);
  return {
    id: requireInteger(record.id, `${path}.id`, 1, Number.MAX_SAFE_INTEGER),
    dayIndex: requireInteger(record.dayIndex, `${path}.dayIndex`, 0, CAMPAIGN_TERMINAL_DAY_INDEX),
    postingId: requireInteger(record.postingId, `${path}.postingId`, 1, Number.MAX_SAFE_INTEGER),
    originalPostingId: requireInteger(
      record.originalPostingId,
      `${path}.originalPostingId`,
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    reason: requireString(record.reason, `${path}.reason`, { minLength: 1, maxLength: 500 }),
    lines: rawLines.map((line, index) =>
      decodeJournalLine(line, `${path}.lines[${String(index)}]`),
    ),
  };
}

function decodePeriodSummary(value: unknown, path: string): FinancePeriodSummary {
  const record = requireRecord(value, path);
  const rawTotals = requireRecord(record.accountTotals, `${path}.accountTotals`);
  const accountTotals: Record<number, number> = {};
  for (const key of Object.keys(rawTotals)) {
    if (!/^(0|[1-9][0-9]*)$/.test(key)) {
      throw new SaveFormatError(
        `${path}.accountTotals key ${JSON.stringify(key)} is not a canonical decimal account id`,
      );
    }
    const accountId = Number(key);
    if (!Number.isSafeInteger(accountId) || accountId > 0xffff_ffff) {
      throw new SaveFormatError(`${path}.accountTotals key ${JSON.stringify(key)} is out of range`);
    }
    accountTotals[accountId] = requireFiniteNumber(
      rawTotals[key],
      `${path}.accountTotals[${key}]`,
    );
  }
  const rawFlows = requireRecord(record.flowTotalsByKind, `${path}.flowTotalsByKind`);
  const flowTotalsByKind = {} as Record<FlowTransactionKind, number>;
  for (const kind of FLOW_TRANSACTION_KINDS) {
    flowTotalsByKind[kind] = requireFiniteNumber(rawFlows[kind], `${path}.flowTotalsByKind.${kind}`);
  }
  let countryFiscalTotals: FinancePeriodSummary["countryFiscalTotals"];
  if (record.countryFiscalTotals !== undefined) {
    countryFiscalTotals = decodeCountryFiscalTotals(
      record.countryFiscalTotals,
      `${path}.countryFiscalTotals`,
    );
  }
  const countryBudgetTotals = decodeBudgetTotals(
    record.countryBudgetTotals,
    `${path}.countryBudgetTotals`,
  );
  let closingValuations: FinancePeriodSummary["closingValuations"];
  if (record.closingValuations !== undefined) {
    try {
      assertValidClosingValuations(record.closingValuations, `${path}.closingValuations`);
    } catch (error) {
      throw new SaveFormatError(errorMessage(error));
    }
    closingValuations = (record.closingValuations as { currencyId: number; rusdPerUnit: number }[]).map(
      (entry) => ({ currencyId: entry.currencyId, rusdPerUnit: asRusdPerCurrencyUnit(entry.rusdPerUnit) }),
    );
  }
  let countryClosingBalances: FinancePeriodSummary["countryClosingBalances"];
  if (record.countryClosingBalances !== undefined) {
    try {
      assertValidCountryClosingBalances(record.countryClosingBalances, `${path}.countryClosingBalances`);
    } catch (error) {
      throw new SaveFormatError(errorMessage(error));
    }
    countryClosingBalances = (
      record.countryClosingBalances as {
        countryId: number;
        treasuryCashRUSD: number;
        debtOutstandingRUSD: number;
        householdCashRUSD: number;
      }[]
    ).map((entry) => ({
      countryId: entry.countryId,
      treasuryCashRUSD: entry.treasuryCashRUSD,
      debtOutstandingRUSD: entry.debtOutstandingRUSD,
      householdCashRUSD: entry.householdCashRUSD,
    }));
  }
  return {
    periodStartDay: requireInteger(
      record.periodStartDay,
      `${path}.periodStartDay`,
      0,
      CAMPAIGN_TERMINAL_DAY_INDEX,
    ),
    periodEndDay: requireInteger(
      record.periodEndDay,
      `${path}.periodEndDay`,
      0,
      CAMPAIGN_TERMINAL_DAY_INDEX,
    ),
    accountTotals,
    flowTotalsByKind,
    ...(countryFiscalTotals === undefined ? {} : { countryFiscalTotals }),
    countryBudgetTotals,
    ...(closingValuations === undefined ? {} : { closingValuations }),
    ...(countryClosingBalances === undefined ? {} : { countryClosingBalances }),
  };
}

function decodeDebtHistoryAggregate(
  value: unknown,
  path: string,
): SerializedDebtHistoryAggregate {
  const record = requireRecord(value, path);
  return {
    issuerCountryId: requireUint32(record.issuerCountryId, `${path}.issuerCountryId`),
    contractsRetired: requireInteger(record.contractsRetired, `${path}.contractsRetired`, 0, 1_000_000),
    contractsDefaulted: requireInteger(
      record.contractsDefaulted,
      `${path}.contractsDefaulted`,
      0,
      1_000_000,
    ),
    principalIssuedRUSD: requireFiniteNumber(
      record.principalIssuedRUSD,
      `${path}.principalIssuedRUSD`,
    ),
    principalRepaidRUSD: requireFiniteNumber(
      record.principalRepaidRUSD,
      `${path}.principalRepaidRUSD`,
    ),
    principalWrittenOffRUSD: requireFiniteNumber(
      record.principalWrittenOffRUSD,
      `${path}.principalWrittenOffRUSD`,
    ),
    interestWrittenOffRUSD: requireFiniteNumber(
      record.interestWrittenOffRUSD,
      `${path}.interestWrittenOffRUSD`,
    ),
  };
}

function decodeFinanceState(value: unknown): FinanceState {
  const record = requireRecord(value, "save payload.finance");
  const accounts = requireArray(record.accounts, "save payload.finance.accounts");
  const postings = requireArray(record.postings, "save payload.finance.postings");
  const summaries = requireArray(
    record.periodSummaries,
    "save payload.finance.periodSummaries",
  );
  const annualSummaries = requireArray(
    record.annualSummaries,
    "save payload.finance.annualSummaries",
  );
  const corrections = requireArray(
    record.corrections,
    "save payload.finance.corrections",
  );
  const rawClosed = record.closedThroughDay;
  const contracts = requireArray(
    record.debtContracts,
    "save payload.finance.debtContracts",
  );
  const debtHistory = requireArray(
    record.debtHistory,
    "save payload.finance.debtHistory",
  );
  const rawMemos = requireRecord(
    record.budgetMemosThisMonth,
    "save payload.finance.budgetMemosThisMonth",
  );
  const budgetMemosThisMonth: Record<number, FinanceBudgetMemo> = {};
  for (const key of Object.keys(rawMemos)) {
    if (!/^(0|[1-9][0-9]*)$/.test(key)) {
      throw new SaveFormatError(
        `save payload.finance.budgetMemosThisMonth key ${JSON.stringify(key)} is not a canonical decimal country id`,
      );
    }
    const countryId = Number(key);
    if (!Number.isSafeInteger(countryId) || countryId < 0 || countryId > 0xffff_ffff) {
      throw new SaveFormatError(
        `save payload.finance.budgetMemosThisMonth key ${JSON.stringify(key)} is out of range`,
      );
    }
    budgetMemosThisMonth[countryId] = decodeBudgetMemo(
      rawMemos[key],
      `save payload.finance.budgetMemosThisMonth[${key}]`,
    );
  }
  return {
    accounts: accounts.map((account, index) =>
      decodeFinancialAccount(account, `save payload.finance.accounts[${String(index)}]`),
    ),
    postings: postings.map((posting, index) =>
      decodeJournalPosting(posting, `save payload.finance.postings[${String(index)}]`),
    ),
    nextPostingId: requireInteger(
      record.nextPostingId,
      "save payload.finance.nextPostingId",
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    nextAccountId: requireInteger(
      record.nextAccountId,
      "save payload.finance.nextAccountId",
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    opening: decodeOpeningBalance(record.opening),
    periodSummaries: summaries.map((summary, index) =>
      decodePeriodSummary(
        summary,
        `save payload.finance.periodSummaries[${String(index)}]`,
      ),
    ),
    annualSummaries: annualSummaries.map((summary, index) =>
      decodeAnnualSummary(
        summary,
        `save payload.finance.annualSummaries[${String(index)}]`,
      ),
    ),
    corrections: corrections.map((correction, index) =>
      decodeFinanceCorrection(
        correction,
        `save payload.finance.corrections[${String(index)}]`,
      ),
    ),
    nextCorrectionId: requireInteger(
      record.nextCorrectionId,
      "save payload.finance.nextCorrectionId",
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    debtContracts: contracts.map((contract, index) =>
      decodeDebtContract(
        contract,
        `save payload.finance.debtContracts[${String(index)}]`,
      ),
    ),
    debtHistory: debtHistory.map((aggregate, index) =>
      decodeDebtHistoryAggregate(
        aggregate,
        `save payload.finance.debtHistory[${String(index)}]`,
      ),
    ),
    nextContractId: requireInteger(
      record.nextContractId,
      "save payload.finance.nextContractId",
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    budgetMemosThisMonth,
    closedThroughDay:
      rawClosed === null
        ? null
        : requireInteger(
            rawClosed,
            "save payload.finance.closedThroughDay",
            0,
            CAMPAIGN_TERMINAL_DAY_INDEX,
          ),
  };
}

function decodeStockLot(value: unknown, path: string): StockLot {
  const record = requireRecord(value, path);
  return {
    goodId: requireUint32(record.goodId, `${path}.goodId`),
    ownerBuildingId: requireUint32(record.ownerBuildingId, `${path}.ownerBuildingId`),
    quantity: requireFiniteNumber(record.quantity, `${path}.quantity`),
  };
}

function decodeMarket(value: unknown, path: string): Market {
  const record = requireRecord(value, path);
  const prices = requireArray(record.priceRUSD, `${path}.priceRUSD`).map((price, index) =>
    requireFiniteNumber(price, `${path}.priceRUSD[${String(index)}]`),
  );
  const lots = requireArray(record.stockLots, `${path}.stockLots`).map((lot, index) =>
    decodeStockLot(lot, `${path}.stockLots[${String(index)}]`),
  );
  return {
    id: requireUint32(record.id, `${path}.id`),
    priceRUSD: prices,
    stockLots: canonicalizeStockLots(lots),
    customsCountryId:
      record.customsCountryId === null || record.customsCountryId === undefined
        ? null
        : requireUint32(record.customsCountryId, `${path}.customsCountryId`),
    priceSmoothedRUSD:
      record.priceSmoothedRUSD === undefined
        ? []
        : requireArray(record.priceSmoothedRUSD, `${path}.priceSmoothedRUSD`).map((price, index) =>
            requireFiniteNumber(price, `${path}.priceSmoothedRUSD[${String(index)}]`),
          ),
  };
}

function decodeBuilding(value: unknown, path: string): BuildingInstance {
  const record = requireRecord(value, path);
  if (record.ownerKind !== "private" && record.ownerKind !== "state") {
    throw new SaveFormatError(`${path}.ownerKind is invalid`);
  }
  if (typeof record.operational !== "boolean") {
    throw new SaveFormatError(`${path}.operational must be a boolean`);
  }
  return {
    id: requireUint32(record.id, `${path}.id`),
    definitionId: requireUint32(record.definitionId, `${path}.definitionId`),
    provinceId: requireUint32(record.provinceId, `${path}.provinceId`),
    level: requireInteger(record.level, `${path}.level`, 1, Number.MAX_SAFE_INTEGER),
    condition: requireFiniteNumber(record.condition, `${path}.condition`),
    ownerKind: record.ownerKind,
    ownerAccountId: requireUint32(record.ownerAccountId, `${path}.ownerAccountId`),
    builtOnDay: requireInteger(record.builtOnDay, `${path}.builtOnDay`, 0, CAMPAIGN_TERMINAL_DAY_INDEX),
    operational: record.operational,
    operatingCashAccountId: requireUint32(
      record.operatingCashAccountId,
      `${path}.operatingCashAccountId`,
    ),
    technique: requireFiniteNumber(record.technique, `${path}.technique`),
    depositId: record.depositId === null ? null : requireUint32(record.depositId, `${path}.depositId`),
    ...(record.jobMix === undefined || record.jobMix === null
      ? {}
      : {
          jobMix: requireArray(record.jobMix, `${path}.jobMix`).map((entry, index) => {
            const job = requireRecord(entry, `${path}.jobMix[${String(index)}]`);
            return {
              professionId: requireUint32(job.professionId, `${path}.jobMix[${String(index)}].professionId`),
              workersPerThroughputUnit: requireFiniteNumber(job.workersPerThroughputUnit, `${path}.jobMix[${String(index)}].workersPerThroughputUnit`),
            };
          }),
        }),
  };
}

function decodeEmployment(value: unknown, path: string): EmploymentAssignment {
  const record = requireRecord(value, path);
  return {
    id: requireUint32(record.id, `${path}.id`),
    popBlockId: requireUint32(record.popBlockId, `${path}.popBlockId`),
    buildingInstanceId: requireUint32(
      record.buildingInstanceId,
      `${path}.buildingInstanceId`,
    ),
    professionId: requireUint32(record.professionId, `${path}.professionId`),
    workers: requireInteger(record.workers, `${path}.workers`, 1, Number.MAX_SAFE_INTEGER),
  };
}

function decodePopBlock(value: unknown, path: string): PopBlock {
  const record = requireRecord(value, path);
  const maleByAge = decodeTypedArray(record.maleByAge);
  if (!(maleByAge instanceof Uint32Array)) {
    throw new SaveFormatError(`${path}.maleByAge must decode to Uint32Array`);
  }
  if (maleByAge.length !== SINGLE_AGE_COUNT) {
    throw new SaveFormatError(`${path}.maleByAge must have length ${String(SINGLE_AGE_COUNT)}`);
  }
  const femaleByAge = decodeTypedArray(record.femaleByAge);
  if (!(femaleByAge instanceof Uint32Array)) {
    throw new SaveFormatError(`${path}.femaleByAge must decode to Uint32Array`);
  }
  if (femaleByAge.length !== SINGLE_AGE_COUNT) {
    throw new SaveFormatError(`${path}.femaleByAge must have length ${String(SINGLE_AGE_COUNT)}`);
  }

  const rawLiteracyByAge = requireArray(record.literacyByAge, `${path}.literacyByAge`);
  if (rawLiteracyByAge.length !== SINGLE_AGE_COUNT) {
    throw new SaveFormatError(
      `${path}.literacyByAge must have length ${String(SINGLE_AGE_COUNT)}`,
    );
  }
  const literacyByAge = rawLiteracyByAge.map((value, age) =>
    requireFiniteNumber(value, `${path}.literacyByAge[${String(age)}]`),
  );
  return {
    id: requireUint32(record.id, `${path}.id`),
    provinceId: requireUint32(record.provinceId, `${path}.provinceId`),
    professionId: requireUint32(record.professionId, `${path}.professionId`),
    maleByAge,
    femaleByAge,
    literacy: requireFiniteNumber(record.literacy, `${path}.literacy`),
    literacyByAge,
    qualification: requireFiniteNumber(record.qualification, `${path}.qualification`),
    wealthLevel: requireFiniteNumber(record.wealthLevel, `${path}.wealthLevel`),
    financialAccountId: requireUint32(
      record.financialAccountId,
      `${path}.financialAccountId`,
    ),
    militancy: requireFiniteNumber(record.militancy, `${path}.militancy`),
    unmetSubsistenceDays: requireInteger(
      record.unmetSubsistenceDays,
      `${path}.unmetSubsistenceDays`,
      0,
      Number.MAX_SAFE_INTEGER,
    ),
    unmetBasicDays: requireInteger(
      record.unmetBasicDays,
      `${path}.unmetBasicDays`,
      0,
      Number.MAX_SAFE_INTEGER,
    ),
    comfortFulfilledDays: requireInteger(
      record.comfortFulfilledDays,
      `${path}.comfortFulfilledDays`,
      0,
      Number.MAX_SAFE_INTEGER,
    ),
    fractionalBirthRemainder: requireFiniteNumber(
      record.fractionalBirthRemainder,
      `${path}.fractionalBirthRemainder`,
    ),
    fractionalMaleBirthRemainder: requireFiniteNumber(
      record.fractionalMaleBirthRemainder,
      `${path}.fractionalMaleBirthRemainder`,
    ),
    fractionalDeathRemainder: requireFiniteNumber(
      record.fractionalDeathRemainder,
      `${path}.fractionalDeathRemainder`,
    ),
    urbanShare: requireFiniteNumber(record.urbanShare, `${path}.urbanShare`),
    fertilityResidual: requireFiniteNumber(record.fertilityResidual, `${path}.fertilityResidual`),
    childMortalityResidual: requireFiniteNumber(record.childMortalityResidual, `${path}.childMortalityResidual`),
    adultMortalityResidual: requireFiniteNumber(record.adultMortalityResidual, `${path}.adultMortalityResidual`),
    childMortalityLagged: requireFiniteNumber(record.childMortalityLagged, `${path}.childMortalityLagged`),
    foodSufficiency: requireFiniteNumber(record.foodSufficiency, `${path}.foodSufficiency`),
    incomeSmoothedRUSDPerCapitaDay:
      record.incomeSmoothedRUSDPerCapitaDay === undefined ? 0 : requireNonNegativeFinite(record.incomeSmoothedRUSDPerCapitaDay, `${path}.incomeSmoothedRUSDPerCapitaDay`),
    dwellings:
      record.dwellings === undefined ? 0 : requireNonNegativeFinite(record.dwellings, `${path}.dwellings`),
    housingReferencePersonsPerDwelling:
      record.housingReferencePersonsPerDwelling === undefined ? 0 : requireNonNegativeFinite(record.housingReferencePersonsPerDwelling, `${path}.housingReferencePersonsPerDwelling`),
    housingReferenceIncomeRUSDPerCapitaDay:
      record.housingReferenceIncomeRUSDPerCapitaDay === undefined ? 0 : requireNonNegativeFinite(record.housingReferenceIncomeRUSDPerCapitaDay, `${path}.housingReferenceIncomeRUSDPerCapitaDay`),
  };
}

/** P6 (D-153): a finite, non-negative number. */
function requireNonNegativeFinite(value: unknown, path: string): number {
  const number = requireFiniteNumber(value, path);
  if (number < 0) throw new RangeError(`${path} must be non-negative`);
  return number;
}

/** P6 (D-153): whether the world carries demand-system or housing state to encode. */
function worldHasDemandState(world: World): boolean {
  return (
    world.provinceEconomies.some((entry) => entry.housingReferencePersonsPerDwelling !== null) ||
    world.markets.some((market) => market.priceSmoothedRUSD.length > 0) ||
    world.popBlocks.some(
      (block) =>
        block.incomeSmoothedRUSDPerCapitaDay !== 0 ||
        block.dwellings !== 0 ||
        block.housingReferencePersonsPerDwelling !== 0 ||
        block.housingReferenceIncomeRUSDPerCapitaDay !== 0,
    )
  );
}

function decodeConstructionProject(
  value: unknown,
  path: string,
): ConstructionProject {
  const record = requireRecord(value, path);
  const status = record.status;
  if (
    status !== "authorized" &&
    status !== "active" &&
    status !== "waiting" &&
    status !== "paused" &&
    status !== "completed" &&
    status !== "cancelled"
  ) {
    throw new SaveFormatError(`${path}.status is invalid`);
  }
  const blockedReason = record.blockedReason;
  if (
    blockedReason !== null &&
    blockedReason !== "labor" &&
    blockedReason !== "funds" &&
    blockedReason !== "materials"
  ) {
    throw new SaveFormatError(`${path}.blockedReason is invalid`);
  }
  return {
    id: requireUint32(record.id, `${path}.id`),
    countryId: requireUint32(record.countryId, `${path}.countryId`),
    provinceId: requireUint32(record.provinceId, `${path}.provinceId`),
    definitionId: requireUint32(record.definitionId, `${path}.definitionId`),
    status,
    authorizedDay: requireInteger(record.authorizedDay, `${path}.authorizedDay`, 0, CAMPAIGN_TERMINAL_DAY_INDEX),
    startedDay:
      record.startedDay === null
        ? null
        : requireInteger(record.startedDay, `${path}.startedDay`, 0, CAMPAIGN_TERMINAL_DAY_INDEX),
    completedDay:
      record.completedDay === null
        ? null
        : requireInteger(record.completedDay, `${path}.completedDay`, 0, CAMPAIGN_TERMINAL_DAY_INDEX),
    cancelledDay:
      record.cancelledDay === null
        ? null
        : requireInteger(record.cancelledDay, `${path}.cancelledDay`, 0, CAMPAIGN_TERMINAL_DAY_INDEX),
    totalCostRUSD: requireFiniteNumber(record.totalCostRUSD, `${path}.totalCostRUSD`),
    workingCapitalRUSD: requireFiniteNumber(
      record.workingCapitalRUSD,
      `${path}.workingCapitalRUSD`,
    ),
    workingCapitalPaidRUSD: requireFiniteNumber(
      record.workingCapitalPaidRUSD,
      `${path}.workingCapitalPaidRUSD`,
    ),
    spentRUSD: requireFiniteNumber(record.spentRUSD, `${path}.spentRUSD`),
    materialsSpentRUSD: requireFiniteNumber(
      record.materialsSpentRUSD,
      `${path}.materialsSpentRUSD`,
    ),
    materials: requireArray(record.materials, `${path}.materials`).map(
      (material, index) => {
        const entry = requireRecord(
          material,
          `${path}.materials[${String(index)}]`,
        );
        return {
          goodId: requireUint32(
            entry.goodId,
            `${path}.materials[${String(index)}].goodId`,
          ),
          requiredQuantity: requireFiniteNumber(
            entry.requiredQuantity,
            `${path}.materials[${String(index)}].requiredQuantity`,
          ),
          deliveredQuantity: requireFiniteNumber(
            entry.deliveredQuantity,
            `${path}.materials[${String(index)}].deliveredQuantity`,
          ),
        };
      },
    ),
    lastWorkers: requireInteger(record.lastWorkers, `${path}.lastWorkers`, 0, 0xffff_ffff),
    blockedReason,
    buildingId:
      record.buildingId === null
        ? null
        : requireUint32(record.buildingId, `${path}.buildingId`),
  };
}

function decodeConstructionState(value: unknown): ConstructionState {
  const path = "save payload.construction";
  const record = requireRecord(value, path);
  const rawProjects = requireArray(record.projects, `${path}.projects`);
  const projects = rawProjects.map((project, index) =>
    decodeConstructionProject(project, `${path}.projects[${String(index)}]`),
  );
  const rawHistory = requireArray(record.history, `${path}.history`);
  const history = rawHistory.map((aggregate, index) => {
    const entry = requireRecord(aggregate, `${path}.history[${String(index)}]`);
    return {
      countryId: requireUint32(entry.countryId, `${path}.history[${String(index)}].countryId`),
      projectsCompleted: requireInteger(
        entry.projectsCompleted,
        `${path}.history[${String(index)}].projectsCompleted`,
        0,
        1_000_000,
      ),
      projectsCancelled: requireInteger(
        entry.projectsCancelled,
        `${path}.history[${String(index)}].projectsCancelled`,
        0,
        1_000_000,
      ),
      totalSpentRUSD: requireFiniteNumber(
        entry.totalSpentRUSD,
        `${path}.history[${String(index)}].totalSpentRUSD`,
      ),
      totalWrittenOffRUSD: requireFiniteNumber(
        entry.totalWrittenOffRUSD,
        `${path}.history[${String(index)}].totalWrittenOffRUSD`,
      ),
    };
  });
  return {
    projects,
    history,
    nextProjectId: requireInteger(
      record.nextProjectId,
      `${path}.nextProjectId`,
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    nextBuildingId: requireInteger(
      record.nextBuildingId,
      `${path}.nextBuildingId`,
      1,
      Number.MAX_SAFE_INTEGER,
    ),
  };
}

function decodeProvinceSpecialStatus(
  value: unknown,
  path: string,
): ProvinceSpecialStatus {
  const status = requireString(value, path, { minLength: 1, maxLength: 32 });
  if (!(PROVINCE_SPECIAL_STATUSES as readonly string[]).includes(status)) {
    throw new SaveFormatError(`${path} is not a supported province special status`);
  }
  return status as ProvinceSpecialStatus;
}

function decodeProvinceTransferKind(
  value: unknown,
  path: string,
): ProvinceTransferKind {
  const kind = requireString(value, path, { minLength: 1, maxLength: 32 });
  if (!(PROVINCE_TRANSFER_KINDS as readonly string[]).includes(kind)) {
    throw new SaveFormatError(`${path} is not a supported province transfer kind`);
  }
  return kind as ProvinceTransferKind;
}

function decodeProvinceState(value: unknown): ProvinceState {
  const record = requireRecord(value, "save payload.provinces");
  if (typeof record.enabled !== "boolean") {
    throw new SaveFormatError("save payload.provinces.enabled must be a boolean");
  }
  const rawOwnership = requireArray(
    record.ownership,
    "save payload.provinces.ownership",
  );
  const ownership: ProvinceOwnership[] = [];
  for (let index = 0; index < rawOwnership.length; index += 1) {
    const path = `save payload.provinces.ownership[${String(index)}]`;
    const entry = requireRecord(rawOwnership[index], path);
    const rawClaims = requireArray(entry.claimantPolityIds, `${path}.claimantPolityIds`);
    const claims: number[] = [];
    for (let claimIndex = 0; claimIndex < rawClaims.length; claimIndex += 1) {
      claims.push(
        requireUint32(
          rawClaims[claimIndex],
          `${path}.claimantPolityIds[${String(claimIndex)}]`,
        ),
      );
    }
    ownership.push({
      provinceId: requireUint32(entry.provinceId, `${path}.provinceId`),
      ownerPolityId: requireUint32(entry.ownerPolityId, `${path}.ownerPolityId`),
      controllerPolityId: requireUint32(
        entry.controllerPolityId,
        `${path}.controllerPolityId`,
      ),
      controlledSinceDay:
        entry.controlledSinceDay === null
          ? null
          : requireInteger(
              entry.controlledSinceDay,
              `${path}.controlledSinceDay`,
              0,
              CAMPAIGN_TERMINAL_DAY_INDEX,
            ),
      claimantPolityIds: claims,
      specialStatus: decodeProvinceSpecialStatus(
        entry.specialStatus,
        `${path}.specialStatus`,
      ),
    });
  }
  const rawTransfers = requireArray(
    record.transfers,
    "save payload.provinces.transfers",
  );
  const transfers: ProvinceTransferRecord[] = [];
  for (let index = 0; index < rawTransfers.length; index += 1) {
    const path = `save payload.provinces.transfers[${String(index)}]`;
    const entry = requireRecord(rawTransfers[index], path);
    const rawIds = requireArray(entry.provinceIds, `${path}.provinceIds`);
    const ids: number[] = [];
    for (let idIndex = 0; idIndex < rawIds.length; idIndex += 1) {
      ids.push(requireUint32(rawIds[idIndex], `${path}.provinceIds[${String(idIndex)}]`));
    }
    transfers.push({
      id: requireUint32(entry.id, `${path}.id`),
      day: requireInteger(entry.day, `${path}.day`, 0, CAMPAIGN_TERMINAL_DAY_INDEX),
      provinceIds: ids,
      fromPolityId:
        entry.fromPolityId === null
          ? null
          : requireUint32(entry.fromPolityId, `${path}.fromPolityId`),
      toPolityId: requireUint32(entry.toPolityId, `${path}.toPolityId`),
      kind: decodeProvinceTransferKind(entry.kind, `${path}.kind`),
      note: requireString(entry.note, `${path}.note`, { maxLength: 500 }),
    });
  }
  const state: ProvinceState = {
    enabled: record.enabled,
    ownership,
    transfers,
    nextTransferId: requireInteger(
      record.nextTransferId,
      "save payload.provinces.nextTransferId",
      1,
      Number.MAX_SAFE_INTEGER,
    ),
  };
  try {
    assertValidProvinceState(state);
  } catch (error) {
    throw new SaveFormatError(
      `save payload.provinces is invalid: ${errorMessage(error)}`,
    );
  }
  return state;
}

function decodeWorldPayload(value: unknown): World {
  const payload = requireRecord(value, "save payload");

  const schemaVersion = requireInteger(
    payload.schemaVersion,
    "save payload.schemaVersion",
    0,
    Number.MAX_SAFE_INTEGER,
  );
  if (schemaVersion !== WORLD_SCHEMA_VERSION) {
    throw new SaveFormatError(
      `Unsupported world schema version ${String(schemaVersion)}; this build supports ${String(WORLD_SCHEMA_VERSION)}`,
    );
  }

  const simVersion = requireString(payload.simVersion, "save payload.simVersion", {
    minLength: 1,
  });
  if (simVersion !== SIM_VERSION) {
    throw new SaveFormatError(
      `Save simulation version ${JSON.stringify(simVersion)} is incompatible with this build (${JSON.stringify(SIM_VERSION)})`,
    );
  }

  const dataVersion = requireString(payload.dataVersion, "save payload.dataVersion", {
    minLength: 1,
    maxLength: MAX_SCENARIO_ID_LENGTH,
  });
  if (dataVersion !== DEFAULT_DATA_VERSION) {
    throw new SaveFormatError(
      `Save content version ${JSON.stringify(dataVersion)} is incompatible with this build (${JSON.stringify(DEFAULT_DATA_VERSION)})`,
    );
  }

  const scenarioId = requireString(payload.scenarioId, "save payload.scenarioId", {
    minLength: 1,
    maxLength: MAX_SCENARIO_ID_LENGTH,
  });
  const dayIndex = requireInteger(
    payload.dayIndex,
    "save payload.dayIndex",
    0,
    CAMPAIGN_TERMINAL_DAY_INDEX,
  );
  assertValidDayIndex(dayIndex);
  const startDayIndex = requireInteger(
    payload.startDayIndex,
    "save payload.startDayIndex",
    0,
    CAMPAIGN_TERMINAL_DAY_INDEX,
  );
  assertValidDayIndex(startDayIndex);
  if (startDayIndex > dayIndex) {
    throw new SaveFormatError("save payload.startDayIndex must not be after dayIndex");
  }
  const seed = requireUint32(payload.seed, "save payload.seed");

  const diagnosticsRecord = requireRecord(payload.diagnostics, "save payload.diagnostics");
  const invariantFailureCount = requireInteger(
    diagnosticsRecord.invariantFailureCount,
    "save payload.diagnostics.invariantFailureCount",
    0,
    Number.MAX_SAFE_INTEGER,
  );
  const invalidActionCount = requireInteger(
    diagnosticsRecord.invalidActionCount,
    "save payload.diagnostics.invalidActionCount",
    0,
    Number.MAX_SAFE_INTEGER,
  );
  const eventApplicationCount = requireInteger(
    diagnosticsRecord.eventApplicationCount,
    "save payload.diagnostics.eventApplicationCount",
    0,
    Number.MAX_SAFE_INTEGER,
  );

  const rawWarnings = requireArray(
    diagnosticsRecord.recentWarnings,
    "save payload.diagnostics.recentWarnings",
  );
  if (rawWarnings.length > MAX_RECENT_WARNINGS) {
    throw new SaveFormatError(
      `Save contains too many recent warnings (${String(rawWarnings.length)}; maximum ${String(MAX_RECENT_WARNINGS)})`,
    );
  }
  const recentWarnings: string[] = [];
  for (let index = 0; index < rawWarnings.length; index += 1) {
    recentWarnings.push(
      requireString(rawWarnings[index], `save payload.diagnostics.recentWarnings[${String(index)}]`, {
        maxLength: MAX_WARNING_LENGTH,
      }),
    );
  }

  const rawProvinces = requireArray(payload.provinceEconomies, "save payload.provinceEconomies");
  const provinceEconomies = rawProvinces.map((province, index) =>
    decodeProvinceEconomy(province, `save payload.provinceEconomies[${String(index)}]`),
  );
  const rawCountries = requireArray(payload.countries, "save payload.countries");
  const countries = rawCountries.map((country, index) =>
    decodeCountry(country, `save payload.countries[${String(index)}]`),
  );
  const rawCurrencies = requireArray(payload.currencies, "save payload.currencies");
  const currencies = rawCurrencies.map((currency, index) =>
    decodeCurrency(currency, `save payload.currencies[${String(index)}]`),
  );
  const rawValuations = requireArray(
    payload.currencyValuations,
    "save payload.currencyValuations",
  );
  const currencyValuations = rawValuations.map((valuation, index) =>
    decodeCurrencyValuation(
      valuation,
      `save payload.currencyValuations[${String(index)}]`,
    ),
  );
  const rawPopBlocks = requireArray(payload.popBlocks, "save payload.popBlocks");
  const popBlocks = rawPopBlocks.map((block, index) =>
    decodePopBlock(block, `save payload.popBlocks[${String(index)}]`),
  );
  const rawBuildings = requireArray(payload.buildings, "save payload.buildings");
  const buildings = rawBuildings.map((building, index) =>
    decodeBuilding(building, `save payload.buildings[${String(index)}]`),
  );
  const rawEmployment = requireArray(payload.employment, "save payload.employment");
  const employment = rawEmployment.map((assignment, index) =>
    decodeEmployment(assignment, `save payload.employment[${String(index)}]`),
  );
  if (typeof payload.employmentDirty !== "boolean") {
    throw new SaveFormatError("save payload.employmentDirty must be a boolean");
  }
  const employmentDirty = payload.employmentDirty;
  const rawMarkets = requireArray(payload.markets, "save payload.markets");
  const markets = rawMarkets.map((market, index) =>
    decodeMarket(market, `save payload.markets[${String(index)}]`),
  );
  const finance = decodeFinanceState(payload.finance);
  let profitDistribution: World["profitDistribution"];
  try {
    profitDistribution = assertValidProfitDistributionPolicy(
      payload.profitDistribution,
      "save payload.profitDistribution",
    );
  } catch (error) {
    throw new SaveFormatError(
      `save payload.profitDistribution is invalid: ${errorMessage(error)}`,
    );
  }
  const countryAI = decodeCountryAIPolicy(
    payload.countryAI,
    "save payload.countryAI",
  );
  const construction = decodeConstructionState(payload.construction);
  const politics = decodePoliticsState(payload.politics, "save payload.politics");
  const rawTechnology = requireRecord(payload.technology, "save payload.technology");
  if (typeof rawTechnology.enabled !== "boolean") {
    throw new SaveFormatError("save payload.technology.enabled must be a boolean");
  }
  const technology = { enabled: rawTechnology.enabled };
  const trade = decodeTradeState(payload.trade, "save payload.trade");
  const priceIndex = decodePriceIndexState(payload.priceIndex, "save payload.priceIndex");
  const demography = decodeDemographyReport(payload.demography, "save payload.demography");
  let resources: ResourceState;
  try {
    resources = decodeSerializedResourceState(payload.resources, "save payload.resources");
  } catch (error) {
    throw new SaveFormatError(errorMessage(error));
  }
  let labourMarket: LabourMarketState;
  try {
    labourMarket = decodeLabourMarket(payload.labourMarket, "save payload.labourMarket");
  } catch (error) {
    throw new SaveFormatError(errorMessage(error));
  }
  const monetary = decodeMonetaryState(payload.monetary, "save payload.monetary");
  const military = decodeMilitaryState(payload.military, "save payload.military");
  const provinces = decodeProvinceState(payload.provinces);
  const playerCountryId =
    payload.playerCountryId === null
      ? null
      : requireUint32(payload.playerCountryId, "save payload.playerCountryId");
  const moneyRecord = requireRecord(payload.moneyCoefficients, "save payload.moneyCoefficients");
  const moneyCoefficients = {} as MoneyCoefficients;
  for (const key of MONEY_COEFFICIENT_KEYS) {
    moneyCoefficients[key] = requireFiniteNumber(moneyRecord[key], `save payload.moneyCoefficients.${key}`);
  }

  const world: World = {
    schemaVersion,
    simVersion,
    dataVersion,
    scenarioId,
    dayIndex,
    startDayIndex,
    seed,
    provinceEconomies,
    countries,
    currencies,
    currencyValuations,
    popBlocks,
    buildings,
    employment,
    employmentDirty,
    markets,
    finance,
    profitDistribution,
    countryAI,
    construction,
    politics,
    technology,
    trade,
    priceIndex,
    monetary,
    military,
    provinces,
    playerCountryId,
    moneyCoefficients,
    demography,
    resources,
    labourMarket,
    diagnostics: {
      invariantFailureCount,
      invalidActionCount,
      eventApplicationCount,
      recentWarnings,
    },
  };

  try {
    assertValidWorld(world);
  } catch (error) {
    throw new SaveFormatError(`Save contains invalid world state: ${errorMessage(error)}`);
  }
  return world;
}


// ---- D-137 save format 2: column tables for the large collections ------------
//
// The payload of format 2 is the format-1 payload (`encodeWorld`) with its largest
// collections stored as columns: finance accounts (owner kind and subtype as codes;
// the category is the subtype's), pop blocks (age and literacy arrays flattened),
// buildings, employment, province economies, province ownership, and each closed
// period's per-account totals. Columns of finite numbers are written by the
// canonical encoder as plain number arrays, so the payload has a few thousand
// objects instead of a few hundred thousand. Decoding rebuilds the format-1 payload
// exactly and then runs the unchanged decoder and whole-world validation.

const SAVE_OWNER_KINDS = ["popBlock", "building", "country", "system"] as const;

interface SavedColumnTable {
  readonly keys: readonly string[];
  readonly rows: number;
  readonly columns: readonly (readonly unknown[])[];
}

function toColumnTable(rows: readonly object[], path: string): SavedColumnTable {
  const first = rows[0] as Record<string, unknown> | undefined;
  const keys = first === undefined ? [] : Object.keys(first).sort();
  const columns: unknown[][] = keys.map(() => new Array<unknown>(rows.length));
  for (let row = 0; row < rows.length; row += 1) {
    const record = rows[row] as Record<string, unknown>;
    if (Object.keys(record).length !== keys.length) {
      throw new RangeError(`${path}[${String(row)}] does not share the table's fields`);
    }
    for (let column = 0; column < keys.length; column += 1) {
      const value = record[keys[column] as string];
      if (value === undefined) {
        throw new RangeError(`${path}[${String(row)}] does not share the table's fields`);
      }
      (columns[column] as unknown[])[row] = value;
    }
  }
  return { keys, rows: rows.length, columns };
}

function fromColumnTable(value: unknown, path: string): Record<string, unknown>[] {
  const table = requireRecord(value, path);
  const keys = requireArray(table.keys, `${path}.keys`).map((key, index) =>
    requireString(key, `${path}.keys[${String(index)}]`),
  );
  const rows = requireInteger(table.rows, `${path}.rows`, 0, Number.MAX_SAFE_INTEGER);
  const columns = requireArray(table.columns, `${path}.columns`);
  if (columns.length !== keys.length) {
    throw new SaveFormatError(`${path} has ${String(columns.length)} columns for ${String(keys.length)} fields`);
  }
  const typedColumns = columns.map((column, index) => {
    const values = requireArray(column, `${path}.columns[${String(index)}]`);
    if (values.length !== rows) {
      throw new SaveFormatError(`${path}.columns[${String(index)}] does not have ${String(rows)} rows`);
    }
    return values;
  });
  const result: Record<string, unknown>[] = new Array<Record<string, unknown>>(rows);
  for (let row = 0; row < rows; row += 1) {
    const record: Record<string, unknown> = {};
    for (let column = 0; column < keys.length; column += 1) {
      record[keys[column] as string] = (typedColumns[column] as unknown[])[row];
    }
    result[row] = record;
  }
  return result;
}

function codeOf(values: readonly string[], value: string, path: string): number {
  const code = values.indexOf(value);
  if (code < 0) throw new RangeError(`${path} has no save code for ${JSON.stringify(value)}`);
  return code;
}

function valueOfCode<T extends string>(values: readonly T[], code: unknown, path: string): T {
  const index = requireInteger(code, path, 0, values.length - 1);
  return values[index] as T;
}

/**
 * Save format 2 codec for tooling and tests (D-137): `decodeSavePayload` turns a
 * format-2 save payload into the format-1 shape that `encodeWorld` returns, and
 * `encodeSavePayload` back. `deserializeWorld` validates whatever it is given.
 */
export function encodeSavePayload(encoded: SerializedWorld): Record<string, unknown> {
  return toSavePayload(encoded);
}

export function decodeSavePayload(payload: unknown): unknown {
  return fromSavePayload(payload);
}

/** Format-1 payload (`encodeWorld`) to the format-2 column payload. */
function toSavePayload(encoded: SerializedWorld): Record<string, unknown> {
  const subtypeCodes = new Map<string, number>(ACCOUNT_SUBTYPES.map((subtype, index) => [subtype, index]));
  const accounts = encoded.finance.accounts;
  const accountColumns = {
    id: accounts.map((account) => account.id),
    ownerKind: accounts.map((account) => codeOf(SAVE_OWNER_KINDS, account.ownerKind, "finance.accounts.ownerKind")),
    ownerId: accounts.map((account) => (account.ownerId === null ? -1 : account.ownerId)),
    subtype: accounts.map((account) => {
      const code = subtypeCodes.get(account.subtype);
      if (code === undefined) throw new RangeError(`account subtype ${JSON.stringify(account.subtype)} has no save code`);
      return code;
    }),
    balanceRUSD: accounts.map((account) => account.balanceRUSD),
  };
  const blocks = encoded.popBlocks;
  const maleByAge: number[] = [];
  const femaleByAge: number[] = [];
  const literacyByAge: number[] = [];
  const blockRest = blocks.map((block) => {
    if (
      block.maleByAge.length !== SINGLE_AGE_COUNT ||
      block.femaleByAge.length !== SINGLE_AGE_COUNT ||
      block.literacyByAge.length !== SINGLE_AGE_COUNT
    ) {
      throw new RangeError(`popBlock ${String(block.id)} age arrays must have length ${String(SINGLE_AGE_COUNT)}`);
    }
    for (const value of block.maleByAge.values) maleByAge.push(value);
    for (const value of block.femaleByAge.values) femaleByAge.push(value);
    for (const value of block.literacyByAge) literacyByAge.push(value);
    const { maleByAge: _male, femaleByAge: _female, literacyByAge: _literacy, ...rest } = block;
    return rest;
  });
  const periodSummaries = encoded.finance.periodSummaries.map((summary) => {
    const ids = Object.keys(summary.accountTotals)
      .map((key) => Number(key))
      .sort((left, right) => left - right);
    return {
      ...summary,
      accountTotals: { id: ids, value: ids.map((id) => summary.accountTotals[accountTotalKey(id)] as number) },
    };
  });
  return {
    ...encoded,
    provinceEconomies: toColumnTable(encoded.provinceEconomies, "provinceEconomies"),
    popBlocks: {
      ageCount: SINGLE_AGE_COUNT,
      table: toColumnTable(blockRest, "popBlocks"),
      maleByAge,
      femaleByAge,
      literacyByAge,
    },
    buildings: toColumnTable(encoded.buildings, "buildings"),
    employment: toColumnTable(encoded.employment, "employment"),
    finance: { ...encoded.finance, accounts: accountColumns, periodSummaries },
    provinces: {
      ...encoded.provinces,
      ownership: toColumnTable(encoded.provinces.ownership, "provinces.ownership"),
    },
  };
}

/** Format-2 column payload back to the format-1 payload that `decodeWorldPayload` reads. */
function fromSavePayload(value: unknown): unknown {
  const payload = requireRecord(value, "save payload");
  const finance = requireRecord(payload.finance, "save payload.finance");
  const accountColumns = requireRecord(finance.accounts, "save payload.finance.accounts");
  const ids = requireArray(accountColumns.id, "finance.accounts.id");
  const ownerKinds = requireArray(accountColumns.ownerKind, "finance.accounts.ownerKind");
  const ownerIds = requireArray(accountColumns.ownerId, "finance.accounts.ownerId");
  const subtypes = requireArray(accountColumns.subtype, "finance.accounts.subtype");
  const balances = requireArray(accountColumns.balanceRUSD, "finance.accounts.balanceRUSD");
  const count = ids.length;
  if (ownerKinds.length !== count || ownerIds.length !== count || subtypes.length !== count || balances.length !== count) {
    throw new SaveFormatError("save payload.finance.accounts columns have different lengths");
  }
  const accounts: Record<string, unknown>[] = new Array<Record<string, unknown>>(count);
  for (let index = 0; index < count; index += 1) {
    const subtype = valueOfCode(ACCOUNT_SUBTYPES, subtypes[index], "finance.accounts.subtype");
    const ownerId = ownerIds[index];
    accounts[index] = {
      id: ids[index],
      ownerKind: valueOfCode(SAVE_OWNER_KINDS, ownerKinds[index], "finance.accounts.ownerKind"),
      ownerId: ownerId === -1 ? null : ownerId,
      category: categoryForSubtype(subtype),
      subtype,
      balanceRUSD: balances[index],
    };
  }
  const periodSummaries = requireArray(finance.periodSummaries, "save payload.finance.periodSummaries").map(
    (entry, summaryIndex) => {
      const summary = requireRecord(entry, `finance.periodSummaries[${String(summaryIndex)}]`);
      const totals = requireRecord(summary.accountTotals, `finance.periodSummaries[${String(summaryIndex)}].accountTotals`);
      const totalIds = requireArray(totals.id, "accountTotals.id");
      const totalValues = requireArray(totals.value, "accountTotals.value");
      if (totalIds.length !== totalValues.length) {
        throw new SaveFormatError("save period account totals have different column lengths");
      }
      const accountTotals: Record<string, unknown> = {};
      for (let index = 0; index < totalIds.length; index += 1) {
        accountTotals[String(requireInteger(totalIds[index], "accountTotals.id", 0, 0xffff_ffff))] = totalValues[index];
      }
      return { ...summary, accountTotals };
    },
  );
  const blocks = requireRecord(payload.popBlocks, "save payload.popBlocks");
  const ageCount = requireInteger(blocks.ageCount, "popBlocks.ageCount", SINGLE_AGE_COUNT, SINGLE_AGE_COUNT);
  const blockRows = fromColumnTable(blocks.table, "popBlocks.table");
  const male = requireArray(blocks.maleByAge, "popBlocks.maleByAge");
  const female = requireArray(blocks.femaleByAge, "popBlocks.femaleByAge");
  const literacy = requireArray(blocks.literacyByAge, "popBlocks.literacyByAge");
  const cells = blockRows.length * ageCount;
  if (male.length !== cells || female.length !== cells || literacy.length !== cells) {
    throw new SaveFormatError("save payload.popBlocks age arrays do not match the block count");
  }
  const popBlocks = blockRows.map((row, index) => ({
    ...row,
    maleByAge: { encoding: "typed-array-v1", kind: "Uint32Array", length: ageCount, values: male.slice(index * ageCount, (index + 1) * ageCount) },
    femaleByAge: { encoding: "typed-array-v1", kind: "Uint32Array", length: ageCount, values: female.slice(index * ageCount, (index + 1) * ageCount) },
    literacyByAge: literacy.slice(index * ageCount, (index + 1) * ageCount),
  }));
  const provinces = requireRecord(payload.provinces, "save payload.provinces");
  return {
    ...payload,
    provinceEconomies: fromColumnTable(payload.provinceEconomies, "provinceEconomies"),
    popBlocks,
    buildings: fromColumnTable(payload.buildings, "buildings"),
    employment: fromColumnTable(payload.employment, "employment"),
    finance: { ...finance, accounts, periodSummaries },
    provinces: { ...provinces, ownership: fromColumnTable(provinces.ownership, "provinces.ownership") },
  };
}

/** The canonical envelope text with `payloadText` in its sorted key position (D-137). */
function saveEnvelopeText(
  header: Omit<SaveEnvelope, "payload">,
  payloadText: string,
): string {
  return (
    `{"checksum":${JSON.stringify(header.checksum)},"dataVersion":${JSON.stringify(header.dataVersion)}` +
    `,"dayIndex":${String(header.dayIndex)},"format":${JSON.stringify(header.format)}` +
    `,"formatVersion":${String(header.formatVersion)},"payload":${payloadText}` +
    `,"scenarioId":${JSON.stringify(header.scenarioId)},"schemaVersion":${String(header.schemaVersion)}` +
    `,"seed":${String(header.seed)},"simVersion":${JSON.stringify(header.simVersion)}}`
  );
}

/** Serialize a world to the canonical versioned save envelope. */
export function serializeWorld(world: World): string {
  // D-137: the payload is canonicalised once; the checksum is over that text and the
  // envelope is assembled around it (the same text as canonicalising the envelope).
  const payloadText = stableStringify(toSavePayload(encodeWorld(world)));
  const header = {
    format: "century-save" as const,
    formatVersion: SAVE_FORMAT_VERSION,
    schemaVersion: world.schemaVersion,
    simVersion: world.simVersion,
    dataVersion: world.dataVersion,
    scenarioId: world.scenarioId,
    dayIndex: world.dayIndex,
    seed: world.seed,
    checksum: `${SAVE_CHECKSUM_PREFIX}${fnv1a32Hex(payloadText)}`,
  };
  return saveEnvelopeText(header, payloadText);
}

function decodeEnvelope(value: unknown, text: string): World {
  const envelope = requireRecord(value, "save envelope");

  const format = requireString(envelope.format, "save envelope.format");
  if (format !== "century-save") {
    throw new SaveFormatError(
      `Unsupported save format ${JSON.stringify(format)}; expected "century-save"`,
    );
  }

  const formatVersion = requireInteger(
    envelope.formatVersion,
    "save envelope.formatVersion",
    0,
    Number.MAX_SAFE_INTEGER,
  );
  if (formatVersion !== SAVE_FORMAT_VERSION) {
    throw new SaveFormatError(
      `Save format version ${String(formatVersion)} is incompatible with this build (${String(SAVE_FORMAT_VERSION)})`,
    );
  }

  const schemaVersion = requireInteger(
    envelope.schemaVersion,
    "save envelope.schemaVersion",
    0,
    Number.MAX_SAFE_INTEGER,
  );
  if (schemaVersion !== WORLD_SCHEMA_VERSION) {
    throw new SaveFormatError(
      `Save world schema ${String(schemaVersion)} is incompatible with this build (${String(WORLD_SCHEMA_VERSION)})`,
    );
  }

  const simVersion = requireString(envelope.simVersion, "save envelope.simVersion", {
    minLength: 1,
  });
  if (simVersion !== SIM_VERSION) {
    throw new SaveFormatError(
      `Save simulation version ${JSON.stringify(simVersion)} is incompatible with this build (${JSON.stringify(SIM_VERSION)})`,
    );
  }

  const dataVersion = requireString(envelope.dataVersion, "save envelope.dataVersion", {
    minLength: 1,
    maxLength: MAX_SCENARIO_ID_LENGTH,
  });
  if (dataVersion !== DEFAULT_DATA_VERSION) {
    throw new SaveFormatError(
      `Save content version ${JSON.stringify(dataVersion)} is incompatible with this build (${JSON.stringify(DEFAULT_DATA_VERSION)})`,
    );
  }

  const scenarioId = requireString(envelope.scenarioId, "save envelope.scenarioId", {
    minLength: 1,
    maxLength: MAX_SCENARIO_ID_LENGTH,
  });
  const dayIndex = requireInteger(
    envelope.dayIndex,
    "save envelope.dayIndex",
    0,
    CAMPAIGN_TERMINAL_DAY_INDEX,
  );
  const seed = requireUint32(envelope.seed, "save envelope.seed");
  const checksum = requireString(envelope.checksum, "save envelope.checksum", {
    minLength: 1,
  });
  const payload = requireRecord(envelope.payload, "save envelope.payload");

  // D-137: a save this build wrote is the canonical envelope around the canonical
  // payload text, so its checksum is verified over that text without re-encoding.
  // Any other spelling of the same envelope is verified by canonicalising the payload.
  const start = text.indexOf(',"payload":');
  const end = text.lastIndexOf(',"scenarioId":');
  const payloadText = start >= 0 && end > start ? text.slice(start + ',"payload":'.length, end) : null;
  const ownText =
    payloadText !== null &&
    saveEnvelopeText(
      { format, formatVersion, schemaVersion, simVersion, dataVersion, scenarioId, dayIndex, seed, checksum },
      payloadText,
    ) === text;
  // A matching checksum over the text proves that text is what was checksummed; a
  // layout match alone does not prove the payload text is canonical (a parsed and
  // re-stringified save keeps the layout), so a mismatch is decided canonically.
  const textMatches =
    ownText && payloadText !== null && checksum === `${SAVE_CHECKSUM_PREFIX}${fnv1a32Hex(payloadText)}`;
  if (!textMatches && checksum !== checksumOfJson(payload)) {
    throw new SaveFormatError(
      "Save checksum mismatch; the save is corrupt or was modified outside the simulation",
    );
  }

  const world = decodeWorldPayload(fromSavePayload(payload));

  if (
    schemaVersion !== world.schemaVersion ||
    simVersion !== world.simVersion ||
    dataVersion !== world.dataVersion ||
    scenarioId !== world.scenarioId ||
    dayIndex !== world.dayIndex ||
    seed !== world.seed
  ) {
    throw new SaveFormatError(
      "Save envelope metadata does not match the encoded world payload",
    );
  }

  return world;
}

/** Deserialize and validate a save, or throw `SaveFormatError`. */
export function deserializeWorld(serialized: string): World {
  if (typeof serialized !== "string" || serialized.length === 0) {
    throw new SaveFormatError("Save data must be a non-empty JSON string");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized) as unknown;
  } catch (error) {
    throw new SaveFormatError(`Save data is not valid JSON: ${errorMessage(error)}`);
  }

  try {
    return decodeEnvelope(parsed, serialized);
  } catch (error) {
    if (error instanceof SaveFormatError) throw error;
    throw new SaveFormatError(`Invalid save data: ${errorMessage(error)}`);
  }
}
