# P4 completion report — cause-driven demography

Date: 2026-11-05. Branch `prosperity/p4-demography` from `main` at `5150011` (P3).
Decision: D-142 (P4). Spec: `docs/PROSPERITY_PROGRAM.md` §4 P4, GDD §17J (17J.2 rule 5),
D-117, D-121, D-124, D-139, D-141. D-140 (money as metal and paper) is not part of P4.
Schema 30 → **31**, protocol 19 → **20**; saves from P3 are incompatible (D-139 §3).

## 1. Scope delivered

- **Age pattern vs level.** `demography.json` now holds one standard schedule: the WPP 2024
  world 1950 ASFR and sex-specific death rates. It is used only as the age pattern. Each block's
  fertility level and child (0–4) and adult (5+) mortality levels are derived every day from
  fixed residuals and current causes (`population/demographicLevels.ts`):
  - **Fertility** responds to:
    - literacy of women 15–49;
    - urban share;
    - income relative to subsistence (from the smoothed wealth indicator);
    - lagged child mortality (5-year mean lag);
    - contraception research;
    - calories eaten (famine lowers births).
  - **Mortality** responds to:
    - the M9/E5 health factor (medical research × public-health service × hours), with a
      stronger effect on children;
    - the urban penalty, removed by sanitation coverage (sanitation research × public-health
      service);
    - calories eaten.
- **Sourced 1900 levels per province:**
  - Gapminder life expectancy v15, babies per woman v15, child mortality v12 and crude birth
    rate, as 1896–1905 means, for the province's modern country or an authored stand-in.
  - Each province starts from the stable age structure of those rates; population totals are
    unchanged.
  - Every coefficient is in the constants module with units, justification and PROVISIONAL
    status.
- **Urban/rural split:** a per-block urban share from HYDE 3.3. A province's urban people go
  first to its non-peasant blocks.
- **Food:** calories per good (`foodEnergy`) and a 1,950 kcal requirement. Food sufficiency
  is measured from what households actually bought, smoothed over 30 days.
- **Player levers:**
  - New technology effects: `urban-sanitation` (basic sanitation, public-health
    administration, water treatment, environmental health) and `contraception` (family
    planning).
  - Existing levers now act on demography: education funding and laws (literacy),
    health-staff share and funding (health factor and sanitation), food and trade (calories).
- **Annual record:** `World.demography` keeps per country and year the realised births and
  deaths, start and end population, TFR, life expectancy, under-5 mortality and urban share.
- **UI (phone first):**
  - **Population ledger** ("Births, deaths and lifespans"):
    - births and deaths per 1,000 and natural growth;
    - children per woman, life expectancy, under-5 deaths, food eaten and towns;
    - this year's recorded births and deaths;
    - a population pyramid;
    - a yearly history chart (births · deaths / children per woman / life expectancy, with
      44-pt switches);
    - "What moves these figures", which names the levers.
  - **Province panel:** the same rates and a compact pyramid, sent for the one province shown
    (worker command `SET_PROVINCE_FOCUS`).
  - Everything is styled from the design tokens; nothing depends on hover.
- **WPP is validation only:**
  - The 1950–2000 annual world schedules and the WPP 2024 regional 1975/2000 figures sit
    under `data/validation/`.
  - A test proves no simulation source reads them.
  - The comparison report is `docs/P4_WPP_COMPARISON.md`.

## 2. Files

Created:
- **Simulation:**
  - `population/demographicLevels.ts` (causes, levels, calibration, month and day updates);
  - `population/indicators.ts` (life table, rates, pyramid);
  - `economy/demographyFactors.ts` (country causes, start calibration);
  - `economy/demographyReport.ts` and `demographyReportState.ts` (annual record).
- **Data:**
  - `packages/data/src/demography1900.ts`;
  - `historical/p4/gapminder_1900.json`, `proxies_1900.json`,
    `province_modern_country_1900.json` and `demography_1900.json` (generated);
  - `validation/wpp_regions_1975_2000.json` and `wpp_world_schedules_1950_2000.json`.
- **Scripts:** `scripts/p4/fetch-sources.mjs`, `build-province-crosswalk.mjs`,
  `build-demography-1900.mjs`, `wpp-comparison.mjs` and `playtest-demography.mjs`.
- **Worker:** `packages/sim-worker/src/demographySnapshot.ts`.
- **App:** `packages/app/src/components/Demography.tsx`.
- **Bench:** `packages/bench/src/p4Demography.ts`.
- **Tests:** `packages/tests/src/p4-demography.test.ts` and `fixtures/p4Encoding.ts`.
- **Evidence and docs:** `docs/images/p4/` (screenshots and `playtest-demography.json`),
  `docs/p4/` (`start-1900.txt`, `century-run.json`), `docs/P4_WPP_COMPARISON.md`, and this
  report.

Modified, by area:
- **Simulation:**
  - `constants.ts`: schema 31.
  - `population/constants.ts`: P4 coefficients; the M2 unmet-needs mortality terms removed.
  - `population/types.ts`, `definitions.ts`, `state.ts`, `demography.ts`, `needs.ts`.
  - `economy/day.ts`: factors, month-start lag, calories, annual record.
  - `economy/state.ts`: calibration at creation.
  - `economy/technology.ts` and `types.ts`: new effects.
  - `economy/migration.ts`: literacy fix (§3.6).
  - `serialization.ts`, `world.ts`, `tick.ts`.
  - `stateHash.ts`: `hashEncodedWorld`.
- **Worker:** `protocol.ts` (protocol 20, demography types, `SET_PROVINCE_FOCUS`),
  `snapshot.ts`, `host.ts`.
- **App:** `PopulationScreen.tsx`, `GameShell.tsx` (province panel), `SimulationProvider.tsx`,
  `storage/saveStorage.ts` (schema 31).
- **Data:**
  - `demography.json` (standard schedule, food energy);
  - `technology.json` (5 effects);
  - scenarios `m11_world_1900.json` (demography file), `m2_world_aggregate.json` and
    `m5_eight_polities.json` (1900 world levels);
  - `src/historical.ts` and `load.ts`;
  - `p2b/build_report.json` (input checksums only).
- **Generators:** `scripts/p2/build-province-scenario.mjs` (keeps the demography file in
  meta), `scripts/m14/monetary-terminology-audit.mjs` (protocol 20).
- **Regenerated:** `sim-worker/src/generated/worldScenario.ts`,
  `app/src/generated/simWorker.ts` and `app/public/map/atlas-v1.html` (the map runtime
  bundles `provinceEconomyRows` from the protocol).
- **Docs:** `DECISIONS.md` (D-142), GDD (§17J status, §6.6 note), `PROSPERITY_PROGRAM.md`,
  `HISTORICAL_DATA_PROVENANCE.md`.
- **Tests updated:** see §4.

## 3. Behaviour and design decisions (details in D-142)

1. **Residuals.** At world creation each block's residuals are fixed so that, under its
   country's start-of-game factors and full food, it reproduces its sourced levels.
   - They stand for unmodelled persistent factors (marriage pattern, breastfeeding, disease
     environment).
   - They never change and never accumulate (No-Mana).
   - With constant causes the levels are constant; this is tested.
2. **1900 = 1896–1905 means.** Single years carry crises; India's 1899–1900 famine gives a
   life expectancy of 19.5 against 24–25 around it. The game starts from the decade's level
   and makes its own crises.
3. **Levels per province, not per country.** Colonies are provinces of their sovereign:
   British India sits inside the UK. A Natural Earth crosswalk assigns each province the
   modern country under its own point, with 21 coastal points by nearest boundary.
4. **Two mortality levels.** A child level (fitted to under-5 mortality) and an adult level
   (fitted to life expectancy) reproduce both sources in the game's own life table.
5. **Derived, not stored, levels.** The stored state is:
   - the three residuals and the urban share;
   - the lagged child mortality (monthly) and the food sufficiency (daily), both rounded to
     the stored-rate precision.

   This keeps saves 3 % smaller than storing the levels.
6. **Migration fix (pre-existing defect, also on `main`).**
   - Migration left the source block's 15+ literacy aggregate stale, so from day 31 full
     validation, and every save, failed.
   - Fixed, with a regression test. A failed migration now also restores per-age literacy.
7. **Famine lowers births.** This was added after the first century run: the lagged
   child-mortality term alone pushed TFR to 8.3 under the persistent food collapse (§7).
8. **Snapshot budget.** Per-province rates and pyramids for all 1,687 provinces made the
   snapshot 1.05M characters against the 700k budget. Only the country views and the one
   focused province are sent now, so the snapshot stays at 0.73M characters.

## 4. Commands and results

| Command | Result |
|---|---|
| `pnpm test` | **PASS:** 114 suites, 1,378 tests, after the last simulation change. The app-facing suites (`m16*`, `e1-ui-wiring`, `m13`, `m14`, `m15-map-bundle`) were re-run after the last UI change: **143/143 pass** |
| `pnpm typecheck` | **PASS** |
| `pnpm lint` | **PASS** (321 files, 76 in `packages/sim`) |
| `node scripts/p4/build-demography-1900.mjs --check`, `build-province-crosswalk.mjs --check` | current |
| `node scripts/p2/build-province-scenario.mjs --check`, `scripts/p2b/build-money-calibration.mjs --check` | current |
| `pnpm -F @century/sim-worker scenario:build:check`, `pnpm -F @century/app build:worker:check` | current |
| `pnpm map:atlas:check` | current (after `pnpm map:atlas`) |
| `pnpm audit:monetary`, `pnpm audit:branding`, `node scripts/m11e/check-sim-dependencies.mjs` | pass; 0 cycles (a cycle introduced during P4 was found by this check and removed) |
| `pnpm -F @century/app export:web` then `node scripts/p4/playtest-demography.mjs` | **25/25 checks**, 0 console errors |
| `node scripts/perf/playtest-stage.mjs` | **13/13 checks** |

P4 acceptance tests (`p4-demography`, 17 tests):
- 1900 calibration per country and per source geo.
- Single-cause fixtures: literacy, urban share, income, lagged child mortality,
  contraception, health.
- Famine through food only.
- Conservation through births, deaths, migration and ageing.
- Determinism and save round trip.
- Rejection of impossible states.
- No WPP reads in simulation source.
- Player levers.
- Worker snapshot and province focus.
- Migration regression.

**Re-pinned hashes, with reasons:**
- **`determinism` (empty world) and `m3a-serialization`:** encoding only. `prePhase4Digest`
  removes the P4 fields, sets the schema to 30, and reproduces the old digests
  `f4a2b473a9d60631` and `74d55ceaa8f99ea8`; both assertions stay in the tests.
- **`m14` 1900 world:** sourced levels, age structures, technology effects, schema.
- **`batch5` (M5 sample, 22 ticks):** 1900 world levels and calorie mortality.
- **`m2-calibration` (two):** the trajectory and the encoding change.

**Tests restated (please review):**
- **`m2-calibration`:**
  - The 1950 total check relied on the removed 1.45 mortality scaling; it now documents the
    overshoot of a cause-free population-only world.
  - The WPP 1975/2000 engine check is kept at full strength, with WPP rates now fed by the
    test itself.
  - A no-drift test was added.
- **`m5-feasibility`:** the binary unmet-days share is 25 % because two markets' fish and
  livestock capacity sits exactly at demand (99.86 % supplied). The test now checks the two
  causes of a shortage (supply and calories) and bounds the binary share at 30 %.
- **Unmet-days mortality tests** (`m2-demography`, `m2-wealth`): rewritten for calories.
  The counters still drive militancy, wealth and AI, which is asserted.

## 5. Benchmark (Node diagnostic; device performance not evaluated)

Node 24.22.1, Windows x64, AMD Ryzen 5 2600, 7.93 GiB. `main` (5150011) was built in a
separate worktree and measured back to back with the branch on an idle machine, using
`node packages/bench/dist/perfPhases.js` and `node packages/bench/dist/perfBench.js 92`.

| Item | Stage-2 report | P3 report | `main` today | **P4 today** |
|---|---:|---:|---:|---:|
| Host day mean / p50 (ms) | 356 / 303 | 359 / 304 | 358 / 307 | **351 / 299** |
| Tick mean / p50 | 310 / 260 | 312 / 260 | 309 / 262 | **303 / 255** |
| Snapshot build mean / p50 | 39.4 / 37.3 | 40.4 / 37.6 | 42.3 / 40.7 | **41.4 / 38.5** |
| Demography phase (mean) | — | — | 29.2 | **30.9** |
| Needs phase (mean) | — | — | 21.6 | **23.1** |
| Ordinary day (perfPhases, days 2–11) | ~265 | 271.7 | 270.0 | **284.1** |
| Month starts ÷ ordinary p50 | 3.08–3.53× | 2.58–3.41× | 2.44–3.34× | **2.61–3.45×** |
| Save / load (ms) | 1,094 / 1,173 | 1,025 / 1,118 | 1,059 / 1,155 | **942 / 1,002** |
| Stored save at day 92 (chars) | — | — | 5.11 M | **5.22 M** |
| First CREATE_GAME (fresh host) | 63 | 76.4 | 69.5 | **74.4** |
| Host throughput at 30 days/s | 3.09 | 3.21 | 3.22 | **3.15** days/s |
| Snapshot JSON p50 | — | 0.73 M | 0.73 M | **0.73 M** |

Determinism (two runs), staged = phase mode and the save round-trip hash: **PASS**.

The cost added by P4:
- **Demography phase:** about +1.7 ms. The levels are derived per block and day.
- **Needs phase:** about +1.5 ms (calorie accounting).
- **Snapshot:** about +1.5 ms (measured separately, 36.5 → 38.4 ms).

Total day cost is within the run-to-run noise of these measurements: three `main` runs today
gave an ordinary day of 270–283 ms. The perfPhases difference (270 → 284) is on a 10-day
sample.

Earlier measurements on this branch led to two changes:
- Snapshot demography was +7 ms; it is now computed lazily for the countries shown.
- The save was 5.29 M characters; it is 5.22 M now that the levels are derived.

## 6. Assumptions and provisional values

- Every P4 coefficient is provisional. P15 calibrates against WPP 1950–2000, which is a
  target, never an input.
- **Sources:** the 1896–1905 window; 55 authored stand-ins covering 74 provinces (low
  confidence). Microstate 1900 TFRs are rejected.
- **Crude death rate:** no open per-country 1900 source exists. The target is the stable
  population rate implied by the sourced life expectancy and under-5 mortality. A
  designer-supplied Mitchell table would replace it.
- **Crude birth rate:** within ±15 % of Gapminder for every country except Greece and Crete.
  Gapminder's Greek 30.5 is inconsistent with its own TFR of 5.2 (about 38 implied), a sign
  of under-registered births. Full table: `docs/p4/start-1900.txt`. The USA is at −11 %; its
  immigrant age structure differs from a stable population.
- **Female literacy:** the 15–49 cohorts' literacy, both sexes (no sex-specific literacy
  yet).
- **Income:** inverted from `wealthLevel`.
- **Causes not modelled yet:** no family-law slot; crowding is the urban penalty until P6
  housing; war acts on civilians only through food.
- **Food energy per kg** (grain 3,400, livestock 2,300, fish 1,000, food products 2,500
  kcal) and the 1,950 kcal requirement are provisional.
- **Data version** stays `m3-economy-v12`, as in P2 and P3.

## 7. Deviations, limitations and open items

1. **The 1900 economy cannot feed its people (pre-existing, also on `main`).**
   - Within months, grain piles up unsold (9.8 Mt by day 300). Prices fall, farm revenue and
     wages fall, and households can afford under half their basket.
   - On `main` the unmet-days terms then kill about 91 million people in the first year.
   - In P4 the same collapse acts through calories:
     - world food sufficiency falls to 30–40 %;
     - life expectancy falls to about 15;
     - population declines about 1 % a year (century run, §8).

   P4 does not hide this. The cause is economic: no own consumption, fixed wages, no private
   investment. It belongs to P5–P7. Until it is fixed, every demographic trajectory is a
   famine trajectory, and the WPP comparison measures that rather than the demographic
   model. **Proposed:** bring P5's own consumption (peasants eat before they sell) forward,
   or fix the wage and price spiral, before calibrating P4 (P15).
2. **Web saves exceed localStorage (pre-existing).**
   - The stored save grows with history: 5.11 M at day 92 on `main`, then 7.4 M at day 200
     and 11.0 M at day 366.
   - Chrome's quota is about 5.24 M characters. The P4 browser check shows an "Autosave
     failed … exceeded the quota" banner on 1 January 1901.
   - On `main` the same save fails earlier, on the literacy defect fixed here (§3.6).
   - P4 adds 2 % (+0.10 M at day 92).
   - Android's AsyncStorage has a similar total limit, so this needs its own stage (storage
     backend or save compaction).
3. **Restated tests** (`m5-feasibility`, `m2-calibration`): listed in §4 for review.
4. **TFR decline in a no-input run.** It follows literacy and urbanisation in the
   single-cause fixtures (tested). In the no-input century run, the famine dominates the
   causes (§8).
5. **Device behaviour:** not evaluated. Device testing is the designer's.

## 8. WPP comparison and no-input century run

See `docs/P4_WPP_COMPARISON.md`, generated by `node scripts/p4/wpp-comparison.mjs
docs/p4/century-run.json` from the run
`node packages/bench/dist/p4Demography.js run 36524 --out docs/p4/century-run.json`.

**The run did not reach 1975 or 2000, so the WPP 1975/2000 acceptance item is not met.**

The run stopped on simulated day 6,320 (April 1917, after 4.6 hours). The rollback runner
rejected the day because a market sale's total was zero or not finite: the settlement
invariant `pendingTransactions[7250].totalRUSD must be finite and strictly positive`. That
check is in market settlement, not in P4 code; the runner correctly refused to accept the
day. Reproducing it means re-running to day 6,320 (about 4.3 hours), which has not been
done. Proposed as its own investigation together with item 7.1, because it arises after
17 years of the food collapse.

World trajectory of the run (1 January; full regional tables in
`docs/P4_WPP_COMPARISON.md`, data in `docs/p4/century-run.json`):

| Year | Pop. (M) | CBR | CDR | TFR | e0 | Women literate | Food eaten |
|---|---:|---:|---:|---:|---:|---:|---:|
| 1900 | 1,584 | 41.2 | 30.4 | 5.52 | 32.9 | 29 % | 100 % |
| 1904 | 1,428 | 30.7 | 48.6 | 3.68 | 15.1 | 28 % | 42 % |
| 1917 | 1,173 | 34.1 | 49.7 | 3.29 | 14.8 | 36 % | 32 % |

By region in 1917, Asia has fallen from 895 to 494 million (11.6 % of food needs met) and
Africa from 125 to 76 million. Europe holds at 455 million on half its food; Northern
America grows (82 → 100 million).

This is the famine of item 7.1 working through the demographic causes:
- births fall with food;
- deaths rise with food;
- literacy still rises, from 29 % to 36 %.

The demographic model behaves as specified under these conditions, but the run cannot
validate the demographic transition against WPP until the economy can feed its people. The
fixtures in `p4-demography` test the transition causally; that acceptance item is met there.

**Acceptance summary:**

| Criterion | Status |
|---|---|
| Per-country 1900 crude birth and death rates within documented tolerance | **Met**, except Greece and Crete (source inconsistency, documented) |
| TFR declines follow literacy and urbanisation, tested causally with single-cause fixtures | **Met** in fixtures; not observable in the no-input run because of the famine |
| A famine fixture raises mortality only through food shortfall | **Met** |
| Population conservation exact (births, deaths, migration, ageing) | **Met** |
| WPP comparison report at 1975 and 2000 per region | **Not met.** The report exists, but the run stopped in 1917 (above) |
| New figures on the phone layout | **Met** in the browser at 844×390; device not tested |
| Performance not worse without saying so | **Met:** within noise; costs itemised in §5 |
