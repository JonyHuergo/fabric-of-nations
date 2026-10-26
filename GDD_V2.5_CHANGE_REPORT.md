# GDD v2.5 — Change Report

**Status:** documentation revision; committed with the M4c documentation update.\
**Authoritative document:** `Century_GDD_v2.5.md`\
**Supersedes:** `Century_GDD_v2.4.md` (retained as historical, byte-for-byte unchanged)\
**Implementation baseline:** accepted M0–M4c; M4c implementation commit `557b37be63ecec5f8bb1826c77bb35a43e1e9531`, parent `ec125bdeb23ee1ddd1abe1429eb4c78b66171b9a` (D-048 decision commit)\
**Change date:** 2026-10-25

## Purpose

This revision reconciles the authoritative design document with the committed
M4c government fiscal loop: a per-country treasury, a daily flat income tax on
wages actually paid, and a daily budgeted per-capita welfare transfer. It
preserves the long-term design intent, the historical v2.3/v2.4 documents, the
determinism/conservation rules, the country/currency model, the deferred finance
systems, and the unverified mobile-performance status. It does not add
requirements beyond D-048 and the implemented behavior.

Implementation baseline versions are world schema 9, simulation version 0.9.0,
save format 1, and data version `m3-economy-v1`. This documentation revision does
not change any of them.

## Summary of changes

| Area | Change | Supporting evidence |
|---|---|---|
| Revision header and authority note | Version 2.5; v2.5 supersedes v2.4; records the accepted M0–M4c baseline, the fiscal loop, and the stated limitations. | M4c commit `557b37b`; D-048 |
| §3.4 evaluation cadence | Notes that M4c records treasury revenue and expenditure daily through balanced postings. | `runFiscalPhase`; D-048 |
| §4.2 daily pipeline | Records the M4c fiscal phase in step 12 (after settlement, before needs/militancy/wealth), the unchanged M4b close timing in step 14, the fiscal part of whole-day atomicity, and an M4c current-scope paragraph. | `day.ts`, `fiscal.ts`; D-048 |
| §4.4 month boundaries | States that income tax and welfare are daily fiscal flows, not month-end timers, and that the close does not re-run them. | `runEconomicDay`, `closeFinancePeriod` |
| §5.4 current baseline | Replaces schema 8/M0–M4b with schema 9/M0–M4c, adds `treasuryAccountId`/`fiscal` to the current `Country`, and adds `FiscalPolicy`. | `WORLD_SCHEMA_VERSION = 9`; `SIM_VERSION = "0.9.0"` |
| §5.4.1 country model | Notes that the scenario country input is `CountryInitialDef` with treasury id, opening cash, and fiscal policy. | `types.ts`, `state.ts` |
| §5.4.3 (new) | Records the M4c model: country/household fiscal accounts, conditional fiscal-account creation for worlds with countries, policy state, income tax, welfare funding and shortfall, atomic fiscal batch, validation, and persistence. | D-048 and its implementation notes; `fiscal.ts`, `accounts.ts`, `validation.ts`, `serialization.ts` |
| §5.5 supporting contracts | Marks the `country` owner kind and fiscal subtypes current, adds the fiscal policy contract, and clarifies that fiscal summary totals are derived rather than added to the four flow kinds. | `packages/sim/src/economy/types.ts` |
| §6.4–§6.5 needs and wealth | Records the M4c income basis (wages plus welfare) and mandatory payments (income tax withheld), still annualized from current-day flows. | `day.ts` wealth inputs; D-048 |
| §8.1–§8.2 accounting | Records the country treasury/fiscal accounts and the `income-tax`/`welfare-transfer` kinds as current; keeps broader taxes, government services, debt, interest, banks, issuance, and distributions future. | D-048; finance implementation |
| §8.3 government revenue | Adds the current M4c flat wage-only residence-based income tax, fixed collection efficiency, and the provisional non-law-bounded rate; keeps all other revenue sources future. | `fiscal.ts`; D-048 |
| §8.4 government expenditure | Adds the current M4c budgeted per-capita welfare transfer, exact allocation, proportional shortfall, and no-debt rule; keeps all other expenditure categories, procurement, and services future. | `fiscal.ts`; D-048 |
| §8.7 finance invariants | Adds treasury cash, fiscal cash-neutrality, country close, and atomic fiscal-batch invariants while preserving existing requirements. | `assertValidEconomyState`, `runFiscalPhase` |
| §14.4 performance | Notes that the M4c fiscal benchmark times the integrated fiscal day, excludes setup/hashing, and does not evaluate the mobile p95 target. | `packages/bench/src/bench.ts` |
| §15.1 data scope | Notes that no country/currency historical dataset or shipped fiscal scenario exists; M4c fixtures are inline tests. | test fixtures; D-048 |
| §16.2/§16.4 tests and conservation | Adds the current M4c fiscal test coverage and the current government-cash equation interpretation (no borrowing, interest, or accrued arrears; shortfall is unfunded). | `m4c-fiscal.test.ts`; D-048 |
| §17 milestone plan | Updates the M4 row and adds M4c as an accepted §17.2 stage with its acceptance boundary; updates §17.1/§20.3 baselines to M0–M4c. | Commit `557b37b`; D-048 |
| §20.1 decisions | Item 5 records M4c fiscal postings/close; new item 17 records the provisional fiscal policy and its limits. | D-048 |
| §21 glossary | Adds fiscal policy, treasury, and welfare shortfall; updates the current-implementation baseline. | D-048 |
| README | Identifies v2.5 as the current design authority and v2.4/v2.3 as historical; records M4c in the implemented baseline, adds an M4c section, and updates schema/digest/benchmark/limitation references. | M4c implementation |
| DECISIONS | Adds D-048 implementation notes (conditional fiscal accounts, timing, validation placement, digests, benchmark, limitations) without rewriting prior decisions. | D-048; this revision |

## M4c model recorded in v2.5

The new §5.4.3 and the revised §8.3–§8.4 document exactly the D-048 behavior that
the M4c commit implements:

- **Fiscal state and accounts.** Each country owns `treasury-cash`,
  `income-tax-revenue`, `welfare-expense`, and `owner-equity`; the treasury id is
  scenario-declared and the rest are deterministically allocated. Opening treasury
  cash is applied once through the opening-balance provenance record with country
  equity as counterpart. Pop blocks in worlds that declare a country own
  `income-tax-expense` and `welfare-income`; countryless M2/M3 fixtures keep their
  original account set and have no fiscal system.
- **Policy.** `Country.fiscal` carries a dimensionless 0..1 income-tax rate and a
  finite nonnegative annual welfare budget. It is provisional scenario state, not
  law-bounded and not action-mutable in M4c. Collection efficiency is fixed at 1.0.
- **Daily income tax.** `incomeTaxRate × wages actually received that day`,
  residence-based, wage-only, with no exemptions/strata and no tax on welfare or
  wealth. Partial wages produce partial tax; multiple employers are combined by
  settlement. Tax cannot exceed received wages or cash.
- **Daily welfare.** The annual budget's daily share is limited by treasury cash
  after tax, allocated per capita with an exact deterministic remainder, and paid
  through balanced postings. Insufficient funds reduce transfers proportionally and
  record a shortfall; no debt, arrears, or negative cash is created.
- **Atomicity and record.** The whole day's fiscal entries are validated and posted
  as one batch. The transient result reports per-country tax, requested/paid
  welfare, shortfall, and start/end treasury cash, plus per-block amounts. No
  redundant fiscal counters are persisted.
- **Close and wealth.** Country revenue/expense close into country equity at the
  M4b month-end in deterministic order. The summary shape and four flow kinds are
  unchanged. Month-end wealth uses wages plus welfare as income and withheld
  income tax as mandatory payments, annualized from the current day (not a
  trailing-month average).
- **Compatibility.** Schema 9, simulation 0.9.0, save format 1, unchanged
  `m3-economy-v1`, and rejection of schema-8 / simulation-0.8.0 saves without
  migration. Countryless and zero-fiscal worlds keep their prior behavior.

## Superseded v2.4 statements and replacements

- v2.4 “current schema-8 baseline (M0–M4b)” → v2.5 “current schema-9 baseline
  (M0–M4c)”, with `Country.treasuryAccountId`/`fiscal` and the fiscal account
  subtypes.
- v2.4 “step 12 is entirely future” → v2.5 records the M4c fiscal part of step 12
  as current and keeps debt/interest/contract settlement future.
- v2.4 “taxes and government finance are not implemented” → v2.5 records the
  single income tax and welfare transfer as current and keeps all other taxes,
  expenditure categories, and debt future.
- v2.4 wealth convention “wage receipts only, mandatory payments zero” → v2.5
  records wages plus welfare as income and withheld income tax as mandatory
  payments, still a current-day annualization.
- v2.4 “M4c is future/unassigned” in the header, §17.2, §20.1, and §20.3 → v2.5
  records M4c as an accepted stage and leaves the remaining M4 work and later
  milestones unimplemented.

No other system was rewritten. The v2.4 provisional and future-system language for
corporate/consumption/land/tariff taxes, broader government expenditure and
services, debt, interest, banking, monetary issuance, native-currency balances, FX,
inflation, annual close, reopen/reversal, and UI is preserved as future design.

## Implemented, provisional, and deferred

**Implemented in the accepted baseline:**

- M0–M3f foundation and integrated economic day.
- M4a-1 category-aware double-entry accounts, normal-side balances, opening
  balances, and recognition legs.
- M4a-2 country/currency identity, monetary arrangements, SUSD-relative valuation,
  and country-region ownership.
- M4b monthly period close, immutable monthly finance summaries, the semantic
  posting matrix, the internal `period-close` kind, exact revenue/expense zeroing
  into signed owner equity, and atomic staged close validation.
- M4c per-country treasury and fiscal accounts, provisional fiscal policy state,
  daily flat income tax on actual wages, daily budgeted per-capita welfare with
  proportional shortfall, the `income-tax`/`welfare-transfer` kinds, treasury cash
  in the designated-cash set, country close into equity, and the wealth-input
  refinement.
- Schema 9, simulation version 0.9.0, save format 1, data version
  `m3-economy-v1`; schema-8/simulation-0.8.0 saves are rejected.

**Current implementation restrictions / provisional assumptions:**

- Collection efficiency is fixed at 1.0 until institutions exist.
- The income-tax rate is a flat provisional policy value, not law-bounded or
  action-mutable; there are no exemptions or strata.
- Welfare is one budgeted per-capita transfer; a funding shortfall is unfunded and
  reported, not a liability.
- Fiscal accounts exist only in worlds that declare a country; countryless M2/M3
  fixtures keep their original account set and have no fiscal phase.
- The first-period close may occur at any civil month-end on or after
  `startDayIndex`; published validation cannot prove which earlier days were
  processed.
- Summary flow totals are gross mapped period activity, not profit, taxable
  income, or a distribution; government period totals are derived from the frozen
  account totals.
- Inventory remains outside the accounting asset model; input purchases are
  expensed when purchased.
- Wealth uses a current-day flow annualization, not a trailing-month average.
- Currency rate bounds/tolerances remain provisional numerical safety choices.

**Deferred:**

- Corporate, consumption/excise, land/property, and tariff taxes; state-enterprise
  remittance; colonial/subject transfers; broader government expenditure,
  procurement, services, state employment, subsidies, infrastructure, and debt
  service.
- Debt/bonds, interest, maturities, default, deficit financing, banks, a central
  bank, monetary issuance, FX, inflation, and monetary regimes.
- Law-bounded rates/enactment, elections, interest groups, and M8 institutions.
- Player/AI policy actions, UI/snapshots/commands, multi-region/multi-country
  authoring, GDP/national accounts, annual history, annual close,
  reopen/reversal/adjusting entries, retained-earnings subtypes, summary
  compaction, and new M4b flow kinds.

## Decisions versus restrictions

- **Accepted decision:** D-048 is the authoritative M4c decision recorded here;
  D-047, D-046, and D-044/D-045 remain the earlier finance decisions and are not
  rewritten. D-048 implementation notes record the conditional fiscal-account
  clarification and the digests.
- **Current implementation behavior:** validation enforces fiscal values, account
  completeness/ownership, treasury references and collisions, region ownership
  when fiscal is active, tax/welfare cash limits, cash neutrality, the accounting
  identity, close ordering, and deterministic treasury reconciliation.
- **Documented deviations:** the countryless fiscal account set is conditional on
  a declared country, and collection efficiency is fixed at 1.0; both are stated
  in §5.4.3/§8.3 and D-048 implementation notes.
- **Deferred:** the GDD preserves future finance and monetary design as future
  goals without claiming they are implemented.

## Validation

- `Century_GDD_v2.3.md` and `Century_GDD_v2.4.md` remain byte-for-byte unchanged;
  `git diff` shows no changes to either document or to the v2.3/v2.4 change
  reports.
- Only documentation files were changed in this revision: `Century_GDD_v2.5.md`,
  `GDD_V2.5_CHANGE_REPORT.md`, `README.md`, and `DECISIONS.md`.
- The M4c implementation commit `557b37b` changed only simulation, tests, and
  benchmark files; the D-048 decision commit `ec125bd` changed only
  `DECISIONS.md`.
- Tests executed before this documentation revision: `pnpm test` passed 32 suites
  and 399 tests; `pnpm run typecheck` passed; `pnpm run lint` passed; `git diff
  --check` was clean.
- `pnpm run ci` completed with exit code 0. It ran lint, typecheck, the 399-test
  suite, and the benchmark; the benchmark result was **PASS**. Every M1/M2 hash
  gate and every M3/M4b/M4c correctness gate passed. The final CI M4c fiscal-day
  results were avg/p95 `7.626/8.503 ms` (small) and `16.954/19.545 ms` (stress),
  with identical cross-run hashes, reconciled treasuries, conserved cash, and the
  accounting identity preserved. The provisional 200-block M2 Node guard was p95
  `3.908 ms` in the final run (satisfied); two preceding standalone runs measured
  `5.303 ms` and `5.490 ms` and failed that guard, which is reported as Node
  measurement variance rather than adjusted. Mobile p95 remains **NOT
  EVALUATED**.
- Markdown code fences are balanced (12 fences in the document, unchanged from
  v2.4), and internal section references were checked.

## Stop condition

Documentation only. M4c was already implemented and committed; this revision does
not reopen it. The next implementation milestone is not started.
