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
  decision. **GDD v2.2 now supersedes v2.1; D-043 records the daily
  price/settlement ordering clarification.**
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
  balances, or purchasing-power promise is introduced.

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
  p95 target remains **NOT EVALUATED**.

### D-046 — M4a-1 category-aware double-entry accounts (approved)

- **Status:** approved by the designer before implementation, with the
  qualifications recorded here. D-044/D-045 were reserved for M4a-2 and are now
  recorded above.
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

## Items intentionally left open

- Campaign victory/end-state presentation (GDD §20.2 default: sandbox report).
- Save compression and atomic platform storage (M6/M7).
- Worker runtime package and mobile performance device (M7).
- Historical data versioning and migration (M5).
- Source-backed 1900 age structure and pre-1950 age-specific fertility/mortality.
- Source-backed annual sex ratio at birth and exact single-year age distributions.
- Cross-engine floating-point determinism policy.
