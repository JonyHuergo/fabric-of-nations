# Repository cleanup proposal — tests and documentation

**Status:** approved and carried out (D-145); kept as the record of what was proposed. Base: `prosperity/p5-land` at `433e969` (D-144). Date: 2026-11-05.

> **Outcome (2026-11-06).** Approved by the designer with these choices: archive the old
> GDD editions (no deletion); keep the P4 and P5 reports at the root until those stages
> are accepted; make the GDD path fix; refresh the four stale documents; folder names and
> fixture names, and the form of the DECISIONS index, left to the implementer. Carried
> out in Phase 2 and recorded as **D-145**, which lists every deviation from this
> proposal. The main ones: the province tests stay one file per continent (measured,
> only the combined-catalogue and partial-ownership tests were true duplicates, not the
> ≈ 2,700 lines estimated in §1 and §3.3); the military audit files, the two
> death-allocation files and the M11b monogram test are not merged (same helper names,
> different definitions); fixtures keep their milestone names; the version checks inside
> subsystem round-trip tests stay where they are. The tables below are the proposal as
> approved, not the final state; the final state is in D-145 and the README.

**Scope:** `packages/tests` (tests and fixtures), duplicated benchmarks in
`packages/bench`, root Markdown files, `docs/`, and `DECISIONS.md`. Simulation, app and
worker behaviour are not touched; the only non-test, non-document files the proposal
changes are the two terminology audits (`scripts/m13/branding-audit.mjs`,
`scripts/m14/monetary-terminology-audit.mjs`), whose historical-file allowlists must
follow the moved documents, and, if you agree, one bench entry point and one package
script (§5).

## 1. Summary

| | Before | After (proposed) |
|---|---:|---:|
| Test files | 115 | 92 |
| Test lines | 40,691 | ≈ 37,600 |
| Fixture files | 24 | 23 (two encoding helpers merged) |
| Test directories | 1 flat folder, named by milestone | 12 subsystem folders |
| Root Markdown files | 55 (105,252 lines) | 4 (≈ 15,700 lines) |
| `docs/` Markdown files (current) | 34 | 21 + `docs/archive/` index |
| Archived (moved, unchanged) | — | 64 files + `README_HISTORY.md` |
| Benchmark entry points | 23 | 22 |
| Assertions removed | — | **none** (duplicates are merged with every distinct assertion kept) |

The honest headline: **almost nothing in the suite tests behaviour that no longer
exists.** Every one of the 115 files passes, and the code each one exercises is still in use as far as I traced it (the SVG
fallback map, the M3 catalogue behind the M5 sample and fixtures, the M1 tick driver and
the legacy save rejection are all still used). The gains come from three places:

1. **Duplication.** The five M12 province files repeat about 15 generic checks per
   continent almost verbatim (≈ 2,700 lines); the same "an old save schema is rejected"
   assertion is written 13 times in 13 files; six small files test the one SVG fallback
   map, four small files inspect app wiring the same way, four audit-remediation files
   sit beside the M10 warfare suite, and a handful of one-to-three-test files belong in
   the file next to them.
2. **Organisation.** Milestone prefixes (m2, m3a, e6b, audit-020, batch5, d137, p2b …)
   become subsystem folders; this changes no assertion.
3. **Documents.** 51 historical root files and 13 historical `docs/` records move to
   `docs/archive/`, README is split into a current README and an archived history, and
   DECISIONS.md gains an index. Nothing historical is deleted unless you approve a group.

Nothing in this proposal touches the tests you marked as restated or pending revision
(D-142 to D-144) beyond moving the file; those are flagged in the tables.

## 2. Baseline (recorded 2026-11-05 on `433e969`, Windows 11, Node 24.22.1, pnpm 9.15.9, clean tree)

| Command | Result |
|---|---|
| `pnpm typecheck` | exit 0 (builds sim, data, sim-worker; typechecks every package, including app, bench and tests) |
| `pnpm test` | exit 0. Only `packages/tests` defines a `test` script. **Test suites: 115 passed, 115 total. Tests: 1,397 passed, 1,397 total.** 0 failed, 0 skipped, 0 todo, no `.only`/`.skip`/`xit` anywhere in the suite. Jest time 1,740.8 s (≈ 29 min, `--runInBand`). |

The one "worker bundle is stale" line in the log is expected: it is the output of the
drift test that deliberately checks a corrupted copy.

No test files exist outside `packages/tests/src` (no `*.test.*` or `*.spec.*` elsewhere in
`packages/`).

Slowest files (Jest reports a time only for files over 5 s; 36 files did, 79 ran in
under 5 s each):

| File | Time | Why (from the tests' own titles and setup) |
|---|---:|---|
| `worker-bundle-drift` | 336.5 s | builds the 12 MB worker bundle four times |
| `m11-world` | 240.1 s | builds a campaign for each of 66 selectable countries, plus the protocol round trips |
| `p4-demography` | 170.7 s | multi-year 1900-world runs |
| `m11d-runtime-contract` | 149.6 s | 66 campaigns through the worker host |
| `p3-local-currency` | 104.7 s | 1900-world days in several display currencies |
| `p2b-money` | 77.1 s | the P2b builder `--check` and 1900-world runs |
| `d139-new-game-reuse` | 74.3 s | three 1900-world constructions |
| `m14-rusd` | 59.3 s | the monetary audit script and the pinned 1900 hash |
| `p1-rollback` | 52.2 s | staged vs phase runs of the 1900 world |
| `m7a-annual-accounting` | 48.7 s | full-year runs |
| `m2-calibration` | 42.3 s | century population runs |
| `m4b-save-compaction` | 40.9 s | late-game compacted saves |

These twelve files take 1,396 s, 80 % of the run. Apart from the drift test, their cost
is the work they assert on (full-world runs), so the proposal does not try to make them
faster by weakening them.

## 3. Tests

### 3.1 Target layout

Jest already matches `src/**/*.test.ts` and the tests' `tsconfig.json` includes
`src/**/*.ts`, so subfolders need no configuration change; only relative imports
(`./fixtures/…` → `../fixtures/…`, `../../app/src/…` → `../../../app/src/…`) and the
paths the tests build from `import.meta.url` change.

| Folder | Subsystem | Files | Holds |
|---|---|---:|---|
| `architecture/` | isolation and repository guards | 4 | sim isolation, No-Mana, dependency cycles, generated-bundle drift, naming audits |
| `determinism/` | determinism and the tick pipeline | 7 | keyed RNG known answers, replay digests, tick driver, calendar, rollback, performance invariants, per-tick validation |
| `serialization/` | save format | 5 | envelope, typed arrays, round trips, **one** save-compatibility table |
| `population/` | population and demography | 9 | state, ageing, births/deaths, death allocation, calibration, needs, wealth, P4 causes, migration |
| `economy/` | production and markets | 17 | definitions, world state, employment, inventory, production, market clearing, the integrated day, multi-country/market, labour, feasibility, land and resources, construction, industrial policy, labour institutions, integration |
| `money/` | accounts, fiscal, debt, currency | 15 | ledger, accounts, settlement, period close, compaction, fiscal, debt, profit, annual accounting, currency identity, monetary authority, money calibration, local-currency display |
| `trade/` | inter-market trade | 1 | routes, customs, quotas, conservation |
| `government/` | AI, politics, technology, military | 7 | country AI, player country, politics, education, technology, military, military validation |
| `data/` | historical data and catalogue | 5 | loader validation, 1900 world, catalogue coverage, flags, province world |
| `map/` | map | 9 | province catalogue (table-driven over five bundles), province history, polity geography, SVG fallback, render bundle, camera, hit test, labels, style |
| `ui-shell/` | app shell and storage | 5 | design tokens, mobile shell, app wiring, save library, storage adapter |
| `worker/` | snapshot/command contract | 8 | host, supervisor, autosave, save store, save preview, protocol, economic reporting, new-game reuse |

I added `data/`, `government/` and `worker/` to your list because those tests do not fit
any of the nine named subsystems without stretching them (the worker suite *is* the
snapshot/command contract). If you prefer, `worker/` can be named `contract/`.

Fixtures keep one folder (`src/fixtures/`) and are renamed by subject in the same commit
that rewrites their import paths (e.g. `m2.ts` → `populationWorld.ts`, `m3d.ts` →
`marketDay.ts`, `m5.ts` → `multiCountryWorld.ts`, `provinces.ts` → `provinceBundles.ts`);
`p4Encoding.ts` and `p5Encoding.ts` (the D-142/D-143 re-pin digests) merge into
`legacyDigests.ts`. Optional: keep the milestone names for fixtures if you would rather
not rename them.

### 3.2 Every test file

Columns: **tests** = `test(`/`it(` blocks in the file (loops add more at run time); **time** = the file's wall time in the baseline run (Jest prints it only for files over 5 s; `< 5 s` otherwise). **Action**: keep (move/rename only), simplify (some assertions move elsewhere, nothing is dropped), merge (the file's tests move into the target), delete.

No file is classified **delete**: none protects behaviour that no longer exists, and none is fully covered by a later test without carrying at least one assertion of its own.

#### `architecture/`

| File | Lines | Tests | Time | Protects | Action → target | Reason | Flag |
|---|---:|---:|---:|---|---|---|---|
| `architecture` | 341 | 9 | < 5 s | Sim isolation: ES2022 lib, no deps, no DOM/RN/Node/Date/Math.random, app imports only snapshot/command contracts | **keep** → `architecture/isolation.test.ts` | Hard-rule guard (AGENTS §3); absorbs no-mana |  |
| `no-mana` | 62 | 2 | < 5 s | No-Mana pool names; raw-text Math.random scan of sim/data/app/bench | **merge** → `architecture/isolation.test.ts` | Its Math.random scan overlaps architecture's; both variants (raw text and comment-stripped) kept as two assertions; the forbidden-pool test moves unchanged |  |
| `m11e-simulation-dependencies` | 78 | 5 | < 5 s | No runtime import cycles in sim; world init imports validators only | **keep** → `architecture/dependency-cycles.test.ts` | Live guard; rename only |  |
| `worker-bundle-drift` | 74 | 2 | 336.5 s | Committed worker bundle equals a fresh generation; stale bundle detected | **simplify** → `architecture/generated-drift.test.ts` | Builds the 12 MB bundle four times. The --check run and one --output run, each compared with the committed bundle, prove the same two facts (current; two generations identical) with one build fewer; the stale-copy test is unchanged |  |
| `m13-branding` | 94 | 5 | < 5 s | Branding audit, official name in app/GDD/README, Century-era save rejected | **keep** → `architecture/naming-audits.test.ts` | Merge with m14 into one naming-audit file; the old-save assertion moves to save-compatibility |  |
| `m14-rusd` | 179 | 10 | 59.3 s | RUSD identity, RUSD≠USD, pinned 1900 world hash, RUSD field names, protocol vocabulary, monetary audit | **merge** → `architecture/naming-audits.test.ts` | Same shape as m13 (audit script + docs + legacy save); the pinned 1900 hash moves to determinism/replay; the legacy-unit save assertion moves to save-compatibility |  |

#### `determinism/`

| File | Lines | Tests | Time | Protects | Action → target | Reason | Flag |
|---|---:|---:|---:|---|---|---|---|
| `rng` | 188 | 9 | < 5 s | Keyed RNG known answers, key isolation, purpose separation, validation | **keep** → `determinism/rng.test.ts` | Known-answer tests (AGENTS §3); rename only |  |
| `determinism` | 139 | 7 | 21.0 s | 100-year empty-world driver digest, one-year economy replay, save/resume no skip/duplicate | **keep** → `determinism/replay.test.ts` | Core determinism; rename only |  |
| `tick` | 145 | 8 | 6.4 s | No-op tick driver, 36,524 transitions, terminal boundary | **keep** → `determinism/tick-driver.test.ts` | Calendar/tick contract still used by every tick; rename only |  |
| `calendar` | 144 | 8 | < 5 s | Gregorian calendar, leap rules, campaign day range | **keep** → `determinism/calendar.test.ts` | Live; rename only |  |
| `p1-rollback` | 270 | 11 | 52.2 s | Phase mode equals staged mode; rollback restores exact day start; hot-path indexes | **keep** → `determinism/rollback.test.ts` | Live (worker host uses phase mode); rename only |  |
| `d137-performance-invariants` | 114 | 3 | < 5 s | Phase observer, summary detail and snapshot cache change no hash | **keep** → `determinism/performance-invariants.test.ts` | Live; rename only |  |
| `batch5-validation` | 308 | 10 | 8.9 s | 22-tick known-answer hash; one entry+publication validation per tick; staged mode equivalence; cash conserved per tick | **keep** → `determinism/tick-validation.test.ts` | Restated in D-143 (fallbackTicks now reported); move only, no assertion change | restated D-143 |

#### `serialization/`

| File | Lines | Tests | Time | Protects | Action → target | Reason | Flag |
|---|---:|---:|---:|---|---|---|---|
| `serialization` | 300 | 13 | < 5 s | Envelope checksum, tamper/metadata rejection, typed-array encoding, -0 normalisation | **keep** → `serialization/envelope.test.ts` | Core round-trip contract; rename only |  |
| `m2-serialization` | 151 | 7 | < 5 s | Population typed-array round trip, continuation after restore, corrupt arrays rejected | **simplify** → `serialization/population-roundtrip.test.ts` | Its schema-2 rejection moves to save-compatibility; rest unchanged |  |
| `m3a-serialization` | 181 | 8 | < 5 s | M3a structural digest (known answer), lot canonicalisation, malformed decode rejection | **simplify** → `serialization/economy-roundtrip.test.ts` | Older-schema rejection moves to save-compatibility; rest unchanged |  |
| `m4a2-serialization` | 188 | 10 | < 5 s | Countries/currencies/valuations round trip, clone isolation, digest coverage | **simplify** → `serialization/country-currency-roundtrip.test.ts` | Schema-6 rejection moves to save-compatibility |  |
| *(new)* | — | — | — | Every historical schema and sim version is rejected, never migrated (D-013, D-120) | **create** → `serialization/save-compatibility.test.ts` | Collects ~13 copies of the same 'old schema is rejected' assertion from m2/m3a/m4a2/m4b/m4c/m5-world/m9-technology/e6a/e6b/m10/p2/m13/m14 into one table; every schema number and message regex kept |  |

#### `population/`

| File | Lines | Tests | Time | Protects | Action → target | Reason | Flag |
|---|---:|---:|---:|---|---|---|---|
| `m2-state` | 190 | 8 | < 5 s | Single-year sex arrays, derived 5-year groups, validation | **keep** → `population/state.test.ts` | Live; rename only |  |
| `m2-ageing` | 99 | 6 | < 5 s | Exact annual ageing, 80+ group, conservation | **keep** → `population/ageing.test.ts` | Live; rename only |  |
| `m2-demography` | 329 | 10 | 24.5 s | Age-specific births/deaths, fractional remainders, conservation over a century | **keep** → `population/births-deaths.test.ts` | Contains P4 (D-142) cases; move only | restated D-142 |
| `m2-death-allocation` | 238 | 3 | < 5 s | Death remainder selection matches reference algorithm | **merge** → `population/death-allocation.test.ts` | Same subject as m2-death-total (P2a/P2b1 death allocation); one file, all three cases kept |  |
| `m2-death-total` | 275 | 2 | < 5 s | Reused expected-death total matches reference | **merge** → `population/death-allocation.test.ts` | See m2-death-allocation |  |
| `m2-calibration` | 348 | 5 | 42.3 s | No-shock baseline, levels do not drift, WPP 1950 structure validation | **keep** → `population/calibration.test.ts` | Restated M2.1 test under D-142; move only | restated D-142 |
| `m2-needs` | 352 | 11 | < 5 s | Needs tiers, budgets, shared supply never reused, no money created | **keep** → `population/needs.test.ts` | Live; rename only |  |
| `m2-wealth` | 216 | 9 | < 5 s | Monthly wealth, militancy, food-shortfall mortality | **keep** → `population/wealth-militancy.test.ts` | Contains P4 case; move only | restated D-142 |
| `p4-demography` | 476 | 17 | 170.7 s | Sourced 1900 levels, cause-driven TFR/mortality, famine, conservation, snapshot | **keep** → `population/demography-causes.test.ts` | Restated/pending revision (D-142, D-144 fertility ceiling has no tests); move only | pending D-142/D-144 |
| `m5-migration` | 321 | 9 | < 5 s | Migration flows, caps, conservation, employment repair | **keep** → `population/migration.test.ts` | Live; rename only |  |

#### `economy/`

| File | Lines | Tests | Time | Protects | Action → target | Reason | Flag |
|---|---:|---:|---:|---|---|---|---|
| `m3a-definitions` | 121 | 5 | < 5 s | Static goods/building catalogue validation | **keep** → `economy/definitions.test.ts` | Live (legacy M3 catalogue still backs fixtures and the M5 sample); rename only |  |
| `m3a-world` | 194 | 13 | < 5 s | Economy world validation, references, storage capacity | **keep** → `economy/world-state.test.ts` | Live; rename only |  |
| `m3b-employment` | 289 | 15 | < 5 s | Workforce eligibility, slot caps, largest-remainder quotas | **keep** → `economy/employment.test.ts` | Live; rename only |  |
| `m3b-scheduling` | 162 | 9 | < 5 s | Monthly/dirty reassignment, permutation invariance, save/resume | **keep** → `economy/employment-scheduling.test.ts` | Live; rename only |  |
| `m3c-inventory` | 199 | 9 | < 5 s | Producer-owned lots, overflow loss, inventory conservation | **keep** → `economy/inventory.test.ts` | Live; rename only |  |
| `m3c-production` | 444 | 18 | < 5 s | Capacity, limiting inputs, multi-output, reservations | **keep** → `economy/production.test.ts` | Live; rename only |  |
| `m3d-market` | 753 | 29 | < 5 s | Two-pass clearing, tier priority, bounded prices, permutation invariance | **keep** → `economy/market-clearing.test.ts` | Live; rename only |  |
| `m3f-day` | 611 | 21 | < 5 s | Integrated day, staging isolation, rollback, save/load continuation | **keep** → `economy/economic-day.test.ts` | Live; rename only |  |
| `m5-world` | 261 | 11 | < 5 s | Multi-country construction, closed borders, migration tick conservation | **simplify** → `economy/multi-country-world.test.ts` | Schema-9..12 rejection moves to save-compatibility |  |
| `m5-market` | 295 | 10 | < 5 s | Every market cleared once, shared markets, failed tick unchanged | **keep** → `economy/multi-market.test.ts` | Live; rename only |  |
| `m5-labor` | 247 | 6 | < 5 s | Cross-province/border labour, residence taxation | **keep** → `economy/labor-mobility.test.ts` | Live; rename only |  |
| `m5-feasibility` | 320 | 5 | < 5 s | M5 sample can feed itself; recipes profitable; first-day cash | **keep** → `economy/scenario-feasibility.test.ts` | Restated D-142/D-143 for designer review; move only | restated D-142/D-143 |
| `p5-land` | 556 | 19 | 12.4 s | Land diminishing returns, harvest weather known answers, own consumption, deposits, discovery replay | **keep** → `economy/land-resources.test.ts` | Pending revision (D-143); move only | pending D-143 |
| `e3-construction` | 672 | 13 | 6.7 s | Construction authorisation, progress, cancellation, reporting | **keep** → `economy/construction.test.ts` | Live; rename only |  |
| `e4-industrial-policy` | 561 | 12 | < 5 s | Subsidies, materials, enterprise support, persistence | **keep** → `economy/industrial-policy.test.ts` | Live; rename only |  |
| `e5-labor` | 322 | 11 | < 5 s | Training, qualification, labour laws, public health | **keep** → `economy/labor-institutions.test.ts` | Live; rename only |  |
| `batch6-integration` | 254 | 1 | 7.8 s | Multi-country run conserves population, cash and accounting across closes, migration, debt | **keep** → `economy/integration.test.ts` | Restated D-143; move only | restated D-143 |

#### `money/`

| File | Lines | Tests | Time | Protects | Action → target | Reason | Flag |
|---|---:|---:|---:|---|---|---|---|
| `m3e-settlement` | 706 | 19 | < 5 s | Cash settlement, wages, upkeep, atomicity, cash conservation | **keep** → `money/settlement.test.ts` | Live; rename only |  |
| `m3a-accounting` | 210 | 10 | < 5 s | Balanced postings, cash conservation, atomic rejection | **keep** → `money/ledger.test.ts` | Live; rename only |  |
| `m4a1-accounts` | 605 | 29 | < 5 s | Opening balances, normal sides, designated cash, persistence | **keep** → `money/accounts.test.ts` | Live; rename only |  |
| `m4a2-country-currency` | 365 | 32 | < 5 s | Currency arrangements, cross rates, conversion, RUSD key rejection | **keep** → `money/currency-identity.test.ts` | Live; rename only |  |
| `m4b-period-close` | 1205 | 30 | < 5 s | Monthly close, posting matrix, summary persistence | **simplify** → `money/period-close.test.ts` | Schema-7/sim-0.7.0 rejection moves to save-compatibility; staged-save assertion stays |  |
| `m4b-save-compaction` | 335 | 8 | 40.9 s | Monthly finance compaction, save size bound, compacted save loads | **keep** → `money/history-compaction.test.ts` | Restated D-143; move only | restated D-143 |
| `m4c-fiscal` | 1406 | 44 | 5.1 s | Income tax, welfare, fiscal accounts, atomicity | **simplify** → `money/fiscal.test.ts` | Schema-8 rejection moves to save-compatibility |  |
| `m5-fiscal` | 133 | 4 | < 5 s | Per-country treasuries reconcile; shared market, separate treasuries | **keep** → `money/multi-country-fiscal.test.ts` | Live; rename only |  |
| `m5a-profit` | 401 | 16 | < 5 s | Profit distribution and state remittance | **keep** → `money/profit-distribution.test.ts` | Live; rename only |  |
| `m5b-debt` | 339 | 14 | < 5 s | Debt issuance, interest, repayment, default | **keep** → `money/public-debt.test.ts` | Live; rename only |  |
| `m5b-debt-bounded` | 181 | 4 | < 5 s | Liquidity before issuance, bounded contracts | **merge** → `money/public-debt.test.ts` | Same subject as m5b-debt; second describe in one file |  |
| `e2-fiscal-management` | 780 | 16 | 6.9 s | Tax schedule, welfare allocation, business tax, financing actions | **keep** → `money/fiscal-management.test.ts` | Restated D-143; move only | restated D-143 |
| `m7a-annual-accounting` | 243 | 7 | 48.7 s | Annual flows equal twelve monthly closes; corrections never rewrite history | **keep** → `money/annual-accounting.test.ts` | Live; rename only |  |
| `e6b-monetary` | 738 | 21 | < 5 s | Currency board, price index, convertibility, worker contract | **simplify** → `money/monetary-authority.test.ts` | Previous-schema rejection moves to save-compatibility |  |
| `p2b-money` | 364 | 18 | 77.1 s | Sourced 1900 money tables, traceability of every money value, generator current | **keep** → `money/money-calibration.test.ts` | Restated D-143; move only | restated D-143 |
| `p3-local-currency` | 635 | 24 | 104.7 s | 1900 currency table, display formatter, display currency changes no hash | **keep** → `money/local-currency-display.test.ts` | Live; rename only |  |

#### `trade/`

| File | Lines | Tests | Time | Protects | Action → target | Reason | Flag |
|---|---:|---:|---:|---|---|---|---|
| `e6a-trade` | 751 | 19 | < 5 s | Routes, dispatch, customs, quotas, conservation, worker contract | **simplify** → `trade/trade.test.ts` | Previous-schema rejection moves to save-compatibility |  |

#### `government/`

| File | Lines | Tests | Time | Protects | Action → target | Reason | Flag |
|---|---:|---:|---:|---|---|---|---|
| `audit-014-payroll-income` | 132 | 1 | < 5 s | Military pay outside the income-tax base | **merge** → `government/military.test.ts` | One-test file; military finance belongs with the military suite |  |
| `m6-ai` | 441 | 13 | 7.7 s | AI cadence, shared validator with player, bounded state | **keep** → `government/country-ai.test.ts` | Restated D-143; move only | restated D-143 |
| `m6-player-country` | 101 | 2 | 6.7 s | Designated player country excluded from AI | **keep** → `government/player-country.test.ts` | Live; rename only |  |
| `m8-politics` | 488 | 13 | 14.1 s | Interest groups, laws, elections, unrest from causes | **keep** → `government/politics.test.ts` | Live; rename only |  |
| `m9-education` | 344 | 12 | < 5 s | Academic staffing, education payroll, age-specific literacy | **keep** → `government/education.test.ts` | Live; rename only |  |
| `m9-technology` | 496 | 16 | < 5 s | Tech catalogue validation, research work, effects | **simplify** → `government/technology.test.ts` | Old-schema/protocol rejection moves to save-compatibility and worker/protocol |  |
| `m10-warfare` | 774 | 17 | < 5 s | Sovereignty vs control, recruitment, combat conservation, diplomacy | **simplify** → `government/military.test.ts` | Previous-schema rejection moves to save-compatibility; absorbs the four audit files |  |
| `audit-006-military-allocation` | 647 | 9 | < 5 s | Proportional recruitment, keyed tie-breaks, atomic rejection, cash conservation | **merge** → `government/military.test.ts` | Audit remediation of M10; same subject |  |
| `audit-010-015-military` | 528 | 11 | < 5 s | Cession safety, zero-recipient pay, truce boundary, casualty shares, crafted-state rejection | **merge** → `government/military-validation.test.ts` | Audit remediation of M10; validation-heavy, kept as its own file under its subject |  |
| `audit-020-022-final` | 159 | 4 | < 5 s | Military action day/period validation; recruitment employment atomicity | **merge** → `government/military-validation.test.ts` | Same subject as audit-010-015 |  |

#### `data/`

| File | Lines | Tests | Time | Protects | Action → target | Reason | Flag |
|---|---:|---:|---:|---|---|---|---|
| `m5-history` | 197 | 8 | 7.2 s | Eight-polity sample loads, validates, is order independent | **keep** → `data/historical-loader.test.ts` | Same subject as history-loader-validation; kept as its own describe in the merged loader file |  |
| `history-loader-validation` | 210 | 6 | < 5 s | Shipped data valid; bounds fail at data stage; order-independent ids | **keep** → `data/historical-loader.test.ts` | Absorbs data-version-consistency and m5-history |  |
| `data-version-consistency` | 54 | 3 | < 5 s | Package, sim default and scenarios agree on data version | **merge** → `data/historical-loader.test.ts` | Three small tests of the same loader boundary |  |
| `m11-world` | 643 | 17 | 240.1 s | 1900 catalogue classification, every selectable country initialises, slider ranges validate | **simplify** → `data/world-1900.test.ts` | Protocol-13 rejection moves to worker/protocol; everything else unchanged |  |
| `m11b-coverage` | 280 | 11 | 19.3 s | 60 researched countries, stable ids/tags, map and picker integration | **simplify** → `data/catalogue-coverage.test.ts` | Its monogram test duplicates m11-flags; its extra tag assertions (ESP, SAH, SGG, MNT, ZAR, AUT ensign, flag kinds) move there |  |
| `m11-flags` | 533 | 16 | < 5 s | Every polity has a flag, licensing, reproducible asset pipeline | **keep** → `data/flags.test.ts` | Live; absorbs m11b monogram assertions |  |
| `p2-provinces` | 247 | 12 | 5.7 s | No region layer, conserving province transfer, customs territories, generated scenario current | **simplify** → `data/province-world.test.ts` | Schema-27 rejection moves to save-compatibility |  |

#### `map/`

| File | Lines | Tests | Time | Protects | Action → target | Reason | Flag |
|---|---:|---:|---:|---|---|---|---|
| `m11c-geography` | 633 | 21 | 8.1 s | 1900 polity borders, overlaps, provenance documents, smoke images | **keep** → `map/polity-geography.test.ts` | Live; reads docs/HISTORICAL_MAP_PROVENANCE, MAP_DATA, 1900_CATALOG_COVERAGE, DECISIONS and docs/images/m11c (kept in place) |  |
| `m12a-provinces` | 1181 | 24 | 9.6 s | Europe bundle: ids, owners, geometry, borders, hit testing, coverage; transfers and 1900–1990 settlements | **merge** → `map/provinces-catalogue.test.ts + map/provinces-history.test.ts` | Generic per-bundle checks are repeated almost verbatim in m12a–e; one table-driven suite over the five bundles, continent-specific history kept as its own describe |  |
| `m12b-asia-provinces` | 1121 | 32 | 8.0 s | Asia bundle + Asian transitions | **merge** → `map/provinces-catalogue.test.ts + map/provinces-history.test.ts` | See m12a |  |
| `m12c-africa-provinces` | 1487 | 40 | 7.7 s | Africa bundle + African transitions | **merge** → `map/provinces-catalogue.test.ts + map/provinces-history.test.ts` | See m12a |  |
| `m12d-americas-provinces` | 1190 | 35 | 9.0 s | Americas bundle + American transitions and snapshots | **merge** → `map/provinces-catalogue.test.ts + map/provinces-history.test.ts` | See m12a |  |
| `m12e-oceania-provinces` | 1486 | 40 | 9.2 s | Oceania bundle, global land coverage, five-bundle catalogue, rendering contracts | **merge** → `map/provinces-catalogue.test.ts + map/provinces-history.test.ts` | See m12a; global coverage and rendering stay as describes in the catalogue file |  |
| `m11c1-map-viewport` | 68 | 4 | < 5 s | SVG viewport zoom limits, focal point, letterboxing | **merge** → `map/svg-fallback.test.ts` | SVG fallback map (WorldMap.tsx, still live) is spread over six files |  |
| `m11c1-rendering` | 87 | 4 | < 5 s | SVG draw order, wheel/pinch wiring, smoke images | **merge** → `map/svg-fallback.test.ts` | See m11c1-map-viewport |  |
| `m11d-map-legibility` | 114 | 4 | < 5 s | SVG seams, land mask, label scaling | **merge** → `map/svg-fallback.test.ts` | See m11c1-map-viewport; its label-scaling test and m11d-map-selection's overlap and are kept as one test with both sets of assertions |  |
| `m11d-map-selection` | 44 | 3 | < 5 s | SVG labels do not intercept clicks; markers selectable | **merge** → `map/svg-fallback.test.ts` | See m11d-map-legibility |  |
| `m11d-map-wheel` | 38 | 2 | < 5 s | Wheel factor, non-passive listener | **merge** → `map/svg-fallback.test.ts` | See m11c1-map-viewport |  |
| `m11e-worldmap-geometry` | 156 | 6 | < 5 s | SVG geometry decode, malformed rings rejected, marker fallback | **merge** → `map/svg-fallback.test.ts` | See m11c1-map-viewport |  |
| `m15-map-bundle` | 269 | 15 | < 5 s | Render bundle current, geometry, raster, historical water | **keep** → `map/render-bundle.test.ts` | Live; rename only |  |
| `m15-map-camera` | 167 | 15 | < 5 s | Projection round trip, camera limits, antimeridian wrapping | **keep** → `map/camera.test.ts` | Live; rename only |  |
| `m15-map-hit-test` | 105 | 7 | < 5 s | Province picking, world copies, pick radius | **keep** → `map/hit-test.test.ts` | Live; rename only |  |
| `m15-map-labels` | 259 | 20 | < 5 s | Label fitting, clipping, placement determinism | **keep** → `map/labels.test.ts` | Live; rename only |  |
| `m15-map-style` | 312 | 17 | < 5 s | Political palette, modes, multiscale style | **keep** → `map/style.test.ts` | Live; rename only |  |
| `m16-map-label-ink` | 86 | 4 | < 5 s | Label ink follows fill; token rule shared by renderers | **merge** → `map/labels.test.ts` | Four tests on the same label module |  |

#### `ui-shell/`

| File | Lines | Tests | Time | Protects | Action → target | Reason | Flag |
|---|---:|---:|---:|---|---|---|---|
| `m16-design-tokens` | 378 | 27 | < 5 s | One token module, eras, typography, 44-pt controls, layout | **keep** → `ui-shell/design-tokens.test.ts` | Live (AGENTS §2); rename only |  |
| `m16-mobile-shell` | 676 | 45 | 17.0 s | Navigation, lenses, dispatches, touch, bridge, atlas, landscape | **keep** → `ui-shell/mobile-shell.test.ts` | Live (AGENTS §2); rename only |  |
| `e1-ui-wiring` | 141 | 8 | < 5 s | Screens wired to snapshot selectors and the shared action path | **merge** → `ui-shell/app-wiring.test.ts` | Four small source-inspection files of the same kind |  |
| `m7-app-lifecycle` | 106 | 8 | < 5 s | Startup, autosave wiring, lifecycle, error fallback | **merge** → `ui-shell/app-wiring.test.ts` | See e1-ui-wiring |  |
| `m11d-provider-lifecycle` | 59 | 4 | < 5 s | Worker restart epoch, save envelope ref, storage errors | **merge** → `ui-shell/app-wiring.test.ts` | See e1-ui-wiring |  |
| `m11d-slider-accessibility` | 39 | 2 | < 5 s | Slider/toggle accessibility props | **merge** → `ui-shell/app-wiring.test.ts` | See e1-ui-wiring |  |
| `save-library` | 243 | 12 | < 5 s | Save slots, recovery copies, atomic index, legacy adoption | **keep** → `ui-shell/save-library.test.ts` | Live; rename only |  |
| `m7-app-save-path` | 104 | 2 | < 5 s | App storage adapter round trip through the worker | **keep** → `ui-shell/save-storage-adapter.test.ts` | Live; rename only |  |

#### `worker/`

| File | Lines | Tests | Time | Protects | Action → target | Reason | Flag |
|---|---:|---:|---:|---|---|---|---|
| `m7-worker` | 524 | 17 | 5.7 s | Bounded frozen snapshot, never the live world; pacing; actions; save/load | **keep** → `worker/host.test.ts` | Snapshot/command contract; rename only |  |
| `m7-supervisor` | 610 | 9 | < 5 s | Reply correlation, timeouts, snapshot validation | **keep** → `worker/supervisor.test.ts` | Snapshot/command contract; rename only |  |
| `m7-autosave` | 109 | 3 | < 5 s | Autosave debounce and safety | **keep** → `worker/autosave.test.ts` | Live; rename only |  |
| `m7-save-store` | 140 | 6 | < 5 s | Replace-safe storage, corrupt-primary fallback | **keep** → `worker/save-store.test.ts` | Live; rename only |  |
| `menu-save-preview` | 161 | 5 | < 5 s | PREVIEW_SAVE equals LOAD without adopting it | **keep** → `worker/save-preview.test.ts` | Live; rename only |  |
| `m9-worker` | 185 | 3 | < 5 s | Technology/education snapshot sections and actions | **simplify** → `worker/protocol.test.ts` | Absorbs the protocol-client rejections from m11-world and m9-technology |  |
| `e5-worker` | 141 | 3 | < 5 s | Training/health snapshot and protocol validation | **merge** → `worker/protocol.test.ts` | Three tests of the same protocol boundary |  |
| `m11d-runtime-contract` | 71 | 2 | 149.6 s | Every selectable country gives an app-valid snapshot; largest labour pool fits | **merge** → `worker/protocol.test.ts` | Two tests of the same protocol boundary. Its host-path campaign check resembles m11-world's direct one but uses a different path; both kept |  |
| `e1-economic-clarity` | 256 | 6 | 5.8 s | Snapshot reports, fiscal preview, explanations, bounded history | **keep** → `worker/economic-reporting.test.ts` | Absorbs e1-fiscal-reporting |  |
| `e1-fiscal-reporting` | 144 | 1 | < 5 s | Snapshots carry every fiscal category | **merge** → `worker/economic-reporting.test.ts` | One test on the same snapshot reports |  |
| `d139-new-game-reuse` | 69 | 3 | 74.3 s | First campaign reuses the startup world only when identical | **keep** → `worker/new-game-reuse.test.ts` | Live; rename only |  |


### 3.3 The merges in detail

Rule for every merge: each `expect` that runs today runs afterwards, against the same
inputs. A merged test may run inside a loop over a table (one row per former file); it
may not lose a row. Phase 2 checks this mechanically (§7).

1. **Province catalogue (M12a–e → 2 files, ≈ 6,465 → ≈ 3,800 lines).** The following
   checks are written once per continent today: stable unique ids; disjointness from the
   earlier bundles; required 1900 owners present; every province has an owner,
   administrative metadata and provenance; geometry decodes to finite SVG paths; borders
   are deduplicated open polylines; edges become national only across owners; hit
   testing is zoom-independent; the coverage audit is complete; successor-border splits
   share edges; every modern land border has an edge; the 1900 world has one ownership
   record per province; transfers keep ids and geometry; occupation, claims and special
   status stay separate from ownership; partial-ownership worlds round-trip; identical
   sequences give identical hashes; different orders give different histories; the
   scenario builds with the combined bundle; the combined catalogue has unique ids and one
   border list (written four times). They become one table-driven `describe.each` over the
   five bundles in `map/provinces-catalogue.test.ts`; each continent's required owners,
   subdivisions and id ranges stay as data rows. The continent-specific history
   (Austria-Hungary's dissolution, the Polish Corridor, 1918–20 mandates, Manchukuo,
   decolonisation waves, Tanzania, Rhodesia, Newfoundland, the Micronesian compacts …,
   about 60 tests) moves unchanged to `map/provinces-history.test.ts`, one `describe` per
   continent. The M12e global land-coverage audit and rendering contracts stay as their
   own `describe` in the catalogue file. The "an M12a-era / M12b-era … save still loads"
   tests are, in fact, *partial-ownership world round trips* (they filter today's world
   to the earlier continents, not old saves); they keep that meaning under an accurate
   name.
2. **Save compatibility (13 places → 1 table).** `m2-serialization` (schema 2, sim 0.2),
   `m3a-serialization` (older schema/sim/data), `m4a2-serialization` (6, 0.6.0),
   `m4b-period-close` (7, 0.7.0), `m4c-fiscal` (8, 0.8.0), `m5-world` (9–12, 0.9.0),
   `m9-technology` (old schema/sim/data), `e6a`, `e6b`, `m10` (previous schema),
   `p2-provinces` (27, and schema ≥ 28), `m13-branding` (compressed Century-era save),
   `m14-rusd` (a save in the pre-M14 unit vocabulary) each mutate a fresh save's version fields and expect a
   rejection. `serialization/save-compatibility.test.ts` holds one row per case with the
   same world builder, the same mutation and the same message regex. Each source keeps
   whatever else its test asserted (for example `m4b`'s staged-save rejection and
   `m13`/`m14`'s readable legacy metadata).
3. **SVG fallback map (6 files → 1).** `m11c1-map-viewport`, `m11c1-rendering`,
   `m11d-map-wheel`, `m11d-map-selection`, `m11d-map-legibility`, `m11e-worldmap-geometry`
   all test `WorldMap.tsx`, `mapViewport.ts` and `worldMapGeometry.ts` (still the fallback
   renderer, used by `MapStage`, `CountryScreen`, `CountrySelectionScreen` and `GameShell`).
   The two "labels scale with the country" tests (legibility, selection) overlap and are
   joined into one test that keeps both sets of assertions.
4. **App wiring (4 files → 1).** `e1-ui-wiring`, `m7-app-lifecycle`,
   `m11d-provider-lifecycle`, `m11d-slider-accessibility` are all source-inspection checks
   of app files; one file, one `describe` each.
5. **Military (5 files → 2).** `m10-warfare` with `audit-006` and `audit-014` →
   `government/military.test.ts`; `audit-010-015` and `audit-020-022` (validation of
   crafted or out-of-period military state) → `government/military-validation.test.ts`.
6. **Protocol (4 sources → 1).** `m9-worker`, `e5-worker`, `m11d-runtime-contract`, and
   the protocol-client rejections in `m11-world` and `m9-technology` →
   `worker/protocol.test.ts`. `m11-world`'s "every selectable country can initialize a
   campaign" (direct `createEconomyWorld`, seed 3) and `m11d-runtime-contract`'s "every
   selectable country produces an app-valid campaign snapshot" (through the host's
   `CREATE_GAME`) look alike but build the campaign on different paths, so **both stay**,
   in `data/world-1900` and `worker/protocol` respectively.
7. **Small same-subject pairs.** `no-mana` → `architecture/isolation` (both `Math.random`
   scans kept: the raw-text scan of sim/data/app/bench and the comment-stripped scan of
   every package); `m13-branding` + `m14-rusd` → `architecture/naming-audits` (the pinned
   1900 world hash moves to `determinism/replay` with the other known answers);
   `m2-death-allocation` + `m2-death-total`; `m5b-debt` + `m5b-debt-bounded`;
   `e1-economic-clarity` + `e1-fiscal-reporting`; `history-loader-validation` +
   `data-version-consistency` + `m5-history`; `m15-map-labels` + `m16-map-label-ink`;
   `m11b-coverage`'s monogram test into `m11-flags` (its extra tag and flag-kind
   assertions move with it).
8. **Drift test (simplify).** `worker-bundle-drift` builds the 12 MB worker bundle four
   times (336 s in the baseline). `--check` already regenerates and compares with the
   committed file; one further `--output` generation compared with the committed file
   proves the "two generations are byte-identical" claim with one build fewer. The
   stale-copy test is unchanged.

### 3.4 Tests you marked as restated or pending revision

Moved and renamed only; no assertion, tolerance or fixture value changes:

| Test | Decision | New path |
|---|---|---|
| `p4-demography` | D-142 (and D-144: the fertility ceiling has **no test yet**) | `population/demography-causes.test.ts` |
| `m2-calibration`, `m2-demography`, `m2-wealth` (P4 cases) | D-142 | `population/…` |
| `p5-land` | D-143 | `economy/land-resources.test.ts` |
| `m5-feasibility` | D-142, D-143 (99.5 % → 99 %) | `economy/scenario-feasibility.test.ts` |
| `batch5-validation` | D-143 | `determinism/tick-validation.test.ts` |
| `e2-fiscal-management`, `m6-ai`, `m4b-save-compaction` | D-143 (one-month window) | `money/…`, `government/…` |
| `p2b-money`, `batch6-integration` | D-143 (wages in kind) | `money/…`, `economy/…` |

Missing coverage to flag, not to fill here: **D-144's natural-fertility ceiling** (the
saturation and its exact inverse refit) has no test. It belongs in
`population/demography-causes.test.ts` once you have revised the P4 tests.

### 3.5 Run time

The suite runs in band (`--runInBand`), so file time adds up directly. The baseline's
slowest files are listed in §2. One proposed change reduces it without dropping an
assertion: the drift test (one bundle build fewer, roughly a quarter of its time). The province
merge loads each bundle once per file instead of once per continent file, which should
also help; I will report measured before/after times in Phase 2 rather than estimate them.

## 4. Documents

### 4.1 Classification

Status: **current** (describes the code or plan as it is), **historical** (a record under
AGENTS.md §1: GDD versions, change reports, completion reports, milestone records, the
decision register), **superseded** (replaced by the named file), **obsolete** (describes
something that no longer exists and is not a record anyone is required to keep).

"Referenced by" lists files outside Markdown (code, scripts, tests, data) that name the
document; links from other Markdown files are fixed in the same commit as any move.

#### Root

| Document(s) | Files / lines | Status | Referenced by (non-Markdown) | Proposal |
|---|---:|---|---|---|
| `AGENTS.md` | 1 / 124 | current | branding and monetary audits, `m16-mobile-shell` test | keep |
| `Fabric_of_Nations_GDD.md` | 1 / 6,961 | current (authoritative) | both audits, `m13`/`m14` tests | keep; two path fixes (§4.3) |
| `DECISIONS.md` | 1 / 8,166 | historical record, still appended | both audits, `m11c-geography` test, generator scripts (m12, m12b–d), comments in sim and generated files | keep in place; add an index (§4.4) and D-145; fix paths of moved files only |
| `README.md` | 1 / 3,470 | mixed: ~250 lines current, ~3,200 lines are M0–E6b milestone write-ups, Node benchmark logs and post-M7 batch reports | both audits, `m13`/`m14` tests (title line, "RUSD — Reference US Dollars", "formerly **SUSD", "not a national currency, legal tender") | **split**: keep a current README (~300 lines: overview, name and unit notes, workspace, commands, architecture rules, where things are documented, development workflow); move the milestone sections verbatim to `docs/archive/README_HISTORY.md` |
| `Century_GDD_v2.md`, `Century_GDD_v2.1.md` … `v2.17.md` | 18 / 79,548 | historical; superseded by `Fabric_of_Nations_GDD.md` (v2.18+) | `Century_GDD_v2` pattern allowed by both audits; no code reads them | **move** to `docs/archive/gdd/` (optional, needs your approval per group: delete v2–v2.16, which git history keeps, and keep only v2.17, the last edition under the former name) |
| `GDD_V2.2_CHANGE_REPORT.md` … `GDD_V2.19_CHANGE_REPORT.md` | 18 / 3,075 | historical | allowed by name pattern in both audits | **move** to `docs/archive/gdd-change-reports/` |
| `M12A`…`M12E`, `M15_MAP`, `M16_LIVING_ATLAS`, `P1`, `P2`, `P2B`, `P3`, `P4`, `P5`, `PERF` `_COMPLETION_REPORT.md`, `PERF_STAGE2_REPORT.md` | 15 / 3,908 | historical | allowed by name pattern in both audits; `P5`/`P4` are still the reports under review for the current branch | **move** to `docs/archive/completion-reports/` (P4 and P5 too, or keep those two at the root until you accept P4/P5 — see §6) |
| `*.log` at the root (≈200 files) and `packages/tests/m5b-test.log` | not tracked | build/test logs, git-ignored (`*.log`) | none | not part of the repository; no commit can change them. You may delete them locally (`git clean -nX` lists them first). |

#### `docs/`

| Document | Lines | Status | Referenced by (non-Markdown) | Proposal |
|---|---:|---|---|---|
| `randomness.md` | 95 | current (RNG specification) | `sim/src/rng.ts`, `hash.ts`, `index.ts`, `economy/fiscal.ts`, `economy/military.ts`, `rng.test.ts` | keep |
| `MAP_DATA.md` | 236 | current | `app/src/design/tokens.ts`, `app/src/map/mapModes.ts`, `m11c-geography` test | keep |
| `MAP_RENDERING.md` | 248 | current | — (README, GDD, app README) | keep |
| `HISTORICAL_MAP_PROVENANCE.md` | 502 | current (generated by `scripts/m11/generate-provenance-doc.mjs`) | 3 scripts, `m11c-geography` test | keep |
| `FLAG_PROVENANCE.md` | 985 | current (generated by `scripts/m11/build-flags.mjs`) | `App.tsx`, generated `flagProvenance.ts`, `flags_1900.json`, `m11-flags` test | keep. Its title line shows mojibake (`â€”`): a generator encoding issue, not hand-editable — listed in §6 |
| `FONT_PROVENANCE.md` | 43 | current | `App.tsx`, `design/tokens.ts`, `m16-design-tokens` test | keep |
| `1900_CATALOG_COVERAGE.md` | 337 | current | `m11b-coverage`, `m11c-geography` tests | keep |
| `HISTORICAL_DATA_PROVENANCE.md` | 160 | current in purpose, stale in numbers ("133 regions, 66 selectable states": the region layer was removed in P2) | — | keep; flag for a content refresh (§6) |
| `PROVINCE_GEOGRAPHY.md` | 124 | current (P2 data) | `scripts/p2/repair-provinces.mjs`, `scripts/p5/build-p5-world.mjs`, `p5/build_report.json` | keep |
| `EUROPE_` / `ASIA_` / `AFRICA_` / `AMERICAS_` / `OCEANIA_PROVINCIALIZATION.md` | 4,588 | current (generated from the committed bundles by `scripts/m12*/generate-*-doc.mjs`) | their generator scripts, `audit-successors.mjs` | keep (generated; moving them means changing five generators for no gain) |
| `P5_LAND_AND_RESOURCES_PROVENANCE.md` | 78 | current | — | keep |
| `PROSPERITY_PROGRAM.md` | 380 | current plan; status line stale (stops at P4) | `p3`, `p4`, `p5` tests (cite it in comments) | keep; status line refresh needs your wording (§6) |
| `COMPANIES_AND_CAPITAL_MARKETS_PROPOSAL.md` | 144 | current (future stages P9–P13, D-123) | — | keep |
| `P5_GOODS_CATALOGUE_PROPOSAL.md` | 192 | current (approved catalogue, D-143) | — | keep |
| `P4_WPP_COMPARISON.md` | 75 | current validation report (generated by `scripts/p4/wpp-comparison.mjs`) | the script, `data/demography.json` | keep |
| `P5_BEFORE_AFTER.md` | 80 | current comparison for the P5 review (generated by `scripts/p5/before-after.mjs`) | the script | keep until P5 is accepted, then archive |
| `M11_SLIDER_INVENTORY.md` | 91 | probably stale (M11 screens; M16 rebuilt the shell) — cited by the current GDD as the slider inventory | — | keep; flag (§6) |
| `P2B_CALIBRATION_PLAN.md` | 237 | historical (decided and implemented, D-135) | — | move to `docs/archive/milestones/` |
| `M8_`, `M9_`, `E5_`, `E6A_`, `E6B_`, `M11_REQUIREMENTS_MAP.md` | 703 | historical (implementation planning records) | allowed by pattern in the monetary audit | move to `docs/archive/milestones/` |
| `M11_DESIGN.md` | 119 | historical; superseded by the GDD §17I, `MAP_DATA.md` and `DECISIONS.md` D-086–D-100 | — | move to `docs/archive/milestones/` |
| `M11D_PLAYTEST_REPORT.md`, `M11E_RUNTIME_ERRORS_REPORT.md` | 741 | historical | named in both audits' allowlists | move to `docs/archive/milestones/` |
| `M13_REBRANDING_REPORT.md`, `M14_RUSD_RENAMING_REPORT.md` | 617 | historical | both audits (allowlists, and an `existsSync` check that the report exists) | move to `docs/archive/milestones/`; update the two audits' paths |
| `PLAYTEST_GUIDE.md` | 107 | obsolete (M11 shell: "top bar", tabs, 66 states; M16 replaced all of it) | — | move to `docs/archive/milestones/` (or delete with your approval) |
| `docs/images/` (323 PNGs, 86 MB) | — | evidence for completion reports; `m11c/` and `m11c1/` are asserted by `m11c-geography` and `m11c1-rendering` | two tests, reports | keep in place (moving binaries only adds churn; see §6) |
| `docs/p2b/`, `docs/p4/`, `docs/p5/`, `docs/perf/` (JSON/text run outputs, `check-trace.sh`) | — | evidence for reports and DECISIONS (D-137); `p4/century-run.json` is read by `scripts/p4/wpp-comparison.mjs`; `perf/check-trace.sh` is a working script | DECISIONS, reports, scripts | keep in place |

### 4.2 Resulting layout

```
AGENTS.md  DECISIONS.md  Fabric_of_Nations_GDD.md  README.md          (4 root documents)
docs/                    current references, provenance, plans (21 documents)
docs/archive/README.md   one-page index of everything below and why it is kept
docs/archive/gdd/                        18 historical GDD editions (v2–v2.17, former name)
docs/archive/gdd-change-reports/         18 change reports (v2.2–v2.19)
docs/archive/completion-reports/         15 milestone completion reports
docs/archive/milestones/                 13 requirements maps, design, QA and rename records
docs/archive/README_HISTORY.md           the M0–E6b sections moved out of README.md
```

Nothing in `docs/archive/` is edited except relative links that would otherwise break
(those files still name the former game; the audits already allow that for historical
records and will be given the one rule "everything under `docs/archive/` is historical").

### 4.3 References to fix when moving

- `scripts/m13/branding-audit.mjs`, `scripts/m14/monetary-terminology-audit.mjs`: replace
  the per-file historical allowlist with `docs/archive/**` plus `DECISIONS.md`; point the
  `existsSync` checks at the moved M13/M14 reports. The `m13`/`m14` tests run both audits,
  so a wrong rule fails the suite.
- `README.md`: links to the M13/M14 reports, GDD versions and change reports.
- `DECISIONS.md`: 6 mentions of moved files in D-135 (line 7332), D-137 (7454, 7557),
  D-139 (7697, 7705) and D-142 (7980), all bare file names in backticks, not links. Your
  brief says to fix them: only the path text changes (e.g. `PERF_COMPLETION_REPORT.md` →
  `docs/archive/completion-reports/PERF_COMPLETION_REPORT.md`); no entry is removed,
  renumbered or reworded. D-120 §9 (line 6267) describes the old file name as history and
  stays as written.
- `Fabric_of_Nations_GDD.md` lines 5442 and 5638 name `GDD_V2.12/13_CHANGE_REPORT.md`.
  This is a path-only edit of the GDD; I will make it only with your approval (or leave
  the GDD untouched and accept two dangling file names).
- `docs/PROSPERITY_PROGRAM.md`, `P2B_CALIBRATION_PLAN.md`, `COMPANIES_…`, the reports
  themselves: relative links between moved files.
- Afterwards a link check (`git grep` for every moved basename outside `docs/archive/`)
  must come back empty, and both audits must pass.

### 4.4 DECISIONS.md index

Proposal: a generated index table at the top of `DECISIONS.md` (D-number, title, the
milestone it belongs to, and "amended by / superseded by" where an entry already says so),
plus a `scripts/docs/decisions-index.mjs --check` so the index cannot drift. The 144
entries stay where they are, byte for byte. The opening paragraph ("Scope of this
session: M0 … M4a-2") is itself historical; I would leave it and add one sentence above the
index saying the register now runs to D-145. Please say whether you want the index
generated (with a `--check` test) or written once by hand.

## 5. Benchmarks (`packages/bench`)

Only duplicates are in scope. `pnpm bench` (`bench.ts` with the m5/m6/m7/m9/e5/e6a/e6b/m10
cases it imports), `bench:campaign` (`m6Campaign.ts`) and the performance-stage tools
(`perf*.ts`) are each distinct and stay. I did not run any benchmark.

| Entry point | Duplicates | Proposal |
|---|---|---|
| `p1WorldBench.ts` (`pnpm run bench:world`) | Runs the 1900 world in staged and phase mode and checks the hashes agree. `perfBench.ts` does the same staged-mode cross-check on the same world (plus everything else), and `determinism/rollback` (`p1-rollback`) asserts phase = staged in the test suite | **delete** the file and the `bench:world` root script; mentioned only in the archived P1/P2b reports |
| `perfPhases.ts` | Per-phase means; `perfBench` has the same per-phase stopwatch (its header says the acceptance figures come from `perfBench`) | keep (a quick probe on a different day window); listed in §6 |
| `perfSave.ts`, `p2bPerfProfile.ts` | Both time encode/serialize steps; `p2bPerfProfile` also splits hashing and cloning and counts objects | keep both; listed in §6 |

## 6. Things I am unsure about (your call)

1. **Deleting old GDD editions.** Archiving keeps all 18. Deleting v2–v2.16 (≈ 67,000
   lines) would be the single largest reduction; git history keeps them. Needs your
   explicit approval for that group; my default is archive only.
2. **P4 and P5 completion reports and `P5_BEFORE_AFTER.md`** are the reports for work
   still under your review. Archive now, or leave at the root until you accept P4/P5?
3. **The GDD path fix** (lines 5442, 5638) — approve the two-line, path-only GDD edit, or
   leave the GDD untouched.
4. **README split.** The ≈ 3,200 archived lines include "Known limitations" and the "Data
   and calibration" and "Determinism and serialization" sections. Parts of those may still
   be true; I would move them verbatim and not rewrite them, and the current README would
   point to the GDD, `docs/randomness.md` and `DECISIONS.md` instead. Say if you want any
   section kept in the current README.
5. **Stale current documents** I would not rewrite without your wording:
   `HISTORICAL_DATA_PROVENANCE.md` (133 regions / 66 states), `M11_SLIDER_INVENTORY.md`
   (M11 screens; the GDD cites it as current), the `PROSPERITY_PROGRAM.md` status line
   (stops at P4), and `FLAG_PROVENANCE.md`'s mojibake title (from `build-flags.mjs`; fixing
   it is a generator change, out of scope here).
6. **`docs/images/` (86 MB)** stays in place: two tests assert the `m11c`/`m11c1` smoke
   images exist. Those two "the screenshot exists and is a PNG" tests guard documentation
   evidence, not behaviour; I keep them (they are cheap), but you could drop them if the
   images are ever archived.
7. **Folder names** `data/`, `government/`, `worker/` (vs `contract/`), and whether to
   rename fixtures by subject.
8. **DECISIONS index:** generated with a `--check` (adds one small script and one test)
   or written once by hand.
9. **`perfPhases.ts`, `perfSave.ts`, `p2bPerfProfile.ts`** overlap `perfBench.ts` in part.
   They are Node diagnostics you may still use; I leave them unless you say otherwise.

## 7. Risks and how Phase 2 controls them

| Risk | Control |
|---|---|
| A merge silently drops an assertion | For each merge commit, a mapping from every former test title to the test (and table row) that now holds its assertions, checked by a throwaway script over Jest's `--json` output before and after (run from the scratchpad, not committed). Any former title without a home fails the step. The commit message states the old and new Jest test counts and explains the difference (table-driven tests add rows; exact duplicates such as the four "combined catalogue" copies collapse to one). |
| Moving files breaks paths built from `import.meta.url` | Every moved test is run; `pnpm typecheck` covers imports. |
| The audits stop recognising archived files and fail, or start allowing too much | The `m13`/`m14` tests run both audits; the new rule is "under `docs/archive/`", nothing broader. |
| A broken link to a moved document | A `git grep` for every moved basename outside `docs/archive/` after the docs commits. |
| Restated tests (D-142–D-144) change by accident | Those files are moved with `git mv` and only their import lines change; the diff of each is reviewed for anything else. |
| Long suite (≈ 1 h+ in band) slows each step | Each commit runs the affected files first, then the full `pnpm test` and `pnpm typecheck` once per commit as you asked. |
| History of moved files is harder to follow | `git mv` for every move and rename, in commits that do nothing else, so `git log --follow` works. |

## 8. Phase 2 plan (after approval)

Small commits on `prosperity/p5-land`, not pushed, each followed by `pnpm test` and
`pnpm typecheck` with the result compared to §2:

1. Tests — move and rename into subsystem folders (`git mv` + import paths only).
2. Tests — fixtures renamed by subject (if approved).
3. Tests — save-compatibility table.
4. Tests — province catalogue and history merge.
5. Tests — SVG fallback, app wiring, military, protocol and the small pairs.
6. Tests — drift-test simplification.
7. Bench — remove `p1WorldBench.ts` and `bench:world` (if approved).
8. Docs — create `docs/archive/` and move historical files; update both audits.
9. Docs — README split; link fixes in docs, DECISIONS paths (and the GDD, if approved).
10. Docs — DECISIONS index and the D-145 entry recording the cleanup.

Then the completion report AGENTS.md requires.
