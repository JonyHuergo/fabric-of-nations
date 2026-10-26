# GDD v2.5 — Change Report

**Status:** documentation revision; committed with the M4c documentation and
finance-roadmap updates.\
**Authoritative document:** `Century_GDD_v2.5.md`\
**Supersedes:** `Century_GDD_v2.4.md` (retained as historical, byte-for-byte unchanged)\
**Implementation baseline:** accepted M0–M4c; M4c implementation commit `557b37be63ecec5f8bb1826c77bb35a43e1e9531`, parent `ec125bdeb23ee1ddd1abe1429eb4c78b66171b9a` (D-048 decision commit)\
**Planning baseline:** D-050 and GDD v2.5 §17.3–§17.4 adopt M5a, M5b, M7a, and M8a as **planned, not implemented** stages\
**Change date:** 2026-10-25

## Purpose

This revision reconciles the authoritative design document with the committed
M4c government fiscal loop: a per-country treasury, a daily flat income tax on
wages actually paid, and a daily budgeted per-capita welfare transfer. It also
adopts the post-M4c finance roadmap direction: intermediate stages M5a, M5b,
M7a, and M8a, inserted into the existing M0–M10 order without renumbering those
milestones.

The revision preserves the long-term design intent, the historical v2.3/v2.4
documents, the determinism/conservation rules, the country/currency model, the
deferred finance systems, and the unverified mobile-performance status. It does
not add requirements beyond D-048 for implemented behavior. The intermediate
stages are planned design only; they are not implemented and are not claimed as
runtime support.

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
| §8.3–§8.6 stage ownership | Labels state-enterprise remittance (M5a), public debt and interest (M5b), annual close and controlled corrections (M7a), and inflation/FX/monetary policy (M8a) as planned, not implemented; keeps all other future finance work unassigned. | D-050 |
| §14.4 performance | Notes that the M4c fiscal benchmark times the integrated fiscal day, excludes setup/hashing, and does not evaluate the mobile p95 target. | `packages/bench/src/bench.ts` |
| §15.1 data scope | Notes that no country/currency historical dataset or shipped fiscal scenario exists; M4c fixtures are inline tests. | test fixtures; D-048 |
| §16.2/§16.4 tests and conservation | Adds the current M4c fiscal test coverage and the current government-cash equation interpretation (no borrowing, interest, or accrued arrears; shortfall is unfunded). | `m4c-fiscal.test.ts`; D-048 |
| §17 milestone plan | Updates the M4 row, adds M4c as an accepted §17.2 stage, and states the implementation status (M0–M4c implemented; M5–M10 planned). | Commit `557b37b`; D-048 |
| §17.3–§17.4 (new) | Adds the planned intermediate stages M5a, M5b, M7a, and M8a with scope, placement, dependencies, non-goals, the implementation order, and the preserved M0–M7 slice boundary. | D-050; designer-adopted direction |
| §20.1 decisions | Item 5 records M4c fiscal postings/close and the M7a annual-close plan; item 17 records the provisional fiscal policy plus the planned stage ownership. | D-048; D-050 |
| §21 glossary | Adds fiscal policy, treasury, welfare shortfall, and planned intermediate stage; updates the current-implementation baseline. | D-048; D-050 |
| README | Identifies v2.5 as the current design authority and v2.4/v2.3 as historical; records M4c in the implemented baseline, adds an M4c section, adds the planned roadmap, and updates schema/digest/benchmark/limitation references. | M4c implementation; D-050 |
| DECISIONS | Adds D-048 implementation notes and D-050 roadmap staging without rewriting prior decisions. | D-048; D-050 |

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

## Planned intermediate finance stages adopted in v2.5

These stages are **planned design, not implementation**. They are recorded in GDD
v2.5 §17.3–§17.4 and D-050, and no runtime behavior, schema field, save version,
benchmark gate, or UI support exists for them.

| Stage | Placement | Why it is placed there | Scope recorded |
|---|---|---|---|
| **M5a** | After M5, before M5b and M6 | M5 must first establish the multi-country economic/historical-data foundation and whatever ownership/enterprise structures exist; profit distribution and state-enterprise remittance cannot be specified before the entities and profit measure they move. | Private-profit distributions to designated owners/household capitalists or deterministic retention; actual state-owned-enterprise remittances to country treasuries through balanced entries; ownership, timing, account semantics, available-funds constraints; no distribution above distributable profit or available cash; accounting identity, determinism, and M4b close invariants preserved. |
| **M5b** | After M5a, before M6 | M5a supplies defined profit, enterprise remittance, and ownership structures needed for credible debt capacity and repayment analysis. M6 country AI must operate against borrowing constraints, interest, maturities, and default consequences that already exist rather than invent them. | Versioned debt contracts (issuer, holder, principal, interest/coupon, issue, maturity, outstanding liability, status); issuance with matching asset/liability entries and cash transfers; interest, maturity, principal repayment, refinancing, arrears, explicit default; separation of deficit, financing, borrowing proceeds, interest expense, and principal; financing constraints; no premature full banking/central-bank system. |
| **M7a** | After M7, before M8 | M7 delivers the first playable mobile vertical slice; annual close and controlled corrections complete the accounting lifecycle after that slice rather than delaying it. | Annual finance summaries and explicit periods; year-end closing consistent with the M4b monthly close; partial campaign years; controlled auditable correction/reversal entries preserving closed history; deterministic ordering, atomicity, validation, persistence, reconciliation. Not a prerequisite for the playable release. |
| **M8a** | After M8, before M9 | M8 establishes political institutions and laws, which supply monetary-policy authority and controls; M5/M5a/M5b supply the multi-country, enterprise-finance, and debt channels through which policy transmits. | Documented inflation/price-level measure (basket, weights, window); exchange-rate dynamics on existing country/currency identities and valuations; defined monetary authority/controls with explicit causal mechanisms; balanced money/credit accounting; deterministic timing, bounds, persistence, validation, tests; missing prerequisites recorded rather than hidden. |

**Dependency order recorded throughout v2.5 and README:**

`M4c → M5 → M5a → M5b → M6 → M7 → M7a → M8 → M8a → M9 → M10`

**Preserved slice.** The playable vertical slice remains **M0–M7**. M7a and M8a
are post-slice stages and are not prerequisites for the initial playable release.
M5–M7 are not automatically blocked on later monetary systems. M4c is unaffected;
its implemented treasury, income-tax, welfare, close, and persistence behavior is
not reopened.

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
  records M4c as an accepted stage and leaves the remaining unassigned M4 work
  and later milestone objectives not implemented.
- v2.4 “debt, distributions, annual close, inflation/FX, and monetary policy are
  unassigned future work” → v2.5 still marks them not implemented but assigns the
  adopted subset to planned stages: M5b (public debt), M5a (profit
  distributions/enterprise remittances), M7a (annual close/controlled
  corrections), and M8a (inflation/FX/monetary policy). Ownership of other future
  finance work is still unassigned.

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

**Planned (adopted, not implemented):**

- M5a: private profit distributions to designated owners/household capitalists or
  deterministic retention, and actual state-owned-enterprise remittances through
  balanced entries.
- M5b: public debt contracts, issuance, interest, maturity/principal repayment,
  refinancing, arrears, default, and deficit financing.
- M7a: annual finance summaries/periods, year-end close, partial years, and
  controlled auditable correction/reversal entries.
- M8a: documented inflation/price level, exchange-rate dynamics, and
  monetary-policy authority/controls with explicit causal mechanisms and balanced
  money/credit accounting.

**Deferred / not implemented in the accepted baseline:**

- The top-level milestones M5–M10 remain planned and unimplemented; their
  objectives are unchanged.
- Finance work not assigned to an intermediate stage: corporate,
  consumption/excise, land/property, and tariff taxes; colonial/subject
  transfers; broader government expenditure, procurement, services, state
  employment, subsidies, and infrastructure.
- Banks, a central bank, monetary issuance, and any monetary system beyond the
  M8a stage's explicit scope.
- Law-bounded rates/enactment and the M8 institutional details themselves.
- Player/AI policy actions, UI/snapshots/commands, GDP/national accounts, broader
  annual history, retained-earnings subtypes, summary compaction, long-term
  history compaction, and new M4b flow kinds.

## Decisions versus restrictions

- **Accepted decision:** D-048 is the authoritative M4c decision recorded here;
  D-047, D-046, and D-044/D-045 remain the earlier finance decisions and are not
  rewritten. D-048 implementation notes record the conditional fiscal-account
  clarification and the digests.
- **Adopted planning decision:** D-050 records the post-M4c finance roadmap
  staging, order, and slice boundary. It assigns ownership only; it does not
  implement the stages and does not alter D-048.
- **Separate concurrent decision:** D-049 (SUSD monetary precision and
  phase-qualified cash results) was recorded in `DECISIONS.md` while this revision
  was in progress. Its implementation changes are not part of this documentation
  commit, and this report does not treat them as accepted M4c behavior.
- **Current implementation behavior:** validation enforces fiscal values, account
  completeness/ownership, treasury references and collisions, region ownership
  when fiscal is active, tax/welfare cash limits, cash neutrality, the accounting
  identity, close ordering, and deterministic treasury reconciliation.
- **Documented deviations:** the countryless fiscal account set is conditional on
  a declared country, and collection efficiency is fixed at 1.0; both are stated
  in §5.4.3/§8.3 and D-048 implementation notes.
- **Planned design:** M5a, M5b, M7a, and M8a are roadmap commitments with scope,
  placement, and dependency rationale but no code or test evidence.
- **Deferred:** the GDD preserves other future finance and monetary design as
  future goals without claiming they are implemented.

## Evidence classification

**Confirmed against committed code and decision records (implemented):**

- Per-country treasury/fiscal accounts, `Country.treasuryAccountId`, and
  `Country.fiscal`; conditional fiscal-account creation for worlds that declare a
  country.
- Daily income tax `incomeTaxRate × wages actually received`, residence-based and
  wage-only; no tax on welfare or wealth; wage/cash limits.
- Daily welfare `welfareBudgetSUSDPerYear / daysInYear`, treasury-cash funding
  limit, per-capita allocation with an exact deterministic remainder,
  proportional shortfall, and no debt/arrears/negative cash.
- `income-tax`/`welfare-transfer` kinds, semantic matrix, designated-cash
  treatment, country close into owner equity, and the close owner order pop
  blocks → buildings → countries → system owner.
- M4b summary shape/four flow kinds unchanged; wealth inputs use wages plus
  welfare and withheld income tax.
- Schema 9, simulation 0.9.0, save format 1, data version `m3-economy-v1`;
  schema-8/0.8.0 rejection.
- Git history: M4c implementation commit `557b37b`; D-048 recorded in `ec125bd`.

**Planned design (no implementation evidence):**

- M5a profit distributions/state-enterprise remittances; M5b public debt and
  deficit financing; M7a annual close and controlled corrections; M8a inflation,
  FX dynamics, and monetary-policy foundations.
- Their placement, dependency order, accounting distinctions, non-goals, and the
  M0–M7 slice boundary are design commitments, not current runtime behavior.
- The future `DebtContract` support type is a placeholder; M5b must extend it with
  contract versioning and outstanding liability.

**Not claimed:**

- No corporate/consumption/land/tariff taxes, broader government expenditure,
  banking, central bank, monetary issuance, debt, FX, inflation, annual close, or
  player/AI fiscal actions exist in the accepted build.
- Mobile performance remains **NOT EVALUATED**.

## Validation

- `Century_GDD_v2.3.md`, `GDD_V2.3_CHANGE_REPORT.md`, `Century_GDD_v2.4.md`, and
  `GDD_V2.4_CHANGE_REPORT.md` are byte-identical (same Git blob hash) to the
  commits that introduced them; no v2.3/v2.4 file was touched by this revision.
- The documentation commit changes only `Century_GDD_v2.5.md`,
  `GDD_V2.5_CHANGE_REPORT.md`, `README.md`, and `DECISIONS.md` (the last only to
  renumber the roadmap decision to D-050 after a concurrently committed D-049).
  The working tree also contains unrelated, concurrent M4c-remediation changes
  under `packages/sim` and `packages/tests`; they are not part of this commit and
  were preserved untouched.
- The M4c implementation commit `557b37b` changed simulation, tests, and
  benchmark files; the D-048 decision commit `ec125bd` changed only
  `DECISIONS.md`.
- The M4c test/benchmark evidence recorded above (32 suites/399 tests, lint,
  typecheck, CI PASS, benchmark timings) was executed during the M4c
  implementation/documentation baseline before this follow-up. This
  documentation-only follow-up did not rerun simulation CI or benchmarks, per the
  task.
- `git diff --check` passes. Markdown fences are balanced: 12 in
  `Century_GDD_v2.5.md`, 6 in `README.md`, and 0 in this change report. README
  internal links and anchors resolve, and the dependency order
  `M4c → M5 → M5a → M5b → M6 → M7 → M7a → M8 → M8a → M9 → M10` is repeated
  consistently in GDD §17.3–§17.4, this report, and README.
- M4c is marked implemented only where the committed code, tests, and D-048
  support it; M5a/M5b/M7a/M8a are marked planned everywhere.
- M0–M7 remains the playable vertical slice in the GDD and README.

## Stop condition

Documentation only. M4c was already implemented and committed; this revision does
not reopen it. No new simulation feature was implemented. The next implementation
milestone is not started.
