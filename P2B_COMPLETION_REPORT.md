# P2b completion report — historical money and productivity calibration

Date: 2026-11-03. Branch `prosperity/p2b-money-calibration` from `main` at `82cbfd9`.
Decisions: D-135 (calibration basis, designer's choices A1-A8), D-136 (price rule and
money-scale tolerances). Plan, inventory and sources: `docs/P2B_CALIBRATION_PLAN.md`.

## 1. Scope delivered

- **Source table** `packages/data/data/historical/p2b/sources_1900.json`: 16 cited sources
  and 137 rows (90 sourced, 8 secondary, 39 provisional with reasons), the MPD benchmark or
  recorded proxy of each of the 134 territories, and the three sourced nominal GDPs used for
  the price-level fit.
- **Builder** `scripts/p2b/build-money-calibration.mjs` (`--check`, input/output checksums
  in `historical/p2b/build_report.json`). It re-derives, from the rows, every money value of
  the 1900 world: goods prices, freight, wages by territory and profession, savings,
  treasuries, administration and education budgets, debt ceilings, the income-tax rate,
  construction and upkeep costs, operating cash, opening stock, route capacities and the
  scenario money coefficients; and it recalibrates physical productivity (building levels
  and techniques). Every derived value is written with its row ids and formula to
  `historical/p2b/calibration_1900.json`.
- **Per-country wage table by profession:** `ProvinceEconomy.wageRUSDPerYearByProfession`
  (from the territory table); settlement and construction pay it.
- **Productivity:** `BuildingInstance.technique` (A3), solved so value added per level
  equals the sourced wage bill / labour share + upkeep at the market's 1900 prices; levels
  sized to the budget-driven demand of each territory (1,000 jobs per level).
- **1900-world definitions** (A6): `historical_1900_{goods,buildings,professions,needs}.json`;
  the M5 sample keeps the M11 definitions and the default coefficients.
- **US occupations** (A7) from the 1900 census groups.
- **Money coefficients** in world state (`World.moneyCoefficients`), sourced for the 1900
  world; public-service benchmarks scale with local wages (`localWageIndex`).
- **D-136:** price rule amended (sellable = opening stock + same-day output - producers'
  input demand; differs from the approved wording, see §7); tolerance and
  bound fixes found at 1900 money scale.
- **Schema 29**; the app lists schema-28 saves as incompatible (D-120).
- **Performance proposal** (separate item, not implemented): plan §8.

## 2. Files

Created: `packages/data/data/historical/p2b/` (sources, calibration, build report,
provinces, pops, buildings, countries, markets, trade routes, employment, calibration
targets, money coefficients), `packages/data/data/historical_1900_{goods,buildings,professions,needs}.json`,
`scripts/p2b/build-money-calibration.mjs`, `scripts/p2b/report-before-after.mjs`,
`packages/sim/src/economy/localWages.ts`, `packages/tests/src/p2b-money.test.ts`,
`packages/bench/src/p2bCalibrationProbe.ts`, `packages/bench/src/p2bPerfProfile.ts`,
`docs/P2B_CALIBRATION_PLAN.md`, this report.

Modified (simulation): `constants.ts` (schema 29), `world.ts`, `serialization.ts`,
`population/{types,state}.ts`, `economy/{types,constants,state,validation,settlement,
production,construction,constructionModel,market,trade,accounting,labor,politics,
technology,military,day,index}.ts`. Data loader: `packages/data/src/historical.ts`.
Worker: `sim-worker/src/snapshot.ts` (construction wage), regenerated scenario and bundle.
App: `storage/saveStorage.ts` (schema 29). Scripts: `scripts/p2/build-province-scenario.mjs`
(scenario points to the P2b outputs and 1900 definitions). Tests: `m14-rusd`,
`p2-provinces` (schema), `fixtures/provinces.ts`, and the re-pinned known answers listed in
§4. Docs: `DECISIONS.md` (D-135, D-136), GDD §7.6 note and §17J status,
`docs/PROSPERITY_PROGRAM.md`, `docs/PROVINCE_GEOGRAPHY.md` (run order).

## 3. Behaviour and design decisions

- **Conversion.** 15.704 RUSD per 1900 US dollar (CPI 392.6 / 25). Local money converts at
  the Treasury's 1 January 1901 parities (A1, exchange-rate basis).
- **GDP per head.** United States 4,375 RUSD (MeasuringWorth). United Kingdom, Australia
  and Japan from their own nominal GDP (MeasuringWorth, Ohkawa via the Bank of Japan IMES
  table) at parity. Everyone else: MPD 2023 ratio to the US (38 territories direct, 96 by a
  recorded proxy) times a price level PL = r^0.686, fitted on those three (A8). Example:
  India r = 0.119, PL = 0.232, 121 RUSD per head (about $7.70 of 1900).
- **Wages.** US: laborers 6,860 (production-worker hourly pay x 60 h x 52 weeks), clerks
  15,977 (Census manufacturing salaries per salaried worker), academics 5,104 (NCES teacher
  salary), peasants 3,430 (0.5 x laborer, provisional). UK laborers 5,194 (Clark's average
  earnings). Elsewhere laborers = 1.47 x GDP per head (the mean US/UK ratio) and the other
  professions keep the US ratios. 134 territory tables, one per province.
- **Prices (RUSD per unit).** Grain 0.406/kg (Chicago wheat 70.4 cents a bushel), livestock
  1.776/kg live (Chicago cattle), cotton 3.338/kg, wool 22.83/kg, food products 0.679/kg (BLS
  flour), textiles 14.36/kg (cotton print cloth with a woollen share at the same markup),
  garments 14.36. Market opening prices = base x population-weighted PL of the market's
  territories (US 0.92, British customs territory 0.31; 8 markets clamped at the 0.25 floor).
- **Needs (A4).** The comfort and luxury tiers are scaled so a household with every tier
  active spends the BLS 1901 budget per person: 1,048 RUSD of food and 346 of apparel.
- **Missing producers.** 181 basic buildings added where a market had no producer of a
  household good (41 of 63 markets had farms only); 630 P2 buildings without demand are
  dropped (mostly surplus warehouses).
- **Productivity (A2, A3).** Each territory's producers meet its own demand first;
  technique sets value added per level to the wage bill / labour share (0.5 farms, 0.58
  manufacturing) + upkeep; where that needs more than 95% of a territory's workforce, the
  technique rises instead (37 territories). Technique spans 0.15-42, and up to 262 in flour
  mills (output per mill worker was very high in 1900).
- **Fiscal (A5).** Tax rate 7.8% (Wallis: US general government revenue / GNP, 1902);
  education 1.04% of covered value added (NCES school revenue / GDP); administration half
  the rest; treasury 3 months of revenue; debt ceiling 13.3% of covered value added (Wallis
  1902 debt / MeasuringWorth 1902 GDP). US: treasury 2.64 bn, education 1.40 bn and
  administration 4.57 bn a year, debt ceiling 17.9 bn.
- **US occupations (A7).** Census 1900 groups give 21.8 M peasants, 39.9 M laborers,
  10.9 M clerks, 2.6 M academics and 0.76 M capitalists (1%, provisional) in the home
  territory (P2: 25.3 M, 31.6 M, 16.2 M, 3.5 M, 8.1 M).
- **Money coefficients.** Soldier pay 18.79 RUSD a day (a US laborer's wage), recruitment
  564, equipment 28,581 per unit of 50 soldiers, upkeep 7.83 a day, garrison 0.34 a day
  (subsistence basket), administration benchmark 59.81 per inhabitant (US adequacy 1),
  education and training benchmarks 5,104 per staff member, each scaled by the country's
  local wage of the staffing profession.
- **D-136.** Sellable supply = opening stock + same-day output - funded input demand
  (differs from the approved wording, §7); opening stock = one day of input demand; tolerances relative to gross postings and
  cumulative reservations; trade cap checked per lot; enterprise-support bound 1e15.

## 4. Commands and results

| Command | Result |
|---|---|
| `pnpm test` (full, final) | 1,325 passed, 2 failed of 1,327 (108 of 109 suites): the two pre-existing `m11-flags` tests (stale flag provenance outputs, also failing on `main` per the P2 report) |
| `pnpm typecheck` | passed (all six packages) |
| `pnpm lint`, `audit:branding`, `audit:monetary`, `check:sim-deps` | passed; 0 cycles |
| `node scripts/p2b/build-money-calibration.mjs --check` | P2b calibration is current |
| `node scripts/p2/build-province-scenario.mjs --check` | Province scenario is current |
| `scenario:build:check`, `build:worker:check` | current |
| `pnpm map:atlas:check` | **stale** (`atlas-v1.html`); its inputs (map data, fonts, tokens, world catalog) are unchanged from `main`, so it was stale before this work (inferred, not re-run on `main`); not regenerated here |
| `p2b-money` (new, 18 tests) | passed: source table integrity, CPI factor, MPD benchmarks, recomputed prices and reference wages, traces of every province, country, market, building and coefficient value, builder `--check`, scenario wiring, all 66 selectable countries initialise, province wages paid, a week of the 1900 world with balanced goods holding their price (D-136 regression), schema-29 round trip, technique scales capacity, inherited technique, local wage index, M5 sample unchanged |
| Re-pinned known answers (with reasons in the tests) | `batch5-validation` (schema 29 + D-136), `determinism` and `m3a-serialization` and `m2-calibration` x2 (encoding only), `m14-rusd` 1900 world (P2b values); `m13-branding` and `p2-provinces` schema expectations |
| `node packages/bench/dist/p1WorldBench.js 62` | phase reproduces staged: PASS (§6) |
| `node packages/bench/dist/p2bCalibrationProbe.js 31` before (`main`) and after | §5; outputs in `docs/p2b/` |
| Browser check, Expo web at 844 x 390 | new campaign as the United States: treasury 2.64 bn RUSD, three days advanced, Economy and Markets panels show the sourced prices (grain 0.356, cattle 1.638, cotton 3.54 RUSD/kg); no console errors |
| Earlier full run (before the last fixes) | 17 suites failed: the fixture type error, the hash pins, the worker bundle, and `m5-feasibility` (40% of the M5 sample short of subsistence), which led to the D-136 correction |

## 5. Before/after report (31 days from 1 January 1900, seed 20,261,023)

Generated by `node scripts/p2b/report-before-after.mjs before.json after.json` from two
runs of `p2bCalibrationProbe.js 31`: "before" on `main` (82cbfd9), "after" on this branch.
Value added is producer sales less input purchases (cash basis), so it counts what was sold.
"Covered/head solved" is the builder's target for the represented sectors.

Runs: before 31 days, after 31 days, seed 20261023. Money in RUSD per year; per-head values over each simulation country's whole population (colonies included).

World value added per head: before 14.2, after 160; wage obligations paid: before 77%, after 100%; world treasuries at the start: before 7.1 M, after 9.4 bn.

### GDP per head and wages

| Country | GDP/head source | covered/head solved | VA/head before | VA/head after | laborer source (home) | before | after | peasant source (home) | before | after | wages paid before | after |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| CHN | 124 | 98.9 | 14.8 | 35.0 | 182 | 4.9 | 182 | 91.1 | 56.6 | 91.1 | 81% | 100% |
| GBR | 527 | 136 | 12.8 | 83.4 | 5194 | 51.4 | 3611 | 2597 | 60.0 | 181 | 92% | 100% |
| RUS | 154 | 114 | 14.8 | 42.5 | 207 | 42.4 | 215 | 104 | 60.0 | 123 | 65% | 99% |
| USA | 3945 | 1598 | 14.9 | 900 | 6860 | 42.4 | 6612 | 3430 | 60.0 | 2614 | 62% | 100% |
| FRA | 929 | 391 | 15.0 | 236 | 2491 | 45.0 | 2027 | 1245 | 60.0 | 372 | 73% | 100% |
| DEU | 1540 | 789 | 14.9 | 446 | 2652 | 42.4 | 2646 | 1326 | 60.0 | 844 | 64% | 100% |
| AUT | 997 | 717 | 14.9 | 371 | 1463 | 44.3 | 1463 | 732 | 60.0 | 732 | 61% | 100% |
| NLD | 382 | 133 | 13.4 | 81.0 | 3187 | 78.1 | 3153 | 1594 | 60.0 | 171 | 95% | 100% |
| JPN | 408 | 377 | 14.9 | 243 | 624 | 44.1 | 611 | 312 | 60.0 | 283 | 62% | 100% |
| OTT | 247 | 173 | 15.0 | 42.4 | 363 | 15.2 | 363 | 181 | 57.9 | 181 | 87% | 100% |
| ITA | 940 | 685 | 14.9 | 401 | 1405 | 44.7 | 1405 | 702 | 60.0 | 673 | 62% | 100% |
| ESP | 678 | 607 | 17.7 | 57.6 | 1003 | 72.5 | 988 | 501 | 60.0 | 491 | 77% | 99% |
| BRA | 104 | 50.4 | 12.0 | 34.0 | 152 | 127 | 152 | 76.2 | 60.0 | 73.4 | 100% | 50% |
| KOR | 150 | 51.2 | 12.0 | 31.3 | 220 | 52.6 | 220 | 110 | 60.0 | 110 | 100% | 100% |
| BEL | 1208 | 467 | 16.9 | 243 | 3863 | 78.2 | 3863 | 1931 | 60.0 | 434 | 84% | 100% |
| MEX | 358 | 131 | 12.0 | 40.0 | 526 | 127 | 526 | 263 | 60.0 | 263 | 100% | 100% |
| PRT | 274 | 209 | 17.3 | 58.5 | 655 | 94.0 | 626 | 327 | 60.0 | 162 | 90% | 100% |
| ETH | 147 | 99.6 | 15.4 | 36.4 | 216 | - | - | 108 | 58.1 | 108 | 97% | 100% |
| SOK | 147 | 50.8 | 12.0 | 35.2 | 216 | - | - | 108 | 60.0 | 108 | 100% | 100% |
| PER | 247 | 197 | 14.9 | 35.8 | 363 | - | - | 181 | 58.4 | 181 | 97% | 100% |
| THA | 130 | 50.4 | 12.0 | 33.7 | 190 | 127 | 190 | 95.2 | 60.0 | 95.2 | 100% | 100% |
| ROM | 232 | 60.8 | 12.0 | 32.2 | 340 | 127 | 340 | 170 | 60.0 | 170 | 100% | 100% |
| CAN | 1732 | 955 | 18.2 | 593 | 2542 | 75.6 | 2542 | 1271 | 60.0 | 1271 | 74% | 100% |
| SWE | 985 | 715 | 18.5 | 417 | 1446 | 82.5 | 1446 | 723 | 60.0 | 723 | 76% | 100% |
| NPL | 121 | 50.5 | 12.0 | 31.7 | 177 | - | - | 88.4 | 60.0 | 88.4 | 100% | 100% |
| MAR | 247 | 113 | 12.0 | 39.6 | 363 | - | - | 181 | 60.0 | 181 | 100% | 100% |
| ARG | 1697 | 948 | 14.8 | 553 | 2490 | 52.3 | 2490 | 1245 | 60.0 | 1245 | 63% | 100% |
| AFG | 121 | 50.5 | 12.0 | 31.9 | 177 | - | - | 88.4 | 60.0 | 88.4 | 100% | 100% |
| COL | 150 | 51.2 | 12.0 | 31.7 | 221 | 127 | 221 | 110 | 60.0 | 110 | 100% | 100% |
| AUS | 4997 | 1994 | 15.0 | 1233 | 7333 | 39.2 | 7333 | 3667 | 60.0 | 3667 | 60% | 100% |
| BGR | 209 | 58.0 | 12.0 | 31.9 | 306 | 127 | 301 | 153 | 60.0 | 153 | 100% | 100% |
| PRU | 149 | 50.8 | 12.0 | 31.2 | 219 | 127 | 206 | 110 | 60.0 | 110 | 100% | 100% |
| CHE | 3147 | 1269 | 14.9 | 730 | 4619 | 46.5 | 4619 | 2309 | 60.0 | 2309 | 60% | 100% |
| CHL | 1018 | 722 | 16.9 | 56.5 | 1494 | 49.7 | 1494 | 747 | 60.0 | 747 | 69% | 100% |
| DNK | 1764 | 916 | 16.7 | 549 | 2700 | 72.6 | 2643 | 1350 | 60.0 | 1225 | 76% | 100% |
| SRB | 209 | 58.0 | 12.0 | 33.3 | 306 | 127 | 306 | 153 | 60.0 | 153 | 100% | 100% |
| GRC | 409 | 420 | 12.0 | 33.5 | 601 | 127 | 601 | 300 | 60.0 | 300 | 100% | 100% |
| VEN | 366 | 132 | 12.0 | 38.2 | 537 | 127 | 537 | 269 | 60.0 | 269 | 100% | 100% |
| NOR | 950 | 706 | 14.6 | 420 | 1394 | 67.8 | 1394 | 697 | 60.0 | 697 | 72% | 100% |
| BOL | 247 | 114 | 12.0 | 38.3 | 363 | 127 | 363 | 181 | 60.0 | 181 | 100% | 100% |
| CUB | 323 | 127 | 12.0 | 40.2 | 474 | 127 | 474 | 237 | 60.0 | 237 | 100% | 100% |
| HTI | 114 | 51.1 | 12.0 | 34.4 | 168 | 127 | 168 | 84.0 | 60.0 | 84.0 | 100% | 100% |
| GUA | 150 | 51.9 | 12.0 | 32.6 | 221 | 127 | 221 | 110 | 60.0 | 110 | 100% | 100% |
| ECU | 153 | 52.4 | 12.0 | 32.1 | 224 | 127 | 224 | 112 | 60.0 | 112 | 100% | 100% |
| ZAR | 256 | 202 | 26.2 | 38.1 | 376 | 130 | 376 | 188 | 60.0 | 188 | 100% | 100% |
| WAD | 147 | 52.0 | 12.0 | 33.1 | 216 | - | - | 108 | 60.0 | 108 | 100% | 100% |
| SHM | 247 | 116 | 12.0 | 35.4 | 363 | - | - | 181 | 60.0 | 181 | 100% | 100% |
| SAL | 150 | 52.8 | 12.0 | 31.3 | 221 | 127 | 215 | 110 | 60.0 | 110 | 100% | 100% |
| URY | 1019 | 731 | 31.9 | 345 | 1495 | 107 | 1495 | 748 | 60.0 | 748 | 89% | 100% |
| NZL | 3342 | 1285 | 39.8 | 484 | 4904 | 104 | 4904 | 2452 | 60.0 | 2452 | 87% | 100% |
| LBR | 230 | 64.6 | 12.0 | 38.7 | 338 | 52.7 | 338 | 169 | 60.0 | 169 | 100% | 100% |
| PRY | 247 | 116 | 12.0 | 39.2 | 363 | 127 | 363 | 181 | 60.0 | 181 | 100% | 100% |
| DOM | 114 | 53.0 | 12.0 | 34.8 | 168 | 127 | 164 | 84.0 | 60.0 | 84.0 | 100% | 100% |
| DAR | 147 | 52.8 | 12.0 | 33.8 | 216 | - | - | 108 | 60.0 | 108 | 100% | 100% |
| OMN | 247 | 115 | 12.0 | 35.6 | 363 | - | - | 181 | 60.0 | 181 | 100% | 100% |
| HON | 150 | 54.6 | 12.0 | 32.1 | 221 | 127 | 215 | 110 | 60.0 | 110 | 100% | 100% |
| NIC | 150 | 55.4 | 12.0 | 31.2 | 221 | 127 | 216 | 110 | 60.0 | 110 | 100% | 100% |
| MNT | 209 | 63.5 | 12.0 | 42.8 | 306 | 127 | 306 | 153 | 60.0 | 153 | 100% | 100% |
| ORF | 256 | 120 | 12.0 | 40.4 | 376 | 52.7 | 376 | 188 | 60.0 | 188 | 100% | 100% |
| COS | 150 | 56.6 | 12.0 | 33.2 | 221 | 127 | 216 | 110 | 60.0 | 110 | 100% | 100% |
| CRT | 409 | 436 | 12.0 | 54.3 | 601 | 127 | 601 | 300 | 60.0 | 300 | 100% | 100% |
| LUX | 2632 | 1044 | 31.3 | 632 | 3863 | 110 | 3863 | 1931 | 60.0 | 1931 | 76% | 100% |
| TON | 130 | 186 | 42.1 | 97.9 | 190 | 130 | 190 | 95.2 | 60.0 | 95.2 | 100% | 100% |
| MCO | 1697 | 7559 | 40.7 | 2316 | 2491 | 130 | 2491 | 1245 | 60.0 | 1245 | 100% | 100% |
| SMR | 957 | 274 | 33.6 | 201 | 1405 | - | - | 702 | 60.0 | 702 | 100% | 100% |
| LIE | 1703 | 3808 | 28.5 | 779 | 2500 | 130 | 2500 | 1250 | 60.0 | 1250 | 100% | 100% |
| AND | 683 | 2088 | 12.0 | 109 | 1003 | - | 1003 | 501 | 60.0 | 501 | 100% | 100% |

### Fiscal stocks and flows

| Country | revenue source (7.8% of GDP) | of covered VA | income tax before | after | treasury before | after |
|---|---|---|---|---|---|---|
| CHN | 3.9 bn | 3.1 bn | 75.1 M | 434.4 M | 1.6 M | 773.9 M |
| GBR | 15.6 bn | 4.0 bn | 73.5 M | 412.8 M | 1.5 M | 1.0 bn |
| RUS | 1.7 bn | 1.2 bn | 40.1 M | 197.1 M | 555200 | 308.8 M |
| USA | 26.1 bn | 10.6 bn | 30.1 M | 2.2 bn | 338648 | 2.6 bn |
| FRA | 5.6 bn | 2.4 bn | 19.7 M | 287.8 M | 310600 | 591.5 M |
| DEU | 8.1 bn | 4.1 bn | 23.6 M | 752.4 M | 268668 | 1.0 bn |
| AUT | 4.0 bn | 2.9 bn | 16.2 M | 579.4 M | 204000 | 713.5 M |
| NLD | 1.4 bn | 490.1 M | 9.6 M | 50.8 M | 188920 | 122.5 M |
| JPN | 1.5 bn | 1.4 bn | 14.0 M | 228.1 M | 188412 | 346.0 M |
| OTT | 649.9 M | 454.5 M | 5.5 M | 56.3 M | 134800 | 113.6 M |
| ITA | 2.4 bn | 1.8 bn | 9.9 M | 334.9 M | 132700 | 442.9 M |
| ESP | 993.6 M | 890.1 M | 7.1 M | 136.5 M | 75200 | 222.5 M |
| BRA | 142.5 M | 69.2 M | 2.2 M | 8.8 M | 70400 | 17.3 M |
| KOR | 198.6 M | 67.9 M | 2.1 M | 10.1 M | 68000 | 17.0 M |
| BEL | 1.5 bn | 571.9 M | 4.3 M | 71.3 M | 62800 | 143.0 M |
| MEX | 380.0 M | 139.4 M | 1.8 M | 26.3 M | 54400 | 34.9 M |
| PRT | 285.3 M | 217.9 M | 3.9 M | 21.4 M | 51520 | 54.5 M |
| ETH | 126.4 M | 85.5 M | 2.1 M | 12.2 M | 44000 | 21.4 M |
| SOK | 114.9 M | 39.6 M | 1.2 M | 5.4 M | 40000 | 9.9 M |
| PER | 190.9 M | 152.2 M | 2.0 M | 18.3 M | 39600 | 38.1 M |
| THA | 73.9 M | 28.7 M | 947758 | 4.1 M | 29200 | 7.2 M |
| ROM | 108.4 M | 28.5 M | 767793 | 4.9 M | 25000 | 7.1 M |
| CAN | 699.9 M | 386.0 M | 1.9 M | 87.8 M | 25000 | 96.5 M |
| SWE | 391.9 M | 284.2 M | 2.0 M | 55.9 M | 25000 | 71.1 M |
| NPL | 47.0 M | 19.7 M | 630999 | 2.5 M | 25000 | 4.9 M |
| MAR | 96.4 M | 44.1 M | 649422 | 7.0 M | 25000 | 11.0 M |
| ARG | 622.0 M | 347.6 M | 1.4 M | 69.9 M | 25000 | 86.9 M |
| AFG | 42.3 M | 17.7 M | 606859 | 2.2 M | 25000 | 4.4 M |
| COL | 46.9 M | 16.0 M | 540441 | 2.4 M | 25000 | 4.0 M |
| AUS | 1.5 bn | 591.0 M | 1.0 M | 154.0 M | 25000 | 147.7 M |
| BGR | 60.3 M | 16.7 M | 441204 | 2.8 M | 25000 | 4.2 M |
| PRU | 43.1 M | 14.7 M | 431730 | 2.2 M | 25000 | 3.7 M |
| CHE | 810.1 M | 326.7 M | 1.1 M | 73.1 M | 25000 | 81.7 M |
| CHL | 238.3 M | 169.1 M | 932077 | 28.4 M | 25000 | 42.3 M |
| DNK | 349.1 M | 181.2 M | 1.0 M | 40.8 M | 25000 | 45.3 M |
| SRB | 40.7 M | 11.3 M | 325683 | 1.9 M | 25000 | 2.8 M |
| GRC | 76.6 M | 78.6 M | 335228 | 9.4 M | 25000 | 19.7 M |
| VEN | 68.6 M | 24.7 M | 314022 | 4.7 M | 25000 | 6.2 M |
| NOR | 163.0 M | 121.1 M | 734974 | 23.7 M | 25000 | 30.3 M |
| BOL | 34.7 M | 16.1 M | 236364 | 2.8 M | 25000 | 4.0 M |
| CUB | 40.3 M | 15.8 M | 220602 | 3.0 M | 25000 | 4.0 M |
| HTI | 13.4 M | 6.0 M | 208510 | 806211 | 25000 | 1.5 M |
| GUA | 16.4 M | 5.7 M | 213547 | 844084 | 25000 | 1.4 M |
| ECU | 16.7 M | 5.7 M | 214598 | 860366 | 25000 | 1.4 M |
| ZAR | 24.0 M | 18.9 M | 264971 | 2.8 M | 25000 | 4.7 M |
| WAD | 11.5 M | 4.1 M | 198193 | 547732 | 25000 | 1.0 M |
| SHM | 19.3 M | 9.0 M | 156050 | 1.4 M | 25000 | 2.3 M |
| SAL | 10.6 M | 3.7 M | 149618 | 558884 | 25000 | 927426 |
| URY | 71.5 M | 51.3 M | 557454 | 10.0 M | 25000 | 12.8 M |
| NZL | 208.5 M | 80.2 M | 527917 | 23.7 M | 25000 | 20.0 M |
| LBR | 10.8 M | 3.0 M | 120901 | 505559 | 25000 | 756362 |
| PRY | 11.6 M | 5.4 M | 127745 | 955477 | 25000 | 1.4 M |
| DOM | 5.4 M | 2.5 M | 121518 | 337975 | 25000 | 619721 |
| DAR | 6.9 M | 2.5 M | 133589 | 335750 | 25000 | 617992 |
| OMN | 9.6 M | 4.5 M | 127820 | 726535 | 25000 | 1.1 M |
| HON | 5.9 M | 2.1 M | 126429 | 320256 | 25000 | 531974 |
| NIC | 4.7 M | 1.7 M | 98279 | 260428 | 25000 | 432127 |
| MNT | 4.9 M | 1.5 M | 95946 | 250524 | 25000 | 371626 |
| ORF | 6.0 M | 2.8 M | 95444 | 496670 | 25000 | 703103 |
| COS | 3.5 M | 1.3 M | 97737 | 202424 | 25000 | 331093 |
| CRT | 9.6 M | 10.2 M | 96191 | 1.1 M | 25000 | 2.6 M |
| LUX | 49.3 M | 19.5 M | 191425 | 6.6 M | 25000 | 4.9 M |
| TON | 202375 | 289645 | 14673 | 45717 | 25000 | 72411 |
| MCO | 2.0 M | 8.8 M | 22143 | 514997 | 25000 | 2.2 M |
| SMR | 821366 | 235200 | 4653 | 55162 | 25000 | 58800 |
| LIE | 996522 | 2.2 M | 11058 | 327815 | 25000 | 556939 |
| AND | 266489 | 814207 | 2029 | 39234 | 25000 | 203552 |

Price drift after 15 days across the 63 markets (ratio to the opening price, median and
range): grain 0.80 (0.48-2.00), livestock 0.86 (0.46-1.29), fish 0.99 (0.46-1.05), cotton
1.32 (0.66-2.08), wool 0.80 (0.46-1.00), textiles 0.99 (0.46-1.98), garments 1.26 (0.79-2.08),
food products 1.04 (0.46-2.08).

## 6. Benchmark (Node diagnostic; device performance not evaluated)

Node v24.22.1, Windows x64, AMD Ryzen 5 2600 (12 threads), 7.93 GiB.
`node packages/bench/dist/p1WorldBench.js 62`: 5,687 blocks, 3,276 buildings, 63 markets,
111,645 accounts; 57 measured days after 5 warm-up per mode.

| Mode | mean ms/day | p50 | p95 | p99 |
|---|---|---|---|---|
| staged (whole-day clone) | 3,106 | 2,789 | 5,436 | 7,981 |
| **phase + rollback** | **2,069** | **1,869** | **3,912** | **6,889** |
| P2 (before, same machine), phase + rollback | 1,752 | 1,517 | 3,857 | 6,857 |

Phase mode reproduces staged mode: PASS (hash 2378849b1151277d). The p50 day is about 23%
slower: trade now runs (in-transit consignments reach the 512 cap) because prices are no
longer pinned at the floor. The opening-cash cap binds on 53 of 57 days.
Profile and proposed next steps (not implemented): `docs/P2B_CALIBRATION_PLAN.md` §8.

## 7. Assumptions, deviations, limitations and open items

- **Price rule deviates from the approved wording (D-136, for your review).** You approved
  "count opening stock only" on my description that everyone buys from the opening stock.
  The full suite showed households also buy the day's output (M3d Pass B): under "opening
  stock only" every final good read as a shortage, prices rose 5% a day and 40% of the M5
  sample went short of subsistence within a month. Implemented instead: opening stock plus
  same-day output less producers' funded input demand, which keeps balanced markets steady
  for both final and intermediate goods.
- **Measured value added is below the solved target** (US 900 vs 1,598 RUSD per head; China
  35 vs 99): prices drift (grain falls, garments rise on the cotton shortage), trade moves
  goods between markets whose price levels differ by up to 3.7x, and value added counts
  sales only. Brazil pays only 50% of its wage bill (its market sits at the price floor).
  Closing this gap needs the dynamic calibration of P15 or a revisit of A1.
- **Designer's basis A1 (exchange rate).** I recommended purchasing power; the exchange-rate
  basis is implemented as decided. Poor markets stay viable only because their opening
  prices are scaled by their price level; that is a purchasing-power adjustment of goods
  prices inside an exchange-rate money scale, and trade arbitrage will narrow the gaps.
- **Source coverage.** 39 of 137 rows are provisional (listed with reasons), notably the
  peasant/laborer wage ratio (USDA Bulletin 94 Table 12 could not be read from its scan),
  labour shares, capital per job, depreciation, the garment markup, woollen cloth, household
  and treasury cash months, route capacity share, warehouse size and the tier mixes. Eight
  rows are secondary (Census 1900 via the Scientific American Reference Book). MPD 2023 has
  1900 values for 38 of 134 territories; the other 96 use recorded proxies.
- **Conflicts reported, not resolved:** MPD 2023 vs earlier MPD relative levels; CPI vs MPD's
  deflator (+7% on the US anchor); MeasuringWorth production-worker pay ($0.14/h) vs BLS 991
  manufacturing ($0.23/h, 1901); the IMES Japan row is labelled 1896-1900; the UK series
  excludes the later Irish Free State; Australia's price level (1.44) is far above the fit.
- **Occupation mixes** outside the US remain the three-tier placeholder; the workforce cap
  hides part of that error (Japan x3.9, Germany x3.5, Spain x4.0 technique).
- **Covered sectors only.** Value added covers 21-94% of GDP per head by territory (US 40%,
  UK 27%, Japan 94%); capitalists, most clerks and academics have no covered jobs, and the
  income above the food and apparel budget accumulates as household cash (A4).
- **Retail budget.** The BLS budget is at retail prices, which the sim charges at the
  market price, so farm demand is overstated relative to 1900 farm-gate output.
- **Colonial customs territories** share one price level (British 0.31, India-weighted).
- **Joint products** do not balance: the US market is short of cotton (1.33 M kg/day supply
  vs 2.37 M demand) and long on wool; prices move accordingly.
- **Microstates** at the one-level minimum overproduce (Liechtenstein's covered value added is
  2.2x its GDP; Monaco's technique x17.6).
- **Freight** keeps the M11 rule (0.5% of price per 1,000 km), close to ocean rates and far
  below 1900 rail rates; P8 re-derives it by mode.
- **Not re-derived:** the minimum-wage law option in `politics.json` (no 1900 country
  enacts it; shared with the M5 sample) and the welfare budget (0: no 1900 national welfare
  transfers modelled).
- **Landlocked sea routes** (Afghanistan, Andorra, Switzerland, Wadai, Nepal, Serbia,
  Paraguay) found in the P2 route generator; not fixed here.
- **Device performance** is the designer's to measure.
