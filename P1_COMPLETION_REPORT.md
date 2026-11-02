# P0 + P1 completion report — Prosperity Program

Date: 2026-11-02. Baseline commit: `109ac06`. Nothing is committed; all changes are in
the working tree for review.

## 1. Scope delivered

- **P0 (design, approved):** GDD v2.19 (§17J, superseded-direction markers), decisions
  D-115–D-124, `docs/PROSPERITY_PROGRAM.md`,
  `docs/COMPANIES_AND_CAPITAL_MARKETS_PROPOSAL.md`, `GDD_V2.19_CHANGE_REPORT.md`,
  `AGENTS.md` §1 RUSD definition (D-122).
- **P1a (bit-identical):** D-116 phase validation and checkpoint rollback, used by the
  worker host on every platform; capacity, finance-key, wage, unrest and migration
  indexing; no repeated per-market definition validation; world-scale benchmark.
- **P1b (behaviour changes, approved D-125; recorded D-126/D-127):**
  - D-125: one balanced market posting per (kind, good) instead of one per buyer ×
    seller lot (~21,000 → a few dozen per day); one cash-capped market attempt per day
    instead of a failing full attempt plus a retry on 399 of 400 days.
  - D-126: after daily deaths, only over-assigned blocks are trimmed; the full
    employment reassignment runs monthly (it ran daily before).
  - D-127: a completing project that is its country's only work in progress
    capitalizes the exact account balance, so no float residue remains.

## 2. Files

Created: `packages/sim/src/integrity.ts`, `packages/sim/src/rollback.ts`,
`packages/tests/src/p1-rollback.test.ts`, `packages/bench/src/p1WorldBench.ts`,
`docs/PROSPERITY_PROGRAM.md`, `docs/COMPANIES_AND_CAPITAL_MARKETS_PROPOSAL.md`,
`GDD_V2.19_CHANGE_REPORT.md`, this report.

Modified (simulation): `tick.ts`, `population/types.ts`, `index.ts`, `economy/day.ts`,
`economy/settlement.ts`, `economy/employment.ts`, `economy/construction.ts`,
`economy/production.ts`, `economy/accounts.ts`, `economy/ai.ts`, `economy/market.ts`,
`economy/migration.ts`, `economy/politics.ts`. Worker: `sim-worker/src/host.ts`,
`sim-worker/src/snapshot.ts`; app: `app/src/generated/simWorker.ts` (regenerated).
Scripts: root and bench `package.json` (`bench:world`). Tests updated for the approved
behaviour changes: `m3f-day.test.ts` (same-batch receipts test replaced by the D-125
cash-cap rule test), `batch5-validation.test.ts` (known-answer hash re-pinned, with the
reason), `m4b-save-compaction.test.ts` (calendar-jump fixtures keep in-transit
consignments in transit). Docs: `DECISIONS.md`, `Fabric_of_Nations_GDD.md`,
`AGENTS.md`.

## 3. Commands and results

| Command | Result |
|---|---|
| `pnpm run build:libs` | passed |
| `pnpm typecheck` | passed |
| `pnpm test` (full, after all P1b changes except the final unrest indexing) | 1,295 passed, 3 failed, 1,298 total |
| `pnpm test -- m8-politics p1-rollback batch5-validation determinism` (after the unrest indexing) | 41/41 passed |
| `pnpm lint`, `pnpm audit:branding`, `pnpm audit:monetary`, `pnpm run check:sim-deps` | passed; 0 cycles |
| `pnpm -F @century/app build:worker:check` | worker bundle current |
| `pnpm -F @century/sim-worker scenario:build:check` | reports stale; regenerated content differs only in CRLF line endings |
| 400-day 1900-world trace, P1a phase + rollback vs pre-change staged | identical on all 401 hashes |
| `node packages/bench/dist/p1WorldBench.js 40` before/after unrest indexing | identical hash `a58c99d5536d220b`; phase reproduces staged: PASS |

The three remaining failures — `m11-flags` (two tests: provenance and documentation
outputs reported stale) and `m15-map-bundle` (province source hash) — hash committed
files this work did not modify. They were not rerun on the baseline commit, so their
being independent of this change is inferred from the unchanged inputs, not verified.

## 4. Benchmark (Node diagnostic; device performance not evaluated)

Node v24.22.1, Windows x64, AMD Ryzen 5 2600 (12 threads), 7.93 GiB. 1900 world: 359
blocks, 548 buildings, 20 markets, 12,373 accounts.

| Run | p50 ms/day | p95 | mean |
|---|---|---|---|
| Baseline (before changes, 400 days) | 717 | 1,010 | 805 |
| After P1a, phase + rollback (400 days) | 446 | 617 | 468 |
| After P1b, staged (35 days) | 292 | 556 | 365 |
| **After P1b, phase + rollback (35 days)** | **183** | **296** | **208** |

About 3.9× faster at p50 and 3.4× at p95. The p99 (~870 ms) is the month-start day with
the full employment refresh and migration.

## 5. Uncompleted P1 acceptance criteria

- **≥10× faster 1900-world day: not met (≈3.9×).** The profile is now flat — no
  function above ~6%; GC is 8%. The remaining factor needs structural work: fewer
  per-day allocations (transaction objects, string keys, cloned finance per phase) and
  typed-array storage.
- **Province-scale synthetic benchmark: not built.** Moved into P2, which builds the real
  province world.
- **Typed-array population pool: not built.** Moved into P2 for the same reason.
- "Identical hashes on every existing fixture" holds for P1a. P1b changes trajectories
  by design (D-125/D-126/D-127); the affected known-answer hash is re-pinned with its
  reason.

## 6. Behaviour notes for the designer

- Same-day sales no longer fund a building's inputs beyond its opening cash (D-125).
  On the 1900 world this already happened on 399 of 400 days through the old retry.
- Jobs of workers who die stay vacant until the next monthly refresh (D-126).
- `EconomyDayResult.fallbackUsed` now means "the opening-cash cap bound for at least one
  building".
