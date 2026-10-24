# Century decision register

This file records material implementation decisions, GDD/`AGENTS.md` conflicts,
and provisional assumptions made in M0/M1/M2. It follows GDD §20 and
`AGENTS.md` §1.

Scope of this session: **M0 project foundation, M1 simulation core, and M2
population core**. Economy, production, general markets, politics, technology,
diplomacy, warfare, AI, worker protocol, and UI behavior remain out of scope.

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

### D-012 — Content version is authoritative in the JSON data package for M2

- **Resolution:** `packages/data` exports `DATA_PACKAGE_VERSION =
  "m2-population-v2"` and `@century/sim` exports
  `DEFAULT_DATA_VERSION = "m2-population-v2"`. The data loader rejects a scenario
  whose data version does not match, and definitions carry the same version.
- **Revision:** The M2 audit changed the source-backed 1900 initial population,
  source-backed calibration target, and crude birth-rate anchors, so the data
  version was bumped from `m2-population-v1` to `m2-population-v2`. M2 v1 saves
  are rejected rather than silently reinterpreted under new content.
- **Consequence:** M5 must establish the full generated data pipeline and keep
  the two declarations aligned. A mismatch fails loading with an actionable
  error.

### D-013 — No automatic save migrations; M2 rejects M1 saves

- **Resolution:** The save envelope is versioned, but incompatible format,
  schema, simulation, or content versions are rejected with a `SaveFormatError`.
  M2 uses world schema `2` and simulation version `0.2.0`; M1 schema-1 saves are
  rejected rather than migrated.
- **Rationale:** GDD §5.6 permits migration or rejection. An M1 world has no
  population state, so silently filling defaults would fabricate state.
- **Consequence:** The first post-M2 schema change must add a migration path or
  bump the version with an explicit compatibility decision.

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
- **Status:** All M2 behavioral coefficients are **provisional**. Structural
  choices (17 cohorts, 1/5 annual transfer, working-age bands) are binding.
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
- **GDD deviation:** GDD §6.2 describes the daily funded budget as household
  financial assets plus income actually received, less mandatory payments. M2 is
  explicitly scoped to annual disposable income only and does not draw down
  savings. This is a deliberate, task-mandated M2 limitation, not a hidden
  redefinition of the GDD; asset drawdown/settlement is deferred.
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
- **Acceptance:** Maximum annual relative error ≤ 5% and 1950/2000 anchor errors
  ≤ 3%, with 1900 exact. The source-backed run currently reports 3.707% maximum
  (1924), -0.028% at 1950, +0.182% at 2000, and 1.907% RMSE.
- **Rate adjustment:** The crude birth-rate anchors were raised by 0.3 per 1,000
  (31.9/31.9/36.1/25.1) to reduce total-population error. This is a
  total-population calibration adjustment, not evidence that age-specific
  fertility or mortality is historical.
- **Status:** **Total-population reference is source-backed; full demographic
  calibration is partial and incomplete.** The 1900 age structure, age-specific
  mortality, crude-birth-rate anchors, and profession/household composition remain
  provisional. The simulation does not read target totals.

### D-022 — M2 schema and versioning

- **Resolution:** `WORLD_SCHEMA_VERSION = 2`, `SIM_VERSION = "0.2.0"`,
  `DEFAULT_DATA_VERSION = "m2-population-v2"`; `SAVE_FORMAT_VERSION` remains 1
  because the envelope shape is unchanged.
- **Compatibility:** M1 schema-1 / simulation-0.1 saves are rejected clearly;
  no migration is attempted. Typed arrays are encoded and restored through the
  existing tagged codec. The full-century aggregate regression digest is
  `a1b9cb7d0727daa3` for seed `20261023`.

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
- **Result:** 200 blocks: ~2.58 ms -> ~1.6 ms average; 6,000 blocks: ~192 ms ->
  ~80 ms average on this Node desktop. 1,000/3,000/6,000-block runs remain
  diagnostic, not mobile evidence. Remaining cost is dominated by per-block
  tier/result object allocation and per-block demography.
- **Consequence:** The 200-block provisional Node threshold remains 5 ms p95;
  larger scales are reported without a mobile claim.

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
6. The world-aggregate total-population reference is source-backed (OWID/Gapminder/
   UN WPP), but the scenario age structure and demographic schedules are
   provisional. Full historical demographic calibration is incomplete.
7. The daily budget excludes savings; no financial account is mutated in M2.
8. `Math.log`-based wealth and floating demographic accumulation are deterministic
   on a fixed runtime but not proven bit-identical across JavaScript engines.

## Items intentionally left open

- Campaign victory/end-state presentation (GDD §20.2 default: sandbox report).
- Save compression and atomic platform storage (M6/M7).
- Worker runtime package and mobile performance device (M7).
- Historical data versioning and migration (M5).
- Source-backed world population, age structure, and age-specific demographic
  series for replacing the provisional M2 calibration fixture.
- Cross-engine floating-point determinism policy.
