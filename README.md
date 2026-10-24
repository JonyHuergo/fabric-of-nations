# Century — M0/M1/M2 foundation

Century is a historically grounded grand-strategy simulation covering
**1900-01-01 through the boundary at 2000-01-01**, with one simulated civil day
per tick.

The repository currently implements **M0 (project foundation)**, **M1
(simulation core)**, and **M2 (population core)** only. There is deliberately no
production, general goods market, employment allocation, government finance,
politics, technology, diplomacy, warfare, AI, worker, or React Native UI yet.
The design authority is the Century GDD v2.0; persistent engineering rules are in
[`AGENTS.md`](./AGENTS.md), and implementation decisions are in
[`DECISIONS.md`](./DECISIONS.md).

## Workspace

| Package | Purpose | Runtime dependencies |
|---|---|---|
| [`packages/sim`](./packages/sim) | Pure deterministic simulation: calendar, keyed randomness, world, population, demography, needs, wealth, tick, save codec, state digest | none |
| [`packages/data`](./packages/data) | Canonical JSON static definitions, calibration fixture, and validated loader | `@century/sim` |
| [`packages/app`](./packages/app) | Placeholder for the future Expo/React Native shell (M7) | none |
| [`packages/bench`](./packages/bench) | Headless M1/M2 benchmark harness | `@century/sim`, `@century/data` |
| [`packages/tests`](./packages/tests) | Jest unit, integration, conservation, determinism, serialization, and calibration tests | `@century/sim`, `@century/data` |

`packages/sim` compiles with `"lib": ["ES2022"]` and `"types": []`, has no
runtime dependencies, and imports only its own relative `.js` modules. It must
never import the app, data loader, benchmark, or platform code. Static
definitions live as JSON under `packages/data/data` and are passed explicitly
through `TickContext`; they are not serialized into `World`.

## Requirements and commands

- Node.js **22.12.0 or newer**
- pnpm **9.15.9**

| Command | Effect |
|---|---|
| `pnpm install` | Install the workspace reproducibly from `pnpm-lock.yaml`. |
| `pnpm run build` | Compile every package in dependency order. |
| `pnpm run lint` | Boundary checks: no ambient RNG, no forbidden APIs in `sim`, ES2022-only config, no runtime deps in `sim`. |
| `pnpm run typecheck` | Typecheck every package in strict mode. |
| `pnpm test` | Run the Jest suite. |
| `pnpm run bench` | Build, run M1 and M2 benchmark cases, then report timings and hashes. |
| `pnpm run ci` | Local CI path: lint, typecheck, test, benchmark. |

The GitHub Actions workflow in [`.github/workflows/ci.yml`](./.github/workflows/ci.yml)
runs the same verification with a frozen lockfile.

## M1 semantics preserved

- Day index `0` is `1900-01-01`; index `36,524` is the terminal `2000-01-01`
  boundary. There are exactly 36,524 processed campaign days and 36,525 valid
  day indices.
- `World.dayIndex` is the next civil day to process. At the boundary, `tick`
  mutates nothing.
- Gregorian leap years are explicit and tested. No host `Date`, time-zone, or
  wall-clock API is used.
- Randomness is keyed by `(seed, day, entityId, purpose, drawIndex)` with a
  documented two-lane purpose digest and known-answer vectors in
  [`docs/randomness.md`](./docs/randomness.md).
- Save envelopes are canonical JSON with a checksum; typed arrays are explicitly
  tagged and reconstructed. Invalid, corrupt, and incompatible saves fail with
  `SaveFormatError`.

## M2 population core

`World` now contains a minimal region collection, population blocks, and a
minimal household-account subset of the future finance state.

### Cohorts and ageing

- 17 five-year cohorts: `0–4` through `75–79`, then `80+`.
- Counts are `Uint32Array`; working age is cohort indices 3–12 (15–64).
- Annual ageing uses **exact integer arithmetic**. Each cohort carries a
  remainder in fifths of a person (`Uint8Array`, values 0–4):
  `units = cohort + carry`, `moved = floor(units / 5)`, `carry = units % 5`.
- Cohorts are processed oldest-to-youngest, so people moved into a cohort are not
  moved again in the same pass. The 80+ cohort never ages out.
- Day `1900-01-01` is the initial distribution and is not aged; later January 1
  dates are aged before daily births/deaths.

### Births and deaths

- Annual age-specific death rates per 1,000 and a crude birth rate per 1,000 are
  interpolated from JSON definition anchors by civil year.
- Daily expected events use the actual civil-year length (365 or 366) and
  per-block fractional remainders. Deaths are allocated to cohorts with a
  deterministic largest-remainder method.
- Births enter cohort 0 of the generating block. All population changes satisfy
  `end = start + births - deaths`.
- Unmet subsistence/basic counters from the previous day raise mortality risk.

### Needs, budgets, and supply

- Four tiers: subsistence, basic, comfort, luxury. Activation thresholds are
  wealth-dependent.
- A single physical supply pool per good is shared across all four tiers; supply
  is never reset or reused within a day.
- The daily budget is based only on the **annual disposable per-capita income
  fixture**, divided by the actual civil-year length and multiplied by block
  population. Savings/account balances are authoritative but are **not** added
  to the daily budget and are not spent; dissaving is deferred.
- `fundingRatio = clamp(tierCost > 0 ? budget / tierCost : 1, 0, 1)`.
- Desired, funded, fulfilled, and both unmet definitions are recorded. Only
  fulfilled quantities spend budget and consume supply. Higher tiers are not
  purchased when a lower tier is not fully met.
- Scarce supply is allocated proportionally across blocks with stable-ID
  ordering and deterministic residual assignment.

### Wealth, mortality, and militancy

- Wealth uses the GDD target:
  `clamp(intercept + slope * ln(max(income / subsistenceCost, epsilon)), 0, 99)`,
  smoothed monthly.
- Basic-unmet loss and comfort/luxury gains are separate bounded adjustment
  terms; coefficients are provisional and documented in
  [`packages/sim/src/population/constants.ts`](./packages/sim/src/population/constants.ts).
- Wealth is an indicator, not money or a spendable resource.
- Pop-block militancy updates **daily** after needs. Regional/national political
  aggregates remain weekly M8 systems; that GDD cadence clarification is recorded
  in `DECISIONS.md`.
- Mortality is daily and uses the previous day's unmet counters.

### Data and calibration

- Static definitions are canonical JSON:
  [`needs.json`](./packages/data/data/needs.json),
  [`demography.json`](./packages/data/data/demography.json),
  [scenarios](./packages/data/data/scenarios), and
  [calibration targets](./packages/data/data/calibration/m2_population_targets.json).
- The single-region world aggregate starts from the **source-derived January 1,
  1900** world total, 1,621,287,278 persons. Its 17-band age distribution is a
  provisional stylized distribution, not source-verified.
- The total-population reference is the [Our World in Data long-run population
  series](https://ourworldindata.org/grapher/population.csv?csvType=filtered&useColumnShortNames=true&country=World)
  (Gapminder v7 for 1800–1949; UN WPP 2024 from 1950). Published annual values are
  treated as mid-year; January 1 comparison values are the average of adjacent
  mid-year values. The full source metadata is in
  [`source_notes.md`](./packages/data/data/source_notes.md).
- The GDD's rounded provisional anchors differ from the source: 1900 1.65B vs
  1.627B mid-year, 1950 2.50B vs 2.493B, and 2000 6.10B vs 6.172B. The initial
  scenario uses the source-derived Jan 1 value; the GDD anchor discrepancy is
  documented rather than tuned away.
- The automated century test against the source-backed Jan 1 series currently
  reports:
  - initial 1900: **1,621,287,278**;
  - 1950: **2,479,824,315**, relative error **-0.028%**;
  - 2000: **6,141,488,510**, relative error **+0.182%**;
  - maximum annual relative error: **3.707%** (1924);
  - RMSE across annual samples: **1.907%**;
  - all annual errors below 5% and both 1950/2000 anchors below 3%.
- The crude birth-rate anchors were adjusted by **+0.3 per 1,000** from the
  earlier provisional values (31.9, 31.9, 36.1, 25.1 for 1900/1949/1950/2000) to
  reduce the total-population error against the source curve. This is a
  total-population calibration adjustment, **not** evidence that age-specific
  fertility/mortality schedules are historical.
- **Total-population source is integrated; full demographic calibration remains
  partial/incomplete.** The 1900 age structure, age-specific mortality anchors,
  crude birth-rate anchors, and profession/household composition are still
  provisional. No target population total is read by the simulation.

## Determinism and serialization

- Schema version: `2`; simulation version: `0.2.0`; data version:
  `m2-population-v2`.
- M1 schema-1 saves are rejected with an actionable error; no migration is
  attempted because M1 has no population data.
- `PopBlock.ageCohorts` (`Uint32Array`) and `agingCarry` (`Uint8Array`) are
  tagged and reconstructed by the serializer. The payload also contains the
  minimal finance accounts.
- Canonical JSON makes checksum and decode independent of object key insertion
  order. The state digest covers population, accounts, and diagnostics.
- Full-century regression digest for the aggregate fixture (seed `20261023`):
  `a1b9cb7d0727daa3`.
- Empty-world M1 regression digest (seed `123456789`, scenario
  `m1-determinism`): `fa621c2e8b083b28`.

## Benchmark scope and current Node results

`pnpm run bench` reports M1 no-op, M2 world-aggregate century, and M2 stress
cases at 200, 1,000, 3,000, and 6,000 population blocks, with p50/p95/p99 and
hashes. Each stress scale repeats the three deterministic multi-block templates
(400k/350k/250k people), so the total population grows with block count rather
than representing one fixed world. Each scale uses the same needs/demography
workload and 730 ticks. Node results are diagnostic, not mobile performance
evidence.

Latest run on Node `v22.12.0`, Windows x64, AMD Ryzen 5 2600 (12 logical
processors), 7.93 GiB RAM:

| Case | Blocks | Population | Ticks | Total | Avg/tick | p95 |
|---|---:|---:|---:|---:|---:|---:|
| M1 no-op | 0 | 0 | 36,524 | 23–44 ms | 0.0006–0.0012 ms | 0.0005–0.0015 ms |
| M2 aggregate | 1 | 1.62B start | 36,524 | 1.04–1.27 s | 0.028–0.035 ms | 0.035–0.058 ms |
| M2 stress | 200 | 67,749,911 | 730 | 1.18 s | 1.61 ms | 2.17 ms |
| M2 stress | 1,000 | 338,394,084 | 730 | 6.31 s | 8.64 ms | 10.25 ms |
| M2 stress | 3,000 | 1,014,979,000 | 730 | 22.84 s | 31.29 ms | 37.81 ms |
| M2 stress | 6,000 | 2,029,958,000 | 730 | 58.68 s | 80.39 ms | 119.96 ms |

The M1 and M2 aggregate provisional Node p95 thresholds are 1 ms. The 200-block
stress case retains a 5 ms threshold; the 1,000/3,000/6,000-block runs are
diagnostic scale probes, not acceptance thresholds. The GDD mobile p95 ≤ 8 ms
target is **NOT EVALUATED**: this is a Node harness and not a full-scale mobile
release build.

## Known limitations

- The total-population reference is source-backed, but the 1900 age structure and
  age-specific fertility/mortality schedules are still provisional; full
  historical demographic calibration remains incomplete.
- No production, goods market, employment allocation, government finance,
  politics, technology, diplomacy, warfare, AI, migration, social mobility, or
  UI exists.
- Needs use a deterministic fixture, not market clearing; dissaving and financial
  settlement are deferred.
- Wealth/militancy coefficients are provisional.
- `Math.log` and floating-point arithmetic are not guaranteed bit-identical
  across JavaScript engines; same-runtime determinism and stored-value
  quantization are used.
- M1 `createInitialWorld` empty worlds remain supported for compatibility
  regression tests.

## Development workflow

1. Read `AGENTS.md` and the relevant GDD milestone.
2. Inspect `git status`; preserve unrelated changes.
3. Write/update tests before behavior.
4. Keep tuning coefficients in constants/data with units and calibration status.
5. Record substantive decisions/deviations in `DECISIONS.md`.
6. Run `pnpm run lint`, `pnpm run typecheck`, `pnpm test`, and `pnpm run bench`.
7. Do not begin M3 until M2 acceptance criteria pass or the designer accepts a
   documented exception.
