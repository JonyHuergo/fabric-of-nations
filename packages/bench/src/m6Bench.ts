/**
 * M6 country-AI benchmark.
 *
 * `runM6BoundedBenchmarks` is part of `pnpm run bench`: a representative
 * eight-polity sample and a doubled-block/building stress fixture, both with
 * ongoing AI evaluations. `runM6FullCampaignBenchmark` executes all 36,524
 * campaign ticks and is invoked by `pnpm run bench:campaign`; it is intentionally
 * not part of the default CI benchmark because it takes roughly an hour on the
 * recorded Node machine.
 */

import {
  CAMPAIGN_TERMINAL_DAY_INDEX,
  CAMPAIGN_TICKS,
  MAX_AUDIT_POSTINGS,
  MAX_PERIOD_SUMMARIES,
  createEconomyWorld,
  hashWorld,
  populationTotal,
  serializeWorld,
  tick,
  type EconomyScenarioDef,
  type TickContext,
  type World,
} from "@century/sim";
import { loadM5EightPolities } from "@century/data";

const M6_SEED = 20_261_023;
const M6_RUNS = 2;
const M6_WARMUP_TICKS = 1;
const M6_BOUNDED_TICKS = 14;
const M6_STRESS_TICKS = 14;
const M6_STATE_CHECKPOINT_TICKS = 3_652;

interface Stats {
  readonly count: number;
  readonly totalMs: number;
  readonly averageMs: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
}

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1));
  return sorted[index] ?? 0;
}

function stats(samples: readonly number[]): Stats {
  const sorted = [...samples].sort((left, right) => left - right);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  return {
    count: sorted.length,
    totalMs: total,
    averageMs: sorted.length > 0 ? total / sorted.length : 0,
    p50Ms: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    p99Ms: percentile(sorted, 0.99),
  };
}

function formatMs(value: number): string {
  if (value >= 100) return value.toFixed(1);
  if (value >= 10) return value.toFixed(2);
  return value.toFixed(3);
}

function contextFor(scenario: EconomyScenarioDef): TickContext {
  return {
    population: { definitions: scenario.population.definitions },
    economy: { definitions: scenario.definitions },
  };
}

function structuralCounts(world: World): {
  readonly countries: number;
  readonly provinceEconomies: number;
  readonly markets: number;
  readonly blocks: number;
  readonly buildings: number;
  readonly employment: number;
  readonly population: number;
} {
  return {
    countries: world.countries.length,
    provinceEconomies: world.provinceEconomies.length,
    markets: world.markets.length,
    blocks: world.popBlocks.length,
    buildings: world.buildings.length,
    employment: world.employment.length,
    population: world.popBlocks.reduce((total, block) => total + populationTotal(block), 0),
  };
}

/** Duplicate blocks and buildings to produce a larger AI-evaluation stress world. */
function stressScenario(base: EconomyScenarioDef): EconomyScenarioDef {
  const extraBlocks = base.population.popBlocks.map((block, index) => ({
    ...block,
    id: base.population.popBlocks.length + index,
    financialAccountId: 600_000 + index,
    maleAgeGroups: [...(base.population.popBlocks[index]?.maleAgeGroups ?? [])],
    femaleAgeGroups: [...(base.population.popBlocks[index]?.femaleAgeGroups ?? [])],
  }));
  const extraBuildings = base.buildingInstances.map((building, index) => ({
    ...building,
    id: base.buildingInstances.length + index,
    operatingCashAccountId: 500_000 + index,
    initialOperatingCashRUSD: 10_000,
  }));
  return {
    ...base,
    population: {
      ...base.population,
      popBlocks: [...base.population.popBlocks, ...extraBlocks],
    },
    buildingInstances: [...base.buildingInstances, ...extraBuildings],
    employment: [],
    countryAI: { enabled: true },
  };
}

interface AiDaySummary {
  readonly evaluations: number;
  readonly applied: number;
  readonly rejected: number;
}

/**
 * Benchmark-only fiscal stress trigger. The post-D-062 historical sample is
 * solvent enough that the bounded 14-tick sample can legitimately produce zero
 * AI actions, which would make the "applied > 0" gate vacuous. Seed one
 * AI-controlled country (never the player country) with a welfare commitment it
 * cannot reserve against its opening treasury, so the deterministic
 * restore-solvency rule exercises the shared action path. This does not change
 * the shipped scenario.
 */
function applyBenchmarkFiscalTrigger(scenario: EconomyScenarioDef): void {
  const country = scenario.countries?.find(
    (candidate) => candidate.id !== (scenario.playerCountryId ?? null),
  );
  if (country === undefined) return;
  country.fiscal.welfareBudgetRUSDPerYear = 10_000_000;
  country.initialTreasuryCashRUSD = 0;
}

function countAiDay(result: ReturnType<typeof tick>): AiDaySummary {
  const phase = result.economy?.ai;
  return {
    evaluations: phase?.evaluated.length ?? 0,
    applied: phase?.appliedActionCount ?? 0,
    rejected: phase?.rejectedActionCount ?? 0,
  };
}

/** Bounded M6 benchmark used by `pnpm run bench`. */
export function runM6BoundedBenchmarks(): boolean {
  const scenario = loadM5EightPolities();
  if (scenario.countryAI?.enabled !== true) {
    throw new Error("the M6 benchmark requires the historical sample's AI policy enabled");
  }
  applyBenchmarkFiscalTrigger(scenario);
  const context = contextFor(scenario);
  const runSamples: number[][] = [];
  const hashes: string[] = [];
  let finalWorld: World | null = null;
  let evaluations = 0;
  let applied = 0;
  let rejected = 0;

  for (let run = 0; run < M6_RUNS; run += 1) {
    const world = createEconomyWorld(scenario, { seed: M6_SEED });
    for (let index = 0; index < M6_WARMUP_TICKS; index += 1) tick(world, context);
    const samples: number[] = [];
    let runEvaluations = 0;
    let runApplied = 0;
    let runRejected = 0;
    for (let index = 0; index < M6_BOUNDED_TICKS; index += 1) {
      const start = process.hrtime.bigint();
      const result = tick(world, context);
      samples.push(Number(process.hrtime.bigint() - start) / 1_000_000);
      const day = countAiDay(result);
      runEvaluations += day.evaluations;
      runApplied += day.applied;
      runRejected += day.rejected;
    }
    evaluations = Math.max(evaluations, runEvaluations);
    applied = Math.max(applied, runApplied);
    rejected += runRejected;
    runSamples.push(samples);
    hashes.push(hashWorld(world));
    finalWorld = world;
  }
  if (finalWorld === null) throw new Error("M6 benchmark did not run");
  const runStats = runSamples.map(stats);
  const combined = stats(runSamples.flat());
  const deterministic = new Set(hashes).size === 1;
  const counts = structuralCounts(finalWorld);
  const invalid = finalWorld.diagnostics.invalidActionCount;

  // Doubled-block/building stress fixture. Fourteen ticks cover every country's
  // staggered seven-day AI evaluation at least twice.
  const stress = stressScenario(scenario);
  const stressWorld = createEconomyWorld(stress, { seed: M6_SEED });
  const stressContext = contextFor(stress);
  let stressEvaluations = 0;
  let stressRejected = 0;
  const stressSamples: number[] = [];
  for (let index = 0; index < M6_STRESS_TICKS; index += 1) {
    const start = process.hrtime.bigint();
    const result = tick(stressWorld, stressContext);
    stressSamples.push(Number(process.hrtime.bigint() - start) / 1_000_000);
    const day = countAiDay(result);
    stressEvaluations += day.evaluations;
    stressRejected += day.rejected;
  }
  const stressStats = stats(stressSamples);
  const stressCounts = structuralCounts(stressWorld);
  const stressHash = hashWorld(stressWorld);

  console.log("");
  console.log(
    `M6 country-AI sample: ${String(counts.countries)} countries, ${String(counts.provinceEconomies)} provinces, ` +
      `${String(counts.markets)} markets, ${String(counts.blocks)} blocks, ` +
      `${String(counts.buildings)} buildings, ${String(counts.population)} people`,
  );
  for (let index = 0; index < runStats.length; index += 1) {
    const result = runStats[index];
    if (result === undefined) continue;
    console.log(
      `  run ${String(index + 1)}: ${String(result.count)} ticks, avg ${formatMs(result.averageMs)} ms, ` +
        `p50 ${formatMs(result.p50Ms)} ms, p95 ${formatMs(result.p95Ms)} ms, ` +
        `p99 ${formatMs(result.p99Ms)} ms, hash ${hashes[index] ?? "?"}`,
    );
  }
  console.log(
    `  combined: avg ${formatMs(combined.averageMs)} ms/tick, p50 ${formatMs(combined.p50Ms)} ms, ` +
      `p95 ${formatMs(combined.p95Ms)} ms, p99 ${formatMs(combined.p99Ms)} ms`,
  );
  console.log(
    `  AI evaluations ${String(evaluations)}, policy actions applied ${String(applied)}, ` +
      `rejected ${String(rejected)}, invalidActionCount ${String(invalid)}`,
  );
  console.log(
    `M6 AI stress: ${String(stressCounts.blocks)} blocks, ${String(stressCounts.buildings)} buildings, ` +
      `${String(M6_STRESS_TICKS)} ticks, avg ${formatMs(stressStats.averageMs)} ms, ` +
      `p50 ${formatMs(stressStats.p50Ms)} ms, p95 ${formatMs(stressStats.p95Ms)} ms, ` +
      `p99 ${formatMs(stressStats.p99Ms)} ms, AI evaluations ${String(stressEvaluations)}, ` +
      `rejected ${String(stressRejected)}, hash ${stressHash}`,
  );

  const valid =
    deterministic &&
    runStats.every((result) => result.p95Ms > 0) &&
    combined.averageMs > 0 &&
    evaluations > 0 &&
    applied > 0 &&
    rejected === 0 &&
    invalid === 0 &&
    stressEvaluations > 0 &&
    stressRejected === 0 &&
    stressCounts.blocks >= counts.blocks * 2;
  console.log(`M6 country-AI benchmark gates: ${valid ? "PASS" : "FAIL"}`);
  return valid;
}

interface StateCheckpoint {
  readonly tick: number;
  readonly dayIndex: number;
  readonly accounts: number;
  readonly postings: number;
  readonly summaries: number;
  readonly contracts: number;
  readonly evaluations: number;
  readonly invalidActions: number;
}

/**
 * Execute the complete 100-year economic campaign with AI enabled and report
 * p50/p95/p99 tick times plus bounded-state checkpoints. This is the M6
 * "full-campaign benchmark"; it is deliberately opt-in because it is long.
 */
export function runM6FullCampaignBenchmark(): boolean {
  const scenario = loadM5EightPolities();
  applyBenchmarkFiscalTrigger(scenario);
  const context = contextFor(scenario);
  const world = createEconomyWorld(scenario, { seed: M6_SEED });
  const samples: number[] = [];
  const checkpoints: StateCheckpoint[] = [];
  const startedAt = Date.now();
  let evaluations = 0;
  let applied = 0;
  let rejected = 0;

  const recordCheckpoint = (processed: number): void => {
    checkpoints.push({
      tick: processed,
      dayIndex: world.dayIndex,
      accounts: world.finance.accounts.length,
      postings: world.finance.postings.length,
      summaries: world.finance.periodSummaries.length,
      contracts: world.finance.debtContracts.length,
      evaluations,
      invalidActions: world.diagnostics.invalidActionCount,
    });
  };
  recordCheckpoint(0);

  for (let processed = 0; processed < CAMPAIGN_TICKS; processed += 1) {
    const start = process.hrtime.bigint();
    const result = tick(world, context);
    samples.push(Number(process.hrtime.bigint() - start) / 1_000_000);
    const day = countAiDay(result);
    evaluations += day.evaluations;
    applied += day.applied;
    rejected += day.rejected;
    const performed = processed + 1;
    if (performed % M6_STATE_CHECKPOINT_TICKS === 0) {
      recordCheckpoint(performed);
      const elapsedSeconds = (Date.now() - startedAt) / 1000;
      console.log(
        `  M6 campaign ${String(performed)}/${String(CAMPAIGN_TICKS)} ticks ` +
          `(day ${String(world.dayIndex)}, ${(100 * performed / CAMPAIGN_TICKS).toFixed(1)}%, ` +
          `${elapsedSeconds.toFixed(1)} s elapsed)`,
      );
    }
  }
  recordCheckpoint(CAMPAIGN_TICKS);

  const finalStats = stats(samples);
  const endDay = world.dayIndex;
  const saveBytes = serializeWorld(world).length;
  const counts = structuralCounts(world);
  const finalHash = hashWorld(world);
  const accountCounts = new Set(checkpoints.map((checkpoint) => checkpoint.accounts));
  const postingsBounded = checkpoints.every(
    (checkpoint) => checkpoint.postings <= MAX_AUDIT_POSTINGS,
  );
  const summariesBounded = checkpoints.every(
    (checkpoint) => checkpoint.summaries <= MAX_PERIOD_SUMMARIES,
  );
  const terminalReached = endDay === CAMPAIGN_TERMINAL_DAY_INDEX;
  const noInvalidActions =
    rejected === 0 && world.diagnostics.invalidActionCount === 0;
  const saveTargetMet = saveBytes < 4 * 1024 * 1024;
  const valid =
    terminalReached &&
    finalStats.count === CAMPAIGN_TICKS &&
    finalStats.p95Ms > 0 &&
    evaluations > 0 &&
    applied > 0 &&
    noInvalidActions &&
    accountCounts.size === 1 &&
    postingsBounded &&
    summariesBounded;

  console.log("");
  console.log(
    `M6 full campaign: ${String(CAMPAIGN_TICKS)} ticks, seed ${String(M6_SEED)}, ` +
      `${String(counts.countries)} countries, ${String(counts.provinceEconomies)} provinces, ` +
      `${String(counts.markets)} markets, ${String(counts.blocks)} blocks, ` +
      `${String(counts.buildings)} buildings, final population ${String(counts.population)}`,
  );
  console.log(
    `  tick timing: total ${(finalStats.totalMs / 1000 / 60).toFixed(2)} min, ` +
      `avg ${formatMs(finalStats.averageMs)} ms, p50 ${formatMs(finalStats.p50Ms)} ms, ` +
      `p95 ${formatMs(finalStats.p95Ms)} ms, p99 ${formatMs(finalStats.p99Ms)} ms`,
  );
  console.log(
    `  AI evaluations ${String(evaluations)}, policy actions applied ${String(applied)}, ` +
      `rejected ${String(rejected)}, invalidActionCount ${String(world.diagnostics.invalidActionCount)}`,
  );
  console.log(
    `  end day ${String(endDay)} (terminal ${String(CAMPAIGN_TERMINAL_DAY_INDEX)}), ` +
      `hash ${finalHash}, save ${(saveBytes / 1024).toFixed(1)} KiB`,
  );
  console.log("  state checkpoints (tick, day, accounts, postings, summaries, contracts, AI evals):");
  for (const checkpoint of checkpoints) {
    console.log(
      `    ${String(checkpoint.tick)}, ${String(checkpoint.dayIndex)}, ` +
        `${String(checkpoint.accounts)}, ${String(checkpoint.postings)}, ` +
        `${String(checkpoint.summaries)}, ${String(checkpoint.contracts)}, ` +
        `${String(checkpoint.evaluations)}`,
    );
  }
  console.log(
    `  bounded state: constant accounts ${accountCounts.size === 1 ? "PASS" : "FAIL"}, ` +
      `postings <= ${String(MAX_AUDIT_POSTINGS)} ${postingsBounded ? "PASS" : "FAIL"}, ` +
      `summaries <= ${String(MAX_PERIOD_SUMMARIES)} ${summariesBounded ? "PASS" : "FAIL"}`,
  );
  console.log(
    `  GDD 4 MiB save target: ${saveTargetMet ? "MET" : "NOT MET"} ` +
      `(measured ${(saveBytes / (1024 * 1024)).toFixed(2)} MiB at campaign end; ` +
      "M4b retains one pre-close trial balance per month)",
  );
  console.log(`M6 full-campaign benchmark: ${valid ? "PASS" : "FAIL"}`);
  return valid;
}
