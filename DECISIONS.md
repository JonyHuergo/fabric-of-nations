# Century decision register

This file records material implementation decisions, GDD/`AGENTS.md` conflicts,
and provisional assumptions made in M0/M1. It follows GDD §20 and
`AGENTS.md` §1.

Scope of this session: **M0 project foundation and M1 simulation core only**.
Economy, population, politics, technology, diplomacy, warfare, AI, worker
protocol, and UI behavior are intentionally absent.

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
  supported in M1. The M1 world has no typed arrays after D-005; the codec is
  covered by isolated fixtures for future dense state.
- **Consequence:** Unknown or mismatched versions are rejected with
  `SaveFormatError`; no migration exists yet. The payload is canonical JSON with
  sorted keys, so identical state serializes identically.

### D-008 — M1 tick takes no action list

- **Issue:** GDD §4.1 says the simulation receives explicit player/AI actions, but
  no action types exist in M1.
- **Resolution:** `tick(world)` takes only the world. Adding an empty or `string`
  action union would create a speculative contract. Actions are introduced with
  the subsystem and validation rules that make them meaningful (M4/M5 onward).
- **Consequence:** The signature will change when the action contract is
  introduced; that change is scheduled, not accidental. No player/AI behavior
  exists in M1.

### D-009 — Benchmark threshold is a Node regression guard, not a mobile claim

- **Resolution:** `packages/bench` reports ticks, total time, average, p50/p95/p99,
  environment, seed, scenario, and hashes. It applies a provisional Node p95
  threshold of 1 ms per no-op tick and prints the GDD §14.4 mobile target of 8 ms
  as **NOT EVALUATED**.
- **Rationale:** GDD §14.4 explicitly states a Node benchmark is not proof of
  mobile performance, and M1 has neither the full reference world nor a device
  release build. Claiming the mobile budget from this run would violate
  `AGENTS.md` §3.
- **Consequence:** CI fails if the no-op core regresses past the loose threshold,
  but mobile performance remains unverified until M7.

### D-010 — Placeholder packages and deferred `sim-worker`

- **Resolution:** Create `@century/data` and `@century/app` placeholders with no
  content or UI code and no runtime dependencies. Do not create
  `packages/sim-worker` yet. GDD §14.1 calls it "recommended if needed"; M0's
  required layout lists `sim`, `data`, `app`, `bench`, and `tests`. The worker
  proof of concept belongs to M7.
- **Consequence:** There is no platform-specific worker code to leak into
  `packages/sim`. The app package must not import the simulation implementation.

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

### D-012 — Content version is duplicated as a placeholder until M5

- **Resolution:** `packages/sim` exports `DEFAULT_DATA_VERSION = "m1-empty-v1"`
  and `packages/data` exports `DATA_PACKAGE_VERSION = "m1-empty-v1"`. They are
  intentionally independent packages in M1.
- **Consequence:** M5 must establish a single authoritative content version and
  data loader, then remove the duplication. A mismatch today fails save loading
  with an actionable error rather than silently accepting different content.

### D-013 — No save migrations in M1

- **Resolution:** The save envelope is versioned, but any format, schema,
  simulation, or content version mismatch is rejected with a `SaveFormatError`
  explaining the expected version.
- **Rationale:** GDD §5.6 permits either migration or rejection, and no older
  production save exists yet. Inventing migrations before a second version would
  be speculative.
- **Consequence:** The first post-M1 schema change must add a migration path or
  bump the simulation version with an explicit compatibility decision.

### D-014 — Typecheck resolves `sim` source without prebuilding

- **Resolution:** `packages/bench` has a build config (`tsconfig.json`) that
  imports the published `@century/sim` declaration output, and a separate
  `tsconfig.typecheck.json` with `noEmit` that maps `@century/sim` to
  `packages/sim/src/index.ts`. `packages/tests` uses the same source mapping.
- **Consequence:** Root `pnpm run typecheck` has no build side effect and works
  from a fresh checkout. `packages/bench` build still requires `sim` to be built
  first; the root `build` command orders packages topologically.

### D-015 — M1 contains no tuning coefficients

- **Resolution:** M1 constants are structural bounds and version identifiers,
  not gameplay tuning coefficients. No economic, demographic, political, or
  military formula is implemented, so there is no coefficient to mark
  provisional or calibrated.
- **Consequence:** The constants module will gain calibrated coefficients only
  with the subsystem that uses them, with units, cadence, and status.

### D-016 — Development dependencies are limited to the test/build toolchain

- **Resolution:** Runtime dependencies: `@century/bench` depends on
  `@century/sim`; `@century/tests` depends on `@century/sim`; `sim`, `data`, and
  `app` have no runtime dependencies. Development dependencies are TypeScript
  5.7.2, Jest 29.7.0, ts-jest 29.2.5, `@types/jest` 29.5.14, and
  `@types/node` 22.10.2.
- **Rationale:** The assignment permits Jest and requires strict TypeScript. A
  benchmark and test package need Node typings; no UI, worker, browser, or
  state-management framework is needed in M0/M1.
- **Compatibility:** Node 22.12+ is required because Jest ESM execution uses
  `--experimental-vm-modules`. pnpm 9.15.9 is pinned; the lockfile is version 9.
  No dependency is used by `packages/sim` at runtime or typecheck time.

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
5. M1 uses one market-less, country-less world; no "world size" parameter is
   invented before population/region data exists.

## Items intentionally left open

- Campaign victory/end-state presentation (GDD §20.2 default: sandbox report).
- Save compression and atomic platform storage (M6/M7).
- Worker runtime package and mobile performance device (M7).
- Historical data versioning and migration (M5).
