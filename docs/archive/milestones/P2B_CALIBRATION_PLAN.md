# P2b — Historical money and productivity calibration: inventory, sources and open decisions

Date: 2026-11-03. Base: `main` at `82cbfd9`. Status: **decided and implemented for
review.** The designer chose on 2026-11-03: A1 exchange-rate basis (not the recommended
purchasing-power basis), A2 covered sectors, A3 per-building technique, A4 surplus kept as
saving, A5 general government, A6 separate 1900 files, A7 census mix where it exists, A8
derived price level; and, for the price-rule defect found during implementation, to count
opening stock only (D-136). Decision records: D-135, D-136. Results: `P2B_COMPLETION_REPORT.md`. Stage definition: GDD §17J.3, D-130,
`docs/PROSPERITY_PROGRAM.md` §P2b.

## 1. What P2b must deliver

- Every authored monetary value re-derived from a cited 1900 source, converted to RUSD
  with the Minneapolis Fed CPI (1900 = 25, 1990 = 392.6; **15.704 RUSD per 1900 US
  dollar**), never by deflating the current placeholder values.
- A sourced per-country 1900 wage table by profession.
- Physical productivity recalibrated so value added matches the sourced wages and GDP
  per head.
- Coefficients without a historical counterpart marked provisional, with reasoning.
- Acceptance: a test traces every value to a source-table row and its conversion; the
  1900 world initialises for all selectable countries; a before/after report compares
  GDP per head, wages and fiscal stocks and flows with their sources.

## 2. Inventory of authored monetary values (1900 world)

| # | Value | File (authored → generated) | Count | Current value or rule | Read by |
|---|---|---|---|---|---|
| M1 | Goods base prices | `historical_goods.json` `basePrice1900RUSD` | 8 | grain 0.25, livestock 0.5, fish 0.5, cotton 0.15, wool 0.25, textiles 2.8, clothing 4 (per garment), food products 1 | market opening prices, price bounds, price index |
| M2 | Opening price multiplier | `m11/markets_1900.json` `initialPriceMultiplier` → `p2/markets_1900.json` | 63 | 0.25 everywhere (so grain opens at 0.0625 RUSD/kg) | market creation |
| M3 | Freight per unit per distance unit | `historical_goods.json` `transportCostPerUnit` | 8 | 0.5% of base price per 1,000 km, land and sea alike | trade dispatch |
| M4 | Wages | `historical_professions.json` `baseWage1900RUSDPerYear` | 5 | one world figure per profession: peasants 60, laborers 130, clerks 250, capitalists 600, academics 320 | settlement, construction labour cost |
| M5 | Construction cost | `historical_buildings.json` `constructionCostRUSD` | 12 | 500–10,000 per level | construction |
| M6 | Upkeep | `historical_buildings.json` `dailyUpkeepRUSDAtLevelOne` | 12 | 10–150 per level-day, paid to the system reserve | settlement |
| M7 | Physical productivity | `historical_buildings.json` outputs, inputs, jobs | 12 | e.g. subsistence farm 150,000 kg grain per 25,000 peasants per day (6 kg/worker-day), one world-wide technique | production |
| M8 | Household savings | `m11/pops_1900.json` `savingsPerCapitaRUSD` → `p2/pops_1900.json` | 361 → 5,687 | 3 / 8 / 20 per person by development tier | initial household cash |
| M9 | Operating cash | `m11/buildings_1900.json` `operatingCashRUSD` → `p2/buildings_1900.json` | 552 → 3,725 | 50,000–250,000 per territory building | initial building cash |
| M10 | Treasury cash | `m11/countries_1900.json` `initialTreasuryCashRUSD` | 67 | max(25,000, 0.004 × population) | initial treasury |
| M11 | Debt ceiling | `…` `debt.maxOutstandingPrincipalRUSD` | 67 | max(100,000, 0.02 × population) | deficit financing |
| M12 | Administration budget | `…` `politics.institutionFundingRUSDPerYear` | 67 | max(1,000, 0.0006 × population) | administration payroll |
| M13 | Education budget | `…` `technology.educationFundingRUSDPerYear` | 67 | tier × population (0.00008–0.00035 per person) | education payroll |
| M14 | Welfare budget | `…` `fiscal.welfareBudgetRUSDPerYear` | 67 | 0 | welfare |
| M15 | Income-tax rate | `…` `fiscal.incomeTaxRate` | 67 | 0.03 / 0.05 / 0.06 by tier (rate, not money; it sets the fiscal flow) | fiscal |
| M16 | Route capacity | `p2/trade_routes_1900.json` `baseCapacityRUSDPerDay` (builder formula) | 168 | clamp(30,000 + 250 × population/10⁶, 40,000, 300,000) | trade |
| M17 | Minimum-wage law option | `politics.json` `laborMinimumWageRUSDPerYear` | 3 options | 0 / 300 / 0 | labour law |
| M18 | RUSD constants | `packages/sim/src/economy/constants.ts` | 8 | soldier pay 0.05/day, recruitment 5, equipment 20 and 0.02/day, garrison 0.02/day, admin benchmark 0.002 per person-year, education benchmark 1 per staff-year, training instructor 1 per year | M10, M8, M9, E5 |
| M19 | Opening goods stock | `m11/markets_1900.json` `stockLots` | 160 | physical, but priced by M1/M2 | markets |

Shared definitions: `historical_goods.json`, `historical_buildings.json` and
`historical_professions.json` are also the definitions of the M5 eight-polity sample
(`scenarios/m5_eight_polities.json`), which has its own money values in `historical/*.json`.

## 3. Baseline: the current 1900 world measured (the "before" column)

Probe: `node packages/bench/dist/p2bCalibrationProbe.js 31 <out.json>` (new, committed),
31 days from 1 January 1900, seed 20,261,023, staged mode; flows annualised.

| Measure | Current world | Source value (1900) |
|---|---|---|
| World value added | 22.6 billion RUSD/yr, **14.2 RUSD per head** | world GDP per head about 2,265 (MPD 2023, 2011 $) |
| United States value added per head | **14.9 RUSD** | **4,375 RUSD**: MeasuringWorth nominal GDP $21,197 M ÷ 76,094,000 people = $278.56 × 15.704 |
| Spread across countries | 12.0–42.1 RUSD per head; 34 of 67 countries are at 12.0 | MPD 2023: United States/India 8.4×, United States/China 8.3× |
| Wages paid per worker-year | peasants 60, laborers 42–94, clerks 3–33 | United States nonfarm employees $483 (HSUS Ba4280–4282, reported) → 7,585 RUSD |
| Wage obligations met | 77% (11.1 of 14.4 billion/yr): buildings run out of operating cash | — |
| Treasuries | 7.1 M RUSD at start → 38.0 M after one month | United States federal receipts FY1900 about $567 M (D-130) → about 8.9 billion RUSD |
| Income tax collected | 364 M RUSD/yr world | — |
| Household cash | 10.2 billion RUSD (6.5 per person) | — |

The current values are internally consistent placeholders about 300 times below the
historical scale, with no country differentiation: every country runs the same
technique with the same wages, so value added per head is the same almost everywhere.

## 4. Sources examined so far

| Id | Source | Status | What it gives |
|---|---|---|---|
| S1 | Federal Reserve Bank of Minneapolis, *Consumer Price Index, 1800–* (1967 = 100) | **verified** 2026-11-03 | 1899–1901 = 25, 1990 = 392.6 → 15.704 |
| S2 | Johnston & Williamson, *What Was the U.S. GDP Then?*, MeasuringWorth | **verified** 2026-11-03 | 1900 nominal GDP $21,197 M; population 76,094,000 (1899 $20,119 M; 1901 $22,931 M) |
| S3 | Maddison Project Database 2023 (Bolt & van Zanden), via Our World in Data, CC BY 4.0 | **downloaded** 2026-11-03 | 1900 GDP per head in 2011 $ for 32 of the 67 sim countries (e.g. United States 8,038, United Kingdom 7,594, Germany 4,758, India 955, China 972) |
| S4 | *Historical Statistics of the United States, Millennial Edition*, Ba4280–4282 | reported by search, **not yet read** (subscription) | 1900 annual earnings: all employees $418, nonfarm $483 |
| S5 | Williamson (1995), *Explorations in Economic History* 32(2) | candidate | PPP-adjusted unskilled urban real wages, 17 countries |
| S6 | Allen (2001) and Allen et al. (2011) welfare-ratio databases | candidate | wages and subsistence-basket prices, Europe and Asia |
| S7 | *The Statesman's Year-Book* 1900/1901 (public domain) | candidate | revenue, expenditure and debt of every state in local money, gold parities |
| S8 | USDA *Yearbook* 1900; Warren & Pearson wholesale prices | candidate | US farm-gate and wholesale prices (wheat, maize, cotton, wool, cattle) |
| S9 | Federico & Tena, *World Trade Historical Database*; RICardo | candidate | trade by country and bilateral pairs, 1900 |
| S10 | Report of the US Commissioner of Education 1899–1900 | candidate | public school expenditure |

## 5. Conflicts found

1. **MPD 2023 vs the earlier MPD 2010 (1990 Geary–Khamis dollars).** The 2023 release
   uses multiple benchmarks; it puts the United States above the United Kingdom in 1900
   (8,038 vs 7,594, 2011 $), whereas the earlier series had the United Kingdom ahead.
   Relative levels within Asia also changed (MPD 2023: China 972 above India 955).
   Proposal: MPD 2023 for relative levels (current release, already the project's
   cross-check source), recorded with the conflict.
2. **Two ways to reach RUSD for the United States anchor.** S2 × S1 gives 4,375 RUSD per
   head; deflating MPD 2023's 8,038 (2011 $) to 1990 with the CPI gives about 4,670 RUSD
   (+7%), because MPD uses the GDP deflator and PPPs, not the CPI. Proposal: anchor to
   S2 × S1 as instructed, and use MPD 2023 only for each country's ratio to the United
   States.
3. **Wage scope.** S4's all-employee figure ($418) and nonfarm figure ($483) differ by
   the farm wage; professions must map to a defined series (peasants to farm income per
   worker, laborers to unskilled nonfarm, clerks to clerical salaries).
4. **Coverage gap.** MPD 2023 has 1900 values for 32 of the 67 countries; 35 (Ottoman
   Empire, Serbia, Romania under code ROU, Korea, Siam, Ethiopia, Morocco, Central
   America, the African states and others) need other sources or regional benchmarks.
5. **Empire aggregation.** The sim's United Kingdom is 380 M people including India, so
   calibration and the report must work per territory (home territory vs India), not per
   simulation country.

Data defects found on the way (P2, not money): seven landlocked customs territories have
generated **sea** routes — Afghanistan–Oman, Andorra (3), Switzerland–France and –Italy,
Wadai–Ottoman, Nepal–Russia, Serbia–Bulgaria and –Montenegro, Paraguay–Uruguay
(river navigation, arguably correct). The coast test probably counts lake or river shores.

## 6. Material ambiguities (decided 2026-11-03; see the status above)

**A1. Conversion basis outside the United States.** RUSD is defined as the purchasing
power of a 1990 US dollar (D-122). (a) *Purchasing power:* real quantities (GDP per head,
wages) come from PPP sources (MPD ratios, Williamson); local-money values from the
Statesman's Year-Book are converted at the gold or silver parity and then scaled by the
country's 1900 price level relative to the United States. (b) *Exchange rate:* every local
value converts at the 1900 parity and stops there; poor countries' wages and budgets fall
two to three times below option (a), and MPD becomes only a cross-check.
**Recommended: (a)**, because RUSD measures purchasing power and the sim's goods are
priced once per market. P3 must then display local money with the same price-level factor,
or rupee wages will show above their historical level.

**A2. What GDP per head the sim should reproduce.** The sim makes only food, fibres,
textiles and clothing; 1900 GDP also contains services, housing, mining, construction,
transport and government (US agriculture was roughly a fifth of GDP; the exact
share is still to be sourced). (a) Calibrate the
represented sectors to their sourced value added, and report GDP per head as covered vs
uncovered until P6 adds goods. (b) Scale the represented sectors up to the whole GDP, which
inflates food and cloth output per worker several times. **Recommended: (a).**

**A3. How countries differ in productivity.** Building definitions are global today, so a
peasant in Iowa and one in Bengal produce the same. (a) Each building instance carries a
technique factor (output per worker relative to the definition), authored per territory
from the sourced value added per worker, documented as unmodelled land, capital and
technique, and later replaced by P5 land and P10 investment. (b) Per-country definition
variants (traditional / improved / mechanised farm and so on). (c) One country scalar.
**Recommended: (a)**; (c) is closest to a gameplay pool under the No-Mana doctrine.

**A4. Household budget closure.** With sourced wages, households can buy only food and
clothing, about half of a 1900 worker budget (food about 43% in the 1901 US
cost-of-living survey, BLS 18th Annual Report; from memory, not yet re-read). The rest would pile up as cash. (a) Scale need quantities to the sourced food and
clothing spending, and park the rest of the budget as provisional, explicitly reported saving
until P6 adds housing, fuel and services. (b) Inflate food and clothing need quantities to
absorb the whole budget. **Recommended: (a)**, with a provisional rent payment to the
province's capitalist households only if you prefer to stop the cash build-up now.

**A5. Which government the treasury is.** US federal receipts were about $567 M in FY1900
(D-130), while states and localities ran the schools and much of the administration. The sim's country
treasury pays administration and education. (a) General government (central plus local)
for every country. (b) Central government only, with education then mostly unfunded in
federal states. **Recommended: (a)**, so education and administration budgets have their
real payers.

**A6. The M5 eight-polity sample** shares the goods, buildings and professions files.
(a) Give the 1900 world its own calibrated definition files and leave the M5 sample and
its known-answer hashes on the old scale. (b) Recalibrate both. **Recommended: (a)**.

**A7. Occupation mix.** The authored mix is a three-tier placeholder: the United States has
16 M clerks and 8 M capitalists among 84.7 M people, China 57.6 M clerks. Matching
GDP per head through productivity would hide that error. (a) Re-source the occupation
shares (US census 1900, OWID sector reconstructions) inside P2b. (b) Keep the mix, report
the distortion, fix it in P7. **Recommended: (a)** for the countries with census tables,
(b) elsewhere.

**A8. Countries without an MPD 2023 value (35).** Proposal: named country studies where
they exist (for example Pamuk for the Ottoman Empire), else MPD regional benchmarks, all
marked provisional with the reasoning.

## 7. Proposed method (after the decisions)

1. `packages/data/data/historical/p2b/sources_1900.json`: one row per source value (source
   id, table or page, year, unit, currency, local value) plus `conversions_1900.json`
   (parities, price levels, deflator), each row citing its source.
2. `scripts/p2b/build-money-calibration.mjs` (`--check`, checksummed like the P2 builder)
   computes every RUSD value from those rows and writes it with a trace field
   (`sourceRowIds`, `conversion`) into the territory tables, then the P2 builder runs.
3. Wages: new authored `wages_1900.json` (territory × profession); settlement reads the
   block's territory wage instead of the profession's world wage; fixed until P7 (D-130 §4).
4. Productivity (A3): technique factor per building from value added per worker.
5. Test `p2b-money-trace`: every money field in the generated tables equals its source
   row × its conversion within 1e-9 relative; every coefficient in the constants module
   has `status` and a source or a provisional reason.
6. Report `P2B_CALIBRATION_REPORT.md` from the probe: before, after and source per country.
7. Re-pin the 1900-world hashes with the reason "P2b calibration (D-135)".

## 8. Province-scale performance: profile and proposal (not implemented)

Measured 2026-11-03 (Node v24.22.1, Windows x64, Ryzen 5 2600, `p2bPerfProfile.js`,
phase mode with rollback, after two warm-up days). World: 5,687 blocks, 3,725 buildings,
10,171 employment rows, 116,584 accounts (73,931 household, 40,975 building, 1,474
country, 204 system).

| Item | Measured |
|---|---|
| Phase-mode day (12 days) | 1,439–1,719 ms, median about 1,510 ms |
| `hashWorld` | 2,472 ms = `encodeWorld` about 690 + `legacyMonetaryView` about 800 + `stableStringify` 862 + FNV 118 |
| `serializeWorld` | 2,901 ms: the payload is canonicalised twice (checksum and envelope) |
| `assertValidWorld` | about 1,000 ms (runs inside `encodeWorld`) |
| `cloneWorld` (checkpoint) | 542 ms |
| Canonical save JSON | 26.2 M characters; finance 14.3 M (55%), population blocks 9.1 M |
| Save, gzip level 1 / 6 | 23.7 MB → 2.25 MB in 105 ms / 1.78 MB in 277 ms |
| Worker bundle | 9.61 MB = the same 4.80 MB script twice (`SIM_WORKER_SCRIPT` and inside `SIM_WORKER_HTML`); 1.79 MB gzipped |
| Day profile, self time | GC 12.5%; trade `exportableLots` 6.5%; uncached finance-index rebuilds 4.8%; capacity index 3.9%; market-input validation 3.4%; education derivation 3.3% |
| Day profile, inclusive | market attempt 47% of the day; settlement 19%; production 8%; education 6% |

Proposed steps, in order of value per effort:

1. **Bundle halving (bit-identical, small).** Build the WebView HTML at runtime from the
   one script string instead of embedding the script twice: 9.6 → 4.8 MB.
2. **Canonical encoding without waste (hash-identical).** `stableStringify` builds a path
   string for every node only for error messages; build paths lazily on failure. Replace
   the recursive `legacyMonetaryView` copy with a key-translation table applied while
   encoding. Canonicalise the save payload once and reuse it for checksum and envelope.
   Skip the second full validation when the caller just validated. Expected: `hashWorld`
   2.5 → about 0.9 s, `serializeWorld` 2.9 → about 1.1 s; all known-answer hashes unchanged.
3. **Trade and finance indexing (bit-identical).** Index remaining lots by (market, good)
   once per trade phase instead of scanning every lot for every route, direction and good
   (about 115 ms/day → a few ms); key the finance-index cache on an account-structure
   version rather than array identity so clones reuse it (about 90 ms/day).
4. **Compressed saves (dependency).** Deflate the canonical save (23.7 → about 2 MB; about
   0.1 s). Hermes has no built-in zlib, so this needs a pure-JS deflate such as `fflate`
   (MIT, no native code, same on web, iOS and Android). Save format version bump, older
   saves still readable.
5. **Accounts as columns (schema change).** Store the 116,584 accounts as typed columns
   (owner kind, owner id, subtype, balance) with the immutable structure shared by clones;
   encode them as columns in saves. Expected: finance 14.3 M characters → about 3 M, faster
   checkpoints and less GC. Schema 29 and a save break; hashes change by encoding only.
6. **Market attempt (47% of the day).** Needs a finer profile first: per-attempt capacity
   index rebuild, full revalidation of market inputs, household demand and needs objects
   per block per day. Target the allocations (GC is 12.5%).

Device performance remains the designer's to measure.
