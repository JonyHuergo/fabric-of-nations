# Century — GDD v2.9 Change Report (E2)

- **GDD:** `Century_GDD_v2.9.md` (authoritative); v2.8 retained byte-for-byte.
- **Revision date:** 2026-10-27
- **Baseline:** M7a documentation commit `fdf429a7aeea4dccf4a6699e0ad4d361028f7343`
- **Implementation:** code/tests/bundle commit `f9aa4e0e2ea9d59dd1999d72704eb9d5261d75d2`
- **Scope:** E2 — Fiscal Management only. E3–E6 and M8a are not implemented.
- **Projection:** no benchmarks, performance measurements, campaigns, profiling, or
  device tests were run, per the developer's active no-benchmark restriction.

## 1. Source-defined E2 scope and acceptance criteria

GDD v2.8 §17A.14 (E2) requires expanding the fiscal model into a public budget and
policy interface, with this priority order:

1. extend the income-tax control into a bounded rate/schedule with base, incidence,
   and immediate static-cost explanation;
2. add spending categories deliverable now: welfare parameters, and education/health
   only where E5 service mechanics exist; administration only with government
   employment/service mechanics;
3. add budget allocation/reserve targets and player debt/repayment/refinancing policy
   within existing M5b contracts;
4. add business-profit tax only after a stable taxable profit measure and loss rules;
5. add consumption/excise only after transaction tax-stage/tagging rules;
6. customs only in E6a; property/land only after a property/land system.

§17A.13.2 E2 acceptance requires: each implemented instrument has a defined base,
calculation, posting path, timing, bounds, and UI explanation; a player can change it
through a validated action and observe the actual next-period effect; requested vs.
paid vs. shortfall and revenue vs. borrowing vs. principal vs. interest are separate;
an unaffordable plan is rejected or explicitly unfinanced and never silently
money-created; and monthly close, four-flow, accounting identity, determinism, and save
compatibility are preserved (or a version change is documented).

Delivered: priority 1 (income-tax schedule), the deliverable part of priority 2
(welfare parameters), priority 3 (budget/reserve/debt policy), and priority 4
(business-profit tax). Priorities 5 and 6 remain dependency-gated and are labelled, not
exposed.

## 2. Instruments, controls, and financing actions

| Instrument/control | Base | Calculation/timing | Posting path |
|---|---|---|---|
| Income-tax schedule | Actual daily wages per pop block | `rate × max(0, wages − allowance / daysInYear)`, daily | household `income-tax-expense`/cash ↔ country `treasury-cash`/`income-tax-revenue` |
| Welfare eligibility | Blocks with positive population and wealth ≤ ceiling | Annual budget ÷ civil-year days; proportional to eligible population; exact remainder; payable limited by cash above reserve | country `welfare-expense`/treasury ↔ household cash/`welfare-income` |
| Treasury reserve | Actual cash and policy floor | Daily welfare ceiling and discretionary repayment floor; never causes borrowing | no posting |
| Business-profit tax | Building period `sales − inputs − wages − upkeep`, positive part | Month-end assessment at the rate; collected from operating cash | building `business-tax-expense`/cash ↔ country `treasury-cash`/`business-tax-revenue` (`business-profit-tax`) |
| Bonus financing | Existing designated creditor, coupon, term, ceiling, creditor cash, cap | Immediate validated `issue-debt` | existing `debt-issuance` |
| Early repayment | One contract's outstanding principal and treasury cash | Immediate validated `repay-debt`, reserve-floor constrained | existing `debt-principal-repayment` |
| Debt policy | Refinancing flag and outstanding-principal ceiling | Immediate validated `set-debt-policy`; affects future maturities/issuance | no posting |

The complete fiscal policy, including all E2 fields, is one validated action. Player
actions may target only `playerCountryId`; AI actions may never target it. Every action
is validated before mutation; the candidate world validates before publication; a
rejected action leaves the hash unchanged.

## 3. Budget decomposition and reporting

`FinancePeriodSummary.countryBudgetTotals` and `AnnualFinanceSummary.budgetTotals`
retain per country:

- welfare requested and shortfall (paid welfare remains the recognized
  `welfareExpenseSUSD`);
- business tax assessed and uncollected (collected revenue remains the recognized
  `businessTaxRevenueSUSD`);
- debt issued, principal repaid, cash interest paid, and unfinanced requirement.

`FinancePeriodFiscalTotals.businessTaxRevenueSUSD` is added and the net fiscal result is
`incomeTax + businessTax − welfare − interest`. Annual flows are exact sums of the
year's monthly summaries; annual balances remain year-end stocks; zero-only entries are
omitted and read as zero. The month-to-date memo is frozen into the summary and reset at
the close. It is not a liability ledger. A controlled correction can separate a memo
amount from an account line; reports show both rather than assuming they agree.

## 4. Ordering, atomicity, and exactness

Civil month-end order: AI → demography/employment/migration → market and wage/upkeep
settlement → fiscal (income tax, then welfare) → business tax → debt (accrual, automatic
financing, coupons, maturities/refinancing, arrears/default) → needs/militancy/wealth →
monthly close → M5a distribution using the after-tax result. Player actions apply
between completed ticks at the current day, before that day's phases.

The fiscal phase posts income-tax entries and welfare entries as two balanced batches on
one staged finance clone; publication still happens only after the complete staged world
validates. This lets welfare read the exact post-tax balance so transferring the entire
available cash leaves an exact zero instead of a floating-association residual.

## 5. Schema/version and save consequences

- World schema **17 → 18**; simulation **0.17.0 → 0.18.0**; save format stays **1**;
  data version stays **`m3-economy-v3`** because the shipped scenario's E2 fields use
  neutral defaults and existing definition/scenario meanings are unchanged.
- Worker protocol **4 → 5** (action union and required snapshot fields).
- New state: extended `Country.fiscal`; `FinanceState.budgetMemosThisMonth` (replacing
  `welfareRequestedThisMonth`); summary/annual `countryBudgetTotals`/`budgetTotals`;
  business-tax accounts.
- New posting kind `business-profit-tax`; new subtype registrations and structural
  validation.
- Serialization/deserialization, canonical hashing, validation, clone isolation, deep
  equality, the app save-schema constant, and known-answer digests were updated.
- Schema-17 and earlier saves are rejected under the existing policy; no migration is
  implemented (D-013). Protocol-4 clients are rejected.
- Bounded state: monthly summaries remain capped at 1,200 (latest 12 detailed), annual
  at 100, corrections at 64, active debt contracts at 64, retained terminated contracts
  at 32. Zero-only budget entries are omitted.

## 6. Tests and non-benchmark verification

`packages/tests/src/e2-fiscal-management.test.ts` covers:

- exact income-tax withholding with zero, full, and partial exemptions;
- welfare eligibility filtering and universal eligibility, with exact totals;
- reserve-limited welfare over two days with exact treasury cash and no liability;
- a closed month never rewritten by a later policy change;
- business-tax assessment/collection against a controlled recognized result;
- uncollected business tax limited by operating cash, with no receivable/liability;
- discretionary borrowing versus automatic month-end financing (no duplicate borrowing);
- principal repayment as financing, reserve-floor rejection and exact-floor acceptance;
- refinancing/ceiling policy effects and rejection when the ceiling is below outstanding;
- invalid/unaffordable actions rejected atomically with unchanged hashes;
- monthly requested/paid/shortfall and financing reconciliation;
- annual flow/balance reconciliation against twelve monthly closes;
- save/load hash equality and deterministic replay;
- player/AI action-boundary enforcement.

Updated suites: `m4a1-accounts`, `m4b-period-close`, `m4b-save-compaction`, `m4c-fiscal`,
`m5b-debt-bounded`, `m6-ai`, `m6-player-country`, `m7a-annual-accounting`,
`e1-economic-clarity`, `e1-ui-wiring`, `m7-worker`, `m7-app-lifecycle`,
`m7-save-store`, `m7-supervisor`, `m3a-serialization`, `determinism`,
`m2-calibration`, `batch5-validation`, and `worker-bundle-drift`. Intentional
known-answer digest changes: empty-world campaign `a9a9806e2fc28050`, M3 structural
world `731650e0eaccee82`, WPP validation `f6056c4603d08e5c`, 1950 WPP state
`9778acd2c40dfac4`, eight-polity 22-tick `27fbea122e7774b8`.

| Command | Result |
|---|---|
| `pnpm run lint` | PASS — boundary checks (150 TypeScript files, 49 in `packages/sim`) |
| `pnpm run typecheck` | PASS — all six workspace packages |
| `node --experimental-vm-modules ./node_modules/jest/bin/jest.js --runInBand e2-fiscal-management` | PASS — 1 suite, 16 tests |
| `pnpm test` | PASS — 59 suites, 619 tests (575.2 s) |
| `pnpm -F @century/app build:worker` | PASS — 396.3 KiB script / 396.5 KiB html |
| `pnpm run check:worker` | PASS — scenario and worker bundle current |
| `git diff --check` | PASS (exit 0; only Git LF→CRLF advisory warnings) |

**Deliberately not run:** `pnpm run bench`, `pnpm run bench:campaign`, `pnpm run ci`
(it invokes benchmarks), benchmark scripts/gates, profiling, stress/soak tests,
full-campaign performance runs, Expo exports, and native/device measurements. No
benchmark code, threshold, or performance report was modified; existing benchmark
results are historical only.

## 7. Limitations and deferred dependencies

- Collection efficiency is fixed at 1.0; no administration/enforcement/arrears model.
- Business losses are not refunded or carried forward for tax; no sector classification
  or deduction rules; collection is limited by building operating cash.
- Welfare eligibility is a single wealth ceiling, not categorical or needs-tested law.
- The reserve floor is a simple liquidity constraint; it does not affect borrowing terms
  or creditor willingness.
- The preview's proposed-exemption taxable base is an assumption-based estimate because
  per-block wage levels are not retained; the eligibility effect of a proposed ceiling is
  not estimated.
- Consumption/excise (transaction tax-stage/tagging), property/land (property/land
  system), and customs (E6a) taxes remain deferred.
- Education/health/administration/services spending, subsidies/procurement, and public
  investment remain E5/E4/E3 dependencies; their levers are not exposed.
- Construction, banking/credit, monetary issuance, inflation, FX, and bond markets remain
  unimplemented. CEN-AUDIT-016 sovereignty remains unresolved.
- Native/device verification remains the M7 exception.

## 8. Files

- `Century_GDD_v2.9.md` — new authoritative GDD; v2.8 retained.
- `GDD_V2.9_CHANGE_REPORT.md` — this report.
- `README.md`, `DECISIONS.md` — status and D-073.
- `packages/sim/src/constants.ts`, `serialization.ts`, `world.ts`,
  `population/state.ts`, `economy/{constants,types,accounts,accounting,country,state,
  fiscal,businessTax,budget,debt,profit,period,day,ai,validation,index}.ts`.
- `packages/sim-worker/src/{protocol,snapshot,fiscalPreview,reports,host,actionHistory}.ts`.
- `packages/app/src/screens/{BudgetScreen,LedgerScreen}.tsx`,
  `packages/app/src/worker/SimulationProvider.tsx`,
  `packages/app/src/storage/saveStorage.ts`, generated worker bundle.
- `packages/tests/src/e2-fiscal-management.test.ts` and the updated suites/fixtures and
  known-answer hashes listed above.

Commit hashes, parent relationships, final HEAD, and clean-tree state are in the
delivery report.
