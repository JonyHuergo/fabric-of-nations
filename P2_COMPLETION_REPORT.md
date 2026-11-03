# P2 completion report — provinces, customs territories, schema 28

Date: 2026-11-02. Branch `prosperity/p1-p2-groundwork` (P0/P1 and the P2 data groundwork
are commit `e44db68`; this work is the commit after it). Decisions: D-130 to D-134.

## 1. Scope delivered

- **Region layer removed (D-118, D-134).** `World.regions` → `World.provinceEconomies`
  (one record per province: blocks, buildings, market, unrest, infrastructure, cropland,
  pasture, urban share). Blocks, buildings, projects and armies reference provinces.
  Country territory is province ownership; market membership is `ProvinceEconomy.marketId`;
  occupation is province control. `Region`, `SimulationRegion`, `regionIds`,
  `simulationRegionId` and `RegionMetaDef` no longer occur in `packages/sim`, `data`,
  `sim-worker` or `app` (test `p2-provinces`), nor in the province bundles or the
  generated scenario.
- **Conserving transfer (D-118 §4).** `transferProvincesToCountry` moves a province with
  its blocks, buildings and stock into the recipient's customs territory, cancels other
  countries' projects there, releases employment closed by the new border, and rejects
  non-country recipients; M10 cessions use it. Tested: population, cash and stock exact.
- **1900 province scenario (D-121, D-131).** `scripts/p2/build-province-scenario.mjs`
  (`--check`, checksummed report): 1,687 provinces, 5,687 blocks, 3,725 buildings,
  conservation of people, building levels, operating cash and stock against the authored
  territory tables.
- **Customs territories (D-119).** 63 markets; every country administers its own except
  the four recorded unions; `memberCountryIds` validated; the app catalog names the same
  territories. Per-country trade policy already existed; the administrator's schedule
  applies in its territory.
- **Generated routes.** 168 routes (114 land, 54 sea) from borders and coasts.
- **Ownership reconciliation (D-132).** Egypt Ottoman-owned and British-controlled;
  Newfoundland British; Tokelau and the New Guinea residual in British Pacific islands;
  Goa as Portuguese India (census 1900: 475,513).
- **Schema 28 and save break (D-120).** Older saves are listed with the reason, never
  continued, deleted or overwritten (checked in the browser with a real schema-27 save).
- **Snapshot and UI.** Province economies as a column table (worker protocol 17); province
  panel (population by profession, towns and literacy, land, work, unrest, infrastructure,
  market) and four province lenses (population density, towns, literacy, unrest) at
  844 × 390, shared by the WebGL map and the SVG fallback (map bridge 2).
- **Performance (D-133).** Sequential market and employment pairing (trajectory change,
  for review) and bit-identical indexing took the province world from 19–85 s to about
  1.7 s per simulated day in Node.
- **RUSD rebasing** moved to P2b by the designer (D-130), with per-country wages.

## 2. Files

See `git show --stat` of the P2 commit. Principal new files:
`packages/sim/src/economy/provinceTransfer.ts`, `packages/tests/src/p2-provinces.test.ts`,
`packages/tests/src/fixtures/provinces.ts`, `packages/app/src/provinceNames.ts`,
`scripts/p2/convert-territory-inputs.mjs`, `scripts/p2/apply-1900-ownership-corrections.mjs`,
`scripts/p2/build-province-scenario.mjs`, `packages/data/data/historical/m11/territories_1900.json`,
`packages/data/data/historical/p2/*`. Removed: `historical/m11/regions_1900.json`,
`historical/m11/trade_routes_1900.json` (generated now), `historical/regions_1900.json`
(the M5 sample's are now `historical/provinces_1900.json`).

## 3. Commands and results

| Command | Result |
|---|---|
| `pnpm typecheck` | passed (all six packages), last run after the final change |
| `pnpm test` (full) | 1,306 passed, 3 failed of 1,309: `m11-flags` (2, pre-existing: they also failed in this session's first run, before any P2 change) and the M11 snapshot test, which read the old snapshot field through an untyped cast; fixed and re-run: passed |
| Re-runs after the last changes | `m11-world` snapshot test, `m5-migration`, `m5-world`, `p1-rollback`: passed |
| `p2-provinces` (new) | 12 passed: no region layer, conserving transfer, determinism, non-country rejection, clone isolation, customs territories, territory markets, population conservation, generated scenario current, schema 28 |
| `pnpm lint`, `audit:branding`, `audit:monetary`, `check:sim-deps` | passed; 0 cycles |
| `build-province-scenario.mjs --check`, `sync-app-provinces.mjs --check`, `scenario:build:check`, `build:worker:check`, `map:atlas:check` | current |
| `pnpm bench` | benchmark result: PASS (device targets NOT EVALUATED) |
| `pnpm run bench:world` | phase mode reproduces staged mode: PASS (hash a64199a9b48ddf4b, identical before and after the last migration change) |
| Browser check at 844 × 390 (Expo web) | incompatible save listed with its reason and not offered as Continue; new campaign; province panel (New York 7.3 M people, 1.1 M employed after one day); seven lenses in the phone panel; population lens with legend |

## 4. Benchmark (Node diagnostic; device performance not evaluated)

Node v24.22.1, Windows x64, AMD Ryzen 5 2600 (12 threads), 7.93 GiB. 1900 province world:
5,687 blocks, 3,725 buildings, 63 markets, 116,584 accounts; 62 days per mode, 57 measured
after 5 warm-up.

| Mode | mean ms/day | p50 | p95 | p99 (month start) |
|---|---|---|---|---|
| staged (whole-day clone) | 3,714 | 2,608 | 7,128 | 13,233 |
| **phase + rollback (worker host)** | **1,752** | **1,517** | **3,857** | **6,857** |

Before the incremental migration signals, the month-start day took 39 s (p99 39,090 ms).
For comparison, the 359-block region world ran at 183 ms p50 (P1). Other measurements:
`cloneWorld` 260–390 ms; `hashWorld` about 2.2 s; `serializeWorld` about 2.0 s for a
23.7 MB uncompressed save; start-of-game snapshot about 0.69 MB (1.21 MB before the column
table). Device performance, autosave cost and frame times are the designer's to measure.

## 5. Deviations, limitations and open items

- **Not built: the typed-array population pool** (P1 item 4). Measured: all age arrays
  copy in about 9 ms of a 260–390 ms checkpoint (D-133).
- **Performance** is about 1.7 s per day at province scale in Node; the province world is
  far heavier than the 359-block world (116,584 accounts, 23.7 MB uncompressed save,
  `hashWorld`/`serializeWorld` about 2 s each). Autosave and snapshot cost on phones are
  the designer's to measure.
- **Bundle size:** the worker bundle with the embedded scenario is 9.6 MB (was 4.3 MB).
- **D-133 changes trajectories** (pairing of market reservations and jobs); recorded for
  review. Hash pins re-pinned with their reasons: Batch 5 known answer, 1900 world, M2
  population digests, M1 empty world, M3a structural digest.
- **M12 reference sequences** (transfers to future polities) run on a political-geography
  world, because economic worlds reject transfers to polities that are not simulation
  countries (D-118 §4).
- **Distribution approximations** (D-131): HYDE urban/rural weights for occupations,
  buildings following employment, Réunion and Mayotte in the Madagascar total, straight-line
  route distances.
- Pre-existing `m11-flags` failures remain (stale flag provenance outputs; untouched).
