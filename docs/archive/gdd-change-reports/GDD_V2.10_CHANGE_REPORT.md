# Century — GDD v2.10 Change Report (E3)

- **GDD:** `Century_GDD_v2.10.md` (authoritative); v2.9 retained byte-for-byte.
- **Revision date:** 2026-10-27
- **Baseline:** E2 documentation commit `d3a4ac0cd3aa6f15b4b45cd563820d172d3a20c0`
- **Implementation:** code/tests/bundle commits `e3b6fff5025af747f0fc78cc6941e1f93631e5ea` (core construction) and `a8c6a9edd2b400dcfd676478222c612efd7c2f1e` (state-ownership UI gate)
- **Scope:** E3 — Public Investment and Construction only. E4–E6 and M8a are not
  implemented.
- **Projection:** no benchmarks, performance measurements, campaigns, profiling, or
  device tests were run, per the developer's active no-benchmark restriction.

## 1. Source-defined E3 scope and acceptance criteria

GDD §17A.6 and §17A.14 E3 require a public-investment project queue that consumes real
money, labor, time, and (where modeled) materials; applies deterministic progress;
completes into an actual building/infrastructure instance with the definition's
capacity; supports cancellation/interruption/failure; persists deterministically; and
exposes validated project actions and an information UI. Instant bonuses, free assets,
arbitrary per-tick progress, and construction that bypasses labor are explicitly
excluded.

§17A.16 permits E3 to start with **money + labor + time** when explicitly scoped,
because `BuildingDef` has no construction bill of materials and there is no government
procurement demand/delivery path. D-074 uses that allowance: materials/procurement,
private co-financing, public-enterprise operation/expansion, infrastructure, land/space,
and destruction/closure are **not** E3 mechanics. The delivered subset is
government-financed, state-owned productive buildings.

## 2. Delivered project model

| Element | Delivered E3 behavior |
|---|---|
| Project type | Productive building definition with positive cost, positive authored `constructionWorkers`, state ownership allowed, no technology/resource requirement. Warehouse-only capacity is not offered. |
| Cost | `constructionCostSUSD`, paid as daily construction wages. |
| Crew | `constructionWorkers` maximum daily hires; actual hires limited by idle eligible workers and treasury cash. |
| Working capital | 30 days of level-1 upkeep target, cash-limited and transferred on completion. |
| Location | Country-owned region with a valid market. No land/space/access model is claimed. |
| Authorization | Player-only `start-construction`; region ownership, active-project cap (32), state-remittance policy, and treasury cash ≥ cost + working capital. No escrow. |
| Progress | Cumulative gross payroll / authorized cost; final worker-day clamped exactly; no progress on authorization day, while paused/blocked, or at the terminal boundary. |
| Stalls | `waiting` with `funds` or `labor`; progress preserved; resumes when the constraint clears. |
| Completion | Monotonic building id, level 1/condition 1, operational, state-owned, full account set, region update, working-capital endowment, ordinary production from the next processed day. |
| Cancellation | Spent work-in-progress written off to country owner equity; no refund/liability; terminal. |
| Pause/resume | Stops/resumes hiring; progress preserved. |
| Persistence | Queue/history/ids serialized and validated under schema 19; save/load and deterministic replay preserve them. |
| Bounds | 32 non-terminal projects; 32 retained terminated records; 256 compacted history aggregates. |

## 3. Accounting decision

Construction is **capitalized, not expensed**:

| Flow | Posting | Cash |
|---|---|---|
| Daily wages | country `construction-in-progress` debit / treasury credit; household cash debit / `wage-income` credit (`construction-wage`) | Cash-neutral |
| Wage income tax | household `income-tax-expense`/cash → country `treasury-cash`/`income-tax-revenue` (`income-tax`) | Cash-neutral; existing path |
| Completion | country `construction-in-progress` credit / `public-capital` debit (`construction-capitalization`) | None |
| Completion working capital | country treasury credit/owner-equity debit; building operating cash debit/owner-equity credit (`construction-working-capital`) | Cash-neutral transfer |
| Cancellation | country `construction-in-progress` credit / owner-equity debit (`construction-writeoff`) | None |

`constructionSpentSUSD` and `constructionWrittenOffSUSD` are separate
month-to-date/monthly/annual capital-flow measures, not welfare/interest expense. The
accounting identity and aggregate designated-cash conservation hold.

## 4. Labor, time, and financing semantics

- **Idle labor only:** eligible workforce per block minus production assignments minus
  workers claimed by earlier projects that day. Construction workers are never added to
  `world.employment`. No worker is double-counted.
- **Wage:** profession `baseWage1900SUSDPerYear / daysInYear`; existing income-tax
  allowance/rate applied after the block's settled market wages.
- **Financing:** authorization checks affordability but does not reserve cash.
  Construction is pay-as-you-go; a funding lapse stalls a project rather than creating
  debt or overdraft.
- **Time:** duration emerges from hires and cash, not a fixed timer; the UI estimate is
  explicitly static with assumptions.
- **Completion:** full spent amount is reclassified; the building's construction
  working capital is limited by actual treasury cash and the unpaid target is not a
  liability.

## 5. Ordering, atomicity, and determinism

Daily order on a processed day: AI → demography/employment/migration → market and
settlement → fiscal (income tax then welfare) → business tax → **construction** → debt
(interest/financing/coupons/maturities) → needs/wealth → monthly close → M5a
distribution. Construction runs before close so outlays are in-period and before debt
so month-end financing sees reduced cash. It never runs at the 2000-01-01 boundary.

The phase stages finance, project state, buildings, and regions, validates the complete
candidate, and publishes only on success. Projects are processed in ascending id order;
funding/labor claims and building ids are deterministic. Authorization day has no
progress. Completed/cancelled projects are terminal. Save/load/hash fixtures were
updated for schema 19.

## 6. Schema, protocol, data, and migration consequences

- World schema **19**, simulation **0.19.0**, save format **1**, worker protocol **6**,
  data version **`m3-economy-v4`**.
- Schema adds `World.construction` and country `construction-in-progress`/`public-capital`
  accounts; four cash-neutral posting kinds; construction budget fields.
- Data bump adds `constructionWorkers` and `"state"` ownership permission to every
  authored building definition. Historical/generated artifacts were regenerated.
- Protocol 6 adds `projectTypes`, per-country projects/history/labor/WIP/public capital,
  construction budget fields, and three action DTOs. The snapshot remains immutable and
  contains no accounts/postings.
- Schema-18 and older saves/clients are rejected; no migration is implemented under
  D-013. Canonical hashes and known-answer fixtures changed intentionally and were
  updated only where the state/schema changed.

## 7. Files created or modified

Core simulation:

- `packages/sim/src/economy/construction.ts` (new phase/actions)
- `packages/sim/src/economy/constructionModel.ts` (new model/validation/helpers)
- `packages/sim/src/economy/types.ts`, `constants.ts`, `state.ts`, `accounts.ts`,
  `accounting.ts`, `budget.ts`, `validation.ts`, `day.ts`, `ai.ts`, `index.ts`
- `packages/sim/src/world.ts`, `packages/sim/src/serialization.ts`,
  `packages/sim/src/population/state.ts`, `packages/sim/src/constants.ts`

Data and worker/UI:

- `packages/data/data/buildings.json`, `historical_buildings.json`,
  `packages/data/data/scenarios/*.json`, `packages/data/src/version.ts`
- `packages/sim-worker/src/protocol.ts`, `snapshot.ts`, `host.ts`, `reports.ts`,
  `actionHistory.ts`, `constructionPreview.ts` (new), `index.ts`,
  `packages/sim-worker/src/generated/m5Scenario.ts`
- `packages/app/App.tsx`, `packages/app/src/screens/ConstructionScreen.tsx` (new),
  `LedgerScreen.tsx`, `packages/app/src/generated/simWorker.ts`,
  `packages/app/src/storage/saveStorage.ts`

Tests/docs:

- `packages/tests/src/e3-construction.test.ts` (new), `e1-ui-wiring.test.ts`,
  `m7-worker.test.ts`, `m7-supervisor.test.ts`, `fixtures/m5.ts`,
  `data-version-consistency.test.ts` fixtures, known-answer hash tests,
  `m2-calibration.test.ts`, `m3a-serialization.test.ts`, `batch5-validation.test.ts`,
  `determinism.test.ts`, `m7-app-lifecycle.test.ts`
- `Century_GDD_v2.10.md` (new), `DECISIONS.md` D-074, `README.md`,
  `GDD_V2.10_CHANGE_REPORT.md` (new)

## 8. Verification commands and results

Run under the no-benchmark restriction:

1. `pnpm -F @century/sim typecheck` — pass.
2. `pnpm -F @century/sim-worker typecheck` — pass.
3. `pnpm -F @century/app typecheck` — pass.
4. `pnpm -F @century/tests typecheck` — pass.
5. `pnpm run typecheck` — pass (all packages).
6. `pnpm test` — **60 suites / 635 tests pass** (Node, in-band). The full run includes
   `e3-construction.test.ts` (13 tests) and the updated worker/UI/report/serialization/
   hash suites. Wall time is dominated by existing known-answer/calibration tests; it is
   correctness, not a benchmark.
7. `pnpm run lint` — pass.
8. `pnpm -F @century/app build:worker` — regenerated bundle; `worker-bundle-drift` test
   passes.
9. `git diff --check` — no whitespace errors.

No `pnpm run bench`, `bench:campaign`, benchmark gate/script, profiling, performance
measurement, stress/soak run, full-campaign run, or `pnpm run ci` was executed. No
benchmark code, thresholds, or reports were modified.

## 9. Limitations and remaining E4–E6 dependencies

- **Materials/procurement:** no construction BOM or government procurement
  demand/delivery; E4 must add real material requirements, delivery, inventory
  consumption, and postings. E3 does not fake an input.
- **Private co-financing/subsidies/loans/guarantees:** E4 incentive mechanics.
- **Public-enterprise operation/expansion:** E4; E3 only creates a government-owned
  asset and lets existing M5a remittance rules operate.
- **Infrastructure/transport/access:** E6a or a dedicated model; not offered in E3.
- **Land/space:** not modeled; location is region ownership only.
- **Destruction/closure/owner insolvency:** not modeled; only pause/cancel/funding/labor
  stalls.
- **AI construction:** player-only; AI economic behavior must not use hidden
  information.
- **Duration estimate:** static, not a forecast of future wages/labor/funding.
- **Native/device:** M7 device exception and performance verification remain unchanged.

## 10. Acceptance mapping

| §17A.6 requirement | Evidence |
|---|---|
| Project definition/queue | Validated project types; monotonic queue; schema 19; `e3-construction` selection/authorization tests |
| Real cost/labor/time | Treasury wages, idle-labor hiring, payroll progress, funds/labor stalls; tests |
| Deterministic progress/completion | Exact final spend, ascending ids, tick/replay tests |
| Real asset with capacity | State-owned building, accounts, region update, post-completion production/employment test |
| Cancellation/interruption | Write-off/rollback, pause/resume, stall/resume tests |
| Persistence/save/replay | Serialization/hash/replay tests; schema policy |
| UI/action support | Construction tab/preview/queue/blockers; worker action round-trip; UI wiring test |
| Accounting/cash invariants | Identity/cash conservation assertions; capital-not-expense reporting tests |
| No instant/free asset | No completion before payroll; no building on cancellation; no progress without hires |
