# P6 completion report — Engel demand, saving and housing

**Branch:** `prosperity/p6-demand` from `main` at `051d7f0` (local commits only; nothing pushed).
**Decision:** D-153. **Plan:** `docs/P6_PLAN.md` (approved by the designer on 2026-11-08; Q1–Q16
decided as recorded in its §0).
**Versions:** world schema 34, simulation 0.30.0, data `m3-economy-v14`, worker protocol 23,
map bridge protocol 4.
**Status:** merged into `main` on the designer's instruction of 2026-11-08, with the unresolved
items listed in §7. The designer chose option (a) for clothing and scheduled the
flax, hemp and jute fibre good in P7 (D-153 addition). One P5b acceptance test (cotton within
0.85–1.15 of the 1900 crop; now 1.45×) fails and is kept as P7's acceptance test (§5.1).

## 1. Commits

| Commit | Content |
|---|---|
| `630ddb4` | Step 1: aluminium modelled ÷ sourced in tonnes (P5b report §11.2) |
| `7a01cd9` … `8a49727` | The plan, the Victoria 3 comparison, decisions Q1–Q16 |
| `ec909f8` | Simulation core: demand system, saving, housing, schema 34 |
| `78171d9` | Province fixture with the housing reference |
| `fe3e258` | Generator and sources, D-153, status lines |
| `817a16c` | Data v14, loader, protocol 23, phone screens, crowding lens, test re-pins |
| `74e4f90` | This report; map-mode registry test |
| `b9bbd09` | Option (a): committed clothing at the 1900 fibre supply; fibre good to P7 |

## 2. Files

**Created**
- Simulation: `population/demandSystem.ts`, `population/housing.ts`, `economy/householdDemand.ts`,
  `economy/demandDay.ts`.
- Worker: `sim-worker/src/householdsSnapshot.ts`.
- Generator: `scripts/p6/demand.mjs`, `scripts/p6/report.mjs`.
- Data: `historical/p6/sources_1900.json` (authored), `historical/p6/demand_1900.json` and
  `historical/p6/pops_1900.json` (generated).
- Documents: `docs/P6_PLAN.md`, `docs/P6_BEFORE_AFTER.md` and `docs/P6_DEMAND_PROVENANCE.md`
  (generated), this report, `docs/images/p5b/p6-844x390-*.png`.
- Tests: `economy/demand-system.test.ts`, `data/p6-world.test.ts`, `fixtures/p6Encoding.ts`.

**Modified (main ones)**
- Simulation: `constants.ts` (schema, versions), `population/constants.ts`, `population/types.ts`,
  `population/state.ts`, `population/demographicLevels.ts` (crowding factor), `economy/types.ts`,
  `economy/state.ts`, `economy/day.ts`, `economy/politics.ts` (unrest), `economy/constants.ts`,
  `serialization.ts`, indexes.
- Data loader `historical.ts`, `version.ts`; scenarios, `technology.json`, `politics.json` (v14).
- Generator: `scripts/p5b/build-goods-1900.mjs`, `catalogue.mjs` (good 59, residential
  builder), `placement.mjs` (household quantities hook), `scripts/p2/build-province-scenario.mjs`.
- Worker `protocol.ts`, `snapshot.ts`; app `PopulationScreen.tsx`, `GameShell.tsx`,
  `map/mapModes.ts`, `map/lenses.ts`, `map/bridge/protocol.ts`, `map/host/mapHostState.ts`,
  `map/runtime/main.ts`, `storage/saveStorage.ts`; generated bundles and atlas.
- `DECISIONS.md` (D-153), `docs/PROSPERITY_PROGRAM.md`, GDD status, P5b report §11.2,
  `scripts/m14/monetary-terminology-audit.mjs` (protocol 23), `scripts/p5b/playtest-goods.mjs`.

## 3. Behaviour

1. **Demand.** Each block buys its committed quantities per adult equivalent (Atwater scale),
   then allocates μ × (income − committed cost) across seven categories by a sourced
   marginal-share schedule in the consumption ratio x (exact integral, adding-up holds), with
   good weights that move with x (food ladder), CES substitution inside categories, retail
   margins scaled by urban share, and national tastes for coffee-tea-cocoa and sugar.
   Knots (local slopes of each budget set): Belgium 1853 at x = 1.46 (food 0.66), United
   States 1901 at 5.14 (food 0.41), United States 1990 at 18.95 (food 0.18).
2. **Saving.** μ by stratum (0.94 / 0.85 / 0.60), consumption out of wealth 4 % a year above a
   30-day reserve; below subsistence a block buys its committed basket from cash. Income is
   measured each day (cash change plus purchases plus kept food) and smoothed over a year;
   prices are smoothed over 30 days.
3. **Housing.** Blocks own dwellings (1900: province census persons per dwelling, split by
   persons × income^0.46; crowding 1.0 for every block). Orders each day = the day's
   depreciation + 1/30 of the gap to the desired stock, bought from residential builders at
   the lowest priority from cash above the reserve; depreciation 0.5 % a year. Crowding above
   1900 raises child and adult mortality and province unrest.
4. **Phone (844 × 390, tokens, 44-point controls).** Population screen *Households* section
   (food share and category shares, saving rate by class, dwellings, persons per dwelling,
   crowding); province panel housing row; map lens *Crowding*.

## 4. Measurements (generator and Node; no device result is claimed)

From `docs/P6_BEFORE_AFTER.md` (final, after option (a)):
- Covered value added 517.2 bn RUSD, **49.9 %** of world GDP (P5b close 40.7 %).
- Territories above 100 % of GDP: **21** (P5b: 12) — colonies and microstates with export
  crops at sourced shares (mco, lie, cos, bra, dom, mal, bwi, fji, …).
- Modelled ÷ sourced: coffee-tea-cocoa 2.36 → **1.19**; steel 0.25 → 0.48; iron ore 0.16 →
  0.30; tobacco 0.92; sugar 0.79; rubber 0.42 → 1.12; **cotton 0.97 → 1.45** and silk 1.45;
  wool output covers 25 % of mill demand.
- Planned 1900 food shares: United States 52.5 %, Germany 56.4 %, China 72.9 % (per country in
  the generated report).
- 7,205 buildings.
- One week of the 1900 world (US market; measured before option (a)): meat +0.7 % (inside the
  D-136 bound), dairy +7 %, clothing +27 % (wool), grain −21 % and produce −12 % (food gluts,
  as in P5a), timber −15 %, dwellings −30 % (start-up month). The D-136 meat test passes after
  option (a) as well.

## 5. Commands and results

| Command | Result |
|---|---|
| `node scripts/p5b/build-goods-1900.mjs` then `node scripts/p2/build-province-scenario.mjs`; P2b and P5 build reports regenerated | all `--check` current |
| `pnpm -F @century/sim-worker scenario:build`, `pnpm -F @century/app build:worker`, `pnpm map:atlas` (and `:check`) | current |
| `node scripts/docs/decisions-index.mjs --check` | current (153) |
| `node scripts/m14/monetary-terminology-audit.mjs` | passed |
| `pnpm typecheck` | 0 errors |
| `pnpm test` (on `ec909f8`, before the data and re-pins) | 12 suites failed, all re-pins or stale generated files, fixed in `817a16c` |
| `pnpm test` (on `817a16c`, and final on `b9bbd09`) | see §5.1 |
| `pnpm app:export`, then `node scripts/p5b/playtest-goods.mjs` (on `b9bbd09`) | web, iOS and Android exported; 24/24 at 844 × 390, no console errors, exceptions or failed loads |
| `pnpm bench`, perfPhases, perfBench | not run (skipped at the designer's request) |

### 5.1 Final test run

`pnpm test` on `b9bbd09` (2,113 s): **102 of 103 suites, 1,453 of 1,454 tests passed.**
The one failure is the P5b acceptance test `data/world-1900` › cotton and wool follow the 1900
world fibre supply (D-148 item 13): modelled cotton 1.45× against the 0.85–1.15 band. The
designer scheduled the flax, hemp and jute fibre good in P7 and the test is kept, unweakened,
as its acceptance test. The P6 acceptance tests (food share falls with income, substitution,
dwelling conservation, determinism, save round trip) all pass.

Earlier run on `817a16c`: 100 of 103 suites (the map-mode registry list, fixed in
`74e4f90`, and the two clothing tests resolved or scheduled above).

## 6. Open items, assumptions and deviations

### 6.1 For the designer

1. **Clothing (decided 2026-11-08).** Removing the cloth factor had doubled the committed
   clothing quantity, so food's committed share (0.655) fell below its first-knot marginal share
   (0.661) and cotton rose to 1.76×. The designer chose option (a), committed clothing at the
   1900 fibre supply (0.0052 garments a day per person): the food share now falls with income
   from subsistence (committed food share 0.73–0.76) and cotton is 1.45×. Option (c), a fibre
   good for flax, hemp and jute, is scheduled in P7; option (b) is not pursued.
2. **Dwelling start-up.** Builders are sized to replacement plus growth; households reach that
   flow after about a month, so dwelling prices fall at first (storable stock).

### 6.2 Assumptions and limitations (provisional unless stated)

- Knots are local slopes of three budget sets (negative slopes set to 0); the 1990 consumer unit
  is taken as 2.0 adult equivalents; the Engel Quet as one adult equivalent; 1853 prices equal
  to 1900.
- μ middle and upper, consumption out of wealth, the firewood minimum, non-food margins, σ,
  crowding weights, the unrest weight, depreciation (bracketed by sources) and the 1990
  persons per dwelling (to confirm) are provisional.
- The generator's 1900 incomes are wage × participation × working-age share; blocks without
  covered jobs live on their savings; several poor countries' lower classes start below
  subsistence and dissave (Germany's lower stratum shows −0.1 %).
- Household bond coupons and redemptions count as income (until P11). Rent, landlords,
  mortgages and housing services as value added are not modelled (P9–P11). Migration does not
  yet read housing (P7).
- Deferred: steel, iron ore and copper to P8/P10; gold and silver to P11.

### 6.3 Not done

- Performance (designer's hold): no benchmark run; household demand rows grow because every
  block now buys every category.
- No tablet playtest, no device test.

## 7. Unresolved items at the close of P6 (consolidated, 2026-11-08)

This section is the single list to carry forward. Figures are from the final generator run
(`docs/P6_BEFORE_AFTER.md`) unless stated otherwise.

### 7.1 Acceptance criteria not met or not verified

- **Cotton (P5b acceptance test, D-148 item 13):** modelled cotton is 1.45× the 1900 world crop
  (band 0.85–1.15); `data/world-1900` › "cotton and wool follow the 1900 world fibre supply"
  fails. Cause: all non-wool cloth demand falls on cotton. **Scheduled in P7:** a fibre good for
  flax, hemp and jute; the test is P7's acceptance test.
- **Performance:** not measured (designer's hold). Every block now buys every category, so
  household demand rows grow several-fold; no `pnpm bench`, perfPhases or perfBench was run.
- **No long run:** only short runs (tests, a seven-day diagnosis). No multi-year run of the
  P6 1900 world has been made; long-run saving, idle cash and housing behaviour are unmeasured.
- **Devices:** only the 844 × 390 web playtest; no tablet or device test.

### 7.2 Market behaviour in the first week (US market, measured before option (a))

- Grain −21 % and produce −12 % (the food gluts of P5a), timber −15 %, dairy +7 %.
- Clothing +27 %: wool output covers 25 % of mill demand (the fibre item above).
- Dwellings −30 %: builders are sized to replacement plus growth; household orders reach that
  flow after about a month (30-day gap closing). Unsold dwellings are stored.
- Meat stays within the D-136 bound (test passes).

### 7.3 Calibration and data (provisional unless stated)

- **Demand schedule:** three knots from local slopes (Belgium 1853, US 1901, US 1990); negative
  slopes set to 0 (the 1901 raw slopes summed to 0.92). The fit to each set's levels is not
  reported per class. The Engel Quet is taken as one adult equivalent, 1853 prices as equal to
  1900, the 1990 consumer unit as 2.0 adult equivalents. Tobacco has no 1990 share; household
  goods, tobacco and transport have none at the 1853 knot.
- **Committed basket:** P2b subsistence food and basic clothing (× 0.52) per adult equivalent;
  the firewood minimum (0.0004 m³ a day) is provisional.
- **Margins:** food margins from the 1901 retail prices (grain and processed food include
  milling); the 0.6/0.4 commerce/transport split and all non-food margins are provisional.
- **Saving:** μ lower 0.94 calibrated (1901 surplus); middle 0.85 and upper 0.60, the 4 % wealth
  drawdown and the 30-day reserve are provisional. No pre-1929 US personal-saving series was
  found.
- **Housing:** depreciation 0.5 % a year (bracketed, not fitted); the income elasticity 0.46
  needs the 1990 persons per occupied unit confirmed from the 1992 Statistical Abstract;
  dwelling price the US 1900 non-farm average for every market (scaled by price level);
  materials recipe provisional; persons per dwelling sourced for 14 countries (Webb 1911),
  median 5.2 elsewhere; Germany uses households as dwellings.
- **Crowding:** mortality weights 0.5/0.3 and the unrest weight 0.1 are provisional (Russell
  1888 gives order of magnitude only).
- **Tastes:** eight countries (Webb, c. 1901); two OCR readings (France and Italy sugar) not yet
  checked against the page image; income effects removed by GDP per head ratio (provisional).
- **Incomes:** the generator's 1900 income = wage × participation × working-age share. Several
  poor countries' lower classes start below subsistence and dissave (Germany's lower stratum
  −0.1 %); blocks without covered jobs live on their savings until P7/P10.

### 7.4 Coverage and output

- Covered value added 49.9 % of world GDP (P5b close 40.7 %): government services, non-housing
  investment and housing services are outside coverage.
- 21 territories exceed 100 % of GDP (P5b: 12): colonies and microstates with export crops at
  sourced shares.
- Modelled ÷ sourced: steel 0.48, iron ore 0.30, copper ore and tin about 0.6 (investment
  demand: P8 infrastructure, P10 company investment); gold 0.52 and silver 0.21 (monetary
  demand, P11); coffee-tea-cocoa 1.19; rubber 1.12; aluminium 1.39.

### 7.5 Simplifications to revisit in later stages

- No rent, landlords, mortgages or housing services as value added (P9–P11).
- Household bond coupons and redemptions count as income (P11).
- Migration does not read housing (P7: "toward jobs and housing").
- The tier path remains for legacy worlds (plan Q9a); retire it when the fixtures migrate.
- No player lever for public housing (P14 levers); E3 can already build residential builders.
- The web autosave still exceeds the storage quota on the 1900 world (P7b).
