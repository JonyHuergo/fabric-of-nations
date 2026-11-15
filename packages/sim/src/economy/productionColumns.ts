/**
 * D-160: per-building production results in typed columns.
 *
 * `runProductionCore` writes one row per producing building it ran, in building-id order,
 * with the values of `BuildingProductionResult` (the objects are built from these columns in
 * full detail only). Row `r`'s inputs are `[inputStart[r], inputStart[r + 1])` and its
 * outputs `[outputStart[r], outputStart[r + 1])`, each in the order the objects list them.
 * `extractionDeposit` is -1 for a row without extraction; `outputKept` is 0 for an output
 * without own consumption. The columns are transient results of one day (never stored in
 * the world) and hold no state of their own beyond the call that fills them.
 */

import type { BuildingProductionResult, ProductionPhaseResult } from "./production.js";

export interface ProductionBuildingColumns {
  readonly rows: number;
  readonly buildingId: Float64Array;
  readonly capacityTU: Float64Array;
  readonly executedTU: Float64Array;
  readonly staffingRatio: Float64Array;
  readonly productivityFactor: Float64Array;
  readonly extractionDeposit: Float64Array;
  readonly extractionQuantity: Float64Array;
  /** `rows + 1` entries. */
  readonly inputStart: Int32Array;
  readonly inputGood: Float64Array;
  readonly inputReserved: Float64Array;
  readonly inputUsed: Float64Array;
  readonly inputReleased: Float64Array;
  /** `rows + 1` entries. */
  readonly outputStart: Int32Array;
  readonly outputGood: Float64Array;
  readonly outputQuantity: Float64Array;
  readonly outputKept: Float64Array;
}

/** Growable columns being written by one production call (scratch of that call). */
export interface ProductionColumnsBuilder {
  rows: number;
  inputs: number;
  outputs: number;
  buildingId: Float64Array;
  capacityTU: Float64Array;
  executedTU: Float64Array;
  staffingRatio: Float64Array;
  productivityFactor: Float64Array;
  extractionDeposit: Float64Array;
  extractionQuantity: Float64Array;
  inputStart: Int32Array;
  inputGood: Float64Array;
  inputReserved: Float64Array;
  inputUsed: Float64Array;
  inputReleased: Float64Array;
  outputStart: Int32Array;
  outputGood: Float64Array;
  outputQuantity: Float64Array;
  outputKept: Float64Array;
}

function grownFloat(column: Float64Array, size: number): Float64Array {
  const grown = new Float64Array(size);
  grown.set(column);
  return grown;
}

function grownInt(column: Int32Array, size: number): Int32Array {
  const grown = new Int32Array(size);
  grown.set(column);
  return grown;
}

/** Columns with room for `rows` buildings (they grow when a call writes more). */
export function createProductionColumns(rows: number): ProductionColumnsBuilder {
  const rowCapacity = Math.max(4, rows);
  const itemCapacity = Math.max(8, 2 * rows);
  return {
    rows: 0,
    inputs: 0,
    outputs: 0,
    buildingId: new Float64Array(rowCapacity),
    capacityTU: new Float64Array(rowCapacity),
    executedTU: new Float64Array(rowCapacity),
    staffingRatio: new Float64Array(rowCapacity),
    productivityFactor: new Float64Array(rowCapacity),
    extractionDeposit: new Float64Array(rowCapacity),
    extractionQuantity: new Float64Array(rowCapacity),
    inputStart: new Int32Array(rowCapacity + 1),
    inputGood: new Float64Array(itemCapacity),
    inputReserved: new Float64Array(itemCapacity),
    inputUsed: new Float64Array(itemCapacity),
    inputReleased: new Float64Array(itemCapacity),
    outputStart: new Int32Array(rowCapacity + 1),
    outputGood: new Float64Array(itemCapacity),
    outputQuantity: new Float64Array(itemCapacity),
    outputKept: new Float64Array(itemCapacity),
  };
}

/** Append one input of the row being written (the row is closed by `pushProductionRow`). */
export function pushProductionInput(
  builder: ProductionColumnsBuilder,
  goodId: number,
  reserved: number,
  used: number,
  released: number,
): void {
  const at = builder.inputs;
  if (at === builder.inputGood.length) {
    const size = at * 2;
    builder.inputGood = grownFloat(builder.inputGood, size);
    builder.inputReserved = grownFloat(builder.inputReserved, size);
    builder.inputUsed = grownFloat(builder.inputUsed, size);
    builder.inputReleased = grownFloat(builder.inputReleased, size);
  }
  builder.inputGood[at] = goodId;
  builder.inputReserved[at] = reserved;
  builder.inputUsed[at] = used;
  builder.inputReleased[at] = released;
  builder.inputs = at + 1;
}

/** Append one output of the row being written; `kept` 0 means no own consumption. */
export function pushProductionOutput(
  builder: ProductionColumnsBuilder,
  goodId: number,
  quantity: number,
  kept: number,
): void {
  const at = builder.outputs;
  if (at === builder.outputGood.length) {
    const size = at * 2;
    builder.outputGood = grownFloat(builder.outputGood, size);
    builder.outputQuantity = grownFloat(builder.outputQuantity, size);
    builder.outputKept = grownFloat(builder.outputKept, size);
  }
  builder.outputGood[at] = goodId;
  builder.outputQuantity[at] = quantity;
  builder.outputKept[at] = kept;
  builder.outputs = at + 1;
}

/**
 * Close a building's row: its inputs and outputs are those appended since the previous row.
 * `extractionDeposit` -1 means no extraction.
 */
export function pushProductionRow(
  builder: ProductionColumnsBuilder,
  buildingId: number,
  capacityTU: number,
  executedTU: number,
  staffingRatio: number,
  productivityFactor: number,
  extractionDeposit: number,
  extractionQuantity: number,
): void {
  const row = builder.rows;
  if (row === builder.buildingId.length) {
    const size = row * 2;
    builder.buildingId = grownFloat(builder.buildingId, size);
    builder.capacityTU = grownFloat(builder.capacityTU, size);
    builder.executedTU = grownFloat(builder.executedTU, size);
    builder.staffingRatio = grownFloat(builder.staffingRatio, size);
    builder.productivityFactor = grownFloat(builder.productivityFactor, size);
    builder.extractionDeposit = grownFloat(builder.extractionDeposit, size);
    builder.extractionQuantity = grownFloat(builder.extractionQuantity, size);
    builder.inputStart = grownInt(builder.inputStart, size + 1);
    builder.outputStart = grownInt(builder.outputStart, size + 1);
  }
  builder.buildingId[row] = buildingId;
  builder.capacityTU[row] = capacityTU;
  builder.executedTU[row] = executedTU;
  builder.staffingRatio[row] = staffingRatio;
  builder.productivityFactor[row] = productivityFactor;
  builder.extractionDeposit[row] = extractionDeposit;
  builder.extractionQuantity[row] = extractionQuantity;
  builder.inputStart[row + 1] = builder.inputs;
  builder.outputStart[row + 1] = builder.outputs;
  builder.rows = row + 1;
}

/** The written columns, trimmed to their counts (views, no copy). */
export function finishProductionColumns(builder: ProductionColumnsBuilder): ProductionBuildingColumns {
  const rows = builder.rows;
  return {
    rows,
    buildingId: builder.buildingId.subarray(0, rows),
    capacityTU: builder.capacityTU.subarray(0, rows),
    executedTU: builder.executedTU.subarray(0, rows),
    staffingRatio: builder.staffingRatio.subarray(0, rows),
    productivityFactor: builder.productivityFactor.subarray(0, rows),
    extractionDeposit: builder.extractionDeposit.subarray(0, rows),
    extractionQuantity: builder.extractionQuantity.subarray(0, rows),
    inputStart: builder.inputStart.subarray(0, rows + 1),
    inputGood: builder.inputGood.subarray(0, builder.inputs),
    inputReserved: builder.inputReserved.subarray(0, builder.inputs),
    inputUsed: builder.inputUsed.subarray(0, builder.inputs),
    inputReleased: builder.inputReleased.subarray(0, builder.inputs),
    outputStart: builder.outputStart.subarray(0, rows + 1),
    outputGood: builder.outputGood.subarray(0, builder.outputs),
    outputQuantity: builder.outputQuantity.subarray(0, builder.outputs),
    outputKept: builder.outputKept.subarray(0, builder.outputs),
  };
}

function copyRow(builder: ProductionColumnsBuilder, source: ProductionBuildingColumns, row: number): void {
  for (let item = source.inputStart[row] ?? 0; item < (source.inputStart[row + 1] ?? 0); item += 1) {
    pushProductionInput(
      builder,
      source.inputGood[item] ?? 0,
      source.inputReserved[item] ?? 0,
      source.inputUsed[item] ?? 0,
      source.inputReleased[item] ?? 0,
    );
  }
  for (let item = source.outputStart[row] ?? 0; item < (source.outputStart[row + 1] ?? 0); item += 1) {
    pushProductionOutput(builder, source.outputGood[item] ?? 0, source.outputQuantity[item] ?? 0, source.outputKept[item] ?? 0);
  }
  pushProductionRow(
    builder,
    source.buildingId[row] ?? 0,
    source.capacityTU[row] ?? 0,
    source.executedTU[row] ?? 0,
    source.staffingRatio[row] ?? 0,
    source.productivityFactor[row] ?? 0,
    source.extractionDeposit[row] ?? -1,
    source.extractionQuantity[row] ?? 0,
  );
}

/**
 * The rows of two production waves in ascending building id (the order the former stable
 * sort of the concatenated objects gave; a building runs in one wave only, and on a tie the
 * first wave's row comes first, as that sort kept it).
 */
export function mergeProductionColumns(
  first: ProductionBuildingColumns,
  second: ProductionBuildingColumns,
): ProductionBuildingColumns {
  const builder = createProductionColumns(first.rows + second.rows);
  let left = 0;
  let right = 0;
  while (left < first.rows || right < second.rows) {
    const takeFirst =
      right >= second.rows || (left < first.rows && (first.buildingId[left] ?? 0) <= (second.buildingId[right] ?? 0));
    if (takeFirst) {
      copyRow(builder, first, left);
      left += 1;
    } else {
      copyRow(builder, second, right);
      right += 1;
    }
  }
  return finishProductionColumns(builder);
}

/** The building result objects of the columns (full detail; the former object shapes). */
export function productionBuildingObjects(columns: ProductionBuildingColumns): BuildingProductionResult[] {
  const objects: BuildingProductionResult[] = [];
  for (let row = 0; row < columns.rows; row += 1) {
    const inputs: BuildingProductionResult["inputs"][number][] = [];
    for (let item = columns.inputStart[row] ?? 0; item < (columns.inputStart[row + 1] ?? 0); item += 1) {
      inputs.push({
        goodId: columns.inputGood[item] ?? 0,
        reserved: columns.inputReserved[item] ?? 0,
        used: columns.inputUsed[item] ?? 0,
        released: columns.inputReleased[item] ?? 0,
      });
    }
    const outputs: BuildingProductionResult["outputs"][number][] = [];
    for (let item = columns.outputStart[row] ?? 0; item < (columns.outputStart[row + 1] ?? 0); item += 1) {
      const kept = columns.outputKept[item] ?? 0;
      const goodId = columns.outputGood[item] ?? 0;
      const quantity = columns.outputQuantity[item] ?? 0;
      outputs.push(kept > 0 ? { goodId, quantity, ownConsumption: kept } : { goodId, quantity });
    }
    const base = {
      buildingId: columns.buildingId[row] ?? 0,
      capacityTU: columns.capacityTU[row] ?? 0,
      executedTU: columns.executedTU[row] ?? 0,
      staffingRatio: columns.staffingRatio[row] ?? 0,
      productivityFactor: columns.productivityFactor[row] ?? 0,
      inputs,
      outputs,
    };
    const deposit = columns.extractionDeposit[row] ?? -1;
    objects.push(
      deposit >= 0 ? { ...base, extraction: { depositId: deposit, quantity: columns.extractionQuantity[row] ?? 0 } } : base,
    );
  }
  return objects;
}

/** Columns of building result objects (a copied or hand-built production result). */
export function productionColumnsOfObjects(buildings: readonly BuildingProductionResult[]): ProductionBuildingColumns {
  const builder = createProductionColumns(buildings.length);
  for (const building of buildings) {
    for (const input of building.inputs) {
      pushProductionInput(builder, input.goodId, input.reserved, input.used, input.released);
    }
    for (const output of building.outputs) {
      const kept = output.ownConsumption ?? 0;
      pushProductionOutput(builder, output.goodId, output.quantity, kept > 0 ? kept : 0);
    }
    pushProductionRow(
      builder,
      building.buildingId,
      building.capacityTU,
      building.executedTU,
      building.staffingRatio,
      building.productivityFactor,
      building.extraction === undefined ? -1 : building.extraction.depositId,
      building.extraction === undefined ? 0 : building.extraction.quantity,
    );
  }
  return finishProductionColumns(builder);
}

const PRODUCTION_COLUMNS = "buildingColumns";

/** Attach the columns to a production result as a transient, non-enumerable companion. */
export function attachProductionColumns(result: ProductionPhaseResult, columns: ProductionBuildingColumns): void {
  Object.defineProperty(result, PRODUCTION_COLUMNS, { value: columns, enumerable: false, writable: false });
}

/**
 * The building results of a production result as columns: its companion, or columns built
 * from its `buildings` objects (a copy or a hand-built result, which carries no companion).
 */
export function productionBuildingColumns(result: ProductionPhaseResult): ProductionBuildingColumns {
  const attached = (result as { readonly [PRODUCTION_COLUMNS]?: ProductionBuildingColumns })[PRODUCTION_COLUMNS];
  return attached ?? productionColumnsOfObjects(result.buildings);
}
