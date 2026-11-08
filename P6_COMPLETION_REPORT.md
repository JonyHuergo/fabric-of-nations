# P6 completion report — Engel demand, saving and housing

**Branch:** `prosperity/p6-demand` from `main` at `051d7f0` (local commits only; nothing pushed).
**Decision:** D-153. **Plan:** `docs/P6_PLAN.md` (approved by the designer on 2026-11-08; Q1–Q16
decided as recorded in its §0).
**Versions:** world schema 34, simulation 0.30.0, data `m3-economy-v14`, worker protocol 23,
map bridge protocol 4.
**Status:** implemented for review, with two open items for the designer (§6.1) and two
acceptance tests failing on the 1900 data (§5.1).

## 1. Commits

| Commit | Content |
|---|---|
| `630ddb4` | Step 1: aluminium modelled ÷ sourced in tonnes (P5b report §11.2) |
| `7a01cd9` … `8a49727` | The plan, the Victoria 3 comparison, decisions Q1–Q16 |
| `ec909f8` | Simulation core: demand system, saving, housing, schema 34 |
| `78171d9` | Province fixture with the housing reference |
| `fe3e258` | Generator and sources, D-153, status lines |
| `817a16c` | Data v14, loader, protocol 23, phone screens, crowding lens, test re-pins |

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

From `docs/P6_BEFORE_AFTER.md`:
- Covered value added 524.9 bn RUSD, **50.6 %** of world GDP (P5b close 40.7 %).
- Territories above 100 % of GDP: **21** (P5b: 12) — colonies and microstates with export
  crops at sourced shares (mco, lie, cos, bra, dom, mal, bwi, fji, …).
- Modelled ÷ sourced: coffee-tea-cocoa 2.36 → **1.15**; steel 0.25 → 0.48; iron ore 0.16 →
  0.30; tobacco 0.90; sugar 0.77; rubber 0.42 → 1.10; **cotton 0.97 → 1.76** and silk 1.76;
  wool output covers 20 % of mill demand.
- Planned 1900 food shares: United States 51.7 %, Germany 55.1 %, France 56.2 %, Italy
  61.5 %, Japan 63.5 %, Russia 65.5 %, China 65.6 %.
- 7,140 buildings, of which 420 residential builders.
- One week of the 1900 world (US market): meat +0.7 % (inside the D-136 bound), dairy +7 %,
  clothing +27 % (wool), grain −21 % and produce −12 % (food gluts, as in P5a), timber −15 %,
  dwellings −30 % (start-up month).

## 5. Commands and results

| Command | Result |
|---|---|
| `node scripts/p5b/build-goods-1900.mjs` then `node scripts/p2/build-province-scenario.mjs`; P2b and P5 build reports regenerated | all `--check` current |
| `pnpm -F @century/sim-worker scenario:build`, `pnpm -F @century/app build:worker`, `pnpm map:atlas` (and `:check`) | current |
| `node scripts/docs/decisions-index.mjs --check` | current (153) |
| `node scripts/m14/monetary-terminology-audit.mjs` | passed |
| `pnpm typecheck` | 0 errors |
| `pnpm test` (on `ec909f8`, before the data and re-pins) | 12 suites failed, all re-pins or stale generated files, fixed in `817a16c` |
| `pnpm test` (final, on `817a16c`) | see §5.1 |
| `pnpm -F @century/app export:web`, then `node scripts/p5b/playtest-goods.mjs` | 24/24 at 844 × 390, no console errors, exceptions or failed loads |
| `pnpm bench`, perfPhases, perfBench | not run (skipped at the designer's request) |

### 5.1 Final test run

`pnpm test` on `817a16c` (2,084 s): **100 of 103 suites, 1,451 of 1,454 tests passed.**
Failures:
- `map/style` — the mode registry list lacked the new lens; updated after the run (17/17
  pass on re-run).
- `data/world-1900` › cotton and wool follow the 1900 world fibre supply (D-148 item 13):
  modelled cotton 1.76× against the 0.85–1.15 band.
- `data/p6-world` › acceptance (data): food's committed share 0.655 is below its first-knot
  marginal share 0.661.

The last two are the clothing item of §6.1 and are left failing for the designer's decision;
neither test was weakened. `pnpm app:export` exported web, iOS and Android; the playtest on
the final bundle passed 24/24.

## 6. Open items, assumptions and deviations

### 6.1 For the designer

1. **Clothing and the food-share condition (Q12a consequence).** Removing the cloth factor
   doubled the committed clothing quantity (P2b basic tier, 0.01 garments a day). Results:
   cotton 1.76×, wool 20 % of demand, clothing +27 % a week, and the committed food share
   (0.655) is just below food's marginal share at the first knot (0.661), so the food share is
   flat-to-rising in a narrow band just above subsistence; the 1900 acceptance test
   `p6-world` fails on this. Experiment (not committed): with the fibre-calibrated committed
   clothing (0.0052) the condition holds (0.73–0.76) but cotton stays 1.46×, because the 1901
   US clothing marginal share (0.24) is high for the world. Options: (a) committed clothing at
   0.0052; (b) also a world clothing knot from a non-US budget; (c) a fibre good for flax,
   hemp and jute.
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
