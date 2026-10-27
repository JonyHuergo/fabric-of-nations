# Century — GDD v2.7 Change Report (E1)

- **GDD:** `Century_GDD_v2.7.md` (authoritative)
- **Revision date:** 2026-10-27
- **Baseline:** E0 documentation commit `252cc67d84234782bc7f5fb2abdf640d131a38c1`
- **Implementation:** code/test/bundle commit `90160ce2f9b9570034b37f08f44f767502f790cd`
- **Scope:** E1 — Economic Clarity and Monthly Reports only. E2–E6 are not implemented.

## 1. Purpose

E1 turns the six-screen M7 prototype into an interface that helps the player answer:
what is happening, why, what can I do, can I afford it, and did it work. It improves
the use of existing mechanics. It does not add a tax, spending, construction,
industrial, trade, labor-law, monetary, or regulation mechanic.

The E0 design specification is preserved in GDD v2.7 §17A. GDD v2.6 is retained as
historical E0 documentation.

## 2. Delivered interface

### Overview (default tab)

The former Country screen is now the national economic overview. It includes:

- Player/AI identity with an explicit badge, so AI-controlled countries cannot be
  mistaken for the player's.
- Population, working-age, employed, hardship, treasury, and debt with stock labels.
- Evidence-based "what needs attention" panels with observations, supporting fields,
  caveats, and a target screen.
- Estimated production capacity by good, labelled as capacity (not realized production
  or demand).
- Current essential-goods stock, prices, and domestic capacity.
- Latest closed month flows and end-of-close balances, with flow/balance distinction.
- Drill-down guidance to Markets, Population, Budget, and Ledger.

### Screen improvements

- **Budget:** pre-commitment preview for the existing income-tax/welfare action:
  affected country, current estimated wage base, current/proposed values, daily/monthly
  static deltas, treasury/latest interest, and constraints. Preview does not mutate
  authoritative state.
- **Population:** household cash (stock), estimated daily wage base (current-base
  estimate), working-age-not-employed residual (explicitly not unemployment), and
  definitions of literacy/wealth/militancy.
- **Markets:** estimated daily production capacity per good, essential-good marking,
  and current stock versus capacity. Historical demand/prices are explicitly absent.
- **Ledger:** monthly economic report, recent closes, and confirmed player action
  history. The latest report also reports how many confirmed player actions fell inside
  that closed period. Compacted months show flows without fabricated balances.
- **Map:** player/AI identification and a compact current economic summary.

## 3. Data sources and unavailable information

Supported sources:

- Population blocks/current counters: population, working age, employment, hardship,
  unmet-block counts, literacy/wealth/militancy.
- Buildings/definitions/employment: estimated current production capacity.
- Market lots/prices: current stock and price per good; building capacity by market.
- Finance index/debt contracts: treasury, debt, interest payable, household cash.
- Monthly finance summaries: tax, welfare, interest, net result; close balances when
  account detail is retained.
- Authored need tiers: subsistence/basic goods for diagnosis.

Not available and therefore not displayed:

- GDP or another undefined headline aggregate.
- Unemployment, labor-force participation, or per-capita income.
- Inflation, real income, or a price index.
- Monthly price/production/employment history or month-over-month market changes.
- Forecasts of policy outcomes or causal attribution percentages.
- Construction, trade, monetary, or other E2–E6 controls.

## 4. Action confirmation and reporting periods

**Confirmation.** The provider stages requested fiscal values when sending the existing
`APPLY_ACTION`. A history record is appended only from the authoritative
`ACTION_RESULT`, using `event.accepted`, the confirmed snapshot's date/country/fiscal
values, and worker `errors`. Rejected actions are recorded as rejected with
`applied: null`. A sent command alone never creates an applied record.

**History.** Bounded to 48 records, session-only; cleared on load or worker restart.
Not persisted in the world, save, hash, or schema.

**Periods.** Fiscal lines are closed-period flows (`incomeTaxSUSD`,
`welfareExpenseSUSD`, `interestExpenseSUSD`, `netFiscalResultSUSD`). Treasury, debt, and
household cash are end-of-close balances, exposed only for summaries with retained
account detail; otherwise `null`/“not retained”. A balance change is derived only from
two detailed closes. Current treasury/debt on Overview/Budget is a current stock, not a
period flow. The retained window is 12 monthly summaries; recent detailed balances are
not restored for compacted months.

## 5. Snapshot, protocol, and persistence consequences

- Worker protocol bumped **2 → 3** because the immutable snapshot gained required
  presentation fields: production capacity, need tiers, market capacity, household cash,
  estimated wage base, debt-interest payable, finance-period labels/balances.
- Commands/events and the validated `set-fiscal-policy` shape are unchanged.
- No authoritative world schema, serializer, save, hash, data version, simulation
  version, calibration, or tick rule changed. World schema remains **16**, simulation
  **0.16.0**, save format **1**, data version **`m3-economy-v3`**.
- New snapshot values are derived at snapshot-build time and frozen. The app still
  reads immutable snapshots and uses validated actions only.
- Action history is React presentation state, not world/save state.
- Save compaction, replace-safe storage, autosave, supervisor, and action confirmation
  are unchanged.

## 6. Tests and verification

New tests:

- `packages/tests/src/e1-economic-clarity.test.ts`: snapshot/protocol validation,
  need/production/wage fields, monthly flow-versus-balance separation, compacted-summary
  no-fabrication, current-base fiscal preview arithmetic, evidence/caveat explanations,
  bounded action history, and a rejected action remaining rejected.
- `packages/tests/src/e1-ui-wiring.test.ts`: Overview default, screen wiring, preview/
  report/history surfaces, and absence of forbidden headline claims.

Commands and results:

| Command | Result |
|---|---|
| `pnpm -F @century/sim-worker typecheck` | PASS |
| `pnpm -F @century/app typecheck` | PASS |
| `pnpm -F @century/tests typecheck` | PASS |
| `pnpm -F @century/tests test -- e1-economic-clarity e1-ui-wiring` | PASS |
| `pnpm -F @century/app build:worker` | PASS; generated bundle current |
| `pnpm run check:worker` | PASS |
| `pnpm test` | PASS — 57 suites, 596 tests |
| `pnpm run lint` | PASS — boundary checks (145 TypeScript files) |
| `pnpm run typecheck` | PASS — all six workspace packages |
| `pnpm run ci` | **FAIL at the provisional M2 200-block benchmark gate:** p95 5.073 ms vs ≤5 ms, after lint/typecheck/596 tests passed. No E1 code path is involved; M2 hash `dd8d1cedaa2861bf` is unchanged by E1. |
| `pnpm bench` (high-priority/affinity rerun) | PASS — M2 200-block p95 4.571 ms; M7 snapshot payload 22.0 KiB; all non-timing gates passed |
| `pnpm run app:export` | PASS — web, iOS, and Android bundles exported |
| `git diff --check` | PASS (final tree) |

The standard `pnpm run ci` therefore exits 1 on host timing variance after every
correctness check passes. A separately run high-priority/affinity benchmark passes the
same gate; this is a known provisional Node timing signal, not a weakened test. Native/
device performance remains unevaluated.

No campaign soak, native build, device measurement, or profiler was run for E1. Native/
device acceptance remains the M7 exception.

## 7. GDD changes

- Header version 2.7 and alignment note.
- §17 status/table: E1 implemented; E2–E6 planned.
- §17.3/§17.4/§17.5 combined order and status updated; E0/E1 status text.
- §17A.14 E1 status/acceptance.
- §17A.16 report-retention answer updated.
- New §17A.17 E1 implementation record (interface, data/gaps, report semantics, action
  confirmation, protocol, tests, limitations, acceptance mapping).
- §19 status, §20.1 item 23, §21 glossary updated for E1.
- README: authority is v2.7; E0/E1 status, delivered features, roadmap table.
- DECISIONS: D-070 status updated; new D-071.

## 8. Limitations and deferred dependencies

- Monthly market/production/employment history is not retained; the report is fiscal
  flows plus close balances. Retaining a bounded series needs a later decision.
- Action history is session-only and clears on load/restart.
- Explanations are a small rule set, not a causal engine; they state evidence/caveats.
- No moderated usability study, native release build, or real-device measurement was
  run. E1 interface acceptance is source/type/test-based plus the existing M7 exception.
- E2–E6 mechanics, GDP, inflation, unemployment, trade, monetary policy, and native/
  device certification remain unimplemented/deferred.
- CEN-AUDIT-016 sovereignty remains unresolved.

## 9. Files and commits

- `Century_GDD_v2.7.md` — new authoritative GDD; v2.6 retained.
- `GDD_V2.7_CHANGE_REPORT.md` — this report.
- `README.md` — E1 status/delivery.
- `DECISIONS.md` — D-070 update and D-071.
- `packages/sim-worker/src/protocol.ts`, `snapshot.ts`, `host.ts`, `index.ts` — snapshot
  contract/build and protocol 3.
- `packages/sim-worker/src/fiscalPreview.ts`, `reports.ts`, `explanations.ts`,
  `actionHistory.ts`, `selectors.ts` — E1 selectors.
- `packages/app/App.tsx`, screens, `SimulationProvider.tsx`, `components/ui.tsx` — E1 UI.
- `packages/app/src/generated/simWorker.ts` — regenerated worker bundle.
- `packages/tests/src/e1-economic-clarity.test.ts`, `e1-ui-wiring.test.ts`,
  `m7-supervisor.test.ts` — tests/fixture.

Commit hashes, parent, final HEAD, and clean-tree status are recorded in the delivery
report after the final checks.
