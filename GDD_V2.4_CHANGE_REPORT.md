# GDD v2.4 — Change Report

**Status:** documentation-only revision; committed with the M4b documentation update.\
**Authoritative document:** `Century_GDD_v2.4.md`\
**Supersedes:** `Century_GDD_v2.3.md` (retained as historical, byte-for-byte unchanged)\
**Implementation baseline:** accepted M0–M4b; M4b commit `be087797277c20c60cda5998ed7824f2391b830a`, parent `7f173e9c60a6d9e2558962a78ea6ce4c897d2d3b`\
**Change date:** 2026-10-25

## Purpose

This revision reconciles the authoritative design document with the committed M4b
monthly finance close and finance summaries. It preserves the long-term design
intent, the historical v2.3 document, the determinism/conservation rules, the
country/currency model, the deferred finance systems, and the unverified
mobile-performance status. It does not add requirements beyond D-047 and the
implemented behavior.

Implementation baseline versions are world schema 8, simulation version 0.8.0,
save format 1, and data version `m3-economy-v1`. This documentation revision does
not change any of them.

## Summary of changes

| Area | Change | Supporting evidence |
|---|---|---|
| Revision header and authority note | Version 2.4; v2.4 supersedes v2.3; records the accepted M0–M4b baseline and states that later milestones remain unimplemented. | M4b commit `be08779`; D-047 |
| §4.2 daily pipeline | Adds the M4b month-end finance close to step 14, positions it after that day's postings, needs/militancy, and month-end wealth update, and notes that a completed close is publishable only after step 15 advances the day. Extends the whole-day atomicity note with the additional finance-staging step and adds an M4b current-scope paragraph. | `packages/sim/src/economy/day.ts`; D-047 |
| §4.4 month boundaries | States that the M4b close runs immediately after the month-end wealth update and before the day advances. | `runEconomicDay`, `closeFinancePeriod` |
| §5.4 current baseline | Replaces the schema-7/M0–M4a-2 baseline with schema 8/M0–M4b and adds `periodSummaries`/`closedThroughDay` to the current `FinanceState` shape. | `WORLD_SCHEMA_VERSION = 8`; `SIM_VERSION = "0.8.0"` |
| §5.4.2 (new) | Records the M4b current model: close timing, inclusive period bounds and partial first period, summary content, flow derivation from mapped expense balances, zero opening revenue/expense balances, the semantic posting matrix, the internal `period-close` operation, closing entries and signed equity, the owner-equity requirement, atomic staging, the staged-versus-published rule, summary validation, M2-only/terminal/leap behavior, and persistence/compatibility. | D-047 and its implementation notes; `period.ts`, `accounts.ts`, `validation.ts`, `serialization.ts` |
| §5.5 supporting contracts | Marks `periodSummaries` current, adds `closedThroughDay`, `nextAccountId`, and `opening` to the target `FinanceState` block, and updates the audit-buffer rule to point at M4b summaries. | `packages/sim/src/economy/types.ts` |
| §8.1–§8.2 accounting | Records the M4b close and summaries as current accounting behavior; keeps taxes, government finance, debt, interest, banks, issuance, distributions, annual close, reopen/reversal, and the Ledger UI future. | D-047; finance implementation |
| §8.7 finance invariants | Adds the M4b semantic matrix, exact zeroing, cash-neutral net close into owner equity, owner-equity requirement, and atomic staged close to the current invariants; keeps debt/tax/interest/monetary invariants future. | `assertValidFinanceState`, `closeFinancePeriod` |
| §14.4 performance | Notes that M4b Node benchmarks exercise the schema-8 state and that the close benchmark times only the close; the mobile p95 target remains **NOT EVALUATED**. | `packages/bench/src/bench.ts` |
| §14.6 save system | Adds the unadvanced-close serialization/hashing rule and a post-close save/load test expectation. | D-047 published-state rule |
| §14.7 history and diagnostics | Records that each closed month stores one immutable summary in `periodSummaries`; annual samples and `World.history` remain future. | `FinanceState.periodSummaries` |
| §17.2 milestones | Adds M4b as an accepted stage with its acceptance boundary; updates the M4 row, §17.1 closing note, and §20.3 handoff baseline to M0–M4b. | Commit `be08779`; D-047 |
| §20.1 decisions | Item 5 now records the M4b close, summaries, semantic matrix, and internal kind; annual close, reopen/reversal, and history compaction remain future. | D-047 |
| §21 glossary | Adds finance period summary, period close, closed-through day, staged/published close, and semantic posting matrix; updates “Current implementation” to M0–M4b. | D-047 |
| README | Identifies v2.4 as the current design authority and v2.3 as historical; records M4b in the implemented baseline, adds an M4b summary section, and updates current schema/digest/benchmark/limitation references. | M4b implementation |
| DECISIONS | Adds a short documentation-history note that GDD v2.4 records M4b as current while preserving D-047 and all prior decision history. | This revision |

## M4b model recorded in v2.4

The new §5.4.2 documents exactly the D-047 behavior that the M4b commit
implements:

- **Close timing and boundaries.** Economic worlds close on the last civil day of
  each Gregorian month, after that day's postings, needs/militancy, and month-end
  wealth update, and before `dayIndex` advances. Period bounds are inclusive; the
  first period starts at `World.startDayIndex` and may be partial. Duplicate,
  out-of-order, and gapped closes are rejected. M2-only worlds never close, and
  the terminal `2000-01-01` boundary is never closed; the last possible period
  ends `1999-12-31`.
- **Documented limitation.** Published-state validation cannot independently prove
  which calendar days a caller processed before the first close. The accepted
  convention allows the first close at any civil month-end on or after
  `startDayIndex`; contiguity is validated between recorded summaries only. The
  document states explicitly that this is not a completeness guarantee.
- **Summary content and flows.** A summary stores the pre-close trial balance of
  nonzero accounts plus the four gross flows derived from mapped expense balances
  (`goods-purchase`, `input-purchase`, `wages`, `upkeep`). `period-close` is not a
  flow kind. Opening balance-sheet balances appear in the trial balance but are
  never treated as period flows.
- **Opening balances and the matrix.** Opening revenue/expense balances are
  rejected and those accounts start at zero. The account-subtype/transaction-kind/
  debit-credit matrix is enforced for single, batched, and persisted postings;
  `profit-distribution` and `owner-capital-injection` may not post to revenue or
  expense accounts.
- **Closing entries and equity.** Revenue is debited, expense is credited, and the
  net `revenue - expense` closes into the owner's existing `owner-equity` in
  deterministic owner/account order. Positive net credits equity, negative net
  debits it, equity may be signed, and an exact zero net needs no equity line.
  Every owner with revenue/expense accounts must have exactly one owner-equity
  account; the system owner is covered independently of reserve-account existence,
  and a missing account fails before mutation.
- **Atomicity and staging.** The close copies the finance state, applies closing
  entries and the summary on the copy, validates it, and only then replaces
  `world.finance`; failure leaves the original state unchanged. A staged close may
  temporarily have `closedThroughDay === world.dayIndex`; a published or
  serializable world requires `closedThroughDay === null || closedThroughDay <
  world.dayIndex`, and validation, serialization, hashing, and deserialization
  enforce that rule.
- **Internal operation and validation.** `period-close` is internal-only at the
  public posting boundaries but persisted close entries receive structural
  validation (no cash, revenue debits/expense credits, one net equity line,
  balanced). Summary validation checks ordering, contiguity, month-end ends, one
  summary per month, campaign bounds, the close boundary, account references,
  nonzero totals, nonnegative flows, mapped-flow consistency, and the trial-balance
  identity.
- **Compatibility.** Schema 8, simulation 0.8.0, save format 1, unchanged
  `m3-economy-v1`, and rejection of schema-7 / simulation-0.7.0 saves without
  migration.

## Superseded v2.3 statements and replacements

- v2.3 “current schema-7 baseline (M0–M4a-2)” → v2.4 “current schema-8 baseline
  (M0–M4b)”, with `periodSummaries`/`closedThroughDay` added to the current
  `FinanceState`.
- v2.3 “period summaries are future” in §5.4, §5.5, §8.1, §8.2, §8.7, and §14.7 →
  v2.4 records the M4b monthly summaries as current and keeps annual samples,
  `World.history`, and history compaction future.
- v2.3 “current M3f order” / “current M3f monthly wealth only” → v2.4 “current
  M3f/M4b order”, with the close placed in step 14.
- v2.3 “M4b is future work and is not started” in the header, §17.2, §20.1, and
  §20.3 → v2.4 records M4b as an accepted stage and leaves the remaining M4 work
  and later milestones unimplemented.
- v2.3 “Current M4a-1/M4a-2 baseline” in §8.1/§8.7 → v2.4
  “Current M4a-1/M4a-2/M4b baseline” with the M4b additions stated.

No other system was rewritten. The v2.3 provisional and future-system language for
taxes, government finance, debt, interest, banking, monetary issuance,
native-currency balances, FX, inflation, annual close, reopen/reversal, and UI is
preserved as future design.

## Implemented, provisional, and deferred

**Implemented in the accepted baseline:**

- M0–M3f foundation and integrated economic day.
- M4a-1 category-aware double-entry accounts, normal-side balances, opening
  balances, and recognition legs.
- M4a-2 country/currency identity, monetary arrangements, SUSD-relative valuation,
  and country-region ownership.
- M4b monthly period close, immutable monthly finance summaries, the semantic
  posting matrix, the internal `period-close` kind and its persisted structural
  validation, exact revenue/expense zeroing into signed owner equity, the
  owner-equity requirement, and atomic staged close validation.
- Schema 8, simulation version 0.8.0, save format 1, data version
  `m3-economy-v1`; schema-7/simulation-0.7.0 saves are rejected.

**Current implementation restrictions / provisional assumptions:**

- The first-period close may occur at any civil month-end on or after
  `startDayIndex`; published validation cannot prove which earlier days were
  processed (recorded in §5.4.2 and D-047 implementation notes).
- Summary flow totals are gross mapped period activity, not profit, taxable
  income, or a distribution.
- Inventory remains outside the accounting asset model; input purchases are
  expensed when purchased (cash-basis simplification, not full accrual).
- At most one issued currency per simulated country remains a current scope
  restriction (D-045).
- Currency rate bounds/tolerances remain provisional numerical safety choices.

**Deferred:**

- Taxes, government expenditure, debt/interest/maturity, inflation, dynamic FX,
  monetary policy, central banking, monetary issuance, native-currency balances,
  legal-tender enforcement, and currency conversion during market settlement.
- Annual/fiscal-year close, reopen/reversal/adjusting entries, retained-earnings
  subtypes, summary compaction, flow totals for future cash/equity-transfer
  kinds, and account deletion/remapping.
- A `World.history` collection, the Ledger UI, and M4c or later milestones.

## Decisions versus restrictions

- **Accepted decisions:** D-047 is the authoritative M4b decision recorded here;
  D-044/D-045 remain the country/currency decisions and D-046 the M4a-1
  accounting decision. No decision is rewritten by this revision.
- **Current implementation behavior:** validation enforces the close boundary,
  summary contiguity, the semantic matrix, opening-balance rules, owner equity,
  cash neutrality, and the accounting identity as documented in §5.4.2.
- **Documented limitation:** the partial-first-period convention is explicitly
  bounded and is not a completeness guarantee, matching D-047 and the
  implementation notes.
- **Deferred:** the GDD preserves future finance and monetary design as future
  goals without claiming they are implemented.

## Validation

- `Century_GDD_v2.3.md` remains byte-for-byte unchanged; its Git blob is
  `02ff49abc7c9849d5685ff50e3d903c74907ab5f` and its SHA-256 is
  `BEE1E885BBD3276C544792127EE9509E93B5BD7836201B5C2CAEE79F71459671`.
- `GDD_V2.3_CHANGE_REPORT.md` remains byte-for-byte unchanged; its Git blob is
  `e816fef8ad29becdca7051b8618f5b345ecd30fb` and its SHA-256 is
  `28F08E68D0EDF853322B0C355940CCABAFC0DCB20803EAC62884BED0BE14766F`.
- Only documentation files were changed: `Century_GDD_v2.4.md`,
  `GDD_V2.4_CHANGE_REPORT.md`, `README.md`, and `DECISIONS.md`.
- No simulation source, tests, data, benchmark/runtime files, schema/version
  constants, lockfile, or save format were changed.
- No simulation CI, tests, typecheck, or benchmarks were run for this
  documentation-only revision; they were not required and are not claimed.
- `git diff --check` is clean.
- Markdown code fences are balanced (12 fences in the document, unchanged from
  v2.3), and the document contains no mojibake or replacement characters.
- Internal section references and README links were checked.

## Stop condition

Documentation only. M4b was already implemented and committed; this revision does
not reopen it. The next implementation milestone is not started.
