/**
 * P7 (D-154): state of the labour market — the empty state, copy, structural validation
 * and save codec. Kept free of simulation imports so the world and save modules depend
 * on it without a cycle. Behaviour lives in labourMarket.ts, mobility.ts and
 * reclassify.ts.
 *
 * Structural invariants (checked here, every validation): territories one per market in
 * ascending id with finite positive wages; provinces in ascending id, each with a market,
 * finite positive differentials and a finite non-negative alternative income; ceilings
 * in [0, 1) for existing buildings, ascending; institution assignments ascending, below
 * the allocator, positive integer workers, of existing blocks and countries; retired
 * block ids ascending, unique, never a live block, below the block allocator; every live
 * block id below the allocator; at most LABOUR_HISTORY_MONTHS reports.
 */

import { requireArray, requireFiniteNumber, requireInteger, requireRecord, requireString } from "../validation.js";
import type { Id } from "../types.js";
import {
  INSTITUTION_KINDS,
  type InstitutionAssignment,
  type InstitutionKind,
  type LabourMarketState,
  type LabourMonthReport,
  type LabourProvinceState,
  type LabourTerritoryState,
  type StaffingCeiling,
} from "./types.js";

/** Monthly labour reports kept (mirrors economy/constants.ts LABOUR_HISTORY_MONTHS). */
const HISTORY_LIMIT = 12;

export function emptyLabourMarketState(): LabourMarketState {
  return {
    enabled: false,
    territories: [],
    provinces: [],
    institutionEmployment: [],
    nextInstitutionAssignmentId: 1,
    householdEmployment: [],
    nextHouseholdAssignmentId: 1,
    staffingCeilings: [],
    nextPopBlockId: 0,
    retiredPopBlockIds: [],
    history: [],
  };
}

export function cloneLabourMarketState(state: LabourMarketState): LabourMarketState {
  return {
    enabled: state.enabled,
    territories: state.territories.map((entry) => ({
      marketId: entry.marketId,
      referenceWageRUSDPerYear: [...entry.referenceWageRUSDPerYear],
      previousReferenceWageRUSDPerYear: [...entry.previousReferenceWageRUSDPerYear],
      priceIndexAtUpdate: entry.priceIndexAtUpdate,
    })),
    provinces: state.provinces.map((entry) => ({
      provinceId: entry.provinceId,
      differential: [...entry.differential],
      peasantAlternativeIncomeRUSDPerYear: entry.peasantAlternativeIncomeRUSDPerYear,
    })),
    institutionEmployment: state.institutionEmployment.map((entry) => ({ ...entry })),
    nextInstitutionAssignmentId: state.nextInstitutionAssignmentId,
    householdEmployment: state.householdEmployment.map((entry) => ({ ...entry })),
    nextHouseholdAssignmentId: state.nextHouseholdAssignmentId,
    staffingCeilings: state.staffingCeilings.map((entry) => ({ ...entry })),
    nextPopBlockId: state.nextPopBlockId,
    retiredPopBlockIds: [...state.retiredPopBlockIds],
    history: state.history.map((entry) => ({ ...entry, netByProfession: [...entry.netByProfession] })),
  };
}

function positiveFinite(value: unknown, path: string): number {
  const number = requireFiniteNumber(value, path);
  if (!(number > 0)) throw new RangeError(`${path} must be positive`);
  return number;
}

export interface LabourStateContext {
  readonly marketIds: readonly Id[];
  readonly provinceMarket: ReadonlyMap<Id, Id | null>;
  readonly buildingIds: ReadonlySet<Id>;
  readonly blockIds: ReadonlySet<Id>;
  readonly countryIds: ReadonlySet<Id>;
}

/** Structural validation of the labour-market state against the world's ids. */
export function assertValidLabourMarketState(state: LabourMarketState, context: LabourStateContext): void {
  if (typeof state.enabled !== "boolean") throw new TypeError("world.labourMarket.enabled must be a boolean");
  requireInteger(state.nextInstitutionAssignmentId, "world.labourMarket.nextInstitutionAssignmentId", 1, Number.MAX_SAFE_INTEGER);
  requireInteger(state.nextPopBlockId, "world.labourMarket.nextPopBlockId", 0, 0xffff_ffff);
  if (state.history.length > HISTORY_LIMIT) throw new RangeError(`world.labourMarket.history must hold at most ${String(HISTORY_LIMIT)} reports`);
  if (!state.enabled) {
    if (
      state.territories.length > 0 ||
      state.provinces.length > 0 ||
      state.institutionEmployment.length > 0 ||
      state.householdEmployment.length > 0 ||
      state.staffingCeilings.length > 0 ||
      state.retiredPopBlockIds.length > 0 ||
      state.history.length > 0
    ) {
      throw new RangeError("a disabled labour market must be empty");
    }
    return;
  }
  const marketIds = [...context.marketIds].sort((left, right) => left - right);
  if (state.territories.length !== marketIds.length) throw new RangeError("world.labourMarket.territories must hold one entry per market");
  let width = -1;
  state.territories.forEach((territory, index) => {
    const path = `world.labourMarket.territories[${String(index)}]`;
    if (territory.marketId !== marketIds[index]) throw new RangeError(`${path}.marketId must follow the markets in ascending id`);
    if (width < 0) width = territory.referenceWageRUSDPerYear.length;
    if (territory.referenceWageRUSDPerYear.length !== width || territory.previousReferenceWageRUSDPerYear.length !== width) {
      throw new RangeError(`${path} wage arrays must have one entry per profession`);
    }
    territory.referenceWageRUSDPerYear.forEach((wage, professionId) => positiveFinite(wage, `${path}.referenceWageRUSDPerYear[${String(professionId)}]`));
    territory.previousReferenceWageRUSDPerYear.forEach((wage, professionId) =>
      positiveFinite(wage, `${path}.previousReferenceWageRUSDPerYear[${String(professionId)}]`),
    );
    positiveFinite(territory.priceIndexAtUpdate, `${path}.priceIndexAtUpdate`);
  });
  let previousProvince = -1;
  for (const [index, province] of state.provinces.entries()) {
    const path = `world.labourMarket.provinces[${String(index)}]`;
    if (!(province.provinceId > previousProvince)) throw new RangeError(`${path} must be in ascending province id`);
    previousProvince = province.provinceId;
    if (!context.provinceMarket.has(province.provinceId) || context.provinceMarket.get(province.provinceId) === null) {
      throw new RangeError(`${path} references a province without a market`);
    }
    if (province.differential.length !== width) throw new RangeError(`${path}.differential must have one entry per profession`);
    province.differential.forEach((value, professionId) => positiveFinite(value, `${path}.differential[${String(professionId)}]`));
    const alternative = requireFiniteNumber(province.peasantAlternativeIncomeRUSDPerYear, `${path}.peasantAlternativeIncomeRUSDPerYear`);
    if (alternative < 0) throw new RangeError(`${path}.peasantAlternativeIncomeRUSDPerYear must be non-negative`);
  }
  let previousBuilding = -1;
  for (const [index, entry] of state.staffingCeilings.entries()) {
    const path = `world.labourMarket.staffingCeilings[${String(index)}]`;
    if (!(entry.buildingId > previousBuilding)) throw new RangeError(`${path} must be in ascending building id`);
    previousBuilding = entry.buildingId;
    if (!context.buildingIds.has(entry.buildingId)) throw new RangeError(`${path} references an unknown building`);
    const ceiling = requireFiniteNumber(entry.ceiling, `${path}.ceiling`);
    if (ceiling < 0 || ceiling >= 1) throw new RangeError(`${path}.ceiling must be in [0, 1)`);
  }
  let previousAssignment = 0;
  for (const [index, entry] of state.institutionEmployment.entries()) {
    const path = `world.labourMarket.institutionEmployment[${String(index)}]`;
    if (!(entry.id > previousAssignment)) throw new RangeError(`${path} must be in ascending id`);
    previousAssignment = entry.id;
    if (!(entry.id < state.nextInstitutionAssignmentId)) throw new RangeError(`${path}.id must be below the allocator`);
    requireInteger(entry.workers, `${path}.workers`, 1, Number.MAX_SAFE_INTEGER);
    if (!context.blockIds.has(entry.popBlockId)) throw new RangeError(`${path} references an unknown block`);
    if (!context.countryIds.has(entry.countryId)) throw new RangeError(`${path} references an unknown country`);
    if (!(INSTITUTION_KINDS as readonly string[]).includes(entry.institution)) throw new RangeError(`${path}.institution is unknown`);
  }
  requireInteger(state.nextHouseholdAssignmentId, "world.labourMarket.nextHouseholdAssignmentId", 1, Number.MAX_SAFE_INTEGER);
  let previousHousehold = 0;
  for (const [index, entry] of state.householdEmployment.entries()) {
    const path = `world.labourMarket.householdEmployment[${String(index)}]`;
    if (!(entry.id > previousHousehold)) throw new RangeError(`${path} must be in ascending id`);
    previousHousehold = entry.id;
    if (!(entry.id < state.nextHouseholdAssignmentId)) throw new RangeError(`${path}.id must be below the allocator`);
    requireInteger(entry.workers, `${path}.workers`, 1, Number.MAX_SAFE_INTEGER);
    if (!context.blockIds.has(entry.popBlockId)) throw new RangeError(`${path} references an unknown block`);
    if (!context.blockIds.has(entry.employerBlockId)) throw new RangeError(`${path} references an unknown employer block`);
    if (entry.employerBlockId === entry.popBlockId) throw new RangeError(`${path}: a block cannot employ itself`);
  }
  let previousRetired = -1;
  for (const id of state.retiredPopBlockIds) {
    if (!(id > previousRetired)) throw new RangeError("world.labourMarket.retiredPopBlockIds must be ascending and unique");
    previousRetired = id;
    if (context.blockIds.has(id)) throw new RangeError(`retired popBlock ${String(id)} is still live`);
    if (!(id < state.nextPopBlockId)) throw new RangeError(`retired popBlock ${String(id)} is not below the block allocator`);
  }
  for (const id of context.blockIds) {
    if (!(id < state.nextPopBlockId)) throw new RangeError(`popBlock ${String(id)} is not below the block allocator`);
  }
  for (const [index, report] of state.history.entries()) {
    const path = `world.labourMarket.history[${String(index)}]`;
    for (const field of ["mobilityPeople", "migrationPeople", "blocksCreated", "blocksRetired"] as const) {
      requireInteger(report[field], `${path}.${field}`, 0, Number.MAX_SAFE_INTEGER);
    }
    report.netByProfession.forEach((value, professionId) => requireInteger(value, `${path}.netByProfession[${String(professionId)}]`, -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER));
  }
}

// ---------------------------------------------------------------------------
// Save codec (column tables; written only when the labour market is enabled)
// ---------------------------------------------------------------------------

export interface SerializedLabourMarket {
  readonly territories: { readonly marketId: number; readonly referenceWage: readonly number[]; readonly previousReferenceWage: readonly number[]; readonly priceIndexAtUpdate: number }[];
  readonly provinceIds: readonly number[];
  readonly differentials: readonly (readonly number[])[];
  readonly peasantAlternative: readonly number[];
  readonly institutionEmployment: readonly [number, number, number, string, number][];
  readonly nextInstitutionAssignmentId: number;
  /** P7 (§4.1): [id, employer block, servant block, workers]; absent when none ever existed. */
  readonly householdEmployment?: readonly [number, number, number, number][];
  readonly nextHouseholdAssignmentId?: number;
  readonly staffingCeilings: readonly [number, number][];
  readonly nextPopBlockId: number;
  readonly retiredPopBlockIds: readonly number[];
  readonly history: readonly LabourMonthReport[];
}

export function encodeLabourMarket(state: LabourMarketState): SerializedLabourMarket {
  return {
    territories: state.territories.map((entry) => ({
      marketId: entry.marketId,
      referenceWage: [...entry.referenceWageRUSDPerYear],
      previousReferenceWage: [...entry.previousReferenceWageRUSDPerYear],
      priceIndexAtUpdate: entry.priceIndexAtUpdate,
    })),
    provinceIds: state.provinces.map((entry) => entry.provinceId),
    differentials: state.provinces.map((entry) => [...entry.differential]),
    peasantAlternative: state.provinces.map((entry) => entry.peasantAlternativeIncomeRUSDPerYear),
    institutionEmployment: state.institutionEmployment.map((entry) => [entry.id, entry.popBlockId, entry.countryId, entry.institution, entry.workers]),
    nextInstitutionAssignmentId: state.nextInstitutionAssignmentId,
    ...(state.householdEmployment.length === 0 && state.nextHouseholdAssignmentId === 1
      ? {}
      : {
          householdEmployment: state.householdEmployment.map((entry) => [entry.id, entry.employerBlockId, entry.popBlockId, entry.workers] as [number, number, number, number]),
          nextHouseholdAssignmentId: state.nextHouseholdAssignmentId,
        }),
    staffingCeilings: state.staffingCeilings.map((entry) => [entry.buildingId, entry.ceiling]),
    nextPopBlockId: state.nextPopBlockId,
    retiredPopBlockIds: [...state.retiredPopBlockIds],
    history: state.history.map((entry) => ({ ...entry, netByProfession: [...entry.netByProfession] })),
  };
}

function numberArray(value: unknown, path: string): number[] {
  return requireArray(value, path).map((entry, index) => requireFiniteNumber(entry, `${path}[${String(index)}]`));
}

export function decodeLabourMarket(value: unknown, path: string): LabourMarketState {
  if (value === undefined) return emptyLabourMarketState();
  const record = requireRecord(value, path);
  const territories: LabourTerritoryState[] = requireArray(record.territories, `${path}.territories`).map((raw, index) => {
    const entry = requireRecord(raw, `${path}.territories[${String(index)}]`);
    return {
      marketId: requireInteger(entry.marketId, `${path}.territories[${String(index)}].marketId`, 0, 0xffff_ffff),
      referenceWageRUSDPerYear: numberArray(entry.referenceWage, `${path}.territories[${String(index)}].referenceWage`),
      previousReferenceWageRUSDPerYear: numberArray(entry.previousReferenceWage, `${path}.territories[${String(index)}].previousReferenceWage`),
      priceIndexAtUpdate: requireFiniteNumber(entry.priceIndexAtUpdate, `${path}.territories[${String(index)}].priceIndexAtUpdate`),
    };
  });
  const provinceIds = numberArray(record.provinceIds, `${path}.provinceIds`);
  const differentials = requireArray(record.differentials, `${path}.differentials`);
  const alternative = numberArray(record.peasantAlternative, `${path}.peasantAlternative`);
  if (differentials.length !== provinceIds.length || alternative.length !== provinceIds.length) {
    throw new RangeError(`${path} province columns must have equal lengths`);
  }
  const provinces: LabourProvinceState[] = provinceIds.map((provinceId, index) => ({
    provinceId: requireInteger(provinceId, `${path}.provinceIds[${String(index)}]`, 0, 0xffff_ffff),
    differential: numberArray(differentials[index], `${path}.differentials[${String(index)}]`),
    peasantAlternativeIncomeRUSDPerYear: alternative[index] ?? 0,
  }));
  const institutionEmployment: InstitutionAssignment[] = requireArray(record.institutionEmployment, `${path}.institutionEmployment`).map((raw, index) => {
    const row = requireArray(raw, `${path}.institutionEmployment[${String(index)}]`);
    const institution = requireString(row[3], `${path}.institutionEmployment[${String(index)}][3]`, { minLength: 1, maxLength: 32 });
    if (!(INSTITUTION_KINDS as readonly string[]).includes(institution)) throw new RangeError(`${path}.institutionEmployment[${String(index)}] has an unknown institution`);
    return {
      id: requireInteger(row[0], `${path}.institutionEmployment[${String(index)}][0]`, 1, Number.MAX_SAFE_INTEGER),
      popBlockId: requireInteger(row[1], `${path}.institutionEmployment[${String(index)}][1]`, 0, 0xffff_ffff),
      countryId: requireInteger(row[2], `${path}.institutionEmployment[${String(index)}][2]`, 0, 0xffff_ffff),
      institution: institution as InstitutionKind,
      workers: requireInteger(row[4], `${path}.institutionEmployment[${String(index)}][4]`, 1, Number.MAX_SAFE_INTEGER),
    };
  });
  const staffingCeilings: StaffingCeiling[] = requireArray(record.staffingCeilings, `${path}.staffingCeilings`).map((raw, index) => {
    const row = requireArray(raw, `${path}.staffingCeilings[${String(index)}]`);
    return {
      buildingId: requireInteger(row[0], `${path}.staffingCeilings[${String(index)}][0]`, 0, 0xffff_ffff),
      ceiling: requireFiniteNumber(row[1], `${path}.staffingCeilings[${String(index)}][1]`),
    };
  });
  const history: LabourMonthReport[] = requireArray(record.history, `${path}.history`).map((raw, index) => {
    const entry = requireRecord(raw, `${path}.history[${String(index)}]`);
    return {
      dayIndex: requireInteger(entry.dayIndex, `${path}.history[${String(index)}].dayIndex`, 0, Number.MAX_SAFE_INTEGER),
      mobilityPeople: requireInteger(entry.mobilityPeople, `${path}.history[${String(index)}].mobilityPeople`, 0, Number.MAX_SAFE_INTEGER),
      migrationPeople: requireInteger(entry.migrationPeople, `${path}.history[${String(index)}].migrationPeople`, 0, Number.MAX_SAFE_INTEGER),
      blocksCreated: requireInteger(entry.blocksCreated, `${path}.history[${String(index)}].blocksCreated`, 0, Number.MAX_SAFE_INTEGER),
      blocksRetired: requireInteger(entry.blocksRetired, `${path}.history[${String(index)}].blocksRetired`, 0, Number.MAX_SAFE_INTEGER),
      netByProfession: numberArray(entry.netByProfession, `${path}.history[${String(index)}].netByProfession`),
    };
  });
  return {
    enabled: true,
    territories,
    provinces,
    institutionEmployment,
    nextInstitutionAssignmentId: requireInteger(record.nextInstitutionAssignmentId, `${path}.nextInstitutionAssignmentId`, 1, Number.MAX_SAFE_INTEGER),
    householdEmployment: (record.householdEmployment === undefined ? [] : requireArray(record.householdEmployment, `${path}.householdEmployment`)).map((raw, index) => {
      const row = requireArray(raw, `${path}.householdEmployment[${String(index)}]`);
      return {
        id: requireInteger(row[0], `${path}.householdEmployment[${String(index)}][0]`, 1, Number.MAX_SAFE_INTEGER),
        employerBlockId: requireInteger(row[1], `${path}.householdEmployment[${String(index)}][1]`, 0, 0xffff_ffff),
        popBlockId: requireInteger(row[2], `${path}.householdEmployment[${String(index)}][2]`, 0, 0xffff_ffff),
        workers: requireInteger(row[3], `${path}.householdEmployment[${String(index)}][3]`, 1, Number.MAX_SAFE_INTEGER),
      };
    }),
    nextHouseholdAssignmentId: record.nextHouseholdAssignmentId === undefined ? 1 : requireInteger(record.nextHouseholdAssignmentId, `${path}.nextHouseholdAssignmentId`, 1, Number.MAX_SAFE_INTEGER),
    staffingCeilings,
    nextPopBlockId: requireInteger(record.nextPopBlockId, `${path}.nextPopBlockId`, 0, 0xffff_ffff),
    retiredPopBlockIds: numberArray(record.retiredPopBlockIds, `${path}.retiredPopBlockIds`),
    history,
  };
}
