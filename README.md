# Century — M0/M1 foundation

Century is a historically grounded grand-strategy simulation covering
**1900-01-01 through the boundary at 2000-01-01**, with one simulated civil day
per tick.

This repository currently implements **M0 (project foundation)** and **M1
(simulation core)** only. There is deliberately no economy, population,
politics, technology, diplomacy, warfare, AI, worker, or React Native UI yet. The
design authority is the Century GDD v2.0; persistent engineering rules are in
[`AGENTS.md`](./AGENTS.md), and implementation decisions are recorded in
[`DECISIONS.md`](./DECISIONS.md).

## Workspace

| Package | Purpose | Runtime dependencies |
|---|---|---|
| [`packages/sim`](./packages/sim) | Pure deterministic simulation core: types, calendar, keyed randomness, world, tick, save codec, state digest | none |
| [`packages/data`](./packages/data) | Placeholder for validated static definitions and data loaders (M5) | none |
| [`packages/app`](./packages/app) | Placeholder for the future Expo/React Native shell (M7) | none |
| [`packages/bench`](./packages/bench) | Headless Node benchmark for the M1 core | `@century/sim` |
| [`packages/tests`](./packages/tests) | Jest unit, integration, determinism, serialization, and boundary tests | `@century/sim` |

`packages/sim` is the only authoritative simulation code. It compiles with
`"lib": ["ES2022"]` and `"types": []`, has no runtime dependencies, and imports
only its own relative `.js` modules. It must never import the app, worker, data,
benchmark, or platform code. The app must never read or mutate a live world.

## Requirements

- Node.js **22.12.0 or newer**
- pnpm **9.15.9** (declared in `packageManager`)

## Commands

Run from the repository root:

| Command | Effect |
|---|---|
| `pnpm install` | Install the workspace reproducibly from `pnpm-lock.yaml`. |
| `pnpm run build` | Compile every package in dependency order. |
| `pnpm run lint` | Dependency-free boundary checks: no ambient RNG, no forbidden APIs in `sim`, ES2022-only config, no runtime deps. |
| `pnpm run typecheck` | Typecheck every package in strict mode. |
| `pnpm test` | Run the Jest suite (calendar, RNG known-answer vectors, tick, serialization, resume, determinism, architecture). |
| `pnpm run bench` | Build, run 3 measured century-scale no-op runs plus a warm-up, then report timings and hashes. |
| `pnpm run ci` | The local CI path: lint, typecheck, test, benchmark. |

The GitHub Actions workflow in [`.github/workflows/ci.yml`](./.github/workflows/ci.yml)
runs the same verification on Node 22.12.0 with a frozen lockfile.

## M1 simulation semantics

### Calendar and day indices

- Day index `0` is `1900-01-01`; index `36,524` is the terminal boundary
  `2000-01-01`.
- There are exactly **36,524 processed campaign days** (indices `0..36,523`) and
  **36,525 valid day indices** including the terminal boundary.
- `World.dayIndex` is the **next civil day to process**. At `36,524` the campaign
  is complete and `tick` mutates nothing.
- Leap days are Gregorian: 1900 is not a leap year; 1904–1996 contribute 24 leap
  days; 2000 is a leap year but is only the boundary date.
- No `Date`, time zone, locale, or host clock is used. See
  [`packages/sim/src/calendar.ts`](./packages/sim/src/calendar.ts).

### Tick driver

`tick(world)` validates the world, processes the current day, and increments
`dayIndex` by exactly one. It has no other authoritative effect. M1 implements
only the boundary-check and day-advance portions of the GDD §4.2 pipeline; no
events, demographics, markets, finance, or AI run. `runTicks(world, count)` is
bounded and `runCampaign(world)` runs to the terminal boundary.

### World state

The M1 `World` is intentionally small: schema/simulation/content versions,
scenario ID, day index, seed, and bounded diagnostics. It does **not** yet define
countries, regions, pop blocks, buildings, markets, or finance. It also contains
no dense numeric arrays or per-day history. The serializer keeps an explicit
typed-array codec for future dense state and tests it with an isolated fixture.

### Deterministic randomness

Every draw is keyed by `(seed, day, entityId, purpose, drawIndex)` and is a pure
function of that tuple. There is no mutable PRNG stream and no `Math.random` in
any package. The algorithm, purpose-identifier rules, independence rationale, and
known-answer vectors are documented in [`docs/randomness.md`](./docs/randomness.md).

### Saves

`serializeWorld` emits a canonical, versioned JSON envelope: format version,
world schema version, simulation version, content/data version, scenario, day
index, seed, checksum, and payload. When dense state is introduced, typed arrays
are tagged with kind, length, and values and reconstructed as typed arrays. The
M1 world currently has none; the codec is covered by isolated fixtures.
`deserializeWorld` rejects malformed JSON, checksum mismatches, incompatible
versions, invalid day indices, and invalid world state with `SaveFormatError`; it
never returns a partially restored world. The typed-array codec separately
rejects malformed or out-of-range arrays. `hashWorld` returns a stable 64-bit
digest used by determinism tests.

## Determinism guarantees exercised by tests

- Two independent worlds with identical seed/scenario produce the same century
  hash (`2ed31606bbf385f8` for seed `123456789`, scenario `m1-determinism`).
- Exactly 36,524 transitions reach `2000-01-01`.
- A save restored after 20,000 ticks reaches the same terminal hash as the
  original.
- Typed-array codec round trips, corrupt-save rejection, known-answer RNG
  vectors, and boundary isolation are covered.

## Benchmark scope

`pnpm run bench` reports tick count, total time, average time per tick, p50/p95/p99,
hashes, and the Node/CPU/OS configuration. It is a **Node regression harness**,
not evidence that the mobile performance budget is met. The GDD's full-scale
mobile target (p95 ≤ 8 ms on a named reference device) is not evaluated in M1
because no full-scale world or device build exists. The harness applies a loose
provisional Node p95 threshold of 1 ms and labels it as such.

## Development workflow

1. Read `AGENTS.md` and the relevant GDD milestone before changing code.
2. Inspect `git status`; preserve unrelated changes.
3. Add or update tests before behavior, especially for state transitions,
   randomness, serialization, and determinism.
4. Keep tuning coefficients in constants/data with units and calibration status.
5. Record substantive decisions or deviations in `DECISIONS.md`.
6. Run `pnpm run lint`, `pnpm run typecheck`, `pnpm test`, and `pnpm run bench`.
7. Do not begin the next milestone until the current acceptance criteria pass.

## Known limitations

- No save migrations yet: any version mismatch is rejected with an actionable
  error rather than migrated.
- `packages/data` contains no content tables or loaders; these arrive with M5.
- `packages/app` contains no Expo/React Native code; the worker proof of concept
  arrives with M7.
- M1 has no player/AI actions; the tick signature intentionally takes only the
  world until an action contract exists.
- Node benchmark numbers are diagnostic only and must not be reported as mobile
  performance.
