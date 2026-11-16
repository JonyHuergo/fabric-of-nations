/**
 * D-162: a pool of kernel worker threads, the executor of the simulated day's split phases.
 *
 * The pool is transport-neutral: it talks to each worker through a `KernelPort` (a nested Web
 * Worker on web, a blob-URL worker in the phone's WebView, a `worker_threads` worker on Node), so
 * the messages, the lane cutting, the buffer pools and the fallback are the same code on every
 * platform. For each request it cuts the units into lanes (`partitionUnits`), posts one job to
 * each worker with its buffers transferred, computes the last lane itself, and returns the
 * outputs in range order; the simulation merges them (`ParallelResponse`). It returns
 * `undefined` (run inline) whenever it cannot split: not ready, disabled by a failure, too few
 * units, or a kernel error in any lane (the inline run then reproduces the single-thread error).
 *
 * The pool is owned by its caller (the simulation host); it holds no simulation state. Its
 * buffers are typed-array storage by lane and slot, reused every day while a slot's size stays
 * the same. Jobs and results are copied by structured clone and nothing is transferred: moving
 * a buffer away detaches it, and one detached buffer slows every later typed-array access of
 * that thread (V8's detaching protector; measured +5 to +9 % on the whole single-thread day), so
 * no thread of the pool ever detaches one.
 */

import {
  KERNEL_PROTOCOL_VERSION,
  partitionUnits,
  runKernel,
  type KernelAllocator,
  type KernelArray,
  type KernelArrays,
  type KernelJob,
  type KernelOutput,
  type ParallelExecutor,
  type ParallelRequest,
  type ParallelResponse,
} from "@century/sim";

/** One worker as the pool sees it. */
export interface KernelPort {
  postMessage(message: unknown, transfer: ArrayBuffer[]): void;
  /** Install the pool's handlers (called once, before the first message). */
  listen(onMessage: (message: unknown) => void, onFailure: (reason: string) => void): void;
  terminate(): void;
}

/** Messages to a kernel worker. */
export type KernelWorkerRequest =
  | { readonly type: "hello"; readonly version: number }
  | { readonly type: "job"; readonly id: number; readonly job: KernelJob };

/** Messages from a kernel worker. */
export type KernelWorkerReply =
  | { readonly type: "ready"; readonly version: number }
  | {
      readonly type: "result";
      readonly id: number;
      readonly ok: boolean;
      readonly arrays: KernelArrays;
      readonly counts: Readonly<Record<string, number>>;
      readonly error?: string;
    };

export type KernelPoolState = "starting" | "ready" | "unavailable";

export interface KernelPoolStatus {
  /** Worker threads asked for. */
  readonly requested: number;
  /** Worker threads in use now (0 until ready and after a failure). */
  readonly workers: number;
  readonly state: KernelPoolState;
  /** Why the pool is unavailable, when it is. */
  readonly reason: string | null;
  /** Threads that computed the last split phase (1: the sim thread alone). */
  readonly lastThreads: number;
}

export interface KernelPoolOptions {
  /** Worker threads to start (0: none; every phase runs inline). */
  readonly workers: number;
  /** Start worker `index`; may throw (the pool is then unavailable). */
  readonly spawn: (index: number) => KernelPort;
  /** A lane gets at least this many units (default 1,024); fewer lanes otherwise. */
  readonly minUnitsPerLane?: number;
  /** Whether the sim thread computes a lane itself while the workers compute theirs (default true). */
  readonly mainLane?: boolean;
  /** A worker that does not answer within this time disables the pool (default 60 s). */
  readonly timeoutMs?: number;
  /** Timer seam for tests; defaults to the platform's `setTimeout`/`clearTimeout`. */
  readonly timers?: {
    readonly set: (callback: () => void, ms: number) => unknown;
    readonly clear: (handle: unknown) => void;
  };
}

export interface KernelPool extends ParallelExecutor {
  /** Settles once every worker answered (true) or the pool became unavailable (false). */
  readonly ready: Promise<boolean>;
  status(): KernelPoolStatus;
  /** Stop every worker; later requests run inline. */
  close(): void;
}

const DEFAULT_MIN_UNITS_PER_LANE = 1024;
const DEFAULT_TIMEOUT_MS = 60_000;

type ArrayConstructorOf<T extends KernelArray> = {
  new (buffer: ArrayBuffer, byteOffset: number, length: number): T;
  readonly BYTES_PER_ELEMENT: number;
};

/**
 * The buffers of one lane, by slot. A worker lane's job is posted and a structured clone copies a
 * view's whole buffer, so its slots are exactly the size asked for (kept while the size repeats,
 * as most do every day; replaced when it changes). The sim thread's lane is never posted: its
 * slots grow by at least a quarter and never shrink, and also hold its kernel's outputs, so the
 * sim thread allocates no new buffers for its lane.
 */
class LaneBuffers {
  private readonly buffers = new Map<string, ArrayBuffer>();

  constructor(private readonly exact: boolean) {}

  view<T extends KernelArray>(slot: string, type: ArrayConstructorOf<T>, length: number): T {
    if (!Number.isInteger(length) || length < 0) throw new RangeError(`buffer slot ${slot} requested an invalid length`);
    const bytes = length * type.BYTES_PER_ELEMENT;
    let buffer = this.buffers.get(slot);
    if (buffer === undefined || (this.exact ? buffer.byteLength !== bytes : buffer.byteLength < bytes)) {
      const previous = buffer === undefined ? 0 : buffer.byteLength;
      buffer = new ArrayBuffer(this.exact ? bytes : Math.max(bytes, Math.ceil(previous * 1.25), 64));
      this.buffers.set(slot, buffer);
    }
    return new type(buffer, 0, length);
  }

  allocator(): KernelAllocator {
    return {
      f64: (slot, length) => this.view(slot, Float64Array, length),
      i32: (slot, length) => this.view(slot, Int32Array, length),
      u32: (slot, length) => this.view(slot, Uint32Array, length),
      u8: (slot, length) => this.view(slot, Uint8Array, length),
    };
  }
}

/**
 * Arrays fit to be posted: a view that does not cover its whole buffer is copied to one that
 * does (a structured clone would copy the whole buffer).
 */
export function compactArrays(arrays: KernelArrays): KernelArrays {
  const compact: KernelArrays = {};
  for (const [name, array] of Object.entries(arrays)) {
    compact[name] = array.byteOffset === 0 && array.byteLength === array.buffer.byteLength ? array : array.slice();
  }
  return compact;
}

interface Pending {
  readonly resolve: (reply: KernelWorkerReply & { type: "result" }) => void;
  readonly reject: (reason: string) => void;
}

/** Create a pool; with `workers` 0, or when spawning fails, every request runs inline. */
export function createKernelPool(options: KernelPoolOptions): KernelPool {
  const requested = Math.max(0, Math.floor(options.workers));
  const minUnits = Math.max(1, Math.floor(options.minUnitsPerLane ?? DEFAULT_MIN_UNITS_PER_LANE));
  const mainLane = options.mainLane !== false;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timers = options.timers ?? {
    set: (callback: () => void, ms: number): unknown => setTimeout(callback, ms),
    clear: (handle: unknown): void => clearTimeout(handle as ReturnType<typeof setTimeout>),
  };
  const ports: KernelPort[] = [];
  const pending: (Pending | null)[] = [];
  const lanes: LaneBuffers[] = [new LaneBuffers(false)];
  let state: KernelPoolState = requested === 0 ? "unavailable" : "starting";
  let reason: string | null = requested === 0 ? "no workers requested" : null;
  let lastThreads = 1;
  let nextId = 1;
  let readyCount = 0;
  let settleReady: (value: boolean) => void = () => undefined;
  const ready = new Promise<boolean>((resolve) => {
    settleReady = resolve;
  });
  // No workers asked for: nothing to wait for.
  if (requested === 0) settleReady(false);

  const disable = (why: string): void => {
    if (state === "unavailable") return;
    state = "unavailable";
    reason = why;
    for (const port of ports) {
      try {
        port.terminate();
      } catch {
        // A worker that cannot be stopped is dropped all the same.
      }
    }
    for (let index = 0; index < pending.length; index += 1) {
      const waiting = pending[index];
      pending[index] = null;
      waiting?.reject(why);
    }
    settleReady(false);
  };

  if (requested > 0) {
    const handshake = timers.set(() => {
      if (state === "starting") disable(`workers did not answer within ${String(timeoutMs)} ms`);
    }, timeoutMs);
    try {
      for (let index = 0; index < requested; index += 1) {
        const port = options.spawn(index);
        ports.push(port);
        pending.push(null);
        lanes.push(new LaneBuffers(true));
        port.listen(
          (message) => {
            const reply = message as KernelWorkerReply | null;
            if (reply === null || typeof reply !== "object") {
              disable(`worker ${String(index)} sent an unreadable message`);
              return;
            }
            if (reply.type === "ready") {
              if (reply.version !== KERNEL_PROTOCOL_VERSION) {
                disable(`worker ${String(index)} runs kernel version ${String(reply.version)}`);
                return;
              }
              readyCount += 1;
              if (readyCount === requested && state === "starting") {
                state = "ready";
                timers.clear(handshake);
                settleReady(true);
              }
              return;
            }
            if (reply.type === "result") {
              const waiting = pending[index];
              pending[index] = null;
              if (waiting === null || waiting === undefined) {
                disable(`worker ${String(index)} answered a job it was not given`);
                return;
              }
              waiting.resolve(reply);
              return;
            }
            disable(`worker ${String(index)} sent an unknown message`);
          },
          (why) => disable(`worker ${String(index)} failed: ${why}`),
        );
      }
      for (const port of ports) port.postMessage({ type: "hello", version: KERNEL_PROTOCOL_VERSION } satisfies KernelWorkerRequest, []);
    } catch (error) {
      timers.clear(handshake);
      disable(`workers could not start: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const dispatch = (index: number, job: KernelJob): Promise<KernelWorkerReply & { type: "result" }> =>
    new Promise((resolve, reject) => {
      const port = ports[index];
      if (port === undefined || state !== "ready") {
        reject("pool not ready");
        return;
      }
      const id = nextId;
      nextId += 1;
      const timer = timers.set(() => disable(`worker ${String(index)} did not finish a job within ${String(timeoutMs)} ms`), timeoutMs);
      pending[index] = {
        resolve: (reply) => {
          timers.clear(timer);
          if (reply.id !== id) {
            disable(`worker ${String(index)} answered job ${String(reply.id)} instead of ${String(id)}`);
            reject("mismatched job");
            return;
          }
          resolve(reply);
        },
        reject: (why) => {
          timers.clear(timer);
          reject(why);
        },
      };
      try {
        // Copied, never transferred (see the module comment).
        port.postMessage({ type: "job", id, job } satisfies KernelWorkerRequest, []);
      } catch (error) {
        pending[index] = null;
        timers.clear(timer);
        disable(`worker ${String(index)} rejected a job: ${error instanceof Error ? error.message : String(error)}`);
        reject("post failed");
      }
    });

  const run = async (request: ParallelRequest): Promise<ParallelResponse | undefined> => {
    if (state !== "ready" || !request.splittable) {
      lastThreads = 1;
      return undefined;
    }
    const laneCount = Math.min(ports.length + (mainLane ? 1 : 0), Math.floor(request.units / minUnits));
    if (laneCount < (mainLane ? 2 : 1)) {
      lastThreads = 1;
      return undefined;
    }
    const ranges = partitionUnits(request.units, laneCount);
    const jobs: KernelJob[] = [];
    const workerLanes = mainLane ? laneCount - 1 : laneCount;
    for (let lane = 0; lane < laneCount; lane += 1) {
      // Workers take lanes 0..; with a main lane the sim thread takes the last (its own buffers).
      const buffers = lane === workerLanes ? (lanes[0] as LaneBuffers) : (lanes[lane + 1] as LaneBuffers);
      const range = ranges[lane]!;
      jobs.push(request.job(range.from, range.to, buffers.allocator()));
    }
    const replies: Promise<KernelWorkerReply & { type: "result" }>[] = [];
    for (let lane = 0; lane < workerLanes; lane += 1) replies.push(dispatch(lane, jobs[lane]!));
    let own: KernelOutput | null = null;
    let ownFailed = false;
    if (mainLane) {
      try {
        own = runKernel(jobs[workerLanes]!, (lanes[0] as LaneBuffers).allocator());
      } catch {
        ownFailed = true;
      }
    }
    let results: (KernelWorkerReply & { type: "result" })[];
    try {
      results = await Promise.all(replies);
    } catch {
      // A worker failed: the pool is disabled and the phase runs inline. Wait for the other
      // lanes to settle so no reply arrives into a later request.
      await Promise.allSettled(replies);
      lastThreads = 1;
      return undefined;
    }
    const outputs: KernelOutput[] = [];
    let failed = ownFailed;
    for (let lane = 0; lane < workerLanes; lane += 1) {
      const reply = results[lane]!;
      if (!reply.ok) failed = true;
      outputs.push({ arrays: reply.arrays, counts: reply.counts });
    }
    if (failed) {
      lastThreads = 1;
      return undefined;
    }
    if (own !== null) outputs.push(own);
    lastThreads = laneCount + (mainLane ? 0 : 1);
    return { ranges, outputs };
  };

  return {
    ready,
    run,
    status: () => ({
      requested,
      workers: state === "ready" ? ports.length : 0,
      state,
      reason,
      lastThreads,
    }),
    close: () => disable("closed"),
  };
}

/**
 * The default worker count of a device with `hardwareConcurrency` logical cores: two cores left
 * for the app and the sim thread, at most three workers (provisional, D-162; the designer tunes
 * it on devices).
 */
export function defaultKernelWorkerCount(hardwareConcurrency: number | undefined): number {
  const cores = typeof hardwareConcurrency === "number" && Number.isFinite(hardwareConcurrency) ? Math.floor(hardwareConcurrency) : 2;
  return Math.max(0, Math.min(3, cores - 2));
}
