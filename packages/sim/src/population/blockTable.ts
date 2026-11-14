/**
 * D-159: the columnar population table, the authoritative store of every population block.
 *
 * A block was an object of 24 numbers and three 81-cell arrays (male and female persons by
 * single year of age, literacy by age). The 1900 world has about 20,700 of them, held twice
 * while the rollback checkpoint exists, so they were most of the live heap the garbage
 * collector traced on every full collection, and a checkpoint copied each one. The table
 * keeps the same fields as typed columns indexed by the block's position, and the age cells
 * of every block in three packed arrays (`male`, `female`, `literacyByAge`; block `p` owns
 * cells `p * SINGLE_AGE_COUNT` to `(p + 1) * SINGLE_AGE_COUNT - 1`). Columns may be longer
 * than `count` (capacity for appends); entries at and after `count` are not blocks.
 *
 * The table is plain data, cloned by copying its arrays and encoded as the same block
 * records as before (`encodeWorld`, hashes). Positions follow the former block order
 * (`world.popBlocks[p]` is position `p`).
 *
 * `PopBlock` objects remain as views (`PopBlockView`): one per block, created when the block
 * enters the table, reading and writing its position (a view holds no state of its own).
 * Its `maleByAge`, `femaleByAge` and `literacyByAge` are subarrays of the packed arrays, so
 * code reads and writes cells in place as before; assigning an array copies it into the
 * block's cells. A view stays valid while its block is in the table (it follows growth and
 * the renumbering after a retirement) and throws once the block is retired.
 * `popBlockViews(table)` is the view list, which the world exposes as `world.popBlocks`.
 */

import type { Id } from "../types.js";
import { SINGLE_AGE_COUNT } from "./constants.js";
import type { PopBlock } from "./types.js";

/** The scalar fields of a block, in column order. */
export const POP_BLOCK_SCALAR_FIELDS = [
  "id",
  "provinceId",
  "professionId",
  "literacy",
  "qualification",
  "wealthLevel",
  "financialAccountId",
  "militancy",
  "unmetSubsistenceDays",
  "unmetBasicDays",
  "comfortFulfilledDays",
  "fractionalBirthRemainder",
  "fractionalMaleBirthRemainder",
  "fractionalDeathRemainder",
  "urbanShare",
  "fertilityResidual",
  "childMortalityResidual",
  "adultMortalityResidual",
  "childMortalityLagged",
  "foodSufficiency",
  "incomeSmoothedRUSDPerCapitaDay",
  "dwellings",
  "housingReferencePersonsPerDwelling",
  "housingReferenceIncomeRUSDPerCapitaDay",
] as const;
export type PopBlockScalarField = (typeof POP_BLOCK_SCALAR_FIELDS)[number];

/** A block's fields as plain data (input of `appendPopBlock`). */
export interface PopBlockRecord {
  readonly id: number;
  readonly provinceId: number;
  readonly professionId: number;
  readonly literacy: number;
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
  readonly incomeSmoothedRUSDPerCapitaDay: number;
  readonly dwellings: number;
  readonly housingReferencePersonsPerDwelling: number;
  readonly housingReferenceIncomeRUSDPerCapitaDay: number;
  readonly maleByAge: ArrayLike<number>;
  readonly femaleByAge: ArrayLike<number>;
  readonly literacyByAge: ArrayLike<number>;
}

export interface PopulationTable {
  /** Number of blocks; positions `0..count-1`. */
  count: number;
  /** Persons by single year of age, `SINGLE_AGE_COUNT` cells per block and sex. */
  male: Uint32Array;
  female: Uint32Array;
  /** Literacy rate by single year of age, same layout. */
  literacyByAge: Float64Array;
  id: Float64Array;
  provinceId: Float64Array;
  professionId: Float64Array;
  literacy: Float64Array;
  qualification: Float64Array;
  wealthLevel: Float64Array;
  financialAccountId: Float64Array;
  militancy: Float64Array;
  unmetSubsistenceDays: Float64Array;
  unmetBasicDays: Float64Array;
  comfortFulfilledDays: Float64Array;
  fractionalBirthRemainder: Float64Array;
  fractionalMaleBirthRemainder: Float64Array;
  fractionalDeathRemainder: Float64Array;
  urbanShare: Float64Array;
  fertilityResidual: Float64Array;
  childMortalityResidual: Float64Array;
  adultMortalityResidual: Float64Array;
  childMortalityLagged: Float64Array;
  foodSufficiency: Float64Array;
  incomeSmoothedRUSDPerCapitaDay: Float64Array;
  dwellings: Float64Array;
  housingReferencePersonsPerDwelling: Float64Array;
  housingReferenceIncomeRUSDPerCapitaDay: Float64Array;
}

const AGE = SINGLE_AGE_COUNT;

/** Views of each table (derived, never serialised); see the module comment. */
const VIEWS = new WeakMap<PopulationTable, PopBlockView[]>();

export function createPopulationTable(capacity = 0): PopulationTable {
  const size = Math.max(0, Math.floor(capacity));
  const table: PopulationTable = {
    count: 0,
    male: new Uint32Array(size * AGE),
    female: new Uint32Array(size * AGE),
    literacyByAge: new Float64Array(size * AGE),
    id: new Float64Array(size),
    provinceId: new Float64Array(size),
    professionId: new Float64Array(size),
    literacy: new Float64Array(size),
    qualification: new Float64Array(size),
    wealthLevel: new Float64Array(size),
    financialAccountId: new Float64Array(size),
    militancy: new Float64Array(size),
    unmetSubsistenceDays: new Float64Array(size),
    unmetBasicDays: new Float64Array(size),
    comfortFulfilledDays: new Float64Array(size),
    fractionalBirthRemainder: new Float64Array(size),
    fractionalMaleBirthRemainder: new Float64Array(size),
    fractionalDeathRemainder: new Float64Array(size),
    urbanShare: new Float64Array(size),
    fertilityResidual: new Float64Array(size),
    childMortalityResidual: new Float64Array(size),
    adultMortalityResidual: new Float64Array(size),
    childMortalityLagged: new Float64Array(size),
    foodSufficiency: new Float64Array(size),
    incomeSmoothedRUSDPerCapitaDay: new Float64Array(size),
    dwellings: new Float64Array(size),
    housingReferencePersonsPerDwelling: new Float64Array(size),
    housingReferenceIncomeRUSDPerCapitaDay: new Float64Array(size),
  };
  VIEWS.set(table, []);
  return table;
}

/** Capacity of the table (blocks it can hold without growing). */
export function populationCapacity(table: PopulationTable): number {
  return table.id.length;
}

function grown<T extends Uint32Array | Float64Array>(column: T, length: number): T {
  const next = (column instanceof Uint32Array ? new Uint32Array(length) : new Float64Array(length)) as T;
  next.set(column);
  return next;
}

function grow(table: PopulationTable, needed: number): void {
  const capacity = populationCapacity(table);
  if (needed <= capacity) return;
  const size = Math.max(needed, 16, capacity * 2);
  table.male = grown(table.male, size * AGE);
  table.female = grown(table.female, size * AGE);
  table.literacyByAge = grown(table.literacyByAge, size * AGE);
  table.id = grown(table.id, size);
  table.provinceId = grown(table.provinceId, size);
  table.professionId = grown(table.professionId, size);
  table.literacy = grown(table.literacy, size);
  table.qualification = grown(table.qualification, size);
  table.wealthLevel = grown(table.wealthLevel, size);
  table.financialAccountId = grown(table.financialAccountId, size);
  table.militancy = grown(table.militancy, size);
  table.unmetSubsistenceDays = grown(table.unmetSubsistenceDays, size);
  table.unmetBasicDays = grown(table.unmetBasicDays, size);
  table.comfortFulfilledDays = grown(table.comfortFulfilledDays, size);
  table.fractionalBirthRemainder = grown(table.fractionalBirthRemainder, size);
  table.fractionalMaleBirthRemainder = grown(table.fractionalMaleBirthRemainder, size);
  table.fractionalDeathRemainder = grown(table.fractionalDeathRemainder, size);
  table.urbanShare = grown(table.urbanShare, size);
  table.fertilityResidual = grown(table.fertilityResidual, size);
  table.childMortalityResidual = grown(table.childMortalityResidual, size);
  table.adultMortalityResidual = grown(table.adultMortalityResidual, size);
  table.childMortalityLagged = grown(table.childMortalityLagged, size);
  table.foodSufficiency = grown(table.foodSufficiency, size);
  table.incomeSmoothedRUSDPerCapitaDay = grown(table.incomeSmoothedRUSDPerCapitaDay, size);
  table.dwellings = grown(table.dwellings, size);
  table.housingReferencePersonsPerDwelling = grown(table.housingReferencePersonsPerDwelling, size);
  table.housingReferenceIncomeRUSDPerCapitaDay = grown(table.housingReferenceIncomeRUSDPerCapitaDay, size);
  // The views' cell arrays are subarrays of the replaced buffers: point them at the new ones.
  for (const view of popBlockViews(table)) view.rebind();
}

/** Reserve room for `additional` more blocks. */
export function reservePopBlocks(table: PopulationTable, additional: number): void {
  grow(table, table.count + Math.max(0, Math.floor(additional)));
}

function copyCells(target: Uint32Array | Float64Array, offset: number, source: ArrayLike<number>, name: string, id: number): void {
  if (source.length !== AGE) {
    throw new RangeError(`popBlock ${String(id)} ${name} must have length ${String(AGE)}`);
  }
  for (let age = 0; age < AGE; age += 1) target[offset + age] = source[age] ?? Number.NaN;
}

/**
 * Append a block at position `count` and return its view. The record's values are stored
 * as given (validation is `assertValidPopBlock`'s); the cell arrays must have
 * `SINGLE_AGE_COUNT` entries. Male and female cells are stored as unsigned 32-bit integers.
 */
export function appendPopBlock(table: PopulationTable, record: PopBlockRecord): PopBlockView {
  const position = table.count;
  grow(table, position + 1);
  table.id[position] = record.id;
  table.provinceId[position] = record.provinceId;
  table.professionId[position] = record.professionId;
  table.literacy[position] = record.literacy;
  table.qualification[position] = record.qualification;
  table.wealthLevel[position] = record.wealthLevel;
  table.financialAccountId[position] = record.financialAccountId;
  table.militancy[position] = record.militancy;
  table.unmetSubsistenceDays[position] = record.unmetSubsistenceDays;
  table.unmetBasicDays[position] = record.unmetBasicDays;
  table.comfortFulfilledDays[position] = record.comfortFulfilledDays;
  table.fractionalBirthRemainder[position] = record.fractionalBirthRemainder;
  table.fractionalMaleBirthRemainder[position] = record.fractionalMaleBirthRemainder;
  table.fractionalDeathRemainder[position] = record.fractionalDeathRemainder;
  table.urbanShare[position] = record.urbanShare;
  table.fertilityResidual[position] = record.fertilityResidual;
  table.childMortalityResidual[position] = record.childMortalityResidual;
  table.adultMortalityResidual[position] = record.adultMortalityResidual;
  table.childMortalityLagged[position] = record.childMortalityLagged;
  table.foodSufficiency[position] = record.foodSufficiency;
  table.incomeSmoothedRUSDPerCapitaDay[position] = record.incomeSmoothedRUSDPerCapitaDay;
  table.dwellings[position] = record.dwellings;
  table.housingReferencePersonsPerDwelling[position] = record.housingReferencePersonsPerDwelling;
  table.housingReferenceIncomeRUSDPerCapitaDay[position] = record.housingReferenceIncomeRUSDPerCapitaDay;
  const offset = position * AGE;
  copyCells(table.male, offset, record.maleByAge, "maleByAge", record.id);
  copyCells(table.female, offset, record.femaleByAge, "femaleByAge", record.id);
  copyCells(table.literacyByAge, offset, record.literacyByAge, "literacyByAge", record.id);
  table.count = position + 1;
  const view = new PopBlockView(table, position);
  popBlockViews(table).push(view);
  return view;
}

/** A table holding `records` in order. */
export function populationTableFromRecords(records: readonly PopBlockRecord[]): PopulationTable {
  const table = createPopulationTable(records.length);
  for (const record of records) appendPopBlock(table, record);
  return table;
}

/** The views of the table's blocks, in position order (the array is kept in place). */
export function popBlockViews(table: PopulationTable): PopBlockView[] {
  let views = VIEWS.get(table);
  if (views === undefined) {
    views = [];
    VIEWS.set(table, views);
    for (let position = 0; position < table.count; position += 1) views.push(new PopBlockView(table, position));
  }
  return views;
}

/** A copy of the table (same capacity), with its own views. */
export function clonePopulationTable(table: PopulationTable): PopulationTable {
  return {
    count: table.count,
    male: table.male.slice(),
    female: table.female.slice(),
    literacyByAge: table.literacyByAge.slice(),
    id: table.id.slice(),
    provinceId: table.provinceId.slice(),
    professionId: table.professionId.slice(),
    literacy: table.literacy.slice(),
    qualification: table.qualification.slice(),
    wealthLevel: table.wealthLevel.slice(),
    financialAccountId: table.financialAccountId.slice(),
    militancy: table.militancy.slice(),
    unmetSubsistenceDays: table.unmetSubsistenceDays.slice(),
    unmetBasicDays: table.unmetBasicDays.slice(),
    comfortFulfilledDays: table.comfortFulfilledDays.slice(),
    fractionalBirthRemainder: table.fractionalBirthRemainder.slice(),
    fractionalMaleBirthRemainder: table.fractionalMaleBirthRemainder.slice(),
    fractionalDeathRemainder: table.fractionalDeathRemainder.slice(),
    urbanShare: table.urbanShare.slice(),
    fertilityResidual: table.fertilityResidual.slice(),
    childMortalityResidual: table.childMortalityResidual.slice(),
    adultMortalityResidual: table.adultMortalityResidual.slice(),
    childMortalityLagged: table.childMortalityLagged.slice(),
    foodSufficiency: table.foodSufficiency.slice(),
    incomeSmoothedRUSDPerCapitaDay: table.incomeSmoothedRUSDPerCapitaDay.slice(),
    dwellings: table.dwellings.slice(),
    housingReferencePersonsPerDwelling: table.housingReferencePersonsPerDwelling.slice(),
    housingReferenceIncomeRUSDPerCapitaDay: table.housingReferenceIncomeRUSDPerCapitaDay.slice(),
  };
}

/**
 * Copy `source`'s blocks into `target` (same count and values afterwards). Views of
 * `target` whose position still exists keep working and read `source`'s values at that
 * position; views past the new count are retired. Used to restore a snapshot.
 */
export function restorePopulationTable(target: PopulationTable, source: PopulationTable): void {
  const views = popBlockViews(target);
  target.male = source.male.slice();
  target.female = source.female.slice();
  target.literacyByAge = source.literacyByAge.slice();
  target.id = source.id.slice();
  target.provinceId = source.provinceId.slice();
  target.professionId = source.professionId.slice();
  target.literacy = source.literacy.slice();
  target.qualification = source.qualification.slice();
  target.wealthLevel = source.wealthLevel.slice();
  target.financialAccountId = source.financialAccountId.slice();
  target.militancy = source.militancy.slice();
  target.unmetSubsistenceDays = source.unmetSubsistenceDays.slice();
  target.unmetBasicDays = source.unmetBasicDays.slice();
  target.comfortFulfilledDays = source.comfortFulfilledDays.slice();
  target.fractionalBirthRemainder = source.fractionalBirthRemainder.slice();
  target.fractionalMaleBirthRemainder = source.fractionalMaleBirthRemainder.slice();
  target.fractionalDeathRemainder = source.fractionalDeathRemainder.slice();
  target.urbanShare = source.urbanShare.slice();
  target.fertilityResidual = source.fertilityResidual.slice();
  target.childMortalityResidual = source.childMortalityResidual.slice();
  target.adultMortalityResidual = source.adultMortalityResidual.slice();
  target.childMortalityLagged = source.childMortalityLagged.slice();
  target.foodSufficiency = source.foodSufficiency.slice();
  target.incomeSmoothedRUSDPerCapitaDay = source.incomeSmoothedRUSDPerCapitaDay.slice();
  target.dwellings = source.dwellings.slice();
  target.housingReferencePersonsPerDwelling = source.housingReferencePersonsPerDwelling.slice();
  target.housingReferenceIncomeRUSDPerCapitaDay = source.housingReferenceIncomeRUSDPerCapitaDay.slice();
  target.count = source.count;
  for (let position = views.length - 1; position >= source.count; position -= 1) (views[position] as PopBlockView).retire();
  if (views.length > source.count) views.length = source.count;
  for (const view of views) view.rebind();
  for (let position = views.length; position < source.count; position += 1) views.push(new PopBlockView(target, position));
}

/**
 * Remove the blocks whose ids are in `ids`, keeping the others in order. Their views are
 * retired; the remaining views follow their blocks to the new positions. Returns the
 * number removed.
 */
export function removePopBlocks(table: PopulationTable, ids: ReadonlySet<Id>): number {
  const views = popBlockViews(table);
  let write = 0;
  for (let read = 0; read < table.count; read += 1) {
    const view = views[read] as PopBlockView;
    if (ids.has(table.id[read] ?? Number.NaN)) {
      view.retire();
      continue;
    }
    if (write !== read) {
      table.id[write] = table.id[read] ?? 0;
      table.provinceId[write] = table.provinceId[read] ?? 0;
      table.professionId[write] = table.professionId[read] ?? 0;
      table.literacy[write] = table.literacy[read] ?? 0;
      table.qualification[write] = table.qualification[read] ?? 0;
      table.wealthLevel[write] = table.wealthLevel[read] ?? 0;
      table.financialAccountId[write] = table.financialAccountId[read] ?? 0;
      table.militancy[write] = table.militancy[read] ?? 0;
      table.unmetSubsistenceDays[write] = table.unmetSubsistenceDays[read] ?? 0;
      table.unmetBasicDays[write] = table.unmetBasicDays[read] ?? 0;
      table.comfortFulfilledDays[write] = table.comfortFulfilledDays[read] ?? 0;
      table.fractionalBirthRemainder[write] = table.fractionalBirthRemainder[read] ?? 0;
      table.fractionalMaleBirthRemainder[write] = table.fractionalMaleBirthRemainder[read] ?? 0;
      table.fractionalDeathRemainder[write] = table.fractionalDeathRemainder[read] ?? 0;
      table.urbanShare[write] = table.urbanShare[read] ?? 0;
      table.fertilityResidual[write] = table.fertilityResidual[read] ?? 0;
      table.childMortalityResidual[write] = table.childMortalityResidual[read] ?? 0;
      table.adultMortalityResidual[write] = table.adultMortalityResidual[read] ?? 0;
      table.childMortalityLagged[write] = table.childMortalityLagged[read] ?? 0;
      table.foodSufficiency[write] = table.foodSufficiency[read] ?? 0;
      table.incomeSmoothedRUSDPerCapitaDay[write] = table.incomeSmoothedRUSDPerCapitaDay[read] ?? 0;
      table.dwellings[write] = table.dwellings[read] ?? 0;
      table.housingReferencePersonsPerDwelling[write] = table.housingReferencePersonsPerDwelling[read] ?? 0;
      table.housingReferenceIncomeRUSDPerCapitaDay[write] = table.housingReferenceIncomeRUSDPerCapitaDay[read] ?? 0;
      table.male.copyWithin(write * AGE, read * AGE, (read + 1) * AGE);
      table.female.copyWithin(write * AGE, read * AGE, (read + 1) * AGE);
      table.literacyByAge.copyWithin(write * AGE, read * AGE, (read + 1) * AGE);
      view.moveTo(write);
    }
    views[write] = view;
    write += 1;
  }
  const removed = table.count - write;
  table.count = write;
  views.length = write;
  return removed;
}

/** Reorder the blocks by ascending id (stable). Views follow their blocks. */
export function sortPopBlocksById(table: PopulationTable): void {
  let sorted = true;
  for (let position = 1; position < table.count; position += 1) {
    if ((table.id[position - 1] ?? 0) > (table.id[position] ?? 0)) {
      sorted = false;
      break;
    }
  }
  if (sorted) return;
  const order = Array.from({ length: table.count }, (_, position) => position);
  order.sort((left, right) => (table.id[left] ?? 0) - (table.id[right] ?? 0) || left - right);
  reorderPopBlocks(table, order);
}

/**
 * Reorder the blocks: position `p` afterwards holds the block that was at `order[p]`
 * (`order` is a permutation of `0..count-1`). Views follow their blocks.
 */
export function reorderPopBlocks(table: PopulationTable, order: readonly number[]): void {
  if (order.length !== table.count) throw new RangeError("block order must list every position once");
  const seen = new Uint8Array(table.count);
  for (const position of order) {
    if (!Number.isInteger(position) || position < 0 || position >= table.count || seen[position] === 1) {
      throw new RangeError("block order must list every position once");
    }
    seen[position] = 1;
  }
  const views = popBlockViews(table);
  const source = clonePopulationTable(table);
  for (let target = 0; target < order.length; target += 1) {
    const from = order[target] ?? 0;
    table.id[target] = source.id[from] ?? 0;
    table.provinceId[target] = source.provinceId[from] ?? 0;
    table.professionId[target] = source.professionId[from] ?? 0;
    table.literacy[target] = source.literacy[from] ?? 0;
    table.qualification[target] = source.qualification[from] ?? 0;
    table.wealthLevel[target] = source.wealthLevel[from] ?? 0;
    table.financialAccountId[target] = source.financialAccountId[from] ?? 0;
    table.militancy[target] = source.militancy[from] ?? 0;
    table.unmetSubsistenceDays[target] = source.unmetSubsistenceDays[from] ?? 0;
    table.unmetBasicDays[target] = source.unmetBasicDays[from] ?? 0;
    table.comfortFulfilledDays[target] = source.comfortFulfilledDays[from] ?? 0;
    table.fractionalBirthRemainder[target] = source.fractionalBirthRemainder[from] ?? 0;
    table.fractionalMaleBirthRemainder[target] = source.fractionalMaleBirthRemainder[from] ?? 0;
    table.fractionalDeathRemainder[target] = source.fractionalDeathRemainder[from] ?? 0;
    table.urbanShare[target] = source.urbanShare[from] ?? 0;
    table.fertilityResidual[target] = source.fertilityResidual[from] ?? 0;
    table.childMortalityResidual[target] = source.childMortalityResidual[from] ?? 0;
    table.adultMortalityResidual[target] = source.adultMortalityResidual[from] ?? 0;
    table.childMortalityLagged[target] = source.childMortalityLagged[from] ?? 0;
    table.foodSufficiency[target] = source.foodSufficiency[from] ?? 0;
    table.incomeSmoothedRUSDPerCapitaDay[target] = source.incomeSmoothedRUSDPerCapitaDay[from] ?? 0;
    table.dwellings[target] = source.dwellings[from] ?? 0;
    table.housingReferencePersonsPerDwelling[target] = source.housingReferencePersonsPerDwelling[from] ?? 0;
    table.housingReferenceIncomeRUSDPerCapitaDay[target] = source.housingReferenceIncomeRUSDPerCapitaDay[from] ?? 0;
    table.male.set(source.male.subarray(from * AGE, (from + 1) * AGE), target * AGE);
    table.female.set(source.female.subarray(from * AGE, (from + 1) * AGE), target * AGE);
    table.literacyByAge.set(source.literacyByAge.subarray(from * AGE, (from + 1) * AGE), target * AGE);
  }
  const previous = [...views];
  for (let target = 0; target < order.length; target += 1) {
    const view = previous[order[target] ?? 0] as PopBlockView;
    view.moveTo(target);
    views[target] = view;
  }
}

/** The block at `position` as plain data (cells copied). */
export function popBlockRecordAt(table: PopulationTable, position: number): PopBlock {
  const offset = position * AGE;
  return {
    id: table.id[position] ?? 0,
    provinceId: table.provinceId[position] ?? 0,
    professionId: table.professionId[position] ?? 0,
    literacy: table.literacy[position] ?? 0,
    qualification: table.qualification[position] ?? 0,
    wealthLevel: table.wealthLevel[position] ?? 0,
    financialAccountId: table.financialAccountId[position] ?? 0,
    militancy: table.militancy[position] ?? 0,
    unmetSubsistenceDays: table.unmetSubsistenceDays[position] ?? 0,
    unmetBasicDays: table.unmetBasicDays[position] ?? 0,
    comfortFulfilledDays: table.comfortFulfilledDays[position] ?? 0,
    fractionalBirthRemainder: table.fractionalBirthRemainder[position] ?? 0,
    fractionalMaleBirthRemainder: table.fractionalMaleBirthRemainder[position] ?? 0,
    fractionalDeathRemainder: table.fractionalDeathRemainder[position] ?? 0,
    urbanShare: table.urbanShare[position] ?? 0,
    fertilityResidual: table.fertilityResidual[position] ?? 0,
    childMortalityResidual: table.childMortalityResidual[position] ?? 0,
    adultMortalityResidual: table.adultMortalityResidual[position] ?? 0,
    childMortalityLagged: table.childMortalityLagged[position] ?? 0,
    foodSufficiency: table.foodSufficiency[position] ?? 0,
    incomeSmoothedRUSDPerCapitaDay: table.incomeSmoothedRUSDPerCapitaDay[position] ?? 0,
    dwellings: table.dwellings[position] ?? 0,
    housingReferencePersonsPerDwelling: table.housingReferencePersonsPerDwelling[position] ?? 0,
    housingReferenceIncomeRUSDPerCapitaDay: table.housingReferenceIncomeRUSDPerCapitaDay[position] ?? 0,
    maleByAge: table.male.slice(offset, offset + AGE),
    femaleByAge: table.female.slice(offset, offset + AGE),
    literacyByAge: table.literacyByAge.slice(offset, offset + AGE),
  };
}

/** Every block as plain data, in position order (tests and diagnostics). */
export function popBlockRecords(table: PopulationTable): PopBlock[] {
  const records: PopBlock[] = [];
  for (let position = 0; position < table.count; position += 1) records.push(popBlockRecordAt(table, position));
  return records;
}

/** True for a value shaped like a population table (validation boundary). */
export function isPopulationTable(value: unknown): value is PopulationTable {
  if (typeof value !== "object" || value === null) return false;
  const table = value as Partial<PopulationTable>;
  if (typeof table.count !== "number" || !(table.male instanceof Uint32Array) || !(table.female instanceof Uint32Array)) return false;
  if (!(table.literacyByAge instanceof Float64Array)) return false;
  return POP_BLOCK_SCALAR_FIELDS.every((field) => table[field] instanceof Float64Array);
}

/**
 * A block of a population table: reads and writes its position (see the module comment).
 * `id` and the three cell arrays are fields (the id copied, the arrays subarrays of the
 * table's packed arrays) so that reading them costs no call; the table refreshes them
 * whenever it moves the block, and `assertValidPopulationState` checks they still point at
 * the block's own position. They must not be assigned (a cell array is written in place).
 */
export class PopBlockView implements PopBlock {
  private readonly table_: PopulationTable;
  /** The block's position in the table; -1 once retired. */
  private position_: number;
  id: number;
  maleByAge: Uint32Array;
  femaleByAge: Uint32Array;
  literacyByAge: Float64Array;

  constructor(table: PopulationTable, position: number) {
    this.table_ = table;
    this.position_ = position;
    this.id = table.id[position] ?? Number.NaN;
    this.maleByAge = table.male.subarray(position * AGE, (position + 1) * AGE);
    this.femaleByAge = table.female.subarray(position * AGE, (position + 1) * AGE);
    this.literacyByAge = table.literacyByAge.subarray(position * AGE, (position + 1) * AGE);
  }

  /** The block's position in its table. */
  get position(): number {
    return this.live();
  }

  /** The table the block belongs to. */
  get table(): PopulationTable {
    return this.table_;
  }

  /** Whether the view's fields describe its position (validation). */
  bound(): boolean {
    const position = this.position_;
    if (position < 0) return false;
    const table = this.table_;
    return (
      this.id === table.id[position] &&
      this.maleByAge.buffer === table.male.buffer &&
      this.maleByAge.byteOffset === position * AGE * Uint32Array.BYTES_PER_ELEMENT &&
      this.maleByAge.length === AGE &&
      this.femaleByAge.buffer === table.female.buffer &&
      this.femaleByAge.byteOffset === position * AGE * Uint32Array.BYTES_PER_ELEMENT &&
      this.femaleByAge.length === AGE &&
      this.literacyByAge.buffer === table.literacyByAge.buffer &&
      this.literacyByAge.byteOffset === position * AGE * Float64Array.BYTES_PER_ELEMENT &&
      this.literacyByAge.length === AGE
    );
  }

  /** @internal Point the fields at the table's current buffers and the position's id. */
  rebind(): void {
    const position = this.live();
    const table = this.table_;
    this.id = table.id[position] ?? Number.NaN;
    this.maleByAge = table.male.subarray(position * AGE, (position + 1) * AGE);
    this.femaleByAge = table.female.subarray(position * AGE, (position + 1) * AGE);
    this.literacyByAge = table.literacyByAge.subarray(position * AGE, (position + 1) * AGE);
  }

  /** @internal The block moved to `position` (its values were moved there). */
  moveTo(position: number): void {
    this.position_ = position;
    this.rebind();
  }

  /** @internal The block left the table; every later access to a scalar throws. */
  retire(): void {
    this.position_ = -1;
    this.maleByAge = new Uint32Array(0);
    this.femaleByAge = new Uint32Array(0);
    this.literacyByAge = new Float64Array(0);
  }

  private live(): number {
    const position = this.position_;
    if (position < 0) throw new RangeError("popBlock view used after its block was retired");
    return position;
  }

  private dead(): number {
    this.live();
    return Number.NaN;
  }

  get provinceId(): number {
    return this.table_.provinceId[this.position_] ?? this.dead();
  }
  set provinceId(value: number) {
    this.table_.provinceId[this.live()] = value;
  }
  get professionId(): number {
    return this.table_.professionId[this.position_] ?? this.dead();
  }
  set professionId(value: number) {
    this.table_.professionId[this.live()] = value;
  }
  get literacy(): number {
    return this.table_.literacy[this.position_] ?? this.dead();
  }
  set literacy(value: number) {
    this.table_.literacy[this.live()] = value;
  }
  get qualification(): number {
    return this.table_.qualification[this.position_] ?? this.dead();
  }
  set qualification(value: number) {
    this.table_.qualification[this.live()] = value;
  }
  get wealthLevel(): number {
    return this.table_.wealthLevel[this.position_] ?? this.dead();
  }
  set wealthLevel(value: number) {
    this.table_.wealthLevel[this.live()] = value;
  }
  get financialAccountId(): number {
    return this.table_.financialAccountId[this.position_] ?? this.dead();
  }
  set financialAccountId(value: number) {
    this.table_.financialAccountId[this.live()] = value;
  }
  get militancy(): number {
    return this.table_.militancy[this.position_] ?? this.dead();
  }
  set militancy(value: number) {
    this.table_.militancy[this.live()] = value;
  }
  get unmetSubsistenceDays(): number {
    return this.table_.unmetSubsistenceDays[this.position_] ?? this.dead();
  }
  set unmetSubsistenceDays(value: number) {
    this.table_.unmetSubsistenceDays[this.live()] = value;
  }
  get unmetBasicDays(): number {
    return this.table_.unmetBasicDays[this.position_] ?? this.dead();
  }
  set unmetBasicDays(value: number) {
    this.table_.unmetBasicDays[this.live()] = value;
  }
  get comfortFulfilledDays(): number {
    return this.table_.comfortFulfilledDays[this.position_] ?? this.dead();
  }
  set comfortFulfilledDays(value: number) {
    this.table_.comfortFulfilledDays[this.live()] = value;
  }
  get fractionalBirthRemainder(): number {
    return this.table_.fractionalBirthRemainder[this.position_] ?? this.dead();
  }
  set fractionalBirthRemainder(value: number) {
    this.table_.fractionalBirthRemainder[this.live()] = value;
  }
  get fractionalMaleBirthRemainder(): number {
    return this.table_.fractionalMaleBirthRemainder[this.position_] ?? this.dead();
  }
  set fractionalMaleBirthRemainder(value: number) {
    this.table_.fractionalMaleBirthRemainder[this.live()] = value;
  }
  get fractionalDeathRemainder(): number {
    return this.table_.fractionalDeathRemainder[this.position_] ?? this.dead();
  }
  set fractionalDeathRemainder(value: number) {
    this.table_.fractionalDeathRemainder[this.live()] = value;
  }
  get urbanShare(): number {
    return this.table_.urbanShare[this.position_] ?? this.dead();
  }
  set urbanShare(value: number) {
    this.table_.urbanShare[this.live()] = value;
  }
  get fertilityResidual(): number {
    return this.table_.fertilityResidual[this.position_] ?? this.dead();
  }
  set fertilityResidual(value: number) {
    this.table_.fertilityResidual[this.live()] = value;
  }
  get childMortalityResidual(): number {
    return this.table_.childMortalityResidual[this.position_] ?? this.dead();
  }
  set childMortalityResidual(value: number) {
    this.table_.childMortalityResidual[this.live()] = value;
  }
  get adultMortalityResidual(): number {
    return this.table_.adultMortalityResidual[this.position_] ?? this.dead();
  }
  set adultMortalityResidual(value: number) {
    this.table_.adultMortalityResidual[this.live()] = value;
  }
  get childMortalityLagged(): number {
    return this.table_.childMortalityLagged[this.position_] ?? this.dead();
  }
  set childMortalityLagged(value: number) {
    this.table_.childMortalityLagged[this.live()] = value;
  }
  get foodSufficiency(): number {
    return this.table_.foodSufficiency[this.position_] ?? this.dead();
  }
  set foodSufficiency(value: number) {
    this.table_.foodSufficiency[this.live()] = value;
  }
  get incomeSmoothedRUSDPerCapitaDay(): number {
    return this.table_.incomeSmoothedRUSDPerCapitaDay[this.position_] ?? this.dead();
  }
  set incomeSmoothedRUSDPerCapitaDay(value: number) {
    this.table_.incomeSmoothedRUSDPerCapitaDay[this.live()] = value;
  }
  get dwellings(): number {
    return this.table_.dwellings[this.position_] ?? this.dead();
  }
  set dwellings(value: number) {
    this.table_.dwellings[this.live()] = value;
  }
  get housingReferencePersonsPerDwelling(): number {
    return this.table_.housingReferencePersonsPerDwelling[this.position_] ?? this.dead();
  }
  set housingReferencePersonsPerDwelling(value: number) {
    this.table_.housingReferencePersonsPerDwelling[this.live()] = value;
  }
  get housingReferenceIncomeRUSDPerCapitaDay(): number {
    return this.table_.housingReferenceIncomeRUSDPerCapitaDay[this.position_] ?? this.dead();
  }
  set housingReferenceIncomeRUSDPerCapitaDay(value: number) {
    this.table_.housingReferenceIncomeRUSDPerCapitaDay[this.live()] = value;
  }

  /** The block as plain data (`JSON.stringify`, test output). */
  toJSON(): PopBlock {
    return popBlockRecordAt(this.table_, this.live());
  }
}

/**
 * A block as plain data: a view's values (cells copied), or a copy of a plain block. Use it
 * where code spreads a block (`{ ...block }` copies only a view's own fields).
 */
export function popBlockRecord(block: PopBlock): PopBlock {
  if (block instanceof PopBlockView) return block.toJSON();
  return {
    ...block,
    maleByAge: block.maleByAge.slice(),
    femaleByAge: block.femaleByAge.slice(),
    literacyByAge: Float64Array.from(block.literacyByAge),
  };
}

/** The world's two population fields for `table`: the table and its view list. */
export function populationFields(table: PopulationTable): { population: PopulationTable; popBlocks: readonly PopBlock[] } {
  return { population: table, popBlocks: popBlockViews(table) };
}
