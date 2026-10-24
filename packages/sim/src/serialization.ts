/**
 * Explicit, versioned serialization for the M2 world.
 *
 * A save is a canonical JSON envelope with save format, schema, simulation, and
 * content versions; scenario/day/seed metadata; a checksum; and the complete
 * encoded payload. The payload includes the M1 diagnostics and the M2 region,
 * pop-block, and minimal finance-account state.
 *
 * Typed arrays are never left to `JSON.parse`: each is encoded as a tagged
 * object with an explicit kind, length, and values, and reconstructed as the
 * corresponding typed-array class. M2 uses this codec for `Uint32Array` cohort
 * counts and `Uint8Array` aging carries. Version mismatches, malformed data,
 * checksum failures, and invalid state all produce a `SaveFormatError` instead
 * of a partially restored world.
 *
 * The checksum is FNV-1a 32 over canonical JSON. It detects accidental
 * corruption and is not a security signature.
 */

import { assertValidDayIndex } from "./calendar.js";
import {
  CAMPAIGN_TERMINAL_DAY_INDEX,
  DEFAULT_DATA_VERSION,
  MAX_RECENT_WARNINGS,
  MAX_SCENARIO_ID_LENGTH,
  MAX_WARNING_LENGTH,
  SAVE_FORMAT_VERSION,
  SIM_VERSION,
  WORLD_SCHEMA_VERSION,
} from "./constants.js";
import { checksumOfJson, stableStringify } from "./hash.js";
import { AGE_COHORT_COUNT } from "./population/constants.js";
import type {
  FinanceState,
  FinancialAccount,
  PopBlock,
  Region,
} from "./population/types.js";
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
};

/** Encoded household financial account. */
export type SerializedFinancialAccount = {
  readonly id: number;
  readonly ownerKind: "popBlock";
  readonly ownerId: number;
  readonly accountKind: "household";
  readonly balanceSUSD: number;
};

/** Encoded minimal finance state. */
export type SerializedFinanceState = {
  readonly accounts: readonly SerializedFinancialAccount[];
};

/** Encoded population block with explicit typed-array tags. */
export type SerializedPopBlock = {
  readonly id: number;
  readonly regionId: number;
  readonly professionId: number;
  readonly ageCohorts: EncodedTypedArray;
  readonly agingCarry: EncodedTypedArray;
  readonly literacy: number;
  readonly wealthLevel: number;
  readonly financialAccountId: number;
  readonly militancy: number;
  readonly unmetSubsistenceDays: number;
  readonly unmetBasicDays: number;
  readonly comfortFulfilledDays: number;
  readonly fractionalBirthRemainder: number;
  readonly fractionalDeathRemainder: number;
};

/** Complete encoded world payload. */
export type SerializedWorld = {
  readonly schemaVersion: number;
  readonly simVersion: string;
  readonly dataVersion: string;
  readonly scenarioId: string;
  readonly dayIndex: number;
  readonly seed: number;
  readonly regions: readonly SerializedRegion[];
  readonly popBlocks: readonly SerializedPopBlock[];
  readonly finance: SerializedFinanceState;
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

/** Encode all authoritative world fields. Validates the world first. */
export function encodeWorld(world: World): SerializedWorld {
  assertValidWorld(world);
  return {
    schemaVersion: world.schemaVersion,
    simVersion: world.simVersion,
    dataVersion: world.dataVersion,
    scenarioId: world.scenarioId,
    dayIndex: world.dayIndex,
    seed: world.seed,
    regions: world.regions.map((region) => ({
      id: region.id,
      key: region.key,
      name: region.name,
      popBlockIds: [...region.popBlockIds],
    })),
    popBlocks: world.popBlocks.map((block) => ({
      id: block.id,
      regionId: block.regionId,
      professionId: block.professionId,
      ageCohorts: encodeTypedArray(block.ageCohorts),
      agingCarry: encodeTypedArray(block.agingCarry),
      literacy: block.literacy,
      wealthLevel: block.wealthLevel,
      financialAccountId: block.financialAccountId,
      militancy: block.militancy,
      unmetSubsistenceDays: block.unmetSubsistenceDays,
      unmetBasicDays: block.unmetBasicDays,
      comfortFulfilledDays: block.comfortFulfilledDays,
      fractionalBirthRemainder: block.fractionalBirthRemainder,
      fractionalDeathRemainder: block.fractionalDeathRemainder,
    })),
    finance: {
      accounts: world.finance.accounts.map((account) => ({
        id: account.id,
        ownerKind: account.ownerKind,
        ownerId: account.ownerId,
        accountKind: account.accountKind,
        balanceSUSD: account.balanceSUSD,
      })),
    },
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
  return {
    id: requireUint32(record.id, `${path}.id`),
    key: requireString(record.key, `${path}.key`, { minLength: 1 }),
    name: requireString(record.name, `${path}.name`, { minLength: 1 }),
    popBlockIds: ids,
  };
}

function decodeFinancialAccount(value: unknown, path: string): FinancialAccount {
  const record = requireRecord(value, path);
  if (record.ownerKind !== "popBlock") {
    throw new SaveFormatError(`${path}.ownerKind must be "popBlock"`);
  }
  if (record.accountKind !== "household") {
    throw new SaveFormatError(`${path}.accountKind must be "household"`);
  }
  return {
    id: requireUint32(record.id, `${path}.id`),
    ownerKind: "popBlock",
    ownerId: requireUint32(record.ownerId, `${path}.ownerId`),
    accountKind: "household",
    balanceSUSD: requireFiniteNumber(record.balanceSUSD, `${path}.balanceSUSD`),
  };
}

function decodeFinanceState(value: unknown): FinanceState {
  const record = requireRecord(value, "save payload.finance");
  const accounts = requireArray(record.accounts, "save payload.finance.accounts");
  return {
    accounts: accounts.map((account, index) =>
      decodeFinancialAccount(account, `save payload.finance.accounts[${String(index)}]`),
    ),
  };
}

function decodePopBlock(value: unknown, path: string): PopBlock {
  const record = requireRecord(value, path);
  const ageCohorts = decodeTypedArray(record.ageCohorts);
  if (!(ageCohorts instanceof Uint32Array)) {
    throw new SaveFormatError(`${path}.ageCohorts must decode to Uint32Array`);
  }
  if (ageCohorts.length !== AGE_COHORT_COUNT) {
    throw new SaveFormatError(`${path}.ageCohorts must have length ${String(AGE_COHORT_COUNT)}`);
  }
  const agingCarry = decodeTypedArray(record.agingCarry);
  if (!(agingCarry instanceof Uint8Array) || agingCarry instanceof Uint8ClampedArray) {
    throw new SaveFormatError(`${path}.agingCarry must decode to Uint8Array`);
  }
  if (agingCarry.length !== AGE_COHORT_COUNT) {
    throw new SaveFormatError(`${path}.agingCarry must have length ${String(AGE_COHORT_COUNT)}`);
  }

  return {
    id: requireUint32(record.id, `${path}.id`),
    regionId: requireUint32(record.regionId, `${path}.regionId`),
    professionId: requireUint32(record.professionId, `${path}.professionId`),
    ageCohorts,
    agingCarry,
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
    fractionalDeathRemainder: requireFiniteNumber(
      record.fractionalDeathRemainder,
      `${path}.fractionalDeathRemainder`,
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
  const rawPopBlocks = requireArray(payload.popBlocks, "save payload.popBlocks");
  const popBlocks = rawPopBlocks.map((block, index) =>
    decodePopBlock(block, `save payload.popBlocks[${String(index)}]`),
  );
  const finance = decodeFinanceState(payload.finance);

  const world: World = {
    schemaVersion,
    simVersion,
    dataVersion,
    scenarioId,
    dayIndex,
    seed,
    regions,
    popBlocks,
    finance,
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
