# Century — GDD v2.8 Change Report (M7a)

- **GDD:** `Century_GDD_v2.8.md` (authoritative)
- **Revision date:** 2026-10-27
- **Baseline:** E1 documentation commit `4d697aa131d7d6e60782665d62e8caa9bb9fc5f9`
- **Implementation:** code/tests/bundle commit `c8b2e4cd72aa049243c07dfdb413e00c708d07cf`
- **Scope:** M7a — Annual Accounting only. E2–E6 and M8a are not implemented.
- **Projection:** no benchmarks, performance measurements, or campaigns were run.

## 1. Source-defined M7a scope

GDD v2.7 §17.3 required:

- annual finance summaries and explicit annual-period boundaries;
- year-end closing treatment consistent with the M4b monthly close;
- partial first/last campaign years and no processed 2000 year;
- controlled auditable correction/reversal entries that never edit or delete closed
  history;
- deterministic ordering, atomicity, validation, persistence, and reconciliation.

M7a implements all of those. It does not add E2 fiscal controls, construction,
industrial policy, trade, monetary policy, or a UI ledger.

## 2. Annual flow and balance semantics

Annual periods are civil calendar years. The summary is appended immediately after the
31 December monthly close, before `dayIndex` advances. The December monthly close is
the year-end closing entry: revenue and expense are zeroed into owner equity, cash is
unchanged, owner/account ordering is deterministic, and the accounting identity is
preserved. M7a adds **no second closing entry**, so annual totals cannot double-count
the monthly close.

Annual flows:

- income tax, welfare expense, and interest expense are exact sums of that year's
  monthly `countryFiscalTotals`;
- net fiscal result is `tax − welfare − interest`;
- the four world gross flow kinds are summed.

Annual balances are year-end stocks, not flows:

- treasury cash;
- debt principal liability (`debt-liability`);
- interest payable.

A summary does not retain an annual account-level trial balance. It stores compact
per-country totals and balances.

Boundary rules:

- a campaign starting after 1 January has a partial first year (`complete: false`);
- subsequent years start 1 January and are complete;
- leap years use the existing Gregorian calendar (366 daily transitions in 1904, 1908,
  …), with 12 actual-length monthly closes;
- 1999 closes on 31 December 1999; the terminal `2000-01-01` boundary is not a year and
  never creates an annual 2000 summary;
- annual summaries are contiguous, ordered by year, and reject duplicate/gapped years.

## 3. Controlled corrections

`postFinanceCorrection(world, day, { originalPostingId, reason, lines })` creates a new
balanced `correction` posting and a `FinanceCorrection` record. It:

- validates the current day (rejects terminal/mismatched days), original id, nonempty
  trimmed reason, nonempty balanced lines, account existence, affordability, and the
  accounting identity;
- applies atomically to a cloned finance state; failure leaves `world.finance`
  unchanged;
- preserves the original posting and every closed monthly/annual summary;
- records the new posting id, original posting id, day, reason, and retained lines;
- caps correction records at 64; the audit posting buffer remains 256;
- counts corrections posted during the year in the next annual summary (world-wide,
  not allocated per country).

A prior-period correction lands in the current open period. The annual report exposes
the count; it never rewrites prior-period totals.

## 4. Bounded history and save size

- `FinanceState.annualSummaries`: at most 100 (1900–1999), no account trial balances.
- `FinanceState.corrections`: at most 64 audited records.
- Existing monthly history remains capped at 1,200, with only the latest 12 detailed;
  annual history does not restore account-level summaries.
- Snapshot exposes the latest 12 annual reports per country; older annual summaries
  remain in the save.

No benchmark or save-size measurement was run. The design bounds the added state to
compact per-country annual totals/balances and a small correction audit list; no
performance claim is made.

## 5. Schema/version and compatibility

- World schema **16 → 17**.
- Simulation **0.16.0 → 0.17.0**.
- Save format remains **1**; data version remains **`m3-economy-v3`**.
- Worker protocol **3 → 4** because snapshots gain `CountrySnapshot.annualReports`.
- New state: `FinanceState.annualSummaries`, `corrections`, `nextCorrectionId`.
- New internal transaction kind `correction`; the public posting APIs still reject
  internal kinds. `postFinanceCorrection` is the only entry point.
- Serialization/deserialization, canonical hashing, validation, clone isolation,
  app save-schema constant, and known-answer hashes were updated.
- Schema-16 saves are rejected under the existing policy; no migration is authorized.

## 6. E1 integration

The Ledger adds an **Annual accounting** section:

- latest closed year, complete/partial label, and period;
- annual tax, welfare, interest, and net flows;
- year-end treasury, debt principal, and interest payable balances;
- controlled-correction count;
- recent annual summaries.

The UI states that annual flows are sums of monthly closes, balances are stocks,
partial years are labelled, and corrections never rewrite history. No GDP, inflation,
real-income, unemployment, or fabricated market history was added.

## 7. Tests and verification

New `packages/tests/src/m7a-annual-accounting.test.ts` covers:

- complete-year monthly-to-annual reconciliation and year-end treasury;
- leap-year close after 366 daily transitions;
- partial first year and terminal 1999/no 2000;
- save/load continuation and deterministic annual ordering;
- monthly compaction while annual history survives;
- serialization round trip and snapshot annual reports;
- controlled correction applied once, monthly summaries unchanged, invalid correction
  rollback, and annual correction count.

Existing tests updated for schema 17, protocol 4, fixtures, and intentional
known-answer hash changes.

| Command | Result |
|---|---|
| `pnpm run lint` | PASS — boundary checks (147 TypeScript files, 47 sim) |
| `pnpm run typecheck` | PASS — all six workspace packages |
| `pnpm -F @century/tests test -- m7a-annual-accounting` | PASS — 1 suite, 7 tests |
| `pnpm test` | PASS — 58 suites, 603 tests (646.6 s) |
| `pnpm -F @century/app build:worker` | PASS — 367.3 KiB script / 367.5 KiB html |
| `pnpm run check:worker` | PASS — scenario and worker bundle current |
| focused worker/E1 tests | PASS — 3 suites, 19 tests |
| `git diff --check` | see delivery report |

**Deliberately deferred:** `pnpm run ci`, all benchmarks, performance measurements,
Expo exports, native builds, stress/soak tests, and new campaign-scale performance
runs. The required repository-wide `pnpm test` was run and includes the pre-existing
M1/M2 century correctness regressions; these are not benchmark measurements. Existing
benchmark reports are historical only and were not regenerated.

## 8. Limitations and deferred dependencies

- Annual reports are persisted for all campaign years but only the latest 12 are in the
  snapshot.
- Corrections are an administrative API, not a player action. No reopen, audit
  institution, inflation adjustment, or annual tax assessment.
- If an original posting has left the bounded audit buffer, the correction retains its
  id/reason but cannot display the original lines from the buffer.
- M8a/E2–E6 remain unimplemented; CEN-AUDIT-016 sovereignty remains unresolved.
- Native/device verification remains the M7 exception.

## 9. Files

- `Century_GDD_v2.8.md` — new authoritative GDD; v2.7 retained.
- `GDD_V2.8_CHANGE_REPORT.md` — this report.
- `README.md`, `DECISIONS.md` — status and D-072.
- `packages/sim/src/constants.ts`, `world.ts`, population state,
  `economy/types.ts`, `constants.ts`, `period.ts`, `validation.ts`, `accounts.ts`,
  `accounting.ts`, `corrections.ts`, `serialization.ts`, `economy/index.ts`.
- `packages/sim-worker/src/protocol.ts`, `snapshot.ts`, `reports.ts`.
- `packages/app/src/screens/LedgerScreen.tsx`, `packages/app/src/storage/saveStorage.ts`,
  generated worker bundle.
- `packages/tests/src/m7a-annual-accounting.test.ts` and updated fixtures/hashes.

Commit hashes, parent relationships, final HEAD, and clean-tree state are in the
delivery report.
