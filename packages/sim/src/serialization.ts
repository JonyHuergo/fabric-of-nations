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

import { assertValidDayIndex } from "./calendar.js";
import {
  CAMPAIGN_TERMINAL_DAY_INDEX,
  DEFAULT_DATA_VERSION,
  MAX_FOREIGN_ISSUER_KEY_LENGTH,
  MAX_RECENT_WARNINGS,
  MAX_SCENARIO_ID_LENGTH,
  MAX_WARNING_LENGTH,
  SAVE_FORMAT_VERSION,
  SIM_VERSION,
  WORLD_SCHEMA_VERSION,
} from "./constants.js";
import { checksumOfJson, stableStringify } from "./hash.js";
import { canonicalizeStockLots } from "./economy/inventory.js";
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
  Currency,
  CurrencyIssuer,
  CurrencyValuation,
  DebtContract,
  DebtPolicy,
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
  JournalLine,
  JournalPosting,
  Market,
  MonetaryArrangement,
  OpeningBalanceRecord,
  StockLot,
  SusdPerCurrencyUnit,
  TransactionKind,
} from "./economy/types.js";
import {
  ACCOUNT_CATEGORIES,
  ACCOUNT_SUBTYPES,
  FLOW_TRANSACTION_KINDS,
  TRANSACTION_KINDS,
} from "./economy/types.js";
import {
  assertValidCountryAIPolicy,
  assertValidCountryAIState,
} from "./economy/aiState.js";
import { asSusdPerCurrencyUnit } from "./economy/currency.js";
import { assertValidProfitDistributionPolicy } from "./economy/profit.js";
import { assertValidFiscalPolicy } from "./economy/country.js";
import { assertValidDebtPolicy } from "./economy/debtPolicy.js";
import { SINGLE_AGE_COUNT } from "./population/constants.js";
import type { PopBlock, Region } from "./population/types.js";
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

/** Encoded region. */
export type SerializedRegion = {
  readonly id: number;
  readonly key: string;
  readonly name: string;
  readonly popBlockIds: readonly number[];
  readonly marketId: number | null;
  readonly buildingInstanceIds: readonly number[];
  readonly resourceCapsPerDay: readonly number[];
};

/** Encoded financial account. */
export type SerializedFinancialAccount = {
  readonly id: number;
  readonly ownerKind: FinancialAccountOwnerKind;
  readonly ownerId: number | null;
  readonly category: AccountCategory;
  readonly subtype: AccountSubtype;
  readonly balanceSUSD: number;
};

/** Encoded journal line. */
export type SerializedJournalLine = {
  readonly accountId: number;
  readonly side: "debit" | "credit";
  readonly amountSUSD: number;
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
  readonly welfareRequestedSUSD: number;
  readonly welfareShortfallSUSD: number;
  readonly businessTaxAssessedSUSD: number;
  readonly businessTaxUncollectedSUSD: number;
  readonly debtIssuedSUSD: number;
  readonly principalRepaidSUSD: number;
  readonly interestPaidSUSD: number;
  readonly unfinancedRequirementSUSD: number;
  readonly constructionSpentSUSD: number;
  readonly constructionWrittenOffSUSD: number;
  readonly businessTaxAssessedDay: number | null;
};

/** Encoded E2 per-country budget decomposition. */
export type SerializedFinanceBudgetTotals = {
  readonly welfareRequestedSUSD: number;
  readonly welfareShortfallSUSD: number;
  readonly businessTaxAssessedSUSD: number;
  readonly businessTaxUncollectedSUSD: number;
  readonly debtIssuedSUSD: number;
  readonly principalRepaidSUSD: number;
  readonly interestPaidSUSD: number;
  readonly unfinancedRequirementSUSD: number;
  readonly constructionSpentSUSD: number;
  readonly constructionWrittenOffSUSD: number;
};

/** Encoded E3 construction project. */
export type SerializedConstructionProject = {
  readonly id: number;
  readonly countryId: number;
  readonly regionId: number;
  readonly definitionId: number;
  readonly status: ConstructionProject["status"];
  readonly authorizedDay: number;
  readonly startedDay: number | null;
  readonly completedDay: number | null;
  readonly cancelledDay: number | null;
  readonly totalCostSUSD: number;
  readonly workingCapitalSUSD: number;
  readonly workingCapitalPaidSUSD: number;
  readonly spentSUSD: number;
  readonly lastWorkers: number;
  readonly blockedReason: "labor" | "funds" | null;
  readonly buildingId: number | null;
};

/** Encoded compacted construction history aggregate. */
export type SerializedConstructionHistoryAggregate = {
  readonly countryId: number;
  readonly projectsCompleted: number;
  readonly projectsCancelled: number;
  readonly totalSpentSUSD: number;
  readonly totalWrittenOffSUSD: number;
};

/** Encoded E3 construction state. */
export type SerializedConstructionState = {
  readonly projects: readonly SerializedConstructionProject[];
  readonly history: readonly SerializedConstructionHistoryAggregate[];
  readonly nextProjectId: number;
  readonly nextBuildingId: number;
};

/** Encoded per-country fiscal totals retained by a compacted summary. */
export type SerializedCountryFiscalTotals = {
  readonly incomeTaxRevenueSUSD: number;
  readonly businessTaxRevenueSUSD: number;
  readonly welfareExpenseSUSD: number;
  readonly interestExpenseSUSD: number;
  readonly netFiscalResultSUSD: number;
};

/** Encoded aggregate of compacted terminated debt contracts. */
export type SerializedDebtHistoryAggregate = {
  readonly issuerCountryId: number;
  readonly contractsRetired: number;
  readonly contractsDefaulted: number;
  readonly principalIssuedSUSD: number;
  readonly principalRepaidSUSD: number;
  readonly principalWrittenOffSUSD: number;
  readonly interestWrittenOffSUSD: number;
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
        readonly treasuryCashSUSD: number;
        readonly debtLiabilitySUSD: number;
        readonly interestPayableSUSD: number;
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
    readonly amountSUSD: number;
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
  readonly incomeTaxAllowanceSUSDPerYear: number;
  readonly welfareBudgetSUSDPerYear: number;
  readonly welfareMaxWealthLevel: number;
  readonly businessProfitTaxRate: number;
  readonly reserveTargetSUSD: number;
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
  readonly maxOutstandingPrincipalSUSD: number;
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
  readonly principalSUSD: number;
  readonly outstandingPrincipalSUSD: number;
  readonly annualCouponRate: number;
  readonly issueDay: number;
  readonly maturityDay: number;
  readonly accruedInterestSUSD: number;
  readonly status: "active" | "arrears" | "repaid" | "defaulted";
  readonly arrearsSinceDay: number | null;
};

/** Encoded country identity, region ownership, treasury, and fiscal policy. */
export type SerializedCountry = {  readonly id: number;
  readonly tag: string;
  readonly name: string;
  readonly monetary: SerializedMonetaryArrangement;
  readonly regionIds: readonly number[];
  readonly treasuryAccountId: number;
  readonly fiscal: SerializedFiscalPolicy;
  readonly debt: SerializedDebtPolicy;
  readonly ai: SerializedCountryAIState;
  readonly immigrationOpen: boolean;
};

/** Encoded SUSD-relative valuation. */
export type SerializedCurrencyValuation =
  | {
      readonly currencyId: number;
      readonly status: "specified";
      readonly susdPerUnit: number;
      readonly setOnDay: number;
      readonly source: "scenario";
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
  readonly regionId: number;
  readonly level: number;
  readonly condition: number;
  readonly ownerKind: "private" | "state";
  readonly ownerAccountId: number;
  readonly builtOnDay: number;
  readonly operational: boolean;
  readonly operatingCashAccountId: number;
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
  readonly regionIds: readonly number[];
  readonly priceSUSD: readonly number[];
  readonly stockLots: readonly SerializedStockLot[];
};

/** Encoded population block with explicit typed-array tags. */
export type SerializedPopBlock = {
  readonly id: number;
  readonly regionId: number;
  readonly professionId: number;
  readonly maleByAge: EncodedTypedArray;
  readonly femaleByAge: EncodedTypedArray;
  readonly literacy: number;
  readonly wealthLevel: number;
  readonly financialAccountId: number;
  readonly militancy: number;
  readonly unmetSubsistenceDays: number;
  readonly unmetBasicDays: number;
  readonly comfortFulfilledDays: number;
  readonly fractionalBirthRemainder: number;
  readonly fractionalMaleBirthRemainder: number;
  readonly fractionalDeathRemainder: number;
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
  readonly regions: readonly SerializedRegion[];
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
  readonly playerCountryId: number | null;
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
    encoded[accountTotalKey(countryId)] = {
      incomeTaxRevenueSUSD: entry.incomeTaxRevenueSUSD,
      businessTaxRevenueSUSD: entry.businessTaxRevenueSUSD,
      welfareExpenseSUSD: entry.welfareExpenseSUSD,
      interestExpenseSUSD: entry.interestExpenseSUSD,
      netFiscalResultSUSD: entry.netFiscalResultSUSD,
    };
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
    encoded[accountTotalKey(countryId)] = {
      welfareRequestedSUSD: entry.welfareRequestedSUSD,
      welfareShortfallSUSD: entry.welfareShortfallSUSD,
      businessTaxAssessedSUSD: entry.businessTaxAssessedSUSD,
      businessTaxUncollectedSUSD: entry.businessTaxUncollectedSUSD,
      debtIssuedSUSD: entry.debtIssuedSUSD,
      principalRepaidSUSD: entry.principalRepaidSUSD,
      interestPaidSUSD: entry.interestPaidSUSD,
      unfinancedRequirementSUSD: entry.unfinancedRequirementSUSD,
      constructionSpentSUSD: entry.constructionSpentSUSD,
      constructionWrittenOffSUSD: entry.constructionWrittenOffSUSD,
    };
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
  if (summary.countryFiscalTotals === undefined) {
    return {
      periodStartDay: summary.periodStartDay,
      periodEndDay: summary.periodEndDay,
      accountTotals,
      flowTotalsByKind,
      countryBudgetTotals,
    };
  }
  return {
    periodStartDay: summary.periodStartDay,
    periodEndDay: summary.periodEndDay,
    accountTotals,
    flowTotalsByKind,
    countryFiscalTotals: encodeCountryFiscalTotals(summary.countryFiscalTotals),
    countryBudgetTotals,
  };
}

/** Encode all authoritative world fields. Validates the world first. */
export function encodeWorld(world: World): SerializedWorld {
  assertValidWorld(world);
  return {
    schemaVersion: world.schemaVersion,
    simVersion: world.simVersion,
    dataVersion: world.dataVersion,
    scenarioId: world.scenarioId,
    dayIndex: world.dayIndex,
    startDayIndex: world.startDayIndex,
    seed: world.seed,
    regions: world.regions.map((region) => ({
      id: region.id,
      key: region.key,
      name: region.name,
      popBlockIds: [...region.popBlockIds],
      marketId: region.marketId,
      buildingInstanceIds: [...region.buildingInstanceIds].sort((left, right) => left - right),
      resourceCapsPerDay: [...region.resourceCapsPerDay],
    })),
    countries: [...world.countries]
      .sort((left, right) => left.id - right.id)
      .map((country) => ({
        id: country.id,
        tag: country.tag,
        name: country.name,
        monetary: { ...country.monetary },
        regionIds: [...country.regionIds].sort((left, right) => left - right),
        treasuryAccountId: country.treasuryAccountId,
        fiscal: {
          incomeTaxRate: country.fiscal.incomeTaxRate,
          incomeTaxAllowanceSUSDPerYear: country.fiscal.incomeTaxAllowanceSUSDPerYear,
          welfareBudgetSUSDPerYear: country.fiscal.welfareBudgetSUSDPerYear,
          welfareMaxWealthLevel: country.fiscal.welfareMaxWealthLevel,
          businessProfitTaxRate: country.fiscal.businessProfitTaxRate,
          reserveTargetSUSD: country.fiscal.reserveTargetSUSD,
        },
        debt: {
          enabled: country.debt.enabled,
          creditorKind: country.debt.creditorKind,
          creditorId: country.debt.creditorId,
          annualCouponRate: country.debt.annualCouponRate,
          termDays: country.debt.termDays,
          maxOutstandingPrincipalSUSD: country.debt.maxOutstandingPrincipalSUSD,
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
              susdPerUnit: valuation.susdPerUnit,
              setOnDay: valuation.setOnDay,
              source: valuation.source,
            }
          : { currencyId: valuation.currencyId, status: "unavailable" as const },
      ),
    popBlocks: world.popBlocks.map((block) => ({
      id: block.id,
      regionId: block.regionId,
      professionId: block.professionId,
      maleByAge: encodeTypedArray(block.maleByAge),
      femaleByAge: encodeTypedArray(block.femaleByAge),
      literacy: block.literacy,
      wealthLevel: block.wealthLevel,
      financialAccountId: block.financialAccountId,
      militancy: block.militancy,
      unmetSubsistenceDays: block.unmetSubsistenceDays,
      unmetBasicDays: block.unmetBasicDays,
      comfortFulfilledDays: block.comfortFulfilledDays,
      fractionalBirthRemainder: block.fractionalBirthRemainder,
      fractionalMaleBirthRemainder: block.fractionalMaleBirthRemainder,
      fractionalDeathRemainder: block.fractionalDeathRemainder,
    })),
    buildings: [...world.buildings]
      .sort((left, right) => left.id - right.id)
      .map((building) => ({
        id: building.id,
        definitionId: building.definitionId,
        regionId: building.regionId,
        level: building.level,
        condition: building.condition,
        ownerKind: building.ownerKind,
        ownerAccountId: building.ownerAccountId,
        builtOnDay: building.builtOnDay,
        operational: building.operational,
        operatingCashAccountId: building.operatingCashAccountId,
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
        regionIds: [...market.regionIds],
        priceSUSD: [...market.priceSUSD],
        stockLots: canonicalizeStockLots(market.stockLots).map((lot) => ({
          goodId: lot.goodId,
          ownerBuildingId: lot.ownerBuildingId,
          quantity: lot.quantity,
        })),
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
          balanceSUSD: account.balanceSUSD,
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
            amountSUSD: line.amountSUSD,
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
                  treasuryCashSUSD: balances.treasuryCashSUSD,
                  debtLiabilitySUSD: balances.debtLiabilitySUSD,
                  interestPayableSUSD: balances.interestPayableSUSD,
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
            amountSUSD: line.amountSUSD,
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
          principalSUSD: contract.principalSUSD,
          outstandingPrincipalSUSD: contract.outstandingPrincipalSUSD,
          annualCouponRate: contract.annualCouponRate,
          issueDay: contract.issueDay,
          maturityDay: contract.maturityDay,
          accruedInterestSUSD: contract.accruedInterestSUSD,
          status: contract.status,
          arrearsSinceDay: contract.arrearsSinceDay,
        })),
      debtHistory: [...world.finance.debtHistory]
        .sort((left, right) => left.issuerCountryId - right.issuerCountryId)
        .map((aggregate) => ({
          issuerCountryId: aggregate.issuerCountryId,
          contractsRetired: aggregate.contractsRetired,
          contractsDefaulted: aggregate.contractsDefaulted,
          principalIssuedSUSD: aggregate.principalIssuedSUSD,
          principalRepaidSUSD: aggregate.principalRepaidSUSD,
          principalWrittenOffSUSD: aggregate.principalWrittenOffSUSD,
          interestWrittenOffSUSD: aggregate.interestWrittenOffSUSD,
        })),
      nextContractId: world.finance.nextContractId,
      budgetMemosThisMonth: Object.fromEntries(
        Object.entries(world.finance.budgetMemosThisMonth)
          .sort((left, right) => Number(left[0]) - Number(right[0]))
          .map(([countryId, memo]) => [
            countryId,
            {
              welfareRequestedSUSD: memo.welfareRequestedSUSD,
              welfareShortfallSUSD: memo.welfareShortfallSUSD,
              businessTaxAssessedSUSD: memo.businessTaxAssessedSUSD,
              businessTaxUncollectedSUSD: memo.businessTaxUncollectedSUSD,
              debtIssuedSUSD: memo.debtIssuedSUSD,
              principalRepaidSUSD: memo.principalRepaidSUSD,
              interestPaidSUSD: memo.interestPaidSUSD,
              unfinancedRequirementSUSD: memo.unfinancedRequirementSUSD,
              constructionSpentSUSD: memo.constructionSpentSUSD,
              constructionWrittenOffSUSD: memo.constructionWrittenOffSUSD,
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
          regionId: project.regionId,
          definitionId: project.definitionId,
          status: project.status,
          authorizedDay: project.authorizedDay,
          startedDay: project.startedDay,
          completedDay: project.completedDay,
          cancelledDay: project.cancelledDay,
          totalCostSUSD: project.totalCostSUSD,
          workingCapitalSUSD: project.workingCapitalSUSD,
          workingCapitalPaidSUSD: project.workingCapitalPaidSUSD,
          spentSUSD: project.spentSUSD,
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
          totalSpentSUSD: aggregate.totalSpentSUSD,
          totalWrittenOffSUSD: aggregate.totalWrittenOffSUSD,
        })),
      nextProjectId: world.construction.nextProjectId,
      nextBuildingId: world.construction.nextBuildingId,
    },
    playerCountryId: world.playerCountryId,
    diagnostics: {
      invariantFailureCount: world.diagnostics.invariantFailureCount,
      invalidActionCount: world.diagnostics.invalidActionCount,
      eventApplicationCount: world.diagnostics.eventApplicationCount,
      recentWarnings: [...world.diagnostics.recentWarnings],
    },
  };
}

function decodeRegion(value: unknown, path: string): Region {
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
  const resourceCaps = requireArray(record.resourceCapsPerDay, `${path}.resourceCapsPerDay`);
  const caps: number[] = [];
  for (let index = 0; index < resourceCaps.length; index += 1) {
    caps.push(
      requireFiniteNumber(resourceCaps[index], `${path}.resourceCapsPerDay[${String(index)}]`),
    );
  }
  const marketId =
    record.marketId === null ? null : requireUint32(record.marketId, `${path}.marketId`);
  return {
    id: requireUint32(record.id, `${path}.id`),
    key: requireString(record.key, `${path}.key`, { minLength: 1 }),
    name: requireString(record.name, `${path}.name`, { minLength: 1 }),
    popBlockIds: ids,
    marketId,
    buildingInstanceIds: buildings,
    resourceCapsPerDay: caps,
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
    totals[countryId] = {
      incomeTaxRevenueSUSD: requireFiniteNumber(
        entry.incomeTaxRevenueSUSD,
        `${path}[${key}].incomeTaxRevenueSUSD`,
      ),
      businessTaxRevenueSUSD: requireFiniteNumber(
        entry.businessTaxRevenueSUSD,
        `${path}[${key}].businessTaxRevenueSUSD`,
      ),
      welfareExpenseSUSD: requireFiniteNumber(
        entry.welfareExpenseSUSD,
        `${path}[${key}].welfareExpenseSUSD`,
      ),
      interestExpenseSUSD: requireFiniteNumber(
        entry.interestExpenseSUSD,
        `${path}[${key}].interestExpenseSUSD`,
      ),
      netFiscalResultSUSD: requireFiniteNumber(
        entry.netFiscalResultSUSD,
        `${path}[${key}].netFiscalResultSUSD`,
      ),
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
    totals[countryId] = {
      welfareRequestedSUSD: requireFiniteNumber(
        entry.welfareRequestedSUSD,
        `${path}[${key}].welfareRequestedSUSD`,
      ),
      welfareShortfallSUSD: requireFiniteNumber(
        entry.welfareShortfallSUSD,
        `${path}[${key}].welfareShortfallSUSD`,
      ),
      businessTaxAssessedSUSD: requireFiniteNumber(
        entry.businessTaxAssessedSUSD,
        `${path}[${key}].businessTaxAssessedSUSD`,
      ),
      businessTaxUncollectedSUSD: requireFiniteNumber(
        entry.businessTaxUncollectedSUSD,
        `${path}[${key}].businessTaxUncollectedSUSD`,
      ),
      debtIssuedSUSD: requireFiniteNumber(
        entry.debtIssuedSUSD,
        `${path}[${key}].debtIssuedSUSD`,
      ),
      principalRepaidSUSD: requireFiniteNumber(
        entry.principalRepaidSUSD,
        `${path}[${key}].principalRepaidSUSD`,
      ),
      interestPaidSUSD: requireFiniteNumber(
        entry.interestPaidSUSD,
        `${path}[${key}].interestPaidSUSD`,
      ),
      unfinancedRequirementSUSD: requireFiniteNumber(
        entry.unfinancedRequirementSUSD,
        `${path}[${key}].unfinancedRequirementSUSD`,
      ),
      constructionSpentSUSD: requireFiniteNumber(
        entry.constructionSpentSUSD,
        `${path}[${key}].constructionSpentSUSD`,
      ),
      constructionWrittenOffSUSD: requireFiniteNumber(
        entry.constructionWrittenOffSUSD,
        `${path}[${key}].constructionWrittenOffSUSD`,
      ),
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
    welfareRequestedSUSD: requireFiniteNumber(
      record.welfareRequestedSUSD,
      `${path}.welfareRequestedSUSD`,
    ),
    welfareShortfallSUSD: requireFiniteNumber(
      record.welfareShortfallSUSD,
      `${path}.welfareShortfallSUSD`,
    ),
    businessTaxAssessedSUSD: requireFiniteNumber(
      record.businessTaxAssessedSUSD,
      `${path}.businessTaxAssessedSUSD`,
    ),
    businessTaxUncollectedSUSD: requireFiniteNumber(
      record.businessTaxUncollectedSUSD,
      `${path}.businessTaxUncollectedSUSD`,
    ),
    debtIssuedSUSD: requireFiniteNumber(record.debtIssuedSUSD, `${path}.debtIssuedSUSD`),
    principalRepaidSUSD: requireFiniteNumber(
      record.principalRepaidSUSD,
      `${path}.principalRepaidSUSD`,
    ),
    interestPaidSUSD: requireFiniteNumber(record.interestPaidSUSD, `${path}.interestPaidSUSD`),
    unfinancedRequirementSUSD: requireFiniteNumber(
      record.unfinancedRequirementSUSD,
      `${path}.unfinancedRequirementSUSD`,
    ),
    constructionSpentSUSD: requireFiniteNumber(
      record.constructionSpentSUSD,
      `${path}.constructionSpentSUSD`,
    ),
    constructionWrittenOffSUSD: requireFiniteNumber(
      record.constructionWrittenOffSUSD,
      `${path}.constructionWrittenOffSUSD`,
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
        maxOutstandingPrincipalSUSD: record.maxOutstandingPrincipalSUSD,
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
    principalSUSD: requireFiniteNumber(record.principalSUSD, `${path}.principalSUSD`),
    outstandingPrincipalSUSD: requireFiniteNumber(
      record.outstandingPrincipalSUSD,
      `${path}.outstandingPrincipalSUSD`,
    ),
    annualCouponRate: requireFiniteNumber(record.annualCouponRate, `${path}.annualCouponRate`),
    issueDay: requireInteger(record.issueDay, `${path}.issueDay`, 0, CAMPAIGN_TERMINAL_DAY_INDEX),
    maturityDay: requireInteger(
      record.maturityDay,
      `${path}.maturityDay`,
      0,
      CAMPAIGN_TERMINAL_DAY_INDEX,
    ),
    accruedInterestSUSD: requireFiniteNumber(
      record.accruedInterestSUSD,
      `${path}.accruedInterestSUSD`,
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

function decodeCountry(value: unknown, path: string): Country {
  const record = requireRecord(value, path);
  const rawRegionIds = requireArray(record.regionIds, `${path}.regionIds`);
  if (typeof record.immigrationOpen !== "boolean") {
    throw new SaveFormatError(`${path}.immigrationOpen must be a boolean`);
  }
  return {
    id: requireUint32(record.id, `${path}.id`),
    tag: requireString(record.tag, `${path}.tag`, { minLength: 1 }),
    name: requireString(record.name, `${path}.name`, { minLength: 1 }),
    monetary: decodeMonetaryArrangement(record.monetary, `${path}.monetary`),
    regionIds: rawRegionIds.map((regionId, index) =>
      requireUint32(regionId, `${path}.regionIds[${String(index)}]`),
    ),
    treasuryAccountId: requireUint32(record.treasuryAccountId, `${path}.treasuryAccountId`),
    fiscal: decodeFiscalPolicy(record.fiscal, `${path}.fiscal`),
    debt: decodeDebtPolicy(record.debt, `${path}.debt`),
    ai: decodeCountryAIState(record.ai, `${path}.ai`),
    immigrationOpen: record.immigrationOpen,
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
  const rawRate = requireFiniteNumber(record.susdPerUnit, `${path}.susdPerUnit`);
  let rate: SusdPerCurrencyUnit;
  try {
    rate = asSusdPerCurrencyUnit(rawRate);
  } catch (error) {
    throw new SaveFormatError(`${path}.susdPerUnit is invalid: ${errorMessage(error)}`);
  }
  const source = requireString(record.source, `${path}.source`, { minLength: 1 });
  if (source !== "scenario") {
    throw new SaveFormatError(`${path}.source is not supported in M4a-2`);
  }
  return {
    currencyId,
    status: "specified",
    susdPerUnit: rate,
    setOnDay: requireInteger(
      record.setOnDay,
      `${path}.setOnDay`,
      0,
      CAMPAIGN_TERMINAL_DAY_INDEX,
    ),
    source: "scenario",
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
    balanceSUSD: requireFiniteNumber(record.balanceSUSD, `${path}.balanceSUSD`),
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
    amountSUSD: requireFiniteNumber(record.amountSUSD, `${path}.amountSUSD`),
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
      treasuryCashSUSD: requireFiniteNumber(
        entry.treasuryCashSUSD,
        `${path}.closingBalances[${key}].treasuryCashSUSD`,
      ),
      debtLiabilitySUSD: requireFiniteNumber(
        entry.debtLiabilitySUSD,
        `${path}.closingBalances[${key}].debtLiabilitySUSD`,
      ),
      interestPayableSUSD: requireFiniteNumber(
        entry.interestPayableSUSD,
        `${path}.closingBalances[${key}].interestPayableSUSD`,
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
    principalIssuedSUSD: requireFiniteNumber(
      record.principalIssuedSUSD,
      `${path}.principalIssuedSUSD`,
    ),
    principalRepaidSUSD: requireFiniteNumber(
      record.principalRepaidSUSD,
      `${path}.principalRepaidSUSD`,
    ),
    principalWrittenOffSUSD: requireFiniteNumber(
      record.principalWrittenOffSUSD,
      `${path}.principalWrittenOffSUSD`,
    ),
    interestWrittenOffSUSD: requireFiniteNumber(
      record.interestWrittenOffSUSD,
      `${path}.interestWrittenOffSUSD`,
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
  const regionIds = requireArray(record.regionIds, `${path}.regionIds`).map((regionId, index) =>
    requireUint32(regionId, `${path}.regionIds[${String(index)}]`),
  );
  const prices = requireArray(record.priceSUSD, `${path}.priceSUSD`).map((price, index) =>
    requireFiniteNumber(price, `${path}.priceSUSD[${String(index)}]`),
  );
  const lots = requireArray(record.stockLots, `${path}.stockLots`).map((lot, index) =>
    decodeStockLot(lot, `${path}.stockLots[${String(index)}]`),
  );
  return {
    id: requireUint32(record.id, `${path}.id`),
    regionIds,
    priceSUSD: prices,
    stockLots: canonicalizeStockLots(lots),
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
    regionId: requireUint32(record.regionId, `${path}.regionId`),
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

  return {
    id: requireUint32(record.id, `${path}.id`),
    regionId: requireUint32(record.regionId, `${path}.regionId`),
    professionId: requireUint32(record.professionId, `${path}.professionId`),
    maleByAge,
    femaleByAge,
    literacy: requireFiniteNumber(record.literacy, `${path}.literacy`),
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
  };
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
  if (blockedReason !== null && blockedReason !== "labor" && blockedReason !== "funds") {
    throw new SaveFormatError(`${path}.blockedReason is invalid`);
  }
  return {
    id: requireUint32(record.id, `${path}.id`),
    countryId: requireUint32(record.countryId, `${path}.countryId`),
    regionId: requireUint32(record.regionId, `${path}.regionId`),
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
    totalCostSUSD: requireFiniteNumber(record.totalCostSUSD, `${path}.totalCostSUSD`),
    workingCapitalSUSD: requireFiniteNumber(
      record.workingCapitalSUSD,
      `${path}.workingCapitalSUSD`,
    ),
    workingCapitalPaidSUSD: requireFiniteNumber(
      record.workingCapitalPaidSUSD,
      `${path}.workingCapitalPaidSUSD`,
    ),
    spentSUSD: requireFiniteNumber(record.spentSUSD, `${path}.spentSUSD`),
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
      totalSpentSUSD: requireFiniteNumber(
        entry.totalSpentSUSD,
        `${path}.history[${String(index)}].totalSpentSUSD`,
      ),
      totalWrittenOffSUSD: requireFiniteNumber(
        entry.totalWrittenOffSUSD,
        `${path}.history[${String(index)}].totalWrittenOffSUSD`,
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

  const rawRegions = requireArray(payload.regions, "save payload.regions");
  const regions = rawRegions.map((region, index) =>
    decodeRegion(region, `save payload.regions[${String(index)}]`),
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
  const playerCountryId =
    payload.playerCountryId === null
      ? null
      : requireUint32(payload.playerCountryId, "save payload.playerCountryId");

  const world: World = {
    schemaVersion,
    simVersion,
    dataVersion,
    scenarioId,
    dayIndex,
    startDayIndex,
    seed,
    regions,
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
    playerCountryId,
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

/** Serialize a world to the canonical versioned save envelope. */
export function serializeWorld(world: World): string {
  const payload = encodeWorld(world);
  const envelope: SaveEnvelope = {
    format: "century-save",
    formatVersion: SAVE_FORMAT_VERSION,
    schemaVersion: world.schemaVersion,
    simVersion: world.simVersion,
    dataVersion: world.dataVersion,
    scenarioId: world.scenarioId,
    dayIndex: world.dayIndex,
    seed: world.seed,
    checksum: checksumOfJson(payload),
    payload,
  };
  return stableStringify(envelope);
}

function decodeEnvelope(value: unknown): World {
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
      `Unsupported save format version ${String(formatVersion)}; this build supports ${String(SAVE_FORMAT_VERSION)}`,
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

  const expectedChecksum = checksumOfJson(payload);
  if (checksum !== expectedChecksum) {
    throw new SaveFormatError(
      "Save checksum mismatch; the save is corrupt or was modified outside the simulation",
    );
  }

  const world = decodeWorldPayload(payload);

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
    return decodeEnvelope(parsed);
  } catch (error) {
    if (error instanceof SaveFormatError) throw error;
    throw new SaveFormatError(`Invalid save data: ${errorMessage(error)}`);
  }
}
