# Performance stage 2 report

Date: 2026-11-04. Branch `perf/10x`. Decision D-139 (designer: 10× against the D-137
baseline is required before P3; architecture may change; saves may break). This stage
continues `PERF_COMPLETION_REPORT.md` (stage 1, D-137).

## 1. Outcome

**Accepted as complete by the designer on 2026-11-04** (D-139): the 10× precondition
for P3 is lifted; the unmet targets below remain open performance work.


**10× is not reached yet.** The host day is now 6.6× (mean) and 7.2× (p50) faster than
the baseline, the first new campaign is 15.7× faster, and save and load are about 5× and
4.4× faster (unchanged in this stage). Every simulation change in this stage is
**bit-identical**: the world hashes at days 1, 31, 32 and 92 equal the baseline's, and the
64-day reference trace is reproduced. The month-start criterion, which passed after
stage 1, now fails: month starts are faster in absolute terms but ordinary days improved
more, so the ratio rose.

## 2. Acceptance measurements

`node packages/bench/dist/perfBench.js 92` on the 1900 world (5,687 blocks, 3,276
buildings, 1,687 provinces, 63 markets, 111,645 accounts), Node 24.22.1, Windows x64,
AMD Ryzen 5 2600, 7.93 GiB. Run-to-run variation on this machine is about ±5% for day
statistics and ±10% for save and load.

| Item | Baseline | Target | Stage 1 | **Now** | vs baseline | Verdict |
|---|---:|---:|---:|---:|---:|---|
| Host day mean | 2,356 ms | ≤ 236 | 626 | **356** | 6.6× | not met |
| Host day p50 | 2,190 ms | ≤ 219 | 563 | **303** | 7.2× | not met |
| Month start ÷ ordinary p50 | 3.09–3.35× | ≤ 3× | 2.15–2.49× | **3.08–3.53×** | — | **not met (regressed ratio)** |
| Save (SAVE + library) | 5,364 ms | ≤ 536 | 1,062 | **1,094** | 4.9× | not met |
| Load (library + LOAD) | 5,107 ms | ≤ 511 | 1,175 | **1,173** | 4.4× | not met |
| New game: first CREATE_GAME from the menus | 990 ms | ≤ 198 | 504 | **63** | 15.7× | **met** |
| New game: world construction + checkpoint (sim) | 990 ms | — | 637 | 538 | 1.8× | moved to worker start |
| Determinism (two runs) | — | required | PASS | **PASS** | | |
| Bit-identical outcomes | — | where possible | PASS | **PASS** (hashes = baseline) | | |
| Staged = phase mode | — | required | PASS | **PASS** | | |
| Save round-trip hash | — | required | PASS | **PASS** | | |

Host day composition: tick mean 310 / p50 260; snapshot build mean 39.4 / p50 37.3;
event JSON 6.2. Ordinary days p50 301 ms. Host throughput at 30 days/s: 3.09 days/s
(stage 1: 1.83). Heap used p50 482 MiB.

The new-game figure is the first `CREATE_GAME` on a fresh worker host (median of three,
session probe; `perfBench` now prints it as "first
CREATE_GAME on a fresh host"). The worker builds the 1900 world when it starts (about
460–550 ms, behind the title screen) and the first campaign reuses it; a second campaign
in the same session still rebuilds (468 ms).

## 3. What changed

See D-139 "Second performance stage". In short: a columnar market, production and
settlement core with lot tables and typed columns; household demand and fulfilment as
columns between phases; settlement ordering by a radix sort that reproduces the canonical
key order; market postings applied from line columns with deferred audit materialisation;
owner tables in the finance index; indexed loops and fixed-arity tolerance helpers
(allocation per simulated day fell from about 270 MiB to about 200 MiB, GC from 23.5 to
about 20 ms/day); per-band demography rates; no repeated definition validation inside the
integrated day; and the first-campaign reuse of the startup world.

A regression found by the acceptance bench was fixed before this report: journal batches
first used typed scratch sized to every account, which made migration's many small
batches allocate 111k-element arrays each (month-start migration 2.6 s). Small batches
now accumulate in a map by account position; both paths keep the same summation order.

## 4. Commands and results

| Command | Result |
|---|---|
| `pnpm test` | **passed: 1,337 / 1,337** (112 suites) |
| `pnpm typecheck` | **passed** |
| `pnpm lint` | **passed** (306 TS files, 71 in `packages/sim`) |
| `pnpm map:atlas:check` | **current** after `pnpm map:atlas` (the LF checkout of D-139 changed the token file's bytes, so its recorded hash) |
| `docs/perf/check-trace.sh 8`, 40-day trace, `--summary` trace | **identical** to `docs/perf/trace-baseline.txt` |
| `node packages/bench/dist/perfBench.js 92` | see §2 |
| `node scripts/perf/playtest-stage.mjs` (headless Chrome, 844×390) | **passed 13/13**: new campaign, save, load, 30× speed, no console errors, exceptions or failed loads |

Device performance was **not evaluated**; it is the designer's to test.

## 5. Where the remaining time is (measured)

Ordinary day, `perfPhases` (summary detail), about 265 ms of tick: settlement 58,
market clearing 46, demography 29, needs 18, fiscal 15, trade dispatch 14, education 13,
household demand 10, production demand 9, politics 7, migration 6, employment 6,
training 6, unrest 5, and about 25 ms of smaller phases. GC is about 20 ms of it.

Snapshot (about 40 ms per STEP): player-country sections 12 (education derived twice, a
second capacity index), province economies 6, production capacities 5.5 (capacity
recomputed for every building), country summaries 5, price indexes and market
populations 5.5.

Save at day 92 (`perfSave`): serialize 694 ms (validation about 250, canonical stringify
155, checksum 74, period-summary encoding 71, column payload 70) + compress 331.
Load: decompress 179 + deserialize 639 (validation about 345, finance and summary
decoding 100, payload 72, parse 68). Twelve monthly summaries keep a trial balance of
about 111k accounts each, so save and load grow for the first campaign year.

## 6. Proposed next steps (not implemented)

1. **Save/load (largest gap).** Keep account-level detail for the latest closed period
   only and add per-country closing balances (treasury, debt, household cash) to every
   summary, so the Ledger's "change vs prior close" keeps working and the save stays
   bounded; a binary container for the large numeric columns; a faster save checksum
   (save format 3). Deflate dominates both directions and needs a smaller payload.
2. **Tick.** Continue the columnar rewrite into settlement wages and upkeep, needs and
   demand objects, fiscal, trade dispatch (string lot keys) and education; cut the per-day
   result objects the host never reads.
3. **Month start.** Migration's `splitMigrantsByCell` and the month-start employment and
   politics refreshes now dominate the month-start ratio.
4. **Snapshot.** Share the tick's capacity results and education derivation.
