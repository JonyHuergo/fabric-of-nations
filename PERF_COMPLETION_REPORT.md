# Performance stage completion report

Date: 2026-11-03. Branch: `perf/10x`. Baseline commit: `22af862` (benchmark harness and
recorded baseline); stage start commit `97cf30f`; this report covers the whole branch.
Nothing is merged to `main`.

## 1. Scope and outcome

The stage brief asked for:

- host-path day **mean and p50 ≤ 1/10 of the recorded baseline** over 92+ days;
- **month start ≤ 3×** the ordinary-day p50;
- **save and load ≤ 1/10** of baseline;
- **new game ≥ 5× faster**;
- determinism, and outcomes bit-identical where possible.

Result: **month start, determinism and bit-identity pass.** Host day, save/load and new
game improved substantially but **do not reach 10×**. This report gives the measured
before/after table per acceptance item and per phase, and the measured reasons the
remaining criteria are not met. No criterion is claimed as passing that was not measured.

## 2. What changed

All changes are recorded in `DECISIONS.md` D-137. In order of effect:

- **Baseline harness** (`22af862`): `pnpm -F @century/bench perf [days]` measures new game,
  the worker host path (`STEP`: tick + snapshot + JSON), a per-phase stopwatch through the
  rollback runner, save/load/`PREVIEW_SAVE`, heap, hashes and the staged cross-check. The
  phase stopwatch uses an optional `TickContext.phaseObserver` that the simulation calls
  with a phase name and never reads back.
- **Bit-identical indexing** (`2b88e88`, `d821a48`): market demand bucketed per market
  once, per-good lot books instead of re-parsed `"good:owner"` strings, shared capacity
  index, settlement ordering by precomputed field ranks instead of string keys,
  `financeInPlace` for phases inside the integrated day, migration/employment/AI/month-end
  lookups, a memoised keyed-RNG purpose prefix, and whole-world validation consolidation
  at the month end. The 64-day 1900-world reference trace stayed line-identical.
- **Snapshot presentation cache** (`a3c7d0b`): host-owned cache for static sections,
  immutable closed-summary totals, per-country finance history and price indexes. A cached
  snapshot is JSON-identical to an uncached one. Snapshot build fell from ~156 ms baseline
  to ~50 ms (p50 47 ms in the acceptance run).
- **Result detail level** (`97cf30f`): `TickContext.detail: "summary"` for callers that do
  not read diagnostic lists (the worker host). It skips diagnostic sorts/copies and the
  per-good needs detail; the world outcome is identical (33-day trace, and the acceptance
  run's host and phase hashes agree).
- **Save format 2 and stored form** (`97cf30f`): column tables for accounts, pop blocks,
  buildings, employment, provinces and period account totals; one canonicalisation of the
  payload; checksum over the text; `fon-save-deflate2:` stored form (metadata line +
  deflate level 1 + base64) produced by the worker; protocol 18; format-1 saves listed as
  incompatible. `stableStringify` fast path and faster FNV.
- **Audit-batch and ordering savings** (`668be68`, `a6d2c99`): journal batches materialise
  only the postings that survive the 256-entry audit buffer and accumulate deltas directly;
  settlement opening cash in a dense account-id table and no duplicate market-delta pass;
  `inIdOrder` avoids per-day sort copies for entity arrays kept in id order; duplicate
  employment validation and two 30k-record demand sorts removed.
- **Generated worker bundle** (`f6fadb0`) regenerated; scenario data unchanged.

## 3. Commands and results

| Command | Result |
|---|---|
| `pnpm typecheck` | **passed** |
| `pnpm lint` (boundary checks) | **passed** (298 TS files, 71 in `packages/sim`) |
| `pnpm audit:monetary` | **passed** (537 current files, 67 documented legacy aliases, 4 historical) |
| `pnpm run bench:world` | **passed**: staged and phase p50 990.7 / 503.2 ms; hash `2378849b1151277d`; phase reproduces staged |
| `node packages/bench/dist/perfTrace.js 64` | **identical** to `docs/perf/trace-baseline.txt` on all 65 lines (days 0–64) |
| `node packages/bench/dist/perfBench.js 92 --out docs/perf/after.json` | see §4 |
| `node scripts/perf/playtest-stage.mjs` (headless Chrome, 844×390) | **passed** 13/13 checks: viewport, new campaign, fastest speed, save, load, no console errors/exceptions/failed loads |
| `pnpm test` (full) | **1,323 passed, 4 failed** (1,327); the 4 are `m11-flags` ×2 (expected, unchanged committed flag provenance/doc outputs) and `m13-branding` + `m14-rusd` (both caused by this branch and fixed afterwards: the format-1 save is now refused by format version, and the monetary audit pins protocol 18). Both fixed suites were rerun and pass (15/15). A final full run was started after the fixes; see §8. |

Device performance was **not evaluated**. All timings are Node 24.22.1 diagnostics on
Windows x64, AMD Ryzen 5 2600 (12 logical processors), 7.93 GiB, as the brief requires.

## 4. Acceptance measurements

Environment as above. 1900 world: 5,687 blocks, 3,276 buildings, 1,687 provinces, 63
markets, 67 countries, 111,645 accounts, 168 routes; 92-day window from 1 January 1900.

| Acceptance item | Baseline | 1/10 or 5× target | Measured | Ratio | Verdict |
|---|---|---|---|---|---|
| Host day mean | 2,356 ms | ≤ 236 ms | **626 ms** | 3.8× faster | **not met** |
| Host day p50 | 2,190 ms | ≤ 219 ms | **563 ms** | 3.9× faster | **not met** |
| Month start vs ordinary p50 | 3.09–3.35× | ≤ 3× | **2.15–2.49×** | — | **PASS** |
| Save (`SAVE` + library replace) | 5,364 ms | ≤ 536 ms | **1,062 ms** | 5.1× faster | **not met** |
| Load (library + `LOAD`) | 5,107 ms | ≤ 511 ms | **1,175 ms** | 4.3× faster | **not met** |
| New game (create + first checkpoint) | 990 ms | ≤ 198 ms (5×) | **623 ms** | 1.6× faster | **not met** |
| Determinism | — | required | **PASS** (two independent runs, 92 days) | — | **PASS** |
| Bit-identical outcomes | — | where possible | **PASS** (64-day trace, hash days 1/31/32/92 equal baseline) | — | **PASS** |
| Staged = phase mode | — | required | **PASS** | — | **PASS** |
| Save round-trip hash | — | required | **PASS** | — | **PASS** |

Host day composition in the acceptance run: tick mean 568 / p50 509; snapshot build mean
50.2 / p50 46.8; JSON encode of events mean 7.2 / p50 6.8. Ordinary days p50 557 ms
(85 days); month ends 2.06–2.14×; host throughput at 30 days/s 1.83 days/s.

The earlier intermediate run after the first optimisation batch measured host p50 548,
mean 610, save 1,038, load 1,148 and new game 639. Run-to-run variation on this machine
is about ±3% for day statistics and ±10% for the save/load steps; the table above is the
run written to `docs/perf/after.json`.

The "current numbers" quoted at the start of this stage (host p50 ~630, mean ~700, save
987, load 780, new game 578) are the **33-day** intermediate window, where the canonical
save is ~9–11 M characters. The acceptance window is 92+ days, and the save grows with the
closed monthly period summaries: 8.9 M characters on a fresh world, 14.9 M at day 92.
Save and load are therefore measured here at their 92-day values, which is the acceptance
condition; a 33-day run of this build measures save 998 / load 1,025.

## 5. Per-phase before/after

Phase stopwatch through the rollback runner, mean ms/day, full result detail, same world
and window as the baseline (`docs/perf/baseline.json`). The host benefits further from
`detail: "summary"` and the snapshot cache.

| Phase | Baseline | After | Ratio |
|---|---:|---:|---:|
| market-clearing | 492 | 124 | 4.0× |
| settlement | 357 | 164 | 2.2× |
| trade-dispatch | 300 | 16.6 | 18× |
| migration | 167 | 27.1 | 6.2× |
| ai | 136 | 20.6 | 6.6× |
| education | 114 | 15.3 | 7.5× |
| training | 93.4 | 6.66 | 14× |
| fiscal | 87.5 | 27.6 | 3.2× |
| debt | 84.3 | 1.79 | 47× |
| needs | 78.6 | 41.8 | 1.9× |
| trade-arrivals | 65.3 | 2.17 | 30× |
| demography | 63.0 | 50.8 | 1.24× |
| finance-close | 35.1 | 9.12 | 3.8× |
| market-household-demand | 34.7 | 27.2 | 1.28× |
| politics | 31.9 | 9.48 | 3.4× |
| unrest | 26.5 | 5.04 | 5.3× |
| validate-month-end | 25.8 | 7.19 | 3.6× |
| employment | 17.0 | 12.3 | 1.4× |
| monetary | 9.25 | 3.66 | 2.5× |
| fingerprint | 7.45 | 8.12 | ~1.0× (noise) |
| invariants-start / end | 6.57 / 5.39 | 3.20 / 2.87 | 2.1× / 1.9× |
| checkpoint | 3.05 | 0.69 | 4.4× |
| day-result | 2.12 | 2.03 | ~1.0× |
| labor-month-start | 1.49 | 0.28 | 5.3× |
| wealth, military, day-preconditions, industrial-subsidy, construction, business-tax | 1.07, 0.59, 0.57, 0.36, 0.23, 0.02 | 1.09, 0.63, 0.46, 0.40, 0.26, 0.02 | ~1× |

Migration, employment and finance-close carry their monthly spike in the `max` column
(581, 121 and 324 ms) but are flat on ordinary days.

## 6. Save, load and new game breakdown (measured)

On the 92-day world (14.92 M canonical characters, 5.11 M stored characters):

| Step | Time |
|---|---:|
| `serializeWorld` (validation ~252 + encode/payload + canonical text + checksum) | 880 ms |
| deflate level 1 (fflate, 14.92 M chars) + base64 | 441 ms |
| `SAVE` total | ~1,062 ms measured in the acceptance run |
| base64 decode + inflate | 193 ms |
| `deserializeWorld` (JSON parse + column decode + build + full validation) | 950 ms |
| `LOAD` total (library + decode + rollback checkpoint clone + snapshot) | ~1,175 ms |
| `PREVIEW_SAVE` (inflate + metadata) | 1,214 ms in the acceptance run |

`createEconomyWorld` is 470 ms of the 623 ms new game (first checkpoint 152 ms; the
`CREATE_GAME` command 528 ms). Of the 470 ms, a full `assertValidWorld` of the newly built
world is 142 ms, account allocation/opening balances about 65 ms, population construction
about 80 ms, and politics/institution/interest-group initialisation about 95 ms.

## 7. Why 10× is not reached (measured, not inferred)

1. **The remaining day time is per-entity work, not a duplicated pass.** Settlement (164),
   market clearing (124), demography (51) and needs (42) are 381 of the ~605 ms phase
   total. They validate and price ~40,000 transactions, allocate 63 markets over 5,687
   blocks and update ~910,000 age cells every day. Reaching a 219 ms host day needs the
   tick near 160 ms, i.e. removing roughly 70% of this work. Indexing and allocation
   savings have taken the largest easy factors (many phases are 3–47× faster); what remains
   needs a structural data layout (typed-array demand/settlement pipeline and a shared
   typed-array population pool) rather than another map or sort removal.
2. **Save/load cannot meet 1/10 while the canonical save is 14.9 M characters and the
   compressor is JavaScript.** Deflate level 1 alone is 441 ms and JSON parse + decode +
   full validation is ~1.1 s at 92 days; the 536/511 ms targets are below those floors on
   this machine. A binary save or a native compressor would be a format/platform change
   outside this stage; the 10× save target is therefore reported as unreachable with the
   approved pure-JavaScript cross-platform storage.
3. **New game cannot meet 5× (198 ms) while a constructed world is fully validated.** The
   validation alone is 142 ms and the rest of construction (accounts, population,
   politics) is real initialisation. Removing validation from a freshly constructed world
   would violate the state-validation rule; the 5× criterion is reported as not met.
4. **Web storage limit (observed, pre-existing).** Saving a mid-campaign at day 8 in
   headless Chrome fails with a `localStorage` quota error: the stored form is written as
   staging + primary + previous copies, and at 8 days the stored form is already ~2 MB
   (5.11 MB at 92 days). The baseline stored form was larger (6.2 M characters), so this is
   a pre-existing web-storage constraint, not a regression; mobile AsyncStorage has no such
   quota. The browser check therefore saves at day 0 and then loads, then runs the fastest
   speed; the quota limit is recorded here rather than hidden.

## 8. Verification status and remaining work

- Full suite after the fixes: the previous full run (1,327 tests) failed only the two
  expected `m11-flags` checks and the two branch-caused checks now fixed and individually
  rerun. A final full run is the last gate; its result is recorded in the completion
  message / commit note rather than assumed here.
- `pnpm -F @century/app build:worker` regenerated the committed bundle (4,833 KiB script,
  one 4,577,089-byte scenario module dominates). `worker-bundle-drift` passed on the
  regenerated bundle.
- Browser check at 844×390 passed: new United States campaign, fastest speed (30×),
  manual save and load at day 0, 13/13 checks, no console errors, no exceptions, no failed
  resource loads. Screenshots and evidence: `docs/images/perf/stage-844x390-*.png`,
  `docs/images/perf/browser-check.json`.
- Device performance remains the designer's to test (AGENTS.md §2); nothing here claims a
  device result.

## 9. Files created or modified in this report's work

Created: `packages/sim/src/ordering.ts`, `docs/perf/after.json`,
`docs/perf/trace-current.txt`, `docs/images/perf/*`, `scripts/perf/playtest-stage.mjs`,
this report.

Modified: `packages/sim/src/economy/{accounting,settlement,day,fiscal,politics,ai}.ts`,
`packages/tests/src/{m7-worker,m13-branding}.test.ts`,
`scripts/m14/monetary-terminology-audit.mjs`, `scripts/m11d/lib/harness.mjs`,
`packages/app/src/generated/simWorker.ts`, `DECISIONS.md` (D-137).

The worktree `C:\vibe-games\century-base` (baseline build) was not needed after the
recorded baseline and was left in place.
