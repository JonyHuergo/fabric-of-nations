/**
 * D-162: the contract between the simulated day and a pool of worker threads.
 *
 * A phase that splits (demography, household demand) is written as a generator step that
 * yields a `ParallelRequest` and resumes with the lanes' results:
 *
 * - `undefined` (no pool, 0 workers, a world too small to split, or any failure): the phase runs
 *   inline on the calling thread over all its units, with the same kernel function on the
 *   world's own columns. This is the single-thread reference path.
 * - a `ParallelResponse`: the units were cut into contiguous ranges (`partitionUnits`) and each
 *   range was computed by the same kernel on a copy of its inputs (`ParallelRequest.job`,
 *   `runKernel`); the phase merges the outputs in range order, which is unit order.
 *
 * Kernels compute per-unit values only and the merge does every cross-unit step (totals, sums by
 * country, row offsets) in unit order, so the world is bit-identical at any worker count and
 * whatever order the workers finish in. Nothing here is state: requests are made per phase and
 * dropped, drivers hold only their locals, and the executor (the pool) belongs to the caller.
 * Pure ES2022: no threads, timers or platform APIs are named here; the pool lives in the worker
 * package.
 */

/** Kernels a worker thread can run (`runKernel`). */
export type KernelName = "demography" | "household-demand";

/** Version of the kernel message contract; a worker that answers another version is not used. */
export const KERNEL_PROTOCOL_VERSION = 1;

/** A typed array that crosses threads (its buffer is transferred). */
export type KernelArray = Float64Array | Int32Array | Uint32Array | Uint8Array;

/** Named typed arrays of a job or a result; no two may share a buffer. */
export type KernelArrays = Record<string, KernelArray>;

/** One range's work: small structured-clone parameters and transferable arrays. */
export interface KernelJob {
  readonly kernel: KernelName;
  /** Plain data (numbers, strings, arrays, typed arrays, maps): copied by structured clone. */
  readonly params: unknown;
  readonly arrays: KernelArrays;
}

/** One range's result: its arrays (inputs handed back and outputs) and counts. */
export interface KernelOutput {
  readonly arrays: KernelArrays;
  readonly counts: Readonly<Record<string, number>>;
}

/**
 * Typed buffers for job arrays, by slot name. A view's contents are unspecified: the job builder
 * writes every element it hands over and a kernel writes every output element it returns.
 */
export interface KernelAllocator {
  f64(slot: string, length: number): Float64Array;
  i32(slot: string, length: number): Int32Array;
  u32(slot: string, length: number): Uint32Array;
  u8(slot: string, length: number): Uint8Array;
}

/** Units `[from, to)` of a request. */
export interface UnitRange {
  readonly from: number;
  readonly to: number;
}

/** A split phase's question to the driver. */
export interface ParallelRequest {
  readonly kernel: KernelName;
  /** Number of independent units (blocks) of the phase. */
  readonly units: number;
  /** False when the phase must run inline (for example an error found while preparing it). */
  readonly splittable: boolean;
  /**
   * The job of units `[from, to)`, built from the state at the start of the phase. Reads the
   * world and writes nothing to it.
   */
  job(from: number, to: number, allocator: KernelAllocator): KernelJob;
}

/** The lanes' results, in range order (range `k` is units `ranges[k]`). */
export interface ParallelResponse {
  readonly ranges: readonly UnitRange[];
  readonly outputs: readonly KernelOutput[];
}

/** A day (or part of one) that can pause at its split phases. */
export type DaySteps<T> = Generator<ParallelRequest, T, ParallelResponse | undefined>;

/**
 * Runs requests on worker threads. Returns `undefined` when the request should run inline (no
 * usable worker, too few units, a failed worker or a kernel error); never applies anything.
 */
export interface ParallelExecutor {
  run(request: ParallelRequest): Promise<ParallelResponse | undefined> | ParallelResponse | undefined;
}

/** Drive steps with every request inline: the single-thread path. */
export function runStepsInline<T>(steps: DaySteps<T>): T {
  let next = steps.next(undefined);
  while (next.done !== true) next = steps.next(undefined);
  return next.value;
}

/**
 * Drive steps with an executor. A request the executor declines or fails runs inline; an error
 * thrown by the steps themselves (a merge, or the inline run of a failing phase) propagates.
 */
export async function runStepsParallel<T>(steps: DaySteps<T>, executor: ParallelExecutor): Promise<T> {
  let next = steps.next(undefined);
  while (next.done !== true) {
    let response: ParallelResponse | undefined;
    try {
      response = await executor.run(next.value);
    } catch {
      response = undefined;
    }
    next = steps.next(response);
  }
  return next.value;
}

/**
 * Cut `units` into `lanes` contiguous ranges: range `k` is
 * `[floor(k · units / lanes), floor((k + 1) · units / lanes))`.
 */
export function partitionUnits(units: number, lanes: number): UnitRange[] {
  if (!Number.isInteger(units) || units < 0) throw new RangeError(`invalid unit count ${String(units)}`);
  if (!Number.isInteger(lanes) || lanes < 1) throw new RangeError(`invalid lane count ${String(lanes)}`);
  const ranges: UnitRange[] = [];
  for (let lane = 0; lane < lanes; lane += 1) {
    ranges.push({ from: Math.floor((lane * units) / lanes), to: Math.floor(((lane + 1) * units) / lanes) });
  }
  return ranges;
}

/** Check that a response covers `units` with contiguous ranges and one output each. */
export function assertResponseCovers(response: ParallelResponse, units: number): void {
  if (response.ranges.length !== response.outputs.length || response.ranges.length === 0) {
    throw new RangeError("parallel response has no output for some range");
  }
  let expected = 0;
  for (const range of response.ranges) {
    if (range.from !== expected || range.to < range.from) throw new RangeError("parallel response ranges are not contiguous");
    expected = range.to;
  }
  if (expected !== units) throw new RangeError(`parallel response covers ${String(expected)} of ${String(units)} units`);
}

/** Kernel array constructors (checked by name: arrays from another thread or realm are of
 * another realm's constructor, so `instanceof` would reject them). */
export type KernelArrayType<T extends KernelArray> = (new (length: number) => T) & { readonly name: string };

/** Whether `value` is a typed array of `type`'s kind, whatever realm made it. */
export function isKernelArrayOf<T extends KernelArray>(value: unknown, type: KernelArrayType<T>): value is T {
  return ArrayBuffer.isView(value) && (value as { readonly [Symbol.toStringTag]?: string })[Symbol.toStringTag] === type.name;
}

/** A named array of a kernel output, of the expected type and at least `length` long. */
export function outputArray<T extends KernelArray>(
  output: KernelOutput,
  name: string,
  type: KernelArrayType<T>,
  length: number,
): T {
  const array = output.arrays[name];
  if (!isKernelArrayOf(array, type) || array.length < length) {
    throw new RangeError(`kernel output ${name} is missing or too short`);
  }
  return array;
}

/** A kernel output count, a non-negative integer. */
export function outputCount(output: KernelOutput, name: string): number {
  const value = output.counts[name];
  if (value === undefined || !Number.isInteger(value) || value < 0) throw new RangeError(`kernel output count ${name} is invalid`);
  return value;
}
