/**
 * M12a provincial state construction, validation, lookups and mutations.
 *
 * Every function is pure apart from mutating the explicitly supplied `World`.
 * Province geometry is never stored or changed here: only political ownership,
 * effective control, claims and special status. This keeps province ids and
 * shapes stable for the entire campaign.
 */

import {
  CAMPAIGN_START_DAY_INDEX,
  MAX_PROVINCE_CLAIMS,
  MAX_PROVINCE_KEY_LENGTH,
  MAX_PROVINCE_NAME_LENGTH,
  MAX_PROVINCE_NOTE_LENGTH,
  MAX_PROVINCE_TRANSFERS,
  MAX_PROVINCES,
} from "../constants.js";
import { COUNTRY_STATUSES } from "../economy/types.js";
import type { World } from "../world.js";
import { assertValidDayIndex } from "../calendar.js";
import type { Day, Id } from "../types.js";
import {
  requireArray,
  requireInteger,
  requireRecord,
  requireString,
  requireUint32,
} from "../validation.js";
import {
  PROVINCE_CONFIDENCE_LEVELS,
  PROVINCE_SPECIAL_STATUSES,
  PROVINCE_TRANSFER_KINDS,
  type PolityDef,
  type ProvinceConfidence,
  type ProvinceControlRequest,
  type ProvinceDefinition,
  type ProvinceOwnership,
  type ProvinceOwnershipTransferRequest,
  type ProvinceScenarioInput,
  type ProvinceSpecialStatus,
  type ProvinceState,
  type ProvinceTransferKind,
  type ProvinceTransferRecord,
} from "./types.js";

const MAX_TAG_LENGTH = 8;
const MAX_POLITY_NAME_LENGTH = 128;

/** Empty provincial state for worlds that predate M12a. */
export function emptyProvinceState(): ProvinceState {
  return {
    enabled: false,
    ownership: [],
    transfers: [],
    nextTransferId: 1,
  };
}

function isConfidence(value: unknown): value is ProvinceConfidence {
  return (
    typeof value === "string" &&
    (PROVINCE_CONFIDENCE_LEVELS as readonly string[]).includes(value)
  );
}

function isSpecialStatus(value: unknown): value is ProvinceSpecialStatus {
  return (
    typeof value === "string" &&
    (PROVINCE_SPECIAL_STATUSES as readonly string[]).includes(value)
  );
}

function isTransferKind(value: unknown): value is ProvinceTransferKind {
  return (
    typeof value === "string" &&
    (PROVINCE_TRANSFER_KINDS as readonly string[]).includes(value)
  );
}

function requireAliasArray(value: unknown, path: string): string[] {
  const raw = requireArray(value, path);
  if (raw.length > 16) throw new RangeError(`${path} must contain at most 16 entries`);
  return raw.map((entry, index) =>
    requireString(entry, `${path}[${String(index)}]`, {
      minLength: 1,
      maxLength: MAX_PROVINCE_NAME_LENGTH,
    }),
  );
}

function requireSourceIds(value: unknown, path: string): string[] {
  const raw = requireArray(value, path);
  if (raw.length === 0) throw new RangeError(`${path} must declare at least one source`);
  if (raw.length > 16) throw new RangeError(`${path} must contain at most 16 entries`);
  return raw.map((entry, index) =>
    requireString(entry, `${path}[${String(index)}]`, {
      minLength: 1,
      maxLength: MAX_PROVINCE_KEY_LENGTH,
    }),
  );
}

/**
 * Validate one static province definition.
 *
 * Definitions are unique by id and key, declare a 1900 owner and a source for
 * their historical extent, and never use a display name as an identifier.
 */
export function assertValidProvinceDefinition(
  definition: ProvinceDefinition,
  path: string,
): void {
  requireUint32(definition.provinceId, `${path}.provinceId`);
  requireString(definition.key, `${path}.key`, {
    minLength: 1,
    maxLength: MAX_PROVINCE_KEY_LENGTH,
  });
  if (!/^[a-z0-9][a-z0-9-]*$/u.test(definition.key)) {
    throw new RangeError(`${path}.key must be a lowercase slug`);
  }
  requireString(definition.historicalName, `${path}.historicalName`, {
    minLength: 1,
    maxLength: MAX_PROVINCE_NAME_LENGTH,
  });
  requireString(definition.displayName, `${path}.displayName`, {
    minLength: 1,
    maxLength: MAX_PROVINCE_NAME_LENGTH,
  });
  requireAliasArray(definition.aliases, `${path}.aliases`);
  requireUint32(definition.initialOwnerPolityId, `${path}.initialOwnerPolityId`);
  requireString(
    definition.historicalAdminAffiliation,
    `${path}.historicalAdminAffiliation`,
    { minLength: 1, maxLength: MAX_PROVINCE_NAME_LENGTH },
  );
  if (definition.historicalGrouping !== null) {
    requireString(definition.historicalGrouping, `${path}.historicalGrouping`, {
      minLength: 1,
      maxLength: MAX_PROVINCE_NAME_LENGTH,
    });
  }
  if (!isSpecialStatus(definition.initialSpecialStatus)) {
    throw new RangeError(`${path}.initialSpecialStatus is not a supported status`);
  }
  requireSourceIds(definition.sourceIds, `${path}.sourceIds`);
  if (!isConfidence(definition.confidence)) {
    throw new RangeError(`${path}.confidence must be low, medium or high`);
  }
  requireString(definition.notes, `${path}.notes`, {
    minLength: 1,
    maxLength: MAX_PROVINCE_NOTE_LENGTH,
  });
}

/** Validate a complete province definition set (ids and keys unique). */
export function assertValidProvinceDefinitions(
  definitions: readonly ProvinceDefinition[],
): void {
  const raw = requireArray(definitions, "scenario.provinces.definitions");
  if (raw.length === 0) {
    throw new RangeError("scenario.provinces.definitions must contain at least one province");
  }
  if (raw.length > MAX_PROVINCES) {
    throw new RangeError(`scenario.provinces.definitions exceeds ${String(MAX_PROVINCES)} entries`);
  }
  const ids = new Set<Id>();
  const keys = new Set<string>();
  for (let index = 0; index < definitions.length; index += 1) {
    const definition = definitions[index] as ProvinceDefinition;
    const path = `scenario.provinces.definitions[${String(index)}]`;
    assertValidProvinceDefinition(definition, path);
    if (ids.has(definition.provinceId)) {
      throw new RangeError(`${path}.provinceId ${String(definition.provinceId)} is duplicated`);
    }
    ids.add(definition.provinceId);
    if (keys.has(definition.key)) {
      throw new RangeError(`${path}.key ${JSON.stringify(definition.key)} is duplicated`);
    }
    keys.add(definition.key);
  }
}

function requirePolityReference(
  value: unknown,
  path: string,
  knownPolityIds: ReadonlySet<Id>,
): Id {
  const id = requireUint32(value, path);
  if (!knownPolityIds.has(id)) {
    throw new RangeError(`${path} ${String(id)} is not a registered polity`);
  }
  return id;
}

/**
 * Validate the future-polity registry.
 *
 * Registry ids must not collide with active simulation country ids unless the
 * record describes that exact country. A future polity is never selectable in
 * 1900 and never has a 1900 activation day.
 */
export function assertValidPolityRegistry(
  registry: readonly PolityDef[],
  countryIds: ReadonlySet<Id>,
): void {
  const raw = requireArray(registry, "scenario.provinces.polityRegistry");
  const ids = new Set<Id>();
  const tags = new Set<string>();
  for (let index = 0; index < raw.length; index += 1) {
    const polity = raw[index] as PolityDef;
    const path = `scenario.provinces.polityRegistry[${String(index)}]`;
    requireUint32(polity.polityId, `${path}.polityId`);
    if (ids.has(polity.polityId)) {
      throw new RangeError(`${path}.polityId ${String(polity.polityId)} is duplicated`);
    }
    ids.add(polity.polityId);
    requireString(polity.tag, `${path}.tag`, {
      minLength: 2,
      maxLength: MAX_TAG_LENGTH,
    });
    if (tags.has(polity.tag)) {
      throw new RangeError(`${path}.tag ${JSON.stringify(polity.tag)} is duplicated`);
    }
    tags.add(polity.tag);
    requireString(polity.historicalName, `${path}.historicalName`, {
      minLength: 1,
      maxLength: MAX_POLITY_NAME_LENGTH,
    });
    requireString(polity.commonName, `${path}.commonName`, {
      minLength: 1,
      maxLength: MAX_POLITY_NAME_LENGTH,
    });
    if (
      polity.kind !== "state" &&
      polity.kind !== "territory" &&
      polity.kind !== "future-state" &&
      polity.kind !== "historical"
    ) {
      throw new RangeError(`${path}.kind must be state, territory, future-state or historical`);
    }
    requireString(polity.status, `${path}.status`, { minLength: 1, maxLength: 32 });
    if (!(COUNTRY_STATUSES as readonly string[]).includes(polity.status)) {
      throw new RangeError(`${path}.status is not a supported country status`);
    }
    if (polity.sovereignPolityId !== null) {
      requireUint32(polity.sovereignPolityId, `${path}.sovereignPolityId`);
    }
    assertValidDayIndex(polity.activeFromDay);
    if (polity.activeToDay !== null) {
      assertValidDayIndex(polity.activeToDay);
      if (polity.activeToDay < polity.activeFromDay) {
        throw new RangeError(`${path}.activeToDay must not be before activeFromDay`);
      }
    }
    if (typeof polity.selectable1900 !== "boolean") {
      throw new TypeError(`${path}.selectable1900 must be a boolean`);
    }
    if (polity.kind === "future-state" && polity.selectable1900) {
      throw new RangeError(`${path} is a future state and cannot be selectable in 1900`);
    }
    if (polity.kind === "future-state" && polity.activeFromDay === CAMPAIGN_START_DAY_INDEX) {
      throw new RangeError(`${path} is a future state and cannot be active in 1900`);
    }
    if (polity.kind === "historical" && polity.selectable1900) {
      throw new RangeError(`${path} is a historical registry polity and cannot be selectable in 1900`);
    }
    if (polity.kind === "historical" && countryIds.has(polity.polityId)) {
      throw new RangeError(`${path} is a historical registry polity and reuses a simulation country id`);
    }
    if (countryIds.has(polity.polityId) && polity.kind === "future-state") {
      throw new RangeError(`${path} reuses an active simulation country id`);
    }
    requireString(polity.capitalName, `${path}.capitalName`, {
      minLength: 1,
      maxLength: MAX_POLITY_NAME_LENGTH,
    });
    if (polity.flagKey !== null) {
      requireString(polity.flagKey, `${path}.flagKey`, { minLength: 1, maxLength: 64 });
    }
    requireSourceIds(polity.sourceIds, `${path}.sourceIds`);
    if (!isConfidence(polity.confidence)) {
      throw new RangeError(`${path}.confidence must be low, medium or high`);
    }
    requireString(polity.notes, `${path}.notes`, {
      minLength: 1,
      maxLength: MAX_PROVINCE_NOTE_LENGTH,
    });
  }
  for (const polity of registry) {
    if (polity.sovereignPolityId === polity.polityId) {
      throw new RangeError("a polity cannot be its own sovereign");
    }
    if (polity.sovereignPolityId !== null && !ids.has(polity.sovereignPolityId)) {
      throw new RangeError(
        `polity ${JSON.stringify(polity.tag)} references an unknown sovereign ${String(polity.sovereignPolityId)}`,
      );
    }
  }
}

/**
 * Validate provincial scenario content against the authored countries, provinces
 * and future-polity registry.
 */
export function assertValidProvinceScenario(
  input: ProvinceScenarioInput,
  context: {
    readonly countryIds: ReadonlySet<Id>;
    /** Provinces with a `ProvinceEconomy` record in the scenario. */
    readonly provinceIds: ReadonlySet<Id>;
    /** Each simulation country's declared initial territory (D-118). */
    readonly countryProvinceIds: ReadonlyMap<Id, readonly Id[]>;
  },
): void {
  assertValidProvinceDefinitions(input.definitions);
  const registry = input.polityRegistry ?? [];
  assertValidPolityRegistry(registry, context.countryIds);
  const knownPolityIds = new Set<Id>([...context.countryIds, ...registry.map((p) => p.polityId)]);
  for (let index = 0; index < input.definitions.length; index += 1) {
    const definition = input.definitions[index] as ProvinceDefinition;
    const path = `scenario.provinces.definitions[${String(index)}]`;
    requirePolityReference(
      definition.initialOwnerPolityId,
      `${path}.initialOwnerPolityId`,
      knownPolityIds,
    );
    if (!context.provinceIds.has(definition.provinceId)) {
      throw new RangeError(
        `${path}.provinceId ${String(definition.provinceId)} has no province economy record`,
      );
    }
  }
  // Country territory is derived from ownership; the declared initial territory must
  // agree with the definitions (and any ownership override) province by province.
  const overrideOwner = new Map<Id, Id>(
    (input.ownership ?? []).map((entry) => [entry.provinceId, entry.ownerPolityId] as const),
  );
  const declaredOwner = new Map<Id, Id>();
  for (const [countryId, provinceIds] of context.countryProvinceIds) {
    for (const provinceId of provinceIds) declaredOwner.set(provinceId, countryId);
  }
  for (const definition of input.definitions) {
    const owner = overrideOwner.get(definition.provinceId) ?? definition.initialOwnerPolityId;
    const declared = declaredOwner.get(definition.provinceId);
    if (context.countryIds.has(owner) ? declared !== owner : declared !== undefined) {
      throw new RangeError(
        `province ${definition.key} is owned by polity ${String(owner)} but declared as territory of ${String(declared ?? "no country")}`,
      );
    }
    declaredOwner.delete(definition.provinceId);
  }
  for (const [provinceId, countryId] of declaredOwner) {
    throw new RangeError(
      `country ${String(countryId)} declares province ${String(provinceId)}, which has no definition`,
    );
  }
  if (input.ownership !== undefined) {
    const byProvince = new Map<Id, number>();
    for (let index = 0; index < input.ownership.length; index += 1) {
      const entry = input.ownership[index];
      if (entry === undefined) continue;
      const path = `scenario.provinces.ownership[${String(index)}]`;
      requireUint32(entry.provinceId, `${path}.provinceId`);
      if (byProvince.has(entry.provinceId)) {
        throw new RangeError(`${path}.provinceId ${String(entry.provinceId)} is duplicated`);
      }
      byProvince.set(entry.provinceId, index);
      requirePolityReference(entry.ownerPolityId, `${path}.ownerPolityId`, knownPolityIds);
      if (entry.controllerPolityId !== undefined) {
        requirePolityReference(
          entry.controllerPolityId,
          `${path}.controllerPolityId`,
          knownPolityIds,
        );
      }
      if (entry.controlledSinceDay !== undefined && entry.controlledSinceDay !== null) {
        assertValidDayIndex(entry.controlledSinceDay);
      }
      for (const claimant of entry.claimantPolityIds ?? []) {
        requirePolityReference(claimant, `${path}.claimantPolityIds`, knownPolityIds);
      }
      if (entry.specialStatus !== undefined && !isSpecialStatus(entry.specialStatus)) {
        throw new RangeError(`${path}.specialStatus is not a supported status`);
      }
    }
    if (byProvince.size !== input.definitions.length) {
      throw new RangeError(
        "scenario.provinces.ownership must describe every province exactly once",
      );
    }
    for (const definition of input.definitions) {
      if (!byProvince.has(definition.provinceId)) {
        throw new RangeError(
          `scenario.provinces.ownership is missing province ${String(definition.provinceId)}`,
        );
      }
    }
  }
}

function sortUniqueIds(ids: readonly Id[], path: string): Id[] {
  const sorted = [...ids].sort((left, right) => left - right);
  for (let index = 0; index < sorted.length; index += 1) {
    requireUint32(sorted[index], `${path}[${String(index)}]`);
    if (index > 0 && sorted[index] === sorted[index - 1]) {
      throw new RangeError(`${path} must not repeat polity ${String(sorted[index])}`);
    }
  }
  return sorted;
}

/** Build authoritative province state from validated scenario content. */
export function createProvinceState(
  input: ProvinceScenarioInput,
  startDayIndex: Day,
): ProvinceState {
  assertValidDayIndex(startDayIndex);
  const initialByProvince = new Map(
    (input.ownership ?? []).map((entry) => [entry.provinceId, entry] as const),
  );
  const ownership: ProvinceOwnership[] = [...input.definitions]
    .sort((left, right) => left.provinceId - right.provinceId)
    .map((definition) => {
      const initial = initialByProvince.get(definition.provinceId);
      const owner = initial?.ownerPolityId ?? definition.initialOwnerPolityId;
      const controller = initial?.controllerPolityId ?? owner;
      const controlledSinceDay =
        controller === owner ? null : (initial?.controlledSinceDay ?? startDayIndex);
      if (controller === owner && controlledSinceDay !== null) {
        throw new RangeError(
          `province ${definition.key} declares a control date while the owner controls it`,
        );
      }
      const claims = sortUniqueIds(
        initial?.claimantPolityIds ?? [],
        `province ${definition.key} claimantPolityIds`,
      );
      if (claims.includes(owner)) {
        throw new RangeError(`province ${definition.key} cannot claim its own owner`);
      }
      return {
        provinceId: definition.provinceId,
        ownerPolityId: owner,
        controllerPolityId: controller,
        controlledSinceDay,
        claimantPolityIds: claims,
        specialStatus:
          initial?.specialStatus ??
          (controller === owner ? definition.initialSpecialStatus : "occupied"),
      };
    });
  return {
    enabled: true,
    ownership,
    transfers: [],
    nextTransferId: 1,
  };
}

/**
 * Build ownership-only province state for a scenario without province definitions
 * (synthetic fixtures). Every listed province is owned and controlled by the given
 * polity, with no claims and ordinary status.
 */
export function createProvinceStateFromOwners(
  owners: readonly { readonly provinceId: Id; readonly ownerPolityId: Id }[],
): ProvinceState {
  const ownership: ProvinceOwnership[] = [...owners]
    .sort((left, right) => left.provinceId - right.provinceId)
    .map((entry) => ({
      provinceId: entry.provinceId,
      ownerPolityId: entry.ownerPolityId,
      controllerPolityId: entry.ownerPolityId,
      controlledSinceDay: null,
      claimantPolityIds: [],
      specialStatus: "ordinary",
    }));
  for (let index = 1; index < ownership.length; index += 1) {
    if (ownership[index]!.provinceId === ownership[index - 1]!.provinceId) {
      throw new RangeError(
        `province ${String(ownership[index]!.provinceId)} is owned by more than one country`,
      );
    }
  }
  return { enabled: true, ownership, transfers: [], nextTransferId: 1 };
}

/** Validate authoritative province state. Never repairs values. */
export function assertValidProvinceState(state: ProvinceState): void {
  const record = requireRecord(state, "world.provinces");
  if (typeof record.enabled !== "boolean") {
    throw new TypeError("world.provinces.enabled must be a boolean");
  }
  const rawOwnership = requireArray(record.ownership, "world.provinces.ownership");
  const rawTransfers = requireArray(record.transfers, "world.provinces.transfers");
  requireInteger(record.nextTransferId, "world.provinces.nextTransferId", 1, Number.MAX_SAFE_INTEGER);
  if (!record.enabled) {
    if (rawOwnership.length !== 0 || rawTransfers.length !== 0) {
      throw new RangeError("world.provinces must be empty when disabled");
    }
    return;
  }
  if (rawOwnership.length === 0) {
    throw new RangeError("world.provinces.ownership must not be empty when enabled");
  }
  if (rawOwnership.length > MAX_PROVINCES) {
    throw new RangeError("world.provinces.ownership exceeds the province limit");
  }
  let previousProvinceId = -1;
  for (let index = 0; index < rawOwnership.length; index += 1) {
    const entry = rawOwnership[index] as ProvinceOwnership;
    const path = `world.provinces.ownership[${String(index)}]`;
    requireUint32(entry.provinceId, `${path}.provinceId`);
    if (entry.provinceId <= previousProvinceId) {
      throw new RangeError(`${path}.provinceId must be strictly ascending`);
    }
    previousProvinceId = entry.provinceId;
    requireUint32(entry.ownerPolityId, `${path}.ownerPolityId`);
    requireUint32(entry.controllerPolityId, `${path}.controllerPolityId`);
    if (entry.controllerPolityId === entry.ownerPolityId) {
      if (entry.controlledSinceDay !== null) {
        throw new RangeError(`${path}.controlledSinceDay must be null while the owner controls`);
      }
    } else {
      if (entry.controlledSinceDay === null) {
        throw new RangeError(`${path}.controlledSinceDay is required for a non-owner controller`);
      }
      assertValidDayIndex(entry.controlledSinceDay);
    }
    if (!Array.isArray(entry.claimantPolityIds)) {
      throw new TypeError(`${path}.claimantPolityIds must be an array`);
    }
    if (entry.claimantPolityIds.length > MAX_PROVINCE_CLAIMS) {
      throw new RangeError(`${path}.claimantPolityIds exceeds the claim limit`);
    }
    let previousClaim = -1;
    for (let claimIndex = 0; claimIndex < entry.claimantPolityIds.length; claimIndex += 1) {
      const claimant = entry.claimantPolityIds[claimIndex] as Id;
      requireUint32(claimant, `${path}.claimantPolityIds[${String(claimIndex)}]`);
      if (claimant <= previousClaim) {
        throw new RangeError(`${path}.claimantPolityIds must be strictly ascending`);
      }
      if (claimant === entry.ownerPolityId) {
        throw new RangeError(`${path}.claimantPolityIds must not include the owner`);
      }
      previousClaim = claimant;
    }
    if (!isSpecialStatus(entry.specialStatus)) {
      throw new RangeError(`${path}.specialStatus is not a supported status`);
    }
  }
  if (rawTransfers.length > MAX_PROVINCE_TRANSFERS) {
    throw new RangeError("world.provinces.transfers exceeds the history limit");
  }
  let previousTransferId = 0;
  for (let index = 0; index < rawTransfers.length; index += 1) {
    const transfer = rawTransfers[index] as ProvinceTransferRecord;
    const path = `world.provinces.transfers[${String(index)}]`;
    requireUint32(transfer.id, `${path}.id`);
    if (transfer.id <= previousTransferId) {
      throw new RangeError(`${path}.id must be strictly ascending`);
    }
    previousTransferId = transfer.id;
    assertValidDayIndex(transfer.day);
    if (!isTransferKind(transfer.kind)) {
      throw new RangeError(`${path}.kind is not a supported transfer kind`);
    }
    if (transfer.fromPolityId !== null) {
      requireUint32(transfer.fromPolityId, `${path}.fromPolityId`);
    }
    requireUint32(transfer.toPolityId, `${path}.toPolityId`);
    const ids = requireArray(transfer.provinceIds, `${path}.provinceIds`);
    if (ids.length === 0) throw new RangeError(`${path}.provinceIds must not be empty`);
    for (let provinceIndex = 0; provinceIndex < ids.length; provinceIndex += 1) {
      requireUint32(ids[provinceIndex], `${path}.provinceIds[${String(provinceIndex)}]`);
      if (provinceIndex > 0 && ids[provinceIndex] === ids[provinceIndex - 1]) {
        throw new RangeError(`${path}.provinceIds must be unique and ascending`);
      }
    }
    requireString(transfer.note, `${path}.note`, { maxLength: MAX_PROVINCE_NOTE_LENGTH });
  }
}

/** True when the province exists in the authoritative state. */
export function hasProvince(world: World, provinceId: Id): boolean {
  return findProvinceOwnership(world, provinceId) !== undefined;
}

/** Return one province's ownership record, or undefined. */
export function findProvinceOwnership(
  world: World,
  provinceId: Id,
): ProvinceOwnership | undefined {
  const ownership = world.provinces.ownership;
  let low = 0;
  let high = ownership.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const entry = ownership[middle];
    if (entry === undefined) return undefined;
    if (entry.provinceId === provinceId) return entry;
    if (entry.provinceId < provinceId) low = middle + 1;
    else high = middle - 1;
  }
  return undefined;
}

/** Return the mutable province record or throw. */
function requireProvince(world: World, provinceId: Id): ProvinceOwnership {
  const entry = findProvinceOwnership(world, provinceId);
  if (entry === undefined) {
    throw new RangeError(`province ${String(provinceId)} is not registered`);
  }
  return entry;
}

/** All province ids currently owned by a polity, ascending. */
export function provinceIdsOwnedBy(world: World, polityId: Id): Id[] {
  return world.provinces.ownership
    .filter((entry) => entry.ownerPolityId === polityId)
    .map((entry) => entry.provinceId);
}

/** All province ids effectively controlled by a polity, ascending. */
export function provinceIdsControlledBy(world: World, polityId: Id): Id[] {
  return world.provinces.ownership
    .filter((entry) => entry.controllerPolityId === polityId)
    .map((entry) => entry.provinceId);
}

function appendTransfer(
  world: World,
  transfer: ProvinceTransferRecord,
): void {
  world.provinces.transfers.push(transfer);
  if (world.provinces.transfers.length > MAX_PROVINCE_TRANSFERS) {
    world.provinces.transfers.splice(
      0,
      world.provinces.transfers.length - MAX_PROVINCE_TRANSFERS,
    );
  }
}

function normalizeProvinceIds(world: World, provinceIds: readonly Id[]): Id[] {
  const unique = [...new Set(provinceIds)].sort((left, right) => left - right);
  if (unique.length === 0) throw new RangeError("provinceIds must not be empty");
  for (const provinceId of unique) requireProvince(world, provinceId);
  return unique;
}

/**
 * Apply a legal ownership transfer.
 *
 * The province geometry and id are untouched. Legal ownership, effective
 * control, claims and special status are updated atomically, and one bounded
 * audit record is appended. The caller is responsible for the political
 * justification (treaty, annexation, independence, ...); this function only
 * enforces structural validity and determinism.
 */
export function transferProvinceOwnership(
  world: World,
  request: ProvinceOwnershipTransferRequest,
): ProvinceTransferRecord {
  if (!world.provinces.enabled) {
    throw new RangeError("provincial ownership is not enabled in this world");
  }
  assertValidDayIndex(request.day);
  if (!isTransferKind(request.kind)) {
    throw new RangeError("request.kind is not a supported transfer kind");
  }
  requireUint32(request.toPolityId, "request.toPolityId");
  const provinceIds = normalizeProvinceIds(world, request.provinceIds);
  const note = requireString(request.note, "request.note", {
    maxLength: MAX_PROVINCE_NOTE_LENGTH,
  });
  const previousOwners = new Set<Id>();
  for (const provinceId of provinceIds) {
    previousOwners.add(requireProvince(world, provinceId).ownerPolityId);
  }
  for (const provinceId of provinceIds) {
    const entry = requireProvince(world, provinceId);
    if (entry.ownerPolityId === request.toPolityId && request.preserveController !== true) {
      // A no-op legal transfer is not an error, but it must not create a state
      // where the controller silently differs from the owner.
      continue;
    }
    entry.ownerPolityId = request.toPolityId;
    if (request.clearRecipientClaim !== false) {
      entry.claimantPolityIds = entry.claimantPolityIds.filter(
        (claimant) => claimant !== request.toPolityId,
      );
    }
    if (request.preserveController !== true) {
      entry.controllerPolityId = request.toPolityId;
      entry.controlledSinceDay = null;
      entry.specialStatus =
        entry.specialStatus === "occupied" ? "ordinary" : entry.specialStatus;
    } else if (entry.controllerPolityId !== entry.ownerPolityId && entry.controlledSinceDay === null) {
      // The legal owner changed but the old owner still holds the ground. The
      // previous control began when the ownership changed, at the latest.
      entry.controlledSinceDay = request.day;
      entry.specialStatus = "occupied";
    }
  }
  const transfer: ProvinceTransferRecord = {
    id: world.provinces.nextTransferId,
    day: request.day,
    provinceIds,
    fromPolityId: previousOwners.size === 1 ? ([...previousOwners][0] as Id) : null,
    toPolityId: request.toPolityId,
    kind: request.kind,
    note,
  };
  world.provinces.nextTransferId += 1;
  appendTransfer(world, transfer);
  return transfer;
}

/**
 * Change effective control without changing legal ownership.
 *
 * This is the occupation/liberation path. It is deliberately separate from
 * `transferProvinceOwnership` so an army cannot annex territory by moving in.
 */
export function setProvinceControl(
  world: World,
  request: ProvinceControlRequest,
): ProvinceTransferRecord {
  if (!world.provinces.enabled) {
    throw new RangeError("provincial ownership is not enabled in this world");
  }
  assertValidDayIndex(request.day);
  if (request.kind !== "occupation" && request.kind !== "liberation") {
    throw new RangeError("request.kind must be occupation or liberation");
  }
  const provinceIds = normalizeProvinceIds(world, request.provinceIds);
  const note = requireString(request.note, "request.note", {
    maxLength: MAX_PROVINCE_NOTE_LENGTH,
  });
  const previousController = new Set<Id>();
  const ownerIds = new Set<Id>();
  for (const provinceId of provinceIds) {
    const entry = requireProvince(world, provinceId);
    previousController.add(entry.controllerPolityId);
    ownerIds.add(entry.ownerPolityId);
    const controller = request.controllerPolityId ?? entry.ownerPolityId;
    requireUint32(controller, "request.controllerPolityId");
    if (controller === entry.ownerPolityId) {
      entry.controllerPolityId = entry.ownerPolityId;
      entry.controlledSinceDay = null;
      entry.specialStatus =
        entry.specialStatus === "occupied" ? "ordinary" : entry.specialStatus;
    } else {
      entry.controllerPolityId = controller;
      entry.controlledSinceDay = request.day;
      entry.specialStatus = "occupied";
    }
  }
  const transfer: ProvinceTransferRecord = {
    id: world.provinces.nextTransferId,
    day: request.day,
    provinceIds,
    fromPolityId:
      previousController.size === 1 ? ([...previousController][0] as Id) : null,
    toPolityId:
      request.controllerPolityId ??
      (ownerIds.size === 1 ? ([...ownerIds][0] as Id) : 0),
    kind: request.kind,
    note,
  };
  world.provinces.nextTransferId += 1;
  appendTransfer(world, transfer);
  return transfer;
}

/** Add a formal claim to a province. Claims are sorted and never imply ownership. */
export function addProvinceClaim(world: World, provinceId: Id, claimantPolityId: Id): void {
  if (!world.provinces.enabled) throw new RangeError("provincial ownership is not enabled");
  requireUint32(claimantPolityId, "claimantPolityId");
  const entry = requireProvince(world, provinceId);
  if (claimantPolityId === entry.ownerPolityId) {
    throw new RangeError("the owner cannot be registered as a claimant");
  }
  if (entry.claimantPolityIds.includes(claimantPolityId)) return;
  if (entry.claimantPolityIds.length >= MAX_PROVINCE_CLAIMS) {
    throw new RangeError("the province claim limit is reached");
  }
  entry.claimantPolityIds.push(claimantPolityId);
  entry.claimantPolityIds.sort((left, right) => left - right);
}

/** Remove a formal claim; a no-op when the claimant is not registered. */
export function removeProvinceClaim(world: World, provinceId: Id, claimantPolityId: Id): void {
  if (!world.provinces.enabled) throw new RangeError("provincial ownership is not enabled");
  requireUint32(claimantPolityId, "claimantPolityId");
  const entry = requireProvince(world, provinceId);
  entry.claimantPolityIds = entry.claimantPolityIds.filter(
    (claimant) => claimant !== claimantPolityId,
  );
}

/** Set a province's informational special administrative status. */
export function setProvinceSpecialStatus(
  world: World,
  provinceId: Id,
  status: ProvinceSpecialStatus,
): void {
  if (!world.provinces.enabled) throw new RangeError("provincial ownership is not enabled");
  if (!isSpecialStatus(status)) throw new RangeError("status is not a supported province status");
  const entry = requireProvince(world, provinceId);
  entry.specialStatus = status;
}

/** Non-mutating view of one province, used by tests and selectors. */
export function provinceOwnedBy(world: World, provinceId: Id): Id | null {
  return findProvinceOwnership(world, provinceId)?.ownerPolityId ?? null;
}

/** Non-mutating view of effective control. */
export function provinceControlledBy(world: World, provinceId: Id): Id | null {
  return findProvinceOwnership(world, provinceId)?.controllerPolityId ?? null;
}
