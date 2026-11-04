/**
 * Performance-stage benchmark (`pnpm -F @century/bench perf [days] [--out file] [--no-staged]`).
 *
 * Measures the paths the performance acceptance criteria name, on the 1900 world:
 *
 * - new game: world creation plus the first rollback checkpoint, and the host's
 *   CREATE_GAME command (create, checkpoint, snapshot);
 * - the worker host path: one STEP command per simulated day, split into the tick,
 *   the snapshot build and the JSON encoding the native WebView bridge applies
 *   (`JSON.stringify` of the event), over a window that includes three month starts
 *   and the first month-end close;
 * - a per-phase stopwatch of the same days through the rollback runner, using the
 *   simulation's phase observer (the simulation never reads the clock);
 * - host-level throughput at the fastest speed through `pump` (ticks plus snapshots);
 * - save (SAVE command plus the app's save-library store) and load (library load plus
 *   the LOAD command), and the main-menu PREVIEW_SAVE;
 * - heap samples, canonical hashes at days 1, 31, 32 and the window end, and the
 *   staged-mode cross-check.
 *
 * Node diagnostic only; device performance is the designer's to measure.
 */

import { writeFileSync } from "node:fs";
import { cpus, totalmem } from "node:os";
import { DATA_PACKAGE_VERSION, loadM11World } from "@century/data";
import {
  createEconomyWorld,
  createRollbackRunner,
  hashWorld,
  runTicksWithRollback,
  SIM_VERSION,
  tick,
  type EconomyScenarioDef,
  type TickContext,
  type World,
} from "@century/sim";
import { PROTOCOL_VERSION, type WorkerEvent } from "@century/sim-worker";
import { SimulationHost } from "@century/sim-worker/host";
import { SaveLibrary, type SaveStorageBackend } from "@century/sim-worker/persistence";

const SEED = 20_261_023;
const DEFAULT_DAYS = 92;
const PLAYER_COUNTRY_ID = 0;
const HASH_DAYS = [1, 31, 32] as const;
const REPEATS = 3;

interface Stats {
  readonly count: number;
  readonly mean: number;
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
  readonly max: number;
}

function stats(samples: readonly number[]): Stats {
  const sorted = [...samples].sort((left, right) => left - right);
  const pick = (fraction: number): number =>
    sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))] ?? Number.NaN;
  const mean = sorted.reduce((sum, value) => sum + value, 0) / Math.max(1, sorted.length);
  return {
    count: sorted.length,
    mean,
    p50: pick(0.5),
    p95: pick(0.95),
    p99: pick(0.99),
    max: sorted[sorted.length - 1] ?? Number.NaN,
  };
}

function median(samples: readonly number[]): number {
  return stats(samples).p50;
}

function fmt(value: number): string {
  if (!Number.isFinite(value)) return "n/a";
  if (Math.abs(value) >= 100) return value.toFixed(0);
  if (Math.abs(value) >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

function statsLine(label: string, value: Stats): string {
  return (
    `${label}: mean ${fmt(value.mean)}, p50 ${fmt(value.p50)}, p95 ${fmt(value.p95)}, ` +
    `p99 ${fmt(value.p99)}, max ${fmt(value.max)} ms (${String(value.count)} days)`
  );
}

function civilDay(world: World): { readonly month: number; readonly day: number } {
  // 1900 calendar (no leap day): the window never leaves 1900.
  const lengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let remaining = world.dayIndex;
  let month = 0;
  while (month < 11 && remaining >= (lengths[month] ?? 31)) {
    remaining -= lengths[month] ?? 31;
    month += 1;
  }
  return { month: month + 1, day: remaining + 1 };
}

function context(scenario: EconomyScenarioDef): TickContext {
  return {
    population: { definitions: scenario.population.definitions },
    economy: { definitions: scenario.definitions },
  };
}

function heapMiB(): number {
  return process.memoryUsage().heapUsed / 1024 ** 2;
}

class MemoryBackend implements SaveStorageBackend {
  private readonly items = new Map<string, string>();

  public getItem(key: string): Promise<string | null> {
    return Promise.resolve(this.items.get(key) ?? null);
  }

  public setItem(key: string, value: string): Promise<void> {
    this.items.set(key, value);
    return Promise.resolve();
  }

  public removeItem(key: string): Promise<void> {
    this.items.delete(key);
    return Promise.resolve();
  }
}

/** Host world access for hashing outside the timed sections (diagnostic only). */
function hostWorld(host: SimulationHost): World {
  return (host as unknown as { world: World }).world;
}

interface HostDay {
  readonly dayIndex: number;
  readonly monthStart: boolean;
  readonly monthEnd: boolean;
  readonly totalMs: number;
  readonly tickMs: number;
  readonly snapshotMs: number;
  readonly encodeMs: number;
  readonly snapshotBytes: number;
  readonly heapMiB: number;
}

interface Recorder {
  events: WorkerEvent[];
  stateAt: number;
  snapshotAt: number;
  encodeMs: number;
  snapshotBytes: number;
}

function makeHost(scenario: EconomyScenarioDef, recorder: Recorder, clock?: () => number): SimulationHost {
  return new SimulationHost({
    scenario,
    seed: SEED,
    autoPump: false,
    ...(clock === undefined ? {} : { clock }),
    emit: (event) => {
      const now = performance.now();
      if (event.type === "STATE") recorder.stateAt = now;
      if (event.type === "SNAPSHOT" || event.type === "READY") recorder.snapshotAt = now;
      // The native WebView bridge sends every event as JSON text; web posts it
      // through structured clone. JSON is the larger of the two costs we can measure.
      const encodeStart = performance.now();
      const text = JSON.stringify(event);
      recorder.encodeMs += performance.now() - encodeStart;
      if (event.type === "SNAPSHOT" || event.type === "READY") recorder.snapshotBytes = text.length;
      recorder.events.push(event);
      if (recorder.events.length > 8) recorder.events.splice(0, recorder.events.length - 8);
    },
  });
}

function command(type: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { protocolVersion: PROTOCOL_VERSION, type, commandId: `${type}-${String(performance.now())}`, ...extra };
}

function lastEvent(recorder: Recorder, type: WorkerEvent["type"]): WorkerEvent {
  for (let index = recorder.events.length - 1; index >= 0; index -= 1) {
    const event = recorder.events[index];
    if (event?.type === type) return event;
  }
  throw new Error(`no ${type} event`);
}

function assertAccepted(event: WorkerEvent): void {
  if ("accepted" in event && event.accepted !== true) {
    throw new Error(`${event.type} rejected: ${JSON.stringify("errors" in event ? event.errors : [])}`);
  }
}

interface NewGameResult {
  readonly createWorldMs: number;
  readonly firstCheckpointMs: number;
  readonly createPlusCheckpointMs: number;
  readonly createGameCommandMs: number;
  /** First CREATE_GAME on a fresh host (reuses the startup world, D-139). */
  readonly firstCreateGameCommandMs: number;
  /** Host construction, which builds the startup world. */
  readonly hostStartMs: number;
}

function measureNewGame(scenario: EconomyScenarioDef): NewGameResult {
  const create: number[] = [];
  const checkpoint: number[] = [];
  const both: number[] = [];
  for (let index = 0; index < REPEATS; index += 1) {
    const start = performance.now();
    const world = createEconomyWorld({ ...scenario, playerCountryId: PLAYER_COUNTRY_ID }, { seed: SEED });
    const created = performance.now();
    createRollbackRunner(world);
    const done = performance.now();
    create.push(created - start);
    checkpoint.push(done - created);
    both.push(done - start);
  }
  const recorder: Recorder = { events: [], stateAt: 0, snapshotAt: 0, encodeMs: 0, snapshotBytes: 0 };
  const host = makeHost(scenario, recorder);
  const commandMs: number[] = [];
  for (let index = 0; index < REPEATS; index += 1) {
    const start = performance.now();
    host.handleCommand(command("CREATE_GAME", { playerCountryId: PLAYER_COUNTRY_ID }));
    commandMs.push(performance.now() - start);
    assertAccepted(lastEvent(recorder, "NEW_GAME_RESULT"));
  }
  // D-139: the first campaign from the menus reuses the untouched startup world, so it
  // is measured on a fresh host each time; host construction (which builds that world
  // at worker start, behind the title screen) is reported separately.
  const firstCommandMs: number[] = [];
  const hostStartMs: number[] = [];
  for (let index = 0; index < REPEATS; index += 1) {
    const fresh: Recorder = { events: [], stateAt: 0, snapshotAt: 0, encodeMs: 0, snapshotBytes: 0 };
    const startHost = performance.now();
    const freshHost = makeHost(scenario, fresh);
    hostStartMs.push(performance.now() - startHost);
    const start = performance.now();
    freshHost.handleCommand(command("CREATE_GAME", { playerCountryId: PLAYER_COUNTRY_ID }));
    firstCommandMs.push(performance.now() - start);
    assertAccepted(lastEvent(fresh, "NEW_GAME_RESULT"));
  }
  return {
    createWorldMs: median(create),
    firstCheckpointMs: median(checkpoint),
    createPlusCheckpointMs: median(both),
    createGameCommandMs: median(commandMs),
    firstCreateGameCommandMs: median(firstCommandMs),
    hostStartMs: median(hostStartMs),
  };
}

interface HostRun {
  readonly host: SimulationHost;
  readonly recorder: Recorder;
  readonly days: readonly HostDay[];
  readonly hashes: Record<string, string>;
}

function runHostDays(scenario: EconomyScenarioDef, days: number): HostRun {
  const recorder: Recorder = { events: [], stateAt: 0, snapshotAt: 0, encodeMs: 0, snapshotBytes: 0 };
  const host = makeHost(scenario, recorder, () => performance.now());
  host.handleCommand(command("CREATE_GAME", { playerCountryId: PLAYER_COUNTRY_ID }));
  assertAccepted(lastEvent(recorder, "NEW_GAME_RESULT"));
  const samples: HostDay[] = [];
  const hashes: Record<string, string> = {};
  for (let day = 0; day < days; day += 1) {
    const world = hostWorld(host);
    const date = civilDay(world);
    const dayIndex = world.dayIndex;
    const monthEnd = [31, 59, 90, 120].includes(dayIndex + 1);
    recorder.encodeMs = 0;
    const start = performance.now();
    host.handleCommand(command("STEP", { ticks: 1 }));
    const end = performance.now();
    const stepEvent = recorder.events.find((event) => event.type === "FATAL");
    if (stepEvent !== undefined) throw new Error(JSON.stringify(stepEvent));
    samples.push({
      dayIndex,
      monthStart: date.day === 1,
      monthEnd,
      totalMs: end - start,
      tickMs: recorder.stateAt - start,
      snapshotMs: recorder.snapshotAt - recorder.stateAt,
      encodeMs: recorder.encodeMs,
      snapshotBytes: recorder.snapshotBytes,
      heapMiB: heapMiB(),
    });
    const after = hostWorld(host).dayIndex;
    if ((HASH_DAYS as readonly number[]).includes(after) || after === days) {
      hashes[String(after)] = hashWorld(hostWorld(host));
    }
  }
  return { host, recorder, days: samples, hashes };
}

interface PhaseRun {
  readonly perDay: readonly Record<string, number>[];
  readonly hashes: Record<string, string>;
}

function runPhaseStopwatch(scenario: EconomyScenarioDef, days: number): PhaseRun {
  const world = createEconomyWorld({ ...scenario, playerCountryId: PLAYER_COUNTRY_ID }, { seed: SEED });
  const runner = createRollbackRunner(world);
  const perDay: Record<string, number>[] = [];
  const hashes: Record<string, string> = {};
  let current: Record<string, number> = {};
  let phase = "runner";
  let since = 0;
  const observe = (next: string): void => {
    const now = performance.now();
    current[phase] = (current[phase] ?? 0) + (now - since);
    phase = next;
    since = now;
  };
  const tickContext: TickContext = { ...context(scenario), phaseObserver: observe };
  for (let day = 0; day < days; day += 1) {
    current = {};
    phase = "runner";
    since = performance.now();
    runTicksWithRollback(runner, 1, tickContext);
    observe("done");
    delete current.done;
    perDay.push(current);
    const after = world.dayIndex;
    if ((HASH_DAYS as readonly number[]).includes(after) || after === days) {
      hashes[String(after)] = hashWorld(world);
    }
  }
  return { perDay, hashes };
}

function runStagedHashes(scenario: EconomyScenarioDef, days: number): { hashes: Record<string, string>; stats: Stats } {
  const world = createEconomyWorld({ ...scenario, playerCountryId: PLAYER_COUNTRY_ID }, { seed: SEED });
  const hashes: Record<string, string> = {};
  const samples: number[] = [];
  for (let day = 0; day < days; day += 1) {
    const start = performance.now();
    tick(world, context(scenario));
    samples.push(performance.now() - start);
    const after = world.dayIndex;
    if ((HASH_DAYS as readonly number[]).includes(after) || after === days) {
      hashes[String(after)] = hashWorld(world);
    }
  }
  return { hashes, stats: stats(samples) };
}

interface SaveLoadResult {
  readonly saveCommandMs: number;
  readonly libraryCreateMs: number;
  readonly libraryReplaceMs: number;
  readonly saveTotalMs: number;
  readonly libraryLoadMs: number;
  readonly loadCommandMs: number;
  readonly loadTotalMs: number;
  readonly previewMs: number;
  readonly saveChars: number;
  readonly storedChars: number;
  readonly roundTripHashEqual: boolean;
}

async function measureSaveLoad(run: HostRun): Promise<SaveLoadResult> {
  const { host, recorder } = run;
  const before = hashWorld(hostWorld(host));
  const saveMs: number[] = [];
  const createMs: number[] = [];
  const replaceMs: number[] = [];
  const libraryLoadMs: number[] = [];
  const loadMs: number[] = [];
  const previewMs: number[] = [];
  let saveChars = 0;
  let storedChars = 0;
  for (let index = 0; index < REPEATS; index += 1) {
    const library = new SaveLibrary(new MemoryBackend(), { expectedSchemaVersion: hostWorld(host).schemaVersion });
    let start = performance.now();
    host.handleCommand(command("SAVE"));
    saveMs.push(performance.now() - start);
    const event = lastEvent(recorder, "SAVE_RESULT");
    if (event.type !== "SAVE_RESULT") throw new Error("missing save");
    const save = event.save;
    saveChars = save.length;
    start = performance.now();
    const created = await library.create(save, { playerCountryId: PLAYER_COUNTRY_ID, savedAtMs: null });
    createMs.push(performance.now() - start);
    // The app's autosave and manual save replace an existing slot: the old primary
    // is checked and kept as the recovery copy.
    start = performance.now();
    const stored = await library.store(created.slot.id, save, { playerCountryId: PLAYER_COUNTRY_ID, savedAtMs: null });
    replaceMs.push(performance.now() - start);
    storedChars = stored.compressedBytes;

    start = performance.now();
    const loaded = await library.load(created.slot.id);
    libraryLoadMs.push(performance.now() - start);
    if (loaded === null) throw new Error("save library lost the save");
    start = performance.now();
    host.handleCommand(command("PREVIEW_SAVE", { save: loaded.save }));
    previewMs.push(performance.now() - start);
    assertAccepted(lastEvent(recorder, "SAVE_PREVIEW"));
    start = performance.now();
    host.handleCommand(command("LOAD", { save: loaded.save }));
    loadMs.push(performance.now() - start);
    assertAccepted(lastEvent(recorder, "LOAD_RESULT"));
  }
  const after = hashWorld(hostWorld(host));
  return {
    saveCommandMs: median(saveMs),
    libraryCreateMs: median(createMs),
    libraryReplaceMs: median(replaceMs),
    saveTotalMs: median(saveMs) + median(replaceMs),
    libraryLoadMs: median(libraryLoadMs),
    loadCommandMs: median(loadMs),
    loadTotalMs: median(libraryLoadMs) + median(loadMs),
    previewMs: median(previewMs),
    saveChars,
    storedChars,
    roundTripHashEqual: before === after,
  };
}

interface Throughput {
  readonly days: number;
  readonly wallMs: number;
  readonly daysPerSecond: number;
  readonly snapshots: number;
}

/** Fastest speed through the host's wall-clock pump: ticks plus the snapshots it emits. */
function measureThroughput(run: HostRun, days: number): Throughput {
  const { host, recorder } = run;
  let snapshots = 0;
  const startDay = hostWorld(host).dayIndex;
  host.handleCommand(command("SET_SPEED", { daysPerSecond: 30 }));
  host.handleCommand(command("START"));
  const start = performance.now();
  let lastCount = recorder.events.length;
  let lastEventObject = recorder.events[recorder.events.length - 1];
  while (hostWorld(host).dayIndex - startDay < days) {
    host.pump(performance.now());
    const newest = recorder.events[recorder.events.length - 1];
    if (newest !== lastEventObject || recorder.events.length !== lastCount) {
      if (newest?.type === "SNAPSHOT") snapshots += 1;
      if (newest?.type === "FATAL") throw new Error(JSON.stringify(newest));
      lastEventObject = newest;
      lastCount = recorder.events.length;
    }
  }
  const wallMs = performance.now() - start;
  host.handleCommand(command("PAUSE"));
  const processed = hostWorld(host).dayIndex - startDay;
  return { days: processed, wallMs, daysPerSecond: processed / (wallMs / 1000), snapshots };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const positional = args.filter((arg) => !arg.startsWith("--"));
  const requested = Number(positional[0] ?? DEFAULT_DAYS);
  const days = Number.isInteger(requested) && requested >= 33 ? requested : DEFAULT_DAYS;
  const outIndex = args.indexOf("--out");
  const outPath = outIndex >= 0 ? args[outIndex + 1] : undefined;
  const staged = !args.includes("--no-staged");
  const throughputDays = 30;

  const cpuList = cpus();
  const environment = {
    node: process.version,
    platform: `${process.platform} ${process.arch}`,
    cpu: `${cpuList[0]?.model ?? "unknown"} (${String(cpuList.length)} logical processors)`,
    memoryGiB: Number((totalmem() / 1024 ** 3).toFixed(2)),
    simVersion: SIM_VERSION,
    dataVersion: DATA_PACKAGE_VERSION,
  };
  console.log("Fabric of Nations performance benchmark (1900 world)");
  console.log(JSON.stringify(environment));

  let start = performance.now();
  const scenario = loadM11World();
  const scenarioLoadMs = performance.now() - start;
  const probe = createEconomyWorld(scenario, { seed: SEED });
  console.log(
    `world: ${String(probe.popBlocks.length)} blocks, ${String(probe.buildings.length)} buildings, ` +
      `${String(probe.provinceEconomies.length)} provinces, ${String(probe.markets.length)} markets, ` +
      `${String(probe.countries.length)} countries, ${String(probe.finance.accounts.length)} accounts, ` +
      `${String(probe.trade.routes.length)} routes; window ${String(days)} days`,
  );
  console.log(`scenario load (data package, Node only): ${fmt(scenarioLoadMs)} ms`);

  const newGame = measureNewGame(scenario);
  console.log(
    `new game: create world ${fmt(newGame.createWorldMs)} ms + first checkpoint ${fmt(newGame.firstCheckpointMs)} ms = ` +
      `${fmt(newGame.createPlusCheckpointMs)} ms; CREATE_GAME command ${fmt(newGame.createGameCommandMs)} ms; ` +
      `first CREATE_GAME on a fresh host ${fmt(newGame.firstCreateGameCommandMs)} ms (host start ${fmt(newGame.hostStartMs)} ms)`,
  );

  start = performance.now();
  const hostRun = runHostDays(scenario, days);
  console.log(`host window wall time ${fmt((performance.now() - start) / 1000)} s (includes hashing)`);
  const hostDays = hostRun.days;
  const total = stats(hostDays.map((day) => day.totalMs));
  const ordinary = stats(hostDays.filter((day) => !day.monthStart && !day.monthEnd).map((day) => day.totalMs));
  console.log(statsLine("host day (STEP: tick + snapshot + JSON)", total));
  console.log(statsLine("  tick", stats(hostDays.map((day) => day.tickMs))));
  console.log(statsLine("  snapshot build", stats(hostDays.map((day) => day.snapshotMs))));
  console.log(statsLine("  JSON encode of events", stats(hostDays.map((day) => day.encodeMs))));
  console.log(statsLine("  ordinary days (not month start or end)", ordinary));
  const monthStarts = hostDays.filter((day) => day.monthStart);
  const monthEnds = hostDays.filter((day) => day.monthEnd);
  console.log(
    `  month starts: ${monthStarts.map((day) => `day ${String(day.dayIndex)} ${fmt(day.totalMs)} ms (x${fmt(day.totalMs / ordinary.p50)} of ordinary p50)`).join(", ")}`,
  );
  console.log(
    `  month ends: ${monthEnds.map((day) => `day ${String(day.dayIndex)} ${fmt(day.totalMs)} ms (x${fmt(day.totalMs / ordinary.p50)})`).join(", ")}`,
  );
  const snapshotBytes = stats(hostDays.map((day) => day.snapshotBytes));
  console.log(`  snapshot JSON: p50 ${fmt(snapshotBytes.p50 / 1e6)} M chars`);
  const heap = stats(hostDays.map((day) => day.heapMiB));
  console.log(`  heap used: p50 ${fmt(heap.p50)} MiB, max ${fmt(heap.max)} MiB`);

  start = performance.now();
  const phaseRun = runPhaseStopwatch(scenario, days);
  console.log(`phase stopwatch wall time ${fmt((performance.now() - start) / 1000)} s (includes hashing)`);
  const phaseNames = new Set<string>();
  for (const day of phaseRun.perDay) for (const name of Object.keys(day)) phaseNames.add(name);
  const phaseTable = [...phaseNames]
    .map((name) => {
      const values = phaseRun.perDay.map((day) => day[name] ?? 0);
      const monthStartValues = phaseRun.perDay
        .filter((_, index) => monthStarts.some((day) => day.dayIndex === index))
        .map((day) => day[name] ?? 0);
      return {
        phase: name,
        meanMs: values.reduce((sum, value) => sum + value, 0) / values.length,
        p50Ms: stats(values).p50,
        maxMs: stats(values).max,
        monthStartMeanMs:
          monthStartValues.reduce((sum, value) => sum + value, 0) / Math.max(1, monthStartValues.length),
      };
    })
    .sort((left, right) => right.meanMs - left.meanMs);
  const phaseTotal = phaseTable.reduce((sum, row) => sum + row.meanMs, 0);
  console.log("per-phase stopwatch (rollback runner, ms per day): phase, mean, share, p50, max, month-start mean");
  for (const row of phaseTable) {
    console.log(
      `  ${row.phase.padEnd(26)} ${fmt(row.meanMs).padStart(8)} ${((100 * row.meanMs) / phaseTotal).toFixed(1).padStart(5)}% ` +
        `${fmt(row.p50Ms).padStart(8)} ${fmt(row.maxMs).padStart(8)} ${fmt(row.monthStartMeanMs).padStart(8)}`,
    );
  }

  let stagedResult: { hashes: Record<string, string>; stats: Stats } | null = null;
  if (staged) {
    start = performance.now();
    stagedResult = runStagedHashes(scenario, days);
    console.log(statsLine("staged mode tick", stagedResult.stats));
  }

  const hashDays = Object.keys(hostRun.hashes);
  const deterministic = hashDays.every((day) => hostRun.hashes[day] === phaseRun.hashes[day]);
  const stagedEqual =
    stagedResult === null ? null : hashDays.every((day) => hostRun.hashes[day] === stagedResult?.hashes[day]);
  console.log(`hashes (host run): ${JSON.stringify(hostRun.hashes)}`);
  console.log(`two independent runs identical: ${deterministic ? "PASS" : "FAIL"}`);
  console.log(`staged mode equals phase mode: ${stagedEqual === null ? "not run" : stagedEqual ? "PASS" : "FAIL"}`);

  const saveLoad = await measureSaveLoad(hostRun);
  console.log(
    `save: SAVE command ${fmt(saveLoad.saveCommandMs)} ms + library replace ${fmt(saveLoad.libraryReplaceMs)} ms = ` +
      `${fmt(saveLoad.saveTotalMs)} ms (first save into a new slot ${fmt(saveLoad.libraryCreateMs)} ms); ` +
      `save ${fmt(saveLoad.saveChars / 1e6)} M chars, stored ${fmt(saveLoad.storedChars / 1e6)} M chars`,
  );
  console.log(
    `load: library load ${fmt(saveLoad.libraryLoadMs)} ms + LOAD command ${fmt(saveLoad.loadCommandMs)} ms = ` +
      `${fmt(saveLoad.loadTotalMs)} ms; PREVIEW_SAVE ${fmt(saveLoad.previewMs)} ms; round trip hash equal: ${saveLoad.roundTripHashEqual ? "PASS" : "FAIL"}`,
  );

  const throughput = measureThroughput(hostRun, throughputDays);
  console.log(
    `host throughput at 30 days/s: ${fmt(throughput.daysPerSecond)} days/s over ${String(throughput.days)} days ` +
      `(${String(throughput.snapshots)} snapshots, ${fmt(throughput.wallMs / 1000)} s)`,
  );
  console.log("device performance: NOT EVALUATED (Node diagnostic)");

  if (outPath !== undefined) {
    writeFileSync(
      outPath,
      `${JSON.stringify(
        {
          environment,
          days,
          scenarioLoadMs,
          newGame,
          host: {
            total,
            ordinary,
            tick: stats(hostDays.map((day) => day.tickMs)),
            snapshot: stats(hostDays.map((day) => day.snapshotMs)),
            encode: stats(hostDays.map((day) => day.encodeMs)),
            heap,
            snapshotChars: snapshotBytes,
            days: hostDays,
          },
          phases: phaseTable,
          staged: stagedResult?.stats ?? null,
          hashes: hostRun.hashes,
          deterministic,
          stagedEqual,
          saveLoad,
          throughput,
        },
        null,
        2,
      )}\n`,
    );
    console.log(`wrote ${outPath}`);
  }
  if (!deterministic || stagedEqual === false || !saveLoad.roundTripHashEqual) process.exitCode = 1;
}

void main();
