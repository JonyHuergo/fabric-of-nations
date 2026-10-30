# Century decision register

This file records material implementation decisions, GDD/`AGENTS.md` conflicts,
and provisional assumptions made in M0/M1/M2/M2.1/M3/M4a-1/M4a-2. It follows GDD §20 and
`AGENTS.md` §1.

Scope of this session: **M0 project foundation, M1 simulation core, M2/M2.1
population core, M3a economy definitions/state/serialization, M3b deterministic
employment assignment, M3c production/inventory movement, M3d deterministic
two-pass market clearing with bounded prices, M3e cash settlement/wages/upkeep/
retained profit, M3f integrated daily economic tick, M4a-1 category-aware
double-entry accounts with opening balances and recognition legs, and M4a-2
country/currency identity, monetary arrangements, and SUSD-relative valuation**.
Taxes, period closing, distributions, debt/credit, dynamic FX, monetary policy,
inflation, politics, technology, diplomacy, warfare, AI, worker protocol, and UI
behavior remain out of scope.

## Conflicts and ambiguities

### D-001 — pnpm replaces the GDD's `npm test` wording

- **Issue:** GDD §17 M0 says `npm test`, `npm run bench`, and an npm-oriented CI
  path. `AGENTS.md` §4 says the package manager is `pnpm` and "Never use `npm` or
  `yarn` for project operations." The direct task also requires a working pnpm
  workspace.
- **Resolution:** pnpm is authoritative. Root scripts are `pnpm test`,
  `pnpm run typecheck`, and `pnpm run bench`; the CI workflow installs with
  `pnpm install --frozen-lockfile`. The GDD's npm wording is treated as an
  outdated command example, not a package-manager requirement.
- **Consequence:** Running plain `npm` commands is unsupported and may resolve a
  different dependency graph.
- **GDD v2.1 status:** GDD v2.1 now documents the pnpm workflow, so this is no
  longer a GDD/`AGENTS.md` conflict. The entry is retained as history.

### D-002 — Jest is the test runner

- **Issue:** The GDD requires a test suite and the assignment permits "Jest or
  the testing framework specified by the GDD", but GDD v2.0 names no framework.
- **Resolution:** Use Jest 29 with `ts-jest` in ESM mode and
  `--experimental-vm-modules`. Tests import the public `@century/sim` API; the
  Jest module mapper points it at `packages/sim/src/index.ts` so tests do not
  require a prior build.
- **Consequence:** Node emits an experimental VM-modules warning. That warning
  does not affect results. If a future Node/Jest version removes support, the
  harness will need migration.
- **GDD v2.1 status:** retained as the historical framework choice; GDD v2.1
  does not require a different test runner.

### D-003 — `Day` and `DayIndex` are aliases

- **Issue:** The assignment names `Day`; GDD §5.2 names `DayIndex`.
- **Resolution:** Both are exported aliases of `number`, matching the GDD's plain
  numeric primitive. No branded types were introduced because the state must
  serialize as ordinary numbers and branding would add casts at every boundary
  without improving determinism.
- **Consequence:** `Id`, `Seed`, and `Day` are not nominally distinct; validation
  functions enforce ranges at boundaries.

### D-004 — Day-index semantics and terminal boundary

- **Resolution:** Day index `0` = 1900-01-01; `World.dayIndex` is always the next
  civil day to process. The campaign processes `0..36,523` (36,524 days); index
  `36,524` is the terminal 2000-01-01 boundary. There are 36,525 valid indices
  including the terminal boundary, but only 36,524 daily transitions.
- **Consequence:** `tick` at index 36,524 returns `advanced: false` and mutates
  nothing. `isValidDayIndex` includes the terminal index;
  `isProcessableDayIndex` excludes it. Tests assert all three concepts
  separately.
- `isValidDate` accepts civil dates from 1900-01-01 through 2000-01-01 inclusive
  and rejects 2000-01-02 and later. This follows from the boundary, not from an
  independent civil-calendar limit.

### D-005 — Authoritative M1 world contains no per-day diagnostic ring

- **Issue:** An earlier draft added a fixed 64-entry `Int32Array` ring of
  recently processed day indices to `World.diagnostics`, primarily to exercise
  typed-array serialization on real state. GDD §17 requires verified typed-array
  round trips, but a no-op M1 world otherwise has no naturally dense numeric
  state.
- **Audit finding:** The ring was per-day history retained in authoritative
  state. It changed the world hash, was not needed for no-op tick behavior or
  save integrity, and was not a chart/UI requirement. Keeping it would make a
  diagnostic aid part of the authoritative schema and weaken the milestone's
  small-state guarantee.
- **Resolution:** Remove the ring and cursor from `World` and from the save
  payload. Diagnostics retain only the scalar counters and bounded warning list
  from the GDD sketch. Keep the explicit tagged typed-array codec in
  `serialization.ts` and test it with an isolated JSON fixture, so future dense
  state has a validated encoding boundary without storing fake data now.
- **Consequence:** M1 authoritative state contains no typed array and no
  per-day history. The century-run regression hash changed. If a future milestone
  adds dense state, it must use real authoritative arrays and will exercise the
  same codec in the save path.
- **Compatibility:** This cleanup happens before any baseline commit or released
  save. The audited shape is the baseline for schema version 1; future shape
  changes must add migration or bump the schema/simulation version. No pre-audit
  working-tree save is a supported input.

### D-006 — Keyed randomness algorithm

- **Resolution:** Implement the GDD tuple `(seed, day, entityId, purpose,
  drawIndex)` as a pure function. The purpose is represented by two independent
  FNV-1a-32 lanes plus its length; those values and the remaining components are
  combined in a documented order with a boost-style mix, then finalized with
  MurmurHash3 `fmix32`. Unit floats are the unsigned result divided by 2^32. Full
  specification and known-answer vectors are in
  [`docs/randomness.md`](./docs/randomness.md).
- **Audit finding:** A single 32-bit purpose hash admitted a practical collision
  between two valid purpose strings, `poupguw1a` and `pblz9456g`. The second lane
  plus purpose length separates that demonstrated collision; a regression test
  covers it.
- **Rationale:** Stateless keyed draws make unrelated entities independent of
  iteration order and of newly added draws. This satisfies GDD §16.1 and
  `AGENTS.md` §2.
- **Status:** Algorithm is binding for determinism but provisional for gameplay
  calibration. Changing it invalidates reproducibility and requires a
  simulation-version decision.
- **Compatibility:** This audit revision is pre-baseline: no committed or released
  save, scenario, or calibration used the single-lane vectors. Known-answer tests
  and documentation were updated together.

### D-007 — Save envelope duplicates inspectable metadata and uses a non-cryptographic checksum

- **Resolution:** The canonical save is a versioned JSON envelope containing
  format version, schema version, simulation version, content version, scenario,
  day index, seed, checksum, and the full encoded payload. Envelope metadata is
  duplicated in the payload and equality is validated on load.
- **Checksum:** FNV-1a-32 over canonical JSON of the payload, prefixed
  `fnv1a32:`. It detects accidental corruption and simple edits; it is not a
  security signature and must not be used for trust decisions.
- **Typed arrays:** Tagged `{ encoding: "typed-array-v1", kind, length, values }`
  and reconstructed as the named typed-array class. `-0` is normalized to `0`;
  Float32 values must be exactly representable. BigInt typed arrays are not
  supported in M1. M2 now uses real `Uint32Array` cohort counts and `Uint8Array`
  aging carries through this codec.
- **Consequence:** Unknown or mismatched versions are rejected with
  `SaveFormatError`; no migration exists yet. The payload is canonical JSON with
  sorted keys, so identical state serializes identically.

### D-008 — M1/M2 tick has no player/AI action list

- **Issue:** GDD §4.1 says the simulation receives explicit player/AI actions, but
  no action types exist in M1/M2.
- **Resolution:** `tick(world, context?)` takes only the world plus an optional
  M2 population context. Adding empty or `string` action unions would create a
  speculative contract. Player/AI actions arrive with the subsystem and validation
  rules that make them meaningful (M4/M5 onward).
- **Consequence:** The signature will gain an action contract later; that change
  is scheduled, not accidental. No player/AI behavior exists in M1/M2.

### D-009 — Benchmark thresholds are Node regression guards, not mobile claims

- **Resolution:** `packages/bench` reports M1 no-op, M2 world-aggregate, and M2
  stress cases at 200, 1,000, 3,000, and 6,000 population blocks with
  p50/p95/p99, hashes, seed, data version, and environment. Provisional Node p95
  thresholds are 1 ms for M1 and the M2 aggregate, and 5 ms for the 200-block
  stress case. The 1,000/3,000/6,000-block results are diagnostic scale probes,
  not acceptance thresholds. The GDD §14.4 mobile target of 8 ms is printed as
  **NOT EVALUATED**.
- **Rationale:** GDD §14.4 explicitly states a Node benchmark is not proof of
  mobile performance. Larger block counts expose allocation and scaling costs.
- **Consequence:** CI catches large Node regressions at the reference aggregate
  and 200-block fixture, but mobile performance remains unverified until M7.

### D-010 — Placeholder packages and deferred `sim-worker`

- **Resolution:** Create `@century/data` and `@century/app` packages. M0/M1 left
  data as a boundary-only placeholder; M2 now populates it with JSON definitions
  and a Node-side validated loader. The app remains a UI placeholder with no
  simulation import. Do not create `packages/sim-worker` yet. GDD §14.1 calls it
  "recommended if needed"; M0's required layout lists `sim`, `data`, `app`,
  `bench`, and `tests`. The worker proof of concept belongs to M7.
- **Consequence:** There is no platform-specific worker code to leak into
  `packages/sim`. The app package must not import the simulation implementation.
  The data package is Node-side static-content infrastructure, not simulation
  logic.

### D-011 — CI-style lint is a dependency-free boundary script

- **Resolution:** `pnpm run lint` runs
  [`scripts/check-boundaries.mjs`](./scripts/check-boundaries.mjs), which strips
  comments and strings, then checks for ambient RNG, forbidden host/browser/Node
  APIs in `sim`, explicit `any` in `sim`, non-relative simulation imports, and
  ES2022-only/type-empty `sim` configuration. Jest also contains architecture and
  No-Mana guard tests.
- **Rationale:** The GDD says lint "if configured" and forbids adding unnecessary
  dependencies. A small purpose-built checker covers the binding architectural
  rules without an ESLint configuration that would mostly duplicate TypeScript.
- **Consequence:** This is not a general style linter. TypeScript strict mode and
  Jest carry the rest of the enforcement.

### D-012 — Content version is authoritative in the JSON data package

- **Resolution:** `packages/data` exports `DATA_PACKAGE_VERSION =
  "m2.1-population-v1"` and `@century/sim` exports
  `DEFAULT_DATA_VERSION = "m2.1-population-v1"`. The data loader rejects a
  scenario whose data version does not match, and definitions carry the same
  version.
- **Revision history:** M2 used `m2-population-v2`; M2.1's single-year age/sex
  state, WPP schedules, and validation scenarios are a new content/schema
  revision. Older M2 saves are rejected rather than silently reinterpreted.
- **Consequence:** M5 must establish the full generated data pipeline and keep
  the two declarations aligned. A mismatch fails loading with an actionable
  error.

### D-013 — No automatic save migrations; M2.1 rejects older saves

- **Resolution:** The save envelope is versioned, but incompatible format,
  schema, simulation, or content versions are rejected with a `SaveFormatError`.
  M2.1 uses world schema `3` and simulation version `0.3.0`; M1 and M2 saves are
  rejected rather than migrated.
- **Rationale:** GDD §5.6 permits migration or rejection. The age/sex state
  changed from five-year cohorts to single-year sex arrays, so silently
  reinterpreting old typed arrays would fabricate state.
- **Consequence:** The next schema change must add a tested migration or bump the
  version with an explicit compatibility decision.

### D-014 — Typecheck resolves `sim` source without prebuilding

- **Resolution:** `packages/bench` has a build config (`tsconfig.json`) that
  imports the published `@century/sim` declaration output, and a separate
  `tsconfig.typecheck.json` with `noEmit` that maps `@century/sim` to
  `packages/sim/src/index.ts`. `packages/tests` uses the same source mapping.
- **Consequence:** Root `pnpm run typecheck` has no build side effect and works
  from a fresh checkout. `packages/bench` build still requires `sim` to be built
  first; the root `build` command orders packages topologically.

### D-015 — M2 introduces provisional behavioral coefficients

- **Resolution:** M1 constants were structural bounds and version identifiers.
  M2 adds wealth, mortality-multiplier, needs-effect, and militancy coefficients
  in `packages/sim/src/population/constants.ts`. Each records units, cadence,
  justification, and status.
- **Status:** All M2 behavioral coefficients are **provisional**. The original
  structural choice of 17 cohorts with one-fifth annual transfer was superseded
  by D-025 (single-year, sex-separated authoritative state); current structural
  choices are recorded in D-025/D-026.
- **Consequence:** Calibration may tune coefficients, but changing structural
  behavior requires a decision and regression tests.

### D-016 — Development dependencies are limited to the test/build toolchain

- **Resolution:** Runtime dependencies: `@century/data` depends on
  `@century/sim` for types and definition validation; `@century/bench` and
  `@century/tests` depend on both; `sim` and `app` have no runtime dependencies.
  Development dependencies are TypeScript 5.7.2, Jest 29.7.0, ts-jest 29.2.5,
  `@types/jest` 29.5.14, and `@types/node` 22.10.2.
- **Rationale:** The data loader is Node-side static content infrastructure; it
  validates JSON before scenarios are constructed. No UI, worker, browser, or
  state-management framework is needed.
- **Compatibility:** Node 22.12+ is required because Jest ESM execution uses
  `--experimental-vm-modules`. pnpm 9.15.9 is pinned; the lockfile is version 9.
  No dependency is used by `packages/sim` at runtime or typecheck time.

### D-017 — M2 population state and cohort representation

- **M2.1 status:** **Superseded by D-025, which is authoritative.** The original
  17-band/fifths representation and repeated one-fifth transfer were removed
  because they cannot represent actual single-year progression; this section is
  retained only as history.
- **Resolution:** `World` adds `regions: Region[]`, `popBlocks: PopBlock[]`, and
  a minimal `finance.accounts` subset. M2 supports exactly one region.
- **Cohorts:** 17 five-year bands. `ageCohorts` is `Uint32Array`; working age is
  indices 3–12. `agingCarry` is `Uint8Array` in fifths of a person (0–4).
- **Ageing:** `units = cohort + carry`, `moved = floor(units / 5)`, `carry =
  units % 5`; cohorts are processed oldest-to-youngest.
- **Births:** births enter the youngest cohort of the generating pop block.
  Cross-block allocation is deferred with social mobility/migration.
- **Deviations:** GDD `Region` is minimal (no country/market/terrain fields yet);
  GDD `ageCohorts: number[]` is represented as `Uint32Array`; M2 adds
  `agingCarry` and `comfortFulfilledDays`. These are explicit M2 schema choices,
  not silent replacements. M5 extends `Region` and professions.
- **Why integer carries:** exact conservation with no floating-point aging
  remainder, and no reliance on keyed randomness for cohort transfer.

### D-018 — Needs fixture, daily budget, and shared supply

- **Resolution:** M2 uses a deterministic per-day fixture with good prices,
  per-capita physical supply, and annual per-capita disposable income. Static
  needs/demography definitions live in JSON under `packages/data/data`.
- **Budget:** `dailyDisposablePerCapita = max(0, annualIncome - annualMandatory)
  / daysInYear`; total budget is multiplied by block population. Savings account
  balances are authoritative but are not added to the daily budget and are not
  spent. Dissaving, borrowing, taxes, and settlement are deferred to M3/M4.
- **Supply:** one remaining-supply pool per good, shared across all four tiers,
  with `fundingRatio = clamp(cost > 0 ? budget/cost : 1, 0, 1)`.
- **Accounting:** only fulfilled quantities spend budget and consume supply;
  desired/funded/fulfilled/unmet and supply identities are asserted with relative
  tolerances.
- **GDD v2.1 status:** GDD §6.4 now preserves the intended long-term assets plus
  settled-income model and explicitly records the M2 annual-disposable-income
  fixture, no savings drawdown, and no account mutation. This is no longer an
  undocumented deviation; it is a milestone limitation with the later model
  retained. Asset drawdown/settlement still requires explicit counterpart
  accounts in the relevant finance milestone.
- **Consequence:** M2 tests needs allocation without inventing money or a market.
  A future asset drawdown must use explicit counterpart accounts.

### D-019 — Wealth, mortality, and militancy cadence

- **Resolution:** Wealth uses the GDD target formula and monthly smoothing.
  Basic-unmet loss and comfort/luxury gains are separate bounded adjustment
  terms. Pop-block militancy updates daily after needs; mortality is daily and
  uses the previous day's unmet counters.
- **GDD clarification:** §3.4's weekly “political indicators” cadence is read as
  applying to regional/national political aggregates (M8), not the pop-block
  `militancy` field governed by §6.4's daily needs effects. If the designer
  requires weekly pop militancy, a daily pressure accumulator must be added.
- **Consequence:** The distinction is recorded in README and tests. No political
  group, election, or regime behavior is implemented.
- **Known saturation:** Because the target is clamped at zero and comfort relief
  alone can reach the floor, luxury relief may have no visible additional effect
  once sustained comfort has already driven the target to zero. The smaller
  luxury weight still applies whenever the target is above zero. This is a
  provisional model consequence, not a claim that luxury is mechanically
  irrelevant; recalibration may revisit the weights/floor.

### D-020 — Minimal household finance subset

- **Resolution:** M2 adds `FinancialAccount` and `FinanceState.accounts` only.
  `PopBlock.financialAccountId` is used exactly as in the GDD. Accounts are
  authoritative but read-only during M2; no postings, debt, interest, or money
  creation exists.
- **Consequence:** M4 extends `FinanceState` with contracts, postings, period
  summaries, and audit buffers. Minimal-account serialization is already tested.

### D-021 — Source-backed total population, partial demographic calibration

- **Resolution:** The M2 calibration scenario is a source-derived single-region
  world aggregate. The total-population reference is the OWID long-run series
  (Gapminder v7 1800–1949; UN WPP 2024 from 1950), stored as published annual
  values 1899–2000. Published values are treated as mid-year; January 1 comparison
  values are the average of adjacent years. The initial scenario is the
  source-derived Jan 1, 1900 total, 1,621,287,278.
- **Source conventions:** OWID annual values are treated as mid-year; OWID-derived
  January 1 values are adjacent-year averages, not direct January 1
  observations. The 1950 splice is disclosed rather than blended: OWID-derived
  1950-01-01 is 2,480,507,938, while WPP 2024 1-January is 2,471,424,002. The
  WPP validation uses the WPP value.
- **Acceptance:** Historical validation uses the WPP 1950-initialized scenario
  and source-backed annual 1950–2000 ASFR/mortality. It currently reports
  +0.193% at 1975 and +1.227% at 2000, with maximum five-year share differences
  1.08 pp and 0.55 pp. The campaign no-shock baseline is tracked separately: its
  2000 total is +9.553% because its provisional 1950 composition is too young.
- **Rate adjustment:** M2.1 removes the crude-birth-rate model. The 1900/1949
  provisional mortality schedules are multiplied by 1.45 (capped at 1,000 per
  1,000) to align the pre-1950 total trajectory with the source-backed total;
  this is a total-population calibration of provisional rates, not historical
  mortality. Pre-1950 ASFR uses the WPP 1950 schedule scaled by 1.05/1.00.
- **Annual schedules:** WPP ASFR and sex-specific mortality are integrated for
  every year 1950–2000, not only 1950/1975/2000. Three-anchor interpolation
  missed the 1960s fertility peak and caused the earlier 5.2–5.5% validation
  shortfall; annual schedules removed it.
- **Status:** **Historical validation and gameplay baseline are separate.**
  Total-population historical validation is source-backed and close; full
  demographic calibration remains partial because 1900 age/sex and 1900–1949
  schedules are provisional. The simulation does not read target totals.

### D-022 — M2/M2.1 schema and versioning

- **Resolution:** `WORLD_SCHEMA_VERSION = 3`, `SIM_VERSION = "0.3.0"`,
  `DEFAULT_DATA_VERSION = "m2.1-population-v1"`; `SAVE_FORMAT_VERSION` remains 1
  because the envelope shape is unchanged. `World.startDayIndex` is serialized
  so validation scenarios can start on a non-1900 January 1.
- **Compatibility:** Schema-2/simulation-0.2 saves are rejected clearly; no
  migration is attempted. Typed arrays are encoded and restored through the
  existing tagged codec. The campaign no-shock full-century aggregate regression
  digest is `27937e31a211b44f` for seed `20261023`; the WPP validation digest is
  `6e6db5e440706ab6`.

### D-023 — Floating-point precision and invariant tolerances

- **Resolution:** Stored wealth/militancy are rounded to documented decimal
  places after updates; checks use relative quantity/money tolerances rather
  than absolute epsilons on large values. No arbitrary clamp conceals a
  conservation failure; clamps exist only for defined indicator/budget ranges
  and the physical mortality ceiling.
- **Known limitation:** `Math.log` and IEEE-754 arithmetic are not guaranteed
  bit-identical across JavaScript engines. Same-runtime determinism is tested;
  cross-runtime equality remains an open limitation.

### D-024 — M2 performance audit and block-scale benchmarks

- **Finding:** The M2 stress path had avoidable superlinear work: input validation
  searched all blocks for every income ID (O(B²)); needs rebuilt/sorted per-block
  good maps and allocated a Map per good; wealth/militancy looked up each block's
  needs with a linear scan (O(B²)); and `updateMonthlyWealth` repeated linear
  income lookups.
- **Fix:** Use a block-ID set for input validation; map income by block once;
  sort tier items once and use aligned arrays for desired/funded/fulfilled values;
  carry active tier state in one array; map needs results once for daily/monthly
  effects. These changes preserve the arithmetic and state hash; tests and the
  century digest confirm it.
- **Result:** M2.1's single-year/sex state increases work. Latest Node results
  after a 100-tick per-scale warm-up: 200 blocks ~2.97 ms average / 3.91 ms p95;
  1,000 ~16.62/18.80; 3,000 ~54.21/70.78; 6,000 ~104.84/124.08. The 200-block
  p95 threshold remains 5 ms and passes; larger scales are diagnostic, not mobile
  evidence. The death allocator performs largest-remainder allocation at
  band/sex level and deterministic cumulative placement within each five-year
  band.
- **Consequence:** The 200-block provisional Node threshold remains 5 ms p95;
  larger scales are reported without a mobile claim.

### D-025 — M2.1 single-year, sex-separated age representation

- **Issue:** The original GDD §6.1 specified 17 five-year buckets and moving
  approximately one fifth of each cohort annually. That approximation cannot
  represent a person's actual single-year progression and produces artificial
  cohort leakage; it also cannot identify women in reproductive age groups.
- **Resolution:** Authoritative state is two `Uint32Array(81)` arrays per block:
  male and female single ages 0–79 plus open-ended 80+. The 17 five-year bands
  are derived for reporting. Scenario initial data remains 17 five-year groups,
  expanded uniformly to single years; the 80+ group maps to age 80.
- **Ageing:** every person advances exactly one year each January 1 (except the
  scenario start day), oldest-to-youngest; 79 enters 80+; 80+ never ages out;
  newborns enter age 0. No fifths carries or per-cohort fractional transfer.
- **GDD alignment:** GDD v2.1 now specifies this model. The former bucketed
  approximation is no longer a GDD deviation; D-017 records the superseded model.
- **Consequence:** Schema 3; larger state and per-block demographic work; 5-year
  reporting totals remain available without duplicate authority.

### D-026 — Age-specific female fertility replaces crude birth rate

- **Resolution:** Seven maternal five-year bands (15–19 through 45–49) carry
  ASFR per 1,000 women. Expected births use female single-age counts, actual
  civil-year length, fractional accumulation, and the generating block's
  documented provisional profession multiplier. Births enter age 0; a documented
  provisional `sexRatioAtBirth` (currently 1.05 male/female) splits male/female
  births exactly.
- **Data:** WPP 2024 annual ASFR for every year 1950–2000; 1900/1949 schedules
  are provisional WPP-1950-shaped estimates. TFR is used only as a consistency
  check, never as a substitute for ASFR.
- **Tests:** equal-total/different-female-age-structure, reproductive vs
  non-reproductive movement, schedule changes, fractional accumulation, exact sex
  split, age-0 entry, determinism/save-resume.

### D-027 — WPP 2024 age/sex and mortality references

- **Resolution:** WPP 2024 world 1-January population, deaths, and ASFR files are
  integrated. Age/sex validation references are stored for 1950, 1975, and 2000;
  ASFR and sex-specific mortality are integrated for every year 1950–2000.
  Source metadata, units, age bands, mapping, access date, limitations, and
  attribution are in `wpp_age_sex_reference.json` and `source_notes.md`.
- **Mortality:** central death rates are derived as deaths divided by mid-year
  age-sex population, mapped from 17 five-year bands to single ages, and applied
  separately by sex for 1950+. 1900/1949 are provisional.
- **Validation:** the WPP 1950-initialized scenario tests 1975/2000 age structure
  without relying on the provisional 1900 distribution. Annual schedules give
  +0.193%/+1.227% total error, max share differences 1.08/0.55 pp, and male-share
  differences -0.085/-0.185 pp. Three-anchor interpolation was the primary cause
  of the earlier 5.2–5.5% shortfall; it is corrected by annual data, not by
  coefficient tuning.

### D-028 — 1900 initial distribution and pre-1950 calibration

- **Resolution:** The 1900 total is source-derived (OWID adjacent-mid-year
  interpolation, not a direct January 1 observation), but the 1900 age/sex
  distribution is provisional: the prior stylized 17-band shares split by WPP
  1950 age-specific sex shares. 1900/1949 ASFR and mortality are provisional;
  mortality is multiplied by a documented 1.45 total-population calibration
  factor (capped at 1,000 per 1,000).
- **Status:** These are calibrated/provisional inputs, not source-backed
  historical observations. Full demographic calibration remains incomplete.

### D-029 — `startDayIndex` for non-1900 validation starts

- **Resolution:** `World.startDayIndex` records the first represented day.
  Annual ageing is skipped on that starting January 1. The campaign default is
  day 0; the WPP 1950 validation scenario starts at 1950-01-01. The field is
  serialized and hashed.
- **Consequence:** Validation scenarios do not incorrectly age the initial
  January 1 population. Schema-3 saves preserve the start boundary.

### D-030 — Death allocation performance change

- **Resolution:** The previous 17-band largest-remainder allocation built
  per-cell fraction objects and sorted them. With 162 age-sex cells this dominated
  the tick. M2.1 now performs **largest-remainder allocation at the 34
  five-year-band/sex level**, then places each band allocation across its
  single-year ages with a deterministic cumulative split.
- **Tradeoff:** The literal largest-remainder stage is at band/sex resolution,
  not every single-year cell; within-band placement is proportional/cumulative.
  Conservation, deterministic ordering, affected-age tests, and save/resume are
  preserved. This is recorded as a performance/correctness tradeoff, not hidden.

### D-031 — Static definitions are validated at scenario construction, not every tick

- **Finding:** `tick` revalidated the complete annual 1950–2000 ASFR/mortality
  definition object on every day. With 53 anchors this dominated the century and
  validation test paths.
- **Resolution:** `createPopulationWorld`/the data loader validate the immutable
  definitions once. Every tick still validates the world, boundary, context
  presence, income/price/supply fixtures, data/scenario identity, and population
  state. A context cannot silently use a different data/scenario version.
- **Consequence:** Invalid definitions are rejected at construction. Callers that
  build a world and then substitute a structurally different definitions object
  are outside the supported `TickContext` contract; tests construct scenarios
  through `createPopulationWorld`.

### D-032 — GDD v2.1 documentation alignment

- **Resolution:** GDD v2.1 (revision 2026-10-24) is the authoritative
  specification. It aligns calendar/randomness wording, single-year sex-separated
  population state, annual ageing, ASFR fertility, sex-specific mortality,
  annual WPP 1950–2000 data, historical-validation vs gameplay-baseline
  scenarios, the M2 financial-budget fixture limitation, milestone commands, and
  the mobile-performance caveat with the M2.1 implementation.
- **Historical data:** post-1950 WPP validation is source-backed; 1900–1949 age
  structure, fertility, and mortality remain provisional. The campaign's +9.553%
  difference is documented as a no-shock baseline limitation, not historical
  calibration and not evidence about omitted disasters.
- **Supersession:** D-017 remains historical; D-025 is authoritative for the
  population representation. D-021 and D-027 record the annual WPP schedules and
  current validation results. D-028 remains the explicit pre-1950 provisional
  decision. **GDD v2.2 superseded v2.1, GDD v2.3 superseded v2.2 for the
  M4a-2 country/currency alignment, and GDD v2.4 now supersedes v2.3 for the M4b
  monthly finance close (D-047). D-043 records the daily price/settlement ordering
  clarification; v2.4 is the current design authority, and v2.3 remains available
  as historical documentation.**
- **Scope:** documentation only; no simulation code or gameplay behavior changed.

### D-033 — M3a schema 4 transition

- **Resolution:** `WORLD_SCHEMA_VERSION = 4`, `SIM_VERSION = "0.4.0"`,
  `DEFAULT_DATA_VERSION = "m3-economy-v1"`, and `DEFAULT_SCENARIO_ID = "m3-empty"`.
  The save envelope remains format version 1. Schema-3, simulation-0.3, and
  `m2.1-population-v1` saves are rejected with actionable errors; no migration
  is implemented.
- **Data:** the existing M2 population scenarios are re-versioned to
  `m3-economy-v1`; their population schedules and M2 needs fixture are unchanged.
  M3 scenarios use `m3_needs.json`, which excludes services.
- **Hashes:** schema/version and new empty economy collections change the world
  digest. New baselines are M1 empty-world `e200d88ba12e8239`, M2 campaign
  aggregate `d421eaf5f04a207b`, and WPP validation `858773b2d559b2fc`. The previous
  M2.1 hashes remain historical references only. M2 population totals, ageing,
  demographic conservation, and needs-fixture tests are preserved.
- **Consequence:** M2.1 behavioral totals are the regression check; old world
  hashes are not. Future schema changes require the same explicit transition.

### D-034 — M3 static economy contracts and throughput units

- **Resolution:** M3 defines eight goods (grain, livestock, fish, cotton, wool,
  textiles, clothing, food-products) and eight building definitions
  (subsistence farm, commercial farm, ranch, fishery, food-processing plant,
  textile mill, workshop, warehouse). The workshop consumes textiles and
  produces clothing. Services are deferred because their non-storable
  same-day production/consumption path is not implemented. Regional
  resource-limited recipes are deferred: `resourceRequirements` must be empty
  and regional caps are not read or applied per building.
- **Units:** a TU is one standard recipe batch. Capacity and throughput are
  TU/day. Recipe quantities are physical units/TU. Staffing coefficients are
  workers per (TU/day), equivalently worker-days/TU. Building instance level is a
  dimensionless count of standard units.
- **Inventory:** `Market.stockLots` is the sole authoritative inventory
  representation. `stockByGood` is derived on demand, never serialized, and
  excluded from the world hash. Lots are canonicalized by
  `(goodId, ownerBuildingId)`; duplicate lots are rejected. Warehouse capacity
  is storage infrastructure, not inventory ownership.
- **Ownership:** M3 building instances are private; each has an `ownerAccountId`
  and an `operatingCashAccountId`. State-owned instances and non-null required
  technologies are rejected in M3.
- **Status:** recipe, price, wage, and population coefficients in
  `goods.json`, `professions.json`, `buildings.json`, and the M3 scenario are
  provisional synthetic inputs, not calibrated historical values.

### D-035 — M3 minimal cash ledger

- **Resolution:** M3 adds cash asset accounts for households, building
  operations, and a system reserve. For cash assets, debit increases and credit
  decreases. The receiving account is debited and the paying account is credited.
  Every posting is balanced and atomic; an overdraft or invalid line rejects the
  whole posting. A bounded recent posting buffer is retained.
- **Semantics:** M3 posts only the cash leg. Revenue, expense, inventory, and
  equity recognition are deferred to M4. Six transaction-kind names are defined
  for later use; no wage, production, market-clearing, or pricing behavior is
  implemented in M3a.
- **Workflow:** M3a provides the ledger primitive and its tests only. When D-035
  was written, M3b–M3f were unimplemented; later decisions D-038–D-042 record
  their implementation.

### D-036 — M3a structural validation versus economic failure

- **Resolution:** Scenario validation rejects malformed definitions, broken
  references, duplicate ids/lots/accounts, invalid ranges, non-private instances,
  services, non-empty resource requirements, initial stock above warehouse
  capacity, and invalid initial assignments. It does not reject population
  blocks below profession qualification thresholds or buildings with no eligible
  workers; those are valid economic states.
- **Initial employment:** scenario-defined assignments are validated for
  profession match, qualification, participation/working-age eligibility, job
  slots, and duplicate block/building/profession keys. No assignment algorithm is
  implemented in M3a.
- **Tick guard:** a world containing buildings or markets currently throws a clear
  error from `tick` because M3 economy behavior is not implemented. This prevents
  an M3 world from silently using the M2 needs fixture. Population-only worlds
  retain their existing tick path.

### D-037 — M3b schema 5 employment dirty marker

- **Resolution:** `WORLD_SCHEMA_VERSION = 5`, `SIM_VERSION = "0.5.0"`, data
  version remains `m3-economy-v1`. `World.employmentDirty` is an authoritative
  boolean that records a pending initial or immediate employment evaluation.
  Schema-4 and simulation-0.4 saves are rejected; no migration is implemented.
- **Rationale:** initial evaluation and explicit dirty events (building closure
  or changed job capacity) must survive save/resume and must not be inferred from
  wall-clock or unrelated state. The field is a scheduling marker, not an
  employment total or job-slot cache.
- **Consequence:** the world digest changes. New baselines are M1 empty-world
  `90e5dcfaa35cdab0`, M2 campaign aggregate `ebf0a37a515e18d0`, WPP validation
  `fae7f28d69845067`, and M3 structural-world `b4c57b894cda6ae7`. M2.1
  population totals and calibration behavior remain unchanged.

### D-038 — M3b deterministic employment assignment

- **Eligibility:** a block fills only jobs matching its existing
  `professionId`, subject to literacy and wealth qualification. Eligible
  workforce is `floor(workingAgePopulation × participationRate)`, with working
  age derived from ages 15–64 across both sex arrays. Job slots are
  `floor(workersPerThroughputUnit × referenceThroughputPerDayAtLevelOne × level ×
  condition)`. Fractional capacity is not assignable.
- **Retention:** valid existing assignments are retained in ascending keyed draw
  order using purpose `employment.retain`, tie-broken by assignment id only for
  exact draw collisions. Each retained assignment receives
  `min(previous workers, remaining building slots, remaining block eligible
  workforce)`; partial retention is allowed. Excess assignments/workers are
  released.
- **Filling:** for each profession, remaining vacancies are apportioned across
  eligible blocks by largest remainder (purpose
  `employment.block-remainder` for exact ties). Blocks are then processed in
  keyed `employment.fill-order`; each block's quota is apportioned across
  remaining building vacancies by largest remainder
  (`employment.building-remainder`). Existing assignments are extended before new
  assignment ids are created. Unfilled capacity remains vacant; unassigned
  eligible workers remain unemployed.
- **Assignment ids:** new ids begin above the maximum existing assignment id.
  There is no persisted monotonic counter, so an id can be reused after the
  maximum assignment is removed. This is deterministic for a given state; it
  does not affect worker allocation or the world hash beyond stable ids.
- **Scheduling:** `refreshEmploymentIfDue` runs when `employmentDirty` is true or
  the day is the first civil day of the month. It does not run at the terminal
  boundary. `createEconomyWorld` sets `employmentDirty = true` so the first
  explicit evaluation is the scenario initial evaluation. `tick` still rejects
  economy worlds; a future economic tick must call this routine at the employment
  stage. Building closure itself is not implemented.
- **Canonicalization:** assignments are sorted by id; the M3 world sorts pop blocks
  and region `popBlockIds` by id at construction. The hash is therefore invariant
  to incidental pop-block, building, and existing-assignment array order.
- **Limitations:** no production, inventory movement, market clearing, wages,
  pricing, or household market-based needs. The employment path has a focused
  Node benchmark on the fixed small M3 world; it is not a mobile or full-scale
  economy claim.

### D-039 — M3c production phase, reservations, and storage overflow

- **Resolution:** M3c adds an explicit physical production phase
  (`runProductionPhase`) separate from the daily tick. It consumes supplied,
  transient `InputReservation` records against the opening inventory snapshot,
  computes capacity from the approved TU/level/condition/staffing/productivity
  contract, uses only inputs required for executed throughput, releases unused
  reservations, and credits fixed-proportion outputs to producer-owned lots.
  Reservations are never serialized and no save may occur mid-phase.
- **Validation:** a reservation identifies buyer building, market, good, seller
  building/lot, and positive physical quantity. Buyer must have a production
  recipe and require the good; seller lot must exist in opening inventory; total
  reservations per lot cannot exceed its opening quantity; duplicate
  buyer/good/seller reservations are rejected. Invalid sets are rejected before
  inventory mutation.
- **Input attribution:** used input is allocated proportionally across the
  reservations for one buyer/good; unused quantities remain in seller lots and
  create no payment, ownership transfer, or inventory loss.
- **Storage:** storage capacity is derived from operational building storage
  contributions. Provisional M3c rule:
  `contribution = quantity × level × condition`. Warehouses provide capacity
  only and do not own stock. Overflow loss is applied proportionally across all
  lots of the affected good with deterministic residual allocation and recorded
  per lot/owner.
- **Conservation:** `closing = opening + production - used inputs - recorded
  losses`; imports and exports are zero and explicit. Aggregate stock remains
  derived from lots and is neither serialized nor hashed.
- **Boundaries:** no market clearing/scarcity allocation, wages, ledger
  settlement, profit distribution, pricing, or economic tick is implemented.
  The tick guard remains in place. Production does not mutate accounts,
  employment, or prices.
- **Benchmark:** a focused Node benchmark runs the real phase on the approved M3
  world and a 10-group/80-building scaled fixture; it is not mobile evidence.

### D-040 — M3d two-pass market clearing and bounded prices

- **Resolution:** M3d adds `runMarketDay`, an explicit market-day phase separate
  from the daily tick and from M3c production. It accepts validated household
  and production demand records with explicit `desiredQuantity` and
  `fundedQuantity`, resolves them by the approved priority tiers, passes accepted
  input reservations to M3c production with overflow deferred, resolves final
  household demand with same-day output, removes fulfilled household goods once,
  applies final overflow, and updates prices boundedly.
- **No settlement:** M3d neither reads household cash nor mutates financial
  balances. `fundedQuantity` is supplied by the caller; M3f will derive it from
  settled cash and M3e will settle the resulting pending transactions.
  Household purchases, input purchases, and transaction prices are returned as
  transient pending transactions. Reservations and pending results are not
  serialized; no save may occur mid-market-day.
- **Priority sequence:** household subsistence (tier 1), critical production
  inputs (tier 2), household basic (tier 3), remaining production inputs (tier
  5), and household comfort/luxury (tier 6). Government and export demand are
  absent.
- **Critical inputs:** a building's inputs are critical (tier 2) when the building
  is essential infrastructure or produces a good appearing in the subsistence or
  basic need tiers; otherwise they are remaining (tier 5). The caller supplies
  needs definitions; M3d validates every production tier against this rule.
  Numeric building IDs never define priority.
- **Allocation:** funded demand is served in tier order. Within a tier and good,
  supply is allocated proportionally when short. A partially unfilled funded
  tier blocks all lower tiers for that good. Unfunded higher-tier demand never
  blocks lower funded demand.
- **Household blocking:** within a tier, all goods are resolved before the next
  household tier is enabled. A household whose lower active tier is not fully
  fulfilled against its desired quantity cannot buy higher tiers that day.
  Higher tiers remain blocked even if Pass B later fills the lower tier; Pass B
  never unlocks new tiers.
- **Reservations:** Pass A reserves opening inventory in priority order.
  Household and production-input reservations together are checked against each
  opening seller lot. Production consumes only actual input reservations and
  releases unused quantities. Pass B uses current stock after production, which
  already includes same-day output and is net of actual input use, excluding all
  outstanding household reservations; production is never added a second time.
  Fulfilled household goods are removed exactly once before final overflow. If
  critical or remaining input demand could not be served in Pass A, the
  corresponding lower household tiers remain blocked in Pass B; Pass B cannot
  reopen production inputs. Pass B re-evaluates remaining household
  tier-1/tier-3 scarcity blocks using its own remaining demand.
- **Production deferral:** M3c's `ProductionPhaseOptions.applyOverflow` defaults
  to true, preserving M3c behavior. M3d passes false, then calls the shared
  `applyOverflowLosses` after Pass B and household removal. Thus new output can
  serve Pass B but cannot serve same-day production input, and neither reserved
  nor fulfilled household goods can be lost to overflow.
- **Transient residual allocation:** lot shares and allocation remainders use the
  existing keyed RNG with stable purposes (`market.household-residual` and
  `market.building-residual`) and the day/entity context. Array order and numeric
  IDs are not economic priority rules.
- **Price formula:** for each good:
  `imbalance = (fundedDemand - sellableSupply) / max(fundedDemand, sellableSupply, 1e-9)`;
  `dailyChange = clamp(0.10 * imbalance, -0.05, +0.05)`;
  `newPrice = clamp(oldPrice * (1 + dailyChange), 0.25*base, 4*base)`.
  `fundedDemand` is eligible funded demand across household and production tiers,
  counted once and including scarcity-unfulfilled and market-blocked eligible
  demand. `sellableSupply` is opening stock plus same-day production, counted
  once. Production input consumption is represented by funded input demand, not
  netted from supply; final overflow losses occur after clearing and are excluded
  from today's price. Prices are finite/positive, update once after clearing, and
  next-day reservations use the updated price. Allocations and pending
  transactions use the day's opening price. Coefficients are provisional, not
  calibrated.
- **Boundaries:** no wages, financial settlement, profit distribution, household
  income, government finance, inflation, FX, or runnable economic tick. The
  economic-world guard on `tick()` remains intact.

### D-041 — M3e cash settlement, wages, and retained profit

- **Resolution:** M3e adds `settleMarketDay`, an explicit phase that consumes one
  M3d `MarketDayResult` and mutates authoritative `World.finance` balances. It
  settles the M3d seller-attributed pending transactions, pays wages and daily
  building upkeep, and returns a transient per-transaction/per-producer/
  per-household result. It does not integrate a daily tick. GDD §4.1 step 11 and
  §7.7 require operating costs (including upkeep) to be settled and operating
  profit to be residual after all recorded operating costs; §4.2 sets this
  cadence to daily.
- **Ownership:** household accounts belong to pop blocks; operating accounts
  belong to buildings; the single system-reserve account receives upkeep. The
  seller building operating account is credited and the buyer account (household
  or operating) is debited for each pending market transaction. Wage payments
  debit the employer operating account and credit the assigned pop-block household
  accounts. Upkeep debits the building operating account and credits the system
  reserve. No owner or third-party account is touched by M3e.
- **Market sequence:** all M3d pending transactions are settled as one atomic
  batch. Each posting uses the M3d quantity and established transaction price.
  The batch validates each transaction and the aggregate account net before any
  balance changes, so same-batch sales receipts may fund a building's purchases.
  A resulting negative account rejects the entire market batch; balances and
  postings are restored. Market purchases are never partially settled and never
  create debt.
- **Wages:** wage obligations use only actual `EmploymentAssignment.workers`, so
  unfilled slots are not paid and a worker is not paid twice. The daily rate is
  `baseWage1900SUSDPerYear / daysInYear(civil year)`; M3e has no wage index, labor
  scarcity, inflation, laws, or separate productivity-wage adjustment. Wages are
  paid after market settlement, from the employer operating account. If an
  employer cannot fund its obligation, it pays pro-rata up to available cash and
  the unpaid remainder is reported. Unpaid wages are not a liability, debt, or
  negative balance in M3e; they are a recorded shortfall for later labor systems.
- **Upkeep:** every operational building owes
  `dailyUpkeepSUSDAtLevelOne × building.level` per settlement day. GDD §5.3
  supplies the level-one daily value, §7.2/§7.3 define building maintenance costs,
  and §7.7 requires upkeep to be separately recorded. M3e does not apply a
  condition or staffing multiplier because the GDD/data define only the level-one
  daily value; this is a documented inference, not a hidden rule. Upkeep is paid
  after wages, from the operating account to the single system-reserve account,
  using the existing `upkeep` ledger kind. The system reserve is a real account,
  so upkeep is a transfer, not money destruction. If operating cash is
  insufficient, the building pays available cash and reports the unpaid upkeep; no
  debt, negative balance, or automatic closure is created. M3e requires exactly
  one system-reserve account when upkeep is due.
- **Producer accounting:** revenue is settled cash from sales of goods by the
  building; input cost is settled cash paid for production inputs; wage cost is
  cash actually paid; upkeep cost is cash actually paid. Cash-basis operating
  profit is `revenue - input costs - wages paid - upkeep paid`; it is retained in
  the building operating account and is not distributed to owners. No
  COGS/inventory valuation, taxes, interest, dividends, credit, or owner-capital
  injections are introduced. Producer ending cash must equal opening cash plus
  this cash-basis profit.
- **Household assets:** household accounts change only through settled market
  purchases and wage receipts. No universal income, savings interest, asset
  drawdown beyond actual cash, or unexplained transfer exists. `wealthLevel` is a
  welfare indicator, not cash, and is not updated by M3e.
- **Rounding:** SUSD amounts are not rounded per transaction, worker, or upkeep
  obligation; authoritative balances use finite double values with the existing
  `MONEY_TOLERANCE_SUSD = 1e-6` invariant tolerance. Every journal posting is
  balanced, and total cash is conserved.
- **Duplicate protection:** `MarketDayResult.settled` is a transient guard; a
  second call with the same result object is rejected before mutation. This flag
  is not serialized or authoritative, so a malicious/accidental deep copy could
  bypass it; no persistent settlement ledger is added in M3e.
- **Insufficient funds:** market settlement fails atomically if any buyer cannot
  fund its aggregate batch. Wage and upkeep shortfalls are partial rather than
  fatal. A caller/M3f must derive funded market demand from actual cash before
  M3d; M3e does not retroactively adjust M3d allocations.
- **Compatibility:** no schema, save-format, data-version, or simulation-version
  change. `MarketDayResult.settled` is transient. M3d inventory, allocation,
  priorities, and prices are not altered by settlement.
- **Deferred:** wage index/scarcity/productivity/inflation/laws, owner profit
  distribution, taxes, interest, debt, and the M3f daily integration remain future
  work.

### D-042 — M3f integrated economic day

- **Resolution:** `tick` now processes economic worlds through one complete day.
  The order is: terminal/boundary check and world validation; annual ageing when
  due; daily births/deaths; employment reconciliation/refresh (dirty or monthly);
  generation of household and production demand; M3d market clearing with
  production/input reservations, Pass B, prices, and final overflow; M3e market,
  wage, and upkeep settlement; needs counters, daily militancy, and monthly wealth
  when due; then advance `dayIndex` exactly once. M2-only worlds retain the existing
  M2 path.
- **Population cadence:** annual ageing occurs on January 1 except the scenario
  start day, exactly once. Daily demography is applied once before economic
  demand. If daily demographic change makes existing assignments invalid before
  the next monthly refresh, the existing `employmentDirty` marker is set and
  `refreshEmploymentIfDue` repairs it immediately. Otherwise employment follows
  the established dirty/monthly rule.
- **Household demand:** needs come from `PopulationDefinitions.needs`, population,
  wealth activation, and current market prices. Desired quantities are
  `quantityPerCapitaPerDay × population`. The household account's opening cash is
  the only budget; same-day wages are not available. Tiers are funded in GDD order
  (subsistence, basic, comfort/luxury); a tier is fully funded when cash permits,
  otherwise it is proportionally funded and higher tiers are not generated. A
  `MONEY_TOLERANCE_SUSD` reserve keeps the actual market debit within available
  cash. This is a conservative, deterministic funding rule derived from the GDD
  funded-demand definition.
- **Production demand:** desired input quantities come from current building
  capacity and recipes. The day first tries full desired production demand, which
  permits M3e's atomic same-batch sales receipts to fund input purchases. If
  settlement fails, the staged day is restored and production demand is regenerated
  with funded input cost capped by that building's opening operating cash. This
  fallback is safe but does not use potential same-day receipts; it is recorded in
  the tick result as `fallbackUsed`.
- **Atomicity:** the complete day runs on a schema-specific structural deep clone
  covering every typed array and nested authoritative record. Population,
  employment, market inventory/prices, finance, postings, and day advancement
  mutate only the staged world. The staged world is published to the caller's world
  object only after every phase and final validation succeeds. A failure leaves the
  original world, its hash, and its serialized representation unchanged.
  `cloneWorld` must be extended whenever authoritative state gains a field; an
  equality/no-shared-reference test guards the current schema.
- **Needs after settlement:** household fulfilled quantities and actual purchase
  amounts are converted into the existing needs summaries. Unmet subsistence/basic/
  comfort counters and daily militancy update from actual market outcomes, not the
  M2 fixture. No needs purchase is invented outside the market.
- **Monthly wealth:** GDD §6.5 requires a monthly update toward the target
  `clamp(intercept + slope * ln(perCapitaIncome / subsistenceBasketCost), 0, 99)`.
  M3f performs that update on the last civil day of each month using the existing
  M2.1 wealth function. `perCapitaIncome` is the current day's **actual settled
  household wage receipt** divided by block population and annualized by the civil
  year; household cash balances are not treated as income, and mandatory payments
  are zero because M3f has no taxes/other mandatory household payments. The
  subsistence basket uses current post-market prices. The update runs after needs
  counters and daily militancy, so it uses the same day's actual outcomes. This
  preserves January 1 ageing as a separate next-day boundary and requires no new
  persistent accumulator or save field.
- **Measurement-window inference:** the GDD defines the target formula and monthly
  cadence but does not define an income measurement window. Using the current-day
  settled wage flow annualized by the civil year is the smallest deterministic
  implementation available from authoritative M3 state; no monthly income
  accumulator exists. **A trailing-month income average is not implemented.** This
  is recorded as an explicit limitation, not a claim that one day is an exact
  monthly or trailing-month average. A later milestone may add an authoritative
  monthly income accumulator to refine the target without changing the monthly
  cadence or wealth meaning.
- **Compatibility:** no schema, save-format, data-version, or simulation-version
  change. `TickContext` gains an optional `economy.definitions`, and
  `PopulationTickContext.inputs` becomes optional for economic worlds; M2 callers
  still provide inputs. No M3d priority, price, or M3e accounting rule changes.
- **Evidence:** GDD §4.1 step order, §4.2 daily cadence, §4.3 demand priorities,
  §7 daily production/market, and §7.7 settlement/wage/profit rules. M3d/M3e
  decisions D-040/D-041 remain authoritative for their phases.
- **Performance:** the first M3f staging used `serializeWorld`/`deserializeWorld`
  for the whole-day clone. Profiling showed canonical checksum encoding and save
  serialization dominated the tick: a clone averaged about 6.15 ms and was executed
  twice per day. The implementation now uses a schema-specific structural clone
  covering every typed array and nested record, including journal lines. Clone cost
  fell to about 0.14 ms and the same M3f benchmark fell from small 19.800/24.480 ms
  and stress 56.672/59.513 ms (avg/p95) to small 4.535/6.166 ms and stress
  23.353/28.150 ms, with unchanged hashes. Run-to-run Node variance remains; the
  pre-optimization run was the committed baseline measurement. Post-optimization
  profiling is dominated by existing invariant validation; no validation, staging,
  or determinism rule was removed. `cloneWorld` is schema-specific and must be
  extended if authoritative state gains a field; an equality/no-shared-reference
  test guards it.
- **Status:** Node diagnostics only. The GDD mobile p95 ≤ 8 ms target remains
  **NOT EVALUATED** on a reference device/release build.

### D-043 — GDD v2.2 daily price/settlement ordering

- **Issue:** GDD v2.1 §4.2 placed real transaction settlement (step 11) before
  price updates (step 13). M3d applies bounded price adjustment as part of market
  clearing, and M3f runs M3e settlement afterward. The v2.1 ordering and the
  accepted implementation were therefore inconsistent.
- **Resolution:** GDD v2.2 formally retains the accepted ordering: M3d market
  clearing, final allocation, final overflow, and bounded price adjustment occur
  before M3e monetary settlement. Prices are determined by physical market
  imbalance, not by financial settlement. M3e settles the M3d-established
  quantities and transaction prices and does not feed its cash outcome back into
  the current day's price. GDD v2.2 step 10 includes the bounded price adjustment;
  step 11 settles transactions; step 13 covers monthly wealth and future
  cadence-due macro indicators.
- **Why not move prices after settlement:** current-day pending transactions are
  already established at M3d prices, so moving the bounded update after settlement
  would not change the M3f order of value for those transactions. It would,
  however, weaken the rule that market clearing determines prices and create an
  unnecessary future coupling between financial flows and current prices. If a
  later design deliberately wants settlement-conditioned prices, it must change
  the model through a new decision and tests.
- **Consequences:** this is an explicit approved design clarification, not a
  prose-only reconciliation. No M3d/M3e code change is required by this decision.
  Future dividends, taxes, interest, government procurement, and transfers must
  use established transaction prices and must not retroactively alter them.
- **Status:** GDD v2.2 records the implemented ordering. M3d price semantics and
  M3e accounting semantics remain unchanged.

### D-044 — SUSD is Century's fixed unit of measurement (approved)

- **Resolution:** SUSD is the universal unit of account used to measure and
  compare currency valuations, goods prices, wages, production costs, profits,
  wealth, assets, government finance, and all future economic statistics. Its
  definition is fixed. The SUSD-denominated value of the things measured can
  change: a currency may be worth 0.50 SUSD and later 0.35 SUSD; a good may rise
  from 2 SUSD to 3 SUSD. SUSD is **not** a registered currency, an issuer, a
  legal tender, or a promise of constant purchasing power. Nominal SUSD is
  distinct from any future real/inflation-adjusted measure, which must be derived
  through a documented price index or reference period.
- **`fxToUSD` rejected:** no field with that name or inverse-rate meaning is
  implemented. The single authoritative valuation direction is
  `CurrencyValuation.susdPerUnit = SUSD per ONE unit of the currency`.
  `crossRate(from, to) = from.susdPerUnit / to.susdPerUnit` yields units of
  `to` per one unit of `from`. Cross rates are derived, never stored.
- **Dimensional type:** `SusdPerCurrencyUnit` is a branded numeric type with a
  validated constructor; it cannot be silently supplied as a `MoneySUSD` amount.
  Serialized state remains a plain JSON number, reconstructed through the
  constructor at decode. This is a narrow, documented exception to D-003's
  general avoidance of branded state types, justified by the distinct dimensions;
  it does not change determinism or JSON shape.
- **Validation and tolerance:** amounts must be finite and non-negative; rates
  must be finite, positive, and inside `[1e-12, 1e12]` (provisional numerical
  safety bounds). Conversions reject non-finite results, overflow, and positive
  underflow to zero. Rate comparisons use the dimensionless
  `CURRENCY_RATE_RELATIVE_TOLERANCE`; SUSD amounts use the existing scaled money
  tolerance. Missing or unavailable valuations raise a named
  `CurrencyValuationError`; they never default to parity or another currency's
  value. Bounds and tolerances are not calibrated economics.
- **Status:** implemented in M4a-2. No second unit of account, native-currency
  balances, or purchasing-power promise is introduced. GDD v2.3 records this
  model as current.

### D-045 — Country, currency issuer, monetary arrangement, and SUSD-relative valuation (approved)

- **Runtime authority:** `World.countries`, `World.currencies`, and
  `World.currencyValuations` are authoritative runtime state. They are included
  in construction, validation, serialization/deserialization, canonical hashing,
  structural cloning, and save/resume tests. Legacy M2/M3/M4a-1 worlds use empty
  collections and remain valid.
- **Country:** `Country { id, tag, name, monetary, regionIds }`.
  `Country.monetary` is the sole domestic arrangement; there is no top-level
  `Country.currencyId`. Each country has exactly one arrangement, `own` or
  `adopted`. Country tags are unique and non-empty; region references are unique,
  known, and claimed by at most one country.
- **Region ownership:** `Country.regionIds` is the sole authoritative
  country-to-region mapping. `Region.countryId` is deliberately not added.
  Worlds without countries are valid; worlds with countries may leave regions
  unassigned. `regionOwner` returns the owner id, `null` for a known unassigned
  region, and throws for an unknown region; it never guesses.
- **Currency:** `Currency { id, key, name, issuer }`; the issuer is
  `{kind:"country", countryId}`, `{kind:"foreign", issuerKey}`, or
  `{kind:"union", unionKey}`. `union` is rejected in M4a-2. Keys are unique
  lower-case identifiers; `susd` is reserved case-insensitively.
- **Issuance is independent of the domestic arrangement:**
  - `own` selects a currency issued by that country.
  - `adopted` selects a currency issued by someone else — another simulated
    country or a foreign issuer.
  - Adoption never changes issuer identity; an adopter does not become the
    issuer of the adopted currency.
  - A country may issue one currency and adopt a different one for domestic use.
    The issued currency may be adopted by another country or remain unused. This
    is a deliberate design capability, not an accidental consequence.
  - **Deliberate scope restriction:** each simulated country may issue at most
    one currency in M4a-2. This is a restriction, not a logical consequence of
    adoption.
  - A foreign-issued currency must be adopted by at least one country; a
    simulated-issued currency may be unused.
- **Valuation:** exactly one `CurrencyValuation` per currency. `specified`
  carries `susdPerUnit`, `setOnDay` (must equal the world start day in M4a-2),
  and `source: "scenario"`. `unavailable` records the absence explicitly and
  stores no fabricated rate. There is no regime, peg, inflation index, money
  supply, central-bank account, or dynamic FX field. A scenario-defined
  valuation is not a permanent peg to SUSD.
- **Rejected:** shared-currency arrangements, union issuers, duplicate or missing
  valuations, unknown countries/currencies/regions, duplicate region claims,
  SUSD as a currency/issuer/arrangement target/valuation, and multiple issued
  currencies per country.
- **Out of scope:** issuance operations, legal-tender enforcement, central banks,
  treasury accounts, currency unions, redenomination, monetary policy, dynamic
  FX, inflation, native-currency balances, and multi-currency settlement.
- **Compatibility:** `WORLD_SCHEMA_VERSION = 7`, `SIM_VERSION = "0.7.0"`,
  `SAVE_FORMAT_VERSION = 1`, data version `m3-economy-v1` unchanged because no
  shipped scenario data changed. Schema-6/simulation-0.6.0 saves are rejected;
  no migration is implemented (D-013). New digests: empty world
  `31d491d18d02a4af`, M2 campaign aggregate `7961a6dd7da17bb3`, WPP validation
  `67cd0a5d67765bf7`, M3 structural world `39a732ddd3dcd3c3`.
- **Resolved approvals:** runtime (not static-definition) placement; explicit
  foreign issuer for adoption; `Country.regionIds` as the only ownership
  authority; no treasury/central-bank accounts; inline test-only fixtures with no
  shipped historical data; provisional rate bounds/tolerance; branded valuation
  type; non-negative amounts and underflow rejection.
- **Limitations:** no real/inflation-adjusted measure, no currency regimes or
  dynamic rates, no monetary issuance, no native balances, and no historical
  country/currency calibration. Node benchmarks remain diagnostics; the mobile
  p95 target remains **NOT EVALUATED**. GDD v2.3 records this model as current.

### D-046 — M4a-1 category-aware double-entry accounts (approved)

- **Status:** approved by the designer before implementation, with the
  qualifications recorded here. D-044/D-045 were reserved for M4a-2 and are now
  recorded above. GDD v2.3 records the M4a-1 baseline as current.
- **D-046a — opening balances.** Opening balances are applied **once, atomically**
  as calibrated initial state, not as one journal posting per account. The
  application requires every account to start at zero, validates every entry and
  the aggregate identity against category constraints, requires explicit equity
  counterparts, and persists an `OpeningBalanceRecord` (`dayIndex`,
  `accountCount`, canonical FNV-1a checksum). A second application throws. This
  avoids flooding the 256-entry audit buffer with immediately evicted
  construction postings.
- **D-046b — categories and normal sides.** Accounts gain
  `category: asset | liability | equity | revenue | expense` and a validated
  `subtype`. Asset and expense accounts are debit-normal; liability, equity, and
  revenue accounts are credit-normal. Balances are stored in normal-side units.
  Asset, liability, revenue, and expense balances must be non-negative; equity may
  be signed as an accumulated deficit. `World.finance.postings` remains the
  bounded audit buffer; **no unbounded transaction log is introduced.**
- **D-046c — per-building accounts.** Each pop block receives cash, equity, wage
  income, and consumption expense accounts; each building receives operating cash,
  equity, sales revenue, input expense, wage expense, and upkeep expense; the
  system reserve receives cash, equity, and system income. This is required so a
  later stage can read per-building pre-tax period results from account balances
  rather than reconstructing them from aggregates.
- **D-046d — inventory treatment.** Inventory remains outside the accounting
  asset model and input purchases are expensed when purchased. This is an
  explicitly **provisional cash-basis simplification, not full accrual
  accounting**; there is no COGS, inventory valuation, or period closing in
  M4a-1.
- **Corrected invariants (replace the earlier invalid asset-conservation claim).**
  1. **I-1:** every posting balances; `assets + expenses = liabilities + equity +
     revenues` holds after complete entries and at day boundaries, never per line.
  2. **I-2:** the explicit designated-cash set (`household-cash`,
     `operating-cash`, `system-reserve-cash`) is conserved by every cash-neutral
     transaction kind. The set is a validated mapping, never "all asset
     accounts". The building cash subtype is `operating-cash`, consistent with
     `BuildingInstance.operatingCashAccountId`; the earlier plan wording
     `building-cash` is superseded. `treasury-cash` and `central-bank-cash`
     remain deferred to their future owning stages.
  3. **I-3:** total asset balances are **not** conserved. A future bond issuance
     may create an asset against a liability without moving cash.
  4. **I-4:** `monetary-issuance` and `monetary-redemption` are the only
     registered cash-changing kinds. Their mechanisms, central-bank balance
     sheet, and debt contracts are future work; posting them in M4a-1 is
     rejected.
- **Designated-cash extension.** M4a-1 registers only the three cash subtypes that
  can exist without countries; M4a-2/M4g add `treasury-cash` and
  `central-bank-cash` when those accounts exist. The partition-coverage test
  requires every transaction kind to belong to exactly one of the cash-neutral or
  cash-changing sets.
- **Construction.** `FinanceState` gains `nextAccountId` (deterministic
  allocation) and `opening`. Derived account ids are allocated above every
  scenario-declared account id. `createEconomyWorld` defers opening application
  until all accounts exist, then applies the complete set once. Population-only
  worlds apply their household opening balances during construction.
- **Recognition.** Market sales post buyer expense/seller revenue legs; wages post
  wage expense and household income legs; upkeep posts operating expense and
  system income legs. Cash outcomes, producer cash-basis profit, household cash,
  and every settlement total are unchanged.
- **Performance.** `FinanceIndex` is a transient owner/subtype lookup built once
  per phase. It is not serialized and never authoritative.
- **Compatibility:** `WORLD_SCHEMA_VERSION = 6`, `SIM_VERSION = "0.6.0"`, data
  version stays `m3-economy-v1` because static definitions are unchanged.
  Schema-5/simulation-0.5 saves are rejected; no migration is implemented
  (D-013). New digests: empty-world `8c2315493f71ab6b`, M2 campaign aggregate
  `8e8e021bd3c8bcb5`, WPP validation `78a43b9772738cad`, M3 structural-world
  `0794a85763a141f1`.
- **Limitations:** no period closing (revenue/expense accumulate), no
  distributions, no taxes, no debt, no countries/currencies, no inflation/FX.
  Inventory is not an asset. Node benchmarks remain diagnostics; the mobile
  p95 ≤ 8 ms target is **NOT EVALUATED**.

### D-047 — M4b monthly period close and finance summaries (approved)

- **Status:** approved and implemented for M4b (see the implementation notes
  below). GDD v2.3 still records M4b as future work; a later GDD revision should
  record the accepted behavior. No design rule was changed during implementation.
- **Scope:** M4b adds a monthly period close for economic worlds and immutable
  monthly finance summaries. It does not add taxes, government finance, debt,
  interest, banks, central banking, monetary issuance, native-currency
  balances, FX conversion, inflation, monetary regimes, currency unions, UI,
  annual close, reopen, or M4c.
- **Monthly boundary and pipeline ordering.** Close on the last civil day of each
  Gregorian month, after all daily postings, needs/militancy, and the month-end
  monthly-wealth update, and before `dayIndex` advances. The close belongs to
  GDD §4.2 step 14 and supplies the monthly finance history required by GDD
  §14.7. The first period starts at `World.startDayIndex` (a partial first period
  is allowed); later periods start the day after the previous period end. The
  terminal `2000-01-01` boundary is never closed.
- **Opening balances.** Opening balances are pre-existing balance-sheet state,
  not period activity. `applyOpeningBalances` must reject nonzero opening
  entries for `revenue` and `expense` accounts; revenue/expense accounts start at
  zero. Opening entries remain allowed for asset, liability, and equity
  accounts. The first summary's `accountTotals` includes opening balance-sheet
  balances, while `flowTotalsByKind` contains only post-opening period activity.
- **Semantic posting domain.** For every journal line, enforce:
  - `goods-purchase`: debit `consumption-expense`, credit `sales-revenue`;
  - `input-purchase`: debit `input-expense`, credit `sales-revenue`;
  - `wages`: debit `wage-expense`, credit `wage-income`;
  - `upkeep`: debit `upkeep-expense`, credit `system-income`.
  The matrix applies to revenue/expense lines in every entry of
  `postJournalEntry`, `postJournalBatch`, and persisted-posting validation.
  Cash and equity lines remain governed by the existing account and cash
  invariants. `profit-distribution` and `owner-capital-injection` may not post
  to revenue or expense accounts; existing test-only uses of
  `owner-capital-injection` for revenue/expense must be rewritten.
- **Internal close-only kind.** Add `period-close` for closing entries. Public
  `postJournalEntry`/`postJournalBatch` reject it at type and runtime
  boundaries; the close helper uses a non-public posting path. Persisted
  `period-close` postings are accepted by `assertValidJournalPosting` only with
  structural validation: no cash lines, revenue debits, expense credits, and an
  equity line only for a nonzero net, with balanced debits/credits. Public
  callers cannot create arbitrary closing entries.
- **Flow derivation.** Derive the four current flow totals from pre-close
  expense-account balances:
  - `goods-purchase` ← `consumption-expense`;
  - `input-purchase` ← `input-expense`;
  - `wages` ← `wage-expense`;
  - `upkeep` ← `upkeep-expense`.
  `period-close` is excluded. Given zero opening revenue/expense, the semantic
  matrix, nonnegative expense enforcement, and exact closing zeroing, each
  expense balance is the gross activity for the current period. No separate
  flow accumulator is introduced; derivation is valid only while these
  invariants are enforced. If the matrix is not enforced, the derivation is
  invalid and M4b must not claim these flows.
- **Owner-equity invariant.** Every owner with any revenue or expense account
  must have exactly one `owner-equity` account. Pop blocks and buildings are
  covered by the existing structural account sets; add a general system-owner
  check independent of whether a system-reserve account exists. The close must
  fail before mutation if the invariant is violated. It must not create an
  equity account implicitly or skip the owner's balances.
- **Closing entries.** For each owner with nonzero revenue/expense balances,
  debit each revenue account, credit each expense account, and post the net
  `revenue - expense` to the owner's existing `owner-equity`; positive net
  credits equity, negative net debits it, and zero net needs no equity line.
  Equity may become negative. One entry per owner, with deterministic owner
  order and account-id order. Post all entries as one atomic batch using
  `period-close`; no cash account is touched and no distribution, tax, debt, or
  monetary issuance occurs.
- **Summary.** `FinancePeriodSummary` contains `periodStartDay`,
  `periodEndDay`, `accountTotals`, and `flowTotalsByKind`, matching the GDD §5.5
  contract and the period-summary requirement in §8.1. Capture it before closing
  entries. `accountTotals` is the pre-close trial balance, including opening
  balance-sheet balances and period revenue/expense, with only nonzero accounts.
  `flowTotalsByKind` contains the four current derived flows. The summary is
  immutable. `FinanceState` gains `periodSummaries` and `closedThroughDay`; no
  `World.history` collection is added in M4b.
- **Atomic close.** Stage the entire finance state on a deep copy. Apply the
  closing entries, append the summary, and set `closedThroughDay` on the copy.
  Validate the complete staged finance state, owner-equity invariant, accounting
  identity, and summary consistency before replacing `world.finance`. Any
  failure leaves the original balances, postings, summaries, and close boundary
  unchanged. This applies to direct close calls and to the whole-day tick; the
  tick's staged-world clone remains defense in depth.
- **Staged versus published state.** A staged close may temporarily have
  `closedThroughDay === world.dayIndex`. A published/serializable world requires
  `closedThroughDay === null` or `closedThroughDay < world.dayIndex`.
  `assertValidEconomyState` enforces this strict published invariant;
  `assertValidWorld`, `serializeWorld`, `hashWorld`, and `deserializeWorld`
  reject an unadvanced close state through that validation. `tick` advances
  `dayIndex` before publication. `runEconomicDay` and direct close calls are
  staging operations; their unadvanced state is not serializable until the day
  advances.
- **Summary validation.** Summaries are sorted, unique, and contiguous, with at
  most one summary per civil month and no more than the campaign's monthly
  periods; the first `periodStartDay` equals `World.startDayIndex`; each later
  start is the previous end + 1; each end is a civil month-end; no summary
  extends beyond the current day; the last end equals `closedThroughDay`;
  `closedThroughDay` is null iff there are no summaries; account totals reference
  existing accounts; flow values are finite and nonnegative.
- **Duplicate, gap, first period, M2-only, terminal.** A duplicate close throws
  and mutates nothing. A missed month-end/gap is rejected rather than merged.
  The first period may be partial. M2-only worlds do not close and create no
  summaries. The terminal 2000-01-01 day is not closed; the final possible
  period ends 1999-12-31.
- **Accounting identity.** Before close,
  `assets + expenses = liabilities + equity + revenues` holds. Closing zeroes
  revenue/expense, adjusts equity by `revenue - expense`, preserves designated
  cash, and preserves the identity after close. The summary's pre-close
  account totals also satisfy the identity.
- **Serialization, cloning, hashing, and compatibility.** Add
  `FinancePeriodSummary`, `FinanceState.periodSummaries`, and
  `FinanceState.closedThroughDay`; encode summaries sorted by period end and
  account/flow maps with canonical keys; include them in hashing and deep
  cloning; validate on decode. `WORLD_SCHEMA_VERSION = 8`,
  `SIM_VERSION = "0.8.0"`, `SAVE_FORMAT_VERSION = 1`, and data version
  `m3-economy-v1` unchanged. Schema-7/simulation-0.7 saves are rejected with an
  actionable error; no migration is implemented (D-013).
- **Required tests.** Opening revenue/expense rejection without mutation;
  invalid kind/side rejection in individual and batched postings; valid
  production postings and internal close behavior; public `period-close`
  rejection and persisted-close structural validation; missing system equity
  rejection; exact zeroing of revenue/expense and preservation of cash/accounting
  identity; direct-close atomicity; rejection of unadvanced staged states by
  world validation, serialization, and hashing; schema-7/simulation-0.7 save
  rejection. Also cover summary correctness, partial first periods, month-end
  and leap-year boundaries, duplicate/gap behavior, determinism, save/resume,
  cloning, and M2/M3/M4a regressions.
- **Deferred.** Taxes, government revenue/expenditure, debt, interest, banks,
  central banking, monetary issuance, native-currency balances, FX conversion,
  inflation, monetary regimes, currency unions, annual/fiscal-year close,
  reopen/reversal/adjusting entries, a separate retained-earnings subtype,
  flow totals for future cash/equity-transfer kinds, M2-only finance summaries,
  account deletion/remapping, summary compaction, UI, and M4c.

#### D-047 implementation notes (recorded with the M4b implementation)

These clarify D-047 at implementation time; none changes an approved rule.

- **First-period boundary rule.** The first close may occur at any civil
  month-end on or after `World.startDayIndex`; gap detection applies between
  *closed* periods. A first period is partial by design (it starts at
  `startDayIndex`), and published validation cannot prove which calendar days a
  caller actually processed. A caller that stages `dayIndex` directly (tests and
  imperative drivers) therefore closes its first period over the skipped
  calendar months, and the captured balances/flows still describe only processed
  activity. Once a period has closed, the next close must land on the next
  month-end; a missed month-end is rejected rather than merged.
- **Summary encoding.** `accountTotals` keys are canonical unsigned decimal
  account ids; `flowTotalsByKind` always carries exactly the four current flow
  kinds. Persisted validation cross-checks each flow total against the mapped
  expense totals frozen in the same `accountTotals` map and re-checks the
  trial-balance identity, so a summary cannot disagree with its own balances.
- **Validation placement.** The owner-equity invariant runs in published/staged
  economy validation after owner-reference checks (so an orphaned account is
  reported as a reference error) and in `closeFinancePeriod` before any staging.
  The internal `period-close` posting helper stays module-private; only
  `closeFinancePeriod` and `FinanceCloseResult` are exported.
- **Posting-id guard.** The batch posting-id overflow guard was off by one (it
  allowed `nextPostingId` to reach `Number.MAX_SAFE_INTEGER + 1`). Corrected in
  both `postJournalBatch` and the internal close batch; it only affects the
  unreachable extreme boundary.
- **Compatibility and digests.** `WORLD_SCHEMA_VERSION = 8`,
  `SIM_VERSION = "0.8.0"`, `SAVE_FORMAT_VERSION = 1`, data version
  `m3-economy-v1` unchanged; schema-7/simulation-0.7.0 saves are rejected with
  no migration (D-013). Updated known-answer digests: empty world
  `30c4d2bae09c5410`, M2 campaign aggregate `f1782a6a6fa3e118`, WPP validation
  `997b5f78f3fb4c52`, M3 structural world `ba075368e9f2d67e`.
- **GDD alignment.** GDD v2.4 now records the accepted M4b behavior as current
  (D-047), including the partial-first-period limitation. GDD v2.3 retains the
  earlier statement that M4b was future work and remains unchanged as historical
  documentation.
- **Limitations.** Node benchmarks remain diagnostics; the mobile p95 target is
  **NOT EVALUATED**. No taxes, government finance, debt, interest, banks,
  monetary issuance, native-currency balances, FX, inflation, annual close,
  reopen/reversal, or UI are implemented.

### D-048 — M4c government fiscal loop (approved)

- **Status:** approved for M4c and recorded before implementation, following the
  D-046/D-047 practice. It assigns milestone ownership for the tax and government
  expenditure work that GDD v2.4 §17.2 lists as the remaining M4 public-finance
  items. No existing M4a/M4b rule is changed.
- **Scope.** M4c adds a per-country treasury, a daily flat income tax on wages
  actually paid, a daily budgeted per-capita welfare transfer, and the fiscal
  accounting, validation, persistence, wealth-input, and close integration they
  require. It does not add any other tax, government service or procurement,
  debt, interest, banks, monetary issuance, FX, inflation, monetary regimes,
  laws, elections, interest groups, player/AI actions, UI, GDP, national
  accounts, annual history, annual close, reopen/reversal, or multi-region data
  authoring.
- **Fiscal policy state.** `Country.fiscal` is authoritative runtime state with
  `incomeTaxRate` (dimensionless, 0..1) and `welfareBudgetSUSDPerYear` (nominal
  SUSD per civil year, finite and nonnegative). It is initialized by
  `CountryInitialDef.fiscal`. Rates are provisional hard-bounded values, not
  law-bounded: M8 may replace them with enacted taxation laws. Any additional
  bound is a documented numeric-safety constant in `economy/constants.ts`, not
  tuning. `Country.treasuryAccountId` references the country's own
  `treasury-cash` account.
- **Country accounts.** Every country has exactly one each of `treasury-cash`
  (asset, designated cash), `income-tax-revenue` (revenue), `welfare-expense`
  (expense), and `owner-equity` (equity). The treasury account id is
  scenario-declared; the remaining country accounts are deterministically
  allocated above the declared-id floor. Opening treasury cash is applied once
  through `applyOpeningBalances` with the country equity account as its
  counterpart, so the opening record and the accounting identity cover it.
  Opening revenue/expense balances remain rejected.
- **Household accounts.** Every pop block gains `income-tax-expense` (expense)
  and `welfare-income` (revenue). The existing per-block cash, equity,
  wage-income, and consumption-expense accounts are unchanged. The original
  intent that worlds without a country also carry the two zero-balance fiscal
  accounts was narrowed during implementation to worlds that declare a country,
  to preserve the countryless M2/M3 account set and benchmark baseline; see the
  implementation notes below.
- **Ownership kind.** `FinancialAccountOwnerKind` gains `country`. The new
  account subtypes are registered in the subtype/category and
  subtype/owner-kind maps. `treasury-cash` joins the explicit designated-cash
  set used by the I-2 aggregate cash-conservation invariant; taxes and transfers
  are cash-neutral movements between designated-cash accounts.
- **Transaction kinds and semantic matrix.** `income-tax` and
  `welfare-transfer` are registered public cash-neutral transaction kinds and
  are added to the central semantic matrix enforced for individual, batched,
  and persisted postings:
  - `income-tax`: debit `income-tax-expense`, credit `income-tax-revenue`;
  - `welfare-transfer`: debit `welfare-expense`, credit `welfare-income`.
  Cash and equity lines remain governed by the existing account/cash
  invariants. `FLOW_TRANSACTION_KINDS` is unchanged at the four M4b flow kinds.
- **Pipeline placement.** The fiscal phase runs inside the integrated economic
  day after market/wage/upkeep settlement (GDD §4.2 step 11) and before the
  needs/militancy update and month-end wealth update (step 13). It is part of
  the unimplemented §4.2 step 12 finance work, not a new clock. Period close
  timing is unchanged: still the last civil day of the month after postings,
  needs/militancy, and month-end wealth, before `dayIndex` advances (step 14).
  The fiscal phase uses the settlement result of the same day; it never reads
  accumulated balances to estimate wages.
- **Income tax.** For each pop block, `tax = incomeTaxRate × wages actually
  received that day`. Residence country is the owner of the block's region.
  There are no exemptions, strata, wealth taxes, or tax on welfare, and
  collection efficiency is fixed at 1.0. No tax is due on zero or unpaid wages.
  Multiple employers are already combined by settlement into the block's daily
  wage receipt. The posted entry debits each block's `income-tax-expense`,
  credits its `household-cash`, debits the country's `treasury-cash`, and
  credits `income-tax-revenue`. Gross wage income and employer wage expense are
  unchanged. Tax cannot exceed the day's received wages or the block's cash; a
  violation is an implementation error and fails without mutation.
- **Welfare transfer.** For each country, `requested = welfareBudgetSUSDPerYear
  / daysInYear(currentCivilYear)`. Payable is the lesser of `requested` and
  treasury cash available after that day's income-tax receipts. Payable is
  allocated across the country's pop blocks in proportion to population in
  ascending block-id order, with the final block receiving the exact remainder
  so the allocated amounts sum exactly to payable. No keyed random draw is used;
  the residual convention here is deterministic ordering, not the M3e random
  residual order. The entry debits `welfare-expense`, credits each block's
  `welfare-income`, debits each block's `household-cash`, and credits
  `treasury-cash`. When treasury cash is insufficient, all transfers are reduced
  proportionally by allocating only the payable total; the difference between
  requested and paid is recorded as a shortfall. No debt, arrears, borrowing, or
  negative cash is created. A zero budget or zero population creates no
  posting; with zero population the requested amount is reported as shortfall
  because there is no recipient.
- **Atomicity.** All fiscal entries for the day are built and validated first,
  then posted as one `postJournalBatch`. A fiscal failure leaves the staged day
  unchanged; the public `tick` continues to stage the whole economic day on a
  clone and publish only after final validation.
- **Wealth inputs.** On the month-end wealth update, `perCapitaIncome` is the
  block's actual settled wages plus welfare received that day, and
  `annualMandatoryPaymentsPerCapitaSUSD` is the income tax actually withheld
  that day. Both are divided by block population and annualized by the actual
  civil-year length, matching the existing daily-flow convention. Unpaid wages
  and unfunded welfare are not income. This refines the provisional M3f
  convention; it does not introduce a trailing-month average or accumulator.
- **Summaries and close.** The M4b `FinancePeriodSummary` shape, the four
  `flowTotalsByKind` keys, and the closing semantics are unchanged. Country
  `income-tax-revenue` and `welfare-expense` balances are closed into the
  country's existing `owner-equity` at month-end, cash-neutrally, in
  deterministic owner order: pop blocks, then buildings, then countries, then
  the system owner. Government period totals are derived from the frozen
  summary `accountTotals` plus account metadata; no new flow kind is added.
- **Validation.** Rejected before mutation: non-finite, negative, or
  out-of-range fiscal values; missing, duplicated, mismatched, or wrongly owned
  country accounts; a treasury reference that is not the country's own
  `treasury-cash`; duplicate treasury account ids or collisions with other
  declared account ids; opening revenue/expense balances; and region ownership
  gaps. When any fiscal policy is nonzero, every region containing pop blocks or
  buildings must be claimed by exactly one country. Countryless and zero-fiscal
  worlds remain valid and economically unchanged. Existing owner-equity,
  accounting-identity, nonnegative non-equity balance, cash-conservation,
  posting-balance, and staged-close invariants are not weakened.
- **Determinism.** No randomness is added. Countries are processed in ascending
  id order, pop blocks in ascending id order, allocations use the residual rule
  above, and the single fiscal batch has a fixed entry order. Identical state,
  seed, and actions produce identical hashes.
- **Persistence and compatibility.** New authoritative fields: `Country.
  treasuryAccountId`, `Country.fiscal`, the country-owned accounts, and the two
  per-block fiscal accounts. Serialization encodes, hashes, deep-clones
  (`copyCountry` copies `fiscal`), and validates them. `WORLD_SCHEMA_VERSION =
  9`, `SIM_VERSION = "0.9.0"`, `SAVE_FORMAT_VERSION = 1`, `dataVersion`
  `m3-economy-v1` unchanged (no shipped scenario data). Schema-8/
  simulation-0.8.0 saves are rejected with an actionable error and no migration
  (D-013). Known-answer digests are re-baselined because schema/simulation
  versions and the country treasury/fiscal fields are hashed; countryless account
  sets are unchanged (see the implementation notes below).
- **Required tests.** Fiscal-value validation; account construction and
  completeness; treasury reference and collision rejection; opening treasury
  cash applied once; region-ownership rejection when fiscal is active; income
  tax formula, zero rate/wages, unemployment, partial wages, multiple
  employers/blocks/countries, no tax on welfare or wealth, gross wage
  recognition intact, and cash limits; welfare 365/366-day budgets, per-capita
  exact allocation, zero budget/population, sufficient/insufficient treasury,
  proportional reduction, exact shortfall, and no negative cash/debt; semantic
  matrix acceptance and rejection for single, batched, and persisted postings;
  cash-subtype/kind partition coverage; country close into equity with
  deterministic order and unchanged four-flow summaries; multi-day treasury
  reconciliation; fiscal effects on subsequent demand/needs; multi-country
  isolation; M2/M3/M4a/M4b regressions; repeated-run and save/resume hashes;
  injected fiscal failure leaves state unchanged; M2-only worlds skip the phase;
  schema-8/0.8.0 rejection; and a dedicated M4c fiscal-day benchmark.
- **Limitations.** Collection efficiency is fixed at 1.0; fiscal policy is not
  law-bounded or mutable by an action; taxes are flat, wage-only, residence-
  based, with no exemptions or strata; welfare is a single per-capita budgeted
  transfer with no service, targeting, or administrative cost; corporate,
  consumption, land, tariff, and state-enterprise revenue are absent; corporate
  tax cannot be assessed from per-building period results until a later stage;
  the wealth income basis remains a current-day flow annualization, not a
  trailing-month average; Node benchmarks remain diagnostics and the mobile p95
  target is **NOT EVALUATED**.
- **Deferred.** Corporate/consumption/excise/tariff/land/property taxes,
  state-enterprise remittance, colonial transfers, debt/bonds/interest/
  maturities/default, banks/central bank/issuance, FX/inflation/regimes,
  government procurement or tier-4 market demand, government employment and
  public services, subsidies, infrastructure maintenance, debt service,
  law-bounded rates/enactment/elections/interest groups, player/AI policy
  actions, UI/snapshots/commands, multi-region/multi-country authoring, GDP/
  national accounts/`CountryStats`/annual history/`World.history`, annual or
  fiscal-year close, reopen/reversal/adjusting entries, retained-earnings
  subtype, summary compaction, and new M4b flow-total kinds.

#### D-048 implementation notes (recorded with the M4c implementation)

These clarify D-048 at implementation time; none changes an approved gameplay
rule.

- **Fiscal account creation is conditional on a country.** D-048 anticipated the
  two per-block fiscal accounts being uniform in every world. The implementation
  creates `income-tax-expense` and `welfare-income` for pop blocks only when the
  scenario declares at least one country, because a countryless M2/M3 fixture has
  no fiscal system. Published validation requires the fiscal account set whenever
  `world.countries` is nonempty and leaves countryless worlds with their original
  owner account set. This preserves the M2/M3 baseline behavior and benchmark
  scale instead of charging every M2-only world for fiscal state it cannot use.
  Countryless worlds remain unable to run the fiscal phase because the phase has
  no country to collect or pay.
- **Fiscal construction and ownership.** `CountryInitialDef` declares the
  treasury account id and initial cash; construction creates the country
  treasury/equity/tax-revenue/welfare-expense accounts after the system accounts,
  applies opening treasury cash and its equity counterpart through
  `applyOpeningBalances`, and rejects treasury-id collisions with any other
  declared account. `copyCountry` deep-copies `fiscal`; serialization/hashing
  include it.
- **Fiscal timing and atomicity.** The phase runs after `settleMarketDay` and
  before `buildNeedsResult`/militancy/month-end wealth. It builds all tax entries
  and then all welfare entries, checks per-line and per-country cash limits, and
  posts the complete set in one `postJournalBatch`. The whole-day staged clone is
  still the outer atomicity boundary.
- **Wealth integration.** `economicWealthInputs` now receives the fiscal result and
  uses wages plus welfare actually received as the income basis and income tax
  actually withheld as mandatory payments, annualized by the civil year. When
  daily income is zero and population is zero the input remains zero rather than a
  NaN.
- **Validation placement.** Country fiscal values and treasury-id uniqueness are
  validated in `assertValidCountryCurrencyState`; the owner account set, treasury
  reference, and fiscal region-ownership rule are validated in
  `assertValidEconomyState`; scenario construction applies the same ownership rule
  before creating state. The existing owner-equity, accounting-identity,
  non-negative, cash-conservation, and posting invariants are unchanged.
- **Accounting integration.** `income-tax` and `welfare-transfer` are public
  cash-neutral kinds in the semantic matrix; `treasury-cash` joins the designated
  cash set; the close owner order is pop blocks, buildings, countries, then the
  system owner. The M4b summary shape and four flow kinds are unchanged.
- **Compatibility and digests.** `WORLD_SCHEMA_VERSION = 9`,
  `SIM_VERSION = "0.9.0"`, `SAVE_FORMAT_VERSION = 1`, data version
  `m3-economy-v1` unchanged; schema-8/simulation-0.8.0 saves are rejected with no
  migration (D-013). Updated known-answer digests: empty world
  `eead21fcf318a512`, M2 campaign aggregate `5054423ef7e03e1c`, WPP validation
  `211784dc6b6627a6`, M3 structural world `302cf66cd1dbb692`. The M2/M3 digests
  changed because schema/simulation versions are hashed; countryless account sets
  and economic outcomes are unchanged.
- **Benchmark.** A dedicated M4c fiscal-day case runs warm-up and measured ticks on
  the scaled M3 production economy with synthesized shift assignments and one
  fiscal country, and gates on cross-run hash equality, treasury reconciliation,
  cash conservation, accounting identity, positive tax receipts, and positive
  welfare payments. Node results remain diagnostics; the mobile p95 target is
  **NOT EVALUATED**.
- **GDD alignment.** GDD v2.5 records the accepted M4c behavior, the conditional
  fiscal-account rule, the fiscal phase position, the wealth refinement, and the
  limitations. GDD v2.3/v2.4 remain unchanged as historical documentation.
- **Limitations.** Collection efficiency is fixed at 1.0; fiscal policy is not
  law-bounded or action-mutable; the tax is flat, wage-only, and residence-based;
  welfare is a single per-capita budgeted transfer with proportional funding
  reduction and no arrears/liability; corporate/consumption/land/tariff taxes,
  government services/procurement/employment, debt/interest, FX/inflation, and UI
  remain absent. Node benchmarks are not mobile-performance evidence.

### D-049 — SUSD monetary precision and phase-qualified cash results (approved)

- **Status:** approved for the M4c remediation and recorded before the
  implementation changes. It resolves the audit's R-2 precision gap. It does not
  change M4c tax, welfare, accounting, or close rules and does not add a new
  monetary system.
- **Authoritative arithmetic.** Authoritative SUSD balances and fiscal amounts
  remain continuous JavaScript `number` (IEEE-754 binary64) values. M4c does not
  introduce cent quantization, decimal rounding, a scaled-integer money type, or
  a new persisted representation. Tax is `incomeTaxRate × wages` over the
  settlement amounts; welfare is `welfareBudgetSUSDPerYear / daysInYear(year)`;
  proportional shares are computed directly in SUSD. The existing M3/M4a/M4b
  balances and tolerances are unchanged.
- **Tolerance, not rounding.** `MONEY_TOLERANCE_SUSD = 1e-6` is the existing
  relative/scale-aware tolerance for invariant comparisons such as accounting
  identity, cash conservation, reconciliation, and allocation-sum checks. It is
  not applied to authoritative balances as a rounding operation and must not be
  widened to conceal a conservation failure. Integer entity/count values continue
  to use exact checks.
- **Residual rule.** Deterministic welfare allocation is proportional to
  population in ascending pop-block order; the final recipient receives the
  exact remainder so the allocated amounts sum to the payable amount. A
  floating-point residual within `MONEY_TOLERANCE_SUSD` may be moved to the first
  recipient, and only tolerance-sized negative artifacts may be clamped to zero.
  No random draw selects the residual recipient.
- **Reporting boundaries.** Transient cash fields must state their measurement
  phase. Settlement results report `endingCashAfterSettlementSUSD` (before the
  fiscal phase); needs results report `budgetStartBeforeNeedsSUSD` and
  `budgetEndAfterNeedsSUSD` (after market/needs processing and before fiscal);
  M4c fiscal block results report `endingCashAfterFiscalSUSD`. The authoritative
  account ledger, not a transient result field, is the final cash source. Display
  formatting belongs to a future UI layer and is not applied to authoritative
  amounts.
- **Determinism.** Fiscal arithmetic performs operations in a fixed deterministic
  order (countries ascending id, blocks ascending id, per-block lines in block
  order, residual to the final block) and uses no transcendental functions. The
  existing cross-engine `Math.log` wealth limitation remains open and is not
  claimed to be solved by this decision. Known-answer tests cover representative
  values, residuals, proportional allocations, and rounding-sensitive cases.
- **Compatibility.** No schema/version change is required: the changed fields are
  transient settlement/needs/fiscal results, not persisted authoritative state.
  World schema 9, simulation 0.9.0, save format 1, and data version
  `m3-economy-v1` remain unchanged. A future persisted monetary representation
  change would require a new decision and schema/save migration review.

#### D-049 implementation notes (recorded with the M4c remediation)

- The transient fields were renamed as documented: `endingCashSUSD` became
  `endingCashAfterSettlementSUSD` on producer/household settlement and totals,
  `budgetStartSUSD`/`budgetEndSUSD` became
  `budgetStartBeforeNeedsSUSD`/`budgetEndAfterNeedsSUSD`, and fiscal blocks report
  `endingCashAfterFiscalSUSD`. No persisted schema field changed.
- Fiscal amounts remain unrounded `number` values. Tests assert a one-third
  posting stays `1/3`, a one-unit welfare budget allocates exactly to one, and
  tax/treasury/household reconciliation uses the authoritative accounts rather
  than formatted currency.
- `MONEY_TOLERANCE_SUSD` remains limited to invariant/reconciliation comparisons;
  no clamp or tolerance is used to manufacture a passing conservation result.
  The existing cross-engine floating-point limitation remains open.

### D-050 — Post-M4c finance roadmap staging (adopted direction; planned only)

- **Status:** adopted development-plan direction recorded with GDD v2.5. It assigns
  milestone ownership and an intended order for financial work that earlier
  revisions left unassigned or bundled into later milestones. It does **not**
  implement any of that work; the accepted baseline remains M0–M4c. It does not
  restate, reopen, or change D-048 or D-049.
- **Intended order:** `M4c → M5 → M5a → M5b → M6 → M7 → M7a → M8 → M8a → M9 →
  M10`. The existing M0–M10 identities and objectives are preserved. The
  intermediate stages are additions, not renumbering or completion of M5–M10, and
  the playable vertical slice remains M0–M7.
- **M5a — Profit distributions and enterprise remittances (after M5, before M5b
  and M6).** Distribute private business profits to designated
  owners/household capitalists, or retain them as business funds, under explicit
  deterministic rules; transfer actual state-owned enterprise profits to country
  treasuries through balanced journal entries; specify ownership, timing, account
  semantics, and available-funds constraints. A distribution or remittance must
  not exceed distributable profit or available cash and must preserve the
  accounting identity, determinism, and M4b close invariants. M5a depends on the
  ownership/enterprise structures M5 actually establishes; if they are missing,
  M5a must add them explicitly rather than assume them.
- **M5b — Public debt and deficit financing (after M5a, before M6).** Versioned debt
  contracts carrying issuer, holder, principal, interest/coupon terms, issue date,
  maturity, outstanding liability, and status; issuance with matching
  asset/liability accounting and actual cash transfers; interest accrual and
  payment; maturity, principal repayment, refinancing, arrears, and explicit
  default behavior; a clear separation of fiscal deficit, financing
  transactions, borrowing proceeds, interest expense, and principal repayment;
  explicit financing constraints with no unexplained money creation or invisible
  unpaid obligations; defined issuers and holders without a premature full
  banking or central-bank system. M5b precedes M6 so country AI operates against
  defined borrowing constraints, interest, maturities, and default consequences.
- **M7a — Annual accounting close and controlled corrections (after M7, before
  M8).** Annual finance summaries and explicit annual-period boundaries;
  year-end closing entries and account treatment consistent with the M4b monthly
  close; correct handling of partial years at campaign boundaries; controlled,
  auditable correction/reversal entries that preserve historical journal
  integrity instead of editing or deleting previously posted transactions;
  deterministic ordering, atomicity, validation, persistence, and accounting
  reconciliation. M7a completes the accounting lifecycle after the M0–M7 playable
  slice and is not a prerequisite for the initial playable release.
- **M8a — Inflation, FX dynamics, and monetary-policy foundations (after M8, before
  M9).** A documented inflation/price-level measure with explicit basket, weights,
  and time window; exchange-rate dynamics building on the multi-country economy
  and existing currency identities and valuations; a defined monetary-policy
  authority and controls using M8 institutions/laws where applicable; explicit
  causal mechanisms linking policy to economic or monetary outcomes; balanced
  accounting for any money-supply or credit change; deterministic timing, bounds,
  persistence, validation, and tests. These mechanisms must not be arbitrary
  scalar adjustments. A meaningful mechanism that requires a missing prerequisite
  must record that prerequisite rather than hide it inside M8a.
- **Slice and dependency constraints.** M7a and M8a are post-slice stages and are
  not prerequisites for the initial playable release. M5–M7 are not automatically
  blocked on the later monetary systems. M4c is unaffected; its treasury,
  income-tax, welfare, accounting, close, and persistence rules remain as
  recorded in D-048.
- **Not assigned.** Corporate/consumption/excise/land/property/tariff taxes,
  broader government services, procurement, employment, subsidies, banking,
  central banking, and any other finance work not listed above remain
  unassigned.
- **Consequence.** Future tasks may be assigned these stages in the recorded order
  with their own acceptance criteria. No runtime behavior, schema field, save
  version, benchmark gate, or UI support exists for any of them until implemented
  and accepted. GDD v2.5 §17.3–§17.4 and `README.md` record the plan as planned,
  not current.

### D-051 — M5 multi-region, multi-country, multi-market architecture

- **Status:** implemented with the M5 milestone. It extends the accepted M4c
  baseline; it does not change M4a/M4b/M4c behavior or reopen D-045–D-050.
- **Ownership and membership sources of truth.** `Country.regionIds` remains the
  sole authoritative country-to-region ownership mapping; `Region` still has no
  `countryId`. `Market.regionIds` is the authoritative market membership and
  `Region.marketId` is validated to agree with it. A region belongs to exactly one
  market when a world has markets. A country's regions must all belong to one
  market in M5: mixed customs-zone membership would need an explicit rule that is
  not part of this milestone.
- **Multi-market clearing.** Every market is cleared exactly once per economic
  day, in ascending market-id order. Its buyers are the population blocks in its
  regions and its sellers are the buildings in those regions. Production, input
  reservations, storage capacity, final overflow, prices, and inventory
  conservation are market-scoped. Household and production demand are built from
  opening cash for the block's/building's own market, so shared-market regions
  cannot double-count goods, demand, or inventory. Settlement merges all market
  transaction batches into one atomic posting batch and pays wages/upkeep once per
  day. Existing single-market worlds keep their prior ordering and outcomes.
- **Trade scope.** M5 implements multiple markets and shared/trade-connected
  markets (regions of several countries pooled into one market). It does **not**
  implement inter-market physical trade, tariffs, transport charges between
  markets, or a rest-of-world external-trade account: GDD v2.5 §7.4/§7.5 does not
  specify those mechanics, and inventing them was outside M5. Cross-region and
  cross-country goods transactions occur inside a shared market and are settled
  through the existing M3e transaction conventions. Goods are never created by
  trade.
- **Border policy state.** `Country.immigrationOpen` is added as provisional
  runtime state. It is scenario-initialised and nothing mutates it in M5. Domestic
  migration and domestic cross-region labor are always allowed; cross-country
  migration and cross-country employment require the destination country's
  `immigrationOpen` flag. Emigration is unrestricted in M5. The GDD requires
  international migration to be permitted by an open-border law or event; no law
  system exists yet, so the flag is the explicit scenario-level substitute. M8
  may replace it with enacted law.
- **Ownership coherence.** Buildings and their owning household must belong to the
  same country; a building's owner account must be a pop-block household-cash
  account. Countryless multi-region economy fixtures remain valid, with
  unrestricted access only among countryless regions.
- **Persistence and versions.** `Country.immigrationOpen` is persisted, so world
  schema becomes **10** and simulation version **0.10.0**. Save format remains 1.
  Schema-9/simulation-0.9.0 saves are rejected with an actionable error and no
  migration (D-013). `dataVersion` remains `m3-economy-v1`; see D-053 for the
  justification for adding historical scenario content without changing the
  version.

### D-052 — M5 migration and geographic labor mobility

- **Status:** implemented with M5. Coefficients are **provisional**, not
  calibrated.
- **Cadence and placement.** Migration runs on the first civil day of a month,
  never on the scenario start day or terminal boundary. It runs after the initial
  employment allocation for the day and before the market phase; if any flow
  occurs, employment is marked dirty and refreshed again in the same day so
  released workers are reallocated and new residents can take jobs immediately.
- **Flow accounting.** A flow moves an integer number of people between two
  existing population blocks with the same profession in different regions. It
  splits the source's authoritative single-year sex/age cells proportionally with
  deterministic largest-remainder allocation (keyed `migration.age-remainder`
  ties), moves each migrant's pro-rata share of household cash through a balanced
  `migration-transfer` posting, and conserves world population exactly. No
  migration block is created; a destination block must already exist. Fractional
  birth/death remainders remain with their original blocks.
- **Attributes on migration.** Destination literacy, wealth, and militancy are
  population-weighted merges of source and destination values. The destination
  block's unmet-needs history counters remain authoritative for the merged block;
  migrants do not inherit the source block's local needs history. Source
  attributes are unchanged. These are the smallest compatible rules GDD v2.5
  leaves open.
- **Eligibility and pressure.** A destination must be accessible: same country
  for internal migration, or a destination country with `immigrationOpen` for
  international migration. Monthly pressure is
  `0.7 × max(0, destination vacancy rate − source vacancy rate) + 0.3 × max(0,
  wealth gap / 100)`, where vacancy rate is unfilled job slots divided by
  eligible regional workforce (clamped 0..1). The migrant fraction is
  `min(0.01, pressure × 0.01)` of the source population. A source block moves at
  most once per month. Destinations are ranked by pressure with keyed destination
  ties; sources are processed in keyed order. A destination region may receive at
  most 1% of its start-of-month population in one month; this stands in for the
  transport/housing constraints the GDD mentions until those systems exist.
- **Labor access.** Employment allocation is domestic-first: a country's own
  residents fill its vacancies in a first pass; only afterward may residents of
  other countries fill remaining vacancies in a country whose `immigrationOpen`
  flag is true. A resident may take a job in any region of their own country.
  Countryless regions form one unrestricted area. This prevents an unconstrained
  global labor pool and ensures an open border cannot displace a country's own
  workforce in the allocation. Assignments remain subject to existing
  qualification, participation, job-slot, and workforce caps.
- **Validation and atomicity.** Unknown, duplicated, or contradictory destination
  references, same-region/same-block flows, profession mismatches, closed
  borders, and over-population requests are rejected before mutation. The phase
  stages its population and finance changes and restores the supplied world if a
  flow fails. The whole-day tick staging remains the outer atomic boundary.
- **Explicitly not included.** No profession promotion/demotion, free migration
  pool, fixed population increment, remittances, or border-law enactment is
  added. M5 migration is aggregate, caused by documented vacancy and wealth
  gaps, and reversible in principle.

### D-053 — M5 historical data pipeline and eight-polity sample

- **Status:** implemented with M5. The sample is **provisional** and is not a
  complete historical reconstruction or a world total.
- **Architecture.** Compact source-annotated tables live under
  `packages/data/data/historical/` and are loaded and validated by
  `packages/data/src/historical.ts`. Static goods/professions/buildings/needs/
  demography remain in the existing validated definition files. The loader
  expands block totals to five-year age/sex inputs, allocates deterministic block,
  building, and account ids, and returns an `EconomyScenarioDef`. No
  country-specific historical exception is embedded in simulation logic.
- **Input contracts and validator.** The validator checks duplicate ids/tags/keys,
  country/region/market references, exactly-one owner and exactly-one market,
  one-market-per-country, unknown professions/building definitions, non-positive
  or impossible populations/levels/workers, fiscal/currency ranges, source
  metadata, calibration metadata, and source-backed/provisional status. Errors
  are aggregated and sorted deterministically. Each country must declare one
  `totalPopulation` target and one provisional `peasantPopulationShare` target,
  and the authored data must fall within the declared tolerances.
- **Eight polities.** United States, United Kingdom, German Empire, France,
  Russian Empire, Empire of Japan, British India, and Brazil: 16 regions, 5
  markets, 64 population blocks, 81 building instances, and 8 currencies. Three
  markets span multiple countries (North Atlantic, Continental Europe, Asian
  trade). Market groupings are an authored simulation simplification, not
  historical trade agreements.
- **Calibration status.** Population totals are rounded, low/medium-confidence
  national estimates from OWID/Maddison material and are checked against declared
  source-backed targets. Occupation composition is an authored
  household-composition proxy checked against **provisional** low-confidence
  ranges derived from broad agricultural-employment reconstructions. It is not the
  GDD's employed-worker share and cannot support a century-scale occupation-trend
  claim. M5 has no profession-promotion mechanism, and the M3 production/needs
  parameters are not historically calibrated. Age structure uses one shared
  provisional 1900 world profile; country-specific age structures are not
  authored. Currency valuations are explicitly unavailable rather than invented.
  No simulation code reads calibration totals to force outcomes.
- **Account-id ranges.** Historical loading uses `1000 + blockIndex` for household
  cash accounts, `100000 + buildingIndex` for operating cash,
  `200000 + countryId` for treasuries, and `300000` for the single system-reserve
  account. These are deterministic and collision-checked by scenario validation.
- **Data version.** `dataVersion` remains `m3-economy-v1`. The historical pipeline
  adds new scenario content without changing any existing definition or the
  meaning of any existing scenario; the version is a compatibility identity, not
  a content hash. This is the intentional justification required by the
  data-version contract.

### D-054 — M5 numerical robustness for large economies

- **Status:** implemented with M5.
- **Physical conservation tolerance.** The market and production inventory
  identity is
  `closing = opening + production − input use − household use − recorded loss`.
  When the gross terms are large and nearly cancel, a binary64 residual can
  exceed a tolerance scaled only by the near-zero result. The tolerance is scaled
  by the gross terms as well as the result. This is a floating-point comparison
  fix, not permission to lose goods: the relative tolerance remains
  `QUANTITY_TOLERANCE` (1e-9) against the largest gross term.
- **Wage affordability at binary64 precision.** Proportional wage allocation can
  exceed an employer's cash by one or two ulps even when every amount is finite.
  When the paid total exceeds the employer balance, the settlement now reduces a
  payment by at least one representable ulp until the total is genuinely no
  greater than the balance. The difference is reported as unpaid wages, never as
  debt, negative cash, or unexplained money. M4c cash conservation and
  non-negative balance invariants are unchanged.
- **No quantization.** D-049's continuous SUSD policy is preserved; no cent
  rounding, epsilon-as-amount, or manufactured conservation result is introduced.

### D-055 — M5 benchmark scope and reported limitations

- **Status:** implemented with M5.
- The benchmark harness measures a representative eight-polity sample
  (8 countries, 16 regions, 5 markets, 64 blocks, 81 buildings), a serialization/
  validation round trip, the monthly migration phase, and a doubled authored
  stress fixture (128 blocks, 162 buildings). It reports average/p50/p95/p99.
- A full 36,524-tick economic campaign is **not** executed in the harness; its
  cost is projected from the measured sample and reported explicitly as a
  projection. The M2 200-block p95 gate remains unchanged and is still reported
  from a single run; its documented variance remains a limitation.
- Mobile performance remains **NOT EVALUATED**: no device release build was run.

### D-056 — M5a profit distribution, retained profit, and state-enterprise remittances

- **Status:** implemented with M5a. It extends M5; it does not change M4b close
  semantics or M4c fiscal behavior.
- **Policy state.** `World.profitDistribution` is persisted scenario-initialised
  policy: `enabled`, `privatePayoutRate`, `stateRemittanceRate`, each rate in
  0..1. Defaults are disabled, 0.5, and 1.0. Legacy M0–M5 fixtures omit the
  policy and therefore keep their previously accepted behavior; the shipped M5
  historical campaign enables it with the same documented rates. This is not a
  player/AI action control.
- **Account structures.** Every building in an enabled world owns one
  `retained-profit` (equity) account in addition to its existing owner-equity,
  revenue, expense, and operating-cash accounts. Retained profit is therefore
  distinguishable from owner capital and from the current period's revenue/expense
  balances. Owner equity remains the owner-capital account.
- **State ownership.** `BuildingInstance.ownerKind` may be `"private"` or
  `"state"`. A private owner's `ownerAccountId` must be its pop-block
  household-cash account; a state owner's must be the owning country's
  treasury-cash account, and that country must own the building's region. State
  ownership requires the policy to be enabled. Building definitions must permit
  the selected ownership kind.
- **Timing and profit measure.** The phase runs once per economic month-end,
  immediately after the atomic M4b close, before the day advances. The frozen
  pre-close period summary supplies each building's period net result:
  `sales-revenue − input-expense − wage-expense − upkeep-expense`. This is the
  already-recognized period result, not a new revenue/expense flow. A nonzero net
  result is reclassified from owner equity to retained profit (profit) or from
  retained profit to owner equity (loss) using the `profit-retention` kind.
- **Distribution and remittance.** After reclassification, a building distributes
  `rate × max(0, retainedProfit)` where the rate is `privatePayoutRate` for a
  private owner or `stateRemittanceRate` for a state owner. The payout is capped by
  the building's actual post-close operating cash. The remainder stays in retained
  profit. A cash-capped shortfall is retained, never deferred, unpaid, or recorded
  as a liability. Losses are carried as negative retained profit and are offset by
  later profits; no distribution occurs while retained profit is non-positive.
- **Posting semantics.** `profit-retention` moves value only between one building's
  owner-equity and retained-profit accounts. `profit-distribution` moves cash from
  the building to the designated private owner household and credits that
  household's owner equity. `state-enterprise-remittance` performs the analogous
  transfer to the owning country's treasury cash and country owner equity. All
  three are cash-neutral overall, have no revenue/expense semantic-matrix legs, do
  not add a flow kind to the M4b summary, and are structurally validated for exact
  leg counts, matching owners, matching amounts, and opposite sides where
  applicable.
- **Atomicity and guards.** The phase validates the world policy, the closed
  month-end, the latest published summary, the close result, and the duplicate
  marker before staging anything. All entries are applied to a finance clone; the
  clone is validated for accounts, postings, summaries, accounting identity, and
  aggregate designated-cash conservation before it replaces `world.finance`. A
  previously applied close result is rejected without mutation. The whole-day tick
  staging remains the outer atomic boundary.
- **Explicit non-goals.** No corporate/dividend/capital-gains tax, securities
  market, share issuance/trading, banking, debt, deficit financing, arbitrary
  player controls, or M5b behavior. Government receipts from state enterprises are
  not income-tax revenue and do not enter `governmentPeriodTotals`.
- **Persistence and versions.** World schema is **11**, simulation version
  **0.11.0**, save format **1**. `dataVersion` remains `m3-economy-v1` because the
  policy is scenario-provided content and no existing definition or scenario
  meaning changed. Schema-10/simulation-0.10.0 saves are rejected; no migration.
  Known-answer digests are re-baselined because the schema version and policy
  object are hashed state.

### D-057 — M5b public debt, deficit financing, and explicit default

**Context.** M5b must add versioned public-debt contracts, issuance, interest,
maturity/repayment, refinancing, arrears, and explicit default while separating the
fiscal deficit, financing flows, borrowing proceeds, interest expense, and principal
repayment. The GDD delegates the exact holder set, terms, financing rule, and default
consequences to the implementation stage. M5b must not introduce banking, a central
bank, bond-market pricing, monetary issuance, or external investor pools.

**Decision.**

- **Issuers and holders.** A country is the only issuer. A contract's holder is an
  explicitly identified existing simulated entity: another country's treasury-cash
  account or a pop-block household-cash account. A country may not hold its own
  debt. This provides domestic and foreign creditors without inventing a bank,
  external fund, or unexplained cash source.
- **Policy state.** Each country gains a scenario-initialised `debt` policy:
  `enabled`, `creditorKind` (`country`/`popBlock`), `creditorId`,
  `annualCouponRate`, `termDays`, `maxOutstandingPrincipalSUSD`,
  `refinanceOnMaturity`, and `arrearsGraceDays`. The default is disabled with a
  zero ceiling, so M0–M5a fixtures and their account sets are unchanged. Rates,
  terms, ceilings, and grace periods are provisional structural inputs, not
  calibrated or player/AI controls.
- **Contract state.** `FinanceState.debtContracts` persists contract version 1,
  issuer country, holder kind/id, original principal, outstanding principal,
  annual coupon, issue day, maturity day, accrued interest, status
  (`active`/`arrears`/`repaid`/`defaulted`), and arrears start day.
  `FinanceState.nextContractId` is the deterministic allocator. Maturity is capped
  at the campaign terminal boundary.
- **Accounts.** Only when at least one country enables debt (or contracts exist),
  every country receives `debt-liability`, `interest-payable`, and
  `interest-expense` issuer accounts plus `bond-asset`, `interest-receivable`, and
  `interest-income` holder accounts; every pop block receives the three holder
  accounts. Disabled worlds have no debt accounts. This keeps legacy account sets
  unchanged while allowing any country/household to act as a creditor.
- **Issuance.** Issuance debits issuer treasury cash and credits issuer debt
  liability, and debits holder bond asset and credits holder cash. It is
  cash-neutral overall, requires the holder to have actual cash and the issuer to
  have outstanding-principal headroom, and never creates money. Explicit issuance is
  exposed as a validated atomic operation and must use the country's designated
  creditor; automatic issuance uses the same path.
- **Interest.** Interest accrues daily on outstanding principal using the actual
  civil year length (`365` or `366`), as issuer interest expense/interest payable
  and holder interest receivable/income. Accrual starts the day after issuance.
  Coupons are paid at each civil month-end, and accrued interest is also settled at
  maturity. Payment reduces interest payable and issuer treasury cash, and increases
  holder cash while reducing holder interest receivable. Unpaid interest is explicit
  accrued liability/receivable and sets `arrears`.
- **Maturity and refinancing.** On the maturity day, accrued interest is settled
  first. If the issuer policy allows refinancing and the outstanding-principal
  ceiling still holds, a replacement contract is issued to the same holder and the
  old principal is repaid in the same batch, showing both sides. Otherwise available
  treasury cash repays principal. A partial or unpaid principal leaves the contract
  outstanding with `arrears` status and an explicit arrears start day.
- **Arrears and default.** A contract remains `arrears` while due principal or
  interest is unpaid. After `arrearsGraceDays` from the first arrears day, the
  remaining principal and accrued interest are written off explicitly:
  the issuer debits debt liability/interest payable and credits owner equity; the
  holder credits bond asset/interest receivable and debits owner equity. The contract
  becomes `defaulted` with zero outstanding. No revenue/expense flow is created, no
  cash moves, and no obligation is silently erased. Arrears can be cured by later
  principal repayment before the grace period ends.
- **Deficit and financing rule (superseded by D-066).** At each month-end, after
  daily interest accrual and before the M4b close, each debt-enabled country computed
  its accrued fiscal deficit as
  `welfare-expense + interest-expense - income-tax-revenue`. D-066 replaces this with
  the liquidity-based financing requirement. It may issue
  new debt up to the smaller of that deficit, the designated creditor's actual cash,
  and outstanding-principal headroom. Borrowing proceeds are a financing inflow, not
  revenue. Any deficit that cannot be financed is reported as
  `unfinancedDeficitSUSD`; no invisible liability is created. M4c's welfare
  shortfall rule is not changed, so a liquidity shortage before month-end can still
  leave welfare underpaid.
- **Reporting and flow kinds.** `governmentPeriodTotals` adds
  `interestExpenseSUSD` and computes `netFiscalResultSUSD` as tax revenue minus
  welfare and interest expense. Borrowing proceeds and principal repayment are
  financing/balance-sheet operations outside the four M4b flow kinds. The M4b close
  still zeroes all revenue/expense accounts, including interest, into owner equity.
- **Atomicity and validation.** The debt phase clones finance, applies accrual,
  financing, coupons, maturities, refinancing, and default, then validates accounts,
  contracts, postings, summaries, accounting identity, and aggregate designated-cash
  conservation before publication. The explicit issuer stages and validates a
  candidate world before replacing finance. Any error leaves the published world
  unchanged. Contract, policy, holder, self-creditor, status, principal, interest,
  and maturity invariants are validated on load and after every phase.
- **Persistence and versions.** World schema **12**, simulation version **0.12.0**,
  save format **1**. `dataVersion` remains `m3-economy-v1`; the policy is
  scenario-provided and no existing definition changed. Schema-11/simulation-0.11.0
  saves are rejected with no migration. Known-answer digests are re-baselined
  because schema 12, `Country.debt`, and finance contract fields are hashed state.
- **Explicit non-goals.** No commercial banking, deposit money, central bank,
  monetary issuance, bond-market pricing or auctions, derivatives, external investor
  pools, debt-to-GDP targeting, debt mutualization, interest taxation, or
  player/AI debt actions. M5b does not add an external sector or change M4c/M5a
  behavior when debt is disabled.

**Rejected alternatives.** (a) Borrowing from a new aggregate domestic-credit fund
would create an unexplained cash source. (b) Deferring welfare into an implicit
payable would contradict M4c's explicit shortfall rule and create an invisible
obligation. (c) Immediate default at maturity without an arrears window would not
exercise the required explicit arrears state. (d) Counting principal repayment or
borrowing as revenue/expense would corrupt the four-flow summary and fiscal result.

### D-058 — M6 deterministic country AI v1 and shared action validation

**Context.** M6 must add a rule-based country AI that can govern the eight-polity
sample without invalid actions or hidden-information access, plus an action
validation path shared with a player. The GDD delegates the exact rules,
persistence shape, information boundary, and action subset to implementation.
Most GDD priority categories (construction, infrastructure priority, laws,
security, diplomacy) refer to systems that do not exist yet; inventing those
systems would exceed M6.

**Decision.**

- **Implemented action set.** M6 implements exactly one action kind,
  `set-fiscal-policy`, which sets the existing M4c `incomeTaxRate` and
  `welfareBudgetSUSDPerYear` together. The player and the AI pass through the
  same `validateCountryAction` and `applyCountryAction` operations. An action is
  rejected before mutation; a changed candidate country is published only after
  the complete candidate world validates.
- **Excluded actions.** Building queues/construction, infrastructure or production
  priority, laws, debt actions, diplomacy, and military actions are not
  implemented. Their underlying systems are absent or explicitly outside the
  accepted M5b boundary. The action union is extensible but no speculative action
  is accepted at runtime.
- **Persisted policy and state.** `World.countryAI.enabled` is a
  scenario-provided enable flag, default false, so legacy M0–M5b fixtures keep
  their behavior. Each `Country` gains a fixed-size `ai` state with
  `nextEvaluationDay`, `currentGoalId`, `lastDecisionDay`, and a bounded
  `lastActionSummary`. There is no action log, per-day history, or growing
  planning buffer.
- **Cadence and staggering.** A country evaluates when its persisted
  `nextEvaluationDay` is due. The first evaluation is the first day strictly
  after the scenario start whose absolute day index is congruent to the stable
  country id modulo seven; subsequent evaluations are seven days apart. The
  terminal 2000-01-01 boundary never evaluates. This preserves the authored
  policy on the start day and spreads eight sample countries across the week.
- **Information boundary.** `buildCountryAIObservation` exposes only own-country
  fiscal policy, treasury cash, region ids, own population blocks and their need
  and unrest indicators, the latest closed own-country fiscal totals, and own
  debt exposure. It excludes other countries' treasury/fiscal/debt state, other
  countries' population blocks, household account balances, future events, and
  the world seed. `planCountryActions` takes only that observation and is pure.
- **Decision rules.** Priority is solvency before relief. A country is under
  solvency pressure when treasury cash is below six months of observed annual
  outlays or, once a month has closed, observed annualized outlays exceed
  annualized income-tax revenue. It then raises the income tax by one percentage
  point up to a provisional 25% self-cap and cuts welfare to the affordable
  revenue share. Hardship triggers when at least 5% of own population has seven
  consecutive unmet subsistence days or population-weighted militancy is at least
  0.15. The relief target sets income tax to at least 5% and welfare to 25% of
  observed annualized tax revenue. Treasury reserves are a solvency buffer, not an
  ongoing spending target, so the welfare target is stable once revenue is
  observed; a new welfare action is suppressed unless the target changes by at
  least 10%, which prevents month-to-month revenue noise from producing weekly
  actions. An early prototype that drew down surplus each evaluation kept
  escalating welfare and was rejected. The AI only raises or maintains tax; it
  never borrows, issues money, changes debt policy, or creates a spendable pool.
- **Determinism.** No random draw is used in v1. Countries and blocks are
  processed in ascending id order, policy rates are rounded to six decimals and
  welfare to cents, and no-op changes are suppressed by documented tolerances.
  Identical state and day produce identical proposals and hashes.
- **Failure behavior.** An AI proposal that fails the shared validator is counted
  in `diagnostics.invalidActionCount`, recorded as a bounded warning, and
  skipped; it cannot corrupt the day. A player action that fails the validator
  throws and leaves the world unchanged. Tests assert zero rejected AI proposals
  on the sample campaign.
- **Sample enablement.** The M5 historical scenario sets `countryAI.enabled =
  true`; all synthetic legacy fixtures omit it and remain disabled. This is a
  scenario policy change, not a change to existing definitions, so the data
  version remains `m3-economy-v1`.
- **Persistence and versions.** World schema **13**, simulation version
  **0.13.0**, save format **1**. Schema-12/simulation-0.12.0 saves are rejected
  with no migration. Known-answer digests are re-baselined because
  `World.countryAI` and `Country.ai` are hashed state.
- **Benchmarks.** The default Node benchmark adds a 14-tick representative AI
  sample and a doubled-block/building AI stress fixture. The opt-in
  `pnpm run bench:campaign` executes all 36,524 ticks and reports p50/p95/p99,
  bounded state checkpoints, AI proposal counts, and the final save size. The
  mobile p95 target remains **NOT EVALUATED**; Node timings are not mobile
  evidence.

**Rejected alternatives.** (a) Letting the AI mutate `World` directly through a
second private path would violate the “same validation as the player” rule.
(b) Giving the AI the live world object would make hidden-information access a
convention rather than a testable boundary. (c) Adding construction queues or
laws to make the priority list look complete would implement unassigned systems
and speculative mechanics. (d) Using a global random stream for AI choice would
break keyed determinism. (e) Treating missing pre-close revenue as zero caused
avoidable tax increases in an early prototype and was replaced by an explicit
“unknown until first close” rule. (f) A per-evaluation action log would grow
without bound and duplicate the audit posting buffer.

### D-059 — Bounded revalidation of immutable monthly summaries on the tick path

**Context.** The M6 full-campaign benchmark initially took about 108 seconds for
500 AI-enabled days and grew with the number of closed months. Profiling showed
that repeated validation of every immutable `FinancePeriodSummary` dominated the
tick cost: each tick validated the complete growing history three or more times,
even though summaries are created only by the atomic M4b close and are never
mutated afterwards.

**Decision.** Add an explicit `PeriodSummaryValidationMode` with `"all"` and
`"latest"` modes. `assertValidWorld`, construction, save encoding/decoding, the
monthly close, and the profit-allocation phase keep complete validation. The hot
tick path uses `assertValidWorldForTick`, which validates the newest summary, its
contiguity links, the calendar boundary, the accounting identity, and the
closed-through rule, but does not reparse every older immutable summary.
`cloneWorld` and `runEconomicDay` accept an internal skip-validation option only
when their caller has already validated the same staged world.

**Consequences.** Simulation results and hashes are unchanged; the 500-day probe
fell from about 108 s to about 66 s. A corrupted older summary is still rejected
at every save/load/construction boundary and by `assertValidWorld`; a focused
test proves `assertValidWorldForTick` accepts the corruption while
`assertValidWorld` and serialization reject it. This is a validation-cost
optimization, not a relaxation of the published-state contract. A second profile
of the 10-year campaign showed the structural clone deep-copying every closed
summary's account totals on every tick. Because closed summaries are immutable
after the atomic M4b close, the hot-path `cloneWorldForTick` shares the summary
objects and copies only the array; the staged close appends a new summary to its
own array and never edits an older one. Public `cloneWorld` retains full
summary-deep-copy isolation, which the accepted M4b tests require. This removes
the remaining per-tick growth with the length of the monthly history without
weakening the public clone contract. The executed full campaign then completed in
102.63 minutes at p50 144.3 ms / p95 185.8 ms / p99 1,024.0 ms, with constant
accounts, 256 capped postings, 1,200 bounded summaries, and zero invalid AI
actions.

**Rejected alternatives.** (a) Keeping full per-tick validation and only
projecting the campaign would not satisfy M6's full-campaign requirement.
(b) Dropping older summaries would break the accepted M4b immutable monthly
history and the four-flow ledger. (c) Caching a validation result in module-level
state would add hidden global state and make replay order-dependent. (d) Copying
immutable summaries on every tick preserves a stronger isolation property but
makes the full campaign scale with the square of elapsed months; the hot-path
clone shares them because the close is the only writer and it appends, while the
public clone keeps deep isolation.

### D-060 — M7 versioned worker protocol, immutable snapshot bus, and UI boundary

**Context.** M7 must deliver a playable Expo/React Native shell whose UI never
reads or mutates the live simulation world. The GDD requires a worker proof of
concept, start/pause/step/action commands, snapshots, save/load, and a versioned
thread protocol. No mobile worker package had been selected, and the repository
had no `packages/sim-worker`.

**Decision.**

- **Package split.** Add `packages/sim-worker`. Its root export is app-safe:
  protocol types/constants, snapshot types, pure selectors, and no simulation
  imports. The host, snapshot builder, persistence codec, and worker entries are
  subpath exports. `packages/app` imports only the app-safe root/persistence; the
  architecture test rejects `@century/sim`/`@century/data` imports in app source.
- **Protocol version 1.** Commands are `START`, `PAUSE`, `STEP`,
  `SET_SPEED`, `APPLY_ACTION`, `REQUEST_SNAPSHOT`, `SAVE`, `LOAD`, and `SHUTDOWN`,
  each with a stable command id. Events are `READY`, `SNAPSHOT`, `STATE`,
  `ACTION_RESULT`, `SAVE_RESULT`, `LOAD_RESULT`, `ERROR`, `FATAL`, and `SHUTDOWN`.
  Untrusted messages are parsed and rejected before dispatch.
- **Ownership.** `SimulationHost` owns the world and applies commands only between
  completed ticks. It exposes immutable snapshots; the app never receives the
  world, finance accounts, typed arrays, or mutable references.
- **Snapshot boundary.** Snapshots contain eight country summaries, 16 region
  summaries, five market price/stock summaries, eight goods, at most 12 monthly
  finance periods, and bounded diagnostics. They are recursively frozen and are
  roughly 12 KiB in the eight-polity sample.
- **Transports.** Web runs the same generated bundle in a Web Worker created from
  a Blob URL. Native iOS/Android runs it in a deliberately hidden
  `react-native-webview`, whose JavaScript context is separate from the React
  Native UI thread; commands use `injectJavaScript` and responses use
  `ReactNativeWebView.postMessage`. Node `worker_threads` is the headless proof of
  concept. No platform-specific worker dependency is added.
- **Timing.** The worker driver uses wall-clock only to decide how many complete
  deterministic ticks to run. It caps each pump at four ticks and emits snapshots
  at most every 100 ms. Saving does not include the driver accumulator, so
  save/resume remains deterministic in complete ticks.
- **Actions.** The UI sends only `set-fiscal-policy`; the host stamps the current
  day and uses the accepted `validateCountryAction`/`applyCountryAction` path. An
  invalid action returns validation errors and leaves state unchanged.
- **Save/load.** The wire format is still the canonical simulation save string.
  The app compresses it with gzip and base64 at the platform-storage boundary
  (`century-save-gzip1:`), then uses AsyncStorage. This changes storage
  representation, not the canonical save, checksum, hash, or compatibility.
- **Generation.** The browser bundle and the validated eight-polity scenario are
  committed as generated assets; a script regenerates them. The worker bundle is
  produced with esbuild from sim/typescript source and has no Node dependency.
- **Failures.** Malformed commands emit `ERROR`; a failed tick pauses the host and
  emits `FATAL`; a failed load leaves the previous world intact; shutdown rejects
  later commands.

**Rejected alternatives.** (a) Running the simulation on the RN JS thread would
violate the off-UI-thread proof-of-concept. (b) Adopting an unmaintained native
worker package without a device POC would lock in unverified native
configuration. (c) Letting the app import `@century/sim` for derived values would
collapse the snapshot boundary. (d) Sending the mutable world or typed arrays
over the bridge would violate the immutable-snapshot contract. (e) Including the
driver accumulator in saves would make wall-clock scheduling part of authoritative
state and break reproducibility. (f) Compressing inside the simulation would
change the canonical save format and compatibility contract.

### D-061 — M7 Expo shell, screen scope, and unverified native/device acceptance

**Context.** M7's definition of done includes a release build on iOS and Android,
UI snapshot-only reading, pause/speed/actions/save/load, and measured frame rate
and on-device tick performance. The execution environment has no Xcode, Android
SDK/emulator, or reference device.

**Decision.**

- Use Expo 58 / React Native 0.88 / React 19.3 for the app. Web uses
  `react-native-web`; native uses `react-native-webview` and AsyncStorage.
- Implement the six specified screens: Map, Country Dashboard, Budget, Population
  and employment, Markets and prices, and Ledger/financial summary. Keep the
  selected country/region and tab in React state; use a small React context rather
  than adding a state-library dependency.
- The map is a stylized **16-region vector grid** matching the authored sample.
  The 500-region production map, pan/zoom, occupation overlays, and country-level
  geometry are not implemented; the screen states this. Charts are limited to a
  compact net-fiscal history bar strip because GDP, annual history, and per-day
  chart history do not exist.
- The verified web interaction path is headless Chromium Pixel 5 emulation:
  start/pause/step, fiscal action, gzip save, load restoring the saved day and
  policy, and month-end ledger rendering.
- **Unmet acceptance:** native iOS/Android **release builds** require Xcode and
  Android SDK/tooling that are absent. Real-device frame rate, cold start, memory,
  battery, and on-device tick p95 are **NOT EVALUATED**. Expo web export and
  iOS/Android Hermes JS bundle exports were produced, but a JS bundle is not a
  native release build. This milestone is therefore delivered with documented
  acceptance exceptions, not a claim that mobile acceptance passed.
- Node measurements are diagnostics only: the worker-host complete tick plus
  snapshot was p95 80.46 ms on the recorded desktop, far above the 8 ms mobile
  target; the worker keeps the UI off the simulation thread but cannot by itself
  satisfy the mobile tick target.
- The uncompressed full-campaign save-size limit from M6 remains. App-layer gzip
  reduces the sampled 353.5 KiB save to 72.2 KiB; the 18.76 MiB full-campaign save
  was not compressed/reopened on a device. Canonical save compatibility is
  unchanged.

**Rejected alternatives.** (a) Claiming a mobile target passed from Node or a
desktop web export would be false. (b) Adding a native worker package without a
device POC would violate GDD §14.2. (c) Fabricating 500-region geometry or pan/zoom
without map data would misrepresent the authored sample. (d) Adding a large chart
library before annual history exists would advertise data the simulation does not
retain. (e) Storing the uncompressed 18.76 MiB save in AsyncStorage without
measuring platform limits would risk silent save failure; the storage codec is
compressed and round-trip tested.

## D-062 — Post-M7 historical scenario feasibility calibration

**Status:** implemented in the post-M7 remediation batch. **Provisional**, not
historical calibration.

**Problem.** The M5 eight-polity sample used the legacy M3 catalog unchanged:
subsistence required fish and livestock but the sample instantiated no fishery or
ranch; grain capacity was ~65% of the authored 0.9 kg/capita/day requirement;
food-products capacity was ~9%; clothing capacity was ~12% of basic+comfort
demand; and every authored recipe had negative net value at base prices and base
wages. The only executed full campaign consequently reported a fall from
648,210,406 to 85,487,776 people. This was a data/scenario contradiction, not a
ledger failure: the accounting identities balanced.

**Decision.** Keep the legacy `goods.json`, `buildings.json`, `professions.json`,
and `m3_needs.json` as the accepted M2–M4 fixture baseline. Introduce a separate
historical catalog (`historical_goods.json`, `historical_buildings.json`,
`historical_professions.json`, `historical_needs.json`) used only by the
`m5-eight-polities` scenario. The historical catalog is a provisional structural
calibration:

- Needs: grain 0.527, food-products 0.03, fish 0.03, livestock 0.03 kg/capita/day;
  basic clothing 0.01 and comfort clothing 0.002 garments/capita/day.
- Recipes: farms/ranches/fisheries produce more per worker; food processing is a
  2:1 grain-to-food process; textile and clothing recipes have realistic
  value-added; peasant/laborer/owner professions are separated where local labor
  composition requires it.
- Building levels: allocated **per market** in proportion to regional population,
  with market totals sized to that market's own demand. Shared markets pool
  production; there is no inter-market trade.
- Prices: base prices are higher value-added prices; opening prices are the
  documented lower bound (`0.25 × base`) for every good. Opening intermediate
  stock (grain, cotton, wool, textiles) covers one day of demand so the
  one-day production-chain lag does not prevent processing on day 0.
- Operating cash: input-using buildings hold three days of wage cover; farms,
  ranches, and fisheries hold a smaller buffer and rely on same-day sales.
- Participation and wages: peasants 0.60/60 SUSD/yr, laborers 0.40/130,
  clerks 0.55/250; private payout rate 1.0 so the absence of an investment
  system does not leave profits stranded inside building cash.

**Before/after (world totals, nominal units/day).**

| Good | Before capacity | Before need | After capacity | After need |
|---|---:|---:|---:|---:|
| Grain (household + processing input) | 380.8 M | 998.2 M (583.4 household + 414.9 processing) | 381.5 M | 380.9 M |
| Food products | 4.65 M | 51.9 M | 19.66 M | 19.45 M |
| Fish | 0 | 19.4 M | 19.5 M | 19.4 M |
| Livestock | 0 | 19.4 M | 19.5 M | 19.4 M |
| Clothing (basic + comfort) | 0.75 M | 7.78 M | 6.55 M | 6.48 M |
| Textiles (clothing input + luxury) | 1.65 M | 14.26 M | 4.62 M | 4.57 M |

“Before” grain and textile need include the input required to satisfy the full
authored final demand; the legacy capacity could not process that demand in the
first place, which is the defect.

Recipe net value at base prices was negative for all seven legacy recipes
(−0.34 to −1.00 SUSD per worker-day). In the historical catalog every recipe is
positive at base prices and at the opening lower-bound prices; the feasibility
test asserts both. The legacy M3 catalog and its accepted tests are unchanged.

**Consequences.** `DATA_PACKAGE_VERSION` is `m3-economy-v2`; the historical
scenario's data version changes, so older saves are rejected rather than silently
loaded under different definitions. The calibration is a feasibility floor, not a
historical claim. It does not implement construction, profession transition,
inter-market trade, government procurement, or full income redistribution. A
bounded 31-day test shows no world-level famine (under 10% of population in blocks
with an unmet subsistence counter), but some clerk/capitalist blocks in
Russia/India/Brazil remain cash-constrained; per-block income distribution is
explicitly left for later calibration. There is no claim of century-scale
population growth or historical accuracy.

## D-063 — Designated player country and AI fiscal exclusion

**Status:** implemented in the post-M7 remediation batch.

**Problem.** The M7 shell let the player set fiscal policy for any polity while
the M6 AI was enabled for all eight and wrote the same `Country.fiscal` fields.
The player's only action could be silently reversed within seven simulated days,
and there was no "player's country" in authoritative state.

**Decision.** Add an optional `World.playerCountryId` (schema 14). The historical
scenario designates the USA (`playerCountryTag: "USA"`, id 0). `runCountryAIPhase`
skips exactly that country; all other countries remain AI-controlled and continue
to use the same observation, validation, and application path. The constructor,
world validation, canonical encoding, state hash, save/load, snapshot, and worker
protocol preserve the field. The app selects the player country by default, marks
the Budget/Country context as player- or AI-controlled, and disables fiscal edits
for AI-controlled countries. The player still uses the shared
`validateCountryAction`/`applyCountryAction` path.

**Why state, not app-only.** Save/load and deterministic replay must preserve the
configuration and its behavior. Storing it in the world also prevents a client
from silently declaring a different player country after load. The field is
nullable so legacy fixtures retain their prior all-AI behavior.

**Consequences.** At the Batch 1 baseline `WORLD_SCHEMA_VERSION` was 14 and
`SIM_VERSION` 0.14.0; D-065 later raises them to 15 / 0.15.0. Saves from
schema 13 / sim 0.13.0 / data `m3-economy-v1` are intentionally rejected. The AI
loses one of eight sample evaluations; AI-controlled countries are unchanged. The
UI restriction is a presentation guard; the authoritative exclusion is in the
simulation phase.

## D-064 — Bounded simulation pacing, worker supervision, and protocol v2

**Status:** implemented in the Batch 2 remediation. This changes scheduling and
transport behavior, not tick semantics or economic calculations.

**Problems.** The M7 pump retained all elapsed wall time in an unbounded
accumulator. A suspended tab or WebView could therefore replay minutes or years of
ticks when the timer resumed. The app had no readiness timeout, command/reply
timeout, or command correlation for `STATE`/`SNAPSHOT`/`ACTION_RESULT`; a lost or
late reply could leave the UI waiting indefinitely or let an old reply overwrite
newer state. Snapshot validation checked only top-level shape, so malformed nested
date/country/region/market fields could reach a screen and blank the app. The
hidden WebView had no process-termination callback wiring.

**Pacing decision.** `SimulationHost` enforces all of the following:

- At most **1,000 ms of elapsed time is accepted per pump**, and retained backlog
  is capped at **1,000 ms**.
- At most **4 ticks are executed per pump**. A long stall therefore produces a
  bounded short burst, never a replay of the stalled interval.
- `START`, `PAUSE`, `STEP`, `LOAD`, and `SET_SPEED` discard outstanding wall-time
  debt and reset the achieved-rate window. Pause stops the timer. Step pauses and
  advances exactly the requested number of complete ticks. Load pauses and requires
  an explicit `START`. A speed change applies only forward; it does not preserve
  debt accumulated at the old speed.
- The selected speed is a **target**. `SimulationSnapshot` now includes
  `achievedDaysPerSecond` (rolling 500 ms measurement) and
  `speedIsBestEffort: true`; the UI labels the selected value as a target, shows the
  measured rate, and says “best effort”. The achieved value is presentation-only
  and never enters world state, hashes, saves, or tick decisions.
- Web pauses on `document.visibilitychange`/hidden and resumes only if the
  simulation was running before hiding. Native pauses on React Native `AppState`
  `background`/`inactive` and resumes on `active` under the same condition. The
  host clamp remains a defense if a lifecycle event is missed.
- Terminal behavior is unchanged: `START` at the terminal day is rejected with
  `campaign_complete`; `STEP` does not advance; `LOAD` remains available.

**Supervision decision.** A transport-independent `WorkerSupervisor` now owns:

- **10 s readiness timeout** and **15 s ordinary command timeout**;
  **60 s** for save/load/apply critical operations.
- Command/reply correlation by `commandId` for `STATE`, `SNAPSHOT`,
  `ACTION_RESULT`, `SAVE_RESULT`, `LOAD_RESULT`, `ERROR`, and `SHUTDOWN`.
  Pump snapshots use `commandId: null`; a requested snapshot echoes the request ID.
- Duplicate and late replies are dropped after a command settles or times out.
- Only one save/load/apply critical operation may be in flight; the UI disables
  those controls while busy.
- Snapshots are accepted only when their sequence is strictly newer than the last
  accepted sequence. The high-water mark resets with a replacement worker.
- A readiness or command timeout, transport error, malformed message, `FATAL`, or
  native process termination clears pending operations and transient status,
  marks the connection failed, and exposes **Restart worker**. Restart creates a
  fresh 1900 simulation context: unsaved progress is lost, and the UI says so. It
  does not claim to recover lost in-memory state.
- The native WebView wires `onRenderProcessGone` and
  `onContentProcessDidTerminate` into the same error path. This is callback wiring,
  not device verification.

**Protocol v2.** `PROTOCOL_VERSION` is now **2**. `STATE`/`SNAPSHOT` carry a
nullable `commandId`; `ACTION_RESULT` and `SHUTDOWN` carry correlation fields;
`STATE` and snapshots carry achieved-speed telemetry. Snapshot validation now
checks the fields the UI dereferences, including civil date, country fiscal and
finance-history fields, regions and their nullable country/market ids, goods,
market prices, diagnostics, and the player-country reference. Unknown or malformed
messages are rejected before rendering. App code still imports only the public
`@century/sim-worker` contracts and never `@century/sim` or `@century/data`.

**Rendering containment.** `AppErrorBoundary` wraps the screen content (header and
controls remain usable), reports the render error, offers “Retry rendering” and
“Restart worker”, and explicitly warns that restart loses unsaved progress.

**Tests.** Added `m7-supervisor.test.ts` (readiness/command timeouts, correlation,
late/duplicate replies, stale sequence, critical lock, reset/dispose, transport
failure, malformed nested snapshots) and `m7-app-lifecycle.test.ts` (native
process-failure and AppState/visibility/error-boundary wiring guards). Extended
`m7-worker.test.ts` with 60 s stall, pause/resume, speed-change, terminal
START/STEP, and correlation tests. Full CI passes; native-device behavior remains
unverified.

**Consequences and limits.** The protocol is incompatible with version 1 clients;
the app and bundled worker are rebuilt together. Timer stalls no longer produce
uncontrolled catch-up, but pacing is still best-effort and the target rate is not
guaranteed. Save-size, storage quotas, autosave, debt, worker transport
reliability beyond the supervised process, and general performance optimization
remain out of this batch. The 36,524-tick campaign, stress/soak runs, native
release builds, and on-device measurements were not run.

## D-065 — Save-size compaction, replace-safe storage, and campaign recovery

**Status:** implemented in Batch 3. **Material trade-off:** account-level monthly
trial balances older than 12 months are no longer persisted.

**Measured root cause.** A representative worst-case fixture built from the current
scenario (1,210 accounts, 863 nonzero account totals per month, 1,200 monthly
summaries, 256 postings) serialized to **23.25 MiB** canonical and only
**323.8 KiB** compressed. The repeated pre-close trial balance in
`FinanceState.periodSummaries[].accountTotals` accounted for almost all of it:
the same fixture with only 12 summaries was **604.2 KiB** canonical. Compression
alone therefore cannot satisfy a target defined for the canonical save, and the
early-save compression ratio does not predict late-game compression.

**Target interpretation.** The GDD 4 MiB target is defined against the **canonical
uncompressed save string**. Compressed/base64, storage-key, and native-bridge
payload sizes are separate measurements and are not used to claim the target
through compression.

**Decision.** At each close, after appending the new summary, compact every
summary older than the most recent **12** (`MAX_DETAILED_PERIOD_SUMMARIES`).
A compacted summary retains:

- `periodStartDay` and `periodEndDay` for all 1,200 campaign months;
- the four exact `flowTotalsByKind` values;
- exact per-country `incomeTaxRevenueSUSD`, `welfareExpenseSUSD`,
  `interestExpenseSUSD`, and `netFiscalResultSUSD` values computed from the
  pre-close trial balance;
- `accountTotals` becomes empty.

The most recent 12 summaries retain the full account trial balance, matching the
12-month Ledger snapshot window. No simulation decision reads a historical
`accountTotals`; the profit-allocation phase uses the newly closed full summary,
and fiscal history/reporting use exact country totals. No values are rounded.
This is a deterministic state transformation, so save/load hashes and future
continuation remain equal.

**Measured result on the same 1,200-summary fixture.** 23.25 MiB → **2.04 MiB**
canonical; 105.5 KiB in the synthetic repeated-value compressed representation.
The fixture's repeated values compress more favorably than a real century, so the
compressed figure is illustrative only; the canonical 2.04 MiB is the target
evidence. The fixture is bounded and uses the current schema/account counts; the
36,524-tick campaign was not rerun.

**Trade-off.** Historical monthly pages older than 12 months cannot show
account-level trial balances. They preserve exact government fiscal totals, gross
flows, dates, and the 1,200-month timeline. Restoring full account-level century
history would exceed 4 MiB; the GDD's “detail needed by the Ledger UI” is the
12-month window. This is recorded rather than hidden behind compression.

**Storage decision.** `SaveStore` (in `@century/sim-worker/persistence`) uses a
staging key, verifies the staged bytes, preserves the old readable primary under a
previous key, writes the primary, verifies it, and only then removes staging.
Startup candidate order is primary → staging → previous, so:
- a failed staging/primary write leaves the previous valid primary readable;
- an interrupted swap can recover a fully verified staging copy;
- a corrupt primary falls back to the previous valid save;
- incompatible schema/format candidates are rejected, not reinterpreted.
AsyncStorage cannot provide a true cross-key transaction; the window is documented
and the staging/previous keys make it recoverable. Storage failures are surfaced
to the player; a failed save never reports success.

**Campaign lifecycle.** On startup the app reads only envelope metadata and shows
**Continue** or **New Game** with the saved date, scenario, sim/schema version, and
canonical/stored size. Continue loads the saved campaign; New Game starts a fresh
world but preserves the old save. Starting a new game over an existing save
disables autosave until an explicit save, which asks for overwrite confirmation.
Pausing or backgrounding requests one debounced autosave (500 ms); repeated
requests coalesce, a pending save/load/action suppresses a new autosave, and the
last valid save is retained. Autosave success is shown only after storage
verification; failure is shown as `Autosave failed: …`. A worker restart still
loses unsaved in-memory state and directs the player to a saved game.

**Versioning.** At Batch 3 `WORLD_SCHEMA_VERSION` was **15** and `SIM_VERSION`
**0.15.0**; D-066 later raises them to **16 / 0.16.0** and bumps data to
`m3-economy-v3`. `SAVE_FORMAT_VERSION` remains **1** because the envelope shape is
unchanged. Schema-14 and older saves are explicitly rejected; there is no silent
migration. The app’s supported schema
constant is explicit and must be updated with the sim schema.

**Tests.** Added compaction/round-trip/hash/4 MiB/worker-LOAD tests
(`m4b-save-compaction.test.ts`), storage atomicity/fallback/staging/incompatible
tests (`m7-save-store.test.ts`), autosave debounce/failure-gating tests
(`m7-autosave.test.ts`), and source-level startup/Continue/New Game/overwrite/
autosave wiring guards. Existing save/load, checksum, player-country, and
deterministic-continuation tests were rerun. Web/native actual storage and bridge
behavior remain unverified on a device.

## D-066 — Active public debt, liquidity-based financing, and bounded contracts

**Status:** implemented in Batch 4. This supersedes D-057’s deficit formula and
dormant-scenario status while preserving its accounting, holder, and default rules.

**Why activate it.** The GDD treats M5b public debt as part of the current finance
model, and the playable shipped scenario is the only way a player observes that
model. Leaving every country disabled made a completed feature permanently dormant.
The GDD also delegates the exact terms, holder set, and financing rule to the
implementation stage.

**Scenario policy.** Debt is enabled for exactly one polity, the **USA player
country**:

- welfare budget **2,000,000 SUSD/year**;
- opening treasury **100,000 SUSD**;
- creditor **GBR** (id 1), another country treasury with actual cash;
- annual coupon **4%**;
- term **365 civil days**;
- outstanding-principal ceiling **1,000,000 SUSD**;
- refinance on maturity **true**;
- arrears grace **365 days**.

The other seven countries remain debt-disabled. The USA is exempt from AI fiscal
decisions (D-063), so its authored fiscal/debt policy is not silently overwritten;
debt financing itself is automatic at month-end. The values are provisional
scenario inputs, not historical calibration and not a claim that Brazil/India/etc.
had no public debt.

**Deficit and financing semantics.** Two distinct measures are reported:

- **Accounting fiscal result:** income-tax revenue minus actual welfare expense and
  interest expense. Actual welfare expense remains the cash actually paid.
- **Financing requirement:**
  `max(0, welfareRequestedThisMonth + interestExpense − incomeTaxRevenue − treasuryCash)`.

`welfareRequestedThisMonth` is a month-to-date memo accumulated by the fiscal phase
from daily budgeted requests and reset at monthly close. It includes welfare that
the treasury could not pay. It is **not** a payable, liability, or debt. Borrowing
never posts retroactive welfare payments; the cash proceeds remain available for
future obligations. This satisfies the audit distinction between budget, accrued
expense, actual payment, and shortfall without inventing an implicit obligation.
Treasury cash includes prior state-enterprise remittances, which are financing
liquidity (not tax revenue), so sufficient cash prevents unnecessary borrowing. The
requirement is also capped by creditor cash, the outstanding ceiling, and the active
contract cap. Unissued requirement is reported as `unfinancedDeficitSUSD`; it is never
silently omitted or booked as an invisible liability. Borrowing and principal are
financing movements; interest is expense; the four M4b flow kinds are unchanged.

**Bounded contract state.** `FinanceState.debtContracts` retains all active/arrears
contracts plus the newest **32** terminated contracts. Active contracts are capped at
**64**. Older terminated contracts are compacted into one `debtHistory` aggregate per
issuer containing contract counts, issued principal, repaid principal, written-off
principal, and written-off interest. Compaction only removes contracts with zero
outstanding principal and zero accrued interest, so no active liability, bond asset,
or accrued interest is dropped. Explicit issuance beyond the active cap throws;
automatic financing reports the remaining requirement as unfinanced. History
aggregates are capped defensively at 256 and validated for finite nonnegative values.

**Accounting.** Issuance, accrual, coupon payment, principal repayment, refinancing,
and default keep the D-057 balanced-entry rules. The debt phase remains staged and
atomic, revalidates accounts, contracts, history, summaries, accounting identity,
and aggregate designated-cash conservation, and publishes only after success.
Interest payment and default-writeoff amounts are clamped to both sides’ actual
posting-account balances to tolerate floating residuals without making a liability
negative.

**Versioning.** `WORLD_SCHEMA_VERSION` **16**, `SIM_VERSION` **0.16.0**, save format
**1**, `dataVersion` **`m3-economy-v3`** (the scenario’s fiscal/debt meaning changed).
Schema-15 and older saves are rejected explicitly; no migration.

**Tests.** `m5b-debt.test.ts` covers issuance, creditor cash, ceiling, no unnecessary
issuance with liquidity, genuine shortfall, credits, coupons, maturity, refinancing,
arrears/default, fiscal reporting, deterministic round-trip, and rollback.
`m5b-debt-bounded.test.ts` covers the shipped USA policy, welfare-shortfall memo
(no back-pay), remittance/liquidity effect, contract caps, history compaction,
save/load/hash equality, and active liability/bond reconciliation. `m5b-debt-
bounded` also asserts the active cap through validation. The full campaign was not
run; the bounded scenario run crosses several month-end/coupon/default boundaries.
Native device behavior remains unverified.

## D-067 — Day-boundary whole-world validation and explicit staged-phase mode

**Status:** implemented in Batch 5. Supersedes only the redundant phase-level
whole-world validation placement; no simulation formula, coefficient, cadence, or
schema changes.

**Problem confirmed from source and measurement.** On the eight-polity sample the
integrated day performed **55.55 whole-world validations per tick**. The same
validated state was rechecked at the start of `runMarketDay` for every market, by
`runProductionPhase` (entry and candidate), by `applyOverflowLosses` (entry and
candidate), by `settleMarketDays`, by both fiscal checks, by the migration phase, by
the debt phase, and at the start and end of `tick`. The M5 fixture has five markets,
and its market-funding fallback repeats the complete market attempt, so market
validation alone occurred up to 50 times per day. A Node CPU profile attributed
roughly a quarter of sampled self time to these validations before the change.

**Decision.** Validation is relocated to the two boundaries that can actually publish
state, and internal phase calls become explicit about it:

- `tick` validates the input world once and the complete staged world once before
  `Object.assign` publication. Failure still discards the staged clone.
- Public phase entry points (`runMarketDay`, `runProductionPhase`,
  `applyOverflowLosses`, `settleMarketDays`/`settleMarketDay`, `runFiscalPhase`,
  `runMigrationPhase`, `runDebtPhase`) accept optional `PhaseValidationOptions`.
  Their default remains full whole-world validation, so direct/API/test callers keep
  the original guarantee.
- `runEconomicDay` calls those phases with `validateWorld: false` only after its own
  day-boundary validation. When called directly with validation enabled it also
  validates the finished day once before returning. That check passes
  `allowUnadvancedClose: true` because a month-end close is intentionally staged
  before the day advances; published-state validation keeps the D-047 rule.
- Phase-scoped checks always remain active in staged mode: reservation shape and
  quantity, buyer/seller/market references, inventory conservation, posting
  structure/semantics, account and cash reconciliation, accounting identity, debt
  cash conservation, and rollback. Only the repeated whole-world sweep was redundant.
- An applied country-AI action still validates its candidate world once; that
  validation is evidence for the policy change, not a per-tick repetition.

**Instrumentation.** `validationStats.ts` exposes a diagnostic-only counter, disabled
by default. `assertValidWorld` increments it when enabled. It is not authoritative
state, is never serialized or hashed, and does not affect simulation decisions; it
exists so tests and the M5 benchmark can prove the reduction. Module-level diagnosis
is deliberate and documented here because it is not an input to any simulation
function.

**Measured result (Node, this machine, eight-polity sample, seed 20261023).** The
20-tick probe fell from **55.55 to 2.15 whole-world validations per tick** and from
`avg 226.7 ms / p50 229.0 ms / p95 266.0 ms` to `avg 54.3 ms / p50 53.5 ms / p95
64.4 ms` over the same 60 samples; a repeat after-run measured `avg 53.8 / p50 52.3
/ p95 72.1 ms`. The optimized runs measured 2 boundary validations per tick plus one
candidate validation per applied AI action (for example 42 validations over 20 ticks
with two applied actions). The state hash after 22 ticks is unchanged
(`914a75412ed40483`), and two fresh runs produce the same hash. The standard
benchmark and correctness results are recorded in the Batch 5 README section. These
are Node diagnostics, not mobile evidence; the full campaign was not run.

**Consequences and limits.** An invalid intermediate staged value is now detected at
the end of the staged day rather than immediately inside the market/phase that wrote
it. Because the day is staged and published only after end-of-day validation, invalid
state still cannot reach the authoritative world, and the error still aborts the
whole day. Public phase calls retain immediate detection. Finance-index lookup and
construction (owner/subtype string keys) are now the largest residual per-tick cost;
that separate concern is not changed in this batch. No schema, save-format, data, or
simulation version change is required.

**Tests.** `batch5-validation.test.ts` covers the pinned pre-optimization state hash,
two boundary validations per tick despite five markets and funding fallback, one
candidate validation per applied AI action, default public-phase validation,
staged-mode reservation validation, multi-market ordering and exactly-once
settlement, per-tick designated-cash conservation with finance validity,
save/load continuation through a monthly close, direct month-end `runEconomicDay`
validation, and debt-phase staged/default hash equivalence with interest and coupon
payment.

## D-068 — Public migration/settlement postconditions and integrated evidence

**Status:** implemented in Batch 6. Addresses CEN-AUDIT-017 (phase APIs that could
publish invalid or double-settled state outside the integrated day) and
CEN-AUDIT-012 (weak assertions and missing integrated accounting evidence). No
simulation formula, coefficient, calibration constant, schema, save format, data
version, worker protocol, debt policy, or player-country behavior changes.

**Migration contract.** Moving people can reduce a source block's eligible workforce
below its existing assignments; `assertValidWorld` checks structural assignment
references but does not enforce the eligible-workforce cap. Previously the integrated
day repaired this externally, while direct `runMigrationPhase` and
`applyMigrationRequest` calls left `employmentDirty = false` with possibly invalid
assignments.

- `applyMigrationRequest` and `runMigrationPhase` now own the repair: after at least
  one flow they set `employmentDirty = true` and force `refreshEmployment`. On success
  the assignments are valid, the dirty marker is false, and
  `MigrationDayResult.employmentRefresh` exposes the transient refresh summary.
- The integrated day uses `migration.employmentRefresh` and no longer repeats the
  repair, so the tick path performs exactly one post-migration refresh.
- The phase backup now includes the employment array and dirty marker. A failure in a
  flow or in the refresh restores population cells, finance/postings, employment, and
  the dirty marker before rethrowing. `applyMigrationRequest` still does not advance
  `world.dayIndex`.
- No flow on a non-month-start day leaves state untouched and returns
  `employmentRefresh: null`.

**Settlement contract.** Wages and upkeep are once-per-day obligations for every
building, not per-market obligations. `settleMarketDays` previously settled every
building's wages/upkeep regardless of which market results were supplied, so two
single-market calls on a multi-market world would pay twice. The public contract is
now explicit:

- `settleMarketDays` requires exactly one unsettled result for **every** market in the
  world. Duplicate, foreign, stale, or partial batches reject before any mutation.
- `settleMarketDay` is restricted to worlds with exactly one market; multi-market
  callers must pass the complete batch.
- Success marks every result settled. Failure still restores account balances,
  postings, and the next-posting counter; no settlement result is marked settled.
- The integrated day already supplied every market result and keeps its behavior.

**Test-quality corrections.** `CEN-AUDIT-012` items were fixed at their source rather
than mechanically rewriting the suite:

- The vacuous `stockLots.length >= 0` assertion was replaced by an actual cross-region
  transaction check against settlement results.
- The M5 world migration tests ran 31 ticks, ending at day 31 without processing the
  February migration. They now process day 31 and assert the migration result,
  population identity, designated-cash conservation, and employment validity.
- The `cloneWorld` isolation test now asserts that the clone changed exactly where it
  was mutated and that the source serialization is unchanged.
- The period-close equity test now asserts exact restoration to the original equity
  after closing the injected shift instead of a nonnegative bound.
- Debt tests now assert exact issuance, coupon, maturity repayment, refinancing, and
  default amounts (including written-off interest), plus the accounting identity.
  Bounded contract-history behavior remains covered by `m5b-debt-bounded.test.ts`.
- The century demography test now accumulates every birth and death and asserts
  `end = start + births - deaths` instead of only `end > start`.
- The labor test relies on the new migration postcondition instead of manually
  refreshing employment after an explicit request.

**Integrated evidence.** `batch6-integration.test.ts` runs the shipped eight-polity
sample for 34 ticks from day 28 to day 62, covering the January close (day 30), the
February migration (day 31), the February close (day 58), and the March migration
(day 59). An explicit 100,000 SUSD debt contract is active throughout. Every tick
asserts population conservation (`end = start + births - deaths`), global designated
cash invariance, the accounting identity, one wage/upkeep settlement per building, and
employment validity. The test also asserts close ordering, contiguous summaries,
issuer liability/creditor bond reconciliation, accrued-interest two-sided
reconciliation, bounded contract/history counts, and save/load continuation from day
40 to day 62 with an identical state hash. The money model has no creation or
destruction: debt principal, coupons, taxes, welfare, wages, upkeep, purchases, and
migration transfers are all account-to-account movements.

**Preserved Batch 5 behavior.** The pinned 22-tick hash
`914a75412ed40483` is unchanged and the validation-count tests still pass. A fresh
42-tick run (which crosses the day-30 close and the day-31 migration) produced
`01a981deb85422a4`, exactly the hash recorded for the same workload under Batch 5.
Moving the employment repair into the migration phase therefore changes API
postconditions, not simulation outcomes. The standard benchmark's M5 tick hash
remains `5b01b64ad8829490`; its isolated migration-phase fingerprint changed from
`eb031b91b6096a3b` to `8e348ae368bb5bd5` because the timed phase now includes its
required employment refresh, so that component timing is no longer comparable to
Batch 5.

**Versioning.** No schema, save-format, data, or simulation version change is
required. Public behavior changes are limited to the migration postcondition,
`MigrationDayResult.employmentRefresh`, and settlement batch coverage.

**Tests.** New/updated: `batch6-integration.test.ts`; `m5-migration.test.ts` direct
phase/request postconditions and failure restoration; `m5-market.test.ts` complete
batch enforcement, once-per-building settlement, and failed-settlement rollback;
`m5-world.test.ts` actual migration tick and hash-changing month run; `m5-labor.test.ts`
postcondition use; `m3f-day.test.ts` clone mutation/isolation; `m4b-period-close.test.ts`
exact equity restoration; `m2-demography.test.ts` exact century identity; and
`m5b-debt.test.ts` exact accounting effects and identity.

## D-069 — Historical-data boundary validation, stable employment ids, and generated-artifact integrity

**Status:** implemented in Batch 7. Addresses CEN-AUDIT-015 (historical data accepted at
load time that world construction later rejects, order-dependent employment ids, and
silently collapsed metadata) and CEN-AUDIT-020 (app import boundary, generated worker
drift, and data-version consistency). No calibration, scenario content, economic
formula, debt policy, worker lifecycle, save compaction, or performance threshold
changes.

**Historical-loader boundary.** `validateM5HistoricalData` now rejects at the data
boundary the values that world construction would reject later, and keeps aggregating
`HistoricalDataError` messages rather than throwing raw `RangeError` for authored
content:

- `startDayIndex` must be a processable campaign day integer
  (`0..35,523`), matching `assertValidDayIndex`/world construction.
- Country, region, market, and employment ids must be unsigned 32-bit.
- Currency keys (lower-case identifier, max 32), currency names (max 64), country
  tags (max 8), and country names (max 128) use the same limits as the simulation.
- `susdPerUnit` must be inside the shared `CURRENCY_RATE_MIN`/`MAX` bounds, and
  specified valuations still require declared sources.
- Welfare budgets must not exceed `MAX_FISCAL_BUDGET_SUSD_PER_YEAR`; debt coupon,
  term, grace, principal ceiling, creditor id, and country-creditor existence are
  checked against the same safe bounds as the debt engine.
- Initial inventory lots require a known good, a known owner building inside the
  market, and a positive finite quantity; negative region resource caps are rejected.
- Building definitions must allow private ownership.
- Population savings-per-capita times population must remain finite.
- Employment records require a known building, the matching building region, a known
  profession, a profession that is actually a job of that building definition, a
  positive safe-integer worker count within the definition/level job slots, and a
  qualified regional workforce. Aggregate assignments per region/profession must not
  exceed `floor(workingAgePopulation * participationRate)` computed from the same
  expanded age profile used to build the world.

The loader still calls the shared `assertValidEconomyDefinitions` and
`assertValidPopulationDefinitions` for static definitions. It does not loosen any
simulation validator.

**Stable employment ids.** Authored employment records have no explicit id field.
Generated assignment ids are now assigned after resolving the authoritative
`buildingInstanceId`, `popBlockId`, and `professionId`, sorting by that tuple, and
numbering from zero. Input array order therefore does not affect ids or the canonical
world hash. Duplicate composite identity
(`regionId:professionKey:buildingKey`) is rejected with both the duplicate path and the
first declaration index; no ambiguous record is resolved arbitrarily. This is
documented in the type/build path and covered by a permuted two-record fixture.

**Duplicate metadata.** `meta.sources[].id` and calibration targets keyed by
`(countryTag, metric)` are checked for duplicates with both conflicting indices.
Calibration target ids, country tags/ids, currency keys, region/market/building keys,
population keys, employment composite keys, and stock-lot keys were already unique and
remain so. Keys that are legitimately repeated (for example a source referenced by
several records) are not rejected.

**App import boundary.** `@century/sim-worker` exposes root, `persistence`, `host`,
`snapshot`, and `node` entries. The app may import only the root barrel and
`persistence`; importing `host`, `snapshot`, `node`, any other worker subpath, or
`@century/sim`/`@century/data` (including subpaths) fails the architecture test. The
committed generated bundle is treated as opaque worker payload: it may export only
`SIM_WORKER_SCRIPT`, `SIM_WORKER_HTML`, `SIM_WORKER_BUNDLE_BYTES`, and
`SIM_WORKER_HTML_BYTES`, and the app may import it only through the two relative
generated-module imports. Positive and negative import fixtures exercise the policy.

**Generated artifacts.** The existing esbuild toolchain remains the only bundler.
`build-worker.mjs --check` regenerates the bundle in memory and compares it with the
committed file without writing; it reports the byte lengths and first difference on
mismatch. `generate-scenario.mjs --check` does the same for the worker scenario
module. Explicit regeneration remains `pnpm -F @century/app build:worker` and
`pnpm -F @century/sim-worker scenario:build`. The root `check:worker` command builds
the data package once, then runs both check-only commands. CI runs `check:worker`
before `pnpm bench` because the bench build regenerates the committed artifacts; this
keeps the check meaningful while preserving the explicit regeneration path. The
worker-bundle test proves the current artifact passes, independent generations are
byte-identical, and an intentionally stale copy fails without being overwritten.

**Data-version consistency.** `DATA_PACKAGE_VERSION`, the simulation
`DEFAULT_DATA_VERSION`, `DATA_PACKAGE_INFO.version`, every scenario JSON
`dataVersion` (top-level or `meta`), and the historical meta data version must agree.
A test enforces this. This batch is validation-only and does not change authored
economic content or scenario meaning, so **no data/schema/simulation version bump is
required**. Incompatible older saves continue to be rejected exactly as before.

**Out of scope.** The separate `CEN-AUDIT-016` sovereignty question remains
unresolved; this batch does not invent a political model. No calibration or economic
content changed.

## D-070 — Economic Management Overhaul and the E0–E6 roadmap

**Status:** accepted as design and planning direction in GDD v2.6 (E0). **E1 is
implemented in GDD v2.7/D-071; E2–E6 are not implemented.** No runtime behavior,
schema field, save content, UI control, or version change beyond E1's derived snapshot
contract is authorized by this decision. Individual E stages still require an
explicit implementation assignment and their own acceptance.

**Why a new program.** The completed M0–M7 implementation gives Century a deep
simulation, a playable shell, fiscal state, enterprise finance, debt, and a snapshot
architecture, but the player still has only a small fiscal action set and an
inspection-oriented interface. The audit/product finding is that Century must become
a game about economic governance, not a dashboard. GDD v2.6 §17A is the authoritative
specification: a diagnose–choose–finance–observe loop, seven policy areas, an
explainable economic interface, eleven design principles, E0–E6 stages, and explicit
implementation-status/dependency labels.

**Combined planning order.** The existing M0–M10 identities are preserved. The
player-facing program is inserted as:

```
M7 → E0 → E1 → M7a (recommended before E2) → E2 → E3 → E4
   → M8 → M9 → E5 → E6 → M10
```

Rationale:

- E1–E4 need only existing M7 snapshots, M4b summaries, M4c fiscal state, M5/M5a/M5b
  enterprise/debt state, the market/production/employment model, and validated
  actions. They can deliver economic clarity, fiscal management, construction, and
  industrial policy before the political/technology milestones.
- **M7a** remains an independent planned accounting stage; it is recommended before
  E2 if annual fiscal reporting is included, but it does not gate E1 or E3–E6.
- **M8** (laws/institutions) and **M9** (technology/education) precede **E5** because
  labor/social legal institutions and human-capital/service effects need those
  mechanics. E1–E4 must not invent them.
- **E6a** trade must follow real inter-market/transport/customs work; **E6b** is the
  retained **M8a** monetary-foundation scope, scheduled after E5/M8/M9 to satisfy its
  prerequisites. M8a is not deleted, renumbered, or reduced; only its planned slot is
  refined.
- **M10** remains last.

This supersedes the prior planned post-M7 order only for the economic program. The
finance/engineering sequence `M4c → … → M7 → M7a → M8 → M8a → M9 → M10` remains the
record for those stages; where the two orders differ (E stages inserted; M8a executed
as E6b), this decision and GDD §17.5/§17.4 are authoritative.

**Boundaries fixed by this decision.**

- One player-controlled country; AI never silently overwrites the player's fiscal or
  economic policy.
- Policies operate through real bases/flows/institutions/projects. No decorative
  control, generic policy pool, sector score, or instant construction bonus.
- Borrowing ≠ revenue; principal repayment ≠ ordinary expenditure; interest is
  separate. Existing M5b/M4b/M4c accounting, close, determinism, atomicity, and save
  compatibility remain binding.
- No tariffs/trade policy before real trade/customs mechanics; no shared-market
  relabeling. No monetary policy before money/credit, banking/institutional, and
  inflation/FX foundations.
- Reports are bounded, derived, deterministic, save-compatible presentation data, not
  a second economy or per-day full history. UI uses immutable snapshots/selectors
  only.
- No GDP/headline aggregate until §7.8 defines a coherent calculation. No real-value
  display without a documented price index. No false causal precision.

**Open choices (not accepted by this decision).** GDD §17A.16 records the unresolved
questions: construction capitalization/materials, land/property, trade counterparty,
banking/credit/monetary institutions, inflation measure, health/pensions/collective
bargaining, sector classification, player/AI action expansion, GDP/headline measures,
report retention, and save/schema migration. Each later E stage must resolve the
questions it needs with its own decision and tests. The default is to leave the lever
unimplemented.

**CEN-AUDIT-016 sovereignty** remains unresolved. This decision does not invent a
sovereignty/market-relationship model and does not authorize one as part of E0–E6.

**Verification.** This is a documentation-only decision. It changes no simulation
source, test, scenario data, save schema, generated artifact, or version constant.
GDD v2.6 was reviewed against the accepted M0–M7 records for implementation truth;
the current baseline remains schema 16 / simulation 0.16.0 / save format 1 / data
version `m3-economy-v3`. The full v2.5 document is retained byte-for-byte as
historical documentation.

## D-071 — E1 economic clarity, confirmed action history, and snapshot protocol 3

**Status:** accepted and implemented. GDD v2.7 §17A.17 records the delivered scope and
limits. E2–E6 remain unimplemented.

**Why.** The E0 specification identified that the M7 interface presented data without
helping the player diagnose it, compare choices, or judge whether a policy worked. E1
was assigned to make existing mechanics understandable, not to add mechanics. The
implementation therefore adds selectors and bounded presentation data around the
existing snapshot/finance/action contracts.

**Decisions.**

1. **Overview is the default tab.** The existing Country screen becomes the national
   economic overview; the other five screens retain their responsibilities and gain
   definitions/drill-down evidence. This is one primary diagnostic surface, not a set
   of disconnected screens.
2. **Supported production is capacity, not realized output.** E1 exposes
   `productionCapacityByGood` and market capacity derived with
   `computeBuildingCapacity` (level, condition, staffing, productivity). The UI labels
   it estimated capacity. The snapshot does not retain last-day production or demand;
   no such series is fabricated.
3. **Household purchasing power is represented by stocks/current estimates only.**
   `householdCashSUSD` is the sum of household-cash account balances; the wage base is
   current employment × profession base wage ÷ civil-year days. Neither is realized
   income. Working-age minus employed is explicitly not an unemployment rate.
4. **Fiscal preview is static current-base arithmetic.** It shows the affected country,
   estimated daily wage base, current/proposed tax and welfare, daily/monthly deltas,
   treasury, latest interest, and constraints. It does not forecast behavior, output,
   employment, or prices, and it does not mutate the snapshot. Only the existing
   `set-fiscal-policy` action can be sent.
5. **Monthly reports use closed-period flows and close balances.** The existing
   `FinancePeriodSummary` window is retained (max 12). Fiscal lines are flows; treasury/
   debt/household cash are balances only while account detail is retained. Compacted
   summaries return `null`; no balance change is derived across a compacted gap.
   Market/production/employment history is absent and labelled, not invented.
6. **Action history is confirmed, bounded, and session-only.** The provider stages a
   pending request at send time but appends only on `ACTION_RESULT`, using
   `event.accepted`, the confirmed snapshot's fiscal values, date, and errors. It is
   capped at 48, cleared on load/restart, and never persisted into the world/save/hash.
   This avoids authoritative state and schema changes while satisfying E1's
   confirmation requirement. Cross-session persistence is deferred.
7. **Explanations are a small evidence rule set.** Rules cover unmet subsistence/basic
   needs, household cash/wage pressure, fiscal pressure, and essential-capacity gaps.
   Each records the observation period, exact fields, a caveat, and a target screen.
   Correlation is not presented as policy causation; no percentages or long-term
   predictions are fabricated.
8. **Snapshot protocol is 3.** The snapshot gained required presentation fields and
   need metadata. Commands/events and the validated action shape are unchanged. World
   schema 16, simulation 0.16.0, save format 1, data version `m3-economy-v3`, hashing,
   serialization, and save compaction are untouched. This is an additive snapshot
   contract change, not authoritative-world state.
9. **No new economic mechanics.** E1 does not add tax bases, spending categories,
   construction queues, subsidies/procurement, labor-law effects, trade/tariffs,
   banking/credit/inflation/FX, or monetary controls. E2–E6 remain unimplemented.

**Consequences.** The app now depends on protocol 3 snapshot fields; the generated
worker bundle must be regenerated with the established generator. Tests must cover the
snapshot contract, monthly flow/balance semantics, compacted summaries, preview
arithmetic, explanations, bounded history, and rejected actions. Native/device
verification and historical market series remain open; no calibration changed.

**Open choices.** Action-history persistence across saves, retained monthly market/
production series, and broader explanation coverage remain deferred. Report retention
is now concretely 12 monthly summaries plus 48 session actions; later stages may extend
it only with a bounded design.

**Verification.** See GDD v2.7 §17A.17 and the E1 change report for tests/commands.
Implementation commit is `90160ce2f9b9570034b37f08f44f767502f790cd`. The implementation
changes no simulation source, scenario data, save schema, hashing, or version constant;
only worker protocol/snapshot presentation data, selectors, app/UI, tests, generated
worker bundle, and documentation changed.

## D-072 — M7a annual accounting, controlled corrections, and schema 17

**Status:** accepted and implemented. GDD v2.8 §17B records the delivered scope and
limits. E2–E6 and M8a remain unimplemented.

**Why.** The M4b monthly close zeroed revenue/expense and retained monthly summaries,
but there was no annual period, no annual flow/balance view, and no controlled way to
correct a ledger without editing history. M7a completes the accounting lifecycle
without adding a player policy mechanic.

**Decisions.**

1. **Annual period = civil calendar year.** The annual summary is appended immediately
   after the 31 December monthly close, before the day advances. It is ordered by year
   and contiguous.
2. **No second closing entry.** The December monthly close is the year-end closing
   entry (revenue/expense zeroed into owner equity, cash-neutral, deterministic). M7a
   verifies zero revenue/expense and does not re-run daily flows or post a duplicate
   close.
3. **Annual flows are sums of monthly closes.** Tax, welfare, interest, net result, and
   the four gross flow kinds are exact yearly sums. They are not the latest month
   repeated and are not derived by differencing balances.
4. **Annual balances are year-end stocks.** Treasury cash, debt principal liability,
   and interest payable are captured at 31 December. No annual account-level trial
   balance is retained.
5. **Partial years and terminal boundary.** A start after 1 January produces
   `complete: false`; later years are complete. Leap years use the existing Gregorian
   calendar. The terminal 2000-01-01 boundary creates no annual 2000 period.
6. **Controlled corrections.** `postFinanceCorrection` posts a new balanced
   `correction` entry with deterministic id, current day, new posting id, original
   posting id, required reason, and retained lines. It is atomic and validates the
   accounting identity. Closed monthly/annual summaries are immutable. A prior-period
   correction lands in the current open period; its count appears in the next annual
   summary. Corrections are an administrative API, not a player action.
7. **Bounded history.** At most 100 annual summaries, 64 corrections, and latest 12
   annual reports in the snapshot. Existing monthly compaction (1,200 summaries, 12
   detailed) is unchanged.
8. **Schema and protocol.** World schema **17**, simulation **0.17.0**, save format
   **1**, data version **`m3-economy-v3`**, worker protocol **4**. New state:
   `FinanceState.annualSummaries`, `corrections`, `nextCorrectionId`. Schema-16 saves
   reject under existing policy; no migration is authorized.

**Consequences.** Canonical hashes and known-answer fixtures change intentionally.
E1's annual report projection gains `CountrySnapshot.annualReports`; no GDP/inflation/
real-income/unemployment claim is added. Save growth is bounded to compact annual
records and a small correction list; no benchmark or performance claim was made
because benchmarks were forbidden.

**Open choices.** Annual reports older than the latest 12 are persisted but not exposed
in snapshots. Correction records may outlive the bounded original-posting audit buffer;
provenance id/reason remain. Player-facing correction UI, reopen, audit institutions,
inflation restatement, and annual tax assessment remain unimplemented.

**Verification.** See GDD v2.8 §17B and the M7a change report. Implementation commit is
`c8b2e4cd72aa049243c07dfdb413e00c708d07cf`. Commands deliberately excluded all
benchmarks, CI (it invokes benchmarks), exports, campaigns, and device measurements;
the repository-wide test run included the pre-existing century correctness regressions.

## D-073 — E2 fiscal management, public-budget decomposition, and schema 18

**Status:** accepted and implemented. GDD v2.9 §17A.18 records the delivered scope and
limits. This decision resolves E2's delegated accounting and policy choices; it does
not reopen D-048/D-056/D-057/D-066/D-071/D-072 and does not authorize any E3+ mechanic.

**Why.** E0/E1 showed the M4c fiscal loop and the M5b debt mechanics, but the player
could only change a flat wage tax and one welfare budget; there was no exemption, no
welfare eligibility, no reserve policy, no business-profit tax, no player financing
control, and no retained separation of requested/paid/shortfall or
revenue/borrowing/principal/interest in reports. E2 was assigned to make the public
budget consequential and explainable using only real bases and mechanisms. Consumption/
excise, property/land, and customs taxes, and education/health/administration/
procurement spending, remain dependency-gated and are not implemented.

**Decisions.**

1. **Extended fiscal policy is one validated object.** `Country.fiscal` gains
   `incomeTaxAllowanceSUSDPerYear`, `welfareMaxWealthLevel` (integer 0..99, 99 =
   universal), `businessProfitTaxRate` (0..1), and `reserveTargetSUSD` (nonnegative).
   Scenario input may omit the new fields (neutral defaults) so existing authored
   content and fixtures keep their behavior; persisted policy is validated as complete.
   The AI proposes the complete policy, copying the fields it does not decide, so its
   v1 target rules are unchanged and it cannot erase a player-style field.
2. **Income-tax schedule.** The base remains actual wages received by a pop block.
   Tax is `rate × max(0, wages − allowance / daysInYear)`; the allowance is pro-rated
   daily. No other personal-income base exists. The statutory-bounds role remains
   hard-bounded provisional policy until M8 can enact laws.
3. **Welfare eligibility and reserve.** Only blocks with positive population at or
   below the wealth ceiling receive the daily transfer; allocation remains proportional
   to eligible population with an exact final remainder. The warrantable amount is
   `min(requested, max(0, treasury cash after tax − reserveTarget))`. The reserve is a
   liquidity floor, not an account or spendable pool: it never creates cash, never
   causes borrowing, and never blocks contractual coupon/maturity/arrears payments.
   Unpaid welfare remains an explicit shortfall; no liability, receivable, or back-pay
   is created.
4. **Business-profit tax.** Assessed once per civil month-end before the close and
   before the debt phase, on each building's already-recognized current-period
   `sales-revenue − input-expense − wage-expense − upkeep-expense`, positive part only.
   Losses are not refunded and are not carried forward as a tax deduction: M5a retained
   profit already absorbs losses for distribution, and inventing a second carryforward
   would be unassigned state. Collection is limited by the building's actual operating
   cash; the uncollected assessment is a reporting shortfall, not a receivable. New
   account subtypes `business-tax-revenue` (country) and `business-tax-expense`
   (building) and a new cash-neutral `business-profit-tax` posting kind prevent the
   receipt from being misclassified as income-tax revenue or ordinary expense.
   The M5a profit measure is after this tax, so the same profit is not distributed
   pre-tax and no profit is taxed twice. A duplicate same-day assessment is rejected.
5. **Budget decomposition.** A month-to-date memo
   (`FinanceState.budgetMemosThisMonth`) accumulates welfare requested/shortfall,
   business tax assessed/uncollected, debt issued, principal repaid, cash interest
   paid, and the unfinanced requirement. The close freezes it into
   `FinancePeriodSummary.countryBudgetTotals` (and annual summaries sum it), resets it,
   and keeps paid welfare/collected business tax derivable from the recognized
   accounts. Zero-only entries are omitted and read as zero to keep saves bounded. The
   memo is reporting/financing input, never a liability. A controlled correction can
   legitimately separate a memo amount from an account line; reports label both rather
   than assuming equality.
6. **Fiscal result.** `FinancePeriodFiscalTotals.businessTaxRevenueSUSD` is added and
   `netFiscalResultSUSD = incomeTax + businessTax − welfare − interest`. Monthly
   summaries still close into owner equity; annual flows remain exact sums of monthly
   summaries and annual balances remain year-end stocks.
7. **Player financing actions.** `issue-debt` (designated creditor, creditor cash,
   ceiling, active-contract cap), `repay-debt` (principal only, treasury cash, reserve
   floor), and `set-debt-policy` (refinancing flag and ceiling, never below current
   outstanding principal) are validated through the same
   `validateCountryAction`/`applyCountryAction` path as fiscal policy. Player actions
   may only target `playerCountryId`; AI actions may never target it. Borrowing is
   financing, not revenue; repayment is not expenditure. Immediate player borrowing
   increases treasury cash, so the month-end automatic requirement is correspondingly
   smaller and the same gap is not borrowed twice. Manual refinancing of a non-maturing
   contract is not added; repay-then-issue is the explicit equivalent.
8. **Ordering.** Civil month-end: AI → demography/employment/migration → market and
   wage/upkeep settlement → fiscal (income tax, then welfare) → business tax → debt
   (accrual, automatic financing, coupons, maturities/refinancing, arrears/default) →
   needs/militancy/wealth → monthly close (freezing the memo) → M5a distribution using
   the after-tax result. Player actions apply only between completed ticks at the
   current day, before that day's phases.
9. **Fiscal-phase posting.** Income-tax entries post as one balanced batch, then
   welfare entries as a second balanced batch on the same staged finance clone. This is
   still one atomic staged day (the clone is published only after full validation) and
   lets welfare read the exact post-tax treasury balance so transferring the entire
   available cash leaves an exact zero rather than a floating residual.
10. **Snapshot/protocol.** Worker protocol **5** adds the action union and required
    presentation fields: extended fiscal policy, debt policy/contracts, estimated
    taxable wage base and wage-earning block count, month-to-date business-tax base and
    budget memo, and budget totals in monthly/annual reports. Snapshots remain
    immutable, bounded, and derived; they are not authoritative state.
11. **Versions and compatibility.** World schema **18**, simulation **0.18.0**, save
    format **1**, data version **`m3-economy-v3`** (the shipped scenario's fiscal
    meaning is unchanged because all E2 fields default neutrally), worker protocol
    **5**. Schema-17 and earlier saves and protocol-4 clients are rejected under the
    existing policy; no migration is implemented (D-013). Canary hashes and
    known-answer digests are intentionally re-baselined because schema/simulation
    versions and the persisted fiscal/budget state are hashed.

**Consequences.** The player can now change the income-tax schedule, target welfare,
set a reserve floor, tax business profit, borrow, repay, and set refinancing/ceiling
policy, and can read the confirmed requested/paid/shortfall and
revenue/borrowing/principal/interest decomposition in monthly and annual reports. The
shipped scenario's neutral E2 defaults preserve its prior economic path until the
player acts. All existing accounting, cash-conservation, close, atomicity,
determinism, and save-replacement rules remain binding. The test suite covers exact
arithmetic, allocation/affordability, reserve semantics, business-tax assessment and
collection limits, financing interactions and rejection/rollback, report
reconciliation, deterministic replay/save-load, the player/AI boundary, and bounded
history.

**Open choices / limitations.** Collection efficiency remains fixed at 1.0 with no
administration/enforcement machinery; business losses have no tax carryforward;
welfare eligibility is a single wealth ceiling, not categorical law; the reserve floor
does not influence borrowing terms or creditor willingness; the preview's
proposed-exemption taxable base is an assumption-based estimate because per-block wage
levels are not retained in the snapshot. Consumption/excise, property/land, and customs
taxes and services/procurement/construction subsidies remain E5/E6a/E3/E4
dependencies. Native/device verification remains the M7 exception.

**Verification.** See GDD v2.9 §17A.18 and the v2.9 change report. Implementation
commit is `f9aa4e0e2ea9d59dd1999d72704eb9d5261d75d2`. Commands deliberately excluded benchmarks,
`pnpm run ci` (it invokes benchmarks), campaign/performance runs, profiling, and device
measurements; the repository-wide correctness suite was run instead.

## D-074 — E3 public construction: work-in-progress capitalization, idle labor, and schema 19

**Status:** accepted and implemented in code/tests/bundle commit `e3b6fff5025af747f0fc78cc6941e1f93631e5ea` (core construction) and follow-up `a8c6a9edd2b400dcfd676478222c612efd7c2f1e` (state-ownership UI gate). GDD v2.10 §17A.19 records the delivered scope,
accounting, limits, and acceptance evidence. This decision resolves E3's delegated
project/accounting/labor choices and the §17A.16 open questions that E3 was allowed to
close.

**Context.** E3 must turn public investment into a real economic mechanic: a player
selects a project, reads its cost/requirements/duration, authorizes and finances it,
observes progress and stalls, and receives a productive asset only after construction.
The current model has building definitions, regional ownership, employment, market
production, treasury cash, state-enterprise ownership/remittance, and validated player
actions, but no project queue, construction labor, construction accounting, or
construction bill of materials.

**Decision.**

1. **Project class and ownership.** E3 offers government-financed, government-owned
   productive building projects based on existing validated building definitions. A
   type is offered only if it has a productive output, a positive authored cost, a
   positive authored construction crew, no required technology, no resource
   requirements, and permits state ownership. Warehouse-only capacity is not offered.
   Private-supported projects, subsidies/loans/guarantees, public-enterprise
   operation/expansion policy, and transport-dependent infrastructure are not E3.
2. **Scope is money + idle labor + time; materials are deferred.** `BuildingDef` has
   no construction bill of materials and the model has no government procurement
   demand/delivery path. §17A.16 explicitly allowed E3 to start with money + labor +
   time. E3 does not fabricate an abstract material input or silently consume goods.
   Material requirements, procurement, and their postings are E4 dependencies.
3. **Idle-labor hiring.** Construction uses eligible workers who are not assigned to a
   production building (`eligibleWorkforceForBlock − world.employment − workers claimed
   by earlier projects that day`), in ascending block id order, up to the definition's
   `constructionWorkers` cap. Construction workers are not added to
   `world.employment`, so no worker is double-counted. They are paid the block
   profession's base daily wage. If no idle worker is available, the project waits and
   records `labor`.
4. **Progress is causal payroll, not a timer.** Gross paid construction wages increase
   `spentSUSD` and progress; completion occurs when cumulative spend reaches
   `totalCostSUSD`. The final worker-day payment is clamped so spend equals the
   authorized cost exactly. No progress occurs on the authorization day, while paused,
   while blocked, or on the terminal 2000-01-01 boundary. A project that cannot pay the
   cheapest available daily wage waits with `funds`.
5. **Authorize-then-pay, with no escrow.** Authorization requires treasury cash for
   `totalCostSUSD + workingCapitalSUSD`, but no cash is reserved. Construction is
   pay-as-you-go; a later funding lapse stalls progress rather than creating debt,
   overdraft, or a hidden liability. Treasury cash is checked against actual daily
   wages, so a project may hire fewer workers or none.
6. **Work-in-progress capitalization.** Daily gross construction wages debit a country
   `construction-in-progress` asset and credit treasury; workers' household blocks
   receive the same gross as cash and `wage-income` (cash-neutral). On completion the
   full spent amount is reclassified from `construction-in-progress` to
   `public-capital`. Construction cost is capital spending, not welfare/interest
   expense. The existing daily income tax is applied to construction wages using the
   block's remaining allowance after settled market wages.
7. **Completion working capital.** A completed building receives a cash-limited
   working-capital endowment equal to at most 30 days of its level-1 daily upkeep. The
   transfer is country treasury/owner-equity → building operating cash/owner equity;
   it is not an expense and does not create money. The 30-day target is provisional
   structural content, not historical calibration.
8. **Cancellation and pause.** Cancellation is player-only for non-terminal projects.
   Spent work-in-progress is written off to country owner equity; there is no refund,
   receivable, or liability. Pause stops hiring/progress and preserves spend; resume
   continues from the same progress. Completed/cancelled projects are terminal.
9. **Completion asset.** Completion allocates the monotonic `nextBuildingId`, creates a
   level-1/condition-1 operational state-owned building owned by the country treasury,
   creates the full required account set (including `retained-profit` when the M5a
   policy is enabled), updates the region building list, and sets `employmentDirty`.
   The building participates in ordinary production/employment/market/tax/remittance
   systems from the next processed day; it grants no instant output bonus.
10. **Phase order and atomicity.** Construction runs after the business-tax phase and
    before the debt phase/monthly close, so month-end financing sees reduced cash and
    in-period outlays are captured. Projects are processed in ascending id order. The
    phase stages finance, project state, buildings, and regions, validates the complete
    candidate, and publishes only on success. Funding/labor claims are deterministic.
11. **State, bounds, and persistence.** Schema 19 adds `World.construction`
    (`projects`, `history`, `nextProjectId`, `nextBuildingId`). At most 32 non-terminal
    projects exist; at most 32 terminated records are retained in detail; older
    terminated records are compacted into per-country counters/amounts (bounded at 256
    aggregates). `nextProjectId` and `nextBuildingId` are monotonic. Save/load and
    deterministic replay preserve the queue and history; hash fixtures change
    intentionally.
12. **Data version `m3-economy-v4`.** Every authored building definition gains
    `constructionWorkers` and permits `"state"` ownership. This changes definition
    meaning, so the data version is bumped rather than shipped silently. The historical
    and generated scenario artifacts are regenerated. The state-ownership permission
    enables E3's completed asset; it does not itself implement E4 enterprise policy.
13. **Actions and UI.** Player actions are `start-construction`,
    `cancel-construction`, and `set-construction-paused`; they use the existing
    validation/apply path and are rejected for AI sources. Worker protocol 6 adds
    project types, per-country project/queue/history/labor/WIP/public-capital fields,
    construction budget fields, and the new action DTOs. The Construction tab exposes
    selection, upfront requirement, static duration estimate with assumptions,
    progress, blockers, pause/resume/cancel, history, and capital outlay; the app reads
    only immutable snapshots.
14. **Reporting.** `constructionSpentSUSD` and `constructionWrittenOffSUSD` are added
    to the month-to-date memo and monthly/annual budget decompositions. They are
    reported separately from welfare/interest expense so capital spending is not
    misclassified.

**Rejected alternatives.**

- **Expense construction immediately.** Rejected because it would depress the fiscal
  result without an asset and misstate the balance sheet; E3's delegated choice is
  work-in-progress capitalization.
- **Instant/free asset on authorization.** Rejected by E3's explicit no-instant-bonus
  requirement and the GDD non-acceptance criteria.
- **Private owner or government-supported private project.** Rejected as E3 scope: it
  requires E4 subsidy/loan/guarantee instruments and private investment behavior.
- **Reserve/escrow the full authorization.** Rejected because it would hide the
  pay-as-you-go liquidity trade-off and create an unmodeled restricted-cash pool; the
  chosen rule checks affordability at authorization but does not reserve.
- **Fixed per-tick or wall-clock construction progress.** Rejected; progress is paid
  labor only.
- **Abstract material input without inventories/procurement.** Rejected as decorative;
  materials are explicitly deferred instead.
- **Subtract construction workers from production employment.** Rejected because it
  would displace existing production; E3 hires only genuinely idle eligible workers
  and waits if none exist.

**Consequences.**

- Schema 19 / simulation 0.19.0 / protocol 6 / data v4 are incompatible with earlier
  saves and clients; no migration is implemented under D-013.
- New canonical hashes and known-answer fixtures; updated tests were changed only where
  the state/schema intentionally changed.
- Construction is player-only; AI construction remains future work and must not use
  hidden information.
- The duration shown is a static projection from today's idle crew/wage and continuous
  funding, not a forecast.
- Materials, private co-financing, public-enterprise operation/expansion, land/space,
  infrastructure, destruction/closure, and owner-insolvency treatment remain explicit
  dependencies rather than simulated levers.

**Verification.** `packages/tests/src/e3-construction.test.ts` covers selection,
authorization constraints, idle-labor hiring, progress/completion, state-owned building
and accounts, post-completion production/employment, funds/labor stalls and resumption,
cancellation write-off/rollback, pause/resume, monthly/annual construction reporting,
save/load/deterministic replay, terminal-boundary rejection, bounded-history compaction,
snapshot fields, and preview validity. Worker/UI path tests cover the validated action
round-trip and Construction tab wiring. Full tests/typecheck results are in the v2.10
change report. No benchmarks or performance measurements were run under the active
no-benchmark restriction, and no benchmark code/threshold/report was modified.

## D-075 — E4 industrial policy, construction materials/procurement, and public-enterprise support

**Status:** accepted and implemented in code/tests/bundle commit
`a859f2a89c8229fa12c9c57b7862307140fb721d`. GDD v2.11 §17A.20 records the delivered scope, accounting,
limits, and acceptance evidence. This decision resolves E4's delegated instrument,
sector-classification, procurement, and public-enterprise choices.

**Context.** E4's GDD definition of done requires at least one coherent industrial
instrument that changes actual enterprise/budget/production/investment behavior, with
unsupported instruments labelled and fiscal cost/trade-offs visible. E3 delivered
state-owned construction but deferred material requirements/procurement and all
industrial instruments. E4 must extend the existing treasury, market, building, M5a
remittance, construction, and reporting systems rather than create a parallel economy.

**Decision.**

1. **Implemented subset.** E4 implements: a validated building-sector taxonomy;
   construction/commissioning material requirements and actual market procurement; an
   ad-valorem sectoral production subsidy; and public-enterprise capital support.
   Investment tax credits/deductions, private co-financing, government-supported private
   projects, loans, guarantees, general goods/services procurement/open orders,
   public-enterprise expansion/discontinuation, industrial program bundles, and
   price/production controls are **not implemented**. They are labelled in the GDD, UI,
   and decision record; no decorative substitute is exposed.
2. **Sector taxonomy.** `BuildingDef.sector` is an authored, validated enum
   (`agriculture`, `food-processing`, `textiles`, `manufacturing`, `storage`). Subsidy
   eligibility is derived from it, not from UI labels, building keys, or ad-hoc special
   cases. Data version `m3-economy-v5` adds it to every building definition, including
   historical variants.
3. **Construction materials.** Every building definition carries a validated
   `constructionMaterials` list of existing good ids/quantities. These are provisional
   construction/commissioning inputs (seed, breeding stock, netting/packaging, raw
   materials), not a historical engineering bill of materials. At authorization the
   project snapshots the requirements and zero delivered quantity.
4. **Procurement is an actual market purchase, not an unfilled order.** Before labor,
   the project buys missing quantities from the project region's actual market stock at
   the current price. Lots are consumed in canonical `(goodId, sellerBuildingId)` order;
   quantity is limited by remaining requirement, actual lot stock, and treasury cash.
   The seller's lot decreases, seller operating cash and `sales-revenue` increase, and
   the country capitalizes the purchase into `construction-in-progress` against treasury
   (`construction-material-purchase`). Purchase and delivery are atomic; E4 does not
   create a backlog or count an order as delivered stock. General services procurement,
   open orders, and delayed delivery are deferred.
5. **Material shortages and duplication.** No stock → project waits with `materials`;
   insufficient cash → waits with `funds`; labor is hired only after all requirements are
   delivered. Delivered quantities are capped by the requirement, so phase retry/replay
   cannot duplicate a purchase or consumption. Cancellation writes off material plus
   labor work-in-progress; completion capitalizes both.
6. **Sectoral subsidy base and payment.** The subsidy is an ad-valorem rate per sector
   on **verified daily physical output valued at the market's post-clearing price**, not
   capacity, sales revenue, a target, or a score. The country's validated policy array
   covers all sectors. Payment is limited by actual treasury cash in ascending
   building-id order. Paid amounts post country `subsidy-expense`/treasury and building
   `operating-cash`/`subsidy-revenue` (`production-subsidy`), cash-neutral. Unpaid
   entitlement is a reported shortfall, never debt or a receivable.
7. **Subsidy tax treatment.** Subsidy revenue is taxable enterprise revenue and is
   included in the month-end business-profit tax base. The subsidy is a real country
   expense; `subsidyExpenseSUSD` is added to fiscal totals and subtracted from
   `netFiscalResultSUSD`.
8. **Public-enterprise support is capital, not expense.** `support-public-enterprise`
   is player-only for an existing state-owned building in the country's regions owned by
   its treasury. A positive, bounded amount covered by actual treasury cash posts
   treasury credit/country owner-equity debit and building operating-cash debit/
   owner-equity credit (`public-enterprise-capital-contribution`). It does not change
   ownership, level, condition, inputs, sales, wages, tax, or remittance rules, and it
   is not a loan, guarantee, or promise of profit. Expansion/discontinuation remain
   deferred.
9. **Phase order.** Material purchases occur in the construction phase before labor;
   the subsidy phase runs after market/fiscal and before business tax, so subsidy
   revenue enters the month-end tax base while subsidy cash is subject to actual
   treasury liquidity. Both phases are deterministic and atomic.
10. **State and versions.** Schema 20 adds `Country.industrial`, project material state/
    `materialsSpentSUSD`, construction material budget fields, subsidy/support budget
    fields, and fiscal subsidy expense. Protocol 7 adds sector/material/enterprise
    snapshot fields and `set-industrial-policy`/`support-public-enterprise` DTOs. Data
    v5 adds sector/material definitions. Schema 20/simulation 0.20.0/protocol 7/data v5
    reject older saves/clients; no migration under D-013.
11. **Reporting.** Monthly/annual budget decompositions add
    `constructionMaterialsSpentSUSD`, `subsidyRequestedSUSD`,
    `subsidyShortfallSUSD`, and `publicEnterpriseSupportSUSD`. Fiscal totals add
    `subsidyExpenseSUSD`; net fiscal result subtracts it. Material outlay is capital,
    subsidy is expense, support is capital, and none is silently reclassified.
12. **Bounded state.** Sector arrays are fixed-size, project material lists are authored
    and small, public-enterprise snapshot lists derive from existing buildings, and no
    new unbounded history is introduced. `nextProjectId`/`nextBuildingId` remain
    monotonic.

**Rejected alternatives.**

- **Generic procurement framework with open orders.** Rejected because no
  delivery/contract/supplier model exists; E4 buys actual stock atomically and labels
  open orders/delayed delivery as deferred.
- **Fictitious material goods or infinite supply.** Rejected; materials use existing
  goods and actual market stock.
- **Subsidy on capacity, sales, or a sector score.** Rejected; the base is verified
  physical output at market value.
- **Subsidy as negative tax/forgone revenue.** Rejected for clarity: E4 pays a real
  treasury expense and recognizes enterprise revenue; unpaid entitlement is explicit.
- **Public-enterprise support as expense or guaranteed funding.** Rejected; it is a
  capital contribution with no profitability/input guarantee.
- **Loans/guarantees approximated by grants or hidden exposure.** Rejected; no credit/
  contingent-liability mechanics exist, so they are deferred rather than faked.
- **Expansion/discontinuation via silent level changes.** Rejected; deferred until a
  proper capital/closure model exists.

**Consequences.**

- Schema 20 / simulation 0.20.0 / protocol 7 / data v5 are incompatible with earlier
  saves/clients; canonical hashes and fixtures changed intentionally.
- Construction now requires materials and labor; a project can wait on either in
  addition to funds, and cancellation writes off both.
- Subsidy payments can be rationed by cash and are reported as shortfalls; subsidy
  revenue increases enterprise profit tax.
- Public-enterprise support injects capital but cannot guarantee operation; ordinary
  market/tax/remittance outcomes still determine viability.
- Private co-financing, loans, guarantees, investment tax credits, general procurement,
  expansion/discontinuation, and price controls remain explicit dependencies.

**Verification.** `packages/tests/src/e4-industrial-policy.test.ts` covers the full
scope above, including duplicate-delivery prevention, shortage/resume, subsidy
payment/shortfall, support capital accounting, action rejection, snapshots/previews,
save/replay, and monthly/annual reconciliation. E3 tests were strengthened for
material-inclusive capitalization/write-off/reporting; worker/UI wiring tests cover the
new actions/tab. Full results are in the v2.11 change report. No benchmarks or
performance measurements were run; no benchmark code/threshold/report was changed.

## D-076 — M8 political institutions: laws, elections, interest groups, unrest, and administration

**Status:** adopted for M8 implementation. **Scope:** §9.1–§9.5 and the §17 M8
definition of done only; E5, M9, E6, M10 and the retained M8a/E6b monetary scope
are not implemented.

**Why a decision is required.** M8 adds authoritative political state, a daily
politics phase, player actions, a new fiscal expenditure, and new save/snapshot
fields. The following choices determine ordering, authority, and accounting and
cannot be inferred from the GDD's design prose alone.

### Law model and legal path

1. All nine §9.2 slots exist in `Country.laws`. Only taxation, suffrage, labor,
   and trade are populated with proposable law definitions in M8. Education,
   health, military service, colonial policy, and currency have no law options
   until M9/E5/M10/E6b provide their concrete service, human-capital, military, or
   monetary mechanisms. A slot with no implemented option is displayed as
   "not implemented in M8", never as a disabled-but-real policy.
2. A law definition has a stable id, one slot, prerequisites, eligible regimes,
   a base enactment duration, typed effects (tax-rate bounds, suffrage franchise,
   border access, labor organisation/grievance, administration load), and a
   documented stance for each of the seven interest groups.
3. `propose-law` names a target law id. Enacting a law, changing it, and
   repealing it are the same operation: the target may be the slot's base law
   (repeal). The proposal is validated at the worker/simulation boundary against
   the current day, the designated player country, slot/option support, current
   law, prerequisites, eligible regime, bounded transition count, and the
   influence-weighted support threshold. No political points are spent.
4. Support is derived from the current interest-group influence and the group
   stances on the target law: `Σ(influence × stance) / Σ influence`, plus a
   documented governing-group alignment term
   (`0.3 × governing-group influence × its stance`) so an election outcome changes
   which laws are politically feasible. Influence is derived, normalised, and never
   spendable. Support is evaluated once at proposal; once a transition starts it runs
   to its effective day. This matches "requires support, a legal path, and time"
   without inventing a per-day legislative vote that the model cannot observe.
5. A transition becomes effective at the start of its `effectiveDay` (pipeline
   step 2). Its effects apply from that day forward. It never rewrites a closed
   month, annual summary, prior posting, or past report. A statutory tax-rate
   bound that conflicts with the current rate clamps that rate on the effective
   day and records the compliance in the event log; this is a forward-looking
   statutory compliance, not a retroactive restatement.
6. Enactment duration is `ceil(baseDays / (0.5 + 0.5 × institutionQuality))`,
   bounded to `baseDays .. 2 × baseDays`. It is computed at proposal and
   persisted, so later quality changes cannot move an already-committed
   effective day.

### Regimes, elections, and government

7. Regimes are `absolute-monarchy`, `constitutional-monarchy`, and `republic`.
   The first two are scenario-authored; revolution may change a monarchy into a
   republic. Each regime definition declares whether elections occur, the term
   in years, and its default law set.
8. An election runs only when: the regime enables elections, the suffrage law
   franchise is positive, the country has population, the institution quality is
   at or above the documented minimum, and the scheduled day is due. A timer
   alone never creates an election. If the conditions fail, the next election is
   rescheduled and the skip is recorded; no votes are fabricated.
9. Franchise is derived from the suffrage law: none, property (block wealth level
   at or above the authored threshold), adult male (age 21+), or universal
   (age 21+). Enfranchised population is the sum of block population × the
   block's eligibility fraction.
10. Votes are bloc votes from the enfranchised population. Each interest group's
    electorate is its enfranchised membership; its vote for the government is
    `electorate × (0.5 + 0.5 × average stance on the enacted laws)`. The
    government wins when its vote share is at least 0.5. Otherwise the group with
    the largest opposition-weighted electorate becomes the governing group. Ties
    are broken by group key order. This is a deterministic documented rule, not a
    random election.
11. Election outcomes change `RegimeState.governmentGroupKey`; they do not spend
    money, create laws, or overwrite the player's fiscal policy. Only the last
    election result is retained.

### Interest groups

12. The seven §9.1 groups are fixed. Membership is derived from each pop block's
    profession key using authored per-profession shares; an unknown profession
    key is assigned to labor with a diagnostic warning rather than silently
    disappearing. Shares are authored so the weights for a known profession sum
    to one; membership therefore sums to the owned population.
13. Organisation and influence are derived each monthly refresh from membership,
    literacy, wealth, laws, and franchise. Influence is normalised to a 0..1
    share across groups; it is recomputable, cached, and not spendable.
    `stanceByLaw` records the authored stance for every implemented law id.

### Militancy, unrest, crisis, and revolution

14. Pop-level militancy remains the existing daily needs-driven indicator.
    Regional `Region.unrest` is new authoritative state updated after needs each
    day from block militancy, unmet subsistence, exclusion, institution overload,
    and the labor law's grievance. The two are distinct: militancy is a pop
    attribute; unrest is a regional aggregate; the country crisis pressure uses
    both explicitly.
15. Crisis stages are `none → unrest → strike → crisis → revolution`. Pressure is
    a documented weighted combination of population-weighted militancy, regional
    unrest, unmet-subsistence population share, political exclusion, institution
    overload, and labor-law grievance. `pressureDays` accumulates only while
    pressure is at or above the documented threshold and decays when pressure is
    below it. Stage transitions happen only at documented day counts; there is no
    random roll and no hidden timer.
16. A strike stage applies a documented regional throughput factor to production
    in high-unrest regions. It does not delete goods, cash, or people.
17. Revolution changes the regime to a republic, changes the governing group to
    the largest opposition group, resets enacted laws to the regime's default law
    set, applies an institutional disruption, and records a bounded event entry.
    It does not change money, debt, population, buildings, or accounting periods.
    A multi-year cooldown prevents a deterministic revolution loop.
18. The player has no "calm unrest" button. Pressure can only be reduced by real
    policies: funding administration, changing labor/taxation/suffrage law, and
    the ordinary needs/employment outcomes.

### Institutions and administration

19. M8 models one state administration institution per country. Staff are the
    country's clerks (the authored administration profession). The model does not
    create government buildings or duplicate people: the clerk population is the
    real staffing base, and the documented simplification is that public
    administration draws on that profession's people without a separate
    government employment assignment.
20. Institution quality is derived from staffing ratio, funding adequacy,
    literacy, regional infrastructure, enacted-law administrative load, and
    recent disruption. Overload is derived from staffing/funding shortfall plus
    law load. The coefficients are provisional and live in the constants module.
21. `set-institution-funding` sets an annual SUSD target. The fiscal phase pays
    `target / daysInYear` daily, limited by actual treasury cash above the
    reserve floor, to eligible administration households in proportion to their
    population. Posting: country `administration-expense` debit / treasury credit;
    household `administration-income` credit / cash debit. It is a cash-neutral
    payroll transfer, not money creation. Unpaid request is an explicit shortfall,
    not debt or a receivable.
22. Tax collection efficiency is `clamp(0.6 + 0.4 × quality − 0.2 ×
    min(overload,1), 0.4, 1)`. The uncollected amount is simply not collected; it
    is not booked as a receivable. Construction progress uses
    `clamp(1 − 0.3 × min(overload,1) − 0.2 × (1 − quality), 0.4, 1)`. Law
    enactment uses the quality term above. All three are documented M8 effects on
    existing systems, not decorative modifiers.
23. Worlds without a `politics` definitions block (legacy M2–E4 fixtures) have
    `World.politics.enabled = false`; the politics phase and all M8 effects are
    inert, preserving accepted behavior. The historical M5 scenario opts in.

### Events

24. Scripted events are authored data with a date, optional country tag, and
    typed effects on M8 state (militancy pressure, regional unrest pressure,
    institution disruption). At world creation they are queued as explicit
    scheduled events with provenance. Applying an event sets its status/applied
    day and appends one bounded log entry; a retry or replay cannot apply it
    twice. Events do not use random draws.

### Persistence and compatibility

25. World schema **21**, simulation **0.21.0**, worker protocol **8**, data
    version **`m3-economy-v6`**. Save format remains 1. Older saves and protocol-7
    clients are rejected explicitly; no migration is implemented under D-013.
    Period/annual `countryBudgetTotals` use sparse encoding (zero fields omitted;
    missing decodes as zero) so the 1,200-month bounded save remains under the
    documented 4 MiB target after the M8 administration fields are added.
26. Bounded state: at most 4 law transitions per country; one retained election
    result; 7 interest groups; 9 law slots; a fixed maximum event queue and a
    bounded event log; no per-day political history.

**Consequences.** M8 changes tax collection efficiency in opted-in scenarios,
adds an administration expenditure, changes production during strikes, and adds
political state to saves/snapshots. M8 does not implement E5 labor standards,
M9 education/technology, E6 trade/monetary mechanics, or M10 war/diplomacy.

## D-077 — M9 technology, research work, and age-specific literacy

**Status:** adopted for M9 implementation. **Scope:** §10.1–§10.3, §6.3, §6.8,
§9.2 (education slot), and the §17 M9 definition of done only. E5a/E5b labor and
social services, E6a/E6b trade and monetary mechanics, and M10 war/diplomacy are
not implemented.

**Why a decision is required.** M9 adds authoritative technology and education
state, a daily education/research phase, new player actions, a new fiscal
expenditure, age-specific literacy, and new save/snapshot fields. The following
choices determine ordering, authority, and accounting and cannot be inferred from
the GDD's design prose alone.

### Technology graph and effects

1. `TechnologyDefinitions` is validated static data: six era names and a
   technology list with stable integer id, key, era (1..6), prerequisites, required
   research work, and typed effects. Load-time validation rejects duplicate or
   non-contiguous ids, duplicate keys, unknown/self/cyclic prerequisites, a
   prerequisite from a later era, non-positive work, and invalid effects. The
   graph is acyclic by explicit depth-first validation, not by convention.
2. M9 implements five effect channels. Three are technology effects: sector
   productivity (a multiplicative share added to produced physical output, not to
   capacity or inputs), mortality reduction (a multiplier on age/sex death rates),
   and education effectiveness (an additive education-quality term). The other two
   are declared where the affected content lives, so each has a single source of
   truth: a building unlock is `BuildingDef.requiredTechnologyId`, and a law
   enable is `LawDef.requiredTechnologyIds`. A technology entry does not duplicate
   those declarations.
3. Military-capability effects are deferred to M10. No military technology effect
   is authored and no inert placeholder field is added.
4. Effects are derived from the researched set on every read. No cached
   productivity/mortality/education scalar is authoritative state; the factors are
   recomputed from `researched` and the validated definitions. This avoids a second
   authority and makes save/load and replay trivially equal.
5. A technology is researched per country. `Country.technology.researched` is an
   ascending-id bounded list with the completion day. `activeProject` is at most
   one project. `workByTechnology` stores project-specific accumulated work for
   started, incomplete projects and is bounded by the technology count. Work is
   never transferred between technologies.

### Research work

6. Research labour is the country's academic population (the authored `academics`
   profession), assigned a documented share of research time by
   `Country.education.researchStaffShare`. Available academic workers are the
   profession's participating working-age people minus any academic employment
   assignments. The model does not create government research buildings or
   duplicate people; as in M8's administration, the profession's people are the
   real staffing base and the institution is a service organisation drawing on
   them. This is a documented simplification, not a hidden free input.
7. Daily work is
   `researchStaff × academicLiteracy × educationQuality × fundingAdequacy`
   researcher-days. `researchStaff = availableAcademicWorkers × researchStaffShare`.
   Zero staff, zero share, or zero funding yields zero work, so a technology can
   never advance from time alone. `researchWork` is measured in researcher-days and
   is authoritative content (provisional, not calibrated).
8. The active project's work is updated once per processed day. When accumulated
   work reaches `researchWork` the technology is appended to `researched` with
   `completedDay = day`, its work entry is removed, and the project is cleared. The
   completion is applied after the market/fiscal phases, so its effects are read
   from the next civil day. It never rewrites a closed month, annual summary, prior
   posting, or report.
9. Starting a project requires the technology to exist, be unresearched, have all
   prerequisites researched, and have no active project. Cancelling clears the
   active project but retains its accumulated work. Both actions validate the
   complete candidate world before publication. AI research actions are rejected
   explicitly rather than faked.

### Education and literacy

10. Literacy is age-specific and authoritative. `PopBlock.literacyByAge` has 81
    entries (ages 0..79 and the open-ended 80+ slot). `PopBlock.literacy` is the
    derived population-weighted rate of ages 15+ (adult literacy); it is
    recomputed after any change and validated for consistency. Ages under 15 start
    at zero because the historical scenario supplies only one adult literacy rate
    per block and no source-backed age-specific series exists; this is a
    documented provisional initialization, not a historical observation.
11. The daily education phase pays the institution, updates the literacy of the
    school-age cohort (5..14), and recomputes the adult aggregate. Gain per age cell
    is
    `LITERACY_DAILY_GAIN × blockAttendance × quality × fundingAdequacy ×
    (1 − literacy[age])`.
    `blockAttendance = min(accessRatio, familyAttendance)` where
    `accessRatio = teachingCapacity / schoolAgePopulation` and `familyAttendance`
    is a documented provisional function of household wealth plus the enacted
    education law's attendance floor. Neither capacity, funding, nor household
    resources can be bypassed. No universal daily literacy increment exists.
12. Education quality is a weighted combination of teacher coverage (`0.6`) and
    academic literacy (`0.4`) plus the education law's quality bonus and the
    researched technology's education-effectiveness bonus. Funding adequacy is
    applied multiplicatively to service output and research work, so zero funding
    yields zero schooling service and zero research work. Coefficients are
    provisional and live in the constants module with documented units.
13. Ageing shifts literacy with the people (oldest-to-youngest; age 79 blends into
    the 80+ slot), so national aggregates follow the actual age structure.
    Migration merges literacy by age using the same moved cells as population.
    Births enter at age 0 with zero literacy. Deaths remove people and do not
    change a rate.
14. The education phase runs after the fiscal phase and before the
    industrial/business-tax/construction/debt phases. It applies exactly once per
    processed day; the staged day is published only after final validation, so a
    retry cannot duplicate the change.

### Laws and institutions

15. The M8 education law slot gains proposable options. The base option is
    neutral; higher options add an attendance floor, a quality bonus, an
    administrative load, and technology prerequisites. Education law uses the
    existing `propose-law` validator, support rule, regime eligibility, effective
    day, and bounded transition state, and contributes to institution load exactly
    like the M8 law slots. This is the required M8 integration; there is no
    separate education-policy action that bypasses the law pathway.
16. `LawDef` gains `requiredTechnologyIds`, `educationAttendanceFloor`, and
    `educationQualityBonus`. They default to empty/zero for every non-education
    law, so previously authored M8 laws are unchanged.

### Accounting

17. Education payroll is paid daily from actual treasury cash above the reserve
    floor: treasury `education-expense` debit / `treasury-cash` credit; academic
    household `household-cash` debit / `education-income` credit (transaction kind
    `education-payroll`). It is cash-neutral. The unpaid part is an explicit
    month-to-date shortfall, never debt or a receivable. No research input goods
    are consumed in M9 because the model has no research material recipe; that is
    recorded as a limitation, not simulated as free goods.
18. Fiscal totals add optional `educationExpenseSUSD`; budget totals add optional
    `educationRequestedSUSD`/`educationShortfallSUSD` (sparse, default zero).
    `netFiscalResultSUSD` subtracts education expense. To preserve the 4 MiB
    canonical-save target after the M9 fields were added, per-country fiscal totals
    in compacted monthly and annual summaries now use sparse encoding too: a zero
    field is omitted and a missing field decodes as zero. Values are exact, not
    approximated; the change is a save-format encoding change under schema 22, and
    the 1,200-month save test remains below the target.

### Persistence and compatibility

19. World schema **22**, simulation **0.22.0**, worker protocol **9**, data
    version **`m3-economy-v7`**. Save format remains 1. Older saves and protocol-8
    clients are rejected explicitly under D-013; no migration is implemented.
20. Bounded state: at most one active research project per country; researched
    entries bounded by the technology definition count; work entries bounded by
    the technology definition count and only for started incomplete projects; no
    per-day technology or literacy history. The technology catalog itself is
    definitions, not saved state.
21. Worlds without a `technology` definitions block (legacy M2–M8 fixtures) have
    `World.technology.enabled = false`, no education/research phase, no education
    payroll, and technology/education effects are inert. `literacyByAge` is still
    initialized from the block's literacy rate so the population state is
    uniform and serializable; it does not change those fixtures' outcomes.

**Consequences.** M9 adds per-country technology/education state and the
age-specific literacy array to saves, adds an education expenditure, changes
production/mortality/literacy only in technology-enabled worlds, and exposes four
new validated actions. M9 does not implement E5 health/training/social services,
qualification promotion, E6 trade/monetary mechanics, or M10 military technology.

## D-078 — E5 labor and social institutions: training, health, and labor standards

**Status:** adopted for E5 implementation. **Scope:** §17A.9, §17A.13.2 E5,
§17A.14 E5, §6.7–§6.8, and the §9.2 health/labor slots. E6 trade/monetary and M10
military systems are not implemented.

**Why a decision is required.** E5 adds persistent qualification and training state,
a new service expenditure with two payment paths, a health-staff allocation inside
the existing administration institution, and statutory labor/health instruments
whose effects reach wages, capacity, and mortality. These choices determine
authority, timing, accounting, and compatibility and cannot be inferred from the
GDD prose alone.

### Training and qualifications

1. Vocational qualification is a new authoritative per-block rate
   (`PopBlock.qualification`, 0..1) over the block's working-age people. The
   authored data has no source-backed qualification series, so it initialises to
   zero. It is built only by the E5 training service; it is not a renamed literacy
   value, does not replace `literacyByAge`, and does not change profession
   membership. Cross-profession promotion remains deferred.
2. Training is part-time and in-service: participants remain in their existing
   employment/education state, and the model applies a documented time cost
   (`TRAINING_TIME_SHARE × trainingParticipation`) to their effective labor input.
   This avoids double-assignment without inventing a separate training population or
   duplicating people. The participation rate is country-level and updated monthly
   from real instructors, funding, and the eligible working-age population.
3. Instructors are actual academics. `Country.labor.trainingStaffShare` is a third
   claim on the available academic staff time, alongside M9 research and teaching:
   `teacherStaff = availableAcademicWorkers × max(0, 1 − researchShare −
   trainingShare)`. A research+training share above 1 is rejected at the action
   boundary. This is an E5 extension of the M9 institution, not a second education
   state.
4. Training eligibility requires block adult literacy at or above
   `TRAINING_MIN_LITERACY`; capacity is `instructors × TRAINEES_PER_INSTRUCTOR`,
   capped by `TRAINING_MAX_PARTICIPATION` of eligible working-age people. A zero
   budget, zero instructors, or zero eligible population yields zero participation.
5. Daily qualification gain is
   `TRAINING_DAILY_QUALIFICATION_GAIN × participation × quality × (1 −
   qualification)` for eligible blocks. Quality combines funding adequacy (budget
   versus instructor benchmark), academic literacy, and administration quality.
   There is no qualification gain without a funded, staffed service. Qualification
   is retained (no decay) because the model has no source-backed depreciation rule;
   this is recorded as a limitation.
6. Qualification affects actual behaviour: daily wages carry
   `1 + QUALIFICATION_WAGE_PREMIUM × qualification`, and building capacity carries
   `1 + QUALIFICATION_PRODUCTIVITY_PREMIUM ×` the assigned workers' weighted
   qualification. Both are causal outcomes of the funded training service, not
   arbitrary fixed bonuses.

### Training accounting

7. Two cash-neutral payment paths use the same accounts
   (`training-expense` country, `training-income` popBlock):
   - `training-payroll`: country expense debit / treasury credit; academic
     household cash debit / training-income credit.
   - `training-stipend`: country expense debit / treasury credit; trainee household
     cash debit / training-income credit.
   The training budget is the provider payroll target; the stipend is a separate
   per-trainee annual rate and is the immediate transfer. Both are limited by actual
   treasury cash and the unpaid part is an explicit month-to-date shortfall, never
   debt or a receivable.
8. Fiscal totals add optional `trainingExpenseSUSD`; budget totals add optional
   `trainingRequestedSUSD`/`trainingShortfallSUSD` (sparse). `netFiscalResultSUSD`
   subtracts training expense. Sparse fiscal-total encoding is retained so the
   bounded save remains under 4 MiB.

### Health service

9. Public health is delivered by the existing state-administration institution
   rather than a new health profession or building. `InstitutionState.healthStaffShare`
   (0..1) assigns a share of the country's clerk staffing base to public health;
   administration staffing is the remainder. This is a documented simplification:
   practitioner-level medical staff are not modeled, and the health service is
   public-health/medical administration delivered by clerks. It creates no people,
   money, or duplicate employment.
10. Health service output is derived from the health staff share, clerk staffing
    relative to a population benchmark, the existing administration funding
    adequacy, and literacy. The service cost is the existing administration payroll;
    the health share of that payroll is reported as a derived allocation, not a
    second payment. A health law may impose a minimum staff share; the player action
    cannot go below it.
11. Mortality reads the health factor together with the technology factor and the
    hours-standard factor at day start. The health effect accumulates through the
    demographic stock, so its population consequence is slow even though the daily
    factor is recomputed. Zero health share leaves M8 behaviour unchanged.

### Labor and health law instruments

12. The labor slot gains two statutory options:
    - `labor-minimum-wage`: `LawDef.laborMinimumWageSUSDPerYear` sets a full-time
      annual floor. The daily wage obligation is
      `max(profession base wage, floor) × hoursFactor × (1 + qualification
      premium)`. Employers pay from actual operating cash; unpaid wages remain the
      existing explicit shortfall. E5 does not model a hiring/wage-elasticity
      response; that is a recorded limitation.
    - `labor-hours-standards`: `LawDef.laborHoursPerWeek` sets a standard week
      relative to the provisional 60-hour baseline. The hours factor scales both
      capacity and daily wages (hourly pay unchanged), so shorter hours reduce
      output and household income. It also applies a bounded mortality improvement.
      It is not a free productivity bonus.
13. The health slot gains `health-public` with `LawDef.healthStaffFloor`; the
    player's health staff share must be at least the enacted floor. All three laws
    use the existing `propose-law` support/regime/prerequisite/effective-day/bounded
    transition pathway. Their effects are read forward from the effective day and
    never rewrite a closed period.
14. Migration policy is not duplicated: the M8 trade law's `borderPolicy` remains
    the legal path for cross-country migration access (it sets
    `Country.immigrationOpen`). E5 adds tests but no second border action.

### Phase ordering and atomicity

15. The economic day order becomes: politics (including monthly institution
    refresh with health netting) → **E5 labor month start** (monthly training
    participation) → AI → demography (tech × health × hours mortality) → employment
    → migration (M8 border policy) → market/production (hours, qualification,
    training time cost) → settlement (minimum wage, hours, qualification wage
    premium) → fiscal → **E5 training phase** (treasury-limited payroll and stipend,
    qualification gains) → education/research → industrial/business-tax/
    construction/debt → needs/unrest/wealth/close.
16. Training participation is set only on the first civil day (and scenario start),
    so a retried day cannot re-enrol or double-pay. Qualification gains and payments
    apply once per processed day. The whole day remains staged and published only
    after final validation. No formula uses `Date`, `Math.random`, wall time, or a
    shared mutable PRNG.

### Deferrals

17. Pensions/social insurance are deferred: no contribution/benefit rules or
    explicit liability model exist, and faking them as generic welfare is forbidden.
18. Collective bargaining is deferred: M8 labour organisation/influence is an
    aggregate political measure, not bargaining coverage; a credible coverage,
    recognition, and negotiation model is not present.
19. Labour-market information/enforcement and cross-profession promotion are
    deferred; they require a distinct placement/enforcement service and promotion
    flow model. No decorative controls are added.
20. Public health uses clerks rather than a medical profession; practitioner
    staffing, hospitals, and health-specific capital are limitations, not silently
    assumed capabilities.

### Persistence and compatibility

21. World schema **23**, simulation **0.23.0**, worker protocol **10**, data version
    **`m3-economy-v8`**. Save format remains 1. Older saves and protocol-9 clients
    are rejected under D-013; no migration is implemented.
22. Bounded state: one training participation rate and memo per country; one
    qualification rate per block; one health staff share per country; no per-day
    training or qualification history. Training enrollment is a rate, not an
    unbounded list of trainees.
23. Worlds without labor/health policy inputs default to neutral zero shares and
    zero budgets, so M0–M9 fixtures retain their accepted behaviour except for the
    intentional schema fields and version bump.

**Consequences.** E5 adds qualification, training, and health-allocation state to
saves, a training expenditure and two new posting kinds, statutory wage/hours/health
effects, and four new validated actions. It does not implement E6 trade/monetary
mechanics, M10 systems, pensions, collective bargaining, or cross-profession
promotion.

## D-079 — E6a transport, access, inter-market trade, and customs

**Status:** adopted for E6a implementation. **Scope:** §17A.8, §17A.8.1, §17A.13.2
E6a, §17A.14 E6a, §17.5, and the §17A.16 "infrastructure transport/access model" and
"trade counterparty/rest-of-world" questions. E6b monetary foundations, FX
settlement, and M10 systems are **not** implemented.

**Why a decision is required.** E6a must add real inter-market goods flows, a
transport/access capacity model, a customs boundary with a dutiable event, balanced
trade postings, trade-policy state, and a foreign counterparty. The GDD fixes the
prerequisites and the non-goals but deliberately leaves the transport model, the
trade mechanism, the customs jurisdiction, and the counterparty unresolved (§17A.16).
Those choices determine authority, timing, accounting, and compatibility.

### Transport, access, and capacity

1. **The existing `Region.infrastructure` rate (M8, 0..1) is the only
   infrastructure authority.** E6a adds no parallel infrastructure state and does
   not create a "transport score". A market's infrastructure quality is the mean of
   the `Region.infrastructure` values of its member regions, a derived value that is
   recomputed from authoritative state and never stored.
2. **Routes are authored, validated geography, not a general graph.** A
   `TradeRoute` is an unordered market pair with a positive `distanceUnits` and a
   positive `baseCapacitySUSDPerDay`. There is one direct route per authored pair
   and no multi-hop routing; a pair with no route cannot trade. Route records are
   persisted world state (like market membership) so saves are self-contained and
   validation is local. Distances and capacities are provisional authored sample
   content, not historical measurements.
3. **Effective route capacity is**
   `baseCapacitySUSDPerDay × (0.5 × originInfrastructure + 0.5 ×
   destinationInfrastructure)`. Capacity is a **daily flow limit measured in SUSD of
   cargo value at the origin market price**, because the model has no per-good
   weight/volume data. It is recomputed from infrastructure and prices each day and
   is never accumulated, banked, or spent; it is a constraint, not a resource. A
   zero-infrastructure route has zero usable capacity.
4. **Freight cost is**
   `quantity × GoodDef.transportCostPerUnit × route.distanceUnits`, charged at
   dispatch from the shipping building's operating cash to the existing
   `system-reserve` transport provider. `transportCostPerUnit` was authored as 0 for
   the single-market M3 fixtures; E6a populates it as a provisional fraction of each
   good's base price. Transit time is `max(1, ceil(distanceUnits))` civil days.
   Freight is a real cash cost, not a price adjustment and not a source of goods or
   money.
5. **Infrastructure construction/investment is deferred.** §17A.8.1 requires
   transport cost and capacity; §17A.13.2/§17A.14 E6a do not require building new
   infrastructure, and §17A.6.2 keeps infrastructure outside E3. E6a therefore uses
   the existing validated infrastructure values and adds no construction shortcut.
   Improving infrastructure remains the recorded E6a-adjacent extension; the
   transport model it must feed now exists.

### Trade mechanism and physical movement

6. **Trade is producer consignment, not pooled re-clearing.** After a market has
   cleared and settled, a producing building holding surplus stock may ship some of
   its own goods to another market when the destination price covers origin price +
   freight + duty + a provisional minimum margin. It keeps ownership in transit and
   sells at the destination market price when the goods arrive. This adds no
   merchant entity, no purchase of goods the shipper does not own, and no money
   creation: freight and duty are the only dispatch-time cash flows.
7. **Phases.** Arrivals run before that day's market clearing (imported lots become
   sellable stock); dispatch runs after settlement (post-clearing surplus, prices,
   and cash are known) and before the fiscal phase. Goods in transit are held in
   `TradeState.shipments` and are **not** counted in any market's stock, so they are
   never counted twice. Arrival removes the shipment and adds exactly one
   destination lot owned by the shipping building.
8. **Cross-market lots are legitimate only through trade.** Scenario-authored stock
   must still belong to a building inside its market. Runtime validation permits a
   lot owned by a building outside the market only when trade is enabled, because
   such lots are created solely by the arrivals phase. Overflow losses, market
   clearing, settlement, and ownership rules apply to imported lots unchanged; no
   new inventory authority is introduced.
9. **A market is a customs zone.** Each market carries a validated
   `customsCountryId` (its customs administration). The M5 sample's markets are
   multi-polity trade markets, so a member polity that is not the administration
   shares the zone's external tariff — the documented customs-union behaviour of the
   sample (GDD §20.1.8 permits a shared market/customs zone). Intra-market pooled
   allocation stays shared-market clearing and is **not** dutiable (§17A.8.3); only a
   shipment between markets can be a dutiable event, so tariffs are never attached
   to shared-market clearing.
10. **No separate rest-of-world entity is invented.** The §17A.8.1.7 "rest-of-world
    or foreign counterparty" is satisfied by the real foreign counterparty: a
    building of another simulated country, its operating account, its country
    treasury, and the bilateral origin/destination country recorded on every
    shipment. A non-simulated RoW sector would have to own goods and cash without a
    modeled source, which §17A.8.1.4 forbids. External accounts, currency conversion,
    and FX settlement are E6b.

### Customs, tariffs, quotas, and policy

11. **Dutiable event.** A shipment leaving a market whose customs administration
    differs from the destination market's administration. Dutiable value is the
    cargo value at the origin market price; the duty rate is the destination
    administration's ad-valorem rate for the shipped good. Same-administration trade
    is not dutiable.
12. **Who pays and who receives.** The shipper (the foreign seller of record) pays
    the duty from its operating cash at dispatch to the destination administration's
    treasury: `customs-duty-expense` (building) / `operating-cash` credit and
    `treasury-cash` debit / `customs-duty-revenue` (country). The charge is
    cash-neutral and posted once per shipment. A shipper that cannot fund freight
    plus duty ships less or not at all; no receivable, payable, or debt is created.
    Revenue appears in `customsDutyRevenueSUSD` and reduces the net fiscal result.
    Freight is charged the same way (per shipment, at dispatch) with
    `freight-expense` / `system-income` and the existing system transport provider.
12a. **Working-capital funding rule.** The shipped sample's enterprises distribute all
    profit at each month-end and therefore often hold too little cash to prepay
    freight and duty. A shipment's charges are paid first from the enterprise's own
    operating cash. Any shortfall is funded by the building's declared owner (the
    owner household for private ownership, the owning country treasury for state
    ownership) as an explicit capital injection posted as `owner-capital-injection`
    (building `operating-cash` debit / building `owner-equity` credit / owner cash
    credit / owner `owner-equity` debit). It is equity, not a loan, receivable, or
    negative balance. If neither the enterprise nor the owner has the cash, the
    shipment is blocked with reason `funding`. This completes the already-registered
    but previously unused `owner-capital-injection` kind for trade working capital
    only; no other automatic owner funding is added.
12b. **Dispatch timing and repeat guard.** Dispatch runs after the fiscal phase, not
    before it, because the fiscal phase requires the settlement posting boundary to be
    unchanged. It is still in the open period and before the monthly close, so duty is
    in the fiscal report. `TradeState.lastDispatchDay` makes a repeated dispatch for the
    same day an idempotent no-op (it cannot double-post freight/duty or double-ship),
    and the phase restores trade state, country policy/memos, and market lots if any
    step throws.
13. **Instrument set.** E6a exposes a per-country tariff schedule (ad-valorem by
    good), a monthly physical import quota by good, and a per-good export
    restriction. Quota usage is a bounded per-country month-to-date counter reset on
    the first civil day; an export restriction blocks exports of goods owned by that
    country's buildings. Instruments use one validated `set-trade-policy` action with
    the existing player/AI validation boundary.
14. **Deferred instruments.** Trade agreements/market access require partner
    identity and a diplomacy/foreign-relations interface (M8/M10) and are not
    implemented. Export incentives require the E4 investment/incentive machinery and
    are not implemented. "Protection" is not a separate score: it is what the tariff
    and quota instruments actually do. The M8 trade law remains the migration
    border-policy path and is **not** reused as a customs instrument.
15. **Failure and observability.** Insufficient stock, capacity, quota, cash,
    profitability, or an export restriction each block a shipment; the phase records
    a bounded per-day blocked-reason list and the snapshot exposes route capacity,
    shipments in transit, duty/freight month-to-date, and per-country policy so the
    player can see why goods are not moving. Estimates (previews) are labelled and
    never imply delivery.

### Accounting, determinism, and compatibility

16. Trade postings are balanced and cash-neutral. Physical quantity is conserved:
    stock leaves the origin market at dispatch, exists only as in-transit quantity,
    and enters the destination market once on arrival. No goods or money are created;
    no duty is recognized without a shipment that actually incurred it.
17. Bounded state: at most `MAX_TRADE_SHIPMENTS` (512) in-transit shipments and
    `MAX_TRADE_BLOCKED_DIAGNOSTICS` (64) per-day diagnostics; routes are bounded by
    the authored market-pair count (hard guard 10,000); there is no per-day trade
    history or order book. The transport margin threshold is 5% over landed cost
    (`TRADE_MIN_MARGIN_RATE`), a provisional commercial-risk allowance.
18. Ordering is explicit and deterministic: ascending origin market id, destination
    market id, good id, seller lot id; no random draw and no `Date`/wall clock.
    A retried or replayed day cannot duplicate a shipment, delivery, duty, or freight
    posting because every effect is derived from the staged pre-day state.
19. Construction-material procurement (E4) still buys only from the project's own
    market, so it cannot bypass transport or customs: goods in that market have
    already cleared any import duty. E6a adds a test that procurement never posts
    duty and cannot purchase across markets.
20. World schema **24**, simulation **0.24.0**, worker protocol **11**, data version
    **`m3-economy-v9`**. Older saves and protocol-10 clients are rejected under
    D-013; no migration is implemented.

**Consequences.** E6a adds authoritative trade policy, route, shipment, and
customs-administration state; two posting kinds and three account subtypes; a daily
arrival and dispatch phase; a new validated action; and new snapshot/report data. It
does not add FX conversion, monetary authority, inflation measurement, credit
creation, rest-of-world endowments, infrastructure construction, trade agreements,
or any M10 system.

## D-080 — E6b monetary foundations: currency board, exchange-rate valuation, and price index

**Status:** adopted for E6b implementation. **Scope:** §17A.10, §17A.10.1–§17A.10.4,
§17A.13.2 E6b, §17A.14 E6b, §17.3 M8a scope, and the §17A.16 monetary open questions.
M10 and E6b-external features (banking, credit, external debt) are not implemented.

**Why a decision is required.** The GDD fixes the SUSD contract and the requirement for
a documented inflation measure, exchange-rate dynamics, a law-backed monetary authority,
and balanced money accounting, but deliberately leaves the mechanism, accounting, and
transmission open (§17A.16). Those choices determine authority, units, timing, posting
semantics, and compatibility.

### SUSD and units

1. **SUSD remains the fixed unit of measurement and accounting denomination.** No
   account, price, wage, asset, or liability is rescaled or redenominated. The price
   index is a derived measurement; it never changes SUSD's definition and never rewrites
   a closed period.
2. **`CurrencyValuation.susdPerUnit` keeps its direction: SUSD per one currency unit.**
   It is the single authoritative valuation; there is no stored inverse rate and no
   parity default. The `source` field extends to `scenario | policy | market` strictly
   as provenance: `scenario` for authored input, `policy` for a declared parity, and
   `market` for a valuation moved by the managed rule. It is not a claim that a real
   market set the rate.
3. **Domestic accounts remain SUSD.** E6b does not create national-currency-denominated
   household, enterprise, or treasury ledgers. Currency amounts exist only where an
   actual currency transaction occurs (the monetary authority's issue/redemption and the
   external counterparty's holdings), and each carries its SUSD measurement at the
   current valuation. This is the documented conversion boundary: conversion happens at
   the monetary window only, once, and never inside trade or tax settlement.

### Price measurement

4. **One documented Laspeyres price index.** Basket weights are the reference-household
   annual quantities from the scenario's validated need tiers (subsistence, basic,
   comfort, luxury items), summed by good where a good appears in several tiers. The base
   period is the scenario's first processed day; each market's opening SUSD prices are
   captured into authoritative state at world creation, and the index is normalized to
   **100** there. The formula is
   `I = 100 × Σ wᵢ (pᵢ,t / pᵢ,0) / Σ wᵢ` over basket goods that have a base and a current
   positive price. A good with a missing or non-positive current price is excluded from
   both sums and coverage is reported; a good absent from the basket is excluded even if
   its price is observable. Neither case fabricates a price.
5. **Market, country, and world indices.** The market index uses that market's prices.
   A country index is the population-weighted mean of the indices of the markets that
   contain the country's regions (a country with no population weight uses an equal
   weight). The world index is the population-weighted mean of market indices. All are
   derived; only the basket, base prices, and month-end observations are stored.
6. **Bounded observation history.** The current index is derived from current prices on
   demand. At each civil month-end the phase appends one observation `{year, month,
   dayIndex, world, per-country values}` and retains the most recent **24**. Older
   observations are dropped (documented bounded retention). Month-on-month and
   year-on-year inflation are computed from the retained observations and reported as
   "insufficient history" when unavailable. The observation is idempotent per day.
7. **Measurement has no behavioural effect.** The GDD does not require indexation, and
   no price, wage, tax, contract, or account is adjusted from the index. This is recorded
   as a deliberate limit, not an omission: index-linked policy would need its own
   instrument and decision.

### Exchange-rate regime, dynamics, and authority

8. **Only own-currency countries have a monetary authority.** A country whose
   `monetary` arrangement is `adopted` or `shared` has no independent authority and is
   governed by the issuer's; a country with an explicitly unavailable valuation has no
   active authority until it declares a parity. No country receives a modern fiat
   central bank by default.
9. **Two regimes.**
    - **Pegged** (default): the valuation equals the declared parity. The parity changes
      only through an explicit validated policy action, bounded to a maximum relative
      change per action and a minimum interval between changes, and the change is
      revalued through the accounting described below. It is not a per-tick adjustment.
    - **Managed**: the valuation is updated by a documented bounded rule from two real
      signals: the realized net external position of the most recently completed civil
      month (from the authoritative E6a export/import memo), normalized by turnover as
      the trade-pressure term, and the country-to-world price-index ratio as the relative
      price-level term. The daily change is
      `clamp(KAPPA_FX × (w_trade × pressure + w_price × priceGap), ±MAX_DAILY_FX_CHANGE)`
      and the valuation is bounded to `[0.5×, 2×]` of the declared parity. The managed
      regime requires an enacted currency law; without it the country is pegged.
      Kappa, weights, bounds, and cadence are provisional structural choices, not
      calibrated economics.
10. **A currency law backs the authority.** The M8 currency slot gains a
    `currency-managed-standard` option whose validated `currencyRegime` is `managed`.
    The existing `propose-law` pathway (support, regime eligibility, prerequisites,
    effective day, bounded transitions) is reused; no second institutional action is
    added.
11. **Authority instruments.** One validated player action, `set-monetary-policy`, sets
    the regime, the parity, a treasury reserve transfer, and a currency conversion. The
    AI has no monetary action. Every field is bounded and validated at the authoritative
    boundary; an invalid or unaffordable operation leaves the world unchanged.

### Money accounting and convertibility

12. **Currency board accounting.** Per active authority: country `monetary-reserve-cash`
    (SUSD cash), `currency-liability` (SUSD at the current valuation), and
    `monetary-equity`; and an external counterparty's `external-cash`,
    `external-currency-holding`, and `external-equity`, all system-owned and identified
    by explicit account ids in the monetary state. `currencyIssuedUnits` is
    authoritative; the liability and holding balances are its SUSD measurement and are
    validated against `units × valuation`.
13. **Reserve capitalization/withdrawal** is a real capital transfer between the country
    treasury and the authority (`monetary-reserve-contribution`): treasury cash and
    country equity move against authority reserves and monetary equity. It is not
    revenue or expense and never creates cash.
14. **Currency issue/redemption** (`fx-issuance` / `fx-redemption`) exchanges SUSD
    reserves for currency units with the external counterparty at the current valuation.
    Issue requires the external counterparty's SUSD cash; redemption requires the
    authority's reserves and the external currency holding. Both are cash-neutral,
    balanced, and bounded by existing balances; no money or currency appears without a
    counterpart.
15. **Revaluation** (`fx-revaluation`) applies a valuation or parity change to the
    outstanding liability and the external holding, with the differences posted to
    monetary equity and external equity. It is a valuation change only: no cash, no
    goods, no rewriting of settled transactions or closed periods.
16. **Convertibility is derived from reserve adequacy, not a slider.** The authority's
    reserve cover is its reserves divided by the most recently completed month's realized
    imports. Below the documented minimum (or with zero reserves) convertibility is
    suspended. While suspended, E6a dispatch blocks imports into that country's market
    with the reason `fx-convertibility`. Restoring cover (reserve transfer, a parity or
    valuation change that reduces the liability, or lower imports) restores trade. This
    is the real transaction channel of exchange-rate policy and the only FX effect on
    trade; trade values remain SUSD and are never converted.
17. **No double conversion.** Trade, freight, and customs remain SUSD-settled and are
    not converted at the monetary window. The window handles only currency units and
    reserves. Goods conservation and shipment idempotency are unaffected.

### Timing, persistence, and compatibility

18. The monetary phase runs after settlement, fiscal, and E6a dispatch, and before the
    monthly close. Managed valuation updates and revaluation run daily and are
    idempotent per day; the realized-import capture and price-index observation run at a
    civil month-end and are idempotent per day. A repeated day cannot double-post,
    double-capture, or double-observe.
19. World schema **25**, simulation **0.25.0**, worker protocol **12**, data version
    **`m3-economy-v10`**. Older saves and protocol-11 clients are rejected under D-013;
    no migration is implemented.
20. Bounded state: one basket, one base-price table per market, at most 24 month-end
    observations, one authority record per currency, and no per-day FX or index history.
    Observation and record arrays are sorted by stable ids.

**Consequences.** E6b adds price-index and monetary-authority state, six account
subtypes, four posting kinds, one validated player action, one currency law option, a
documented index and FX rule, and an FX-driven import gate. It does not add commercial
banks, deposits, bank credit, a policy interest rate, lender-of-last-resort, external
debt, domestic currency-denominated ledgers, an FX order book, or M10 systems.

## Assumptions recorded for future review


1. `scenarioId` and `dataVersion` are non-empty strings up to 128 characters.
2. The warning buffer is capped at 32 entries of 500 characters each. No
   per-day diagnostic history is stored.
3. Typed-array encoded values must be finite; integer kinds must be in range;
   Float32 values must be exact; encoded arrays are capped at 10,000,000
   elements.
4. `CAMPAIGN_TICKS` and `CAMPAIGN_TERMINAL_DAY_INDEX` are both 36,524 but mean
   different things (processed transitions versus the boundary index). Tests
   assert the distinction.
5. M2 uses exactly one region and one shared needs fixture. Multi-region worlds,
   trade markets, migration, and employment are M3/M5 work.
6. The total-population reference and WPP 1950/1975/2000 age/sex references are
   source-backed. The 1900 age/sex structure and 1900–1949 ASFR/mortality are
   provisional; full historical demographic calibration is incomplete.
7. The daily budget excludes savings; no financial account is mutated in M2.
8. `Math.log`-based wealth and floating demographic accumulation are deterministic
   on a fixed runtime but not proven bit-identical across JavaScript engines.
9. M6 AI fiscal rules and constants are provisional policy heuristics, not
   calibrated behavioral parameters. The AI uses only own-country/public
   information, has no construction, law, debt, diplomatic, or military actions,
   and does not lower income tax in v1.
10. `assertValidWorldForTick` validates the newest monthly summary and its links,
    not every immutable older summary; complete validation remains mandatory at
    save/load/construction/close boundaries. The hot-path `cloneWorldForTick`
    shares immutable closed summary objects and copies only the array; public
    `cloneWorld` deep-copies them (D-059).
11. M7's worker protocol is version 1 and its snapshots contain at most 12 closed
    monthly periods; the app receives no live world, finance account, typed array,
    or mutable reference. Snapshot delivery is rate-limited by the 100 ms driver
    interval, not guaranteed at 10 Hz when a tick takes longer than 100 ms.
12. The native WebView transport is a proof of concept, not a native release
    build. iOS/Android release-build and real-device performance criteria remain
    open; Node, web, and Hermes-bundle results are not mobile acceptance.
13. The app stores gzip-compressed canonical saves under
    `century-save-gzip1:` in AsyncStorage. The canonical save format is unchanged.
    Schema 14 added the player-country field; schema 15 (D-065) adds compacted
    period summaries, and each schema rejects older saves explicitly.
14. The historical scenario uses a separate provisional catalog (D-062). It does
    not change the accepted M2–M4 fixture definitions. Its opening prices are the
    lower price bound, which keeps the fixed-capacity market from drifting below
    the bound while one day of intermediate stock supports the production chain.
15. Per-block income distribution remains provisional: the bounded feasibility
    run does not claim that every clerk/capitalist block is cash-sufficient over a
    century. Construction, profession transition, and redistributive policy remain
    future work.
16. Pacing constants (1,000 ms accepted/capped backlog, four ticks per pump) are
    provisional reliability limits, not a guarantee that the selected days/second
    target is sustained. The achieved-rate telemetry is a 500 ms presentation
    measurement.
17. Worker protocol 2 is intentionally incompatible with protocol 1. The web and
    native bundles are built together. Native AppState/process-failure behavior is
    wired but remains unverified on a physical release build.
18. The 4 MiB save target is evaluated on the canonical uncompressed string. The
    late-game fixture (1,200 monthly summaries, 1,210 accounts) measures 2.04 MiB
    after D-065 compaction; the full campaign was not rerun. Compressed and native
    bridge sizes are separate and the repeated-value synthetic compression ratio is
    not evidence of real-world compression.
19. Autosave is best-effort at paused/background safe points. A platform that
    suspends JavaScript before the debounced save runs can lose progress since the
    last verified save; the UI does not claim otherwise. AsyncStorage cannot provide
    a true cross-key transaction, so staged/previous keys are the recovery boundary.
20. The shipped debt activation is a one-country provisional policy. The USA’s
    2,000,000 SUSD/year welfare budget, 100,000 opening treasury, GBR creditor, 4%
    coupon, 365-day term, 1,000,000 ceiling, and 365-day grace are authored scenario
    inputs, not historical claims. Other countries remain disabled.
21. The financing requirement is liquidity-based and distinct from the accounting
    fiscal result. Requested welfare is a month-to-date memo, not a payable; unpaid
    welfare is not retroactively funded. Treasury cash includes prior state-
    enterprise remittances. Contract caps (64 active, 32 recent terminated) and the
    256 aggregate-history guard are provisional bounded-state limits.
22. E3 construction uses the block profession's base daily wage
    (`baseWage1900SUSDPerYear / daysInYear`) and the existing daily income-tax
    allowance/rate on construction wages. It does not model construction-specific
    wage premiums, hiring frictions, training, or contractor margins.
23. The completion working-capital target of 30 days of level-1 upkeep is provisional
    structural content, not calibration. It is cash-limited and may be partially
    funded; the unpaid target is not a liability.
24. Construction project caps (32 non-terminal, 32 retained terminated, 256 history
    aggregates) are provisional bounded-state limits. Project ids and building ids are
    monotonic per world.
25. E3 did not model construction materials or procurement; E4 adds them. Land/space,
    infrastructure access, destruction/closure, and owner insolvency remain explicit
    later-stage dependencies; no abstract substitute is used.
26. E4 construction material bills are provisional authored inputs using existing goods
    (seed, breeding stock, netting/packaging, raw materials), not a historical
    engineering BOM. Purchase and delivery are atomic against actual regional market
    stock; unfilled orders and delayed delivery are deferred.
27. E4 sector subsidies are ad-valorem on verified daily physical output at the
    post-clearing market price, paid only from actual treasury cash. Paid amounts are
    taxable enterprise revenue; unpaid entitlement is a shortfall, not debt.
28. E4 public-enterprise support is a capital contribution to operating cash/equity. It
    does not guarantee inputs, sales, profit, level, condition, or continued operation,
    and it is not an expense, loan, or guarantee.
29. E4 private co-financing, government-supported private projects, loans, guarantees,
    investment tax credits/deductions, general goods/services procurement, public-
    enterprise expansion/discontinuation, industrial program bundles, and price/
    production controls are not implemented.
30. Schema 20 / simulation 0.20.0 / protocol 7 / data m3-economy-v5 are incompatible
    with earlier saves and clients; no migration is authorized.

## Items intentionally left open

- Campaign victory/end-state presentation (GDD §20.2 default: sandbox report).
- Native iOS/Android release builds, real-device frame rate, memory, battery,
  cold start, and on-device tick performance (M7 acceptance exception). App-layer
  gzip storage is implemented, but the full 18.76 MiB save has not been reopened
  on a device.
- Save compression inside the canonical save format or history compaction
  (future; M7 compresses only at the storage boundary).
- Worker runtime package and mobile performance device (M7 device verification).
- Historical data versioning and migration (M5).
- Source-backed 1900 age structure and pre-1950 age-specific fertility/mortality.
- Source-backed annual sex ratio at birth and exact single-year age distributions.
- Cross-engine floating-point determinism policy.
- E4 private co-financing, government-supported private projects, loans, guarantees,
  investment tax credits/deductions, general goods/services procurement/open orders,
  public-enterprise expansion/discontinuation, and industrial program bundles await
  their underlying ownership, credit, tax-credit, or closure models.
- Country-AI construction, infrastructure-priority, law, debt, diplomatic, and
  military actions await their underlying systems; M6 accepts only fiscal policy
  changes.

## D-081 — M10 diplomacy, warfare, and territorial control

**Status:** adopted for M10 implementation. **Scope:** GDD §11, §11.1–§11.5, the M10
definition of done in §17.2f ("two-country conflict resolves end-to-end; casualties and
mobilization reconcile with population/workforce; equipment and finance are consumed
correctly; peace/territorial changes update all affected systems"), and CEN-AUDIT-016.
M10 adds no M11 scope.

**Why a decision is required.** The GDD fixes the sovereignty/control distinction at a
high level and leaves government identity, markets, occupations, and war termination to
the implementation. The repository previously had no sovereignty field at all: a region
belonged to a country only through `Country.regionIds`, and market membership, customs,
currency, and building/pop ownership were already independent relationships. CEN-AUDIT-016
therefore cannot be resolved by adding a second "owner" concept; it must be resolved by
naming the existing relationship and separating temporary military control from it.

### Sovereignty and military control (CEN-AUDIT-016)

- **Sovereignty** is `Country.regionIds`: the country that legally owns the region under
  the simulation's territorial model. It changes only through an explicit, validated
  political transition (a peace-treaty cession in M10). There is no duplicate
  `Region.sovereignCountryId`; the country-to-region mapping remains the single
  authoritative sovereignty record.
- **Military control** is `Region.controllerCountryId` plus `Region.occupiedSinceDay`.
  `null` means the sovereign controls its own region. A non-null controller is a country
  exercising temporary military control over a region it does not own. It never changes
  `Country.regionIds`.
- **Market membership** stays `Region.marketId` and never changes on occupation or
  cession in M10. The market's customs administration stays with its authored country.
- **Buildings, accounts, treasuries, pop blocks, and monetary authorities are untouched
  by occupation and by cession.** Occupation transfers no cash, building, inventory,
  person, market, currency, or historical record. Taxes continue to accrue to the
  sovereign, because fiscal assessment reads sovereign regions and their pop blocks;
  the occupying power pays its own garrison cost.
- **Population location and identity** stay in the pop block's `regionId`; no one moves
  because a region is occupied. Soldiers are the one exception: recruiting moves people
  from a pop block into an army roster (they are no longer civilians), and casualties are
  recorded against the army, so total people reconcile across pop blocks, armies,
  wounded, captured, and military deaths.
- **Legal jurisdiction, laws, government, and country identity** never change on
  occupation. A region has no separate government identity in this model; the sovereign's
  `Country.laws`, `Country.regime`, and institutions apply. Cession changes the sovereign
  only, so the receiving country's laws then apply through the existing country model.
- **Diplomacy and treaty eligibility** read sovereignty and war state, never the
  controller. Peace cession transfers only regions the offering side actually controls.

### State and actions

`World.military` is authoritative plain data: `enabled`, bounded `armies`, `wars`,
`relations`, `peaceOffers`, id counters, `lastPhaseDay`, and per-country casualty
records. Region control lives on `Region` because it is a per-region fact. Military
accounts are `military-expense` (country) and `military-income` (pop block); postings are
`military-pay` (treasury to the soldiers' region households) and `military-procurement`
(treasury to the system supplier for equipment), both cash-conserving and structurally
validated like E6a freight/customs.

Five player/AI actions, all validated against world state and sharing the same rules:
`declare-war`, `offer-peace`, `accept-peace`, `recruit-army`, `deploy-army`. No diplomatic
or war points exist. AI keeps its existing fiscal behavior and gains only a bounded
peace-acceptance rule (accept a pending white peace after a documented minimum war
duration or when it controls no enemy region and has lost more personnel); AI does not
declare wars or recruit in M10, which is recorded as a limitation rather than faked.

### Military model

- Recruitment is a real transfer of people: eligible working-age people (males 18–45
  first, then females) are removed from the region's pop blocks into an army roster.
  Recruitment and equipment have real treasury costs and require an army formation delay
  before deployment. Equipment is a physical stock bought from a non-simulated system
  supplier at a documented SUSD unit price (domestic arms production is deferred).
- Daily upkeep is paid from actual treasury cash. A shortfall pays pro rata and lowers
  supply/organization; it never creates money or negative balances.
- Combat occurs when hostile armies are in the same region. Strength derives from
  personnel, equipment ratio, organization, and supply. Casualties are allocated to
  deaths, wounded, and captured; the split is deterministic from the keyed RNG. Wounded
  return to the roster after a recovery window; deaths and captures are permanently
  removed and recorded. Equipment is lost with casualties. There is no abstract
  war-score.
- Movement is a strategic abstraction without a region-adjacency graph: deployment takes
  a documented number of days to any region the country may legally enter (its own or
  controlled regions, or an at-war country's region). A region is occupied when a hostile
  army is present, the region is sovereign territory of an at-war country, and no army of
  that sovereign is present. A sovereign army entering an occupied region fights the
  occupier and liberates it if it wins. Occupation applies a daily unrest increment and a
  daily garrison cost to the controller; these use existing unrest and treasury channels.
- Peace offers are white peace or cession of regions the offerer controls. Acceptance
  ends the war, clears both sides' occupations, sets a truce, and, for cession, moves
  sovereignty and `Country.regionIds` only. Market membership, buildings, people, cash,
  inventories, and monetary authorities are unchanged. Unsupported permanent changes
  (independence, partition, regime change, annexation without a treaty, border adjustment
  outside occupation) are rejected and documented.

### Deferrals and limits

- No tactical combat, terrain/weather model, fortifications, supply lines, navies,
  allies, sanctions, recognition, subject relationships, war exhaustion meter, or
  negotiated multi-term peace. The GDD's listed concepts are implemented only where M10's
  end-to-end conflict and the sovereignty mandate require them; the rest are recorded
  missing prerequisites, not decorative controls.
- No AI war strategy, recruitment, or deployment; no alliance obligations.
- No wartime trade/customs changes beyond existing systems; occupation does not alter
  market membership, customs administration, currency, or convertibility.
- Movement distance is a constant strategic delay, not a geographic path.
- The model is provisional and uncalibrated.

**Versions:** world schema **26**, simulation **0.26.0**, worker protocol **13**, data
**`m3-economy-v11`**; older saves and protocol-12 clients are rejected under D-013 with
no migration.

## D-082 — Audit remediation batch 1: compaction, save schema, staging isolation, fiscal reporting, and casualty semantics

**Status:** implemented. Fixes AUDIT-001 through AUDIT-005 from the post-M10 audit. World
schema, simulation version, worker protocol, and data version are unchanged.

### Decisions

1. **Monthly compaction retains military expense.** `compactFinanceHistory` now copies
   `militaryExpenseSUSD` alongside the other retained fiscal categories. The frozen
   `netFiscalResultSUSD` already includes military expense, so omitting the component made
   the compacted summary unreconcilable and wedged the monthly close at the 13th close.
2. **The app save adapter uses the current schema.** `SUPPORTED_SAVE_SCHEMA_VERSION` is
   synchronized to the current world schema (26) and guarded by a test that compares the
   app literal with `WORLD_SCHEMA_VERSION`. The app adapter itself is exercised through
   its real `SaveStore` and the worker `LOAD` validator; incompatible old saves still
   fail explicitly (no migration).
3. **Staged-day cloning is complete.** `cloneWorld` deep-copies `World.military` and
   `copyCountry` deep-copies `Country.trade`, restoring the GDD §4.2 whole-day atomicity
   guarantee. A late-phase failure no longer leaves military or trade mutations on the
   caller's world.
4. **Fiscal snapshots carry every implemented category.** `SnapshotFiscalTotals` and
   `SnapshotAnnualReport` gain optional `educationExpenseSUSD`, `trainingExpenseSUSD`,
   `customsDutyRevenueSUSD`, and `militaryExpenseSUSD` fields; current snapshots always
   populate them. The fields are additive and optional, so protocol 13 remains compatible
   with older snapshots that omit them (reports show zero). The budget and ledger screens
   display the components and describe the actual net formula.
5. **Country casualty snapshots use cumulative records.** `CountrySnapshot.military.deaths`
   and `captured` derive from the authoritative cumulative casualty records rather than
   summing surviving formations; `wounded` remains the current roster count. Labels state
   the distinction.

### Consequences

- A campaign with military spending can pass the 13th and later monthly closes; compacted
  history remains valid.
- App save/load works for schema-26 saves; old schemas are still rejected.
- Failed ticks leave the original world, hash, and serialized representation unchanged for
  military and trade state as well as the previously staged systems.
- The player-facing monthly/annual reports reconcile with their displayed components and
  show military expenditure.
- The generated worker bundle was regenerated. No save schema, simulation, protocol, or
  data version bump was required.

## D-083 — Audit remediation batch 2: explicit military allocation, clean-checkout typecheck, and CI time budget

**Status:** implemented. Fixes AUDIT-006, AUDIT-007, and AUDIT-008 from the post-M10
audit. World schema **26**, simulation **0.26.0**, worker protocol **13**, and data
version **`m3-economy-v11`** are unchanged; no authoritative state shape changed.

### Decisions

1. **Military recruitment uses two-stage largest-remainder apportionment.** Eligibility
   is unchanged: people aged 18–45, males before females, youngest ages first within a
   block. For the male stage, `min(requested, regional male pool)` is apportioned across
   blocks in proportion to each block's available male 18–45 population. If the request
   exceeds the male pool, the remaining female recruitment is apportioned the same way
   over the female 18–45 pools. Exact BigInt remainders are ranked by (1) remainder,
   (2) eligible weight, (3) total block population, (4) a keyed `drawUint32` tie using
   the block, seed, day, and stage, and (5) the input index only for an exact tie-draw
   collision. Capacity is enforced per block, so no block supplies more people than it
   has. This satisfies GDD §4.3: the allocation is proportional to eligible population,
   not pop-array order or numeric id.
2. **Signing costs follow the suppliers.** Each block is paid exactly
   `recruits supplied * M10_RECRUITMENT_COST_PER_SOLDIER_SUSD`, so the
   treasury-to-household transfer reflects the people actually removed. No source block
   is stored on the army.
3. **Daily pay and garrison payments are population-weighted.** No formation-source
   record is persisted, so the smallest coherent rule is used: the region's
   recruitment-eligible people (fallback: total civilian population) are the weights,
   and the payable amount is split proportionally. The floating remainder goes to the
   largest-weight recipient under the same deterministic tie order. Signing, pay, and
   garrison each post one existing four-line `military-pay` entry per recipient block;
   the posting contract, account set, and cash-conservation rules are unchanged.
4. **Returning wounded follows the same population rule.** A destroyed formation returns
   wounded to its home region proportional to current eligible people (fallbacks: total
   population, then an even split), still into male 18–45 cells. This removes the last
   ascending-id pop-block allocation from `military.ts`; the remaining army/occupier
   selection is a stable entity ordering, not a population allocation rule.
5. **Clean-checkout typechecking is build-first.** `build:libs` compiles `@century/sim`,
   then `@century/data`, then `@century/sim-worker` in dependency order. Root `typecheck`
   and `check:worker` invoke it before resolving package exports, so a clean checkout
   generates the real `dist/*.d.ts` declarations instead of relying on ignored local
   files. No path aliases bypass package export contracts and no build output is
   committed. Data follows sim because it consumes sim's public API; sim-worker also
   consumes sim's declarations, and the data build is required by the scenario check.
   The CI correctness job now runs `check:worker` before typecheck.
6. **CI separates correctness from benchmarking.** The correctness job runs install,
   lint, generated-artifact checks, typecheck, and tests with a **45-minute** timeout.
   The post-M10 audit measured `pnpm test` alone at about 22.1 minutes; the other steps
   add a few minutes, so 45 minutes leaves a realistic margin. The benchmark job retains
   `pnpm run bench` unchanged, runs after correctness via `needs: verify`, and has a
   **30-minute** timeout. The benchmark step was neither removed nor weakened.

### Consequences

- Recruitment, signing pay, daily pay, and garrison spending no longer concentrate in
  the lowest-id block. In the shipped eight-polity scenario that block is the small
  academics block, so the pre-fix behavior distorted that profession's population,
  household cash, and demand.
- Population, employment, and accounting invariants are preserved: people removed equal
  people added to the roster, every posting is balanced, and no money or people are
  created. Military balance parameters (signing cost, daily pay, garrison cost,
  equipment price, casualties) are unchanged.
- Determinism is preserved through explicit keyed draws and order-independent
  apportionment; reversing pop-block storage order does not change per-block
  allocations.
- The committed app worker bundle was regenerated because the simulation source
  changed. No schema, simulation, protocol, or data version bump was required: the
  authoritative state shape and protocol are unchanged.

## D-084 — Audit remediation batch 3: speeds, cession safety, zero-recipient pay, truce, casualties, payroll, and save validation

**Status:** implemented. Fixes AUDIT-009 through AUDIT-015 from the post-M10 audit.
World schema **26**, simulation **0.26.0**, worker protocol **13**, and data version
**`m3-economy-v11`** remain unchanged; no authoritative state shape or save format
changed.

### Decisions

1. **Speed controls match GDD §3.2.** `SPEED_VALUES` is now `[1, 3, 10, 30]` days per
   second. The app derives its selectable buttons and labels from that one constant, and
   the worker parser rejects every other value with `invalid_speed`. The normal 100 ms
   pump cadence runs three deterministic ticks per pump at 30×; the four-tick per-pump
   cap from D-064 remains the bounded catch-up policy for stalls, so 30× is a best-effort
   target rather than a guarantee during timer coalescing. The 20.3-minute campaign
   figure is the static 36,524 / 30 arithmetic estimate in the GDD, not a measurement.
   No protocol version bump: the `SET_SPEED` command and snapshot shapes are unchanged;
   only the validated value set was corrected to the documented specification.
2. **Cession is validated before mutation.** A `cede-occupied` term transfers every
   region of the opponent that the offerer currently controls. `cessionError` requires at
   least one controlled region and requires the ceding country to retain at least one
   sovereign region. The check runs at offer creation, again at acceptance against the
   current occupations (stale offers are revalidated), and in `applyPeace` before the war,
   truce, or sovereignty state is mutated. `transferRegionSovereignty` also refuses to
   remove a country's last region as a defensive guard. Invalid actions leave the world
   and hash unchanged.
3. **No recipient means no payment-dependent effect.** Batch 2 already made daily pay
   and garrison payments require a real pop-block recipient. This batch adds explicit
   coverage: with a zero-population occupied region, only the equipment supplier can be
   paid; soldiers' pay and garrison costs are reported as shortfall, no `military-pay`
   posting is created, the treasury does not move for them, and supply/organization do
   not recover. A populated region's eligibility fallback to total civilian population is
   unchanged.
4. **Truce duration is elapsed-time inclusive.** A peace on day P sets the inclusive
   last prohibited day `truceUntilDay = P + 365`. The 365 full truce days are P+1 through
   P+365; the peace day P is also prohibited defensively, and a new declaration is first
   legal on P+366. `validateDeclareWar` uses `world.dayIndex <= truceUntilDay`. This is
   the existing behavior, now documented and covered at P, P+365, and P+366.
5. **All three casualty shares are active.** `splitMilitaryCasualties` apportions integer
   losses across deaths, wounded, and captured using integer per-mille weights from
   `M10_DEATH_SHARE`, `M10_WOUNDED_SHARE`, and `M10_CAPTURED_SHARE` with exact
   largest-remainder arithmetic. Equal remainders break in category order (deaths,
   wounded, captured). `M10_CAPTURED_SHARE` is retained and now controls the captured
   share instead of being an unused residual. Losses always sum exactly.
6. **Government payroll treatment is explicit.** The GDD §6.5 wealth convention is
   settlement wages plus welfare. The M4c income-tax withholding pass reads that same
   settlement wage receipt; construction wages keep their documented separate E3
   withholding path. Administration, education, training, and military payroll are paid
   after (or after withholding within) the fiscal phase and are deliberately outside both
   the income-tax base and the monthly wealth income basis. This avoids taxing income
   before receipt, double taxation, and treating a later payment as earlier wealth income.
   This batch documents the existing behavior; it does not change payroll amounts.
7. **Malformed military states are rejected early.** When military is enabled, every
   country must have exactly one `military-expense` account and every pop block exactly
   one `military-income` account. A disabled system must have empty armies, wars,
   relations, offers, casualties, and no last-phase day. Each peace offer must reference
   an active war and exactly that war's two belligerents. `nextArmyId`, `nextWarId`, and
   `nextOfferId` must be greater than every retained record id. Valid enabled and
   disabled saves continue to load; no migration or schema bump is needed.

### Consequences

- The UI, worker parser, and scheduler now agree on the GDD speed set; unsupported 2×
  and 5× values are rejected consistently.
- Last-region cession attempts fail at validation with a specific reason instead of
  relying on a later generic world-validation failure.
- A zero-population region cannot receive free military services; unpaid amounts remain
  visible as shortfall.
- Truce boundaries are unambiguous and tested, with no hidden extra day.
- Captured casualty counts follow the configured 15% share, and every battle loss is
  conserved across the three categories.
- Government payroll remains outside the tax/wealth bases by explicit documented rule;
  no income is counted before payment or taxed twice.
- Crafted saves with missing military accounts, mismatched offers, disabled-but-active
  state, or stale id counters now fail at load with useful errors.
- The committed worker bundle was regenerated. No GDD file, schema, simulation,
  protocol, or data version was changed: the GDD already specified the corrected speed
  set, last-region rule, 365-day truce, and settlement-wage wealth convention.

## D-085 — Audit remediation batch 4: determinism evidence, documentation, UI copy, and final validation

**Status:** implemented. Closes AUDIT-016 through AUDIT-022 from the post-M10 audit.
World schema **26**, simulation **0.26.0**, worker protocol **13**, and data version
**`m3-economy-v11`** remain unchanged.

### Decisions

1. **Determinism evidence distinguishes the driver digest from economic simulation.**
   The existing known-answer digest is retained as an explicitly empty-world M1 tick-driver
   vector (no pop blocks, buildings, or markets) and its stale schema-25 comment is
   corrected to schema 26. A new bounded one-year test runs the m5 multi-block/multi-market
   fixture for 365 ticks twice, compares summaries/hash/serialization, and verifies
   save/resume at day 180 produces the same final state. It does not measure performance.
2. **GDD implementation record is reconciled with Batches 2–4.** §17H.3 now states the
   proportional recruitment/allocation and payment rules, the active casualty shares, the
   cession last-region check, and the elapsed-time truce boundary. §17H.5 now lists the
   additional keyed allocation tie-breaks and the required enabled-military accounts. This
   is a correction of the existing v2.17 implementation record, not a new mechanic or a
   new GDD version.
3. **Stale UI copy is corrected.** The app status export is `playable-shell` rather than a
   pre-M7 placeholder; the Politics law-slot fallback describes the current scenario rather
   than claiming M9/E5/M10/E6b dependencies; and the War help text states the 18–45
   recruitment age rather than generic working age.
4. **Fiscal validation formatting is repaired.** A run-together declaration and `if` in
   `assertValidFinanceState`, and a run-together construction-wage/capitalization entry in
   the account semantic matrix, are split onto separate lines; no validation logic changed.
5. **Military actions validate their day and accounting period.** `applyMilitaryAction`
   rejects a day different from `world.dayIndex`, the terminal boundary, and a day at or
   before `finance.closedThroughDay`. `validateMilitaryAction` reports the same errors when
   the action carries a day. This prevents direct API callers from posting military
   entries into the wrong or closed period.
6. **Worker events always pass through the supervisor.** The native transport no longer
   has a direct `handleEvent` fallback when no supervisor exists. Every READY/SNAPSHOT and
   command reply is therefore subject to the supervisor's sequence gating and late-reply
   checks; teardown-time events are dropped rather than applied out of order.
7. **Recruitment reconciles civilian employment.** Recruits are removed from working-age
   population, so existing assignments that would exceed the remaining working-age
   population are reduced deterministically in ascending assignment-id order and the
   employment system is marked dirty for the next refresh. The action snapshot now includes
   employment and `employmentDirty`, so a later failure restores both atomically. This keeps
   population/employment invariants intact without inventing a new labor model.

### Consequences

- Determinism coverage now includes real population, buildings, markets, wages, needs,
  migration, and fiscal flows, while the empty-world digest remains a precise driver
  regression vector.
- The GDD and decision records describe the behavior actually implemented by Batches 2–4.
- Player-facing text no longer advertises obsolete milestone limitations.
- Military actions cannot silently post into a stale or closed accounting period.
- Stale worker snapshots cannot bypass supervisor sequencing through the native fallback.
- Recruitment no longer leaves civilian assignments above the remaining working-age
  population, and failed recruitment leaves employment unchanged.
- No schema, simulation, protocol, data, or save-format change was required. The committed
  worker bundle was regenerated because the simulation source changed.

## D-086 — Historical classification and the 1900 polity catalog

**Status:** implemented (M11). World schema 26, simulation 0.27.0, protocol 14,
data `m3-economy-v12`.

### Context

The game began from an eight-polity sample. M11 requires every independent
sovereign state on 1 January 1900 to be playable, with dependencies represented
accurately rather than flattened into independent countries.

### Decision

1. The classification follows the Gleditsch–Ward / Correlates of War independent-
   state tradition documented by CShapes 2.0. It distinguishes `independent`,
   `personal-union`, `autonomous-vassal`, `dominion`, `self-governing-colony`,
   `protectorate`, `colony`, `occupation`, `autonomous-province` and `dependency`.
2. Selectable statuses are `independent`, `personal-union`, `autonomous-vassal`
   and `dominion`. The four semi-sovereign statuses are selectable only because
   the catalog records a separate government that the simulation can represent;
   their non-sovereign status remains visible.
3. The catalog (`polities_1900.json`) records stable id, historical name, common
   name, status, parent, capital, population estimate and confidence, continent,
   market, description, notes, sources and a geometry crosswalk.
4. Every independent state in the documented classification is present and
   selectable. The catalog contains 60 states (59 selectable) and 62 dependent
   territories.

### Consequences

- The playable world is 122 regions and 60 countries, not an eight-country sample.
- The legacy eight-polity scenario is retained only as a validated test fixture.
- Catalog completeness is enforced by `m11-world.test.ts` and by the loader's
  metadata cross-reference validation.

## D-087 — Dependent territories are regions of their sovereign country

**Status:** implemented (M11).

### Context

A colony could be modelled as a separate simulation country, or as a region of
the metropole. Separate countries would either double the country count or force
multi-market countries; the sim's M5 invariant permits one market per country.

### Decision

1. A state entry becomes one `Country` and its home region.
2. A territory entry becomes one `Region` owned by its sovereign country.
3. A country's home and dependent regions share one market. Imperial markets are
   customs areas, not claims that colonies are the metropole.
4. Territory status/parent/capital are exposed as static region metadata, not
   mutable authoritative state and not a sovereignty transfer.

### Consequences

- D-081 is preserved: ownership remains `Country.regionIds`; occupation remains
  `Region.controllerCountryId`.
- A territory is clickable and resolves to a real `regionId`.
- Multi-market countries remain unsupported; this is recorded as a deliberate
  limit for M11.

## D-088 — Proportional historical world initialization

**Status:** implemented (M11), provisional calibration.

### Context

Authoring 122 detailed regional economies by hand is not feasible, and cloning
one existing country would violate the requirement not to fabricate distinct
economies by renaming.

### Decision

1. Every region has a documented archetype (industrial, mixed, agrarian) derived
   from its 1900 population, occupation structure and urbanization.
2. Population blocks are split from the authored total and peasant share, with
   tier-dependent shares for laborers, clerks, academics and capitalists.
3. Buildings are initialized from calibrated sample ratios: rural regions carry
   grain and storage; the customs core and higher-tier countries carry
   processing, textiles, protein and workshops for the market.
4. Fiscal, technology, law and debt starts are tier/status-driven authored
   parameters.
5. All coefficients are labelled provisional; historical facts, estimates,
   model assumptions and balancing parameters are kept separate in the source
   notes.

### Consequences

- Every selectable country starts with valid accounts, population, buildings,
  market membership, laws, technology and AI assignment.
- The world is a structural historical abstraction, not a measured 1900 economy.
- Full-world tick cost is higher than the sample; high simulation speeds remain
  best-effort and are displayed as such.

## D-089 — Explicit player-country selection through the worker protocol

**Status:** implemented (M11). Protocol 14.

### Context

The old shell defaulted to a fixed scenario player and had no way to choose a
country. Implicit first-array defaults are forbidden.

### Decision

1. `CREATE_GAME { playerCountryId }` rebuilds a fresh world with the selected
   `World.playerCountryId`.
2. The host rejects unknown ids and non-selectable catalog entries; it never
   falls back to a default country.
3. The app's flow is main menu → new-game brief → map/list selection → confirm →
   `CREATE_GAME` → game. The game view appears only after `NEW_GAME_RESULT`.
4. Player identity is authoritative world state, serialized in saves, validated
   on load, and re-created after a worker restart for the remembered country.
5. The AI phase skips `world.playerCountryId`.

### Consequences

- No implicit "country 0".
- A save from another scenario is rejected by the scenario-id check.
- A rejected selection leaves the previous world intact and reports the error.

## D-090 — Bounded country detail in snapshots

**Status:** implemented (M11). Protocol 14.

### Context

A full `CountrySnapshot` is about 35–40 KiB. Sixty full records exceed 2 MiB per
snapshot, which is impractical for a 10 Hz presentation bus.

### Decision

1. `SimulationSnapshot.countries` carries full detail only for the player country
   and the focused country.
2. `countrySummaries` carries a compact record for every country: identity,
   status, sovereign, capital, region/market ids, population, employment,
   treasury, hardship, literacy, wealth, militancy, military personnel and the
   last closed net fiscal result.
3. `SET_FOCUS` is presentation-only and changes which country's full record is
   included. It is validated against the world but never mutates simulation
   state.
4. Legacy scenarios without catalog metadata keep the pre-M11 all-countries
   behavior so existing fixtures and tests remain meaningful.

### Consequences

- The M11 snapshot is about 200 KiB instead of about 2.5 MiB.
- Screens that inspect an AI country rely on the focus round-trip; the map/list
  always has summary data and never blocks on focus.
- No serialized world field changed, so world schema remains 26.

## D-091 — Market identity is authored from actual membership

**Status:** implemented (M11).

### Context

The snapshot previously labelled markets `Market 1`, `Market 2`, …; this is an
opaque id, not a player-facing identity, and it hid multi-country membership.

### Decision

1. The catalog authors 18 markets with display name, kind and description
   derived from their real member countries and regions.
2. `MarketSnapshot` exposes `name`, `description`, `kind`, `memberCountryIds`,
   `regionIds`, customs administration and prices.
3. The snapshot builder never falls back to `Market N`: without authored metadata
   it derives a name from the member countries.
4. Market screens list every member country and region and distinguish customs
   administration from sovereignty. The numeric id is secondary diagnostic text.
5. Market membership is not assumed to equal one country. Imperial markets
   include dependent territories; shared markets include several countries.

### Consequences

- A market is discoverable from the map, the country panel and the Markets
  screen.
- The one-market-per-country invariant is preserved; see D-087.

## D-092 — Offline map geometry, licensing and projection

**Status:** implemented (M11).

### Context

M11 requires a real historical map that works offline. Historical vector
datasets were reviewed for licensing and compatibility.

### Decision

1. Geometry is Natural Earth 1:50m (public domain) via world-atlas 2.0.2 TopoJSON
   (ISC), aggregated into 1900 polities by the catalog crosswalk.
2. CShapes 2.0 (CC BY-NC-SA 4.0) is consulted only for classification and is not
   redistributed. historical-basemaps (GPL-3.0, copyleft) is not used.
3. Build-time union uses `polygon-clipping` 0.15.7 (MIT). Source polygons are
   simplified to 0.02°, quantized to 0.001°, delta encoded, and unwrapped at the
   antimeridian.
4. South Africa is split using Natural Earth admin-1 provinces; Newfoundland is a
   marker territory because the source cannot separate it from Canada.
5. The renderer uses a Miller cylindrical projection with linear longitude, so
   each ring can be drawn at −360/0/+360 offsets for the seam.
6. The map is bundled. The game never fetches map data or map tiles at runtime;
   no API keys or proprietary services are used.
7. `react-native-svg` 15.16.0 (MIT), the Expo 58 bundled version, renders the
   map on web and native.

### Consequences

- The map works offline and the licence permits redistribution.
- 1900 borders are a crosswalk aggregation, not a historical GIS dataset; the
  limits are documented in §17I.12.
- Build scripts download the sources once into `.cache-m11`; the committed
  bundles are the runtime artifacts.

## D-093 — Slider-first continuous controls with coalesced commits

**Status:** implemented (M11).

### Context

The pre-M11 screens used text fields and quick-set buttons for continuous policy
values, which is imprecise, inaccessible and easy to race against the worker.

### Decision

1. Continuous numeric player controls use `SliderField`: visible value, min/max,
   step, unit, ticks, live preview and a paired numeric input.
2. Sliders support mouse, touch, keyboard step buttons, the platform's
   accessible increment/decrement actions, and typed precision.
3. Commits are coalesced by `useDeferredCommit`: one authoritative action is in
   flight at a time and the latest value wins. Sliders are disabled while the
   worker is unavailable.
4. Categorical, boolean, date, speed, market/country and confirmation inputs are
   explicitly excluded; the inventory is `docs/M11_SLIDER_INVENTORY.md`.
5. Every slider value maps to a validated action through the existing
   `APPLY_ACTION` boundary; the UI never mutates simulation internals.

### Consequences

- Policy changes are always authoritative actions, with previews remaining
  local.
- The slider ranges are constrained to values the authoritative validator
  accepts; endpoints and out-of-range cases are covered by tests.
- Some low-level derived values (for example contract ids) remain read-only.

## D-094 — Curated historical flag system keyed by polity ID

**Status:** implemented (M11 flag feature).

### Context

The 1900 catalog had no flag artwork: every polity was represented by the
existing monogram (national colour plus two-letter tag). The flag feature
requires historically correct 1 January 1900 flags, PD/CC0-only artwork,
offline runtime behaviour, and no change to simulation behaviour or the
political definitions of the catalog.

### Decision

1. The curated approval list is
   `packages/data/data/historical/m11/flags_1900.json`. It records, per flag,
   the Commons file, licence and licence code, author, source URLs, source
   SHA-1 and dimensions, validity window, retrieval date and historical notes;
   and per polity, a flag ID or an explicit fallback reason plus a basis
   (`national`, `sovereign-flag`, `documented-exception`, `fallback`).
2. Flags are resolved only through stable numeric polity IDs
   (`POLITY_FLAG`), never display names. `CountryFlag` takes `polityId` and
   renders the monogram when the mapping has no asset.
3. Every file was checked individually through the Wikimedia Commons API.
   Only licence code `pd` (Public Domain, including PD-old/PD-self/PD-ineligible)
   or `cc0` is accepted by the pipeline; CC BY, CC BY-SA and GFDL are rejected.
4. `scripts/m11/build-flags.mjs` retrieves the approved Commons renditions at a
   normalized 500 px width (preserving each flag's own ratio), converts the one
   approved JPEG source to PNG, validates the PNG structure and writes the
   committed assets, ledger, generated mapping, generated provenance module and
   `docs/FLAG_PROVENANCE.md`. `pnpm flags:check` is offline and verifies the
   committed hashes and generated outputs; `pnpm flags:audit` re-verifies the
   live Commons licences. Normal builds never run the network path.
5. `jimp-compact@0.16.1` is added as a root **devDependency** solely for the
   build-time JPEG-to-PNG conversion of the CC0 1886 Qajar flag. It has no
   runtime or bundle impact.
6. Monogram fallbacks: Spain (ESP) and its colonies SAH/SGG (no PD/CC0 artwork
   of the 1875–1931 state flag with the Restoration arms), Montenegro (MNT;
   national flag not standardised in 1900 and the only PD file is the war
   ensign) and the Transvaal (ZAR; the Vierkleur artwork is CC BY-SA).
7. Canada uses the 1868–1921 Red Ensign as the distinctive de facto flag, with
   the Union Jack's continuing official status documented. Australia and New
   Zealand use the Union Jack (federation on 1 January 1901; New Zealand's own
   ensign dates from 1902).
8. Dependent territories use the sovereign's flag plus the existing status
   badge. Egypt is the single documented exception (its own khedival flag,
   because it was an autonomous Ottoman province with a recognised flag, not a
   colony).
9. Austria-Hungary is absent from the existing 1900 catalog. The catalog was
   deliberately not changed; the absence and the correct civil-ensign nuance
   are recorded in `docs/FLAG_PROVENANCE.md`.

### Consequences

- The feature is presentation-only: no simulation state, data version,
  simulation version, determinism or snapshot contract changes.
- The app bundle carries committed PNG assets; displaying a flag never touches
  the network.
- 56 flags are bundled and 5 polities use the documented monogram fallback
  (ESP, MNT, ZAR, SAH, SGG).
- Adding an Austria-Hungary polity later requires a flag manifest and
  provenance regeneration.
- *M11b supersedes the counts and fallbacks above; see D-095.*

## D-095 — M11b complete 1900 catalog and monogram removal

**Status:** implemented (M11b).

### Context

The M11 catalog was derived from the GWD/COW independent-state tradition but
omitted Austria-Hungary entirely, did not separately represent several de facto
or autonomous 1900 polities, and left five documented monogram fallbacks
(Spain, Spanish Sahara, Spanish Guinea, Montenegro and the Transvaal). The M11b
task requires a systematic regional inventory, actual in-game additions, map
integration, full flag artwork and a formal coverage audit.

### Decision

1. **Inventory scope.** The audit reconciles 60 `independent`-status states,
   including four de facto/partially recognised African/Arabian states (Sokoto,
   Wadai, Darfur, Jabal Shammar), plus six other self-governing or occupied
   states already present (Bulgaria, Norway, Canada, Australia, New Zealand,
   Cuba) and one added autonomous state (Crete). The full sources, contested
   cases and omissions are in `docs/1900_CATALOG_COVERAGE.md`.
2. **Austria-Hungary is one state (ID 60), not two.** Its catalog entry records
   the dual structure, the Austrian and Hungarian halves, the joint ministries,
   the separate parliaments, the jointly administered Bosnia and the co-capital.
   Its flag is the common civil ensign because there was no single unified
   national flag.
3. **Stable IDs.** New states use 60–66 and new territories use 162–165. No
   existing polity ID is renumbered. Existing saves remain loadable: the save
   carries its original world, static metadata is looked up by `countryId`, and
   the additive entries do not alter existing IDs, tags or region ownership.
4. **Map integration.** Austria-Hungary uses a polygon of its core modern units.
   Polities without reliable 1900 polygon data use the existing marker-only map
   mechanism at their capitals, marked `markerOnly`/`approximate`; no borders are
   invented and no polygons overlap.
5. **Flags.** Spain and the Transvaal Vierkleur are original Century
   reconstructions; Spain composites an individually verified PD coat-of-arms
   component and the project owns the composition. Montenegrin, Austrian,
   Tongan, Cretan, Sokotan and Ha'il flags are individually verified PD Commons
   files. Project artwork is recorded separately from its historical sources.
   Wadai and Darfur remain documented monogram exceptions because no verified
   historical flag design could be established.
6. **Markets.** Two markets are added: `austro-hungarian` and `pacific`.
   Sokoto/Wadai/Darfur join `african-independent`; Jabal Shammar and Crete join
   `ottoman-egyptian`.
7. **Data/versioning.** Scenario content changes, so the generated tables,
   scenario and worker bundle are regenerated. The data version remains
   `m3-economy-v12`, world schema 26 and save format 1 because no authoritative
   state shape, unit, formula or save field changed.

### Consequences

- Final catalog: **67 states**, **66 territories**, **133 regions**,
  **20 markets**, **66 selectable states**.
- Flag assets: **64** (62 external PD/CC0, 2 project reconstructions); 131 of 133
  polities display a flag; only Wadai and Darfur use the monogram.
- The new African and Arabian states, Crete and Tonga have low-confidence
  starting data; they are playable but explicitly provisional.
- Austria-Hungary's Galicia, Transylvania, Vojvodina and South Tyrol are included
  in its population but not its core map polygon; the limitation is documented.
- New marker-only polities are fully selectable and picker-integrated but not
  drawn as territories until reliable 1900 polygons are available.

## D-096 — M11c historical geography, border reconstruction and representation audit

**Status:** implemented (M11c).

### Context

M11/M11b aggregated modern Natural Earth units into 1900 polities. That left
Libya as an unassigned void, kept modern German borders, and preserved many
post-1900 borders (Alsace-Lorraine inside France, Congress Poland inside Russia,
Austria-Hungary's lost provinces outside its polygon, Siam's ceded provinces
outside Siam, the African sultanates as markers, etc.). M11c requires a
systematic historical-border audit of every catalogued polity, not a modern
border with a few fragments added.

### Decision

1. **Modern units are building blocks only.** Base geometry remains Natural
   Earth 1:50m/world-atlas; 1:10m admin-1/admin-0 units are added as
   reconstruction blocks. No modern unit is accepted as a 1900 border without
   an explicit transfer or a documented verification.
2. **Explicit, sourced transfers.** Every territorial change is an authored
   record in `boundaries_1900.json` (destination, source polities, source units
   or polygon, optional clip/subtract, dated sources, confidence and notes).
   The build clips each transfer to its source polity, applies additions and
   removals with `polygon-clipping`, and resolves residual overlaps
   deterministically (destination beats source; otherwise the smaller polity
   keeps the sliver).
3. **Germany is the German Empire (1900), not the Federal Republic.** The
   reconstruction includes Alsace-Lorraine, North Schleswig, Eupen-Malmedy,
   Memel, East Prussia/Kaliningrad, and the Prussian eastern provinces clipped
   to the authored 1900 Russian/Austrian frontier. The frontier strip is MEDIUM
   confidence; the provinces are HIGH.
4. **Libya is Ottoman, not a modern Libyan state.** The modern Libyan outer
   frame is assigned to OTT, minus the Aouzou strip (left with Chad). The map
   provenance records Tripolitania, Cyrenaica and Fezzan separately, including
   the limits of effective control. No `LBY` polity is added.
5. **No marker-only polities remain.** Tonga, Sokoto, Wadai, Darfur, Jabal
   Shammar, Crete, Tibet, Khiva, Bukhara and Sarawak receive reconstructed
   polygons with explicit LOW/MEDIUM confidence. They remain simulation
   entries with unchanged IDs.
6. **Provenance is part of the map artifact.** Every polity entry carries the
   reference date, sources with URLs/licences, geometry class, confidence,
   underlying boundary date, deviations from the modern map, known
   uncertainties, transfer ids and optional composite components.
7. **Audit is generated and tested.** `audit-map.mjs` writes
   `world_map_1900_audit.json`; `m11c-geography.test.ts` checks validity,
   point-in-polygon history, provenance completeness, German/Libyan coverage,
   the absence of marker-only entries, the two documented residual coastline
   slivers and the absence of multi-sample land voids.
8. **No authoritative simulation change.** Polity IDs, tags, populations,
   markets, schema, save format and deterministic behavior are unchanged. The
   M11c work is scenario/map presentation plus provenance documentation.

### Consequences

- The map now shows a historically bounded German Empire, an Ottoman Libya and
  reconstructed borders across Europe, Asia, Africa, the Americas and Oceania.
- Residual generalization artefacts are documented, not hidden: the audit
  reports Canada/Newfoundland (0.249 deg²) and Bolivia/Brazil (0.016 deg²)
  coastline slivers, and 24 single-sample 1° coastal/island gaps. There is no
  multi-sample terrestrial void.
- Wadai and Darfur retain monogram flags: the M11c research found no defensible
  1900 national/state flag, only modern reconstructions, military standards or
  post-1900 movement flags. Their territories are now drawn.
- The full per-polity audit table and sources are in
  `docs/HISTORICAL_MAP_PROVENANCE.md`; the coverage reconciliation is updated in
  `docs/1900_CATALOG_COVERAGE.md`; the flag investigation is in
  `docs/FLAG_PROVENANCE.md`.


## D-097 — M11c.1 Aouzou dispute, overlap resolution, rendering and zoom

**Status:** implemented (M11c.1).

### Context

M11c left the Aouzou strip with French Equatorial Africa, reported two residual
overlaps, used a 1° coverage sample that missed narrow coastlines and islands,
had a stale land layer outside the zoom transform, and stopped at scale 10.
The user also selected Darfur and Wadai flag designs.

### Decision

1. **Aouzou–Tibesti is a disputed map-only zone, not FEA and not OTT.** The 1899
   Anglo-French Declaration was a sphere-of-influence line; the ICJ record shows
   later instruments (1919, 1902, 1955) were needed to settle the boundary.
   France had not established continuous administration across Tibesti; Ottoman
   authority was claimed and intermittent; Toubou/Teda communities held practical
   authority. The zone is removed from every polity, carries explicit claims,
   administration notes and ICJ sources, and adds no playable polity. A second
   small zone records the undelimited Karakoram–Siachen frontier.
2. **Overlaps are extracted, recorded and trimmed.** The Canada/Newfoundland
   intersection (0.249 deg²) and Bolivia/Brazil intersection (0.016 deg²) are
   written to `overlapResolutions` with bbox, area, decision and historical note.
   The Labrador dispute and the 1927 Privy Council line are not treated as a
   settled 1900 border; Acre is Bolivian in 1900 and the Treaty of Petrópolis is
   not applied retroactively. Only the sliver is trimmed.
3. **Coverage audit is polygon-level and high-resolution.** The audit groups
   land rings into outer/hole polygons, subtracts the union of polities and
   disputed zones per 30×30° tile, and reports total unassigned area, connected
   components, intentional Antarctica, sub-0.02° generalization slivers and
   small-island detail gaps. The 1° sample remains as a cross-check.
4. **Rendering layer order is synchronized.** The land mask moved inside the
   country transform group; it now zooms and pans with the fills and cannot
   paint over the ocean at a different scale. Land uses the even-odd rule for
   inland water holes; border strokes scale inversely so they remain constant
   width.
5. **Maximum zoom is 18** (previous 10, 1.8×). Wheel/trackpad/pinch zoom uses a
   letterbox-aware focal point and bounded pan; the pure viewport math is tested.
6. **Darfur/Wadai flags.** The Pax Historia rasters were inspected but are not
   bundled because redistribution permission was not established. Century
   independently reconstructed the simple geometric designs (green-red-black
   triband with white crescent; white field with black border), classifies them
   as user-selected representative flags rather than exact historical national
   flags, and records the decision in the manifest, provenance module and docs.

### Consequences

- No monogram fallback remains; all 133 polities display a flag.
- The Aouzou/Tibesti area is visually a dashed amber uncertainty zone, not an
  unexplained void or an invented national territory.
- The map renders cleanly at scale 18; the stale white/land-over-ocean overlay is
  gone. Residual sub-0.01 deg² coastline slivers and small-island detail gaps are
  documented rather than cosmetically filled.
- Stable IDs, populations, markets, saves and simulation behavior are unchanged.

## D-098 — M11d runtime playtest fixes (worker lifecycle, snapshot bound, web input)

**Status:** implemented (M11d).

### Context

Playtesting the exported Expo web build (headless Chrome through CDP) found six
issues that static checks could not reach:

1. **Saving rebuilt the simulation.** `handleEvent` closed over the
   `savedCampaign` state, and the worker-creation effect listed the handlers as
   dependencies. Completing a save therefore tore down the Web Worker, then the
   provider re-created the campaign from the player identity, silently resetting
   the simulated date and discarding unsaved progress.
2. **A United Kingdom campaign could not start.** The app rejected the
   `NEW_GAME_RESULT`: the protocol validator bounded `constructionLabor.idleWorkers`
   at 100,000,000, while the valid UK pool is 107,781,153 (the United Kingdom plus
   British India). The generic error was "event.snapshot is not a valid snapshot".
3. **Wheel zoom logged an error on every notch.** React attaches `onWheel`
   passively, so the synthetic handler's `preventDefault()` produced "Unable to
   preventDefault inside passive event listener invocation" and the page could
   still scroll.
4. **Sliders exposed no value to screen readers on web.** The component set
   `accessibilityValue`, but React Native Web reads the flat `aria-value*` props;
   the rendered `role="slider"` had no `aria-valuenow`, `aria-valuemin`,
   `aria-valuemax` or `aria-valuetext`.
5. **An unreadable saved game looked like no saved game.** The startup storage
   error was cleared by the worker's initial `READY` event, leaving "No saved
   campaign yet" with no explanation for an incompatible or corrupt save.
6. **Every load requested a missing `/favicon.ico`.**
7. **Country labels swallowed map clicks.** SVG text labels sit at polity
   centroids and were the pointer target, so clicking a labelled country (for
   example British India) produced a hover tooltip but no selection.

### Decision

1. Worker lifecycle depends only on the explicit restart epoch (`webEpoch` /
   `nativeEpoch`). Supervisor callbacks always dispatch through refs, and the
   saved-campaign envelope is mirrored into a ref. No simulation or save-format
   change; identity and date are preserved across saves.
2. Add the documented `MAX_SNAPSHOT_PEOPLE = 20_000_000_000` bound for person
   counts in snapshots (the 1900 world starts at ~1.59bn and the campaign can run
   to 2000). The snapshot shape is unchanged, so `PROTOCOL_VERSION` stays 14; only
   the accepted value range of a valid person count widens.
3. The map owns a native, explicitly non-passive `wheel` listener on its
   container, maps `clientX`/`clientY` through the container box, and calls
   `preventDefault()`. The pure factor math is `wheelZoomFactor` in
   `mapViewport.ts`.
4. Sliders pass both `accessibilityValue` (native) and the flat `aria-value*`
   props (web), so a screen reader announces the current value and range.
5. `READY` clears an existing error only when no startup storage error is
   recorded; a successful new game or load clears the diagnosis.
6. `app.json` declares a bundled `web.favicon`; the export now emits
   `/favicon.ico` and the browser request succeeds.
7. Country labels are non-interactive (`pointerEvents="none"`); polity fills and
   small-state markers keep their press handlers.

### Consequences

- Saving, autosaving, loading and restarting no longer rebuild the worker
  implicitly; the observed worker count remains one per app session, and a
  20-second 30x run keeps its simulated date.
- Every selectable country's initial snapshot now passes the app protocol
  validator. `m11d-runtime-contract.test.ts` checks all 66 selectable countries
  through `NEW_GAME_RESULT` and `parseWorkerEvent`.
- Clicking a labelled country on the map now selects it instead of hitting the
  label. Labels remain visible and non-focusable.
- Pause is acknowledged only between worker pumps. The host may finish up to
  four queued ticks first, so at the full-world 30x rate the date can advance a
  few simulated days before the UI reports Play. This is the existing
  command-boundary contract, not a state regression; the playtest waits for the
  acknowledgement before comparing dates.
- No simulation behavior, determinism, save schema, stable IDs or data versions
  changed. The measured full-world cost is unchanged: about 650 ms per simulated
  day in Node, so 30x remains best-effort (documented in the M11d report).
- Native device builds were not available in this environment; the native
  provider path was hardened (same epoch rule) but not re-run on a device.
