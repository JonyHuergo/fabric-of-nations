/**
 * P5 (D-121, D-143 §4): state of the natural-resource deposits — types, the empty
 * state, copy, validation and save codec. Kept free of simulation imports so the
 * world and save modules depend on it without a cycle.
 *
 * A deposit is one stock of one resource in one province: coal, oil, gas, iron ore,
 * copper ore, bauxite, tin, gold, silver, nitrate, uranium or standing timber. Its
 * physical stock is `initialStock` (the resource's unit, `RESOURCE_UNITS`); the
 * cumulative extraction is `extracted`, so the remaining stock
 * `initialStock − extracted` is conserved by construction and never negative.
 * `quality` (0..1] scales the output of the workers who extract it (ore grade, coal
 * rank, field quality). A hidden deposit (`discovered: false`) cannot be extracted.
 */

import { requireArray, requireFiniteNumber, requireInteger, requireRecord } from "../validation.js";
import type { Day, Id } from "../types.js";

/** P5: the resource kinds a deposit can hold. */
export const RESOURCE_KINDS = [
  "coal",
  "oil",
  "gas",
  "iron",
  "copper",
  "bauxite",
  "tin",
  "gold",
  "silver",
  "nitrate",
  "uranium",
  "timber",
] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];

/** Physical unit of each resource's stock. */
export const RESOURCE_UNITS: Readonly<Record<ResourceKind, string>> = {
  coal: "t",
  oil: "t",
  gas: "thousand m³",
  iron: "t Fe",
  copper: "t Cu",
  bauxite: "t",
  tin: "t Sn",
  gold: "kg",
  silver: "kg",
  nitrate: "t N",
  uranium: "t U",
  timber: "m³",
};

export interface Deposit {
  readonly id: Id;
  readonly provinceId: Id;
  readonly resource: ResourceKind;
  /** Extraction productivity of the deposit, (0, 1]; dimensionless. */
  readonly quality: number;
  /** Physical stock at the scenario start, in `RESOURCE_UNITS[resource]`. */
  readonly initialStock: number;
  /** Cumulative extraction, same unit; 0 ≤ extracted ≤ initialStock. */
  extracted: number;
  discovered: boolean;
  /** Day the deposit was found; null when known from the start or still hidden. */
  discoveredOnDay: Day | null;
  /** Technology the province owner must know before prospecting can find it; null = none. */
  readonly requiredTechnologyId: Id | null;
}

/** Scenario input for one deposit. */
export interface DepositInitialDef {
  readonly id: Id;
  readonly provinceId: Id;
  readonly resource: ResourceKind;
  readonly quality: number;
  readonly initialStock: number;
  readonly discovered: boolean;
  readonly requiredTechnologyId: Id | null;
}

export interface ResourceState {
  /** Deposits, ascending by id; sparse (only provinces with a deposit appear). */
  deposits: Deposit[];
}

export function emptyResourceState(): ResourceState {
  return { deposits: [] };
}

export function cloneResourceState(source: ResourceState): ResourceState {
  return { deposits: source.deposits.map((deposit) => ({ ...deposit })) };
}

/** Remaining physical stock of a deposit. */
export function depositRemaining(deposit: Deposit): number {
  return deposit.initialStock - deposit.extracted;
}

function decodeDeposit(value: unknown, path: string): Deposit {
  const record = requireRecord(value, path);
  const resource = record.resource;
  if (typeof resource !== "string" || !(RESOURCE_KINDS as readonly string[]).includes(resource)) {
    throw new RangeError(`${path}.resource must be one of ${RESOURCE_KINDS.join(", ")}`);
  }
  const quality = requireFiniteNumber(record.quality, `${path}.quality`);
  if (!(quality > 0) || quality > 1) throw new RangeError(`${path}.quality must be in (0, 1]`);
  const initialStock = requireFiniteNumber(record.initialStock, `${path}.initialStock`);
  if (!(initialStock > 0)) throw new RangeError(`${path}.initialStock must be positive`);
  const extracted = requireFiniteNumber(record.extracted, `${path}.extracted`);
  if (extracted < 0) throw new RangeError(`${path}.extracted must not be negative`);
  if (extracted > initialStock) throw new RangeError(`${path}.extracted must not exceed the initial stock`);
  if (typeof record.discovered !== "boolean") throw new TypeError(`${path}.discovered must be a boolean`);
  const discoveredOnDay =
    record.discoveredOnDay === null ? null : requireInteger(record.discoveredOnDay, `${path}.discoveredOnDay`, 0, Number.MAX_SAFE_INTEGER);
  if (!record.discovered && discoveredOnDay !== null) {
    throw new RangeError(`${path}.discoveredOnDay must be null while the deposit is hidden`);
  }
  if (!record.discovered && extracted > 0) throw new RangeError(`${path} is hidden but has been extracted`);
  const requiredTechnologyId =
    record.requiredTechnologyId === null
      ? null
      : requireInteger(record.requiredTechnologyId, `${path}.requiredTechnologyId`, 0, 0xffff_ffff);
  return {
    id: requireInteger(record.id, `${path}.id`, 0, 0xffff_ffff),
    provinceId: requireInteger(record.provinceId, `${path}.provinceId`, 0, 0xffff_ffff),
    resource: resource as ResourceKind,
    quality,
    initialStock,
    extracted,
    discovered: record.discovered,
    discoveredOnDay,
    requiredTechnologyId,
  };
}

/** Decode (and validate) a resource state: ids strictly ascending, every field valid. */
export function decodeResourceState(value: unknown, path: string): ResourceState {
  const record = requireRecord(value, path);
  const raw = requireArray(record.deposits, `${path}.deposits`);
  const deposits: Deposit[] = [];
  let previous = -1;
  for (let index = 0; index < raw.length; index += 1) {
    const deposit = decodeDeposit(raw[index], `${path}.deposits[${String(index)}]`);
    if (deposit.id <= previous) throw new RangeError(`${path}.deposits must be strictly ascending by id`);
    previous = deposit.id;
    deposits.push(deposit);
  }
  return { deposits };
}

/**
 * Validate the resource state of a world: every deposit valid, in a province that
 * exists, at most one deposit per (province, resource), and a required technology
 * that exists when the world has technology content.
 */
export function assertValidResourceState(
  state: ResourceState,
  provinceIds: ReadonlySet<Id>,
  technologyIds: ReadonlySet<Id> | null,
  path = "world.resources",
): void {
  decodeResourceState(state, path);
  const seen = new Set<string>();
  for (let index = 0; index < state.deposits.length; index += 1) {
    const deposit = state.deposits[index] as Deposit;
    const at = `${path}.deposits[${String(index)}]`;
    if (!provinceIds.has(deposit.provinceId)) throw new RangeError(`${at}.provinceId references an unknown province`);
    const key = `${String(deposit.provinceId)}:${deposit.resource}`;
    if (seen.has(key)) throw new RangeError(`${at} duplicates the ${deposit.resource} deposit of province ${String(deposit.provinceId)}`);
    seen.add(key);
    if (deposit.requiredTechnologyId !== null && technologyIds !== null && !technologyIds.has(deposit.requiredTechnologyId)) {
      throw new RangeError(`${at}.requiredTechnologyId references an unknown technology`);
    }
  }
}

/**
 * Save encoding of the deposits as columns (one array per field, entry i = deposit i):
 * one object per deposit repeated nine field names for each of about 3,800 deposits and
 * pushed the 1900 web save over the browser storage quota (D-143). The resource is its
 * index in RESOURCE_KINDS; `discovered` is 0/1; null days and technologies are -1.
 */
export interface SerializedResourceState {
  readonly columns: {
    readonly id: readonly number[];
    readonly provinceId: readonly number[];
    readonly resource: readonly number[];
    readonly quality: readonly number[];
    readonly initialStock: readonly number[];
    readonly extracted: readonly number[];
    readonly discovered: readonly number[];
    readonly discoveredOnDay: readonly number[];
    readonly requiredTechnologyId: readonly number[];
  };
}

export function encodeResourceState(state: ResourceState): SerializedResourceState {
  const deposits = state.deposits;
  return {
    columns: {
      id: deposits.map((deposit) => deposit.id),
      provinceId: deposits.map((deposit) => deposit.provinceId),
      resource: deposits.map((deposit) => RESOURCE_KINDS.indexOf(deposit.resource)),
      quality: deposits.map((deposit) => deposit.quality),
      initialStock: deposits.map((deposit) => deposit.initialStock),
      extracted: deposits.map((deposit) => deposit.extracted),
      discovered: deposits.map((deposit) => (deposit.discovered ? 1 : 0)),
      discoveredOnDay: deposits.map((deposit) => deposit.discoveredOnDay ?? -1),
      requiredTechnologyId: deposits.map((deposit) => deposit.requiredTechnologyId ?? -1),
    },
  };
}

/** Decode (and validate) the column save encoding. */
export function decodeSerializedResourceState(value: unknown, path: string): ResourceState {
  const record = requireRecord(value, path);
  const columns = requireRecord(record.columns, `${path}.columns`);
  const names = [
    "id",
    "provinceId",
    "resource",
    "quality",
    "initialStock",
    "extracted",
    "discovered",
    "discoveredOnDay",
    "requiredTechnologyId",
  ] as const;
  const arrays = Object.fromEntries(
    names.map((name) => [name, requireArray(columns[name], `${path}.columns.${name}`)]),
  ) as unknown as Record<(typeof names)[number], readonly unknown[]>;
  const count = arrays.id.length;
  for (const name of names) {
    if (arrays[name].length !== count) throw new RangeError(`${path}.columns.${name} must have ${String(count)} entries`);
  }
  const deposits: unknown[] = [];
  for (let index = 0; index < count; index += 1) {
    const resourceIndex = requireInteger(arrays.resource[index], `${path}.columns.resource[${String(index)}]`, 0, RESOURCE_KINDS.length - 1);
    const discovered = requireInteger(arrays.discovered[index], `${path}.columns.discovered[${String(index)}]`, 0, 1);
    const day = requireInteger(arrays.discoveredOnDay[index], `${path}.columns.discoveredOnDay[${String(index)}]`, -1, Number.MAX_SAFE_INTEGER);
    const technology = requireInteger(arrays.requiredTechnologyId[index], `${path}.columns.requiredTechnologyId[${String(index)}]`, -1, 0xffff_ffff);
    deposits.push({
      id: arrays.id[index],
      provinceId: arrays.provinceId[index],
      resource: RESOURCE_KINDS[resourceIndex],
      quality: arrays.quality[index],
      initialStock: arrays.initialStock[index],
      extracted: arrays.extracted[index],
      discovered: discovered === 1,
      discoveredOnDay: day < 0 ? null : day,
      requiredTechnologyId: technology < 0 ? null : technology,
    });
  }
  return decodeResourceState({ deposits }, path);
}

/** Build the state from scenario deposits (validated by the caller's world check). */
export function createResourceState(deposits: readonly DepositInitialDef[] | undefined): ResourceState {
  return {
    deposits: [...(deposits ?? [])]
      .map((deposit) => ({
        id: deposit.id,
        provinceId: deposit.provinceId,
        resource: deposit.resource,
        quality: deposit.quality,
        initialStock: deposit.initialStock,
        extracted: 0,
        discovered: deposit.discovered,
        discoveredOnDay: null,
        requiredTechnologyId: deposit.requiredTechnologyId,
      }))
      .sort((left, right) => left.id - right.id),
  };
}
