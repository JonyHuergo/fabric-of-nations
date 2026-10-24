# Century — M0/M1/M2.1 foundation

Century is a historically grounded grand-strategy simulation covering
**1900-01-01 through the boundary at 2000-01-01**, with one simulated civil day
per tick.

The repository currently implements **M0 (project foundation)**, **M1
(simulation core)**, and **M2.1 (corrected population core)** only. There is
deliberately no production, general goods market, employment allocation,
government finance, politics, technology, diplomacy, warfare, AI, worker, or
React Native UI yet. The design authority is the Century GDD v2.0; persistent
engineering rules are in [`AGENTS.md`](./AGENTS.md), and implementation
decisions are in [`DECISIONS.md`](./DECISIONS.md).

## Workspace

| Package | Purpose | Runtime dependencies |
|---|---|---|
| [`packages/sim`](./packages/sim) | Pure deterministic simulation: calendar, keyed randomness, world, population, demography, needs, wealth, tick, save codec, state digest | none |
| [`packages/data`](./packages/data) | Canonical JSON static definitions, calibration/source references, and validated loader | `@century/sim` |
| [`packages/app`](./packages/app) | Placeholder for the future Expo/React Native shell (M7) | none |
| [`packages/bench`](./packages/bench) | Headless M1/M2.1 benchmark harness | `@century/sim`, `@century/data` |
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
| `pnpm run bench` | Build M1/M2.1 benchmark cases and report timings and hashes. |
| `pnpm run ci` | Local CI path: lint, typecheck, test, benchmark. |

The GitHub Actions workflow in [`.github/workflows/ci.yml`](./.github/workflows/ci.yml)
runs the same verification with a frozen lockfile.

## M1 semantics preserved

- Day index `0` is `1900-01-01`; index `36,524` is the terminal `2000-01-01`
  boundary. There are exactly 36,524 processed campaign days and 36,525 valid
  day indices.
- `World.dayIndex` is the next civil day to process. At the boundary, `tick`
  mutates nothing.
- `World.startDayIndex` is the first day represented by a scenario. Annual
  ageing is skipped on that starting January 1; the campaign default is day 0,
  while the WPP 1950 validation scenario starts on 1950-01-01.
- Gregorian leap years are explicit and tested. No host `Date`, time-zone, or
  wall-clock API is used.
- Randomness is keyed by `(seed, day, entityId, purpose, drawIndex)` with a
  documented two-lane purpose digest and known-answer vectors in
  [`docs/randomness.md`](./docs/randomness.md).
- Save envelopes are canonical JSON with a checksum; typed arrays are explicitly
  tagged and reconstructed. Invalid, corrupt, and incompatible saves fail with
  `SaveFormatError`.

## M2.1 population core

`World` contains a minimal region collection, population blocks, and a minimal
household-account subset of the future finance state.

### Single-year age and sex state

- Authoritative state is `PopBlock.maleByAge` and `PopBlock.femaleByAge`, each a
  `Uint32Array` of **81 slots**: single ages 0–79 plus one open-ended 80+ slot.
- The 17 five-year bands used by the GDD and historical sources are **derived on
  demand** (`fiveYearAgeGroups`, `maleFiveYearAgeGroups`,
  `femaleFiveYearAgeGroups`); they are not stored as duplicate authority.
- Scenario data stores male/female totals for the 17 five-year bands. Creation
  expands each finite band uniformly across five single-year ages and places the
  entire 80+ band at age 80. This within-band distribution is a documented
  assumption, not extra historical information.
- Working age is single ages 15–64 across both sexes.

### Exact annual ageing

- On January 1 (except the scenario's starting day), every person advances
  exactly one year.
- Ages are shifted oldest-to-youngest so an arrival is never moved twice in the
  same pass. Age 79 enters 80+; the 80+ group never ages out.
- Newborns are added to age 0 later in the day, after deaths.
- No one-fifth fractional transfers or aging carries remain. Population is
  conserved exactly across every pass.

### Age-specific fertility

- Seven maternal five-year bands: 15–19 through 45–49.
- Expected annual births are
  `sum(F_a × ASFR_a / 1000)` over female ages 15–49, with sex-specific female
  counts from `femaleByAge`.
- Daily expected births are divided by the actual civil-year length (365/366)
  and accumulated with per-block fractional remainders.
- Births enter age 0 in the generating pop block.
- Newborns are split by `PopulationDefinitions.sexRatioAtBirth`; male plus female
  births equals total births exactly. The current 1.05 male/female ratio is
  **provisional**, not an annual WPP series.
- ASFR, not crude birth rate, is authoritative.
- `fertilityMultipliers` remain a provisional profession-level modifier.

### Age-specific, sex-specific mortality

- Mortality is specified by 17 five-year bands separately for males and females,
  then applied uniformly to each single-year age in the band; the 80+ rate is
  applied to the open-ended 80+ aggregate.
- Annual rates are converted with the actual civil-year length and accumulated
  through one per-block death remainder.
- Deaths are allocated back to age/sex counts with deterministic integer
  apportionment and exact conservation. M2.1 uses a cumulative integer
  apportionment pass rather than the previous 17-band largest-remainder
  implementation; conservation and stable age-sex order are tested.
- Prior-day unmet subsistence/basic counters raise the mortality multiplier.
- Migration remains outside M2.

### Needs, budgets, and supply

- Four tiers: subsistence, basic, comfort, luxury; wealth-dependent activation.
- One physical supply pool per good is shared across all four tiers.
- The daily budget is based only on annual disposable per-capita income divided
  by the actual civil-year length and multiplied by block population. Savings
  accounts are authoritative but are not added to the budget and are not spent.
- `fundingRatio = clamp(tierCost > 0 ? budget / tierCost : 1, 0, 1)`.
- Only fulfilled quantities spend budget and consume supply; higher tiers are
  not purchased when a lower tier is unmet.
- Scarce supply is allocated deterministically across blocks with stable IDs.

### Wealth and militancy

- Wealth uses the GDD target formula and monthly smoothing.
- Basic-unmet loss and comfort/luxury gains are separate bounded adjustment
  terms; coefficients are provisional.
- Pop-block militancy updates daily after needs; regional/national political
  aggregates remain weekly M8 systems.
- Mortality is daily and uses the previous day's unmet counters.

## Data and calibration

Static definitions:

- [`needs.json`](./packages/data/data/needs.json)
- [`demography.json`](./packages/data/data/demography.json) — ASFR and
  sex-specific mortality anchors.
- [`scenarios/m2_world_aggregate.json`](./packages/data/data/scenarios/m2_world_aggregate.json)
- [`scenarios/m2_multi_block.json`](./packages/data/data/scenarios/m2_multi_block.json)
- [`scenarios/m2_wpp_1950_validation.json`](./packages/data/data/scenarios/m2_wpp_1950_validation.json)
- [`calibration/m2_population_targets.json`](./packages/data/data/calibration/m2_population_targets.json)
  — OWID total-population series.
- [`calibration/wpp_age_sex_reference.json`](./packages/data/data/calibration/wpp_age_sex_reference.json)
  — WPP 2024 age/sex validation references for 1950/1975/2000.
- WPP 2024 ASFR and sex-specific mortality are integrated **annually for
  1950–2000** in `demography.json`.
- [`source_notes.md`](./packages/data/data/source_notes.md)

### Campaign gameplay baseline

The campaign starts from the source-derived January 1, 1900 total,
**1,621,287,278**. It uses the provisional 1900 age/sex distribution and
pre-1950 schedules, so it is a **no-shock gameplay baseline**, not the historical
validation configuration.

| Year | Model | Source Jan 1 | Relative error |
|---:|---:|---:|---:|
| 1900 | 1,621,287,278 | 1,621,287,278 | 0.000% |
| 1950 | 2,454,331,503 | 2,480,507,938 | -1.055% |
| 2000 | 6,715,972,921 | 6,130,354,660 | +9.553% |

- Maximum annual relative error: **9.553%** at 2000.
- RMSE across 101 annual samples: **5.320%**.
- Full-century aggregate hash: `27937e31a211b44f` for seed `20261023`.

The 2000 excess comes from the campaign's too-young 1950 age/sex composition,
not from post-1950 coefficient tuning. At 1950 the campaign has about 17.1M fewer
people than WPP, but +26.1M males, -43.2M females, +20.5M women aged 15–49, and a
1950 age structure with ~39.0% aged 0–14 versus ~34.7% in WPP. Its expected 1950
births are ~95.9M versus ~90.5M, and expected deaths at the same schedules are
~39.9M versus ~47.9M. The provisional pre-1950 inputs—especially
duplicated-by-sex mortality and the stylized 1900 age distribution—are the
cause. No safety margin is applied.

### Historical validation against WPP 2024

The WPP 1950-initialized validation scenario starts at the source-backed
2,471,424,002 age/sex distribution and uses annual source-backed ASFR/mortality.

| Year | Model total | WPP total | Total error | Max five-year share difference | Male-share difference |
|---:|---:|---:|---:|---:|---:|
| 1950 | 2,471,424,002 | 2,471,424,002 | 0.00% | 0.00 pp | 0.00 pp |
| 1975 | 4,041,822,105 | 4,034,031,762 | +0.193% | 1.08 pp | -0.085 pp |
| 2000 | 6,205,160,776 | 6,129,943,964 | +1.227% | 0.55 pp | -0.185 pp |

Cumulative 1950–1999 flows: model births 6,117,076,588 vs WPP 6,089,003,488
(+0.461%); deaths 2,383,339,814 vs 2,430,494,039 (-1.939%); net change
3,733,736,774 vs 3,658,509,449 (+2.057%). Validation hash:
`6e6db5e440706ab6`.

The earlier 5.2–5.5% shortfall came primarily from interpolating only three
benchmark years; annual WPP schedules restore the 1960s fertility peak and
annual fertility decline. The remaining +1.2% is reported, not tuned away.

### Provisional inputs

- 1900 age/sex distribution: stylized 1900 age shares split by WPP 1950
  age-specific sex shares.
- 1900–1949 ASFR: WPP 1950 schedule scaled by 1.05 (1900) and 1.00 (1949).
- 1900–1949 mortality: earlier stylized schedule duplicated by sex and
  multiplied by 1.45 (capped at 1,000 per 1,000).
- Sex ratio at birth 1.05 is provisional.
- Within-five-year-band single-age expansion is uniform.

The simulation does not read target totals to force its trajectory. Historical
validation and the campaign gameplay baseline are deliberately separate.

## Determinism and serialization

- Schema version: `3`; simulation version: `0.3.0`; data version:
  `m2.1-population-v1`.
- Schema-2 / simulation-0.2 saves are rejected with an actionable error; no
  migration is attempted.
- `maleByAge` and `femaleByAge` are tagged `Uint32Array` values. The payload also
  includes `startDayIndex`, fractional birth/male-split/death remainders, and
  finance accounts.
- Canonical JSON makes checksum and decode independent of object key insertion
  order. The state digest covers single-year sex state, accounts, diagnostics, and
  `startDayIndex`.
- Empty-world M1 regression digest (seed `123456789`, scenario
  `m1-determinism`): `046b5bb48b623b3e`.
- Full-century aggregate digest: `27937e31a211b44f`.

## Benchmark scope and current Node results

`pnpm run bench` reports M1 no-op, M2.1 world-aggregate century, and M2.1 stress
cases at 200, 1,000, 3,000, and 6,000 population blocks. Stress scales repeat the
three deterministic multi-block templates (400k/350k/250k people), so total
population grows with block count. Each stress scale uses 100 warm-up ticks and
730 measured ticks.

Latest run on Node `v22.12.0`, Windows x64, AMD Ryzen 5 2600 (12 logical
processors), 7.93 GiB RAM, seed `20261023`:

| Case | Blocks | Population | Ticks | Total | Avg/tick | p95 |
|---|---:|---:|---:|---:|---:|---:|
| M1 no-op | 0 | 0 | 36,524 | 20–46 ms | 0.0006–0.0013 ms | 0.0006–0.0014 ms |
| M2 aggregate | 1 | 1.62B start | 36,524 | 1.42–1.62 s | 0.039–0.044 ms | 0.058–0.084 ms |
| M2.1 stress | 200 | 67,290,866 | 730 | 2.17 s | 2.97 ms | 3.91 ms |
| M2.1 stress | 1,000 | 336,102,399 | 730 | 12.13 s | 16.62 ms | 18.80 ms |
| M2.1 stress | 3,000 | 1,008,106,000 | 730 | 39.57 s | 54.21 ms | 70.78 ms |
| M2.1 stress | 6,000 | 2,016,212,000 | 730 | 76.53 s | 104.84 ms | 124.08 ms |

The 200-block p95 threshold remains 5 ms and passes. Larger scales are
diagnostic, not acceptance thresholds. The GDD mobile p95 ≤ 8 ms target is
**NOT EVALUATED**; this is a Node harness, not a mobile release build.

## Known limitations

- Full historical demographic calibration is incomplete: the 1900 age/sex
  distribution and 1900–1949 ASFR/mortality are provisional.
- The WPP 1950-initialized validation is within +0.2%/+1.2% at 1975/2000, with
  age shares within 1.1 pp; the campaign no-shock baseline is +9.6% at 2000
  because its provisional 1900/pre-1950 age/sex composition is too young.
- The sex ratio at birth and within-band age expansion are provisional.
- Mortality is derived from WPP deaths/mid-year population rather than a
  published `mx` table.
- M2.1 intentionally omits GDD §6.2 household-asset drawdown; only annual
  disposable income finances needs.
- Single-year sex state increases per-block cost; 6,000-block Node timing is not
  mobile evidence.
- `Math.log`/cross-engine floating-point identity remains an open limitation.
- No production, market, employment, government finance, politics, technology,
  diplomacy, warfare, AI, migration, social mobility, or UI exists.
- No M3 or later functionality was started.

## Development workflow

1. Read `AGENTS.md` and the relevant GDD milestone.
2. Inspect `git status`; preserve unrelated changes.
3. Write/update tests before behavior.
4. Keep tuning coefficients in constants/data with units and calibration status.
5. Record substantive decisions/deviations in `DECISIONS.md`.
6. Run `pnpm run lint`, `pnpm run typecheck`, `pnpm test`, and `pnpm run bench`.
7. Do not begin M3 until M2.1 acceptance criteria pass or the designer accepts a
   documented exception.
